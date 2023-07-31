# 方法和类型

## 连接

ABCI应用程序可以在Tendermint状态机复制引擎的**同一进程**中运行，也可以作为**独立的**进程与状态机复制引擎分开运行。当在同一进程中运行时，Tendermint将直接调用ABCI应用程序方法作为Go方法调用。

当Tendermint和ABCI应用程序作为独立进程运行时，Tendermint会为ABCI方法打开四个连接。每个连接处理ABCI方法调用的一个子集。这些子集定义如下：

#### **共识**连接

* 由共识协议驱动，负责块执行。
* 处理`InitChain`、`BeginBlock`、`DeliverTx`、`EndBlock`和`Commit`方法调用。

#### **内存池**连接

* 用于验证新的交易，以防它们在共享或包含在块中之前。
* 处理`CheckTx`调用。

#### **信息**连接

* 用于初始化和用户查询。
* 处理`Info`和`Query`调用。

#### **快照**连接

* 用于提供和恢复[状态同步快照](apps.md#state-sync)。
* 处理`ListSnapshots`、`LoadSnapshotChunk`、`OfferSnapshot`和`ApplySnapshotChunk`调用。

此外，每个连接都有一个`Flush`方法，在每个连接上调用，还有一个`Echo`方法，仅用于调试。

有关跨连接管理状态的更多详细信息，请参阅[ABCI应用程序](apps.md)部分。

## 错误

`Query`、`CheckTx`和`DeliverTx`方法在其`Response*`中包含一个`Code`字段。该字段用于包含特定于应用程序的响应代码。响应代码为`0`表示没有错误。任何其他响应代码表示向Tendermint发生了错误。

这些方法还向Tendermint返回一个`Codespace`字符串。该字段用于消除应用程序不同领域返回的`Code`值之间的歧义。`Codespace`是`Code`的命名空间。

`Echo`、`Info`、`InitChain`、`BeginBlock`、`EndBlock`、`Commit`方法不返回错误。这些方法中的任何错误都表示Tendermint无法合理处理的关键问题。如果其中一个方法出现错误，应用程序必须崩溃，以确保错误能够被操作员安全处理。

Tendermint对非零响应代码的处理如下所述

### CheckTx

`CheckTx` ABCI方法控制哪些交易被考虑包含在一个区块中。
当Tendermint收到一个具有非零`Code`的`ResponseCheckTx`时，相关的交易将不会被添加到Tendermint的内存池中，或者如果已经包含，则会被移除。

### DeliverTx

`DeliverTx` ABCI方法将交易从Tendermint传递给应用程序。
当Tendermint收到一个具有非零`Code`的`ResponseDeliverTx`时，响应代码将被记录。
该交易已经包含在一个区块中，因此`Code`不会影响Tendermint的共识。

### Query

`Query` ABCI方法用于查询应用程序的应用状态信息。
当Tendermint收到一个具有非零`Code`的`ResponseQuery`时，该代码将直接返回给发起查询的客户端。

## 事件

`CheckTx`、`BeginBlock`、`DeliverTx`、`EndBlock`方法在它们的`Response*`中包含一个`Events`字段。应用程序可以通过一组事件响应这些ABCI方法。
事件允许应用程序将关于ABCI方法执行的元数据与相关的交易和区块关联起来。
通过这些ABCI方法返回的事件不会以任何方式影响Tendermint的共识，而是用于支持Tendermint状态的订阅和查询。

一个`Event`包含一个`type`和一组`EventAttributes`，它们是键值对字符串，表示方法执行期间发生的元数据。
`Event`的值可以根据其执行期间发生的情况对交易和区块进行索引。请注意，从`BeginBlock`和`EndBlock`返回的事件集将被合并。
如果两个方法返回相同的键，只使用`EndBlock`中定义的值。

每个事件都有一个`type`，用于对特定的`Response*`或`Tx`进行分类。
`Response*`或`Tx`可能包含多个具有重复`type`值的事件，其中每个不同的条目用于对特定事件的属性进行分类。
事件的每个键和值都必须是UTF-8编码的字符串，包括事件类型本身。

```protobuf
message Event {
  string                  type       = 1;
  repeated EventAttribute attributes = 2;
}
```

`Event`的属性包括`key`、`value`和`index`标志。`index`标志通知Tendermint索引器对该属性进行索引。`index`标志的值是非确定性的，可能在网络中的不同节点之间有所不同。

```protobuf
message EventAttribute {
  bytes key   = 1;
  bytes value = 2;
  bool  index = 3;  // nondeterministic
}
```

示例：

```go
 abci.ResponseDeliverTx{
  // ...
 Events: []abci.Event{
  {
   Type: "validator.provisions",
   Attributes: []abci.EventAttribute{
    abci.EventAttribute{Key: []byte("address"), Value: []byte("..."), Index: true},
    abci.EventAttribute{Key: []byte("amount"), Value: []byte("..."), Index: true},
    abci.EventAttribute{Key: []byte("balance"), Value: []byte("..."), Index: true},
   },
  },
  {
   Type: "validator.provisions",
   Attributes: []abci.EventAttribute{
    abci.EventAttribute{Key: []byte("address"), Value: []byte("..."), Index: true},
    abci.EventAttribute{Key: []byte("amount"), Value: []byte("..."), Index: false},
    abci.EventAttribute{Key: []byte("balance"), Value: []byte("..."), Index: false},
   },
  },
  {
   Type: "validator.slashed",
   Attributes: []abci.EventAttribute{
    abci.EventAttribute{Key: []byte("address"), Value: []byte("..."), Index: false},
    abci.EventAttribute{Key: []byte("amount"), Value: []byte("..."), Index: true},
    abci.EventAttribute{Key: []byte("reason"), Value: []byte("..."), Index: true},
   },
  },
  // ...
 },
}
```

## EvidenceType

Tendermint的安全模型依赖于“证据”。证据是网络参与者恶意行为的证明。Tendermint有责任检测此类恶意行为。当检测到恶意行为时，Tendermint将向其他节点传播该行为的证据，并在所有验证者验证通过后将证据提交到链上。然后，通过ABCI将此证据传递给应用程序。应用程序有责任处理证据并进行惩罚。

EvidenceType的protobuf格式如下：

```proto
enum EvidenceType {
  UNKNOWN               = 0;
  DUPLICATE_VOTE        = 1;
  LIGHT_CLIENT_ATTACK   = 2;
}
```

有两种形式的证据：重复投票和轻客户端攻击。更多信息可以在[data structures](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/core/data_structures.md)或[accountability](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/light-client/accountability/)中找到。

## 确定性

ABCI应用程序必须实现确定性有限状态机，以便由Tendermint共识引擎进行安全复制。这意味着在共识连接上的块执行必须严格确定性：给定相同的请求有序集，所有节点将计算出相同的响应，对于所有的BeginBlock、DeliverTx、EndBlock和Commit。这是至关重要的，因为响应将包含在下一个块的头部中，通过Merkle根或直接方式，因此所有节点必须就响应达成一致。

因此，建议应用程序除了通过与Tendermint Core等共识引擎的ABCI连接之外，不要与任何外部用户或进程接触。应用程序只能根据块执行（BeginBlock、DeliverTx、EndBlock、Commit）的输入来更改其状态，而不能通过任何其他类型的请求来更改。这是确保所有节点看到相同交易并计算相同结果的唯一方法。

如果状态机中存在一些非确定性，节点对区块头的正确值将产生分歧，导致共识最终失败。必须修复非确定性并重新启动节点。

应用程序中非确定性的来源可能包括：

* 硬件故障
    * 宇宙射线、过热等
* 节点相关状态
    * 随机数
    * 时间
* 规范不明确
    * 库版本更改
    * 竞争条件
    * 浮点数
    * JSON序列化
    * 遍历哈希表/映射/字典
* 外部来源
    * 文件系统
    * 网络调用（例如某些外部REST API服务）

有关原始讨论，请参见[#56](https://github.com/tendermint/abci/issues/56)。

请注意，某些方法（`Query, CheckTx, DeliverTx`）以`Info`和`Log`字段的形式返回明确的非确定性数据。`Log`用于应用程序记录器的文字输出，而`Info`是应返回的任何其他信息。这些是不包括在区块头计算中的唯一字段，因此我们不需要对它们达成一致。`Response*`中的所有其他字段必须严格确定性。

## 区块执行

在首次启动新的区块链时，Tendermint调用`InitChain`。从那时起，对于每个区块，按照以下方法序列执行：

`BeginBlock, [DeliverTx], EndBlock, Commit`

其中，对于区块中的每个交易，都会调用一次`DeliverTx`。结果是一个更新后的应用程序状态。
对于DeliverTx、EndBlock和Commit的结果的密码学承诺将包含在下一个区块的头中。

## 状态同步

状态同步允许新节点通过发现、获取和应用状态机快照来快速引导，而不是重放历史区块。有关详细信息，请参见[state sync section](../spec/p2p/messages/state-sync.md)。

新节点将在P2P网络中发现并请求其他节点的快照。接收到来自对等节点的快照请求的Tendermint节点将调用其应用程序上的`ListSnapshots`来检索任何本地状态快照。在从对等节点接收到快照后，新节点将通过`OfferSnapshot`方法将每个从对等节点接收到的快照提供给其本地应用程序。

快照可能非常大，因此被分成较小的“块”，可以将它们组装成完整的快照。一旦应用程序接受快照并开始恢复它，Tendermint将从现有节点获取快照“块”。提供“块”的节点将使用`LoadSnapshotChunk`方法从其本地应用程序获取它们。

当新节点接收到“块”时，它将使用`ApplySnapshotChunk`将它们按顺序应用于本地应用程序。当所有块都被应用后，通过`Info`查询检索`AppHash`。然后将`AppHash`与区块链的`AppHash`进行比较，通过[轻客户端验证](../spec/light-client/verification/README.md)进行验证。

## 消息

### Echo

* **请求**：
    * `Message (string)`: 要回显的字符串
* **响应**：
    * `Message (string)`: 输入字符串
* **用法**：
    * 回显字符串以测试 abci 客户端/服务器实现

### Flush

* **用法**：
    * 表示应刷新客户端上排队的消息以发送到服务器。客户端实现会定期调用它以确保异步请求实际上被发送，并且在进行同步请求时立即调用它，当 Flush 响应返回时返回。

### Info

* **请求**：

    | 名称           | 类型    | 描述                                      | 字段编号 |
    |----------------|---------|------------------------------------------|----------|
    | version        | string  | Tendermint 软件的语义版本                 | 1        |
    | block_version  | uint64  | Tendermint 块协议的版本                   | 2        |
    | p2p_version    | uint64  | Tendermint P2P 协议的版本                 | 3        |
    | abci_version   | string  | Tendermint ABCI 的语义版本                | 4        |

* **响应**：
  
    | 名称                 | 类型    | 描述                                      | 字段编号 |
    |----------------------|---------|------------------------------------------|----------|
    | data                 | string  | 一些任意的信息                            | 1        |
    | version              | string  | 应用程序软件的语义版本                    | 2        |
    | app_version          | uint64  | 应用程序协议的版本                        | 3        |
    | last_block_height    | int64   | 应用程序已调用 Commit 的最新块高度        | 4        |
    | last_block_app_hash  | bytes   | Commit 的最新结果                          | 5        |

* **用法**：
    * 返回有关应用程序状态的信息。
    * 用于在启动时进行与应用程序的握手同步Tendermint。
    * 返回的`app_version`将包含在每个块的头部中。
    * Tendermint期望在`Commit`期间更新`last_block_app_hash`和`last_block_height`，以确保`Commit`不会对相同的块高度调用两次。

> 注意：语义版本是对[语义化版本](https://semver.org/)的引用。信息中的语义版本将显示为X.X.x。

### InitChain

* **请求**：

    | 名称             | 类型                                                                                                                                 | 描述                                         | 字段编号 |
    |------------------|--------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------|--------------|
    | time             | [google.protobuf.Timestamp](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.Timestamp) | 创世时间                                        | 1            |
    | chain_id         | string                                                                                                                               | 区块链的ID                               | 2            |
    | consensus_params | [ConsensusParams](#consensusparams)                                                                                                  | 初始共识关键参数              | 3            |
    | validators       | repeated [ValidatorUpdate](#validatorupdate)                                                                                         | 初始创世验证人，按投票权排序。 | 4            |
    | app_state_bytes  | bytes                                                                                                                                | 序列化的初始应用程序状态。JSON字节。   | 5            |
    | initial_height   | int64                                                                                                                                | 初始块的高度（通常为`1`）。        | 6            |

* **响应**：

    | 名称              | 类型                                          | 描述                                            | 字段编号 |
    |------------------|----------------------------------------------|-------------------------------------------------|--------------|
    | consensus_params | [ConsensusParams](#consensusparams)          | 初始的共识关键参数（可选）                        | 1            |
    | validators       | 重复的 [ValidatorUpdate](#validatorupdate)    | 初始的验证人集合（可选）                          | 2            |
    | app_hash         | 字节                                          | 初始的应用哈希                                  | 3            |

* **用法**：
    * 在创世时调用一次。
    * 如果 ResponseInitChain.Validators 为空，则初始的验证人集合将是 RequestInitChain.Validators。
    * 如果 ResponseInitChain.Validators 不为空，则它将是初始的验证人集合（不管 RequestInitChain.Validators 中有什么）。
    * 这允许应用程序决定是否接受 tendermint 提议的初始验证人集合（即在创世文件中），或者是否使用不同的验证人集合（可能基于创世文件中的某些应用程序特定信息计算得出）。

### 查询

* **请求**：
  
    | 名称   | 类型   | 描述                                                                                                                                                                                                                                                                            | 字段编号 |
    |--------|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | data   | 字节   | 原始查询字节。可以与 Path 一起使用或代替。                                                                                                                                                                                                                                  | 1            |
    | path   | 字符串 | 请求 URI 的路径字段。可以与 data 一起使用或代替。应用程序必须将 `/store` 解释为对底层存储的按键查询。键应该在 data 字段中指定。应用程序应该允许对特定类型的查询，如 `/accounts/...` 或 `/votes/...` | 2            |
    | height | int64  | 您想要查询的块高度（默认为0，返回最新提交块的数据）。请注意，这是包含应用程序 Merkle 根哈希的块的高度，该哈希表示在提交 Height-1 块后的状态。            | 3            |
    | prove  | bool   | 如果可能，返回带有 Merkle 证明的响应。                                                                                                                                                                                                                                          | 4            |

* **响应**：

    | 名称       | 类型                  | 描述                                                                                                                                                                                                                   | 字段编号 |
    |-----------|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | code      | uint32                | 响应代码。                                                                                                                                                                                                             | 1            |
    | log       | string                | 应用程序日志的输出。**可能是非确定性的**。                                                                                                                                                                              | 3            |
    | info      | string                | 附加信息。**可能是非确定性的**。                                                                                                                                                                                        | 4            |
    | index     | int64                 | 键在树中的索引。                                                                                                                                                                                                       | 5            |
    | key       | bytes                 | 匹配数据的键。                                                                                                                                                                                                         | 6            |
    | value     | bytes                 | 匹配数据的值。                                                                                                                                                                                                         | 7            |
    | proof_ops | [ProofOps](#proofops) | 序列化的证明，用于验证请求的值数据与给定高度的`app_hash`是否匹配。                                                                                                                                                       | 8            |
    | height    | int64                 | 数据派生自的块高度。请注意，这是包含应用程序 Merkle 根哈希的块的高度，该哈希表示状态在提交 Height-1 的块后的状态。                                                                                                        | 9            |
    | codespace | string                | `code` 的命名空间。                                                                                                                                                                                                    | 10           |

* **用法**：
    * 查询当前或过去高度的应用程序数据。
    * 可选择返回 Merkle 证明。
    * Merkle 证明包括自描述的 `type` 字段，以支持多种类型的 Merkle 树和编码格式。

### BeginBlock

* **请求**：

    | 名称                 | 类型                                          | 描述                                                                                                             | 字段编号 |
    |----------------------|-----------------------------------------------|------------------------------------------------------------------------------------------------------------------|----------|
    | hash                 | 字节                                          | 区块的哈希。可以从区块头派生出来。                                                                                   | 1        |
    | header               | [Header](../core/data_structures.md#header)   | 区块头。                                                                                                         | 2        |
    | last_commit_info     | [LastCommitInfo](#lastcommitinfo)             | 关于最后一次提交的信息，包括轮次、验证人列表以及哪些验证人签署了最后一个区块。                                      | 3        |
    | byzantine_validators | 重复的 [Evidence](#evidence)                   | 行为恶意的验证人的证据列表。                                                                                       | 4        |

* **响应**：

    | 名称   | 类型                            | 描述                               | 字段编号 |
    |--------|---------------------------------|-----------------------------------|----------|
    | events | 重复的 [Event](#events)         | 用于索引的类型和键值事件             | 1        |

* **用法**：
    * 表示新区块的开始。
    * 在任何 `DeliverTx` 方法调用之前调用。
    * 区块头包含高度、时间戳等信息，与 Tendermint 区块头完全匹配。我们可能会在将来对此进行泛化。
    * `LastCommitInfo` 和 `ByzantineValidators` 可用于确定验证人的奖励和惩罚。

### CheckTx

* **请求**：

    | 名称  | 类型        | 描述                                                                                                                                                                                                                                         | 字段编号 |
    |------|-------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
    | tx   | bytes       | 请求的交易字节                                                                                                                                                                                                                               | 1        |
    | type | CheckTxType | `CheckTx_New` 或 `CheckTx_Recheck` 中的一个。`CheckTx_New` 是默认值，表示需要对交易进行完整检查。`CheckTx_Recheck` 类型用于当内存池正在对交易进行正常的重新检查时。                                                                                   | 2        |

* **响应**：

    | 名称       | 类型                      | 描述                                                           | 字段编号 |
    |------------|---------------------------|---------------------------------------------------------------|----------|
    | code       | uint32                    | 响应代码                                                        | 1        |
    | data       | bytes                     | 结果字节，如果有的话                                             | 2        |
    | log        | string                    | 应用程序日志的输出。**可能是非确定性的。**                        | 3        |
    | info       | string                    | 附加信息。**可能是非确定性的。**                                  | 4        |
    | gas_wanted | int64                     | 交易请求的燃料数量                                               | 5        |
    | gas_used   | int64                     | 交易消耗的燃料数量                                               | 6        |
    | events     | repeated [Event](#events) | 用于索引交易的类型和键值事件（例如按账户）。                     | 7        |
    | codespace  | string                    | `code` 的命名空间                                                | 8        |
    | sender     | string                    | 交易的发送者（例如签名者）                                        | 9        |
    | priority   | int64                     | 交易的优先级（用于内存池排序）                                    | 10       |

* **使用方法**：

    * 从技术上讲是可选的 - 不参与处理区块。
    * 是内存池的守护者：每个节点在将交易放入本地内存池之前都会运行`CheckTx`。
    * 交易可以来自外部用户或其他节点。
    * `CheckTx`根据应用程序的当前状态验证交易，例如检查签名和账户余额，但不应用交易中描述的任何状态更改。
    * 不运行虚拟机中的代码。
    * `ResponseCheckTx.Code != 0`的交易将被拒绝 - 它们不会被广播到其他节点或包含在提案区块中。
    * Tendermint对响应代码不做任何其他处理。

### DeliverTx

* **请求**：

    | 名称 | 类型  | 描述                          | 字段编号 |
    |------|-------|-------------------------------|----------|
    | tx   | bytes | 请求的交易字节                | 1        |

* **响应**：

    | 名称       | 类型                      | 描述                                                                 | 字段编号 |
    |------------|---------------------------|----------------------------------------------------------------------|----------|
    | code       | uint32                    | 响应代码                                                              | 1        |
    | data       | bytes                     | 结果字节，如果有的话                                                  | 2        |
    | log        | string                    | 应用程序日志的输出。**可能是非确定性的。**                             | 3        |
    | info       | string                    | 附加信息。**可能是非确定性的。**                                       | 4        |
    | gas_wanted | int64                     | 交易请求的燃料数量                                                    | 5        |
    | gas_used   | int64                     | 交易消耗的燃料数量                                                    | 6        |
    | events     | repeated [Event](#events) | 用于索引交易的类型和键值事件（例如按账户索引）。                       | 7        |
    | codespace  | string                    | `code`的命名空间                                                      | 8        |

* **用法**：
    * [**必需**] 应用程序的核心方法。
    * 当调用 `DeliverTx` 时，应用程序必须在完全执行事务之后才能将控制权返回给 Tendermint。
    * 只有当事务完全有效时，`ResponseDeliverTx.Code == 0`。

### EndBlock

* **请求**：

    | 名称    | 类型   | 描述                              | 字段编号 |
    |---------|--------|-----------------------------------|----------|
    | height  | int64  | 刚刚执行的区块的高度。            | 1        |

* **响应**：

    | 名称                    | 类型                                                | 描述                                                         | 字段编号 |
    |-------------------------|-----------------------------------------------------|-------------------------------------------------------------|----------|
    | validator_updates       | 重复的 [ValidatorUpdate](#validatorupdate)           | 验证器集合的更改（将投票权设置为0以删除）。                  | 1        |
    | consensus_param_updates | [ConsensusParams](#consensusparams)                  | 对共识关键时间、大小和其他参数的更改。                       | 2        |
    | events                  | 重复的 [Event](#events)                              | 用于索引的类型和键值事件。                                   | 3        |

* **用法**：
    * 表示一个区块的结束。
    * 在当前区块的所有事务已交付之后，在区块的 `Commit` 消息之前调用。
    * 可选的由区块 `H` 触发的 `validator_updates`。这些更新会影响 `H+1`、`H+2` 和 `H+3` 的验证。
    * 随后的高度受到验证器更新的影响：
        * `H+1`：`NextValidatorsHash` 包括新的 `validator_updates` 值。
        * `H+2`：验证器集合更改生效，并更新 `ValidatorsHash`。
        * `H+3`：`LastCommitInfo` 被更改以包括更改后的验证器集合。
    * 返回给区块 `H` 的 `consensus_param_updates` 适用于区块 `H+1` 的共识参数。有关共识参数的更多信息，请参阅[共识参数的应用程序规范条目](../spec/abci/apps.md#consensus-parameters)。

### 提交

* **请求**：

    | 名称          | 类型   | 描述                               | 字段编号     |
    |--------------|--------|-----------------------------------|--------------|
    |              |        |                                   |              |

    提交信号应用程序持久化应用程序状态。它不需要任何参数。
* **响应**：

    | 名称            | 类型   | 描述                                                         | 字段编号     |
    |-----------------|--------|-------------------------------------------------------------|--------------|
    | data            | 字节   | 应用程序状态的 Merkle 根哈希。                               | 2            |
    | retain_height   | int64  | 可以删除低于此高度的区块。默认为 `0`（保留全部）。           | 3            |

* **用法**：
    * 发出信号，要求应用程序持久化应用程序状态。
    * 返回应用程序状态的（可选）Merkle 根哈希。
    * `ResponseCommit.Data` 包含在下一个区块的 `Header.AppHash` 中
        * 它可以为空
    * 后续对 `Query` 的调用可以返回与此 Merkle 根哈希锚定的应用程序状态的证明
    * 注意开发人员可以在此处返回任何他们想要的内容（可以是空的，或者是一个常量字符串等），只要它是确定性的 - 它不能是任何来自 `BeginBlock/DeliverTx/EndBlock` 方法之外的东西的函数。
    * 谨慎使用 `RetainHeight`！如果网络中的所有节点都删除历史区块，那么这些数据将永久丢失，并且新节点将无法加入网络和引导。历史区块也可能需要用于其他目的，例如审计、回放非持久化高度、轻客户端验证等等。

### 列出快照

* **请求**：

    | 名称          | 类型   | 描述                               | 字段编号     |
    |--------------|--------|-----------------------------------|--------------|

    空请求，向应用程序请求快照列表。

* **响应**：

    | 名称          | 类型                           | 描述                           | 字段编号     |
    |--------------|--------------------------------|-------------------------------|--------------|
    | snapshots    | 重复项 [Snapshot](#snapshot)   | 本地状态快照列表。             | 1            |

* **用法**：
    * 在状态同步期间用于发现对等节点上可用的快照。
    * 有关详细信息，请参阅`Snapshot`数据类型。

### LoadSnapshotChunk

* **请求**：

    | 名称    | 类型    | 描述                                                         | 字段编号 |
    |---------|---------|-------------------------------------------------------------|----------|
    | height  | uint64  | 快照所属的高度。                                             | 1        |
    | format  | uint32  | 快照块所属的应用程序特定格式。                               | 2        |
    | chunk   | uint32  | 快照块的索引，从初始块开始为`0`。                            | 3        |

* **响应**：

    | 名称   | 类型   | 描述                                                                                                 | 字段编号 |
    |--------|--------|-----------------------------------------------------------------------------------------------------|----------|
    | chunk  | bytes  | 二进制块内容，以任意格式。快照块消息的大小不能超过16 MB（包括元数据），因此10 MB 是一个很好的起点。 | 1        |

* **用法**：
    * 在状态同步期间用于从对等节点检索快照块。

### OfferSnapshot

* **请求**：

    | 名称       | 类型                  | 描述                                                         | 字段编号 |
    |------------|-----------------------|-------------------------------------------------------------|----------|
    | snapshot   | [Snapshot](#snapshot) | 提供用于恢复的快照。                                         | 1        |
    | app_hash   | bytes                 | 从区块链中轻客户端验证的此高度的应用哈希。                   | 2        |

* **响应**：

    | 名称     | 类型              | 描述                           | 字段编号 |
    |----------|-------------------|-------------------------------|----------|
    | result   | [Result](#result) | 快照提供的结果。               | 1        |

#### 结果

```proto
  enum Result {
    UNKNOWN       = 0;  // Unknown result, abort all snapshot restoration
    ACCEPT        = 1;  // Snapshot is accepted, start applying chunks.
    ABORT         = 2;  // Abort snapshot restoration, and don't try any other snapshots.
    REJECT        = 3;  // Reject this specific snapshot, try others.
    REJECT_FORMAT = 4;  // Reject all snapshots with this `format`, try others.
    REJECT_SENDER = 5;  // Reject all snapshots from all senders of this snapshot, try others.
  }
```

* **用法**：
    * 在使用状态同步引导节点时，会调用`OfferSnapshot`函数。应用程序可以根据需要接受或拒绝快照。接受后，Tendermint将通过`ApplySnapshotChunk`检索并应用快照块。应用程序还可以选择在块响应中拒绝快照，在这种情况下，应准备接受进一步的`OfferSnapshot`调用。
    * 只有`AppHash`是可信的，因为它已经由轻客户端进行了验证。其他任何数据都可以被对手伪造，因此应用程序应采用其他验证方案以避免拒绝服务攻击。在快照恢复结束时，验证的`AppHash`将自动与恢复的应用程序进行检查。
    * 更多信息，请参阅`Snapshot`数据类型或[state sync section](../spec/p2p/messages/state-sync.md)。

### ApplySnapshotChunk

* **请求**：

    | 名称    | 类型    | 描述                                                                 | 字段编号 |
    |---------|---------|----------------------------------------------------------------------|----------|
    | index   | uint32  | 块索引，从`0`开始。Tendermint按顺序应用块。                          | 1        |
    | chunk   | bytes   | 二进制块内容，由`LoadSnapshotChunk`返回。                            | 2        |
    | sender  | string  | 发送此块的节点的P2P ID。                                              | 3        |

* **响应**：

    | 名称             | 类型                 | 描述                                                                                                                      | 字段编号 |
    |------------------|----------------------|--------------------------------------------------------------------------------------------------------------------------|----------|
    | result           | Result  (见下文)      | 应用此块的结果。                                                                                                           | 1        |
    | refetch_chunks   | repeated uint32      | 重新获取并重新应用给定的块，无论`result`如何。只有列出的块将被重新获取，并按顺序重新应用。                                    | 2        |
    | reject_senders   | repeated string      | 拒绝给定的P2P发送者，无论`Result`如何。除非明确请求，否则不会重新获取已应用的任何块，但会丢弃来自这些发送者的排队块，并拒绝新的块或其他快照。 | 3        |

```proto
  enum Result {
    UNKNOWN         = 0;  // Unknown result, abort all snapshot restoration
    ACCEPT          = 1;  // The chunk was accepted.
    ABORT           = 2;  // Abort snapshot restoration, and don't try any other snapshots.
    RETRY           = 3;  // Reapply this chunk, combine with `RefetchChunks` and `RejectSenders` as appropriate.
    RETRY_SNAPSHOT  = 4;  // Restart this snapshot from `OfferSnapshot`, reusing chunks unless instructed otherwise.
    REJECT_SNAPSHOT = 5;  // Reject this snapshot, try a different one.
  }
```

* **用法**：
    * 应用程序可以选择适当时重新获取块和/或禁止P2P节点。Tendermint不会在没有应用程序指示的情况下执行此操作。
    * 应用程序可能希望验证每个块，例如通过在`Snapshot.Metadata`中附加块哈希和/或根据`AppHash`逐步验证内容。
    * 当所有块都被接受后，Tendermint将进行一个ABCI `Info`调用，以验证`LastBlockAppHash`和`LastBlockHeight`是否与预期值匹配，并记录`AppVersion`在节点状态中。然后，它切换到快速同步或共识并加入网络。
    * 如果Tendermint在一段时间后无法检索到下一个块（例如因为没有合适的节点可用），它将拒绝快照并通过`OfferSnapshot`尝试不同的快照。应用程序应准备好重置并接受它或根据需要中止。

## 数据类型

ABCI中使用的大多数数据结构都是共享的[常见数据结构](../spec/core/data_structures.md)。在某些情况下，ABCI使用不同的数据结构，这里进行了文档化：

### Validator

* **字段**：

    | 名称    | 类型  | 描述                                                         | 字段编号 |
    |---------|-------|-------------------------------------------------------------|----------|
    | address | bytes | 验证器的[地址](../core/data_structures.md#address)          | 1        |
    | power   | int64 | 验证器的投票权力                                             | 3        |

* **用法**：
    * 通过地址标识的验证器
    * 作为VoteInfo的一部分在RequestBeginBlock中使用
    * 不包括PubKey，以避免通过ABCI发送潜在的大量公钥

### ValidatorUpdate

* **字段**：

    | 名称    | 类型                                                      | 描述                         | 字段编号 |
    |---------|-----------------------------------------------------------|-----------------------------|----------|
    | pub_key | [公钥](../core/data_structures.md#pub_key)                 | 验证器的公钥                 | 1        |
    | power   | int64                                                     | 验证器的投票权力             | 2        |

* **用法**：
    * 通过PubKey标识的验证器
    * 用于告诉Tendermint更新验证器集合

### VoteInfo

* **字段**：

    | 名称               | 类型                     | 描述                                                         | 字段编号 |
    |-------------------|-------------------------|--------------------------------------------------------------|--------------|
    | validator         | [Validator](#validator) | 一个验证器                                                   | 1            |
    | signed_last_block | bool                    | 指示验证器是否签署了最后一个区块                             | 2            |

* **用法**：
    * 指示验证器是否签署了最后一个区块，从而基于验证器的可用性进行奖励

### Evidence

* **字段**：

    | 名称               | 类型                                                                                                                                 | 描述                                                                         | 字段编号 |
    |--------------------|--------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|--------------|
    | type               | [EvidenceType](#evidencetype)                                                                                                        | 证据的类型。可能的证据枚举。                                               | 1            |
    | validator          | [Validator](#validator)                                                                                                              | 违规的验证器                                                                 | 2            |
    | height             | int64                                                                                                                                | 违规发生时的高度                                                             | 3            |
    | time               | [google.protobuf.Timestamp](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.Timestamp) | 违规发生时所提交的区块的时间                                                 | 4            |
    | total_voting_power | int64                                                                                                                                | 高度`Height`时验证器集合的总投票权                                         | 5            |

#### EvidenceType

* **字段**

    EvidenceType是一个包含以下字段的枚举：

    | 名称                | 字段编号 |
    |---------------------|--------------|
    | UNKNOWN             | 0            |
    | DUPLICATE_VOTE      | 1            |
    | LIGHT_CLIENT_ATTACK | 2            |

### LastCommitInfo

* **字段**：

    | 名称  | 类型                           | 描述                                                                                                           | 字段编号 |
    |-------|--------------------------------|-----------------------------------------------------------------------------------------------------------------------|--------------|
    | round | int32                          | 提交轮数。反映了达成当前区块共识所需的总轮数。                 | 1            |
    | votes | repeated [VoteInfo](#voteinfo) | 最后一个验证者集中的验证者地址列表，包括其投票权和是否签署了投票。 | 2            |

### ConsensusParams

* **字段**：

    | 名称      | 类型                                                          | 描述                                                                  | 字段编号 |
    |-----------|---------------------------------------------------------------|------------------------------------------------------------------------------|--------------|
    | block     | [BlockParams](../core/data_structures.md#blockparams)                                   | 限制区块大小和连续区块之间时间的参数。 | 1            |
    | evidence  | [EvidenceParams](../core/data_structures.md#evidenceparams)   | 限制拜占庭行为证据的有效性的参数。         | 2            |
    | validator | [ValidatorParams](../core/data_structures.md#validatorparams) | 限制验证者可以使用的公钥类型的参数。             | 3            |
    | version   | [VersionsParams](../core/data_structures.md#versionparams)       | ABCI应用程序版本。                                                | 4            |

### ProofOps

* **字段**：

    | 名称 | 类型                           | 描述                                                                                                                                                                                                                      | 字段编号 |
    |------|--------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
    | ops  | 重复的 [ProofOp](#proofop) | 一系列链接的 Merkle 证明，可能是不同类型的。一个操作的 Merkle 根是下一个操作中要证明的值。最后一个操作的 Merkle 根应该等于要验证的最终根哈希。 | 1            |

### ProofOp

* **字段**：

    | 名称 | 类型   | 描述                                    | 字段编号 |
    |------|--------|----------------------------------------|----------|
    | type | string | Merkle 证明的类型和编码方式。     | 1            |
    | key  | bytes  | 此证明所针对的 Merkle 树中的键。 | 2            |
    | data | bytes  | 键的编码 Merkle 证明。              | 3            |

### Snapshot

* **字段**：

    | 名称     | 类型   | 描述                                                                                                                                                                 | 字段编号 |
    |----------|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
    | height   | uint64 | 快照拍摄的高度（提交后）。                                                                                                                                  | 1            |
    | format   | uint32 | 应用程序特定的快照格式，允许应用程序对其快照数据格式进行版本控制并进行不兼容的更改。Tendermint 不解释此格式。 | 2            |
    | chunks   | uint32 | 快照中的块数。必须至少为 1（即使为空）。                                                                                                               | 3            |
    | hash     | bytes  | 任意的快照哈希。只有在节点之间的相同快照时才相等。Tendermint 不解释哈希，只进行比较。                              | 3            |
    | metadata | bytes  | 任意的应用程序元数据，例如块哈希或其他验证数据。                                                                                                   | 3            |

* **用法**：
    * 用于状态同步快照，请参阅[状态同步部分](../spec/p2p/messages/state-sync.md)了解详情。
    * 只有当所有字段都相等（包括`Metadata`）时，快照在节点之间被视为相同。可以从具有相同快照的所有节点中检索块。
    * 在网络上传输时，快照消息最大为4 MB。


---
order: 1
title: Method and Types
---

# Methods and Types

## Connections

ABCI applications can run either within the _same_ process as the Tendermint
state-machine replication engine, or as a _separate_ process from the state-machine
replication engine. When run within the same process, Tendermint will call the ABCI
application methods directly as Go method calls.

When Tendermint and the ABCI application are run as separate processes, Tendermint
opens four connections to the application for ABCI methods. The connections each
handle a subset of the ABCI method calls. These subsets are defined as follows:

#### **Consensus** connection

* Driven by a consensus protocol and is responsible for block execution.
* Handles the `InitChain`, `BeginBlock`, `DeliverTx`, `EndBlock`, and `Commit` method
calls.

#### **Mempool** connection

* For validating new transactions, before they're shared or included in a block.
* Handles the `CheckTx` calls.

#### **Info** connection

* For initialization and for queries from the user.
* Handles the `Info` and `Query` calls.

#### **Snapshot** connection

* For serving and restoring [state sync snapshots](apps.md#state-sync).
* Handles the `ListSnapshots`, `LoadSnapshotChunk`, `OfferSnapshot`, and `ApplySnapshotChunk` calls.

Additionally, there is a `Flush` method that is called on every connection,
and an `Echo` method that is just for debugging.

More details on managing state across connections can be found in the section on
[ABCI Applications](apps.md).

## Errors

The `Query`, `CheckTx` and `DeliverTx` methods include a `Code` field in their `Response*`.
This field is meant to contain an application-specific response code.
A response code of `0` indicates no error.  Any other response code
indicates to Tendermint that an error occurred.

These methods also return a `Codespace` string to Tendermint. This field is
used to disambiguate `Code` values returned by different domains of the
application. The `Codespace` is a namespace for the `Code`.

The `Echo`, `Info`, `InitChain`, `BeginBlock`, `EndBlock`, `Commit` methods
do not return errors. An error in any of these methods represents a critical
issue that Tendermint has no reasonable way to handle. If there is an error in one
of these methods, the application must crash to ensure that the error is safely
handled by an operator.

The handling of non-zero response codes by Tendermint is described below

### CheckTx

The `CheckTx` ABCI method controls what transactions are considered for inclusion in a block.
When Tendermint receives a `ResponseCheckTx` with a non-zero `Code`, the associated
transaction will be not be added to Tendermint's mempool or it will be removed if
it is already included.

### DeliverTx

The `DeliverTx` ABCI method delivers transactions from Tendermint to the application.
When Tendermint recieves a `ResponseDeliverTx` with a non-zero `Code`, the response code is logged.
The transaction was already included in a block, so the `Code` does not influence
Tendermint consensus.

### Query

The `Query` ABCI method query queries the application for information about application state.
When Tendermint receives a `ResponseQuery` with a non-zero `Code`, this code is 
returned directly to the client that initiated the query.

## Events

The `CheckTx`, `BeginBlock`, `DeliverTx`, `EndBlock` methods include an `Events`
field in their `Response*`. Applications may respond to these ABCI methods with a set of events.
Events allow applications to associate metadata about ABCI method execution with the
transactions and blocks this metadata relates to.
Events returned via these ABCI methods do not impact Tendermint consensus in any way
and instead exist to power subscriptions and queries of Tendermint state.

An `Event` contains a `type` and a list of `EventAttributes`, which are key-value 
string pairs denoting metadata about what happened during the method's execution.
`Event` values can be used to index transactions and blocks according to what happened
during their execution. Note that the set of events returned for a block from
`BeginBlock` and `EndBlock` are merged. In case both methods return the same
key, only the value defined in `EndBlock` is used.

Each event has a `type` which is meant to categorize the event for a particular
`Response*` or `Tx`. A `Response*` or `Tx` may contain multiple events with duplicate
`type` values, where each distinct entry is meant to categorize attributes for a
particular event. Every key and value in an event's attributes must be UTF-8
encoded strings along with the event type itself.

```protobuf
message Event {
  string                  type       = 1;
  repeated EventAttribute attributes = 2;
}
```

The attributes of an `Event` consist of a `key`, a `value`, and an `index` flag. The
index flag notifies the Tendermint indexer to index the attribute. The value of
the `index` flag is non-deterministic and may vary across different nodes in the network.

```protobuf
message EventAttribute {
  bytes key   = 1;
  bytes value = 2;
  bool  index = 3;  // nondeterministic
}
```

Example:

```go
 abci.ResponseDeliverTx{
  // ...
 Events: []abci.Event{
  {
   Type: "validator.provisions",
   Attributes: []abci.EventAttribute{
    abci.EventAttribute{Key: []byte("address"), Value: []byte("..."), Index: true},
    abci.EventAttribute{Key: []byte("amount"), Value: []byte("..."), Index: true},
    abci.EventAttribute{Key: []byte("balance"), Value: []byte("..."), Index: true},
   },
  },
  {
   Type: "validator.provisions",
   Attributes: []abci.EventAttribute{
    abci.EventAttribute{Key: []byte("address"), Value: []byte("..."), Index: true},
    abci.EventAttribute{Key: []byte("amount"), Value: []byte("..."), Index: false},
    abci.EventAttribute{Key: []byte("balance"), Value: []byte("..."), Index: false},
   },
  },
  {
   Type: "validator.slashed",
   Attributes: []abci.EventAttribute{
    abci.EventAttribute{Key: []byte("address"), Value: []byte("..."), Index: false},
    abci.EventAttribute{Key: []byte("amount"), Value: []byte("..."), Index: true},
    abci.EventAttribute{Key: []byte("reason"), Value: []byte("..."), Index: true},
   },
  },
  // ...
 },
}
```

## EvidenceType

Tendermint's security model relies on the use of "evidence". Evidence is proof of
malicious behaviour by a network participant. It is the responsibility of Tendermint
to detect such malicious behaviour. When malicious behavior is detected, Tendermint
will gossip evidence of the behavior to other nodes and commit the evidence to 
the chain once it is verified by all validators. This evidence will then be 
passed it on to the application through the ABCI. It is the responsibility of the
application to handle the evidence and exercise punishment.

EvidenceType has the following protobuf format:

```proto
enum EvidenceType {
  UNKNOWN               = 0;
  DUPLICATE_VOTE        = 1;
  LIGHT_CLIENT_ATTACK   = 2;
}
```

There are two forms of evidence: Duplicate Vote and Light Client Attack. More
information can be found in either [data structures](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/core/data_structures.md)
or [accountability](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/light-client/accountability/)

## Determinism

ABCI applications must implement deterministic finite-state machines to be
securely replicated by the Tendermint consensus engine. This means block execution
over the Consensus Connection must be strictly deterministic: given the same
ordered set of requests, all nodes will compute identical responses, for all
BeginBlock, DeliverTx, EndBlock, and Commit. This is critical, because the
responses are included in the header of the next block, either via a Merkle root
or directly, so all nodes must agree on exactly what they are.

For this reason, it is recommended that applications not be exposed to any
external user or process except via the ABCI connections to a consensus engine
like Tendermint Core. The application must only change its state based on input
from block execution (BeginBlock, DeliverTx, EndBlock, Commit), and not through
any other kind of request. This is the only way to ensure all nodes see the same
transactions and compute the same results.

If there is some non-determinism in the state machine, consensus will eventually
fail as nodes disagree over the correct values for the block header. The
non-determinism must be fixed and the nodes restarted.

Sources of non-determinism in applications may include:

* Hardware failures
    * Cosmic rays, overheating, etc.
* Node-dependent state
    * Random numbers
    * Time
* Underspecification
    * Library version changes
    * Race conditions
    * Floating point numbers
    * JSON serialization
    * Iterating through hash-tables/maps/dictionaries
* External Sources
    * Filesystem
    * Network calls (eg. some external REST API service)

See [#56](https://github.com/tendermint/abci/issues/56) for original discussion.

Note that some methods (`Query, CheckTx, DeliverTx`) return
explicitly non-deterministic data in the form of `Info` and `Log` fields. The `Log` is
intended for the literal output from the application's logger, while the
`Info` is any additional info that should be returned. These are the only fields
that are not included in block header computations, so we don't need agreement
on them. All other fields in the `Response*` must be strictly deterministic.

## Block Execution

The first time a new blockchain is started, Tendermint calls
`InitChain`. From then on, the following sequence of methods is executed for each
block:

`BeginBlock, [DeliverTx], EndBlock, Commit`

where one `DeliverTx` is called for each transaction in the block.
The result is an updated application state.
Cryptographic commitments to the results of DeliverTx, EndBlock, and
Commit are included in the header of the next block.

## State Sync

State sync allows new nodes to rapidly bootstrap by discovering, fetching, and applying
state machine snapshots instead of replaying historical blocks. For more details, see the
[state sync section](../spec/p2p/messages/state-sync.md).

New nodes will discover and request snapshots from other nodes in the P2P network.
A Tendermint node that receives a request for snapshots from a peer will call
`ListSnapshots` on its application to retrieve any local state snapshots. After receiving
 snapshots from peers, the new node will offer each snapshot received from a peer
to its local application via the `OfferSnapshot` method.

Snapshots may be quite large and are thus broken into smaller "chunks" that can be
assembled into the whole snapshot. Once the application accepts a snapshot and
begins restoring it, Tendermint will fetch snapshot "chunks" from existing nodes.
The node providing "chunks" will fetch them from its local application using
the `LoadSnapshotChunk` method.

As the new node receives "chunks" it will apply them sequentially to the local
application with `ApplySnapshotChunk`. When all chunks have been applied, the application
`AppHash` is retrieved via an `Info` query. The `AppHash` is then compared to
the blockchain's `AppHash` which is verified via [light client verification](../spec/light-client/verification/README.md).

## Messages

### Echo

* **Request**:
    * `Message (string)`: A string to echo back
* **Response**:
    * `Message (string)`: The input string
* **Usage**:
    * Echo a string to test an abci client/server implementation

### Flush

* **Usage**:
    * Signals that messages queued on the client should be flushed to
    the server. It is called periodically by the client
    implementation to ensure asynchronous requests are actually
    sent, and is called immediately to make a synchronous request,
    which returns when the Flush response comes back.

### Info

* **Request**:

    | Name          | Type   | Description                              | Field Number |
    |---------------|--------|------------------------------------------|--------------|
    | version       | string | The Tendermint software semantic version | 1            |
    | block_version | uint64 | The Tendermint Block Protocol version    | 2            |
    | p2p_version   | uint64 | The Tendermint P2P Protocol version      | 3            |
    | abci_version  | string | The Tendermint ABCI semantic version     | 4            |

* **Response**:
  
    | Name                | Type   | Description                                      | Field Number |
    |---------------------|--------|--------------------------------------------------|--------------|
    | data                | string | Some arbitrary information                       | 1            |
    | version             | string | The application software semantic version        | 2            |
    | app_version         | uint64 | The application protocol version                 | 3            |
    | last_block_height   | int64  | Latest block for which the app has called Commit | 4            |
    | last_block_app_hash | bytes  | Latest result of Commit                          | 5            |

* **Usage**:
    * Return information about the application state.
    * Used to sync Tendermint with the application during a handshake
    that happens on startup.
    * The returned `app_version` will be included in the Header of every block.
    * Tendermint expects `last_block_app_hash` and `last_block_height` to
    be updated during `Commit`, ensuring that `Commit` is never
    called twice for the same block height.

> Note: Semantic version is a reference to [semantic versioning](https://semver.org/). Semantic versions in info will be displayed as X.X.x.

### InitChain

* **Request**:

    | Name             | Type                                                                                                                                 | Description                                         | Field Number |
    |------------------|--------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------|--------------|
    | time             | [google.protobuf.Timestamp](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.Timestamp) | Genesis time                                        | 1            |
    | chain_id         | string                                                                                                                               | ID of the blockchain.                               | 2            |
    | consensus_params | [ConsensusParams](#consensusparams)                                                                                                  | Initial consensus-critical parameters.              | 3            |
    | validators       | repeated [ValidatorUpdate](#validatorupdate)                                                                                         | Initial genesis validators, sorted by voting power. | 4            |
    | app_state_bytes  | bytes                                                                                                                                | Serialized initial application state. JSON bytes.   | 5            |
    | initial_height   | int64                                                                                                                                | Height of the initial block (typically `1`).        | 6            |

* **Response**:

    | Name             | Type                                         | Description                                     | Field Number |
    |------------------|----------------------------------------------|-------------------------------------------------|--------------|
    | consensus_params | [ConsensusParams](#consensusparams)          | Initial consensus-critical parameters (optional | 1            |
    | validators       | repeated [ValidatorUpdate](#validatorupdate) | Initial validator set (optional).               | 2            |
    | app_hash         | bytes                                        | Initial application hash.                       | 3            |

* **Usage**:
    * Called once upon genesis.
    * If ResponseInitChain.Validators is empty, the initial validator set will be the RequestInitChain.Validators
    * If ResponseInitChain.Validators is not empty, it will be the initial
    validator set (regardless of what is in RequestInitChain.Validators).
    * This allows the app to decide if it wants to accept the initial validator
    set proposed by tendermint (ie. in the genesis file), or if it wants to use
    a different one (perhaps computed based on some application specific
    information in the genesis file).

### Query

* **Request**:
  
    | Name   | Type   | Description                                                                                                                                                                                                                                                                            | Field Number |
    |--------|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | data   | bytes  | Raw query bytes. Can be used with or in lieu of Path.                                                                                                                                                                                                                                  | 1            |
    | path   | string | Path field of the request URI. Can be used with or in lieu of `data`. Apps MUST interpret `/store` as a query by key on the underlying store. The key SHOULD be specified in the `data` field. Apps SHOULD allow queries over specific types like `/accounts/...` or `/votes/...` | 2            |
    | height | int64  | The block height for which you want the query (default=0 returns data for the latest committed block). Note that this is the height of the block containing the application's Merkle root hash, which represents the state as it was after committing the block at Height-1            | 3            |
    | prove  | bool   | Return Merkle proof with response if possible                                                                                                                                                                                                                                          | 4            |

* **Response**:

    | Name      | Type                  | Description                                                                                                                                                                                                        | Field Number |
    |-----------|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | code      | uint32                | Response code.                                                                                                                                                                                                     | 1            |
    | log       | string                | The output of the application's logger. **May be non-deterministic.**                                                                                                                                              | 3            |
    | info      | string                | Additional information. **May be non-deterministic.**                                                                                                                                                              | 4            |
    | index     | int64                 | The index of the key in the tree.                                                                                                                                                                                  | 5            |
    | key       | bytes                 | The key of the matching data.                                                                                                                                                                                      | 6            |
    | value     | bytes                 | The value of the matching data.                                                                                                                                                                                    | 7            |
    | proof_ops | [ProofOps](#proofops) | Serialized proof for the value data, if requested, to be verified against the `app_hash` for the given Height.                                                                                                     | 8            |
    | height    | int64                 | The block height from which data was derived. Note that this is the height of the block containing the application's Merkle root hash, which represents the state as it was after committing the block at Height-1 | 9            |
    | codespace | string                | Namespace for the `code`.                                                                                                                                                                                          | 10           |

* **Usage**:
    * Query for data from the application at current or past height.
    * Optionally return Merkle proof.
    * Merkle proof includes self-describing `type` field to support many types
    of Merkle trees and encoding formats.

### BeginBlock

* **Request**:

    | Name                 | Type                                        | Description                                                                                                       | Field Number |
    |----------------------|---------------------------------------------|-------------------------------------------------------------------------------------------------------------------|--------------|
    | hash                 | bytes                                       | The block's hash. This can be derived from the block header.                                                      | 1            |
    | header               | [Header](../core/data_structures.md#header) | The block header.                                                                                                 | 2            |
    | last_commit_info     | [LastCommitInfo](#lastcommitinfo)           | Info about the last commit, including the round, and the list of validators and which ones signed the last block. | 3            |
    | byzantine_validators | repeated [Evidence](#evidence)              | List of evidence of validators that acted maliciously.                                                            | 4            |

* **Response**:

    | Name   | Type                      | Description                         | Field Number |
    |--------|---------------------------|-------------------------------------|--------------|
    | events | repeated [Event](#events) | type & Key-Value events for indexing | 1           |

* **Usage**:
    * Signals the beginning of a new block.
    * Called prior to any `DeliverTx` method calls.
    * The header contains the height, timestamp, and more - it exactly matches the
    Tendermint block header. We may seek to generalize this in the future.
    * The `LastCommitInfo` and `ByzantineValidators` can be used to determine
    rewards and punishments for the validators.

### CheckTx

* **Request**:

    | Name | Type        | Description                                                                                                                                                                                                                                         | Field Number |
    |------|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | tx   | bytes       | The request transaction bytes                                                                                                                                                                                                                       | 1            |
    | type | CheckTxType | One of `CheckTx_New` or `CheckTx_Recheck`. `CheckTx_New` is the default and means that a full check of the tranasaction is required. `CheckTx_Recheck` types are used when the mempool is initiating a normal recheck of a transaction.             | 2            |

* **Response**:

    | Name       | Type                      | Description                                                           | Field Number |
    |------------|---------------------------|-----------------------------------------------------------------------|--------------|
    | code       | uint32                    | Response code.                                                        | 1            |
    | data       | bytes                     | Result bytes, if any.                                                 | 2            |
    | log        | string                    | The output of the application's logger. **May be non-deterministic.** | 3            |
    | info       | string                    | Additional information. **May be non-deterministic.**                 | 4            |
    | gas_wanted | int64                     | Amount of gas requested for transaction.                              | 5            |
    | gas_used   | int64                     | Amount of gas consumed by transaction.                                | 6            |
    | events     | repeated [Event](#events) | Type & Key-Value events for indexing transactions (eg. by account).   | 7            |
    | codespace  | string                    | Namespace for the `code`.                                             | 8            |
    | sender     | string                    | The transaction's sender (e.g. the signer)                            | 9            |
    | priority   | int64                     | The transaction's priority (for mempool ordering)                     | 10           |

* **Usage**:

    * Technically optional - not involved in processing blocks.
    * Guardian of the mempool: every node runs `CheckTx` before letting a
    transaction into its local mempool.
    * The transaction may come from an external user or another node
    * `CheckTx` validates the transaction against the current state of the application,
    for example, checking signatures and account balances, but does not apply any
    of the state changes described in the transaction.
    not running code in a virtual machine.
    * Transactions where `ResponseCheckTx.Code != 0` will be rejected - they will not be broadcast to
    other nodes or included in a proposal block.
    * Tendermint attributes no other value to the response code

### DeliverTx

* **Request**:

    | Name | Type  | Description                    | Field Number |
    |------|-------|--------------------------------|--------------|
    | tx   | bytes | The request transaction bytes. | 1            |

* **Response**:

    | Name       | Type                      | Description                                                           | Field Number |
    |------------|---------------------------|-----------------------------------------------------------------------|--------------|
    | code       | uint32                    | Response code.                                                        | 1            |
    | data       | bytes                     | Result bytes, if any.                                                 | 2            |
    | log        | string                    | The output of the application's logger. **May be non-deterministic.** | 3            |
    | info       | string                    | Additional information. **May be non-deterministic.**                 | 4            |
    | gas_wanted | int64                     | Amount of gas requested for transaction.                              | 5            |
    | gas_used   | int64                     | Amount of gas consumed by transaction.                                | 6            |
    | events     | repeated [Event](#events) | Type & Key-Value events for indexing transactions (eg. by account).   | 7            |
    | codespace  | string                    | Namespace for the `code`.                                             | 8            |

* **Usage**:
    * [**Required**] The core method of the application.
    * When `DeliverTx` is called, the application must execute the transaction in full before returning control to Tendermint.
    * `ResponseDeliverTx.Code == 0` only if the transaction is fully valid.

### EndBlock

* **Request**:

    | Name   | Type  | Description                        | Field Number |
    |--------|-------|------------------------------------|--------------|
    | height | int64 | Height of the block just executed. | 1            |

* **Response**:

    | Name                    | Type                                         | Description                                                     | Field Number |
    |-------------------------|----------------------------------------------|-----------------------------------------------------------------|--------------|
    | validator_updates       | repeated [ValidatorUpdate](#validatorupdate) | Changes to validator set (set voting power to 0 to remove).     | 1            |
    | consensus_param_updates | [ConsensusParams](#consensusparams)          | Changes to consensus-critical time, size, and other parameters. | 2            |
    | events                  | repeated [Event](#events)                    | Type & Key-Value events for indexing                            | 3            |

* **Usage**:
    * Signals the end of a block.
    * Called after all the transactions for the current block have been delivered, prior to the block's `Commit` message.
    * Optional `validator_updates` triggered by block `H`. These updates affect validation
      for blocks `H+1`, `H+2`, and `H+3`.
    * Heights following a validator update are affected in the following way:
        * `H+1`: `NextValidatorsHash` includes the new `validator_updates` value.
        * `H+2`: The validator set change takes effect and `ValidatorsHash` is updated.
        * `H+3`: `LastCommitInfo` is changed to include the altered validator set.
    * `consensus_param_updates` returned for block `H` apply to the consensus
      params for block `H+1`. For more information on the consensus parameters,
      see the [application spec entry on consensus parameters](../spec/abci/apps.md#consensus-parameters).

### Commit

* **Request**:

    | Name   | Type  | Description                        | Field Number |
    |--------|-------|------------------------------------|--------------|

    Commit signals the application to persist application state. It takes no parameters.
* **Response**:

    | Name          | Type  | Description                                                            | Field Number |
    |---------------|-------|------------------------------------------------------------------------|--------------|
    | data          | bytes | The Merkle root hash of the application state.                         | 2            |
    | retain_height | int64 | Blocks below this height may be removed. Defaults to `0` (retain all). | 3            |

* **Usage**:
    * Signal the application to persist the application state.
    * Return an (optional) Merkle root hash of the application state
    * `ResponseCommit.Data` is included as the `Header.AppHash` in the next block
        * it may be empty
    * Later calls to `Query` can return proofs about the application state anchored
    in this Merkle root hash
    * Note developers can return whatever they want here (could be nothing, or a
    constant string, etc.), so long as it is deterministic - it must not be a
    function of anything that did not come from the
    BeginBlock/DeliverTx/EndBlock methods.
    * Use `RetainHeight` with caution! If all nodes in the network remove historical
    blocks then this data is permanently lost, and no new nodes will be able to
    join the network and bootstrap. Historical blocks may also be required for
    other purposes, e.g. auditing, replay of non-persisted heights, light client
    verification, and so on.

### ListSnapshots

* **Request**:

    | Name   | Type  | Description                        | Field Number |
    |--------|-------|------------------------------------|--------------|

    Empty request asking the application for a list of snapshots.

* **Response**:

    | Name      | Type                           | Description                    | Field Number |
    |-----------|--------------------------------|--------------------------------|--------------|
    | snapshots | repeated [Snapshot](#snapshot) | List of local state snapshots. | 1            |

* **Usage**:
    * Used during state sync to discover available snapshots on peers.
    * See `Snapshot` data type for details.

### LoadSnapshotChunk

* **Request**:

    | Name   | Type   | Description                                                           | Field Number |
    |--------|--------|-----------------------------------------------------------------------|--------------|
    | height | uint64 | The height of the snapshot the chunks belongs to.                     | 1            |
    | format | uint32 | The application-specific format of the snapshot the chunk belongs to. | 2            |
    | chunk  | uint32 | The chunk index, starting from `0` for the initial chunk.             | 3            |

* **Response**:

    | Name  | Type  | Description                                                                                                                                           | Field Number |
    |-------|-------|-------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | chunk | bytes | The binary chunk contents, in an arbitray format. Chunk messages cannot be larger than 16 MB _including metadata_, so 10 MB is a good starting point. | 1            |

* **Usage**:
    * Used during state sync to retrieve snapshot chunks from peers.

### OfferSnapshot

* **Request**:

    | Name     | Type                  | Description                                                              | Field Number |
    |----------|-----------------------|--------------------------------------------------------------------------|--------------|
    | snapshot | [Snapshot](#snapshot) | The snapshot offered for restoration.                                    | 1            |
    | app_hash | bytes                 | The light client-verified app hash for this height, from the blockchain. | 2            |

* **Response**:

    | Name   | Type              | Description                       | Field Number |
    |--------|-------------------|-----------------------------------|--------------|
    | result | [Result](#result) | The result of the snapshot offer. | 1            |

#### Result

```proto
  enum Result {
    UNKNOWN       = 0;  // Unknown result, abort all snapshot restoration
    ACCEPT        = 1;  // Snapshot is accepted, start applying chunks.
    ABORT         = 2;  // Abort snapshot restoration, and don't try any other snapshots.
    REJECT        = 3;  // Reject this specific snapshot, try others.
    REJECT_FORMAT = 4;  // Reject all snapshots with this `format`, try others.
    REJECT_SENDER = 5;  // Reject all snapshots from all senders of this snapshot, try others.
  }
```

* **Usage**:
    * `OfferSnapshot` is called when bootstrapping a node using state sync. The application may
    accept or reject snapshots as appropriate. Upon accepting, Tendermint will retrieve and
    apply snapshot chunks via `ApplySnapshotChunk`. The application may also choose to reject a
    snapshot in the chunk response, in which case it should be prepared to accept further
    `OfferSnapshot` calls.
    * Only `AppHash` can be trusted, as it has been verified by the light client. Any other data
    can be spoofed by adversaries, so applications should employ additional verification schemes
    to avoid denial-of-service attacks. The verified `AppHash` is automatically checked against
    the restored application at the end of snapshot restoration.
    * For more information, see the `Snapshot` data type or the [state sync section](../spec/p2p/messages/state-sync.md).

### ApplySnapshotChunk

* **Request**:

    | Name   | Type   | Description                                                                 | Field Number |
    |--------|--------|-----------------------------------------------------------------------------|--------------|
    | index  | uint32 | The chunk index, starting from `0`. Tendermint applies chunks sequentially. | 1            |
    | chunk  | bytes  | The binary chunk contents, as returned by `LoadSnapshotChunk`.              | 2            |
    | sender | string | The P2P ID of the node who sent this chunk.                                 | 3            |

* **Response**:

    | Name           | Type                | Description                                                                                                                                                                                                                             | Field Number |
    |----------------|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | result         | Result  (see below) | The result of applying this chunk.                                                                                                                                                                                                      | 1            |
    | refetch_chunks | repeated uint32     | Refetch and reapply the given chunks, regardless of `result`. Only the listed chunks will be refetched, and reapplied in sequential order.                                                                                              | 2            |
    | reject_senders | repeated string     | Reject the given P2P senders, regardless of `Result`. Any chunks already applied will not be refetched unless explicitly requested, but queued chunks from these senders will be discarded, and new chunks or other snapshots rejected. | 3            |

```proto
  enum Result {
    UNKNOWN         = 0;  // Unknown result, abort all snapshot restoration
    ACCEPT          = 1;  // The chunk was accepted.
    ABORT           = 2;  // Abort snapshot restoration, and don't try any other snapshots.
    RETRY           = 3;  // Reapply this chunk, combine with `RefetchChunks` and `RejectSenders` as appropriate.
    RETRY_SNAPSHOT  = 4;  // Restart this snapshot from `OfferSnapshot`, reusing chunks unless instructed otherwise.
    REJECT_SNAPSHOT = 5;  // Reject this snapshot, try a different one.
  }
```

* **Usage**:
    * The application can choose to refetch chunks and/or ban P2P peers as appropriate. Tendermint
    will not do this unless instructed by the application.
    * The application may want to verify each chunk, e.g. by attaching chunk hashes in
    `Snapshot.Metadata` and/or incrementally verifying contents against `AppHash`.
    * When all chunks have been accepted, Tendermint will make an ABCI `Info` call to verify that
    `LastBlockAppHash` and `LastBlockHeight` matches the expected values, and record the
    `AppVersion` in the node state. It then switches to fast sync or consensus and joins the
    network.
    * If Tendermint is unable to retrieve the next chunk after some time (e.g. because no suitable
    peers are available), it will reject the snapshot and try a different one via `OfferSnapshot`.
    The application should be prepared to reset and accept it or abort as appropriate.

## Data Types

Most of the data structures used in ABCI are shared [common data structures](../spec/core/data_structures.md). In certain cases, ABCI uses different data structures which are documented here:

### Validator

* **Fields**:

    | Name    | Type  | Description                                                         | Field Number |
    |---------|-------|---------------------------------------------------------------------|--------------|
    | address | bytes | [Address](../core/data_structures.md#address) of validator          | 1            |
    | power   | int64 | Voting power of the validator                                       | 3            |

* **Usage**:
    * Validator identified by address
    * Used in RequestBeginBlock as part of VoteInfo
    * Does not include PubKey to avoid sending potentially large quantum pubkeys
    over the ABCI

### ValidatorUpdate

* **Fields**:

    | Name    | Type                                             | Description                   | Field Number |
    |---------|--------------------------------------------------|-------------------------------|--------------|
    | pub_key | [Public Key](../core/data_structures.md#pub_key) | Public key of the validator   | 1            |
    | power   | int64                                            | Voting power of the validator | 2            |

* **Usage**:
    * Validator identified by PubKey
    * Used to tell Tendermint to update the validator set

### VoteInfo

* **Fields**:

    | Name              | Type                    | Description                                                  | Field Number |
    |-------------------|-------------------------|--------------------------------------------------------------|--------------|
    | validator         | [Validator](#validator) | A validator                                                  | 1            |
    | signed_last_block | bool                    | Indicates whether or not the validator signed the last block | 2            |

* **Usage**:
    * Indicates whether a validator signed the last block, allowing for rewards
    based on validator availability

### Evidence

* **Fields**:

    | Name               | Type                                                                                                                                 | Description                                                                  | Field Number |
    |--------------------|--------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|--------------|
    | type               | [EvidenceType](#evidencetype)                                                                                                        | Type of the evidence. An enum of possible evidence's.                        | 1            |
    | validator          | [Validator](#validator)                                                                                                              | The offending validator                                                      | 2            |
    | height             | int64                                                                                                                                | Height when the offense occurred                                             | 3            |
    | time               | [google.protobuf.Timestamp](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.Timestamp) | Time of the block that was committed at the height that the offense occurred | 4            |
    | total_voting_power | int64                                                                                                                                | Total voting power of the validator set at height `Height`                   | 5            |

#### EvidenceType

* **Fields**

    EvidenceType is an enum with the listed fields:

    | Name                | Field Number |
    |---------------------|--------------|
    | UNKNOWN             | 0            |
    | DUPLICATE_VOTE      | 1            |
    | LIGHT_CLIENT_ATTACK | 2            |

### LastCommitInfo

* **Fields**:

    | Name  | Type                           | Description                                                                                                           | Field Number |
    |-------|--------------------------------|-----------------------------------------------------------------------------------------------------------------------|--------------|
    | round | int32                          | Commit round. Reflects the total amount of rounds it took to come to consensus for the current block.                 | 1            |
    | votes | repeated [VoteInfo](#voteinfo) | List of validators addresses in the last validator set with their voting power and whether or not they signed a vote. | 2            |

### ConsensusParams

* **Fields**:

    | Name      | Type                                                          | Description                                                                  | Field Number |
    |-----------|---------------------------------------------------------------|------------------------------------------------------------------------------|--------------|
    | block     | [BlockParams](../core/data_structures.md#blockparams)                                   | Parameters limiting the size of a block and time between consecutive blocks. | 1            |
    | evidence  | [EvidenceParams](../core/data_structures.md#evidenceparams)   | Parameters limiting the validity of evidence of byzantine behaviour.         | 2            |
    | validator | [ValidatorParams](../core/data_structures.md#validatorparams) | Parameters limiting the types of public keys validators can use.             | 3            |
    | version   | [VersionsParams](../core/data_structures.md#versionparams)       | The ABCI application version.                                                | 4            |

### ProofOps

* **Fields**:

    | Name | Type                         | Description                                                                                                                                                                                                                  | Field Number |
    |------|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | ops  | repeated [ProofOp](#proofop) | List of chained Merkle proofs, of possibly different types. The Merkle root of one op is the value being proven in the next op. The Merkle root of the final op should equal the ultimate root hash being verified against.. | 1            |

### ProofOp

* **Fields**:

    | Name | Type   | Description                                    | Field Number |
    |------|--------|------------------------------------------------|--------------|
    | type | string | Type of Merkle proof and how it's encoded.     | 1            |
    | key  | bytes  | Key in the Merkle tree that this proof is for. | 2            |
    | data | bytes  | Encoded Merkle proof for the key.              | 3            |

### Snapshot

* **Fields**:

    | Name     | Type   | Description                                                                                                                                                                       | Field Number |
    |----------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
    | height   | uint64 | The height at which the snapshot was taken (after commit).                                                                                                                        | 1            |
    | format   | uint32 | An application-specific snapshot format, allowing applications to version their snapshot data format and make backwards-incompatible changes. Tendermint does not interpret this. | 2            |
    | chunks   | uint32 | The number of chunks in the snapshot. Must be at least 1 (even if empty).                                                                                                         | 3            |
    | hash     | bytes  | TAn arbitrary snapshot hash. Must be equal only for identical snapshots across nodes. Tendermint does not interpret the hash, it only compares them.                              | 3            |
    | metadata | bytes  | Arbitrary application metadata, for example chunk hashes or other verification data.                                                                                              | 3            |

* **Usage**:
    * Used for state sync snapshots, see the [state sync section](../spec/p2p/messages/state-sync.md) for details.
    * A snapshot is considered identical across nodes only if _all_ fields are equal (including
    `Metadata`). Chunks may be retrieved from all nodes that have the same snapshot.
    * When sent across the network, a snapshot message can be at most 4 MB.
