---
order: 1
parent:
  title: 消息
  order: 1
---

# 消息

规范的实现由许多组件组成。虽然这些组件的许多部分是特定于实现的，但P2P消息不是。在本节中，我们将介绍所有组件的P2P消息。

P2P消息由消息和通道两部分组成。通道是消息特定的，而消息是特定于Tendermint组件的。当一个节点连接到一个对等节点时，它会告诉对方节点有哪些通道可用。这通知了对等节点连接节点提供的服务。您可以在[connection.md](../connection.md#mconnection)中了解更多关于通道的信息。

- [区块同步](./block-sync.md)
- [内存池](./mempool.md)
- [证据](./evidence.md)
- [状态同步](./state-sync.md)
- [Pex](./pex.md)
- [共识](./consensus.md)


---
order: 1
parent:
  title: Messages
  order: 1
---

# Messages

An implementation of the spec consists of many components. While many parts of these components are implementation specific, the p2p messages are not. In this section we will be covering all the p2p messages of components.

There are two parts to the P2P messages, the message and the channel. The channel is message specific and messages are specific to components of Tendermint. When a node connect to a peer it will tell the other node which channels are available. This notifies the peer what services the connecting node offers. You can read more on channels in [connection.md](../connection.md#mconnection)

- [Block Sync](./block-sync.md)
- [Mempool](./mempool.md)
- [Evidence](./evidence.md)
- [State Sync](./state-sync.md)
- [Pex](./pex.md)
- [Consensus](./consensus.md)
