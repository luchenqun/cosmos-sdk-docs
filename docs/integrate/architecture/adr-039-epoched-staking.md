# ADR 039: 周期性质抵押

## 更新日志

* 2021年2月10日：初稿

## 作者

* Dev Ojha (@valardragon)
* Sunny Aggarwal (@sunnya97)

## 状态

建议中

## 摘要

本ADR更新了权益抵押模块，以便在更新共识的权益抵押之前，缓冲一定数量的区块的权益抵押更新。缓冲区的长度被称为一个时期。权益抵押模块的先前功能是抽象模块的一个特例，其中时期被设置为1个区块。

## 背景

当前的权益抵押模块在设计上决定立即将权益抵押变化应用于共识引擎。这意味着委托和解绑会立即应用于验证人集合。这个决定主要是因为它在实现上最简单，并且我们当时认为这样做会为客户提供更好的用户体验。

另一种设计选择是允许缓冲权益抵押的更新（委托、解绑、验证人加入）一定数量的区块。这种“周期性”的权益抵押共识提供了这样的保证：在一个时期内，验证人的共识权重不会发生变化，除非发生了惩罚条件。

此外，用户体验的障碍可能没有之前想象的那么大。这是因为可以立即向用户确认他们的抵押已被记录并将被执行。

此外，随着时间的推移，立即执行权益抵押事件的局限性变得更加明显，例如：

* 基于阈值的密码学。其中一个主要限制是，由于验证人集合可以如此频繁地发生变化，因此固定验证人集合的多方计算变得困难。区块链中的许多基于阈值的密码学功能，如随机性信标和阈值解密，需要进行计算密集型的DKG过程（需要比1个区块更长的时间来创建）。为了有效地使用它们，我们需要保证DKG的结果将在相当长的时间内使用。每个区块重新运行DKG是不可行的。通过对权益抵押进行周期化，可以保证我们每个时期只需要运行一次新的DKG。

* 轻客户端效率。这将减少在验证人集合中存在高度变动时的IBC开销。在Tendermint轻客户端二分算法中，您需要验证的头部数量与受信任头部和最新头部之间的验证人集合差异有关。如果差异太大，您需要在两者之间验证更多的头部。通过限制验证人集合更改的频率，我们可以减少IBC轻客户端证明的最坏情况大小，这种情况发生在验证人集合存在高度变动时。

* 确定性领导者选举的公平性。目前，我们无法在没有时期的情况下推理确定性领导者选举的公平性（tendermint/spec#217）。破坏领导者选举的公平性对验证人是有利的，因为他们可以从成为提议者获得额外的奖励。至少添加时期使我们的确定性领导者选举更容易与我们可以证明安全的东西相匹配。（尽管我们仍然没有证明我们当前的算法在存在权益变动的情况下，对于大于2个验证人是否公平）

* 质押衍生品设计。目前，奖励分配是通过使用F1费用分配进行延迟处理的。虽然可以节省计算复杂性，但延迟记账需要更具状态的质押实现。现在，每个委托条目都必须跟踪上次提款的时间。对于一些旨在为单个验证人质押的所有代币提供可替代性的质押衍生品设计来说，处理这个问题可能是一个挑战。强制向用户提取奖励可以帮助解决这个问题，但是每个区块强制向用户提取奖励是不可行的。通过引入时期，链可以更容易地修改设计，强制提取奖励（每个时期只迭代一次委托人账户），从而将委托时间从状态中删除。这对于某些质押衍生品设计可能是有用的。

## 设计考虑

### 惩罚

对于是立即应用惩罚还是在时期结束时应用惩罚有一个设计考虑。惩罚事件应仅适用于在违规发生时实际进行质押的成员，即在违规事件发生的时期内进行质押的成员。

立即应用可以被视为提供更大的共识层安全性，但可能会对上述用例产生一些成本。立即对共识层安全性进行惩罚的好处可以通过立即执行验证人监禁（从验证人集合中移除）并将实际的惩罚更改延迟到时代边界来实现。对于上述提到的用例，可以集成解决方案以避免问题，具体如下：

