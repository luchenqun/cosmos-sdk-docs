# ADR 049: 状态同步 Hooks

## 更新日志

* 2022年1月19日：初稿
* 2022年4月29日：更安全的扩展快照接口

## 状态

已实施

## 摘要

本 ADR 概述了一种基于 hooks 的机制，用于应用模块提供额外的状态（在 IAVL 树之外）以供状态同步使用。

## 背景

新的客户端使用状态同步从对等节点下载模块状态的快照。目前，快照由 `SnapshotStoreItem` 和 `SnapshotIAVLItem` 的流组成，这意味着将其状态定义在 IAVL 树之外的应用模块无法将其状态包含在状态同步过程中。

注意，尽管模块状态数据在树之外，但为了确定性，我们要求外部数据的哈希应该发布在 IAVL 树中。

## 决策

基于我们现有的实现，一个简单的提案是，我们可以添加两个新的消息类型：`SnapshotExtensionMeta` 和 `SnapshotExtensionPayload`，它们将附加到现有的多存储流中，其中 `SnapshotExtensionMeta` 充当扩展之间的分隔符。由于块哈希应该能够确保数据完整性，我们不需要使用分隔符来标记快照流的结尾。

此外，我们为模块提供了 `Snapshotter` 和 `ExtensionSnapshotter` 接口，用于实现快照程序，它们将处理快照的创建和恢复。每个模块可以拥有多个快照程序，对于具有额外状态的模块，它们应该实现 `ExtensionSnapshotter` 作为扩展快照程序。在设置应用程序时，快照 `Manager` 应该调用 `RegisterExtensions([]ExtensionSnapshotter…)` 来注册所有的扩展快照程序。

```protobuf
// SnapshotItem is an item contained in a rootmulti.Store snapshot.
// On top of the exsiting SnapshotStoreItem and SnapshotIAVLItem, we add two new options for the item.
message SnapshotItem {
  // item is the specific type of snapshot item.
  oneof item {
    SnapshotStoreItem        store             = 1;
    SnapshotIAVLItem         iavl              = 2 [(gogoproto.customname) = "IAVL"];
    SnapshotExtensionMeta    extension         = 3;
    SnapshotExtensionPayload extension_payload = 4;
  }
}

// SnapshotExtensionMeta contains metadata about an external snapshotter.
// One module may need multiple snapshotters, so each module may have multiple SnapshotExtensionMeta.
message SnapshotExtensionMeta {
  // the name of the ExtensionSnapshotter, and it is registered to snapshotter manager when setting up the application
  // name should be unique for each ExtensionSnapshotter as we need to alphabetically order their snapshots to get
  // deterministic snapshot stream.
  string name   = 1;
  // this is used by each ExtensionSnapshotter to decide the format of payloads included in SnapshotExtensionPayload message
  // it is used within the snapshotter/namespace, not global one for all modules
  uint32 format = 2;
}

// SnapshotExtensionPayload contains payloads of an external snapshotter.
message SnapshotExtensionPayload {
  bytes payload = 1;
}
```

当我们创建一个快照流时，`multistore` 快照总是位于二进制流的开头，其他扩展快照按照相应的 `ExtensionSnapshotter` 的名称按字母顺序排序。

快照流的示例如下：

```go
// multi-store snapshot
{SnapshotStoreItem | SnapshotIAVLItem, ...}
// extension1 snapshot
SnapshotExtensionMeta
{SnapshotExtensionPayload, ...}
// extension2 snapshot
SnapshotExtensionMeta
{SnapshotExtensionPayload, ...}
```

我们为快照管理器（`Manager`）添加了一个 `extensions` 字段，用于扩展快照器。`multistore` 快照器是一个特殊的快照器，它不需要一个名称，因为它总是位于二进制流的开头。

```go
type Manager struct {
	store      *Store
	multistore types.Snapshotter
	extensions map[string]types.ExtensionSnapshotter
	mtx                sync.Mutex
	operation          operation
	chRestore          chan<- io.ReadCloser
	chRestoreDone      <-chan restoreDone
	restoreChunkHashes [][]byte
	restoreChunkIndex  uint32
}
```

对于实现了 `ExtensionSnapshotter` 接口的扩展快照器，它们的名称应该在设置应用程序时通过调用 `RegisterExtensions` 方法注册到快照管理器（`Manager`）。这些快照器将处理快照的创建和恢复。

```go
// RegisterExtensions register extension snapshotters to manager
func (m *Manager) RegisterExtensions(extensions ...types.ExtensionSnapshotter) error 
```

在现有的 `multistore` 快照器的基础上，我们为扩展快照器添加了 `ExtensionSnapshotter` 接口。`ExtensionSnapshotter` 接口新增了三个函数签名：`SnapshotFormat()`、`SupportedFormats()` 和 `SnapshotName()`。

