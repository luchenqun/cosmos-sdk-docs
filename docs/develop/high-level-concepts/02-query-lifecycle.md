# 查询生命周期

:::note 概述
本文档描述了 Cosmos SDK 应用程序中查询的生命周期，从用户界面到应用程序存储再返回。查询被称为 `MyQuery`。
:::

:::note

### 先决条件阅读

* [交易生命周期](01-tx-lifecycle.md)
:::

## 查询创建

[**查询**](../../integrate/building-modules/02-messages-and-queries.md#queries)是应用程序最终用户通过接口发出的信息请求，并由全节点进行处理。用户可以查询有关网络、应用程序本身以及应用程序状态的信息，直接从应用程序的存储或模块中查询。请注意，查询与[交易](../advanced-concepts/01-transactions.md)（查看生命周期[此处](01-tx-lifecycle.md)）不同，特别是它们不需要共识来进行处理（因为它们不触发状态转换）；它们可以完全由一个全节点处理。

为了解释查询的生命周期，假设查询 `MyQuery` 请求的是应用程序 `simapp` 中某个委托人地址所做的委托列表。正如预期的那样，[`staking`](../../integrate/modules/staking/README.md) 模块处理此查询。但首先，`MyQuery` 可以通过以下几种方式由用户创建。

### 命令行界面（CLI）

应用程序的主要界面是命令行界面。用户连接到全节点并直接从其计算机上运行 CLI - CLI 直接与全节点交互。要从终端创建 `MyQuery`，用户输入以下命令：

```bash
simd query staking delegations <delegatorAddress>
```

此查询命令由 [`staking`](../../integrate/modules/staking/README.md) 模块开发人员定义，并在创建 CLI 时由应用程序开发人员添加到子命令列表中。

请注意，一般格式如下：

```bash
simd query [moduleName] [command] <arguments> --flag <flagArg>
```

要提供诸如 `--node`（CLI 连接的全节点）之类的值，用户可以使用 [`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml) 配置文件进行设置，或者作为标志提供。

CLI理解一组特定的命令，由应用程序开发者按照层次结构定义：从[根命令](../advanced-concepts/07-cli.md#root-command) (`simd`)，命令类型 (`Myquery`)，包含命令的模块 (`staking`)，到命令本身 (`delegations`)。因此，CLI确切地知道哪个模块处理该命令，并直接将调用传递给该模块。

### gRPC

用户可以通过[gRPC](https://grpc.io)请求到[gRPC服务器](../advanced-concepts/09-grpc_rest.md#grpc-server)来进行查询。这些端点在`.proto`文件中定义为[Protocol Buffers](https://developers.google.com/protocol-buffers)服务方法，使用Protobuf自己的语言无关接口定义语言（IDL）编写。Protobuf生态系统开发了从`*.proto`文件生成各种语言代码的工具。这些工具可以轻松构建gRPC客户端。

其中一个工具是[grpcurl](https://github.com/fullstorydev/grpcurl)，使用该客户端进行`MyQuery`的gRPC请求如下所示：

```bash
grpcurl \
    -plaintext                                           # We want results in plain test
    -import-path ./proto \                               # Import these .proto files
    -proto ./proto/cosmos/staking/v1beta1/query.proto \  # Look into this .proto file for the Query protobuf service
    -d '{"address":"$MY_DELEGATOR"}' \                   # Query arguments
    localhost:9090 \                                     # gRPC server endpoint
    cosmos.staking.v1beta1.Query/Delegations             # Fully-qualified service method name
```

### REST

用户还可以通过HTTP请求到[REST服务器](../advanced-concepts/09-grpc_rest.md#rest-server)进行查询。REST服务器是从Protobuf服务完全自动生成的，使用[gRPC-gateway](https://github.com/grpc-ecosystem/grpc-gateway)。

`MyQuery`的一个示例HTTP请求如下所示：

```bash
GET http://localhost:1317/cosmos/staking/v1beta1/delegators/{delegatorAddr}/delegations
```

## CLI如何处理查询

前面的示例展示了外部用户如何通过查询节点的状态与节点进行交互。为了更详细地了解查询的确切生命周期，让我们深入了解CLI如何准备查询以及节点如何处理查询。用户的交互角度有所不同，但底层功能几乎相同，因为它们是由模块开发者定义的相同命令的实现。这个处理步骤发生在CLI、gRPC或REST服务器内部，并且大量涉及`client.Context`。

### 上下文

在执行 CLI 命令时，首先创建的是一个 `client.Context`。`client.Context` 是一个对象，用于存储处理用户请求所需的所有数据。特别是，`client.Context` 存储了以下内容：

* **编解码器（Codec）**：应用程序使用的[编码器/解码器](../advanced-concepts/06-encoding.md)，用于在进行 CometBFT RPC 请求之前对参数和查询进行编组，并将返回的响应解组为 JSON 对象。CLI 使用的默认编解码器是 Protobuf。
* **账户解码器（Account Decoder）**：来自 [`auth`](../../integrate/modules/auth/README.md) 模块的账户解码器，用于将 `[]byte` 转换为账户。
* **RPC 客户端（RPC Client）**：CometBFT RPC 客户端或节点，用于中继请求。
* **密钥环（Keyring）**：用于签署交易和处理其他密钥操作的[密钥管理器](03-accounts.md#keyring)。
* **输出写入器（Output Writer）**：用于输出响应的[写入器](https://pkg.go.dev/io/#Writer)。
* **配置项（Configurations）**：用户为此命令配置的标志，包括 `--height`，用于指定要查询的区块链的高度，以及 `--indent`，用于指示在 JSON 响应中添加缩进。

`client.Context` 还包含各种函数，例如 `Query()`，用于检索 RPC 客户端并发出 ABCI 调用，以将查询中继到全节点。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/context.go#L24-L64
```

`client.Context` 的主要作用是存储与最终用户交互期间使用的数据，并提供与这些数据交互的方法 - 它在查询被全节点处理之前和之后使用。具体而言，在处理 `MyQuery` 时，会利用 `client.Context` 对查询参数进行编码、检索全节点并写入输出。在中继到全节点之前，查询需要被编码为 `[]byte` 形式，因为全节点是应用程序无关的，无法理解特定类型。使用 `client.Context` 检索全节点（RPC 客户端），该客户端知道用户 CLI 连接的节点。将查询中继到此全节点进行处理。最后，`client.Context` 包含一个 `Writer`，用于在返回响应时写入输出。这些步骤将在后面的章节中进一步描述。

### 参数和路由创建

在生命周期的这个阶段，用户已经创建了一个包含他们希望在查询中包含的所有数据的 CLI 命令。`client.Context` 存在于 `MyQuery` 的其余旅程中提供帮助。现在，下一步是解析命令或请求，提取参数并对所有内容进行编码。所有这些步骤都在用户端在他们正在交互的界面中进行。

#### 编码

在我们的例子中（查询地址的委托），`MyQuery` 作为其唯一参数包含一个 [地址](03-accounts.md#addresses) `delegatorAddress`。然而，请求只能包含 `[]byte`，因为它最终被中继到没有应用类型固有知识的全节点的共识引擎（例如 CometBFT）。因此，使用 `client.Context` 的 `codec` 对地址进行编组。

以下是 CLI 命令的代码示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/client/cli/query.go#L323-L326
```

#### gRPC 查询客户端创建

Cosmos SDK 利用从 Protobuf 服务生成的代码进行查询。`staking` 模块的 `MyQuery` 服务生成一个 `queryClient`，CLI 使用它进行查询。以下是相关代码：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/client/cli/query.go#L317-L343
```

在底层，`client.Context` 有一个 `Query()` 函数用于检索预配置的节点并将查询中继到它；该函数将查询的完全限定服务方法名称作为路径（在我们的例子中为：`/cosmos.staking.v1beta1.Query/Delegations`），并将参数作为参数。它首先检索由用户配置的 RPC 客户端（称为 [**节点**](../advanced-concepts/03-node.md)）以将此查询中继到，并创建 `ABCIQueryOptions`（格式化为 ABCI 调用的参数）。然后使用该节点进行 ABCI 调用，`ABCIQueryWithOptions()`。

以下是代码示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/query.go#L79-L113
```

## RPC

通过调用`ABCIQueryWithOptions()`，`MyQuery`被[全节点](../advanced-concepts/06-encoding.md)接收，然后处理请求。请注意，尽管RPC是发送到全节点的共识引擎（例如CometBFT），但查询不是共识的一部分，因此不会广播到网络的其他部分，因为它们不需要网络达成一致。

在[CometBFT文档](https://docs.cometbft.com/v0.37/spec/rpc/)中了解有关ABCI客户端和CometBFT RPC的更多信息。

## 应用程序查询处理

当查询在从底层共识引擎中转发后被全节点接收时，它在一个理解应用程序特定类型并具有状态副本的环境中进行处理。[`baseapp`](../advanced-concepts/00-baseapp.md)实现了ABCI [`Query()`](../advanced-concepts/00-baseapp.md#query)函数并处理gRPC查询。查询路由被解析，并且它匹配现有服务方法的完全限定服务方法名称（很可能在一个模块中），然后`baseapp`将请求转发给相关模块。

由于`MyQuery`具有来自`staking`模块的Protobuf完全限定服务方法名称（回想一下`/cosmos.staking.v1beta1.Query/Delegations`），`baseapp`首先解析路径，然后使用自己内部的`GRPCQueryRouter`来检索相应的gRPC处理程序，并将查询路由到模块。gRPC处理程序负责识别此查询，从应用程序的存储中检索适当的值，并返回响应。在[这里](../../integrate/building-modules/04-query-services.md)了解更多关于查询服务的信息。

一旦从查询器接收到结果，`baseapp`开始返回响应给用户的过程。

## 响应

由于`Query()`是一个ABCI函数，`baseapp`将响应作为[`abci.ResponseQuery`](https://docs.cometbft.com/master/spec/abci/abci.html#query-2)类型返回。`client.Context`的`Query()`例程接收响应并。

### CLI响应

应用程序[`codec`](../advanced-concepts/06-encoding.md)用于将响应解组为JSON，并且`client.Context`将输出打印到命令行，应用任何配置，如输出类型（文本、JSON或YAML）。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/context.go#L330-L358
```

就是这样！查询的结果通过CLI输出到控制台。


# Query Lifecycle

:::note Synopsis
This document describes the lifecycle of a query in a Cosmos SDK application, from the user interface to application stores and back. The query is referred to as `MyQuery`.
:::

:::note

### Pre-requisite Readings

* [Transaction Lifecycle](01-tx-lifecycle.md)
:::

## Query Creation

A [**query**](../../integrate/building-modules/02-messages-and-queries.md#queries) is a request for information made by end-users of applications through an interface and processed by a full-node. Users can query information about the network, the application itself, and application state directly from the application's stores or modules. Note that queries are different from [transactions](../advanced-concepts/01-transactions.md) (view the lifecycle [here](01-tx-lifecycle.md)), particularly in that they do not require consensus to be processed (as they do not trigger state-transitions); they can be fully handled by one full-node.

For the purpose of explaining the query lifecycle, let's say the query, `MyQuery`, is requesting a list of delegations made by a certain delegator address in the application called `simapp`. As is to be expected, the [`staking`](../../integrate/modules/staking/README.md) module handles this query. But first, there are a few ways `MyQuery` can be created by users.

### CLI

The main interface for an application is the command-line interface. Users connect to a full-node and run the CLI directly from their machines - the CLI interacts directly with the full-node. To create `MyQuery` from their terminal, users type the following command:

```bash
simd query staking delegations <delegatorAddress>
```

This query command was defined by the [`staking`](../../integrate/modules/staking/README.md) module developer and added to the list of subcommands by the application developer when creating the CLI.

Note that the general format is as follows:

```bash
simd query [moduleName] [command] <arguments> --flag <flagArg>
```

To provide values such as `--node` (the full-node the CLI connects to), the user can use the [`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml) config file to set them or provide them as flags.

The CLI understands a specific set of commands, defined in a hierarchical structure by the application developer: from the [root command](../advanced-concepts/07-cli.md#root-command) (`simd`), the type of command (`Myquery`), the module that contains the command (`staking`), and command itself (`delegations`). Thus, the CLI knows exactly which module handles this command and directly passes the call there.

### gRPC

Another interface through which users can make queries is [gRPC](https://grpc.io) requests to a [gRPC server](../advanced-concepts/09-grpc_rest.md#grpc-server). The endpoints are defined as [Protocol Buffers](https://developers.google.com/protocol-buffers) service methods inside `.proto` files, written in Protobuf's own language-agnostic interface definition language (IDL). The Protobuf ecosystem developed tools for code-generation from `*.proto` files into various languages. These tools allow to build gRPC clients easily.

One such tool is [grpcurl](https://github.com/fullstorydev/grpcurl), and a gRPC request for `MyQuery` using this client looks like:

```bash
grpcurl \
    -plaintext                                           # We want results in plain test
    -import-path ./proto \                               # Import these .proto files
    -proto ./proto/cosmos/staking/v1beta1/query.proto \  # Look into this .proto file for the Query protobuf service
    -d '{"address":"$MY_DELEGATOR"}' \                   # Query arguments
    localhost:9090 \                                     # gRPC server endpoint
    cosmos.staking.v1beta1.Query/Delegations             # Fully-qualified service method name
```

### REST

Another interface through which users can make queries is through HTTP Requests to a [REST server](../advanced-concepts/09-grpc_rest.md#rest-server). The REST server is fully auto-generated from Protobuf services, using [gRPC-gateway](https://github.com/grpc-ecosystem/grpc-gateway).

An example HTTP request for `MyQuery` looks like:

```bash
GET http://localhost:1317/cosmos/staking/v1beta1/delegators/{delegatorAddr}/delegations
```

## How Queries are Handled by the CLI

The preceding examples show how an external user can interact with a node by querying its state. To understand in more detail the exact lifecycle of a query, let's dig into how the CLI prepares the query, and how the node handles it. The interactions from the users' perspective are a bit different, but the underlying functions are almost identical because they are implementations of the same command defined by the module developer. This step of processing happens within the CLI, gRPC, or REST server, and heavily involves a `client.Context`.

### Context

The first thing that is created in the execution of a CLI command is a `client.Context`. A `client.Context` is an object that stores all the data needed to process a request on the user side. In particular, a `client.Context` stores the following:

* **Codec**: The [encoder/decoder](../advanced-concepts/06-encoding.md) used by the application, used to marshal the parameters and query before making the CometBFT RPC request and unmarshal the returned response into a JSON object. The default codec used by the CLI is Protobuf.
* **Account Decoder**: The account decoder from the [`auth`](../../integrate/modules/auth/README.md) module, which translates `[]byte`s into accounts.
* **RPC Client**: The CometBFT RPC Client, or node, to which requests are relayed.
* **Keyring**: A [Key Manager](03-accounts.md#keyring) used to sign transactions and handle other operations with keys.
* **Output Writer**: A [Writer](https://pkg.go.dev/io/#Writer) used to output the response.
* **Configurations**: The flags configured by the user for this command, including `--height`, specifying the height of the blockchain to query, and `--indent`, which indicates to add an indent to the JSON response.

The `client.Context` also contains various functions such as `Query()`, which retrieves the RPC Client and makes an ABCI call to relay a query to a full-node.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/context.go#L24-L64
```

The `client.Context`'s primary role is to store data used during interactions with the end-user and provide methods to interact with this data - it is used before and after the query is processed by the full-node. Specifically, in handling `MyQuery`, the `client.Context` is utilized to encode the query parameters, retrieve the full-node, and write the output. Prior to being relayed to a full-node, the query needs to be encoded into a `[]byte` form, as full-nodes are application-agnostic and do not understand specific types. The full-node (RPC Client) itself is retrieved using the `client.Context`, which knows which node the user CLI is connected to. The query is relayed to this full-node to be processed. Finally, the `client.Context` contains a `Writer` to write output when the response is returned. These steps are further described in later sections.

### Arguments and Route Creation

At this point in the lifecycle, the user has created a CLI command with all of the data they wish to include in their query. A `client.Context` exists to assist in the rest of the `MyQuery`'s journey. Now, the next step is to parse the command or request, extract the arguments, and encode everything. These steps all happen on the user side within the interface they are interacting with.

#### Encoding

In our case (querying an address's delegations), `MyQuery` contains an [address](03-accounts.md#addresses) `delegatorAddress` as its only argument. However, the request can only contain `[]byte`s, as it is ultimately relayed to a consensus engine (e.g. CometBFT) of a full-node that has no inherent knowledge of the application types. Thus, the `codec` of `client.Context` is used to marshal the address.

Here is what the code looks like for the CLI command:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/client/cli/query.go#L323-L326
```

#### gRPC Query Client Creation

The Cosmos SDK leverages code generated from Protobuf services to make queries. The `staking` module's `MyQuery` service generates a `queryClient`, which the CLI uses to make queries. Here is the relevant code:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/client/cli/query.go#L317-L343
```

Under the hood, the `client.Context` has a `Query()` function used to retrieve the pre-configured node and relay a query to it; the function takes the query fully-qualified service method name as path (in our case: `/cosmos.staking.v1beta1.Query/Delegations`), and arguments as parameters. It first retrieves the RPC Client (called the [**node**](../advanced-concepts/03-node.md)) configured by the user to relay this query to, and creates the `ABCIQueryOptions` (parameters formatted for the ABCI call). The node is then used to make the ABCI call, `ABCIQueryWithOptions()`.

Here is what the code looks like:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/query.go#L79-L113
```

## RPC

With a call to `ABCIQueryWithOptions()`, `MyQuery` is received by a [full-node](../advanced-concepts/06-encoding.md) which then processes the request. Note that, while the RPC is made to the consensus engine (e.g. CometBFT) of a full-node, queries are not part of consensus and so are not broadcasted to the rest of the network, as they do not require anything the network needs to agree upon.

Read more about ABCI Clients and CometBFT RPC in the [CometBFT documentation](https://docs.cometbft.com/v0.37/spec/rpc/).

## Application Query Handling

When a query is received by the full-node after it has been relayed from the underlying consensus engine, it is at that point being handled within an environment that understands application-specific types and has a copy of the state. [`baseapp`](../advanced-concepts/00-baseapp.md) implements the ABCI [`Query()`](../advanced-concepts/00-baseapp.md#query) function and handles gRPC queries. The query route is parsed, and it matches the fully-qualified service method name of an existing service method (most likely in one of the modules), then `baseapp` relays the request to the relevant module.

Since `MyQuery` has a Protobuf fully-qualified service method name from the `staking` module (recall `/cosmos.staking.v1beta1.Query/Delegations`), `baseapp` first parses the path, then uses its own internal `GRPCQueryRouter` to retrieve the corresponding gRPC handler, and routes the query to the module. The gRPC handler is responsible for recognizing this query, retrieving the appropriate values from the application's stores, and returning a response. Read more about query services [here](../../integrate/building-modules/04-query-services.md).

Once a result is received from the querier, `baseapp` begins the process of returning a response to the user.

## Response

Since `Query()` is an ABCI function, `baseapp` returns the response as an [`abci.ResponseQuery`](https://docs.cometbft.com/master/spec/abci/abci.html#query-2) type. The `client.Context` `Query()` routine receives the response and.

### CLI Response

The application [`codec`](../advanced-concepts/06-encoding.md) is used to unmarshal the response to a JSON and the `client.Context` prints the output to the command line, applying any configurations such as the output type (text, JSON or YAML).

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/context.go#L330-L358
```

And that's a wrap! The result of the query is outputted to the console by the CLI.
