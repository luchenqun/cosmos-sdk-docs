# ADR 022: 自定义 BaseApp panic 处理

## 变更日志

* 2020年4月24日：初稿
* 2021年9月14日：被 ADR-045 取代

## 状态

被 ADR-045 取代

## 背景

当前的 BaseApp 实现不允许开发者在 panic 恢复期间编写自定义错误处理程序
[runTx()](https://github.com/cosmos/cosmos-sdk/blob/bad4ca75f58b182f600396ca350ad844c18fc80b/baseapp/baseapp.go#L539)
方法。我们认为这个方法可以更加灵活，可以为 Cosmos SDK 用户提供更多的自定义选项，而无需重写整个 BaseApp。此外，对于 `sdk.ErrorOutOfGas` 错误处理，有一个特殊情况，该情况可能以“标准”方式（中间件）处理。

我们提出了一种中间件解决方案，可以帮助开发者实现以下情况：

* 添加外部日志记录（比如将报告发送到外部服务，如 [Sentry](https://sentry.io)）；
* 对特定错误情况调用 panic；

它还将使 `OutOfGas` 情况和 `default` 情况成为中间件之一。
`Default` 情况将恢复对象包装为错误并记录下来（[示例中间件实现](#recovery-middleware)）。

我们的项目在区块链节点（智能合约虚拟机）旁边运行一个辅助服务。节点 <-> 辅助服务的连接稳定对于 TX 处理至关重要。因此，当通信中断时，我们需要崩溃节点，并在问题解决后重新启动它。这种行为使节点的状态机执行具有确定性。由于所有 keeper 的 panic 都被 runTx 的 `defer()` 处理程序捕获，我们必须调整 BaseApp 代码以进行自定义。

## 决策

### 设计

#### 概述

我们建议不将自定义错误处理硬编码到 BaseApp 中，而是建议使用一组中间件，可以在外部进行自定义，并允许开发者使用尽可能多的自定义错误处理程序。实现及测试可以在[此处](https://github.com/cosmos/cosmos-sdk/pull/6053)找到。

#### 实现细节

##### 恢复处理程序

添加了新的 `RecoveryHandler` 类型。`recoveryObj` 输入参数是由 Go 语言的 `builtin` 包中的标准函数 `recover()` 返回的对象。

```go
type RecoveryHandler func(recoveryObj interface{}) error
```

处理程序应该对对象进行类型断言（或其他方法），以确定是否应该处理该对象。
如果输入对象无法由该`RecoveryHandler`处理（不是处理程序的目标类型），则应返回`nil`。
如果已处理输入对象并且应停止中间件链执行，则应返回非`nil`错误。

例如：

```go
func exampleErrHandler(recoveryObj interface{}) error {
    err, ok := recoveryObj.(error)
    if !ok { return nil }

    if someSpecificError.Is(err) {
        panic(customPanicMsg)
    } else {
        return nil
    }
}
```

此示例会中断应用程序的执行，但也可能丰富错误的上下文，例如`OutOfGas`处理程序。

##### 恢复中间件

我们还添加了一个中间件类型（装饰器）。该函数类型包装了`RecoveryHandler`并返回执行链中的下一个中间件和处理程序的`error`。该类型用于将实际的`recovery()`对象处理与中间件链处理分开。

```go
type recoveryMiddleware func(recoveryObj interface{}) (recoveryMiddleware, error)

func newRecoveryMiddleware(handler RecoveryHandler, next recoveryMiddleware) recoveryMiddleware {
    return func(recoveryObj interface{}) (recoveryMiddleware, error) {
        if err := handler(recoveryObj); err != nil {
            return nil, err
        }
        return next, nil
    }
}
```

函数接收一个`recoveryObj`对象并返回：

* （下一个`recoveryMiddleware`，`nil`），如果对象未被`RecoveryHandler`处理（不是目标类型）；
* （`nil`，非`nil`错误），如果已处理输入对象并且不应执行链中的其他中间件；
* （`nil`，`nil`），如果行为无效。恢复可能未被正确处理；可以通过始终在链中使用`default`作为最右边的中间件（始终返回`error`）来避免这种情况；

`OutOfGas`中间件示例：

```go
func newOutOfGasRecoveryMiddleware(gasWanted uint64, ctx sdk.Context, next recoveryMiddleware) recoveryMiddleware {
    handler := func(recoveryObj interface{}) error {
        err, ok := recoveryObj.(sdk.ErrorOutOfGas)
        if !ok { return nil }

        return errorsmod.Wrap(
            sdkerrors.ErrOutOfGas, fmt.Sprintf(
                "out of gas in location: %v; gasWanted: %d, gasUsed: %d", err.Descriptor, gasWanted, ctx.GasMeter().GasConsumed(),
            ),
        )
    }

    return newRecoveryMiddleware(handler, next)
}
```

`Default`中间件示例：

```go
func newDefaultRecoveryMiddleware() recoveryMiddleware {
    handler := func(recoveryObj interface{}) error {
        return errorsmod.Wrap(
            sdkerrors.ErrPanic, fmt.Sprintf("recovered: %v\nstack:\n%v", recoveryObj, string(debug.Stack())),
        )
    }

    return newRecoveryMiddleware(handler, nil)
}
```

##### 恢复处理

基本的中间件处理链如下所示：

```go
func processRecovery(recoveryObj interface{}, middleware recoveryMiddleware) error {
	if middleware == nil { return nil }

	next, err := middleware(recoveryObj)
	if err != nil { return err }
	if next == nil { return nil }

	return processRecovery(recoveryObj, next)
}
```

这样，我们可以创建一个从左到右执行的中间件链，最右边的中间件是一个`default`处理程序，必须返回一个`error`。

##### BaseApp更改

`default`中间件链必须存在于`BaseApp`对象中。`Baseapp`的修改如下：

```go
type BaseApp struct {
    // ...
    runTxRecoveryMiddleware recoveryMiddleware
}

func NewBaseApp(...) {
    // ...
    app.runTxRecoveryMiddleware = newDefaultRecoveryMiddleware()
}

func (app *BaseApp) runTx(...) {
    // ...
    defer func() {
        if r := recover(); r != nil {
            recoveryMW := newOutOfGasRecoveryMiddleware(gasWanted, ctx, app.runTxRecoveryMiddleware)
            err, result = processRecovery(r, recoveryMW), nil
        }

        gInfo = sdk.GasInfo{GasWanted: gasWanted, GasUsed: ctx.GasMeter().GasConsumed()}
    }()
    // ...
}
```

开发人员可以通过将`AddRunTxRecoveryHandler`作为`NewBaseapp`构造函数的BaseApp选项参数来添加自定义的`RecoveryHandler`：

```go
func (app *BaseApp) AddRunTxRecoveryHandler(handlers ...RecoveryHandler) {
    for _, h := range handlers {
        app.runTxRecoveryMiddleware = newRecoveryMiddleware(h, app.runTxRecoveryMiddleware)
    }
}
```

这个方法会在现有的链前面添加处理程序。

## 结果

### 积极的

* 基于 Cosmos SDK 的项目开发者可以添加自定义的 panic 处理程序来：
    * 为自定义 panic 源（在自定义 keeper 内部的 panic）添加错误上下文；
    * 发出 `panic()`：将恢复对象传递给 Tendermint 核心；
    * 进行其他必要的处理；
* 开发者可以使用标准的 Cosmos SDK `BaseApp` 实现，而不需要在他们的项目中重新编写它；
* 提议的解决方案不会破坏当前的“标准”`runTx()`流程；

### 消极的

* 引入了对执行模型设计的更改。

### 中立的

* `OutOfGas` 错误处理程序成为其中一个中间件；
* 默认的 panic 处理程序成为其中一个中间件；

## 参考资料

* [具有提议解决方案的 PR-6053](https://github.com/cosmos/cosmos-sdk/pull/6053)
* [类似的解决方案。ADR-010 模块化 AnteHandler](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-010-modular-antehandler.md)


# ADR 022: Custom BaseApp panic handling

## Changelog

* 2020 Apr 24: Initial Draft
* 2021 Sep 14: Superseded by ADR-045

## Status

SUPERSEDED by ADR-045

## Context

The current implementation of BaseApp does not allow developers to write custom error handlers during panic recovery
[runTx()](https://github.com/cosmos/cosmos-sdk/blob/bad4ca75f58b182f600396ca350ad844c18fc80b/baseapp/baseapp.go#L539)
method. We think that this method can be more flexible and can give Cosmos SDK users more options for customizations without
the need to rewrite whole BaseApp. Also there's one special case for `sdk.ErrorOutOfGas` error handling, that case
might be handled in a "standard" way (middleware) alongside the others.

We propose middleware-solution, which could help developers implement the following cases:

* add external logging (let's say sending reports to external services like [Sentry](https://sentry.io));
* call panic for specific error cases;

It will also make `OutOfGas` case and `default` case one of the middlewares.
`Default` case wraps recovery object to an error and logs it ([example middleware implementation](#recovery-middleware)).

Our project has a sidecar service running alongside the blockchain node (smart contracts virtual machine). It is
essential that node <-> sidecar connectivity stays stable for TXs processing. So when the communication breaks we need
to crash the node and reboot it once the problem is solved. That behaviour makes node's state machine execution
deterministic. As all keeper panics are caught by runTx's `defer()` handler, we have to adjust the BaseApp code
in order to customize it.

## Decision

### Design

#### Overview

Instead of hardcoding custom error handling into BaseApp we suggest using set of middlewares which can be customized
externally and will allow developers use as many custom error handlers as they want. Implementation with tests
can be found [here](https://github.com/cosmos/cosmos-sdk/pull/6053).

#### Implementation details

##### Recovery handler

New `RecoveryHandler` type added. `recoveryObj` input argument is an object returned by the standard Go function
`recover()` from the `builtin` package.

```go
type RecoveryHandler func(recoveryObj interface{}) error
```

Handler should type assert (or other methods) an object to define if object should be handled.
`nil` should be returned if input object can't be handled by that `RecoveryHandler` (not a handler's target type).
Not `nil` error should be returned if input object was handled and middleware chain execution should be stopped.

An example:

```go
func exampleErrHandler(recoveryObj interface{}) error {
    err, ok := recoveryObj.(error)
    if !ok { return nil }

    if someSpecificError.Is(err) {
        panic(customPanicMsg)
    } else {
        return nil
    }
}
```

This example breaks the application execution, but it also might enrich the error's context like the `OutOfGas` handler.

##### Recovery middleware

We also add a middleware type (decorator). That function type wraps `RecoveryHandler` and returns the next middleware in
execution chain and handler's `error`. Type is used to separate actual `recovery()` object handling from middleware
chain processing.

```go
type recoveryMiddleware func(recoveryObj interface{}) (recoveryMiddleware, error)

func newRecoveryMiddleware(handler RecoveryHandler, next recoveryMiddleware) recoveryMiddleware {
    return func(recoveryObj interface{}) (recoveryMiddleware, error) {
        if err := handler(recoveryObj); err != nil {
            return nil, err
        }
        return next, nil
    }
}
```

Function receives a `recoveryObj` object and returns:

* (next `recoveryMiddleware`, `nil`) if object wasn't handled (not a target type) by `RecoveryHandler`;
* (`nil`, not nil `error`) if input object was handled and other middlewares in the chain should not be executed;
* (`nil`, `nil`) in case of invalid behavior. Panic recovery might not have been properly handled;
this can be avoided by always using a `default` as a rightmost middleware in the chain (always returns an `error`');

`OutOfGas` middleware example:

```go
func newOutOfGasRecoveryMiddleware(gasWanted uint64, ctx sdk.Context, next recoveryMiddleware) recoveryMiddleware {
    handler := func(recoveryObj interface{}) error {
        err, ok := recoveryObj.(sdk.ErrorOutOfGas)
        if !ok { return nil }

        return errorsmod.Wrap(
            sdkerrors.ErrOutOfGas, fmt.Sprintf(
                "out of gas in location: %v; gasWanted: %d, gasUsed: %d", err.Descriptor, gasWanted, ctx.GasMeter().GasConsumed(),
            ),
        )
    }

    return newRecoveryMiddleware(handler, next)
}
```

`Default` middleware example:

```go
func newDefaultRecoveryMiddleware() recoveryMiddleware {
    handler := func(recoveryObj interface{}) error {
        return errorsmod.Wrap(
            sdkerrors.ErrPanic, fmt.Sprintf("recovered: %v\nstack:\n%v", recoveryObj, string(debug.Stack())),
        )
    }

    return newRecoveryMiddleware(handler, nil)
}
```

##### Recovery processing

Basic chain of middlewares processing would look like:

```go
func processRecovery(recoveryObj interface{}, middleware recoveryMiddleware) error {
	if middleware == nil { return nil }

	next, err := middleware(recoveryObj)
	if err != nil { return err }
	if next == nil { return nil }

	return processRecovery(recoveryObj, next)
}
```

That way we can create a middleware chain which is executed from left to right, the rightmost middleware is a
`default` handler which must return an `error`.

##### BaseApp changes

The `default` middleware chain must exist in a `BaseApp` object. `Baseapp` modifications:

```go
type BaseApp struct {
    // ...
    runTxRecoveryMiddleware recoveryMiddleware
}

func NewBaseApp(...) {
    // ...
    app.runTxRecoveryMiddleware = newDefaultRecoveryMiddleware()
}

func (app *BaseApp) runTx(...) {
    // ...
    defer func() {
        if r := recover(); r != nil {
            recoveryMW := newOutOfGasRecoveryMiddleware(gasWanted, ctx, app.runTxRecoveryMiddleware)
            err, result = processRecovery(r, recoveryMW), nil
        }

        gInfo = sdk.GasInfo{GasWanted: gasWanted, GasUsed: ctx.GasMeter().GasConsumed()}
    }()
    // ...
}
```

Developers can add their custom `RecoveryHandler`s by providing `AddRunTxRecoveryHandler` as a BaseApp option parameter to the `NewBaseapp` constructor:

```go
func (app *BaseApp) AddRunTxRecoveryHandler(handlers ...RecoveryHandler) {
    for _, h := range handlers {
        app.runTxRecoveryMiddleware = newRecoveryMiddleware(h, app.runTxRecoveryMiddleware)
    }
}
```

This method would prepend handlers to an existing chain.

## Consequences

### Positive

* Developers of Cosmos SDK based projects can add custom panic handlers to:
    * add error context for custom panic sources (panic inside of custom keepers);
    * emit `panic()`: passthrough recovery object to the Tendermint core;
    * other necessary handling;
* Developers can use standard Cosmos SDK `BaseApp` implementation, rather that rewriting it in their projects;
* Proposed solution doesn't break the current "standard" `runTx()` flow;

### Negative

* Introduces changes to the execution model design.

### Neutral

* `OutOfGas` error handler becomes one of the middlewares;
* Default panic handler becomes one of the middlewares;

## References

* [PR-6053 with proposed solution](https://github.com/cosmos/cosmos-sdk/pull/6053)
* [Similar solution. ADR-010 Modular AnteHandler](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-010-modular-antehandler.md)
