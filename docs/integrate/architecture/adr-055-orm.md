# ADR 055: ORM

## 变更日志

* 2022-04-27: 初稿

## 状态

已接受 已实施

## 摘要

为了让开发人员更容易构建 Cosmos SDK 模块，并让客户端能够查询、索引和验证状态数据的证明，我们为 Cosmos SDK 实现了一个 ORM（对象关系映射）层。

## 背景

在 Cosmos SDK 中，历史上的模块一直直接使用键值存储，并创建了各种手写函数来管理键格式以及构建二级索引。这在构建模块时消耗了大量时间，并且容易出错。由于键格式是非标准的，有时文档描述不清楚，并且可能会发生变化，因此客户端很难通用地对状态数据进行索引、查询和验证 Merkle 证明。

Cosmos 生态系统中首次出现的“ORM”实例是在 [weave](https://github.com/iov-one/weave/tree/master/orm) 中。后来为 [regen-ledger](https://github.com/regen-network/regen-ledger/tree/157181f955823149e1825263a317ad8e16096da4/orm) 构建了一个更新版本，用于组模块，并且后来 [移植到了 SDK](https://github.com/cosmos/cosmos-sdk/tree/35d3312c3be306591fcba39892223f1244c8d108/x/group/internal/orm) 仅供该目的使用。

尽管这些早期设计极大地简化了编写状态机的工作，但仍需要大量手动配置，没有直接向客户端公开状态格式，并且在支持不同类型的索引键、复合键和范围查询方面有限制。

关于设计的讨论在 https://github.com/cosmos/cosmos-sdk/discussions/9156 中继续进行，并在 https://github.com/allinbits/cosmos-sdk-poc/tree/master/runtime/orm 和 https://github.com/cosmos/cosmos-sdk/pull/10454 中创建了更复杂的概念验证。

## 决策

这些先前的努力最终导致了创建 Cosmos SDK `orm` go 模块，该模块使用 protobuf 注解来指定 ORM 表定义。这个 ORM 基于新的 `google.golang.org/protobuf/reflect/protoreflect` API，并支持：

* 所有简单的 protobuf 类型（除了 `bytes`、`enum`、`float`、`double`）以及 `Timestamp` 和 `Duration` 的排序索引
* 无序的 `bytes` 和 `enum` 索引
* 复合主键和次要键
* 唯一索引
* 自增的 `uint64` 主键
* 复杂的前缀和范围查询
* 分页查询
* 完全逻辑解码 KV 存储数据

几乎所有直接解码状态所需的信息都在 .proto 文件中指定。每个表定义都指定了一个在 .proto 文件中唯一的 ID，而每个表中的索引在该表中是唯一的。因此，客户端只需要知道模块的名称以及该模块中特定 .proto 文件的前缀 ORM 数据，就可以直接解码状态数据。这些附加信息将直接通过应用程序配置公开，将在与应用程序连接相关的未来 ADR 中进行解释。

ORM 通过在键值存储中存储主键记录时不重复主键值来对存储空间进行优化。例如，如果对象 `{"a":0,"b":1}` 的主键是 `a`，它将以 `Key: '0', Value: {"b":1}` 的形式存储在键值存储中（使用更高效的 protobuf 二进制编码）。此外，从 https://github.com/cosmos/cosmos-proto 生成的代码还围绕 `google.golang.org/protobuf/reflect/protoreflect` API 进行了优化，以提高性能。

ORM 包含一个代码生成器，它在 ORM 的动态 `Table` 实现周围创建类型安全的包装器，并且是模块使用 ORM 的推荐方式。

ORM 测试提供了一个简化的银行模块演示，其中说明了：
* [ORM proto 选项](https://github.com/cosmos/cosmos-sdk/blob/0d846ae2f0424b2eb640f6679a703b52d407813d/orm/internal/testpb/bank.proto)
* [生成的代码](https://github.com/cosmos/cosmos-sdk/blob/0d846ae2f0424b2eb640f6679a703b52d407813d/orm/internal/testpb/bank.cosmos_orm.go)
* [在模块 Keeper 中的示例用法](https://github.com/cosmos/cosmos-sdk/blob/0d846ae2f0424b2eb640f6679a703b52d407813d/orm/model/ormdb/module_test.go)

## 后果

### 向后兼容性

采用ORM的状态机代码需要进行迁移，因为状态布局通常是不向后兼容的。
这些状态机还需要迁移到至少使用https://github.com/cosmos/cosmos-proto的状态数据。

### 积极的

* 更容易构建模块
* 更容易为状态添加二级索引
* 可以编写一个通用的ORM状态索引器
* 更容易编写进行状态证明的客户端
* 可以自动编写查询层，而不需要手动实现gRPC查询

### 消极的

* 性能比手写键差（目前）。参见[进一步讨论](#further-discussions)
以获取潜在的改进方法

### 中立的

## 进一步讨论

进一步的讨论将在Cosmos SDK框架工作组内进行。当前计划和正在进行的工作包括：

* 自动生成面向客户端的查询层
* 客户端查询库，可以透明地验证轻客户端证明
* 将ORM数据索引到SQL数据库
* 通过以下方式提高性能：
    * 优化现有的基于反射的代码，以避免在删除和更新简单表时进行不必要的获取操作
    * 更复杂的代码生成，例如使快速路径反射更快（避免`switch`语句），
  或者甚至完全生成与手写性能相等的代码


## 参考资料

* https://github.com/iov-one/weave/tree/master/orm).
* https://github.com/regen-network/regen-ledger/tree/157181f955823149e1825263a317ad8e16096da4/orm
* https://github.com/cosmos/cosmos-sdk/tree/35d3312c3be306591fcba39892223f1244c8d108/x/group/internal/orm
* https://github.com/cosmos/cosmos-sdk/discussions/9156
* https://github.com/allinbits/cosmos-sdk-poc/tree/master/runtime/orm
* https://github.com/cosmos/cosmos-sdk/pull/10454


# ADR 055: ORM

## Changelog

* 2022-04-27: First draft

## Status

ACCEPTED Implemented

## Abstract

In order to make it easier for developers to build Cosmos SDK modules and for clients to query, index and verify proofs
against state data, we have implemented an ORM (object-relational mapping) layer for the Cosmos SDK.

## Context

Historically modules in the Cosmos SDK have always used the key-value store directly and created various handwritten
functions for managing key format as well as constructing secondary indexes. This consumes a significant amount of
time when building a module and is error-prone. Because key formats are non-standard, sometimes poorly documented,
and subject to change, it is hard for clients to generically index, query and verify merkle proofs against state data.

The known first instance of an "ORM" in the Cosmos ecosystem was in [weave](https://github.com/iov-one/weave/tree/master/orm).
A later version was built for [regen-ledger](https://github.com/regen-network/regen-ledger/tree/157181f955823149e1825263a317ad8e16096da4/orm) for
use in the group module and later [ported to the SDK](https://github.com/cosmos/cosmos-sdk/tree/35d3312c3be306591fcba39892223f1244c8d108/x/group/internal/orm)
just for that purpose.

While these earlier designs made it significantly easier to write state machines, they still required a lot of manual
configuration, didn't expose state format directly to clients, and were limited in their support of different types
of index keys, composite keys, and range queries.

Discussions about the design continued in https://github.com/cosmos/cosmos-sdk/discussions/9156 and more
sophisticated proofs of concept were created in https://github.com/allinbits/cosmos-sdk-poc/tree/master/runtime/orm
and https://github.com/cosmos/cosmos-sdk/pull/10454.

## Decision

These prior efforts culminated in the creation of the Cosmos SDK `orm` go module which uses protobuf annotations
for specifying ORM table definitions. This ORM is based on the new `google.golang.org/protobuf/reflect/protoreflect`
API and supports:

* sorted indexes for all simple protobuf types (except `bytes`, `enum`, `float`, `double`) as well as `Timestamp` and `Duration`
* unsorted `bytes` and `enum` indexes
* composite primary and secondary keys
* unique indexes
* auto-incrementing `uint64` primary keys
* complex prefix and range queries
* paginated queries
* complete logical decoding of KV-store data

Almost all the information needed to decode state directly is specified in .proto files. Each table definition specifies
an ID which is unique per .proto file and each index within a table is unique within that table. Clients then only need
to know the name of a module and the prefix ORM data for a specific .proto file within that module in order to decode
state data directly. This additional information will be exposed directly through app configs which will be explained
in a future ADR related to app wiring.

The ORM makes optimizations around storage space by not repeating values in the primary key in the key value
when storing primary key records. For example, if the object `{"a":0,"b":1}` has the primary key `a`, it will
be stored in the key value store as `Key: '0', Value: {"b":1}` (with more efficient protobuf binary encoding).
Also, the generated code from https://github.com/cosmos/cosmos-proto does optimizations around the
`google.golang.org/protobuf/reflect/protoreflect` API to improve performance.

A code generator is included with the ORM which creates type safe wrappers around the ORM's dynamic `Table`
implementation and is the recommended way for modules to use the ORM.

The ORM tests provide a simplified bank module demonstration which illustrates:
* [ORM proto options](https://github.com/cosmos/cosmos-sdk/blob/0d846ae2f0424b2eb640f6679a703b52d407813d/orm/internal/testpb/bank.proto)
* [Generated Code](https://github.com/cosmos/cosmos-sdk/blob/0d846ae2f0424b2eb640f6679a703b52d407813d/orm/internal/testpb/bank.cosmos_orm.go)
* [Example Usage in a Module Keeper](https://github.com/cosmos/cosmos-sdk/blob/0d846ae2f0424b2eb640f6679a703b52d407813d/orm/model/ormdb/module_test.go)

## Consequences

### Backwards Compatibility

State machine code that adopts the ORM will need migrations as the state layout is generally backwards incompatible.
These state machines will also need to migrate to https://github.com/cosmos/cosmos-proto at least for state data.

### Positive

* easier to build modules
* easier to add secondary indexes to state
* possible to write a generic indexer for ORM state
* easier to write clients that do state proofs
* possible to automatically write query layers rather than needing to manually implement gRPC queries

### Negative

* worse performance than handwritten keys (for now). See [Further Discussions](#further-discussions)
for potential improvements

### Neutral

## Further Discussions

Further discussions will happen within the Cosmos SDK Framework Working Group. Current planned and ongoing work includes:

* automatically generate client-facing query layer
* client-side query libraries that transparently verify light client proofs
* index ORM data to SQL databases
* improve performance by:
    * optimizing existing reflection based code to avoid unnecessary gets when doing deletes & updates of simple tables
    * more sophisticated code generation such as making fast path reflection even faster (avoiding `switch` statements),
  or even fully generating code that equals handwritten performance


## References

* https://github.com/iov-one/weave/tree/master/orm).
* https://github.com/regen-network/regen-ledger/tree/157181f955823149e1825263a317ad8e16096da4/orm
* https://github.com/cosmos/cosmos-sdk/tree/35d3312c3be306591fcba39892223f1244c8d108/x/group/internal/orm
* https://github.com/cosmos/cosmos-sdk/discussions/9156
* https://github.com/allinbits/cosmos-sdk-poc/tree/master/runtime/orm
* https://github.com/cosmos/cosmos-sdk/pull/10454
