# IBC上下文中的分叉检测要求

## 关于IBC的必要知识

以下是我从以下链接中提取出来的与IBC相关的内容：

<https://github.com/cosmos/ics/tree/master/spec/ics-002-client-semantics>

### 组件及其接口

#### Tendermint区块链

> 我假设你知道这是什么。

#### IBC/Tendermint对应关系

| IBC术语 | Tendermint-RS规范术语 | 备注 |
|----------|-------------------------| --------|
| `CommitmentRoot` | AppState | 应用哈希 |
| `ConsensusState` | Lightblock | 并非所有字段都在此。`NextValidator`绝对是必需的 |
| `ClientState` | 最新的轻区块 + 配置参数（例如，信任期限 + `frozenHeight`） | 缺少`NextValidators`；`proofSpecs`是什么？|
| `frozenHeight` | 分叉的高度 | 在检测到分叉时设置 |
| "would-have-been-fooled" | 轻节点分叉检测 | 轻节点可以向IBC组件提交分叉证明以停止它 |
| `Height` | （无纪元） | 词典顺序中的（纪元，高度）对（`compare`） |
| `Header` | ~签名头 | 验证者集合明确（无哈希）；缺少`nextValidators` |
| `Evidence` | 待定 | 定义不清楚“轻客户端将被视为有效”。数据结构需要更改 |
| `verify` | `ValidAndVerified` | 签名不完全匹配（ClientState与LightBlock）+ 在`checkMisbehaviourAndUpdateState`中不清楚它是使用跟踪还是一步到位的h1和h2 |

#### 一些IBC链接

