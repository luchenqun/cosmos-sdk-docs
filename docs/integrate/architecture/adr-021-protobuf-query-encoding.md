# ADR 021: Protocol Buffer 查询编码

## 变更日志

* 2020年3月27日：初稿

## 状态

已接受

## 背景

本ADR是在[ADR 019](adr-019-protobuf-state-encoding.md)和[ADR 020](adr-020-protobuf-transaction-encoding.md)中建立的动机、设计和背景的基础上进行的，我们的目标是为Cosmos SDK的客户端设计Protocol Buffer迁移路径。

本ADR从[ADR 020](adr-020-protobuf-transaction-encoding.md)继续，以指定查询的编码方式。

## 决策

### 自定义查询定义

模块通过协议缓冲区的`service`定义来定义自定义查询。这些`service`定义通常与GRPC协议相关联并被其使用。然而，协议缓冲区规范指出，它们可以更通用地被任何使用协议缓冲区编码的请求/响应协议使用。因此，我们可以使用`service`定义来指定自定义的ABCI查询，甚至可以重用大量的GRPC基础设施。

每个具有自定义查询的模块应该定义一个名为`Query`的规范化服务：

```protobuf
// x/bank/types/types.proto

service Query {
  rpc QueryBalance(QueryBalanceParams) returns (cosmos_sdk.v1.Coin) { }
  rpc QueryAllBalances(QueryAllBalancesParams) returns (QueryAllBalancesResponse) { }
}
```

#### 处理接口类型

使用接口类型并需要真正的多态性的模块通常会在应用级别上强制使用`oneof`，以提供应用支持的该接口的具体实现集合。虽然应用程序可以为查询执行相同的操作，并实现一个应用级别的查询服务，但建议模块通过`google.protobuf.Any`公开这些接口的查询方法。对于事务级别，存在使用`Any`的开销过高以证明其使用的担忧。然而，对于查询来说，这不是一个问题，并且提供使用`Any`的通用模块级查询不会阻止应用程序还提供返回使用应用程序级`oneof`的应用程序级查询。

`gov`模块的一个假设性示例如下：

```protobuf
// x/gov/types/types.proto

import "google/protobuf/any.proto";

service Query {
  rpc GetProposal(GetProposalParams) returns (AnyProposal) { }
}

message AnyProposal {
  ProposalBase base = 1;
  google.protobuf.Any content = 2;
}
```

### 自定义查询实现

