# 交易生命周期

:::note 概要
本文档描述了从创建到提交状态更改的交易生命周期。交易定义在[不同的文档](../advanced-concepts/01-transactions.md)中进行了描述。交易被称为 `Tx`。
:::

:::note

### 先决条件阅读

* [Cosmos SDK 应用程序解剖](00-overview-app.md)
:::

## 创建

### 交易创建

其中一个主要的应用程序接口是命令行界面。用户可以通过在[命令行界面](../advanced-concepts/07-cli.md)中以以下格式输入命令来创建交易 `Tx`，提供交易类型 `[command]`、参数 `[args]` 和配置项（例如 gas 价格）`[flags]`：

```bash
[appname] tx [command] [args] [flags]
```

该命令会自动**创建**交易，使用账户的私钥**签名**交易，并将其**广播**到指定的对等节点。

交易创建需要一些必需的和可选的标志。`--from` 标志指定了交易的发起账户。例如，如果交易正在发送代币，资金将从指定的 `from` 地址中提取。

#### Gas 和费用

此外，用户可以使用几个[标志](../advanced-concepts/07-cli.md)来指示他们愿意支付多少[费用](04-gas-fees.md)：

* `--gas` 指的是交易 `Tx` 消耗的[计算资源](04-gas-fees.md)（称为 gas）的数量。Gas 取决于交易，并且在执行之前无法精确计算，但可以通过将 `--gas` 的值设置为 `auto` 来进行估算。
* `--gas-adjustment`（可选）可用于将 `gas` 值放大，以避免低估。例如，用户可以将其 gas 调整设置为 1.5，以使用估计 gas 的 1.5 倍。
* `--gas-prices` 指定用户愿意为每单位 gas 支付多少费用，可以是一个或多个代币的面额。例如，`--gas-prices=0.025uatom, 0.025upho` 表示用户愿意为每单位 gas 支付 0.025uatom 和 0.025upho。
* `--fees` 指定用户愿意总共支付的费用金额。
* `--timeout-height` 指定一个块超时高度，以防止交易在超过某个高度后被提交。

支付的手续费的最终价值等于燃料乘以燃料价格。换句话说，`fees = ceil(gas * gasPrices)`。因此，由于手续费可以使用燃料价格计算，反之亦然，用户只需指定其中之一。

随后，验证人通过将给定或计算得到的`gas-prices`与其本地的`min-gas-prices`进行比较，决定是否将交易包含在他们的区块中。如果交易的`gas-prices`不够高，则交易将被拒绝，因此用户有动力支付更多的费用。

#### CLI 示例

应用程序`app`的用户可以在其命令行界面中输入以下命令来生成一笔交易，将1000uatom从`senderAddress`发送到`recipientAddress`。该命令指定了他们愿意支付的燃料数量：自动估算的数量乘以1.5倍，燃料价格为0.025uatom每单位燃料。

```bash
appd tx send <recipientAddress> 1000uatom --from <senderAddress> --gas auto --gas-adjustment 1.5 --gas-prices 0.025uatom
```

#### 其他交易创建方法

