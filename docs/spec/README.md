---
order: 1
title: 概述
parent:
  title: 规范
  order: 7
---

# Tendermint规范

这是Tendermint区块链的Markdown规范。
它定义了基本的数据结构，它们如何被验证，
以及它们如何在网络上进行通信。

如果您发现规范与代码之间存在差异，
而没有相关的问题或拉取请求在github上，
请将它们提交到我们的[漏洞赏金计划](https://tendermint.com/security)！

## 目录

- [概述](#overview)

### 数据结构

- [编码和摘要](./core/encoding.md)
- [区块链](./core/data_structures.md)
- [状态](./core/state.md)

### 共识协议

- [共识算法](./consensus/consensus.md)
- [创建提案](./consensus/creating-proposal.md)
- [时间](./consensus/bft-time.md)
- [轻客户端](./consensus/light-client/README.md)

### P2P和网络协议

- [基础P2P层](./p2p/node.md)：在经过身份验证和加密的TCP连接上多路复用协议（"反应器"）
- [节点交换（PEX）](./p2p/messages/pex.md)：传播已知的节点地址，以便节点可以找到彼此
- [区块同步](./p2p/messages/block-sync.md)：传播区块，以便节点可以快速追赶
- [共识](./p2p/messages/consensus.md)：传播投票和区块部分，以便可以提交新的区块
- [内存池](./p2p/messages/mempool.md)：传播交易，以便它们被包含在区块中
- [证据](./p2p/messages/evidence.md)：发送无效证据将停止节点

### RPC

- [RPC规范](./rpc/README.md)：Tendermint远程过程调用接口的规范。

### 软件

- [ABCI](./abci/README.md)：关于应用程序和共识引擎之间交互的详细信息
- [预写式日志](./consensus/wal.md)：关于共识引擎如何保留数据和从崩溃故障中恢复的详细信息

## 概述

Tendermint使用哈希链接的交易批次来提供拜占庭容错状态机复制。
这样的交易批次被称为"区块"。
因此，Tendermint定义了一个"区块链"。

每个 Tendermint 区块都有一个唯一的索引 - 它的高度（Height）。
区块链中的高度是单调递增的。
每个区块由一组已知的加权验证者共同确认。
验证者集合中的成员和权重可能随时间变化。
只要恶意或故障的验证者权重不超过验证者集合总权重的三分之一，Tendermint 可以保证区块链的安全性和活跃性。

在 Tendermint 中，提交（commit）是指来自当前验证者集合总权重超过三分之二的签名消息集合。
验证者轮流提议区块并对其进行投票。一旦收到足够的投票，区块就被视为已提交。
这些投票将作为证明前一个区块已提交的一部分，包含在下一个区块中。
它们不能包含在当前区块中，因为当前区块已经创建。

一旦区块被提交，就可以对其执行应用程序。
应用程序为区块中的每个交易返回结果。
应用程序还可以返回对验证者集合的更改，以及其最新状态的加密摘要。

Tendermint 的设计目标是实现对区块链最新状态的高效验证和认证。
为了实现这一目标，它在区块的“头部”中嵌入了对某些信息的加密承诺。
这些信息包括区块的内容（例如交易）、确认区块的验证者集合，以及应用程序返回的各种结果。
但请注意，区块的执行仅在区块被提交之后发生。
因此，应用程序的结果只能包含在下一个区块中。

还要注意的是，交易结果和验证者集合等信息永远不会直接包含在区块中，只有它们的加密摘要（Merkle 根）会被包含。
因此，验证区块需要一个单独的数据结构来存储这些信息。
我们称之为“状态”（State）。区块的验证还需要访问前一个区块的信息。


---
order: 1
title: Overview
parent:
  title: Spec
  order: 7
---

# Tendermint Spec

This is a markdown specification of the Tendermint blockchain.
It defines the base data structures, how they are validated,
and how they are communicated over the network.

If you find discrepancies between the spec and the code that
do not have an associated issue or pull request on github,
please submit them to our [bug bounty](https://tendermint.com/security)!

## Contents

- [Overview](#overview)

### Data Structures

- [Encoding and Digests](./core/encoding.md)
- [Blockchain](./core/data_structures.md)
- [State](./core/state.md)

### Consensus Protocol

- [Consensus Algorithm](./consensus/consensus.md)
- [Creating a proposal](./consensus/creating-proposal.md)
- [Time](./consensus/bft-time.md)
- [Light-Client](./consensus/light-client/README.md)

### P2P and Network Protocols

- [The Base P2P Layer](./p2p/node.md): multiplex the protocols ("reactors") on authenticated and encrypted TCP connections
- [Peer Exchange (PEX)](./p2p/messages/pex.md): gossip known peer addresses so peers can find each other
- [Block Sync](./p2p/messages/block-sync.md): gossip blocks so peers can catch up quickly
- [Consensus](./p2p/messages/consensus.md): gossip votes and block parts so new blocks can be committed
- [Mempool](./p2p/messages/mempool.md): gossip transactions so they get included in blocks
- [Evidence](./p2p/messages/evidence.md): sending invalid evidence will stop the peer

### RPC

- [RPC SPEC](./rpc/README.md): Specification of the Tendermint remote procedure call interface.

### Software

- [ABCI](./abci/README.md): Details about interactions between the
  application and consensus engine over ABCI
- [Write-Ahead Log](./consensus/wal.md): Details about how the consensus
  engine preserves data and recovers from crash failures

## Overview

Tendermint provides Byzantine Fault Tolerant State Machine Replication using
hash-linked batches of transactions. Such transaction batches are called "blocks".
Hence, Tendermint defines a "blockchain".

Each block in Tendermint has a unique index - its Height.
Height's in the blockchain are monotonic.
Each block is committed by a known set of weighted Validators.
Membership and weighting within this validator set may change over time.
Tendermint guarantees the safety and liveness of the blockchain
so long as less than 1/3 of the total weight of the Validator set
is malicious or faulty.

A commit in Tendermint is a set of signed messages from more than 2/3 of
the total weight of the current Validator set. Validators take turns proposing
blocks and voting on them. Once enough votes are received, the block is considered
committed. These votes are included in the _next_ block as proof that the previous block
was committed - they cannot be included in the current block, as that block has already been
created.

Once a block is committed, it can be executed against an application.
The application returns results for each of the transactions in the block.
The application can also return changes to be made to the validator set,
as well as a cryptographic digest of its latest state.

Tendermint is designed to enable efficient verification and authentication
of the latest state of the blockchain. To achieve this, it embeds
cryptographic commitments to certain information in the block "header".
This information includes the contents of the block (eg. the transactions),
the validator set committing the block, as well as the various results returned by the application.
Note, however, that block execution only occurs _after_ a block is committed.
Thus, application results can only be included in the _next_ block.

Also note that information like the transaction results and the validator set are never
directly included in the block - only their cryptographic digests (Merkle roots) are.
Hence, verification of a block requires a separate data structure to store this information.
We call this the `State`. Block verification also requires access to the previous block.
