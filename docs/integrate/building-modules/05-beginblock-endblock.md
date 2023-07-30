# BeginBlocker 和 EndBlocker

:::note 概述
`BeginBlocker` 和 `EndBlocker` 是模块开发者可以在他们的模块中实现的可选方法。当从底层共识引擎接收到 [`BeginBlock`](../../develop/advanced-concepts/00-baseapp.md#beginblock) 和 [`EndBlock`](../../develop/advanced-concepts/00-baseapp.md#endblock) ABCI 消息时，它们分别在每个区块的开始和结束时触发。
:::

:::note

### 先决条件阅读

* [模块管理器](01-module-manager.md)

:::

## BeginBlocker 和 EndBlocker

`BeginBlocker` 和 `EndBlocker` 是模块开发者为其模块添加自动执行逻辑的一种方式。这是一个强大的工具，应该谨慎使用，因为复杂的自动函数可能会减慢甚至停止链的运行。

在需要时，`BeginBlocker` 和 `EndBlocker` 作为 [`BeginBlockAppModule` 和 `BeginBlockAppModule` 接口](01-module-manager.md#appmodule) 的一部分进行实现。这意味着如果不需要，可以省略其中之一。接口中的 `BeginBlock` 和 `EndBlock` 方法通常在 `module.go` 中实现，它们通常会委托给 `BeginBlocker` 和 `EndBlocker` 方法，这些方法通常在 `abci.go` 中实现。

`abci.go` 中 `BeginBlocker` 和 `EndBlocker` 的实际实现与 [`Msg` 服务](03-msg-services.md) 非常相似：

* 它们通常使用 [`keeper`](06-keeper.md) 和 [`ctx`](../../develop/advanced-concepts/02-context.md) 来检索有关最新状态的信息。
* 如果需要，它们使用 `keeper` 和 `ctx` 来触发状态转换。
* 如果需要，它们可以通过 `ctx` 的 `EventManager` 发出 [`events`](../../develop/advanced-concepts/08-events.md)。

`EndBlocker` 的一个特殊之处在于，它可以以 [`[]abci.ValidatorUpdates`](https://docs.cometbft.com/v0.37/spec/abci/abci++_methods#endblock) 的形式向底层共识引擎返回验证器更新。这是实现自定义验证器更改的首选方式。

开发者可以通过模块管理器的 `SetOrderBeginBlocker`/`SetOrderEndBlocker` 方法来定义其应用程序的每个模块的 `BeginBlocker`/`EndBlocker` 函数之间的执行顺序。有关模块管理器的更多信息，请点击[这里](01-module-manager.md#manager)。

请看`distribution`模块中`BeginBlocker`的示例实现：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/distribution/abci.go#L14-L38
```

以及`staking`模块中`EndBlocker`的示例实现：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/abci.go#L22-L27
```

<!-- TODO: 将此处保留以使用高级概念 API 更改更新文档 -->




# BeginBlocker and EndBlocker

:::note Synopsis
`BeginBlocker` and `EndBlocker` are optional methods module developers can implement in their module. They will be triggered at the beginning and at the end of each block respectively, when the [`BeginBlock`](../../develop/advanced-concepts/00-baseapp.md#beginblock) and [`EndBlock`](../../develop/advanced-concepts/00-baseapp.md#endblock) ABCI messages are received from the underlying consensus engine.
:::

:::note

### Pre-requisite Readings

* [Module Manager](01-module-manager.md)

:::

## BeginBlocker and EndBlocker

`BeginBlocker` and `EndBlocker` are a way for module developers to add automatic execution of logic to their module. This is a powerful tool that should be used carefully, as complex automatic functions can slow down or even halt the chain.

When needed, `BeginBlocker` and `EndBlocker` are implemented as part of the [`BeginBlockAppModule` and `BeginBlockAppModule` interfaces](01-module-manager.md#appmodule). This means either can be left-out if not required. The `BeginBlock` and `EndBlock` methods of the interface implemented in `module.go` generally defer to `BeginBlocker` and `EndBlocker` methods respectively, which are usually implemented in `abci.go`.

The actual implementation of `BeginBlocker` and `EndBlocker` in `abci.go` are very similar to that of a [`Msg` service](03-msg-services.md):

* They generally use the [`keeper`](06-keeper.md) and [`ctx`](../../develop/advanced-concepts/02-context.md) to retrieve information about the latest state.
* If needed, they use the `keeper` and `ctx` to trigger state-transitions.
* If needed, they can emit [`events`](../../develop/advanced-concepts/08-events.md) via the `ctx`'s `EventManager`.

A specificity of the `EndBlocker` is that it can return validator updates to the underlying consensus engine in the form of an [`[]abci.ValidatorUpdates`](https://docs.cometbft.com/v0.37/spec/abci/abci++_methods#endblock). This is the preferred way to implement custom validator changes.

It is possible for developers to define the order of execution between the `BeginBlocker`/`EndBlocker` functions of each of their application's modules via the module's manager `SetOrderBeginBlocker`/`SetOrderEndBlocker` methods. For more on the module manager, click [here](01-module-manager.md#manager).

See an example implementation of `BeginBlocker` from the `distribution` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/distribution/abci.go#L14-L38
```

and an example implementation of `EndBlocker` from the `staking` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/abci.go#L22-L27
```

<!-- TODO: leaving this here to update docs with advanced-concepts api changes  -->
