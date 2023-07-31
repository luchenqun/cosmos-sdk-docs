# 基于提案者的时间

## 当前的BFT时间

### 描述

在Tendermint共识中，块中时间的计算和存储的第一个版本的工作原理如下：

- 验证者在`precommit`消息中发送他们当前的本地时间
- 在收集到提案者用于构建放入下一个块中的提交的`precommit`消息后，提案者计算下一个块的`time`作为`precommit`消息中时间的中位数（按投票权重加权）。

### 分析

1. **容错性。** 计算得到的中位数时间被称为[`bfttime`][bfttime]，因为它确实具有容错性：如果**不到三分之一**的验证者是有故障的（按投票权重计算），则保证计算得到的时间位于正确验证者发送的最小时间和最大时间之间。
1. **有故障验证者的影响。** 如果有超过`1/2`的投票权重（实际上是超过三分之一且少于三分之二的投票权重）由有故障的验证者持有，则时间完全受到有故障的验证者的控制。（在[轻客户端][lcspec]安全性的背景下，这是特别具有挑战性的。）
1. **提案者对块时间的影响。** 下一个块的提案者在选择`bfttime`时具有一定的自由度，因为它根据`precommit`消息中由`2f + 1`个正确的验证者发送的时间戳计算中位数时间。
   1. 如果`precommit`消息中有`n`个不同的时间戳，提案者可以使用任何时间戳的子集，使其总和达到`2f + 1`的投票权重，以计算中位数。
   1. 如果验证者在不同的轮次决定，提案者可以决定基于哪个轮次进行中位数计算。
1. **活性。** 协议的活性：
   1. 不依赖于时钟同步，
   1. 依赖于有界的消息延迟。
1. **与真实时间的关系。** 没有时钟同步，这意味着计算得到的块`time`与真实时间之间**没有关系**。
1. **聚合签名。** 由于`precommit`消息包含本地时间，所有这些`precommit`消息在时间字段上通常不同，这**阻止**了聚合签名的使用。

## 建议的基于提案者的时间

### 概述

已经讨论了一种替代的时间方法：与其让验证者在`precommit`消息中发送时间，不如让共识算法中的提案者在`propose`消息中发送其时间，并且验证者通过与本地时钟进行比较来检查时间是否正确。

这种提议的解决方案增加了需要同步时钟和其他隐含假设的要求。

### 将建议方法与旧方法进行比较

1. **容错性。** 在建议的协议中保持不变。
1. **错误验证者的影响。** 在建议的协议中被消除，
   也就是说，块的`time`只有在`>2/3`的验证者出现故障的极端情况下才会被破坏。
1. **提案者对块时间的影响。** 下一个块的提案者在选择块时间时具有较少的自由度。
   1. 在建议的协议中，只要有`<1/3`的错误验证者，这种情况就被消除了。
   1. 这种情况仍然存在。
1. **活跃性。** 建议的协议的活跃性：
   1. 取决于对同步时钟的引入假设（见下文），
   1. 仍然取决于消息延迟（不可避免）。
1. **与真实时间的关系。** 我们形式化了时钟同步，并获得了块`time`与真实时间之间的**明确定义的关系**。
1. **聚合签名。** `precommit`消息中不包含时间，这**允许**进行聚合签名。

### 协议概述

#### 提议时间

我们假设`PROPOSE`消息中的`proposal`字段是一个二元组`(v, time)`，其中`v`是提议的共识值，`time`是提议的时间。

#### 接收步骤

在节点`p`在本地时间`now_p`接收到消息`m`时的接收步骤：

