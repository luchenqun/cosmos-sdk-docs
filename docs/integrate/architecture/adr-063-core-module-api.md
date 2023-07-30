# ADR 063: 核心模块 API

## 变更日志

* 2022-08-18 初稿
* 2022-12-08 初稿
* 2023-01-24 更新

## 状态

已接受 部分实现

## 摘要

提议引入一个新的核心 API 作为开发 cosmos-sdk 应用程序的方式，该 API 最终将取代现有的 `AppModule` 和 `sdk.Context` 框架，提供一组核心服务和扩展接口。该核心 API 的目标是：

* 更简单
* 更可扩展
* 比当前框架更稳定
* 支持确定性事件和查询
* 支持事件监听器
* [ADR 033: 基于 Protobuf 的模块间通信](adr-033-protobuf-inter-module-comm.md) 客户端

## 背景

从历史上看，模块通过 `AppModule` 和 `AppModuleBasic` 接口将其功能暴露给框架，但这两个接口存在以下问题：

* `AppModule` 和 `AppModuleBasic` 都需要定义和注册，这是不直观的
* 应用程序需要实现完整的接口，即使它们不需要其中的某些部分（虽然有解决方法）
* 接口方法严重依赖不稳定的第三方依赖项，特别是 Comet
* 长期以来，这些接口中存在着过多的遗留必需方法

为了与状态机进行交互，模块需要执行以下组合操作：

* 从应用程序获取存储键
* 在 `sdk.Context` 上调用方法，该方法包含几乎所有模块可用的功能集合

通过将所有状态机功能隔离到 `sdk.Context` 中，模块可用的功能集合与此类型紧密耦合。如果存在上游依赖项（如 Comet）的更改或需要新的功能（如备选存储类型），则需要影响 `sdk.Context` 和所有使用它的模块的更改。此外，所有模块现在都接收 `context.Context`，并需要使用非人性化的解包函数将其转换为 `sdk.Context`。

对于这些接口的任何破坏性更改，例如由 Comet 等第三方依赖项强加的更改，会导致生态系统中的所有模块强制进行同步更新。这意味着几乎不可能拥有一个模块的版本，可以与 2 或 3 个不同版本的 SDK 或另一个模块的 2 或 3 个不同版本一起运行。这种同步耦合会减慢生态系统内的整体开发速度，并导致组件的更新比稳定性和松散耦合性更高的情况下延迟更长。

## 决策

`core` API 提供了一组核心 API，模块可以依赖它与状态机进行交互，并将其功能暴露给状态机。这些 API 的设计原则如下：

* 最小化或消除依赖和无关功能之间的紧密耦合
* API 可以提供长期稳定性保证
* SDK 框架可以以安全且直观的方式进行扩展

核心 API 的设计原则如下：

* 模块想要与状态机进行交互的所有内容都是服务
* 所有服务通过 `context.Context` 协调状态，而不是尝试重新创建 `sdk.Context` 的 "变量集合" 方法
* 所有独立服务都在独立的包中进行隔离，具有最小的 API 和最小的依赖关系
* 核心 API 应该是简约的，并为长期支持（LTS）而设计
* "运行时" 模块将实现核心 API 定义的所有 "核心服务"，并可以处理核心扩展接口暴露的所有模块功能
* 其他非核心和/或非 LTS 服务可以由特定版本的运行时模块或其他模块暴露，遵循相同的设计原则，包括与 Comet 等特定非稳定版本的第三方依赖交互的功能
* 核心 API 不实现 *任何* 功能，它只定义类型
* 遵循稳定的 Go API 兼容性指南：https://go.dev/blog/module-compatibility

"运行时" 模块是指实现组合 ABCI 应用程序的核心功能的任何模块，目前由 `BaseApp` 和 `ModuleManager` 处理。实现核心 API 的运行时模块与核心 API *有意* 分开，以便比 SDK 当前紧密耦合的 `BaseApp` 设计更容易实现并行版本和分叉版本的运行时模块，同时仍然具有高度的组合性和兼容性。

只针对核心 API 构建的模块无需了解运行时、`BaseApp` 或 Comet 的任何版本信息，即可保持兼容性。使用这种模式，可以轻松地将核心主线 SDK 的模块与分叉版本的运行时组合在一起。

这个设计旨在实现兼容依赖版本的矩阵。理想情况下，任何模块的给定版本都与运行时模块和其他兼容模块的多个版本兼容。这将允许根据实战测试有选择性地更新依赖关系。更保守的项目可能希望比更快节奏的项目更新一些依赖关系。

### 核心服务

