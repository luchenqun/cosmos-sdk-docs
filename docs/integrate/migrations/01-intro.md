# SDK 迁移

为了平稳地升级到最新的稳定版本，SDK 包含了一个用于硬分叉迁移的 CLI 命令（在 `<appd> genesis migrate` 子命令下）。
此外，SDK 还包含了其核心模块的原地迁移。这些原地迁移对于在主要版本之间进行迁移非常有用。

* 从上一个主要版本到当前版本支持硬分叉迁移。
* 从上两个主要版本到当前版本支持原地模块迁移。

不支持从早于上两个主要版本的版本进行迁移。

在从旧版本迁移时，请参考要迁移至的版本的 [`UPGRADING.md`](02-upgrading.md) 和 `CHANGELOG.md`。




# SDK Migrations

To smoothen the update to the latest stable release, the SDK includes a CLI command for hard-fork migrations (under the `<appd> genesis migrate` subcommand). 
Additionally, the SDK includes in-place migrations for its core modules. These in-place migrations are useful to migrate between major releases.

* Hard-fork migrations are supported from the last major release to the current one.
* In-place module migrations are supported from the last two major releases to the current one.

Migration from a version older than the last two major releases is not supported.

When migrating from a previous version, refer to the [`UPGRADING.md`](02-upgrading.md) and the `CHANGELOG.md` of the version you are migrating to.
