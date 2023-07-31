# BFT 时间

Tendermint 提供了一种确定性的拜占庭容错时间源。Tendermint 中的时间是通过区块头的 Time 字段来定义的。

它满足以下属性：

- 时间单调性：时间是单调递增的，即给定高度为 h1 的区块头 H1 和高度为 `h2 = h1 + 1` 的区块头 H2，有 `H1.Time < H2.Time`。
- 时间有效性：给定形成 `block.LastCommit` 字段的一组 Commit 投票，区块头的 Time 字段的有效值范围仅由正确进程发送的 Precommit 消息（来自 LastCommit 字段）定义，即有缺陷的进程不能任意增加 Time 值。

在 Tendermint 的上下文中，时间的类型是 int64，表示以毫秒为单位的 UNIX 时间，即自1970年1月1日以来的毫秒数。在定义需要由 Tendermint 共识协议强制执行的规则之前，以便满足上述属性，我们引入以下定义：

- Commit 的中位数等于 Vote 消息的 Vote.Time 字段的中位数，其中 Vote.Time 的值按照进程的投票权重计数。在 Tendermint 中，投票权重不均匀（一个进程一票），一个投票消息实际上是相同投票的聚合器，其数量等于投票该投票消息的进程的投票权重。

让我们考虑以下示例：

- 我们有四个进程 p1、p2、p3 和 p4，其投票权重分别为 (p1, 23)、(p2, 27)、(p3, 10) 和 (p4, 10)。总投票权重为 70（`N = 3f+1`，其中 `N` 是总投票权重，`f` 是有缺陷进程的最大投票权重），因此我们假设有缺陷的进程最多具有 23 的投票权重。
此外，我们在某个 LastCommit 字段中有以下投票消息（我们忽略除 Time 字段之外的所有字段）：
    - (p1, 100)、(p2, 98)、(p3, 1000)、(p4, 500)。我们假设 p3 和 p4 是有缺陷的进程。假设 `block.LastCommit` 消息包含了进程 p2、p3 和 p4 的投票。中位数的选择方式如下：
    值 98 被计数了 27 次，值 1000 被计数了 10 次，值 500 也被计数了 10 次。因此，中位数的值将是 98。无论我们选择哪个具有至少 `2f+1` 投票权重的消息集合，中位数的值始终在正确进程发送的值之间。

我们通过以下规则确保时间单调性和时间有效性属性：

- 让 rs 表示某个进程的 `RoundState`（共识内部状态）。那么
`rs.ProposalBlock.Header.Time == median(rs.LastCommit) &&
rs.Proposal.Timestamp == rs.ProposalBlock.Header.Time`。

- 此外，在创建 `vote` 消息时，应满足以下规则以确定 `vote.Time` 字段：

    - 如果 `rs.LockedBlock` 已定义，则
    `vote.Time = max(rs.LockedBlock.Timestamp + time.Millisecond, time.Now())`，其中 `time.Now()`
        表示本地 Unix 时间（以毫秒为单位）

    - 否则，如果 `rs.Proposal` 已定义，则
    `vote.Time = max(rs.Proposal.Timestamp + time.Millisecond, time.Now())`，

    - 否则，`vote.Time = time.Now())`。在这种情况下，投票是针对 `nil` 的，因此不会被考虑在下一个区块的时间戳中。


---
order: 2
---
# BFT Time

Tendermint provides a deterministic, Byzantine fault-tolerant, source of time.
Time in Tendermint is defined with the Time field of the block header.

It satisfies the following properties:

- Time Monotonicity: Time is monotonically increasing, i.e., given
a header H1 for height h1 and a header H2 for height `h2 = h1 + 1`, `H1.Time < H2.Time`.
- Time Validity: Given a set of Commit votes that forms the `block.LastCommit` field, a range of
valid values for the Time field of the block header is defined only by  
Precommit messages (from the LastCommit field) sent by correct processes, i.e.,
a faulty process cannot arbitrarily increase the Time value.  

In the context of Tendermint, time is of type int64 and denotes UNIX time in milliseconds, i.e.,
corresponds to the number of milliseconds since January 1, 1970. Before defining rules that need to be enforced by the
Tendermint consensus protocol, so the properties above holds, we introduce the following definition:

- median of a Commit is equal to the median of `Vote.Time` fields of the `Vote` messages,
where the value of `Vote.Time` is counted number of times proportional to the process voting power. As in Tendermint
the voting power is not uniform (one process one vote), a vote message is actually an aggregator of the same votes whose
number is equal to the voting power of the process that has casted the corresponding votes message.

Let's consider the following example:

- we have four processes p1, p2, p3 and p4, with the following voting power distribution (p1, 23), (p2, 27), (p3, 10)
and (p4, 10). The total voting power is 70 (`N = 3f+1`, where `N` is the total voting power, and `f` is the maximum voting
power of the faulty processes), so we assume that the faulty processes have at most 23 of voting power.
Furthermore, we have the following vote messages in some LastCommit field (we ignore all fields except Time field):
    - (p1, 100), (p2, 98), (p3, 1000), (p4, 500). We assume that p3 and p4 are faulty processes. Let's assume that the
      `block.LastCommit` message contains votes of processes p2, p3 and p4. Median is then chosen the following way:
      the value 98 is counted 27 times, the value 1000 is counted 10 times and the value 500 is counted also 10 times.
      So the median value will be the value 98. No matter what set of messages with at least `2f+1` voting power we
      choose, the median value will always be between the values sent by correct processes.

We ensure Time Monotonicity and Time Validity properties by the following rules:
  
- let rs denotes `RoundState` (consensus internal state) of some process. Then
`rs.ProposalBlock.Header.Time == median(rs.LastCommit) &&
rs.Proposal.Timestamp == rs.ProposalBlock.Header.Time`.

- Furthermore, when creating the `vote` message, the following rules for determining `vote.Time` field should hold:

    - if `rs.LockedBlock` is defined then
    `vote.Time = max(rs.LockedBlock.Timestamp + time.Millisecond, time.Now())`, where `time.Now()`
        denotes local Unix time in milliseconds

    - else if `rs.Proposal` is defined then
    `vote.Time = max(rs.Proposal.Timestamp + time.Millisecond,, time.Now())`,

    - otherwise, `vote.Time = time.Now())`. In this case vote is for `nil` so it is not taken into account for
    the timestamp of the next block.
