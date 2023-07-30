# `x/group`

## 摘要

以下文件详细说明了组模块。

该模块允许在链上创建和管理多签账户，并基于可配置的决策策略对消息执行进行投票。

## 目录

* [概念](#概念)
    * [组](#组)
    * [组策略](#组策略)
    * [决策策略](#决策策略)
    * [提案](#提案)
    * [修剪](#修剪)
* [状态](#状态)
    * [组表](#组表)
    * [组成员表](#组成员表)
    * [组策略表](#组策略表)
    * [提案表](#提案表)
    * [投票表](#投票表)
* [消息服务](#消息服务)
    * [Msg/CreateGroup](#msgcreategroup)
    * [Msg/UpdateGroupMembers](#msgupdategroupmembers)
    * [Msg/UpdateGroupAdmin](#msgupdategroupadmin)
    * [Msg/UpdateGroupMetadata](#msgupdategroupmetadata)
    * [Msg/CreateGroupPolicy](#msgcreategrouppolicy)
    * [Msg/CreateGroupWithPolicy](#msgcreategroupwithpolicy)
    * [Msg/UpdateGroupPolicyAdmin](#msgupdategrouppolicyadmin)
    * [Msg/UpdateGroupPolicyDecisionPolicy](#msgupdategrouppolicydecisionpolicy)
    * [Msg/UpdateGroupPolicyMetadata](#msgupdategrouppolicymetadata)
    * [Msg/SubmitProposal](#msgsubmitproposal)
    * [Msg/WithdrawProposal](#msgwithdrawproposal)
    * [Msg/Vote](#msgvote)
    * [Msg/Exec](#msgexec)
    * [Msg/LeaveGroup](#msgleavegroup)
* [事件](#事件)
    * [EventCreateGroup](#eventcreategroup)
    * [EventUpdateGroup](#eventupdategroup)
    * [EventCreateGroupPolicy](#eventcreategrouppolicy)
    * [EventUpdateGroupPolicy](#eventupdategrouppolicy)
    * [EventCreateProposal](#eventcreateproposal)
    * [EventWithdrawProposal](#eventwithdrawproposal)
    * [EventVote](#eventvote)
    * [EventExec](#eventexec)
    * [EventLeaveGroup](#eventleavegroup)
* [客户端](#客户端)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)
* [元数据](#元数据)

## 概念

### 组

组只是具有关联权重的账户的聚合。它不是一个账户，也没有余额。它本身没有任何投票或决策权重。它有一个"管理员"，该管理员有能力添加、删除和更新组中的成员。请注意，组策略账户可以是组的管理员，并且管理员不一定是组的成员。

### 群组策略

群组策略是与群组和决策策略相关联的帐户。
群组策略与群组分离，因为一个群组可能对不同类型的操作有多个决策策略。
将群组成员管理与决策策略分开可以减少开销，并保持不同策略之间的成员一致性。
推荐的模式是为给定的群组创建一个主群组策略，然后创建具有不同决策策略的单独群组策略，并使用 `x/authz` 模块将所需权限从主帐户委派给这些 "子帐户"。

### 决策策略

决策策略是群组成员可以对提案进行投票的机制，以及根据投票结果决定提案是否通过的规则。

所有决策策略通常都会有一个最小执行期和一个最大投票窗口。
最小执行期是提交后必须经过的最短时间，以便提案有可能被执行，它可以设置为 0。
最大投票窗口是提交后提案可以进行投票的最长时间，超过该时间后将进行计票。

链开发者还定义了一个应用程序范围内的最大执行期，即在提案的投票期结束后，用户被允许执行提案的最长时间。

当前的群组模块附带了两个决策策略：阈值和百分比。
任何链开发者都可以通过创建自定义决策策略来扩展这两个策略，只要它们符合 `DecisionPolicy` 接口：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/types.go#L27-L45
```

#### 阈值决策策略

阈值决策策略定义了必须达到的赞成票阈值（基于投票者权重的计票结果）才能使提案通过。
对于此决策策略，弃权和否决都被视为反对票。

该决策策略还有一个投票期窗口和一个最小执行期窗口。
前者定义了提案提交后成员被允许投票的持续时间，之后进行计票。
后者指定了提案提交后可以执行的最短持续时间。
如果设置为 0，则允许在提交后立即执行提案（使用 `TRY_EXEC` 选项）。
显然，最小执行期不能大于投票期+最大执行期（其中最大执行期是应用程序定义的持续时间，指定了投票结束后提案可以执行的窗口）。

#### 百分比决策策略

百分比决策策略与阈值决策策略类似，只是阈值不是定义为常量权重，而是定义为百分比。它更适用于组中成员的权重可以更新的情况，因为百分比阈值保持不变，不依赖于成员权重的更新方式。

与阈值决策策略相同，百分比决策策略具有两个 VotingPeriod 和 MinExecutionPeriod 参数。

### 提案

组中的任何成员都可以提交一个用于决定组策略账户的提案。提案包括一组消息，如果提案通过，这些消息将被执行，以及与提案相关的任何元数据。

#### 投票

在投票时有四个选择 - 是、否、弃权和否决。并非所有决策策略都会考虑这四个选择。投票可以包含一些可选的元数据。在当前实现中，投票窗口在提案提交后立即开始，并且结束时间由组策略的决策策略定义。

#### 撤回提案

提案可以在投票期结束之前的任何时间被撤回，可以由组策略的管理员或其中一个提案人撤回。一旦撤回，它将被标记为“PROPOSAL_STATUS_WITHDRAWN”，不允许对其进行更多的投票或执行。

#### 中止的提案

如果在提案的投票期间更新了组策略，则将提案标记为“PROPOSAL_STATUS_ABORTED”，不允许对其进行更多的投票或执行。这是因为组策略定义了提案投票和执行的规则，因此如果这些规则在提案的生命周期内发生变化，则应将提案标记为过时。

#### 计票

计票是对提案上所有投票的计数。它仅在提案的生命周期中发生一次，但可以由两个因素触发，以先到者为准：

* 或者有人尝试执行提案（参见下一节），这可以在 `Msg/Exec` 交易或设置了 `Exec` 字段的 `Msg/{SubmitProposal,Vote}` 交易上发生。当尝试执行提案时，首先进行计票以确保提案通过。
* 或者在 `EndBlock` 时，提案的投票期结束刚刚过去。

如果计票结果符合决策策略的规则，则将提案标记为`PROPOSAL_STATUS_ACCEPTED`，否则标记为`PROPOSAL_STATUS_REJECTED`。无论如何，不再允许进行投票，并且计票结果将持久化到提案的`FinalTallyResult`中。

#### 执行提案

只有在计票完成并且群组账户的决策策略根据计票结果允许提案通过时，提案才会被执行。它们的状态被标记为`PROPOSAL_STATUS_ACCEPTED`。在每个提案的投票期结束后，执行必须在`MaxExecutionPeriod`（由链开发者设置）的时间内完成。

在当前设计中，链不会自动执行提案，而是用户必须提交`Msg/Exec`交易来尝试执行基于当前投票和决策策略的提案。任何用户（不仅仅是群组成员）都可以执行已被接受的提案，并且执行费用由提案执行者支付。
还可以尝试在创建提案或使用`Msg/SubmitProposal`和`Msg/Vote`请求的`Exec`字段进行新投票时立即执行提案。
在前一种情况下，提案人的签名被视为赞成票。
在这些情况下，如果无法执行提案（即未通过决策策略的规则），它仍将开放进行新的投票，并且可能在以后进行计票和执行。

成功的提案执行将其`ExecutorResult`标记为`PROPOSAL_EXECUTOR_RESULT_SUCCESS`。提案将在执行后自动修剪。另一方面，执行失败的提案将被标记为`PROPOSAL_EXECUTOR_RESULT_FAILURE`。这样的提案可以多次重新执行，直到在投票期结束后的`MaxExecutionPeriod`到期为止。

### 修剪

为了避免状态膨胀，提案和投票会自动修剪。

投票会被修剪：

* 在成功的计票之后，即计票结果符合决策策略的规则，可以通过设置`Msg/Exec`或`Msg/{SubmitProposal,Vote}`的`Exec`字段来触发，
* 或在提案的投票期结束后的`EndBlock`时。这也适用于状态为`aborted`或`withdrawn`的提案。

无论哪个先发生。

提案被修剪：

* 在投票期结束前的 `EndBlock` 上，如果提案状态为 `withdrawn` 或 `aborted`，则在计票之前，
* 并且在成功执行提案后，
* 或者在提案的 `voting_period_end` + `max_execution_period`（定义为应用程序范围的配置）经过后的 `EndBlock` 上，

无论哪个先发生。

## 状态

`group` 模块使用 `orm` 包，该包提供了支持主键和二级索引的表存储。`orm` 还定义了 `Sequence`，它是基于计数器的持久唯一键生成器，可以与 `Table` 一起使用。

以下是作为 `group` 模块的一部分存储的表和关联的序列和索引的列表。

### Group 表

`groupTable` 存储 `GroupInfo`：`0x0 | BigEndian(GroupId) -> ProtocolBuffer(GroupInfo)`。

#### groupSeq

当创建一个新的群组时，`groupSeq` 的值会递增，并对应于新的 `GroupId`：`0x1 | 0x1 -> BigEndian`。

第二个 `0x1` 对应于 ORM 的 `sequenceStorageKey`。

#### groupByAdminIndex

`groupByAdminIndex` 允许通过管理员地址检索群组：
`0x2 | len([]byte(group.Admin)) | []byte(group.Admin) | BigEndian(GroupId) -> []byte()`。

### Group Member 表

`groupMemberTable` 存储 `GroupMember`：`0x10 | BigEndian(GroupId) | []byte(member.Address) -> ProtocolBuffer(GroupMember)`。

`groupMemberTable` 是一个主键表，其 `PrimaryKey` 由 `BigEndian(GroupId) | []byte(member.Address)` 组成，该键由以下索引使用。

#### groupMemberByGroupIndex

`groupMemberByGroupIndex` 允许通过群组 ID 检索群组成员：
`0x11 | BigEndian(GroupId) | PrimaryKey -> []byte()`。

#### groupMemberByMemberIndex

`groupMemberByMemberIndex` 允许通过成员地址检索群组成员：
`0x12 | len([]byte(member.Address)) | []byte(member.Address) | PrimaryKey -> []byte()`。

### Group Policy 表

`groupPolicyTable` 存储 `GroupPolicyInfo`：`0x20 | len([]byte(Address)) | []byte(Address) -> ProtocolBuffer(GroupPolicyInfo)`。

`groupPolicyTable` 是一个主键表，其 `PrimaryKey` 由 `len([]byte(Address)) | []byte(Address)` 给出，该值被以下索引使用。

#### groupPolicySeq

`groupPolicySeq` 的值在创建新的组策略时递增，并用于生成新的组策略账户 `Address`：`0x21 | 0x1 -> BigEndian`。

第二个 `0x1` 对应于 ORM `sequenceStorageKey`。

#### groupPolicyByGroupIndex

`groupPolicyByGroupIndex` 允许通过组 ID 检索组策略：`0x22 | BigEndian(GroupId) | PrimaryKey -> []byte()`。

#### groupPolicyByAdminIndex

`groupPolicyByAdminIndex` 允许通过管理员地址检索组策略：`0x23 | len([]byte(Address)) | []byte(Address) | PrimaryKey -> []byte()`。

### Proposal Table

`proposalTable` 存储 `Proposal`：`0x30 | BigEndian(ProposalId) -> ProtocolBuffer(Proposal)`。

#### proposalSeq

`proposalSeq` 的值在创建新的提案时递增，并对应于新的 `ProposalId`：`0x31 | 0x1 -> BigEndian`。

第二个 `0x1` 对应于 ORM `sequenceStorageKey`。

#### proposalByGroupPolicyIndex

`proposalByGroupPolicyIndex` 允许通过组策略账户地址检索提案：`0x32 | len([]byte(account.Address)) | []byte(account.Address) | BigEndian(ProposalId) -> []byte()`。

#### ProposalsByVotingPeriodEndIndex

`proposalsByVotingPeriodEndIndex` 允许按照时间顺序检索提案，按照 `voting_period_end` 排序：`0x33 | sdk.FormatTimeBytes(proposal.VotingPeriodEnd) | BigEndian(ProposalId) -> []byte()`。

此索引在投票期结束时对提案投票进行统计，并在 `VotingPeriodEnd + MaxExecutionPeriod` 时修剪提案时使用。

### Vote Table

`voteTable` 存储 `Vote`：`0x40 | BigEndian(ProposalId) | []byte(voter.Address) -> ProtocolBuffer(Vote)`。

`voteTable` 是一个主键表，其 `PrimaryKey` 由 `BigEndian(ProposalId) | []byte(voter.Address)` 给出，该值被以下索引使用。

#### voteByProposalIndex

`voteByProposalIndex` 允许通过提案 ID 检索投票：`0x41 | BigEndian(ProposalId) | PrimaryKey -> []byte()`。

#### voteByVoterIndex

`voteByVoterIndex` 允许通过投票人地址检索投票：
`0x42 | len([]byte(voter.Address)) | []byte(voter.Address) | PrimaryKey -> []byte()`。

## Msg 服务

### Msg/CreateGroup

可以使用 `MsgCreateGroup` 创建一个新的群组，其中包含管理员地址、成员列表和一些可选的元数据。

元数据的最大长度由应用程序开发者选择，并作为配置传递给群组保管人。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L67-L80
```

如果满足以下条件，预计会失败：

* 元数据长度大于 `MaxMetadataLen` 配置
* 成员设置不正确（例如，地址格式错误、重复或权重为0）。

### Msg/UpdateGroupMembers

可以使用 `UpdateGroupMembers` 更新群组成员。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L88-L102
```

在 `MemberUpdates` 列表中，可以通过将成员的权重设置为0来删除现有成员。

如果满足以下条件，预计会失败：

* 签名者不是群组的管理员。
* 对于任何一个关联的群组策略，如果其决策策略的 `Validate()` 方法与更新后的群组不符合。

### Msg/UpdateGroupAdmin

可以使用 `UpdateGroupAdmin` 更新群组管理员。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L107-L120
```

如果满足以下条件，预计会失败：

* 签名者不是群组的管理员。

### Msg/UpdateGroupMetadata

可以使用 `UpdateGroupMetadata` 更新群组元数据。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L125-L138
```

如果满足以下条件，预计会失败：

* 新的元数据长度大于 `MaxMetadataLen` 配置。
* 签名者不是群组的管理员。

### Msg/CreateGroupPolicy

可以使用 `MsgCreateGroupPolicy` 创建一个新的群组策略，其中包含管理员地址、群组 ID、决策策略和一些可选的元数据。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L147-L165
```

如果出现以下情况，预计会失败：

* 签名者不是该组的管理员。
* 元数据长度大于 `MaxMetadataLen` 配置。
* 决策策略的 `Validate()` 方法在该组上未通过。

### Msg/CreateGroupWithPolicy

可以使用 `MsgCreateGroupWithPolicy` 创建一个带有策略的新组，其中包含管理员地址、成员列表、决策策略、`group_policy_as_admin` 字段（可选，用于将组和组策略管理员设置为组策略地址）以及一些可选的组和组策略元数据。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L191-L215
```

与 `Msg/CreateGroup` 和 `Msg/CreateGroupPolicy` 相同的原因，预计会失败。

### Msg/UpdateGroupPolicyAdmin

可以使用 `UpdateGroupPolicyAdmin` 更新组策略管理员。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L173-L186
```

如果签名者不是组策略的管理员，则预计会失败。

### Msg/UpdateGroupPolicyDecisionPolicy

可以使用 `UpdateGroupPolicyDecisionPolicy` 更新决策策略。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L226-L241
```

如果出现以下情况，预计会失败：

* 签名者不是组策略的管理员。
* 新的决策策略的 `Validate()` 方法在该组上未通过。

### Msg/UpdateGroupPolicyMetadata

可以使用 `UpdateGroupPolicyMetadata` 更新组策略元数据。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L246-L259
```

如果出现以下情况，预计会失败：

* 新的元数据长度大于 `MaxMetadataLen` 配置。
* 签名者不是该组的管理员。

### Msg/SubmitProposal

可以使用 `MsgSubmitProposal` 创建一个新的提案，其中包含组策略账户地址、提案者地址列表、如果提案被接受要执行的消息列表以及一些可选的元数据。
在此情况下，可以提供可选的 `Exec` 值，以在提案创建后立即尝试执行提案。在这种情况下，提案者的签名被视为赞成票。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L281-L315
```

如果满足以下条件，预计会失败：

* 元数据、标题或摘要的长度大于 `MaxMetadataLen` 配置。
* 任何提议者都不是组成员。

### Msg/WithdrawProposal

可以使用 `MsgWithdrawProposal` 撤销提案，该提案具有一个 `address`（可以是提议者或组策略管理员）和一个 `proposal_id`（必须撤销）。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L323-L333
```

如果满足以下条件，预计会失败：

* 签名者既不是组策略管理员也不是提案的提议者。
* 提案已经关闭或中止。

### Msg/Vote

可以使用 `MsgVote` 创建一个新的投票，给定提案 ID、投票人地址、选择（是、否、否决或弃权）和一些可选的元数据。
可以提供可选的 `Exec` 值，以在投票后尝试立即执行提案。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L338-L358
```

如果满足以下条件，预计会失败：

* 元数据的长度大于 `MaxMetadataLen` 配置。
* 提案不再处于投票期。

### Msg/Exec

可以使用 `MsgExec` 执行提案。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L363-L373
```

如果满足以下条件，这个提案的消息将不会被执行：

* 提案尚未被组策略接受。
* 提案已经成功执行。

### Msg/LeaveGroup

`MsgLeaveGroup` 允许组成员离开一个组。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L381-L391
```

如果满足以下条件，预计会失败：

* 组成员不是该组的一部分。
* 对于任何一个关联的组策略，如果其决策策略的 `Validate()` 方法与更新后的组不符合。

## 事件

组模块会发出以下事件：

### EventCreateGroup（创建群组事件）

| 类型                             | 属性键        | 属性值                           |
| -------------------------------- | ------------- | -------------------------------- |
| message                          | action        | /cosmos.group.v1.Msg/CreateGroup |
| cosmos.group.v1.EventCreateGroup | group_id      | {groupId}                        |

### EventUpdateGroup（更新群组事件）

| 类型                             | 属性键        | 属性值                                                                 |
| -------------------------------- | ------------- | ---------------------------------------------------------------------- |
| message                          | action        | /cosmos.group.v1.Msg/UpdateGroup{Admin\|Metadata\|Members}              |
| cosmos.group.v1.EventUpdateGroup | group_id      | {groupId}                                                             |

### EventCreateGroupPolicy（创建群组策略事件）

| 类型                                   | 属性键        | 属性值                                 |
| -------------------------------------- | ------------- | -------------------------------------- |
| message                                | action        | /cosmos.group.v1.Msg/CreateGroupPolicy |
| cosmos.group.v1.EventCreateGroupPolicy | address       | {groupPolicyAddress}                   |

### EventUpdateGroupPolicy（更新群组策略事件）

| 类型                                   | 属性键        | 属性值                                                                         |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| message                                | action        | /cosmos.group.v1.Msg/UpdateGroupPolicy{Admin\|Metadata\|DecisionPolicy}         |
| cosmos.group.v1.EventUpdateGroupPolicy | address       | {groupPolicyAddress}                                                           |

### EventCreateProposal（创建提案事件）

| 类型                                | 属性键        | 属性值                            |
| ----------------------------------- | ------------- | ---------------------------------- |
| message                             | action        | /cosmos.group.v1.Msg/CreateProposal |
| cosmos.group.v1.EventCreateProposal | proposal_id   | {proposalId}                       |

### EventWithdrawProposal

| 类型                                  | 属性键        | 属性值                       |
| ------------------------------------- | ------------- | ---------------------------- |
| message                               | action        | /cosmos.group.v1.Msg/WithdrawProposal |
| cosmos.group.v1.EventWithdrawProposal | proposal_id   | {proposalId}                          |

### EventVote

| 类型                      | 属性键 | 属性值           |
| ------------------------- | ------------- | ------------------------- |
| message                   | action        | /cosmos.group.v1.Msg/Vote |
| cosmos.group.v1.EventVote | proposal_id   | {proposalId}              |

## EventExec

| 类型                      | 属性键 | 属性值           |
| ------------------------- | ------------- | ------------------------- |
| message                   | action        | /cosmos.group.v1.Msg/Exec |
| cosmos.group.v1.EventExec | proposal_id   | {proposalId}              |
| cosmos.group.v1.EventExec | logs          | {logs_string}             |

### EventLeaveGroup

| 类型                            | 属性键 | 属性值                 |
| ------------------------------- | ------------- | ------------------------------- |
| message                         | action        | /cosmos.group.v1.Msg/LeaveGroup |
| cosmos.group.v1.EventLeaveGroup | proposal_id   | {proposalId}                    |
| cosmos.group.v1.EventLeaveGroup | address       | {address}                       |


## Client

### CLI

用户可以使用CLI查询和与`group`模块进行交互。

#### 查询

`query`命令允许用户查询`group`状态。

```bash
simd query group --help
```

##### group-info

`group-info`命令允许用户通过给定的组ID查询组信息。

```bash
simd query group group-info [id] [flags]
```

示例：

```bash
simd query group group-info 1
```

示例输出：

```bash
admin: cosmos1..
group_id: "1"
metadata: AQ==
total_weight: "3"
version: "1"
```

##### group-policy-info

`group-policy-info`命令允许用户通过组策略的账户地址查询组策略信息。

```bash
simd查询组group-policy-info [group-policy-account] [flags]
```

示例：

```bash
simd查询组group-policy-info cosmos1..
```

示例输出：

```bash
address: cosmos1..
admin: cosmos1..
decision_policy:
  '@type': /cosmos.group.v1.ThresholdDecisionPolicy
  threshold: "1"
  windows:
      min_execution_period: 0s
      voting_period: 432000s
group_id: "1"
metadata: AQ==
version: "1"
```

##### group-members

`group-members`命令允许用户使用分页标志按组ID查询组成员。

```bash
simd查询组group-members [id] [flags]
```

示例：

```bash
simd查询组group-members 1
```

示例输出：

```bash
members:
- group_id: "1"
  member:
    address: cosmos1..
    metadata: AQ==
    weight: "2"
- group_id: "1"
  member:
    address: cosmos1..
    metadata: AQ==
    weight: "1"
pagination:
  next_key: null
  total: "2"
```

##### groups-by-admin

`groups-by-admin`命令允许用户使用分页标志按管理员账户地址查询组。

```bash
simd查询组groups-by-admin [admin] [flags]
```

示例：

```bash
simd查询组groups-by-admin cosmos1..
```

示例输出：

```bash
groups:
- admin: cosmos1..
  group_id: "1"
  metadata: AQ==
  total_weight: "3"
  version: "1"
- admin: cosmos1..
  group_id: "2"
  metadata: AQ==
  total_weight: "3"
  version: "1"
pagination:
  next_key: null
  total: "2"
```

##### group-policies-by-group

`group-policies-by-group`命令允许用户使用分页标志按组ID查询组策略。

```bash
simd查询组group-policies-by-group [group-id] [flags]
```

示例：

```bash
simd查询组group-policies-by-group 1
```

示例输出：

```bash
group_policies:
- address: cosmos1..
  admin: cosmos1..
  decision_policy:
    '@type': /cosmos.group.v1.ThresholdDecisionPolicy
    threshold: "1"
    windows:
      min_execution_period: 0s
      voting_period: 432000s
  group_id: "1"
  metadata: AQ==
  version: "1"
- address: cosmos1..
  admin: cosmos1..
  decision_policy:
    '@type': /cosmos.group.v1.ThresholdDecisionPolicy
    threshold: "1"
    windows:
      min_execution_period: 0s
      voting_period: 432000s
  group_id: "1"
  metadata: AQ==
  version: "1"
pagination:
  next_key: null
  total: "2"
```

##### group-policies-by-admin

`group-policies-by-admin`命令允许用户使用分页标志按管理员账户地址查询组策略。

```bash
simd查询组group-policies-by-admin [admin] [flags]
```

示例：

```bash
simd查询组group-policies-by-admin cosmos1..
```

示例输出：

```bash
group_policies:
- address: cosmos1..
  admin: cosmos1..
  decision_policy:
    '@type': /cosmos.group.v1.ThresholdDecisionPolicy
    threshold: "1"
    windows:
      min_execution_period: 0s
      voting_period: 432000s
  group_id: "1"
  metadata: AQ==
  version: "1"
- address: cosmos1..
  admin: cosmos1..
  decision_policy:
    '@type': /cosmos.group.v1.ThresholdDecisionPolicy
    threshold: "1"
    windows:
      min_execution_period: 0s
      voting_period: 432000s
  group_id: "1"
  metadata: AQ==
  version: "1"
pagination:
  next_key: null
  total: "2"
```

##### proposal

`proposal`命令允许用户按ID查询提案。

```bash
simd查询组proposal [id] [flags]
```

示例：

```bash
simd查询组proposal 1
```

示例输出：

```bash
proposal:
  address: cosmos1..
  executor_result: EXECUTOR_RESULT_NOT_RUN
  group_policy_version: "1"
  group_version: "1"
  metadata: AQ==
  msgs:
  - '@type': /cosmos.bank.v1beta1.MsgSend
    amount:
    - amount: "100000000"
      denom: stake
    from_address: cosmos1..
    to_address: cosmos1..
  proposal_id: "1"
  proposers:
  - cosmos1..
  result: RESULT_UNFINALIZED
  status: STATUS_SUBMITTED
  submitted_at: "2021-12-17T07:06:26.310638964Z"
  windows:
    min_execution_period: 0s
    voting_period: 432000s
  vote_state:
    abstain_count: "0"
    no_count: "0"
    veto_count: "0"
    yes_count: "0"
  summary: "Summary"
  title: "Title"
```

##### proposals-by-group-policy

`proposals-by-group-policy`命令允许用户使用分页标志按组策略的账户地址查询提案。

```bash
simd查询组proposals-by-group-policy [group-policy-account] [flags]
```

示例：

```bash
simd查询组proposals-by-group-policy cosmos1..
```

示例输出：

```bash
pagination:
  next_key: null
  total: "1"
proposals:
- address: cosmos1..
  executor_result: EXECUTOR_RESULT_NOT_RUN
  group_policy_version: "1"
  group_version: "1"
  metadata: AQ==
  msgs:
  - '@type': /cosmos.bank.v1beta1.MsgSend
    amount:
    - amount: "100000000"
      denom: stake
    from_address: cosmos1..
    to_address: cosmos1..
  proposal_id: "1"
  proposers:
  - cosmos1..
  result: RESULT_UNFINALIZED
  status: STATUS_SUBMITTED
  submitted_at: "2021-12-17T07:06:26.310638964Z"
  windows:
    min_execution_period: 0s
    voting_period: 432000s
  vote_state:
    abstain_count: "0"
    no_count: "0"
    veto_count: "0"
    yes_count: "0"
  summary: "Summary"
  title: "Title"
```

##### 投票

`vote` 命令允许用户通过提案 ID 和投票人账户地址查询投票。

```bash
simd query group vote [proposal-id] [voter] [flags]
```

示例：

```bash
simd query group vote 1 cosmos1..
```

示例输出：

```bash
vote:
  choice: CHOICE_YES
  metadata: AQ==
  proposal_id: "1"
  submitted_at: "2021-12-17T08:05:02.490164009Z"
  voter: cosmos1..
```

##### 按提案查询投票

`votes-by-proposal` 命令允许用户通过提案 ID 和分页标志查询投票。

```bash
simd query group votes-by-proposal [proposal-id] [flags]
```

示例：

```bash
simd query group votes-by-proposal 1
```

示例输出：

```bash
pagination:
  next_key: null
  total: "1"
votes:
- choice: CHOICE_YES
  metadata: AQ==
  proposal_id: "1"
  submitted_at: "2021-12-17T08:05:02.490164009Z"
  voter: cosmos1..
```

##### 按投票人查询投票

`votes-by-voter` 命令允许用户通过投票人账户地址和分页标志查询投票。

```bash
simd query group votes-by-voter [voter] [flags]
```

示例：

```bash
simd query group votes-by-voter cosmos1..
```

示例输出：

```bash
pagination:
  next_key: null
  total: "1"
votes:
- choice: CHOICE_YES
  metadata: AQ==
  proposal_id: "1"
  submitted_at: "2021-12-17T08:05:02.490164009Z"
  voter: cosmos1..
```

### 交易

`tx` 命令允许用户与 `group` 模块进行交互。

```bash
simd tx group --help
```

#### 创建群组

`create-group` 命令允许用户创建一个群组，该群组是具有关联权重和管理员账户的成员账户的聚合。

```bash
simd tx group create-group [admin] [metadata] [members-json-file]
```

示例：

```bash
simd tx group create-group cosmos1.. "AQ==" members.json
```

#### 更新群组管理员

`update-group-admin` 命令允许用户更新群组的管理员。

```bash
simd tx group update-group-admin [admin] [group-id] [new-admin] [flags]
```

示例：

```bash
simd tx group update-group-admin cosmos1.. 1 cosmos1..
```

#### 更新群组成员

`update-group-members` 命令允许用户更新群组的成员。

```bash
simd tx group update-group-members [admin] [group-id] [members-json-file] [flags]
```

示例：

```bash
simd tx group update-group-members cosmos1.. 1 members.json
```

#### 更新群组元数据

`update-group-metadata` 命令允许用户更新群组的元数据。

```bash
simd tx group update-group-metadata [admin] [group-id] [metadata] [flags]
```

```bash
simd tx group update-group-metadata cosmos1.. 1 "AQ=="
```

#### create-group-policy

`create-group-policy`命令允许用户创建一个组策略，该策略是与一个组和一个决策策略相关联的帐户。

```bash
simd tx group create-group-policy [admin] [group-id] [metadata] [decision-policy] [flags]
```

示例：

```bash
simd tx group create-group-policy cosmos1.. 1 "AQ==" '{"@type":"/cosmos.group.v1.ThresholdDecisionPolicy", "threshold":"1", "windows": {"voting_period": "120h", "min_execution_period": "0s"}}'
```

#### create-group-with-policy

`create-group-with-policy`命令允许用户创建一个组，该组是具有相关权重的成员帐户的聚合，并具有决策策略的管理员帐户。如果将`--group-policy-as-admin`标志设置为`true`，则组策略地址将成为组和组策略管理员。

```bash
simd tx group create-group-with-policy [admin] [group-metadata] [group-policy-metadata] [members-json-file] [decision-policy] [flags]
```

示例：

```bash
simd tx group create-group-with-policy cosmos1.. "AQ==" "AQ==" members.json '{"@type":"/cosmos.group.v1.ThresholdDecisionPolicy", "threshold":"1", "windows": {"voting_period": "120h", "min_execution_period": "0s"}}'
```

#### update-group-policy-admin

`update-group-policy-admin`命令允许用户更新组策略管理员。

```bash
simd tx group update-group-policy-admin [admin] [group-policy-account] [new-admin] [flags]
```

示例：

```bash
simd tx group update-group-policy-admin cosmos1.. cosmos1.. cosmos1..
```

#### update-group-policy-metadata

`update-group-policy-metadata`命令允许用户更新组策略元数据。

```bash
simd tx group update-group-policy-metadata [admin] [group-policy-account] [new-metadata] [flags]
```

示例：

```bash
simd tx group update-group-policy-metadata cosmos1.. cosmos1.. "AQ=="
```

#### update-group-policy-decision-policy

`update-group-policy-decision-policy`命令允许用户更新组策略的决策策略。

```bash
simd tx group update-group-policy-decision-policy [admin] [group-policy-account] [decision-policy] [flags]
```

示例：

```bash
simd tx group update-group-policy-decision-policy cosmos1.. cosmos1.. '{"@type":"/cosmos.group.v1.ThresholdDecisionPolicy", "threshold":"2", "windows": {"voting_period": "120h", "min_execution_period": "0s"}}'
```

#### create-proposal

`create-proposal` 命令允许用户提交新的提案。

```bash
simd tx group create-proposal [group-policy-account] [proposer[,proposer]*] [msg_tx_json_file] [metadata] [flags]
```

示例：

```bash
simd tx group create-proposal cosmos1.. cosmos1.. msg_tx.json "AQ=="
```

#### withdraw-proposal

`withdraw-proposal` 命令允许用户撤回提案。

```bash
simd tx group withdraw-proposal [proposal-id] [group-policy-admin-or-proposer]
```

示例：

```bash
simd tx group withdraw-proposal 1 cosmos1..
```

#### vote

`vote` 命令允许用户对提案进行投票。

```bash
simd tx group vote proposal-id] [voter] [choice] [metadata] [flags]
```

示例：

```bash
simd tx group vote 1 cosmos1.. CHOICE_YES "AQ=="
```

#### exec

`exec` 命令允许用户执行提案。

```bash
simd tx group exec [proposal-id] [flags]
```

示例：

```bash
simd tx group exec 1
```

#### leave-group

`leave-group` 命令允许组成员离开组。

```bash
simd tx group leave-group [member-address] [group-id]
```

示例：

```bash
simd tx group leave-group cosmos1... 1
```

### gRPC

用户可以使用 gRPC 端点查询 `group` 模块。

#### GroupInfo

`GroupInfo` 端点允许用户通过给定的组 ID 查询组信息。

```bash
cosmos.group.v1.Query/GroupInfo
```

示例：

```bash
grpcurl -plaintext \
    -d '{"group_id":1}' localhost:9090 cosmos.group.v1.Query/GroupInfo
```

示例输出：

```bash
{
  "info": {
    "groupId": "1",
    "admin": "cosmos1..",
    "metadata": "AQ==",
    "version": "1",
    "totalWeight": "3"
  }
}
```

#### GroupPolicyInfo

`GroupPolicyInfo` 端点允许用户通过组策略的账户地址查询组策略信息。

```bash
cosmos.group.v1.Query/GroupPolicyInfo
```

#### GroupMembers

`GroupMembers` 端点允许用户使用分页标志按组 ID 查询组成员。

```bash
cosmos.group.v1.Query/GroupMembers
```

示例：

```bash
grpcurl -plaintext \
    -d '{"group_id":"1"}'  localhost:9090 cosmos.group.v1.Query/GroupMembers
```

示例输出：

```bash
{
  "members": [
    {
      "groupId": "1",
      "member": {
        "address": "cosmos1..",
        "weight": "1"
      }
    },
    {
      "groupId": "1",
      "member": {
        "address": "cosmos1..",
        "weight": "2"
      }
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### GroupsByAdmin

`GroupsByAdmin` 端点允许用户使用分页标志按管理员账户地址查询组。

```bash
cosmos.group.v1.Query/GroupsByAdmin
```

示例：

```bash
grpcurl -plaintext \
    -d '{"admin":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/GroupsByAdmin
```

示例输出：

```bash
{
  "groups": [
    {
      "groupId": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "totalWeight": "3"
    },
    {
      "groupId": "2",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "totalWeight": "3"
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### GroupPoliciesByGroup

`GroupPoliciesByGroup` 端点允许用户使用分页标志按组 ID 查询组策略。

```bash
cosmos.group.v1.Query/GroupPoliciesByGroup
```

示例：

```bash
grpcurl -plaintext \
    -d '{"group_id":"1"}'  localhost:9090 cosmos.group.v1.Query/GroupPoliciesByGroup
```

示例输出：

```bash
{
  "GroupPolicies": [
    {
      "address": "cosmos1..",
      "groupId": "1",
      "admin": "cosmos1..",
      "version": "1",
      "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows":{"voting_period": "120h", "min_execution_period": "0s"}},
    },
    {
      "address": "cosmos1..",
      "groupId": "1",
      "admin": "cosmos1..",
      "version": "1",
      "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows":{"voting_period": "120h", "min_execution_period": "0s"}},
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### GroupPoliciesByAdmin

`GroupPoliciesByAdmin` 端点允许用户使用分页标志按管理员账户地址查询组策略。

```bash
cosmos.group.v1.Query/GroupPoliciesByAdmin
```

示例：

```bash
grpcurl -plaintext \
    -d '{"admin":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/GroupPoliciesByAdmin
```

示例输出：

```bash
{
  "GroupPolicies": [
    {
      "address": "cosmos1..",
      "groupId": "1",
      "admin": "cosmos1..",
      "version": "1",
      "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows":{"voting_period": "120h", "min_execution_period": "0s"}},
    },
    {
      "address": "cosmos1..",
      "groupId": "1",
      "admin": "cosmos1..",
      "version": "1",
      "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows":{"voting_period": "120h", "min_execution_period": "0s"}},
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### Proposal

`Proposal` 端点允许用户按 ID 查询提案。

```bash
cosmos.group.v1.Query/Proposal
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}'  localhost:9090 cosmos.group.v1.Query/Proposal
```

示例输出：

```bash
{
  "proposal": {
    "proposalId": "1",
    "address": "cosmos1..",
    "proposers": [
      "cosmos1.."
    ],
    "submittedAt": "2021-12-17T07:06:26.310638964Z",
    "groupVersion": "1",
    "GroupPolicyVersion": "1",
    "status": "STATUS_SUBMITTED",
    "result": "RESULT_UNFINALIZED",
    "voteState": {
      "yesCount": "0",
      "noCount": "0",
      "abstainCount": "0",
      "vetoCount": "0"
    },
    "windows": {
      "min_execution_period": "0s",
      "voting_period": "432000s"
    },
    "executorResult": "EXECUTOR_RESULT_NOT_RUN",
    "messages": [
      {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"100000000"}],"fromAddress":"cosmos1..","toAddress":"cosmos1.."}
    ],
    "title": "Title",
    "summary": "Summary",
  }
}
```

#### ProposalsByGroupPolicy

`ProposalsByGroupPolicy` 端点允许用户使用分页标志按组策略的账户地址查询提案。

```bash
cosmos.group.v1.Query/ProposalsByGroupPolicy
```

示例：

```bash
grpcurl -plaintext \
    -d '{"address":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/ProposalsByGroupPolicy
```

示例输出：

```bash
{
  "proposals": [
    {
      "proposalId": "1",
      "address": "cosmos1..",
      "proposers": [
        "cosmos1.."
      ],
      "submittedAt": "2021-12-17T08:03:27.099649352Z",
      "groupVersion": "1",
      "GroupPolicyVersion": "1",
      "status": "STATUS_CLOSED",
      "result": "RESULT_ACCEPTED",
      "voteState": {
        "yesCount": "1",
        "noCount": "0",
        "abstainCount": "0",
        "vetoCount": "0"
      },
      "windows": {
        "min_execution_period": "0s",
        "voting_period": "432000s"
      },
      "executorResult": "EXECUTOR_RESULT_NOT_RUN",
      "messages": [
        {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"100000000"}],"fromAddress":"cosmos1..","toAddress":"cosmos1.."}
      ],
      "title": "Title",
      "summary": "Summary",
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### VoteByProposalVoter

`VoteByProposalVoter` 端点允许用户通过提案 ID 和投票人账户地址查询投票。

```bash
cosmos.group.v1.Query/VoteByProposalVoter
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1","voter":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/VoteByProposalVoter
```

示例输出：

```bash
{
  "vote": {
    "proposalId": "1",
    "voter": "cosmos1..",
    "choice": "CHOICE_YES",
    "submittedAt": "2021-12-17T08:05:02.490164009Z"
  }
}
```

#### VotesByProposal

`VotesByProposal` 端点允许用户通过提案 ID 和分页标志查询投票。

```bash
cosmos.group.v1.Query/VotesByProposal
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}'  localhost:9090 cosmos.group.v1.Query/VotesByProposal
```

示例输出：

```bash
{
  "votes": [
    {
      "proposalId": "1",
      "voter": "cosmos1..",
      "choice": "CHOICE_YES",
      "submittedAt": "2021-12-17T08:05:02.490164009Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### VotesByVoter

`VotesByVoter` 端点允许用户通过投票人账户地址和分页标志查询投票。

```bash
cosmos.group.v1.Query/VotesByVoter
```

示例：

```bash
grpcurl -plaintext \
    -d '{"voter":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/VotesByVoter
```

示例输出：

```bash
{
  "votes": [
    {
      "proposalId": "1",
      "voter": "cosmos1..",
      "choice": "CHOICE_YES",
      "submittedAt": "2021-12-17T08:05:02.490164009Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### REST

用户可以使用 REST 端点查询 `group` 模块。

#### GroupInfo

`GroupInfo` 端点允许用户通过给定的群组 ID 查询群组信息。

```bash
/cosmos/group/v1/group_info/{group_id}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/group_info/1
```

示例输出：

```bash
{
  "info": {
    "id": "1",
    "admin": "cosmos1..",
    "metadata": "AQ==",
    "version": "1",
    "total_weight": "3"
  }
}
```

#### GroupPolicyInfo

`GroupPolicyInfo` 端点允许用户通过群组策略的账户地址查询群组策略信息。

```bash
/cosmos/group/v1/group_policy_info/{address}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/group_policy_info/cosmos1..
```

示例输出：

```bash
{
  "info": {
    "address": "cosmos1..",
    "group_id": "1",
    "admin": "cosmos1..",
    "metadata": "AQ==",
    "version": "1",
    "decision_policy": {
      "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
      "threshold": "1",
      "windows": {
        "voting_period": "120h",
        "min_execution_period": "0s"
      }
    },
  }
}
```

#### GroupMembers

`GroupMembers` 端点允许用户通过群组 ID 和分页标志查询群组成员。

```bash
/cosmos/group/v1/group_members/{group_id}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/group_members/1
```

示例输出：

```bash
{
  "members": [
    {
      "group_id": "1",
      "member": {
        "address": "cosmos1..",
        "weight": "1",
        "metadata": "AQ=="
      }
    },
    {
      "group_id": "1",
      "member": {
        "address": "cosmos1..",
        "weight": "2",
        "metadata": "AQ=="
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### GroupsByAdmin

`GroupsByAdmin` 端点允许用户使用分页标志按管理员帐户地址查询组。

```bash
/cosmos/group/v1/groups_by_admin/{admin}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/groups_by_admin/cosmos1..
```

示例输出：

```bash
{
  "groups": [
    {
      "id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "total_weight": "3"
    },
    {
      "id": "2",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "total_weight": "3"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### GroupPoliciesByGroup

`GroupPoliciesByGroup` 端点允许用户使用分页标志按组 ID 查询组策略。

```bash
/cosmos/group/v1/group_policies_by_group/{group_id}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/group_policies_by_group/1
```

示例输出：

```bash
{
  "group_policies": [
    {
      "address": "cosmos1..",
      "group_id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "decision_policy": {
        "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
        "threshold": "1",
        "windows": {
          "voting_period": "120h",
          "min_execution_period": "0s"
      }
      },
    },
    {
      "address": "cosmos1..",
      "group_id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "decision_policy": {
        "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
        "threshold": "1",
        "windows": {
          "voting_period": "120h",
          "min_execution_period": "0s"
      }
      },
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### GroupPoliciesByAdmin

`GroupPoliciesByAdmin` 端点允许用户使用分页标志按管理员帐户地址查询组策略。

```bash
/cosmos/group/v1/group_policies_by_admin/{admin}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/group_policies_by_admin/cosmos1..
```

示例输出：

```bash
{
  "group_policies": [
    {
      "address": "cosmos1..",
      "group_id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "decision_policy": {
        "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
        "threshold": "1",
        "windows": {
          "voting_period": "120h",
          "min_execution_period": "0s"
      } 
      },
    },
    {
      "address": "cosmos1..",
      "group_id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "decision_policy": {
        "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
        "threshold": "1",
        "windows": {
          "voting_period": "120h",
          "min_execution_period": "0s"
      }
      },
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
```

#### Proposal

`Proposal` 端点允许用户按 ID 查询提案。

```bash
/cosmos/group/v1/proposal/{proposal_id}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/proposal/1
```

示例输出：

```bash
{
  "proposal": {
    "proposal_id": "1",
    "address": "cosmos1..",
    "metadata": "AQ==",
    "proposers": [
      "cosmos1.."
    ],
    "submitted_at": "2021-12-17T07:06:26.310638964Z",
    "group_version": "1",
    "group_policy_version": "1",
    "status": "STATUS_SUBMITTED",
    "result": "RESULT_UNFINALIZED",
    "vote_state": {
      "yes_count": "0",
      "no_count": "0",
      "abstain_count": "0",
      "veto_count": "0"
    },
    "windows": {
      "min_execution_period": "0s",
      "voting_period": "432000s"
    },
    "executor_result": "EXECUTOR_RESULT_NOT_RUN",
    "messages": [
      {
        "@type": "/cosmos.bank.v1beta1.MsgSend",
        "from_address": "cosmos1..",
        "to_address": "cosmos1..",
        "amount": [
          {
            "denom": "stake",
            "amount": "100000000"
          }
        ]
      }
    ],
    "title": "Title",
    "summary": "Summary",
  }
}
```

#### ProposalsByGroupPolicy

`ProposalsByGroupPolicy` 端点允许用户使用分页标志按组策略的帐户地址查询提案。

```bash
/cosmos/group/v1/proposals_by_group_policy/{address}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/proposals_by_group_policy/cosmos1..
```

示例输出：

```bash
{
  "proposals": [
    {
      "id": "1",
      "group_policy_address": "cosmos1..",
      "metadata": "AQ==",
      "proposers": [
        "cosmos1.."
      ],
      "submit_time": "2021-12-17T08:03:27.099649352Z",
      "group_version": "1",
      "group_policy_version": "1",
      "status": "STATUS_CLOSED",
      "result": "RESULT_ACCEPTED",
      "vote_state": {
        "yes_count": "1",
        "no_count": "0",
        "abstain_count": "0",
        "veto_count": "0"
      },
      "windows": {
        "min_execution_period": "0s",
        "voting_period": "432000s"
      },
      "executor_result": "EXECUTOR_RESULT_NOT_RUN",
      "messages": [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          "from_address": "cosmos1..",
          "to_address": "cosmos1..",
          "amount": [
            {
              "denom": "stake",
              "amount": "100000000"
            }
          ]
        }
      ]
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### VoteByProposalVoter

`VoteByProposalVoter` 端点允许用户按提案 ID 和投票人帐户地址查询投票。

```bash
/cosmos/group/v1/vote_by_proposal_voter/{proposal_id}/{voter}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1beta1/vote_by_proposal_voter/1/cosmos1..
```

#### VotesByProposal

`VotesByProposal`端点允许用户使用分页标志按提案ID查询投票。

```bash
/cosmos/group/v1/votes_by_proposal/{proposal_id}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/votes_by_proposal/1
```

示例输出：

```bash
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "cosmos1..",
      "option": "CHOICE_YES",
      "metadata": "AQ==",
      "submit_time": "2021-12-17T08:05:02.490164009Z"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### VotesByVoter

`VotesByVoter`端点允许用户使用分页标志按投票人账户地址查询投票。

```bash
/cosmos/group/v1/votes_by_voter/{voter}
```

示例：

```bash
curl localhost:1317/cosmos/group/v1/votes_by_voter/cosmos1..
```

示例输出：

```bash
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "cosmos1..",
      "choice": "CHOICE_YES",
      "metadata": "AQ==",
      "submitted_at": "2021-12-17T08:05:02.490164009Z"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

## Metadata

群组模块有四个元数据位置，用户可以在其中提供关于他们正在进行的链上操作的进一步上下文。默认情况下，所有元数据字段都有一个255个字符长度的字段，可以将元数据以json格式存储，根据所需的数据量，可以存储在链上或链下。在这里，我们提供了一个json结构的建议以及数据应该存储在哪里。在做出这些建议时有两个重要因素。首先，群组和gov模块在元数据结构上是一致的，注意所有群组提出的提案数量可能非常大。其次，客户端应用程序（如区块浏览器和治理界面）对元数据结构的一致性有信心。

### Proposal

位置：链下，作为存储在IPFS上的json对象（与[gov proposal](../gov/README.md#metadata)相同）

```json
{
  "title": "",
  "authors": [""],
  "summary": "",
  "details": "",
  "proposal_forum_url": "",
  "vote_option_context": "",
}
```

:::note
`authors`字段是一个字符串数组，这是为了允许在元数据中列出多个作者。
在v0.46中，`authors`字段是一个逗号分隔的字符串。前端鼓励同时支持这两种格式以实现向后兼容。
:::

### Vote

位置：链上，作为255字符限制内的json（与[gov vote](../gov/README.md#metadata)相同）

```json
{
  "justification": "",
}
```

### Group

位置：链下，作为存储在IPFS上的json对象

```json
{
  "name": "",
  "description": "",
  "group_website_url": "",
  "group_forum_url": "",
}
```

### 决策策略

位置：链上的json，限制在255个字符以内

```json
{
  "name": "",
  "description": "",
}
```


# `x/group`

## Abstract

The following documents specify the group module.

This module allows the creation and management of on-chain multisig accounts and enables voting for message execution based on configurable decision policies.

## Contents

* [Concepts](#concepts)
    * [Group](#group)
    * [Group Policy](#group-policy)
    * [Decision Policy](#decision-policy)
    * [Proposal](#proposal)
    * [Pruning](#pruning)
* [State](#state)
    * [Group Table](#group-table)
    * [Group Member Table](#group-member-table)
    * [Group Policy Table](#group-policy-table)
    * [Proposal Table](#proposal-table)
    * [Vote Table](#vote-table)
* [Msg Service](#msg-service)
    * [Msg/CreateGroup](#msgcreategroup)
    * [Msg/UpdateGroupMembers](#msgupdategroupmembers)
    * [Msg/UpdateGroupAdmin](#msgupdategroupadmin)
    * [Msg/UpdateGroupMetadata](#msgupdategroupmetadata)
    * [Msg/CreateGroupPolicy](#msgcreategrouppolicy)
    * [Msg/CreateGroupWithPolicy](#msgcreategroupwithpolicy)
    * [Msg/UpdateGroupPolicyAdmin](#msgupdategrouppolicyadmin)
    * [Msg/UpdateGroupPolicyDecisionPolicy](#msgupdategrouppolicydecisionpolicy)
    * [Msg/UpdateGroupPolicyMetadata](#msgupdategrouppolicymetadata)
    * [Msg/SubmitProposal](#msgsubmitproposal)
    * [Msg/WithdrawProposal](#msgwithdrawproposal)
    * [Msg/Vote](#msgvote)
    * [Msg/Exec](#msgexec)
    * [Msg/LeaveGroup](#msgleavegroup)
* [Events](#events)
    * [EventCreateGroup](#eventcreategroup)
    * [EventUpdateGroup](#eventupdategroup)
    * [EventCreateGroupPolicy](#eventcreategrouppolicy)
    * [EventUpdateGroupPolicy](#eventupdategrouppolicy)
    * [EventCreateProposal](#eventcreateproposal)
    * [EventWithdrawProposal](#eventwithdrawproposal)
    * [EventVote](#eventvote)
    * [EventExec](#eventexec)
    * [EventLeaveGroup](#eventleavegroup)
* [Client](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)
* [Metadata](#metadata)

## Concepts

### Group

A group is simply an aggregation of accounts with associated weights. It is not
an account and doesn't have a balance. It doesn't in and of itself have any
sort of voting or decision weight. It does have an "administrator" which has
the ability to add, remove and update members in the group. Note that a
group policy account could be an administrator of a group, and that the
administrator doesn't necessarily have to be a member of the group.

### Group Policy

A group policy is an account associated with a group and a decision policy.
Group policies are abstracted from groups because a single group may have
multiple decision policies for different types of actions. Managing group
membership separately from decision policies results in the least overhead
and keeps membership consistent across different policies. The pattern that
is recommended is to have a single master group policy for a given group,
and then to create separate group policies with different decision policies
and delegate the desired permissions from the master account to
those "sub-accounts" using the `x/authz` module.

### Decision Policy

A decision policy is the mechanism by which members of a group can vote on
proposals, as well as the rules that dictate whether a proposal should pass
or not based on its tally outcome.

All decision policies generally would have a mininum execution period and a
maximum voting window. The minimum execution period is the minimum amount of time
that must pass after submission in order for a proposal to potentially be executed, and it may
be set to 0. The maximum voting window is the maximum time after submission that a proposal may
be voted on before it is tallied.

The chain developer also defines an app-wide maximum execution period, which is
the maximum amount of time after a proposal's voting period end where users are
allowed to execute a proposal.

The current group module comes shipped with two decision policies: threshold
and percentage. Any chain developer can extend upon these two, by creating
custom decision policies, as long as they adhere to the `DecisionPolicy`
interface:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/types.go#L27-L45
```

#### Threshold decision policy

A threshold decision policy defines a threshold of yes votes (based on a tally
of voter weights) that must be achieved in order for a proposal to pass. For
this decision policy, abstain and veto are simply treated as no's.

This decision policy also has a VotingPeriod window and a MinExecutionPeriod
window. The former defines the duration after proposal submission where members
are allowed to vote, after which tallying is performed. The latter specifies
the minimum duration after proposal submission where the proposal can be
executed. If set to 0, then the proposal is allowed to be executed immediately
on submission (using the `TRY_EXEC` option). Obviously, MinExecutionPeriod
cannot be greater than VotingPeriod+MaxExecutionPeriod (where MaxExecution is
the app-defined duration that specifies the window after voting ended where a
proposal can be executed).

#### Percentage decision policy

A percentage decision policy is similar to a threshold decision policy, except
that the threshold is not defined as a constant weight, but as a percentage.
It's more suited for groups where the group members' weights can be updated, as
the percentage threshold stays the same, and doesn't depend on how those member
weights get updated.

Same as the Threshold decision policy, the percentage decision policy has the
two VotingPeriod and MinExecutionPeriod parameters.

### Proposal

Any member(s) of a group can submit a proposal for a group policy account to decide upon.
A proposal consists of a set of messages that will be executed if the proposal
passes as well as any metadata associated with the proposal.

#### Voting

There are four choices to choose while voting - yes, no, abstain and veto. Not
all decision policies will take the four choices into account. Votes can contain some optional metadata.
In the current implementation, the voting window begins as soon as a proposal
is submitted, and the end is defined by the group policy's decision policy.

#### Withdrawing Proposals

Proposals can be withdrawn any time before the voting period end, either by the
admin of the group policy or by one of the proposers. Once withdrawn, it is
marked as `PROPOSAL_STATUS_WITHDRAWN`, and no more voting or execution is
allowed on it.

#### Aborted Proposals

If the group policy is updated during the voting period of the proposal, then
the proposal is marked as `PROPOSAL_STATUS_ABORTED`, and no more voting or
execution is allowed on it. This is because the group policy defines the rules
of proposal voting and execution, so if those rules change during the lifecycle
of a proposal, then the proposal should be marked as stale.

#### Tallying

Tallying is the counting of all votes on a proposal. It happens only once in
the lifecycle of a proposal, but can be triggered by two factors, whichever
happens first:

* either someone tries to execute the proposal (see next section), which can
  happen on a `Msg/Exec` transaction, or a `Msg/{SubmitProposal,Vote}`
  transaction with the `Exec` field set. When a proposal execution is attempted,
  a tally is done first to make sure the proposal passes.
* or on `EndBlock` when the proposal's voting period end just passed.

If the tally result passes the decision policy's rules, then the proposal is
marked as `PROPOSAL_STATUS_ACCEPTED`, or else it is marked as
`PROPOSAL_STATUS_REJECTED`. In any case, no more voting is allowed anymore, and the tally
result is persisted to state in the proposal's `FinalTallyResult`.

#### Executing Proposals

Proposals are executed only when the tallying is done, and the group account's
decision policy allows the proposal to pass based on the tally outcome. They
are marked by the status `PROPOSAL_STATUS_ACCEPTED`. Execution must happen
before a duration of `MaxExecutionPeriod` (set by the chain developer) after
each proposal's voting period end.

Proposals will not be automatically executed by the chain in this current design,
but rather a user must submit a `Msg/Exec` transaction to attempt to execute the
proposal based on the current votes and decision policy. Any user (not only the
group members) can execute proposals that have been accepted, and execution fees are
paid by the proposal executor.
It's also possible to try to execute a proposal immediately on creation or on
new votes using the `Exec` field of `Msg/SubmitProposal` and `Msg/Vote` requests.
In the former case, proposers signatures are considered as yes votes.
In these cases, if the proposal can't be executed (i.e. it didn't pass the
decision policy's rules), it will still be opened for new votes and
could be tallied and executed later on.

A successful proposal execution will have its `ExecutorResult` marked as
`PROPOSAL_EXECUTOR_RESULT_SUCCESS`. The proposal will be automatically pruned
after execution. On the other hand, a failed proposal execution will be marked
as `PROPOSAL_EXECUTOR_RESULT_FAILURE`. Such a proposal can be re-executed
multiple times, until it expires after `MaxExecutionPeriod` after voting period
end.

### Pruning

Proposals and votes are automatically pruned to avoid state bloat.

Votes are pruned:

* either after a successful tally, i.e. a tally whose result passes the decision
  policy's rules, which can be trigged by a `Msg/Exec` or a
  `Msg/{SubmitProposal,Vote}` with the `Exec` field set,
* or on `EndBlock` right after the proposal's voting period end. This applies to proposals with status `aborted` or `withdrawn` too.

whichever happens first.

Proposals are pruned:

* on `EndBlock` whose proposal status is `withdrawn` or `aborted` on proposal's voting period end before tallying,
* and either after a successful proposal execution,
* or on `EndBlock` right after the proposal's `voting_period_end` +
  `max_execution_period` (defined as an app-wide configuration) is passed,

whichever happens first.

## State

The `group` module uses the `orm` package which provides table storage with support for
primary keys and secondary indexes. `orm` also defines `Sequence` which is a persistent unique key generator based on a counter that can be used along with `Table`s.

Here's the list of tables and associated sequences and indexes stored as part of the `group` module.

### Group Table

The `groupTable` stores `GroupInfo`: `0x0 | BigEndian(GroupId) -> ProtocolBuffer(GroupInfo)`.

#### groupSeq

The value of `groupSeq` is incremented when creating a new group and corresponds to the new `GroupId`: `0x1 | 0x1 -> BigEndian`.

The second `0x1` corresponds to the ORM `sequenceStorageKey`.

#### groupByAdminIndex

`groupByAdminIndex` allows to retrieve groups by admin address:
`0x2 | len([]byte(group.Admin)) | []byte(group.Admin) | BigEndian(GroupId) -> []byte()`.

### Group Member Table

The `groupMemberTable` stores `GroupMember`s: `0x10 | BigEndian(GroupId) | []byte(member.Address) -> ProtocolBuffer(GroupMember)`.

The `groupMemberTable` is a primary key table and its `PrimaryKey` is given by
`BigEndian(GroupId) | []byte(member.Address)` which is used by the following indexes.

#### groupMemberByGroupIndex

`groupMemberByGroupIndex` allows to retrieve group members by group id:
`0x11 | BigEndian(GroupId) | PrimaryKey -> []byte()`.

#### groupMemberByMemberIndex

`groupMemberByMemberIndex` allows to retrieve group members by member address:
`0x12 | len([]byte(member.Address)) | []byte(member.Address) | PrimaryKey -> []byte()`.

### Group Policy Table

The `groupPolicyTable` stores `GroupPolicyInfo`: `0x20 | len([]byte(Address)) | []byte(Address) -> ProtocolBuffer(GroupPolicyInfo)`.

The `groupPolicyTable` is a primary key table and its `PrimaryKey` is given by
`len([]byte(Address)) | []byte(Address)` which is used by the following indexes.

#### groupPolicySeq

The value of `groupPolicySeq` is incremented when creating a new group policy and is used to generate the new group policy account `Address`:
`0x21 | 0x1 -> BigEndian`.

The second `0x1` corresponds to the ORM `sequenceStorageKey`.

#### groupPolicyByGroupIndex

`groupPolicyByGroupIndex` allows to retrieve group policies by group id:
`0x22 | BigEndian(GroupId) | PrimaryKey -> []byte()`.

#### groupPolicyByAdminIndex

`groupPolicyByAdminIndex` allows to retrieve group policies by admin address:
`0x23 | len([]byte(Address)) | []byte(Address) | PrimaryKey -> []byte()`.

### Proposal Table

The `proposalTable` stores `Proposal`s: `0x30 | BigEndian(ProposalId) -> ProtocolBuffer(Proposal)`.

#### proposalSeq

The value of `proposalSeq` is incremented when creating a new proposal and corresponds to the new `ProposalId`: `0x31 | 0x1 -> BigEndian`.

The second `0x1` corresponds to the ORM `sequenceStorageKey`.

#### proposalByGroupPolicyIndex

`proposalByGroupPolicyIndex` allows to retrieve proposals by group policy account address:
`0x32 | len([]byte(account.Address)) | []byte(account.Address) | BigEndian(ProposalId) -> []byte()`.

#### ProposalsByVotingPeriodEndIndex

`proposalsByVotingPeriodEndIndex` allows to retrieve proposals sorted by chronological `voting_period_end`:
`0x33 | sdk.FormatTimeBytes(proposal.VotingPeriodEnd) | BigEndian(ProposalId) -> []byte()`.

This index is used when tallying the proposal votes at the end of the voting period, and for pruning proposals at `VotingPeriodEnd + MaxExecutionPeriod`.

### Vote Table

The `voteTable` stores `Vote`s: `0x40 | BigEndian(ProposalId) | []byte(voter.Address) -> ProtocolBuffer(Vote)`.

The `voteTable` is a primary key table and its `PrimaryKey` is given by
`BigEndian(ProposalId) | []byte(voter.Address)` which is used by the following indexes.

#### voteByProposalIndex

`voteByProposalIndex` allows to retrieve votes by proposal id:
`0x41 | BigEndian(ProposalId) | PrimaryKey -> []byte()`.

#### voteByVoterIndex

`voteByVoterIndex` allows to retrieve votes by voter address:
`0x42 | len([]byte(voter.Address)) | []byte(voter.Address) | PrimaryKey -> []byte()`.

## Msg Service

### Msg/CreateGroup

A new group can be created with the `MsgCreateGroup`, which has an admin address, a list of members and some optional metadata.

The metadata has a maximum length that is chosen by the app developer, and
passed into the group keeper as a config.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L67-L80
```

It's expected to fail if

* metadata length is greater than `MaxMetadataLen` config
* members are not correctly set (e.g. wrong address format, duplicates, or with 0 weight).

### Msg/UpdateGroupMembers

Group members can be updated with the `UpdateGroupMembers`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L88-L102
```

In the list of `MemberUpdates`, an existing member can be removed by setting its weight to 0.

It's expected to fail if:

* the signer is not the admin of the group.
* for any one of the associated group policies, if its decision policy's `Validate()` method fails against the updated group.

### Msg/UpdateGroupAdmin

The `UpdateGroupAdmin` can be used to update a group admin.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L107-L120
```

It's expected to fail if the signer is not the admin of the group.

### Msg/UpdateGroupMetadata

The `UpdateGroupMetadata` can be used to update a group metadata.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L125-L138
```

It's expected to fail if:

* new metadata length is greater than `MaxMetadataLen` config.
* the signer is not the admin of the group.

### Msg/CreateGroupPolicy

A new group policy can be created with the `MsgCreateGroupPolicy`, which has an admin address, a group id, a decision policy and some optional metadata.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L147-L165
```

It's expected to fail if:

* the signer is not the admin of the group.
* metadata length is greater than `MaxMetadataLen` config.
* the decision policy's `Validate()` method doesn't pass against the group.

### Msg/CreateGroupWithPolicy

A new group with policy can be created with the `MsgCreateGroupWithPolicy`, which has an admin address, a list of members, a decision policy, a `group_policy_as_admin` field to optionally set group and group policy admin with group policy address and some optional metadata for group and group policy.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L191-L215
```

It's expected to fail for the same reasons as `Msg/CreateGroup` and `Msg/CreateGroupPolicy`.

### Msg/UpdateGroupPolicyAdmin

The `UpdateGroupPolicyAdmin` can be used to update a group policy admin.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L173-L186
```

It's expected to fail if the signer is not the admin of the group policy.

### Msg/UpdateGroupPolicyDecisionPolicy

The `UpdateGroupPolicyDecisionPolicy` can be used to update a decision policy.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L226-L241
```

It's expected to fail if:

* the signer is not the admin of the group policy.
* the new decision policy's `Validate()` method doesn't pass against the group.

### Msg/UpdateGroupPolicyMetadata

The `UpdateGroupPolicyMetadata` can be used to update a group policy metadata.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L246-L259
```

It's expected to fail if:

* new metadata length is greater than `MaxMetadataLen` config.
* the signer is not the admin of the group.

### Msg/SubmitProposal

A new proposal can be created with the `MsgSubmitProposal`, which has a group policy account address, a list of proposers addresses, a list of messages to execute if the proposal is accepted and some optional metadata.
An optional `Exec` value can be provided to try to execute the proposal immediately after proposal creation. Proposers signatures are considered as yes votes in this case.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L281-L315
```

It's expected to fail if:

* metadata, title, or summary length is greater than `MaxMetadataLen` config.
* if any of the proposers is not a group member.

### Msg/WithdrawProposal

A proposal can be withdrawn using `MsgWithdrawProposal` which has an `address` (can be either a proposer or the group policy admin) and a `proposal_id` (which has to be withdrawn).

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L323-L333
```

It's expected to fail if:

* the signer is neither the group policy admin nor proposer of the proposal.
* the proposal is already closed or aborted.

### Msg/Vote

A new vote can be created with the `MsgVote`, given a proposal id, a voter address, a choice (yes, no, veto or abstain) and some optional metadata.
An optional `Exec` value can be provided to try to execute the proposal immediately after voting.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L338-L358
```

It's expected to fail if:

* metadata length is greater than `MaxMetadataLen` config.
* the proposal is not in voting period anymore.

### Msg/Exec

A proposal can be executed with the `MsgExec`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L363-L373
```

The messages that are part of this proposal won't be executed if:

* the proposal has not been accepted by the group policy.
* the proposal has already been successfully executed.

### Msg/LeaveGroup

The `MsgLeaveGroup` allows group member to leave a group.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/v1/tx.proto#L381-L391
```

It's expected to fail if:

* the group member is not part of the group.
* for any one of the associated group policies, if its decision policy's `Validate()` method fails against the updated group.

## Events

The group module emits the following events:

### EventCreateGroup

| Type                             | Attribute Key | Attribute Value                  |
| -------------------------------- | ------------- | -------------------------------- |
| message                          | action        | /cosmos.group.v1.Msg/CreateGroup |
| cosmos.group.v1.EventCreateGroup | group_id      | {groupId}                        |

### EventUpdateGroup

| Type                             | Attribute Key | Attribute Value                                            |
| -------------------------------- | ------------- | ---------------------------------------------------------- |
| message                          | action        | /cosmos.group.v1.Msg/UpdateGroup{Admin\|Metadata\|Members} |
| cosmos.group.v1.EventUpdateGroup | group_id      | {groupId}                                                  |

### EventCreateGroupPolicy

| Type                                   | Attribute Key | Attribute Value                        |
| -------------------------------------- | ------------- | -------------------------------------- |
| message                                | action        | /cosmos.group.v1.Msg/CreateGroupPolicy |
| cosmos.group.v1.EventCreateGroupPolicy | address       | {groupPolicyAddress}                   |

### EventUpdateGroupPolicy

| Type                                   | Attribute Key | Attribute Value                                                         |
| -------------------------------------- | ------------- | ----------------------------------------------------------------------- |
| message                                | action        | /cosmos.group.v1.Msg/UpdateGroupPolicy{Admin\|Metadata\|DecisionPolicy} |
| cosmos.group.v1.EventUpdateGroupPolicy | address       | {groupPolicyAddress}                                                    |

### EventCreateProposal

| Type                                | Attribute Key | Attribute Value                     |
| ----------------------------------- | ------------- | ----------------------------------- |
| message                             | action        | /cosmos.group.v1.Msg/CreateProposal |
| cosmos.group.v1.EventCreateProposal | proposal_id   | {proposalId}                        |

### EventWithdrawProposal

| Type                                  | Attribute Key | Attribute Value                       |
| ------------------------------------- | ------------- | ------------------------------------- |
| message                               | action        | /cosmos.group.v1.Msg/WithdrawProposal |
| cosmos.group.v1.EventWithdrawProposal | proposal_id   | {proposalId}                          |

### EventVote

| Type                      | Attribute Key | Attribute Value           |
| ------------------------- | ------------- | ------------------------- |
| message                   | action        | /cosmos.group.v1.Msg/Vote |
| cosmos.group.v1.EventVote | proposal_id   | {proposalId}              |

## EventExec

| Type                      | Attribute Key | Attribute Value           |
| ------------------------- | ------------- | ------------------------- |
| message                   | action        | /cosmos.group.v1.Msg/Exec |
| cosmos.group.v1.EventExec | proposal_id   | {proposalId}              |
| cosmos.group.v1.EventExec | logs          | {logs_string}             |

### EventLeaveGroup

| Type                            | Attribute Key | Attribute Value                 |
| ------------------------------- | ------------- | ------------------------------- |
| message                         | action        | /cosmos.group.v1.Msg/LeaveGroup |
| cosmos.group.v1.EventLeaveGroup | proposal_id   | {proposalId}                    |
| cosmos.group.v1.EventLeaveGroup | address       | {address}                       |


## Client

### CLI

A user can query and interact with the `group` module using the CLI.

#### Query

The `query` commands allow users to query `group` state.

```bash
simd query group --help
```

##### group-info

The `group-info` command allows users to query for group info by given group id.

```bash
simd query group group-info [id] [flags]
```

Example:

```bash
simd query group group-info 1
```

Example Output:

```bash
admin: cosmos1..
group_id: "1"
metadata: AQ==
total_weight: "3"
version: "1"
```

##### group-policy-info

The `group-policy-info` command allows users to query for group policy info by account address of group policy .

```bash
simd query group group-policy-info [group-policy-account] [flags]
```

Example:

```bash
simd query group group-policy-info cosmos1..
```

Example Output:

```bash
address: cosmos1..
admin: cosmos1..
decision_policy:
  '@type': /cosmos.group.v1.ThresholdDecisionPolicy
  threshold: "1"
  windows:
      min_execution_period: 0s
      voting_period: 432000s
group_id: "1"
metadata: AQ==
version: "1"
```

##### group-members

The `group-members` command allows users to query for group members by group id with pagination flags.

```bash
simd query group group-members [id] [flags]
```

Example:

```bash
simd query group group-members 1
```

Example Output:

```bash
members:
- group_id: "1"
  member:
    address: cosmos1..
    metadata: AQ==
    weight: "2"
- group_id: "1"
  member:
    address: cosmos1..
    metadata: AQ==
    weight: "1"
pagination:
  next_key: null
  total: "2"
```

##### groups-by-admin

The `groups-by-admin` command allows users to query for groups by admin account address with pagination flags.

```bash
simd query group groups-by-admin [admin] [flags]
```

Example:

```bash
simd query group groups-by-admin cosmos1..
```

Example Output:

```bash
groups:
- admin: cosmos1..
  group_id: "1"
  metadata: AQ==
  total_weight: "3"
  version: "1"
- admin: cosmos1..
  group_id: "2"
  metadata: AQ==
  total_weight: "3"
  version: "1"
pagination:
  next_key: null
  total: "2"
```

##### group-policies-by-group

The `group-policies-by-group` command allows users to query for group policies by group id with pagination flags.

```bash
simd query group group-policies-by-group [group-id] [flags]
```

Example:

```bash
simd query group group-policies-by-group 1
```

Example Output:

```bash
group_policies:
- address: cosmos1..
  admin: cosmos1..
  decision_policy:
    '@type': /cosmos.group.v1.ThresholdDecisionPolicy
    threshold: "1"
    windows:
      min_execution_period: 0s
      voting_period: 432000s
  group_id: "1"
  metadata: AQ==
  version: "1"
- address: cosmos1..
  admin: cosmos1..
  decision_policy:
    '@type': /cosmos.group.v1.ThresholdDecisionPolicy
    threshold: "1"
    windows:
      min_execution_period: 0s
      voting_period: 432000s
  group_id: "1"
  metadata: AQ==
  version: "1"
pagination:
  next_key: null
  total: "2"
```

##### group-policies-by-admin

The `group-policies-by-admin` command allows users to query for group policies by admin account address with pagination flags.

```bash
simd query group group-policies-by-admin [admin] [flags]
```

Example:

```bash
simd query group group-policies-by-admin cosmos1..
```

Example Output:

```bash
group_policies:
- address: cosmos1..
  admin: cosmos1..
  decision_policy:
    '@type': /cosmos.group.v1.ThresholdDecisionPolicy
    threshold: "1"
    windows:
      min_execution_period: 0s
      voting_period: 432000s
  group_id: "1"
  metadata: AQ==
  version: "1"
- address: cosmos1..
  admin: cosmos1..
  decision_policy:
    '@type': /cosmos.group.v1.ThresholdDecisionPolicy
    threshold: "1"
    windows:
      min_execution_period: 0s
      voting_period: 432000s
  group_id: "1"
  metadata: AQ==
  version: "1"
pagination:
  next_key: null
  total: "2"
```

##### proposal

The `proposal` command allows users to query for proposal by id.

```bash
simd query group proposal [id] [flags]
```

Example:

```bash
simd query group proposal 1
```

Example Output:

```bash
proposal:
  address: cosmos1..
  executor_result: EXECUTOR_RESULT_NOT_RUN
  group_policy_version: "1"
  group_version: "1"
  metadata: AQ==
  msgs:
  - '@type': /cosmos.bank.v1beta1.MsgSend
    amount:
    - amount: "100000000"
      denom: stake
    from_address: cosmos1..
    to_address: cosmos1..
  proposal_id: "1"
  proposers:
  - cosmos1..
  result: RESULT_UNFINALIZED
  status: STATUS_SUBMITTED
  submitted_at: "2021-12-17T07:06:26.310638964Z"
  windows:
    min_execution_period: 0s
    voting_period: 432000s
  vote_state:
    abstain_count: "0"
    no_count: "0"
    veto_count: "0"
    yes_count: "0"
  summary: "Summary"
  title: "Title"
```

##### proposals-by-group-policy

The `proposals-by-group-policy` command allows users to query for proposals by account address of group policy with pagination flags.

```bash
simd query group proposals-by-group-policy [group-policy-account] [flags]
```

Example:

```bash
simd query group proposals-by-group-policy cosmos1..
```

Example Output:

```bash
pagination:
  next_key: null
  total: "1"
proposals:
- address: cosmos1..
  executor_result: EXECUTOR_RESULT_NOT_RUN
  group_policy_version: "1"
  group_version: "1"
  metadata: AQ==
  msgs:
  - '@type': /cosmos.bank.v1beta1.MsgSend
    amount:
    - amount: "100000000"
      denom: stake
    from_address: cosmos1..
    to_address: cosmos1..
  proposal_id: "1"
  proposers:
  - cosmos1..
  result: RESULT_UNFINALIZED
  status: STATUS_SUBMITTED
  submitted_at: "2021-12-17T07:06:26.310638964Z"
  windows:
    min_execution_period: 0s
    voting_period: 432000s
  vote_state:
    abstain_count: "0"
    no_count: "0"
    veto_count: "0"
    yes_count: "0"
  summary: "Summary"
  title: "Title"
```

##### vote

The `vote` command allows users to query for vote by proposal id and voter account address.

```bash
simd query group vote [proposal-id] [voter] [flags]
```

Example:

```bash
simd query group vote 1 cosmos1..
```

Example Output:

```bash
vote:
  choice: CHOICE_YES
  metadata: AQ==
  proposal_id: "1"
  submitted_at: "2021-12-17T08:05:02.490164009Z"
  voter: cosmos1..
```

##### votes-by-proposal

The `votes-by-proposal` command allows users to query for votes by proposal id with pagination flags.

```bash
simd query group votes-by-proposal [proposal-id] [flags]
```

Example:

```bash
simd query group votes-by-proposal 1
```

Example Output:

```bash
pagination:
  next_key: null
  total: "1"
votes:
- choice: CHOICE_YES
  metadata: AQ==
  proposal_id: "1"
  submitted_at: "2021-12-17T08:05:02.490164009Z"
  voter: cosmos1..
```

##### votes-by-voter

The `votes-by-voter` command allows users to query for votes by voter account address with pagination flags.

```bash
simd query group votes-by-voter [voter] [flags]
```

Example:

```bash
simd query group votes-by-voter cosmos1..
```

Example Output:

```bash
pagination:
  next_key: null
  total: "1"
votes:
- choice: CHOICE_YES
  metadata: AQ==
  proposal_id: "1"
  submitted_at: "2021-12-17T08:05:02.490164009Z"
  voter: cosmos1..
```

### Transactions

The `tx` commands allow users to interact with the `group` module.

```bash
simd tx group --help
```

#### create-group

The `create-group` command allows users to create a group which is an aggregation of member accounts with associated weights and
an administrator account.

```bash
simd tx group create-group [admin] [metadata] [members-json-file]
```

Example:

```bash
simd tx group create-group cosmos1.. "AQ==" members.json
```

#### update-group-admin

The `update-group-admin` command allows users to update a group's admin.

```bash
simd tx group update-group-admin [admin] [group-id] [new-admin] [flags]
```

Example:

```bash
simd tx group update-group-admin cosmos1.. 1 cosmos1..
```

#### update-group-members

The `update-group-members` command allows users to update a group's members.

```bash
simd tx group update-group-members [admin] [group-id] [members-json-file] [flags]
```

Example:

```bash
simd tx group update-group-members cosmos1.. 1 members.json
```

#### update-group-metadata

The `update-group-metadata` command allows users to update a group's metadata.

```bash
simd tx group update-group-metadata [admin] [group-id] [metadata] [flags]
```

Example:

```bash
simd tx group update-group-metadata cosmos1.. 1 "AQ=="
```

#### create-group-policy

The `create-group-policy` command allows users to create a group policy which is an account associated with a group and a decision policy.

```bash
simd tx group create-group-policy [admin] [group-id] [metadata] [decision-policy] [flags]
```

Example:

```bash
simd tx group create-group-policy cosmos1.. 1 "AQ==" '{"@type":"/cosmos.group.v1.ThresholdDecisionPolicy", "threshold":"1", "windows": {"voting_period": "120h", "min_execution_period": "0s"}}'
```

#### create-group-with-policy

The `create-group-with-policy` command allows users to create a group which is an aggregation of member accounts with associated weights and an administrator account with decision policy. If the `--group-policy-as-admin` flag is set to `true`, the group policy address becomes the group and group policy admin.

```bash
simd tx group create-group-with-policy [admin] [group-metadata] [group-policy-metadata] [members-json-file] [decision-policy] [flags]
```

Example:

```bash
simd tx group create-group-with-policy cosmos1.. "AQ==" "AQ==" members.json '{"@type":"/cosmos.group.v1.ThresholdDecisionPolicy", "threshold":"1", "windows": {"voting_period": "120h", "min_execution_period": "0s"}}'
```

#### update-group-policy-admin

The `update-group-policy-admin` command allows users to update a group policy admin.

```bash
simd tx group update-group-policy-admin [admin] [group-policy-account] [new-admin] [flags]
```

Example:

```bash
simd tx group update-group-policy-admin cosmos1.. cosmos1.. cosmos1..
```

#### update-group-policy-metadata

The `update-group-policy-metadata` command allows users to update a group policy metadata.

```bash
simd tx group update-group-policy-metadata [admin] [group-policy-account] [new-metadata] [flags]
```

Example:

```bash
simd tx group update-group-policy-metadata cosmos1.. cosmos1.. "AQ=="
```

#### update-group-policy-decision-policy

The `update-group-policy-decision-policy` command allows users to update a group policy's decision policy.

```bash
simd  tx group update-group-policy-decision-policy [admin] [group-policy-account] [decision-policy] [flags]
```

Example:

```bash
simd tx group update-group-policy-decision-policy cosmos1.. cosmos1.. '{"@type":"/cosmos.group.v1.ThresholdDecisionPolicy", "threshold":"2", "windows": {"voting_period": "120h", "min_execution_period": "0s"}}'
```

#### create-proposal

The `create-proposal` command allows users to submit a new proposal.

```bash
simd tx group create-proposal [group-policy-account] [proposer[,proposer]*] [msg_tx_json_file] [metadata] [flags]
```

Example:

```bash
simd tx group create-proposal cosmos1.. cosmos1.. msg_tx.json "AQ=="
```

#### withdraw-proposal

The `withdraw-proposal` command allows users to withdraw a proposal.

```bash
simd tx group withdraw-proposal [proposal-id] [group-policy-admin-or-proposer]
```

Example:

```bash
simd tx group withdraw-proposal 1 cosmos1..
```

#### vote

The `vote` command allows users to vote on a proposal.

```bash
simd tx group vote proposal-id] [voter] [choice] [metadata] [flags]
```

Example:

```bash
simd tx group vote 1 cosmos1.. CHOICE_YES "AQ=="
```

#### exec

The `exec` command allows users to execute a proposal.

```bash
simd tx group exec [proposal-id] [flags]
```

Example:

```bash
simd tx group exec 1
```

#### leave-group

The `leave-group` command allows group member to leave the group.

```bash
simd tx group leave-group [member-address] [group-id]
```

Example:

```bash
simd tx group leave-group cosmos1... 1
```

### gRPC

A user can query the `group` module using gRPC endpoints.

#### GroupInfo

The `GroupInfo` endpoint allows users to query for group info by given group id.

```bash
cosmos.group.v1.Query/GroupInfo
```

Example:

```bash
grpcurl -plaintext \
    -d '{"group_id":1}' localhost:9090 cosmos.group.v1.Query/GroupInfo
```

Example Output:

```bash
{
  "info": {
    "groupId": "1",
    "admin": "cosmos1..",
    "metadata": "AQ==",
    "version": "1",
    "totalWeight": "3"
  }
}
```

#### GroupPolicyInfo

The `GroupPolicyInfo` endpoint allows users to query for group policy info by account address of group policy.

```bash
cosmos.group.v1.Query/GroupPolicyInfo
```

Example:

```bash
grpcurl -plaintext \
    -d '{"address":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/GroupPolicyInfo
```

Example Output:

```bash
{
  "info": {
    "address": "cosmos1..",
    "groupId": "1",
    "admin": "cosmos1..",
    "version": "1",
    "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows": {"voting_period": "120h", "min_execution_period": "0s"}},
  }
}
```

#### GroupMembers

The `GroupMembers` endpoint allows users to query for group members by group id with pagination flags.

```bash
cosmos.group.v1.Query/GroupMembers
```

Example:

```bash
grpcurl -plaintext \
    -d '{"group_id":"1"}'  localhost:9090 cosmos.group.v1.Query/GroupMembers
```

Example Output:

```bash
{
  "members": [
    {
      "groupId": "1",
      "member": {
        "address": "cosmos1..",
        "weight": "1"
      }
    },
    {
      "groupId": "1",
      "member": {
        "address": "cosmos1..",
        "weight": "2"
      }
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### GroupsByAdmin

The `GroupsByAdmin` endpoint allows users to query for groups by admin account address with pagination flags.

```bash
cosmos.group.v1.Query/GroupsByAdmin
```

Example:

```bash
grpcurl -plaintext \
    -d '{"admin":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/GroupsByAdmin
```

Example Output:

```bash
{
  "groups": [
    {
      "groupId": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "totalWeight": "3"
    },
    {
      "groupId": "2",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "totalWeight": "3"
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### GroupPoliciesByGroup

The `GroupPoliciesByGroup` endpoint allows users to query for group policies by group id with pagination flags.

```bash
cosmos.group.v1.Query/GroupPoliciesByGroup
```

Example:

```bash
grpcurl -plaintext \
    -d '{"group_id":"1"}'  localhost:9090 cosmos.group.v1.Query/GroupPoliciesByGroup
```

Example Output:

```bash
{
  "GroupPolicies": [
    {
      "address": "cosmos1..",
      "groupId": "1",
      "admin": "cosmos1..",
      "version": "1",
      "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows":{"voting_period": "120h", "min_execution_period": "0s"}},
    },
    {
      "address": "cosmos1..",
      "groupId": "1",
      "admin": "cosmos1..",
      "version": "1",
      "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows":{"voting_period": "120h", "min_execution_period": "0s"}},
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### GroupPoliciesByAdmin

The `GroupPoliciesByAdmin` endpoint allows users to query for group policies by admin account address with pagination flags.

```bash
cosmos.group.v1.Query/GroupPoliciesByAdmin
```

Example:

```bash
grpcurl -plaintext \
    -d '{"admin":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/GroupPoliciesByAdmin
```

Example Output:

```bash
{
  "GroupPolicies": [
    {
      "address": "cosmos1..",
      "groupId": "1",
      "admin": "cosmos1..",
      "version": "1",
      "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows":{"voting_period": "120h", "min_execution_period": "0s"}},
    },
    {
      "address": "cosmos1..",
      "groupId": "1",
      "admin": "cosmos1..",
      "version": "1",
      "decisionPolicy": {"@type":"/cosmos.group.v1.ThresholdDecisionPolicy","threshold":"1","windows":{"voting_period": "120h", "min_execution_period": "0s"}},
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### Proposal

The `Proposal` endpoint allows users to query for proposal by id.

```bash
cosmos.group.v1.Query/Proposal
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}'  localhost:9090 cosmos.group.v1.Query/Proposal
```

Example Output:

```bash
{
  "proposal": {
    "proposalId": "1",
    "address": "cosmos1..",
    "proposers": [
      "cosmos1.."
    ],
    "submittedAt": "2021-12-17T07:06:26.310638964Z",
    "groupVersion": "1",
    "GroupPolicyVersion": "1",
    "status": "STATUS_SUBMITTED",
    "result": "RESULT_UNFINALIZED",
    "voteState": {
      "yesCount": "0",
      "noCount": "0",
      "abstainCount": "0",
      "vetoCount": "0"
    },
    "windows": {
      "min_execution_period": "0s",
      "voting_period": "432000s"
    },
    "executorResult": "EXECUTOR_RESULT_NOT_RUN",
    "messages": [
      {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"100000000"}],"fromAddress":"cosmos1..","toAddress":"cosmos1.."}
    ],
    "title": "Title",
    "summary": "Summary",
  }
}
```

#### ProposalsByGroupPolicy

The `ProposalsByGroupPolicy` endpoint allows users to query for proposals by account address of group policy with pagination flags.

```bash
cosmos.group.v1.Query/ProposalsByGroupPolicy
```

Example:

```bash
grpcurl -plaintext \
    -d '{"address":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/ProposalsByGroupPolicy
```

Example Output:

```bash
{
  "proposals": [
    {
      "proposalId": "1",
      "address": "cosmos1..",
      "proposers": [
        "cosmos1.."
      ],
      "submittedAt": "2021-12-17T08:03:27.099649352Z",
      "groupVersion": "1",
      "GroupPolicyVersion": "1",
      "status": "STATUS_CLOSED",
      "result": "RESULT_ACCEPTED",
      "voteState": {
        "yesCount": "1",
        "noCount": "0",
        "abstainCount": "0",
        "vetoCount": "0"
      },
      "windows": {
        "min_execution_period": "0s",
        "voting_period": "432000s"
      },
      "executorResult": "EXECUTOR_RESULT_NOT_RUN",
      "messages": [
        {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"100000000"}],"fromAddress":"cosmos1..","toAddress":"cosmos1.."}
      ],
      "title": "Title",
      "summary": "Summary",
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### VoteByProposalVoter

The `VoteByProposalVoter` endpoint allows users to query for vote by proposal id and voter account address.

```bash
cosmos.group.v1.Query/VoteByProposalVoter
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1","voter":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/VoteByProposalVoter
```

Example Output:

```bash
{
  "vote": {
    "proposalId": "1",
    "voter": "cosmos1..",
    "choice": "CHOICE_YES",
    "submittedAt": "2021-12-17T08:05:02.490164009Z"
  }
}
```

#### VotesByProposal

The `VotesByProposal` endpoint allows users to query for votes by proposal id with pagination flags.

```bash
cosmos.group.v1.Query/VotesByProposal
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}'  localhost:9090 cosmos.group.v1.Query/VotesByProposal
```

Example Output:

```bash
{
  "votes": [
    {
      "proposalId": "1",
      "voter": "cosmos1..",
      "choice": "CHOICE_YES",
      "submittedAt": "2021-12-17T08:05:02.490164009Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### VotesByVoter

The `VotesByVoter` endpoint allows users to query for votes by voter account address with pagination flags.

```bash
cosmos.group.v1.Query/VotesByVoter
```

Example:

```bash
grpcurl -plaintext \
    -d '{"voter":"cosmos1.."}'  localhost:9090 cosmos.group.v1.Query/VotesByVoter
```

Example Output:

```bash
{
  "votes": [
    {
      "proposalId": "1",
      "voter": "cosmos1..",
      "choice": "CHOICE_YES",
      "submittedAt": "2021-12-17T08:05:02.490164009Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### REST

A user can query the `group` module using REST endpoints.

#### GroupInfo

The `GroupInfo` endpoint allows users to query for group info by given group id.

```bash
/cosmos/group/v1/group_info/{group_id}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/group_info/1
```

Example Output:

```bash
{
  "info": {
    "id": "1",
    "admin": "cosmos1..",
    "metadata": "AQ==",
    "version": "1",
    "total_weight": "3"
  }
}
```

#### GroupPolicyInfo

The `GroupPolicyInfo` endpoint allows users to query for group policy info by account address of group policy.

```bash
/cosmos/group/v1/group_policy_info/{address}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/group_policy_info/cosmos1..
```

Example Output:

```bash
{
  "info": {
    "address": "cosmos1..",
    "group_id": "1",
    "admin": "cosmos1..",
    "metadata": "AQ==",
    "version": "1",
    "decision_policy": {
      "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
      "threshold": "1",
      "windows": {
        "voting_period": "120h",
        "min_execution_period": "0s"
      }
    },
  }
}
```

#### GroupMembers

The `GroupMembers` endpoint allows users to query for group members by group id with pagination flags.

```bash
/cosmos/group/v1/group_members/{group_id}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/group_members/1
```

Example Output:

```bash
{
  "members": [
    {
      "group_id": "1",
      "member": {
        "address": "cosmos1..",
        "weight": "1",
        "metadata": "AQ=="
      }
    },
    {
      "group_id": "1",
      "member": {
        "address": "cosmos1..",
        "weight": "2",
        "metadata": "AQ=="
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### GroupsByAdmin

The `GroupsByAdmin` endpoint allows users to query for groups by admin account address with pagination flags.

```bash
/cosmos/group/v1/groups_by_admin/{admin}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/groups_by_admin/cosmos1..
```

Example Output:

```bash
{
  "groups": [
    {
      "id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "total_weight": "3"
    },
    {
      "id": "2",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "total_weight": "3"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### GroupPoliciesByGroup

The `GroupPoliciesByGroup` endpoint allows users to query for group policies by group id with pagination flags.

```bash
/cosmos/group/v1/group_policies_by_group/{group_id}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/group_policies_by_group/1
```

Example Output:

```bash
{
  "group_policies": [
    {
      "address": "cosmos1..",
      "group_id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "decision_policy": {
        "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
        "threshold": "1",
        "windows": {
          "voting_period": "120h",
          "min_execution_period": "0s"
      }
      },
    },
    {
      "address": "cosmos1..",
      "group_id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "decision_policy": {
        "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
        "threshold": "1",
        "windows": {
          "voting_period": "120h",
          "min_execution_period": "0s"
      }
      },
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### GroupPoliciesByAdmin

The `GroupPoliciesByAdmin` endpoint allows users to query for group policies by admin account address with pagination flags.

```bash
/cosmos/group/v1/group_policies_by_admin/{admin}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/group_policies_by_admin/cosmos1..
```

Example Output:

```bash
{
  "group_policies": [
    {
      "address": "cosmos1..",
      "group_id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "decision_policy": {
        "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
        "threshold": "1",
        "windows": {
          "voting_period": "120h",
          "min_execution_period": "0s"
      } 
      },
    },
    {
      "address": "cosmos1..",
      "group_id": "1",
      "admin": "cosmos1..",
      "metadata": "AQ==",
      "version": "1",
      "decision_policy": {
        "@type": "/cosmos.group.v1.ThresholdDecisionPolicy",
        "threshold": "1",
        "windows": {
          "voting_period": "120h",
          "min_execution_period": "0s"
      }
      },
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
```

#### Proposal

The `Proposal` endpoint allows users to query for proposal by id.

```bash
/cosmos/group/v1/proposal/{proposal_id}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/proposal/1
```

Example Output:

```bash
{
  "proposal": {
    "proposal_id": "1",
    "address": "cosmos1..",
    "metadata": "AQ==",
    "proposers": [
      "cosmos1.."
    ],
    "submitted_at": "2021-12-17T07:06:26.310638964Z",
    "group_version": "1",
    "group_policy_version": "1",
    "status": "STATUS_SUBMITTED",
    "result": "RESULT_UNFINALIZED",
    "vote_state": {
      "yes_count": "0",
      "no_count": "0",
      "abstain_count": "0",
      "veto_count": "0"
    },
    "windows": {
      "min_execution_period": "0s",
      "voting_period": "432000s"
    },
    "executor_result": "EXECUTOR_RESULT_NOT_RUN",
    "messages": [
      {
        "@type": "/cosmos.bank.v1beta1.MsgSend",
        "from_address": "cosmos1..",
        "to_address": "cosmos1..",
        "amount": [
          {
            "denom": "stake",
            "amount": "100000000"
          }
        ]
      }
    ],
    "title": "Title",
    "summary": "Summary",
  }
}
```

#### ProposalsByGroupPolicy

The `ProposalsByGroupPolicy` endpoint allows users to query for proposals by account address of group policy with pagination flags.

```bash
/cosmos/group/v1/proposals_by_group_policy/{address}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/proposals_by_group_policy/cosmos1..
```

Example Output:

```bash
{
  "proposals": [
    {
      "id": "1",
      "group_policy_address": "cosmos1..",
      "metadata": "AQ==",
      "proposers": [
        "cosmos1.."
      ],
      "submit_time": "2021-12-17T08:03:27.099649352Z",
      "group_version": "1",
      "group_policy_version": "1",
      "status": "STATUS_CLOSED",
      "result": "RESULT_ACCEPTED",
      "vote_state": {
        "yes_count": "1",
        "no_count": "0",
        "abstain_count": "0",
        "veto_count": "0"
      },
      "windows": {
        "min_execution_period": "0s",
        "voting_period": "432000s"
      },
      "executor_result": "EXECUTOR_RESULT_NOT_RUN",
      "messages": [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          "from_address": "cosmos1..",
          "to_address": "cosmos1..",
          "amount": [
            {
              "denom": "stake",
              "amount": "100000000"
            }
          ]
        }
      ]
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### VoteByProposalVoter

The `VoteByProposalVoter` endpoint allows users to query for vote by proposal id and voter account address.

```bash
/cosmos/group/v1/vote_by_proposal_voter/{proposal_id}/{voter}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1beta1/vote_by_proposal_voter/1/cosmos1..
```

Example Output:

```bash
{
  "vote": {
    "proposal_id": "1",
    "voter": "cosmos1..",
    "choice": "CHOICE_YES",
    "metadata": "AQ==",
    "submitted_at": "2021-12-17T08:05:02.490164009Z"
  }
}
```

#### VotesByProposal

The `VotesByProposal` endpoint allows users to query for votes by proposal id with pagination flags.

```bash
/cosmos/group/v1/votes_by_proposal/{proposal_id}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/votes_by_proposal/1
```

Example Output:

```bash
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "cosmos1..",
      "option": "CHOICE_YES",
      "metadata": "AQ==",
      "submit_time": "2021-12-17T08:05:02.490164009Z"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### VotesByVoter

The `VotesByVoter` endpoint allows users to query for votes by voter account address with pagination flags.

```bash
/cosmos/group/v1/votes_by_voter/{voter}
```

Example:

```bash
curl localhost:1317/cosmos/group/v1/votes_by_voter/cosmos1..
```

Example Output:

```bash
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "cosmos1..",
      "choice": "CHOICE_YES",
      "metadata": "AQ==",
      "submitted_at": "2021-12-17T08:05:02.490164009Z"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

## Metadata

The group module has four locations for metadata where users can provide further context about the on-chain actions they are taking. By default all metadata fields have a 255 character length field where metadata can be stored in json format, either on-chain or off-chain depending on the amount of data required. Here we provide a recommendation for the json structure and where the data should be stored. There are two important factors in making these recommendations. First, that the group and gov modules are consistent with one another, note the number of proposals made by all groups may be quite large. Second, that client applications such as block explorers and governance interfaces have confidence in the consistency of metadata structure accross chains.

### Proposal

Location: off-chain as json object stored on IPFS (mirrors [gov proposal](../gov/README.md#metadata))

```json
{
  "title": "",
  "authors": [""],
  "summary": "",
  "details": "",
  "proposal_forum_url": "",
  "vote_option_context": "",
}
```

:::note
The `authors` field is an array of strings, this is to allow for multiple authors to be listed in the metadata.
In v0.46, the `authors` field is a comma-separated string. Frontends are encouraged to support both formats for backwards compatibility.
:::

### Vote

Location: on-chain as json within 255 character limit (mirrors [gov vote](../gov/README.md#metadata))

```json
{
  "justification": "",
}
```

### Group

Location: off-chain as json object stored on IPFS

```json
{
  "name": "",
  "description": "",
  "group_website_url": "",
  "group_forum_url": "",
}
```

### Decision policy

Location: on-chain as json within 255 character limit

```json
{
  "name": "",
  "description": "",
}
```
