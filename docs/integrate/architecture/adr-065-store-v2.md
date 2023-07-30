# ADR-065: 存储 V2

## 更新日志

* 2023年2月14日：初稿（@alexanderbez）

## 状态

草稿

## 摘要

自从首个 Cosmos Hub 推出以来，Cosmos SDK 基于应用程序所使用的存储和状态原语基本上没有发生变化。从开发者和客户端用户体验的角度来看，Cosmos SDK 基于应用程序的需求和需求已经发展并超越了这些原语在生态系统中首次引入时的情况。

随着这些应用程序逐渐获得了广泛的采用，Cosmos SDK 的状态和存储原语中暴露出了许多关键的缺陷和问题。

为了跟上客户端和开发者不断发展的需求和需求，对这些原语进行重大改进是必要的。

## 背景

Cosmos SDK 为应用程序开发者提供了各种存储原语来处理应用程序状态。具体来说，每个模块都包含自己的 Merkle 承诺数据结构 - 一个 IAVL 树。在这个数据结构中，一个模块可以存储和检索键值对以及 Merkle 承诺（即证明），这些证明指示这些键值对在全局应用程序状态中是否存在。这个数据结构是基本层的 `KVStore`。

此外，SDK 还在这个 Merkle 数据结构之上提供了抽象。即，根多存储（RMS）是每个模块的 `KVStore` 的集合。通过 RMS，应用程序可以为客户端提供查询和证明，除了通过使用 `StoreKey`（一种 OCAP 原语）为模块提供对其自己的独特 `KVStore` 的访问。

在 RMS 和底层的 IAVL `KVStore` 之间还有进一步的抽象层。`GasKVStore` 负责跟踪状态机读写的 gas IO 消耗。`CacheKVStore` 负责提供一种缓存读取和缓冲写入的方式，以使状态转换具有原子性，例如事务执行或治理提案执行。

这些抽象层和 Cosmos SDK 存储的整体设计存在一些关键的缺点：