以下“核心服务”由核心 API 定义。所有有效的运行时模块实现都应通过[依赖注入](adr-057-app-wiring.md)和手动连接为模块提供这些服务的实现。下面描述的各个服务都打包在一个方便的 `appmodule.Service` "bundle service" 中，以便于模块可以声明对单个服务的依赖。

#### 存储服务

存储服务将在 `cosmossdk.io/core/store` 包中定义。

通用的 `store.KVStore` 接口与当前的 SDK `KVStore` 接口相同。存储键已经重构为存储服务，而不是期望上下文了解存储的模式，而是反转模式并允许从通用上下文中检索存储。目前支持的三种类型的存储（常规 kv-store、内存和瞬态）有三个存储服务：

```go
type KVStoreService interface {
    OpenKVStore(context.Context) KVStore
}

type MemoryStoreService interface {
    OpenMemoryStore(context.Context) KVStore
}
type TransientStoreService interface {
    OpenTransientStore(context.Context) KVStore
}
```

模块可以像这样使用这些服务：

```go
func (k msgServer) Send(ctx context.Context, msg *types.MsgSend) (*types.MsgSendResponse, error) {
    store := k.kvStoreSvc.OpenKVStore(ctx)
}
```

与当前的运行时模块实现一样，模块不需要显式命名这些存储键，而是运行时模块将为它们选择一个合适的名称，模块只需要在其依赖注入（或手动）构造函数中请求所需的存储类型。

#### 事件服务

事件 `Service` 将在 `cosmossdk.io/core/event` 包中定义。

事件 `Service` 允许模块发出类型化和传统的非类型化事件：

```go
package event

type Service interface {
  // EmitProtoEvent emits events represented as a protobuf message (as described in ADR 032).
  //
  // Callers SHOULD assume that these events may be included in consensus. These events
  // MUST be emitted deterministically and adding, removing or changing these events SHOULD
  // be considered state-machine breaking.
  EmitProtoEvent(ctx context.Context, event protoiface.MessageV1) error

  // EmitKVEvent emits an event based on an event and kv-pair attributes.
  //
  // These events will not be part of consensus and adding, removing or changing these events is
  // not a state-machine breaking change.
  EmitKVEvent(ctx context.Context, eventType string, attrs ...KVEventAttribute) error

  // EmitProtoEventNonConsensus emits events represented as a protobuf message (as described in ADR 032), without
  // including it in blockchain consensus.
  //
  // These events will not be part of consensus and adding, removing or changing events is
  // not a state-machine breaking change.
  EmitProtoEventNonConsensus(ctx context.Context, event protoiface.MessageV1) error
}
```

使用 `EmitProto` 发出的类型化事件应被视为区块链共识的一部分（它们是否是区块或应用哈希的一部分由运行时指定）。

`EmitKVEvent`和`EmitProtoEventNonConsensus`发出的事件不被视为共识的一部分，其他模块无法观察到这些事件。如果在补丁版本中需要在客户端添加事件，可以使用这些方法。

#### 日志记录器

必须使用`depinject`提供一个日志记录器（`cosmossdk.io/log`），并通过`depinject.In`使其可供模块使用。使用它的模块应该按照SDK中的当前模式，在使用之前添加模块名称。

```go
type ModuleInputs struct {
  depinject.In

  Logger log.Logger
}

func ProvideModule(in ModuleInputs) ModuleOutputs {
  keeper := keeper.NewKeeper(
    in.logger,
  )
}

func NewKeeper(logger log.Logger) Keeper {
  return Keeper{
    logger: logger.With(log.ModuleKey, "x/"+types.ModuleName),
  }
}
```

```

### Core `AppModule` extension interfaces


Modules will provide their core services to the runtime module via extension interfaces built on top of the
`cosmossdk.io/core/appmodule.AppModule` tag interface. This tag interface requires only two empty methods which
allow `depinject` to identify implementors as `depinject.OnePerModule` types and as app module implementations:

```go
type AppModule interface {
  depinject.OnePerModuleType

  // IsAppModule是一个虚拟方法，用于标记一个结构体作为AppModule的实现。
  IsAppModule()
}
```

Other core extension interfaces will be defined in `cosmossdk.io/core` should be supported by valid runtime
implementations.

#### `MsgServer` and `QueryServer` registration

`MsgServer` and `QueryServer` registration is done by implementing the `HasServices` extension interface:

```go
type HasServices interface {
	AppModule

	RegisterServices(grpc.ServiceRegistrar)
}

