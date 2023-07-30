# ADR 036: 任意消息签名规范

## 更新日志

* 2020年10月28日 - 初始草案

## 作者

* Antoine Herzog (@antoineherzog)
* Zaki Manian (@zmanian)
* Aleksandr Bezobchuk (alexanderbez) [1]
* Frojdi Dymylja (@fdymylja)

## 状态

草案

## 摘要

目前，在 Cosmos SDK 中，没有像以太坊那样的约定来签名任意消息。我们提议使用此规范，为 Cosmos SDK 生态系统提供一种签名和验证链下任意消息的方法。

该规范的目的是涵盖每种使用情况，这意味着 cosmos-sdk 应用程序开发人员可以决定如何将 `Data` 序列化和表示给用户。

## 背景

在链下签名消息的能力已被证明是几乎任何区块链的基本方面。链下签名消息的概念有许多附加好处，例如节省计算成本、减少交易吞吐量和开销。在 Cosmos 的上下文中，签名此类数据的主要应用包括但不限于提供一种加密安全且可验证的方式来证明验证者身份，并可能将其与其他框架或组织关联起来。此外，还可以使用 Ledger 或类似的 HSM 设备对 Cosmos 消息进行签名。

更多背景和用例可以在参考链接中找到。

## 决策

目标是能够签名任意消息，甚至可以使用 Ledger 或类似的 HSM 设备。

因此，签名后的消息应该大致类似于 Cosmos SDK 消息，但**不必**是有效的链上交易。`chain-id`、`account_number` 和 `sequence` 可以分配无效的值。

Cosmos SDK 0.40 还引入了“auth_info”的概念，可以指定 SIGN_MODES。

规范应包括一个支持 SIGN_MODE_DIRECT 和 SIGN_MODE_LEGACY_AMINO 的 `auth_info`。

创建 `offchain` proto 定义，我们通过 `offchain` 包扩展 auth 模块，以提供验证和签名离线消息的功能。

链下交易遵循以下规则：

* 备注必须为空
* nonce和序列号必须为0
* chain-id必须为空字符串
* 费用的gas必须为0
* 费用的金额必须是一个空数组

对于离线交易的验证遵循与在线交易相同的规则，除了上述突出的规范差异。

添加到`offchain`包中的第一个消息是`MsgSignData`。

`MsgSignData`允许开发人员仅对离线有效的任意字节进行签名。其中`Signer`是签名者的账户地址。`Data`是任意字节，可以表示`文本`、`文件`、`对象`。在应用程序开发者的上下文中，如何对`Data`进行反序列化、序列化以及它可以表示的对象是应用程序开发者的决定。

在Proto定义中：

```protobuf
// MsgSignData defines an arbitrary, general-purpose, off-chain message
message MsgSignData {
    // Signer is the sdk.AccAddress of the message signer
    bytes Signer = 1 [(gogoproto.jsontag) = "signer", (gogoproto.casttype) = "github.com/cosmos/cosmos-sdk/types.AccAddress"];
    // Data represents the raw bytes of the content that is signed (text, json, etc)
    bytes Data = 2 [(gogoproto.jsontag) = "data"];
}
```

签名的MsgSignData JSON示例：

```json
{
  "type": "cosmos-sdk/StdTx",
  "value": {
    "msg": [
      {
        "type": "sign/MsgSignData",
        "value": {
          "signer": "cosmos1hftz5ugqmpg9243xeegsqqav62f8hnywsjr4xr",
          "data": "cmFuZG9t"
        }
      }
    ],
    "fee": {
      "amount": [],
      "gas": "0"
    },
    "signatures": [
      {
        "pub_key": {
          "type": "tendermint/PubKeySecp256k1",
          "value": "AqnDSiRoFmTPfq97xxEb2VkQ/Hm28cPsqsZm9jEVsYK9"
        },
        "signature": "8y8i34qJakkjse9pOD2De+dnlc4KvFgh0wQpes4eydN66D9kv7cmCEouRrkka9tlW9cAkIL52ErB+6ye7X5aEg=="
      }
    ],
    "memo": ""
  }
}
```

## 影响

有关如何形成不打算广播到实时链的消息的规范。

### 向后兼容性

向后兼容性得到保持，因为这是一个新的消息规范定义。

### 积极影响

* 可供多个应用程序使用的常见格式，用于对离线消息进行签名和验证。
* 该规范是原始的，这意味着它可以涵盖每种用例，而不限制可能放入其中的内容。
* 它为其他离线消息规范留出了空间，这些规范旨在针对更具体和常见的用例，例如基于离线的身份验证/授权层[2]。

### 负面影响

* 当前提案要求账户地址和公钥之间存在固定的关系。
* 与多签账户不兼容。

## 进一步讨论

* 关于`MsgSignData`中的安全性，使用`MsgSignData`的开发人员负责在需要时使`Data`中的内容不可重放。
* `offchain`包将进一步扩展，添加针对特定用例的额外消息，例如应用程序中的身份验证、支付通道、一般的L2解决方案等。

## 参考资料

