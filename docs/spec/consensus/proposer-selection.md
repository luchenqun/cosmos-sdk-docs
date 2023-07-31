---
order: 3
---

# 提案者选择过程

本文档详细说明了 Tendermint 中用于选择轮次提案者的提案者选择过程。由于 Tendermint 是一种“基于领导者的协议”，提案者的选择对其正确运行至关重要。

在给定的区块高度上，提案者选择算法在每个轮次中都使用相同的验证者集合。在不同的高度之间，应用程序可以通过 ABCIResponses' EndBlock 的方式指定更新的验证者集合。

## 提案者选择的要求

本节介绍了 Rx 为必需要求，Ox 为可选要求的要求。提案者选择过程必须满足以下要求：

### R1: 确定性

给定验证者集合 `V`，以及两个诚实的验证者 `p` 和 `q`，对于每个高度 `h` 和每个轮次 `r`，必须满足以下条件：

  `proposer_p(h,r) = proposer_q(h,r)`

其中 `proposer_p(h,r)` 是在进程 `p` 中由提案者选择过程返回的提案者，在高度 `h` 和轮次 `r`。

### R2: 公平性

给定具有总投票权 P 的验证者集合和选举序列 S。在 S 的任何长度为 C*P 的子序列中，验证者 v 必须被选为提案者 P/VP(v) 次，即具有以下频率：

 f(v) ~ VP(v) / P

其中 C 是验证者集合更改的容忍因子，具有以下值：

- 如果没有验证者集合更改，则 C == 1
- 如果有验证者更改，则 C ~ k

*[这需要更多的工作]*

## 基本算法

在其核心，提案者选择过程使用加权轮询算法。

一个能够很好地直观理解选择算法如何工作并且公平的模型是优先级队列。验证者根据其投票权在此队列中向前移动（投票权越高，验证者向队列头部移动得越快）。当算法运行时，发生以下情况：

- 所有验证者根据其投票权“向前”移动：对于每个验证者，增加其优先级以等于其投票权
- 队列中的第一个成为提案者：选择优先级最高的验证者
- 将提案者移回队列：将提案者的优先级减去总投票权

符号说明：

- vset - 验证人集合
- n - 验证人数量
- VP(i) - 验证人 i 的投票权重
- A(i) - 验证人 i 的累积优先级
- P - 集合的总投票权重
- avg - 所有验证人优先级的平均值
- prop - 提议者

选择算法的简单视图：

```md
    def ProposerSelection (vset):

        // compute priorities and elect proposer
        for each validator i in vset:
            A(i) += VP(i)
        prop = max(A)
        A(prop) -= P
```

## 稳定集合

考虑以下验证人集合：

验证人 | p1 | p2
-------|----|---
VP     | 1  | 3

假设没有验证人发生变化，下表显示了在几次运行中提议者优先级的计算。显示了四次选择过程的运行，从第5次开始计算相同的值。
每一行显示了优先级队列和其中的过程位置。提议者是最靠近队列头部的、最右边的验证人。随着优先级的更新，验证人在队列中向右移动。提议者在选举后优先级降低后向左移动。

| 优先级运行 | -2 | -1 | 0     | 1  | 2     | 3  | 4  | 5  | 算法步骤         |
|------------|----|----|-------|----|-------|----|----|----|------------------|
|            |    |    | p1,p2 |    |       |    |    |    | 初始化为 0      |
| 第 1 次    |    |    |       | p1 |       | p2 |    |    | A(i)+=VP(i)      |
|            |    | p2 |       | p1 |       |    |    |    | A(p2)-= P        |
| 第 2 次    |    |    |       |    | p1,p2 |    |    |    | A(i)+=VP(i)      |
|            | p1 |    |       |    | p2    |    |    |    | A(p1)-= P        |
| 第 3 次    |    | p1 |       |    |       |    |    | p2 | A(i)+=VP(i)      |
|            |    | p1 |       | p2 |       |    |    |    | A(p2)-= P        |
| 第 4 次    |    |    | p1    |    |       |    | p2 |    | A(i)+=VP(i)      |
|            |    |    | p1,p2 |    |       |    |    |    | A(p2)-= P        |

