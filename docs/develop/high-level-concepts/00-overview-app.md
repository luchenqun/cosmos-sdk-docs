# Cosmos SDK 应用程序概述

:::note 概要
本文档描述了 Cosmos SDK 应用程序的核心部分，文档中使用一个名为 `app` 的占位应用程序来表示。
:::

## 节点客户端

守护进程，或称为[全节点客户端](../advanced-concepts/03-node.md)，是基于 Cosmos SDK 的区块链的核心进程。网络中的参与者运行此进程来初始化其状态机，与其他全节点连接，并在新区块到来时更新其状态机。

```text
                ^  +-------------------------------+  ^
                |  |                               |  |
                |  |  State-machine = Application  |  |
                |  |                               |  |   Built with Cosmos SDK
                |  |            ^      +           |  |
                |  +----------- | ABCI | ----------+  v
                |  |            +      v           |  ^
                |  |                               |  |
Blockchain Node |  |           Consensus           |  |
                |  |                               |  |
                |  +-------------------------------+  |   CometBFT
                |  |                               |  |
                |  |           Networking          |  |
                |  |                               |  |
                v  +-------------------------------+  v
```

区块链全节点以二进制形式呈现，通常以 `-d` 为后缀（例如 `appd` 表示 `app`，`gaiad` 表示 `gaia`）。此二进制文件通过在 `./cmd/appd/` 目录下运行一个简单的 [`main.go`](../advanced-concepts/03-node.md#main-function) 函数来构建。通常，此操作通过 [Makefile](#dependencies-and-makefile) 完成。

构建主二进制文件后，可以通过运行 [`start` 命令](../advanced-concepts/03-node.md#start-command) 来启动节点。此命令函数主要执行以下三个操作：

1. 创建一个在 [`app.go`](#core-application-file) 中定义的状态机实例。
2. 使用从 `~/.app/data` 文件夹中存储的 `db` 提取的最新已知状态来初始化状态机。此时，状态机的高度为 `appBlockHeight`。
3. 创建并启动一个新的 CometBFT 实例。节点与其对等节点进行握手，获取它们的最新 `blockHeight`，如果它大于本地的 `appBlockHeight`，则回放区块以同步到此高度。节点从创世块开始，CometBFT 通过 ABCI 向 `app` 发送一个 `InitChain` 消息，触发 [`InitChainer`](#initchainer)。

:::note
启动 CometBFT 实例时，创世文件的高度为 `0`，创世文件中的状态在块高度 `1` 处提交。查询节点状态时，查询块高度为 `0` 将返回错误。
:::

## 核心应用程序文件

通常情况下，状态机的核心在一个名为 `app.go` 的文件中定义。该文件主要包含了**应用程序的类型定义**和**创建和初始化应用程序的函数**。

### 应用程序的类型定义

在 `app.go` 中首先定义的是应用程序的 `type`。它通常由以下几个部分组成：

* **对 [`baseapp`](../advanced-concepts/00-baseapp.md) 的引用。** 在 `app.go` 中定义的自定义应用程序是 `baseapp` 的扩展。当 CometBFT 将交易中继到应用程序时，`app` 使用 `baseapp` 的方法将它们路由到适当的模块。`baseapp` 实现了应用程序的大部分核心逻辑，包括所有的 [ABCI 方法](https://docs.cometbft.com/v0.37/spec/abci/) 和 [路由逻辑](../advanced-concepts/00-baseapp.md#routing)。
* **存储键的列表**。[存储](../advanced-concepts/04-store.md)，其中包含整个状态，是在 Cosmos SDK 中实现为 [`multistore`](../advanced-concepts/04-store.md#multistore)（即存储的存储）。每个模块在 multistore 中使用一个或多个存储来持久化其部分状态。可以使用在 `app` 类型中声明的特定键访问这些存储。这些键和 `keepers` 是 Cosmos SDK 中 [对象能力模型](../advanced-concepts/10-ocap.md) 的核心。
* **模块的 `keeper` 列表**。每个模块定义了一个称为 [`keeper`](../../integrate/building-modules/06-keeper.md) 的抽象，用于处理该模块的存储的读写操作。一个模块的 `keeper` 方法可以从其他模块中调用（如果经过授权），这就是为什么它们在应用程序的类型中声明并作为接口导出给其他模块，以便后者只能访问经过授权的函数。
* **对 [`appCodec`](../advanced-concepts/06-encoding.md) 的引用**。应用程序的 `appCodec` 用于序列化和反序列化数据结构以便存储，因为存储只能持久化 `[]bytes`。默认的编解码器是 [Protocol Buffers](../advanced-concepts/06-encoding.md)。
* **对 [`legacyAmino`](../advanced-concepts/06-encoding.md) 编解码器的引用**。Cosmos SDK 的某些部分尚未迁移到使用上述的 `appCodec`，仍然硬编码为使用 Amino。其他部分明确使用 Amino 以实现向后兼容性。因此，应用程序仍然持有对传统 Amino 编解码器的引用。请注意，Amino 编解码器将在即将发布的版本中从 SDK 中移除。
* **对 [模块管理器](../../integrate/building-modules/01-module-manager.md#manager) 和 [基本模块管理器](../../integrate/building-modules/01-module-manager.md#basicmanager) 的引用**。模块管理器是一个包含应用程序模块列表的对象。它简化了与这些模块相关的操作，如注册它们的 [`Msg` 服务](../advanced-concepts/00-baseapp.md#msg-services) 和 [gRPC `Query` 服务](../advanced-concepts/00-baseapp.md#grpc-query-services)，或者为各种函数（如 [`InitChainer`](#initchainer)、[`BeginBlocker` 和 `EndBlocker`](#beginblocker-and-endblocker)）设置模块之间的执行顺序。

请看一个来自 `simapp` 的应用类型定义示例，`simapp` 是用于演示和测试目的的 Cosmos SDK 自带应用程序：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L161-L203
```

### 构造函数

在 `app.go` 中还定义了构造函数，该函数构造了一个新的应用程序，其类型在前面的部分中定义。该函数必须满足 `AppCreator` 签名，以便在应用程序的守护进程命令 [`start`](../advanced-concepts/03-node.md#start-command) 中使用。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/types/app.go#L64-L66
```

该函数执行的主要操作如下：

* 实例化一个新的 [`codec`](../advanced-concepts/06-encoding.md) 并使用 [基本管理器](../../integrate/building-modules/01-module-manager.md#basicmanager) 初始化应用程序的每个模块的 `codec`。
* 使用一个 `baseapp` 实例、一个 `codec` 和所有适当的存储键实例化一个新的应用程序。
* 使用每个应用程序模块的 `NewKeeper` 函数实例化应用程序中定义的所有 [`keeper`](#keeper) 对象。请注意，必须按正确的顺序实例化 keepers，因为一个模块的 `NewKeeper` 可能需要引用另一个模块的 `keeper`。
* 使用应用程序的每个模块的 [`AppModule`](#application-module-interface) 对象实例化应用程序的 [模块管理器](../../integrate/building-modules/01-module-manager.md#manager)。
* 使用模块管理器，初始化应用程序的 [`Msg` 服务](../advanced-concepts/00-baseapp.md#msg-services)、[gRPC `Query` 服务](../advanced-concepts/00-baseapp.md#grpc-query-services)、[旧版 `Msg` 路由](../advanced-concepts/00-baseapp.md#routing) 和 [旧版查询路由](../advanced-concepts/00-baseapp.md#query-routing)。当通过 CometBFT 通过 ABCI 将事务中继到应用程序时，它将使用此处定义的路由将事务路由到适当模块的 [`Msg` 服务](#msg-services)。同样，当应用程序接收到 gRPC 查询请求时，它将使用此处定义的 gRPC 路由将请求路由到适当模块的 [`gRPC 查询服务`](#grpc-query-services)。Cosmos SDK 仍然支持旧版 `Msg` 和旧版 CometBFT 查询，它们分别使用旧版 `Msg` 路由和旧版查询路由进行路由。
* 使用模块管理器，注册应用程序模块的 [不变量](../../integrate/building-modules/07-invariants.md)。不变量是在每个区块结束时评估的变量（例如代币的总供应量）。检查不变量的过程是通过一个特殊的模块（称为 [`InvariantsRegistry`](../../integrate/building-modules/07-invariants.md#invariant-registry)）完成的。不变量的值应该等于模块中定义的预测值。如果值与预测值不同，将触发不变量注册表中定义的特殊逻辑（通常是停止链）。这对于确保没有关键错误被忽视并产生难以修复的长期影响非常有用。
* 使用模块管理器，设置每个 [应用程序模块](#application-module-interface) 的 `InitGenesis`、`BeginBlocker` 和 `EndBlocker` 函数的执行顺序。请注意，并非所有模块都实现了这些函数。
* 设置剩余的应用程序参数：
    * [`InitChainer`](#initchainer)：用于在首次启动应用程序时进行初始化。
    * [`BeginBlocker`、`EndBlocker`](#beginblocker-and-endlbocker)：在每个区块的开始和结束时调用。
    * [`anteHandler`](../advanced-concepts/00-baseapp.md#antehandler)：用于处理费用和签名验证。
* 挂载存储。
* 返回应用程序。

请注意，构造函数仅创建应用程序的实例，而实际状态要么从 `~/.app/data` 文件夹中传递（如果节点重新启动），要么从创世文件生成（如果节点首次启动）。

以下是来自 `simapp` 的应用程序构造函数示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L214-L522
```

### InitChainer

`InitChainer` 是一个函数，用于从创世文件初始化应用程序的状态（即初始账户的代币余额）。当应用程序接收到来自 CometBFT 引擎的 `InitChain` 消息时调用该函数，这发生在节点在 `appBlockHeight == 0`（即创世块）启动时。应用程序必须通过 [`SetInitChainer`](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/baseapp#BaseApp.SetInitChainer) 方法在其 [构造函数](#constructor-function) 中设置 `InitChainer`。

通常，`InitChainer` 主要由应用程序模块的 [`InitGenesis`](../../integrate/building-modules/08-genesis.md#initgenesis) 函数组成。这是通过调用模块管理器的 `InitGenesis` 函数来完成的，模块管理器又会调用其包含的每个模块的 `InitGenesis` 函数。请注意，必须在模块管理器中使用 [模块管理器](../../integrate/building-modules/01-module-manager.md) 的 `SetOrderInitGenesis` 方法设置调用模块的 `InitGenesis` 函数的顺序。这是在 [应用程序的构造函数](#constructor-function) 中完成的，而且必须在 `SetInitChainer` 之前调用 `SetOrderInitGenesis`。

以下是来自 `simapp` 的 `InitChainer` 示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L569-L577
```

### BeginBlocker 和 EndBlocker

Cosmos SDK 提供了开发人员实现代码自动执行的可能性作为其应用程序的一部分。这是通过两个名为 `BeginBlocker` 和 `EndBlocker` 的函数实现的。它们在应用程序接收到来自 CometBFT 引擎的 `BeginBlock` 和 `EndBlock` 消息时分别调用，这分别发生在每个区块的开始和结束时。应用程序必须通过 [`SetBeginBlocker`](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/baseapp#BaseApp.SetBeginBlocker) 和 [`SetEndBlocker`](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/baseapp#BaseApp.SetEndBlocker) 方法在其 [构造函数](#constructor-function) 中设置 `BeginBlocker` 和 `EndBlocker`。

一般来说，`BeginBlocker` 和 `EndBlocker` 函数主要由应用程序模块的 [`BeginBlock` 和 `EndBlock`](../../integrate/building-modules/05-beginblock-endblock.md) 函数组成。这是通过调用模块管理器的 `BeginBlock` 和 `EndBlock` 函数来实现的，模块管理器又会调用其包含的每个模块的 `BeginBlock` 和 `EndBlock` 函数。请注意，模块的 `BeginBlock` 和 `EndBlock` 函数的调用顺序必须在模块管理器中使用 `SetOrderBeginBlockers` 和 `SetOrderEndBlockers` 方法进行设置。这是通过 [模块管理器](../../integrate/building-modules/01-module-manager.md) 在 [应用程序的构造函数](#constructor-function) 中完成的，而且必须在调用 `SetBeginBlocker` 和 `SetEndBlocker` 函数之前调用 `SetOrderBeginBlockers` 和 `SetOrderEndBlockers` 方法。

值得一提的是，需要记住应用程序特定的区块链是确定性的。开发人员在 `BeginBlocker` 或 `EndBlocker` 中不能引入非确定性，并且还必须小心不要使它们过于计算密集，因为 [gas](04-gas-fees.md) 不限制 `BeginBlocker` 和 `EndBlocker` 执行的成本。

以下是 `simapp` 中 `BeginBlocker` 和 `EndBlocker` 函数的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L555-L563
```

### 注册编解码器

`EncodingConfig` 结构是 `app.go` 文件的最后一个重要部分。该结构的目标是定义在整个应用程序中将使用的编解码器。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/params/encoding.go#L9-L16
```

以下是每个字段的描述：

* `InterfaceRegistry`：`InterfaceRegistry` 用于 Protobuf 编解码器处理使用 [`google.protobuf.Any`](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/any.proto) 编码和解码（我们也称之为 "解包"）的接口。`Any` 可以被视为一个包含 `type_url`（实现接口的具体类型的名称）和 `value`（其编码字节）的结构体。`InterfaceRegistry` 提供了一种注册接口和实现的机制，可以安全地从 `Any` 中解包。每个应用程序模块都实现了 `RegisterInterfaces` 方法，用于注册模块自己的接口和实现。
    * 您可以在 [ADR-019](../../integrate/architecture/adr-019-protobuf-state-encoding.md) 中了解更多关于 `Any` 的信息。
    * 更详细地说，Cosmos SDK 使用了 Protobuf 规范的一个实现，称为 [`gogoprotobuf`](https://github.com/cosmos/gogoproto)。默认情况下，[gogo protobuf 实现的 `Any`](https://pkg.go.dev/github.com/cosmos/gogoproto/types) 使用[全局类型注册](https://github.com/cosmos/gogoproto/blob/master/proto/properties.go#L540)将在 `Any` 中打包的值解码为具体的 Go 类型。这引入了一个漏洞，即依赖树中的任何恶意模块都可以向全局 protobuf 注册表注册一个类型，并导致在引用它的事务中加载和解组它。有关更多信息，请参阅 [ADR-019](../../integrate/architecture/adr-019-protobuf-state-encoding.md)。
* `Codec`：Cosmos SDK 中默认使用的编解码器。它由一个用于编解码状态的 `BinaryCodec` 和一个用于向用户输出数据的 `JSONCodec` 组成（例如，在 [CLI](#cli) 中）。默认情况下，SDK 使用 Protobuf 作为 `Codec`。
* `TxConfig`：`TxConfig` 定义了一个客户端可以使用的接口，用于生成应用程序定义的具体事务类型。目前，SDK 处理两种事务类型：`SIGN_MODE_DIRECT`（使用 Protobuf 二进制作为传输编码）和 `SIGN_MODE_LEGACY_AMINO_JSON`（依赖于 Amino）。在[这里](../advanced-concepts/01-transactions.md)了解更多关于事务的信息。
* `Amino`：Cosmos SDK 的一些旧部分仍然使用 Amino 进行向后兼容。每个模块都会暴露一个 `RegisterLegacyAmino` 方法，用于在 Amino 中注册模块的特定类型。这个 `Amino` 编解码器不应再被应用程序开发人员使用，并且将在未来的版本中被移除。

应用程序应该创建自己的编码配置。
请参考`simapp`中的`simappparams.EncodingConfig`示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L731-L738
```

## 模块

[模块](../../integrate/building-modules/00-intro.md) 是 Cosmos SDK 应用的核心和灵魂。它们可以被视为嵌套在状态机中的状态机。当一个交易从底层的 CometBFT 引擎通过 ABCI 被传递到应用程序时，它会被 [`baseapp`](../advanced-concepts/00-baseapp.md) 路由到适当的模块以进行处理。这种范式使开发人员能够轻松构建复杂的状态机，因为他们通常已经存在所需的大多数模块。**对于开发人员来说，构建 Cosmos SDK 应用程序所涉及的大部分工作都围绕着构建自定义模块，并将其与已经存在的模块集成到一个一致的应用程序中**。在应用程序目录中，通常的做法是将模块存储在 `x/` 文件夹中（不要与 Cosmos SDK 的 `x/` 文件夹混淆，后者包含已构建的模块）。

### 应用程序模块接口

模块必须实现 Cosmos SDK 中定义的[接口](../../integrate/building-modules/01-module-manager.md#application-module-interfaces)，[`AppModuleBasic`](../../integrate/building-modules/01-module-manager.md#appmodulebasic) 和 [`AppModule`](../../integrate/building-modules/01-module-manager.md#appmodule)。前者实现模块的基本非依赖元素，如 `codec`，而后者处理模块方法的大部分内容（包括需要引用其他模块的 `keeper` 的方法）。`AppModule` 和 `AppModuleBasic` 类型通常在一个名为 `module.go` 的文件中定义。

`AppModule` 在模块上公开了一系列有用的方法，以便将模块组合成一个一致的应用程序。这些方法是从[`模块管理器`](../../integrate/building-modules/01-module-manager.md#manager)中调用的，该管理器管理应用程序的模块集合。

### `Msg` 服务

每个应用模块都定义了两个 [Protobuf 服务](https://developers.google.com/protocol-buffers/docs/proto#services)：一个 `Msg` 服务用于处理消息，一个 gRPC `Query` 服务用于处理查询。如果我们将模块视为状态机，那么 `Msg` 服务就是一组状态转换的 RPC 方法。
每个 Protobuf `Msg` 服务方法与一个 Protobuf 请求类型是一对一关联的，该请求类型必须实现 `sdk.Msg` 接口。
请注意，`sdk.Msg` 被捆绑在 [交易](../advanced-concepts/01-transactions.md) 中，每个交易包含一个或多个消息。

当一个有效的交易块被全节点接收到时，CometBFT 通过 [`DeliverTx`](https://docs.cometbft.com/v0.37/spec/abci/abci++_app_requirements#specifics-of-responsedelivertx) 将每个交易中继给应用程序。然后，应用程序处理该交易：

1. 在接收到交易后，应用程序首先将其从 `[]byte` 反序列化。
2. 然后，在提取交易中包含的 `Msg` 之前，它会验证交易的一些内容，如[费用支付和签名](04-gas-fees.md#antehandler)。
3. `sdk.Msg` 使用 Protobuf 的 [`Any`](#register-codec) 进行编码。通过分析每个 `Any` 的 `type_url`，baseapp 的 `msgServiceRouter` 将 `sdk.Msg` 路由到相应模块的 `Msg` 服务。
4. 如果消息成功处理，状态将被更新。

更多详细信息，请参阅[交易生命周期](01-tx-lifecycle.md)。

当模块开发者构建自己的模块时，他们会创建自定义的 `Msg` 服务。通常的做法是在 `tx.proto` 文件中定义 `Msg` Protobuf 服务。例如，`x/bank` 模块定义了一个包含两个方法用于转移代币的服务：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L13-L36
```

服务方法使用 `keeper` 来更新模块状态。

每个模块还应该作为 [`AppModule` 接口](#application-module-interface) 的一部分实现 `RegisterServices` 方法。该方法应该调用由生成的 Protobuf 代码提供的 `RegisterMsgServer` 函数。

### gRPC `Query` 服务

gRPC `Query` 服务允许用户使用 [gRPC](https://grpc.io) 查询状态。它们默认启用，并且可以在 [`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml) 文件的 `grpc.enable` 和 `grpc.address` 字段下进行配置。

gRPC `Query` 服务在模块的 Protobuf 定义文件中定义，具体位于 `query.proto` 文件中。`query.proto` 定义文件公开了一个 `Query` [Protobuf 服务](https://developers.google.com/protocol-buffers/docs/proto#services)。每个 gRPC 查询端点对应于 `Query` 服务中以 `rpc` 关键字开头的服务方法。

Protobuf 为每个模块生成了一个 `QueryServer` 接口，其中包含了所有的服务方法。然后，模块的 [`keeper`](#keeper) 需要实现这个 `QueryServer` 接口，通过提供每个服务方法的具体实现来完成。这个具体实现是相应 gRPC 查询端点的处理程序。

最后，每个模块还应该作为 [`AppModule` 接口](#application-module-interface) 的一部分实现 `RegisterServices` 方法。这个方法应该调用由生成的 Protobuf 代码提供的 `RegisterQueryServer` 函数。

### Keeper

[`Keepers`](../../integrate/building-modules/06-keeper.md) 是其模块存储的守门人。要在模块的存储中读取或写入数据，必须通过其 `keeper` 的方法。这是由 Cosmos SDK 的 [对象能力](../advanced-concepts/10-ocap.md) 模型来确保的。只有持有存储键的对象才能访问它，而且只有模块的 `keeper` 应该持有模块存储的键。

`Keepers` 通常在一个名为 `keeper.go` 的文件中定义。它包含了 `keeper` 的类型定义和方法。

`keeper` 的类型定义通常包括以下内容：

* 模块在多存储中的存储键。
* 对其他模块 `keeper` 的引用。只有在 `keeper` 需要访问其他模块的存储（读取或写入）时才需要。
* 对应用程序的编解码器的引用。`keeper` 需要它在存储之前对结构进行编组，或者在检索结构时对其进行解组，因为存储只接受 `[]bytes` 作为值。

除了类型定义之外，`keeper.go` 文件的下一个重要组件是 `keeper` 的构造函数 `NewKeeper`。该函数使用一个 `codec` 实例化一个新的与上述类型相匹配的 `keeper`，并将 `keys` 存储起来，可能还会引用其他模块的 `keeper`。`NewKeeper` 函数是从[应用程序的构造函数](#constructor-function)中调用的。文件的其余部分定义了 `keeper` 的方法，主要是 getter 和 setter。

### 命令行、gRPC 服务和 REST 接口

每个模块都定义了命令行命令、gRPC 服务和 REST 路由，以通过[应用程序接口](#application-interfacev)向最终用户公开。这使得最终用户可以创建在模块中定义的消息类型，或者查询由模块管理的状态的子集。

#### CLI

通常，[与模块相关的命令](../../integrate/building-modules/09-module-interfaces.md#cli)在模块文件夹中的 `client/cli` 文件夹中定义。CLI 将命令分为两类，事务和查询，分别在 `client/cli/tx.go` 和 `client/cli/query.go` 中定义。这两个命令都是基于 [Cobra 库](https://github.com/spf13/cobra) 构建的：

* 事务命令允许用户生成新的事务，以便可以将其包含在块中并最终更新状态。每个在模块中定义的命令都应创建一个命令。该命令使用最终用户提供的参数调用消息的构造函数，并将其包装成一个事务。Cosmos SDK 处理签名和其他事务元数据的添加。
* 查询允许用户查询由模块定义的状态子集。查询命令将查询转发到[应用程序的查询路由器](../advanced-concepts/00-baseapp.md#query-routing)，该路由器将其路由到相应的 `queryRoute` 参数。

#### gRPC

[gRPC](https://grpc.io) 是一个现代的开源高性能 RPC 框架，支持多种语言。它是外部客户端（如钱包、浏览器和其他后端服务）与节点交互的推荐方式。

每个模块都可以暴露称为[服务方法](https://grpc.io/docs/what-is-grpc/core-concepts/#service-definition)的gRPC端点，这些方法在[模块的Protobuf `query.proto`文件](#grpc-query-services)中定义。服务方法由其名称、输入参数和输出响应来定义。然后，模块需要执行以下操作：

* 在`AppModuleBasic`上定义一个`RegisterGRPCGatewayRoutes`方法，将客户端gRPC请求连接到模块内的正确处理程序。
* 对于每个服务方法，定义一个相应的处理程序。处理程序实现了为提供gRPC请求所必需的核心逻辑，并位于`keeper/grpc_query.go`文件中。

#### gRPC-gateway REST端点

某些外部客户端可能不希望使用gRPC。在这种情况下，Cosmos SDK提供了一个gRPC网关服务，将每个gRPC服务公开为相应的REST端点。请参阅[grpc-gateway](https://grpc-ecosystem.github.io/grpc-gateway/)文档以了解更多信息。

REST端点在Protobuf文件中与gRPC服务一起使用Protobuf注释进行定义。希望公开REST查询的模块应向其`rpc`方法添加`google.api.http`注释。默认情况下，SDK中定义的所有REST端点的URL都以`/cosmos/`前缀开头。

Cosmos SDK还提供了一个开发端点，用于为这些REST端点生成[Swagger](https://swagger.io/)定义文件。可以在[`app.toml`](../../user/run-node/01-run-node.md#configuring-the-node-using-apptoml)配置文件中的`api.swagger`键下启用此端点。

## 应用程序接口

[接口](#command-line-grpc-services-and-rest-interfaces)允许最终用户与全节点客户端进行交互。这意味着从全节点查询数据或创建和发送新的交易以由全节点中继，并最终包含在一个区块中。

主要接口是[命令行界面](../advanced-concepts/07-cli.md)。Cosmos SDK应用程序的CLI是通过聚合应用程序使用的每个模块中定义的[CLI命令](#cli)来构建的。应用程序的CLI与守护程序（例如`appd`）相同，并在一个名为`appd/main.go`的文件中定义。该文件包含以下内容：

* **一个 `main()` 函数**，用于构建 `appd` 接口客户端。该函数在构建命令之前准备每个命令并将其添加到 `rootCmd` 中。在 `appd` 的根目录下，该函数添加了通用命令，如 `status`、`keys` 和 `config`，查询命令，交易命令和 `rest-server`。
* **查询命令**，通过调用 `queryCmd` 函数添加。该函数返回一个 Cobra 命令，其中包含在应用程序的每个模块中定义的查询命令（作为 `main()` 函数中的 `sdk.ModuleClients` 数组传递），以及一些其他较低级别的查询命令，如块或验证器查询。通过使用 CLI 的命令 `appd query [query]` 来调用查询命令。
* **交易命令**，通过调用 `txCmd` 函数添加。与 `queryCmd` 类似，该函数返回一个 Cobra 命令，其中包含在应用程序的每个模块中定义的交易命令，以及较低级别的交易命令，如交易签名或广播。通过使用 CLI 的命令 `appd tx [tx]` 来调用交易命令。

请参阅来自 [Cosmos Hub](https://github.com/cosmos/gaia) 的应用程序主命令行文件的示例。

```go reference
https://github.com/cosmos/gaia/blob/26ae7c2/cmd/gaiad/cmd/root.go#L39-L80
```

## 依赖和 Makefile

此部分是可选的，因为开发人员可以自由选择其依赖管理器和项目构建方法。尽管如此，当前最常用的版本控制框架是 [`go.mod`](https://github.com/golang/go/wiki/Modules)。它确保应用程序中使用的每个库都以正确的版本导入。

以下是 [Cosmos Hub](https://github.com/cosmos/gaia) 的 `go.mod`，供参考。

```go reference
https://github.com/cosmos/gaia/blob/26ae7c2/go.mod#L1-L28
```

通常使用 [Makefile](https://en.wikipedia.org/wiki/Makefile) 来构建应用程序。Makefile 主要确保在构建应用程序的两个入口点 [`appd`](#node-client) 和 [`appd`](#application-interface) 之前运行 `go.mod`。

这是[Cosmos Hub Makefile](https://github.com/cosmos/gaia/blob/main/Makefile)的示例。


# Overview of a  Cosmos SDK Application

:::note Synopsis
This document describes the core parts of a Cosmos SDK application, represented throughout the document as a placeholder application named `app`.
:::

## Node Client

The Daemon, or [Full-Node Client](../advanced-concepts/03-node.md), is the core process of a Cosmos SDK-based blockchain. Participants in the network run this process to initialize their state-machine, connect with other full-nodes, and update their state-machine as new blocks come in.

```text
                ^  +-------------------------------+  ^
                |  |                               |  |
                |  |  State-machine = Application  |  |
                |  |                               |  |   Built with Cosmos SDK
                |  |            ^      +           |  |
                |  +----------- | ABCI | ----------+  v
                |  |            +      v           |  ^
                |  |                               |  |
Blockchain Node |  |           Consensus           |  |
                |  |                               |  |
                |  +-------------------------------+  |   CometBFT
                |  |                               |  |
                |  |           Networking          |  |
                |  |                               |  |
                v  +-------------------------------+  v
```

The blockchain full-node presents itself as a binary, generally suffixed by `-d` for "daemon" (e.g. `appd` for `app` or `gaiad` for `gaia`). This binary is built by running a simple [`main.go`](../advanced-concepts/03-node.md#main-function) function placed in `./cmd/appd/`. This operation usually happens through the [Makefile](#dependencies-and-makefile).

Once the main binary is built, the node can be started by running the [`start` command](../advanced-concepts/03-node.md#start-command). This command function primarily does three things:

1. Create an instance of the state-machine defined in [`app.go`](#core-application-file).
2. Initialize the state-machine with the latest known state, extracted from the `db` stored in the `~/.app/data` folder. At this point, the state-machine is at height `appBlockHeight`.
3. Create and start a new CometBFT instance. Among other things, the node performs a handshake with its peers. It gets the latest `blockHeight` from them and replays blocks to sync to this height if it is greater than the local `appBlockHeight`. The node starts from genesis and CometBFT sends an `InitChain` message via the ABCI to the `app`, which triggers the [`InitChainer`](#initchainer).

:::note
When starting a CometBFT instance, the genesis file is the `0` height and the state within the genesis file is committed at block height `1`. When querying the state of the node, querying block height 0 will return an error.
::: 

## Core Application File

In general, the core of the state-machine is defined in a file called `app.go`. This file mainly contains the **type definition of the application** and functions to **create and initialize it**.

### Type Definition of the Application

The first thing defined in `app.go` is the `type` of the application. It is generally comprised of the following parts:

* **A reference to [`baseapp`](../advanced-concepts/00-baseapp.md).** The custom application defined in `app.go` is an extension of `baseapp`. When a transaction is relayed by CometBFT to the application, `app` uses `baseapp`'s methods to route them to the appropriate module. `baseapp` implements most of the core logic for the application, including all the [ABCI methods](https://docs.cometbft.com/v0.37/spec/abci/) and the [routing logic](../advanced-concepts/00-baseapp.md#routing).
* **A list of store keys**. The [store](../advanced-concepts/04-store.md), which contains the entire state, is implemented as a [`multistore`](../advanced-concepts/04-store.md#multistore) (i.e. a store of stores) in the Cosmos SDK. Each module uses one or multiple stores in the multistore to persist their part of the state. These stores can be accessed with specific keys that are declared in the `app` type. These keys, along with the `keepers`, are at the heart of the [object-capabilities model](../advanced-concepts/10-ocap.md) of the Cosmos SDK.
* **A list of module's `keeper`s.** Each module defines an abstraction called [`keeper`](../../integrate/building-modules/06-keeper.md), which handles reads and writes for this module's store(s). The `keeper`'s methods of one module can be called from other modules (if authorized), which is why they are declared in the application's type and exported as interfaces to other modules so that the latter can only access the authorized functions.
* **A reference to an [`appCodec`](../advanced-concepts/06-encoding.md).** The application's `appCodec` is used to serialize and deserialize data structures in order to store them, as stores can only persist `[]bytes`. The default codec is [Protocol Buffers](../advanced-concepts/06-encoding.md).
* **A reference to a [`legacyAmino`](../advanced-concepts/06-encoding.md) codec.** Some parts of the Cosmos SDK have not been migrated to use the `appCodec` above, and are still hardcoded to use Amino. Other parts explicitly use Amino for backwards compatibility. For these reasons, the application still holds a reference to the legacy Amino codec. Please note that the Amino codec will be removed from the SDK in the upcoming releases.
* **A reference to a [module manager](../../integrate/building-modules/01-module-manager.md#manager)** and a [basic module manager](../../integrate/building-modules/01-module-manager.md#basicmanager). The module manager is an object that contains a list of the application's modules. It facilitates operations related to these modules, like registering their [`Msg` service](../advanced-concepts/00-baseapp.md#msg-services) and [gRPC `Query` service](../advanced-concepts/00-baseapp.md#grpc-query-services), or setting the order of execution between modules for various functions like [`InitChainer`](#initchainer), [`BeginBlocker` and `EndBlocker`](#beginblocker-and-endblocker).

See an example of application type definition from `simapp`, the Cosmos SDK's own app used for demo and testing purposes:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L161-L203
```

### Constructor Function

Also defined in `app.go` is the constructor function, which constructs a new application of the type defined in the preceding section. The function must fulfill the `AppCreator` signature in order to be used in the [`start` command](../advanced-concepts/03-node.md#start-command) of the application's daemon command.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/server/types/app.go#L64-L66
```

Here are the main actions performed by this function:

* Instantiate a new [`codec`](../advanced-concepts/06-encoding.md) and initialize the `codec` of each of the application's modules using the [basic manager](../../integrate/building-modules/01-module-manager.md#basicmanager).
* Instantiate a new application with a reference to a `baseapp` instance, a codec, and all the appropriate store keys.
* Instantiate all the [`keeper`](#keeper) objects defined in the application's `type` using the `NewKeeper` function of each of the application's modules. Note that keepers must be instantiated in the correct order, as the `NewKeeper` of one module might require a reference to another module's `keeper`.
* Instantiate the application's [module manager](../../integrate/building-modules/01-module-manager.md#manager) with the [`AppModule`](#application-module-interface) object of each of the application's modules.
* With the module manager, initialize the application's [`Msg` services](../advanced-concepts/00-baseapp.md#msg-services), [gRPC `Query` services](../advanced-concepts/00-baseapp.md#grpc-query-services), [legacy `Msg` routes](../advanced-concepts/00-baseapp.md#routing), and [legacy query routes](../advanced-concepts/00-baseapp.md#query-routing). When a transaction is relayed to the application by CometBFT via the ABCI, it is routed to the appropriate module's [`Msg` service](#msg-services) using the routes defined here. Likewise, when a gRPC query request is received by the application, it is routed to the appropriate module's [`gRPC query service`](#grpc-query-services) using the gRPC routes defined here. The Cosmos SDK still supports legacy `Msg`s and legacy CometBFT queries, which are routed using the legacy `Msg` routes and the legacy query routes, respectively.
* With the module manager, register the [application's modules' invariants](../../integrate/building-modules/07-invariants.md). Invariants are variables (e.g. total supply of a token) that are evaluated at the end of each block. The process of checking invariants is done via a special module called the [`InvariantsRegistry`](../../integrate/building-modules/07-invariants.md#invariant-registry). The value of the invariant should be equal to a predicted value defined in the module. Should the value be different than the predicted one, special logic defined in the invariant registry is triggered (usually the chain is halted). This is useful to make sure that no critical bug goes unnoticed, producing long-lasting effects that are hard to fix.
* With the module manager, set the order of execution between the `InitGenesis`, `BeginBlocker`, and `EndBlocker` functions of each of the [application's modules](#application-module-interface). Note that not all modules implement these functions.
* Set the remaining application parameters:
    * [`InitChainer`](#initchainer): used to initialize the application when it is first started.
    * [`BeginBlocker`, `EndBlocker`](#beginblocker-and-endlbocker): called at the beginning and at the end of every block.
    * [`anteHandler`](../advanced-concepts/00-baseapp.md#antehandler): used to handle fees and signature verification.
* Mount the stores.
* Return the application.

Note that the constructor function only creates an instance of the app, while the actual state is either carried over from the `~/.app/data` folder if the node is restarted, or generated from the genesis file if the node is started for the first time.

See an example of application constructor from `simapp`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L214-L522
```

### InitChainer

The `InitChainer` is a function that initializes the state of the application from a genesis file (i.e. token balances of genesis accounts). It is called when the application receives the `InitChain` message from the CometBFT engine, which happens when the node is started at `appBlockHeight == 0` (i.e. on genesis). The application must set the `InitChainer` in its [constructor](#constructor-function) via the [`SetInitChainer`](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/baseapp#BaseApp.SetInitChainer) method.

In general, the `InitChainer` is mostly composed of the [`InitGenesis`](../../integrate/building-modules/08-genesis.md#initgenesis) function of each of the application's modules. This is done by calling the `InitGenesis` function of the module manager, which in turn calls the `InitGenesis` function of each of the modules it contains. Note that the order in which the modules' `InitGenesis` functions must be called has to be set in the module manager using the [module manager's](../../integrate/building-modules/01-module-manager.md) `SetOrderInitGenesis` method. This is done in the [application's constructor](#constructor-function), and the `SetOrderInitGenesis` has to be called before the `SetInitChainer`.

See an example of an `InitChainer` from `simapp`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L569-L577
```

### BeginBlocker and EndBlocker

The Cosmos SDK offers developers the possibility to implement automatic execution of code as part of their application. This is implemented through two functions called `BeginBlocker` and `EndBlocker`. They are called when the application receives the `BeginBlock` and `EndBlock` messages from the CometBFT engine, which happens respectively at the beginning and at the end of each block. The application must set the `BeginBlocker` and `EndBlocker` in its [constructor](#constructor-function) via the [`SetBeginBlocker`](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/baseapp#BaseApp.SetBeginBlocker) and [`SetEndBlocker`](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/baseapp#BaseApp.SetEndBlocker) methods.

In general, the `BeginBlocker` and `EndBlocker` functions are mostly composed of the [`BeginBlock` and `EndBlock`](../../integrate/building-modules/05-beginblock-endblock.md) functions of each of the application's modules. This is done by calling the `BeginBlock` and `EndBlock` functions of the module manager, which in turn calls the `BeginBlock` and `EndBlock` functions of each of the modules it contains. Note that the order in which the modules' `BeginBlock` and `EndBlock` functions must be called has to be set in the module manager using the `SetOrderBeginBlockers` and `SetOrderEndBlockers` methods, respectively. This is done via the [module manager](../../integrate/building-modules/01-module-manager.md) in the [application's constructor](#constructor-function), and the `SetOrderBeginBlockers` and `SetOrderEndBlockers` methods have to be called before the `SetBeginBlocker` and `SetEndBlocker` functions.

As a sidenote, it is important to remember that application-specific blockchains are deterministic. Developers must be careful not to introduce non-determinism in `BeginBlocker` or `EndBlocker`, and must also be careful not to make them too computationally expensive, as [gas](04-gas-fees.md) does not constrain the cost of `BeginBlocker` and `EndBlocker` execution.

See an example of `BeginBlocker` and `EndBlocker` functions from `simapp`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L555-L563
```

### Register Codec

The `EncodingConfig` structure is the last important part of the `app.go` file. The goal of this structure is to define the codecs that will be used throughout the app.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/params/encoding.go#L9-L16
```

Here are descriptions of what each of the four fields means:

* `InterfaceRegistry`: The `InterfaceRegistry` is used by the Protobuf codec to handle interfaces that are encoded and decoded (we also say "unpacked") using [`google.protobuf.Any`](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/any.proto). `Any` could be thought as a struct that contains a `type_url` (name of a concrete type implementing the interface) and a `value` (its encoded bytes). `InterfaceRegistry` provides a mechanism for registering interfaces and implementations that can be safely unpacked from `Any`. Each application module implements the `RegisterInterfaces` method that can be used to register the module's own interfaces and implementations.
    * You can read more about `Any` in [ADR-019](../../integrate/architecture/adr-019-protobuf-state-encoding.md).
    * To go more into details, the Cosmos SDK uses an implementation of the Protobuf specification called [`gogoprotobuf`](https://github.com/cosmos/gogoproto). By default, the [gogo protobuf implementation of `Any`](https://pkg.go.dev/github.com/cosmos/gogoproto/types) uses [global type registration](https://github.com/cosmos/gogoproto/blob/master/proto/properties.go#L540) to decode values packed in `Any` into concrete Go types. This introduces a vulnerability where any malicious module in the dependency tree could register a type with the global protobuf registry and cause it to be loaded and unmarshaled by a transaction that referenced it in the `type_url` field. For more information, please refer to [ADR-019](../../integrate/architecture/adr-019-protobuf-state-encoding.md).
* `Codec`: The default codec used throughout the Cosmos SDK. It is composed of a `BinaryCodec` used to encode and decode state, and a `JSONCodec` used to output data to the users (for example, in the [CLI](#cli)). By default, the SDK uses Protobuf as `Codec`.
* `TxConfig`: `TxConfig` defines an interface a client can utilize to generate an application-defined concrete transaction type. Currently, the SDK handles two transaction types: `SIGN_MODE_DIRECT` (which uses Protobuf binary as over-the-wire encoding) and `SIGN_MODE_LEGACY_AMINO_JSON` (which depends on Amino). Read more about transactions [here](../advanced-concepts/01-transactions.md).
* `Amino`: Some legacy parts of the Cosmos SDK still use Amino for backwards-compatibility. Each module exposes a `RegisterLegacyAmino` method to register the module's specific types within Amino. This `Amino` codec should not be used by app developers anymore, and will be removed in future releases.

An application should create its own encoding config.
See an example of a `simappparams.EncodingConfig` from `simapp`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L731-L738
```

## Modules

[Modules](../../integrate/building-modules/00-intro.md) are the heart and soul of Cosmos SDK applications. They can be considered as state-machines nested within the state-machine. When a transaction is relayed from the underlying CometBFT engine via the ABCI to the application, it is routed by [`baseapp`](../advanced-concepts/00-baseapp.md) to the appropriate module in order to be processed. This paradigm enables developers to easily build complex state-machines, as most of the modules they need often already exist. **For developers, most of the work involved in building a Cosmos SDK application revolves around building custom modules required by their application that do not exist yet, and integrating them with modules that do already exist into one coherent application**. In the application directory, the standard practice is to store modules in the `x/` folder (not to be confused with the Cosmos SDK's `x/` folder, which contains already-built modules).

### Application Module Interface

Modules must implement [interfaces](../../integrate/building-modules/01-module-manager.md#application-module-interfaces) defined in the Cosmos SDK, [`AppModuleBasic`](../../integrate/building-modules/01-module-manager.md#appmodulebasic) and [`AppModule`](../../integrate/building-modules/01-module-manager.md#appmodule). The former implements basic non-dependent elements of the module, such as the `codec`, while the latter handles the bulk of the module methods (including methods that require references to other modules' `keeper`s). Both the `AppModule` and `AppModuleBasic` types are, by convention, defined in a file called `module.go`.

`AppModule` exposes a collection of useful methods on the module that facilitates the composition of modules into a coherent application. These methods are called from the [`module manager`](../../integrate/building-modules/01-module-manager.md#manager), which manages the application's collection of modules.

### `Msg` Services

Each application module defines two [Protobuf services](https://developers.google.com/protocol-buffers/docs/proto#services): one `Msg` service to handle messages, and one gRPC `Query` service to handle queries. If we consider the module as a state-machine, then a `Msg` service is a set of state transition RPC methods.
Each Protobuf `Msg` service method is 1:1 related to a Protobuf request type, which must implement `sdk.Msg` interface.
Note that `sdk.Msg`s are bundled in [transactions](../advanced-concepts/01-transactions.md), and each transaction contains one or multiple messages.

When a valid block of transactions is received by the full-node, CometBFT relays each one to the application via [`DeliverTx`](https://docs.cometbft.com/v0.37/spec/abci/abci++_app_requirements#specifics-of-responsedelivertx). Then, the application handles the transaction:

1. Upon receiving the transaction, the application first unmarshalls it from `[]byte`.
2. Then, it verifies a few things about the transaction like [fee payment and signatures](04-gas-fees.md#antehandler) before extracting the `Msg`(s) contained in the transaction.
3. `sdk.Msg`s are encoded using Protobuf [`Any`s](#register-codec). By analyzing each `Any`'s `type_url`, baseapp's `msgServiceRouter` routes the `sdk.Msg` to the corresponding module's `Msg` service.
4. If the message is successfully processed, the state is updated.

For more details, see [transaction lifecycle](01-tx-lifecycle.md).

Module developers create custom `Msg` services when they build their own module. The general practice is to define the `Msg` Protobuf service in a `tx.proto` file. For example, the `x/bank` module defines a service with two methods to transfer tokens:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L13-L36
```

Service methods use `keeper` in order to update the module state.

Each module should also implement the `RegisterServices` method as part of the [`AppModule` interface](#application-module-interface). This method should call the `RegisterMsgServer` function provided by the generated Protobuf code.

### gRPC `Query` Services

gRPC `Query` services allow users to query the state using [gRPC](https://grpc.io). They are enabled by default, and can be configured under the `grpc.enable` and `grpc.address` fields inside [`app.toml`](../../user/run-node/02-interact-node.md#configuring-the-node-using-apptoml).

gRPC `Query` services are defined in the module's Protobuf definition files, specifically inside `query.proto`. The `query.proto` definition file exposes a single `Query` [Protobuf service](https://developers.google.com/protocol-buffers/docs/proto#services). Each gRPC query endpoint corresponds to a service method, starting with the `rpc` keyword, inside the `Query` service.

Protobuf generates a `QueryServer` interface for each module, containing all the service methods. A module's [`keeper`](#keeper) then needs to implement this `QueryServer` interface, by providing the concrete implementation of each service method. This concrete implementation is the handler of the corresponding gRPC query endpoint.

Finally, each module should also implement the `RegisterServices` method as part of the [`AppModule` interface](#application-module-interface). This method should call the `RegisterQueryServer` function provided by the generated Protobuf code.

### Keeper

[`Keepers`](../../integrate/building-modules/06-keeper.md) are the gatekeepers of their module's store(s). To read or write in a module's store, it is mandatory to go through one of its `keeper`'s methods. This is ensured by the [object-capabilities](../advanced-concepts/10-ocap.md) model of the Cosmos SDK. Only objects that hold the key to a store can access it, and only the module's `keeper` should hold the key(s) to the module's store(s).

`Keepers` are generally defined in a file called `keeper.go`. It contains the `keeper`'s type definition and methods.

The `keeper` type definition generally consists of the following:

* **Key(s)** to the module's store(s) in the multistore.
* Reference to **other module's `keepers`**. Only needed if the `keeper` needs to access other module's store(s) (either to read or write from them).
* A reference to the application's **codec**. The `keeper` needs it to marshal structs before storing them, or to unmarshal them when it retrieves them, because stores only accept `[]bytes` as value.

Along with the type definition, the next important component of the `keeper.go` file is the `keeper`'s constructor function, `NewKeeper`. This function instantiates a new `keeper` of the type defined above with a `codec`, stores `keys` and potentially references other modules' `keeper`s as parameters. The `NewKeeper` function is called from the [application's constructor](#constructor-function). The rest of the file defines the `keeper`'s methods, which are primarily getters and setters.

### Command-Line, gRPC Services and REST Interfaces

Each module defines command-line commands, gRPC services, and REST routes to be exposed to the end-user via the [application's interfaces](#application-interfacev). This enables end-users to create messages of the types defined in the module, or to query the subset of the state managed by the module.

#### CLI

Generally, the [commands related to a module](../../integrate/building-modules/09-module-interfaces.md#cli) are defined in a folder called `client/cli` in the module's folder. The CLI divides commands into two categories, transactions and queries, defined in `client/cli/tx.go` and `client/cli/query.go`, respectively. Both commands are built on top of the [Cobra Library](https://github.com/spf13/cobra):

* Transactions commands let users generate new transactions so that they can be included in a block and eventually update the state. One command should be created for each defined in the module. The command calls the constructor of the message with the parameters provided by the end-user, and wraps it into a transaction. The Cosmos SDK handles signing and the addition of other transaction metadata.
* Queries let users query the subset of the state defined by the module. Query commands forward queries to the [application's query router](../advanced-concepts/00-baseapp.md#query-routing), which routes them to the appropriate the `queryRoute` parameter supplied.

#### gRPC

[gRPC](https://grpc.io) is a modern open-source high performance RPC framework that has support in multiple languages. It is the recommended way for external clients (such as wallets, browsers and other backend services) to interact with a node.

Each module can expose gRPC endpoints called [service methods](https://grpc.io/docs/what-is-grpc/core-concepts/#service-definition), which are defined in the [module's Protobuf `query.proto` file](#grpc-query-services). A service method is defined by its name, input arguments, and output response. The module then needs to perform the following actions:

* Define a `RegisterGRPCGatewayRoutes` method on `AppModuleBasic` to wire the client gRPC requests to the correct handler inside the module.
* For each service method, define a corresponding handler. The handler implements the core logic necessary to serve the gRPC request, and is located in the `keeper/grpc_query.go` file.

#### gRPC-gateway REST Endpoints

Some external clients may not wish to use gRPC. In this case, the Cosmos SDK provides a gRPC gateway service, which exposes each gRPC service as a corresponding REST endpoint. Please refer to the [grpc-gateway](https://grpc-ecosystem.github.io/grpc-gateway/) documentation to learn more.

The REST endpoints are defined in the Protobuf files, along with the gRPC services, using Protobuf annotations. Modules that want to expose REST queries should add `google.api.http` annotations to their `rpc` methods. By default, all REST endpoints defined in the SDK have a URL starting with the `/cosmos/` prefix.

The Cosmos SDK also provides a development endpoint to generate [Swagger](https://swagger.io/) definition files for these REST endpoints. This endpoint can be enabled inside the [`app.toml`](../../user/run-node/01-run-node.md#configuring-the-node-using-apptoml) config file, under the `api.swagger` key.

## Application Interface

[Interfaces](#command-line-grpc-services-and-rest-interfaces) let end-users interact with full-node clients. This means querying data from the full-node or creating and sending new transactions to be relayed by the full-node and eventually included in a block.

The main interface is the [Command-Line Interface](../advanced-concepts/07-cli.md). The CLI of a Cosmos SDK application is built by aggregating [CLI commands](#cli) defined in each of the modules used by the application. The CLI of an application is the same as the daemon (e.g. `appd`), and is defined in a file called `appd/main.go`. The file contains the following:

* **A `main()` function**, which is executed to build the `appd` interface client. This function prepares each command and adds them to the `rootCmd` before building them. At the root of `appd`, the function adds generic commands like `status`, `keys`, and `config`, query commands, tx commands, and `rest-server`.
* **Query commands**, which are added by calling the `queryCmd` function. This function returns a Cobra command that contains the query commands defined in each of the application's modules (passed as an array of `sdk.ModuleClients` from the `main()` function), as well as some other lower level query commands such as block or validator queries. Query command are called by using the command `appd query [query]` of the CLI.
* **Transaction commands**, which are added by calling the `txCmd` function. Similar to `queryCmd`, the function returns a Cobra command that contains the tx commands defined in each of the application's modules, as well as lower level tx commands like transaction signing or broadcasting. Tx commands are called by using the command `appd tx [tx]` of the CLI.

See an example of an application's main command-line file from the [Cosmos Hub](https://github.com/cosmos/gaia).

```go reference
https://github.com/cosmos/gaia/blob/26ae7c2/cmd/gaiad/cmd/root.go#L39-L80
```

## Dependencies and Makefile

This section is optional, as developers are free to choose their dependency manager and project building method. That said, the current most used framework for versioning control is [`go.mod`](https://github.com/golang/go/wiki/Modules). It ensures each of the libraries used throughout the application are imported with the correct version.

The following is the `go.mod` of the [Cosmos Hub](https://github.com/cosmos/gaia), provided as an example.

```go reference
https://github.com/cosmos/gaia/blob/26ae7c2/go.mod#L1-L28
```

For building the application, a [Makefile](https://en.wikipedia.org/wiki/Makefile) is generally used. The Makefile primarily ensures that the `go.mod` is run before building the two entrypoints to the application, [`appd`](#node-client) and [`appd`](#application-interface).

Here is an example of the [Cosmos Hub Makefile](https://github.com/cosmos/gaia/blob/main/Makefile).
