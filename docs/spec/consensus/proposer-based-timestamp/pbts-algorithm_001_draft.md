# 基于提议者的时间 - 第二部分

## 更新的共识算法

### 概述

[arXiv论文][arXiv]中的算法在评估接收到的消息的规则时，并没有明确说明这些消息是如何接收的。在我们的解决方案中，我们将明确一些消息过滤的步骤。我们假设存在消息接收步骤（在这些步骤中，消息被接收并可能被本地存储以供后续规则评估），以及处理步骤（后者大致按照arXiv论文中的伪代码描述的方式）。

与原始算法相比，`PROPOSE`消息中的`proposal`字段是一个二元组`(v, time)`，其中`v`是提议的共识值，`time`是提议的时间。

#### **[PBTS-RECEPTION-STEP.0]**

在进程`p`在本地时间`now_p`接收到消息`m`时：

- 如果消息`m`的类型是`PROPOSE`，并且满足`now_p - PRECISION <  m.time < now_p + PRECISION + MSGDELAY`，则将该消息标记为`timely`

> 如果`m`不满足约束条件，则视为`untimely`


#### **[PBTS-PROCESSING-STEP.0]**

在处理步骤中，基于存储的消息，执行算法的规则。请注意，处理步骤仅对当前高度的消息进行操作。共识算法的规则由以下对arXiv论文的更新定义。

#### 新的`StartRound`

有两个添加内容

- 如果提议者的本地时间小于上一个区块的时间，则提议者等待，直到不再满足这个条件（以确保区块时间单调递增）
- 提议者将其时间`now_p`作为提案的一部分发送

我们根据以下推理更新`PROPOSE`步骤的超时时间：

- 如果正确的提议者需要等待以确保其提议的时间大于上一个区块的`blockTime`，则它会在实时时间`blockTime + ACCURACY`发送（到这个时间点，它的本地时钟必须超过`blockTime`）
- 接收者将在`blockTime + ACCURACY + MSGDELAY`时接收到`PROPOSE`消息
- 接收者的本地时钟将是`<= blockTime + 2 * ACCURACY + MSGDELAY`
- 因此，当接收者`p`进入此轮时，它可以将超时时间设置为`waitingTime => blockTime + 2 * ACCURACY + MSGDELAY - now_p`

所以我们应该将超时设置为 `max(timeoutPropose(round_p), waitingTime)`。

> 如果将来引入了一个块延迟参数 `BLOCKDELAY`，这意味着提议者在发送 `PROPOSE` 消息之前应该等待 `now_p > blockTime + BLOCKDELAY`。
此外，需要将 `BLOCKDELAY` 添加到 `waitingTime` 中。

#### **[PBTS-ALG-STARTROUND.0]**

```go
function StartRound(round) {
  blockTime ← block time of block h_p - 1
  waitingTime ← blockTime + 2 * ACCURACY + MSGDELAY - now_p
  round_p ← round
  step_p ← propose
  if proposer(h_p, round_p) = p {
    wait until now_p > blockTime // new wait condition
    if validValue_p != nil {
      proposal ← (validValue_p, now_p) // added "now_p"
    }
    else {
      proposal ← (getValue(), now_p)   // added "now_p"
    }
    broadcast ⟨PROPOSAL, h_p, round_p, proposal, validRound_p⟩
  }
  else {
    schedule OnTimeoutPropose(h_p,round_p) to be executed after max(timeoutPropose(round_p), waitingTime)
  }
}
```

#### 替换第 22 - 27 行的新规则

- 一个验证者为共识值 `v` 和时间 `t` 进行预投票
- 代码更改为 `PROPOSAL` 消息携带时间（而 `lockedValue` 不携带时间）

#### **[PBTS-ALG-UPON-PROP.0]**

```go
upon timely(⟨PROPOSAL, h_p, round_p, (v,t), −1⟩) from proposer(h_p, round_p) while step_p = propose do {
  if valid(v) ∧ (lockedRound_p = −1 ∨ lockedValue_p = v) {
    broadcast ⟨PREVOTE, h_p, round_p, id(v,t)⟩ 
  }
  else {
    broadcast ⟨PREVOTE, h_p, round_p, nil⟩ 
  }
  step_p ← prevote
}
```

#### 替换第 28 - 33 行的新规则

如果在第 1 轮中未达成共识，在 `StartRound` 中，未来轮次的提议者可以提议相同的值，但时间不同。
因此，`PROPOSAL` 消息中的时间 `tprop` 不需要与（旧的）`PREVOTE` 消息中的时间 `tvote` 匹配。
只要值 `v` 匹配，验证者可以发送当前轮次的 `PREVOTE`。
这给出了以下规则：

#### **[PBTS-ALG-OLD-PREVOTE.0]**

