# 应用特定区块链

:::note 概要
本文档解释了什么是应用特定区块链，以及为什么开发人员会选择构建应用特定区块链而不是编写智能合约。
:::

## 什么是应用特定区块链

应用特定区块链是定制化以运行单个应用程序的区块链。开发人员不是在现有的区块链（如以太坊）之上构建去中心化应用程序，而是从头开始构建自己的区块链。这意味着构建一个完整的节点客户端、轻客户端以及与节点交互的所有必要接口（CLI、REST等）。

```text
                ^  +-------------------------------+  ^
                |  |                               |  |   Built with Cosmos SDK
                |  |  State-machine = Application  |  |
                |  |                               |  v
                |  +-------------------------------+
                |  |                               |  ^
Blockchain node |  |           Consensus           |  |
                |  |                               |  |
                |  +-------------------------------+  |   CometBFT
                |  |                               |  |
                |  |           Networking          |  |
                |  |                               |  |
                v  +-------------------------------+  v
```

## 智能合约的不足之处

虚拟机区块链（如以太坊）在2014年解决了对更多可编程性的需求。当时，构建去中心化应用程序的选择非常有限。大多数开发人员要么在复杂且有限的比特币脚本语言之上构建，要么分叉比特币代码库，这很难使用和定制。

虚拟机区块链带来了新的价值主张。它们的状态机包含一个能够解释图灵完备程序（称为智能合约）的虚拟机。这些智能合约非常适用于一次性事件（例如ICO），但在构建复杂的去中心化平台方面可能不足。以下是原因：

* 智能合约通常使用特定的编程语言开发，可以由底层虚拟机解释。这些编程语言通常不成熟，并且受到虚拟机本身约束的限制。例如，以太坊虚拟机不允许开发人员实现代码的自动执行。开发人员还受限于EVM的基于账户的系统，并且只能从有限的一组函数中选择其加密操作。这些只是一些例子，但它们暗示了智能合约环境中常常存在的**灵活性**的缺乏。
* 所有智能合约都由同一个虚拟机运行。这意味着它们竞争资源，这可能严重限制**性能**。即使状态机被分割成多个子集（例如通过分片），智能合约仍需要由虚拟机解释，这将限制性能，与在状态机级别实现的本地应用程序相比（我们的基准测试显示，去除虚拟机后性能提高了约10倍）。
* 智能合约共享相同的底层环境还带来了**主权**的限制。去中心化应用程序是涉及多个参与者的生态系统。如果应用程序建立在通用虚拟机区块链上，利益相关者对其应用程序的主权非常有限，最终被底层区块链的治理所取代。如果应用程序中存在错误，几乎无法解决。

应用特定区块链旨在解决这些缺点。

## 应用特定区块链的优势

### 灵活性

应用特定区块链为开发人员提供了最大的灵活性：

