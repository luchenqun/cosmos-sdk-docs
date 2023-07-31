---
order: 1
---

# 入门指南

## 第一个 Tendermint 应用

作为一个通用的区块链引擎，Tendermint 对你想要运行的应用程序是不加偏见的。因此，要运行一个完整的区块链并实现一些有用的功能，你需要启动两个程序：一个是 Tendermint Core，另一个是你的应用程序，可以使用任何编程语言编写。回想一下 [ABCI 简介](../introduction/what-is-tendermint.md#abci-overview) 中提到的，Tendermint Core 处理所有的点对点和共识相关的事务，并在需要验证事务或准备将其提交到区块时将其转发给应用程序。

在本指南中，我们将展示一些使用 Tendermint 运行应用程序的示例。

### 安装

我们将首先使用 Go 编写的应用程序进行操作。要安装它们，你需要 [安装 Go](https://golang.org/doc/install)，将 `$GOPATH/bin` 添加到 `$PATH` 中，并按照以下说明启用 Go 模块：

```bash
echo export GOPATH=\"\$HOME/go\" >> ~/.bash_profile
echo export PATH=\"\$PATH:\$GOPATH/bin\" >> ~/.bash_profile
```

然后运行

```sh
go get github.com/tendermint/tendermint
cd $GOPATH/src/github.com/tendermint/tendermint
make install_abci
```

现在你应该已经安装了 `abci-cli`；你将看到一些示例应用程序（`counter` 和 `kvstore`）的命令，它们是用 Go 编写的。下面是一个使用 JavaScript 编写的应用程序。

现在，让我们运行一些应用程序！

## KVStore - 第一个示例

kvstore 应用程序是一个 [Merkle
树](https://en.wikipedia.org/wiki/Merkle_tree)，它只是存储所有的事务。如果事务包含 `=`，例如 `key=value`，那么 `value` 将存储在 Merkle 树的 `key` 下。否则，完整的事务字节将作为键和值进行存储。

让我们启动一个 kvstore 应用程序。

```sh
abci-cli kvstore
```

在另一个终端中，我们可以启动 Tendermint。你应该已经安装了 Tendermint 二进制文件。如果没有，请按照[这里](../introduction/install.md)的步骤进行安装。如果你以前从未运行过 Tendermint，请使用以下命令：

```sh
tendermint init
tendermint node
```

如果你已经使用过 Tendermint，并希望为一个新的区块链重置数据，请运行 `tendermint unsafe_reset_all`。然后你可以运行 `tendermint node` 启动 Tendermint，并连接到应用程序。有关更多详细信息，请参阅 [使用 Tendermint 的指南](../tendermint-core/using-tendermint.md)。

你应该能看到 Tendermint 正在生成区块！我们可以通过以下方式获取 Tendermint 节点的状态：

```sh
curl -s localhost:26657/status
```

`-s` 参数只是让 `curl` 静默执行。为了得到更好的输出结果，可以将结果通过管道传递给像 [jq](https://stedolan.github.io/jq/) 或 `json_pp` 这样的工具。

现在让我们向 kvstore 发送一些交易。

```sh
curl -s 'localhost:26657/broadcast_tx_commit?tx="abcd"'
```

请注意 URL 周围的单引号 (`'`)，这样可以确保双引号 (`"`) 不会被 bash 转义。这个命令发送了一个带有字节 `abcd` 的交易，所以 `abcd` 将作为键和值存储在 Merkle 树中。响应应该类似于：

```json
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {},
    "deliver_tx": {
      "tags": [
        {
          "key": "YXBwLmNyZWF0b3I=",
          "value": "amFl"
        },
        {
          "key": "YXBwLmtleQ==",
          "value": "YWJjZA=="
        }
      ]
    },
    "hash": "9DF66553F98DE3C26E3C3317A3E4CED54F714E39",
    "height": 14
  }
}
```

我们可以通过查询应用程序来确认我们的交易是否成功，并且值已经被存储了。

```sh
curl -s 'localhost:26657/abci_query?data="abcd"'
```

结果应该类似于：

```json
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "response": {
      "log": "exists",
      "index": "-1",
      "key": "YWJjZA==",
      "value": "YWJjZA=="
    }
  }
}
```

请注意结果中的 `value` (`YWJjZA==`)，这是 `abcd` 的 ASCII 的 base64 编码。你可以在 Python 2 的 shell 中运行 `"YWJjZA==".decode('base64')` 或在 Python 3 的 shell 中运行 `import codecs; codecs.decode(b"YWJjZA==", 'base64').decode('ascii')` 来验证这一点。敬请期待未来的版本，[使这个输出更易读](https://github.com/tendermint/tendermint/issues/1794)。

现在让我们尝试设置一个不同的键和值：

```sh
curl -s 'localhost:26657/broadcast_tx_commit?tx="name=satoshi"'
```

现在，如果我们查询 `name`，我们应该得到 `satoshi`，或者在 base64 中是 `c2F0b3NoaQ==`：

```sh
curl -s 'localhost:26657/abci_query?data="name"'
```

尝试一些其他的交易和查询，确保一切正常工作！

## 计数器 - 另一个示例

现在我们已经掌握了操作方法，让我们尝试另一个应用程序，`counter` 应用。

计数器应用程序不使用 Merkle 树，它只是计算我们发送交易或提交状态的次数。

该应用程序有两种模式：`serial=off` 和 `serial=on`。

当 `serial=on` 时，交易必须是以大端编码的递增整数，起始值为 0。

如果 `serial=off`，对交易没有任何限制。

在一个实时的区块链中，交易在被提交到区块之前会先在内存中收集起来。为了避免浪费资源在无效的交易上，ABCI 提供了 `CheckTx` 消息，应用开发者可以在交易存储到内存或传播给其他节点之前使用该消息来接受或拒绝交易。

在这个计数器应用的实例中，当 `serial=on` 时，`CheckTx` 只允许整数大于上一个已提交的整数的交易。

让我们关闭之前的 `tendermint` 实例和 `kvstore` 应用，并启动计数器应用。我们可以通过一个标志来启用 `serial=on`：

```sh
abci-cli counter --serial
```

在另一个窗口中，重置并启动 Tendermint：

```sh
tendermint unsafe_reset_all
tendermint node
```

再次，您可以看到区块正在流动。让我们发送一些交易。由于我们设置了 `serial=on`，第一个交易必须是数字 `0`：

```sh
curl localhost:26657/broadcast_tx_commit?tx=0x00
```

注意到空的（因此成功的）响应。下一个交易必须是数字 `1`。如果我们尝试发送一个 `5`，我们会收到一个错误：

```json
> curl localhost:26657/broadcast_tx_commit?tx=0x05
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {},
    "deliver_tx": {
      "code": 2,
      "log": "Invalid nonce. Expected 1, got 5"
    },
    "hash": "33B93DFF98749B0D6996A70F64071347060DC19C",
    "height": 34
  }
}
```

但是如果我们发送一个 `1`，它又可以正常工作：

```json
> curl localhost:26657/broadcast_tx_commit?tx=0x01
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {},
    "deliver_tx": {},
    "hash": "F17854A977F6FA7EEA1BD758E296710B86F72F3D",
    "height": 60
  }
}
```

有关 `broadcast_tx` API 的更多详细信息，请参阅 [使用 Tendermint 的指南](../tendermint-core/using-tendermint.md)。

## CounterJS - 另一种语言的示例

我们还想在另一种语言中运行应用程序 - 在这种情况下，我们将运行一个 Javascript 版本的 `counter`。要运行它，您需要[安装 node](https://nodejs.org/en/download/)。

您还需要获取相关的存储库，从[这里](https://github.com/tendermint/js-abci)获取，然后安装它：

```sh
git clone https://github.com/tendermint/js-abci.git
cd js-abci
npm install abci
```

关闭之前的 `counter` 和 `tendermint` 进程。现在运行该应用程序：

```sh
node example/counter.js
```

在另一个窗口中，重置并启动 `tendermint`：

```sh
tendermint unsafe_reset_all
tendermint node
```

再次，您应该看到区块正在流动 - 但现在，我们的应用程序是用 Javascript 编写的！尝试发送一些交易，和之前一样 - 结果应该是相同的：

```sh
# ok
curl localhost:26657/broadcast_tx_commit?tx=0x00
# invalid nonce
curl localhost:26657/broadcast_tx_commit?tx=0x05
# ok
curl localhost:26657/broadcast_tx_commit?tx=0x01
```

很酷，对吧？


---
order: 1
---

# Getting Started

## First Tendermint App

As a general purpose blockchain engine, Tendermint is agnostic to the
application you want to run. So, to run a complete blockchain that does
something useful, you must start two programs: one is Tendermint Core,
the other is your application, which can be written in any programming
language. Recall from [the intro to
ABCI](../introduction/what-is-tendermint.md#abci-overview) that Tendermint Core handles all the p2p and consensus stuff, and just forwards transactions to the
application when they need to be validated, or when they're ready to be
committed to a block.

In this guide, we show you some examples of how to run an application
using Tendermint.

### Install

The first apps we will work with are written in Go. To install them, you
need to [install Go](https://golang.org/doc/install), put
`$GOPATH/bin` in your `$PATH` and enable go modules with these instructions:

```bash
echo export GOPATH=\"\$HOME/go\" >> ~/.bash_profile
echo export PATH=\"\$PATH:\$GOPATH/bin\" >> ~/.bash_profile
```

Then run

```sh
go get github.com/tendermint/tendermint
cd $GOPATH/src/github.com/tendermint/tendermint
make install_abci
```

Now you should have the `abci-cli` installed; you'll see a couple of
commands (`counter` and `kvstore`) that are example applications written
in Go. See below for an application written in JavaScript.

Now, let's run some apps!

## KVStore - A First Example

The kvstore app is a [Merkle
tree](https://en.wikipedia.org/wiki/Merkle_tree) that just stores all
transactions. If the transaction contains an `=`, e.g. `key=value`, then
the `value` is stored under the `key` in the Merkle tree. Otherwise, the
full transaction bytes are stored as the key and the value.

Let's start a kvstore application.

```sh
abci-cli kvstore
```

In another terminal, we can start Tendermint. You should already have the
Tendermint binary installed. If not, follow the steps from
[here](../introduction/install.md). If you have never run Tendermint
before, use:

```sh
tendermint init
tendermint node
```

If you have used Tendermint, you may want to reset the data for a new
blockchain by running `tendermint unsafe_reset_all`. Then you can run
`tendermint node` to start Tendermint, and connect to the app. For more
details, see [the guide on using Tendermint](../tendermint-core/using-tendermint.md).

You should see Tendermint making blocks! We can get the status of our
Tendermint node as follows:

```sh
curl -s localhost:26657/status
```

The `-s` just silences `curl`. For nicer output, pipe the result into a
tool like [jq](https://stedolan.github.io/jq/) or `json_pp`.

Now let's send some transactions to the kvstore.

```sh
curl -s 'localhost:26657/broadcast_tx_commit?tx="abcd"'
```

Note the single quote (`'`) around the url, which ensures that the
double quotes (`"`) are not escaped by bash. This command sent a
transaction with bytes `abcd`, so `abcd` will be stored as both the key
and the value in the Merkle tree. The response should look something
like:

```json
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {},
    "deliver_tx": {
      "tags": [
        {
          "key": "YXBwLmNyZWF0b3I=",
          "value": "amFl"
        },
        {
          "key": "YXBwLmtleQ==",
          "value": "YWJjZA=="
        }
      ]
    },
    "hash": "9DF66553F98DE3C26E3C3317A3E4CED54F714E39",
    "height": 14
  }
}
```

We can confirm that our transaction worked and the value got stored by
querying the app:

```sh
curl -s 'localhost:26657/abci_query?data="abcd"'
```

The result should look like:

```json
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "response": {
      "log": "exists",
      "index": "-1",
      "key": "YWJjZA==",
      "value": "YWJjZA=="
    }
  }
}
```

Note the `value` in the result (`YWJjZA==`); this is the base64-encoding
of the ASCII of `abcd`. You can verify this in a python 2 shell by
running `"YWJjZA==".decode('base64')` or in python 3 shell by running
`import codecs; codecs.decode(b"YWJjZA==", 'base64').decode('ascii')`.
Stay tuned for a future release that [makes this output more
human-readable](https://github.com/tendermint/tendermint/issues/1794).

Now let's try setting a different key and value:

```sh
curl -s 'localhost:26657/broadcast_tx_commit?tx="name=satoshi"'
```

Now if we query for `name`, we should get `satoshi`, or `c2F0b3NoaQ==`
in base64:

```sh
curl -s 'localhost:26657/abci_query?data="name"'
```

Try some other transactions and queries to make sure everything is
working!

## Counter - Another Example

Now that we've got the hang of it, let's try another application, the
`counter` app.

The counter app doesn't use a Merkle tree, it just counts how many times
we've sent a transaction, or committed the state.

This application has two modes: `serial=off` and `serial=on`.

When `serial=on`, transactions must be a big-endian encoded incrementing
integer, starting at 0.

If `serial=off`, there are no restrictions on transactions.

In a live blockchain, transactions collect in memory before they are
committed into blocks. To avoid wasting resources on invalid
transactions, ABCI provides the `CheckTx` message, which application
developers can use to accept or reject transactions, before they are
stored in memory or gossipped to other peers.

In this instance of the counter app, with `serial=on`, `CheckTx` only
allows transactions whose integer is greater than the last committed
one.

Let's kill the previous instance of `tendermint` and the `kvstore`
application, and start the counter app. We can enable `serial=on` with a
flag:

```sh
abci-cli counter --serial
```

In another window, reset then start Tendermint:

```sh
tendermint unsafe_reset_all
tendermint node
```

Once again, you can see the blocks streaming by. Let's send some
transactions. Since we have set `serial=on`, the first transaction must
be the number `0`:

```sh
curl localhost:26657/broadcast_tx_commit?tx=0x00
```

Note the empty (hence successful) response. The next transaction must be
the number `1`. If instead, we try to send a `5`, we get an error:

```json
> curl localhost:26657/broadcast_tx_commit?tx=0x05
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {},
    "deliver_tx": {
      "code": 2,
      "log": "Invalid nonce. Expected 1, got 5"
    },
    "hash": "33B93DFF98749B0D6996A70F64071347060DC19C",
    "height": 34
  }
}
```

But if we send a `1`, it works again:

```json
> curl localhost:26657/broadcast_tx_commit?tx=0x01
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {},
    "deliver_tx": {},
    "hash": "F17854A977F6FA7EEA1BD758E296710B86F72F3D",
    "height": 60
  }
}
```

For more details on the `broadcast_tx` API, see [the guide on using
Tendermint](../tendermint-core/using-tendermint.md).

## CounterJS - Example in Another Language

We also want to run applications in another language - in this case,
we'll run a Javascript version of the `counter`. To run it, you'll need
to [install node](https://nodejs.org/en/download/).

You'll also need to fetch the relevant repository, from
[here](https://github.com/tendermint/js-abci), then install it:

```sh
git clone https://github.com/tendermint/js-abci.git
cd js-abci
npm install abci
```

Kill the previous `counter` and `tendermint` processes. Now run the app:

```sh
node example/counter.js
```

In another window, reset and start `tendermint`:

```sh
tendermint unsafe_reset_all
tendermint node
```

Once again, you should see blocks streaming by - but now, our
application is written in Javascript! Try sending some transactions, and
like before - the results should be the same:

```sh
# ok
curl localhost:26657/broadcast_tx_commit?tx=0x00
# invalid nonce
curl localhost:26657/broadcast_tx_commit?tx=0x05
# ok
curl localhost:26657/broadcast_tx_commit?tx=0x01
```

Neat, eh?
