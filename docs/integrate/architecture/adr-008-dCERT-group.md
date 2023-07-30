# ADR 008: 分散式计算机应急响应小组（dCERT）组

## 更新日志

* 2019年7月31日：初稿

## 背景

为了减少在紧急情况下处理敏感信息的相关方数量，我们提议创建一个名为分散式计算机应急响应小组（dCERT）的专业化小组。最初，该小组的角色旨在充当区块链社区内各方之间的协调者，如验证者、漏洞猎人和开发人员。在危机时期，dCERT小组将汇总和传递来自各方的意见给正在制定软件补丁的开发人员，这样敏感信息就不需要公开披露，同时仍然可以获得社区的一些意见。

此外，还提议为dCERT小组提供特殊权限：即“断路器”（也称为临时禁用）特定的消息路径。请注意，此权限应通过治理参数在全局范围内启用/禁用，这样一旦建立了dCERT小组，就可以通过参数更改提案来启用此权限。

未来，社区可能希望扩展dCERT的角色，增加其他责任，例如在整个社区范围内进行全面投票之前，代表社区“预先批准”安全更新，以便在修补现场网络的漏洞之前披露敏感信息。

## 决策

建议将dCERT小组包括在[ADR 007](adr-007-specialization-groups.md)中定义的`SpecializationGroup`的实现中。这将包括以下实现：

* 持续投票
* 由于违反软合约而进行的惩罚
* 由于违反软合约而撤销成员
* 整个dCERT小组的紧急解散（例如，出于恶意串通）
* 由社区池或治理决定的其他方式的补偿津贴

该系统需要以下新参数：

* 每个 dCERT 成员的 blockly 津贴津贴
* dCERT 成员的最大数量
* 每个 dCERT 成员所需的抵押可被削减的代币
* 暂停特定成员所需的法定人数
* 解散 dCERT 组的提案赌注
* dCERT 成员过渡的稳定期
* 启用断路器 dCERT 特权

这些参数预计通过参数保管者实施，以便治理可以在任何给定的时间更改它们。

### 连续投票选举者

一个 `Electionator` 对象将被实现为连续投票，并具有以下规格：

* 所有委托地址可以在任何时候提交投票，以更新其在 dCERT 组中的首选代表。
* 首选代表可以在地址之间任意分配（例如，50% 给 John，25% 给 Sally，25% 给 Carol）。
* 要将新成员添加到 dCERT 组中，他们必须发送一笔交易接受他们的入场，此时将确认他们的入场的有效性。
    * 当将成员添加到 dCERT 组时，分配一个序列号。如果成员离开 dCERT 组然后重新加入，将分配一个新的序列号。
* 控制最大首选代表数量的地址有资格加入 dCERT 组（最多 _dCERT 成员的最大数量_）。如果 dCERT 组已满并且新成员被接纳，则将从 dCERT 组中踢出投票最少的现有 dCERT 成员。
    * 在分裂情况下，即 dCERT 组已满，但竞争候选人的投票数与现有 dCERT 成员相同，现有成员应保持其位置。
    * 在必须踢出某人的分裂情况下，但是投票数最少的两个地址具有相同的投票数时，具有最小序列号的地址将保持其位置。
* 可以选择包括一个稳定期以减少 dCERT 成员尾部的“翻转”。如果提供了大于 0 的稳定期，当成员由于支持不足而被踢出时，将创建一个队列条目，记录要替换哪个成员。在此条目在队列中时，不能进行新的踢出该 dCERT 成员的条目。当条目在稳定期的持续时间到达时，新成员将被实例化，并踢出旧成员。

### 质押/惩罚

dCERT小组的所有成员都必须质押代币，以保持作为dCERT成员的资格。这些代币可以由竞争的dCERT成员直接质押，也可以由第三方出于善意质押（但不会因此获得链上的任何好处）。这种质押机制应该使用已经存在的全局解绑时间，用于质押以确保网络验证器的安全。只有在这种机制下质押了所需的代币，dCERT成员才能成为成员。如果这些代币被解绑，那么dCERT成员必须被自动从小组中移除。

由于软合约违约，特定的dCERT成员应该根据违约的严重程度，由治理机构进行惩罚。预计的流程是，在被治理机构惩罚之前，dCERT成员将被dCERT小组暂停。