```

Because of the `cosmos.msg.v1.service` protobuf option, required for `Msg` services, the same `ServiceRegitrar` can be
used to register both `Msg` and query services.

#### Genesis

The genesis `Handler` functions - `DefaultGenesis`, `ValidateGenesis`, `InitGenesis` and `ExportGenesis` - are specified
against the `GenesisSource` and `GenesisTarget` interfaces which will abstract over genesis sources which may be a single
JSON object or collections of JSON objects that can be efficiently streamed.

```go
// GenesisSource是以JSON格式提供创世数据的源。它可以抽象出一个JSON对象或每个字段的单独文件，可以进行流式传输。模块应该为每个所需字段打开一个单独的io.ReadCloser。当字段表示数组时，它们可以高效地进行流式传输。如果没有字段的数据，此函数应返回nil，nil。调用者在使用完读取器后关闭它非常重要。
type GenesisSource = func(field string) (io.ReadCloser, error)

// GenesisTarget是以JSON格式写入创世数据的目标。它可以抽象出一个单独的JSON对象或单独的JSON文件，可以进行流式传输。模块应该为每个字段打开一个单独的io.WriteCloser，并且应该在可能的情况下将字段写入数组，以支持高效迭代。调用者在使用完写入器后关闭写入器并检查错误非常重要。预期将一系列JSON数据写入写入器。
type GenesisTarget = func(field string) (io.WriteCloser, error)
```

All genesis objects for a given module are expected to conform to the semantics of a JSON object.
Each field in the JSON object should be read and written separately to support streaming genesis.
The [ORM](adr-055-orm.md) and [collections](adr-062-collections-state-layer.md) both support
streaming genesis and modules using these frameworks generally do not need to write any manual
genesis code.

To support genesis, modules should implement the `HasGenesis` extension interface:

```go
type HasGenesis interface {
	AppModule

	// DefaultGenesis将此模块的默认创世数据写入目标。
	DefaultGenesis(GenesisTarget) error

// ValidateGenesis 验证从源读取的创世数据。
ValidateGenesis(GenesisSource) error

// InitGenesis 从创世源初始化模块状态。
InitGenesis(context.Context, GenesisSource) error

// ExportGenesis 将模块状态导出到创世目标。
ExportGenesis(context.Context, GenesisTarget) error
}
```

#### Begin and End Blockers

Modules that have functionality that runs before transactions (begin blockers) or after transactions
(end blockers) should implement the has `HasBeginBlocker` and/or `HasEndBlocker` interfaces:

```go
type HasBeginBlocker interface {
  AppModule
  BeginBlock(context.Context) error
}

type HasEndBlocker interface {
  AppModule
  EndBlock(context.Context) error
}
```

The `BeginBlock` and `EndBlock` methods will take a `context.Context`, because:

* most modules don't need Comet information other than `BlockInfo` so we can eliminate dependencies on specific
Comet versions
* for the few modules that need Comet block headers and/or return validator updates, specific versions of the
runtime module will provide specific functionality for interacting with the specific version(s) of Comet
supported

In order for `BeginBlock`, `EndBlock` and `InitGenesis` to send back validator updates and retrieve full Comet
block headers, the runtime module for a specific version of Comet could provide services like this:

```go
type ValidatorUpdateService interface {
    SetValidatorUpdates(context.Context, []abci.ValidatorUpdate)
}
```

Header Service defines a way to get header information about a block. This information is generalized for all implementations: 

```go 

type Service interface {
	GetHeaderInfo(context.Context) Info
}

type Info struct {
	Height int64      // Height 返回区块的高度
	Hash []byte       // Hash 返回区块头的哈希
	Time time.Time    // Time 返回区块的时间
	ChainID string    // ChainId 返回区块的链ID
}
```

Comet Service provides a way to get comet specific information: 

```go
type Service interface {
	GetCometInfo(context.Context) Info
}

