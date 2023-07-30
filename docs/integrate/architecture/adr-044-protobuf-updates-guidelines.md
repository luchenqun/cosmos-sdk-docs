# ADR 044: 更新 Protobuf 定义的指南

## 变更记录

* 2021年6月28日：初稿
* 2021年12月2日：为新字段添加 `Since:` 注释
* 2022年7月21日：移除同一版本中不允许有新的 `Msg` 的规则

## 状态

草稿

## 摘要

本 ADR 提供了在更新 Protobuf 定义时的指南和推荐实践。这些指南面向模块开发者。

## 背景

Cosmos SDK 维护着一组 [Protobuf 定义](https://github.com/cosmos/cosmos-sdk/tree/main/proto/cosmos)。正确设计 Protobuf 定义以避免在同一版本中引入任何破坏性变更非常重要。原因在于不破坏工具（包括索引器和浏览器）、钱包和其他第三方集成。

在对这些 Protobuf 定义进行更改时，Cosmos SDK 目前仅遵循 [Buf](https://docs.buf.build/) 的建议。然而，我们注意到 Buf 的建议在某些情况下仍可能导致 SDK 中的破坏性变更。例如：

* 向 `Msg` 添加字段。添加字段不是 Protobuf 规范中的破坏性操作。然而，当向 `Msg` 添加新字段时，当将新的 `Msg` 发送到旧节点时，未知字段拒绝将抛出错误。
* 将字段标记为 `reserved`。Protobuf 提出了 `reserved` 关键字，用于删除字段而无需提升包版本。然而，通过这样做，客户端的向后兼容性被破坏，因为 Protobuf 不会为 `reserved` 字段生成任何内容。有关此问题的更多详细信息，请参见 [#9446](https://github.com/cosmos/cosmos-sdk/issues/9446)。

此外，模块开发者在处理 Protobuf 定义时经常遇到其他问题，例如“我可以重命名一个字段吗？”或“我可以弃用一个字段吗？”本 ADR 旨在通过提供有关 Protobuf 定义允许的更新的明确指南来回答所有这些问题。

## 决策

我们决定遵循 [Buf](https://docs.buf.build/) 的建议，但有以下例外：

* `UNARY_RPC`：Cosmos SDK 目前不支持流式 RPC。
* `COMMENT_FIELD`：Cosmos SDK 允许没有注释的字段。
* `SERVICE_SUFFIX`：我们使用 `Query` 和 `Msg` 服务命名约定，不使用 `-Service` 后缀。
* `PACKAGE_VERSION_SUFFIX`：某些包，例如 `cosmos.crypto.ed25519`，不使用版本后缀。
* `RPC_REQUEST_STANDARD_NAME`：`Msg` 服务的请求不带有 `-Request` 后缀，以保持向后兼容性。

在 Buf 的建议之上，我们添加了以下针对 Cosmos SDK 的特定指南。

### 在不增加版本号的情况下更新 Protobuf 定义

#### 1. 模块开发者可以添加新的 Protobuf 定义

模块开发者可以添加新的 `message`、新的 `Service`、新的 `rpc` 端点以及现有消息的新字段。这个建议遵循 Protobuf 规范，但为了清晰起见，添加在本文档中，因为 SDK 需要额外的更改。

SDK 要求新添加的 Protobuf 注释包含以下格式的一行：

```protobuf
// Since: cosmos-sdk <version>{, <version>...}
```

其中每个 `version` 表示该字段可用的次要版本（"0.45"）或修补版本（"0.44.5"）。这将极大地帮助客户端库，它们可以选择使用反射或自定义代码生成来根据目标节点版本显示/隐藏这些字段。

例如，以下注释是有效的：

```protobuf
// Since: cosmos-sdk 0.44

// Since: cosmos-sdk 0.42.11, 0.44.5
```

而以下注释是无效的：

```protobuf
// Since cosmos-sdk v0.44

// since: cosmos-sdk 0.44

// Since: cosmos-sdk 0.42.11 0.44.5

// Since: Cosmos SDK 0.42.11, 0.44.5
```

#### 2. 字段可以标记为 `deprecated`，节点可以实现对这些字段的违反协议的更改

Protobuf 支持 [`deprecated` 字段选项](https://developers.google.com/protocol-buffers/docs/proto#options)，并且此选项可以用于任何字段，包括 `Msg` 字段。如果节点处理带有非空弃用字段的 Protobuf 消息，则节点可以在处理它时以违反协议的方式更改其行为。在可能的情况下，节点必须在不破坏共识的情况下处理向后兼容性（除非我们增加了协议版本）。

例如，Cosmos SDK v0.42 到 v0.43 的更新包含了两个破坏 Protobuf 的更改，如下所示。SDK 团队决定遵循此指南，通过撤销这些破坏性更改，将这些更改标记为弃用，并在处理带有弃用字段的消息时修改节点实现。具体来说：

* Cosmos SDK最近移除了对[基于时间的软件升级](https://github.com/cosmos/cosmos-sdk/pull/8849)的支持。因此，在`cosmos.upgrade.v1beta1.Plan`中，`time`字段已被标记为弃用。此外，节点将拒绝包含非空`time`字段的升级计划的任何提案。
* Cosmos SDK现在支持[治理分割投票](adr-037-gov-split-vote.md)。在查询投票时，返回的`cosmos.gov.v1beta1.Vote`消息中，`option`字段（用于1个投票选项）已被弃用，取而代之的是`options`字段（允许多个投票选项）。只要可能，SDK仍会填充弃用的`option`字段，即仅当`len(options) == 1`且`options[0].Weight == 1.0`时。

#### 3. 字段不得重命名

虽然官方的Protobuf建议不禁止重命名字段，因为它不会破坏Protobuf的二进制表示，但SDK明确禁止在Protobuf结构中重命名字段。这样选择的主要原因是为了避免给客户端引入破坏性变更，客户端通常依赖于生成类型中的硬编码字段。此外，重命名字段将导致客户端破坏性的JSON表示，用于REST端点和CLI中的Protobuf定义。

### 递增Protobuf包版本

TODO，需要进行架构审查。一些主题：

* 提升版本的频率
* 在提升版本时，Cosmos SDK是否应支持两个版本？
    * 即v1beta1 -> v1，Cosmos SDK是否应该有两个文件夹，并为两个版本提供处理程序？
* 提及ADR-023 Protobuf命名

## 结果

> 此部分描述应用决策后的上下文。所有结果都应在此列出，而不仅仅是“积极”的结果。一个特定的决策可能有积极、消极和中性的结果，但所有这些结果都会对团队和项目产生影响。

### 向后兼容性

> 所有引入向后不兼容性的ADR必须包含一个描述这些不兼容性及其严重性的部分。ADR必须解释作者如何提议处理这些不兼容性。没有足够向后兼容性论述的ADR提交可能会被直接拒绝。

### 积极影响

* 对工具开发者来说更少的痛苦
* 生态系统中更高的兼容性
* ...

### 负面影响

{负面影响}

### 中性影响

* 在 Protobuf 审查中更严格

## 进一步讨论

这个 ADR 目前还处于草案阶段，一旦我们决定如何正确执行，"递增 Protobuf 包版本" 将会填写进去。

## 测试用例 [可选]

对于影响共识变更的 ADR，实现的测试用例是必需的。其他 ADR 可选择包含测试用例的链接，如果适用的话。

## 参考资料

* [#9445](https://github.com/cosmos/cosmos-sdk/issues/9445) 发布 proto 定义 v1
* [#9446](https://github.com/cosmos/cosmos-sdk/issues/9446) v1beta1 proto 的兼容性变更


# ADR 044: Guidelines for Updating Protobuf Definitions

## Changelog

* 28.06.2021: Initial Draft
* 02.12.2021: Add `Since:` comment for new fields
* 21.07.2022: Remove the rule of no new `Msg` in the same proto version.

## Status

Draft

## Abstract

This ADR provides guidelines and recommended practices when updating Protobuf definitions. These guidelines are targeting module developers.

## Context

The Cosmos SDK maintains a set of [Protobuf definitions](https://github.com/cosmos/cosmos-sdk/tree/main/proto/cosmos). It is important to correctly design Protobuf definitions to avoid any breaking changes within the same version. The reasons are to not break tooling (including indexers and explorers), wallets and other third-party integrations.

When making changes to these Protobuf definitions, the Cosmos SDK currently only follows [Buf's](https://docs.buf.build/) recommendations. We noticed however that Buf's recommendations might still result in breaking changes in the SDK in some cases. For example:

* Adding fields to `Msg`s. Adding fields is a not a Protobuf spec-breaking operation. However, when adding new fields to `Msg`s, the unknown field rejection will throw an error when sending the new `Msg` to an older node.
* Marking fields as `reserved`. Protobuf proposes the `reserved` keyword for removing fields without the need to bump the package version. However, by doing so, client backwards compatibility is broken as Protobuf doesn't generate anything for `reserved` fields. See [#9446](https://github.com/cosmos/cosmos-sdk/issues/9446) for more details on this issue.

Moreover, module developers often face other questions around Protobuf definitions such as "Can I rename a field?" or "Can I deprecate a field?" This ADR aims to answer all these questions by providing clear guidelines about allowed updates for Protobuf definitions.

## Decision

We decide to keep [Buf's](https://docs.buf.build/) recommendations with the following exceptions:

* `UNARY_RPC`: the Cosmos SDK currently does not support streaming RPCs.
* `COMMENT_FIELD`: the Cosmos SDK allows fields with no comments.
* `SERVICE_SUFFIX`: we use the `Query` and `Msg` service naming convention, which doesn't use the `-Service` suffix.
* `PACKAGE_VERSION_SUFFIX`: some packages, such as `cosmos.crypto.ed25519`, don't use a version suffix.
* `RPC_REQUEST_STANDARD_NAME`: Requests for the `Msg` service don't have the `-Request` suffix to keep backwards compatibility.

On top of Buf's recommendations we add the following guidelines that are specific to the Cosmos SDK.

### Updating Protobuf Definition Without Bumping Version

#### 1. Module developers MAY add new Protobuf definitions

Module developers MAY add new `message`s, new `Service`s, new `rpc` endpoints, and new fields to existing messages. This recommendation follows the Protobuf specification, but is added in this document for clarity, as the SDK requires one additional change.

The SDK requires the Protobuf comment of the new addition to contain one line with the following format:

```protobuf
// Since: cosmos-sdk <version>{, <version>...}
```

Where each `version` denotes a minor ("0.45") or patch ("0.44.5") version from which the field is available. This will greatly help client libraries, who can optionally use reflection or custom code generation to show/hide these fields depending on the targetted node version.

As examples, the following comments are valid:

```protobuf
// Since: cosmos-sdk 0.44

// Since: cosmos-sdk 0.42.11, 0.44.5
```

and the following ones are NOT valid:

```protobuf
// Since cosmos-sdk v0.44

// since: cosmos-sdk 0.44

// Since: cosmos-sdk 0.42.11 0.44.5

// Since: Cosmos SDK 0.42.11, 0.44.5
```

#### 2. Fields MAY be marked as `deprecated`, and nodes MAY implement a protocol-breaking change for handling these fields

Protobuf supports the [`deprecated` field option](https://developers.google.com/protocol-buffers/docs/proto#options), and this option MAY be used on any field, including `Msg` fields. If a node handles a Protobuf message with a non-empty deprecated field, the node MAY change its behavior upon processing it, even in a protocol-breaking way. When possible, the node MUST handle backwards compatibility without breaking the consensus (unless we increment the proto version).

As an example, the Cosmos SDK v0.42 to v0.43 update contained two Protobuf-breaking changes, listed below. Instead of bumping the package versions from `v1beta1` to `v1`, the SDK team decided to follow this guideline, by reverting the breaking changes, marking those changes as deprecated, and modifying the node implementation when processing messages with deprecated fields. More specifically:

* The Cosmos SDK recently removed support for [time-based software upgrades](https://github.com/cosmos/cosmos-sdk/pull/8849). As such, the `time` field has been marked as deprecated in `cosmos.upgrade.v1beta1.Plan`. Moreover, the node will reject any proposal containing an upgrade Plan whose `time` field is non-empty.
* The Cosmos SDK now supports [governance split votes](adr-037-gov-split-vote.md). When querying for votes, the returned `cosmos.gov.v1beta1.Vote` message has its `option` field (used for 1 vote option) deprecated in favor of its `options` field (allowing multiple vote options). Whenever possible, the SDK still populates the deprecated `option` field, that is, if and only if the `len(options) == 1` and `options[0].Weight == 1.0`.

#### 3. Fields MUST NOT be renamed

Whereas the official Protobuf recommendations do not prohibit renaming fields, as it does not break the Protobuf binary representation, the SDK explicitly forbids renaming fields in Protobuf structs. The main reason for this choice is to avoid introducing breaking changes for clients, which often rely on hard-coded fields from generated types. Moreover, renaming fields will lead to client-breaking JSON representations of Protobuf definitions, used in REST endpoints and in the CLI.

### Incrementing Protobuf Package Version

TODO, needs architecture review. Some topics:

* Bumping versions frequency
* When bumping versions, should the Cosmos SDK support both versions?
    * i.e. v1beta1 -> v1, should we have two folders in the Cosmos SDK, and handlers for both versions?
* mention ADR-023 Protobuf naming

## Consequences

> This section describes the resulting context, after applying the decision. All consequences should be listed here, not just the "positive" ones. A particular decision may have positive, negative, and neutral consequences, but all of them affect the team and project in the future.

### Backwards Compatibility

> All ADRs that introduce backwards incompatibilities must include a section describing these incompatibilities and their severity. The ADR must explain how the author proposes to deal with these incompatibilities. ADR submissions without a sufficient backwards compatibility treatise may be rejected outright.

### Positive

* less pain to tool developers
* more compatibility in the ecosystem
* ...

### Negative

{negative consequences}

### Neutral

* more rigor in Protobuf review

## Further Discussions

This ADR is still in the DRAFT stage, and the "Incrementing Protobuf Package Version" will be filled in once we make a decision on how to correctly do it.

## Test Cases [optional]

Test cases for an implementation are mandatory for ADRs that are affecting consensus changes. Other ADRs can choose to include links to test cases if applicable.

## References

* [#9445](https://github.com/cosmos/cosmos-sdk/issues/9445) Release proto definitions v1
* [#9446](https://github.com/cosmos/cosmos-sdk/issues/9446) Address v1beta1 proto breaking changes
