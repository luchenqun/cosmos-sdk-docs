# ADR 14: 比例惩罚

## 更新日志

* 2019-10-15: 初始草案
* 2020-05-25: 移除相关根惩罚
* 2020-07-01: 更新为使用S曲线函数代替线性函数

## 背景

在基于权益证明的链中，共识权力集中在少数验证人手中可能对网络造成伤害，增加了审查、活性失败、分叉攻击等风险。然而，尽管这种集中化对网络造成了负外部性，但对于已经委托给大型验证人的委托人来说，并没有直接感受到这种负外部性的成本。我们希望找到一种方法，将集中化的负外部性成本转嫁给那些大型验证人及其委托人。

## 决策

### 设计

为了解决这个问题，我们将实施一种称为比例惩罚的程序。我们希望验证人越大，他们应该受到的惩罚越多。首次尝试是使验证人的惩罚百分比与其共识投票权重成比例。

```text
slash_amount = k * power // power是出错的验证人的投票权重，k是某个链上的常数
```

然而，这将鼓励拥有大量权益的验证人将其投票权重分散到多个账户中（Sybil攻击），这样如果他们出错，他们都会以较低的百分比受到惩罚。解决这个问题的方法是不仅考虑到验证人自己的投票百分比，还要考虑到在指定时间范围内被惩罚的所有其他验证人的投票百分比。

```text
slash_amount = k * (power_1 + power_2 + ... + power_n) // 这里power_i是第i个在指定时间范围内出错的验证人的投票权重，k是某个链上的常数
```

现在，如果有人将10%的验证人分成两个各自占5%的验证人，并且它们都出错，那么它们都在同一时间范围内出错，它们都会受到总计10%的惩罚。

然而，在实践中，我们可能不希望故障的权益数量与惩罚的权益百分比之间存在线性关系。特别是，仅有5%的权益双重签名实际上对安全性几乎没有威胁，而30%的权益出错明显需要较大的惩罚因子，因为它非常接近威胁Tendermint安全性的临界点。线性关系将需要这两者之间有6倍的差距，而对网络构成的风险差异要大得多。我们建议使用S曲线（正式称为[逻辑函数](https://en.wikipedia.org/wiki/Logistic_function)）来解决这个问题。S曲线很好地捕捉到了所需的标准。它们允许在小值时惩罚因子最小化，然后在某个阈值点附近迅速增长，当威胁变得显著时。

#### 参数化

这需要对逻辑函数进行参数化。如何参数化已经非常清楚。它有四个参数：

1) 最小惩罚因子
2) 最大惩罚因子
3) S 曲线的拐点（实际上是你想要将 S 曲线放在哪里的位置）
4) S 曲线的增长速率（S 的延伸程度）

#### 非 Sybil 验证者之间的相关性

可以注意到，这个模型没有区分同一运营商运行的多个验证者和由不同运营商运行的验证者之间的差异。实际上，这可以看作是一个额外的好处。它鼓励验证者将他们的设置与其他验证者区分开来，以避免与他们产生相关的故障，否则他们将面临更高的惩罚。例如，运营商应避免使用相同的热门云托管平台或使用相同的权益作为服务提供商。这将导致一个更具弹性和去中心化的网络。

#### 恶意行为

恶意行为是有意让自己被惩罚以使他人的惩罚更严重的行为，在这里可能是一个问题。然而，使用这里描述的协议，攻击者也会受到与受害者同样的痛苦，因此对于恶意行为者来说并没有太多好处。

### 实施

在惩罚模块中，我们将添加两个队列来跟踪所有最近的惩罚事件。对于双签故障，我们将定义 "最近的惩罚" 为在 "解绑期" 内发生的惩罚。对于活跃性故障，我们将定义 "最近的惩罚" 为在 "监禁期" 内发生的惩罚。

```go
type SlashEvent struct {
    Address                     sdk.ValAddress
    ValidatorVotingPercent      sdk.Dec
    SlashedSoFar                sdk.Dec
}
```

这些惩罚事件将在它们各自的 "最近惩罚期" 过期后从队列中删除。

每当发生新的惩罚时，将创建一个 `SlashEvent` 结构体，其中包含故障验证者的投票百分比和 `SlashedSoFar` 为 0。由于最近的惩罚事件在解绑期和解监禁期过期之前被删除，因此同一验证者不可能在同一队列中同时有多个 SlashEvents。

然后，我们将迭代队列中的所有SlashEvents，将它们的`ValidatorVotingPercent`相加，使用上面介绍的"平方和根之和"公式来计算要对队列中的所有验证器进行削减的新百分比。

一旦我们有了`NewSlashPercent`，我们再次迭代队列中的所有`SlashEvent`，如果对于该`SlashEvent`，`NewSlashPercent > SlashedSoFar`，我们调用`staking.Slash(slashEvent.Address, slashEvent.Power, Math.Min(Math.Max(minSlashPercent, NewSlashPercent - SlashedSoFar), maxSlashPercent)`（我们传入削减之前验证器的权重，以便我们削减正确数量的代币）。然后，我们将`SlashEvent.SlashedSoFar`的值设置为`NewSlashPercent`。

## 状态

提议中

## 影响

### 积极影响