type CometInfo struct {
  Evidence []abci.Misbehavior // Misbehavior 返回区块的不良行为
	// ValidatorsHash 返回验证者的哈希
	// 对于Comet，它是下一个验证者的哈希
	ValidatorsHash []byte
	ProposerAddress []byte            // ProposerAddress 返回区块提议者的地址
	DecidedLastCommit abci.CommitInfo // DecidedLastCommit 返回最后的提交信息
}
```

If a user would like to provide a module other information they would need to implement another service like:

```go
type RollKit Interface {
  ...
}
```

We know these types will change at the Comet level and that also a very limited set of modules actually need this
functionality, so they are intentionally kept out of core to keep core limited to the necessary, minimal set of stable
APIs.

#### Remaining Parts of AppModule

The current `AppModule` framework handles a number of additional concerns which aren't addressed by this core API.
These include:

* gas
* block headers
* upgrades
* registration of gogo proto and amino interface types
* cobra query and tx commands
* gRPC gateway 
* crisis module invariants
* simulations

Additional `AppModule` extension interfaces either inside or outside of core will need to be specified to handle
these concerns.

In the case of gogo proto and amino interfaces, the registration of these generally should happen as early
as possible during initialization and in [ADR 057: App Wiring](./adr-057-app-wiring.md), protobuf type registration  
happens before dependency injection (although this could alternatively be done dedicated DI providers).

gRPC gateway registration should probably be handled by the runtime module, but the core API shouldn't depend on gRPC
gateway types as 1) we are already using an older version and 2) it's possible the framework can do this registration
automatically in the future. So for now, the runtime module should probably provide some sort of specific type for doing
this registration ex:

```go
type GrpcGatewayInfo struct {
    Handlers []GrpcGatewayHandler
}

type GrpcGatewayHandler func(ctx context.Context, mux *runtime.ServeMux, client QueryClient) error
```

which modules can return in a provider:

```go
func ProvideGrpcGateway() GrpcGatewayInfo {
    return GrpcGatewayinfo {
        Handlers: []Handler {types.RegisterQueryHandlerClient}
    }
}
```

Crisis module invariants and simulations are subject to potential redesign and should be managed with types
defined in the crisis and simulation modules respectively.

Extension interface for CLI commands will be provided via the `cosmossdk.io/client/v2` module and its
[autocli](adr-058-auto-generated-cli.md) framework.

#### Example Usage

Here is an example of setting up a hypothetical `foo` v2 module which uses the [ORM](adr-055-orm.md) for its state
management and genesis.

```go

type Keeper struct {
	db orm.ModuleDB
	evtSrv event.Service
}

```go
func (k Keeper) RegisterServices(r grpc.ServiceRegistrar) {
  foov1.RegisterMsgServer(r, k)
  foov1.RegisterQueryServer(r, k)
}

func (k Keeper) BeginBlock(context.Context) error {
	return nil
}

func ProvideApp(config *foomodulev2.Module, evtSvc event.EventService, db orm.ModuleDB) (Keeper, appmodule.AppModule){
    k := &Keeper{db: db, evtSvc: evtSvc}
    return k, k
}
```

### 运行时兼容性版本

`core` 模块将定义一个静态整数变量 `cosmossdk.io/core.RuntimeCompatibilityVersion`，它是一个表示核心模块的次要版本指示器，可在运行时访问。正确的运行时模块实现应该检查此兼容性版本，并在当前 `RuntimeCompatibilityVersion` 高于此运行时版本所支持的核心 API 版本时返回错误。当向 `core` 模块 API 添加新功能时，运行时模块需要支持这个版本的增加。

### 测试

`core` 应该提供所有服务的模拟实现，以便在不依赖于任何特定运行时版本的情况下对模块进行单元测试。模拟服务应该允许测试观察服务行为或提供非生产实现，例如可以使用内存存储来模拟存储。

对于集成测试，应该提供一个模拟运行时实现，允许将不同的应用模块组合在一起进行测试，而不依赖于运行时或 Comet。

## 结果

### 向后兼容性

运行时模块的早期版本应该尽可能支持使用现有的 `AppModule`/`sdk.Context` 框架构建的模块。随着核心 API 的更广泛采用，后续的运行时版本可能选择放弃支持，并仅支持核心 API 加上任何运行时模块特定的 API（如特定版本的 Comet）。

核心模块本身应该尽可能保持在 go 语义版本 `v1`，并遵循设计原则，以便提供强大的长期支持（LTS）。

旧版本的 SDK 可以通过提供适配器来支持针对核心构建的模块，将核心 `AppModule` 实现包装在符合该版本 SDK 语义的 `AppModule` 实现中，并通过包装 `sdk.Context` 来提供服务实现。

### 积极的

* 更好的 API 封装和关注点分离
* 更稳定的 API
* 更具框架可扩展性
* 确定性事件和查询
* 事件监听器
* 模块间消息和查询执行支持
* 更明确的支持模块版本的分叉和合并（包括运行时）

### 负面的

### 中性的

* 模块需要重构以使用此 API
* 一些替代 `AppModule` 功能的功能仍需要在后续工作中定义（类型注册、命令、不变量、模拟），这将需要额外的设计工作

## 进一步讨论

* gas
* 区块头
* 升级
* 注册 gogo proto 和 amino 接口类型
* cobra 查询和交易命令
* gRPC 网关
* 危机模块不变量
* 模拟