- **如果**消息`m`的类型是`PROPOSE`，并且满足`now_p - PRECISION <  m.time < now_p + PRECISION + MSGDELAY`，则将该消息标记为`timely`。
（`PRECISION`和`MSGDELAY`是系统参数，见[下文](#safety-and-liveness)）

> 在开发会议中的演示之后，我们意识到使用不同的接收步骤语义更接近于实现。我们不再丢弃提议消息，而是保留所有消息，并标记及时的消息。

#### 处理步骤

- 开始轮次

<table>
<tr>
<th>arXiv 论文</th>
<th>基于提议者的时间</th>
</tr>

<tr>
<td>

```go
function StartRound(round) {
 round_p ← round
 step_p ← propose
 if proposer(h_p, round_p) = p {

 
  if validValue_p != nil {

   proposal ← validValue_p
  } else {

   proposal ← getValue()
  }
   broadcast ⟨PROPOSAL, h_p, round_p, proposal, validRound_p⟩
 } else {
  schedule OnTimeoutPropose(h_p,round_p) to 
   be executed after timeoutPropose(round_p)
 }
}
```

</td>

<td>

```go
function StartRound(round) {
 round_p ← round
 step_p ← propose
 if proposer(h_p, round_p) = p {
  // new wait condition
  wait until now_p > block time of block h_p - 1
  if validValue_p != nil {
   // add "now_p"
   proposal ← (validValue_p, now_p) 
  } else {
   // add "now_p"
   proposal ← (getValue(), now_p) 
  }
  broadcast ⟨PROPOSAL, h_p, round_p, proposal, validRound_p⟩
 } else {
  schedule OnTimeoutPropose(h_p,round_p) to 
   be executed after timeoutPropose(round_p)
 }
}
```

</td>
</tr>
</table>

- 第 28-35 行的规则

<table>
<tr>
<th>arXiv 论文</th>
<th>基于提议者的时间</th>
</tr>

<tr>
<td>

```go
upon timely(⟨PROPOSAL, h_p, round_p, v, vr⟩) 
 from proposer(h_p, round_p)
 AND 2f + 1 ⟨PREVOTE, h_p, vr, id(v)⟩ 
while step_p = propose ∧ (vr ≥ 0 ∧ vr < round_p) do {
 if valid(v) ∧ (lockedRound_p ≤ vr ∨ lockedValue_p = v) {
  
  broadcast ⟨PREVOTE, h_p, round_p, id(v)⟩
 } else {
  broadcast ⟨PREVOTE, hp, round_p, nil⟩
 }
}
```

</td>

<td>

```go
upon timely(⟨PROPOSAL, h_p, round_p, (v, tprop), vr⟩) 
 from proposer(h_p, round_p) 
 AND 2f + 1 ⟨PREVOTE, h_p, vr, id(v, tvote)⟩ 
 while step_p = propose ∧ (vr ≥ 0 ∧ vr < round_p) do {
  if valid(v) ∧ (lockedRound_p ≤ vr ∨ lockedValue_p = v) {
   // send hash of v and tprop in PREVOTE message
   broadcast ⟨PREVOTE, h_p, round_p, id(v, tprop)⟩
  } else {
   broadcast ⟨PREVOTE, hp, round_p, nil⟩
  }
 }
```

</td>
</tr>
</table>

- 第 49-54 行的规则

<table>
<tr>
<th>arXiv 论文</th>
<th>基于提议者的时间</th>
</tr>

<tr>
<td>

```go
upon ⟨PROPOSAL, h_p, r, v, ∗⟩ from proposer(h_p, r) 
 AND 2f + 1 ⟨PRECOMMIT, h_p, r, id(v)⟩ 
 while decisionp[h_p] = nil do {
  if valid(v) {

   decision_p [h_p] = v
   h_p ← h_p + 1
   reset lockedRound_p , lockedValue_p, validRound_p and 
    validValue_p to initial values and empty message log 
   StartRound(0)
  }
 }
```

</td>

<td>

```go
upon ⟨PROPOSAL, h_p, r, (v,t), ∗⟩ from proposer(h_p, r) 
 AND 2f + 1 ⟨PRECOMMIT, h_p, r, id(v,t)⟩
 while decisionp[h_p] = nil do {
  if valid(v) {
   // decide on time too
   decision_p [h_p] = (v,t) 
   h_p ← h_p + 1
   reset lockedRound_p , lockedValue_p, validRound_p and 
    validValue_p to initial values and empty message log 
   StartRound(0)
  }
 }
```

</td>
</tr>
</table>

- 其他规则以类似的方式扩展或保持不变

### 属性概述

#### 安全性和活性

对于安全性（点 1、点 2、点 3i）和活性（点 4），我们需要以下假设：

- 存在一个系统参数 `PRECISION`，使得对于任意两个正确的验证者 `V` 和 `W`，以及任意实时 `t`，它们的本地时间 `C_V(t)` 和 `C_W(t)` 之间的差异小于 `PRECISION` 时间单位，即 `|C_V(t) - C_W(t)| < PRECISION`
- 对于一个正确的提议者和一个正确的验证者之间的消息端到端延迟（对于 `PROPOSE` 消息），小于 `MSGDELAY`。

#### 与实时相关性

为了分析实时安全性（点 5），我们使用一个系统参数 `ACCURACY`，对于所有实时 `t` 和所有正确的验证者 `V`，我们有 `| C_V(t) - t | < ACCURACY`。

> `ACCURACY` 在代码层面上不一定可见。我们甚至可以将 `ACCURACY` 视为随时间变化的变量。在一个共识实例中，它越小，区块时间越接近实时。
>
> 注意 `PRECISION` 和 `MSGDELAY` 出现在代码中。

### 详细规范

本规范描述了对 Tendermint 共识算法所需进行的更改，如 [arXiv 论文][arXiv] 中所述以及 [TLA+][tlatender] 中的简化规范，并明确了基础假设和所需属性。

- [第一部分 - 系统模型和属性][sysmodel]
- [第二部分 - 协议规范][algorithm]
- [TLA+ 规范][proposertla]

[arXiv]: https://arxiv.org/abs/1807.04938

[tlatender]: https://github.com/tendermint/spec/blob/master/rust-spec/tendermint-accountability/README.md

[bfttime]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/spec/consensus/bft-time.md

[lcspec]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/rust-spec/lightclient/README.md

[algorithm]: ./pbts-algorithm_001_draft.md

[sysmodel]: ./pbts-sysmodel_001_draft.md

[main]: ./pbts_001_draft.md

[proposertla]: ./tla/TendermintPBT_001_draft.tla


# Proposer-Based Time

## Current BFTTime

### Description

In Tendermint consensus, the first version of how time is computed and stored in a block works as follows:

- validators send their current local time as part of `precommit` messages
- upon collecting the `precommit` messages that the proposer uses to build a commit to be put in the next block, the proposer computes the `time` of the next block as the median (weighted over voting power) of the times in the `precommit` messages.

### Analysis

1. **Fault tolerance.** The computed median time is called [`bfttime`][bfttime] as it is indeed fault-tolerant: if **less than a third** of the validators is faulty (counted in voting power), it is guaranteed that the computed time lies between the minimum and the maximum times sent by correct validators.
1. **Effect of faulty validators.** If more than `1/2` of the voting power (which is in fact more than one third and less than two thirds of the voting power) is held by faulty validators, then the time is under total control of the faulty validators. (This is particularly challenging in the context of [lightclient][lcspec] security.)
1. **Proposer influence on block time.** The proposer of the next block has a degree of freedom in choosing the `bfttime`, since it computes the median time based on the timestamps from `precommit` messages sent by
   `2f + 1` correct validators.
   1. If there are `n` different timestamps in the  `precommit` messages, the proposer can use any subset of timestamps that add up to `2f + 1`
	  of the voting power in order to compute the median.
   1. If the validators decide in different rounds, the proposer can decide on which round the median computation is based.
1. **Liveness.** The liveness of the protocol:
   1. does not depend on clock synchronization,
   1. depends on bounded message delays.
1. **Relation to real time.** There is no clock synchronizaton, which implies that there is **no relation** between the computed block `time` and real time.
1. **Aggregate signatures.** As the `precommit` messages contain the local times, all these `precommit` messages typically differ in the time field, which **prevents** the use of aggregate signatures.

## Suggested Proposer-Based Time

### Outline

An alternative approach to time has been discussed: Rather than having the validators send the time in the `precommit` messages, the proposer in the consensus algorithm sends its time in the `propose` message, and the validators locally check whether the time is OK (by comparing to their local clock).

This proposed solution adds the requirement of having synchronized clocks, and other implicit assumptions.

### Comparison of the Suggested Method to the Old One

1. **Fault tolerance.** Maintained in the suggested protocol.
1. **Effect of faulty validators.** Eliminated in the suggested protocol,
   that is, the block `time` can be corrupted only in the extreme case when
   `>2/3` of the validators are faulty.
1. **Proposer influence on block time.** The proposer of the next block
   has less freedom when choosing the block time.
   1. This scenario is eliminated in the suggested protocol, provided that there are `<1/3` faulty validators.
   1. This scenario is still there.
1. **Liveness.** The liveness of the suggested protocol:
   1. depends on the introduced assumptions on synchronized clocks (see below),
   1. still depends on the message delays (unavoidable).
1. **Relation to real time.** We formalize clock synchronization, and obtain a **well-defined relation** between the block `time` and real time.
1. **Aggregate signatures.** The `precommit` messages free of time, which **allows** for aggregate signatures.

### Protocol Overview

#### Proposed Time

We assume that the field `proposal` in the `PROPOSE` message is a pair `(v, time)`, of the proposed consensus value `v` and the proposed time `time`.

#### Reception Step

In the reception step at node `p` at local time `now_p`, upon receiving a message `m`:

- **if** the message `m` is of type `PROPOSE` and satisfies `now_p - PRECISION <  m.time < now_p + PRECISION + MSGDELAY`, then mark the message as `timely`.  
(`PRECISION` and `MSGDELAY` being system parameters, see [below](#safety-and-liveness))

> after the presentation in the dev session, we realized that different semantics for the reception step is closer aligned to the implementation. Instead of dropping propose messages, we keep all of them, and mark timely ones.

#### Processing Step

- Start round

<table>
<tr>
<th>arXiv paper</th>
<th>Proposer-based time</th>
</tr>

<tr>
<td>

```go
function StartRound(round) {
 round_p ← round
 step_p ← propose
 if proposer(h_p, round_p) = p {

 
  if validValue_p != nil {

   proposal ← validValue_p
  } else {

   proposal ← getValue()
  }
   broadcast ⟨PROPOSAL, h_p, round_p, proposal, validRound_p⟩
 } else {
  schedule OnTimeoutPropose(h_p,round_p) to 
   be executed after timeoutPropose(round_p)
 }
}
```

</td>

<td>

```go
function StartRound(round) {
 round_p ← round
 step_p ← propose
 if proposer(h_p, round_p) = p {
  // new wait condition
  wait until now_p > block time of block h_p - 1
  if validValue_p != nil {
   // add "now_p"
   proposal ← (validValue_p, now_p) 
  } else {
   // add "now_p"
   proposal ← (getValue(), now_p) 
  }
  broadcast ⟨PROPOSAL, h_p, round_p, proposal, validRound_p⟩
 } else {
  schedule OnTimeoutPropose(h_p,round_p) to 
   be executed after timeoutPropose(round_p)
 }
}
```

</td>
</tr>
</table>

- Rule on lines 28-35

<table>
<tr>
<th>arXiv paper</th>
<th>Proposer-based time</th>
</tr>

<tr>
<td>

```go
upon timely(⟨PROPOSAL, h_p, round_p, v, vr⟩) 
 from proposer(h_p, round_p)
 AND 2f + 1 ⟨PREVOTE, h_p, vr, id(v)⟩ 
while step_p = propose ∧ (vr ≥ 0 ∧ vr < round_p) do {
 if valid(v) ∧ (lockedRound_p ≤ vr ∨ lockedValue_p = v) {
  
  broadcast ⟨PREVOTE, h_p, round_p, id(v)⟩
 } else {
  broadcast ⟨PREVOTE, hp, round_p, nil⟩
 }
}
```

</td>

<td>

```go
upon timely(⟨PROPOSAL, h_p, round_p, (v, tprop), vr⟩) 
 from proposer(h_p, round_p) 
 AND 2f + 1 ⟨PREVOTE, h_p, vr, id(v, tvote)⟩ 
 while step_p = propose ∧ (vr ≥ 0 ∧ vr < round_p) do {
  if valid(v) ∧ (lockedRound_p ≤ vr ∨ lockedValue_p = v) {
   // send hash of v and tprop in PREVOTE message
   broadcast ⟨PREVOTE, h_p, round_p, id(v, tprop)⟩
  } else {
   broadcast ⟨PREVOTE, hp, round_p, nil⟩
  }
 }
```

</td>
</tr>
</table>

- Rule on lines 49-54

<table>
<tr>
<th>arXiv paper</th>
<th>Proposer-based time</th>
</tr>

<tr>
<td>

```go
upon ⟨PROPOSAL, h_p, r, v, ∗⟩ from proposer(h_p, r) 
 AND 2f + 1 ⟨PRECOMMIT, h_p, r, id(v)⟩ 
 while decisionp[h_p] = nil do {
  if valid(v) {

   decision_p [h_p] = v
   h_p ← h_p + 1
   reset lockedRound_p , lockedValue_p, validRound_p and 
    validValue_p to initial values and empty message log 
   StartRound(0)
  }
 }
```

</td>

<td>

```go
upon ⟨PROPOSAL, h_p, r, (v,t), ∗⟩ from proposer(h_p, r) 
 AND 2f + 1 ⟨PRECOMMIT, h_p, r, id(v,t)⟩
 while decisionp[h_p] = nil do {
  if valid(v) {
   // decide on time too
   decision_p [h_p] = (v,t) 
   h_p ← h_p + 1
   reset lockedRound_p , lockedValue_p, validRound_p and 
    validValue_p to initial values and empty message log 
   StartRound(0)
  }
 }
```

</td>
</tr>
</table>

- Other rules are extended in a similar way, or remain unchanged

### Property Overview

#### Safety and Liveness

For safety (Point 1, Point 2, Point 3i) and liveness (Point 4) we need
the following assumptions:

- There exists a system parameter `PRECISION` such that for any two correct validators `V` and `W`, and at any real-time `t`, their local times `C_V(t)` and `C_W(t)` differ by less than `PRECISION` time units,
i.e., `|C_V(t) - C_W(t)| < PRECISION`
- The message end-to-end delay between a correct proposer and a correct validator (for `PROPOSE` messages) is less than `MSGDELAY`.

#### Relation to Real-Time

For analyzing real-time safety (Point 5), we use a system parameter `ACCURACY`, such that for all real-times `t` and all correct validators `V`, we have `| C_V(t) - t | < ACCURACY`.

> `ACCURACY` is not necessarily visible at the code level.  We might even view `ACCURACY` as variable over time. The smaller it is during a consensus instance, the closer the block time will be to real-time.
>
> Note that `PRECISION` and `MSGDELAY` show up in the code.

### Detailed Specification

This specification describes the changes needed to be done to the Tendermint consensus algorithm as described in the [arXiv paper][arXiv] and the simplified specification in [TLA+][tlatender], and makes precise the underlying assumptions and the required properties.

- [Part I - System Model and Properties][sysmodel]
- [Part II - Protocol specification][algorithm]
- [TLA+ Specification][proposertla]

[arXiv]: https://arxiv.org/abs/1807.04938

[tlatender]: https://github.com/tendermint/spec/blob/master/rust-spec/tendermint-accountability/README.md

[bfttime]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/spec/consensus/bft-time.md

[lcspec]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/rust-spec/lightclient/README.md

[algorithm]: ./pbts-algorithm_001_draft.md

[sysmodel]: ./pbts-sysmodel_001_draft.md

[main]: ./pbts_001_draft.md

[proposertla]: ./tla/TendermintPBT_001_draft.tla
