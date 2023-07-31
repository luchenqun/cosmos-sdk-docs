---
order: 1
---
# 拜占庭共识算法

## 术语

- 网络由可选连接的节点组成。直接连接到特定节点的节点称为对等节点。
- 决定下一个块（在某个高度 `H`）的共识过程由一个或多个轮次组成。
- `NewHeight`、`Propose`、`Prevote`、`Precommit` 和 `Commit` 表示一个轮次的状态机状态（也称为 `RoundStep` 或简称为 "step"）。
- 节点被称为在给定的高度、轮次和步骤 `(H,R,S)` 或简写为 `(H,R)`，省略步骤。
- 进行 _prevote_ 或 _precommit_ 意味着广播一个 [prevote
  vote](https://godoc.org/github.com/tendermint/tendermint/types#Vote)
  或 [first precommit
  vote](https://godoc.org/github.com/tendermint/tendermint/types#FirstPrecommit)。
- 在 `(H,R)` 处的投票是使用其 [sign-bytes](../core/data_structures.md#vote) 中包含的 `H` 和 `R` 的字节签名的投票。
- _+2/3_ 是 "超过 2/3" 的简写
- _1/3+_ 是 "1/3 或更多" 的简写
- 在 `(H,R)` 处，对于特定块或 `<nil>` 的 +2/3 的 prevotes 的集合称为 _proof-of-lock-change_ 或简称为 _PoLC_。

## 状态机概述

在区块链的每个高度上，运行基于轮次的协议来确定下一个块。每个轮次由三个步骤（`Propose`、`Prevote` 和 `Precommit`）组成，以及两个特殊步骤 `Commit` 和 `NewHeight`。

在最佳情况下，步骤的顺序是：

```md
NewHeight -> (Propose -> Prevote -> Precommit)+ -> Commit -> NewHeight ->...
```

序列 `(Propose -> Prevote -> Precommit)` 称为一个 _round_。可能需要多个轮次来提交给定高度的块。可能需要更多轮次的示例包括：

- 指定的提议者不在线。
- 指定的提议者提出的块无效。
- 指定的提议者提出的块未及时传播。
- 提议的块有效，但是在达到 `Precommit` 步骤之前，至少有一个验证节点可能投票 `<nil>` 或恶意投票给其他内容，导致未及时收到足够数量的验证节点的 +2/3 prevotes。尽管 +2/3 prevotes 是进入下一步所必需的，但至少有一个验证节点可能投票 `<nil>` 或恶意投票给其他内容。
- 提议的块有效，并且已收到足够数量的节点的 +2/3 prevotes，但是未收到足够数量的验证节点的 +2/3 precommits。

一些问题可以通过进入下一轮和提议者来解决。其他问题可以通过逐轮增加某些超时参数来解决。

## 状态机图

```md
                         +-------------------------------------+
                         v                                     |(Wait til `CommmitTime+timeoutCommit`)
                   +-----------+                         +-----+-----+
      +----------> |  Propose  +--------------+          | NewHeight |
      |            +-----------+              |          +-----------+
      |                                       |                ^
      |(Else, after timeoutPrecommit)         v                |
+-----+-----+                           +-----------+          |
| Precommit |  <------------------------+  Prevote  |          |
+-----+-----+                           +-----------+          |
      |(When +2/3 Precommits for block found)                  |
      v                                                        |
+--------------------------------------------------------------------+
|  Commit                                                            |
|                                                                    |
|  * Set CommitTime = now;                                           |
|  * Wait for block, then stage/save/commit block;                   |
+--------------------------------------------------------------------+
```

# 背景八卦

一个节点可能没有相应的验证者私钥，但它仍然通过传递相关的元数据、提议、区块和投票来积极参与共识过程。拥有活跃验证者的私钥并参与签署投票的节点被称为“验证者节点”。所有节点（不仅仅是验证者节点）都有一个关联的状态（当前高度、轮次和步骤），并努力取得进展。

两个节点之间存在一个“连接”，在这个连接之上多路复用了一些被限制的信息“通道”。在其中的一些通道之间实现了一种流行的八卦协议，以使节点了解共识的最新状态。例如，

- 节点会八卦当前轮次提议者的“PartSet”部分。使用了受LibSwift启发的算法，快速地在八卦网络中广播区块。
- 节点会八卦prevote/precommit投票。领先于节点`NODE_B`的节点`NODE_A`可以向`NODE_B`发送prevotes或precommits，以使其能够向前推进。
- 如果提议了一个PoLC（锁定变更证明）轮次，节点会八卦该轮次的prevotes。
- 节点会向区块链高度滞后的节点八卦旧区块的[commits](https://godoc.org/github.com/tendermint/tendermint/types#Commit)。
- 节点会机会主义地八卦`ReceivedVote`消息，以提示同行它已经拥有的投票。
- 节点会向所有相邻节点广播其当前状态（但不会进一步八卦）。

还有更多内容，但我们不要急于进行。

## 提议

每轮的指定提议者会签署并发布一个提议。提议者是通过一种确定性且非阻塞的轮次轮询选择算法选择的，该算法按照其投票权重的比例选择提议者（参见[实现](https://github.com/tendermint/tendermint/blob/v0.34.x/types/validator_set.go)）。

一个在`(H,R)`处的提案由一个区块和一个可选的最新的`PoLC-Round < R`组成，如果提案者知道有一个，则包含在内。这提示网络在安全的情况下允许节点解锁，以确保活性属性。

## 状态机规范

### 提议步骤（高度：H，轮数：R）

进入`Propose`时：

- 指定的提案者在`(H,R)`处提出一个区块。

`Propose`步骤结束：

- 在进入`Propose`后的`timeoutProposeR`时间后。 --> 转到`Prevote(H,R)`
- 在收到提案区块和所有`PoLC-Round`处的预投票后。 --> 转到`Prevote(H,R)`
- 在[常见退出条件](#common-exit-conditions)之后

### 预投票步骤（高度：H，轮数：R）

进入`Prevote`时，每个验证者广播其预投票。

- 首先，如果验证者自`LastLockRound`以来一直锁定在一个区块上，但现在在轮数`PoLC-Round`处有一个不同的PoLC，其中`LastLockRound < PoLC-Round < R`，则解锁。
- 如果验证者仍然锁定在一个区块上，则预投票该区块。
- 否则，如果来自`Propose(H,R)`的提议区块是好的，则预投票该区块。
- 否则，如果提案无效或未按时接收，则预投票`<nil>`。

`Prevote`步骤结束：

- 在某个特定区块或`<nil>`的+2/3预投票之后。 --> 转到`Precommit(H,R)`
- 在收到任何+2/3预投票后的`timeoutPrevote`时间后。 --> 转到`Precommit(H,R)`
- 在[常见退出条件](#common-exit-conditions)之后

### 预提交步骤（高度：H，轮数：R）

进入`Precommit`时，每个验证者广播其预提交。

- 如果验证者在`(H,R)`处有一个特定区块`B`的PoLC，则（重新）锁定（或更改锁定为）并预提交`B`，并设置`LastLockRound = R`。
- 否则，如果验证者在`(H,R)`处有一个`<nil>`的PoLC，则解锁并预提交`<nil>`。
- 否则，保持锁定不变并预提交`<nil>`。

预提交`<nil>`表示“我没有看到这一轮的PoLC，但我收到了+2/3预投票并等了一会”。

`Precommit`步骤结束：

- 在+2/3预提交`<nil>`之后。 --> 转到`Propose(H,R+1)`
- 在收到任何+2/3预提交后的`timeoutPrecommit`时间后。 --> 转到`Propose(H,R+1)`
- 在[常见退出条件](#common-exit-conditions)之后

### 常见退出条件

- 在特定区块上获得 +2/3 的预提交后。 --> 跳转至 `Commit(H)`
- 在 `(H,R+x)` 收到任何 +2/3 的先前投票后。 --> 跳转至 `Prevote(H,R+x)`
- 在 `(H,R+x)` 收到任何 +2/3 的先前提交后。 --> 跳转至 `Precommit(H,R+x)`

### 提交步骤（高度：H）

- 设置 `CommitTime = now()`
- 等待接收到区块。 --> 跳转至 `NewHeight(H+1)`

### 新高度步骤（高度：H）

- 将 `Precommits` 移动到 `LastCommit` 并增加高度。
- 设置 `StartTime = CommitTime+timeoutCommit`
- 等待 `StartTime` 接收滞后提交。 --> 跳转至 `Propose(H,0)`

## 证明

### 安全性证明

假设最多 -1/3 的验证者投票权是拜占庭式的。
如果一个验证者在轮次 `R` 提交了区块 `B`，那是因为它在轮次 `R` 看到了 +2/3 的先前提交。这意味着 1/3+ 的诚实节点仍然在轮次 `R' > R` 上被锁定。这些被锁定的验证者将保持锁定状态，直到它们在 `R' > R` 上看到一个 PoLC，但这不会发生，因为 1/3+ 是被锁定的并且是诚实的，所以最多只有 -2/3 可以投票给除了 `B` 之外的任何内容。

### 存活性证明

如果有 1/3+ 的诚实验证者在不同轮次上锁定了两个不同的区块，提议者的 `PoLC-Round` 最终会导致从较早轮次锁定的节点解锁。最终，指定的提议者将是一个知道较晚轮次的 PoLC 的提议者。此外，`timeoutProposalR` 随着轮次 `R` 递增，而提案的大小是有限制的，因此最终网络能够“完全传播”整个提案（例如区块和 PoLC）。

### 分叉问责证明

将验证者 `V1` 在高度 `H` 的证明-投票集（JSet，Justification-Vote-Set）定义为验证者在 `H` 处签名的所有投票，以及每个锁定变化的证明 PoLC 先前投票。例如，如果 `V1` 签署了以下先前提交：`Precommit(B1 @ round 0)`、`Precommit(<nil> @ round 1)`、`Precommit(B2 @ round 4)`（注意，没有为轮次 2 和 3 签署先前提交，这是可以的），则 `Precommit(B1 @ round 0)` 必须由轮次 0 的 PoLC 证明，而 `Precommit(B2 @ round 4)` 必须由轮次 4 的 PoLC 证明；但是，轮次 1 的 `<nil>` 的先前提交根据定义不是锁定变化，因此 `V1` 的 JSet 不需要包括轮次 1、2 或 3 的任何先前投票（除非 `V1` 恰好为这些轮次进行了先前投票）。

此外，将高度为 `H` 的验证器集合 `VSet` 的 JSet 定义为每个验证器的 JSet 的并集。对于在轮次 `R` 上由诚实验证器对块 `B` 进行的提交，我们可以构建一个 JSet 来证明在 `R` 上对 `B` 的提交。我们称 JSet 在 `(H,R)` 处 _证明_ 了提交，如果所有提交者（提交集中的验证器）在 JSet 中都被证明且没有重复的投票签名（由提交者提供）。

- **引理**：当存在两个冲突的[提交](../core/data_structures.md#commit)时，通过存在分叉来检测，两个提交的 JSet 的并集（如果可以编译）必须包含至少 1/3+ 的验证器集合的双签名。
  **证明**：提交不能在同一轮次，因为这将立即意味着至少 1/3+ 的双签名。取两个提交的 JSet 的并集。如果在并集中没有至少 1/3+ 的验证器集合的双签名，则没有诚实的验证器可以在第一个提交之后预提交任何不同的块。然而，+2/3 的验证器确实这样做了。归谬法证明。

作为推论，当存在分叉时，外部进程可以通过要求每个验证器证明其所有轮次的投票来确定责任。我们要么找到 1/3+ 的验证器无法证明其至少一个投票，要么找到 1/3+ 的验证器存在双签名。

### 替代算法

或者，我们可以将提交的 JSet 视为“完整提交”。也就是说，如果轻客户端和验证器不认为提交的 JSet 也是已提交的，则我们可以得到这样的有益属性：如果存在分叉（例如存在两个冲突的“完整提交”），则至少 1/3+ 的验证器立即因双签名而受到惩罚。

有许多方法可以确保八卦网络高效地共享提交的 JSet。一种解决方案是添加一种新的消息类型，告诉节点的对等方该节点对 B 或 (H,R) 拥有（或不拥有）+2/3 的多数，并提供一个位数组，指示哪些投票对该多数做出了贡献。对等方可以通过适当的投票做出反应。

我们将在Tendermint共识协议的下一个迭代中实现这样的算法。

其他潜在的改进包括在投票中添加更多的数据，例如最后已知的导致锁定变化的PoLC轮次，以及最后一次投票的轮次/步骤（或者，我们可能要求验证者不跳过任何投票）。这可能会使JSet验证/八卦逻辑更容易实现。

### 消息审查攻击

由于区块的定义
[commit](https://github.com/tendermint/tendermint/blob/v0.34.x/docs/tendermint-core/validators.md)，任何1/3+的验证者联盟都可以通过不广播他们的投票来停止区块链。这样的联盟还可以通过拒绝包含这些交易的区块来审查特定的交易，尽管这将导致拒绝相当比例的区块提案，从而降低区块链的提交速率，减少其效用和价值。恶意联盟还可能以滴水般的速度广播投票，以使区块链的区块提交几乎停滞不前，或者进行这些攻击的任意组合。

如果全局的主动对手也参与其中，它可以将网络分区，以使看起来是错误的验证者子集导致了减速。这不仅仅是Tendermint的限制，而是所有共识协议的限制，其网络可能受到主动对手的潜在控制。

### 克服分叉和消息审查攻击

对于这些类型的攻击，一部分验证者应通过外部手段协调签署一个选择分叉（以及任何相关证据）和初始验证者子集的重组提案。签署这样一个重组提案的验证者将放弃在所有其他分叉上的抵押品。客户端应验证重组提案上的签名，验证任何证据，并做出判断或提示最终用户做出决策。例如，手机钱包应用程序可以提示用户进行安全警告，而冰箱可以接受由原始验证者的+1/2签署的任何重组提案。

没有非同步拜占庭容错算法能够在1/3+的验证者不诚实的情况下达成共识，然而一个分叉假设1/3+的验证者已经通过双重签名或无正当理由的锁定更改而变得不诚实。因此，签署重新组织提案是一个协调问题，不能通过任何非同步协议（即自动地，而不对底层网络的可靠性做出假设）来解决。它必须通过弱同步Tendermint共识算法之外的手段提供。目前，我们将重新组织提案协调的问题留给人类通过互联网媒体进行协调。验证者必须注意确保没有重大的网络分区，以避免出现两个冲突的重新组织提案被签署的情况。

假设外部协调媒介和协议是健壮的，那么分叉相对于[审查攻击](#censorship-attacks)来说就不是那么令人担忧了。

### 规范的提交与主观的提交

我们区分"规范的"提交和"主观的"提交。主观的提交是每个验证者在决定提交一个区块时在本地看到的情况。规范的提交是由下一个区块的提议者在该区块的`LastCommit`字段中包含的内容。这就是使其成为规范的并确保每个验证者都同意规范的提交，即使它与验证者所看到的导致验证者提交相应区块的+2/3票数不同。每个区块都包含了对前一个区块的规范的+2/3提交。


---
order: 1
---
# Byzantine Consensus Algorithm

## Terms

- The network is composed of optionally connected _nodes_. Nodes
  directly connected to a particular node are called _peers_.
- The consensus process in deciding the next block (at some _height_
  `H`) is composed of one or many _rounds_.
- `NewHeight`, `Propose`, `Prevote`, `Precommit`, and `Commit`
  represent state machine states of a round. (aka `RoundStep` or
  just "step").
- A node is said to be _at_ a given height, round, and step, or at
  `(H,R,S)`, or at `(H,R)` in short to omit the step.
- To _prevote_ or _precommit_ something means to broadcast a [prevote
  vote](https://godoc.org/github.com/tendermint/tendermint/types#Vote)
  or [first precommit
  vote](https://godoc.org/github.com/tendermint/tendermint/types#FirstPrecommit)
  for something.
- A vote _at_ `(H,R)` is a vote signed with the bytes for `H` and `R`
  included in its [sign-bytes](../core/data_structures.md#vote).
- _+2/3_ is short for "more than 2/3"
- _1/3+_ is short for "1/3 or more"
- A set of +2/3 of prevotes for a particular block or `<nil>` at
  `(H,R)` is called a _proof-of-lock-change_ or _PoLC_ for short.

## State Machine Overview

At each height of the blockchain a round-based protocol is run to
determine the next block. Each round is composed of three _steps_
(`Propose`, `Prevote`, and `Precommit`), along with two special steps
`Commit` and `NewHeight`.

In the optimal scenario, the order of steps is:

```md
NewHeight -> (Propose -> Prevote -> Precommit)+ -> Commit -> NewHeight ->...
```

The sequence `(Propose -> Prevote -> Precommit)` is called a _round_.
There may be more than one round required to commit a block at a given
height. Examples for why more rounds may be required include:

- The designated proposer was not online.
- The block proposed by the designated proposer was not valid.
- The block proposed by the designated proposer did not propagate
  in time.
- The block proposed was valid, but +2/3 of prevotes for the proposed
  block were not received in time for enough validator nodes by the
  time they reached the `Precommit` step. Even though +2/3 of prevotes
  are necessary to progress to the next step, at least one validator
  may have voted `<nil>` or maliciously voted for something else.
- The block proposed was valid, and +2/3 of prevotes were received for
  enough nodes, but +2/3 of precommits for the proposed block were not
  received for enough validator nodes.

Some of these problems are resolved by moving onto the next round &
proposer. Others are resolved by increasing certain round timeout
parameters over each successive round.

## State Machine Diagram

```md
                         +-------------------------------------+
                         v                                     |(Wait til `CommmitTime+timeoutCommit`)
                   +-----------+                         +-----+-----+
      +----------> |  Propose  +--------------+          | NewHeight |
      |            +-----------+              |          +-----------+
      |                                       |                ^
      |(Else, after timeoutPrecommit)         v                |
+-----+-----+                           +-----------+          |
| Precommit |  <------------------------+  Prevote  |          |
+-----+-----+                           +-----------+          |
      |(When +2/3 Precommits for block found)                  |
      v                                                        |
+--------------------------------------------------------------------+
|  Commit                                                            |
|                                                                    |
|  * Set CommitTime = now;                                           |
|  * Wait for block, then stage/save/commit block;                   |
+--------------------------------------------------------------------+
```

# Background Gossip

A node may not have a corresponding validator private key, but it
nevertheless plays an active role in the consensus process by relaying
relevant meta-data, proposals, blocks, and votes to its peers. A node
that has the private keys of an active validator and is engaged in
signing votes is called a _validator-node_. All nodes (not just
validator-nodes) have an associated state (the current height, round,
and step) and work to make progress.

Between two nodes there exists a `Connection`, and multiplexed on top of
this connection are fairly throttled `Channel`s of information. An
epidemic gossip protocol is implemented among some of these channels to
bring peers up to speed on the most recent state of consensus. For
example,

- Nodes gossip `PartSet` parts of the current round's proposer's
  proposed block. A LibSwift inspired algorithm is used to quickly
  broadcast blocks across the gossip network.
- Nodes gossip prevote/precommit votes. A node `NODE_A` that is ahead
  of `NODE_B` can send `NODE_B` prevotes or precommits for `NODE_B`'s
  current (or future) round to enable it to progress forward.
- Nodes gossip prevotes for the proposed PoLC (proof-of-lock-change)
  round if one is proposed.
- Nodes gossip to nodes lagging in blockchain height with block
  [commits](https://godoc.org/github.com/tendermint/tendermint/types#Commit)
  for older blocks.
- Nodes opportunistically gossip `ReceivedVote` messages to hint peers what
  votes it already has.
- Nodes broadcast their current state to all neighboring peers. (but
  is not gossiped further)

There's more, but let's not get ahead of ourselves here.

## Proposals

A proposal is signed and published by the designated proposer at each
round. The proposer is chosen by a deterministic and non-choking round
robin selection algorithm that selects proposers in proportion to their
voting power (see
[implementation](https://github.com/tendermint/tendermint/blob/v0.34.x/types/validator_set.go)).

A proposal at `(H,R)` is composed of a block and an optional latest
`PoLC-Round < R` which is included iff the proposer knows of one. This
hints the network to allow nodes to unlock (when safe) to ensure the
liveness property.

## State Machine Spec

### Propose Step (height:H,round:R)

Upon entering `Propose`:

- The designated proposer proposes a block at `(H,R)`.

The `Propose` step ends:

- After `timeoutProposeR` after entering `Propose`. --> goto
  `Prevote(H,R)`
- After receiving proposal block and all prevotes at `PoLC-Round`. -->
  goto `Prevote(H,R)`
- After [common exit conditions](#common-exit-conditions)

### Prevote Step (height:H,round:R)

Upon entering `Prevote`, each validator broadcasts its prevote vote.

- First, if the validator is locked on a block since `LastLockRound`
  but now has a PoLC for something else at round `PoLC-Round` where
  `LastLockRound < PoLC-Round < R`, then it unlocks.
- If the validator is still locked on a block, it prevotes that.
- Else, if the proposed block from `Propose(H,R)` is good, it
  prevotes that.
- Else, if the proposal is invalid or wasn't received on time, it
  prevotes `<nil>`.

The `Prevote` step ends:

- After +2/3 prevotes for a particular block or `<nil>`. -->; goto
  `Precommit(H,R)`
- After `timeoutPrevote` after receiving any +2/3 prevotes. --> goto
  `Precommit(H,R)`
- After [common exit conditions](#common-exit-conditions)

### Precommit Step (height:H,round:R)

Upon entering `Precommit`, each validator broadcasts its precommit vote.

- If the validator has a PoLC at `(H,R)` for a particular block `B`, it
  (re)locks (or changes lock to) and precommits `B` and sets
  `LastLockRound = R`.
- Else, if the validator has a PoLC at `(H,R)` for `<nil>`, it unlocks
  and precommits `<nil>`.
- Else, it keeps the lock unchanged and precommits `<nil>`.

A precommit for `<nil>` means "I didn’t see a PoLC for this round, but I
did get +2/3 prevotes and waited a bit".

The Precommit step ends:

- After +2/3 precommits for `<nil>`. --> goto `Propose(H,R+1)`
- After `timeoutPrecommit` after receiving any +2/3 precommits. --> goto
  `Propose(H,R+1)`
- After [common exit conditions](#common-exit-conditions)

### Common exit conditions

- After +2/3 precommits for a particular block. --> goto
  `Commit(H)`
- After any +2/3 prevotes received at `(H,R+x)`. --> goto
  `Prevote(H,R+x)`
- After any +2/3 precommits received at `(H,R+x)`. --> goto
  `Precommit(H,R+x)`

### Commit Step (height:H)

- Set `CommitTime = now()`
- Wait until block is received. --> goto `NewHeight(H+1)`

### NewHeight Step (height:H)

- Move `Precommits` to `LastCommit` and increment height.
- Set `StartTime = CommitTime+timeoutCommit`
- Wait until `StartTime` to receive straggler commits. --> goto
  `Propose(H,0)`

## Proofs

### Proof of Safety

Assume that at most -1/3 of the voting power of validators is byzantine.
If a validator commits block `B` at round `R`, it's because it saw +2/3
of precommits at round `R`. This implies that 1/3+ of honest nodes are
still locked at round `R' > R`. These locked validators will remain
locked until they see a PoLC at `R' > R`, but this won't happen because
1/3+ are locked and honest, so at most -2/3 are available to vote for
anything other than `B`.

### Proof of Liveness

If 1/3+ honest validators are locked on two different blocks from
different rounds, a proposers' `PoLC-Round` will eventually cause nodes
locked from the earlier round to unlock. Eventually, the designated
proposer will be one that is aware of a PoLC at the later round. Also,
`timeoutProposalR` increments with round `R`, while the size of a
proposal are capped, so eventually the network is able to "fully gossip"
the whole proposal (e.g. the block & PoLC).

### Proof of Fork Accountability

Define the JSet (justification-vote-set) at height `H` of a validator
`V1` to be all the votes signed by the validator at `H` along with
justification PoLC prevotes for each lock change. For example, if `V1`
signed the following precommits: `Precommit(B1 @ round 0)`,
`Precommit(<nil> @ round 1)`, `Precommit(B2 @ round 4)` (note that no
precommits were signed for rounds 2 and 3, and that's ok),
`Precommit(B1 @ round 0)` must be justified by a PoLC at round 0, and
`Precommit(B2 @ round 4)` must be justified by a PoLC at round 4; but
the precommit for `<nil>` at round 1 is not a lock-change by definition
so the JSet for `V1` need not include any prevotes at round 1, 2, or 3
(unless `V1` happened to have prevoted for those rounds).

Further, define the JSet at height `H` of a set of validators `VSet` to
be the union of the JSets for each validator in `VSet`. For a given
commit by honest validators at round `R` for block `B` we can construct
a JSet to justify the commit for `B` at `R`. We say that a JSet
_justifies_ a commit at `(H,R)` if all the committers (validators in the
commit-set) are each justified in the JSet with no duplicitous vote
signatures (by the committers).

- **Lemma**: When a fork is detected by the existence of two
  conflicting [commits](../core/data_structures.md#commit), the
  union of the JSets for both commits (if they can be compiled) must
  include double-signing by at least 1/3+ of the validator set.
  **Proof**: The commit cannot be at the same round, because that
  would immediately imply double-signing by 1/3+. Take the union of
  the JSets of both commits. If there is no double-signing by at least
  1/3+ of the validator set in the union, then no honest validator
  could have precommitted any different block after the first commit.
  Yet, +2/3 did. Reductio ad absurdum.

As a corollary, when there is a fork, an external process can determine
the blame by requiring each validator to justify all of its round votes.
Either we will find 1/3+ who cannot justify at least one of their votes,
and/or, we will find 1/3+ who had double-signed.

### Alternative algorithm

Alternatively, we can take the JSet of a commit to be the "full commit".
That is, if light clients and validators do not consider a block to be
committed unless the JSet of the commit is also known, then we get the
desirable property that if there ever is a fork (e.g. there are two
conflicting "full commits"), then 1/3+ of the validators are immediately
punishable for double-signing.

There are many ways to ensure that the gossip network efficiently share
the JSet of a commit. One solution is to add a new message type that
tells peers that this node has (or does not have) a +2/3 majority for B
(or) at (H,R), and a bitarray of which votes contributed towards that
majority. Peers can react by responding with appropriate votes.

We will implement such an algorithm for the next iteration of the
Tendermint consensus protocol.

Other potential improvements include adding more data in votes such as
the last known PoLC round that caused a lock change, and the last voted
round/step (or, we may require that validators not skip any votes). This
may make JSet verification/gossip logic easier to implement.

### Censorship Attacks

Due to the definition of a block
[commit](https://github.com/tendermint/tendermint/blob/v0.34.x/docs/tendermint-core/validators.md), any 1/3+ coalition of
validators can halt the blockchain by not broadcasting their votes. Such
a coalition can also censor particular transactions by rejecting blocks
that include these transactions, though this would result in a
significant proportion of block proposals to be rejected, which would
slow down the rate of block commits of the blockchain, reducing its
utility and value. The malicious coalition might also broadcast votes in
a trickle so as to grind blockchain block commits to a near halt, or
engage in any combination of these attacks.

If a global active adversary were also involved, it can partition the
network in such a way that it may appear that the wrong subset of
validators were responsible for the slowdown. This is not just a
limitation of Tendermint, but rather a limitation of all consensus
protocols whose network is potentially controlled by an active
adversary.

### Overcoming Forks and Censorship Attacks

For these types of attacks, a subset of the validators through external
means should coordinate to sign a reorg-proposal that chooses a fork
(and any evidence thereof) and the initial subset of validators with
their signatures. Validators who sign such a reorg-proposal forego its
collateral on all other forks. Clients should verify the signatures on
the reorg-proposal, verify any evidence, and make a judgement or prompt
the end-user for a decision. For example, a phone wallet app may prompt
the user with a security warning, while a refrigerator may accept any
reorg-proposal signed by +1/2 of the original validators.

No non-synchronous Byzantine fault-tolerant algorithm can come to
consensus when 1/3+ of validators are dishonest, yet a fork assumes that
1/3+ of validators have already been dishonest by double-signing or
lock-changing without justification. So, signing the reorg-proposal is a
coordination problem that cannot be solved by any non-synchronous
protocol (i.e. automatically, and without making assumptions about the
reliability of the underlying network). It must be provided by means
external to the weakly-synchronous Tendermint consensus algorithm. For
now, we leave the problem of reorg-proposal coordination to human
coordination via internet media. Validators must take care to ensure
that there are no significant network partitions, to avoid situations
where two conflicting reorg-proposals are signed.

Assuming that the external coordination medium and protocol is robust,
it follows that forks are less of a concern than [censorship
attacks](#censorship-attacks).

### Canonical vs subjective commit

We distinguish between "canonical" and "subjective" commits. A subjective commit is what
each validator sees locally when they decide to commit a block. The canonical commit is
what is included by the proposer of the next block in the `LastCommit` field of
the block. This is what makes it canonical and ensures every validator agrees on the canonical commit,
even if it is different from the +2/3 votes a validator has seen, which caused the validator to
commit the respective block. Each block contains a canonical +2/3 commit for the previous
block.