* 通过减少委托给大型验证器的激励，增加了去中心化
* 激励验证器的去相关性
* 惩罚攻击比意外故障更严厉
* 削减率参数化更加灵活

### 负面影响

* 比当前实现更加计算密集。需要在链上存储更多关于"最近削减事件"的数据。


# ADR 14: Proportional Slashing

## Changelog

* 2019-10-15: Initial draft
* 2020-05-25: Removed correlation root slashing
* 2020-07-01: Updated to include S-curve function instead of linear

## Context

In Proof of Stake-based chains, centralization of consensus power amongst a small set of validators can cause harm to the network due to increased risk of censorship, liveness failure, fork attacks, etc.  However, while this centralization causes a negative externality to the network, it is not directly felt by the delegators contributing towards delegating towards already large validators.  We would like a way to pass on the negative externality cost of centralization onto those large validators and their delegators.

## Decision

### Design

To solve this problem, we will implement a procedure called Proportional Slashing.  The desire is that the larger a validator is, the more they should be slashed.  The first naive attempt is to make a validator's slash percent proportional to their share of consensus voting power.

```text
slash_amount = k * power // power is the faulting validator's voting power and k is some on-chain constant
```

However, this will incentivize validators with large amounts of stake to split up their voting power amongst accounts (sybil attack), so that if they fault, they all get slashed at a lower percent.  The solution to this is to take into account not just a validator's own voting percentage, but also the voting percentage of all the other validators who get slashed in a specified time frame.

```text
slash_amount = k * (power_1 + power_2 + ... + power_n) // where power_i is the voting power of the ith validator faulting in the specified time frame and k is some on-chain constant
```

Now, if someone splits a validator of 10% into two validators of 5% each which both fault, then they both fault in the same time frame, they both will get slashed at the sum 10% amount.

However in practice, we likely don't want a linear relation between amount of stake at fault, and the percentage of stake to slash. In particular, solely 5% of stake double signing effectively did nothing to majorly threaten security, whereas 30% of stake being at fault clearly merits a large slashing factor, due to being very close to the point at which Tendermint security is threatened. A linear relation would require a factor of 6 gap between these two, whereas the difference in risk posed to the network is much larger. We propose using S-curves (formally [logistic functions](https://en.wikipedia.org/wiki/Logistic_function) to solve this). S-Curves capture the desired criterion quite well. They allow the slashing factor to be minimal for small values, and then grow very rapidly near some threshold point where the risk posed becomes notable.

#### Parameterization

This requires parameterizing a logistic function. It is very well understood how to parameterize this. It has four parameters:

1) A minimum slashing factor
2) A maximum slashing factor
3) The inflection point of the S-curve (essentially where do you want to center the S)
4) The rate of growth of the S-curve (How elongated is the S)

#### Correlation across non-sybil validators

One will note, that this model doesn't differentiate between multiple validators run by the same operators vs validators run by different operators.  This can be seen as an additional benefit in fact.  It incentivizes validators to differentiate their setups from other validators, to avoid having correlated faults with them or else they risk a higher slash.  So for example, operators should avoid using the same popular cloud hosting platforms or using the same Staking as a Service providers.  This will lead to a more resilient and decentralized network.

#### Griefing

Griefing, the act of intentionally getting oneself slashed in order to make another's slash worse, could be a concern here.  However, using the protocol described here, the attacker also gets equally impacted by the grief as the victim, so it would not provide much benefit to the griefer.

### Implementation

In the slashing module, we will add two queues that will track all of the recent slash events.  For double sign faults, we will define "recent slashes" as ones that have occurred within the last `unbonding period`.  For liveness faults, we will define "recent slashes" as ones that have occurred withing the last `jail period`.

```go
type SlashEvent struct {
    Address                     sdk.ValAddress
    ValidatorVotingPercent      sdk.Dec
    SlashedSoFar                sdk.Dec
}
```

These slash events will be pruned from the queue once they are older than their respective "recent slash period".

Whenever a new slash occurs, a `SlashEvent` struct is created with the faulting validator's voting percent and a `SlashedSoFar` of 0.  Because recent slash events are pruned before the unbonding period and unjail period expires, it should not be possible for the same validator to have multiple SlashEvents in the same Queue at the same time.

We then will iterate over all the SlashEvents in the queue, adding their `ValidatorVotingPercent` to calculate the new percent to slash all the validators in the queue at, using the "Square of Sum of Roots" formula introduced above.

Once we have the `NewSlashPercent`, we then iterate over all the `SlashEvent`s in the queue once again, and if `NewSlashPercent > SlashedSoFar` for that SlashEvent, we call the `staking.Slash(slashEvent.Address, slashEvent.Power, Math.Min(Math.Max(minSlashPercent, NewSlashPercent - SlashedSoFar), maxSlashPercent)` (we pass in the power of the validator before any slashes occurred, so that we slash the right amount of tokens).  We then set `SlashEvent.SlashedSoFar` amount to `NewSlashPercent`.

## Status

Proposed

## Consequences

### Positive

* Increases decentralization by disincentivizing delegating to large validators
* Incentivizes Decorrelation of Validators
* More severely punishes attacks than accidental faults
* More flexibility in slashing rates parameterization

### Negative

* More computationally expensive than current implementation.  Will require more data about "recent slashing events" to be stored on chain.