可以证明：

- 在每次运行 k+1 结束时，优先级的总和与运行 k 结束时的总和相同。如果一个新集合的优先级初始化为 0，则在没有更改的情况下，每次运行时优先级的总和将为 0。
- 优先级之间的最大距离为 (n-1) *P。*[正式证明未完成]*

## 验证人集合变更

在提案人选择运行之间，验证人集合可能会发生变化。某些变化会对提案人选举产生影响。

### 投票权力变更

再次考虑之前的例子，假设将 p1 的投票权力更改为 4：

验证人 | p1 | p2
----------|----|---
VP        | 4  | 3

我们还假设在此变更之前，提案人的优先级如第一行所示（上次运行）。可以看到，选择可以再次运行，与之前一样，没有变化。

| 优先级运行 | -2 | -1 | 0 | 1  | 2  | 注释           |
|----------------|----|----|---|----|----|-------------------|
| 上次运行       |    | p2 |   | p1 |    | __更新 VP(p1)__ |
| 下次运行       |    |    |   |    | p2 | A(i)+=VP(i)       |
|                | p1 |    |   |    | p2 | A(p1)-= P         |

然而，当一个验证人的权力从高值变为低值时，其他一些验证人会在队列中长时间落后。这种情况在提案人优先级范围部分再次考虑。

与之前一样：

- 在每次运行 k+1 结束时，优先级之和与运行 k 时相同。
- 优先级之间的最大距离为 (n-1) * P。

### 验证人移除

考虑一个新的例子，集合如下：

验证人 | p1 | p2 | p3
----------|----|----|---
VP        | 1  | 2  | 3

假设在上次运行后，提案人的优先级如第一行所示，它们的和为 0。在移除 p2 后，在下一次提案人选择运行结束时（倒数第二行），优先级之和为 -2（减去被移除的进程的优先级）。

该过程可以继续进行而不需要修改。然而，当验证人集合发生足够多的修改后，优先级值会向允许的最大或最小值靠拢，导致溢出检测的截断。
因此，选择过程添加了另一个__新步骤__，将当前优先级值居中，使得优先级之和保持接近 0。

| 优先级运行 | -3 | -2 | -1 | 0 | 1  | 2  | 4 | 注释               |
|----------------|----|----|----|---|----|----|---|-----------------------|
| 上次运行       | p3 |    |    |   | p1 | p2 |   | __移除 p2__         |
| 下次运行        |    |    |    |   |    |    |   |                       |
| __新步骤__   |    | p3 |    |   |    | p1 |   | A(i) -= avg, avg = -1 |
|                |    |    |    |   | p3 | p1 |   | A(i)+=VP(i)           |
|                |    |    | p1 |   | p3 |    |   | A(p1)-= P             |

修改后的选择算法如下：

```md
    def ProposerSelection (vset):

        // center priorities around zero
        avg = sum(A(i) for i in vset)/len(vset)
        for each validator i in vset:
            A(i) -= avg

        // compute priorities and elect proposer
        for each validator i in vset:
            A(i) += VP(i)
        prop = max(A)
        A(prop) -= P
```

观察结果：

- 现在优先级的总和接近于0。由于整数除法，总和是一个介于(-n, n)的整数，其中n是验证者的数量。

### 新增验证者

当添加一个新的验证者时，与删除验证者时描述的问题相同，新集合中的优先级总和不为零。这个问题通过上述引入的居中步骤来解决。

还需要解决的另一个问题是：刚刚当选的验证者V被移动到队列的末尾。如果验证者集合很大和/或其他验证者的权重显著较高，V将需要等待很多轮才能当选。如果V将自己从集合中移除并重新添加，它将在队列中有一个显著的（尽管不公平的）"跳跃"。

为了防止这种情况发生，当添加一个新的验证者时，它的初始优先级被设置为：

```md
    A(V) = -1.125 *  P
```

其中P是包括V在内的验证者集合的总投票权重。

