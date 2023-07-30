# ADR 050: SIGN_MODE_TEXTUAL

## 更新日志

* 2021年12月06日：初稿。
* 2022年02月07日：由Ledger团队阅读并概念确认。
* 2022年05月16日：将状态更改为已接受。
* 2022年08月11日：要求对交易原始字节进行签名。
* 2022年09月07日：添加自定义的`Msg`渲染器。
* 2022年09月18日：使用结构化格式代替文本行。
* 2022年11月23日：指定CBOR编码。
* 2022年12月01日：链接到单独的JSON文件中的示例。
* 2022年12月06日：重新排序信封屏幕。
* 2022年12月14日：提及反向操作的异常情况。
* 2023年01月23日：将Screen.Text更改为Title+Content。
* 2023年03月07日：将SignDoc从数组更改为包含数组的结构。
* 2023年03月20日：引入一个初始化为0的规范版本。

## 状态

已接受。实施已开始。仍需完善小值渲染器的细节。

规范版本：0。

## 摘要

本ADR指定了SIGN_MODE_TEXTUAL，一种新的基于字符串的签名模式，旨在用于与硬件设备进行签名。

## 背景

基于Protobuf的SIGN_MODE_DIRECT在[ADR-020](adr-020-protobuf-transaction-encoding.md)中引入，并打算在大多数情况下替代SIGN_MODE_LEGACY_AMINO_JSON，例如移动钱包和CLI密钥环。然而，[Ledger](https://www.ledger.com/)硬件钱包仍在使用SIGN_MODE_LEGACY_AMINO_JSON来显示签名字节给用户。硬件钱包无法转换为SIGN_MODE_DIRECT，原因如下：

* SIGN_MODE_DIRECT是基于二进制的，因此不适合显示给最终用户。从技术上讲，硬件钱包可以简单地将签名字节显示给用户。但这将被视为盲目签名，并且存在安全问题。
* 由于内存限制，硬件无法解码Protobuf签名字节，因为Protobuf定义需要嵌入在硬件设备上。

为了从SDK中移除Amino，需要为硬件设备创建一种新的签名模式。[初步讨论](https://github.com/cosmos/cosmos-sdk/issues/6513)提议采用基于文本的签名模式，本ADR正式指定了该模式。

在SIGN_MODE_TEXTUAL中，事务被渲染为文本表示形式，然后发送到安全设备或子系统供用户审查和签名。
与`SIGN_MODE_DIRECT`不同，传输的数据可以在处理和显示能力有限的设备上简单解码为可读文本。

文本表示形式是一系列_屏幕_。
每个屏幕都应该在小型设备（如Ledger）上完整显示（如果可能）。
一个屏幕大致相当于一行短文本。
大屏幕可以分成几个部分显示，就像长文本行被换行一样，
因此没有给出硬性指导，但40个字符是一个好的目标。
屏幕用于显示标量值的单个键/值对
（或具有紧凑表示法的复合值，如`Coins`）
或引入或结束较大的分组。

文本可以包含完整范围的Unicode代码点，包括控制字符和空字符。
设备负责决定如何显示无法本地渲染的字符。
有关指导，请参阅[附录2](adr-050-sign-mode-textual-annex2.md)。

屏幕具有非负的缩进级别，以表示复合或嵌套结构。
缩进级别为零是顶级。
缩进通过某种设备特定的机制显示。
消息引用符号是一个适当的模型，例如
前导的`>`字符或在更高级显示器上的竖线。

某些屏幕被标记为_专家_屏幕，
只有在查看者选择选择额外细节时才显示。
专家屏幕用于很少有用的信息，
或者仅需要出现以确保签名完整性（见下文）。

### 可逆渲染

我们要求事务的渲染是可逆的：
必须存在一个解析函数，对于每个事务，
当渲染为文本表示形式时，
解析该表示形式会产生一个与原始消息在proto等价性下等效的proto消息。

请注意，这个逆函数不需要对整个文本数据域执行正确的解析或错误信号。
仅仅是有效事务范围在渲染和解析的组合下是可逆的。

请注意，存在反函数确保渲染的文本包含原始交易的完整信息，而不是哈希或子集。

对于太大以至于无法有意义地显示的数据（例如长度超过32字节的字节字符串），我们对可逆性做出了例外。在这种情况下，我们可以选择使用具有加密强度的哈希值进行选择性渲染。在这些情况下，找到具有相同渲染的不同交易仍然是计算上不可行的。然而，我们必须确保哈希计算足够简单，以便在没有原始字节字符串时可靠地执行，至少哈希本身是合理可验证的。

### 链状态

渲染函数（和解析函数）可能依赖于当前的链状态。这对于读取参数（如币种显示元数据）或读取用户特定的偏好设置（如语言或地址别名）非常有用。请注意，如果观察到的状态在签名生成和交易包含在区块中之间发生变化，交付时间的渲染可能会有所不同。如果是这样，签名将无效，交易将被拒绝。

### 签名和安全性

为了安全起见，交易签名应具备三个属性：

1. 给定交易、签名和链状态，必须能够验证签名与交易匹配，以验证签署者必须已知其各自的私钥。

2. 在相同的链状态下，对于给定的签名有效的相差很大的交易是计算上不可行的。

3. 用户应能够通过具有有限显示功能的简单、安全设备对签名数据给予知情同意。

`SIGN_MODE_TEXTUAL` 的正确性和安全性通过展示从渲染到交易协议的反函数来保证。这意味着不可能将不同的协议缓冲区消息渲染为相同的文本。

### 交易哈希的可塑性

当客户端软件形成一个交易时，"原始" 交易（`TxRaw`）被序列化为一个 proto，并计算出结果字节序列的哈希值。这就是 `TxHash`，并且被各种服务用于跟踪提交的交易的生命周期。如果能够生成一个修改后的交易，其哈希值不同但签名仍然通过，那么就可能发生各种不良行为。

SIGN_MODE_TEXTUAL通过将TxHash作为专家屏幕的一部分包含在渲染中，防止了此交易的篡改。

### SignDoc

`SIGN_MODE_TEXTUAL`的SignDoc由以下数据结构组成：

```go
type Screen struct {
  Title string   // possibly size limited to, advised to 64 characters
  Content string // possibly size limited to, advised to 255 characters
  Indent uint8   // size limited to something small like 16 or 32
  Expert bool
}

type SignDocTextual struct {
  Screens []Screen
}
```

我们不打算使用protobuf序列化来形成将被传输和签名的字节序列，以保持解码器的简单性。我们将使用[CBOR](https://cbor.io)（[RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html)）代替。编码由以下CDDL（[RFC 8610](https://www.rfc-editor.org/rfc/rfc8610)）定义：

```
;;; CDDL (RFC 8610) Specification of SignDoc for SIGN_MODE_TEXTUAL.
;;; Must be encoded using CBOR deterministic encoding (RFC 8949, section 4.2.1).

;; A Textual document is a struct containing one field: an array of screens.
sign_doc = {
  screens_key: [* screen],
}

;; The key is an integer to keep the encoding small.
screens_key = 1

;; A screen consists of a text string, an indentation, and the expert flag,
;; represented as an integer-keyed map. All entries are optional
;; and MUST be omitted from the encoding if empty, zero, or false.
;; Text defaults to the empty string, indent defaults to zero,
;; and expert defaults to false.
screen = {
  ? title_key: tstr,
  ? content_key: tstr,
  ? indent_key: uint,
  ? expert_key: bool,
}

;; Keys are small integers to keep the encoding small.
title_key = 1
content_key = 2
indent_key = 3
expert_key = 4
```

将sign_doc直接定义为屏幕数组也已经被考虑过。然而，考虑到此规范的未来迭代可能性，选择了使用单键结构而不是前一提案，因为结构体更容易实现向后兼容。

## 详细信息

在接下来的示例中，屏幕将显示为文本行，缩进以'>'开头表示，专家屏幕以`*`开头标记。

### 交易信封的编码

我们将“交易信封”定义为交易中不在`TxBody.Messages`字段中的所有数据。交易信封包括费用、签名者信息和备注，但不包括`Msg`。`//`表示注释，不会显示在Ledger设备上。

```
Chain ID: <string>
Account number: <uint64>
Sequence: <uint64>
Address: <string>
*Public Key: <Any>
This transaction has <int> Message(s)                       // Pluralize "Message" only when int>1
> Message (<int>/<int>): <Any>                              // See value renderers for Any rendering.
End of Message
Memo: <string>                                              // Skipped if no memo set.
Fee: <coins>                                                // See value renderers for coins rendering.
*Fee payer: <string>                                        // Skipped if no fee_payer set.
*Fee granter: <string>                                      // Skipped if no fee_granter set.
Tip: <coins>                                                // Skippted if no tip.
Tipper: <string>
*Gas Limit: <uint64>
*Timeout Height: <uint64>                                   // Skipped if no timeout_height set.
*Other signer: <int> SignerInfo                             // Skipped if the transaction only has 1 signer.
*> Other signer (<int>/<int>): <SignerInfo>
*End of other signers
*Extension options: <int> Any:                              // Skipped if no body extension options
*> Extension options (<int>/<int>): <Any>
*End of extension options
*Non critical extension options: <int> Any:                 // Skipped if no body non critical extension options
*> Non critical extension options (<int>/<int>): <Any>
*End of Non critical extension options
*Hash of raw bytes: <hex_string>                            // Hex encoding of bytes defined, to prevent tx hash malleability.
```

### 交易体的编码

交易体是`Tx.TxBody.Messages`字段，它是一个`Any`数组，其中每个`Any`打包了一个`sdk.Msg`。由于`sdk.Msg`被广泛使用，它们的编码与附录1中描述的通常的`Any`数组（Protobuf：`repeated google.protobuf.Any`）略有不同。

```
This transaction has <int> message:   // Optional 's' for "message" if there's is >1 sdk.Msgs.
// For each Msg, print the following 2 lines:
Msg (<int>/<int>): <string>           // E.g. Msg (1/2): bank v1beta1 send coins
<value rendering of Msg struct>
End of transaction messages
```

#### 示例

给定以下Protobuf消息：

```protobuf
message Grant {
  google.protobuf.Any       authorization = 1 [(cosmos_proto.accepts_interface) = "cosmos.authz.v1beta1.Authorization"];
  google.protobuf.Timestamp expiration    = 2 [(gogoproto.stdtime) = true, (gogoproto.nullable) = false];
}

message MsgGrant {
  option (cosmos.msg.v1.signer) = "granter";

  string granter = 1 [(cosmos_proto.scalar) = "cosmos.AddressString"];
  string grantee = 2 [(cosmos_proto.scalar) = "cosmos.AddressString"];
}
```

以及包含1个此类`sdk.Msg`的交易，我们得到以下编码：

```
This transaction has 1 message:
Msg (1/1): authz v1beta1 grant
Granter: cosmos1abc...def
Grantee: cosmos1ghi...jkl
End of transaction messages
```

### 自定义`Msg`渲染器

应用程序开发人员可以选择不遵循默认渲染器对其自己的`Msg`的值输出。在这种情况下，他们可以实现自己的自定义`Msg`渲染器。这类似于[EIP4430](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-4430.md)，在该规范中，智能合约开发人员选择要显示给最终用户的描述字符串。

这可以通过将`cosmos.msg.textual.v1.expert_custom_renderer` Protobuf选项设置为非空字符串来完成。此选项只能在表示事务消息对象（实现`sdk.Msg`接口）的Protobuf消息上设置。

```protobuf
message MsgFooBar {
  // Optional comments to describe in human-readable language the formatting
  // rules of the custom renderer.
  option (cosmos.msg.textual.v1.expert_custom_renderer) = "<unique algorithm identifier>";

  // proto fields
}
```

当在`Msg`上设置此选项时，注册的函数将把`Msg`转换为一个或多个字符串的数组，这些字符串可以使用键/值格式（在第3点中描述）与专家字段前缀（在第5点中描述）和任意缩进（第6点）进行渲染。这些字符串可以使用默认值渲染器从`Msg`字段中渲染，也可以使用自定义逻辑从多个字段生成。

`<unique algorithm identifier>`是应用程序开发人员选择的字符串约定，用于标识自定义的`Msg`渲染器。例如，此自定义算法的文档或规范可以引用此标识符。此标识符可以具有带版本的后缀（例如`_v1`），以适应未来的更改（这将破坏共识）。我们还建议添加Protobuf注释，以用人类语言描述所使用的自定义逻辑。

此外，渲染器必须提供两个函数：一个用于从Protobuf格式化为字符串，另一个用于从字符串解析为Protobuf。这两个函数由应用程序开发人员提供。为了满足第1点，解析函数必须是格式化函数的反函数。SDK不会在运行时检查此属性。但是，我们强烈建议应用程序开发人员在其应用程序存储库中包含全面的测试套件，以测试可逆性，以避免引入安全漏洞。

### 要求对`TxBody`和`AuthInfo`原始字节进行签名

回想一下，在链上merklelized的事务字节是[TxRaw](hhttps://buf.build/cosmos/cosmos-sdk/docs/main:cosmos.tx.v1beta1#cosmos.tx.v1beta1.TxRaw)的Protobuf二进制序列化，其中包含`body_bytes`和`auth_info_bytes`。此外，事务哈希被定义为`TxRaw`字节的SHA256哈希。我们要求用户在SIGN_MODE_TEXTUAL下对这些字节进行签名，更具体地说，对以下字符串进行签名：

```
*原始字节的哈希值：<HEX(sha256(len(body_bytes) ++ body_bytes ++ len(auth_info_bytes) ++ auth_info_bytes))>

其中：

* `++` 表示连接操作，
* `HEX` 是字节的十六进制表示，全部大写，没有 `0x` 前缀，
* `len()` 以大端字节序编码为 uint64。

这是为了防止交易哈希的可塑性。关于可逆性的第一点确保了交易的 `body` 和 `auth_info` 值不可塑性，但仅仅使用第一点可能导致交易哈希仍然可塑性，因为 `body_bytes` 和 `auth_info_bytes` 中的 SIGN_MODE_TEXTUAL 字符串不遵循 `body_bytes` 和 `auth_info_bytes` 中定义的字节顺序。如果没有这个哈希值，恶意验证人或交易所可以在用户使用 SIGN_MODE_TEXTUAL 签名后拦截交易，修改其交易哈希（通过调整 `body_bytes` 或 `auth_info_bytes` 中的字节顺序），然后提交给 Tendermint。

通过在 SIGN_MODE_TEXTUAL 签名负载中包含此哈希值，我们保持了与 [SIGN_MODE_DIRECT](adr-020-protobuf-transaction-encoding.md) 相同的保证级别。

这些字节仅在专家模式下显示，因此前面有 `*`。

## 对当前规范的更新

当前规范并非一成不变，未来可能会有多次迭代。我们将此规范的更新分为两类：

1. 需要更改硬件设备嵌入式应用程序的更新。
2. 仅修改信封和值渲染器的更新。

第一类更新包括更改 `Screen` 结构或其对应的 CBOR 编码。这类更新需要修改硬件签名应用程序，以便能够解码和解析新类型。还必须保证向后兼容性，以使新的硬件应用程序与现有版本的 SDK 兼容。这些更新需要多方协调：SDK 开发人员、硬件应用程序开发人员（目前为 Zondax）和客户端开发人员（例如 CosmJS）。此外，可能需要重新提交硬件设备应用程序，这根据供应商的不同可能需要一些时间。因此，我们建议尽量避免此类更新。
```

第二类更新包括对任何值渲染器或事务信封的更改。例如，可以交换信封中的字段顺序，或修改时间戳格式。由于 SIGN_MODE_TEXTUAL 将 `Screen` 发送到硬件设备，这种类型的更改不需要硬件钱包应用程序更新。但是，它们会破坏状态机，并且必须进行相应的文档记录。它们需要 SDK 开发人员与客户端开发人员（例如 CosmJS）的协调，以便更新在时间上尽可能接近同时发布。

我们定义了一个规范版本，它是一个整数，必须在每个类别的更新中递增。该规范版本将由 SDK 的实现公开，并可以与客户端进行通信。例如，SDK v0.48 可能使用规范版本 1，而 SDK v0.49 可能使用 2；通过这种版本控制，客户端可以根据目标 SDK 版本来构建 SIGN_MODE_TEXTUAL 事务。

当前的规范版本在本文档顶部的 "状态" 部分中定义。它初始化为 `0`，以允许在选择如何定义未来版本时具有灵活性，因为它可以以向后兼容的方式向 SignDoc Go 结构或 Protobuf 中添加字段。

## 硬件设备的附加格式

请参阅[附录 2](adr-050-sign-mode-textual-annex2.md)。

## 示例

1. 最简 MsgSend：[查看交易](https://github.com/cosmos/cosmos-sdk/blob/094abcd393379acbbd043996024d66cd65246fb1/tx/textual/internal/testdata/e2e.json#L2-L70)。
2. 包含各种元素的交易：[查看交易](https://github.com/cosmos/cosmos-sdk/blob/094abcd393379acbbd043996024d66cd65246fb1/tx/textual/internal/testdata/e2e.json#L71-L270)。

以下示例存储在一个 JSON 文件中，包含以下字段：
- `proto`：事务在 ProtoJSON 中的表示形式，
- `screens`：将事务渲染为 SIGN_MODE_TEXTUAL 屏幕，
- `cbor`：事务的签名字节，即屏幕的 CBOR 编码。

## 后果

### 向后兼容性

SIGN_MODE_TEXTUAL 是纯粹的增加功能，不会破坏与其他签名模式的向后兼容性。

### 积极的

* 以硬件设备友好的方式进行签名。
* 一旦 SIGN_MODE_TEXTUAL 被发布，SIGN_MODE_LEGACY_AMINO_JSON 可以被弃用和移除。从长远来看，一旦生态系统完全迁移，Amino 可以完全移除。

### 消极的

* 一些字段仍然以非人类可读的方式进行编码，比如十六进制的公钥。
* 需要发布新的账本应用程序，目前还不清楚。

### 中立的

* 如果交易复杂，字符串数组可以任意长，一些用户可能会跳过一些屏幕并盲目签名。

## 进一步讨论

* 需要完善一些关于值渲染器的细节，请参见[附录1](adr-050-sign-mode-textual-annex1.md)。
* 账本应用程序是否能够同时支持 SIGN_MODE_LEGACY_AMINO_JSON 和 SIGN_MODE_TEXTUAL？
* 开放问题：我们是否应该添加一个 Protobuf 字段选项，允许应用程序开发人员覆盖某些 Protobuf 字段和消息的文本表示形式？这类似于以太坊的[EIP4430](https://github.com/ethereum/EIPs/pull/4430)，其中合约开发人员决定文本表示形式。
* 国际化。

## 参考资料

* [附录1](adr-050-sign-mode-textual-annex1.md)

* 初始讨论：https://github.com/cosmos/cosmos-sdk/issues/6513
* 工作组使用的实时文档：https://hackmd.io/fsZAO-TfT0CKmLDtfMcKeA?both
* 工作组会议记录：https://hackmd.io/7RkGfv_rQAaZzEigUYhcXw
* 以太坊的“描述交易”：https://github.com/ethereum/EIPs/pull/4430


# ADR 050: SIGN_MODE_TEXTUAL

## Changelog

* Dec 06, 2021: Initial Draft.
* Feb 07, 2022: Draft read and concept-ACKed by the Ledger team.
* May 16, 2022: Change status to Accepted.
* Aug 11, 2022: Require signing over tx raw bytes.
* Sep 07, 2022: Add custom `Msg`-renderers.
* Sep 18, 2022: Structured format instead of lines of text
* Nov 23, 2022: Specify CBOR encoding.
* Dec 01, 2022: Link to examples in separate JSON file.
* Dec 06, 2022: Re-ordering of envelope screens.
* Dec 14, 2022: Mention exceptions for invertability.
* Jan 23, 2023: Switch Screen.Text to Title+Content.
* Mar 07, 2023: Change SignDoc from array to struct containing array.
* Mar 20, 2023: Introduce a spec version initialized to 0.

## Status

Accepted. Implementation started. Small value renderers details still need to be polished.

Spec version: 0.

## Abstract

This ADR specifies SIGN_MODE_TEXTUAL, a new string-based sign mode that is targetted at signing with hardware devices.

## Context

Protobuf-based SIGN_MODE_DIRECT was introduced in [ADR-020](adr-020-protobuf-transaction-encoding.md) and is intended to replace SIGN_MODE_LEGACY_AMINO_JSON in most situations, such as mobile wallets and CLI keyrings. However, the [Ledger](https://www.ledger.com/) hardware wallet is still using SIGN_MODE_LEGACY_AMINO_JSON for displaying the sign bytes to the user. Hardware wallets cannot transition to SIGN_MODE_DIRECT as:

* SIGN_MODE_DIRECT is binary-based and thus not suitable for display to end-users. Technically, hardware wallets could simply display the sign bytes to the user. But this would be considered as blind signing, and is a security concern.
* hardware cannot decode the protobuf sign bytes due to memory constraints, as the Protobuf definitions would need to be embedded on the hardware device.

In an effort to remove Amino from the SDK, a new sign mode needs to be created for hardware devices. [Initial discussions](https://github.com/cosmos/cosmos-sdk/issues/6513) propose a text-based sign mode, which this ADR formally specifies.

## Decision

In SIGN_MODE_TEXTUAL, a transaction is rendered into a textual representation,
which is then sent to a secure device or subsystem for the user to review and sign.
Unlike `SIGN_MODE_DIRECT`, the transmitted data can be simply decoded into legible text
even on devices with limited processing and display.

The textual representation is a sequence of _screens_.
Each screen is meant to be displayed in its entirety (if possible) even on a small device like a Ledger.
A screen is roughly equivalent to a short line of text.
Large screens can be displayed in several pieces,
much as long lines of text are wrapped,
so no hard guidance is given, though 40 characters is a good target.
A screen is used to display a single key/value pair for scalar values
(or composite values with a compact notation, such as `Coins`)
or to introduce or conclude a larger grouping.

The text can contain the full range of Unicode code points, including control characters and nul.
The device is responsible for deciding how to display characters it cannot render natively.
See [annex 2](adr-050-sign-mode-textual-annex2.md) for guidance.

Screens have a non-negative indentation level to signal composite or nested structures.
Indentation level zero is the top level.
Indentation is displayed via some device-specific mechanism.
Message quotation notation is an appropriate model, such as
leading `>` characters or vertical bars on more capable displays.

Some screens are marked as _expert_ screens,
meant to be displayed only if the viewer chooses to opt in for the extra detail.
Expert screens are meant for information that is rarely useful,
or needs to be present only for signature integrity (see below).

### Invertible Rendering

We require that the rendering of the transaction be invertible:
there must be a parsing function such that for every transaction,
when rendered to the textual representation,
parsing that representation yeilds a proto message equivalent
to the original under proto equality.

Note that this inverse function does not need to perform correct
parsing or error signaling for the whole domain of textual data.
Merely that the range of valid transactions be invertible under
the composition of rendering and parsing.

Note that the existence of an inverse function ensures that the
rendered text contains the full information of the original transaction,
not a hash or subset.

We make an exception for invertibility for data which are too large to
meaningfully display, such as byte strings longer than 32 bytes. We may then
selectively render them with a cryptographically-strong hash. In these cases,
it is still computationally infeasible to find a different transaction which
has the same rendering. However, we must ensure that the hash computation is
simple enough to be reliably executed independently, so at least the hash is
itself reasonably verifiable when the raw byte string is not.

### Chain State

The rendering function (and parsing function) may depend on the current chain state.
This is useful for reading parameters, such as coin display metadata,
or for reading user-specific preferences such as language or address aliases.
Note that if the observed state changes between signature generation
and the transaction's inclusion in a block, the delivery-time rendering
might differ. If so, the signature will be invalid and the transaction
will be rejected.

### Signature and Security

For security, transaction signatures should have three properties:

1. Given the transaction, signatures, and chain state, it must be possible to validate that the signatures matches the transaction,
to verify that the signers must have known their respective secret keys.

2. It must be computationally infeasible to find a substantially different transaction for which the given signatures are valid, given the same chain state.

3. The user should be able to give informed consent to the signed data via a simple, secure device with limited display capabilities.

The correctness and security of `SIGN_MODE_TEXTUAL` is guaranteed by demonstrating an inverse function from the rendering to transaction protos.
This means that it is impossible for a different protocol buffer message to render to the same text.

### Transaction Hash Malleability

When client software forms a transaction, the "raw" transaction (`TxRaw`) is serialized as a proto
and a hash of the resulting byte sequence is computed.
This is the `TxHash`, and is used by various services to track the submitted transaction through its lifecycle.
Various misbehavior is possible if one can generate a modified transaction with a different TxHash
but for which the signature still checks out.

SIGN_MODE_TEXTUAL prevents this transaction malleability by including the TxHash as an expert screen
in the rendering.

### SignDoc

The SignDoc for `SIGN_MODE_TEXTUAL` is formed from a data structure like:

```go
type Screen struct {
  Title string   // possibly size limited to, advised to 64 characters
  Content string // possibly size limited to, advised to 255 characters
  Indent uint8   // size limited to something small like 16 or 32
  Expert bool
}

type SignDocTextual struct {
  Screens []Screen
}
```

We do not plan to use protobuf serialization to form the sequence of bytes
that will be tranmitted and signed, in order to keep the decoder simple.
We will use [CBOR](https://cbor.io) ([RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html)) instead.
The encoding is defined by the following CDDL ([RFC 8610](https://www.rfc-editor.org/rfc/rfc8610)):

```
;;; CDDL (RFC 8610) Specification of SignDoc for SIGN_MODE_TEXTUAL.
;;; Must be encoded using CBOR deterministic encoding (RFC 8949, section 4.2.1).

;; A Textual document is a struct containing one field: an array of screens.
sign_doc = {
  screens_key: [* screen],
}

;; The key is an integer to keep the encoding small.
screens_key = 1

;; A screen consists of a text string, an indentation, and the expert flag,
;; represented as an integer-keyed map. All entries are optional
;; and MUST be omitted from the encoding if empty, zero, or false.
;; Text defaults to the empty string, indent defaults to zero,
;; and expert defaults to false.
screen = {
  ? title_key: tstr,
  ? content_key: tstr,
  ? indent_key: uint,
  ? expert_key: bool,
}

;; Keys are small integers to keep the encoding small.
title_key = 1
content_key = 2
indent_key = 3
expert_key = 4
```

Defining the sign_doc as directly an array of screens has also been considered. However, given the possibility of future iterations of this specification, using a single-keyed struct has been chosen over the former proposal, as structs allow for easier backwards-compatibility.

## Details

In the examples that follow, screens will be shown as lines of text,
indentation is indicated with a leading '>',
and expert screens are marked with a leading `*`.

### Encoding of the Transaction Envelope

We define "transaction envelope" as all data in a transaction that is not in the `TxBody.Messages` field. Transaction envelope includes fee, signer infos and memo, but don't include `Msg`s. `//` denotes comments and are not shown on the Ledger device.

```
Chain ID: <string>
Account number: <uint64>
Sequence: <uint64>
Address: <string>
*Public Key: <Any>
This transaction has <int> Message(s)                       // Pluralize "Message" only when int>1
> Message (<int>/<int>): <Any>                              // See value renderers for Any rendering.
End of Message
Memo: <string>                                              // Skipped if no memo set.
Fee: <coins>                                                // See value renderers for coins rendering.
*Fee payer: <string>                                        // Skipped if no fee_payer set.
*Fee granter: <string>                                      // Skipped if no fee_granter set.
Tip: <coins>                                                // Skippted if no tip.
Tipper: <string>
*Gas Limit: <uint64>
*Timeout Height: <uint64>                                   // Skipped if no timeout_height set.
*Other signer: <int> SignerInfo                             // Skipped if the transaction only has 1 signer.
*> Other signer (<int>/<int>): <SignerInfo>
*End of other signers
*Extension options: <int> Any:                              // Skipped if no body extension options
*> Extension options (<int>/<int>): <Any>
*End of extension options
*Non critical extension options: <int> Any:                 // Skipped if no body non critical extension options
*> Non critical extension options (<int>/<int>): <Any>
*End of Non critical extension options
*Hash of raw bytes: <hex_string>                            // Hex encoding of bytes defined, to prevent tx hash malleability.
```

### Encoding of the Transaction Body

Transaction Body is the `Tx.TxBody.Messages` field, which is an array of `Any`s, where each `Any` packs a `sdk.Msg`. Since `sdk.Msg`s are widely used, they have a slightly different encoding than usual array of `Any`s (Protobuf: `repeated google.protobuf.Any`) described in Annex 1.

```
This transaction has <int> message:   // Optional 's' for "message" if there's is >1 sdk.Msgs.
// For each Msg, print the following 2 lines:
Msg (<int>/<int>): <string>           // E.g. Msg (1/2): bank v1beta1 send coins
<value rendering of Msg struct>
End of transaction messages
```

#### Example

Given the following Protobuf message:

```protobuf
message Grant {
  google.protobuf.Any       authorization = 1 [(cosmos_proto.accepts_interface) = "cosmos.authz.v1beta1.Authorization"];
  google.protobuf.Timestamp expiration    = 2 [(gogoproto.stdtime) = true, (gogoproto.nullable) = false];
}

message MsgGrant {
  option (cosmos.msg.v1.signer) = "granter";

  string granter = 1 [(cosmos_proto.scalar) = "cosmos.AddressString"];
  string grantee = 2 [(cosmos_proto.scalar) = "cosmos.AddressString"];
}
```

and a transaction containing 1 such `sdk.Msg`, we get the following encoding:

```
This transaction has 1 message:
Msg (1/1): authz v1beta1 grant
Granter: cosmos1abc...def
Grantee: cosmos1ghi...jkl
End of transaction messages
```

### Custom `Msg` Renderers

Application developers may choose to not follow default renderer value output for their own `Msg`s. In this case, they can implement their own custom `Msg` renderer. This is similar to [EIP4430](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-4430.md), where the smart contract developer chooses the description string to be shown to the end user.

This is done by setting the `cosmos.msg.textual.v1.expert_custom_renderer` Protobuf option to a non-empty string. This option CAN ONLY be set on a Protobuf message representing transaction message object (implementing `sdk.Msg` interface).

```protobuf
message MsgFooBar {
  // Optional comments to describe in human-readable language the formatting
  // rules of the custom renderer.
  option (cosmos.msg.textual.v1.expert_custom_renderer) = "<unique algorithm identifier>";

  // proto fields
}
```

When this option is set on a `Msg`, a registered function will transform the `Msg` into an array of one or more strings, which MAY use the key/value format (described in point #3) with the expert field prefix (described in point #5) and arbitrary indentation (point #6). These strings MAY be rendered from a `Msg` field using a default value renderer, or they may be generated from several fields using custom logic.

The `<unique algorithm identifier>` is a string convention chosen by the application developer and is used to identify the custom `Msg` renderer. For example, the documentation or specification of this custom algorithm can reference this identifier. This identifier CAN have a versioned suffix (e.g. `_v1`) to adapt for future changes (which would be consensus-breaking). We also recommend adding Protobuf comments to describe in human language the custom logic used.

Moreover, the renderer must provide 2 functions: one for formatting from Protobuf to string, and one for parsing string to Protobuf. These 2 functions are provided by the application developer. To satisfy point #1, the parse function MUST be the inverse of the formatting function. This property will not be checked by the SDK at runtime. However, we strongly recommend the application developer to include a comprehensive suite in their app repo to test invertibility, as to not introduce security bugs.

### Require signing over the `TxBody` and `AuthInfo` raw bytes

Recall that the transaction bytes merklelized on chain are the Protobuf binary serialization of [TxRaw](hhttps://buf.build/cosmos/cosmos-sdk/docs/main:cosmos.tx.v1beta1#cosmos.tx.v1beta1.TxRaw), which contains the `body_bytes` and `auth_info_bytes`. Moreover, the transaction hash is defined as the SHA256 hash of the `TxRaw` bytes. We require that the user signs over these bytes in SIGN_MODE_TEXTUAL, more specifically over the following string:

```
*Hash of raw bytes: <HEX(sha256(len(body_bytes) ++ body_bytes ++ len(auth_info_bytes) ++ auth_info_bytes))>
```

where:

* `++` denotes concatenation,
* `HEX` is the hexadecimal representation of the bytes, all in capital letters, no `0x` prefix,
* and `len()` is encoded as a Big-Endian uint64.

This is to prevent transaction hash malleability. The point #1 about invertiblity assures that transaction `body` and `auth_info` values are not malleable, but the transaction hash still might be malleable with point #1 only, because the SIGN_MODE_TEXTUAL strings don't follow the byte ordering defined in `body_bytes` and `auth_info_bytes`. Without this hash, a malicious validator or exchange could intercept a transaction, modify its transaction hash _after_ the user signed it using SIGN_MODE_TEXTUAL (by tweaking the byte ordering inside `body_bytes` or `auth_info_bytes`), and then submit it to Tendermint.

By including this hash in the SIGN_MODE_TEXTUAL signing payload, we keep the same level of guarantees as [SIGN_MODE_DIRECT](adr-020-protobuf-transaction-encoding.md).

These bytes are only shown in expert mode, hence the leading `*`.

## Updates to the current specification

The current specification is not set in stone, and future iterations are to be expected. We distinguish two categories of updates to this specification:

1. Updates that require changes of the hardware device embedded application.
2. Updates that only modify the envelope and the value renderers.

Updates in the 1st category include changes of the `Screen` struct or its corresponding CBOR encoding. This type of updates require a modification of the hardware signer application, to be able to decode and parse the new types. Backwards-compatibility must also be guaranteed, so that the new hardware application works with existing versions of the SDK. These updates require the coordination of multiple parties: SDK developers, hardware application developers (currently: Zondax), and client-side developers (e.g. CosmJS). Furthermore, a new submission of the hardware device application may be necessary, which, dependending on the vendor, can take some time. As such, we recommend to avoid this type of updates as much as possible.

Updates in the 2nd category include changes to any of the value renderers or to the transaction envelope. For example, the ordering of fields in the envelope can be swapped, or the timestamp formatting can be modified. Since SIGN_MODE_TEXTUAL sends `Screen`s to the hardware device, this type of change do not need a hardware wallet application update. They are however state-machine-breaking, and must be documented as such. They require the coordination of SDK developers with client-side developers (e.g. CosmJS), so that the updates are released on both sides close to each other in time.

We define a spec version, which is an integer that must be incremented on each update of either category. This spec version will be exposed by the SDK's implementation, and can be communicated to clients. For example, SDK v0.48 might use the spec version 1, and SDK v0.49 might use 2; thanks to this versioning, clients can know how to craft SIGN_MODE_TEXTUAL transactions based on the target SDK version.

The current spec version is defined in the "Status" section, on the top of this document. It is initialized to `0` to allow flexibility in choosing how to define future versions, as it would allow adding a field either in the SignDoc Go struct or in Protobuf in a backwards-compatible way.

## Additional Formatting by the Hardware Device

See [annex 2](adr-050-sign-mode-textual-annex2.md).

## Examples

1. A minimal MsgSend: [see transaction](https://github.com/cosmos/cosmos-sdk/blob/094abcd393379acbbd043996024d66cd65246fb1/tx/textual/internal/testdata/e2e.json#L2-L70).
2. A transaction with a bit of everything: [see transaction](https://github.com/cosmos/cosmos-sdk/blob/094abcd393379acbbd043996024d66cd65246fb1/tx/textual/internal/testdata/e2e.json#L71-L270).

The examples below are stored in a JSON file with the following fields:
- `proto`: the representation of the transaction in ProtoJSON,
- `screens`: the transaction rendered into SIGN_MODE_TEXTUAL screens,
- `cbor`: the sign bytes of the transaction, which is the CBOR encoding of the screens.

## Consequences

### Backwards Compatibility

SIGN_MODE_TEXTUAL is purely additive, and doesn't break any backwards compatibility with other sign modes.

### Positive

* Human-friendly way of signing in hardware devices.
* Once SIGN_MODE_TEXTUAL is shipped, SIGN_MODE_LEGACY_AMINO_JSON can be deprecated and removed. On the longer term, once the ecosystem has totally migrated, Amino can be totally removed.

### Negative

* Some fields are still encoded in non-human-readable ways, such as public keys in hexadecimal.
* New ledger app needs to be released, still unclear

### Neutral

* If the transaction is complex, the string array can be arbitrarily long, and some users might just skip some screens and blind sign.

## Further Discussions

* Some details on value renderers need to be polished, see [Annex 1](adr-050-sign-mode-textual-annex1.md).
* Are ledger apps able to support both SIGN_MODE_LEGACY_AMINO_JSON and SIGN_MODE_TEXTUAL at the same time?
* Open question: should we add a Protobuf field option to allow app developers to overwrite the textual representation of certain Protobuf fields and message? This would be similar to Ethereum's [EIP4430](https://github.com/ethereum/EIPs/pull/4430), where the contract developer decides on the textual representation.
* Internationalization.

## References

* [Annex 1](adr-050-sign-mode-textual-annex1.md)

* Initial discussion: https://github.com/cosmos/cosmos-sdk/issues/6513
* Living document used in the working group: https://hackmd.io/fsZAO-TfT0CKmLDtfMcKeA?both
* Working group meeting notes: https://hackmd.io/7RkGfv_rQAaZzEigUYhcXw
* Ethereum's "Described Transactions" https://github.com/ethereum/EIPs/pull/4430
