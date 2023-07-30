# ADR 18: 可扩展的投票期限

## 更新日志

* 2020年1月1日：第一个版本开始

## 背景

目前，所有治理提案的投票期限都是相同的。然而，这并不是最优的，因为不同的治理提案并不需要相同的时间期限。对于非争议性的提案，可以通过更短的期限更高效地处理，而对于更有争议或更复杂的提案，可能需要更长的时间进行扩展讨论/考虑。

## 决策

我们希望设计一种机制，根据选民的需求使治理提案的投票期限可变。我们希望它基于治理参与者的观点，而不仅仅是治理提案的提出者（因此，仅允许提案者选择投票期限的长度是不够的）。

然而，我们希望避免创建一个完整的第二个投票过程来确定投票期限的长度，因为这只是将问题推给了确定第一个投票期限的长度。

因此，我们提出以下机制：

### 参数

* 当前的治理参数 `VotingPeriod` 将被一个名为 `MinVotingPeriod` 的参数替代。这是所有治理提案投票期限的默认期限。
* 新增一个名为 `MaxVotingPeriodExtension` 的治理参数。

### 机制

新增了一种名为 `MsgExtendVotingPeriod` 的 `Msg` 类型，可以由任何有抵押账户在提案的投票期间发送。它允许发送者通过 `MaxVotingPeriodExtension * 发送者的投票权重` 单方面延长投票期限的长度。每个地址在每个提案中只能调用一次 `MsgExtendVotingPeriod`。

例如，如果 `MaxVotingPeriodExtension` 设置为100天，那么任何拥有1%投票权重的人都可以延长投票期限1天。如果有33%的投票权重发送了该消息，则投票期限将延长33天。因此，如果每个人都选择延长投票期限，绝对最长的投票期限将是 `MinVotingPeriod + MaxVotingPeriodExtension`。

这个系统充当了一种分布式协调的角色，其中个别的质押者选择是否延长投票期限，从而让系统评估提案的争议性和复杂性。很不可能有很多质押者同时选择延长投票期限，因此质押者可以查看其他质押者已经延长了多长时间，以决定是否进一步延长。

### 处理解质押/重新委托

有一件事需要解决，那就是在投票期间如何处理重新委托/解质押的情况。如果一个质押者占总质押的5%并调用 `MsgExtendVotingPeriod`，然后解质押，那么投票期限是否会再次减少5天？这样做不好，因为它可能给人们一种错误的时间感。因此，我们希望设计投票期限只能延长，不能缩短。为了做到这一点，当前的延长量基于任何时候投票延长的最高百分比。通过以下示例来解释这个问题：

1. 假设有两个质押者，分别占总质押的4%和3%，他们都投票延长。投票期限将延长7天。
2. 现在，占总质押的3%的质押者在投票期限结束前解质押。投票期限的延长仍然是7天。
3. 现在，假设另一个占总质押的2%的质押者决定延长投票期限。现在有6%的活跃质押权力选择延长。投票期限仍然是7天。
4. 如果现在有第四个占总质押的10%的质押者选择延长，那么总共有16%的活跃质押权力希望延长。投票期限将延长到16天。

### 委托者

与实际投票期间的投票一样，委托者自动继承其验证者的延长期限。如果他们的验证者选择延长，他们的质押权力将用于验证者的延长期限。然而，委托者无法覆盖其验证者并"取消延长"，因为这将违反前一节中描述的"投票权力长度只能逐步提高"的原则。然而，如果他们的验证者没有延长投票期限，委托者可以选择使用自己的个人投票权力来延长。

## 状态

提议中

## 影响

### 积极影响

* 更复杂/有争议的治理提案将有更多时间进行适当的消化和审议

### 负面影响

* 治理流程变得更加复杂，需要更多的理解才能有效地进行交互
* 无法预测治理提案何时结束。不能假设治理提案的结束顺序。

### 中性影响

* 最小投票期限可以缩短

## 参考资料

