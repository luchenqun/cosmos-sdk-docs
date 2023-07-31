# `x/staking`

## 摘要

本文规定了Cosmos SDK的Staking模块，该模块首次在2016年6月的[Cosmos白皮书](https://cosmos.network/about/whitepaper)中进行了描述。

该模块使得基于Cosmos SDK的区块链能够支持先进的权益证明（PoS）系统。在该系统中，链上原生权益代币的持有者可以成为验证人，并可以委托代币给验证人，最终决定系统的有效验证人集合。

该模块在Cosmos网络中的第一个Hub——Cosmos Hub中使用。

## 目录

* [状态](#state)
    * [Pool](#pool)
    * [LastTotalPower](#lasttotalpower)
    * [ValidatorUpdates](#validatorupdates)
    * [UnbondingID](#unbondingid)
    * [Params](#params)
    * [Validator](#validator)
    * [Delegation](#delegation)
    * [UnbondingDelegation](#unbondingdelegation)
    * [Redelegation](#redelegation)
    * [Queues](#queues)
    * [HistoricalInfo](#historicalinfo)
* [状态转换](#state-transitions)
    * [验证人](#validators)
    * [委托](#delegations)
    * [惩罚](#slashing)
    * [份额计算方式](#how-shares-are-calculated)
* [消息](#messages)
    * [MsgCreateValidator](#msgcreatevalidator)
    * [MsgEditValidator](#msgeditvalidator)
    * [MsgDelegate](#msgdelegate)
    * [MsgUndelegate](#msgundelegate)
    * [MsgCancelUnbondingDelegation](#msgcancelunbondingdelegation)
    * [MsgBeginRedelegate](#msgbeginredelegate)
    * [MsgUpdateParams](#msgupdateparams)
* [Begin-Block](#begin-block)
    * [历史信息追踪](#historical-info-tracking)
* [End-Block](#end-block)
    * [验证人集合变更](#validator-set-changes)
    * [Queues](#queues-1)
* [Hooks](#hooks)
* [Events](#events)
    * [EndBlocker](#endblocker)
    * [消息](#msgs)
* [参数](#parameters)
* [客户端](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)

## 状态

### Pool

Pool用于跟踪债券面额的已绑定和未绑定的代币供应量。

### LastTotalPower

LastTotalPower跟踪上一个结束块期间记录的已绑定代币的总量。以"Last"为前缀的存储条目在EndBlock之前必须保持不变。

* LastTotalPower: `0x12 -> ProtocolBuffer(math.Int)`

### ValidatorUpdates

ValidatorUpdates 包含了每个区块结束时返回给 ABCI 的验证者更新。这些值在每个区块中被覆盖。

* ValidatorUpdates `0x61 -> []abci.ValidatorUpdate`

### UnbondingID

UnbondingID 存储了最新解绑操作的 ID。它可以为解绑操作创建唯一的 ID，即每次启动新的解绑操作（验证者解绑、解绑委托、重新委托）时，UnbondingID 会递增。

* UnbondingID: `0x37 -> uint64`

### Params

staking 模块将其参数存储在状态中，前缀为 `0x51`，可以通过治理或具有权限的地址进行更新。

* Params: `0x51 | ProtocolBuffer(Params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L310-L333
```

### Validator

验证者可以有三种状态之一

* `Unbonded`: 验证者不在活跃集合中。他们不能签名区块，也不能获得奖励。他们可以接收委托。
* `Bonded`: 一旦验证者获得足够的质押代币，它们会在 [`EndBlock`](#validator-set-changes) 期间自动加入活跃集合，并且其状态更新为 `Bonded`。他们会签名区块并获得奖励。他们可以接收更多的委托。如果这个验证者的委托人解除委托，他们必须等待特定链上的 UnbondingTime 时长，在此期间，如果这些委托人在质押代币的期间内犯有违规行为，他们仍然可以被处罚。 
* `Unbonding`: 当验证者由于选择、惩罚、拘留或删除而离开活跃集合时，所有委托将开始解绑。所有委托必须等待 UnbondingTime，然后将其代币从 `BondedPool` 转移到其账户中。

:::warning
删除是永久性的，一旦删除，验证者的共识密钥将无法在发生删除的链上重新使用。
:::

Validators对象应该主要通过`OperatorAddr`进行存储和访问，`OperatorAddr`是验证者的SDK验证者地址。每个验证者对象还维护两个额外的索引，以满足对惩罚和验证者集更新的必要查找。还维护了第三个特殊索引(`LastValidatorPower`)，但是它在每个块中保持不变，不像前两个索引，它们会在块内镜像验证者记录。

* Validators: `0x21 | OperatorAddrLen (1 byte) | OperatorAddr -> ProtocolBuffer(validator)`
* ValidatorsByConsAddr: `0x22 | ConsAddrLen (1 byte) | ConsAddr -> OperatorAddr`
* ValidatorsByPower: `0x23 | BigEndian(ConsensusPower) | OperatorAddrLen (1 byte) | OperatorAddr -> OperatorAddr`
* LastValidatorsPower: `0x11 | OperatorAddrLen (1 byte) | OperatorAddr -> ProtocolBuffer(ConsensusPower)`
* ValidatorsByUnbondingID: `0x38 | UnbondingID ->  0x21 | OperatorAddrLen (1 byte) | OperatorAddr`

`Validators`是主要索引 - 它确保每个操作员只能有一个关联的验证者，该验证者的公钥可以在将来更改。委托人可以引用验证者的不可变操作员，而不必担心公钥的变化。

`ValidatorsByUnbondingID`是一个额外的索引，它可以通过当前解绑ID查找验证者。

`ValidatorByConsAddr`是一个额外的索引，它可以通过验证者的ConsPubKey派生的地址查找验证者。当CometBFT报告证据时，它提供了验证者地址，因此需要此映射来查找操作员。请注意，`ConsAddr`对应于可以从验证者的`ConsPubKey`派生的地址。

`ValidatorsByPower`是一个额外的索引，它提供了一个排序的潜在验证者列表，以快速确定当前的活动集。在这里，ConsensusPower默认为validator.Tokens/10^6。请注意，所有`Jailed`为true的验证者都不存储在此索引中。

`LastValidatorsPower`是一个特殊索引，它提供了上一个块中绑定的验证者的历史列表。此索引在块中保持不变，但在验证者集更新过程中会在[`EndBlock`](#end-block)中更新。

每个验证人的状态都存储在一个名为`Validator`的结构体中：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L82-L138
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L26-L80
```

### 委托

委托通过将`DelegatorAddr`（委托人的地址）与`ValidatorAddr`（验证人的地址）组合来进行标识。委托人在存储中的索引如下：

* 委托：`0x31 | DelegatorAddrLen（1字节）| DelegatorAddr | ValidatorAddrLen（1字节）| ValidatorAddr -> ProtocolBuffer（委托）`

持币人可以将代币委托给验证人；在这种情况下，他们的资金将保存在一个名为`Delegation`的数据结构中。它由一个委托人拥有，并与一个验证人的份额相关联。交易的发送者是债券的所有者。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L198-L216
```

#### 委托人份额

当某人将代币委托给验证人时，根据委托给验证人的代币总数和迄今为止发行的份额数量，他们将获得一定数量的委托人份额，计算方法如下：

`每个代币的份额 = 验证人的总份额 / 验证人的代币数量`

只有收到的份额数量存储在`DelegationEntry`中。当委托人解除委托时，他们收到的代币数量是根据他们当前持有的份额数量和反向兑换率计算的：

`每个份额的代币 = 验证人的代币数量 / 验证人的份额数量`

这些`份额`只是一种会计机制，它们不是可替代的资产。采用这种机制的原因是为了简化关于惩罚的会计工作。与其逐个惩罚每个委托条目的代币，不如直接对验证人的总委托代币进行惩罚，从而有效地降低每个已发行委托人份额的价值。

### 解委托

`Delegation`中的份额可以被解除委托，但它们必须在一段时间内作为`UnbondingDelegation`存在，如果检测到拜占庭行为，份额可以被减少。

`UnbondingDelegation`在存储中的索引如下：

- UnbondingDelegation：`0x32 | DelegatorAddrLen（1字节）| DelegatorAddr | ValidatorAddrLen（1字节）| ValidatorAddr -> ProtocolBuffer（unbondingDelegation）`
- UnbondingDelegationsFromValidator：`0x33 | ValidatorAddrLen（1字节）| ValidatorAddr | DelegatorAddrLen（1字节）| DelegatorAddr -> nil`
- UnbondingDelegationByUnbondingId：`0x38 | UnbondingId -> 0x32 | DelegatorAddrLen（1字节）| DelegatorAddr | ValidatorAddrLen（1字节）| ValidatorAddr`
`UnbondingDelegation`用于查询，以查找给定委托人的所有解绑委托。

`UnbondingDelegationsFromValidator`用于惩罚，以查找与给定验证人相关的所有解绑委托，这些解绑委托需要被惩罚。

`UnbondingDelegationByUnbondingId`是一个额外的索引，可以通过包含的解绑委托条目的解绑ID来进行查找解绑委托。

每次发起解绑时，都会创建一个`UnbondingDelegation`对象。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L218-L261
```

### 重新委托

`Delegation`的绑定代币可以立即从源验证人重新委托给不同的验证人（目标验证人）。但是，当发生这种情况时，它们必须在`Redelegation`对象中进行跟踪，以便如果它们的代币导致源验证人发生拜占庭错误，可以对其份额进行惩罚。

`Redelegation`在存储中的索引如下：

- Redelegations：`0x34 | DelegatorAddrLen（1字节）| DelegatorAddr | ValidatorAddrLen（1字节）| ValidatorSrcAddr | ValidatorDstAddr -> ProtocolBuffer（redelegation）`
- RedelegationsBySrc：`0x35 | ValidatorSrcAddrLen（1字节）| ValidatorSrcAddr | ValidatorDstAddrLen（1字节）| ValidatorDstAddr | DelegatorAddrLen（1字节）| DelegatorAddr -> nil`
- RedelegationsByDst：`0x36 | ValidatorDstAddrLen（1字节）| ValidatorDstAddr | ValidatorSrcAddrLen（1字节）| ValidatorSrcAddr | DelegatorAddrLen（1字节）| DelegatorAddr -> nil`
- RedelegationByUnbondingId：`0x38 | UnbondingId -> 0x34 | DelegatorAddrLen（1字节）| DelegatorAddr | ValidatorAddrLen（1字节）| ValidatorSrcAddr | ValidatorDstAddr`

`Redelegations` 用于查询，以查找给定委托人的所有重新委托。

`RedelegationsBySrc` 用于基于 `ValidatorSrcAddr` 进行惩罚。

`RedelegationsByDst` 用于基于 `ValidatorDstAddr` 进行惩罚。

这里的第一个映射用于查询，以查找给定委托人的所有重新委托。第二个映射用于基于 `ValidatorSrcAddr` 进行惩罚，而第三个映射用于基于 `ValidatorDstAddr` 进行惩罚。

`RedelegationByUnbondingId` 是一个额外的索引，可以通过包含的解委托条目的解委托 ID 进行查找。

每次发生重新委托时，都会创建一个重新委托对象。为了防止“重新委托跳跃”，在以下情况下不允许进行重新委托：

* （重新）委托人已经有另一个未成熟的重新委托正在进行中，其目标是一个验证人（我们称之为“验证人 X”）
* 并且，（重新）委托人正试图创建一个“新”的重新委托，其中此新重新委托的源验证人是“验证人 X”。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L263-L308
```

### 队列

所有队列对象都按时间戳排序。在任何队列中使用的时间首先四舍五入到最近的纳秒，然后排序。可排序的时间格式是 RFC3339Nano 的轻微修改版本，使用格式字符串 `"2006-01-02T15:04:05.000000000"`。值得注意的是，此格式：

* 右侧填充所有零
* 删除时区信息（使用 UTC）

在所有情况下，存储的时间戳表示队列元素的成熟时间。

#### 解委托队列

为了跟踪解委托的进展，保留了解委托队列。

* 解委托：`0x41 | format(time) -> []DVPair`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L162-L172
```

#### 重新委托队列

为了跟踪重新委托的进展，保留了重新委托队列。

* RedelegationQueue: `0x42 | format(time) -> []DVVTriplet`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L179-L191
```

#### ValidatorQueue

为了跟踪解绑验证人的进展，保留了验证人队列。

* ValidatorQueueTime: `0x43 | format(time) -> []sdk.ValAddress`

存储的对象是每个键都是验证人操作者地址的数组，通过该数组可以访问验证人对象。通常情况下，预期在给定的时间戳上只与一个验证人记录关联，但是在同一位置可能存在多个验证人。

### HistoricalInfo

HistoricalInfo 对象在每个块上存储和修剪，以便 staking keeper 持久化由 staking 模块参数 `HistoricalEntries` 定义的最新的 `n` 个历史信息。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L17-L24
```

在每个 BeginBlock 时，staking keeper 将当前 Header 和提交当前块的验证人存储在一个 `HistoricalInfo` 对象中。验证人按照其地址排序，以确保它们处于确定性顺序。最旧的 HistoricalEntries 将被修剪，以确保只存在参数定义的历史条目数。

## 状态转换

### 验证人

验证人的状态转换在每个 [`EndBlock`](#validator-set-changes) 中执行，以检查活跃的 `ValidatorSet` 是否发生变化。

验证人可以是 `Unbonded`、`Unbonding` 或 `Bonded`。`Unbonded` 和 `Unbonding` 统称为 `Not Bonded`。验证人可以直接在所有状态之间转换，除了从 `Bonded` 转换到 `Unbonded`。

#### 从 Not bonded 转换到 Bonded

当验证人在 `ValidatorPowerIndex` 中的排名超过 `LastValidator` 时，发生以下转换：

* 将 `validator.Status` 设置为 `Bonded`
* 将 `validator.Tokens` 从 `NotBondedTokens` 发送到 `BondedPool` 的 `ModuleAccount`
* 从 `ValidatorByPowerIndex` 中删除现有记录
* 向 `ValidatorByPowerIndex` 添加新的更新记录
* 更新此验证人的 `Validator` 对象
* 如果存在，删除此验证人的任何 `ValidatorQueue` 记录

#### 从质押到解质押

当验证人开始解质押过程时，会执行以下操作：

* 将 `validator.Tokens` 从 `BondedPool` 发送到 `NotBondedTokens` `ModuleAccount`
* 将 `validator.Status` 设置为 `Unbonding`
* 从 `ValidatorByPowerIndex` 中删除现有记录
* 向 `ValidatorByPowerIndex` 添加新的更新记录
* 更新此验证人的 `Validator` 对象
* 为此验证人在 `ValidatorQueue` 中插入新的记录

#### 从解质押到未质押

当 `ValidatorQueue` 对象从质押变为未质押时，验证人从解质押状态变为未质押状态

* 更新此验证人的 `Validator` 对象
* 将 `validator.Status` 设置为 `Unbonded`

#### 禁闭/解禁

当验证人被禁闭时，实际上是从 CometBFT 集合中移除了该验证人。
此过程也可以被逆转。执行以下操作：

* 设置 `Validator.Jailed` 并更新对象
* 如果被禁闭，则从 `ValidatorByPowerIndex` 中删除记录
* 如果被解禁，则向 `ValidatorByPowerIndex` 添加记录

被禁闭的验证人不会出现在以下任何存储中：

* 力量存储（从共识力量到地址）

### 委托

#### 委托

当发生委托时，验证人和委托对象都会受到影响

* 根据委托的代币和验证人的兑换率确定委托人的份额
* 从发送账户中移除代币
* 将份额添加到委托对象或将其添加到创建的验证人对象中
* 添加新的委托人份额并更新 `Validator` 对象
* 将 `delegation.Amount` 从委托人的账户转移到 `BondedPool` 或 `NotBondedPool` `ModuleAccount`，具体取决于 `validator.Status` 是否为 `Bonded`
* 从 `ValidatorByPowerIndex` 中删除现有记录
* 向 `ValidatorByPowerIndex` 添加新的更新记录

#### 开始解质押

作为取消委托和完成解质押状态转换的一部分，可能会调用解质押委托。

* 从委托人中减去未质押的份额
* 将未质押的代币添加到 `UnbondingDelegationEntry`
* 更新委托或如果没有更多份额则删除委托
* 如果委托是验证人的操作者且没有更多份额存在，则触发禁闭验证人
* 更新验证人，删除委托人份额和相关的代币
* 如果验证人状态为 `Bonded`，则将价值为 `Coins` 的未质押份额从 `BondedPool` 转移到 `NotBondedPool` `ModuleAccount`
* 如果验证人已解质押且没有更多委托份额，则删除验证人
* 如果验证人已解质押且没有更多委托份额，则删除验证人
* 获取唯一的 `unbondingId` 并将其映射到 `UnbondingDelegationByUnbondingId` 中的 `UnbondingDelegationEntry`
* 调用 `AfterUnbondingInitiated(unbondingId)` 钩子
* 将解质押委托添加到 `UnbondingDelegationQueue`，完成时间设置为 `UnbondingTime`

#### 取消“解绑委托”条目

当发生“取消解绑委托”时，将同时更新“验证人”、“委托”和“解绑委托队列”状态。

- 如果取消解绑委托的金额等于“解绑委托”条目的余额，则从“解绑委托队列”中删除“解绑委托”条目。
- 如果取消解绑委托的金额小于“解绑委托”条目的余额，则在“解绑委托队列”中更新“解绑委托”条目的新余额。
- 取消的金额将被[委托](#delegations)回原始的“验证人”。

#### 完成解绑

对于未立即完成的解绑委托，当解绑委托队列元素到期时，将执行以下操作：

- 从“解绑委托”对象中移除该条目。
- 将代币从“NotBondedPool”模块账户转移到委托人的账户。

#### 开始重新委托

重新委托会影响委托、源验证人和目标验证人。

- 从源验证人处执行“解绑”委托以取回解绑份额所对应的代币。
- 使用解绑的代币，将其“委托”给目标验证人。
- 如果“源验证人”的状态为“Bonded”，而“目标验证人”的状态不是，“委托”给目标验证人的代币将从“BondedPool”转移到“NotBondedPool”模块账户。
- 否则，如果“源验证人”的状态不是“Bonded”，而“目标验证人”的状态是“Bonded”，将从“NotBondedPool”转移新委托的代币到“BondedPool”模块账户。
- 在相关的“重新委托”中记录代币金额的新条目。

从重新委托开始到完成的过程中，委托人处于“伪解绑”状态，仍然可能因重新委托开始之前发生的违规行为而被处罚。

#### 完成重新委托

当重新委托完成时，将执行以下操作：

- 从“重新委托”对象中移除该条目。

### 惩罚

#### 惩罚验证人

当验证人被惩罚时，会发生以下情况：

* 总的`slashAmount`被计算为`slashFactor`（链参数）乘以`TokensFromConsensusPower`，即违规时绑定到验证人的总代币数量。
* 每个未解绑委托和伪未解绑再委托，如果违规发生在解绑或再委托开始之前，将按照`initialBalance`的`slashFactor`百分比进行惩罚。
* 从再委托和未解绑委托中扣除的每个金额将从总的惩罚金额中减去。
* 然后，`remainingSlashAmount`将从验证人在`BondedPool`或`NonBondedPool`中的代币中进行惩罚，具体取决于验证人的状态。这将减少代币的总供应量。

对于任何需要提交证据的违规行为（例如双签名）导致的惩罚，惩罚发生在包含证据的区块，而不是违规发生的区块。
换句话说，验证人不会被追溯地惩罚，只有在被抓到时才会受到惩罚。

#### 惩罚未解绑委托

当验证人受到惩罚时，从验证人开始解绑的未解绑委托也会受到惩罚。
从验证人的每个未解绑委托中的每个条目都会受到`slashFactor`的惩罚。惩罚金额是根据委托的`InitialBalance`计算的，并且有上限，以防止结果为负数。已完成（或成熟）的解绑不会受到惩罚。

#### 惩罚再委托

当验证人受到惩罚时，从验证人开始的所有再委托也会受到惩罚。
再委托会受到`slashFactor`的惩罚。在违规发生之前开始的再委托不会受到惩罚。
惩罚金额是根据委托的`InitialBalance`计算的，并且有上限，以防止结果为负数。已完成伪未解绑的成熟再委托不会受到惩罚。

### 如何计算份额

在任何给定的时间点，每个验证人都有一定数量的代币`T`，并发行了一定数量的份额`S`。
每个委托人`i`持有一定数量的份额`S_i`。
代币的数量是所有委托给验证人的代币总和，加上奖励，减去惩罚。

委托人有权获得与其份额比例相对应的基础代币部分。因此，委托人 `i` 有权获得验证人的代币的 `T * S_i / S` 部分。

当委托人向验证人委托新的代币时，他们会获得与其贡献成比例的份额。因此，当委托人 `j` 委托了 `T_j` 个代币时，他们会获得 `S_j = S * T_j / T` 份额。现在，总代币数为 `T + T_j`，总份额数为 `S + S_j`。委托人 `j` 的份额比例与其贡献的总代币比例相同：`(S + S_j) / S = (T + T_j) / T`。

特殊情况是初始委托，当 `T = 0` 且 `S = 0` 时，`T_j / T` 未定义。对于初始委托，委托 `T_j` 个代币的委托人 `j` 将获得 `S_j = T_j` 份额。因此，一个未收到任何奖励且未被惩罚的验证人将具有 `T = S`。

## 消息

在本节中，我们描述了质押消息的处理以及状态的相应更新。每个消息指定的所有创建/修改的状态对象在 [状态](#state) 部分中定义。

### MsgCreateValidator

使用 `MsgCreateValidator` 消息创建验证人。验证人必须由操作员进行初始委托。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L20-L21
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L50-L73
```

如果出现以下情况，此消息预计会失败：

* 具有此操作员地址的另一个验证人已注册
* 具有此公钥的另一个验证人已注册
* 初始自委托代币不是指定为绑定代币的 denom
* 佣金参数有误，即：
    * `MaxRate` 要么大于 1，要么小于 0
    * 初始 `Rate` 要么为负数，要么大于 `MaxRate`
    * 初始 `MaxChangeRate` 要么为负数，要么大于 `MaxRate`
* 描述字段过大

这条消息在适当的索引处创建并存储`Validator`对象。
此外，使用初始代币委托代币`Delegation`进行自委托。
验证人始终以未绑定状态开始，但可能在第一个结束块中绑定。

### MsgEditValidator

可以使用`MsgEditValidator`消息更新验证人的`Description`、`CommissionRate`。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L23-L24
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L78-L97
```

如果以下情况之一发生，此消息预计会失败：

* 初始的`CommissionRate`为负数或大于`MaxRate`
* `CommissionRate`在前24小时内已经更新过
* `CommissionRate`大于`MaxChangeRate`
* 描述字段过大

此消息存储了更新后的`Validator`对象。

### MsgDelegate

在此消息中，委托人提供代币，并获得其验证人（新创建的）委托份额`Delegation.Shares`的一部分。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L26-L28
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L102-L114
```

如果以下情况之一发生，此消息预计会失败：

* 验证人不存在
* `Amount` `Coin`的面额与`params.BondDenom`定义的面额不同
* 汇率无效，即验证人没有代币（由于惩罚），但存在未解除的份额
* 委托的金额小于允许的最小委托金额

如果提供的地址的现有`Delegation`对象尚不存在，则将其作为此消息的一部分创建，否则将更新现有的`Delegation`以包括新收到的份额。

委托人以当前汇率获得新铸造的份额。
汇率是验证人现有份额数除以当前委托的代币数。

验证人在`ValidatorByPower`索引中进行更新，委托在`Validators`索引中跟踪。

可以委托给被监禁的验证人，唯一的区别是在解除监禁之前不会将其添加到权力索引中。

![委托序列](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/delegation_sequence.svg)

### MsgUndelegate

`MsgUndelegate`消息允许委托人从验证人那里撤销委托的代币。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L34-L36
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L140-L152
```

该消息返回一个包含解除委托完成时间的响应：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L154-L158
```

如果满足以下条件，该消息预计会失败：

* 委托不存在
* 验证人不存在
* 委托的份额少于`Amount`所值的份额
* 现有的`UnbondingDelegation`的条目数达到了`params.MaxEntries`定义的最大值
* `Amount`的货币单位与`params.BondDenom`定义的单位不同

当处理该消息时，会执行以下操作：

* 验证人的`DelegatorShares`和委托的`Shares`都会减少`SharesAmount`所指定的份额
* 计算被移除的份额所值的代币数量，并从验证人持有的代币中减去该数量
* 对于被移除的代币，如果验证人的状态是：
    * `Bonded` - 将它们添加到`UnbondingDelegation`的一个条目中（如果不存在，则创建`UnbondingDelegation`），完成时间为当前时间起的完整解绑期。更新池的份额，通过被移除的份额的代币数量减少`BondedTokens`并增加`NotBondedTokens`。
    * `Unbonding` - 将它们添加到`UnbondingDelegation`的一个条目中（如果不存在，则创建`UnbondingDelegation`），完成时间与验证人的完成时间（`UnbondingMinTime`）相同。
    * `Unbonded` - 将代币发送给消息中的`DelegatorAddr`
* 如果委托中没有更多的`Shares`，则从存储中删除委托对象
    * 在这种情况下，如果委托是验证人的自委托，则还会将验证人设置为被监禁状态。

![解绑序列图](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/unbond_sequence.svg)

### MsgCancelUnbondingDelegation

`MsgCancelUnbondingDelegation`消息允许委托人取消`unbondingDelegation`条目并重新委托给先前的验证人。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L38-L42
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L160-L175
```

如果以下情况发生，此消息预计会失败：

* `unbondingDelegation`条目已经处理。
* `cancel unbonding delegation`金额大于`unbondingDelegation`条目余额。
* `cancel unbonding delegation`高度在委托人的`unbondingDelegationQueue`中不存在。

处理此消息时，将执行以下操作：

* 如果`unbondingDelegation`条目余额为零
    * 在此情况下，将从`unbondingDelegationQueue`中删除`unbondingDelegation`条目。
    * 否则，将使用新的`unbondingDelegation`条目余额和初始余额更新`unbondingDelegationQueue`。
* 验证人的`DelegatorShares`和委托的`Shares`都会增加`Amount`。

### MsgBeginRedelegate

重新委托命令允许委托人立即切换验证人。一旦解绑期过去，重新委托将在EndBlocker中自动完成。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L30-L32
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L119-L132
```

此消息返回一个包含重新委托完成时间的响应：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L133-L138
```

如果以下情况发生，此消息预计会失败：

* 委托不存在
* 源验证人或目标验证人不存在
* 委托的份额少于`Amount`所值的份额
* 源验证人具有未成熟的接收重新委托（即重新委托可能是传递性的）
* 现有的`Redelegation`已达到`params.MaxEntries`定义的最大条目数
* `Amount`的`Coin`的面额与`params.BondDenom`定义的面额不同

当处理此消息时，会发生以下操作：

* 源验证器的`DelegatorShares`和委托的`Shares`都会减少`SharesAmount`的数量。
* 计算股份的代币价值，从源验证器中移除相应数量的代币。
* 如果源验证器是：
    * `Bonded` - 向`Redelegation`添加一个条目（如果不存在则创建`Redelegation`），完成时间为当前时间起的完整解绑期。更新池的股份，减少`BondedTokens`并增加`NotBondedTokens`，增加的数量为股份的代币价值（但在下一步可能会被逆转）。
    * `Unbonding` - 向`Redelegation`添加一个条目（如果不存在则创建`Redelegation`），完成时间与验证器的(`UnbondingMinTime`)相同。
    * `Unbonded` - 在此步骤中不需要执行任何操作。
* 将代币价值委托给目标验证器，可能会将代币移回到已绑定状态。
* 如果源委托中没有更多的`Shares`，则从存储中删除源委托对象。
    * 在这种情况下，如果委托是验证器的自委托，则还会将验证器锁定。

![开始重新委托序列](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/begin_redelegation_sequence.svg)


### MsgUpdateParams

`MsgUpdateParams`用于更新质押模块的参数。
这些参数通过治理提案进行更新，签名者是治理模块的账户地址。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L182-L195
```

如果出现以下情况，消息处理可能会失败：

* 签名者不是质押保管者中定义的权限（通常是治理模块账户）。

## Begin-Block

每个 ABCI 的 begin block 调用都会根据`HistoricalEntries`参数存储和修剪历史信息。

### 历史信息跟踪

如果`HistoricalEntries`参数为0，则`BeginBlock`不执行任何操作。

否则，最新的历史信息将存储在键`historicalInfoKey|height`下，而任何早于`height - HistoricalEntries`的条目将被删除。
在大多数情况下，每个块只会修剪一个条目。
但是，如果`HistoricalEntries`参数更改为较低的值，则存储中将有多个需要修剪的条目。

## 结束区块

每个 ABCI 结束区块调用时，指定要执行的更新队列和验证人集合更改操作。

### 验证人集合更改

在此过程中，通过在每个区块结束时运行的状态转换来更新质押验证人集合。作为此过程的一部分，任何更新的验证人也会返回给 CometBFT，以便包含在负责在共识层验证 CometBFT 消息的 CometBFT 验证人集合中。操作如下：

* 新的验证人集合是从 `ValidatorsByPower` 索引中检索到的前 `params.MaxValidators` 个验证人
* 将先前的验证人集合与新的验证人集合进行比较：
    * 缺失的验证人开始解除质押，并将其 `Tokens` 从 `BondedPool` 转移到 `NotBondedPool` 的 `ModuleAccount`
    * 新的验证人立即进行质押，并将其 `Tokens` 从 `NotBondedPool` 转移到 `BondedPool` 的 `ModuleAccount`

在所有情况下，任何离开或进入质押验证人集合的验证人，或者在质押验证人集合内更改余额并保持不变，都会产生一个更新消息，报告其新的共识能力，该消息传递回 CometBFT。

`LastTotalPower` 和 `LastValidatorsPower` 保存了上一个区块结束时的总能力和验证人能力的状态，并用于检查在 `ValidatorsByPower` 和总新能力中发生的更改，该能力在 `EndBlock` 过程中计算。

### 队列

在质押中，某些状态转换不是瞬时发生的，而是需要一段时间（通常是解除质押期）来完成。当这些转换成熟时，必须执行某些操作以完成状态操作。这是通过使用队列来实现的，这些队列在每个区块结束时进行检查/处理。

#### 解除质押的验证人

当验证人被踢出质押验证人集合（无论是因为被监禁还是没有足够的质押代币），它会开始解除质押过程，并且所有委托给该验证人的委托也会开始解除质押（同时仍然委托给该验证人）。此时，验证人被称为“解除质押的验证人”，在解除质押期过去后，它将成熟为“解除质押的验证人”。

每个验证人队列块都要检查成熟的未绑定验证人（即完成时间 <= 当前时间且完成高度 <= 当前区块高度）。此时，状态中将删除所有没有剩余委托的成熟验证人。对于其他仍有剩余委托的成熟未绑定验证人，`validator.Status`将从`types.Unbonding`切换到`types.Unbonded`。

外部模块可以通过`PutUnbondingOnHold(unbondingId)`方法暂停未绑定操作。因此，即使达到成熟状态，处于暂停状态的未绑定操作（例如，未绑定委托）也无法完成。对于具有`unbondingId`的未绑定操作最终要完成（在达到成熟状态后），每次调用`PutUnbondingOnHold(unbondingId)`都必须与调用`UnbondingCanComplete(unbondingId)`相匹配。

#### 未绑定委托

按照以下步骤完成`UnbondingDelegations`队列中所有成熟的`UnbondingDelegations.Entries`的未绑定委托：

* 将余额币转移到委托人的钱包地址
* 从`UnbondingDelegation.Entries`中删除成熟的条目
* 如果没有剩余条目，则从存储中删除`UnbondingDelegation`对象。

#### 重新委托

按照以下步骤完成`Redelegations`队列中所有成熟的`Redelegation.Entries`的未绑定委托：

* 从`Redelegation.Entries`中删除成熟的条目
* 如果没有剩余条目，则从存储中删除`Redelegation`对象。

## 钩子

其他模块可以在staking中发生特定事件时注册要执行的操作。这些事件可以注册为在staking事件发生之前或之后执行（根据钩子名称）。以下钩子可以与staking一起注册：

* `AfterValidatorCreated(Context, ValAddress) error`
    * 在创建验证人时调用
* `BeforeValidatorModified(Context, ValAddress) error`
    * 在更改验证人状态时调用
* `AfterValidatorRemoved(Context, ConsAddress, ValAddress) error`
    * 在删除验证人时调用
* `AfterValidatorBonded(Context, ConsAddress, ValAddress) error`
    * 在验证人绑定时调用
* `AfterValidatorBeginUnbonding(Context, ConsAddress, ValAddress) error`
    * 在验证人开始解绑时调用
* `BeforeDelegationCreated(Context, AccAddress, ValAddress) error`
    * 在创建委托时调用
* `BeforeDelegationSharesModified(Context, AccAddress, ValAddress) error`
    * 在修改委托份额时调用
* `AfterDelegationModified(Context, AccAddress, ValAddress) error`
    * 在创建或修改委托时调用
* `BeforeDelegationRemoved(Context, AccAddress, ValAddress) error`
    * 在删除委托时调用
* `AfterUnbondingInitiated(Context, UnbondingID)`
    * 在发起解绑操作（验证人解绑、未绑定委托、重新委托）时调用

## 事件

staking 模块会触发以下事件：

### EndBlocker

| 类型                  | 属性键                | 属性值                      |
| --------------------- | --------------------- | ------------------------- |
| complete_unbonding    | amount                | {totalUnbondingAmount}    |
| complete_unbonding    | validator             | {validatorAddress}        |
| complete_unbonding    | delegator             | {delegatorAddress}        |
| complete_redelegation | amount                | {totalRedelegationAmount} |
| complete_redelegation | source_validator      | {srcValidatorAddress}     |
| complete_redelegation | destination_validator | {dstValidatorAddress}     |
| complete_redelegation | delegator             | {delegatorAddress}        |

## Msg's

### MsgCreateValidator

| 类型             | 属性键 | 属性值    |
| ---------------- | ------ | --------- |
| create_validator | validator     | {validatorAddress} |
| create_validator | amount        | {delegationAmount} |
| message          | module        | staking            |
| message          | action        | create_validator   |
| message          | sender        | {senderAddress}    |

### MsgEditValidator

| 类型           | 属性键       | 属性值     |
| -------------- | ------------ | ----------- |
| edit_validator | commission_rate     | {commissionRate}    |
| edit_validator | min_self_delegation | {minSelfDelegation} |
| message        | module              | staking             |
| message        | action              | edit_validator      |
| message        | sender              | {senderAddress}     |

### MsgDelegate

| 类型     | 属性键 | 属性值    |
| -------- | ------ | --------- |
| delegate | validator     | {validatorAddress} |
| delegate | amount        | {delegationAmount} |
| message  | module        | staking            |
| message  | action        | delegate           |
| message  | sender        | {senderAddress}    |

### MsgUndelegate

| 类型    | 属性键       | 属性值    |
| ------- | ------------------- | ------------------ |
| unbond  | validator           | {validatorAddress} |
| unbond  | amount              | {unbondAmount}     |
| unbond  | completion_time [0] | {completionTime}   |
| message | module              | staking            |
| message | action              | begin_unbonding    |
| message | sender              | {senderAddress}    |

* [0] 时间格式遵循 RFC3339 标准

### MsgCancelUnbondingDelegation

| 类型                        | 属性键   | 属性值                   |
| --------------------------- | --------------- | --------------------------------- |
| cancel_unbonding_delegation | validator       | {validatorAddress}                |
| cancel_unbonding_delegation | delegator       | {delegatorAddress}                |
| cancel_unbonding_delegation | amount          | {cancelUnbondingDelegationAmount} |
| cancel_unbonding_delegation | creation_height | {unbondingCreationHeight}         |
| message                     | module          | staking                           |
| message                     | action          | cancel_unbond                     |
| message                     | sender          | {senderAddress}                   |

### MsgBeginRedelegate

| 类型       | 属性键         | 属性值       |
| ---------- | --------------------- | --------------------- |
| redelegate | source_validator      | {srcValidatorAddress} |
| redelegate | destination_validator | {dstValidatorAddress} |
| redelegate | amount                | {unbondAmount}        |
| redelegate | completion_time [0]   | {completionTime}      |
| message    | module                | staking               |
| message    | action                | begin_redelegate      |
| message    | sender                | {senderAddress}       |

* [0] 时间格式遵循 RFC3339 标准

## 参数

staking 模块包含以下参数：

| 键               | 类型             | 示例                |
| ----------------- | ---------------- | ---------------------- |
| UnbondingTime     | string (time ns) | "259200000000000"      |
| MaxValidators     | uint16           | 100                    |
| KeyMaxEntries     | uint16           | 7                      |
| HistoricalEntries | uint16           | 3                      |
| BondDenom         | string           | "stake"                |
| MinCommissionRate | string           | "0.000000000000000000" |

## 客户端

### 命令行界面（CLI）

用户可以使用命令行界面（CLI）查询和与 `staking` 模块进行交互。

#### 查询

`query` 命令允许用户查询 `staking` 状态。

```bash
simd query staking --help
```

##### 委托

`delegation` 命令允许用户查询特定委托人在特定验证人上的委托。

用法：

```bash
simd query staking delegation [delegator-addr] [validator-addr] [flags]
```

示例：

```bash
simd query staking delegation cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

示例输出：

```bash
balance:
  amount: "10000000000"
  denom: stake
delegation:
  delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
  shares: "10000000000.000000000000000000"
  validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

##### 委托列表

`delegations` 命令允许用户查询特定委托人在所有验证人上的委托。

用法：

```bash
simd query staking delegations [delegator-addr] [flags]
```

示例：

```bash
simd query staking delegations cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
```

示例输出：

```bash
delegation_responses:
- balance:
    amount: "10000000000"
    denom: stake
  delegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    shares: "10000000000.000000000000000000"
    validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
- balance:
    amount: "10000000000"
    denom: stake
  delegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    shares: "10000000000.000000000000000000"
    validator_address: cosmosvaloper1x20lytyf6zkcrv5edpkfkn8sz578qg5sqfyqnp
pagination:
  next_key: null
  total: "0"
```

##### 委托给

`delegations-to` 命令允许用户查询特定验证人上的委托。

用法：

```bash
simd query staking delegations-to [validator-addr] [flags]
```

示例：

```bash
simd query staking delegations-to cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

示例输出：

```bash
- balance:
    amount: "504000000"
    denom: stake
  delegation:
    delegator_address: cosmos1q2qwwynhv8kh3lu5fkeex4awau9x8fwt45f5cp
    shares: "504000000.000000000000000000"
    validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
- balance:
    amount: "78125000000"
    denom: uixo
  delegation:
    delegator_address: cosmos1qvppl3479hw4clahe0kwdlfvf8uvjtcd99m2ca
    shares: "78125000000.000000000000000000"
    validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
pagination:
  next_key: null
  total: "0"
```

##### 历史信息

`historical-info` 命令允许用户查询给定高度的历史信息。

用法：

```bash
simd query staking historical-info [height] [flags]
```

示例：

```bash
simd query staking historical-info 10
```

示例输出：

```bash
header:
  app_hash: Lbx8cXpI868wz8sgp4qPYVrlaKjevR5WP/IjUxwp3oo=
  chain_id: testnet
  consensus_hash: BICRvH3cKD93v7+R1zxE2ljD34qcvIZ0Bdi389qtoi8=
  data_hash: 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
  evidence_hash: 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
  height: "10"
  last_block_id:
    hash: RFbkpu6pWfSThXxKKl6EZVDnBSm16+U0l0xVjTX08Fk=
    part_set_header:
      hash: vpIvXD4rxD5GM4MXGz0Sad9I7//iVYLzZsEU4BVgWIU=
      total: 1
  last_commit_hash: Ne4uXyx4QtNp4Zx89kf9UK7oG9QVbdB6e7ZwZkhy8K0=
  last_results_hash: 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
  next_validators_hash: nGBgKeWBjoxeKFti00CxHsnULORgKY4LiuQwBuUrhCs=
  proposer_address: mMEP2c2IRPLr99LedSRtBg9eONM=
  time: "2021-10-01T06:00:49.785790894Z"
  validators_hash: nGBgKeWBjoxeKFti00CxHsnULORgKY4LiuQwBuUrhCs=
  version:
    app: "0"
    block: "11"
valset:
- commission:
    commission_rates:
      max_change_rate: "0.010000000000000000"
      max_rate: "0.200000000000000000"
      rate: "0.100000000000000000"
    update_time: "2021-10-01T05:52:50.380144238Z"
  consensus_pubkey:
    '@type': /cosmos.crypto.ed25519.PubKey
    key: Auxs3865HpB/EfssYOzfqNhEJjzys2Fo6jD5B8tPgC8=
  delegator_shares: "10000000.000000000000000000"
  description:
    details: ""
    identity: ""
    moniker: myvalidator
    security_contact: ""
    website: ""
  jailed: false
  min_self_delegation: "1"
  operator_address: cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc
  status: BOND_STATUS_BONDED
  tokens: "10000000"
  unbonding_height: "0"
  unbonding_time: "1970-01-01T00:00:00Z"
```

##### 参数

`params` 命令允许用户查询设置为staking参数的值。

用法：

```bash
simd query staking params [flags]
```

示例：

```bash
simd query staking params
```

示例输出：

```bash
bond_denom: stake
historical_entries: 10000
max_entries: 7
max_validators: 50
unbonding_time: 1814400s
```

##### 资金池

`pool` 命令允许用户查询存储在staking池中的金额值。

用法：

```bash
simd q staking pool [flags]
```

示例：

```bash
simd q staking pool
```

```bash
bonded_tokens: "10000000"
not_bonded_tokens: "0"
```

##### redelegation

`redelegation`命令允许用户根据委托人、源验证人地址和目标验证人地址查询重新委托记录。

用法：

```bash
simd query staking redelegation [delegator-addr] [src-validator-addr] [dst-validator-addr] [flags]
```

示例：

```bash
simd query staking redelegation cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

示例输出：

```bash
pagination: null
redelegation_responses:
- entries:
  - balance: "50000000"
    redelegation_entry:
      completion_time: "2021-10-24T20:33:21.960084845Z"
      creation_height: 2.382847e+06
      initial_balance: "50000000"
      shares_dst: "50000000.000000000000000000"
  - balance: "5000000000"
    redelegation_entry:
      completion_time: "2021-10-25T21:33:54.446846862Z"
      creation_height: 2.397271e+06
      initial_balance: "5000000000"
      shares_dst: "5000000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    entries: null
    validator_dst_address: cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm
    validator_src_address: cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm
```

##### redelegations

`redelegations`命令允许用户查询一个委托人的所有重新委托记录。

用法：

```bash
simd query staking redelegations [delegator-addr] [flags]
```

示例：

```bash
simd query staking redelegation cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
```

示例输出：

```bash
pagination:
  next_key: null
  total: "0"
redelegation_responses:
- entries:
  - balance: "50000000"
    redelegation_entry:
      completion_time: "2021-10-24T20:33:21.960084845Z"
      creation_height: 2.382847e+06
      initial_balance: "50000000"
      shares_dst: "50000000.000000000000000000"
  - balance: "5000000000"
    redelegation_entry:
      completion_time: "2021-10-25T21:33:54.446846862Z"
      creation_height: 2.397271e+06
      initial_balance: "5000000000"
      shares_dst: "5000000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    entries: null
    validator_dst_address: cosmosvaloper1uccl5ugxrm7vqlzwqr04pjd320d2fz0z3hc6vm
    validator_src_address: cosmosvaloper1zppjyal5emta5cquje8ndkpz0rs046m7zqxrpp
- entries:
  - balance: "562770000000"
    redelegation_entry:
      completion_time: "2021-10-25T21:42:07.336911677Z"
      creation_height: 2.39735e+06
      initial_balance: "562770000000"
      shares_dst: "562770000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    entries: null
    validator_dst_address: cosmosvaloper1uccl5ugxrm7vqlzwqr04pjd320d2fz0z3hc6vm
    validator_src_address: cosmosvaloper1zppjyal5emta5cquje8ndkpz0rs046m7zqxrpp
```

##### redelegations-from

`redelegations-from`命令允许用户查询正在从验证人重新委托的委托。

用法：

```bash
simd query staking redelegations-from [validator-addr] [flags]
```

示例：

```bash
simd query staking redelegations-from cosmosvaloper1y4rzzrgl66eyhzt6gse2k7ej3zgwmngeleucjy
```

示例输出：

```bash
pagination:
  next_key: null
  total: "0"
redelegation_responses:
- entries:
  - balance: "50000000"
    redelegation_entry:
      completion_time: "2021-10-24T20:33:21.960084845Z"
      creation_height: 2.382847e+06
      initial_balance: "50000000"
      shares_dst: "50000000.000000000000000000"
  - balance: "5000000000"
    redelegation_entry:
      completion_time: "2021-10-25T21:33:54.446846862Z"
      creation_height: 2.397271e+06
      initial_balance: "5000000000"
      shares_dst: "5000000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1pm6e78p4pgn0da365plzl4t56pxy8hwtqp2mph
    entries: null
    validator_dst_address: cosmosvaloper1uccl5ugxrm7vqlzwqr04pjd320d2fz0z3hc6vm
    validator_src_address: cosmosvaloper1y4rzzrgl66eyhzt6gse2k7ej3zgwmngeleucjy
- entries:
  - balance: "221000000"
    redelegation_entry:
      completion_time: "2021-10-05T21:05:45.669420544Z"
      creation_height: 2.120693e+06
      initial_balance: "221000000"
      shares_dst: "221000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1zqv8qxy2zgn4c58fz8jt8jmhs3d0attcussrf6
    entries: null
    validator_dst_address: cosmosvaloper10mseqwnwtjaqfrwwp2nyrruwmjp6u5jhah4c3y
    validator_src_address: cosmosvaloper1y4rzzrgl66eyhzt6gse2k7ej3zgwmngeleucjy
```

##### unbonding-delegation

`unbonding-delegation`命令允许用户查询一个委托人在一个验证人上的解委托。

用法：

```bash
simd query staking unbonding-delegation [delegator-addr] [validator-addr] [flags]
```

示例：

```bash
simd query staking unbonding-delegation cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

示例输出：

```bash
delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
entries:
- balance: "52000000"
  completion_time: "2021-11-02T11:35:55.391594709Z"
  creation_height: "55078"
  initial_balance: "52000000"
validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

##### unbonding-delegations

`unbonding-delegations`命令允许用户查询一个委托人的所有解委托记录。

用法：

```bash
simd query staking unbonding-delegations [delegator-addr] [flags]
```

```bash
simd查询质押解绑委托 cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
```

示例输出：

```bash
pagination:
  next_key: null
  total: "0"
unbonding_responses:
- delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
  entries:
  - balance: "52000000"
    completion_time: "2021-11-02T11:35:55.391594709Z"
    creation_height: "55078"
    initial_balance: "52000000"
  validator_address: cosmosvaloper1t8ehvswxjfn3ejzkjtntcyrqwvmvuknzmvtaaa

```

##### unbonding-delegations-from

`unbonding-delegations-from`命令允许用户查询从验证人解绑委托的委托。

用法：

```bash
simd查询质押解绑委托从 [验证人地址] [标志]
```

示例：

```bash
simd查询质押解绑委托从 cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

示例输出：

```bash
pagination:
  next_key: null
  total: "0"
unbonding_responses:
- delegator_address: cosmos1qqq9txnw4c77sdvzx0tkedsafl5s3vk7hn53fn
  entries:
  - balance: "150000000"
    completion_time: "2021-11-01T21:41:13.098141574Z"
    creation_height: "46823"
    initial_balance: "150000000"
  validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
- delegator_address: cosmos1peteje73eklqau66mr7h7rmewmt2vt99y24f5z
  entries:
  - balance: "24000000"
    completion_time: "2021-10-31T02:57:18.192280361Z"
    creation_height: "21516"
    initial_balance: "24000000"
  validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

##### validator

`validator`命令允许用户查询有关单个验证人的详细信息。

用法：

```bash
simd查询质押验证人 [验证人地址] [标志]
```

示例：

```bash
simd查询质押验证人 cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

示例输出：

```bash
commission:
  commission_rates:
    max_change_rate: "0.020000000000000000"
    max_rate: "0.200000000000000000"
    rate: "0.050000000000000000"
  update_time: "2021-10-01T19:24:52.663191049Z"
consensus_pubkey:
  '@type': /cosmos.crypto.ed25519.PubKey
  key: sIiexdJdYWn27+7iUHQJDnkp63gq/rzUq1Y+fxoGjXc=
delegator_shares: "32948270000.000000000000000000"
description:
  details: Witval is the validator arm from Vitwit. Vitwit is into software consulting
    and services business since 2015. We are working closely with Cosmos ecosystem
    since 2018. We are also building tools for the ecosystem, Aneka is our explorer
    for the cosmos ecosystem.
  identity: 51468B615127273A
  moniker: Witval
  security_contact: ""
  website: ""
jailed: false
min_self_delegation: "1"
operator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
status: BOND_STATUS_BONDED
tokens: "32948270000"
unbonding_height: "0"
unbonding_time: "1970-01-01T00:00:00Z"
```

##### validators

`validators`命令允许用户查询网络上所有验证人的详细信息。

用法：

```bash
simd查询质押验证人 [标志]
```

示例：

```bash
simd查询质押验证人
```

示例输出：

```bash
pagination:
  next_key: FPTi7TKAjN63QqZh+BaXn6gBmD5/
  total: "0"
validators:
commission:
  commission_rates:
    max_change_rate: "0.020000000000000000"
    max_rate: "0.200000000000000000"
    rate: "0.050000000000000000"
  update_time: "2021-10-01T19:24:52.663191049Z"
consensus_pubkey:
  '@type': /cosmos.crypto.ed25519.PubKey
  key: sIiexdJdYWn27+7iUHQJDnkp63gq/rzUq1Y+fxoGjXc=
delegator_shares: "32948270000.000000000000000000"
description:
    details: Witval is the validator arm from Vitwit. Vitwit is into software consulting
      and services business since 2015. We are working closely with Cosmos ecosystem
      since 2018. We are also building tools for the ecosystem, Aneka is our explorer
      for the cosmos ecosystem.
    identity: 51468B615127273A
    moniker: Witval
    security_contact: ""
    website: ""
  jailed: false
  min_self_delegation: "1"
  operator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
  status: BOND_STATUS_BONDED
  tokens: "32948270000"
  unbonding_height: "0"
  unbonding_time: "1970-01-01T00:00:00Z"
- commission:
    commission_rates:
      max_change_rate: "0.100000000000000000"
      max_rate: "0.200000000000000000"
      rate: "0.050000000000000000"
    update_time: "2021-10-04T18:02:21.446645619Z"
  consensus_pubkey:
    '@type': /cosmos.crypto.ed25519.PubKey
    key: GDNpuKDmCg9GnhnsiU4fCWktuGUemjNfvpCZiqoRIYA=
  delegator_shares: "559343421.000000000000000000"
  description:
    details: Noderunners is a professional validator in POS networks. We have a huge
      node running experience, reliable soft and hardware. Our commissions are always
      low, our support to delegators is always full. Stake with us and start receiving
      your Cosmos rewards now!
    identity: 812E82D12FEA3493
    moniker: Noderunners
    security_contact: info@noderunners.biz
    website: http://noderunners.biz
  jailed: false
  min_self_delegation: "1"
  operator_address: cosmosvaloper1q5ku90atkhktze83j9xjaks2p7uruag5zp6wt7
  status: BOND_STATUS_BONDED
  tokens: "559343421"
  unbonding_height: "0"
  unbonding_time: "1970-01-01T00:00:00Z"
```

#### 交易

`tx`命令允许用户与`staking`模块进行交互。

```bash
simd tx质押 --help
```

##### create-validator

`create-validator`命令允许用户创建一个新的验证人，并对其进行自委托初始化。

用法：

```bash
simd tx质押创建验证人 [路径/到/验证人.json] [标志]
```

示例：

```bash
simd tx staking create-validator /path/to/validator.json \
  --chain-id="name_of_chain_id" \
  --gas="auto" \
  --gas-adjustment="1.2" \
  --gas-prices="0.025stake" \
  --from=mykey
```

其中`validator.json`包含：

```json
{
  "pubkey": {"@type":"/cosmos.crypto.ed25519.PubKey","key":"BnbwFpeONLqvWqJb3qaUbL5aoIcW3fSuAp9nT3z5f20="},
  "amount": "1000000stake",
  "moniker": "my-moniker",
  "website": "https://myweb.site",
  "security": "security-contact@gmail.com",
  "details": "description of your validator",
  "commission-rate": "0.10",
  "commission-max-rate": "0.20",
  "commission-max-change-rate": "0.01",
  "min-self-delegation": "1"
}
```

pubkey可以通过使用`simd tendermint show-validator`命令获得。

##### delegate

`delegate`命令允许用户向验证人委托流动性代币。

用法：

```bash
simd tx质押委托 [验证人地址] [金额] [标志]
```

示例：

```bash
simd tx质押委托 cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm 1000stake --from mykey
```

##### edit-validator

`edit-validator`命令允许用户编辑现有的验证人账户。

用法：

```bash
simd tx staking edit-validator [flags]
```

示例：

```bash
simd tx staking edit-validator --moniker "new_moniker_name" --website "new_webiste_url" --from mykey
```

##### 重新委托

`redelegate` 命令允许用户将非流动性代币从一个验证人重新委托到另一个验证人。

用法：

```bash
simd tx staking redelegate [src-validator-addr] [dst-validator-addr] [amount] [flags]
```

示例：

```bash
simd tx staking redelegate cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm 100stake --from mykey
```

##### 解绑

`unbond` 命令允许用户从验证人解绑份额。

用法：

```bash
simd tx staking unbond [validator-addr] [amount] [flags]
```

示例：

```bash
simd tx staking unbond cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj 100stake --from mykey
```

##### 取消解绑

`cancel-unbond` 命令允许用户取消解绑委托并重新委托给原始验证人。

用法：

```bash
simd tx staking cancel-unbond [validator-addr] [amount] [creation-height]
```

示例：

```bash
simd tx staking cancel-unbond cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj 100stake 123123 --from mykey
```


### gRPC

用户可以使用 gRPC 端点查询 `staking` 模块。

#### 验证人

`Validators` 端点查询与给定状态匹配的所有验证人。

```bash
cosmos.staking.v1beta1.Query/Validators
```

示例：

```bash
grpcurl -plaintext localhost:9090 cosmos.staking.v1beta1.Query/Validators
```

示例输出：

```bash
{
  "validators": [
    {
      "operatorAddress": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
      "consensusPubkey": {"@type":"/cosmos.crypto.ed25519.PubKey","key":"Auxs3865HpB/EfssYOzfqNhEJjzys2Fo6jD5B8tPgC8="},
      "status": "BOND_STATUS_BONDED",
      "tokens": "10000000",
      "delegatorShares": "10000000000000000000000000",
      "description": {
        "moniker": "myvalidator"
      },
      "unbondingTime": "1970-01-01T00:00:00Z",
      "commission": {
        "commissionRates": {
          "rate": "100000000000000000",
          "maxRate": "200000000000000000",
          "maxChangeRate": "10000000000000000"
        },
        "updateTime": "2021-10-01T05:52:50.380144238Z"
      },
      "minSelfDelegation": "1"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### 验证人

`Validator` 端点查询给定验证人地址的验证人信息。

```bash
cosmos.staking.v1beta1.Query/Validator
```

示例：

```bash
grpcurl -plaintext -d '{"validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/Validator
```

示例输出：

```bash
{
  "validator": {
    "operatorAddress": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
    "consensusPubkey": {"@type":"/cosmos.crypto.ed25519.PubKey","key":"Auxs3865HpB/EfssYOzfqNhEJjzys2Fo6jD5B8tPgC8="},
    "status": "BOND_STATUS_BONDED",
    "tokens": "10000000",
    "delegatorShares": "10000000000000000000000000",
    "description": {
      "moniker": "myvalidator"
    },
    "unbondingTime": "1970-01-01T00:00:00Z",
    "commission": {
      "commissionRates": {
        "rate": "100000000000000000",
        "maxRate": "200000000000000000",
        "maxChangeRate": "10000000000000000"
      },
      "updateTime": "2021-10-01T05:52:50.380144238Z"
    },
    "minSelfDelegation": "1"
  }
}
```

#### 验证人委托

`ValidatorDelegations` 端点查询给定验证人的委托信息。

```bash
cosmos.staking.v1beta1.Query/ValidatorDelegations
```

示例：

```bash
grpcurl -plaintext -d '{"validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/ValidatorDelegations
```

示例输出：

```bash
{
  "delegationResponses": [
    {
      "delegation": {
        "delegatorAddress": "cosmos1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgy3ua5t",
        "validatorAddress": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
        "shares": "10000000000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "10000000"
      }
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### ValidatorUnbondingDelegations

`ValidatorUnbondingDelegations` 端点查询给定验证人的委托信息。

```bash
cosmos.staking.v1beta1.Query/ValidatorUnbondingDelegations
```

示例：

```bash
grpcurl -plaintext -d '{"validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/ValidatorUnbondingDelegations
```

示例输出：

```bash
{
  "unbonding_responses": [
    {
      "delegator_address": "cosmos1z3pzzw84d6xn00pw9dy3yapqypfde7vg6965fy",
      "validator_address": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
      "entries": [
        {
          "creation_height": "25325",
          "completion_time": "2021-10-31T09:24:36.797320636Z",
          "initial_balance": "20000000",
          "balance": "20000000"
        }
      ]
    },
    {
      "delegator_address": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77",
      "validator_address": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
      "entries": [
        {
          "creation_height": "13100",
          "completion_time": "2021-10-30T12:53:02.272266791Z",
          "initial_balance": "1000000",
          "balance": "1000000"
        }
      ]
    },
  ],
  "pagination": {
    "next_key": null,
    "total": "8"
  }
}
```

#### Delegation

`Delegation` 端点查询给定验证人和委托人对的委托信息。

```bash
cosmos.staking.v1beta1.Query/Delegation
```

示例：

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77", validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/Delegation
```

示例输出：

```bash
{
  "delegation_response":
  {
    "delegation":
      {
        "delegator_address":"cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77",
        "validator_address":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
        "shares":"25083119936.000000000000000000"
      },
    "balance":
      {
        "denom":"stake",
        "amount":"25083119936"
      }
  }
}
```

#### UnbondingDelegation

`UnbondingDelegation` 端点查询给定验证人和委托人的解绑信息。

```bash
cosmos.staking.v1beta1.Query/UnbondingDelegation
```

示例：

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77", validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/UnbondingDelegation
```

示例输出：

```bash
{
  "unbond": {
    "delegator_address": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77",
    "validator_address": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
    "entries": [
      {
        "creation_height": "136984",
        "completion_time": "2021-11-08T05:38:47.505593891Z",
        "initial_balance": "400000000",
        "balance": "400000000"
      },
      {
        "creation_height": "137005",
        "completion_time": "2021-11-08T05:40:53.526196312Z",
        "initial_balance": "385000000",
        "balance": "385000000"
      }
    ]
  }
}
```

#### DelegatorDelegations

`DelegatorDelegations` 端点查询给定委托人地址的所有委托信息。

```bash
cosmos.staking.v1beta1.Query/DelegatorDelegations
```

示例：

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77"}' \
localhost:9090 cosmos.staking.v1beta1.Query/DelegatorDelegations
```

示例输出：

```bash
{
  "delegation_responses": [
    {"delegation":{"delegator_address":"cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77","validator_address":"cosmosvaloper1eh5mwu044gd5ntkkc2xgfg8247mgc56fww3vc8","shares":"25083339023.000000000000000000"},"balance":{"denom":"stake","amount":"25083339023"}}
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### DelegatorUnbondingDelegations

`DelegatorUnbondingDelegations` 端点查询给定委托人地址的所有解绑委托信息。

```bash
cosmos.staking.v1beta1.Query/DelegatorUnbondingDelegations
```

示例：

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77"}' \
localhost:9090 cosmos.staking.v1beta1.Query/DelegatorUnbondingDelegations
```

示例输出：

```bash
{
  "unbonding_responses": [
    {
      "delegator_address": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77",
      "validator_address": "cosmosvaloper1sjllsnramtg3ewxqwwrwjxfgc4n4ef9uxyejze",
      "entries": [
        {
          "creation_height": "136984",
          "completion_time": "2021-11-08T05:38:47.505593891Z",
          "initial_balance": "400000000",
          "balance": "400000000"
        },
        {
          "creation_height": "137005",
          "completion_time": "2021-11-08T05:40:53.526196312Z",
          "initial_balance": "385000000",
          "balance": "385000000"
        }
      ]
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### Redelegations

`Redelegations` 端点查询给定地址的重新委托信息。

```bash
cosmos.staking.v1beta1.Query/Redelegations
```

示例：

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1ld5p7hn43yuh8ht28gm9pfjgj2fctujp2tgwvf", "src_validator_addr" : "cosmosvaloper1j7euyj85fv2jugejrktj540emh9353ltgppc3g", "dst_validator_addr" : "cosmosvaloper1yy3tnegzmkdcm7czzcy3flw5z0zyr9vkkxrfse"}' \
localhost:9090 cosmos.staking.v1beta1.Query/Redelegations
```

示例输出：

```bash
{
  "redelegation_responses": [
    {
      "redelegation": {
        "delegator_address": "cosmos1ld5p7hn43yuh8ht28gm9pfjgj2fctujp2tgwvf",
        "validator_src_address": "cosmosvaloper1j7euyj85fv2jugejrktj540emh9353ltgppc3g",
        "validator_dst_address": "cosmosvaloper1yy3tnegzmkdcm7czzcy3flw5z0zyr9vkkxrfse",
        "entries": null
      },
      "entries": [
        {
          "redelegation_entry": {
            "creation_height": 135932,
            "completion_time": "2021-11-08T03:52:55.299147901Z",
            "initial_balance": "2900000",
            "shares_dst": "2900000.000000000000000000"
          },
          "balance": "2900000"
        }
      ]
    }
  ],
  "pagination": null
}
```

#### DelegatorValidators

`DelegatorValidators`端点查询给定委托人的所有验证人信息。

```bash
cosmos.staking.v1beta1.Query/DelegatorValidators
```

示例：

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1ld5p7hn43yuh8ht28gm9pfjgj2fctujp2tgwvf"}' \
localhost:9090 cosmos.staking.v1beta1.Query/DelegatorValidators
```

示例输出：

```bash
{
  "validators": [
    {
      "operator_address": "cosmosvaloper1eh5mwu044gd5ntkkc2xgfg8247mgc56fww3vc8",
      "consensus_pubkey": {
        "@type": "/cosmos.crypto.ed25519.PubKey",
        "key": "UPwHWxH1zHJWGOa/m6JB3f5YjHMvPQPkVbDqqi+U7Uw="
      },
      "jailed": false,
      "status": "BOND_STATUS_BONDED",
      "tokens": "347260647559",
      "delegator_shares": "347260647559.000000000000000000",
      "description": {
        "moniker": "BouBouNode",
        "identity": "",
        "website": "https://boubounode.com",
        "security_contact": "",
        "details": "AI-based Validator. #1 AI Validator on Game of Stakes. Fairly priced. Don't trust (humans), verify. Made with BouBou love."
      },
      "unbonding_height": "0",
      "unbonding_time": "1970-01-01T00:00:00Z",
      "commission": {
        "commission_rates": {
          "rate": "0.061000000000000000",
          "max_rate": "0.300000000000000000",
          "max_change_rate": "0.150000000000000000"
        },
        "update_time": "2021-10-01T15:00:00Z"
      },
      "min_self_delegation": "1"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### DelegatorValidator

`DelegatorValidator`端点查询给定委托人验证人的信息。

```bash
cosmos.staking.v1beta1.Query/DelegatorValidator
```

示例：

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1eh5mwu044gd5ntkkc2xgfg8247mgc56f3n8rr7", "validator_addr": "cosmosvaloper1eh5mwu044gd5ntkkc2xgfg8247mgc56fww3vc8"}' \
localhost:9090 cosmos.staking.v1beta1.Query/DelegatorValidator
```

示例输出：

```bash
{
  "validator": {
    "operator_address": "cosmosvaloper1eh5mwu044gd5ntkkc2xgfg8247mgc56fww3vc8",
    "consensus_pubkey": {
      "@type": "/cosmos.crypto.ed25519.PubKey",
      "key": "UPwHWxH1zHJWGOa/m6JB3f5YjHMvPQPkVbDqqi+U7Uw="
    },
    "jailed": false,
    "status": "BOND_STATUS_BONDED",
    "tokens": "347262754841",
    "delegator_shares": "347262754841.000000000000000000",
    "description": {
      "moniker": "BouBouNode",
      "identity": "",
      "website": "https://boubounode.com",
      "security_contact": "",
      "details": "AI-based Validator. #1 AI Validator on Game of Stakes. Fairly priced. Don't trust (humans), verify. Made with BouBou love."
    },
    "unbonding_height": "0",
    "unbonding_time": "1970-01-01T00:00:00Z",
    "commission": {
      "commission_rates": {
        "rate": "0.061000000000000000",
        "max_rate": "0.300000000000000000",
        "max_change_rate": "0.150000000000000000"
      },
      "update_time": "2021-10-01T15:00:00Z"
    },
    "min_self_delegation": "1"
  }
}
```

#### HistoricalInfo

```bash
cosmos.staking.v1beta1.Query/HistoricalInfo
```

示例：

```bash
grpcurl -plaintext -d '{"height" : 1}' localhost:9090 cosmos.staking.v1beta1.Query/HistoricalInfo
```

示例输出：

```bash
{
  "hist": {
    "header": {
      "version": {
        "block": "11",
        "app": "0"
      },
      "chain_id": "simd-1",
      "height": "140142",
      "time": "2021-10-11T10:56:29.720079569Z",
      "last_block_id": {
        "hash": "9gri/4LLJUBFqioQ3NzZIP9/7YHR9QqaM6B2aJNQA7o=",
        "part_set_header": {
          "total": 1,
          "hash": "Hk1+C864uQkl9+I6Zn7IurBZBKUevqlVtU7VqaZl1tc="
        }
      },
      "last_commit_hash": "VxrcS27GtvGruS3I9+AlpT7udxIT1F0OrRklrVFSSKc=",
      "data_hash": "80BjOrqNYUOkTnmgWyz9AQ8n7SoEmPVi4QmAe8RbQBY=",
      "validators_hash": "95W49n2hw8RWpr1GPTAO5MSPi6w6Wjr3JjjS7AjpBho=",
      "next_validators_hash": "95W49n2hw8RWpr1GPTAO5MSPi6w6Wjr3JjjS7AjpBho=",
      "consensus_hash": "BICRvH3cKD93v7+R1zxE2ljD34qcvIZ0Bdi389qtoi8=",
      "app_hash": "ZZaxnSY3E6Ex5Bvkm+RigYCK82g8SSUL53NymPITeOE=",
      "last_results_hash": "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      "evidence_hash": "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      "proposer_address": "aH6dO428B+ItuoqPq70efFHrSMY="
    },
  "valset": [
      {
        "operator_address": "cosmosvaloper196ax4vc0lwpxndu9dyhvca7jhxp70rmcqcnylw",
        "consensus_pubkey": {
          "@type": "/cosmos.crypto.ed25519.PubKey",
          "key": "/O7BtNW0pafwfvomgR4ZnfldwPXiFfJs9mHg3gwfv5Q="
        },
        "jailed": false,
        "status": "BOND_STATUS_BONDED",
        "tokens": "1426045203613",
        "delegator_shares": "1426045203613.000000000000000000",
        "description": {
          "moniker": "SG-1",
          "identity": "48608633F99D1B60",
          "website": "https://sg-1.online",
          "security_contact": "",
          "details": "SG-1 - your favorite validator on Witval. We offer 100% Soft Slash protection."
        },
        "unbonding_height": "0",
        "unbonding_time": "1970-01-01T00:00:00Z",
        "commission": {
          "commission_rates": {
            "rate": "0.037500000000000000",
            "max_rate": "0.200000000000000000",
            "max_change_rate": "0.030000000000000000"
          },
          "update_time": "2021-10-01T15:00:00Z"
        },
        "min_self_delegation": "1"
      }
    ]
  }
}

```

#### Pool

`Pool`端点查询池的信息。

```bash
cosmos.staking.v1beta1.Query/Pool
```

示例：

```bash
grpcurl -plaintext -d localhost:9090 cosmos.staking.v1beta1.Query/Pool
```

示例输出：

```bash
{
  "pool": {
    "not_bonded_tokens": "369054400189",
    "bonded_tokens": "15657192425623"
  }
}
```

#### Params

`Params`端点查询池的信息。

```bash
cosmos.staking.v1beta1.Query/Params
```

示例：

```bash
grpcurl -plaintext localhost:9090 cosmos.staking.v1beta1.Query/Params
```

示例输出：

```bash
{
  "params": {
    "unbondingTime": "1814400s",
    "maxValidators": 100,
    "maxEntries": 7,
    "historicalEntries": 10000,
    "bondDenom": "stake"
  }
}
```

### REST

用户可以使用REST端点查询`staking`模块。

#### DelegatorDelegations

`DelegatorDelegations` REST端点查询给定委托人地址的所有委托。

```bash
/cosmos/staking/v1beta1/delegations/{delegatorAddr}
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/delegations/cosmos1vcs68xf2tnqes5tg0khr0vyevm40ff6zdxatp5" -H  "accept: application/json"
```

示例输出：

```bash
{
  "delegation_responses": [
    {
      "delegation": {
        "delegator_address": "cosmos1vcs68xf2tnqes5tg0khr0vyevm40ff6zdxatp5",
        "validator_address": "cosmosvaloper1quqxfrxkycr0uzt4yk0d57tcq3zk7srm7sm6r8",
        "shares": "256250000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "256250000"
      }
    },
    {
      "delegation": {
        "delegator_address": "cosmos1vcs68xf2tnqes5tg0khr0vyevm40ff6zdxatp5",
        "validator_address": "cosmosvaloper194v8uwee2fvs2s8fa5k7j03ktwc87h5ym39jfv",
        "shares": "255150000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "255150000"
      }
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### Redelegations

`Redelegations` REST端点查询给定地址的再委托。

```bash
/cosmos/staking/v1beta1/delegators/{delegatorAddr}/redelegations
```

示例：

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/delegators/cosmos1thfntksw0d35n2tkr0k8v54fr8wxtxwxl2c56e/redelegations?srcValidatorAddr=cosmosvaloper1lzhlnpahvznwfv4jmay2tgaha5kmz5qx4cuznf&dstValidatorAddr=cosmosvaloper1vq8tw77kp8lvxq9u3c8eeln9zymn68rng8pgt4" \
-H  "accept: application/json"
```

示例输出：

```bash
{
  "redelegation_responses": [
    {
      "redelegation": {
        "delegator_address": "cosmos1thfntksw0d35n2tkr0k8v54fr8wxtxwxl2c56e",
        "validator_src_address": "cosmosvaloper1lzhlnpahvznwfv4jmay2tgaha5kmz5qx4cuznf",
        "validator_dst_address": "cosmosvaloper1vq8tw77kp8lvxq9u3c8eeln9zymn68rng8pgt4",
        "entries": null
      },
      "entries": [
        {
          "redelegation_entry": {
            "creation_height": 151523,
            "completion_time": "2021-11-09T06:03:25.640682116Z",
            "initial_balance": "200000000",
            "shares_dst": "200000000.000000000000000000"
          },
          "balance": "200000000"
        }
      ]
    }
  ],
  "pagination": null
}
```

#### DelegatorUnbondingDelegations

`DelegatorUnbondingDelegations` REST端点查询给定委托人地址的所有解委托。

```bash
/cosmos/staking/v1beta1/delegators/{delegatorAddr}/unbonding_delegations
```

示例：

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/delegators/cosmos1nxv42u3lv642q0fuzu2qmrku27zgut3n3z7lll/unbonding_delegations" \
-H  "accept: application/json"
```

示例输出：

```bash
{
  "unbonding_responses": [
    {
      "delegator_address": "cosmos1nxv42u3lv642q0fuzu2qmrku27zgut3n3z7lll",
      "validator_address": "cosmosvaloper1e7mvqlz50ch6gw4yjfemsc069wfre4qwmw53kq",
      "entries": [
        {
          "creation_height": "2442278",
          "completion_time": "2021-10-12T10:59:03.797335857Z",
          "initial_balance": "50000000000",
          "balance": "50000000000"
        }
      ]
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### DelegatorValidators

`DelegatorValidators` REST端点查询给定委托人地址的所有验证人信息。

```bash
/cosmos/staking/v1beta1/delegators/{delegatorAddr}/validators
```

示例：

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/delegators/cosmos1xwazl8ftks4gn00y5x3c47auquc62ssune9ppv/validators" \
-H  "accept: application/json"
```

示例输出：

```bash
{
  "validators": [
    {
      "operator_address": "cosmosvaloper1xwazl8ftks4gn00y5x3c47auquc62ssuvynw64",
      "consensus_pubkey": {
        "@type": "/cosmos.crypto.ed25519.PubKey",
        "key": "5v4n3px3PkfNnKflSgepDnsMQR1hiNXnqOC11Y72/PQ="
      },
      "jailed": false,
      "status": "BOND_STATUS_BONDED",
      "tokens": "21592843799",
      "delegator_shares": "21592843799.000000000000000000",
      "description": {
        "moniker": "jabbey",
        "identity": "",
        "website": "https://twitter.com/JoeAbbey",
        "security_contact": "",
        "details": "just another dad in the cosmos"
      },
      "unbonding_height": "0",
      "unbonding_time": "1970-01-01T00:00:00Z",
      "commission": {
        "commission_rates": {
          "rate": "0.100000000000000000",
          "max_rate": "0.200000000000000000",
          "max_change_rate": "0.100000000000000000"
        },
        "update_time": "2021-10-09T19:03:54.984821705Z"
      },
      "min_self_delegation": "1"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### DelegatorValidator

`DelegatorValidator` REST端点查询给定委托人验证人对的验证人信息。

```bash
/cosmos/staking/v1beta1/delegators/{delegatorAddr}/validators/{validatorAddr}
```

示例：

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/delegators/cosmos1xwazl8ftks4gn00y5x3c47auquc62ssune9ppv/validators/cosmosvaloper1xwazl8ftks4gn00y5x3c47auquc62ssuvynw64" \
-H  "accept: application/json"
```

示例输出：

```bash
{
  "validator": {
    "operator_address": "cosmosvaloper1xwazl8ftks4gn00y5x3c47auquc62ssuvynw64",
    "consensus_pubkey": {
      "@type": "/cosmos.crypto.ed25519.PubKey",
      "key": "5v4n3px3PkfNnKflSgepDnsMQR1hiNXnqOC11Y72/PQ="
    },
    "jailed": false,
    "status": "BOND_STATUS_BONDED",
    "tokens": "21592843799",
    "delegator_shares": "21592843799.000000000000000000",
    "description": {
      "moniker": "jabbey",
      "identity": "",
      "website": "https://twitter.com/JoeAbbey",
      "security_contact": "",
      "details": "just another dad in the cosmos"
    },
    "unbonding_height": "0",
    "unbonding_time": "1970-01-01T00:00:00Z",
    "commission": {
      "commission_rates": {
        "rate": "0.100000000000000000",
        "max_rate": "0.200000000000000000",
        "max_change_rate": "0.100000000000000000"
      },
      "update_time": "2021-10-09T19:03:54.984821705Z"
    },
    "min_self_delegation": "1"
  }
}
```

#### HistoricalInfo

`HistoricalInfo` REST端点查询给定高度的历史信息。

```bash
/cosmos/staking/v1beta1/historical_info/{height}
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/historical_info/153332" -H  "accept: application/json"
```

示例输出：

```bash
{
  "hist": {
    "header": {
      "version": {
        "block": "11",
        "app": "0"
      },
      "chain_id": "cosmos-1",
      "height": "153332",
      "time": "2021-10-12T09:05:35.062230221Z",
      "last_block_id": {
        "hash": "NX8HevR5khb7H6NGKva+jVz7cyf0skF1CrcY9A0s+d8=",
        "part_set_header": {
          "total": 1,
          "hash": "zLQ2FiKM5tooL3BInt+VVfgzjlBXfq0Hc8Iux/xrhdg="
        }
      },
      "last_commit_hash": "P6IJrK8vSqU3dGEyRHnAFocoDGja0bn9euLuy09s350=",
      "data_hash": "eUd+6acHWrNXYju8Js449RJ99lOYOs16KpqQl4SMrEM=",
      "validators_hash": "mB4pravvMsJKgi+g8aYdSeNlt0kPjnRFyvtAQtaxcfw=",
      "next_validators_hash": "mB4pravvMsJKgi+g8aYdSeNlt0kPjnRFyvtAQtaxcfw=",
      "consensus_hash": "BICRvH3cKD93v7+R1zxE2ljD34qcvIZ0Bdi389qtoi8=",
      "app_hash": "fuELArKRK+CptnZ8tu54h6xEleSWenHNmqC84W866fU=",
      "last_results_hash": "p/BPexV4LxAzlVcPRvW+lomgXb6Yze8YLIQUo/4Kdgc=",
      "evidence_hash": "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      "proposer_address": "G0MeY8xQx7ooOsni8KE/3R/Ib3Q="
    },
    "valset": [
      {
        "operator_address": "cosmosvaloper196ax4vc0lwpxndu9dyhvca7jhxp70rmcqcnylw",
        "consensus_pubkey": {
          "@type": "/cosmos.crypto.ed25519.PubKey",
          "key": "/O7BtNW0pafwfvomgR4ZnfldwPXiFfJs9mHg3gwfv5Q="
        },
        "jailed": false,
        "status": "BOND_STATUS_BONDED",
        "tokens": "1416521659632",
        "delegator_shares": "1416521659632.000000000000000000",
        "description": {
          "moniker": "SG-1",
          "identity": "48608633F99D1B60",
          "website": "https://sg-1.online",
          "security_contact": "",
          "details": "SG-1 - your favorite validator on cosmos. We offer 100% Soft Slash protection."
        },
        "unbonding_height": "0",
        "unbonding_time": "1970-01-01T00:00:00Z",
        "commission": {
          "commission_rates": {
            "rate": "0.037500000000000000",
            "max_rate": "0.200000000000000000",
            "max_change_rate": "0.030000000000000000"
          },
          "update_time": "2021-10-01T15:00:00Z"
        },
        "min_self_delegation": "1"
      },
      {
        "operator_address": "cosmosvaloper1t8ehvswxjfn3ejzkjtntcyrqwvmvuknzmvtaaa",
        "consensus_pubkey": {
          "@type": "/cosmos.crypto.ed25519.PubKey",
          "key": "uExZyjNLtr2+FFIhNDAMcQ8+yTrqE7ygYTsI7khkA5Y="
        },
        "jailed": false,
        "status": "BOND_STATUS_BONDED",
        "tokens": "1348298958808",
        "delegator_shares": "1348298958808.000000000000000000",
        "description": {
          "moniker": "Cosmostation",
          "identity": "AE4C403A6E7AA1AC",
          "website": "https://www.cosmostation.io",
          "security_contact": "admin@stamper.network",
          "details": "Cosmostation validator node. Delegate your tokens and Start Earning Staking Rewards"
        },
        "unbonding_height": "0",
        "unbonding_time": "1970-01-01T00:00:00Z",
        "commission": {
          "commission_rates": {
            "rate": "0.050000000000000000",
            "max_rate": "1.000000000000000000",
            "max_change_rate": "0.200000000000000000"
          },
          "update_time": "2021-10-01T15:06:38.821314287Z"
        },
        "min_self_delegation": "1"
      }
    ]
  }
}
```

#### Parameters

`Parameters` REST端点查询质押参数。

```bash
/cosmos/staking/v1beta1/params
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/params" -H  "accept: application/json"
```

示例输出：

```bash
{
  "params": {
    "unbonding_time": "2419200s",
    "max_validators": 100,
    "max_entries": 7,
    "historical_entries": 10000,
    "bond_denom": "stake"
  }
}
```

#### Pool

`Pool` REST端点查询池信息。

```bash
/cosmos/staking/v1beta1/pool
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/pool" -H  "accept: application/json"
```

示例输出：

```bash
{
  "pool": {
    "not_bonded_tokens": "432805737458",
    "bonded_tokens": "15783637712645"
  }
}
```

#### Validators

`Validators` REST端点查询与给定状态匹配的所有验证人。

```bash
/cosmos/staking/v1beta1/validators
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/validators" -H  "accept: application/json"
```

#### 验证器

`Validator` REST端点查询给定验证器地址的验证器信息。

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}
```

示例：

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q" \
-H  "accept: application/json"
```

#### 验证器委托

`ValidatorDelegations` REST端点查询给定验证器的委托信息。

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}/delegations
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q/delegations" -H  "accept: application/json"
```

#### 委托

`Delegation` REST端点查询给定验证器和委托人地址的委托信息。

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}/delegations/{delegatorAddr}
```

示例：

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q/delegations/cosmos1n8f5fknsv2yt7a8u6nrx30zqy7lu9jfm0t5lq8" \
-H  "accept: application/json"
```

#### 解绑委托

`UnbondingDelegation` REST端点查询给定验证器和委托人地址的解绑委托信息。

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}/delegations/{delegatorAddr}/unbonding_delegation
```

示例：

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper13v4spsah85ps4vtrw07vzea37gq5la5gktlkeu/delegations/cosmos1ze2ye5u5k3qdlexvt2e0nn0508p04094ya0qpm/unbonding_delegation" \
-H  "accept: application/json"
```

#### 验证器解绑委托

`ValidatorUnbondingDelegations` REST端点查询给定验证器的解绑委托信息。

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}/unbonding_delegations
```

示例：

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper13v4spsah85ps4vtrw07vzea37gq5la5gktlkeu/unbonding_delegations" \
-H  "accept: application/json"
```




# `x/staking`

## Abstract

This paper specifies the Staking module of the Cosmos SDK that was first
described in the [Cosmos Whitepaper](https://cosmos.network/about/whitepaper)
in June 2016.

The module enables Cosmos SDK-based blockchain to support an advanced
Proof-of-Stake (PoS) system. In this system, holders of the native staking token of
the chain can become validators and can delegate tokens to validators,
ultimately determining the effective validator set for the system.

This module is used in the Cosmos Hub, the first Hub in the Cosmos
network.

## Contents

* [State](#state)
    * [Pool](#pool)
    * [LastTotalPower](#lasttotalpower)
    * [ValidatorUpdates](#validatorupdates)
    * [UnbondingID](#unbondingid)
    * [Params](#params)
    * [Validator](#validator)
    * [Delegation](#delegation)
    * [UnbondingDelegation](#unbondingdelegation)
    * [Redelegation](#redelegation)
    * [Queues](#queues)
    * [HistoricalInfo](#historicalinfo)
* [State Transitions](#state-transitions)
    * [Validators](#validators)
    * [Delegations](#delegations)
    * [Slashing](#slashing)
    * [How Shares are calculated](#how-shares-are-calculated)
* [Messages](#messages)
    * [MsgCreateValidator](#msgcreatevalidator)
    * [MsgEditValidator](#msgeditvalidator)
    * [MsgDelegate](#msgdelegate)
    * [MsgUndelegate](#msgundelegate)
    * [MsgCancelUnbondingDelegation](#msgcancelunbondingdelegation)
    * [MsgBeginRedelegate](#msgbeginredelegate)
    * [MsgUpdateParams](#msgupdateparams)
* [Begin-Block](#begin-block)
    * [Historical Info Tracking](#historical-info-tracking)
* [End-Block](#end-block)
    * [Validator Set Changes](#validator-set-changes)
    * [Queues](#queues-1)
* [Hooks](#hooks)
* [Events](#events)
    * [EndBlocker](#endblocker)
    * [Msg's](#msgs)
* [Parameters](#parameters)
* [Client](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)

## State

### Pool

Pool is used for tracking bonded and not-bonded token supply of the bond denomination.

### LastTotalPower

LastTotalPower tracks the total amounts of bonded tokens recorded during the previous end block.
Store entries prefixed with "Last" must remain unchanged until EndBlock.

* LastTotalPower: `0x12 -> ProtocolBuffer(math.Int)`

### ValidatorUpdates

ValidatorUpdates contains the validator updates returned to ABCI at the end of every block. 
The values are overwritten in every block. 

* ValidatorUpdates `0x61 -> []abci.ValidatorUpdate`

### UnbondingID

UnbondingID stores the ID of the latest unbonding operation. It enables to create unique IDs for unbonding operation, i.e., UnbondingID is incremented every time a new unbonding operation (validator unbonding, unbonding delegation, redelegation) is initiated.

* UnbondingID: `0x37 -> uint64`

### Params

The staking module stores its params in state with the prefix of `0x51`,
it can be updated with governance or the address with authority.

* Params: `0x51 | ProtocolBuffer(Params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L310-L333
```

### Validator

Validators can have one of three statuses

* `Unbonded`: The validator is not in the active set. They cannot sign blocks and do not earn
  rewards. They can receive delegations.
* `Bonded`: Once the validator receives sufficient bonded tokens they automatically join the
  active set during [`EndBlock`](#validator-set-changes) and their status is updated to `Bonded`.
  They are signing blocks and receiving rewards. They can receive further delegations.
  They can be slashed for misbehavior. Delegators to this validator who unbond their delegation
  must wait the duration of the UnbondingTime, a chain-specific param, during which time
  they are still slashable for offences of the source validator if those offences were committed
  during the period of time that the tokens were bonded.
* `Unbonding`: When a validator leaves the active set, either by choice or due to slashing, jailing or
  tombstoning, an unbonding of all their delegations begins. All delegations must then wait the UnbondingTime
  before their tokens are moved to their accounts from the `BondedPool`.

:::warning
Tombstoning is permanent, once tombstoned a validators consensus key can not be reused within the chain where the tombstoning happened. 
:::

Validators objects should be primarily stored and accessed by the
`OperatorAddr`, an SDK validator address for the operator of the validator. Two
additional indices are maintained per validator object in order to fulfill
required lookups for slashing and validator-set updates. A third special index
(`LastValidatorPower`) is also maintained which however remains constant
throughout each block, unlike the first two indices which mirror the validator
records within a block.

* Validators: `0x21 | OperatorAddrLen (1 byte) | OperatorAddr -> ProtocolBuffer(validator)`
* ValidatorsByConsAddr: `0x22 | ConsAddrLen (1 byte) | ConsAddr -> OperatorAddr`
* ValidatorsByPower: `0x23 | BigEndian(ConsensusPower) | OperatorAddrLen (1 byte) | OperatorAddr -> OperatorAddr`
* LastValidatorsPower: `0x11 | OperatorAddrLen (1 byte) | OperatorAddr -> ProtocolBuffer(ConsensusPower)`
* ValidatorsByUnbondingID: `0x38 | UnbondingID ->  0x21 | OperatorAddrLen (1 byte) | OperatorAddr`

`Validators` is the primary index - it ensures that each operator can have only one
associated validator, where the public key of that validator can change in the
future. Delegators can refer to the immutable operator of the validator, without
concern for the changing public key.

`ValidatorsByUnbondingID` is an additional index that enables lookups for 
 validators by the unbonding IDs corresponding to their current unbonding.

`ValidatorByConsAddr` is an additional index that enables lookups for slashing.
When CometBFT reports evidence, it provides the validator address, so this
map is needed to find the operator. Note that the `ConsAddr` corresponds to the
address which can be derived from the validator's `ConsPubKey`.

`ValidatorsByPower` is an additional index that provides a sorted list of
potential validators to quickly determine the current active set. Here
ConsensusPower is validator.Tokens/10^6 by default. Note that all validators
where `Jailed` is true are not stored within this index.

`LastValidatorsPower` is a special index that provides a historical list of the
last-block's bonded validators. This index remains constant during a block but
is updated during the validator set update process which takes place in [`EndBlock`](#end-block).

Each validator's state is stored in a `Validator` struct:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L82-L138
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L26-L80
```

### Delegation

Delegations are identified by combining `DelegatorAddr` (the address of the delegator)
with the `ValidatorAddr` Delegators are indexed in the store as follows:

* Delegation: `0x31 | DelegatorAddrLen (1 byte) | DelegatorAddr | ValidatorAddrLen (1 byte) | ValidatorAddr -> ProtocolBuffer(delegation)`

Stake holders may delegate coins to validators; under this circumstance their
funds are held in a `Delegation` data structure. It is owned by one
delegator, and is associated with the shares for one validator. The sender of
the transaction is the owner of the bond.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L198-L216
```

#### Delegator Shares

When one Delegates tokens to a Validator they are issued a number of delegator shares based on a
dynamic exchange rate, calculated as follows from the total number of tokens delegated to the
validator and the number of shares issued so far:

`Shares per Token = validator.TotalShares() / validator.Tokens()`

Only the number of shares received is stored on the DelegationEntry. When a delegator then
Undelegates, the token amount they receive is calculated from the number of shares they currently
hold and the inverse exchange rate:

`Tokens per Share = validator.Tokens() / validatorShares()`

These `Shares` are simply an accounting mechanism. They are not a fungible asset. The reason for
this mechanism is to simplify the accounting around slashing. Rather than iteratively slashing the
tokens of every delegation entry, instead the Validators total bonded tokens can be slashed,
effectively reducing the value of each issued delegator share.

### UnbondingDelegation

Shares in a `Delegation` can be unbonded, but they must for some time exist as
an `UnbondingDelegation`, where shares can be reduced if Byzantine behavior is
detected.

`UnbondingDelegation` are indexed in the store as:

* UnbondingDelegation: `0x32 | DelegatorAddrLen (1 byte) | DelegatorAddr | ValidatorAddrLen (1 byte) | ValidatorAddr -> ProtocolBuffer(unbondingDelegation)`
* UnbondingDelegationsFromValidator: `0x33 | ValidatorAddrLen (1 byte) | ValidatorAddr | DelegatorAddrLen (1 byte) | DelegatorAddr -> nil`
* UnbondingDelegationByUnbondingId: `0x38 | UnbondingId -> 0x32 | DelegatorAddrLen (1 byte) | DelegatorAddr | ValidatorAddrLen (1 byte) | ValidatorAddr`
 `UnbondingDelegation` is used in queries, to lookup all unbonding delegations for
 a given delegator.

`UnbondingDelegationsFromValidator` is used in slashing, to lookup all
 unbonding delegations associated with a given validator that need to be
 slashed.

 `UnbondingDelegationByUnbondingId` is an additional index that enables 
 lookups for unbonding delegations by the unbonding IDs of the containing 
 unbonding delegation entries.


A UnbondingDelegation object is created every time an unbonding is initiated.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L218-L261
```

### Redelegation

The bonded tokens worth of a `Delegation` may be instantly redelegated from a
source validator to a different validator (destination validator). However when
this occurs they must be tracked in a `Redelegation` object, whereby their
shares can be slashed if their tokens have contributed to a Byzantine fault
committed by the source validator.

`Redelegation` are indexed in the store as:

* Redelegations: `0x34 | DelegatorAddrLen (1 byte) | DelegatorAddr | ValidatorAddrLen (1 byte) | ValidatorSrcAddr | ValidatorDstAddr -> ProtocolBuffer(redelegation)`
* RedelegationsBySrc: `0x35 | ValidatorSrcAddrLen (1 byte) | ValidatorSrcAddr | ValidatorDstAddrLen (1 byte) | ValidatorDstAddr | DelegatorAddrLen (1 byte) | DelegatorAddr -> nil`
* RedelegationsByDst: `0x36 | ValidatorDstAddrLen (1 byte) | ValidatorDstAddr | ValidatorSrcAddrLen (1 byte) | ValidatorSrcAddr | DelegatorAddrLen (1 byte) | DelegatorAddr -> nil`
* RedelegationByUnbondingId: `0x38 | UnbondingId -> 0x34 | DelegatorAddrLen (1 byte) | DelegatorAddr | ValidatorAddrLen (1 byte) | ValidatorSrcAddr | ValidatorDstAddr`

 `Redelegations` is used for queries, to lookup all redelegations for a given
 delegator.

 `RedelegationsBySrc` is used for slashing based on the `ValidatorSrcAddr`.

 `RedelegationsByDst` is used for slashing based on the `ValidatorDstAddr`

The first map here is used for queries, to lookup all redelegations for a given
delegator. The second map is used for slashing based on the `ValidatorSrcAddr`,
while the third map is for slashing based on the `ValidatorDstAddr`.

`RedelegationByUnbondingId` is an additional index that enables 
 lookups for redelegations by the unbonding IDs of the containing 
 redelegation entries.

A redelegation object is created every time a redelegation occurs. To prevent
"redelegation hopping" redelegations may not occur under the situation that:

* the (re)delegator already has another immature redelegation in progress
  with a destination to a validator (let's call it `Validator X`)
* and, the (re)delegator is attempting to create a _new_ redelegation
  where the source validator for this new redelegation is `Validator X`.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L263-L308
```

### Queues

All queues objects are sorted by timestamp. The time used within any queue is
first rounded to the nearest nanosecond then sorted. The sortable time format
used is a slight modification of the RFC3339Nano and uses the format string
`"2006-01-02T15:04:05.000000000"`. Notably this format:

* right pads all zeros
* drops the time zone info (uses UTC)

In all cases, the stored timestamp represents the maturation time of the queue
element.

#### UnbondingDelegationQueue

For the purpose of tracking progress of unbonding delegations the unbonding
delegations queue is kept.

* UnbondingDelegation: `0x41 | format(time) -> []DVPair`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L162-L172
```

#### RedelegationQueue

For the purpose of tracking progress of redelegations the redelegation queue is
kept.

* RedelegationQueue: `0x42 | format(time) -> []DVVTriplet`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L179-L191
```

#### ValidatorQueue

For the purpose of tracking progress of unbonding validators the validator
queue is kept.

* ValidatorQueueTime: `0x43 | format(time) -> []sdk.ValAddress`

The stored object as each key is an array of validator operator addresses from
which the validator object can be accessed. Typically it is expected that only
a single validator record will be associated with a given timestamp however it is possible
that multiple validators exist in the queue at the same location.

### HistoricalInfo

HistoricalInfo objects are stored and pruned at each block such that the staking keeper persists
the `n` most recent historical info defined by staking module parameter: `HistoricalEntries`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/staking.proto#L17-L24
```

At each BeginBlock, the staking keeper will persist the current Header and the Validators that committed
the current block in a `HistoricalInfo` object. The Validators are sorted on their address to ensure that
they are in a deterministic order.
The oldest HistoricalEntries will be pruned to ensure that there only exist the parameter-defined number of
historical entries.

## State Transitions

### Validators

State transitions in validators are performed on every [`EndBlock`](#validator-set-changes)
in order to check for changes in the active `ValidatorSet`.

A validator can be `Unbonded`, `Unbonding` or `Bonded`. `Unbonded`
and `Unbonding` are collectively called `Not Bonded`. A validator can move
directly between all the states, except for from `Bonded` to `Unbonded`.

#### Not bonded to Bonded

The following transition occurs when a validator's ranking in the `ValidatorPowerIndex` surpasses
that of the `LastValidator`.

* set `validator.Status` to `Bonded`
* send the `validator.Tokens` from the `NotBondedTokens` to the `BondedPool` `ModuleAccount`
* delete the existing record from `ValidatorByPowerIndex`
* add a new updated record to the `ValidatorByPowerIndex`
* update the `Validator` object for this validator
* if it exists, delete any `ValidatorQueue` record for this validator

#### Bonded to Unbonding

When a validator begins the unbonding process the following operations occur:

* send the `validator.Tokens` from the `BondedPool` to the `NotBondedTokens` `ModuleAccount`
* set `validator.Status` to `Unbonding`
* delete the existing record from `ValidatorByPowerIndex`
* add a new updated record to the `ValidatorByPowerIndex`
* update the `Validator` object for this validator
* insert a new record into the `ValidatorQueue` for this validator

#### Unbonding to Unbonded

A validator moves from unbonding to unbonded when the `ValidatorQueue` object
moves from bonded to unbonded

* update the `Validator` object for this validator
* set `validator.Status` to `Unbonded`

#### Jail/Unjail

when a validator is jailed it is effectively removed from the CometBFT set.
this process may be also be reversed. the following operations occur:

* set `Validator.Jailed` and update object
* if jailed delete record from `ValidatorByPowerIndex`
* if unjailed add record to `ValidatorByPowerIndex`

Jailed validators are not present in any of the following stores:

* the power store (from consensus power to address)

### Delegations

#### Delegate

When a delegation occurs both the validator and the delegation objects are affected

* determine the delegators shares based on tokens delegated and the validator's exchange rate
* remove tokens from the sending account
* add shares the delegation object or add them to a created validator object
* add new delegator shares and update the `Validator` object
* transfer the `delegation.Amount` from the delegator's account to the `BondedPool` or the `NotBondedPool` `ModuleAccount` depending if the `validator.Status` is `Bonded` or not
* delete the existing record from `ValidatorByPowerIndex`
* add an new updated record to the `ValidatorByPowerIndex`

#### Begin Unbonding

As a part of the Undelegate and Complete Unbonding state transitions Unbond
Delegation may be called.

* subtract the unbonded shares from delegator
* add the unbonded tokens to an `UnbondingDelegationEntry`
* update the delegation or remove the delegation if there are no more shares
* if the delegation is the operator of the validator and no more shares exist then trigger a jail validator
* update the validator with removed the delegator shares and associated coins
* if the validator state is `Bonded`, transfer the `Coins` worth of the unbonded
  shares from the `BondedPool` to the `NotBondedPool` `ModuleAccount`
* remove the validator if it is unbonded and there are no more delegation shares.
* remove the validator if it is unbonded and there are no more delegation shares
* get a unique `unbondingId` and map it to the `UnbondingDelegationEntry` in `UnbondingDelegationByUnbondingId` 
* call the `AfterUnbondingInitiated(unbondingId)` hook
* add the unbonding delegation to `UnbondingDelegationQueue` with the completion time set to `UnbondingTime`

#### Cancel an `UnbondingDelegation` Entry 

When a `cancel unbond delegation` occurs both the `validator`, the `delegation` and an `UnbondingDelegationQueue` state will be updated.

* if cancel unbonding delegation amount equals to the `UnbondingDelegation` entry `balance`, then the `UnbondingDelegation` entry deleted from `UnbondingDelegationQueue`.
* if the `cancel unbonding delegation amount is less than the `UnbondingDelegation` entry balance, then the `UnbondingDelegation` entry will be updated with new balance in the `UnbondingDelegationQueue`. 
* cancel `amount` is [Delegated](#delegations) back to  the original `validator`.

#### Complete Unbonding

For undelegations which do not complete immediately, the following operations
occur when the unbonding delegation queue element matures:

* remove the entry from the `UnbondingDelegation` object
* transfer the tokens from the `NotBondedPool` `ModuleAccount` to the delegator `Account`

#### Begin Redelegation

Redelegations affect the delegation, source and destination validators.

* perform an `unbond` delegation from the source validator to retrieve the tokens worth of the unbonded shares
* using the unbonded tokens, `Delegate` them to the destination validator
* if the `sourceValidator.Status` is `Bonded`, and the `destinationValidator` is not,
  transfer the newly delegated tokens from the `BondedPool` to the `NotBondedPool` `ModuleAccount`
* otherwise, if the `sourceValidator.Status` is not `Bonded`, and the `destinationValidator`
  is `Bonded`, transfer the newly delegated tokens from the `NotBondedPool` to the `BondedPool` `ModuleAccount`
* record the token amount in an new entry in the relevant `Redelegation`

From when a redelegation begins until it completes, the delegator is in a state of "pseudo-unbonding", and can still be
slashed for infractions that occurred before the redelegation began.

#### Complete Redelegation

When a redelegations complete the following occurs:

* remove the entry from the `Redelegation` object

### Slashing

#### Slash Validator

When a Validator is slashed, the following occurs:

* The total `slashAmount` is calculated as the `slashFactor` (a chain parameter) \* `TokensFromConsensusPower`,
  the total number of tokens bonded to the validator at the time of the infraction.
* Every unbonding delegation and pseudo-unbonding redelegation such that the infraction occured before the unbonding or
  redelegation began from the validator are slashed by the `slashFactor` percentage of the initialBalance.
* Each amount slashed from redelegations and unbonding delegations is subtracted from the
  total slash amount.
* The `remaingSlashAmount` is then slashed from the validator's tokens in the `BondedPool` or
  `NonBondedPool` depending on the validator's status. This reduces the total supply of tokens.

In the case of a slash due to any infraction that requires evidence to submitted (for example double-sign), the slash
occurs at the block where the evidence is included, not at the block where the infraction occured.
Put otherwise, validators are not slashed retroactively, only when they are caught.

#### Slash Unbonding Delegation

When a validator is slashed, so are those unbonding delegations from the validator that began unbonding
after the time of the infraction. Every entry in every unbonding delegation from the validator
is slashed by `slashFactor`. The amount slashed is calculated from the `InitialBalance` of the
delegation and is capped to prevent a resulting negative balance. Completed (or mature) unbondings are not slashed.

#### Slash Redelegation

When a validator is slashed, so are all redelegations from the validator that began after the
infraction. Redelegations are slashed by `slashFactor`.
Redelegations that began before the infraction are not slashed.
The amount slashed is calculated from the `InitialBalance` of the delegation and is capped to
prevent a resulting negative balance.
Mature redelegations (that have completed pseudo-unbonding) are not slashed.

### How Shares are calculated

At any given point in time, each validator has a number of tokens, `T`, and has a number of shares issued, `S`.
Each delegator, `i`, holds a number of shares, `S_i`.
The number of tokens is the sum of all tokens delegated to the validator, plus the rewards, minus the slashes.

The delegator is entitled to a portion of the underlying tokens proportional to their proportion of shares.
So delegator `i` is entitled to `T * S_i / S` of the validator's tokens.

When a delegator delegates new tokens to the validator, they receive a number of shares proportional to their contribution.
So when delegator `j` delegates `T_j` tokens, they receive `S_j = S * T_j / T` shares.
The total number of tokens is now `T + T_j`, and the total number of shares is `S + S_j`.
`j`s proportion of the shares is the same as their proportion of the total tokens contributed: `(S + S_j) / S = (T + T_j) / T`.

A special case is the initial delegation, when `T = 0` and `S = 0`, so `T_j / T` is undefined.
For the initial delegation, delegator `j` who delegates `T_j` tokens receive `S_j = T_j` shares.
So a validator that hasn't received any rewards and has not been slashed will have `T = S`.

## Messages

In this section we describe the processing of the staking messages and the corresponding updates to the state. All created/modified state objects specified by each message are defined within the [state](#state) section.

### MsgCreateValidator

A validator is created using the `MsgCreateValidator` message.
The validator must be created with an initial delegation from the operator.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L20-L21
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L50-L73
```

This message is expected to fail if:

* another validator with this operator address is already registered
* another validator with this pubkey is already registered
* the initial self-delegation tokens are of a denom not specified as the bonding denom
* the commission parameters are faulty, namely:
    * `MaxRate` is either > 1 or < 0
    * the initial `Rate` is either negative or > `MaxRate`
    * the initial `MaxChangeRate` is either negative or > `MaxRate`
* the description fields are too large

This message creates and stores the `Validator` object at appropriate indexes.
Additionally a self-delegation is made with the initial tokens delegation
tokens `Delegation`. The validator always starts as unbonded but may be bonded
in the first end-block.

### MsgEditValidator

The `Description`, `CommissionRate` of a validator can be updated using the
`MsgEditValidator` message.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L23-L24
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L78-L97
```

This message is expected to fail if:

* the initial `CommissionRate` is either negative or > `MaxRate`
* the `CommissionRate` has already been updated within the previous 24 hours
* the `CommissionRate` is > `MaxChangeRate`
* the description fields are too large

This message stores the updated `Validator` object.

### MsgDelegate

Within this message the delegator provides coins, and in return receives
some amount of their validator's (newly created) delegator-shares that are
assigned to `Delegation.Shares`.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L26-L28
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L102-L114
```

This message is expected to fail if:

* the validator does not exist
* the `Amount` `Coin` has a denomination different than one defined by `params.BondDenom`
* the exchange rate is invalid, meaning the validator has no tokens (due to slashing) but there are outstanding shares
* the amount delegated is less than the minimum allowed delegation

If an existing `Delegation` object for provided addresses does not already
exist then it is created as part of this message otherwise the existing
`Delegation` is updated to include the newly received shares.

The delegator receives newly minted shares at the current exchange rate.
The exchange rate is the number of existing shares in the validator divided by
the number of currently delegated tokens.

The validator is updated in the `ValidatorByPower` index, and the delegation is
tracked in validator object in the `Validators` index.

It is possible to delegate to a jailed validator, the only difference being it
will not be added to the power index until it is unjailed.

![Delegation sequence](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/delegation_sequence.svg)

### MsgUndelegate

The `MsgUndelegate` message allows delegators to undelegate their tokens from
validator.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L34-L36
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L140-L152
```

This message returns a response containing the completion time of the undelegation:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L154-L158
```

This message is expected to fail if:

* the delegation doesn't exist
* the validator doesn't exist
* the delegation has less shares than the ones worth of `Amount`
* existing `UnbondingDelegation` has maximum entries as defined by `params.MaxEntries`
* the `Amount` has a denomination different than one defined by `params.BondDenom`

When this message is processed the following actions occur:

* validator's `DelegatorShares` and the delegation's `Shares` are both reduced by the message `SharesAmount`
* calculate the token worth of the shares remove that amount tokens held within the validator
* with those removed tokens, if the validator is:
    * `Bonded` - add them to an entry in `UnbondingDelegation` (create `UnbondingDelegation` if it doesn't exist) with a completion time a full unbonding period from the current time. Update pool shares to reduce BondedTokens and increase NotBondedTokens by token worth of the shares.
    * `Unbonding` - add them to an entry in `UnbondingDelegation` (create `UnbondingDelegation` if it doesn't exist) with the same completion time as the validator (`UnbondingMinTime`).
    * `Unbonded` - then send the coins the message `DelegatorAddr`
* if there are no more `Shares` in the delegation, then the delegation object is removed from the store
    * under this situation if the delegation is the validator's self-delegation then also jail the validator.

![Unbond sequence](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/unbond_sequence.svg)

### MsgCancelUnbondingDelegation

The `MsgCancelUnbondingDelegation` message allows delegators to cancel the `unbondingDelegation` entry and delegate back to a previous validator.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L38-L42
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L160-L175
```

This message is expected to fail if:

* the `unbondingDelegation` entry is already processed.
* the `cancel unbonding delegation` amount is greater than the `unbondingDelegation` entry balance.
* the `cancel unbonding delegation` height doesn't exist in the `unbondingDelegationQueue` of the delegator.

When this message is processed the following actions occur:

* if the `unbondingDelegation` Entry balance is zero 
    * in this condition `unbondingDelegation` entry will be removed from `unbondingDelegationQueue`.
    * otherwise `unbondingDelegationQueue` will be updated with new `unbondingDelegation` entry balance and initial balance
* the validator's `DelegatorShares` and the delegation's `Shares` are both increased by the message `Amount`.

### MsgBeginRedelegate

The redelegation command allows delegators to instantly switch validators. Once
the unbonding period has passed, the redelegation is automatically completed in
the EndBlocker.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L30-L32
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L119-L132
```

This message returns a response containing the completion time of the redelegation:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L133-L138
```

This message is expected to fail if:

* the delegation doesn't exist
* the source or destination validators don't exist
* the delegation has less shares than the ones worth of `Amount`
* the source validator has a receiving redelegation which is not matured (aka. the redelegation may be transitive)
* existing `Redelegation` has maximum entries as defined by `params.MaxEntries`
* the `Amount` `Coin` has a denomination different than one defined by `params.BondDenom`

When this message is processed the following actions occur:

* the source validator's `DelegatorShares` and the delegations `Shares` are both reduced by the message `SharesAmount`
* calculate the token worth of the shares remove that amount tokens held within the source validator.
* if the source validator is:
    * `Bonded` - add an entry to the `Redelegation` (create `Redelegation` if it doesn't exist) with a completion time a full unbonding period from the current time. Update pool shares to reduce BondedTokens and increase NotBondedTokens by token worth of the shares (this may be effectively reversed in the next step however).
    * `Unbonding` - add an entry to the `Redelegation` (create `Redelegation` if it doesn't exist) with the same completion time as the validator (`UnbondingMinTime`).
    * `Unbonded` - no action required in this step
* Delegate the token worth to the destination validator, possibly moving tokens back to the bonded state.
* if there are no more `Shares` in the source delegation, then the source delegation object is removed from the store
    * under this situation if the delegation is the validator's self-delegation then also jail the validator.

![Begin redelegation sequence](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/begin_redelegation_sequence.svg)


### MsgUpdateParams

The `MsgUpdateParams` update the staking module parameters.
The params are updated through a governance proposal where the signer is the gov module account address.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/tx.proto#L182-L195
```

The message handling can fail if:

* signer is not the authority defined in the staking keeper (usually the gov module account).

## Begin-Block

Each abci begin block call, the historical info will get stored and pruned
according to the `HistoricalEntries` parameter.

### Historical Info Tracking

If the `HistoricalEntries` parameter is 0, then the `BeginBlock` performs a no-op.

Otherwise, the latest historical info is stored under the key `historicalInfoKey|height`, while any entries older than `height - HistoricalEntries` is deleted.
In most cases, this results in a single entry being pruned per block.
However, if the parameter `HistoricalEntries` has changed to a lower value there will be multiple entries in the store that must be pruned.

## End-Block

Each abci end block call, the operations to update queues and validator set
changes are specified to execute.

### Validator Set Changes

The staking validator set is updated during this process by state transitions
that run at the end of every block. As a part of this process any updated
validators are also returned back to CometBFT for inclusion in the CometBFT
validator set which is responsible for validating CometBFT messages at the
consensus layer. Operations are as following:

* the new validator set is taken as the top `params.MaxValidators` number of
  validators retrieved from the `ValidatorsByPower` index
* the previous validator set is compared with the new validator set:
    * missing validators begin unbonding and their `Tokens` are transferred from the
    `BondedPool` to the `NotBondedPool` `ModuleAccount`
    * new validators are instantly bonded and their `Tokens` are transferred from the
    `NotBondedPool` to the `BondedPool` `ModuleAccount`

In all cases, any validators leaving or entering the bonded validator set or
changing balances and staying within the bonded validator set incur an update
message reporting their new consensus power which is passed back to CometBFT.

The `LastTotalPower` and `LastValidatorsPower` hold the state of the total power
and validator power from the end of the last block, and are used to check for
changes that have occurred in `ValidatorsByPower` and the total new power, which
is calculated during `EndBlock`.

### Queues

Within staking, certain state-transitions are not instantaneous but take place
over a duration of time (typically the unbonding period). When these
transitions are mature certain operations must take place in order to complete
the state operation. This is achieved through the use of queues which are
checked/processed at the end of each block.

#### Unbonding Validators

When a validator is kicked out of the bonded validator set (either through
being jailed, or not having sufficient bonded tokens) it begins the unbonding
process along with all its delegations begin unbonding (while still being
delegated to this validator). At this point the validator is said to be an
"unbonding validator", whereby it will mature to become an "unbonded validator"
after the unbonding period has passed.

Each block the validator queue is to be checked for mature unbonding validators
(namely with a completion time <= current time and completion height <= current
block height). At this point any mature validators which do not have any
delegations remaining are deleted from state. For all other mature unbonding
validators that still have remaining delegations, the `validator.Status` is
switched from `types.Unbonding` to
`types.Unbonded`.

Unbonding operations can be put on hold by external modules via the `PutUnbondingOnHold(unbondingId)` method. 
 As a result, an unbonding operation (e.g., an unbonding delegation) that is on hold, cannot complete 
 even if it reaches maturity. For an unbonding operation with `unbondingId` to eventually complete 
 (after it reaches maturity), every call to `PutUnbondingOnHold(unbondingId)` must be matched 
 by a call to `UnbondingCanComplete(unbondingId)`. 

#### Unbonding Delegations

Complete the unbonding of all mature `UnbondingDelegations.Entries` within the
`UnbondingDelegations` queue with the following procedure:

* transfer the balance coins to the delegator's wallet address
* remove the mature entry from `UnbondingDelegation.Entries`
* remove the `UnbondingDelegation` object from the store if there are no
  remaining entries.

#### Redelegations

Complete the unbonding of all mature `Redelegation.Entries` within the
`Redelegations` queue with the following procedure:

* remove the mature entry from `Redelegation.Entries`
* remove the `Redelegation` object from the store if there are no
  remaining entries.

## Hooks

Other modules may register operations to execute when a certain event has
occurred within staking.  These events can be registered to execute either
right `Before` or `After` the staking event (as per the hook name). The
following hooks can registered with staking:

* `AfterValidatorCreated(Context, ValAddress) error`
    * called when a validator is created
* `BeforeValidatorModified(Context, ValAddress) error`
    * called when a validator's state is changed
* `AfterValidatorRemoved(Context, ConsAddress, ValAddress) error`
    * called when a validator is deleted
* `AfterValidatorBonded(Context, ConsAddress, ValAddress) error`
    * called when a validator is bonded
* `AfterValidatorBeginUnbonding(Context, ConsAddress, ValAddress) error`
    * called when a validator begins unbonding
* `BeforeDelegationCreated(Context, AccAddress, ValAddress) error`
    * called when a delegation is created
* `BeforeDelegationSharesModified(Context, AccAddress, ValAddress) error`
    * called when a delegation's shares are modified
* `AfterDelegationModified(Context, AccAddress, ValAddress) error`
    * called when a delegation is created or modified
* `BeforeDelegationRemoved(Context, AccAddress, ValAddress) error`
    * called when a delegation is removed
* `AfterUnbondingInitiated(Context, UnbondingID)`
    * called when an unbonding operation (validator unbonding, unbonding delegation, redelegation) was initiated


## Events

The staking module emits the following events:

### EndBlocker

| Type                  | Attribute Key         | Attribute Value           |
| --------------------- | --------------------- | ------------------------- |
| complete_unbonding    | amount                | {totalUnbondingAmount}    |
| complete_unbonding    | validator             | {validatorAddress}        |
| complete_unbonding    | delegator             | {delegatorAddress}        |
| complete_redelegation | amount                | {totalRedelegationAmount} |
| complete_redelegation | source_validator      | {srcValidatorAddress}     |
| complete_redelegation | destination_validator | {dstValidatorAddress}     |
| complete_redelegation | delegator             | {delegatorAddress}        |

## Msg's

### MsgCreateValidator

| Type             | Attribute Key | Attribute Value    |
| ---------------- | ------------- | ------------------ |
| create_validator | validator     | {validatorAddress} |
| create_validator | amount        | {delegationAmount} |
| message          | module        | staking            |
| message          | action        | create_validator   |
| message          | sender        | {senderAddress}    |

### MsgEditValidator

| Type           | Attribute Key       | Attribute Value     |
| -------------- | ------------------- | ------------------- |
| edit_validator | commission_rate     | {commissionRate}    |
| edit_validator | min_self_delegation | {minSelfDelegation} |
| message        | module              | staking             |
| message        | action              | edit_validator      |
| message        | sender              | {senderAddress}     |

### MsgDelegate

| Type     | Attribute Key | Attribute Value    |
| -------- | ------------- | ------------------ |
| delegate | validator     | {validatorAddress} |
| delegate | amount        | {delegationAmount} |
| message  | module        | staking            |
| message  | action        | delegate           |
| message  | sender        | {senderAddress}    |

### MsgUndelegate

| Type    | Attribute Key       | Attribute Value    |
| ------- | ------------------- | ------------------ |
| unbond  | validator           | {validatorAddress} |
| unbond  | amount              | {unbondAmount}     |
| unbond  | completion_time [0] | {completionTime}   |
| message | module              | staking            |
| message | action              | begin_unbonding    |
| message | sender              | {senderAddress}    |

* [0] Time is formatted in the RFC3339 standard

### MsgCancelUnbondingDelegation

| Type                        | Attribute Key   | Attribute Value                   |
| --------------------------- | --------------- | --------------------------------- |
| cancel_unbonding_delegation | validator       | {validatorAddress}                |
| cancel_unbonding_delegation | delegator       | {delegatorAddress}                |
| cancel_unbonding_delegation | amount          | {cancelUnbondingDelegationAmount} |
| cancel_unbonding_delegation | creation_height | {unbondingCreationHeight}         |
| message                     | module          | staking                           |
| message                     | action          | cancel_unbond                     |
| message                     | sender          | {senderAddress}                   |

### MsgBeginRedelegate

| Type       | Attribute Key         | Attribute Value       |
| ---------- | --------------------- | --------------------- |
| redelegate | source_validator      | {srcValidatorAddress} |
| redelegate | destination_validator | {dstValidatorAddress} |
| redelegate | amount                | {unbondAmount}        |
| redelegate | completion_time [0]   | {completionTime}      |
| message    | module                | staking               |
| message    | action                | begin_redelegate      |
| message    | sender                | {senderAddress}       |

* [0] Time is formatted in the RFC3339 standard

## Parameters

The staking module contains the following parameters:

| Key               | Type             | Example                |
| ----------------- | ---------------- | ---------------------- |
| UnbondingTime     | string (time ns) | "259200000000000"      |
| MaxValidators     | uint16           | 100                    |
| KeyMaxEntries     | uint16           | 7                      |
| HistoricalEntries | uint16           | 3                      |
| BondDenom         | string           | "stake"                |
| MinCommissionRate | string           | "0.000000000000000000" |

## Client

### CLI

A user can query and interact with the `staking` module using the CLI.

#### Query

The `query` commands allows users to query `staking` state.

```bash
simd query staking --help
```

##### delegation

The `delegation` command allows users to query delegations for an individual delegator on an individual validator.

Usage:

```bash
simd query staking delegation [delegator-addr] [validator-addr] [flags]
```

Example:

```bash
simd query staking delegation cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

Example Output:

```bash
balance:
  amount: "10000000000"
  denom: stake
delegation:
  delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
  shares: "10000000000.000000000000000000"
  validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

##### delegations

The `delegations` command allows users to query delegations for an individual delegator on all validators.

Usage:

```bash
simd query staking delegations [delegator-addr] [flags]
```

Example:

```bash
simd query staking delegations cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
```

Example Output:

```bash
delegation_responses:
- balance:
    amount: "10000000000"
    denom: stake
  delegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    shares: "10000000000.000000000000000000"
    validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
- balance:
    amount: "10000000000"
    denom: stake
  delegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    shares: "10000000000.000000000000000000"
    validator_address: cosmosvaloper1x20lytyf6zkcrv5edpkfkn8sz578qg5sqfyqnp
pagination:
  next_key: null
  total: "0"
```

##### delegations-to

The `delegations-to` command allows users to query delegations on an individual validator.

Usage:

```bash
simd query staking delegations-to [validator-addr] [flags]
```

Example:

```bash
simd query staking delegations-to cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

Example Output:

```bash
- balance:
    amount: "504000000"
    denom: stake
  delegation:
    delegator_address: cosmos1q2qwwynhv8kh3lu5fkeex4awau9x8fwt45f5cp
    shares: "504000000.000000000000000000"
    validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
- balance:
    amount: "78125000000"
    denom: uixo
  delegation:
    delegator_address: cosmos1qvppl3479hw4clahe0kwdlfvf8uvjtcd99m2ca
    shares: "78125000000.000000000000000000"
    validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
pagination:
  next_key: null
  total: "0"
```

##### historical-info

The `historical-info` command allows users to query historical information at given height.

Usage:

```bash
simd query staking historical-info [height] [flags]
```

Example:

```bash
simd query staking historical-info 10
```

Example Output:

```bash
header:
  app_hash: Lbx8cXpI868wz8sgp4qPYVrlaKjevR5WP/IjUxwp3oo=
  chain_id: testnet
  consensus_hash: BICRvH3cKD93v7+R1zxE2ljD34qcvIZ0Bdi389qtoi8=
  data_hash: 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
  evidence_hash: 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
  height: "10"
  last_block_id:
    hash: RFbkpu6pWfSThXxKKl6EZVDnBSm16+U0l0xVjTX08Fk=
    part_set_header:
      hash: vpIvXD4rxD5GM4MXGz0Sad9I7//iVYLzZsEU4BVgWIU=
      total: 1
  last_commit_hash: Ne4uXyx4QtNp4Zx89kf9UK7oG9QVbdB6e7ZwZkhy8K0=
  last_results_hash: 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
  next_validators_hash: nGBgKeWBjoxeKFti00CxHsnULORgKY4LiuQwBuUrhCs=
  proposer_address: mMEP2c2IRPLr99LedSRtBg9eONM=
  time: "2021-10-01T06:00:49.785790894Z"
  validators_hash: nGBgKeWBjoxeKFti00CxHsnULORgKY4LiuQwBuUrhCs=
  version:
    app: "0"
    block: "11"
valset:
- commission:
    commission_rates:
      max_change_rate: "0.010000000000000000"
      max_rate: "0.200000000000000000"
      rate: "0.100000000000000000"
    update_time: "2021-10-01T05:52:50.380144238Z"
  consensus_pubkey:
    '@type': /cosmos.crypto.ed25519.PubKey
    key: Auxs3865HpB/EfssYOzfqNhEJjzys2Fo6jD5B8tPgC8=
  delegator_shares: "10000000.000000000000000000"
  description:
    details: ""
    identity: ""
    moniker: myvalidator
    security_contact: ""
    website: ""
  jailed: false
  min_self_delegation: "1"
  operator_address: cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc
  status: BOND_STATUS_BONDED
  tokens: "10000000"
  unbonding_height: "0"
  unbonding_time: "1970-01-01T00:00:00Z"
```

##### params

The `params` command allows users to query values set as staking parameters.

Usage:

```bash
simd query staking params [flags]
```

Example:

```bash
simd query staking params
```

Example Output:

```bash
bond_denom: stake
historical_entries: 10000
max_entries: 7
max_validators: 50
unbonding_time: 1814400s
```

##### pool

The `pool` command allows users to query values for amounts stored in the staking pool.

Usage:

```bash
simd q staking pool [flags]
```

Example:

```bash
simd q staking pool
```

Example Output:

```bash
bonded_tokens: "10000000"
not_bonded_tokens: "0"
```

##### redelegation

The `redelegation` command allows users to query a redelegation record based on delegator and a source and destination validator address.

Usage:

```bash
simd query staking redelegation [delegator-addr] [src-validator-addr] [dst-validator-addr] [flags]
```

Example:

```bash
simd query staking redelegation cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

Example Output:

```bash
pagination: null
redelegation_responses:
- entries:
  - balance: "50000000"
    redelegation_entry:
      completion_time: "2021-10-24T20:33:21.960084845Z"
      creation_height: 2.382847e+06
      initial_balance: "50000000"
      shares_dst: "50000000.000000000000000000"
  - balance: "5000000000"
    redelegation_entry:
      completion_time: "2021-10-25T21:33:54.446846862Z"
      creation_height: 2.397271e+06
      initial_balance: "5000000000"
      shares_dst: "5000000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    entries: null
    validator_dst_address: cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm
    validator_src_address: cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm
```

##### redelegations

The `redelegations` command allows users to query all redelegation records for an individual delegator.

Usage:

```bash
simd query staking redelegations [delegator-addr] [flags]
```

Example:

```bash
simd query staking redelegation cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
```

Example Output:

```bash
pagination:
  next_key: null
  total: "0"
redelegation_responses:
- entries:
  - balance: "50000000"
    redelegation_entry:
      completion_time: "2021-10-24T20:33:21.960084845Z"
      creation_height: 2.382847e+06
      initial_balance: "50000000"
      shares_dst: "50000000.000000000000000000"
  - balance: "5000000000"
    redelegation_entry:
      completion_time: "2021-10-25T21:33:54.446846862Z"
      creation_height: 2.397271e+06
      initial_balance: "5000000000"
      shares_dst: "5000000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    entries: null
    validator_dst_address: cosmosvaloper1uccl5ugxrm7vqlzwqr04pjd320d2fz0z3hc6vm
    validator_src_address: cosmosvaloper1zppjyal5emta5cquje8ndkpz0rs046m7zqxrpp
- entries:
  - balance: "562770000000"
    redelegation_entry:
      completion_time: "2021-10-25T21:42:07.336911677Z"
      creation_height: 2.39735e+06
      initial_balance: "562770000000"
      shares_dst: "562770000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
    entries: null
    validator_dst_address: cosmosvaloper1uccl5ugxrm7vqlzwqr04pjd320d2fz0z3hc6vm
    validator_src_address: cosmosvaloper1zppjyal5emta5cquje8ndkpz0rs046m7zqxrpp
```

##### redelegations-from

The `redelegations-from` command allows users to query delegations that are redelegating _from_ a validator.

Usage:

```bash
simd query staking redelegations-from [validator-addr] [flags]
```

Example:

```bash
simd query staking redelegations-from cosmosvaloper1y4rzzrgl66eyhzt6gse2k7ej3zgwmngeleucjy
```

Example Output:

```bash
pagination:
  next_key: null
  total: "0"
redelegation_responses:
- entries:
  - balance: "50000000"
    redelegation_entry:
      completion_time: "2021-10-24T20:33:21.960084845Z"
      creation_height: 2.382847e+06
      initial_balance: "50000000"
      shares_dst: "50000000.000000000000000000"
  - balance: "5000000000"
    redelegation_entry:
      completion_time: "2021-10-25T21:33:54.446846862Z"
      creation_height: 2.397271e+06
      initial_balance: "5000000000"
      shares_dst: "5000000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1pm6e78p4pgn0da365plzl4t56pxy8hwtqp2mph
    entries: null
    validator_dst_address: cosmosvaloper1uccl5ugxrm7vqlzwqr04pjd320d2fz0z3hc6vm
    validator_src_address: cosmosvaloper1y4rzzrgl66eyhzt6gse2k7ej3zgwmngeleucjy
- entries:
  - balance: "221000000"
    redelegation_entry:
      completion_time: "2021-10-05T21:05:45.669420544Z"
      creation_height: 2.120693e+06
      initial_balance: "221000000"
      shares_dst: "221000000.000000000000000000"
  redelegation:
    delegator_address: cosmos1zqv8qxy2zgn4c58fz8jt8jmhs3d0attcussrf6
    entries: null
    validator_dst_address: cosmosvaloper10mseqwnwtjaqfrwwp2nyrruwmjp6u5jhah4c3y
    validator_src_address: cosmosvaloper1y4rzzrgl66eyhzt6gse2k7ej3zgwmngeleucjy
```

##### unbonding-delegation

The `unbonding-delegation` command allows users to query unbonding delegations for an individual delegator on an individual validator.

Usage:

```bash
simd query staking unbonding-delegation [delegator-addr] [validator-addr] [flags]
```

Example:

```bash
simd query staking unbonding-delegation cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

Example Output:

```bash
delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
entries:
- balance: "52000000"
  completion_time: "2021-11-02T11:35:55.391594709Z"
  creation_height: "55078"
  initial_balance: "52000000"
validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

##### unbonding-delegations

The `unbonding-delegations` command allows users to query all unbonding-delegations records for one delegator.

Usage:

```bash
simd query staking unbonding-delegations [delegator-addr] [flags]
```

Example:

```bash
simd query staking unbonding-delegations cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
```

Example Output:

```bash
pagination:
  next_key: null
  total: "0"
unbonding_responses:
- delegator_address: cosmos1gghjut3ccd8ay0zduzj64hwre2fxs9ld75ru9p
  entries:
  - balance: "52000000"
    completion_time: "2021-11-02T11:35:55.391594709Z"
    creation_height: "55078"
    initial_balance: "52000000"
  validator_address: cosmosvaloper1t8ehvswxjfn3ejzkjtntcyrqwvmvuknzmvtaaa

```

##### unbonding-delegations-from

The `unbonding-delegations-from` command allows users to query delegations that are unbonding _from_ a validator.

Usage:

```bash
simd query staking unbonding-delegations-from [validator-addr] [flags]
```

Example:

```bash
simd query staking unbonding-delegations-from cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

Example Output:

```bash
pagination:
  next_key: null
  total: "0"
unbonding_responses:
- delegator_address: cosmos1qqq9txnw4c77sdvzx0tkedsafl5s3vk7hn53fn
  entries:
  - balance: "150000000"
    completion_time: "2021-11-01T21:41:13.098141574Z"
    creation_height: "46823"
    initial_balance: "150000000"
  validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
- delegator_address: cosmos1peteje73eklqau66mr7h7rmewmt2vt99y24f5z
  entries:
  - balance: "24000000"
    completion_time: "2021-10-31T02:57:18.192280361Z"
    creation_height: "21516"
    initial_balance: "24000000"
  validator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

##### validator

The `validator` command allows users to query details about an individual validator.

Usage:

```bash
simd query staking validator [validator-addr] [flags]
```

Example:

```bash
simd query staking validator cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
```

Example Output:

```bash
commission:
  commission_rates:
    max_change_rate: "0.020000000000000000"
    max_rate: "0.200000000000000000"
    rate: "0.050000000000000000"
  update_time: "2021-10-01T19:24:52.663191049Z"
consensus_pubkey:
  '@type': /cosmos.crypto.ed25519.PubKey
  key: sIiexdJdYWn27+7iUHQJDnkp63gq/rzUq1Y+fxoGjXc=
delegator_shares: "32948270000.000000000000000000"
description:
  details: Witval is the validator arm from Vitwit. Vitwit is into software consulting
    and services business since 2015. We are working closely with Cosmos ecosystem
    since 2018. We are also building tools for the ecosystem, Aneka is our explorer
    for the cosmos ecosystem.
  identity: 51468B615127273A
  moniker: Witval
  security_contact: ""
  website: ""
jailed: false
min_self_delegation: "1"
operator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
status: BOND_STATUS_BONDED
tokens: "32948270000"
unbonding_height: "0"
unbonding_time: "1970-01-01T00:00:00Z"
```

##### validators

The `validators` command allows users to query details about all validators on a network.

Usage:

```bash
simd query staking validators [flags]
```

Example:

```bash
simd query staking validators
```

Example Output:

```bash
pagination:
  next_key: FPTi7TKAjN63QqZh+BaXn6gBmD5/
  total: "0"
validators:
commission:
  commission_rates:
    max_change_rate: "0.020000000000000000"
    max_rate: "0.200000000000000000"
    rate: "0.050000000000000000"
  update_time: "2021-10-01T19:24:52.663191049Z"
consensus_pubkey:
  '@type': /cosmos.crypto.ed25519.PubKey
  key: sIiexdJdYWn27+7iUHQJDnkp63gq/rzUq1Y+fxoGjXc=
delegator_shares: "32948270000.000000000000000000"
description:
    details: Witval is the validator arm from Vitwit. Vitwit is into software consulting
      and services business since 2015. We are working closely with Cosmos ecosystem
      since 2018. We are also building tools for the ecosystem, Aneka is our explorer
      for the cosmos ecosystem.
    identity: 51468B615127273A
    moniker: Witval
    security_contact: ""
    website: ""
  jailed: false
  min_self_delegation: "1"
  operator_address: cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj
  status: BOND_STATUS_BONDED
  tokens: "32948270000"
  unbonding_height: "0"
  unbonding_time: "1970-01-01T00:00:00Z"
- commission:
    commission_rates:
      max_change_rate: "0.100000000000000000"
      max_rate: "0.200000000000000000"
      rate: "0.050000000000000000"
    update_time: "2021-10-04T18:02:21.446645619Z"
  consensus_pubkey:
    '@type': /cosmos.crypto.ed25519.PubKey
    key: GDNpuKDmCg9GnhnsiU4fCWktuGUemjNfvpCZiqoRIYA=
  delegator_shares: "559343421.000000000000000000"
  description:
    details: Noderunners is a professional validator in POS networks. We have a huge
      node running experience, reliable soft and hardware. Our commissions are always
      low, our support to delegators is always full. Stake with us and start receiving
      your Cosmos rewards now!
    identity: 812E82D12FEA3493
    moniker: Noderunners
    security_contact: info@noderunners.biz
    website: http://noderunners.biz
  jailed: false
  min_self_delegation: "1"
  operator_address: cosmosvaloper1q5ku90atkhktze83j9xjaks2p7uruag5zp6wt7
  status: BOND_STATUS_BONDED
  tokens: "559343421"
  unbonding_height: "0"
  unbonding_time: "1970-01-01T00:00:00Z"
```

#### Transactions

The `tx` commands allows users to interact with the `staking` module.

```bash
simd tx staking --help
```

##### create-validator

The command `create-validator` allows users to create new validator initialized with a self-delegation to it.

Usage:

```bash
simd tx staking create-validator [path/to/validator.json] [flags]
```

Example:

```bash
simd tx staking create-validator /path/to/validator.json \
  --chain-id="name_of_chain_id" \
  --gas="auto" \
  --gas-adjustment="1.2" \
  --gas-prices="0.025stake" \
  --from=mykey
```

where `validator.json` contains:

```json
{
  "pubkey": {"@type":"/cosmos.crypto.ed25519.PubKey","key":"BnbwFpeONLqvWqJb3qaUbL5aoIcW3fSuAp9nT3z5f20="},
  "amount": "1000000stake",
  "moniker": "my-moniker",
  "website": "https://myweb.site",
  "security": "security-contact@gmail.com",
  "details": "description of your validator",
  "commission-rate": "0.10",
  "commission-max-rate": "0.20",
  "commission-max-change-rate": "0.01",
  "min-self-delegation": "1"
}
```

and pubkey can be obtained by using `simd tendermint show-validator` command.

##### delegate

The command `delegate` allows users to delegate liquid tokens to a validator.

Usage:

```bash
simd tx staking delegate [validator-addr] [amount] [flags]
```

Example:

```bash
simd tx staking delegate cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm 1000stake --from mykey
```

##### edit-validator

The command `edit-validator` allows users to edit an existing validator account.

Usage:

```bash
simd tx staking edit-validator [flags]
```

Example:

```bash
simd tx staking edit-validator --moniker "new_moniker_name" --website "new_webiste_url" --from mykey
```

##### redelegate

The command `redelegate` allows users to redelegate illiquid tokens from one validator to another.

Usage:

```bash
simd tx staking redelegate [src-validator-addr] [dst-validator-addr] [amount] [flags]
```

Example:

```bash
simd tx staking redelegate cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj cosmosvaloper1l2rsakp388kuv9k8qzq6lrm9taddae7fpx59wm 100stake --from mykey
```

##### unbond

The command `unbond` allows users to unbond shares from a validator.

Usage:

```bash
simd tx staking unbond [validator-addr] [amount] [flags]
```

Example:

```bash
simd tx staking unbond cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj 100stake --from mykey
```

##### cancel unbond 

The command `cancel-unbond` allow users to cancel the unbonding delegation entry and delegate back to the original validator.

Usage:

```bash
simd tx staking cancel-unbond [validator-addr] [amount] [creation-height]
```

Example:

```bash
simd tx staking cancel-unbond cosmosvaloper1gghjut3ccd8ay0zduzj64hwre2fxs9ldmqhffj 100stake 123123 --from mykey
```


### gRPC

A user can query the `staking` module using gRPC endpoints.

#### Validators

The `Validators` endpoint queries all validators that match the given status.

```bash
cosmos.staking.v1beta1.Query/Validators
```

Example:

```bash
grpcurl -plaintext localhost:9090 cosmos.staking.v1beta1.Query/Validators
```

Example Output:

```bash
{
  "validators": [
    {
      "operatorAddress": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
      "consensusPubkey": {"@type":"/cosmos.crypto.ed25519.PubKey","key":"Auxs3865HpB/EfssYOzfqNhEJjzys2Fo6jD5B8tPgC8="},
      "status": "BOND_STATUS_BONDED",
      "tokens": "10000000",
      "delegatorShares": "10000000000000000000000000",
      "description": {
        "moniker": "myvalidator"
      },
      "unbondingTime": "1970-01-01T00:00:00Z",
      "commission": {
        "commissionRates": {
          "rate": "100000000000000000",
          "maxRate": "200000000000000000",
          "maxChangeRate": "10000000000000000"
        },
        "updateTime": "2021-10-01T05:52:50.380144238Z"
      },
      "minSelfDelegation": "1"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### Validator

The `Validator` endpoint queries validator information for given validator address.

```bash
cosmos.staking.v1beta1.Query/Validator
```

Example:

```bash
grpcurl -plaintext -d '{"validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/Validator
```

Example Output:

```bash
{
  "validator": {
    "operatorAddress": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
    "consensusPubkey": {"@type":"/cosmos.crypto.ed25519.PubKey","key":"Auxs3865HpB/EfssYOzfqNhEJjzys2Fo6jD5B8tPgC8="},
    "status": "BOND_STATUS_BONDED",
    "tokens": "10000000",
    "delegatorShares": "10000000000000000000000000",
    "description": {
      "moniker": "myvalidator"
    },
    "unbondingTime": "1970-01-01T00:00:00Z",
    "commission": {
      "commissionRates": {
        "rate": "100000000000000000",
        "maxRate": "200000000000000000",
        "maxChangeRate": "10000000000000000"
      },
      "updateTime": "2021-10-01T05:52:50.380144238Z"
    },
    "minSelfDelegation": "1"
  }
}
```

#### ValidatorDelegations

The `ValidatorDelegations` endpoint queries delegate information for given validator.

```bash
cosmos.staking.v1beta1.Query/ValidatorDelegations
```

Example:

```bash
grpcurl -plaintext -d '{"validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/ValidatorDelegations
```

Example Output:

```bash
{
  "delegationResponses": [
    {
      "delegation": {
        "delegatorAddress": "cosmos1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgy3ua5t",
        "validatorAddress": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
        "shares": "10000000000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "10000000"
      }
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### ValidatorUnbondingDelegations

The `ValidatorUnbondingDelegations` endpoint queries delegate information for given validator.

```bash
cosmos.staking.v1beta1.Query/ValidatorUnbondingDelegations
```

Example:

```bash
grpcurl -plaintext -d '{"validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/ValidatorUnbondingDelegations
```

Example Output:

```bash
{
  "unbonding_responses": [
    {
      "delegator_address": "cosmos1z3pzzw84d6xn00pw9dy3yapqypfde7vg6965fy",
      "validator_address": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
      "entries": [
        {
          "creation_height": "25325",
          "completion_time": "2021-10-31T09:24:36.797320636Z",
          "initial_balance": "20000000",
          "balance": "20000000"
        }
      ]
    },
    {
      "delegator_address": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77",
      "validator_address": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
      "entries": [
        {
          "creation_height": "13100",
          "completion_time": "2021-10-30T12:53:02.272266791Z",
          "initial_balance": "1000000",
          "balance": "1000000"
        }
      ]
    },
  ],
  "pagination": {
    "next_key": null,
    "total": "8"
  }
}
```

#### Delegation

The `Delegation` endpoint queries delegate information for given validator delegator pair.

```bash
cosmos.staking.v1beta1.Query/Delegation
```

Example:

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77", validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/Delegation
```

Example Output:

```bash
{
  "delegation_response":
  {
    "delegation":
      {
        "delegator_address":"cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77",
        "validator_address":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
        "shares":"25083119936.000000000000000000"
      },
    "balance":
      {
        "denom":"stake",
        "amount":"25083119936"
      }
  }
}
```

#### UnbondingDelegation

The `UnbondingDelegation` endpoint queries unbonding information for given validator delegator.

```bash
cosmos.staking.v1beta1.Query/UnbondingDelegation
```

Example:

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77", validator_addr":"cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc"}' \
localhost:9090 cosmos.staking.v1beta1.Query/UnbondingDelegation
```

Example Output:

```bash
{
  "unbond": {
    "delegator_address": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77",
    "validator_address": "cosmosvaloper1rne8lgs98p0jqe82sgt0qr4rdn4hgvmgp9ggcc",
    "entries": [
      {
        "creation_height": "136984",
        "completion_time": "2021-11-08T05:38:47.505593891Z",
        "initial_balance": "400000000",
        "balance": "400000000"
      },
      {
        "creation_height": "137005",
        "completion_time": "2021-11-08T05:40:53.526196312Z",
        "initial_balance": "385000000",
        "balance": "385000000"
      }
    ]
  }
}
```

#### DelegatorDelegations

The `DelegatorDelegations` endpoint queries all delegations of a given delegator address.

```bash
cosmos.staking.v1beta1.Query/DelegatorDelegations
```

Example:

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77"}' \
localhost:9090 cosmos.staking.v1beta1.Query/DelegatorDelegations
```

Example Output:

```bash
{
  "delegation_responses": [
    {"delegation":{"delegator_address":"cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77","validator_address":"cosmosvaloper1eh5mwu044gd5ntkkc2xgfg8247mgc56fww3vc8","shares":"25083339023.000000000000000000"},"balance":{"denom":"stake","amount":"25083339023"}}
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### DelegatorUnbondingDelegations

The `DelegatorUnbondingDelegations` endpoint queries all unbonding delegations of a given delegator address.

```bash
cosmos.staking.v1beta1.Query/DelegatorUnbondingDelegations
```

Example:

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77"}' \
localhost:9090 cosmos.staking.v1beta1.Query/DelegatorUnbondingDelegations
```

Example Output:

```bash
{
  "unbonding_responses": [
    {
      "delegator_address": "cosmos1y8nyfvmqh50p6ldpzljk3yrglppdv3t8phju77",
      "validator_address": "cosmosvaloper1sjllsnramtg3ewxqwwrwjxfgc4n4ef9uxyejze",
      "entries": [
        {
          "creation_height": "136984",
          "completion_time": "2021-11-08T05:38:47.505593891Z",
          "initial_balance": "400000000",
          "balance": "400000000"
        },
        {
          "creation_height": "137005",
          "completion_time": "2021-11-08T05:40:53.526196312Z",
          "initial_balance": "385000000",
          "balance": "385000000"
        }
      ]
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### Redelegations

The `Redelegations` endpoint queries redelegations of given address.

```bash
cosmos.staking.v1beta1.Query/Redelegations
```

Example:

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1ld5p7hn43yuh8ht28gm9pfjgj2fctujp2tgwvf", "src_validator_addr" : "cosmosvaloper1j7euyj85fv2jugejrktj540emh9353ltgppc3g", "dst_validator_addr" : "cosmosvaloper1yy3tnegzmkdcm7czzcy3flw5z0zyr9vkkxrfse"}' \
localhost:9090 cosmos.staking.v1beta1.Query/Redelegations
```

Example Output:

```bash
{
  "redelegation_responses": [
    {
      "redelegation": {
        "delegator_address": "cosmos1ld5p7hn43yuh8ht28gm9pfjgj2fctujp2tgwvf",
        "validator_src_address": "cosmosvaloper1j7euyj85fv2jugejrktj540emh9353ltgppc3g",
        "validator_dst_address": "cosmosvaloper1yy3tnegzmkdcm7czzcy3flw5z0zyr9vkkxrfse",
        "entries": null
      },
      "entries": [
        {
          "redelegation_entry": {
            "creation_height": 135932,
            "completion_time": "2021-11-08T03:52:55.299147901Z",
            "initial_balance": "2900000",
            "shares_dst": "2900000.000000000000000000"
          },
          "balance": "2900000"
        }
      ]
    }
  ],
  "pagination": null
}
```

#### DelegatorValidators

The `DelegatorValidators` endpoint queries all validators information for given delegator.

```bash
cosmos.staking.v1beta1.Query/DelegatorValidators
```

Example:

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1ld5p7hn43yuh8ht28gm9pfjgj2fctujp2tgwvf"}' \
localhost:9090 cosmos.staking.v1beta1.Query/DelegatorValidators
```

Example Output:

```bash
{
  "validators": [
    {
      "operator_address": "cosmosvaloper1eh5mwu044gd5ntkkc2xgfg8247mgc56fww3vc8",
      "consensus_pubkey": {
        "@type": "/cosmos.crypto.ed25519.PubKey",
        "key": "UPwHWxH1zHJWGOa/m6JB3f5YjHMvPQPkVbDqqi+U7Uw="
      },
      "jailed": false,
      "status": "BOND_STATUS_BONDED",
      "tokens": "347260647559",
      "delegator_shares": "347260647559.000000000000000000",
      "description": {
        "moniker": "BouBouNode",
        "identity": "",
        "website": "https://boubounode.com",
        "security_contact": "",
        "details": "AI-based Validator. #1 AI Validator on Game of Stakes. Fairly priced. Don't trust (humans), verify. Made with BouBou love."
      },
      "unbonding_height": "0",
      "unbonding_time": "1970-01-01T00:00:00Z",
      "commission": {
        "commission_rates": {
          "rate": "0.061000000000000000",
          "max_rate": "0.300000000000000000",
          "max_change_rate": "0.150000000000000000"
        },
        "update_time": "2021-10-01T15:00:00Z"
      },
      "min_self_delegation": "1"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### DelegatorValidator

The `DelegatorValidator` endpoint queries validator information for given delegator validator

```bash
cosmos.staking.v1beta1.Query/DelegatorValidator
```

Example:

```bash
grpcurl -plaintext \
-d '{"delegator_addr": "cosmos1eh5mwu044gd5ntkkc2xgfg8247mgc56f3n8rr7", "validator_addr": "cosmosvaloper1eh5mwu044gd5ntkkc2xgfg8247mgc56fww3vc8"}' \
localhost:9090 cosmos.staking.v1beta1.Query/DelegatorValidator
```

Example Output:

```bash
{
  "validator": {
    "operator_address": "cosmosvaloper1eh5mwu044gd5ntkkc2xgfg8247mgc56fww3vc8",
    "consensus_pubkey": {
      "@type": "/cosmos.crypto.ed25519.PubKey",
      "key": "UPwHWxH1zHJWGOa/m6JB3f5YjHMvPQPkVbDqqi+U7Uw="
    },
    "jailed": false,
    "status": "BOND_STATUS_BONDED",
    "tokens": "347262754841",
    "delegator_shares": "347262754841.000000000000000000",
    "description": {
      "moniker": "BouBouNode",
      "identity": "",
      "website": "https://boubounode.com",
      "security_contact": "",
      "details": "AI-based Validator. #1 AI Validator on Game of Stakes. Fairly priced. Don't trust (humans), verify. Made with BouBou love."
    },
    "unbonding_height": "0",
    "unbonding_time": "1970-01-01T00:00:00Z",
    "commission": {
      "commission_rates": {
        "rate": "0.061000000000000000",
        "max_rate": "0.300000000000000000",
        "max_change_rate": "0.150000000000000000"
      },
      "update_time": "2021-10-01T15:00:00Z"
    },
    "min_self_delegation": "1"
  }
}
```

#### HistoricalInfo

```bash
cosmos.staking.v1beta1.Query/HistoricalInfo
```

Example:

```bash
grpcurl -plaintext -d '{"height" : 1}' localhost:9090 cosmos.staking.v1beta1.Query/HistoricalInfo
```

Example Output:

```bash
{
  "hist": {
    "header": {
      "version": {
        "block": "11",
        "app": "0"
      },
      "chain_id": "simd-1",
      "height": "140142",
      "time": "2021-10-11T10:56:29.720079569Z",
      "last_block_id": {
        "hash": "9gri/4LLJUBFqioQ3NzZIP9/7YHR9QqaM6B2aJNQA7o=",
        "part_set_header": {
          "total": 1,
          "hash": "Hk1+C864uQkl9+I6Zn7IurBZBKUevqlVtU7VqaZl1tc="
        }
      },
      "last_commit_hash": "VxrcS27GtvGruS3I9+AlpT7udxIT1F0OrRklrVFSSKc=",
      "data_hash": "80BjOrqNYUOkTnmgWyz9AQ8n7SoEmPVi4QmAe8RbQBY=",
      "validators_hash": "95W49n2hw8RWpr1GPTAO5MSPi6w6Wjr3JjjS7AjpBho=",
      "next_validators_hash": "95W49n2hw8RWpr1GPTAO5MSPi6w6Wjr3JjjS7AjpBho=",
      "consensus_hash": "BICRvH3cKD93v7+R1zxE2ljD34qcvIZ0Bdi389qtoi8=",
      "app_hash": "ZZaxnSY3E6Ex5Bvkm+RigYCK82g8SSUL53NymPITeOE=",
      "last_results_hash": "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      "evidence_hash": "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      "proposer_address": "aH6dO428B+ItuoqPq70efFHrSMY="
    },
  "valset": [
      {
        "operator_address": "cosmosvaloper196ax4vc0lwpxndu9dyhvca7jhxp70rmcqcnylw",
        "consensus_pubkey": {
          "@type": "/cosmos.crypto.ed25519.PubKey",
          "key": "/O7BtNW0pafwfvomgR4ZnfldwPXiFfJs9mHg3gwfv5Q="
        },
        "jailed": false,
        "status": "BOND_STATUS_BONDED",
        "tokens": "1426045203613",
        "delegator_shares": "1426045203613.000000000000000000",
        "description": {
          "moniker": "SG-1",
          "identity": "48608633F99D1B60",
          "website": "https://sg-1.online",
          "security_contact": "",
          "details": "SG-1 - your favorite validator on Witval. We offer 100% Soft Slash protection."
        },
        "unbonding_height": "0",
        "unbonding_time": "1970-01-01T00:00:00Z",
        "commission": {
          "commission_rates": {
            "rate": "0.037500000000000000",
            "max_rate": "0.200000000000000000",
            "max_change_rate": "0.030000000000000000"
          },
          "update_time": "2021-10-01T15:00:00Z"
        },
        "min_self_delegation": "1"
      }
    ]
  }
}

```

#### Pool

The `Pool` endpoint queries the pool information.

```bash
cosmos.staking.v1beta1.Query/Pool
```

Example:

```bash
grpcurl -plaintext -d localhost:9090 cosmos.staking.v1beta1.Query/Pool
```

Example Output:

```bash
{
  "pool": {
    "not_bonded_tokens": "369054400189",
    "bonded_tokens": "15657192425623"
  }
}
```

#### Params

The `Params` endpoint queries the pool information.

```bash
cosmos.staking.v1beta1.Query/Params
```

Example:

```bash
grpcurl -plaintext localhost:9090 cosmos.staking.v1beta1.Query/Params
```

Example Output:

```bash
{
  "params": {
    "unbondingTime": "1814400s",
    "maxValidators": 100,
    "maxEntries": 7,
    "historicalEntries": 10000,
    "bondDenom": "stake"
  }
}
```

### REST

A user can query the `staking` module using REST endpoints.

#### DelegatorDelegations

The `DelegtaorDelegations` REST endpoint queries all delegations of a given delegator address.

```bash
/cosmos/staking/v1beta1/delegations/{delegatorAddr}
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/delegations/cosmos1vcs68xf2tnqes5tg0khr0vyevm40ff6zdxatp5" -H  "accept: application/json"
```

Example Output:

```bash
{
  "delegation_responses": [
    {
      "delegation": {
        "delegator_address": "cosmos1vcs68xf2tnqes5tg0khr0vyevm40ff6zdxatp5",
        "validator_address": "cosmosvaloper1quqxfrxkycr0uzt4yk0d57tcq3zk7srm7sm6r8",
        "shares": "256250000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "256250000"
      }
    },
    {
      "delegation": {
        "delegator_address": "cosmos1vcs68xf2tnqes5tg0khr0vyevm40ff6zdxatp5",
        "validator_address": "cosmosvaloper194v8uwee2fvs2s8fa5k7j03ktwc87h5ym39jfv",
        "shares": "255150000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "255150000"
      }
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### Redelegations

The `Redelegations` REST endpoint queries redelegations of given address.

```bash
/cosmos/staking/v1beta1/delegators/{delegatorAddr}/redelegations
```

Example:

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/delegators/cosmos1thfntksw0d35n2tkr0k8v54fr8wxtxwxl2c56e/redelegations?srcValidatorAddr=cosmosvaloper1lzhlnpahvznwfv4jmay2tgaha5kmz5qx4cuznf&dstValidatorAddr=cosmosvaloper1vq8tw77kp8lvxq9u3c8eeln9zymn68rng8pgt4" \
-H  "accept: application/json"
```

Example Output:

```bash
{
  "redelegation_responses": [
    {
      "redelegation": {
        "delegator_address": "cosmos1thfntksw0d35n2tkr0k8v54fr8wxtxwxl2c56e",
        "validator_src_address": "cosmosvaloper1lzhlnpahvznwfv4jmay2tgaha5kmz5qx4cuznf",
        "validator_dst_address": "cosmosvaloper1vq8tw77kp8lvxq9u3c8eeln9zymn68rng8pgt4",
        "entries": null
      },
      "entries": [
        {
          "redelegation_entry": {
            "creation_height": 151523,
            "completion_time": "2021-11-09T06:03:25.640682116Z",
            "initial_balance": "200000000",
            "shares_dst": "200000000.000000000000000000"
          },
          "balance": "200000000"
        }
      ]
    }
  ],
  "pagination": null
}
```

#### DelegatorUnbondingDelegations

The `DelegatorUnbondingDelegations` REST endpoint queries all unbonding delegations of a given delegator address.

```bash
/cosmos/staking/v1beta1/delegators/{delegatorAddr}/unbonding_delegations
```

Example:

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/delegators/cosmos1nxv42u3lv642q0fuzu2qmrku27zgut3n3z7lll/unbonding_delegations" \
-H  "accept: application/json"
```

Example Output:

```bash
{
  "unbonding_responses": [
    {
      "delegator_address": "cosmos1nxv42u3lv642q0fuzu2qmrku27zgut3n3z7lll",
      "validator_address": "cosmosvaloper1e7mvqlz50ch6gw4yjfemsc069wfre4qwmw53kq",
      "entries": [
        {
          "creation_height": "2442278",
          "completion_time": "2021-10-12T10:59:03.797335857Z",
          "initial_balance": "50000000000",
          "balance": "50000000000"
        }
      ]
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### DelegatorValidators

The `DelegatorValidators` REST endpoint queries all validators information for given delegator address.

```bash
/cosmos/staking/v1beta1/delegators/{delegatorAddr}/validators
```

Example:

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/delegators/cosmos1xwazl8ftks4gn00y5x3c47auquc62ssune9ppv/validators" \
-H  "accept: application/json"
```

Example Output:

```bash
{
  "validators": [
    {
      "operator_address": "cosmosvaloper1xwazl8ftks4gn00y5x3c47auquc62ssuvynw64",
      "consensus_pubkey": {
        "@type": "/cosmos.crypto.ed25519.PubKey",
        "key": "5v4n3px3PkfNnKflSgepDnsMQR1hiNXnqOC11Y72/PQ="
      },
      "jailed": false,
      "status": "BOND_STATUS_BONDED",
      "tokens": "21592843799",
      "delegator_shares": "21592843799.000000000000000000",
      "description": {
        "moniker": "jabbey",
        "identity": "",
        "website": "https://twitter.com/JoeAbbey",
        "security_contact": "",
        "details": "just another dad in the cosmos"
      },
      "unbonding_height": "0",
      "unbonding_time": "1970-01-01T00:00:00Z",
      "commission": {
        "commission_rates": {
          "rate": "0.100000000000000000",
          "max_rate": "0.200000000000000000",
          "max_change_rate": "0.100000000000000000"
        },
        "update_time": "2021-10-09T19:03:54.984821705Z"
      },
      "min_self_delegation": "1"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### DelegatorValidator

The `DelegatorValidator` REST endpoint queries validator information for given delegator validator pair.

```bash
/cosmos/staking/v1beta1/delegators/{delegatorAddr}/validators/{validatorAddr}
```

Example:

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/delegators/cosmos1xwazl8ftks4gn00y5x3c47auquc62ssune9ppv/validators/cosmosvaloper1xwazl8ftks4gn00y5x3c47auquc62ssuvynw64" \
-H  "accept: application/json"
```

Example Output:

```bash
{
  "validator": {
    "operator_address": "cosmosvaloper1xwazl8ftks4gn00y5x3c47auquc62ssuvynw64",
    "consensus_pubkey": {
      "@type": "/cosmos.crypto.ed25519.PubKey",
      "key": "5v4n3px3PkfNnKflSgepDnsMQR1hiNXnqOC11Y72/PQ="
    },
    "jailed": false,
    "status": "BOND_STATUS_BONDED",
    "tokens": "21592843799",
    "delegator_shares": "21592843799.000000000000000000",
    "description": {
      "moniker": "jabbey",
      "identity": "",
      "website": "https://twitter.com/JoeAbbey",
      "security_contact": "",
      "details": "just another dad in the cosmos"
    },
    "unbonding_height": "0",
    "unbonding_time": "1970-01-01T00:00:00Z",
    "commission": {
      "commission_rates": {
        "rate": "0.100000000000000000",
        "max_rate": "0.200000000000000000",
        "max_change_rate": "0.100000000000000000"
      },
      "update_time": "2021-10-09T19:03:54.984821705Z"
    },
    "min_self_delegation": "1"
  }
}
```

#### HistoricalInfo

The `HistoricalInfo` REST endpoint queries the historical information for given height.

```bash
/cosmos/staking/v1beta1/historical_info/{height}
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/historical_info/153332" -H  "accept: application/json"
```

Example Output:

```bash
{
  "hist": {
    "header": {
      "version": {
        "block": "11",
        "app": "0"
      },
      "chain_id": "cosmos-1",
      "height": "153332",
      "time": "2021-10-12T09:05:35.062230221Z",
      "last_block_id": {
        "hash": "NX8HevR5khb7H6NGKva+jVz7cyf0skF1CrcY9A0s+d8=",
        "part_set_header": {
          "total": 1,
          "hash": "zLQ2FiKM5tooL3BInt+VVfgzjlBXfq0Hc8Iux/xrhdg="
        }
      },
      "last_commit_hash": "P6IJrK8vSqU3dGEyRHnAFocoDGja0bn9euLuy09s350=",
      "data_hash": "eUd+6acHWrNXYju8Js449RJ99lOYOs16KpqQl4SMrEM=",
      "validators_hash": "mB4pravvMsJKgi+g8aYdSeNlt0kPjnRFyvtAQtaxcfw=",
      "next_validators_hash": "mB4pravvMsJKgi+g8aYdSeNlt0kPjnRFyvtAQtaxcfw=",
      "consensus_hash": "BICRvH3cKD93v7+R1zxE2ljD34qcvIZ0Bdi389qtoi8=",
      "app_hash": "fuELArKRK+CptnZ8tu54h6xEleSWenHNmqC84W866fU=",
      "last_results_hash": "p/BPexV4LxAzlVcPRvW+lomgXb6Yze8YLIQUo/4Kdgc=",
      "evidence_hash": "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      "proposer_address": "G0MeY8xQx7ooOsni8KE/3R/Ib3Q="
    },
    "valset": [
      {
        "operator_address": "cosmosvaloper196ax4vc0lwpxndu9dyhvca7jhxp70rmcqcnylw",
        "consensus_pubkey": {
          "@type": "/cosmos.crypto.ed25519.PubKey",
          "key": "/O7BtNW0pafwfvomgR4ZnfldwPXiFfJs9mHg3gwfv5Q="
        },
        "jailed": false,
        "status": "BOND_STATUS_BONDED",
        "tokens": "1416521659632",
        "delegator_shares": "1416521659632.000000000000000000",
        "description": {
          "moniker": "SG-1",
          "identity": "48608633F99D1B60",
          "website": "https://sg-1.online",
          "security_contact": "",
          "details": "SG-1 - your favorite validator on cosmos. We offer 100% Soft Slash protection."
        },
        "unbonding_height": "0",
        "unbonding_time": "1970-01-01T00:00:00Z",
        "commission": {
          "commission_rates": {
            "rate": "0.037500000000000000",
            "max_rate": "0.200000000000000000",
            "max_change_rate": "0.030000000000000000"
          },
          "update_time": "2021-10-01T15:00:00Z"
        },
        "min_self_delegation": "1"
      },
      {
        "operator_address": "cosmosvaloper1t8ehvswxjfn3ejzkjtntcyrqwvmvuknzmvtaaa",
        "consensus_pubkey": {
          "@type": "/cosmos.crypto.ed25519.PubKey",
          "key": "uExZyjNLtr2+FFIhNDAMcQ8+yTrqE7ygYTsI7khkA5Y="
        },
        "jailed": false,
        "status": "BOND_STATUS_BONDED",
        "tokens": "1348298958808",
        "delegator_shares": "1348298958808.000000000000000000",
        "description": {
          "moniker": "Cosmostation",
          "identity": "AE4C403A6E7AA1AC",
          "website": "https://www.cosmostation.io",
          "security_contact": "admin@stamper.network",
          "details": "Cosmostation validator node. Delegate your tokens and Start Earning Staking Rewards"
        },
        "unbonding_height": "0",
        "unbonding_time": "1970-01-01T00:00:00Z",
        "commission": {
          "commission_rates": {
            "rate": "0.050000000000000000",
            "max_rate": "1.000000000000000000",
            "max_change_rate": "0.200000000000000000"
          },
          "update_time": "2021-10-01T15:06:38.821314287Z"
        },
        "min_self_delegation": "1"
      }
    ]
  }
}
```

#### Parameters

The `Parameters` REST endpoint queries the staking parameters.

```bash
/cosmos/staking/v1beta1/params
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/params" -H  "accept: application/json"
```

Example Output:

```bash
{
  "params": {
    "unbonding_time": "2419200s",
    "max_validators": 100,
    "max_entries": 7,
    "historical_entries": 10000,
    "bond_denom": "stake"
  }
}
```

#### Pool

The `Pool` REST endpoint queries the pool information.

```bash
/cosmos/staking/v1beta1/pool
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/pool" -H  "accept: application/json"
```

Example Output:

```bash
{
  "pool": {
    "not_bonded_tokens": "432805737458",
    "bonded_tokens": "15783637712645"
  }
}
```

#### Validators

The `Validators` REST endpoint queries all validators that match the given status.

```bash
/cosmos/staking/v1beta1/validators
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/validators" -H  "accept: application/json"
```

Example Output:

```bash
{
  "validators": [
    {
      "operator_address": "cosmosvaloper1q3jsx9dpfhtyqqgetwpe5tmk8f0ms5qywje8tw",
      "consensus_pubkey": {
        "@type": "/cosmos.crypto.ed25519.PubKey",
        "key": "N7BPyek2aKuNZ0N/8YsrqSDhGZmgVaYUBuddY8pwKaE="
      },
      "jailed": false,
      "status": "BOND_STATUS_BONDED",
      "tokens": "383301887799",
      "delegator_shares": "383301887799.000000000000000000",
      "description": {
        "moniker": "SmartNodes",
        "identity": "D372724899D1EDC8",
        "website": "https://smartnodes.co",
        "security_contact": "",
        "details": "Earn Rewards with Crypto Staking & Node Deployment"
      },
      "unbonding_height": "0",
      "unbonding_time": "1970-01-01T00:00:00Z",
      "commission": {
        "commission_rates": {
          "rate": "0.050000000000000000",
          "max_rate": "0.200000000000000000",
          "max_change_rate": "0.100000000000000000"
        },
        "update_time": "2021-10-01T15:51:31.596618510Z"
      },
      "min_self_delegation": "1"
    },
    {
      "operator_address": "cosmosvaloper1q5ku90atkhktze83j9xjaks2p7uruag5zp6wt7",
      "consensus_pubkey": {
        "@type": "/cosmos.crypto.ed25519.PubKey",
        "key": "GDNpuKDmCg9GnhnsiU4fCWktuGUemjNfvpCZiqoRIYA="
      },
      "jailed": false,
      "status": "BOND_STATUS_UNBONDING",
      "tokens": "1017819654",
      "delegator_shares": "1017819654.000000000000000000",
      "description": {
        "moniker": "Noderunners",
        "identity": "812E82D12FEA3493",
        "website": "http://noderunners.biz",
        "security_contact": "info@noderunners.biz",
        "details": "Noderunners is a professional validator in POS networks. We have a huge node running experience, reliable soft and hardware. Our commissions are always low, our support to delegators is always full. Stake with us and start receiving your cosmos rewards now!"
      },
      "unbonding_height": "147302",
      "unbonding_time": "2021-11-08T22:58:53.718662452Z",
      "commission": {
        "commission_rates": {
          "rate": "0.050000000000000000",
          "max_rate": "0.200000000000000000",
          "max_change_rate": "0.100000000000000000"
        },
        "update_time": "2021-10-04T18:02:21.446645619Z"
      },
      "min_self_delegation": "1"
    }
  ],
  "pagination": {
    "next_key": "FONDBFkE4tEEf7yxWWKOD49jC2NK",
    "total": "2"
  }
}
```

#### Validator

The `Validator` REST endpoint queries validator information for given validator address.

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}
```

Example:

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q" \
-H  "accept: application/json"
```

Example Output:

```bash
{
  "validator": {
    "operator_address": "cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q",
    "consensus_pubkey": {
      "@type": "/cosmos.crypto.ed25519.PubKey",
      "key": "sIiexdJdYWn27+7iUHQJDnkp63gq/rzUq1Y+fxoGjXc="
    },
    "jailed": false,
    "status": "BOND_STATUS_BONDED",
    "tokens": "33027900000",
    "delegator_shares": "33027900000.000000000000000000",
    "description": {
      "moniker": "Witval",
      "identity": "51468B615127273A",
      "website": "",
      "security_contact": "",
      "details": "Witval is the validator arm from Vitwit. Vitwit is into software consulting and services business since 2015. We are working closely with Cosmos ecosystem since 2018. We are also building tools for the ecosystem, Aneka is our explorer for the cosmos ecosystem."
    },
    "unbonding_height": "0",
    "unbonding_time": "1970-01-01T00:00:00Z",
    "commission": {
      "commission_rates": {
        "rate": "0.050000000000000000",
        "max_rate": "0.200000000000000000",
        "max_change_rate": "0.020000000000000000"
      },
      "update_time": "2021-10-01T19:24:52.663191049Z"
    },
    "min_self_delegation": "1"
  }
}
```

#### ValidatorDelegations

The `ValidatorDelegations` REST endpoint queries delegate information for given validator.

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}/delegations
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q/delegations" -H  "accept: application/json"
```

Example Output:

```bash
{
  "delegation_responses": [
    {
      "delegation": {
        "delegator_address": "cosmos190g5j8aszqhvtg7cprmev8xcxs6csra7xnk3n3",
        "validator_address": "cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q",
        "shares": "31000000000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "31000000000"
      }
    },
    {
      "delegation": {
        "delegator_address": "cosmos1ddle9tczl87gsvmeva3c48nenyng4n56qwq4ee",
        "validator_address": "cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q",
        "shares": "628470000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "628470000"
      }
    },
    {
      "delegation": {
        "delegator_address": "cosmos10fdvkczl76m040smd33lh9xn9j0cf26kk4s2nw",
        "validator_address": "cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q",
        "shares": "838120000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "838120000"
      }
    },
    {
      "delegation": {
        "delegator_address": "cosmos1n8f5fknsv2yt7a8u6nrx30zqy7lu9jfm0t5lq8",
        "validator_address": "cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q",
        "shares": "500000000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "500000000"
      }
    },
    {
      "delegation": {
        "delegator_address": "cosmos16msryt3fqlxtvsy8u5ay7wv2p8mglfg9hrek2e",
        "validator_address": "cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q",
        "shares": "61310000.000000000000000000"
      },
      "balance": {
        "denom": "stake",
        "amount": "61310000"
      }
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "5"
  }
}
```

#### Delegation

The `Delegation` REST endpoint queries delegate information for given validator delegator pair.

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}/delegations/{delegatorAddr}
```

Example:

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q/delegations/cosmos1n8f5fknsv2yt7a8u6nrx30zqy7lu9jfm0t5lq8" \
-H  "accept: application/json"
```

Example Output:

```bash
{
  "delegation_response": {
    "delegation": {
      "delegator_address": "cosmos1n8f5fknsv2yt7a8u6nrx30zqy7lu9jfm0t5lq8",
      "validator_address": "cosmosvaloper16msryt3fqlxtvsy8u5ay7wv2p8mglfg9g70e3q",
      "shares": "500000000.000000000000000000"
    },
    "balance": {
      "denom": "stake",
      "amount": "500000000"
    }
  }
}
```

#### UnbondingDelegation

The `UnbondingDelegation` REST endpoint queries unbonding information for given validator delegator pair.

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}/delegations/{delegatorAddr}/unbonding_delegation
```

Example:

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper13v4spsah85ps4vtrw07vzea37gq5la5gktlkeu/delegations/cosmos1ze2ye5u5k3qdlexvt2e0nn0508p04094ya0qpm/unbonding_delegation" \
-H  "accept: application/json"
```

Example Output:

```bash
{
  "unbond": {
    "delegator_address": "cosmos1ze2ye5u5k3qdlexvt2e0nn0508p04094ya0qpm",
    "validator_address": "cosmosvaloper13v4spsah85ps4vtrw07vzea37gq5la5gktlkeu",
    "entries": [
      {
        "creation_height": "153687",
        "completion_time": "2021-11-09T09:41:18.352401903Z",
        "initial_balance": "525111",
        "balance": "525111"
      }
    ]
  }
}
```

#### ValidatorUnbondingDelegations

The `ValidatorUnbondingDelegations` REST endpoint queries unbonding delegations of a validator.

```bash
/cosmos/staking/v1beta1/validators/{validatorAddr}/unbonding_delegations
```

Example:

```bash
curl -X GET \
"http://localhost:1317/cosmos/staking/v1beta1/validators/cosmosvaloper13v4spsah85ps4vtrw07vzea37gq5la5gktlkeu/unbonding_delegations" \
-H  "accept: application/json"
```

Example Output:

```bash
{
  "unbonding_responses": [
    {
      "delegator_address": "cosmos1q9snn84jfrd9ge8t46kdcggpe58dua82vnj7uy",
      "validator_address": "cosmosvaloper13v4spsah85ps4vtrw07vzea37gq5la5gktlkeu",
      "entries": [
        {
          "creation_height": "90998",
          "completion_time": "2021-11-05T00:14:37.005841058Z",
          "initial_balance": "24000000",
          "balance": "24000000"
        }
      ]
    },
    {
      "delegator_address": "cosmos1qf36e6wmq9h4twhdvs6pyq9qcaeu7ye0s3dqq2",
      "validator_address": "cosmosvaloper13v4spsah85ps4vtrw07vzea37gq5la5gktlkeu",
      "entries": [
        {
          "creation_height": "47478",
          "completion_time": "2021-11-01T22:47:26.714116854Z",
          "initial_balance": "8000000",
          "balance": "8000000"
        }
      ]
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```
