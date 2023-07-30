# 模块管理器

:::note 概要
Cosmos SDK模块需要实现[`AppModule`接口](#应用程序模块接口)，以便由应用程序的[模块管理器](#模块管理器)管理。模块管理器在[`消息`和`查询`路由](../../develop/advanced-concepts/00-baseapp.md#消息服务路由)中起着重要作用，并允许应用程序开发人员设置各种函数（如[`BeginBlocker`和`EndBlocker`](../../develop/high-level-concepts/00-overview-app#beginblocker-and-endblocker)）的执行顺序。
:::

:::note

### 先决条件阅读

* [Cosmos SDK模块简介](00-intro.md)

:::

## 应用程序模块接口

应用程序模块接口用于促进将模块组合在一起形成功能完整的Cosmos SDK应用程序。主要有4个应用程序模块接口：

* [`AppModuleBasic`](#appmodulebasic) 用于独立模块功能。
* [`AppModule`](#appmodule) 用于相互依赖的模块功能（除了与创世相关的功能）。
* [`AppModuleGenesis`](#appmodulegenesis) 用于相互依赖的与创世相关的模块功能。
* `GenesisOnlyAppModule`：定义了只具有导入/导出功能的`AppModule`

上述接口大多嵌入了较小的接口（扩展接口），用于定义特定的功能：

* `HasName`：允许模块提供自己的名称以供遗留目的。
* [`HasGenesisBasics`](#hasgenesisbasics)：用于无状态创世方法的遗留接口。
* [`HasGenesis`](#hasgenesis)：用于有状态创世方法的扩展接口。
* [`HasInvariants`](#hasinvariants)：用于注册不变量的扩展接口。
* [`HasServices`](#hasservices)：用于模块注册服务的扩展接口。
* [`HasConsensusVersion`](#hasconsensusversion)：用于声明模块共识版本的扩展接口。
* [`BeginBlockAppModule`](#beginblockappmodule)：包含有关`AppModule`和`BeginBlock`的信息的扩展接口。
* [`EndBlockAppModule`](#endblockappmodule)：包含有关`AppModule`和`EndBlock`的信息的扩展接口。
* [`HasPrecommit`](#hasprecommit)：包含有关`AppModule`和`Precommit`的信息的扩展接口。
* [`HasPrepareCheckState`](#haspreparecheckstate)：包含有关`AppModule`和`PrepareCheckState`的信息的扩展接口。

`AppModuleBasic`接口用于定义模块的独立方法，即那些不依赖于应用程序中其他模块的方法。这允许在应用程序定义的早期构建基本的应用程序结构，通常在[主应用程序文件](../../develop/high-level-concepts/00-overview-app.md#core-application-file)的`init()`函数中进行。

`AppModule`接口用于定义相互依赖的模块方法。许多模块需要与其他模块进行交互，通常是通过[`keeper`s](06-keeper.md)进行，这意味着需要一个接口，模块在其中列出它们的`keeper`s和其他需要引用另一个模块对象的方法。`AppModule`接口的扩展，如`BeginBlockAppModule`和`EndBlockAppModule`，还使模块管理器能够设置模块方法（如`BeginBlock`和`EndBlock`）之间的执行顺序，这在模块之间的执行顺序在应用程序的上下文中很重要。

使用扩展接口的方式允许模块仅定义它们需要的功能。例如，一个不需要`EndBlock`的模块不需要定义`EndBlockAppModule`接口和`EndBlock`方法。`AppModule`和`AppModuleGenesis`是自愿小的接口，可以利用`Module`模式而无需定义许多占位符函数。

### `AppModuleBasic`

`AppModuleBasic`接口定义了模块需要实现的独立方法。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L49-L59
```

让我们来看看这些方法：

* `RegisterLegacyAminoCodec(*codec.LegacyAmino)`: 为模块注册`amino`编解码器，该编解码器用于将结构体编组和解组为`[]byte`，以便将其持久化在模块的`KVStore`中。
* `RegisterInterfaces(codectypes.InterfaceRegistry)`: 注册模块的接口类型及其具体实现为`proto.Message`。
* `RegisterGRPCGatewayRoutes(client.Context, *runtime.ServeMux)`: 为模块注册gRPC路由。
* `GetTxCmd()`: 返回模块的根[`Tx`命令](09-module-interfaces.md#transaction-commands)。该根命令的子命令由最终用户使用，用于生成包含模块中定义的[`message`s](02-messages-and-queries.md#queries)的新事务。
* `GetQueryCmd()`: 返回模块的根[`query`命令](09-module-interfaces.md#query-commands)。该根命令的子命令由最终用户使用，用于生成对模块定义的状态子集的新查询。

所有应用程序的`AppModuleBasic`都由[`BasicManager`](#basicmanager)管理。

### `HasName`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L61-L66
```

* `HasName`是一个具有`Name()`方法的接口。该方法返回模块的名称作为`string`类型。

### `HasGenesisBasics`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L68-L72
```

让我们来看看这些方法：

* `DefaultGenesis(codec.JSONCodec)`: 返回模块的默认[`GenesisState`](08-genesis.md)，以`json.RawMessage`形式编组。默认的`GenesisState`需要由模块开发人员定义，并主要用于测试。
* `ValidateGenesis(codec.JSONCodec, client.TxEncodingConfig, json.RawMessage)`: 用于验证模块定义的`GenesisState`，以其`json.RawMessage`形式给出。通常在运行模块开发人员定义的自定义[`ValidateGenesis`](08-genesis.md#validategenesis)函数之前，会对`json`进行解组。

### `AppModuleGenesis`

`AppModuleGenesis`接口是`AppModuleBasic`和`HasGenesis`接口的简单嵌入。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L156-L160
```

它没有自己的管理器，并且与[`AppModule`](#appmodule)分开存在，仅用于仅实现创世功能的模块，以便可以在不必实现所有`AppModule`方法的情况下进行管理。

### `HasGenesis`

`HasGenesis`接口是`HasGenesisBasics`的扩展接口。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L162-L167
```

让我们来看看新增的两个方法：

* `InitGenesis(sdk.Context, codec.JSONCodec, json.RawMessage)`: 初始化模块管理的状态子集。在创世时调用（即链首次启动时）。
* `ExportGenesis(sdk.Context, codec.JSONCodec)`: 导出模块管理的最新状态子集，以在新的创世文件中使用。在从现有链的状态开始启动新链时，对每个模块调用`ExportGenesis`。

### `AppModule`

`AppModule`接口定义了一个模块。模块可以通过实现扩展接口来声明其功能。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L169-L173
```

`AppModule`由[模块管理器](#manager)管理，该管理器检查模块实现了哪些扩展接口。

:::note
以前，`AppModule`接口包含了扩展接口中定义的所有方法。这导致了那些不需要所有功能的模块产生了很多样板代码。
:::

### `HasInvariants`

该接口定义了一个方法，用于检查模块是否可以注册不变量。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L175-L179
```

* `RegisterInvariants(sdk.InvariantRegistry)`: 注册模块的[`不变量`](07-invariants.md)。如果不变量偏离了其预测值，[`InvariantRegistry`](07-invariants.md#invariant-registry)会触发适当的逻辑（通常是链的停止）。

### `HasServices`

该接口定义了一个方法，用于检查模块是否可以注册服务。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L181-L185
```

* `RegisterServices(Configurator)`: 允许模块注册服务。

### `HasConsensusVersion`

该接口定义了一个方法，用于检查模块的共识版本。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L187-L194
```

* `ConsensusVersion() uint64`: 返回模块的共识版本。

### `BeginBlockAppModule`

`BeginBlockAppModule`是`AppModule`的扩展接口。所有具有`BeginBlock`方法的模块都实现了该接口。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L196-L200
```

* `BeginBlock(sdk.Context, abci.RequestBeginBlock)`: 该方法允许模块开发人员在每个区块开始时自动触发逻辑。如果该模块不需要在每个区块开始时触发逻辑，则实现为空。

### `EndBlockAppModule`

`EndBlockAppModule`是`AppModule`的扩展接口。所有具有`EndBlock`方法的模块都实现了该接口。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L202-L206
```

* `EndBlock(sdk.Context, abci.RequestEndBlock)`: 该方法允许模块开发者在每个区块结束时自动触发逻辑。模块还可以通过该方法通知底层共识引擎验证人集合的变化（例如`staking`模块）。如果该模块不需要在每个区块结束时触发逻辑，则实现为空。

### `HasPrecommit`

`HasPrecommit`是`AppModule`的扩展接口。所有具有`Precommit`方法的模块都实现了该接口。

* `Precommit(sdk.Context)`: 该方法允许模块开发者在每个区块的[`Commit`](../../develop/advanced-concepts/00-baseapp.md#commit)期间，使用要提交的区块的[`deliverState`](../../develop/advanced-concepts/00-baseapp.md#state-updates)自动触发逻辑。如果该模块在每个区块的`Commit`期间不需要触发逻辑，则实现为空。

### `HasPrepareCheckState`

`HasPrepareCheckState`是`AppModule`的扩展接口。所有具有`PrepareCheckState`方法的模块都实现了该接口。

* `PrepareCheckState(sdk.Context)`: 该方法允许模块开发者在每个区块的[`Commit`](../../develop/advanced-concepts/00-baseapp.md)期间，使用下一个区块的[`checkState`](../../develop/advanced-concepts/00-baseapp.md#state-updates)自动触发逻辑。如果该模块在每个区块的`Commit`期间不需要触发逻辑，则实现为空。

### 实现应用程序模块接口

通常，各种应用程序模块接口在一个名为`module.go`的文件中实现，该文件位于模块的文件夹中（例如`./x/module/module.go`）。

几乎每个模块都需要实现`AppModuleBasic`和`AppModule`接口。如果该模块仅用于创世块，它将实现`AppModuleGenesis`而不是`AppModule`。实现接口的具体类型可以添加在接口的各种方法实现中所需的参数。例如，`Route()`函数通常调用在`keeper/msg_server.go`中定义的`NewMsgServerImpl(k keeper)`函数，因此需要将模块的[`keeper`](06-keeper.md)作为参数传递。

```go
// example
type AppModule struct {
	AppModuleBasic
	keeper       Keeper
}
```

在上面的示例中，您可以看到`AppModule`具体类型引用了`AppModuleBasic`，而不是`AppModuleGenesis`。这是因为`AppModuleGenesis`只需要在专注于创世相关功能的模块中实现。在大多数模块中，具体的`AppModule`类型将引用一个`AppModuleBasic`并直接在`AppModule`类型中实现`AppModuleGenesis`的两个附加方法。

如果不需要参数（这在`AppModuleBasic`中经常是这种情况），只需声明一个空的具体类型，如下所示：

```go
type AppModuleBasic struct{}
```

## 模块管理器

模块管理器用于管理`AppModuleBasic`和`AppModule`的集合。

### `BasicManager`

`BasicManager`是一个结构，列出了应用程序的所有`AppModuleBasic`：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L74-L84
```

它实现了以下方法：

* `NewBasicManager(modules ...AppModuleBasic)`: 构造函数。它接受应用程序的`AppModuleBasic`列表，并构建一个新的`BasicManager`。通常在[`app.go`](../../develop/high-level-concepts/00-overview-app.md#core-application-file)的`init()`函数中调用此函数，以快速初始化应用程序模块的独立元素（点击[这里](https://github.com/cosmos/gaia/blob/main/app/app.go#L59-L74)查看示例）。
* `RegisterLegacyAminoCodec(cdc *codec.LegacyAmino)`: 注册每个应用程序的`AppModuleBasic`的[`codec.LegacyAmino`](../../develop/advanced-concepts/06-encoding.md#amino)。通常在[应用程序的构建过程](../../develop/high-level-concepts/00-overview-app.md#constructor)的早期调用此函数。
* `RegisterInterfaces(registry codectypes.InterfaceRegistry)`: 注册每个应用程序的`AppModuleBasic`的接口类型和实现。
* `DefaultGenesis(cdc codec.JSONCodec)`: 通过调用每个模块的[`DefaultGenesis(cdc codec.JSONCodec)`](08-genesis.md#defaultgenesis)函数，为应用程序中的模块提供默认的创世信息。它只调用实现了`HasGenesisBasics`接口的模块。
* `ValidateGenesis(cdc codec.JSONCodec, txEncCfg client.TxEncodingConfig, genesis map[string]json.RawMessage)`: 通过调用实现了`HasGenesisBasics`接口的模块的[`ValidateGenesis(codec.JSONCodec, client.TxEncodingConfig, json.RawMessage)`](08-genesis.md#validategenesis)函数，验证模块的创世信息。
* `RegisterGRPCGatewayRoutes(clientCtx client.Context, rtr *runtime.ServeMux)`: 为模块注册gRPC路由。
* `AddTxCommands(rootTxCmd *cobra.Command)`: 将模块的事务命令添加到应用程序的[`rootTxCommand`](../../develop/advanced-concepts/07-cli.md#transaction-commands)。通常在[应用程序的命令行界面](../../develop/advanced-concepts/07-cli.md)的`main.go`函数中调用此函数。
* `AddQueryCommands(rootQueryCmd *cobra.Command)`: 将模块的查询命令添加到应用程序的[`rootQueryCommand`](../../develop/advanced-concepts/07-cli.md#query-commands)。通常在[应用程序的命令行界面](../../develop/advanced-concepts/07-cli.md)的`main.go`函数中调用此函数。

### `Manager`

`Manager`是一个结构体，它保存了应用程序的所有`AppModule`，并定义了这些模块中几个关键组件之间的执行顺序：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L246-L273
```

在整个应用程序中，当需要对一组模块执行操作时，会使用模块管理器。它实现了以下方法：

* `NewManager(modules ...AppModule)`: 构造函数。它接受应用程序的`AppModule`列表，并构建一个新的`Manager`。通常从应用程序的主要[构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中调用。
* `SetOrderInitGenesis(moduleNames ...string)`: 设置在应用程序首次启动时调用每个模块的[`InitGenesis`](08-genesis.md#initgenesis)函数的顺序。通常从应用程序的主要[构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中调用。
  要成功初始化模块，应考虑模块之间的依赖关系。例如，`genutil`模块必须在`staking`模块之后出现，以便使用创世账户中的代币正确初始化池，`genutils`模块也必须在`auth`模块之后出现，以便它可以访问来自auth的参数，IBC的`capability`模块应在所有其他模块之前初始化，以便它可以初始化任何能力。
* `SetOrderExportGenesis(moduleNames ...string)`: 设置在导出时调用每个模块的[`ExportGenesis`](08-genesis.md#exportgenesis)函数的顺序。通常从应用程序的主要[构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中调用。
* `SetOrderBeginBlockers(moduleNames ...string)`: 设置在每个区块开始时调用每个模块的`BeginBlock()`函数的顺序。通常从应用程序的主要[构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中调用。
* `SetOrderEndBlockers(moduleNames ...string)`: 设置在每个区块结束时调用每个模块的`EndBlock()`函数的顺序。通常从应用程序的主要[构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中调用。
* `SetOrderPrecommiters(moduleNames ...string)`: 设置在每个区块提交时调用每个模块的`Precommit()`函数的顺序。通常从应用程序的主要[构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中调用。
* `SetOrderPrepareCheckStaters(moduleNames ...string)`: 设置在每个区块提交时调用每个模块的`PrepareCheckState()`函数的顺序。通常从应用程序的主要[构造函数](../../develop/high-level-concepts/00-overview-app.md#constructor-function)中调用。
* `SetOrderMigrations(moduleNames ...string)`: 设置要运行的迁移的顺序。如果未设置，则迁移将按照`DefaultMigrationsOrder`中定义的顺序运行。
* `RegisterInvariants(ir sdk.InvariantRegistry)`: 注册实现`HasInvariants`接口的模块的[不变式](07-invariants.md)。
* `RegisterRoutes(router sdk.Router, queryRouter sdk.QueryRouter, legacyQuerierCdc *codec.LegacyAmino)`: 注册旧版的[`Msg`](02-messages-and-queries.md#messages)和[`querier`](04-query-services.md)路由。
* `RegisterServices(cfg Configurator)`: 注册实现`HasServices`接口的模块的服务。
* `InitGenesis(ctx sdk.Context, cdc codec.JSONCodec, genesisData map[string]json.RawMessage)`: 在应用程序首次启动时，按照`OrderInitGenesis`中定义的顺序调用每个模块的[`InitGenesis`](08-genesis.md#initgenesis)函数。将`abci.ResponseInitChain`返回给底层共识引擎，其中可以包含验证人更新。
* `ExportGenesis(ctx sdk.Context, cdc codec.JSONCodec)`: 按照`OrderExportGenesis`中定义的顺序调用每个模块的[`ExportGenesis`](08-genesis.md#exportgenesis)函数。导出从先前存在的状态构建创世文件，主要用于需要进行硬分叉升级的链。
* `ExportGenesisForModules(ctx sdk.Context, cdc codec.JSONCodec, modulesToExport []string)`: 与`ExportGenesis`相同，只是接受要导出的模块列表。
* `BeginBlock(ctx sdk.Context, req abci.RequestBeginBlock)`: 在每个区块开始时，从[`BaseApp`](../../develop/advanced-concepts/00-baseapp.md#beginblock)调用此函数，并依次调用实现`BeginBlockAppModule`接口的每个模块的[`BeginBlock`](05-beginblock-endblock.md)函数，按照`OrderBeginBlockers`中定义的顺序。它创建一个带有事件管理器的子[上下文](../../develop/advanced-concepts/02-context.md)，以聚合所有模块发出的[事件](../../develop/advanced-concepts/08-events.md)。该函数返回一个`abci.ResponseBeginBlock`，其中包含上述事件。
* `EndBlock(ctx sdk.Context, req abci.RequestEndBlock)`: 在每个区块结束时，从[`BaseApp`](../../develop/advanced-concepts/00-baseapp.md#endblock)调用此函数，并依次调用实现`EndBlockAppModule`接口的每个模块的[`EndBlock`](05-beginblock-endblock.md)函数，按照`OrderEndBlockers`中定义的顺序。它创建一个带有事件管理器的子[上下文](../../develop/advanced-concepts/02-context.md)，以聚合所有模块发出的[事件](../../develop/advanced-concepts/08-events.md)。该函数返回一个`abci.ResponseEndBlock`，其中包含上述事件，以及验证人集合的更新（如果有）。
* `Precommit(ctx sdk.Context)`: 在[`Commit`](../../develop/advanced-concepts/00-baseapp.md#commit)期间，从`BaseApp`中立即在将[`deliverState`](../../develop/advanced-concepts/00-baseapp.md#state-updates)写入底层的[`rootMultiStore`](../../develop/advanced-concepts/04-store.md#commitkvstore)之前调用此函数，并依次调用实现`HasPrecommit`接口的每个模块的`Precommit`函数，按照`OrderPrecommiters`中定义的顺序。它创建一个子[上下文](../../develop/advanced-concepts/02-context.md)，其中底层的`CacheMultiStore`是新提交的区块的[`deliverState`](../../develop/advanced-concepts/00-baseapp.md#state-updates)的`CacheMultiStore`。
* `PrepareCheckState(ctx sdk.Context)`: 在[`Commit`](../../develop/advanced-concepts/00-baseapp.md#commit)期间，从`BaseApp`中立即在将[`deliverState`](../../develop/advanced-concepts/00-baseapp.md#state-updates)写入底层的[`rootMultiStore`](../../develop/advanced-concepts/04-store.md#commitmultistore)之后调用此函数，并依次调用实现`HasPrepareCheckState`接口的每个模块的`PrepareCheckState`函数，按照`OrderPrepareCheckStaters`中定义的顺序。它创建一个子[上下文](../../develop/advanced-concepts/02-context.md)，其中底层的`CacheMultiStore`是下一个区块的[`checkState`](../../develop/advanced-concepts/00-baseapp.md#state-updates)的`CacheMultiStore`。对此状态的写入将存在于下一个区块的[`checkState`](../../develop/advanced-concepts/00-baseapp.md#state-updates)中，因此此方法可用于为下一个区块准备`checkState`。

这是在 `simapp` 中的一个具体集成示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L386-L432
```

这是来自 `runtime` 的相同示例（用于支持 app v2 的包）：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/runtime/module.go#L77
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/runtime/module.go#L87
```




# Module Manager

:::note Synopsis
Cosmos SDK modules need to implement the [`AppModule` interfaces](#application-module-interfaces), in order to be managed by the application's [module manager](#module-manager). The module manager plays an important role in [`message` and `query` routing](../../develop/advanced-concepts/00-baseapp.md#msg-service-router), and allows application developers to set the order of execution of a variety of functions like [`BeginBlocker` and `EndBlocker`](../../develop/high-level-concepts/00-overview-app#beginblocker-and-endblocker).
:::

:::note

### Pre-requisite Readings

* [Introduction to Cosmos SDK Modules](00-intro.md)

:::

## Application Module Interfaces

Application module interfaces exist to facilitate the composition of modules together to form a functional Cosmos SDK application.
There are 4 main application module interfaces:

* [`AppModuleBasic`](#appmodulebasic) for independent module functionalities.
* [`AppModule`](#appmodule) for inter-dependent module functionalities (except genesis-related functionalities).
* [`AppModuleGenesis`](#appmodulegenesis) for inter-dependent genesis-related module functionalities.
* `GenesisOnlyAppModule`: Defines an `AppModule` that only has import/export functionality

The above interfaces are mostly embedding smaller interfaces (extension interfaces), that defines specific functionalities:

* `HasName`: Allows the module to provide its own name for legacy purposes.
* [`HasGenesisBasics`](#hasgenesisbasics): The legacy interface for stateless genesis methods.
* [`HasGenesis`](#hasgenesis): The extension interface for stateful genesis methods.
* [`HasInvariants`](#hasinvariants): The extension interface for registering invariants.
* [`HasServices`](#hasservices): The extension interface for modules to register services.
* [`HasConsensusVersion`](#hasconsensusversion): The extension interface for declaring a module consensus version.
* [`BeginBlockAppModule`](#beginblockappmodule): The extension interface that contains information about the `AppModule` and `BeginBlock`.
* [`EndBlockAppModule`](#endblockappmodule): The extension interface that contains information about the `AppModule` and `EndBlock`.
* [`HasPrecommit`](#hasprecommit): The extension interface that contains information about the `AppModule` and `Precommit`.
* [`HasPrepareCheckState`](#haspreparecheckstate): The extension interface that contains information about the `AppModule` and `PrepareCheckState`.

The `AppModuleBasic` interface exists to define independent methods of the module, i.e. those that do not depend on other modules in the application. This allows for the construction of the basic application structure early in the application definition, generally in the `init()` function of the [main application file](../../develop/high-level-concepts/00-overview-app.md#core-application-file).

The `AppModule` interface exists to define inter-dependent module methods. Many modules need to interact with other modules, typically through [`keeper`s](06-keeper.md), which means there is a need for an interface where modules list their `keeper`s and other methods that require a reference to another module's object. `AppModule` interface extension, such as `BeginBlockAppModule` and `EndBlockAppModule`, also enables the module manager to set the order of execution between module's methods like `BeginBlock` and `EndBlock`, which is important in cases where the order of execution between modules matters in the context of the application.

The usage of extension interfaces allows modules to define only the functionalities they need. For example, a module that does not need an `EndBlock` does not need to define the `EndBlockAppModule` interface and thus the `EndBlock` method. `AppModule` and `AppModuleGenesis` are voluntarily small interfaces, that can take advantage of the `Module` patterns without having to define many placeholder functions.

### `AppModuleBasic`

The `AppModuleBasic` interface defines the independent methods modules need to implement.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L49-L59
```

Let us go through the methods:

* `RegisterLegacyAminoCodec(*codec.LegacyAmino)`: Registers the `amino` codec for the module, which is used to marshal and unmarshal structs to/from `[]byte` in order to persist them in the module's `KVStore`.
* `RegisterInterfaces(codectypes.InterfaceRegistry)`: Registers a module's interface types and their concrete implementations as `proto.Message`.
* `RegisterGRPCGatewayRoutes(client.Context, *runtime.ServeMux)`: Registers gRPC routes for the module.
* `GetTxCmd()`: Returns the root [`Tx` command](09-module-interfaces.md#transaction-commands) for the module. The subcommands of this root command are used by end-users to generate new transactions containing [`message`s](02-messages-and-queries.md#queries) defined in the module.
* `GetQueryCmd()`: Return the root [`query` command](09-module-interfaces.md#query-commands) for the module. The subcommands of this root command are used by end-users to generate new queries to the subset of the state defined by the module.

All the `AppModuleBasic` of an application are managed by the [`BasicManager`](#basicmanager).

### `HasName`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L61-L66
```

* `HasName` is an interface that has a method `Name()`. This method returns the name of the module as a `string`.

### `HasGenesisBasics`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L68-L72
```

Let us go through the methods:

* `DefaultGenesis(codec.JSONCodec)`: Returns a default [`GenesisState`](08-genesis.md) for the module, marshalled to `json.RawMessage`. The default `GenesisState` need to be defined by the module developer and is primarily used for testing.
* `ValidateGenesis(codec.JSONCodec, client.TxEncodingConfig, json.RawMessage)`: Used to validate the `GenesisState` defined by a module, given in its `json.RawMessage` form. It will usually unmarshall the `json` before running a custom [`ValidateGenesis`](08-genesis.md#validategenesis) function defined by the module developer.

### `AppModuleGenesis`

The `AppModuleGenesis` interface is a simple embedding of the `AppModuleBasic` and `HasGenesis` interfaces.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L156-L160
```

It does not have its own manager, and exists separately from [`AppModule`](#appmodule) only for modules that exist only to implement genesis functionalities, so that they can be managed without having to implement all of `AppModule`'s methods.

### `HasGenesis`

The `HasGenesis` interface is an extension interface of `HasGenesisBasics`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L162-L167
```

Let us go through the two added methods:

* `InitGenesis(sdk.Context, codec.JSONCodec, json.RawMessage)`: Initializes the subset of the state managed by the module. It is called at genesis (i.e. when the chain is first started).
* `ExportGenesis(sdk.Context, codec.JSONCodec)`: Exports the latest subset of the state managed by the module to be used in a new genesis file. `ExportGenesis` is called for each module when a new chain is started from the state of an existing chain.

### `AppModule`

The `AppModule` interface defines a module. Modules can declare their functionalities by implementing extensions interfaces.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L169-L173
```

`AppModule`s are managed by the [module manager](#manager), which checks which extension interfaces are implemented by the module.

:::note 
Previously the `AppModule` interface was containing all the methods that are defined in the extensions interfaces. This was leading to much boilerplate for modules that did not need all the functionalities.
:::

### `HasInvariants`

This interface defines one method. It allows to checks if a module can register invariants.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L175-L179
```

* `RegisterInvariants(sdk.InvariantRegistry)`: Registers the [`invariants`](07-invariants.md) of the module. If an invariant deviates from its predicted value, the [`InvariantRegistry`](07-invariants.md#invariant-registry) triggers appropriate logic (most often the chain will be halted).

### `HasServices`

This interface defines one method. It allows to checks if a module can register invariants.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L181-L185
```

* `RegisterServices(Configurator)`: Allows a module to register services.

### `HasConsensusVersion`

This interface defines one method for checking a module consensus version.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L187-L194
```

* `ConsensusVersion() uint64`: Returns the consensus version of the module.

### `BeginBlockAppModule`

The `BeginBlockAppModule` is an extension interface from `AppModule`. All modules that have an `BeginBlock` method implement this interface.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L196-L200
```

* `BeginBlock(sdk.Context, abci.RequestBeginBlock)`: This method gives module developers the option to implement logic that is automatically triggered at the beginning of each block. Implement empty if no logic needs to be triggered at the beginning of each block for this module.

### `EndBlockAppModule`

The `EndBlockAppModule` is an extension interface from `AppModule`. All modules that have an `EndBlock` method implement this interface.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L202-L206
```

* `EndBlock(sdk.Context, abci.RequestEndBlock)`: This method gives module developers the option to implement logic that is automatically triggered at the end of each block. This is also where the module can inform the underlying consensus engine of validator set changes (e.g. the `staking` module). Implement empty if no logic needs to be triggered at the end of each block for this module.

### `HasPrecommit`

`HasPrecommit` is an extension interface from `AppModule`. All modules that have a `Precommit` method implement this interface.

* `Precommit(sdk.Context)`: This method gives module developers the option to implement logic that is automatically triggered during [`Commit'](../../develop/advanced-concepts/00-baseapp.md#commit) of each block using the [`deliverState`](../../develop/advanced-concepts/00-baseapp.md#state-updates) of the block to be committed. Implement empty if no logic needs to be triggered during `Commit` of each block for this module.

### `HasPrepareCheckState`

`HasPrepareCheckState` is an extension interface from `AppModule`. All modules that have a `PrepareCheckState` method implement this interface.

* `PrepareCheckState(sdk.Context)`: This method gives module developers the option to implement logic that is automatically triggered during [`Commit'](../../develop/advanced-concepts/00-baseapp.md) of each block using the [`checkState`](../../develop/advanced-concepts/00-baseapp.md#state-updates) of the next block. Implement empty if no logic needs to be triggered during `Commit` of each block for this module.

### Implementing the Application Module Interfaces

Typically, the various application module interfaces are implemented in a file called `module.go`, located in the module's folder (e.g. `./x/module/module.go`).

Almost every module needs to implement the `AppModuleBasic` and `AppModule` interfaces. If the module is only used for genesis, it will implement `AppModuleGenesis` instead of `AppModule`. The concrete type that implements the interface can add parameters that are required for the implementation of the various methods of the interface. For example, the `Route()` function often calls a `NewMsgServerImpl(k keeper)` function defined in `keeper/msg_server.go` and therefore needs to pass the module's [`keeper`](06-keeper.md) as a parameter.

```go
// example
type AppModule struct {
	AppModuleBasic
	keeper       Keeper
}
```

In the example above, you can see that the `AppModule` concrete type references an `AppModuleBasic`, and not an `AppModuleGenesis`. That is because `AppModuleGenesis` only needs to be implemented in modules that focus on genesis-related functionalities. In most modules, the concrete `AppModule` type will have a reference to an `AppModuleBasic` and implement the two added methods of `AppModuleGenesis` directly in the `AppModule` type.

If no parameter is required (which is often the case for `AppModuleBasic`), just declare an empty concrete type like so:

```go
type AppModuleBasic struct{}
```

## Module Managers

Module managers are used to manage collections of `AppModuleBasic` and `AppModule`.

### `BasicManager`

The `BasicManager` is a structure that lists all the `AppModuleBasic` of an application:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L74-L84
```

It implements the following methods:

* `NewBasicManager(modules ...AppModuleBasic)`: Constructor function. It takes a list of the application's `AppModuleBasic` and builds a new `BasicManager`. This function is generally called in the `init()` function of [`app.go`](../../develop/high-level-concepts/00-overview-app.md#core-application-file) to quickly initialize the independent elements of the application's modules (click [here](https://github.com/cosmos/gaia/blob/main/app/app.go#L59-L74) to see an example).
* `RegisterLegacyAminoCodec(cdc *codec.LegacyAmino)`: Registers the [`codec.LegacyAmino`s](../../develop/advanced-concepts/06-encoding.md#amino) of each of the application's `AppModuleBasic`. This function is usually called early on in the [application's construction](../../develop/high-level-concepts/00-overview-app.md#constructor).
* `RegisterInterfaces(registry codectypes.InterfaceRegistry)`: Registers interface types and implementations of each of the application's `AppModuleBasic`.
* `DefaultGenesis(cdc codec.JSONCodec)`: Provides default genesis information for modules in the application by calling the [`DefaultGenesis(cdc codec.JSONCodec)`](08-genesis.md#defaultgenesis) function of each module. It only calls the modules that implements the `HasGenesisBasics` interfaces.
* `ValidateGenesis(cdc codec.JSONCodec, txEncCfg client.TxEncodingConfig, genesis map[string]json.RawMessage)`: Validates the genesis information modules by calling the [`ValidateGenesis(codec.JSONCodec, client.TxEncodingConfig, json.RawMessage)`](08-genesis.md#validategenesis) function of modules implementing the `HasGenesisBasics` interface.
* `RegisterGRPCGatewayRoutes(clientCtx client.Context, rtr *runtime.ServeMux)`: Registers gRPC routes for modules.
* `AddTxCommands(rootTxCmd *cobra.Command)`: Adds modules' transaction commands to the application's [`rootTxCommand`](../../develop/advanced-concepts/07-cli.md#transaction-commands). This function is usually called function from the `main.go` function of the [application's command-line interface](../../develop/advanced-concepts/07-cli.md).
* `AddQueryCommands(rootQueryCmd *cobra.Command)`: Adds modules' query commands to the application's [`rootQueryCommand`](../../develop/advanced-concepts/07-cli.md#query-commands). This function is usually called function from the `main.go` function of the [application's command-line interface](../../develop/advanced-concepts/07-cli.md).

### `Manager`

The `Manager` is a structure that holds all the `AppModule` of an application, and defines the order of execution between several key components of these modules:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/module/module.go#L246-L273
```

The module manager is used throughout the application whenever an action on a collection of modules is required. It implements the following methods:

* `NewManager(modules ...AppModule)`: Constructor function. It takes a list of the application's `AppModule`s and builds a new `Manager`. It is generally called from the application's main [constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function).
* `SetOrderInitGenesis(moduleNames ...string)`: Sets the order in which the [`InitGenesis`](08-genesis.md#initgenesis) function of each module will be called when the application is first started. This function is generally called from the application's main [constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function). 
  To initialize modules successfully, module dependencies should be considered. For example, the `genutil` module must occur after `staking` module so that the pools are properly initialized with tokens from genesis accounts, the `genutils` module must also occur after `auth` so that it can access the params from auth, IBC's `capability` module should be initialized before all other modules so that it can initialize any capabilities.
* `SetOrderExportGenesis(moduleNames ...string)`: Sets the order in which the [`ExportGenesis`](08-genesis.md#exportgenesis) function of each module will be called in case of an export. This function is generally called from the application's main [constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function).
* `SetOrderBeginBlockers(moduleNames ...string)`: Sets the order in which the `BeginBlock()` function of each module will be called at the beginning of each block. This function is generally called from the application's main [constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function).
* `SetOrderEndBlockers(moduleNames ...string)`: Sets the order in which the `EndBlock()` function of each module will be called at the end of each block. This function is generally called from the application's main [constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function).
* `SetOrderPrecommiters(moduleNames ...string)`: Sets the order in which the `Precommit()` function of each module will be called during commit of each block. This function is generally called from the application's main [constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function).
* `SetOrderPrepareCheckStaters(moduleNames ...string)`: Sets the order in which the `PrepareCheckState()` function of each module will be called during commit of each block. This function is generally called from the application's main [constructor function](../../develop/high-level-concepts/00-overview-app.md#constructor-function).
* `SetOrderMigrations(moduleNames ...string)`: Sets the order of migrations to be run. If not set then migrations will be run with an order defined in `DefaultMigrationsOrder`.
* `RegisterInvariants(ir sdk.InvariantRegistry)`: Registers the [invariants](07-invariants.md) of module implementing the `HasInvariants` interface.
* `RegisterRoutes(router sdk.Router, queryRouter sdk.QueryRouter, legacyQuerierCdc *codec.LegacyAmino)`: Registers legacy [`Msg`](02-messages-and-queries.md#messages) and [`querier`](04-query-services.md) routes.
* `RegisterServices(cfg Configurator)`: Registers the services of modules implementing the `HasServices` interface.
* `InitGenesis(ctx sdk.Context, cdc codec.JSONCodec, genesisData map[string]json.RawMessage)`: Calls the [`InitGenesis`](08-genesis.md#initgenesis) function of each module when the application is first started, in the order defined in `OrderInitGenesis`. Returns an `abci.ResponseInitChain` to the underlying consensus engine, which can contain validator updates.
* `ExportGenesis(ctx sdk.Context, cdc codec.JSONCodec)`: Calls the [`ExportGenesis`](08-genesis.md#exportgenesis) function of each module, in the order defined in `OrderExportGenesis`. The export constructs a genesis file from a previously existing state, and is mainly used when a hard-fork upgrade of the chain is required.
* `ExportGenesisForModules(ctx sdk.Context, cdc codec.JSONCodec, modulesToExport []string)`: Behaves the same as `ExportGenesis`, except takes a list of modules to export.
* `BeginBlock(ctx sdk.Context, req abci.RequestBeginBlock)`: At the beginning of each block, this function is called from [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md#beginblock) and, in turn, calls the [`BeginBlock`](05-beginblock-endblock.md) function of each modules implementing the `BeginBlockAppModule` interface, in the order defined in `OrderBeginBlockers`. It creates a child [context](../../develop/advanced-concepts/02-context.md) with an event manager to aggregate [events](../../develop/advanced-concepts/08-events.md) emitted from all modules. The function returns an `abci.ResponseBeginBlock` which contains the aforementioned events.
* `EndBlock(ctx sdk.Context, req abci.RequestEndBlock)`: At the end of each block, this function is called from [`BaseApp`](../../develop/advanced-concepts/00-baseapp.md#endblock) and, in turn, calls the [`EndBlock`](05-beginblock-endblock.md) function of each modules implementing the `EndBlockAppModule` interface, in the order defined in `OrderEndBlockers`. It creates a child [context](../../develop/advanced-concepts/02-context.md) with an event manager to aggregate [events](../../develop/advanced-concepts/08-events.md) emitted from all modules. The function returns an `abci.ResponseEndBlock` which contains the aforementioned events, as well as validator set updates (if any).
* `Precommit(ctx sdk.Context)`: During [`Commit`](../../develop/advanced-concepts/00-baseapp.md#commit), this function is called from `BaseApp` immediately before the [`deliverState`](../../develop/advanced-concepts/00-baseapp.md#state-updates) is written to the underlying [`rootMultiStore`](../../develop/advanced-concepts/04-store.md#commitkvstore) and, in turn calls the `Precommit` function of each modules implementing the `HasPrecommit` interface, in the order defined in `OrderPrecommiters`. It creates a child [context](../../develop/advanced-concepts/02-context.md) where the underlying `CacheMultiStore` is that of the newly committed block's [`deliverState`](../../develop/advanced-concepts/00-baseapp.md#state-updates).
* `PrepareCheckState(ctx sdk.Context)`: During [`Commit`](../../develop/advanced-concepts/00-baseapp.md#commit), this function is called from `BaseApp` immediately after the [`deliverState`](../../develop/advanced-concepts/00-baseapp.md#state-updates) is written to the underlying [`rootMultiStore`](../../develop/advanced-concepts/04-store.md#commitmultistore) and, in turn calls the `PrepareCheckState` function of each module implementing the `HasPrepareCheckState` interface, in the order defined in `OrderPrepareCheckStaters`. It creates a child [context](../../develop/advanced-concepts/02-context.md) where the underlying `CacheMultiStore` is that of the next block's [`checkState`](../../develop/advanced-concepts/00-baseapp.md#state-updates). Writes to this state will be present in the [`checkState`](../../develop/advanced-concepts/00-baseapp.md#state-updates) of the next block, and therefore this method can be used to prepare the `checkState` for the next block.

Here's an example of a concrete integration within an `simapp`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L386-L432
```

This is the same example from `runtime` (the package that powers app v2):

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/runtime/module.go#L77
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/runtime/module.go#L87
```