- [QueryConsensusState](https://github.com/cosmos/cosmos-sdk/blob/2651427ab4c6ea9f81d26afa0211757fc76cf747/x/ibc/02-client/client/utils/utils.go#L68)
  
#### ICS 007中所需的更改

- `assert(height > 0)` 在`initialise`的定义中与*(纪元，高度)*对的定义不匹配。
  
- `initialise` 需要根据新的数据结构进行更新

- `clientState.frozenHeight` 的语义在文档中似乎不完全一致。例如，在`checkMisbehaviourAndUpdateState`中，`min` 需要在可选值上进行定义。此外，如果你已经被冻结，为什么还要接受更多的证据。

- `checkValidityAndUpdateState`
    - `verify`: 需要澄清的是，checkValidityAndUpdateState 不执行"二分法"（如当前文本中所暗示），而是执行一步"跳过验证"，称为 `ValidAndVerified`
    - `assert (header.height > clientState.latestHeight)`: 不能安装旧的头部。这可能没问题，但我们需要检查与错误行为的相互作用
    - 根据完整的数据结构更新 clienstState

- `checkMisbehaviourAndUpdateState`: 由于 evidence 将包含一个或两个跟踪，使用 verify 的断言将需要更改。

- ICS 002 对于 `queryChainConsensusState` 表示："注意，通过高度（而不仅仅是当前共识状态）检索过去的共识状态是方便的，但不是必需的。" 对于 Tendermint 分叉检测，这似乎是必要的。

- `Header` 应该变成一个 lightblock

- `Evidence` 应该变成 `LightNodeProofOfFork` [LCV-DATA-POF.1]

- `upgradeClientState` 的语义是什么（特别是 `height` 是做什么的?）。

- 需要调整 `checkMisbehaviourAndUpdateState(cs: ClientState, PoF: LightNodeProofOfFork)`

#### 处理程序

一个区块链运行一个被动地收集关于其他区块链的信息的 **处理程序**。它可以被看作是一个接受输入事件的状态机。

- 状态包括一个 lightstore（我猜在 IBC 中称为 `ConsensusState`）

- 以下函数用于将头部传递给处理程序

```go
type checkValidityAndUpdateState = (Header) => Void
```

  对于 Tendermint，它将执行 `ValidandVerified`，即进行信任期检查和 +1/3 检查（对于连续的头部是 +2/3）。如果验证了一个头部，它将将其添加到其 lightstore 中；如果未通过验证，则将其丢弃。现在它只接受比最新头部更近的头部，并丢弃旧的头部或无法验证的头部。

> 上述段落概述了我认为 `checkValidityAndUpdateState` 的当前逻辑。它可能会有所变化。例如，维护一个具有状态（未验证、已验证）的 lightstore。

- 以下函数用于将“证据”（我们最终需要明确）传递给处理程序

```go
type checkMisbehaviourAndUpdateState = (bytes) => Void
```

我们需要设计这个函数，以及处理程序可以用来检查是否存在某种不当行为（分叉）的数据，例如标记一种情况并停止协议。

- 以下函数用于查询轻存储（`ConsensusState`）

```go
type queryChainConsensusState = (height: uint64) => ConsensusState
```

#### 中继器

- 活动组件称为**中继器**。

- 中继器包含两个（或更多？）区块链的轻客户端。

- 中继器将头部和数据发送给处理程序，以调用`checkValidityAndUpdateState`和`checkMisbehaviourAndUpdateState`。它还可以查询`queryChainConsensusState`。

- 多个中继器可以与一个处理程序通信。某些中继器可能存在故障。我们假设至少存在一个正确的中继器。

## 非正式问题陈述：IBC中的分叉检测

### 中继器要求：向处理程序提供证据

- 中继器应向处理程序提供证据，证明存在分叉。

- 中继器可以读取处理程序的共识状态。因此，中继器可以向处理程序提供处理程序需要检测分叉所需的精确信息。需要明确指定这些信息是什么。

- 这些信息取决于处理程序进行的验证。可能需要提供一个二分证明（轻区块列表），以便处理程序可以基于其本地轻存储验证与本地轻存储中的头部*h*冲突的头部*h'*，即*h != h'*且*h.Height = h'.Height*

### 中继器要求：分叉检测

假设在链A上存在一个分叉。中继器可以通过以下两种方式发现：

1. 由于中继器包含链A的轻客户端，它还包括一个可以检测到分叉的分叉检测器。

2. 中继器还可以通过观察链A上的处理程序（在链B上）与中继器所在分支不同来检测到分叉。

- 在这两种检测场景中，中继器应该向链A的全节点提交证据，以便在出现分叉时。由于我们假设全节点拥有完整的区块列表，因此只需发送“Bucky的证据”（<https://github.com/tendermint/tendermint/issues/5083>），即：
    - 来自不同分支的两个轻区块 +
    - 一个轻区块（可能只是一个高度），可以验证这两个区块。

- 在第二种场景中，中继器必须向链B上的A处理程序提供关于A上的分叉的证明，以便链B可以相应地做出反应。

### 处理程序要求

- 可能有许多中继器，有些正确，有些有故障。

- 处理程序不能信任中继器提供的信息，而必须进行验证
  (Доверя́й, но проверя́й)。

- 在出现分叉的情况下，我们接受处理程序临时存储头部（标记为已验证）。

- 最终，处理程序应该通过某个中继器的通知
  (`checkMisbehaviourAndUpdateState`)
  来确认已经验证了来自分叉的头部。然后处理程序应该根据IBC在这种情况下的要求采取相应的措施（停止？）

### 处理程序要求中的挑战

- 处理程序和中继器在不同的轻存储上工作。原则上，轻存储在任何高度上不需要交集。

- 如果中继器在处理程序处看到一个头部 *h*，它在本地无法验证该头部（通过`queryChainConsensusState`），则中继器需要验证该头部。如果它无法基于已下载和验证（可信任？）的轻区块在本地进行验证，可能需要使用`VerifyToTarget`（二分法）。为了调用`VerifyToTarget`，我们可能需要将 *h* 保留在轻存储中。如果验证失败，我们需要下载高度为 *h.Height* 的“替代”头部，以生成处理程序的证据。

- 我们必须明确指定`queryChainConsensusState`返回的内容。它不能是完整的轻存储。只返回最后一个头部是否足够？

- 我们希望假设每隔一段时间（小于信任期限）一个正确的中继器会检查处理程序是否与中继器处于不同的分支。并且我们希望这足以满足处理程序的要求。

- 如果一个正确的中继器基于一个具有*可信*状态的轻客户端，那么正确性论证将变得容易，即一个轻客户端永远不会改变对可信的看法。然后，如果这样一个正确的中继器与处理程序进行检查，它将检测到分叉并及时采取行动。

- 如果轻客户端不提供这个接口，在分叉的情况下，我们需要假设一个正确的中继器位于与处理程序不同的分支上，并且我们需要这样一个中继器不要太晚进行检查。此外，如果中继器的轻客户端被迫回滚其轻存储，会发生什么？它是否必须重新检查所有处理程序？

## 关于事物的相互关联性

在所谓的“分叉问责”的更广泛讨论中，存在几个子问题

- 分叉检测

- 证据创建和提交

- 隔离行为不端的节点（并向ABCI报告以进行惩罚）

### 分叉检测

初步规范 ./detection.md 正式化了分叉的概念。大致上，如果同一高度存在两个冲突的头部，而且这两个头部都得到了有债权的全节点的支持（这些全节点在近期内曾经是验证者，即在信任期内），那么就存在一个分叉。我们区分*链上分叉*，其中两个冲突的块都由该高度的+2/3的验证者签名，以及*轻客户端分叉*，其中一个冲突的头部不是由当前高度的+2/3的验证者签名，而是由某个较小高度的+1/3的验证者签名。

原则上，任何人都可以检测到分叉

- ./detection 讨论了以轻节点为重点的 Tendermint 轻客户端。一个中继器运行这样的轻客户端，可以通过这种方式检测到分叉

- 在 IBC 中，一个中继器可以看到处理程序位于冲突分支上
    - 中继器应该向处理程序提供必要的信息，以便它可以停止
    - 中继器应该向全节点报告分叉

### 证据创建和提交

- 从中继器发送给处理程序的信息可以称为证据，但这可能是一个不好的想法，因为发送给全节点的信息也可以称为证据。但是，这些证据可能还不足够，因为全节点可能需要运行“分叉问责”协议来生成以共识消息形式的证据。因此，也许我们应该为以下内容引入不同的术语：

- 处理程序的分叉证明（基本上由轻区块组成）
- 全节点的分叉证明（基本上由（较少的）轻区块组成）
- 不当行为的证明（共识消息）

### 隔离不当行为的节点

- 这是全节点的工作。

- 在将来可能是主观的：协议取决于全节点认为是“正确”的链。现在我们假设每个全节点都在正确的链上，即链上没有分叉。

- 全节点找出哪些节点是
    - 疯狂的
    - 双重签名
    - 健忘的；**使用挑战响应协议**

- 我们不惩罚“幻影”验证者
    - 目前我们将幻影验证者理解为
        - 在其不在验证者集中的高度上签署区块
        - 该节点不是用于支持头部的前一个验证者中的+1/3。我们是否将验证者称为幻影可能是主观的，并取决于我们检查的头部。他们的形式化实际上似乎不太清楚。
    - 他们只能在存在+1/3个故障验证者时才能做些什么，这些验证者可能是疯狂的、双重签名的或健忘的。
    - ABCI要求我们只报告已绑定的验证者。因此，如果一个节点是“幻影”，我们需要检查该节点是否已绑定，这目前是昂贵的，因为它需要检查过去三周的区块。
    - 在将来，通过状态同步，一个正确的节点可能会被错误的节点说服它在验证者集中。然后，它可能会出现“幻影”，尽管它的行为是正确的。

## 下一步

> 以下内容基于我对IBC工作状态的有限了解。其中一些/大部分可能已经存在，我们只需要将所有内容整合在一起。

- “全节点的分叉证明”定义了分叉检测和不当行为隔离之间的清晰接口。因此，它应该由协议（轻客户端、中继器）生成。所以我们应该首先解决这个问题。

- 鉴于没有轻客户端架构规范的问题，对于中继器，我们应该从这里开始。例如：

    - 中继器为两个链运行轻客户端
    - 中继器定期查询处理程序的共识状态
    - 中继器需要检查共识状态
        - 这涉及本地检查
        - 这涉及调用轻客户端
    - 中继器使用轻客户端进行 IBC 业务（通道、数据包、连接等）
    - 中继器向处理程序和全节点提交分叉证明

> 这个列表肯定不完整。我认为这部分（也许全部）是由 Anca 最近提出的内容所覆盖的。

我们需要定义对这些组件的期望

- 对于中继器与处理程序交互的部分，我们需要修复接口和处理程序的功能

- 我们为这些组件编写规范。


# Requirements for Fork Detection in the IBC Context

## What you need to know about IBC

In the following, I distilled what I considered relevant from

<https://github.com/cosmos/ics/tree/master/spec/ics-002-client-semantics>

### Components and their interface

#### Tendermint Blockchains

> I assume you know what that is.

#### An IBC/Tendermint correspondence

| IBC Term | Tendermint-RS Spec Term | Comment |
|----------|-------------------------| --------|
| `CommitmentRoot` | AppState | app hash |
| `ConsensusState` | Lightblock | not all fields are there. NextValidator is definitly needed |
| `ClientState` | latest light block + configuration parameters (e.g., trusting period + `frozenHeight` |  NextValidators missing; what is `proofSpecs`?|
| `frozenHeight` | height of fork | set when a fork is detected |
| "would-have-been-fooled" | light node fork detection | light node may submit proof of fork to IBC component to halt it |
| `Height` | (no epochs) | (epoch,height) pair in lexicographical order (`compare`) |
| `Header` | ~signed header | validatorSet explicit (no hash); nextValidators missing |
| `Evidence` | t.b.d. | definition unclear "which the light client would have considered valid". Data structure will need to change |
| `verify` | `ValidAndVerified` | signature does not match perfectly (ClientState vs. LightBlock) + in `checkMisbehaviourAndUpdateState` it is unclear whether it uses traces or goes to h1 and h2 in one step |

#### Some IBC links

- [QueryConsensusState](https://github.com/cosmos/cosmos-sdk/blob/2651427ab4c6ea9f81d26afa0211757fc76cf747/x/ibc/02-client/client/utils/utils.go#L68)
  
#### Required Changes in ICS 007

- `assert(height > 0)` in definition of `initialise` doesn't match
  definition of `Height` as *(epoch,height)* pair.
  
- `initialise` needs to be updated to new data structures

- `clientState.frozenHeight` semantics seem not totally consistent in
  document. E.g., `min` needs to be defined over optional value in
  `checkMisbehaviourAndUpdateState`. Also, if you are frozen, why do
  you accept more evidence.

- `checkValidityAndUpdateState`
    - `verify`: it needs to be clarified that checkValidityAndUpdateState
      does not perform "bisection" (as currently hinted in the text) but
   performs a single step of "skipping verification", called,
      `ValidAndVerified`
    - `assert (header.height > clientState.latestHeight)`: no old
      headers can be installed. This might be OK, but we need to check
      interplay with misbehavior
    - clienstState needs to be updated according to complete data
      structure

- `checkMisbehaviourAndUpdateState`: as evidence will contain a trace
  (or two), the assertion that uses verify will need to change.

- ICS 002 states w.r.t. `queryChainConsensusState` that "Note that
  retrieval of past consensus states by height (as opposed to just the
  current consensus state) is convenient but not required." For
  Tendermint fork detection, this seems to be a necessity.
  
- `Header` should become a lightblock

- `Evidence` should become `LightNodeProofOfFork` [LCV-DATA-POF.1]

- `upgradeClientState` what is the semantics (in particular what is
  `height` doing?).
  
- `checkMisbehaviourAndUpdateState(cs: ClientState, PoF:
  LightNodeProofOfFork)` needs to be adapted

#### Handler

A blockchain runs a **handler** that passively collects information about
  other blockchains. It can be thought of a state machine that takes
  input events.
  
- the state includes a lightstore (I guess called `ConsensusState`
  in IBC)

- The following function is used to pass a header to a handler
  
```go
type checkValidityAndUpdateState = (Header) => Void
```

  For Tendermint, it will perform
  `ValidandVerified`, that is, it does the trusting period check and the
  +1/3 check (+2/3 for sequential headers).
  If it verifies a header, it adds it to its lightstore,
  if it does not pass verification it drops it.
  Right now it only accepts a header more recent then the latest
  header,
  and drops older
  ones or ones that could not be verified.

> The above paragraph captures what I believe what is the current
  logic of `checkValidityAndUpdateState`. It may be subject to
  change. E.g., maintain a lightstore with state (unverified, verified)

- The following function is used to pass  "evidence" (this we
  will need to make precise eventually) to a handler
  
```go
type checkMisbehaviourAndUpdateState = (bytes) => Void
```

  We have to design this, and the data that the handler can use to
  check that there was some misbehavior (fork) in order react on
  it, e.g., flagging a situation and
  stop the protocol.

- The following function is used to query the light store (`ConsensusState`)

```go
type queryChainConsensusState = (height: uint64) => ConsensusState
```

#### Relayer

- The active components are called **relayer**.

- a relayer contains light clients to two (or more?) blockchains

- the relayer send headers and data to the handler to invoke
  `checkValidityAndUpdateState` and
  `checkMisbehaviourAndUpdateState`. It may also query
  `queryChainConsensusState`.
  
- multiple relayers may talk to one handler. Some relayers might be
  faulty. We assume existence of at least single correct relayer.

## Informal Problem Statement: Fork detection in IBC
  
### Relayer requirement: Evidence for Handler

- The relayer should provide the handler with
  "evidence" that there was a fork.
  
- The relayer can read the handler's consensus state. Thus the relayer can
  feed the handler precisely the information the handler needs to detect a
  fork.
  What is this
  information needs to be specified.
  
- The information depends on the verification the handler does. It
  might be necessary to provide a bisection proof (list of
  lightblocks) so that the handler can verify based on its local
  lightstore a header *h* that is conflicting with a header *h'* in the
  local lightstore, that is, *h != h'* and *h.Height = h'.Height*
  
### Relayer requirement: Fork detection

Let's assume there is a fork at chain A. There are two ways the
relayer can figure that out:

1. as the relayer contains a light client for A, it also includes a fork
   detector that can detect a fork.

2. the relayer may also detect a fork by observing that the
   handler for chain A (on chain B)
   is on a different branch than the relayer

- in both detection scenarios, the relayer should submit evidence to
  full nodes of chain A where there is a fork. As we assume a fullnode
  has a complete list of blocks, it is sufficient to send "Bucky's
  evidence" (<https://github.com/tendermint/tendermint/issues/5083>),
  that is,
    - two lightblocks from different branches +
    - a lightblock (perhaps just a height) from which both blocks
    can be verified.
  
- in the scenario 2., the relayer must feed the A-handler (on chain B)
  a proof of a fork on A so that chain B can react accordingly
  
### Handler requirement
  
- there are potentially many relayers, some correct some faulty

- a handler cannot trust the information provided by the relayer,
  but must verify
  (Доверя́й, но проверя́й)

- in case of a fork, we accept that the handler temporarily stores
  headers (tagged as verified).
  
- eventually, a handler should be informed
 (`checkMisbehaviourAndUpdateState`)
 by some relayer that it has
  verified a header from a fork. Then the handler should do what is
 required by IBC in this case (stop?)

### Challenges in the handler requirement

- handlers and relayers work on different lightstores. In principle
  the lightstore need not intersect in any heights a priori

- if a relayer  sees a header *h* it doesn't know at a handler (`queryChainConsensusState`), the
  relayer needs to
  verify that header. If it cannot do it locally based on downloaded
  and verified (trusted?) light blocks, it might need to use
  `VerifyToTarget` (bisection). To call `VerifyToTarget` we might keep
  *h* in the lightstore. If verification fails, we need to download the
  "alternative" header of height *h.Height* to generate evidence for
  the handler.
  
- we have to specify what precisely `queryChainConsensusState`
  returns. It cannot be the complete lightstore. Is the last header enough?

- we would like to assume that every now and then (smaller than the
  trusting period) a correct relayer checks whether the handler is on a
  different branch than the relayer.
  And we would like that this is enough to achieve
  the Handler requirement.
  
    - here the correctness argument would be easy if a correct relayer is
     based on a light client with a *trusted* state, that is, a light
     client who never changes its opinion about trusted. Then if such a
     correct relayer checks-in with a handler, it will detect a fork, and
     act in time.

    - if the light client does not provide this interface, in the case of
     a fork, we need some assumption about a correct relayer being on a
     different branch than the handler, and we need such a relayer to
  check-in not too late. Also
     what happens if the relayer's light client is forced to roll-back
     its lightstore?
     Does it have to re-check all handlers?

## On the interconnectedness of things

In the broader discussion of so-called "fork accountability" there are
several subproblems

- Fork detection

- Evidence creation and submission

- Isolating misbehaving nodes (and report them for punishment over abci)

### Fork detection

The preliminary specification ./detection.md formalizes the notion of
a fork. Roughly, a fork exists if there are two conflicting headers
for the same height, where both are supported by bonded full nodes
(that have been validators in the near past, that is, within the
trusting period). We distinguish between *fork on the chain* where two
conflicting blocks are signed by +2/3 of the validators of that
height, and a *light client fork* where one of the conflicting headers
is not signed by  +2/3 of the current height, but by +1/3 of the
validators of some smaller height.

In principle everyone can detect a fork

- ./detection talks about the Tendermint light client with a focus on
  light nodes. A relayer runs such light clients and may detect
  forks in this way

- in IBC, a relayer can see that a handler is on a conflicting branch
    - the relayer should feed the handler the necessary information so
      that it can halt
    - the relayer should report the fork to a full node

### Evidence creation and submission

- the information sent from the relayer to the handler could be called
  evidence, but this is perhaps a bad idea because the information sent to a
  full node can also be called evidence. But this evidence might still
  not be enough as the full node might need to run the "fork
  accountability" protocol to generate evidence in the form of
  consensus messages. So perhaps we should
  introduce different terms for:
  
    - proof of fork for the handler (basically consisting of lightblocks)
    - proof of fork for a full node (basically consisting of (fewer) lightblocks)
    - proof of misbehavior (consensus messages)
  
### Isolating misbehaving nodes

- this is the job of a full node.

- might be subjective in the future: the protocol depends on what the
  full node believes is the "correct" chain. Right now we postulate
  that every full node is on the correct chain, that is, there is no
  fork on the chain.
  
- The full node figures out which nodes are
    - lunatic
    - double signing
    - amnesic; **using the challenge response protocol**

- We do not punish "phantom" validators
    - currently we understand a phantom validator as a node that
        - signs a block for a height in which it is not in the
          validator set
        - the node is not part of the +1/3 of previous validators that
          are used to support the header. Whether we call a validator
          phantom might be subjective and depend on the header we
          check against. Their formalization actually seems not so
          clear.
    - they can only do something if there are +1/3 faulty validators
      that are either lunatic, double signing, or amnesic.
    - abci requires that we only report bonded validators. So if a
      node is a "phantom", we would need the check whether the node is
      bonded, which currently is expensive, as it requires checking
      blocks from the last three weeks.
    - in the future, with state sync, a correct node might be
      convinced by faulty nodes that it is in the validator set. Then
      it might appear to be "phantom" although it behaves correctly

## Next steps

> The following points are subject to my limited knowledge of the
> state of the work on IBC. Some/most of it might already exist and we
> will just need to bring everything together.

- "proof of fork for a full node" defines a clean interface between
  fork detection and misbehavior isolation. So it should be produced
  by protocols (light client, the relayer). So we should fix that
  first.
  
- Given the problems of not having a light client architecture spec,
  for the relayer we should start with this. E.g.
  
    - the relayer runs light clients for two chains
    - the relayer regularly queries consensus state of a handler
    - the relayer needs to check the consensus state
        - this involves local checks
        - this involves calling the light client
    - the relayer uses the light client to do IBC business (channels,
      packets, connections, etc.)
    - the relayer submits proof of fork to handlers and full nodes

> the list is definitely not complete. I think part of this
> (perhaps all)  is
> covered by what Anca presented recently.

We will need to define what we expect from these components

- for the parts where the relayer talks to the handler, we need to fix
  the interface, and what the handler does

- we write specs for these components.
