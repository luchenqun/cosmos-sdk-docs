# 上下文

:::note 概要
`context` 是一个数据结构，旨在从一个函数传递到另一个函数，携带有关应用程序当前状态的信息。它提供了对分支存储（整个状态的安全分支）以及有用的对象和信息（如 `gasMeter`、`区块高度`、`共识参数`等）的访问。
:::

:::note

### 先决条件阅读

* [Cosmos SDK 应用程序的解剖](../high-level-concepts/00-overview-app.md)
* [交易的生命周期](../high-level-concepts/01-tx-lifecycle.md)

:::

## 上下文定义

Cosmos SDK 的 `Context` 是一个自定义数据结构，它以 Go 的标准库 [`context`](https://pkg.go.dev/context) 作为基础，并在其定义中包含许多特定于 Cosmos SDK 的其他类型。`Context` 在事务处理中至关重要，因为它允许模块轻松访问它们在 [`multistore`](04-store.md#multistore) 中的相应 [存储](04-store.md#base-layer-kvstores) 并检索事务上下文，例如块头和 gas 计量器。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/context.go#L17-L44
```

* **基本上下文：** 基本类型是 Go 的 [Context](https://pkg.go.dev/context)，在下面的 [Go 上下文包](#go-context-package) 部分中有进一步解释。
* **Multistore：** 每个应用程序的 `BaseApp` 包含一个 [`CommitMultiStore`](04-store.md#multistore)，在创建 `Context` 时提供。调用 `KVStore()` 和 `TransientStore()` 方法允许模块使用其唯一的 `StoreKey` 获取它们各自的 [`KVStore`](04-store.md#base-layer-kvstores)。
* **Header：** [header](https://docs.cometbft.com/v0.37/spec/core/data_structures#header) 是一个区块链类型。它携带有关区块链状态的重要信息，例如区块高度和当前区块的提议者。
* **Header Hash：** 当在 `abci.RequestBeginBlock` 中获取的当前区块头哈希。
* **Chain ID：** 区块所属的区块链的唯一标识号。
* **Transaction Bytes：** 使用上下文处理的事务的 `[]byte` 表示。每个事务都由 Cosmos SDK 和共识引擎（如 CometBFT）的各个部分在其 [生命周期](../high-level-concepts/01-tx-lifecycle.md) 中处理，其中一些部分对事务类型没有任何了解。因此，事务被编组为通用的 `[]byte` 类型，使用某种 [编码格式](06-encoding.md)（如 [Amino](06-encoding.md)）。
* **Logger：** 来自 CometBFT 库的 `logger`。了解更多关于日志的信息，请参阅[此处](https://docs.cometbft.com/v0.37/core/configuration)。模块调用此方法以创建自己独特的模块特定的日志记录器。
* **VoteInfo：** ABCI 类型 [`VoteInfo`](https://docs.cometbft.com/master/spec/abci/abci.html#voteinfo) 的列表，其中包括验证人的名称和一个指示其是否已签署该区块的布尔值。
* **Gas Meters：** 具体而言，用于使用上下文处理的当前事务的 [`gasMeter`](../high-level-concepts/04-gas-fees.md#main-gas-meter) 和整个所属区块的 [`blockGasMeter`](../high-level-concepts/04-gas-fees.md#block-gas-meter)。用户指定他们希望为其事务的执行支付多少费用；这些 gas 计量器跟踪到目前为止在事务或区块中使用了多少 [gas](../high-level-concepts/04-gas-fees.md)。如果 gas 计量器用完，执行将停止。
* **CheckTx 模式：** 一个布尔值，指示是否应在 `CheckTx` 或 `DeliverTx` 模式下处理事务。
* **Min Gas Price：** 节点愿意接受的最低 [gas](../high-level-concepts/04-gas-fees.md) 价格，以便将事务包含在其区块中。此价格是每个节点单独配置的本地值，因此**不应在导致状态转换的任何函数中使用**。
* **共识参数：** ABCI 类型的[共识参数](https://docs.cometbft.com/master/spec/abci/apps.html#consensus-parameters)，用于指定区块链的某些限制，例如区块的最大 gas。
* **事件管理器：** 事件管理器允许任何具有访问 `Context` 的调用者发出 [`Events`](08-events.md)。模块可以通过定义各种 `Types` 和 `Attributes` 或使用在 `types/` 中找到的公共定义来定义模块特定的 `Events`。客户端可以订阅或查询这些 `Events`。这些 `Events` 在 `DeliverTx`、`BeginBlock` 和 `EndBlock` 中收集，并返回给 CometBFT 进行索引。例如：
* **优先级：** 事务优先级，仅在 `CheckTx` 中相关。
* **KV `GasConfig`：** 允许应用程序为 `KVStore` 设置自定义的 `GasConfig`。
* **Transient KV `GasConfig`：** 允许应用程序为临时 `KVStore` 设置自定义的 `GasConfig`。

## Go Context 包

[Golang Context Package](https://pkg.go.dev/context) 定义了一个基本的 `Context`。`Context` 是一个不可变的数据结构，用于在 API 和进程之间传递请求范围的数据。`Context` 还被设计为支持并发，并可在 goroutine 中使用。

`Context` 应该是**不可变的**；不应该对其进行编辑。相反，惯例是使用 `With` 函数从父级创建一个子级 `Context`。例如：

```go
childCtx = parentCtx.WithBlockHeader(header)
```

[Golang Context Package](https://pkg.go.dev/context) 文档指导开发人员在处理过程中显式地将 `ctx` 作为第一个参数传递。

## 存储分支

`Context` 包含一个 `MultiStore`，它允许使用 `CacheMultiStore` 进行分支和缓存功能（在 `CacheMultiStore` 中的查询会被缓存以避免未来的往返请求）。每个 `KVStore` 都会在一个安全且隔离的临时存储中进行分支。进程可以自由地向 `CacheMultiStore` 写入更改。如果状态转换序列顺利完成，存储分支可以在序列结束时提交到底层存储，或者如果出现问题可以忽略它们。`Context` 的使用模式如下：

1. 进程从其父进程接收一个 `Context` `ctx`，该 `Context` 提供执行进程所需的信息。
2. `ctx.ms` 是一个**分支存储**，即创建了一个 [multistore](04-store.md#multistore) 的分支，以便进程在执行过程中对状态进行更改，而不会改变原始的 `ctx.ms`。这对于在执行过程中需要撤销更改的情况下保护底层 multistore 是有用的。
3. 进程在执行过程中可以从 `ctx` 中读取和写入。它可以调用子进程并根据需要将 `ctx` 传递给它。
4. 当子进程返回时，它检查结果是成功还是失败。如果失败，则不需要执行任何操作 - 分支 `ctx` 将被简单地丢弃。如果成功，则可以通过 `Write()` 将对 `CacheMultiStore` 所做的更改提交到原始的 `ctx.ms`。

例如，这是[`baseapp`](00-baseapp.md)中[`runTx`](00-baseapp.md#runtx-antehandler-runmsgs-posthandler)函数的一部分代码：

```go
runMsgCtx, msCache := app.cacheTxContext(ctx, txBytes)
result = app.runMsgs(runMsgCtx, msgs, mode)
result.GasWanted = gasWanted
if mode != runTxModeDeliver {
  return result
}
if result.IsOK() {
  msCache.Write()
}
```

以下是该过程的步骤：

1. 在对交易中的消息调用`runMsgs`之前，它使用`app.cacheTxContext()`来分支和缓存上下文和多存储。
2. `runMsgCtx` - 带有分支存储的上下文，在`runMsgs`中用于返回结果。
3. 如果该过程在[`checkTxMode`](00-baseapp.md#checktx)中运行，则无需写入更改 - 结果会立即返回。
4. 如果该过程在[`deliverTxMode`](00-baseapp.md#delivertx)中运行，并且结果表明所有消息都成功运行，则分支的多存储将被写回原始状态。




# Context

:::note Synopsis
The `context` is a data structure intended to be passed from function to function that carries information about the current state of the application. It provides access to a branched storage (a safe branch of the entire state) as well as useful objects and information like `gasMeter`, `block height`, `consensus parameters` and more.
:::

:::note

### Pre-requisites Readings

* [Anatomy of a Cosmos SDK Application](../high-level-concepts/00-overview-app.md)
* [Lifecycle of a Transaction](../high-level-concepts/01-tx-lifecycle.md)

:::

## Context Definition

The Cosmos SDK `Context` is a custom data structure that contains Go's stdlib [`context`](https://pkg.go.dev/context) as its base, and has many additional types within its definition that are specific to the Cosmos SDK. The `Context` is integral to transaction processing in that it allows modules to easily access their respective [store](04-store.md#base-layer-kvstores) in the [`multistore`](04-store.md#multistore) and retrieve transactional context such as the block header and gas meter.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/context.go#L17-L44
```

* **Base Context:** The base type is a Go [Context](https://pkg.go.dev/context), which is explained further in the [Go Context Package](#go-context-package) section below.
* **Multistore:** Every application's `BaseApp` contains a [`CommitMultiStore`](04-store.md#multistore) which is provided when a `Context` is created. Calling the `KVStore()` and `TransientStore()` methods allows modules to fetch their respective [`KVStore`](04-store.md#base-layer-kvstores) using their unique `StoreKey`.
* **Header:** The [header](https://docs.cometbft.com/v0.37/spec/core/data_structures#header) is a Blockchain type. It carries important information about the state of the blockchain, such as block height and proposer of the current block.
* **Header Hash:** The current block header hash, obtained during `abci.RequestBeginBlock`.
* **Chain ID:** The unique identification number of the blockchain a block pertains to.
* **Transaction Bytes:** The `[]byte` representation of a transaction being processed using the context. Every transaction is processed by various parts of the Cosmos SDK and consensus engine (e.g. CometBFT) throughout its [lifecycle](../high-level-concepts/01-tx-lifecycle.md), some of which do not have any understanding of transaction types. Thus, transactions are marshaled into the generic `[]byte` type using some kind of [encoding format](06-encoding.md) such as [Amino](06-encoding.md).
* **Logger:** A `logger` from the CometBFT libraries. Learn more about logs [here](https://docs.cometbft.com/v0.37/core/configuration). Modules call this method to create their own unique module-specific logger.
* **VoteInfo:** A list of the ABCI type [`VoteInfo`](https://docs.cometbft.com/master/spec/abci/abci.html#voteinfo), which includes the name of a validator and a boolean indicating whether they have signed the block.
* **Gas Meters:** Specifically, a [`gasMeter`](../high-level-concepts/04-gas-fees.md#main-gas-meter) for the transaction currently being processed using the context and a [`blockGasMeter`](../high-level-concepts/04-gas-fees.md#block-gas-meter) for the entire block it belongs to. Users specify how much in fees they wish to pay for the execution of their transaction; these gas meters keep track of how much [gas](../high-level-concepts/04-gas-fees.md) has been used in the transaction or block so far. If the gas meter runs out, execution halts.
* **CheckTx Mode:** A boolean value indicating whether a transaction should be processed in `CheckTx` or `DeliverTx` mode.
* **Min Gas Price:** The minimum [gas](../high-level-concepts/04-gas-fees.md) price a node is willing to take in order to include a transaction in its block. This price is a local value configured by each node individually, and should therefore **not be used in any functions used in sequences leading to state-transitions**.
* **Consensus Params:** The ABCI type [Consensus Parameters](https://docs.cometbft.com/master/spec/abci/apps.html#consensus-parameters), which specify certain limits for the blockchain, such as maximum gas for a block.
* **Event Manager:** The event manager allows any caller with access to a `Context` to emit [`Events`](08-events.md). Modules may define module specific
  `Events` by defining various `Types` and `Attributes` or use the common definitions found in `types/`. Clients can subscribe or query for these `Events`. These `Events` are collected throughout `DeliverTx`, `BeginBlock`, and `EndBlock` and are returned to CometBFT for indexing. For example:
* **Priority:** The transaction priority, only relevant in `CheckTx`.
* **KV `GasConfig`:** Enables applications to set a custom `GasConfig` for the `KVStore`.
* **Transient KV `GasConfig`:** Enables applications to set a custom `GasConfig` for the transiant `KVStore`.

## Go Context Package

A basic `Context` is defined in the [Golang Context Package](https://pkg.go.dev/context). A `Context`
is an immutable data structure that carries request-scoped data across APIs and processes. Contexts
are also designed to enable concurrency and to be used in goroutines.

Contexts are intended to be **immutable**; they should never be edited. Instead, the convention is
to create a child context from its parent using a `With` function. For example:

```go
childCtx = parentCtx.WithBlockHeader(header)
```

The [Golang Context Package](https://pkg.go.dev/context) documentation instructs developers to
explicitly pass a context `ctx` as the first argument of a process.

## Store branching

The `Context` contains a `MultiStore`, which allows for branchinig and caching functionality using `CacheMultiStore`
(queries in `CacheMultiStore` are cached to avoid future round trips).
Each `KVStore` is branched in a safe and isolated ephemeral storage. Processes are free to write changes to
the `CacheMultiStore`. If a state-transition sequence is performed without issue, the store branch can
be committed to the underlying store at the end of the sequence or disregard them if something
goes wrong. The pattern of usage for a Context is as follows:

1. A process receives a Context `ctx` from its parent process, which provides information needed to
   perform the process.
2. The `ctx.ms` is a **branched store**, i.e. a branch of the [multistore](04-store.md#multistore) is made so that the process can make changes to the state as it executes, without changing the original`ctx.ms`. This is useful to protect the underlying multistore in case the changes need to be reverted at some point in the execution.
3. The process may read and write from `ctx` as it is executing. It may call a subprocess and pass
   `ctx` to it as needed.
4. When a subprocess returns, it checks if the result is a success or failure. If a failure, nothing
   needs to be done - the branch `ctx` is simply discarded. If successful, the changes made to
   the `CacheMultiStore` can be committed to the original `ctx.ms` via `Write()`.

For example, here is a snippet from the [`runTx`](00-baseapp.md#runtx-antehandler-runmsgs-posthandler) function in [`baseapp`](00-baseapp.md):

```go
runMsgCtx, msCache := app.cacheTxContext(ctx, txBytes)
result = app.runMsgs(runMsgCtx, msgs, mode)
result.GasWanted = gasWanted
if mode != runTxModeDeliver {
  return result
}
if result.IsOK() {
  msCache.Write()
}
```

Here is the process:

1. Prior to calling `runMsgs` on the message(s) in the transaction, it uses `app.cacheTxContext()`
   to branch and cache the context and multistore.
2. `runMsgCtx` - the context with branched store, is used in `runMsgs` to return a result.
3. If the process is running in [`checkTxMode`](00-baseapp.md#checktx), there is no need to write the
   changes - the result is returned immediately.
4. If the process is running in [`deliverTxMode`](00-baseapp.md#delivertx) and the result indicates
   a successful run over all the messages, the branched multistore is written back to the original.
