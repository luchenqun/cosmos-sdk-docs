# WAL（写前日志）

共识模块将每个消息写入WAL（写前日志）。

对于由该节点签名的消息，它还会通过[File#Sync](https://golang.org/pkg/os/#File.Sync)发出fsync系统调用（以防止重复签名）。

在底层，它使用[autofile.Group](https://godoc.org/github.com/tendermint/tmlibs/autofile#Group)，当文件变得太大（> 10MB）时会进行文件轮转。

总的最大大小为1GB。我们只需要最新的区块和前一个区块，但如果前者在许多轮中拖延，我们希望所有这些轮都能得到。

## 重放

在崩溃之前，共识模块将重放写入WAL的最后一个高度的所有消息（如果发生这样的情况）。

在重放过程中，私有验证器可能会尝试签名消息，因为它运行得相对独立，不知道重放过程。

例如，如果我们在WAL中一直到预提交（precommit）然后崩溃，之后我们重放提案消息，私有验证器将尝试签名一个预投票（prevote）。但它会失败。这没关系，因为我们将在WAL中看到预投票。然后它将进入预提交（precommit），这次它将成功，因为私有验证器包含了`LastSignBytes`，然后我们将从WAL中重放预提交。

请务必阅读关于[WAL损坏](https://github.com/tendermint/tendermint/blob/v0.34.x/docs/tendermint-core/running-in-production.md#wal-corruption)和恢复策略的内容。


# WAL

Consensus module writes every message to the WAL (write-ahead log).

It also issues fsync syscall through
[File#Sync](https://golang.org/pkg/os/#File.Sync) for messages signed by this
node (to prevent double signing).

Under the hood, it uses
[autofile.Group](https://godoc.org/github.com/tendermint/tmlibs/autofile#Group),
which rotates files when those get too big (> 10MB).

The total maximum size is 1GB. We only need the latest block and the block before it,
but if the former is dragging on across many rounds, we want all those rounds.

## Replay

Consensus module will replay all the messages of the last height written to WAL
before a crash (if such occurs).

The private validator may try to sign messages during replay because it runs
somewhat autonomously and does not know about replay process.

For example, if we got all the way to precommit in the WAL and then crash,
after we replay the proposal message, the private validator will try to sign a
prevote. But it will fail. That's ok because we’ll see the prevote later in the
WAL. Then it will go to precommit, and that time it will work because the
private validator contains the `LastSignBytes` and then we’ll replay the
precommit from the WAL.

Make sure to read about [WAL corruption](https://github.com/tendermint/tendermint/blob/v0.34.x/docs/tendermint-core/running-in-production.md#wal-corruption)
and recovery strategies.
