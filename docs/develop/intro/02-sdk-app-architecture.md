# 区块链架构简介

## 状态机

在其核心，区块链是一个[复制的确定性状态机](https://en.wikipedia.org/wiki/State_machine_replication)。

状态机是计算机科学的概念，其中一台机器可以有多个状态，但在任何给定时间只能有一个状态。有一个`状态`，描述系统的当前状态，和`交易`，触发状态转换。

给定一个状态S和一个交易T，状态机将返回一个新的状态S'。

```text
+--------+                 +--------+
|        |                 |        |
|   S    +---------------->+   S'   |
|        |    apply(T)     |        |
+--------+                 +--------+
```

在实践中，交易被打包成块以使过程更高效。给定一个状态S和一个交易块B，状态机将返回一个新的状态S'。

```text
+--------+                              +--------+
|        |                              |        |
|   S    +----------------------------> |   S'   |
|        |   For each T in B: apply(T)  |        |
+--------+                              +--------+
```

在区块链上下文中，状态机是确定性的。这意味着如果一个节点在给定的状态下启动并重放相同的交易序列，它将始终以相同的最终状态结束。

Cosmos SDK为开发人员提供了最大的灵活性，以定义其应用程序的状态、交易类型和状态转换函数。在接下来的章节中，将更深入地描述使用Cosmos SDK构建状态机的过程。但首先，让我们看看如何使用**CometBFT**复制状态机。

## CometBFT

由于Cosmos SDK的存在，开发人员只需定义状态机，[*CometBFT*](https://docs.cometbft.com/v0.37/introduction/what-is-cometbft)将为他们处理网络复制。

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

[CometBFT](https://docs.cometbft.com/v0.37/introduction/what-is-cometbft)是一个与应用程序无关的引擎，负责处理区块链的*网络*和*共识*层。在实践中，这意味着CometBFT负责传播和排序交易字节。CometBFT依赖于一种名为拜占庭容错（BFT）的算法来就交易顺序达成共识。

CometBFT的[共识算法](https://docs.cometbft.com/v0.37/introduction/what-is-cometbft#consensus-overview)与一组称为*验证者*的特殊节点一起工作。验证者负责将交易块添加到区块链中。在任何给定的块中，都有一个验证者集合V。算法选择V中的一个验证者作为下一个块的提议者。如果超过V的三分之二对其进行了`prevote`和`precommit`的签名，并且其中包含的所有交易都是有效的，则该块被视为有效。验证者集合可以通过状态机中编写的规则进行更改。

## ABCI

CometBFT通过一个称为[ABCI](https://docs.cometbft.com/v0.37/spec/abci/)的接口将交易传递给应用程序，应用程序必须实现该接口。

```text
              +---------------------+
              |                     |
              |     Application     |
              |                     |
              +--------+---+--------+
                       ^   |
                       |   | ABCI
                       |   v
              +--------+---+--------+
              |                     |
              |                     |
              |       CometBFT      |
              |                     |
              |                     |
              +---------------------+
```

请注意，**CometBFT仅处理交易字节**。它不知道这些字节的含义。CometBFT所做的只是有序地处理这些交易字节。CometBFT通过ABCI将字节传递给应用程序，并期望返回代码来通知它交易中包含的消息是否成功处理。

以下是ABCI的最重要的消息：

* `CheckTx`：当CometBFT接收到一个交易时，它会将其传递给应用程序以检查是否满足一些基本要求。`CheckTx`用于保护全节点的内存池免受垃圾交易的影响。一个特殊的处理程序称为[`AnteHandler`](../high-level-concepts/04-gas-fees.md#antehandler)用于执行一系列验证步骤，例如检查足够的费用和验证签名。如果检查有效，则将交易添加到[mempool](https://docs.cometbft.com/v0.37/spec/p2p/messages/mempool)并传递给对等节点。请注意，使用`CheckTx`时不会处理交易（即不会修改状态），因为它们尚未包含在块中。
* `DeliverTx`：当CometBFT接收到一个[有效的块](https://docs.cometbft.com/v0.37/spec/core/data_structures#block)时，块中的每个交易都通过`DeliverTx`传递给应用程序以进行处理。在此阶段发生状态转换。`AnteHandler`再次执行，同时对于交易中的每个消息，还会执行实际的[`Msg`服务](../../integrate/building-modules/03-msg-services.md) RPC。
* `BeginBlock`/`EndBlock`：这些消息在每个块的开始和结束时执行，无论该块是否包含交易。它有助于触发逻辑的自动执行。但请谨慎操作，因为计算密集型的循环可能会减慢您的区块链，甚至如果循环是无限的话，可能会导致它冻结。

从[CometBFT文档](https://docs.cometbft.com/v0.37/spec/abci/)中找到ABCI方法的更详细视图。

任何构建在CometBFT上的应用程序都需要实现ABCI接口，以便与底层的本地CometBFT引擎进行通信。幸运的是，您不需要自己实现ABCI接口。Cosmos SDK以[baseapp](03-sdk-design.md#baseapp)的形式提供了一个ABCI接口的样板实现。


# Introduction to Blockchain Architecture

## State machine

At its core, a blockchain is a [replicated deterministic state machine](https://en.wikipedia.org/wiki/State_machine_replication).

A state machine is a computer science concept whereby a machine can have multiple states, but only one at any given time. There is a `state`, which describes the current state of the system, and `transactions`, that trigger state transitions.

Given a state S and a transaction T, the state machine will return a new state S'.

```text
+--------+                 +--------+
|        |                 |        |
|   S    +---------------->+   S'   |
|        |    apply(T)     |        |
+--------+                 +--------+
```

In practice, the transactions are bundled in blocks to make the process more efficient. Given a state S and a block of transactions B, the state machine will return a new state S'.

```text
+--------+                              +--------+
|        |                              |        |
|   S    +----------------------------> |   S'   |
|        |   For each T in B: apply(T)  |        |
+--------+                              +--------+
```

In a blockchain context, the state machine is deterministic. This means that if a node is started at a given state and replays the same sequence of transactions, it will always end up with the same final state.

The Cosmos SDK gives developers maximum flexibility to define the state of their application, transaction types and state transition functions. The process of building state-machines with the Cosmos SDK will be described more in depth in the following sections. But first, let us see how the state-machine is replicated using **CometBFT**.

## CometBFT

Thanks to the Cosmos SDK, developers just have to define the state machine, and [*CometBFT*](https://docs.cometbft.com/v0.37/introduction/what-is-cometbft) will handle replication over the network for them.

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

[CometBFT](https://docs.cometbft.com/v0.37/introduction/what-is-cometbft) is an application-agnostic engine that is responsible for handling the *networking* and *consensus* layers of a blockchain. In practice, this means that CometBFT is responsible for propagating and ordering transaction bytes. CometBFT relies on an eponymous Byzantine-Fault-Tolerant (BFT) algorithm to reach consensus on the order of transactions.

The CometBFT [consensus algorithm](https://docs.cometbft.com/v0.37/introduction/what-is-cometbft#consensus-overview) works with a set of special nodes called *Validators*. Validators are responsible for adding blocks of transactions to the blockchain. At any given block, there is a validator set V. A validator in V is chosen by the algorithm to be the proposer of the next block. This block is considered valid if more than two thirds of V signed a `prevote` and a `precommit` on it, and if all the transactions that it contains are valid. The validator set can be changed by rules written in the state-machine.

## ABCI

CometBFT passes transactions to the application through an interface called the [ABCI](https://docs.cometbft.com/v0.37/spec/abci/), which the application must implement.

```text
              +---------------------+
              |                     |
              |     Application     |
              |                     |
              +--------+---+--------+
                       ^   |
                       |   | ABCI
                       |   v
              +--------+---+--------+
              |                     |
              |                     |
              |       CometBFT      |
              |                     |
              |                     |
              +---------------------+
```

Note that **CometBFT only handles transaction bytes**. It has no knowledge of what these bytes mean. All CometBFT does is order these transaction bytes deterministically. CometBFT passes the bytes to the application via the ABCI, and expects a return code to inform it if the messages contained in the transactions were successfully processed or not.

Here are the most important messages of the ABCI:

* `CheckTx`: When a transaction is received by CometBFT, it is passed to the application to check if a few basic requirements are met. `CheckTx` is used to protect the mempool of full-nodes against spam transactions. . A special handler called the [`AnteHandler`](../high-level-concepts/04-gas-fees.md#antehandler) is used to execute a series of validation steps such as checking for sufficient fees and validating the signatures. If the checks are valid, the transaction is added to the [mempool](https://docs.cometbft.com/v0.37/spec/p2p/messages/mempool) and relayed to peer nodes. Note that transactions are not processed (i.e. no modification of the state occurs) with `CheckTx` since they have not been included in a block yet.
* `DeliverTx`: When a [valid block](https://docs.cometbft.com/v0.37/spec/core/data_structures#block) is received by CometBFT, each transaction in the block is passed to the application via `DeliverTx` in order to be processed. It is during this stage that the state transitions occur. The `AnteHandler` executes again, along with the actual [`Msg` service](../../integrate/building-modules/03-msg-services.md) RPC for each message in the transaction.
* `BeginBlock`/`EndBlock`: These messages are executed at the beginning and the end of each block, whether the block contains transactions or not. It is useful to trigger automatic execution of logic. Proceed with caution though, as computationally expensive loops could slow down your blockchain, or even freeze it if the loop is infinite.

Find a more detailed view of the ABCI methods from the [CometBFT docs](https://docs.cometbft.com/v0.37/spec/abci/).

Any application built on CometBFT needs to implement the ABCI interface in order to communicate with the underlying local CometBFT engine. Fortunately, you do not have to implement the ABCI interface. The Cosmos SDK provides a boilerplate implementation of it in the form of [baseapp](03-sdk-design.md#baseapp).
