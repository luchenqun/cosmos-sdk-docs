# ADR 009: 证据模块

## 变更日志

* 2019年7月31日：初稿
* 2019年10月24日：初步实现

## 状态

已接受

## 背景

为了支持构建高度安全、稳健和互操作的区块链应用程序，Cosmos SDK 需要提供一种机制，可以提交、评估和验证任意证据，并对验证人的任何不当行为（如二次投票、未抵押签名、在未来签署错误的状态转换等）进行一致的惩罚。此外，这样的机制对于任何 IBC 或跨链验证协议的实现都是至关重要的，以支持将任何不当行为从抵押链传递回主链，以便对发生过二次投票的验证人进行惩罚。

## 决策

我们将在 Cosmos SDK 中实现一个证据模块，支持以下功能：

* 为开发人员提供定义自定义证据消息、消息处理程序以及相应的惩罚方法的抽象和接口。
* 支持将证据消息路由到任何模块中的处理程序，以确定提交的不当行为的有效性。
* 支持通过治理机制修改任何证据类型的惩罚。
* 实现查询器以支持查询参数、证据类型、参数以及所有已提交的有效不当行为。

### 类型

首先，我们定义了 `Evidence` 接口类型。`x/evidence` 模块可以实现自己的类型，可以被多个链使用（例如 `CounterFactualEvidence`）。此外，其他模块也可以以类似的方式实现自己的 `Evidence` 类型，以实现治理的可扩展性。需要注意的是，任何实现 `Evidence` 接口的具体类型都可以包含任意字段，例如违规时间。我们希望 `Evidence` 类型保持尽可能的灵活性。

提交证据到`x/evidence`模块时，具体类型必须提供验证人的共识地址，该地址应该被`x/slashing`模块（假设违规是有效的）所知，违规发生的高度以及违规发生时验证人的权重。

```go
type Evidence interface {
  Route() string
  Type() string
  String() string
  Hash() HexBytes
  ValidateBasic() error

  // The consensus address of the malicious validator at time of infraction
  GetConsensusAddress() ConsAddress

  // Height at which the infraction occurred
  GetHeight() int64

  // The total power of the malicious validator at time of infraction
  GetValidatorPower() int64

  // The total validator set power at time of infraction
  GetTotalPower() int64
}
```

### 路由和处理

每个`Evidence`类型必须映射到一个特定的唯一路由，并在`x/evidence`模块中进行注册。它通过`Router`实现来完成这一点。

```go
type Router interface {
  AddRoute(r string, h Handler) Router
  HasRoute(r string) bool
  GetRoute(path string) Handler
  Seal()
}
```

成功通过`x/evidence`模块的路由后，`Evidence`类型将通过一个`Handler`进行处理。这个`Handler`负责执行所有相应的业务逻辑，以验证证据的有效性。此外，`Handler`还可以执行任何必要的惩罚和潜在的监禁。由于惩罚比例通常是由某种形式的静态函数产生的，允许`Handler`执行此操作提供了最大的灵活性。一个例子可以是`k * evidence.GetValidatorPower()`，其中`k`是由治理控制的链上参数。`Evidence`类型应该提供所有外部信息，以便`Handler`进行必要的状态转换。如果没有返回错误，则认为`Evidence`是有效的。

```go
type Handler func(Context, Evidence) error
```

### 提交

`Evidence`通过`MsgSubmitEvidence`消息类型进行提交，该消息类型在`x/evidence`模块的`SubmitEvidence`中进行内部处理。

```go
type MsgSubmitEvidence struct {
  Evidence
}

func handleMsgSubmitEvidence(ctx Context, keeper Keeper, msg MsgSubmitEvidence) Result {
  if err := keeper.SubmitEvidence(ctx, msg.Evidence); err != nil {
    return err.Result()
  }

  // emit events...

  return Result{
    // ...
  }
}
```

`x/evidence`模块的管理器负责将`Evidence`与模块的路由进行匹配，并调用相应的`Handler`，其中可能包括对验证人进行惩罚和监禁。成功后，提交的证据将被持久化。

```go
func (k Keeper) SubmitEvidence(ctx Context, evidence Evidence) error {
  handler := keeper.router.GetRoute(evidence.Route())
  if err := handler(ctx, evidence); err != nil {
    return ErrInvalidEvidence(keeper.codespace, err)
  }

  keeper.setEvidence(ctx, evidence)
  return nil
}
```

### 创世状态

最后，我们需要表示`x/evidence`模块的创世状态。该模块只需要一个包含所有已提交的有效违规和模块处理所需的任何必要参数的列表。`x/evidence`模块将自然地定义和路由本地证据类型，对于这些类型，它很可能需要惩罚常数。

```go
type GenesisState struct {
  Params       Params
  Infractions  []Evidence
}
```

## 结果

### 积极的

* 允许状态机处理链上提交的不当行为，并根据约定的惩罚参数对验证人进行惩罚。
* 允许定义和处理任何模块的证据类型。这进一步允许通过更复杂的机制定义惩罚和监禁。
* 不仅仅依赖于 Tendermint 提交证据。

### 消极的

* 由于无法引入新的证据类型对应的处理程序，因此在现有链上通过治理方式引入新的证据类型没有简单的方法。

### 中立的

* 我们应该无限期地保留违规行为吗？还是应该依赖事件？

## 参考资料

