# 模块模拟

:::note

### 先决条件阅读

* [Cosmos 区块链模拟器](../../develop/advanced-concepts/13-simulation.md)
:::

## 概述

本文档详细介绍了如何定义每个模块模拟函数，以便与应用程序的 `SimulationManager` 集成。

* [模拟包](#模拟包)
    * [存储解码器](#存储解码器)
    * [随机创世状态](#随机创世状态)
    * [随机参数更改](#随机参数更改)
    * [随机加权操作](#随机加权操作)
    * [随机提案内容](#随机提案内容)
* [注册模拟函数](#注册模拟函数)
* [应用程序模拟器管理器](#应用程序模拟器管理器)

## 模拟包

每个实现 Cosmos SDK 模拟器的模块都需要有一个 `x/<module>/simulation` 包，其中包含模糊测试所需的主要函数：存储解码器、随机创世状态和参数、加权操作和提案内容。

### 存储解码器

注册存储解码器对于 `AppImportExport` 是必需的。这允许将存储中的键值对解码（即取消编组）为相应的类型。特别是，它将键与具体类型匹配，然后将值从 `KVPair` 反编组为提供的类型。

您可以使用[此处的示例](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/distribution/simulation/decoder.go)来实现您的存储解码器。

### 随机创世状态

模拟器测试不同的场景和创世参数值，以完全测试特定模块的边界情况。每个模块的 `simulator` 包必须公开一个 `RandomizedGenState` 函数，以根据给定的种子生成初始随机的 `GenesisState`。

一旦模块的创世参数被随机生成（或使用在 `params` 文件中定义的键和值），它们将被编组为 JSON 格式，并添加到应用程序创世 JSON 中以在模拟中使用。

您可以在此处查看创建随机化创世状态的示例 [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/simulation/genesis.go)。

### 随机化参数更改

模拟器能够随机测试参数更改。每个模块的模拟器包必须包含一个 `RandomizedParams` 函数，该函数将在模拟器的整个生命周期中模拟模块的参数更改。

您可以在此处查看一个完全测试参数更改所需的示例 [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/simulation/params.go)。

### 随机加权操作

操作是 Cosmos SDK 模拟器的关键部分之一。它们是使用随机字段值模拟的交易 (`Msg`)。操作的发送者也是随机分配的。

模拟器使用 `ABCI` 应用程序的完整 [事务周期](../../develop/advanced-concepts/01-transactions.md) 来模拟操作。

下面显示了如何设置权重：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/simulation/operations.go#L19-L86
```

如您所见，权重在此示例中是预定义的。可以使用不同的权重覆盖此行为。一种选择是使用 `*rand.Rand` 来为操作定义随机权重，或者您可以注入自己预定义的权重。

以下是如何覆盖上述 `simappparams` 包的示例。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/Makefile#L293-L299
```

对于最后一个测试，使用了一个名为 [runsim](https://github.com/cosmos/tools/tree/master/cmd/runsim) 的工具，该工具用于并行化运行 go test 实例，并提供信息给 Github 和 Slack 集成，以向您的团队提供有关模拟运行情况的信息。

### 随机提案内容

Cosmos SDK 模拟器还支持随机化的治理提案。每个模块必须定义其公开和注册的治理提案 `Content`，以便在参数上使用它们。

## 注册模拟函数

现在，所有必需的函数都已定义，我们需要将它们集成到`module.go`中的模块模式中：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/distribution/module.go#L180-L203
```

## 应用程序模拟器管理器

下一步是在应用程序级别设置`SimulatorManager`。这对于下一步的模拟测试文件是必需的。

```go
type CustomApp struct {
  ...
  sm *module.SimulationManager
}
```

然后在应用程序的实例化过程中，我们以与创建`ModuleManager`相同的方式创建`SimulationManager`实例，但这次我们只传递实现了上述`AppModuleSimulation`接口的模块。

```go
func NewCustomApp(...) {
  // create the simulation manager and define the order of the modules for deterministic simulations
  app.sm = module.NewSimulationManager(
    auth.NewAppModule(app.accountKeeper),
    bank.NewAppModule(app.bankKeeper, app.accountKeeper),
    supply.NewAppModule(app.supplyKeeper, app.accountKeeper),
    gov.NewAppModule(app.govKeeper, app.accountKeeper, app.supplyKeeper),
    mint.NewAppModule(app.mintKeeper),
    distr.NewAppModule(app.distrKeeper, app.accountKeeper, app.supplyKeeper, app.stakingKeeper),
    staking.NewAppModule(app.stakingKeeper, app.accountKeeper, app.supplyKeeper),
    slashing.NewAppModule(app.slashingKeeper, app.accountKeeper, app.stakingKeeper),
  )

  // register the store decoders for simulation tests
  app.sm.RegisterStoreDecoders()
  ...
}
```




# Module Simulation

:::note

### Pre-requisite Readings

* [Cosmos Blockchain Simulator](../../develop/advanced-concepts/13-simulation.md)
:::

## Synopsis

This document details how to define each module simulation functions to be
integrated with the application `SimulationManager`.
  
* [Simulation package](#simulation-package)
    * [Store decoders](#store-decoders)
    * [Randomized genesis](#randomized-genesis)
    * [Randomized parameter changes](#randomized-parameter-changes)
    * [Random weighted operations](#random-weighted-operations)
    * [Random proposal contents](#random-proposal-contents)
* [Registering simulation functions](#registering-simulation-functions)
* [App Simulator manager](#app-simulator-manager)

## Simulation package

Every module that implements the Cosmos SDK simulator needs to have a `x/<module>/simulation`
package which contains the primary functions required by the fuzz tests: store
decoders, randomized genesis state and parameters, weighted operations and proposal
contents.

### Store decoders

Registering the store decoders is required for the `AppImportExport`. This allows
for the key-value pairs from the stores to be decoded (_i.e_ unmarshalled)
to their corresponding types. In particular, it matches the key to a concrete type
and then unmarshals the value from the `KVPair` to the type provided.

You can use the example [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/distribution/simulation/decoder.go) from the distribution module to implement your store decoders.

### Randomized genesis

The simulator tests different scenarios and values for genesis parameters
in order to fully test the edge cases of specific modules. The `simulator` package from each module must expose a `RandomizedGenState` function to generate the initial random `GenesisState` from a given seed.

Once the module genesis parameter are generated randomly (or with the key and
values defined in a `params` file), they are marshaled to JSON format and added
to the app genesis JSON to use it on the simulations.

You can check an example on how to create the randomized genesis [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/simulation/genesis.go).

### Randomized parameter changes

The simulator is able to test parameter changes at random. The simulator package from each module must contain a `RandomizedParams` func that will simulate parameter changes of the module throughout the simulations lifespan.

You can see how an example of what is needed to fully test parameter changes [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/simulation/params.go)

### Random weighted operations

Operations are one of the crucial parts of the Cosmos SDK simulation. They are the transactions
(`Msg`) that are simulated with random field values. The sender of the operation
is also assigned randomly.

Operations on the simulation are simulated using the full [transaction cycle](../../develop/advanced-concepts/01-transactions.md) of a
`ABCI` application that exposes the `BaseApp`.

Shown below is how weights are set:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/simulation/operations.go#L19-L86
```

As you can see, the weights are predefined in this case. Options exist to override this behavior with different weights. One option is to use `*rand.Rand` to define a random weight for the operation, or you can inject your own predefined weights.

Here is how one can override the above package `simappparams`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/Makefile#L293-L299
```

For the last test a tool called [runsim](https://github.com/cosmos/tools/tree/master/cmd/runsim) is used, this is used to parallelize go test instances, provide info to Github and slack integrations to provide information to your team on how the simulations are running.  

### Random proposal contents

Randomized governance proposals are also supported on the Cosmos SDK simulator. Each
module must define the governance proposal `Content`s that they expose and register
them to be used on the parameters.

## Registering simulation functions

Now that all the required functions are defined, we need to integrate them into the module pattern within the `module.go`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/distribution/module.go#L180-L203
```

## App Simulator manager

The following step is setting up the `SimulatorManager` at the app level. This
is required for the simulation test files on the next step.

```go
type CustomApp struct {
  ...
  sm *module.SimulationManager
}
```

Then at the instantiation of the application, we create the `SimulationManager`
instance in the same way we create the `ModuleManager` but this time we only pass
the modules that implement the simulation functions from the `AppModuleSimulation`
interface described above.

```go
func NewCustomApp(...) {
  // create the simulation manager and define the order of the modules for deterministic simulations
  app.sm = module.NewSimulationManager(
    auth.NewAppModule(app.accountKeeper),
    bank.NewAppModule(app.bankKeeper, app.accountKeeper),
    supply.NewAppModule(app.supplyKeeper, app.accountKeeper),
    gov.NewAppModule(app.govKeeper, app.accountKeeper, app.supplyKeeper),
    mint.NewAppModule(app.mintKeeper),
    distr.NewAppModule(app.distrKeeper, app.accountKeeper, app.supplyKeeper, app.stakingKeeper),
    staking.NewAppModule(app.stakingKeeper, app.accountKeeper, app.supplyKeeper),
    slashing.NewAppModule(app.slashingKeeper, app.accountKeeper, app.stakingKeeper),
  )

  // register the store decoders for simulation tests
  app.sm.RegisterStoreDecoders()
  ...
}
```
