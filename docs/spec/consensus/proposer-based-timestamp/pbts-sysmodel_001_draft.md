# 基于提议者的时间 - 第一部分

## 系统模型

### 时间和时钟

#### **[PBTS-CLOCK-NEWTON.0]**

存在一个参考的牛顿实时时间 `t`（UTC）。

每个正确的验证者 `V` 维护一个同步的时钟 `C_V`，确保：

#### **[PBTS-CLOCK-PRECISION.0]**

存在一个系统参数 `PRECISION`，对于任意两个正确的验证者 `V` 和 `W`，以及任意实时时间 `t`，  
`|C_V(t) - C_W(t)| < PRECISION`


### 消息延迟

我们不希望干扰 Tendermint 的时间假设。我们将假设一个时间限制，如果满足，则保证了活性。

通常情况下，本地时钟可能会与全局时间有偏差。（它可能会快进，例如，一秒钟的时钟时间可能需要 1.005 秒的实时时间）。因此，本地时钟和全局时钟可能以不同的时间单位进行测量。通常，消息延迟是以全局时钟时间单位来衡量的。为了精确估计正确的本地超时时间，我们需要估计消息延迟的时钟时间持续时间，考虑到时钟漂移。为了简单起见，我们忽略了这一点，并直接假设消息延迟的假设是以本地时间为基础的。

#### **[PBTS-MSG-D.0]**

存在一个系统参数 `MSGDELAY`，用于以时钟时间计算的消息端到端延迟。

> 注意，[PBTS-MSG-D.0] 对消息延迟以及时钟施加了约束。

#### **[PBTS-MSG-FAIR.0]**

正确的提议者和正确的验证者之间（对于 `PROPOSE` 消息）的消息端到端延迟小于 `MSGDELAY`。


## 问题陈述

在本节中，我们在这个新的系统模型中定义 Tendermint 共识的属性（参见 [arXiv 论文][arXiv]）。

#### **[PBTS-PROPOSE.0]**

提议者提出一个共识值 `v` 和时间 `t` 的对 `(v,t)`。

> 然后，我们对允许的决策进行以下限制：

#### **[PBTS-INV-AGREEMENT.0]**

[一致性] 没有两个正确的验证者对不同的值 `v` 做出决策。

#### **[PBTS-INV-TIME-VAL.0]**

[时间有效性] 如果一个正确的验证者对 `t` 做出决策，则 `t` 是“OK”的（我们将在下面形式化这一点），即使最多有 `2f` 个验证者是有故障的。

然而，对于Tendermint共识的属性，更加关注的是区块，即写入区块的内容和时间。因此，在接下来的内容中，我们将从这个以区块为中心的视角给出安全性和活性属性。
为此，请注意，在共识高度`k`决定的时间`t`将写入高度为`k+1`的区块，并且将由相同共识轮`r`的`2f + 1`个`PRECOMMIT`消息支持。我们将在区块中表示写入的时间为`b.time`（以区别于基于中位数的时间术语`bfttime`）。为此，具有以下共识算法属性非常重要：

#### **[PBTS-INV-TIME-AGR.0]**

[时间一致性] 如果两个正确的验证者在同一轮决策，则它们对于相同的`t`达成一致。

#### **[PBTS-DECISION-ROUND.0]**

请注意，共识决策与区块之间的关系并不直接；特别是在考虑时间时：在提议的解决方案中，由于验证者可能在不同的轮次决策，它们可能在不同的时间上做出决策。
下一个区块的提议者可能选择一个提交（至少来自一轮的`2f + 1`个`PRECOMMIT`消息），从而选择一个将成为“规范”的决策轮次。
因此，提议者隐式地可以选择属于验证者决策轮次的时间之一。请注意，这个选择在基于中位数的`bfttime`中已经隐含存在。
然而，由于大多数共识实例在Cosmos Hub上在一个轮次内终止，这在实践中几乎不会被观察到。

