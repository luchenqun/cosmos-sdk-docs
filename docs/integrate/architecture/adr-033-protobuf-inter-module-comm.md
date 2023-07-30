# ADR 033: 基于 Protobuf 的模块间通信

## 变更日志

* 2020-10-05: 初始草稿

## 状态

建议中

## 摘要

本 ADR 引入了一种基于 Protobuf 的权限控制模块间通信系统，利用了在 [ADR 021](adr-021-protobuf-query-encoding.md) 和 [ADR 031](adr-031-msg-service.md) 中定义的 `Query` 和 `Msg` 服务定义，提供了以下功能：

* 稳定的基于 Protobuf 的模块接口，可以潜在地替代 keeper 模式
* 更强大的模块间对象能力 (OCAPs) 保证
* 模块账户和子账户授权

## 背景

在当前的 Cosmos SDK 文档中关于[对象能力模型](../../develop/advanced-concepts/10-ocap.md)中指出：

> 我们假设一个繁荣的 Cosmos SDK 模块生态系统，可以轻松组合成区块链应用程序，其中包含有故障或恶意模块。

目前并没有一个繁荣的 Cosmos SDK 模块生态系统。我们假设这部分原因是由于：

1. 缺乏一个稳定的 v1.0 Cosmos SDK 作为模块构建的基础。模块接口在不同的点发布版本中经常发生变化，有时变化很大，虽然这通常是有充分理由的，但这并不能构建一个稳定的基础。
2. 缺乏一个正确实现的对象能力甚至面向对象封装系统，这使得模块 keeper 接口的重构是不可避免的，因为当前的接口受到了很差的限制。

### `x/bank` 案例研究

目前的 `x/bank` keeper 几乎允许任何引用它的模块具有无限制的访问权限。例如，`SetBalance` 方法允许调用者将任何账户的余额设置为任何值，甚至绕过对供应量的正确跟踪。

似乎后来有一些尝试使用模块级别的铸币、质押和销毁权限来实现某种程度的对象能力。这些权限允许模块以模块自己的账户为参考进行铸币、销毁或委托代币。这些权限实际上以 `[]string` 数组的形式存储在状态中的 `ModuleAccount` 类型中。

然而，这些权限实际上并没有起到太大的作用。它们只控制了`MintCoins`、`BurnCoins`和`DelegateCoins***`方法中可以引用哪些模块，但是并没有唯一的对象能力令牌来控制访问，只是一个简单的字符串。因此，`x/upgrade`模块可以通过调用`MintCoins("staking")`来为`x/staking`模块铸造代币。此外，所有具有访问这些 keeper 方法权限的模块也可以访问`SetBalance`，从而使任何其他尝试实现 OCAPs 和甚至基本的面向对象封装都变得无效。

## 决策

根据[ADR-021](adr-021-protobuf-query-encoding.md)和[ADR-031](adr-031-msg-service.md)，我们引入了用于安全模块授权和 OCAPs 的模块间通信框架。一旦实施，这也可以作为传递 keeper 在模块之间的现有范例的替代方案。这里概述的方法旨在构建一个提供必要的稳定性和封装性保证的 Cosmos SDK v1.0，以促进一个繁荣的模块生态系统的出现。

特别值得注意的是，决策是_启用_这个功能，供模块自行决定是否采用。将现有模块迁移到这种新范例的提案将需要另外进行讨论，可能作为对本ADR的修正来解决。

### 新的 "Keeper" 范例

在[ADR 021](adr-021-protobuf-query-encoding.md)中，引入了使用 protobuf 服务定义来定义查询器的机制；在[ADR 31](adr-031-msg-service.md)中，引入了使用 protobuf 服务来定义 `Msg` 的机制。Protobuf 服务定义会生成两个表示服务的客户端和服务器端的 golang 接口，以及一些辅助代码。下面是银行 `cosmos.bank.Msg/Send` 消息类型的一个最简示例：

```go
package bank

type MsgClient interface {
	Send(context.Context, *MsgSend, opts ...grpc.CallOption) (*MsgSendResponse, error)
}

type MsgServer interface {
	Send(context.Context, *MsgSend) (*MsgSendResponse, error)
}
```

[ADR 021](adr-021-protobuf-query-encoding.md)和[ADR 31](adr-031-msg-service.md)指定了模块如何实现生成的 `QueryServer` 和 `MsgServer` 接口，作为传统查询器和 `Msg` 处理程序的替代方案。

