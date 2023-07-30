# 存储

:::note 概要
存储是保存应用程序状态的数据结构。
:::

:::note

### 先决条件阅读

* [Cosmos SDK应用程序的解剖](../high-level-concepts/00-overview-app.md)

:::

## 简介

Cosmos SDK存储包提供了管理Merkle化状态存储和承诺的接口、类型和抽象，用于Cosmos SDK应用程序。该包为开发人员提供了各种原语，包括状态存储、状态承诺和包装的KV存储。本文档重点介绍了关键的抽象和它们的重要性。

## 多存储

Cosmos SDK应用程序中的主要存储是多存储，即存储的存储，支持模块化。开发人员可以根据应用程序的需求向多存储中添加任意数量的键值存储。每个模块可以声明和管理自己的状态子集，从而实现模块化的方法。多存储中的键值存储只能通过特定的能力键访问，该键通常由声明存储的模块的保管者持有。

## 存储接口

### KVStore

`KVStore`接口定义了一个用于存储和检索数据的键值存储。`baseapp`中使用的`KVStore`的默认实现是`iavl.Store`，它基于IAVL树。可以通过持有特定键的对象访问KV存储，并提供一个`Iterator`方法，该方法返回一个`Iterator`对象，用于迭代一系列键。

### CommitKVStore

`CommitKVStore`接口扩展了`KVStore`接口，并添加了用于状态承诺的方法。`baseapp`中使用的`CommitKVStore`的默认实现也是`iavl.Store`。

### StoreDB

`StoreDB`接口定义了一个可用于持久化键值存储的数据库。`baseapp`中使用的`StoreDB`的默认实现是`dbm.DB`，它是一个简单的持久化键值存储。

### DBAdapter

`DBAdapter`接口定义了一个适配器，用于满足`dbm.DB`的`KVStore`接口。该接口用于在`dbm.DB`实现和`KVStore`接口之间提供兼容性。

### TransientStore

`TransientStore` 接口定义了一个基础层的 KVStore，在区块结束时自动丢弃，并且适用于存储每个区块相关的信息，例如存储参数更改。

## 存储抽象

存储包提供了一套全面的抽象，用于在 SDK 应用程序中管理状态的承诺和存储。这些抽象包括 CacheWrapping、KVStore 和 CommitMultiStore，它们提供了一系列功能，如 CRUD 功能、基于前缀的迭代和状态承诺管理。

通过利用这些抽象，开发人员可以为每个模块创建独立的状态管理，从而创建模块化的应用程序。这种方法可以实现更有组织和可维护的应用程序结构。

### CacheWrap

CacheWrap 是一个包装了 KVStore 的缓存，提供了读写操作的缓存功能。CacheWrap 可以通过减少状态存储操作所需的磁盘读写次数来提高性能。CacheWrap 还包括一个 Write 方法，用于将待定的写操作提交到底层的 KVStore。

### HistoryStore

HistoryStore 是一个可选功能，用于存储状态的历史版本。HistoryStore 可以用于跟踪状态随时间的变化，允许开发人员分析状态的变化，并在必要时回滚到以前的版本。

### IndexStore

IndexStore 是一种 KVStore 类型，用于维护存储在其他 KVStore 中的数据的索引。IndexStore 可以通过提供一种根据特定条件快速搜索数据的方式来提高查询性能。

### Queryable

Queryable 接口用于提供一种应用程序查询存储在 KVStore 中的状态的方法。Queryable 接口包括根据键或键范围检索数据的方法，以及根据特定条件检索数据的方法。

### PrefixIterator

PrefixIterator 接口用于在具有共同前缀的 KVStore 中迭代一系列键。PrefixIterator 可以根据特定前缀高效地从 KVStore 中检索数据子集。

### RootMultiStore

RootMultiStore是一个Multistore，它提供了在特定高度检索状态快照的能力。这对于实现轻客户端非常有用。

### GasKVStore

GasKVStore是一个包装在KVStore周围的包装器，它为读取和写入操作提供了燃料测量。GasKVStore通常用于测量执行事务的成本。

## 实现细节

虽然存储包提供了许多接口，但通常有每个主要接口的核心实现，这些接口是模块和开发人员与之交互的，它们在Cosmos SDK中定义。

`iavl.Store`通过实现以下接口提供了状态存储和承诺的核心实现：

-   `KVStore`
-   `CommitStore`
-   `CommitKVStore`
-   `Queryable`
-   `StoreWithInitialVersion`

`iavl.Store`还提供了从状态承诺层中删除历史状态的能力。

IAVL实现的概述可以在[这里](https://github.com/cosmos/iavl/blob/master/docs/overview.md)找到。

其他存储抽象包括`cachekv.Store`、`gaskv.Store`、`cachemulti.Store`和`rootmulti.Store`。这些存储提供了额外的功能和抽象，供开发人员使用。

请注意，并发访问`iavl.Store`树是不安全的，调用者有责任确保不对存储进行并发访问。

## 存储迁移

存储迁移是更新KVStore结构以支持新功能或数据模型更改的过程。存储迁移可能是一个复杂的过程，但它对于维护存储在KVStore中的状态的完整性是必不可少的。




# Store

:::note Synopsis
A store is a data structure that holds the state of the application.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK application](../high-level-concepts/00-overview-app.md)