当前实现使用惩罚因子1.125，因为它提供了一个小的惩罚，并且计算效率高。更多细节请参见[这里](https://github.com/tendermint/tendermint/pull/2785#discussion_r235038971)。

如果我们考虑刚刚添加了p3的验证者集合：

验证者 | p1 | p2 | p3
-------|----|----|---
VP     | 1  | 3  | 8

那么p3将以提案者优先级开始：

```md
    A(p3) = -1.125 * (1 + 3 + 8) ~ -13
```

请注意，由于当前计算使用整数除法，当投票权重总和小于8时会有惩罚损失。

在下一轮中，p3仍将在队列中处于前列，被选为提案者并移回队列。

| 优先级   轮次 | -13 | -9 | -5 | -2 | -1 | 0 | 1 | 2  | 5  | 6  | 7  | 算法步骤              |
|----------------|-----|----|----|----|----|---|---|----|----|----|----|-----------------------|
| 上一轮         |     |    |    | p2 |    |   |   | p1 |    |    |    | __添加p3__            |
|                | p3  |    |    | p2 |    |   |   | p1 |    |    |    | A(p3) = -4            |
| 下一轮         |     | p3 |    |    |    |   |   | p2 |    | p1 |    | A(i) -= avg, avg = -4 |
|                |     |    |    |    | p3 |   |   |    | p2 |    | p1 | A(i)+=VP(i)           |
|                |     |    | p1 |    | p3 |   |   |    | p2 |    |    | A(p1)-=P              |

## 提案者优先级范围

引入居中机制后，会出现一些有趣的情况。在包含高功率验证者的集合中，提前绑定的低功率验证者会从后续添加到集合中的验证者中受益。这是因为这些提前的验证者在居中过程中会执行更多的右移操作，而这些操作会增加它们的优先级。

举个例子，考虑一个集合，在添加了优先级为 -1.125 * 80k = -90k 的 p2 后，p1 先被添加。在选择过程运行一次后：

验证者 | p1   | p2   | 注释
-------|------|------|------------------
VP     | 80k  | 10   |
A      | 0    | -90k | __添加 p2__
A      | -45k | 45k  | __运行选择__

然后执行以下步骤：

1. 添加一个新的验证者 p3：

    验证者 | p1  | p2 | p3
    -------|-----|----|---
    VP     | 80k | 10 | 10

2. 运行一次选择。符号 '..p'/'p..' 表示与列优先级相比的非常小的偏差。

    | 优先级运行 | -90k.. | -60k | -45k | -15k | 0 | 45k | 75k | 155k | 注释          |
    |------------|--------|------|------|------|---|-----|-----|------|--------------|
    | 上次运行   | p3     |      | p2   |      |   | p1  |     |      | __添加 p3__ |
    | 下次运行
    | *右移*     |       |  p3  |        |  p2 |   |     |  p1  |        | A(i) -= avg，avg=-30k
    |            |       |  ..p3|        | ..p2|   |     |      |  p1    | A(i)+=VP(i)
    |            |       |  ..p3|        | ..p2|   |     | p1.. |        | A(p1)-=P，P=80k+20

3. 移除 p1 并运行一次选择：

    验证者 | p3     | p2    | 注释
    -------|--------|-------|------------------
    VP     | 10     | 10    |
    A      | -60k   | -15k  |
    A      | -22.5k | 22.5k | __运行选择__

此时，虽然总投票权为 20，但优先级之间的距离为 45k。p3 需要运行 4500 次才能赶上 p2。

为了防止这类情况发生，选择算法会对优先级进行缩放，使最大值和最小值之间的差小于总投票权的两倍。

修改后的选择算法是：

```md
    def ProposerSelection (vset):

        // scale the priority values
        diff = max(A)-min(A)
        threshold = 2 * P
     if  diff > threshold:
            scale = diff/threshold
            for each validator i in vset:
          A(i) = A(i)/scale

        // center priorities around zero
        avg = sum(A(i) for i in vset)/len(vset)
        for each validator i in vset:
            A(i) -= avg

        // compute priorities and elect proposer
        for each validator i in vset:
            A(i) += VP(i)
        prop = max(A)
        A(prop) -= P
```

观察结果：

- 通过这种修改，优先级之间的最大距离变为 2 * P。

还要注意，即使在稳定状态下，优先级范围可能会超过 2 * P。这里引入的缩放有助于保持范围有界。

## 注意事项

### 验证者权重溢出条件

验证者的投票权重是一个存储为 int64 的正数。当添加一个验证者时，`1.125 * P` 的计算不能溢出。因此，处理验证者更新（添加和更新）的代码会检查溢出条件，确保总投票权力不会超过最大的 int64 `MAX`，并且 `1.125 * MAX` 仍在 int64 的范围内。当检测到溢出条件时，会返回致命错误。

### 提案者优先级溢出/下溢处理

提案者的优先级存储为 int64。选择算法对这些值进行加法和减法运算，对于溢出和下溢的情况，它将这些值限制在以下范围内：

```go
    MaxInt64  =  1 << 63 - 1
    MinInt64  = -1 << 63
```

## 需求满足声明

__[R1]__

提案者算法是确定性的，在相同的交易和验证者集合修改的情况下，能够在多次执行中产生一致的结果。
[WIP - 需要更多细节]

__[R2]__

给定一组具有总投票权力 P 的进程，在长度为 P 的一系列选举中，任何进程被选为提案者的次数等于其投票权力。然后，P 个提案者的序列重复。如果我们考虑以下验证者集合：

验证者 | p1 | p2
-------|----|---
VP     | 1  | 3

在没有对验证者集合进行其他更改的情况下，提案者选择的当前实现会生成以下序列：
`p2, p1, p2, p2, p2, p1, p2, p2,...` 或 [`p2, p1, p2, p2`]*
以 [`p2, p1, p2, p2`] 子序列的任何循环排列开头的序列也会提供相同程度的公平性。实际上，这些循环排列在大小等于子序列长度的滑动窗口（在生成的序列上）中显示出来。

根据投票权重为每个验证者分配优先级，并在每次运行时更新它们，以确保提案者选择的公平性。此外，每当一个验证者被选为提案者时，其优先级会随着总投票权重的减少而降低。

直观地说，一个进程v在队列中最多可以跳过(max(A) - min(A))/VP(v)次，直到它到达队列头部并被选中。其频率可以表示为：

```md
    f(v) ~ VP(v)/(max(A)-min(A)) = 1/k * VP(v)/P
```

对于当前的实现，这意味着在k * P次运行中，v至少应该被选为提案者VP(v)次，其中缩放因子k=2。


---
order: 3
---

# Proposer Selection Procedure

This document specifies the Proposer Selection Procedure that is used in Tendermint to choose a round proposer.
As Tendermint is “leader-based protocol”, the proposer selection is critical for its correct functioning.

At a given block height, the proposer selection algorithm runs with the same validator set at each round .
Between heights, an updated validator set may be specified by the application as part of the ABCIResponses' EndBlock.

## Requirements for Proposer Selection

This sections covers the requirements with Rx being mandatory and Ox optional requirements.
The following requirements must be met by the Proposer Selection procedure:

### R1: Determinism

Given a validator set `V`, and two honest validators `p` and `q`, for each height `h` and each round `r` the following must hold:

  `proposer_p(h,r) = proposer_q(h,r)`

where `proposer_p(h,r)` is the proposer returned by the Proposer Selection Procedure at process `p`, at height `h` and round `r`.

### R2: Fairness

Given a validator set with total voting power P and a sequence S of elections. In any sub-sequence of S with length C*P, a validator v must be elected as proposer P/VP(v) times, i.e. with frequency:

 f(v) ~ VP(v) / P

where C is a tolerance factor for validator set changes with following values:

- C == 1 if there are no validator set changes
- C ~ k when there are validator changes

*[this needs more work]*

## Basic Algorithm

At its core, the proposer selection procedure uses a weighted round-robin algorithm.

A model that gives a good intuition on how/ why the selection algorithm works and it is fair is that of a priority queue. The validators move ahead in this queue according to their voting power (the higher the voting power the faster a validator moves towards the head of the queue). When the algorithm runs the following happens:

- all validators move "ahead" according to their powers: for each validator, increase the priority by the voting power
- first in the queue becomes the proposer: select the validator with highest priority
- move the proposer back in the queue: decrease the proposer's priority by the total voting power

Notation:

- vset - the validator set
- n - the number of validators
- VP(i) - voting power of validator i
- A(i) - accumulated priority for validator i
- P - total voting power of set
- avg - average of all validator priorities
- prop - proposer

Simple view at the Selection Algorithm:

```md
    def ProposerSelection (vset):

        // compute priorities and elect proposer
        for each validator i in vset:
            A(i) += VP(i)
        prop = max(A)
        A(prop) -= P
```

## Stable Set

Consider the validator set:

Validator | p1 | p2
----------|----|---
VP        | 1  | 3

Assuming no validator changes, the following table shows the proposer priority computation over a few runs. Four runs of the selection procedure are shown, starting with the 5th the same values are computed.
Each row shows the priority queue and the process place in it. The proposer is the closest to the head, the rightmost validator. As priorities are updated, the validators move right in the queue. The proposer moves left as its priority is reduced after election.

| Priority   Run | -2 | -1 | 0     | 1  | 2     | 3  | 4  | 5  | Alg step         |
|----------------|----|----|-------|----|-------|----|----|----|------------------|
|                |    |    | p1,p2 |    |       |    |    |    | Initialized to 0 |
| run 1          |    |    |       | p1 |       | p2 |    |    | A(i)+=VP(i)      |
|                |    | p2 |       | p1 |       |    |    |    | A(p2)-= P        |
| run 2          |    |    |       |    | p1,p2 |    |    |    | A(i)+=VP(i)      |
|                | p1 |    |       |    | p2    |    |    |    | A(p1)-= P        |
| run 3          |    | p1 |       |    |       |    |    | p2 | A(i)+=VP(i)      |
|                |    | p1 |       | p2 |       |    |    |    | A(p2)-= P        |
| run 4          |    |    | p1    |    |       |    | p2 |    | A(i)+=VP(i)      |
|                |    |    | p1,p2 |    |       |    |    |    | A(p2)-= P        |

It can be shown that:

- At the end of each run k+1 the sum of the priorities is the same as at end of run k. If a new set's priorities are initialized to 0 then the sum of priorities will be 0 at each run while there are no changes.
- The max distance between priorites is (n-1) *P.*[formal proof not finished]*

## Validator Set Changes

Between proposer selection runs the validator set may change. Some changes have implications on the proposer election.

### Voting Power Change

Consider again the earlier example and assume that the voting power of p1 is changed to 4:

Validator | p1 | p2
----------|----|---
VP        | 4  | 3

Let's also assume that before this change the proposer priorites were as shown in first row (last run). As it can be seen, the selection could run again, without changes, as before.

| Priority   Run | -2 | -1 | 0 | 1  | 2  | Comment           |
|----------------|----|----|---|----|----|-------------------|
| last run       |    | p2 |   | p1 |    | __update VP(p1)__ |
| next run       |    |    |   |    | p2 | A(i)+=VP(i)       |
|                | p1 |    |   |    | p2 | A(p1)-= P         |

However, when a validator changes power from a high to a low value, some other validator remain far back in the queue for a long time. This scenario is considered again in the Proposer Priority Range section.

As before:

- At the end of each run k+1 the sum of the priorities is the same as at run k.
- The max distance between priorites is (n-1) * P.

### Validator Removal

Consider a new example with set:

Validator | p1 | p2 | p3
----------|----|----|---
VP        | 1  | 2  | 3

Let's assume that after the last run the proposer priorities were as shown in first row with their sum being 0. After p2 is removed, at the end of next proposer selection run (penultimate row) the sum of priorities is -2 (minus the priority of the removed process).

The procedure could continue without modifications. However, after a sufficiently large number of modifications in validator set, the priority values would migrate towards maximum or minimum allowed values causing truncations due to overflow detection.
For this reason, the selection procedure adds another __new step__ that centers the current priority values such that the priority sum remains close to 0.

| Priority   Run | -3 | -2 | -1 | 0 | 1  | 2  | 4 | Comment               |
|----------------|----|----|----|---|----|----|---|-----------------------|
| last run       | p3 |    |    |   | p1 | p2 |   | __remove p2__         |
| nextrun        |    |    |    |   |    |    |   |                       |
| __new step__   |    | p3 |    |   |    | p1 |   | A(i) -= avg, avg = -1 |
|                |    |    |    |   | p3 | p1 |   | A(i)+=VP(i)           |
|                |    |    | p1 |   | p3 |    |   | A(p1)-= P             |

The modified selection algorithm is:

```md
    def ProposerSelection (vset):

        // center priorities around zero
        avg = sum(A(i) for i in vset)/len(vset)
        for each validator i in vset:
            A(i) -= avg

        // compute priorities and elect proposer
        for each validator i in vset:
            A(i) += VP(i)
        prop = max(A)
        A(prop) -= P
```

Observations:

- The sum of priorities is now close to 0. Due to integer division the sum is an integer in (-n, n), where n is the number of validators.

### New Validator

When a new validator is added, same problem as the one described for removal appears, the sum of priorities in the new set is not zero. This is fixed with the centering step introduced above.

One other issue that needs to be addressed is the following. A validator V that has just been elected is moved to the end of the queue. If the validator set is large and/ or other validators have significantly higher power, V will have to wait many runs to be elected. If V removes and re-adds itself to the set, it would make a significant (albeit unfair) "jump" ahead in the queue.

In order to prevent this, when a new validator is added, its initial priority is set to:

```md
    A(V) = -1.125 *  P
```

where P is the total voting power of the set including V.

Curent implementation uses the penalty factor of 1.125 because it provides a small punishment that is efficient to calculate. See [here](https://github.com/tendermint/tendermint/pull/2785#discussion_r235038971) for more details.

If we consider the validator set where p3 has just been added:

Validator | p1 | p2 | p3
----------|----|----|---
VP        | 1  | 3  | 8

then p3 will start with proposer priority:

```md
    A(p3) = -1.125 * (1 + 3 + 8) ~ -13
```

Note that since current computation uses integer division there is penalty loss when sum of the voting power is less than 8.

In the next run, p3 will still be ahead in the queue, elected as proposer and moved back in the queue.

| Priority   Run | -13 | -9 | -5 | -2 | -1 | 0 | 1 | 2  | 5  | 6  | 7  | Alg step              |
|----------------|-----|----|----|----|----|---|---|----|----|----|----|-----------------------|
| last run       |     |    |    | p2 |    |   |   | p1 |    |    |    | __add p3__            |
|                | p3  |    |    | p2 |    |   |   | p1 |    |    |    | A(p3) = -4            |
| next run       |     | p3 |    |    |    |   |   | p2 |    | p1 |    | A(i) -= avg, avg = -4 |
|                |     |    |    |    | p3 |   |   |    | p2 |    | p1 | A(i)+=VP(i)           |
|                |     |    | p1 |    | p3 |   |   |    | p2 |    |    | A(p1)-=P              |

## Proposer Priority Range

With the introduction of centering, some interesting cases occur. Low power validators that bind early in a set that includes high power validator(s) benefit from subsequent additions to the set. This is because these early validators run through more right shift operations during centering, operations that increase their priority.

As an example, consider the set where p2 is added after p1, with priority -1.125 * 80k = -90k. After the selection procedure runs once:

Validator | p1   | p2   | Comment
----------|------|------|------------------
VP        | 80k  | 10   |
A         | 0    | -90k | __added p2__
A         | -45k | 45k  | __run selection__

Then execute the following steps:

1. Add a new validator p3:

    Validator | p1  | p2 | p3
    ----------|-----|----|---
    VP        | 80k | 10 | 10

2. Run selection once. The notation '..p'/'p..' means very small deviations compared to column priority.

    | Priority  Run | -90k.. | -60k | -45k | -15k | 0 | 45k | 75k | 155k | Comment      |
    |---------------|--------|------|------|------|---|-----|-----|------|--------------|
    | last run      | p3     |      | p2   |      |   | p1  |     |      | __added p3__ |
    | next run
    | *right_shift*|       |  p3  |        |  p2 |   |     |  p1  |        | A(i) -= avg,avg=-30k
    |              |       |  ..p3|        | ..p2|   |     |      |  p1    | A(i)+=VP(i)
    |              |       |  ..p3|        | ..p2|   |     | p1.. |        | A(p1)-=P, P=80k+20

3. Remove p1 and run selection once:

    Validator | p3     | p2    | Comment
    ----------|--------|-------|------------------
    VP        | 10     | 10    |
    A         | -60k   | -15k  |
    A         | -22.5k | 22.5k | __run selection__

At this point, while the total voting power is 20, the distance between priorities is 45k. It will take 4500 runs for p3 to catch up with p2.

In order to prevent these types of scenarios, the selection algorithm performs scaling of priorities such that the difference between min and max values is smaller than two times the total voting power.

The modified selection algorithm is:

```md
    def ProposerSelection (vset):

        // scale the priority values
        diff = max(A)-min(A)
        threshold = 2 * P
     if  diff > threshold:
            scale = diff/threshold
            for each validator i in vset:
          A(i) = A(i)/scale

        // center priorities around zero
        avg = sum(A(i) for i in vset)/len(vset)
        for each validator i in vset:
            A(i) -= avg

        // compute priorities and elect proposer
        for each validator i in vset:
            A(i) += VP(i)
        prop = max(A)
        A(prop) -= P
```

Observations:

- With this modification, the maximum distance between priorites becomes 2 * P.

Note also that even during steady state the priority range may increase beyond 2 * P. The scaling introduced here  helps to keep the range bounded.

## Wrinkles

### Validator Power Overflow Conditions

The validator voting power is a positive number stored as an int64. When a validator is added the `1.125 * P` computation must not overflow. As a consequence the code handling validator updates (add and update) checks for overflow conditions making sure the total voting power is never larger than the largest int64 `MAX`, with the property that `1.125 * MAX` is still in the bounds of int64. Fatal error is return when overflow condition is detected.

### Proposer Priority Overflow/ Underflow Handling

The proposer priority is stored as an int64. The selection algorithm performs additions and subtractions to these values and in the case of overflows and underflows it limits the values to:

```go
    MaxInt64  =  1 << 63 - 1
    MinInt64  = -1 << 63
```

## Requirement Fulfillment Claims

__[R1]__

The proposer algorithm is deterministic giving consistent results across executions with same transactions and validator set modifications.
[WIP - needs more detail]

__[R2]__

Given a set of processes with the total voting power P, during a sequence of elections of length P, the number of times any process is selected as proposer is equal to its voting power. The sequence of the P proposers then repeats. If we consider the validator set:

Validator | p1 | p2
----------|----|---
VP        | 1  | 3

With no other changes to the validator set, the current implementation of proposer selection generates the sequence:
`p2, p1, p2, p2, p2, p1, p2, p2,...` or [`p2, p1, p2, p2`]*
A sequence that starts with any circular permutation of the [`p2, p1, p2, p2`] sub-sequence would also provide the same degree of fairness. In fact these circular permutations show in the sliding window (over the generated sequence) of size equal to the length of the sub-sequence.

Assigning priorities to each validator based on the voting power and updating them at each run ensures the fairness of the proposer selection. In addition, every time a validator is elected as proposer its priority is decreased with the total voting power.

Intuitively, a process v jumps ahead in the queue at most (max(A) - min(A))/VP(v) times until it reaches the head and is elected. The frequency is then:

```md
    f(v) ~ VP(v)/(max(A)-min(A)) = 1/k * VP(v)/P
```

For current implementation, this means v should be proposer at least VP(v) times out of k * P runs, with scaling factor k=2.
