# 原地存储迁移

:::warning
在对实时链进行迁移之前，请阅读并理解所有原地存储迁移文档。
:::

:::note 概要
使用自定义的原地存储迁移逻辑平滑升级应用模块。
:::

Cosmos SDK使用两种方法进行升级：

* 使用`export` CLI命令将整个应用程序状态导出为JSON文件，进行更改，然后使用更改后的JSON文件作为创世文件启动新的二进制文件。

* 进行原地升级，这将显著减少具有较大状态的链的升级时间。使用[模块升级指南](../../integrate/building-modules/13-upgrade.md)来设置应用程序模块以利用原地升级。

本文档提供了使用原地存储迁移升级方法的步骤。

## 跟踪模块版本

每个模块都由模块开发人员分配一个共识版本。共识版本作为模块的重大变更版本。Cosmos SDK在x/upgrade `VersionMap`存储中跟踪所有模块的共识版本。在升级过程中，Cosmos SDK计算旧状态中存储的`VersionMap`与新`VersionMap`之间的差异。对于每个确定的差异，运行特定于模块的迁移，并递增每个升级模块的相应共识版本。

### 共识版本

共识版本由每个应用程序模块上的模块开发人员定义，并作为模块的重大变更版本。共识版本通知Cosmos SDK需要升级的模块。例如，如果银行模块的版本为2，并且升级引入了银行模块3，那么Cosmos SDK将升级银行模块并运行“版本2到3”的迁移脚本。

### 版本映射

版本映射是模块名称与共识版本的映射。该映射持久化到x/upgrade的状态中，以在原地迁移期间使用。当迁移完成时，更新后的版本映射将持久化到状态中。

## 升级处理程序

升级使用`UpgradeHandler`来进行迁移。应用程序开发人员实现的`UpgradeHandler`函数必须符合以下函数签名。这些函数从x/upgrade的状态中检索`VersionMap`，并返回升级后要存储在x/upgrade中的新`VersionMap`。两个`VersionMap`之间的差异决定了哪些模块需要升级。

```go
type UpgradeHandler func(ctx sdk.Context, plan Plan, fromVM VersionMap) (VersionMap, error)
```

在这些函数内部，您必须执行任何升级逻辑以包含在提供的`plan`中。所有升级处理程序函数必须以以下代码行结尾：

```go
  return app.mm.RunMigrations(ctx, cfg, fromVM)
```

## 运行迁移

迁移在`UpgradeHandler`中使用`app.mm.RunMigrations(ctx, cfg, vm)`来运行。`UpgradeHandler`函数描述了升级期间要发生的功能。`RunMigration`函数循环遍历`VersionMap`参数，并运行所有版本小于新二进制应用程序模块版本的迁移脚本。迁移完成后，返回一个新的`VersionMap`以将升级的模块版本持久化到状态中。

```go
cfg := module.NewConfigurator(...)
app.UpgradeKeeper.SetUpgradeHandler("my-plan", func(ctx sdk.Context, plan upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {

    // ...
    // additional upgrade logic
    // ...

    // returns a VersionMap with the updated module ConsensusVersions
    return app.mm.RunMigrations(ctx, fromVM)
})
```

要了解有关为您的模块配置迁移脚本的更多信息，请参阅[模块升级指南](../../integrate/building-modules/13-upgrade.md)。

### 迁移顺序