```go
// ExtensionPayloadReader read extension payloads,
// it returns io.EOF when reached either end of stream or the extension boundaries.
type ExtensionPayloadReader = func() ([]byte, error)

// ExtensionPayloadWriter is a helper to write extension payloads to underlying stream.
type ExtensionPayloadWriter = func([]byte) error

// ExtensionSnapshotter is an extension Snapshotter that is appended to the snapshot stream.
// ExtensionSnapshotter has an unique name and manages it's own internal formats.
type ExtensionSnapshotter interface {
	// SnapshotName returns the name of snapshotter, it should be unique in the manager.
	SnapshotName() string

	// SnapshotFormat returns the default format used to take a snapshot.
	SnapshotFormat() uint32

	// SupportedFormats returns a list of formats it can restore from.
	SupportedFormats() []uint32

	// SnapshotExtension writes extension payloads into the underlying protobuf stream.
	SnapshotExtension(height uint64, payloadWriter ExtensionPayloadWriter) error

	// RestoreExtension restores an extension state snapshot,
	// the payload reader returns `io.EOF` when reached the extension boundaries.
	RestoreExtension(height uint64, format uint32, payloadReader ExtensionPayloadReader) error

}
```

## 影响

通过这个实现，我们能够为我们在 IAVL 树之外维护的状态（例如 CosmWasm blobs）创建二进制块流的快照。新的客户端能够从对等节点获取已实现相应接口的所有模块的状态快照。

### 向后兼容性

这个 ADR 引入了新的 proto 消息类型，在快照管理器（`Manager`）中添加了 `extensions` 字段，并添加了新的 `ExtensionSnapshotter` 接口，因此如果存在扩展，这不是向后兼容的。

但对于没有将状态数据放在 IAVL 树之外的应用程序，快照流是向后兼容的。

### 积极影响

* 在 IAVL 树之外维护状态（如 CosmWasm blobs）的模块可以通过实现扩展快照器来创建快照，并通过状态同步机制被新的客户端获取。

### 负面影响

### 中性影响

* 所有在 IAVL 树之外维护状态的模块都需要实现 `ExtensionSnapshotter` 接口，并且在设置应用程序时，快照管理器（`Manager`）需要调用 `RegisterExtensions` 方法。

## 进一步讨论

当一个ADR处于DRAFT或PROPOSED阶段时，这个部分应该包含未来迭代中需要解决的问题的摘要（通常引用来自拉取请求讨论的评论）。
稍后，这个部分可以选择性地列出作者或审阅者在分析这个ADR时发现的想法或改进。

## 测试用例 [可选]

对于影响共识变更的ADR，实现的测试用例是必需的。其他ADR可以选择包含测试用例的链接（如果适用）。

## 参考资料

* https://github.com/cosmos/cosmos-sdk/pull/10961
* https://github.com/cosmos/cosmos-sdk/issues/7340
* https://hackmd.io/gJoyev6DSmqqkO667WQlGw


# ADR 049: State Sync Hooks

## Changelog

* Jan 19, 2022: Initial Draft
* Apr 29, 2022: Safer extension snapshotter interface

## Status

Implemented

## Abstract

This ADR outlines a hooks-based mechanism for application modules to provide additional state (outside of the IAVL tree) to be used 
during state sync.

## Context

New clients use state-sync to download snapshots of module state from peers. Currently, the snapshot consists of a
stream of `SnapshotStoreItem` and `SnapshotIAVLItem`, which means that application modules that define their state outside of the IAVL 
tree cannot include their state as part of the state-sync process.

Note, Even though the module state data is outside of the tree, for determinism we require that the hash of the external data should 
be posted in the IAVL tree.

## Decision

A simple proposal based on our existing implementation is that, we can add two new message types: `SnapshotExtensionMeta` 
and `SnapshotExtensionPayload`, and they are appended to the existing multi-store stream with `SnapshotExtensionMeta` 
acting as a delimiter between extensions. As the chunk hashes should be able to ensure data integrity, we don't need 
a delimiter to mark the end of the snapshot stream.

Besides, we provide `Snapshotter` and `ExtensionSnapshotter` interface for modules to implement snapshotters, which will handle both taking 
snapshot and the restoration. Each module could have mutiple snapshotters, and for modules with additional state, they should
implement `ExtensionSnapshotter` as extension snapshotters. When setting up the application, the snapshot `Manager` should call 
`RegisterExtensions([]ExtensionSnapshotter…)` to register all the extension snapshotters.

```protobuf
// SnapshotItem is an item contained in a rootmulti.Store snapshot.
// On top of the exsiting SnapshotStoreItem and SnapshotIAVLItem, we add two new options for the item.
message SnapshotItem {
  // item is the specific type of snapshot item.
  oneof item {
    SnapshotStoreItem        store             = 1;
    SnapshotIAVLItem         iavl              = 2 [(gogoproto.customname) = "IAVL"];
    SnapshotExtensionMeta    extension         = 3;
    SnapshotExtensionPayload extension_payload = 4;
  }
}

// SnapshotExtensionMeta contains metadata about an external snapshotter.
// One module may need multiple snapshotters, so each module may have multiple SnapshotExtensionMeta.
message SnapshotExtensionMeta {
  // the name of the ExtensionSnapshotter, and it is registered to snapshotter manager when setting up the application
  // name should be unique for each ExtensionSnapshotter as we need to alphabetically order their snapshots to get
  // deterministic snapshot stream.
  string name   = 1;
  // this is used by each ExtensionSnapshotter to decide the format of payloads included in SnapshotExtensionPayload message
  // it is used within the snapshotter/namespace, not global one for all modules
  uint32 format = 2;
}

// SnapshotExtensionPayload contains payloads of an external snapshotter.
message SnapshotExtensionPayload {
  bytes payload = 1;
}
```

