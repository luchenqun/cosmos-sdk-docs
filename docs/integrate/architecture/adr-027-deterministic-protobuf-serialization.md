# ADR 027: 确定性 Protobuf 序列化

## 变更日志

* 2020-08-07: 初始草稿
* 2020-09-01: 进一步澄清规则

## 状态

建议中

## 摘要

在签名消息时，需要完全确定的结构序列化，以适用于多种语言和客户端。我们需要确保无论在哪种支持的语言中序列化数据结构，原始字节都保持不变。[Protobuf](https://developers.google.com/protocol-buffers/docs/proto3) 序列化不是双射的（即对于给定的 Protobuf 文档，存在实际上无限数量的有效二进制表示）<sup>1</sup>。

本文档描述了一种确定性序列化方案，适用于一部分 Protobuf 文档，涵盖了这种用例，但也可以在其他情况下重用。

### 背景

在 Cosmos SDK 中进行签名验证时，签名者和验证者需要就 `SignDoc` 的相同序列化达成一致，如 [ADR-020](adr-020-protobuf-transaction-encoding.md) 中所定义，而无需传输序列化结果。

目前，对于区块签名，我们使用了一个变通方法：在客户端端创建一个新的 [TxRaw](https://github.com/cosmos/cosmos-sdk/blob/9e85e81e0e8140067dd893421290c191529c148c/proto/cosmos/tx/v1beta1/tx.proto#L30) 实例（如 [adr-020-protobuf-transaction-encoding](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-020-protobuf-transaction-encoding.md#transactions) 中所定义），通过将所有 [Tx](https://github.com/cosmos/cosmos-sdk/blob/9e85e81e0e8140067dd893421290c191529c148c/proto/cosmos/tx/v1beta1/tx.proto#L13) 字段转换为字节。这在发送和签名交易时增加了额外的手动步骤。

### 决策

其他 ADRs 应使用以下编码方案，特别是用于 `SignDoc` 的序列化。

## 规范

### 范围

本 ADR 定义了一个 Protobuf3 序列化器。输出是一个有效的 Protobuf 序列化，以便每个 Protobuf 解析器都可以解析。

由于定义确定性序列化的复杂性，版本 1 不支持映射。这可能会在将来发生变化。实现必须拒绝包含映射的文档作为无效输入。

### 背景 - Protobuf3 编码

在 protobuf3 中，大多数数值类型都被编码为[varints](https://developers.google.com/protocol-buffers/docs/encoding#varints)。Varints 最多占用 10 个字节，由于每个 varint 字节有 7 位数据，varints 是 `uint70`（70 位无符号整数）的一种表示。在编码时，数值会从其基本类型转换为 `uint70`，而在解码时，解析的 `uint70` 会转换为相应的数值类型。

符合 protobuf3 的 varint 的最大有效值是 `FF FF FF FF FF FF FF FF FF 7F`（即 `2**70 -1`）。如果字段类型是 `{,u,s}int64`，则在解码过程中会丢弃 70 位中的最高 6 位，引入了 6 位的可变性。如果字段类型是 `{,u,s}int32`，则在解码过程中会丢弃 70 位中的最高 38 位，引入了 38 位的可变性。

除了其他非确定性因素外，本 ADR 还消除了编码可变性的可能性。

### 序列化规则

序列化基于[protobuf3 编码](https://developers.google.com/protocol-buffers/docs/encoding)，并具有以下附加规则：

1. 字段必须按升序仅序列化一次
2. 不得添加额外的字段或任何额外的数据
3. 必须省略[默认值](https://developers.google.com/protocol-buffers/docs/proto3#default)
4. 标量数值类型的`repeated`字段必须使用[packed 编码](https://developers.google.com/protocol-buffers/docs/encoding#packed)
5. Varint 编码的长度不得超过所需长度：
    * 不得有尾随的零字节（在小端序中，即在大端序中不得有前导零）。根据上述第 3 条规则，默认值 `0` 必须被省略，因此此规则不适用于这种情况。
    * varint 的最大值必须为 `FF FF FF FF FF FF FF FF FF 01`。换句话说，解码时，70 位无符号整数的最高 6 位必须为 `0`。（10 字节的 varint 是 10 组 7 位，即 70 位，其中只有最低的 70-6=64 位是有用的。）
    * varint 编码中 32 位值的最大值必须为 `FF FF FF FF 0F`，有一个例外情况（下文）。换句话说，解码时，70 位无符号整数的最高 38 位必须为 `0`。
        * 上述规则的一个例外是 _负_ `int32`，必须使用完整的 10 个字节进行符号扩展<sup>2</sup>。
    * varint 编码中布尔值的最大值必须为 `01`（即它必须为 `0` 或 `1`）。根据上述第 3 条规则，默认值 `0` 必须被省略，因此如果包含布尔值，则其值必须为 `1`。

虽然规则1和2应该很直观，并描述了所有protobuf编码器的默认行为，但第3条规则更有趣。在protobuf3反序列化之后，无法区分未设置的字段和设置为默认值的字段<sup>3</sup>。然而，在序列化级别上，可以使用空值或完全省略字段来设置字段。这与JSON有很大的区别，因为属性可以为空（`""`，`0`），`null`或未定义，从而导致3个不同的文档。

省略设置为默认值的字段是有效的，因为解析器必须将默认值分配给序列化中缺失的字段<sup>4</sup>。对于标量类型，省略默认值是规范所要求的<sup>5</sup>。对于`repeated`字段，不序列化它们是表示空列表的唯一方法。枚举类型必须具有数值为0的第一个元素，这是默认值<sup>6</sup>。而消息字段默认为未设置<sup>7</sup>。

省略默认值允许一定程度的向前兼容性：使用较新版本的protobuf模式的用户生成与使用较旧版本的用户相同的序列化，只要新添加的字段未被使用（即设置为其默认值）。

### 实现

有三种主要的实现策略，按照自定义开发程度从低到高排序：

* **使用默认遵循上述规则的protobuf序列化器**。例如，[gogoproto](https://pkg.go.dev/github.com/cosmos/gogoproto/gogoproto)在大多数情况下都是兼容的，但在使用某些注释（如`nullable = false`）时可能不兼容。还可以配置现有的序列化器。
* **在编码之前对默认值进行规范化**。如果您的序列化器遵循规则1和2，并允许您明确取消设置序列化字段，您可以将默认值规范化为未设置。这可以在使用[protobuf.js](https://www.npmjs.com/package/protobufjs)时完成：

  ```js
  const bytes = SignDoc.encode({
    bodyBytes: body.length > 0 ? body : null, // normalize empty bytes to unset
    authInfoBytes: authInfo.length > 0 ? authInfo : null, // normalize empty bytes to unset
    chainId: chainId || null, // normalize "" to unset
    accountNumber: accountNumber || null, // normalize 0 to unset
    accountSequence: accountSequence || null, // normalize 0 to unset
  }).finish();
  ```

* **Use a hand-written serializer for the types you need.** If none of the above
  ways works for you, you can write a serializer yourself. For SignDoc this
  would look something like this in Go, building on existing protobuf utilities:

  ```go
  if !signDoc.body_bytes.empty() {
      buf.WriteUVarInt64(0xA) // wire type and field number for body_bytes
      buf.WriteUVarInt64(signDoc.body_bytes.length())
      buf.WriteBytes(signDoc.body_bytes)
  }

  if !signDoc.auth_info.empty() {
      buf.WriteUVarInt64(0x12) // wire type and field number for auth_info
      buf.WriteUVarInt64(signDoc.auth_info.length())
      buf.WriteBytes(signDoc.auth_info)
  }

  if !signDoc.chain_id.empty() {
      buf.WriteUVarInt64(0x1a) // wire type and field number for chain_id
      buf.WriteUVarInt64(signDoc.chain_id.length())
      buf.WriteBytes(signDoc.chain_id)
  }

  if signDoc.account_number != 0 {
      buf.WriteUVarInt64(0x20) // wire type and field number for account_number
      buf.WriteUVarInt(signDoc.account_number)
  }

  if signDoc.account_sequence != 0 {
      buf.WriteUVarInt64(0x28) // wire type and field number for account_sequence
      buf.WriteUVarInt(signDoc.account_sequence)
  }
  ```

### Test vectors

Given the protobuf definition `Article.proto`

```protobuf
package blog;
syntax = "proto3";

enum Type {
  UNSPECIFIED = 0;
  IMAGES = 1;
  NEWS = 2;
};

enum Review {
  UNSPECIFIED = 0;
  ACCEPTED = 1;
  REJECTED = 2;
};

message Article {
  string title = 1;
  string description = 2;
  uint64 created = 3;
  uint64 updated = 4;
  bool public = 5;
  bool promoted = 6;
  Type type = 7;
  Review review = 8;
  repeated string comments = 9;
  repeated string backlinks = 10;
};
```

serializing the values

```yaml
title: "世界需要改变 🌳"
description: ""
created: 1596806111080
updated: 0
public: true
promoted: false
type: Type.NEWS
review: Review.UNSPECIFIED
comments: ["不错", "谢谢"]
backlinks: []
```

must result in the serialization

```text
0a1b54686520776f726c64206e65656473206368616e676520f09f8cb318e8bebec8bc2e280138024a084e696365206f6e654a095468616e6b20796f75
```

When inspecting the serialized document, you see that every second field is
omitted:

```shell
$ echo 0a1b54686520776f726c64206e65656473206368616e676520f09f8cb318e8bebec8bc2e280138024a084e696365206f6e654a095468616e6b20796f75 | xxd -r -p | protoc --decode_raw
1: "世界需要改变 🌳"
3: 1596806111080
5: 1
7: 2
9: "不错"
9: "谢谢"
```

## 后果

有了这样的编码方式，我们可以在 Cosmos SDK 签名的上下文中获得确定性的序列化。

### 积极的

* 定义明确的规则，可以独立于参考实现进行验证
* 简单到足以降低实现交易签名的门槛
* 允许我们继续在 SignDoc 中使用 0 和其他空值，避免了对 0 序列的处理。这并不意味着不应该合并来自 https://github.com/cosmos/cosmos-sdk/pull/6949 的更改，但已经不太重要了。

### 消极的

* 在实现交易签名时，必须理解和实现上述编码规则。
* 第三条规则的需求给实现带来了一些复杂性。
* 一些数据结构可能需要自定义代码进行序列化。因此，代码不太可移植 - 每个实现序列化的客户端都需要额外的工作来正确处理自定义数据结构。

### 中立的

### 在 Cosmos SDK 中的使用

出于上述原因（“消极”部分），我们更倾向于保留共享数据结构的解决方法。例如：上述的 `TxRaw` 使用原始字节作为解决方法。这使得它们可以使用任何有效的 Protobuf 库，而无需实现符合此标准的自定义序列化器（以及相关的错误风险）。

## 参考资料

* <sup>1</sup> _当消息被序列化时，对于已知或未知字段的写入顺序没有保证。序列化顺序是实现细节，任何特定实现的细节可能会在将来发生变化。因此，协议缓冲区解析器必须能够以任何顺序解析字段。_ 来自 https://developers.google.com/protocol-buffers/docs/encoding#order
* <sup>2</sup> https://developers.google.com/protocol-buffers/docs/encoding#signed_integers
* <sup>3</sup> _请注意，对于标量消息字段，一旦解析了消息，就无法判断字段是否显式设置为默认值（例如，布尔值是否设置为 false）还是根本未设置：在定义消息类型时应该记住这一点。例如，如果不希望默认情况下也发生某些行为，请不要有一个布尔值，当设置为 false 时切换某些行为。_ 来自 https://developers.google.com/protocol-buffers/docs/proto3#default
* <sup>4</sup> _当解析消息时，如果编码的消息不包含特定的单个元素，则解析对象中的相应字段将设置为该字段的默认值。_ 来自 https://developers.google.com/protocol-buffers/docs/proto3#default
* <sup>5</sup> _还要注意，如果标量消息字段设置为其默认值，则该值不会在传输线上序列化。_ 来自 https://developers.google.com/protocol-buffers/docs/proto3#default
* <sup>6</sup> _对于枚举，其默认值是第一个定义的枚举值，必须为 0。_ 来自 https://developers.google.com/protocol-buffers/docs/proto3#default
* <sup>7</sup> _对于消息字段，该字段未设置。其确切值取决于语言。_ 来自 https://developers.google.com/protocol-buffers/docs/proto3#default
* 编码规则和部分推理取自 [canonical-proto3 Aaron Craelius](https://github.com/regen-network/canonical-proto3)

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


# ADR 027: Deterministic Protobuf Serialization

## Changelog

* 2020-08-07: Initial Draft
* 2020-09-01: Further clarify rules

## Status

Proposed

## Abstract

Fully deterministic structure serialization, which works across many languages and clients,
is needed when signing messages. We need to be sure that whenever we serialize
a data structure, no matter in which supported language, the raw bytes
will stay the same.
[Protobuf](https://developers.google.com/protocol-buffers/docs/proto3)
serialization is not bijective (i.e. there exist a practically unlimited number of
valid binary representations for a given protobuf document)<sup>1</sup>.

This document describes a deterministic serialization scheme for
a subset of protobuf documents, that covers this use case but can be reused in
other cases as well.

### Context

For signature verification in Cosmos SDK, the signer and verifier need to agree on
the same serialization of a `SignDoc` as defined in
[ADR-020](adr-020-protobuf-transaction-encoding.md) without transmitting the
serialization.

Currently, for block signatures we are using a workaround: we create a new [TxRaw](https://github.com/cosmos/cosmos-sdk/blob/9e85e81e0e8140067dd893421290c191529c148c/proto/cosmos/tx/v1beta1/tx.proto#L30)
instance (as defined in [adr-020-protobuf-transaction-encoding](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-020-protobuf-transaction-encoding.md#transactions))
by converting all [Tx](https://github.com/cosmos/cosmos-sdk/blob/9e85e81e0e8140067dd893421290c191529c148c/proto/cosmos/tx/v1beta1/tx.proto#L13)
fields to bytes on the client side. This adds an additional manual
step when sending and signing transactions.

### Decision

The following encoding scheme is to be used by other ADRs,
and in particular for `SignDoc` serialization.

## Specification

### Scope

This ADR defines a protobuf3 serializer. The output is a valid protobuf
serialization, such that every protobuf parser can parse it.

No maps are supported in version 1 due to the complexity of defining a
deterministic serialization. This might change in future. Implementations must
reject documents containing maps as invalid input.

### Background - Protobuf3 Encoding

Most numeric types in protobuf3 are encoded as
[varints](https://developers.google.com/protocol-buffers/docs/encoding#varints).
Varints are at most 10 bytes, and since each varint byte has 7 bits of data,
varints are a representation of `uint70` (70-bit unsigned integer). When
encoding, numeric values are casted from their base type to `uint70`, and when
decoding, the parsed `uint70` is casted to the appropriate numeric type.

The maximum valid value for a varint that complies with protobuf3 is
`FF FF FF FF FF FF FF FF FF 7F` (i.e. `2**70 -1`). If the field type is
`{,u,s}int64`, the highest 6 bits of the 70 are dropped during decoding,
introducing 6 bits of malleability. If the field type is `{,u,s}int32`, the
highest 38 bits of the 70 are dropped during decoding, introducing 38 bits of
malleability.

Among other sources of non-determinism, this ADR eliminates the possibility of
encoding malleability.

### Serialization rules

The serialization is based on the
[protobuf3 encoding](https://developers.google.com/protocol-buffers/docs/encoding)
with the following additions:

1. Fields must be serialized only once in ascending order
2. Extra fields or any extra data must not be added
3. [Default values](https://developers.google.com/protocol-buffers/docs/proto3#default)
   must be omitted
4. `repeated` fields of scalar numeric types must use
   [packed encoding](https://developers.google.com/protocol-buffers/docs/encoding#packed)
5. Varint encoding must not be longer than needed:
    * No trailing zero bytes (in little endian, i.e. no leading zeroes in big
      endian). Per rule 3 above, the default value of `0` must be omitted, so
      this rule does not apply in such cases.
    * The maximum value for a varint must be `FF FF FF FF FF FF FF FF FF 01`.
      In other words, when decoded, the highest 6 bits of the 70-bit unsigned
      integer must be `0`. (10-byte varints are 10 groups of 7 bits, i.e.
      70 bits, of which only the lowest 70-6=64 are useful.)
    * The maximum value for 32-bit values in varint encoding must be `FF FF FF FF 0F`
      with one exception (below). In other words, when decoded, the highest 38
      bits of the 70-bit unsigned integer must be `0`.
        * The one exception to the above is _negative_ `int32`, which must be
          encoded using the full 10 bytes for sign extension<sup>2</sup>.
    * The maximum value for Boolean values in varint encoding must be `01` (i.e.
      it must be `0` or `1`). Per rule 3 above, the default value of `0` must
      be omitted, so if a Boolean is included it must have a value of `1`.

While rule number 1. and 2. should be pretty straight forward and describe the
default behavior of all protobuf encoders the author is aware of, the 3rd rule
is more interesting. After a protobuf3 deserialization you cannot differentiate
between unset fields and fields set to the default value<sup>3</sup>. At
serialization level however, it is possible to set the fields with an empty
value or omitting them entirely. This is a significant difference to e.g. JSON
where a property can be empty (`""`, `0`), `null` or undefined, leading to 3
different documents.

Omitting fields set to default values is valid because the parser must assign
the default value to fields missing in the serialization<sup>4</sup>. For scalar
types, omitting defaults is required by the spec<sup>5</sup>. For `repeated`
fields, not serializing them is the only way to express empty lists. Enums must
have a first element of numeric value 0, which is the default<sup>6</sup>. And
message fields default to unset<sup>7</sup>.

Omitting defaults allows for some amount of forward compatibility: users of
newer versions of a protobuf schema produce the same serialization as users of
older versions as long as newly added fields are not used (i.e. set to their
default value).

### Implementation

There are three main implementation strategies, ordered from the least to the
most custom development:

* **Use a protobuf serializer that follows the above rules by default.** E.g.
  [gogoproto](https://pkg.go.dev/github.com/cosmos/gogoproto/gogoproto) is known to
  be compliant by in most cases, but not when certain annotations such as
  `nullable = false` are used. It might also be an option to configure an
  existing serializer accordingly.
* **Normalize default values before encoding them.** If your serializer follows
  rule 1. and 2. and allows you to explicitly unset fields for serialization,
  you can normalize default values to unset. This can be done when working with
  [protobuf.js](https://www.npmjs.com/package/protobufjs):

  ```js
  const bytes = SignDoc.encode({
    bodyBytes: body.length > 0 ? body : null, // normalize empty bytes to unset
    authInfoBytes: authInfo.length > 0 ? authInfo : null, // normalize empty bytes to unset
    chainId: chainId || null, // normalize "" to unset
    accountNumber: accountNumber || null, // normalize 0 to unset
    accountSequence: accountSequence || null, // normalize 0 to unset
  }).finish();
  ```

* **Use a hand-written serializer for the types you need.** If none of the above
  ways works for you, you can write a serializer yourself. For SignDoc this
  would look something like this in Go, building on existing protobuf utilities:

  ```go
  if !signDoc.body_bytes.empty() {
      buf.WriteUVarInt64(0xA) // wire type and field number for body_bytes
      buf.WriteUVarInt64(signDoc.body_bytes.length())
      buf.WriteBytes(signDoc.body_bytes)
  }

  if !signDoc.auth_info.empty() {
      buf.WriteUVarInt64(0x12) // wire type and field number for auth_info
      buf.WriteUVarInt64(signDoc.auth_info.length())
      buf.WriteBytes(signDoc.auth_info)
  }

  if !signDoc.chain_id.empty() {
      buf.WriteUVarInt64(0x1a) // wire type and field number for chain_id
      buf.WriteUVarInt64(signDoc.chain_id.length())
      buf.WriteBytes(signDoc.chain_id)
  }

  if signDoc.account_number != 0 {
      buf.WriteUVarInt64(0x20) // wire type and field number for account_number
      buf.WriteUVarInt(signDoc.account_number)
  }

  if signDoc.account_sequence != 0 {
      buf.WriteUVarInt64(0x28) // wire type and field number for account_sequence
      buf.WriteUVarInt(signDoc.account_sequence)
  }
  ```

### Test vectors

Given the protobuf definition `Article.proto`

```protobuf
package blog;
syntax = "proto3";

enum Type {
  UNSPECIFIED = 0;
  IMAGES = 1;
  NEWS = 2;
};

enum Review {
  UNSPECIFIED = 0;
  ACCEPTED = 1;
  REJECTED = 2;
};

message Article {
  string title = 1;
  string description = 2;
  uint64 created = 3;
  uint64 updated = 4;
  bool public = 5;
  bool promoted = 6;
  Type type = 7;
  Review review = 8;
  repeated string comments = 9;
  repeated string backlinks = 10;
};
```

serializing the values

```yaml
title: "The world needs change 🌳"
description: ""
created: 1596806111080
updated: 0
public: true
promoted: false
type: Type.NEWS
review: Review.UNSPECIFIED
comments: ["Nice one", "Thank you"]
backlinks: []
```

must result in the serialization

```text
0a1b54686520776f726c64206e65656473206368616e676520f09f8cb318e8bebec8bc2e280138024a084e696365206f6e654a095468616e6b20796f75
```

When inspecting the serialized document, you see that every second field is
omitted:

```shell
$ echo 0a1b54686520776f726c64206e65656473206368616e676520f09f8cb318e8bebec8bc2e280138024a084e696365206f6e654a095468616e6b20796f75 | xxd -r -p | protoc --decode_raw
1: "The world needs change \360\237\214\263"
3: 1596806111080
5: 1
7: 2
9: "Nice one"
9: "Thank you"
```

## Consequences

Having such an encoding available allows us to get deterministic serialization
for all protobuf documents we need in the context of Cosmos SDK signing.

### Positive

* Well defined rules that can be verified independent of a reference
  implementation
* Simple enough to keep the barrier to implement transaction signing low
* It allows us to continue to use 0 and other empty values in SignDoc, avoiding
  the need to work around 0 sequences. This does not imply the change from
  https://github.com/cosmos/cosmos-sdk/pull/6949 should not be merged, but not
  too important anymore.

### Negative

* When implementing transaction signing, the encoding rules above must be
  understood and implemented.
* The need for rule number 3. adds some complexity to implementations.
* Some data structures may require custom code for serialization. Thus
  the code is not very portable - it will require additional work for each
  client implementing serialization to properly handle custom data structures.

### Neutral

### Usage in Cosmos SDK

For the reasons mentioned above ("Negative" section) we prefer to keep workarounds
for shared data structure. Example: the aforementioned `TxRaw` is using raw bytes
as a workaround. This allows them to use any valid Protobuf library without
the need of implementing a custom serializer that adheres to this standard (and related risks of bugs).

## References

* <sup>1</sup> _When a message is serialized, there is no guaranteed order for
  how its known or unknown fields should be written. Serialization order is an
  implementation detail and the details of any particular implementation may
  change in the future. Therefore, protocol buffer parsers must be able to parse
  fields in any order._ from
  https://developers.google.com/protocol-buffers/docs/encoding#order
* <sup>2</sup> https://developers.google.com/protocol-buffers/docs/encoding#signed_integers
* <sup>3</sup> _Note that for scalar message fields, once a message is parsed
  there's no way of telling whether a field was explicitly set to the default
  value (for example whether a boolean was set to false) or just not set at all:
  you should bear this in mind when defining your message types. For example,
  don't have a boolean that switches on some behavior when set to false if you
  don't want that behavior to also happen by default._ from
  https://developers.google.com/protocol-buffers/docs/proto3#default
* <sup>4</sup> _When a message is parsed, if the encoded message does not
  contain a particular singular element, the corresponding field in the parsed
  object is set to the default value for that field._ from
  https://developers.google.com/protocol-buffers/docs/proto3#default
* <sup>5</sup> _Also note that if a scalar message field is set to its default,
  the value will not be serialized on the wire._ from
  https://developers.google.com/protocol-buffers/docs/proto3#default
* <sup>6</sup> _For enums, the default value is the first defined enum value,
  which must be 0._ from
  https://developers.google.com/protocol-buffers/docs/proto3#default
* <sup>7</sup> _For message fields, the field is not set. Its exact value is
  language-dependent._ from
  https://developers.google.com/protocol-buffers/docs/proto3#default
* Encoding rules and parts of the reasoning taken from
  [canonical-proto3 Aaron Craelius](https://github.com/regen-network/canonical-proto3)
