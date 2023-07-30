# ADR 062: 集合，cosmos-sdk模块的简化存储层。

## 变更日志

* 2022年11月30日：提议

## 状态

提议 - 已实施

## 摘要

我们提议使用golang泛型来实现一个简化的模块存储层，使模块开发人员能够以简单直接的方式处理模块存储，同时提供安全性、可扩展性和标准化。

## 背景

模块开发人员被迫手动实现模块的存储功能，这些功能包括但不限于：

- 定义键到字节格式的转换。
- 定义值到字节格式的转换。
- 定义二级索引。
- 定义对外暴露的查询方法以处理存储。
- 定义用于处理存储写入的本地方法。
- 处理创世导入和导出。
- 为上述所有内容编写测试。

这带来了很多问题：
- 它阻碍了开发人员专注于最重要的部分：编写业务逻辑。
- 键到字节格式复杂，其定义容易出错，例如：
  - 如何以字节的方式格式化时间，以使字节排序？
  - 如何确保在处理二级索引时没有命名空间冲突？
- 缺乏标准化使客户端的工作变得困难，当涉及为状态中存在的对象提供证明时，问题变得更加严重。客户端被迫维护一个对象路径列表来收集证明。

### 当前解决方案：ORM

目前SDK对这个问题提出的解决方案是[ORM](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-055-orm.md)。
虽然ORM提供了很多旨在解决这些特定问题的好功能，但它也有一些缺点：
- 需要迁移。
- 它使用最新的protobuf golang API，而SDK仍然主要使用gogoproto。
- 将ORM集成到模块中需要开发人员处理两个不同的golang框架（golang protobuf + gogoproto），这两个框架表示相同的API对象。
- 它具有较高的学习曲线，即使对于简单的存储层也需要开发人员具备有关protobuf选项、自定义cosmos-sdk存储扩展和工具下载的知识。然后，在此之后，他们仍然需要学习生成的代码API。

### CosmWasm解决方案：cw-storage-plus

