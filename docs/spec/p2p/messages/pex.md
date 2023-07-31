---
order: 6
---

# Peer Exchange (节点交换)

## Channels (通道)

Pex有一个通道。通道标识符如下所示。

| 名称        | 编号 |
|------------|--------|
| PexChannel | 0      |

## Message Types (消息类型)

当前的PEX服务有两个版本。第一个版本使用IP/端口对，但由于P2P堆栈正在向传输无关的方法迁移，
节点端点需要一个`Protocol`和`Path`，因此V2版本使用[url](https://golang.org/pkg/net/url/#URL)。

### PexRequest (PEX请求)

PexRequest是一个空消息，用于请求对等节点列表。

> EmptyRequest (空请求)

### PexResponse (PEX响应)

PexResponse是一个提供给对等节点拨号的网络地址列表。

| 名称  | 类型                               | 描述                              | 字段编号 |
|-------|------------------------------------|------------------------------------------|--------------|
| addresses | 重复的[PexAddress](#PexAddress) | 可用于拨号的对等节点地址列表 | 1            |

### PexAddress (PEX地址)

PexAddress提供了节点拨号所需的信息。

| 名称 | 类型   | 描述      | 字段编号 |
|------|--------|------------------|--------------|
| id   | string | 对等节点的NodeID | 1            |
| ip   | string | 节点的IP地址 | 2            |
| port | port   | 对等节点的端口   | 3            |


### PexRequestV2 (PEX请求V2)

PexRequest是一个空消息，用于请求对等节点列表。

> EmptyRequest (空请求)

### PexResponseV2 (PEX响应V2)

PexResponse是一个提供给对等节点拨号的网络地址列表。

| 名称  | 类型                               | 描述                              | 字段编号 |
|-------|------------------------------------|------------------------------------------|--------------|
| addresses | 重复的[PexAddressV2](#PexAddressV2) | 可用于拨号的对等节点地址列表 | 1            |

### PexAddressV2 (PEX地址V2)

PexAddress提供了节点拨号所需的信息。

| 名称 | 类型   | 描述      | 字段编号 |
|------|--------|------------------|--------------|
| url   | string | 参见[golang url](https://golang.org/pkg/net/url/#URL) | 1            |

### 消息

消息是一个[`oneof` protobuf类型](https://developers.google.com/protocol-buffers/docs/proto#oneof)。其中的oneof包含两个消息。

| 名称             | 类型                          | 描述                                                  | 字段编号     |
|------------------|-------------------------------|------------------------------------------------------|--------------|
| pex_request      | [PexRequest](#PexRequest)     | 空请求，请求获取要拨号的地址列表                       | 1            |
| pex_response     | [PexResponse](#PexResponse)   | 要拨号的地址列表                                      | 2            |
| pex_request_v2   | [PexRequestV2](#PexRequestV2) | 空请求，请求获取要拨号的地址列表                       | 3            |
| pex_response_v2  | [PexRespinseV2](#PexResponseV2) | 要拨号的地址列表                                      | 4            |


---
order: 6
---

# Peer Exchange

## Channels

Pex has one channel. The channel identifier is listed below.

| Name       | Number |
|------------|--------|
| PexChannel | 0      |

## Message Types

The current PEX service has two versions. The first uses IP/port pair but since the p2p stack is moving towards a transport agnostic approach, 
node endpoints require a `Protocol` and `Path` hence the V2 version uses a [url](https://golang.org/pkg/net/url/#URL) instead.

### PexRequest

PexRequest is an empty message requesting a list of peers.

> EmptyRequest

### PexResponse

PexResponse is an list of net addresses provided to a peer to dial.

| Name  | Type                               | Description                              | Field Number |
|-------|------------------------------------|------------------------------------------|--------------|
| addresses | repeated [PexAddress](#PexAddress) | List of peer addresses available to dial | 1            |

### PexAddress

PexAddress provides needed information for a node to dial a peer.

| Name | Type   | Description      | Field Number |
|------|--------|------------------|--------------|
| id   | string | NodeID of a peer | 1            |
| ip   | string | The IP of a node | 2            |
| port | port   | Port of a peer   | 3            |


### PexRequestV2

PexRequest is an empty message requesting a list of peers.

> EmptyRequest

### PexResponseV2

PexResponse is an list of net addresses provided to a peer to dial.

| Name  | Type                               | Description                              | Field Number |
|-------|------------------------------------|------------------------------------------|--------------|
| addresses | repeated [PexAddressV2](#PexAddressV2) | List of peer addresses available to dial | 1            |

### PexAddressV2

PexAddress provides needed information for a node to dial a peer.

| Name | Type   | Description      | Field Number |
|------|--------|------------------|--------------|
| url   | string | See [golang url](https://golang.org/pkg/net/url/#URL) | 1            |

### Message

Message is a [`oneof` protobuf type](https://developers.google.com/protocol-buffers/docs/proto#oneof). The one of consists of two messages.

| Name         | Type                      | Description                                          | Field Number |
|--------------|---------------------------|------------------------------------------------------|--------------|
| pex_request  | [PexRequest](#PexRequest) | Empty request asking for a list of addresses to dial | 1            |
| pex_response | [PexResponse](#PexResponse)  | List of addresses to dial                            | 2            |
| pex_request_v2 | [PexRequestV2](#PexRequestV2) | Empty request asking for a list of addresses to dial | 3         |
| pex_response_v2 | [PexRespinseV2](#PexResponseV2) | List of addresses to dial | 4 |
