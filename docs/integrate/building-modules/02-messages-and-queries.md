# 消息和查询

:::note 概要
`Msg`和`Query`是模块处理的两个主要对象。模块中定义的大多数核心组件，如`Msg`服务、`keeper`和`Query`服务，都存在于处理`message`和`query`的过程中。
:::

:::note

### 先决条件阅读

* [Cosmos SDK模块介绍](00-intro.md)

:::

## 消息

`Msg`是触发状态转换的对象。它们被包装在[交易](../../develop/advanced-concepts/01-transactions.md)中，一个交易可以包含一个或多个`Msg`。

当一个交易从底层共识引擎传递到Cosmos SDK应用程序时，首先由[`BaseApp`](../../develop/advanced-concepts/00-baseapp.md)对其进行解码。然后，事务中包含的每个消息都被提取出来，并通过`BaseApp`的`MsgServiceRouter`路由到适当的模块，以便模块的[`Msg`服务](03-msg-services.md)可以处理它。有关交易生命周期的更详细解释，请点击[这里](../../develop/high-level-concepts/01-tx-lifecycle.md)。

### `Msg`服务

定义Protobuf `Msg`服务是处理消息的推荐方式。每个模块通常在`tx.proto`中创建一个Protobuf `Msg`服务（有关[约定和命名](../../develop/advanced-concepts/06-encoding.md#faq)的更多信息）。它必须为模块中的每个消息定义一个RPC服务方法。

以下是`x/bank`模块中`Msg`服务定义的示例：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L13-L36
```

每个`Msg`服务方法必须有且只有一个参数，该参数必须实现`sdk.Msg`接口，并返回一个Protobuf响应。命名约定是将RPC参数命名为`Msg<service-rpc-name>`，RPC响应命名为`Msg<service-rpc-name>Response`。例如：

```protobuf
  rpc Send(MsgSend) returns (MsgSendResponse);
```

`sdk.Msg`接口是Amino `LegacyMsg`接口的简化版本，具有`GetSigners()`方法。为了与[Amino `LegacyMsg`](#legacy-amino-legacymsg-s)保持向后兼容性，现有的`LegacyMsg`类型应该用作`service` RPC定义的请求参数。新的`sdk.Msg`类型只支持`service`定义，应该使用规范的`Msg...`名称。

Cosmos SDK使用Protobuf定义来生成客户端和服务器代码：

* `MsgServer`接口定义了`Msg`服务的服务器API，其实现在[`Msg`服务](03-msg-services.md)文档中描述。
* 为所有RPC请求和响应类型生成结构。

还生成了一个`RegisterMsgServer`方法，应该用于在[`AppModule`接口](01-module-manager.md#appmodule)的`RegisterServices`方法中注册模块的`MsgServer`实现。

为了让客户端（CLI和grpc-gateway）注册这些URL，Cosmos SDK提供了函数`RegisterMsgServiceDesc(registry codectypes.InterfaceRegistry, sd *grpc.ServiceDesc)`，应该在模块的[`RegisterInterfaces`](01-module-manager.md#appmodulebasic)方法中调用，使用proto生成的`&_Msg_serviceDesc`作为`*grpc.ServiceDesc`参数。

### 旧版Amino `LegacyMsg`

以下定义消息的方式已被弃用，推荐使用[`Msg`服务](#msg-services)。

Amino `LegacyMsg`可以定义为protobuf消息。消息定义通常包括一个参数列表，该列表包含在用户希望创建包含该消息的新事务时由用户提供的参数。

`LegacyMsg`通常伴随一个标准的构造函数，该函数从[模块的接口之一](09-module-interfaces.md)调用。`message`还需要实现`sdk.Msg`接口：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/tx_msg.go#L14-L26
```

它扩展了`proto.Message`并包含以下方法：

* `GetSignBytes() []byte`：返回消息的规范字节表示。用于生成签名。
* `GetSigners() []AccAddress`：返回签名者列表。Cosmos SDK将确保事务中包含的每个`message`都由此方法返回的列表中列出的所有签名者签名。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/migrations/legacytx/stdsign.go#L20-L36
```

查看`gov`模块中`message`的示例实现：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/types/v1/msgs.go#L121-L153
```

## 查询

`query`是通过接口由应用程序的最终用户发出的信息请求，并由全节点进行处理。`query`通过其共识引擎被全节点接收，并通过ABCI中继到应用程序。然后，它通过`BaseApp`的`QueryRouter`路由到相应的模块，以便模块的查询服务（./04-query-services.md）可以处理它。要深入了解`query`的生命周期，请点击[此处](../../develop/high-level-concepts/02-query-lifecycle.md)。

### gRPC查询

应使用[Protobuf服务](https://developers.google.com/protocol-buffers/docs/proto#services)定义查询。在`query.proto`中，应为每个模块创建一个`Query`服务。该服务列出以`rpc`开头的端点。

以下是此类`Query`服务定义的示例：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/auth/v1beta1/query.proto#L14-L89
```

作为`proto.Message`，生成的`Response`类型默认实现了[`fmt.Stringer`](https://pkg.go.dev/fmt#Stringer)的`String()`方法。

还会生成一个`RegisterQueryServer`方法，应在[`AppModule`接口](01-module-manager.md#appmodule)的`RegisterServices`方法中使用该方法来注册模块的查询服务器。

### 旧版查询

在Cosmos SDK引入Protobuf和gRPC之前，通常模块开发人员不会定义特定的`query`对象，与`message`相反。相反，Cosmos SDK采用了更简单的方法，使用简单的`path`来定义每个`query`。`path`包含`query`类型和处理它所需的所有参数。对于大多数模块查询，`path`应如下所示：

```text
queryCategory/queryRoute/queryType/arg1/arg2/...
```

其中：

* `queryCategory`是`query`的类别，通常为模块查询的`custom`。它用于在`BaseApp`的[`Query`方法](../../develop/advanced-concepts/00-baseapp.md#query)中区分不同类型的查询。
* `queryRoute`由`BaseApp`的[`queryRouter`](../../develop/advanced-concepts/00-baseapp.md#grpc-query-router)用于将`query`映射到其模块。通常，`queryRoute`应为模块的名称。
* `queryType`由模块的[`querier`](04-query-services.md#query-services)用于将`query`映射到模块内适当的`querier函数`。
* `args`是处理`query`所需的实际参数。它们由最终用户填写。请注意，对于较大的查询，您可能更喜欢将参数传递给请求`req`的`Data`字段，而不是`path`中。

每个`query`的`path`必须由模块开发者在模块的[命令行接口文件](09-module-interfaces.md#query-commands)中定义。总体而言，模块开发者需要实现三个主要组件，以使其模块定义的状态子集可查询：

* [`querier`](04-query-services.md#query-services)：一旦`query`被[路由到模块](../../develop/advanced-concepts/00-baseapp.md#grpc-query-router)，就会处理该`query`。
* 模块的CLI文件中的[查询命令](09-module-interfaces.md#query-commands)，其中指定了每个`query`的`path`。
* `query`返回类型：通常在文件`types/querier.go`中定义，它们指定了模块的每个`query`的结果类型。这些自定义类型必须实现[`fmt.Stringer`](https://pkg.go.dev/fmt#Stringer)的`String()`方法。

### 存储查询

存储查询直接查询存储键。它们使用`clientCtx.QueryABCI(req abci.RequestQuery)`来返回包含 Merkle 证明的完整`abci.ResponseQuery`。

请参考以下示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/abci.go#L881-L902
```




# Messages and Queries

:::note Synopsis
`Msg`s and `Queries` are the two primary objects handled by modules. Most of the core components defined in a module, like `Msg` services, `keeper`s and `Query` services, exist to process `message`s and `queries`.
:::

:::note

### Pre-requisite Readings

* [Introduction to Cosmos SDK Modules](00-intro.md)

:::

## Messages

`Msg`s are objects whose end-goal is to trigger state-transitions. They are wrapped in [transactions](../../develop/advanced-concepts/01-transactions.md), which may contain one or more of them.

When a transaction is relayed from the underlying consensus engine to the Cosmos SDK application, it is first decoded by [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md). Then, each message contained in the transaction is extracted and routed to the appropriate module via `BaseApp`'s `MsgServiceRouter` so that it can be processed by the module's [`Msg` service](03-msg-services.md). For a more detailed explanation of the lifecycle of a transaction, click [here](../../develop/high-level-concepts/01-tx-lifecycle.md).

### `Msg` Services

Defining Protobuf `Msg` services is the recommended way to handle messages. A Protobuf `Msg` service should be created for each module, typically in `tx.proto` (see more info about [conventions and naming](../../develop/advanced-concepts/06-encoding.md#faq)). It must have an RPC service method defined for each message in the module.

See an example of a `Msg` service definition from `x/bank` module:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L13-L36
```

Each `Msg` service method must have exactly one argument, which must implement the `sdk.Msg` interface, and a Protobuf response. The naming convention is to call the RPC argument `Msg<service-rpc-name>` and the RPC response `Msg<service-rpc-name>Response`. For example:

```protobuf
  rpc Send(MsgSend) returns (MsgSendResponse);
```

`sdk.Msg` interface is a simplified version of the Amino `LegacyMsg` interface described [below](#legacy-amino-legacymsg-s) with the `GetSigners()` method. For backwards compatibility with [Amino `LegacyMsg`s](#egacy-amino-legacymsg-s), existing `LegacyMsg` types should be used as the request parameter for `service` RPC definitions. Newer `sdk.Msg` types, which only support `service` definitions, should use canonical `Msg...` name.

The Cosmos SDK uses Protobuf definitions to generate client and server code:

* `MsgServer` interface defines the server API for the `Msg` service and its implementation is described as part of the [`Msg` services](03-msg-services.md) documentation.
* Structures are generated for all RPC request and response types.

A `RegisterMsgServer` method is also generated and should be used to register the module's `MsgServer` implementation in `RegisterServices` method from the [`AppModule` interface](01-module-manager.md#appmodule).

In order for clients (CLI and grpc-gateway) to have these URLs registered, the Cosmos SDK provides the function `RegisterMsgServiceDesc(registry codectypes.InterfaceRegistry, sd *grpc.ServiceDesc)` that should be called inside module's [`RegisterInterfaces`](01-module-manager.md#appmodulebasic) method, using the proto-generated `&_Msg_serviceDesc` as `*grpc.ServiceDesc` argument.

### Legacy Amino `LegacyMsg`s

The following way of defining messages is deprecated and using [`Msg` services](#msg-services) is preferred.

Amino `LegacyMsg`s can be defined as protobuf messages. The messages definition usually includes a list of parameters needed to process the message that will be provided by end-users when they want to create a new transaction containing said message.

A `LegacyMsg` is typically accompanied by a standard constructor function, that is called from one of the [module's interface](09-module-interfaces.md). `message`s also need to implement the `sdk.Msg` interface:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/tx_msg.go#L14-L26
```

It extends `proto.Message` and contains the following methods:

* `GetSignBytes() []byte`: Return the canonical byte representation of the message. Used to generate a signature.
* `GetSigners() []AccAddress`: Return the list of signers. The Cosmos SDK will make sure that each `message` contained in a transaction is signed by all the signers listed in the list returned by this method.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/migrations/legacytx/stdsign.go#L20-L36
```

See an example implementation of a `message` from the `gov` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/types/v1/msgs.go#L121-L153
```

## Queries

A `query` is a request for information made by end-users of applications through an interface and processed by a full-node. A `query` is received by a full-node through its consensus engine and relayed to the application via the ABCI. It is then routed to the appropriate module via `BaseApp`'s `QueryRouter` so that it can be processed by the module's query service (./04-query-services.md). For a deeper look at the lifecycle of a `query`, click [here](../../develop/high-level-concepts/02-query-lifecycle.md).

### gRPC Queries

Queries should be defined using [Protobuf services](https://developers.google.com/protocol-buffers/docs/proto#services). A `Query` service should be created per module in `query.proto`. This service lists endpoints starting with `rpc`.

Here's an example of such a `Query` service definition:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/auth/v1beta1/query.proto#L14-L89
```

As `proto.Message`s, generated `Response` types implement by default `String()` method of [`fmt.Stringer`](https://pkg.go.dev/fmt#Stringer).

A `RegisterQueryServer` method is also generated and should be used to register the module's query server in the `RegisterServices` method from the [`AppModule` interface](01-module-manager.md#appmodule).

### Legacy Queries

Before the introduction of Protobuf and gRPC in the Cosmos SDK, there was usually no specific `query` object defined by module developers, contrary to `message`s. Instead, the Cosmos SDK took the simpler approach of using a simple `path` to define each `query`. The `path` contains the `query` type and all the arguments needed to process it. For most module queries, the `path` should look like the following:

```text
queryCategory/queryRoute/queryType/arg1/arg2/...
```

where:

* `queryCategory` is the category of the `query`, typically `custom` for module queries. It is used to differentiate between different kinds of queries within `BaseApp`'s [`Query` method](../../develop/advanced-concepts/00-baseapp.md#query).
* `queryRoute` is used by `BaseApp`'s [`queryRouter`](../../develop/advanced-concepts/00-baseapp.md#grpc-query-router) to map the `query` to its module. Usually, `queryRoute` should be the name of the module.
* `queryType` is used by the module's [`querier`](04-query-services.md#query-services) to map the `query` to the appropriate `querier function` within the module.
* `args` are the actual arguments needed to process the `query`. They are filled out by the end-user. Note that for bigger queries, you might prefer passing arguments in the `Data` field of the request `req` instead of the `path`.

The `path` for each `query` must be defined by the module developer in the module's [command-line interface file](09-module-interfaces.md#query-commands).Overall, there are 3 mains components module developers need to implement in order to make the subset of the state defined by their module queryable:

* A [`querier`](04-query-services.md#query-services), to process the `query` once it has been [routed to the module](../../develop/advanced-concepts/00-baseapp.md#grpc-query-router).
* [Query commands](09-module-interfaces.md#query-commands) in the module's CLI file, where the `path` for each `query` is specified.
* `query` return types. Typically defined in a file `types/querier.go`, they specify the result type of each of the module's `queries`. These custom types must implement the `String()` method of [`fmt.Stringer`](https://pkg.go.dev/fmt#Stringer).

### Store Queries

Store queries query directly for store keys. They use `clientCtx.QueryABCI(req abci.RequestQuery)` to return the full `abci.ResponseQuery` with inclusion Merkle proofs.

See following examples:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/abci.go#L881-L902
```
