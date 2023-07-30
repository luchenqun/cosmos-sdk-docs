# ADR 046: 模块参数

## 更新日志

* 2021年9月22日：初稿

## 状态

建议中

## 摘要

本ADR描述了Cosmos SDK模块如何使用、交互和存储各自的参数的替代方法。

## 背景

目前，在Cosmos SDK中，需要使用参数的模块使用`x/params`模块。`x/params`模块的工作方式是，模块通过一个简单的`Params`结构定义参数，并将该结构注册到`x/params`模块中的一个唯一的`Subspace`中，该`Subspace`属于相应的注册模块。然后，注册模块可以独立访问其相应的`Subspace`。通过这个`Subspace`，模块可以获取和设置其`Params`结构。

此外，Cosmos SDK的`x/gov`模块直接支持通过`ParamChangeProposal`治理提案类型在链上更改参数，利益相关者可以对建议的参数更改进行投票。

使用`x/params`模块来管理各个模块的参数存在各种权衡。主要的优点是，管理参数基本上是“免费”的，开发人员只需要定义`Params`结构、`Subspace`和各种辅助函数（例如`Params`类型上的`ParamSetPairs`），但也存在一些明显的缺点。这些缺点包括参数通过JSON序列化到状态中，这种方式非常慢。此外，通过`ParamChangeProposal`治理提案进行的参数更改无法从状态中读取或写入。换句话说，在尝试更改参数时，当前无法在应用程序中进行任何状态转换。

## 决策