最后，请注意，一致性（[一致性]和[时间一致性]）属性是基于Tendermint安全模型[TMBC-FM-2THIRDS.0]中超过2/3个正确验证者的基础上的，而[时间有效性]是基于超过1/3个正确验证者的。

### 安全性

在这里，我们将提供将本地时间与区块时间相关联的规范。然而，由于我们目前不假设本地时间与实时时间相关联，因此这些规范也不提供区块时间与实时时间之间的关系。这样的属性将在[后面](#REAL-TIME-SAFETY)给出。

对于一个正确的验证者 `V`，让 `beginConsensus(V,k)` 表示其将高度设置为 `k` 时的本地时间，`endConsensus(V,k)` 表示其将高度设置为 `k + 1` 时的时间。

定义

- `beginConsensus(k)` 为 `beginConsensus(V,k)` 的最小值，
- `last-beginConsensus(k)` 为 `beginConsensus(V,k)` 的最大值，
- `endConsensus(k)` 为 `endConsensus(V,k)` 的最大值，

其中 `V` 为所有正确的验证者。

> 注意到 `beginConsensus(k) <= last-beginConsensus(k)`，如果本地时钟是单调的，则有 `last-beginConsensus(k) <= endConsensus(k)`。

#### **[PBTS-CLOCK-GROW.0]**

我们假设在一个共识实例中，本地时钟不会被回拨，特别地，对于每个正确的验证者 `V` 和每个高度 `k`，我们有 `beginConsensus(V,k) < endConsensus(V,k)`。

#### **[PBTS-CONSENSUS-TIME-VALID.0]**

如果

- 存在一个高度为 `k` 的有效提交 `c`，且
- `c` 包含至少一个正确的验证者的 `PRECOMMIT` 消息，

那么由 `c` 签名的块 `b` 中的时间 `b.time` 满足

- `beginConsensus(k) - PRECISION <= b.time < endConsensus(k) + PRECISION + MSGDELAY`。

> [PBTS-CONSENSUS-TIME-VALID.0] 基于一个分析，其中提议者是有错误的（不计入 `beginConsensus(k)` 和 `endConsensus(k)`），我们估计正确的验证者接收和 `accept` `propose` 消息的时间。如果提议者是正确的，我们得到

#### **[PBTS-CONSENSUS-LIVE-VALID-CORR-PROP.0]**

如果第一轮的提议者是正确的，并且满足

- 对于高度为 `k - 1` 的块，[TMBC-FM-2THIRDS.0] 成立，
- [PBTS-MSG-FAIR.0]，
- [PBTS-CLOCK-PRECISION.0]，
- [PBTS-CLOCK-GROW.0]（**TODO:** 是否足够？），

那么最终（在有界时间内），每个正确的验证者都会在第一轮中做出决策。

#### **[PBTS-CONSENSUS-SAFE-VALID-CORR-PROP.0]**

如果第一轮的提议者是正确的，并且满足

- 对于高度为 `k - 1` 的块，[TMBC-FM-2THIRDS.0] 成立，
- [PBTS-MSG-FAIR.0]，
- [PBTS-CLOCK-PRECISION.0]，
- [PBTS-CLOCK-GROW.0]（**TODO:** 是否足够？），

那么有 `beginConsensus_k <= b.time <= last-beginConsensus_k`。

> 对于上述两个属性，我们假设一个正确的提议者 `v` 在其本地时间 `beginConsensus(v,k)` 发送其 `PROPOSAL`。

### 存活性

如果满足以下条件：

- 对于高度为 `k - 1` 的区块，[TMBC-FM-2THIRDS.0] 成立，并且
- [PBTS-MSG-FAIR.0]，
- [PBTS-CLOCK.0]，以及
- [PBTS-CLOCK-GROW.0]（**TODO:** 这样够了吗？）

那么最终会存在一个高度为 `k` 的有效提交 `c`。


### 实时安全性

> 我们希望给出一个可以从外部利用的属性，也就是说，给定一个带有一些时间的区块，我们可以估计该区块生成的实时时间。为此，我们需要将时钟时间与实时时间关联起来；而这在 [PBTS-CLOCK.0] 中并不成立。因此，我们引入以下关于时钟的假设：

#### **[PBTS-CLOCKSYNC-EXTERNAL.0]**

存在一个系统参数 `ACCURACY`，对于所有实时时间 `t` 和所有正确的验证者 `V`，满足：

- `| C_V(t) - t | < ACCURACY`。

> `ACCURACY` 不一定在代码层面可见。下面的属性只是展示了，它的值越小，区块时间越接近实时时间。

#### **[PBTS-CONSENSUS-PTIME.0]**

设 `m` 是一个提议消息。我们考虑以下两个实时时间 `proposalTime(m)` 和 `propRecvTime(m)`：

- 如果提议者是正确的，并在时间 `t` 发送了 `m`，我们用实时时间 `t` 表示 `proposalTime(m)`。
- 如果第一个正确的验证者在时间 `t` 接收了 `m`，我们用实时时间 `t` 表示 `propRecvTime(m)`。


#### **[PBTS-CONSENSUS-REALTIME-VALID.0]**

设 `b` 是一个包含至少一个正确验证者的 `precommit` 消息的有效提交的区块（且 `proposalTime` 是触发 `precommit` 的高度/轮次 `propose` 消息 `m` 的时间）。那么：

`propRecvTime(m) - ACCURACY - PRECISION < b.time < propRecvTime(m) + ACCURACY + PRECISION + MSGDELAY`


#### **[PBTS-CONSENSUS-REALTIME-VALID-CORR.0]**

设 `b` 是一个包含至少一个正确验证者的 `precommit` 消息的有效提交的区块（且 `proposalTime` 是触发 `precommit` 的高度/轮次 `propose` 消息 `m` 的时间）。那么，如果提议者是正确的：

`proposalTime(m) - ACCURACY < b.time < proposalTime(m) + ACCURACY`

> 在时间 `proposalTime(m)` 算法中，提议者修正了 `m.time <- now_p(proposalTime(m))`

> "触发了 `PRECOMMIT`" 意味着 `m` 和 `b` 中的数据是"匹配的"，也就是说，`m` 提议的值实际上存储在 `b` 中。

返回[主文档][main]。

[main]: ./pbts_001_draft.md

[arXiv]: https://arxiv.org/abs/1807.04938

[tlatender]: https://github.com/tendermint/spec/blob/master/rust-spec/tendermint-accountability/README.md

[bfttime]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/spec/consensus/bft-time.md

[lcspec]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/rust-spec/lightclient/README.md

[algorithm]: ./pbts-algorithm_001_draft.md

[sysmodel]: ./pbts-sysmodel_001_draft.md


# Proposer-Based Time - Part I

## System Model

### Time and Clocks

#### **[PBTS-CLOCK-NEWTON.0]**

There is a reference Newtonian real-time `t` (UTC).

Every correct validator `V` maintains a synchronized clock `C_V` that ensures:

#### **[PBTS-CLOCK-PRECISION.0]**

There exists a system parameter `PRECISION` such that for any two correct validators `V` and `W`, and at any real-time `t`,  
`|C_V(t) - C_W(t)| < PRECISION`


### Message Delays

We do not want to interfere with the Tendermint timing assumptions. We will postulate a timing restriction, which, if satisfied, ensures that liveness is preserved.

In general the local clock may drift from the global time. (It may progress faster, e.g., one second of clock time might take 1.005 seconds of real-time). As a result the local clock and the global clock may be measured in different time units. Usually, the message delay is measured in global clock time units. To estimate the correct local timeout precisely, we would need to estimate the clock time duration of a message delay taking into account the clock drift. For simplicity we ignore this, and directly postulate the message delay assumption in terms of local time.


#### **[PBTS-MSG-D.0]**

There exists a system parameter `MSGDELAY` for message end-to-end delays **counted in clock-time**.

> Observe that [PBTS-MSG-D.0] imposes constraints on message delays as well as on the clock.

#### **[PBTS-MSG-FAIR.0]**

The message end-to-end delay between a correct proposer and a correct validator (for `PROPOSE` messages) is less than `MSGDELAY`.


## Problem Statement

In this section we define the properties of Tendermint consensus (cf. the [arXiv paper][arXiv]) in this new system model.

#### **[PBTS-PROPOSE.0]**

A proposer proposes a pair `(v,t)` of consensus value `v` and time `t`.

> We then restrict the allowed decisions along the following lines:

#### **[PBTS-INV-AGREEMENT.0]**

[Agreement] No two correct validators decide on different values `v`.

#### **[PBTS-INV-TIME-VAL.0]**

[Time-Validity] If a correct validator decides on `t` then `t` is "OK" (we will formalize this below), even if up to `2f` validators are faulty.

However, the properties of Tendermint consensus are of more interest with respect to the blocks, that is, what is written into a block and when. We therefore, in the following, will give the safety and liveness properties from this block-centric viewpoint.  
For this, observe that the time `t` decided at consensus height `k` will be written in the block of height `k+1`, and will be supported by `2f + 1` `PRECOMMIT` messages of the same consensus round `r`. The time written in the block, we will denote by `b.time` (to distinguish it from the term `bfttime` used for median-based time). For this, it is important to have the following consensus algorithm property:

#### **[PBTS-INV-TIME-AGR.0]**

[Time-Agreement] If two correct validators decide in the same round, then they decide on the same `t`.

#### **[PBTS-DECISION-ROUND.0]**

Note that the relation between consensus decisions, on the one hand, and blocks, on the other hand, is not immediate; in particular if we consider time: In the proposed solution,
as validators may decide in different rounds, they may decide on different times.
The proposer of the next block, may pick a commit (at least `2f + 1` `PRECOMMIT` messages from one round), and thus it picks a decision round that is going to become "canonic".
As a result, the proposer implicitly has a choice of one of the times that belong to rounds in which validators decided. Observe that this choice was implicitly the case already in the median-based `bfttime`.
However, as most consensus instances terminate within one round on the Cosmos hub, this is hardly ever observed in practice.



Finally, observe that the agreement ([Agreement] and [Time-Agreement]) properties are based on the Tendermint security model [TMBC-FM-2THIRDS.0] of more than 2/3 correct validators, while [Time-Validity] is based on more than 1/3 correct validators.

### SAFETY

Here we will provide specifications that relate local time to block time. However, since we do not assume (by now) that local time is linked to real-time, these specifications also do not provide a relation between block time and real-time. Such properties are given [later](#REAL-TIME-SAFETY).

For a correct validator `V`, let `beginConsensus(V,k)` be the local time when it sets its height to `k`, and let `endConsensus(V,k)` be the time when it sets its height to `k + 1`.

Let

- `beginConsensus(k)` be the minimum over `beginConsensus(V,k)`, and
- `last-beginConsensus(k)` be the maximum over `beginConsensus(V,k)`, and
- `endConsensus(k)` the maximum over `endConsensus(V,k)`

for all correct validators `V`.

> Observe that `beginConsensus(k) <= last-beginConsensus(k)` and if local clocks are monotonic, then `last-beginConsensus(k) <= endConsensus(k)`.

#### **[PBTS-CLOCK-GROW.0]**

We assume that during one consensus instance, local clocks are not set back, in particular for each correct validator `V` and each height `k`, we have `beginConsensus(V,k) < endConsensus(V,k)`.


#### **[PBTS-CONSENSUS-TIME-VALID.0]**

If

- there is a valid commit `c` for height `k`, and
- `c` contains a `PRECOMMIT` message by at least one correct validator,

then the time `b.time` in the block `b` that is signed by `c` satisfies

- `beginConsensus(k) - PRECISION <= b.time < endConsensus(k) + PRECISION + MSGDELAY`.


> [PBTS-CONSENSUS-TIME-VALID.0] is based on an analysis where the proposer is faulty (and does does not count towards `beginConsensus(k)` and `endConsensus(k)`), and we estimate the times at which correct validators receive and `accept` the `propose` message. If the proposer is correct we obtain

#### **[PBTS-CONSENSUS-LIVE-VALID-CORR-PROP.0]**

If the proposer of round 1 is correct, and

- [TMBC-FM-2THIRDS.0] holds for a block of height `k - 1`, and
- [PBTS-MSG-FAIR.0], and
- [PBTS-CLOCK-PRECISION.0], and
- [PBTS-CLOCK-GROW.0] (**TODO:** is that enough?)

then eventually (within bounded time) every correct validator decides in round 1.

#### **[PBTS-CONSENSUS-SAFE-VALID-CORR-PROP.0]**

If the proposer of round 1 is correct, and

- [TMBC-FM-2THIRDS.0] holds for a block of height `k - 1`, and
- [PBTS-MSG-FAIR.0], and
- [PBTS-CLOCK-PRECISION.0], and
- [PBTS-CLOCK-GROW.0] (**TODO:** is that enough?)

then `beginConsensus_k <= b.time <= last-beginConsensus_k`.


> For the above two properties we will assume that a correct proposer `v` sends its `PROPOSAL` at its local time `beginConsensus(v,k)`.

### LIVENESS

If

- [TMBC-FM-2THIRDS.0] holds for a block of height `k - 1`, and
- [PBTS-MSG-FAIR.0],
- [PBTS-CLOCK.0], and
- [PBTS-CLOCK-GROW.0] (**TODO:** is that enough?)

then eventually there is a valid commit `c` for height `k`.


### REAL-TIME SAFETY

> We want to give a property that can be exploited from the outside, that is, given a block with some time stored in it, what is the estimate at which real-time the block was generated. To do so, we need to link clock-time to real-time; which is not the case with [PBTS-CLOCK.0]. For this, we introduce the following assumption on the clocks:

#### **[PBTS-CLOCKSYNC-EXTERNAL.0]**

There is a system parameter `ACCURACY`, such that for all real-times `t` and all correct validators `V`,

- `| C_V(t) - t | < ACCURACY`.

> `ACCURACY` is not necessarily visible at the code level. The properties below just show that the smaller
its value, the closer the block time will be to real-time

#### **[PBTS-CONSENSUS-PTIME.0]**

LET `m` be a propose message. We consider the following two real-times `proposalTime(m)` and `propRecvTime(m)`:

- if the proposer is correct and sends `m` at time `t`, we write `proposalTime(m)` for real-time `t`.
- if first correct validator receives `m` at time `t`, we write `propRecvTime(m)` for real-time `t`.


#### **[PBTS-CONSENSUS-REALTIME-VALID.0]**

Let `b` be a block with a valid commit that contains at least one `precommit` message by a correct validator (and `proposalTime` is the time for the height/round `propose` message `m` that triggered the `precommit`). Then:

`propRecvTime(m) - ACCURACY - PRECISION < b.time < propRecvTime(m) + ACCURACY + PRECISION + MSGDELAY`


#### **[PBTS-CONSENSUS-REALTIME-VALID-CORR.0]**

Let `b` be a block with a valid commit that contains at least one `precommit` message by a correct validator (and `proposalTime` is the time for the height/round `propose` message `m` that triggered the `precommit`). Then, if the proposer is correct:

`proposalTime(m) - ACCURACY < b.time < proposalTime(m) + ACCURACY`

> by the algorithm at time `proposalTime(m)` the proposer fixes `m.time <- now_p(proposalTime(m))`

> "triggered the `PRECOMMIT`" implies that the data in `m` and `b` are "matching", that is, `m` proposed the values that are actually stored in `b`.

Back to [main document][main].

[main]: ./pbts_001_draft.md

[arXiv]: https://arxiv.org/abs/1807.04938

[tlatender]: https://github.com/tendermint/spec/blob/master/rust-spec/tendermint-accountability/README.md

[bfttime]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/spec/consensus/bft-time.md

[lcspec]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/rust-spec/lightclient/README.md

[algorithm]: ./pbts-algorithm_001_draft.md

[sysmodel]: ./pbts-sysmodel_001_draft.md
