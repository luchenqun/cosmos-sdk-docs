---
order: 2
---

# 使用 ABCI-CLI

为了方便测试和调试 ABCI 服务器和简单应用程序，我们构建了一个命令行工具 `abci-cli`，用于发送来自命令行的 ABCI 消息。

## 安装

确保已经[安装了 Go](https://golang.org/doc/install)。

接下来，安装 `abci-cli` 工具和示例应用程序：

```sh
git clone https://github.com/tendermint/tendermint.git
cd tendermint
make install_abci
```

现在运行 `abci-cli` 命令查看命令列表：

```sh
Usage:
  abci-cli [command]

Available Commands:
  batch       Run a batch of abci commands against an application
  check_tx    Validate a tx
  commit      Commit the application state and return the Merkle root hash
  console     Start an interactive abci console for multiple commands
  counter     ABCI demo example
  deliver_tx  Deliver a new tx to the application
  kvstore     ABCI demo example
  echo        Have the application echo a message
  help        Help about any command
  info        Get some info about the application
  query       Query the application state
  set_option  Set an options on the application

Flags:
      --abci string      socket or grpc (default "socket")
      --address string   address of application socket (default "tcp://127.0.0.1:26658")
  -h, --help             help for abci-cli
  -v, --verbose          print the command and results as if it were a console session

Use "abci-cli [command] --help" for more information about a command.
```

## KVStore - 第一个示例

`abci-cli` 工具允许我们向应用程序发送 ABCI 消息，以帮助构建和调试它们。

最重要的消息是 `deliver_tx`、`check_tx` 和 `commit`，但还有其他消息用于方便、配置和信息目的。

我们将启动一个 kvstore 应用程序，它与上面安装的 `abci-cli` 同时安装。kvstore 只是将事务存储在 Merkle 树中。

它的代码可以在[这里](https://github.com/tendermint/tendermint/blob/v0.34.x/abci/cmd/abci-cli/abci-cli.go)找到，看起来像这样：

```go
func cmdKVStore(cmd *cobra.Command, args []string) error {
    logger := log.NewTMLogger(log.NewSyncWriter(os.Stdout))

    // Create the application - in memory or persisted to disk
    var app types.Application
    if flagPersist == "" {
        app = kvstore.NewKVStoreApplication()
    } else {
        app = kvstore.NewPersistentKVStoreApplication(flagPersist)
        app.(*kvstore.PersistentKVStoreApplication).SetLogger(logger.With("module", "kvstore"))
    }

    // Start the listener
    srv, err := server.NewServer(flagAddrD, flagAbci, app)
    if err != nil {
        return err
    }
    srv.SetLogger(logger.With("module", "abci-server"))
    if err := srv.Start(); err != nil {
        return err
    }

    // Stop upon receiving SIGTERM or CTRL-C.
    tmos.TrapSignal(logger, func() {
        // Cleanup
        srv.Stop()
    })

    // Run forever.
    select {}
}
```

首先运行：

```sh
abci-cli kvstore
```

然后在另一个终端中运行：

```sh
abci-cli echo hello
abci-cli info
```

你会看到类似以下的输出：

```sh
-> data: hello
-> data.hex: 68656C6C6F
```

和：

```sh
-> data: {"size":0}
-> data.hex: 7B2273697A65223A307D
```

ABCI 应用程序必须提供两个东西：

- 一个套接字服务器
- 一个处理 ABCI 消息的处理程序

当我们运行 `abci-cli` 工具时，我们打开一个新的连接到应用程序的套接字服务器，发送给定的 ABCI 消息，并等待响应。

服务器可以是特定语言的通用服务器，我们提供了一个[Golang 的参考实现](https://github.com/tendermint/tendermint/tree/v0.34.x/abci/server)。查看[其他 ABCI 实现的列表](https://github.com/tendermint/awesome#ecosystem)以获取其他语言的服务器。

处理程序是特定于应用程序的，可以是任意的，只要它是确定性的并符合 ABCI 接口规范。

因此，当我们运行 `abci-cli info` 时，我们打开一个新的连接到 ABCI 服务器，该服务器调用应用程序的 `Info()` 方法，告诉我们 Merkle 树中的事务数量。

现在，由于每个命令都会打开一个新的连接，我们提供了`abci-cli console`和`abci-cli batch`命令，以允许在单个连接上发送多个ABCI消息。

运行`abci-cli console`会将您置于一个交互式控制台中，用于向应用程序发送ABCI消息。

尝试运行以下命令：

```sh
> echo hello
-> code: OK
-> data: hello
-> data.hex: 0x68656C6C6F

> info
-> code: OK
-> data: {"size":0}
-> data.hex: 0x7B2273697A65223A307D

> commit
-> code: OK
-> data.hex: 0x0000000000000000

> deliver_tx "abc"
-> code: OK

> info
-> code: OK
-> data: {"size":1}
-> data.hex: 0x7B2273697A65223A317D

> commit
-> code: OK
-> data.hex: 0x0200000000000000

> query "abc"
-> code: OK
-> log: exists
-> height: 2
-> value: abc
-> value.hex: 616263

> deliver_tx "def=xyz"
-> code: OK

> commit
-> code: OK
-> data.hex: 0x0400000000000000

> query "def"
-> code: OK
-> log: exists
-> height: 3
-> value: xyz
-> value.hex: 78797A
```

请注意，如果我们执行`deliver_tx "abc"`，它将存储`(abc, abc)`，但如果我们执行`deliver_tx "abc=efg"`，它将存储`(abc, efg)`。

类似地，您可以将命令放在一个文件中，并运行`abci-cli --verbose batch < myfile`。

## 计数器 - 另一个示例

既然我们已经掌握了使用方法，让我们尝试另一个应用程序，即"计数器"应用。

与kvstore应用程序一样，它的代码可以在[这里](https://github.com/tendermint/tendermint/blob/v0.34.x/abci/cmd/abci-cli/abci-cli.go)找到，代码如下：

```go
func cmdCounter(cmd *cobra.Command, args []string) error {

    app := counter.NewCounterApplication(flagSerial)

    logger := log.NewTMLogger(log.NewSyncWriter(os.Stdout))

    // Start the listener
    srv, err := server.NewServer(flagAddrC, flagAbci, app)
    if err != nil {
        return err
    }
    srv.SetLogger(logger.With("module", "abci-server"))
    if err := srv.Start(); err != nil {
        return err
    }

    // Stop upon receiving SIGTERM or CTRL-C.
    tmos.TrapSignal(logger, func() {
        // Cleanup
        srv.Stop()
    })

    // Run forever.
    select {}
}
```

计数器应用程序不使用Merkle树，它只是计算我们发送事务的次数、请求哈希的次数或提交状态的次数。`commit`的结果只是发送的事务数量。

该应用程序有两种模式：`serial=off`和`serial=on`。

当`serial=on`时，事务必须是以大端编码的递增整数，从0开始。

如果`serial=off`，则对事务没有任何限制。

我们可以使用`set_option` ABCI消息切换`serial`的值。

当`serial=on`时，某些事务是无效的。在实时区块链中，事务在存储到内存或传播给其他节点之前会在内存中积累。为了避免浪费资源在无效的事务上，ABCI提供了`check_tx`消息，应用程序开发人员可以使用它来接受或拒绝事务。

在此计数器应用程序的实例中，`check_tx`仅允许整数大于上一个提交的整数的事务。

让我们关闭控制台和kvstore应用程序，并启动计数器应用程序：

```sh
abci-cli counter
```

在另一个窗口中，启动`abci-cli console`：

```sh
> set_option serial on
-> code: OK
-> log: OK (SetOption doesn't return anything.)

> check_tx 0x00
-> code: OK

> check_tx 0xff
-> code: OK

> deliver_tx 0x00
-> code: OK

> check_tx 0x00
-> code: BadNonce
-> log: Invalid nonce. Expected >= 1, got 0

> deliver_tx 0x01
-> code: OK

> deliver_tx 0x04
-> code: BadNonce
-> log: Invalid nonce. Expected 2, got 4

> info
-> code: OK
-> data: {"hashes":0,"txs":2}
-> data.hex: 0x7B22686173686573223A302C22747873223A327D
```

这是一个非常简单的应用程序，但在 `counter` 和 `kvstore` 之间，很容易看出你可以在 ABCI 之上构建任意应用程序状态。[Hyperledger's Burrow](https://github.com/hyperledger/burrow) 也运行在 ABCI 之上，带来了类似以太坊的账户、以太坊虚拟机、Monax 的权限方案和本地合约扩展。

但最终的灵活性来自于能够轻松地用任何语言编写应用程序。

我们已经在多种语言中实现了计数器 [请参见示例目录](https://github.com/tendermint/tendermint/tree/v0.34.x/abci/example)。

要运行 Node.js 版本，请先下载并安装 [Javascript ABCI 服务器](https://github.com/tendermint/js-abci)：

```sh
git clone https://github.com/tendermint/js-abci.git
cd js-abci
npm install abci
```

现在你可以启动应用程序：

```sh
node example/counter.js
```

（你需要终止其他计数器应用程序进程）。在另一个窗口中，运行控制台和之前的 ABCI 命令。你应该得到与 Go 版本相同的结果。

## 悬赏

想要用你喜欢的语言编写计数器应用程序吗？！我们很乐意将你添加到我们的[生态系统](https://github.com/tendermint/awesome#ecosystem)！请参阅来自[Interchain Foundation](https://interchain.io/)的[资助机会](https://github.com/interchainio/funding)，用于在新语言中实现等等。

`abci-cli` 严格用于测试和调试。在实际部署中，发送消息的角色由 Tendermint 承担，它使用三个独立的连接与应用程序连接，每个连接都有自己的消息模式。

有关更多信息，请参阅[应用程序开发者指南](./app-development.md)。有关使用 Tendermint 运行 ABCI 应用程序的示例，请参阅[入门指南](./getting-started.md)。接下来是 ABCI 规范。


---
order: 2
---

# Using ABCI-CLI

To facilitate testing and debugging of ABCI servers and simple apps, we
built a CLI, the `abci-cli`, for sending ABCI messages from the command
line.

## Install

Make sure you [have Go installed](https://golang.org/doc/install).

Next, install the `abci-cli` tool and example applications:

```sh
git clone https://github.com/tendermint/tendermint.git
cd tendermint
make install_abci
```

Now run `abci-cli` to see the list of commands:

```sh
Usage:
  abci-cli [command]

Available Commands:
  batch       Run a batch of abci commands against an application
  check_tx    Validate a tx
  commit      Commit the application state and return the Merkle root hash
  console     Start an interactive abci console for multiple commands
  counter     ABCI demo example
  deliver_tx  Deliver a new tx to the application
  kvstore     ABCI demo example
  echo        Have the application echo a message
  help        Help about any command
  info        Get some info about the application
  query       Query the application state
  set_option  Set an options on the application

Flags:
      --abci string      socket or grpc (default "socket")
      --address string   address of application socket (default "tcp://127.0.0.1:26658")
  -h, --help             help for abci-cli
  -v, --verbose          print the command and results as if it were a console session

Use "abci-cli [command] --help" for more information about a command.
```

## KVStore - First Example

The `abci-cli` tool lets us send ABCI messages to our application, to
help build and debug them.

The most important messages are `deliver_tx`, `check_tx`, and `commit`,
but there are others for convenience, configuration, and information
purposes.

We'll start a kvstore application, which was installed at the same time
as `abci-cli` above. The kvstore just stores transactions in a merkle
tree.

Its code can be found
[here](https://github.com/tendermint/tendermint/blob/v0.34.x/abci/cmd/abci-cli/abci-cli.go)
and looks like:

```go
func cmdKVStore(cmd *cobra.Command, args []string) error {
    logger := log.NewTMLogger(log.NewSyncWriter(os.Stdout))

    // Create the application - in memory or persisted to disk
    var app types.Application
    if flagPersist == "" {
        app = kvstore.NewKVStoreApplication()
    } else {
        app = kvstore.NewPersistentKVStoreApplication(flagPersist)
        app.(*kvstore.PersistentKVStoreApplication).SetLogger(logger.With("module", "kvstore"))
    }

    // Start the listener
    srv, err := server.NewServer(flagAddrD, flagAbci, app)
    if err != nil {
        return err
    }
    srv.SetLogger(logger.With("module", "abci-server"))
    if err := srv.Start(); err != nil {
        return err
    }

    // Stop upon receiving SIGTERM or CTRL-C.
    tmos.TrapSignal(logger, func() {
        // Cleanup
        srv.Stop()
    })

    // Run forever.
    select {}
}
```

Start by running:

```sh
abci-cli kvstore
```

And in another terminal, run

```sh
abci-cli echo hello
abci-cli info
```

You'll see something like:

```sh
-> data: hello
-> data.hex: 68656C6C6F
```

and:

```sh
-> data: {"size":0}
-> data.hex: 7B2273697A65223A307D
```

An ABCI application must provide two things:

- a socket server
- a handler for ABCI messages

When we run the `abci-cli` tool we open a new connection to the
application's socket server, send the given ABCI message, and wait for a
response.

The server may be generic for a particular language, and we provide a
[reference implementation in
Golang](https://github.com/tendermint/tendermint/tree/v0.34.x/abci/server). See the
[list of other ABCI implementations](https://github.com/tendermint/awesome#ecosystem) for servers in
other languages.

The handler is specific to the application, and may be arbitrary, so
long as it is deterministic and conforms to the ABCI interface
specification.

So when we run `abci-cli info`, we open a new connection to the ABCI
server, which calls the `Info()` method on the application, which tells
us the number of transactions in our Merkle tree.

Now, since every command opens a new connection, we provide the
`abci-cli console` and `abci-cli batch` commands, to allow multiple ABCI
messages to be sent over a single connection.

Running `abci-cli console` should drop you in an interactive console for
speaking ABCI messages to your application.

Try running these commands:

```sh
> echo hello
-> code: OK
-> data: hello
-> data.hex: 0x68656C6C6F

> info
-> code: OK
-> data: {"size":0}
-> data.hex: 0x7B2273697A65223A307D

> commit
-> code: OK
-> data.hex: 0x0000000000000000

> deliver_tx "abc"
-> code: OK

> info
-> code: OK
-> data: {"size":1}
-> data.hex: 0x7B2273697A65223A317D

> commit
-> code: OK
-> data.hex: 0x0200000000000000

> query "abc"
-> code: OK
-> log: exists
-> height: 2
-> value: abc
-> value.hex: 616263

> deliver_tx "def=xyz"
-> code: OK

> commit
-> code: OK
-> data.hex: 0x0400000000000000

> query "def"
-> code: OK
-> log: exists
-> height: 3
-> value: xyz
-> value.hex: 78797A
```

Note that if we do `deliver_tx "abc"` it will store `(abc, abc)`, but if
we do `deliver_tx "abc=efg"` it will store `(abc, efg)`.

Similarly, you could put the commands in a file and run
`abci-cli --verbose batch < myfile`.

## Counter - Another Example

Now that we've got the hang of it, let's try another application, the
"counter" app.

Like the kvstore app, its code can be found
[here](https://github.com/tendermint/tendermint/blob/v0.34.x/abci/cmd/abci-cli/abci-cli.go)
and looks like:

```go
func cmdCounter(cmd *cobra.Command, args []string) error {

    app := counter.NewCounterApplication(flagSerial)

    logger := log.NewTMLogger(log.NewSyncWriter(os.Stdout))

    // Start the listener
    srv, err := server.NewServer(flagAddrC, flagAbci, app)
    if err != nil {
        return err
    }
    srv.SetLogger(logger.With("module", "abci-server"))
    if err := srv.Start(); err != nil {
        return err
    }

    // Stop upon receiving SIGTERM or CTRL-C.
    tmos.TrapSignal(logger, func() {
        // Cleanup
        srv.Stop()
    })

    // Run forever.
    select {}
}
```

The counter app doesn't use a Merkle tree, it just counts how many times
we've sent a transaction, asked for a hash, or committed the state. The
result of `commit` is just the number of transactions sent.

This application has two modes: `serial=off` and `serial=on`.

When `serial=on`, transactions must be a big-endian encoded incrementing
integer, starting at 0.

If `serial=off`, there are no restrictions on transactions.

We can toggle the value of `serial` using the `set_option` ABCI message.

When `serial=on`, some transactions are invalid. In a live blockchain,
transactions collect in memory before they are committed into blocks. To
avoid wasting resources on invalid transactions, ABCI provides the
`check_tx` message, which application developers can use to accept or
reject transactions, before they are stored in memory or gossipped to
other peers.

In this instance of the counter app, `check_tx` only allows transactions
whose integer is greater than the last committed one.

Let's kill the console and the kvstore application, and start the
counter app:

```sh
abci-cli counter
```

In another window, start the `abci-cli console`:

```sh
> set_option serial on
-> code: OK
-> log: OK (SetOption doesn't return anything.)

> check_tx 0x00
-> code: OK

> check_tx 0xff
-> code: OK

> deliver_tx 0x00
-> code: OK

> check_tx 0x00
-> code: BadNonce
-> log: Invalid nonce. Expected >= 1, got 0

> deliver_tx 0x01
-> code: OK

> deliver_tx 0x04
-> code: BadNonce
-> log: Invalid nonce. Expected 2, got 4

> info
-> code: OK
-> data: {"hashes":0,"txs":2}
-> data.hex: 0x7B22686173686573223A302C22747873223A327D
```

This is a very simple application, but between `counter` and `kvstore`,
its easy to see how you can build out arbitrary application states on
top of the ABCI. [Hyperledger's
Burrow](https://github.com/hyperledger/burrow) also runs atop ABCI,
bringing with it Ethereum-like accounts, the Ethereum virtual-machine,
Monax's permissioning scheme, and native contracts extensions.

But the ultimate flexibility comes from being able to write the
application easily in any language.

We have implemented the counter in a number of languages [see the
example directory](https://github.com/tendermint/tendermint/tree/v0.34.x/abci/example).

To run the Node.js version, fist download & install [the Javascript ABCI server](https://github.com/tendermint/js-abci):

```sh
git clone https://github.com/tendermint/js-abci.git
cd js-abci
npm install abci
```

Now you can start the app:

```sh
node example/counter.js
```

(you'll have to kill the other counter application process). In another
window, run the console and those previous ABCI commands. You should get
the same results as for the Go version.

## Bounties

Want to write the counter app in your favorite language?! We'd be happy
to add you to our [ecosystem](https://github.com/tendermint/awesome#ecosystem)!
See [funding](https://github.com/interchainio/funding) opportunities from the
[Interchain Foundation](https://interchain.io/) for implementations in new languages and more.

The `abci-cli` is designed strictly for testing and debugging. In a real
deployment, the role of sending messages is taken by Tendermint, which
connects to the app using three separate connections, each with its own
pattern of messages.

For more information, see the [application developers
guide](./app-development.md). For examples of running an ABCI app with
Tendermint, see the [getting started guide](./getting-started.md).
Next is the ABCI specification.