```go
upon timely(⟨PROPOSAL, h_p, round_p, (v, tprop), vr⟩) from proposer(h_p, round_p) AND 2f + 1 ⟨PREVOTE, h_p, vr, id((v, tvote)⟩ 
while step_p = propose ∧ (vr ≥ 0 ∧ vr < round_p) do {
  if valid(v) ∧ (lockedRound_p ≤ vr ∨ lockedValue_p = v) {
    broadcast ⟨PREVOTE, h_p, roundp, id(v, tprop)⟩
  }
  else {
    broadcast ⟨PREVOTE, hp, roundp, nil⟩
  }
  step_p ← prevote
}
```

#### 替换第 36 - 43 行的新规则

- 如上所述，`(v,t)` 是消息的一部分，而不是 `v`
- 存储的值（即 `lockedValue`、`validValue`）不包含时间

#### **[PBTS-ALG-NEW-PREVOTE.0]**

```go
upon timely(⟨PROPOSAL, h_p, round_p, (v,t), ∗⟩) from proposer(h_p, round_p) AND 2f + 1 ⟨PREVOTE, h_p, round_p, id(v,t)⟩ while valid(v) ∧ step_p ≥ prevote for the first time do {
  if step_p = prevote {
    lockedValue_p ← v
    lockedRound_p ← round_p
    broadcast ⟨PRECOMMIT, h_p, round_p, id(v,t))⟩ 
    step_p ← precommit
  }
  validValue_p ← v 
  validRound_p ← round_p
}
```

#### 替换第 49 - 54 行的新规则

- 我们决定 `v` 以及来自提议消息的时间
- 在这里，我们不关心提议是否及时接收。

> 特别是，我们需要注意提议者只对一个正确的验证者不及时的情况。我们需要确保如果所有人都决定，这个验证者也要决定。

#### **[PBTS-ALG-DECIDE.0]**

```go
upon ⟨PROPOSAL, h_p, r, (v,t), ∗⟩ from proposer(h_p, r) AND 2f + 1 ⟨PRECOMMIT, h_p, r, id(v,t)⟩ while decisionp[h_p] = nil do {
  if valid(v) {
    decision_p [h_p] = (v,t) // decide on time too
    h_p ← h_p + 1
    reset lockedRound_p , lockedValue_p, validRound_p and validValue_p to initial values and empty message log 
    StartRound(0)
  }
}
```

**所有其他规则保持不变。**

返回[主文档][main]。

[main]: ./pbts_001_draft.md

[arXiv]: https://arxiv.org/abs/1807.04938

[tlatender]: https://github.com/tendermint/spec/blob/master/rust-spec/tendermint-accountability/README.md

[bfttime]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/spec/consensus/bft-time.md

[lcspec]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/rust-spec/lightclient/README.md


# Proposer-Based Time - Part II

## Updated Consensus Algorithm

### Outline

The algorithm in the [arXiv paper][arXiv] evaluates rules of the received messages without making explicit how these messages are received. In our solution, we will make some message filtering explicit. We will assume that there are message reception steps (where messages are received and possibly stored locally for later evaluation of rules) and processing steps (the latter roughly as described in a way similar to the pseudo code of the arXiv paper).

In contrast to the original algorithm the field `proposal` in the `PROPOSE` message is a pair `(v, time)`, of the proposed consensus value `v` and the proposed time `time`.

#### **[PBTS-RECEPTION-STEP.0]**

In the reception step at process `p` at local time `now_p`, upon receiving a message `m`:

- if the message `m` is of type `PROPOSE` and satisfies `now_p - PRECISION <  m.time < now_p + PRECISION + MSGDELAY`, then mark the message as `timely`

> if `m` does not satisfy the constraint consider it `untimely`


#### **[PBTS-PROCESSING-STEP.0]**

In the processing step, based on the messages stored, the rules of the algorithms are
executed. Note that the processing step only operates on messages
for the current height. The consensus algorithm rules are defined by the following updates to arXiv paper.

#### New `StartRound`

There are two additions

- in case the proposer's local time is smaller than the time of the previous block, the proposer waits until this is not the case anymore (to ensure the block time is monotonically increasing)
- the proposer sends its time `now_p` as part of its proposal

We update the timeout for the `PROPOSE` step according to the following reasoning:

- If a correct proposer needs to wait to make sure its proposed time is larger than the `blockTime` of the previous block, then it sends by realtime `blockTime + ACCURACY` (By this time, its local clock must exceed `blockTime`)
- the receiver will receive a `PROPOSE` message by `blockTime + ACCURACY + MSGDELAY`
- the receiver's local clock will be `<= blockTime + 2 * ACCURACY + MSGDELAY`
- thus when the receiver `p` enters this round it can set its timeout to a value `waitingTime => blockTime + 2 * ACCURACY + MSGDELAY - now_p`

So we should set the timeout to `max(timeoutPropose(round_p), waitingTime)`.

> If, in the future, a block delay parameter `BLOCKDELAY` is introduced, this means
that the proposer should wait for `now_p > blockTime + BLOCKDELAY` before sending a `PROPOSE` message.
Also, `BLOCKDELAY` needs to be added to `waitingTime`.

