# Keepers

:::note 概述
`Keeper` 是 Cosmos SDK 中的一个抽象概念，其作用是管理各个模块定义的状态子集的访问。`Keeper` 是模块特定的，也就是说，只有在该模块中定义的 `keeper` 才能访问该模块定义的状态子集。如果一个模块需要访问另一个模块定义的状态子集，需要将对第二个模块内部 `keeper` 的引用传递给第一个模块。这是在 `app.go` 中在实例化模块 `keeper` 时完成的。
:::

:::note

### 先决条件阅读

* [Cosmos SDK 模块介绍](00-intro.md)

:::

## 动机

Cosmos SDK 是一个框架，使开发人员能够从头开始构建复杂的去中心化应用程序，主要通过组合模块来实现。随着 Cosmos SDK 的开源模块生态系统的扩大，越来越有可能出现一些模块包含漏洞的情况，这是由于开发人员的疏忽或恶意导致的。

Cosmos SDK 采用了一种基于[对象能力的方法](../../develop/advanced-concepts/10-ocap.md)，以帮助开发人员更好地保护他们的应用程序免受不需要的模块间交互的影响，而 `keeper` 是这种方法的核心。可以将 `keeper` 理解为模块存储的门卫。每个模块内定义的存储（通常是 [`IAVL` 存储](../../develop/advanced-concepts/04-store.md#iavl-store)）都有一个 `storeKey`，它可以无限制地访问该存储。模块的 `keeper` 持有这个 `storeKey`（否则应该保持不公开），并定义了[方法](#implementing-methods)来读写存储。

对象能力方法的核心思想是只透露完成工作所必需的内容。在实践中，这意味着不通过访问控制列表来处理模块的权限，而是将模块 `keeper` 传递给它们需要访问的其他模块 `keeper` 的特定实例的引用（这是在[应用程序的构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中完成的）。因此，一个模块只能通过其他模块的 `keeper` 实例提供的方法与另一个模块定义的状态子集进行交互。这是开发人员控制自己的模块与外部开发人员开发的模块之间交互的一种很好的方式。

## 类型定义

`keeper` 通常在模块的文件夹中的 `/keeper/keeper.go` 文件中实现。按照惯例，模块的 `keeper` 类型简单地命名为 `Keeper`，并且通常遵循以下结构：

```go
type Keeper struct {
    // External keepers, if any

    // Store key(s)

    // codec

    // authority 
}
```

例如，这是 `staking` 模块中 `keeper` 的类型定义：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/keeper.go#L23-L31
```

让我们逐个介绍不同的参数：

* 预期的 `keeper` 是模块内部 `keeper` 所需的外部 `keeper`。外部 `keeper` 在内部 `keeper` 的类型定义中作为接口列出。这些接口本身在模块文件夹的根目录中的 `expected_keepers.go` 文件中定义。在这个上下文中，接口用于减少依赖的数量，并且便于模块本身的维护。
* `storeKey` 授予对模块管理的 [multistore](../../develop/advanced-concepts/04-store.md) 存储的访问权限。它们应始终对外部模块保持未公开状态。
* `cdc` 是用于将结构体编组和解组为 `[]byte` 的 [编解码器](../../develop/advanced-concepts/06-encoding.md)。`cdc` 可以是 `codec.BinaryCodec`、`codec.JSONCodec` 或 `codec.Codec` 中的任何一个，具体取决于您的需求。它可以是 proto 或 amino 编解码器，只要它们实现了这些接口。所列的权限是一个模块账户或用户账户，具有更改模块级参数的权限。以前，这是由 param 模块处理的，但已被弃用。

当然，可以为同一个模块定义不同类型的内部 `keeper`（例如，只读 `keeper`）。每种类型的 `keeper` 都有自己的构造函数，该构造函数从[应用程序的构造函数](../../develop/high-level-concepts/00-overview-app.md)中调用。在这里，`keeper` 被实例化，并且开发人员确保将正确的模块 `keeper` 实例传递给其他需要它们的模块。

## 实现方法

`Keeper` 主要为其模块管理的存储提供了获取器和设置器方法。这些方法应尽可能简单，并且严格限制于获取或设置所请求的值，因为在调用 `keeper` 方法时，[`Msg` 服务器](03-msg-services.md) 应已执行了有效性检查。

通常，*获取器* 方法将具有以下签名：

```go
func (k Keeper) Get(ctx sdk.Context, key string) returnType
```

该方法将按照以下步骤进行：

1. 使用 `storeKey` 通过 `ctx` 的 `KVStore(storeKey sdk.StoreKey)` 方法从 `ctx` 中检索适当的存储。然后，最好使用 `prefix.Store` 仅访问所需的存储子集，以提高方便性和安全性。
2. 如果存在，使用存储的 `Get(key []byte)` 方法获取存储在位置 `[]byte(key)` 处的 `[]byte` 值。
3. 使用编解码器 `cdc` 将检索到的值从 `[]byte` 解组为 `returnType`。返回该值。

类似地，*设置器* 方法将具有以下签名：

```go
func (k Keeper) Set(ctx sdk.Context, key string, value valueType)
```

该方法将按照以下步骤进行：

1. 使用 `storeKey` 通过 `ctx` 的 `KVStore(storeKey sdk.StoreKey)` 方法从 `ctx` 中检索适当的存储。最好使用 `prefix.Store` 仅访问所需的存储子集，以提高方便性和安全性。
2. 使用编解码器 `cdc` 将 `value` 编组为 `[]byte`。
3. 使用存储的 `Set(key []byte, value []byte)` 方法，在存储的位置 `key` 处设置编码后的值。

更多信息，请参阅 [`staking` 模块中 `keeper` 的方法实现示例](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/keeper.go)。

[模块 `KVStore`](../../develop/advanced-concepts/04-store.md#kvstore-and-commitkvstore-interfaces) 还提供了一个 `Iterator()` 方法，用于返回一个 `Iterator` 对象，以迭代一组键。

这是一个从`auth`模块迭代账户的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/keeper/account.go#L94-L108
```





# Keepers

:::note Synopsis
`Keeper`s refer to a Cosmos SDK abstraction whose role is to manage access to the subset of the state defined by various modules. `Keeper`s are module-specific, i.e. the subset of state defined by a module can only be accessed by a `keeper` defined in said module. If a module needs to access the subset of state defined by another module, a reference to the second module's internal `keeper` needs to be passed to the first one. This is done in `app.go` during the instantiation of module keepers.
:::

:::note

### Pre-requisite Readings

* [Introduction to Cosmos SDK Modules](00-intro.md)

:::

## Motivation

The Cosmos SDK is a framework that makes it easy for developers to build complex decentralized applications from scratch, mainly by composing modules together. As the ecosystem of open-source modules for the Cosmos SDK expands, it will become increasingly likely that some of these modules contain vulnerabilities, as a result of the negligence or malice of their developer.

The Cosmos SDK adopts an [object-capabilities-based approach](../../develop/advanced-concepts/10-ocap.md) to help developers better protect their application from unwanted inter-module interactions, and `keeper`s are at the core of this approach. A `keeper` can be considered quite literally to be the gatekeeper of a module's store(s). Each store (typically an [`IAVL` Store](../../develop/advanced-concepts/04-store.md#iavl-store)) defined within a module comes with a `storeKey`, which grants unlimited access to it. The module's `keeper` holds this `storeKey` (which should otherwise remain unexposed), and defines [methods](#implementing-methods) for reading and writing to the store(s).

The core idea behind the object-capabilities approach is to only reveal what is necessary to get the work done. In practice, this means that instead of handling permissions of modules through access-control lists, module `keeper`s are passed a reference to the specific instance of the other modules' `keeper`s that they need to access (this is done in the [application's constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function)). As a consequence, a module can only interact with the subset of state defined in another module via the methods exposed by the instance of the other module's `keeper`. This is a great way for developers to control the interactions that their own module can have with modules developed by external developers.

## Type Definition

`keeper`s are generally implemented in a `/keeper/keeper.go` file located in the module's folder. By convention, the type `keeper` of a module is simply named `Keeper` and usually follows the following structure:

```go
type Keeper struct {
    // External keepers, if any

    // Store key(s)

    // codec

    // authority 
}
```

For example, here is the type definition of the `keeper` from the `staking` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/keeper.go#L23-L31
```

Let us go through the different parameters:

* An expected `keeper` is a `keeper` external to a module that is required by the internal `keeper` of said module. External `keeper`s are listed in the internal `keeper`'s type definition as interfaces. These interfaces are themselves defined in an `expected_keepers.go` file in the root of the module's folder. In this context, interfaces are used to reduce the number of dependencies, as well as to facilitate the maintenance of the module itself.
* `storeKey`s grant access to the store(s) of the [multistore](../../develop/advanced-concepts/04-store.md) managed by the module. They should always remain unexposed to external modules.
* `cdc` is the [codec](../../develop/advanced-concepts/06-encoding.md) used to marshall and unmarshall structs to/from `[]byte`. The `cdc` can be any of `codec.BinaryCodec`, `codec.JSONCodec` or `codec.Codec` based on your requirements. It can be either a proto or amino codec as long as they implement these interfaces. The authority listed is a module account or user account that has the right to change module level parameters. Previously this was handled by the param module, which has been deprecated.

Of course, it is possible to define different types of internal `keeper`s for the same module (e.g. a read-only `keeper`). Each type of `keeper` comes with its own constructor function, which is called from the [application's constructor function](../../develop/high-level-concepts/00-overview-app.md). This is where `keeper`s are instantiated, and where developers make sure to pass correct instances of modules' `keeper`s to other modules that require them.

## Implementing Methods

`Keeper`s primarily expose getter and setter methods for the store(s) managed by their module. These methods should remain as simple as possible and strictly be limited to getting or setting the requested value, as validity checks should have already been performed by the [`Msg` server](03-msg-services.md) when `keeper`s' methods are called.

Typically, a *getter* method will have the following signature

```go
func (k Keeper) Get(ctx sdk.Context, key string) returnType
```

and the method will go through the following steps:

1. Retrieve the appropriate store from the `ctx` using the `storeKey`. This is done through the `KVStore(storeKey sdk.StoreKey)` method of the `ctx`. Then it's preferred to use the `prefix.Store` to access only the desired limited subset of the store for convenience and safety.
2. If it exists, get the `[]byte` value stored at location `[]byte(key)` using the `Get(key []byte)` method of the store.
3. Unmarshall the retrieved value from `[]byte` to `returnType` using the codec `cdc`. Return the value.

Similarly, a *setter* method will have the following signature

```go
func (k Keeper) Set(ctx sdk.Context, key string, value valueType)
```

and the method will go through the following steps:

1. Retrieve the appropriate store from the `ctx` using the `storeKey`. This is done through the `KVStore(storeKey sdk.StoreKey)` method of the `ctx`. It's preferred to use the `prefix.Store` to access only the desired limited subset of the store for convenience and safety.
2. Marshal `value` to `[]byte` using the codec `cdc`.
3. Set the encoded value in the store at location `key` using the `Set(key []byte, value []byte)` method of the store.

For more, see an example of `keeper`'s [methods implementation from the `staking` module](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/keeper.go).

The [module `KVStore`](../../develop/advanced-concepts/04-store.md#kvstore-and-commitkvstore-interfaces) also provides an `Iterator()` method which returns an `Iterator` object to iterate over a domain of keys.

This is an example from the `auth` module to iterate accounts:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/keeper/account.go#L94-L108
```