* 对于基于阈值的密码学，此设置将使阈值密码学使用原始时代权重，而共识层则具有更新，使其更快地从额外的安全性中受益。如果基于阈值的密码学阻碍了链的活跃性，那么我们实际上已经提高了剩余验证人在整个时代的活跃性阈值。（或者，被监禁的节点仍然可以贡献份额）这个计划在极端情况下会失败，即在单个时代内有超过1/3的验证人被监禁。对于这种极端情况，链已经有了自己的自定义事件响应计划，并且如何处理阈值密码学应该是其中的一部分。
* 对于轻客户端的效率，可以在头部中包含一个指示在时代内进行惩罚的位（类似于https://github.com/tendermint/spec/issues/199）。
* 对于确定性领导者选举的公平性，时代内的惩罚或监禁将破坏我们试图提供的保证。这样又引入了一个新的（但明显简单得多）问题，即验证人可以敌对地选择将自己从提议者集合中移除。从安全角度来看，这可能可以通过两种不同的机制来处理（或者证明仍然过于困难）。一种方法是提供一个安全性声明，承认对手能够在时代内强制使一定数量的用户退出提议者集合。第二种方法是对其进行参数化，使得时代内的惩罚成本远远超过作为提议者的好处。然而，后一种标准非常可疑，因为在具有复杂状态机的链中，成为提议者可能会产生许多有利的副作用。（即，像Fomo3D这样的DeFi游戏）
* 对于权益衍生品设计，不会引入任何问题。这不会增加权益记录的状态大小，因为可以完全查询给定验证人地址是否发生了惩罚。

### 代币锁定

当有人进行委托交易时，即使他们没有立即抵押，他们的代币也应该被移入由质押模块管理的池中，然后在一个时期结束时使用。这样可以防止他们抵押后，花费这些代币而没有意识到它们已经分配给质押，从而导致他们的质押交易失败的问题。

### 流水线化的时期

对于特定的阈值密码学，我们需要一个时期更替的流水线。这是因为当我们处于第 N 个时期时，我们希望第 N+1 个时期的权重被固定，以便验证人集合可以相应地进行 DKG。因此，如果我们当前处于第 N 个时期，第 N+1 个时期的质押权重应该已经被固定，而新的质押变化应该被应用到第 N+2 个时期。

这可以通过设置一个时期流水线长度的参数来处理。除了在硬分叉期间，这个参数不应该被改变，以减轻切换流水线长度的实现复杂性。

对于流水线长度为 1，如果我在第 N 个时期重新委托，那么我的重新委托将在第 N+1 个时期开始之前应用。
对于流水线长度为 2，如果我在第 N 个时期重新委托，那么我的重新委托将在第 N+2 个时期开始之前应用。

### 奖励

即使所有的质押更新都在时期边界应用，奖励仍然可以在被认领时立即分发。这是因为它们不会影响当前的质押权重，因为我们没有实现奖励的自动绑定。如果要实现这样的功能，必须设置奖励在时期边界自动绑定。

### 参数化的时期长度

在选择时期长度时，需要权衡排队状态/计算的积累，以及对于给定链是否适用的前面讨论的立即执行的限制。

在引入可变块时间的 ABCI 机制之前，不建议使用较长的时期长度，因为会导致计算的积累。这是因为当一个块的执行时间大于 Tendermint 的预期块时间时，轮次可能会增加。

## 决策

**步骤1**：实现所有质押和惩罚消息的缓冲。

首先，我们创建一个用于存储正在绑定但应在时期边界应用的代币的池，称为“EpochDelegationPool”。然后，我们有两个单独的队列，一个用于质押，一个用于惩罚。我们描述每个消息传递时发生的情况如下：

### 质押消息

* **MsgCreateValidator**：立即将用户的自我质押移动到“EpochDelegationPool”。在时期边界排队一个消息来处理自我质押，从“EpochDelegationPool”中获取资金。如果时期执行失败，则将资金从“EpochDelegationPool”退还给用户的账户。
* **MsgEditValidator**：验证消息，如果有效，则将消息排队以在时期结束时执行。
* **MsgDelegate**：立即将用户的资金移动到“EpochDelegationPool”。在时期边界排队一个消息来处理委托，从“EpochDelegationPool”中获取资金。如果时期执行失败，则将资金从“EpochDelegationPool”退还给用户的账户。
* **MsgBeginRedelegate**：验证消息，如果有效，则将消息排队以在时期结束时执行。
* **MsgUndelegate**：验证消息，如果有效，则将消息排队以在时期结束时执行。

