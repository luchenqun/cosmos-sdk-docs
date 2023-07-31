# 什么是Tendermint

Tendermint是一种用于在多台机器上安全且一致地复制应用程序的软件。安全性意味着即使多达1/3的机器以任意方式失败，Tendermint也能正常工作。一致性意味着每个非故障机器都能看到相同的事务日志并计算相同的状态。安全且一致的复制是分布式系统中的一个基本问题；它在各种应用中的容错性中起着关键作用，包括货币、选举、基础设施编排等等。

能够容忍机器以任意方式失败，包括变得恶意，被称为拜占庭容错（BFT）。BFT理论已有几十年的历史，但软件实现直到最近才变得流行，这主要归功于像比特币和以太坊这样的“区块链技术”的成功。区块链技术只是在更现代的环境中重新形式化了BFT，强调点对点网络和加密身份验证。该名称源于交易在区块中批处理的方式，每个区块包含前一个区块的加密哈希，形成一个链。实际上，区块链数据结构实际上优化了BFT设计。

Tendermint由两个主要技术组件组成：区块链共识引擎和通用应用程序接口。共识引擎称为Tendermint Core，确保相同的事务以相同的顺序记录在每台机器上。应用程序接口称为应用程序区块链接口（ABCI），使得可以使用任何编程语言处理事务。与其他预先打包了内置状态机（如高级键值存储或奇特的脚本语言）的区块链和共识解决方案不同，开发人员可以根据自己的需求使用Tendermint进行BFT状态机复制，无论使用哪种编程语言和开发环境。

Tendermint被设计成易于使用、易于理解、高性能且适用于各种分布式应用。

## Tendermint vs. X

Tendermint与两类软件有广泛的相似之处。第一类是分布式键值存储，如Zookeeper、etcd和consul，它们使用非BFT共识算法。第二类被称为“区块链技术”，包括比特币和以太坊等加密货币，以及Hyperledger的Burrow等替代分布式账本设计。

### Zookeeper、etcd、consul

Zookeeper、etcd和consul都是在经典的非BFT共识算法之上实现的键值存储。Zookeeper使用了一种称为Zookeeper原子广播的Paxos版本，而etcd和consul使用了年轻且更简单的Raft共识算法。一个典型的集群包含3-5台机器，并且可以容忍多达1/2的机器崩溃故障，但是即使是一个拜占庭错误也可以摧毁系统。

每个提供的服务都提供了一个稍微不同的功能丰富的键值存储实现，但总体上都专注于为分布式系统提供基本服务，如动态配置、服务发现、锁定、领导者选举等。

Tendermint本质上是类似的软件，但有两个关键区别：

- 它是拜占庭容错的，意味着它只能容忍多达1/3的故障，但这些故障可以包括任意行为，包括黑客攻击和恶意攻击。- 它不指定特定的应用程序，如高级键值存储。相反，它专注于任意状态机复制，使开发人员可以构建适合他们的应用逻辑，从键值存储到加密货币再到电子投票平台等。

### 比特币、以太坊等

Tendermint在比特币、以太坊等加密货币的传统中出现，旨在提供比比特币的工作证明更高效和安全的共识算法。在早期，Tendermint内置了一种简单的货币，并且要参与共识，用户必须将货币单位“绑定”到一个安全存款中，如果他们行为不端，存款可以被撤销-这就是使Tendermint成为一种权益证明算法的原因。

自那时起，Tendermint已经发展成为一个通用的区块链共识引擎，可以托管任意应用状态。这意味着它可以作为其他区块链软件的共识引擎的即插即用替代品。因此，可以使用Tendermint共识将当前的以太坊代码库（无论是用Rust、Go还是Haskell编写）作为ABCI应用运行。实际上，我们已经在以太坊上做到了这一点（https://github.com/cosmos/ethermint）。我们计划对比特币、ZCash和其他各种确定性应用也做同样的事情。

另一个建立在Tendermint上的加密货币应用的例子是Cosmos网络（http://cosmos.network）。

### 其他区块链项目

