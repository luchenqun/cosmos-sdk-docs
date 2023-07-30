# Cosmos区块链模拟器

Cosmos SDK提供了一个完整的模拟框架，用于对每个模块定义的消息进行模糊测试。

在Cosmos SDK中，这个功能由[`SimApp`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_v2.go)提供，它是一个用于运行[`simulation`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/simulation)模块的`Baseapp`应用程序。
该模块定义了所有的模拟逻辑以及用于随机参数（如账户、余额等）的操作。

## 目标

区块链模拟器通过生成和发送随机消息来测试区块链应用在真实环境下的行为。
其目标是通过提供模拟器运行的日志和统计信息，以及在发现故障时导出最新的应用状态，来检测和调试可能导致实时链停止的故障。

与集成测试的主要区别在于，模拟器应用程序允许您传递参数以自定义正在模拟的链。
当尝试重现在提供的操作（随机或非随机）中生成的错误时，这非常有用。

## 模拟命令

模拟应用程序有不同的命令，每个命令测试不同的故障类型：

* `AppImportExport`：模拟器导出初始应用状态，然后使用导出的`genesis.json`创建一个新的应用程序，并检查存储之间的不一致性。
* `AppSimulationAfterImport`：将两个模拟一起排队。第一个模拟将应用状态（即创世状态）提供给第二个模拟。用于测试软件升级或从现有链进行硬分叉。
* `AppStateDeterminism`：检查所有节点以相同的顺序返回相同的值。
* `BenchmarkInvariants`：分析运行所有模块不变性的性能（即按顺序运行[基准测试](https://pkg.go.dev/testing/#hdr-Benchmarks)）。不变性检查存储中的值与被动跟踪器之间的差异。例如：账户持有的总币数与总供应跟踪器之间的差异。
* `FullAppSimulation`：通用模拟模式。运行链和指定的操作一定数量的区块。测试模拟过程中是否出现`panics`。它还会在每个`Period`上运行不变性检查，但不进行基准测试。

每个模拟都必须接收一组输入（即标志），例如模拟运行的块数、种子、块大小等。
在此处查看完整的标志列表 [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/simulation/client/cli/flags.go#L33-L57)。

## 模拟器模式

除了各种输入和命令之外，模拟器有三种模式：

1. 完全随机模式，其中初始状态、模块参数和模拟参数是**伪随机生成**的。
2. 从 `genesis.json` 文件中读取初始状态和模块参数。此模式适用于在已知状态（例如导出的实时网络）上运行模拟，其中需要测试应用程序的新版本（很可能是破坏性的）。
3. 从 `params.json` 文件中读取初始状态是伪随机生成的，但模块和模拟参数可以手动提供。这允许进行更加可控和确定性的模拟设置，同时仍然允许伪随机模拟状态空间。可用参数的列表在此处列出 [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/simulation/client/cli/flags.go#L59-L78)。

:::tip
这些模式不是互斥的。因此，例如，您可以运行一个随机生成的初始状态（`1`）和手动生成的模拟参数（`3`）。
:::

## 用法

这是模拟运行的一般示例。有关更具体的示例，请查看 Cosmos SDK 的 [Makefile](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/Makefile#L282-L318)。

```bash
 $ go test -mod=readonly github.com/cosmos/cosmos-sdk/simapp \
  -run=TestApp<simulation_command> \
  ...<flags>
  -v -timeout 24h
```

## 调试提示

在遇到模拟失败时，以下是一些建议：

* 在发现失败的高度导出应用程序状态。您可以通过向模拟器传递 `-ExportStatePath` 标志来执行此操作。
* 使用 `-Verbose` 日志。它们可能会给您提供有关所有操作的更好提示。
* 减少模拟 `-Period`。这将更频繁地运行不变量检查。
* 使用 `-PrintAllInvariants` 一次打印所有失败的不变量。
* 尝试使用另一个 `-Seed`。如果它能够重现相同的错误并且失败更早，那么您将节省运行模拟的时间。
* 减少 `-NumBlocks`。在失败之前的高度上的应用程序状态如何？
* 使用 `-SimulateEveryOperation` 在每个操作上运行不变量。注意：这将大大减慢模拟速度。
* 尝试为未记录日志的操作添加日志。您将需要在您的 `Keeper` 上定义一个 [Logger](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/keeper.go#L65-L68)。

## 在你的基于Cosmos SDK的应用中使用模拟

了解如何将模拟集成到你的基于Cosmos SDK的应用中：

* 应用程序模拟管理器
* [构建模块：模拟器](../../integrate/building-modules/14-simulator.md)
* 模拟器测试




# Cosmos Blockchain Simulator

The Cosmos SDK offers a full fledged simulation framework to fuzz test every
message defined by a module.

On the Cosmos SDK, this functionality is provided by [`SimApp`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_v2.go), which is a
`Baseapp` application that is used for running the [`simulation`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/simulation) module.
This module defines all the simulation logic as well as the operations for
randomized parameters like accounts, balances etc.

## Goals

The blockchain simulator tests how the blockchain application would behave under
real life circumstances by generating and sending randomized messages.
The goal of this is to detect and debug failures that could halt a live chain,
by providing logs and statistics about the operations run by the simulator as
well as exporting the latest application state when a failure was found.

Its main difference with integration testing is that the simulator app allows
you to pass parameters to customize the chain that's being simulated.
This comes in handy when trying to reproduce bugs that were generated in the
provided operations (randomized or not).

## Simulation commands

The simulation app has different commands, each of which tests a different
failure type:

* `AppImportExport`: The simulator exports the initial app state and then it
  creates a new app with the exported `genesis.json` as an input, checking for
  inconsistencies between the stores.
* `AppSimulationAfterImport`: Queues two simulations together. The first one provides the app state (_i.e_ genesis) to the second. Useful to test software upgrades or hard-forks from a live chain.
* `AppStateDeterminism`: Checks that all the nodes return the same values, in the same order.
* `BenchmarkInvariants`: Analysis of the performance of running all modules' invariants (_i.e_ sequentially runs a [benchmark](https://pkg.go.dev/testing/#hdr-Benchmarks) test). An invariant checks for
  differences between the values that are on the store and the passive tracker. Eg: total coins held by accounts vs total supply tracker.
* `FullAppSimulation`: General simulation mode. Runs the chain and the specified operations for a given number of blocks. Tests that there're no `panics` on the simulation. It does also run invariant checks on every `Period` but they are not benchmarked.

Each simulation must receive a set of inputs (_i.e_ flags) such as the number of
blocks that the simulation is run, seed, block size, etc.
Check the full list of flags [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/simulation/client/cli/flags.go#L33-L57).

## Simulator Modes

In addition to the various inputs and commands, the simulator runs in three modes:

1. Completely random where the initial state, module parameters and simulation
   parameters are **pseudo-randomly generated**.
2. From a `genesis.json` file where the initial state and the module parameters are defined.
   This mode is helpful for running simulations on a known state such as a live network export where a new (mostly likely breaking) version of the application needs to be tested.
3. From a `params.json` file where the initial state is pseudo-randomly generated but the module and simulation parameters can be provided manually.
   This allows for a more controlled and deterministic simulation setup while allowing the state space to still be pseudo-randomly simulated.
   The list of available parameters are listed [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/simulation/client/cli/flags.go#L59-L78).

:::tip
These modes are not mutually exclusive. So you can for example run a randomly
generated genesis state (`1`) with manually generated simulation params (`3`).
:::

## Usage

This is a general example of how simulations are run. For more specific examples
check the Cosmos SDK [Makefile](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/Makefile#L282-L318).

```bash
 $ go test -mod=readonly github.com/cosmos/cosmos-sdk/simapp \
  -run=TestApp<simulation_command> \
  ...<flags>
  -v -timeout 24h
```

## Debugging Tips

Here are some suggestions when encountering a simulation failure:

* Export the app state at the height where the failure was found. You can do this
  by passing the `-ExportStatePath` flag to the simulator.
* Use `-Verbose` logs. They could give you a better hint on all the operations
  involved.
* Reduce the simulation `-Period`. This will run the invariants checks more
  frequently.
* Print all the failed invariants at once with `-PrintAllInvariants`.
* Try using another `-Seed`. If it can reproduce the same error and if it fails
  sooner, you will spend less time running the simulations.
* Reduce the `-NumBlocks` . How's the app state at the height previous to the
  failure?
* Run invariants on every operation with `-SimulateEveryOperation`. _Note_: this
  will slow down your simulation **a lot**.
* Try adding logs to operations that are not logged. You will have to define a
  [Logger](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/keeper/keeper.go#L65-L68) on your `Keeper`.

## Use simulation in your Cosmos SDK-based application

Learn how you can integrate the simulation into your Cosmos SDK-based application:

* Application Simulation Manager
* [Building modules: Simulator](../../integrate/building-modules/14-simulator.md)
* Simulator tests
