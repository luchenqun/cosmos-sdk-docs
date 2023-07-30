# 架构决策记录（ADR）

这是记录 Cosmos-SDK 中所有高级架构决策的位置。

架构决策（**AD**）是解决功能性或非功能性需求的软件设计选择，对软件系统的架构和质量有明显影响。
架构显著性需求（**ASR**）是对软件系统架构和质量有可衡量影响的需求。
架构决策记录（**ADR**）记录了单个架构决策，通常在撰写个人笔记或会议纪要时完成；在项目中创建和维护的ADR集合构成其决策日志。所有这些都属于架构知识管理（AKM）的范畴。

您可以在这篇[博文](https://product.reverb.com/documenting-architecture-decisions-the-reverb-way-a3563bb24bd0#.78xhdix6t)中了解更多关于ADR概念的内容。

## 理由

ADR旨在成为提出新功能设计和新流程、收集社区对问题的意见以及记录设计决策的主要机制。
ADR应提供：

* 相关目标和当前状态的背景信息
* 实现目标的建议更改
* 利弊摘要
* 参考资料
* 变更日志

请注意ADR和规范之间的区别。ADR提供了关于架构变更或新事物架构的背景、直觉、推理和理由。规范则是对当前所有内容的更为简洁和流畅的摘要。

如果记录的决策被发现不足，可以召开讨论，在此记录新的决策，然后修改代码以匹配。

## 创建新的ADR

请阅读有关[PROCESS](PROCESS.md)的内容。

### 使用RFC 2119关键词

在撰写ADR时，遵循编写RFC的最佳实践。在编写RFC时，关键词用于表示规范中的要求。这些词通常大写：“MUST”，“MUST NOT”，“REQUIRED”，“SHALL”，“SHALL NOT”，“SHOULD”，“SHOULD NOT”，“RECOMMENDED”，“MAY”和“OPTIONAL”。它们的解释如[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119)中所述。

## ADR目录

### 已接受

* [ADR 002: SDK文档结构](adr-002-docs-structure.md)
* [ADR 004: 分割货币单位密钥](adr-004-split-denomination-keys.md)
* [ADR 006: Secret Store替换](adr-006-secret-store-replacement.md)
* [ADR 009: 证据模块](adr-009-evidence-module.md)
* [ADR 010: 模块化AnteHandler](adr-010-modular-antehandler.md)
* [ADR 019: Protocol Buffer状态编码](adr-019-protobuf-state-encoding.md)
* [ADR 020: Protocol Buffer交易编码](adr-020-protobuf-transaction-encoding.md)
* [ADR 021: Protocol Buffer查询编码](adr-021-protobuf-query-encoding.md)
* [ADR 023: Protocol Buffer命名和版本控制](adr-023-protobuf-naming.md)
* [ADR 029: 费用授权模块](adr-029-fee-grant-module.md)
* [ADR 030: 消息授权模块](adr-030-authz-module.md)
* [ADR 031: Protobuf消息服务](adr-031-msg-service.md)
* [ADR 055: ORM](adr-055-orm.md)
* [ADR 058: 自动生成的CLI](adr-058-auto-generated-cli.md)
* [ADR 060: ABCI 1.0 (第一阶段)](adr-060-abci-1.0.md)
* [ADR 061: 流动权益](adr-061-liquid-staking.md)

### 提议中

* [ADR 003: 动态能力存储](adr-003-dynamic-capability-store.md)
* [ADR 011: 泛化创世账户](adr-011-generalize-genesis-accounts.md)
* [ADR 012: 状态访问器](adr-012-state-accessors.md)
* [ADR 013: 指标](adr-013-metrics.md)
* [ADR 016: 验证人共识密钥轮换](adr-016-validator-consensus-key-rotation.md)
* [ADR 017: 历史头模块](adr-017-historical-header-module.md)
* [ADR 018: 可扩展的投票周期](adr-018-extendable-voting-period.md)
* [ADR 022: 自定义baseapp panic处理](adr-022-custom-panic-handling.md)
* [ADR 024: 货币元数据](adr-024-coin-metadata.md)
* [ADR 027: 确定性Protobuf序列化](adr-027-deterministic-protobuf-serialization.md)
* [ADR 028: 公钥地址](adr-028-public-key-addresses.md)
* [ADR 032: 类型化事件](adr-032-typed-events.md)
* [ADR 033: 模块间RPC](adr-033-protobuf-inter-module-comm.md)
* [ADR 035: Rosetta API支持](adr-035-rosetta-api-support.md)
* [ADR 037: 治理分割投票](adr-037-gov-split-vote.md)
* [ADR 038: 状态监听](adr-038-state-listening.md)
* [ADR 039: 分时权益](adr-039-epoched-staking.md)
* [ADR 040: 存储和SMT状态承诺](adr-040-storage-and-smt-state-commitments.md)
* [ADR 046: 模块参数](adr-046-module-params.md)
* [ADR 054: 兼容Semver的SDK模块](adr-054-semver-compatible-modules.md)
* [ADR 057: 应用程序连接](adr-057-app-wiring.md)
* [ADR 059: 测试范围](adr-059-test-scopes.md)
* [ADR 062: 集合状态层](adr-062-collections-state-layer.md)
* [ADR 063: 核心模块API](adr-063-core-module-api.md)
* [ADR 065: 存储V2](adr-065-store-v2.md)

### 草稿

* [ADR 044: 更新 Protobuf 定义的指南](adr-044-protobuf-updates-guidelines.md)
* [ADR 047: 扩展升级计划](adr-047-extend-upgrade-plan.md)
* [ADR 053: Go 模块重构](adr-053-go-module-refactoring.md)




# Architecture Decision Records (ADR)

This is a location to record all high-level architecture decisions in the Cosmos-SDK.

An Architectural Decision (**AD**) is a software design choice that addresses a functional or non-functional requirement that is architecturally significant.
An Architecturally Significant Requirement (**ASR**) is a requirement that has a measurable effect on a software system’s architecture and quality.
An Architectural Decision Record (**ADR**) captures a single AD, such as often done when writing personal notes or meeting minutes; the collection of ADRs created and maintained in a project constitute its decision log. All these are within the topic of Architectural Knowledge Management (AKM).

You can read more about the ADR concept in this [blog post](https://product.reverb.com/documenting-architecture-decisions-the-reverb-way-a3563bb24bd0#.78xhdix6t).

## Rationale

ADRs are intended to be the primary mechanism for proposing new feature designs and new processes, for collecting community input on an issue, and for documenting the design decisions.
An ADR should provide:

* Context on the relevant goals and the current state
* Proposed changes to achieve the goals
* Summary of pros and cons
* References
* Changelog

Note the distinction between an ADR and a spec. The ADR provides the context, intuition, reasoning, and
justification for a change in architecture, or for the architecture of something
new. The spec is much more compressed and streamlined summary of everything as
it stands today.

If recorded decisions turned out to be lacking, convene a discussion, record the new decisions here, and then modify the code to match.

## Creating new ADR

Read about the [PROCESS](PROCESS.md).

### Use RFC 2119 Keywords

When writing ADRs, follow the same best practices for writing RFCs. When writing RFCs, key words are used to signify the requirements in the specification. These words are often capitalized: "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL. They are to be interpreted as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## ADR Table of Contents

### Accepted

* [ADR 002: SDK Documentation Structure](adr-002-docs-structure.md)
* [ADR 004: Split Denomination Keys](adr-004-split-denomination-keys.md)
* [ADR 006: Secret Store Replacement](adr-006-secret-store-replacement.md)
* [ADR 009: Evidence Module](adr-009-evidence-module.md)
* [ADR 010: Modular AnteHandler](adr-010-modular-antehandler.md)
* [ADR 019: Protocol Buffer State Encoding](adr-019-protobuf-state-encoding.md)
* [ADR 020: Protocol Buffer Transaction Encoding](adr-020-protobuf-transaction-encoding.md)
* [ADR 021: Protocol Buffer Query Encoding](adr-021-protobuf-query-encoding.md)
* [ADR 023: Protocol Buffer Naming and Versioning](adr-023-protobuf-naming.md)
* [ADR 029: Fee Grant Module](adr-029-fee-grant-module.md)
* [ADR 030: Message Authorization Module](adr-030-authz-module.md)
* [ADR 031: Protobuf Msg Services](adr-031-msg-service.md)
* [ADR 055: ORM](adr-055-orm.md)
* [ADR 058: Auto-Generated CLI](adr-058-auto-generated-cli.md)
* [ADR 060: ABCI 1.0 (Phase I)](adr-060-abci-1.0.md)
* [ADR 061: Liquid Staking](adr-061-liquid-staking.md)

### Proposed

* [ADR 003: Dynamic Capability Store](adr-003-dynamic-capability-store.md)
* [ADR 011: Generalize Genesis Accounts](adr-011-generalize-genesis-accounts.md)
* [ADR 012: State Accessors](adr-012-state-accessors.md)
* [ADR 013: Metrics](adr-013-metrics.md)
* [ADR 016: Validator Consensus Key Rotation](adr-016-validator-consensus-key-rotation.md)
* [ADR 017: Historical Header Module](adr-017-historical-header-module.md)
* [ADR 018: Extendable Voting Periods](adr-018-extendable-voting-period.md)
* [ADR 022: Custom baseapp panic handling](adr-022-custom-panic-handling.md)
* [ADR 024: Coin Metadata](adr-024-coin-metadata.md)
* [ADR 027: Deterministic Protobuf Serialization](adr-027-deterministic-protobuf-serialization.md)
* [ADR 028: Public Key Addresses](adr-028-public-key-addresses.md)
* [ADR 032: Typed Events](adr-032-typed-events.md)
* [ADR 033: Inter-module RPC](adr-033-protobuf-inter-module-comm.md)
* [ADR 035: Rosetta API Support](adr-035-rosetta-api-support.md)
* [ADR 037: Governance Split Votes](adr-037-gov-split-vote.md)
* [ADR 038: State Listening](adr-038-state-listening.md)
* [ADR 039: Epoched Staking](adr-039-epoched-staking.md)
* [ADR 040: Storage and SMT State Commitments](adr-040-storage-and-smt-state-commitments.md)
* [ADR 046: Module Params](adr-046-module-params.md)
* [ADR 054: Semver Compatible SDK Modules](adr-054-semver-compatible-modules.md)
* [ADR 057: App Wiring](adr-057-app-wiring.md)
* [ADR 059: Test Scopes](adr-059-test-scopes.md)
* [ADR 062: Collections State Layer](adr-062-collections-state-layer.md)
* [ADR 063: Core Module API](adr-063-core-module-api.md)
* [ADR 065: Store V2](adr-065-store-v2.md)

### Draft

* [ADR 044: Guidelines for Updating Protobuf Definitions](adr-044-protobuf-updates-guidelines.md)
* [ADR 047: Extend Upgrade Plan](adr-047-extend-upgrade-plan.md)
* [ADR 053: Go Module Refactoring](adr-053-go-module-refactoring.md)
