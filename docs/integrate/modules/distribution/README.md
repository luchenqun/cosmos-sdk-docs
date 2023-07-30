# `x/distribution`

## 概述

这个“简单”的分配机制描述了一种在验证者和委托人之间被动分配奖励的功能性方法。请注意，这种机制并不像主动奖励分配机制那样精确地分配资金，因此将来会进行升级。

该机制的运作方式如下。收集到的奖励被全球汇集起来，并被被动地分配给验证者和委托人。每个验证者都有机会向代表委托人收取佣金，该佣金是代表委托人收集到的奖励。费用直接收集到全球奖励池和验证者提案奖励池中。由于被动记账的性质，每当影响奖励分配速率的参数发生变化时，必须进行奖励的提取。

* 每次提取时，必须提取自己有权利的最大金额，不留在池中。
* 每当绑定、解绑或重新委托代币到现有账户时，必须进行奖励的完全提取（因为懒惰记账规则发生了变化）。
* 每当验证者选择更改奖励的佣金时，必须同时提取所有累积的佣金奖励。

上述情况在`hooks.md`中有所涉及。

此处概述的分配机制用于在验证者和相关委托人之间懒散地分配以下奖励：

* 多代币费用进行社会分配
* 通胀抵押资产规定
* 验证者对其委托人抵押所获得的所有奖励的佣金

费用在全球池中汇集。所使用的机制允许验证者和委托人独立地和懒散地提取他们的奖励。

## 缺点

作为懒散计算的一部分，每个委托人都持有一个特定于每个验证者的累积项，用于估计全球费用池中持有的代币的公平份额。

```text
entitlement = delegator-accumulation / all-delegators-accumulation
```

在每个区块中，如果有持续且相等的奖励代币流入，这种分配机制将等同于活跃分配（每个区块单独分配给所有委托人）。然而，这是不现实的，因此根据奖励代币的波动和其他委托人提取奖励的时间，与活跃分配会有偏差。

