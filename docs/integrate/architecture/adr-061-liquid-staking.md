# ADR ADR-061: 流动权益质押

## 变更日志

* 2022-09-10: 初始草案 (@zmanian)

## 状态

已接受

## 摘要

在默认的 Cosmos SDK 质押模块中添加一个半同质流动权益质押原语。这将升级权益证明机制，实现更低的货币发行总量和与多个流动权益质押协议（如 Stride、Persistence、Quicksilver、Lido 等）的集成。

## 背景

Cosmos Hub 的初始发布包含了一种突破性的权益证明机制，具备委托、惩罚、协议内奖励分配和自适应发行等功能。这个设计在2016年是最先进的，并且已经在许多 L1 区块链上部署，没有进行重大更改。

随着权益证明和区块链用例的成熟，这个设计已经过时，不再被视为良好的基准权益证明发行。在应用特定区块链的世界中，不可能有一个适用于所有的区块链，但 Cosmos SDK 致力于提供一个良好的基准实现，适用于 Cosmos Hub。

传统权益质押设计最重要的不足之处在于与链上的交易、借贷、衍生品等被统称为 DeFi 的协议组合效果不佳。传统权益质押实现通过自适应地增加无风险利率，使得这些应用缺乏流动性。基本上，它使得 DeFi 和权益质押的安全性有些不兼容。

Osmosis 团队采用了 Superfluid 和 Interfluid 的权益质押思想，即参与 DeFi 应用的资产也可以用于权益证明。这需要与一组固定的 DeFi 应用紧密集成，因此不适用于 Cosmos SDK。

还值得注意的是，默认的 IBC 实现中提供了 Interchain 账户，并且可以用于再质押委托。因此，流动权益质押已经是可能的，这些变更只是改进了流动权益质押的用户体验。中心化交易所也会再质押质押的资产，给去中心化带来了挑战。本 ADR 认为，在协议内采用流动权益质押是更可取的结果，并提供了新的激励机制来促进权益的去中心化。

这些对质押模块的更改已经开发了一年多，并得到了实质性的行业采用，计划构建质押用户体验。Informal团队的内部经济学家还对这些更改的影响进行了审查，并由此开发了豁免委托系统。该系统为治理提供了一个可调节的参数，用于调节委托代理问题的风险，称为豁免因子。

## 决策

我们在cosmos sdk中实现了半同质流动质押系统和豁免因子系统。尽管被注册为同质资产，这些代币化的股份的同质性非常有限，仅限于在代币化时创建的特定委托记录之间。这些资产可以用于场外交易，但与DeFi的组合性有限。主要预期的用例是改善流动质押提供者的用户体验。

引入了一个新的治理参数，定义了豁免股份与发行股份的比例，称为豁免因子。较大的豁免因子允许发行更多的代币化股份，以较小的豁免委托金额。如果治理对流动质押市场的发展感到满意，增加这个值是有意义的。

自我委托从质押系统中移除，预计将由豁免委托系统取而代之。豁免委托系统允许多个账户以团队成员、合作伙伴等的身份证明与验证者操作者的经济一致性，而不混合资金。在流动质押广泛采用后，治理调整了豁免因子，委托豁免很可能是增长验证者业务所必需的。

当股份被代币化时，底层股份将转移到一个模块账户，并且奖励将进入TokenizedShareRecord的模块账户。

不再有覆盖验证者对TokenizedShares的投票的机制。

### `MsgTokenizeShares`

MsgTokenizeShares消息用于创建代币化的委托代币。任何具有正数委托金额的委托人都可以执行此消息，在执行后，特定数量的委托将从账户中消失，并提供共享代币。共享代币以验证器和底层委托的记录ID为单位。

用户可以代币化部分或全部委托。

他们将收到以`cosmosvaloper1xxxx/5`为单位的共享代币，其中5是验证器操作者的记录ID。

如果账户是VestingAccount，则MsgTokenizeShares将失败。用户必须将待解锁的代币转移到新账户，并忍受解锁期。我们认为这是与跟踪待解锁代币所需的复杂记账相比的可接受权衡。

验证器的代币化共享总额将与免除委托乘以免除因子的总委托金额进行比较。如果代币化共享超过此限制，则执行失败。

MsgTokenizeSharesResponse提供生成的代币数量及其单位。


### `MsgRedeemTokensforShares`

MsgRedeemTokensforShares消息用于从共享代币中赎回委托。任何拥有共享代币的用户都可以执行此消息。执行后，委托将显示给用户。


### `MsgTransferTokenizeShareRecord`

MsgTransferTokenizeShareRecord消息用于转让从代币化委托中生成的奖励的所有权。当用户代币化其委托时，将创建代币化共享记录，并在赎回全部共享代币时删除。

这设计用于与不赎回代币化共享的流动权益设计配合使用，可能希望保持代币化共享。


### `MsgExemptDelegation`

MsgExemptDelegation消息用于免除对验证器的委托。如果免除因子大于0，则允许从验证器发行更多的委托份额。

此设计允许链强制要求参与流动权益方案的验证器进行自委托。

## 后果

### 向后兼容性

通过将豁免因子设置为零，该模块的工作方式类似于传统的质押。唯一的实质性变化是删除了最小自我质押，并且没有任何代币化的份额，因此没有豁免委托的激励。

### 积极的

这种方法应该能够与流动质押提供商进行集成，并改善用户体验。它为基线质押模块中的非指数发行政策提供了一条安全的路径。


# ADR ADR-061: Liquid Staking

