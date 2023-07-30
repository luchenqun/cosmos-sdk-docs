# 不变量

:::note 概要
不变量是应用程序应始终满足的属性。在 Cosmos SDK 的上下文中，`Invariant` 是一个检查特定不变量的函数。这些函数对于早期检测错误并采取措施限制其潜在后果（例如通过停止链）非常有用。它们还可以在应用程序的开发过程中通过模拟检测错误。
:::

:::note

### 先决条件阅读

* [保管者](06-keeper.md)

:::

## 实现 `Invariant`

`Invariant` 是一个在模块内检查特定不变量的函数。模块的 `Invariant` 必须遵循以下 `Invariant` 类型：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/invariant.go#L9
```

`string` 返回值是不变量消息，可用于打印日志，而 `bool` 返回值是不变量检查的实际结果。

实际上，每个模块都在模块文件夹的 `keeper/invariants.go` 文件中实现 `Invariant`。标准做法是每个逻辑不变量组实现一个 `Invariant` 函数，模型如下：

```go
// Example for an Invariant that checks balance-related invariants

func BalanceInvariants(k Keeper) sdk.Invariant {
	return func(ctx sdk.Context) (string, bool) {
        // Implement checks for balance-related invariants
    }
}
```

此外，模块开发人员通常应实现一个 `AllInvariants` 函数，用于运行模块的所有 `Invariant` 函数：

```go
// AllInvariants runs all invariants of the module.
// In this example, the module implements two Invariants: BalanceInvariants and DepositsInvariants

func AllInvariants(k Keeper) sdk.Invariant {

	return func(ctx sdk.Context) (string, bool) {
		res, stop := BalanceInvariants(k)(ctx)
		if stop {
			return res, stop
		}

		return DepositsInvariant(k)(ctx)
	}
}
```

最后，模块开发人员需要作为 [`AppModule` 接口](01-module-manager.md#appmodule) 的一部分实现 `RegisterInvariants` 方法。实际上，模块的 `RegisterInvariants` 方法通常只是将调用委托给 `keeper/invariants.go` 文件中实现的 `RegisterInvariants` 方法。`RegisterInvariants` 方法在 [`InvariantRegistry`](#invariant-registry) 中为每个 `Invariant` 函数注册一个路由：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/invariants.go#L12-L22
```

更多信息，请参阅 [`staking` 模块中 `Invariant` 实现的示例](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/invariants.go)。

## 不变式注册表

`InvariantRegistry` 是一个注册表，用于注册应用程序中所有模块的 `Invariant`。每个**应用程序**只有一个 `InvariantRegistry`，这意味着模块开发者在构建模块时不需要实现自己的 `InvariantRegistry`。**模块开发者只需要在 `InvariantRegistry` 中注册其模块的不变式，如上节所述**。本节的其余部分提供有关 `InvariantRegistry` 本身的更多信息，不包含与模块开发者直接相关的内容。

在 Cosmos SDK 中，`InvariantRegistry` 在其核心中被定义为一个接口：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/invariant.go#L14-L17
```

通常，此接口在特定模块的 `keeper` 中实现。最常用的 `InvariantRegistry` 实现可以在 `crisis` 模块中找到：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/crisis/keeper/keeper.go#L57-L61
```

因此，通常通过在[应用程序的构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中实例化 `crisis` 模块的 `keeper` 来实例化 `InvariantRegistry`。

`Invariant` 可以通过[`message`](02-messages-and-queries.md)进行手动检查，但通常会在每个区块结束时自动进行检查。以下是 `crisis` 模块的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/crisis/abci.go#L12-L21
```

在这两种情况下，如果其中一个 `Invariant` 返回 false，`InvariantRegistry` 可以触发特殊逻辑（例如，使应用程序发生 panic 并在日志中打印 `Invariant` 的消息）。




# Invariants

:::note Synopsis
An invariant is a property of the application that should always be true. In the context of the Cosmos SDK, an `Invariant` is a function that checks for a particular invariant. These functions are useful to detect bugs early on and act upon them to limit their potential consequences (e.g. by halting the chain). They are also useful in the development process of the application to detect bugs via simulations.
:::

:::note

### Pre-requisite Readings

* [Keepers](06-keeper.md)

:::

## Implementing `Invariant`s

An `Invariant` is a function that checks for a particular invariant within a module. Module `Invariant`s must follow the `Invariant` type:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/invariant.go#L9
```

The `string` return value is the invariant message, which can be used when printing logs, and the `bool` return value is the actual result of the invariant check.

In practice, each module implements `Invariant`s in a `keeper/invariants.go` file within the module's folder. The standard is to implement one `Invariant` function per logical grouping of invariants with the following model:

```go
// Example for an Invariant that checks balance-related invariants

func BalanceInvariants(k Keeper) sdk.Invariant {
	return func(ctx sdk.Context) (string, bool) {
        // Implement checks for balance-related invariants
    }
}
```

Additionally, module developers should generally implement an `AllInvariants` function that runs all the `Invariant`s functions of the module:

```go
// AllInvariants runs all invariants of the module.
// In this example, the module implements two Invariants: BalanceInvariants and DepositsInvariants

func AllInvariants(k Keeper) sdk.Invariant {

	return func(ctx sdk.Context) (string, bool) {
		res, stop := BalanceInvariants(k)(ctx)
		if stop {
			return res, stop
		}

		return DepositsInvariant(k)(ctx)
	}
}
```

Finally, module developers need to implement the `RegisterInvariants` method as part of the [`AppModule` interface](01-module-manager.md#appmodule). Indeed, the `RegisterInvariants` method of the module, implemented in the `module/module.go` file, typically only defers the call to a `RegisterInvariants` method implemented in the `keeper/invariants.go` file. The `RegisterInvariants` method registers a route for each `Invariant` function in the [`InvariantRegistry`](#invariant-registry):

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/invariants.go#L12-L22
```

For more, see an example of [`Invariant`s implementation from the `staking` module](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/invariants.go).

## Invariant Registry

The `InvariantRegistry` is a registry where the `Invariant`s of all the modules of an application are registered. There is only one `InvariantRegistry` per **application**, meaning module developers need not implement their own `InvariantRegistry` when building a module. **All module developers need to do is to register their modules' invariants in the `InvariantRegistry`, as explained in the section above**. The rest of this section gives more information on the `InvariantRegistry` itself, and does not contain anything directly relevant to module developers.

At its core, the `InvariantRegistry` is defined in the Cosmos SDK as an interface:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/invariant.go#L14-L17
```

Typically, this interface is implemented in the `keeper` of a specific module. The most used implementation of an `InvariantRegistry` can be found in the `crisis` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/crisis/keeper/keeper.go#L57-L61
```

The `InvariantRegistry` is therefore typically instantiated by instantiating the `keeper` of the `crisis` module in the [application's constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function).

`Invariant`s can be checked manually via [`message`s](02-messages-and-queries.md), but most often they are checked automatically at the end of each block. Here is an example from the `crisis` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/crisis/abci.go#L12-L21
```

In both cases, if one of the `Invariant`s returns false, the `InvariantRegistry` can trigger special logic (e.g. have the application panic and print the `Invariant`s message in the log).
