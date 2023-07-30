# ADR 057: 应用程序连接

## 更新日志

* 2022-05-04: 初始草稿
* 2022-08-19: 更新

## 状态

已实施的提案

## 摘要

为了更容易构建Cosmos SDK模块和应用程序，我们提出了一种基于依赖注入和声明式应用程序配置的新的应用程序连接系统，以取代当前的`app.go`代码。

## 背景

目前的SDK和SDK应用程序的一些因素使其难以维护。当前复杂状态的一个症状是[`simapp/app.go`](https://github.com/cosmos/cosmos-sdk/blob/c3edbb22cab8678c35e21fe0253919996b780c01/simapp/app.go)，
其中包含近100行的导入代码，以及其他600多行主要是样板代码，通常会复制到每个新项目中。（更不用说在`simapp/simd`中复制的其他样板代码了。）

启动应用程序所需的大量样板代码使得难以为Cosmos SDK模块发布独立版本的Go模块，如[ADR 053: Go模块重构](adr-053-go-module-refactoring.md)中所述。

除了非常冗长和重复之外，`app.go`还暴露了大量的破坏性更改的可能性，因为大多数模块使用位置参数实例化自身，这意味着每当需要新的参数（即使是可选的）时都会导致破坏性更改。

已经尝试了几种改进当前情况的方法，包括[ADR 033: 内部模块通信](adr-033-protobuf-inter-module-comm.md)和[一个新SDK的概念验证](https://github.com/allinbits/cosmos-sdk-poc)。围绕这些设计的讨论导致了当前在这里描述的解决方案。

## 决策

为了改善当前情况，设计了一种名为“应用程序连接”的新范式，以取代`app.go`，其中包括：

* 在应用程序中声明模块的配置，可以序列化为JSON或YAML
* 一个依赖注入（DI）框架，用于根据该配置实例化应用程序

### 依赖注入

在检查`app.go`中的代码时，大部分代码只是使用由框架（例如存储键）或其他模块（例如保管人）提供的依赖项实例化模块。通常情况下，根据上下文很容易确定正确的依赖关系，因此依赖注入是一个明显的解决方案。模块将告诉DI容器它需要什么依赖项，容器将找出如何提供它。

我们在golang中探索了几种现有的DI解决方案，并且觉得[uber/dig](https://github.com/uber-go/dig)中基于反射的方法最接近我们的需求，但还不够完善。在评估了SDK所需的内容后，我们设计并构建了Cosmos SDK的[depinject模块](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/depinject)，该模块具有以下特点：

* 通过函数构造函数进行依赖解析和提供，例如：`func(need SomeDep) (AnotherDep, error)`
* 支持`optional`依赖的`In`和`Out`结构体的依赖注入
* 通过`ManyPerContainerType`标签接口实现分组依赖（每个容器可以有多个）
* 通过`ModuleKey`实现模块范围的依赖（每个模块都有唯一的依赖）
* 通过`OnePerModuleType`标签接口实现每个模块只有一个依赖
* 通过GraphViz实现复杂的调试信息和容器可视化

以下是在SDK模块中如何使用这些功能的一些示例：

* `StoreKey`可以是一个模块范围的依赖，每个模块都是唯一的
* 模块的`AppModule`实例（或等效实例）可以是`OnePerModuleType`
* CLI命令可以提供`ManyPerContainerType`

请注意，尽管依赖解析是动态的并且基于反射，这可能被认为是这种方法的一个缺点，但整个依赖图应该在应用程序启动时立即解析，并且只解析一次（除了动态配置重新加载的情况，这是一个单独的主题）。这意味着如果依赖图中有任何错误，它们将立即在启动时报告，因此这种方法在错误报告方面只稍微比完全静态解析差一些，但在代码复杂性方面要好得多。

### 声明式应用配置

为了将模块组合成一个应用程序，将使用声明式应用配置。该配置基于protobuf，其基本结构非常简单：

```protobuf
package cosmos.app.v1;

message Config {
  repeated ModuleConfig modules = 1;
}

message ModuleConfig {
  string name = 1;
  google.protobuf.Any config = 2;
}
```

（另请参阅https://github.com/cosmos/cosmos-sdk/blob/6e18f582bf69e3926a1e22a6de3c35ea327aadce/proto/cosmos/app/v1alpha1/config.proto）

每个模块的配置本身都是一个 protobuf 消息，并且模块将根据其配置对象的 protobuf 类型 URL 进行识别和加载（例如 `cosmos.bank.module.v1.Module`）。模块被赋予一个唯一的短 `name`，以便在同一模块的不同版本之间共享资源，这些版本可能具有不同的 protobuf 包版本（例如 `cosmos.bank.module.v2.Module`）。所有模块配置对象都应定义 `cosmos.app.v1alpha1.module` 描述符选项，该选项将为框架提供附加的有用元数据，并且还可以在模块注册表中进行索引。

一个 YAML 中的示例应用配置可能如下所示：

```yaml
modules:
  - name: baseapp
    config:
      "@type": cosmos.baseapp.module.v1.Module
      begin_blockers: [staking, auth, bank]
      end_blockers: [bank, auth, staking]
      init_genesis: [bank, auth, staking]
  - name: auth
    config:
      "@type": cosmos.auth.module.v1.Module
      bech32_prefix: "foo"
  - name: bank
    config:
      "@type": cosmos.bank.module.v1.Module
  - name: staking
    config:
      "@type": cosmos.staking.module.v1.Module
```

在上面的示例中，有一个假设的 `baseapp` 模块，其中包含有关开始阻塞器、结束阻塞器和初始化创世块的信息。而不是将这些问题提升到模块配置层面，它们本身由一个模块处理，这样可以方便地替换不同版本的 baseapp（例如针对不同版本的 tendermint），而无需更改其余的配置。然后，`baseapp` 模块将向服务器框架（在 ABCI 应用程序之外）提供一个 `abci.Application` 实例。

在这个模型中，一个应用程序是*完全由模块组成*的，依赖注入/应用程序配置层非常与协议无关，并且可以适应协议层的重大破坏性变化。

### 模块和 Protobuf 注册

为了使依赖注入和声明式配置这两个组件能够像描述的那样协同工作，我们需要一种方式让模块实际上注册自己并向容器提供依赖项。

在这个层面需要处理的一个额外复杂性是 protobuf 注册表的初始化。回想一下，在当前的 SDK `codec` 和提议的 [ADR 054: Protobuf Semver Compatible Codegen](https://github.com/cosmos/cosmos-sdk/pull/11802) 中，需要显式注册 protobuf 类型。鉴于应用程序配置本身基于 protobuf 并使用 protobuf 的 `Any` 类型，因此需要在可以解码应用程序配置之前进行 protobuf 注册。由于我们事先不知道哪些 protobuf `Any` 类型将被需要，并且模块本身定义了这些类型，因此我们需要在不同的阶段解码应用程序配置：

1. 将应用程序配置的 JSON/YAML 解析为原始 JSON，并收集所需模块类型的 URL（不进行 proto JSON 解码）
2. 基于文件描述符和每个所需模块提供的类型构建一个 [protobuf 类型注册表](https://pkg.go.dev/google.golang.org/protobuf@v1.28.0/reflect/protoregistry)
3. 使用 protobuf 类型注册表将应用程序配置解码为 proto JSON

因为在 [ADR 054: Protobuf Semver Compatible Codegen](https://github.com/cosmos/cosmos-sdk/pull/11802) 中，每个模块应该使用未在全局 protobuf 注册表中注册的 `internal` 生成的代码，所以这段代码应该提供一种替代方法来将 protobuf 类型注册到类型注册表中。与当前的 `.pb.go` 文件有一个 `var File_foo_proto protoreflect.FileDescriptor` 用于文件 `foo.proto` 类似，生成的代码应该有一个新的成员 `var Types_foo_proto TypeInfo`，其中 `TypeInfo` 是一个接口或结构体，包含注册 protobuf 生成的类型和文件描述符所需的所有信息。

因此，一个模块必须提供依赖注入提供程序和 protobuf 类型，并以其模块配置对象作为输入，该对象根据其类型 URL 唯一标识模块。

在此基础上，我们定义了一个全局模块注册表，允许模块实现使用以下 API 进行注册：

```go
// Register registers a module with the provided type name (ex. cosmos.bank.module.v1.Module)
// and the provided options.
func Register(configTypeName protoreflect.FullName, option ...Option) { ... }

type Option { /* private methods */ }

// Provide registers dependency injection provider functions which work with the
// cosmos-sdk container module. These functions can also accept an additional
// parameter for the module's config object.
func Provide(providers ...interface{}) Option { ... }

// Types registers protobuf TypeInfo's with the protobuf registry.
func Types(types ...TypeInfo) Option { ... }
```

示例：

```go
func init() {
	appmodule.Register("cosmos.bank.module.v1.Module",
		appmodule.Types(
			types.Types_tx_proto,
            types.Types_query_proto,
            types.Types_types_proto,
	    ),
	    appmodule.Provide(
			provideBankModule,
	    )
	)
}

type Inputs struct {
	container.In
	
	AuthKeeper auth.Keeper
	DB ormdb.ModuleDB
}

type Outputs struct {
	Keeper bank.Keeper
	AppModule appmodule.AppModule
}

func ProvideBankModule(config *bankmodulev1.Module, Inputs) (Outputs, error) { ... }
```

请注意，在此模块中，模块配置对象*不能*根据配置在运行时注册不同的依赖提供程序。这是有意为之，因为它允许我们全局地知道哪些模块提供了哪些依赖项，并且还可以帮助我们生成整个应用程序初始化的代码。如果所需的模块在运行时未加载，这可以帮助我们找出应用程序配置中缺少的依赖项问题。在所需模块未在运行时加载的情况下，可能可以通过全局 Cosmos SDK 模块注册表将用户引导到正确的模块。

上述提到的 `*appmodule.Handler` 类型是传统的 `AppModule` 框架的替代品，并在 [ADR 063: Core Module API](./adr-063-core-module-api.md) 中进行了描述。

### 新的 `app.go`

有了这个设置，`app.go` 可能会像这样：

```go
package main

import (
	// Each go package which registers a module must be imported just for side-effects
	// so that module implementations are registered.
	_ "github.com/cosmos/cosmos-sdk/x/auth/module"
	_ "github.com/cosmos/cosmos-sdk/x/bank/module"
	_ "github.com/cosmos/cosmos-sdk/x/staking/module"
	"github.com/cosmos/cosmos-sdk/core/app"
)

// go:embed app.yaml
var appConfigYAML []byte

func main() {
	app.Run(app.LoadYAML(appConfigYAML))
}
```

### 应用到现有的 SDK 模块

到目前为止，我们已经描述了一个在很大程度上与 SDK 的具体细节无关的系统，例如存储键、`AppModule`、`BaseApp` 等等。对于与这里定义的通用应用程序连接框架集成的这些框架的改进在 [ADR 061: Core Module API](./adr-063-core-module-api.md) 中进行了描述。

### 注册模块间钩子

### 注册模块间钩子

一些模块定义了一个钩子接口（例如 `StakingHooks`），允许一个模块在发生某些事件时回调到另一个模块。

使用应用程序连接框架，这些钩子接口可以被定义为 `OnePerModuleType`，然后消费这些钩子的模块可以将这些钩子收集为模块名称到钩子类型的映射（例如 `map[string]FooHooks`）。例如：

```go
func init() {
    appmodule.Register(
        &foomodulev1.Module{},
        appmodule.Invoke(InvokeSetFooHooks),
	    ...
    )
}
func InvokeSetFooHooks(
    keeper *keeper.Keeper,
    fooHooks map[string]FooHooks,
) error {
	for k in sort.Strings(maps.Keys(fooHooks)) {
		keeper.AddFooHooks(fooHooks[k])
    }
}
```

可选地，消费钩子的模块可以允许应用程序根据模块名称定义调用这些钩子的顺序，这可以在其配置对象中实现。

还考虑了通过反射注册钩子的替代方法，其中所有 keeper 类型都会被检查，以查看它们是否通过模块公开了钩子接口。这样做的缺点是：

* 需要将所有模块的所有 keeper 公开给提供钩子的模块，
* 不允许将钩子封装在不公开所有 keeper 方法的不同类型上，
* 更难以静态地知道哪个模块公开了钩子或正在检查它们。

通过这里提出的方法，如果使用了 `depinject` 代码生成（下面描述），钩子的注册将在 `app.go` 中明显可见。

### 代码生成

`depinject` 框架将可选地允许应用程序配置和依赖注入连接的代码生成。这将允许：

* 依赖注入连接被视为常规的 Go 代码，就像现有的 `app.go` 一样，
* 依赖注入是可选的，手动连接仍然是100%可能的。

代码生成要求所有提供者和调用者及其参数都必须导出并位于非内部包中。

## 结果

### 向后兼容性

使用新的应用程序连接系统的模块不需要放弃其现有的 `AppModule` 和 `NewKeeper` 注册范例。这两种方法可以并存，直到不再需要为止。

### 积极影响

* 新应用程序的连接将更简单、更简洁，且更不容易出错
* 开发和测试独立的 SDK 模块将更容易，无需复制所有的 simapp
* 可能可以通过此机制动态加载模块和升级链，而无需进行协调停止和二进制升级
* 更容易进行插件集成
* 依赖注入框架提供了对项目中依赖关系的更多自动化推理，具有图形可视化。

### 负面影响

* 当依赖项缺失时可能会产生困惑，尽管错误消息、GraphViz 可视化和全局模块注册可能会有所帮助

### 中性影响

* 需要工作和教育

## 进一步讨论

本 ADR 中描述的 protobuf 类型注册系统尚未实现，可能需要考虑在代码生成的情况下重新考虑。最好使用 DI 提供者进行此类型注册。

## 参考资料

* https://github.com/cosmos/cosmos-sdk/blob/c3edbb22cab8678c35e21fe0253919996b780c01/simapp/app.go
* https://github.com/allinbits/cosmos-sdk-poc
* https://github.com/uber-go/dig
* https://github.com/google/wire
* https://pkg.go.dev/github.com/cosmos/cosmos-sdk/container
* https://github.com/cosmos/cosmos-sdk/pull/11802
* [ADR 063](./adr-063-core-module-api.md)


# ADR 057: App Wiring

## Changelog

* 2022-05-04: Initial Draft
* 2022-08-19: Updates

## Status

PROPOSED Implemented

## Abstract

In order to make it easier to build Cosmos SDK modules and apps, we propose a new app wiring system based on
dependency injection and declarative app configurations to replace the current `app.go` code.

## Context

A number of factors have made the SDK and SDK apps in their current state hard to maintain. A symptom of the current
state of complexity is [`simapp/app.go`](https://github.com/cosmos/cosmos-sdk/blob/c3edbb22cab8678c35e21fe0253919996b780c01/simapp/app.go)
which contains almost 100 lines of imports and is otherwise over 600 lines of mostly boilerplate code that is
generally copied to each new project. (Not to mention the additional boilerplate which gets copied in `simapp/simd`.)

The large amount of boilerplate needed to bootstrap an app has made it hard to release independently versioned go
modules for Cosmos SDK modules as described in [ADR 053: Go Module Refactoring](adr-053-go-module-refactoring.md).

In addition to being very verbose and repetitive, `app.go` also exposes a large surface area for breaking changes
as most modules instantiate themselves with positional parameters which forces breaking changes anytime a new parameter
(even an optional one) is needed.

Several attempts were made to improve the current situation including [ADR 033: Internal-Module Communication](adr-033-protobuf-inter-module-comm.md)
and [a proof-of-concept of a new SDK](https://github.com/allinbits/cosmos-sdk-poc). The discussions around these
designs led to the current solution described here.

## Decision

In order to improve the current situation, a new "app wiring" paradigm has been designed to replace `app.go` which
involves:

* declaration configuration of the modules in an app which can be serialized to JSON or YAML
* a dependency-injection (DI) framework for instantiating apps from the that configuration

### Dependency Injection

When examining the code in `app.go` most of the code simply instantiates modules with dependencies provided either
by the framework (such as store keys) or by other modules (such as keepers). It is generally pretty obvious given
the context what the correct dependencies actually should be, so dependency-injection is an obvious solution. Rather
than making developers manually resolve dependencies, a module will tell the DI container what dependency it needs
and the container will figure out how to provide it.

We explored several existing DI solutions in golang and felt that the reflection-based approach in [uber/dig](https://github.com/uber-go/dig)
was closest to what we needed but not quite there. Assessing what we needed for the SDK, we designed and built
the Cosmos SDK [depinject module](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/depinject), which has the following
features:

* dependency resolution and provision through functional constructors, ex: `func(need SomeDep) (AnotherDep, error)`
* dependency injection `In` and `Out` structs which support `optional` dependencies
* grouped-dependencies (many-per-container) through the `ManyPerContainerType` tag interface
* module-scoped dependencies via `ModuleKey`s (where each module gets a unique dependency)
* one-per-module dependencies through the `OnePerModuleType` tag interface
* sophisticated debugging information and container visualization via GraphViz

Here are some examples of how these would be used in an SDK module:

* `StoreKey` could be a module-scoped dependency which is unique per module
* a module's `AppModule` instance (or the equivalent) could be a `OnePerModuleType`
* CLI commands could be provided with `ManyPerContainerType`s

Note that even though dependency resolution is dynamic and based on reflection, which could be considered a pitfall
of this approach, the entire dependency graph should be resolved immediately on app startup and only gets resolved
once (except in the case of dynamic config reloading which is a separate topic). This means that if there are any
errors in the dependency graph, they will get reported immediately on startup so this approach is only slightly worse
than fully static resolution in terms of error reporting and much better in terms of code complexity.

### Declarative App Config

In order to compose modules into an app, a declarative app configuration will be used. This configuration is based off
of protobuf and its basic structure is very simple:

```protobuf
package cosmos.app.v1;

message Config {
  repeated ModuleConfig modules = 1;
}

message ModuleConfig {
  string name = 1;
  google.protobuf.Any config = 2;
}
```

(See also https://github.com/cosmos/cosmos-sdk/blob/6e18f582bf69e3926a1e22a6de3c35ea327aadce/proto/cosmos/app/v1alpha1/config.proto)

The configuration for every module is itself a protobuf message and modules will be identified and loaded based
on the protobuf type URL of their config object (ex. `cosmos.bank.module.v1.Module`). Modules are given a unique short `name`
to share resources across different versions of the same module which might have a different protobuf package
versions (ex. `cosmos.bank.module.v2.Module`). All module config objects should define the `cosmos.app.v1alpha1.module`
descriptor option which will provide additional useful metadata for the framework and which can also be indexed
in module registries.

An example app config in YAML might look like this:

```yaml
modules:
  - name: baseapp
    config:
      "@type": cosmos.baseapp.module.v1.Module
      begin_blockers: [staking, auth, bank]
      end_blockers: [bank, auth, staking]
      init_genesis: [bank, auth, staking]
  - name: auth
    config:
      "@type": cosmos.auth.module.v1.Module
      bech32_prefix: "foo"
  - name: bank
    config:
      "@type": cosmos.bank.module.v1.Module
  - name: staking
    config:
      "@type": cosmos.staking.module.v1.Module
```

In the above example, there is a hypothetical `baseapp` module which contains the information around ordering of
begin blockers, end blockers, and init genesis. Rather than lifting these concerns up to the module config layer,
they are themselves handled by a module which could allow a convenient way of swapping out different versions of
baseapp (for instance to target different versions of tendermint), without needing to change the rest of the config.
The `baseapp` module would then provide to the server framework (which sort of sits outside the ABCI app) an instance
of `abci.Application`.

In this model, an app is *modules all the way down* and the dependency injection/app config layer is very much
protocol-agnostic and can adapt to even major breaking changes at the protocol layer.

### Module & Protobuf Registration

In order for the two components of dependency injection and declarative configuration to work together as described,
we need a way for modules to actually register themselves and provide dependencies to the container.

One additional complexity that needs to be handled at this layer is protobuf registry initialization. Recall that
in both the current SDK `codec` and the proposed [ADR 054: Protobuf Semver Compatible Codegen](https://github.com/cosmos/cosmos-sdk/pull/11802),
protobuf types need to be explicitly registered. Given that the app config itself is based on protobuf and
uses protobuf `Any` types, protobuf registration needs to happen before the app config itself can be decoded. Because
we don't know which protobuf `Any` types will be needed a priori and modules themselves define those types, we need
to decode the app config in separate phases:

1. parse app config JSON/YAML as raw JSON and collect required module type URLs (without doing proto JSON decoding)
2. build a [protobuf type registry](https://pkg.go.dev/google.golang.org/protobuf@v1.28.0/reflect/protoregistry) based
   on file descriptors and types provided by each required module
3. decode the app config as proto JSON using the protobuf type registry

Because in [ADR 054: Protobuf Semver Compatible Codegen](https://github.com/cosmos/cosmos-sdk/pull/11802), each module
should use `internal` generated code which is not registered with the global protobuf registry, this code should provide
an alternate way to register protobuf types with a type registry. In the same way that `.pb.go` files currently have a
`var File_foo_proto protoreflect.FileDescriptor` for the file `foo.proto`, generated code should have a new member
`var Types_foo_proto TypeInfo` where `TypeInfo` is an interface or struct with all the necessary info to register both
the protobuf generated types and file descriptor.

So a module must provide dependency injection providers and protobuf types, and takes as input its module
config object which uniquely identifies the module based on its type URL.

With this in mind, we define a global module register which allows module implementations to register themselves
with the following API:

```go
// Register registers a module with the provided type name (ex. cosmos.bank.module.v1.Module)
// and the provided options.
func Register(configTypeName protoreflect.FullName, option ...Option) { ... }

type Option { /* private methods */ }

// Provide registers dependency injection provider functions which work with the
// cosmos-sdk container module. These functions can also accept an additional
// parameter for the module's config object.
func Provide(providers ...interface{}) Option { ... }

// Types registers protobuf TypeInfo's with the protobuf registry.
func Types(types ...TypeInfo) Option { ... }
```

Ex:

```go
func init() {
	appmodule.Register("cosmos.bank.module.v1.Module",
		appmodule.Types(
			types.Types_tx_proto,
            types.Types_query_proto,
            types.Types_types_proto,
	    ),
	    appmodule.Provide(
			provideBankModule,
	    )
	)
}

type Inputs struct {
	container.In
	
	AuthKeeper auth.Keeper
	DB ormdb.ModuleDB
}

type Outputs struct {
	Keeper bank.Keeper
	AppModule appmodule.AppModule
}

func ProvideBankModule(config *bankmodulev1.Module, Inputs) (Outputs, error) { ... }
```

Note that in this module, a module configuration object *cannot* register different dependency providers at runtime
based on the configuration. This is intentional because it allows us to know globally which modules provide which
dependencies, and it will also allow us to do code generation of the whole app initialization. This
can help us figure out issues with missing dependencies in an app config if the needed modules are loaded at runtime.
In cases where required modules are not loaded at runtime, it may be possible to guide users to the correct module if
through a global Cosmos SDK module registry.

The `*appmodule.Handler` type referenced above is a replacement for the legacy `AppModule` framework, and
described in [ADR 063: Core Module API](./adr-063-core-module-api.md).

### New `app.go`

With this setup, `app.go` might now look something like this:

```go
package main

import (
	// Each go package which registers a module must be imported just for side-effects
	// so that module implementations are registered.
	_ "github.com/cosmos/cosmos-sdk/x/auth/module"
	_ "github.com/cosmos/cosmos-sdk/x/bank/module"
	_ "github.com/cosmos/cosmos-sdk/x/staking/module"
	"github.com/cosmos/cosmos-sdk/core/app"
)

// go:embed app.yaml
var appConfigYAML []byte

func main() {
	app.Run(app.LoadYAML(appConfigYAML))
}
```

### Application to existing SDK modules

So far we have described a system which is largely agnostic to the specifics of the SDK such as store keys, `AppModule`,
`BaseApp`, etc. Improvements to these parts of the framework that integrate with the general app wiring framework
defined here are described in [ADR 061: Core Module API](./adr-063-core-module-api.md).

### Registration of Inter-Module Hooks

### Registration of Inter-Module Hooks

Some modules define a hooks interface (ex. `StakingHooks`) which allows one module to call back into another module
when certain events happen.

With the app wiring framework, these hooks interfaces can be defined as a `OnePerModuleType`s and then the module
which consumes these hooks can collect these hooks as a map of module name to hook type (ex. `map[string]FooHooks`). Ex:

```go
func init() {
    appmodule.Register(
        &foomodulev1.Module{},
        appmodule.Invoke(InvokeSetFooHooks),
	    ...
    )
}
func InvokeSetFooHooks(
    keeper *keeper.Keeper,
    fooHooks map[string]FooHooks,
) error {
	for k in sort.Strings(maps.Keys(fooHooks)) {
		keeper.AddFooHooks(fooHooks[k])
    }
}
```

Optionally, the module consuming hooks can allow app's to define an order for calling these hooks based on module name
in its config object.

An alternative way for registering hooks via reflection was considered where all keeper types are inspected to see if
they implement the hook interface by the modules exposing hooks. This has the downsides of:

* needing to expose all the keepers of all modules to the module providing hooks,
* not allowing for encapsulating hooks on a different type which doesn't expose all keeper methods,
* harder to know statically which module expose hooks or are checking for them.

With the approach proposed here, hooks registration will be obviously observable in `app.go` if `depinject` codegen
(described below) is used.

### Code Generation

The `depinject` framework will optionally allow the app configuration and dependency injection wiring to be code
generated. This will allow:

* dependency injection wiring to be inspected as regular go code just like the existing `app.go`,
* dependency injection to be opt-in with manual wiring 100% still possible.

Code generation requires that all providers and invokers and their parameters are exported and in non-internal packages.

## Consequences

### Backwards Compatibility

Modules which work with the new app wiring system do not need to drop their existing `AppModule` and `NewKeeper`
registration paradigms. These two methods can live side-by-side for as long as is needed.

### Positive

* wiring up new apps will be simpler, more succinct and less error-prone
* it will be easier to develop and test standalone SDK modules without needing to replicate all of simapp
* it may be possible to dynamically load modules and upgrade chains without needing to do a coordinated stop and binary
  upgrade using this mechanism
* easier plugin integration
* dependency injection framework provides more automated reasoning about dependencies in the project, with a graph visualization.

### Negative

* it may be confusing when a dependency is missing although error messages, the GraphViz visualization, and global
  module registration may help with that

### Neutral

* it will require work and education

## Further Discussions

The protobuf type registration system described in this ADR has not been implemented and may need to be reconsidered in
light of code generation. It may be better to do this type registration with a DI provider.

## References

* https://github.com/cosmos/cosmos-sdk/blob/c3edbb22cab8678c35e21fe0253919996b780c01/simapp/app.go
* https://github.com/allinbits/cosmos-sdk-poc
* https://github.com/uber-go/dig
* https://github.com/google/wire
* https://pkg.go.dev/github.com/cosmos/cosmos-sdk/container
* https://github.com/cosmos/cosmos-sdk/pull/11802
* [ADR 063](./adr-063-core-module-api.md)
