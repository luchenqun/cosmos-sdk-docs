---
order: 4
---
# 内存池

## 通道

内存池有一个通道。通道标识符如下所示。

| 名称           | 编号 |
|----------------|------|
| MempoolChannel | 48   |

## 消息类型

目前只有一种消息是内存池通过 p2p gossip 网络（通过反应器）广播和接收的：`TxsMessage`

### Txs

交易列表。这些交易已经根据应用程序的有效性进行了检查。这并不意味着这些交易是有效的，需要应用程序进行检查。

| 名称 | 类型             | 描述               | 字段编号 |
|------|------------------|-------------------|----------|
| txs  | 重复的字节序列 | 交易列表           | 1        |

### Message

消息是一个 [`oneof` protobuf 类型](https://developers.google.com/protocol-buffers/docs/proto#oneof)。其中包含一个消息 [`Txs`](#txs)。

| 名称 | 类型           | 描述               | 字段编号 |
|------|----------------|-------------------|----------|
| txs  | [Txs](#txs) | 交易列表           | 1        |


---
order: 4
---
# Mempool

## Channel

Mempool has one channel. The channel identifier is listed below.

| Name           | Number |
|----------------|--------|
| MempoolChannel | 48     |

## Message Types

There is currently only one message that Mempool broadcasts and receives over
the p2p gossip network (via the reactor): `TxsMessage`

### Txs

A list of transactions. These transactions have been checked against the application for validity. This does not mean that the transactions are valid, it is up to the application to check this.

| Name | Type           | Description          | Field Number |
|------|----------------|----------------------|--------------|
| txs  | repeated bytes | List of transactions | 1            |

### Message

Message is a [`oneof` protobuf type](https://developers.google.com/protocol-buffers/docs/proto#oneof). The one of consists of one message [`Txs`](#txs).

| Name | Type        | Description           | Field Number |
|------|-------------|-----------------------|--------------|
| txs  | [Txs](#txs) | List of transactions | 1            |
