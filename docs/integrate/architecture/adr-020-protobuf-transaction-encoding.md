# ADR 020: Protocol Buffer 交易编码

## 更新日志

* 2020年3月6日：初稿
* 2020年3月12日：API 更新
* 2020年4月13日：添加关于 `oneof` 接口处理的详细信息
* 2020年4月30日：切换到 `Any`
* 2020年5月14日：描述公钥编码
* 2020年6月8日：在 `SignDoc` 中以字节形式存储 `TxBody` 和 `AuthInfo`；将 `TxRaw` 文档化为广播和存储类型。
* 2020年8月7日：使用 ADR 027 对 `SignDoc` 进行序列化。
* 2020年8月19日：将序列字段从 `SignDoc` 移动到 `SignerInfo`，如 [#6966](https://github.com/cosmos/cosmos-sdk/issues/6966) 中讨论的。
* 2020年9月25日：删除 `PublicKey` 类型，改用 `secp256k1.PubKey`、`ed25519.PubKey` 和 `multisig.LegacyAminoPubKey`。
* 2020年10月15日：在 `AccountRetriever` 接口中添加 `GetAccount` 和 `GetAccountWithHeight` 方法。
* 2021年2月24日：Cosmos SDK 不再使用 Tendermint 的 `PubKey` 接口，而是使用自己的 `cryptotypes.PubKey`。更新以反映这一点。
* 2021年5月3日：将 `clientCtx.JSONMarshaler` 重命名为 `clientCtx.JSONCodec`。
* 2021年6月10日：添加 `clientCtx.Codec: codec.Codec`。

## 状态

已接受

## 背景

本 ADR 是在 [ADR 019](adr-019-protobuf-state-encoding.md) 中建立的动机、设计和背景的基础上的延续，即我们旨在为 Cosmos SDK 的客户端设计 Protocol Buffer 迁移路径。

具体来说，客户端的迁移路径主要包括交易生成和签名、消息构建和路由，以及 CLI 和 REST 处理程序和业务逻辑（即查询器）。

考虑到这一点，我们将通过两个主要领域来解决迁移路径，即交易和查询。然而，本 ADR 仅关注交易。查询应在未来的 ADR 中解决，但应基于这些提案构建。

根据详细讨论（[\#6030](https://github.com/cosmos/cosmos-sdk/issues/6030) 和 [\#6078](https://github.com/cosmos/cosmos-sdk/issues/6078)），交易的原始设计从 `oneof` /JSON 签名方法大幅改变为下面描述的方法。

## 决策

### 交易

由于接口值在状态中使用 `google.protobuf.Any` 进行编码（参见 [ADR 019](adr-019-protobuf-state-encoding.md)），
`sdk.Msg` 在交易中使用 `Any` 进行编码。

使用 `Any` 来编码接口值的主要目标之一是拥有一组核心类型，这些类型可以被应用程序重用，以便
客户端可以与尽可能多的链兼容。

本规范的目标之一是提供一种灵活的跨链交易格式，可以适应各种用例，而不会破坏客户端的兼容性。

为了方便签名，将交易分为 `TxBody` 和 `signatures`，`TxBody` 将在下面的 `SignDoc` 中重用：

```protobuf
// types/types.proto
package cosmos_sdk.v1;

message Tx {
    TxBody body = 1;
    AuthInfo auth_info = 2;
    // A list of signatures that matches the length and order of AuthInfo's signer_infos to
    // allow connecting signature meta information like public key and signing mode by position.
    repeated bytes signatures = 3;
}

// A variant of Tx that pins the signer's exact binary represenation of body and
// auth_info. This is used for signing, broadcasting and verification. The binary
// `serialize(tx: TxRaw)` is stored in Tendermint and the hash `sha256(serialize(tx: TxRaw))`
// becomes the "txhash", commonly used as the transaction ID.
message TxRaw {
    // A protobuf serialization of a TxBody that matches the representation in SignDoc.
    bytes body = 1;
    // A protobuf serialization of an AuthInfo that matches the representation in SignDoc.
    bytes auth_info = 2;
    // A list of signatures that matches the length and order of AuthInfo's signer_infos to
    // allow connecting signature meta information like public key and signing mode by position.
    repeated bytes signatures = 3;
}

message TxBody {
    // A list of messages to be executed. The required signers of those messages define
    // the number and order of elements in AuthInfo's signer_infos and Tx's signatures.
    // Each required signer address is added to the list only the first time it occurs.
    //
    // By convention, the first required signer (usually from the first message) is referred
    // to as the primary signer and pays the fee for the whole transaction.
    repeated google.protobuf.Any messages = 1;
    string memo = 2;
    int64 timeout_height = 3;
    repeated google.protobuf.Any extension_options = 1023;
}

message AuthInfo {
    // This list defines the signing modes for the required signers. The number
    // and order of elements must match the required signers from TxBody's messages.
    // The first element is the primary signer and the one which pays the fee.
    repeated SignerInfo signer_infos = 1;
    // The fee can be calculated based on the cost of evaluating the body and doing signature verification of the signers. This can be estimated via simulation.
    Fee fee = 2;
}

message SignerInfo {
    // The public key is optional for accounts that already exist in state. If unset, the
    // verifier can use the required signer address for this position and lookup the public key.
    google.protobuf.Any public_key = 1;
    // ModeInfo describes the signing mode of the signer and is a nested
    // structure to support nested multisig pubkey's
    ModeInfo mode_info = 2;
    // sequence is the sequence of the account, which describes the
    // number of committed transactions signed by a given address. It is used to prevent
    // replay attacks.
    uint64 sequence = 3;
}

message ModeInfo {
    oneof sum {
        Single single = 1;
        Multi multi = 2;
    }

    // Single is the mode info for a single signer. It is structured as a message
    // to allow for additional fields such as locale for SIGN_MODE_TEXTUAL in the future
    message Single {
        SignMode mode = 1;
    }

    // Multi is the mode info for a multisig public key
    message Multi {
        // bitarray specifies which keys within the multisig are signing
        CompactBitArray bitarray = 1;
        // mode_infos is the corresponding modes of the signers of the multisig
        // which could include nested multisig public keys
        repeated ModeInfo mode_infos = 2;
    }
}

enum SignMode {
    SIGN_MODE_UNSPECIFIED = 0;

    SIGN_MODE_DIRECT = 1;

    SIGN_MODE_TEXTUAL = 2;

    SIGN_MODE_LEGACY_AMINO_JSON = 127;
}
```

如下所讨论的，为了在 `SignDoc` 中包含尽可能多的 `Tx`，`SignerInfo` 被分离出来，以便只有
原始签名本身位于签名之外。

由于我们的目标是提供一种灵活、可扩展的跨链交易格式，所以只要发现了新的交易处理选项，就应该立即将其添加到 `TxBody` 中，
即使它们目前无法实现。

由于这会带来协调开销，`TxBody` 包括一个 `extension_options` 字段，用于存储尚未涵盖的任何交易处理选项。
然而，应用程序开发人员应该尽量将重要的改进提交给 `Tx`。

### 签名

以下所有的签名模式都旨在提供以下保证：

* **无篡改性**：一旦交易被签名，`TxBody` 和 `AuthInfo` 就不能更改
* **可预测的 Gas**：如果我正在签署一笔需要支付费用的交易，最终的 Gas 完全取决于我正在签署的内容

这些保证给消息签名者提供了最大的信心，即中间人对 `Tx` 的操纵不会导致任何有意义的更改。

#### `SIGN_MODE_DIRECT`

"直接" 签名行为是对通过网络广播的原始 `TxBody` 字节进行签名。这样做的优点有：

* 要求最小的额外客户端能力，超出了标准协议缓冲区的实现
* 在交易可塑性方面几乎没有漏洞（即签名和编码格式之间没有微妙的差异，可能会被攻击者利用）

签名使用下面的 `SignDoc` 结构，它重用了 `TxBody` 和 `AuthInfo` 的序列化，并且只添加了签名所需的字段：

```protobuf
// types/types.proto
message SignDoc {
    // A protobuf serialization of a TxBody that matches the representation in TxRaw.
    bytes body = 1;
    // A protobuf serialization of an AuthInfo that matches the representation in TxRaw.
    bytes auth_info = 2;
    string chain_id = 3;
    uint64 account_number = 4;
}
```

为了以默认模式进行签名，客户端需要执行以下步骤：

1. 使用任何有效的 protobuf 实现对 `TxBody` 和 `AuthInfo` 进行序列化。
2. 创建一个 `SignDoc` 并使用 [ADR 027](adr-027-deterministic-protobuf-serialization.md) 进行序列化。
3. 对编码后的 `SignDoc` 字节进行签名。
4. 构建一个 `TxRaw` 并对其进行序列化以进行广播。

签名验证基于比较 `TxRaw` 中编码的原始 `TxBody` 和 `AuthInfo` 字节，而不是基于任何 ["规范化"](https://github.com/regen-network/canonical-proto3) 算法，这会给客户端增加额外的复杂性，并阻止某些形式的可升级性（稍后在本文档中解决）。

签名验证器执行以下操作：

1. 反序列化 `TxRaw` 并提取 `body` 和 `auth_info`。
2. 从消息中创建所需签名者地址的列表。
3. 对于每个所需签名者：
   * 从状态中获取账户号码和序列号。
   * 从状态或 `AuthInfo` 的 `signer_infos` 中获取公钥。
   * 创建一个 `SignDoc` 并使用 [ADR 027](adr-027-deterministic-protobuf-serialization.md) 进行序列化。
   * 在相同的列表位置上，对序列化的 `SignDoc` 进行签名验证。

#### `SIGN_MODE_LEGACY_AMINO`

为了支持传统钱包和交易所，暂时支持 Amino JSON 进行交易签名。一旦钱包和交易所升级到基于 protobuf 的签名，将禁用此选项。与此同时，预计禁用当前的 Amino 签名会导致太多的破坏，因此不可行。请注意，这主要是 Cosmos Hub 的要求，其他链可能选择立即禁用 Amino 签名。

传统客户端将能够使用当前的Amino JSON格式对事务进行签名，并在广播之前使用REST `/tx/encode`端点将其编码为protobuf。

#### `SIGN_MODE_TEXTUAL`

正如在 [\#6078](https://github.com/cosmos/cosmos-sdk/issues/6078) 中广泛讨论的那样，人们希望有一种可读性强的签名编码，特别是对于像 [Ledger](https://www.ledger.com) 这样在签名之前向用户显示事务内容的硬件钱包。JSON 是对此的一种尝试，但并不完美。

`SIGN_MODE_TEXTUAL` 旨在作为一个可读性强的编码的占位符，它将取代 Amino JSON。这种新的编码应该比 JSON 更加注重可读性，可能基于类似于 [MessageFormat](http://userguide.icu-project.org/formatparse/messages) 的格式化字符串。

为了确保新的可读性强的格式不会受到事务可塑性问题的影响，`SIGN_MODE_TEXTUAL` 要求将_可读性强的字节与原始的 `SignDoc` 连接起来_以生成签名字节。

当 `SIGN_MODE_TEXTUAL` 被实现时，可能会支持多种可读性强的格式（甚至是本地化的消息）。

### 未知字段过滤

通常情况下，protobuf 消息中的未知字段应该被事务处理器拒绝，因为：

* 未知字段中可能存在重要数据，如果忽略这些字段，将会导致客户端出现意外行为
* 它们会导致可塑性漏洞，攻击者可以通过向未签名内容（即主 `Tx` 而不是 `TxBody`）中添加随机未解释的数据来膨胀事务大小

还有一些情况下，我们可能选择安全地忽略未知字段（https://github.com/cosmos/cosmos-sdk/issues/6078#issuecomment-624400188），以与更新的客户端提供优雅的向前兼容性。

我们建议将第 11 位设置为 1 的字段号（对于大多数用例，这是 1024-2047 的范围）视为非关键字段，如果未知，则可以安全地忽略。

为了处理这个问题，我们将需要一个未知字段过滤器，它应该：

* 对于未知字段，始终拒绝未签名内容（即顶级的 `Tx` 和 `AuthInfo` 的未签名部分（如果存在）基于签名模式）
* 对于所有消息（包括嵌套的 `Any`），拒绝未知字段，除了设置了第11位的字段

这可能需要一个自定义的 protobuf 解析器，它接受消息字节和 `FileDescriptor`，并返回一个布尔结果。

### 公钥编码

Cosmos SDK 中的公钥实现了 `cryptotypes.PubKey` 接口。
我们建议使用 `Any` 进行 protobuf 编码，就像我们在其他接口中所做的一样（例如，在 `BaseAccount.PubKey` 和 `SignerInfo.PublicKey` 中）。
以下公钥已实现：secp256k1、secp256r1、ed25519 和 legacy-multisignature。

例如：

```protobuf
message PubKey {
    bytes key = 1;
}
```

`multisig.LegacyAminoPubKey` 有一个 `Any` 数组成员，用于支持任何 protobuf 公钥类型。

应用程序只应尝试处理已经测试过的注册公钥集合。提供的签名验证 ante 处理程序装饰器将强制执行此要求。

### CLI 和 REST

目前，REST 和 CLI 处理程序使用具体的 Amino 编解码器通过 Amino JSON 编码来编码和解码类型和交易。由于客户端处理的某些类型可以是接口，类似于我们在 [ADR 019](adr-019-protobuf-state-encoding.md) 中描述的方式，客户端逻辑现在需要接受一个编解码器接口，该接口不仅知道如何处理所有类型，还知道如何生成交易、签名和消息。

```go
type AccountRetriever interface {
  GetAccount(clientCtx Context, addr sdk.AccAddress) (client.Account, error)
  GetAccountWithHeight(clientCtx Context, addr sdk.AccAddress) (client.Account, int64, error)
  EnsureExists(clientCtx client.Context, addr sdk.AccAddress) error
  GetAccountNumberSequence(clientCtx client.Context, addr sdk.AccAddress) (uint64, uint64, error)
}

type Generator interface {
  NewTx() TxBuilder
  NewFee() ClientFee
  NewSignature() ClientSignature
  MarshalTx(tx types.Tx) ([]byte, error)
}

type TxBuilder interface {
  GetTx() sdk.Tx

  SetMsgs(...sdk.Msg) error
  GetSignatures() []sdk.Signature
  SetSignatures(...sdk.Signature)
  GetFee() sdk.Fee
  SetFee(sdk.Fee)
  GetMemo() string
  SetMemo(string)
}
```

然后，我们更新 `Context`，添加新字段：`Codec`、`TxGenerator` 和 `AccountRetriever`，并更新 `AppModuleBasic.GetTxCmd`，使其接受一个预填充了这些字段的 `Context`。

然后，每个客户端方法应使用其中一个 `Init` 方法重新初始化预填充的 `Context`。`tx.GenerateOrBroadcastTx` 可用于生成或广播交易。例如：

```go
import "github.com/spf13/cobra"
import "github.com/cosmos/cosmos-sdk/client"
import "github.com/cosmos/cosmos-sdk/client/tx"

func NewCmdDoSomething(clientCtx client.Context) *cobra.Command {
	return &cobra.Command{
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx := ctx.InitWithInput(cmd.InOrStdin())
			msg := NewSomeMsg{...}
			tx.GenerateOrBroadcastTx(clientCtx, msg)
		},
	}
}
```

## 未来的改进

### `SIGN_MODE_TEXTUAL` 规范

`SIGN_MODE_TEXTUAL` 的具体规范和实现计划作为近期的未来改进，以便硬件钱包应用和其他钱包可以优雅地迁移到非 Amino JSON。

### `SIGN_MODE_DIRECT_AUX`

（\*在 https://github.com/cosmos/cosmos-sdk/issues/6078#issuecomment-628026933 中被记录为选项（3））

我们可以添加一个模式 `SIGN_MODE_DIRECT_AUX`，以支持多个签名被收集到单个交易中的场景，但消息的组合者还不知道哪些签名将包含在最终交易中。例如，我可能有一个3/5的多签钱包，并希望将 `TxBody` 发送给所有5个签名者，以查看谁先签名。一旦我获得了3个签名，我就会继续构建完整的交易。

使用 `SIGN_MODE_DIRECT`，每个签名者都需要签署包含所有签名者和签名模式完整列表的 `AuthInfo`，这使得上述场景非常困难。

`SIGN_MODE_DIRECT_AUX` 允许 "辅助" 签名者仅使用 `TxBody` 和自己的 `PublicKey` 创建他们的签名。这样可以延迟在收集到签名之前在 `AuthInfo` 中包含签名者的完整列表。

"辅助" 签名者是除支付费用的主要签名者之外的任何签名者。对于主要签名者，实际上需要完整的 `AuthInfo` 来计算燃气和费用，因为这取决于使用了多少个签名者、使用了哪些密钥类型和签名模式。然而，辅助签名者不需要担心费用或燃气，因此可以只签署 `TxBody`。

要在 `SIGN_MODE_DIRECT_AUX` 中生成签名，应按照以下步骤进行：

1. 编码 `SignDocAux`（具有相同的要求，字段必须按顺序序列化）：

    ```protobuf
    // types/types.proto
    message SignDocAux {
        bytes body_bytes = 1;
        // PublicKey is included in SignDocAux :
        // 1. as a special case for multisig public keys. For multisig public keys,
        // the signer should use the top-level multisig public key they are signing
        // against, not their own public key. This is to prevent against a form
        // of malleability where a signature could be taken out of context of the
        // multisig key that was intended to be signed for
        // 2. to guard against scenario where configuration information is encoded
        // in public keys (it has been proposed) such that two keys can generate
        // the same signature but have different security properties
        //
        // By including it here, the composer of AuthInfo cannot reference the
        // a public key variant the signer did not intend to use
        PublicKey public_key = 2;
        string chain_id = 3;
        uint64 account_number = 4;
    }
    ```

2. 对编码的 `SignDocAux` 字节进行签名
3. 将他们的签名和 `SignerInfo` 发送给主要签署者，然后主要签署者将签署并广播最终交易（使用 `SIGN_MODE_DIRECT` 和添加了 `AuthInfo`）一旦收集到足够的签名

### `SIGN_MODE_DIRECT_RELAXED`

（在 https://github.com/cosmos/cosmos-sdk/issues/6078#issuecomment-628026933 中作为选项（1）（a）记录）

这是 `SIGN_MODE_DIRECT` 的一种变体，其中多个签署者不需要事先协调公钥和签名模式。它将涉及类似于上面的带有费用的替代 `SignDoc`。如果客户端开发人员发现事先收集公钥和模式的负担过重，可以在将来添加此功能。

## 结果

### 积极的

* 显著的性能提升。
* 支持向后和向前的类型兼容性。
* 更好地支持跨语言客户端。
* 多种签名模式允许更大的协议演进

### 负面的

* `google.protobuf.Any` 类型的 URL 增加了交易的大小，尽管影响可能可以忽略不计或者可以通过压缩来减轻。

### 中性的

## 参考资料


# ADR 020: Protocol Buffer Transaction Encoding

## Changelog

* 2020 March 06: Initial Draft
* 2020 March 12: API Updates
* 2020 April 13: Added details on interface `oneof` handling
* 2020 April 30: Switch to `Any`
* 2020 May 14: Describe public key encoding
* 2020 June 08: Store `TxBody` and `AuthInfo` as bytes in `SignDoc`; Document `TxRaw` as broadcast and storage type.
* 2020 August 07: Use ADR 027 for serializing `SignDoc`.
* 2020 August 19: Move sequence field from `SignDoc` to `SignerInfo`, as discussed in [#6966](https://github.com/cosmos/cosmos-sdk/issues/6966).
* 2020 September 25: Remove `PublicKey` type in favor of `secp256k1.PubKey`, `ed25519.PubKey` and `multisig.LegacyAminoPubKey`.
* 2020 October 15: Add `GetAccount` and `GetAccountWithHeight` methods to the `AccountRetriever` interface.
* 2021 Feb 24: The Cosmos SDK does not use Tendermint's `PubKey` interface anymore, but its own `cryptotypes.PubKey`. Updates to reflect this.
* 2021 May 3: Rename `clientCtx.JSONMarshaler` to `clientCtx.JSONCodec`.
* 2021 June 10: Add `clientCtx.Codec: codec.Codec`.

## Status

Accepted

## Context

This ADR is a continuation of the motivation, design, and context established in
[ADR 019](adr-019-protobuf-state-encoding.md), namely, we aim to design the
Protocol Buffer migration path for the client-side of the Cosmos SDK.

Specifically, the client-side migration path primarily includes tx generation and
signing, message construction and routing, in addition to CLI & REST handlers and
business logic (i.e. queriers).

With this in mind, we will tackle the migration path via two main areas, txs and
querying. However, this ADR solely focuses on transactions. Querying should be
addressed in a future ADR, but it should build off of these proposals.

Based on detailed discussions ([\#6030](https://github.com/cosmos/cosmos-sdk/issues/6030)
and [\#6078](https://github.com/cosmos/cosmos-sdk/issues/6078)), the original
design for transactions was changed substantially from an `oneof` /JSON-signing
approach to the approach described below.

## Decision

### Transactions

Since interface values are encoded with `google.protobuf.Any` in state (see [ADR 019](adr-019-protobuf-state-encoding.md)),
`sdk.Msg`s are encoding with `Any` in transactions.

One of the main goals of using `Any` to encode interface values is to have a
core set of types which is reused by apps so that
clients can safely be compatible with as many chains as possible.

It is one of the goals of this specification to provide a flexible cross-chain transaction
format that can serve a wide variety of use cases without breaking client
compatibility.

In order to facilitate signing, transactions are separated into `TxBody`,
which will be re-used by `SignDoc` below, and `signatures`:

```protobuf
// types/types.proto
package cosmos_sdk.v1;

message Tx {
    TxBody body = 1;
    AuthInfo auth_info = 2;
    // A list of signatures that matches the length and order of AuthInfo's signer_infos to
    // allow connecting signature meta information like public key and signing mode by position.
    repeated bytes signatures = 3;
}

// A variant of Tx that pins the signer's exact binary represenation of body and
// auth_info. This is used for signing, broadcasting and verification. The binary
// `serialize(tx: TxRaw)` is stored in Tendermint and the hash `sha256(serialize(tx: TxRaw))`
// becomes the "txhash", commonly used as the transaction ID.
message TxRaw {
    // A protobuf serialization of a TxBody that matches the representation in SignDoc.
    bytes body = 1;
    // A protobuf serialization of an AuthInfo that matches the representation in SignDoc.
    bytes auth_info = 2;
    // A list of signatures that matches the length and order of AuthInfo's signer_infos to
    // allow connecting signature meta information like public key and signing mode by position.
    repeated bytes signatures = 3;
}

message TxBody {
    // A list of messages to be executed. The required signers of those messages define
    // the number and order of elements in AuthInfo's signer_infos and Tx's signatures.
    // Each required signer address is added to the list only the first time it occurs.
    //
    // By convention, the first required signer (usually from the first message) is referred
    // to as the primary signer and pays the fee for the whole transaction.
    repeated google.protobuf.Any messages = 1;
    string memo = 2;
    int64 timeout_height = 3;
    repeated google.protobuf.Any extension_options = 1023;
}

message AuthInfo {
    // This list defines the signing modes for the required signers. The number
    // and order of elements must match the required signers from TxBody's messages.
    // The first element is the primary signer and the one which pays the fee.
    repeated SignerInfo signer_infos = 1;
    // The fee can be calculated based on the cost of evaluating the body and doing signature verification of the signers. This can be estimated via simulation.
    Fee fee = 2;
}

message SignerInfo {
    // The public key is optional for accounts that already exist in state. If unset, the
    // verifier can use the required signer address for this position and lookup the public key.
    google.protobuf.Any public_key = 1;
    // ModeInfo describes the signing mode of the signer and is a nested
    // structure to support nested multisig pubkey's
    ModeInfo mode_info = 2;
    // sequence is the sequence of the account, which describes the
    // number of committed transactions signed by a given address. It is used to prevent
    // replay attacks.
    uint64 sequence = 3;
}

message ModeInfo {
    oneof sum {
        Single single = 1;
        Multi multi = 2;
    }

    // Single is the mode info for a single signer. It is structured as a message
    // to allow for additional fields such as locale for SIGN_MODE_TEXTUAL in the future
    message Single {
        SignMode mode = 1;
    }

    // Multi is the mode info for a multisig public key
    message Multi {
        // bitarray specifies which keys within the multisig are signing
        CompactBitArray bitarray = 1;
        // mode_infos is the corresponding modes of the signers of the multisig
        // which could include nested multisig public keys
        repeated ModeInfo mode_infos = 2;
    }
}

enum SignMode {
    SIGN_MODE_UNSPECIFIED = 0;

    SIGN_MODE_DIRECT = 1;

    SIGN_MODE_TEXTUAL = 2;

    SIGN_MODE_LEGACY_AMINO_JSON = 127;
}
```

As will be discussed below, in order to include as much of the `Tx` as possible
in the `SignDoc`, `SignerInfo` is separated from signatures so that only the
raw signatures themselves live outside of what is signed over.

Because we are aiming for a flexible, extensible cross-chain transaction
format, new transaction processing options should be added to `TxBody` as soon
those use cases are discovered, even if they can't be implemented yet.

Because there is coordination overhead in this, `TxBody` includes an
`extension_options` field which can be used for any transaction processing
options that are not already covered. App developers should, nevertheless,
attempt to upstream important improvements to `Tx`.

### Signing

All of the signing modes below aim to provide the following guarantees:

* **No Malleability**: `TxBody` and `AuthInfo` cannot change once the transaction
  is signed
* **Predictable Gas**: if I am signing a transaction where I am paying a fee,
  the final gas is fully dependent on what I am signing

These guarantees give the maximum amount confidence to message signers that
manipulation of `Tx`s by intermediaries can't result in any meaningful changes.

#### `SIGN_MODE_DIRECT`

The "direct" signing behavior is to sign the raw `TxBody` bytes as broadcast over
the wire. This has the advantages of:

* requiring the minimum additional client capabilities beyond a standard protocol
  buffers implementation
* leaving effectively zero holes for transaction malleability (i.e. there are no
  subtle differences between the signing and encoding formats which could
  potentially be exploited by an attacker)

Signatures are structured using the `SignDoc` below which reuses the serialization of
`TxBody` and `AuthInfo` and only adds the fields which are needed for signatures:

```protobuf
// types/types.proto
message SignDoc {
    // A protobuf serialization of a TxBody that matches the representation in TxRaw.
    bytes body = 1;
    // A protobuf serialization of an AuthInfo that matches the representation in TxRaw.
    bytes auth_info = 2;
    string chain_id = 3;
    uint64 account_number = 4;
}
```

In order to sign in the default mode, clients take the following steps:

1. Serialize `TxBody` and `AuthInfo` using any valid protobuf implementation.
2. Create a `SignDoc` and serialize it using [ADR 027](adr-027-deterministic-protobuf-serialization.md).
3. Sign the encoded `SignDoc` bytes.
4. Build a `TxRaw` and serialize it for broadcasting.

Signature verification is based on comparing the raw `TxBody` and `AuthInfo`
bytes encoded in `TxRaw` not based on any ["canonicalization"](https://github.com/regen-network/canonical-proto3)
algorithm which creates added complexity for clients in addition to preventing
some forms of upgradeability (to be addressed later in this document).

Signature verifiers do:

1. Deserialize a `TxRaw` and pull out `body` and `auth_info`.
2. Create a list of required signer addresses from the messages.
3. For each required signer:
   * Pull account number and sequence from the state.
   * Obtain the public key either from state or `AuthInfo`'s `signer_infos`.
   * Create a `SignDoc` and serialize it using [ADR 027](adr-027-deterministic-protobuf-serialization.md).
   * Verify the signature at the same list position against the serialized `SignDoc`.

#### `SIGN_MODE_LEGACY_AMINO`

In order to support legacy wallets and exchanges, Amino JSON will be temporarily
supported transaction signing. Once wallets and exchanges have had a
chance to upgrade to protobuf based signing, this option will be disabled. In
the meantime, it is foreseen that disabling the current Amino signing would cause
too much breakage to be feasible. Note that this is mainly a requirement of the
Cosmos Hub and other chains may choose to disable Amino signing immediately.

Legacy clients will be able to sign a transaction using the current Amino
JSON format and have it encoded to protobuf using the REST `/tx/encode`
endpoint before broadcasting.

#### `SIGN_MODE_TEXTUAL`

As was discussed extensively in [\#6078](https://github.com/cosmos/cosmos-sdk/issues/6078),
there is a desire for a human-readable signing encoding, especially for hardware
wallets like the [Ledger](https://www.ledger.com) which display
transaction contents to users before signing. JSON was an attempt at this but
falls short of the ideal.

`SIGN_MODE_TEXTUAL` is intended as a placeholder for a human-readable
encoding which will replace Amino JSON. This new encoding should be even more
focused on readability than JSON, possibly based on formatting strings like
[MessageFormat](http://userguide.icu-project.org/formatparse/messages).

In order to ensure that the new human-readable format does not suffer from
transaction malleability issues, `SIGN_MODE_TEXTUAL`
requires that the _human-readable bytes are concatenated with the raw `SignDoc`_
to generate sign bytes.

Multiple human-readable formats (maybe even localized messages) may be supported
by `SIGN_MODE_TEXTUAL` when it is implemented.

### Unknown Field Filtering

Unknown fields in protobuf messages should generally be rejected by transaction
processors because:

* important data may be present in the unknown fields, that if ignored, will
  cause unexpected behavior for clients
* they present a malleability vulnerability where attackers can bloat tx size
  by adding random uninterpreted data to unsigned content (i.e. the master `Tx`,
  not `TxBody`)

There are also scenarios where we may choose to safely ignore unknown fields
(https://github.com/cosmos/cosmos-sdk/issues/6078#issuecomment-624400188) to
provide graceful forwards compatibility with newer clients.

We propose that field numbers with bit 11 set (for most use cases this is
the range of 1024-2047) be considered non-critical fields that can safely be
ignored if unknown.

To handle this we will need a unknown field filter that:

* always rejects unknown fields in unsigned content (i.e. top-level `Tx` and
  unsigned parts of `AuthInfo` if present based on the signing mode)
* rejects unknown fields in all messages (including nested `Any`s) other than
  fields with bit 11 set

This will likely need to be a custom protobuf parser pass that takes message bytes
and `FileDescriptor`s and returns a boolean result.

### Public Key Encoding

Public keys in the Cosmos SDK implement the `cryptotypes.PubKey` interface.
We propose to use `Any` for protobuf encoding as we are doing with other interfaces (for example, in `BaseAccount.PubKey` and `SignerInfo.PublicKey`).
The following public keys are implemented: secp256k1, secp256r1, ed25519 and legacy-multisignature.

Ex:

```protobuf
message PubKey {
    bytes key = 1;
}
```

`multisig.LegacyAminoPubKey` has an array of `Any`'s member to support any
protobuf public key type.

Apps should only attempt to handle a registered set of public keys that they
have tested. The provided signature verification ante handler decorators will
enforce this.

### CLI & REST

Currently, the REST and CLI handlers encode and decode types and txs via Amino
JSON encoding using a concrete Amino codec. Being that some of the types dealt with
in the client can be interfaces, similar to how we described in [ADR 019](adr-019-protobuf-state-encoding.md),
the client logic will now need to take a codec interface that knows not only how
to handle all the types, but also knows how to generate transactions, signatures,
and messages.

```go
type AccountRetriever interface {
  GetAccount(clientCtx Context, addr sdk.AccAddress) (client.Account, error)
  GetAccountWithHeight(clientCtx Context, addr sdk.AccAddress) (client.Account, int64, error)
  EnsureExists(clientCtx client.Context, addr sdk.AccAddress) error
  GetAccountNumberSequence(clientCtx client.Context, addr sdk.AccAddress) (uint64, uint64, error)
}

type Generator interface {
  NewTx() TxBuilder
  NewFee() ClientFee
  NewSignature() ClientSignature
  MarshalTx(tx types.Tx) ([]byte, error)
}

type TxBuilder interface {
  GetTx() sdk.Tx

  SetMsgs(...sdk.Msg) error
  GetSignatures() []sdk.Signature
  SetSignatures(...sdk.Signature)
  GetFee() sdk.Fee
  SetFee(sdk.Fee)
  GetMemo() string
  SetMemo(string)
}
```

We then update `Context` to have new fields: `Codec`, `TxGenerator`,
and `AccountRetriever`, and we update `AppModuleBasic.GetTxCmd` to take
a `Context` which should have all of these fields pre-populated.

Each client method should then use one of the `Init` methods to re-initialize
the pre-populated `Context`. `tx.GenerateOrBroadcastTx` can be used to
generate or broadcast a transaction. For example:

```go
import "github.com/spf13/cobra"
import "github.com/cosmos/cosmos-sdk/client"
import "github.com/cosmos/cosmos-sdk/client/tx"

func NewCmdDoSomething(clientCtx client.Context) *cobra.Command {
	return &cobra.Command{
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx := ctx.InitWithInput(cmd.InOrStdin())
			msg := NewSomeMsg{...}
			tx.GenerateOrBroadcastTx(clientCtx, msg)
		},
	}
}
```

## Future Improvements

### `SIGN_MODE_TEXTUAL` specification

A concrete specification and implementation of `SIGN_MODE_TEXTUAL` is intended
as a near-term future improvement so that the ledger app and other wallets
can gracefully transition away from Amino JSON.

### `SIGN_MODE_DIRECT_AUX`

(\*Documented as option (3) in https://github.com/cosmos/cosmos-sdk/issues/6078#issuecomment-628026933)

We could add a mode `SIGN_MODE_DIRECT_AUX`
to support scenarios where multiple signatures
are being gathered into a single transaction but the message composer does not
yet know which signatures will be included in the final transaction. For instance,
I may have a 3/5 multisig wallet and want to send a `TxBody` to all 5
signers to see who signs first. As soon as I have 3 signatures then I will go
ahead and build the full transaction.

With `SIGN_MODE_DIRECT`, each signer needs
to sign the full `AuthInfo` which includes the full list of all signers and
their signing modes, making the above scenario very hard.

`SIGN_MODE_DIRECT_AUX` would allow "auxiliary" signers to create their signature
using only `TxBody` and their own `PublicKey`. This allows the full list of
signers in `AuthInfo` to be delayed until signatures have been collected.

An "auxiliary" signer is any signer besides the primary signer who is paying
the fee. For the primary signer, the full `AuthInfo` is actually needed to calculate gas and fees
because that is dependent on how many signers and which key types and signing
modes they are using. Auxiliary signers, however, do not need to worry about
fees or gas and thus can just sign `TxBody`.

To generate a signature in `SIGN_MODE_DIRECT_AUX` these steps would be followed:

1. Encode `SignDocAux` (with the same requirement that fields must be serialized
   in order):

    ```protobuf
    // types/types.proto
    message SignDocAux {
        bytes body_bytes = 1;
        // PublicKey is included in SignDocAux :
        // 1. as a special case for multisig public keys. For multisig public keys,
        // the signer should use the top-level multisig public key they are signing
        // against, not their own public key. This is to prevent against a form
        // of malleability where a signature could be taken out of context of the
        // multisig key that was intended to be signed for
        // 2. to guard against scenario where configuration information is encoded
        // in public keys (it has been proposed) such that two keys can generate
        // the same signature but have different security properties
        //
        // By including it here, the composer of AuthInfo cannot reference the
        // a public key variant the signer did not intend to use
        PublicKey public_key = 2;
        string chain_id = 3;
        uint64 account_number = 4;
    }
    ```

2. Sign the encoded `SignDocAux` bytes
3. Send their signature and `SignerInfo` to primary signer who will then
   sign and broadcast the final transaction (with `SIGN_MODE_DIRECT` and `AuthInfo`
   added) once enough signatures have been collected

### `SIGN_MODE_DIRECT_RELAXED`

(_Documented as option (1)(a) in https://github.com/cosmos/cosmos-sdk/issues/6078#issuecomment-628026933_)

This is a variation of `SIGN_MODE_DIRECT` where multiple signers wouldn't need to
coordinate public keys and signing modes in advance. It would involve an alternate
`SignDoc` similar to `SignDocAux` above with fee. This could be added in the future
if client developers found the burden of collecting public keys and modes in advance
too burdensome.

## Consequences

### Positive

* Significant performance gains.
* Supports backward and forward type compatibility.
* Better support for cross-language clients.
* Multiple signing modes allow for greater protocol evolution

### Negative

* `google.protobuf.Any` type URLs increase transaction size although the effect
  may be negligible or compression may be able to mitigate it.

### Neutral

## References
