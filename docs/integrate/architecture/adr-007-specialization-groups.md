# ADR 007: 专业化小组

## 变更日志

* 2019年7月31日：初稿

## 背景

这个想法最初是为了满足创建一个去中心化的计算机应急响应团队（dCERT）的用例而产生的，其成员将由一个治理社区选举产生，并在紧急情况下协调社区的工作。这种思路可以进一步抽象为“区块链专业化小组”。

创建这些小组是在更广泛的区块链社区中实现专业化能力的开端，可以用于实现一定程度的委派责任。对于区块链社区而言，一些有益的专业化领域包括：代码审计、应急响应、代码开发等。这种社区组织方式为个体利益相关者在未来的治理提案中，如果包含了问题类型字段，为其委派投票权铺平了道路。

## 决策

专业化小组可以广泛地分为以下功能（包含示例）：

* 成员录取
* 成员接受
* 成员撤销
    * （可能）无惩罚
        * 成员主动辞职（自我撤销）
        * 由治理机构选举新成员接替
    * （可能）有惩罚
        * 由于违反软协议（由治理机构确定）
        * 由于违反硬协议（由代码确定）
* 职责执行
    * 仅对专业化小组成员执行的特殊交易（例如，dCERT成员在紧急情况下投票关闭交易路由）
* 补偿
    * 小组补偿（由专业化小组决定进一步分配）
    * 来自整个社区的小组成员个人补偿

加入专业化小组的成员录取可以通过多种机制进行。最明显的例子是通过整个社区的普选，然而在某些系统中，社区可能希望允许已经在专业化小组中的成员内部选举新成员，或者社区可能授予特定专业化小组在其他第三方小组中任命成员的权限。对于成员录取的结构，实际上没有限制。我们试图在一个通用接口中捕捉其中一些可能性，该接口被称为“选举者”（`Electionator`）。对于其作为本ADR的一部分的初始实现，我们建议提供通用选举抽象（`Electionator`）以及该抽象的基本实现，该实现允许对专业化小组的成员进行持续选举。

``` golang
// The Electionator abstraction covers the concept space for
// a wide variety of election kinds.  
type Electionator interface {

    // is the election object accepting votes.
    Active() bool

    // functionality to execute for when a vote is cast in this election, here
    // the vote field is anticipated to be marshalled into a vote type used
    // by an election.
    //
    // NOTE There are no explicit ids here. Just votes which pertain specifically
    // to one electionator. Anyone can create and send a vote to the electionator item
    // which will presumably attempt to marshal those bytes into a particular struct
    // and apply the vote information in some arbitrary way. There can be multiple
    // Electionators within the Cosmos-Hub for multiple specialization groups, votes
    // would need to be routed to the Electionator upstream of here.
    Vote(addr sdk.AccAddress, vote []byte)

    // here lies all functionality to authenticate and execute changes for
    // when a member accepts being elected
    AcceptElection(sdk.AccAddress)

    // Register a revoker object
    RegisterRevoker(Revoker)

    // No more revokers may be registered after this function is called
    SealRevokers()

    // register hooks to call when an election actions occur
    RegisterHooks(ElectionatorHooks)

    // query for the current winner(s) of this election based on arbitrary
    // election ruleset
    QueryElected() []sdk.AccAddress

    // query metadata for an address in the election this
    // could include for example position that an address
    // is being elected for within a group
    //
    // this metadata may be directly related to
    // voting information and/or privileges enabled
    // to members within a group.
    QueryMetadata(sdk.AccAddress) []byte
}

// ElectionatorHooks, once registered with an Electionator,
// trigger execution of relevant interface functions when
// Electionator events occur.
type ElectionatorHooks interface {
    AfterVoteCast(addr sdk.AccAddress, vote []byte)
    AfterMemberAccepted(addr sdk.AccAddress)
    AfterMemberRevoked(addr sdk.AccAddress, cause []byte)
}

// Revoker defines the function required for a membership revocation rule-set
// used by a specialization group. This could be used to create self revoking,
// and evidence based revoking, etc. Revokers types may be created and
// reused for different election types.
//
// When revoking the "cause" bytes may be arbitrarily marshalled into evidence,
// memos, etc.
type Revoker interface {
    RevokeName() string      // identifier for this revoker type
    RevokeMember(addr sdk.AccAddress, cause []byte) error
}
```

在`x/governance`中可能存在一定程度的共性，与选举所需的功能相似。在实现过程中，应该将这种共性功能进行抽象。同样，对于每个投票实现的客户端CLI/REST功能，也应该进行抽象，以便在多个选举中重用。

专业化群组抽象首先扩展了`Electionator`，同时进一步定义了群组的特征。

``` golang
type SpecializationGroup interface {
    Electionator
    GetName() string
    GetDescription() string

    // general soft contract the group is expected
    // to fulfill with the greater community
    GetContract() string

    // messages which can be executed by the members of the group
    Handler(ctx sdk.Context, msg sdk.Msg) sdk.Result

    // logic to be executed at endblock, this may for instance
    // include payment of a stipend to the group members
    // for participation in the security group.
    EndBlocker(ctx sdk.Context)
}
```

## 状态

> 提议中

## 影响

### 积极影响

* 增强区块链的专业化能力
* 改进`x/gov/`中的抽象，使其可以与专业化群组一起使用

### 负面影响

* 可能会增加社区内的集中化程度

### 中性影响

## 参考资料

* [dCERT ADR](adr-008-dCERT-group.md)


