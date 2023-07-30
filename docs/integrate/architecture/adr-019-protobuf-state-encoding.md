# ADR 019: Protocol Buffer 状态编码

## 更新日志

* 2020年2月15日：初稿
* 2020年2月24日：更新以处理带有接口字段的消息
* 2020年4月27日：将接口的 `oneof` 用法转换为 `Any`
* 2020年5月15日：描述 `cosmos_proto` 扩展和 amino 兼容性
* 2020年12月4日：将 `MarshalAny` 和 `UnmarshalAny` 移动并重命名为 `codec.Codec` 接口中的方法
* 2021年2月24日：删除对 `HybridCodec` 的提及，该功能已在 [#6843](https://github.com/cosmos/cosmos-sdk/pull/6843) 中被废弃。

## 状态

已接受

## 背景

目前，Cosmos SDK 在二进制和 JSON 对象编码上使用 [go-amino](https://github.com/tendermint/go-amino/)，以在逻辑对象和持久化对象之间实现一致性。

根据 Amino 文档：

> Amino 是一种对象编码规范。它是 Proto3 的一个子集，具有对接口的扩展支持。有关 Proto3 的更多信息，请参阅 [Proto3 规范](https://developers.google.com/protocol-buffers/docs/proto3)。Amino 在很大程度上与 Proto3 兼容（但与 Proto2 不兼容）。
>
> Amino 编码协议的目标是在逻辑对象和持久化对象之间实现一致性。

Amino 还旨在实现以下目标（不完整列表）：

* 二进制字节必须可以使用模式进行解码。
* 模式必须可以升级。
* 编码器和解码器的逻辑必须相对简单。

然而，我们认为 Amino 并未完全实现这些目标，并且无法完全满足 Cosmos SDK 中真正灵活的跨语言和多客户端兼容的编码协议的需求。特别是，在支持各种语言编写的客户端之间提供真正的向后兼容性和可升级性方面，Amino 已经被证明是一个巨大的痛点。此外，通过分析和各种基准测试，Amino 已被证明是 Cosmos SDK 中极大的性能瓶颈<sup>1</sup>。这在模拟和应用程序事务吞吐量的性能上得到了很大的体现。

因此，我们需要采用符合以下状态序列化标准的编码协议：

* 与语言无关
* 与平台无关
* 支持丰富的客户端和繁荣的生态系统
* 高性能
* 编码后消息尺寸最小
* 基于代码生成而非反射
* 支持向后和向前兼容

请注意，迁移离开 Amino 应被视为一个双管齐下的方法，即状态和客户端编码。
本文档重点讨论 Cosmos SDK 状态机中的状态序列化。将会有一个相应的文档来解决客户端编码问题。

## 决策

我们将采用 [Protocol Buffers](https://developers.google.com/protocol-buffers) 来序列化 Cosmos SDK 中的持久化结构化数据，同时为希望继续使用 Amino 的应用程序提供清晰的机制和开发者体验。我们将通过更新模块以接受一个编解码器接口 `Marshaler`，而不是具体的 Amino 编解码器，来提供这个机制。此外，Cosmos SDK 将提供两个 `Marshaler` 接口的具体实现：`AminoCodec` 和 `ProtoCodec`。

* `AminoCodec`：使用 Amino 进行二进制和 JSON 编码。
* `ProtoCodec`：使用 Protobuf 进行二进制和 JSON 编码。

模块将使用在应用程序中实例化的编解码器。默认情况下，Cosmos SDK 的 `simapp` 在 `MakeTestEncodingConfig` 函数中实例化一个 `ProtoCodec` 作为 `Marshaler` 的具体实现。如果应用程序开发者希望，可以轻松地覆盖这个设置。

最终目标是用 Protobuf 编码替换 Amino JSON 编码，从而使模块接受和/或扩展 `ProtoCodec`。在那之前，Amino JSON 仍然提供给遗留用例。Cosmos SDK 中仍然有一些地方硬编码了 Amino JSON，例如遗留 API REST 端点和 `x/params` 存储。计划逐步将它们转换为 Protobuf。

### 模块编解码器

对于不需要处理和序列化接口的模块，迁移到 Protobuf 的路径非常直接。这些模块只需将通过具体的 Amino 编解码器进行编码和持久化的任何现有类型迁移到 Protobuf，并使其 keeper 接受一个 `Marshaler`，该 `Marshaler` 将是一个 `ProtoCodec`。这个迁移非常简单，因为现有的代码将继续正常工作。

注意，任何需要对`bool`或`int64`等原始类型进行编码的业务逻辑都应该使用[gogoprotobuf](https://github.com/cosmos/gogoproto)值类型。

示例：

```go
  ts, err := gogotypes.TimestampProto(completionTime)
  if err != nil {
    // ...
  }

  bz := cdc.MustMarshal(ts)
```

然而，模块在目的和设计上可能有很大的差异，因此我们必须支持模块能够编码和处理接口（例如`Account`或`Content`）的能力。对于这些模块，它们必须定义自己的编解码器接口，扩展`Marshaler`。这些特定接口是模块独有的，并且将包含知道如何序列化所需接口的方法约定。

示例：

```go
// x/auth/types/codec.go

type Codec interface {
  codec.Codec

  MarshalAccount(acc exported.Account) ([]byte, error)
  UnmarshalAccount(bz []byte) (exported.Account, error)

  MarshalAccountJSON(acc exported.Account) ([]byte, error)
  UnmarshalAccountJSON(bz []byte) (exported.Account, error)
}
```

### 使用`Any`编码接口

通常情况下，模块级别的`.proto`文件应该定义消息，使用[`google.protobuf.Any`](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/any.proto)来编码接口。在[扩展讨论](https://github.com/cosmos/cosmos-sdk/issues/6030)之后，选择了`Any`作为首选方案，而不是我们原始的protobuf设计中的应用级`oneof`。支持`Any`的论点可以总结如下：

* `Any`为处理接口提供了更简单、更一致的客户端用户体验，而应用级别的`oneof`需要在应用程序之间更加仔细地协调。使用`oneof`创建通用的事务签名库可能很麻烦，并且关键逻辑可能需要为每个链重新实现。
* `Any`比`oneof`更能抵抗人为错误。
* 对于模块和应用程序来说，实现`Any`通常更简单。

使用`Any`的主要反对意见集中在其额外的空间和可能的性能开销上。将来可以通过在持久层使用压缩来处理空间开销，而性能影响可能很小。因此，不使用`Any`被视为一种过早的优化，用户体验是更高级别的关注点。

请注意，鉴于Cosmos SDK决定采用上述`Codec`接口，应用程序仍然可以选择使用`oneof`来编码状态和事务，但这不是推荐的方法。如果应用程序选择使用`oneof`而不是`Any`，它们可能会失去与支持多个链的客户端应用程序的兼容性。因此，开发人员应该仔细考虑他们更关心的是可能是一种过早的优化还是最终用户和客户端开发人员的用户体验。

### `Any`的安全使用

默认情况下，[gogo protobuf实现的`Any`](https://pkg.go.dev/github.com/cosmos/gogoproto/types)使用[全局类型注册](https://github.com/cosmos/gogoproto/blob/master/proto/properties.go#L540)来将`Any`中打包的值解码为具体的go类型。这会引入一个漏洞，即依赖树中的任何恶意模块都可以向全局protobuf注册表注册一个类型，并导致在引用该类型的事务中加载和解组。

为了防止这种情况发生，我们引入了一种类型注册机制，通过`InterfaceRegistry`接口将`Any`值解码为具体类型，这与使用Amino进行类型注册有些相似：

```go
type InterfaceRegistry interface {
    // RegisterInterface associates protoName as the public name for the
    // interface passed in as iface
    // Ex:
    //   registry.RegisterInterface("cosmos_sdk.Msg", (*sdk.Msg)(nil))
    RegisterInterface(protoName string, iface interface{})

    // RegisterImplementations registers impls as a concrete implementations of
    // the interface iface
    // Ex:
    //  registry.RegisterImplementations((*sdk.Msg)(nil), &MsgSend{}, &MsgMultiSend{})
    RegisterImplementations(iface interface{}, impls ...proto.Message)

}
```

除了作为白名单之外，`InterfaceRegistry`还可以用于向客户端传递满足接口的具体类型列表。

在.proto文件中：

* 接受接口的字段应使用`cosmos_proto.accepts_interface`进行注释，注释中使用与`InterfaceRegistry.RegisterInterface`中传递的`protoName`相同的全限定名
* 接口实现应使用`cosmos_proto.implements_interface`进行注释，注释中使用与`InterfaceRegistry.RegisterInterface`中传递的`protoName`相同的全限定名

在将来，`protoName`、`cosmos_proto.accepts_interface`、`cosmos_proto.implements_interface`可以通过代码生成、反射和/或静态检查来使用。

实现`InterfaceRegistry`的相同结构体还将实现一个用于解包`Any`的接口`InterfaceUnpacker`：

```go
type InterfaceUnpacker interface {
    // UnpackAny unpacks the value in any to the interface pointer passed in as
    // iface. Note that the type in any must have been registered with
    // RegisterImplementations as a concrete type for that interface
    // Ex:
    //    var msg sdk.Msg
    //    err := ctx.UnpackAny(any, &msg)
    //    ...
    UnpackAny(any *Any, iface interface{}) error
}
```

请注意，`InterfaceRegistry`的使用不会偏离`Any`的标准protobuf用法，它只是为golang使用引入了一个安全性和内省层。

`InterfaceRegistry`将成为上述描述的`ProtoCodec`的成员。为了让模块注册接口类型，应用程序模块可以选择实现以下接口：

```go
type InterfaceModule interface {
    RegisterInterfaceTypes(InterfaceRegistry)
}
```

模块管理器将包含一个方法，在每个实现该方法的模块上调用`RegisterInterfaceTypes`，以填充`InterfaceRegistry`。

### 使用 `Any` 编码状态

Cosmos SDK 将提供支持方法 `MarshalInterface` 和 `UnmarshalInterface` 来隐藏将接口类型包装到 `Any` 中的复杂性，并允许轻松进行序列化。

```go
import "github.com/cosmos/cosmos-sdk/codec"

// note: eviexported.Evidence is an interface type
func MarshalEvidence(cdc codec.BinaryCodec, e eviexported.Evidence) ([]byte, error) {
	return cdc.MarshalInterface(e)
}

func UnmarshalEvidence(cdc codec.BinaryCodec, bz []byte) (eviexported.Evidence, error) {
	var evi eviexported.Evidence
	err := cdc.UnmarshalInterface(&evi, bz)
    return err, nil
}
```

### 在 `sdk.Msg` 中使用 `Any`

类似的概念也适用于包含接口字段的消息。例如，我们可以将 `MsgSubmitEvidence` 定义如下，其中 `Evidence` 是一个接口：

```protobuf
// x/evidence/types/types.proto

message MsgSubmitEvidence {
  bytes submitter = 1
    [
      (gogoproto.casttype) = "github.com/cosmos/cosmos-sdk/types.AccAddress"
    ];
  google.protobuf.Any evidence = 2;
}
```

请注意，为了从 `Any` 中解包证据，我们确实需要一个对 `InterfaceRegistry` 的引用。为了在诸如 `ValidateBasic` 这样的方法中引用证据，这些方法不需要了解 `InterfaceRegistry`，我们引入了一个 `UnpackInterfaces` 阶段来进行反序列化，该阶段在需要之前解包接口。

### 解包接口

为了实现反序列化的 `UnpackInterfaces` 阶段，该阶段在需要之前解包 `Any` 中包装的接口，我们创建了一个 `sdk.Msg` 和其他类型可以实现的接口：

```go
type UnpackInterfacesMessage interface {
  UnpackInterfaces(InterfaceUnpacker) error
}
```

我们还在 `Any` 结构体本身上引入了一个私有的 `cachedValue interface{}` 字段，并提供了一个公共的 getter `GetCachedValue() interface{}`。

`UnpackInterfaces` 方法将在消息反序列化期间的 `Unmarshal` 之后调用，任何包装在 `Any` 中的接口值都将被解码并存储在 `cachedValue` 中以供以后引用。

然后，解包后的接口值可以在任何代码中安全使用，而无需了解 `InterfaceRegistry`，并且消息可以引入一个简单的 getter 来将缓存的值转换为正确的接口类型。

这样做的额外好处是，`Any` 值的反序列化仅在初始反序列化期间发生一次，而不是每次读取该值时都需要进行反序列化。此外，当首次打包 `Any` 值（例如在调用 `NewMsgSubmitEvidence` 时）时，原始接口值会被缓存，以便不需要再次进行反序列化来读取它。

`MsgSubmitEvidence` 可以实现 `UnpackInterfaces`，并添加一个方便的 getter `GetEvidence`，如下所示：

```go
func (msg MsgSubmitEvidence) UnpackInterfaces(ctx sdk.InterfaceRegistry) error {
  var evi eviexported.Evidence
  return ctx.UnpackAny(msg.Evidence, *evi)
}

func (msg MsgSubmitEvidence) GetEvidence() eviexported.Evidence {
  return msg.Evidence.GetCachedValue().(eviexported.Evidence)
}
```

### Amino 兼容性

我们的自定义 `Any` 实现可以与 Amino 无缝使用，只需使用正确的编解码器实例。这意味着嵌入在 `Any` 中的接口将像常规的 Amino 接口一样进行 Amino 编组（假设它们已经正确地在 Amino 中注册）。

为了使此功能正常工作：

* **所有旧代码必须使用 `*codec.LegacyAmino` 而不是 `*amino.Codec`，后者现在是一个正确处理 `Any` 的包装器**
* **所有新代码应使用与 amino 和 protobuf 兼容的 `Marshaler`**
* 此外，在 v0.39 之前，`codec.LegacyAmino` 将被重命名为 `codec.LegacyAmino`。

### 为什么没有选择 X

有关与其他协议的更全面比较，请参见[此处](https://codeburst.io/json-vs-protocol-buffers-vs-flatbuffers-a4247f8bda6f)。

### Cap'n Proto

虽然 [Cap’n Proto](https://capnproto.org/) 看起来是 Protobuf 的一个有利替代，因为它原生支持接口/泛型和内置规范化，但与 Protobuf 相比，它缺乏丰富的客户端生态系统，并且还不够成熟。

### FlatBuffers

[FlatBuffers](https://google.github.io/flatbuffers/) 也是一个潜在的可行替代方案，主要区别在于 FlatBuffers 不需要将数据解析/解包到二级表示形式之前，您就可以访问数据，通常与每个对象的内存分配相结合。

然而，这将需要大量的研究和全面了解迁移的范围和前进路径，这并不是立即清楚的。此外，FlatBuffers 不适用于不受信任的输入。

## 未来改进和路线图

将来，我们可能会考虑在持久化层之上添加一个压缩层，它不会更改事务或 Merkle 树哈希，但会减少 `Any` 的存储开销。此外，我们可能会采用 protobuf 命名约定，使类型 URL 更简洁，同时保持描述性。

还可以在将来探索围绕 `Any` 的使用的额外代码生成支持，以使 Go 开发人员的用户体验更加无缝。

## 后果

### 积极的

* 显著的性能提升。
* 支持向前和向后的类型兼容性。
* 更好地支持跨语言客户端。

### 消极的

* 需要学习曲线来理解和实现 Protobuf 消息。
* 由于使用了 `Any`，消息大小稍大，尽管这在未来可以通过压缩层来抵消。

### 中性的

## 参考资料

1. https://github.com/cosmos/cosmos-sdk/issues/4977
2. https://github.com/cosmos/cosmos-sdk/issues/5444


# ADR 019: Protocol Buffer State Encoding

## Changelog

* 2020 Feb 15: Initial Draft
* 2020 Feb 24: Updates to handle messages with interface fields
* 2020 Apr 27: Convert usages of `oneof` for interfaces to `Any`
* 2020 May 15: Describe `cosmos_proto` extensions and amino compatibility
* 2020 Dec 4: Move and rename `MarshalAny` and `UnmarshalAny` into the `codec.Codec` interface.
* 2021 Feb 24: Remove mentions of `HybridCodec`, which has been abandoned in [#6843](https://github.com/cosmos/cosmos-sdk/pull/6843).

## Status

Accepted

## Context

Currently, the Cosmos SDK utilizes [go-amino](https://github.com/tendermint/go-amino/) for binary
and JSON object encoding over the wire bringing parity between logical objects and persistence objects.

From the Amino docs:

> Amino is an object encoding specification. It is a subset of Proto3 with an extension for interface
> support. See the [Proto3 spec](https://developers.google.com/protocol-buffers/docs/proto3) for more
> information on Proto3, which Amino is largely compatible with (but not with Proto2).
>
> The goal of the Amino encoding protocol is to bring parity into logic objects and persistence objects.

Amino also aims to have the following goals (not a complete list):

* Binary bytes must be decode-able with a schema.
* Schema must be upgradeable.
* The encoder and decoder logic must be reasonably simple.

However, we believe that Amino does not fulfill these goals completely and does not fully meet the
needs of a truly flexible cross-language and multi-client compatible encoding protocol in the Cosmos SDK.
Namely, Amino has proven to be a big pain-point in regards to supporting object serialization across
clients written in various languages while providing virtually little in the way of true backwards
compatibility and upgradeability. Furthermore, through profiling and various benchmarks, Amino has
been shown to be an extremely large performance bottleneck in the Cosmos SDK <sup>1</sup>. This is
largely reflected in the performance of simulations and application transaction throughput.

Thus, we need to adopt an encoding protocol that meets the following criteria for state serialization:

* Language agnostic
* Platform agnostic
* Rich client support and thriving ecosystem
* High performance
* Minimal encoded message size
* Codegen-based over reflection-based
* Supports backward and forward compatibility

Note, migrating away from Amino should be viewed as a two-pronged approach, state and client encoding.
This ADR focuses on state serialization in the Cosmos SDK state machine. A corresponding ADR will be
made to address client-side encoding.

## Decision

We will adopt [Protocol Buffers](https://developers.google.com/protocol-buffers) for serializing
persisted structured data in the Cosmos SDK while providing a clean mechanism and developer UX for
applications wishing to continue to use Amino. We will provide this mechanism by updating modules to
accept a codec interface, `Marshaler`, instead of a concrete Amino codec. Furthermore, the Cosmos SDK
will provide two concrete implementations of the `Marshaler` interface: `AminoCodec` and `ProtoCodec`.

* `AminoCodec`: Uses Amino for both binary and JSON encoding.
* `ProtoCodec`: Uses Protobuf for both binary and JSON encoding.

Modules will use whichever codec that is instantiated in the app. By default, the Cosmos SDK's `simapp`
instantiates a `ProtoCodec` as the concrete implementation of `Marshaler`, inside the `MakeTestEncodingConfig`
function. This can be easily overwritten by app developers if they so desire.

The ultimate goal will be to replace Amino JSON encoding with Protobuf encoding and thus have
modules accept and/or extend `ProtoCodec`. Until then, Amino JSON is still provided for legacy use-cases.
A handful of places in the Cosmos SDK still have Amino JSON hardcoded, such as the Legacy API REST endpoints
and the `x/params` store. They are planned to be converted to Protobuf in a gradual manner.

### Module Codecs

Modules that do not require the ability to work with and serialize interfaces, the path to Protobuf
migration is pretty straightforward. These modules are to simply migrate any existing types that
are encoded and persisted via their concrete Amino codec to Protobuf and have their keeper accept a
`Marshaler` that will be a `ProtoCodec`. This migration is simple as things will just work as-is.

Note, any business logic that needs to encode primitive types like `bool` or `int64` should use
[gogoprotobuf](https://github.com/cosmos/gogoproto) Value types.

Example:

```go
  ts, err := gogotypes.TimestampProto(completionTime)
  if err != nil {
    // ...
  }

  bz := cdc.MustMarshal(ts)
```

However, modules can vary greatly in purpose and design and so we must support the ability for modules
to be able to encode and work with interfaces (e.g. `Account` or `Content`). For these modules, they
must define their own codec interface that extends `Marshaler`. These specific interfaces are unique
to the module and will contain method contracts that know how to serialize the needed interfaces.

Example:

```go
// x/auth/types/codec.go

type Codec interface {
  codec.Codec

  MarshalAccount(acc exported.Account) ([]byte, error)
  UnmarshalAccount(bz []byte) (exported.Account, error)

  MarshalAccountJSON(acc exported.Account) ([]byte, error)
  UnmarshalAccountJSON(bz []byte) (exported.Account, error)
}
```

### Usage of `Any` to encode interfaces

In general, module-level .proto files should define messages which encode interfaces
using [`google.protobuf.Any`](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/any.proto).
After [extension discussion](https://github.com/cosmos/cosmos-sdk/issues/6030),
this was chosen as the preferred alternative to application-level `oneof`s
as in our original protobuf design. The arguments in favor of `Any` can be
summarized as follows:

* `Any` provides a simpler, more consistent client UX for dealing with
interfaces than app-level `oneof`s that will need to be coordinated more
carefully across applications. Creating a generic transaction
signing library using `oneof`s may be cumbersome and critical logic may need
to be reimplemented for each chain
* `Any` provides more resistance against human error than `oneof`
* `Any` is generally simpler to implement for both modules and apps

The main counter-argument to using `Any` centers around its additional space
and possibly performance overhead. The space overhead could be dealt with using
compression at the persistence layer in the future and the performance impact
is likely to be small. Thus, not using `Any` is seem as a pre-mature optimization,
with user experience as the higher order concern.

Note, that given the Cosmos SDK's decision to adopt the `Codec` interfaces described
above, apps can still choose to use `oneof` to encode state and transactions
but it is not the recommended approach. If apps do choose to use `oneof`s
instead of `Any` they will likely lose compatibility with client apps that
support multiple chains. Thus developers should think carefully about whether
they care more about what is possibly a pre-mature optimization or end-user
and client developer UX.

### Safe usage of `Any`

By default, the [gogo protobuf implementation of `Any`](https://pkg.go.dev/github.com/cosmos/gogoproto/types)
uses [global type registration]( https://github.com/cosmos/gogoproto/blob/master/proto/properties.go#L540)
to decode values packed in `Any` into concrete
go types. This introduces a vulnerability where any malicious module
in the dependency tree could register a type with the global protobuf registry
and cause it to be loaded and unmarshaled by a transaction that referenced
it in the `type_url` field.

To prevent this, we introduce a type registration mechanism for decoding `Any`
values into concrete types through the `InterfaceRegistry` interface which
bears some similarity to type registration with Amino:

```go
type InterfaceRegistry interface {
    // RegisterInterface associates protoName as the public name for the
    // interface passed in as iface
    // Ex:
    //   registry.RegisterInterface("cosmos_sdk.Msg", (*sdk.Msg)(nil))
    RegisterInterface(protoName string, iface interface{})

    // RegisterImplementations registers impls as a concrete implementations of
    // the interface iface
    // Ex:
    //  registry.RegisterImplementations((*sdk.Msg)(nil), &MsgSend{}, &MsgMultiSend{})
    RegisterImplementations(iface interface{}, impls ...proto.Message)

}
```

In addition to serving as a whitelist, `InterfaceRegistry` can also serve
to communicate the list of concrete types that satisfy an interface to clients.

In .proto files:

* fields which accept interfaces should be annotated with `cosmos_proto.accepts_interface`
using the same full-qualified name passed as `protoName` to `InterfaceRegistry.RegisterInterface`
* interface implementations should be annotated with `cosmos_proto.implements_interface`
using the same full-qualified name passed as `protoName` to `InterfaceRegistry.RegisterInterface`

In the future, `protoName`, `cosmos_proto.accepts_interface`, `cosmos_proto.implements_interface`
may be used via code generation, reflection &/or static linting.

The same struct that implements `InterfaceRegistry` will also implement an
interface `InterfaceUnpacker` to be used for unpacking `Any`s:

```go
type InterfaceUnpacker interface {
    // UnpackAny unpacks the value in any to the interface pointer passed in as
    // iface. Note that the type in any must have been registered with
    // RegisterImplementations as a concrete type for that interface
    // Ex:
    //    var msg sdk.Msg
    //    err := ctx.UnpackAny(any, &msg)
    //    ...
    UnpackAny(any *Any, iface interface{}) error
}
```

Note that `InterfaceRegistry` usage does not deviate from standard protobuf
usage of `Any`, it just introduces a security and introspection layer for
golang usage.

`InterfaceRegistry` will be a member of `ProtoCodec`
described above. In order for modules to register interface types, app modules
can optionally implement the following interface:

```go
type InterfaceModule interface {
    RegisterInterfaceTypes(InterfaceRegistry)
}
```

The module manager will include a method to call `RegisterInterfaceTypes` on
every module that implements it in order to populate the `InterfaceRegistry`.

### Using `Any` to encode state

The Cosmos SDK will provide support methods `MarshalInterface` and `UnmarshalInterface` to hide a complexity of wrapping interface types into `Any` and allow easy serialization.

```go
import "github.com/cosmos/cosmos-sdk/codec"

// note: eviexported.Evidence is an interface type
func MarshalEvidence(cdc codec.BinaryCodec, e eviexported.Evidence) ([]byte, error) {
	return cdc.MarshalInterface(e)
}

func UnmarshalEvidence(cdc codec.BinaryCodec, bz []byte) (eviexported.Evidence, error) {
	var evi eviexported.Evidence
	err := cdc.UnmarshalInterface(&evi, bz)
    return err, nil
}
```

### Using `Any` in `sdk.Msg`s

A similar concept is to be applied for messages that contain interfaces fields.
For example, we can define `MsgSubmitEvidence` as follows where `Evidence` is
an interface:

```protobuf
// x/evidence/types/types.proto

message MsgSubmitEvidence {
  bytes submitter = 1
    [
      (gogoproto.casttype) = "github.com/cosmos/cosmos-sdk/types.AccAddress"
    ];
  google.protobuf.Any evidence = 2;
}
```

Note that in order to unpack the evidence from `Any` we do need a reference to
`InterfaceRegistry`. In order to reference evidence in methods like
`ValidateBasic` which shouldn't have to know about the `InterfaceRegistry`, we
introduce an `UnpackInterfaces` phase to deserialization which unpacks
interfaces before they're needed.

### Unpacking Interfaces

To implement the `UnpackInterfaces` phase of deserialization which unpacks
interfaces wrapped in `Any` before they're needed, we create an interface
that `sdk.Msg`s and other types can implement:

```go
type UnpackInterfacesMessage interface {
  UnpackInterfaces(InterfaceUnpacker) error
}
```

We also introduce a private `cachedValue interface{}` field onto the `Any`
struct itself with a public getter `GetCachedValue() interface{}`.

The `UnpackInterfaces` method is to be invoked during message deserialization right
after `Unmarshal` and any interface values packed in `Any`s will be decoded
and stored in `cachedValue` for reference later.

Then unpacked interface values can safely be used in any code afterwards
without knowledge of the `InterfaceRegistry`
and messages can introduce a simple getter to cast the cached value to the
correct interface type.

This has the added benefit that unmarshaling of `Any` values only happens once
during initial deserialization rather than every time the value is read. Also,
when `Any` values are first packed (for instance in a call to
`NewMsgSubmitEvidence`), the original interface value is cached so that
unmarshaling isn't needed to read it again.

`MsgSubmitEvidence` could implement `UnpackInterfaces`, plus a convenience getter
`GetEvidence` as follows:

```go
func (msg MsgSubmitEvidence) UnpackInterfaces(ctx sdk.InterfaceRegistry) error {
  var evi eviexported.Evidence
  return ctx.UnpackAny(msg.Evidence, *evi)
}

func (msg MsgSubmitEvidence) GetEvidence() eviexported.Evidence {
  return msg.Evidence.GetCachedValue().(eviexported.Evidence)
}
```

### Amino Compatibility

Our custom implementation of `Any` can be used transparently with Amino if used
with the proper codec instance. What this means is that interfaces packed within
`Any`s will be amino marshaled like regular Amino interfaces (assuming they
have been registered properly with Amino).

In order for this functionality to work:

* **all legacy code must use `*codec.LegacyAmino` instead of `*amino.Codec` which is
  now a wrapper which properly handles `Any`**
* **all new code should use `Marshaler` which is compatible with both amino and
  protobuf**
* Also, before v0.39, `codec.LegacyAmino` will be renamed to `codec.LegacyAmino`.

### Why Wasn't X Chosen Instead

For a more complete comparison to alternative protocols, see [here](https://codeburst.io/json-vs-protocol-buffers-vs-flatbuffers-a4247f8bda6f).

### Cap'n Proto

While [Cap’n Proto](https://capnproto.org/) does seem like an advantageous alternative to Protobuf
due to it's native support for interfaces/generics and built in canonicalization, it does lack the
rich client ecosystem compared to Protobuf and is a bit less mature.

### FlatBuffers

[FlatBuffers](https://google.github.io/flatbuffers/) is also a potentially viable alternative, with the
primary difference being that FlatBuffers does not need a parsing/unpacking step to a secondary
representation before you can access data, often coupled with per-object memory allocation.

However, it would require great efforts into research and full understanding the scope of the migration
and path forward -- which isn't immediately clear. In addition, FlatBuffers aren't designed for
untrusted inputs.

## Future Improvements & Roadmap

In the future we may consider a compression layer right above the persistence
layer which doesn't change tx or merkle tree hashes, but reduces the storage
overhead of `Any`. In addition, we may adopt protobuf naming conventions which
make type URLs a bit more concise while remaining descriptive.

Additional code generation support around the usage of `Any` is something that
could also be explored in the future to make the UX for go developers more
seamless.

## Consequences

### Positive

* Significant performance gains.
* Supports backward and forward type compatibility.
* Better support for cross-language clients.

### Negative

* Learning curve required to understand and implement Protobuf messages.
* Slightly larger message size due to use of `Any`, although this could be offset
  by a compression layer in the future

### Neutral

## References

1. https://github.com/cosmos/cosmos-sdk/issues/4977
2. https://github.com/cosmos/cosmos-sdk/issues/5444
