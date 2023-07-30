# 什么是Cosmos SDK

[Cosmos SDK](https://github.com/cosmos/cosmos-sdk)是一个用于构建多资产公共权益证明（PoS）<df value="区块链">区块链</df>的开源框架，例如Cosmos Hub，以及权限控制的权威证明（PoA）区块链。使用Cosmos SDK构建的区块链通常被称为**特定应用区块链**。

Cosmos SDK的目标是允许开发人员轻松地从头开始创建自定义区块链，并能够与其他区块链进行本地互操作。我们将Cosmos SDK视为类似于npm的框架，用于在[CometBFT](https://github.com/cometbft/cometbft)之上构建安全的区块链应用程序。基于SDK的区块链由可组合的[模块](../../integrate/building-modules/01-intro.md)构建，其中大部分是开源的，并且可供任何开发人员随时使用。任何人都可以为Cosmos SDK创建一个模块，而将已构建的模块集成到应用程序中只需简单地导入它们。此外，Cosmos SDK是一个基于能力的系统，允许开发人员更好地推理模块之间交互的安全性。要深入了解能力，请跳转到[对象能力模型](../advanced-concepts/10-ocap.md)。

## 什么是特定应用区块链

当今区块链世界中的一种开发范式是虚拟机区块链，例如以太坊，其中开发通常围绕在现有区块链上构建去中心化应用作为一组智能合约。虽然智能合约对于某些用例（例如ICO）可能非常好，但对于构建复杂的去中心化平台来说，它们往往不够灵活。更一般地说，智能合约在灵活性、主权和性能方面具有局限性。

特定应用区块链提供了与虚拟机区块链完全不同的开发范式。特定应用区块链是定制化的区块链，用于运行单个应用程序：开发人员可以自由决定应用程序运行所需的设计决策。它们还可以提供更好的主权、安全性和性能。

了解更多关于[应用特定区块链](01-why-app-specific.md)的信息。

## 为什么选择 Cosmos SDK

Cosmos SDK 是目前构建自定义应用特定区块链的最先进框架。以下是一些选择使用 Cosmos SDK 构建去中心化应用程序的原因：

* Cosmos SDK 内置的默认共识引擎是 [CometBFT](https://github.com/cometbft/cometbft)。CometBFT 是目前（也是唯一）最成熟的 BFT 共识引擎。它被广泛应用于行业中，并被认为是构建权益证明系统的黄金标准共识引擎。
* Cosmos SDK 是开源的，并且旨在通过可组合的[模块](../../integrate/modules)轻松构建区块链。随着开源 Cosmos SDK 模块生态系统的不断发展，使用它构建复杂的去中心化平台将变得越来越容易。
* Cosmos SDK 受到基于能力的安全性的启发，并通过多年与区块链状态机的斗争而得到改进。这使得 Cosmos SDK 成为构建区块链的非常安全的环境。
* 最重要的是，Cosmos SDK 已经被用于构建许多应用特定区块链，这些区块链已经投入生产。其中包括 [Cosmos Hub](https://hub.cosmos.network)、[IRIS Hub](https://irisnet.org)、[Binance Chain](https://docs.binance.org/)、[Terra](https://terra.money/) 或 [Kava](https://www.kava.io/)。[还有更多](https://cosmos.network/ecosystem)正在基于 Cosmos SDK 进行开发。

## 开始使用 Cosmos SDK

* 了解有关 Cosmos SDK 应用程序架构的更多信息，请参阅[教程](02-sdk-app-architecture.md)。
* 通过 [Cosmos SDK 教程](https://cosmos.network/docs/tutorial)了解如何从头开始构建应用特定区块链。


# What is the Cosmos SDK

The [Cosmos SDK](https://github.com/cosmos/cosmos-sdk) is an open-source framework for building multi-asset public Proof-of-Stake (PoS) <df value="blockchain">blockchains</df>, like the Cosmos Hub, as well as permissioned Proof-of-Authority (PoA) blockchains. Blockchains built with the Cosmos SDK are generally referred to as **application-specific blockchains**.

The goal of the Cosmos SDK is to allow developers to easily create custom blockchains from scratch that can natively interoperate with other blockchains. We envision the Cosmos SDK as the npm-like framework to build secure blockchain applications on top of [CometBFT](https://github.com/cometbft/cometbft). SDK-based blockchains are built out of composable [modules](../../integrate/building-modules/01-intro.md), most of which are open-source and readily available for any developers to use. Anyone can create a module for the Cosmos SDK, and integrating already-built modules is as simple as importing them into your blockchain application. What's more, the Cosmos SDK is a capabilities-based system that allows developers to better reason about the security of interactions between modules. For a deeper look at capabilities, jump to [Object-Capability Model](../advanced-concepts/10-ocap.md).

## What are Application-Specific Blockchains

One development paradigm in the blockchain world today is that of virtual-machine blockchains like Ethereum, where development generally revolves around building decentralized applications on top of an existing blockchain as a set of smart contracts. While smart contracts can be very good for some use cases like single-use applications (e.g. ICOs), they often fall short for building complex decentralized platforms. More generally, smart contracts can be limiting in terms of flexibility, sovereignty and performance.

Application-specific blockchains offer a radically different development paradigm than virtual-machine blockchains. An application-specific blockchain is a blockchain customized to operate a single application: developers have all the freedom to make the design decisions required for the application to run optimally. They can also provide better sovereignty, security and performance.

Learn more about [application-specific blockchains](01-why-app-specific.md).

## Why the Cosmos SDK

The Cosmos SDK is the most advanced framework for building custom application-specific blockchains today. Here are a few reasons why you might want to consider building your decentralized application with the Cosmos SDK:

* The default consensus engine available within the Cosmos SDK is [CometBFT](https://github.com/cometbft/cometbft). CometBFT is the most (and only) mature BFT consensus engine in existence. It is widely used across the industry and is considered the gold standard consensus engine for building Proof-of-Stake systems.
* The Cosmos SDK is open-source and designed to make it easy to build blockchains out of composable [modules](../../integrate/modules). As the ecosystem of open-source Cosmos SDK modules grows, it will become increasingly easier to build complex decentralized platforms with it.
* The Cosmos SDK is inspired by capabilities-based security, and informed by years of wrestling with blockchain state-machines. This makes the Cosmos SDK a very secure environment to build blockchains.
* Most importantly, the Cosmos SDK has already been used to build many application-specific blockchains that are already in production. Among others, we can cite [Cosmos Hub](https://hub.cosmos.network), [IRIS Hub](https://irisnet.org), [Binance Chain](https://docs.binance.org/), [Terra](https://terra.money/) or [Kava](https://www.kava.io/). [Many more](https://cosmos.network/ecosystem) are building on the Cosmos SDK.

## Getting started with the Cosmos SDK

* Learn more about the [architecture of a Cosmos SDK application](02-sdk-app-architecture.md)
* Learn how to build an application-specific blockchain from scratch with the [Cosmos SDK Tutorial](https://cosmos.network/docs/tutorial)
