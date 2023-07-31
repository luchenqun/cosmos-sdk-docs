# 状态

状态包含的信息的密码摘要包含在区块头中，因此对于验证新区块是必要的。例如，验证器集合和交易结果从不包含在区块中，但它们的 Merkle 根是包含在区块中的：状态跟踪它们。

`State` 对象本身是一个实现细节，因为它从不包含在区块中或通过网络传播，并且我们从不计算它的哈希。`State` 对象的持久性或查询接口是一个实现细节，不包含在规范中。然而，`State` 对象中的类型是规范的一部分，因为 `State` 对象的 Merkle 根包含在区块中，并且在验证过程中使用值。

```go
type State struct {
    ChainID        string
    InitialHeight  int64

    LastBlockHeight int64
    LastBlockID     types.BlockID
    LastBlockTime   time.Time

    Version     Version
    LastResults []Result
    AppHash     []byte

    LastValidators ValidatorSet
    Validators     ValidatorSet
    NextValidators ValidatorSet

    ConsensusParams ConsensusParams
}
```

链 ID 和初始高度来自创世文件，并且不再更改。在典型情况下，初始高度将为 `1`，`0` 是一个无效值。

请注意，有一个硬编码的限制为 10000 个验证器。这是从提交中的投票数量限制继承而来。

