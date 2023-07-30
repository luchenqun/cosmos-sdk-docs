# gRPC、REST和CometBFT终端点

:::note 概述
本文档概述了节点公开的所有终端点：gRPC、REST以及其他一些终端点。
:::

## 所有终端点概述

每个节点都公开以下终端点供用户与节点进行交互，每个终端点都在不同的端口上提供服务。有关如何配置每个终端点的详细信息，请参阅各自终端点的部分。

* gRPC服务器（默认端口：`9090`），
* REST服务器（默认端口：`1317`），
* CometBFT RPC终端点（默认端口：`26657`）。

:::tip
节点还公开了其他一些终端点，例如CometBFT P2P终端点或[Prometheus终端点](https://docs.cometbft.com/v0.37/core/metrics)，这些终端点与Cosmos SDK没有直接关联。有关这些终端点的更多信息，请参阅[CometBFT文档](https://docs.cometbft.com/v0.37/core/configuration)。
:::

## gRPC服务器

在Cosmos SDK中，Protobuf是主要的[编码](./06-encoding.md)库。这带来了一系列基于Protobuf的工具，可以插入到Cosmos SDK中。其中一个工具是[gRPC](https://grpc.io)，这是一个现代的开源高性能RPC框架，在多种语言中具有良好的客户端支持。

每个模块都公开了一个[Protobuf `Query`服务](../../integrate/building-modules/02-messages-and-queries.md#queries)，用于定义状态查询。`Query`服务和用于广播事务的事务服务通过应用程序中的以下函数连接到gRPC服务器：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/types/app.go#L46-L48
```

注意：不可能通过gRPC公开任何[Protobuf `Msg`服务](../../integrate/building-modules/02-messages-and-queries.md#messages)终端点。在使用gRPC广播之前，必须使用CLI或以编程方式生成和签名事务。有关更多信息，请参阅[生成、签名和广播事务](../../user/run-node/03-txs.md)。

`grpc.Server`是一个具体的gRPC服务器，它生成并提供所有gRPC查询请求和广播事务请求。可以在`~/.simapp/config/app.toml`中配置此服务器：

* `grpc.enable = true|false`字段定义gRPC服务器是否应启用。默认为`true`。
* `grpc.address = {string}`字段定义服务器应绑定到的`ip:port`。默认为`localhost:9090`。

:::tip
`~/.simapp`是存储节点配置和数据库的目录。默认情况下，它设置为`~/.{app_name}`。
:::

一旦启动了gRPC服务器，您可以使用gRPC客户端向其发送请求。我们的[与节点交互](../../user/run-node/02-interact-node.md#using-grpc)教程中提供了一些示例。

Cosmos SDK附带的所有可用gRPC端点的概述请参见[Protobuf文档](https://buf.build/cosmos/cosmos-sdk)。

## REST服务器

Cosmos SDK通过gRPC-gateway支持REST路由。

所有路由都在`~/.simapp/config/app.toml`的以下字段中配置：

* `api.enable = true|false`字段定义REST服务器是否应启用。默认为`false`。
* `api.address = {string}`字段定义服务器应绑定到的`ip:port`。默认为`tcp://localhost:1317`。
* 一些其他API配置选项在`~/.simapp/config/app.toml`中定义，连同注释，请直接参考该文件。

### gRPC-gateway REST路由

如果由于各种原因无法使用gRPC（例如，您正在构建一个Web应用程序，而浏览器不支持构建在HTTP2上的gRPC），那么Cosmos SDK通过gRPC-gateway提供REST路由。

[gRPC-gateway](https://grpc-ecosystem.github.io/grpc-gateway/)是一种将gRPC端点公开为REST端点的工具。对于在Protobuf `Query`服务中定义的每个gRPC端点，Cosmos SDK都提供了一个REST等效端点。例如，可以通过`/cosmos.bank.v1beta1.QueryAllBalances` gRPC端点或通过gRPC-gateway `"/cosmos/bank/v1beta1/balances/{address}"` REST端点查询余额：两者都将返回相同的结果。对于在Protobuf `Query`服务中定义的每个RPC方法，相应的REST端点被定义为一个选项：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/query.proto#L23-L30
```

对于应用开发者来说，需要将 gRPC-gateway REST 路由连接到 REST 服务器，可以通过在 ModuleManager 上调用 `RegisterGRPCGatewayRoutes` 函数来实现。

### Swagger

在 API 服务器上，可以通过 `/swagger` 路由访问 [Swagger](https://swagger.io/)（或 OpenAPIv2）规范文件。Swagger 是一种开放规范，描述了服务器提供的 API 端点，包括每个端点的描述、输入参数、返回类型等等。

可以通过 `~/.simapp/config/app.toml` 中的 `api.swagger` 字段来配置是否启用 `/swagger` 端点，默认情况下该字段设置为 true。

对于应用开发者来说，您可能希望根据自定义模块生成自己的 Swagger 定义。Cosmos SDK 的 [Swagger 生成脚本](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/scripts/protoc-swagger-gen.sh) 是一个很好的起点。

## CometBFT RPC

除了 Cosmos SDK，CometBFT 还提供了一个 RPC 服务器。可以通过调整 `~/.simapp/config/config.toml` 中的 `rpc` 表中的参数来配置此 RPC 服务器，默认的监听地址是 `tcp://localhost:26657`。可以在[这里](https://docs.cometbft.com/master/rpc/)找到所有 CometBFT RPC 端点的 OpenAPI 规范。

一些 CometBFT RPC 端点与 Cosmos SDK 直接相关：

* `/abci_query`：此端点将查询应用程序的状态。作为 `path` 参数，可以发送以下字符串：
    * 任何 Protobuf 完全限定的服务方法，例如 `/cosmos.bank.v1beta1.Query/AllBalances`。然后，`data` 字段应包含使用 Protobuf 编码的方法的请求参数。
    * `/app/simulate`：这将模拟一个交易，并返回一些信息，如使用的 gas。
    * `/app/version`：这将返回应用程序的版本。
    * `/store/{path}`：这将直接查询存储。
    * `/p2p/filter/addr/{port}`：这将返回按地址端口过滤的节点 P2P 对等方列表。
    * `/p2p/filter/id/{id}`：这将返回按 ID 过滤的节点 P2P 对等方列表。
* `/broadcast_tx_{aync,async,commit}`：这三个端点将向其他对等方广播交易。CLI、gRPC 和 REST 都提供了[广播交易的方法](01-transactions.md#broadcasting-the-transaction)，但它们在底层都使用了这三个 CometBFT RPC。

## 对比表

| 名称         | 优点                                                                                                                                                                          | 缺点                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| gRPC         | - 可以在各种语言中使用代码生成的存根 <br /> - 支持流式和双向通信（HTTP2） <br /> - 较小的二进制传输大小，传输速度更快                                                         | - 基于HTTP2，在浏览器中不可用 <br /> - 学习曲线较陡（主要是由于Protobuf）                                         |
| REST         | - 无处不在 <br/> - 所有语言都有客户端库，实现更快 <br />                                                                                                                      | - 仅支持一元请求-响应通信（HTTP1.1） <br/> - 较大的传输消息大小（JSON）                                           |
| CometBFT RPC | - 使用简单                                                                                                                                                                   | - 较大的传输消息大小（JSON）                                                                                     |




# gRPC, REST, and CometBFT Endpoints

:::note Synopsis
This document presents an overview of all the endpoints a node exposes: gRPC, REST as well as some other endpoints.
:::

## An Overview of All Endpoints

Each node exposes the following endpoints for users to interact with a node, each endpoint is served on a different port. Details on how to configure each endpoint is provided in the endpoint's own section.

* the gRPC server (default port: `9090`),
* the REST server (default port: `1317`),
* the CometBFT RPC endpoint (default port: `26657`).

:::tip
The node also exposes some other endpoints, such as the CometBFT P2P endpoint, or the [Prometheus endpoint](https://docs.cometbft.com/v0.37/core/metrics), which are not directly related to the Cosmos SDK. Please refer to the [CometBFT documentation](https://docs.cometbft.com/v0.37/core/configuration) for more information about these endpoints.
:::

## gRPC Server

In the Cosmos SDK, Protobuf is the main [encoding](./06-encoding.md) library. This brings a wide range of Protobuf-based tools that can be plugged into the Cosmos SDK. One such tool is [gRPC](https://grpc.io), a modern open-source high performance RPC framework that has decent client support in several languages.

Each module exposes a [Protobuf `Query` service](../../integrate/building-modules/02-messages-and-queries.md#queries) that defines state queries. The `Query` services and a transaction service used to broadcast transactions are hooked up to the gRPC server via the following function inside the application:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/types/app.go#L46-L48
```

Note: It is not possible to expose any [Protobuf `Msg` service](../../integrate/building-modules/02-messages-and-queries.md#messages) endpoints via gRPC. Transactions must be generated and signed using the CLI or programmatically before they can be broadcasted using gRPC. See [Generating, Signing, and Broadcasting Transactions](../../user/run-node/03-txs.md) for more information.

The `grpc.Server` is a concrete gRPC server, which spawns and serves all gRPC query requests and a broadcast transaction request. This server can be configured inside `~/.simapp/config/app.toml`:

* `grpc.enable = true|false` field defines if the gRPC server should be enabled. Defaults to `true`.
* `grpc.address = {string}` field defines the `ip:port` the server should bind to. Defaults to `localhost:9090`.

:::tip
`~/.simapp` is the directory where the node's configuration and databases are stored. By default, it's set to `~/.{app_name}`.
:::

Once the gRPC server is started, you can send requests to it using a gRPC client. Some examples are given in our [Interact with the Node](../../user/run-node/02-interact-node.md#using-grpc) tutorial.

An overview of all available gRPC endpoints shipped with the Cosmos SDK is [Protobuf documentation](https://buf.build/cosmos/cosmos-sdk).

## REST Server

Cosmos SDK supports REST routes via gRPC-gateway.

All routes are configured under the following fields in `~/.simapp/config/app.toml`:

* `api.enable = true|false` field defines if the REST server should be enabled. Defaults to `false`.
* `api.address = {string}` field defines the `ip:port` the server should bind to. Defaults to `tcp://localhost:1317`.
* some additional API configuration options are defined in `~/.simapp/config/app.toml`, along with comments, please refer to that file directly.

### gRPC-gateway REST Routes

If, for various reasons, you cannot use gRPC (for example, you are building a web application, and browsers don't support HTTP2 on which gRPC is built), then the Cosmos SDK offers REST routes via gRPC-gateway.

[gRPC-gateway](https://grpc-ecosystem.github.io/grpc-gateway/) is a tool to expose gRPC endpoints as REST endpoints. For each gRPC endpoint defined in a Protobuf `Query` service, the Cosmos SDK offers a REST equivalent. For instance, querying a balance could be done via the `/cosmos.bank.v1beta1.QueryAllBalances` gRPC endpoint, or alternatively via the gRPC-gateway `"/cosmos/bank/v1beta1/balances/{address}"` REST endpoint: both will return the same result. For each RPC method defined in a Protobuf `Query` service, the corresponding REST endpoint is defined as an option:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/query.proto#L23-L30
```

For application developers, gRPC-gateway REST routes needs to be wired up to the REST server, this is done by calling the `RegisterGRPCGatewayRoutes` function on the ModuleManager.

### Swagger

A [Swagger](https://swagger.io/) (or OpenAPIv2) specification file is exposed under the `/swagger` route on the API server. Swagger is an open specification describing the API endpoints a server serves, including description, input arguments, return types and much more about each endpoint.

Enabling the `/swagger` endpoint is configurable inside `~/.simapp/config/app.toml` via the `api.swagger` field, which is set to true by default.

For application developers, you may want to generate your own Swagger definitions based on your custom modules.
The Cosmos SDK's [Swagger generation script](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/scripts/protoc-swagger-gen.sh) is a good place to start.

## CometBFT RPC

Independently from the Cosmos SDK, CometBFT also exposes a RPC server. This RPC server can be configured by tuning parameters under the `rpc` table in the `~/.simapp/config/config.toml`, the default listening address is `tcp://localhost:26657`. An OpenAPI specification of all CometBFT RPC endpoints is available [here](https://docs.cometbft.com/master/rpc/).

Some CometBFT RPC endpoints are directly related to the Cosmos SDK:

* `/abci_query`: this endpoint will query the application for state. As the `path` parameter, you can send the following strings:
    * any Protobuf fully-qualified service method, such as `/cosmos.bank.v1beta1.Query/AllBalances`. The `data` field should then include the method's request parameter(s) encoded as bytes using Protobuf.
    * `/app/simulate`: this will simulate a transaction, and return some information such as gas used.
    * `/app/version`: this will return the application's version.
    * `/store/{path}`: this will query the store directly.
    * `/p2p/filter/addr/{port}`: this will return a filtered list of the node's P2P peers by address port.
    * `/p2p/filter/id/{id}`: this will return a filtered list of the node's P2P peers by ID.
* `/broadcast_tx_{aync,async,commit}`: these 3 endpoint will broadcast a transaction to other peers. CLI, gRPC and REST expose [a way to broadcast transations](01-transactions.md#broadcasting-the-transaction), but they all use these 3 CometBFT RPCs under the hood.

## Comparison Table

| Name         | Advantages                                                                                                                                                                    | Disadvantages                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| gRPC         | - can use code-generated stubs in various languages <br /> - supports streaming and bidirectional communication (HTTP2) <br /> - small wire binary sizes, faster transmission | - based on HTTP2, not available in browsers <br /> - learning curve (mostly due to Protobuf)                     |
| REST         | - ubiquitous <br/> - client libraries in all languages, faster implementation <br />                                                                                          | - only supports unary request-response communication (HTTP1.1) <br/> - bigger over-the-wire message sizes (JSON) |
| CometBFT RPC | - easy to use                                                                                                                                                                 | - bigger over-the-wire message sizes (JSON)                                                                      |
