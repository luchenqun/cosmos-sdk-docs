# 交易

:::note 概要
`交易`是由终端用户创建的对象，用于触发应用程序中的状态变化。
:::

:::note

### 先决条件阅读

* [Cosmos SDK 应用程序的解剖](../high-level-concepts/00-overview-app.md)

:::

## 交易

交易由存储在[上下文](02-context.md)中的元数据和通过模块的 Protobuf [`Msg` 服务](../../integrate/building-modules/03-msg-services.md)触发模块内部状态变化的 [`sdk.Msg`](../../integrate/building-modules/02-messages-and-queries.md) 组成。

当用户想要与应用程序交互并进行状态变更（例如发送代币）时，他们创建交易。每个交易的 `sdk.Msg` 必须使用与相应账户关联的私钥进行签名，然后将交易广播到网络中。然后，交易必须被包含在一个区块中，并通过共识过程由网络验证和批准。要了解有关交易生命周期的更多信息，请点击[这里](../high-level-concepts/01-tx-lifecycle.md)。

## 类型定义

交易对象是实现 `Tx` 接口的 Cosmos SDK 类型

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/tx_msg.go#L42-L50
```

它包含以下方法：

* **GetMsgs：**解包交易并返回包含的 `sdk.Msg` 列表 - 一个交易可以有一个或多个消息，由模块开发人员定义。
* **ValidateBasic：**轻量级的、[_无状态_](../high-level-concepts/01-tx-lifecycle.md#types-of-checks)检查，由 ABCI 消息 [`CheckTx`](00-baseapp.md#checktx) 和 [`DeliverTx`](00-baseapp.md#delivertx) 使用，以确保交易无效。例如，[`auth`](https://github.com/cosmos/cosmos-sdk/tree/main/x/auth) 模块的 `ValidateBasic` 函数检查其交易是否由正确数量的签名者签名，并且费用不超过用户的最大值。当 [`runTx`](00-baseapp.md#runtx) 检查从 [`auth`](https://github.com/cosmos/cosmos-sdk/tree/main/x/auth/spec) 模块创建的交易时，它首先对每个消息运行 `ValidateBasic`，然后运行 `auth` 模块的 AnteHandler，该 AnteHandler 为交易本身调用 `ValidateBasic`。

```note
这个函数与已弃用的 `sdk.Msg` 的 `ValidateBasic` 方法不同，后者仅对消息进行基本有效性检查。
```

作为开发者，你很少直接操作 `Tx`，因为 `Tx` 实际上是用于事务生成的中间类型。相反，开发者应该优先使用 `TxBuilder` 接口，你可以在[下面](#transaction-generation)了解更多信息。

### 签名事务

事务中的每个消息都必须由其 `GetSigners` 指定的地址进行签名。Cosmos SDK 目前允许以两种不同的方式签名事务。

#### `SIGN_MODE_DIRECT`（首选）

`Tx` 接口的最常用实现是 Protobuf 的 `Tx` 消息，它在 `SIGN_MODE_DIRECT` 中使用：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L13-L26
```

由于 Protobuf 序列化不是确定性的，Cosmos SDK 使用额外的 `TxRaw` 类型来表示事务签名的固定字节。任何用户都可以为事务生成有效的 `body` 和 `auth_info`，并使用 Protobuf 序列化这两个消息。然后，`TxRaw` 将用户的 `body` 和 `auth_info` 的精确二进制表示固定为 `body_bytes` 和 `auth_info_bytes`。由所有事务签名者签名的文档是 `SignDoc`（使用 [ADR-027](../../integrate/architecture/adr-027-deterministic-protobuf-serialization.md) 进行确定性序列化）：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L48-L65
```

一旦由所有签名者签名，`body_bytes`、`auth_info_bytes` 和 `signatures` 将被收集到 `TxRaw` 中，其序列化字节将被广播到网络上。

#### `SIGN_MODE_LEGACY_AMINO_JSON`

`Tx` 接口的旧实现是 `x/auth` 中的 `StdTx` 结构体：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/migrations/legacytx/stdtx.go#L83-L93
```
```

所有签名者签署的文档是 `StdSignDoc`：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/migrations/legacytx/stdsign.go#L38-L52
```

