# `x/evidence`

* [概念](#概念)
* [状态](#状态)
* [消息](#消息)
* [事件](#事件)
* [参数](#参数)
* [BeginBlock](#beginblock)
* [客户端](#客户端)
    * [CLI](#cli)
    * [REST](#rest)
    * [gRPC](#grpc)

## 摘要

`x/evidence` 是 Cosmos SDK 模块的一个实现，根据 [ADR 009](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-009-evidence-module.md)，
它允许提交和处理任意的不当行为证据，例如错误的行为和事实上的签名。

该证据模块与通常期望底层共识引擎（例如 CometBFT）自动提交证据的标准证据处理不同，而是允许客户端和外部链直接提交更复杂的证据。

所有具体的证据类型都必须实现 `Evidence` 接口合约。提交的 `Evidence` 首先通过证据模块的 `Router` 路由，尝试找到相应注册的 `Handler` 来处理特定的 `Evidence` 类型。
每个 `Evidence` 类型都必须在证据模块的 keeper 中注册一个 `Handler`，以便成功路由和执行。

每个相应的处理程序也必须满足 `Handler` 接口合约。给定 `Evidence` 类型的 `Handler` 可以执行任意的状态转换，例如惩罚、监禁和删除。

## 概念

### 证据

提交给 `x/evidence` 模块的任何具体类型的证据都必须满足以下 `Evidence` 合约。并非所有具体类型的证据都以相同的方式满足此合约，某些数据对于某些证据类型可能完全无关紧要。
还创建了一个扩展 `Evidence` 的 `ValidatorEvidence`，用于定义针对恶意验证器的证据合约。

```go
// Evidence defines the contract which concrete evidence types of misbehavior
// must implement.
type Evidence interface {
	proto.Message

	Route() string
	String() string
	Hash() []byte
	ValidateBasic() error

	// Height at which the infraction occurred
	GetHeight() int64
}

// ValidatorEvidence extends Evidence interface to define contract
// for evidence against malicious validators
type ValidatorEvidence interface {
	Evidence

	// The consensus address of the malicious validator at time of infraction
	GetConsensusAddress() sdk.ConsAddress

	// The total power of the malicious validator at time of infraction
	GetValidatorPower() int64

	// The total validator set power at time of infraction
	GetTotalPower() int64
}
```

### 注册和处理

`x/evidence` 模块首先必须了解所有它要处理的证据类型。这是通过在 `Evidence` 合约中注册 `Route` 方法来实现的，该方法称为 `Router`（下面定义）。
`Router` 接受 `Evidence` 并尝试通过 `Route` 方法找到相应的 `Handler` 来处理 `Evidence`。

```go
type Router interface {
  AddRoute(r string, h Handler) Router
  HasRoute(r string) bool
  GetRoute(path string) Handler
  Seal()
  Sealed() bool
}
```

`Handler`（在下面定义）负责执行处理`Evidence`的全部业务逻辑。这通常包括通过`ValidateBasic`进行无状态检查和通过提供给`Handler`的任何保管人进行有状态检查来验证`Evidence`。此外，`Handler`还可以执行诸如惩罚和监禁验证器等功能。`Handler`处理的所有`Evidence`都应该被持久化。

```go
// Handler defines an agnostic Evidence handler. The handler is responsible
// for executing all corresponding business logic necessary for verifying the
// evidence as valid. In addition, the Handler may execute any necessary
// slashing and potential jailing.
type Handler func(sdk.Context, Evidence) error
```

## 状态

目前，`x/evidence`模块只在状态中存储有效提交的`Evidence`。`Evidence`状态也存储并导出在`x/evidence`模块的`GenesisState`中。

```protobuf
// GenesisState defines the evidence module's genesis state.
message GenesisState {
  // evidence defines all the evidence at genesis.
  repeated google.protobuf.Any evidence = 1;
}

```

所有的`Evidence`都通过使用前缀`0x00`（`KeyPrefixEvidence`）的前缀`KVStore`来检索和存储。

## 消息

### MsgSubmitEvidence

通过`MsgSubmitEvidence`消息提交`Evidence`：

```protobuf
// MsgSubmitEvidence represents a message that supports submitting arbitrary
// Evidence of misbehavior such as equivocation or counterfactual signing.
message MsgSubmitEvidence {
  string              submitter = 1;
  google.protobuf.Any evidence  = 2;
}
```

请注意，`MsgSubmitEvidence`消息的`Evidence`必须在`x/evidence`模块的`Router`中注册相应的`Handler`，以便正确处理和路由。

如果`Evidence`已经注册了相应的`Handler`，则按照以下方式处理：

```go
func SubmitEvidence(ctx Context, evidence Evidence) error {
  if _, ok := GetEvidence(ctx, evidence.Hash()); ok {
    return errorsmod.Wrap(types.ErrEvidenceExists, strings.ToUpper(hex.EncodeToString(evidence.Hash())))
  }
  if !router.HasRoute(evidence.Route()) {
    return errorsmod.Wrap(types.ErrNoEvidenceHandlerExists, evidence.Route())
  }

  handler := router.GetRoute(evidence.Route())
  if err := handler(ctx, evidence); err != nil {
    return errorsmod.Wrap(types.ErrInvalidEvidence, err.Error())
  }

  ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeSubmitEvidence,
			sdk.NewAttribute(types.AttributeKeyEvidenceHash, strings.ToUpper(hex.EncodeToString(evidence.Hash()))),
		),
	)

  SetEvidence(ctx, evidence)
  return nil
}
```

首先，不能已经存在相同类型的有效提交`Evidence`。其次，将`Evidence`路由到`Handler`并执行。最后，如果处理`Evidence`时没有错误，则会发出事件并将其持久化到状态中。

## 事件

`x/evidence`模块发出以下事件：

### Handlers

#### MsgSubmitEvidence

| 类型            | 属性键        | 属性值          |
| --------------- | ------------- | --------------- |
| submit_evidence | evidence_hash | {evidenceHash}  |
| message         | module        | evidence        |
| message         | sender        | {senderAddress} |
| message         | action        | submit_evidence |

## 参数

`evidence`模块不包含任何参数。

## BeginBlock

### 处理Evidence

CometBFT区块可以包含指示验证器是否存在恶意行为的[Evidence](https://github.com/cometbft/cometbft/blob/main/spec/abci/abci%2B%2B_basic_concepts.md#evidence)。相关信息会作为ABCI Evidence在`abci.RequestBeginBlock`中转发给应用程序，以便相应地对验证器进行惩罚。

#### 双签

Cosmos SDK在ABCI `BeginBlock`中处理两种类型的证据：

* `DuplicateVoteEvidence`，
* `LightClientAttackEvidence`。

证据模块以相同的方式处理这两种证据类型。首先，Cosmos SDK将CometBFT具体的证据类型转换为使用`Equivocation`作为具体类型的SDK `Evidence`接口。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/evidence/v1beta1/evidence.proto#L12-L32
```

对于在`block`中提交的某个`Equivocation`要有效，它必须满足：

`Evidence.Timestamp >= block.Timestamp - MaxEvidenceAge`

其中：

* `Evidence.Timestamp`是在高度`Evidence.Height`的块中的时间戳
* `block.Timestamp`是当前块的时间戳。

如果一个块中包含有效的`Equivocation`证据，验证器的质押将被减少（被削减）`SlashFractionDoubleSign`，该值由`x/slashing`模块定义，该模块定义了违规发生时的质押，而不是发现证据时的质押。
我们希望“跟随质押”，即应削减导致违规的质押，即使它已经被重新委托或开始解绑。

此外，验证器将被永久监禁和标记为墓碑状态，以确保该验证器无法再次进入验证器集合。

`Equivocation`证据的处理如下：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/evidence/keeper/infraction.go#L26-L140
```

**注意：**削减、监禁和标记为墓碑状态的调用是通过`x/slashing`模块委托的，该模块会发出信息性事件，并最终将调用委托给`x/staking`模块。有关削减和监禁的文档，请参阅[状态转换](../staking/README.md#state-transitions)。

## 客户端

### 命令行界面（CLI）

用户可以使用命令行界面（CLI）查询和与 `evidence` 模块进行交互。

#### 查询

`query` 命令允许用户查询 `evidence` 状态。

```bash
simd query evidence --help
```

#### evidence

`evidence` 命令允许用户列出所有证据或按哈希列出证据。

用法：

```bash
simd query evidence [flags]
```

按哈希查询证据

示例：

```bash
simd query evidence "DF0C23E8634E480F84B9D5674A7CDC9816466DEC28A3358F73260F68D28D7660"
```

示例输出：

```bash
evidence:
  consensus_address: cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h
  height: 11
  power: 100
  time: "2021-10-20T16:08:38.194017624Z"
```

获取所有证据

示例：

```bash
simd query evidence
```

示例输出：

```bash
evidence:
  consensus_address: cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h
  height: 11
  power: 100
  time: "2021-10-20T16:08:38.194017624Z"
pagination:
  next_key: null
  total: "1"
```

### REST

用户可以使用 REST 端点查询 `evidence` 模块。

#### 证据

按哈希获取证据

```bash
/cosmos/evidence/v1beta1/evidence/{hash}
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/evidence/v1beta1/evidence/DF0C23E8634E480F84B9D5674A7CDC9816466DEC28A3358F73260F68D28D7660"
```

示例输出：

```bash
{
  "evidence": {
    "consensus_address": "cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h",
    "height": "11",
    "power": "100",
    "time": "2021-10-20T16:08:38.194017624Z"
  }
}
```

#### 所有证据

获取所有证据

```bash
/cosmos/evidence/v1beta1/evidence
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/evidence/v1beta1/evidence"
```

示例输出：

```bash
{
  "evidence": [
    {
      "consensus_address": "cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h",
      "height": "11",
      "power": "100",
      "time": "2021-10-20T16:08:38.194017624Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### gRPC

用户可以使用 gRPC 端点查询 `evidence` 模块。

#### 证据

按哈希获取证据

```bash
cosmos.evidence.v1beta1.Query/Evidence
```

示例：

```bash
grpcurl -plaintext -d '{"evidence_hash":"DF0C23E8634E480F84B9D5674A7CDC9816466DEC28A3358F73260F68D28D7660"}' localhost:9090 cosmos.evidence.v1beta1.Query/Evidence
```

示例输出：

```bash
{
  "evidence": {
    "consensus_address": "cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h",
    "height": "11",
    "power": "100",
    "time": "2021-10-20T16:08:38.194017624Z"
  }
}
```

#### 所有证据

获取所有证据

```bash
cosmos.evidence.v1beta1.Query/AllEvidence
```

示例：

```bash
grpcurl -plaintext localhost:9090 cosmos.evidence.v1beta1.Query/AllEvidence
```

示例输出：

```bash
{
  "evidence": [
    {
      "consensus_address": "cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h",
      "height": "11",
      "power": "100",
      "time": "2021-10-20T16:08:38.194017624Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```




# `x/evidence`

* [Concepts](#concepts)
* [State](#state)
* [Messages](#messages)
* [Events](#events)
* [Parameters](#parameters)
* [BeginBlock](#beginblock)
* [Client](#client)
    * [CLI](#cli)
    * [REST](#rest)
    * [gRPC](#grpc)

## Abstract

`x/evidence` is an implementation of a Cosmos SDK module, per [ADR 009](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-009-evidence-module.md),
that allows for the submission and handling of arbitrary evidence of misbehavior such
as equivocation and counterfactual signing.

The evidence module differs from standard evidence handling which typically expects the
underlying consensus engine, e.g. CometBFT, to automatically submit evidence when
it is discovered by allowing clients and foreign chains to submit more complex evidence
directly.

All concrete evidence types must implement the `Evidence` interface contract. Submitted
`Evidence` is first routed through the evidence module's `Router` in which it attempts
to find a corresponding registered `Handler` for that specific `Evidence` type.
Each `Evidence` type must have a `Handler` registered with the evidence module's
keeper in order for it to be successfully routed and executed.

Each corresponding handler must also fulfill the `Handler` interface contract. The
`Handler` for a given `Evidence` type can perform any arbitrary state transitions
such as slashing, jailing, and tombstoning.

## Concepts

### Evidence

Any concrete type of evidence submitted to the `x/evidence` module must fulfill the
`Evidence` contract outlined below. Not all concrete types of evidence will fulfill
this contract in the same way and some data may be entirely irrelevant to certain
types of evidence. An additional `ValidatorEvidence`, which extends `Evidence`,
has also been created to define a contract for evidence against malicious validators.

```go
// Evidence defines the contract which concrete evidence types of misbehavior
// must implement.
type Evidence interface {
	proto.Message

	Route() string
	String() string
	Hash() []byte
	ValidateBasic() error

	// Height at which the infraction occurred
	GetHeight() int64
}

// ValidatorEvidence extends Evidence interface to define contract
// for evidence against malicious validators
type ValidatorEvidence interface {
	Evidence

	// The consensus address of the malicious validator at time of infraction
	GetConsensusAddress() sdk.ConsAddress

	// The total power of the malicious validator at time of infraction
	GetValidatorPower() int64

	// The total validator set power at time of infraction
	GetTotalPower() int64
}
```

### Registration & Handling

The `x/evidence` module must first know about all types of evidence it is expected
to handle. This is accomplished by registering the `Route` method in the `Evidence`
contract with what is known as a `Router` (defined below). The `Router` accepts
`Evidence` and attempts to find the corresponding `Handler` for the `Evidence`
via the `Route` method.

```go
type Router interface {
  AddRoute(r string, h Handler) Router
  HasRoute(r string) bool
  GetRoute(path string) Handler
  Seal()
  Sealed() bool
}
```

The `Handler` (defined below) is responsible for executing the entirety of the
business logic for handling `Evidence`. This typically includes validating the
evidence, both stateless checks via `ValidateBasic` and stateful checks via any
keepers provided to the `Handler`. In addition, the `Handler` may also perform
capabilities such as slashing and jailing a validator. All `Evidence` handled
by the `Handler` should be persisted.

```go
// Handler defines an agnostic Evidence handler. The handler is responsible
// for executing all corresponding business logic necessary for verifying the
// evidence as valid. In addition, the Handler may execute any necessary
// slashing and potential jailing.
type Handler func(sdk.Context, Evidence) error
```


## State

Currently the `x/evidence` module only stores valid submitted `Evidence` in state.
The evidence state is also stored and exported in the `x/evidence` module's `GenesisState`.

```protobuf
// GenesisState defines the evidence module's genesis state.
message GenesisState {
  // evidence defines all the evidence at genesis.
  repeated google.protobuf.Any evidence = 1;
}

```

All `Evidence` is retrieved and stored via a prefix `KVStore` using prefix `0x00` (`KeyPrefixEvidence`).


## Messages

### MsgSubmitEvidence

Evidence is submitted through a `MsgSubmitEvidence` message:

```protobuf
// MsgSubmitEvidence represents a message that supports submitting arbitrary
// Evidence of misbehavior such as equivocation or counterfactual signing.
message MsgSubmitEvidence {
  string              submitter = 1;
  google.protobuf.Any evidence  = 2;
}
```

Note, the `Evidence` of a `MsgSubmitEvidence` message must have a corresponding
`Handler` registered with the `x/evidence` module's `Router` in order to be processed
and routed correctly.

Given the `Evidence` is registered with a corresponding `Handler`, it is processed
as follows:

```go
func SubmitEvidence(ctx Context, evidence Evidence) error {
  if _, ok := GetEvidence(ctx, evidence.Hash()); ok {
    return errorsmod.Wrap(types.ErrEvidenceExists, strings.ToUpper(hex.EncodeToString(evidence.Hash())))
  }
  if !router.HasRoute(evidence.Route()) {
    return errorsmod.Wrap(types.ErrNoEvidenceHandlerExists, evidence.Route())
  }

  handler := router.GetRoute(evidence.Route())
  if err := handler(ctx, evidence); err != nil {
    return errorsmod.Wrap(types.ErrInvalidEvidence, err.Error())
  }

  ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeSubmitEvidence,
			sdk.NewAttribute(types.AttributeKeyEvidenceHash, strings.ToUpper(hex.EncodeToString(evidence.Hash()))),
		),
	)

  SetEvidence(ctx, evidence)
  return nil
}
```

First, there must not already exist valid submitted `Evidence` of the exact same
type. Secondly, the `Evidence` is routed to the `Handler` and executed. Finally,
if there is no error in handling the `Evidence`, an event is emitted and it is persisted to state.


## Events

The `x/evidence` module emits the following events:

### Handlers

#### MsgSubmitEvidence

| Type            | Attribute Key | Attribute Value |
| --------------- | ------------- | --------------- |
| submit_evidence | evidence_hash | {evidenceHash}  |
| message         | module        | evidence        |
| message         | sender        | {senderAddress} |
| message         | action        | submit_evidence |


## Parameters

The evidence module does not contain any parameters.


## BeginBlock

### Evidence Handling

CometBFT blocks can include
[Evidence](https://github.com/cometbft/cometbft/blob/main/spec/abci/abci%2B%2B_basic_concepts.md#evidence) that indicates if a validator committed malicious behavior. The relevant information is forwarded to the application as ABCI Evidence in `abci.RequestBeginBlock` so that the validator can be punished accordingly.

#### Equivocation

The Cosmos SDK handles two types of evidence inside the ABCI `BeginBlock`:

* `DuplicateVoteEvidence`,
* `LightClientAttackEvidence`.

The evidence module handles these two evidence types the same way. First, the Cosmos SDK converts the CometBFT concrete evidence type to an SDK `Evidence` interface using `Equivocation` as the concrete type.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/evidence/v1beta1/evidence.proto#L12-L32
```

For some `Equivocation` submitted in `block` to be valid, it must satisfy:

`Evidence.Timestamp >= block.Timestamp - MaxEvidenceAge`

Where:

* `Evidence.Timestamp` is the timestamp in the block at height `Evidence.Height`
* `block.Timestamp` is the current block timestamp.

If valid `Equivocation` evidence is included in a block, the validator's stake is
reduced (slashed) by `SlashFractionDoubleSign` as defined by the `x/slashing` module
of what their stake was when the infraction occurred, rather than when the evidence was discovered.
We want to "follow the stake", i.e., the stake that contributed to the infraction
should be slashed, even if it has since been redelegated or started unbonding.

In addition, the validator is permanently jailed and tombstoned to make it impossible for that
validator to ever re-enter the validator set.

The `Equivocation` evidence is handled as follows:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/evidence/keeper/infraction.go#L26-L140
```

**Note:** The slashing, jailing, and tombstoning calls are delegated through the `x/slashing` module
that emits informative events and finally delegates calls to the `x/staking` module. See documentation
on slashing and jailing in [State Transitions](../staking/README.md#state-transitions).

## Client

### CLI

A user can query and interact with the `evidence` module using the CLI.

#### Query

The `query` commands allows users to query `evidence` state.

```bash
simd query evidence --help
```

#### evidence

The `evidence` command allows users to list all evidence or evidence by hash.

Usage:

```bash
simd query evidence [flags]
```

To query evidence by hash

Example:

```bash
simd query evidence "DF0C23E8634E480F84B9D5674A7CDC9816466DEC28A3358F73260F68D28D7660"
```

Example Output:

```bash
evidence:
  consensus_address: cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h
  height: 11
  power: 100
  time: "2021-10-20T16:08:38.194017624Z"
```

To get all evidence

Example:

```bash
simd query evidence
```

Example Output:

```bash
evidence:
  consensus_address: cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h
  height: 11
  power: 100
  time: "2021-10-20T16:08:38.194017624Z"
pagination:
  next_key: null
  total: "1"
```

### REST

A user can query the `evidence` module using REST endpoints.

#### Evidence

Get evidence by hash

```bash
/cosmos/evidence/v1beta1/evidence/{hash}
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/evidence/v1beta1/evidence/DF0C23E8634E480F84B9D5674A7CDC9816466DEC28A3358F73260F68D28D7660"
```

Example Output:

```bash
{
  "evidence": {
    "consensus_address": "cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h",
    "height": "11",
    "power": "100",
    "time": "2021-10-20T16:08:38.194017624Z"
  }
}
```

#### All evidence

Get all evidence

```bash
/cosmos/evidence/v1beta1/evidence
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/evidence/v1beta1/evidence"
```

Example Output:

```bash
{
  "evidence": [
    {
      "consensus_address": "cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h",
      "height": "11",
      "power": "100",
      "time": "2021-10-20T16:08:38.194017624Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### gRPC

A user can query the `evidence` module using gRPC endpoints.

#### Evidence

Get evidence by hash

```bash
cosmos.evidence.v1beta1.Query/Evidence
```

Example:

```bash
grpcurl -plaintext -d '{"evidence_hash":"DF0C23E8634E480F84B9D5674A7CDC9816466DEC28A3358F73260F68D28D7660"}' localhost:9090 cosmos.evidence.v1beta1.Query/Evidence
```

Example Output:

```bash
{
  "evidence": {
    "consensus_address": "cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h",
    "height": "11",
    "power": "100",
    "time": "2021-10-20T16:08:38.194017624Z"
  }
}
```

#### All evidence

Get all evidence

```bash
cosmos.evidence.v1beta1.Query/AllEvidence
```

Example:

```bash
grpcurl -plaintext localhost:9090 cosmos.evidence.v1beta1.Query/AllEvidence
```

Example Output:

```bash
{
  "evidence": [
    {
      "consensus_address": "cosmosvalcons1ntk8eualewuprz0gamh8hnvcem2nrcdsgz563h",
      "height": "11",
      "power": "100",
      "time": "2021-10-20T16:08:38.194017624Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```
