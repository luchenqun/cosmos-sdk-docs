# 数据结构

在Tendermint区块链中，我们描述了数据结构以及验证它们的规则。

Tendermint区块链由以下几种数据类型组成：

- [数据结构](#数据结构)
  - [区块](#区块)
  - [执行](#执行)
  - [头部](#头部)
  - [版本](#版本)
  - [区块ID](#区块id)
  - [部分集头部](#部分集头部)
  - [部分](#部分)
  - [时间](#时间)
  - [数据](#数据)
  - [提交](#提交)
  - [提交签名](#提交签名)
  - [区块ID标志](#区块id标志)
  - [投票](#投票)
  - [规范投票](#规范投票)
  - [提案](#提案)
  - [签名消息类型](#签名消息类型)
  - [签名](#签名)
  - [证据列表](#证据列表)
  - [证据](#证据)
    - [重复投票证据](#重复投票证据)
    - [轻客户端攻击证据](#轻客户端攻击证据)
  - [轻区块](#轻区块)
  - [签名头部](#签名头部)
  - [验证者集](#验证者集)
  - [验证者](#验证者)
  - [地址](#地址)
  - [共识参数](#共识参数)
    - [区块参数](#区块参数)
    - [证据参数](#证据参数)
    - [验证者参数](#验证者参数)
    - [版本参数](#版本参数)
  - [证明](#证明)


## 区块

一个区块由头部、交易、投票（提交）和一系列违规证据（即签署冲突的投票）组成。

| 名称    | 类型                | 描述                                                                                                                                                                                                 | 验证                                                                                   |
|---------|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| 头部    | [头部](#头部)       | 与该区块对应的头部。该字段包含了在共识和其他协议领域中使用的信息。要了解它包含了什么，请访问[头部](#头部)。                                                                                             | 必须遵循[头部](#头部)的验证规则                                                         |
| 数据    | [数据](#数据)       | 数据包含了一系列交易。交易的内容对Tendermint来说是未知的。                                                                                                                                             | 该字段可以为空或填充，但不会进行验证。应用程序可以在区块创建之前使用[checkTx](../abci/abci.md#checktx)对单个交易进行验证。|
| 证据    | [证据列表](#证据列表) | 证据包含了验证者所犯的违规行为的列表。                                                                                                                                                               | 可以为空，但当填充时，将遵循[证据列表](#证据列表)的验证规则。                          |
| 最后提交 | [提交](#提交)       | `最后提交`包含了每个验证者的一次投票。所有投票必须是对上一个区块的投票，或者为空。如果投票是对上一个区块的投票，它必须有相应验证者的有效签名。投票的验证者的投票权重之和必须大于完整验证者集的总投票权重的2/3。一个提交中的投票数量限制为10000（参见`types.MaxVotesCount`）。 | 对于初始高度，必须为空，并且必须遵循[提交](#提交)的验证规则。                           |

## 执行

一旦一个区块被验证通过，就可以对其进行执行。

状态遵循以下递归方程：

```go
state(initialHeight) = 初始状态
state(h+1) <- 执行(state(h), ABCIApp, block(h))
```

其中，`初始状态`包括初始共识参数和验证人集合，`ABCIApp`是一个可以返回结果和对验证人集合进行更改的ABCI应用（待办事项）。执行定义如下：

```go
func Execute(s State, app ABCIApp, block Block) State {
 // Fuction ApplyBlock executes block of transactions against the app and returns the new root hash of the app state,
 // modifications to the validator set and the changes of the consensus parameters.
 AppHash, ValidatorChanges, ConsensusParamChanges := app.ApplyBlock(block)

 nextConsensusParams := UpdateConsensusParams(state.ConsensusParams, ConsensusParamChanges)
 return State{
  ChainID:         state.ChainID,
  InitialHeight:   state.InitialHeight,
  LastResults:     abciResponses.DeliverTxResults,
  AppHash:         AppHash,
  InitialHeight:   state.InitialHeight,
  LastValidators:  state.Validators,
  Validators:      state.NextValidators,
  NextValidators:  UpdateValidators(state.NextValidators, ValidatorChanges),
  ConsensusParams: nextConsensusParams,
  Version: {
   Consensus: {
    AppVersion: nextConsensusParams.Version.AppVersion,
   },
  },
 }
}
```

在进行`prevote`、`precommit`和`finalizeCommit`阶段之前，首先要验证一个新的区块。

验证一个新区块的步骤如下：

- 检查区块及其字段的有效性规则。
- 检查版本（区块和应用程序）与本地状态中的版本是否相同。
- 检查链ID是否匹配。
- 检查高度是否正确。
- 检查`LastBlockID`是否对应于当前状态中的BlockID。
- 检查头部中的哈希是否与状态中的哈希匹配。
- 验证LastCommit与状态的一致性，对于初始高度，此步骤将被跳过。
    - 这是检查签名是否对应于正确区块的地方。
- 确保提议者是验证人集合的一部分。
- 验证区块时间。
    - 确保新区块的时间晚于上一个区块的时间。
    - 计算中位时间并将其与区块的时间进行比较。
    - 如果区块的高度是初始高度，则检查是否与创世时间匹配。
- 验证区块中的证据。注意：证据可以为空。

## 头部

区块头部包含有关区块和共识的元数据，以及对当前区块中的数据、上一个区块和应用程序返回结果的承诺：

| 名称              | 类型                      | 描述                                                                                                                                                                                                                                                                                                                                                                           | 验证                                                                                                                                                                                       |
|-------------------|---------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 版本           | [版本](#版本)       | 版本定义了正在使用的应用程序和协议版本。                                                                                                                                                                                                                                                                                                                       | 必须遵守[版本](#版本)的验证规则                                                                                                                                       |
| 链ID           | 字符串                    | 链ID是链的ID。这必须是您的链上唯一的。                                                                                                                                                                                                                                                                                                                    | 链ID必须小于50个字节。                                                                                                                                                              |
| 高度            | uint64                     | 高度是此头部的高度。                                                                                                                                                                                                                                                                                                                                                 | 必须大于0，大于等于initialHeight，并且等于前一个高度+1                                                                                                                                          |
| 时间              | [时间](#时间)             | 时间戳等于最后一次提交中存在的验证人的加权中位数。有关时间的更多信息，请参阅[BFT时间部分](../consensus/bft-time.md)。注意：投票的时间戳必须比被投票的区块的时间戳至少晚一毫秒。                                                                                                       | 时间必须大于等于前一个头部的时间戳+共识参数TimeIotaMs。第一个区块的时间戳必须等于创世时间（因为没有投票来计算中位数）。 |
| 上一个区块ID       | [区块ID](#区块id)       | 上一个区块的区块ID。                                                                                                                                                                                                                                                                                                                                                        | 必须遵守[区块ID](#区块id)的验证规则。第一个区块的`block.Header.LastBlockID == BlockID{}`。                                                                         |
| 上一次提交哈希    | 字节切片 (`[]byte`) | 上一次提交的签名的Merkle根哈希。这些签名代表了已经提交到上一个区块的验证人。第一个区块的哈希为空的字节切片。                                                                                                                                                                                                       | 长度必须为32                                                                                                                                                                            |
| 数据哈希          | 字节切片 (`[]byte`) | 交易哈希的Merkle根哈希。**注意**：交易在包含在Merkle树中之前会被哈希处理，Merkle树的叶子节点是哈希值，而不是交易本身。                                                                                                                                                                                | 长度必须为32                                                                                                                                                                            |
| 验证人哈希     | 字节切片 (`[]byte`) | 当前验证人集合的Merkle根哈希。在计算Merkle根哈希之前，验证人首先按投票权重（降序）和地址（升序）进行排序。                                                                                                                                                                                                                 | 长度必须为32                                                                                                                                                                            |
| 下一个验证人哈希 | 字节切片 (`[]byte`) | 下一个验证人集合的Merkle根哈希。在计算Merkle根哈希之前，验证人首先按投票权重（降序）和地址（升序）进行排序。                                                                                                                                                                                                                    | 长度必须为32                                                                                                                                                                            |
| 共识哈希     | 字节切片 (`[]byte`) | protobuf编码的共识参数的哈希。                                                                                                                                                                                                                                                                                                                                    | 长度必须为32                                                                                                                                                                            |
| 应用哈希           | 字节切片 (`[]byte`) | 在执行和提交上一个区块后应用程序返回的任意字节数组。它用作验证来自ABCI应用程序的任何Merkle证明的基础，并代表实际应用程序的状态，而不是区块链本身的状态。第一个区块的`block.Header.AppHash`由`ResponseInitChain.app_hash`给出。 | 此哈希由应用程序确定，Tendermint无法对其进行验证。                                                                                                         |
| 上一次结果哈希    | 字节切片 (`[]byte`) | `LastResultsHash`是从`ResponseDeliverTx`响应（忽略`Log`、`Info`、`Codespace`和`Events`字段）构建的Merkle树的根哈希。                                                                                                                                                                                                                             | 长度必须为32。第一个区块的`block.Header.ResultsHash == MerkleRoot(nil)`，即空输入的哈希，符合RFC-6962的规范。                                             |
| 证据哈希      | 字节切片 (`[]byte`) | 包含在此区块中的拜占庭行为的证据的Merkle根哈希。                                                                                                                                                                                                                                                                                                             | 长度必须为32                                                                                                                                                                            |
| 提议者地址   | 字节切片 (`[]byte`) | 区块的原始提议者的地址。验证人必须在当前验证人集合中。                                                                                                                                                                                                                                                                                         | 长度必须为20                                                                                                                                                                            |

## 版本

注意：这更具体地指的是共识版本，并不包括P2P版本等信息。（待办事项：我们应该编写一份全面的关于版本控制的文档，供此处参考）

| 名称   | 类型    | 描述                                                                                                          | 验证                                                                                                                      |
|--------|---------|--------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| 区块   | uint64  | 此数字表示区块协议的版本，并且在整个运行中的网络中必须保持一致                                                   | 必须等于网络中使用的协议版本（`block.Version.Block == state.Version.Consensus.Block`）                                  |
| 应用   | uint64  | 应用版本由应用程序决定。请阅读[这里](../abci/abci.md#info)                                                     | `block.Version.App == state.Version.Consensus.App`                                                                       |

## 区块ID

`BlockID`包含区块的两个不同的Merkle根哈希。`BlockID`包括这两个哈希以及部分数量（即`len(MakeParts(block))`）。

| 名称           | 类型                            | 描述                                                                                                                             | 验证                                                                                                   |
|----------------|---------------------------------|---------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| 哈希           | 字节切片 (`[]byte`)             | 头部中所有字段的Merkle根哈希（即`MerkleRoot(header)`）。                                                                             | 哈希的长度必须为32                                                                                     |
| PartSetHeader | [PartSetHeader](#PartSetHeader) | 用于在共识期间安全地传播区块的Merkle根哈希，是完整序列化区块切分为多个部分的Merkle根哈希（即`MerkleRoot(MakeParts(block))`）。 | 必须符合[PartSetHeader](#PartSetHeader)的验证规则                                                         |

请参阅[MerkleRoot](./encoding.md#MerkleRoot)获取详细信息。

## PartSetHeader

| 名称   | 类型                        | 描述                             | 验证                 |
|--------|-----------------------------|----------------------------------|----------------------|
| Total  | int32                       | 区块的总部分数量                  | 必须大于 0           |
| Hash   | 字节切片 (`[]byte`)          | 序列化区块的 MerkleRoot           | 必须长度为 32        |

## Part

Part 定义了区块的一部分。在 Tendermint 中，区块被分成 `parts` 进行传播。

| 名称   | 类型            | 描述                             | 验证                 |
|--------|-----------------|----------------------------------|----------------------|
| index  | int32           | 区块的总部分数量                  | 必须大于 0           |
| bytes  | 字节切片        | 序列化区块的 MerkleRoot           | 必须长度为 32        |
| proof  | [Proof](#proof) | 序列化区块的 MerkleRoot           | 必须长度为 32        |

## Time

Tendermint 使用 [Google.Protobuf.Timestamp](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.Timestamp) 格式，其中使用两个整数，一个 64 位整数表示秒，一个 32 位整数表示纳秒。

## Data

Data 只是一个事务列表的包装器，其中事务是任意字节数组：

| 名称 | 类型                           | 描述                 | 验证                                                                                      |
|------|--------------------------------|---------------------|-----------------------------------------------------------------------------------------|
| Txs  | 字节矩阵 ([][]byte)             | 事务的切片          | 在此字段上不进行验证，此数据对 Tendermint 是未知的 |

## Commit

Commit 是一个简单的签名列表包装器，每个验证者都有一个签名。它还包含相关的 BlockID、高度和轮数：

| 名称       | 类型                                   | 描述                                                                 | 验证                                                                                                      |
|------------|----------------------------------------|----------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Height     | uint64                                 | 创建此提交的高度。                                                    | 必须大于 0                                                                                                 |
| Round      | int32                                  | 提交对应的轮数。                                                      | 必须大于 0                                                                                                 |
| BlockID    | [BlockID](#blockid)                    | 对应区块的 BlockID。                                                   | 必须符合 [BlockID](#blockid) 的验证规则。                                                                   |
| Signatures | [CommitSig](#commitsig) 数组           | 与当前验证者集合对应的提交签名数组。                                    | 签名的长度必须大于 0，并且每个单独的 [Commitsig](#commitsig) 必须符合验证规则。 |

## CommitSig

`CommitSig`表示验证人的签名，验证人可以对空块、特定的`BlockID`或者没有投票进行投票。它是`Commit`的一部分，可以用于根据验证人集合重构投票集合。

| 名称              | 类型                          | 描述                                                                                           | 验证                                                         |
|------------------|-----------------------------|-----------------------------------------------------------------------------------------------|--------------------------------------------------------------|
| BlockIDFlag      | [BlockIDFlag](#blockidflag) | 表示验证人在共识中的参与情况：投票给获得多数的块、投票给其他块、投票为空或者没有投票。 | 必须是[BlockIDFlag](#blockidflag)枚举中的一个字段              |
| ValidatorAddress | [Address](#address)         | 验证人的地址                                                                                   | 长度必须为20                                                  |
| Timestamp        | [Time](#time)               | 此字段将在`CommitSig`到`CommitSig`之间变化。它表示验证人的时间戳。                             | [Time](#time)                                                 |
| Signature        | [Signature](#signature)     | 与验证人在共识中的参与相对应的签名。                                                           | 签名的长度必须大于0且小于64                                   |

注意：`ValidatorAddress`和`Timestamp`字段可能在将来被移除（参见[ADR-25](https://github.com/tendermint/tendermint/blob/main/docs/architecture/adr-025-commit.md)）。

## BlockIDFlag

BlockIDFlag表示[signature](#commitsig)所属的BlockID。

```go
enum BlockIDFlag {
  BLOCK_ID_FLAG_UNKNOWN = 0;
  BLOCK_ID_FLAG_ABSENT  = 1; // signatures for other blocks are also considered absent
  BLOCK_ID_FLAG_COMMIT  = 2;
  BLOCK_ID_FLAG_NIL     = 3;
}
```

## 投票

投票是来自验证者对特定区块的签名消息。
投票包括有关签署者的信息。在区块链中存储或在网络上传播时，投票以Protobuf编码。

| 名称               | 类型                              | 描述                                                                                      | 验证                                                                                                 |
|------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| 类型             | [SignedMsgType](#signedmsgtype) | 可以是prevote或precommit。[SignedMsgType](#signedmsgtype)                                | 如果投票的相应字段包含在枚举[signedMsgType](#signedmsgtype)中，则投票有效 |
| 高度           | uint64                           | 创建此投票的高度                                                                         | 必须大于0                                                                                          |
| 轮数            | int32                           | 与提交相对应的轮数。                                                       | 必须大于0                                                                                          |
| 区块ID          | [BlockID](#blockid)             | 相应区块的blockID                                                     | [BlockID](#blockid)                                                                                  |
| 时间戳        | [Time](#Time)                   | 时间戳表示验证者签名的时间。                                  | [Time](#time)                                                                                        |
| 验证者地址 | 字节切片 (`[]byte`)       | 验证者的地址                                                                    | 长度必须等于20                                                                           |
| 验证者索引   | int32                           | 对应于验证者集合中的验证者索引的特定区块高度的索引。 | 必须大于0                                                                                          |
| 签名        | 字节切片 (`[]byte`)       | 如果验证者参与了关联区块的共识，则为验证者的签名。       | 签名的长度必须大于0且小于64                                                             |

## CanonicalVote

CanonicalVote用于验证人签名。这种类型不会出现在区块中。通过`CanonicalVote`表示投票，同时通过`type.SignBytes`使用protobuf进行编码，其中包括`ChainID`，并且使用不同的字段顺序。

```proto
message CanonicalVote {
  SignedMsgType             type      = 1;
  fixed64                  height    = 2;
  sfixed64                  round     = 3;
  CanonicalBlockID          block_id  = 4;
  google.protobuf.Timestamp timestamp = 5;
  string                    chain_id  = 6;
}
```

对于签名，投票通过[`CanonicalVote`](#canonicalvote)表示，并且通过`type.SignBytes`使用protobuf进行编码，其中包括`ChainID`，并且使用不同的字段顺序。

我们定义了一个名为`Verify`的方法，如果签名针对`SignBytes`使用给定的ChainID进行验证，则返回`true`：

```go
func (vote *Vote) Verify(chainID string, pubKey crypto.PubKey) error {
 if !bytes.Equal(pubKey.Address(), vote.ValidatorAddress) {
  return ErrVoteInvalidValidatorAddress
 }
 v := vote.ToProto()
 if !pubKey.VerifyBytes(types.VoteSignBytes(chainID, v), vote.Signature) {
  return ErrVoteInvalidSignature
 }
 return nil
}
```

## 提案

提案包含了提出该提案的高度和轮次，以及作为唯一标识符的BlockID，时间戳和POLRound（所谓的Proof-of-Lock（POL）轮次），该轮次用于终止共识。如果POLRound >= 0，则BlockID对应于在POLRound中锁定的块。该消息由验证人私钥签名。

| 名称       | 类型                            | 描述                                                                                   | 验证                                                     |
|------------|---------------------------------|---------------------------------------------------------------------------------------|---------------------------------------------------------|
| 类型       | [SignedMsgType](#signedmsgtype) | 表示提案的[SignedMsgType](#signedmsgtype)                                               | 必须为`ProposalType` [signedMsgType](#signedmsgtype)    |
| 高度       | uint64                           | 创建此投票的高度                                                                       | 必须 > 0                                                |
| 轮次       | int32                           | 提交对应的轮次                                                                         | 必须 > 0                                                |
| POLRound   | int64                           | 锁定证明                                                                               | 必须 > 0                                                |
| BlockID    | [BlockID](#blockid)             | 相应块的blockID                                                                         | [BlockID](#blockid)                                     |
| 时间戳     | [Time](#Time)                   | 时间戳表示验证人签名的时间                                                              | [Time](#time)                                           |
| 签名       | 字节切片 (`[]byte`)             | 如果验证人参与了关联块的共识，则由验证人签名                                               | 签名的长度必须 > 0 且 < 64                              |

## SignedMsgType

签名消息类型表示共识中的已签名消息。

```proto
enum SignedMsgType {

  SIGNED_MSG_TYPE_UNKNOWN = 0;
  // Votes
  SIGNED_MSG_TYPE_PREVOTE   = 1;
  SIGNED_MSG_TYPE_PRECOMMIT = 2;

  // Proposal
  SIGNED_MSG_TYPE_PROPOSAL = 32;
}
```

## Signature

Tendermint中的签名是表示底层签名的原始字节。

有关更多信息，请参阅[签名规范](./encoding.md#key-types)。

## EvidenceList

EvidenceList是一个简单的包装器，用于存储证据列表：

| 名称      | 类型                           | 描述                                 | 验证                                                         |
|----------|--------------------------------|--------------------------------------|--------------------------------------------------------------|
| Evidence | [Evidence](#evidence)的数组 | 经过验证的[evidence](#evidence)列表 | 验证符合各个[Evidence](#evidence)类型的规则 |

## Evidence

Tendermint中的证据用于指示验证者在共识中的违规行为。

有关Tendermint中证据如何工作的更多信息，请参见[此处](../consensus/evidence.md)。

### DuplicateVoteEvidence

`DuplicateVoteEvidence`表示在同一轮次和同一高度中，验证者对两个不同的区块进行了投票。投票按`BlockID`进行字典排序。

| 名称             | 类型          | 描述                                                         | 验证                                                   |
|------------------|---------------|--------------------------------------------------------------|--------------------------------------------------------|
| VoteA            | [Vote](#vote) | 验证者在发生不一致时提交的其中一个投票                        | VoteA必须符合[Vote](#vote)的验证规则                     |
| VoteB            | [Vote](#vote) | 验证者在发生不一致时提交的第二个投票                          | VoteB必须符合[Vote](#vote)的验证规则                     |
| TotalVotingPower | int64         | 发生不一致的高度处的验证者集合的总权重                         | 必须等于节点自身的数据副本                               |
| ValidatorPower   | int64         | 发生不一致的高度处的验证者的权重                               | 必须等于节点自身的数据副本                               |
| Timestamp        | [Time](#Time) | 发生不一致的区块的时间                                         | 必须等于节点自身的数据副本                               |

### LightClientAttackEvidence

`LightClientAttackEvidence`是一种通用的证据，用于捕获所有已知的轻客户端攻击形式，以便全节点可以验证、提议和提交证据到链上，对恶意验证者进行惩罚。攻击形式包括：疯狂攻击、等价攻击和遗忘攻击。这些攻击形式是详尽无遗的。您可以在[这里](../light-client/accountability#the_misbehavior_of_faulty_validators)找到更详细的概述。

| 名称                 | 类型                               | 描述                                                         | 验证                                                         |
|----------------------|------------------------------------|--------------------------------------------------------------|--------------------------------------------------------------|
| ConflictingBlock     | [LightBlock](#LightBlock)          | 请参阅下文                                                   | 必须遵守[lightBlock](#lightblock)的验证规则                  |
| CommonHeight         | int64                              | 请参阅下文                                                   | 必须大于0                                                    |
| Byzantine Validators | [Validators](#Validators)数组       | 行为恶意的验证者                                             | 请参阅下文                                                   |
| TotalVotingPower     | int64                              | 违规高度时验证者集合的总权重                                  | 必须与节点自身的数据副本相等                                |
| Timestamp            | [Time](#Time)                      | 违规发生的区块的时间                                          | 必须与节点自身的数据副本相等                                |

## LightBlock

LightBlock是[轻客户端](../light-client/README.md)的核心数据结构。它结合了两个用于验证的数据结构（[signedHeader](#signedheader)和[validatorSet](#validatorset)）。

| 名称          | 类型                            | 描述                                                                                                                                  | 验证                                                                                      |
|--------------|---------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| SignedHeader | [SignedHeader](#signedheader)   | 头部和提交，用于验证目的。要了解更多，请访问[轻客户端文档](../light-client/README.md)                                                   | 不能为nil，并且必须符合[signedHeader](#signedheader)的验证规则                             |
| ValidatorSet | [ValidatorSet](#validatorset)   | ValidatorSet用于帮助验证提交违规的验证者是否真的在验证者集中。                                                                         | 不能为nil，并且必须符合[validatorSet](#validatorset)的验证规则                             |

`SignedHeader`和`ValidatorSet`通过验证者集的哈希值进行关联(`SignedHeader.ValidatorsHash == ValidatorSet.Hash()`。

## SignedHeader

SignedHeader是由[header](#header)和用于证明的commit组成。

| 名称   | 类型              | 描述       | 验证                                                                                      |
|--------|-------------------|------------|-----------------------------------------------------------------------------------------|
| Header | [Header](#Header) | [Header](#header) | Header不能为nil，并且必须符合[Header](#Header)的验证条件                             |
| Commit | [Commit](#commit) | [Commit](#commit) | Commit不能为nil，并且必须符合[Commit](#commit)的验证条件                             |

## ValidatorSet

| 名称       | 类型                             | 描述                                        | 验证                                                                                                                |
|------------|----------------------------------|--------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| Validators | [validator](#validator)的数组 | 特定高度的活跃验证者列表                     | 验证者列表不能为空或为nil，并且必须符合[validator](#validator)的验证规则                             |
| Proposer   | [validator](#validator)          | 相应块的块提议者                            | 提议者不能为nil，并且必须符合[validator](#validator)的验证规则                    |

## 验证器

| 名称              | 类型                        | 描述                                                                                      | 验证                                             |
|------------------|---------------------------|------------------------------------------------------------------------------------------|---------------------------------------------------|
| 地址             | [Address](#address)       | 验证器地址                                                                                | 长度必须为20个字节                                 |
| 公钥             | 字节切片 (`[]byte`) | 验证器公钥                                                                                | 长度必须大于0                                     |
| 投票权           | int64                     | 验证器的投票权                                                                            | 不能小于0                                         |
| 提议者优先级 | int64                     | 验证器的提议者优先级。用于判断验证器何时轮到提议区块                                 | 无验证，值可以为负数和正数 |

## 地址

地址是字节切片的类型别名。地址是通过对公钥进行sha256哈希计算，并截取切片的前20个字节得到的。

```go
const (
  TruncatedSize = 20
)

func SumTruncated(bz []byte) []byte {
  hash := sha256.Sum256(bz)
  return hash[:TruncatedSize]
}
```

## 共识参数

| 名称      | 类型                                | 描述                                                                  | 字段编号 |
|-----------|-------------------------------------|----------------------------------------------------------------------|--------------|
| 区块     | [BlockParams](#blockparams)         | 限制区块大小和连续区块之间的时间的参数                                 | 1            |
| 证据  | [EvidenceParams](#evidenceparams)   | 限制拜占庭行为证据的有效性的参数                                         | 2            |
| 验证器 | [ValidatorParams](#validatorparams) | 限制验证器可以使用的公钥类型的参数                                     | 3            |
| 版本   | [BlockParams](#blockparams)         | ABCI应用程序版本                                                         | 4            |

### BlockParams

| 名称       | 类型   | 描述                                                                                                                                                                                                 | 字段编号 |
|------------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
| max_bytes  | int64  | 区块的最大大小，以字节为单位。                                                                                                                                                                        | 1        |
| max_gas    | int64  | 提议区块中 `GasWanted` 的最大总和。注意：如果存在拜占庭式提议者，可能会提交违反此规定的区块。在处理区块时，应用程序有责任处理此问题！                                                                 | 2        |

### EvidenceParams

| 名称                 | 类型                                                                                                                               | 描述                                                                                                                                                                                                                                                                             | 字段编号 |
|----------------------|------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
| max_age_num_blocks   | int64                                                                                                                              | 证据的最大年龄，以区块为单位。                                                                                                                                                                                                                                                 | 1        |
| max_age_duration     | [google.protobuf.Duration](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.Duration) | 证据的最大年龄，以时间为单位。它应与应用程序的“解绑期”或其他类似机制相对应，用于处理[无所谓攻击](https://github.com/ethereum/wiki/wiki/Proof-of-Stake-FAQ#what-is-the-nothing-at-stake-problem-and-how-can-it-be-fixed)。 | 2        |
| max_bytes            | int64                                                                                                                              | 允许输入到区块中的总证据的最大大小，以字节为单位                                                                                                                                                                                                                                 | 3        |

### ValidatorParams

| 名称           | 类型             | 描述                                                         | 字段编号 |
|----------------|------------------|-------------------------------------------------------------|----------|
| pub_key_types | 重复的字符串 | 接受的公钥类型列表。使用与 `PubKey.Type` 相同的命名。 | 1            |

### VersionParams

| 名称         | 类型   | 描述                   | 字段编号 |
|-------------|--------|-----------------------|----------|
| app_version | uint64 | ABCI 应用程序版本。 | 1            |

## Proof

| 名称       | 类型           | 描述                                   | 字段编号 |
|-----------|----------------|---------------------------------------|----------|
| total     | int64          | 项目的总数。                        | 1            |
| index     | int64          | 要证明的项目索引。                          | 2            |
| leaf_hash | bytes          | 项目值的哈希。                           | 3            |
| aunts     | 重复的字节 | 从叶子节点的兄弟节点到根节点的子节点的哈希。 | 4            |


# Data Structures

Here we describe the data structures in the Tendermint blockchain and the rules for validating them.

The Tendermint blockchains consists of a short list of data types:

- [Data Structures](#data-structures)
  - [Block](#block)
  - [Execution](#execution)
  - [Header](#header)
  - [Version](#version)
  - [BlockID](#blockid)
  - [PartSetHeader](#partsetheader)
  - [Part](#part)
  - [Time](#time)
  - [Data](#data)
  - [Commit](#commit)
  - [CommitSig](#commitsig)
  - [BlockIDFlag](#blockidflag)
  - [Vote](#vote)
  - [CanonicalVote](#canonicalvote)
  - [Proposal](#proposal)
  - [SignedMsgType](#signedmsgtype)
  - [Signature](#signature)
  - [EvidenceList](#evidencelist)
  - [Evidence](#evidence)
    - [DuplicateVoteEvidence](#duplicatevoteevidence)
    - [LightClientAttackEvidence](#lightclientattackevidence)
  - [LightBlock](#lightblock)
  - [SignedHeader](#signedheader)
  - [ValidatorSet](#validatorset)
  - [Validator](#validator)
  - [Address](#address)
  - [ConsensusParams](#consensusparams)
    - [BlockParams](#blockparams)
    - [EvidenceParams](#evidenceparams)
    - [ValidatorParams](#validatorparams)
    - [VersionParams](#versionparams)
  - [Proof](#proof)


## Block

A block consists of a header, transactions, votes (the commit),
and a list of evidence of malfeasance (ie. signing conflicting votes).

| Name   | Type              | Description                                                                                                                                                                          | Validation                                               |
|--------|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------|
| Header | [Header](#header) | Header corresponding to the block. This field contains information used throughout consensus and other areas of the protocol. To find out what it contains, visit [header](#header) | Must adhere to the validation rules of [header](#header) |
| Data       | [Data](#data)                  | Data contains a list of transactions. The contents of the transaction is unknown to Tendermint.                                                                                      | This field can be empty or populated, but no validation is performed. Applications can perform validation on individual transactions prior to block creation using [checkTx](../abci/abci.md#checktx).
| Evidence   | [EvidenceList](#evidence_list) | Evidence contains a list of infractions committed by validators.                                                                                                                     | Can be empty, but when populated the validations rules from [evidenceList](#evidence_list) apply |
| LastCommit | [Commit](#commit)              | `LastCommit` includes one vote for every validator.  All votes must either be for the previous block, nil or absent. If a vote is for the previous block it must have a valid signature from the corresponding validator. The sum of the voting power of the validators that voted must be greater than 2/3 of the total voting power of the complete validator set. The number of votes in a commit is limited to 10000 (see `types.MaxVotesCount`).                                                                                             | Must be empty for the initial height and must adhere to the validation rules of [commit](#commit).  |

## Execution

Once a block is validated, it can be executed against the state.

The state follows this recursive equation:

```go
state(initialHeight) = InitialState
state(h+1) <- Execute(state(h), ABCIApp, block(h))
```

where `InitialState` includes the initial consensus parameters and validator set,
and `ABCIApp` is an ABCI application that can return results and changes to the validator
set (TODO). Execute is defined as:

```go
func Execute(s State, app ABCIApp, block Block) State {
 // Fuction ApplyBlock executes block of transactions against the app and returns the new root hash of the app state,
 // modifications to the validator set and the changes of the consensus parameters.
 AppHash, ValidatorChanges, ConsensusParamChanges := app.ApplyBlock(block)

 nextConsensusParams := UpdateConsensusParams(state.ConsensusParams, ConsensusParamChanges)
 return State{
  ChainID:         state.ChainID,
  InitialHeight:   state.InitialHeight,
  LastResults:     abciResponses.DeliverTxResults,
  AppHash:         AppHash,
  InitialHeight:   state.InitialHeight,
  LastValidators:  state.Validators,
  Validators:      state.NextValidators,
  NextValidators:  UpdateValidators(state.NextValidators, ValidatorChanges),
  ConsensusParams: nextConsensusParams,
  Version: {
   Consensus: {
    AppVersion: nextConsensusParams.Version.AppVersion,
   },
  },
 }
}
```

Validating a new block is first done prior to the `prevote`, `precommit` & `finalizeCommit` stages.

The steps to validate a new block are:

- Check the validity rules of the block and its fields.
- Check the versions (Block & App) are the same as in local state.
- Check the chainID's match.
- Check the height is correct.
- Check the `LastBlockID` corresponds to BlockID currently in state.
- Check the hashes in the header match those in state.
- Verify the LastCommit against state, this step is skipped for the initial height.
    - This is where checking the signatures correspond to the correct block will be made.
- Make sure the proposer is part of the validator set.
- Validate bock time.
    - Make sure the new blocks time is after the previous blocks time.
    - Calculate the medianTime and check it against the blocks time.
    - If the blocks height is the initial height then check if it matches the genesis time.
- Validate the evidence in the block. Note: Evidence can be empty

## Header

A block header contains metadata about the block and about the consensus, as well as commitments to
the data in the current block, the previous block, and the results returned by the application:

| Name              | Type                      | Description                                                                                                                                                                                                                                                                                                                                                                           | Validation                                                                                                                                                                                       |
|-------------------|---------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Version           | [Version](#version)       | Version defines the application and protocol version being used.                                                                                                                                                                                                                                                                                                                       | Must adhere to the validation rules of [Version](#version)                                                                                                                                       |
| ChainID           | String                    | ChainID is the ID of the chain. This must be unique to your chain.                                                                                                                                                                                                                                                                                                                    | ChainID must be less than 50 bytes.                                                                                                                                                              |
| Height            | uint64                     | Height is the height for this header.                                                                                                                                                                                                                                                                                                                                                 | Must be > 0, >= initialHeight, and == previous Height+1                                                                                                                                          |
| Time              | [Time](#time)             | The timestamp is equal to the weighted median of validators present in the last commit. Read more on time in the [BFT-time section](../consensus/bft-time.md). Note: the timestamp of a vote must be greater by at least one millisecond than that of the block being voted on.                                                                                                       | Time must be >= previous header timestamp + consensus parameters TimeIotaMs.  The timestamp of the first block must be equal to the genesis time (since there's no votes to compute the median). |
| LastBlockID       | [BlockID](#blockid)       | BlockID of the previous block.                                                                                                                                                                                                                                                                                                                                                        | Must adhere to the validation rules of [blockID](#blockid). The first block has `block.Header.LastBlockID == BlockID{}`.                                                                         |
| LastCommitHash    | slice of bytes (`[]byte`) | MerkleRoot of the lastCommit's signatures. The signatures represent the validators that committed to the last block. The first block has an empty slices of bytes for the hash.                                                                                                                                                                                                       | Must  be of length 32                                                                                                                                                                            |
| DataHash          | slice of bytes (`[]byte`) | MerkleRoot of the hash of transactions. **Note**: The transactions are hashed before being included in the merkle tree, the leaves of the Merkle tree are the hashes, not the transactions themselves.                                                                                                                                                                                | Must  be of length 32                                                                                                                                                                            |
| ValidatorHash     | slice of bytes (`[]byte`) | MerkleRoot of the current validator set. The validators are first sorted by voting power (descending), then by address (ascending) prior to computing the MerkleRoot.                                                                                                                                                                                                                 | Must  be of length 32                                                                                                                                                                            |
| NextValidatorHash | slice of bytes (`[]byte`) | MerkleRoot of the next validator set. The validators are first sorted by voting power (descending), then by address (ascending) prior to computing the MerkleRoot.                                                                                                                                                                                                                    | Must  be of length 32                                                                                                                                                                            |
| ConsensusHash     | slice of bytes (`[]byte`) | Hash of the protobuf encoded consensus parameters.                                                                                                                                                                                                                                                                                                                                    | Must  be of length 32                                                                                                                                                                            |
| AppHash           | slice of bytes (`[]byte`) | Arbitrary byte array returned by the application after executing and commiting the previous block. It serves as the basis for validating any merkle proofs that comes from the ABCI application and represents the state of the actual application rather than the state of the blockchain itself. The first block's `block.Header.AppHash` is given by `ResponseInitChain.app_hash`. | This hash is determined by the application, Tendermint can not perform validation on it.                                                                                                         |
| LastResultHash    | slice of bytes (`[]byte`) | `LastResultsHash` is the root hash of a Merkle tree built from `ResponseDeliverTx` responses (`Log`,`Info`, `Codespace` and `Events` fields are ignored).                                                                                                                                                                                                                             | Must  be of length 32. The first block has `block.Header.ResultsHash == MerkleRoot(nil)`, i.e. the hash of an empty input, for RFC-6962 conformance.                                             |
| EvidenceHash      | slice of bytes (`[]byte`) | MerkleRoot of the evidence of Byzantine behaviour included in this block.                                                                                                                                                                                                                                                                                                             | Must  be of length 32                                                                                                                                                                            |
| ProposerAddress   | slice of bytes (`[]byte`) | Address of the original proposer of the block. Validator must be in the current validatorSet.                                                                                                                                                                                                                                                                                         | Must  be of length 20                                                                                                                                                                            |

## Version

NOTE: that this is more specifically the consensus version and doesn't include information like the
P2P Version. (TODO: we should write a comprehensive document about
versioning that this can refer to)

| Name  | type   | Description                                                                                                     | Validation                                                                                                         |
|-------|--------|-----------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| Block | uint64 | This number represents the version of the block protocol and must be the same throughout an operational network | Must be equal to protocol version being used in a network (`block.Version.Block == state.Version.Consensus.Block`) |
| App   | uint64 | App version is decided on by the application. Read [here](../abci/abci.md#info)                                 | `block.Version.App == state.Version.Consensus.App`                                                                 |

## BlockID

The `BlockID` contains two distinct Merkle roots of the block. The `BlockID` includes these two hashes, as well as the number of parts (ie. `len(MakeParts(block))`)

| Name          | Type                            | Description                                                                                                                                                      | Validation                                                             |
|---------------|---------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| Hash          | slice of bytes (`[]byte`)       | MerkleRoot of all the fields in the header (ie. `MerkleRoot(header)`.                                                                                            | hash must be of length 32                                              |
| PartSetHeader | [PartSetHeader](#PartSetHeader) | Used for secure gossiping of the block during consensus, is the MerkleRoot of the complete serialized block cut into parts (ie. `MerkleRoot(MakeParts(block))`). | Must adhere to the validation rules of [PartSetHeader](#PartSetHeader) |

See [MerkleRoot](./encoding.md#MerkleRoot) for details.

## PartSetHeader

| Name  | Type                      | Description                       | Validation           |
|-------|---------------------------|-----------------------------------|----------------------|
| Total | int32                     | Total amount of parts for a block | Must be > 0          |
| Hash  | slice of bytes (`[]byte`) | MerkleRoot of a serialized block  | Must be of length 32 |

## Part

Part defines a part of a block. In Tendermint blocks are broken into `parts` for gossip.

| Name  | Type            | Description                       | Validation           |
|-------|-----------------|-----------------------------------|----------------------|
| index | int32           | Total amount of parts for a block | Must be > 0          |
| bytes | bytes           | MerkleRoot of a serialized block  | Must be of length 32 |
| proof | [Proof](#proof) | MerkleRoot of a serialized block  | Must be of length 32 |

## Time

Tendermint uses the [Google.Protobuf.Timestamp](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.Timestamp)
format, which uses two integers, one 64 bit integer for Seconds and a 32 bit integer for Nanoseconds.

## Data

Data is just a wrapper for a list of transactions, where transactions are arbitrary byte arrays:

| Name | Type                       | Description            | Validation                                                                  |
|------|----------------------------|------------------------|-----------------------------------------------------------------------------|
| Txs  | Matrix of bytes ([][]byte) | Slice of transactions. | Validation does not occur on this field, this data is unknown to Tendermint |

## Commit

Commit is a simple wrapper for a list of signatures, with one for each validator. It also contains the relevant BlockID, height and round:

| Name       | Type                             | Description                                                          | Validation                                                                                               |
|------------|----------------------------------|----------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Height     | uint64                            | Height at which this commit was created.                             | Must be > 0                                                                                              |
| Round      | int32                            | Round that the commit corresponds to.                                | Must be > 0                                                                                              |
| BlockID    | [BlockID](#blockid)              | The blockID of the corresponding block.                              | Must adhere to the validation rules of [BlockID](#blockid).                                              |
| Signatures | Array of [CommitSig](#commitsig) | Array of commit signatures that correspond to current validator set. | Length of signatures must be > 0 and adhere to the validation of each individual [Commitsig](#commitsig) |

## CommitSig

`CommitSig` represents a signature of a validator, who has voted either for nil,
a particular `BlockID` or was absent. It's a part of the `Commit` and can be used
to reconstruct the vote set given the validator set.

| Name             | Type                        | Description                                                                                                                                                     | Validation                                                        |
|------------------|-----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------|
| BlockIDFlag      | [BlockIDFlag](#blockidflag) | Represents the validators participation in consensus: Either voted for the block that received the majority, voted for another block, voted nil or did not vote | Must be one of the fields in the [BlockIDFlag](#blockidflag) enum |
| ValidatorAddress | [Address](#address)         | Address of the validator                                                                                                                                        | Must be of length 20                                              |
| Timestamp        | [Time](#time)               | This field will vary from `CommitSig` to `CommitSig`. It represents the timestamp of the validator.                                                             | [Time](#time)                                                     |
| Signature        | [Signature](#signature)     | Signature corresponding to the validators participation in consensus.                                                                                           | The length of the signature must be > 0 and < than  64            |

NOTE: `ValidatorAddress` and `Timestamp` fields may be removed in the future
(see [ADR-25](https://github.com/tendermint/tendermint/blob/main/docs/architecture/adr-025-commit.md)).

## BlockIDFlag

BlockIDFlag represents which BlockID the [signature](#commitsig) is for.

```go
enum BlockIDFlag {
  BLOCK_ID_FLAG_UNKNOWN = 0;
  BLOCK_ID_FLAG_ABSENT  = 1; // signatures for other blocks are also considered absent
  BLOCK_ID_FLAG_COMMIT  = 2;
  BLOCK_ID_FLAG_NIL     = 3;
}
```

## Vote

A vote is a signed message from a validator for a particular block.
The vote includes information about the validator signing it. When stored in the blockchain or propagated over the network, votes are encoded in Protobuf.

| Name             | Type                            | Description                                                                                 | Validation                                                                                           |
|------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Type             | [SignedMsgType](#signedmsgtype) | Either prevote or precommit. [SignedMsgType](#signedmsgtype)                                | A Vote is valid if its corresponding fields are included in the enum [signedMsgType](#signedmsgtype) |
| Height           | uint64                           | Height for which this vote was created for                                                  | Must be > 0                                                                                          |
| Round            | int32                           | Round that the commit corresponds to.                                                       | Must be > 0                                                                                          |
| BlockID          | [BlockID](#blockid)             | The blockID of the corresponding block.                                                     | [BlockID](#blockid)                                                                                  |
| Timestamp        | [Time](#Time)                   | Timestamp represents the time at which a validator signed.                                  | [Time](#time)                                                                                        |
| ValidatorAddress | slice of bytes (`[]byte`)       | Address of the validator                                                                    | Length must be equal to 20                                                                           |
| ValidatorIndex   | int32                           | Index at a specific block height that corresponds to the Index of the validator in the set. | must be > 0                                                                                          |
| Signature        | slice of bytes (`[]byte`)       | Signature by the validator if they participated in consensus for the associated bock.       | Length of signature must be > 0 and < 64                                                             |

## CanonicalVote

CanonicalVote is for validator signing. This type will not be present in a block. Votes are represented via `CanonicalVote` and also encoded using protobuf via `type.SignBytes` which includes the `ChainID`, and uses a different ordering of
the fields.

```proto
message CanonicalVote {
  SignedMsgType             type      = 1;
  fixed64                  height    = 2;
  sfixed64                  round     = 3;
  CanonicalBlockID          block_id  = 4;
  google.protobuf.Timestamp timestamp = 5;
  string                    chain_id  = 6;
}
```

For signing, votes are represented via [`CanonicalVote`](#canonicalvote) and also encoded using protobuf via
`type.SignBytes` which includes the `ChainID`, and uses a different ordering of
the fields.

We define a method `Verify` that returns `true` if the signature verifies against the pubkey for the `SignBytes`
using the given ChainID:

```go
func (vote *Vote) Verify(chainID string, pubKey crypto.PubKey) error {
 if !bytes.Equal(pubKey.Address(), vote.ValidatorAddress) {
  return ErrVoteInvalidValidatorAddress
 }
 v := vote.ToProto()
 if !pubKey.VerifyBytes(types.VoteSignBytes(chainID, v), vote.Signature) {
  return ErrVoteInvalidSignature
 }
 return nil
}
```

## Proposal

Proposal contains height and round for which this proposal is made, BlockID as a unique identifier
of proposed block, timestamp, and POLRound (a so-called Proof-of-Lock (POL) round) that is needed for
termination of the consensus. If POLRound >= 0, then BlockID corresponds to the block that
is locked in POLRound. The message is signed by the validator private key.

| Name      | Type                            | Description                                                                           | Validation                                              |
|-----------|---------------------------------|---------------------------------------------------------------------------------------|---------------------------------------------------------|
| Type      | [SignedMsgType](#signedmsgtype) | Represents a Proposal [SignedMsgType](#signedmsgtype)                                 | Must be `ProposalType`  [signedMsgType](#signedmsgtype) |
| Height    | uint64                           | Height for which this vote was created for                                            | Must be > 0                                             |
| Round     | int32                           | Round that the commit corresponds to.                                                 | Must be > 0                                             |
| POLRound  | int64                           | Proof of lock                                                                         | Must be > 0                                             |
| BlockID   | [BlockID](#blockid)             | The blockID of the corresponding block.                                               | [BlockID](#blockid)                                     |
| Timestamp | [Time](#Time)                   | Timestamp represents the time at which a validator signed.                            | [Time](#time)                                           |
| Signature | slice of bytes (`[]byte`)       | Signature by the validator if they participated in consensus for the associated bock. | Length of signature must be > 0 and < 64                |

## SignedMsgType

Signed message type represents a signed messages in consensus.

```proto
enum SignedMsgType {

  SIGNED_MSG_TYPE_UNKNOWN = 0;
  // Votes
  SIGNED_MSG_TYPE_PREVOTE   = 1;
  SIGNED_MSG_TYPE_PRECOMMIT = 2;

  // Proposal
  SIGNED_MSG_TYPE_PROPOSAL = 32;
}
```

## Signature

Signatures in Tendermint are raw bytes representing the underlying signature.

See the [signature spec](./encoding.md#key-types) for more.

## EvidenceList

EvidenceList is a simple wrapper for a list of evidence:

| Name     | Type                           | Description                            | Validation                                                      |
|----------|--------------------------------|----------------------------------------|-----------------------------------------------------------------|
| Evidence | Array of [Evidence](#evidence) | List of verified [evidence](#evidence) | Validation adheres to individual types of [Evidence](#evidence) |

## Evidence

Evidence in Tendermint is used to indicate breaches in the consensus by a validator.

More information on how evidence works in Tendermint can be found [here](../consensus/evidence.md)

### DuplicateVoteEvidence

`DuplicateVoteEvidence` represents a validator that has voted for two different blocks
in the same round of the same height. Votes are lexicographically sorted on `BlockID`.

| Name             | Type          | Description                                                        | Validation                                          |
|------------------|---------------|--------------------------------------------------------------------|-----------------------------------------------------|
| VoteA            | [Vote](#vote) | One of the votes submitted by a validator when they equivocated    | VoteA must adhere to [Vote](#vote) validation rules |
| VoteB            | [Vote](#vote) | The second vote submitted by a validator when they equivocated     | VoteB must adhere to [Vote](#vote) validation rules |
| TotalVotingPower | int64         | The total power of the validator set at the height of equivocation | Must be equal to nodes own copy of the data         |
| ValidatorPower   | int64         | Power of the equivocating validator at the height                  | Must be equal to the nodes own copy of the data     |
| Timestamp        | [Time](#Time) | Time of the block where the equivocation occurred                  | Must be equal to the nodes own copy of the data     |

### LightClientAttackEvidence

`LightClientAttackEvidence` is a generalized evidence that captures all forms of known attacks on
a light client such that a full node can verify, propose and commit the evidence on-chain for
punishment of the malicious validators. There are three forms of attacks: Lunatic, Equivocation
and Amnesia. These attacks are exhaustive. You can find a more detailed overview of this [here](../light-client/accountability#the_misbehavior_of_faulty_validators)

| Name                 | Type                               | Description                                                          | Validation                                                       |
|----------------------|------------------------------------|----------------------------------------------------------------------|------------------------------------------------------------------|
| ConflictingBlock     | [LightBlock](#LightBlock)          | Read Below                                                           | Must adhere to the validation rules of [lightBlock](#lightblock) |
| CommonHeight         | int64                              | Read Below                                                           | must be > 0                                                      |
| Byzantine Validators | Array of [Validators](#Validators) | validators that acted maliciously                                    | Read Below                                                       |
| TotalVotingPower     | int64                              | The total power of the validator set at the height of the infraction | Must be equal to the nodes own copy of the data                  |
| Timestamp            | [Time](#Time)                      | Time of the block where the infraction occurred                      | Must be equal to the nodes own copy of the data                  |

## LightBlock

LightBlock is the core data structure of the [light client](../light-client/README.md). It combines two data structures needed for verification ([signedHeader](#signedheader) & [validatorSet](#validatorset)).

| Name         | Type                          | Description                                                                                                                            | Validation                                                                          |
|--------------|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| SignedHeader | [SignedHeader](#signedheader) | The header and commit, these are used for verification purposes. To find out more visit [light client docs](../light-client/README.md) | Must not be nil and adhere to the validation rules of [signedHeader](#signedheader) |
| ValidatorSet | [ValidatorSet](#validatorset) | The validatorSet is used to help with verify that the validators in that committed the infraction were truly in the validator set.     | Must not be nil and adhere to the validation rules of [validatorSet](#validatorset) |

The `SignedHeader` and `ValidatorSet` are linked by the hash of the validator set(`SignedHeader.ValidatorsHash == ValidatorSet.Hash()`.

## SignedHeader

The SignedhHeader is the [header](#header) accompanied by the commit to prove it.

| Name   | Type              | Description       | Validation                                                                        |
|--------|-------------------|-------------------|-----------------------------------------------------------------------------------|
| Header | [Header](#Header) | [Header](#header) | Header cannot be nil and must adhere to the [Header](#Header) validation criteria |
| Commit | [Commit](#commit) | [Commit](#commit) | Commit cannot be nil and must adhere to the [Commit](#commit) criteria            |

## ValidatorSet

| Name       | Type                             | Description                                        | Validation                                                                                                        |
|------------|----------------------------------|----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| Validators | Array of [validator](#validator) | List of the active validators at a specific height | The list of validators can not be empty or nil and must adhere to the validation rules of [validator](#validator) |
| Proposer   | [validator](#validator)          | The block proposer for the corresponding block     | The proposer cannot be nil and must adhere to the validation rules of  [validator](#validator)                    |

## Validator

| Name             | Type                      | Description                                                                                       | Validation                                        |
|------------------|---------------------------|---------------------------------------------------------------------------------------------------|---------------------------------------------------|
| Address          | [Address](#address)       | Validators Address                                                                                | Length must be of size 20                         |
| Pubkey           | slice of bytes (`[]byte`) | Validators Public Key                                                                             | must be a length greater than 0                   |
| VotingPower      | int64                     | Validators voting power                                                                           | cannot be < 0                                     |
| ProposerPriority | int64                     | Validators proposer priority. This is used to gauge when a validator is up next to propose blocks | No validation, value can be negative and positive |

## Address

Address is a type alias of a slice of bytes. The address is calculated by hashing the public key using sha256 and truncating it to only use the first 20 bytes of the slice.

```go
const (
  TruncatedSize = 20
)

func SumTruncated(bz []byte) []byte {
  hash := sha256.Sum256(bz)
  return hash[:TruncatedSize]
}
```

## ConsensusParams

| Name      | Type                                | Description                                                                  | Field Number |
|-----------|-------------------------------------|------------------------------------------------------------------------------|--------------|
| block     | [BlockParams](#blockparams)         | Parameters limiting the size of a block and time between consecutive blocks. | 1            |
| evidence  | [EvidenceParams](#evidenceparams)   | Parameters limiting the validity of evidence of byzantine behaviour.         | 2            |
| validator | [ValidatorParams](#validatorparams) | Parameters limiting the types of public keys validators can use.             | 3            |
| version   | [BlockParams](#blockparams)         | The ABCI application version.                                                | 4            |

### BlockParams

| Name         | Type  | Description                                                                                                                                                                                                 | Field Number |
|--------------|-------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| max_bytes    | int64 | Max size of a block, in bytes.                                                                                                                                                                              | 1            |
| max_gas      | int64 | Max sum of `GasWanted` in a proposed block. NOTE: blocks that violate this may be committed if there are Byzantine proposers. It's the application's responsibility to handle this when processing a block! | 2            |

### EvidenceParams

| Name               | Type                                                                                                                               | Description                                                                                                                                                                                                                                                                    | Field Number |
|--------------------|------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| max_age_num_blocks | int64                                                                                                                              | Max age of evidence, in blocks.                                                                                                                                                                                                                                                | 1            |
| max_age_duration   | [google.protobuf.Duration](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.Duration) | Max age of evidence, in time. It should correspond with an app's "unbonding period" or other similar mechanism for handling [Nothing-At-Stake attacks](https://github.com/ethereum/wiki/wiki/Proof-of-Stake-FAQ#what-is-the-nothing-at-stake-problem-and-how-can-it-be-fixed). | 2            |
| max_bytes          | int64                                                                                                                              | maximum size in bytes of total evidence allowed to be entered into a block                                                                                                                                                                                                     | 3            |

### ValidatorParams

| Name          | Type            | Description                                                           | Field Number |
|---------------|-----------------|-----------------------------------------------------------------------|--------------|
| pub_key_types | repeated string | List of accepted public key types. Uses same naming as `PubKey.Type`. | 1            |

### VersionParams

| Name        | Type   | Description                   | Field Number |
|-------------|--------|-------------------------------|--------------|
| app_version | uint64 | The ABCI application version. | 1            |

## Proof

| Name      | Type           | Description                                   | Field Number |
|-----------|----------------|-----------------------------------------------|--------------|
| total     | int64          | Total number of items.                        | 1            |
| index     | int64          | Index item to prove.                          | 2            |
| leaf_hash | bytes          | Hash of item value.                           | 3            |
| aunts     | repeated bytes | Hashes from leaf's sibling to a root's child. | 4            |
