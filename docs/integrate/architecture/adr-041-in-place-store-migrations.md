# ADR 041: 就地存储迁移

## 变更日志

* 2021年2月17日：初稿

## 状态

已接受

## 摘要

本ADR引入了一种机制，用于在链软件升级期间执行就地状态存储迁移。

## 背景

当链升级引入模块内部的破坏性状态更改时，当前的流程包括将整个状态导出为JSON文件（通过`simd export`命令），在JSON文件上运行迁移脚本（`simd genesis migrate`命令），清除存储（`simd unsafe-reset-all`命令），并使用迁移后的JSON文件作为新的创世区块（可选择使用自定义的初始区块高度）启动新链。可以在[宇宙中心3->4迁移指南](https://github.com/cosmos/gaia/blob/v4.0.3/docs/migration/cosmoshub-3.md#upgrade-procedure)中看到此类流程的示例。

这个流程有多个不便之处：

* 这个流程需要时间。运行`export`命令可能需要几个小时，然后在使用迁移后的JSON启动新链时可能需要额外几个小时来运行`InitChain`。
* 导出的JSON文件可能很大（约100MB-1GB），使得查看、编辑和传输变得困难，进而需要额外的工作来解决这些问题（例如[流式创世区块](https://github.com/cosmos/cosmos-sdk/issues/6936)）。

## 决策

我们提出了一种基于就地修改KV存储的迁移流程，而不涉及上述描述的JSON导出-处理-导入流程。

### 模块 `ConsensusVersion`

我们在 `AppModule` 接口上引入了一个新方法：

```go
type AppModule interface {
    // --snip--
    ConsensusVersion() uint64
}
```

该方法返回一个 `uint64`，用作模块的破坏性状态版本。每次模块引入破坏性更改时，必须将其递增。为避免默认值可能引发的错误，模块的初始版本必须设置为1。在Cosmos SDK中，版本1对应于v0.41系列中的模块。

### 模块特定的迁移函数

对于模块引入的每个破坏性更改，必须使用其新增的 `RegisterMigration` 方法在 `Configurator` 中注册从 ConsensusVersion `N` 到版本 `N+1` 的迁移脚本。所有模块在其 `AppModule` 的 `RegisterServices` 方法中都会收到对配置器的引用，这就是迁移函数应该注册的地方。迁移函数应按递增顺序注册。

```go
func (am AppModule) RegisterServices(cfg module.Configurator) {
    // --snip--
    cfg.RegisterMigration(types.ModuleName, 1, func(ctx sdk.Context) error {
        // Perform in-place store migrations from ConsensusVersion 1 to 2.
    })
     cfg.RegisterMigration(types.ModuleName, 2, func(ctx sdk.Context) error {
        // Perform in-place store migrations from ConsensusVersion 2 to 3.
    })
    // etc.
}
```

例如，如果一个模块的新的ConsensusVersion是`N`，那么在配置器中必须注册`N-1`个迁移函数。

在Cosmos SDK中，迁移函数由每个模块的keeper处理，因为keeper持有用于执行原地存储迁移的`sdk.StoreKey`。为了不过载keeper，每个模块都使用`Migrator`包装器来处理迁移函数：

```go
// Migrator is a struct for handling in-place store migrations.
type Migrator struct {
  BaseKeeper
}
```

迁移函数应该位于每个模块的`migrations/`文件夹中，并由Migrator的方法调用。我们建议使用`Migrate{M}to{N}`的格式作为方法名。

```go
// Migrate1to2 migrates from version 1 to 2.
func (m Migrator) Migrate1to2(ctx sdk.Context) error {
	return v2bank.MigrateStore(ctx, m.keeper.storeKey) // v043bank is package `x/bank/migrations/v2`.
}
```

每个模块的迁移函数特定于模块的存储演进，并且不在本ADR中描述。在引入ADR-028长度前缀地址后，可以在此[store.go代码](https://github.com/cosmos/cosmos-sdk/blob/36f68eb9e041e20a5bb47e216ac5eb8b91f95471/x/bank/legacy/v043/store.go#L41-L62)中查看x/bank存储键迁移的示例。

### 在`x/upgrade`中跟踪模块版本

我们在`x/upgrade`的存储中引入了一个新的前缀存储。该存储将跟踪每个模块的当前版本，可以将其建模为一个`map[string]uint64`，其中键是模块名称，值是模块的ConsensusVersion，并且在运行迁移时将使用它（有关详细信息，请参见下一节）。使用的键前缀是`0x1`，键/值格式如下：

```text
0x2 | {bytes(module_name)} => BigEndian(module_consensus_version)
```

存储的初始状态是从`app.go`的`InitChainer`方法设置的。

UpgradeHandler的签名需要更新为接受一个`VersionMap`，并返回一个升级后的`VersionMap`和一个错误：

```diff
- type UpgradeHandler func(ctx sdk.Context, plan Plan)
+ type UpgradeHandler func(ctx sdk.Context, plan Plan, versionMap VersionMap) (VersionMap, error)
```

要应用升级，我们从`x/upgrade`存储中查询`VersionMap`并将其传递给处理程序。处理程序运行实际的迁移函数（请参见下一节），如果成功，则返回一个更新后的`VersionMap`以存储在状态中。

```diff
func (k UpgradeKeeper) ApplyUpgrade(ctx sdk.Context, plan types.Plan) {
    // --snip--
-   handler(ctx, plan)
+   updatedVM, err := handler(ctx, plan, k.GetModuleVersionMap(ctx)) // k.GetModuleVersionMap() fetches the VersionMap stored in state.
+   if err != nil {
+       return err
+   }
+
+   // Set the updated consensus versions to state
+   k.SetModuleVersionMap(ctx, updatedVM)
}
```

一个用于查询存储在 `x/upgrade` 模块状态中的 `VersionMap` 的 gRPC 查询端点也将被添加，以便应用程序开发人员可以在升级处理程序运行之前双重检查 `VersionMap`。

### 运行迁移

一旦所有迁移处理程序在配置器中注册（在启动时发生），可以通过在 `module.Manager` 上调用 `RunMigrations` 方法来运行迁移。该函数将遍历所有模块，并对于每个模块：

* 从其 `VersionMap` 参数中获取模块的旧的 ConsensusVersion（我们称之为 `M`）。
* 从 `AppModule` 的 `ConsensusVersion()` 方法中获取模块的新的 ConsensusVersion（称之为 `N`）。
* 如果 `N>M`，则按顺序运行模块的所有注册迁移 `M -> M+1 -> M+2...`，直到 `N`。
    * 有一种特殊情况，即模块没有 ConsensusVersion，这意味着该模块在升级期间被新添加。在这种情况下，不运行迁移函数，并将模块的当前 ConsensusVersion 保存到 `x/upgrade` 的存储中。

如果缺少所需的迁移（例如，未在 `Configurator` 中注册），则 `RunMigrations` 函数将报错。

在实践中，应该从 `UpgradeHandler` 内部调用 `RunMigrations` 方法。

```go
app.UpgradeKeeper.SetUpgradeHandler("my-plan", func(ctx sdk.Context, plan upgradetypes.Plan, vm module.VersionMap)  (module.VersionMap, error) {
    return app.mm.RunMigrations(ctx, vm)
})
```

假设链在块 `n` 进行升级，该过程应按以下方式运行：

* 旧二进制文件在启动块 `N` 时在 `BeginBlock` 中停止。在其存储中，存储了旧二进制文件模块的 ConsensusVersions。
* 新二进制文件将从块 `N` 开始。升级处理程序在新二进制文件中设置，因此将在新二进制文件的 `BeginBlock` 中运行。在 `x/upgrade` 的 `ApplyUpgrade` 中，将从（旧二进制文件的）存储中检索 `VersionMap`，并将其传递给 `RunMigrations` 函数，在模块自身的 `BeginBlock` 之前原地迁移所有模块存储。

## 结果

### 向后兼容性

此 ADR 引入了 `AppModule` 上的新方法 `ConsensusVersion()`，所有模块都需要实现该方法。它还修改了 UpgradeHandler 函数的签名。因此，它不是向后兼容的。

虽然模块在升级 ConsensusVersions 时必须注册它们的迁移函数，但使用升级处理程序运行这些脚本是可选的。应用程序可以完全决定不在其升级处理程序中调用 `RunMigrations`，并继续使用传统的 JSON 迁移路径。

### 正面

* 在不操作 JSON 文件的情况下执行链升级。
* 尽管尚未进行基准测试，但原地存储迁移可能比 JSON 迁移所需的时间更少。支持这一说法的主要原因是旧二进制文件上的 `simd export` 命令和新二进制文件上的 `InitChain` 函数都将被跳过。

### 负面

* 模块开发人员必须正确跟踪其模块中的破坏共识的更改。如果在模块中引入了破坏共识的更改，但没有相应的 `ConsensusVersion()` 提升，则 `RunMigrations` 函数将无法检测到迁移，链升级可能会失败。文档应明确反映这一点。

### 中立

* Cosmos SDK 将继续通过现有的 `simd export` 和 `simd genesis migrate` 命令支持 JSON 迁移。
* 当前的 ADR 不允许创建、重命名或删除存储，只允许修改现有存储的键和值。Cosmos SDK 已经为这些操作提供了 `StoreLoader`。

## 进一步讨论

## 参考资料

* 初始讨论：https://github.com/cosmos/cosmos-sdk/discussions/8429
* `ConsensusVersion` 和 `RunMigrations` 的实现：https://github.com/cosmos/cosmos-sdk/pull/8485
* 讨论 `x/upgrade` 设计的问题：https://github.com/cosmos/cosmos-sdk/issues/8514


# ADR 041: In-Place Store Migrations

## Changelog

* 17.02.2021: Initial Draft

## Status

Accepted

## Abstract

This ADR introduces a mechanism to perform in-place state store migrations during chain software upgrades.

## Context

When a chain upgrade introduces state-breaking changes inside modules, the current procedure consists of exporting the whole state into a JSON file (via the `simd export` command), running migration scripts on the JSON file (`simd genesis migrate` command), clearing the stores (`simd unsafe-reset-all` command), and starting a new chain with the migrated JSON file as new genesis (optionally with a custom initial block height). An example of such a procedure can be seen [in the Cosmos Hub 3->4 migration guide](https://github.com/cosmos/gaia/blob/v4.0.3/docs/migration/cosmoshub-3.md#upgrade-procedure).

This procedure is cumbersome for multiple reasons:

* The procedure takes time. It can take hours to run the `export` command, plus some additional hours to run `InitChain` on the fresh chain using the migrated JSON.
* The exported JSON file can be heavy (~100MB-1GB), making it difficult to view, edit and transfer, which in turn introduces additional work to solve these problems (such as [streaming genesis](https://github.com/cosmos/cosmos-sdk/issues/6936)).

## Decision

We propose a migration procedure based on modifying the KV store in-place without involving the JSON export-process-import flow described above.

### Module `ConsensusVersion`

We introduce a new method on the `AppModule` interface:

```go
type AppModule interface {
    // --snip--
    ConsensusVersion() uint64
}
```

This methods returns an `uint64` which serves as state-breaking version of the module. It MUST be incremented on each consensus-breaking change introduced by the module. To avoid potential errors with default values, the initial version of a module MUST be set to 1. In the Cosmos SDK, version 1 corresponds to the modules in the v0.41 series.

### Module-Specific Migration Functions

For each consensus-breaking change introduced by the module, a migration script from ConsensusVersion `N` to version `N+1` MUST be registered in the `Configurator` using its newly-added `RegisterMigration` method. All modules receive a reference to the configurator in their `RegisterServices` method on `AppModule`, and this is where the migration functions should be registered. The migration functions should be registered in increasing order.

```go
func (am AppModule) RegisterServices(cfg module.Configurator) {
    // --snip--
    cfg.RegisterMigration(types.ModuleName, 1, func(ctx sdk.Context) error {
        // Perform in-place store migrations from ConsensusVersion 1 to 2.
    })
     cfg.RegisterMigration(types.ModuleName, 2, func(ctx sdk.Context) error {
        // Perform in-place store migrations from ConsensusVersion 2 to 3.
    })
    // etc.
}
```

For example, if the new ConsensusVersion of a module is `N` , then `N-1` migration functions MUST be registered in the configurator.

In the Cosmos SDK, the migration functions are handled by each module's keeper, because the keeper holds the `sdk.StoreKey` used to perform in-place store migrations. To not overload the keeper, a `Migrator` wrapper is used by each module to handle the migration functions:

```go
// Migrator is a struct for handling in-place store migrations.
type Migrator struct {
  BaseKeeper
}
```

Migration functions should live inside the `migrations/` folder of each module, and be called by the Migrator's methods. We propose the format `Migrate{M}to{N}` for method names.

```go
// Migrate1to2 migrates from version 1 to 2.
func (m Migrator) Migrate1to2(ctx sdk.Context) error {
	return v2bank.MigrateStore(ctx, m.keeper.storeKey) // v043bank is package `x/bank/migrations/v2`.
}
```

Each module's migration functions are specific to the module's store evolutions, and are not described in this ADR. An example of x/bank store key migrations after the introduction of ADR-028 length-prefixed addresses can be seen in this [store.go code](https://github.com/cosmos/cosmos-sdk/blob/36f68eb9e041e20a5bb47e216ac5eb8b91f95471/x/bank/legacy/v043/store.go#L41-L62).

### Tracking Module Versions in `x/upgrade`

We introduce a new prefix store in `x/upgrade`'s store. This store will track each module's current version, it can be modelized as a `map[string]uint64` of module name to module ConsensusVersion, and will be used when running the migrations (see next section for details). The key prefix used is `0x1`, and the key/value format is:

```text
0x2 | {bytes(module_name)} => BigEndian(module_consensus_version)
```

The initial state of the store is set from `app.go`'s `InitChainer` method.

The UpgradeHandler signature needs to be updated to take a `VersionMap`, as well as return an upgraded `VersionMap` and an error:

```diff
- type UpgradeHandler func(ctx sdk.Context, plan Plan)
+ type UpgradeHandler func(ctx sdk.Context, plan Plan, versionMap VersionMap) (VersionMap, error)
```

To apply an upgrade, we query the `VersionMap` from the `x/upgrade` store and pass it into the handler. The handler runs the actual migration functions (see next section), and if successful, returns an updated `VersionMap` to be stored in state.

```diff
func (k UpgradeKeeper) ApplyUpgrade(ctx sdk.Context, plan types.Plan) {
    // --snip--
-   handler(ctx, plan)
+   updatedVM, err := handler(ctx, plan, k.GetModuleVersionMap(ctx)) // k.GetModuleVersionMap() fetches the VersionMap stored in state.
+   if err != nil {
+       return err
+   }
+
+   // Set the updated consensus versions to state
+   k.SetModuleVersionMap(ctx, updatedVM)
}
```

A gRPC query endpoint to query the `VersionMap` stored in `x/upgrade`'s state will also be added, so that app developers can double-check the `VersionMap` before the upgrade handler runs.

### Running Migrations

Once all the migration handlers are registered inside the configurator (which happens at startup), running migrations can happen by calling the `RunMigrations` method on `module.Manager`. This function will loop through all modules, and for each module:

* Get the old ConsensusVersion of the module from its `VersionMap` argument (let's call it `M`).
* Fetch the new ConsensusVersion of the module from the `ConsensusVersion()` method on `AppModule` (call it `N`).
* If `N>M`, run all registered migrations for the module sequentially `M -> M+1 -> M+2...` until `N`.
    * There is a special case where there is no ConsensusVersion for the module, as this means that the module has been newly added during the upgrade. In this case, no migration function is run, and the module's current ConsensusVersion is saved to `x/upgrade`'s store.

If a required migration is missing (e.g. if it has not been registered in the `Configurator`), then the `RunMigrations` function will error.

In practice, the `RunMigrations` method should be called from inside an `UpgradeHandler`.

```go
app.UpgradeKeeper.SetUpgradeHandler("my-plan", func(ctx sdk.Context, plan upgradetypes.Plan, vm module.VersionMap)  (module.VersionMap, error) {
    return app.mm.RunMigrations(ctx, vm)
})
```

Assuming a chain upgrades at block `n`, the procedure should run as follows:

* the old binary will halt in `BeginBlock` when starting block `N`. In its store, the ConsensusVersions of the old binary's modules are stored.
* the new binary will start at block `N`. The UpgradeHandler is set in the new binary, so will run at `BeginBlock` of the new binary. Inside `x/upgrade`'s `ApplyUpgrade`, the `VersionMap` will be retrieved from the (old binary's) store, and passed into the `RunMigrations` functon, migrating all module stores in-place before the modules' own `BeginBlock`s.

## Consequences

### Backwards Compatibility

This ADR introduces a new method `ConsensusVersion()` on `AppModule`, which all modules need to implement. It also alters the UpgradeHandler function signature. As such, it is not backwards-compatible.

While modules MUST register their migration functions when bumping ConsensusVersions, running those scripts using an upgrade handler is optional. An application may perfectly well decide to not call the `RunMigrations` inside its upgrade handler, and continue using the legacy JSON migration path.

### Positive

* Perform chain upgrades without manipulating JSON files.
* While no benchmark has been made yet, it is probable that in-place store migrations will take less time than JSON migrations. The main reason supporting this claim is that both the `simd export` command on the old binary and the `InitChain` function on the new binary will be skipped.

### Negative

* Module developers MUST correctly track consensus-breaking changes in their modules. If a consensus-breaking change is introduced in a module without its corresponding `ConsensusVersion()` bump, then the `RunMigrations` function won't detect the migration, and the chain upgrade might be unsuccessful. Documentation should clearly reflect this.

### Neutral

* The Cosmos SDK will continue to support JSON migrations via the existing `simd export` and `simd genesis migrate` commands.
* The current ADR does not allow creating, renaming or deleting stores, only modifying existing store keys and values. The Cosmos SDK already has the `StoreLoader` for those operations.

## Further Discussions

## References

* Initial discussion: https://github.com/cosmos/cosmos-sdk/discussions/8429
* Implementation of `ConsensusVersion` and `RunMigrations`: https://github.com/cosmos/cosmos-sdk/pull/8485
* Issue discussing `x/upgrade` design: https://github.com/cosmos/cosmos-sdk/issues/8514
