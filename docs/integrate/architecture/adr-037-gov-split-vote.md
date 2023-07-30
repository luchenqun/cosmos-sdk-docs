# ADR 037: 治理分割投票

## 更新日志

* 2020/10/28: 初始草案

## 状态

已接受

## 摘要

本ADR定义了对治理模块的修改，允许质押者将他们的投票分成多个选项。例如，它可以使用其70%的投票权力投票赞成，使用其30%的投票权力投票反对。

## 背景

目前，一个地址只能选择一个选项（赞成/反对/弃权/否决），并将其全部投票权力用于该选择。

然而，拥有该地址的实体往往可能不是单个个体。例如，一个公司可能有不同的利益相关者希望做出不同的投票，因此允许他们分割他们的投票权力是有意义的。另一个例子是交易所。许多中心化交易所经常在其托管中质押其用户的代币的一部分。目前，他们无法进行“透传投票”，即赋予用户对其代币的投票权。然而，通过这个系统，交易所可以对其用户进行投票偏好的调查，然后按照调查结果在链上按比例进行投票。

## 决策

我们修改投票结构体如下：

```go
type WeightedVoteOption struct {
  Option string
  Weight sdk.Dec
}

type Vote struct {
  ProposalID int64
  Voter      sdk.Address
  Options    []WeightedVoteOption
}
```

为了向后兼容，我们引入`MsgVoteWeighted`，同时保留`MsgVote`。

```go
type MsgVote struct {
  ProposalID int64
  Voter      sdk.Address
  Option     Option
}

type MsgVoteWeighted struct {
  ProposalID int64
  Voter      sdk.Address
  Options    []WeightedVoteOption
}
```

`MsgVoteWeighted`结构体的`ValidateBasic`将要求：

1. 所有比例之和等于1.0
2. 没有重复的选项

治理计票函数将遍历投票中的所有选项，并将投票者的投票权力乘以该选项的比例，将结果添加到计票中。

```go
tally() {
    results := map[types.VoteOption]sdk.Dec

    for _, vote := range votes {
        for i, weightedOption := range vote.Options {
            results[weightedOption.Option] += getVotingPower(vote.voter) * weightedOption.Weight
        }
    }
}
```

创建多选项投票的CLI命令如下：

```shell
simd tx gov vote 1 "yes=0.6,no=0.3,abstain=0.05,no_with_veto=0.05" --from mykey
```

要创建单选项投票，用户可以选择以下任一方式：

```shell
simd tx gov vote 1 "yes=1" --from mykey
```

或者

```shell
simd tx gov vote 1 yes --from mykey
```

以保持向后兼容。

## 影响

### 向后兼容性

* 以前的VoteMsg类型将保持不变，因此客户端不需要更新其过程，除非他们想支持WeightedVoteMsg功能。
* 当从状态中查询Vote结构时，其结构将不同，因此希望显示所有选民及其相应投票的客户端必须处理新格式以及单个选民可以拥有分割投票的事实。
* 查询tally函数的结果应对客户端具有相同的API。

### 正面

* 可以使代表多个利益相关者的地址的投票过程更准确，通常是一些最大的地址之一。

### 负面

* 比简单投票更复杂，因此可能更难向用户解释。然而，这主要是因为该功能是选择性的。

### 中立

* 对治理计数函数的相对较小的更改。


# ADR 037: Governance split votes

## Changelog

* 2020/10/28: Intial draft

## Status

Accepted

## Abstract

This ADR defines a modification to the governance module that would allow a staker to split their votes into several voting options. For example, it could use 70% of its voting power to vote Yes and 30% of its voting power to vote No.

## Context

Currently, an address can cast a vote with only one options (Yes/No/Abstain/NoWithVeto) and use their full voting power behind that choice.

However, often times the entity owning that address might not be a single individual.  For example, a company might have different stakeholders who want to vote differently, and so it makes sense to allow them to split their voting power.  Another example use case is exchanges.  Many centralized exchanges often stake a portion of their users' tokens in their custody.  Currently, it is not possible for them to do "passthrough voting" and giving their users voting rights over their tokens.  However, with this system, exchanges can poll their users for voting preferences, and then vote on-chain proportionally to the results of the poll.

## Decision

We modify the vote structs to be

```go
type WeightedVoteOption struct {
  Option string
  Weight sdk.Dec
}

type Vote struct {
  ProposalID int64
  Voter      sdk.Address
  Options    []WeightedVoteOption
}
```

And for backwards compatibility, we introduce `MsgVoteWeighted` while keeping `MsgVote`.

```go
type MsgVote struct {
  ProposalID int64
  Voter      sdk.Address
  Option     Option
}

type MsgVoteWeighted struct {
  ProposalID int64
  Voter      sdk.Address
  Options    []WeightedVoteOption
}
```

The `ValidateBasic` of a `MsgVoteWeighted` struct would require that

1. The sum of all the Rates is equal to 1.0
2. No Option is repeated

The governance tally function will iterate over all the options in a vote and add to the tally the result of the voter's voting power * the rate for that option.

```go
tally() {
    results := map[types.VoteOption]sdk.Dec

    for _, vote := range votes {
        for i, weightedOption := range vote.Options {
            results[weightedOption.Option] += getVotingPower(vote.voter) * weightedOption.Weight
        }
    }
}
```

The CLI command for creating a multi-option vote would be as such:

```shell
simd tx gov vote 1 "yes=0.6,no=0.3,abstain=0.05,no_with_veto=0.05" --from mykey
```

To create a single-option vote a user can do either

```shell
simd tx gov vote 1 "yes=1" --from mykey
```

or

```shell
simd tx gov vote 1 yes --from mykey
```

to maintain backwards compatibility.

## Consequences

### Backwards Compatibility

* Previous VoteMsg types will remain the same and so clients will not have to update their procedure unless they want to support the WeightedVoteMsg feature.
* When querying a Vote struct from state, its structure will be different, and so clients wanting to display all voters and their respective votes will have to handle the new format and the fact that a single voter can have split votes.
* The result of querying the tally function should have the same API for clients.

### Positive

* Can make the voting process more accurate for addresses representing multiple stakeholders, often some of the largest addresses.

### Negative

* Is more complex than simple voting, and so may be harder to explain to users.  However, this is mostly mitigated because the feature is opt-in.

### Neutral

* Relatively minor change to governance tally function.
