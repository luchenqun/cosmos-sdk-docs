# ADR 040: 存储和 SMT 状态承诺

## 更新日志

* 2020-01-15: 起草

## 状态

草稿 未实现

## 摘要

稀疏 Merkle 树（[SMT](https://osf.io/8mcnh/)）是一种具有各种存储和性能优化的 Merkle 树版本。本 ADR 定义了状态承诺与数据存储的分离，以及 Cosmos SDK 从 IAVL 过渡到 SMT。

## 背景

目前，Cosmos SDK 在状态承诺和数据存储方面都使用 IAVL。

在 Cosmos 生态系统中，IAVL 实际上已经成为一个孤立的项目，并且已经证明它是一种低效的状态承诺数据结构。
在当前设计中，IAVL 既用于数据存储，又用作状态承诺的 Merkle 树。IAVL 旨在成为一个独立的 Merkle 化键值数据库，但它使用 KV 数据库引擎来存储所有树节点。因此，每个节点都存储在 KV 数据库的单独记录中。这导致了许多低效和问题：

* 每个对象查询都需要从根节点进行树遍历。对于相同对象的后续查询，会在 Cosmos SDK 层面进行缓存。
* 每个边的遍历都需要进行数据库查询。
* 创建快照是[昂贵的](https://github.com/cosmos/cosmos-sdk/issues/7215#issuecomment-684804950)。导出少于 100 MB 的状态需要大约 30 秒（截至 2020 年 3 月）。
* IAVL 中的更新可能会触发树的重新组织和可能的 O(log(n)) 哈希重新计算，这可能成为 CPU 的瓶颈。
* 节点结构非常昂贵 - 它包含标准的树节点元素（键、值、左右元素）和其他元数据，例如高度、版本（Cosmos SDK 不需要）。整个节点被哈希，该哈希用作底层数据库中的键，[参考](https://github.com/cosmos/iavl/blob/master/docs/node/03-node.md)。

此外，IAVL 项目缺乏支持和维护者，我们已经看到了更好和更成熟的替代方案。我们正在寻找其他解决方案来优化存储和状态承诺，而不是优化 IAVL。

## 决策

我们建议将状态承诺（**SC**）和状态存储（**SS**）的关注点分开，前者用于共识，后者用于状态机。最后，我们用 [Celestia's SMT](https://github.com/lazyledger/smt) 替换 IAVL。Celestia SMT 基于 Diem（称为 jellyfish）设计 [*] - 它使用计算优化的 SMT，通过将只包含默认值的子树替换为单个节点（Ethereum2 也采用了相同的方法），并实现了紧凑的证明。

这里介绍的存储模型不涉及数据结构和序列化。它是一个键值数据库，其中键和值都是二进制的。存储用户负责数据序列化。

### 将状态承诺与存储解耦

通过 SMT 将存储和承诺（由 SMT 提供）分离，可以根据它们的使用和访问模式对不同组件进行优化。

`SC`（SMT）用于对数据进行承诺并计算 Merkle 证明。`SS` 用于直接访问数据。为了避免冲突，`SS` 和 `SC` 将使用单独的存储命名空间（它们可以使用相同的数据库底层）。`SS` 将直接存储每个记录（将 `(key, value)` 映射为 `key → value`）。

SMT 是一种 Merkle 树结构：我们不直接存储键。对于每个 `(key, value)` 对，我们使用 `hash(key)` 作为叶子路径（我们将键哈希为树中均匀分布的叶子），并使用 `hash(value)` 作为叶子内容。树的结构在下面的 [SMT 用于状态承诺](#smt-for-state-commitment) 中有更详细的说明。

对于数据访问，我们提议使用两个额外的 KV 存储桶（实现为键值对的命名空间，有时称为 [column family](https://github.com/facebook/rocksdb/wiki/Terminology)）：

1. B1：`key → value`：主要对象存储，由状态机使用，在 Cosmos SDK 的 `KVStore` 接口后面：通过键直接访问并允许前缀迭代（KV DB 后端必须支持）。
2. B2：`hash(key) → key`：一个反向索引，用于从 SMT 路径获取键。在内部，SMT 将 `(key, value)` 存储为 `prefix || hash(key) || hash(value)`。因此，我们可以通过组合 `hash(key) → B2 → B1` 来获取对象值。
3. 如果需要，我们可以使用更多的存储桶来优化应用的使用。

我们建议为`SS`和`SC`都使用KV数据库。存储接口将允许使用相同的物理数据库后端来存储`SS`和`SC`，也可以使用两个独立的数据库。后一种选项允许将`SS`和`SC`分离到不同的硬件单元中，支持更复杂的设置场景并提高整体性能：可以使用不同的后端（如RocksDB和Badger），并独立调整底层数据库的配置。

### 需求

状态存储需求：

* 范围查询
* 快速（键，值）访问
* 创建快照
* 历史版本管理
* 剪枝（垃圾回收）

状态承诺需求：

* 快速更新
* 树路径应该较短
* 使用ICS-23标准查询历史承诺证明
* 剪枝（垃圾回收）

### 用于状态承诺的SMT

稀疏Merkle树基于一个无法处理的完整Merkle树的思想。这里的假设是，由于树的大小无法处理，相对于树的大小，只会有很少的叶节点具有有效的数据块，从而形成了一个稀疏树。

完整的规范可以在[Celestia](https://github.com/celestiaorg/celestia-specs/blob/ec98170398dfc6394423ee79b00b71038879e211/src/specs/data_structures.md#sparse-merkle-tree)中找到。简要概述如下：

* SMT由二进制Merkle树组成，构建方式与[证书透明性（RFC-6962）](https://tools.ietf.org/html/rfc6962)中描述的方式相同，但使用[FIPS 180-4](https://doi.org/10.6028/NIST.FIPS.180-4)中定义的SHA-2-256哈希函数。
* 叶节点和内部节点的哈希方式不同：叶节点前面加上一个字节的`0x00`，而内部节点前面加上一个字节的`0x01`。
* 对于空叶子节点，给出默认值。
* 尽管上述规则足以预先计算空子树的根节点的值，但进一步简化是将此默认值扩展到所有根节点为空子树的节点。默认值为32字节的零。此规则优先于上述规则。
* 如果一个内部节点是包含一个非空叶子节点的子树的根节点，则用该叶子节点的叶子节点替换该内部节点。

### 存储同步和状态版本控制的快照

在下面，我们使用简单的“快照”一词来指代数据库快照机制，而不是“ABCI快照同步”。后者将被称为“快照同步”（它将直接使用下面描述的数据库快照）。

数据库快照是数据库在某个特定时间或事务的状态视图。它不是数据库的完整副本（这将太大）。通常，快照机制基于“写时复制”，它允许以高效的方式传递数据库状态到某个特定阶段。
一些数据库引擎支持快照。因此，我们建议重用该功能来进行状态同步和版本控制（下面描述）。我们将支持高效实现快照的数据库引擎。在最后一节中，我们将讨论经过评估的数据库。

Stargate的核心功能之一是在`/snapshot`包中提供的“快照同步”。它提供了一种无需重复从创世区块开始的所有交易即可同步区块链的方法。这个功能是在Cosmos SDK中实现的，需要存储支持。目前，IAVL是唯一支持的后端。它通过向客户端流式传输`SS`在某个版本上的快照以及头部链来工作。

每个`EndBlocker`都会创建一个新的数据库快照，并由块高度进行标识。`root`存储跟踪可用的快照，以提供某个版本的`SS`。`root`存储实现了下面描述的`RootStore`接口。本质上，`RootStore`封装了一个`Committer`接口。`Committer`具有`Commit`、`SetPruning`、`GetPruning`函数，用于创建和删除快照。`rootStore.Commit`函数在每次调用时创建一个新的快照并递增版本，并检查是否需要删除旧版本。我们需要更新SMT接口以实现`Committer`接口。
注意：每个区块必须仅调用一次`Commit`。否则，我们可能会因为版本号和块高度不同步而出现问题。
注意：对于Cosmos SDK存储，我们可以考虑将该接口拆分为`Committer`和`PruningCommitter` - 只有多根存储应该实现`PruningCommitter`（缓存和前缀存储不需要修剪）。

`abci.RequestQuery`和状态同步快照的历史版本数量是节点配置的一部分，而不是链配置（由区块链共识隐含的配置）。配置应该允许指定过去的块数和过去块数模某个数（例如：过去2000个块中的每100个块一个快照）。存档节点可以保留所有过去的版本。

删除旧的快照实际上是由数据库完成的。每当我们在`SC`中更新记录时，SMT不会更新节点 - 而是在更新路径上创建新节点，而不删除旧节点。由于我们在每个块上都进行快照，我们需要改变这种机制，立即从数据库中删除孤立节点。这是一个安全的操作 - 快照将跟踪记录并在访问过去的版本时提供。

为了管理活动的快照，我们将使用数据库的“最大快照数”选项（如果可用），或者我们将在`EndBlocker`中删除数据库快照。后一种选项可以通过识别具有块高度的快照，并调用存储函数来删除过去的版本来高效地完成。

#### 访问旧的状态版本

其中一个功能要求是访问旧的状态。这是通过`abci.RequestQuery`结构来完成的。版本是通过块高度指定的（因此我们通过键`K`和块高度`H`查询对象）。对于`abci.RequestQuery`支持的旧版本数量是可配置的。通过使用可用的快照来访问旧状态。
`abci.RequestQuery`不需要`SC`的旧状态，除非设置了`prove=true`参数。只有当`SC`和`SS`都有所请求版本的快照时，SMT Merkle证明才必须包含在`abci.ResponseQuery`中。

此外，Cosmos SDK可以提供一种直接访问历史状态的方法。然而，状态机不应该这样做 - 因为快照的数量是可配置的，这将导致非确定性执行。

我们在与我们评估的数据库相关的查询旧状态的版本和快照机制方面进行了积极的[验证](https://github.com/cosmos/cosmos-sdk/discussions/8297)。

### 状态证明

对于存储在状态存储（SS）中的任何对象，我们在`SC`中都有相应的对象。通过键`K`标识的对象`V`的证明是`SC`的一个分支，其中路径对应于键`hash(K)`，叶子节点是`hash(K, V)`。

### 回滚

如果事务失败，我们需要能够处理事务并回滚状态更新。可以通过以下方式实现：在事务处理过程中，我们将所有状态更改请求（写入）保存在`CacheWrapper`抽象中（与现在的做法相同）。一旦完成块处理，在`Endblocker`中，我们提交一个根存储 - 此时，所有更改都被写入SMT和`SS`，并创建了一个快照。

### 提交对象而不保存它

我们确定了一些用例，其中模块需要保存对象的承诺，而不直接存储对象本身。有时客户端会接收到复杂的对象，而又无法在不了解存储布局的情况下证明该对象的正确性。对于这些用例，通过提交对象而不直接存储它会更容易。

### 重构 MultiStore

Stargate `/store` 实现（store/v1）在 SDK 存储构建中添加了一个额外的层级 - `MultiStore` 结构。多存储存在是为了支持 Cosmos SDK 的模块化 - 每个模块都使用自己的 IAVL 实例，但在当前实现中，所有实例共享同一个数据库。然而，这表明该实现并没有提供真正的模块化。相反，它会导致与竞态条件和原子数据库提交相关的问题（参见：[\#6370](https://github.com/cosmos/cosmos-sdk/issues/6370) 和 [discussion](https://github.com/cosmos/cosmos-sdk/discussions/8297#discussioncomment-757043)）。

我们建议从 SDK 中减少多存储的概念，并在 `RootStore` 对象中使用单个 `SC` 和 `SS` 实例。为避免混淆，我们应将 `MultiStore` 接口重命名为 `RootStore`。`RootStore` 将具有以下接口；为简洁起见，省略了配置跟踪和监听器的方法。

```go
// Used where read-only access to versions is needed.
type BasicRootStore interface {
    Store
    GetKVStore(StoreKey) KVStore
    CacheRootStore() CacheRootStore
}

// Used as the main app state, replacing CommitMultiStore.
type CommitRootStore interface {
    BasicRootStore
    Committer
    Snapshotter

    GetVersion(uint64) (BasicRootStore, error)
    SetInitialVersion(uint64) error

    ... // Trace and Listen methods
}

// Replaces CacheMultiStore for branched state.
type CacheRootStore interface {
    BasicRootStore
    Write()

    ... // Trace and Listen methods
}

// Example of constructor parameters for the concrete type.
type RootStoreConfig struct {
    Upgrades        *StoreUpgrades
    InitialVersion  uint64

    ReservePrefix(StoreKey, StoreType)
}
```

<!-- TODO: Review whether these types can be further reduced or simplified -->
<!-- TODO: RootStorePersistentCache type -->

与`MultiStore`相比，`RootStore`不允许动态挂载子存储或为各个子存储提供任意的后备数据库。

注意：模块将能够使用特殊的承诺和它们自己的数据库。例如：一个使用零知识证明来存储状态的模块可以将这个证明存储和提交到`RootStore`（通常作为一个单独的记录），并且可以私下管理专用存储或使用`SC`低级接口。

#### 兼容性支持

为了方便用户过渡到这个新接口，我们可以创建一个包装`CommitMultiStore`但提供`CommitRootStore`接口的shim，并公开函数以安全地创建和访问底层的`CommitMultiStore`。

新的`RootStore`和支持的类型可以在`store/v2alpha1`包中实现，以避免破坏现有的代码。

#### Merkle证明和IBC

目前，IBC（v1.0）的Merkle证明路径由两个元素（`["<store-key>", "<record-key>"]`）组成，每个键对应一个单独的证明。每个证明都根据各自的[ICS-23规范](https://github.com/cosmos/ibc-go/blob/f7051429e1cf833a6f65d51e6c3df1609290a549/modules/core/23-commitment/types/merkle.go#L17)进行验证，并且每个步骤的结果哈希用作下一个步骤的承诺值，直到获得根承诺哈希。
`"<record-key>"`的证明的根哈希与`"<store-key>"`进行哈希运算，以验证与应用哈希相匹配。

这与`RootStore`不兼容，`RootStore`将所有记录存储在单个Merkle树结构中，并且不会为存储键和记录键生成单独的证明。理想情况下，证明的存储键组件可以省略，并更新为使用“no-op”规范，因此只使用记录键。然而，由于IBC验证代码硬编码了`"ibc"`前缀，并将其作为证明路径的一个单独元素应用于SDK证明，这样做将导致破坏性变更。破坏此行为将严重影响已广泛采用IBC模块的Cosmos生态系统。要求在各个链上更新IBC模块是一项耗时的工作，不容易实现。

作为一种解决方法，`RootStore` 将需要使用两个单独的 SMT（它们可以使用相同的底层数据库）：一个用于 IBC 状态，另一个用于其他所有内容。一个简单的 Merkle 映射引用这些 SMT 将充当 Merkle 树以创建最终的应用哈希。Merkle 映射不存储在数据库中 - 它在运行时构建。IBC 子存储键必须为 `"ibc"`。

这种解决方法仍然可以保证原子同步：[提议的数据库后端](#evaluated-kv-databases) 支持原子事务和高效的回滚，这将在提交阶段中使用。

在 IBC 模块完全升级以支持单元素承诺证明之前，可以使用所提出的解决方法。

### 优化：压缩模块键前缀

我们考虑通过创建从模块键到整数的映射来压缩前缀键，并使用变长编码对整数进行序列化。变长编码确保不同的值没有共同的字节前缀。对于 Merkle 证明，我们不能使用前缀压缩 - 因此它只适用于 `SS` 键。此外，前缀压缩应仅适用于模块命名空间。更具体地说：

* 每个模块都有自己的命名空间；
* 在访问模块命名空间时，我们创建一个带有嵌入前缀的 KVStore；
* 只有在访问和管理 `SS` 时，才会压缩该前缀。

我们需要确保代码不会更改。我们可以在静态变量中固定映射（由应用程序提供），或者在特殊键下的 SS 状态中固定映射。

待办事项：需要对键压缩做出决策。

## 优化：SS 键压缩

某些对象可能会以包含 Protobuf 消息类型的键保存。这些键很长。如果我们可以将 Protobuf 消息类型映射为变长整数，我们可以节省大量空间。

待办事项：完成此项或将其移至另一个 ADR。

## 迁移

使用新存储将需要进行迁移。提议了两种迁移方式：

1. 创世导出 - 它将重置区块链历史。
2. 原地迁移：我们可以重用 `UpgradeKeeper.SetUpgradeHandler` 来提供迁移逻辑：

```go 
app.UpgradeKeeper.SetUpgradeHandler("adr-40", func(ctx sdk.Context, plan upgradetypes.Plan, vm module.VersionMap) (module.VersionMap, error) {

    storev2.Migrate(iavlstore, v2.store)

    // RunMigrations returns the VersionMap
    // with the updated module ConsensusVersions
    return app.mm.RunMigrations(ctx, vm)
})
```

`Migrate` 函数将从 store/v1 数据库中读取所有条目，并将它们保存到 AD-40 组合 KV 存储中。
不应使用缓存层，并且操作必须在单个 Commit 调用中完成。

向 `SC`（SMT）组件插入记录是瓶颈。不幸的是，SMT 不支持批量事务。
在主要发布之后，将批量事务添加到 `SC` 层被视为一项功能。

## 结果

### 向后兼容性

此 ADR 不会引入任何 Cosmos SDK 级别的 API 更改。

我们更改了状态机的存储布局，需要进行存储硬分叉和网络升级以纳入这些更改。SMT 提供了 Merkle 证明功能，但与 ICS23 不兼容。需要更新 ICS23 兼容性的证明。

### 积极影响

* 将状态与状态承诺解耦为更好的工程机会，以进行进一步的优化和更好的存储模式。
* 性能改进。
* 加入基于 SMT 的阵营，其比 IAVL 具有更广泛和经过验证的采用。决定使用 SMT 的示例项目：Ethereum2、Diem（Libra）、Trillan、Tezos、Celestia。
* 多存储的移除修复了当前 MultiStore 设计中存在的长期问题。
* 简化 Merkle 证明 - 除了 IBC，所有模块只需要一次 Merkle 证明。

### 负面影响

* 存储迁移
* LL SMT 不支持修剪 - 我们需要添加并测试该功能。
* `SS` 键将具有键前缀的开销。这不会影响 `SC`，因为 `SC` 中的所有键都具有相同的大小（它们被哈希）。

### 中性影响

* 废弃 IAVL，这是 Cosmos 白皮书的核心提案之一。

## 替代设计

大多数替代设计在[状态承诺和存储报告](https://paper.dropbox.com/published/State-commitments-and-storage-review--BDvA1MLwRtOx55KRihJ5xxLbBw-KeEB7eOd11pNrZvVtqUgL3h)中进行了评估。

以太坊研究发布了[Verkle Trie](https://dankradfeist.de/ethereum/2021/06/18/verkle-trie-for-eth1.html) - 结合多项式承诺和 Merkle 树的想法，以减少树的高度。这个概念具有很大的潜力，但我们认为现在实施它还为时过早。一旦其他研究实现了所有必要的库，当前基于 SMT 的设计可以轻松更新为 Verkle Trie。这个 ADR 中描述的设计的主要优势是将状态承诺与数据存储分离，并设计一个更强大的接口。

## 进一步讨论

### 评估的 KV 数据库

我们验证了现有的 KV 数据库以评估快照支持。以下数据库提供了高效的快照机制：Badger、RocksDB、[Pebble](https://github.com/cockroachdb/pebble)。不提供此类支持或尚未达到生产就绪状态的数据库有：boltdb、leveldb、goleveldb、membdb、lmdb。

### RDBMS

使用 RDBMS 替代简单的 KV 存储来存储状态。使用 RDBMS 将需要对 Cosmos SDK 进行 API 破坏性更改（`KVStore` 接口），并将允许更好的数据提取和索引解决方案。我们可以将对象保存为状态存储层中的表记录，并在上述 SMT 中保存为 `hash(key, protobuf(object))`。为了验证在 RDBMS 中注册的对象与提交到 SMT 中的对象相同，需要从 RDBMS 中加载它，使用 protobuf 进行编组、哈希并进行 SMT 搜索。

### Off Chain 存储

我们正在讨论模块可以使用支持数据库的用例，该数据库不会自动提交。模块将负责拥有健全的存储模型，并可以选择使用在“提交对象而不保存它”部分中讨论的功能。

## 参考资料

* [IAVL 下一步计划](https://github.com/cosmos/cosmos-sdk/issues/7100)
* [IAVL 概述](https://docs.google.com/document/d/16Z_hW2rSAmoyMENO-RlAhQjAG3mSNKsQueMnKpmcBv0/edit#heading=h.yd2th7x3o1iv) v0.15 的状态
* [状态承诺和存储报告](https://paper.dropbox.com/published/State-commitments-and-storage-review--BDvA1MLwRtOx55KRihJ5xxLbBw-KeEB7eOd11pNrZvVtqUgL3h)
* [Celestia (LazyLedger) SMT](https://github.com/lazyledger/smt)
* Facebook Diem (Libra) SMT 的 [设计](https://developers.diem.com/papers/jellyfish-merkle-tree/2021-01-14.pdf)
* [Trillian 撤销透明性](https://github.com/google/trillian/blob/master/docs/papers/RevocationTransparency.pdf)，[Trillian 可验证数据结构](https://github.com/google/trillian/blob/master/docs/papers/VerifiableDataStructures.pdf)。
* 设计和实现的 [讨论](https://github.com/cosmos/cosmos-sdk/discussions/8297)。
* [如何升级 IBC 链及其客户端](https://github.com/cosmos/ibc-go/blob/main/docs/ibc/upgrades/quick-guide.md)
* [ADR-40 对 IBC 的影响](https://github.com/cosmos/ibc-go/discussions/256)

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


# ADR 040: Storage and SMT State Commitments

## Changelog

* 2020-01-15: Draft

## Status

DRAFT Not Implemented

## Abstract

Sparse Merkle Tree ([SMT](https://osf.io/8mcnh/)) is a version of a Merkle Tree with various storage and performance optimizations. This ADR defines a separation of state commitments from data storage and the Cosmos SDK transition from IAVL to SMT.

## Context

Currently, Cosmos SDK uses IAVL for both state [commitments](https://cryptography.fandom.com/wiki/Commitment_scheme) and data storage.

IAVL has effectively become an orphaned project within the Cosmos ecosystem and it's proven to be an inefficient state commitment data structure.
In the current design, IAVL is used for both data storage and as a Merkle Tree for state commitments. IAVL is meant to be a standalone Merkelized key/value database, however it's using a KV DB engine to store all tree nodes. So, each node is stored in a separate record in the KV DB. This causes many inefficiencies and problems:

* Each object query requires a tree traversal from the root. Subsequent queries for the same object are cached on the Cosmos SDK level.
* Each edge traversal requires a DB query.
* Creating snapshots is [expensive](https://github.com/cosmos/cosmos-sdk/issues/7215#issuecomment-684804950). It takes about 30 seconds to export less than 100 MB of state (as of March 2020).
* Updates in IAVL may trigger tree reorganization and possible O(log(n)) hashes re-computation, which can become a CPU bottleneck.
* The node structure is pretty expensive - it contains a standard tree node elements (key, value, left and right element) and additional metadata such as height, version (which is not required by the Cosmos SDK). The entire node is hashed, and that hash is used as the key in the underlying database, [ref](https://github.com/cosmos/iavl/blob/master/docs/node/03-node.md
).

Moreover, the IAVL project lacks support and a maintainer and we already see better and well-established alternatives. Instead of optimizing the IAVL, we are looking into other solutions for both storage and state commitments.

## Decision

We propose to separate the concerns of state commitment (**SC**), needed for consensus, and state storage (**SS**), needed for state machine. Finally we replace IAVL with [Celestia's SMT](https://github.com/lazyledger/smt). Celestia SMT is based on Diem (called jellyfish) design [*] - it uses a compute-optimised SMT by replacing subtrees with only default values with a single node (same approach is used by Ethereum2) and implements compact proofs.

The storage model presented here doesn't deal with data structure nor serialization. It's a Key-Value database, where both key and value are binaries. The storage user is responsible for data serialization.

### Decouple state commitment from storage

Separation of storage and commitment (by the SMT) will allow the optimization of different components according to their usage and access patterns.

`SC` (SMT) is used to commit to a data and compute Merkle proofs. `SS` is used to directly access data. To avoid collisions, both `SS` and `SC` will use a separate storage namespace (they could use the same database underneath). `SS` will store each record directly (mapping `(key, value)` as `key → value`).

SMT is a merkle tree structure: we don't store keys directly. For every `(key, value)` pair, `hash(key)` is used as leaf path (we hash a key to uniformly distribute leaves in the tree) and `hash(value)` as the leaf contents. The tree structure is specified in more depth [below](#smt-for-state-commitment).

For data access we propose 2 additional KV buckets (implemented as namespaces for the key-value pairs, sometimes called [column family](https://github.com/facebook/rocksdb/wiki/Terminology)):

1. B1: `key → value`: the principal object storage, used by a state machine, behind the Cosmos SDK `KVStore` interface: provides direct access by key and allows prefix iteration (KV DB backend must support it).
2. B2: `hash(key) → key`: a reverse index to get a key from an SMT path. Internally the SMT will store `(key, value)` as `prefix || hash(key) || hash(value)`. So, we can get an object value by composing `hash(key) → B2 → B1`.
3. We could use more buckets to optimize the app usage if needed.

We propose to use a KV database for both `SS` and `SC`. The store interface will allow to use the same physical DB backend for both `SS` and `SC` as well two separate DBs. The latter option allows for the separation of `SS` and `SC` into different hardware units, providing support for more complex setup scenarios and improving overall performance: one can use different backends (eg RocksDB and Badger) as well as independently tuning the underlying DB configuration.

### Requirements

State Storage requirements:

* range queries
* quick (key, value) access
* creating a snapshot
* historical versioning
* pruning (garbage collection)

State Commitment requirements:

* fast updates
* tree path should be short
* query historical commitment proofs using ICS-23 standard
* pruning (garbage collection)

### SMT for State Commitment

A Sparse Merkle tree is based on the idea of a complete Merkle tree of an intractable size. The assumption here is that as the size of the tree is intractable, there would only be a few leaf nodes with valid data blocks relative to the tree size, rendering a sparse tree.

The full specification can be found at [Celestia](https://github.com/celestiaorg/celestia-specs/blob/ec98170398dfc6394423ee79b00b71038879e211/src/specs/data_structures.md#sparse-merkle-tree). In summary:

* The SMT consists of a binary Merkle tree, constructed in the same fashion as described in [Certificate Transparency (RFC-6962)](https://tools.ietf.org/html/rfc6962), but using as the hashing function SHA-2-256 as defined in [FIPS 180-4](https://doi.org/10.6028/NIST.FIPS.180-4).
* Leaves and internal nodes are hashed differently: the one-byte `0x00` is prepended for leaf nodes while `0x01` is prepended for internal nodes.
* Default values are given to leaf nodes with empty leaves.
* While the above rule is sufficient to pre-compute the values of intermediate nodes that are roots of empty subtrees, a further simplification is to extend this default value to all nodes that are roots of empty subtrees. The 32-byte zero is used as the default value. This rule takes precedence over the above one.
* An internal node that is the root of a subtree that contains exactly one non-empty leaf is replaced by that leaf's leaf node.

### Snapshots for storage sync and state versioning

Below, with simple _snapshot_ we refer to a database snapshot mechanism, not to a _ABCI snapshot sync_. The latter will be referred as _snapshot sync_ (which will directly use DB snapshot as described below).

Database snapshot is a view of DB state at a certain time or transaction. It's not a full copy of a database (it would be too big). Usually a snapshot mechanism is based on a _copy on write_ and it allows DB state to be efficiently delivered at a certain stage.
Some DB engines support snapshotting. Hence, we propose to reuse that functionality for the state sync and versioning (described below). We limit the supported DB engines to ones which efficiently implement snapshots. In a final section we discuss the evaluated DBs.

One of the Stargate core features is a _snapshot sync_ delivered in the `/snapshot` package. It provides a way to trustlessly sync a blockchain without repeating all transactions from the genesis. This feature is implemented in Cosmos SDK and requires storage support. Currently IAVL is the only supported backend. It works by streaming to a client a snapshot of a `SS` at a certain version together with a header chain.

A new database snapshot will be created in every `EndBlocker` and identified by a block height. The `root` store keeps track of the available snapshots to offer `SS` at a certain version. The `root` store implements the `RootStore` interface described below. In essence, `RootStore` encapsulates a `Committer` interface. `Committer` has a `Commit`, `SetPruning`, `GetPruning` functions which will be used for creating and removing snapshots. The `rootStore.Commit` function creates a new snapshot and increments the version on each call, and checks if it needs to remove old versions. We will need to update the SMT interface to implement the `Committer` interface.
NOTE: `Commit` must be called exactly once per block. Otherwise we risk going out of sync for the version number and block height.
NOTE: For the Cosmos SDK storage, we may consider splitting that interface into `Committer` and `PruningCommitter` - only the multiroot should implement `PruningCommitter` (cache and prefix store don't need pruning).

Number of historical versions for `abci.RequestQuery` and state sync snapshots is part of a node configuration, not a chain configuration (configuration implied by the blockchain consensus). A configuration should allow to specify number of past blocks and number of past blocks modulo some number (eg: 100 past blocks and one snapshot every 100 blocks for past 2000 blocks). Archival nodes can keep all past versions.

Pruning old snapshots is effectively done by a database. Whenever we update a record in `SC`, SMT won't update nodes - instead it creates new nodes on the update path, without removing the old one. Since we are snapshotting each block, we need to change that mechanism to immediately remove orphaned nodes from the database. This is a safe operation - snapshots will keep track of the records and make it available when accessing past versions.

To manage the active snapshots we will either use a DB _max number of snapshots_ option (if available), or we will remove DB snapshots in the `EndBlocker`. The latter option can be done efficiently by identifying snapshots with block height and calling a store function to remove past versions.

#### Accessing old state versions

One of the functional requirements is to access old state. This is done through `abci.RequestQuery` structure.  The version is specified by a block height (so we query for an object by a key `K` at block height `H`). The number of old versions supported for `abci.RequestQuery` is configurable. Accessing an old state is done by using available snapshots.
`abci.RequestQuery` doesn't need old state of `SC` unless the `prove=true` parameter is set. The SMT merkle proof must be included in the `abci.ResponseQuery` only if both `SC` and `SS` have a snapshot for requested version.

Moreover, Cosmos SDK could provide a way to directly access a historical state. However, a state machine shouldn't do that - since the number of snapshots is configurable, it would lead to nondeterministic execution.

We positively [validated](https://github.com/cosmos/cosmos-sdk/discussions/8297) a versioning and snapshot mechanism for querying old state with regards to the database we evaluated.

### State Proofs

For any object stored in State Store (SS), we have corresponding object in `SC`. A proof for object `V` identified by a key `K` is a branch of `SC`, where the path corresponds to the key `hash(K)`, and the leaf is `hash(K, V)`.

### Rollbacks

We need to be able to process transactions and roll-back state updates if a transaction fails. This can be done in the following way: during transaction processing, we keep all state change requests (writes) in a `CacheWrapper` abstraction (as it's done today). Once we finish the block processing, in the `Endblocker`,  we commit a root store - at that time, all changes are written to the SMT and to the `SS` and a snapshot is created.

### Committing to an object without saving it

We identified use-cases, where modules will need to save an object commitment without storing an object itself. Sometimes clients are receiving complex objects, and they have no way to prove a correctness of that object without knowing the storage layout. For those use cases it would be easier to commit to the object without storing it directly.

### Refactor MultiStore

The Stargate `/store` implementation (store/v1) adds an additional layer in the SDK store construction - the `MultiStore` structure. The multistore exists to support the modularity of the Cosmos SDK - each module is using its own instance of IAVL, but in the current implementation, all instances share the same database. The latter indicates, however, that the implementation doesn't provide true modularity. Instead it causes problems related to race condition and atomic DB commits (see: [\#6370](https://github.com/cosmos/cosmos-sdk/issues/6370) and [discussion](https://github.com/cosmos/cosmos-sdk/discussions/8297#discussioncomment-757043)).

We propose to reduce the multistore concept from the SDK, and to use a single instance of `SC` and `SS` in a `RootStore` object. To avoid confusion, we should rename the `MultiStore` interface to `RootStore`. The `RootStore` will have the following interface; the methods for configuring tracing and listeners are omitted for brevity.

```go
// Used where read-only access to versions is needed.
type BasicRootStore interface {
    Store
    GetKVStore(StoreKey) KVStore
    CacheRootStore() CacheRootStore
}

// Used as the main app state, replacing CommitMultiStore.
type CommitRootStore interface {
    BasicRootStore
    Committer
    Snapshotter

    GetVersion(uint64) (BasicRootStore, error)
    SetInitialVersion(uint64) error

    ... // Trace and Listen methods
}

// Replaces CacheMultiStore for branched state.
type CacheRootStore interface {
    BasicRootStore
    Write()

    ... // Trace and Listen methods
}

// Example of constructor parameters for the concrete type.
type RootStoreConfig struct {
    Upgrades        *StoreUpgrades
    InitialVersion  uint64

    ReservePrefix(StoreKey, StoreType)
}
```

<!-- TODO: Review whether these types can be further reduced or simplified -->
<!-- TODO: RootStorePersistentCache type -->

In contrast to `MultiStore`, `RootStore` doesn't allow to dynamically mount sub-stores or provide an arbitrary backing DB for individual sub-stores.

NOTE: modules will be able to use a special commitment and their own DBs. For example: a module which will use ZK proofs for state can store and commit this proof in the `RootStore` (usually as a single record) and manage the specialized store privately or using the `SC` low level interface.

#### Compatibility support

To ease the transition to this new interface for users, we can create a shim which wraps a `CommitMultiStore` but provides a `CommitRootStore` interface, and expose functions to safely create and access the underlying `CommitMultiStore`.

The new `RootStore` and supporting types can be implemented in a `store/v2alpha1` package to avoid breaking existing code.

#### Merkle Proofs and IBC

Currently, an IBC (v1.0) Merkle proof path consists of two elements (`["<store-key>", "<record-key>"]`), with each key corresponding to a separate proof. These are each verified according to individual [ICS-23 specs](https://github.com/cosmos/ibc-go/blob/f7051429e1cf833a6f65d51e6c3df1609290a549/modules/core/23-commitment/types/merkle.go#L17), and the result hash of each step is used as the committed value of the next step, until a root commitment hash is obtained.
The root hash of the proof for `"<record-key>"` is hashed with the `"<store-key>"` to validate against the App Hash.

This is not compatible with the `RootStore`, which stores all records in a single Merkle tree structure, and won't produce separate proofs for the store- and record-key. Ideally, the store-key component of the proof could just be omitted, and updated to use a "no-op" spec, so only the record-key is used. However, because the IBC verification code hardcodes the `"ibc"` prefix and applies it to the SDK proof as a separate element of the proof path, this isn't possible without a breaking change. Breaking this behavior would severely impact the Cosmos ecosystem which already widely adopts the IBC module. Requesting an update of the IBC module across the chains is a time consuming effort and not easily feasible.

As a workaround, the `RootStore` will have to use two separate SMTs (they could use the same underlying DB): one for IBC state and one for everything else. A simple Merkle map that reference these SMTs will act as a Merkle Tree to create a final App hash. The Merkle map is not stored in a DBs - it's constructed in the runtime. The IBC substore key must be `"ibc"`.

The workaround can still guarantee atomic syncs: the [proposed DB backends](#evaluated-kv-databases) support atomic transactions and efficient rollbacks, which will be used in the commit phase.

The presented workaround can be used until the IBC module is fully upgraded to supports single-element commitment proofs.

### Optimization: compress module key prefixes

We consider a compression of prefix keys by creating a mapping from module key to an integer, and serializing the integer using varint coding. Varint coding assures that different values don't have common byte prefix. For Merkle Proofs we can't use prefix compression - so it should only apply for the `SS` keys. Moreover, the prefix compression should be only applied for the module namespace. More precisely:

* each module has it's own namespace;
* when accessing a module namespace we create a KVStore with embedded prefix;
* that prefix will be compressed only when accessing and managing `SS`.

We need to assure that the codes won't change. We can fix the mapping in a static variable (provided by an app) or SS state under a special key.

TODO: need to make decision about the key compression.

## Optimization: SS key compression

Some objects may be saved with key, which contains a Protobuf message type. Such keys are long. We could save a lot of space if we can map Protobuf message types in varints.

TODO: finalize this or move to another ADR.

## Migration

Using the new store will require a migration. 2 Migrations are proposed:

1. Genesis export -- it will reset the blockchain history.
2. In place migration: we can reuse `UpgradeKeeper.SetUpgradeHandler` to provide the migration logic:

```go 
app.UpgradeKeeper.SetUpgradeHandler("adr-40", func(ctx sdk.Context, plan upgradetypes.Plan, vm module.VersionMap) (module.VersionMap, error) {

    storev2.Migrate(iavlstore, v2.store)

    // RunMigrations returns the VersionMap
    // with the updated module ConsensusVersions
    return app.mm.RunMigrations(ctx, vm)
})
```

The `Migrate` function will read all entries from a store/v1 DB and save them to the AD-40 combined KV store. 
Cache layer should not be used and the operation must finish with a single Commit call.

Inserting records to the `SC` (SMT) component is the bottleneck. Unfortunately SMT doesn't support batch transactions. 
Adding batch transactions to `SC` layer is considered as a feature after the main release.

## Consequences

### Backwards Compatibility

This ADR doesn't introduce any Cosmos SDK level API changes.

We change the storage layout of the state machine, a storage hard fork and network upgrade is required to incorporate these changes. SMT provides a merkle proof functionality, however it is not compatible with ICS23. Updating the proofs for ICS23 compatibility is required.

### Positive

* Decoupling state from state commitment introduce better engineering opportunities for further optimizations and better storage patterns.
* Performance improvements.
* Joining SMT based camp which has wider and proven adoption than IAVL. Example projects which decided on SMT: Ethereum2, Diem (Libra), Trillan, Tezos, Celestia.
* Multistore removal fixes a longstanding issue with the current MultiStore design.
* Simplifies merkle proofs - all modules, except IBC, have only one pass for merkle proof.

### Negative

* Storage migration
* LL SMT doesn't support pruning - we will need to add and test that functionality.
* `SS` keys will have an overhead of a key prefix. This doesn't impact `SC` because all keys in `SC` have same size (they are hashed).

### Neutral

* Deprecating IAVL, which is one of the core proposals of Cosmos Whitepaper.

## Alternative designs

Most of the alternative designs were evaluated in [state commitments and storage report](https://paper.dropbox.com/published/State-commitments-and-storage-review--BDvA1MLwRtOx55KRihJ5xxLbBw-KeEB7eOd11pNrZvVtqUgL3h).

Ethereum research published [Verkle Trie](https://dankradfeist.de/ethereum/2021/06/18/verkle-trie-for-eth1.html) - an idea of combining polynomial commitments with merkle tree in order to reduce the tree height. This concept has a very good potential, but we think it's too early to implement it. The current, SMT based design could be easily updated to the Verkle Trie once other research implement all necessary libraries. The main advantage of the design described in this ADR is the separation of state commitments from the data storage and designing a more powerful interface.

## Further Discussions

### Evaluated KV Databases

We verified existing databases KV databases for evaluating snapshot support. The following databases provide efficient snapshot mechanism: Badger, RocksDB, [Pebble](https://github.com/cockroachdb/pebble). Databases which don't provide such support or are not production ready: boltdb, leveldb, goleveldb, membdb, lmdb.

### RDBMS

Use of RDBMS instead of simple KV store for state. Use of RDBMS will require a Cosmos SDK API breaking change (`KVStore` interface) and will allow better data extraction and indexing solutions. Instead of saving an object as a single blob of bytes, we could save it as record in a table in the state storage layer, and as a `hash(key, protobuf(object))` in the SMT as outlined above. To verify that an object registered in RDBMS is same as the one committed to SMT, one will need to load it from RDBMS, marshal using protobuf, hash and do SMT search.

### Off Chain Store

We were discussing use case where modules can use a support database, which is not automatically committed. Module will responsible for having a sound storage model and can optionally use the feature discussed in __Committing to an object without saving it_ section.

## References

* [IAVL What's Next?](https://github.com/cosmos/cosmos-sdk/issues/7100)
* [IAVL overview](https://docs.google.com/document/d/16Z_hW2rSAmoyMENO-RlAhQjAG3mSNKsQueMnKpmcBv0/edit#heading=h.yd2th7x3o1iv) of it's state v0.15
* [State commitments and storage report](https://paper.dropbox.com/published/State-commitments-and-storage-review--BDvA1MLwRtOx55KRihJ5xxLbBw-KeEB7eOd11pNrZvVtqUgL3h)
* [Celestia (LazyLedger) SMT](https://github.com/lazyledger/smt)
* Facebook Diem (Libra) SMT [design](https://developers.diem.com/papers/jellyfish-merkle-tree/2021-01-14.pdf)
* [Trillian Revocation Transparency](https://github.com/google/trillian/blob/master/docs/papers/RevocationTransparency.pdf), [Trillian Verifiable Data Structures](https://github.com/google/trillian/blob/master/docs/papers/VerifiableDataStructures.pdf).
* Design and implementation [discussion](https://github.com/cosmos/cosmos-sdk/discussions/8297).
* [How to Upgrade IBC Chains and their Clients](https://github.com/cosmos/ibc-go/blob/main/docs/ibc/upgrades/quick-guide.md)
* [ADR-40 Effect on IBC](https://github.com/cosmos/ibc-go/discussions/256)
