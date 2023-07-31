---
order: 4
---

# 在生产环境中运行

## 数据库

默认情况下，Tendermint使用`syndtr/goleveldb`包作为其进程内键值数据库。如果您想要最大的性能，最好安装真正的C实现LevelDB，并使用`make build TENDERMINT_BUILD_OPTIONS=cleveldb`编译Tendermint。有关详细信息，请参阅[安装说明](../introduction/install.md)。

Tendermint在`$TMROOT/data`目录中保留多个不同的数据库：

- `blockstore.db`：保存整个区块链 - 存储块、块提交和块元数据，每个都按高度索引。用于同步新的对等节点。
- `evidence.db`：存储所有经过验证的不良行为证据。
- `state.db`：存储当前的区块链状态（即高度、验证器、共识参数）。只有在共识参数或验证器更改时才会增长。还用于在块处理过程中临时存储中间结果。
- `tx_index.db`：通过交易哈希和DeliverTx结果事件对交易进行索引。

默认情况下，Tendermint只会按照其哈希和高度对交易进行索引，而不是按照其DeliverTx结果事件进行索引。有关详细信息，请参阅[索引交易](../app-dev/indexing-transactions.md)。

应用程序可以向节点操作员公开块修剪策略。请阅读您的应用程序文档以了解更多详细信息。

应用程序可以使用[state sync](state-sync.md)来帮助节点快速引导。

## 日志记录

