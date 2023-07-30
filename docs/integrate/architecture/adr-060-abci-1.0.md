# ADR 60: ABCI 1.0 集成（第一阶段）

## 更新日志

* 2022-08-10：初稿（@alexanderbez，@tac0turtle）
* 2022年11月12日：根据初始实现 [PR](https://github.com/cosmos/cosmos-sdk/pull/13453) 更新 `PrepareProposal` 和 `ProcessProposal` 语义（@alexanderbez）

## 状态

已接受

## 摘要

本 ADR 描述了在 Cosmos SDK 中初步采用 [ABCI 1.0](https://github.com/tendermint/tendermint/blob/master/spec/abci%2B%2B/README.md)，即 ABCI 的下一代演进。ABCI 1.0 旨在为应用开发人员提供更多灵活性和对应用和共识语义的控制，例如应用内存池、进程内预言机和订单簿式匹配引擎。

## 背景

Tendermint 将发布 ABCI 1.0。值得注意的是，在撰写本文时，Tendermint 正在发布 v0.37.0，其中将包括 `PrepareProposal` 和 `ProcessProposal`。

`PrepareProposal` ABCI 方法涉及块提议者请求应用评估一系列要包含在下一个块中的交易，这些交易被定义为 `TxRecord` 对象的切片。应用可以接受、拒绝或完全忽略其中的一些或全部交易。这是一个重要的考虑因素，因为应用可以基本上定义和控制自己的内存池，从而通过完全忽略 Tendermint 发送的 `TxRecords`，优先处理自己的交易，从而定义复杂的交易优先级和过滤机制。这实际上意味着 Tendermint 内存池更像是一个八卦数据结构。

第二个 ABCI 方法 `ProcessProposal` 用于处理块提议者根据 `PrepareProposal` 定义的提议。需要注意以下几点：

* `ProcessProposal` 的执行必须是确定性的。
* `PrepareProposal` 和 `ProcessProposal` 之间必须存在一致性。换句话说，对于任意两个正确的进程 *p* 和 *q*，如果 *q* 的 Tendermint 在 *u<sub>p</sub>* 上调用 `RequestProcessProposal`，则 *q* 的应用程序在 `ResponseProcessProposal` 中返回 ACCEPT。

重要提示：在ABCI 1.0集成中，应用程序**不负责**锁定语义，Tendermint仍然负责此功能。然而，在未来，应用程序将负责锁定，从而实现并行执行的可能性。

## 决策

我们将在Cosmos SDK的下一个主要版本中集成ABCI 1.0，该版本将在Tendermint v0.37.0中引入。我们将在`BaseApp`类型上集成ABCI 1.0方法。我们将在下面逐个描述这两个方法的实现。

在描述这两个新方法的实现之前，重要提示：现有的ABCI方法，如`CheckTx`、`DeliverTx`等，仍然存在，并且具有与现在相同的功能。

### `PrepareProposal`

在评估如何实现`PrepareProposal`的决策之前，重要提示：`CheckTx`仍然会被执行，并且将负责评估交易的有效性，就像现在一样，但有一个非常重要的**附加**区别。

在执行`CheckTx`中的交易时，应用程序现在会将有效的交易（即通过AnteHandler的交易）添加到自己的mempool数据结构中。为了提供满足应用程序开发者不同需求的灵活方法，我们将定义一个mempool接口和一个使用Golang泛型的数据结构，使开发者只需关注交易排序。需要绝对完全控制的开发者可以实现自己的自定义mempool实现。

我们定义通用的mempool接口如下（可能会有变化）：

```go
type Mempool interface {
	// Insert attempts to insert a Tx into the app-side mempool returning
	// an error upon failure.
	Insert(sdk.Context, sdk.Tx) error

	// Select returns an Iterator over the app-side mempool. If txs are specified,
	// then they shall be incorporated into the Iterator. The Iterator must
	// closed by the caller.
	Select(sdk.Context, [][]byte) Iterator

	// CountTx returns the number of transactions currently in the mempool.
	CountTx() int

	// Remove attempts to remove a transaction from the mempool, returning an error
	// upon failure.
	Remove(sdk.Tx) error
}

// Iterator defines an app-side mempool iterator interface that is as minimal as
// possible. The order of iteration is determined by the app-side mempool
// implementation.
type Iterator interface {
	// Next returns the next transaction from the mempool. If there are no more
	// transactions, it returns nil.
	Next() Iterator

	// Tx returns the transaction at the current position of the iterator.
	Tx() sdk.Tx
}
```

我们将定义一个`Mempool`的实现，由`nonceMempool`定义，它将涵盖大多数基本应用程序用例。具体而言，它将按照交易发送者对交易进行优先级排序，允许同一发送者的多个交易。

默认的应用程序端mempool实现`nonceMempool`将在一个跳表数据结构上运行。具体而言，全局最低nonce的交易将优先处理。具有相同nonce的交易将按发送者地址进行优先级排序。

```go
type nonceMempool struct {
	txQueue *huandu.SkipList
}
```

之前的讨论<sup>1</sup>已经达成共识，Tendermint将通过`RequestPrepareProposal`向应用程序发起请求，获取从Tendermint的本地mempool中获取的一定数量的交易。具体获取的交易数量将由本地操作员配置确定。这被称为讨论中所见的“一次性方法”。

当Tendermint从本地mempool中获取交易并通过`RequestPrepareProposal`发送给应用程序时，应用程序将需要评估这些交易。具体来说，它需要告知Tendermint是否应该拒绝或包含每个交易。注意，应用程序甚至可以完全用其他交易替换交易。

在评估`RequestPrepareProposal`中的交易时，应用程序将忽略请求中发送给它的*所有*交易，并从自己的mempool中获取最多`RequestPrepareProposal.max_tx_bytes`字节的交易。

由于应用程序在`CheckTx`执行期间可以在`Insert`中插入或注入交易，建议应用程序在`PrepareProposal`期间获取交易时确保交易的有效性。然而，有效性的具体含义完全由应用程序确定。

Cosmos SDK将提供一个默认的`PrepareProposal`实现，仅选择最多`MaxBytes`个*有效*交易。

然而，应用程序可以通过自己的实现覆盖此默认实现，并通过`SetPrepareProposal`将其设置在`BaseApp`上。


### `ProcessProposal`

`ProcessProposal` ABCI方法相对简单。它负责确保包含从`PrepareProposal`步骤中选择的交易的建议块的有效性。然而，应用程序如何确定建议块的有效性取决于应用程序及其不同的用例。对于大多数应用程序，简单地调用`AnteHandler`链就足够了，但也可能有其他需要更多控制验证过程的应用程序，例如确保交易按特定顺序或包含特定交易。虽然理论上可以通过自定义的`AnteHandler`实现来实现这一点，但这不是最简洁的用户体验或最高效的解决方案。

相反，我们将在现有的`Application`接口上定义一个额外的ABCI接口方法，类似于现有的ABCI方法，如`BeginBlock`或`EndBlock`。这个新的接口方法将被定义如下：

```go
ProcessProposal(sdk.Context, abci.RequestProcessProposal) error {}
```

注意，我们必须在`Context`参数上使用一个新的内部分支状态来调用`ProcessProposal`，因为我们不能简单地使用现有的`checkState`，因为此时`BaseApp`已经有一个修改过的`checkState`。因此，在执行`ProcessProposal`时，我们会在`deliverState`的基础上创建一个类似的分支状态`processProposalState`。注意，`processProposalState`永远不会被提交，并且在`ProcessProposal`执行完毕后完全被丢弃。

Cosmos SDK将提供`ProcessProposal`的默认实现，其中所有交易都将使用CheckTx流程（即AnteHandler）进行验证，并且除非任何交易无法解码，否则始终返回ACCEPT。

### `DeliverTx`

由于在`PrepareProposal`期间交易并没有真正从应用程序侧的内存池中移除，因为`ProcessProposal`可能会失败或需要多轮，并且我们不希望丢失交易，所以我们需要在`DeliverTx`期间最终从应用程序侧的内存池中移除交易，因为在这个阶段，交易正在被包含在提议的区块中。

或者，我们可以在`PrepareProposal`的清理阶段将交易真正地从中移除，并在`ProcessProposal`失败的情况下将它们添加回应用程序侧的内存池中。

## 后果

### 向后兼容性

ABCI 1.0与Cosmos SDK和Tendermint的先前版本自然不兼容。例如，向不支持ABCI 1.0的同一应用程序请求`RequestPrepareProposal`将自然失败。

然而，在集成的第一阶段，现有的ABCI方法将像今天一样存在并且按照当前的方式工作。

### 积极影响

* 应用程序现在完全控制交易的排序和优先级。
* 为ABCI 1.0的完全集成奠定了基础，这将解锁更多关于区块构建和与Tendermint共识引擎集成的应用程序端用例。

### 负面影响

* 需要在Tendermint和Cosmos SDK之间复制“mempool”，作为一个收集和存储未提交交易的通用数据结构。
* 在块执行的上下文中，Tendermint和Cosmos SDK之间需要额外的请求。尽管如此，开销应该可以忽略不计。
* 不向后兼容之前的Tendermint和Cosmos SDK版本。

## 进一步讨论

可以使用不同的数据结构和实现方式来设计`Mempool[T MempoolTx]`的应用端实现，每种方式都有不同的权衡。所提议的解决方案保持简单，并涵盖了大多数基本应用所需的情况。可以做出权衡来提高对提供的mempool实现的收割和插入性能。

## 参考资料

* https://github.com/tendermint/tendermint/blob/master/spec/abci%2B%2B/README.md
* [1] https://github.com/tendermint/tendermint/issues/7750#issuecomment-1076806155
* [2] https://github.com/tendermint/tendermint/issues/7750#issuecomment-1075717151


# ADR 60: ABCI 1.0 Integration (Phase I)

## Changelog

* 2022-08-10: Initial Draft (@alexanderbez, @tac0turtle)
* Nov 12, 2022: Update `PrepareProposal` and `ProcessProposal` semantics per the
  initial implementation [PR](https://github.com/cosmos/cosmos-sdk/pull/13453) (@alexanderbez)

## Status

ACCEPTED

## Abstract

This ADR describes the initial adoption of [ABCI 1.0](https://github.com/tendermint/tendermint/blob/master/spec/abci%2B%2B/README.md),
the next evolution of ABCI, within the Cosmos SDK. ABCI 1.0 aims to provide
application developers with more flexibility and control over application and
consensus semantics, e.g. in-application mempools, in-process oracles, and
order-book style matching engines.

## Context

Tendermint will release ABCI 1.0. Notably, at the time of this writing,
Tendermint is releasing v0.37.0 which will include `PrepareProposal` and `ProcessProposal`.

The `PrepareProposal` ABCI method is concerned with a block proposer requesting
the application to evaluate a series of transactions to be included in the next
block, defined as a slice of `TxRecord` objects. The application can either
accept, reject, or completely ignore some or all of these transactions. This is
an important consideration to make as the application can essentially define and
control its own mempool allowing it to define sophisticated transaction priority
and filtering mechanisms, by completely ignoring the `TxRecords` Tendermint
sends it, favoring its own transactions. This essentially means that the Tendermint
mempool acts more like a gossip data structure.

The second ABCI method, `ProcessProposal`, is used to process the block proposer's
proposal as defined by `PrepareProposal`. It is important to note the following
with respect to `ProcessProposal`:

* Execution of `ProcessProposal` must be deterministic.
* There must be coherence between `PrepareProposal` and `ProcessProposal`. In
  other words, for any two correct processes *p* and *q*, if *q*'s Tendermint
	calls `RequestProcessProposal` on *u<sub>p</sub>*, *q*'s Application returns
	ACCEPT in `ResponseProcessProposal`.

It is important to note that in ABCI 1.0 integration, the application
is NOT responsible for locking semantics -- Tendermint will still be responsible
for that. In the future, however, the application will be responsible for locking,
which allows for parallel execution possibilities.

## Decision

We will integrate ABCI 1.0, which will be introduced in Tendermint
v0.37.0, in the next major release of the Cosmos SDK. We will integrate ABCI 1.0
methods on the `BaseApp` type. We describe the implementations of the two methods
individually below.

Prior to describing the implementation of the two new methods, it is important to
note that the existing ABCI methods, `CheckTx`, `DeliverTx`, etc, still exist and
serve the same functions as they do now.

### `PrepareProposal`

Prior to evaluating the decision for how to implement `PrepareProposal`, it is
important to note that `CheckTx` will still be executed and will be responsible
for evaluating transaction validity as it does now, with one very important
*additive* distinction.

When executing transactions in `CheckTx`, the application will now add valid
transactions, i.e. passing the AnteHandler, to its own mempool data structure.
In order to provide a flexible approach to meet the varying needs of application
developers, we will define both a mempool interface and a data structure utilizing
Golang generics, allowing developers to focus only on transaction
ordering. Developers requiring absolute full control can implement their own
custom mempool implementation.

We define the general mempool interface as follows (subject to change):

```go
type Mempool interface {
	// Insert attempts to insert a Tx into the app-side mempool returning
	// an error upon failure.
	Insert(sdk.Context, sdk.Tx) error

	// Select returns an Iterator over the app-side mempool. If txs are specified,
	// then they shall be incorporated into the Iterator. The Iterator must
	// closed by the caller.
	Select(sdk.Context, [][]byte) Iterator

	// CountTx returns the number of transactions currently in the mempool.
	CountTx() int

	// Remove attempts to remove a transaction from the mempool, returning an error
	// upon failure.
	Remove(sdk.Tx) error
}

// Iterator defines an app-side mempool iterator interface that is as minimal as
// possible. The order of iteration is determined by the app-side mempool
// implementation.
type Iterator interface {
	// Next returns the next transaction from the mempool. If there are no more
	// transactions, it returns nil.
	Next() Iterator

	// Tx returns the transaction at the current position of the iterator.
	Tx() sdk.Tx
}
```

We will define an implementation of `Mempool`, defined by `nonceMempool`, that
will cover most basic application use-cases. Namely, it will prioritize transactions
by transaction sender, allowing for multiple transactions from the same sender.

The default app-side mempool implementation, `nonceMempool`, will operate on a 
single skip list data structure. Specifically, transactions with the lowest nonce
globally are prioritized. Transactions with the same nonce are prioritized by
sender address.

```go
type nonceMempool struct {
	txQueue *huandu.SkipList
}
```

Previous discussions<sup>1</sup> have come to the agreement that Tendermint will
perform a request to the application, via `RequestPrepareProposal`, with a certain
amount of transactions reaped from Tendermint's local mempool. The exact amount
of transactions reaped will be determined by a local operator configuration.
This is referred to as the "one-shot approach" seen in discussions.

When Tendermint reaps transactions from the local mempool and sends them to the
application via `RequestPrepareProposal`, the application will have to evaluate
the transactions. Specifically, it will need to inform Tendermint if it should
reject and or include each transaction. Note, the application can even *replace*
transactions entirely with other transactions.

When evaluating transactions from `RequestPrepareProposal`, the application will
ignore *ALL* transactions sent to it in the request and instead reap up to
`RequestPrepareProposal.max_tx_bytes` from it's own mempool.

Since an application can technically insert or inject transactions on `Insert`
during `CheckTx` execution, it is recommended that applications ensure transaction
validity when reaping transactions during `PrepareProposal`. However, what validity
exactly means is entirely determined by the application.

The Cosmos SDK will provide a default `PrepareProposal` implementation that simply
select up to `MaxBytes` *valid* transactions.

However, applications can override this default implementation with their own
implementation and set that on `BaseApp` via `SetPrepareProposal`.


### `ProcessProposal`

The `ProcessProposal` ABCI method is relatively straightforward. It is responsible
for ensuring validity of the proposed block containing transactions that were
selected from the `PrepareProposal` step. However, how an application determines
validity of a proposed block depends on the application and its varying use cases.
For most applications, simply calling the `AnteHandler` chain would suffice, but
there could easily be other applications that need more control over the validation
process of the proposed block, such as ensuring txs are in a certain order or
that certain transactions are included. While this theoretically could be achieved
with a custom `AnteHandler` implementation, it's not the cleanest UX or the most
efficient solution.

Instead, we will define an additional ABCI interface method on the existing
`Application` interface, similar to the existing ABCI methods such as `BeginBlock`
or `EndBlock`. This new interface method will be defined as follows:

```go
ProcessProposal(sdk.Context, abci.RequestProcessProposal) error {}
```

Note, we must call `ProcessProposal` with a new internal branched state on the
`Context` argument as we cannot simply just use the existing `checkState` because
`BaseApp` already has a modified `checkState` at this point. So when executing
`ProcessProposal`, we create a similar branched state, `processProposalState`,
off of `deliverState`. Note, the `processProposalState` is never committed and
is completely discarded after `ProcessProposal` finishes execution.

The Cosmos SDK will provide a default implementation of `ProcessProposal` in which
all transactions are validated using the CheckTx flow, i.e. the AnteHandler, and
will always return ACCEPT unless any transaction cannot be decoded.

### `DeliverTx`

Since transactions are not truly removed from the app-side mempool during
`PrepareProposal`, since `ProcessProposal` can fail or take multiple rounds and
we do not want to lose transactions, we need to finally remove the transaction
from the app-side mempool during `DeliverTx` since during this phase, the
transactions are being included in the proposed block.

Alternatively, we can keep the transactions as truly being removed during the
reaping phase in `PrepareProposal` and add them back to the app-side mempool in
case `ProcessProposal` fails.

## Consequences

### Backwards Compatibility

ABCI 1.0 is naturally not backwards compatible with prior versions of the Cosmos SDK
and Tendermint. For example, an application that requests `RequestPrepareProposal`
to the same application that does not speak ABCI 1.0 will naturally fail.

However, in the first phase of the integration, the existing ABCI methods as we
know them today will still exist and function as they currently do.

### Positive

* Applications now have full control over transaction ordering and priority.
* Lays the groundwork for the full integration of ABCI 1.0, which will unlock more
  app-side use cases around block construction and integration with the Tendermint
  consensus engine.

### Negative

* Requires that the "mempool", as a general data structure that collects and stores
  uncommitted transactions will be duplicated between both Tendermint and the
  Cosmos SDK.
* Additional requests between Tendermint and the Cosmos SDK in the context of
  block execution. Albeit, the overhead should be negligible.
* Not backwards compatible with previous versions of Tendermint and the Cosmos SDK.

## Further Discussions

It is possible to design the app-side implementation of the `Mempool[T MempoolTx]`
in many different ways using different data structures and implementations. All
of which have different tradeoffs. The proposed solution keeps things simple
and covers cases that would be required for most basic applications. There are
tradeoffs that can be made to improve performance of reaping and inserting into
the provided mempool implementation.

## References

* https://github.com/tendermint/tendermint/blob/master/spec/abci%2B%2B/README.md
* [1] https://github.com/tendermint/tendermint/issues/7750#issuecomment-1076806155
* [2] https://github.com/tendermint/tendermint/issues/7750#issuecomment-1075717151