有关 [`Validator`](./data_structures.md#validator)、[`ValidatorSet`](./data_structures.md#validatorset) 和 [`ConsensusParams`](./data_structures.md#consensusparams) 的更多信息可以在 [数据结构](./data_structures.md) 中找到。

## 执行

在执行一个区块的末尾，状态会得到更新。特别感兴趣的是 `ResponseEndBlock` 和 `ResponseCommit`

```go
type ResponseEndBlock struct {
	ValidatorUpdates      []ValidatorUpdate       `protobuf:"bytes,1,rep,name=validator_updates,json=validatorUpdates,proto3" json:"validator_updates"`
	ConsensusParamUpdates *types1.ConsensusParams `protobuf:"bytes,2,opt,name=consensus_param_updates,json=consensusParamUpdates,proto3" json:"consensus_param_updates,omitempty"`
	Events                []Event                 `protobuf:"bytes,3,rep,name=events,proto3" json:"events,omitempty"`
}
```

其中

```go
type ValidatorUpdate struct {
	PubKey crypto.PublicKey `protobuf:"bytes,1,opt,name=pub_key,json=pubKey,proto3" json:"pub_key"`
	Power  int64            `protobuf:"varint,2,opt,name=power,proto3" json:"power,omitempty"`
}
```

和

```go
type ResponseCommit struct {
	// reserve 1
	Data         []byte `protobuf:"bytes,2,opt,name=data,proto3" json:"data,omitempty"`
	RetainHeight int64  `protobuf:"varint,3,opt,name=retain_height,json=retainHeight,proto3" json:"retain_height,omitempty"`
}
```

`ValidatorUpdates` 用于向当前集合添加和删除验证器，以及更新验证器的权重。在 `ValidatorUpdate` 中将验证器的权重设置为 0 将导致该验证器被移除。`ConsensusParams` 被安全地复制（即，如果字段为 nil，则被忽略），并且 `ResponseCommit` 中的 `Data` 被用作 `AppHash`。

## 版本

```go
type Version struct {
  consensus Consensus
  software string
}
```

[`Consensus`](./data_structures.md#version) 包含区块链和应用程序的协议版本。

## 区块

一个区块的总大小由 `ConsensusParams.Block.MaxBytes` 以字节为单位进行限制。
建议的区块大小必须小于此大小，否则将被视为无效。

区块还应该受到区块中交易所消耗的 "gas" 数量的限制，尽管这尚未实现。

## 证据

为了使区块中的证据有效，必须满足以下条件：

```go
block.Header.Time-evidence.Time < ConsensusParams.Evidence.MaxAgeDuration &&
 block.Header.Height-evidence.Height < ConsensusParams.Evidence.MaxAgeNumBlocks
```

一个区块中的证据数量不能超过 `ConsensusParams.Evidence.MaxBytes`。这是为了减轻垃圾邮件攻击而实施的。

## 验证者

创世文件和 `ResponseEndBlock` 中的验证者必须具有类型 ∈ `ConsensusParams.Validator.PubKeyTypes` 的公钥。


# State

The state contains information whose cryptographic digest is included in block headers, and thus is
necessary for validating new blocks. For instance, the validators set and the results of
transactions are never included in blocks, but their Merkle roots are:
the state keeps track of them.

The `State` object itself is an implementation detail, since it is never
included in a block or gossiped over the network, and we never compute
its hash. The persistence or query interface of the `State` object
is an implementation detail and not included in the specification.
However, the types in the `State` object are part of the specification, since
the Merkle roots of the `State` objects are included in blocks and values are used during
validation.

```go
type State struct {
    ChainID        string
    InitialHeight  int64

    LastBlockHeight int64
    LastBlockID     types.BlockID
    LastBlockTime   time.Time

    Version     Version
    LastResults []Result
    AppHash     []byte

    LastValidators ValidatorSet
    Validators     ValidatorSet
    NextValidators ValidatorSet

    ConsensusParams ConsensusParams
}
```

The chain ID and initial height are taken from the genesis file, and not changed again. The
initial height will be `1` in the typical case, `0` is an invalid value.

Note there is a hard-coded limit of 10000 validators. This is inherited from the
limit on the number of votes in a commit.

Further information on [`Validator`'s](./data_structures.md#validator),
[`ValidatorSet`'s](./data_structures.md#validatorset) and
[`ConsensusParams`'s](./data_structures.md#consensusparams) can
be found in [data structures](./data_structures.md)

## Execution

State gets updated at the end of executing a block. Of specific interest is `ResponseEndBlock` and
`ResponseCommit`

```go
type ResponseEndBlock struct {
	ValidatorUpdates      []ValidatorUpdate       `protobuf:"bytes,1,rep,name=validator_updates,json=validatorUpdates,proto3" json:"validator_updates"`
	ConsensusParamUpdates *types1.ConsensusParams `protobuf:"bytes,2,opt,name=consensus_param_updates,json=consensusParamUpdates,proto3" json:"consensus_param_updates,omitempty"`
	Events                []Event                 `protobuf:"bytes,3,rep,name=events,proto3" json:"events,omitempty"`
}
```

where

```go
type ValidatorUpdate struct {
	PubKey crypto.PublicKey `protobuf:"bytes,1,opt,name=pub_key,json=pubKey,proto3" json:"pub_key"`
	Power  int64            `protobuf:"varint,2,opt,name=power,proto3" json:"power,omitempty"`
}
```

and

```go
type ResponseCommit struct {
	// reserve 1
	Data         []byte `protobuf:"bytes,2,opt,name=data,proto3" json:"data,omitempty"`
	RetainHeight int64  `protobuf:"varint,3,opt,name=retain_height,json=retainHeight,proto3" json:"retain_height,omitempty"`
}
```

`ValidatorUpdates` are used to add and remove validators to the current set as well as update
validator power. Setting validator power to 0 in `ValidatorUpdate` will cause the validator to be
removed. `ConsensusParams` are safely copied across (i.e. if a field is nil it gets ignored) and the
`Data` from the `ResponseCommit` is used as the `AppHash`

## Version

```go
type Version struct {
  consensus Consensus
  software string
}
```

[`Consensus`](./data_structures.md#version) contains the protocol version for the blockchain and the
application.

## Block

The total size of a block is limited in bytes by the `ConsensusParams.Block.MaxBytes`.
Proposed blocks must be less than this size, and will be considered invalid
otherwise.

Blocks should additionally be limited by the amount of "gas" consumed by the
transactions in the block, though this is not yet implemented.

## Evidence

For evidence in a block to be valid, it must satisfy:

```go
block.Header.Time-evidence.Time < ConsensusParams.Evidence.MaxAgeDuration &&
 block.Header.Height-evidence.Height < ConsensusParams.Evidence.MaxAgeNumBlocks
```

A block must not contain more than `ConsensusParams.Evidence.MaxBytes` of evidence. This is
implemented to mitigate spam attacks.

## Validator

Validators from genesis file and `ResponseEndBlock` must have pubkeys of type ∈
`ConsensusParams.Validator.PubKeyTypes`.