* [Cosmos论坛帖子，最初提出这个想法](https://forum.cosmos.network/t/proposal-draft-reduce-governance-voting-period-to-7-days/3032/9)


# ADR 18: Extendable Voting Periods

## Changelog

* 1 January 2020: Start of first version

## Context

Currently the voting period for all governance proposals is the same.  However, this is suboptimal as all governance proposals do not require the same time period.  For more non-contentious proposals, they can be dealt with more efficently with a faster period, while more contentious or complex proposals may need a longer period for extended discussion/consideration.

## Decision

We would like to design a mechanism for making the voting period of a governance proposal variable based on the demand of voters.  We would like it to be based on the view of the governance participants, rather than just the proposer of a governance proposal (thus, allowing the proposer to select the voting period length is not sufficient).

However, we would like to avoid the creation of an entire second voting process to determine the length of the voting period, as it just pushed the problem to determining the length of that first voting period.

Thus, we propose the following mechanism:

### Params

* The current gov param `VotingPeriod` is to be replaced by a `MinVotingPeriod` param.  This is the default voting period that all governance proposal voting periods start with.
* There is a new gov param called `MaxVotingPeriodExtension`.

### Mechanism

There is a new `Msg` type called `MsgExtendVotingPeriod`, which can be sent by any staked account during a proposal's voting period.  It allows the sender to unilaterally extend the length of the voting period by `MaxVotingPeriodExtension * sender's share of voting power`.  Every address can only call `MsgExtendVotingPeriod` once per proposal.

So for example, if the `MaxVotingPeriodExtension` is set to 100 Days, then anyone with 1% of voting power can extend the voting power by 1 day.  If 33% of voting power has sent the message, the voting period will be extended by 33 days.  Thus, if absolutely everyone chooses to extend the voting period, the absolute maximum voting period will be `MinVotingPeriod + MaxVotingPeriodExtension`.

This system acts as a sort of distributed coordination, where individual stakers choosing to extend or not, allows the system the guage the conentiousness/complexity of the proposal.  It is extremely unlikely that many stakers will choose to extend at the exact same time, it allows stakers to view how long others have already extended thus far, to decide whether or not to extend further.

### Dealing with Unbonding/Redelegation

There is one thing that needs to be addressed.  How to deal with redelegation/unbonding during the voting period.  If a staker of 5% calls `MsgExtendVotingPeriod` and then unbonds, does the voting period then decrease by 5 days again?  This is not good as it can give people a false sense of how long they have to make their decision.  For this reason, we want to design it such that the voting period length can only be extended, not shortened.  To do this, the current extension amount is based on the highest percent that voted extension at any time.  This is best explained by example:

1. Let's say 2 stakers of voting power 4% and 3% respectively vote to extend.  The voting period will be extended by 7 days.
2. Now the staker of 3% decides to unbond before the end of the voting period.  The voting period extension remains 7 days.
3. Now, let's say another staker of 2% voting power decides to extend voting period.  There is now 6% of active voting power choosing the extend.  The voting power remains 7 days.
4. If a fourth staker of 10% chooses to extend now, there is a total of 16% of active voting power wishing to extend.  The voting period will be extended to 16 days.

### Delegators

Just like votes in the actual voting period, delegators automatically inherit the extension of their validators.  If their validator chooses to extend, their voting power will be used in the validator's extension.  However, the delegator is unable to override their validator and "unextend" as that would contradict the "voting power length can only be ratcheted up" principle described in the previous section.  However, a delegator may choose the extend using their personal voting power, if their validator has not done so.

## Status

Proposed

## Consequences

### Positive

* More complex/contentious governance proposals will have more time to properly digest and deliberate

### Negative

* Governance process becomes more complex and requires more understanding to interact with effectively
* Can no longer predict when a governance proposal will end. Can't assume order in which governance proposals will end.

### Neutral

* The minimum voting period can be made shorter

## References

* [Cosmos Forum post where idea first originated](https://forum.cosmos.network/t/proposal-draft-reduce-governance-voting-period-to-7-days/3032/9)
