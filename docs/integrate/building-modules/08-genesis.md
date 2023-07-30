# 模块创世

:::note 概要
模块通常处理状态的子集，因此它们需要定义相关的创世文件子集以及初始化、验证和导出它的方法。
:::

:::note

### 先决条件阅读

* [模块管理器](01-module-manager.md)
* [保管者](06-keeper.md)

:::

## 类型定义

从给定模块定义的创世状态子集通常在一个 `genesis.proto` 文件中定义（有关如何定义 protobuf 消息的更多信息，请参见[此处](../../develop/advanced-concepts/06-encoding.md#gogoproto)）。定义模块创世状态子集的结构通常称为 `GenesisState`，它包含了在创世过程中需要初始化的所有与模块相关的值。

以下是 `auth` 模块中 `GenesisState` protobuf 消息定义的示例：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/auth/v1beta1/genesis.proto
```

接下来，我们介绍了模块开发人员需要实现的与创世相关的主要方法。

### `DefaultGenesis`

`DefaultGenesis()` 方法是一个简单的方法，它调用 `GenesisState` 的构造函数，并为每个参数提供默认值。以下是 `auth` 模块的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/module.go#L55-L59
```

### `ValidateGenesis`

`ValidateGenesis(data GenesisState)` 方法用于验证提供的 `genesisState` 是否正确。它应对 `GenesisState` 中列出的每个参数执行有效性检查。以下是 `auth` 模块的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/types/genesis.go#L61-L74
```

## 其他创世方法

除了与 `GenesisState` 直接相关的方法之外，模块开发人员还需要作为 [`AppModuleGenesis` 接口](01-module-manager.md#appmodulegenesis) 的一部分实现另外两个方法（仅当模块需要在创世中初始化状态的子集时）。这些方法是 [`InitGenesis`](#initgenesis) 和 [`ExportGenesis`](#exportgenesis)。

### `InitGenesis`

`InitGenesis`方法在应用程序首次启动时在[`InitChain`](../../develop/advanced-concepts/00-baseapp.md#initchain)期间执行。给定一个`GenesisState`，它通过在`GenesisState`中的每个参数上使用模块的[`keeper`](06-keeper.md)设置函数来初始化模块管理的状态的子集。

应用程序的[模块管理器](01-module-manager.md#manager)负责按顺序调用每个应用程序模块的`InitGenesis`方法。此顺序由应用程序开发人员通过管理器的`SetOrderGenesisMethod`设置，该方法在[应用程序的构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中调用。

以下是`auth`模块中`InitGenesis`的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/keeper/genesis.go#L8-L35
```

### `ExportGenesis`

`ExportGenesis`方法在进行状态导出时执行。它获取模块管理的状态子集的最新已知版本，并创建一个新的`GenesisState`。这主要用于通过硬分叉升级链时使用。

以下是`auth`模块中`ExportGenesis`的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/keeper/genesis.go#L37-L49
```

### GenesisTxHandler

`GenesisTxHandler`是模块在第一个区块之前提交状态转换的一种方式。这由`x/genutil`用于提交将要添加到质押中的验证器的创世交易。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/advanced-concepts/genesis/txhandler.go#L3-L6
```




# Module Genesis

:::note Synopsis
Modules generally handle a subset of the state and, as such, they need to define the related subset of the genesis file as well as methods to initialize, verify and export it.
:::

:::note

### Pre-requisite Readings

* [Module Manager](01-module-manager.md)
* [Keepers](06-keeper.md)

:::

## Type Definition

The subset of the genesis state defined from a given module is generally defined in a `genesis.proto` file ([more info](../../develop/advanced-concepts/06-encoding.md#gogoproto) on how to define protobuf messages). The struct defining the module's subset of the genesis state is usually called `GenesisState` and contains all the module-related values that need to be initialized during the genesis process.

See an example of `GenesisState` protobuf message definition from the `auth` module:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/auth/v1beta1/genesis.proto
```

Next we present the main genesis-related methods that need to be implemented by module developers in order for their module to be used in Cosmos SDK applications.

### `DefaultGenesis`

The `DefaultGenesis()` method is a simple method that calls the constructor function for `GenesisState` with the default value for each parameter. See an example from the `auth` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/module.go#L55-L59
```

### `ValidateGenesis`

The `ValidateGenesis(data GenesisState)` method is called to verify that the provided `genesisState` is correct. It should perform validity checks on each of the parameters listed in `GenesisState`. See an example from the `auth` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/types/genesis.go#L61-L74
```

## Other Genesis Methods

Other than the methods related directly to `GenesisState`, module developers are expected to implement two other methods as part of the [`AppModuleGenesis` interface](01-module-manager.md#appmodulegenesis) (only if the module needs to initialize a subset of state in genesis). These methods are [`InitGenesis`](#initgenesis) and [`ExportGenesis`](#exportgenesis).

### `InitGenesis`

The `InitGenesis` method is executed during [`InitChain`](../../develop/advanced-concepts/00-baseapp.md#initchain) when the application is first started. Given a `GenesisState`, it initializes the subset of the state managed by the module by using the module's [`keeper`](06-keeper.md) setter function on each parameter within the `GenesisState`.

The [module manager](01-module-manager.md#manager) of the application is responsible for calling the `InitGenesis` method of each of the application's modules in order. This order is set by the application developer via the manager's `SetOrderGenesisMethod`, which is called in the [application's constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function).

See an example of `InitGenesis` from the `auth` module:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/keeper/genesis.go#L8-L35
```

### `ExportGenesis`

The `ExportGenesis` method is executed whenever an export of the state is made. It takes the latest known version of the subset of the state managed by the module and creates a new `GenesisState` out of it. This is mainly used when the chain needs to be upgraded via a hard fork.

See an example of `ExportGenesis` from the `auth` module.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/keeper/genesis.go#L37-L49
```

### GenesisTxHandler

`GenesisTxHandler` is a way for modules to submit state transitions prior to the first block. This is used by `x/genutil` to submit the genesis transactions for the validators to be added to staking. 

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/advanced-concepts/genesis/txhandler.go#L3-L6
```
