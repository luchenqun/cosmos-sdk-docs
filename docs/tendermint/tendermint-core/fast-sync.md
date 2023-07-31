# 快速同步

在工作量证明的区块链中，与链同步的过程与保持与共识的最新状态相同：下载区块，并查找具有最大总工作量的区块。在权益证明中，共识过程更加复杂，因为它涉及节点之间的通信轮次，以确定应该提交的下一个区块。使用这个过程从头开始同步区块链可能需要很长时间。与运行实时共识传播协议相比，仅下载区块并检查验证者的默克尔树要快得多。

## 使用快速同步

为了支持更快的同步，Tendermint提供了一个`fast-sync`模式，默认情况下启用，并可以通过`config.toml`或`--fast_sync=false`进行切换。

在这种模式下，Tendermint守护进程的同步速度比使用实时共识过程快几百倍。一旦追赶上，守护进程将退出快速同步模式，进入正常的共识模式。运行一段时间后，如果节点至少有一个对等节点，并且其高度至少与最大报告的对等节点高度一样高，则认为节点已经“追赶上”。参见[IsCaughtUp方法](https://github.com/tendermint/tendermint/blob/b467515719e686e4678e6da4e102f32a491b85a0/blockchain/pool.go#L128)。

注意：快速同步有三个版本。我们建议使用v0，因为v1和v2仍处于测试阶段。
如果您想使用其他版本，可以通过更改`config.toml`中的版本来实现：

```toml
#######################################################
###       Fast Sync Configuration Connections       ###
#######################################################
[fastsync]

# Fast Sync version to use:
#   1) "v0" (default) - the legacy fast sync implementation
#   2) "v1" - refactor of v0 version for better testability
#   2) "v2" - complete redesign of v0, optimized for testability & readability 
version = "v0"
```

如果我们滞后得足够严重，我们应该返回到快速同步，但这是一个[开放问题](https://github.com/tendermint/tendermint/issues/129)。


---
order: 10
---

# Fast Sync

In a proof of work blockchain, syncing with the chain is the same
process as staying up-to-date with the consensus: download blocks, and
look for the one with the most total work. In proof-of-stake, the
consensus process is more complex, as it involves rounds of
communication between the nodes to determine what block should be
committed next. Using this process to sync up with the blockchain from
scratch can take a very long time. It's much faster to just download
blocks and check the merkle tree of validators than to run the real-time
consensus gossip protocol.

## Using Fast Sync

To support faster syncing, Tendermint offers a `fast-sync` mode, which
is enabled by default, and can be toggled in the `config.toml` or via
`--fast_sync=false`.

In this mode, the Tendermint daemon will sync hundreds of times faster
than if it used the real-time consensus process. Once caught up, the
daemon will switch out of fast sync and into the normal consensus mode.
After running for some time, the node is considered `caught up` if it
has at least one peer and it's height is at least as high as the max
reported peer height. See [the IsCaughtUp
method](https://github.com/tendermint/tendermint/blob/b467515719e686e4678e6da4e102f32a491b85a0/blockchain/pool.go#L128).

Note: There are three versions of fast sync. We recommend using v0 as v1 and v2 are still in beta. 
  If you would like to use a different version you can do so by changing the version in the `config.toml`:

```toml
#######################################################
###       Fast Sync Configuration Connections       ###
#######################################################
[fastsync]

# Fast Sync version to use:
#   1) "v0" (default) - the legacy fast sync implementation
#   2) "v1" - refactor of v0 version for better testability
#   2) "v2" - complete redesign of v0, optimized for testability & readability 
version = "v0"
```

If we're lagging sufficiently, we should go back to fast syncing, but
this is an [open issue](https://github.com/tendermint/tendermint/issues/129).
