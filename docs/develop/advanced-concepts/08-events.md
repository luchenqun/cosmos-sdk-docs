# 事件

:::note 概要
`Event` 是包含有关应用程序执行信息的对象。它们主要由区块浏览器和钱包等服务提供商使用，以跟踪各种消息的执行和索引事务。
:::

:::note

### 先决条件阅读

* [Cosmos SDK 应用程序的解剖](../high-level-concepts/00-overview-app.md)
* [CometBFT 事件文档](https://docs.cometbft.com/v0.37/spec/abci/abci++_basic_concepts#events)

:::

## 事件

在 Cosmos SDK 中，事件被实现为 ABCI `Event` 类型的别名，并采用以下形式：`{eventType}.{attributeKey}={attributeValue}`。

```protobuf reference
https://github.com/cometbft/cometbft/blob/v0.37.0/proto/tendermint/abci/types.proto#L334-L343
```

一个事件包含：

* 一个 `type`，用于对事件进行高级别分类；例如，Cosmos SDK 使用 `"message"` 类型来通过 `Msg` 过滤事件。
* 一组 `attributes`，是键值对，提供有关分类事件的更多信息。例如，对于 `"message"` 类型，我们可以使用 `message.action={some_action}`、`message.module={some_module}` 或 `message.sender={some_sender}` 来使用键值对过滤事件。
* 一个 `msg_index`，用于标识与同一事务相关的消息

:::tip
要将属性值解析为字符串，请确保在每个属性值周围添加 `'`（单引号）。
:::

_类型化事件_ 是 Cosmos SDK 中用于发出和查询事件的 Protobuf 定义的 [消息](../../integrate/architecture/adr-032-typed-events.md)。它们在 `event.proto` 文件中定义，以 **每个模块为基础**，并作为 `proto.Message` 读取。
_传统事件_ 在模块的 `/types/events.go` 文件中以 **每个模块为基础** 进行定义。
它们通过使用 [`EventManager`](#eventmanager) 从模块的 Protobuf [`Msg` 服务](../../integrate/building-modules/03-msg-services.md) 触发。

此外，每个模块都在其规范的 `Events` 部分（x/{moduleName}/`README.md`）下记录其事件。

最后，事件在以下 ABCI 消息的响应中返回给底层共识引擎：

* [`BeginBlock`](00-baseapp.md#beginblock)
* [`EndBlock`](00-baseapp.md#endblock)
* [`CheckTx`](00-baseapp.md#checktx)
* [`DeliverTx`](00-baseapp.md#delivertx)

### 示例

以下示例展示了如何使用 Cosmos SDK 查询事件。

| 事件                                             | 描述                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tx.height=23`                                   | 查询高度为 23 的所有交易                                                                                                                                |
| `message.action='/cosmos.bank.v1beta1.Msg/Send'` | 查询包含 x/bank `Send` [服务 `Msg`](../../integrate/building-modules/03-msg-services.md) 的所有交易。注意值周围的 `'`。                                |
| `message.module='bank'`                          | 查询包含来自 x/bank 模块的所有交易。注意值周围的 `'`。                                                                                                   |
| `create_validator.validator='cosmosval1...'`     | x/staking 特定事件，请参阅 [x/staking 规范](../../integrate/modules/staking/README.md)。                                                                 |

## EventManager

在 Cosmos SDK 应用程序中，事件由一个称为 `EventManager` 的抽象管理。
在内部，`EventManager` 跟踪整个事务或 `BeginBlock`/`EndBlock` 执行流程的事件列表。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/events.go#L24-L27
```

`EventManager` 提供了一组有用的方法来管理事件。模块和应用程序开发人员最常使用的方法是 `EmitTypedEvent` 或 `EmitEvent`，用于在 `EventManager` 中跟踪事件。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/events.go#L53-L62
```

模块开发者应该通过每个消息的`Handler`和每个`BeginBlock`/`EndBlock`处理程序中的`EventManager#EmitTypedEvent`或`EventManager#EmitEvent`来处理事件的发射。`EventManager`通过[`Context`](02-context.md)访问，其中事件应该已经注册，并且可以像这样发射：

**Typed events:**

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/keeper/msg_server.go#L88-L91
```

**Legacy events:**

```go
ctx.EventManager().EmitEvent(
    sdk.NewEvent(eventType, sdk.NewAttribute(attributeKey, attributeValue)),
)
```

模块的`handler`函数还应该将新的`EventManager`设置到`context`中，以便按`message`隔离发射的事件：

```go
func NewHandler(keeper Keeper) sdk.Handler {
    return func(ctx sdk.Context, msg sdk.Msg) (*sdk.Result, error) {
        ctx = ctx.WithEventManager(sdk.NewEventManager())
        switch msg := msg.(type) {
```

有关如何通常实现事件并在模块中使用`EventManager`的更详细信息，请参阅[`Msg` services](../../integrate/building-modules/03-msg-services.md)概念文档。

## 订阅事件

您可以使用CometBFT的[Websocket](https://docs.cometbft.com/v0.37/core/subscription)通过调用`subscribe` RPC方法来订阅事件：

```json
{
  "jsonrpc": "2.0",
  "method": "subscribe",
  "id": "0",
  "params": {
    "query": "tm.event='eventCategory' AND eventType.eventAttribute='attributeValue'"
  }
}
```

您可以订阅的主要`eventCategory`有：

* `NewBlock`：包含在`BeginBlock`和`EndBlock`期间触发的事件。
* `Tx`：包含在`DeliverTx`（即交易处理）期间触发的事件。
* `ValidatorSetUpdates`：包含块的验证人集更新。

这些事件在块提交后从`state`包触发。您可以在[CometBFT Go文档](https://pkg.go.dev/github.com/cometbft/cometbft/types#pkg-constants)上获取完整的事件类别列表。

`query`的`type`和`attribute`值允许您过滤您要查找的特定事件。例如，`Mint`交易会触发一个类型为`EventMint`的事件，并且具有`attributes`中的`Id`和`Owner`（在[`NFT`模块的`events.proto`文件中定义](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/nft/v1beta1/event.proto#L21-L31)）。

订阅此事件的方法如下所示：

```json
{
  "jsonrpc": "2.0",
  "method": "subscribe",
  "id": "0",
  "params": {
    "query": "tm.event='Tx' AND mint.owner='ownerAddress'"
  }
}
```

其中`ownerAddress`是按照[`AccAddress`](../high-level-concepts/03-accounts.md#addresses)格式的地址。

可以使用相同的方式订阅[旧版事件](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/types/events.go)。

## 默认事件

有一些事件是由所有消息自动从`baseapp`中发出的。

* `message.action`：消息类型的名称。
* `message.sender`：消息签名者的地址。
* `message.module`：发出消息的模块的名称。

:::tip
模块名称被`baseapp`假定为消息路由的第二个元素："cosmos.bank.v1beta1.MsgSend" -> "bank"。
如果一个模块不遵循标准的消息路径（例如 IBC），建议继续发出模块名称事件。
只有在模块尚未发出该事件时，`Baseapp`才会发出该事件。
:::



# Events

:::note Synopsis
`Event`s are objects that contain information about the execution of the application. They are mainly used by service providers like block explorers and wallet to track the execution of various messages and index transactions.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK application](../high-level-concepts/00-overview-app.md)
* [CometBFT Documentation on Events](https://docs.cometbft.com/v0.37/spec/abci/abci++_basic_concepts#events)

:::

## Events

Events are implemented in the Cosmos SDK as an alias of the ABCI `Event` type and
take the form of: `{eventType}.{attributeKey}={attributeValue}`.

```protobuf reference
https://github.com/cometbft/cometbft/blob/v0.37.0/proto/tendermint/abci/types.proto#L334-L343
```

An Event contains:

* A `type` to categorize the Event at a high-level; for example, the Cosmos SDK uses the `"message"` type to filter Events by `Msg`s.
* A list of `attributes` are key-value pairs that give more information about the categorized Event. For example, for the `"message"` type, we can filter Events by key-value pairs using `message.action={some_action}`, `message.module={some_module}` or `message.sender={some_sender}`.
* A `msg_index` to identify which messages relate to the same transaction

:::tip
To parse the attribute values as strings, make sure to add `'` (single quotes) around each attribute value.
:::

_Typed Events_ are Protobuf-defined [messages](../../integrate/architecture/adr-032-typed-events.md) used by the Cosmos SDK
for emitting and querying Events. They are defined in a `event.proto` file, on a **per-module basis** and are read as `proto.Message`.
_Legacy Events_ are defined on a **per-module basis** in the module's `/types/events.go` file.
They are triggered from the module's Protobuf [`Msg` service](../../integrate/building-modules/03-msg-services.md)
by using the [`EventManager`](#eventmanager).

In addition, each module documents its events under in the `Events` sections of its specs (x/{moduleName}/`README.md`).

Lastly, Events are returned to the underlying consensus engine in the response of the following ABCI messages:

* [`BeginBlock`](00-baseapp.md#beginblock)
* [`EndBlock`](00-baseapp.md#endblock)
* [`CheckTx`](00-baseapp.md#checktx)
* [`DeliverTx`](00-baseapp.md#delivertx)

### Examples

The following examples show how to query Events using the Cosmos SDK.

| Event                                            | Description                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tx.height=23`                                   | Query all transactions at height 23                                                                                                                     |
| `message.action='/cosmos.bank.v1beta1.Msg/Send'` | Query all transactions containing a x/bank `Send` [Service `Msg`](../../integrate/building-modules/03-msg-services.md). Note the `'`s around the value. |
| `message.module='bank'`                          | Query all transactions containing messages from the x/bank module. Note the `'`s around the value.                                                      |
| `create_validator.validator='cosmosval1...'`     | x/staking-specific Event, see [x/staking SPEC](../../integrate/modules/staking/README.md).                                                              |

## EventManager

In Cosmos SDK applications, Events are managed by an abstraction called the `EventManager`.
Internally, the `EventManager` tracks a list of Events for the entire execution flow of a
transaction or `BeginBlock`/`EndBlock`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/events.go#L24-L27
```

The `EventManager` comes with a set of useful methods to manage Events. The method
that is used most by module and application developers is `EmitTypedEvent` or `EmitEvent` that tracks
an Event in the `EventManager`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/events.go#L53-L62
```

Module developers should handle Event emission via the `EventManager#EmitTypedEvent` or `EventManager#EmitEvent` in each message
`Handler` and in each `BeginBlock`/`EndBlock` handler. The `EventManager` is accessed via
the [`Context`](02-context.md), where Event should be already registered, and emitted like this:


**Typed events:**

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/keeper/msg_server.go#L88-L91
```

**Legacy events:**

```go
ctx.EventManager().EmitEvent(
    sdk.NewEvent(eventType, sdk.NewAttribute(attributeKey, attributeValue)),
)
```

Module's `handler` function should also set a new `EventManager` to the `context` to isolate emitted Events per `message`:

```go
func NewHandler(keeper Keeper) sdk.Handler {
    return func(ctx sdk.Context, msg sdk.Msg) (*sdk.Result, error) {
        ctx = ctx.WithEventManager(sdk.NewEventManager())
        switch msg := msg.(type) {
```

See the [`Msg` services](../../integrate/building-modules/03-msg-services.md) concept doc for a more detailed
view on how to typically implement Events and use the `EventManager` in modules.

## Subscribing to Events

You can use CometBFT's [Websocket](https://docs.cometbft.com/v0.37/core/subscription) to subscribe to Events by calling the `subscribe` RPC method:

```json
{
  "jsonrpc": "2.0",
  "method": "subscribe",
  "id": "0",
  "params": {
    "query": "tm.event='eventCategory' AND eventType.eventAttribute='attributeValue'"
  }
}
```

The main `eventCategory` you can subscribe to are:

* `NewBlock`: Contains Events triggered during `BeginBlock` and `EndBlock`.
* `Tx`: Contains Events triggered during `DeliverTx` (i.e. transaction processing).
* `ValidatorSetUpdates`: Contains validator set updates for the block.

These Events are triggered from the `state` package after a block is committed. You can get the
full list of Event categories [on the CometBFT Go documentation](https://pkg.go.dev/github.com/cometbft/cometbft/types#pkg-constants).

The `type` and `attribute` value of the `query` allow you to filter the specific Event you are looking for. For example, a `Mint` transaction triggers an Event of type `EventMint` and has an `Id` and an `Owner` as `attributes` (as defined in the [`events.proto` file of the `NFT` module](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/nft/v1beta1/event.proto#L21-L31)).

Subscribing to this Event would be done like so:

```json
{
  "jsonrpc": "2.0",
  "method": "subscribe",
  "id": "0",
  "params": {
    "query": "tm.event='Tx' AND mint.owner='ownerAddress'"
  }
}
```

where `ownerAddress` is an address following the [`AccAddress`](../high-level-concepts/03-accounts.md#addresses) format.

The same way can be used to subscribe to [legacy events](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/types/events.go).

## Default Events

There are a few events that are automatically emitted for all messages, directly from `baseapp`.

* `message.action`: The name of the message type.
* `message.sender`: The address of the message signer.
* `message.module`: The name of the module that emitted the message.

:::tip
The module name is assumed by `baseapp` to be the second element of the message route: `"cosmos.bank.v1beta1.MsgSend" -> "bank"`.
In case a module does not follow the standard message path, (e.g. IBC), it is advised to keep emitting the module name event.
`Baseapp` only emits that event if the module have not already done so.
:::
