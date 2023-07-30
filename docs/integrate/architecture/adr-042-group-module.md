# ADR 042: Group Module

## 变更日志

* 2020/04/09: 初始草稿

## 状态

草稿

## 摘要

本ADR定义了`x/group`模块，该模块允许在链上创建和管理多签名账户，并根据可配置的决策策略对消息执行进行投票。

## 背景

Cosmos SDK的传统氨基多签名机制存在一定的限制：

* 无法进行密钥轮换，尽管可以通过[账户重置密钥](adr-034-account-rekeying.md)来解决。
* 无法更改阈值。
* 对非技术用户来说，用户体验不佳（[#5661](https://github.com/cosmos/cosmos-sdk/issues/5661)）。
* 需要使用`legacy_amino`签名模式（[#8141](https://github.com/cosmos/cosmos-sdk/issues/8141)）。

虽然组模块并不是对当前多签名账户的完全替代，但它提供了解决上述限制的解决方案，具有更灵活的密钥管理系统，可以添加、更新或删除密钥，以及可配置的阈值。
它旨在与其他访问控制模块一起使用，例如[`x/feegrant`](adr-029-fee-grant-module.md)和[`x/authz`](adr-030-authz-module.md)，以简化个人和组织的密钥管理。

组模块的概念验证可以在以下位置找到：https://github.com/regen-network/regen-ledger/tree/master/proto/regen/group/v1alpha1 和 https://github.com/regen-network/regen-ledger/tree/master/x/group。

## 决策

我们建议将`x/group`模块与其支持的[ORM/Table Store package](https://github.com/regen-network/regen-ledger/tree/master/orm)（[#7098](https://github.com/cosmos/cosmos-sdk/issues/7098)）合并到Cosmos SDK中，并在此处继续开发。ORM package将有一个专门的ADR。

### 组

组是一组具有关联权重的账户的组合。它不是一个账户，也没有余额。它本身没有任何形式的投票或决策权重。
组成员可以通过组账户使用不同的决策策略创建提案并对其进行投票。

它有一个`admin`账户，可以管理组中的成员，更新组的元数据并设置新的管理员。

```protobuf
message GroupInfo {

    // group_id is the unique ID of this group.
    uint64 group_id = 1;

    // admin is the account address of the group's admin.
    string admin = 2;

    // metadata is any arbitrary metadata to attached to the group.
    bytes metadata = 3;

    // version is used to track changes to a group's membership structure that
    // would break existing proposals. Whenever a member weight has changed,
    // or any member is added or removed, the version is incremented and will
    // invalidate all proposals from older versions.
    uint64 version = 4;

    // total_weight is the sum of the group members' weights.
    string total_weight = 5;
}
```

```protobuf
message GroupMember {

    // group_id is the unique ID of the group.
    uint64 group_id = 1;

    // member is the member data.
    Member member = 2;
}

// Member represents a group member with an account address,
// non-zero weight and metadata.
message Member {

    // address is the member's account address.
    string address = 1;

    // weight is the member's voting weight that should be greater than 0.
    string weight = 2;

    // metadata is any arbitrary metadata to attached to the member.
    bytes metadata = 3;
}
```

### 组账户

组账户是与组和决策策略相关联的账户。组账户确实有余额。

组账户是从组中抽象出来的，因为单个组可能对不同类型的操作有多个决策策略。将组成员管理与决策策略分开管理可以减少开销，并保持不同策略下的成员一致性。推荐的模式是为给定的组创建一个单一的主组账户，然后创建具有不同决策策略的单独的组账户，并使用[`x/authz`模块](adr-030-authz-module.md)将所需权限从主账户委派给这些“子账户”。

```protobuf
message GroupAccountInfo {

    // address is the group account address.
    string address = 1;

    // group_id is the ID of the Group the GroupAccount belongs to.
    uint64 group_id = 2;

    // admin is the account address of the group admin.
    string admin = 3;

    // metadata is any arbitrary metadata of this group account.
    bytes metadata = 4;

    // version is used to track changes to a group's GroupAccountInfo structure that
    // invalidates active proposal from old versions.
    uint64 version = 5;

    // decision_policy specifies the group account's decision policy.
    google.protobuf.Any decision_policy = 6 [(cosmos_proto.accepts_interface) = "cosmos.group.v1.DecisionPolicy"];
}
```

同样地，一个群组账户管理员可以更新其元数据、决策策略或设置一个新的群组账户管理员。

一个群组账户也可以是一个群组的管理员或成员。
例如，一个群组管理员可以是另一个群组账户，它可以“选举”成员，或者它可以是同一个群组选举自己。

### 决策策略

决策策略是群组成员可以对提案进行投票的机制。

所有的决策策略都应该有一个最小和最大的投票窗口。
最小投票窗口是必须经过的最短持续时间，以便提案有可能通过，它可以设置为0。最大投票窗口是提案可以被投票和执行的最长时间，如果在关闭之前获得足够的支持。这两个值都必须小于全链的最大投票窗口参数。

我们定义了`DecisionPolicy`接口，所有的决策策略都必须实现该接口：

```go
type DecisionPolicy interface {
	codec.ProtoMarshaler

	ValidateBasic() error
	GetTimeout() types.Duration
	Allow(tally Tally, totalPower string, votingDuration time.Duration) (DecisionPolicyResult, error)
	Validate(g GroupInfo) error
}

type DecisionPolicyResult struct {
	Allow bool
	Final bool
}
```

#### 阈值决策策略

阈值决策策略定义了一个提案通过所需的最小支持票数（_yes_），基于投票者的权重统计。对于这个决策策略，弃权和否决被视为无支持（_no_）。

```protobuf
message ThresholdDecisionPolicy {

    // threshold is the minimum weighted sum of support votes for a proposal to succeed.
    string threshold = 1;

    // voting_period is the duration from submission of a proposal to the end of voting period
    // Within this period, votes and exec messages can be submitted.
    google.protobuf.Duration voting_period = 2 [(gogoproto.nullable) = false];
}
```

### 提案

组中的任何成员都可以提交一个提案供组账户决定。
提案由一组 `sdk.Msg` 组成，如果提案通过，则将执行这些 `sdk.Msg`，并附带与提案相关的任何元数据。这些 `sdk.Msg` 在 `Msg/CreateProposal` 请求验证的一部分中进行验证。它们还应将其签名者设置为组账户。

在内部，提案还跟踪以下内容：

* 当前的 `Status`：已提交、已关闭或已中止
* 其 `Result`：未最终确定、已接受或已拒绝
* 其 `VoteState`，以 `Tally` 的形式表示，该 `Tally` 在新投票和执行提案时进行计算。

```protobuf
// Tally represents the sum of weighted votes.
message Tally {
    option (gogoproto.goproto_getters) = false;

    // yes_count is the weighted sum of yes votes.
    string yes_count = 1;

    // no_count is the weighted sum of no votes.
    string no_count = 2;

    // abstain_count is the weighted sum of abstainers.
    string abstain_count = 3;

    // veto_count is the weighted sum of vetoes.
    string veto_count = 4;
}
```

### 投票

组中的成员可以对提案进行投票。在投票时有四个选择 - 赞成、反对、弃权和否决。并非所有的决策策略都支持这些选项。投票可以包含一些可选的元数据。
在当前的实现中，一旦提交了提案，投票窗口就会开始。

投票会在内部更新提案的 `VoteState`，并在需要时更新 `Status` 和 `Result`。

### 执行提案

在当前的设计中，链不会自动执行提案，而是用户必须提交 `Msg/Exec` 交易来尝试根据当前的投票和决策策略执行提案。未来的升级可能会自动化此过程，并由组账户（或费用授权者）支付。

#### 更改组成员

在当前的实现中，在提交提案后更新组或组账户将使其无效。如果有人调用 `Msg/Exec`，它将简单地失败，并最终被垃圾回收。

### 当前实现的注意事项

本节概述了组模块概念验证中使用的当前实现，但这可能会有所变化和迭代。

#### ORM

[ORM 包](https://github.com/cosmos/cosmos-sdk/discussions/9156) 定义了在组模块中使用的表、序列和二级索引。

组以 `groupTable` 的形式存储在状态中，其中 `group_id` 是自增整数。组成员存储在 `groupMemberTable` 中。

组账户存储在 `groupAccountTable` 中。组账户地址是基于自增整数生成的，该整数用于从 `ADR-033` 中派生组模块的 `RootModuleKey` 到 `DerivedModuleKey`。组账户通过 `x/auth` 添加为新的 `ModuleAccount`。

提案存储在 `proposalTable` 中作为 `Proposal` 类型的一部分。`proposal_id` 是一个自增整数。

投票存储在 `voteTable` 中。主键基于投票的 `proposal_id` 和投票人的账户地址。

#### ADR-033 用于路由提案消息

由 [ADR-033](adr-033-protobuf-inter-module-comm.md) 引入的模块间通信可以使用与提案的组账户对应的 `DerivedModuleKey` 来路由提案的消息。

## 影响

### 积极影响

* 改进了多签名账户的用户体验，允许密钥轮换和自定义决策策略。

### 负面影响

### 中性影响

* 它使用了 ADR 033，因此需要在 Cosmos SDK 中实现，但这并不一定意味着需要对现有的 Cosmos SDK 模块进行大规模重构。
* 组模块的当前实现使用了 ORM 包。

## 进一步讨论

* `/group` 和 `x/gov` 的融合，因为两者都支持提案和投票：https://github.com/cosmos/cosmos-sdk/discussions/9066
* `x/group` 可能的未来改进：
    * 在提交时执行提案（https://github.com/regen-network/regen-ledger/issues/288）
    * 撤销提案（https://github.com/regen-network/cosmos-modules/issues/41）
    * 使 `Tally` 更加灵活，支持非二进制选择

## 参考资料

* 初始规范：
    * https://gist.github.com/aaronc/b60628017352df5983791cad30babe56#group-module
    * [#5236](https://github.com/cosmos/cosmos-sdk/pull/5236)
* 提案将 `x/group` 添加到 Cosmos SDK 中：[#7633](https://github.com/cosmos/cosmos-sdk/issues/7633)


# ADR 042: Group Module

## Changelog

* 2020/04/09: Initial Draft

## Status

Draft

## Abstract

This ADR defines the `x/group` module which allows the creation and management of on-chain multi-signature accounts and enables voting for message execution based on configurable decision policies.

## Context

The legacy amino multi-signature mechanism of the Cosmos SDK has certain limitations:

* Key rotation is not possible, although this can be solved with [account rekeying](adr-034-account-rekeying.md).
* Thresholds can't be changed.
* UX is cumbersome for non-technical users ([#5661](https://github.com/cosmos/cosmos-sdk/issues/5661)).
* It requires `legacy_amino` sign mode ([#8141](https://github.com/cosmos/cosmos-sdk/issues/8141)).

While the group module is not meant to be a total replacement for the current multi-signature accounts, it provides a solution to the limitations described above, with a more flexible key management system where keys can be added, updated or removed, as well as configurable thresholds.
It's meant to be used with other access control modules such as [`x/feegrant`](adr-029-fee-grant-module.md) ans [`x/authz`](adr-030-authz-module.md) to simplify key management for individuals and organizations.

The proof of concept of the group module can be found in https://github.com/regen-network/regen-ledger/tree/master/proto/regen/group/v1alpha1 and https://github.com/regen-network/regen-ledger/tree/master/x/group.

## Decision

We propose merging the `x/group` module with its supporting [ORM/Table Store package](https://github.com/regen-network/regen-ledger/tree/master/orm) ([#7098](https://github.com/cosmos/cosmos-sdk/issues/7098)) into the Cosmos SDK and continuing development here. There will be a dedicated ADR for the ORM package.

### Group

A group is a composition of accounts with associated weights. It is not
an account and doesn't have a balance. It doesn't in and of itself have any
sort of voting or decision weight.
Group members can create proposals and vote on them through group accounts using different decision policies.

It has an `admin` account which can manage members in the group, update the group
metadata and set a new admin.

```protobuf
message GroupInfo {

    // group_id is the unique ID of this group.
    uint64 group_id = 1;

    // admin is the account address of the group's admin.
    string admin = 2;

    // metadata is any arbitrary metadata to attached to the group.
    bytes metadata = 3;

    // version is used to track changes to a group's membership structure that
    // would break existing proposals. Whenever a member weight has changed,
    // or any member is added or removed, the version is incremented and will
    // invalidate all proposals from older versions.
    uint64 version = 4;

    // total_weight is the sum of the group members' weights.
    string total_weight = 5;
}
```

```protobuf
message GroupMember {

    // group_id is the unique ID of the group.
    uint64 group_id = 1;

    // member is the member data.
    Member member = 2;
}

// Member represents a group member with an account address,
// non-zero weight and metadata.
message Member {

    // address is the member's account address.
    string address = 1;

    // weight is the member's voting weight that should be greater than 0.
    string weight = 2;

    // metadata is any arbitrary metadata to attached to the member.
    bytes metadata = 3;
}
```

### Group Account

A group account is an account associated with a group and a decision policy.
A group account does have a balance.

Group accounts are abstracted from groups because a single group may have
multiple decision policies for different types of actions. Managing group
membership separately from decision policies results in the least overhead
and keeps membership consistent across different policies. The pattern that
is recommended is to have a single master group account for a given group,
and then to create separate group accounts with different decision policies
and delegate the desired permissions from the master account to
those "sub-accounts" using the [`x/authz` module](adr-030-authz-module.md).

```protobuf
message GroupAccountInfo {

    // address is the group account address.
    string address = 1;

    // group_id is the ID of the Group the GroupAccount belongs to.
    uint64 group_id = 2;

    // admin is the account address of the group admin.
    string admin = 3;

    // metadata is any arbitrary metadata of this group account.
    bytes metadata = 4;

    // version is used to track changes to a group's GroupAccountInfo structure that
    // invalidates active proposal from old versions.
    uint64 version = 5;

    // decision_policy specifies the group account's decision policy.
    google.protobuf.Any decision_policy = 6 [(cosmos_proto.accepts_interface) = "cosmos.group.v1.DecisionPolicy"];
}
```

Similarly to a group admin, a group account admin can update its metadata, decision policy or set a new group account admin.

A group account can also be an admin or a member of a group.
For instance, a group admin could be another group account which could "elects" the members or it could be the same group that elects itself.

### Decision Policy

A decision policy is the mechanism by which members of a group can vote on
proposals.

All decision policies should have a minimum and maximum voting window.
The minimum voting window is the minimum duration that must pass in order
for a proposal to potentially pass, and it may be set to 0. The maximum voting
window is the maximum time that a proposal may be voted on and executed if
it reached enough support before it is closed.
Both of these values must be less than a chain-wide max voting window parameter.

We define the `DecisionPolicy` interface that all decision policies must implement:

```go
type DecisionPolicy interface {
	codec.ProtoMarshaler

	ValidateBasic() error
	GetTimeout() types.Duration
	Allow(tally Tally, totalPower string, votingDuration time.Duration) (DecisionPolicyResult, error)
	Validate(g GroupInfo) error
}

type DecisionPolicyResult struct {
	Allow bool
	Final bool
}
```

#### Threshold decision policy

A threshold decision policy defines a minimum support votes (_yes_), based on a tally
of voter weights, for a proposal to pass. For
this decision policy, abstain and veto are treated as no support (_no_).

```protobuf
message ThresholdDecisionPolicy {

    // threshold is the minimum weighted sum of support votes for a proposal to succeed.
    string threshold = 1;

    // voting_period is the duration from submission of a proposal to the end of voting period
    // Within this period, votes and exec messages can be submitted.
    google.protobuf.Duration voting_period = 2 [(gogoproto.nullable) = false];
}
```

### Proposal

Any member of a group can submit a proposal for a group account to decide upon.
A proposal consists of a set of `sdk.Msg`s that will be executed if the proposal
passes as well as any metadata associated with the proposal. These `sdk.Msg`s get validated as part of the `Msg/CreateProposal` request validation. They should also have their signer set as the group account.

Internally, a proposal also tracks:

* its current `Status`: submitted, closed or aborted
* its `Result`: unfinalized, accepted or rejected
* its `VoteState` in the form of a `Tally`, which is calculated on new votes and when executing the proposal.

```protobuf
// Tally represents the sum of weighted votes.
message Tally {
    option (gogoproto.goproto_getters) = false;

    // yes_count is the weighted sum of yes votes.
    string yes_count = 1;

    // no_count is the weighted sum of no votes.
    string no_count = 2;

    // abstain_count is the weighted sum of abstainers.
    string abstain_count = 3;

    // veto_count is the weighted sum of vetoes.
    string veto_count = 4;
}
```

### Voting

Members of a group can vote on proposals. There are four choices to choose while voting - yes, no, abstain and veto. Not
all decision policies will support them. Votes can contain some optional metadata.
In the current implementation, the voting window begins as soon as a proposal
is submitted.

Voting internally updates the proposal `VoteState` as well as `Status` and `Result` if needed.

### Executing Proposals

Proposals will not be automatically executed by the chain in this current design,
but rather a user must submit a `Msg/Exec` transaction to attempt to execute the
proposal based on the current votes and decision policy. A future upgrade could
automate this and have the group account (or a fee granter) pay.

#### Changing Group Membership

In the current implementation, updating a group or a group account after submitting a proposal will make it invalid. It will simply fail if someone calls `Msg/Exec` and will eventually be garbage collected.

### Notes on current implementation

This section outlines the current implementation used in the proof of concept of the group module but this could be subject to changes and iterated on.

#### ORM

The [ORM package](https://github.com/cosmos/cosmos-sdk/discussions/9156) defines tables, sequences and secondary indexes which are used in the group module.

Groups are stored in state as part of a `groupTable`, the `group_id` being an auto-increment integer. Group members are stored in a `groupMemberTable`.

Group accounts are stored in a `groupAccountTable`. The group account address is generated based on an auto-increment integer which is used to derive the group module `RootModuleKey` into a `DerivedModuleKey`, as stated in [ADR-033](adr-033-protobuf-inter-module-comm.md#modulekeys-and-moduleids). The group account is added as a new `ModuleAccount` through `x/auth`.

Proposals are stored as part of the `proposalTable` using the `Proposal` type. The `proposal_id` is an auto-increment integer.

Votes are stored in the `voteTable`. The primary key is based on the vote's `proposal_id` and `voter` account address.

#### ADR-033 to route proposal messages

Inter-module communication introduced by [ADR-033](adr-033-protobuf-inter-module-comm.md) can be used to route a proposal's messages using the `DerivedModuleKey` corresponding to the proposal's group account.

## Consequences

### Positive

* Improved UX for multi-signature accounts allowing key rotation and custom decision policies.

### Negative

### Neutral

* It uses ADR 033 so it will need to be implemented within the Cosmos SDK, but this doesn't imply necessarily any large refactoring of existing Cosmos SDK modules.
* The current implementation of the group module uses the ORM package.

## Further Discussions

* Convergence of `/group` and `x/gov` as both support proposals and voting: https://github.com/cosmos/cosmos-sdk/discussions/9066
* `x/group` possible future improvements:
    * Execute proposals on submission (https://github.com/regen-network/regen-ledger/issues/288)
    * Withdraw a proposal (https://github.com/regen-network/cosmos-modules/issues/41)
    * Make `Tally` more flexible and support non-binary choices

## References

* Initial specification:
    * https://gist.github.com/aaronc/b60628017352df5983791cad30babe56#group-module
    * [#5236](https://github.com/cosmos/cosmos-sdk/pull/5236)
* Proposal to add `x/group` into the Cosmos SDK: [#7633](https://github.com/cosmos/cosmos-sdk/issues/7633)
