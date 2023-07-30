# 账户

:::note 概述
本文档描述了Cosmos SDK的内置账户和公钥系统。
:::

:::note

### 先决条件阅读

* [Cosmos SDK应用程序解剖](00-overview-app.md)

:::

## 账户定义

在Cosmos SDK中，一个 _账户_ 指的是一对 _公钥_ `PubKey` 和 _私钥_ `PrivKey`。`PubKey` 可以派生出各种 `Addresses`，用于标识应用程序中的用户（以及其他参与方）。`Addresses` 也与 [`message`s](../../integrate/building-modules/02-messages-and-queries.md#messages) 相关联，用于标识 `message` 的发送者。`PrivKey` 用于生成[数字签名](#keys-accounts-addresses-and-signatures)，以证明与 `PrivKey` 关联的 `Address` 批准了给定的 `message`。

对于HD密钥派生，Cosmos SDK使用了一种称为[BIP32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)的标准。BIP32允许用户创建一个HD钱包（如[BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)中所指定的）- 从初始秘密种子派生的一组账户。种子通常由12个或24个单词的助记词创建。使用单向加密函数，一个种子可以派生出任意数量的 `PrivKey`。然后，可以从 `PrivKey` 派生出 `PubKey`。自然地，助记词是最敏感的信息，因为如果保留了助记词，私钥总是可以重新生成的。

```text
     Account 0                         Account 1                         Account 2

+------------------+              +------------------+               +------------------+
|                  |              |                  |               |                  |
|    Address 0     |              |    Address 1     |               |    Address 2     |
|        ^         |              |        ^         |               |        ^         |
|        |         |              |        |         |               |        |         |
|        |         |              |        |         |               |        |         |
|        |         |              |        |         |               |        |         |
|        +         |              |        +         |               |        +         |
|  Public key 0    |              |  Public key 1    |               |  Public key 2    |
|        ^         |              |        ^         |               |        ^         |
|        |         |              |        |         |               |        |         |
|        |         |              |        |         |               |        |         |
|        |         |              |        |         |               |        |         |
|        +         |              |        +         |               |        +         |
|  Private key 0   |              |  Private key 1   |               |  Private key 2   |
|        ^         |              |        ^         |               |        ^         |
+------------------+              +------------------+               +------------------+
         |                                 |                                  |
         |                                 |                                  |
         |                                 |                                  |
         +--------------------------------------------------------------------+
                                           |
                                           |
                                 +---------+---------+
                                 |                   |
                                 |  Master PrivKey   |
                                 |                   |
                                 +-------------------+
                                           |
                                           |
                                 +---------+---------+
                                 |                   |
                                 |  Mnemonic (Seed)  |
                                 |                   |
                                 +-------------------+
```

在Cosmos SDK中，使用一个称为 [`Keyring`](#keyring) 的对象来存储和管理密钥。

## 密钥、账户、地址和签名

验证用户身份的主要方式是使用[数字签名](https://en.wikipedia.org/wiki/Digital_signature)。用户使用自己的私钥对交易进行签名。使用相关联的公钥进行签名验证。为了进行链上签名验证，我们将公钥存储在一个 `Account` 对象中（以及其他用于正确交易验证所需的数据）。

在节点中，所有数据都使用Protocol Buffers序列化存储。

Cosmos SDK支持以下数字密钥方案用于创建数字签名：

* `secp256k1`，在[Cosmos SDK的`crypto/keys/secp256k1`包](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keys/secp256k1/secp256k1.go)中实现。
* `secp256r1`，在[Cosmos SDK的`crypto/keys/secp256r1`包](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keys/secp256r1/pubkey.go)中实现。
* `tm-ed25519`，在[Cosmos SDK的`crypto/keys/ed25519`包](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keys/ed25519/ed25519.go)中实现。此方案仅用于共识验证。

|              | 地址长度（字节） | 公钥长度（字节） | 用于交易身份验证 | 用于共识（cometbft） |
| :----------: | :--------------: | :--------------: | :--------------: | :-----------------: |
| `secp256k1`  |        20        |        33        |       是         |         否          |
| `secp256r1`  |        32        |        33        |       是         |         否          |
| `tm-ed25519` |  -- 不使用 --   |        32        |       否         |         是          |

## 地址

`Addresses`和`PubKey`都是公共信息，用于标识应用程序中的参与者。`Account`用于存储身份验证信息。基本账户实现由`BaseAccount`对象提供。

每个账户都使用`Address`来标识，它是从公钥派生的字节序列。在Cosmos SDK中，我们定义了3种类型的地址，用于指定账户使用的上下文：

* `AccAddress`用于标识用户（`message`的发送者）。
* `ValAddress`用于标识验证器操作员。
* `ConsAddress`用于标识参与共识的验证器节点。验证器节点使用**`ed25519`**曲线派生。

这些类型实现了 `Address` 接口：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/address.go#L108-L124
```

地址构建算法在 [ADR-28](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-028-public-key-addresses.md) 中定义。
以下是从 `pub` 公钥获取账户地址的标准方法：

```go
sdk.AccAddress(pub.Address().Bytes())
```

需要注意的是，`Marshal()` 和 `Bytes()` 方法都返回地址的相同原始 `[]byte` 形式。`Marshal()` 方法是为了与 Protobuf 兼容性而需要的。

对于用户交互，地址使用 [Bech32](https://en.bitcoin.it/wiki/Bech32) 进行格式化，并由 `String` 方法实现。Bech32 方法是与区块链交互时唯一支持的格式。Bech32 可读部分（Bech32 前缀）用于表示地址类型。示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/address.go#L281-L295
```

|                    | Address Bech32 Prefix |
| ------------------ | --------------------- |
| 账户               | cosmos                |
| 验证人操作者       | cosmosvaloper         |
| 共识节点           | cosmosvalcons         |

### 公钥

Cosmos SDK 中的公钥由 `cryptotypes.PubKey` 接口定义。由于公钥保存在存储中，`cryptotypes.PubKey` 扩展了 `proto.Message` 接口：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/types/types.go#L8-L17
```

`secp256k1` 和 `secp256r1` 使用压缩格式进行序列化。

* 如果 `y` 坐标在与 `x` 坐标关联的两个坐标中字典序最大，则第一个字节是 `0x02` 字节。
* 否则，第一个字节是 `0x03`。

该前缀后跟 `x` 坐标。

公钥不用于引用账户（或用户），一般情况下也不用于组成交易消息（有少数例外：`MsgCreateValidator`、`Validator` 和 `Multisig` 消息）。
对于用户交互，`PubKey` 使用 Protobufs JSON 进行格式化（[ProtoMarshalJSON](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/codec/json.go#L14-L34) 函数）。示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/output.go#L23-L39
```

## 密钥环

`Keyring` 是一个存储和管理账户的对象。在 Cosmos SDK 中，`Keyring` 的实现遵循 `Keyring` 接口：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/keyring.go#L54-L101
```

`Keyring` 的默认实现来自第三方库 [`99designs/keyring`](https://github.com/99designs/keyring)。

关于 `Keyring` 方法的一些注意事项：

* `Sign(uid string, msg []byte) ([]byte, types.PubKey, error)` 严格处理 `msg` 字节的签名。您必须将交易准备好并编码为规范的 `[]byte` 形式。由于 protobuf 不是确定性的，已经在 [ADR-020](../../integrate/architecture/adr-020-protobuf-transaction-encoding.md) 中决定要签名的规范 `payload` 是 `SignDoc` 结构，使用 [ADR-027](../../integrate/architecture/adr-027-deterministic-protobuf-serialization.md) 进行确定性编码。请注意，Cosmos SDK 默认不实现签名验证，而是推迟到 [`anteHandler`](../advanced-concepts/00-baseapp.md#antehandler)。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L48-L65
```

* `NewAccount(uid, mnemonic, bip39Passphrase, hdPath string, algo SignatureAlgo) (*Record, error)` 根据 [`bip44 path`](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) 创建一个新账户，并将其持久化到磁盘上。`PrivKey` **永远不会以未加密的形式存储**，而是在持久化之前使用 [加密密码短语](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/armor.go) 进行加密。在此方法的上下文中，密钥类型和序列号指的是 BIP44 派生路径的段（例如，`0`，`1`，`2`，...），用于从助记词派生私钥和公钥。使用相同的助记词和派生路径，将生成相同的 `PrivKey`、`PubKey` 和 `Address`。密钥环支持以下密钥：

* `secp256k1`
* `ed25519`

* `ExportPrivKeyArmor(uid, encryptPassphrase string) (armor string, err error)` 使用给定的密码短语以ASCII-armored加密格式导出私钥。然后，您可以使用`ImportPrivKey(uid, armor, passphrase string)`函数将私钥再次导入到密钥环中，或者使用`UnarmorDecryptPrivKey(armorStr string, passphrase string)`函数将其解密为原始私钥。

### 创建新的密钥类型

要在密钥环中创建新的密钥类型，必须满足`keyring.SignatureAlgo`接口。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/signing_algorithms.go#L10-L15
```

该接口包含三个方法，其中`Name()`返回算法的名称作为`hd.PubKeyType`，`Derive()`和`Generate()`必须分别返回以下函数：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/hd/algo.go#L28-L31
```

一旦实现了`keyring.SignatureAlgo`，它必须添加到密钥环的[支持算法列表](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/keyring.go#L217)中。

为了简化起见，新密钥类型的实现应该在`crypto/hd`包内完成。在[algo.go](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/hd/algo.go#L38)中有一个`secp256k1`实现的示例。

#### 实现 secp256r1 算法

下面是如何实现 secp256r1 算法的示例。

首先，需要在 secp256r1 包中创建一个从秘密数创建私钥的新函数。该函数可以如下所示：

```go
// cosmos-sdk/crypto/keys/secp256r1/privkey.go

// NewPrivKeyFromSecret creates a private key derived for the secret number
// represented in big-endian. The `secret` must be a valid ECDSA field element.
func NewPrivKeyFromSecret(secret []byte) (*PrivKey, error) {
	var d = new(big.Int).SetBytes(secret)
	if d.Cmp(secp256r1.Params().N) >= 1 {
		return nil, errorsmod.Wrap(errors.ErrInvalidRequest, "secret not in the curve base field")
	}
	sk := new(ecdsa.PrivKey)
	return &PrivKey{&ecdsaSK{*sk}}, nil
}
```

之后，可以实现`secp256r1Algo`。

```go
// cosmos-sdk/crypto/hd/secp256r1Algo.go

package hd

import (
	"github.com/cosmos/go-bip39"
	
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256r1"
	"github.com/cosmos/cosmos-sdk/crypto/types"
)

// Secp256r1Type uses the secp256r1 ECDSA parameters.
const Secp256r1Type = PubKeyType("secp256r1")

var Secp256r1 = secp256r1Algo{}

type secp256r1Algo struct{}

func (s secp256r1Algo) Name() PubKeyType {
	return Secp256r1Type
}

// Derive derives and returns the secp256r1 private key for the given seed and HD path.
func (s secp256r1Algo) Derive() DeriveFn {
	return func(mnemonic string, bip39Passphrase, hdPath string) ([]byte, error) {
		seed, err := bip39.NewSeedWithErrorChecking(mnemonic, bip39Passphrase)
		if err != nil {
			return nil, err
		}

		masterPriv, ch := ComputeMastersFromSeed(seed)
		if len(hdPath) == 0 {
			return masterPriv[:], nil
		}
		derivedKey, err := DerivePrivateKeyForPath(masterPriv, ch, hdPath)

		return derivedKey, err
	}
}

// Generate generates a secp256r1 private key from the given bytes.
func (s secp256r1Algo) Generate() GenerateFn {
	return func(bz []byte) types.PrivKey {
		key, err := secp256r1.NewPrivKeyFromSecret(bz)
		if err != nil {
			panic(err)
		}
		return key
	}
}
```

最后，必须将该算法添加到密钥环的[支持算法列表](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/keyring.go#L217)中。

```go
// cosmos-sdk/crypto/keyring/keyring.go

func newKeystore(kr keyring.Keyring, cdc codec.Codec, backend string, opts ...Option) keystore {
	// Default options for keybase, these can be overwritten using the
	// Option function
	options := Options{
		SupportedAlgos:       SigningAlgoList{hd.Secp256k1, hd.Secp256r1}, // added here
		SupportedAlgosLedger: SigningAlgoList{hd.Secp256k1},
	}
...
```

然后，要使用您的算法创建新密钥，必须使用`--algo`标志指定它：

`simd keys add myKey --algo secp256r1`


# Accounts

:::note Synopsis
This document describes the in-built account and public key system of the Cosmos SDK.
:::

:::note

### Pre-requisite Readings

* [Anatomy of a Cosmos SDK Application](00-overview-app.md)

:::

## Account Definition

In the Cosmos SDK, an _account_ designates a pair of _public key_ `PubKey` and _private key_ `PrivKey`. The `PubKey` can be derived to generate various `Addresses`, which are used to identify users (among other parties) in the application. `Addresses` are also associated with [`message`s](../../integrate/building-modules/02-messages-and-queries.md#messages) to identify the sender of the `message`. The `PrivKey` is used to generate [digital signatures](#keys-accounts-addresses-and-signatures) to prove that an `Address` associated with the `PrivKey` approved of a given `message`.

For HD key derivation the Cosmos SDK uses a standard called [BIP32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki). The BIP32 allows users to create an HD wallet (as specified in [BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)) - a set of accounts derived from an initial secret seed. A seed is usually created from a 12- or 24-word mnemonic. A single seed can derive any number of `PrivKey`s using a one-way cryptographic function. Then, a `PubKey` can be derived from the `PrivKey`. Naturally, the mnemonic is the most sensitive information, as private keys can always be re-generated if the mnemonic is preserved.

```text
     Account 0                         Account 1                         Account 2

+------------------+              +------------------+               +------------------+
|                  |              |                  |               |                  |
|    Address 0     |              |    Address 1     |               |    Address 2     |
|        ^         |              |        ^         |               |        ^         |
|        |         |              |        |         |               |        |         |
|        |         |              |        |         |               |        |         |
|        |         |              |        |         |               |        |         |
|        +         |              |        +         |               |        +         |
|  Public key 0    |              |  Public key 1    |               |  Public key 2    |
|        ^         |              |        ^         |               |        ^         |
|        |         |              |        |         |               |        |         |
|        |         |              |        |         |               |        |         |
|        |         |              |        |         |               |        |         |
|        +         |              |        +         |               |        +         |
|  Private key 0   |              |  Private key 1   |               |  Private key 2   |
|        ^         |              |        ^         |               |        ^         |
+------------------+              +------------------+               +------------------+
         |                                 |                                  |
         |                                 |                                  |
         |                                 |                                  |
         +--------------------------------------------------------------------+
                                           |
                                           |
                                 +---------+---------+
                                 |                   |
                                 |  Master PrivKey   |
                                 |                   |
                                 +-------------------+
                                           |
                                           |
                                 +---------+---------+
                                 |                   |
                                 |  Mnemonic (Seed)  |
                                 |                   |
                                 +-------------------+
```

In the Cosmos SDK, keys are stored and managed by using an object called a [`Keyring`](#keyring).

## Keys, accounts, addresses, and signatures

The principal way of authenticating a user is done using [digital signatures](https://en.wikipedia.org/wiki/Digital_signature). Users sign transactions using their own private key. Signature verification is done with the associated public key. For on-chain signature verification purposes, we store the public key in an `Account` object (alongside other data required for a proper transaction validation).

In the node, all data is stored using Protocol Buffers serialization.

The Cosmos SDK supports the following digital key schemes for creating digital signatures:

* `secp256k1`, as implemented in the [Cosmos SDK's `crypto/keys/secp256k1` package](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keys/secp256k1/secp256k1.go).
* `secp256r1`, as implemented in the [Cosmos SDK's `crypto/keys/secp256r1` package](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keys/secp256r1/pubkey.go),
* `tm-ed25519`, as implemented in the [Cosmos SDK `crypto/keys/ed25519` package](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keys/ed25519/ed25519.go). This scheme is supported only for the consensus validation.

|              | Address length in bytes | Public key length in bytes | Used for transaction authentication | Used for consensus (cometbft) |
| :----------: | :---------------------: | :------------------------: | :---------------------------------: | :---------------------------: |
| `secp256k1`  |           20            |             33             |                 yes                 |              no               |
| `secp256r1`  |           32            |             33             |                 yes                 |              no               |
| `tm-ed25519` |     -- not used --      |             32             |                 no                  |              yes              |

## Addresses

`Addresses` and `PubKey`s are both public information that identifies actors in the application. `Account` is used to store authentication information. The basic account implementation is provided by a `BaseAccount` object.

Each account is identified using `Address` which is a sequence of bytes derived from a public key. In the Cosmos SDK, we define 3 types of addresses that specify a context where an account is used:

* `AccAddress` identifies users (the sender of a `message`).
* `ValAddress` identifies validator operators.
* `ConsAddress` identifies validator nodes that are participating in consensus. Validator nodes are derived using the **`ed25519`** curve.

These types implement the `Address` interface:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/address.go#L108-L124
```

Address construction algorithm is defined in [ADR-28](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-028-public-key-addresses.md).
Here is the standard way to obtain an account address from a `pub` public key:

```go
sdk.AccAddress(pub.Address().Bytes())
```

Of note, the `Marshal()` and `Bytes()` method both return the same raw `[]byte` form of the address. `Marshal()` is required for Protobuf compatibility.

For user interaction, addresses are formatted using [Bech32](https://en.bitcoin.it/wiki/Bech32) and implemented by the `String` method. The Bech32 method is the only supported format to use when interacting with a blockchain. The Bech32 human-readable part (Bech32 prefix) is used to denote an address type. Example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/types/address.go#L281-L295
```

|                    | Address Bech32 Prefix |
| ------------------ | --------------------- |
| Accounts           | cosmos                |
| Validator Operator | cosmosvaloper         |
| Consensus Nodes    | cosmosvalcons         |

### Public Keys

Public keys in Cosmos SDK are defined by `cryptotypes.PubKey` interface. Since public keys are saved in a store, `cryptotypes.PubKey` extends the `proto.Message` interface:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/types/types.go#L8-L17
```

A compressed format is used for `secp256k1` and `secp256r1` serialization.

* The first byte is a `0x02` byte if the `y`-coordinate is the lexicographically largest of the two associated with the `x`-coordinate.
* Otherwise the first byte is a `0x03`.

This prefix is followed by the `x`-coordinate.

Public Keys are not used to reference accounts (or users) and in general are not used when composing transaction messages (with few exceptions: `MsgCreateValidator`, `Validator` and `Multisig` messages).
For user interactions, `PubKey` is formatted using Protobufs JSON ([ProtoMarshalJSON](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/codec/json.go#L14-L34) function). Example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/output.go#L23-L39
```

## Keyring

A `Keyring` is an object that stores and manages accounts. In the Cosmos SDK, a `Keyring` implementation follows the `Keyring` interface:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/keyring.go#L54-L101
```

The default implementation of `Keyring` comes from the third-party [`99designs/keyring`](https://github.com/99designs/keyring) library.

A few notes on the `Keyring` methods:

* `Sign(uid string, msg []byte) ([]byte, types.PubKey, error)` strictly deals with the signature of the `msg` bytes. You must prepare and encode the transaction into a canonical `[]byte` form. Because protobuf is not deterministic, it has been decided in [ADR-020](../../integrate/architecture/adr-020-protobuf-transaction-encoding.md) that the canonical `payload` to sign is the `SignDoc` struct, deterministically encoded using [ADR-027](../../integrate/architecture/adr-027-deterministic-protobuf-serialization.md). Note that signature verification is not implemented in the Cosmos SDK by default, it is deferred to the [`anteHandler`](../advanced-concepts/00-baseapp.md#antehandler).

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L48-L65
```

* `NewAccount(uid, mnemonic, bip39Passphrase, hdPath string, algo SignatureAlgo) (*Record, error)` creates a new account based on the [`bip44 path`](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) and persists it on disk. The `PrivKey` is **never stored unencrypted**, instead it is [encrypted with a passphrase](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/armor.go) before being persisted. In the context of this method, the key type and sequence number refer to the segment of the BIP44 derivation path (for example, `0`, `1`, `2`, ...) that is used to derive a private and a public key from the mnemonic. Using the same mnemonic and derivation path, the same `PrivKey`, `PubKey` and `Address` is generated. The following keys are supported by the keyring:

* `secp256k1`
* `ed25519`

* `ExportPrivKeyArmor(uid, encryptPassphrase string) (armor string, err error)` exports a private key in ASCII-armored encrypted format using the given passphrase. You can then either import the private key again into the keyring using the `ImportPrivKey(uid, armor, passphrase string)` function or decrypt it into a raw private key using the `UnarmorDecryptPrivKey(armorStr string, passphrase string)` function.

### Create New Key Type

To create a new key type for using in keyring, `keyring.SignatureAlgo` interface must be fulfilled.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/signing_algorithms.go#L10-L15
```

The interface consists in three methods where `Name()` returns the name of the algorithm as a `hd.PubKeyType` and `Derive()` and `Generate()` must return the following functions respectively:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/hd/algo.go#L28-L31
```
Once the `keyring.SignatureAlgo` has been implemented it must be added to the [list of supported algos](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/keyring.go#L217) of the keyring.

For simplicity the implementation of a new key type should be done inside the `crypto/hd` package.
There is an example of a working `secp256k1` implementation in [algo.go](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/hd/algo.go#L38).


#### Implementing secp256r1 algo

Here is an example of how secp256r1 could be implemented.

First a new function to create a private key from a secret number is needed in the secp256r1 package. This function could look like this:

```go
// cosmos-sdk/crypto/keys/secp256r1/privkey.go

// NewPrivKeyFromSecret creates a private key derived for the secret number
// represented in big-endian. The `secret` must be a valid ECDSA field element.
func NewPrivKeyFromSecret(secret []byte) (*PrivKey, error) {
	var d = new(big.Int).SetBytes(secret)
	if d.Cmp(secp256r1.Params().N) >= 1 {
		return nil, errorsmod.Wrap(errors.ErrInvalidRequest, "secret not in the curve base field")
	}
	sk := new(ecdsa.PrivKey)
	return &PrivKey{&ecdsaSK{*sk}}, nil
}
```

After that `secp256r1Algo` can be implemented.

```go
// cosmos-sdk/crypto/hd/secp256r1Algo.go

package hd

import (
	"github.com/cosmos/go-bip39"
	
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256r1"
	"github.com/cosmos/cosmos-sdk/crypto/types"
)

// Secp256r1Type uses the secp256r1 ECDSA parameters.
const Secp256r1Type = PubKeyType("secp256r1")

var Secp256r1 = secp256r1Algo{}

type secp256r1Algo struct{}

func (s secp256r1Algo) Name() PubKeyType {
	return Secp256r1Type
}

// Derive derives and returns the secp256r1 private key for the given seed and HD path.
func (s secp256r1Algo) Derive() DeriveFn {
	return func(mnemonic string, bip39Passphrase, hdPath string) ([]byte, error) {
		seed, err := bip39.NewSeedWithErrorChecking(mnemonic, bip39Passphrase)
		if err != nil {
			return nil, err
		}

		masterPriv, ch := ComputeMastersFromSeed(seed)
		if len(hdPath) == 0 {
			return masterPriv[:], nil
		}
		derivedKey, err := DerivePrivateKeyForPath(masterPriv, ch, hdPath)

		return derivedKey, err
	}
}

// Generate generates a secp256r1 private key from the given bytes.
func (s secp256r1Algo) Generate() GenerateFn {
	return func(bz []byte) types.PrivKey {
		key, err := secp256r1.NewPrivKeyFromSecret(bz)
		if err != nil {
			panic(err)
		}
		return key
	}
}
```

Finally, the algo must be added to the list of [supported algos](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/crypto/keyring/keyring.go#L217) by the keyring.

```go
// cosmos-sdk/crypto/keyring/keyring.go

func newKeystore(kr keyring.Keyring, cdc codec.Codec, backend string, opts ...Option) keystore {
	// Default options for keybase, these can be overwritten using the
	// Option function
	options := Options{
		SupportedAlgos:       SigningAlgoList{hd.Secp256k1, hd.Secp256r1}, // added here
		SupportedAlgosLedger: SigningAlgoList{hd.Secp256k1},
	}
...
```

Hereafter to create new keys using your algo, you must specify it with the flag `--algo` :

`simd keys add myKey --algo secp256r1`