该文档使用 Amino JSON 编码为字节。一旦所有签名都被收集到 `StdTx` 中，`StdTx` 将使用 Amino JSON 进行序列化，并将这些字节广播到网络上。

#### 其他签名模式

Cosmos SDK 还提供了一些其他的签名模式，用于特定的用例。

#### `SIGN_MODE_DIRECT_AUX`

`SIGN_MODE_DIRECT_AUX` 是 Cosmos SDK v0.46 中发布的一种签名模式，用于多签名者的交易。与 `SIGN_MODE_DIRECT` 期望每个签名者在 `TxBody` 和 `AuthInfo` 上进行签名（其中包括所有其他签名者的签名者信息，即他们的账户序列、公钥和模式信息）不同，`SIGN_MODE_DIRECT_AUX` 允许 N-1 个签名者仅在 `TxBody` 和 _自己的_ 签名者信息上进行签名。此外，每个辅助签名者（即使用 `SIGN_MODE_DIRECT_AUX` 的签名者）不需要在费用上进行签名：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L67-L97
```

这种用例是多签名者交易，其中一个签名者被指定为收集所有签名、广播签名并支付费用，而其他签名者只关心交易体。这通常可以提供更好的多签名用户体验。如果 Alice、Bob 和 Charlie 是一个 3 签名者交易的一部分，那么 Alice 和 Bob 都可以使用 `SIGN_MODE_DIRECT_AUX` 在 `TxBody` 和他们自己的签名者信息上进行签名（无需像 `SIGN_MODE_DIRECT` 中那样额外的步骤来收集其他签名者的签名者信息），而无需在其 SignDoc 中指定费用。然后，Charlie 可以从 Alice 和 Bob 收集两个签名，并通过附加费用创建最终交易。请注意，交易的费用支付者（在我们的例子中是 Charlie）必须在费用上进行签名，因此必须使用 `SIGN_MODE_DIRECT` 或 `SIGN_MODE_LEGACY_AMINO_JSON`。

在 [transaction tips](15-tips.md) 中实现了一个具体的用例：赠送者可以使用 `SIGN_MODE_DIRECT_AUX` 在交易中指定小费，而无需签署实际的交易费用。然后，费用支付者在赠送者期望的 `TxBody` 中附加费用，并作为支付费用和广播交易的交换，接收赠送者的交易小费作为支付。

#### `SIGN_MODE_TEXTUAL`

`SIGN_MODE_TEXTUAL`是一种新的签名模式，旨在提供更好的硬件钱包签名体验，目前仍在实现中。如果您想了解更多信息，请参考[ADR-050](https://github.com/cosmos/cosmos-sdk/pull/10701)。

#### 自定义签名模式

您有机会向Cosmos-SDK添加自定义的签名模式。虽然我们不能接受将签名模式的实现添加到存储库中，但我们可以接受一个拉取请求，将自定义签名模式添加到位于[此处](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/signing/v1beta1/signing.proto#L17)的SignMode枚举中。

## 交易流程

终端用户发送交易的过程如下：

* 决定要放入交易中的消息，
* 使用Cosmos SDK的`TxBuilder`生成交易，
* 使用可用的接口广播交易。

下面的段落将按照这个顺序描述每个组件。

### 消息

:::tip
模块`sdk.Msg`不应与[ABCI消息](https://docs.cometbft.com/v0.37/spec/abci/)混淆，后者定义了CometBFT和应用层之间的交互。
:::

**消息**（或`sdk.Msg`）是模块特定的对象，触发其所属模块范围内的状态转换。模块开发人员通过向Protobuf的[`Msg`服务](../../integrate/building-modules/03-msg-services.md)添加方法来定义其模块的消息，并实现相应的`MsgServer`。

每个`sdk.Msg`与一个Protobuf [`Msg`服务](../../integrate/building-modules/03-msg-services.md) RPC相关联，该RPC在每个模块的`tx.proto`文件中定义。SDK应用程序路由器会自动将每个`sdk.Msg`映射到相应的RPC。Protobuf为每个模块的`Msg`服务生成一个`MsgServer`接口，模块开发人员需要实现此接口。
这种设计将更多的责任放在模块开发人员身上，使应用程序开发人员能够重用常见功能，而无需重复实现状态转换逻辑。

要了解有关 Protobuf `Msg` 服务以及如何实现 `MsgServer` 的更多信息，请点击[这里](../../integrate/building-modules/03-msg-services.md)。

虽然消息包含状态转换逻辑的信息，但事务的其他元数据和相关信息存储在 `TxBuilder` 和 `Context` 中。

### 事务生成

`TxBuilder` 接口包含与事务生成密切相关的数据，用户可以自由设置以生成所需的事务：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx_config.go#L33-L50
```