* [ICS](https://github.com/cosmos/ics)
* [IBC 架构](https://github.com/cosmos/ics/blob/master/ibc/1_IBC_ARCHITECTURE.md)
* [Tendermint 分叉责任](https://github.com/tendermint/spec/blob/7b3138e69490f410768d9b1ffc7a17abc23ea397/spec/consensus/fork-accountability.md)


# ADR 009: Evidence Module

## Changelog

* 2019 July 31: Initial draft
* 2019 October 24: Initial implementation

## Status

Accepted

## Context

In order to support building highly secure, robust and interoperable blockchain
applications, it is vital for the Cosmos SDK to expose a mechanism in which arbitrary
evidence can be submitted, evaluated and verified resulting in some agreed upon
penalty for any misbehavior committed by a validator, such as equivocation (double-voting),
signing when unbonded, signing an incorrect state transition (in the future), etc.
Furthermore, such a mechanism is paramount for any
[IBC](https://github.com/cosmos/ics/blob/master/ibc/2_IBC_ARCHITECTURE.md) or
cross-chain validation protocol implementation in order to support the ability
for any misbehavior to be relayed back from a collateralized chain to a primary
chain so that the equivocating validator(s) can be slashed.

## Decision

We will implement an evidence module in the Cosmos SDK supporting the following
functionality:

* Provide developers with the abstractions and interfaces necessary to define
  custom evidence messages, message handlers, and methods to slash and penalize
  accordingly for misbehavior.
* Support the ability to route evidence messages to handlers in any module to
  determine the validity of submitted misbehavior.
* Support the ability, through governance, to modify slashing penalties of any
  evidence type.
* Querier implementation to support querying params, evidence types, params, and
  all submitted valid misbehavior.

### Types

First, we define the `Evidence` interface type. The `x/evidence` module may implement
its own types that can be used by many chains (e.g. `CounterFactualEvidence`).
In addition, other modules may implement their own `Evidence` types in a similar
manner in which governance is extensible. It is important to note any concrete
type implementing the `Evidence` interface may include arbitrary fields such as
an infraction time. We want the `Evidence` type to remain as flexible as possible.

When submitting evidence to the `x/evidence` module, the concrete type must provide
the validator's consensus address, which should be known by the `x/slashing`
module (assuming the infraction is valid), the height at which the infraction
occurred and the validator's power at same height in which the infraction occurred.

```go
type Evidence interface {
  Route() string
  Type() string
  String() string
  Hash() HexBytes
  ValidateBasic() error

  // The consensus address of the malicious validator at time of infraction
  GetConsensusAddress() ConsAddress

  // Height at which the infraction occurred
  GetHeight() int64

  // The total power of the malicious validator at time of infraction
  GetValidatorPower() int64

  // The total validator set power at time of infraction
  GetTotalPower() int64
}
```

### Routing & Handling

Each `Evidence` type must map to a specific unique route and be registered with
the `x/evidence` module. It accomplishes this through the `Router` implementation.

```go
type Router interface {
  AddRoute(r string, h Handler) Router
  HasRoute(r string) bool
  GetRoute(path string) Handler
  Seal()
}
```

Upon successful routing through the `x/evidence` module, the `Evidence` type
is passed through a `Handler`. This `Handler` is responsible for executing all
corresponding business logic necessary for verifying the evidence as valid. In
addition, the `Handler` may execute any necessary slashing and potential jailing.
Since slashing fractions will typically result from some form of static functions,
allow the `Handler` to do this provides the greatest flexibility. An example could
be `k * evidence.GetValidatorPower()` where `k` is an on-chain parameter controlled
by governance. The `Evidence` type should provide all the external information
necessary in order for the `Handler` to make the necessary state transitions.
If no error is returned, the `Evidence` is considered valid.

```go
type Handler func(Context, Evidence) error
```

### Submission

`Evidence` is submitted through a `MsgSubmitEvidence` message type which is internally
handled by the `x/evidence` module's `SubmitEvidence`.

```go
type MsgSubmitEvidence struct {
  Evidence
}

func handleMsgSubmitEvidence(ctx Context, keeper Keeper, msg MsgSubmitEvidence) Result {
  if err := keeper.SubmitEvidence(ctx, msg.Evidence); err != nil {
    return err.Result()
  }

  // emit events...

  return Result{
    // ...
  }
}
```

The `x/evidence` module's keeper is responsible for matching the `Evidence` against
the module's router and invoking the corresponding `Handler` which may include
slashing and jailing the validator. Upon success, the submitted evidence is persisted.

```go
func (k Keeper) SubmitEvidence(ctx Context, evidence Evidence) error {
  handler := keeper.router.GetRoute(evidence.Route())
  if err := handler(ctx, evidence); err != nil {
    return ErrInvalidEvidence(keeper.codespace, err)
  }

  keeper.setEvidence(ctx, evidence)
  return nil
}
```

### Genesis

Finally, we need to represent the genesis state of the `x/evidence` module. The
module only needs a list of all submitted valid infractions and any necessary params
for which the module needs in order to handle submitted evidence. The `x/evidence`
module will naturally define and route native evidence types for which it'll most
likely need slashing penalty constants for.

```go
type GenesisState struct {
  Params       Params
  Infractions  []Evidence
}
```

## Consequences

### Positive

* Allows the state machine to process misbehavior submitted on-chain and penalize
  validators based on agreed upon slashing parameters.
* Allows evidence types to be defined and handled by any module. This further allows
  slashing and jailing to be defined by more complex mechanisms.
* Does not solely rely on Tendermint to submit evidence.

### Negative

* No easy way to introduce new evidence types through governance on a live chain
  due to the inability to introduce the new evidence type's corresponding handler

### Neutral

* Should we persist infractions indefinitely? Or should we rather rely on events?

## References

* [ICS](https://github.com/cosmos/ics)
* [IBC Architecture](https://github.com/cosmos/ics/blob/master/ibc/1_IBC_ARCHITECTURE.md)
* [Tendermint Fork Accountability](https://github.com/tendermint/spec/blob/7b3138e69490f410768d9b1ffc7a17abc23ea397/spec/consensus/fork-accountability.md)
