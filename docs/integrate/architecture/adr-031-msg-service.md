# ADR 031: Protobuf Msg Services

## 变更日志

* 2020-10-05: 初始草稿
* 2021-04-21: 移除 `ServiceMsg` 以遵循 Protobuf `Any` 的规范，参见 [#9063](https://github.com/cosmos/cosmos-sdk/issues/9063)。

## 状态

已接受

## 摘要

我们希望利用 protobuf 的 `service` 定义来定义 `Msg`，这将在生成的代码和返回类型明确定义方面为开发人员提供显著的开发体验改进。

## 背景

目前，Cosmos SDK 中的 `Msg` 处理程序在响应的 `data` 字段中具有返回值。然而，除了在 golang 处理程序代码中之外，这些返回值没有在任何地方指定。

在早期的讨论中，[有人提议](https://docs.google.com/document/d/1eEgYgvgZqLE45vETjhwIw4VOqK-5hwQtZtjVbiXnIGc/edit)使用 protobuf 扩展字段来捕获 `Msg` 的返回类型，例如：

```protobuf
package cosmos.gov;

message MsgSubmitProposal
	option (cosmos_proto.msg_return) = “uint64”;
	string delegator_address = 1;
	string validator_address = 2;
	repeated sdk.Coin amount = 3;
}
```

然而，这个提议从未被采纳。

为 `Msg` 定义一个明确定义的返回值将改善客户端的开发体验。例如，在 `x/gov` 模块中，`MsgSubmitProposal` 以大端序的 `uint64` 形式返回提案 ID。这并没有在任何地方进行详细说明，客户端需要了解 Cosmos SDK 的内部机制来解析该值并将其返回给用户。

此外，可能存在一些情况，我们希望以编程方式使用这些返回值。例如，https://github.com/cosmos/cosmos-sdk/issues/7093 提出了一种使用 `Msg` 路由器进行模块间 Ocaps 的方法。明确定义的返回类型将改善此方法的开发人员体验。

此外，`Msg` 类型的处理程序注册往往会在 keeper 之上添加一些样板代码，并且通常是通过手动类型切换来完成的。这并不一定是不好的，但它确实增加了创建模块的开销。

## 决策

我们决定使用 protobuf 的 `service` 定义来定义 `Msg`，以及由它们生成的代码，作为 `Msg` 处理程序的替代品。

下面我们定义了 `x/gov` 模块中 `SubmitProposal` 消息的实现方式：

```protobuf
package cosmos.gov;

service Msg {
  rpc SubmitProposal(MsgSubmitProposal) returns (MsgSubmitProposalResponse);
}

// Note that for backwards compatibility this uses MsgSubmitProposal as the request
// type instead of the more canonical MsgSubmitProposalRequest
message MsgSubmitProposal {
  google.protobuf.Any content = 1;
  string proposer = 2;
}

message MsgSubmitProposalResponse {
  uint64 proposal_id;
}
```

虽然这种方式最常用于gRPC，但像这样重载protobuf `service`定义并不违反[protobuf规范](https://developers.google.com/protocol-buffers/docs/proto3#services)的意图，该规范指出：
> 如果您不想使用gRPC，也可以使用自己的RPC实现来使用协议缓冲区。
通过这种方法，我们将获得一个自动生成的`MsgServer`接口：

除了明确指定返回类型外，这还有一个好处，即生成客户端和服务器端代码。在服务器端，这几乎就像是一个自动生成的keeper方法，可能最终可以替代keepers（参见[\#7093](https://github.com/cosmos/cosmos-sdk/issues/7093)）：

```go
package gov

type MsgServer interface {
  SubmitProposal(context.Context, *MsgSubmitProposal) (*MsgSubmitProposalResponse, error)
}
```

在客户端，开发人员可以通过创建封装事务逻辑的RPC实现来利用这一点。像[protobuf.js](https://github.com/protobufjs/protobuf.js#using-services)这样使用异步回调的Protobuf库可以使用这个功能为特定消息注册回调，即使是包含多个`Msg`的事务也可以。

每个`Msg`服务方法应该有且只有一个请求参数：对应的`Msg`类型。例如，上面的`Msg`服务方法`/cosmos.gov.v1beta1.Msg/SubmitProposal`只有一个请求参数，即`Msg`类型`/cosmos.gov.v1beta1.MsgSubmitProposal`。重要的是，读者清楚地理解`Msg`服务（Protobuf服务）和`Msg`类型（Protobuf消息）之间的命名差异以及其完全限定名称的差异。

这种约定是基于更经典的`Msg...Request`名称的决定，主要是为了向后兼容性，但也为了在`TxBody.messages`（参见下面的[编码部分](#encoding)）中更好地可读性：包含`/cosmos.gov.MsgSubmitProposal`的事务比包含`/cosmos.gov.v1beta1.MsgSubmitProposalRequest`的事务更易读。

这种约定的一个结果是，每个`Msg`类型只能是一个`Msg`服务方法的请求参数。然而，我们认为这种限制是一种明确性的良好实践。

### 编码

使用`Msg`服务生成的交易的编码与当前在[ADR-020](adr-020-protobuf-transaction-encoding.md)中定义的Protobuf交易编码没有区别。我们将`Msg`类型（即`Msg`服务方法的请求参数）编码为`Tx`中的`Any`，这涉及将二进制编码的`Msg`与其类型URL一起打包。

### 解码

由于`Msg`类型被打包到`Any`中，解码交易消息是通过将`Any`解包为`Msg`类型来完成的。有关更多信息，请参阅[ADR-020](adr-020-protobuf-transaction-encoding.md#transactions)。

### 路由

我们建议在BaseApp中添加一个`msg_service_router`。这个路由器是一个键值映射，将`Msg`类型的`type_url`映射到其对应的`Msg`服务方法处理程序。由于`Msg`类型和`Msg`服务方法之间存在一对一的映射关系，`msg_service_router`每个`Msg`服务方法恰好有一个条目。

当BaseApp处理交易（在CheckTx或DeliverTx中）时，它的`TxBody.messages`被解码为`Msg`。每个`Msg`的`type_url`与`msg_service_router`中的条目进行匹配，并调用相应的`Msg`服务方法处理程序。

为了向后兼容，旧的处理程序尚未删除。如果BaseApp接收到一个在`msg_service_router`中没有对应条目的旧的`Msg`，它将通过其旧的`Route()`方法路由到旧的处理程序。

### 模块配置

在[ADR 021](adr-021-protobuf-query-encoding.md)中，我们引入了一个名为`RegisterQueryService`的方法，允许模块注册gRPC查询器。

为了注册`Msg`服务，我们尝试采用更具扩展性的方法，将`RegisterQueryService`转换为更通用的`RegisterServices`方法：

```go
type AppModule interface {
  RegisterServices(Configurator)
  ...
}

type Configurator interface {
  QueryServer() grpc.Server
  MsgServer() grpc.Server
}

// example module:
func (am AppModule) RegisterServices(cfg Configurator) {
	types.RegisterQueryServer(cfg.QueryServer(), keeper)
	types.RegisterMsgServer(cfg.MsgServer(), keeper)
}
```

`RegisterServices`方法和`Configurator`接口旨在满足[\#7093](https://github.com/cosmos/cosmos-sdk/issues/7093)和[\#7122](https://github.com/cosmos/cosmos-sdk/issues/7421)中讨论的用例需求，并将不断发展。

当注册`Msg`服务时，框架应该验证所有`Msg`类型是否实现了`sdk.Msg`接口，并在初始化过程中抛出错误，而不是在处理交易时才抛出错误。

### `Msg`服务实现

与查询服务一样，`Msg`服务方法可以使用`sdk.UnwrapSDKContext`方法从`context.Context`参数方法中获取`sdk.Context`：

```go
package gov

func (k Keeper) SubmitProposal(goCtx context.Context, params *types.MsgSubmitProposal) (*MsgSubmitProposalResponse, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)
    ...
}
```

`sdk.Context`应该已经通过BaseApp的`msg_service_router`附加了`EventManager`。

使用这种方法不再需要单独的处理程序定义。

## 结果

这种设计改变了模块功能的暴露和访问方式。它废弃了现有的`Handler`接口和`AppModule.Route`，而采用了[Protocol Buffer Services](https://developers.google.com/protocol-buffers/docs/proto3#services)和上述的服务路由。这极大地简化了代码。我们不再需要创建处理程序和保管人。使用协议缓冲区自动生成的客户端清楚地分离了模块和模块用户之间的通信接口。控制逻辑（即处理程序和保管人）不再暴露。模块接口可以被视为通过客户端API访问的黑盒。值得注意的是，客户端接口也是由协议缓冲区生成的。

这还允许我们改变如何执行功能测试。我们将不再模拟AppModules和Router，而是模拟一个客户端（服务器将保持隐藏）。具体来说：我们将不再在`moduleB`中模拟`moduleA.MsgServer`，而是模拟`moduleA.MsgClient`。可以将其视为与外部服务（例如数据库或在线服务器）一起工作。我们假设由生成的协议缓冲区正确处理客户端和服务器之间的传输。

最后，将模块对客户端API进行封闭，打开了ADR-033中讨论的期望的OCAP模式。由于服务器实现和接口被隐藏，没有人可以持有"保管人"/服务器，并且将被迫依赖于客户端接口，这将引导开发人员进行正确的封装和软件工程模式。

### 优点

* 清晰地传达返回类型
* 不再需要手动处理程序注册和返回类型编组，只需实现接口并注册即可
* 通信接口会自动生成，开发人员现在只需专注于状态转换方法 - 如果我们选择采用 [\#7093](https://github.com/cosmos/cosmos-sdk/issues/7093) 方法，这将改善用户体验
* 生成的客户端代码对客户端和测试非常有用
* 大大减少和简化了代码

### 缺点

* 在 gRPC 上下文之外使用 `service` 定义可能会令人困惑（但不违反 proto3 规范）

## 参考资料

* [初始 Github 问题 \#7122](https://github.com/cosmos/cosmos-sdk/issues/7122)
* [proto 3 语言指南：定义服务](https://developers.google.com/protocol-buffers/docs/proto3#services)
* [初始的 pre-`Any` `Msg` 设计](https://docs.google.com/document/d/1eEgYgvgZqLE45vETjhwIw4VOqK-5hwQtZtjVbiXnIGc)
* [ADR 020](adr-020-protobuf-transaction-encoding.md)
* [ADR 021](adr-021-protobuf-query-encoding.md)


# ADR 031: Protobuf Msg Services

## Changelog

* 2020-10-05: Initial Draft
* 2021-04-21: Remove `ServiceMsg`s to follow Protobuf `Any`'s spec, see [#9063](https://github.com/cosmos/cosmos-sdk/issues/9063).

## Status

Accepted

## Abstract

We want to leverage protobuf `service` definitions for defining `Msg`s which will give us significant developer UX
improvements in terms of the code that is generated and the fact that return types will now be well defined.

## Context

Currently `Msg` handlers in the Cosmos SDK do have return values that are placed in the `data` field of the response.
These return values, however, are not specified anywhere except in the golang handler code.

In early conversations [it was proposed](https://docs.google.com/document/d/1eEgYgvgZqLE45vETjhwIw4VOqK-5hwQtZtjVbiXnIGc/edit)
that `Msg` return types be captured using a protobuf extension field, ex:

```protobuf
package cosmos.gov;

message MsgSubmitProposal
	option (cosmos_proto.msg_return) = “uint64”;
	string delegator_address = 1;
	string validator_address = 2;
	repeated sdk.Coin amount = 3;
}
```

This was never adopted, however.

Having a well-specified return value for `Msg`s would improve client UX. For instance,
in `x/gov`,  `MsgSubmitProposal` returns the proposal ID as a big-endian `uint64`.
This isn’t really documented anywhere and clients would need to know the internals
of the Cosmos SDK to parse that value and return it to users.

Also, there may be cases where we want to use these return values programatically.
For instance, https://github.com/cosmos/cosmos-sdk/issues/7093 proposes a method for
doing inter-module Ocaps using the `Msg` router. A well-defined return type would
improve the developer UX for this approach.

In addition, handler registration of `Msg` types tends to add a bit of
boilerplate on top of keepers and is usually done through manual type switches.
This isn't necessarily bad, but it does add overhead to creating modules.

## Decision

We decide to use protobuf `service` definitions for defining `Msg`s as well as
the code generated by them as a replacement for `Msg` handlers.

Below we define how this will look for the `SubmitProposal` message from `x/gov` module.
We start with a `Msg` `service` definition:

```protobuf
package cosmos.gov;

service Msg {
  rpc SubmitProposal(MsgSubmitProposal) returns (MsgSubmitProposalResponse);
}

// Note that for backwards compatibility this uses MsgSubmitProposal as the request
// type instead of the more canonical MsgSubmitProposalRequest
message MsgSubmitProposal {
  google.protobuf.Any content = 1;
  string proposer = 2;
}

message MsgSubmitProposalResponse {
  uint64 proposal_id;
}
```

While this is most commonly used for gRPC, overloading protobuf `service` definitions like this does not violate
the intent of the [protobuf spec](https://developers.google.com/protocol-buffers/docs/proto3#services) which says:
> If you don’t want to use gRPC, it’s also possible to use protocol buffers with your own RPC implementation.
With this approach, we would get an auto-generated `MsgServer` interface:

In addition to clearly specifying return types, this has the benefit of generating client and server code. On the server
side, this is almost like an automatically generated keeper method and could maybe be used intead of keepers eventually
(see [\#7093](https://github.com/cosmos/cosmos-sdk/issues/7093)):

```go
package gov

type MsgServer interface {
  SubmitProposal(context.Context, *MsgSubmitProposal) (*MsgSubmitProposalResponse, error)
}
```

On the client side, developers could take advantage of this by creating RPC implementations that encapsulate transaction
logic. Protobuf libraries that use asynchronous callbacks, like [protobuf.js](https://github.com/protobufjs/protobuf.js#using-services)
could use this to register callbacks for specific messages even for transactions that include multiple `Msg`s.

Each `Msg` service method should have exactly one request parameter: its corresponding `Msg` type. For example, the `Msg` service method `/cosmos.gov.v1beta1.Msg/SubmitProposal` above has exactly one request parameter, namely the `Msg` type `/cosmos.gov.v1beta1.MsgSubmitProposal`. It is important the reader understands clearly the nomenclature difference between a `Msg` service (a Protobuf service) and a `Msg` type (a Protobuf message), and the differences in their fully-qualified name.

This convention has been decided over the more canonical `Msg...Request` names mainly for backwards compatibility, but also for better readability in `TxBody.messages` (see [Encoding section](#encoding) below): transactions containing `/cosmos.gov.MsgSubmitProposal` read better than those containing `/cosmos.gov.v1beta1.MsgSubmitProposalRequest`.

One consequence of this convention is that each `Msg` type can be the request parameter of only one `Msg` service method. However, we consider this limitation a good practice in explicitness.

### Encoding

Encoding of transactions generated with `Msg` services do not differ from current Protobuf transaction encoding as defined in [ADR-020](adr-020-protobuf-transaction-encoding.md). We are encoding `Msg` types (which are exactly `Msg` service methods' request parameters) as `Any` in `Tx`s which involves packing the
binary-encoded `Msg` with its type URL.

### Decoding

Since `Msg` types are packed into `Any`, decoding transactions messages are done by unpacking `Any`s into `Msg` types. For more information, please refer to [ADR-020](adr-020-protobuf-transaction-encoding.md#transactions).

### Routing

We propose to add a `msg_service_router` in BaseApp. This router is a key/value map which maps `Msg` types' `type_url`s to their corresponding `Msg` service method handler. Since there is a 1-to-1 mapping between `Msg` types and `Msg` service method, the `msg_service_router` has exactly one entry per `Msg` service method.

When a transaction is processed by BaseApp (in CheckTx or in DeliverTx), its `TxBody.messages` are decoded as `Msg`s. Each `Msg`'s `type_url` is matched against an entry in the `msg_service_router`, and the respective `Msg` service method handler is called.

For backward compatability, the old handlers are not removed yet. If BaseApp receives a legacy `Msg` with no correspoding entry in the `msg_service_router`, it will be routed via its legacy `Route()` method into the legacy handler.

### Module Configuration

In [ADR 021](adr-021-protobuf-query-encoding.md), we introduced a method `RegisterQueryService`
to `AppModule` which allows for modules to register gRPC queriers.

To register `Msg` services, we attempt a more extensible approach by converting `RegisterQueryService`
to a more generic `RegisterServices` method:

```go
type AppModule interface {
  RegisterServices(Configurator)
  ...
}

type Configurator interface {
  QueryServer() grpc.Server
  MsgServer() grpc.Server
}

// example module:
func (am AppModule) RegisterServices(cfg Configurator) {
	types.RegisterQueryServer(cfg.QueryServer(), keeper)
	types.RegisterMsgServer(cfg.MsgServer(), keeper)
}
```

The `RegisterServices` method and the `Configurator` interface are intended to
evolve to satisfy the use cases discussed in [\#7093](https://github.com/cosmos/cosmos-sdk/issues/7093)
and [\#7122](https://github.com/cosmos/cosmos-sdk/issues/7421).

When `Msg` services are registered, the framework _should_ verify that all `Msg` types
implement the `sdk.Msg` interface and throw an error during initialization rather
than later when transactions are processed.

### `Msg` Service Implementation

Just like query services, `Msg` service methods can retrieve the `sdk.Context`
from the `context.Context` parameter method using the `sdk.UnwrapSDKContext`
method:

```go
package gov

func (k Keeper) SubmitProposal(goCtx context.Context, params *types.MsgSubmitProposal) (*MsgSubmitProposalResponse, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)
    ...
}
```

The `sdk.Context` should have an `EventManager` already attached by BaseApp's `msg_service_router`.

Separate handler definition is no longer needed with this approach.

## Consequences

This design changes how a module functionality is exposed and accessed. It deprecates the existing `Handler` interface and `AppModule.Route` in favor of [Protocol Buffer Services](https://developers.google.com/protocol-buffers/docs/proto3#services) and Service Routing described above. This dramatically simplifies the code. We don't need to create handlers and keepers any more. Use of Protocol Buffer auto-generated clients clearly separates the communication interfaces between the module and a modules user. The control logic (aka handlers and keepers) is not exposed any more. A module interface can be seen as a black box accessible through a client API. It's worth to note that the client interfaces are also generated by Protocol Buffers.

This also allows us to change how we perform functional tests. Instead of mocking AppModules and Router, we will mock a client (server will stay hidden). More specifically: we will never mock `moduleA.MsgServer` in `moduleB`, but rather `moduleA.MsgClient`. One can think about it as working with external services (eg DBs, or online servers...). We assume that the transmission between clients and servers is correctly handled by generated Protocol Buffers.

Finally, closing a module to client API opens desirable OCAP patterns discussed in ADR-033. Since server implementation and interface is hidden, nobody can hold "keepers"/servers and will be forced to relay on the client interface, which will drive developers for correct encapsulation and software engineering patterns.

### Pros

* communicates return type clearly
* manual handler registration and return type marshaling is no longer needed, just implement the interface and register it
* communication interface is automatically generated, the developer can now focus only on the state transition methods - this would improve the UX of [\#7093](https://github.com/cosmos/cosmos-sdk/issues/7093) approach (1) if we chose to adopt that
* generated client code could be useful for clients and tests
* dramatically reduces and simplifies the code

### Cons

* using `service` definitions outside the context of gRPC could be confusing (but doesn’t violate the proto3 spec)

## References

* [Initial Github Issue \#7122](https://github.com/cosmos/cosmos-sdk/issues/7122)
* [proto 3 Language Guide: Defining Services](https://developers.google.com/protocol-buffers/docs/proto3#services)
* [Initial pre-`Any` `Msg` designs](https://docs.google.com/document/d/1eEgYgvgZqLE45vETjhwIw4VOqK-5hwQtZtjVbiXnIGc)
* [ADR 020](adr-020-protobuf-transaction-encoding.md)
* [ADR 021](adr-021-protobuf-query-encoding.md)