## 参考资料

* [ADR 033: 基于 Protobuf 的模块间通信](adr-033-protobuf-inter-module-comm.md)
* [ADR 057: 应用程序连接](./adr-057-app-wiring.md)
* [ADR 055: ORM](adr-055-orm.md)
* [ADR 028: 公钥地址](adr-028-public-key-addresses.md)
* [保持模块兼容性](https://go.dev/blog/module-compatibility)
```


# ADR 063: Core Module API

## Changelog

* 2022-08-18 First Draft
* 2022-12-08 First Draft
* 2023-01-24 Updates

## Status

ACCEPTED Partially Implemented

## Abstract

A new core API is proposed as a way to develop cosmos-sdk applications that will eventually replace the existing
`AppModule` and `sdk.Context` frameworks a set of core services and extension interfaces. This core API aims to:

* be simpler
* more extensible
* more stable than the current framework
* enable deterministic events and queries,
* support event listeners
* [ADR 033: Protobuf-based Inter-Module Communication](adr-033-protobuf-inter-module-comm.md) clients.

## Context

Historically modules have exposed their functionality to the framework via the `AppModule` and `AppModuleBasic`
interfaces which have the following shortcomings:

* both `AppModule` and `AppModuleBasic` need to be defined and registered which is counter-intuitive
* apps need to implement the full interfaces, even parts they don't need (although there are workarounds for this),
* interface methods depend heavily on unstable third party dependencies, in particular Comet,
* legacy required methods have littered these interfaces for far too long

In order to interact with the state machine, modules have needed to do a combination of these things:

* get store keys from the app
* call methods on `sdk.Context` which contains more or less the full set of capability available to modules.

By isolating all the state machine functionality into `sdk.Context`, the set of functionalities available to
modules are tightly coupled to this type. If there are changes to upstream dependencies (such as Comet)
or new functionalities are desired (such as alternate store types), the changes need impact `sdk.Context` and all
consumers of it (basically all modules). Also, all modules now receive `context.Context` and need to convert these
to `sdk.Context`'s with a non-ergonomic unwrapping function.

Any breaking changes to these interfaces, such as ones imposed by third-party dependencies like Comet, have the
side effect of forcing all modules in the ecosystem to update in lock-step. This means it is almost impossible to have
a version of the module which can be run with 2 or 3 different versions of the SDK or 2 or 3 different versions of
another module. This lock-step coupling slows down overall development within the ecosystem and causes updates to
components to be delayed longer than they would if things were more stable and loosely coupled.

## Decision

The `core` API proposes a set of core APIs that modules can rely on to interact with the state machine and expose their
functionalities to it that are designed in a principled way such that:

* tight coupling of dependencies and unrelated functionalities is minimized or eliminated
* APIs can have long-term stability guarantees
* the SDK framework is extensible in a safe and straightforward way

The design principles of the core API are as follows:

* everything that a module wants to interact with in the state machine is a service
* all services coordinate state via `context.Context` and don't try to recreate the "bag of variables" approach of `sdk.Context`
* all independent services are isolated in independent packages with minimal APIs and minimal dependencies
* the core API should be minimalistic and designed for long-term support (LTS)
* a "runtime" module will implement all the "core services" defined by the core API and can handle all module
  functionalities exposed by core extension interfaces
* other non-core and/or non-LTS services can be exposed by specific versions of runtime modules or other modules 
following the same design principles, this includes functionality that interacts with specific non-stable versions of
third party dependencies such as Comet
* the core API doesn't implement *any* functionality, it just defines types
* go stable API compatibility guidelines are followed: https://go.dev/blog/module-compatibility

A "runtime" module is any module which implements the core functionality of composing an ABCI app, which is currently
handled by `BaseApp` and the `ModuleManager`. Runtime modules which implement the core API are *intentionally* separate
from the core API in order to enable more parallel versions and forks of the runtime module than is possible with the
SDK's current tightly coupled `BaseApp` design while still allowing for a high degree of composability and
compatibility.

Modules which are built only against the core API don't need to know anything about which version of runtime,
`BaseApp` or Comet in order to be compatible. Modules from the core mainline SDK could be easily composed
with a forked version of runtime with this pattern.

This design is intended to enable matrices of compatible dependency versions. Ideally a given version of any module
is compatible with multiple versions of the runtime module and other compatible modules. This will allow dependencies
to be selectively updated based on battle-testing. More conservative projects may want to update some dependencies
slower than more fast moving projects.

### Core Services

The following "core services" are defined by the core API. All valid runtime module implementations should provide
implementations of these services to modules via both [dependency injection](adr-057-app-wiring.md) and
manual wiring. The individual services described below are all bundled in a convenient `appmodule.Service`
"bundle service" so that for simplicity modules can declare a dependency on a single service.

#### Store Services

Store services will be defined in the `cosmossdk.io/core/store` package.

The generic `store.KVStore` interface is the same as current SDK `KVStore` interface. Store keys have been refactored
into store services which, instead of expecting the context to know about stores, invert the pattern and allow
retrieving a store from a generic context. There are three store services for the three types of currently supported
stores - regular kv-store, memory, and transient:

```go
type KVStoreService interface {
    OpenKVStore(context.Context) KVStore
}

type MemoryStoreService interface {
    OpenMemoryStore(context.Context) KVStore
}
type TransientStoreService interface {
    OpenTransientStore(context.Context) KVStore
}
```

Modules can use these services like this:

```go
func (k msgServer) Send(ctx context.Context, msg *types.MsgSend) (*types.MsgSendResponse, error) {
    store := k.kvStoreSvc.OpenKVStore(ctx)
}
```

Just as with the current runtime module implementation, modules will not need to explicitly name these store keys,
but rather the runtime module will choose an appropriate name for them and modules just need to request the
type of store they need in their dependency injection (or manual) constructors.

#### Event Service

The event `Service` will be defined in the `cosmossdk.io/core/event` package.

The event `Service` allows modules to emit typed and legacy untyped events:

```go
package event

type Service interface {
  // EmitProtoEvent emits events represented as a protobuf message (as described in ADR 032).
  //
  // Callers SHOULD assume that these events may be included in consensus. These events
  // MUST be emitted deterministically and adding, removing or changing these events SHOULD
  // be considered state-machine breaking.
  EmitProtoEvent(ctx context.Context, event protoiface.MessageV1) error

  // EmitKVEvent emits an event based on an event and kv-pair attributes.
  //
  // These events will not be part of consensus and adding, removing or changing these events is
  // not a state-machine breaking change.
  EmitKVEvent(ctx context.Context, eventType string, attrs ...KVEventAttribute) error

  // EmitProtoEventNonConsensus emits events represented as a protobuf message (as described in ADR 032), without
  // including it in blockchain consensus.
  //
  // These events will not be part of consensus and adding, removing or changing events is
  // not a state-machine breaking change.
  EmitProtoEventNonConsensus(ctx context.Context, event protoiface.MessageV1) error
}
```

Typed events emitted with `EmitProto`  should be assumed to be part of blockchain consensus (whether they are part of
the block or app hash is left to the runtime to specify).

Events emitted by `EmitKVEvent` and `EmitProtoEventNonConsensus` are not considered to be part of consensus and cannot be observed
by other modules. If there is a client-side need to add events in patch releases, these methods can be used.

#### Logger

A logger (`cosmossdk.io/log`) must be supplied using `depinject`, and will
be made available for modules to use via `depinject.In`.
Modules using it should follow the current pattern in the SDK by adding the module name before using it.

```go
type ModuleInputs struct {
  depinject.In

  Logger log.Logger
}

func ProvideModule(in ModuleInputs) ModuleOutputs {
  keeper := keeper.NewKeeper(
    in.logger,
  )
}

func NewKeeper(logger log.Logger) Keeper {
  return Keeper{
    logger: logger.With(log.ModuleKey, "x/"+types.ModuleName),
  }
}
```

```

### Core `AppModule` extension interfaces


Modules will provide their core services to the runtime module via extension interfaces built on top of the
`cosmossdk.io/core/appmodule.AppModule` tag interface. This tag interface requires only two empty methods which
allow `depinject` to identify implementors as `depinject.OnePerModule` types and as app module implementations:

```go
type AppModule interface {
  depinject.OnePerModuleType

  // IsAppModule is a dummy method to tag a struct as implementing an AppModule.
  IsAppModule()
}
```

Other core extension interfaces will be defined in `cosmossdk.io/core` should be supported by valid runtime
implementations.

#### `MsgServer` and `QueryServer` registration

`MsgServer` and `QueryServer` registration is done by implementing the `HasServices` extension interface:

```go
type HasServices interface {
	AppModule

	RegisterServices(grpc.ServiceRegistrar)
}

```

Because of the `cosmos.msg.v1.service` protobuf option, required for `Msg` services, the same `ServiceRegitrar` can be
used to register both `Msg` and query services.

#### Genesis

The genesis `Handler` functions - `DefaultGenesis`, `ValidateGenesis`, `InitGenesis` and `ExportGenesis` - are specified
against the `GenesisSource` and `GenesisTarget` interfaces which will abstract over genesis sources which may be a single
JSON object or collections of JSON objects that can be efficiently streamed.

```go
// GenesisSource is a source for genesis data in JSON format. It may abstract over a
// single JSON object or separate files for each field in a JSON object that can
// be streamed over. Modules should open a separate io.ReadCloser for each field that
// is required. When fields represent arrays they can efficiently be streamed
// over. If there is no data for a field, this function should return nil, nil. It is
// important that the caller closes the reader when done with it.
type GenesisSource = func(field string) (io.ReadCloser, error)

// GenesisTarget is a target for writing genesis data in JSON format. It may
// abstract over a single JSON object or JSON in separate files that can be
// streamed over. Modules should open a separate io.WriteCloser for each field
// and should prefer writing fields as arrays when possible to support efficient
// iteration. It is important the caller closers the writer AND checks the error
// when done with it. It is expected that a stream of JSON data is written
// to the writer.
type GenesisTarget = func(field string) (io.WriteCloser, error)
```

All genesis objects for a given module are expected to conform to the semantics of a JSON object.
Each field in the JSON object should be read and written separately to support streaming genesis.
The [ORM](adr-055-orm.md) and [collections](adr-062-collections-state-layer.md) both support
streaming genesis and modules using these frameworks generally do not need to write any manual
genesis code.

To support genesis, modules should implement the `HasGenesis` extension interface:

```go
type HasGenesis interface {
	AppModule

	// DefaultGenesis writes the default genesis for this module to the target.
	DefaultGenesis(GenesisTarget) error

	// ValidateGenesis validates the genesis data read from the source.
	ValidateGenesis(GenesisSource) error

	// InitGenesis initializes module state from the genesis source.
	InitGenesis(context.Context, GenesisSource) error

	// ExportGenesis exports module state to the genesis target.
	ExportGenesis(context.Context, GenesisTarget) error
}
```

#### Begin and End Blockers

Modules that have functionality that runs before transactions (begin blockers) or after transactions
(end blockers) should implement the has `HasBeginBlocker` and/or `HasEndBlocker` interfaces:

```go
type HasBeginBlocker interface {
  AppModule
  BeginBlock(context.Context) error
}

type HasEndBlocker interface {
  AppModule
  EndBlock(context.Context) error
}
```

The `BeginBlock` and `EndBlock` methods will take a `context.Context`, because:

* most modules don't need Comet information other than `BlockInfo` so we can eliminate dependencies on specific
Comet versions
* for the few modules that need Comet block headers and/or return validator updates, specific versions of the
runtime module will provide specific functionality for interacting with the specific version(s) of Comet
supported

In order for `BeginBlock`, `EndBlock` and `InitGenesis` to send back validator updates and retrieve full Comet
block headers, the runtime module for a specific version of Comet could provide services like this:

```go
type ValidatorUpdateService interface {
    SetValidatorUpdates(context.Context, []abci.ValidatorUpdate)
}
```

Header Service defines a way to get header information about a block. This information is generalized for all implementations: 

```go 

type Service interface {
	GetHeaderInfo(context.Context) Info
}

type Info struct {
	Height int64      // Height returns the height of the block
	Hash []byte       // Hash returns the hash of the block header
	Time time.Time    // Time returns the time of the block
	ChainID string    // ChainId returns the chain ID of the block
}
```

Comet Service provides a way to get comet specific information: 

```go
type Service interface {
	GetCometInfo(context.Context) Info
}

type CometInfo struct {
  Evidence []abci.Misbehavior // Misbehavior returns the misbehavior of the block
	// ValidatorsHash returns the hash of the validators
	// For Comet, it is the hash of the next validators
	ValidatorsHash []byte
	ProposerAddress []byte            // ProposerAddress returns the address of the block proposer
	DecidedLastCommit abci.CommitInfo // DecidedLastCommit returns the last commit info
}
```

If a user would like to provide a module other information they would need to implement another service like:

```go
type RollKit Interface {
  ...
}
```

We know these types will change at the Comet level and that also a very limited set of modules actually need this
functionality, so they are intentionally kept out of core to keep core limited to the necessary, minimal set of stable
APIs.

#### Remaining Parts of AppModule

The current `AppModule` framework handles a number of additional concerns which aren't addressed by this core API.
These include:

* gas
* block headers
* upgrades
* registration of gogo proto and amino interface types
* cobra query and tx commands
* gRPC gateway 
* crisis module invariants
* simulations

Additional `AppModule` extension interfaces either inside or outside of core will need to be specified to handle
these concerns.

In the case of gogo proto and amino interfaces, the registration of these generally should happen as early
as possible during initialization and in [ADR 057: App Wiring](./adr-057-app-wiring.md), protobuf type registration  
happens before dependency injection (although this could alternatively be done dedicated DI providers).

gRPC gateway registration should probably be handled by the runtime module, but the core API shouldn't depend on gRPC
gateway types as 1) we are already using an older version and 2) it's possible the framework can do this registration
automatically in the future. So for now, the runtime module should probably provide some sort of specific type for doing
this registration ex:

```go
type GrpcGatewayInfo struct {
    Handlers []GrpcGatewayHandler
}

type GrpcGatewayHandler func(ctx context.Context, mux *runtime.ServeMux, client QueryClient) error
```

which modules can return in a provider:

```go
func ProvideGrpcGateway() GrpcGatewayInfo {
    return GrpcGatewayinfo {
        Handlers: []Handler {types.RegisterQueryHandlerClient}
    }
}
```

Crisis module invariants and simulations are subject to potential redesign and should be managed with types
defined in the crisis and simulation modules respectively.

Extension interface for CLI commands will be provided via the `cosmossdk.io/client/v2` module and its
[autocli](adr-058-auto-generated-cli.md) framework.

#### Example Usage

Here is an example of setting up a hypothetical `foo` v2 module which uses the [ORM](adr-055-orm.md) for its state
management and genesis.

```go

type Keeper struct {
	db orm.ModuleDB
	evtSrv event.Service
}

func (k Keeper) RegisterServices(r grpc.ServiceRegistrar) {
  foov1.RegisterMsgServer(r, k)
  foov1.RegisterQueryServer(r, k)
}

func (k Keeper) BeginBlock(context.Context) error {
	return nil
}

func ProvideApp(config *foomodulev2.Module, evtSvc event.EventService, db orm.ModuleDB) (Keeper, appmodule.AppModule){
    k := &Keeper{db: db, evtSvc: evtSvc}
    return k, k
}
```