dCERT小组通过dCERT小组成员的投票程序进行成员暂停。在进行了这种暂停之后，必须提交一个治理提案来惩罚该dCERT成员，如果该提案在撤销成员完成解绑其代币之前未获批准，则这些代币将不再质押，也无法被惩罚。

此外，在发生dCERT小组串通和恶意行为的紧急情况下，社区需要有能力解散整个dCERT小组，并可能完全惩罚他们。这可以通过一种特殊的新提案类型（作为一般治理提案实施）来实现，该提案将暂停dCERT小组的功能，直到提案结束。这种特殊的提案类型可能还需要一个相当大的赌注，如果提案创建者是恶意的，该赌注可能会被惩罚。之所以需要一个大的赌注，是因为一旦提案被提出，dCERT小组停止消息路由的能力将被暂时暂停，这意味着在此期间，创建这样一个提案的恶意参与者可能会利用漏洞，而没有dCERT小组能够关闭可利用的消息路由。

### dCERT成员交易

活跃的dCERT成员

* 更改dCERT组的描述
* 断开消息路由
* 投票暂停dCERT成员

这里的断开消息路由是指禁用一组消息的能力，例如可以"禁用所有质押委托消息"或"禁用所有分发消息"。这可以通过在CheckTx时间（在`baseapp/baseapp.go`中）验证消息路由是否被"断开"来实现。

"解除断开"电路只有在硬分叉升级期间才会发生，这意味着在活跃链上不需要解除消息路由的能力。

还要注意，如果治理投票存在问题（例如可以多次投票的能力），则治理将被破坏，应该通过此机制停止，然后由验证器集合协调并升级到修补版本的软件，重新启用（并修复）治理。如果dCERT组滥用此特权，他们应该受到严厉的惩罚。

## 状态

> 提议

## 影响

### 积极影响

* 在紧急情况下减少需要协调的各方数量
* 减少向恶意方披露敏感信息的可能性

### 负面影响

* 中心化风险

### 中性影响

## 参考资料

  [专业化组ADR](adr-007-specialization-groups.md)


# ADR 008: Decentralized Computer Emergency Response Team (dCERT) Group

## Changelog

* 2019 Jul 31: Initial Draft

## Context

In order to reduce the number of parties involved with handling sensitive
information in an emergency scenario, we propose the creation of a
specialization group named The Decentralized Computer Emergency Response Team
(dCERT).  Initially this group's role is intended to serve as coordinators
between various actors within a blockchain community such as validators,
bug-hunters, and developers.  During a time of crisis, the dCERT group would
aggregate and relay input from a variety of stakeholders to the developers who
are actively devising a patch to the software, this way sensitive information
does not need to be publicly disclosed while some input from the community can
still be gained.

Additionally, a special privilege is proposed for the dCERT group: the capacity
to "circuit-break" (aka. temporarily disable)  a particular message path. Note
that this privilege should be enabled/disabled globally with a governance
parameter such that this privilege could start disabled and later be enabled
through a parameter change proposal, once a dCERT group has been established.

In the future it is foreseeable that the community may wish to expand the roles
of dCERT with further responsibilities such as the capacity to "pre-approve" a
security update on behalf of the community prior to a full community
wide vote whereby the sensitive information would be revealed prior to a
vulnerability being patched on the live network.  

## Decision

The dCERT group is proposed to include an implementation of a `SpecializationGroup`
as defined in [ADR 007](adr-007-specialization-groups.md). This will include the
implementation of:

* continuous voting
* slashing due to breach of soft contract
* revoking a member due to breach of soft contract
* emergency disband of the entire dCERT group (ex. for colluding maliciously)
* compensation stipend from the community pool or other means decided by
   governance

This system necessitates the following new parameters:

* blockly stipend allowance per dCERT member
* maximum number of dCERT members
* required staked slashable tokens for each dCERT member
* quorum for suspending a particular member
* proposal wager for disbanding the dCERT group
* stabilization period for dCERT member transition
* circuit break dCERT privileges enabled

These parameters are expected to be implemented through the param keeper such
that governance may change them at any given point.

### Continuous Voting Electionator

An `Electionator` object is to be implemented as continuous voting and with the
following specifications:

* All delegation addresses may submit votes at any point which updates their
   preferred representation on the dCERT group.