在这个ADR中，我们解释了模块如何使用生成的`QueryClient`和`MsgClient`接口进行查询和发送`Msg`到其他模块，并提出将这种机制作为现有`Keeper`范例的替代品。需要明确的是，这个ADR并不需要创建新的protobuf定义或服务。相反，它利用了已经被客户端用于模块间通信的相同的基于proto的服务接口。

使用这种`QueryClient`/`MsgClient`方法相对于向外部模块暴露keepers具有以下关键优势：

1. 使用[buf](https://buf.build/docs/breaking-overview)检查Protobuf类型是否存在破坏性更改，并且由于protobuf的设计方式，这将为我们提供强大的向后兼容性保证，同时允许向前演进。
2. 客户端和服务器接口之间的分离将允许我们在两者之间插入权限检查代码，检查一个模块是否被授权将指定的`Msg`发送给另一个模块，从而提供适当的对象能力系统（见下文）。
3. 用于模块间通信的路由器为我们提供了一个方便的地方来处理事务的回滚，从而实现操作的原子性（[目前存在的问题](https://github.com/cosmos/cosmos-sdk/issues/8030)）。在模块间调用中的任何失败都将导致整个事务的失败。

这种机制还具有以下优点：

* 通过代码生成减少样板代码
* 允许使用其他语言的模块，可以通过类似CosmWasm的虚拟机或使用gRPC的子进程来实现

### 模块间通信

为了使用由protobuf编译器生成的`Client`，我们需要一个`grpc.ClientConn`[接口](https://github.com/grpc/grpc-go/blob/v1.49.x/clientconn.go#L441-L450)的实现。为此，我们引入了一个新类型`ModuleKey`，它实现了`grpc.ClientConn`接口。`ModuleKey`可以被视为与模块账户对应的"私钥"，其中通过使用一个特殊的`Invoker()`函数提供身份验证，下面将详细介绍。

区块链用户（外部客户端）使用其账户的私钥对包含`Msg`的交易进行签名，其中他们被列为签署者（每个消息使用`Msg.GetSigner`指定所需的签署者）。身份验证检查由`AnteHandler`执行。

在这里，我们通过允许模块在`Msg.GetSigners`中被识别来扩展这个过程。当一个模块想要触发另一个模块中的`Msg`的执行时，它的`ModuleKey`充当发送者（通过我们下面描述的`ClientConn`接口）并被设置为唯一的“签署者”。值得注意的是，在这种情况下我们不使用任何加密签名。
例如，模块`A`可以使用其`A.ModuleKey`为`/cosmos.bank.Msg/Send`交易创建`MsgSend`对象。`MsgSend`的验证将确保`from`账户（在这种情况下是`A.ModuleKey`）是签署者。

以下是一个假设的模块`foo`与`x/bank`交互的示例：

```go
package foo


type FooMsgServer {
  // ...

  bankQuery bank.QueryClient
  bankMsg   bank.MsgClient
}

func NewFooMsgServer(moduleKey RootModuleKey, ...) FooMsgServer {
  // ...

  return FooMsgServer {
    // ...
    modouleKey: moduleKey,
    bankQuery: bank.NewQueryClient(moduleKey),
    bankMsg: bank.NewMsgClient(moduleKey),
  }
}

func (foo *FooMsgServer) Bar(ctx context.Context, req *MsgBarRequest) (*MsgBarResponse, error) {
  balance, err := foo.bankQuery.Balance(&bank.QueryBalanceRequest{Address: fooMsgServer.moduleKey.Address(), Denom: "foo"})

  ...

  res, err := foo.bankMsg.Send(ctx, &bank.MsgSendRequest{FromAddress: fooMsgServer.moduleKey.Address(), ...})

  ...
}
```

这个设计也旨在可扩展到覆盖更细粒度的权限控制用例，比如根据特定模块限制特定前缀的铸币（如[#7459](https://github.com/cosmos/cosmos-sdk/pull/7459#discussion_r529545528)中讨论的）。

### `ModuleKey`和`ModuleID`

`ModuleKey`可以被视为模块账户的“私钥”，而`ModuleID`可以被视为相应的“公钥”。根据[ADR 028](adr-028-public-key-addresses.md)，模块可以拥有根模块账户和任意数量的子账户或派生账户，用于不同的池（例如质押池）或管理账户（例如群组账户）。我们还可以将模块子账户视为类似于派生密钥 - 存在一个根密钥，然后是一些派生路径。`ModuleID`是一个简单的结构，包含模块名称和可选的“派生”路径，并根据[ADR-028](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-028-public-key-addresses.md)中的`AddressHash`方法形成其地址：

```go
type ModuleID struct {
  ModuleName string
  Path []byte
}

func (key ModuleID) Address() []byte {
  return AddressHash(key.ModuleName, key.Path)
}
```

除了能够生成 `ModuleID` 和地址之外，`ModuleKey` 还包含一个特殊的函数叫做 `Invoker`，它是安全的模块间访问的关键。`Invoker` 创建了一个 `InvokeFn` 闭包，它被用作 `grpc.ClientConn` 接口中的 `Invoke` 方法，在底层能够将消息路由到适当的 `Msg` 和 `Query` 处理程序，并对 `Msg` 执行适当的安全检查。这比 keeper 的安全性更高，因为 keeper 的私有成员变量可以通过反射进行操作。Golang 不支持对函数闭包的捕获变量进行反射，而且为了绕过 `ModuleKey` 的安全性，需要直接操作内存。

`ModuleKey` 有两种类型：`RootModuleKey` 和 `DerivedModuleKey`：

```go
type Invoker func(callInfo CallInfo) func(ctx context.Context, request, response interface{}, opts ...interface{}) error

type CallInfo {
  Method string
  Caller ModuleID
}

type RootModuleKey struct {
  moduleName string
  invoker Invoker
}

func (rm RootModuleKey) Derive(path []byte) DerivedModuleKey { /* ... */}

type DerivedModuleKey struct {
  moduleName string
  path []byte
  invoker Invoker
}
```

一个模块可以通过在 `RootModuleKey` 上使用 `Derive(path []byte)` 方法来获得对 `DerivedModuleKey` 的访问权限，然后可以使用该密钥来验证来自子账户的 `Msg`。例如：

```go
package foo

func (fooMsgServer *MsgServer) Bar(ctx context.Context, req *MsgBar) (*MsgBarResponse, error) {
  derivedKey := fooMsgServer.moduleKey.Derive(req.SomePath)
  bankMsgClient := bank.NewMsgClient(derivedKey)
  res, err := bankMsgClient.Balance(ctx, &bank.MsgSend{FromAddress: derivedKey.Address(), ...})
  ...
}
```

通过这种方式，一个模块可以获得对根账户和任意数量的子账户的有权限的访问，并从这些账户发送经过身份验证的 `Msg`。`Invoker` 的 `callInfo.Caller` 参数在底层用于区分不同的模块账户，但无论如何，`Invoker` 返回的函数只允许来自根账户或派生模块账户的 `Msg` 通过。

请注意，`Invoker` 本身返回一个基于传入的 `CallInfo` 的函数闭包。这将允许将来的客户端实现为每种方法类型缓存调用函数，避免哈希表查找的开销。这将减少此模块间通信方法的性能开销，仅保留检查权限所需的最低限度。

再次强调，闭包只允许访问经授权的调用。无论如何，没有访问其他任何内容的权限，无论是否进行了任何名称冒充。

下面是 `RootModuleKey` 的 `grpc.ClientConn.Invoke` 实现的大致草图：

```go
func (key RootModuleKey) Invoke(ctx context.Context, method string, args, reply interface{}, opts ...grpc.CallOption) error {
  f := key.invoker(CallInfo {Method: method, Caller: ModuleID {ModuleName: key.moduleName}})
  return f(ctx, args, reply)
}
```

### `AppModule` 的连接和要求

在 [ADR 031](adr-031-msg-service.md) 中，引入了 `AppModule.RegisterService(Configurator)` 方法。为了支持模块间的通信，我们扩展了 `Configurator` 接口，传入了 `ModuleKey` 并允许模块使用 `RequireServer()` 来指定它们对其他模块的依赖关系：

```go
type Configurator interface {
   MsgServer() grpc.Server
   QueryServer() grpc.Server

   ModuleKey() ModuleKey
   RequireServer(msgServer interface{})
}
```

`ModuleKey` 在 `RegisterService` 方法中传递给模块，使得 `RegisterServices` 成为配置模块服务的唯一入口点。这也旨在大大减少 `app.go` 中的样板代码。目前，`ModuleKey` 将基于 `AppModuleBasic.Name()` 创建，但将来可能会引入更灵活的系统。`ModuleManager` 将在后台处理模块账户的创建。

由于模块不再直接访问彼此，模块可能存在未满足的依赖关系。为了确保模块依赖关系在启动时得到解决，应添加 `Configurator.RequireServer` 方法。`ModuleManager` 将确保在应用程序启动之前可以解决所有使用 `RequireServer` 声明的依赖关系。例如，模块 `foo` 可以这样声明对 `x/bank` 的依赖关系：

```go
package foo

func (am AppModule) RegisterServices(cfg Configurator) {
  cfg.RequireServer((*bank.QueryServer)(nil))
  cfg.RequireServer((*bank.MsgServer)(nil))
}
```

### 安全注意事项

除了检查 `ModuleKey` 权限外，底层路由基础设施还需要采取一些额外的安全预防措施。

#### 递归和重入

递归或重入方法调用可能构成潜在的安全威胁。如果模块 A 调用模块 B，而模块 B 在同一次调用中再次调用模块 A，这可能会成为一个问题。

路由系统处理这个问题的一种基本方法是维护一个调用堆栈，防止模块在调用堆栈中被引用多次，从而避免重入。路由中的 `map[string]interface{}` 表可以用于执行此安全检查。

#### 查询

Cosmos SDK 中的查询通常不需要权限，因此允许一个模块查询另一个模块不会带来任何重大安全威胁，假设采取了基本的预防措施。路由系统需要采取的基本预防措施是确保传递给查询方法的 `sdk.Context` 不允许对存储进行写操作。目前可以通过像 `BaseApp` 查询中当前所做的那样使用 `CacheMultiStore` 来实现这一点。

### 内部方法

在许多情况下，我们可能希望模块调用其他模块的方法，而这些方法对客户端完全不可见。为此，我们在 `Configurator` 中添加了 `InternalServer` 方法：

```go
type Configurator interface {
   MsgServer() grpc.Server
   QueryServer() grpc.Server
   InternalServer() grpc.Server
}
```

例如，x/slashing 的 Slash 必须调用 x/staking 的 Slash，但我们不希望将 x/staking 的 Slash 暴露给最终用户和客户端。

内部的 protobuf 服务将在给定模块的 proto 包中的相应 `internal.proto` 文件中定义。

注册到 `InternalServer` 的服务可以被其他模块调用，但不能被外部客户端调用。

解决内部方法的另一种方案可能涉及到钩子/插件，如[此处](https://github.com/cosmos/cosmos-sdk/pull/7459#issuecomment-733807753)所讨论的。关于钩子/插件系统的更详细评估将在此 ADR 的后续或作为单独的 ADR 中进行讨论。

### 授权

默认情况下，模块间路由器要求消息由 `GetSigners` 返回的第一个签名者发送。模块间路由器还应接受授权中间件，例如[ADR 030](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-030-authz-module.md)提供的授权中间件。此中间件将允许账户以其他模块账户的身份执行操作。授权中间件应考虑授予某些模块对其他模块具有“管理员”特权的需求。这将在单独的 ADR 或对此 ADR 的更新中进行讨论。

### 未来工作

其他未来的改进可能包括：

* 自定义代码生成，可以：
    * 简化接口（例如，生成使用 `sdk.Context` 而不是 `context.Context` 的代码）
    * 优化模块间调用 - 例如，在第一次调用后缓存已解析的方法
* 将 `StoreKey` 和 `ModuleKey` 合并为单个接口，以便模块具有单个 OCAPs 句柄
* 使模块间通信的代码生成更高效
* 将 `ModuleKey` 的创建与 `AppModuleBasic.Name()` 解耦，以便应用程序可以覆盖根模块账户名称
* 模块间钩子和插件的解耦

## 替代方案

### MsgServices vs `x/capability`

`x/capability` 模块提供了一个适用于 Cosmos SDK 中任何模块的适当的对象能力实现，甚至可以用于模块间的 OCAP，如 [\#5931](https://github.com/cosmos/cosmos-sdk/issues/5931) 中所述。

这个 ADR 中描述的方法的优势主要在于它如何与 Cosmos SDK 的其他部分集成，具体来说：

* 使用 protobuf，以便：
    * 可以利用接口的代码生成来提供更好的开发体验
    * 模块接口可以进行版本控制，并使用 [buf](https://docs.buf.build/breaking-overview) 进行断裂检查
* 子模块账户，根据 ADR 028
* 通用的 `Msg` 传递范式以及通过 `GetSigners` 指定签名者的方式

此外，这是对 keeper 的完全替代，可以应用于_所有_模块间通信，而 #5931 中的 `x/capability` 方法需要逐个方法地应用。

## 结果

### 向后兼容性

这个 ADR 旨在提供一种路径，以实现模块之间更长期的兼容性。在短期内，这可能会导致破坏某些过于宽松的 `Keeper` 接口和/或完全替换 `Keeper` 接口。

### 积极的

* 一个可以更容易实现稳定模块间接口的 keeper 替代方案
* 适当的模块间 OCAP
* 改进的模块开发者 DevX，正如几位参与者在 [Architecture Review Call, Dec 3](https://hackmd.io/E0wxxOvRQ5qVmTf6N_k84Q) 中所评论的
* 为一个大大简化的 `app.go` 打下了基础
* 路由器可以设置为强制执行模块间调用的原子事务

### 负面的

* 采用这种方法的模块需要进行重大重构

### 中性的

## 测试用例 [可选]

## 参考资料

* [ADR 021](adr-021-protobuf-query-encoding.md)
* [ADR 031](adr-031-msg-service.md)
* [ADR 028](adr-028-public-key-addresses.md)
* [ADR 030 draft](https://github.com/cosmos/cosmos-sdk/pull/7105)
* [对象能力模型](https://docs.network.com/main/core/ocap)

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


# ADR 033: Protobuf-based Inter-Module Communication

## Changelog

* 2020-10-05: Initial Draft

## Status

Proposed

## Abstract

This ADR introduces a system for permissioned inter-module communication leveraging the protobuf `Query` and `Msg`
service definitions defined in [ADR 021](adr-021-protobuf-query-encoding.md) and
[ADR 031](adr-031-msg-service.md) which provides:

* stable protobuf based module interfaces to potentially later replace the keeper paradigm
* stronger inter-module object capabilities (OCAPs) guarantees
* module accounts and sub-account authorization

## Context

In the current Cosmos SDK documentation on the [Object-Capability Model](../../develop/advanced-concepts/10-ocap.md), it is stated that:

> We assume that a thriving ecosystem of Cosmos SDK modules that are easy to compose into a blockchain application will contain faulty or malicious modules.

There is currently not a thriving ecosystem of Cosmos SDK modules. We hypothesize that this is in part due to:

1. lack of a stable v1.0 Cosmos SDK to build modules off of. Module interfaces are changing, sometimes dramatically, from
point release to point release, often for good reasons, but this does not create a stable foundation to build on.
2. lack of a properly implemented object capability or even object-oriented encapsulation system which makes refactors
of module keeper interfaces inevitable because the current interfaces are poorly constrained.

### `x/bank` Case Study

Currently the `x/bank` keeper gives pretty much unrestricted access to any module which references it. For instance, the
`SetBalance` method allows the caller to set the balance of any account to anything, bypassing even proper tracking of supply.

There appears to have been some later attempts to implement some semblance of OCAPs using module-level minting, staking
and burning permissions. These permissions allow a module to mint, burn or delegate tokens with reference to the module’s
own account. These permissions are actually stored as a `[]string` array on the `ModuleAccount` type in state.

However, these permissions don’t really do much. They control what modules can be referenced in the `MintCoins`,
`BurnCoins` and `DelegateCoins***` methods, but for one there is no unique object capability token that controls access —
just a simple string. So the `x/upgrade` module could mint tokens for the `x/staking` module simple by calling
`MintCoins(“staking”)`. Furthermore, all modules which have access to these keeper methods, also have access to
`SetBalance` negating any other attempt at OCAPs and breaking even basic object-oriented encapsulation.

## Decision

Based on [ADR-021](adr-021-protobuf-query-encoding.md) and [ADR-031](adr-031-msg-service.md), we introduce the
Inter-Module Communication framework for secure module authorization and OCAPs.
When implemented, this could also serve as an alternative to the existing paradigm of passing keepers between
modules. The approach outlined here-in is intended to form the basis of a Cosmos SDK v1.0 that provides the necessary
stability and encapsulation guarantees that allow a thriving module ecosystem to emerge.

Of particular note — the decision is to _enable_ this functionality for modules to adopt at their own discretion.
Proposals to migrate existing modules to this new paradigm will have to be a separate conversation, potentially
addressed as amendments to this ADR.

### New "Keeper" Paradigm

In [ADR 021](adr-021-protobuf-query-encoding.md), a mechanism for using protobuf service definitions to define queriers
was introduced and in [ADR 31](adr-031-msg-service.md), a mechanism for using protobuf service to define `Msg`s was added.
Protobuf service definitions generate two golang interfaces representing the client and server sides of a service plus
some helper code. Here is a minimal example for the bank `cosmos.bank.Msg/Send` message type:

```go
package bank

type MsgClient interface {
	Send(context.Context, *MsgSend, opts ...grpc.CallOption) (*MsgSendResponse, error)
}

type MsgServer interface {
	Send(context.Context, *MsgSend) (*MsgSendResponse, error)
}
```

[ADR 021](adr-021-protobuf-query-encoding.md) and [ADR 31](adr-031-msg-service.md) specifies how modules can implement the generated `QueryServer`
and `MsgServer` interfaces as replacements for the legacy queriers and `Msg` handlers respectively.

In this ADR we explain how modules can make queries and send `Msg`s to other modules using the generated `QueryClient`
and `MsgClient` interfaces and propose this mechanism as a replacement for the existing `Keeper` paradigm. To be clear,
this ADR does not necessitate the creation of new protobuf definitions or services. Rather, it leverages the same proto
based service interfaces already used by clients for inter-module communication.

Using this `QueryClient`/`MsgClient` approach has the following key benefits over exposing keepers to external modules:

1. Protobuf types are checked for breaking changes using [buf](https://buf.build/docs/breaking-overview) and because of
the way protobuf is designed this will give us strong backwards compatibility guarantees while allowing for forward
evolution.
2. The separation between the client and server interfaces will allow us to insert permission checking code in between
the two which checks if one module is authorized to send the specified `Msg` to the other module providing a proper
object capability system (see below).
3. The router for inter-module communication gives us a convenient place to handle rollback of transactions,
enabling atomicy of operations ([currently a problem](https://github.com/cosmos/cosmos-sdk/issues/8030)). Any failure within a module-to-module call would result in a failure of the entire
transaction

This mechanism has the added benefits of:

* reducing boilerplate through code generation, and
* allowing for modules in other languages either via a VM like CosmWasm or sub-processes using gRPC

### Inter-module Communication

To use the `Client` generated by the protobuf compiler we need a `grpc.ClientConn` [interface](https://github.com/grpc/grpc-go/blob/v1.49.x/clientconn.go#L441-L450)
implementation. For this we introduce
a new type, `ModuleKey`, which implements the `grpc.ClientConn` interface. `ModuleKey` can be thought of as the "private
key" corresponding to a module account, where authentication is provided through use of a special `Invoker()` function,
described in more detail below.

Blockchain users (external clients) use their account's private key to sign transactions containing `Msg`s where they are listed as signers (each
message specifies required signers with `Msg.GetSigner`). The authentication checks is performed by `AnteHandler`.

Here, we extend this process, by allowing modules to be identified in `Msg.GetSigners`. When a module wants to trigger the execution a `Msg` in another module,
its `ModuleKey` acts as the sender (through the `ClientConn` interface we describe below) and is set as a sole "signer". It's worth to note
that we don't use any cryptographic signature in this case.
For example, module `A` could use its `A.ModuleKey` to create `MsgSend` object for `/cosmos.bank.Msg/Send` transaction. `MsgSend` validation
will assure that the `from` account (`A.ModuleKey` in this case) is the signer.

Here's an example of a hypothetical module `foo` interacting with `x/bank`:

```go
package foo


type FooMsgServer {
  // ...

  bankQuery bank.QueryClient
  bankMsg   bank.MsgClient
}

func NewFooMsgServer(moduleKey RootModuleKey, ...) FooMsgServer {
  // ...

  return FooMsgServer {
    // ...
    modouleKey: moduleKey,
    bankQuery: bank.NewQueryClient(moduleKey),
    bankMsg: bank.NewMsgClient(moduleKey),
  }
}

func (foo *FooMsgServer) Bar(ctx context.Context, req *MsgBarRequest) (*MsgBarResponse, error) {
  balance, err := foo.bankQuery.Balance(&bank.QueryBalanceRequest{Address: fooMsgServer.moduleKey.Address(), Denom: "foo"})

  ...

  res, err := foo.bankMsg.Send(ctx, &bank.MsgSendRequest{FromAddress: fooMsgServer.moduleKey.Address(), ...})

  ...
}
```

This design is also intended to be extensible to cover use cases of more fine grained permissioning like minting by
denom prefix being restricted to certain modules (as discussed in
[#7459](https://github.com/cosmos/cosmos-sdk/pull/7459#discussion_r529545528)).

### `ModuleKey`s and `ModuleID`s

A `ModuleKey` can be thought of as a "private key" for a module account and a `ModuleID` can be thought of as the
corresponding "public key". From the [ADR 028](adr-028-public-key-addresses.md), modules can have both a root module account and any number of sub-accounts
or derived accounts that can be used for different pools (ex. staking pools) or managed accounts (ex. group
accounts). We can also think of module sub-accounts as similar to derived keys - there is a root key and then some
derivation path. `ModuleID` is a simple struct which contains the module name and optional "derivation" path,
and forms its address based on the `AddressHash` method from [the ADR-028](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-028-public-key-addresses.md):

```go
type ModuleID struct {
  ModuleName string
  Path []byte
}

func (key ModuleID) Address() []byte {
  return AddressHash(key.ModuleName, key.Path)
}
```

In addition to being able to generate a `ModuleID` and address, a `ModuleKey` contains a special function called
`Invoker` which is the key to safe inter-module access. The `Invoker` creates an `InvokeFn` closure which is used as an `Invoke` method in
the `grpc.ClientConn` interface and under the hood is able to route messages to the appropriate `Msg` and `Query` handlers
performing appropriate security checks on `Msg`s. This allows for even safer inter-module access than keeper's whose
private member variables could be manipulated through reflection. Golang does not support reflection on a function
closure's captured variables and direct manipulation of memory would be needed for a truly malicious module to bypass
the `ModuleKey` security.

The two `ModuleKey` types are `RootModuleKey` and `DerivedModuleKey`:

```go
type Invoker func(callInfo CallInfo) func(ctx context.Context, request, response interface{}, opts ...interface{}) error

type CallInfo {
  Method string
  Caller ModuleID
}

type RootModuleKey struct {
  moduleName string
  invoker Invoker
}

func (rm RootModuleKey) Derive(path []byte) DerivedModuleKey { /* ... */}

type DerivedModuleKey struct {
  moduleName string
  path []byte
  invoker Invoker
}
```

A module can get access to a `DerivedModuleKey`, using the `Derive(path []byte)` method on `RootModuleKey` and then
would use this key to authenticate `Msg`s from a sub-account. Ex:

```go
package foo

func (fooMsgServer *MsgServer) Bar(ctx context.Context, req *MsgBar) (*MsgBarResponse, error) {
  derivedKey := fooMsgServer.moduleKey.Derive(req.SomePath)
  bankMsgClient := bank.NewMsgClient(derivedKey)
  res, err := bankMsgClient.Balance(ctx, &bank.MsgSend{FromAddress: derivedKey.Address(), ...})
  ...
}
```

In this way, a module can gain permissioned access to a root account and any number of sub-accounts and send
authenticated `Msg`s from these accounts. The `Invoker` `callInfo.Caller` parameter is used under the hood to
distinguish between different module accounts, but either way the function returned by `Invoker` only allows `Msg`s
from either the root or a derived module account to pass through.

Note that `Invoker` itself returns a function closure based on the `CallInfo` passed in. This will allow client implementations
in the future that cache the invoke function for each method type avoiding the overhead of hash table lookup.
This would reduce the performance overhead of this inter-module communication method to the bare minimum required for
checking permissions.

To re-iterate, the closure only allows access to authorized calls. There is no access to anything else regardless of any
name impersonation.

Below is a rough sketch of the implementation of `grpc.ClientConn.Invoke` for `RootModuleKey`:

```go
func (key RootModuleKey) Invoke(ctx context.Context, method string, args, reply interface{}, opts ...grpc.CallOption) error {
  f := key.invoker(CallInfo {Method: method, Caller: ModuleID {ModuleName: key.moduleName}})
  return f(ctx, args, reply)
}
```

### `AppModule` Wiring and Requirements

In [ADR 031](adr-031-msg-service.md), the `AppModule.RegisterService(Configurator)` method was introduced. To support
inter-module communication, we extend the `Configurator` interface to pass in the `ModuleKey` and to allow modules to
specify their dependencies on other modules using `RequireServer()`:

```go
type Configurator interface {
   MsgServer() grpc.Server
   QueryServer() grpc.Server

   ModuleKey() ModuleKey
   RequireServer(msgServer interface{})
}
```

The `ModuleKey` is passed to modules in the `RegisterService` method itself so that `RegisterServices` serves as a single
entry point for configuring module services. This is intended to also have the side-effect of greatly reducing boilerplate in
`app.go`. For now, `ModuleKey`s will be created based on `AppModuleBasic.Name()`, but a more flexible system may be
introduced in the future. The `ModuleManager` will handle creation of module accounts behind the scenes.

Because modules do not get direct access to each other anymore, modules may have unfulfilled dependencies. To make sure
that module dependencies are resolved at startup, the `Configurator.RequireServer` method should be added. The `ModuleManager`
will make sure that all dependencies declared with `RequireServer` can be resolved before the app starts. An example
module `foo` could declare it's dependency on `x/bank` like this:

```go
package foo

func (am AppModule) RegisterServices(cfg Configurator) {
  cfg.RequireServer((*bank.QueryServer)(nil))
  cfg.RequireServer((*bank.MsgServer)(nil))
}
```

### Security Considerations

In addition to checking for `ModuleKey` permissions, a few additional security precautions will need to be taken by
the underlying router infrastructure.

#### Recursion and Re-entry

Recursive or re-entrant method invocations pose a potential security threat. This can be a problem if Module A
calls Module B and Module B calls module A again in the same call.

One basic way for the router system to deal with this is to maintain a call stack which prevents a module from
being referenced more than once in the call stack so that there is no re-entry. A `map[string]interface{}` table
in the router could be used to perform this security check.

#### Queries

Queries in Cosmos SDK are generally un-permissioned so allowing one module to query another module should not pose
any major security threats assuming basic precautions are taken. The basic precaution that the router system will
need to take is making sure that the `sdk.Context` passed to query methods does not allow writing to the store. This
can be done for now with a `CacheMultiStore` as is currently done for `BaseApp` queries.

### Internal Methods

In many cases, we may wish for modules to call methods on other modules which are not exposed to clients at all. For this
purpose, we add the `InternalServer` method to `Configurator`:

```go
type Configurator interface {
   MsgServer() grpc.Server
   QueryServer() grpc.Server
   InternalServer() grpc.Server
}
```

As an example, x/slashing's Slash must call x/staking's Slash, but we don't want to expose x/staking's Slash to end users
and clients.

Internal protobuf services will be defined in a corresponding `internal.proto` file in the given module's
proto package.

Services registered against `InternalServer` will be callable from other modules but not by external clients.

An alternative solution to internal-only methods could involve hooks / plugins as discussed [here](https://github.com/cosmos/cosmos-sdk/pull/7459#issuecomment-733807753).
A more detailed evaluation of a hooks / plugin system will be addressed later in follow-ups to this ADR or as a separate
ADR.

### Authorization

By default, the inter-module router requires that messages are sent by the first signer returned by `GetSigners`. The
inter-module router should also accept authorization middleware such as that provided by [ADR 030](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-030-authz-module.md).
This middleware will allow accounts to otherwise specific module accounts to perform actions on their behalf.
Authorization middleware should take into account the need to grant certain modules effectively "admin" privileges to
other modules. This will be addressed in separate ADRs or updates to this ADR.

### Future Work

Other future improvements may include:

* custom code generation that:
    * simplifies interfaces (ex. generates code with `sdk.Context` instead of `context.Context`)
    * optimizes inter-module calls - for instance caching resolved methods after first invocation
* combining `StoreKey`s and `ModuleKey`s into a single interface so that modules have a single OCAPs handle
* code generation which makes inter-module communication more performant
* decoupling `ModuleKey` creation from `AppModuleBasic.Name()` so that app's can override root module account names
* inter-module hooks and plugins

## Alternatives

### MsgServices vs `x/capability`

The `x/capability` module does provide a proper object-capability implementation that can be used by any module in the
Cosmos SDK and could even be used for inter-module OCAPs as described in [\#5931](https://github.com/cosmos/cosmos-sdk/issues/5931).

The advantages of the approach described in this ADR are mostly around how it integrates with other parts of the Cosmos SDK,
specifically:

* protobuf so that:
    * code generation of interfaces can be leveraged for a better dev UX
    * module interfaces are versioned and checked for breakage using [buf](https://docs.buf.build/breaking-overview)
* sub-module accounts as per ADR 028
* the general `Msg` passing paradigm and the way signers are specified by `GetSigners`

Also, this is a complete replacement for keepers and could be applied to _all_ inter-module communication whereas the
`x/capability` approach in #5931 would need to be applied method by method.

## Consequences

### Backwards Compatibility

This ADR is intended to provide a pathway to a scenario where there is greater long term compatibility between modules.
In the short-term, this will likely result in breaking certain `Keeper` interfaces which are too permissive and/or
replacing `Keeper` interfaces altogether.

### Positive

* an alternative to keepers which can more easily lead to stable inter-module interfaces
* proper inter-module OCAPs
* improved module developer DevX, as commented on by several particpants on
    [Architecture Review Call, Dec 3](https://hackmd.io/E0wxxOvRQ5qVmTf6N_k84Q)
* lays the groundwork for what can be a greatly simplified `app.go`
* router can be setup to enforce atomic transactions for module-to-module calls

### Negative

* modules which adopt this will need significant refactoring

### Neutral

## Test Cases [optional]

## References

* [ADR 021](adr-021-protobuf-query-encoding.md)
* [ADR 031](adr-031-msg-service.md)
* [ADR 028](adr-028-public-key-addresses.md)
* [ADR 030 draft](https://github.com/cosmos/cosmos-sdk/pull/7105)
* [Object-Capability Model](https://docs.network.com/main/core/ocap)
