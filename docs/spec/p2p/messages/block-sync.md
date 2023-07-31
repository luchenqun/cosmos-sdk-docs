---
order: 2
---

# 区块同步

## 通道

区块同步有一个通道。

| 名称               | 编号 |
|-------------------|--------|
| BlockchainChannel | 64     |

## 消息类型

区块同步有多个消息类型。

### BlockRequest

BlockRequest 向对等节点请求指定高度的区块。

| 名称    | 类型   | 描述                     | 字段编号 |
|--------|-------|-------------------------|--------------|
| Height | int64 | 请求的区块高度           | 1            |

### NoBlockResponse

NoBlockResponse 通知请求区块的对等节点，该节点不包含该区块。

| 名称    | 类型   | 描述                     | 字段编号 |
|--------|-------|-------------------------|--------------|
| Height | int64 | 请求的区块高度           | 1            |

### BlockResponse

BlockResponse 包含所请求的区块。

| 名称   | 类型                                         | 描述           | 字段编号 |
|-------|----------------------------------------------|---------------|--------------|
| Block | [Block](../../core/data_structures.md#block) | 请求的区块     | 1            |

### StatusRequest

StatusRequest 是一个空消息，用于通知对等节点回复其存储的最高和最低区块。

> 空消息。

### StatusResponse

StatusResponse 回复对等节点的最高和最低区块。

| 名称    | 类型   | 描述                                                       | 字段编号 |
|--------|-------|-----------------------------------------------------------|--------------|
| Height | int64 | 节点的当前高度                                             | 1            |
| base   | int64 | 第一个已知区块，如果启用了剪枝，则高于 1                    | 1            |

### Message

Message 是一个 [`oneof` protobuf 类型](https://developers.google.com/protocol-buffers/docs/proto#oneof)。`oneof` 包含五个消息。

| 名称              | 类型                             | 描述                                                  | 字段编号 |
|-------------------|----------------------------------|------------------------------------------------------|--------------|
| block_request     | [BlockRequest](#blockrequest)    | 从对等节点请求区块                                    | 1            |
| no_block_response | [NoBlockResponse](#noblockresponse) | 回复表示没有请求的区块                               | 2            |
| block_response    | [BlockResponse](#blockresponse)   | 回复包含请求的区块                                    | 3            |
| status_request    | [StatusRequest](#statusrequest)   | 从对等节点请求最高和最低区块编号                      | 4            |
| status_response   | [StatusResponse](#statusresponse)  | 回复包含存储的最高和最低区块编号                      | 5            |

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


---
order: 2
---

# Block Sync

## Channel

Block sync has one channel.

| Name              | Number |
|-------------------|--------|
| BlockchainChannel | 64     |

## Message Types

There are multiple message types for Block Sync

### BlockRequest

BlockRequest asks a peer for a block at the height specified.

| Name   | Type  | Description               | Field Number |
|--------|-------|---------------------------|--------------|
| Height | int64 | Height of requested block | 1            |

### NoBlockResponse

NoBlockResponse notifies the peer requesting a block that the node does not contain it.

| Name   | Type  | Description               | Field Number |
|--------|-------|---------------------------|--------------|
| Height | int64 | Height of requested block | 1            |

### BlockResponse

BlockResponse contains the block requested.

| Name  | Type                                         | Description     | Field Number |
|-------|----------------------------------------------|-----------------|--------------|
| Block | [Block](../../core/data_structures.md#block) | Requested Block | 1            |

### StatusRequest

StatusRequest is an empty message that notifies the peer to respond with the highest and lowest blocks it has stored.

> Empty message.

### StatusResponse

StatusResponse responds to a peer with the highest and lowest block stored.

| Name   | Type  | Description                                                       | Field Number |
|--------|-------|-------------------------------------------------------------------|--------------|
| Height | int64 | Current Height of a node                                          | 1            |
| base   | int64 | First known block, if pruning is enabled it will be higher than 1 | 1            |

### Message

Message is a [`oneof` protobuf type](https://developers.google.com/protocol-buffers/docs/proto#oneof). The `oneof` consists of five messages.

| Name              | Type                             | Description                                                  | Field Number |
|-------------------|----------------------------------|--------------------------------------------------------------|--------------|
| block_request     | [BlockRequest](#blockrequest)    | Request a block from a peer                                  | 1            |
| no_block_response | [NoBlockResponse](#noblockresponse) | Response saying it doe snot have the requested block         | 2            |
| block_response    | [BlockResponse](#blockresponse)   | Response with requested block                                | 3            |
| status_request    | [StatusRequest](#statusrequest)   | Request the highest and lowest block numbers from a peer     | 4            |
| status_response   | [StatusResponse](#statusresponse)  | Response with the highest and lowest block numbers the store | 5            |
