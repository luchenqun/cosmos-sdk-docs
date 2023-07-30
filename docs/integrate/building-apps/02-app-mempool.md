# 应用内存池

:::note 概要
本节描述了如何使用和替换应用内存池。
:::

自 `v0.47` 版本以来，应用程序具有自己的内存池，可以比以前的版本更精细地构建区块。这个变化是通过 [ABCI 1.0](https://github.com/cometbft/cometbft/blob/v0.37.0/spec/abci) 实现的。特别是引入了 ABCI++ 的 `PrepareProposal` 和 `ProcessProposal` 步骤。

:::note

### 先决条件阅读

* [BaseApp](../../develop/advanced-concepts/00-baseapp.md)

:::

## 准备提案

`PrepareProposal` 处理区块的构建，也就是当提案者准备提出一个区块时，它会请求应用程序评估一个 `RequestPrepareProposal`，其中包含了来自 CometBFT 的内存池的一系列交易。此时，应用程序完全控制着提案。它可以修改、删除和注入自己应用内存池中的交易到提案中，甚至可以完全忽略所有交易。应用程序对 `RequestPrepareProposal` 提供的交易的处理不会对 CometBFT 的内存池产生影响。

需要注意的是，应用程序定义了 `PrepareProposal` 的语义，它可能是非确定性的，并且只由当前的区块提案者执行。

现在，前面一句话中两次提到内存池可能会让人困惑，我们来分解一下。CometBFT 有一个内存池，用于将交易传播给网络中的其他节点。这些交易的排序方式由 CometBFT 的内存池决定，通常是先进先出（FIFO）。然而，由于应用程序能够完全检查所有交易，它可以对交易排序提供更大的控制权。允许应用程序处理排序使得应用程序能够定义如何构建区块。

目前，应用程序提供了一个默认的 `PrepareProposal` 实现。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/baseapp.go#L868-L916
```

应用程序开发者可以在 [`app.go`](01-app-go-v2.md) 中自定义实现来覆盖这个默认实现。

```go
prepareOpt := func(app *baseapp.BaseApp) {
	abciPropHandler := baseapp.NewDefaultProposalHandler(mempool, app)
	app.SetPrepareProposal(abciPropHandler.PrepareProposalHandler())
}

baseAppOptions = append(baseAppOptions, prepareOpt)
```

## 提案处理

`ProcessProposal` 处理来自 `PrepareProposal` 的提案验证，其中还包括一个区块头。也就是说，在一个区块被提出后，其他验证者有权对该区块进行投票。默认的 `PrepareProposal` 实现会对每个交易运行基本的有效性检查。

注意，`ProcessProposal` 不能是非确定性的，即它必须是确定性的。这意味着如果 `ProcessProposal` 发生 panic 或失败，并且我们拒绝了，所有诚实的验证者进程都将预投 nil，CometBFT 轮次将再次进行，直到提出一个有效的提案。

以下是默认实现的实现代码：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/baseapp.go#L927-L942
```

与 `PrepareProposal` 一样，这个实现是默认的，应用程序开发者可以在 [`app.go`](01-app-go-v2.md) 中进行修改：

```go
processOpt := func(app *baseapp.BaseApp) {
	abciPropHandler := baseapp.NewDefaultProposalHandler(mempool, app)
	app.SetProcessProposal(abciPropHandler.ProcessProposalHandler())
}

baseAppOptions = append(baseAppOptions, processOpt)
```

## 交易池

现在我们已经了解了 `PrepareProposal` 和 `ProcessProposal`，我们可以继续了解交易池。

应用程序开发者可以编写各种设计用于交易池的实现，SDK 选择提供了简单的交易池实现。具体而言，SDK 提供了以下交易池：

* [无操作交易池](#no-op-mempool)
* [发送者 Nonce 交易池](#sender-nonce-mempool)
* [优先级 Nonce 交易池](#priority-nonce-mempool)

默认的 SDK 是一个[无操作交易池](#no-op-mempool)，但应用程序开发者可以在 [`app.go`](01-app-go-v2.md) 中替换它：

```go
nonceMempool := mempool.NewSenderNonceMempool()
mempoolOpt   := baseapp.SetMempool(nonceMempool)
baseAppOptions = append(baseAppOptions, mempoolOpt)
```

### 无操作交易池

无操作交易池是一种交易池，在 BaseApp 与交易池交互时，交易完全被丢弃和忽略。当使用此交易池时，假定应用程序将依赖于 CometBFT 在 `RequestPrepareProposal` 中定义的交易排序，该排序默认为先进先出。

### 发送者 Nonce 交易池

Nonce 交易池是一种根据 Nonce 对交易进行排序的交易池，以避免 Nonce 的问题。它通过将交易存储在按交易 Nonce 排序的列表中来工作。当提议者要求将交易包含在一个区块中时，它会随机选择一个发送者，并获取列表中的第一个交易。它重复此过程，直到交易池为空或区块已满。

它可以通过以下参数进行配置：

#### MaxTxs

这是一个整数值，用于将内存池设置为三种模式之一：*有界*、*无界*或*禁用*。

* **负数**：禁用，内存池不插入新的交易并提前返回。
* **零**：无界内存池没有交易限制，并且永远不会因为 `ErrMempoolTxMaxCapacity` 而失败。
* **正数**：有界内存池，当 `maxTx` 值与 `CountTx()` 相同时，会因为 `ErrMempoolTxMaxCapacity` 而失败。

#### Seed

设置用于从内存池中选择交易的随机数生成器的种子。

### 优先级非重复序号内存池

[优先级非重复序号内存池](https://github.com/cosmos/cosmos-sdk/blob/main/types/mempool/priority_nonce_spec.md) 是一种内存池实现，它通过两个维度（优先级和发送者序号）将交易存储在部分有序集合中：

* 优先级
* 发送者序号（序列号）

内部使用一个按优先级排序的[跳表](https://pkg.go.dev/github.com/huandu/skiplist)和一个按发送者序号排序的跳表。当同一发送者有多个交易时，它们不总是可以与其他发送者的交易按优先级进行比较，必须通过发送者序号和优先级进行部分排序。

它可以通过以下参数进行配置：

#### MaxTxs

这是一个整数值，用于将内存池设置为三种模式之一：*有界*、*无界*或*禁用*。

* **负数**：禁用，内存池不插入新的交易并提前返回。
* **零**：无界内存池没有交易限制，并且永远不会因为 `ErrMempoolTxMaxCapacity` 而失败。
* **正数**：有界内存池，当 `maxTx` 值与 `CountTx()` 相同时，会因为 `ErrMempoolTxMaxCapacity` 而失败。

#### Callback

优先级非重复序号内存池提供了内存池选项，允许应用程序设置回调函数。

* **OnRead**：设置在从内存池中读取交易时调用的回调函数。
* **TxReplacement**：设置在内存池插入过程中检测到重复交易序号时调用的回调函数。应用程序可以根据交易优先级或特定交易字段定义交易替换规则。

SDK内存池实现的更多信息可以在[godocs](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/types/mempool)中找到。



# Application mempool

:::note Synopsis
This sections describes how the app-side mempool can be used and replaced. 
:::

Since `v0.47` the application has its own mempool to allow much more granular
block building than previous versions. This change was enabled by
[ABCI 1.0](https://github.com/cometbft/cometbft/blob/v0.37.0/spec/abci).
Notably it introduces the `PrepareProposal` and `ProcessProposal` steps of ABCI++.

:::note

### Pre-requisite Readings

* [BaseApp](../../develop/advanced-concepts/00-baseapp.md)

:::

## Prepare Proposal

`PrepareProposal` handles construction of the block, meaning that when a proposer
is preparing to propose a block, it requests the application to evaluate a
`RequestPrepareProposal`, which contains a series of transactions from CometBFT's
mempool. At this point, the application has complete control over the proposal.
It can modify, delete, and inject transactions from it's own app-side mempool into
the proposal or even ignore all the transactions altogether. What the application
does with the transactions provided to it by `RequestPrepareProposal` have no
effect on CometBFT's mempool.

Note, that the application defines the semantics of the `PrepareProposal` and it
MAY be non-deterministic and is only executed by the current block proposer.

Now, reading mempool twice in the previous sentence is confusing, lets break it down.
CometBFT has a mempool that handles gossiping transactions to other nodes
in the network. How these transactions are ordered is determined by CometBFT's
mempool, typically FIFO. However, since the application is able to fully inspect
all transactions, it can provide greater control over transaction ordering.
Allowing the application to handle ordering enables the application to define how
it would like the block constructed. 

Currently, there is a default `PrepareProposal` implementation provided by the application.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/baseapp.go#L868-L916
```

This default implementation can be overridden by the application developer in
favor of a custom implementation in [`app.go`](01-app-go-v2.md):

```go
prepareOpt := func(app *baseapp.BaseApp) {
	abciPropHandler := baseapp.NewDefaultProposalHandler(mempool, app)
	app.SetPrepareProposal(abciPropHandler.PrepareProposalHandler())
}

baseAppOptions = append(baseAppOptions, prepareOpt)
```

## Process Proposal

`ProcessProposal` handles the validation of a proposal from `PrepareProposal`,
which also includes a block header. Meaning, that after a block has been proposed
the other validators have the right to vote on a block. The validator in the
default implementation of `PrepareProposal` runs basic validity checks on each
transaction.

Note, `ProcessProposal` MAY NOT be non-deterministic, i.e. it must be deterministic.
This means if `ProcessProposal` panics or fails and we reject, all honest validator
processes will prevote nil and the CometBFT round will proceed again until a valid
proposal is proposed.

Here is the implementation of the default implementation:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/baseapp.go#L927-L942
```

Like `PrepareProposal` this implementation is the default and can be modified by the application developer in [`app.go`](01-app-go-v2.md):

```go
processOpt := func(app *baseapp.BaseApp) {
	abciPropHandler := baseapp.NewDefaultProposalHandler(mempool, app)
	app.SetProcessProposal(abciPropHandler.ProcessProposalHandler())
}

baseAppOptions = append(baseAppOptions, processOpt)
```

## Mempool

Now that we have walked through the `PrepareProposal` & `ProcessProposal`, we can move on to walking through the mempool. 

There are countless designs that an application developer can write for a mempool, the SDK opted to provide only simple mempool implementations.
Namely, the SDK provides the following mempools:

* [No-op Mempool](#no-op-mempool)
* [Sender Nonce Mempool](#sender-nonce-mempool)
* [Priority Nonce Mempool](#priority-nonce-mempool)

The default SDK is a [No-op Mempool](#no-op-mempool), but it can be replaced by the application developer in [`app.go`](01-app-go-v2.md):

```go
nonceMempool := mempool.NewSenderNonceMempool()
mempoolOpt   := baseapp.SetMempool(nonceMempool)
baseAppOptions = append(baseAppOptions, mempoolOpt)
```

### No-op Mempool

A no-op mempool is a mempool where transactions are completely discarded and ignored when BaseApp interacts with the mempool.
When this mempool is used, it assumed that an application will rely on CometBFT's transaction ordering defined in `RequestPrepareProposal`,
which is FIFO-ordered by default.

### Sender Nonce Mempool

The nonce mempool is a mempool that keeps transactions from an sorted by nonce in order to avoid the issues with nonces. 
It works by storing the transaction in a list sorted by the transaction nonce. When the proposer asks for transactions to be included in a block it randomly selects a sender and gets the first transaction in the list. It repeats this until the mempool is empty or the block is full. 

It is configurable with the following parameters:

#### MaxTxs

It is an integer value that sets the mempool in one of three modes, *bounded*, *unbounded*, or *disabled*.

* **negative**: Disabled, mempool does not insert new transaction and return early.
* **zero**: Unbounded mempool has no transaction limit and will never fail with `ErrMempoolTxMaxCapacity`.
* **positive**: Bounded, it fails with `ErrMempoolTxMaxCapacity` when `maxTx` value is the same as `CountTx()`

#### Seed

Set the seed for the random number generator used to select transactions from the mempool.

### Priority Nonce Mempool

The [priority nonce mempool](https://github.com/cosmos/cosmos-sdk/blob/main/types/mempool/priority_nonce_spec.md) is a mempool implementation that stores txs in a partially ordered set by 2 dimensions:

* priority
* sender-nonce (sequence number)

Internally it uses one priority ordered [skip list](https://pkg.go.dev/github.com/huandu/skiplist) and one skip list per sender ordered by sender-nonce (sequence number). When there are multiple txs from the same sender, they are not always comparable by priority to other sender txs and must be partially ordered by both sender-nonce and priority.

It is configurable with the following parameters:

#### MaxTxs

It is an integer value that sets the mempool in one of three modes, *bounded*, *unbounded*, or *disabled*.

* **negative**: Disabled, mempool does not insert new transaction and return early.
* **zero**: Unbounded mempool has no transaction limit and will never fail with `ErrMempoolTxMaxCapacity`.
* **positive**: Bounded, it fails with `ErrMempoolTxMaxCapacity` when `maxTx` value is the same as `CountTx()`

#### Callback

The priority nonce mempool provides mempool options allowing the application sets callback(s).

* **OnRead**: Set a callback to be called when a transaction is read from the mempool.
* **TxReplacement**: Sets a callback to be called when duplicated transaction nonce detected during mempool insert. Application can define a transaction replacement rule based on tx priority or certain transaction fields.

More information on the SDK mempool implementation can be found in the [godocs](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/types/mempool).
