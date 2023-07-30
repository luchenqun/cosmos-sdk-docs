# 区块间缓存

* [区块间缓存](#inter-block-cache)
    * [概述](#synopsis)
    * [概览和基本概念](#overview-and-basic-concepts)
        * [动机](#motivation)
        * [定义](#definitions)
    * [系统模型和属性](#system-model-and-properties)
        * [假设](#assumptions)
        * [属性](#properties)
            * [线程安全](#thread-safety)
            * [崩溃恢复](#crash-recovery)
            * [迭代](#iteration)
    * [技术规范](#technical-specification)
        * [总体设计](#general-design)
        * [API](#api)
            * [CommitKVCacheManager](#commitkvcachemanager)
            * [CommitKVStoreCache](#commitkvstorecache)
        * [实现细节](#implementation-details)
    * [历史](#history)
    * [版权](#copyright)

## 概述

区块间缓存是一个内存缓存，用于存储（在大多数情况下）模块需要在区块之间读取的不可变状态。当启用时，多存储的所有子存储，例如 `rootmulti`，都会被包装。

## 概览和基本概念

### 动机

区块间缓存的目标是允许 SDK 模块快速访问在每个区块执行期间通常查询的数据。这些数据通常不经常更改，例如模块参数。区块间缓存使用固定大小的写入穿透缓存，将每个 `CommitKVStore` 包装在多存储中，例如 `rootmulti`。与其他缓存层（例如 `cachekv`）不同，缓存在提交区块后不会被清除。

### 定义

* `存储键` 唯一标识一个存储。
* `KVCache` 是一个包装了缓存的 `CommitKVStore`。
* `缓存管理器` 是区块间缓存的关键组件，负责维护从 `存储键` 到 `KVCache` 的映射。

## 系统模型和属性

### 假设

本规范假设存在一个可供区块间缓存功能访问的缓存实现。

> 该实现使用自适应替换缓存（ARC），是对标准最近最少使用（LRU）缓存的增强，可以跟踪使用的频率和最近性。

内部块缓存要求缓存实现提供创建缓存、添加键值对、删除键值对和检索与键关联的值的方法。在本规范中，我们假设`Cache`功能通过以下方法提供这些功能：

* `NewCache(size int)` 创建一个具有`size`容量的新缓存并返回它。
* `Get(key string)` 尝试从`Cache`中检索键值对。它返回`(value []byte, success bool)`。如果`Cache`包含该键，则`value`包含关联的值且`success=true`。否则，`success=false`，并且应忽略`value`。
* `Add(key string, value []byte)` 将键值对插入到`Cache`中。
* `Remove(key string)` 从`Cache`中删除由`key`标识的键值对。

该规范还假设`CommitKVStore`提供以下API：

* `Get(key string)` 尝试从`CommitKVStore`中检索键值对。
* `Set(key, string, value []byte)` 将键值对插入到`CommitKVStore`中。
* `Delete(key string)` 从`CommitKVStore`中删除由`key`标识的键值对。

> 理想情况下，`Cache`和`CommitKVStore`应在不同的文档中进行说明，并在此处引用。

### 属性

#### 线程安全性

访问`cache manager`或`KVCache`不是线程安全的：没有任何方法受到锁的保护。
请注意，即使缓存实现是线程安全的，这也是正确的。

> 例如，假设在同一个键上并发执行两个`Set`操作，每个操作写入不同的值。在两个操作都执行完之后，缓存和底层存储可能不一致，每个存储在相同的键下存储了不同的值。

#### 崩溃恢复

内部块缓存将`Commit()`透明地委托给其聚合的`CommitKVStore`。如果聚合的`CommitKVStore`支持原子写入并使用它们来保证存储始终处于一致状态，则在发生故障时，内部块缓存可以被透明地移动到一致状态。

>请注意，这适用于`IAVLStore`，即首选的`CommitKVStore`。在提交时，它会在底层的`MutableTree`上调用`SaveVersion()`。`SaveVersion`通过批处理将写入磁盘的操作变为原子操作。这意味着只有一致的存储版本（树）才会被写入磁盘。因此，在`SaveVersion`调用期间发生故障时，在从磁盘恢复时，存储的版本将保持一致。

#### 迭代

通过嵌入的`CommitKVStore`接口，支持对每个包装的存储进行迭代。

## 技术规范

### 总体设计

区块间缓存功能由两个组件组成：`CommitKVCacheManager`和`CommitKVCache`。

`CommitKVCacheManager`实现了缓存管理器。它维护了一个从存储键到`KVStore`的映射。

```go
type CommitKVStoreCacheManager interface{
    cacheSize uint
    caches map[string]CommitKVStore
}
```

`CommitKVStoreCache`实现了`KVStore`：它是一个写透缓存，包装了一个`CommitKVStore`。这意味着删除和写入总是同时发生在缓存和底层的`CommitKVStore`上。而读取则首先命中内部缓存。在缓存未命中时，读取将委托给底层的`CommitKVStore`并进行缓存。

```go
type CommitKVStoreCache interface{
    store CommitKVStore
    cache Cache
}
```

要在`rootmulti`上启用区块间缓存，需要实例化一个`CommitKVCacheManager`并通过调用`SetInterBlockCache()`来设置它，然后再调用`LoadLatestVersion()`、`LoadLatestVersionAndUpgrade(...)`、`LoadVersionAndUpgrade(...)`或`LoadVersion(version)`之一。

### API

#### CommitKVCacheManager

方法`NewCommitKVStoreCacheManager`创建一个新的缓存管理器并返回它。

| 名称 | 类型    | 描述                                                         |
| ---- | ------- | ------------------------------------------------------------ |
| size | integer | 确定管理器维护的每个KVCache的容量                              |

```go
func NewCommitKVStoreCacheManager(size uint) CommitKVStoreCacheManager {
    manager = CommitKVStoreCacheManager{size, make(map[string]CommitKVStore)}
    return manager
}
```

`GetStoreCache`从`CommitStoreCacheManager`中返回给定存储键的缓存。如果存储键没有对应的缓存，则会创建并设置一个。

| 名称     | 类型                        | 描述                   |
| -------- | --------------------------- | ---------------------- |
| manager  | `CommitKVStoreCacheManager` | 缓存管理器             |
| storeKey | string                      | 要检索的存储的存储键   |
| store    | `CommitKVStore`             | 在管理器的缓存映射中没有任何缓存时，存储在其中的存储 |

```go
func GetStoreCache(
    manager CommitKVStoreCacheManager,
    storeKey string,
    store CommitKVStore) CommitKVStore {

    if manager.caches.has(storeKey) {
        return manager.caches.get(storeKey)
    } else {
        cache = CommitKVStoreCacheManager{store, manager.cacheSize}
        manager.set(storeKey, cache)
        return cache
    }
}
```

`Unwrap` 返回给定存储键的底层 CommitKVStore。

| 名称     | 类型                        | 描述                   |
| -------- | --------------------------- | ---------------------- |
| manager  | `CommitKVStoreCacheManager` | 缓存管理器             |
| storeKey | string                      | 要解包的存储的存储键   |

```go
func Unwrap(
    manager CommitKVStoreCacheManager,
    storeKey string) CommitKVStore {

    if manager.caches.has(storeKey) {
        cache = manager.caches.get(storeKey)
        return cache.store
    } else {
        return nil
    }
}
```

`Reset` 重置管理器的缓存映射。

| 名称    | 类型                        | 描述             |
| ------- | --------------------------- | ---------------- |
| manager | `CommitKVStoreCacheManager` | 缓存管理器       |

```go
function Reset(manager CommitKVStoreCacheManager) {

    for (let storeKey of manager.caches.keys()) {
        manager.caches.delete(storeKey)
    }
}
```

#### CommitKVStoreCache

`NewCommitKVStoreCache` 创建一个新的 `CommitKVStoreCache` 并返回它。

| 名称  | 类型          | 描述                   |
| ----- | ------------- | ---------------------- |
| store | CommitKVStore | 要缓存的存储           |
| size  | string        | 决定要创建的缓存的容量 |

```go
func NewCommitKVStoreCache(
    store CommitKVStore,
    size uint) CommitKVStoreCache {
    KVCache = CommitKVStoreCache{store, NewCache(size)}
    return KVCache
}
```

`Get` 通过键检索值。它首先在缓存中查找。如果键不在缓存中，则将查询委托给底层的 `CommitKVStore`。在后一种情况下，键值对将被缓存。该方法返回值。

| 名称    | 类型                 | 描述                                                         |
| ------- | -------------------- | ----------------------------------------------------------- |
| KVCache | `CommitKVStoreCache` | 从中检索键/值对的 `CommitKVStoreCache`                        |
| key     | string               | 要检索的键/值对的键                                           |

```go
func Get(
    KVCache CommitKVStoreCache,
    key string) []byte {
    valueCache, success := KVCache.cache.Get(key)
    if success {
        // cache hit
        return valueCache
    } else {
        // cache miss
        valueStore = KVCache.store.Get(key)
        KVCache.cache.Add(key, valueStore)
        return valueStore
    }
}
```

`Set` 方法将键/值对插入写入缓存和底层的 `CommitKVStore` 中。

| 名称    | 类型                 | 描述                                                         |
| ------- | -------------------- | ----------------------------------------------------------- |
| KVCache | `CommitKVStoreCache` | 要插入键/值对的 `CommitKVStoreCache`                          |
| key     | string               | 要插入的键/值对的键                                           |
| value   | []byte               | 要插入的键/值对的值                                           |

```go
func Set(
    KVCache CommitKVStoreCache,
    key string,
    value []byte) {

    KVCache.cache.Add(key, value)
    KVCache.store.Set(key, value)
}
```

`Delete` 方法从写入缓存和底层的 `CommitKVStore` 中删除键/值对。

| 名称    | 类型                 | 描述                                                         |
| ------- | -------------------- | ----------------------------------------------------------- |
| KVCache | `CommitKVStoreCache` | 从中删除键/值对的 `CommitKVStoreCache`                        |
| key     | string               | 要删除的键/值对的键                                           |

```go
func Delete(
    KVCache CommitKVStoreCache,
    key string) {

    KVCache.cache.Remove(key)
    KVCache.store.Delete(key)
}
```

`CacheWrap` 方法将一个 `CommitKVStoreCache` 包装在另一个缓存层 (`CacheKV`) 中。

> 目前尚不清楚是否存在使用 `CacheWrap` 的用例。

| 名称    | 类型                 | 描述                                                         |
| ------- | -------------------- | ----------------------------------------------------------- |
| KVCache | `CommitKVStoreCache` | 要包装的 `CommitKVStoreCache`                                 |

```go
func CacheWrap(
    KVCache CommitKVStoreCache) {
     
    return CacheKV.NewStore(KVCache)
}
```

### 实现细节

实现块间缓存使用了一个固定大小的自适应替换缓存（ARC）作为缓存。[ARC实现](https://github.com/hashicorp/golang-lru/blob/master/arc.go)是线程安全的。ARC是对标准LRU缓存的改进，它同时跟踪使用的频率和最近使用的情况。这样可以避免对新条目的访问突增导致频繁使用的旧条目被驱逐。相比标准LRU缓存，它增加了一些额外的跟踪开销，计算上大约是原来的两倍，额外的内存开销与缓存的大小成线性关系。默认的缓存大小是1000。

## 历史

2022年12月20日 - 初始草稿完成并提交为PR

## 版权

此处的所有内容均在[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)下许可。




# Inter-block Cache

* [Inter-block Cache](#inter-block-cache)
    * [Synopsis](#synopsis)
    * [Overview and basic concepts](#overview-and-basic-concepts)
        * [Motivation](#motivation)
        * [Definitions](#definitions)
    * [System model and properties](#system-model-and-properties)
        * [Assumptions](#assumptions)
        * [Properties](#properties)
            * [Thread safety](#thread-safety)
            * [Crash recovery](#crash-recovery)
            * [Iteration](#iteration)
    * [Technical specification](#technical-specification)
        * [General design](#general-design)
        * [API](#api)
            * [CommitKVCacheManager](#commitkvcachemanager)
            * [CommitKVStoreCache](#commitkvstorecache)
        * [Implementation details](#implementation-details)
    * [History](#history)
    * [Copyright](#copyright)

## Synopsis

The inter-block cache is an in-memory cache storing (in-most-cases) immutable state that modules need to read in between blocks. When enabled, all sub-stores of a multi store, e.g., `rootmulti`, are wrapped.

## Overview and basic concepts

### Motivation

The goal of the inter-block cache is to allow SDK modules to have fast access to data that it is typically queried during the execution of every block. This is data that do not change often, e.g. module parameters. The inter-block cache wraps each `CommitKVStore` of a multi store such as `rootmulti` with a fixed size, write-through cache. Caches are not cleared after a block is committed, as opposed to other caching layers such as `cachekv`.

### Definitions

* `Store key` uniquely identifies a store.
* `KVCache` is a `CommitKVStore` wrapped with a cache.
* `Cache manager` is a key component of the inter-block cache responsible for maintaining a map from `store keys` to `KVCaches`.

## System model and properties

### Assumptions

This specification assumes that there exists a cache implementation accessible to the inter-block cache feature.

> The implementation uses adaptive replacement cache (ARC), an enhancement over the standard last-recently-used (LRU) cache in that tracks both frequency and recency of use.

The inter-block cache requires that the cache implementation to provide methods to create a cache, add a key/value pair, remove a key/value pair and retrieve the value associated to a key. In this specification, we assume that a `Cache` feature offers this functionality through the following methods:

* `NewCache(size int)` creates a new cache with `size` capacity and returns it.
* `Get(key string)` attempts to retrieve a key/value pair from `Cache.` It returns `(value []byte, success bool)`. If `Cache` contains the key, it `value` contains the associated value and `success=true`. Otherwise, `success=false` and `value` should be ignored.
* `Add(key string, value []byte)` inserts a key/value pair into the `Cache`.
* `Remove(key string)` removes the key/value pair identified by `key` from `Cache`.

The specification also assumes that `CommitKVStore` offers the following API:

* `Get(key string)` attempts to retrieve a key/value pair from `CommitKVStore`.
* `Set(key, string, value []byte)` inserts a key/value pair into the `CommitKVStore`.
* `Delete(key string)` removes the key/value pair identified by `key` from `CommitKVStore`.

> Ideally, both `Cache` and `CommitKVStore` should be specified in a different document and referenced here.

### Properties

#### Thread safety

Accessing the `cache manager` or a `KVCache` is not thread-safe: no method is guarded with a lock.
Note that this is true even if the cache implementation is thread-safe.

> For instance, assume that two `Set` operations are executed concurrently on the same key, each writing a different value. After both are executed, the cache and the underlying store may be inconsistent, each storing a different value under the same key.

#### Crash recovery

The inter-block cache transparently delegates `Commit()` to its aggregate `CommitKVStore`. If the 
aggregate `CommitKVStore` supports atomic writes and use them to guarantee that the store is always in a consistent state in disk, the inter-block cache can be transparently moved to a consistent state when a failure occurs.

> Note that this is the case for `IAVLStore`, the preferred `CommitKVStore`. On commit, it calls `SaveVersion()` on the underlying `MutableTree`. `SaveVersion` writes to disk are atomic via batching. This means that only consistent versions of the store (the tree) are written to the disk. Thus, in case of a failure during a `SaveVersion` call, on recovery from disk, the version of the store will be consistent.

#### Iteration

Iteration over each wrapped store is supported via the embedded `CommitKVStore` interface.

## Technical specification

### General design

The inter-block cache feature is composed by two components: `CommitKVCacheManager` and `CommitKVCache`.

`CommitKVCacheManager` implements the cache manager. It maintains a mapping from a store key to a `KVStore`.

```go
type CommitKVStoreCacheManager interface{
    cacheSize uint
    caches map[string]CommitKVStore
}
```

`CommitKVStoreCache` implements a `KVStore`: a write-through cache that wraps a `CommitKVStore`. This means that deletes and writes always happen to both the cache and the underlying `CommitKVStore`. Reads on the other hand first hit the internal cache. During a cache miss, the read is delegated to the underlying `CommitKVStore` and cached.

```go
type CommitKVStoreCache interface{
    store CommitKVStore
    cache Cache
}
```

To enable inter-block cache on `rootmulti`, one needs to instantiate a `CommitKVCacheManager` and set it by calling `SetInterBlockCache()` before calling one of `LoadLatestVersion()`, `LoadLatestVersionAndUpgrade(...)`, `LoadVersionAndUpgrade(...)` and `LoadVersion(version)`.

### API

#### CommitKVCacheManager

The method `NewCommitKVStoreCacheManager` creates a new cache manager and returns it.

| Name | Type    | Description                                                              |
| ---- | ------- | ------------------------------------------------------------------------ |
| size | integer | Determines the capacity of each of the KVCache maintained by the manager |

```go
func NewCommitKVStoreCacheManager(size uint) CommitKVStoreCacheManager {
    manager = CommitKVStoreCacheManager{size, make(map[string]CommitKVStore)}
    return manager
}
```

`GetStoreCache` returns a cache from the CommitStoreCacheManager for a given store key. If no cache exists for the store key, then one is created and set.

| Name     | Type                        | Description                                                                            |
| -------- | --------------------------- | -------------------------------------------------------------------------------------- |
| manager  | `CommitKVStoreCacheManager` | The cache manager                                                                      |
| storeKey | string                      | The store key of the store being retrieved                                             |
| store    | `CommitKVStore`             | The store that it is cached in case the manager does not have any in its map of caches |

```go
func GetStoreCache(
    manager CommitKVStoreCacheManager,
    storeKey string,
    store CommitKVStore) CommitKVStore {

    if manager.caches.has(storeKey) {
        return manager.caches.get(storeKey)
    } else {
        cache = CommitKVStoreCacheManager{store, manager.cacheSize}
        manager.set(storeKey, cache)
        return cache
    }
}
```

`Unwrap` returns the underlying CommitKVStore for a given store key.

| Name     | Type                        | Description                                |
| -------- | --------------------------- | ------------------------------------------ |
| manager  | `CommitKVStoreCacheManager` | The cache manager                          |
| storeKey | string                      | The store key of the store being unwrapped |

```go
func Unwrap(
    manager CommitKVStoreCacheManager,
    storeKey string) CommitKVStore {

    if manager.caches.has(storeKey) {
        cache = manager.caches.get(storeKey)
        return cache.store
    } else {
        return nil
    }
}
```

`Reset` resets the manager's map of caches.

| Name    | Type                        | Description       |
| ------- | --------------------------- | ----------------- |
| manager | `CommitKVStoreCacheManager` | The cache manager |

```go
function Reset(manager CommitKVStoreCacheManager) {

    for (let storeKey of manager.caches.keys()) {
        manager.caches.delete(storeKey)
    }
}
```

#### CommitKVStoreCache

`NewCommitKVStoreCache` creates a new `CommitKVStoreCache` and returns it.

| Name  | Type          | Description                                        |
| ----- | ------------- | -------------------------------------------------- |
| store | CommitKVStore | The store to be cached                             |
| size  | string        | Determines the capacity of the cache being created |

```go
func NewCommitKVStoreCache(
    store CommitKVStore,
    size uint) CommitKVStoreCache {
    KVCache = CommitKVStoreCache{store, NewCache(size)}
    return KVCache
}
```

`Get` retrieves a value by key. It first looks in the cache. If the key is not in the cache, the query is delegated to the underlying `CommitKVStore`. In the latter case, the key/value pair is cached. The method returns the value.

| Name    | Type                 | Description                                                         |
| ------- | -------------------- | ------------------------------------------------------------------- |
| KVCache | `CommitKVStoreCache` | The `CommitKVStoreCache` from which the key/value pair is retrieved |
| key     | string               | Key of the key/value pair being retrieved                           |

```go
func Get(
    KVCache CommitKVStoreCache,
    key string) []byte {
    valueCache, success := KVCache.cache.Get(key)
    if success {
        // cache hit
        return valueCache
    } else {
        // cache miss
        valueStore = KVCache.store.Get(key)
        KVCache.cache.Add(key, valueStore)
        return valueStore
    }
}
```

`Set` inserts a key/value pair into both the write-through cache and the underlying `CommitKVStore`.

| Name    | Type                 | Description                                                      |
| ------- | -------------------- | ---------------------------------------------------------------- |
| KVCache | `CommitKVStoreCache` | The `CommitKVStoreCache` to which the key/value pair is inserted |
| key     | string               | Key of the key/value pair being inserted                         |
| value   | []byte               | Value of the key/value pair being inserted                       |

```go
func Set(
    KVCache CommitKVStoreCache,
    key string,
    value []byte) {

    KVCache.cache.Add(key, value)
    KVCache.store.Set(key, value)
}
```

`Delete` removes a key/value pair from both the write-through cache and the underlying `CommitKVStore`.

| Name    | Type                 | Description                                                       |
| ------- | -------------------- | ----------------------------------------------------------------- |
| KVCache | `CommitKVStoreCache` | The `CommitKVStoreCache` from which the key/value pair is deleted |
| key     | string               | Key of the key/value pair being deleted                           |

```go
func Delete(
    KVCache CommitKVStoreCache,
    key string) {

    KVCache.cache.Remove(key)
    KVCache.store.Delete(key)
}
```

`CacheWrap` wraps a `CommitKVStoreCache` with another caching layer (`CacheKV`). 

> It is unclear whether there is a use case for `CacheWrap`. 

| Name    | Type                 | Description                            |
| ------- | -------------------- | -------------------------------------- |
| KVCache | `CommitKVStoreCache` | The `CommitKVStoreCache` being wrapped |

```go
func CacheWrap(
    KVCache CommitKVStoreCache) {
     
    return CacheKV.NewStore(KVCache)
}
```

### Implementation details

The inter-block cache implementation uses a fixed-sized adaptive replacement cache (ARC) as cache. [The ARC implementation](https://github.com/hashicorp/golang-lru/blob/master/arc.go) is thread-safe. ARC is an enhancement over the standard LRU cache in that tracks both frequency and recency of use. This avoids a burst in access to new entries from evicting the frequently used older entries. It adds some additional tracking overhead to a standard LRU cache, computationally it is roughly `2x` the cost, and the extra memory overhead is linear with the size of the cache. The default cache size is `1000`.

## History

Dec 20, 2022 - Initial draft finished and submitted as a PR

## Copyright

All content herein is licensed under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).