我们将基于`x/gov`和`x/authz`的对齐工作，参考[#9810](https://github.com/cosmos/cosmos-sdk/pull/9810)。即，模块开发人员将创建一个或多个唯一的参数数据结构，这些结构必须被序列化到状态中。Param数据结构必须实现具有相应Protobuf Msg服务方法的`sdk.Msg`接口，该方法将验证并更新所有必要的参数更改。通过在[#9810](https://github.com/cosmos/cosmos-sdk/pull/9810)中完成的工作，`x/gov`模块将分发Param消息，这些消息将由Protobuf Msg服务处理。

注意，如何组织参数和相应的 `sdk.Msg` 消息的结构是由开发者决定的。考虑当前在 `x/auth` 中使用 `x/params` 模块进行参数管理定义的参数：

```protobuf
message Params {
  uint64 max_memo_characters       = 1;
  uint64 tx_sig_limit              = 2;
  uint64 tx_size_cost_per_byte     = 3;
  uint64 sig_verify_cost_ed25519   = 4;
  uint64 sig_verify_cost_secp256k1 = 5;
}
```

开发者可以选择为 `Params` 中的每个字段创建一个唯一的数据结构，或者可以像上面 `x/auth` 的情况一样创建一个单独的 `Params` 结构。

在前一种 `x/params` 的方法中，需要为每个字段创建一个 `sdk.Msg` 以及一个处理程序。如果有很多参数字段，这可能会变得繁琐。在后一种情况下，只有一个数据结构和一个消息处理程序，但是消息处理程序可能需要更复杂，因为它可能需要理解哪些参数被更改，哪些参数保持不变。

参数更改提案使用 `x/gov` 模块进行。执行是通过 `x/authz` 授权到根 `x/gov` 模块的账户进行的。

继续使用 `x/auth`，我们展示一个更完整的示例：

```go
type Params struct {
	MaxMemoCharacters      uint64
	TxSigLimit             uint64
	TxSizeCostPerByte      uint64
	SigVerifyCostED25519   uint64
	SigVerifyCostSecp256k1 uint64
}

type MsgUpdateParams struct {
	MaxMemoCharacters      uint64
	TxSigLimit             uint64
	TxSizeCostPerByte      uint64
	SigVerifyCostED25519   uint64
	SigVerifyCostSecp256k1 uint64
}

type MsgUpdateParamsResponse struct {}

func (ms msgServer) UpdateParams(goCtx context.Context, msg *types.MsgUpdateParams) (*types.MsgUpdateParamsResponse, error) {
  ctx := sdk.UnwrapSDKContext(goCtx)

  // verification logic...

  // persist params
  params := ParamsFromMsg(msg)
  ms.SaveParams(ctx, params)

  return &types.MsgUpdateParamsResponse{}, nil
}

func ParamsFromMsg(msg *types.MsgUpdateParams) Params {
  // ...
}
```

还应提供一个 gRPC `Service` 查询，例如：

```protobuf
service Query {
  // ...
  
  rpc Params(QueryParamsRequest) returns (QueryParamsResponse) {
    option (google.api.http).get = "/cosmos/<module>/v1beta1/params";
  }
}

message QueryParamsResponse {
  Params params = 1 [(gogoproto.nullable) = false];
}
```

## 结果

通过实现模块参数方法论，我们获得了使模块参数更具状态和可扩展性以适应几乎每个应用程序的用例的能力。我们将能够发出事件（并使用 [事件钩子](https://github.com/cosmos/cosmos-sdk/discussions/9656) 中提出的工作触发注册到该事件的钩子），调用其他 Msg 服务方法或执行迁移。此外，当涉及从状态读取和写入参数时，特别是在一致地读取一组特定参数时，性能将显著提高。

然而，这种方法论将要求开发者实现更多的类型和 Msg 服务方法，如果存在许多参数，可能会变得繁琐。此外，开发者需要实现模块参数的持久化逻辑。不过，这应该是微不足道的。

### 向后兼容性

使用新的模块参数方法与现有的 `x/params` 模块自然不兼容。然而，`x/params` 将继续存在于 Cosmos SDK，并被标记为已弃用，除了可能的错误修复外，不会添加任何额外的功能。请注意，`x/params` 模块可能在将来的版本中被完全移除。

### 正面影响

* 模块参数的序列化更高效
* 模块能够对参数变化做出反应并执行其他操作。
* 可以发出特殊事件，允许触发钩子。

### 负面影响

* 模块参数对模块开发者来说变得稍微繁琐：
    * 现在模块需要负责持久化和检索参数状态
    * 现在模块需要具有唯一的消息处理程序来处理每个唯一参数数据结构的参数变化。

### 中性影响

* 需要审查和合并 [#9810](https://github.com/cosmos/cosmos-sdk/pull/9810)。

<!-- ## 进一步讨论

当 ADR 处于 DRAFT 或 PROPOSED 阶段时，此部分应包含未来迭代中要解决的问题摘要（通常引用拉取请求讨论中的评论）。
稍后，此部分可以选择性地列出作者或审阅者在分析此 ADR 过程中发现的想法或改进。 -->

## 参考资料

* https://github.com/cosmos/cosmos-sdk/pull/9810
* https://github.com/cosmos/cosmos-sdk/issues/9438
* https://github.com/cosmos/cosmos-sdk/discussions/9913


# ADR 046: Module Params

## Changelog

* Sep 22, 2021: Initial Draft

## Status

Proposed

## Abstract

This ADR describes an alternative approach to how Cosmos SDK modules use, interact,
and store their respective parameters.

## Context

Currently, in the Cosmos SDK, modules that require the use of parameters use the
`x/params` module. The `x/params` works by having modules define parameters,
typically via a simple `Params` structure, and registering that structure in
the `x/params` module via a unique `Subspace` that belongs to the respective
registering module. The registering module then has unique access to its respective
`Subspace`. Through this `Subspace`, the module can get and set its `Params`
structure.

In addition, the Cosmos SDK's `x/gov` module has direct support for changing
parameters on-chain via a `ParamChangeProposal` governance proposal type, where
stakeholders can vote on suggested parameter changes.

There are various tradeoffs to using the `x/params` module to manage individual
module parameters. Namely, managing parameters essentially comes for "free" in
that developers only need to define the `Params` struct, the `Subspace`, and the
various auxiliary functions, e.g. `ParamSetPairs`, on the `Params` type. However,
there are some notable drawbacks. These drawbacks include the fact that parameters
are serialized in state via JSON which is extremely slow. In addition, parameter
changes via `ParamChangeProposal` governance proposals have no way of reading from
or writing to state. In other words, it is currently not possible to have any
state transitions in the application during an attempt to change param(s).

## Decision

We will build off of the alignment of `x/gov` and `x/authz` work per
[#9810](https://github.com/cosmos/cosmos-sdk/pull/9810). Namely, module developers
will create one or more unique parameter data structures that must be serialized
to state. The Param data structures must implement `sdk.Msg` interface with respective
Protobuf Msg service method which will validate and update the parameters with all
necessary changes. The `x/gov` module via the work done in
[#9810](https://github.com/cosmos/cosmos-sdk/pull/9810), will dispatch Param
messages, which will be handled by Protobuf Msg services.

Note, it is up to developers to decide how to structure their parameters and
the respective `sdk.Msg` messages. Consider the parameters currently defined in
`x/auth` using the `x/params` module for parameter management:

```protobuf
message Params {
  uint64 max_memo_characters       = 1;
  uint64 tx_sig_limit              = 2;
  uint64 tx_size_cost_per_byte     = 3;
  uint64 sig_verify_cost_ed25519   = 4;
  uint64 sig_verify_cost_secp256k1 = 5;
}
```

Developers can choose to either create a unique data structure for every field in
`Params` or they can create a single `Params` structure as outlined above in the
case of `x/auth`.

In the former, `x/params`, approach, a `sdk.Msg` would need to be created for every single
field along with a handler. This can become burdensome if there are a lot of
parameter fields. In the latter case, there is only a single data structure and
thus only a single message handler, however, the message handler might have to be
more sophisticated in that it might need to understand what parameters are being
changed vs what parameters are untouched.

Params change proposals are made using the `x/gov` module. Execution is done through
`x/authz` authorization to the root `x/gov` module's account.

Continuing to use `x/auth`, we demonstrate a more complete example:

```go
type Params struct {
	MaxMemoCharacters      uint64
	TxSigLimit             uint64
	TxSizeCostPerByte      uint64
	SigVerifyCostED25519   uint64
	SigVerifyCostSecp256k1 uint64
}

type MsgUpdateParams struct {
	MaxMemoCharacters      uint64
	TxSigLimit             uint64
	TxSizeCostPerByte      uint64
	SigVerifyCostED25519   uint64
	SigVerifyCostSecp256k1 uint64
}

type MsgUpdateParamsResponse struct {}

func (ms msgServer) UpdateParams(goCtx context.Context, msg *types.MsgUpdateParams) (*types.MsgUpdateParamsResponse, error) {
  ctx := sdk.UnwrapSDKContext(goCtx)

  // verification logic...

  // persist params
  params := ParamsFromMsg(msg)
  ms.SaveParams(ctx, params)

  return &types.MsgUpdateParamsResponse{}, nil
}

func ParamsFromMsg(msg *types.MsgUpdateParams) Params {
  // ...
}
```

A gRPC `Service` query should also be provided, for example:

```protobuf
service Query {
  // ...
  
  rpc Params(QueryParamsRequest) returns (QueryParamsResponse) {
    option (google.api.http).get = "/cosmos/<module>/v1beta1/params";
  }
}

message QueryParamsResponse {
  Params params = 1 [(gogoproto.nullable) = false];
}
```

## Consequences

As a result of implementing the module parameter methodology, we gain the ability
for module parameter changes to be stateful and extensible to fit nearly every
application's use case. We will be able to emit events (and trigger hooks registered
to that events using the work proposed in [event hooks](https://github.com/cosmos/cosmos-sdk/discussions/9656)),
call other Msg service methods or perform migration.
In addition, there will be significant gains in performance when it comes to reading
and writing parameters from and to state, especially if a specific set of parameters
are read on a consistent basis.

However, this methodology will require developers to implement more types and
Msg service metohds which can become burdensome if many parameters exist. In addition,
developers are required to implement persistance logics of module parameters.
However, this should be trivial.

### Backwards Compatibility

The new method for working with module parameters is naturally not backwards
compatible with the existing `x/params` module. However, the `x/params` will
remain in the Cosmos SDK and will be marked as deprecated with no additional
functionality being added apart from potential bug fixes. Note, the `x/params`
module may be removed entirely in a future release.

### Positive

* Module parameters are serialized more efficiently
* Modules are able to react on parameters changes and perform additional actions.
* Special events can be emitted, allowing hooks to be triggered.

### Negative

* Module parameters becomes slightly more burdensome for module developers:
    * Modules are now responsible for persisting and retrieving parameter state
    * Modules are now required to have unique message handlers to handle parameter
      changes per unique parameter data structure.

### Neutral

* Requires [#9810](https://github.com/cosmos/cosmos-sdk/pull/9810) to be reviewed
  and merged.

<!-- ## Further Discussions

While an ADR is in the DRAFT or PROPOSED stage, this section should contain a summary of issues to be solved in future iterations (usually referencing comments from a pull-request discussion).
Later, this section can optionally list ideas or improvements the author or reviewers found during the analysis of this ADR. -->

## References

* https://github.com/cosmos/cosmos-sdk/pull/9810
* https://github.com/cosmos/cosmos-sdk/issues/9438
* https://github.com/cosmos/cosmos-sdk/discussions/9913
