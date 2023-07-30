# `x/gov`

## 摘要

本文规定了Cosmos SDK的治理模块，该模块首次在2016年6月的[Cosmos白皮书](https://cosmos.network/about/whitepaper)中进行了描述。

该模块使得基于Cosmos SDK的区块链能够支持链上治理系统。在该系统中，链上原生质押代币的持有者可以按照1代币1票的原则对提案进行投票。下面是该模块目前支持的功能列表：

* **提案提交：** 用户可以通过缴纳押金来提交提案。一旦达到最低押金要求，提案进入投票期。
* **投票：** 参与者可以对达到最低押金要求的提案进行投票。
* **继承和惩罚：** 如果委托人自己没有投票，他们将继承其验证人的投票权。
* **取回押金：** 如果提案被接受或拒绝，参与提案的用户可以取回他们的押金。如果提案被否决或从未进入投票期，押金将被销毁。

该模块将在Cosmos网络中的第一个Hub——Cosmos Hub中使用。未来可能添加的功能在[未来改进](#future-improvements)中进行了描述。

## 目录

以下规范使用*ATOM*作为原生质押代币。该模块可以通过将*ATOM*替换为链上的原生质押代币来适应任何权益证明区块链。

* [概念](#concepts)
    * [提案提交](#proposal-submission)
    * [押金](#deposit)
    * [投票](#vote)
* [状态](#state)
    * [提案](#proposals)
    * [参数和基本类型](#parameters-and-base-types)
    * [押金](#deposit-1)
    * [验证人治理信息](#validatorgovinfo)
    * [存储](#stores)
    * [提案处理队列](#proposal-processing-queue)
    * [旧版提案](#legacy-proposal)
* [消息](#messages)
    * [提案提交](#proposal-submission-1)
    * [押金](#deposit-2)
    * [投票](#vote-1)
* [事件](#events)
    * [EndBlocker](#endblocker)
    * [处理器](#handlers)
* [参数](#parameters)
* [客户端](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)
* [元数据](#metadata)
    * [提案](#proposal-3)
    * [投票](#vote-5)
* [未来改进](#future-improvements)

## 概念

*免责声明：这是一个正在进行中的工作。机制可能会发生变化。*

治理流程分为几个步骤，如下所述：

* **提案提交：** 提案与一笔押金一起提交到区块链上。
* **投票：** 一旦押金达到一定值（`MinDeposit`），提案将被确认并开启投票。持有抵押的 Atom 可以发送 `TxGovVote` 交易来对提案进行投票。
* **执行：** 经过一段时间后，投票结果将被统计，并根据结果执行提案中的消息。

### 提案提交

#### 提交提案的权利

每个账户都可以通过发送 `MsgSubmitProposal` 交易来提交提案。一旦提案提交成功，它将通过其唯一的 `proposalID` 进行标识。

#### 提案消息

提案包括一系列的 `sdk.Msg`，如果提案通过，这些消息将自动执行。这些消息由治理 `ModuleAccount` 自身执行。例如，希望允许某些消息仅由治理执行的模块（如 `x/upgrade`）应在相应的消息服务器中添加一个白名单，授予治理模块在达到法定人数后执行该消息的权利。治理模块使用 `MsgServiceRouter` 来检查这些消息是否正确构造，并具有相应的执行路径，但不执行完整的有效性检查。

### 押金

为了防止垃圾信息，提案必须以 `MinDeposit` 参数定义的货币进行提交。

当提交提案时，必须附带一笔押金，该押金必须严格为正数，但可以小于 `MinDeposit`。提交者不需要自己支付整个押金。新创建的提案将存储在*非活动提案队列*中，并保持在那里，直到其押金达到 `MinDeposit`。其他代币持有者可以通过发送 `Deposit` 交易来增加提案的押金。如果在押金截止时间（不再接受押金的时间）之前，提案未能通过 `MinDeposit`，则提案将被销毁：提案将从状态中移除，并且押金将被销毁（参见 x/gov `EndBlocker`）。如果在押金截止时间之前，提案的押金达到 `MinDeposit` 阈值（即使在提案提交期间），则提案将被移动到*活动提案队列*中，并开始投票期。

存款被托管并由治理 `ModuleAccount` 持有，直到提案最终确定（通过或拒绝）。

#### 存款退还和销毁

当提案最终确定时，根据提案的最终计数，存款中的代币要么退还给各自的存款人（从治理 `ModuleAccount` 转移），要么被销毁：

* 如果提案被批准或拒绝但没有被否决，每个存款将自动退还给其各自的存款人（从治理 `ModuleAccount` 转移）。
* 当提案被否决且否决票超过1/3时，存款将从治理 `ModuleAccount` 中被销毁，并且提案信息以及其存款信息将从状态中删除。
* 所有退还或销毁的存款将从状态中删除。在销毁或退还存款时会发布事件。

### 投票

#### 参与者

*参与者* 是有权对提案进行投票的用户。在 Cosmos Hub 上，参与者是已质押的 Atom 持有者。未质押的 Atom 持有者和其他用户没有参与治理的权利。但是，他们可以提交提案并存款。

请注意，当 *参与者* 既有质押的 Atom 又有未质押的 Atom 时，他们的投票权仅根据其质押的 Atom 持有量计算。

#### 投票期

一旦提案达到 `MinDeposit`，它立即进入 `投票期`。我们将 `投票期` 定义为投票开启和投票关闭之间的时间间隔。`投票期` 应该始终比 `解质押期` 短，以防止重复投票。`投票期` 的初始值为2周。

#### 选项集

提案的选项集指的是参与者在投票时可以选择的一组选项。

初始选项集包括以下选项：

* `赞成`
* `反对`
* `否决`
* `弃权`

`否决` 选项相当于 `反对`，但还增加了一个 `否决` 投票。`弃权` 选项允许选民表示他们不打算赞成或反对提案，但接受投票结果。

*注意：对于紧急提案，我们可能应该在用户界面中添加一个“非紧急”选项，以进行 `否决` 投票。*

#### 加权投票

[ADR-037](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-037-gov-split-vote.md) 引入了加权投票功能，允许质押者将他们的投票分成几个选项。例如，它可以使用其投票权的70%投票赞成，使用其投票权的30%投票反对。

通常情况下，拥有该地址的实体可能不是单个个体。例如，一个公司可能有不同的利益相关者希望进行不同的投票，因此允许他们分割他们的投票权是有意义的。目前，他们无法进行“透传投票”并赋予他们的用户对其代币的投票权。然而，通过这个系统，交易所可以对其用户进行投票偏好的调查，然后按照调查结果在链上按比例进行投票。

为了在链上表示加权投票，我们使用以下 Protobuf 消息。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1beta1/gov.proto#L34-L47
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1beta1/gov.proto#L181-L201
```

对于加权投票要有效，`options` 字段不能包含重复的投票选项，并且所有选项的权重之和必须等于1。

### 法定人数

法定人数被定义为提案需要获得的最低投票权百分比，以使结果有效。

### 快速提案

提案可以被加速，使提案使用较短的投票持续时间和更高的计票阈值。如果在较短的投票持续时间范围内，加速提案未能达到阈值，则加速提案将转换为常规提案，并在常规投票条件下重新开始投票。

#### 阈值

阈值被定义为提案被接受所需的最低比例的“赞成”票（不包括“弃权”票）。

最初，阈值被设定为“赞成”票的50%，不包括“弃权”票。如果超过三分之一的所有投票是“反对否决”票，则存在否决的可能性。请注意，这两个值都是从链上参数 `TallyParams` 派生的，可以通过治理进行修改。
这意味着提案被接受当且仅当：

* 存在已质押的代币。
* 已达到法定人数。
* `弃权` 票数比例低于 1/1。
* `否决` 票数比例低于 1/3，包括 `弃权` 票数。
* 在投票期结束时，`赞成` 票数（不包括 `弃权` 票数）比例超过 1/2。

对于加快处理的提案，默认的门槛比 *普通提案* 更高，即 66.7%。

#### 继承

如果委托人没有投票，将继承其验证人的投票。

* 如果委托人在其验证人之前投票，将不会继承验证人的投票。
* 如果委托人在其验证人之后投票，将用自己的投票覆盖验证人的投票。如果提案紧急，可能会在委托人有机会反应并覆盖验证人的投票之前关闭投票。这不是一个问题，因为提案需要在投票期结束时达到超过总投票权的 2/3 才能通过。因为只有 1/3 + 1 的验证权力可以串通起来审查交易，所以已经假设超过此门槛的范围内不存在串通行为。

#### 验证人未投票的惩罚

目前，验证人未投票不会受到惩罚。

#### 治理地址

以后，我们可能会添加具有权限的密钥，只能对某些模块的交易进行签名。对于 MVP，`治理地址` 将是在账户创建时生成的主验证人地址。该地址对应于与负责签署共识消息的 CometBFT PrivKey 不同的 PrivKey。因此，验证人不需要使用敏感的 CometBFT PrivKey 对治理交易进行签名。

#### 可燃参数

有三个参数用于确定提案的存款是否应该被烧毁或退还给存款人。

* `BurnVoteVeto` 如果提案被否决，则烧毁提案的存款。
* `BurnVoteQuorum` 如果投票未达到法定人数，则烧毁提案的存款。
* `BurnProposalDepositPrevote` 如果提案未进入投票阶段，则烧毁提案的存款。

> 注意：这些参数可以通过治理进行修改。

## 状态

### 宪法

`Constitution`（宪法）可以在创世状态中找到。它是一个字符串字段，用于描述特定区块链的目的和预期规范。以下是一些宪法字段的用法示例：

* 定义链的目的，为其未来发展奠定基础
* 设定委托人的期望
* 设定验证人的期望
* 定义链与“现实世界”实体（如基金会或公司）的关系

由于这更多是一个社交功能而不是技术功能，我们现在将介绍一些可能在创世宪法中有用的项目：

* 是否存在对治理的限制？
    * 社区是否可以削减不再希望存在的大户的钱包？（例如：Juno 提案 4 和 16）
    * 治理是否可以“社交削减”使用未经批准的 MEV 的验证人？（例如：commonwealth.im/osmosis）
    * 在经济紧急情况下，验证人应该做什么？
        * 2022 年 5 月的 Terra 崩溃中，验证人选择运行一个新的二进制文件，其中的代码未经治理批准，因为治理代币已经贬值为零。
* 链的目的是什么？
    * 最好的例子是 Cosmos Hub，不同的创始团队对网络目的有不同的解释。

这个创世条目“宪法”并不适用于现有的链，它们应该使用其治理系统批准一份宪法。相反，它适用于新的链。它将使验证人对目的和运行节点时对他们的期望有更清晰的了解。同样，对于社区成员来说，宪法将使他们对“链团队”和验证人的期望有一些了解。

这个宪法被设计为不可变的，只能放在创世状态中，尽管随着时间的推移，可以通过对 cosmos-sdk 的拉取请求来允许治理修改宪法。希望对原始宪法进行修正的社区应该使用治理机制和“信号提案”来实现这一目标。

**宇宙链宪法的理想使用场景**

作为链开发者，您决定为以下关键用户群体提供清晰度：

* 验证者
* 代币持有者
* 开发者（您自己）

您使用宪法在创世区块中不可变地存储一些Markdown，以便在出现困难问题时，宪法可以为社区提供指导。

### 提案

`Proposal`对象用于计票和通常跟踪提案的状态。
它们包含一系列任意的`sdk.Msg`，治理模块将尝试解决并在提案通过后执行。`Proposal`通过唯一的id进行标识，并包含一系列时间戳：`submit_time`、`deposit_end_time`、`voting_start_time`、`voting_end_time`，用于跟踪提案的生命周期。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L51-L99
```

一个提案通常需要更多的内容来解释其目的，而不仅仅是一组消息，还需要一些更大的理由，并允许感兴趣的参与者讨论和辩论提案。
在大多数情况下，**鼓励使用链下系统来支持链上治理过程**。
为了适应这一点，提案包含一个特殊的**`metadata`**字段，一个字符串，可用于为提案添加上下文。`metadata`字段允许网络进行自定义使用，但是预期该字段包含一个URL或使用诸如[IPFS](https://docs.ipfs.io/concepts/content-addressing/)之类的系统的CID形式。为了支持网络之间的互操作性，SDK建议`metadata`表示以下`JSON`模板：

```json
{
  "title": "...",
  "description": "...",
  "forum": "...", // a link to the discussion platform (i.e. Discord)
  "other": "..." // any extra data that doesn't correspond to the other fields
}
```

这样客户端就可以更容易地支持多个网络。

元数据的最大长度由应用程序开发者选择，并作为配置传递给治理keeper。SDK中的默认最大长度为255个字符。

#### 编写使用治理的模块

您可能希望使用治理来执行链或个别模块的许多方面，例如更改各种参数。这非常简单。首先，编写您的消息类型和`MsgServer`实现。在keeper中添加一个`authority`字段，该字段将在构造函数中由治理模块账户填充：`govKeeper.GetGovernanceAccount().GetAddress()`。然后，在`msg_server.go`中的方法中，对消息执行一个检查，检查签名者是否与`authority`匹配。这将防止任何用户执行该消息。

### 参数和基本类型

`Parameters` 定义了投票运行的规则。在任何给定时间只能有一个活动的参数集。如果治理想要更改参数集，无论是修改一个值还是添加/删除一个参数字段，都必须创建一个新的参数集并将之前的参数集设置为非活动状态。

#### DepositParams

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L152-L162
```

#### VotingParams

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L164-L168
```

#### TallyParams

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L170-L182
```

参数存储在全局的 `GlobalParams` KVStore 中。

此外，我们引入了一些基本类型：

```go
type Vote byte

const (
    VoteYes         = 0x1
    VoteNo          = 0x2
    VoteNoWithVeto  = 0x3
    VoteAbstain     = 0x4
)

type ProposalType  string

const (
    ProposalTypePlainText       = "Text"
    ProposalTypeSoftwareUpgrade = "SoftwareUpgrade"
)

type ProposalStatus byte


const (
    StatusNil           ProposalStatus = 0x00
    StatusDepositPeriod ProposalStatus = 0x01  // Proposal is submitted. Participants can deposit on it but not vote
    StatusVotingPeriod  ProposalStatus = 0x02  // MinDeposit is reached, participants can vote
    StatusPassed        ProposalStatus = 0x03  // Proposal passed and successfully executed
    StatusRejected      ProposalStatus = 0x04  // Proposal has been rejected
    StatusFailed        ProposalStatus = 0x05  // Proposal passed but failed execution
)
```

### 存款

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L38-L49
```

### ValidatorGovInfo

此类型在计算投票结果时使用的临时映射中使用。

```go
  type ValidatorGovInfo struct {
    Minus     sdk.Dec
    Vote      Vote
  }
```

## 存储

:::note
存储是多存储中的 KVStore。查找存储的键是列表中的第一个参数。
:::

我们将使用一个 KVStore `Governance` 来存储四个映射：

* 从 `proposalID|'proposal'` 到 `Proposal` 的映射。
* 从 `proposalID|'addresses'|address` 到 `Vote` 的映射。这个映射允许我们通过在 `proposalID:addresses` 上进行范围查询来查询投票提案的所有地址以及它们的投票。
* 从 `ParamsKey|'Params'` 到 `Params` 的映射。这个映射允许查询所有 x/gov 参数。
* 从 `VotingPeriodProposalKeyPrefix|proposalID` 到一个字节的映射。这个映射允许我们以非常低的 gas 成本知道一个提案是否处于投票期。

为了伪代码的目的，这里是我们将用来在存储中读取或写入的两个函数：

* `load(StoreKey, Key)`: 从多存储中的键 `StoreKey` 找到的存储中检索存储在键 `Key` 处的项目。
* `store(StoreKey, Key, value)`: 在多存储中的键 `StoreKey` 找到的存储中将值 `Value` 写入键 `Key` 处。

### 提案处理队列

**存储:**

* `ProposalProcessingQueue`: 一个队列 `queue[proposalID]` 包含所有达到 `MinDeposit` 的提案的 `ProposalIDs`。在每个 `EndBlock` 中，处理已经达到投票期限的提案。为了处理一个已完成的提案，应用程序会统计投票结果，计算每个验证人的投票结果，并检查验证人集合中的每个验证人是否已经投票。如果提案被接受，将退还存款。最后，执行提案内容的 `Handler`。

而 `ProposalProcessingQueue` 的伪代码如下:

```go
  in EndBlock do

    for finishedProposalID in GetAllFinishedProposalIDs(block.Time)
      proposal = load(Governance, <proposalID|'proposal'>) // proposal is a const key

      validators = Keeper.getAllValidators()
      tmpValMap := map(sdk.AccAddress)ValidatorGovInfo

      // Initiate mapping at 0. This is the amount of shares of the validator's vote that will be overridden by their delegator's votes
      for each validator in validators
        tmpValMap(validator.OperatorAddr).Minus = 0

      // Tally
      voterIterator = rangeQuery(Governance, <proposalID|'addresses'>) //return all the addresses that voted on the proposal
      for each (voterAddress, vote) in voterIterator
        delegations = stakingKeeper.getDelegations(voterAddress) // get all delegations for current voter

        for each delegation in delegations
          // make sure delegation.Shares does NOT include shares being unbonded
          tmpValMap(delegation.ValidatorAddr).Minus += delegation.Shares
          proposal.updateTally(vote, delegation.Shares)

        _, isVal = stakingKeeper.getValidator(voterAddress)
        if (isVal)
          tmpValMap(voterAddress).Vote = vote

      tallyingParam = load(GlobalParams, 'TallyingParam')

      // Update tally if validator voted
      for each validator in validators
        if tmpValMap(validator).HasVoted
          proposal.updateTally(tmpValMap(validator).Vote, (validator.TotalShares - tmpValMap(validator).Minus))



      // Check if proposal is accepted or rejected
      totalNonAbstain := proposal.YesVotes + proposal.NoVotes + proposal.NoWithVetoVotes
      if (proposal.Votes.YesVotes/totalNonAbstain > tallyingParam.Threshold AND proposal.Votes.NoWithVetoVotes/totalNonAbstain  < tallyingParam.Veto)
        //  proposal was accepted at the end of the voting period
        //  refund deposits (non-voters already punished)
        for each (amount, depositor) in proposal.Deposits
          depositor.AtomBalance += amount

        stateWriter, err := proposal.Handler()
        if err != nil
            // proposal passed but failed during state execution
            proposal.CurrentStatus = ProposalStatusFailed
         else
            // proposal pass and state is persisted
            proposal.CurrentStatus = ProposalStatusAccepted
            stateWriter.save()
      else
        // proposal was rejected
        proposal.CurrentStatus = ProposalStatusRejected

      store(Governance, <proposalID|'proposal'>, proposal)
```

### 传统提案

传统提案是治理提案的旧实现。与可以包含任何消息的提案相反，传统提案允许提交一组预定义的提案。这些提案由它们的类型来定义。

虽然提案应该使用治理提案的新实现，但我们仍然需要使用传统提案来提交 `software-upgrade` 和 `cancel-software-upgrade` 提案。

有关如何在 [客户端部分](#client) 提交提案的更多信息。

## 消息

### 提案提交

任何账户都可以通过 `MsgSubmitProposal` 交易提交提案。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/tx.proto#L42-L69
```

在 `MsgSubmitProposal` 消息的 `messages` 字段中传递的所有 `sdk.Msgs` 必须在应用程序的 `MsgServiceRouter` 中注册。这些消息中的每一个都必须有一个签名者，即治理模块账户。最后，元数据长度不能超过传递给治理保管人的 `maxMetadataLen` 配置。

**状态修改:**

* 生成新的 `proposalID`
* 创建新的 `Proposal`
* 初始化 `Proposal` 的属性
* 减少发送者的余额 `InitialDeposit`
* 如果达到 `MinDeposit`:
    * 将 `proposalID` 推入 `ProposalProcessingQueue`
* 将 `InitialDeposit` 从 `Proposer` 转移到治理 `ModuleAccount`

一个 `MsgSubmitProposal` 交易可以按照以下伪代码进行处理。

```go
// PSEUDOCODE //
// Check if MsgSubmitProposal is valid. If it is, create proposal //

upon receiving txGovSubmitProposal from sender do

  if !correctlyFormatted(txGovSubmitProposal)
    // check if proposal is correctly formatted and the messages have routes to other modules. Includes fee payment.
    // check if all messages' unique Signer is the gov acct.
    // check if the metadata is not too long.
    throw

  initialDeposit = txGovSubmitProposal.InitialDeposit
  if (initialDeposit.Atoms <= 0) OR (sender.AtomBalance < initialDeposit.Atoms)
    // InitialDeposit is negative or null OR sender has insufficient funds
    throw

  if (txGovSubmitProposal.Type != ProposalTypePlainText) OR (txGovSubmitProposal.Type != ProposalTypeSoftwareUpgrade)

  sender.AtomBalance -= initialDeposit.Atoms

  depositParam = load(GlobalParams, 'DepositParam')

  proposalID = generate new proposalID
  proposal = NewProposal()

  proposal.Messages = txGovSubmitProposal.Messages
  proposal.Metadata = txGovSubmitProposal.Metadata
  proposal.TotalDeposit = initialDeposit
  proposal.SubmitTime = <CurrentTime>
  proposal.DepositEndTime = <CurrentTime>.Add(depositParam.MaxDepositPeriod)
  proposal.Deposits.append({initialDeposit, sender})
  proposal.Submitter = sender
  proposal.YesVotes = 0
  proposal.NoVotes = 0
  proposal.NoWithVetoVotes = 0
  proposal.AbstainVotes = 0
  proposal.CurrentStatus = ProposalStatusOpen

  store(Proposals, <proposalID|'proposal'>, proposal) // Store proposal in Proposals mapping
  return proposalID
```

### 存款

一旦提交了提案，如果 `Proposal.TotalDeposit < ActiveParam.MinDeposit`，Atom 持有者可以发送 `MsgDeposit` 交易来增加提案的存款。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/tx.proto#L134-L147
```

**状态修改:**

* 减少发送者的余额 `deposit`
* 在 `proposal.Deposits` 中添加发送者的 `deposit`
* 增加发送者的 `deposit` 到 `proposal.TotalDeposit`
* 如果达到了 `MinDeposit`：
    * 将 `proposalID` 推入 `ProposalProcessingQueueEnd`
* 将存款从 `proposer` 转移到治理 `ModuleAccount`

`MsgDeposit` 交易必须通过一系列检查才能有效。这些检查在以下伪代码中概述。

```go
// PSEUDOCODE //
// Check if MsgDeposit is valid. If it is, increase deposit and check if MinDeposit is reached

upon receiving txGovDeposit from sender do
  // check if proposal is correctly formatted. Includes fee payment.

  if !correctlyFormatted(txGovDeposit)
    throw

  proposal = load(Proposals, <txGovDeposit.ProposalID|'proposal'>) // proposal is a const key, proposalID is variable

  if (proposal == nil)
    // There is no proposal for this proposalID
    throw

  if (txGovDeposit.Deposit.Atoms <= 0) OR (sender.AtomBalance < txGovDeposit.Deposit.Atoms) OR (proposal.CurrentStatus != ProposalStatusOpen)

    // deposit is negative or null
    // OR sender has insufficient funds
    // OR proposal is not open for deposit anymore

    throw

  depositParam = load(GlobalParams, 'DepositParam')

  if (CurrentBlock >= proposal.SubmitBlock + depositParam.MaxDepositPeriod)
    proposal.CurrentStatus = ProposalStatusClosed

  else
    // sender can deposit
    sender.AtomBalance -= txGovDeposit.Deposit.Atoms

    proposal.Deposits.append({txGovVote.Deposit, sender})
    proposal.TotalDeposit.Plus(txGovDeposit.Deposit)

    if (proposal.TotalDeposit >= depositParam.MinDeposit)
      // MinDeposit is reached, vote opens

      proposal.VotingStartBlock = CurrentBlock
      proposal.CurrentStatus = ProposalStatusActive
      ProposalProcessingQueue.push(txGovDeposit.ProposalID)

  store(Proposals, <txGovVote.ProposalID|'proposal'>, proposal)
```

### 投票

一旦达到 `ActiveParam.MinDeposit`，投票期开始。此时，持有质押的 Atom 持有者可以发送 `MsgVote` 交易来对提案进行投票。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/tx.proto#L92-L108
```

**状态修改:**

* 记录发送者的 `Vote`

:::note
此消息的燃气成本必须考虑到在 EndBlocker 中对投票进行计算。
:::

接下来是处理 `MsgVote` 交易的伪代码概述：

```go
  // PSEUDOCODE //
  // Check if MsgVote is valid. If it is, count vote//

  upon receiving txGovVote from sender do
    // check if proposal is correctly formatted. Includes fee payment.

    if !correctlyFormatted(txGovDeposit)
      throw

    proposal = load(Proposals, <txGovDeposit.ProposalID|'proposal'>)

    if (proposal == nil)
      // There is no proposal for this proposalID
      throw


    if  (proposal.CurrentStatus == ProposalStatusActive)


        // Sender can vote if
        // Proposal is active
        // Sender has some bonds

        store(Governance, <txGovVote.ProposalID|'addresses'|sender>, txGovVote.Vote)   // Voters can vote multiple times. Re-voting overrides previous vote. This is ok because tallying is done once at the end.
```

## 事件

治理模块会发出以下事件：

### EndBlocker

| 类型              | 属性键         | 属性值           |
| ----------------- | --------------- | ---------------- |
| inactive_proposal | proposal_id     | {proposalID}     |
| inactive_proposal | proposal_result | {proposalResult} |
| active_proposal   | proposal_id     | {proposalID}     |
| active_proposal   | proposal_result | {proposalResult} |

### 处理器

#### MsgSubmitProposal

| 类型                | 属性键             | 属性值         |
| ------------------- | ------------------- | --------------- |
| submit_proposal     | proposal_id         | {proposalID}    |
| submit_proposal [0] | voting_period_start | {proposalID}    |
| proposal_deposit    | amount              | {depositAmount} |
| proposal_deposit    | proposal_id         | {proposalID}    |
| message             | module              | governance      |
| message             | action              | submit_proposal |
| message             | sender              | {senderAddress} |

* [0] 仅在投票期开始时提交时才会触发的事件。

#### MsgVote

| 类型          | 属性键         | 属性值         |
| ------------- | ------------- | --------------- |
| proposal_vote | option        | {voteOption}    |
| proposal_vote | proposal_id   | {proposalID}    |
| message       | module        | governance      |
| message       | action        | vote            |
| message       | sender        | {senderAddress} |

#### MsgVoteWeighted

| 类型          | 属性键         | 属性值               |
| ------------- | ------------- | --------------------- |
| proposal_vote | option        | {weightedVoteOptions} |
| proposal_vote | proposal_id   | {proposalID}          |
| message       | module        | governance            |
| message       | action        | vote                  |
| message       | sender        | {senderAddress}       |

#### MsgDeposit

| 类型                 | 属性键             | 属性值         |
| -------------------- | ----------------- | --------------- |
| proposal_deposit     | amount            | {depositAmount} |
| proposal_deposit     | proposal_id       | {proposalID}    |
| proposal_deposit [0] | voting_period_start | {proposalID}    |
| message              | module            | governance      |
| message              | action            | deposit         |
| message              | sender            | {senderAddress} |

* [0] 仅在投票期开始时提交时才会触发的事件。

## 参数

治理模块包含以下参数：

| 键                           | 类型             | 示例                                 |
| ----------------------------- | ---------------- | --------------------------------------- |
| min_deposit                   | 数组 (coins)    | [{"denom":"uatom","amount":"10000000"}] |
| max_deposit_period            | 字符串 (时间 ns) | "172800000000000" (17280s)              |
| voting_period                 | 字符串 (时间 ns) | "172800000000000" (17280s)              |
| quorum                        | 字符串 (十进制)     | "0.334000000000000000"                  |
| threshold                     | 字符串 (十进制)     | "0.500000000000000000"                  |
| veto                          | 字符串 (十进制)     | "0.334000000000000000"                  |
| expedited_threshold           | 字符串 (时间 ns) | "0.667000000000000000"                  |
| expedited_voting_period       | 字符串 (时间 ns) | "86400000000000" (8600s)                |
| expedited_min_deposit         | 数组 (coins)    | [{"denom":"uatom","amount":"50000000"}] |
| burn_proposal_deposit_prevote | 布尔值             | false                                   |
| burn_vote_quorum              | 布尔值             | false                                   |
| burn_vote_veto                | 布尔值             | true                                    |

**注意**：治理模块包含的参数是对象，与其他模块不同。如果只想更改参数的子集，只需包含它们，而不是整个参数对象结构。

## 客户端

### 命令行界面（CLI）

用户可以使用命令行界面（CLI）查询和与 `gov` 模块进行交互。

#### 查询

`query` 命令允许用户查询 `gov` 状态。

```bash
simd query gov --help
```

##### 存款

`deposit` 命令允许用户查询给定提案的给定存款人的存款。

```bash
simd query gov deposit [proposal-id] [depositer-addr] [flags]
```

示例：

```bash
simd query gov deposit 1 cosmos1..
```

示例输出：

```bash
amount:
- amount: "100"
  denom: stake
depositor: cosmos1..
proposal_id: "1"
```

##### 存款列表

`deposits` 命令允许用户查询给定提案的所有存款。

```bash
simd query gov deposits [proposal-id] [flags]
```

示例：

```bash
simd query gov deposits 1
```

示例输出：

```bash
deposits:
- amount:
  - amount: "100"
    denom: stake
  depositor: cosmos1..
  proposal_id: "1"
pagination:
  next_key: null
  total: "0"
```

##### 参数

`param` 命令允许用户查询 `gov` 模块的给定参数。

```bash
simd query gov param [param-type] [flags]
```

示例：

```bash
simd query gov param voting
```

示例输出：

```bash
voting_period: "172800000000000"
```

##### 参数列表

`params` 命令允许用户查询 `gov` 模块的所有参数。

```bash
simd query gov params [flags]
```

示例：

```bash
simd query gov params
```

示例输出：

```bash
deposit_params:
  max_deposit_period: 172800s
  min_deposit:
  - amount: "10000000"
    denom: stake
params:
  expedited_min_deposit:
  - amount: "50000000"
    denom: stake
  expedited_threshold: "0.670000000000000000"
  expedited_voting_period: 86400s
  max_deposit_period: 172800s
  min_deposit:
  - amount: "10000000"
    denom: stake
  min_initial_deposit_ratio: "0.000000000000000000"
  proposal_cancel_burn_rate: "0.500000000000000000"
  quorum: "0.334000000000000000"
  threshold: "0.500000000000000000"
  veto_threshold: "0.334000000000000000"
  voting_period: 172800s
tally_params:
  quorum: "0.334000000000000000"
  threshold: "0.500000000000000000"
  veto_threshold: "0.334000000000000000"
voting_params:
  voting_period: 172800s
```

##### 提案

`proposal` 命令允许用户查询给定提案。

```bash
simd query gov proposal [proposal-id] [flags]
```

示例：

```bash
simd query gov proposal 1
```

示例输出：

```bash
deposit_end_time: "2022-03-30T11:50:20.819676256Z"
final_tally_result:
  abstain_count: "0"
  no_count: "0"
  no_with_veto_count: "0"
  yes_count: "0"
id: "1"
messages:
- '@type': /cosmos.bank.v1beta1.MsgSend
  amount:
  - amount: "10"
    denom: stake
  from_address: cosmos1..
  to_address: cosmos1..
metadata: AQ==
status: PROPOSAL_STATUS_DEPOSIT_PERIOD
submit_time: "2022-03-28T11:50:20.819676256Z"
total_deposit:
- amount: "10"
  denom: stake
voting_end_time: null
voting_start_time: null
```

##### 提案列表

`proposals` 命令允许用户查询所有提案，并可选择使用过滤器。

```bash
simd query gov proposals [flags]
```

示例：

```bash
simd query gov proposals
```

示例输出：

```bash
pagination:
  next_key: null
  total: "0"
proposals:
- deposit_end_time: "2022-03-30T11:50:20.819676256Z"
  final_tally_result:
    abstain_count: "0"
    no_count: "0"
    no_with_veto_count: "0"
    yes_count: "0"
  id: "1"
  messages:
  - '@type': /cosmos.bank.v1beta1.MsgSend
    amount:
    - amount: "10"
      denom: stake
    from_address: cosmos1..
    to_address: cosmos1..
  metadata: AQ==
  status: PROPOSAL_STATUS_DEPOSIT_PERIOD
  submit_time: "2022-03-28T11:50:20.819676256Z"
  total_deposit:
  - amount: "10"
    denom: stake
  voting_end_time: null
  voting_start_time: null
- deposit_end_time: "2022-03-30T14:02:41.165025015Z"
  final_tally_result:
    abstain_count: "0"
    no_count: "0"
    no_with_veto_count: "0"
    yes_count: "0"
  id: "2"
  messages:
  - '@type': /cosmos.bank.v1beta1.MsgSend
    amount:
    - amount: "10"
      denom: stake
    from_address: cosmos1..
    to_address: cosmos1..
  metadata: AQ==
  status: PROPOSAL_STATUS_DEPOSIT_PERIOD
  submit_time: "2022-03-28T14:02:41.165025015Z"
  total_deposit:
  - amount: "10"
    denom: stake
  voting_end_time: null
  voting_start_time: null
```

##### 提案人

`proposer` 命令允许用户查询给定提案的提案人。

```bash
simd query gov proposer [proposal-id] [flags]
```

##### 计票

`计票` 命令允许用户查询给定提案投票的计票结果。

```bash
simd query gov tally [proposal-id] [flags]
```

示例：

```bash
simd query gov tally 1
```

示例输出：

```bash
abstain: "0"
"no": "0"
no_with_veto: "0"
"yes": "1"
```

##### 投票

`投票` 命令允许用户查询给定提案的投票情况。

```bash
simd query gov vote [proposal-id] [voter-addr] [flags]
```

示例：

```bash
simd query gov vote 1 cosmos1..
```

示例输出：

```bash
option: VOTE_OPTION_YES
options:
- option: VOTE_OPTION_YES
  weight: "1.000000000000000000"
proposal_id: "1"
voter: cosmos1..
```

##### 投票列表

`投票列表` 命令允许用户查询给定提案的所有投票。

```bash
simd query gov votes [proposal-id] [flags]
```

示例：

```bash
simd query gov votes 1
```

示例输出：

```bash
pagination:
  next_key: null
  total: "0"
votes:
- option: VOTE_OPTION_YES
  options:
  - option: VOTE_OPTION_YES
    weight: "1.000000000000000000"
  proposal_id: "1"
  voter: cosmos1..
```

#### 交易

`tx` 命令允许用户与 `gov` 模块进行交互。

```bash
simd tx gov --help
```

##### 存款

`存款` 命令允许用户为给定提案存入代币。

```bash
simd tx gov deposit [proposal-id] [deposit] [flags]
```

示例：

```bash
simd tx gov deposit 1 10000000stake --from cosmos1..
```

##### 起草提案

`起草提案` 命令允许用户起草任何类型的提案。
该命令返回一个 `draft_proposal.json` 文件，完成后将由 `submit-proposal` 使用。
`draft_metadata.json` 应上传到 [IPFS](#metadata)。

```bash
simd tx gov draft-proposal
```

##### 提交提案

`提交提案` 命令允许用户提交一个带有一些消息和元数据的治理提案。
消息、元数据和存款在一个 JSON 文件中定义。

```bash
simd tx gov submit-proposal [path-to-proposal-json] [flags]
```

示例：

```bash
simd tx gov submit-proposal /path/to/proposal.json --from cosmos1..
```

其中 `proposal.json` 包含：

```json
{
  "messages": [
    {
      "@type": "/cosmos.bank.v1beta1.MsgSend",
      "from_address": "cosmos1...", // The gov module module address
      "to_address": "cosmos1...",
      "amount":[{"denom": "stake","amount": "10"}]
    }
  ],
  "metadata": "AQ==",
  "deposit": "10stake",
  "title": "Proposal Title",
  "summary": "Proposal Summary"
}
```

:::note
默认情况下，元数据、摘要和标题都限制在255个字符以内，应用开发者可以覆盖此限制。
:::

##### submit-legacy-proposal

`submit-legacy-proposal`命令允许用户提交一个带有初始存款的治理旧版提案。

```bash
simd tx gov submit-legacy-proposal [command] [flags]
```

示例：

```bash
simd tx gov submit-legacy-proposal --title="测试提案" --description="测试" --type="文本" --deposit="100000000stake" --from cosmos1..
```

示例（`param-change`）：

```bash
simd tx gov submit-legacy-proposal param-change proposal.json --from cosmos1..
```

```json
{
  "title": "Test Proposal",
  "description": "testing, testing, 1, 2, 3",
  "changes": [
    {
      "subspace": "staking",
      "key": "MaxValidators",
      "value": 100
    }
  ],
  "deposit": "10000000stake"
}
```

#### cancel-proposal

一旦提案被取消，提案的存款 `deposits * proposal_cancel_ratio` 将被销毁或发送到 `ProposalCancelDest` 地址，如果 `ProposalCancelDest` 为空，则存款将被销毁。剩余的存款将被发送给存款人。

```bash
simd tx gov cancel-proposal [proposal-id] [flags]
```

示例：

```bash
simd tx gov cancel-proposal 1 --from cosmos1...
```

##### vote

`vote`命令允许用户为给定的治理提案提交投票。

```bash
simd tx gov vote [command] [flags]
```

示例：

```bash
simd tx gov vote 1 yes --from cosmos1..
```

##### weighted-vote

`weighted-vote`命令允许用户为给定的治理提案提交加权投票。

```bash
simd tx gov weighted-vote [proposal-id] [weighted-options] [flags]
```

示例：

```bash
simd tx gov weighted-vote 1 yes=0.5,no=0.5 --from cosmos1..
```

### gRPC

用户可以使用 gRPC 端点查询 `gov` 模块。

#### Proposal

`Proposal` 端点允许用户查询给定的提案。

使用旧版 v1beta1：

```bash
cosmos.gov.v1beta1.Query/Proposal
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Proposal
```

示例输出：

```bash
{
  "proposal": {
    "proposalId": "1",
    "content": {"@type":"/cosmos.gov.v1beta1.TextProposal","description":"testing, testing, 1, 2, 3","title":"Test Proposal"},
    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
    "finalTallyResult": {
      "yes": "0",
      "abstain": "0",
      "no": "0",
      "noWithVeto": "0"
    },
    "submitTime": "2021-09-16T19:40:08.712440474Z",
    "depositEndTime": "2021-09-18T19:40:08.712440474Z",
    "totalDeposit": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ],
    "votingStartTime": "2021-09-16T19:40:08.712440474Z",
    "votingEndTime": "2021-09-18T19:40:08.712440474Z",
    "title": "Test Proposal",
    "summary": "testing, testing, 1, 2, 3"
  }
}
```

使用 v1：

```bash
cosmos.gov.v1.Query/Proposal
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Proposal
```

示例输出：

```bash
{
  "proposal": {
    "id": "1",
    "messages": [
      {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"10"}],"fromAddress":"cosmos1..","toAddress":"cosmos1.."}
    ],
    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
    "finalTallyResult": {
      "yesCount": "0",
      "abstainCount": "0",
      "noCount": "0",
      "noWithVetoCount": "0"
    },
    "submitTime": "2022-03-28T11:50:20.819676256Z",
    "depositEndTime": "2022-03-30T11:50:20.819676256Z",
    "totalDeposit": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ],
    "votingStartTime": "2022-03-28T14:25:26.644857113Z",
    "votingEndTime": "2022-03-30T14:25:26.644857113Z",
    "metadata": "AQ==",
    "title": "Test Proposal",
    "summary": "testing, testing, 1, 2, 3"
  }
}
```

#### Proposals

`Proposals` 端点允许用户查询所有带有可选过滤器的提案。

使用旧版 v1beta1：

```bash
cosmos.gov.v1beta1.Query/Proposals
```

#### 投票

`Vote` 端点允许用户查询给定提案的投票。

使用旧版 v1beta1：

```bash
cosmos.gov.v1beta1.Query/Vote
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1","voter":"cosmos1.."}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Vote
```

示例输出：

```bash
{
  "vote": {
    "proposalId": "1",
    "voter": "cosmos1..",
    "option": "VOTE_OPTION_YES",
    "options": [
      {
        "option": "VOTE_OPTION_YES",
        "weight": "1000000000000000000"
      }
    ]
  }
}
```

使用 v1：

```bash
cosmos.gov.v1.Query/Vote
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1","voter":"cosmos1.."}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Vote
```

示例输出：

```bash
{
  "vote": {
    "proposalId": "1",
    "voter": "cosmos1..",
    "option": "VOTE_OPTION_YES",
    "options": [
      {
        "option": "VOTE_OPTION_YES",
        "weight": "1.000000000000000000"
      }
    ]
  }
}
```

#### 投票

`Votes` 端点允许用户查询给定提案的所有投票。

使用旧版 v1beta1：

```bash
cosmos.gov.v1beta1.Query/Votes
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Votes
```

示例输出：

```bash
{
  "votes": [
    {
      "proposalId": "1",
      "voter": "cosmos1..",
      "options": [
        {
          "option": "VOTE_OPTION_YES",
          "weight": "1000000000000000000"
        }
      ]
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

使用 v1：

```bash
cosmos.gov.v1.Query/Votes
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Votes
```

示例输出：

```bash
{
  "votes": [
    {
      "proposalId": "1",
      "voter": "cosmos1..",
      "options": [
        {
          "option": "VOTE_OPTION_YES",
          "weight": "1.000000000000000000"
        }
      ]
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### 参数

`Params` 端点允许用户查询 `gov` 模块的所有参数。

<!-- TODO: #10197 查询治理参数输出空值 -->

使用旧版 v1beta1：

```bash
cosmos.gov.v1beta1.Query/Params
```

示例：

```bash
grpcurl -plaintext \
    -d '{"params_type":"voting"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Params
```

示例输出：

```bash
{
  "votingParams": {
    "votingPeriod": "172800s"
  },
  "depositParams": {
    "maxDepositPeriod": "0s"
  },
  "tallyParams": {
    "quorum": "MA==",
    "threshold": "MA==",
    "vetoThreshold": "MA=="
  }
}
```

使用 v1：

```bash
cosmos.gov.v1.Query/Params
```

示例：

```bash
grpcurl -plaintext \
    -d '{"params_type":"voting"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Params
```

示例输出：

```bash
{
  "votingParams": {
    "votingPeriod": "172800s"
  }
}
```

#### 存款

`Deposit` 端点允许用户查询给定提案的给定存款人的存款。

使用旧版 v1beta1：

```bash
cosmos.gov.v1beta1.Query/Deposit
```

示例：

```bash
grpcurl -plaintext \
    '{"proposal_id":"1","depositor":"cosmos1.."}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Deposit
```

示例输出：

```bash
{
  "deposit": {
    "proposalId": "1",
    "depositor": "cosmos1..",
    "amount": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ]
  }
}
```

使用 v1：

```bash
cosmos.gov.v1.Query/Deposit
```

示例：

```bash
grpcurl -plaintext \
    '{"proposal_id":"1","depositor":"cosmos1.."}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Deposit
```

示例输出：

```bash
{
  "deposit": {
    "proposalId": "1",
    "depositor": "cosmos1..",
    "amount": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ]
  }
}
```

#### 存款

`Deposits` 端点允许用户查询给定提案的所有存款。

使用旧版 v1beta1：

```bash
cosmos.gov.v1beta1.Query/Deposits
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Deposits
```

#### TallyResult

`TallyResult`端点允许用户查询给定提案的计票结果。

使用旧版v1beta1：

```bash
cosmos.gov.v1beta1.Query/TallyResult
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/TallyResult
```

示例输出：

```bash
{
  "tally": {
    "yes": "1000000",
    "abstain": "0",
    "no": "0",
    "noWithVeto": "0"
  }
}
```

使用v1：

```bash
cosmos.gov.v1.Query/TallyResult
```

示例：

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/TallyResult
```

#### REST

用户可以使用REST端点查询`gov`模块。

#### proposal

`proposals`端点允许用户查询给定提案。

使用旧版v1beta1：

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1
```

示例输出：

```bash
{
  "proposal": {
    "proposal_id": "1",
    "content": null,
    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
    "final_tally_result": {
      "yes": "0",
      "abstain": "0",
      "no": "0",
      "no_with_veto": "0"
    },
    "submit_time": "2022-03-28T11:50:20.819676256Z",
    "deposit_end_time": "2022-03-30T11:50:20.819676256Z",
    "total_deposit": [
      {
        "denom": "stake",
        "amount": "10000000010"
      }
    ],
    "voting_start_time": "2022-03-28T14:25:26.644857113Z",
    "voting_end_time": "2022-03-30T14:25:26.644857113Z"
  }
}
```

使用v1：

```bash
/cosmos/gov/v1/proposals/{proposal_id}
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1
```

示例输出：

```bash
{
  "proposal": {
    "id": "1",
    "messages": [
      {
        "@type": "/cosmos.bank.v1beta1.MsgSend",
        "from_address": "cosmos1..",
        "to_address": "cosmos1..",
        "amount": [
          {
            "denom": "stake",
            "amount": "10"
          }
        ]
      }
    ],
    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
    "final_tally_result": {
      "yes_count": "0",
      "abstain_count": "0",
      "no_count": "0",
      "no_with_veto_count": "0"
    },
    "submit_time": "2022-03-28T11:50:20.819676256Z",
    "deposit_end_time": "2022-03-30T11:50:20.819676256Z",
    "total_deposit": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ],
    "voting_start_time": "2022-03-28T14:25:26.644857113Z",
    "voting_end_time": "2022-03-30T14:25:26.644857113Z",
    "metadata": "AQ==",
    "title": "Proposal Title",
    "summary": "Proposal Summary"
  }
}
```

#### proposals

`proposals`端点还允许用户查询所有提案，并可选择性地使用过滤器。

使用旧版v1beta1：

```bash
/cosmos/gov/v1beta1/proposals
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals
```

示例输出：

```bash
{
  "proposals": [
    {
      "proposal_id": "1",
      "content": null,
      "status": "PROPOSAL_STATUS_VOTING_PERIOD",
      "final_tally_result": {
        "yes": "0",
        "abstain": "0",
        "no": "0",
        "no_with_veto": "0"
      },
      "submit_time": "2022-03-28T11:50:20.819676256Z",
      "deposit_end_time": "2022-03-30T11:50:20.819676256Z",
      "total_deposit": [
        {
          "denom": "stake",
          "amount": "10000000"
        }
      ],
      "voting_start_time": "2022-03-28T14:25:26.644857113Z",
      "voting_end_time": "2022-03-30T14:25:26.644857113Z"
    },
    {
      "proposal_id": "2",
      "content": null,
      "status": "PROPOSAL_STATUS_DEPOSIT_PERIOD",
      "final_tally_result": {
        "yes": "0",
        "abstain": "0",
        "no": "0",
        "no_with_veto": "0"
      },
      "submit_time": "2022-03-28T14:02:41.165025015Z",
      "deposit_end_time": "2022-03-30T14:02:41.165025015Z",
      "total_deposit": [
        {
          "denom": "stake",
          "amount": "10"
        }
      ],
      "voting_start_time": "0001-01-01T00:00:00Z",
      "voting_end_time": "0001-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

使用v1：

```bash
/cosmos/gov/v1/proposals
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1/proposals
```

示例输出：

```bash
{
  "proposals": [
    {
      "id": "1",
      "messages": [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          "from_address": "cosmos1..",
          "to_address": "cosmos1..",
          "amount": [
            {
              "denom": "stake",
              "amount": "10"
            }
          ]
        }
      ],
      "status": "PROPOSAL_STATUS_VOTING_PERIOD",
      "final_tally_result": {
        "yes_count": "0",
        "abstain_count": "0",
        "no_count": "0",
        "no_with_veto_count": "0"
      },
      "submit_time": "2022-03-28T11:50:20.819676256Z",
      "deposit_end_time": "2022-03-30T11:50:20.819676256Z",
      "total_deposit": [
        {
          "denom": "stake",
          "amount": "10000000010"
        }
      ],
      "voting_start_time": "2022-03-28T14:25:26.644857113Z",
      "voting_end_time": "2022-03-30T14:25:26.644857113Z",
      "metadata": "AQ==",
      "title": "Proposal Title",
      "summary": "Proposal Summary"
    },
    {
      "id": "2",
      "messages": [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          "from_address": "cosmos1..",
          "to_address": "cosmos1..",
          "amount": [
            {
              "denom": "stake",
              "amount": "10"
            }
          ]
        }
      ],
      "status": "PROPOSAL_STATUS_DEPOSIT_PERIOD",
      "final_tally_result": {
        "yes_count": "0",
        "abstain_count": "0",
        "no_count": "0",
        "no_with_veto_count": "0"
      },
      "submit_time": "2022-03-28T14:02:41.165025015Z",
      "deposit_end_time": "2022-03-30T14:02:41.165025015Z",
      "total_deposit": [
        {
          "denom": "stake",
          "amount": "10"
        }
      ],
      "voting_start_time": null,
      "voting_end_time": null,
      "metadata": "AQ==",
      "title": "Proposal Title",
      "summary": "Proposal Summary"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### voter vote

`votes`端点允许用户查询给定提案的投票。

使用旧版v1beta1：

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/votes/{voter}
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/votes/cosmos1..
```

示例输出：

```bash
{
  "vote": {
    "proposal_id": "1",
    "voter": "cosmos1..",
    "option": "VOTE_OPTION_YES",
    "options": [
      {
        "option": "VOTE_OPTION_YES",
        "weight": "1.000000000000000000"
      }
    ]
  }
}
```

使用v1：

```bash
/cosmos/gov/v1/proposals/{proposal_id}/votes/{voter}
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/votes/cosmos1..
```

#### 投票

`votes` 端点允许用户查询给定提案的所有投票。

使用旧版 v1beta1：

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/votes
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/votes
```

示例输出：

```bash
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "cosmos1..",
      "option": "VOTE_OPTION_YES",
      "options": [
        {
          "option": "VOTE_OPTION_YES",
          "weight": "1.000000000000000000"
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

使用 v1：

```bash
/cosmos/gov/v1/proposals/{proposal_id}/votes
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/votes
```

示例输出：

```bash
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "cosmos1..",
      "options": [
        {
          "option": "VOTE_OPTION_YES",
          "weight": "1.000000000000000000"
        }
      ],
      "metadata": ""
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### 参数

`params` 端点允许用户查询 `gov` 模块的所有参数。

<!-- TODO: #10197 查询治理参数输出空值 -->

使用旧版 v1beta1：

```bash
/cosmos/gov/v1beta1/params/{params_type}
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1beta1/params/voting
```

示例输出：

```bash
{
  "voting_params": {
    "voting_period": "172800s"
  },
  "deposit_params": {
    "min_deposit": [
    ],
    "max_deposit_period": "0s"
  },
  "tally_params": {
    "quorum": "0.000000000000000000",
    "threshold": "0.000000000000000000",
    "veto_threshold": "0.000000000000000000"
  }
}
```

使用 v1：

```bash
/cosmos/gov/v1/params/{params_type}
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1/params/voting
```

示例输出：

```bash
{
  "voting_params": {
    "voting_period": "172800s"
  },
  "deposit_params": {
    "min_deposit": [
    ],
    "max_deposit_period": "0s"
  },
  "tally_params": {
    "quorum": "0.000000000000000000",
    "threshold": "0.000000000000000000",
    "veto_threshold": "0.000000000000000000"
  }
}
```

#### 存款

`deposits` 端点允许用户查询给定提案的给定存款人的存款。

使用旧版 v1beta1：

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/deposits/{depositor}
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/deposits/cosmos1..
```

示例输出：

```bash
{
  "deposit": {
    "proposal_id": "1",
    "depositor": "cosmos1..",
    "amount": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ]
  }
}
```

使用 v1：

```bash
/cosmos/gov/v1/proposals/{proposal_id}/deposits/{depositor}
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/deposits/cosmos1..
```

示例输出：

```bash
{
  "deposit": {
    "proposal_id": "1",
    "depositor": "cosmos1..",
    "amount": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ]
  }
}
```

#### 提案存款

`deposits` 端点允许用户查询给定提案的所有存款。

使用旧版 v1beta1：

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/deposits
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/deposits
```

示例输出：

```bash
{
  "deposits": [
    {
      "proposal_id": "1",
      "depositor": "cosmos1..",
      "amount": [
        {
          "denom": "stake",
          "amount": "10000000"
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

使用 v1：

```bash
/cosmos/gov/v1/proposals/{proposal_id}/deposits
```

#### 投票结果

`tally` 端点允许用户查询给定提案的投票结果。

使用旧版 v1beta1：

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/tally
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/tally
```

示例输出：

```bash
{
  "tally": {
    "yes": "1000000",
    "abstain": "0",
    "no": "0",
    "no_with_veto": "0"
  }
}
```

使用 v1：

```bash
/cosmos/gov/v1/proposals/{proposal_id}/tally
```

示例：

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/tally
```

示例输出：

```bash
{
  "tally": {
    "yes": "1000000",
    "abstain": "0",
    "no": "0",
    "no_with_veto": "0"
  }
}
```

## 元数据

gov 模块有两个位置用于元数据，用户可以在其中提供关于他们正在进行的链上操作的进一步上下文。默认情况下，所有元数据字段都有一个 255 字符长度的字段，元数据可以以 json 格式存储，根据所需的数据量，可以存储在链上或链下。在这里，我们提供了一个关于 json 结构和数据存储位置的建议。在这些建议中有两个重要因素。首先，gov 和 group 模块之间的一致性，注意所有组织提出的提案数量可能非常大。其次，客户端应用程序（如区块浏览器和治理界面）对元数据结构的一致性有信心。

### 提案

位置：链下，作为存储在 IPFS 上的 json 对象（镜像 [group proposal](../group/README.md#metadata)）

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
`authors` 字段是一个字符串数组，这是为了允许在元数据中列出多个作者。在 v0.46 中，`authors` 字段是一个逗号分隔的字符串。前端应支持两种格式以实现向后兼容。
:::

### 投票

位置：链上，作为 255 字符限制内的 json（镜像 [group vote](../group/README.md#metadata)）

```json
{
  "justification": "",
}
```

## 未来改进

当前文档仅描述了治理模块的最小可行产品。未来的改进可能包括：

* **`BountyProposals`:** 如果被接受，`BountyProposal` 将创建一个开放的赏金。`BountyProposal` 指定了完成后将提供多少个 Atoms。这些 Atoms 将从 `reserve pool` 中获取。在 `BountyProposal` 被治理接受后，任何人都可以提交一个带有代码的 `SoftwareUpgradeProposal` 来领取赏金。请注意，一旦 `BountyProposal` 被接受，`reserve pool` 中对应的资金将被锁定，以确保付款始终能够兑现。为了将 `SoftwareUpgradeProposal` 与开放的赏金关联起来，`SoftwareUpgradeProposal` 的提交者将使用 `Proposal.LinkedProposal` 属性。如果与开放的赏金关联的 `SoftwareUpgradeProposal` 被治理接受，预留的资金将自动转移到提交者账户。

* **复杂委托：** 委托人可以选择除其验证者以外的其他代表。最终，代表链总是会以一个验证者结束，但委托人可以在继承其验证者的投票之前继承其选择的代表的投票。换句话说，只有在其其他指定的代表未投票时，他们才会继承其验证者的投票权。

* **更好的提案审查流程：** `proposal.Deposit` 将分为两部分，一部分用于防止垃圾提案（与 MVP 中相同），另一部分用于奖励第三方审计人员。




# `x/gov`

## Abstract

This paper specifies the Governance module of the Cosmos SDK, which was first
described in the [Cosmos Whitepaper](https://cosmos.network/about/whitepaper) in
June 2016.

The module enables Cosmos SDK based blockchain to support an on-chain governance
system. In this system, holders of the native staking token of the chain can vote
on proposals on a 1 token 1 vote basis. Next is a list of features the module
currently supports:

* **Proposal submission:** Users can submit proposals with a deposit. Once the
minimum deposit is reached, the proposal enters voting period.
* **Vote:** Participants can vote on proposals that reached MinDeposit
* **Inheritance and penalties:** Delegators inherit their validator's vote if
they don't vote themselves.
* **Claiming deposit:** Users that deposited on proposals can recover their
deposits if the proposal was accepted or rejected. If the proposal was vetoed, or never entered voting period, the deposit is burned.

This module will be used in the Cosmos Hub, the first Hub in the Cosmos network.
Features that may be added in the future are described in [Future Improvements](#future-improvements).

## Contents

The following specification uses *ATOM* as the native staking token. The module
can be adapted to any Proof-Of-Stake blockchain by replacing *ATOM* with the native
staking token of the chain.

* [Concepts](#concepts)
    * [Proposal submission](#proposal-submission)
    * [Deposit](#deposit)
    * [Vote](#vote)
* [State](#state)
    * [Proposals](#proposals)
    * [Parameters and base types](#parameters-and-base-types)
    * [Deposit](#deposit-1)
    * [ValidatorGovInfo](#validatorgovinfo)
    * [Stores](#stores)
    * [Proposal Processing Queue](#proposal-processing-queue)
    * [Legacy Proposal](#legacy-proposal)
* [Messages](#messages)
    * [Proposal Submission](#proposal-submission-1)
    * [Deposit](#deposit-2)
    * [Vote](#vote-1)
* [Events](#events)
    * [EndBlocker](#endblocker)
    * [Handlers](#handlers)
* [Parameters](#parameters)
* [Client](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)
* [Metadata](#metadata)
    * [Proposal](#proposal-3)
    * [Vote](#vote-5)
* [Future Improvements](#future-improvements)

## Concepts

*Disclaimer: This is work in progress. Mechanisms are susceptible to change.*

The governance process is divided in a few steps that are outlined below:

* **Proposal submission:** Proposal is submitted to the blockchain with a
  deposit.
* **Vote:** Once deposit reaches a certain value (`MinDeposit`), proposal is
  confirmed and vote opens. Bonded Atom holders can then send `TxGovVote`
  transactions to vote on the proposal.
* **Execution** After a period of time, the votes are tallied and depending
  on the result, the messages in the proposal will be executed.

### Proposal submission

#### Right to submit a proposal

Every account can submit proposals by sending a `MsgSubmitProposal` transaction.
Once a proposal is submitted, it is identified by its unique `proposalID`.

#### Proposal Messages

A proposal includes an array of `sdk.Msg`s which are executed automatically if the
proposal passes. The messages are executed by the governance `ModuleAccount` itself. Modules
such as `x/upgrade`, that want to allow certain messages to be executed by governance
only should add a whitelist within the respective msg server, granting the governance
module the right to execute the message once a quorum has been reached. The governance
module uses the `MsgServiceRouter` to check that these messages are correctly constructed
and have a respective path to execute on but do not perform a full validity check.

### Deposit

To prevent spam, proposals must be submitted with a deposit in the coins defined by
the `MinDeposit` param.

When a proposal is submitted, it has to be accompanied with a deposit that must be
strictly positive, but can be inferior to `MinDeposit`. The submitter doesn't need
to pay for the entire deposit on their own. The newly created proposal is stored in
an *inactive proposal queue* and stays there until its deposit passes the `MinDeposit`.
Other token holders can increase the proposal's deposit by sending a `Deposit`
transaction. If a proposal doesn't pass the `MinDeposit` before the deposit end time
(the time when deposits are no longer accepted), the proposal will be destroyed: the
proposal will be removed from state and the deposit will be burned (see x/gov `EndBlocker`).
When a proposal deposit passes the `MinDeposit` threshold (even during the proposal
submission) before the deposit end time, the proposal will be moved into the
*active proposal queue* and the voting period will begin.

The deposit is kept in escrow and held by the governance `ModuleAccount` until the
proposal is finalized (passed or rejected).

#### Deposit refund and burn

When a proposal is finalized, the coins from the deposit are either refunded or burned
according to the final tally of the proposal:

* If the proposal is approved or rejected but *not* vetoed, each deposit will be
  automatically refunded to its respective depositor (transferred from the governance
  `ModuleAccount`).
* When the proposal is vetoed with greater than 1/3, deposits will be burned from the
  governance `ModuleAccount` and the proposal information along with its deposit
  information will be removed from state.
* All refunded or burned deposits are removed from the state. Events are issued when
  burning or refunding a deposit.

### Vote

#### Participants

*Participants* are users that have the right to vote on proposals. On the
Cosmos Hub, participants are bonded Atom holders. Unbonded Atom holders and
other users do not get the right to participate in governance. However, they
can submit and deposit on proposals.

Note that when *participants* have bonded and unbonded Atoms, their voting power is calculated from their bonded Atom holdings only.

#### Voting period

Once a proposal reaches `MinDeposit`, it immediately enters `Voting period`. We
define `Voting period` as the interval between the moment the vote opens and
the moment the vote closes. `Voting period` should always be shorter than
`Unbonding period` to prevent double voting. The initial value of
`Voting period` is 2 weeks.

#### Option set

The option set of a proposal refers to the set of choices a participant can
choose from when casting its vote.

The initial option set includes the following options:

* `Yes`
* `No`
* `NoWithVeto`
* `Abstain`

`NoWithVeto` counts as `No` but also adds a `Veto` vote. `Abstain` option
allows voters to signal that they do not intend to vote in favor or against the
proposal but accept the result of the vote.

*Note: from the UI, for urgent proposals we should maybe add a ‘Not Urgent’ option that casts a `NoWithVeto` vote.*

#### Weighted Votes

[ADR-037](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-037-gov-split-vote.md) introduces the weighted vote feature which allows a staker to split their votes into several voting options. For example, it could use 70% of its voting power to vote Yes and 30% of its voting power to vote No.

Often times the entity owning that address might not be a single individual. For example, a company might have different stakeholders who want to vote differently, and so it makes sense to allow them to split their voting power. Currently, it is not possible for them to do "passthrough voting" and giving their users voting rights over their tokens. However, with this system, exchanges can poll their users for voting preferences, and then vote on-chain proportionally to the results of the poll.

To represent weighted vote on chain, we use the following Protobuf message.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1beta1/gov.proto#L34-L47
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1beta1/gov.proto#L181-L201
```

For a weighted vote to be valid, the `options` field must not contain duplicate vote options, and the sum of weights of all options must be equal to 1.

### Quorum

Quorum is defined as the minimum percentage of voting power that needs to be
cast on a proposal for the result to be valid.

### Expedited Proposals

A proposal can be expedited, making the proposal use shorter voting duration and a higher tally threshold by its default. If an expedited proposal fails to meet the threshold within the scope of shorter voting duration, the expedited proposal is then converted to a regular proposal and restarts voting under regular voting conditions.

#### Threshold

Threshold is defined as the minimum proportion of `Yes` votes (excluding
`Abstain` votes) for the proposal to be accepted.

Initially, the threshold is set at 50% of `Yes` votes, excluding `Abstain`
votes. A possibility to veto exists if more than 1/3rd of all votes are
`NoWithVeto` votes.  Note, both of these values are derived from the `TallyParams`
on-chain parameter, which is modifiable by governance.
This means that proposals are accepted iff:

* There exist bonded tokens.
* Quorum has been achieved.
* The proportion of `Abstain` votes is inferior to 1/1.
* The proportion of `NoWithVeto` votes is inferior to 1/3, including
  `Abstain` votes.
* The proportion of `Yes` votes, excluding `Abstain` votes, at the end of
  the voting period is superior to 1/2.

For expedited proposals, by default, the threshold is higher than with a *normal proposal*, namely, 66.7%.

#### Inheritance

If a delegator does not vote, it will inherit its validator vote.

* If the delegator votes before its validator, it will not inherit from the
  validator's vote.
* If the delegator votes after its validator, it will override its validator
  vote with its own. If the proposal is urgent, it is possible
  that the vote will close before delegators have a chance to react and
  override their validator's vote. This is not a problem, as proposals require more than 2/3rd of the total voting power to pass, when tallied at the end of the voting period. Because as little as 1/3 + 1 validation power could collude to censor transactions, non-collusion is already assumed for ranges exceeding this threshold.

#### Validator’s punishment for non-voting

At present, validators are not punished for failing to vote.

#### Governance address

Later, we may add permissioned keys that could only sign txs from certain modules. For the MVP, the `Governance address` will be the main validator address generated at account creation. This address corresponds to a different PrivKey than the CometBFT PrivKey which is responsible for signing consensus messages. Validators thus do not have to sign governance transactions with the sensitive CometBFT PrivKey.

#### Burnable Params

There are three parameters that define if the deposit of a proposal should be burned or returned to the depositors. 

* `BurnVoteVeto` burns the proposal deposit if the proposal gets vetoed. 
* `BurnVoteQuorum` burns the proposal deposit if the proposal deposit if the vote does not reach quorum.
* `BurnProposalDepositPrevote` burns the proposal deposit if it does not enter the voting phase. 

> Note: These parameters are modifiable via governance. 

## State

### Constitution

`Constitution` is found in the genesis state.  It is a string field intended to be used to descibe the purpose of a particular blockchain, and its expected norms.  A few examples of how the constitution field can be used:

* define the purpose of the chain, laying a foundation for its future development
* set expectations for delegators
* set expectations for validators
* define the chain's relationship to "meatspace" entities, like a foundation or corporation

Since this is more of a social feature than a technical feature, we'll now get into some items that may have been useful to have in a genesis constitution:

* What limitations on governance exist, if any?
    * is it okay for the community to slash the wallet of a whale that they no longer feel that they want around? (viz: Juno Proposal 4 and 16)
    * can governance "socially slash" a validator who is using unapproved MEV? (viz: commonwealth.im/osmosis)
    * In the event of an economic emergency, what should validators do?
        * Terra crash of May, 2022, saw validators choose to run a new binary with code that had not been approved by governance, because the governance token had been inflated to nothing.
* What is the purpose of the chain, specifically?
    * best example of this is the Cosmos hub, where different founding groups, have different interpertations of the purpose of the network.

This genesis entry, "constitution" hasn't been designed for existing chains, who should likely just ratify a constitution using their governance system.  Instead, this is for new chains.  It will allow for validators to have a much clearer idea of purpose and the expecations placed on them while operating thier nodes.  Likewise, for community members, the constitution will give them some idea of what to expect from both the "chain team" and the validators, respectively.

This constitution is designed to be immutable, and placed only in genesis, though that could change over time by a pull request to the cosmos-sdk that allows for the constitution to be changed by governance.  Communities whishing to make amendments to their original constitution should use the governance mechanism and a "signaling proposal" to do exactly that.

**Ideal use scenario for a cosmos chain constitution**

As a chain developer, you decide that you'd like to provide clarity to your key user groups:

* validators
* token holders
* developers (yourself)

You use the constitution to immutably store some Markdown in genesis, so that when difficult questions come up, the constutituon can provide guidance to the community.

### Proposals

`Proposal` objects are used to tally votes and generally track the proposal's state.
They contain an array of arbitrary `sdk.Msg`'s which the governance module will attempt
to resolve and then execute if the proposal passes. `Proposal`'s are identified by a
unique id and contains a series of timestamps: `submit_time`, `deposit_end_time`,
`voting_start_time`, `voting_end_time` which track the lifecycle of a proposal

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L51-L99
```

A proposal will generally require more than just a set of messages to explain its
purpose but need some greater justification and allow a means for interested participants
to discuss and debate the proposal.
In most cases, **it is encouraged to have an off-chain system that supports the on-chain governance process**.
To accommodate for this, a proposal contains a special **`metadata`** field, a string,
which can be used to add context to the proposal. The `metadata` field allows custom use for networks,
however, it is expected that the field contains a URL or some form of CID using a system such as
[IPFS](https://docs.ipfs.io/concepts/content-addressing/). To support the case of
interoperability across networks, the SDK recommends that the `metadata` represents
the following `JSON` template:

```json
{
  "title": "...",
  "description": "...",
  "forum": "...", // a link to the discussion platform (i.e. Discord)
  "other": "..." // any extra data that doesn't correspond to the other fields
}
```

This makes it far easier for clients to support multiple networks.

The metadata has a maximum length that is chosen by the app developer, and
passed into the gov keeper as a config. The default maximum length in the SDK is 255 characters.

#### Writing a module that uses governance

There are many aspects of a chain, or of the individual modules that you may want to
use governance to perform such as changing various parameters. This is very simple
to do. First, write out your message types and `MsgServer` implementation. Add an
`authority` field to the keeper which will be populated in the constructor with the
governance module account: `govKeeper.GetGovernanceAccount().GetAddress()`. Then for
the methods in the `msg_server.go`, perform a check on the message that the signer
matches `authority`. This will prevent any user from executing that message.

### Parameters and base types

`Parameters` define the rules according to which votes are run. There can only
be one active parameter set at any given time. If governance wants to change a
parameter set, either to modify a value or add/remove a parameter field, a new
parameter set has to be created and the previous one rendered inactive.

#### DepositParams

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L152-L162
```

#### VotingParams

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L164-L168
```

#### TallyParams

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L170-L182
```

Parameters are stored in a global `GlobalParams` KVStore.

Additionally, we introduce some basic types:

```go
type Vote byte

const (
    VoteYes         = 0x1
    VoteNo          = 0x2
    VoteNoWithVeto  = 0x3
    VoteAbstain     = 0x4
)

type ProposalType  string

const (
    ProposalTypePlainText       = "Text"
    ProposalTypeSoftwareUpgrade = "SoftwareUpgrade"
)

type ProposalStatus byte


const (
    StatusNil           ProposalStatus = 0x00
    StatusDepositPeriod ProposalStatus = 0x01  // Proposal is submitted. Participants can deposit on it but not vote
    StatusVotingPeriod  ProposalStatus = 0x02  // MinDeposit is reached, participants can vote
    StatusPassed        ProposalStatus = 0x03  // Proposal passed and successfully executed
    StatusRejected      ProposalStatus = 0x04  // Proposal has been rejected
    StatusFailed        ProposalStatus = 0x05  // Proposal passed but failed execution
)
```

### Deposit

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/gov.proto#L38-L49
```

### ValidatorGovInfo

This type is used in a temp map when tallying

```go
  type ValidatorGovInfo struct {
    Minus     sdk.Dec
    Vote      Vote
  }
```

## Stores

:::note
Stores are KVStores in the multi-store. The key to find the store is the first parameter in the list
:::

We will use one KVStore `Governance` to store four mappings:

* A mapping from `proposalID|'proposal'` to `Proposal`.
* A mapping from `proposalID|'addresses'|address` to `Vote`. This mapping allows
  us to query all addresses that voted on the proposal along with their vote by
  doing a range query on `proposalID:addresses`.
* A mapping from `ParamsKey|'Params'` to `Params`. This map allows to query all
  x/gov params.
* A mapping from `VotingPeriodProposalKeyPrefix|proposalID` to a single byte. This allows
  us to know if a proposal is in the voting period or not with very low gas cost.
  
For pseudocode purposes, here are the two function we will use to read or write in stores:

* `load(StoreKey, Key)`: Retrieve item stored at key `Key` in store found at key `StoreKey` in the multistore
* `store(StoreKey, Key, value)`: Write value `Value` at key `Key` in store found at key `StoreKey` in the multistore

### Proposal Processing Queue

**Store:**

* `ProposalProcessingQueue`: A queue `queue[proposalID]` containing all the
  `ProposalIDs` of proposals that reached `MinDeposit`. During each `EndBlock`,
  all the proposals that have reached the end of their voting period are processed.
  To process a finished proposal, the application tallies the votes, computes the
  votes of each validator and checks if every validator in the validator set has
  voted. If the proposal is accepted, deposits are refunded. Finally, the proposal
  content `Handler` is executed.

And the pseudocode for the `ProposalProcessingQueue`:

```go
  in EndBlock do

    for finishedProposalID in GetAllFinishedProposalIDs(block.Time)
      proposal = load(Governance, <proposalID|'proposal'>) // proposal is a const key

      validators = Keeper.getAllValidators()
      tmpValMap := map(sdk.AccAddress)ValidatorGovInfo

      // Initiate mapping at 0. This is the amount of shares of the validator's vote that will be overridden by their delegator's votes
      for each validator in validators
        tmpValMap(validator.OperatorAddr).Minus = 0

      // Tally
      voterIterator = rangeQuery(Governance, <proposalID|'addresses'>) //return all the addresses that voted on the proposal
      for each (voterAddress, vote) in voterIterator
        delegations = stakingKeeper.getDelegations(voterAddress) // get all delegations for current voter

        for each delegation in delegations
          // make sure delegation.Shares does NOT include shares being unbonded
          tmpValMap(delegation.ValidatorAddr).Minus += delegation.Shares
          proposal.updateTally(vote, delegation.Shares)

        _, isVal = stakingKeeper.getValidator(voterAddress)
        if (isVal)
          tmpValMap(voterAddress).Vote = vote

      tallyingParam = load(GlobalParams, 'TallyingParam')

      // Update tally if validator voted
      for each validator in validators
        if tmpValMap(validator).HasVoted
          proposal.updateTally(tmpValMap(validator).Vote, (validator.TotalShares - tmpValMap(validator).Minus))



      // Check if proposal is accepted or rejected
      totalNonAbstain := proposal.YesVotes + proposal.NoVotes + proposal.NoWithVetoVotes
      if (proposal.Votes.YesVotes/totalNonAbstain > tallyingParam.Threshold AND proposal.Votes.NoWithVetoVotes/totalNonAbstain  < tallyingParam.Veto)
        //  proposal was accepted at the end of the voting period
        //  refund deposits (non-voters already punished)
        for each (amount, depositor) in proposal.Deposits
          depositor.AtomBalance += amount

        stateWriter, err := proposal.Handler()
        if err != nil
            // proposal passed but failed during state execution
            proposal.CurrentStatus = ProposalStatusFailed
         else
            // proposal pass and state is persisted
            proposal.CurrentStatus = ProposalStatusAccepted
            stateWriter.save()
      else
        // proposal was rejected
        proposal.CurrentStatus = ProposalStatusRejected

      store(Governance, <proposalID|'proposal'>, proposal)
```

### Legacy Proposal

A legacy proposal is the old implementation of governance proposal.
Contrary to proposal that can contain any messages, a legacy proposal allows to submit a set of pre-defined proposals.
These proposal are defined by their types.

While proposals should use the new implementation of the governance proposal, we need still to use legacy proposal in order to submit a `software-upgrade` and a `cancel-software-upgrade` proposal.

More information on how to submit proposals in the [client section](#client).

## Messages

### Proposal Submission

Proposals can be submitted by any account via a `MsgSubmitProposal` transaction.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/tx.proto#L42-L69
```

All `sdk.Msgs` passed into the `messages` field of a `MsgSubmitProposal` message
must be registered in the app's `MsgServiceRouter`. Each of these messages must
have one signer, namely the gov module account. And finally, the metadata length
must not be larger than the `maxMetadataLen` config passed into the gov keeper.

**State modifications:**

* Generate new `proposalID`
* Create new `Proposal`
* Initialise `Proposal`'s attributes
* Decrease balance of sender by `InitialDeposit`
* If `MinDeposit` is reached:
    * Push `proposalID` in `ProposalProcessingQueue`
* Transfer `InitialDeposit` from the `Proposer` to the governance `ModuleAccount`

A `MsgSubmitProposal` transaction can be handled according to the following
pseudocode.

```go
// PSEUDOCODE //
// Check if MsgSubmitProposal is valid. If it is, create proposal //

upon receiving txGovSubmitProposal from sender do

  if !correctlyFormatted(txGovSubmitProposal)
    // check if proposal is correctly formatted and the messages have routes to other modules. Includes fee payment.
    // check if all messages' unique Signer is the gov acct.
    // check if the metadata is not too long.
    throw

  initialDeposit = txGovSubmitProposal.InitialDeposit
  if (initialDeposit.Atoms <= 0) OR (sender.AtomBalance < initialDeposit.Atoms)
    // InitialDeposit is negative or null OR sender has insufficient funds
    throw

  if (txGovSubmitProposal.Type != ProposalTypePlainText) OR (txGovSubmitProposal.Type != ProposalTypeSoftwareUpgrade)

  sender.AtomBalance -= initialDeposit.Atoms

  depositParam = load(GlobalParams, 'DepositParam')

  proposalID = generate new proposalID
  proposal = NewProposal()

  proposal.Messages = txGovSubmitProposal.Messages
  proposal.Metadata = txGovSubmitProposal.Metadata
  proposal.TotalDeposit = initialDeposit
  proposal.SubmitTime = <CurrentTime>
  proposal.DepositEndTime = <CurrentTime>.Add(depositParam.MaxDepositPeriod)
  proposal.Deposits.append({initialDeposit, sender})
  proposal.Submitter = sender
  proposal.YesVotes = 0
  proposal.NoVotes = 0
  proposal.NoWithVetoVotes = 0
  proposal.AbstainVotes = 0
  proposal.CurrentStatus = ProposalStatusOpen

  store(Proposals, <proposalID|'proposal'>, proposal) // Store proposal in Proposals mapping
  return proposalID
```

### Deposit

Once a proposal is submitted, if
`Proposal.TotalDeposit < ActiveParam.MinDeposit`, Atom holders can send
`MsgDeposit` transactions to increase the proposal's deposit.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/tx.proto#L134-L147
```

**State modifications:**

* Decrease balance of sender by `deposit`
* Add `deposit` of sender in `proposal.Deposits`
* Increase `proposal.TotalDeposit` by sender's `deposit`
* If `MinDeposit` is reached:
    * Push `proposalID` in `ProposalProcessingQueueEnd`
* Transfer `Deposit` from the `proposer` to the governance `ModuleAccount`

A `MsgDeposit` transaction has to go through a number of checks to be valid.
These checks are outlined in the following pseudocode.

```go
// PSEUDOCODE //
// Check if MsgDeposit is valid. If it is, increase deposit and check if MinDeposit is reached

upon receiving txGovDeposit from sender do
  // check if proposal is correctly formatted. Includes fee payment.

  if !correctlyFormatted(txGovDeposit)
    throw

  proposal = load(Proposals, <txGovDeposit.ProposalID|'proposal'>) // proposal is a const key, proposalID is variable

  if (proposal == nil)
    // There is no proposal for this proposalID
    throw

  if (txGovDeposit.Deposit.Atoms <= 0) OR (sender.AtomBalance < txGovDeposit.Deposit.Atoms) OR (proposal.CurrentStatus != ProposalStatusOpen)

    // deposit is negative or null
    // OR sender has insufficient funds
    // OR proposal is not open for deposit anymore

    throw

  depositParam = load(GlobalParams, 'DepositParam')

  if (CurrentBlock >= proposal.SubmitBlock + depositParam.MaxDepositPeriod)
    proposal.CurrentStatus = ProposalStatusClosed

  else
    // sender can deposit
    sender.AtomBalance -= txGovDeposit.Deposit.Atoms

    proposal.Deposits.append({txGovVote.Deposit, sender})
    proposal.TotalDeposit.Plus(txGovDeposit.Deposit)

    if (proposal.TotalDeposit >= depositParam.MinDeposit)
      // MinDeposit is reached, vote opens

      proposal.VotingStartBlock = CurrentBlock
      proposal.CurrentStatus = ProposalStatusActive
      ProposalProcessingQueue.push(txGovDeposit.ProposalID)

  store(Proposals, <txGovVote.ProposalID|'proposal'>, proposal)
```

### Vote

Once `ActiveParam.MinDeposit` is reached, voting period starts. From there,
bonded Atom holders are able to send `MsgVote` transactions to cast their
vote on the proposal.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/gov/v1/tx.proto#L92-L108
```

**State modifications:**

* Record `Vote` of sender

:::note
Gas cost for this message has to take into account the future tallying of the vote in EndBlocker.
:::

Next is a pseudocode outline of the way `MsgVote` transactions are handled:

```go
  // PSEUDOCODE //
  // Check if MsgVote is valid. If it is, count vote//

  upon receiving txGovVote from sender do
    // check if proposal is correctly formatted. Includes fee payment.

    if !correctlyFormatted(txGovDeposit)
      throw

    proposal = load(Proposals, <txGovDeposit.ProposalID|'proposal'>)

    if (proposal == nil)
      // There is no proposal for this proposalID
      throw


    if  (proposal.CurrentStatus == ProposalStatusActive)


        // Sender can vote if
        // Proposal is active
        // Sender has some bonds

        store(Governance, <txGovVote.ProposalID|'addresses'|sender>, txGovVote.Vote)   // Voters can vote multiple times. Re-voting overrides previous vote. This is ok because tallying is done once at the end.
```

## Events

The governance module emits the following events:

### EndBlocker

| Type              | Attribute Key   | Attribute Value  |
| ----------------- | --------------- | ---------------- |
| inactive_proposal | proposal_id     | {proposalID}     |
| inactive_proposal | proposal_result | {proposalResult} |
| active_proposal   | proposal_id     | {proposalID}     |
| active_proposal   | proposal_result | {proposalResult} |

### Handlers

#### MsgSubmitProposal

| Type                | Attribute Key       | Attribute Value |
| ------------------- | ------------------- | --------------- |
| submit_proposal     | proposal_id         | {proposalID}    |
| submit_proposal [0] | voting_period_start | {proposalID}    |
| proposal_deposit    | amount              | {depositAmount} |
| proposal_deposit    | proposal_id         | {proposalID}    |
| message             | module              | governance      |
| message             | action              | submit_proposal |
| message             | sender              | {senderAddress} |

* [0] Event only emitted if the voting period starts during the submission.

#### MsgVote

| Type          | Attribute Key | Attribute Value |
| ------------- | ------------- | --------------- |
| proposal_vote | option        | {voteOption}    |
| proposal_vote | proposal_id   | {proposalID}    |
| message       | module        | governance      |
| message       | action        | vote            |
| message       | sender        | {senderAddress} |

#### MsgVoteWeighted

| Type          | Attribute Key | Attribute Value       |
| ------------- | ------------- | --------------------- |
| proposal_vote | option        | {weightedVoteOptions} |
| proposal_vote | proposal_id   | {proposalID}          |
| message       | module        | governance            |
| message       | action        | vote                  |
| message       | sender        | {senderAddress}       |

#### MsgDeposit

| Type                 | Attribute Key       | Attribute Value |
| -------------------- | ------------------- | --------------- |
| proposal_deposit     | amount              | {depositAmount} |
| proposal_deposit     | proposal_id         | {proposalID}    |
| proposal_deposit [0] | voting_period_start | {proposalID}    |
| message              | module              | governance      |
| message              | action              | deposit         |
| message              | sender              | {senderAddress} |

* [0] Event only emitted if the voting period starts during the submission.

## Parameters

The governance module contains the following parameters:

| Key                           | Type             | Example                                 |
| ----------------------------- | ---------------- | --------------------------------------- |
| min_deposit                   | array (coins)    | [{"denom":"uatom","amount":"10000000"}] |
| max_deposit_period            | string (time ns) | "172800000000000" (17280s)              |
| voting_period                 | string (time ns) | "172800000000000" (17280s)              |
| quorum                        | string (dec)     | "0.334000000000000000"                  |
| threshold                     | string (dec)     | "0.500000000000000000"                  |
| veto                          | string (dec)     | "0.334000000000000000"                  |
| expedited_threshold           | string (time ns) | "0.667000000000000000"                  |
| expedited_voting_period       | string (time ns) | "86400000000000" (8600s)                |
| expedited_min_deposit         | array (coins)    | [{"denom":"uatom","amount":"50000000"}] |
| burn_proposal_deposit_prevote | bool             | false                                   |
| burn_vote_quorum              | bool             | false                                   |
| burn_vote_veto                | bool             | true                                    |

**NOTE**: The governance module contains parameters that are objects unlike other
modules. If only a subset of parameters are desired to be changed, only they need
to be included and not the entire parameter object structure.

## Client

### CLI

A user can query and interact with the `gov` module using the CLI.

#### Query

The `query` commands allow users to query `gov` state.

```bash
simd query gov --help
```

##### deposit

The `deposit` command allows users to query a deposit for a given proposal from a given depositor.

```bash
simd query gov deposit [proposal-id] [depositer-addr] [flags]
```

Example:

```bash
simd query gov deposit 1 cosmos1..
```

Example Output:

```bash
amount:
- amount: "100"
  denom: stake
depositor: cosmos1..
proposal_id: "1"
```

##### deposits

The `deposits` command allows users to query all deposits for a given proposal.

```bash
simd query gov deposits [proposal-id] [flags]
```

Example:

```bash
simd query gov deposits 1
```

Example Output:

```bash
deposits:
- amount:
  - amount: "100"
    denom: stake
  depositor: cosmos1..
  proposal_id: "1"
pagination:
  next_key: null
  total: "0"
```

##### param

The `param` command allows users to query a given parameter for the `gov` module.

```bash
simd query gov param [param-type] [flags]
```

Example:

```bash
simd query gov param voting
```

Example Output:

```bash
voting_period: "172800000000000"
```

##### params

The `params` command allows users to query all parameters for the `gov` module.

```bash
simd query gov params [flags]
```

Example:

```bash
simd query gov params
```

Example Output:

```bash
deposit_params:
  max_deposit_period: 172800s
  min_deposit:
  - amount: "10000000"
    denom: stake
params:
  expedited_min_deposit:
  - amount: "50000000"
    denom: stake
  expedited_threshold: "0.670000000000000000"
  expedited_voting_period: 86400s
  max_deposit_period: 172800s
  min_deposit:
  - amount: "10000000"
    denom: stake
  min_initial_deposit_ratio: "0.000000000000000000"
  proposal_cancel_burn_rate: "0.500000000000000000"
  quorum: "0.334000000000000000"
  threshold: "0.500000000000000000"
  veto_threshold: "0.334000000000000000"
  voting_period: 172800s
tally_params:
  quorum: "0.334000000000000000"
  threshold: "0.500000000000000000"
  veto_threshold: "0.334000000000000000"
voting_params:
  voting_period: 172800s
```

##### proposal

The `proposal` command allows users to query a given proposal.

```bash
simd query gov proposal [proposal-id] [flags]
```

Example:

```bash
simd query gov proposal 1
```

Example Output:

```bash
deposit_end_time: "2022-03-30T11:50:20.819676256Z"
final_tally_result:
  abstain_count: "0"
  no_count: "0"
  no_with_veto_count: "0"
  yes_count: "0"
id: "1"
messages:
- '@type': /cosmos.bank.v1beta1.MsgSend
  amount:
  - amount: "10"
    denom: stake
  from_address: cosmos1..
  to_address: cosmos1..
metadata: AQ==
status: PROPOSAL_STATUS_DEPOSIT_PERIOD
submit_time: "2022-03-28T11:50:20.819676256Z"
total_deposit:
- amount: "10"
  denom: stake
voting_end_time: null
voting_start_time: null
```

##### proposals

The `proposals` command allows users to query all proposals with optional filters.

```bash
simd query gov proposals [flags]
```

Example:

```bash
simd query gov proposals
```

Example Output:

```bash
pagination:
  next_key: null
  total: "0"
proposals:
- deposit_end_time: "2022-03-30T11:50:20.819676256Z"
  final_tally_result:
    abstain_count: "0"
    no_count: "0"
    no_with_veto_count: "0"
    yes_count: "0"
  id: "1"
  messages:
  - '@type': /cosmos.bank.v1beta1.MsgSend
    amount:
    - amount: "10"
      denom: stake
    from_address: cosmos1..
    to_address: cosmos1..
  metadata: AQ==
  status: PROPOSAL_STATUS_DEPOSIT_PERIOD
  submit_time: "2022-03-28T11:50:20.819676256Z"
  total_deposit:
  - amount: "10"
    denom: stake
  voting_end_time: null
  voting_start_time: null
- deposit_end_time: "2022-03-30T14:02:41.165025015Z"
  final_tally_result:
    abstain_count: "0"
    no_count: "0"
    no_with_veto_count: "0"
    yes_count: "0"
  id: "2"
  messages:
  - '@type': /cosmos.bank.v1beta1.MsgSend
    amount:
    - amount: "10"
      denom: stake
    from_address: cosmos1..
    to_address: cosmos1..
  metadata: AQ==
  status: PROPOSAL_STATUS_DEPOSIT_PERIOD
  submit_time: "2022-03-28T14:02:41.165025015Z"
  total_deposit:
  - amount: "10"
    denom: stake
  voting_end_time: null
  voting_start_time: null
```

##### proposer

The `proposer` command allows users to query the proposer for a given proposal.

```bash
simd query gov proposer [proposal-id] [flags]
```

Example:

```bash
simd query gov proposer 1
```

Example Output:

```bash
proposal_id: "1"
proposer: cosmos1..
```

##### tally

The `tally` command allows users to query the tally of a given proposal vote.

```bash
simd query gov tally [proposal-id] [flags]
```

Example:

```bash
simd query gov tally 1
```

Example Output:

```bash
abstain: "0"
"no": "0"
no_with_veto: "0"
"yes": "1"
```

##### vote

The `vote` command allows users to query a vote for a given proposal.

```bash
simd query gov vote [proposal-id] [voter-addr] [flags]
```

Example:

```bash
simd query gov vote 1 cosmos1..
```

Example Output:

```bash
option: VOTE_OPTION_YES
options:
- option: VOTE_OPTION_YES
  weight: "1.000000000000000000"
proposal_id: "1"
voter: cosmos1..
```

##### votes

The `votes` command allows users to query all votes for a given proposal.

```bash
simd query gov votes [proposal-id] [flags]
```

Example:

```bash
simd query gov votes 1
```

Example Output:

```bash
pagination:
  next_key: null
  total: "0"
votes:
- option: VOTE_OPTION_YES
  options:
  - option: VOTE_OPTION_YES
    weight: "1.000000000000000000"
  proposal_id: "1"
  voter: cosmos1..
```

#### Transactions

The `tx` commands allow users to interact with the `gov` module.

```bash
simd tx gov --help
```

##### deposit

The `deposit` command allows users to deposit tokens for a given proposal.

```bash
simd tx gov deposit [proposal-id] [deposit] [flags]
```

Example:

```bash
simd tx gov deposit 1 10000000stake --from cosmos1..
```

##### draft-proposal

The `draft-proposal` command allows users to draft any type of proposal.
The command returns a `draft_proposal.json`, to be used by `submit-proposal` after being completed.
The `draft_metadata.json` is meant to be uploaded to [IPFS](#metadata).

```bash
simd tx gov draft-proposal
```

##### submit-proposal

The `submit-proposal` command allows users to submit a governance proposal along with some messages and metadata.
Messages, metadata and deposit are defined in a JSON file.

```bash
simd tx gov submit-proposal [path-to-proposal-json] [flags]
```

Example:

```bash
simd tx gov submit-proposal /path/to/proposal.json --from cosmos1..
```

where `proposal.json` contains:

```json
{
  "messages": [
    {
      "@type": "/cosmos.bank.v1beta1.MsgSend",
      "from_address": "cosmos1...", // The gov module module address
      "to_address": "cosmos1...",
      "amount":[{"denom": "stake","amount": "10"}]
    }
  ],
  "metadata": "AQ==",
  "deposit": "10stake",
  "title": "Proposal Title",
  "summary": "Proposal Summary"
}
```

:::note
By default the metadata, summary and title are both limited by 255 characters, this can be overridden by the application developer.
:::

##### submit-legacy-proposal

The `submit-legacy-proposal` command allows users to submit a governance legacy proposal along with an initial deposit.

```bash
simd tx gov submit-legacy-proposal [command] [flags]
```

Example:

```bash
simd tx gov submit-legacy-proposal --title="Test Proposal" --description="testing" --type="Text" --deposit="100000000stake" --from cosmos1..
```

Example (`param-change`):

```bash
simd tx gov submit-legacy-proposal param-change proposal.json --from cosmos1..
```

```json
{
  "title": "Test Proposal",
  "description": "testing, testing, 1, 2, 3",
  "changes": [
    {
      "subspace": "staking",
      "key": "MaxValidators",
      "value": 100
    }
  ],
  "deposit": "10000000stake"
}
```

#### cancel-proposal

Once proposal is canceled, from the deposits of proposal `deposits * proposal_cancel_ratio` will be burned or sent to `ProposalCancelDest` address , if `ProposalCancelDest` is empty then deposits will be burned. The `remaining deposits` will be sent to depositers.

```bash
simd tx gov cancel-proposal [proposal-id] [flags]
```

Example:

```bash
simd tx gov cancel-proposal 1 --from cosmos1...
```

##### vote

The `vote` command allows users to submit a vote for a given governance proposal.

```bash
simd tx gov vote [command] [flags]
```

Example:

```bash
simd tx gov vote 1 yes --from cosmos1..
```

##### weighted-vote

The `weighted-vote` command allows users to submit a weighted vote for a given governance proposal.

```bash
simd tx gov weighted-vote [proposal-id] [weighted-options] [flags]
```

Example:

```bash
simd tx gov weighted-vote 1 yes=0.5,no=0.5 --from cosmos1..
```

### gRPC

A user can query the `gov` module using gRPC endpoints.

#### Proposal

The `Proposal` endpoint allows users to query a given proposal.

Using legacy v1beta1:

```bash
cosmos.gov.v1beta1.Query/Proposal
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Proposal
```

Example Output:

```bash
{
  "proposal": {
    "proposalId": "1",
    "content": {"@type":"/cosmos.gov.v1beta1.TextProposal","description":"testing, testing, 1, 2, 3","title":"Test Proposal"},
    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
    "finalTallyResult": {
      "yes": "0",
      "abstain": "0",
      "no": "0",
      "noWithVeto": "0"
    },
    "submitTime": "2021-09-16T19:40:08.712440474Z",
    "depositEndTime": "2021-09-18T19:40:08.712440474Z",
    "totalDeposit": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ],
    "votingStartTime": "2021-09-16T19:40:08.712440474Z",
    "votingEndTime": "2021-09-18T19:40:08.712440474Z",
    "title": "Test Proposal",
    "summary": "testing, testing, 1, 2, 3"
  }
}
```

Using v1:

```bash
cosmos.gov.v1.Query/Proposal
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Proposal
```

Example Output:

```bash
{
  "proposal": {
    "id": "1",
    "messages": [
      {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"10"}],"fromAddress":"cosmos1..","toAddress":"cosmos1.."}
    ],
    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
    "finalTallyResult": {
      "yesCount": "0",
      "abstainCount": "0",
      "noCount": "0",
      "noWithVetoCount": "0"
    },
    "submitTime": "2022-03-28T11:50:20.819676256Z",
    "depositEndTime": "2022-03-30T11:50:20.819676256Z",
    "totalDeposit": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ],
    "votingStartTime": "2022-03-28T14:25:26.644857113Z",
    "votingEndTime": "2022-03-30T14:25:26.644857113Z",
    "metadata": "AQ==",
    "title": "Test Proposal",
    "summary": "testing, testing, 1, 2, 3"
  }
}
```

#### Proposals

The `Proposals` endpoint allows users to query all proposals with optional filters.

Using legacy v1beta1:

```bash
cosmos.gov.v1beta1.Query/Proposals
```

Example:

```bash
grpcurl -plaintext \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Proposals
```

Example Output:

```bash
{
  "proposals": [
    {
      "proposalId": "1",
      "status": "PROPOSAL_STATUS_VOTING_PERIOD",
      "finalTallyResult": {
        "yes": "0",
        "abstain": "0",
        "no": "0",
        "noWithVeto": "0"
      },
      "submitTime": "2022-03-28T11:50:20.819676256Z",
      "depositEndTime": "2022-03-30T11:50:20.819676256Z",
      "totalDeposit": [
        {
          "denom": "stake",
          "amount": "10000000010"
        }
      ],
      "votingStartTime": "2022-03-28T14:25:26.644857113Z",
      "votingEndTime": "2022-03-30T14:25:26.644857113Z"
    },
    {
      "proposalId": "2",
      "status": "PROPOSAL_STATUS_DEPOSIT_PERIOD",
      "finalTallyResult": {
        "yes": "0",
        "abstain": "0",
        "no": "0",
        "noWithVeto": "0"
      },
      "submitTime": "2022-03-28T14:02:41.165025015Z",
      "depositEndTime": "2022-03-30T14:02:41.165025015Z",
      "totalDeposit": [
        {
          "denom": "stake",
          "amount": "10"
        }
      ],
      "votingStartTime": "0001-01-01T00:00:00Z",
      "votingEndTime": "0001-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": "2"
  }
}

```

Using v1:

```bash
cosmos.gov.v1.Query/Proposals
```

Example:

```bash
grpcurl -plaintext \
    localhost:9090 \
    cosmos.gov.v1.Query/Proposals
```

Example Output:

```bash
{
  "proposals": [
    {
      "id": "1",
      "messages": [
        {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"10"}],"fromAddress":"cosmos1..","toAddress":"cosmos1.."}
      ],
      "status": "PROPOSAL_STATUS_VOTING_PERIOD",
      "finalTallyResult": {
        "yesCount": "0",
        "abstainCount": "0",
        "noCount": "0",
        "noWithVetoCount": "0"
      },
      "submitTime": "2022-03-28T11:50:20.819676256Z",
      "depositEndTime": "2022-03-30T11:50:20.819676256Z",
      "totalDeposit": [
        {
          "denom": "stake",
          "amount": "10000000010"
        }
      ],
      "votingStartTime": "2022-03-28T14:25:26.644857113Z",
      "votingEndTime": "2022-03-30T14:25:26.644857113Z",
      "metadata": "AQ==",
      "title": "Proposal Title",
      "summary": "Proposal Summary"
    },
    {
      "id": "2",
      "messages": [
        {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"10"}],"fromAddress":"cosmos1..","toAddress":"cosmos1.."}
      ],
      "status": "PROPOSAL_STATUS_DEPOSIT_PERIOD",
      "finalTallyResult": {
        "yesCount": "0",
        "abstainCount": "0",
        "noCount": "0",
        "noWithVetoCount": "0"
      },
      "submitTime": "2022-03-28T14:02:41.165025015Z",
      "depositEndTime": "2022-03-30T14:02:41.165025015Z",
      "totalDeposit": [
        {
          "denom": "stake",
          "amount": "10"
        }
      ],
      "metadata": "AQ==",
      "title": "Proposal Title",
      "summary": "Proposal Summary"
    }
  ],
  "pagination": {
    "total": "2"
  }
}
```

#### Vote

The `Vote` endpoint allows users to query a vote for a given proposal.

Using legacy v1beta1:

```bash
cosmos.gov.v1beta1.Query/Vote
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1","voter":"cosmos1.."}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Vote
```

Example Output:

```bash
{
  "vote": {
    "proposalId": "1",
    "voter": "cosmos1..",
    "option": "VOTE_OPTION_YES",
    "options": [
      {
        "option": "VOTE_OPTION_YES",
        "weight": "1000000000000000000"
      }
    ]
  }
}
```

Using v1:

```bash
cosmos.gov.v1.Query/Vote
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1","voter":"cosmos1.."}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Vote
```

Example Output:

```bash
{
  "vote": {
    "proposalId": "1",
    "voter": "cosmos1..",
    "option": "VOTE_OPTION_YES",
    "options": [
      {
        "option": "VOTE_OPTION_YES",
        "weight": "1.000000000000000000"
      }
    ]
  }
}
```

#### Votes

The `Votes` endpoint allows users to query all votes for a given proposal.

Using legacy v1beta1:

```bash
cosmos.gov.v1beta1.Query/Votes
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Votes
```

Example Output:

```bash
{
  "votes": [
    {
      "proposalId": "1",
      "voter": "cosmos1..",
      "options": [
        {
          "option": "VOTE_OPTION_YES",
          "weight": "1000000000000000000"
        }
      ]
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

Using v1:

```bash
cosmos.gov.v1.Query/Votes
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Votes
```

Example Output:

```bash
{
  "votes": [
    {
      "proposalId": "1",
      "voter": "cosmos1..",
      "options": [
        {
          "option": "VOTE_OPTION_YES",
          "weight": "1.000000000000000000"
        }
      ]
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### Params

The `Params` endpoint allows users to query all parameters for the `gov` module.

<!-- TODO: #10197 Querying governance params outputs nil values -->

Using legacy v1beta1:

```bash
cosmos.gov.v1beta1.Query/Params
```

Example:

```bash
grpcurl -plaintext \
    -d '{"params_type":"voting"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Params
```

Example Output:

```bash
{
  "votingParams": {
    "votingPeriod": "172800s"
  },
  "depositParams": {
    "maxDepositPeriod": "0s"
  },
  "tallyParams": {
    "quorum": "MA==",
    "threshold": "MA==",
    "vetoThreshold": "MA=="
  }
}
```

Using v1:

```bash
cosmos.gov.v1.Query/Params
```

Example:

```bash
grpcurl -plaintext \
    -d '{"params_type":"voting"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Params
```

Example Output:

```bash
{
  "votingParams": {
    "votingPeriod": "172800s"
  }
}
```

#### Deposit

The `Deposit` endpoint allows users to query a deposit for a given proposal from a given depositor.

Using legacy v1beta1:

```bash
cosmos.gov.v1beta1.Query/Deposit
```

Example:

```bash
grpcurl -plaintext \
    '{"proposal_id":"1","depositor":"cosmos1.."}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Deposit
```

Example Output:

```bash
{
  "deposit": {
    "proposalId": "1",
    "depositor": "cosmos1..",
    "amount": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ]
  }
}
```

Using v1:

```bash
cosmos.gov.v1.Query/Deposit
```

Example:

```bash
grpcurl -plaintext \
    '{"proposal_id":"1","depositor":"cosmos1.."}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Deposit
```

Example Output:

```bash
{
  "deposit": {
    "proposalId": "1",
    "depositor": "cosmos1..",
    "amount": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ]
  }
}
```

#### deposits

The `Deposits` endpoint allows users to query all deposits for a given proposal.

Using legacy v1beta1:

```bash
cosmos.gov.v1beta1.Query/Deposits
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/Deposits
```

Example Output:

```bash
{
  "deposits": [
    {
      "proposalId": "1",
      "depositor": "cosmos1..",
      "amount": [
        {
          "denom": "stake",
          "amount": "10000000"
        }
      ]
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

Using v1:

```bash
cosmos.gov.v1.Query/Deposits
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/Deposits
```

Example Output:

```bash
{
  "deposits": [
    {
      "proposalId": "1",
      "depositor": "cosmos1..",
      "amount": [
        {
          "denom": "stake",
          "amount": "10000000"
        }
      ]
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

#### TallyResult

The `TallyResult` endpoint allows users to query the tally of a given proposal.

Using legacy v1beta1:

```bash
cosmos.gov.v1beta1.Query/TallyResult
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1beta1.Query/TallyResult
```

Example Output:

```bash
{
  "tally": {
    "yes": "1000000",
    "abstain": "0",
    "no": "0",
    "noWithVeto": "0"
  }
}
```

Using v1:

```bash
cosmos.gov.v1.Query/TallyResult
```

Example:

```bash
grpcurl -plaintext \
    -d '{"proposal_id":"1"}' \
    localhost:9090 \
    cosmos.gov.v1.Query/TallyResult
```

Example Output:

```bash
{
  "tally": {
    "yes": "1000000",
    "abstain": "0",
    "no": "0",
    "noWithVeto": "0"
  }
}
```

### REST

A user can query the `gov` module using REST endpoints.

#### proposal

The `proposals` endpoint allows users to query a given proposal.

Using legacy v1beta1:

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1
```

Example Output:

```bash
{
  "proposal": {
    "proposal_id": "1",
    "content": null,
    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
    "final_tally_result": {
      "yes": "0",
      "abstain": "0",
      "no": "0",
      "no_with_veto": "0"
    },
    "submit_time": "2022-03-28T11:50:20.819676256Z",
    "deposit_end_time": "2022-03-30T11:50:20.819676256Z",
    "total_deposit": [
      {
        "denom": "stake",
        "amount": "10000000010"
      }
    ],
    "voting_start_time": "2022-03-28T14:25:26.644857113Z",
    "voting_end_time": "2022-03-30T14:25:26.644857113Z"
  }
}
```

Using v1:

```bash
/cosmos/gov/v1/proposals/{proposal_id}
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1
```

Example Output:

```bash
{
  "proposal": {
    "id": "1",
    "messages": [
      {
        "@type": "/cosmos.bank.v1beta1.MsgSend",
        "from_address": "cosmos1..",
        "to_address": "cosmos1..",
        "amount": [
          {
            "denom": "stake",
            "amount": "10"
          }
        ]
      }
    ],
    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
    "final_tally_result": {
      "yes_count": "0",
      "abstain_count": "0",
      "no_count": "0",
      "no_with_veto_count": "0"
    },
    "submit_time": "2022-03-28T11:50:20.819676256Z",
    "deposit_end_time": "2022-03-30T11:50:20.819676256Z",
    "total_deposit": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ],
    "voting_start_time": "2022-03-28T14:25:26.644857113Z",
    "voting_end_time": "2022-03-30T14:25:26.644857113Z",
    "metadata": "AQ==",
    "title": "Proposal Title",
    "summary": "Proposal Summary"
  }
}
```

#### proposals

The `proposals` endpoint also allows users to query all proposals with optional filters.

Using legacy v1beta1:

```bash
/cosmos/gov/v1beta1/proposals
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals
```

Example Output:

```bash
{
  "proposals": [
    {
      "proposal_id": "1",
      "content": null,
      "status": "PROPOSAL_STATUS_VOTING_PERIOD",
      "final_tally_result": {
        "yes": "0",
        "abstain": "0",
        "no": "0",
        "no_with_veto": "0"
      },
      "submit_time": "2022-03-28T11:50:20.819676256Z",
      "deposit_end_time": "2022-03-30T11:50:20.819676256Z",
      "total_deposit": [
        {
          "denom": "stake",
          "amount": "10000000"
        }
      ],
      "voting_start_time": "2022-03-28T14:25:26.644857113Z",
      "voting_end_time": "2022-03-30T14:25:26.644857113Z"
    },
    {
      "proposal_id": "2",
      "content": null,
      "status": "PROPOSAL_STATUS_DEPOSIT_PERIOD",
      "final_tally_result": {
        "yes": "0",
        "abstain": "0",
        "no": "0",
        "no_with_veto": "0"
      },
      "submit_time": "2022-03-28T14:02:41.165025015Z",
      "deposit_end_time": "2022-03-30T14:02:41.165025015Z",
      "total_deposit": [
        {
          "denom": "stake",
          "amount": "10"
        }
      ],
      "voting_start_time": "0001-01-01T00:00:00Z",
      "voting_end_time": "0001-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

Using v1:

```bash
/cosmos/gov/v1/proposals
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1/proposals
```

Example Output:

```bash
{
  "proposals": [
    {
      "id": "1",
      "messages": [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          "from_address": "cosmos1..",
          "to_address": "cosmos1..",
          "amount": [
            {
              "denom": "stake",
              "amount": "10"
            }
          ]
        }
      ],
      "status": "PROPOSAL_STATUS_VOTING_PERIOD",
      "final_tally_result": {
        "yes_count": "0",
        "abstain_count": "0",
        "no_count": "0",
        "no_with_veto_count": "0"
      },
      "submit_time": "2022-03-28T11:50:20.819676256Z",
      "deposit_end_time": "2022-03-30T11:50:20.819676256Z",
      "total_deposit": [
        {
          "denom": "stake",
          "amount": "10000000010"
        }
      ],
      "voting_start_time": "2022-03-28T14:25:26.644857113Z",
      "voting_end_time": "2022-03-30T14:25:26.644857113Z",
      "metadata": "AQ==",
      "title": "Proposal Title",
      "summary": "Proposal Summary"
    },
    {
      "id": "2",
      "messages": [
        {
          "@type": "/cosmos.bank.v1beta1.MsgSend",
          "from_address": "cosmos1..",
          "to_address": "cosmos1..",
          "amount": [
            {
              "denom": "stake",
              "amount": "10"
            }
          ]
        }
      ],
      "status": "PROPOSAL_STATUS_DEPOSIT_PERIOD",
      "final_tally_result": {
        "yes_count": "0",
        "abstain_count": "0",
        "no_count": "0",
        "no_with_veto_count": "0"
      },
      "submit_time": "2022-03-28T14:02:41.165025015Z",
      "deposit_end_time": "2022-03-30T14:02:41.165025015Z",
      "total_deposit": [
        {
          "denom": "stake",
          "amount": "10"
        }
      ],
      "voting_start_time": null,
      "voting_end_time": null,
      "metadata": "AQ==",
      "title": "Proposal Title",
      "summary": "Proposal Summary"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "2"
  }
}
```

#### voter vote

The `votes` endpoint allows users to query a vote for a given proposal.

Using legacy v1beta1:

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/votes/{voter}
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/votes/cosmos1..
```

Example Output:

```bash
{
  "vote": {
    "proposal_id": "1",
    "voter": "cosmos1..",
    "option": "VOTE_OPTION_YES",
    "options": [
      {
        "option": "VOTE_OPTION_YES",
        "weight": "1.000000000000000000"
      }
    ]
  }
}
```

Using v1:

```bash
/cosmos/gov/v1/proposals/{proposal_id}/votes/{voter}
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/votes/cosmos1..
```

Example Output:

```bash
{
  "vote": {
    "proposal_id": "1",
    "voter": "cosmos1..",
    "options": [
      {
        "option": "VOTE_OPTION_YES",
        "weight": "1.000000000000000000"
      }
    ],
    "metadata": ""
  }
}
```

#### votes

The `votes` endpoint allows users to query all votes for a given proposal.

Using legacy v1beta1:

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/votes
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/votes
```

Example Output:

```bash
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "cosmos1..",
      "option": "VOTE_OPTION_YES",
      "options": [
        {
          "option": "VOTE_OPTION_YES",
          "weight": "1.000000000000000000"
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

Using v1:

```bash
/cosmos/gov/v1/proposals/{proposal_id}/votes
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/votes
```

Example Output:

```bash
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "cosmos1..",
      "options": [
        {
          "option": "VOTE_OPTION_YES",
          "weight": "1.000000000000000000"
        }
      ],
      "metadata": ""
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```

#### params

The `params` endpoint allows users to query all parameters for the `gov` module.

<!-- TODO: #10197 Querying governance params outputs nil values -->

Using legacy v1beta1:

```bash
/cosmos/gov/v1beta1/params/{params_type}
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1beta1/params/voting
```

Example Output:

```bash
{
  "voting_params": {
    "voting_period": "172800s"
  },
  "deposit_params": {
    "min_deposit": [
    ],
    "max_deposit_period": "0s"
  },
  "tally_params": {
    "quorum": "0.000000000000000000",
    "threshold": "0.000000000000000000",
    "veto_threshold": "0.000000000000000000"
  }
}
```

Using v1:

```bash
/cosmos/gov/v1/params/{params_type}
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1/params/voting
```

Example Output:

```bash
{
  "voting_params": {
    "voting_period": "172800s"
  },
  "deposit_params": {
    "min_deposit": [
    ],
    "max_deposit_period": "0s"
  },
  "tally_params": {
    "quorum": "0.000000000000000000",
    "threshold": "0.000000000000000000",
    "veto_threshold": "0.000000000000000000"
  }
}
```

#### deposits

The `deposits` endpoint allows users to query a deposit for a given proposal from a given depositor.

Using legacy v1beta1:

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/deposits/{depositor}
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/deposits/cosmos1..
```

Example Output:

```bash
{
  "deposit": {
    "proposal_id": "1",
    "depositor": "cosmos1..",
    "amount": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ]
  }
}
```

Using v1:

```bash
/cosmos/gov/v1/proposals/{proposal_id}/deposits/{depositor}
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/deposits/cosmos1..
```

Example Output:

```bash
{
  "deposit": {
    "proposal_id": "1",
    "depositor": "cosmos1..",
    "amount": [
      {
        "denom": "stake",
        "amount": "10000000"
      }
    ]
  }
}
```

#### proposal deposits

The `deposits` endpoint allows users to query all deposits for a given proposal.

Using legacy v1beta1:

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/deposits
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/deposits
```

Example Output:

```bash
{
  "deposits": [
    {
      "proposal_id": "1",
      "depositor": "cosmos1..",
      "amount": [
        {
          "denom": "stake",
          "amount": "10000000"
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

Using v1:

```bash
/cosmos/gov/v1/proposals/{proposal_id}/deposits
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/deposits
```

Example Output:

```bash
{
  "deposits": [
    {
      "proposal_id": "1",
      "depositor": "cosmos1..",
      "amount": [
        {
          "denom": "stake",
          "amount": "10000000"
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

#### tally

The `tally` endpoint allows users to query the tally of a given proposal.

Using legacy v1beta1:

```bash
/cosmos/gov/v1beta1/proposals/{proposal_id}/tally
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1beta1/proposals/1/tally
```

Example Output:

```bash
{
  "tally": {
    "yes": "1000000",
    "abstain": "0",
    "no": "0",
    "no_with_veto": "0"
  }
}
```

Using v1:

```bash
/cosmos/gov/v1/proposals/{proposal_id}/tally
```

Example:

```bash
curl localhost:1317/cosmos/gov/v1/proposals/1/tally
```

Example Output:

```bash
{
  "tally": {
    "yes": "1000000",
    "abstain": "0",
    "no": "0",
    "no_with_veto": "0"
  }
}
```

## Metadata

The gov module has two locations for metadata where users can provide further context about the on-chain actions they are taking. By default all metadata fields have a 255 character length field where metadata can be stored in json format, either on-chain or off-chain depending on the amount of data required. Here we provide a recommendation for the json structure and where the data should be stored. There are two important factors in making these recommendations. First, that the gov and group modules are consistent with one another, note the number of proposals made by all groups may be quite large. Second, that client applications such as block explorers and governance interfaces have confidence in the consistency of metadata structure accross chains.

### Proposal

Location: off-chain as json object stored on IPFS (mirrors [group proposal](../group/README.md#metadata))

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

Location: on-chain as json within 255 character limit (mirrors [group vote](../group/README.md#metadata))

```json
{
  "justification": "",
}
```

## Future Improvements

The current documentation only describes the minimum viable product for the
governance module. Future improvements may include:

* **`BountyProposals`:** If accepted, a `BountyProposal` creates an open
  bounty. The `BountyProposal` specifies how many Atoms will be given upon
  completion. These Atoms will be taken from the `reserve pool`. After a
  `BountyProposal` is accepted by governance, anybody can submit a
  `SoftwareUpgradeProposal` with the code to claim the bounty. Note that once a
  `BountyProposal` is accepted, the corresponding funds in the `reserve pool`
  are locked so that payment can always be honored. In order to link a
  `SoftwareUpgradeProposal` to an open bounty, the submitter of the
  `SoftwareUpgradeProposal` will use the `Proposal.LinkedProposal` attribute.
  If a `SoftwareUpgradeProposal` linked to an open bounty is accepted by
  governance, the funds that were reserved are automatically transferred to the
  submitter.
* **Complex delegation:** Delegators could choose other representatives than
  their validators. Ultimately, the chain of representatives would always end
  up to a validator, but delegators could inherit the vote of their chosen
  representative before they inherit the vote of their validator. In other
  words, they would only inherit the vote of their validator if their other
  appointed representative did not vote.
* **Better process for proposal review:** There would be two parts to
  `proposal.Deposit`, one for anti-spam (same as in MVP) and an other one to
  reward third party auditors.