## Changelog

* 2022-09-10: Initial Draft (@zmanian)

## Status

ACCEPTED

## Abstract

Add a semi-fungible liquid staking primitive to the default Cosmos SDK staking module. This upgrades proof of stake to enable safe designs with lower overall monetary issuance and integration with numerous liquid staking protocols like Stride, Persistence, Quicksilver, Lido etc.

## Context

The original release of the Cosmos Hub featured the implementation of a ground breaking proof of stake mechanism featuring delegation, slashing, in protocol reward distribution and adaptive issuance. This design was state of the art for 2016 and has been deployed without major changes by many L1 blockchains.

As both Proof of Stake and blockchain use cases have matured, this design has aged poorly and should no longer be considered a good baseline Proof of Stake issuance. In the world of application specific blockchains, there cannot be a one size fits all blockchain but the Cosmos SDK does endeavour to provide a good baseline implementation and one that is suitable for the Cosmos Hub.

The most important deficiency of the legacy staking design is that it composes poorly with on chain protocols for trading, lending, derivatives that are referred to collectively as DeFi. The legacy staking implementation starves these applications of liquidity by increasing the risk free rate adaptively. It basically makes DeFi and staking security somewhat incompatible. 

The Osmosis team has adopted the idea of Superfluid and Interfluid staking where assets that are participating in DeFi appliactions can also be used in proof of stake. This requires tight integration with an enshrined set of DeFi applications and thus is unsuitable for the Cosmos SDK.

It's also important to note that Interchain Accounts are available in the default IBC implementation and can be used to [rehypothecate](https://www.investopedia.com/terms/h/hypothecation.asp#toc-what-is-rehypothecation) delegations. Thus liquid staking is already possible and these changes merely improve the UX of liquid staking. Centralized exchanges also rehypothecate staked assets, posing challenges for decentralization. This ADR takes the position that adoption of in-protocol liquid staking is the preferable outcome and provides new levers to incentivize decentralization of stake. 

These changes to the staking module have been in development for more than a year and have seen substantial industry adoption who plan to build staking UX. The internal economics at Informal team has also done a review of the impacts of these changes and this review led to the development of the exempt delegation system. This system provides governance with a tuneable parameter for modulating the risks of principal agent problem called the exemption factor. 

## Decision

We implement the semi-fungible liquid staking system and exemption factor system within the cosmos sdk. Though registered as fungible assets, these tokenized shares have extremely limited fungibility, only among the specific delegation record that was created when shares were tokenized. These assets can be used for OTC trades but composability with DeFi is limited. The primary expected use case is improving the user experience of liquid staking providers.

A new governance parameter is introduced that defines the ratio of exempt to issued tokenized shares. This is called the exemption factor. A larger exemption factor allows more tokenized shares to be issued for a smaller amount of exempt delegations. If governance is comfortable with how the liquid staking market is evolving, it makes sense to increase this value.

Min self delegation is removed from the staking system with the expectation that it will be replaced by the exempt delegations system. The exempt delegation system allows multiple accounts to demonstrate economic alignment with the validator operator as team members, partners etc. without co-mingling funds. Delegation exemption will likely be required to grow the validators' business under widespread adoption of liquid staking once governance has adjusted the exemption factor.

When shares are tokenized, the underlying shares are transferred to a module account and rewards go to the module account for the TokenizedShareRecord. 

There is no longer a mechanism to override the validators vote for TokenizedShares.


### `MsgTokenizeShares`

The MsgTokenizeShares message is used to create tokenize delegated tokens. This message can be executed by any delegator who has positive amount of delegation and after execution the specific amount of delegation disappear from the account and share tokens are provided. Share tokens are denominated in the validator and record id of the underlying delegation.

A user may tokenize some or all of their delegation.

They will receive shares with the denom of `cosmosvaloper1xxxx/5` where 5 is the record id for the validator operator.

MsgTokenizeShares fails if the account is a VestingAccount. Users will have to move vested tokens to a new account and endure the unbonding period. We view this as an acceptable tradeoff vs. the complex book keeping required to track vested tokens.

The total amount of outstanding tokenized shares for the validator is checked against the sum of exempt delegations multiplied by the exemption factor. If the tokenized shares exceeds this limit, execution fails.

MsgTokenizeSharesResponse provides the number of tokens generated and their denom.


### `MsgRedeemTokensforShares`

The MsgRedeemTokensforShares message is used to redeem the delegation from share tokens. This message can be executed by any user who owns share tokens. After execution delegations will appear to the user.

### `MsgTransferTokenizeShareRecord`

The MsgTransferTokenizeShareRecord message is used to transfer the ownership of rewards generated from the tokenized amount of delegation. The tokenize share record is created when a user tokenize his/her delegation and deleted when the full amount of share tokens are redeemed.

This is designed to work with liquid staking designs that do not redeem the tokenized shares and may instead want to keep the shares tokenized.


### `MsgExemptDelegation`

The MsgExemptDelegation message is used to exempt a delegation to a validator. If the exemption factor is greater than 0, this will allow more delegation shares to be issued from the validator.

This design allows the chain to force an amount of self-delegation by validators participating in liquid staking schemes.

## Consequences

### Backwards Compatibility

By setting the exemption factor to zero, this module works like legacy staking. The only substantial change is the removal of min-self-bond and without any tokenized shares, there is no incentive to exempt delegation. 

### Positive

This approach should enable integration with liquid staking providers and improved user experience. It provides a pathway to security under non-exponential issuance policies in the baseline staking module.
