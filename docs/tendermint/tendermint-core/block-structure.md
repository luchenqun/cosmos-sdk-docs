# 区块结构

Tendermint 共识引擎将所有节点的超过半数的一致记录在一个区块链中，该区块链在所有节点之间进行复制。可以通过各种 RPC 端点访问该区块链，主要包括 `/block?height=` 以获取完整的区块，以及 `/blockchain?minHeight=_&maxHeight=_` 以获取头部列表。但是，这些区块中究竟存储了什么呢？

[规范](https://github.com/tendermint/spec/blob/8dd2ed4c6fe12459edeb9b783bdaaaeb590ec15c/spec/core/data_structures.md)中详细描述了每个组件 - 这是开始的最佳位置。

要深入了解，请查看 [types package 文档](https://godoc.org/github.com/tendermint/tendermint/types)。


---
order: 8
---

# Block Structure

The Tendermint consensus engine records all agreements by a
supermajority of nodes into a blockchain, which is replicated among all
nodes. This blockchain is accessible via various RPC endpoints, mainly
`/block?height=` to get the full block, as well as
`/blockchain?minHeight=_&maxHeight=_` to get a list of headers. But what
exactly is stored in these blocks?

The [specification](https://github.com/tendermint/spec/blob/8dd2ed4c6fe12459edeb9b783bdaaaeb590ec15c/spec/core/data_structures.md) contains a detailed description of each component - that's the best place to get started.

To dig deeper, check out the [types package documentation](https://godoc.org/github.com/tendermint/tendermint/types).