如果您得知即将有大量的奖励流入，您有动力在此事件之后才提取奖励，从而增加您现有的累积值的价值。有关详细信息，请参见[#2764](https://github.com/cosmos/cosmos-sdk/issues/2764)。

## 对质押的影响

在BPoS中，对Atom质押收取佣金，同时允许Atom质押自动绑定（直接分配给验证人的质押份额），这是有问题的。从根本上讲，这两种机制是互斥的。如果佣金和自动绑定机制同时应用于质押代币，则验证人和其委托人之间的质押代币分配将在每个区块中发生变化。这就需要为每个区块的每个委托记录进行计算，这被认为是计算上昂贵的。

总之，我们只能有Atom佣金和未绑定的Atom质押，或者有绑定的Atom质押但没有Atom佣金，我们选择实施前者。希望重新绑定其质押的利益相关者可以选择设置一个脚本，定期提取和重新绑定奖励。

## 目录

* [概念](#概念)
* [状态](#状态)
    * [费用池](#费用池)
    * [验证人分配](#验证人分配)
    * [委托分配](#委托分配)
    * [参数](#参数)
* [开始区块](#开始区块)
* [消息](#消息)
* [钩子](#钩子)
* [事件](#事件)
* [参数](#参数)
* [客户端](#客户端)
    * [CLI](#CLI)
    * [gRPC](#gRPC)

## 概念

在权益证明（PoS）区块链中，通过交易费用获得的奖励将支付给验证人。费用分配模块将奖励公平地分配给验证人的委托人。

奖励是按周期计算的。每当验证人的委托发生变化时，周期会更新，例如当验证人接收到新的委托时。
然后，可以通过将委托开始前周期的总奖励减去当前总奖励来计算单个验证人的奖励。
要了解更多信息，请参阅[F1费用分配论文](https://github.com/cosmos/cosmos-sdk/tree/main/docs/spec/fee_distribution/f1_fee_distr.pdf)。

验证人的佣金在验证人被移除或验证人请求提款时支付。
佣金是通过在每个`BeginBlock`操作中计算和累加以更新累积费用金额来计算的。

委托人的奖励在委托发生变化或被移除，或者请求提款时进行分发。
在分发奖励之前，会应用当前委托期间发生的所有对验证人的惩罚。

### F1费用分配中的引用计数

在F1费用分配中，委托人在撤回委托时计算其获得的奖励。此计算必须读取奖励总和除以从委托开始时委托的令牌份额到期间结束时委托的令牌份额的总和，并且读取为提款创建的最终期间。

此外，由于惩罚会改变委托的令牌数量（但我们只在委托人取消委托时才计算），因此我们必须在任何发生在委托人委托和提取奖励之间的惩罚之前/之后的不同期间计算奖励。因此，惩罚与委托一样，引用了由惩罚事件结束的期间。

因此，所有存储的历史奖励记录，如果不再被任何委托或惩罚引用，都可以安全地删除，因为它们将永远不会被读取（未来的委托和未来的惩罚将始终引用未来的期间）。这是通过在每个历史奖励存储条目中跟踪`ReferenceCount`来实现的。每当创建一个可能需要引用历史记录的新对象（委托或惩罚）时，引用计数会递增。每当删除先前需要引用历史记录的对象时，引用计数会递减。如果引用计数达到零，则删除历史记录。

## 状态

### 费用池

所有全局跟踪的分发参数都存储在`FeePool`中。奖励被收集并添加到奖励池中，然后从这里分发给验证人/委托人。

请注意，奖励池持有十进制币（`DecCoins`），以允许从通胀等操作中接收到币的小数部分。当从池中分发币时，它们会被截断为非十进制的`sdk.Coins`。

* 费用池：`0x00 -> ProtocolBuffer(FeePool)`

```go
// coins with decimal
type DecCoins []DecCoin

type DecCoin struct {
    Amount math.LegacyDec
    Denom  string
}
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/distribution.proto#L116-L123
```

### 验证人分发

与相关验证人的验证人分发信息在以下情况下更新：

1. 更新委托给验证人的委托金额，
2. 任何委托人从验证人处提取，或者
3. 验证人提取其佣金。

* 验证人分发信息：`0x02 | ValOperatorAddrLen (1 byte) | ValOperatorAddr -> ProtocolBuffer(validatorDistribution)`

```go
type ValidatorDistInfo struct {
    OperatorAddress     sdk.AccAddress
    SelfBondRewards     sdkmath.DecCoins
    ValidatorCommission types.ValidatorAccumulatedCommission
}
```

### 委托分发

每个委托分发只需要记录其上次提取费用的高度。因为每次委托的属性发生变化（例如绑定的代币等），委托必须每次提取费用，所以其属性将保持不变，委托人的_累积_因子可以通过仅知道上次提取的高度和当前属性来被动计算。

* 委托分发信息：`0x02 | DelegatorAddrLen (1 byte) | DelegatorAddr | ValOperatorAddrLen (1 byte) | ValOperatorAddr -> ProtocolBuffer(delegatorDist)`

```go
type DelegationDistInfo struct {
    WithdrawalHeight int64    // last time this delegation withdrew rewards
}
```

### 参数

分发模块将其参数存储在带有前缀`0x09`的状态中，可以通过治理或具有权限的地址进行更新。

* 参数：`0x09 | ProtocolBuffer(Params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/distribution.proto#L12-L42
```

## 开始区块

在每个`BeginBlock`中，前一个区块中收到的所有费用都会转移到分发`ModuleAccount`账户。当委托人或验证人提取奖励时，它们将从`ModuleAccount`中扣除。在开始区块时，对收集到的费用的不同索赔进行如下更新：

* 收取社区税。
* 剩余部分按照投票权重比例分配给所有绑定的验证者。

### 分配方案

有关参数的描述，请参见[params](#params)。

设`fees`为上一个区块中收集的总费用，包括通胀奖励。所有费用都在区块期间收集到特定的模块账户中。在`BeginBlock`期间，它们被发送到`"distribution"`模块账户。不会发生其他的代币发送。相反，每个账户有权获得的奖励被存储起来，可以通过`FundCommunityPool`、`WithdrawValidatorCommission`和`WithdrawDelegatorReward`消息来触发提款。

#### 社区池奖励

社区池获得`community_tax * fees`，以及验证者获得奖励后剩余的微小金额，总是向下取整到最近的整数值。

#### 验证者奖励

提案者不会获得额外的奖励。所有费用按照验证者的共识权重比例分配给所有绑定的验证者，包括提案者。

```text
powFrac = 验证者权重 / 总绑定验证者权重
voteMul = 1 - community_tax
```

所有验证者都会获得`fees * voteMul * powFrac`的奖励。

#### 委托人奖励

每个验证者的奖励会分配给其委托人。验证者还有一个自委托，它在分配计算中被视为常规委托。

验证者设置了佣金率。佣金率是灵活的，但每个验证者都设置了最大率和最大每日增长率。这些最大值不能超过，以保护委托人免受验证者佣金率突然增加的影响，以防止验证者获取所有奖励。

操作员有权获得的未结算奖励存储在`ValidatorAccumulatedCommission`中，委托人有权获得的奖励存储在`ValidatorCurrentRewards`中。在`BeginBlock`中不处理[概念](#concepts)中使用的[F1费用分配方案](#concepts)来计算每个委托人的奖励，而是在他们提款或更新委托时处理。

#### 分配示例

对于此示例分配，底层共识引擎根据验证人相对于整个绑定权重的比例选择块提议者。

所有验证人在将预提交包含在其提议的块中方面都是同样出色的。然后，保持 `(包含的预提交数) / (总绑定验证人权重)` 不变，以便验证人的摊销块奖励为 `(验证人权重 / 总绑定权重) * (1 - 社区税率)` 的总奖励。因此，单个委托人的奖励为：

```text
(delegator proportion of the validator power / validator power) * (validator power / total bonded power)
  * (1 - community tax rate) * (1 - validator commission rate)
= (delegator proportion of the validator power / total bonded power) * (1 -
community tax rate) * (1 - validator commission rate)
```

## 消息

### MsgSetWithdrawAddress

默认情况下，提取地址是委托人地址。要更改其提取地址，委托人必须发送 `MsgSetWithdrawAddress` 消息。
只有在参数 `WithdrawAddrEnabled` 设置为 `true` 时才能更改提取地址。

提取地址不能是任何模块账户。这些账户在初始化时被添加到分配 keeper 的 `blockedAddrs` 数组中，以阻止它们成为提取地址。

响应：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/tx.proto#L49-L60
```

```go
func (k Keeper) SetWithdrawAddr(ctx context.Context, delegatorAddr sdk.AccAddress, withdrawAddr sdk.AccAddress) error
	if k.blockedAddrs[withdrawAddr.String()] {
		fail with "`{withdrawAddr}` is not allowed to receive external funds"
	}

	if !k.GetWithdrawAddrEnabled(ctx) {
		fail with `ErrSetWithdrawAddrDisabled`
	}

	k.SetDelegatorWithdrawAddr(ctx, delegatorAddr, withdrawAddr)
```

### MsgWithdrawDelegatorReward

委托人可以提取其奖励。
在分配模块内部，此交易同时删除了先前的委托及其关联的奖励，就像委托人只是以相同价值开始了新的委托一样。
奖励立即从分配的 `ModuleAccount` 发送到提取地址。
任何剩余的奖励（截断小数）都会发送到社区池。
委托的起始高度设置为当前验证人周期，并递减前一个周期的引用计数。
提取的金额从验证人的 `ValidatorOutstandingRewards` 变量中扣除。

在 F1 分配中，总奖励是按验证人周期计算的，并且委托人按其在验证人中的股份比例获得一部分奖励。
在基本的 F1 中，所有委托人在两个周期之间有权获得的总奖励计算如下。
设 `R(X)` 为截至周期 `X` 的累积总奖励除以当时抵押的代币数。委托人的分配为 `R(X) * 委托人抵押`。
然后，委托人在周期 `A` 和 `B` 之间抵押的所有委托人的奖励为 `(R(B) - R(A)) * 总抵押`。
但是，这些计算的奖励不考虑惩罚。

考虑到斜杠，需要进行迭代。
设`F(X)`为在第`X`个周期发生的惩罚事件中应对验证人进行的惩罚比例。
如果验证人在周期`P1, ..., PN`中被惩罚，其中`A < P1`，`PN < B`，分配模块按照以下方式计算每个委托人的奖励`T(A, B)`：

```go
stake := initial stake
rewards := 0
previous := A
for P in P1, ..., PN`:
    rewards = (R(P) - previous) * stake
    stake = stake * F(P)
    previous = P
rewards = rewards + (R(B) - R(PN)) * stake
```

历史奖励是通过回放所有的惩罚并在每一步中减少委托人的质押份额来进行计算的。
最终计算出的质押份额与委托中实际质押的代币相等，但由于舍入误差会存在一定的误差。

响应：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/tx.proto#L66-L77
```

### 提取验证人佣金

验证人可以发送`WithdrawValidatorCommission`消息来提取其累积佣金。
佣金在每个区块的`BeginBlock`阶段计算，因此无需迭代即可提取。
提取的金额将从验证人的`ValidatorOutstandingRewards`变量中扣除。
只能发送整数金额。如果累积奖励有小数部分，则在发送提款之前将其截断，剩余部分将留待以后提取。

### 资助社区资金池

该消息将代币直接从发送者发送到社区资金池。

如果无法将金额从发送者转移到分配模块账户，则交易失败。

```go
func (k Keeper) FundCommunityPool(ctx context.Context, amount sdk.Coins, sender sdk.AccAddress) error {
    if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, sender, types.ModuleName, amount); err != nil {
        return err
    }

	feePool := k.GetFeePool(ctx)
	feePool.CommunityPool = feePool.CommunityPool.Add(sdk.NewDecCoinsFromCoins(amount...)...)
	k.SetFeePool(ctx, feePool)

	return nil
}
```

### 常见的分配操作

这些操作在许多不同的消息中发生。

#### 初始化委托

每次更改委托时，都会提取奖励并重新初始化委托。
初始化委托会增加验证人的周期，并跟踪委托的起始周期。

```go
// initialize starting info for a new delegation
func (k Keeper) initializeDelegation(ctx context.Context, val sdk.ValAddress, del sdk.AccAddress) {
    // period has already been incremented - we want to store the period ended by this delegation action
    previousPeriod := k.GetValidatorCurrentRewards(ctx, val).Period - 1

	// increment reference count for the period we're going to track
	k.incrementReferenceCount(ctx, val, previousPeriod)

	validator := k.stakingKeeper.Validator(ctx, val)
	delegation := k.stakingKeeper.Delegation(ctx, del, val)

	// calculate delegation stake in tokens
	// we don't store directly, so multiply delegation shares * (tokens per share)
	// note: necessary to truncate so we don't allow withdrawing more rewards than owed
	stake := validator.TokensFromSharesTruncated(delegation.GetShares())
	k.SetDelegatorStartingInfo(ctx, val, del, types.NewDelegatorStartingInfo(previousPeriod, stake, uint64(ctx.BlockHeight())))
}
```

### MsgUpdateParams

可以通过`MsgUpdateParams`更新分配模块参数，可以使用治理提案进行更新，签名者将始终是治理模块账户地址。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/tx.proto#L133-L147
```

如果出现以下情况，消息处理可能会失败：

* 签名者不是治理模块账户地址。

## 钩子函数

此模块可以调用和被其他模块调用的可用钩子函数。

### 创建或修改委托分发

* 触发者：`staking.MsgDelegate`、`staking.MsgBeginRedelegate`、`staking.MsgUndelegate`

#### Before

* 委托奖励会被提取到委托人的提取地址。
  奖励包括当前周期，但不包括起始周期。
* 验证人周期会增加。
  验证人周期会增加，因为验证人的权重和份额分配可能已发生变化。
* 委托人起始周期的引用计数会减少。

#### After

委托的起始高度会设置为上一个周期。
由于 `Before` 钩子函数的作用，这个周期是委托人获得奖励的最后一个周期。

### 创建验证人

* 触发者：`staking.MsgCreateValidator`

创建验证人时，会初始化以下验证人变量：

* 历史奖励
* 当前累积奖励
* 累积佣金
* 总未领取奖励
* 周期

默认情况下，所有值都设置为 `0`，只有周期设置为 `1`。

### 移除验证人

* 触发者：`staking.RemoveValidator`

未领取的佣金会发送到验证人自委托提取地址。
剩余的委托人奖励会发送到社区费用池。

注意：只有当验证人没有剩余委托时，才会移除验证人。
此时，所有未领取的委托人奖励都已提取。
任何剩余奖励都是微小金额。

### 验证人被惩罚

* 触发者：`staking.Slash`
* 当前验证人周期的引用计数会增加。
  引用计数会增加，因为惩罚事件已对其创建了引用。
* 验证人周期会增加。
* 惩罚事件会被存储以供后续使用。
  在计算委托人奖励时，会引用惩罚事件。

## 事件

分发模块会发出以下事件：

### BeginBlocker

| 类型            | 属性键        | 属性值               |
| --------------- | ------------- | -------------------- |
| proposer_reward | validator     | {validatorAddress}   |
| proposer_reward | reward        | {proposerReward}     |
| commission      | amount        | {commissionAmount}   |
| commission      | validator     | {validatorAddress}   |
| rewards         | amount        | {rewardAmount}       |
| rewards         | validator     | {validatorAddress}   |

### 处理器

#### MsgSetWithdrawAddress

| 类型                 | 属性键           | 属性值                 |
| -------------------- | ---------------- | ---------------------- |
| set_withdraw_address | withdraw_address | {withdrawAddress}      |
| message              | module           | distribution           |
| message              | action           | set_withdraw_address   |
| message              | sender           | {senderAddress}        |

#### MsgWithdrawDelegatorReward

| 类型             | 属性键        | 属性值                 |
| ---------------- | ------------- | ---------------------- |
| withdraw_rewards | amount        | {rewardAmount}         |
| withdraw_rewards | validator     | {validatorAddress}     |
| message          | module        | distribution           |
| message          | action        | withdraw_delegator_reward |
| message          | sender        | {senderAddress}        |

#### MsgWithdrawValidatorCommission

| 类型                | 属性键        | 属性值                         |
| ------------------- | ------------- | ------------------------------ |
| withdraw_commission | amount        | {commissionAmount}             |
| message             | module        | distribution                   |
| message             | action        | withdraw_validator_commission   |
| message             | sender        | {senderAddress}                |

## 参数

分发模块包含以下参数：

| 键                  | 类型          | 示例                       |
| ------------------- | ------------- | -------------------------- |
| communitytax        | string (dec)  | "0.020000000000000000" [0] |
| withdrawaddrenabled | bool          | true                       |

* [0] `communitytax` 必须为正数且不能超过 1.00。
* `baseproposerreward` 和 `bonusproposerreward` 是在 v0.47 中弃用的参数，不再使用。

:::note
储备池是通过 `CommunityTax` 收取的资金池，用于治理目的。
目前，在 Cosmos SDK 中，通过 CommunityTax 收集的代币是被记录但无法使用的。
:::

## 客户端

## 命令行界面 (CLI)

用户可以使用命令行界面 (CLI) 查询和与 `distribution` 模块进行交互。

#### 查询

`query` 命令允许用户查询 `distribution` 状态。

```shell
simd query distribution --help
```

##### commission

`commission` 命令允许用户按地址查询验证人的佣金奖励。

```shell
simd query distribution commission [address] [flags]
```

示例：

```shell
simd query distribution commission cosmosvaloper1...
```

示例输出：

```yml
commission:
- amount: "1000000.000000000000000000"
  denom: stake
```

##### community-pool

`community-pool` 命令允许用户查询社区资金池中的所有代币余额。

```shell
simd query distribution community-pool [flags]
```

示例：

```shell
simd query distribution community-pool
```

示例输出：

```yml
pool:
- amount: "1000000.000000000000000000"
  denom: stake
```

##### params

`params` 命令允许用户查询 `distribution` 模块的参数。

```shell
simd query distribution params [flags]
```

示例：

```shell
simd query distribution params
```

示例输出：

```yml
base_proposer_reward: "0.000000000000000000"
bonus_proposer_reward: "0.000000000000000000"
community_tax: "0.020000000000000000"
withdraw_addr_enabled: true
```

##### rewards

`rewards` 命令允许用户查询委托人的奖励。用户可以选择包含验证人地址以查询从特定验证人获得的奖励。

```shell
simd query distribution rewards [delegator-addr] [validator-addr] [flags]
```

示例：

```shell
simd query distribution rewards cosmos1...
```

示例输出：

```yml
rewards:
- reward:
  - amount: "1000000.000000000000000000"
    denom: stake
  validator_address: cosmosvaloper1..
total:
- amount: "1000000.000000000000000000"
  denom: stake
```

##### slashes

`slashes` 命令允许用户查询给定区块范围内的所有惩罚。

```shell
simd query distribution slashes [validator] [start-height] [end-height] [flags]
```

示例：

```shell
simd query distribution slashes cosmosvaloper1... 1 1000
```

##### validator-outstanding-rewards

`validator-outstanding-rewards`命令允许用户查询验证人及其所有委托的所有未提取奖励。

```shell
simd query distribution validator-outstanding-rewards [validator] [flags]
```

示例：

```shell
simd query distribution validator-outstanding-rewards cosmosvaloper1...
```

示例输出：

```yml
rewards:
- amount: "1000000.000000000000000000"
  denom: stake
```

##### validator-distribution-info

`validator-distribution-info`命令允许用户查询验证人的佣金和自委托奖励。

```shell
simd query distribution validator-distribution-info cosmosvaloper1...
```

示例输出：

```yml
commission:
- amount: "100000.000000000000000000"
  denom: stake
operator_address: cosmosvaloper1...
self_bond_rewards:
- amount: "100000.000000000000000000"
  denom: stake
```

#### 交易

`tx`命令允许用户与`distribution`模块进行交互。

```shell
simd tx distribution --help
```

##### fund-community-pool

`fund-community-pool`命令允许用户向社区资金池发送资金。

```shell
simd tx distribution fund-community-pool [amount] [flags]
```

示例：

```shell
simd tx distribution fund-community-pool 100stake --from cosmos1...
```

##### set-withdraw-addr

`set-withdraw-addr`命令允许用户为与委托人地址关联的奖励设置提取地址。

```shell
simd tx distribution set-withdraw-addr [withdraw-addr] [flags]
```

示例：

```shell
simd tx distribution set-withdraw-addr cosmos1... --from cosmos1...
```

##### withdraw-all-rewards

`withdraw-all-rewards`命令允许用户提取委托人的所有奖励。

```shell
simd tx distribution withdraw-all-rewards [flags]
```

示例：

```shell
simd tx distribution withdraw-all-rewards --from cosmos1...
```

##### withdraw-rewards

`withdraw-rewards`命令允许用户从给定的委托地址提取所有奖励，
如果给定的委托地址是验证人操作者并且用户证明了`--commission`标志，则还可以提取验证人佣金。

```shell
simd tx distribution withdraw-rewards [validator-addr] [flags]
```

### gRPC

用户可以使用 gRPC 端点查询 `distribution` 模块。

#### Params

`Params` 端点允许用户查询 `distribution` 模块的参数。

示例：

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/Params
```

示例输出：

```json
{
  "params": {
    "communityTax": "20000000000000000",
    "baseProposerReward": "00000000000000000",
    "bonusProposerReward": "00000000000000000",
    "withdrawAddrEnabled": true
  }
}
```

#### ValidatorDistributionInfo

`ValidatorDistributionInfo` 查询验证人的佣金和自委托奖励。

示例：

```shell
grpcurl -plaintext \
    -d '{"validator_address":"cosmosvalop1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/ValidatorDistributionInfo
```

示例输出：

```json
{
  "commission": {
    "commission": [
      {
        "denom": "stake",
        "amount": "1000000000000000"
      }
    ]
  },
  "self_bond_rewards": [
    {
      "denom": "stake",
      "amount": "1000000000000000"
    }
  ],
  "validator_address": "cosmosvalop1..."
}
```

#### ValidatorOutstandingRewards

`ValidatorOutstandingRewards` 端点允许用户查询验证人地址的奖励。

示例：

```shell
grpcurl -plaintext \
    -d '{"validator_address":"cosmosvalop1.."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/ValidatorOutstandingRewards
```

示例输出：

```json
{
  "rewards": {
    "rewards": [
      {
        "denom": "stake",
        "amount": "1000000000000000"
      }
    ]
  }
}
```

#### ValidatorCommission

`ValidatorCommission` 端点允许用户查询验证人的累积佣金。

示例：

```shell
grpcurl -plaintext \
    -d '{"validator_address":"cosmosvalop1.."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/ValidatorCommission
```

示例输出：

```json
{
  "commission": {
    "commission": [
      {
        "denom": "stake",
        "amount": "1000000000000000"
      }
    ]
  }
}
```

#### ValidatorSlashes

`ValidatorSlashes` 端点允许用户查询验证人的惩罚事件。

示例：

```shell
grpcurl -plaintext \
    -d '{"validator_address":"cosmosvalop1.."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/ValidatorSlashes
```

示例输出：

```json
{
  "slashes": [
    {
      "validator_period": "20",
      "fraction": "0.009999999999999999"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### DelegationRewards

`DelegationRewards` 端点允许用户查询委托所获得的总奖励。

示例：

```shell
grpcurl -plaintext \
    -d '{"delegator_address":"cosmos1...","validator_address":"cosmosvalop1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/DelegationRewards
```

示例输出：

```json
{
  "rewards": [
    {
      "denom": "stake",
      "amount": "1000000000000000"
    }
  ]
}
```

#### DelegationTotalRewards

`DelegationTotalRewards` 端点允许用户查询每个验证人累积的总奖励。

示例：

```shell
grpcurl -plaintext \
    -d '{"delegator_address":"cosmos1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/DelegationTotalRewards
```

示例输出：

```json
{
  "rewards": [
    {
      "validatorAddress": "cosmosvaloper1...",
      "reward": [
        {
          "denom": "stake",
          "amount": "1000000000000000"
        }
      ]
    }
  ],
  "total": [
    {
      "denom": "stake",
      "amount": "1000000000000000"
    }
  ]
}
```

#### DelegatorValidators

`DelegatorValidators` 端点允许用户查询给定委托人的所有验证人。

示例：

```shell
grpcurl -plaintext \
    -d '{"delegator_address":"cosmos1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/DelegatorValidators
```

示例输出：

```json
{
  "validators": ["cosmosvaloper1..."]
}
```

#### DelegatorWithdrawAddress

`DelegatorWithdrawAddress` 端点允许用户查询委托人的提款地址。

示例：

```shell
grpcurl -plaintext \
    -d '{"delegator_address":"cosmos1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/DelegatorWithdrawAddress
```

示例输出：

```json
{
  "withdrawAddress": "cosmos1..."
}
```

#### 社区资金池

`CommunityPool` 端点允许用户查询社区资金池中的代币。

示例：

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/CommunityPool
```

示例输出：

```json
{
  "pool": [
    {
      "denom": "stake",
      "amount": "1000000000000000000"
    }
  ]
}
```




# `x/distribution`

## Overview

This _simple_ distribution mechanism describes a functional way to passively
distribute rewards between validators and delegators. Note that this mechanism does
not distribute funds in as precisely as active reward distribution mechanisms and
will therefore be upgraded in the future.

The mechanism operates as follows. Collected rewards are pooled globally and
divided out passively to validators and delegators. Each validator has the
opportunity to charge commission to the delegators on the rewards collected on
behalf of the delegators. Fees are collected directly into a global reward pool
and validator proposer-reward pool. Due to the nature of passive accounting,
whenever changes to parameters which affect the rate of reward distribution
occurs, withdrawal of rewards must also occur.

* Whenever withdrawing, one must withdraw the maximum amount they are entitled
   to, leaving nothing in the pool.
* Whenever bonding, unbonding, or re-delegating tokens to an existing account, a
   full withdrawal of the rewards must occur (as the rules for lazy accounting
   change).
* Whenever a validator chooses to change the commission on rewards, all accumulated
   commission rewards must be simultaneously withdrawn.

The above scenarios are covered in `hooks.md`.

The distribution mechanism outlined herein is used to lazily distribute the
following rewards between validators and associated delegators:

* multi-token fees to be socially distributed
* inflated staked asset provisions
* validator commission on all rewards earned by their delegators stake

Fees are pooled within a global pool. The mechanisms used allow for validators
and delegators to independently and lazily withdraw their rewards.

## Shortcomings

As a part of the lazy computations, each delegator holds an accumulation term
specific to each validator which is used to estimate what their approximate
fair portion of tokens held in the global fee pool is owed to them.

```text
entitlement = delegator-accumulation / all-delegators-accumulation
```

Under the circumstance that there was constant and equal flow of incoming
reward tokens every block, this distribution mechanism would be equal to the
active distribution (distribute individually to all delegators each block).
However, this is unrealistic so deviations from the active distribution will
occur based on fluctuations of incoming reward tokens as well as timing of
reward withdrawal by other delegators.

If you happen to know that incoming rewards are about to significantly increase,
you are incentivized to not withdraw until after this event, increasing the
worth of your existing _accum_. See [#2764](https://github.com/cosmos/cosmos-sdk/issues/2764)
for further details.

## Effect on Staking

Charging commission on Atom provisions while also allowing for Atom-provisions
to be auto-bonded (distributed directly to the validators bonded stake) is
problematic within BPoS. Fundamentally, these two mechanisms are mutually
exclusive. If both commission and auto-bonding mechanisms are simultaneously
applied to the staking-token then the distribution of staking-tokens between
any validator and its delegators will change with each block. This then
necessitates a calculation for each delegation records for each block -
which is considered computationally expensive.

In conclusion, we can only have Atom commission and unbonded atoms
provisions or bonded atom provisions with no Atom commission, and we elect to
implement the former. Stakeholders wishing to rebond their provisions may elect
to set up a script to periodically withdraw and rebond rewards.

## Contents

* [Concepts](#concepts)
* [State](#state)
    * [FeePool](#feepool)
    * [Validator Distribution](#validator-distribution)
    * [Delegation Distribution](#delegation-distribution)
    * [Params](#params)
* [Begin Block](#begin-block)
* [Messages](#messages)
* [Hooks](#hooks)
* [Events](#events)
* [Parameters](#parameters)
* [Client](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)

## Concepts

In Proof of Stake (PoS) blockchains, rewards gained from transaction fees are paid to validators. The fee distribution module fairly distributes the rewards to the validators' constituent delegators.

Rewards are calculated per period. The period is updated each time a validator's delegation changes, for example, when the validator receives a new delegation.
The rewards for a single validator can then be calculated by taking the total rewards for the period before the delegation started, minus the current total rewards.
To learn more, see the [F1 Fee Distribution paper](https://github.com/cosmos/cosmos-sdk/tree/main/docs/spec/fee_distribution/f1_fee_distr.pdf).

The commission to the validator is paid when the validator is removed or when the validator requests a withdrawal.
The commission is calculated and incremented at every `BeginBlock` operation to update accumulated fee amounts.

The rewards to a delegator are distributed when the delegation is changed or removed, or a withdrawal is requested.
Before rewards are distributed, all slashes to the validator that occurred during the current delegation are applied.

### Reference Counting in F1 Fee Distribution

In F1 fee distribution, the rewards a delegator receives are calculated when their delegation is withdrawn. This calculation must read the terms of the summation of rewards divided by the share of tokens from the period which they ended when they delegated, and the final period that was created for the withdrawal.

Additionally, as slashes change the amount of tokens a delegation will have (but we calculate this lazily,
only when a delegator un-delegates), we must calculate rewards in separate periods before / after any slashes
which occurred in between when a delegator delegated and when they withdrew their rewards. Thus slashes, like
delegations, reference the period which was ended by the slash event.

All stored historical rewards records for periods which are no longer referenced by any delegations
or any slashes can thus be safely removed, as they will never be read (future delegations and future
slashes will always reference future periods). This is implemented by tracking a `ReferenceCount`
along with each historical reward storage entry. Each time a new object (delegation or slash)
is created which might need to reference the historical record, the reference count is incremented.
Each time one object which previously needed to reference the historical record is deleted, the reference
count is decremented. If the reference count hits zero, the historical record is deleted.

## State

### FeePool

All globally tracked parameters for distribution are stored within
`FeePool`. Rewards are collected and added to the reward pool and
distributed to validators/delegators from here.

Note that the reward pool holds decimal coins (`DecCoins`) to allow
for fractions of coins to be received from operations like inflation.
When coins are distributed from the pool they are truncated back to
`sdk.Coins` which are non-decimal.

* FeePool: `0x00 -> ProtocolBuffer(FeePool)`

```go
// coins with decimal
type DecCoins []DecCoin

type DecCoin struct {
    Amount math.LegacyDec
    Denom  string
}
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/distribution.proto#L116-L123
```

### Validator Distribution

Validator distribution information for the relevant validator is updated each time:

1. delegation amount to a validator is updated,
2. any delegator withdraws from a validator, or
3. the validator withdraws its commission.

* ValidatorDistInfo: `0x02 | ValOperatorAddrLen (1 byte) | ValOperatorAddr -> ProtocolBuffer(validatorDistribution)`

```go
type ValidatorDistInfo struct {
    OperatorAddress     sdk.AccAddress
    SelfBondRewards     sdkmath.DecCoins
    ValidatorCommission types.ValidatorAccumulatedCommission
}
```

### Delegation Distribution

Each delegation distribution only needs to record the height at which it last
withdrew fees. Because a delegation must withdraw fees each time it's
properties change (aka bonded tokens etc.) its properties will remain constant
and the delegator's _accumulation_ factor can be calculated passively knowing
only the height of the last withdrawal and its current properties.

* DelegationDistInfo: `0x02 | DelegatorAddrLen (1 byte) | DelegatorAddr | ValOperatorAddrLen (1 byte) | ValOperatorAddr -> ProtocolBuffer(delegatorDist)`

```go
type DelegationDistInfo struct {
    WithdrawalHeight int64    // last time this delegation withdrew rewards
}
```

### Params

The distribution module stores it's params in state with the prefix of `0x09`,
it can be updated with governance or the address with authority.

* Params: `0x09 | ProtocolBuffer(Params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/distribution.proto#L12-L42
```

## Begin Block

At each `BeginBlock`, all fees received in the previous block are transferred to
the distribution `ModuleAccount` account. When a delegator or validator
withdraws their rewards, they are taken out of the `ModuleAccount`. During begin
block, the different claims on the fees collected are updated as follows:

* The reserve community tax is charged.
* The remainder is distributed proportionally by voting power to all bonded validators

### The Distribution Scheme

See [params](#params) for description of parameters.

Let `fees` be the total fees collected in the previous block, including
inflationary rewards to the stake. All fees are collected in a specific module
account during the block. During `BeginBlock`, they are sent to the
`"distribution"` `ModuleAccount`. No other sending of tokens occurs. Instead, the
rewards each account is entitled to are stored, and withdrawals can be triggered
through the messages `FundCommunityPool`, `WithdrawValidatorCommission` and
`WithdrawDelegatorReward`.

#### Reward to the Community Pool

The community pool gets `community_tax * fees`, plus any remaining dust after
validators get their rewards that are always rounded down to the nearest
integer value.

#### Reward To the Validators

The proposer receives no extra rewards. All fees are distributed among all the
bonded validators, including the proposer, in proportion to their consensus power.

```text
powFrac = validator power / total bonded validator power
voteMul = 1 - community_tax
```

All validators receive `fees * voteMul * powFrac`.

#### Rewards to Delegators

Each validator's rewards are distributed to its delegators. The validator also
has a self-delegation that is treated like a regular delegation in
distribution calculations.

The validator sets a commission rate. The commission rate is flexible, but each
validator sets a maximum rate and a maximum daily increase. These maximums cannot be exceeded and protect delegators from sudden increases of validator commission rates to prevent validators from taking all of the rewards.

The outstanding rewards that the operator is entitled to are stored in
`ValidatorAccumulatedCommission`, while the rewards the delegators are entitled
to are stored in `ValidatorCurrentRewards`. The [F1 fee distribution scheme](#concepts) is used to calculate the rewards per delegator as they
withdraw or update their delegation, and is thus not handled in `BeginBlock`.

#### Example Distribution

For this example distribution, the underlying consensus engine selects block proposers in
proportion to their power relative to the entire bonded power.

All validators are equally performant at including pre-commits in their proposed
blocks. Then hold `(pre_commits included) / (total bonded validator power)`
constant so that the amortized block reward for the validator is `( validator power / total bonded power) * (1 - community tax rate)` of
the total rewards. Consequently, the reward for a single delegator is:

```text
(delegator proportion of the validator power / validator power) * (validator power / total bonded power)
  * (1 - community tax rate) * (1 - validator commission rate)
= (delegator proportion of the validator power / total bonded power) * (1 -
community tax rate) * (1 - validator commission rate)
```

## Messages

### MsgSetWithdrawAddress

By default, the withdraw address is the delegator address. To change its withdraw address, a delegator must send a `MsgSetWithdrawAddress` message.
Changing the withdraw address is possible only if the parameter `WithdrawAddrEnabled` is set to `true`.

The withdraw address cannot be any of the module accounts. These accounts are blocked from being withdraw addresses by being added to the distribution keeper's `blockedAddrs` array at initialization.

Response:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/tx.proto#L49-L60
```

```go
func (k Keeper) SetWithdrawAddr(ctx context.Context, delegatorAddr sdk.AccAddress, withdrawAddr sdk.AccAddress) error
	if k.blockedAddrs[withdrawAddr.String()] {
		fail with "`{withdrawAddr}` is not allowed to receive external funds"
	}

	if !k.GetWithdrawAddrEnabled(ctx) {
		fail with `ErrSetWithdrawAddrDisabled`
	}

	k.SetDelegatorWithdrawAddr(ctx, delegatorAddr, withdrawAddr)
```

### MsgWithdrawDelegatorReward

A delegator can withdraw its rewards.
Internally in the distribution module, this transaction simultaneously removes the previous delegation with associated rewards, the same as if the delegator simply started a new delegation of the same value.
The rewards are sent immediately from the distribution `ModuleAccount` to the withdraw address.
Any remainder (truncated decimals) are sent to the community pool.
The starting height of the delegation is set to the current validator period, and the reference count for the previous period is decremented.
The amount withdrawn is deducted from the `ValidatorOutstandingRewards` variable for the validator.

In the F1 distribution, the total rewards are calculated per validator period, and a delegator receives a piece of those rewards in proportion to their stake in the validator.
In basic F1, the total rewards that all the delegators are entitled to between to periods is calculated the following way.
Let `R(X)` be the total accumulated rewards up to period `X` divided by the tokens staked at that time. The delegator allocation is `R(X) * delegator_stake`.
Then the rewards for all the delegators for staking between periods `A` and `B` are `(R(B) - R(A)) * total stake`.
However, these calculated rewards don't account for slashing.

Taking the slashes into account requires iteration.
Let `F(X)` be the fraction a validator is to be slashed for a slashing event that happened at period `X`.
If the validator was slashed at periods `P1, ..., PN`, where `A < P1`, `PN < B`, the distribution module calculates the individual delegator's rewards, `T(A, B)`, as follows:

```go
stake := initial stake
rewards := 0
previous := A
for P in P1, ..., PN`:
    rewards = (R(P) - previous) * stake
    stake = stake * F(P)
    previous = P
rewards = rewards + (R(B) - R(PN)) * stake
```

The historical rewards are calculated retroactively by playing back all the slashes and then attenuating the delegator's stake at each step.
The final calculated stake is equivalent to the actual staked coins in the delegation with a margin of error due to rounding errors.

Response:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/tx.proto#L66-L77
```

### WithdrawValidatorCommission

The validator can send the WithdrawValidatorCommission message to withdraw their accumulated commission.
The commission is calculated in every block during `BeginBlock`, so no iteration is required to withdraw.
The amount withdrawn is deducted from the `ValidatorOutstandingRewards` variable for the validator.
Only integer amounts can be sent. If the accumulated awards have decimals, the amount is truncated before the withdrawal is sent, and the remainder is left to be withdrawn later.

### FundCommunityPool

This message sends coins directly from the sender to the community pool.

The transaction fails if the amount cannot be transferred from the sender to the distribution module account.

```go
func (k Keeper) FundCommunityPool(ctx context.Context, amount sdk.Coins, sender sdk.AccAddress) error {
    if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, sender, types.ModuleName, amount); err != nil {
        return err
    }

	feePool := k.GetFeePool(ctx)
	feePool.CommunityPool = feePool.CommunityPool.Add(sdk.NewDecCoinsFromCoins(amount...)...)
	k.SetFeePool(ctx, feePool)

	return nil
}
```

### Common distribution operations

These operations take place during many different messages.

#### Initialize delegation

Each time a delegation is changed, the rewards are withdrawn and the delegation is reinitialized.
Initializing a delegation increments the validator period and keeps track of the starting period of the delegation.

```go
// initialize starting info for a new delegation
func (k Keeper) initializeDelegation(ctx context.Context, val sdk.ValAddress, del sdk.AccAddress) {
    // period has already been incremented - we want to store the period ended by this delegation action
    previousPeriod := k.GetValidatorCurrentRewards(ctx, val).Period - 1

	// increment reference count for the period we're going to track
	k.incrementReferenceCount(ctx, val, previousPeriod)

	validator := k.stakingKeeper.Validator(ctx, val)
	delegation := k.stakingKeeper.Delegation(ctx, del, val)

	// calculate delegation stake in tokens
	// we don't store directly, so multiply delegation shares * (tokens per share)
	// note: necessary to truncate so we don't allow withdrawing more rewards than owed
	stake := validator.TokensFromSharesTruncated(delegation.GetShares())
	k.SetDelegatorStartingInfo(ctx, val, del, types.NewDelegatorStartingInfo(previousPeriod, stake, uint64(ctx.BlockHeight())))
}
```

### MsgUpdateParams

Distribution module params can be updated through `MsgUpdateParams`, which can be done using governance proposal and the signer will always be gov module account address.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/distribution/v1beta1/tx.proto#L133-L147
```

The message handling can fail if:

* signer is not the gov module account address.

## Hooks

Available hooks that can be called by and from this module.

### Create or modify delegation distribution

* triggered-by: `staking.MsgDelegate`, `staking.MsgBeginRedelegate`, `staking.MsgUndelegate`

#### Before

* The delegation rewards are withdrawn to the withdraw address of the delegator.
  The rewards include the current period and exclude the starting period.
* The validator period is incremented.
  The validator period is incremented because the validator's power and share distribution might have changed.
* The reference count for the delegator's starting period is decremented.

#### After

The starting height of the delegation is set to the previous period.
Because of the `Before`-hook, this period is the last period for which the delegator was rewarded.

### Validator created

* triggered-by: `staking.MsgCreateValidator`

When a validator is created, the following validator variables are initialized:

* Historical rewards
* Current accumulated rewards
* Accumulated commission
* Total outstanding rewards
* Period

By default, all values are set to a `0`, except period, which is set to `1`.

### Validator removed

* triggered-by: `staking.RemoveValidator`

Outstanding commission is sent to the validator's self-delegation withdrawal address.
Remaining delegator rewards get sent to the community fee pool.

Note: The validator gets removed only when it has no remaining delegations.
At that time, all outstanding delegator rewards will have been withdrawn.
Any remaining rewards are dust amounts.

### Validator is slashed

* triggered-by: `staking.Slash`
* The current validator period reference count is incremented.
  The reference count is incremented because the slash event has created a reference to it.
* The validator period is incremented.
* The slash event is stored for later use.
  The slash event will be referenced when calculating delegator rewards.

## Events

The distribution module emits the following events:

### BeginBlocker

| Type            | Attribute Key | Attribute Value    |
| --------------- | ------------- | ------------------ |
| proposer_reward | validator     | {validatorAddress} |
| proposer_reward | reward        | {proposerReward}   |
| commission      | amount        | {commissionAmount} |
| commission      | validator     | {validatorAddress} |
| rewards         | amount        | {rewardAmount}     |
| rewards         | validator     | {validatorAddress} |

### Handlers

#### MsgSetWithdrawAddress

| Type                 | Attribute Key    | Attribute Value      |
| -------------------- | ---------------- | -------------------- |
| set_withdraw_address | withdraw_address | {withdrawAddress}    |
| message              | module           | distribution         |
| message              | action           | set_withdraw_address |
| message              | sender           | {senderAddress}      |

#### MsgWithdrawDelegatorReward

| Type             | Attribute Key | Attribute Value           |
| ---------------- | ------------- | ------------------------- |
| withdraw_rewards | amount        | {rewardAmount}            |
| withdraw_rewards | validator     | {validatorAddress}        |
| message          | module        | distribution              |
| message          | action        | withdraw_delegator_reward |
| message          | sender        | {senderAddress}           |

#### MsgWithdrawValidatorCommission

| Type                | Attribute Key | Attribute Value               |
| ------------------- | ------------- | ----------------------------- |
| withdraw_commission | amount        | {commissionAmount}            |
| message             | module        | distribution                  |
| message             | action        | withdraw_validator_commission |
| message             | sender        | {senderAddress}               |

## Parameters

The distribution module contains the following parameters:

| Key                 | Type         | Example                    |
| ------------------- | ------------ | -------------------------- |
| communitytax        | string (dec) | "0.020000000000000000" [0] |
| withdrawaddrenabled | bool         | true                       |

* [0] `communitytax` must be positive and cannot exceed 1.00.
* `baseproposerreward` and `bonusproposerreward` were parameters that are deprecated in v0.47 and are not used.

:::note
The reserve pool is the pool of collected funds for use by governance taken via the `CommunityTax`.
Currently with the Cosmos SDK, tokens collected by the CommunityTax are accounted for but unspendable.
:::

## Client

## CLI

A user can query and interact with the `distribution` module using the CLI.

#### Query

The `query` commands allow users to query `distribution` state.

```shell
simd query distribution --help
```

##### commission

The `commission` command allows users to query validator commission rewards by address.

```shell
simd query distribution commission [address] [flags]
```

Example:

```shell
simd query distribution commission cosmosvaloper1...
```

Example Output:

```yml
commission:
- amount: "1000000.000000000000000000"
  denom: stake
```

##### community-pool

The `community-pool` command allows users to query all coin balances within the community pool.

```shell
simd query distribution community-pool [flags]
```

Example:

```shell
simd query distribution community-pool
```

Example Output:

```yml
pool:
- amount: "1000000.000000000000000000"
  denom: stake
```

##### params

The `params` command allows users to query the parameters of the `distribution` module.

```shell
simd query distribution params [flags]
```

Example:

```shell
simd query distribution params
```

Example Output:

```yml
base_proposer_reward: "0.000000000000000000"
bonus_proposer_reward: "0.000000000000000000"
community_tax: "0.020000000000000000"
withdraw_addr_enabled: true
```

##### rewards

The `rewards` command allows users to query delegator rewards. Users can optionally include the validator address to query rewards earned from a specific validator.

```shell
simd query distribution rewards [delegator-addr] [validator-addr] [flags]
```

Example:

```shell
simd query distribution rewards cosmos1...
```

Example Output:

```yml
rewards:
- reward:
  - amount: "1000000.000000000000000000"
    denom: stake
  validator_address: cosmosvaloper1..
total:
- amount: "1000000.000000000000000000"
  denom: stake
```

##### slashes

The `slashes` command allows users to query all slashes for a given block range.

```shell
simd query distribution slashes [validator] [start-height] [end-height] [flags]
```

Example:

```shell
simd query distribution slashes cosmosvaloper1... 1 1000
```

Example Output:

```yml
pagination:
  next_key: null
  total: "0"
slashes:
- validator_period: 20,
  fraction: "0.009999999999999999"
```

##### validator-outstanding-rewards

The `validator-outstanding-rewards` command allows users to query all outstanding (un-withdrawn) rewards for a validator and all their delegations.

```shell
simd query distribution validator-outstanding-rewards [validator] [flags]
```

Example:

```shell
simd query distribution validator-outstanding-rewards cosmosvaloper1...
```

Example Output:

```yml
rewards:
- amount: "1000000.000000000000000000"
  denom: stake
```

##### validator-distribution-info

The `validator-distribution-info` command allows users to query validator commission and self-delegation rewards for validator.

```shell
simd query distribution validator-distribution-info cosmosvaloper1...
```

Example Output:

```yml
commission:
- amount: "100000.000000000000000000"
  denom: stake
operator_address: cosmosvaloper1...
self_bond_rewards:
- amount: "100000.000000000000000000"
  denom: stake
```

#### Transactions

The `tx` commands allow users to interact with the `distribution` module.

```shell
simd tx distribution --help
```

##### fund-community-pool

The `fund-community-pool` command allows users to send funds to the community pool.

```shell
simd tx distribution fund-community-pool [amount] [flags]
```

Example:

```shell
simd tx distribution fund-community-pool 100stake --from cosmos1...
```

##### set-withdraw-addr

The `set-withdraw-addr` command allows users to set the withdraw address for rewards associated with a delegator address.

```shell
simd tx distribution set-withdraw-addr [withdraw-addr] [flags]
```

Example:

```shell
simd tx distribution set-withdraw-addr cosmos1... --from cosmos1...
```

##### withdraw-all-rewards

The `withdraw-all-rewards` command allows users to withdraw all rewards for a delegator.

```shell
simd tx distribution withdraw-all-rewards [flags]
```

Example:

```shell
simd tx distribution withdraw-all-rewards --from cosmos1...
```

##### withdraw-rewards

The `withdraw-rewards` command allows users to withdraw all rewards from a given delegation address,
and optionally withdraw validator commission if the delegation address given is a validator operator and the user proves the `--commission` flag.

```shell
simd tx distribution withdraw-rewards [validator-addr] [flags]
```

Example:

```shell
simd tx distribution withdraw-rewards cosmosvaloper1... --from cosmos1... --commission
```

### gRPC

A user can query the `distribution` module using gRPC endpoints.

#### Params

The `Params` endpoint allows users to query parameters of the `distribution` module.

Example:

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/Params
```

Example Output:

```json
{
  "params": {
    "communityTax": "20000000000000000",
    "baseProposerReward": "00000000000000000",
    "bonusProposerReward": "00000000000000000",
    "withdrawAddrEnabled": true
  }
}
```

#### ValidatorDistributionInfo

The `ValidatorDistributionInfo` queries validator commission and self-delegation rewards for validator.

Example:

```shell
grpcurl -plaintext \
    -d '{"validator_address":"cosmosvalop1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/ValidatorDistributionInfo
```

Example Output:

```json
{
  "commission": {
    "commission": [
      {
        "denom": "stake",
        "amount": "1000000000000000"
      }
    ]
  },
  "self_bond_rewards": [
    {
      "denom": "stake",
      "amount": "1000000000000000"
    }
  ],
  "validator_address": "cosmosvalop1..."
}
```

#### ValidatorOutstandingRewards

The `ValidatorOutstandingRewards` endpoint allows users to query rewards of a validator address.

Example:

```shell
grpcurl -plaintext \
    -d '{"validator_address":"cosmosvalop1.."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/ValidatorOutstandingRewards
```

Example Output:

```json
{
  "rewards": {
    "rewards": [
      {
        "denom": "stake",
        "amount": "1000000000000000"
      }
    ]
  }
}
```

#### ValidatorCommission

The `ValidatorCommission` endpoint allows users to query accumulated commission for a validator.

Example:

```shell
grpcurl -plaintext \
    -d '{"validator_address":"cosmosvalop1.."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/ValidatorCommission
```

Example Output:

```json
{
  "commission": {
    "commission": [
      {
        "denom": "stake",
        "amount": "1000000000000000"
      }
    ]
  }
}
```

#### ValidatorSlashes

The `ValidatorSlashes` endpoint allows users to query slash events of a validator.

Example:

```shell
grpcurl -plaintext \
    -d '{"validator_address":"cosmosvalop1.."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/ValidatorSlashes
```

Example Output:

```json
{
  "slashes": [
    {
      "validator_period": "20",
      "fraction": "0.009999999999999999"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### DelegationRewards

The `DelegationRewards` endpoint allows users to query the total rewards accrued by a delegation.

Example:

```shell
grpcurl -plaintext \
    -d '{"delegator_address":"cosmos1...","validator_address":"cosmosvalop1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/DelegationRewards
```

Example Output:

```json
{
  "rewards": [
    {
      "denom": "stake",
      "amount": "1000000000000000"
    }
  ]
}
```

#### DelegationTotalRewards

The `DelegationTotalRewards` endpoint allows users to query the total rewards accrued by each validator.

Example:

```shell
grpcurl -plaintext \
    -d '{"delegator_address":"cosmos1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/DelegationTotalRewards
```

Example Output:

```json
{
  "rewards": [
    {
      "validatorAddress": "cosmosvaloper1...",
      "reward": [
        {
          "denom": "stake",
          "amount": "1000000000000000"
        }
      ]
    }
  ],
  "total": [
    {
      "denom": "stake",
      "amount": "1000000000000000"
    }
  ]
}
```

#### DelegatorValidators

The `DelegatorValidators` endpoint allows users to query all validators for given delegator.

Example:

```shell
grpcurl -plaintext \
    -d '{"delegator_address":"cosmos1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/DelegatorValidators
```

Example Output:

```json
{
  "validators": ["cosmosvaloper1..."]
}
```

#### DelegatorWithdrawAddress

The `DelegatorWithdrawAddress` endpoint allows users to query the withdraw address of a delegator.

Example:

```shell
grpcurl -plaintext \
    -d '{"delegator_address":"cosmos1..."}' \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/DelegatorWithdrawAddress
```

Example Output:

```json
{
  "withdrawAddress": "cosmos1..."
}
```

#### CommunityPool

The `CommunityPool` endpoint allows users to query the community pool coins.

Example:

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.distribution.v1beta1.Query/CommunityPool
```

Example Output:

```json
{
  "pool": [
    {
      "denom": "stake",
      "amount": "1000000000000000000"
    }
  ]
}
```
