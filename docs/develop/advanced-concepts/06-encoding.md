# 编码

:::note 概要
在 Cosmos SDK 中，编码主要由 `go-amino` 编解码库处理，但 Cosmos SDK 正在向使用 `gogoprotobuf` 进行状态和客户端编码的方向发展。
:::

:::note

### 先决条件阅读

* [Cosmos SDK 应用程序的解剖](../high-level-concepts/00-overview-app.md)

:::

## 编码

Cosmos SDK 使用了两种二进制线路编码协议，[Amino](https://github.com/tendermint/go-amino/) 是一种对象编码规范，[Protocol Buffers](https://developers.google.com/protocol-buffers) 是 Proto3 的一个子集，具有接口支持的扩展。有关 Proto3 的更多信息，请参阅 [Proto3 规范](https://developers.google.com/protocol-buffers/docs/proto3)，Amino 在很大程度上与 Proto3 兼容（但与 Proto2 不兼容）。

由于 Amino 存在显著的性能缺陷，基于反射，并且没有任何有意义的跨语言/客户端支持，因此在 Amino 的位置上使用 Protocol Buffers，特别是 [gogoprotobuf](https://github.com/cosmos/gogoproto/)。请注意，使用 Protocol Buffers 替代 Amino 的过程仍在进行中。

Cosmos SDK 中类型的二进制线路编码可以分为两个主要类别，客户端编码和存储编码。客户端编码主要围绕事务处理和签名，而存储编码则围绕状态机转换中使用的类型以及最终存储在 Merkle 树中的内容。

对于存储编码，可以为任何类型存在 protobuf 定义，并且通常会有一个基于 Amino 的“中间”类型。具体而言，基于 protobuf 的类型定义用于序列化和持久化，而基于 Amino 的类型用于状态机中的业务逻辑，它们可能会相互转换。请注意，基于 Amino 的类型可能会在未来逐渐被淘汰，因此开发人员应注意尽可能使用 protobuf 消息定义。

在 `codec` 包中，存在两个核心接口，`BinaryCodec` 和 `JSONCodec`，前者封装了当前的 Amino 接口，但它操作实现后者的类型，而不是通用的 `interface{}` 类型。

此外，`Codec` 有两种实现。第一种是 `AminoCodec`，它通过 Amino 处理二进制和 JSON 序列化。第二种是 `ProtoCodec`，它通过 Protobuf 处理二进制和 JSON 序列化。

这意味着模块可以使用 Amino 或 Protobuf 编码，但类型必须实现 `ProtoMarshaler` 接口。如果模块希望避免为其类型实现此接口，可以直接使用 Amino 编解码器。

### Amino

每个模块都使用 Amino 编解码器来序列化类型和接口。该编解码器通常仅在该模块的域中注册类型和接口（例如消息），但也有例外，如 `x/gov`。每个模块都公开了一个 `RegisterLegacyAminoCodec` 函数，允许用户提供一个编解码器并注册所有类型。应用程序将为每个必要的模块调用此方法。

对于没有基于 Protobuf 的类型定义的模块（见下文），使用 Amino 将原始的字节编码和解码为具体的类型或接口：

```go
bz := keeper.cdc.MustMarshal(typeOrInterface)
keeper.cdc.MustUnmarshal(bz, &typeOrInterface)
```

注意，上述功能还有长度前缀的变体，通常用于需要流式传输或分组在一起的数据（例如 `ResponseDeliverTx.Data`）。

#### Authz 授权和 Gov/Group 提案

由于 authz 的 `MsgExec` 和 `MsgGrant` 消息类型，以及 gov 和 group 的 `MsgSubmitProposal` 可以包含不同的消息实例，因此开发人员需要在模块的 `codec.go` 文件的 `init` 方法中添加以下代码：

```go
import (
  authzcodec "github.com/cosmos/cosmos-sdk/x/authz/codec"
  govcodec "github.com/cosmos/cosmos-sdk/x/gov/codec"
  groupcodec "github.com/cosmos/cosmos-sdk/x/group/codec"
)

init() {
    // Register all Amino interfaces and concrete types on the authz and gov Amino codec so that this can later be
    // used to properly serialize MsgGrant, MsgExec and MsgSubmitProposal instances
    RegisterLegacyAminoCodec(authzcodec.Amino)
    RegisterLegacyAminoCodec(govcodec.Amino)
    RegisterLegacyAminoCodec(groupcodec.Amino)
}
```

这将允许 `x/authz` 模块使用 Amino 正确地序列化和反序列化 `MsgExec` 实例，这在使用硬件钱包签署此类消息时是必需的。

### Gogoproto

鼓励模块为其相应的类型使用 Protobuf 编码。在 Cosmos SDK 中，我们使用 [Gogoproto](https://github.com/cosmos/gogoproto) 的 Protobuf 规范特定实现，相比于官方的 [Google protobuf 实现](https://github.com/protocolbuffers/protobuf)，它提供了速度和开发体验上的改进。

### protobuf消息定义指南

除了[遵循官方Protocol Buffer指南](https://developers.google.com/protocol-buffers/docs/proto3#simple)之外，我们建议在.proto文件中处理接口时使用以下注释：

* 使用`cosmos_proto.accepts_interface`注释接受接口的`Any`字段
    * 将`protoName`设置为完全限定名称，并传递给`InterfaceRegistry.RegisterInterface`
    * 示例：`(cosmos_proto.accepts_interface) = "cosmos.gov.v1beta1.Content"`（而不仅仅是`Content`）
* 使用`cosmos_proto.implements_interface`注释接口实现
    * 将`protoName`设置为完全限定名称，并传递给`InterfaceRegistry.RegisterInterface`
    * 示例：`(cosmos_proto.implements_interface) = "cosmos.authz.v1beta1.Authorization"`（而不仅仅是`Authorization`）

代码生成器可以根据`accepts_interface`和`implements_interface`注释来确定某些Protobuf消息是否允许打包在给定的`Any`字段中。

### 交易编码

Protobuf的另一个重要用途是对[交易](01-transactions.md)进行编码和解码。交易由应用程序或Cosmos SDK定义，然后传递给底层共识引擎以便传递给其他节点。由于底层共识引擎对应用程序是不可知的，因此共识引擎只接受原始字节形式的交易。

* `TxEncoder`对象执行编码。
* `TxDecoder`对象执行解码。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/tx_msg.go#L76-L80
```

这两个对象的标准实现可以在[`auth/tx`模块](../../integrate/modules/auth/2-tx.md)中找到：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/decoder.go
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/encoder.go
```

有关交易如何编码的详细信息，请参见[ADR-020](../../integrate/architecture/adr-020-protobuf-transaction-encoding.md)。

### 接口编码和`Any`的使用

Protobuf DSL是强类型的，这可能会使插入变量类型的字段变得困难。想象一下，我们想要创建一个作为[账户](../high-level-concepts/03-accounts.md)包装器的`Profile` protobuf消息：

```protobuf
message Profile {
  // account is the account associated to a profile.
  cosmos.auth.v1beta1.BaseAccount account = 1;
  // bio is a short description of the account.
  string bio = 4;
}
```

在这个`Profile`示例中，我们将`account`硬编码为`BaseAccount`。然而，还有其他几种与[锁定相关的用户账户](../../integrate/modules/auth/1-vesting.md)，比如`BaseVestingAccount`或`ContinuousVestingAccount`。所有这些账户都是不同的，但它们都实现了`AccountI`接口。如何创建一个允许所有这些类型账户的`Profile`，并且`account`字段接受`AccountI`接口的`Profile`？

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/types/account.go#L307-L330
```

在[ADR-019](../../integrate/architecture/adr-019-protobuf-state-encoding.md)中，决定使用[`Any`](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/any.proto)来在protobuf中编码接口。`Any`包含一个任意序列化的消息作为字节，以及一个URL，该URL充当全局唯一标识符，并解析为该消息的类型。这种策略允许我们在protobuf消息中打包任意的Go类型。我们的新`Profile`如下所示：

```protobuf
message Profile {
  // account is the account associated to a profile.
  google.protobuf.Any account = 1 [
    (cosmos_proto.accepts_interface) = "cosmos.auth.v1beta1.AccountI"; // Asserts that this field only accepts Go types implementing `AccountI`. It is purely informational for now.
  ];
  // bio is a short description of the account.
  string bio = 4;
}
```

要在`Profile`中添加一个账户，我们首先需要将其"打包"到`Any`中，使用`codectypes.NewAnyWithValue`：

```go
var myAccount AccountI
myAccount = ... // Can be a BaseAccount, a ContinuousVestingAccount or any struct implementing `AccountI`

// Pack the account into an Any
accAny, err := codectypes.NewAnyWithValue(myAccount)
if err != nil {
  return nil, err
}

// Create a new Profile with the any.
profile := Profile {
  Account: accAny,
  Bio: "some bio",
}

// We can then marshal the profile as usual.
bz, err := cdc.Marshal(profile)
jsonBz, err := cdc.MarshalJSON(profile)
```

总结一下，要编码一个接口，你必须1/将接口打包到`Any`中，2/编组`Any`。为了方便起见，Cosmos SDK提供了一个`MarshalInterface`方法来打包这两个步骤。在[x/auth模块的一个实际示例中](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/keeper/keeper.go#L240-L243)看一下。

从`Any`中检索具体的Go类型的相反操作，称为"解包"，可以使用`Any`上的`GetCachedValue()`方法来完成。

```go
profileBz := ... // The proto-encoded bytes of a Profile, e.g. retrieved through gRPC.
var myProfile Profile
// Unmarshal the bytes into the myProfile struct.
err := cdc.Unmarshal(profilebz, &myProfile)

// Let's see the types of the Account field.
fmt.Printf("%T\n", myProfile.Account)                  // Prints "Any"
fmt.Printf("%T\n", myProfile.Account.GetCachedValue()) // Prints "BaseAccount", "ContinuousVestingAccount" or whatever was initially packed in the Any.

// Get the address of the accountt.
accAddr := myProfile.Account.GetCachedValue().(AccountI).GetAddress()
```

需要注意的是，为了使 `GetCachedValue()` 起作用，`Profile`（以及任何其他嵌入 `Profile` 的结构体）必须实现 `UnpackInterfaces` 方法：

```go
func (p *Profile) UnpackInterfaces(unpacker codectypes.AnyUnpacker) error {
  if p.Account != nil {
    var account AccountI
    return unpacker.UnpackAny(p.Account, &account)
  }

  return nil
}
```

`UnpackInterfaces` 方法会递归地调用所有实现该方法的结构体，以正确填充所有 `Any` 的 `GetCachedValue()`。

有关接口编码的更多信息，特别是关于 `UnpackInterfaces` 以及 `Any` 的 `type_url` 如何使用 `InterfaceRegistry` 解析的，请参阅 [ADR-019](../../integrate/architecture/adr-019-protobuf-state-encoding.md)。

#### Cosmos SDK 中的 `Any` 编码

上述的 `Profile` 示例是一个用于教育目的的虚构示例。在 Cosmos SDK 中，我们在多个地方使用 `Any` 编码（非详尽列表）：

* `cryptotypes.PubKey` 接口用于编码不同类型的公钥，
* `sdk.Msg` 接口用于在交易中编码不同的 `Msg`，
* `AccountI` 接口用于在 x/auth 查询响应中编码不同类型的账户（类似上面的示例），
* `Evidencei` 接口用于编码 x/evidence 模块中不同类型的证据，
* `AuthorizationI` 接口用于编码不同类型的 x/authz 授权，
* [`Validator`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/types/staking.pb.go#L340-L377) 结构体，包含有关验证人的信息。

在 x/staking 中，将 pubkey 编码为 `Any` 的实际示例如下所示：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/types/validator.go#L41-L64
```

#### `Any` 的 TypeURL

将 protobuf 消息打包到 `Any` 中时，消息的类型由其类型 URL 唯一定义，该 URL 是消息的完全限定名称前缀加上 `/`（斜杠）字符。在某些 `Any` 的实现中，例如 gogoproto，通常会有 [可解析的前缀，例如 `type.googleapis.com`](https://github.com/gogo/protobuf/blob/b03c65ea87cdc3521ede29f62fe3ce239267c1bc/protobuf/google/protobuf/any.proto#L87-L91)。然而，在 Cosmos SDK 中，我们决定不包含此类前缀，以获得更短的类型 URL。Cosmos SDK 自己的 `Any` 实现可以在 `github.com/cosmos/cosmos-sdk/codec/types` 中找到。

Cosmos SDK也正在从gogoproto切换到官方的`google.golang.org/protobuf`（也称为Protobuf API v2）。它的默认`Any`实现还包含[`type.googleapis.com`](https://github.com/protocolbuffers/protobuf-go/blob/v1.28.1/types/known/anypb/any.pb.go#L266)前缀。为了与SDK保持兼容性，不应使用`"google.golang.org/protobuf/types/known/anypb"`中的以下方法：

* `anypb.New`
* `anypb.MarshalFrom`
* `anypb.Any#MarshalFrom`

相反，Cosmos SDK在`"github.com/cosmos/cosmos-proto/anyutil"`中提供了辅助函数，用于创建不插入前缀的官方`anypb.Any`：

* `anyutil.New`
* `anyutil.MarshalFrom`

例如，要打包名为`internalMsg`的`sdk.Msg`，请使用：

```diff
import (
- 	"google.golang.org/protobuf/types/known/anypb"
+	"github.com/cosmos/cosmos-proto/anyutil"
)

- anyMsg, err := anypb.New(internalMsg.Message().Interface())
+ anyMsg, err := anyutil.New(internalMsg.Message().Interface())

- fmt.Println(anyMsg.TypeURL) // type.googleapis.com/cosmos.bank.v1beta1.MsgSend
+ fmt.Println(anyMsg.TypeURL) // /cosmos.bank.v1beta1.MsgSend
```

## 常见问题

### 如何使用protobuf编码创建模块

#### 定义模块类型

可以定义Protobuf类型来编码：

* 状态
* [`Msg`](../../integrate/building-modules/02-messages-and-queries.md#messages)
* [查询服务](../../integrate/building-modules/04-query-services.md)
* [创世](../../integrate/building-modules/08-genesis.md)

#### 命名和约定

我们鼓励开发者遵循行业指南：[Protocol Buffers风格指南](https://developers.google.com/protocol-buffers/docs/style)和[Buf](https://buf.build/docs/style-guide)，更多细节请参见[ADR 023](../../integrate/architecture/adr-023-protobuf-naming.md)

### 如何将模块更新为protobuf编码

如果模块不包含任何接口（例如`Account`或`Content`），则可以简单地将通过其具体Amino编解码器进行编码和持久化的任何现有类型迁移到Protobuf（有关更多指南，请参见1.），并接受`Marshaler`作为编解码器，该编解码器通过`ProtoCodec`实现，无需任何进一步的自定义。

但是，如果模块类型组成一个接口，则必须将其包装在`sdk.Any`（来自`/types`包）类型中。为此，模块级`.proto`文件必须使用[`google.protobuf.Any`](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/any.proto)作为相应消息类型接口类型。

例如，在 `x/evidence` 模块中定义了一个 `Evidence` 接口，该接口被 `MsgSubmitEvidence` 使用。结构定义必须使用 `sdk.Any` 来包装证据文件。在 proto 文件中，我们将其定义如下：

```protobuf
// proto/cosmos/evidence/v1beta1/tx.proto

message MsgSubmitEvidence {
  string              submitter = 1;
  google.protobuf.Any evidence  = 2 [(cosmos_proto.accepts_interface) = "cosmos.evidence.v1beta1.Evidence"];
}
```

Cosmos SDK 的 `codec.Codec` 接口提供了 `MarshalInterface` 和 `UnmarshalInterface` 方法，用于将状态轻松编码为 `Any`。

模块应使用 `InterfaceRegistry` 注册接口，该接口提供了一种注册接口的机制：`RegisterInterface(protoName string, iface interface{}, impls ...proto.Message)` 和实现：`RegisterImplementations(iface interface{}, impls ...proto.Message)`，可以安全地从 `Any` 中解包，类似于使用 Amino 进行类型注册：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/codec/types/interface_registry.go#L24-L57
```

此外，在反序列化之前应引入 `UnpackInterfaces` 阶段，以在需要时解包接口。包含直接或通过其成员之一包含 protobuf `Any` 的 protobuf 类型应实现 `UnpackInterfacesMessage` 接口：

```go
type UnpackInterfacesMessage interface {
  UnpackInterfaces(InterfaceUnpacker) error
}
```

### 自定义 Stringer

在 proto 消息定义中使用 `option (gogoproto.goproto_stringer) = false;` 会导致意外的行为，例如返回错误的输出或输出中缺少字段。因此，proto 消息的 `String()` 方法不应自定义，并且应避免使用 `goproto_stringer` 选项。

可以通过使用 ProtoJSON 并使用 `JSONToYAML` 函数来获得正确的 YAML 输出：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/codec/yaml.go#L8-L20
```

例如：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/types/account.go#L141-L151
```





# Encoding

:::note Synopsis
While encoding in the Cosmos SDK used to be mainly handled by `go-amino` codec, the Cosmos SDK is moving towards using `gogoprotobuf` for both state and client-side encoding.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK application](../high-level-concepts/00-overview-app.md)

:::

## Encoding

The Cosmos SDK utilizes two binary wire encoding protocols, [Amino](https://github.com/tendermint/go-amino/) which is an object encoding specification and [Protocol Buffers](https://developers.google.com/protocol-buffers), a subset of Proto3 with an extension for
interface support. See the [Proto3 spec](https://developers.google.com/protocol-buffers/docs/proto3)
for more information on Proto3, which Amino is largely compatible with (but not with Proto2).

Due to Amino having significant performance drawbacks, being reflection-based, and
not having any meaningful cross-language/client support, Protocol Buffers, specifically
[gogoprotobuf](https://github.com/cosmos/gogoproto/), is being used in place of Amino.
Note, this process of using Protocol Buffers over Amino is still an ongoing process.

Binary wire encoding of types in the Cosmos SDK can be broken down into two main
categories, client encoding and store encoding. Client encoding mainly revolves
around transaction processing and signing, whereas store encoding revolves around
types used in state-machine transitions and what is ultimately stored in the Merkle
tree.

For store encoding, protobuf definitions can exist for any type and will typically
have an Amino-based "intermediary" type. Specifically, the protobuf-based type
definition is used for serialization and persistence, whereas the Amino-based type
is used for business logic in the state-machine where they may convert back-n-forth.
Note, the Amino-based types may slowly be phased-out in the future, so developers
should take note to use the protobuf message definitions where possible.

In the `codec` package, there exists two core interfaces, `BinaryCodec` and `JSONCodec`,
where the former encapsulates the current Amino interface except it operates on
types implementing the latter instead of generic `interface{}` types.

In addition, there exists two implementations of `Codec`. The first being
`AminoCodec`, where both binary and JSON serialization is handled via Amino. The
second being `ProtoCodec`, where both binary and JSON serialization is handled
via Protobuf.

This means that modules may use Amino or Protobuf encoding, but the types must
implement `ProtoMarshaler`. If modules wish to avoid implementing this interface
for their types, they may use an Amino codec directly.

### Amino

Every module uses an Amino codec to serialize types and interfaces. This codec typically
has types and interfaces registered in that module's domain only (e.g. messages),
but there are exceptions like `x/gov`. Each module exposes a `RegisterLegacyAminoCodec` function
that allows a user to provide a codec and have all the types registered. An application
will call this method for each necessary module.

Where there is no protobuf-based type definition for a module (see below), Amino
is used to encode and decode raw wire bytes to the concrete type or interface:

```go
bz := keeper.cdc.MustMarshal(typeOrInterface)
keeper.cdc.MustUnmarshal(bz, &typeOrInterface)
```

Note, there are length-prefixed variants of the above functionality and this is
typically used for when the data needs to be streamed or grouped together
(e.g. `ResponseDeliverTx.Data`)

#### Authz authorizations and Gov/Group proposals

Since authz's `MsgExec` and `MsgGrant` message types, as well as gov's and group's `MsgSubmitProposal`, can contain different messages instances, it is important that developers
add the following code inside the `init` method of their module's `codec.go` file:

```go
import (
  authzcodec "github.com/cosmos/cosmos-sdk/x/authz/codec"
  govcodec "github.com/cosmos/cosmos-sdk/x/gov/codec"
  groupcodec "github.com/cosmos/cosmos-sdk/x/group/codec"
)

init() {
    // Register all Amino interfaces and concrete types on the authz and gov Amino codec so that this can later be
    // used to properly serialize MsgGrant, MsgExec and MsgSubmitProposal instances
    RegisterLegacyAminoCodec(authzcodec.Amino)
    RegisterLegacyAminoCodec(govcodec.Amino)
    RegisterLegacyAminoCodec(groupcodec.Amino)
}
```

This will allow the `x/authz` module to properly serialize and de-serializes `MsgExec` instances using Amino, 
which is required when signing this kind of messages using a Ledger. 

### Gogoproto

Modules are encouraged to utilize Protobuf encoding for their respective types. In the Cosmos SDK, we use the [Gogoproto](https://github.com/cosmos/gogoproto) specific implementation of the Protobuf spec that offers speed and DX improvements compared to the official [Google protobuf implementation](https://github.com/protocolbuffers/protobuf).

### Guidelines for protobuf message definitions

In addition to [following official Protocol Buffer guidelines](https://developers.google.com/protocol-buffers/docs/proto3#simple), we recommend using these annotations in .proto files when dealing with interfaces:

* use `cosmos_proto.accepts_interface` to annote `Any` fields that accept interfaces
    * pass the same fully qualified name as `protoName` to `InterfaceRegistry.RegisterInterface`
    * example: `(cosmos_proto.accepts_interface) = "cosmos.gov.v1beta1.Content"` (and not just `Content`)
* annotate interface implementations with `cosmos_proto.implements_interface`
    * pass the same fully qualified name as `protoName` to `InterfaceRegistry.RegisterInterface`
    * example: `(cosmos_proto.implements_interface) = "cosmos.authz.v1beta1.Authorization"` (and not just `Authorization`)

Code generators can then match the `accepts_interface` and `implements_interface` annotations to know whether some Protobuf messages are allowed to be packed in a given `Any` field or not.

### Transaction Encoding

Another important use of Protobuf is the encoding and decoding of
[transactions](01-transactions.md). Transactions are defined by the application or
the Cosmos SDK but are then passed to the underlying consensus engine to be relayed to
other peers. Since the underlying consensus engine is agnostic to the application,
the consensus engine accepts only transactions in the form of raw bytes.

* The `TxEncoder` object performs the encoding.
* The `TxDecoder` object performs the decoding.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/tx_msg.go#L76-L80
```

A standard implementation of both these objects can be found in the [`auth/tx` module](../../integrate/modules/auth/2-tx.md):

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/decoder.go
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/encoder.go
```

See [ADR-020](../../integrate/architecture/adr-020-protobuf-transaction-encoding.md) for details of how a transaction is encoded.

### Interface Encoding and Usage of `Any`

The Protobuf DSL is strongly typed, which can make inserting variable-typed fields difficult. Imagine we want to create a `Profile` protobuf message that serves as a wrapper over [an account](../high-level-concepts/03-accounts.md):

```protobuf
message Profile {
  // account is the account associated to a profile.
  cosmos.auth.v1beta1.BaseAccount account = 1;
  // bio is a short description of the account.
  string bio = 4;
}
```

In this `Profile` example, we hardcoded `account` as a `BaseAccount`. However, there are several other types of [user accounts related to vesting](../../integrate/modules/auth/1-vesting.md), such as `BaseVestingAccount` or `ContinuousVestingAccount`. All of these accounts are different, but they all implement the `AccountI` interface. How would you create a `Profile` that allows all these types of accounts with an `account` field that accepts an `AccountI` interface?

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/types/account.go#L307-L330
```

In [ADR-019](../../integrate/architecture/adr-019-protobuf-state-encoding.md), it has been decided to use [`Any`](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/any.proto)s to encode interfaces in protobuf. An `Any` contains an arbitrary serialized message as bytes, along with a URL that acts as a globally unique identifier for and resolves to that message's type. This strategy allows us to pack arbitrary Go types inside protobuf messages. Our new `Profile` then looks like:

```protobuf
message Profile {
  // account is the account associated to a profile.
  google.protobuf.Any account = 1 [
    (cosmos_proto.accepts_interface) = "cosmos.auth.v1beta1.AccountI"; // Asserts that this field only accepts Go types implementing `AccountI`. It is purely informational for now.
  ];
  // bio is a short description of the account.
  string bio = 4;
}
```

To add an account inside a profile, we need to "pack" it inside an `Any` first, using `codectypes.NewAnyWithValue`:

```go
var myAccount AccountI
myAccount = ... // Can be a BaseAccount, a ContinuousVestingAccount or any struct implementing `AccountI`

// Pack the account into an Any
accAny, err := codectypes.NewAnyWithValue(myAccount)
if err != nil {
  return nil, err
}

// Create a new Profile with the any.
profile := Profile {
  Account: accAny,
  Bio: "some bio",
}

// We can then marshal the profile as usual.
bz, err := cdc.Marshal(profile)
jsonBz, err := cdc.MarshalJSON(profile)
```

To summarize, to encode an interface, you must 1/ pack the interface into an `Any` and 2/ marshal the `Any`. For convenience, the Cosmos SDK provides a `MarshalInterface` method to bundle these two steps. Have a look at [a real-life example in the x/auth module](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/keeper/keeper.go#L240-L243).

The reverse operation of retrieving the concrete Go type from inside an `Any`, called "unpacking", is done with the `GetCachedValue()` on `Any`.

```go
profileBz := ... // The proto-encoded bytes of a Profile, e.g. retrieved through gRPC.
var myProfile Profile
// Unmarshal the bytes into the myProfile struct.
err := cdc.Unmarshal(profilebz, &myProfile)

// Let's see the types of the Account field.
fmt.Printf("%T\n", myProfile.Account)                  // Prints "Any"
fmt.Printf("%T\n", myProfile.Account.GetCachedValue()) // Prints "BaseAccount", "ContinuousVestingAccount" or whatever was initially packed in the Any.

// Get the address of the accountt.
accAddr := myProfile.Account.GetCachedValue().(AccountI).GetAddress()
```

It is important to note that for `GetCachedValue()` to work, `Profile` (and any other structs embedding `Profile`) must implement the `UnpackInterfaces` method:

```go
func (p *Profile) UnpackInterfaces(unpacker codectypes.AnyUnpacker) error {
  if p.Account != nil {
    var account AccountI
    return unpacker.UnpackAny(p.Account, &account)
  }

  return nil
}
```

The `UnpackInterfaces` gets called recursively on all structs implementing this method, to allow all `Any`s to have their `GetCachedValue()` correctly populated.

For more information about interface encoding, and especially on `UnpackInterfaces` and how the `Any`'s `type_url` gets resolved using the `InterfaceRegistry`, please refer to [ADR-019](../../integrate/architecture/adr-019-protobuf-state-encoding.md).

#### `Any` Encoding in the Cosmos SDK

The above `Profile` example is a fictive example used for educational purposes. In the Cosmos SDK, we use `Any` encoding in several places (non-exhaustive list):

* the `cryptotypes.PubKey` interface for encoding different types of public keys,
* the `sdk.Msg` interface for encoding different `Msg`s in a transaction,
* the `AccountI` interface for encodinig different types of accounts (similar to the above example) in the x/auth query responses,
* the `Evidencei` interface for encoding different types of evidences in the x/evidence module,
* the `AuthorizationI` interface for encoding different types of x/authz authorizations,
* the [`Validator`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/types/staking.pb.go#L340-L377) struct that contains information about a validator.

A real-life example of encoding the pubkey as `Any` inside the Validator struct in x/staking is shown in the following example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/types/validator.go#L41-L64
```

#### `Any`'s TypeURL

When packing a protobuf message inside an `Any`, the message's type is uniquely defined by its type URL, which is the message's fully qualified name prefixed by a `/` (slash) character. In some implementations of `Any`, like the gogoproto one, there's generally [a resolvable prefix, e.g. `type.googleapis.com`](https://github.com/gogo/protobuf/blob/b03c65ea87cdc3521ede29f62fe3ce239267c1bc/protobuf/google/protobuf/any.proto#L87-L91). However, in the Cosmos SDK, we made the decision to not include such prefix, to have shorter type URLs. The Cosmos SDK's own `Any` implementation can be found in `github.com/cosmos/cosmos-sdk/codec/types`.

The Cosmos SDK is also switching away from gogoproto to the official `google.golang.org/protobuf` (known as the Protobuf API v2). Its default `Any` implementation also contains the [`type.googleapis.com`](https://github.com/protocolbuffers/protobuf-go/blob/v1.28.1/types/known/anypb/any.pb.go#L266) prefix. To maintain compatibility with the SDK, the following methods from `"google.golang.org/protobuf/types/known/anypb"` should not be used:

* `anypb.New`
* `anypb.MarshalFrom`
* `anypb.Any#MarshalFrom`

Instead, the Cosmos SDK provides helper functions in `"github.com/cosmos/cosmos-proto/anyutil"`, which create an official `anypb.Any` without inserting the prefixes:

* `anyutil.New`
* `anyutil.MarshalFrom`

For example, to pack a `sdk.Msg` called `internalMsg`, use:

```diff
import (
- 	"google.golang.org/protobuf/types/known/anypb"
+	"github.com/cosmos/cosmos-proto/anyutil"
)

- anyMsg, err := anypb.New(internalMsg.Message().Interface())
+ anyMsg, err := anyutil.New(internalMsg.Message().Interface())

- fmt.Println(anyMsg.TypeURL) // type.googleapis.com/cosmos.bank.v1beta1.MsgSend
+ fmt.Println(anyMsg.TypeURL) // /cosmos.bank.v1beta1.MsgSend
```

## FAQ

### How to create modules using protobuf encoding

#### Defining module types

Protobuf types can be defined to encode:

* state
* [`Msg`s](../../integrate/building-modules/02-messages-and-queries.md#messages)
* [Query services](../../integrate/building-modules/04-query-services.md)
* [genesis](../../integrate/building-modules/08-genesis.md)

#### Naming and conventions

We encourage developers to follow industry guidelines: [Protocol Buffers style guide](https://developers.google.com/protocol-buffers/docs/style)
and [Buf](https://buf.build/docs/style-guide), see more details in [ADR 023](../../integrate/architecture/adr-023-protobuf-naming.md)

### How to update modules to protobuf encoding

If modules do not contain any interfaces (e.g. `Account` or `Content`), then they
may simply migrate any existing types that
are encoded and persisted via their concrete Amino codec to Protobuf (see 1. for further guidelines) and accept a `Marshaler` as the codec which is implemented via the `ProtoCodec`
without any further customization.

However, if a module type composes an interface, it must wrap it in the `sdk.Any` (from `/types` package) type. To do that, a module-level .proto file must use [`google.protobuf.Any`](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/any.proto) for respective message type interface types.

For example, in the `x/evidence` module defines an `Evidence` interface, which is used by the `MsgSubmitEvidence`. The structure definition must use `sdk.Any` to wrap the evidence file. In the proto file we define it as follows:

```protobuf
// proto/cosmos/evidence/v1beta1/tx.proto

message MsgSubmitEvidence {
  string              submitter = 1;
  google.protobuf.Any evidence  = 2 [(cosmos_proto.accepts_interface) = "cosmos.evidence.v1beta1.Evidence"];
}
```

The Cosmos SDK `codec.Codec` interface provides support methods `MarshalInterface` and `UnmarshalInterface` to easy encoding of state to `Any`.

Module should register interfaces using `InterfaceRegistry` which provides a mechanism for registering interfaces: `RegisterInterface(protoName string, iface interface{}, impls ...proto.Message)` and implementations: `RegisterImplementations(iface interface{}, impls ...proto.Message)` that can be safely unpacked from Any, similarly to type registration with Amino:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/codec/types/interface_registry.go#L24-L57
```

In addition, an `UnpackInterfaces` phase should be introduced to deserialization to unpack interfaces before they're needed. Protobuf types that contain a protobuf `Any` either directly or via one of their members should implement the `UnpackInterfacesMessage` interface:

```go
type UnpackInterfacesMessage interface {
  UnpackInterfaces(InterfaceUnpacker) error
}
```

### Custom Stringer

Using `option (gogoproto.goproto_stringer) = false;` in a proto message definition leads to unexpected behaviour, like returning wrong output or having missing fields in the output.
For that reason a proto Message's `String()` must not be customized, and the `goproto_stringer` option must be avoided.

A correct YAML output can be obtained through ProtoJSON, using the `JSONToYAML` function:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/codec/yaml.go#L8-L20
```

For example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/types/account.go#L141-L151
```
