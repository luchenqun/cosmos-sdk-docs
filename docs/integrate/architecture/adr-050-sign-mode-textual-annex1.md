# ADR 050: SIGN_MODE_TEXTUAL: 附录 1 值渲染器

## 变更日志

* 2021年12月06日：初稿
* 2022年02月07日：由Ledger团队审核并确认概念
* 2022年12月01日：在任何标题屏幕上删除“Object:”前缀
* 2022年12月13日：当字节长度大于32时，对字节哈希进行签名
* 2023年03月27日：更新`Any`值渲染器以省略消息标题屏幕

## 状态

已接受。实施已开始。仍需完善小型值渲染器的细节。

## 摘要

本附录描述了值渲染器，用于以字符串数组的方式显示Protobuf值，使其对人类友好。

## 值渲染器

值渲染器描述了不同Protobuf类型的值应如何编码为字符串数组。值渲染器可以形式化为一组双射函数`func renderT(value T) []string`，其中`T`是此规范定义的以下Protobuf类型之一。

### Protobuf `number`

* 适用于：
    * Protobuf数值整数类型（`int{32,64}`，`uint{32,64}`，`sint{32,64}`，`fixed{32,64}`，`sfixed{32,64}`）
    * `customtype`为`github.com/cosmos/cosmos-sdk/types.Int`或`github.com/cosmos/cosmos-sdk/types.Dec`的字符串
    * `customtype`为`github.com/cosmos/cosmos-sdk/types.Int`或`github.com/cosmos/cosmos-sdk/types.Dec`的字节
* 始终删除尾部的十进制零
* 每三个整数位使用`'`进行格式化
* 使用`.`表示小数分隔符

#### 示例

* `1000`（uint64）-> `1'000`
* `"1000000.00"`（表示Dec的字符串）-> `1'000'000`
* `"1000000.10"`（表示Dec的字符串）-> `1'000'000.1`

### `coin`