#### **[PBTS-ALG-STARTROUND.0]**

```go
function StartRound(round) {
  blockTime ← block time of block h_p - 1
  waitingTime ← blockTime + 2 * ACCURACY + MSGDELAY - now_p
  round_p ← round
  step_p ← propose
  if proposer(h_p, round_p) = p {
    wait until now_p > blockTime // new wait condition
    if validValue_p != nil {
      proposal ← (validValue_p, now_p) // added "now_p"
    }
    else {
      proposal ← (getValue(), now_p)   // added "now_p"
    }
    broadcast ⟨PROPOSAL, h_p, round_p, proposal, validRound_p⟩
  }
  else {
    schedule OnTimeoutPropose(h_p,round_p) to be executed after max(timeoutPropose(round_p), waitingTime)
  }
}
```

#### New Rule Replacing Lines 22 - 27

- a validator prevotes for the consensus value `v` **and** the time `t`
- the code changes as the `PROPOSAL` message carries time (while `lockedValue` does not)

#### **[PBTS-ALG-UPON-PROP.0]**

```go
upon timely(⟨PROPOSAL, h_p, round_p, (v,t), −1⟩) from proposer(h_p, round_p) while step_p = propose do {
  if valid(v) ∧ (lockedRound_p = −1 ∨ lockedValue_p = v) {
    broadcast ⟨PREVOTE, h_p, round_p, id(v,t)⟩ 
  }
  else {
    broadcast ⟨PREVOTE, h_p, round_p, nil⟩ 
  }
  step_p ← prevote
}
```

#### New Rule Replacing Lines 28 - 33

In case consensus is not reached in round 1, in `StartRound` the proposer of future rounds may propose the same value but with a different time.
Thus, the time `tprop` in the `PROPOSAL` message need not match the time `tvote` in the (old) `PREVOTE` messages.
A validator may send `PREVOTE` for the current round as long as the value `v` matches.
This gives the following rule:

#### **[PBTS-ALG-OLD-PREVOTE.0]**

```go
upon timely(⟨PROPOSAL, h_p, round_p, (v, tprop), vr⟩) from proposer(h_p, round_p) AND 2f + 1 ⟨PREVOTE, h_p, vr, id((v, tvote)⟩ 
while step_p = propose ∧ (vr ≥ 0 ∧ vr < round_p) do {
  if valid(v) ∧ (lockedRound_p ≤ vr ∨ lockedValue_p = v) {
    broadcast ⟨PREVOTE, h_p, roundp, id(v, tprop)⟩
  }
  else {
    broadcast ⟨PREVOTE, hp, roundp, nil⟩
  }
  step_p ← prevote
}
```

#### New Rule Replacing Lines 36 - 43

- As above, in the following `(v,t)` is part of the message rather than `v`
- the stored values (i.e., `lockedValue`, `validValue`) do not contain the time

#### **[PBTS-ALG-NEW-PREVOTE.0]**

```go
upon timely(⟨PROPOSAL, h_p, round_p, (v,t), ∗⟩) from proposer(h_p, round_p) AND 2f + 1 ⟨PREVOTE, h_p, round_p, id(v,t)⟩ while valid(v) ∧ step_p ≥ prevote for the first time do {
  if step_p = prevote {
    lockedValue_p ← v
    lockedRound_p ← round_p
    broadcast ⟨PRECOMMIT, h_p, round_p, id(v,t))⟩ 
    step_p ← precommit
  }
  validValue_p ← v 
  validRound_p ← round_p
}
```

#### New Rule Replacing Lines 49 - 54

- we decide on `v` as well as on the time from the proposal message
- here we do not care whether the proposal was received timely.

> In particular we need to take care of the case where the proposer is untimely to one correct validator only. We need to ensure that this validator decides if all decide.

#### **[PBTS-ALG-DECIDE.0]**

```go
upon ⟨PROPOSAL, h_p, r, (v,t), ∗⟩ from proposer(h_p, r) AND 2f + 1 ⟨PRECOMMIT, h_p, r, id(v,t)⟩ while decisionp[h_p] = nil do {
  if valid(v) {
    decision_p [h_p] = (v,t) // decide on time too
    h_p ← h_p + 1
    reset lockedRound_p , lockedValue_p, validRound_p and validValue_p to initial values and empty message log 
    StartRound(0)
  }
}
```

**All other rules remains unchanged.**

Back to [main document][main].

[main]: ./pbts_001_draft.md

[arXiv]: https://arxiv.org/abs/1807.04938

[tlatender]: https://github.com/tendermint/spec/blob/master/rust-spec/tendermint-accountability/README.md

[bfttime]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/spec/consensus/bft-time.md

[lcspec]: https://github.com/tendermint/spec/blob/439a5bcacb5ef6ef1118566d7b0cd68fff3553d4/rust-spec/lightclient/README.md