命令行是与应用程序交互的一种简单方式，但是`Tx`也可以使用[gRPC或REST接口](../advanced-concepts/09-grpc_rest.md)或应用程序开发人员定义的其他入口点来创建。从用户的角度来看，交互取决于他们使用的Web界面或钱包（例如，使用[Lunie.io](https://lunie.io/#/)创建`Tx`并使用Ledger Nano S签名）。

## 添加到内存池

每个接收到`Tx`的全节点（运行CometBFT）都会向应用层发送一个[ABCI消息](https://docs.cometbft.com/v0.37/spec/p2p/messages/)，`CheckTx`，以检查其有效性，并接收到一个`abci.ResponseCheckTx`。如果`Tx`通过了检查，它将被保存在节点的[**内存池**](https://docs.cometbft.com/v0.37/spec/p2p/messages/mempool/)中，这是每个节点独有的一个内存中的交易池，等待被包含在一个区块中 - 诚实的节点会丢弃无效的`Tx`。在共识之前，节点会不断检查传入的交易并将其传播给其对等节点。

### 检查类型

全节点在 `CheckTx` 过程中对 `Tx` 执行无状态（stateless）和有状态（stateful）的检查，目的是尽早识别和拒绝无效的交易，以避免浪费计算资源。

**_无状态_** 检查不需要节点访问状态 - 轻客户端或离线节点可以执行这些检查 - 因此计算开销较小。无状态检查包括确保地址不为空、强制非负数以及其他在定义中指定的逻辑。

**_有状态_** 检查基于已提交的状态验证交易和消息。例如，检查相关值是否存在且可以进行交易、地址是否有足够的资金以及发送者是否被授权或具有正确的所有权以进行交易。在任何给定时刻，全节点通常对应用程序的内部状态有[多个版本](../advanced-concepts/00-baseapp.md#state-updates)，用于不同的目的。例如，节点在验证交易的过程中执行状态更改，但仍需要最后一个已提交状态的副本来回答查询 - 它们不应该使用具有未提交更改的状态来响应。

为了验证 `Tx`，全节点调用 `CheckTx`，其中包括无状态和有状态的检查。进一步的验证将在 [`DeliverTx`](#delivertx) 阶段进行。`CheckTx` 经过几个步骤，首先是对 `Tx` 进行解码。

### 解码

当应用程序从底层共识引擎（例如 CometBFT）接收到 `Tx` 时，它仍然处于其[编码](../advanced-concepts/06-encoding.md)的 `[]byte` 形式，并且需要进行解组才能进行处理。然后，调用 [`runTx`](../advanced-concepts/00-baseapp.md#runtx-antehandler-runmsgs-posthandler) 函数以 `runTxModeCheck` 模式运行，这意味着该函数运行所有检查，但在执行消息和写入状态更改之前退出。

### ValidateBasic（已弃用）

从交易（`Tx`）中提取出消息（[`sdk.Msg`](../advanced-concepts/01-transactions.md#messages)）。对于每个交易，模块开发人员实现的 `sdk.Msg` 接口的 `ValidateBasic` 方法都会运行。
为了丢弃明显无效的消息，`BaseApp` 类型在处理消息的 [`CheckTx`](../advanced-concepts/00-baseapp.md#checktx) 和 [`DeliverTx`](../advanced-concepts/00-baseapp.md#delivertx) 事务时非常早地调用 `ValidateBasic` 方法。
`ValidateBasic` 只能包含**无状态**检查（不需要访问状态的检查）。

:::warning
`ValidateBasic`方法已被弃用，建议直接在各自的[`Msg`服务](../../integrate/building-modules/03-msg-services.md#Validation)中验证消息。

详细信息请阅读[RFC 001](https://docs.cosmos.network/main/rfc/rfc-001-tx-validation)。
:::

:::note
`BaseApp`仍然调用实现该方法的消息的`ValidateBasic`以保持向后兼容性。
:::

#### 指南

不再使用`ValidateBasic`。在模块的`Msg`服务中处理消息时，应进行消息验证。

### AnteHandler

尽管可选，但`AnteHandler`在实践中经常用于执行签名验证、计算燃气、扣除费用和其他与区块链交易相关的核心操作。

`AnteHandler`接收缓存上下文的副本，并对事务类型指定的有限检查进行验证。使用副本允许`AnteHandler`对`Tx`进行有状态的检查，而不会修改最后提交的状态，并在执行失败时恢复到原始状态。

例如，[`auth`](https://github.com/cosmos/cosmos-sdk/tree/main/x/auth/spec)模块的`AnteHandler`检查和递增序列号，检查签名和账户号码，并从事务的第一个签名者中扣除费用 - 所有状态更改都使用`checkState`进行。

### Gas

初始化[`Context`](../advanced-concepts/02-context.md)，其中包含跟踪`Tx`执行期间使用的燃气量的`GasMeter`。用户提供的`Tx`的燃气量称为`GasWanted`。如果执行期间消耗的燃气量`GasConsumed`超过了`GasWanted`，则执行停止，并且对缓存的状态所做的更改不会提交。否则，`CheckTx`将`GasUsed`设置为`GasConsumed`并在结果中返回。计算燃气和费用值后，验证节点检查用户指定的`gas-prices`是否大于其本地定义的`min-gas-prices`。

### 丢弃或添加到内存池

如果在 `CheckTx` 过程中的任何时候 `Tx` 失败，它将被丢弃，事务的生命周期也就此结束。否则，如果它成功通过 `CheckTx`，默认的协议是将其转发到对等节点并将其添加到内存池中，以便 `Tx` 成为下一个区块中包含的候选事务。

**内存池** 的作用是跟踪所有全节点看到的事务。全节点保留一个**内存池缓存**，其中包含它们最近看到的 `mempool.cache_size` 个事务，作为防止重放攻击的第一道防线。理想情况下，`mempool.cache_size` 足够大，能够包含完整的内存池中的所有事务。如果内存池缓存太小无法跟踪所有事务，`CheckTx` 负责识别和拒绝重放的事务。

目前已存在的预防措施包括费用和 `sequence`（nonce）计数器，用于区分重放的事务和相同但有效的事务。如果攻击者试图用多个副本的 `Tx` 垃圾邮件节点，保留内存池缓存的全节点将拒绝所有相同的副本，而不是对它们运行 `CheckTx`。即使副本的 `sequence` 数字已经递增，攻击者也因为需要支付费用而没有动力。

验证节点像全节点一样保留内存池以防止重放攻击，但也将其用作准备包含在区块中的未确认事务的池。请注意，即使在此阶段通过了所有检查，事务仍然有可能在后面被发现无效，因为 `CheckTx` 并未完全验证事务（即，它并未实际执行消息）。

## 区块中的包含

共识是验证节点就接受哪些事务达成一致的过程，它发生在**轮次**中。每个轮次以提议者创建最新事务的区块开始，并以**验证节点**结束，验证节点是具有投票权的特殊全节点，负责共识，同意接受该区块或选择一个 `nil` 区块。验证节点执行共识算法，例如 [CometBFT](https://docs.cometbft.com/v0.37/spec/consensus/)，使用 ABCI 请求向应用程序确认事务，以达成此共识。

共识的第一步是**区块提案**。共识算法从验证者中选择一个提案者来创建和提出一个区块 - 为了将`Tx`包含在内，它必须在这个提案者的内存池中。

## 状态变化

共识的下一步是执行交易以进行完全验证。所有接收到正确提案者的区块提案的全节点通过调用ABCI函数[`BeginBlock`](00-overview-app.md#beginblocker-and-endblocker)，对每个交易调用`DeliverTx`，以及[`EndBlock`](00-overview-app.md#beginblocker-and-endblocker)来执行交易。虽然每个全节点都在本地运行所有操作，但这个过程产生了一个单一的、明确的结果，因为消息的状态转换是确定性的，并且交易在区块提案中是明确有序的。

```text
		-----------------------
		|Receive Block Proposal|
		-----------------------
		          |
			  v
		-----------------------
		| BeginBlock	      |
		-----------------------
		          |
			  v
		-----------------------
		| DeliverTx(tx0)      |
		| DeliverTx(tx1)      |
		| DeliverTx(tx2)      |
		| DeliverTx(tx3)      |
		|	.	      |
		|	.	      |
		|	.	      |
		-----------------------
		          |
			  v
		-----------------------
		| EndBlock	      |
		-----------------------
		          |
			  v
		-----------------------
		| Consensus	      |
		-----------------------
		          |
			  v
		-----------------------
		| Commit	      |
		-----------------------
```

### DeliverTx

在[`BaseApp`](../advanced-concepts/00-baseapp.md)中定义的`DeliverTx` ABCI函数完成了大部分的状态转换：它按照共识期间提交的顺序，为每个交易运行。在底层，`DeliverTx`几乎与`CheckTx`相同，但是调用交付模式下的[`runTx`](../advanced-concepts/00-baseapp.md#runtx)函数，而不是检查模式。全节点不再使用`checkState`，而是使用`deliverState`：

* **解码：** 由于`DeliverTx`是一个ABCI调用，`Tx`以编码的`[]byte`形式接收。节点首先解组交易，使用应用程序中定义的[`TxConfig`](00-overview-app#register-codec)，然后在`runTxModeDeliver`中调用`runTx`，这与`CheckTx`非常相似，但也执行和写入状态变化。

* **检查和`AnteHandler`：** 全节点再次调用`validateBasicMsgs`和`AnteHandler`。这次检查发生的原因是它们在添加到内存池阶段期间可能没有看到相同的交易，而且恶意的提案者可能会包含无效的交易。这里的一个区别是`AnteHandler`不会将`gas-prices`与节点的`min-gas-prices`进行比较，因为该值是每个节点本地的 - 节点之间的不同值会产生不确定的结果。

* **`MsgServiceRouter`:** 在 `CheckTx` 完成后，`DeliverTx` 继续运行 [`runMsgs`](../advanced-concepts/00-baseapp.md#runtx-antehandler-runmsgs-posthandler) 来完全执行事务中的每个 `Msg`。由于事务可能包含来自不同模块的消息，`BaseApp` 需要知道在哪个模块中找到适当的处理程序。这是通过 `BaseApp` 的 `MsgServiceRouter` 实现的，以便可以通过模块的 Protobuf [`Msg` 服务](../../integrate/building-modules/03-msg-services.md) 进行处理。对于 `LegacyMsg` 路由，通过 [模块管理器](../../integrate/building-modules/01-module-manager.md) 调用 `Route` 函数来检索路由名称，并在模块中找到传统的 [`Handler`](../../integrate/building-modules/03-msg-services.md#handler-type)。

* **`Msg` 服务：** Protobuf `Msg` 服务负责执行 `Tx` 中的每个消息，并导致状态转换持久化在 `deliverTxState` 中。

* **PostHandlers：** [`PostHandler`](../advanced-concepts/00-baseapp.md#posthandler) 在消息执行后运行。如果它们失败，`runMsgs` 的状态更改以及 `PostHandlers` 的状态更改都会被回滚。

* **Gas：** 在交付 `Tx` 的过程中，使用 `GasMeter` 来跟踪使用了多少 gas；如果执行完成，`GasUsed` 会被设置并在 `abci.ResponseDeliverTx` 中返回。如果执行停止，因为 `BlockGasMeter` 或 `GasMeter` 用完或其他原因出错，最后的延迟函数会适当地报错或 panic。

如果由于 `Tx` 无效或 `GasMeter` 用完而导致的状态更改失败，事务处理将终止，并且回滚任何状态更改。在区块提案中的无效事务会导致验证节点拒绝该区块，并投票支持一个 `nil` 区块。

### 提交

最后一步是节点提交区块和状态更改。验证节点执行前面的状态转换步骤以验证事务，然后对区块进行签名以确认。非验证节点的全节点不参与共识 - 也就是说，它们无法投票 - 但会监听投票以了解是否应该提交状态更改。

当它们收到足够的验证者投票（2/3+ _precommits_，按投票权重计算），全节点会提交一个新的区块添加到区块链中，并在应用层面上完成状态转换。生成一个新的状态根作为状态转换的默克尔证明。应用程序使用从[Baseapp](../advanced-concepts/00-baseapp.md)继承的[`Commit`](../advanced-concepts/00-baseapp.md#commit) ABCI方法；它通过将`deliverState`写入应用程序的内部状态来同步所有的状态转换。一旦状态变化被提交，`checkState`从最近提交的状态重新开始，`deliverState`重置为`nil`以保持一致并反映这些变化。

请注意，并非所有的区块都具有相同数量的交易，共识可能导致一个`nil`区块或者一个没有任何交易的区块。在公共区块链网络中，验证者也可能是**拜占庭**的，即恶意的，这可能会阻止`Tx`被提交到区块链中。可能的恶意行为包括提议者决定通过将其从区块中排除来审查`Tx`，或者验证者对该区块投反对票。

此时，`Tx`的交易生命周期结束：节点已验证其有效性，通过执行其状态变化将其交付，并提交这些变化。`Tx`本身以`[]byte`形式存储在一个区块中，并追加到区块链中。


# Transaction Lifecycle

:::note Synopsis
This document describes the lifecycle of a transaction from creation to committed state changes. Transaction definition is described in a [different doc](../advanced-concepts/01-transactions.md). The transaction is referred to as `Tx`.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK Application](00-overview-app.md)
:::

## Creation

### Transaction Creation

One of the main application interfaces is the command-line interface. The transaction `Tx` can be created by the user inputting a command in the following format from the [command-line](../advanced-concepts/07-cli.md), providing the type of transaction in `[command]`, arguments in `[args]`, and configurations such as gas prices in `[flags]`:

```bash
[appname] tx [command] [args] [flags]
```

This command automatically **creates** the transaction, **signs** it using the account's private key, and **broadcasts** it to the specified peer node.

There are several required and optional flags for transaction creation. The `--from` flag specifies which [account](03-accounts.md) the transaction is originating from. For example, if the transaction is sending coins, the funds are drawn from the specified `from` address.

#### Gas and Fees

Additionally, there are several [flags](../advanced-concepts/07-cli.md) users can use to indicate how much they are willing to pay in [fees](04-gas-fees.md):

* `--gas` refers to how much [gas](04-gas-fees.md), which represents computational resources, `Tx` consumes. Gas is dependent on the transaction and is not precisely calculated until execution, but can be estimated by providing `auto` as the value for `--gas`.
* `--gas-adjustment` (optional) can be used to scale `gas` up in order to avoid underestimating. For example, users can specify their gas adjustment as 1.5 to use 1.5 times the estimated gas.
* `--gas-prices` specifies how much the user is willing to pay per unit of gas, which can be one or multiple denominations of tokens. For example, `--gas-prices=0.025uatom, 0.025upho` means the user is willing to pay 0.025uatom AND 0.025upho per unit of gas.
* `--fees` specifies how much in fees the user is willing to pay in total.
* `--timeout-height` specifies a block timeout height to prevent the tx from being committed past a certain height.

The ultimate value of the fees paid is equal to the gas multiplied by the gas prices. In other words, `fees = ceil(gas * gasPrices)`. Thus, since fees can be calculated using gas prices and vice versa, the users specify only one of the two.

Later, validators decide whether or not to include the transaction in their block by comparing the given or calculated `gas-prices` to their local `min-gas-prices`. `Tx` is rejected if its `gas-prices` is not high enough, so users are incentivized to pay more.

#### CLI Example

Users of the application `app` can enter the following command into their CLI to generate a transaction to send 1000uatom from a `senderAddress` to a `recipientAddress`. The command specifies how much gas they are willing to pay: an automatic estimate scaled up by 1.5 times, with a gas price of 0.025uatom per unit gas.

```bash
appd tx send <recipientAddress> 1000uatom --from <senderAddress> --gas auto --gas-adjustment 1.5 --gas-prices 0.025uatom
```

#### Other Transaction Creation Methods

The command-line is an easy way to interact with an application, but `Tx` can also be created using a [gRPC or REST interface](../advanced-concepts/09-grpc_rest.md) or some other entry point defined by the application developer. From the user's perspective, the interaction depends on the web interface or wallet they are using (e.g. creating `Tx` using [Lunie.io](https://lunie.io/#/) and signing it with a Ledger Nano S).

## Addition to Mempool

Each full-node (running CometBFT) that receives a `Tx` sends an [ABCI message](https://docs.cometbft.com/v0.37/spec/p2p/messages/),
`CheckTx`, to the application layer to check for validity, and receives an `abci.ResponseCheckTx`. If the `Tx` passes the checks, it is held in the node's
[**Mempool**](https://docs.cometbft.com/v0.37/spec/p2p/messages/mempool/), an in-memory pool of transactions unique to each node, pending inclusion in a block - honest nodes discard a `Tx` if it is found to be invalid. Prior to consensus, nodes continuously check incoming transactions and gossip them to their peers.

### Types of Checks

The full-nodes perform stateless, then stateful checks on `Tx` during `CheckTx`, with the goal to
identify and reject an invalid transaction as early on as possible to avoid wasted computation.

**_Stateless_** checks do not require nodes to access state - light clients or offline nodes can do
them - and are thus less computationally expensive. Stateless checks include making sure addresses
are not empty, enforcing nonnegative numbers, and other logic specified in the definitions.

**_Stateful_** checks validate transactions and messages based on a committed state. Examples
include checking that the relevant values exist and can be transacted with, the address
has sufficient funds, and the sender is authorized or has the correct ownership to transact.
At any given moment, full-nodes typically have [multiple versions](../advanced-concepts/00-baseapp.md#state-updates)
of the application's internal state for different purposes. For example, nodes execute state
changes while in the process of verifying transactions, but still need a copy of the last committed
state in order to answer queries - they should not respond using state with uncommitted changes.

In order to verify a `Tx`, full-nodes call `CheckTx`, which includes both _stateless_ and _stateful_
checks. Further validation happens later in the [`DeliverTx`](#delivertx) stage. `CheckTx` goes
through several steps, beginning with decoding `Tx`.

### Decoding

When `Tx` is received by the application from the underlying consensus engine (e.g. CometBFT ), it is still in its [encoded](../advanced-concepts/06-encoding.md) `[]byte` form and needs to be unmarshaled in order to be processed. Then, the [`runTx`](../advanced-concepts/00-baseapp.md#runtx-antehandler-runmsgs-posthandler) function is called to run in `runTxModeCheck` mode, meaning the function runs all checks but exits before executing messages and writing state changes.

### ValidateBasic (deprecated)

Messages ([`sdk.Msg`](../advanced-concepts/01-transactions.md#messages)) are extracted from transactions (`Tx`). The `ValidateBasic` method of the `sdk.Msg` interface implemented by the module developer is run for each transaction. 
To discard obviously invalid messages, the `BaseApp` type calls the `ValidateBasic` method very early in the processing of the message in the [`CheckTx`](../advanced-concepts/00-baseapp.md#checktx) and [`DeliverTx`](../advanced-concepts/00-baseapp.md#delivertx) transactions.
`ValidateBasic` can include only **stateless** checks (the checks that do not require access to the state). 

:::warning
The `ValidateBasic` method on messages has been deprecated in favor of validating messages directly in their respective [`Msg` services](../../integrate/building-modules/03-msg-services.md#Validation).

Read [RFC 001](https://docs.cosmos.network/main/rfc/rfc-001-tx-validation) for more details.
:::

:::note
`BaseApp` still calls `ValidateBasic` on messages that implements that method for backwards compatibility.
:::

#### Guideline

`ValidateBasic` should not be used anymore. Message validation should be performed in the `Msg` service when [handling a message](../../integrate/building-modules/03-msg-services#Validation) in a module Msg Server.

### AnteHandler

`AnteHandler`s even though optional, are in practice very often used to perform signature verification, gas calculation, fee deduction, and other core operations related to blockchain transactions.

A copy of the cached context is provided to the `AnteHandler`, which performs limited checks specified for the transaction type. Using a copy allows the `AnteHandler` to do stateful checks for `Tx` without modifying the last committed state, and revert back to the original if the execution fails.

For example, the [`auth`](https://github.com/cosmos/cosmos-sdk/tree/main/x/auth/spec) module `AnteHandler` checks and increments sequence numbers, checks signatures and account numbers, and deducts fees from the first signer of the transaction - all state changes are made using the `checkState`.

### Gas

The [`Context`](../advanced-concepts/02-context.md), which keeps a `GasMeter` that tracks how much gas is used during the execution of `Tx`, is initialized. The user-provided amount of gas for `Tx` is known as `GasWanted`. If `GasConsumed`, the amount of gas consumed during execution, ever exceeds `GasWanted`, the execution stops and the changes made to the cached copy of the state are not committed. Otherwise, `CheckTx` sets `GasUsed` equal to `GasConsumed` and returns it in the result. After calculating the gas and fee values, validator-nodes check that the user-specified `gas-prices` is greater than their locally defined `min-gas-prices`.

### Discard or Addition to Mempool

If at any point during `CheckTx` the `Tx` fails, it is discarded and the transaction lifecycle ends
there. Otherwise, if it passes `CheckTx` successfully, the default protocol is to relay it to peer
nodes and add it to the Mempool so that the `Tx` becomes a candidate to be included in the next block.

The **mempool** serves the purpose of keeping track of transactions seen by all full-nodes.
Full-nodes keep a **mempool cache** of the last `mempool.cache_size` transactions they have seen, as a first line of
defense to prevent replay attacks. Ideally, `mempool.cache_size` is large enough to encompass all
of the transactions in the full mempool. If the mempool cache is too small to keep track of all
the transactions, `CheckTx` is responsible for identifying and rejecting replayed transactions.

Currently existing preventative measures include fees and a `sequence` (nonce) counter to distinguish
replayed transactions from identical but valid ones. If an attacker tries to spam nodes with many
copies of a `Tx`, full-nodes keeping a mempool cache reject all identical copies instead of running
`CheckTx` on them. Even if the copies have incremented `sequence` numbers, attackers are
disincentivized by the need to pay fees.

Validator nodes keep a mempool to prevent replay attacks, just as full-nodes do, but also use it as
a pool of unconfirmed transactions in preparation of block inclusion. Note that even if a `Tx`
passes all checks at this stage, it is still possible to be found invalid later on, because
`CheckTx` does not fully validate the transaction (that is, it does not actually execute the messages).

## Inclusion in a Block

Consensus, the process through which validator nodes come to agreement on which transactions to
accept, happens in **rounds**. Each round begins with a proposer creating a block of the most
recent transactions and ends with **validators**, special full-nodes with voting power responsible
for consensus, agreeing to accept the block or go with a `nil` block instead. Validator nodes
execute the consensus algorithm, such as [CometBFT](https://docs.cometbft.com/v0.37/spec/consensus/),
confirming the transactions using ABCI requests to the application, in order to come to this agreement.

The first step of consensus is the **block proposal**. One proposer amongst the validators is chosen
by the consensus algorithm to create and propose a block - in order for a `Tx` to be included, it
must be in this proposer's mempool.

## State Changes

The next step of consensus is to execute the transactions to fully validate them. All full-nodes
that receive a block proposal from the correct proposer execute the transactions by calling the ABCI functions
[`BeginBlock`](00-overview-app.md#beginblocker-and-endblocker), `DeliverTx` for each transaction,
and [`EndBlock`](00-overview-app.md#beginblocker-and-endblocker). While each full-node runs everything
locally, this process yields a single, unambiguous result, since the messages' state transitions are deterministic and transactions are
explicitly ordered in the block proposal.

```text
		-----------------------
		|Receive Block Proposal|
		-----------------------
		          |
			  v
		-----------------------
		| BeginBlock	      |
		-----------------------
		          |
			  v
		-----------------------
		| DeliverTx(tx0)      |
		| DeliverTx(tx1)      |
		| DeliverTx(tx2)      |
		| DeliverTx(tx3)      |
		|	.	      |
		|	.	      |
		|	.	      |
		-----------------------
		          |
			  v
		-----------------------
		| EndBlock	      |
		-----------------------
		          |
			  v
		-----------------------
		| Consensus	      |
		-----------------------
		          |
			  v
		-----------------------
		| Commit	      |
		-----------------------
```

### DeliverTx

The `DeliverTx` ABCI function defined in [`BaseApp`](../advanced-concepts/00-baseapp.md) does the bulk of the
state transitions: it is run for each transaction in the block in sequential order as committed
to during consensus. Under the hood, `DeliverTx` is almost identical to `CheckTx` but calls the
[`runTx`](../advanced-concepts/00-baseapp.md#runtx) function in deliver mode instead of check mode.
Instead of using their `checkState`, full-nodes use `deliverState`:

* **Decoding:** Since `DeliverTx` is an ABCI call, `Tx` is received in the encoded `[]byte` form.
  Nodes first unmarshal the transaction, using the [`TxConfig`](00-overview-app#register-codec) defined in the app, then call `runTx` in `runTxModeDeliver`, which is very similar to `CheckTx` but also executes and writes state changes.

* **Checks and `AnteHandler`:** Full-nodes call `validateBasicMsgs` and `AnteHandler` again. This second check
  happens because they may not have seen the same transactions during the addition to Mempool stage 
  and a malicious proposer may have included invalid ones. One difference here is that the
  `AnteHandler` does not compare `gas-prices` to the node's `min-gas-prices` since that value is local
  to each node - differing values across nodes yield nondeterministic results.

* **`MsgServiceRouter`:** After `CheckTx` exits, `DeliverTx` continues to run
  [`runMsgs`](../advanced-concepts/00-baseapp.md#runtx-antehandler-runmsgs-posthandler) to fully execute each `Msg` within the transaction.
  Since the transaction may have messages from different modules, `BaseApp` needs to know which module
  to find the appropriate handler. This is achieved using `BaseApp`'s `MsgServiceRouter` so that it can be processed by the module's Protobuf [`Msg` service](../../integrate/building-modules/03-msg-services.md).
  For `LegacyMsg` routing, the `Route` function is called via the [module manager](../../integrate/building-modules/01-module-manager.md) to retrieve the route name and find the legacy [`Handler`](../../integrate/building-modules/03-msg-services.md#handler-type) within the module.
  
* **`Msg` service:** Protobuf `Msg` service is responsible for executing each message in the `Tx` and causes state transitions to persist in `deliverTxState`.

* **PostHandlers:** [`PostHandler`](../advanced-concepts/00-baseapp.md#posthandler)s run after the execution of the message. If they fail, the state change of `runMsgs`, as well of `PostHandlers`, are both reverted.

* **Gas:** While a `Tx` is being delivered, a `GasMeter` is used to keep track of how much
  gas is being used; if execution completes, `GasUsed` is set and returned in the
  `abci.ResponseDeliverTx`. If execution halts because `BlockGasMeter` or `GasMeter` has run out or something else goes
  wrong, a deferred function at the end appropriately errors or panics.

If there are any failed state changes resulting from a `Tx` being invalid or `GasMeter` running out,
the transaction processing terminates and any state changes are reverted. Invalid transactions in a
block proposal cause validator nodes to reject the block and vote for a `nil` block instead.

### Commit

The final step is for nodes to commit the block and state changes. Validator nodes
perform the previous step of executing state transitions in order to validate the transactions,
then sign the block to confirm it. Full nodes that are not validators do not
participate in consensus - i.e. they cannot vote - but listen for votes to understand whether or
not they should commit the state changes.

When they receive enough validator votes (2/3+ _precommits_ weighted by voting power), full nodes commit to a new block to be added to the blockchain and
finalize the state transitions in the application layer. A new state root is generated to serve as
a merkle proof for the state transitions. Applications use the [`Commit`](../advanced-concepts/00-baseapp.md#commit)
ABCI method inherited from [Baseapp](../advanced-concepts/00-baseapp.md); it syncs all the state transitions by
writing the `deliverState` into the application's internal state. As soon as the state changes are
committed, `checkState` starts afresh from the most recently committed state and `deliverState`
resets to `nil` in order to be consistent and reflect the changes.

Note that not all blocks have the same number of transactions and it is possible for consensus to
result in a `nil` block or one with none at all. In a public blockchain network, it is also possible
for validators to be **byzantine**, or malicious, which may prevent a `Tx` from being committed in
the blockchain. Possible malicious behaviors include the proposer deciding to censor a `Tx` by
excluding it from the block or a validator voting against the block.

At this point, the transaction lifecycle of a `Tx` is over: nodes have verified its validity,
delivered it by executing its state changes, and committed those changes. The `Tx` itself,
in `[]byte` form, is stored in a block and appended to the blockchain.
