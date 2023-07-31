---
order: 3
---

# 证据

## 通道

证据有一个通道。通道标识符如下所示。

| 名称            | 编号 |
|-----------------|------|
| EvidenceChannel | 56   |

## 消息类型

### 证据列表

证据列表包含一系列已验证的证据。这些证据已经在整个网络中传播。证据列表在两个地方使用，作为点对点消息和在区块[block](../../core/data_structures.md#block)中。

| 名称     | 类型                                                        | 描述                  | 字段编号 |
|----------|-------------------------------------------------------------|----------------------|----------|
| evidence | repeated [Evidence](../../core/data_structures.md#evidence) | 有效证据的列表        | 1        |


---
order: 3
---

# Evidence

## Channel

Evidence has one channel. The channel identifier is listed below.

| Name            | Number |
|-----------------|--------|
| EvidenceChannel | 56     |

## Message Types

### EvidenceList

EvidenceList consists of a list of verified evidence. This evidence will already have been propagated throughout the network. EvidenceList is used in two places, as a p2p message and within the block [block](../../core/data_structures.md#block) as well.

| Name     | Type                                                        | Description            | Field Number |
|----------|-------------------------------------------------------------|------------------------|--------------|
| evidence | repeated [Evidence](../../core/data_structures.md#evidence) | List of valid evidence | 1            |
