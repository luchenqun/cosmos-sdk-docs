# 证据

证据是Tendermint安全模型的重要组成部分。尽管核心共识协议提供了对状态机复制的正确性保证，可以容忍不到1/3的故障，但证据系统旨在检测和传播拜占庭错误，其综合能力大于或等于1/3。值得注意的是，证据系统的设计纯粹是为了检测可能的攻击，将其传播，将其提交到链上，并通知运行在Tendermint之上的应用程序。证据本身并不惩罚"不良行为者"，这取决于应用程序的自由裁量权。一种常见的惩罚形式是削减，即被捕获违反协议的验证者将被削减全部或部分投票权。鉴于网络中1/3+仍然是拜占庭的假设，证据容易受到审查制度的影响，因此应该将其视为"尽力而为"的增加安全性的措施。

本文介绍了各种形式的证据，以及它们是如何被检测、传播、验证和提交的。

> 注意：这里的证据是Tendermint内部的，不应与应用程序证据混淆。

## 检测

### 虚假陈述

虚假陈述是最基本的拜占庭错误之一。简单来说，为了阻止状态在所有节点之间的复制，验证者试图说服某个子集的节点提交一个区块，同时说服另一个子集提交另一个区块。这是通过双重投票实现的（因此称为`DuplicateVoteEvidence`）。成功的重复投票攻击需要超过1/3的投票权和上述子集之间的（暂时的）网络分区。这是因为在共识中，投票是传播的。当一个节点观察到来自同一对等方的两个冲突投票时，它将使用这两个证据投票并开始将这些证据传播给其他节点。[验证](#duplicatevoteevidence)将在后面进一步讨论。

```go
type DuplicateVoteEvidence struct {
    VoteA Vote
    VoteB Vote

    // and abci specific fields
}
```

### 轻客户端攻击

轻客户端也符合1/3+的安全模型，然而，通过使用一种不同的、更轻量级的验证方法，它们会受到一种不同类型的1/3+攻击，即拜占庭验证者可能会签署一个轻区块，而轻客户端会认为它是有效的。检测，详细解释请参见[这里](../light-client/detection/detection_003_reviewed.md)，涉及与多个其他节点的比较，希望至少有一个是"诚实的"。一个"诚实的"节点将返回一个具有挑战性的轻区块，供轻客户端验证。如果这个具有挑战性的轻区块也符合[验证标准](../light-client/verification/verification_001_published.md)，那么轻客户端将把"伪造的"轻区块发送给节点。[验证](#lightclientattackevidence)将在后面进一步讨论。

```go
type LightClientAttackEvidence struct {
    ConflictingBlock LightBlock
    CommonHeight int64

      // and abci specific fields
}
```

## 验证

如果一个节点收到证据，它会首先尝试验证它，然后持久化它。
对于拜占庭行为的证据，应该只提交一次（唯一性），并且应该在它发生的一定时间内提交（及时性）。时间范围由 `EvidenceParams` 的 `MaxAgeNumBlocks` 和 `MaxAgeDuration` 定义。在验证者被绑定的权益证明链上，证据的年龄应该小于解绑期，以便验证者仍然可以受到惩罚。基于这两个属性，进行以下初始检查。

1. 证据是否已过期？这是通过获取 `DuplicateVoteEvidence` 中的 `Vote` 的高度或者 `LightClientAttakEvidence` 中的 `CommonHeight` 来完成的。然后使用证据高度来检索头部，从而获取对应证据的区块时间。如果 `CurrentHeight - MaxAgeNumBlocks > EvidenceHeight` 且 `CurrentTime - MaxAgeDuration > EvidenceTime`，则认为证据已过期并将其忽略。

2. 证据是否已经被提交？证据池会跟踪所有已提交证据的哈希，并使用此哈希来确定唯一性。如果新的证据与已提交的证据具有相同的哈希，则新的证据将被忽略。

### DuplicateVoteEvidence

有效的 `DuplicateVoteEvidence` 必须遵守以下规则：

- 验证者地址、高度、轮次和类型必须对两个投票都相同。

- 两个投票的区块ID必须不同（区块ID可以是空块）。

- 验证者必须在该高度的验证者集中。

- 投票签名必须正确签名。这还使用了 `ChainID`，以便我们知道故障发生在这个链上。

### LightClientAttackEvidence

有效的轻客户端攻击证据必须遵守以下规则：

- 如果轻区块的头部无效，从而表明是一次疯狂的攻击，节点必须检查它们是否可以从它们的头部在公共高度到冲突头部之间使用 `verifySkipping`。

- 如果头部是有效的，则验证者集是相同的，这要么是一种等价或遗忘。因此，我们检查验证者集中的 2/3 也签署了冲突的头部。

- 节点拥有的与冲突标题相同高度的头部必须具有不同的哈希值。

- 如果节点的最新头部高度小于冲突头部的高度，则节点必须检查冲突块的时间是否小于此最新头部（这是一种前向疯狂攻击）。

## 共享信息

如果节点验证了证据，它会将其广播给所有对等节点，每隔10秒连续发送相同的证据，直到证据在链上被看到或过期。

## 在链上提交

证据优先于常规交易，因此一个块首先填充了证据，而交易占据了剩余的空间。为了减轻已经受到惩罚的节点通过更多证据对网络进行垃圾邮件攻击的威胁，块中的证据大小可以通过`EvidenceParams.MaxBytes`进行限制。接收到带有证据的块的节点将在发送`Prevote`和`Precommit`投票之前验证证据。证据池通常会缓存验证结果，以便此过程更快。

## 将证据发送给应用程序

在证据被提交后，块会被块执行器处理，并通过`EndBlock`将证据传递给应用程序。证据会被剥离实际的证明，按照有错误的验证者进行拆分，只发送验证者、高度、时间和证据类型。

```proto
enum EvidenceType {
  UNKNOWN             = 0;
  DUPLICATE_VOTE      = 1;
  LIGHT_CLIENT_ATTACK = 2;
}

message Evidence {
  EvidenceType type = 1;
  // The offending validator
  Validator validator = 2 [(gogoproto.nullable) = false];
  // The height when the offense occurred
  int64 height = 3;
  // The corresponding time where the offense occurred
  google.protobuf.Timestamp time = 4 [
    (gogoproto.nullable) = false, (gogoproto.stdtime) = true];
  // Total voting power of the validator set in case the ABCI application does
  // not store historical validators.
  // https://github.com/tendermint/tendermint/issues/4581
  int64 total_voting_power = 5;
}
```

`DuplicateVoteEvidence`和`LightClientAttackEvidence`是自包含的，即可以使用这些证据推导出发送到应用程序的`abci.Evidence`。因此，需要额外的字段：

```go
type DuplicateVoteEvidence struct {
  VoteA *Vote
  VoteB *Vote

  // abci specific information
  TotalVotingPower int64
  ValidatorPower   int64
  Timestamp        time.Time
}

type LightClientAttackEvidence struct {
  ConflictingBlock *LightBlock
  CommonHeight     int64

  // abci specific information
  ByzantineValidators []*Validator
  TotalVotingPower    int64       
  Timestamp           time.Time 
}
```

这些ABCI特定字段不影响证据本身的有效性，但在节点之间必须保持一致，并在链上达成共识。如果发送了具有不正确的ABCI信息的证据，节点将从中创建新的证据，并用正确的信息替换ABCI字段。


# Evidence

Evidence is an important component of Tendermint's security model. Whilst the core
consensus protocol provides correctness gaurantees for state machine replication
that can tolerate less than 1/3 failures, the evidence system looks to detect and
gossip byzantine faults whose combined power is greater than  or equal to 1/3. It is worth noting that
the evidence system is designed purely to detect possible attacks, gossip them,
commit them on chain and inform the application running on top of Tendermint.
Evidence in itself does not punish "bad actors", this is left to the discretion
of the application. A common form of punishment is slashing where the validators
that were caught violating the protocol have all or a portion of their voting
power removed. Evidence, given the assumption that 1/3+ of the network is still
byzantine, is susceptible to censorship and should therefore be considered added
security on a "best effort" basis.

This document walks through the various forms of evidence, how they are detected,
gossiped, verified and committed.

> NOTE: Evidence here is internal to tendermint and should not be confused with
> application evidence

## Detection

### Equivocation

Equivocation is the most fundamental of byzantine faults. Simply put, to prevent
replication of state across all nodes, a validator tries to convince some subset
of nodes to commit one block whilst convincing another subset to commit a
different block. This is achieved by double voting (hence
`DuplicateVoteEvidence`). A successful duplicate vote attack requires greater
than 1/3 voting power and a (temporary) network partition between the aforementioned
subsets. This is because in consensus, votes are gossiped around. When a node
observes two conflicting votes from the same peer, it will use the two votes of
evidence and begin gossiping this evidence to other nodes. [Verification](#duplicatevoteevidence) is addressed further down.

```go
type DuplicateVoteEvidence struct {
    VoteA Vote
    VoteB Vote

    // and abci specific fields
}
```

### Light Client Attacks

Light clients also comply with the 1/3+ security model, however, by using a
different, more lightweight verification method they are subject to a
different kind of 1/3+ attack whereby the byzantine validators could sign an
alternative light block that the light client will think is valid. Detection,
explained in greater detail
[here](../light-client/detection/detection_003_reviewed.md), involves comparison
with multiple other nodes in the hope that at least one is "honest". An "honest"
node will return a challenging light block for the light client to validate. If
this challenging light block also meets the
[validation criteria](../light-client/verification/verification_001_published.md)
then the light client sends the "forged" light block to the node.
[Verification](#lightclientattackevidence) is addressed further down.

```go
type LightClientAttackEvidence struct {
    ConflictingBlock LightBlock
    CommonHeight int64

      // and abci specific fields
}
```

## Verification

If a node receives evidence, it will first try to verify it, then persist it.
Evidence of byzantine behavior should only be committed once (uniqueness) and
should be committed within a certain period from the point that it occurred
(timely). Timelines is defined by the `EvidenceParams`: `MaxAgeNumBlocks` and
`MaxAgeDuration`. In Proof of Stake chains where validators are bonded, evidence
age should be less than the unbonding period so validators still can be
punished. Given these two propoerties the following initial checks are made.

1. Has the evidence expired? This is done by taking the height of the `Vote`
   within `DuplicateVoteEvidence` or `CommonHeight` within
   `LightClientAttakEvidence`. The evidence height is then used to retrieve the
   header and thus the time of the block that corresponds to the evidence. If
   `CurrentHeight - MaxAgeNumBlocks > EvidenceHeight` && `CurrentTime -
   MaxAgeDuration > EvidenceTime`, the evidence is considered expired and
   ignored.

2. Has the evidence already been committed? The evidence pool tracks the hash of
   all committed evidence and uses this to determine uniqueness. If a new
   evidence has the same hash as a committed one, the new evidence will be
   ignored.

### DuplicateVoteEvidence

Valid `DuplicateVoteEvidence` must adhere to the following rules:

- Validator Address, Height, Round and Type must be the same for both votes

- BlockID must be different for both votes (BlockID can be for a nil block)

- Validator must have been in the validator set at that height

- Vote signature must be correctly signed. This also uses `ChainID` so we know
  that the fault occurred on this chain

### LightClientAttackEvidence

Valid Light Client Attack Evidence must adhere to the following rules:

- If the header of the light block is invalid, thus indicating a lunatic attack,
  the node must check that they can use `verifySkipping` from their header at
  the common height to the conflicting header

- If the header is valid, then the validator sets are the same and this is
  either a form of equivocation or amnesia. We therefore check that 2/3 of the
  validator set also signed the conflicting header.

- The nodes own header at the same height as the conflicting header must have a
  different hash to the conflicting header.

- If the nodes latest header is less in height to the conflicting header, then
  the node must check that the conflicting block has a time that is less than
  this latest header (This is a forward lunatic attack).

## Gossiping

If a node verifies evidence it then broadcasts it to all peers, continously sending
the same evidence once every 10 seconds until the evidence is seen on chain or
expires.

## Commiting on Chain

Evidence takes strict priority over regular transactions, thus a block is filled
with evidence first and transactions take up the remainder of the space. To
mitigate the threat of an already punished node from spamming the network with
more evidence, the size of the evidence in a block can be capped by
`EvidenceParams.MaxBytes`. Nodes receiving blocks with evidence will validate
the evidence before sending `Prevote` and `Precommit` votes. The evidence pool
will usually cache verifications so that this process is much quicker.

## Sending Evidence to the Application

After evidence is committed, the block is then processed by the block executor
which delivers the evidence to the application via `EndBlock`. Evidence is
stripped of the actual proof, split up per faulty validator and only the
validator, height, time and evidence type is sent.

```proto
enum EvidenceType {
  UNKNOWN             = 0;
  DUPLICATE_VOTE      = 1;
  LIGHT_CLIENT_ATTACK = 2;
}

message Evidence {
  EvidenceType type = 1;
  // The offending validator
  Validator validator = 2 [(gogoproto.nullable) = false];
  // The height when the offense occurred
  int64 height = 3;
  // The corresponding time where the offense occurred
  google.protobuf.Timestamp time = 4 [
    (gogoproto.nullable) = false, (gogoproto.stdtime) = true];
  // Total voting power of the validator set in case the ABCI application does
  // not store historical validators.
  // https://github.com/tendermint/tendermint/issues/4581
  int64 total_voting_power = 5;
}
```

`DuplicateVoteEvidence` and `LightClientAttackEvidence` are self-contained in
the sense that the evidence can be used to derive the `abci.Evidence` that is
sent to the application. Because of this, extra fields are necessary:

```go
type DuplicateVoteEvidence struct {
  VoteA *Vote
  VoteB *Vote

  // abci specific information
  TotalVotingPower int64
  ValidatorPower   int64
  Timestamp        time.Time
}

type LightClientAttackEvidence struct {
  ConflictingBlock *LightBlock
  CommonHeight     int64

  // abci specific information
  ByzantineValidators []*Validator
  TotalVotingPower    int64       
  Timestamp           time.Time 
}
```

These ABCI specific fields don't affect validity of the evidence itself but must
be consistent amongst nodes and agreed upon on chain. If evidence with the
incorrect abci information is sent, a node will create new evidence from it and
replace the ABCI fields with the correct information.
