# Cosmos SDK 模块介绍

:::note 概要
模块定义了 Cosmos SDK 应用程序的大部分逻辑。开发者使用 Cosmos SDK 将模块组合在一起，构建自定义的应用程序特定的区块链。本文档概述了 SDK 模块背后的基本概念以及如何处理模块管理。
:::

:::note

### 先决条件阅读

* [Cosmos SDK 应用程序的解剖](../../develop/high-level-concepts/00-overview-app.md)
* [Cosmos SDK 交易的生命周期](../../develop/high-level-concepts/01-tx-lifecycle.md)

:::

## Cosmos SDK 应用程序中的模块角色

可以将 Cosmos SDK 视为区块链开发的 Ruby-on-Rails。它提供了核心功能，每个区块链应用程序都需要，例如与底层共识引擎通信的 [ABCI 的样板实现](../../develop/advanced-concepts/00-baseapp.md)，用于持久化状态的 [`multistore`](../../develop/advanced-concepts/04-store.md#multistore)，用于形成全节点的 [服务器](../../develop/advanced-concepts/03-node.md) 和处理查询的 [接口](09-module-interfaces.md)。

在这个核心之上，Cosmos SDK 允许开发者构建模块，实现其应用程序的业务逻辑。换句话说，SDK 模块实现了应用程序的大部分逻辑，而核心则负责连接和组合模块。最终目标是构建一个强大的开源 Cosmos SDK 模块生态系统，使构建复杂的区块链应用程序变得越来越容易。

Cosmos SDK 模块可以被看作是状态机内的小型状态机。它们通常使用 [主要 multistore](../../develop/advanced-concepts/04-store.md) 中的一个或多个 `KVStore` 定义状态的子集，以及一组 [消息类型](02-messages-and-queries.md#messages)。这些消息由 Cosmos SDK 核心的主要组件之一 [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md) 路由到定义它们的模块 Protobuf [`Msg` 服务](03-msg-services.md)。

由于这种架构，构建Cosmos SDK应用程序通常涉及编写模块来实现应用程序的专业逻辑，并将它们与现有模块组合以完成应用程序。开发人员通常会在尚不存在的模块中实现其特定用例所需的逻辑，并使用现有模块来实现更通用的功能，如质押、账户或代币管理。

## 作为开发人员构建模块的方法

虽然没有编写模块的明确指南，但在构建模块时，开发人员应牢记以下一些重要的设计原则：

* **可组合性**：Cosmos SDK应用程序几乎总是由多个模块组成。这意味着开发人员不仅需要仔细考虑他们的模块与Cosmos SDK核心的集成，还需要考虑与其他模块的集成。前者通过遵循[这里](#main-components-of-cosmos-sdk-modules)概述的标准设计模式来实现，而后者通过适当地通过[`keeper`](06-keeper.md)公开模块的存储来实现。
* **专业化**：**可组合性**特性的直接结果是模块应该是**专业化**的。开发人员应仔细确定模块的范围，不要将多个功能批量放入同一个模块中。这种关注点的分离使得模块可以在其他项目中重复使用，并提高了应用程序的可升级性。**专业化**在Cosmos SDK的[对象能力模型](../../develop/advanced-concepts/10-ocap.md)中也起着重要作用。
* **能力**：大多数模块需要读取和/或写入其他模块的存储。然而，在开源环境中，某些模块可能是恶意的。这就是为什么模块开发人员不仅需要仔细考虑他们的模块如何与其他模块交互，还需要考虑如何访问模块的存储。Cosmos SDK采用了面向能力的方法来实现模块间的安全性。这意味着每个模块定义的存储由一个`key`访问，该`key`由模块的[`keeper`](06-keeper.md)持有。这个`keeper`定义了如何访问存储和在什么条件下访问存储。通过传递对模块的`keeper`的引用来访问模块的存储。

## Cosmos SDK 模块的主要组件

按照惯例，模块被定义在 `./x/` 子文件夹中（例如，`bank` 模块将被定义在 `./x/bank` 文件夹中）。它们通常共享相同的核心组件：

* 一个 [`keeper`](06-keeper.md)，用于访问模块的存储并更新状态。
* 一个 [`Msg` 服务](02-messages-and-queries.md#messages)，用于在消息被 [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md#message-routing) 路由到模块时处理消息并触发状态转换。
* 一个查询服务（query service），用于在用户查询被 [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md#query-routing) 路由到模块时处理查询。
* 接口，供最终用户查询模块定义的状态子集并创建模块中定义的自定义类型的 `message`。

除了这些组件，模块还实现了 `AppModule` 接口，以便由 [`module manager`](01-module-manager.md) 管理。

请参考 [结构文档](11-structure.md) 了解模块目录的推荐结构。




# Introduction to Cosmos SDK Modules

:::note Synopsis
Modules define most of the logic of Cosmos SDK applications. Developers compose modules together using the Cosmos SDK to build their custom application-specific blockchains. This document outlines the basic concepts behind SDK modules and how to approach module management.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK application](../../develop/high-level-concepts/00-overview-app.md)
* [Lifecycle of a Cosmos SDK transaction](../../develop/high-level-concepts/01-tx-lifecycle.md)

:::

## Role of Modules in a Cosmos SDK Application

The Cosmos SDK can be thought of as the Ruby-on-Rails of blockchain development. It comes with a core that provides the basic functionalities every blockchain application needs, like a [boilerplate implementation of the ABCI](../../develop/advanced-concepts/00-baseapp.md) to communicate with the underlying consensus engine, a [`multistore`](../../develop/advanced-concepts/04-store.md#multistore) to persist state, a [server](../../develop/advanced-concepts/03-node.md) to form a full-node and [interfaces](09-module-interfaces.md) to handle queries.

On top of this core, the Cosmos SDK enables developers to build modules that implement the business logic of their application. In other words, SDK modules implement the bulk of the logic of applications, while the core does the wiring and enables modules to be composed together. The end goal is to build a robust ecosystem of open-source Cosmos SDK modules, making it increasingly easier to build complex blockchain applications.

Cosmos SDK modules can be seen as little state-machines within the state-machine. They generally define a subset of the state using one or more `KVStore`s in the [main multistore](../../develop/advanced-concepts/04-store.md), as well as a subset of [message types](02-messages-and-queries.md#messages). These messages are routed by one of the main components of Cosmos SDK core, [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md), to a module Protobuf [`Msg` service](03-msg-services.md) that defines them.

```text
                                      +
                                      |
                                      |  Transaction relayed from the full-node's consensus engine
                                      |  to the node's application via DeliverTx
                                      |
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
                                                                  |
                                                                  |  Message routed to the correct
                                                                  |  module to be processed
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
                                       | Return result to the underlying consensus engine (e.g. CometBFT)
                                       | (0=Ok, 1=Err)
                                       v
```

As a result of this architecture, building a Cosmos SDK application usually revolves around writing modules to implement the specialized logic of the application and composing them with existing modules to complete the application. Developers will generally work on modules that implement logic needed for their specific use case that do not exist yet, and will use existing modules for more generic functionalities like staking, accounts, or token management.

## How to Approach Building Modules as a Developer

While there are no definitive guidelines for writing modules, here are some important design principles developers should keep in mind when building them:

* **Composability**: Cosmos SDK applications are almost always composed of multiple modules. This means developers need to carefully consider the integration of their module not only with the core of the Cosmos SDK, but also with other modules. The former is achieved by following standard design patterns outlined [here](#main-components-of-cosmos-sdk-modules), while the latter is achieved by properly exposing the store(s) of the module via the [`keeper`](06-keeper.md).
* **Specialization**: A direct consequence of the **composability** feature is that modules should be **specialized**. Developers should carefully establish the scope of their module and not batch multiple functionalities into the same module. This separation of concerns enables modules to be re-used in other projects and improves the upgradability of the application. **Specialization** also plays an important role in the [object-capabilities model](../../develop/advanced-concepts/10-ocap.md) of the Cosmos SDK.
* **Capabilities**: Most modules need to read and/or write to the store(s) of other modules. However, in an open-source environment, it is possible for some modules to be malicious. That is why module developers need to carefully think not only about how their module interacts with other modules, but also about how to give access to the module's store(s). The Cosmos SDK takes a capabilities-oriented approach to inter-module security. This means that each store defined by a module is accessed by a `key`, which is held by the module's [`keeper`](06-keeper.md). This `keeper` defines how to access the store(s) and under what conditions. Access to the module's store(s) is done by passing a reference to the module's `keeper`.

## Main Components of Cosmos SDK Modules

Modules are by convention defined in the `./x/` subfolder (e.g. the `bank` module will be defined in the `./x/bank` folder). They generally share the same core components:

* A  [`keeper`](06-keeper.md), used to access the module's store(s) and update the state.
* A [`Msg` service](02-messages-and-queries.md#messages), used to process messages when they are routed to the module by [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md#message-routing) and trigger state-transitions.
* A [query service](04-query-services.md), used to process user queries when they are routed to the module by [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md#query-routing).
* Interfaces, for end users to query the subset of the state defined by the module and create `message`s of the custom types defined in the module.

In addition to these components, modules implement the `AppModule` interface in order to be managed by the [`module manager`](01-module-manager.md).

Please refer to the [structure document](11-structure.md) to learn about the recommended structure of a module's directory.