默认情况下，所有迁移按模块名称按字母升序运行，除了`x/auth`模块最后运行。原因是`x/auth`与其他模块之间存在状态依赖关系（您可以在[issue #10606](https://github.com/cosmos/cosmos-sdk/issues/10606)中阅读更多信息）。

如果要更改迁移顺序，则应在您的app.go文件中调用`app.mm.SetOrderMigrations(module1, module2, ...)`。如果您忘记在参数列表中包含一个模块，该函数将引发panic。

## 在升级期间添加新模块

您可以在升级期间引入全新的模块到应用程序中。新模块会被识别，因为它们尚未在`x/upgrade`的`VersionMap`存储中注册。在这种情况下，`RunMigrations`调用相应模块的`InitGenesis`函数来设置其初始状态。

### 为新模块添加 StoreUpgrades

准备进行原地存储迁移的所有链都需要手动为新模块添加存储升级，并配置存储加载器以应用这些升级。这样可以确保在迁移开始之前将新模块的存储添加到多存储中。

```go
upgradeInfo, err := app.UpgradeKeeper.ReadUpgradeInfoFromDisk()
if err != nil {
	panic(err)
}

if upgradeInfo.Name == "my-plan" && !app.UpgradeKeeper.IsSkipHeight(upgradeInfo.Height) {
	storeUpgrades := storetypes.StoreUpgrades{
		// add store upgrades for new modules
		// Example:
		//    Added: []string{"foo", "bar"},
		// ...
	}

	// configure store loader that checks if version == upgradeHeight and applies store upgrades
	app.SetStoreLoader(upgradetypes.UpgradeStoreLoader(upgradeInfo.Height, &storeUpgrades))
}
```

## 创世状态

在启动新链时，每个模块的共识版本都必须保存到状态中。要保存共识版本，请在 `app.go` 的 `InitChainer` 方法中添加以下行：

```diff
func (app *MyApp) InitChainer(ctx sdk.Context, req abci.RequestInitChain) abci.ResponseInitChain {
  ...
+ app.UpgradeKeeper.SetModuleVersionMap(ctx, app.mm.GetVersionMap())
  ...
}
```

Cosmos SDK 使用这些信息来检测应用中是否引入了具有更新版本的模块。

对于一个新模块 `foo`，只有当 `foo` 在模块管理器中注册但未在 `fromVM` 中设置时，`InitGenesis` 才会被 `RunMigration` 调用。因此，如果你想在向应用中添加新模块时跳过 `InitGenesis`，那么你应该将其模块版本设置为模块共识版本：

```go
app.UpgradeKeeper.SetUpgradeHandler("my-plan", func(ctx sdk.Context, plan upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
    // ...

    // Set foo's version to the latest ConsensusVersion in the VersionMap.
    // This will skip running InitGenesis on Foo
    fromVM[foo.ModuleName] = foo.AppModule{}.ConsensusVersion()

    return app.mm.RunMigrations(ctx, fromVM)
})
```

### 覆盖创世函数

Cosmos SDK 提供了应用开发者可以在其应用中导入的模块。这些模块通常已经定义了一个 `InitGenesis` 函数。

你可以为导入的模块编写自己的 `InitGenesis` 函数。为此，在升级处理程序中手动触发你的自定义创世函数。

:::warning
你必须在传递给 `UpgradeHandler` 函数的版本映射中手动设置共识版本。如果没有这个设置，即使你在 `UpgradeHandler` 中触发了自定义函数，SDK 也会运行模块的现有 `InitGenesis` 代码。
:::

```go
import foo "github.com/my/module/foo"

app.UpgradeKeeper.SetUpgradeHandler("my-plan", func(ctx sdk.Context, plan upgradetypes.Plan, fromVM module.VersionMap)  (module.VersionMap, error) {

    // Register the consensus version in the version map
    // to avoid the SDK from triggering the default
    // InitGenesis function.
    fromVM["foo"] = foo.AppModule{}.ConsensusVersion()

    // Run custom InitGenesis for foo
    app.mm["foo"].InitGenesis(ctx, app.appCodec, myCustomGenesisState)

    return app.mm.RunMigrations(ctx, cfg, fromVM)
})
```

## 将完整节点与升级的区块链同步

你可以将完整节点与已经使用 Cosmovisor 升级的现有区块链同步。

要成功同步，你必须从创世时区块链启动时使用的初始二进制文件开始。如果所有软件升级计划都包含二进制指令，那么你可以使用自动下载选项运行 Cosmovisor，自动处理与每个顺序升级相关联的二进制文件的下载和切换。否则，你需要手动提供所有二进制文件给 Cosmovisor。

要了解有关Cosmovisor的更多信息，请参阅[Cosmovisor快速入门](../../integrate/tooling/01-cosmovisor.md)。




# In-Place Store Migrations

:::warning
Read and understand all the in-place store migration documentation before you run a migration on a live chain.
:::

:::note Synopsis
Upgrade your app modules smoothly with custom in-place store migration logic.
:::

The Cosmos SDK uses two methods to perform upgrades:

* Exporting the entire application state to a JSON file using the `export` CLI command, making changes, and then starting a new binary with the changed JSON file as the genesis file.

* Perform upgrades in place, which significantly decrease the upgrade time for chains with a larger state. Use the [Module Upgrade Guide](../../integrate/building-modules/13-upgrade.md) to set up your application modules to take advantage of in-place upgrades.

This document provides steps to use the In-Place Store Migrations upgrade method.

## Tracking Module Versions

Each module gets assigned a consensus version by the module developer. The consensus version serves as the breaking change version of the module. The Cosmos SDK keeps track of all module consensus versions in the x/upgrade `VersionMap` store. During an upgrade, the difference between the old `VersionMap` stored in state and the new `VersionMap` is calculated by the Cosmos SDK. For each identified difference, the module-specific migrations are run and the respective consensus version of each upgraded module is incremented.

### Consensus Version

The consensus version is defined on each app module by the module developer and serves as the breaking change version of the module. The consensus version informs the Cosmos SDK on which modules need to be upgraded. For example, if the bank module was version 2 and an upgrade introduces bank module 3, the Cosmos SDK upgrades the bank module and runs the "version 2 to 3" migration script.

### Version Map

The version map is a mapping of module names to consensus versions. The map is persisted to x/upgrade's state for use during in-place migrations. When migrations finish, the updated version map is persisted in the state.

## Upgrade Handlers

Upgrades use an `UpgradeHandler` to facilitate migrations. The `UpgradeHandler` functions implemented by the app developer must conform to the following function signature. These functions retrieve the `VersionMap` from x/upgrade's state and return the new `VersionMap` to be stored in x/upgrade after the upgrade. The diff between the two `VersionMap`s determines which modules need upgrading.

```go
type UpgradeHandler func(ctx sdk.Context, plan Plan, fromVM VersionMap) (VersionMap, error)
```

Inside these functions, you must perform any upgrade logic to include in the provided `plan`. All upgrade handler functions must end with the following line of code:

```go
  return app.mm.RunMigrations(ctx, cfg, fromVM)
```

## Running Migrations

Migrations are run inside of an `UpgradeHandler` using `app.mm.RunMigrations(ctx, cfg, vm)`. The `UpgradeHandler` functions describe the functionality to occur during an upgrade. The `RunMigration` function loops through the `VersionMap` argument and runs the migration scripts for all versions that are less than the versions of the new binary app module. After the migrations are finished, a new `VersionMap` is returned to persist the upgraded module versions to state.

```go
cfg := module.NewConfigurator(...)
app.UpgradeKeeper.SetUpgradeHandler("my-plan", func(ctx sdk.Context, plan upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {

    // ...
    // additional upgrade logic
    // ...

    // returns a VersionMap with the updated module ConsensusVersions
    return app.mm.RunMigrations(ctx, fromVM)
})
```

To learn more about configuring migration scripts for your modules, see the [Module Upgrade Guide](../../integrate/building-modules/13-upgrade.md).

### Order Of Migrations

By default, all migrations are run in module name alphabetical ascending order, except `x/auth` which is run last. The reason is state dependencies between x/auth and other modules (you can read more in [issue #10606](https://github.com/cosmos/cosmos-sdk/issues/10606)).

If you want to change the order of migration, then you should call `app.mm.SetOrderMigrations(module1, module2, ...)` in your app.go file. The function will panic if you forget to include a module in the argument list.

## Adding New Modules During Upgrades

You can introduce entirely new modules to the application during an upgrade. New modules are recognized because they have not yet been registered in `x/upgrade`'s `VersionMap` store. In this case, `RunMigrations` calls the `InitGenesis` function from the corresponding module to set up its initial state.

### Add StoreUpgrades for New Modules

All chains preparing to run in-place store migrations will need to manually add store upgrades for new modules and then configure the store loader to apply those upgrades. This ensures that the new module's stores are added to the multistore before the migrations begin.

```go
upgradeInfo, err := app.UpgradeKeeper.ReadUpgradeInfoFromDisk()
if err != nil {
	panic(err)
}

if upgradeInfo.Name == "my-plan" && !app.UpgradeKeeper.IsSkipHeight(upgradeInfo.Height) {
	storeUpgrades := storetypes.StoreUpgrades{
		// add store upgrades for new modules
		// Example:
		//    Added: []string{"foo", "bar"},
		// ...
	}

	// configure store loader that checks if version == upgradeHeight and applies store upgrades
	app.SetStoreLoader(upgradetypes.UpgradeStoreLoader(upgradeInfo.Height, &storeUpgrades))
}
```

## Genesis State

When starting a new chain, the consensus version of each module MUST be saved to state during the application's genesis. To save the consensus version, add the following line to the `InitChainer` method in `app.go`:

```diff
func (app *MyApp) InitChainer(ctx sdk.Context, req abci.RequestInitChain) abci.ResponseInitChain {
  ...
+ app.UpgradeKeeper.SetModuleVersionMap(ctx, app.mm.GetVersionMap())
  ...
}
```

This information is used by the Cosmos SDK to detect when modules with newer versions are introduced to the app.

For a new module `foo`, `InitGenesis` is called by `RunMigration` only when `foo` is registered in the module manager but it's not set in the `fromVM`. Therefore, if you want to skip `InitGenesis` when a new module is added to the app, then you should set its module version in `fromVM` to the module consensus version:

```go
app.UpgradeKeeper.SetUpgradeHandler("my-plan", func(ctx sdk.Context, plan upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
    // ...

    // Set foo's version to the latest ConsensusVersion in the VersionMap.
    // This will skip running InitGenesis on Foo
    fromVM[foo.ModuleName] = foo.AppModule{}.ConsensusVersion()

    return app.mm.RunMigrations(ctx, fromVM)
})
```

### Overwriting Genesis Functions

The Cosmos SDK offers modules that the application developer can import in their app. These modules often have an `InitGenesis` function already defined.

You can write your own `InitGenesis` function for an imported module. To do this, manually trigger your custom genesis function in the upgrade handler.

:::warning
You MUST manually set the consensus version in the version map passed to the `UpgradeHandler` function. Without this, the SDK will run the Module's existing `InitGenesis` code even if you triggered your custom function in the `UpgradeHandler`.
:::

```go
import foo "github.com/my/module/foo"

app.UpgradeKeeper.SetUpgradeHandler("my-plan", func(ctx sdk.Context, plan upgradetypes.Plan, fromVM module.VersionMap)  (module.VersionMap, error) {

    // Register the consensus version in the version map
    // to avoid the SDK from triggering the default
    // InitGenesis function.
    fromVM["foo"] = foo.AppModule{}.ConsensusVersion()

    // Run custom InitGenesis for foo
    app.mm["foo"].InitGenesis(ctx, app.appCodec, myCustomGenesisState)

    return app.mm.RunMigrations(ctx, cfg, fromVM)
})
```

## Syncing a Full Node to an Upgraded Blockchain

You can sync a full node to an existing blockchain which has been upgraded using Cosmovisor

To successfully sync, you must start with the initial binary that the blockchain started with at genesis. If all Software Upgrade Plans contain binary instruction, then you can run Cosmovisor with auto-download option to automatically handle downloading and switching to the binaries associated with each sequential upgrade. Otherwise, you need to manually provide all binaries to Cosmovisor.

To learn more about Cosmovisor, see the [Cosmovisor Quick Start](../../integrate/tooling/01-cosmovisor.md).
