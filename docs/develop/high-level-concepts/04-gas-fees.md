# Gas和费用

:::note 概要
本文档描述了在Cosmos SDK应用程序中处理Gas和费用的默认策略。
:::

:::note

### 先决条件阅读

* [Cosmos SDK应用程序的解剖](00-overview-app.md)

:::

## `Gas`和`费用`简介

在Cosmos SDK中，`gas`是一种特殊的单位，用于跟踪执行过程中资源的消耗。通常在对存储进行读写操作时会消耗`gas`，但如果需要进行昂贵的计算，也会消耗`gas`。它有两个主要目的：

* 确保区块不会消耗过多的资源并得到最终确定。这在Cosmos SDK中通过[区块gas计量器](#block-gas-meter)默认实现。
* 防止终端用户的垃圾邮件和滥用。为此，在[`message`](../../integrate/building-modules/02-messages-and-queries.md#messages)执行过程中消耗的`gas`通常是有价格的，从而产生一个`费用`（`费用 = gas * gas-prices`）。`费用`通常由`message`的发送者支付。请注意，Cosmos SDK默认不强制执行`gas`定价，因为可能有其他方法来防止垃圾邮件（例如带宽方案）。尽管如此，大多数应用程序通过使用[`AnteHandler`](#antehandler)来实现`费用`机制以防止垃圾邮件。

## Gas计量器

在Cosmos SDK中，`gas`是`uint64`的简称，并由一个称为_gas meter_的对象管理。Gas计量器实现了`GasMeter`接口

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/store/types/gas.go#L40-L51
```

其中：

* `GasConsumed()`返回由gas计量器实例消耗的gas数量。
* `GasConsumedToLimit()`返回由gas计量器实例消耗的gas数量，或者达到了限制。
* `GasRemaining()`返回GasMeter中剩余的gas。
* `Limit()`返回gas计量器实例的限制。如果gas计量器是无限的，则返回`0`。
* `ConsumeGas(amount Gas, descriptor string)`消耗提供的`gas`数量。如果`gas`溢出，则使用`descriptor`消息引发panic。如果gas计量器不是无限的，则如果消耗的`gas`超过限制，它会引发panic。
* `RefundGas()`从消耗的gas中扣除给定的数量。此功能使得可以将gas退还给交易或区块的gas池，以便EVM兼容链可以完全支持go-ethereum StateDB接口。
* `IsPastLimit()`如果gas计量器实例消耗的gas数量严格超过限制，则返回`true`，否则返回`false`。
* `IsOutOfGas()`如果gas计量器实例消耗的gas数量大于或等于限制，则返回`true`，否则返回`false`。

燃气计量器通常保存在[`ctx`](../advanced-concepts/02-context.md)中，并且使用以下模式进行燃气消耗：

```go
ctx.GasMeter().ConsumeGas(amount, "description")
```

默认情况下，Cosmos SDK使用两种不同的燃气计量器，即[主燃气计量器](#main-gas-meter)和[区块燃气计量器](#block-gas-meter)。

### 主燃气计量器

`ctx.GasMeter()`是应用程序的主燃气计量器。主燃气计量器在`BeginBlock`中通过`setDeliverState`进行初始化，然后在导致状态转换的执行序列期间跟踪燃气消耗，即那些最初由[`BeginBlock`](../advanced-concepts/00-baseapp.md#beginblock)，[`DeliverTx`](../advanced-concepts/00-baseapp.md#delivertx)和[`EndBlock`](../advanced-concepts/00-baseapp.md#endblock)触发的序列。在每个`DeliverTx`的开始时，主燃气计量器**必须设置为0**，以便它可以跟踪每个事务的燃气消耗。

燃气消耗通常可以由模块开发人员在[`BeginBlocker`，`EndBlocker`](../../integrate/building-modules/05-beginblock-endblock.md)或[`Msg`服务](../../integrate/building-modules/03-msg-services.md)中手动完成，但大多数情况下，只要对存储进行读取或写入，就会自动完成燃气消耗。这种自动燃气消耗逻辑是在一个名为[`GasKv`](../advanced-concepts/04-store.md#gaskv-store)的特殊存储中实现的。

### 区块燃气计量器

`ctx.BlockGasMeter()`是用于跟踪每个区块的燃气消耗并确保其不超过一定限制的燃气计量器。每次调用[`BeginBlock`](../advanced-concepts/00-baseapp.md#beginblock)时，都会创建一个新的`BlockGasMeter`实例。`BlockGasMeter`是有限的，每个区块的燃气限制在应用程序的共识参数中定义。默认情况下，Cosmos SDK应用程序使用CometBFT提供的默认共识参数：

```go reference
https://github.com/cometbft/cometbft/blob/v0.37.0/types/params.go#L66-L105
```

当通过`DeliverTx`处理正在进行的[交易](../advanced-concepts/01-transactions.md)时，会检查`BlockGasMeter`的当前值是否超过了限制。如果超过了限制，`DeliverTx`会立即返回。即使是在一个区块中的第一个交易，也可能发生这种情况，因为`BeginBlock`本身也会消耗燃气。如果没有超过限制，交易将正常处理。在`DeliverTx`结束时，`ctx.BlockGasMeter()`跟踪的燃气量将增加用于处理该交易的消耗量：

```go
ctx.BlockGasMeter().ConsumeGas(
	ctx.GasMeter().GasConsumedToLimit(),
	"block gas meter",
)
```

## AnteHandler

`AnteHandler`会在每个交易的`CheckTx`和`DeliverTx`过程中运行，它会在每个`sdk.Msg`的Protobuf `Msg`服务方法之前运行。

`anteHandler`并不是在核心的Cosmos SDK中实现的，而是在一个模块中实现的。也就是说，大多数应用程序今天都使用在[`auth`模块](https://github.com/cosmos/cosmos-sdk/tree/main/x/auth)中定义的默认实现。在正常的Cosmos SDK应用程序中，`anteHandler`的预期功能如下：

* 验证交易的类型是否正确。交易类型在实现`anteHandler`的模块中定义，并且遵循交易接口：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/tx_msg.go#L42-L50
```

  这使得开发人员可以使用各种类型的交易来进行应用程序的开发。在默认的`auth`模块中，默认的交易类型是`Tx`：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L13-L26
```

* 验证交易中每个包含的[`message`](../../integrate/building-modules/02-messages-and-queries.md#messages)的签名。每个`message`应该由一个或多个发送者签名，并且这些签名必须在`anteHandler`中进行验证。
* 在`CheckTx`过程中，验证交易中提供的gas价格是否大于本地的`min-gas-prices`（提醒一下，gas价格可以从以下方程中扣除：`fees = gas * gas-prices`）。`min-gas-prices`是每个全节点本地的一个参数，在`CheckTx`过程中用于丢弃未提供最低费用的交易。这确保了mempool不能被垃圾交易所淹没。
* 验证交易的发送者是否有足够的资金来支付`fees`。当最终用户生成一个交易时，他们必须指定以下三个参数中的两个（第三个参数是隐含的）：`fees`、`gas`和`gas-prices`。这表示他们愿意为节点执行他们的交易支付多少费用。提供的`gas`值存储在一个名为`GasWanted`的参数中，以供以后使用。
* 将`newCtx.GasMeter`设置为0，限制为`GasWanted`。**这一步非常重要**，因为它不仅确保交易不能消耗无限的gas，还确保在每次调用`DeliverTx`之前重置`ctx.GasMeter`（在`anteHandler`运行后，将`ctx`设置为`newCtx`，并且每次调用`DeliverTx`时都会运行`anteHandler`）。

如上所述，`anteHandler` 函数返回了事务在执行期间可以消耗的最大 `gas` 限制，称为 `GasWanted`。最终实际消耗的数量被称为 `GasUsed`，因此我们必须满足 `GasUsed =< GasWanted`。当 [`DeliverTx`](../advanced-concepts/00-baseapp.md#delivertx) 函数返回时，`GasWanted` 和 `GasUsed` 都会传递给底层共识引擎。


# Gas and Fees

:::note Synopsis
This document describes the default strategies to handle gas and fees within a Cosmos SDK application.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK Application](00-overview-app.md)

:::

## Introduction to `Gas` and `Fees`

In the Cosmos SDK, `gas` is a special unit that is used to track the consumption of resources during execution. `gas` is typically consumed whenever read and writes are made to the store, but it can also be consumed if expensive computation needs to be done. It serves two main purposes:

* Make sure blocks are not consuming too many resources and are finalized. This is implemented by default in the Cosmos SDK via the [block gas meter](#block-gas-meter).
* Prevent spam and abuse from end-user. To this end, `gas` consumed during [`message`](../../integrate/building-modules/02-messages-and-queries.md#messages) execution is typically priced, resulting in a `fee` (`fees = gas * gas-prices`). `fees` generally have to be paid by the sender of the `message`. Note that the Cosmos SDK does not enforce `gas` pricing by default, as there may be other ways to prevent spam (e.g. bandwidth schemes). Still, most applications implement `fee` mechanisms to prevent spam by using the [`AnteHandler`](#antehandler).

## Gas Meter

In the Cosmos SDK, `gas` is a simple alias for `uint64`, and is managed by an object called a _gas meter_. Gas meters implement the `GasMeter` interface

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/store/types/gas.go#L40-L51
```

where:

* `GasConsumed()` returns the amount of gas that was consumed by the gas meter instance.
* `GasConsumedToLimit()` returns the amount of gas that was consumed by gas meter instance, or the limit if it is reached.
* `GasRemaining()` returns the gas left in the GasMeter.
* `Limit()` returns the limit of the gas meter instance. `0` if the gas meter is infinite.
* `ConsumeGas(amount Gas, descriptor string)` consumes the amount of `gas` provided. If the `gas` overflows, it panics with the `descriptor` message. If the gas meter is not infinite, it panics if `gas` consumed goes above the limit.
* `RefundGas()` deducts the given amount from the gas consumed. This functionality enables refunding gas to the transaction or block gas pools so that EVM-compatible chains can fully support the go-ethereum StateDB interface.
* `IsPastLimit()` returns `true` if the amount of gas consumed by the gas meter instance is strictly above the limit, `false` otherwise.
* `IsOutOfGas()` returns `true` if the amount of gas consumed by the gas meter instance is above or equal to the limit, `false` otherwise.

The gas meter is generally held in [`ctx`](../advanced-concepts/02-context.md), and consuming gas is done with the following pattern:

```go
ctx.GasMeter().ConsumeGas(amount, "description")
```

By default, the Cosmos SDK makes use of two different gas meters, the [main gas meter](#main-gas-meter) and the [block gas meter](#block-gas-meter).

### Main Gas Meter

`ctx.GasMeter()` is the main gas meter of the application. The main gas meter is initialized in `BeginBlock` via `setDeliverState`, and then tracks gas consumption during execution sequences that lead to state-transitions, i.e. those originally triggered by [`BeginBlock`](../advanced-concepts/00-baseapp.md#beginblock), [`DeliverTx`](../advanced-concepts/00-baseapp.md#delivertx) and [`EndBlock`](../advanced-concepts/00-baseapp.md#endblock). At the beginning of each `DeliverTx`, the main gas meter **must be set to 0** in the [`AnteHandler`](#antehandler), so that it can track gas consumption per-transaction.

Gas consumption can be done manually, generally by the module developer in the [`BeginBlocker`, `EndBlocker`](../../integrate/building-modules/05-beginblock-endblock.md) or [`Msg` service](../../integrate/building-modules/03-msg-services.md), but most of the time it is done automatically whenever there is a read or write to the store. This automatic gas consumption logic is implemented in a special store called [`GasKv`](../advanced-concepts/04-store.md#gaskv-store).

### Block Gas Meter

`ctx.BlockGasMeter()` is the gas meter used to track gas consumption per block and make sure it does not go above a certain limit. A new instance of the `BlockGasMeter` is created each time [`BeginBlock`](../advanced-concepts/00-baseapp.md#beginblock) is called. The `BlockGasMeter` is finite, and the limit of gas per block is defined in the application's consensus parameters. By default, Cosmos SDK applications use the default consensus parameters provided by CometBFT:

```go reference
https://github.com/cometbft/cometbft/blob/v0.37.0/types/params.go#L66-L105
```

When a new [transaction](../advanced-concepts/01-transactions.md) is being processed via `DeliverTx`, the current value of `BlockGasMeter` is checked to see if it is above the limit. If it is, `DeliverTx` returns immediately. This can happen even with the first transaction in a block, as `BeginBlock` itself can consume gas. If not, the transaction is processed normally. At the end of `DeliverTx`, the gas tracked by `ctx.BlockGasMeter()` is increased by the amount consumed to process the transaction:

```go
ctx.BlockGasMeter().ConsumeGas(
	ctx.GasMeter().GasConsumedToLimit(),
	"block gas meter",
)
```

## AnteHandler

The `AnteHandler` is run for every transaction during `CheckTx` and `DeliverTx`, before a Protobuf `Msg` service method for each `sdk.Msg` in the transaction. 

The anteHandler is not implemented in the core Cosmos SDK but in a module. That said, most applications today use the default implementation defined in the [`auth` module](https://github.com/cosmos/cosmos-sdk/tree/main/x/auth). Here is what the `anteHandler` is intended to do in a normal Cosmos SDK application:

* Verify that the transactions are of the correct type. Transaction types are defined in the module that implements the `anteHandler`, and they follow the transaction interface:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/tx_msg.go#L42-L50
```

  This enables developers to play with various types for the transaction of their application. In the default `auth` module, the default transaction type is `Tx`: 

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L13-L26
```

* Verify signatures for each [`message`](../../integrate/building-modules/02-messages-and-queries.md#messages) contained in the transaction. Each `message` should be signed by one or multiple sender(s), and these signatures must be verified in the `anteHandler`.
* During `CheckTx`, verify that the gas prices provided with the transaction is greater than the local `min-gas-prices` (as a reminder, gas-prices can be deducted from the following equation: `fees = gas * gas-prices`). `min-gas-prices` is a parameter local to each full-node and used during `CheckTx` to discard transactions that do not provide a minimum amount of fees. This ensures that the mempool cannot be spammed with garbage transactions.
* Verify that the sender of the transaction has enough funds to cover for the `fees`. When the end-user generates a transaction, they must indicate 2 of the 3 following parameters (the third one being implicit): `fees`, `gas` and `gas-prices`. This signals how much they are willing to pay for nodes to execute their transaction. The provided `gas` value is stored in a parameter called `GasWanted` for later use.
* Set `newCtx.GasMeter` to 0, with a limit of `GasWanted`. **This step is crucial**, as it not only makes sure the transaction cannot consume infinite gas, but also that `ctx.GasMeter` is reset in-between each `DeliverTx` (`ctx` is set to `newCtx` after `anteHandler` is run, and the `anteHandler` is run each time `DeliverTx` is called).

As explained above, the `anteHandler` returns a maximum limit of `gas` the transaction can consume during execution called `GasWanted`. The actual amount consumed in the end is denominated `GasUsed`, and we must therefore have `GasUsed =< GasWanted`. Both `GasWanted` and `GasUsed` are relayed to the underlying consensus engine when [`DeliverTx`](../advanced-concepts/00-baseapp.md#delivertx) returns.
