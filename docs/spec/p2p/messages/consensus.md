# 共识

## 通道

共识有四个独立的通道。通道标识符如下所示。

| 名称               | 编号 |
|--------------------|--------|
| StateChannel       | 32     |
| DataChannel        | 33     |
| VoteChannel        | 34     |
| VoteSetBitsChannel | 35     |

## 消息类型

### 提案

当提出一个新的区块时发送提案。它是对区块链中下一个区块的建议。

| 名称     | 类型                                               | 描述                            | 字段编号 |
|----------|----------------------------------------------------|----------------------------------------|--------------|
| proposal | [Proposal](../../core/data_structures.md#proposal) | 提议的区块以达成共识 | 1            |

### 投票

投票用于投票支持某个区块（或通知其他人一个进程在当前轮次中不投票）。投票在
[Blockchain](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/core/data_structures.md#blockidd)
部分中定义，包含验证人的
信息（验证人地址和索引），发送投票的高度和轮次，投票类型，
如果进程为某个区块投票，则包含区块ID（否则为`nil`），以及发送投票的时间戳。该
消息由验证人的私钥签名。

| 名称 | 类型                                       | 描述               | 字段编号 |
|------|--------------------------------------------|---------------------------|--------------|
| vote | [Vote](../../core/data_structures.md#vote) | 对提议的区块进行投票 | 1            |

### 区块部分

在传播提议的一部分时发送区块部分。它包含高度、轮次
和区块部分。

| 名称   | 类型                                       | 描述                            | 字段编号 |
|--------|--------------------------------------------|----------------------------------------|--------------|
| height | int64                                      | 相应区块的高度         | 1            |
| round  | int32                                      | 用于完成区块的投票轮次 | 2            |
| part   | [Part](../../core/data_structures.md#part) | 区块的一部分                   | 3            |

### NewRoundStep

NewRoundStep用于在核心共识算法执行过程中的每个步骤转换时发送。
它在Tendermint协议的八卦部分中用于通知同行进程当前所处的高度/轮次/步骤。

| 名称                     | 类型   | 描述                                  | 字段编号 |
|--------------------------|--------|--------------------------------------|----------|
| height                   | int64  | 相应区块的高度                        | 1        |
| round                    | int32  | 用于完成区块投票的轮次                | 2        |
| step                     | uint32 |                                      | 3        |
| seconds_since_start_time | int64  |                                      | 4        |
| last_commit_round        | int32  |                                      | 5        |

### NewValidBlock

当验证者在某个轮次r中观察到一个有效的区块B时，会发送NewValidBlock消息，
即在轮次r中存在一个针对区块B的提案，并且轮次r中有2/3+的预投票支持该区块B。
它包含观察到有效区块的高度和轮次，描述有效区块并用于获取所有区块部分的区块部分头，
以及当前进程拥有的区块部分的位数组，以便其同行进程知道它缺少哪些部分，从而可以发送它们。
如果该区块也已经被提交，则IsCommit标志设置为true。

| 名称                  | 类型                                                         | 描述                                  | 字段编号 |
|-----------------------|--------------------------------------------------------------|--------------------------------------|----------|
| height                | int64                                                        | 相应区块的高度                        | 1        |
| round                 | int32                                                        | 用于完成区块投票的轮次                | 2        |
| block_part_set_header | [PartSetHeader](../../core/data_structures.md#partsetheader) |                                      | 3        |
| block_parts           | int32                                                        |                                      | 4        |
| is_commit             | bool                                                         |                                      | 5        |

### ProposalPOL

当重新提议先前的区块时，会发送ProposalPOL消息。
它用于通知同行进程此区块的学习过程所在的轮数（ProposalPOLRound），
以及进程对重新提议的区块的预投票。

| 名称                | 类型      | 描述                          | 字段编号 |
|---------------------|-----------|-------------------------------|----------|
| height              | int64     | 相应区块的高度                | 1        |
| proposal_pol_round  | int32     |                               | 2        |
| proposal_pol        | bitarray  |                               | 3        |

### ReceivedVote

发送ReceivedVote消息以指示已接收特定的投票。它包含高度、轮数、投票类型以及发起相应投票的验证者的索引。

| 名称    | 类型                                                             | 描述                                 | 字段编号 |
|---------|------------------------------------------------------------------|-------------------------------------|----------|
| height  | int64                                                            | 相应区块的高度                       | 1        |
| round   | int32                                                            | 用于完成区块的投票的轮数             | 2        |
| type    | [SignedMessageType](../../core/data_structures.md#signedmsgtype) |                                     | 3        |
| index   | int32                                                            |                                     | 4        |

### VoteSetMaj23

发送VoteSetMaj23消息以指示某个进程已经看到了+2/3的投票结果，用于某个BlockID。
它包含高度、轮数、投票类型以及BlockID。

| 名称    | 类型                                                             | 描述                                 | 字段编号 |
|---------|------------------------------------------------------------------|-------------------------------------|----------|
| height  | int64                                                            | 相应区块的高度                       | 1        |
| round   | int32                                                            | 用于完成区块的投票的轮数             | 2        |
| type    | [SignedMessageType](../../core/data_structures.md#signedmsgtype) |                                     | 3        |

### VoteSetBits

VoteSetBits用于传递进程对给定BlockID的投票位数组。它包含高度、轮次、投票类型、BlockID和进程的投票位数组。

| 名称      | 类型                                                             | 描述                                   | 字段编号 |
|----------|------------------------------------------------------------------|----------------------------------------|--------------|
| height   | int64                                                            | 对应区块的高度                         | 1            |
| round    | int32                                                            | 用于完成区块投票的轮次                 | 2            |
| type     | [SignedMessageType](../../core/data_structures.md#signedmsgtype) |                                        | 3            |
| block_id | [BlockID](../../core/data_structures.md#blockid)                 |                                        | 4            |
| votes    | BitArray                                                         | 用于完成区块投票的轮次                 | 5            |

### Message

Message是一个[`oneof` protobuf类型](https://developers.google.com/protocol-buffers/docs/proto#oneof)。

| 名称            | 类型                            | 描述                                   | 字段编号 |
|-----------------|---------------------------------|----------------------------------------|--------------|
| new_round_step  | [NewRoundStep](#newroundstep)   | 对应区块的高度                         | 1            |
| new_valid_block | [NewValidBlock](#newvalidblock) | 用于完成区块投票的轮次                 | 2            |
| proposal        | [Proposal](#proposal)           |                                        | 3            |
| proposal_pol    | [ProposalPOL](#proposalpol)     |                                        | 4            |
| block_part      | [BlockPart](#blockpart)         |                                        | 5            |
| vote            | [Vote](#vote)                   |                                        | 6            |
| received_vote       | [ReceivedVote](#ReceivedVote)           |                                        | 7            |
| vote_set_maj23  | [VoteSetMaj23](#votesetmaj23)   |                                        | 8            |
| vote_set_bits   | [VoteSetBits](#votesetbits)     |                                        | 9            |

I'm sorry, but as an AI text-based model, I am unable to process or translate specific content that you paste. However, I can provide you with a general translation of the rules you mentioned:

请严格遵循以下规则进行翻译：

- 不要改变Markdown标记结构。不要添加或删除链接。不要更改任何URL。
- 即使代码块中存在错误，也不要更改代码块的内容。尤其是不要触碰包含`omittedCodeBlock-xxxxxx`关键字的行。
- 保留原始换行符。不要添加或删除空行。
- 不要触碰标题末尾的永久链接，如`{/*try-react*/}`。
- 不要触碰类似HTML的标签，如`<Notes>`或`<YouWillLearn>`。

Please provide the Markdown content you would like to translate, and I will assist you with the translation.


---
order: 7
---

# Consensus

## Channel

Consensus has four separate channels. The channel identifiers are listed below.

| Name               | Number |
|--------------------|--------|
| StateChannel       | 32     |
| DataChannel        | 33     |
| VoteChannel        | 34     |
| VoteSetBitsChannel | 35     |

## Message Types

### Proposal

Proposal is sent when a new block is proposed. It is a suggestion of what the
next block in the blockchain should be.

| Name     | Type                                               | Description                            | Field Number |
|----------|----------------------------------------------------|----------------------------------------|--------------|
| proposal | [Proposal](../../core/data_structures.md#proposal) | Proposed Block to come to consensus on | 1            |

### Vote

Vote is sent to vote for some block (or to inform others that a process does not vote in the
current round). Vote is defined in the
[Blockchain](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/core/data_structures.md#blockidd)
section and contains validator's
information (validator address and index), height and round for which the vote is sent, vote type,
blockID if process vote for some block (`nil` otherwise) and a timestamp when the vote is sent. The
message is signed by the validator private key.

| Name | Type                                       | Description               | Field Number |
|------|--------------------------------------------|---------------------------|--------------|
| vote | [Vote](../../core/data_structures.md#vote) | Vote for a proposed Block | 1            |

### BlockPart

BlockPart is sent when gossiping a piece of the proposed block. It contains height, round
and the block part.

| Name   | Type                                       | Description                            | Field Number |
|--------|--------------------------------------------|----------------------------------------|--------------|
| height | int64                                      | Height of corresponding block.         | 1            |
| round  | int32                                      | Round of voting to finalize the block. | 2            |
| part   | [Part](../../core/data_structures.md#part) | A part of the block.                   | 3            |

### NewRoundStep

NewRoundStep is sent for every step transition during the core consensus algorithm execution.
It is used in the gossip part of the Tendermint protocol to inform peers about a current
height/round/step a process is in.

| Name                     | Type   | Description                            | Field Number |
|--------------------------|--------|----------------------------------------|--------------|
| height                   | int64  | Height of corresponding block          | 1            |
| round                    | int32  | Round of voting to finalize the block. | 2            |
| step                     | uint32 |                                        | 3            |
| seconds_since_start_time | int64  |                                        | 4            |
| last_commit_round        | int32  |                                        | 5            |

### NewValidBlock

NewValidBlock is sent when a validator observes a valid block B in some round r,
i.e., there is a Proposal for block B and 2/3+ prevotes for the block B in the round r.
It contains height and round in which valid block is observed, block parts header that describes
the valid block and is used to obtain all
block parts, and a bit array of the block parts a process currently has, so its peers can know what
parts it is missing so they can send them.
In case the block is also committed, then IsCommit flag is set to true.

| Name                  | Type                                                         | Description                            | Field Number |
|-----------------------|--------------------------------------------------------------|----------------------------------------|--------------|
| height                | int64                                                        | Height of corresponding block          | 1            |
| round                 | int32                                                        | Round of voting to finalize the block. | 2            |
| block_part_set_header | [PartSetHeader](../../core/data_structures.md#partsetheader) |                                        | 3            |
| block_parts           | int32                                                        |                                        | 4            |
| is_commit             | bool                                                         |                                        | 5            |

### ProposalPOL

ProposalPOL is sent when a previous block is re-proposed.
It is used to inform peers in what round the process learned for this block (ProposalPOLRound),
and what prevotes for the re-proposed block the process has.

| Name               | Type     | Description                   | Field Number |
|--------------------|----------|-------------------------------|--------------|
| height             | int64    | Height of corresponding block | 1            |
| proposal_pol_round | int32    |                               | 2            |
| proposal_pol       | bitarray |                               | 3            |

### ReceivedVote

ReceivedVote is sent to indicate that a particular vote has been received. It contains height,
round, vote type and the index of the validator that is the originator of the corresponding vote.

| Name   | Type                                                             | Description                            | Field Number |
|--------|------------------------------------------------------------------|----------------------------------------|--------------|
| height | int64                                                            | Height of corresponding block          | 1            |
| round  | int32                                                            | Round of voting to finalize the block. | 2            |
| type   | [SignedMessageType](../../core/data_structures.md#signedmsgtype) |                                        | 3            |
| index  | int32                                                            |                                        | 4            |

### VoteSetMaj23

VoteSetMaj23 is sent to indicate that a process has seen +2/3 votes for some BlockID.
It contains height, round, vote type and the BlockID.

| Name   | Type                                                             | Description                            | Field Number |
|--------|------------------------------------------------------------------|----------------------------------------|--------------|
| height | int64                                                            | Height of corresponding block          | 1            |
| round  | int32                                                            | Round of voting to finalize the block. | 2            |
| type   | [SignedMessageType](../../core/data_structures.md#signedmsgtype) |                                        | 3            |

### VoteSetBits

VoteSetBits is sent to communicate the bit-array of votes a process has seen for a given
BlockID. It contains height, round, vote type, BlockID and a bit array of
the votes a process has.

| Name     | Type                                                             | Description                            | Field Number |
|----------|------------------------------------------------------------------|----------------------------------------|--------------|
| height   | int64                                                            | Height of corresponding block          | 1            |
| round    | int32                                                            | Round of voting to finalize the block. | 2            |
| type     | [SignedMessageType](../../core/data_structures.md#signedmsgtype) |                                        | 3            |
| block_id | [BlockID](../../core/data_structures.md#blockid)                 |                                        | 4            |
| votes    | BitArray                                                         | Round of voting to finalize the block. | 5            |

### Message

Message is a [`oneof` protobuf type](https://developers.google.com/protocol-buffers/docs/proto#oneof).

| Name            | Type                            | Description                            | Field Number |
|-----------------|---------------------------------|----------------------------------------|--------------|
| new_round_step  | [NewRoundStep](#newroundstep)   | Height of corresponding block          | 1            |
| new_valid_block | [NewValidBlock](#newvalidblock) | Round of voting to finalize the block. | 2            |
| proposal        | [Proposal](#proposal)           |                                        | 3            |
| proposal_pol    | [ProposalPOL](#proposalpol)     |                                        | 4            |
| block_part      | [BlockPart](#blockpart)         |                                        | 5            |
| vote            | [Vote](#vote)                   |                                        | 6            |
| received_vote       | [ReceivedVote](#ReceivedVote)           |                                        | 7            |
| vote_set_maj23  | [VoteSetMaj23](#votesetmaj23)   |                                        | 8            |
| vote_set_bits   | [VoteSetBits](#votesetbits)     |                                        | 9            |