# ADR 007: Specialization Groups

## Changelog

* 2019 Jul 31: Initial Draft

## Context

This idea was first conceived of in order to fulfill the use case of the
creation of a decentralized Computer Emergency Response Team (dCERT), whose
members would be elected by a governing community and would fulfill the role of
coordinating the community under emergency situations. This thinking
can be further abstracted into the conception of "blockchain specialization
groups".

The creation of these groups are the beginning of specialization capabilities
within a wider blockchain community which could be used to enable a certain
level of delegated responsibilities. Examples of specialization which could be
beneficial to a blockchain community include: code auditing, emergency response,
code development etc. This type of community organization paves the way for
individual stakeholders to delegate votes by issue type, if in the future
governance proposals include a field for issue type.

## Decision

A specialization group can be broadly broken down into the following functions
(herein containing examples):

* Membership Admittance
* Membership Acceptance
* Membership Revocation
    * (probably) Without Penalty
        * member steps down (self-Revocation)
        * replaced by new member from governance
    * (probably) With Penalty
        * due to breach of soft-agreement (determined through governance)
        * due to breach of hard-agreement (determined by code)
* Execution of Duties
    * Special transactions which only execute for members of a specialization
     group (for example, dCERT members voting to turn off transaction routes in
     an emergency scenario)
* Compensation
    * Group compensation (further distribution decided by the specialization group)
    * Individual compensation for all constituents of a group from the
     greater community

Membership admittance to a specialization group could take place over a wide
variety of mechanisms. The most obvious example is through a general vote among
the entire community, however in certain systems a community may want to allow
the members already in a specialization group to internally elect new members,
or maybe the community may assign a permission to a particular specialization
group to appoint members to other 3rd party groups. The sky is really the limit
as to how membership admittance can be structured. We attempt to capture
some of these possiblities in a common interface dubbed the `Electionator`. For
its initial implementation as a part of this ADR we recommend that the general
election abstraction (`Electionator`) is provided as well as a basic
implementation of that abstraction which allows for a continuous election of
members of a specialization group.

``` golang
// The Electionator abstraction covers the concept space for
// a wide variety of election kinds.  
type Electionator interface {

    // is the election object accepting votes.
    Active() bool

    // functionality to execute for when a vote is cast in this election, here
    // the vote field is anticipated to be marshalled into a vote type used
    // by an election.
    //
    // NOTE There are no explicit ids here. Just votes which pertain specifically
    // to one electionator. Anyone can create and send a vote to the electionator item
    // which will presumably attempt to marshal those bytes into a particular struct
    // and apply the vote information in some arbitrary way. There can be multiple
    // Electionators within the Cosmos-Hub for multiple specialization groups, votes
    // would need to be routed to the Electionator upstream of here.
    Vote(addr sdk.AccAddress, vote []byte)

    // here lies all functionality to authenticate and execute changes for
    // when a member accepts being elected
    AcceptElection(sdk.AccAddress)

    // Register a revoker object
    RegisterRevoker(Revoker)

    // No more revokers may be registered after this function is called
    SealRevokers()

    // register hooks to call when an election actions occur
    RegisterHooks(ElectionatorHooks)

    // query for the current winner(s) of this election based on arbitrary
    // election ruleset
    QueryElected() []sdk.AccAddress

    // query metadata for an address in the election this
    // could include for example position that an address
    // is being elected for within a group
    //
    // this metadata may be directly related to
    // voting information and/or privileges enabled
    // to members within a group.
    QueryMetadata(sdk.AccAddress) []byte
}

// ElectionatorHooks, once registered with an Electionator,
// trigger execution of relevant interface functions when
// Electionator events occur.
type ElectionatorHooks interface {
    AfterVoteCast(addr sdk.AccAddress, vote []byte)
    AfterMemberAccepted(addr sdk.AccAddress)
    AfterMemberRevoked(addr sdk.AccAddress, cause []byte)
}

// Revoker defines the function required for a membership revocation rule-set
// used by a specialization group. This could be used to create self revoking,
// and evidence based revoking, etc. Revokers types may be created and
// reused for different election types.
//
// When revoking the "cause" bytes may be arbitrarily marshalled into evidence,
// memos, etc.
type Revoker interface {
    RevokeName() string      // identifier for this revoker type
    RevokeMember(addr sdk.AccAddress, cause []byte) error
}
```

Certain level of commonality likely exists between the existing code within
`x/governance` and required functionality of elections. This common
functionality should be abstracted during implementation. Similarly for each
vote implementation client CLI/REST functionality should be abstracted
to be reused for multiple elections.

The specialization group abstraction firstly extends the `Electionator`
but also further defines traits of the group.

``` golang
type SpecializationGroup interface {
    Electionator
    GetName() string
    GetDescription() string

    // general soft contract the group is expected
    // to fulfill with the greater community
    GetContract() string

    // messages which can be executed by the members of the group
    Handler(ctx sdk.Context, msg sdk.Msg) sdk.Result

    // logic to be executed at endblock, this may for instance
    // include payment of a stipend to the group members
    // for participation in the security group.
    EndBlocker(ctx sdk.Context)
}
```

## Status

> Proposed

## Consequences

### Positive

* increases specialization capabilities of a blockchain
* improve abstractions in `x/gov/` such that they can be used with specialization groups

### Negative

* could be used to increase centralization within a community

### Neutral

## References

* [dCERT ADR](adr-008-dCERT-group.md)
