<!---
order: 1
--->

# 在 Go 中创建应用程序

## 指南假设

本指南适用于想要从零开始使用 Tendermint Core 创建应用程序的初学者。它不假设您具有任何关于 Tendermint Core 的先前经验。

Tendermint Core 是拜占庭容错（BFT）中间件，它接受一个状态转换机器（可以用任何编程语言编写），并在多台机器上进行安全复制。

尽管 Tendermint Core 是用 Golang 编程语言编写的，但本指南不需要对其有任何先前了解。您可以边学边用，因为它非常简单。但是，您可能希望先阅读 [在 Y 分钟内学会 X=Go](https://learnxinyminutes.com/docs/go/)，以熟悉其语法。

通过按照本指南的步骤，您将创建一个名为 kvstore 的 Tendermint Core 项目，这是一个（非常）简单的分布式 BFT 键值存储。

## 内置应用程序 vs 外部应用程序

为了获得最佳性能，最好将您的应用程序与 Tendermint Core 一起运行。[Cosmos SDK](https://github.com/cosmos/cosmos-sdk) 就是这样编写的。有关详细信息，请参阅 [在 Go 中编写内置的 Tendermint Core 应用程序](./go-built-in.md) 指南。

拥有一个独立的应用程序可能会为您提供更好的安全性保证，因为两个进程将通过已建立的二进制协议进行通信。Tendermint Core 将无法访问应用程序的状态。

## 1.1 安装 Go

请参阅[官方指南以安装 Go](https://golang.org/doc/install)。

验证您是否安装了最新版本的 Go：

```bash
$ go version
go version go1.15.x darwin/amd64
```

确保您已设置 `$GOPATH` 环境变量：

```bash
echo $GOPATH
/Users/melekes/go
```

## 1.2 创建一个新的 Go 项目

我们将从创建一个新的 Go 项目开始。

```bash
mkdir kvstore
cd kvstore
```

在示例目录中创建一个名为 `main.go` 的文件，并将以下内容添加到其中：

```go
package main

import (
	"fmt"
)

func main() {
	fmt.Println("Hello, Tendermint Core")
}
```

运行时，这应该会将 "Hello, Tendermint Core" 打印到标准输出。

```bash
go run main.go
你好，Tendermint Core
```

## 1.3 编写 Tendermint Core 应用程序

Tendermint Core 通过应用程序区块链接口 (ABCI) 与应用程序进行通信。所有消息类型都在 [protobuf 文件](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/tendermint/abci/types.proto) 中定义。这使得 Tendermint Core 可以运行使用任何编程语言编写的应用程序。

创建一个名为 `app.go` 的文件，内容如下：

```go
package main

import (
	abcitypes "github.com/tendermint/tendermint/abci/types"
)

type KVStoreApplication struct {}

var _ abcitypes.Application = (*KVStoreApplication)(nil)

func NewKVStoreApplication() *KVStoreApplication {
	return &KVStoreApplication{}
}

func (KVStoreApplication) Info(req abcitypes.RequestInfo) abcitypes.ResponseInfo {
	return abcitypes.ResponseInfo{}
}

func (KVStoreApplication) SetOption(req abcitypes.RequestSetOption) abcitypes.ResponseSetOption {
	return abcitypes.ResponseSetOption{}
}

func (KVStoreApplication) DeliverTx(req abcitypes.RequestDeliverTx) abcitypes.ResponseDeliverTx {
	return abcitypes.ResponseDeliverTx{Code: 0}
}

func (KVStoreApplication) CheckTx(req abcitypes.RequestCheckTx) abcitypes.ResponseCheckTx {
	return abcitypes.ResponseCheckTx{Code: 0}
}

func (KVStoreApplication) Commit() abcitypes.ResponseCommit {
	return abcitypes.ResponseCommit{}
}

func (KVStoreApplication) Query(req abcitypes.RequestQuery) abcitypes.ResponseQuery {
	return abcitypes.ResponseQuery{Code: 0}
}

func (KVStoreApplication) InitChain(req abcitypes.RequestInitChain) abcitypes.ResponseInitChain {
	return abcitypes.ResponseInitChain{}
}

func (KVStoreApplication) BeginBlock(req abcitypes.RequestBeginBlock) abcitypes.ResponseBeginBlock {
	return abcitypes.ResponseBeginBlock{}
}

func (KVStoreApplication) EndBlock(req abcitypes.RequestEndBlock) abcitypes.ResponseEndBlock {
	return abcitypes.ResponseEndBlock{}
}

func (KVStoreApplication) ListSnapshots(abcitypes.RequestListSnapshots) abcitypes.ResponseListSnapshots {
	return abcitypes.ResponseListSnapshots{}
}

func (KVStoreApplication) OfferSnapshot(abcitypes.RequestOfferSnapshot) abcitypes.ResponseOfferSnapshot {
	return abcitypes.ResponseOfferSnapshot{}
}

func (KVStoreApplication) LoadSnapshotChunk(abcitypes.RequestLoadSnapshotChunk) abcitypes.ResponseLoadSnapshotChunk {
	return abcitypes.ResponseLoadSnapshotChunk{}
}

func (KVStoreApplication) ApplySnapshotChunk(abcitypes.RequestApplySnapshotChunk) abcitypes.ResponseApplySnapshotChunk {
	return abcitypes.ResponseApplySnapshotChunk{}
}
```

现在，我将逐个解释每个方法的调用时机，并添加所需的业务逻辑。

### 1.3.1 CheckTx

当一个新的交易被添加到 Tendermint Core 时，它会要求应用程序对其进行检查（验证格式、签名等）。

```go
import "bytes"

func (app *KVStoreApplication) isValid(tx []byte) (code uint32) {
	// check format
	parts := bytes.Split(tx, []byte("="))
	if len(parts) != 2 {
		return 1
	}

	key, value := parts[0], parts[1]

	// check if the same key=value already exists
	err := app.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get(key)
		if err != nil && err != badger.ErrKeyNotFound {
			return err
		}
		if err == nil {
			return item.Value(func(val []byte) error {
				if bytes.Equal(val, value) {
					code = 2
				}
				return nil
			})
		}
		return nil
	})
	if err != nil {
		panic(err)
	}

	return code
}

func (app *KVStoreApplication) CheckTx(req abcitypes.RequestCheckTx) abcitypes.ResponseCheckTx {
	code := app.isValid(req.Tx)
	return abcitypes.ResponseCheckTx{Code: code, GasWanted: 1}
}
```

如果交易没有形式为 `{bytes}={bytes}`，我们返回 `1` 代码。当相同的 key=value 已经存在（相同的 key 和 value），我们返回 `2` 代码。对于其他情况，我们返回零代码，表示它们是有效的。

请注意，任何具有非零代码的内容都将被 Tendermint Core 视为无效（`-1`、`100` 等）。

有效的交易最终将被提交，前提是它们不太大且具有足够的 gas。要了解有关 gas 的更多信息，请查看 ["the
specification"](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/apps.md#gas)。

对于底层的键值存储，我们将使用 [badger](https://github.com/dgraph-io/badger)，它是一个可嵌入的、持久化且快速的键值（KV）数据库。

```go
import "github.com/dgraph-io/badger"

type KVStoreApplication struct {
	db           *badger.DB
	currentBatch *badger.Txn
}

func NewKVStoreApplication(db *badger.DB) *KVStoreApplication {
	return &KVStoreApplication{
		db: db,
	}
}
```

### 1.3.2 BeginBlock -> DeliverTx -> EndBlock -> Commit

当 Tendermint Core 决定了区块后，它会将其以 3 个部分传递给应用程序：`BeginBlock`、每个交易一个 `DeliverTx`，以及最后的 `EndBlock`。DeliverTx 是异步传输的，但是期望按顺序接收响应。

```go
func (app *KVStoreApplication) BeginBlock(req abcitypes.RequestBeginBlock) abcitypes.ResponseBeginBlock {
	app.currentBatch = app.db.NewTransaction(true)
	return abcitypes.ResponseBeginBlock{}
}

```

在这里，我们创建一个批处理，用于存储区块的交易。

```go
func (app *KVStoreApplication) DeliverTx(req abcitypes.RequestDeliverTx) abcitypes.ResponseDeliverTx {
	code := app.isValid(req.Tx)
	if code != 0 {
		return abcitypes.ResponseDeliverTx{Code: code}
	}

	parts := bytes.Split(req.Tx, []byte("="))
	key, value := parts[0], parts[1]

	err := app.currentBatch.Set(key, value)
	if err != nil {
		panic(err)
	}

	return abcitypes.ResponseDeliverTx{Code: 0}
}
```

如果交易格式错误或相同的 key=value 已经存在，我们再次返回非零代码。否则，我们将其添加到当前批处理中。

在当前设计中，一个区块可以包含不正确的交易（那些通过了 CheckTx，但在 DeliverTx 中失败或由提议者直接包含的交易）。这是出于性能考虑而做的。

请注意，我们不能在 `DeliverTx` 中提交交易，因为在这种情况下，可能会并行调用 `Query`，并返回不一致的数据（即，即使实际的区块尚未提交，它也会报告某个值已经存在）。

`Commit` 指示应用程序持久化新状态。

```go
func (app *KVStoreApplication) Commit() abcitypes.ResponseCommit {
	app.currentBatch.Commit()
	return abcitypes.ResponseCommit{Data: []byte{}}
}
```

### 1.3.3 查询

现在，当客户端想要知道特定的键/值是否存在时，它将调用 Tendermint Core 的 RPC `/abci_query` 端点，该端点将调用应用程序的 `Query` 方法。

应用程序可以自由提供自己的 API。但是通过使用 Tendermint Core 作为代理，客户端（包括 [轻客户端包](https://godoc.org/github.com/tendermint/tendermint/light)）可以在不同的应用程序之间利用统一的 API。此外，他们不必为额外的证明调用单独的 Tendermint Core API。

请注意，我们这里不包括证明。

```go
func (app *KVStoreApplication) Query(reqQuery abcitypes.RequestQuery) (resQuery abcitypes.ResponseQuery) {
	resQuery.Key = reqQuery.Data
	err := app.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get(reqQuery.Data)
		if err != nil && err != badger.ErrKeyNotFound {
			return err
		}
		if err == badger.ErrKeyNotFound {
			resQuery.Log = "does not exist"
		} else {
			return item.Value(func(val []byte) error {
				resQuery.Log = "exists"
				resQuery.Value = val
				return nil
			})
		}
		return nil
	})
	if err != nil {
		panic(err)
	}
	return
}
```

完整的规范可以在[这里](https://github.com/tendermint/tendermint/tree/v0.34.x/spec/abci/)找到。

## 1.4 启动应用程序和 Tendermint Core 实例

将以下代码放入 "main.go" 文件中：

```go
package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/dgraph-io/badger"

	abciserver "github.com/tendermint/tendermint/abci/server"
	"github.com/tendermint/tendermint/libs/log"
)

var socketAddr string

func init() {
	flag.StringVar(&socketAddr, "socket-addr", "unix://example.sock", "Unix domain socket address")
}

func main() {
	db, err := badger.Open(badger.DefaultOptions("/tmp/badger"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open badger db: %v", err)
		os.Exit(1)
	}
	defer db.Close()
	app := NewKVStoreApplication(db)

	flag.Parse()

	logger := log.NewTMLogger(log.NewSyncWriter(os.Stdout))

	server := abciserver.NewSocketServer(socketAddr, app)
	server.SetLogger(logger)
	if err := server.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "error starting socket server: %v", err)
		os.Exit(1)
	}
	defer server.Stop()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	os.Exit(0)
}
```

这是一大段代码，让我们将其分解成几个部分。

首先，我们初始化 Badger 数据库并创建一个应用程序实例：

```go
db, err := badger.Open(badger.DefaultOptions("/tmp/badger"))
if err != nil {
	fmt.Fprintf(os.Stderr, "failed to open badger db: %v", err)
	os.Exit(1)
}
defer db.Close()
app := NewKVStoreApplication(db)
```

对于 **Windows** 用户，重新启动此应用程序将导致 badger 抛出错误，因为它要求值日志被截断。有关此问题的更多信息，请访问[此处](https://github.com/dgraph-io/badger/issues/744)。
可以通过将截断选项设置为 true 来避免这种情况，如下所示：

```go
db, err := badger.Open(badger.DefaultOptions("/tmp/badger").WithTruncate(true))
```

然后，我们启动 ABCI 服务器并添加一些信号处理，以便在接收到 SIGTERM 或 Ctrl-C 时优雅地停止它。Tendermint Core 将充当客户端，连接到我们的服务器并向我们发送交易和其他消息。

```go
server := abciserver.NewSocketServer(socketAddr, app)
server.SetLogger(logger)
if err := server.Start(); err != nil {
	fmt.Fprintf(os.Stderr, "error starting socket server: %v", err)
	os.Exit(1)
}
defer server.Stop()

c := make(chan os.Signal, 1)
signal.Notify(c, os.Interrupt, syscall.SIGTERM)
<-c
os.Exit(0)
```

## 1.5 开始运行

我们将使用[Go模块](https://github.com/golang/go/wiki/Modules)进行依赖管理。

```bash
go mod init github.com/me/example
go get github.com/tendermint/tendermint/@v0.34.0
```

运行上述命令后，您将看到生成的两个文件，go.mod和go.sum。go.mod文件应该类似于：

```go
module github.com/me/example

go 1.15

require (
	github.com/dgraph-io/badger v1.6.2
	github.com/tendermint/tendermint v0.34.0
)
```

最后，我们将构建我们的二进制文件：

```sh
go build
```

为了创建默认配置、nodeKey和私有验证器文件，让我们执行`tendermint init`。但在此之前，我们需要安装Tendermint Core。请参考[官方指南](https://docs.tendermint.com/v0.34/introduction/install.html)。如果您从源代码安装，请不要忘记检出最新的发布版本（`git checkout vX.Y.Z`）。

```bash
rm -rf /tmp/example
TMHOME="/tmp/example" tendermint init

I[2019-07-16|18:20:36.480] Generated private validator                  module=main keyFile=/tmp/example/config/priv_validator_key.json stateFile=/tmp/example2/data/priv_validator_state.json
I[2019-07-16|18:20:36.481] Generated node key                           module=main path=/tmp/example/config/node_key.json
I[2019-07-16|18:20:36.482] Generated genesis file                       module=main path=/tmp/example/config/genesis.json
```

随意探索生成的文件，可以在`/tmp/example/config`目录中找到。有关配置的文档可以在[这里](https://docs.tendermint.com/v0.34/tendermint-core/configuration.html)找到。

我们准备好启动我们的应用程序了：

```bash
rm example.sock
./example

badger 2019/07/16 18:25:11 INFO: All 0 tables opened in 0s
badger 2019/07/16 18:25:11 INFO: Replaying file id: 0 at offset: 0
badger 2019/07/16 18:25:11 INFO: Replay took: 300.4s
I[2019-07-16|18:25:11.523] Starting ABCIServer                          impl=ABCIServ
```

然后，我们需要启动Tendermint Core并将其指向我们的应用程序。在应用程序目录中执行以下操作：

```bash
TMHOME="/tmp/example" tendermint node --proxy_app=unix://example.sock

I[2019-07-16|18:26:20.362] Version info                                 module=main software=0.32.1 block=10 p2p=7
I[2019-07-16|18:26:20.383] Starting Node                                module=main impl=Node
E[2019-07-16|18:26:20.392] Couldn't connect to any seeds                module=p2p
I[2019-07-16|18:26:20.394] Started node                                 module=main nodeInfo="{ProtocolVersion:{P2P:7 Block:10 App:0} ID_:8dab80770ae8e295d4ce905d86af78c4ff634b79 ListenAddr:tcp://0.0.0.0:26656 Network:test-chain-nIO96P Version:0.32.1 Channels:4020212223303800 Moniker:app48.fun-box.ru Other:{TxIndex:on RPCAddress:tcp://127.0.0.1:26657}}"
I[2019-07-16|18:26:21.440] Executed block                               module=state height=1 validTxs=0 invalidTxs=0
I[2019-07-16|18:26:21.446] Committed state                              module=state height=1 txs=0 appHash=
```

这将启动完整节点并连接到我们的ABCI应用程序。

```sh
I[2019-07-16|18:25:11.525] Waiting for new connection...
I[2019-07-16|18:26:20.329] Accepted a new connection
I[2019-07-16|18:26:20.329] Waiting for new connection...
I[2019-07-16|18:26:20.330] Accepted a new connection
I[2019-07-16|18:26:20.330] Waiting for new connection...
I[2019-07-16|18:26:20.330] Accepted a new connection
```

现在在终端中打开另一个选项卡，尝试发送一笔交易：

```json
curl -s 'localhost:26657/broadcast_tx_commit?tx="tendermint=rocks"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {
      "gasWanted": "1"
    },
    "deliver_tx": {},
    "hash": "CDD3C6DFA0A08CAEDF546F9938A2EEC232209C24AA0E4201194E0AFB78A2C2BB",
    "height": "33"
}
```

响应应包含此交易提交的高度。

现在让我们检查给定的键是否存在以及其值：

```json
curl -s 'localhost:26657/abci_query?data="tendermint"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "response": {
      "log": "exists",
      "key": "dGVuZGVybWludA==",
      "value": "cm9ja3My"
    }
  }
}
```

"dGVuZGVybWludA=="和"cm9ja3M="分别是"tendermint"和"rocks"的ASCII的Base64编码。

## 结束语

我希望一切顺利，您的第一个（但希望不是最后一个）Tendermint Core应用程序已经启动并运行。如果没有，请[在Github上提出问题](https://github.com/tendermint/tendermint/issues/new/choose)。要深入了解，请阅读[文档](https://docs.tendermint.com/v0.34/)。

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


<!---
order: 1
--->

# Creating an application in Go

## Guide Assumptions

This guide is designed for beginners who want to get started with a Tendermint
Core application from scratch. It does not assume that you have any prior
experience with Tendermint Core.

Tendermint Core is Byzantine Fault Tolerant (BFT) middleware that takes a state
transition machine - written in any programming language - and securely
replicates it on many machines.

Although Tendermint Core is written in the Golang programming language, prior
knowledge of it is not required for this guide. You can learn it as we go due
to it's simplicity. However, you may want to go through [Learn X in Y minutes
Where X=Go](https://learnxinyminutes.com/docs/go/) first to familiarize
yourself with the syntax.

By following along with this guide, you'll create a Tendermint Core project
called kvstore, a (very) simple distributed BFT key-value store.

## Built-in app vs external app

To get maximum performance it is better to run your application alongside
Tendermint Core. [Cosmos SDK](https://github.com/cosmos/cosmos-sdk) is written
this way. Please refer to [Writing a built-in Tendermint Core application in
Go](./go-built-in.md) guide for details.

Having a separate application might give you better security guarantees as two
processes would be communicating via established binary protocol. Tendermint
Core will not have access to application's state.

## 1.1 Installing Go

Please refer to [the official guide for installing
Go](https://golang.org/doc/install).

Verify that you have the latest version of Go installed:

```bash
$ go version
go version go1.15.x darwin/amd64
```

Make sure you have `$GOPATH` environment variable set:

```bash
echo $GOPATH
/Users/melekes/go
```

## 1.2 Creating a new Go project

We'll start by creating a new Go project.

```bash
mkdir kvstore
cd kvstore
```

Inside the example directory create a `main.go` file with the following content:

```go
package main

import (
	"fmt"
)

func main() {
	fmt.Println("Hello, Tendermint Core")
}
```

When run, this should print "Hello, Tendermint Core" to the standard output.

```bash
go run main.go
Hello, Tendermint Core
```

## 1.3 Writing a Tendermint Core application

Tendermint Core communicates with the application through the Application
BlockChain Interface (ABCI). All message types are defined in the [protobuf
file](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/tendermint/abci/types.proto).
This allows Tendermint Core to run applications written in any programming
language.

Create a file called `app.go` with the following content:

```go
package main

import (
	abcitypes "github.com/tendermint/tendermint/abci/types"
)

type KVStoreApplication struct {}

var _ abcitypes.Application = (*KVStoreApplication)(nil)

func NewKVStoreApplication() *KVStoreApplication {
	return &KVStoreApplication{}
}

func (KVStoreApplication) Info(req abcitypes.RequestInfo) abcitypes.ResponseInfo {
	return abcitypes.ResponseInfo{}
}

func (KVStoreApplication) SetOption(req abcitypes.RequestSetOption) abcitypes.ResponseSetOption {
	return abcitypes.ResponseSetOption{}
}

func (KVStoreApplication) DeliverTx(req abcitypes.RequestDeliverTx) abcitypes.ResponseDeliverTx {
	return abcitypes.ResponseDeliverTx{Code: 0}
}

func (KVStoreApplication) CheckTx(req abcitypes.RequestCheckTx) abcitypes.ResponseCheckTx {
	return abcitypes.ResponseCheckTx{Code: 0}
}

func (KVStoreApplication) Commit() abcitypes.ResponseCommit {
	return abcitypes.ResponseCommit{}
}

func (KVStoreApplication) Query(req abcitypes.RequestQuery) abcitypes.ResponseQuery {
	return abcitypes.ResponseQuery{Code: 0}
}

func (KVStoreApplication) InitChain(req abcitypes.RequestInitChain) abcitypes.ResponseInitChain {
	return abcitypes.ResponseInitChain{}
}

func (KVStoreApplication) BeginBlock(req abcitypes.RequestBeginBlock) abcitypes.ResponseBeginBlock {
	return abcitypes.ResponseBeginBlock{}
}

func (KVStoreApplication) EndBlock(req abcitypes.RequestEndBlock) abcitypes.ResponseEndBlock {
	return abcitypes.ResponseEndBlock{}
}

func (KVStoreApplication) ListSnapshots(abcitypes.RequestListSnapshots) abcitypes.ResponseListSnapshots {
	return abcitypes.ResponseListSnapshots{}
}

func (KVStoreApplication) OfferSnapshot(abcitypes.RequestOfferSnapshot) abcitypes.ResponseOfferSnapshot {
	return abcitypes.ResponseOfferSnapshot{}
}

func (KVStoreApplication) LoadSnapshotChunk(abcitypes.RequestLoadSnapshotChunk) abcitypes.ResponseLoadSnapshotChunk {
	return abcitypes.ResponseLoadSnapshotChunk{}
}

func (KVStoreApplication) ApplySnapshotChunk(abcitypes.RequestApplySnapshotChunk) abcitypes.ResponseApplySnapshotChunk {
	return abcitypes.ResponseApplySnapshotChunk{}
}
```

Now I will go through each method explaining when it's called and adding
required business logic.

### 1.3.1 CheckTx

When a new transaction is added to the Tendermint Core, it will ask the
application to check it (validate the format, signatures, etc.).

```go
import "bytes"

func (app *KVStoreApplication) isValid(tx []byte) (code uint32) {
	// check format
	parts := bytes.Split(tx, []byte("="))
	if len(parts) != 2 {
		return 1
	}

	key, value := parts[0], parts[1]

	// check if the same key=value already exists
	err := app.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get(key)
		if err != nil && err != badger.ErrKeyNotFound {
			return err
		}
		if err == nil {
			return item.Value(func(val []byte) error {
				if bytes.Equal(val, value) {
					code = 2
				}
				return nil
			})
		}
		return nil
	})
	if err != nil {
		panic(err)
	}

	return code
}

func (app *KVStoreApplication) CheckTx(req abcitypes.RequestCheckTx) abcitypes.ResponseCheckTx {
	code := app.isValid(req.Tx)
	return abcitypes.ResponseCheckTx{Code: code, GasWanted: 1}
}
```

Don't worry if this does not compile yet.

If the transaction does not have a form of `{bytes}={bytes}`, we return `1`
code. When the same key=value already exist (same key and value), we return `2`
code. For others, we return a zero code indicating that they are valid.

Note that anything with non-zero code will be considered invalid (`-1`, `100`,
etc.) by Tendermint Core.

Valid transactions will eventually be committed given they are not too big and
have enough gas. To learn more about gas, check out ["the
specification"](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/apps.md#gas).

For the underlying key-value store we'll use
[badger](https://github.com/dgraph-io/badger), which is an embeddable,
persistent and fast key-value (KV) database.

```go
import "github.com/dgraph-io/badger"

type KVStoreApplication struct {
	db           *badger.DB
	currentBatch *badger.Txn
}

func NewKVStoreApplication(db *badger.DB) *KVStoreApplication {
	return &KVStoreApplication{
		db: db,
	}
}
```

### 1.3.2 BeginBlock -> DeliverTx -> EndBlock -> Commit

When Tendermint Core has decided on the block, it's transferred to the
application in 3 parts: `BeginBlock`, one `DeliverTx` per transaction and
`EndBlock` in the end. DeliverTx are being transferred asynchronously, but the
responses are expected to come in order.

```go
func (app *KVStoreApplication) BeginBlock(req abcitypes.RequestBeginBlock) abcitypes.ResponseBeginBlock {
	app.currentBatch = app.db.NewTransaction(true)
	return abcitypes.ResponseBeginBlock{}
}

```

Here we create a batch, which will store block's transactions.

```go
func (app *KVStoreApplication) DeliverTx(req abcitypes.RequestDeliverTx) abcitypes.ResponseDeliverTx {
	code := app.isValid(req.Tx)
	if code != 0 {
		return abcitypes.ResponseDeliverTx{Code: code}
	}

	parts := bytes.Split(req.Tx, []byte("="))
	key, value := parts[0], parts[1]

	err := app.currentBatch.Set(key, value)
	if err != nil {
		panic(err)
	}

	return abcitypes.ResponseDeliverTx{Code: 0}
}
```

If the transaction is badly formatted or the same key=value already exist, we
again return the non-zero code. Otherwise, we add it to the current batch.

In the current design, a block can include incorrect transactions (those who
passed CheckTx, but failed DeliverTx or transactions included by the proposer
directly). This is done for performance reasons.

Note we can't commit transactions inside the `DeliverTx` because in such case
`Query`, which may be called in parallel, will return inconsistent data (i.e.
it will report that some value already exist even when the actual block was not
yet committed).

`Commit` instructs the application to persist the new state.

```go
func (app *KVStoreApplication) Commit() abcitypes.ResponseCommit {
	app.currentBatch.Commit()
	return abcitypes.ResponseCommit{Data: []byte{}}
}
```

### 1.3.3 Query

Now, when the client wants to know whenever a particular key/value exist, it
will call Tendermint Core RPC `/abci_query` endpoint, which in turn will call
the application's `Query` method.

Applications are free to provide their own APIs. But by using Tendermint Core
as a proxy, clients (including [light client
package](https://godoc.org/github.com/tendermint/tendermint/light)) can leverage
the unified API across different applications. Plus they won't have to call the
otherwise separate Tendermint Core API for additional proofs.

Note we don't include a proof here.

```go
func (app *KVStoreApplication) Query(reqQuery abcitypes.RequestQuery) (resQuery abcitypes.ResponseQuery) {
	resQuery.Key = reqQuery.Data
	err := app.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get(reqQuery.Data)
		if err != nil && err != badger.ErrKeyNotFound {
			return err
		}
		if err == badger.ErrKeyNotFound {
			resQuery.Log = "does not exist"
		} else {
			return item.Value(func(val []byte) error {
				resQuery.Log = "exists"
				resQuery.Value = val
				return nil
			})
		}
		return nil
	})
	if err != nil {
		panic(err)
	}
	return
}
```

The complete specification can be found
[here](https://github.com/tendermint/tendermint/tree/v0.34.x/spec/abci/).

## 1.4 Starting an application and a Tendermint Core instances

Put the following code into the "main.go" file:

```go
package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/dgraph-io/badger"

	abciserver "github.com/tendermint/tendermint/abci/server"
	"github.com/tendermint/tendermint/libs/log"
)

var socketAddr string

func init() {
	flag.StringVar(&socketAddr, "socket-addr", "unix://example.sock", "Unix domain socket address")
}

func main() {
	db, err := badger.Open(badger.DefaultOptions("/tmp/badger"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open badger db: %v", err)
		os.Exit(1)
	}
	defer db.Close()
	app := NewKVStoreApplication(db)

	flag.Parse()

	logger := log.NewTMLogger(log.NewSyncWriter(os.Stdout))

	server := abciserver.NewSocketServer(socketAddr, app)
	server.SetLogger(logger)
	if err := server.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "error starting socket server: %v", err)
		os.Exit(1)
	}
	defer server.Stop()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	os.Exit(0)
}
```

This is a huge blob of code, so let's break it down into pieces.

First, we initialize the Badger database and create an app instance:

```go
db, err := badger.Open(badger.DefaultOptions("/tmp/badger"))
if err != nil {
	fmt.Fprintf(os.Stderr, "failed to open badger db: %v", err)
	os.Exit(1)
}
defer db.Close()
app := NewKVStoreApplication(db)
```

For **Windows** users, restarting this app will make badger throw an error as it requires value log to be truncated. For more information on this, visit [here](https://github.com/dgraph-io/badger/issues/744).
This can be avoided by setting the truncate option to true, like this:

```go
db, err := badger.Open(badger.DefaultOptions("/tmp/badger").WithTruncate(true))
```

Then we start the ABCI server and add some signal handling to gracefully stop
it upon receiving SIGTERM or Ctrl-C. Tendermint Core will act as a client,
which connects to our server and send us transactions and other messages.

```go
server := abciserver.NewSocketServer(socketAddr, app)
server.SetLogger(logger)
if err := server.Start(); err != nil {
	fmt.Fprintf(os.Stderr, "error starting socket server: %v", err)
	os.Exit(1)
}
defer server.Stop()

c := make(chan os.Signal, 1)
signal.Notify(c, os.Interrupt, syscall.SIGTERM)
<-c
os.Exit(0)
```

## 1.5 Getting Up and Running

We are going to use [Go modules](https://github.com/golang/go/wiki/Modules) for
dependency management.

```bash
go mod init github.com/me/example
go get github.com/tendermint/tendermint/@v0.34.0
```

After running the above commands you will see two generated files, go.mod and go.sum. The go.mod file should look similar to:

```go
module github.com/me/example

go 1.15

require (
	github.com/dgraph-io/badger v1.6.2
	github.com/tendermint/tendermint v0.34.0
)
```

Finally, we will build our binary:

```sh
go build
```

To create a default configuration, nodeKey and private validator files, let's
execute `tendermint init`. But before we do that, we will need to install
Tendermint Core. Please refer to [the official
guide](https://docs.tendermint.com/v0.34/introduction/install.html). If you're
installing from source, don't forget to checkout the latest release (`git checkout vX.Y.Z`).

```bash
rm -rf /tmp/example
TMHOME="/tmp/example" tendermint init

I[2019-07-16|18:20:36.480] Generated private validator                  module=main keyFile=/tmp/example/config/priv_validator_key.json stateFile=/tmp/example2/data/priv_validator_state.json
I[2019-07-16|18:20:36.481] Generated node key                           module=main path=/tmp/example/config/node_key.json
I[2019-07-16|18:20:36.482] Generated genesis file                       module=main path=/tmp/example/config/genesis.json
```

Feel free to explore the generated files, which can be found at
`/tmp/example/config` directory. Documentation on the config can be found
[here](https://docs.tendermint.com/v0.34/tendermint-core/configuration.html).

We are ready to start our application:

```bash
rm example.sock
./example

badger 2019/07/16 18:25:11 INFO: All 0 tables opened in 0s
badger 2019/07/16 18:25:11 INFO: Replaying file id: 0 at offset: 0
badger 2019/07/16 18:25:11 INFO: Replay took: 300.4s
I[2019-07-16|18:25:11.523] Starting ABCIServer                          impl=ABCIServ
```

Then we need to start Tendermint Core and point it to our application. Staying
within the application directory execute:

```bash
TMHOME="/tmp/example" tendermint node --proxy_app=unix://example.sock

I[2019-07-16|18:26:20.362] Version info                                 module=main software=0.32.1 block=10 p2p=7
I[2019-07-16|18:26:20.383] Starting Node                                module=main impl=Node
E[2019-07-16|18:26:20.392] Couldn't connect to any seeds                module=p2p
I[2019-07-16|18:26:20.394] Started node                                 module=main nodeInfo="{ProtocolVersion:{P2P:7 Block:10 App:0} ID_:8dab80770ae8e295d4ce905d86af78c4ff634b79 ListenAddr:tcp://0.0.0.0:26656 Network:test-chain-nIO96P Version:0.32.1 Channels:4020212223303800 Moniker:app48.fun-box.ru Other:{TxIndex:on RPCAddress:tcp://127.0.0.1:26657}}"
I[2019-07-16|18:26:21.440] Executed block                               module=state height=1 validTxs=0 invalidTxs=0
I[2019-07-16|18:26:21.446] Committed state                              module=state height=1 txs=0 appHash=
```

This should start the full node and connect to our ABCI application.

```sh
I[2019-07-16|18:25:11.525] Waiting for new connection...
I[2019-07-16|18:26:20.329] Accepted a new connection
I[2019-07-16|18:26:20.329] Waiting for new connection...
I[2019-07-16|18:26:20.330] Accepted a new connection
I[2019-07-16|18:26:20.330] Waiting for new connection...
I[2019-07-16|18:26:20.330] Accepted a new connection
```

Now open another tab in your terminal and try sending a transaction:

```json
curl -s 'localhost:26657/broadcast_tx_commit?tx="tendermint=rocks"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {
      "gasWanted": "1"
    },
    "deliver_tx": {},
    "hash": "CDD3C6DFA0A08CAEDF546F9938A2EEC232209C24AA0E4201194E0AFB78A2C2BB",
    "height": "33"
}
```

Response should contain the height where this transaction was committed.

Now let's check if the given key now exists and its value:

```json
curl -s 'localhost:26657/abci_query?data="tendermint"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "response": {
      "log": "exists",
      "key": "dGVuZGVybWludA==",
      "value": "cm9ja3My"
    }
  }
}
```

"dGVuZGVybWludA==" and "cm9ja3M=" are the base64-encoding of the ASCII of
"tendermint" and "rocks" accordingly.

## Outro

I hope everything went smoothly and your first, but hopefully not the last,
Tendermint Core application is up and running. If not, please [open an issue on
Github](https://github.com/tendermint/tendermint/issues/new/choose). To dig
deeper, read [the docs](https://docs.tendermint.com/v0.34/).