* 在 Cosmos 区块链中，状态机通常通过称为 [ABCI](https://docs.cometbft.com/v0.37/spec/abci/) 的接口与底层共识引擎连接。该接口可以用任何编程语言进行封装，这意味着开发人员可以使用他们选择的编程语言构建自己的状态机。

* 开发人员可以选择多个框架来构建自己的状态机。目前最广泛使用的是 Cosmos SDK，但还有其他选择（例如 [Lotion](https://github.com/nomic-io/lotion)、[Weave](https://github.com/iov-one/weave) 等）。通常，选择将基于他们想要使用的编程语言（Cosmos SDK 和 Weave 使用 Golang，Lotion 使用 Javascript 等）。
* ABCI 还允许开发人员交换应用特定区块链的共识引擎。目前，只有 CometBFT 是可用于生产环境的，但未来预计会出现其他共识引擎。
* 即使他们选择了一个框架和共识引擎，开发人员仍然可以自由调整它们，以使其与他们的需求完美匹配。
* 开发人员可以自由探索各种权衡（例如验证者数量与交易吞吐量、异步中的安全性与可用性等）和设计选择（存储使用的 DB 或 IAVL 树，UTXO 模型还是账户模型等）。
* 开发人员可以实现代码的自动执行。在 Cosmos SDK 中，逻辑可以在每个区块的开始和结束时自动触发。他们还可以自由选择在应用中使用的加密库，而不受虚拟机区块链中底层环境提供的限制。

上述列表包含了一些示例，展示了应用特定区块链为开发人员提供的灵活性。Cosmos 和 Cosmos SDK 的目标是尽可能使开发工具具有通用性和可组合性，以便可以在不丢失兼容性的情况下分叉、调整和改进堆栈的每个部分。随着社区的发展，每个核心构建块的更多替代方案将出现，为开发人员提供更多选择。

### 性能

使用智能合约构建的去中心化应用在性能上受到底层环境的限制。为了优化性能，去中心化应用需要构建为特定应用的区块链。下面是特定应用区块链在性能方面带来的一些好处：

* 特定应用区块链的开发者可以选择使用新型共识引擎，如CometBFT BFT。与大多数虚拟机区块链使用的工作量证明（Proof-of-Work）相比，它在吞吐量方面提供了显著的增益。
* 特定应用区块链仅运行单个应用程序，因此该应用程序不会与其他应用程序竞争计算和存储资源。这与大多数非分片虚拟机区块链相反，其中智能合约都会竞争计算和存储资源。
* 即使虚拟机区块链提供了基于应用的分片和高效共识算法，性能仍然受到虚拟机本身的限制。真正的吞吐量瓶颈是状态机，而要求交易由虚拟机解释会显著增加处理交易的计算复杂性。

### 安全性

安全性很难量化，并且在不同的平台上差异很大。尽管如此，特定应用区块链在安全性方面带来了一些重要的好处：

* 开发者在构建特定应用区块链时可以选择使用成熟的编程语言，如Go，而不是通常更不成熟的智能合约编程语言。
* 开发者不受底层虚拟机提供的加密函数的限制。他们可以使用自己的自定义加密算法，并依赖于经过审计的加密库。
* 开发者无需担心底层虚拟机中的潜在错误或可利用的机制，这使得对应用程序的安全性进行推理更加容易。

### 主权

应用特定区块链的主要优势之一是主权。去中心化应用是一个涉及许多参与者的生态系统：用户、开发者、第三方服务等等。当开发者构建在虚拟机区块链上的应用时，许多去中心化应用共存，应用的社区与底层区块链的社区是不同的，而后者在治理过程中优先于前者。如果出现漏洞或需要新功能，应用的利益相关者几乎没有余地来升级代码。如果底层区块链的社区拒绝采取行动，什么都无法发生。

这里的根本问题是应用的治理与网络的治理不一致。应用特定区块链解决了这个问题。因为应用特定区块链专门用于运行单个应用，应用的利益相关者对整个链具有完全控制权。这确保了如果发现漏洞，社区不会陷入困境，并且有自由选择如何发展。


# Application-Specific Blockchains

:::note Synopsis
This document explains what application-specific blockchains are, and why developers would want to build one as opposed to writing Smart Contracts.
:::

## What are application-specific blockchains

Application-specific blockchains are blockchains customized to operate a single application. Instead of building a decentralized application on top of an underlying blockchain like Ethereum, developers build their own blockchain from the ground up. This means building a full-node client, a light-client, and all the necessary interfaces (CLI, REST, ...) to interact with the nodes.

```text
                ^  +-------------------------------+  ^
                |  |                               |  |   Built with Cosmos SDK
                |  |  State-machine = Application  |  |
                |  |                               |  v
                |  +-------------------------------+
                |  |                               |  ^
Blockchain node |  |           Consensus           |  |
                |  |                               |  |
                |  +-------------------------------+  |   CometBFT
                |  |                               |  |
                |  |           Networking          |  |
                |  |                               |  |
                v  +-------------------------------+  v
```

## What are the shortcomings of Smart Contracts

Virtual-machine blockchains like Ethereum addressed the demand for more programmability back in 2014. At the time, the options available for building decentralized applications were quite limited. Most developers would build on top of the complex and limited Bitcoin scripting language, or fork the Bitcoin codebase which was hard to work with and customize.

Virtual-machine blockchains came in with a new value proposition. Their state-machine incorporates a virtual-machine that is able to interpret turing-complete programs called Smart Contracts. These Smart Contracts are very good for use cases like one-time events (e.g. ICOs), but they can fall short for building complex decentralized platforms. Here is why:

* Smart Contracts are generally developed with specific programming languages that can be interpreted by the underlying virtual-machine. These programming languages are often immature and inherently limited by the constraints of the virtual-machine itself. For example, the Ethereum Virtual Machine does not allow developers to implement automatic execution of code. Developers are also limited to the account-based system of the EVM, and they can only choose from a limited set of functions for their cryptographic operations. These are examples, but they hint at the lack of **flexibility** that a smart contract environment often entails.
* Smart Contracts are all run by the same virtual machine. This means that they compete for resources, which can severely restrain **performance**. And even if the state-machine were to be split in multiple subsets (e.g. via sharding), Smart Contracts would still need to be interpreted by a virtual machine, which would limit performance compared to a native application implemented at state-machine level (our benchmarks show an improvement on the order of 10x in performance when the virtual-machine is removed).
* Another issue with the fact that Smart Contracts share the same underlying environment is the resulting limitation in **sovereignty**. A decentralized application is an ecosystem that involves multiple players. If the application is built on a general-purpose virtual-machine blockchain, stakeholders have very limited sovereignty over their application, and are ultimately superseded by the governance of the underlying blockchain. If there is a bug in the application, very little can be done about it.

Application-Specific Blockchains are designed to address these shortcomings.

## Application-Specific Blockchains Benefits

### Flexibility

Application-specific blockchains give maximum flexibility to developers:

* In Cosmos blockchains, the state-machine is typically connected to the underlying consensus engine via an interface called the [ABCI](https://docs.cometbft.com/v0.37/spec/abci/). This interface can be wrapped in any programming language, meaning developers can build their state-machine in the programming language of their choice.

* Developers can choose among multiple frameworks to build their state-machine. The most widely used today is the Cosmos SDK, but others exist (e.g. [Lotion](https://github.com/nomic-io/lotion), [Weave](https://github.com/iov-one/weave), ...). Typically the choice will be made based on the programming language they want to use (Cosmos SDK and Weave are in Golang, Lotion is in Javascript, ...).
* The ABCI also allows developers to swap the consensus engine of their application-specific blockchain. Today, only CometBFT is production-ready, but in the future other consensus engines are expected to emerge.
* Even when they settle for a framework and consensus engine, developers still have the freedom to tweak them if they don't perfectly match their requirements in their pristine forms.
* Developers are free to explore the full spectrum of tradeoffs (e.g. number of validators vs transaction throughput, safety vs availability in asynchrony, ...) and design choices (DB or IAVL tree for storage, UTXO or account model, ...).
* Developers can implement automatic execution of code. In the Cosmos SDK, logic can be automatically triggered at the beginning and the end of each block. They are also free to choose the cryptographic library used in their application, as opposed to being constrained by what is made available by the underlying environment in the case of virtual-machine blockchains.

The list above contains a few examples that show how much flexibility application-specific blockchains give to developers. The goal of Cosmos and the Cosmos SDK is to make developer tooling as generic and composable as possible, so that each part of the stack can be forked, tweaked and improved without losing compatibility. As the community grows, more alternatives for each of the core building blocks will emerge, giving more options to developers.

### Performance

decentralized applications built with Smart Contracts are inherently capped in performance by the underlying environment. For a decentralized application to optimise performance, it needs to be built as an application-specific blockchain. Next are some of the benefits an application-specific blockchain brings in terms of performance:

* Developers of application-specific blockchains can choose to operate with a novel consensus engine such as CometBFT BFT. Compared to Proof-of-Work (used by most virtual-machine blockchains today), it offers significant gains in throughput.
* An application-specific blockchain only operates a single application, so that the application does not compete with others for computation and storage. This is the opposite of most non-sharded virtual-machine blockchains today, where smart contracts all compete for computation and storage.
* Even if a virtual-machine blockchain offered application-based sharding coupled with an efficient consensus algorithm, performance would still be limited by the virtual-machine itself. The real throughput bottleneck is the state-machine, and requiring transactions to be interpreted by a virtual-machine significantly increases the computational complexity of processing them.

### Security

Security is hard to quantify, and greatly varies from platform to platform. That said here are some important benefits an application-specific blockchain can bring in terms of security:

* Developers can choose proven programming languages like Go when building their application-specific blockchains, as opposed to smart contract programming languages that are often more immature.
* Developers are not constrained by the cryptographic functions made available by the underlying virtual-machines. They can use their own custom cryptography, and rely on well-audited crypto libraries.
* Developers do not have to worry about potential bugs or exploitable mechanisms in the underlying virtual-machine, making it easier to reason about the security of the application.

### Sovereignty

One of the major benefits of application-specific blockchains is sovereignty. A decentralized application is an ecosystem that involves many actors: users, developers, third-party services, and more. When developers build on virtual-machine blockchain where many decentralized applications coexist, the community of the application is different than the community of the underlying blockchain, and the latter supersedes the former in the governance process. If there is a bug or if a new feature is needed, stakeholders of the application have very little leeway to upgrade the code. If the community of the underlying blockchain refuses to act, nothing can happen.

The fundamental issue here is that the governance of the application and the governance of the network are not aligned. This issue is solved by application-specific blockchains. Because application-specific blockchains specialize to operate a single application, stakeholders of the application have full control over the entire chain. This ensures that the community will not be stuck if a bug is discovered, and that it has the freedom to choose how it is going to evolve.
