---
order: 5
---

# 状态同步

## 通道

状态同步有四个不同的通道。通道标识符如下所示。

| 名称               | 编号 |
|-------------------|--------|
| SnapshotChannel   | 96     |
| ChunkChannel      | 97     |
| LightBlockChannel | 98     |
| ParamsChannel     | 99     |

## 消息类型

### SnapshotRequest

当一个新节点开始进行状态同步时，它会询问遇到的所有节点是否有可用的快照：

| 名称     | 类型   | 描述 | 字段编号 |
|----------|--------|-------------|--------------|

### SnapShotResponse

接收方将通过 `ListSnapshots` 查询本地的 ABCI 应用程序，并发送包含每个最近的 10 个快照的快照元数据（限制为 4 MB）的消息，并存储在应用程序层。当一个节点启动时，它会请求快照。

| 名称     | 类型   | 描述                                               | 字段编号 |
|----------|--------|-----------------------------------------------------------|--------------|
| height   | uint64 | 快照被拍摄的高度                    | 1            |
| format   | uint32 | 快照的格式                                   | 2            |
| chunks   | uint32 | 快照由多少个块组成                      | 3            |
| hash     | bytes  | 任意的快照哈希                                   | 4            |
| metadata | bytes  | 任意的应用程序数据。**可能是非确定性的。** | 5            |

### ChunkRequest

运行状态同步的节点将通过 `OfferSnapshot` ABCI 调用将这些快照提供给本地的 ABCI 应用程序，并跟踪哪些节点包含哪些快照。一旦接受了一个快照，状态同步器将从适当的节点请求快照块：

| 名称   | 类型   | 描述                                                 | 字段编号 |
|--------|--------|-------------------------------------------------------------|--------------|
| height | uint64 | 块创建时的高度                       | 1            |
| format | uint32 | 块选择的格式。**可能是非确定性的。** | 2            |
| index  | uint32 | 快照中的块索引                     | 3            |

### ChunkResponse

接收方将通过`LoadSnapshotChunk`从其本地应用程序加载请求的块，并以其响应（限制为16 MB）：

| 名称     | 类型    | 描述                                                     | 字段编号     |
|---------|--------|---------------------------------------------------------|--------------|
| height  | uint64 | 创建该块的高度                                           | 1            |
| format  | uint32 | 为该块选择的格式。**可能是非确定性的。**                   | 2            |
| index   | uint32 | 快照中的块索引                                           | 3            |
| hash    | bytes  | 任意的快照哈希                                           | 4            |
| missing | bool   | 任意的应用程序数据。**可能是非确定性的。**                 | 5            |

在这里，`Missing`用于表示在对等方上未找到该块，因为空块是一个有效（尽管不太可能）的响应。

返回的块通过`ApplySnapshotChunk`提供给ABCI应用程序，直到恢复快照。如果在一定时间内没有返回块响应，将重新请求，可能从不同的对等方获取。

作为ABCI协议的一部分，ABCI应用程序可以请求对等方禁止和块重新获取。

### LightBlockRequest

为了验证状态并为共识提供相关信息，节点将向对等方请求指定高度的轻块。

| 名称     | 类型    | 描述                        | 字段编号     |
|----------|--------|----------------------------|--------------|
| height   | uint64 | 轻块的高度                  | 1            |

### LightBlockResponse

接收方将从块和状态存储中检索和构建轻块。接收方将通过比较哈希值来验证数据，并在必要时存储头、提交和验证人集合。在快照的高度上，轻块将用于验证`AppHash`。