集合API的灵感来自于[cw-storage-plus](https://docs.cosmwasm.com/docs/1.0/smart-contracts/state/cw-plus/)，
它已经证明是处理CosmWasm合约中存储的强大工具。
它简单易用，不需要额外的工具，可以轻松处理复杂的存储结构（索引、快照等）。
该API简单明了。

## 决策

我们建议将`collections` API移植到cosmos-sdk中，其实现位于[NibiruChain/collections](https://github.com/NibiruChain/collections)。

Collections实现了四种不同的存储处理程序类型：

- `Map`：处理简单的`key=>object`映射。
- `KeySet`：作为`Set`，仅保留键而不保留对象（用例：允许列表）。
- `Item`：始终只包含一个对象（用例：Params）
- `Sequence`：实现一个简单的递增数字（用例：Nonces）
- `IndexedMap`：在`Map`和`KeySet`之上构建，并允许与`Objects`和`Objects`的次要键建立关系。

所有集合API都建立在简单的`Map`类型之上。

Collections是完全通用的，意味着任何东西都可以用作`Key`和`Value`。它可以是protobuf对象，也可以不是。

实际上，Collections类型将键和值的序列化工作委托给了一个名为`ValueEncoders`和`KeyEncoders`的辅助集合API组件。

`ValueEncoders`负责将值转换为字节（仅对`Map`类型有效）。并提供了一个即插即用的层，允许我们更改如何编码对象，这对于交换序列化框架和提高性能非常重要。
`Collections`已经提供了默认的`ValueEncoders`，专门用于：protobuf对象，特殊的SDK类型（sdk.Int，sdk.Dec）。

`KeyEncoders`负责将键转换为字节，`collections`已经提供了一些默认的`KeyEncoders`，用于一些基本的golang类型（uint64，string，time.Time，...）和一些广泛使用的sdk类型（sdk.Acc/Val/ConsAddress，sdk.Int/Dec，...）。
这些默认实现还提供了正确的字典序排序和命名空间冲突的安全性。

以下是集合 API 的示例：
- 介绍：https://github.com/NibiruChain/collections/tree/main/examples
- 在 Nibiru 中的使用：[x/oracle](https://github.com/NibiruChain/nibiru/blob/master/x/oracle/keeper/keeper.go#L32)，[x/perp](https://github.com/NibiruChain/nibiru/blob/master/x/perp/keeper/keeper.go#L31)
- cosmos-sdk 的 x/staking 迁移：https://github.com/testinginprod/cosmos-sdk/pull/22


## 影响

### 向后兼容性

`ValueEncoders` 和 `KeyEncoders` 的设计允许模块保留相同的 `byte(key)=>byte(value)` 映射，使得升级到新的存储层不会破坏状态。


### 积极影响

- ADR 的目标是从 SDK 中删除代码，而不是添加代码。将 `x/staking` 仅迁移到 collections 将导致 LOC 净减少（即使考虑到 collections 本身的添加）。
- 简化和标准化 SDK 中模块的存储层。
- 不需要处理 protobuf。
- 它是纯 Go 代码。
- `KeyEncoders` 和 `ValueEncoders` 的泛化使我们不必将自己与数据序列化框架绑定在一起。
- `KeyEncoders` 和 `ValueEncoders` 可以扩展以提供模式反射。

### 负面影响

- 虽然 Golang 泛型正在生产中使用，但与其他 Golang 功能相比，它们的实战经验不足。
- 集合类型的实例化需要改进。

### 中性影响

{neutral consequences}

## 进一步讨论

- 自动创世区块导入/导出（由于 API 断裂而未实现）
- 模式反射


## 参考资料


# ADR 062: Collections, a simplified storage layer for cosmos-sdk modules.

## Changelog

* 30/11/2022: PROPOSED

## Status

PROPOSED - Implemented

## Abstract

We propose a simplified module storage layer which leverages golang generics to allow module developers to handle module
storage in a simple and straightforward manner, whilst offering safety, extensibility and standardisation.

## Context

Module developers are forced into manually implementing storage functionalities in their modules, those functionalities include
but are not limited to:

- Defining key to bytes formats.
- Defining value to bytes formats.
- Defining secondary indexes.
- Defining query methods to expose outside to deal with storage.
- Defining local methods to deal with storage writing.
- Dealing with genesis imports and exports.
- Writing tests for all the above.


This brings in a lot of problems:
- It blocks developers from focusing on the most important part: writing business logic.
- Key to bytes formats are complex and their definition is error-prone, for example:
  - how do I format time to bytes in such a way that bytes are sorted?
  - how do I ensure when I don't have namespace collisions when dealing with secondary indexes?
- The lack of standardisation makes life hard for clients, and the problem is exacerbated when it comes to providing proofs for objects present in state. Clients are forced to maintain a list of object paths to gather proofs.

### Current Solution: ORM

The current SDK proposed solution to this problem is [ORM](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-055-orm.md).
Whilst ORM offers a lot of good functionality aimed at solving these specific problems, it has some downsides:
- It requires migrations.
- It uses the newest protobuf golang API, whilst the SDK still mainly uses gogoproto. 
- Integrating ORM into a module would require the developer to deal with two different golang frameworks (golang protobuf + gogoproto) representing the same API objects.
- It has a high learning curve, even for simple storage layers as it requires developers to have knowledge around protobuf options, custom cosmos-sdk storage extensions, and tooling download. Then after this they still need to learn the code-generated API.

### CosmWasm Solution: cw-storage-plus

The collections API takes inspiration from [cw-storage-plus](https://docs.cosmwasm.com/docs/1.0/smart-contracts/state/cw-plus/),
which has demonstrated to be a powerful tool for dealing with storage in CosmWasm contracts.
It's simple, does not require extra tooling, it makes it easy to deal with complex storage structures (indexes, snapshot, etc).
The API is straightforward and explicit.

## Decision

We propose to port the `collections` API, whose implementation lives in [NibiruChain/collections](https://github.com/NibiruChain/collections) to cosmos-sdk.

Collections implements four different storage handlers types:

- `Map`: which deals with simple `key=>object` mappings.
- `KeySet`: which acts as a `Set` and only retains keys and no object (usecase: allow-lists).
- `Item`: which always contains only one object (usecase: Params)
- `Sequence`: which implements a simple always increasing number (usecase: Nonces)
- `IndexedMap`: builds on top of `Map` and `KeySet` and allows to create relationships with `Objects` and `Objects` secondary keys.

All the collection APIs build on top of the simple `Map` type.

Collections is fully generic, meaning that anything can be used as `Key` and `Value`. It can be a protobuf object or not.

Collections types, in fact, delegate the duty of serialisation of keys and values to a secondary collections API component called `ValueEncoders` and `KeyEncoders`.

`ValueEncoders` take care of converting a value to bytes (relevant only for `Map`). And offers a plug and play layer which allows us to change how we encode objects, 
which is relevant for swapping serialisation frameworks and enhancing performance.
`Collections` already comes in with default `ValueEncoders`, specifically for: protobuf objects, special SDK types (sdk.Int, sdk.Dec).

`KeyEncoders` take care of converting keys to bytes, `collections` already comes in with some default `KeyEncoders` for some privimite golang types
(uint64, string, time.Time, ...) and some widely used sdk types (sdk.Acc/Val/ConsAddress, sdk.Int/Dec, ...).
These default implementations also offer safety around proper lexicographic ordering and namespace-collision.

Examples of the collections API can be found here:
- introduction: https://github.com/NibiruChain/collections/tree/main/examples
- usage in nibiru: [x/oracle](https://github.com/NibiruChain/nibiru/blob/master/x/oracle/keeper/keeper.go#L32), [x/perp](https://github.com/NibiruChain/nibiru/blob/master/x/perp/keeper/keeper.go#L31)
- cosmos-sdk's x/staking migrated: https://github.com/testinginprod/cosmos-sdk/pull/22


## Consequences

### Backwards Compatibility

The design of `ValueEncoders` and `KeyEncoders` allows modules to retain the same `byte(key)=>byte(value)` mappings, making
the upgrade to the new storage layer non-state breaking.


### Positive

- ADR aimed at removing code from the SDK rather than adding it. Migrating just `x/staking` to collections would yield to a net decrease in LOC (even considering the addition of collections itself).
- Simplifies and standardises storage layers across modules in the SDK.
- Does not require to have to deal with protobuf.
- It's pure golang code.
- Generalisation over `KeyEncoders` and `ValueEncoders` allows us to not tie ourself to the data serialisation framework.
- `KeyEncoders` and `ValueEncoders` can be extended to provide schema reflection.

### Negative

- Golang generics are not as battle-tested as other Golang features, despite being used in production right now.
- Collection types instantiation needs to be improved.

### Neutral

{neutral consequences}

## Further Discussions

- Automatic genesis import/export (not implemented because of API breakage)
- Schema reflection


## References
