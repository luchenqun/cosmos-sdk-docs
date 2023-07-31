---
order: 1
parent:
  title: 共识
  order: 4
---

# 共识

Tendermint 共识协议的规范。

## 目录

- [共识论文](./consensus-paper) - 在
  [arxiv](https://arxiv.org/abs/1807.04938) 上描述了核心 Tendermint 共识状态机，并附带了安全性和终止性的证明的 LaTeX 论文。
- [BFT 时间](./bft-time.md) - 如何以拜占庭容错的方式计算 Tendermint 区块头中的时间戳
- [创建提案](./creating-proposal.md) - 提案者如何为共识创建区块提案
- [轻客户端协议](./light-client) - 一种用于轻量级共识验证和同步到最新状态的协议
- [签名](./signing.md) - 由验证者生成的加密签名规则。
- [预写式日志](./wal.md) - 共识状态机用于从崩溃中恢复的预写式日志。

在对等节点之间传播共识消息的协议，对于活性至关重要，详见[反应器部分](../reactors/consensus/consensus.md)。

还有一个[陈旧的 Markdown 描述](consensus.md)共识状态机
（TODO 更新此部分）。


---
order: 1
parent:
  title: Consensus
  order: 4
---

# Consensus

Specification of the Tendermint consensus protocol.

## Contents

- [Consensus Paper](./consensus-paper) - Latex paper on
  [arxiv](https://arxiv.org/abs/1807.04938) describing the
  core Tendermint consensus state machine with proofs of safety and termination.
- [BFT Time](./bft-time.md) - How the timestamp in a Tendermint
  block header is computed in a Byzantine Fault Tolerant manner
- [Creating Proposal](./creating-proposal.md) - How a proposer
  creates a block proposal for consensus
- [Light Client Protocol](./light-client) - A protocol for light weight consensus
  verification and syncing to the latest state
- [Signing](./signing.md) - Rules for cryptographic signatures
  produced by validators.
- [Write Ahead Log](./wal.md) - Write ahead log used by the
  consensus state machine to recover from crashes.

The protocol used to gossip consensus messages between peers, which is critical
for liveness, is described in the [reactors section](../reactors/consensus/consensus.md).

There is also a [stale markdown description](consensus.md) of the consensus state machine
(TODO update this).
