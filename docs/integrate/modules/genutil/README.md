# `x/genutil`

## 概念

`genutil` 包含了一系列用于区块链应用中的创世工具功能。具体包括：

* 与创世交易相关的功能 (gentx)
* 用于收集和创建 gentx 的命令
* `InitChain` 处理 gentx
* 创世文件验证
* 创世文件迁移
* CometBFT 相关的初始化
    * 将应用的创世转换为 CometBFT 创世

## 客户端

### 命令行界面 (CLI)

`genutil` 命令可以在 `genesis` 子命令下使用。

#### add-genesis-account

向 `genesis.json` 添加一个创世账户。了解更多信息 [here](https://docs.cosmos.network/main/run-node/run-node#adding-genesis-accounts)。

#### collect-gentxs

收集创世交易并输出一个 `genesis.json` 文件。

```shell
simd genesis collect-gentxs
```

这将创建一个新的 `genesis.json` 文件，其中包含来自所有验证者的数据（我们有时称之为“超级创世文件”，以区别于单验证者创世文件）。

#### gentx

生成一个携带自委托的创世交易。

```shell
simd genesis gentx [key_name] [amount] --chain-id [chain-id]
```

这将为您的新链创建创世交易。这里的 `amount` 应至少为 `1000000000stake`。
如果提供的数量过多或过少，启动节点时会遇到错误。

#### migrate

将创世迁移到指定的目标（SDK）版本。

```shell
simd genesis migrate [target-version]
```

:::tip
`migrate` 命令是可扩展的，并接受一个 `MigrationMap`。该映射是目标版本与创世迁移函数之间的映射。
当不使用默认的 `MigrationMap` 时，建议仍然调用与链的 SDK 版本对应的默认 `MigrationMap`，并在其前面/后面添加自己的创世迁移。
:::

#### validate-genesis

验证默认位置或作为参数传递的位置处的创世文件。

```shell
simd genesis validate-genesis
```

:::warning
`validate-genesis` 仅验证创世文件在 **当前应用程序二进制文件** 上是否有效。要验证来自应用程序先前版本的创世文件，请使用 `migrate` 命令将创世迁移到当前版本。
:::

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


# `x/genutil`

## Concepts

The `genutil` package contains a variaety of genesis utility functionalities for usage within a blockchain application. Namely:

* Genesis transactions related (gentx)
* Commands for collection and creation of gentxs
* `InitChain` processing of gentxs
* Genesis file validation
* Genesis file migration
* CometBFT related initialization
    * Translation of an app genesis to a CometBFT genesis

## Client

### CLI

The genutil commands are available under the `genesis` subcommand.

#### add-genesis-account

Add a genesis account to `genesis.json`. Learn more [here](https://docs.cosmos.network/main/run-node/run-node#adding-genesis-accounts).

#### collect-gentxs

Collect genesis txs and output a `genesis.json` file.

```shell
simd genesis collect-gentxs
```

This will create a new `genesis.json` file that includes data from all the validators (we sometimes call it the "super genesis file" to distinguish it from single-validator genesis files).

#### gentx

Generate a genesis tx carrying a self delegation.

```shell
simd genesis gentx [key_name] [amount] --chain-id [chain-id]
```

This will create the genesis transaction for your new chain. Here `amount` should be at least `1000000000stake`.
If you provide too much or too little, you will encounter an error when starting a node.

#### migrate

Migrate genesis to a specified target (SDK) version.

```shell
simd genesis migrate [target-version]
```

:::tip
The `migrate` command is extensible and takes a `MigrationMap`. This map is a mapping of target versions to genesis migrations functions.
When not using the default `MigrationMap`, it is recommended to still call the default `MigrationMap` corresponding the SDK version of the chain and prepend/append your own genesis migrations.
:::

#### validate-genesis

Validates the genesis file at the default location or at the location passed as an argument.

```shell
simd genesis validate-genesis
```

:::warning
Validate genesis only validates if the genesis is valid at the **current application binary**. For validating a genesis from a previous version of the application, use the `migrate` command to migrate the genesis to the current version.
:::
