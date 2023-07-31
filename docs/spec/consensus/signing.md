# 验证人签名

在这里，我们指定了在签名之前验证提案和投票的规则。
首先，我们包含了一些通用的验证数据结构的注释，这些数据结构对两种类型都是共同的。
然后，我们提供了每种类型的具体验证规则。最后，我们包含了防止双重签名的验证规则。

## SignedMsgType

`SignedMsgType` 是一个单字节，用于指示被签名的消息的类型。
在 Go 中，它的定义如下：

```go
// SignedMsgType is a type of signed message in the consensus.
type SignedMsgType byte

const (
 // Votes
 PrevoteType   SignedMsgType = 0x01
 PrecommitType SignedMsgType = 0x02

 // Proposals
 ProposalType SignedMsgType = 0x20
)
```

所有被签名的消息必须对应于这些类型之一。

## Timestamp

时间戳的验证是微妙的，目前对于提案或投票中包含的时间戳没有任何限制。
预期验证人会诚实地报告他们的本地时钟时间。所有时间戳的中位数
将被用作下一个区块高度的时间戳。

对于给定的验证人，时间戳应该是严格单调递增的，尽管目前没有强制执行这一点。

## ChainID

ChainID 是一个最大长度为 50 字节的非结构化字符串。
将来，ChainID 可能会变得结构化，并且可能会变得更长。
目前，建议为特定的 ChainID 配置签名者，并且只对应该 ChainID 的投票和提案进行签名。

## BlockID

BlockID 是用于表示区块的结构：

```go
type BlockID struct {
 Hash        []byte
 PartsHeader PartSetHeader
}

type PartSetHeader struct {
 Hash  []byte
 Total int
}
```

要包含在有效的投票或提案中，BlockID 必须表示一个 `nil` 区块或一个完整的区块。
我们引入了两个方法，`BlockID.IsZero()` 和 `BlockID.IsComplete()`，分别用于这些情况。

如果以下每个条件对于 BlockID `b` 都为真，则 `BlockID.IsZero()` 返回 true：

```go
b.Hash == nil
b.PartsHeader.Total == 0
b.PartsHeader.Hash == nil
```

如果以下每个条件对于 BlockID `b` 都为真，则 `BlockID.IsComplete()` 返回 true：

```go
len(b.Hash) == 32
b.PartsHeader.Total > 0
len(b.PartsHeader.Hash) == 32
```

## 提案

签名的提案的结构如下：

```go
type CanonicalProposal struct {
 Type      SignedMsgType // type alias for byte
 Height    int64         `binary:"fixed64"`
 Round     int64         `binary:"fixed64"`
 POLRound  int64         `binary:"fixed64"`
 BlockID   BlockID
 Timestamp time.Time
 ChainID   string
}
```

对于提案 `p`，如果以下每个条件都为真，则该提案是有效的：

```go
p.Type == 0x20
p.Height > 0
p.Round >= 0
p.POLRound >= -1
p.BlockID.IsComplete()
```

换句话说，如果提案包含了一个提案的类型（0x20），具有正数且非零的高度，非负的轮次，不小于 -1 的 POLRound，以及一个完整的 BlockID，则该提案是有效的。

## 投票

签名投票的结构如下：

```go
type CanonicalVote struct {
 Type      SignedMsgType // type alias for byte
 Height    int64         `binary:"fixed64"`
 Round     int64         `binary:"fixed64"`
 BlockID   BlockID
 Timestamp time.Time
 ChainID   string
}
```

如果对于投票 `v`，以下每一行都为真，则该投票有效：

```go
v.Type == 0x1 || v.Type == 0x2
v.Height > 0
v.Round >= 0
v.BlockID.IsZero() || v.BlockID.IsComplete()
```

换句话说，如果投票包含了 Prevote 或 Precommit 的类型（分别为 0x1 或 0x2），具有正数且非零的高度，非负的轮数，以及空的或有效的 BlockID，则该投票有效。

## 无效的投票和提案

不满足上述规则的投票和提案被视为无效。传播无效的投票和提案的节点可能会与网络中的其他节点断开连接。然而，请注意，目前没有明确的机制来惩罚签署了无效投票或提案的验证者。

## 双重签名

签名者必须小心，不要签署冲突的消息，也称为“双重签名”或“矛盾签名”。Tendermint 有机制来发布签署了冲突投票的验证者的证据，以便应用程序对其进行惩罚。请注意，Tendermint 目前不处理冲突提案的证据，但将来可能会处理。

### 状态

为了防止这种双重签名，签名者必须跟踪上一条签名消息的高度、轮数和类型。假设签名者保持以下状态 `s`：

```go
type LastSigned struct {
 Height int64
 Round int64
 Type SignedMsgType // byte
}
```

在签署投票或提案 `m` 后，签名者设置：