为了实现查询服务，我们可以重用现有的[gogo protobuf](https://github.com/cosmos/gogoproto) grpc插件，该插件为名为`Query`的服务生成一个名为`QueryServer`的接口，如下所示：

```go
type QueryServer interface {
	QueryBalance(context.Context, *QueryBalanceParams) (*types.Coin, error)
	QueryAllBalances(context.Context, *QueryAllBalancesParams) (*QueryAllBalancesResponse, error)
}
```

我们的模块的自定义查询是通过实现这个接口来实现的。

生成的接口的第一个参数是一个通用的 `context.Context`，而查询方法通常需要一个 `sdk.Context` 的实例来从存储中读取。由于可以使用 `WithValue` 和 `Value` 方法向 `context.Context` 添加任意值，Cosmos SDK 应该提供一个函数 `sdk.UnwrapSDKContext` 来从提供的 `context.Context` 中检索 `sdk.Context`。

上述银行模块的 `QueryBalance` 的示例实现如下：

```go
type Querier struct {
	Keeper
}

func (q Querier) QueryBalance(ctx context.Context, params *types.QueryBalanceParams) (*sdk.Coin, error) {
	balance := q.GetBalance(sdk.UnwrapSDKContext(ctx), params.Address, params.Denom)
	return &balance, nil
}
```

### 自定义查询的注册和路由

像上面那样的查询服务器实现将使用一个新的方法 `RegisterQueryService(grpc.Server)` 在 `AppModule` 中进行注册，可以简单地实现如下：

```go
// x/bank/module.go
func (am AppModule) RegisterQueryService(server grpc.Server) {
	types.RegisterQueryServer(server, keeper.Querier{am.keeper})
}
```

在底层，将在现有的 `baseapp.QueryRouter` 上添加一个新的方法 `RegisterService(sd *grpc.ServiceDesc, handler interface{})`，以将查询添加到自定义查询路由表中（路由方法将在下面描述）。该方法的签名与 GRPC `Server` 类型上的现有 `RegisterServer` 方法匹配，其中 `handler` 是上述自定义查询服务器实现。

类似 GRPC 的请求通过服务名称（例如 `cosmos_sdk.x.bank.v1.Query`）和方法名称（例如 `QueryBalance`）组合使用 `/` 形成完整的方法名称（例如 `/cosmos_sdk.x.bank.v1.Query/QueryBalance`）进行路由。这将被转换为 ABCI 查询 `custom/cosmos_sdk.x.bank.v1.Query/QueryBalance`。使用 `QueryRouter.RegisterService` 注册的服务处理程序将以这种方式进行路由。

除了方法名称之外，GRPC 请求还携带一个 protobuf 编码的有效负载，它自然地映射到 `RequestQuery.Data`，并接收一个 protobuf 编码的响应或错误。因此，GRPC 类似的 rpc 方法与现有的 `sdk.Query` 和 `QueryRouter` 基础设施之间有一个非常自然的映射。

这个基本规范允许我们重用协议缓冲区的 `service` 定义来大大减少在查询方法中手动解码和编码的需求。

### GRPC协议支持

除了提供ABCI查询通道外，我们还可以轻松地提供一个GRPC代理服务器，将GRPC协议的请求路由到ABCI查询请求。这样，客户端可以使用宿主语言现有的GRPC实现直接对Cosmos SDK应用程序进行查询，使用这些`service`定义。为了使该服务器工作，`BaseApp`上的`QueryRouter`将需要将`QueryRouter.RegisterService`注册的服务处理程序暴露给代理服务器实现。节点可以在与ABCI应用程序相同的进程中的不同端口上启动代理服务器，并使用命令行标志。

### REST查询和Swagger生成

[grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway)是一个项目，它使用服务方法上的特殊注解将REST调用转换为GRPC调用。希望公开REST查询的模块应该在其`rpc`方法中添加`google.api.http`注解，如下面的示例所示。

```protobuf
// x/bank/types/types.proto

service Query {
  rpc QueryBalance(QueryBalanceParams) returns (cosmos_sdk.v1.Coin) {
    option (google.api.http) = {
      get: "/x/bank/v1/balance/{address}/{denom}"
    };
  }
  rpc QueryAllBalances(QueryAllBalancesParams) returns (QueryAllBalancesResponse) {
    option (google.api.http) = {
      get: "/x/bank/v1/balances/{address}"
    };
  }
}
```

grpc-gateway将直接与上述描述的GRPC代理一起工作，该代理将在底层将请求转换为ABCI查询。grpc-gateway还可以自动生成Swagger定义。

在当前的REST查询实现中，每个模块都需要手动实现REST查询，除了ABCI查询方法。使用grpc-gateway方法，将不需要生成单独的REST查询处理程序，只需要像上面描述的那样生成查询服务器，因为grpc-gateway会处理protobuf到REST的转换以及Swagger定义。

Cosmos SDK应该为应用程序提供CLI命令，以便在单独的进程或与ABCI应用程序相同的进程中启动GRPC网关，并提供一个命令来生成grpc-gateway代理`.proto`文件和`swagger.json`文件。

### 客户端使用

gogo protobuf grpc插件除了生成服务器接口之外，还生成客户端接口。对于上面定义的`Query`服务，我们将得到一个名为`QueryClient`的接口，如下所示：

```go
type QueryClient interface {
	QueryBalance(ctx context.Context, in *QueryBalanceParams, opts ...grpc.CallOption) (*types.Coin, error)
	QueryAllBalances(ctx context.Context, in *QueryAllBalancesParams, opts ...grpc.CallOption) (*QueryAllBalancesResponse, error)
}
```

通过对gogo protobuf的小补丁（[gogo/protobuf#675](https://github.com/gogo/protobuf/pull/675)），我们调整了grpc代码生成器，使用接口而不是具体类型来生成客户端结构体。这使得我们也可以重用GRPC基础设施来进行ABCI客户端查询。

1Context将会接收一个新的方法QueryConn，它返回一个ClientConn，用于路由ABCI查询的调用。

然后，客户端（如CLI方法）将能够像这样调用查询方法：

```go
clientCtx := client.NewContext()
queryClient := types.NewQueryClient(clientCtx.QueryConn())
params := &types.QueryBalanceParams{addr, denom}
result, err := queryClient.QueryBalance(gocontext.Background(), params)
```

### 测试

测试可以直接从keeper和`sdk.Context`引用中创建一个查询客户端，使用`QueryServerTestHelper`如下所示：

```go
queryHelper := baseapp.NewQueryServerTestHelper(ctx)
types.RegisterQueryServer(queryHelper, keeper.Querier{app.BankKeeper})
queryClient := types.NewQueryClient(queryHelper)
```

## 未来的改进

## 影响

### 积极的

* 大大简化了查询器的实现（无需手动编码/解码）
* 易于生成查询客户端（可以使用现有的grpc和swagger工具）
* 不需要REST查询实现
* 类型安全的查询方法（通过grpc插件生成）
* 由于buf提供的向后兼容性保证，以后查询方法的破坏将会减少

### 消极的

* 所有使用现有ABCI/REST查询的客户端都需要重构，以适应新的GRPC/REST查询路径以及protobuf/proto-json编码的数据，但这在protobuf重构中是不可避免的

### 中性的

## 参考资料


# ADR 021: Protocol Buffer Query Encoding

## Changelog

* 2020 March 27: Initial Draft

## Status

Accepted

## Context

This ADR is a continuation of the motivation, design, and context established in
[ADR 019](adr-019-protobuf-state-encoding.md) and
[ADR 020](adr-020-protobuf-transaction-encoding.md), namely, we aim to design the
Protocol Buffer migration path for the client-side of the Cosmos SDK.

This ADR continues from [ADD 020](adr-020-protobuf-transaction-encoding.md)
to specify the encoding of queries.

## Decision

### Custom Query Definition

Modules define custom queries through a protocol buffers `service` definition.
These `service` definitions are generally associated with and used by the
GRPC protocol. However, the protocol buffers specification indicates that
they can be used more generically by any request/response protocol that uses
protocol buffer encoding. Thus, we can use `service` definitions for specifying
custom ABCI queries and even reuse a substantial amount of the GRPC infrastructure.

Each module with custom queries should define a service canonically named `Query`:

```protobuf
// x/bank/types/types.proto

service Query {
  rpc QueryBalance(QueryBalanceParams) returns (cosmos_sdk.v1.Coin) { }
  rpc QueryAllBalances(QueryAllBalancesParams) returns (QueryAllBalancesResponse) { }
}
```

#### Handling of Interface Types

Modules that use interface types and need true polymorphism generally force a
`oneof` up to the app-level that provides the set of concrete implementations of
that interface that the app supports. While app's are welcome to do the same for
queries and implement an app-level query service, it is recommended that modules
provide query methods that expose these interfaces via `google.protobuf.Any`.
There is a concern on the transaction level that the overhead of `Any` is too
high to justify its usage. However for queries this is not a concern, and
providing generic module-level queries that use `Any` does not preclude apps
from also providing app-level queries that return use the app-level `oneof`s.

A hypothetical example for the `gov` module would look something like:

```protobuf
// x/gov/types/types.proto

import "google/protobuf/any.proto";

service Query {
  rpc GetProposal(GetProposalParams) returns (AnyProposal) { }
}

message AnyProposal {
  ProposalBase base = 1;
  google.protobuf.Any content = 2;
}
```

### Custom Query Implementation

In order to implement the query service, we can reuse the existing [gogo protobuf](https://github.com/cosmos/gogoproto)
grpc plugin, which for a service named `Query` generates an interface named
`QueryServer` as below:

```go
type QueryServer interface {
	QueryBalance(context.Context, *QueryBalanceParams) (*types.Coin, error)
	QueryAllBalances(context.Context, *QueryAllBalancesParams) (*QueryAllBalancesResponse, error)
}
```

The custom queries for our module are implemented by implementing this interface.

The first parameter in this generated interface is a generic `context.Context`,
whereas querier methods generally need an instance of `sdk.Context` to read
from the store. Since arbitrary values can be attached to `context.Context`
using the `WithValue` and `Value` methods, the Cosmos SDK should provide a function
`sdk.UnwrapSDKContext` to retrieve the `sdk.Context` from the provided
`context.Context`.

An example implementation of `QueryBalance` for the bank module as above would
look something like:

```go
type Querier struct {
	Keeper
}

func (q Querier) QueryBalance(ctx context.Context, params *types.QueryBalanceParams) (*sdk.Coin, error) {
	balance := q.GetBalance(sdk.UnwrapSDKContext(ctx), params.Address, params.Denom)
	return &balance, nil
}
```

### Custom Query Registration and Routing

Query server implementations as above would be registered with `AppModule`s using
a new method `RegisterQueryService(grpc.Server)` which could be implemented simply
as below:

```go
// x/bank/module.go
func (am AppModule) RegisterQueryService(server grpc.Server) {
	types.RegisterQueryServer(server, keeper.Querier{am.keeper})
}
```

Underneath the hood, a new method `RegisterService(sd *grpc.ServiceDesc, handler interface{})`
will be added to the existing `baseapp.QueryRouter` to add the queries to the custom
query routing table (with the routing method being described below).
The signature for this method matches the existing
`RegisterServer` method on the GRPC `Server` type where `handler` is the custom
query server implementation described above.

GRPC-like requests are routed by the service name (ex. `cosmos_sdk.x.bank.v1.Query`)
and method name (ex. `QueryBalance`) combined with `/`s to form a full
method name (ex. `/cosmos_sdk.x.bank.v1.Query/QueryBalance`). This gets translated
into an ABCI query as `custom/cosmos_sdk.x.bank.v1.Query/QueryBalance`. Service handlers
registered with `QueryRouter.RegisterService` will be routed this way.

Beyond the method name, GRPC requests carry a protobuf encoded payload, which maps naturally
to `RequestQuery.Data`, and receive a protobuf encoded response or error. Thus
there is a quite natural mapping of GRPC-like rpc methods to the existing
`sdk.Query` and `QueryRouter` infrastructure.

This basic specification allows us to reuse protocol buffer `service` definitions
for ABCI custom queries substantially reducing the need for manual decoding and
encoding in query methods.

### GRPC Protocol Support

In addition to providing an ABCI query pathway, we can easily provide a GRPC
proxy server that routes requests in the GRPC protocol to ABCI query requests
under the hood. In this way, clients could use their host languages' existing
GRPC implementations to make direct queries against Cosmos SDK app's using
these `service` definitions. In order for this server to work, the `QueryRouter`
on `BaseApp` will need to expose the service handlers registered with
`QueryRouter.RegisterService` to the proxy server implementation. Nodes could
launch the proxy server on a separate port in the same process as the ABCI app
with a command-line flag.

### REST Queries and Swagger Generation

[grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway) is a project that
translates REST calls into GRPC calls using special annotations on service
methods. Modules that want to expose REST queries should add `google.api.http`
annotations to their `rpc` methods as in this example below.

```protobuf
// x/bank/types/types.proto

service Query {
  rpc QueryBalance(QueryBalanceParams) returns (cosmos_sdk.v1.Coin) {
    option (google.api.http) = {
      get: "/x/bank/v1/balance/{address}/{denom}"
    };
  }
  rpc QueryAllBalances(QueryAllBalancesParams) returns (QueryAllBalancesResponse) {
    option (google.api.http) = {
      get: "/x/bank/v1/balances/{address}"
    };
  }
}
```

grpc-gateway will work direcly against the GRPC proxy described above which will
translate requests to ABCI queries under the hood. grpc-gateway can also
generate Swagger definitions automatically.

In the current implementation of REST queries, each module needs to implement
REST queries manually in addition to ABCI querier methods. Using the grpc-gateway
approach, there will be no need to generate separate REST query handlers, just
query servers as described above as grpc-gateway handles the translation of protobuf
to REST as well as Swagger definitions.

The Cosmos SDK should provide CLI commands for apps to start GRPC gateway either in
a separate process or the same process as the ABCI app, as well as provide a
command for generating grpc-gateway proxy `.proto` files and the `swagger.json`
file.

### Client Usage

The gogo protobuf grpc plugin generates client interfaces in addition to server
interfaces. For the `Query` service defined above we would get a `QueryClient`
interface like:

```go
type QueryClient interface {
	QueryBalance(ctx context.Context, in *QueryBalanceParams, opts ...grpc.CallOption) (*types.Coin, error)
	QueryAllBalances(ctx context.Context, in *QueryAllBalancesParams, opts ...grpc.CallOption) (*QueryAllBalancesResponse, error)
}
```

Via a small patch to gogo protobuf ([gogo/protobuf#675](https://github.com/gogo/protobuf/pull/675))
we have tweaked the grpc codegen to use an interface rather than concrete type
for the generated client struct. This allows us to also reuse the GRPC infrastructure
for ABCI client queries.

1Context`will receive a new method`QueryConn`that returns a`ClientConn`
that routes calls to ABCI queries

Clients (such as CLI methods) will then be able to call query methods like this:

```go
clientCtx := client.NewContext()
queryClient := types.NewQueryClient(clientCtx.QueryConn())
params := &types.QueryBalanceParams{addr, denom}
result, err := queryClient.QueryBalance(gocontext.Background(), params)
```

### Testing

Tests would be able to create a query client directly from keeper and `sdk.Context`
references using a `QueryServerTestHelper` as below:

```go
queryHelper := baseapp.NewQueryServerTestHelper(ctx)
types.RegisterQueryServer(queryHelper, keeper.Querier{app.BankKeeper})
queryClient := types.NewQueryClient(queryHelper)
```

## Future Improvements

## Consequences

### Positive

* greatly simplified querier implementation (no manual encoding/decoding)
* easy query client generation (can use existing grpc and swagger tools)
* no need for REST query implementations
* type safe query methods (generated via grpc plugin)
* going forward, there will be less breakage of query methods because of the
backwards compatibility guarantees provided by buf

### Negative

* all clients using the existing ABCI/REST queries will need to be refactored
for both the new GRPC/REST query paths as well as protobuf/proto-json encoded
data, but this is more or less unavoidable in the protobuf refactoring

### Neutral

## References