* Preferred representation may be arbitrarily split between addresses (ex. 50%
   to John, 25% to Sally, 25% to Carol)
* In order for a new member to be added to the dCERT group they must
   send a transaction accepting their admission at which point the validity of
   their admission is to be confirmed.
    * A sequence number is assigned when a member is added to dCERT group.
     If a member leaves the dCERT group and then enters back, a new sequence number
     is assigned.  
* Addresses which control the greatest amount of preferred-representation are
   eligible to join the dCERT group (up the _maximum number of dCERT members_).
   If the dCERT group is already full and new member is admitted, the existing
   dCERT member with the lowest amount of votes is kicked from the dCERT group.
    * In the split situation where the dCERT group is full but a vying candidate
     has the same amount of vote as an existing dCERT member, the existing
     member should maintain its position.
    * In the split situation where somebody must be kicked out but the two
     addresses with the smallest number of votes have the same number of votes,
     the address with the smallest sequence number maintains its position.  
* A stabilization period can be optionally included to reduce the
   "flip-flopping" of the dCERT membership tail members. If a stabilization
   period is provided which is greater than 0, when members are kicked due to
   insufficient support, a queue entry is created which documents which member is
   to replace which other member. While this entry is in the queue, no new entries
   to kick that same dCERT member can be made. When the entry matures at the
   duration of the  stabilization period, the new member is instantiated, and old
   member kicked.

### Staking/Slashing

All members of the dCERT group must stake tokens _specifically_ to maintain
eligibility as a dCERT member. These tokens can be staked directly by the vying
dCERT member or out of the good will of a 3rd party (who shall gain no on-chain
benefits for doing so). This staking mechanism should use the existing global
unbonding time of tokens staked for network validator security. A dCERT member
can _only be_ a member if it has the required tokens staked under this
mechanism. If those tokens are unbonded then the dCERT member must be
automatically kicked from the group.  

Slashing of a particular dCERT member due to soft-contract breach should be
performed by governance on a per member basis based on the magnitude of the
breach.  The process flow is anticipated to be that a dCERT member is suspended
by the dCERT group prior to being slashed by governance.  

Membership suspension by the dCERT group takes place through a voting procedure
by the dCERT group members. After this suspension has taken place, a governance
proposal to slash the dCERT member must be submitted, if the proposal is not
approved by the time the rescinding member has completed unbonding their
tokens, then the tokens are no longer staked and unable to be slashed.

Additionally in the case of an emergency situation of a colluding and malicious
dCERT group, the community needs the capability to disband the entire dCERT
group and likely fully slash them. This could be achieved though a special new
proposal type (implemented as a general governance proposal) which would halt
the functionality of the dCERT group until the proposal was concluded. This
special proposal type would likely need to also have a fairly large wager which
could be slashed if the proposal creator was malicious. The reason a large
wager should be required is because as soon as the proposal is made, the
capability of the dCERT group to halt message routes is put on temporarily
suspended, meaning that a malicious actor who created such a proposal could
then potentially exploit a bug during this period of time, with no dCERT group
capable of shutting down the exploitable message routes.

### dCERT membership transactions

Active dCERT members

* change of the description of the dCERT group
* circuit break a message route
* vote to suspend a dCERT member.

Here circuit-breaking refers to the capability to disable a groups of messages,
This could for instance mean: "disable all staking-delegation messages", or
"disable all distribution messages". This could be accomplished by verifying
that the message route has not been "circuit-broken" at CheckTx time (in
`baseapp/baseapp.go`).

"unbreaking" a circuit is anticipated only to occur during a hard fork upgrade
meaning that no capability to unbreak a message route on a live chain is
required.

Note also, that if there was a problem with governance voting (for instance a
capability to vote many times) then governance would be broken and should be
halted with this mechanism, it would be then up to the validator set to
coordinate and hard-fork upgrade to a patched version of the software where
governance is re-enabled (and fixed). If the dCERT group abuses this privilege
they should all be severely slashed.

## Status

> Proposed

## Consequences

### Positive

* Potential to reduces the number of parties to coordinate with during an emergency
* Reduction in possibility of disclosing sensitive information to malicious parties

### Negative

* Centralization risks

### Neutral

## References

  [Specialization Groups ADR](adr-007-specialization-groups.md)