| 名称          | 类型                                                    | 描述                                  | 字段编号     |
|---------------|---------------------------------------------------------|--------------------------------------|--------------|
| light_block   | [LightBlock](../../core/data_structures.md#lightblock)  | 请求高度处的轻块                     | 1            |

状态同步将使用[轻客户端验证](../../light-client/verification.README.md)来验证轻区块。

如果没有进行状态同步（即在正常操作期间），任何未经请求的响应消息都会被丢弃。

### ParamsRequest

为了构建 Tendermint 状态，状态提供者将请求快照高度处的参数，并使用头部进行验证。

| 名称     | 类型   | 描述                | 字段编号 |
|----------|--------|----------------------------|--------------|
| height   | uint64 | 共识参数的高度  | 1            |


### ParamsResponse

接收请求的一方将使用状态存储来获取该高度处的共识参数，并将其返回给发送方。

| 名称     | 类型   | 描述                     | 字段编号 |
|----------|--------|---------------------------------|--------------|
| height   | uint64 | 共识参数的高度  | 1            |
| consensus_params | [ConsensusParams](../../core/data_structures.md#ConsensusParams) | 请求高度处的共识参数 | 2 |


### Message

Message 是一个 [`oneof` protobuf 类型](https://developers.google.com/protocol-buffers/docs/proto#oneof)。`oneof` 包含了八个消息。

| 名称                 | 类型                                       | 描述                                  | 字段编号 |
|----------------------|--------------------------------------------|----------------------------------------------|--------------|
| snapshots_request    | [SnapshotRequest](#snapshotrequest)        | 从对等方请求最近的快照        | 1            |
| snapshots_response   | [SnapshotResponse](#snapshotresponse)      | 响应最近存储的快照 | 2            |
| chunk_request        | [ChunkRequest](#chunkrequest)              | 请求快照的块。              | 3            |
| chunk_response       | [ChunkRequest](#chunkresponse)             | 用于重建状态的块的响应   | 4            |
| light_block_request  | [LightBlockRequest](#lightblockrequest)    | 请求轻区块。                       | 5            |
| light_block_response | [LightBlockResponse](#lightblockresponse)  | 响应轻区块                   | 6            |
| params_request  | [ParamsRequest](#paramsrequest)    | 请求指定高度处的共识参数                       | 7            |
| params_response | [ParamsResponse](#paramsresponse)  | 响应共识参数                   | 8            |

I'm sorry, but as a text-based AI, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


---
order: 5
---

# State Sync

## Channels

State sync has four distinct channels. The channel identifiers are listed below.

| Name              | Number |
|-------------------|--------|
| SnapshotChannel   | 96     |
| ChunkChannel      | 97     |
| LightBlockChannel | 98     |
| ParamsChannel     | 99     |

## Message Types

### SnapshotRequest

When a new node begin state syncing, it will ask all peers it encounters if it has any
available snapshots:

| Name     | Type   | Description | Field Number |
|----------|--------|-------------|--------------|

### SnapShotResponse

The receiver will query the local ABCI application via `ListSnapshots`, and send a message
containing snapshot metadata (limited to 4 MB) for each of the 10 most recent snapshots: and stored at the application layer. When a peer is starting it will request snapshots.  

| Name     | Type   | Description                                               | Field Number |
|----------|--------|-----------------------------------------------------------|--------------|
| height   | uint64 | Height at which the snapshot was taken                    | 1            |
| format   | uint32 | Format of the snapshot.                                   | 2            |
| chunks   | uint32 | How many chunks make up the snapshot                      | 3            |
| hash     | bytes  | Arbitrary snapshot hash                                   | 4            |
| metadata | bytes  | Arbitrary application data. **May be non-deterministic.** | 5            |

### ChunkRequest

The node running state sync will offer these snapshots to the local ABCI application via
`OfferSnapshot` ABCI calls, and keep track of which peers contain which snapshots. Once a snapshot
is accepted, the state syncer will request snapshot chunks from appropriate peers:

| Name   | Type   | Description                                                 | Field Number |
|--------|--------|-------------------------------------------------------------|--------------|
| height | uint64 | Height at which the chunk was created                       | 1            |
| format | uint32 | Format chosen for the chunk.  **May be non-deterministic.** | 2            |
| index  | uint32 | Index of the chunk within the snapshot.                     | 3            |

### ChunkResponse

The receiver will load the requested chunk from its local application via `LoadSnapshotChunk`,
and respond with it (limited to 16 MB):

| Name    | Type   | Description                                                 | Field Number |
|---------|--------|-------------------------------------------------------------|--------------|
| height  | uint64 | Height at which the chunk was created                       | 1            |
| format  | uint32 | Format chosen for the chunk.  **May be non-deterministic.** | 2            |
| index   | uint32 | Index of the chunk within the snapshot.                     | 3            |
| hash    | bytes  | Arbitrary snapshot hash                                     | 4            |
| missing | bool   | Arbitrary application data. **May be non-deterministic.**   | 5            |

Here, `Missing` is used to signify that the chunk was not found on the peer, since an empty
chunk is a valid (although unlikely) response.

The returned chunk is given to the ABCI application via `ApplySnapshotChunk` until the snapshot
is restored. If a chunk response is not returned within some time, it will be re-requested,
possibly from a different peer.

The ABCI application is able to request peer bans and chunk refetching as part of the ABCI protocol.

### LightBlockRequest

To verify state and to provide state relevant information for consensus, the node will ask peers for
light blocks at specified heights.

| Name     | Type   | Description                | Field Number |
|----------|--------|----------------------------|--------------|
| height   | uint64 | Height of the light block  | 1            |

### LightBlockResponse

The receiver will retrieve and construct the light block from both the block and state stores. The
receiver will verify the data by comparing the hashes and store the header, commit and validator set
if necessary. The light block at the height of the snapshot will be used to verify the `AppHash`.

| Name          | Type                                                    | Description                          | Field Number |
|---------------|---------------------------------------------------------|--------------------------------------|--------------|
| light_block   | [LightBlock](../../core/data_structures.md#lightblock)  | Light block at the height requested  | 1            |

State sync will use [light client verification](../../light-client/verification.README.md) to verify
the light blocks.


If no state sync is in progress (i.e. during normal operation), any unsolicited response messages
are discarded.

### ParamsRequest

In order to build tendermint state, the state provider will request the params at the height of the snapshot and use the header to verify it.

| Name     | Type   | Description                | Field Number |
|----------|--------|----------------------------|--------------|
| height   | uint64 | Height of the consensus params  | 1            |


### ParamsResponse

A reciever to the request will use the state store to fetch the consensus params at that height and return it to the sender.

| Name     | Type   | Description                     | Field Number |
|----------|--------|---------------------------------|--------------|
| height   | uint64 | Height of the consensus params  | 1            |
| consensus_params | [ConsensusParams](../../core/data_structures.md#ConsensusParams) | Consensus params at the height requested | 2 |


### Message

Message is a [`oneof` protobuf type](https://developers.google.com/protocol-buffers/docs/proto#oneof). The `oneof` consists of eight messages.

| Name                 | Type                                       | Description                                  | Field Number |
|----------------------|--------------------------------------------|----------------------------------------------|--------------|
| snapshots_request    | [SnapshotRequest](#snapshotrequest)        | Request a recent snapshot from a peer        | 1            |
| snapshots_response   | [SnapshotResponse](#snapshotresponse)      | Respond with the most recent snapshot stored | 2            |
| chunk_request        | [ChunkRequest](#chunkrequest)              | Request chunks of the snapshot.              | 3            |
| chunk_response       | [ChunkRequest](#chunkresponse)             | Response of chunks used to recreate state.   | 4            |
| light_block_request  | [LightBlockRequest](#lightblockrequest)    | Request a light block.                       | 5            |
| light_block_response | [LightBlockResponse](#lightblockresponse)  | Respond with a light block                   | 6            |
| params_request  | [ParamsRequest](#paramsrequest)    | Request the consensus params at a height.                       | 7            |
| params_response | [ParamsResponse](#paramsresponse)  | Respond with the consensus params                   | 8            |
