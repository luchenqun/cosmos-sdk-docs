# 术语表

## ABCI（应用区块链接口）
Tendermint共识引擎和应用状态机之间的接口，允许它们进行通信和执行状态转换。 ABCI是Cosmos SDK的关键组件，使开发人员能够使用任何可以通过ABCI进行通信的编程语言构建应用程序。

## ATOM
Cosmos Hub的本地质押代币，用于保护网络安全、参与治理和支付交易费用。

## CometBFT
一种拜占庭容错（BFT）共识引擎，用于驱动Cosmos SDK。 CometBFT负责处理区块链的共识和网络层。

## Cosmos Hub
使用Cosmos SDK构建的第一个区块链，作为通过IBC连接Cosmos生态系统中其他区块链的中心。

## Cosmos SDK
用于构建区块链应用程序的框架，注重模块化、可扩展性和互操作性。

## CosmWasm
用于Cosmos SDK的智能合约引擎，使开发人员能够使用WebAssembly（Wasm）编写和部署智能合约。 CosmWasm旨在安全、高效且易于使用，使开发人员能够在Cosmos SDK之上构建复杂的应用程序。

## 委托人
权益证明网络中的参与者，将其代币委托给验证人。委托人与验证人在共识过程中的表现相关的奖励和风险。

## Gas
在区块链上执行交易或智能合约所需的计算工作量的度量。在Cosmos生态系统中，Gas用于计量交易并公平地分配资源给用户。用户必须支付Gas费用，通常以本地代币的形式，以便网络处理其交易。

## 治理
Cosmos生态系统中的决策过程，允许代币持有者提出和投票网络升级、参数更改和其他重要决策。

## IBC（区块链间通信）
一种用于在基于Cosmos SDK构建的异构区块链之间进行安全可靠通信的协议。IBC使得跨多个区块链之间的代币和数据转移成为可能。

## 互操作性
不同区块链和分布式系统之间相互通信和交互的能力，实现信息、代币和其他数字资产的无缝转移。在 Cosmos 的背景下，Inter-Blockchain Communication (IBC) 协议是一项核心技术，它使 Cosmos SDK 构建的区块链与其他兼容的区块链之间实现互操作性。互操作性可以促进不同区块链生态系统之间的合作、创新和价值创造。

## 轻客户端
轻量级区块链客户端，仅验证和处理区块链数据的一小部分，使用户能够在不下载整个区块链的情况下与网络进行交互。ABCI++ 旨在通过使轻客户端能够高效验证状态转换和证明来增强轻客户端的安全性和性能。

## 模块
一段自包含、可重用的代码，可用于在 Cosmos SDK 应用程序中构建区块链功能。社区可以开发模块并共享给其他人使用。

## 惩罚
对验证人或委托人进行惩罚，通过减少其抵押代币，如果他们行为恶意或未达到网络的性能要求。

## 抵押
将代币作为抵押品锁定以保护网络、参与共识并在 Cosmos 等权益证明 (PoS) 区块链中获得奖励的过程。

## 状态同步
一种功能，允许新节点快速与区块链的当前状态同步，而无需下载和处理所有先前的区块。状态同步对于长时间离线的节点或首次加入网络的节点特别有用。ABCI++ 旨在提高状态同步的效率和安全性。

## 验证人
负责提议新区块、验证交易并通过抵押代币保护 Cosmos SDK 基于区块链的网络的网络参与者。验证人在维护网络的安全性和完整性方面发挥着关键作用。


# Glossary

## ABCI (Application Blockchain Interface)
The interface between the Tendermint consensus engine and the application state machine, allowing them to communicate and perform state transitions. ABCI is a critical component of the Cosmos SDK, enabling developers to build applications using any programming language that can communicate via ABCI.

## ATOM
The native staking token of the Cosmos Hub, used for securing the network, participating in governance, and paying fees for transactions.

## CometBFT
A Byzantine Fault Tolerant (BFT) consensus engine that powers the Cosmos SDK. CometBFT is responsible for handling the consensus and networking layers of a blockchain.

## Cosmos Hub
The first blockchain built with the Cosmos SDK, functioning as a hub for connecting other blockchains in the Cosmos ecosystem through IBC.

## Cosmos SDK
A framework for building blockchain applications, focusing on modularity, scalability, and interoperability.

## CosmWasm
A smart contract engine for the Cosmos SDK that enables developers to write and deploy smart contracts in WebAssembly (Wasm). CosmWasm is designed to be secure, efficient, and easy to use, allowing developers to build complex applications on top of the Cosmos SDK.

## Delegator
A participant in a Proof of Stake network who delegates their tokens to a validator. Delegators share in the rewards and risks associated with the validator's performance in the consensus process.

## Gas
A measure of computational effort required to execute a transaction or smart contract on a blockchain. In the Cosmos ecosystem, gas is used to meter transactions and allocate resources fairly among users. Users must pay a gas fee, usually in the native token, to have their transactions processed by the network.

## Governance
The decision-making process in the Cosmos ecosystem, which allows token holders to propose and vote on network upgrades, parameter changes, and other critical decisions.

## IBC (Inter-Blockchain Communication)
A protocol for secure and reliable communication between heterogeneous blockchains built on the Cosmos SDK. IBC enables the transfer of tokens and data across multiple blockchains.

## Interoperability
The ability of different blockchains and distributed systems to communicate and interact with each other, enabling the seamless transfer of information, tokens, and other digital assets. In the context of Cosmos, the Inter-Blockchain Communication (IBC) protocol is a core technology that enables interoperability between blockchains built with the Cosmos SDK and other compatible blockchains. Interoperability allows for increased collaboration, innovation, and value creation across different blockchain ecosystems.

## Light Clients
Lightweight blockchain clients that verify and process only a small subset of the blockchain data, allowing users to interact with the network without downloading the entire blockchain. ABCI++ aims to enhance the security and performance of light clients by enabling them to efficiently verify state transitions and proofs.

## Module
A self-contained, reusable piece of code that can be used to build blockchain functionality within a Cosmos SDK application. Modules can be developed by the community and shared for others to use.

## Slashing
The process of penalizing validators or delegators by reducing their staked tokens if they behave maliciously or fail to meet the network's performance requirements.

## Staking
The process of locking up tokens as collateral to secure the network, participate in consensus, and earn rewards in a Proof of Stake (PoS) blockchain like Cosmos.

## State Sync
A feature that allows new nodes to quickly synchronize with the current state of the blockchain without downloading and processing all previous blocks. State Sync is particularly useful for nodes that have been offline for an extended period or are joining the network for the first time. ABCI++ aims to improve the efficiency and security of State Sync.

## Validator
A network participant responsible for proposing new blocks, validating transactions, and securing the Cosmos SDK-based blockchain through staking tokens. Validators play a crucial role in maintaining the security and integrity of the network.