[Fabric](https://github.com/hyperledger/fabric)采用了与Tendermint类似的方法，但对状态管理有更明确的意见，并要求所有应用行为在可能的多个Docker容器中运行，这些容器被称为"chaincode"。它使用了IBM团队的[PBFT](http://pmg.csail.mit.edu/papers/osdi99.pdf)的实现，该实现被增强以处理可能的非确定性chaincode（https://www.zurich.ibm.com/~cca/papers/sieve.pdf）。可以将这种基于Docker的行为实现为Tendermint中的ABCI应用，尽管将Tendermint扩展以处理非确定性仍然是未来的工作。

[Burrow](https://github.com/hyperledger/burrow)是以太坊虚拟机和以太坊交易机制的实现，具有名称注册表、权限和本地合约的附加功能，以及替代的区块链API。它使用Tendermint作为其共识引擎，并提供特定的应用状态。

## ABCI概述

[应用区块链接口（ABCI）](https://github.com/tendermint/tendermint/tree/v0.34.x/abci)允许使用任何编程语言编写的应用程序进行拜占庭容错复制。

### 动机

到目前为止，所有的区块链"堆栈"（例如[Bitcoin](https://github.com/bitcoin/bitcoin)）都采用了单体设计。也就是说，每个区块链堆栈都是一个处理分布式账本的所有问题的单个程序；这包括P2P连接、交易的"mempool"广播、最新区块的共识、账户余额、图灵完备的合约、用户级权限等等。

使用单体架构通常在计算机科学中是不好的实践。它使得代码的组件复用变得困难，并且尝试这样做会导致代码库分叉的复杂维护过程。当代码库的设计不是模块化的，并且存在“面条代码”问题时，这一点尤为明显。

单体设计的另一个问题是它限制了你在区块链堆栈（或反过来）中使用的语言。以以太坊为例，它支持图灵完备的字节码虚拟机，这将限制你使用编译成该字节码的语言；目前，这些语言包括Serpent和Solidity。

相比之下，我们的方法是将共识引擎和P2P层与特定区块链应用程序的应用状态细节解耦。我们通过将应用程序的细节抽象为一个接口，并将其实现为一个套接字协议来实现这一点。

因此，我们有一个接口，即应用程序区块链接口（ABCI），以及它的主要实现，即Tendermint套接字协议（TSP，或Teaspoon）。

### ABCI简介

[Tendermint Core](https://github.com/tendermint/tendermint)（“共识引擎”）通过满足ABCI的套接字协议与应用程序进行通信。

为了打个比方，我们来谈谈一个众所周知的加密货币比特币。比特币是一个加密货币区块链，每个节点都维护着一个完全审计的未花费交易输出（UTXO）数据库。如果想在ABCI之上创建一个类似比特币的系统，Tendermint Core将负责：

- 在节点之间共享区块和交易
- 建立交易的规范/不可变顺序（区块链）

应用程序将负责：

- 维护UTXO数据库
- 验证交易的加密签名
- 防止交易花费不存在的交易
- 允许客户端查询UTXO数据库。

Tendermint能够通过在应用程序进程和共识进程之间提供一个非常简单的API（即ABCI）来分解区块链设计。

ABCI由3种主要的消息类型组成，这些消息从核心传递到应用程序。应用程序通过相应的响应消息进行回复。

这些消息在[ABCI规范](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/abci.md)中有详细说明。

**DeliverTx**消息是应用程序的工作马。区块链中的每个交易都通过此消息进行传递。应用程序需要使用**DeliverTx**消息对接收到的每个交易进行验证，验证包括当前状态、应用程序协议和交易的加密凭证。验证通过的交易需要更新应用程序状态，可以通过将值绑定到键值存储中，或者通过更新UTXO数据库等方式。

**CheckTx**消息类似于**DeliverTx**，但仅用于验证交易。Tendermint Core的内存池首先使用**CheckTx**检查交易的有效性，只有有效的交易才会传递给其对等节点。例如，应用程序可以检查交易中的递增序列号，并在**CheckTx**中如果序列号过旧则返回错误。或者，它们可以使用基于能力的系统，该系统要求在每个交易中更新能力。

**Commit**消息用于计算对当前应用程序状态的加密承诺，并将其放置在下一个区块头中。这具有一些便利的属性。对于更新该状态的不一致性现在将显示为区块链分叉，从而捕获了一整类编程错误。这也简化了安全轻量级客户端的开发，因为可以通过检查与区块哈希相比较的Merkle哈希证明，并且区块哈希由一个法定人数签名。

应用程序可以与ABCI套接字建立多个连接。Tendermint Core为应用程序创建了三个ABCI连接；一个用于在内存池中广播时验证交易，一个用于共识引擎运行块提案，另一个用于查询应用程序状态。

很明显，应用程序设计者需要非常谨慎地设计他们的消息处理程序，以创建一个有用的区块链，但这个架构提供了一个起点。下面的图表说明了通过ABCI传递消息的流程。

![abci](../imgs/abci.png)

## 关于确定性的说明

区块链交易处理的逻辑必须是确定性的。如果应用程序逻辑不确定，那么在Tendermint Core副本节点之间将无法达成共识。

以太坊上的Solidity是区块链应用的一个很好的选择，因为它是一种完全确定性的编程语言，除此之外，还可以使用现有的流行语言如Java、C++、Python或Go来创建确定性应用程序。游戏程序员和区块链开发人员已经熟悉通过避免非确定性的源头来创建确定性程序，例如：

- 随机数生成器（没有确定性的种子）
- 线程上的竞争条件（或完全避免使用线程）
- 系统时钟
- 未初始化的内存（在像C或C++这样的不安全编程语言中）
- [浮点数运算](http://gafferongames.com/networking-for-game-programmers/floating-point-determinism/)
- 随机的语言特性（例如Go中的map迭代）

虽然程序员可以通过小心避免非确定性，但也可以为每种语言创建一个特殊的linter或静态分析器来检查确定性。将来，我们可能会与合作伙伴合作创建这样的工具。

## 共识概述

Tendermint是一个易于理解的、大部分是异步的BFT共识协议。该协议遵循一个简单的状态机，如下所示：

![consensus-logic](../imgs/consensus_logic.png)

协议中的参与者被称为**验证者**；他们轮流提出交易块并对其进行投票。块以链的形式提交，每个**高度**有一个块。如果一个块无法提交，那么协议将进入下一个**轮次**，并且一个新的验证者将为该高度提出一个块。成功提交一个块需要两个阶段的投票；我们称之为**预投票**和**预提交**。当超过2/3的验证者在同一轮次的预提交中为同一个块进行预提交时，该块被提交。

有一张图片展示了一对夫妇跳波尔卡舞，因为验证者们在做类似波尔卡舞的动作。当超过三分之二的验证者对同一个区块进行预投票时，我们称之为**波尔卡**。每个预提交必须在同一轮中由波尔卡进行证明。

验证者可能由于多种原因无法提交区块；当前的提议者可能离线，或者网络可能很慢。Tendermint允许他们确定一个验证者应该被跳过。验证者在投票进入下一轮之前等待一小段时间，以接收到提议者的完整提议区块。这种依赖超时的方式使得Tendermint成为一个弱同步协议，而不是异步协议。然而，协议的其余部分是异步的，只有在听到超过三分之二的验证者集合的消息后，验证者才会取得进展。Tendermint的一个简化要素是，它使用相同的机制来提交一个区块和跳转到下一轮。

假设不到三分之一的验证者是拜占庭式的，Tendermint保证安全性永远不会被违反 - 也就是说，验证者永远不会在同一高度提交冲突的区块。为了做到这一点，它引入了一些**锁定**规则，调节流程图中可以遵循的路径。一旦验证者预提交了一个区块，它就会锁定在该区块上。然后，

1. 它必须对它所锁定的区块进行预投票
2. 只有在后续轮次中有该区块的波尔卡时，它才能解锁并对新的区块进行预提交

## 股权

在许多系统中，不是所有的验证者在共识协议中具有相同的“权重”。因此，我们关注的不是验证者的三分之一或三分之二，而是这些比例在总投票权中的比例，这可能在各个验证者之间分布不均。

由于Tendermint可以复制任意应用程序，因此可以定义一种货币，并以该货币来计量投票权。当投票权以本地货币计价时，该系统通常被称为权益证明。通过应用程序中的逻辑，可以强制验证者将其货币持有量“绑定”在一个安全存款中，如果发现他们在共识协议中行为不端，该存款可以被销毁。这为协议的安全性增加了经济要素，使得我们可以量化违反少于三分之一投票权是拜占庭式的假设的成本。

[Cosmos Network](https://cosmos.network)旨在在作为ABCI应用程序实现的一系列加密货币中使用这种权益证明机制。

下面的图表是Tendermint的简要概述。

![tx-flow](../imgs/tm-transaction-flow.png)


---
order: 4
---

# What is Tendermint

Tendermint is software for securely and consistently replicating an
application on many machines. By securely, we mean that Tendermint works
even if up to 1/3 of machines fail in arbitrary ways. By consistently,
we mean that every non-faulty machine sees the same transaction log and
computes the same state. Secure and consistent replication is a
fundamental problem in distributed systems; it plays a critical role in
the fault tolerance of a broad range of applications, from currencies,
to elections, to infrastructure orchestration, and beyond.

The ability to tolerate machines failing in arbitrary ways, including
becoming malicious, is known as Byzantine fault tolerance (BFT). The
theory of BFT is decades old, but software implementations have only
became popular recently, due largely to the success of "blockchain
technology" like Bitcoin and Ethereum. Blockchain technology is just a
reformalization of BFT in a more modern setting, with emphasis on
peer-to-peer networking and cryptographic authentication. The name
derives from the way transactions are batched in blocks, where each
block contains a cryptographic hash of the previous one, forming a
chain. In practice, the blockchain data structure actually optimizes BFT
design.

Tendermint consists of two chief technical components: a blockchain
consensus engine and a generic application interface. The consensus
engine, called Tendermint Core, ensures that the same transactions are
recorded on every machine in the same order. The application interface,
called the Application BlockChain Interface (ABCI), enables the
transactions to be processed in any programming language. Unlike other
blockchain and consensus solutions, which come pre-packaged with built
in state machines (like a fancy key-value store, or a quirky scripting
language), developers can use Tendermint for BFT state machine
replication of applications written in whatever programming language and
development environment is right for them.

Tendermint is designed to be easy-to-use, simple-to-understand, highly
performant, and useful for a wide variety of distributed applications.

## Tendermint vs. X

Tendermint is broadly similar to two classes of software. The first
class consists of distributed key-value stores, like Zookeeper, etcd,
and consul, which use non-BFT consensus. The second class is known as
"blockchain technology", and consists of both cryptocurrencies like
Bitcoin and Ethereum, and alternative distributed ledger designs like
Hyperledger's Burrow.

### Zookeeper, etcd, consul

Zookeeper, etcd, and consul are all implementations of a key-value store
atop a classical, non-BFT consensus algorithm. Zookeeper uses a version
of Paxos called Zookeeper Atomic Broadcast, while etcd and consul use
the Raft consensus algorithm, which is much younger and simpler. A
typical cluster contains 3-5 machines, and can tolerate crash failures
in up to 1/2 of the machines, but even a single Byzantine fault can
destroy the system.

Each offering provides a slightly different implementation of a
featureful key-value store, but all are generally focused around
providing basic services to distributed systems, such as dynamic
configuration, service discovery, locking, leader-election, and so on.

Tendermint is in essence similar software, but with two key differences:

- It is Byzantine Fault Tolerant, meaning it can only tolerate up to a
  1/3 of failures, but those failures can include arbitrary behaviour -
  including hacking and malicious attacks. - It does not specify a
  particular application, like a fancy key-value store. Instead, it
  focuses on arbitrary state machine replication, so developers can build
  the application logic that's right for them, from key-value store to
  cryptocurrency to e-voting platform and beyond.

### Bitcoin, Ethereum, etc

Tendermint emerged in the tradition of cryptocurrencies like Bitcoin,
Ethereum, etc. with the goal of providing a more efficient and secure
consensus algorithm than Bitcoin's Proof of Work. In the early days,
Tendermint had a simple currency built in, and to participate in
consensus, users had to "bond" units of the currency into a security
deposit which could be revoked if they misbehaved -this is what made
Tendermint a Proof-of-Stake algorithm.

Since then, Tendermint has evolved to be a general purpose blockchain
consensus engine that can host arbitrary application states. That means
it can be used as a plug-and-play replacement for the consensus engines
of other blockchain software. So one can take the current Ethereum code
base, whether in Rust, or Go, or Haskell, and run it as a ABCI
application using Tendermint consensus. Indeed, [we did that with
Ethereum](https://github.com/cosmos/ethermint). And we plan to do
the same for Bitcoin, ZCash, and various other deterministic
applications as well.

Another example of a cryptocurrency application built on Tendermint is
[the Cosmos network](http://cosmos.network).

### Other Blockchain Projects

[Fabric](https://github.com/hyperledger/fabric) takes a similar approach
to Tendermint, but is more opinionated about how the state is managed,
and requires that all application behaviour runs in potentially many
docker containers, modules it calls "chaincode". It uses an
implementation of [PBFT](http://pmg.csail.mit.edu/papers/osdi99.pdf).
from a team at IBM that is [augmented to handle potentially
non-deterministic
chaincode](https://www.zurich.ibm.com/~cca/papers/sieve.pdf) It is
possible to implement this docker-based behaviour as a ABCI app in
Tendermint, though extending Tendermint to handle non-determinism
remains for future work.

[Burrow](https://github.com/hyperledger/burrow) is an implementation of
the Ethereum Virtual Machine and Ethereum transaction mechanics, with
additional features for a name-registry, permissions, and native
contracts, and an alternative blockchain API. It uses Tendermint as its
consensus engine, and provides a particular application state.

## ABCI Overview

The [Application BlockChain Interface
(ABCI)](https://github.com/tendermint/tendermint/tree/v0.34.x/abci)
allows for Byzantine Fault Tolerant replication of applications
written in any programming language.

### Motivation

Thus far, all blockchains "stacks" (such as
[Bitcoin](https://github.com/bitcoin/bitcoin)) have had a monolithic
design. That is, each blockchain stack is a single program that handles
all the concerns of a decentralized ledger; this includes P2P
connectivity, the "mempool" broadcasting of transactions, consensus on
the most recent block, account balances, Turing-complete contracts,
user-level permissions, etc.

Using a monolithic architecture is typically bad practice in computer
science. It makes it difficult to reuse components of the code, and
attempts to do so result in complex maintenance procedures for forks of
the codebase. This is especially true when the codebase is not modular
in design and suffers from "spaghetti code".

Another problem with monolithic design is that it limits you to the
language of the blockchain stack (or vice versa). In the case of
Ethereum which supports a Turing-complete bytecode virtual-machine, it
limits you to languages that compile down to that bytecode; today, those
are Serpent and Solidity.

In contrast, our approach is to decouple the consensus engine and P2P
layers from the details of the application state of the particular
blockchain application. We do this by abstracting away the details of
the application to an interface, which is implemented as a socket
protocol.

Thus we have an interface, the Application BlockChain Interface (ABCI),
and its primary implementation, the Tendermint Socket Protocol (TSP, or
Teaspoon).

### Intro to ABCI

[Tendermint Core](https://github.com/tendermint/tendermint) (the
"consensus engine") communicates with the application via a socket
protocol that satisfies the ABCI.

To draw an analogy, lets talk about a well-known cryptocurrency,
Bitcoin. Bitcoin is a cryptocurrency blockchain where each node
maintains a fully audited Unspent Transaction Output (UTXO) database. If
one wanted to create a Bitcoin-like system on top of ABCI, Tendermint
Core would be responsible for

- Sharing blocks and transactions between nodes
- Establishing a canonical/immutable order of transactions
  (the blockchain)

The application will be responsible for

- Maintaining the UTXO database
- Validating cryptographic signatures of transactions
- Preventing transactions from spending non-existent transactions
- Allowing clients to query the UTXO database.

Tendermint is able to decompose the blockchain design by offering a very
simple API (i.e. the ABCI) between the application process and consensus
process.

The ABCI consists of 3 primary message types that get delivered from the
core to the application. The application replies with corresponding
response messages.

The messages are specified in the [ABCI
specification](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/abci.md).

The **DeliverTx** message is the work horse of the application. Each
transaction in the blockchain is delivered with this message. The
application needs to validate each transaction received with the
**DeliverTx** message against the current state, application protocol,
and the cryptographic credentials of the transaction. A validated
transaction then needs to update the application state — by binding a
value into a key values store, or by updating the UTXO database, for
instance.

The **CheckTx** message is similar to **DeliverTx**, but it's only for
validating transactions. Tendermint Core's mempool first checks the
validity of a transaction with **CheckTx**, and only relays valid
transactions to its peers. For instance, an application may check an
incrementing sequence number in the transaction and return an error upon
**CheckTx** if the sequence number is old. Alternatively, they might use
a capabilities based system that requires capabilities to be renewed
with every transaction.

The **Commit** message is used to compute a cryptographic commitment to
the current application state, to be placed into the next block header.
This has some handy properties. Inconsistencies in updating that state
will now appear as blockchain forks which catches a whole class of
programming errors. This also simplifies the development of secure
lightweight clients, as Merkle-hash proofs can be verified by checking
against the block hash, and that the block hash is signed by a quorum.

There can be multiple ABCI socket connections to an application.
Tendermint Core creates three ABCI connections to the application; one
for the validation of transactions when broadcasting in the mempool, one
for the consensus engine to run block proposals, and one more for
querying the application state.

It's probably evident that applications designers need to very carefully
design their message handlers to create a blockchain that does anything
useful but this architecture provides a place to start. The diagram
below illustrates the flow of messages via ABCI.

![abci](../imgs/abci.png)

## A Note on Determinism

The logic for blockchain transaction processing must be deterministic.
If the application logic weren't deterministic, consensus would not be
reached among the Tendermint Core replica nodes.

Solidity on Ethereum is a great language of choice for blockchain
applications because, among other reasons, it is a completely
deterministic programming language. However, it's also possible to
create deterministic applications using existing popular languages like
Java, C++, Python, or Go. Game programmers and blockchain developers are
already familiar with creating deterministic programs by avoiding
sources of non-determinism such as:

- random number generators (without deterministic seeding)
- race conditions on threads (or avoiding threads altogether)
- the system clock
- uninitialized memory (in unsafe programming languages like C
  or C++)
- [floating point
  arithmetic](http://gafferongames.com/networking-for-game-programmers/floating-point-determinism/)
- language features that are random (e.g. map iteration in Go)

While programmers can avoid non-determinism by being careful, it is also
possible to create a special linter or static analyzer for each language
to check for determinism. In the future we may work with partners to
create such tools.

## Consensus Overview

Tendermint is an easy-to-understand, mostly asynchronous, BFT consensus
protocol. The protocol follows a simple state machine that looks like
this:

![consensus-logic](../imgs/consensus_logic.png)

Participants in the protocol are called **validators**; they take turns
proposing blocks of transactions and voting on them. Blocks are
committed in a chain, with one block at each **height**. A block may
fail to be committed, in which case the protocol moves to the next
**round**, and a new validator gets to propose a block for that height.
Two stages of voting are required to successfully commit a block; we
call them **pre-vote** and **pre-commit**. A block is committed when
more than 2/3 of validators pre-commit for the same block in the same
round.

There is a picture of a couple doing the polka because validators are
doing something like a polka dance. When more than two-thirds of the
validators pre-vote for the same block, we call that a **polka**. Every
pre-commit must be justified by a polka in the same round.

Validators may fail to commit a block for a number of reasons; the
current proposer may be offline, or the network may be slow. Tendermint
allows them to establish that a validator should be skipped. Validators
wait a small amount of time to receive a complete proposal block from
the proposer before voting to move to the next round. This reliance on a
timeout is what makes Tendermint a weakly synchronous protocol, rather
than an asynchronous one. However, the rest of the protocol is
asynchronous, and validators only make progress after hearing from more
than two-thirds of the validator set. A simplifying element of
Tendermint is that it uses the same mechanism to commit a block as it
does to skip to the next round.

Assuming less than one-third of the validators are Byzantine, Tendermint
guarantees that safety will never be violated - that is, validators will
never commit conflicting blocks at the same height. To do this it
introduces a few **locking** rules which modulate which paths can be
followed in the flow diagram. Once a validator precommits a block, it is
locked on that block. Then,

1. it must prevote for the block it is locked on
2. it can only unlock, and precommit for a new block, if there is a
    polka for that block in a later round

## Stake

In many systems, not all validators will have the same "weight" in the
consensus protocol. Thus, we are not so much interested in one-third or
two-thirds of the validators, but in those proportions of the total
voting power, which may not be uniformly distributed across individual
validators.

Since Tendermint can replicate arbitrary applications, it is possible to
define a currency, and denominate the voting power in that currency.
When voting power is denominated in a native currency, the system is
often referred to as Proof-of-Stake. Validators can be forced, by logic
in the application, to "bond" their currency holdings in a security
deposit that can be destroyed if they're found to misbehave in the
consensus protocol. This adds an economic element to the security of the
protocol, allowing one to quantify the cost of violating the assumption
that less than one-third of voting power is Byzantine.

The [Cosmos Network](https://cosmos.network) is designed to use this
Proof-of-Stake mechanism across an array of cryptocurrencies implemented
as ABCI applications.

The following diagram is Tendermint in a (technical) nutshell.

![tx-flow](../imgs/tm-transaction-flow.png)