* 由于每个模块都有自己的 IAVL `KVStore`，因此承诺不是[原子的](https://github.com/cosmos/cosmos-sdk/issues/14625)
    * 注意，我们仍然可以允许模块拥有自己的 IAVL `KVStore`，但是 IAVL 库需要支持将 DB 实例作为参数传递给各种 IAVL API 的能力。
* 由于 IAVL 负责状态存储和承诺，随着磁盘空间呈指数增长，运行存档节点变得越来越昂贵。
* 随着网络规模的增大，各种性能瓶颈开始在许多方面显现，例如查询性能、网络升级、状态迁移和一般应用性能。
* 开发者的用户体验很差，因为它不允许应用程序开发者尝试不同类型的存储和承诺方法，还有上面提到的许多层次的抽象的复杂性。

有关更多信息，请参见[存储讨论](https://github.com/cosmos/cosmos-sdk/discussions/13545)。

## 替代方案

之前有一次尝试重构存储层，描述在[ADR-040](adr-040-storage-and-smt-state-commitments.md)中。
然而，这种方法主要源于 IAVL 的缺点和各种性能问题。虽然有一个（部分）实现了[ADR-040](adr-040-storage-and-smt-state-commitments.md)，
但由于一些原因，它从未被采用，例如依赖于处于研究阶段的 SMT，以及一些设计选择上无法完全达成一致的问题，例如会导致大量状态膨胀的快照机制。

## 决策

我们建议在[ADR-040](adr-040-storage-and-smt-state-commitments.md)中引入的一些伟大思想的基础上进行构建，
同时对底层实现更加灵活，整体上更少侵入性。具体而言，我们建议：

* 将状态承诺（**SC**）和状态存储（**SS**）的关注点分离，前者用于共识，后者用于状态机和客户端。
* 减少 RMS 和底层存储之间必要的抽象层。
* 通过为核心 IAVL API 提供批处理数据库对象，提供原子模块存储承诺。
* 减少 `CacheKVStore` 实现中的复杂性，同时提高性能<sup>[3]</sup>。

此外，我们将继续使用IAVL作为[承诺存储](https://cryptography.fandom.com/wiki/Commitment_scheme)。虽然我们可能在长期内不会完全确定使用IAVL，但我们没有强有力的实证证据表明存在更好的替代方案。鉴于SDK提供了存储接口，将来如果有证据表明需要更好的替代方案，更改承诺存储应该是足够的。然而，对IAVL的有希望的工作正在进行中，这将带来显著的性能改进<sup>[1,2]</sup>。

### 分离SS和SC

通过分离SS和SC，我们可以针对主要的使用案例和访问模式进行优化。具体而言，SS层将负责直接访问以(key, value)对形式的数据，而SC层（IAVL）将负责对数据进行承诺并提供Merkle证明。

请注意，SS层和SC层之间的底层物理存储数据库将是相同的。因此，为了避免(key, value)对之间的冲突，两个层都将被命名空间化。

#### 状态承诺（SC）

鉴于现有解决方案今天既充当SS又充当SC，我们可以简单地将其重新用作仅充当SC层，而无需对访问模式或行为进行任何重大更改。换句话说，现有的基于IAVL的模块`KVStore`集合将充当SC层。

然而，为了使SC层保持轻量级并且不重复SS层中保存的大部分数据，我们鼓励节点运营者采用紧凑的修剪策略。

#### 状态存储（SS）

在RMS中，我们将公开一个由与SC层相同的物理数据库支持的*单个*`KVStore`。为了避免冲突，此`KVStore`将明确进行命名空间划分，并且将充当(key, value)对的主要存储。

虽然我们很可能会继续使用`cosmos-db`或某些本地接口，以便在研究和基准测试继续进行时灵活地迭代首选的物理存储后端。然而，我们建议将RocksDB硬编码为主要的物理存储后端。

由于SS层将被实现为`KVStore`，它将支持以下功能：

* 范围查询
* CRUD操作
* 历史查询和版本控制
* 剪枝

RMS将使用专用的内部`MemoryListener`来跟踪所有缓冲写入，每个`StoreKey`都有一个。对于每个块高度，在`Commit`时，SS层将使用块高度作为时间戳（无符号整数）将所有缓冲的（键，值）对写入[RocksDB用户定义的时间戳](https://github.com/facebook/rocksdb/wiki/User-defined-Timestamp-%28Experimental%29)列族下，这将允许客户端在历史和当前高度获取（键，值）对，并使迭代和范围查询相对高效，因为时间戳是键的后缀。

请注意，我们选择不使用更通用的方法，允许任何嵌入式键值数据库（如LevelDB或PebbleDB），使用高度键前缀键来有效地对状态进行版本控制，因为大多数这些数据库使用可变长度的键，这将使迭代和范围查询等操作的性能下降。

由于操作员可能希望在SS和SC中使用不同的剪枝策略，例如在SC中使用非常严格的剪枝策略，而在SS中使用较宽松的剪枝策略，我们建议引入额外的剪枝配置，其参数与SDK中现有的参数相同，并允许操作员独立于SC层控制SS层的剪枝策略。

请注意，SC的剪枝策略必须与操作员的状态同步配置一致。这样可以确保状态同步快照能够成功执行，否则可能会在SC中触发一个不可用的高度。

#### 状态同步

状态同步过程应该在SC和SS层分离的情况下基本不受影响。然而，如果一个节点通过状态同步进行同步，该节点的SS层将不会有同步状态的可用高度，因为IAVL导入过程没有设置直接进行键值插入的方式。需要修改IAVL导入过程以便使同步状态的高度可用。

注意，对于状态机本身来说，这并不是一个问题，因为当进行查询时，RMS会自动正确地将查询定向（参见[Queries](#queries)）。

#### 查询

为了在SC层和SS层之间整合查询路由，我们建议在RMS中构建一个"查询路由器"的概念。这个查询路由器将被提供给每个`KVStore`实现。查询路由器将根据一些参数将查询路由到SC层或SS层。如果`prove: true`，则查询必须路由到SC层。否则，如果查询高度在SS层中可用，则从SS层提供查询。否则，我们回退到SC层。

如果没有提供高度，则SS层将假设为最新高度。SS层将存储一个反向索引来查找`LatestVersion -> timestamp(version)`，该索引在`Commit`时设置。

#### 证明

由于SS层本质上只是一个存储层，没有对（键，值）对的任何承诺，因此它无法在查询期间向客户端提供Merkle证明。

由于针对SC层的修剪策略由操作员配置，因此如果版本存在且`prove: true`，RMS可以将查询路由到SC层。否则，查询将回退到SS层而没有证明。

我们可以探索使用状态快照实时重建与查询中提供的版本最接近的内存中的IAVL树的想法。然而，目前尚不清楚这种方法的性能影响。

### 原子提交

我们建议修改现有的IAVL API，使其接受一个批处理DB对象，而不是依赖于`nodeDB`中的内部批处理对象。由于SC层中的每个底层IAVL `KVStore`共享相同的DB，这将允许提交是原子的。

具体来说，我们建议：

* 从`nodeDB`中删除`dbm.Batch`字段
* 更新`MutableTree` IAVL类型的`SaveVersion`方法，使其接受一个批处理对象
* 更新`CommitKVStore`接口的`Commit`方法，使其接受一个批处理对象
* 在`Commit`期间在RMS中创建一个批处理对象，并将此对象传递给每个`KVStore`
* 在所有存储成功提交后写入数据库批处理

注意，这将需要更新 IAVL，以便在 `SaveVersion` 过程中不依赖或假设任何批处理存在。

## 影响

由于引入了新的存储 V2 包，我们应该期望查询和交易的性能得到改善，因为关注点得到了分离。我们还应该期望在承诺方案和存储后端的实验方面提供更好的开发者体验，此外，还减少了对 KVStores 的抽象，使缓存和状态分支等操作更加直观。

然而，由于提议的设计，提供历史查询的状态证明存在一些缺点。

### 向后兼容性

本 ADR 提议通过一个全新的包对 Cosmos SDK 中的存储实现进行更改。接口可以从现有的 `store` 中借用和扩展，但不会破坏或修改任何现有的实现或接口。

### 积极影响

* 独立的 SS 和 SC 层的性能改进
* 减少了存储原语的抽象层，使其更易于理解
* SC 的原子承诺
* 存储类型和接口的重新设计将允许更多的实验，例如不同的物理存储后端和不同的应用模块的承诺方案

### 负面影响

* 提供历史状态的证明具有挑战性

### 中性影响

* 保持 IAVL 作为主要的承诺数据结构，尽管正在进行重大的性能改进

## 进一步讨论

### 模块存储控制

许多模块存储次要索引，通常仅用于支持客户端查询，但实际上不需要用于状态机的状态转换。这意味着这些索引在 SC 层实际上没有存在的理由，因为它们占用了不必要的空间。值得探索的是，允许模块指示希望在 SC 层持久化的 (key, value) 对的 API 是什么样子的，同时也隐含着 SS 层，而不仅仅是将 (key, value) 对仅持久化在 SS 层。

### 历史状态证明

目前尚不清楚在社区中提供历史状态的承诺证明的重要性或需求。虽然可以设计出一些解决方案，例如根据状态快照动态重建树结构，但目前尚不清楚这些解决方案的性能影响。

### 物理数据库后端

本 ADR 建议使用 RocksDB 来利用用户定义的时间戳作为版本控制机制。然而，还有其他可用的物理数据库后端，可能提供了与 RocksDB 相比的替代版本控制方式，并且还能提供性能改进。例如，PebbleDB 也支持 MVCC 时间戳，但我们需要探索 PebbleDB 如何处理压缩和随时间增长的状态。

## 参考资料

* [1] https://github.com/cosmos/iavl/pull/676
* [2] https://github.com/cosmos/iavl/pull/664
* [3] https://github.com/cosmos/cosmos-sdk/issues/14990


# ADR-065: Store V2

## Changelog

* Feb 14, 2023: Initial Draft (@alexanderbez)

## Status

DRAFT

## Abstract

The storage and state primitives that Cosmos SDK based applications have used have
by and large not changed since the launch of the inaugural Cosmos Hub. The demands
and needs of Cosmos SDK based applications, from both developer and client UX
perspectives, have evolved and outgrown the ecosystem since these primitives
were first introduced.

Over time as these applications have gained significant adoption, many critical
shortcomings and flaws have been exposed in the state and storage primitives of
the Cosmos SDK.

In order to keep up with the evolving demands and needs of both clients and developers,
a major overhaul to these primitives are necessary.

## Context

The Cosmos SDK provides application developers with various storage primitives
for dealing with application state. Specifically, each module contains its own
merkle commitment data structure -- an IAVL tree. In this data structure, a module
can store and retrieve key-value pairs along with Merkle commitments, i.e. proofs,
to those key-value pairs indicating that they do or do not exist in the global
application state. This data structure is the base layer `KVStore`.

In addition, the SDK provides abstractions on top of this Merkle data structure.
Namely, a root multi-store (RMS) is a collection of each module's `KVStore`.
Through the RMS, the application can serve queries and provide proofs to clients
in addition to provide a module access to its own unique `KVStore` though the use
of `StoreKey`, which is an OCAP primitive.

There are further layers of abstraction that sit between the RMS and the underlying
IAVL `KVStore`. A `GasKVStore` is responsible for tracking gas IO consumption for
state machine reads and writes. A `CacheKVStore` is responsible for providing a
way to cache reads and buffer writes to make state transitions atomic, e.g.
transaction execution or governance proposal execution.

There are a few critical drawbacks to these layers of abstraction and the overall
design of storage in the Cosmos SDK:

* Since each module has its own IAVL `KVStore`, commitments are not [atomic](https://github.com/cosmos/cosmos-sdk/issues/14625)
    * Note, we can still allow modules to have their own IAVL `KVStore`, but the
      IAVL library will need to support the ability to pass a DB instance as an
      argument to various IAVL APIs.
* Since IAVL is responsible for both state storage and commitment, running an 
  archive node becomes increasingly expensive as disk space grows exponentially.
* As the size of a network increases, various performance bottlenecks start to
  emerge in many areas such as query performance, network upgrades, state
  migrations, and general application performance.
* Developer UX is poor as it does not allow application developers to experiment
  with different types of approaches to storage and commitments, along with the
  complications of many layers of abstractions referenced above.

See the [Storage Discussion](https://github.com/cosmos/cosmos-sdk/discussions/13545) for more information.

## Alternatives

There was a previous attempt to refactor the storage layer described in [ADR-040](adr-040-storage-and-smt-state-commitments.md).
However, this approach mainly stems on the short comings of IAVL and various performance
issues around it. While there was a (partial) implementation of [ADR-040](adr-040-storage-and-smt-state-commitments.md),
it was never adopted for a variety of reasons, such as the reliance on using an
SMT, which was more in a research phase, and some design choices that couldn't
be fully agreed upon, such as the snap-shotting mechanism that would result in
massive state bloat.

## Decision

We propose to build upon some of the great ideas introduced in [ADR-040](adr-040-storage-and-smt-state-commitments.md),
while being a bit more flexible with the underlying implementations and overall
less intrusive. Specifically, we propose to:

* Separate the concerns of state commitment (**SC**), needed for consensus, and
  state storage (**SS**), needed for state machine and clients.
* Reduce layers of abstractions necessary between the RMS and underlying stores.
* Provide atomic module store commitments by providing a batch database object
  to core IAVL APIs.
* Reduce complexities in the `CacheKVStore` implementation while also improving
  performance<sup>[3]</sup>.

Furthermore, we will keep the IAVL is the backing [commitment](https://cryptography.fandom.com/wiki/Commitment_scheme)
store for the time being. While we might not fully settle on the use of IAVL in
the long term, we do not have strong empirical evidence to suggest a better
alternative. Given that the SDK provides interfaces for stores, it should be sufficient
to change the backing commitment store in the future should evidence arise to
warrant a better alternative. However there is promising work being done to IAVL
that should result in significant performance improvement <sup>[1,2]</sup>.

### Separating SS and SC

By separating SS and SC, it will allow for us to optimize against primary use cases
and access patterns to state. Specifically, The SS layer will be responsible for
direct access to data in the form of (key, value) pairs, whereas the SC layer (IAVL)
will be responsible for committing to data and providing Merkle proofs.

Note, the underlying physical storage database will be the same between both the
SS and SC layers. So to avoid collisions between (key, value) pairs, both layers
will be namespaced.

#### State Commitment (SC)

Given that the existing solution today acts as both SS and SC, we can simply
repurpose it to act solely as the SC layer without any significant changes to
access patterns or behavior. In other words, the entire collection of existing
IAVL-backed module `KVStore`s will act as the SC layer.

However, in order for the SC layer to remain lightweight and not duplicate a
majority of the data held in the SS layer, we encourage node operators to keep
tight pruning strategies.

#### State Storage (SS)

In the RMS, we will expose a *single* `KVStore` backed by the same physical
database that backs the SC layer. This `KVStore` will be explicitly namespaced
to avoid collisions and will act as the primary storage for (key, value) pairs.

While we most likely will continue the use of `cosmos-db`, or some local interface,
to allow for flexibility and iteration over preferred physical storage backends
as research and benchmarking continues. However, we propose to hardcode the use
of RocksDB as the primary physical storage backend.

Since the SS layer will be implemented as a `KVStore`, it will support the
following functionality:

* Range queries
* CRUD operations
* Historical queries and versioning
* Pruning

The RMS will keep track of all buffered writes using a dedicated and internal
`MemoryListener` for each `StoreKey`. For each block height, upon `Commit`, the
SS layer will write all buffered (key, value) pairs under a [RocksDB user-defined timestamp](https://github.com/facebook/rocksdb/wiki/User-defined-Timestamp-%28Experimental%29) column
family using the block height as the timestamp, which is an unsigned integer.
This will allow a client to fetch (key, value) pairs at historical and current
heights along with making iteration and range queries relatively performant as
the timestamp is the key suffix.

Note, we choose not to use a more general approach of allowing any embedded key/value
database, such as LevelDB or PebbleDB, using height key-prefixed keys to
effectively version state because most of these databases use variable length
keys which would effectively make actions likes iteration and range queries less
performant.

Since operators might want pruning strategies to differ in SS compared to SC,
e.g. having a very tight pruning strategy in SC while having a looser pruning
strategy for SS, we propose to introduce an additional pruning configuration,
with parameters that are identical to what exists in the SDK today, and allow
operators to control the pruning strategy of the SS layer independently of the
SC layer.

Note, the SC pruning strategy must be congruent with the operator's state sync
configuration. This is so as to allow state sync snapshots to execute successfully,
otherwise, a snapshot could be triggered on a height that is not available in SC.

#### State Sync

The state sync process should be largely unaffected by the separation of the SC
and SS layers. However, if a node syncs via state sync, the SS layer of the node
will not have the state synced height available, since the IAVL import process is
not setup in way to easily allow direct key/value insertion. A modification of
the IAVL import process would be necessary to facilitate having the state sync
height available.

Note, this is not problematic for the state machine itself because when a query
is made, the RMS will automatically direct the query correctly (see [Queries](#queries)).

#### Queries

To consolidate the query routing between both the SC and SS layers, we propose to
have a notion of a "query router" that is constructed in the RMS. This query router
will be supplied to each `KVStore` implementation. The query router will route
queries to either the SC layer or the SS layer based on a few parameters. If
`prove: true`, then the query must be routed to the SC layer. Otherwise, if the
query height is available in the SS layer, the query will be served from the SS
layer. Otherwise, we fall back on the SC layer.

If no height is provided, the SS layer will assume the latest height. The SS
layer will store a reverse index to lookup `LatestVersion -> timestamp(version)`
which is set on `Commit`.

#### Proofs

Since the SS layer is naturally a storage layer only, without any commitments
to (key, value) pairs, it cannot provide Merkle proofs to clients during queries.

Since the pruning strategy against the SC layer is configured by the operator,
we can therefore have the RMS route the query SC layer if the version exists and
`prove: true`. Otherwise, the query will fall back to the SS layer without a proof.

We could explore the idea of using state snapshots to rebuild an in-memory IAVL
tree in real time against a version closest to the one provided in the query.
However, it is not clear what the performance implications will be of this approach.

### Atomic Commitment

We propose to modify the existing IAVL APIs to accept a batch DB object instead
of relying on an internal batch object in `nodeDB`. Since each underlying IAVL
`KVStore` shares the same DB in the SC layer, this will allow commits to be
atomic.

Specifically, we propose to:

* Remove the `dbm.Batch` field from `nodeDB`
* Update the `SaveVersion` method of the `MutableTree` IAVL type to accept a batch object
* Update the `Commit` method of the `CommitKVStore` interface to accept a batch object
* Create a batch object in the RMS during `Commit` and pass this object to each
  `KVStore`
* Write the database batch after all stores have committed successfully

Note, this will require IAVL to be updated to not rely or assume on any batch
being present during `SaveVersion`.

## Consequences

As a result of a new store V2 package, we should expect to see improved performance
for queries and transactions due to the separation of concerns. We should also
expect to see improved developer UX around experimentation of commitment schemes
and storage backends for further performance, in addition to a reduced amount of
abstraction around KVStores making operations such as caching and state branching
more intuitive.

However, due to the proposed design, there are drawbacks around providing state
proofs for historical queries.

### Backwards Compatibility

This ADR proposes changes to the storage implementation in the Cosmos SDK through
an entirely new package. Interfaces may be borrowed and extended from existing
types that exist in `store`, but no existing implementations or interfaces will
be broken or modified.

### Positive

* Improved performance of independent SS and SC layers
* Reduced layers of abstraction making storage primitives easier to understand
* Atomic commitments for SC
* Redesign of storage types and interfaces will allow for greater experimentation
  such as different physical storage backends and different commitment schemes
  for different application modules

### Negative

* Providing proofs for historical state is challenging

### Neutral

* Keeping IAVL as the primary commitment data structure, although drastic
  performance improvements are being made

## Further Discussions

### Module Storage Control

Many modules store secondary indexes that are typically solely used to support
client queries, but are actually not needed for the state machine's state
transitions. What this means is that these indexes technically have no reason to
exist in the SC layer at all, as they take up unnecessary space. It is worth
exploring what an API would look like to allow modules to indicate what (key, value)
pairs they want to be persisted in the SC layer, implicitly indicating the SS
layer as well, as opposed to just persisting the (key, value) pair only in the
SS layer.

### Historical State Proofs

It is not clear what the importance or demand is within the community of providing
commitment proofs for historical state. While solutions can be devised such as
rebuilding trees on the fly based on state snapshots, it is not clear what the
performance implications are for such solutions.

### Physical DB Backends

This ADR proposes usage of RocksDB to utilize user-defined timestamps as a
versioning mechanism. However, other physical DB backends are available that may
offer alternative ways to implement versioning while also providing performance
improvements over RocksDB. E.g. PebbleDB supports MVCC timestamps as well, but
we'll need to explore how PebbleDB handles compaction and state growth over time.

## References

* [1] https://github.com/cosmos/iavl/pull/676
* [2] https://github.com/cosmos/iavl/pull/664
* [3] https://github.com/cosmos/cosmos-sdk/issues/14990
