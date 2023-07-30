# 查询服务

:::note 概述
Protobuf 查询服务处理 [`queries`](02-messages-and-queries.md#queries)。查询服务特定于定义它们的模块，并且仅处理在该模块中定义的 `queries`。它们从 `BaseApp` 的 [`Query` 方法](../../develop/advanced-concepts/00-baseapp.md#query) 中调用。
:::

:::note

### 先决条件阅读

* [模块管理器](01-module-manager.md)
* [消息和查询](02-messages-and-queries.md)

:::

## 模块查询服务的实现

### gRPC 服务

在定义 Protobuf `Query` 服务时，为每个模块生成一个 `QueryServer` 接口，其中包含所有服务方法：

```go
type QueryServer interface {
	QueryBalance(context.Context, *QueryBalanceParams) (*types.Coin, error)
	QueryAllBalances(context.Context, *QueryAllBalancesParams) (*QueryAllBalancesResponse, error)
}
```

这些自定义查询方法应该由模块的 keeper 在 `./keeper/grpc_query.go` 中实现。这些方法的第一个参数是一个通用的 `context.Context`。因此，Cosmos SDK 提供了一个函数 `sdk.UnwrapSDKContext` 来从提供的 `context.Context` 中检索 `sdk.Context`。

以下是银行模块的示例实现：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/grpc_query.go
```

### 从状态机调用查询

Cosmos SDK v0.47 引入了一个新的 `cosmos.query.v1.module_query_safe` Protobuf 注解，用于声明一个可以从状态机内部调用的查询，例如：

* 可以从另一个模块的 Keeper 调用 Keeper 的查询函数，
* ADR-033 模块间查询调用，
* CosmWasm 合约也可以直接与这些查询交互。

如果 `module_query_safe` 注解设置为 `true`，则表示：

* 查询是确定性的：给定一个块高度，它将在多次调用时返回相同的响应，并且不会在 SDK 补丁版本之间引入任何破坏状态机的更改。
* 气体消耗在调用和补丁版本之间不会波动。

如果您是模块开发人员，并希望为自己的查询使用 `module_query_safe` 注解，您必须确保以下事项：

* 查询是确定性的，并且不会在没有协调升级的情况下引入破坏状态机的更改。
* 它跟踪其燃气，以避免在可能进行高计算查询时未计算燃气的攻击向量。




# Query Services

:::note Synopsis
A Protobuf Query service processes [`queries`](02-messages-and-queries.md#queries). Query services are specific to the module in which they are defined, and only process `queries` defined within said module. They are called from `BaseApp`'s [`Query` method](../../develop/advanced-concepts/00-baseapp.md#query).
:::

:::note

### Pre-requisite Readings

* [Module Manager](01-module-manager.md)
* [Messages and Queries](02-messages-and-queries.md)

:::

## Implementation of a module query service

### gRPC Service

When defining a Protobuf `Query` service, a `QueryServer` interface is generated for each module with all the service methods:

```go
type QueryServer interface {
	QueryBalance(context.Context, *QueryBalanceParams) (*types.Coin, error)
	QueryAllBalances(context.Context, *QueryAllBalancesParams) (*QueryAllBalancesResponse, error)
}
```

These custom queries methods should be implemented by a module's keeper, typically in `./keeper/grpc_query.go`. The first parameter of these methods is a generic `context.Context`. Therefore, the Cosmos SDK provides a function `sdk.UnwrapSDKContext` to retrieve the `sdk.Context` from the provided
`context.Context`.

Here's an example implementation for the bank module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/grpc_query.go
```

### Calling queries from the State Machine

The Cosmos SDK v0.47 introduces a new `cosmos.query.v1.module_query_safe` Protobuf annotation which is used to state that a query that is safe to be called from within the state machine, for example:

* a Keeper's query function can be called from another module's Keeper,
* ADR-033 intermodule query calls,
* CosmWasm contracts can also directly interact with these queries.

If the `module_query_safe` annotation set to `true`, it means:

* The query is deterministic: given a block height it will return the same response upon multiple calls, and doesn't introduce any state-machine breaking changes across SDK patch versions.
* Gas consumption never fluctuates across calls and across patch versions.

If you are a module developer and want to use `module_query_safe` annotation for your own query, you have to ensure the following things:

* the query is deterministic and won't introduce state-machine-breaking changes without coordinated upgrades
* it has its gas tracked, to avoid the attack vector where no gas is accounted for
 on potentially high-computation queries.