* 适用于`cosmos.base.v1beta1.Coin`。
* 使用`Metadata`将Denoms转换为`display` Denoms（如果可用）。**这需要进行状态查询**。`Metadata`的定义可以在[bank protobuf definition](https://buf.build/cosmos/cosmos-sdk/docs/main:cosmos.bank.v1beta1#cosmos.bank.v1beta1.Metadata)中找到。如果`display`字段为空或nil，则不执行任何Denom转换。
* 将金额转换为`display` Denom金额，并作为上述的`number`进行渲染
    * 我们不更改Denom的大小写。实际上，`display` Denoms在状态中以小写形式存储（例如`10 atom`），但在日常生活中通常以大写形式显示（例如`10 ATOM`）。值渲染器保留状态中使用的大小写，但我们可能建议链将Denom元数据更改为大写以获得更好的用户显示效果。
* Denom和金额之间有一个空格（例如`10 atom`）。
* 将来，如果我们能找到一种可靠的方法（例如`cosmos:cosmos:hub:bank:denom:atom`），IBC Denoms可能会被转换为DID/IIDs。

#### 示例

* `1000000000uatom` -> `["1'000 atom"]`，因为atom是元数据的显示单位。

### `coins`

* `coin`数组显示为将每个`coin`编码为上述规范，然后用分隔符`", "`（逗号和空格，不带引号）连接起来。
* 币列表按照显示单位的Unicode代码点排序：`A-Z` < `a-z`。例如，字符串`aAbBcC`将被排序为`ABCabc`。
    * 如果币列表中没有任何项，则显示为`zero`。

### 示例

* `["3cosm", "2000000uatom"]` -> `2 atom, 3 COSM`（假设显示单位为`atom`和`COSM`）
* `["10atom", "20Acoin"]` -> `20 Acoin, 10 atom`（假设显示单位为`atom`和`Acoin`）
* `[]` -> `zero`

### `repeated`

* 适用于所有`repeated`字段，除了`cosmos.tx.v1beta1.TxBody#Messages`，该字段具有特殊的编码方式（参见[ADR-050](adr-050-sign-mode-textual.md)）。
* 重复类型具有以下模板：

```
<field_name>: <int> <field_kind>
<field_name> (<index>/<int>): <value rendered 1st line>
<optional value rendered in the next lines>
<field_name> (<index>/<int>): <value rendered 1st line>
<optional value rendered in the next lines>
End of <field_name>.
```

其中：

* `field_name`是重复字段的Protobuf字段名称
* `field_kind`：
    * 如果重复字段的类型是消息，则`field_kind`是消息名称
    * 如果重复字段的类型是枚举，则`field_kind`是枚举名称
    * 在其他任何情况下，`field_kind`是Protobuf原始类型（例如"string"或"bytes"）
* `int`是数组的长度
* `index`是基于1的重复字段索引

#### 示例

给定Proto定义：

```protobuf
message AllowedMsgAllowance {
  repeated string allowed_messages = 1;
}
```

并初始化为：

```go
x := []AllowedMsgAllowance{"cosmos.bank.v1beta1.MsgSend", "cosmos.gov.v1.MsgVote"}
```

我们有以下值渲染的编码：

```
Allowed messages: 2 strings
Allowed messages (1/2): cosmos.bank.v1beta1.MsgSend
Allowed messages (2/2): cosmos.gov.v1.MsgVote
End of Allowed messages
```

### `message`

* 适用于所有没有自定义编码的Protobuf消息。
* 字段名称遵循[句子大小写](https://en.wiktionary.org/wiki/sentence_case)
    * 将每个`_`替换为一个空格
    * 将句子的第一个字母大写
* 字段名称按照它们的Protobuf字段编号排序
* 屏幕标题是字段名称，屏幕内容是值。
* 嵌套：
    * 如果字段包含嵌套消息，则我们使用以下模板对底层消息进行值渲染：

```
  <field_name>: <1st line of value-rendered message>
  > <lines 2-n of value-rendered message>             // Notice the `>` prefix.
  ```

    * `>` character is used to denote nesting. For each additional level of nesting, add `>`.

#### Examples

Given the following Protobuf messages:

```protobuf
enum VoteOption {
  VOTE_OPTION_UNSPECIFIED = 0;
  VOTE_OPTION_YES = 1;
  VOTE_OPTION_ABSTAIN = 2;
  VOTE_OPTION_NO = 3;
  VOTE_OPTION_NO_WITH_VETO = 4;
}

message WeightedVoteOption {
  VoteOption option = 1;
  string     weight = 2 [(cosmos_proto.scalar) = "cosmos.Dec"];
}

message Vote {
  uint64 proposal_id = 1;
  string voter       = 2 [(cosmos_proto.scalar) = "cosmos.AddressString"];
  reserved 3;
  repeated WeightedVoteOption options = 4;
}
```

we get the following encoding for the `Vote` message:

```
Vote 对象
> 提案 ID: 4
> 投票人: cosmos1abc...def
> 选项: 2 个 WeightedVoteOptions
> 选项 (1/2): WeightedVoteOption 对象
>> 选项: VOTE_OPTION_YES
>> 权重: 0.7
> 选项 (2/2): WeightedVoteOption 对象
>> 选项: VOTE_OPTION_NO
>> 权重: 0.3
> 选项结束
```

### Enums

* Show the enum variant name as string.

#### Examples

See example above with `message Vote{}`.

### `google.protobuf.Any`

* Applies to `google.protobuf.Any`
* Rendered as:

```
<type_url>
> <value rendered underlying message>
```

There is however one exception: when the underlying message is a Protobuf message that does not have a custom encoding, then the message header screen is omitted, and one level of indentation is removed.

Messages that have a custom encoding, including `google.protobuf.Timestamp`, `google.protobuf.Duration`, `google.protobuf.Any`, `cosmos.base.v1beta1.Coin`, and messages that have an app-defined custom encoding, will preserve their header and indentation level.

#### Examples

Message header screen is stripped, one-level of indentation removed:
```
/cosmos.gov.v1.Vote
> 提案 ID: 4
> 投票人: cosmos1abc...def
> 选项: 2 个 WeightedVoteOptions
> 选项 (1/2): WeightedVoteOption 对象
>> 选项: 是
>> 权重: 0.7
> 选项 (2/2): WeightedVoteOption 对象
>> 选项: 否
>> 权重: 0.3
> 选项结束
```

具有自定义编码的消息:
```
/cosmos.base.v1beta1.Coin
> 10uatom
```

### `google.protobuf.Timestamp`

Rendered using [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) (a
simplification of ISO 8601), which is the current recommendation for portable
time values. The rendering always uses "Z" (UTC) as the timezone. It uses only
the necessary fractional digits of a second, omitting the fractional part
entirely if the timestamp has no fractional seconds. (The resulting timestamps
are not automatically sortable by standard lexicographic order, but we favor
the legibility of the shorter string.)

#### Examples

The timestamp with 1136214245 seconds and 700000000 nanoseconds is rendered
as `2006-01-02T15:04:05.7Z`.
The timestamp with 1136214245 seconds and zero nanoseconds is rendered
as `2006-01-02T15:04:05Z`.

### `google.protobuf.Duration`

The duration proto expresses a raw number of seconds and nanoseconds.
This will be rendered as longer time units of days, hours, and minutes,
plus any remaining seconds, in that order.
Leading and trailing zero-quantity units will be omitted, but all
units in between nonzero units will be shown, e.g. ` 3 days, 0 hours, 0 minutes, 5 seconds`.

Even longer time units such as months or years are imprecise.
Weeks are precise, but not commonly used - `91 days` is more immediately
legible than `13 weeks`.  Although `days` can be problematic,
e.g. noon to noon on subsequent days can be 23 or 25 hours depending on
daylight savings transitions, there is significant advantage in using
strict 24-hour days over using only hours (e.g. `91 days` vs `2184 hours`).

When nanoseconds are nonzero, they will be shown as fractional seconds,
with only the minimum number of digits, e.g `0.5 seconds`.

A duration of exactly zero is shown as `0 seconds`.

Units will be given as singular (no trailing `s`) when the quantity is exactly one,
and will be shown in plural otherwise.

Negative durations will be indicated with a leading minus sign (`-`).

Examples:

* `1 day`
* `30 days`
* `-1 day, 12 hours`
* `3 hours, 0 minutes, 53.025 seconds`

### bytes

* Bytes of length shorter or equal to 35 are rendered in hexadecimal, all capital letters, without the `0x` prefix.
* Bytes of length greater than 35 are hashed using SHA256. The rendered text is `SHA-256=`, followed by the 32-byte hash, in hexadecimal, all capital letters, without the `0x` prefix.
* The hexadecimal string is finally separated into groups of 4 digits, with a space `' '` as separator. If the bytes length is odd, the 2 remaining hexadecimal characters are at the end.

The number 35 was chosen because it is the longest length where the hashed-and-prefixed representation is longer than the original data directly formatted, using the 3 rules above. More specifically:
- a 35-byte array will have 70 hex characters, plus 17 space characters, resulting in 87 characters.
- byte arrays starting from length 36 will be be hashed to 32 bytes, which is 64 hex characters plus 15 spaces, and with the `SHA-256=` prefix, it takes 87 characters.
Also, secp256k1 public keys have length 33, so their Textual representation is not their hashed value, which we would like to avoid.

Note: Data longer than 35 bytes are not rendered in a way that can be inverted. See ADR-050's [section about invertability](adr-050-sign-mode-textual.md#invertible-rendering) for a discussion.

#### Examples

Inputs are displayed as byte arrays.

* `[0]`: `00`
* `[0,1,2]`: `0001 02`
* `[0,1,2,..,34]`: `0001 0203 0405 0607 0809 0A0B 0C0D 0E0F 1011 1213 1415 1617 1819 1A1B 1C1D 1E1F 2021 22`
* `[0,1,2,..,35]`: `SHA-256=5D7E 2D9B 1DCB C85E 7C89 0036 A2CF 2F9F E7B6 6554 F2DF 08CE C6AA 9C0A 25C9 9C21`

### address bytes

We currently use `string` types in protobuf for addresses so this may not be needed, but if any address bytes are used in sign mode textual they should be rendered with bech32 formatting

### strings

Strings are rendered as-is.

### Default Values

* Default Protobuf values for each field are skipped.

#### Example

```protobuf
message TestData {
  string signer = 1;
  string metadata = 2;
}
```

```go
myTestData := TestData{
  Signer: "cosmos1abc"
}
```

We get the following encoding for the `TestData` message:

```
TestData 对象
> 签名者: cosmos1abc
```

### bool

Boolean values are rendered as `True` or `False`.

### [ABANDONED] Custom `msg_title` instead of Msg `type_url`

_This paragraph is in the Annex for informational purposes only, and will be removed in a next update of the ADR._

<details>
  <summary>Click to see abandoned idea.</summary>

* all protobuf messages to be used with `SIGN_MODE_TEXTUAL` CAN have a short title associated with them that can be used in format strings whenever the type URL is explicitly referenced via the `cosmos.msg.v1.textual.msg_title` Protobuf message option.
* if this option is not specified for a Msg, then the Protobuf fully qualified name will be used.

```protobuf
message MsgSend {
  option (cosmos.msg.v1.textual.msg_title) = "bank send coins";
}
```

* 它们必须在每个消息、每个链上是唯一的

#### 示例

* `cosmos.gov.v1.MsgVote` -> `governance v1 vote`

#### 最佳实践

我们建议仅对 Protobuf 完全限定名称难以理解的 `Msg` 使用此选项。因此，上述两个示例 (`MsgSend` 和 `MsgVote`) 不适合用于 `msg_title`。我们仍然允许链上可能存在具有复杂或不明显名称的 `Msg` 使用 `msg_title`。

在这些情况下，如果链上只有一个模块的多个 Protobuf 版本，则建议在字符串中省略版本 (例如 `v1`)，这样双射映射可以确定每个字符串对应的消息。如果同一链上存在同一模块的多个 Protobuf 版本，则建议保留第一个带有版本的 `msg_title`，并在第二个 `msg_title` 中包含版本 (例如 `v2`)。

* `mychain.mymodule.v1.MsgDo` -> `mymodule做某事`
* `mychain.mymodule.v2.MsgDo` -> `mymodule v2做某事`

</details>


# ADR 050: SIGN_MODE_TEXTUAL: Annex 1 Value Renderers

## Changelog

* Dec 06, 2021: Initial Draft
* Feb 07, 2022: Draft read and concept-ACKed by the Ledger team.
* Dec 01, 2022: Remove `Object: ` prefix on Any header screen.
* Dec 13, 2022: Sign over bytes hash when bytes length > 32.
* Mar 27, 2023: Update `Any` value renderer to omit message header screen.

## Status

Accepted. Implementation started. Small value renderers details still need to be polished.

## Abstract

This Annex describes value renderers, which are used for displaying Protobuf values in a human-friendly way using a string array.

## Value Renderers

Value Renderers describe how values of different Protobuf types should be encoded as a string array. Value renderers can be formalized as a set of bijective functions `func renderT(value T) []string`, where `T` is one of the below Protobuf types for which this spec is defined.

### Protobuf `number`

* Applies to:
    * protobuf numeric integer types (`int{32,64}`, `uint{32,64}`, `sint{32,64}`, `fixed{32,64}`, `sfixed{32,64}`)
    * strings whose `customtype` is `github.com/cosmos/cosmos-sdk/types.Int` or `github.com/cosmos/cosmos-sdk/types.Dec`
    * bytes whose `customtype` is `github.com/cosmos/cosmos-sdk/types.Int` or `github.com/cosmos/cosmos-sdk/types.Dec`
* Trailing decimal zeroes are always removed
* Formatting with `'`s for every three integral digits.
* Usage of `.` to denote the decimal delimiter.

#### Examples

* `1000` (uint64) -> `1'000`
* `"1000000.00"` (string representing a Dec) -> `1'000'000`
* `"1000000.10"` (string representing a Dec) -> `1'000'000.1`

### `coin`

* Applies to `cosmos.base.v1beta1.Coin`.
* Denoms are converted to `display` denoms using `Metadata` (if available). **This requires a state query**. The definition of `Metadata` can be found in the [bank protobuf definition](https://buf.build/cosmos/cosmos-sdk/docs/main:cosmos.bank.v1beta1#cosmos.bank.v1beta1.Metadata). If the `display` field is empty or nil, then we do not perform any denom conversion.
* Amounts are converted to `display` denom amounts and rendered as `number`s above
    * We do not change the capitalization of the denom. In practice, `display` denoms are stored in lowercase in state (e.g. `10 atom`), however they are often showed in UPPERCASE in everyday life (e.g. `10 ATOM`). Value renderers keep the case used in state, but we may recommend chains changing the denom metadata to be uppercase for better user display.
* One space between the denom and amount (e.g. `10 atom`).
* In the future, IBC denoms could maybe be converted to DID/IIDs, if we can find a robust way for doing this (ex. `cosmos:cosmos:hub:bank:denom:atom`)

#### Examples

* `1000000000uatom` -> `["1'000 atom"]`, because atom is the metadata's display denom.

### `coins`

* an array of `coin` is display as the concatenation of each `coin` encoded as the specification above, the joined together with the delimiter `", "` (a comma and a space, no quotes around).
* the list of coins is ordered by unicode code point of the display denom: `A-Z` < `a-z`. For example, the string `aAbBcC` would be sorted `ABCabc`.
    * if the coins list had 0 items in it then it'll be rendered as `zero`

### Example

* `["3cosm", "2000000uatom"]` -> `2 atom, 3 COSM` (assuming the display denoms are `atom` and `COSM`)
* `["10atom", "20Acoin"]` -> `20 Acoin, 10 atom` (assuming the display denoms are `atom` and `Acoin`)
* `[]` -> `zero` 

### `repeated`

* Applies to all `repeated` fields, except `cosmos.tx.v1beta1.TxBody#Messages`, which has a particular encoding (see [ADR-050](adr-050-sign-mode-textual.md)).
* A repeated type has the following template:

```
<field_name>: <int> <field_kind>
<field_name> (<index>/<int>): <value rendered 1st line>
<optional value rendered in the next lines>
<field_name> (<index>/<int>): <value rendered 1st line>
<optional value rendered in the next lines>
End of <field_name>.
```

where:

* `field_name` is the Protobuf field name of the repeated field
* `field_kind`:
    * if the type of the repeated field is a message, `field_kind` is the message name
    * if the type of the repeated field is an enum, `field_kind` is the enum name
    * in any other case, `field_kind` is the protobuf primitive type (e.g. "string" or "bytes")
* `int` is the length of the array
* `index` is one based index of the repeated field

#### Examples

Given the proto definition:

```protobuf
message AllowedMsgAllowance {
  repeated string allowed_messages = 1;
}
```

and initializing with:

```go
x := []AllowedMsgAllowance{"cosmos.bank.v1beta1.MsgSend", "cosmos.gov.v1.MsgVote"}
```

we have the following value-rendered encoding:

```
Allowed messages: 2 strings
Allowed messages (1/2): cosmos.bank.v1beta1.MsgSend
Allowed messages (2/2): cosmos.gov.v1.MsgVote
End of Allowed messages
```

### `message`

* Applies to all Protobuf messages that do not have a custom encoding.
* Field names follow [sentence case](https://en.wiktionary.org/wiki/sentence_case)
    * replace each `_` with a space
    * capitalize first letter of the sentence
* Field names are ordered by their Protobuf field number
* Screen title is the field name, and screen content is the value.
* Nesting:
    * if a field contains a nested message, we value-render the underlying message using the template:

  ```
  <field_name>: <1st line of value-rendered message>
  > <lines 2-n of value-rendered message>             // Notice the `>` prefix.
  ```

    * `>` character is used to denote nesting. For each additional level of nesting, add `>`.

#### Examples

Given the following Protobuf messages:

```protobuf
enum VoteOption {
  VOTE_OPTION_UNSPECIFIED = 0;
  VOTE_OPTION_YES = 1;
  VOTE_OPTION_ABSTAIN = 2;
  VOTE_OPTION_NO = 3;
  VOTE_OPTION_NO_WITH_VETO = 4;
}

message WeightedVoteOption {
  VoteOption option = 1;
  string     weight = 2 [(cosmos_proto.scalar) = "cosmos.Dec"];
}

message Vote {
  uint64 proposal_id = 1;
  string voter       = 2 [(cosmos_proto.scalar) = "cosmos.AddressString"];
  reserved 3;
  repeated WeightedVoteOption options = 4;
}
```

we get the following encoding for the `Vote` message:

```
Vote object
> Proposal id: 4
> Voter: cosmos1abc...def
> Options: 2 WeightedVoteOptions
> Options (1/2): WeightedVoteOption object
>> Option: VOTE_OPTION_YES
>> Weight: 0.7
> Options (2/2): WeightedVoteOption object
>> Option: VOTE_OPTION_NO
>> Weight: 0.3
> End of Options
```

### Enums

* Show the enum variant name as string.

#### Examples

See example above with `message Vote{}`.

### `google.protobuf.Any`

* Applies to `google.protobuf.Any`
* Rendered as:

```
<type_url>
> <value rendered underlying message>
```

There is however one exception: when the underlying message is a Protobuf message that does not have a custom encoding, then the message header screen is omitted, and one level of indentation is removed.

Messages that have a custom encoding, including `google.protobuf.Timestamp`, `google.protobuf.Duration`, `google.protobuf.Any`, `cosmos.base.v1beta1.Coin`, and messages that have an app-defined custom encoding, will preserve their header and indentation level.

#### Examples

Message header screen is stripped, one-level of indentation removed:
```
/cosmos.gov.v1.Vote
> Proposal id: 4
> Vote: cosmos1abc...def
> Options: 2 WeightedVoteOptions
> Options (1/2): WeightedVoteOption object
>> Option: Yes
>> Weight: 0.7
> Options (2/2): WeightedVoteOption object
>> Option: No
>> Weight: 0.3
> End of Options
```

Message with custom encoding:
```
/cosmos.base.v1beta1.Coin
> 10uatom
```

### `google.protobuf.Timestamp`

Rendered using [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) (a
simplification of ISO 8601), which is the current recommendation for portable
time values. The rendering always uses "Z" (UTC) as the timezone. It uses only
the necessary fractional digits of a second, omitting the fractional part
entirely if the timestamp has no fractional seconds. (The resulting timestamps
are not automatically sortable by standard lexicographic order, but we favor
the legibility of the shorter string.)

#### Examples

The timestamp with 1136214245 seconds and 700000000 nanoseconds is rendered
as `2006-01-02T15:04:05.7Z`.
The timestamp with 1136214245 seconds and zero nanoseconds is rendered
as `2006-01-02T15:04:05Z`.

### `google.protobuf.Duration`

The duration proto expresses a raw number of seconds and nanoseconds.
This will be rendered as longer time units of days, hours, and minutes,
plus any remaining seconds, in that order.
Leading and trailing zero-quantity units will be omitted, but all
units in between nonzero units will be shown, e.g. ` 3 days, 0 hours, 0 minutes, 5 seconds`.

Even longer time units such as months or years are imprecise.
Weeks are precise, but not commonly used - `91 days` is more immediately
legible than `13 weeks`.  Although `days` can be problematic,
e.g. noon to noon on subsequent days can be 23 or 25 hours depending on
daylight savings transitions, there is significant advantage in using
strict 24-hour days over using only hours (e.g. `91 days` vs `2184 hours`).

When nanoseconds are nonzero, they will be shown as fractional seconds,
with only the minimum number of digits, e.g `0.5 seconds`.

A duration of exactly zero is shown as `0 seconds`.

Units will be given as singular (no trailing `s`) when the quantity is exactly one,
and will be shown in plural otherwise.

Negative durations will be indicated with a leading minus sign (`-`).

Examples:

* `1 day`
* `30 days`
* `-1 day, 12 hours`
* `3 hours, 0 minutes, 53.025 seconds`

### bytes

* Bytes of length shorter or equal to 35 are rendered in hexadecimal, all capital letters, without the `0x` prefix.
* Bytes of length greater than 35 are hashed using SHA256. The rendered text is `SHA-256=`, followed by the 32-byte hash, in hexadecimal, all capital letters, without the `0x` prefix.
* The hexadecimal string is finally separated into groups of 4 digits, with a space `' '` as separator. If the bytes length is odd, the 2 remaining hexadecimal characters are at the end.

The number 35 was chosen because it is the longest length where the hashed-and-prefixed representation is longer than the original data directly formatted, using the 3 rules above. More specifically:
- a 35-byte array will have 70 hex characters, plus 17 space characters, resulting in 87 characters.
- byte arrays starting from length 36 will be be hashed to 32 bytes, which is 64 hex characters plus 15 spaces, and with the `SHA-256=` prefix, it takes 87 characters.
Also, secp256k1 public keys have length 33, so their Textual representation is not their hashed value, which we would like to avoid.

Note: Data longer than 35 bytes are not rendered in a way that can be inverted. See ADR-050's [section about invertability](adr-050-sign-mode-textual.md#invertible-rendering) for a discussion.

#### Examples

Inputs are displayed as byte arrays.

* `[0]`: `00`
* `[0,1,2]`: `0001 02`
* `[0,1,2,..,34]`: `0001 0203 0405 0607 0809 0A0B 0C0D 0E0F 1011 1213 1415 1617 1819 1A1B 1C1D 1E1F 2021 22`
* `[0,1,2,..,35]`: `SHA-256=5D7E 2D9B 1DCB C85E 7C89 0036 A2CF 2F9F E7B6 6554 F2DF 08CE C6AA 9C0A 25C9 9C21`

### address bytes

We currently use `string` types in protobuf for addresses so this may not be needed, but if any address bytes are used in sign mode textual they should be rendered with bech32 formatting

### strings

Strings are rendered as-is.

### Default Values

* Default Protobuf values for each field are skipped.

#### Example

```protobuf
message TestData {
  string signer = 1;
  string metadata = 2;
}
```

```go
myTestData := TestData{
  Signer: "cosmos1abc"
}
```

We get the following encoding for the `TestData` message:

```
TestData object
> Signer: cosmos1abc
```

### bool

Boolean values are rendered as `True` or `False`.

### [ABANDONED] Custom `msg_title` instead of Msg `type_url`

_This paragraph is in the Annex for informational purposes only, and will be removed in a next update of the ADR._

<details>
  <summary>Click to see abandoned idea.</summary>

* all protobuf messages to be used with `SIGN_MODE_TEXTUAL` CAN have a short title associated with them that can be used in format strings whenever the type URL is explicitly referenced via the `cosmos.msg.v1.textual.msg_title` Protobuf message option.
* if this option is not specified for a Msg, then the Protobuf fully qualified name will be used.

```protobuf
message MsgSend {
  option (cosmos.msg.v1.textual.msg_title) = "bank send coins";
}
```

* they MUST be unique per message, per chain

#### Examples

* `cosmos.gov.v1.MsgVote` -> `governance v1 vote`

#### Best Pratices

We recommend to use this option only for `Msg`s whose Protobuf fully qualified name can be hard to understand. As such, the two examples above (`MsgSend` and `MsgVote`) are not good examples to be used with `msg_title`. We still allow `msg_title` for chains who might have `Msg`s with complex or non-obvious names.

In those cases, we recommend to drop the version (e.g. `v1`) in the string if there's only one version of the module on chain. This way, the bijective mapping can figure out which message each string corresponds to. If multiple Protobuf versions of the same module exist on the same chain, we recommend keeping the first `msg_title` with version, and the second `msg_title` with version (e.g. `v2`):

* `mychain.mymodule.v1.MsgDo` -> `mymodule do something`
* `mychain.mymodule.v2.MsgDo` -> `mymodule v2 do something`

</details>