:::

## Introduction

The Cosmos SDK store package provides interfaces, types, and abstractions for managing Merkleized state storage and commitment within a Cosmos SDK application. The package supplies various primitives for developers to work with, including state storage, state commitment, and wrapper KVStores. This document highlights the key abstractions and their significance.

## Multistore

The main store in Cosmos SDK applications is a multistore, a store of stores, that supports modularity. Developers can add any number of key-value stores to the multistore based on their application needs. Each module can declare and manage its own subset of the state, allowing for a modular approach. Key-value stores within the multistore can only be accessed with a specific capability key, which is typically held in the keeper of the module that declared the store.

## Store Interfaces

### KVStore

The `KVStore` interface defines a key-value store that can be used to store and retrieve data. The default implementation of `KVStore` used in `baseapp` is the `iavl.Store`, which is based on an IAVL Tree. KVStores can be accessed by objects that hold a specific key and can provide an `Iterator` method that returns an `Iterator` object, used to iterate over a range of keys.

### CommitKVStore

The `CommitKVStore` interface extends the `KVStore` interface and adds methods for state commitment. The default implementation of `CommitKVStore` used in `baseapp` is also the `iavl.Store`.

### StoreDB

The `StoreDB` interface defines a database that can be used to persist key-value stores. The default implementation of `StoreDB` used in `baseapp` is the `dbm.DB`, which is a simple persistent key-value store.

### DBAdapter

The `DBAdapter` interface defines an adapter for `dbm.DB` that fulfills the `KVStore` interface. This interface is used to provide compatibility between the `dbm.DB` implementation and the `KVStore` interface.

### TransientStore

The `TransientStore` interface defines a base-layer KVStore which is automatically discarded at the end of the block and is useful for persisting information that is only relevant per-block, like storing parameter changes.

## Store Abstractions

The store package provides a comprehensive set of abstractions for managing state commitment and storage in an SDK application. These abstractions include CacheWrapping, KVStore, and CommitMultiStore, which offer a range of features such as CRUD functionality, prefix-based iteration, and state commitment management.

By utilizing these abstractions, developers can create modular applications with independent state management for each module. This approach allows for a more organized and maintainable application structure.

### CacheWrap

CacheWrap is a wrapper around a KVStore that provides caching for both read and write operations. The CacheWrap can be used to improve performance by reducing the number of disk reads and writes required for state storage operations. The CacheWrap also includes a Write method that commits the pending writes to the underlying KVStore.

### HistoryStore

The HistoryStore is an optional feature that can be used to store historical versions of the state. The HistoryStore can be used to track changes to the state over time, allowing developers to analyze changes in the state and roll back to previous versions if necessary.

### IndexStore

The IndexStore is a type of KVStore that is used to maintain indexes of data stored in other KVStores. IndexStores can be used to improve query performance by providing a way to quickly search for data based on specific criteria.

### Queryable

The Queryable interface is used to provide a way for applications to query the state stored in a KVStore. The Queryable interface includes methods for retrieving data based on a key or a range of keys, as well as methods for retrieving data based on specific criteria.

### PrefixIterator

The PrefixIterator interface is used to iterate over a range of keys in a KVStore that share a common prefix. PrefixIterators can be used to efficiently retrieve subsets of data from a KVStore based on a specific prefix.

### RootMultiStore

The RootMultiStore is a Multistore that provides the ability to retrieve a snapshot of the state at a specific height. This is useful for implementing light clients.

### GasKVStore

The GasKVStore is a wrapper around a KVStore that provides gas measurement for read and write operations. The GasKVStore is typically used to measure the cost of executing transactions.

## Implementation Details

While there are many interfaces that the store package provides, there is typically a core implementation for each main interface that modules and developers interact with that are defined in the Cosmos SDK.

The `iavl.Store` provides the core implementation for state storage and commitment by implementing the following interfaces:

-   `KVStore`
-   `CommitStore`
-   `CommitKVStore`
-   `Queryable`
-   `StoreWithInitialVersion`

The `iavl.Store` also provides the ability to remove historical state from the state commitment layer.

An overview of the IAVL implementation can be found [here](https://github.com/cosmos/iavl/blob/master/docs/overview.md).

Other store abstractions include `cachekv.Store`, `gaskv.Store`, `cachemulti.Store`, and `rootmulti.Store`. Each of these stores provide additional functionality and abstractions for developers to work with.

Note that concurrent access to the `iavl.Store` tree is not safe, and it is the responsibility of the caller to ensure that concurrent access to the store is not performed.

## Store Migration

Store migration is the process of updating the structure of a KVStore to support new features or changes in the data model. Store migration can be a complex process, but it is essential for maintaining the integrity of the state stored in a KVStore.
