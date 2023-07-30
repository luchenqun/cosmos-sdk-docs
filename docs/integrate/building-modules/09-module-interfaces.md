# 模块接口

:::note 概要
本文档详细介绍了如何为模块构建CLI和REST接口。包括来自各种Cosmos SDK模块的示例。
:::

:::note

### 先决条件阅读

* [构建模块简介](00-intro.md)

:::

## CLI

应用程序的主要接口之一是[命令行界面](../../develop/advanced-concepts/07-cli.md)。此入口点添加了来自应用程序模块的命令，使最终用户能够创建包装在交易中的[**消息**](02-messages-and-queries.md#messages)和[**查询**](02-messages-and-queries.md#queries)。CLI文件通常位于模块的`./client/cli`文件夹中。

### 交易命令

为了创建触发状态更改的消息，最终用户必须创建包装和传递消息的[交易](../../develop/advanced-concepts/01-transactions.md)。交易命令创建包含一个或多个消息的交易。

交易命令通常有自己的`tx.go`文件，位于模块的`./client/cli`文件夹中。命令在getter函数中指定，函数的名称应包含命令的名称。

以下是来自`x/bank`模块的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/client/cli/tx.go#L35-L71
```

在示例中，`NewSendTxCmd()`创建并返回一个用于包装和传递`MsgSend`的交易命令。`MsgSend`是用于从一个账户发送代币到另一个账户的消息。

通常，getter函数执行以下操作：

* **构建命令：** 阅读[Cobra文档](https://pkg.go.dev/github.com/spf13/cobra)以获取有关如何创建命令的更详细信息。
    * **Use：** 指定调用命令所需的用户输入的格式。在上面的示例中，`send`是交易命令的名称，`[from_key_or_address]`、`[to_address]`和`[amount]`是参数。
    * **Args：** 用户提供的参数数量。在这种情况下，有三个参数：`[from_key_or_address]`、`[to_address]`和`[amount]`。
    * **Short和Long：** 命令的描述。需要提供`Short`描述。可以使用`Long`描述来提供附加信息，当用户添加`--help`标志时会显示该信息。
    * **RunE：** 定义一个可以返回错误的函数。这是在执行命令时调用的函数。此函数封装了创建新交易的所有逻辑。
        * 该函数通常从`client.GetClientTxContext(cmd)`获取`clientCtx`。`clientCtx`包含与交易处理相关的信息，包括有关用户的信息。在此示例中，使用`clientCtx.GetFromAddress()`检索发送者的地址。
        * 如果适用，解析命令的参数。在此示例中，解析了`[to_address]`和`[amount]`参数。
        * 使用解析的参数和`clientCtx`中的信息创建[消息](02-messages-and-queries.md)。直接调用消息类型的构造函数。在这种情况下，调用`types.NewMsgSend(fromAddr, toAddr, amount)`。在广播消息之前，最好调用必要的[消息验证方法](Validation)。
        * 根据用户的需求，交易要么在离线状态下生成，要么签名并通过`tx.GenerateOrBroadcastTxCLI(clientCtx, flags, msg)`广播到预配置的节点。
* **添加交易标志：** 所有交易命令必须添加一组交易[标志](#flags)。交易标志用于从用户收集附加信息（例如用户愿意支付的费用金额）。使用`AddTxFlagsToCmd(cmd)`将交易标志添加到构建的命令中。
* **返回命令：** 最后，返回交易命令。

每个模块都必须实现 `NewTxCmd()` 方法，该方法聚合了模块的所有交易命令。以下是 `x/bank` 模块的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/client/cli/tx.go#L17-L33
```

每个模块还必须为 `AppModuleBasic` 实现 `GetTxCmd()` 方法，该方法简单地返回 `NewTxCmd()`。这样，根命令可以轻松地聚合每个模块的所有交易命令。以下是示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/module.go#L79-L82
```

### 查询命令

[查询](02-messages-and-queries.md#queries) 允许用户收集有关应用程序或网络状态的信息；它们由应用程序路由并由定义它们的模块进行处理。查询命令通常在模块的 `./client/cli` 文件夹中有自己的 `query.go` 文件。与交易命令一样，它们在 getter 函数中指定。以下是 `x/auth` 模块的查询命令示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/client/cli/query.go#L86-L128
```

在示例中，`GetAccountCmd()` 创建并返回一个查询命令，该命令基于提供的账户地址返回账户的状态。

通常，getter 函数执行以下操作：

* **构建命令：** 阅读 [Cobra 文档](https://pkg.go.dev/github.com/spf13/cobra) 以获取有关如何创建命令的更详细信息。
    * **Use：** 指定调用命令所需的用户输入的格式。在上面的示例中，`account` 是查询命令的名称，`[address]` 是参数。
    * **Args：** 用户提供的参数数量。在此情况下，恰好为一个：`[address]`。
    * **Short 和 Long：** 命令的描述。`Short` 描述是必需的。`Long` 描述可用于提供附加信息，当用户添加 `--help` 标志时会显示该信息。
    * **RunE：** 定义一个可以返回错误的函数。这是在执行命令时调用的函数。此函数封装了创建新查询的所有逻辑。
        * 该函数通常从 `client.GetClientQueryContext(cmd)` 获取 `clientCtx`。`clientCtx` 包含与查询处理相关的信息。
        * 如果适用，解析命令的参数。在此示例中，解析了参数 `[address]`。
        * 使用 `NewQueryClient(clientCtx)` 初始化新的 `queryClient`。然后，使用 `queryClient` 调用适当的 [查询](02-messages-and-queries.md#grpc-queries)。
        * 使用 `clientCtx.PrintProto` 方法对 `proto.Message` 对象进行格式化，以便将结果打印回用户。
* **添加查询标志：** 所有查询命令都必须添加一组查询 [标志](#flags)。使用 `AddQueryFlagsToCmd(cmd)` 将查询标志添加到构建的命令中。
* **返回命令：** 最后，返回查询命令。

每个模块都必须实现 `GetQueryCmd()` 方法，该方法汇总了模块的所有查询命令。以下是 `x/auth` 模块的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/client/cli/query.go#L33-L53
```

每个模块还必须为 `AppModuleBasic` 实现 `GetQueryCmd()` 方法，该方法返回 `GetQueryCmd()` 函数。这样，根命令可以轻松地汇总每个模块的所有查询命令。以下是一个示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/module.go#L84-L87
```

### 标志

[标志](../../develop/advanced-concepts/07-cli.md#flags) 允许用户自定义命令。`--fees` 和 `--gas-prices` 是允许用户设置 [费用](../../develop/high-level-concepts/04-gas-fees.md) 和 gas 价格的标志的示例。

通常，在模块的 `./client/cli` 文件夹中的 `flags.go` 文件中创建特定于模块的标志。在创建标志时，开发人员设置值类型、标志名称、默认值和关于标志的描述。开发人员还可以选择将标志标记为 _required_，以便如果用户未包含标志的值，则抛出错误。

以下是向命令添加 `--from` 标志的示例：

```go
cmd.Flags().String(FlagFrom, "", "Name or address of private key with which to sign")
```

在此示例中，标志的值是 `String`，标志的名称是 `from`（`FlagFrom` 常量的值），标志的默认值是 `""`，并且在用户将 `--help` 添加到命令时将显示一个描述。

以下是将 `--from` 标志标记为 _required_ 的示例：

```go
cmd.MarkFlagRequired(FlagFrom)
```

有关创建标志的更详细信息，请访问 [Cobra 文档](https://github.com/spf13/cobra)。

如 [transaction commands](#transaction-commands) 中所述，所有事务命令都必须添加一组标志。这是通过 Cosmos SDK 的 `./client/flags` 包中定义的 `AddTxFlagsToCmd` 方法完成的。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/flags/flags.go#L108-L138
```

由于`AddTxFlagsToCmd(cmd *cobra.Command)`包含了事务命令所需的所有基本标志，模块开发者可以选择不添加任何自己的标志（通常更适合指定参数）。

类似地，还有一个`AddQueryFlagsToCmd(cmd *cobra.Command)`用于向模块查询命令添加常见标志。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/flags/flags.go#L95-L106
```

## gRPC

[gRPC](https://grpc.io/)是一种远程过程调用（RPC）框架。RPC是外部客户端（如钱包和交易所）与区块链交互的首选方式。

除了提供ABCI查询路径外，Cosmos SDK还提供了一个gRPC代理服务器，将gRPC查询请求路由到ABCI查询请求。

为了实现这一点，模块必须在`AppModuleBasic`上实现`RegisterGRPCGatewayRoutes(clientCtx client.Context, mux *runtime.ServeMux)`，将客户端gRPC请求连接到模块内正确的处理程序。

以下是`x/auth`模块的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/module.go#L71-L76
```

## gRPC-gateway REST

应用程序需要支持使用HTTP请求的Web服务（例如像[Keplr](https://keplr.app)这样的Web钱包）。[grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway)将REST调用转换为gRPC调用，这对于不使用gRPC的客户端可能很有用。

希望公开REST查询的模块应向其`rpc`方法添加`google.api.http`注释，如下面的示例所示，来自`x/auth`模块：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/auth/v1beta1/query.proto#L14-L89
```

gRPC网关与应用程序和CometBFT一起在进程中启动。可以通过在[`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml)中设置gRPC配置`enable`来启用或禁用它。

Cosmos SDK 提供了一个用于生成 [Swagger](https://swagger.io/) 文档的命令 (`protoc-gen-swagger`)。在 [`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml) 中设置 `swagger` 可以定义是否自动注册 Swagger 文档。




# Module Interfaces

:::note Synopsis
This document details how to build CLI and REST interfaces for a module. Examples from various Cosmos SDK modules are included.
:::

:::note

### Pre-requisite Readings

* [Building Modules Intro](00-intro.md)

:::

## CLI

One of the main interfaces for an application is the [command-line interface](../../develop/advanced-concepts/07-cli.md). This entrypoint adds commands from the application's modules enabling end-users to create [**messages**](02-messages-and-queries.md#messages) wrapped in transactions and [**queries**](02-messages-and-queries.md#queries). The CLI files are typically found in the module's `./client/cli` folder.

### Transaction Commands

In order to create messages that trigger state changes, end-users must create [transactions](../../develop/advanced-concepts/01-transactions.md) that wrap and deliver the messages. A transaction command creates a transaction that includes one or more messages.

Transaction commands typically have their own `tx.go` file that lives within the module's `./client/cli` folder. The commands are specified in getter functions and the name of the function should include the name of the command.

Here is an example from the `x/bank` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/client/cli/tx.go#L35-L71
```

In the example, `NewSendTxCmd()` creates and returns the transaction command for a transaction that wraps and delivers `MsgSend`. `MsgSend` is the message used to send tokens from one account to another.

In general, the getter function does the following:

* **Constructs the command:** Read the [Cobra Documentation](https://pkg.go.dev/github.com/spf13/cobra) for more detailed information on how to create commands.
    * **Use:** Specifies the format of the user input required to invoke the command. In the example above, `send` is the name of the transaction command and `[from_key_or_address]`, `[to_address]`, and `[amount]` are the arguments.
    * **Args:** The number of arguments the user provides. In this case, there are exactly three: `[from_key_or_address]`, `[to_address]`, and `[amount]`.
    * **Short and Long:** Descriptions for the command. A `Short` description is expected. A `Long` description can be used to provide additional information that is displayed when a user adds the `--help` flag.
    * **RunE:** Defines a function that can return an error. This is the function that is called when the command is executed. This function encapsulates all of the logic to create a new transaction.
        * The function typically starts by getting the `clientCtx`, which can be done with `client.GetClientTxContext(cmd)`. The `clientCtx` contains information relevant to transaction handling, including information about the user. In this example, the `clientCtx` is used to retrieve the address of the sender by calling `clientCtx.GetFromAddress()`.
        * If applicable, the command's arguments are parsed. In this example, the arguments `[to_address]` and `[amount]` are both parsed.
        * A [message](02-messages-and-queries.md) is created using the parsed arguments and information from the `clientCtx`. The constructor function of the message type is called directly. In this case, `types.NewMsgSend(fromAddr, toAddr, amount)`. Its good practice to call, if possible, the necessary [message validation methods](Validation) before broadcasting the message.
        * Depending on what the user wants, the transaction is either generated offline or signed and broadcasted to the preconfigured node using `tx.GenerateOrBroadcastTxCLI(clientCtx, flags, msg)`.
* **Adds transaction flags:** All transaction commands must add a set of transaction [flags](#flags). The transaction flags are used to collect additional information from the user (e.g. the amount of fees the user is willing to pay). The transaction flags are added to the constructed command using `AddTxFlagsToCmd(cmd)`.
* **Returns the command:** Finally, the transaction command is returned.

Each module must implement `NewTxCmd()`, which aggregates all of the transaction commands of the module. Here is an example from the `x/bank` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/client/cli/tx.go#L17-L33
```

Each module must also implement the `GetTxCmd()` method for `AppModuleBasic` that simply returns `NewTxCmd()`. This allows the root command to easily aggregate all of the transaction commands for each module. Here is an example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/module.go#L79-L82
```

### Query Commands

[Queries](02-messages-and-queries.md#queries) allow users to gather information about the application or network state; they are routed by the application and processed by the module in which they are defined. Query commands typically have their own `query.go` file in the module's `./client/cli` folder. Like transaction commands, they are specified in getter functions. Here is an example of a query command from the `x/auth` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/client/cli/query.go#L86-L128
```

In the example, `GetAccountCmd()` creates and returns a query command that returns the state of an account based on the provided account address.

In general, the getter function does the following:

* **Constructs the command:** Read the [Cobra Documentation](https://pkg.go.dev/github.com/spf13/cobra) for more detailed information on how to create commands.
    * **Use:** Specifies the format of the user input required to invoke the command. In the example above, `account` is the name of the query command and `[address]` is the argument.
    * **Args:** The number of arguments the user provides. In this case, there is exactly one: `[address]`.
    * **Short and Long:** Descriptions for the command. A `Short` description is expected. A `Long` description can be used to provide additional information that is displayed when a user adds the `--help` flag.
    * **RunE:** Defines a function that can return an error. This is the function that is called when the command is executed. This function encapsulates all of the logic to create a new query.
        * The function typically starts by getting the `clientCtx`, which can be done with `client.GetClientQueryContext(cmd)`. The `clientCtx` contains information relevant to query handling.
        * If applicable, the command's arguments are parsed. In this example, the argument `[address]` is parsed.
        * A new `queryClient` is initialized using `NewQueryClient(clientCtx)`. The `queryClient` is then used to call the appropriate [query](02-messages-and-queries.md#grpc-queries).
        * The `clientCtx.PrintProto` method is used to format the `proto.Message` object so that the results can be printed back to the user.
* **Adds query flags:** All query commands must add a set of query [flags](#flags). The query flags are added to the constructed command using `AddQueryFlagsToCmd(cmd)`.
* **Returns the command:** Finally, the query command is returned.

Each module must implement `GetQueryCmd()`, which aggregates all of the query commands of the module. Here is an example from the `x/auth` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/client/cli/query.go#L33-L53
```

Each module must also implement the `GetQueryCmd()` method for `AppModuleBasic` that returns the `GetQueryCmd()` function. This allows for the root command to easily aggregate all of the query commands for each module. Here is an example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/module.go#L84-L87
```

### Flags

[Flags](../../develop/advanced-concepts/07-cli.md#flags) allow users to customize commands. `--fees` and `--gas-prices` are examples of flags that allow users to set the [fees](../../develop/high-level-concepts/04-gas-fees.md) and gas prices for their transactions.

Flags that are specific to a module are typically created in a `flags.go` file in the module's `./client/cli` folder. When creating a flag, developers set the value type, the name of the flag, the default value, and a description about the flag. Developers also have the option to mark flags as _required_ so that an error is thrown if the user does not include a value for the flag.

Here is an example that adds the `--from` flag to a command:

```go
cmd.Flags().String(FlagFrom, "", "Name or address of private key with which to sign")
```

In this example, the value of the flag is a `String`, the name of the flag is `from` (the value of the `FlagFrom` constant), the default value of the flag is `""`, and there is a description that will be displayed when a user adds `--help` to the command.

Here is an example that marks the `--from` flag as _required_:

```go
cmd.MarkFlagRequired(FlagFrom)
```

For more detailed information on creating flags, visit the [Cobra Documentation](https://github.com/spf13/cobra).

As mentioned in [transaction commands](#transaction-commands), there is a set of flags that all transaction commands must add. This is done with the `AddTxFlagsToCmd` method defined in the Cosmos SDK's `./client/flags` package.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/flags/flags.go#L108-L138
```

Since `AddTxFlagsToCmd(cmd *cobra.Command)` includes all of the basic flags required for a transaction command, module developers may choose not to add any of their own (specifying arguments instead may often be more appropriate).

Similarly, there is a `AddQueryFlagsToCmd(cmd *cobra.Command)` to add common flags to a module query command.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/flags/flags.go#L95-L106
```

## gRPC

[gRPC](https://grpc.io/) is a Remote Procedure Call (RPC) framework. RPC is the preferred way for external clients like wallets and exchanges to interact with a blockchain.

In addition to providing an ABCI query pathway, the Cosmos SDK provides a gRPC proxy server that routes gRPC query requests to ABCI query requests.

In order to do that, modules must implement `RegisterGRPCGatewayRoutes(clientCtx client.Context, mux *runtime.ServeMux)` on `AppModuleBasic` to wire the client gRPC requests to the correct handler inside the module.

Here's an example from the `x/auth` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/module.go#L71-L76
```

## gRPC-gateway REST

Applications need to support web services that use HTTP requests (e.g. a web wallet like [Keplr](https://keplr.app)). [grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway) translates REST calls into gRPC calls, which might be useful for clients that do not use gRPC.

Modules that want to expose REST queries should add `google.api.http` annotations to their `rpc` methods, such as in the example below from the `x/auth` module:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/auth/v1beta1/query.proto#L14-L89
```

gRPC gateway is started in-process along with the application and CometBFT. It can be enabled or disabled by setting gRPC Configuration `enable` in [`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml).

The Cosmos SDK provides a command for generating [Swagger](https://swagger.io/) documentation (`protoc-gen-swagger`). Setting `swagger` in [`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml) defines if swagger documentation should be automatically registered.
