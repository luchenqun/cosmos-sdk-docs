---
order: 12
---

# 内存池

## 交易排序

目前，除了按照它们到达的顺序（通过RPC或其他节点）之外，没有对交易进行排序。

因此，唯一指定顺序的方法是将它们发送到单个节点。

valA:

- `tx1`
- `tx2`
- `tx3`

如果交易被分散到不同的节点，就无法确保它们按照预期的顺序进行处理。

valA:

- `tx1`
- `tx2`

valB:

- `tx3`

如果valB是提议者，顺序可能是：

- `tx3`
- `tx1`
- `tx2`

如果valA是提议者，顺序可能是：

- `tx1`
- `tx2`
- `tx3`

也就是说，如果交易包含一些内部值，比如订单/nonce/序列号，应用程序可以拒绝顺序错误的交易。因此，如果一个节点接收到`tx3`，然后是`tx1`，它可以拒绝`tx3`，然后接受`tx1`。发送者可以重新尝试发送`tx3`，但在节点看到`tx2`之前，它应该被拒绝。


---
order: 12
---

# Mempool

## Transaction ordering

Currently, there's no ordering of transactions other than the order they've
arrived (via RPC or from other nodes).

So the only way to specify the order is to send them to a single node.

valA:

- `tx1`
- `tx2`
- `tx3`

If the transactions are split up across different nodes, there's no way to
ensure they are processed in the expected order.

valA:

- `tx1`
- `tx2`

valB:

- `tx3`

If valB is the proposer, the order might be:

- `tx3`
- `tx1`
- `tx2`

If valA is the proposer, the order might be:

- `tx1`
- `tx2`
- `tx3`

That said, if the transactions contain some internal value, like an
order/nonce/sequence number, the application can reject transactions that are
out of order. So if a node receives `tx3`, then `tx1`, it can reject `tx3` and then
accept `tx1`. The sender can then retry sending `tx3`, which should probably be
rejected until the node has seen `tx2`.