### 惩罚消息

* **MsgUnjail**：验证消息，如果有效，则将消息排队以在时期结束时执行。
* **Slash Event**：每当创建一个惩罚事件时，它会被排队在惩罚模块中，在时期结束时应用。队列应该设置得这样，以便此惩罚立即生效。

### 证据消息

* **MsgSubmitEvidence**：此消息会立即执行，并立即将验证人投入监狱。然而，在惩罚中，实际的惩罚事件会被排队。

然后，我们在最后的阻塞器中添加方法，以确保在时期边界时清除队列并应用委托更新。

**步骤2**：实现查询排队的质押交易。

当查询给定地址的质押活动时，状态应该返回不仅质押的代币数量，还应该返回该地址是否有任何排队的质押事件。这将需要在查询逻辑中进行更多的工作，以跟踪排队的即将到来的质押事件。

作为初始实现，可以将其实现为对所有排队的质押事件进行线性搜索。然而，对于需要较长纪元的链，它们应该最终构建对支持查询的节点的额外支持，以便能够以恒定的时间产生结果。（这可以通过维护一个辅助哈希映射来实现，用于按地址索引即将发生的质押事件）

**步骤3**：调整燃气费用

当前的燃气费用表示立即执行交易的成本。（将点对点开销、状态访问开销和计算开销合并在一起）然而，现在一笔交易可能会在未来的区块中引起计算，即在纪元边界处。

为了处理这个问题，我们应该最初包括用于估计未来计算量的参数（以燃气为单位），并将其作为消息所需的固定费用添加进去。
对于如何在燃气定价中权衡未来计算与当前计算的方式，我们将其视为超出范围，并将其设置为目前平等权衡。

## 结果

### 积极影响

* 抽象了权益证明模块，允许保留现有功能
* 启用了基于验证人集的阈值密码学等新功能

### 负面影响

* 增加了集成更复杂的燃气定价机制的复杂性，因为现在它们必须考虑未来的执行成本。
* 当纪元 > 1 时，验证人不能立即离开网络，必须等到纪元边界。


# ADR 039: Epoched Staking

## Changelog

* 10-Feb-2021: Initial Draft

## Authors

* Dev Ojha (@valardragon)
* Sunny Aggarwal (@sunnya97)

## Status

Proposed

## Abstract

This ADR updates the proof of stake module to buffer the staking weight updates for a number of blocks before updating the consensus' staking weights. The length of the buffer is dubbed an epoch. The prior functionality of the staking module is then a special case of the abstracted module, with the epoch being set to 1 block.

## Context

The current proof of stake module takes the design decision to apply staking weight changes to the consensus engine immediately. This means that delegations and unbonds get applied immediately to the validator set. This decision was primarily done as it was implementationally simplest, and because we at the time believed that this would lead to better UX for clients.

An alternative design choice is to allow buffering staking updates (delegations, unbonds, validators joining) for a number of blocks. This 'epoch'd proof of stake consensus provides the guarantee that the consensus weights for validators will not change mid-epoch, except in the event of a slash condition.

Additionally, the UX hurdle may not be as significant as was previously thought. This is because it is possible to provide users immediate acknowledgement that their bond was recorded and will be executed.

Furthermore, it has become clearer over time that immediate execution of staking events comes with limitations, such as:

* Threshold based cryptography. One of the main limitations is that because the validator set can change so regularly, it makes the running of multiparty computation by a fixed validator set difficult. Many threshold-based cryptographic features for blockchains such as randomness beacons and threshold decryption require a computationally-expensive DKG process (will take much longer than 1 block to create). To productively use these, we need to guarantee that the result of the DKG will be used for a reasonably long time. It wouldn't be feasible to rerun the DKG every block. By epoching staking, it guarantees we'll only need to run a new DKG once every epoch.

