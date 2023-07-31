# 调试

## tendermint debug kill

Tendermint带有一个`debug`子命令，允许您在收集有用信息的同时终止一个正在运行的Tendermint进程，并将其保存为压缩存档。这些信息包括使用的配置、共识状态、网络状态、节点状态、WAL，甚至是进程退出前的堆栈跟踪。在调试故障的Tendermint进程时，这些文件非常有用。

```bash
tendermint debug kill <pid> </path/to/out.zip> --home=</path/to/app.d>
```

将会将调试信息写入一个压缩存档中。该存档将包含以下内容：

```sh
├── config.toml
├── consensus_state.json
├── net_info.json
├── stacktrace.out
├── status.json
└── wal
```

在内部，`debug kill`从`/status`、`/net_info`和`/dump_consensus_state` HTTP端点获取信息，并使用`-6`终止进程，以捕获Go协程的转储。

## Tendermint debug dump

此外，`debug dump`子命令允许您以固定间隔将调试数据转储到压缩存档中。这些存档除了包含共识状态、网络信息、节点状态和WAL之外，还包含了goroutine和堆剖析。

```bash
tendermint debug dump </path/to/out> --home=</path/to/app.d>
```

与`kill`类似，此命令会定期轮询节点，并将调试数据转储到给定目标目录下的压缩存档中。每个存档将包含：

```sh
├── consensus_state.json
├── goroutine.out
├── heap.out
├── net_info.json
├── status.json
└── wal
```

注意：只有在提供了有效的配置文件地址并且配置文件可用时，才会写入goroutine.out和heap.out。此命令是阻塞的，并且会记录任何错误。


# Debugging

## tendermint debug kill

Tendermint comes with a `debug` sub-command that allows you to kill a live
Tendermint process while collecting useful information in a compressed archive.
The information includes the configuration used, consensus state, network
state, the node' status, the WAL, and even the stack trace of the process
before exit. These files can be useful to examine when debugging a faulty
Tendermint process.

```bash
tendermint debug kill <pid> </path/to/out.zip> --home=</path/to/app.d>
```

will write debug info into a compressed archive. The archive will contain the
following:

```sh
├── config.toml
├── consensus_state.json
├── net_info.json
├── stacktrace.out
├── status.json
└── wal
```

Under the hood, `debug kill` fetches info from `/status`, `/net_info`, and
`/dump_consensus_state` HTTP endpoints, and kills the process with `-6`, which
catches the go-routine dump.

## Tendermint debug dump

Also, the `debug dump` sub-command allows you to dump debugging data into
compressed archives at a regular interval. These archives contain the goroutine
and heap profiles in addition to the consensus state, network info, node
status, and even the WAL.

```bash
tendermint debug dump </path/to/out> --home=</path/to/app.d>
```

will perform similarly to `kill` except it only polls the node and
dumps debugging data every frequency seconds to a compressed archive under a
given destination directory. Each archive will contain:

```sh
├── consensus_state.json
├── goroutine.out
├── heap.out
├── net_info.json
├── status.json
└── wal
```

Note: goroutine.out and heap.out will only be written if a profile address is
provided and is operational. This command is blocking and will log any error.