```go
s.Height = m.Height
s.Round = m.Round
s.Type = m.Type
```

### 提案

如果以下任一行为真，则签名者只应签署提案 `p`：

```go
p.Height > s.Height
p.Height == s.Height && p.Round > s.Round
```

换句话说，只有当提案的高度更高，或者对于相同的高度，轮数更高时，才应签署提案。一旦对于给定的高度和轮数签署了提案或投票，就不应再为相同的高度和轮数签署提案。

### 投票

如果以下任一行为真，则签名者只应签署投票 `v`：

```go
v.Height > s.Height
v.Height == s.Height && v.Round > s.Round
v.Height == s.Height && v.Round == s.Round && v.Step == 0x1 && s.Step == 0x20
v.Height == s.Height && v.Round == s.Round && v.Step == 0x2 && s.Step != 0x2
```

换句话说，只有当投票满足以下条件之一时，才应签署：

- 高度更高
- 对于相同的高度，轮数更高
- 是一个 Prevote，且对于相同的高度和轮数，我们尚未签署 Prevote 或 Precommit（但已签署提案）
- 是一个 Precommit，且对于相同的高度和轮数，我们尚未签署 Precommit（但已签署提案和/或 Prevote）

这意味着一旦验证者为特定的高度和轮次签署了一个预投票，它只能为该高度和轮次签署一个预提交。
而一旦验证者为特定的高度和轮次签署了一个预提交，它就不能再为该高度和轮次签署任何其他消息。

请注意，这包括对`nil`的投票，即`BlockID.IsZero()`为真的情况。如果一个签名者已经为`BlockID.IsZero()`为真的投票签署了一个投票，那么它不能再为相同的高度和轮次签署另一个`BlockID.IsComplete()`为真的相同类型的投票。因此，对于相同的高度和轮次，只能签署一个特定类型（即0x01或0x02）的投票。

### 其他规则

