# 运行节点

:::note 概要
现在应用程序已经准备好并且密钥库已经填充，是时候看看如何运行区块链节点了。在本节中，我们运行的应用程序称为 [`simapp`](https://github.com/cosmos/cosmos-sdk/tree/main/simapp)，对应的 CLI 二进制文件为 `simd`。
:::

:::note

### 先决条件阅读

* [Cosmos SDK 应用程序的解剖](../../develop/high-level-concepts/00-overview-app.md)
* [设置密钥库](00-keyring.md)

:::

## 初始化链

:::warning
确保您可以构建自己的二进制文件，并将 `simd` 替换为代码片段中的二进制文件名。
:::

在实际运行节点之前，我们需要初始化链，尤其是它的创世文件。可以使用 `init` 子命令来完成此操作：

```bash
# 参数 <moniker> 是您节点的自定义用户名，它应该是可读的。
simd init <moniker> --chain-id my-test-chain
```

上述命令将创建运行节点所需的所有配置文件，以及一个默认的创世文件，该文件定义了网络的初始状态。所有这些配置文件默认位于 `~/.simapp` 文件夹中，但您可以通过传递 `--home` 标志来覆盖此文件夹的位置。

`~/.simapp` 文件夹的结构如下：

```bash
.                                   # ~/.simapp
  |- data                           # Contains the databases used by the node.
  |- config/
      |- app.toml                   # Application-related configuration file.
      |- config.toml                # CometBFT-related configuration file.
      |- genesis.json               # The genesis file.
      |- node_key.json              # Private key to use for node authentication in the p2p protocol.
      |- priv_validator_key.json    # Private key to use as a validator in the consensus protocol.
```

## 更新一些默认设置

如果您想要更改配置文件（例如：genesis.json）中的任何字段值，可以使用 `jq` ([安装](https://stedolan.github.io/jq/download/) & [文档](https://stedolan.github.io/jq/manual/#Assignment)) 和 `sed` 命令来完成。这里列出了一些示例。

```bash
# to change the chain-id
jq '.chain_id = "testing"' genesis.json > temp.json && mv temp.json genesis.json

# to enable the api server
sed -i '/\[api\]/,+3 s/enable = false/enable = true/' app.toml

# to change the voting_period
jq '.app_state.gov.voting_params.voting_period = "600s"' genesis.json > temp.json && mv temp.json genesis.json

# to change the inflation
jq '.app_state.mint.minter.inflation = "0.300000000000000000"' genesis.json > temp.json && mv temp.json genesis.json
```

### 客户端交互

在实例化节点时，默认情况下，GRPC 和 REST 都设置为本地主机，以避免将节点暴露给公众。建议不要在没有能够处理负载均衡或设置在节点和公众之间进行身份验证的代理的情况下暴露这些端点。

:::tip
一个常用的工具是 [nginx](https://nginx.org)。
:::

## 添加初始账户

在启动链之前，您需要在状态中添加至少一个账户。为此，首先在 `test` 密钥环后端中[创建一个名为 `my_validator` 的新账户](00-keyring.md#adding-keys-to-the-keyring)（可以选择其他名称和后端）。

现在，您已经创建了一个本地账户，请继续在您的链的创世文件中授予它一些 `stake` 代币。这样做还会确保您的链知道该账户的存在：

```bash
simd genesis add-genesis-account $MY_VALIDATOR_ADDRESS 100000000000stake
```

请注意，`$MY_VALIDATOR_ADDRESS` 是一个变量，保存着 [keyring](00-keyring.md#adding-keys-to-the-keyring) 中 `my_validator` 密钥的地址。同时请注意，Cosmos SDK 中的代币采用 `{amount}{denom}` 的格式：`amount` 是一个 18 位精度的小数，`denom` 是带有其标识符键的唯一代币标识符（例如 `atom` 或 `uatom`）。在这里，我们授予 `stake` 代币，因为 `stake` 是 [`simapp`](https://github.com/cosmos/cosmos-sdk/tree/main/simapp) 中用于质押的代币标识符。对于您自己的链和其自己的质押标识符，应该使用该代币标识符。

现在，您的账户拥有一些代币，您需要向您的链中添加一个验证人。验证人是特殊的全节点，参与共识过程（在[底层共识引擎](../../develop/intro/02-sdk-app-architecture.md#cometbft)中实现），以便向链中添加新的区块。任何账户都可以声明成为验证人操作者的意图，但只有那些具有足够委托的账户才能进入活跃集合（例如，在 Cosmos Hub 中，只有最多委托的前 125 个验证人候选人才能成为验证人）。在本指南中，您将把您的本地节点（通过上面的 `init` 命令创建）添加为您链的验证人。验证人可以在链首次启动之前通过创世文件中的特殊交易（称为 `gentx`）进行声明：

```bash
# Create a gentx.
simd genesis gentx my_validator 100000000stake --chain-id my-test-chain --keyring-backend test

# Add the gentx to the genesis file.
simd genesis collect-gentxs
```

`gentx`做了三件事：

1. 将您创建的`validator`账户注册为验证器操作账户（即控制验证器的账户）。
2. 自委托提供的抵押代币数量。
3. 将操作账户与用于签署区块的CometBFT节点公钥关联起来。如果未提供`--pubkey`标志，则默认使用通过上述`simd init`命令创建的本地节点公钥。

要了解有关`gentx`的更多信息，请使用以下命令：

```bash
simd genesis gentx --help
```

## 使用`app.toml`和`config.toml`配置节点

Cosmos SDK会自动生成两个配置文件，位于`~/.simapp/config`目录下：

* `config.toml`：用于配置CometBFT，请参阅[CometBFT文档](https://docs.cometbft.com/v0.37/core/configuration)了解更多信息。
* `app.toml`：由Cosmos SDK生成，用于配置您的应用程序，例如状态修剪策略、遥测、gRPC和REST服务器配置、状态同步等。

这两个文件都有详细的注释，请直接参考它们进行调整。

一个可以调整的示例配置是`app.toml`中的`minimum-gas-prices`字段，该字段定义了验证器节点愿意接受的处理交易的最低燃料价格。根据链的不同，它可能是一个空字符串或非空字符串。如果为空，请确保编辑该字段并设置一些值，例如`10token`，否则节点将在启动时停止。在本教程中，让我们将最低燃料价格设置为0：

```toml
 # The minimum gas prices a validator is willing to accept for processing a
 # transaction. A transaction's fees must meet the minimum of any denomination
 # specified in this config (e.g. 0.25token1;0.0001token2).
 minimum-gas-prices = "0stake"
```

## 运行Localnet

现在一切都设置好了，您可以开始运行节点了：

```bash
simd start
```

您应该会看到区块的生成。

上述命令允许您运行单个节点。这足够进行下一节中与该节点交互的操作，但您可能希望同时运行多个节点，并观察它们之间的共识过程。

一种简单的方法是在单独的终端窗口中再次运行相同的命令。这是可行的，但在Cosmos SDK中，我们利用[Docker Compose](https://docs.docker.com/compose/)的强大功能来运行本地网络。如果您需要关于如何使用Docker Compose设置自己的本地网络的灵感，可以查看Cosmos SDK的[`docker-compose.yml`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/docker-compose.yml)文件。

## 日志记录

日志记录提供了一种查看节点运行情况的方式。默认情况下，日志级别被设置为info级别。这是一个全局级别，所有的info日志都会输出到终端。如果你想要将特定的日志筛选到终端而不是全部日志，那么设置`module:log_level`就可以实现这个功能。

示例：

在config.toml中：

```toml
log_level: "state:info,p2p:info,consensus:info,x/staking:info,x/ibc:info,*error"
```





# Running a Node

:::note Synopsis
Now that the application is ready and the keyring populated, it's time to see how to run the blockchain node. In this section, the application we are running is called [`simapp`](https://github.com/cosmos/cosmos-sdk/tree/main/simapp), and its corresponding CLI binary `simd`.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK Application](../../develop/high-level-concepts/00-overview-app.md)
* [Setting up the keyring](00-keyring.md)

:::

## Initialize the Chain

:::warning
Make sure you can build your own binary, and replace `simd` with the name of your binary in the snippets.
:::

Before actually running the node, we need to initialize the chain, and most importantly its genesis file. This is done with the `init` subcommand:

```bash
# The argument <moniker> is the custom username of your node, it should be human-readable.
simd init <moniker> --chain-id my-test-chain
```

The command above creates all the configuration files needed for your node to run, as well as a default genesis file, which defines the initial state of the network. All these configuration files are in `~/.simapp` by default, but you can overwrite the location of this folder by passing the `--home` flag.

The `~/.simapp` folder has the following structure:

```bash
.                                   # ~/.simapp
  |- data                           # Contains the databases used by the node.
  |- config/
      |- app.toml                   # Application-related configuration file.
      |- config.toml                # CometBFT-related configuration file.
      |- genesis.json               # The genesis file.
      |- node_key.json              # Private key to use for node authentication in the p2p protocol.
      |- priv_validator_key.json    # Private key to use as a validator in the consensus protocol.
```

## Updating Some Default Settings

If you want to change any field values in configuration files (for ex: genesis.json) you can use `jq` ([installation](https://stedolan.github.io/jq/download/) & [docs](https://stedolan.github.io/jq/manual/#Assignment)) & `sed` commands to do that. Few examples are listed here.

```bash
# to change the chain-id
jq '.chain_id = "testing"' genesis.json > temp.json && mv temp.json genesis.json

# to enable the api server
sed -i '/\[api\]/,+3 s/enable = false/enable = true/' app.toml

# to change the voting_period
jq '.app_state.gov.voting_params.voting_period = "600s"' genesis.json > temp.json && mv temp.json genesis.json

# to change the inflation
jq '.app_state.mint.minter.inflation = "0.300000000000000000"' genesis.json > temp.json && mv temp.json genesis.json
```

### Client Interaction

When instantiating a node, GRPC and REST are defaulted to localhost to avoid unknown exposure of your node to the public. It is recommended to not expose these endpoints without a proxy that can handle load balancing or authentication is setup between your node and the public. 

:::tip
A commonly used tool for this is [nginx](https://nginx.org).
:::


## Adding Genesis Accounts

Before starting the chain, you need to populate the state with at least one account. To do so, first [create a new account in the keyring](00-keyring.md#adding-keys-to-the-keyring) named `my_validator` under the `test` keyring backend (feel free to choose another name and another backend).

Now that you have created a local account, go ahead and grant it some `stake` tokens in your chain's genesis file. Doing so will also make sure your chain is aware of this account's existence:

```bash
simd genesis add-genesis-account $MY_VALIDATOR_ADDRESS 100000000000stake
```

Recall that `$MY_VALIDATOR_ADDRESS` is a variable that holds the address of the `my_validator` key in the [keyring](00-keyring.md#adding-keys-to-the-keyring). Also note that the tokens in the Cosmos SDK have the `{amount}{denom}` format: `amount` is is a 18-digit-precision decimal number, and `denom` is the unique token identifier with its denomination key (e.g. `atom` or `uatom`). Here, we are granting `stake` tokens, as `stake` is the token identifier used for staking in [`simapp`](https://github.com/cosmos/cosmos-sdk/tree/main/simapp). For your own chain with its own staking denom, that token identifier should be used instead.

Now that your account has some tokens, you need to add a validator to your chain. Validators are special full-nodes that participate in the consensus process (implemented in the [underlying consensus engine](../../develop/intro/02-sdk-app-architecture.md#cometbft)) in order to add new blocks to the chain. Any account can declare its intention to become a validator operator, but only those with sufficient delegation get to enter the active set (for example, only the top 125 validator candidates with the most delegation get to be validators in the Cosmos Hub). For this guide, you will add your local node (created via the `init` command above) as a validator of your chain. Validators can be declared before a chain is first started via a special transaction included in the genesis file called a `gentx`:

```bash
# Create a gentx.
simd genesis gentx my_validator 100000000stake --chain-id my-test-chain --keyring-backend test

# Add the gentx to the genesis file.
simd genesis collect-gentxs
```

A `gentx` does three things:

1. Registers the `validator` account you created as a validator operator account (i.e. the account that controls the validator).
2. Self-delegates the provided `amount` of staking tokens.
3. Link the operator account with a CometBFT node pubkey that will be used for signing blocks. If no `--pubkey` flag is provided, it defaults to the local node pubkey created via the `simd init` command above.

For more information on `gentx`, use the following command:

```bash
simd genesis gentx --help
```

## Configuring the Node Using `app.toml` and `config.toml`

The Cosmos SDK automatically generates two configuration files inside `~/.simapp/config`:

* `config.toml`: used to configure the CometBFT, learn more on [CometBFT's documentation](https://docs.cometbft.com/v0.37/core/configuration),
* `app.toml`: generated by the Cosmos SDK, and used to configure your app, such as state pruning strategies, telemetry, gRPC and REST servers configuration, state sync...

Both files are heavily commented, please refer to them directly to tweak your node.

One example config to tweak is the `minimum-gas-prices` field inside `app.toml`, which defines the minimum gas prices the validator node is willing to accept for processing a transaction. Depending on the chain, it might be an empty string or not. If it's empty, make sure to edit the field with some value, for example `10token`, or else the node will halt on startup. For the purpose of this tutorial, let's set the minimum gas price to 0:

```toml
 # The minimum gas prices a validator is willing to accept for processing a
 # transaction. A transaction's fees must meet the minimum of any denomination
 # specified in this config (e.g. 0.25token1;0.0001token2).
 minimum-gas-prices = "0stake"
```

## Run a Localnet

Now that everything is set up, you can finally start your node:

```bash
simd start
```

You should see blocks come in.

The previous command allow you to run a single node. This is enough for the next section on interacting with this node, but you may wish to run multiple nodes at the same time, and see how consensus happens between them.

The naive way would be to run the same commands again in separate terminal windows. This is possible, however in the Cosmos SDK, we leverage the power of [Docker Compose](https://docs.docker.com/compose/) to run a localnet. If you need inspiration on how to set up your own localnet with Docker Compose, you can have a look at the Cosmos SDK's [`docker-compose.yml`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/docker-compose.yml).

## Logging

Logging provides a way to see what is going on with a node. By default the info level is set. This is a global level and all info logs will be outputted to the terminal. If you would like to filter specific logs to the terminal instead of all, then setting `module:log_level` is how this can work. 

Example: 

In config.toml:

```toml
log_level: "state:info,p2p:info,consensus:info,x/staking:info,x/ibc:info,*error"
```