When we create a snapshot stream, the `multistore` snapshot is always placed at the beginning of the binary stream, and other extension snapshots are alphabetically ordered by the name of the corresponding `ExtensionSnapshotter`. 

The snapshot stream would look like as follows:

```go
// multi-store snapshot
{SnapshotStoreItem | SnapshotIAVLItem, ...}
// extension1 snapshot
SnapshotExtensionMeta
{SnapshotExtensionPayload, ...}
// extension2 snapshot
SnapshotExtensionMeta
{SnapshotExtensionPayload, ...}
```

We add an `extensions` field to snapshot `Manager` for extension snapshotters. The `multistore` snapshotter is a special one and it doesn't need a name because it is always placed at the beginning of the binary stream.

```go
type Manager struct {
	store      *Store
	multistore types.Snapshotter
	extensions map[string]types.ExtensionSnapshotter
	mtx                sync.Mutex
	operation          operation
	chRestore          chan<- io.ReadCloser
	chRestoreDone      <-chan restoreDone
	restoreChunkHashes [][]byte
	restoreChunkIndex  uint32
}
```

For extension snapshotters that implement the `ExtensionSnapshotter` interface, their names should be registered to the snapshot `Manager` by 
calling `RegisterExtensions` when setting up the application. The snapshotters will handle both taking snapshot and restoration.

```go
// RegisterExtensions register extension snapshotters to manager
func (m *Manager) RegisterExtensions(extensions ...types.ExtensionSnapshotter) error 
```

On top of the existing `Snapshotter` interface for the `multistore`, we add `ExtensionSnapshotter` interface for the extension snapshotters. Three more function signatures: `SnapshotFormat()`, `SupportedFormats()` and `SnapshotName()` are added to `ExtensionSnapshotter`.

```go
// ExtensionPayloadReader read extension payloads,
// it returns io.EOF when reached either end of stream or the extension boundaries.
type ExtensionPayloadReader = func() ([]byte, error)

// ExtensionPayloadWriter is a helper to write extension payloads to underlying stream.
type ExtensionPayloadWriter = func([]byte) error

// ExtensionSnapshotter is an extension Snapshotter that is appended to the snapshot stream.
// ExtensionSnapshotter has an unique name and manages it's own internal formats.
type ExtensionSnapshotter interface {
	// SnapshotName returns the name of snapshotter, it should be unique in the manager.
	SnapshotName() string

	// SnapshotFormat returns the default format used to take a snapshot.
	SnapshotFormat() uint32

	// SupportedFormats returns a list of formats it can restore from.
	SupportedFormats() []uint32

	// SnapshotExtension writes extension payloads into the underlying protobuf stream.
	SnapshotExtension(height uint64, payloadWriter ExtensionPayloadWriter) error

	// RestoreExtension restores an extension state snapshot,
	// the payload reader returns `io.EOF` when reached the extension boundaries.
	RestoreExtension(height uint64, format uint32, payloadReader ExtensionPayloadReader) error

}
```

## Consequences

As a result of this implementation, we are able to create snapshots of binary chunk stream for the state that we maintain outside of the IAVL Tree, CosmWasm blobs for example. And new clients are able to fetch sanpshots of state for all modules that have implemented the corresponding interface from peer nodes. 


### Backwards Compatibility

This ADR introduces new proto message types, add an `extensions` field in snapshot `Manager`, and add new `ExtensionSnapshotter` interface, so this is not backwards compatible if we have extensions.

But for applications that does not have the state data outside of the IAVL tree for any module, the snapshot stream is backwards-compatible.

### Positive

* State maintained outside of IAVL tree like CosmWasm blobs can create snapshots by implementing extension snapshotters, and being fetched by new clients via state-sync.

### Negative

### Neutral

* All modules that maintain state outside of IAVL tree need to implement `ExtensionSnapshotter` and the snapshot `Manager` need to call `RegisterExtensions` when setting up the application.

## Further Discussions

While an ADR is in the DRAFT or PROPOSED stage, this section should contain a summary of issues to be solved in future iterations (usually referencing comments from a pull-request discussion).
Later, this section can optionally list ideas or improvements the author or reviewers found during the analysis of this ADR.

## Test Cases [optional]

Test cases for an implementation are mandatory for ADRs that are affecting consensus changes. Other ADRs can choose to include links to test cases if applicable.

## References

* https://github.com/cosmos/cosmos-sdk/pull/10961
* https://github.com/cosmos/cosmos-sdk/issues/7340
* https://hackmd.io/gJoyev6DSmqqkO667WQlGw
