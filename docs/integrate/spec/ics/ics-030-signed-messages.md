# ICS 030: Cosmos 签名消息

>TODO: 用有效的 ICS 编号替换，并可能移动到新位置。

* [变更日志](#changelog)
* [摘要](#abstract)
* [初步](#preliminary)
* [规范](#specification)
* [未来适应](#future-adaptations)
* [API](#api)
* [参考资料](#references)  

## 状态

建议中。

## 变更日志

## 摘要

在链下签署消息的能力已被证明是几乎任何区块链的基本方面。链下签署消息的概念有许多附加优势，例如节省计算成本、减少交易吞吐量和开销。在 Cosmos 的背景下，签署此类数据的主要应用包括但不限于提供一种加密安全且可验证的方式来证明验证者身份，并可能将其与某些其他框架或组织关联起来。此外，还可以使用 Ledger 或类似的 HSM 设备对 Cosmos 消息进行签名。

需要一种标准化的协议来对消息进行哈希、签名和验证，该协议可以由 Cosmos SDK 和其他第三方组织实现。这样的标准化协议应符合以下要求：

* 包含人类可读且机器可验证的类型化结构化数据的规范
* 包含确定性和可逆编码结构化数据的框架
* 使用加密安全的哈希和签名算法
* 支持扩展和域分离的框架
* 对所选密文攻击具有防护能力
* 防止用户意外签署交易的框架

本规范仅关注 Cosmos 签名消息的原理和标准化实现。它**不**涉及重放攻击的概念，因为这将由更高级别的应用实现来处理。如果您将签名消息视为授权某些操作或数据的方式，那么这样的应用程序必须将其视为幂等，或者必须有机制来拒绝已知的签名消息。

## 初步

Cosmos消息签名协议将使用密码学安全散列算法`SHA-256`和包含`sign`和`verify`操作的签名算法`S`进行参数化，这些操作分别对一组字节进行数字签名和验证签名。

请注意，我们在这里的目标不是提供关于为什么选择这些算法的上下文和理由，除了它们是CometBFT和Cosmos SDK中使用的事实算法，并且它们满足我们对此类密码算法的需求，例如具有抗碰撞和第二前像攻击的能力，以及[确定性](https://en.wikipedia.org/wiki/Hash_function#Determinism)和[均匀性](https://en.wikipedia.org/wiki/Hash_function#Uniformity)。

## 规范

CometBFT使用规范的JSON表示定义了一种签署消息的协议，具体定义请参见[此处](https://github.com/cometbft/cometbft/blob/master/types/canonical.go)。

这样一个规范的JSON结构的示例是CometBFT的投票结构：

```go
type CanonicalJSONVote struct {
    ChainID   string               `json:"@chain_id"`
    Type      string               `json:"@type"`
    BlockID   CanonicalJSONBlockID `json:"block_id"`
    Height    int64                `json:"height"`
    Round     int                  `json:"round"`
    Timestamp string               `json:"timestamp"`
    VoteType  byte                 `json:"type"`
}
```

根据这样的规范的JSON结构，规范要求它们包括元字段：`@chain_id`和`@type`。这些元字段是保留字段，必须包含在内。它们都是`string`类型。此外，字段必须按字典升序排序。

为了签署Cosmos消息，`@chain_id`字段必须对应于Cosmos链标识符。如果`@chain_id`字段与当前活动链不匹配，用户代理应该**拒绝**签名！`@type`字段必须等于常量`"message"`。`@type`字段对应于用户将在应用程序中签署的结构类型。目前，用户只能签署有效ASCII文本的字节（[请参见此处](https://github.com/cometbft/cometbft/blob/v0.37.0/libs/strings/string.go#L35-L64)）。然而，这将会改变和发展，以支持更多的应用程序特定结构，这些结构是人类可读且机器可验证的（[请参见未来的适应性](#future-adaptations)）。

因此，我们可以使用[JSON schema](http://json-schema.org/)规范来定义一个用于签署Cosmos消息的规范的规范化JSON结构，如下所示：

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "$id": "cosmos/signing/typeData/schema",
  "title": "The Cosmos signed message typed data schema.",
  "type": "object",
  "properties": {
    "@chain_id": {
      "type": "string",
      "description": "The corresponding Cosmos chain identifier.",
      "minLength": 1
    },
    "@type": {
      "type": "string",
      "description": "The message type. It must be 'message'.",
      "enum": [
        "message"
      ]
    },
    "text": {
      "type": "string",
      "description": "The valid ASCII text to sign.",
      "pattern": "^[\\x20-\\x7E]+$",
      "minLength": 1
    }
  },
  "required": [
    "@chain_id",
    "@type",
    "text"
  ]
}
```

例如：

```json
{
  "@chain_id": "1",
  "@type": "message",
  "text": "Hello, you can identify me as XYZ on keybase."
}
```

## 未来的适应性

由于应用程序在领域上可能有很大的差异，支持领域分离和人类可读且可机器验证的结构将至关重要。

领域分离将允许应用程序开发人员防止相同结构的冲突。它应该被设计为每个应用程序使用唯一的，并且应直接用于签名编码本身。

人类可读且可机器验证的结构将允许最终用户签署更复杂的结构，而不仅仅是字符串消息，并且仍然能够准确知道他们正在签署的内容（而不是签署一堆任意字节）。

因此，在未来，Cosmos签名消息规范将预计在其规范化的JSON结构的基础上扩展以包括此类功能。

## API

应用程序开发人员和设计人员应制定一套符合以下规范的标准API：

-----

### **cosmosSignBytes**

参数：

* `data`：Cosmos签名消息的规范化JSON结构
* `address`：用于签署数据的Bech32 Cosmos账户地址

返回：

* `signature`：使用签名算法`S`生成的Cosmos签名

-----

### 示例

使用`secp256k1`作为DSA，`S`：

```javascript
data = {
  "@chain_id": "1",
  "@type": "message",
  "text": "I hereby claim I am ABC on Keybase!"
}

cosmosSignBytes(data, "cosmos1pvsch6cddahhrn5e8ekw0us50dpnugwnlfngt3")
> "0x7fc4a495473045022100dec81a9820df0102381cdbf7e8b0f1e2cb64c58e0ecda1324543742e0388e41a02200df37905a6505c1b56a404e23b7473d2c0bc5bcda96771d2dda59df6ed2b98f8"
```

## 参考资料


# ICS 030: Cosmos Signed Messages

>TODO: Replace with valid ICS number and possibly move to new location.

* [Changelog](#changelog)
* [Abstract](#abstract)
* [Preliminary](#preliminary)
* [Specification](#specification)
* [Future Adaptations](#future-adaptations)
* [API](#api)
* [References](#references)  

## Status

Proposed.

## Changelog

## Abstract

Having the ability to sign messages off-chain has proven to be a fundamental aspect
of nearly any blockchain. The notion of signing messages off-chain has many
added benefits such as saving on computational costs and reducing transaction
throughput and overhead. Within the context of the Cosmos, some of the major
applications of signing such data includes, but is not limited to, providing a
cryptographic secure and verifiable means of proving validator identity and
possibly associating it with some other framework or organization. In addition,
having the ability to sign Cosmos messages with a Ledger or similar HSM device.

A standardized protocol for hashing, signing, and verifying messages that can be
implemented by the Cosmos SDK and other third-party organizations is needed. Such a
standardized protocol subscribes to the following:

* Contains a specification of human-readable and machine-verifiable typed structured data
* Contains a framework for deterministic and injective encoding of structured data
* Utilizes cryptographic secure hashing and signing algorithms
* A framework for supporting extensions and domain separation
* Is invulnerable to chosen ciphertext attacks
* Has protection against potentially signing transactions a user did not intend to

This specification is only concerned with the rationale and the standardized
implementation of Cosmos signed messages. It does **not** concern itself with the
concept of replay attacks as that will be left up to the higher-level application
implementation. If you view signed messages in the means of authorizing some
action or data, then such an application would have to either treat this as
idempotent or have mechanisms in place to reject known signed messages.

## Preliminary

The Cosmos message signing protocol will be parameterized with a cryptographic
secure hashing algorithm `SHA-256` and a signing algorithm `S` that contains
the operations `sign` and `verify` which provide a digital signature over a set
of bytes and verification of a signature respectively.

Note, our goal here is not to provide context and reasoning about why necessarily
these algorithms were chosen apart from the fact they are the defacto algorithms
used in CometBFT and the Cosmos SDK and that they satisfy our needs for such
cryptographic algorithms such as having resistance to collision and second
pre-image attacks, as well as being [deterministic](https://en.wikipedia.org/wiki/Hash_function#Determinism) and [uniform](https://en.wikipedia.org/wiki/Hash_function#Uniformity).

## Specification

CometBFT has a well established protocol for signing messages using a canonical
JSON representation as defined [here](https://github.com/cometbft/cometbft/blob/master/types/canonical.go).

An example of such a canonical JSON structure is CometBFT's vote structure:

```go
type CanonicalJSONVote struct {
    ChainID   string               `json:"@chain_id"`
    Type      string               `json:"@type"`
    BlockID   CanonicalJSONBlockID `json:"block_id"`
    Height    int64                `json:"height"`
    Round     int                  `json:"round"`
    Timestamp string               `json:"timestamp"`
    VoteType  byte                 `json:"type"`
}
```

With such canonical JSON structures, the specification requires that they include
meta fields: `@chain_id` and `@type`. These meta fields are reserved and must be
included. They are both of type `string`. In addition, fields must be ordered
in lexicographically ascending order.

For the purposes of signing Cosmos messages, the `@chain_id` field must correspond
to the Cosmos chain identifier. The user-agent should **refuse** signing if the
`@chain_id` field does not match the currently active chain! The `@type` field
must equal the constant `"message"`. The `@type` field corresponds to the type of
structure the user will be signing in an application. For now, a user is only
allowed to sign bytes of valid ASCII text ([see here](https://github.com/cometbft/cometbft/blob/v0.37.0/libs/strings/string.go#L35-L64)).
However, this will change and evolve to support additional application-specific
structures that are human-readable and machine-verifiable ([see Future Adaptations](#future-adaptations)).

Thus, we can have a canonical JSON structure for signing Cosmos messages using
the [JSON schema](http://json-schema.org/) specification as such:

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "$id": "cosmos/signing/typeData/schema",
  "title": "The Cosmos signed message typed data schema.",
  "type": "object",
  "properties": {
    "@chain_id": {
      "type": "string",
      "description": "The corresponding Cosmos chain identifier.",
      "minLength": 1
    },
    "@type": {
      "type": "string",
      "description": "The message type. It must be 'message'.",
      "enum": [
        "message"
      ]
    },
    "text": {
      "type": "string",
      "description": "The valid ASCII text to sign.",
      "pattern": "^[\\x20-\\x7E]+$",
      "minLength": 1
    }
  },
  "required": [
    "@chain_id",
    "@type",
    "text"
  ]
}
```

e.g.

```json
{
  "@chain_id": "1",
  "@type": "message",
  "text": "Hello, you can identify me as XYZ on keybase."
}
```

## Future Adaptations

As applications can vary greatly in domain, it will be vital to support both
domain separation and human-readable and machine-verifiable structures.

Domain separation will allow for application developers to prevent collisions of
otherwise identical structures. It should be designed to be unique per application
use and should directly be used in the signature encoding itself.

Human-readable and machine-verifiable structures will allow end users to sign
more complex structures, apart from just string messages, and still be able to
know exactly what they are signing (opposed to signing a bunch of arbitrary bytes).

Thus, in the future, the Cosmos signing message specification will be expected
to expand upon it's canonical JSON structure to include such functionality.

## API

Application developers and designers should formalize a standard set of APIs that
adhere to the following specification:

-----

### **cosmosSignBytes**

Params:

* `data`: the Cosmos signed message canonical JSON structure
* `address`: the Bech32 Cosmos account address to sign data with

Returns:

* `signature`: the Cosmos signature derived using signing algorithm `S`

-----

### Examples

Using the `secp256k1` as the DSA, `S`:

```javascript
data = {
  "@chain_id": "1",
  "@type": "message",
  "text": "I hereby claim I am ABC on Keybase!"
}

cosmosSignBytes(data, "cosmos1pvsch6cddahhrn5e8ekw0us50dpnugwnlfngt3")
> "0x7fc4a495473045022100dec81a9820df0102381cdbf7e8b0f1e2cb64c58e0ecda1324543742e0388e41a02200df37905a6505c1b56a404e23b7473d2c0bc5bcda96771d2dda59df6ed2b98f8"
```

## References