根据Tendermint共识规则，一旦验证者为一个块预提交，它们就会对该块进行“锁定”，这意味着除非它们看到足够的证明（即来自更高轮次的polka），否则它们不能为另一个块进行预投票。有关更多详细信息，请参阅[共识规范](https://arxiv.org/abs/1807.04938)。

违反这个规则被称为“遗忘”。与易变性相比，遗忘很难在没有所有验证者的投票访问的情况下检测到，因为这就构成了“解锁”的理由。因此，在协议中不对遗忘进行惩罚，并且签名者无法轻易地防止遗忘。如果足够多的验证者同时进行遗忘攻击，它们可能会导致区块链的分叉，此时必须启动一个链下协议来收集所有验证者的投票并确定谁的行为不当。有关更多详细信息，请参阅[分叉检测](https://github.com/tendermint/tendermint/pull/3978)。


# Validator Signing

Here we specify the rules for validating a proposal and vote before signing.
First we include some general notes on validating data structures common to both types.
We then provide specific validation rules for each. Finally, we include validation rules to prevent double-sigining.

## SignedMsgType

The `SignedMsgType` is a single byte that refers to the type of the message
being signed. It is defined in Go as follows:

```go
// SignedMsgType is a type of signed message in the consensus.
type SignedMsgType byte

const (
 // Votes
 PrevoteType   SignedMsgType = 0x01
 PrecommitType SignedMsgType = 0x02

 // Proposals
 ProposalType SignedMsgType = 0x20
)
```

All signed messages must correspond to one of these types.

## Timestamp

Timestamp validation is subtle and there are currently no bounds placed on the
timestamp included in a proposal or vote. It is expected that validators will honestly
report their local clock time. The median of all timestamps
included in a commit is used as the timestamp for the next block height.

Timestamps are expected to be strictly monotonic for a given validator, though
this is not currently enforced.

## ChainID

ChainID is an unstructured string with a max length of 50-bytes.
In the future, the ChainID may become structured, and may take on longer lengths.
For now, it is recommended that signers be configured for a particular ChainID,
and to only sign votes and proposals corresponding to that ChainID.

## BlockID

BlockID is the structure used to represent the block:

```go
type BlockID struct {
 Hash        []byte
 PartsHeader PartSetHeader
}

type PartSetHeader struct {
 Hash  []byte
 Total int
}
```

To be included in a valid vote or proposal, BlockID must either represent a `nil` block, or a complete one.
We introduce two methods, `BlockID.IsZero()` and `BlockID.IsComplete()` for these cases, respectively.

`BlockID.IsZero()` returns true for BlockID `b` if each of the following
are true:

```go
b.Hash == nil
b.PartsHeader.Total == 0
b.PartsHeader.Hash == nil
```

`BlockID.IsComplete()` returns true for BlockID `b` if each of the following
are true:

```go
len(b.Hash) == 32
b.PartsHeader.Total > 0
len(b.PartsHeader.Hash) == 32
```

## Proposals

The structure of a proposal for signing looks like:

```go
type CanonicalProposal struct {
 Type      SignedMsgType // type alias for byte
 Height    int64         `binary:"fixed64"`
 Round     int64         `binary:"fixed64"`
 POLRound  int64         `binary:"fixed64"`
 BlockID   BlockID
 Timestamp time.Time
 ChainID   string
}
```

A proposal is valid if each of the following lines evaluates to true for proposal `p`:

```go
p.Type == 0x20
p.Height > 0
p.Round >= 0
p.POLRound >= -1
p.BlockID.IsComplete()
```

In other words, a proposal is valid for signing if it contains the type of a Proposal
(0x20), has a positive, non-zero height, a
non-negative round, a POLRound not less than -1, and a complete BlockID.

## Votes

The structure of a vote for signing looks like:

```go
type CanonicalVote struct {
 Type      SignedMsgType // type alias for byte
 Height    int64         `binary:"fixed64"`
 Round     int64         `binary:"fixed64"`
 BlockID   BlockID
 Timestamp time.Time
 ChainID   string
}
```

A vote is valid if each of the following lines evaluates to true for vote `v`:

```go
v.Type == 0x1 || v.Type == 0x2
v.Height > 0
v.Round >= 0
v.BlockID.IsZero() || v.BlockID.IsComplete()
```

In other words, a vote is valid for signing if it contains the type of a Prevote
or Precommit (0x1 or 0x2, respectively), has a positive, non-zero height, a
non-negative round, and an empty or valid BlockID.

## Invalid Votes and Proposals

Votes and proposals which do not satisfy the above rules are considered invalid.
Peers gossipping invalid votes and proposals may be disconnected from other peers on the network.
Note, however, that there is not currently any explicit mechanism to punish validators signing votes or proposals that fail
these basic validation rules.

## Double Signing

Signers must be careful not to sign conflicting messages, also known as "double signing" or "equivocating".
Tendermint has mechanisms to publish evidence of validators that signed conflicting votes, so they can be punished
by the application. Note Tendermint does not currently handle evidence of conflciting proposals, though it may in the future.

### State

To prevent such double signing, signers must track the height, round, and type of the last message signed.
Assume the signer keeps the following state, `s`:

```go
type LastSigned struct {
 Height int64
 Round int64
 Type SignedMsgType // byte
}
```

After signing a vote or proposal `m`, the signer sets:

```go
s.Height = m.Height
s.Round = m.Round
s.Type = m.Type
```

### Proposals

A signer should only sign a proposal `p` if any of the following lines are true:

```go
p.Height > s.Height
p.Height == s.Height && p.Round > s.Round
```

In other words, a proposal should only be signed if it's at a higher height, or a higher round for the same height.
Once a proposal or vote has been signed for a given height and round, a proposal should never be signed for the same height and round.

### Votes

A signer should only sign a vote `v` if any of the following lines are true:

```go
v.Height > s.Height
v.Height == s.Height && v.Round > s.Round
v.Height == s.Height && v.Round == s.Round && v.Step == 0x1 && s.Step == 0x20
v.Height == s.Height && v.Round == s.Round && v.Step == 0x2 && s.Step != 0x2
```

In other words, a vote should only be signed if it's:

- at a higher height
- at a higher round for the same height
- a prevote for the same height and round where we haven't signed a prevote or precommit (but have signed a proposal)
- a precommit for the same height and round where we haven't signed a precommit (but have signed a proposal and/or a prevote)

This means that once a validator signs a prevote for a given height and round, the only other message it can sign for that height and round is a precommit.
And once a validator signs a precommit for a given height and round, it must not sign any other message for that same height and round.

Note this includes votes for `nil`, ie. where `BlockID.IsZero()` is true. If a
signer has already signed a vote where `BlockID.IsZero()` is true, it cannot
sign another vote with the same type for the same height and round where
`BlockID.IsComplete()` is true. Thus only a single vote of a particular type
(ie. 0x01 or 0x02) can be signed for the same height and round.

### Other Rules

According to the rules of Tendermint consensus, once a validator precommits for
a block, they become "locked" on that block, which means they can't prevote for
another block unless they see sufficient justification (ie. a polka from a
higher round). For more details, see the [consensus
spec](https://arxiv.org/abs/1807.04938).

Violating this rule is known as "amnesia". In contrast to equivocation,
which is easy to detect, amnesia is difficult to detect without access to votes
from all the validators, as this is what constitutes the justification for
"unlocking". Hence, amnesia is not punished within the protocol, and cannot
easily be prevented by a signer. If enough validators simultaneously commit an
amnesia attack, they may cause a fork of the blockchain, at which point an
off-chain protocol must be engaged to collect votes from all the validators and
determine who misbehaved. For more details, see [fork
detection](https://github.com/tendermint/tendermint/pull/3978).
