# 节点客户端（守护进程）

:::note 概要
Cosmos SDK 应用程序的主要终端是守护进程客户端，也称为全节点客户端。全节点运行状态机，从创世文件开始。它连接到运行相同客户端的对等节点，以接收和中继交易、区块提案和签名。全节点由使用 Cosmos SDK 定义的应用程序和通过 ABCI 连接到应用程序的共识引擎组成。
:::

:::note

### 先决条件阅读

* [SDK 应用程序的解剖](../high-level-concepts/00-overview-app.md)

:::

## `main` 函数

任何 Cosmos SDK 应用程序的全节点客户端都是通过运行 `main` 函数构建的。通常，客户端的名称是在应用程序名称后附加 `-d` 后缀（例如，对于名为 `app` 的应用程序，客户端名称为 `appd`），而 `main` 函数在 `./appd/cmd/main.go` 文件中定义。运行此函数将创建一个可执行文件 `appd`，并附带一组命令。对于名为 `app` 的应用程序，主要命令是 [`appd start`](#start-command)，用于启动全节点。

通常，开发者将使用以下结构实现 `main.go` 函数：

* 首先，为应用程序实例化一个 [`encodingCodec`](06-encoding.md)。
* 然后，检索 `config` 并设置配置参数。这主要涉及为[地址](../high-level-concepts/03-accounts.md#addresses)设置 Bech32 前缀。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/config.go#L14-L29
```

* 使用 [cobra](https://github.com/spf13/cobra)，创建全节点客户端的根命令。然后，使用 `rootCmd` 的 `AddCommand()` 方法添加应用程序的所有自定义命令。
* 使用 `server.AddCommands()` 方法将默认服务器命令添加到 `rootCmd`。这些命令与上面添加的命令分开，因为它们是标准的，并在 Cosmos SDK 级别上定义。它们应该被所有基于 Cosmos SDK 的应用程序共享。其中包括最重要的命令：[`start` 命令](#start-command)。
* 准备并执行 `executor`。

```go reference
https://github.com/cometbft/cometbft/blob/v0.37.0/libs/cli/setup.go#L74-L78
```

查看`simapp`应用程序的`main`函数示例，`simapp`是Cosmos SDK用于演示目的的应用程序：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/main.go
```

## `start`命令

`start`命令在Cosmos SDK的`/server`文件夹中定义。它被添加到完整节点客户端的根命令中的[`main`函数](#main-function)，并由最终用户调用以启动他们的节点：

```bash
# For an example app named "app", the following command starts the full-node.
appd start

# Using the Cosmos SDK's own simapp, the following commands start the simapp node.
simd start
```

提醒一下，完整节点由三个概念层组成：网络层、共识层和应用层。前两个通常被捆绑在一起，称为共识引擎（默认为CometBFT），而第三个是使用Cosmos SDK的帮助定义的状态机。目前，Cosmos SDK使用CometBFT作为默认的共识引擎，这意味着`start`命令被实现为启动一个CometBFT节点。

`start`命令的流程非常简单。首先，它从上下文中检索`config`以打开`db`（默认情况下是[`leveldb`](https://github.com/syndtr/goleveldb)实例）。这个`db`包含应用程序的最新已知状态（如果应用程序是第一次启动，则为空）。

使用`db`，`start`命令使用`appCreator`函数创建一个应用程序的新实例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/start.go#L220
```

注意，`appCreator`是一个满足`AppCreator`签名的函数：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/types/app.go#L64-L66
```

实际上，[应用程序的构造函数](../high-level-concepts/00-overview-app.md#constructor-function)被传递为`appCreator`。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L254-L268
```

然后，使用`app`实例来实例化一个新的CometBFT节点：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/start.go#L336-L348
```

CometBFT节点可以使用`app`创建，因为后者满足[`abci.Application`接口](https://github.com/cometbft/cometbft/blob/v0.37.0/abci/types/application.go#L9-L35)（假设`app`扩展了[`baseapp`](00-baseapp.md)）。作为`node.New`方法的一部分，CometBFT确保应用程序的高度（即自创世区块以来的区块数）等于CometBFT节点的高度。这两个高度之间的差异应始终为负数或零。如果严格为负数，则`node.New`将重放区块，直到应用程序的高度达到CometBFT节点的高度。最后，如果应用程序的高度为`0`，CometBFT节点将调用应用程序的[`InitChain`](00-baseapp.md#initchain)方法，以从创世文件初始化状态。

一旦CometBFT节点实例化并与应用程序同步，就可以启动节点：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/start.go#L350-L352
```

启动后，节点将引导其RPC和P2P服务器并开始拨号到对等节点。在与对等节点进行握手期间，如果节点意识到对方领先，它将按顺序查询所有区块以进行追赶。然后，它将等待验证人提供新的区块提案和区块签名，以便取得进展。

## 其他命令

要了解如何具体运行节点并与其进行交互，请参阅我们的[运行节点、API和CLI](../../user/run-node/01-run-node.md)指南。




# Node Client (Daemon)

:::note Synopsis
The main endpoint of a Cosmos SDK application is the daemon client, otherwise known as the full-node client. The full-node runs the state-machine, starting from a genesis file. It connects to peers running the same client in order to receive and relay transactions, block proposals and signatures. The full-node is constituted of the application, defined with the Cosmos SDK, and of a consensus engine connected to the application via the ABCI.
:::

:::note

### Pre-requisite Readings

* [Anatomy of an SDK application](../high-level-concepts/00-overview-app.md)

:::

## `main` function

The full-node client of any Cosmos SDK application is built by running a `main` function. The client is generally named by appending the `-d` suffix to the application name (e.g. `appd` for an application named `app`), and the `main` function is defined in a `./appd/cmd/main.go` file. Running this function creates an executable `appd` that comes with a set of commands. For an app named `app`, the main command is [`appd start`](#start-command), which starts the full-node.

In general, developers will implement the `main.go` function with the following structure:

* First, an [`encodingCodec`](06-encoding.md) is instantiated for the application.
* Then, the `config` is retrieved and config parameters are set. This mainly involves setting the Bech32 prefixes for [addresses](../high-level-concepts/03-accounts.md#addresses).

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/config.go#L14-L29
```

* Using [cobra](https://github.com/spf13/cobra), the root command of the full-node client is created. After that, all the custom commands of the application are added using the `AddCommand()` method of `rootCmd`.
* Add default server commands to `rootCmd` using the `server.AddCommands()` method. These commands are separated from the ones added above since they are standard and defined at Cosmos SDK level. They should be shared by all Cosmos SDK-based applications. They include the most important command: the [`start` command](#start-command).
* Prepare and execute the `executor`.
  
```go reference
https://github.com/cometbft/cometbft/blob/v0.37.0/libs/cli/setup.go#L74-L78
```

See an example of `main` function from the `simapp` application, the Cosmos SDK's application for demo purposes:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/main.go
```

## `start` command

The `start` command is defined in the `/server` folder of the Cosmos SDK. It is added to the root command of the full-node client in the [`main` function](#main-function) and called by the end-user to start their node:

```bash
# For an example app named "app", the following command starts the full-node.
appd start

# Using the Cosmos SDK's own simapp, the following commands start the simapp node.
simd start
```

As a reminder, the full-node is composed of three conceptual layers: the networking layer, the consensus layer and the application layer. The first two are generally bundled together in an entity called the consensus engine (CometBFT by default), while the third is the state-machine defined with the help of the Cosmos SDK. Currently, the Cosmos SDK uses CometBFT as the default consensus engine, meaning the start command is implemented to boot up a CometBFT node.

The flow of the `start` command is pretty straightforward. First, it retrieves the `config` from the `context` in order to open the `db` (a [`leveldb`](https://github.com/syndtr/goleveldb) instance by default). This `db` contains the latest known state of the application (empty if the application is started from the first time.

With the `db`, the `start` command creates a new instance of the application using an `appCreator` function:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/start.go#L220
```

Note that an `appCreator` is a function that fulfills the `AppCreator` signature:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/types/app.go#L64-L66
```

In practice, the [constructor of the application](../high-level-concepts/00-overview-app.md#constructor-function) is passed as the `appCreator`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/simd/cmd/root.go#L254-L268
```

Then, the instance of `app` is used to instantiate a new CometBFT node:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/start.go#L336-L348
```

The CometBFT node can be created with `app` because the latter satisfies the [`abci.Application` interface](https://github.com/cometbft/cometbft/blob/v0.37.0/abci/types/application.go#L9-L35) (given that `app` extends [`baseapp`](00-baseapp.md)). As part of the `node.New` method, CometBFT makes sure that the height of the application (i.e. number of blocks since genesis) is equal to the height of the CometBFT node. The difference between these two heights should always be negative or null. If it is strictly negative, `node.New` will replay blocks until the height of the application reaches the height of the CometBFT node. Finally, if the height of the application is `0`, the CometBFT node will call [`InitChain`](00-baseapp.md#initchain) on the application to initialize the state from the genesis file.

Once the CometBFT node is instantiated and in sync with the application, the node can be started:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/start.go#L350-L352
```

Upon starting, the node will bootstrap its RPC and P2P server and start dialing peers. During handshake with its peers, if the node realizes they are ahead, it will query all the blocks sequentially in order to catch up. Then, it will wait for new block proposals and block signatures from validators in order to make progress.

## Other commands

To discover how to concretely run a node and interact with it, please refer to our [Running a Node, API and CLI](../../user/run-node/01-run-node.md) guide.