* `Msg`s，事务中包含的[消息](#messages)数组。
* `GasLimit`，用户选择的计算所需支付的燃料量的选项。
* `Memo`，与事务一起发送的注释或备注。
* `FeeAmount`，用户愿意支付的最大费用金额。
* `TimeoutHeight`，事务有效的区块高度。
* `Signatures`，事务的所有签名者的签名数组。

由于当前有两种签名模式用于签名事务，因此也有两种 `TxBuilder` 的实现：

* [wrapper](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/builder.go#L18-L34)，用于创建 `SIGN_MODE_DIRECT` 的事务，
* [StdTxBuilder](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/migrations/legacytx/stdtx_builder.go#L15-L21)，用于 `SIGN_MODE_LEGACY_AMINO_JSON`。

然而，`TxBuilder` 的这两种实现应该对终端用户隐藏起来，因为他们应该优先使用总体的 `TxConfig` 接口：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx_config.go#L22-L31
```

`TxConfig` 是一个应用程序范围的配置，用于管理事务。最重要的是，它保存了有关是否使用 `SIGN_MODE_DIRECT` 或 `SIGN_MODE_LEGACY_AMINO_JSON` 对每个事务进行签名的信息。通过调用 `txBuilder := txConfig.NewTxBuilder()`，将创建一个新的 `TxBuilder`，并使用适当的签名模式。

一旦 `TxBuilder` 使用上述公开的设置正确填充，`TxConfig` 也会负责正确编码字节（再次使用 `SIGN_MODE_DIRECT` 或 `SIGN_MODE_LEGACY_AMINO_JSON`）。下面是使用 `TxEncoder()` 方法生成和编码交易的伪代码片段：

```go
txBuilder := txConfig.NewTxBuilder()
txBuilder.SetMsgs(...) // and other setters on txBuilder

bz, err := txConfig.TxEncoder()(txBuilder.GetTx())
// bz are bytes to be broadcasted over the network
```

### 广播交易

生成交易字节后，目前有三种方式可以广播交易。

#### 命令行界面

应用程序开发人员通过创建[命令行界面](07-cli.md)（gRPC 和/或 REST 接口）来创建应用程序的入口点，通常可以在应用程序的 `./cmd` 文件夹中找到。这些接口允许用户通过命令行与应用程序进行交互。

对于[命令行界面](../../integrate/building-modules/09-module-interfaces.md#cli)，模块开发人员创建子命令作为应用程序顶级事务命令 `TxCmd` 的子级。CLI 命令实际上将事务处理的所有步骤捆绑到一个简单的命令中：创建消息、生成交易和广播。有关具体示例，请参阅[与节点交互](../../user/run-node/02-interact-node.md)部分。使用 CLI 创建的示例交易如下所示：

```bash
simd tx send $MY_VALIDATOR_ADDRESS $RECIPIENT 1000stake
```

#### gRPC

[gRPC](https://grpc.io) 是 Cosmos SDK 的 RPC 层的主要组件。它的主要用途是在模块的 [`Query` 服务](../../integrate/building-modules/04-query-services.md)的上下文中使用。然而，Cosmos SDK 还公开了一些其他与模块无关的 gRPC 服务，其中之一就是 `Tx` 服务：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/service.proto
```

`Tx` 服务公开了一些实用函数，例如模拟交易或查询交易，还有一种方法用于广播交易。

有关广播和模拟交易的示例，请参见[此处](../../user/run-node/03-txs.md#programmatically-with-go)。

#### REST

每个 gRPC 方法都有对应的 REST 端点，使用 [gRPC-gateway](https://github.com/grpc-ecosystem/grpc-gateway) 生成。因此，您可以使用 HTTP 来广播相同的交易，使用 `POST /cosmos/tx/v1beta1/txs` 端点。

可以在[这里](../../user/run-node/03-txs.md#using-rest)看到一个示例。

#### CometBFT RPC

上面介绍的三种方法实际上是对 CometBFT RPC `/broadcast_tx_{async,sync,commit}` 端点的更高级抽象，文档在[这里](https://docs.cometbft.com/v0.37/core/rpc)。这意味着，如果您愿意，您也可以直接使用 CometBFT RPC 端点来广播交易。


# Transactions

:::note Synopsis
`Transactions` are objects created by end-users to trigger state changes in the application.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK Application](../high-level-concepts/00-overview-app.md)

:::

## Transactions

Transactions are comprised of metadata held in [contexts](02-context.md) and [`sdk.Msg`s](../../integrate/building-modules/02-messages-and-queries.md) that trigger state changes within a module through the module's Protobuf [`Msg` service](../../integrate/building-modules/03-msg-services.md).

When users want to interact with an application and make state changes (e.g. sending coins), they create transactions. Each of a transaction's `sdk.Msg` must be signed using the private key associated with the appropriate account(s), before the transaction is broadcasted to the network. A transaction must then be included in a block, validated, and approved by the network through the consensus process. To read more about the lifecycle of a transaction, click [here](../high-level-concepts/01-tx-lifecycle.md).

## Type Definition

Transaction objects are Cosmos SDK types that implement the `Tx` interface

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/tx_msg.go#L42-L50
```

It contains the following methods:

* **GetMsgs:** unwraps the transaction and returns a list of contained `sdk.Msg`s - one transaction may have one or multiple messages, which are defined by module developers.
* **ValidateBasic:** lightweight, [_stateless_](../high-level-concepts/01-tx-lifecycle.md#types-of-checks) checks used by ABCI messages [`CheckTx`](00-baseapp.md#checktx) and [`DeliverTx`](00-baseapp.md#delivertx) to make sure transactions are not invalid. For example, the [`auth`](https://github.com/cosmos/cosmos-sdk/tree/main/x/auth) module's `ValidateBasic` function checks that its transactions are signed by the correct number of signers and that the fees do not exceed what the user's maximum. When [`runTx`](00-baseapp.md#runtx) is checking a transaction created from the [`auth`](https://github.com/cosmos/cosmos-sdk/tree/main/x/auth/spec) module, it first runs `ValidateBasic` on each message, then runs the `auth` module AnteHandler which calls `ValidateBasic` for the transaction itself.

    :::note
    This function is different from the deprecated `sdk.Msg` [`ValidateBasic`](../high-level-concepts/01-tx-lifecycle.md#ValidateBasic) methods, which was performing basic validity checks on messages only. 
    :::

As a developer, you should rarely manipulate `Tx` directly, as `Tx` is really an intermediate type used for transaction generation. Instead, developers should prefer the `TxBuilder` interface, which you can learn more about [below](#transaction-generation).

### Signing Transactions

Every message in a transaction must be signed by the addresses specified by its `GetSigners`. The Cosmos SDK currently allows signing transactions in two different ways.

#### `SIGN_MODE_DIRECT` (preferred)

The most used implementation of the `Tx` interface is the Protobuf `Tx` message, which is used in `SIGN_MODE_DIRECT`:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L13-L26
```

Because Protobuf serialization is not deterministic, the Cosmos SDK uses an additional `TxRaw` type to denote the pinned bytes over which a transaction is signed. Any user can generate a valid `body` and `auth_info` for a transaction, and serialize these two messages using Protobuf. `TxRaw` then pins the user's exact binary representation of `body` and `auth_info`, called respectively `body_bytes` and `auth_info_bytes`. The document that is signed by all signers of the transaction is `SignDoc` (deterministically serialized using [ADR-027](../../integrate/architecture/adr-027-deterministic-protobuf-serialization.md)):

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L48-L65
```

Once signed by all signers, the `body_bytes`, `auth_info_bytes` and `signatures` are gathered into `TxRaw`, whose serialized bytes are broadcasted over the network.

#### `SIGN_MODE_LEGACY_AMINO_JSON`

The legacy implementation of the `Tx` interface is the `StdTx` struct from `x/auth`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/migrations/legacytx/stdtx.go#L83-L93
```

The document signed by all signers is `StdSignDoc`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/migrations/legacytx/stdsign.go#L38-L52
```

which is encoded into bytes using Amino JSON. Once all signatures are gathered into `StdTx`, `StdTx` is serialized using Amino JSON, and these bytes are broadcasted over the network.

#### Other Sign Modes

The Cosmos SDK also provides a couple of other sign modes for particular use cases.

#### `SIGN_MODE_DIRECT_AUX`

`SIGN_MODE_DIRECT_AUX` is a sign mode released in the Cosmos SDK v0.46 which targets transactions with multiple signers. Whereas `SIGN_MODE_DIRECT` expects each signer to sign over both `TxBody` and `AuthInfo` (which includes all other signers' signer infos, i.e. their account sequence, public key and mode info), `SIGN_MODE_DIRECT_AUX` allows N-1 signers to only sign over `TxBody` and _their own_ signer info. Morever, each auxiliary signer (i.e. a signer using `SIGN_MODE_DIRECT_AUX`) doesn't
need to sign over the fees:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L67-L97
```

The use case is a multi-signer transaction, where one of the signers is appointed to gather all signatures, broadcast the signature and pay for fees, and the others only care about the transaction body. This generally allows for a better multi-signing UX. If Alice, Bob and Charlie are part of a 3-signer transaction, then Alice and Bob can both use `SIGN_MODE_DIRECT_AUX` to sign over the `TxBody` and their own signer info (no need an additional step to gather other signers' ones, like in `SIGN_MODE_DIRECT`), without specifying a fee in their SignDoc. Charlie can then gather both signatures from Alice and Bob, and
create the final transaction by appending a fee. Note that the fee payer of the transaction (in our case Charlie) must sign over the fees, so must use `SIGN_MODE_DIRECT` or `SIGN_MODE_LEGACY_AMINO_JSON`.

A concrete use case is implemented in [transaction tips](15-tips.md): the tipper may use `SIGN_MODE_DIRECT_AUX` to specify a tip in the transaction, without signing over the actual transaction fees. Then, the fee payer appends fees inside the tipper's desired `TxBody`, and as an exchange for paying the fees and broadcasting the transaction, receives the tipper's transaction tips as payment.

#### `SIGN_MODE_TEXTUAL`

`SIGN_MODE_TEXTUAL` is a new sign mode for delivering a better signing experience on hardware wallets, it is currently still under implementation. If you wish to learn more, please refer to [ADR-050](https://github.com/cosmos/cosmos-sdk/pull/10701).

#### Custom Sign modes

There is the the opportunity to add your own custom sign mode to the Cosmos-SDK.  While we can not accept the implementation of the sign mode to the repository, we can accept a pull request to add the custom signmode to the SignMode enum located [here](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/signing/v1beta1/signing.proto#L17)

## Transaction Process

The process of an end-user sending a transaction is:

* decide on the messages to put into the transaction,
* generate the transaction using the Cosmos SDK's `TxBuilder`,
* broadcast the transaction using one of the available interfaces.

The next paragraphs will describe each of these components, in this order.

### Messages

:::tip
Module `sdk.Msg`s are not to be confused with [ABCI Messages](https://docs.cometbft.com/v0.37/spec/abci/) which define interactions between the CometBFT and application layers.
:::

**Messages** (or `sdk.Msg`s) are module-specific objects that trigger state transitions within the scope of the module they belong to. Module developers define the messages for their module by adding methods to the Protobuf [`Msg` service](../../integrate/building-modules/03-msg-services.md), and also implement the corresponding `MsgServer`.

Each `sdk.Msg`s is related to exactly one Protobuf [`Msg` service](../../integrate/building-modules/03-msg-services.md) RPC, defined inside each module's `tx.proto` file. A SDK app router automatically maps every `sdk.Msg` to a corresponding RPC. Protobuf generates a `MsgServer` interface for each module `Msg` service, and the module developer needs to implement this interface.
This design puts more responsibility on module developers, allowing application developers to reuse common functionalities without having to implement state transition logic repetitively.

To learn more about Protobuf `Msg` services and how to implement `MsgServer`, click [here](../../integrate/building-modules/03-msg-services.md).

While messages contain the information for state transition logic, a transaction's other metadata and relevant information are stored in the `TxBuilder` and `Context`.

### Transaction Generation

The `TxBuilder` interface contains data closely related with the generation of transactions, which an end-user can freely set to generate the desired transaction:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx_config.go#L33-L50
```

* `Msg`s, the array of [messages](#messages) included in the transaction.
* `GasLimit`, option chosen by the users for how to calculate how much gas they will need to pay.
* `Memo`, a note or comment to send with the transaction.
* `FeeAmount`, the maximum amount the user is willing to pay in fees.
* `TimeoutHeight`, block height until which the transaction is valid.
* `Signatures`, the array of signatures from all signers of the transaction.

As there are currently two sign modes for signing transactions, there are also two implementations of `TxBuilder`:

* [wrapper](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/builder.go#L18-L34) for creating transactions for `SIGN_MODE_DIRECT`,
* [StdTxBuilder](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/migrations/legacytx/stdtx_builder.go#L15-L21) for `SIGN_MODE_LEGACY_AMINO_JSON`.

However, the two implementation of `TxBuilder` should be hidden away from end-users, as they should prefer using the overarching `TxConfig` interface:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx_config.go#L22-L31
```

`TxConfig` is an app-wide configuration for managing transactions. Most importantly, it holds the information about whether to sign each transaction with `SIGN_MODE_DIRECT` or `SIGN_MODE_LEGACY_AMINO_JSON`. By calling `txBuilder := txConfig.NewTxBuilder()`, a new `TxBuilder` will be created with the appropriate sign mode.

Once `TxBuilder` is correctly populated with the setters exposed above, `TxConfig` will also take care of correctly encoding the bytes (again, either using `SIGN_MODE_DIRECT` or `SIGN_MODE_LEGACY_AMINO_JSON`). Here's a pseudo-code snippet of how to generate and encode a transaction, using the `TxEncoder()` method:

```go
txBuilder := txConfig.NewTxBuilder()
txBuilder.SetMsgs(...) // and other setters on txBuilder

bz, err := txConfig.TxEncoder()(txBuilder.GetTx())
// bz are bytes to be broadcasted over the network
```

### Broadcasting the Transaction

Once the transaction bytes are generated, there are currently three ways of broadcasting it.

#### CLI

Application developers create entry points to the application by creating a [command-line interface](07-cli.md), [gRPC and/or REST interface](09-grpc_rest.md), typically found in the application's `./cmd` folder. These interfaces allow users to interact with the application through command-line.

For the [command-line interface](../../integrate/building-modules/09-module-interfaces.md#cli), module developers create subcommands to add as children to the application top-level transaction command `TxCmd`. CLI commands actually bundle all the steps of transaction processing into one simple command: creating messages, generating transactions and broadcasting. For concrete examples, see the [Interacting with a Node](../../user/run-node/02-interact-node.md) section. An example transaction made using CLI looks like:

```bash
simd tx send $MY_VALIDATOR_ADDRESS $RECIPIENT 1000stake
```

#### gRPC

[gRPC](https://grpc.io) is the main component for the Cosmos SDK's RPC layer. Its principal usage is in the context of modules' [`Query` services](../../integrate/building-modules/04-query-services.md). However, the Cosmos SDK also exposes a few other module-agnostic gRPC services, one of them being the `Tx` service:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/service.proto
```

The `Tx` service exposes a handful of utility functions, such as simulating a transaction or querying a transaction, and also one method to broadcast transactions.

Examples of broadcasting and simulating a transaction are shown [here](../../user/run-node/03-txs.md#programmatically-with-go).

#### REST

Each gRPC method has its corresponding REST endpoint, generated using [gRPC-gateway](https://github.com/grpc-ecosystem/grpc-gateway). Therefore, instead of using gRPC, you can also use HTTP to broadcast the same transaction, on the `POST /cosmos/tx/v1beta1/txs` endpoint.

An example can be seen [here](../../user/run-node/03-txs.md#using-rest)

#### CometBFT RPC

The three methods presented above are actually higher abstractions over the CometBFT RPC `/broadcast_tx_{async,sync,commit}` endpoints, documented [here](https://docs.cometbft.com/v0.37/core/rpc). This means that you can use the CometBFT RPC endpoints directly to broadcast the transaction, if you wish so.
