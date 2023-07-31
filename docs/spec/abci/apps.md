# 应用程序

请确保您首先阅读了[ABCI方法和类型规范](abci.md)。

在这里，我们涵盖了ABCI应用程序的以下组件：

- [连接状态](#connection-state) - ABCI连接和应用程序状态之间的相互作用，以及`CheckTx`和`DeliverTx`之间的区别。
- [交易结果](#transaction-results) - 有关交易结果和有效性的规则。
- [验证人集合更新](#validator-updates) - `InitChain`和`EndBlock`期间验证人集合的更改方式。
- [查询](#query) - 使用`Query`方法和关于应用程序状态的证明的标准。
- [崩溃恢复](#crash-recovery) - 在启动时同步Tendermint和应用程序的握手协议。
- [状态同步](#state-sync) - 通过恢复状态机快速引导新节点。

## 连接状态

由于Tendermint维护了四个并发的ABCI连接，因此应用程序通常需要为每个连接维护一个独立的状态，并在`Commit`期间同步这些状态。

### 并发性

原则上，这四个ABCI连接之间是并发运行的。这意味着应用程序需要确保对状态的访问是线程安全的。实际上，[默认的进程内ABCI客户端](https://github.com/tendermint/tendermint/blob/v0.34.4/abci/client/local_client.go#L18)和[默认的Go ABCI服务器](https://github.com/tendermint/tendermint/blob/v0.34.4/abci/server/socket_server.go#L32)在所有连接上使用全局锁，因此它们根本不是并发的。这意味着如果您的应用程序是用Go编写的，并且使用默认的`NewLocalClient`与Tendermint一起编译在进程内，或者使用默认的`SocketServer`在进程外运行，来自所有连接的ABCI消息将是线性化的（一次接收一个）。

这个全局互斥锁的存在意味着Go应用程序开发人员可以通过将*所有*读取和写入通过ABCI系统进行路由来获得应用程序状态的线程安全性。因此，直接将应用程序状态暴露给RPC接口可能是*不安全*的，除非采取明确的措施，否则所有查询都应通过ABCI的查询方法进行路由。

### BeginBlock

BeginBlock请求可用于在每个区块开始时运行一些代码。它还允许Tendermint在发送任何交易之前向应用程序发送当前区块哈希和头部。

应用程序应该记住最新的高度和头部（即从中运行了成功的Commit），以便在重新启动时告诉Tendermint从哪里开始。有关握手的信息，请参阅下文。

### Commit

应用程序状态应该只在`Commit`期间持久化到磁盘。

在调用`Commit`之前，Tendermint会锁定并刷新mempool，以确保不会在mempool连接上接收到新的消息。这提供了一个安全地将所有四个连接状态一次性更新为最新提交状态的机会。

当`Commit`完成时，它会解锁mempool。

警告：如果处理`Commit`消息的ABCI应用逻辑发送`/broadcast_tx_sync`或`/broadcast_tx_commit`并在继续之前等待响应，将会发生死锁。执行这些`broadcast_tx`调用涉及获取在`Commit`调用期间保持的锁，因此不可能。如果您同时调用`broadcast_tx`端点，那没问题，只是不能成为`Commit`函数的顺序逻辑的一部分。

### Consensus Connection

共识连接应该维护一个`DeliverTxState` - 用于区块执行的工作状态。它应该在区块执行期间通过对`BeginBlock`、`DeliverTx`和`EndBlock`的调用进行更新，并在`Commit`期间作为“最新提交状态”写入磁盘。

每个方法调用对`DeliverTxState`所做的更新必须可以被后续的每个方法读取 - 即更新是可线性化的。

### Mempool Connection

mempool连接应该维护一个`CheckTxState`，以顺序处理尚未提交的mempool中的挂起事务。它应该在每次`Commit`结束时初始化为最新提交状态。

在调用`Commit`之前，Tendermint将锁定并刷新mempool连接，确保所有现有的CheckTx都得到响应，并且不会开始新的CheckTx。`CheckTxState`可以与`DeliverTxState`并发更新，因为消息可以同时在共识连接和mempool连接上发送。

在`Commit`之后，在仍然持有mempool锁的情况下，对过滤掉已包含在区块中的交易后，剩余的交易再次运行CheckTx。
CheckTx函数提供了一个额外的`Type`参数，用于指示传入的交易是新的（`CheckTxType_New`）还是重新检查（`CheckTxType_Recheck`）。

最后，在重新检查mempool中的交易之后，Tendermint将解锁mempool连接。新的交易再次可以通过CheckTx进行处理。

请注意，CheckTx只是一个弱过滤器，用于将无效的交易排除在区块链之外。
CheckTx不必检查影响交易有效性的所有内容；可以跳过耗费资源的操作。它是弱的，因为拜占庭节点不关心CheckTx；如果愿意，它可以提出一个充满无效交易的区块。

#### 重放保护

为了防止旧交易被重放，CheckTx必须实现重放保护。

可能会将旧交易发送到应用程序中。因此，CheckTx实现一些逻辑来处理它们是很重要的。

### 查询连接

Info连接应该维护一个`QueryState`，用于回答用户的查询，并在Tendermint首次启动时进行初始化（下面会进一步描述）。
它应该始终包含与最新提交的区块相关联的最新提交状态。

在每次`Commit`之后，`QueryState`应该被设置为最新的`DeliverTxState`，在完整的区块被处理并状态被提交到磁盘之后。
否则，它不应该被修改。

Tendermint Core目前使用查询连接来根据IP地址或节点ID过滤对等节点。例如，对以下任一查询返回非OK的ABCI响应将导致Tendermint不连接到相应的对等节点：

- `p2p/filter/addr/<ip addr>`，其中`<ip addr>`是IP地址。
- `p2p/filter/id/<id>`，其中`<is>`是十六进制编码的节点ID（节点的p2p公钥的哈希值）。

注意：这些查询格式可能会发生变化！

### 快照连接

快照连接是可选的，仅用于为其他节点提供状态同步快照和/或将状态同步快照恢复到正在引导的本地节点。

有关更多信息，请参阅[本文档的状态同步部分](#state-sync)。

## 交易结果

`Info`和`Log`字段是非确定性值，用于调试/方便目的，否则会被忽略。

`Data`字段必须严格确定性，但可以是任意数据。

### Gas

以太坊引入了`gas`的概念，作为节点处理交易时使用的资源成本的抽象表示。以太坊虚拟机中的每个操作都使用一定数量的gas，并且gas可以以市场可变价格接受。用户为其交易提出了最大gas量的建议；如果交易使用的gas较少，他们将获得差额退还。Tendermint采用了类似的抽象，但只是可选和弱化的，允许应用程序定义其自己的执行成本概念。

在Tendermint中，[ConsensusParams.Block.MaxGas](../proto/types/params.proto)限制了一个块中可以使用的`gas`的数量。默认值为`-1`，表示没有限制，或者gas的概念是无意义的。

响应包含`GasWanted`和`GasUsed`字段。前者是发送交易的人愿意使用的最大gas量，后者是实际使用的gas量。应用程序应强制执行`GasUsed <= GasWanted`的规则 - 即在使用更多资源之前，交易执行应该停止。

当`MaxGas > -1`时，Tendermint强制执行以下规则：

- 所有mempool中的交易`GasWanted <= MaxGas`
- 提议块时，`(一个块中的GasWanted之和) <= MaxGas`

如果`MaxGas == -1`，则不强制执行有关gas的任何规则。

请注意，Tendermint目前不会在共识中强制执行有关Gas的任何内容，只会在mempool中执行。这意味着它不能保证已提交的块符合这些规则！当超过gas限制时，应用程序有责任返回非零的响应代码。

`GasUsed`字段在Tendermint中完全被忽略。尽管如此，应用程序应该强制执行以下规则：

- 对于任何给定的交易，`GasUsed <= GasWanted`
- 对于每个区块，`(区块中的GasUsed之和) <= MaxGas`

在将来，我们打算在响应中添加一个`Priority`字段，用于明确地为内存池中的交易设置优先级，以便包含在区块提案中。详见[#1861](https://github.com/tendermint/tendermint/issues/1861)。

### CheckTx

如果`Code != 0`，该交易将被拒绝并从内存池中删除，因此不会广播给其他节点，也不会包含在提案区块中。

`Data`包含CheckTx交易执行的结果（如果有）。对于Tendermint来说，它在语义上没有意义。

`Events`包括执行过程中的任何事件，但由于该交易尚未提交，Tendermint实际上会忽略这些事件。

### DeliverTx

DeliverTx是区块链的核心工作。Tendermint以异步但有序的方式发送DeliverTx请求，并依赖底层的套接字协议（如TCP）来确保应用程序按顺序接收到这些请求。这些请求已经按照Tendermint协议在全局共识中进行了排序。

如果DeliverTx返回的`Code != 0`，该交易将被视为无效，但仍然包含在区块中。

DeliverTx还返回一个[Code、Data和Log](../../proto/abci/types.proto#L189-L191)。

`Data`包含DeliverTx交易执行的结果（如果有）。对于Tendermint来说，它在语义上没有意义。

`Code`和`Data`都包含在一个结构中，该结构被哈希到下一个区块头的`LastResultsHash`中。

`Events`包括执行过程中的任何事件，Tendermint将使用这些事件进行索引。这允许根据执行过程中发生的事件查询交易。

## 更新验证人集合

应用程序可以在InitChain期间设置验证人集合，并可以在EndBlock期间更新验证人集合。

请注意，验证人集合的最大总权重受到限制，即`MaxTotalVotingPower = MaxInt64 / 8`。应用程序负责确保对验证人集合的更改不会导致超过此限制。

此外，应用程序必须确保单个更新集中不包含任何重复项 - 在给定的更新中，给定的公钥只能出现一次。如果更新中包含重复项，块执行将无法恢复地失败。

### InitChain

`InitChain` 方法可以返回验证人列表。如果列表为空，Tendermint 将使用在创世文件中加载的验证人。如果 `InitChain` 返回的列表不为空，Tendermint 将使用其内容作为验证人集合。这样，应用程序可以为区块链设置初始验证人集合。

### EndBlock

可以通过在 `ResponseEndBlock` 中返回 `ValidatorUpdate` 对象来更新 Tendermint 验证人集合：

```protobuf
message ValidatorUpdate {
  tendermint.crypto.keys.PublicKey pub_key
  int64 power
}

message PublicKey {
  oneof {
    ed25519 bytes = 1;
  }
```

`pub_key` 目前仅支持一种类型：

- `type = "ed25519"`

`power` 是验证人的新投票权重，具有以下规则：

- 权重必须是非负数
- 如果权重为 0，则验证人必须已经存在，并将从验证人集合中删除
- 如果权重非零：
    - 如果验证人尚不存在，则将其添加到验证人集合，并设置给定的权重
    - 如果验证人已经存在，则将其权重调整为给定的权重
- 新验证人集合的总权重不能超过 MaxTotalVotingPower

请注意，返回的更新在块 `H` 中只会在块 `H+2` 生效。

## 共识参数

共识参数对区块链施加了一定的限制，例如块的最大大小、块中使用的燃料量以及可接受的证据的最大年龄。它们可以在 InitChain 中设置，并在 EndBlock 中进行更新。

### BlockParams.MaxBytes

完整的 Protobuf 编码块的最大大小。这由 Tendermint 共识强制执行。

这意味着交易的最大大小为 MaxBytes 减去预期的头部大小、验证人集合大小以及块中包含的任何证据的大小。

必须满足 `0 < MaxBytes < 100 MB`。

### BlockParams.MaxGas

在提议的块中允许的 `GasWanted` 总和的最大值。这不是由 Tendermint 共识强制执行。这由应用程序来执行（例如，如果超过限制包含了交易，则应返回非零代码）。Tendermint 使用它来限制包含在提议的块中的交易。

必须满足 `MaxGas >= -1`。
如果 `MaxGas == -1`，则没有限制。

### EvidenceParams.MaxAgeDuration

这是证据的最大时限。
Tendermint共识机制会对此进行强制执行。

如果一个区块包含的证据超过了这个时限（并且该证据是在 `MaxAgeNumBlocks` 之前创建的），该区块将被拒绝（验证者不会对其投票）。

必须满足 `MaxAgeDuration > 0`。

### EvidenceParams.MaxAgeNumBlocks

这是证据的最大区块数限制。
Tendermint共识机制会对此进行强制执行。

如果一个区块包含的证据超过了这个区块数限制（并且该证据是在 `MaxAgeDuration` 之前创建的），该区块将被拒绝（验证者不会对其投票）。

必须满足 `MaxAgeNumBlocks > 0`。

### EvidenceParams.MaxNum

这是每个区块可以提交的最大证据数量。

这个值乘以 `MaxEvidenceBytes` 不能超过一个区块的大小减去其开销（约为 `MaxBytes`）。

必须满足 `MaxNum > 0`。

### 更新

应用程序可以在 InitChain 期间设置 ConsensusParams，并在 EndBlock 期间更新它们。如果 ConsensusParams 为空，它将被忽略。每个非空字段都将被完全应用。例如，如果更新 Block.MaxBytes，则应用程序还必须设置其他 Block 字段（如 Block.MaxGas），即使它们没有更改，否则会导致该值更新为 0。

#### InitChain

ResponseInitChain 包含 ConsensusParams。
如果 ConsensusParams 为 nil，则 Tendermint 将使用在创世文件中加载的参数。如果 ConsensusParams 不为 nil，则 Tendermint 将使用它。
这样应用程序可以确定区块链的初始共识参数。

#### EndBlock

ResponseEndBlock 包含 ConsensusParams。
如果 ConsensusParams 为 nil，则 Tendermint 不会执行任何操作。
如果 ConsensusParams 不为 nil，则 Tendermint 将使用它。
这样应用程序可以随时间更新共识参数。

请注意，返回到块 `H` 中的更新将立即对块 `H+1` 生效。

## 查询

查询是一种通用方法，具有很大的灵活性，可以在应用程序状态上进行各种查询。Tendermint利用查询来基于ID和IP筛选新的对等节点，并通过RPC向用户公开查询功能。

请注意，对 Query 的调用不会在节点之间复制，而是查询本地节点的状态 - 因此可能返回过时的读取结果。对于需要共识的读取操作，请使用事务。

Query 最重要的用途是返回某个高度的应用程序状态的 Merkle 证明，以供特定于应用程序的轻客户端高效使用。

请注意，Tendermint 在正常操作中对 Query 消息没有技术要求 - 也就是说，如果 ABCI 应用程序开发人员不希望实现 Query 功能，则无需实现。

### 查询证明

Tendermint 区块头包含多个哈希，每个哈希都提供了关于区块链的某种类型的证明的锚点。`ValidatorsHash` 可以快速验证验证人集合，`DataHash` 可以快速验证包含在区块中的交易等。

`AppHash` 是独特的，因为它是特定于应用程序的，并允许关于应用程序状态的特定于应用程序的 Merkle 证明。虽然某些应用程序将所有相关状态保存在交易本身中（例如比特币及其 UTXO），但其他应用程序维护一个分离的状态，该状态从交易中确定性地计算出来，但不直接包含在交易本身中（例如以太坊的合约和账户）。对于这类应用程序，`AppHash` 提供了一种更高效的方式来验证轻客户端证明。

ABCI 应用程序可以利用更高效的轻客户端证明来处理其状态，具体如下：

- 在 `ResponseCommit.Data` 中返回确定性应用程序状态的 Merkle 根。此 Merkle 根将作为下一个区块的 `AppHash`。
- 在 `ResponseQuery.Proof` 中返回关于该应用程序状态的高效 Merkle 证明，可以使用相应区块的 `AppHash` 进行验证。

例如，这使得应用程序的轻客户端可以验证应用程序状态中的缺失证明，而使用区块哈希来进行此操作则效率要低得多。

一些应用程序（例如以太坊、Cosmos-SDK）具有多个“级别”的 Merkle 树，其中一个树的叶子是其他树的根哈希。为了支持这一点以及 Merkle 证明的一般可变性，`ResponseQuery.Proof` 具有一些最小的结构：

```protobuf
message ProofOps {
  repeated ProofOp ops
}

message ProofOp {
  string type = 1;
  bytes key = 2;
  bytes data = 3;
}
```

每个 `ProofOp` 包含了一个指定 `type` 的单个 Merkle 树中的一个键的证明。
这使得 ABCI 能够支持许多不同类型的 Merkle 树、编码格式和证明（例如存在和不存在的证明），只需改变 `type`。
`data` 包含了根据 `type` 编码的实际证明的数据。
在验证完整的证明时，一个 ProofOp 的根哈希是下一个 ProofOp 列表中要验证的值。
列表中最后一个 ProofOp 的根哈希应与要验证的 `AppHash` 匹配。

### 对等节点过滤

当 Tendermint 连接到一个对等节点时，它会向 ABCI 应用发送两个查询，使用以下路径，不附加任何数据：

- `/p2p/filter/addr/<IP:PORT>`，其中 `<IP:PORT>` 表示连接的 IP 地址和端口
- `p2p/filter/id/<ID>`，其中 `<ID>` 是对等节点的节点 ID（即对等节点的 PubKey 的 pubkey.Address()）

如果这两个查询中的任何一个返回非零的 ABCI 状态码，Tendermint 将拒绝连接到该对等节点。

### 路径

查询是针对路径进行的，可以选择性地包含其他数据。

期望有一些高级路径来区分关注点，例如 `/p2p`、`/store` 和 `/app`。
目前，Tendermint 只使用 `/p2p` 来过滤对等节点。有关更高级的用法，请参阅
[Cosmos-SDK 中的 Query 实现](https://github.com/cosmos/cosmos-sdk/blob/v0.23.1/baseapp/baseapp.go#L333)。

## 崩溃恢复

在启动时，Tendermint 调用 Info 连接的 `Info` 方法以获取应用的最新提交状态。
应用必须返回与其最后一个成功完成 Commit 的块一致的信息。

如果应用成功提交了块 H，则 `last_block_height = H`，`last_block_app_hash = <通过 Commit 返回的块 H 的哈希>`。如果应用在提交块 H 时失败，则 `last_block_height = H-1`，`last_block_app_hash = <通过 Commit 返回的块 H-1 的哈希，即块 H 的头部中的哈希>`。

我们现在区分三个高度，并描述Tendermint如何与应用程序同步。

```md
storeBlockHeight = height of the last block Tendermint saw a commit for
stateBlockHeight = height of the last block for which Tendermint completed all
    block processing and saved all ABCI results to disk
appBlockHeight = height of the last block for which ABCI app succesfully
    completed Commit

```

请注意，我们始终有`storeBlockHeight >= stateBlockHeight`和`storeBlockHeight >= appBlockHeight`。
请注意，Tendermint从不为相同的高度多次调用ABCI应用程序的Commit。

具体步骤如下。

首先，一些简单的起始条件：

如果`appBlockHeight == 0`，则调用InitChain。

如果`storeBlockHeight == 0`，我们完成了。

现在，一些健全性检查：

如果`storeBlockHeight < appBlockHeight`，报错。
如果`storeBlockHeight < stateBlockHeight`，恐慌。
如果`storeBlockHeight > stateBlockHeight+1`，恐慌。

现在，重点来了：

如果`storeBlockHeight == stateBlockHeight && appBlockHeight < storeBlockHeight`，
从`appBlockHeight`到`storeBlockHeight`完整地重放所有块。
这种情况发生在我们完成处理该块，但应用程序忘记了其高度的情况下。

如果`storeBlockHeight == stateBlockHeight && appBlockHeight == storeBlockHeight`，我们完成了。
这种情况发生在我们在一个合适的位置崩溃。

如果`storeBlockHeight == stateBlockHeight+1`，
这种情况发生在我们开始处理该块但未完成的情况下。

如果`appBlockHeight < stateBlockHeight`，
从`appBlockHeight`到`storeBlockHeight-1`完整地重放所有块，
并使用WAL重放`storeBlockHeight`处的块。
这种情况发生在应用程序忘记了最后一个提交的块的情况下。

如果`appBlockHeight == stateBlockHeight`，
完整地重放最后一个块（storeBlockHeight）。
这种情况发生在我们在应用程序完成Commit之前崩溃的情况下。

如果`appBlockHeight == storeBlockHeight`，
使用保存的ABCI响应更新状态，但不对真实应用程序运行该块。
这种情况发生在应用程序完成Commit但Tendermint保存状态之前崩溃的情况下。

## 状态同步

加入网络的新节点可以简单地在创世高度上加入共识，并重放所有历史块，直到追赶上其他节点。
然而，对于大型链来说，这可能需要相当长的时间，通常需要数天或数周。

状态同步是一种用于引导新节点的替代机制，它在给定高度处获取状态机的快照并恢复它。
根据应用程序的不同，这比重放块要快几个数量级。

请注意，状态同步目前不会回填历史区块，因此节点将具有截断的区块历史记录 - 建议用户在区块可用性和可审计性方面考虑更广泛的网络影响。这个功能可能会在将来添加。

有关特定的ABCI调用和类型的详细信息，请参阅[方法和类型部分](abci.md)。

### 创建快照

希望支持状态同步的应用程序必须定期创建状态快照。如何实现完全取决于应用程序。快照由一些元数据和一组以任意格式的二进制块组成：

- `Height (uint64)`: 快照创建时的高度。它必须在给定高度提交后进行，并且不能包含任何后续高度的数据。

- `Format (uint32)`: 任意的快照格式标识符。这可以用于对快照格式进行版本控制，例如从Protobuf切换到MessagePack进行序列化。应用程序可以在恢复时使用此标识符来选择接受还是拒绝快照。

- `Chunks (uint32)`: 快照中的块数。每个块包含任意的二进制数据，应该小于16 MB；10 MB是一个很好的起点。

- `Hash ([]byte)`: 快照的任意哈希值。在下载块时，用于检查快照在节点之间是否相同。

- `Metadata ([]byte)`: 任意的快照元数据，例如用于验证的块哈希或任何其他必要信息。

要使快照在节点之间被视为相同，所有这些字段都必须相同。在通过网络发送快照元数据消息时，限制为4 MB。

当新节点运行状态同步并发现快照时，Tendermint将通过ABCI的`ListSnapshots`方法查询现有应用程序以发现可用的快照，并通过`LoadSnapshotChunk`加载二进制快照块。应用程序可以自由选择如何实现以及使用哪些格式，但必须提供以下保证：

- **一致性：** 必须在单独的高度上进行快照，不受并发写入的影响。可以通过使用支持ACID事务和快照隔离的数据存储来实现这一点。

- **异步性：** 快照可能需要花费很长时间，因此不能阻止链的进展，例如通过在单独的线程中运行。

- **确定性：** 在相同高度和相同格式下进行的快照必须是相同的（以字节级别），包括所有元数据。这确保了块的可用性，并且它们在节点之间能够拼接在一起。

一个非常基本的方法可能是使用支持MVCC事务的数据存储（如RocksDB），在块提交后立即启动一个事务，并创建一个新的线程，将事务句柄传递给该线程。然后，该线程可以导出所有数据项，使用例如Protobuf进行序列化，对字节流进行哈希处理，将其分割成块，并将这些块与一些元数据一起存储在文件系统中，同时区块链正在并行应用新的块。

更高级的方法可能包括针对链应用哈希的增量验证、并行或批量导出、压缩等。

旧的快照应该在一段时间后被删除 - 通常只需要保留最后两个快照（以防止在节点恢复时删除最后一个快照）。

### 引导节点

可以通过设置配置选项 `statesync.enabled = true` 来同步一个空节点的状态。节点还需要链的创世文件以获取基本的链信息，并且需要配置用于对恢复的快照进行轻客户端验证的信息：一组Tendermint RPC服务器，以及来自可信源的受信任的头哈希和相应的高度，通过 `statesync` 配置部分。

一旦启动，节点将连接到P2P网络并开始发现快照。这些快照将通过 `OfferSnapshot` ABCI方法提供给本地应用程序。一旦接受了一个快照，Tendermint将获取并应用快照块。在所有块都成功应用之后，Tendermint使用轻客户端验证应用的 `AppHash` 与链进行验证，然后将节点切换到正常的共识操作模式。

#### 快照发现

当空节点加入P2P网络时，它会通过`ListSnapshots` ABCI调用向所有对等节点请求报告快照（每个节点限制为10个）。一段时间后，节点会选择最合适的快照（通常按照高度、格式和对等节点数量进行优先排序），并通过`OfferSnapshot`将其提供给应用程序。应用程序可以选择多种响应，包括接受或拒绝快照，拒绝提供的格式，拒绝发送快照的对等节点等。Tendermint将持续发现和提供快照，直到被接受或应用程序中止。

#### 快照恢复

一旦通过`OfferSnapshot`接受了快照，Tendermint开始从具有相同快照的任何对等节点（即具有相同元数据字段的节点）下载块。块会被暂存到临时目录中，然后按顺序通过`ApplySnapshotChunk`提供给应用程序，直到所有块都被接受。

恢复快照块的方法完全由应用程序决定。

在恢复过程中，应用程序可以通过`ApplySnapshotChunk`响应指令以指导后续操作。通常情况下，这将是接受块并等待下一个块，但也可以要求重新获取块（当前块或任意数量的先前块）、禁止P2P对等节点、拒绝或重试快照等多种响应方式-详细信息请参阅ABCI参考文档。

如果Tendermint在一段时间后无法获取块，则会拒绝快照并通过`OfferSnapshot`尝试其他快照-应用程序可以选择是否支持重新开始恢复，或者只是报告错误中止。

#### 快照验证

一旦所有块都被接受，Tendermint会发出一个`Info` ABCI调用以检索`LastBlockAppHash`。这将与链上的可信应用哈希进行比较，使用轻客户端进行检索和验证。Tendermint还会检查`LastBlockHeight`是否对应于快照的高度。

此验证确保应用程序在加入网络之前是有效的。然而，快照恢复可能需要很长时间完成，因此应用程序可能希望在恢复过程中采用额外的验证来及早检测到故障。例如，这可能包括使用捆绑的Merkle证明对每个块进行增量验证以验证应用哈希，使用校验和来防止磁盘或网络的数据损坏等。然而，重要的是要注意，唯一可信的信息是应用哈希，所有其他快照元数据都可以被对手伪造。

应用程序还可以考虑状态同步拒绝服务向量，即对手提供无效或有害的快照以阻止节点加入网络。应用程序可以通过要求Tendermint禁止对等方来对抗此问题。作为最后的手段，节点操作员可以使用P2P配置选项来将一组可信任的对等方列入白名单，这些对等方可以提供有效的快照。

#### 过渡到共识

一旦所有快照都已恢复，Tendermint会从创世文件和轻客户端RPC服务器中收集额外的必要信息来引导节点（例如链ID、共识参数、验证器集和区块头）。它还会获取并记录来自ABCI应用程序的`AppVersion`。

一旦状态机已恢复并且Tendermint已收集到这些额外的信息，它将转换为块同步（如果启用），以获取链头上的任何剩余块，然后转换为常规的共识操作。此时，节点的操作方式与其他节点相同，只是在恢复的快照高度处有一个截断的块历史记录。


---
order: 2
title: Applications
---

# Applications

Please ensure you've first read the spec for [ABCI Methods and Types](abci.md)

Here we cover the following components of ABCI applications:

- [Connection State](#connection-state) - the interplay between ABCI connections and application state
  and the differences between `CheckTx` and `DeliverTx`.
- [Transaction Results](#transaction-results) - rules around transaction
  results and validity
- [Validator Set Updates](#validator-updates) - how validator sets are
  changed during `InitChain` and `EndBlock`
- [Query](#query) - standards for using the `Query` method and proofs about the
  application state
- [Crash Recovery](#crash-recovery) - handshake protocol to synchronize
  Tendermint and the application on startup.
- [State Sync](#state-sync) - rapid bootstrapping of new nodes by restoring state machine snapshots

## Connection State

Since Tendermint maintains four concurrent ABCI connections, it is typical
for an application to maintain a distinct state for each, and for the states to
be synchronized during `Commit`.

### Concurrency

In principle, each of the four ABCI connections operate concurrently with one
another. This means applications need to ensure access to state is
thread safe. In practice, both the
[default in-process ABCI client](https://github.com/tendermint/tendermint/blob/v0.34.4/abci/client/local_client.go#L18)
and the
[default Go ABCI
server](https://github.com/tendermint/tendermint/blob/v0.34.4/abci/server/socket_server.go#L32)
use global locks across all connections, so they are not
concurrent at all. This means if your app is written in Go, and compiled in-process with Tendermint
using the default `NewLocalClient`, or run out-of-process using the default `SocketServer`,
ABCI messages from all connections will be linearizable (received one at a
time).

The existence of this global mutex means Go application developers can get
thread safety for application state by routing *all* reads and writes through the ABCI
system. Thus it may be *unsafe* to expose application state directly to an RPC
interface, and unless explicit measures are taken, all queries should be routed through the ABCI Query method.

### BeginBlock

The BeginBlock request can be used to run some code at the beginning of
every block. It also allows Tendermint to send the current block hash
and header to the application, before it sends any of the transactions.

The app should remember the latest height and header (ie. from which it
has run a successful Commit) so that it can tell Tendermint where to
pick up from when it restarts. See information on the Handshake, below.

### Commit

Application state should only be persisted to disk during `Commit`.

Before `Commit` is called, Tendermint locks and flushes the mempool so that no new messages will
be received on the mempool connection. This provides an opportunity to safely update all four connection
states to the latest committed state at once.

When `Commit` completes, it unlocks the mempool.

WARNING: if the ABCI app logic processing the `Commit` message sends a
`/broadcast_tx_sync` or `/broadcast_tx_commit` and waits for the response
before proceeding, it will deadlock. Executing those `broadcast_tx` calls
involves acquiring a lock that is held during the `Commit` call, so it's not
possible. If you make the call to the `broadcast_tx` endpoints concurrently,
that's no problem, it just can't be part of the sequential logic of the
`Commit` function.

### Consensus Connection

The Consensus Connection should maintain a `DeliverTxState` - the working state
for block execution. It should be updated by the calls to `BeginBlock`, `DeliverTx`,
and `EndBlock` during block execution and committed to disk as the "latest
committed state" during `Commit`.

Updates made to the `DeliverTxState` by each method call must be readable by each subsequent method -
ie. the updates are linearizable.

### Mempool Connection

The mempool Connection should maintain a `CheckTxState`
to sequentially process pending transactions in the mempool that have
not yet been committed. It should be initialized to the latest committed state
at the end of every `Commit`.

Before calling `Commit`, Tendermint will lock and flush the mempool connection,
ensuring that all existing CheckTx are responded to and no new ones can begin.
The `CheckTxState` may be updated concurrently with the `DeliverTxState`, as
messages may be sent concurrently on the Consensus and Mempool connections.

After `Commit`, while still holding the mempool lock, CheckTx is run again on all transactions that remain in the
node's local mempool after filtering those included in the block.
An additional `Type` parameter is made available to the CheckTx function that
indicates whether an incoming transaction is new (`CheckTxType_New`), or a
recheck (`CheckTxType_Recheck`).

Finally, after re-checking transactions in the mempool, Tendermint will unlock
the mempool connection. New transactions are once again able to be processed through CheckTx.

Note that CheckTx is just a weak filter to keep invalid transactions out of the block chain.
CheckTx doesn't have to check everything that affects transaction validity; the
expensive things can be skipped.  It's weak because a Byzantine node doesn't
care about CheckTx; it can propose a block full of invalid transactions if it wants.

#### Replay Protection

To prevent old transactions from being replayed, CheckTx must implement
replay protection.

It is possible for old transactions to be sent to the application. So
it is important CheckTx implements some logic to handle them.

### Query Connection

The Info Connection should maintain a `QueryState` for answering queries from the user,
and for initialization when Tendermint first starts up (both described further
below).
It should always contain the latest committed state associated with the
latest committed block.

`QueryState` should be set to the latest `DeliverTxState` at the end of every `Commit`,
after the full block has been processed and the state committed to disk.
Otherwise it should never be modified.

Tendermint Core currently uses the Query connection to filter peers upon
connecting, according to IP address or node ID. For instance,
returning non-OK ABCI response to either of the following queries will
cause Tendermint to not connect to the corresponding peer:

- `p2p/filter/addr/<ip addr>`, where `<ip addr>` is an IP address.
- `p2p/filter/id/<id>`, where `<is>` is the hex-encoded node ID (the hash of
  the node's p2p pubkey).

Note: these query formats are subject to change!

### Snapshot Connection

The Snapshot Connection is optional, and is only used to serve state sync snapshots for other nodes
and/or restore state sync snapshots to a local node being bootstrapped.

For more information, see [the state sync section of this document](#state-sync).

## Transaction Results

The `Info` and `Log` fields are non-deterministic values for debugging/convenience purposes
that are otherwise ignored.

The `Data` field must be strictly deterministic, but can be arbitrary data.

### Gas

Ethereum introduced the notion of `gas` as an abstract representation of the
cost of resources used by nodes when processing transactions. Every operation in the
Ethereum Virtual Machine uses some amount of gas, and gas can be accepted at a market-variable price.
Users propose a maximum amount of gas for their transaction; if the tx uses less, they get
the difference credited back. Tendermint adopts a similar abstraction,
though uses it only optionally and weakly, allowing applications to define
their own sense of the cost of execution.

In Tendermint, the [ConsensusParams.Block.MaxGas](../proto/types/params.proto) limits the amount of `gas` that can be used in a block.
The default value is `-1`, meaning no limit, or that the concept of gas is
meaningless.

Responses contain a `GasWanted` and `GasUsed` field. The former is the maximum
amount of gas the sender of a tx is willing to use, and the latter is how much it actually
used. Applications should enforce that `GasUsed <= GasWanted` - ie. tx execution
should halt before it can use more resources than it requested.

When `MaxGas > -1`, Tendermint enforces the following rules:

- `GasWanted <= MaxGas` for all txs in the mempool
- `(sum of GasWanted in a block) <= MaxGas` when proposing a block

If `MaxGas == -1`, no rules about gas are enforced.

Note that Tendermint does not currently enforce anything about Gas in the consensus, only the mempool.
This means it does not guarantee that committed blocks satisfy these rules!
It is the application's responsibility to return non-zero response codes when gas limits are exceeded.

The `GasUsed` field is ignored completely by Tendermint. That said, applications should enforce:

- `GasUsed <= GasWanted` for any given transaction
- `(sum of GasUsed in a block) <= MaxGas` for every block

In the future, we intend to add a `Priority` field to the responses that can be
used to explicitly prioritize txs in the mempool for inclusion in a block
proposal. See [#1861](https://github.com/tendermint/tendermint/issues/1861).

### CheckTx

If `Code != 0`, it will be rejected from the mempool and hence
not broadcasted to other peers and not included in a proposal block.

`Data` contains the result of the CheckTx transaction execution, if any. It is
semantically meaningless to Tendermint.

`Events` include any events for the execution, though since the transaction has not
been committed yet, they are effectively ignored by Tendermint.

### DeliverTx

DeliverTx is the workhorse of the blockchain. Tendermint sends the
DeliverTx requests asynchronously but in order, and relies on the
underlying socket protocol (ie. TCP) to ensure they are received by the
app in order. They have already been ordered in the global consensus by
the Tendermint protocol.

If DeliverTx returns `Code != 0`, the transaction will be considered invalid,
though it is still included in the block.

DeliverTx also returns a [Code, Data, and Log](../../proto/abci/types.proto#L189-L191).

`Data` contains the result of the CheckTx transaction execution, if any. It is
semantically meaningless to Tendermint.

Both the `Code` and `Data` are included in a structure that is hashed into the
`LastResultsHash` of the next block header.

`Events` include any events for the execution, which Tendermint will use to index
the transaction by. This allows transactions to be queried according to what
events took place during their execution.

## Updating the Validator Set

The application may set the validator set during InitChain, and may update it during
EndBlock.

Note that the maximum total power of the validator set is bounded by
`MaxTotalVotingPower = MaxInt64 / 8`. Applications are responsible for ensuring
they do not make changes to the validator set that cause it to exceed this
limit.

Additionally, applications must ensure that a single set of updates does not contain any duplicates -
a given public key can only appear once within a given update. If an update includes
duplicates, the block execution will fail irrecoverably.

### InitChain

The `InitChain` method can return a list of validators.
If the list is empty, Tendermint will use the validators loaded in the genesis
file.
If the list returned by `InitChain` is not empty, Tendermint will use its contents as the validator set.
This way the application can set the initial validator set for the
blockchain.

### EndBlock

Updates to the Tendermint validator set can be made by returning
`ValidatorUpdate` objects in the `ResponseEndBlock`:

```protobuf
message ValidatorUpdate {
  tendermint.crypto.keys.PublicKey pub_key
  int64 power
}

message PublicKey {
  oneof {
    ed25519 bytes = 1;
  }
```

The `pub_key` currently supports only one type:

- `type = "ed25519"`

The `power` is the new voting power for the validator, with the
following rules:

- power must be non-negative
- if power is 0, the validator must already exist, and will be removed from the
  validator set
- if power is non-0:
    - if the validator does not already exist, it will be added to the validator
    set with the given power
    - if the validator does already exist, its power will be adjusted to the given power
- the total power of the new validator set must not exceed MaxTotalVotingPower

Note the updates returned in block `H` will only take effect at block `H+2`.

## Consensus Parameters

ConsensusParams enforce certain limits in the blockchain, like the maximum size
of blocks, amount of gas used in a block, and the maximum acceptable age of
evidence. They can be set in InitChain and updated in EndBlock.

### BlockParams.MaxBytes

The maximum size of a complete Protobuf encoded block.
This is enforced by Tendermint consensus.

This implies a maximum transaction size that is this MaxBytes, less the expected size of
the header, the validator set, and any included evidence in the block.

Must have `0 < MaxBytes < 100 MB`.

### BlockParams.MaxGas

The maximum of the sum of `GasWanted` that will be allowed in a proposed block.
This is *not* enforced by Tendermint consensus.
It is left to the app to enforce (ie. if txs are included past the
limit, they should return non-zero codes). It is used by Tendermint to limit the
txs included in a proposed block.

Must have `MaxGas >= -1`.
If `MaxGas == -1`, no limit is enforced.

### EvidenceParams.MaxAgeDuration

This is the maximum age of evidence in time units.
This is enforced by Tendermint consensus.

If a block includes evidence older than this (AND the evidence was created more
than `MaxAgeNumBlocks` ago), the block will be rejected (validators won't vote
for it).

Must have `MaxAgeDuration > 0`.

### EvidenceParams.MaxAgeNumBlocks

This is the maximum age of evidence in blocks.
This is enforced by Tendermint consensus.

If a block includes evidence older than this (AND the evidence was created more
than `MaxAgeDuration` ago), the block will be rejected (validators won't vote
for it).

Must have `MaxAgeNumBlocks > 0`.

### EvidenceParams.MaxNum

This is the maximum number of evidence that can be committed to a single block.

The product of this and the `MaxEvidenceBytes` must not exceed the size of
a block minus it's overhead ( ~ `MaxBytes`).

Must have `MaxNum > 0`.

### Updates

The application may set the ConsensusParams during InitChain, and update them during
EndBlock. If the ConsensusParams is empty, it will be ignored. Each field
that is not empty will be applied in full. For instance, if updating the
Block.MaxBytes, applications must also set the other Block fields (like
Block.MaxGas), even if they are unchanged, as they will otherwise cause the
value to be updated to 0.

#### InitChain

ResponseInitChain includes a ConsensusParams.
If ConsensusParams is nil, Tendermint will use the params loaded in the genesis
file. If ConsensusParams is not nil, Tendermint will use it.
This way the application can determine the initial consensus params for the
blockchain.

#### EndBlock

ResponseEndBlock includes a ConsensusParams.
If ConsensusParams nil, Tendermint will do nothing.
If ConsensusParam is not nil, Tendermint will use it.
This way the application can update the consensus params over time.

Note the updates returned in block `H` will take effect right away for block
`H+1`.

## Query

Query is a generic method with lots of flexibility to enable diverse sets
of queries on application state. Tendermint makes use of Query to filter new peers
based on ID and IP, and exposes Query to the user over RPC.

Note that calls to Query are not replicated across nodes, but rather query the
local node's state - hence they may return stale reads. For reads that require
consensus, use a transaction.

The most important use of Query is to return Merkle proofs of the application state at some height
that can be used for efficient application-specific light-clients.

Note Tendermint has technically no requirements from the Query
message for normal operation - that is, the ABCI app developer need not implement
Query functionality if they do not wish too.

### Query Proofs

The Tendermint block header includes a number of hashes, each providing an
anchor for some type of proof about the blockchain. The `ValidatorsHash` enables
quick verification of the validator set, the `DataHash` gives quick
verification of the transactions included in the block, etc.

The `AppHash` is unique in that it is application specific, and allows for
application-specific Merkle proofs about the state of the application.
While some applications keep all relevant state in the transactions themselves
(like Bitcoin and its UTXOs), others maintain a separated state that is
computed deterministically *from* transactions, but is not contained directly in
the transactions themselves (like Ethereum contracts and accounts).
For such applications, the `AppHash` provides a much more efficient way to verify light-client proofs.

ABCI applications can take advantage of more efficient light-client proofs for
their state as follows:

- return the Merkle root of the deterministic application state in
`ResponseCommit.Data`. This Merkle root will be included as the `AppHash` in the next block.
- return efficient Merkle proofs about that application state in `ResponseQuery.Proof`
  that can be verified using the `AppHash` of the corresponding block.

For instance, this allows an application's light-client to verify proofs of
absence in the application state, something which is much less efficient to do using the block hash.

Some applications (eg. Ethereum, Cosmos-SDK) have multiple "levels" of Merkle trees,
where the leaves of one tree are the root hashes of others. To support this, and
the general variability in Merkle proofs, the `ResponseQuery.Proof` has some minimal structure:

```protobuf
message ProofOps {
  repeated ProofOp ops
}

message ProofOp {
  string type = 1;
  bytes key = 2;
  bytes data = 3;
}
```

Each `ProofOp` contains a proof for a single key in a single Merkle tree, of the specified `type`.
This allows ABCI to support many different kinds of Merkle trees, encoding
formats, and proofs (eg. of presence and absence) just by varying the `type`.
The `data` contains the actual encoded proof, encoded according to the `type`.
When verifying the full proof, the root hash for one ProofOp is the value being
verified for the next ProofOp in the list. The root hash of the final ProofOp in
the list should match the `AppHash` being verified against.

### Peer Filtering

When Tendermint connects to a peer, it sends two queries to the ABCI application
using the following paths, with no additional data:

- `/p2p/filter/addr/<IP:PORT>`, where `<IP:PORT>` denote the IP address and
  the port of the connection
- `p2p/filter/id/<ID>`, where `<ID>` is the peer node ID (ie. the
  pubkey.Address() for the peer's PubKey)

If either of these queries return a non-zero ABCI code, Tendermint will refuse
to connect to the peer.

### Paths

Queries are directed at paths, and may optionally include additional data.

The expectation is for there to be some number of high level paths
differentiating concerns, like `/p2p`, `/store`, and `/app`. Currently,
Tendermint only uses `/p2p`, for filtering peers. For more advanced use, see the
implementation of
[Query in the Cosmos-SDK](https://github.com/cosmos/cosmos-sdk/blob/v0.23.1/baseapp/baseapp.go#L333).

## Crash Recovery

On startup, Tendermint calls the `Info` method on the Info Connection to get the latest
committed state of the app. The app MUST return information consistent with the
last block it succesfully completed Commit for.

If the app succesfully committed block H, then `last_block_height = H` and `last_block_app_hash = <hash returned by Commit for block H>`. If the app
failed during the Commit of block H, then `last_block_height = H-1` and
`last_block_app_hash = <hash returned by Commit for block H-1, which is the hash in the header of block H>`.

We now distinguish three heights, and describe how Tendermint syncs itself with
the app.

```md
storeBlockHeight = height of the last block Tendermint saw a commit for
stateBlockHeight = height of the last block for which Tendermint completed all
    block processing and saved all ABCI results to disk
appBlockHeight = height of the last block for which ABCI app succesfully
    completed Commit

```

Note we always have `storeBlockHeight >= stateBlockHeight` and `storeBlockHeight >= appBlockHeight`
Note also Tendermint never calls Commit on an ABCI app twice for the same height.

The procedure is as follows.

First, some simple start conditions:

If `appBlockHeight == 0`, then call InitChain.

If `storeBlockHeight == 0`, we're done.

Now, some sanity checks:

If `storeBlockHeight < appBlockHeight`, error
If `storeBlockHeight < stateBlockHeight`, panic
If `storeBlockHeight > stateBlockHeight+1`, panic

Now, the meat:

If `storeBlockHeight == stateBlockHeight && appBlockHeight < storeBlockHeight`,
replay all blocks in full from `appBlockHeight` to `storeBlockHeight`.
This happens if we completed processing the block, but the app forgot its height.

If `storeBlockHeight == stateBlockHeight && appBlockHeight == storeBlockHeight`, we're done.
This happens if we crashed at an opportune spot.

If `storeBlockHeight == stateBlockHeight+1`
This happens if we started processing the block but didn't finish.

If `appBlockHeight < stateBlockHeight`
    replay all blocks in full from `appBlockHeight` to `storeBlockHeight-1`,
    and replay the block at `storeBlockHeight` using the WAL.
This happens if the app forgot the last block it committed.

If `appBlockHeight == stateBlockHeight`,
    replay the last block (storeBlockHeight) in full.
This happens if we crashed before the app finished Commit

If `appBlockHeight == storeBlockHeight`
    update the state using the saved ABCI responses but dont run the block against the real app.
This happens if we crashed after the app finished Commit but before Tendermint saved the state.

## State Sync

A new node joining the network can simply join consensus at the genesis height and replay all
historical blocks until it is caught up. However, for large chains this can take a significant
amount of time, often on the order of days or weeks.

State sync is an alternative mechanism for bootstrapping a new node, where it fetches a snapshot
of the state machine at a given height and restores it. Depending on the application, this can
be several orders of magnitude faster than replaying blocks.

Note that state sync does not currently backfill historical blocks, so the node will have a
truncated block history - users are advised to consider the broader network implications of this in
terms of block availability and auditability. This functionality may be added in the future.

For details on the specific ABCI calls and types, see the [methods and types section](abci.md).

### Taking Snapshots

Applications that want to support state syncing must take state snapshots at regular intervals. How
this is accomplished is entirely up to the application. A snapshot consists of some metadata and
a set of binary chunks in an arbitrary format:

- `Height (uint64)`: The height at which the snapshot is taken. It must be taken after the given
  height has been committed, and must not contain data from any later heights.

- `Format (uint32)`: An arbitrary snapshot format identifier. This can be used to version snapshot
  formats, e.g. to switch from Protobuf to MessagePack for serialization. The application can use
  this when restoring to choose whether to accept or reject a snapshot.

- `Chunks (uint32)`: The number of chunks in the snapshot. Each chunk contains arbitrary binary
  data, and should be less than 16 MB; 10 MB is a good starting point.

- `Hash ([]byte)`: An arbitrary hash of the snapshot. This is used to check whether a snapshot is
  the same across nodes when downloading chunks.

- `Metadata ([]byte)`: Arbitrary snapshot metadata, e.g. chunk hashes for verification or any other
  necessary info.

For a snapshot to be considered the same across nodes, all of these fields must be identical. When
sent across the network, snapshot metadata messages are limited to 4 MB.

When a new node is running state sync and discovering snapshots, Tendermint will query an existing
application via the ABCI `ListSnapshots` method to discover available snapshots, and load binary
snapshot chunks via `LoadSnapshotChunk`. The application is free to choose how to implement this
and which formats to use, but must provide the following guarantees:

- **Consistent:** A snapshot must be taken at a single isolated height, unaffected by
  concurrent writes. This can be accomplished by using a data store that supports ACID
  transactions with snapshot isolation.

- **Asynchronous:** Taking a snapshot can be time-consuming, so it must not halt chain progress,
  for example by running in a separate thread.

- **Deterministic:** A snapshot taken at the same height in the same format must be identical
  (at the byte level) across nodes, including all metadata. This ensures good availability of
  chunks, and that they fit together across nodes.

A very basic approach might be to use a datastore with MVCC transactions (such as RocksDB),
start a transaction immediately after block commit, and spawn a new thread which is passed the
transaction handle. This thread can then export all data items, serialize them using e.g.
Protobuf, hash the byte stream, split it into chunks, and store the chunks in the file system
along with some metadata - all while the blockchain is applying new blocks in parallel.

A more advanced approach might include incremental verification of individual chunks against the
chain app hash, parallel or batched exports, compression, and so on.

Old snapshots should be removed after some time - generally only the last two snapshots are needed
(to prevent the last one from being removed while a node is restoring it).

### Bootstrapping a Node

An empty node can be state synced by setting the configuration option `statesync.enabled =
true`. The node also needs the chain genesis file for basic chain info, and configuration for
light client verification of the restored snapshot: a set of Tendermint RPC servers, and a
trusted header hash and corresponding height from a trusted source, via the `statesync`
configuration section.

Once started, the node will connect to the P2P network and begin discovering snapshots. These
will be offered to the local application via the `OfferSnapshot` ABCI method. Once a snapshot
is accepted Tendermint will fetch and apply the snapshot chunks. After all chunks have been
successfully applied, Tendermint verifies the app's `AppHash` against the chain using the light
client, then switches the node to normal consensus operation.

#### Snapshot Discovery

When the empty node join the P2P network, it asks all peers to report snapshots via the
`ListSnapshots` ABCI call (limited to 10 per node). After some time, the node picks the most
suitable snapshot (generally prioritized by height, format, and number of peers), and offers it
to the application via `OfferSnapshot`. The application can choose a number of responses,
including accepting or rejecting it, rejecting the offered format, rejecting the peer who sent
it, and so on. Tendermint will keep discovering and offering snapshots until one is accepted or
the application aborts.

#### Snapshot Restoration

Once a snapshot has been accepted via `OfferSnapshot`, Tendermint begins downloading chunks from
any peers that have the same snapshot (i.e. that have identical metadata fields). Chunks are
spooled in a temporary directory, and then given to the application in sequential order via
`ApplySnapshotChunk` until all chunks have been accepted.

The method for restoring snapshot chunks is entirely up to the application.

During restoration, the application can respond to `ApplySnapshotChunk` with instructions for how
to continue. This will typically be to accept the chunk and await the next one, but it can also
ask for chunks to be refetched (either the current one or any number of previous ones), P2P peers
to be banned, snapshots to be rejected or retried, and a number of other responses - see the ABCI
reference for details.

If Tendermint fails to fetch a chunk after some time, it will reject the snapshot and try a
different one via `OfferSnapshot` - the application can choose whether it wants to support
restarting restoration, or simply abort with an error.

#### Snapshot Verification

Once all chunks have been accepted, Tendermint issues an `Info` ABCI call to retrieve the
`LastBlockAppHash`. This is compared with the trusted app hash from the chain, retrieved and
verified using the light client. Tendermint also checks that `LastBlockHeight` corresponds to the
height of the snapshot.

This verification ensures that an application is valid before joining the network. However, the
snapshot restoration may take a long time to complete, so applications may want to employ additional
verification during the restore to detect failures early. This might e.g. include incremental
verification of each chunk against the app hash (using bundled Merkle proofs), checksums to
protect against data corruption by the disk or network, and so on. However, it is important to
note that the only trusted information available is the app hash, and all other snapshot metadata
can be spoofed by adversaries.

Apps may also want to consider state sync denial-of-service vectors, where adversaries provide
invalid or harmful snapshots to prevent nodes from joining the network. The application can
counteract this by asking Tendermint to ban peers. As a last resort, node operators can use
P2P configuration options to whitelist a set of trusted peers that can provide valid snapshots.

#### Transition to Consensus

Once the snapshots have all been restored, Tendermint gathers additional information necessary for
bootstrapping the node (e.g. chain ID, consensus parameters, validator sets, and block headers)
from the genesis file and light client RPC servers. It also fetches and records the `AppVersion`
from the ABCI application.

Once the state machine has been restored and Tendermint has gathered this additional
information, it transitions to block sync (if enabled) to fetch any remaining blocks up the chain
head, and then transitions to regular consensus operation. At this point the node operates like
any other node, apart from having a truncated block history at the height of the restored snapshot.
