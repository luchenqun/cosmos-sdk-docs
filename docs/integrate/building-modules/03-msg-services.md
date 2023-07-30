# `Msg` 服务

:::note 概述
Protobuf `Msg` 服务处理 [消息](02-messages-and-queries.md#messages)。Protobuf `Msg` 服务特定于定义它们的模块，并且仅处理在该模块内定义的消息。它们在 [`DeliverTx`](../../develop/advanced-concepts/00-baseapp.md#delivertx) 中由 `BaseApp` 调用。
:::

:::note

### 先决条件阅读

* [模块管理器](01-module-manager.md)
* [消息和查询](02-messages-and-queries.md)

:::

## 模块 `Msg` 服务的实现

每个模块应该定义一个 Protobuf `Msg` 服务，负责处理请求（实现 `sdk.Msg`）并返回响应。

如 [ADR 031](../architecture/adr-031-msg-service.md) 中进一步描述的那样，这种方法的优点是明确指定返回类型并生成服务器和客户端代码。

Protobuf 根据 `Msg` 服务的定义生成 `MsgServer` 接口。模块开发者的角色是实现此接口，通过实现在接收到每个 `sdk.Msg` 时应发生的状态转换逻辑。以下是 `x/bank` 生成的 `MsgServer` 接口示例，它公开了两个 `sdk.Msg`：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/types/tx.pb.go#L550-L568
```

在可能的情况下，现有模块的 [`Keeper`](06-keeper.md) 应该实现 `MsgServer`，否则可以创建一个嵌入 `Keeper` 的 `msgServer` 结构体，通常位于 `./keeper/msg_server.go`：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/msg_server.go#L15-L17
```

`msgServer` 方法可以使用 `sdk.UnwrapSDKContext` 从 `context.Context` 参数方法中检索 `sdk.Context`：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/msg_server.go#L28
```

`sdk.Msg` 的处理通常遵循以下 3 个步骤：

### 验证

消息服务器必须执行所有所需的验证（包括 *有状态* 和 *无状态*）以确保 `message` 是有效的。
`signer` 负责此验证的燃料成本。

例如，对于`transfer`消息，`msgServer`方法应该检查发送账户是否有足够的资金来执行转账。

建议将所有验证检查都实现在一个单独的函数中，该函数将状态值作为参数传递。这种实现简化了测试。如预期的那样，昂贵的验证函数会额外收取gas。示例：

```go
ValidateMsgA(msg MsgA, now Time, gm GasMeter) error {
	if now.Before(msg.Expire) {
		return sdkerrrors.ErrInvalidRequest.Wrap("msg expired")
	}
	gm.ConsumeGas(1000, "signature verification")
	return signatureVerificaton(msg.Prover, msg.Data)
}
```

:::warning
以前，使用`ValidateBasic`方法执行简单且无状态的验证检查。
这种验证方式已被弃用，这意味着`msgServer`必须执行所有验证检查。
:::

### 状态转换

在验证成功后，`msgServer`方法使用[`keeper`](06-keeper.md)函数访问状态并执行状态转换。

### 事件

在返回之前，`msgServer`方法通常通过使用`ctx`中保存的`EventManager`来发出一个或多个[事件](../../develop/advanced-concepts/08-events.md)。使用基于protobuf的事件类型的新`EmitTypedEvent`函数：

```go
ctx.EventManager().EmitTypedEvent(
	&group.EventABC{Key1: Value1,  Key2, Value2})
```

或者使用旧的`EmitEvent`函数：

```go
ctx.EventManager().EmitEvent(
	sdk.NewEvent(
		eventType,  // e.g. sdk.EventTypeMessage for a message, types.CustomEventType for a custom event defined in the module
		sdk.NewAttribute(key1, value1),
		sdk.NewAttribute(key2, value2),
	),
)
```

这些事件被传递回底层共识引擎，并可由服务提供者用于实现应用程序周围的服务。点击[这里](../../develop/advanced-concepts/08-events.md)了解更多关于事件的信息。

调用的`msgServer`方法返回一个`proto.Message`响应和一个`error`。然后，将这些返回值使用`sdk.WrapServiceResult(ctx sdk.Context, res proto.Message, err error)`封装为`*sdk.Result`或`error`：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/msg_service_router.go#L131
```

该方法负责将`res`参数编组为protobuf，并将`ctx.EventManager()`上的任何事件附加到`sdk.Result`上。 

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/base/abci/v1beta1/abci.proto#L88-L109
```

这个图示展示了一个典型的 Protobuf `Msg` 服务的结构，以及消息在模块中的传播方式。

![交易流程](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/transaction_flow.svg)

## 遥测

当处理消息时，可以从 `msgServer` 方法中创建新的[遥测指标](../../develop/advanced-concepts/11-telemetry.md)。

以下是 `x/auth/vesting` 模块的一个示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/vesting/msg_server.go#L68-L80
```




# `Msg` Services

:::note Synopsis
A Protobuf `Msg` service processes [messages](02-messages-and-queries.md#messages). Protobuf `Msg` services are specific to the module in which they are defined, and only process messages defined within the said module. They are called from `BaseApp` during [`DeliverTx`](../../develop/advanced-concepts/00-baseapp.md#delivertx).
:::

:::note

### Pre-requisite Readings

* [Module Manager](01-module-manager.md)
* [Messages and Queries](02-messages-and-queries.md)

:::

## Implementation of a module `Msg` service

Each module should define a Protobuf `Msg` service, which will be responsible for processing requests (implementing `sdk.Msg`) and returning responses.

As further described in [ADR 031](../architecture/adr-031-msg-service.md), this approach has the advantage of clearly specifying return types and generating server and client code.

Protobuf generates a `MsgServer` interface based on a definition of `Msg` service. It is the role of the module developer to implement this interface, by implementing the state transition logic that should happen upon receival of each `sdk.Msg`. As an example, here is the generated `MsgServer` interface for `x/bank`, which exposes two `sdk.Msg`s:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/types/tx.pb.go#L550-L568
```

When possible, the existing module's [`Keeper`](06-keeper.md) should implement `MsgServer`, otherwise a `msgServer` struct that embeds the `Keeper` can be created, typically in `./keeper/msg_server.go`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/msg_server.go#L15-L17
```

`msgServer` methods can retrieve the `sdk.Context` from the `context.Context` parameter method using the `sdk.UnwrapSDKContext`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/msg_server.go#L28
```

`sdk.Msg` processing usually follows these 3 steps:

### Validation

The message server must perform all validation required (both *stateful* and *stateless*) to make sure the `message` is valid.
The `signer` is charged for the gas cost of this validation.

For example, a `msgServer` method for a `transfer` message should check that the sending account has enough funds to actually perform the transfer. 

It is recommended to implement all validation checks in a separate function that passes state values as arguments. This implementation simplifies testing. As expected, expensive validation functions charge additional gas. Example:

```go
ValidateMsgA(msg MsgA, now Time, gm GasMeter) error {
	if now.Before(msg.Expire) {
		return sdkerrrors.ErrInvalidRequest.Wrap("msg expired")
	}
	gm.ConsumeGas(1000, "signature verification")
	return signatureVerificaton(msg.Prover, msg.Data)
}
```

:::warning
Previously, the `ValidateBasic` method was used to perform simple and stateless validation checks.
This way of validating is deprecated, this means the `msgServer` must perform all validation checks.
:::

### State Transition

After the validation is successful, the `msgServer` method uses the [`keeper`](06-keeper.md) functions to access the state and perform a state transition.

### Events 

Before returning, `msgServer` methods generally emit one or more [events](../../develop/advanced-concepts/08-events.md) by using the `EventManager` held in the `ctx`. Use the new `EmitTypedEvent` function that uses protobuf-based event types:

```go
ctx.EventManager().EmitTypedEvent(
	&group.EventABC{Key1: Value1,  Key2, Value2})
```

or the older `EmitEvent` function: 

```go
ctx.EventManager().EmitEvent(
	sdk.NewEvent(
		eventType,  // e.g. sdk.EventTypeMessage for a message, types.CustomEventType for a custom event defined in the module
		sdk.NewAttribute(key1, value1),
		sdk.NewAttribute(key2, value2),
	),
)
```

These events are relayed back to the underlying consensus engine and can be used by service providers to implement services around the application. Click [here](../../develop/advanced-concepts/08-events.md) to learn more about events.

The invoked `msgServer` method returns a `proto.Message` response and an `error`. These return values are then wrapped into an `*sdk.Result` or an `error` using `sdk.WrapServiceResult(ctx sdk.Context, res proto.Message, err error)`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/msg_service_router.go#L131
```

This method takes care of marshaling the `res` parameter to protobuf and attaching any events on the `ctx.EventManager()` to the `sdk.Result`.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/base/abci/v1beta1/abci.proto#L88-L109
```

This diagram shows a typical structure of a Protobuf `Msg` service, and how the message propagates through the module.

![Transaction flow](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/transaction_flow.svg)

## Telemetry

New [telemetry metrics](../../develop/advanced-concepts/11-telemetry.md) can be created from `msgServer` methods when handling messages.

This is an example from the `x/auth/vesting` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/vesting/msg_server.go#L68-L80
```
