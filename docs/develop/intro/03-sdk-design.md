# Cosmos SDK 的主要组件

Cosmos SDK 是一个在 CometBFT 之上便于开发安全状态机的框架。在其核心，Cosmos SDK 是 Golang 中 [ABCI](02-sdk-app-architecture.md#abci) 的样板实现。它配备了一个 [`multistore`](../advanced-concepts/04-store.md#multistore) 用于持久化数据，并且有一个 [`router`](../advanced-concepts/00-baseapp.md#routing) 用于处理交易。

下面是一个简化的视图，展示了在基于 Cosmos SDK 构建的应用程序中，当从 CometBFT 通过 `DeliverTx` 进行传输时，如何处理交易：

1. 解码从 CometBFT 共识引擎接收到的 `transactions`（请记住，CometBFT 只处理 `[]bytes`）。
2. 从 `transactions` 中提取 `messages` 并进行基本的合法性检查。
3. 将每个消息路由到适当的模块以便进行处理。
4. 提交状态更改。

## `baseapp`

`baseapp` 是 Cosmos SDK 应用程序的样板实现。它配备了一个 ABCI 的实现，用于处理与底层共识引擎的连接。通常，Cosmos SDK 应用程序通过将 `baseapp` 嵌入到 [`app.go`](../high-level-concepts/00-overview-app.md#core-application-file) 中来进行扩展。

下面是来自 Cosmos SDK 演示应用 `simapp` 的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L164-L203
```

`baseapp` 的目标是在尽可能少地定义状态机的情况下，为存储和可扩展状态机之间提供一个安全的接口（忠实于 ABCI）。

要了解更多关于 `baseapp` 的信息，请点击[这里](../advanced-concepts/00-baseapp.md)。

## Multistore

Cosmos SDK 提供了一个 [`multistore`](../advanced-concepts/04-store.md#multistore) 用于持久化状态。`multistore` 允许开发人员声明任意数量的 [`KVStores`](../advanced-concepts/04-store.md#base-layer-kvstores)。这些 `KVStores` 仅接受 `[]byte` 类型的值，因此任何自定义结构在存储之前需要使用 [编解码器](../advanced-concepts/06-encoding.md) 进行编组。

多存储抽象用于将状态分割为不同的组件，每个组件由自己的模块管理。有关多存储的更多信息，请点击[这里](../advanced-concepts/04-store.md#multistore)

## 模块

Cosmos SDK 的强大之处在于其模块化。Cosmos SDK 应用程序是通过聚合一系列可互操作的模块来构建的。每个模块定义了一部分状态，并包含自己的消息/事务处理器，而 Cosmos SDK 负责将每个消息路由到其相应的模块。

下面是当一个交易在有效区块中接收到时，每个全节点应用程序如何处理该交易的简化视图：

```text
                                      +
                                      |
                                      |  Transaction relayed from the full-node's
                                      |  CometBFT engine to the node's application
                                      |  via DeliverTx
                                      |
                                      |
                +---------------------v--------------------------+
                |                 APPLICATION                    |
                |                                                |
                |     Using baseapp's methods: Decode the Tx,    |
                |     extract and route the message(s)           |
                |                                                |
                +---------------------+--------------------------+
                                      |
                                      |
                                      |
                                      +---------------------------+
                                                                  |
                                                                  |
                                                                  |  Message routed to
                                                                  |  the correct module
                                                                  |  to be processed
                                                                  |
                                                                  |
+----------------+  +---------------+  +----------------+  +------v----------+
|                |  |               |  |                |  |                 |
|  AUTH MODULE   |  |  BANK MODULE  |  | STAKING MODULE |  |   GOV MODULE    |
|                |  |               |  |                |  |                 |
|                |  |               |  |                |  | Handles message,|
|                |  |               |  |                |  | Updates state   |
|                |  |               |  |                |  |                 |
+----------------+  +---------------+  +----------------+  +------+----------+
                                                                  |
                                                                  |
                                                                  |
                                                                  |
                                       +--------------------------+
                                       |
                                       | Return result to CometBFT
                                       | (0=Ok, 1=Err)
                                       v
```

每个模块可以被看作是一个小型状态机。开发人员需要定义模块处理的状态子集，以及修改状态的自定义消息类型（*注意：* `messages` 是由 `baseapp` 从 `transactions` 中提取出来的）。通常情况下，每个模块在 `multistore` 中声明自己的 `KVStore` 来持久化其定义的状态子集。大多数开发人员在构建自己的模块时需要访问其他第三方模块。鉴于 Cosmos SDK 是一个开放的框架，一些模块可能是恶意的，这意味着需要安全原则来推理模块间的交互。这些原则基于[对象能力](../advanced-concepts/10-ocap.md)。实际上，这意味着每个模块不再为其他模块保留访问控制列表，而是实现了一种特殊的对象，称为 `keepers`，可以传递给其他模块以授予预定义的一组能力。

Cosmos SDK 模块定义在 Cosmos SDK 的 `x/` 文件夹中。一些核心模块包括：

* `x/auth`：用于管理账户和签名。
* `x/bank`：用于启用代币和代币转账。
* `x/staking` + `x/slashing`：用于构建权益证明区块链。

除了 `x/` 中已经存在的模块外，任何人都可以在其应用程序中使用 Cosmos SDK 构建自己的自定义模块。您可以在[教程中查看一个示例](https://tutorials.cosmos.network/)。

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


# Main Components of the Cosmos SDK

The Cosmos SDK is a framework that facilitates the development of secure state-machines on top of CometBFT. At its core, the Cosmos SDK is a boilerplate implementation of the [ABCI](02-sdk-app-architecture.md#abci) in Golang. It comes with a [`multistore`](../advanced-concepts/04-store.md#multistore) to persist data and a [`router`](../advanced-concepts/00-baseapp.md#routing) to handle transactions.

Here is a simplified view of how transactions are handled by an application built on top of the Cosmos SDK when transferred from CometBFT via `DeliverTx`:

1. Decode `transactions` received from the CometBFT consensus engine (remember that CometBFT only deals with `[]bytes`).
2. Extract `messages` from `transactions` and do basic sanity checks.
3. Route each message to the appropriate module so that it can be processed.
4. Commit state changes.

## `baseapp`

`baseapp` is the boilerplate implementation of a Cosmos SDK application. It comes with an implementation of the ABCI to handle the connection with the underlying consensus engine. Typically, a Cosmos SDK application extends `baseapp` by embedding it in [`app.go`](../high-level-concepts/00-overview-app.md#core-application-file).

Here is an example of this from `simapp`, the Cosmos SDK demonstration app:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L164-L203
```

The goal of `baseapp` is to provide a secure interface between the store and the extensible state machine while defining as little about the state machine as possible (staying true to the ABCI).

For more on `baseapp`, please click [here](../advanced-concepts/00-baseapp.md).

## Multistore

The Cosmos SDK provides a [`multistore`](../advanced-concepts/04-store.md#multistore) for persisting state. The multistore allows developers to declare any number of [`KVStores`](../advanced-concepts/04-store.md#base-layer-kvstores). These `KVStores` only accept the `[]byte` type as value and therefore any custom structure needs to be marshalled using [a codec](../advanced-concepts/06-encoding.md) before being stored.

The multistore abstraction is used to divide the state in distinct compartments, each managed by its own module. For more on the multistore, click [here](../advanced-concepts/04-store.md#multistore)

## Modules

The power of the Cosmos SDK lies in its modularity. Cosmos SDK applications are built by aggregating a collection of interoperable modules. Each module defines a subset of the state and contains its own message/transaction processor, while the Cosmos SDK is responsible for routing each message to its respective module.

Here is a simplified view of how a transaction is processed by the application of each full-node when it is received in a valid block:

```text
                                      +
                                      |
                                      |  Transaction relayed from the full-node's
                                      |  CometBFT engine to the node's application
                                      |  via DeliverTx
                                      |
                                      |
                +---------------------v--------------------------+
                |                 APPLICATION                    |
                |                                                |
                |     Using baseapp's methods: Decode the Tx,    |
                |     extract and route the message(s)           |
                |                                                |
                +---------------------+--------------------------+
                                      |
                                      |
                                      |
                                      +---------------------------+
                                                                  |
                                                                  |
                                                                  |  Message routed to
                                                                  |  the correct module
                                                                  |  to be processed
                                                                  |
                                                                  |
+----------------+  +---------------+  +----------------+  +------v----------+
|                |  |               |  |                |  |                 |
|  AUTH MODULE   |  |  BANK MODULE  |  | STAKING MODULE |  |   GOV MODULE    |
|                |  |               |  |                |  |                 |
|                |  |               |  |                |  | Handles message,|
|                |  |               |  |                |  | Updates state   |
|                |  |               |  |                |  |                 |
+----------------+  +---------------+  +----------------+  +------+----------+
                                                                  |
                                                                  |
                                                                  |
                                                                  |
                                       +--------------------------+
                                       |
                                       | Return result to CometBFT
                                       | (0=Ok, 1=Err)
                                       v
```

Each module can be seen as a little state-machine. Developers need to define the subset of the state handled by the module, as well as custom message types that modify the state (*Note:* `messages` are extracted from `transactions` by `baseapp`). In general, each module declares its own `KVStore` in the `multistore` to persist the subset of the state it defines. Most developers will need to access other 3rd party modules when building their own modules. Given that the Cosmos SDK is an open framework, some of the modules may be malicious, which means there is a need for security principles to reason about inter-module interactions. These principles are based on [object-capabilities](../advanced-concepts/10-ocap.md). In practice, this means that instead of having each module keep an access control list for other modules, each module implements special objects called `keepers` that can be passed to other modules to grant a pre-defined set of capabilities.

Cosmos SDK modules are defined in the `x/` folder of the Cosmos SDK. Some core modules include:

* `x/auth`: Used to manage accounts and signatures.
* `x/bank`: Used to enable tokens and token transfers.
* `x/staking` + `x/slashing`: Used to build Proof-Of-Stake blockchains.

In addition to the already existing modules in `x/`, that anyone can use in their app, the Cosmos SDK lets you build your own custom modules. You can check an [example of that in the tutorial](https://tutorials.cosmos.network/).
