# 节点发现

Tendermint P2P网络中有不同类型的节点，对彼此之间的连接有不同的要求。
本文档描述了Tendermint应该启用哪种类型的节点以及它们应该如何工作。

## 种子节点

种子节点是新节点的第一个联系点。
它们返回已知的活跃节点列表，然后断开连接。

种子节点应该以“爬虫”模式运行PEX反应器的完整节点，
以持续探索并验证节点的可用性。

种子节点应该只回应它所知道的最好节点的一些顶部百分位。
有关节点质量的详细信息，请参阅[peer-exchange文档](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/reactors/pex/pex.md)。

## 新的完整节点

新节点需要一些东西来连接到网络：

- 种子节点列表，可以通过配置文件或标志提供给Tendermint，
  或者由进程内应用程序硬编码到软件中
- `ChainID`，也称为p2p层的`Network`
- 区块链的最新块高度H和哈希HASH。

值`H`和`HASH`必须通过Tendermint之外的手段，并且特定于用户进行接收和协作 - 即通过用户的可信社会共识。
通过社会共识和带外方式验证`H`和`HASH`的要求
是工作量证明和权益证明区块链之间安全模型的基本差异。

有了上述内容，节点然后向一些种子节点查询其链的节点，
拨号这些节点，并与成功连接的节点运行Tendermint协议。

当节点追赶到高度H时，它确保区块哈希与HASH匹配。
如果不匹配，Tendermint将退出，用户必须重试 - 要么他们连接的是错误的节点，
要么他们的社会共识是无效的。

## 重新启动的完整节点

节点在启动时检查其地址簿，并尝试连接其中的节点。
如果在一段时间后无法连接到任何节点，则会回退到种子节点以查找更多节点。

重新启动的完整节点可以运行`blockchain`或`consensus`反应器协议，以从它们上次停止的位置同步到区块链的最新状态。
在权益证明的背景下，如果它们落后足够多（大于解绑期的长度），
它们将需要再次通过带外方式验证最新的`H`和`HASH`，
以确保它们已经同步了正确的链。

## 验证节点

验证节点是与验证者签名密钥进行交互的节点。
这些节点需要最高的安全性，不应接受传入连接。
它们应该与一组受控的“哨兵节点”保持出站连接，作为其代理屏蔽来访问网络的其他部分。

相互了解并信任的验证者可以接受彼此的传入连接，并通过VPN保持直接的私有连接。

## 哨兵节点

哨兵节点是验证节点的守护者，为其提供与网络的其他部分的连接。
它们应该与网络上的其他完整节点保持良好的连接。
哨兵节点可以是动态的，但应该与彼此的某个不断变化的随机子集保持持久连接。
它们应该始终期望从验证节点及其备份节点直接接收传入连接。
它们不会在PEX中报告验证节点的地址，
并且它们对保持的节点质量可能更加严格。

相互信任的验证者所属的哨兵节点可能希望通过VPN与彼此保持持久连接，但在PEX中只偶尔报告彼此。


# Peer Discovery

A Tendermint P2P network has different kinds of nodes with different requirements for connectivity to one another.
This document describes what kind of nodes Tendermint should enable and how they should work.

## Seeds

Seeds are the first point of contact for a new node.
They return a list of known active peers and then disconnect.

Seeds should operate full nodes with the PEX reactor in a "crawler" mode
that continuously explores to validate the availability of peers.

Seeds should only respond with some top percentile of the best peers it knows about.
See [the peer-exchange docs](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/reactors/pex/pex.md) for
 details on peer quality.

## New Full Node

A new node needs a few things to connect to the network:

- a list of seeds, which can be provided to Tendermint via config file or flags,
  or hardcoded into the software by in-process apps
- a `ChainID`, also called `Network` at the p2p layer
- a recent block height, H, and hash, HASH for the blockchain.

The values `H` and `HASH` must be received and corroborated by means external to Tendermint, and specific to the user - ie. via the user's trusted social consensus.
This requirement to validate `H` and `HASH` out-of-band and via social consensus
is the essential difference in security models between Proof-of-Work and Proof-of-Stake blockchains.

With the above, the node then queries some seeds for peers for its chain,
dials those peers, and runs the Tendermint protocols with those it successfully connects to.

When the peer catches up to height H, it ensures the block hash matches HASH.
If not, Tendermint will exit, and the user must try again - either they are connected
to bad peers or their social consensus is invalid.

## Restarted Full Node

A node checks its address book on startup and attempts to connect to peers from there.
If it can't connect to any peers after some time, it falls back to the seeds to find more.

Restarted full nodes can run the `blockchain` or `consensus` reactor protocols to sync up
to the latest state of the blockchain from wherever they were last.
In a Proof-of-Stake context, if they are sufficiently far behind (greater than the length
of the unbonding period), they will need to validate a recent `H` and `HASH` out-of-band again
so they know they have synced the correct chain.

## Validator Node

A validator node is a node that interfaces with a validator signing key.
These nodes require the highest security, and should not accept incoming connections.
They should maintain outgoing connections to a controlled set of "Sentry Nodes" that serve
as their proxy shield to the rest of the network.

Validators that know and trust each other can accept incoming connections from one another and maintain direct private connectivity via VPN.

## Sentry Node

Sentry nodes are guardians of a validator node and provide it access to the rest of the network.
They should be well connected to other full nodes on the network.
Sentry nodes may be dynamic, but should maintain persistent connections to some evolving random subset of each other.
They should always expect to have direct incoming connections from the validator node and its backup(s).
They do not report the validator node's address in the PEX and
they may be more strict about the quality of peers they keep.

Sentry nodes belonging to validators that trust each other may wish to maintain persistent connections via VPN with one another, but only report each other sparingly in the PEX.
