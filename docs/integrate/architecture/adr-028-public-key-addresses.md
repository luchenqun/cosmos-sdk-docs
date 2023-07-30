# ADR 028: 公钥地址

## 更新日志

* 2020/08/18: 初始版本
* 2021/01/15: 分析和算法更新

## 状态

建议中

## 摘要

本ADR定义了适用于所有可寻址的Cosmos SDK账户的地址格式。这包括：新的公钥算法、多重签名公钥和模块账户。

## 背景

问题[\#3685](https://github.com/cosmos/cosmos-sdk/issues/3685)指出，公钥地址空间目前存在重叠。我们确认这严重降低了Cosmos SDK的安全性。

### 问题

攻击者可以控制地址生成函数的输入。这导致了生日攻击，严重降低了安全空间。为了克服这个问题，我们需要将不同类型账户的输入分开：一个账户类型的安全性破坏不应影响其他账户类型的安全性。

### 初始提案

一个初始提案是扩展地址长度，并为不同类型的地址添加前缀。

@ethanfrey解释了一个曾在https://github.com/iov-one/weave中使用的替代方法：

> 在构建weave时，我花了很多时间思考这个问题...另一个cosmos Sdk。基本上，我将条件定义为一种类型，并以可读的字符串格式附加一些二进制数据。这个条件被哈希成一个地址（再次为20字节）。使用这个前缀使得无法找到一个具有不同条件的给定地址的原像（例如ed25519与secp256k1）。
> 这在这里有详细解释https://weave.readthedocs.io/en/latest/design/permissions.html
> 代码在这里，主要看我们处理条件的顶部。https://github.com/iov-one/weave/blob/master/conditions.go

并解释了这种方法应该具有足够的碰撞抗性：

> 是的，据我所知，当原像是唯一的且不可塑时，20字节应该具有碰撞抗性。在2^160的空间中，预计在2^80个元素（生日悖论）左右会出现一些碰撞。如果你想为数据库中的某个现有元素找到一个碰撞，仍然是2^160。只有当原像中没有不同类型信息时（在哈希成地址之前），才会出现这个问题。
> 如果20字节空间对安全性是一个实际问题，我希望听到一个论点，因为我很乐意在weave中增加我的地址大小。我只是觉得cosmos、ethereum和bitcoin都使用了20字节，应该足够好了。而且上面的论点让我觉得它是安全的。但我没有进行更深入的分析。

这导致了第一个提案（我们证明不够好）：我们将一个密钥类型与一个公钥连接起来，对其进行哈希处理，并取该哈希的前20个字节，简称为`sha256(keyTypePrefix || keybytes)[:20]`。

### 回顾和讨论

在 [\#5694](https://github.com/cosmos/cosmos-sdk/issues/5694) 中，我们讨论了各种解决方案。我们一致认为20个字节不具备未来的可扩展性，扩展地址长度是允许不同类型地址、不同签名类型等的唯一方法。这使得最初的提案不合格。

在该问题中，我们讨论了各种修改：

* 哈希函数的选择。
* 将前缀移出哈希函数：`keyTypePrefix + sha256(keybytes)[:20]` [post-hash-prefix-proposal]。
* 使用双重哈希：`sha256(keyTypePrefix + sha256(keybytes)[:20])`。
* 将密钥字节哈希切片从20字节增加到32或40字节。我们得出结论，由良好的哈希函数生成的32字节是未来可靠的。

### 要求

* 支持当前使用的工具 - 我们不希望破坏生态系统，或者增加长时间的适应期。参考：https://github.com/cosmos/cosmos-sdk/issues/8041
* 尽量保持地址长度较小 - 地址在状态中被广泛使用，既作为键的一部分，也作为对象值的一部分。

### 范围

此 ADR 仅定义了生成地址字节的过程。对于与地址的最终用户交互（通过 API、CLI 等），我们仍然使用 bech32 将这些地址格式化为字符串。此 ADR 不会改变这一点。
使用 Bech32 进行字符串编码为我们提供了对校验和错误代码的支持以及处理用户输入错误的能力。

## 决策

我们定义了以下账户类型，并为其定义了地址函数：

1. 简单账户：由常规公钥表示（例如：secp256k1、sr25519）
2. 简单多签：由其他可寻址对象组成的账户（例如：简单多签）
3. 由本地地址密钥组成的组合账户（例如：bls、组模块账户）
4. 模块账户：基本上是任何不能签署交易且由模块内部管理的账户

### 传统公钥地址不会改变

目前（2021年1月），官方仅支持 Cosmos SDK 用户账户的是 `secp256k1` 基本账户和传统的 amino 多签账户。
它们用于现有的 Cosmos SDK 区域。它们使用以下地址格式：

* secp256k1：`ripemd160(sha256(pk_bytes))[:20]`
* 传统的 amino 多签：`sha256(aminoCdc.Marshal(pk))[:20]`

我们不希望改变现有的地址。因此，这两种密钥类型的地址将保持不变。

当前的多签公钥使用 amino 序列化来生成地址。我们将保留这些公钥及其地址格式，并在协议缓冲区中称之为“传统的 amino”多签公钥。我们还将创建不带 amino 地址的多签公钥，下面将对其进行描述。

### 哈希函数选择

与 Cosmos SDK 的其他部分一样，我们将使用 `sha256`。

### 基本地址

我们首先定义一个用于生成地址的基本算法，我们将其称为 `Hash`。值得注意的是，它用于由单个密钥对表示的账户。对于每个公钥模式，我们必须有一个关联的 `typ` 字符串，下一节将对其进行解释。`hash` 是前一节中定义的密码哈希函数。

```go
const A_LEN = 32

func Hash(typ string, key []byte) []byte {
    return hash(hash(typ) + key)[:A_LEN]
}
```

`+` 是字节串连接符，不使用任何分隔符。

这个算法是与专业密码学家进行磋商会议的结果。
动机：该算法使地址保持相对较小（`typ` 的长度不会影响最终地址的长度），并且比 [post-hash-prefix-proposal] 更安全（后者使用公钥哈希的前20个字节，显著减小了地址空间）。
此外，密码学家还提出了在哈希中添加 `typ` 的选择，以防止切换表攻击。

`address.Hash` 是一个用于为新的密钥类型生成 _基本_ 地址的低级函数。示例：

* BLS：`address.Hash("bls", pubkey)`

### 组合地址

对于简单的组合账户（例如新的简单多签账户），我们将 `address.Hash` 进行了泛化。通过递归地为子账户创建地址，对地址进行排序并将它们组合成一个单一的地址。这确保了密钥的排序不会影响最终的地址。

```go
// We don't need a PubKey interface - we need anything which is addressable.
type Addressable interface {
    Address() []byte
}

func Composed(typ string, subaccounts []Addressable) []byte {
    addresses = map(subaccounts, \a -> LengthPrefix(a.Address()))
    addresses = sort(addresses)
    return address.Hash(typ, addresses[0] + ... + addresses[n])
}
```

`typ`参数应该是一个模式描述符，包含所有重要的属性，并具有确定性序列化（例如：utf8字符串）。
`LengthPrefix`是一个函数，它在地址前面添加1个字节。该字节的值是在添加前的地址位的长度。地址的长度最多为255位。
我们使用`LengthPrefix`来消除冲突 - 它确保对于两个地址列表：`as = {a1, a2, ..., an}`和`bs = {b1, b2, ..., bm}`，其中每个`bi`和`ai`最多为255位长，`concatenate(map(as, (a) => LengthPrefix(a))) = map(bs, (b) => LengthPrefix(b))`如果`as = bs`。

实现提示：账户实现应该缓存地址。

#### 多重签名地址

对于新的多重签名公钥，我们不基于任何编码方案（amino或protobuf）来定义`typ`参数。这避免了编码方案中的非确定性问题。

示例：

```protobuf
package cosmos.crypto.multisig;

message PubKey {
  uint32 threshold = 1;
  repeated google.protobuf.Any pubkeys = 2;
}
```

```go
func (multisig PubKey) Address() {
	// first gather all nested pub keys
	var keys []address.Addressable  // cryptotypes.PubKey implements Addressable
	for _, _key := range multisig.Pubkeys {
		keys = append(keys, key.GetCachedValue().(cryptotypes.PubKey))
	}

	// form the type from the message name (cosmos.crypto.multisig.PubKey) and the threshold joined together
	prefix := fmt.Sprintf("%s/%d", proto.MessageName(multisig), multisig.Threshold)

	// use the Composed function defined above
	return address.Composed(prefix, keys)
}
```


### 派生地址

我们必须能够从一个地址派生出另一个地址。派生过程必须保证哈希属性，因此我们使用已定义的`Hash`函数：

```go
func Derive(address, derivationKey []byte) []byte {
	return Hash(addres, derivationKey)
}
```

### 模块账户地址

模块账户将具有`"module"`类型。模块账户可以有子账户。子模块账户将根据模块名称和派生密钥序列创建。通常，第一个派生密钥应该是派生账户的类别。派生过程有一个定义好的顺序：模块名称，子模块密钥，子子模块密钥... 使用以下方式创建示例模块账户：

```go
address.Module(moduleName, key)
```

使用以下方式创建示例子模块账户：

```go
groupPolicyAddresses := []byte{1}
address.Module(moduleName, groupPolicyAddresses, policyID)
```

`address.Module`函数使用`address.Hash`，类型参数为`"module"`，以及模块名称的字节表示与子模块密钥连接起来。最后两个组件必须唯一分隔，以避免潜在的冲突（例如：modulename="ab"和submodulekey="bc"将具有与modulename="a"和submodulekey="bbc"相同的派生密钥）。我们使用空字节（`'\x00'`）来将模块名称与子模块密钥分隔开。这是可行的，因为空字节不是有效模块名称的一部分。最后，通过递归应用`Derive`函数来创建子子模块账户。
我们也可以在第一步中使用`Derive`函数（而不是将模块名称与零字节和子模块密钥连接起来）。我们决定进行连接以避免一级派生并加快计算速度。

为了与现有的 `authtypes.NewModuleAddress` 向后兼容，我们在 `Module` 函数中添加了一个特殊情况：当没有提供派生密钥时，我们回退到“传统”的实现。

```go
func Module(moduleName string, derivationKeys ...[]byte) []byte{
	if len(derivationKeys) == 0 {
		return authtypes.NewModuleAddress(modulenName)  // legacy case
	}
	submoduleAddress := Hash("module", []byte(moduleName) + 0 + key)
	return fold((a, k) => Derive(a, k), subsubKeys, submoduleAddress)
}
```

**示例 1**  一个借贷 BTC 池地址可以是：

```go
btcPool := address.Module("lending", btc.Address()})
```

如果我们想要为一个依赖于多个密钥的模块账户创建一个地址，我们可以将它们连接起来：

```go
btcAtomAMM := address.Module("amm", btc.Address() + atom.Address()})
```

**示例 2**  一个智能合约地址可以构建如下：

```go
smartContractAddr = Module("mySmartContractVM", smartContractsNamespace, smartContractKey})

// which equals to:
smartContractAddr = Derived(
    Module("mySmartContractVM", smartContractsNamespace), 
    []{smartContractKey})
```

### Schema 类型

在 `Hash` 函数中使用的 `typ` 参数应该对于每个账户类型是唯一的。
由于所有 Cosmos SDK 账户类型都被序列化在状态中，我们建议使用 protobuf 消息名称字符串。

示例：所有公钥类型都有一个类似于以下的唯一 protobuf 消息类型：

```protobuf
package cosmos.crypto.sr25519;

message PubKey {
	bytes key = 1;
}
```

所有 protobuf 消息都有唯一的完全限定名称，在这个示例中是 `cosmos.crypto.sr25519.PubKey`。
这些名称直接从 .proto 文件中派生，并以标准化的方式在其他地方使用，比如 `Any` 中的类型 URL。我们可以使用 `proto.MessageName(msg)` 轻松获取名称。

## 结果

### 向后兼容性

这个 ADR 与 Cosmos SDK 存储库中提交的内容兼容，并得到直接支持。

### 积极影响

* 为新的公钥、复杂账户和模块生成地址的简单算法
* 该算法概括了“本地组合密钥”
* 增加了地址的安全性和冲突抵抗能力
* 这种方法在未来的用例中是可扩展的 - 只要它们不与此处指定的地址长度（20 或 32 字节）冲突，可以使用其他地址类型。
* 支持新的账户类型。

### 负面影响

* 地址不会传达密钥类型，前缀方法可以做到这一点
* 地址长度增加了 60%，将占用更多的存储空间
* 需要重构 KVStore 存储键以处理可变长度的地址

### 中性

* protobuf 消息名称被用作键类型前缀

## 进一步讨论

一些账户可以有一个固定的名称，或者可以以其他方式构建（例如：模块）。我们正在讨论一个预定义名称的账户的想法（例如：`me.regen`），这个账户可以被机构使用。
不详细讨论，只要这些地址的长度不相同，这些特殊账户地址与此处描述的基于哈希的地址是兼容的。
更具体地说，任何特殊账户地址的长度不能等于20或32字节。

## 附录：咨询会议

2020年12月底，我们与[Alan Szepieniec](https://scholar.google.be/citations?user=4LyZn8oAAAAJ&hl=en)进行了一次会议，咨询了上述方法。

Alan的一般观察：

* 我们不需要2次原像抗性
* 我们需要32字节的地址空间来进行碰撞抗性
* 当攻击者可以控制一个带有地址的对象的输入时，我们就会遇到生日攻击的问题
* 哈希的智能合约存在问题
* sha2挖矿可以用来破解地址的原像

哈希算法

* 任何破解blake3的攻击都会破解blake2
* Alan对blake哈希算法的当前安全分析非常有信心。它是一个决赛选手，作者在安全分析领域很有名。

算法：

* Alan建议对前缀进行哈希：`address(pub_key) = hash(hash(key_type) + pub_key)[:32]`，主要好处：
    * 我们可以自由地使用任意长的前缀名称
    * 我们仍然不会有碰撞的风险
    * 切换表格
* 关于惩罚的讨论 -> 在哈希后添加前缀
* Aaron问到了后哈希前缀（`address(pub_key) = key_type + hash(pub_key)`）和区别。Alan指出，这种方法具有更长的地址空间，并且更强大。

复杂/组合密钥的算法：

* 使用相同算法合并类似树状的地址是可以的

模块地址：模块地址是否应该具有不同的大小以区分它们？

* 我们需要为模块地址设置一个前像前缀，以保持它们在32字节空间中：`hash(hash('module') + module_key)`
* Aaron观察：我们已经需要处理可变长度（以不破坏secp256k1密钥）。

关于零知识证明的算术哈希函数的讨论

* Posseidon / Rescue
* 问题：由于我们对算术构造的密码分析技术和历史了解有限，风险更大。这仍然是一个新的领域，正在积极研究中。

后量子签名大小

* Alan建议：Falcon：速度/大小比例非常好。
* Aaron - 我们应该考虑吗？
  Alan：根据早期推测，这个东西将在2050年能够破解椭圆曲线密码学。但是这有很多不确定性。但是递归/链接/模拟中有一些神奇的事情发生，可以加快进展。

其他想法

* 假设我们对于两个不同的用例使用相同的密钥和两种不同的地址算法。这样使用还安全吗？Alan：如果我们想隐藏公钥（这不是我们的用例），那么安全性会降低，但是有解决方法。

### 参考资料

* [笔记](https://hackmd.io/_NGWI4xZSbKzj1BkCqyZMw)


# ADR 028: Public Key Addresses

## Changelog

* 2020/08/18: Initial version
* 2021/01/15: Analysis and algorithm update

## Status

Proposed

## Abstract

This ADR defines an address format for all addressable Cosmos SDK accounts. That includes: new public key algorithms, multisig public keys, and module accounts.

## Context

Issue [\#3685](https://github.com/cosmos/cosmos-sdk/issues/3685) identified that public key
address spaces are currently overlapping. We confirmed that it significantly decreases security of Cosmos SDK.

### Problem

An attacker can control an input for an address generation function. This leads to a birthday attack, which significantly decreases the security space.
To overcome this, we need to separate the inputs for different kind of account types:
a security break of one account type shouldn't impact the security of other account types.

### Initial proposals

One initial proposal was extending the address length and
adding prefixes for different types of addresses.

@ethanfrey explained an alternate approach originally used in https://github.com/iov-one/weave:

> I spent quite a bit of time thinking about this issue while building weave... The other cosmos Sdk.
> Basically I define a condition to be a type and format as human readable string with some binary data appended. This condition is hashed into an Address (again at 20 bytes). The use of this prefix makes it impossible to find a preimage for a given address with a different condition (eg ed25519 vs secp256k1).
> This is explained in depth here https://weave.readthedocs.io/en/latest/design/permissions.html
> And the code is here, look mainly at the top where we process conditions. https://github.com/iov-one/weave/blob/master/conditions.go

And explained how this approach should be sufficiently collision resistant:

> Yeah, AFAIK, 20 bytes should be collision resistance when the preimages are unique and not malleable. A space of 2^160 would expect some collision to be likely around 2^80 elements (birthday paradox). And if you want to find a collision for some existing element in the database, it is still 2^160. 2^80 only is if all these elements are written to state.
> The good example you brought up was eg. a public key bytes being a valid public key on two algorithms supported by the codec. Meaning if either was broken, you would break accounts even if they were secured with the safer variant. This is only as the issue when no differentiating type info is present in the preimage (before hashing into an address).
> I would like to hear an argument if the 20 bytes space is an actual issue for security, as I would be happy to increase my address sizes in weave. I just figured cosmos and ethereum and bitcoin all use 20 bytes, it should be good enough. And the arguments above which made me feel it was secure. But I have not done a deeper analysis.

This led to the first proposal (which we proved to be not good enough):
we concatenate a key type with a public key, hash it and take the first 20 bytes of that hash, summarized as `sha256(keyTypePrefix || keybytes)[:20]`.

### Review and Discussions

In [\#5694](https://github.com/cosmos/cosmos-sdk/issues/5694) we discussed various solutions.
We agreed that 20 bytes it's not future proof, and extending the address length is the only way to allow addresses of different types, various signature types, etc.
This disqualifies the initial proposal.

In the issue we discussed various modifications:

* Choice of the hash function.
* Move the prefix out of the hash function: `keyTypePrefix + sha256(keybytes)[:20]` [post-hash-prefix-proposal].
* Use double hashing: `sha256(keyTypePrefix + sha256(keybytes)[:20])`.
* Increase to keybytes hash slice from 20 byte to 32 or 40 bytes. We concluded that 32 bytes, produced by a good hash functions is future secure.

### Requirements

* Support currently used tools - we don't want to break an ecosystem, or add a long adaptation period. Ref: https://github.com/cosmos/cosmos-sdk/issues/8041
* Try to keep the address length small - addresses are widely used in state, both as part of a key and object value.

### Scope

This ADR only defines a process for the generation of address bytes. For end-user interactions with addresses (through the API, or CLI, etc.), we still use bech32 to format these addresses as strings. This ADR doesn't change that.
Using Bech32 for string encoding gives us support for checksum error codes and handling of user typos.

## Decision

We define the following account types, for which we define the address function:

1. simple accounts: represented by a regular public key (ie: secp256k1, sr25519)
2. naive multisig: accounts composed by other addressable objects (ie: naive multisig)
3. composed accounts with a native address key (ie: bls, group module accounts)
4. module accounts: basically any accounts which cannot sign transactions and which are managed internally by modules

### Legacy Public Key Addresses Don't Change

Currently (Jan 2021), the only officially supported Cosmos SDK user accounts are `secp256k1` basic accounts and legacy amino multisig.
They are used in existing Cosmos SDK zones. They use the following address formats:

* secp256k1: `ripemd160(sha256(pk_bytes))[:20]`
* legacy amino multisig: `sha256(aminoCdc.Marshal(pk))[:20]`

We don't want to change existing addresses. So the addresses for these two key types will remain the same.

The current multisig public keys use amino serialization to generate the address. We will retain
those public keys and their address formatting, and call them "legacy amino" multisig public keys
in protobuf. We will also create multisig public keys without amino addresses to be described below.

### Hash Function Choice

As in other parts of the Cosmos SDK, we will use `sha256`.

### Basic Address

We start with defining a base algorithm for generating addresses which we will call `Hash`. Notably, it's used for accounts represented by a single key pair. For each public key schema we have to have an associated `typ` string, explained in the next section. `hash` is the cryptographic hash function defined in the previous section.

```go
const A_LEN = 32

func Hash(typ string, key []byte) []byte {
    return hash(hash(typ) + key)[:A_LEN]
}
```

The `+` is bytes concatenation, which doesn't use any separator.

This algorithm is the outcome of a consultation session with a professional cryptographer.
Motivation: this algorithm keeps the address relatively small (length of the `typ` doesn't impact the length of the final address)
and it's more secure than [post-hash-prefix-proposal] (which uses the first 20 bytes of a pubkey hash, significantly reducing the address space).
Moreover the cryptographer motivated the choice of adding `typ` in the hash to protect against a switch table attack.

`address.Hash` is a low level function to generate _base_ addresses for new key types. Example:

* BLS: `address.Hash("bls", pubkey)`

### Composed Addresses

For simple composed accounts (like a new naive multisig) we generalize the `address.Hash`. The address is constructed by recursively creating addresses for the sub accounts, sorting the addresses and composing them into a single address. It ensures that the ordering of keys doesn't impact the resulting address.

```go
// We don't need a PubKey interface - we need anything which is addressable.
type Addressable interface {
    Address() []byte
}

func Composed(typ string, subaccounts []Addressable) []byte {
    addresses = map(subaccounts, \a -> LengthPrefix(a.Address()))
    addresses = sort(addresses)
    return address.Hash(typ, addresses[0] + ... + addresses[n])
}
```

The `typ` parameter should be a schema descriptor, containing all significant attributes with deterministic serialization (eg: utf8 string).
`LengthPrefix` is a function which prepends 1 byte to the address. The value of that byte is the length of the address bits before prepending. The address must be at most 255 bits long.
We are using `LengthPrefix` to eliminate conflicts - it assures, that for 2 lists of addresses: `as = {a1, a2, ..., an}` and `bs = {b1, b2, ..., bm}` such that every `bi` and `ai` is at most 255 long, `concatenate(map(as, (a) => LengthPrefix(a))) = map(bs, (b) => LengthPrefix(b))` if `as = bs`.

Implementation Tip: account implementations should cache addresses.

#### Multisig Addresses

For a new multisig public keys, we define the `typ` parameter not based on any encoding scheme (amino or protobuf). This avoids issues with non-determinism in the encoding scheme.

Example:

```protobuf
package cosmos.crypto.multisig;

message PubKey {
  uint32 threshold = 1;
  repeated google.protobuf.Any pubkeys = 2;
}
```

```go
func (multisig PubKey) Address() {
	// first gather all nested pub keys
	var keys []address.Addressable  // cryptotypes.PubKey implements Addressable
	for _, _key := range multisig.Pubkeys {
		keys = append(keys, key.GetCachedValue().(cryptotypes.PubKey))
	}

	// form the type from the message name (cosmos.crypto.multisig.PubKey) and the threshold joined together
	prefix := fmt.Sprintf("%s/%d", proto.MessageName(multisig), multisig.Threshold)

	// use the Composed function defined above
	return address.Composed(prefix, keys)
}
```


### Derived Addresses

We must be able to cryptographically derive one address from another one. The derivation process must guarantee hash properties, hence we use the already defined `Hash` function:

```go
func Derive(address, derivationKey []byte) []byte {
	return Hash(addres, derivationKey)
}
```

### Module Account Addresses

A module account will have `"module"` type. Module accounts can have sub accounts. The submodule account will be created based on module name, and sequence of derivation keys. Typically, the first derivation key should be a class of the derived accounts. The derivation process has a defined order: module name, submodule key, subsubmodule key... An example module account is created using:

```go
address.Module(moduleName, key)
```

An example sub-module account is created using:

```go
groupPolicyAddresses := []byte{1}
address.Module(moduleName, groupPolicyAddresses, policyID)
```

The `address.Module` function is using `address.Hash` with `"module"` as the type argument, and byte representation of the module name concatenated with submodule key. The two last component must be uniquely separated to avoid potential clashes (example: modulename="ab" & submodulekey="bc" will have the same derivation key as modulename="a" & submodulekey="bbc").
We use a null byte (`'\x00'`) to separate module name from the submodule key. This works, because null byte is not a part of a valid module name. Finally, the sub-submodule accounts are created by applying the `Derive` function recursively.
We could use `Derive` function also in the first step (rather than concatenating module name with zero byte and the submodule key). We decided to do concatenation to avoid one level of derivation and speed up computation.

For backward compatibility with the existing `authtypes.NewModuleAddress`, we add a special case in `Module` function: when no derivation key is provided, we fallback to the "legacy" implementation. 

```go
func Module(moduleName string, derivationKeys ...[]byte) []byte{
	if len(derivationKeys) == 0 {
		return authtypes.NewModuleAddress(modulenName)  // legacy case
	}
	submoduleAddress := Hash("module", []byte(moduleName) + 0 + key)
	return fold((a, k) => Derive(a, k), subsubKeys, submoduleAddress)
}
```

**Example 1**  A lending BTC pool address would be:

```go
btcPool := address.Module("lending", btc.Address()})
```

If we want to create an address for a module account depending on more than one key, we can concatenate them:

```go
btcAtomAMM := address.Module("amm", btc.Address() + atom.Address()})
```

**Example 2**  a smart-contract address could be constructed by:

```go
smartContractAddr = Module("mySmartContractVM", smartContractsNamespace, smartContractKey})

// which equals to:
smartContractAddr = Derived(
    Module("mySmartContractVM", smartContractsNamespace), 
    []{smartContractKey})
```

### Schema Types

A `typ` parameter used in `Hash` function SHOULD be unique for each account type.
Since all Cosmos SDK account types are serialized in the state, we propose to use the protobuf message name string.

Example: all public key types have a unique protobuf message type similar to:

```protobuf
package cosmos.crypto.sr25519;

message PubKey {
	bytes key = 1;
}
```

All protobuf messages have unique fully qualified names, in this example `cosmos.crypto.sr25519.PubKey`.
These names are derived directly from .proto files in a standardized way and used
in other places such as the type URL in `Any`s. We can easily obtain the name using
`proto.MessageName(msg)`.

## Consequences

### Backwards Compatibility

This ADR is compatible with what was committed and directly supported in the Cosmos SDK repository.

### Positive

* a simple algorithm for generating addresses for new public keys, complex accounts and modules
* the algorithm generalizes _native composed keys_
* increased security and collision resistance of addresses
* the approach is extensible for future use-cases - one can use other address types, as long as they don't conflict with the address length specified here (20 or 32 bytes).
* support new account types.

### Negative

* addresses do not communicate key type, a prefixed approach would have done this
* addresses are 60% longer and will consume more storage space
* requires a refactor of KVStore store keys to handle variable length addresses

### Neutral

* protobuf message names are used as key type prefixes

## Further Discussions

Some accounts can have a fixed name or may be constructed in other way (eg: modules). We were discussing an idea of an account with a predefined name (eg: `me.regen`), which could be used by institutions.
Without going into details, these kinds of addresses are compatible with the hash based addresses described here as long as they don't have the same length.
More specifically, any special account address must not have a length equal to 20 or 32 bytes.

## Appendix: Consulting session

End of Dec 2020 we had a session with [Alan Szepieniec](https://scholar.google.be/citations?user=4LyZn8oAAAAJ&hl=en) to consult the approach presented above.

Alan general observations:

* we don’t need 2-preimage resistance
* we need 32bytes address space for collision resistance
* when an attacker can control an input for object with an address then we have a problem with birthday attack
* there is an issue with smart-contracts for hashing
* sha2 mining can be use to breaking address pre-image

Hashing algorithm

* any attack breaking blake3 will break blake2
* Alan is pretty confident about the current security analysis of the blake hash algorithm. It was a finalist, and the author is well known in security analysis.

Algorithm:

* Alan recommends to hash the prefix: `address(pub_key) = hash(hash(key_type) + pub_key)[:32]`, main benefits:
    * we are free to user arbitrary long prefix names
    * we still don’t risk collisions
    * switch tables
* discussion about penalization -> about adding prefix post hash
* Aaron asked about post hash prefixes (`address(pub_key) = key_type + hash(pub_key)`) and differences. Alan noted that this approach has longer address space and it’s stronger.

Algorithm for complex / composed keys:

* merging tree like addresses with same algorithm are fine

Module addresses: Should module addresses have different size to differentiate it?

* we will need to set a pre-image prefix for module addresse to keept them in 32-byte space: `hash(hash('module') + module_key)`
* Aaron observation: we already need to deal with variable length (to not break secp256k1 keys).

Discssion about arithmetic hash function for ZKP

* Posseidon / Rescue
* Problem: much bigger risk because we don’t know much techniques and history of crypto-analysis of arithmetic constructions. It’s still a new ground and area of active research.

Post quantum signature size

* Alan suggestion: Falcon: speed / size ration - very good.
* Aaron - should we think about it?
  Alan: based on early extrapolation this thing will get able to break EC cryptography in 2050 . But that’s a lot of uncertainty. But there is magic happening with recurions / linking / simulation and that can speedup the progress.

Other ideas

* Let’s say we use same key and two different address algorithms for 2 different use cases. Is it still safe to use it? Alan: if we want to hide the public key (which is not our use case), then it’s less secure but there are fixes.

### References

* [Notes](https://hackmd.io/_NGWI4xZSbKzj1BkCqyZMw)
