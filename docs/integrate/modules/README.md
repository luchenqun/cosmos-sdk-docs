# 模块概述

以下是可用于 Cosmos SDK 应用程序的一些生产级模块，以及它们各自的文档：

* [Auth](auth/README.md) - 用于 Cosmos SDK 应用程序的账户和交易的身份验证。
* [Authz](authz/README.md) - 允许账户代表其他账户执行操作的授权。
* [Bank](bank/README.md) - 代币转账功能。
* [Crisis](crisis/README.md) - 在特定情况下（例如，不变量被破坏）停止区块链。
* [Distribution](distribution/README.md) - 费用分配和质押代币供应分配。
* [Evidence](evidence/README.md) - 处理双重签名、恶意行为等证据。
* [Feegrant](feegrant/README.md) - 授予执行交易的费用津贴。
* [Governance](gov/README.md) - 链上提案和投票。
* [Mint](mint/README.md) - 创建新的质押代币单位。
* [Params](params/README.md) - 全局可用的参数存储。
* [Slashing](slashing/README.md) - 验证人惩罚机制。
* [Staking](staking/README.md) - 公共区块链的权益证明层。
* [Upgrade](upgrade/README.md) - 软件升级处理和协调。
* [NFT](nft/README.md) - 基于 [ADR43](https://docs.cosmos.network/main/architecture/adr-043-nft-module.html) 实现的 NFT 模块。
* [Consensus](consensus/README.md) - 修改 CometBFT 的 ABCI 共识参数的共识模块。
* [Circuit](circuit/README.md) - 用于暂停消息的断路器模块。
* [Genutil](genutil/README.md) - 用于 Cosmos SDK 的创世工具。

要了解有关构建模块的过程的更多信息，请访问[构建模块参考文档](https://docs.cosmos.network/main/building-modules/intro)。

## IBC

SDK 的 IBC 模块由 IBC Go 团队在其[独立存储库](https://github.com/cosmos/ibc-go)中维护。

此外，[capability 模块](https://github.com/cosmos/ibc-go/tree/fdd664698d79864f1e00e147f9879e58497b5ef1/modules/capability)从 v0.48+ 开始由 IBC Go 团队在其[独立存储库](https://github.com/cosmos/ibc-go/tree/fdd664698d79864f1e00e147f9879e58497b5ef1/modules/capability)中维护。

## CosmWasm

CosmWasm模块使智能合约成为可能，了解更多信息请访问他们的[文档网站](https://book.cosmwasm.com/)，或者访问[代码库](https://github.com/CosmWasm/cosmwasm)。

## EVM

在官方的[`evm`文档页面](https://docs.evmos.org/modules/evm/)上了解更多关于使用solidity编写智能合约的信息。


# Module Summary

Here are some production-grade modules that can be used in Cosmos SDK applications, along with their respective documentation:

* [Auth](auth/README.md) - Authentication of accounts and transactions for Cosmos SDK applications.
* [Authz](authz/README.md) - Authorization for accounts to perform actions on behalf of other accounts.
* [Bank](bank/README.md) - Token transfer functionalities.
* [Crisis](crisis/README.md) - Halting the blockchain under certain circumstances (e.g. if an invariant is broken).
* [Distribution](distribution/README.md) - Fee distribution, and staking token provision distribution.
* [Evidence](evidence/README.md) - Evidence handling for double signing, misbehaviour, etc.
* [Feegrant](feegrant/README.md) - Grant fee allowances for executing transactions.
* [Governance](gov/README.md) - On-chain proposals and voting.
* [Mint](mint/README.md) - Creation of new units of staking token.
* [Params](params/README.md) - Globally available parameter store.
* [Slashing](slashing/README.md) - Validator punishment mechanisms.
* [Staking](staking/README.md) - Proof-of-Stake layer for public blockchains.
* [Upgrade](upgrade/README.md) - Software upgrades handling and coordination.
* [NFT](nft/README.md) - NFT module implemented based on [ADR43](https://docs.cosmos.network/main/architecture/adr-043-nft-module.html).
* [Consensus](consensus/README.md) - Consensus module for modifying CometBFT's ABCI consensus params.
* [Circuit](circuit/README.md) - Circuit breaker module for pausing messages.
* [Genutil](genutil/README.md) - Genesis utilities for the Cosmos SDK.

To learn more about the process of building modules, visit the [building modules reference documentation](https://docs.cosmos.network/main/building-modules/intro).

## IBC

The IBC module for the SDK is maintained by the IBC Go team in its [own repository](https://github.com/cosmos/ibc-go).

Additionally, the [capability module](https://github.com/cosmos/ibc-go/tree/fdd664698d79864f1e00e147f9879e58497b5ef1/modules/capability) is from v0.48+ maintained by the IBC Go team in its [own repository](https://github.com/cosmos/ibc-go/tree/fdd664698d79864f1e00e147f9879e58497b5ef1/modules/capability).

## CosmWasm

The CosmWasm module enables smart contracts, learn more by going to their [documentation site](https://book.cosmwasm.com/), or visit [the repository](https://github.com/CosmWasm/cosmwasm).

## EVM

Read more about writing smart contracts with solidity at the official [`evm` documentation page](https://docs.evmos.org/modules/evm/).