### Runtime Compatibility Version

The `core` module will define a static integer var, `cosmossdk.io/core.RuntimeCompatibilityVersion`, which is
a minor version indicator of the core module that is accessible at runtime. Correct runtime module implementations
should check this compatibility version and return an error if the current `RuntimeCompatibilityVersion` is higher
than the version of the core API that this runtime version can support. When new features are adding to the `core`
module API that runtime modules are required to support, this version should be incremented.

### Testing

A mock implementation of all services should be provided in core to allow for unit testing of modules
without needing to depend on any particular version of runtime. Mock services should
allow tests to observe service behavior or provide a non-production implementation - for instance memory
stores can be used to mock stores.

For integration testing, a mock runtime implementation should be provided that allows composing different app modules
together for testing without a dependency on runtime or Comet.

## Consequences

### Backwards Compatibility

Early versions of runtime modules should aim to support as much as possible modules built with the existing
`AppModule`/`sdk.Context` framework. As the core API is more widely adopted, later runtime versions may choose to
drop support and only support the core API plus any runtime module specific APIs (like specific versions of Comet).

The core module itself should strive to remain at the go semantic version `v1` as long as possible and follow design
principles that allow for strong long-term support (LTS).

Older versions of the SDK can support modules built against core with adaptors that convert wrap core `AppModule`
implementations in implementations of `AppModule` that conform to that version of the SDK's semantics as well
as by providing service implementations by wrapping `sdk.Context`.

### Positive

* better API encapsulation and separation of concerns
* more stable APIs
* more framework extensibility
* deterministic events and queries
* event listeners
* inter-module msg and query execution support
* more explicit support for forking and merging of module versions (including runtime)

### Negative

### Neutral

* modules will need to be refactored to use this API
* some replacements for `AppModule` functionality still need to be defined in follow-ups
  (type registration, commands, invariants, simulations) and this will take additional design work

## Further Discussions

* gas
* block headers
* upgrades
* registration of gogo proto and amino interface types
* cobra query and tx commands
* gRPC gateway
* crisis module invariants
* simulations

## References

* [ADR 033: Protobuf-based Inter-Module Communication](adr-033-protobuf-inter-module-comm.md)
* [ADR 057: App Wiring](./adr-057-app-wiring.md)
* [ADR 055: ORM](adr-055-orm.md)
* [ADR 028: Public Key Addresses](adr-028-public-key-addresses.md)
* [Keeping Your Modules Compatible](https://go.dev/blog/module-compatibility)
