# 命令行界面

:::note 概述
本文档描述了命令行界面（CLI）在高层次上的工作原理，适用于[**应用程序**](../high-level-concepts/00-overview-app.md)。有关为 Cosmos SDK [**模块**](../../integrate/building-modules/00-intro.md) 实现 CLI 的详细信息，请参阅[此处](../../integrate/building-modules/09-module-interfaces.md#cli)。
:::

## 命令行界面

### 示例命令

创建 CLI 没有固定的方式，但是 Cosmos SDK 模块通常使用 [Cobra 库](https://github.com/spf13/cobra)。使用 Cobra 构建 CLI 需要定义命令、参数和标志。[**命令**](#root-command) 用于理解用户希望执行的操作，例如 `tx` 用于创建交易，`query` 用于查询应用程序。每个命令还可以有嵌套的子命令，用于命名特定的交易类型。用户还可以提供**参数**，例如要发送代币的帐户号码，以及[**标志**](#flags)来修改命令的各个方面，例如燃料价格或广播到哪个节点。

以下是用户可能输入的与 simapp CLI `simd` 交互以发送一些代币的命令示例：

```bash
simd tx bank send $MY_VALIDATOR_ADDRESS $RECIPIENT 1000stake --gas auto --gas-prices <gasPrices>
```

前四个字符串指定了命令：

* 整个应用程序的根命令 `simd`。
* 子命令 `tx`，其中包含允许用户创建交易的所有命令。
* 子命令 `bank`，用于指示将命令路由到哪个模块（在本例中为 [`x/bank`](../../integrate/modules/bank/README.md) 模块）。
* 交易类型 `send`。

接下来的两个字符串是参数：用户希望从中发送的 `from_address`，以及接收方的 `to_address` 和他们希望发送的 `amount`。最后，命令的最后几个字符串是可选的标志，用于指示用户愿意支付多少费用（使用执行交易所使用的燃料量和用户提供的燃料价格来计算）。

CLI与[node](03-node.md)进行交互以处理此命令。接口本身在`main.go`文件中定义。

### 构建CLI

`main.go`文件需要有一个`main()`函数，该函数创建一个根命令，所有应用程序命令将作为子命令添加到其中。根命令还处理以下内容：

* **设置配置**，通过读取配置文件（例如Cosmos SDK配置文件）。
* **添加任何标志**，例如`--chain-id`。
* **通过调用应用程序的`MakeCodec()`函数（在`simapp`中称为`MakeTestEncodingConfig`）来实例化`codec`**。[`codec`](06-encoding.md)用于对应用程序的数据结构进行编码和解码 - 存储只能持久化`[]byte`，因此开发人员必须为其数据结构定义序列化格式或使用默认的Protobuf。
* **为所有可能的用户交互添加子命令**，包括[事务命令](#transaction-commands)和[查询命令](#query-commands)。

`main()`函数最后创建一个执行器并[执行](https://pkg.go.dev/github.com/spf13/cobra#Command.Execute)根命令。以下是`simapp`应用程序中`main()`函数的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/main.go#L12-L24
```

文档的其余部分将详细说明每个步骤需要实现的内容，并包括来自`simapp` CLI文件的较小代码片段。

## 向CLI添加命令

每个应用程序CLI首先构建一个根命令，然后使用`rootCmd.AddCommand()`聚合子命令（通常还有进一步嵌套的子命令）来添加功能。应用程序的大部分独特功能都在其事务和查询命令中，分别称为`TxCmd`和`QueryCmd`。

### 根命令

根命令（称为`rootCmd`）是用户在命令行中首次输入的命令，用于指示他们希望与哪个应用程序进行交互。用于调用命令的字符串（"Use"字段）通常是应用程序名称后缀为`-d`，例如`simd`或`gaiad`。根命令通常包括以下命令以支持应用程序的基本功能。

* **Status** 命令来自 Cosmos SDK rpc 客户端工具，用于打印有关连接的 [`Node`](03-node.md) 状态的信息。节点的状态包括 `NodeInfo`、`SyncInfo` 和 `ValidatorInfo`。
* **Keys** [命令](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/keys) 来自 Cosmos SDK 客户端工具，包括一系列子命令，用于使用 Cosmos SDK 加密工具中的密钥功能，包括添加新密钥并将其保存到密钥环中，列出密钥环中存储的所有公钥，以及删除密钥。例如，用户可以输入 `simd keys add <name>` 来添加新密钥并将加密副本保存到密钥环中，使用 `--recover` 标志从种子短语中恢复私钥，或使用 `--multisig` 标志将多个密钥组合在一起创建多签名密钥。有关 `add` 密钥命令的详细信息，请参阅[此处](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/keys/add.go)的代码。有关使用 `--keyring-backend` 存储密钥凭据的更多详细信息，请查看[keyring 文档](../../user/run-node/00-keyring.md)。
* **Server** 命令来自 Cosmos SDK 服务器包。这些命令负责提供启动 ABCI CometBFT 应用所需的机制，并提供完全引导应用所需的 CLI 框架（基于 [cobra](https://github.com/spf13/cobra)）。该包公开了两个核心函数：`StartCmd` 和 `ExportCmd`，分别用于创建启动应用程序和导出状态的命令。
了解更多信息，请点击[此处](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server)。
* [**Transaction**](#transaction-commands) 命令。
* [**Query**](#query-commands) 命令。

下面是 `simapp` 应用程序中的一个示例 `rootCmd` 函数。它实例化根命令，添加一个[*persistent* flag](#flags) 和 `PreRun` 函数，在每次执行之前运行，并添加所有必要的子命令。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L38-L92
```

`rootCmd`有一个名为`initAppConfig()`的函数，用于设置应用程序的自定义配置。
默认情况下，应用程序使用来自Cosmos SDK的CometBFT应用程序配置模板，可以通过`initAppConfig()`进行覆盖。
以下是一个示例代码，用于覆盖默认的`app.toml`模板。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L106-L161
```

`initAppConfig()`还允许覆盖默认的Cosmos SDK [服务器配置](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/config/config.go#L235)。一个示例是`min-gas-prices`配置，它定义了验证人愿意接受的处理交易的最低燃料价格。默认情况下，Cosmos SDK将此参数设置为`""`（空字符串），这会强制所有验证人调整自己的`app.toml`并设置一个非空值，否则节点将在启动时停止。这对于验证人来说可能不是最好的用户体验，因此链开发人员可以在`initAppConfig()`函数中为验证人设置一个默认的`app.toml`值。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L126-L142
```

根级别的`status`和`keys`子命令在大多数应用程序中都是常见的，并且不与应用程序状态交互。应用程序的大部分功能 - 用户实际上可以通过它来*执行*的功能 - 是通过其`tx`和`query`命令启用的。

### 交易命令

[交易](01-transactions.md)是包装触发状态更改的[`Msg`](../../integrate/building-modules/02-messages-and-queries.md#messages)的对象。为了使用CLI界面创建交易，通常会将`txCommand`函数添加到`rootCmd`中：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L177-L184
```

这个`txCommand`函数添加了所有可用于应用程序终端用户的交易。通常包括：

* 来自[`auth`](../../integrate/modules/auth/README.md)模块的**签名命令**，用于对交易中的消息进行签名。要启用多重签名，请添加`auth`模块的`MultiSign`命令。由于每个交易都需要某种形式的签名才能有效，因此签名命令对于每个应用程序都是必需的。
* 来自Cosmos SDK客户端工具的**广播命令**，用于广播交易。
* 应用程序所依赖的**所有[模块交易命令](../../integrate/building-modules/09-module-interfaces.md#transaction-commands)**，通过使用[基本模块管理器](../../integrate/building-modules/01-module-manager.md#basic-manager)的`AddTxCommands()`函数来获取。

这是一个将这些子命令从`simapp`应用程序聚合到`txCommand`的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L227-L251
```

### 查询命令

[**查询**](../../integrate/building-modules/02-messages-and-queries.md#queries)是允许用户检索应用程序状态信息的对象。为了使用CLI界面创建查询，通常会将一个名为`queryCommand`的函数添加到`rootCmd`中：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L177-L184
```

这个`queryCommand`函数会添加所有可供终端用户使用的查询。通常包括：

* **QueryTx** 和/或其他来自`auth`模块的事务查询命令，允许用户通过输入事务哈希、标签列表或块高度来搜索事务。这些查询允许用户查看事务是否已包含在块中。
* **Account命令** 来自`auth`模块，根据地址显示账户状态（例如账户余额）。
* 来自Cosmos SDK rpc客户端工具的**Validator命令**，显示给定高度的验证器集。
* 来自Cosmos SDK RPC客户端工具的**Block命令**，显示给定高度的块数据。
* 使用[basic module manager](../../integrate/building-modules/01-module-manager.md#basic-manager)的`AddQueryCommands()`函数检索应用程序所依赖的**所有[模块查询命令](../../integrate/building-modules/09-module-interfaces.md#query-commands)**。

这是一个将这些子命令从`simapp`应用程序聚合到`queryCommand`的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L204-L225
```

## 标志

标志用于修改命令；开发人员可以在`flags.go`文件中与CLI一起包含它们。用户可以在命令中明确包含它们，或者在其[`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml)中预先配置它们。常见的预配置标志包括连接到的`--node`和用户希望与之交互的区块链的`--chain-id`。

一个*持久性*标志（与*本地*标志相对）添加到一个命令中，会传递给其所有子命令：子命令将继承这些标志的配置值。此外，当标志被添加到命令时，它们都有默认值；有些标志将选项关闭，而其他标志则是空值，用户需要覆盖它们以创建有效的命令。标志可以明确标记为*必需*，这样如果用户没有提供值，就会自动抛出错误，但也可以以不同的方式处理意外缺失的标志。

标志直接添加到命令中（通常在[模块的 CLI 文件](../../integrate/building-modules/09-module-interfaces.md#flags)中定义模块命令的地方），除了`rootCmd`持久性标志外，不需要在应用程序级别添加任何标志。通常在根命令中为`--chain-id`添加一个*持久性*标志，它是应用程序所属的区块链的唯一标识符。可以在`main()`函数中添加此标志。添加此标志是有意义的，因为在此应用程序 CLI 中，命令之间的链 ID 不应该更改。

## 环境变量

每个标志都绑定到相应的命名环境变量。环境变量的名称由两部分组成 - 大写的`basename`后跟标志的名称。`-`必须替换为`_`。例如，应用程序的基本名称为`GAIA`，则标志`--home`绑定到`GAIA_HOME`。这样可以减少输入常规操作所需的标志数量。例如，不需要输入：

```shell
gaia --home=./ --node=<node address> --chain-id="testchain-1" --keyring-backend=test tx ... --from=<key name>
```

而可以更方便地输入：

```shell
# define env variables in .env, .envrc etc
GAIA_HOME=<path to home>
GAIA_NODE=<node address>
GAIA_CHAIN_ID="testchain-1"
GAIA_KEYRING_BACKEND="test"

# and later just use
gaia tx ... --from=<key name>
```

## 配置

应用程序的根命令使用`PersistentPreRun()` cobra 命令属性来执行命令非常重要，这样所有子命令都可以访问服务器和客户端上下文。这些上下文最初被设置为它们的默认值，并且可以在各自的`PersistentPreRun()`函数中进行修改，作用范围限定在命令内部。请注意，`client.Context`通常预先填充了可能对所有命令有用的“默认”值，如果需要，可以继承并覆盖这些值。

这是`simapp`中`PersistentPreRun()`函数的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L63-L86
```

`SetCmdClientContextHandler`调用通过`ReadPersistentCommandFlags`读取持久化标志，创建一个`client.Context`并将其设置在根命令的`Context`上。

`InterceptConfigsPreRunHandler`调用创建一个viper字面量，默认`server.Context`和一个日志记录器，并将其设置在根命令的`Context`上。`server.Context`将被修改并保存到磁盘上。内部的`interceptConfigs`调用根据提供的主目录路径读取或创建一个CometBFT配置。此外，`interceptConfigs`还读取和加载应用程序配置`app.toml`，并将其绑定到`server.Context`的viper字面量上。这对于应用程序不仅可以访问CLI标志，还可以访问此文件提供的应用程序配置值至关重要。

:::tip
当希望配置使用哪个日志记录器时，请不要使用`InterceptConfigsPreRunHandler`，该函数设置默认的SDK日志记录器，而是使用`InterceptConfigsAndCreateContext`并手动设置服务器上下文和日志记录器：

```diff
-return server.InterceptConfigsPreRunHandler(cmd, customAppTemplate, customAppConfig, customCMTConfig)

+serverCtx, err := server.InterceptConfigsAndCreateContext(cmd, customAppTemplate, customAppConfig, customCMTConfig)
+if err != nil {
+	return err
+}

+// overwrite default server logger
+logger, err := server.CreateSDKLogger(serverCtx, cmd.OutOrStdout())
+if err != nil {
+	return err
+}
+serverCtx.Logger = logger.With(log.ModuleKey, "server")

+// set server context
+return server.SetCmdServerContext(cmd, serverCtx)
```

:::




# Command-Line Interface

:::note Synopsis
This document describes how command-line interface (CLI) works on a high-level, for an [**application**](../high-level-concepts/00-overview-app.md). A separate document for implementing a CLI for a Cosmos SDK [**module**](../../integrate/building-modules/00-intro.md) can be found [here](../../integrate/building-modules/09-module-interfaces.md#cli).
:::

## Command-Line Interface

### Example Command

There is no set way to create a CLI, but Cosmos SDK modules typically use the [Cobra Library](https://github.com/spf13/cobra). Building a CLI with Cobra entails defining commands, arguments, and flags. [**Commands**](#root-command) understand the actions users wish to take, such as `tx` for creating a transaction and `query` for querying the application. Each command can also have nested subcommands, necessary for naming the specific transaction type. Users also supply **Arguments**, such as account numbers to send coins to, and [**Flags**](#flags) to modify various aspects of the commands, such as gas prices or which node to broadcast to.

Here is an example of a command a user might enter to interact with the simapp CLI `simd` in order to send some tokens:

```bash
simd tx bank send $MY_VALIDATOR_ADDRESS $RECIPIENT 1000stake --gas auto --gas-prices <gasPrices>
```

The first four strings specify the command:

* The root command for the entire application `simd`.
* The subcommand `tx`, which contains all commands that let users create transactions.
* The subcommand `bank` to indicate which module to route the command to ([`x/bank`](../../integrate/modules/bank/README.md) module in this case).
* The type of transaction `send`.

The next two strings are arguments: the `from_address` the user wishes to send from, the `to_address` of the recipient, and the `amount` they want to send. Finally, the last few strings of the command are optional flags to indicate how much the user is willing to pay in fees (calculated using the amount of gas used to execute the transaction and the gas prices provided by the user).

The CLI interacts with a [node](03-node.md) to handle this command. The interface itself is defined in a `main.go` file.

### Building the CLI

The `main.go` file needs to have a `main()` function that creates a root command, to which all the application commands will be added as subcommands. The root command additionally handles:

* **setting configurations** by reading in configuration files (e.g. the Cosmos SDK config file).
* **adding any flags** to it, such as `--chain-id`.
* **instantiating the `codec`** by calling the application's `MakeCodec()` function (called `MakeTestEncodingConfig` in `simapp`). The [`codec`](06-encoding.md) is used to encode and decode data structures for the application - stores can only persist `[]byte`s so the developer must define a serialization format for their data structures or use the default, Protobuf.
* **adding subcommand** for all the possible user interactions, including [transaction commands](#transaction-commands) and [query commands](#query-commands).

The `main()` function finally creates an executor and [execute](https://pkg.go.dev/github.com/spf13/cobra#Command.Execute) the root command. See an example of `main()` function from the `simapp` application:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/main.go#L12-L24
```

The rest of the document will detail what needs to be implemented for each step and include smaller portions of code from the `simapp` CLI files.

## Adding Commands to the CLI

Every application CLI first constructs a root command, then adds functionality by aggregating subcommands (often with further nested subcommands) using `rootCmd.AddCommand()`. The bulk of an application's unique capabilities lies in its transaction and query commands, called `TxCmd` and `QueryCmd` respectively.

### Root Command

The root command (called `rootCmd`) is what the user first types into the command line to indicate which application they wish to interact with. The string used to invoke the command (the "Use" field) is typically the name of the application suffixed with `-d`, e.g. `simd` or `gaiad`. The root command typically includes the following commands to support basic functionality in the application.

* **Status** command from the Cosmos SDK rpc client tools, which prints information about the status of the connected [`Node`](03-node.md). The Status of a node includes `NodeInfo`,`SyncInfo` and `ValidatorInfo`.
* **Keys** [commands](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/keys) from the Cosmos SDK client tools, which includes a collection of subcommands for using the key functions in the Cosmos SDK crypto tools, including adding a new key and saving it to the keyring, listing all public keys stored in the keyring, and deleting a key. For example, users can type `simd keys add <name>` to add a new key and save an encrypted copy to the keyring, using the flag `--recover` to recover a private key from a seed phrase or the flag `--multisig` to group multiple keys together to create a multisig key. For full details on the `add` key command, see the code [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/keys/add.go). For more details about usage of `--keyring-backend` for storage of key credentials look at the [keyring docs](../../user/run-node/00-keyring.md).
* **Server** commands from the Cosmos SDK server package. These commands are responsible for providing the mechanisms necessary to start an ABCI CometBFT application and provides the CLI framework (based on [cobra](https://github.com/spf13/cobra)) necessary to fully bootstrap an application. The package exposes two core functions: `StartCmd` and `ExportCmd` which creates commands to start the application and export state respectively.
Learn more [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server).
* [**Transaction**](#transaction-commands) commands.
* [**Query**](#query-commands) commands.

Next is an example `rootCmd` function from the `simapp` application. It instantiates the root command, adds a [*persistent* flag](#flags) and `PreRun` function to be run before every execution, and adds all of the necessary subcommands.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L38-L92
```

`rootCmd` has a function called `initAppConfig()` which is useful for setting the application's custom configs.
By default app uses CometBFT app config template from Cosmos SDK, which can be over-written via `initAppConfig()`.
Here's an example code to override default `app.toml` template.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L106-L161
```

The `initAppConfig()` also allows overriding the default Cosmos SDK's [server config](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/config/config.go#L235). One example is the `min-gas-prices` config, which defines the minimum gas prices a validator is willing to accept for processing a transaction. By default, the Cosmos SDK sets this parameter to `""` (empty string), which forces all validators to tweak their own `app.toml` and set a non-empty value, or else the node will halt on startup. This might not be the best UX for validators, so the chain developer can set a default `app.toml` value for validators inside this `initAppConfig()` function.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L126-L142
```

The root-level `status` and `keys` subcommands are common across most applications and do not interact with application state. The bulk of an application's functionality - what users can actually *do* with it - is enabled by its `tx` and `query` commands.

### Transaction Commands

[Transactions](01-transactions.md) are objects wrapping [`Msg`s](../../integrate/building-modules/02-messages-and-queries.md#messages) that trigger state changes. To enable the creation of transactions using the CLI interface, a function `txCommand` is generally added to the `rootCmd`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L177-L184
```

This `txCommand` function adds all the transaction available to end-users for the application. This typically includes:

* **Sign command** from the [`auth`](../../integrate/modules/auth/README.md) module that signs messages in a transaction. To enable multisig, add the `auth` module's `MultiSign` command. Since every transaction requires some sort of signature in order to be valid, the signing command is necessary for every application.
* **Broadcast command** from the Cosmos SDK client tools, to broadcast transactions.
* **All [module transaction commands](../../integrate/building-modules/09-module-interfaces.md#transaction-commands)** the application is dependent on, retrieved by using the [basic module manager's](../../integrate/building-modules/01-module-manager.md#basic-manager) `AddTxCommands()` function.

Here is an example of a `txCommand` aggregating these subcommands from the `simapp` application:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L227-L251
```

### Query Commands

[**Queries**](../../integrate/building-modules/02-messages-and-queries.md#queries) are objects that allow users to retrieve information about the application's state. To enable the creation of queries using the CLI interface, a function `queryCommand` is generally added to the `rootCmd`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L177-L184
```

This `queryCommand` function adds all the queries available to end-users for the application. This typically includes:

* **QueryTx** and/or other transaction query commands] from the `auth` module which allow the user to search for a transaction by inputting its hash, a list of tags, or a block height. These queries allow users to see if transactions have been included in a block.
* **Account command** from the `auth` module, which displays the state (e.g. account balance) of an account given an address.
* **Validator command** from the Cosmos SDK rpc client tools, which displays the validator set of a given height.
* **Block command** from the Cosmos SDK RPC client tools, which displays the block data for a given height.
* **All [module query commands](../../integrate/building-modules/09-module-interfaces.md#query-commands)** the application is dependent on, retrieved by using the [basic module manager's](../../integrate/building-modules/01-module-manager.md#basic-manager) `AddQueryCommands()` function.

Here is an example of a `queryCommand` aggregating subcommands from the `simapp` application:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L204-L225
```

## Flags

Flags are used to modify commands; developers can include them in a `flags.go` file with their CLI. Users can explicitly include them in commands or pre-configure them by inside their [`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml). Commonly pre-configured flags include the `--node` to connect to and `--chain-id` of the blockchain the user wishes to interact with.

A *persistent* flag (as opposed to a *local* flag) added to a command transcends all of its children: subcommands will inherit the configured values for these flags. Additionally, all flags have default values when they are added to commands; some toggle an option off but others are empty values that the user needs to override to create valid commands. A flag can be explicitly marked as *required* so that an error is automatically thrown if the user does not provide a value, but it is also acceptable to handle unexpected missing flags differently.

Flags are added to commands directly (generally in the [module's CLI file](../../integrate/building-modules/09-module-interfaces.md#flags) where module commands are defined) and no flag except for the `rootCmd` persistent flags has to be added at application level. It is common to add a *persistent* flag for `--chain-id`, the unique identifier of the blockchain the application pertains to, to the root command. Adding this flag can be done in the `main()` function. Adding this flag makes sense as the chain ID should not be changing across commands in this application CLI.

## Environment variables

Each flag is bound to it's respecteve named environment variable. Then name of the environment variable consist of two parts - capital case `basename` followed by flag name of the flag. `-` must be substituted with `_`. For example flag `--home` for application with basename `GAIA` is bound to `GAIA_HOME`. It allows reducing the amount of flags typed for routine operations. For example instead of:

```shell
gaia --home=./ --node=<node address> --chain-id="testchain-1" --keyring-backend=test tx ... --from=<key name>
```

this will be more convenient:

```shell
# define env variables in .env, .envrc etc
GAIA_HOME=<path to home>
GAIA_NODE=<node address>
GAIA_CHAIN_ID="testchain-1"
GAIA_KEYRING_BACKEND="test"

# and later just use
gaia tx ... --from=<key name>
```

## Configurations

It is vital that the root command of an application uses `PersistentPreRun()` cobra command property for executing the command, so all child commands have access to the server and client contexts. These contexts are set as their default values initially and maybe modified, scoped to the command, in their respective `PersistentPreRun()` functions. Note that the `client.Context` is typically pre-populated with "default" values that may be useful for all commands to inherit and override if necessary.

Here is an example of an `PersistentPreRun()` function from `simapp`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L63-L86
```

The `SetCmdClientContextHandler` call reads persistent flags via `ReadPersistentCommandFlags` which creates a `client.Context` and sets that on the root command's `Context`.

The `InterceptConfigsPreRunHandler` call creates a viper literal, default `server.Context`, and a logger and sets that on the root command's `Context`. The `server.Context` will be modified and saved to disk. The internal `interceptConfigs` call reads or creates a CometBFT configuration based on the home path provided. In addition, `interceptConfigs` also reads and loads the application configuration, `app.toml`, and binds that to the `server.Context` viper literal. This is vital so the application can get access to not only the CLI flags, but also to the application configuration values provided by this file.

:::tip
When willing to configure which logger is used, do not to use `InterceptConfigsPreRunHandler`, which sets the default SDK logger, but instead use `InterceptConfigsAndCreateContext` and set the server context and the logger manually:

```diff
-return server.InterceptConfigsPreRunHandler(cmd, customAppTemplate, customAppConfig, customCMTConfig)

+serverCtx, err := server.InterceptConfigsAndCreateContext(cmd, customAppTemplate, customAppConfig, customCMTConfig)
+if err != nil {
+	return err
+}

+// overwrite default server logger
+logger, err := server.CreateSDKLogger(serverCtx, cmd.OutOrStdout())
+if err != nil {
+	return err
+}
+serverCtx.Logger = logger.With(log.ModuleKey, "server")

+// set server context
+return server.SetCmdServerContext(cmd, serverCtx)
```

:::
