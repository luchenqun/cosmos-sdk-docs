# 运行事务恢复中间件

`BaseApp.runTx()` 函数处理可能在事务执行期间发生的 Go panic，例如，keeper 遇到了无效状态并发生了 panic。
根据 panic 的类型，使用不同的处理程序，例如默认处理程序会打印错误日志消息。
恢复中间件用于为 Cosmos SDK 应用程序开发人员添加自定义 panic 恢复功能。

有关更多上下文信息，请参阅相应的 [ADR-022](../../integrate/architecture/adr-022-custom-panic-handling.md) 和 [recovery.go](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/recovery.go) 中的实现。

## 接口

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/recovery.go#L11-L14
```

`recoveryObj` 是 `buildin` Go 包中 `recover()` 函数的返回值。

**约定：**

* 如果未处理 `recoveryObj`，`RecoveryHandler` 返回 `nil`，应将其传递给下一个恢复中间件；
* 如果已处理 `recoveryObj`，`RecoveryHandler` 返回非 `nil` 的 `error`。

## 注册自定义 RecoveryHandler

`BaseApp.AddRunTxRecoveryHandler(handlers ...RecoveryHandler)`

BaseApp 方法将恢复中间件添加到默认恢复链中。

## 示例

假设我们希望在发生特定错误时发出 "一致性失败" 的链状态。

我们有一个会发生 panic 的模块 keeper：

```go
func (k FooKeeper) Do(obj interface{}) {
    if obj == nil {
        // that shouldn't happen, we need to crash the app
        err := errorsmod.Wrap(fooTypes.InternalError, "obj is nil")
        panic(err)
    }
}
```

默认情况下，该 panic 将被恢复，并将错误消息打印到日志中。要覆盖该行为，我们应该注册一个自定义的 RecoveryHandler：

```go
// Cosmos SDK application constructor
customHandler := func(recoveryObj interface{}) error {
    err, ok := recoveryObj.(error)
    if !ok {
        return nil
    }

    if fooTypes.InternalError.Is(err) {
        panic(fmt.Errorf("FooKeeper did panic with error: %w", err))
    }

    return nil
}

baseApp := baseapp.NewBaseApp(...)
baseApp.AddRunTxRecoveryHandler(customHandler)
```




# RunTx recovery middleware

`BaseApp.runTx()` function handles Go panics that might occur during transactions execution, for example, keeper has faced an invalid state and paniced.
Depending on the panic type different handler is used, for instance the default one prints an error log message.
Recovery middleware is used to add custom panic recovery for Cosmos SDK application developers.

More context can found in the corresponding [ADR-022](../../integrate/architecture/adr-022-custom-panic-handling.md) and the implementation in [recovery.go](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/recovery.go).

## Interface

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/baseapp/recovery.go#L11-L14
```

`recoveryObj` is a return value for `recover()` function from the `buildin` Go package.

**Contract:**

* RecoveryHandler returns `nil` if `recoveryObj` wasn't handled and should be passed to the next recovery middleware;
* RecoveryHandler returns a non-nil `error` if `recoveryObj` was handled;

## Custom RecoveryHandler register

`BaseApp.AddRunTxRecoveryHandler(handlers ...RecoveryHandler)`

BaseApp method adds recovery middleware to the default recovery chain.

## Example

Lets assume we want to emit the "Consensus failure" chain state if some particular error occurred.

We have a module keeper that panics:

```go
func (k FooKeeper) Do(obj interface{}) {
    if obj == nil {
        // that shouldn't happen, we need to crash the app
        err := errorsmod.Wrap(fooTypes.InternalError, "obj is nil")
        panic(err)
    }
}
```

By default that panic would be recovered and an error message will be printed to log. To override that behaviour we should register a custom RecoveryHandler:

```go
// Cosmos SDK application constructor
customHandler := func(recoveryObj interface{}) error {
    err, ok := recoveryObj.(error)
    if !ok {
        return nil
    }

    if fooTypes.InternalError.Is(err) {
        panic(fmt.Errorf("FooKeeper did panic with error: %w", err))
    }

    return nil
}

baseApp := baseapp.NewBaseApp(...)
baseApp.AddRunTxRecoveryHandler(customHandler)
```