1. [https://github.com/cosmos/ics/pull/33](https://github.com/cosmos/ics/pull/33)
2. [https://github.com/cosmos/cosmos-sdk/pull/7727#discussion_r515668204](https://github.com/cosmos/cosmos-sdk/pull/7727#discussion_r515668204)
3. [https://github.com/cosmos/cosmos-sdk/pull/7727#issuecomment-722478477](https://github.com/cosmos/cosmos-sdk/pull/7727#issuecomment-722478477)
4. [https://github.com/cosmos/cosmos-sdk/pull/7727#issuecomment-721062923](https://github.com/cosmos/cosmos-sdk/pull/7727#issuecomment-721062923)


# ADR 036: Arbitrary Message Signature Specification

## Changelog

* 28/10/2020 - Initial draft

## Authors

* Antoine Herzog (@antoineherzog)
* Zaki Manian (@zmanian)
* Aleksandr Bezobchuk (alexanderbez) [1]
* Frojdi Dymylja (@fdymylja)

## Status

Draft

## Abstract

Currently, in the Cosmos SDK, there is no convention to sign arbitrary message like on Ethereum. We propose with this specification, for Cosmos SDK ecosystem, a way to sign and validate off-chain arbitrary messages.

This specification serves the purpose of covering every use case, this means that cosmos-sdk applications developers decide how to serialize and represent `Data` to users.

## Context

Having the ability to sign messages off-chain has proven to be a fundamental aspect of nearly any blockchain. The notion of signing messages off-chain has many added benefits such as saving on computational costs and reducing transaction throughput and overhead. Within the context of the Cosmos, some of the major applications of signing such data includes, but is not limited to, providing a cryptographic secure and verifiable means of proving validator identity and possibly associating it with some other framework or organization. In addition, having the ability to sign Cosmos messages with a Ledger or similar HSM device.

Further context and use cases can be found in the references links.

## Decision

The aim is being able to sign arbitrary messages, even using Ledger or similar HSM devices.

As a result signed messages should look roughly like Cosmos SDK messages but **must not** be a valid on-chain transaction. `chain-id`, `account_number` and `sequence` can all be assigned invalid values.

Cosmos SDK 0.40 also introduces a concept of “auth_info” this can specify SIGN_MODES.

A spec should include an `auth_info` that supports SIGN_MODE_DIRECT and SIGN_MODE_LEGACY_AMINO.

Create the `offchain` proto definitions, we extend the auth module with `offchain` package to offer functionalities to verify and sign offline messages.

An offchain transaction follows these rules:

* the memo must be empty
* nonce, sequence number must be equal to 0
* chain-id must be equal to “”
* fee gas must be equal to 0
* fee amount must be an empty array

Verification of an offchain transaction follows the same rules as an onchain one, except for the spec differences highlighted above.

The first message added to the `offchain` package is `MsgSignData`.

`MsgSignData` allows developers to sign arbitrary bytes valid offchain only. Where `Signer` is the account address of the signer. `Data` is arbitrary bytes which can represent `text`, `files`, `object`s. It's applications developers decision how `Data` should be deserialized, serialized and the object it can represent in their context.

It's applications developers decision how `Data` should be treated, by treated we mean the serialization and deserialization process and the Object `Data` should represent.

Proto definition:

```protobuf
// MsgSignData defines an arbitrary, general-purpose, off-chain message
message MsgSignData {
    // Signer is the sdk.AccAddress of the message signer
    bytes Signer = 1 [(gogoproto.jsontag) = "signer", (gogoproto.casttype) = "github.com/cosmos/cosmos-sdk/types.AccAddress"];
    // Data represents the raw bytes of the content that is signed (text, json, etc)
    bytes Data = 2 [(gogoproto.jsontag) = "data"];
}
```

Signed MsgSignData json example:

```json
{
  "type": "cosmos-sdk/StdTx",
  "value": {
    "msg": [
      {
        "type": "sign/MsgSignData",
        "value": {
          "signer": "cosmos1hftz5ugqmpg9243xeegsqqav62f8hnywsjr4xr",
          "data": "cmFuZG9t"
        }
      }
    ],
    "fee": {
      "amount": [],
      "gas": "0"
    },
    "signatures": [
      {
        "pub_key": {
          "type": "tendermint/PubKeySecp256k1",
          "value": "AqnDSiRoFmTPfq97xxEb2VkQ/Hm28cPsqsZm9jEVsYK9"
        },
        "signature": "8y8i34qJakkjse9pOD2De+dnlc4KvFgh0wQpes4eydN66D9kv7cmCEouRrkka9tlW9cAkIL52ErB+6ye7X5aEg=="
      }
    ],
    "memo": ""
  }
}
```

## Consequences

There is a specification on how messages, that are not meant to be broadcast to a live chain, should be formed.

### Backwards Compatibility

Backwards compatibility is maintained as this is a new message spec definition.

### Positive

* A common format that can be used by multiple applications to sign and verify off-chain messages.
* The specification is primitive which means it can cover every use case without limiting what is possible to fit inside it.
* It gives room for other off-chain messages specifications that aim to target more specific and common use cases such as off-chain-based authN/authZ layers [2].

### Negative

* Current proposal requires a fixed relationship between an account address and a public key.
* Doesn't work with multisig accounts.

## Further discussion

* Regarding security in `MsgSignData`, the developer using `MsgSignData` is in charge of making the content laying in `Data` non-replayable when, and if, needed.
* the offchain package will be further extended with extra messages that target specific use cases such as, but not limited to, authentication in applications, payment channels, L2 solutions in general.

## References

1. https://github.com/cosmos/ics/pull/33
2. https://github.com/cosmos/cosmos-sdk/pull/7727#discussion_r515668204
3. https://github.com/cosmos/cosmos-sdk/pull/7727#issuecomment-722478477
4. https://github.com/cosmos/cosmos-sdk/pull/7727#issuecomment-721062923