* Light client efficiency. This would lessen the overhead for IBC when there is high churn in the validator set. In the Tendermint light client bisection algorithm, the number of headers you need to verify is related to bounding the difference in validator sets between a trusted header and the latest header. If the difference is too great, you verify more header in between the two. By limiting the frequency of validator set changes, we can reduce the worst case size of IBC lite client proofs, which occurs when a validator set has high churn.

* Fairness of deterministic leader election. Currently we have no ways of reasoning of fairness of deterministic leader election in the presence of staking changes without epochs (tendermint/spec#217). Breaking fairness of leader election is profitable for validators, as they earn additional rewards from being the proposer. Adding epochs at least makes it easier for our deterministic leader election to match something we can prove secure. (Albeit, we still haven’t proven if our current algorithm is fair with > 2 validators in the presence of stake changes)

* Staking derivative design. Currently, reward distribution is done lazily using the F1 fee distribution. While saving computational complexity, lazy accounting requires a more stateful staking implementation. Right now, each delegation entry has to track the time of last withdrawal. Handling this can be a challenge for some staking derivatives designs that seek to provide fungibility for all tokens staked to a single validator. Force-withdrawing rewards to users can help solve this, however it is infeasible to force-withdraw rewards to users on a per block basis. With epochs, a chain could more easily alter the design to have rewards be forcefully withdrawn (iterating over delegator accounts only once per-epoch), and can thus remove delegation timing from state. This may be useful for certain staking derivative designs.

## Design considerations

### Slashing

There is a design consideration for whether to apply a slash immediately or at the end of an epoch. A slash event should apply to only members who are actually staked during the time of the infraction, namely during the epoch the slash event occured.

Applying it immediately can be viewed as offering greater consensus layer security, at potential costs to the aforementioned usecases. The benefits of immediate slashing for consensus layer security can be all be obtained by executing the validator jailing immediately (thus removing it from the validator set), and delaying the actual slash change to the validator's weight until the epoch boundary. For the use cases mentioned above, workarounds can be integrated to avoid problems, as follows:

* For threshold based cryptography, this setting will have the threshold cryptography use the original epoch weights, while consensus has an update that lets it more rapidly benefit from additional security. If the threshold based cryptography blocks liveness of the chain, then we have effectively raised the liveness threshold of the remaining validators for the rest of the epoch. (Alternatively, jailed nodes could still contribute shares) This plan will fail in the extreme case that more than 1/3rd of the validators have been jailed within a single epoch. For such an extreme scenario, the chain already have its own custom incident response plan, and defining how to handle the threshold cryptography should be a part of that.
* For light client efficiency, there can be a bit included in the header indicating an intra-epoch slash (ala https://github.com/tendermint/spec/issues/199).
* For fairness of deterministic leader election, applying a slash or jailing within an epoch would break the guarantee we were seeking to provide. This then re-introduces a new (but significantly simpler) problem for trying to provide fairness guarantees. Namely, that validators can adversarially elect to remove themself from the set of proposers. From a security perspective, this could potentially be handled by two different mechanisms (or prove to still be too difficult to achieve). One is making a security statement acknowledging the ability for an adversary to force an ahead-of-time fixed threshold of users to drop out of the proposer set within an epoch. The second method would be to  parameterize such that the cost of a slash within the epoch far outweights benefits due to being a proposer. However, this latter criterion is quite dubious, since being a proposer can have many advantageous side-effects in chains with complex state machines. (Namely, DeFi games such as Fomo3D)
* For staking derivative design, there is no issue introduced. This does not increase the state size of staking records, since whether a slash has occured is fully queryable given the validator address.

### Token lockup

When someone makes a transaction to delegate, even though they are not immediately staked, their tokens should be moved into a pool managed by the staking module which will then be used at the end of an epoch. This prevents concerns where they stake, and then spend those tokens not realizing they were already allocated for staking, and thus having their staking tx fail.

### Pipelining the epochs

For threshold based cryptography in particular, we need a pipeline for epoch changes. This is because when we are in epoch N, we want the epoch N+1 weights to be fixed so that the validator set can do the DKG accordingly. So if we are currently in epoch N, the stake weights for epoch N+1 should already be fixed, and new stake changes should be getting applied to epoch N + 2.

This can be handled by making a parameter for the epoch pipeline length. This parameter should not be alterable except during hard forks, to mitigate implementation complexity of switching the pipeline length.

With pipeline length 1, if I redelegate during epoch N, then my redelegation is applied prior to the beginning of epoch N+1.
With pipeline length 2, if I redelegate during epoch N, then my redelegation is applied prior to the beginning of epoch N+2.

### Rewards

Even though all staking updates are applied at epoch boundaries, rewards can still be distributed immediately when they are claimed. This is because they do not affect the current stake weights, as we do not implement auto-bonding of rewards. If such a feature were to be implemented, it would have to be setup so that rewards are auto-bonded at the epoch boundary.

### Parameterizing the epoch length

When choosing the epoch length, there is a trade-off queued state/computation buildup, and countering the previously discussed limitations of immediate execution if they apply to a given chain.

Until an ABCI mechanism for variable block times is introduced, it is ill-advised to be using high epoch lengths due to the computation buildup. This is because when a block's execution time is greater than the expected block time from Tendermint, rounds may increment.

## Decision

**Step-1**:  Implement buffering of all staking and slashing messages.

First we create a pool for storing tokens that are being bonded, but should be applied at the epoch boundary called the `EpochDelegationPool`. Then, we have two separate queues, one for staking, one for slashing. We describe what happens on each message being delivered below:

### Staking messages

* **MsgCreateValidator**: Move user's self-bond to `EpochDelegationPool` immediately. Queue a message for the epoch boundary to handle the self-bond, taking the funds from the `EpochDelegationPool`. If Epoch execution fail, return back funds from `EpochDelegationPool` to user's account.
* **MsgEditValidator**: Validate message and if valid queue the message for execution at the end of the Epoch.
* **MsgDelegate**: Move user's funds to `EpochDelegationPool` immediately. Queue a message for the epoch boundary to handle the delegation, taking the funds from the `EpochDelegationPool`. If Epoch execution fail, return back funds from `EpochDelegationPool` to user's account.
* **MsgBeginRedelegate**: Validate message and if valid queue the message for execution at the end of the Epoch.
* **MsgUndelegate**: Validate message and if valid queue the message for execution at the end of the Epoch.

### Slashing messages

* **MsgUnjail**: Validate message and if valid queue the message for execution at the end of the Epoch.
* **Slash Event**: Whenever a slash event is created, it gets queued in the slashing module to apply at the end of the epoch. The queues should be setup such that this slash applies immediately.

### Evidence Messages

* **MsgSubmitEvidence**: This gets executed immediately, and the validator gets jailed immediately. However in slashing, the actual slash event gets queued.

Then we add methods to the end blockers, to ensure that at the epoch boundary the queues are cleared and delegation updates are applied.

**Step-2**: Implement querying of queued staking txs.

When querying the staking activity of a given address, the status should return not only the amount of tokens staked, but also if there are any queued stake events for that address. This will require more work to be done in the querying logic, to trace the queued upcoming staking events.

As an initial implementation, this can be implemented as a linear search over all queued staking events. However, for chains that need long epochs, they should eventually build additional support for nodes that support querying to be able to produce results in constant time. (This is do-able by maintaining an auxilliary hashmap for indexing upcoming staking events by address)

**Step-3**: Adjust gas

Currently gas represents the cost of executing a transaction when its done immediately. (Merging together costs of p2p overhead, state access overhead, and computational overhead) However, now a transaction can cause computation in a future block, namely at the epoch boundary.

To handle this, we should initially include parameters for estimating the amount of future computation (denominated in gas), and add that as a flat charge needed for the message.
We leave it as out of scope for how to weight future computation versus current computation in gas pricing, and have it set such that the are weighted equally for now.

## Consequences

### Positive

* Abstracts the proof of stake module that allows retaining the existing functionality
* Enables new features such as validator-set based threshold cryptography

### Negative

* Increases complexity of integrating more complex gas pricing mechanisms, as they now have to consider future execution costs as well.
* When epoch > 1, validators can no longer leave the network immediately, and must wait until an epoch boundary.
