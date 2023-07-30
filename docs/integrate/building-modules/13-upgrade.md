# 模块升级

:::note 概要
[原地存储迁移](../../develop/advanced-concepts/16-upgrade.md) 允许您的模块升级到包含破坏性更改的新版本。本文档概述了如何构建模块以利用此功能。
:::

:::note

### 先决条件阅读

* [原地存储迁移](../../develop/advanced-concepts/16-upgrade.md)

:::

## 共识版本

成功升级现有模块需要每个 `AppModule` 实现函数 `ConsensusVersion() uint64`。

* 版本必须由模块开发者硬编码。
* 初始版本**必须**设置为 1。

共识版本用作应用模块的状态破坏版本，当模块引入破坏性更改时，必须递增共识版本。

## 注册迁移

要注册在模块升级期间发生的功能，您必须注册要执行的迁移。

迁移注册在 `Configurator` 中使用 `RegisterMigration` 方法进行。`AppModule` 对配置器的引用在 `RegisterServices` 方法中。

您可以注册一个或多个迁移。如果注册了多个迁移脚本，请按递增顺序列出迁移，并确保有足够的迁移导致所需的共识版本。例如，要迁移到模块的第 3 版，请注册版本 1 和版本 2 的单独迁移，如下例所示：

```go
func (am AppModule) RegisterServices(cfg module.Configurator) {
    // --snip--
    cfg.RegisterMigration(types.ModuleName, 1, func(ctx sdk.Context) error {
        // Perform in-place store migrations from ConsensusVersion 1 to 2.
    })
     cfg.RegisterMigration(types.ModuleName, 2, func(ctx sdk.Context) error {
        // Perform in-place store migrations from ConsensusVersion 2 to 3.
    })
}
```

由于这些迁移是需要访问 Keeper 存储的函数，因此请使用围绕 Keeper 的包装器称为 `Migrator`，如下例所示：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/migrations.go#L11-L35
```

## 编写迁移脚本

为了定义升级期间发生的功能，请编写一个迁移脚本，并将函数放置在 `migrations/` 目录中。例如，要为银行模块编写迁移脚本，请将函数放置在 `x/bank/migrations/` 中。请使用推荐的函数命名约定。例如，`v2bank` 是迁移包 `x/bank/migrations/v2` 的脚本。

```go
// Migrating bank module from version 1 to 2
func (m Migrator) Migrate1to2(ctx sdk.Context) error {
	return v2bank.MigrateStore(ctx, m.keeper.storeKey) // v2bank is package `x/bank/migrations/v2`.
}
```

要查看在余额密钥迁移中实施的更改的示例代码，请访问[migrateBalanceKeys](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/migrations/v2/store.go#L52-L73)。为了了解背景，此代码引入了银行存储的迁移，更新了地址，使其以字节长度为前缀，如[ADR-028](../architecture/adr-028-public-key-addresses.md)中所述。




# Upgrading Modules

:::note Synopsis
[In-Place Store Migrations](../../develop/advanced-concepts/16-upgrade.md) allow your modules to upgrade to new versions that include breaking changes. This document outlines how to build modules to take advantage of this functionality.
:::

:::note

### Pre-requisite Readings

* [In-Place Store Migration](../../develop/advanced-concepts/16-upgrade.md)

:::

## Consensus Version

Successful upgrades of existing modules require each `AppModule` to implement the function `ConsensusVersion() uint64`.

* The versions must be hard-coded by the module developer.
* The initial version **must** be set to 1.

Consensus versions serve as state-breaking versions of app modules and must be incremented when the module introduces breaking changes.

## Registering Migrations

To register the functionality that takes place during a module upgrade, you must register which migrations you want to take place.

Migration registration takes place in the `Configurator` using the `RegisterMigration` method. The `AppModule` reference to the configurator is in the `RegisterServices` method.

You can register one or more migrations. If you register more than one migration script, list the migrations in increasing order and ensure there are enough migrations that lead to the desired consensus version. For example, to migrate to version 3 of a module, register separate migrations for version 1 and version 2 as shown in the following example:

```go
func (am AppModule) RegisterServices(cfg module.Configurator) {
    // --snip--
    cfg.RegisterMigration(types.ModuleName, 1, func(ctx sdk.Context) error {
        // Perform in-place store migrations from ConsensusVersion 1 to 2.
    })
     cfg.RegisterMigration(types.ModuleName, 2, func(ctx sdk.Context) error {
        // Perform in-place store migrations from ConsensusVersion 2 to 3.
    })
}
```

Since these migrations are functions that need access to a Keeper's store, use a wrapper around the keepers called `Migrator` as shown in this example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/migrations.go#L11-L35
```

## Writing Migration Scripts

To define the functionality that takes place during an upgrade, write a migration script and place the functions in a `migrations/` directory. For example, to write migration scripts for the bank module, place the functions in `x/bank/migrations/`. Use the recommended naming convention for these functions. For example, `v2bank` is the script that migrates the package `x/bank/migrations/v2`:

```go
// Migrating bank module from version 1 to 2
func (m Migrator) Migrate1to2(ctx sdk.Context) error {
	return v2bank.MigrateStore(ctx, m.keeper.storeKey) // v2bank is package `x/bank/migrations/v2`.
}
```

To see example code of changes that were implemented in a migration of balance keys, check out [migrateBalanceKeys](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/migrations/v2/store.go#L52-L73). For context, this code introduced migrations of the bank store that updated addresses to be prefixed by their length in bytes as outlined in [ADR-028](../architecture/adr-028-public-key-addresses.md).