默认的日志记录级别（`log_level = "main:info,state:info,statesync:info,*:error"`）应该足够正常操作。阅读[此文章](https://blog.cosmos.network/one-of-the-exciting-new-features-in-0-10-0-release-is-smart-log-level-flag-e2506b4ab756)以了解如何配置`log_level`配置变量的详细信息。一些模块可以在[这里](./how-to-read-logs.md#list-of-modules)找到。如果您正在尝试调试Tendermint或被要求提供具有调试日志记录级别的日志，可以通过使用`--log_level="*:debug"`运行Tendermint来实现。

## 预写日志（WAL）

Tendermint在共识（`cs.wal`）和内存池（`mempool.wal`）中使用预写日志。两个WAL的最大大小为1GB，并且会自动进行轮换。

### 共识 WAL

`consensus.wal` 用于确保我们可以从共识状态机的任何点崩溃中恢复。
它将所有共识消息（超时、提案、区块部分或投票）写入单个文件，在处理自己的验证节点的消息之前刷新到磁盘。
由于预期 Tendermint 验证节点永远不会签署冲突的投票，WAL 确保我们始终可以确定性地恢复到最新的共识状态，而无需使用网络或重新签署任何共识消息。

如果你的 `consensus.wal` 文件损坏，请参考[下文](#wal-corruption)。

### Mempool WAL

`mempool.wal` 在运行 CheckTx 之前记录所有传入的交易，但在程序化的方式上不会被使用。
它只是一种手动的安全保护措施。请注意，mempool 不提供持久性保证 - 如果一个或多个节点在能够提议之前崩溃，那么发送到一个或多个节点的交易可能永远不会进入区块链。
客户端必须通过订阅 WebSocket、轮询或使用 `/broadcast_tx_commit` 来监视它们的交易。
在最坏的情况下，交易可以从 mempool WAL 手动重新发送。

出于上述原因，默认情况下禁用了 `mempool.wal`。要启用它，请将 `mempool.wal_dir` 设置为 WAL 的位置（例如 `data/mempool.wal`）。

## DOS 暴露和缓解

验证节点应该设置[Sentry 节点架构](./validators.md)以防止拒绝服务攻击。

### P2P

Tendermint 点对点系统的核心是 `MConnection`。每个连接都有 `MaxPacketMsgPayloadSize`，即最大数据包大小和有界的发送和接收队列。
可以对每个连接强加发送和接收速率限制（`SendRate`、`RecvRate`）。

打开的 P2P 连接数量可能会变得非常大，并达到操作系统的打开文件限制（因为在基于 UNIX 的系统中，TCP 连接被视为文件）。
节点应该通过 `ulimit -n 8192` 或其他部署特定的机制来设置较大的打开文件限制，例如 8192。

### RPC

默认情况下，返回多个条目的端点限制为返回 30 个元素（最多 100 个）。有关更多信息，请参阅[RPC 文档](https://docs.tendermint.com/v0.34/rpc/)。

速率限制和身份验证是帮助防止DOS攻击的另一个关键方面。验证者应该使用像[NGINX](https://www.nginx.com/blog/rate-limiting-nginx/)或[traefik](https://docs.traefik.io/middlewares/ratelimit/)这样的外部工具来实现相同的功能。

## 调试 Tendermint

如果您需要调试 Tendermint，您应该首先查看日志。请参阅[如何阅读日志](./how-to-read-logs.md)，我们在其中解释了某些日志语句的含义。

如果在浏览日志后仍然不清楚情况，下一步可以尝试查询 `/status` RPC 端点。它提供了必要的信息：节点是否正在同步，所在的高度等等。

```bash
curl http(s)://{ip}:{rpcPort}/status
```

`/dump_consensus_state` 将为您提供共识状态的详细概述（提案者、最新验证者、节点状态）。通过它，您应该能够弄清楚为什么网络停止运行，例如。

```bash
curl http(s)://{ip}:{rpcPort}/dump_consensus_state
```

这个端点还有一个简化版本 - `/consensus_state`，它只返回当前高度上看到的投票。

如果在查看日志和上述端点后，您仍然不知道发生了什么，请考虑使用 `tendermint debug kill` 子命令。此命令将收集所有可用的信息并终止进程。请参阅[调试](../tools/debugging.md)以获取确切的格式。

您可以自己检查生成的存档，或在[Github](https://github.com/tendermint/tendermint)上创建一个问题。但在打开问题之前，请确保先检查是否已经存在[现有问题](https://github.com/tendermint/tendermint/issues)。

## 监控 Tendermint

每个 Tendermint 实例都有一个标准的 `/health` RPC 端点，如果一切正常，它将返回 200 (OK)，如果有问题，则返回 500 (或无响应)。

其他有用的端点包括前面提到的 `/status`、`/net_info` 和 `/validators`。

Tendermint 还可以报告和提供 Prometheus 指标。请参阅[指标](./metrics.md)。

`tendermint debug dump`子命令可用于定期将有用的信息转储到存档中。有关更多信息，请参阅[调试](../tools/debugging.md)。

## 当我的应用程序崩溃时会发生什么

您应该在[进程监控器](https://en.wikipedia.org/wiki/Process_supervision)（如systemd或runit）下运行Tendermint。它将确保Tendermint始终运行（尽管可能出现错误）。

回到最初的问题，如果您的应用程序崩溃，Tendermint将会出现恐慌。在进程监控器重新启动您的应用程序后，Tendermint应该能够成功重新连接。重启的顺序对此无关紧要。

## 信号处理

我们捕获SIGINT和SIGTERM信号，并尝试进行清理。对于其他信号，我们使用Go语言中的默认行为：[Go程序中信号的默认行为](https://golang.org/pkg/os/signal/#hdr-Default_behavior_of_signals_in_Go_programs)。

## 数据损坏

**注意：**确保您备份了Tendermint数据目录。

### 可能的原因

请记住，大多数损坏是由硬件问题引起的：

- 带有故障/耗尽电池备份和意外断电的RAID控制器
- 启用写回缓存并发生意外断电的硬盘驱动器
- 廉价SSD缺乏足够的断电保护，并发生意外断电
- 有缺陷的RAM
- 有缺陷或过热的CPU

其他原因可能包括：

- 配置为fsync=off的数据库系统以及操作系统崩溃或断电
- 配置为使用写屏障的文件系统，加上忽略写屏障的存储层。LVM是一个特别的罪魁祸首。
- Tendermint的错误
- 操作系统的错误
- 管理员错误（例如，直接修改Tendermint数据目录的内容）

（来源：<https://wiki.postgresql.org/wiki/Corruption>）

### WAL损坏

如果共识WAL在最新高度处于损坏状态，并且您尝试启动Tendermint，则重放将失败并出现恐慌。

从数据损坏中恢复可能很困难且耗时。以下是两种方法：

1. 删除WAL文件并重新启动Tendermint。它将尝试与其他节点同步。
2. 尝试手动修复WAL文件：

1）创建损坏的WAL文件的备份：

```sh
    cp "$TMHOME/data/cs.wal/wal" > /tmp/corrupted_wal_backup
    ```

2) Use `./scripts/wal2json` to create a human-readable version:

    ```sh
    ./scripts/wal2json/wal2json "$TMHOME/data/cs.wal/wal" > /tmp/corrupted_wal
    ```

3)  Search for a "CORRUPTED MESSAGE" line.
4)  By looking at the previous message and the message after the corrupted one
   and looking at the logs, try to rebuild the message. If the consequent
   messages are marked as corrupted too (this may happen if length header
   got corrupted or some writes did not make it to the WAL ~ truncation),
   then remove all the lines starting from the corrupted one and restart
   Tendermint.

    ```sh
    $EDITOR /tmp/corrupted_wal
    ```

5)  After editing, convert this file back into binary form by running:

    ```sh
    ./scripts/json2wal/json2wal /tmp/corrupted_wal  $TMHOME/data/cs.wal/wal
    ```

## Hardware

### Processor and Memory

While actual specs vary depending on the load and validators count, minimal
requirements are:

- 1GB RAM
- 25GB of disk space
- 1.4 GHz CPU

SSD disks are preferable for applications with high transaction throughput.

Recommended:

- 2GB RAM
- 100GB SSD
- x64 2.0 GHz 2v CPU

While for now, Tendermint stores all the history and it may require significant
disk space over time, we are planning to implement state syncing (See [this
issue](https://github.com/tendermint/tendermint/issues/828)). So, storing all
the past blocks will not be necessary.

### Validator signing on 32 bit architectures (or ARM)

Both our `ed25519` and `secp256k1` implementations require constant time
`uint64` multiplication. Non-constant time crypto can (and has) leaked
private keys on both `ed25519` and `secp256k1`. This doesn't exist in hardware
on 32 bit x86 platforms ([source](https://bearssl.org/ctmul.html)), and it
depends on the compiler to enforce that it is constant time. It's unclear at
this point whenever the Golang compiler does this correctly for all
implementations.

**We do not support nor recommend running a validator on 32 bit architectures OR
the "VIA Nano 2000 Series", and the architectures in the ARM section rated
"S-".**

### Operating Systems

Tendermint can be compiled for a wide range of operating systems thanks to Go
language (the list of \$OS/\$ARCH pairs can be found
[here](https://golang.org/doc/install/source#environment)).

While we do not favor any operation system, more secure and stable Linux server
distributions (like Centos) should be preferred over desktop operation systems
(like Mac OS).

### Miscellaneous

NOTE: if you are going to use Tendermint in a public domain, make sure
you read [hardware recommendations](https://cosmos.network/validators) for a validator in the
Cosmos network.

## Configuration parameters

- `p2p.flush_throttle_timeout`
- `p2p.max_packet_msg_payload_size`
- `p2p.send_rate`
- `p2p.recv_rate`

If you are going to use Tendermint in a private domain and you have a
private high-speed network among your peers, it makes sense to lower
flush throttle timeout and increase other params.

```toml
[p2p]

send_rate=20000000 # 2MB/s
recv_rate=20000000 # 2MB/s
flush_throttle_timeout=10
max_packet_msg_payload_size=10240 # 10KB
```

- `mempool.recheck`

After every block, Tendermint rechecks every transaction left in the
mempool to see if transactions committed in that block affected the
application state, so some of the transactions left may become invalid.
If that does not apply to your application, you can disable it by
setting `mempool.recheck=false`.

- `mempool.broadcast`

Setting this to false will stop the mempool from relaying transactions
to other peers until they are included in a block. It means only the
peer you send the tx to will see it until it is included in a block.

- `consensus.skip_timeout_commit`

We want `skip_timeout_commit=false` when there is economics on the line
because proposers should wait to hear for more votes. But if you don't
care about that and want the fastest consensus, you can skip it. It will
be kept false by default for public deployments (e.g. [Cosmos
Hub](https://cosmos.network/intro/hub)) while for enterprise
applications, setting it to true is not a problem.

- `consensus.peer_gossip_sleep_duration`

You can try to reduce the time your node sleeps before checking if
theres something to send its peers.

- `consensus.timeout_commit`

You can also try lowering `timeout_commit` (time we sleep before
proposing the next block).

- `p2p.addr_book_strict`

By default, Tendermint checks whenever a peer's address is routable before
saving it to the address book. The address is considered as routable if the IP
is [valid and within allowed
ranges](https://github.com/tendermint/tendermint/blob/27bd1deabe4ba6a2d9b463b8f3e3f1e31b993e61/p2p/netaddress.go#L209).

This may not be the case for private or local networks, where your IP range is usually
strictly limited and private. If that case, you need to set `addr_book_strict`
to `false` (turn it off).

- `rpc.max_open_connections`

By default, the number of simultaneous connections is limited because most OS
give you limited number of file descriptors.

If you want to accept greater number of connections, you will need to increase
these limits.

[Sysctls to tune the system to be able to open more connections](https://github.com/satori-com/tcpkali/blob/master/doc/tcpkali.man.md#sysctls-to-tune-the-system-to-be-able-to-open-more-connections)

The process file limits must also be increased, e.g. via `ulimit -n 8192`.

...for N connections, such as 50k:

```md
kern.maxfiles=10000+2*N         # BSD
kern.maxfilesperproc=100+2*N    # BSD
kern.ipc.maxsockets=10000+2*N   # BSD
fs.file-max=10000+2*N           # Linux
net.ipv4.tcp_max_orphans=N      # Linux

# 用于生成负载的客户端。
net.ipv4.ip_local_port_range="10000  65535"  # Linux.
net.inet.ip.portrange.first=10000  # BSD/Mac.
net.inet.ip.portrange.last=65535   # (对于 N < 55535 足够)
net.ipv4.tcp_tw_reuse=1         # Linux
net.inet.tcp.maxtcptw=2*N       # BSD

# 如果在Linux上使用netfilter：
net.netfilter.nf_conntrack_max=N
echo $((N/8)) > /sys/module/nf_conntrack/parameters/hashsize
```

类似的选项也适用于限制gRPC连接的数量 - `rpc.grpc_max_open_connections`。


---
order: 4
---

# Running in production

## Database

By default, Tendermint uses the `syndtr/goleveldb` package for its in-process
key-value database. If you want maximal performance, it may be best to install
the real C-implementation of LevelDB and compile Tendermint to use that using
`make build TENDERMINT_BUILD_OPTIONS=cleveldb`. See the [install
instructions](../introduction/install.md) for details.

Tendermint keeps multiple distinct databases in the `$TMROOT/data`:

- `blockstore.db`: Keeps the entire blockchain - stores blocks,
  block commits, and block meta data, each indexed by height. Used to sync new
  peers.
- `evidence.db`: Stores all verified evidence of misbehaviour.
- `state.db`: Stores the current blockchain state (ie. height, validators,
  consensus params). Only grows if consensus params or validators change. Also
  used to temporarily store intermediate results during block processing.
- `tx_index.db`: Indexes txs (and their results) by tx hash and by DeliverTx result events.

By default, Tendermint will only index txs by their hash and height, not by their DeliverTx
result events. See [indexing transactions](../app-dev/indexing-transactions.md) for
details.

Applications can expose block pruning strategies to the node operator. Please read the documentation of your application
to find out more details.

Applications can use [state sync](state-sync.md) to help nodes bootstrap quickly.

## Logging

Default logging level (`log_level = "main:info,state:info,statesync:info,*:error"`) should suffice for
normal operation mode. Read [this
post](https://blog.cosmos.network/one-of-the-exciting-new-features-in-0-10-0-release-is-smart-log-level-flag-e2506b4ab756)
for details on how to configure `log_level` config variable. Some of the
modules can be found [here](./how-to-read-logs.md#list-of-modules). If
you're trying to debug Tendermint or asked to provide logs with debug
logging level, you can do so by running Tendermint with
`--log_level="*:debug"`.

## Write Ahead Logs (WAL)

Tendermint uses write ahead logs for the consensus (`cs.wal`) and the mempool
(`mempool.wal`). Both WALs have a max size of 1GB and are automatically rotated.

### Consensus WAL

The `consensus.wal` is used to ensure we can recover from a crash at any point
in the consensus state machine.
It writes all consensus messages (timeouts, proposals, block part, or vote)
to a single file, flushing to disk before processing messages from its own
validator. Since Tendermint validators are expected to never sign a conflicting vote, the
WAL ensures we can always recover deterministically to the latest state of the consensus without
using the network or re-signing any consensus messages.

If your `consensus.wal` is corrupted, see [below](#wal-corruption).

### Mempool WAL

The `mempool.wal` logs all incoming txs before running CheckTx, but is
otherwise not used in any programmatic way. It's just a kind of manual
safe guard. Note the mempool provides no durability guarantees - a tx sent to one or many nodes
may never make it into the blockchain if those nodes crash before being able to
propose it. Clients must monitor their txs by subscribing over websockets,
polling for them, or using `/broadcast_tx_commit`. In the worst case, txs can be
resent from the mempool WAL manually.

For the above reasons, the `mempool.wal` is disabled by default. To enable, set
`mempool.wal_dir` to where you want the WAL to be located (e.g.
`data/mempool.wal`).

## DOS Exposure and Mitigation

Validators are supposed to setup [Sentry Node
Architecture](./validators.md)
to prevent Denial-of-service attacks.

### P2P

The core of the Tendermint peer-to-peer system is `MConnection`. Each
connection has `MaxPacketMsgPayloadSize`, which is the maximum packet
size and bounded send & receive queues. One can impose restrictions on
send & receive rate per connection (`SendRate`, `RecvRate`).

The number of open P2P connections can become quite large, and hit the operating system's open
file limit (since TCP connections are considered files on UNIX-based systems). Nodes should be
given a sizable open file limit, e.g. 8192, via `ulimit -n 8192` or other deployment-specific
mechanisms.

### RPC

Endpoints returning multiple entries are limited by default to return 30
elements (100 max). See the [RPC Documentation](https://docs.tendermint.com/v0.34/rpc/)
for more information.

Rate-limiting and authentication are another key aspects to help protect
against DOS attacks. Validators are supposed to use external tools like
[NGINX](https://www.nginx.com/blog/rate-limiting-nginx/) or
[traefik](https://docs.traefik.io/middlewares/ratelimit/)
to achieve the same things.

## Debugging Tendermint

If you ever have to debug Tendermint, the first thing you should probably do is
check out the logs. See [How to read logs](./how-to-read-logs.md), where we
explain what certain log statements mean.

If, after skimming through the logs, things are not clear still, the next thing
to try is querying the `/status` RPC endpoint. It provides the necessary info:
whenever the node is syncing or not, what height it is on, etc.

```bash
curl http(s)://{ip}:{rpcPort}/status
```

`/dump_consensus_state` will give you a detailed overview of the consensus
state (proposer, latest validators, peers states). From it, you should be able
to figure out why, for example, the network had halted.

```bash
curl http(s)://{ip}:{rpcPort}/dump_consensus_state
```

There is a reduced version of this endpoint - `/consensus_state`, which returns
just the votes seen at the current height.

If, after consulting with the logs and above endpoints, you still have no idea
what's happening, consider using `tendermint debug kill` sub-command. This
command will scrap all the available info and kill the process. See
[Debugging](../tools/debugging.md) for the exact format.

You can inspect the resulting archive yourself or create an issue on
[Github](https://github.com/tendermint/tendermint). Before opening an issue
however, be sure to check if there's [no existing
issue](https://github.com/tendermint/tendermint/issues) already.

## Monitoring Tendermint

Each Tendermint instance has a standard `/health` RPC endpoint, which responds
with 200 (OK) if everything is fine and 500 (or no response) - if something is
wrong.

Other useful endpoints include mentioned earlier `/status`, `/net_info` and
`/validators`.

Tendermint also can report and serve Prometheus metrics. See
[Metrics](./metrics.md).

`tendermint debug dump` sub-command can be used to periodically dump useful
information into an archive. See [Debugging](../tools/debugging.md) for more
information.

## What happens when my app dies

You are supposed to run Tendermint under a [process
supervisor](https://en.wikipedia.org/wiki/Process_supervision) (like
systemd or runit). It will ensure Tendermint is always running (despite
possible errors).

Getting back to the original question, if your application dies,
Tendermint will panic. After a process supervisor restarts your
application, Tendermint should be able to reconnect successfully. The
order of restart does not matter for it.

## Signal handling

We catch SIGINT and SIGTERM and try to clean up nicely. For other
signals we use the default behavior in Go: [Default behavior of signals
in Go
programs](https://golang.org/pkg/os/signal/#hdr-Default_behavior_of_signals_in_Go_programs).

## Corruption

**NOTE:** Make sure you have a backup of the Tendermint data directory.

### Possible causes

Remember that most corruption is caused by hardware issues:

- RAID controllers with faulty / worn out battery backup, and an unexpected power loss
- Hard disk drives with write-back cache enabled, and an unexpected power loss
- Cheap SSDs with insufficient power-loss protection, and an unexpected power-loss
- Defective RAM
- Defective or overheating CPU(s)

Other causes can be:

- Database systems configured with fsync=off and an OS crash or power loss
- Filesystems configured to use write barriers plus a storage layer that ignores write barriers. LVM is a particular culprit.
- Tendermint bugs
- Operating system bugs
- Admin error (e.g., directly modifying Tendermint data-directory contents)

(Source: <https://wiki.postgresql.org/wiki/Corruption>)

### WAL Corruption

If consensus WAL is corrupted at the latest height and you are trying to start
Tendermint, replay will fail with panic.

Recovering from data corruption can be hard and time-consuming. Here are two approaches you can take:

1. Delete the WAL file and restart Tendermint. It will attempt to sync with other peers.
2. Try to repair the WAL file manually:

1) Create a backup of the corrupted WAL file:

    ```sh
    cp "$TMHOME/data/cs.wal/wal" > /tmp/corrupted_wal_backup
    ```

2) Use `./scripts/wal2json` to create a human-readable version:

    ```sh
    ./scripts/wal2json/wal2json "$TMHOME/data/cs.wal/wal" > /tmp/corrupted_wal
    ```

3)  Search for a "CORRUPTED MESSAGE" line.
4)  By looking at the previous message and the message after the corrupted one
   and looking at the logs, try to rebuild the message. If the consequent
   messages are marked as corrupted too (this may happen if length header
   got corrupted or some writes did not make it to the WAL ~ truncation),
   then remove all the lines starting from the corrupted one and restart
   Tendermint.

    ```sh
    $EDITOR /tmp/corrupted_wal
    ```

5)  After editing, convert this file back into binary form by running:

    ```sh
    ./scripts/json2wal/json2wal /tmp/corrupted_wal  $TMHOME/data/cs.wal/wal
    ```

## Hardware

### Processor and Memory

While actual specs vary depending on the load and validators count, minimal
requirements are:

- 1GB RAM
- 25GB of disk space
- 1.4 GHz CPU

SSD disks are preferable for applications with high transaction throughput.

Recommended:

- 2GB RAM
- 100GB SSD
- x64 2.0 GHz 2v CPU

While for now, Tendermint stores all the history and it may require significant
disk space over time, we are planning to implement state syncing (See [this
issue](https://github.com/tendermint/tendermint/issues/828)). So, storing all
the past blocks will not be necessary.

### Validator signing on 32 bit architectures (or ARM)

Both our `ed25519` and `secp256k1` implementations require constant time
`uint64` multiplication. Non-constant time crypto can (and has) leaked
private keys on both `ed25519` and `secp256k1`. This doesn't exist in hardware
on 32 bit x86 platforms ([source](https://bearssl.org/ctmul.html)), and it
depends on the compiler to enforce that it is constant time. It's unclear at
this point whenever the Golang compiler does this correctly for all
implementations.

**We do not support nor recommend running a validator on 32 bit architectures OR
the "VIA Nano 2000 Series", and the architectures in the ARM section rated
"S-".**

### Operating Systems

Tendermint can be compiled for a wide range of operating systems thanks to Go
language (the list of \$OS/\$ARCH pairs can be found
[here](https://golang.org/doc/install/source#environment)).

While we do not favor any operation system, more secure and stable Linux server
distributions (like Centos) should be preferred over desktop operation systems
(like Mac OS).

### Miscellaneous

NOTE: if you are going to use Tendermint in a public domain, make sure
you read [hardware recommendations](https://cosmos.network/validators) for a validator in the
Cosmos network.

## Configuration parameters

- `p2p.flush_throttle_timeout`
- `p2p.max_packet_msg_payload_size`
- `p2p.send_rate`
- `p2p.recv_rate`

If you are going to use Tendermint in a private domain and you have a
private high-speed network among your peers, it makes sense to lower
flush throttle timeout and increase other params.

```toml
[p2p]

send_rate=20000000 # 2MB/s
recv_rate=20000000 # 2MB/s
flush_throttle_timeout=10
max_packet_msg_payload_size=10240 # 10KB
```

- `mempool.recheck`

After every block, Tendermint rechecks every transaction left in the
mempool to see if transactions committed in that block affected the
application state, so some of the transactions left may become invalid.
If that does not apply to your application, you can disable it by
setting `mempool.recheck=false`.

- `mempool.broadcast`

Setting this to false will stop the mempool from relaying transactions
to other peers until they are included in a block. It means only the
peer you send the tx to will see it until it is included in a block.

- `consensus.skip_timeout_commit`

We want `skip_timeout_commit=false` when there is economics on the line
because proposers should wait to hear for more votes. But if you don't
care about that and want the fastest consensus, you can skip it. It will
be kept false by default for public deployments (e.g. [Cosmos
Hub](https://cosmos.network/intro/hub)) while for enterprise
applications, setting it to true is not a problem.

- `consensus.peer_gossip_sleep_duration`

You can try to reduce the time your node sleeps before checking if
theres something to send its peers.

- `consensus.timeout_commit`

You can also try lowering `timeout_commit` (time we sleep before
proposing the next block).

- `p2p.addr_book_strict`

By default, Tendermint checks whenever a peer's address is routable before
saving it to the address book. The address is considered as routable if the IP
is [valid and within allowed
ranges](https://github.com/tendermint/tendermint/blob/27bd1deabe4ba6a2d9b463b8f3e3f1e31b993e61/p2p/netaddress.go#L209).

This may not be the case for private or local networks, where your IP range is usually
strictly limited and private. If that case, you need to set `addr_book_strict`
to `false` (turn it off).

- `rpc.max_open_connections`

By default, the number of simultaneous connections is limited because most OS
give you limited number of file descriptors.

If you want to accept greater number of connections, you will need to increase
these limits.

[Sysctls to tune the system to be able to open more connections](https://github.com/satori-com/tcpkali/blob/master/doc/tcpkali.man.md#sysctls-to-tune-the-system-to-be-able-to-open-more-connections)

The process file limits must also be increased, e.g. via `ulimit -n 8192`.

...for N connections, such as 50k:

```md
kern.maxfiles=10000+2*N         # BSD
kern.maxfilesperproc=100+2*N    # BSD
kern.ipc.maxsockets=10000+2*N   # BSD
fs.file-max=10000+2*N           # Linux
net.ipv4.tcp_max_orphans=N      # Linux

# For load-generating clients.
net.ipv4.ip_local_port_range="10000  65535"  # Linux.
net.inet.ip.portrange.first=10000  # BSD/Mac.
net.inet.ip.portrange.last=65535   # (Enough for N < 55535)
net.ipv4.tcp_tw_reuse=1         # Linux
net.inet.tcp.maxtcptw=2*N       # BSD

# If using netfilter on Linux:
net.netfilter.nf_conntrack_max=N
echo $((N/8)) > /sys/module/nf_conntrack/parameters/hashsize
```

The similar option exists for limiting the number of gRPC connections -
`rpc.grpc_max_open_connections`.
