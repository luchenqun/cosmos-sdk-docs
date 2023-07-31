# 轻客户端验证

轻客户端通过与全节点通信，实现对区块链中的[头部][TMBC-HEADER-link]的读取操作。由于一些全节点可能存在故障，因此必须以容错的方式实现此功能。

在Tendermint区块链中，验证人集合可能会随着每个新区块的产生而发生变化。质押和解绑机制引入了一个[安全模型][TMBC-FM-2THIRDS-link]：从[头部][TMBC-HEADER-link]的时间*Time*开始，对于持续时间为*TrustedPeriod*的新区块，超过三分之二的验证人是正确的。容错的读取操作是为了适应这个安全模型而设计的。

本文所解决的挑战是，轻客户端可能具有高度为*h1*的区块，并且需要读取高度大于*h1*的区块*h2*。检查从*h1*到*h2*的所有区块的头部可能会太昂贵（例如对于移动设备而言，会消耗过多的能量）。本规范试图通过利用[安全模型][TMBC-FM-2THIRDS-link]提供的保证，减少需要检查的中间区块的数量。

# 状态

## 之前的版本

- [[001_published]](./verification_001_published.md)
已经经过了彻底的审查，并且该协议已经在TLA+中进行了形式化和模型检查。

## 在此修订版中解决的问题

由于它是较大轻节点的一部分，其数据结构和函数与轻客户端的攻击检测功能进行交互。由于对轻存储的工作，以下工作已经完成：

- [轻节点的攻击检测](https://github.com/tendermint/spec/pull/164)

- IBC的攻击检测和[中继器要求](https://github.com/informalsystems/tendermint-rs/issues/497)

- 轻客户端的[监督者](https://github.com/tendermint/spec/pull/159)（也在[Rust提案](https://github.com/informalsystems/tendermint-rs/pull/509)中）

需要对LightStore公开的语义和函数进行调整。与[版本001](./verification_001_published.md)相比，我们规定了以下内容：

- `VerifyToTarget`和`Backwards`是使用单个lightblock作为根信任来调用的，与传递完整的lightstore相反。

- 在验证过程中，我们记录了每个lightblock可以使用哪个其他lightblock来进行一步验证。这是为了生成用于IBC的验证跟踪所必需的。

# 大纲

- [第一部分](#part-i---tendermint-blockchain)：介绍Tendermint区块链的相关术语。

- [第二部分](#part-ii---sequential-definition-of-the-verification-problem)：介绍轻客户端验证协议所解决的问题。
    - [验证非正式问题陈述](#Verification-Informal-Problem-statement)：面向一般受众，即希望从鸟瞰视角了解组件正在执行的工程师。
    - [顺序问题陈述](#Sequential-Problem-statement)：以其顺序形式提供问题陈述的数学定义，即忽略区块链实现的分布式方面。

- [第三部分](#part-iii---light-client-as-distributed-system)：轻客户端的分布式方面，系统假设和时间逻辑规范。

    - [激励](#incentives)：错误的全节点如何从恶意行为中受益，以及正确的全节点如何从合作中受益。
  
    - [计算模型](#Computational-Model)：时间和正确性假设。

    - [分布式问题陈述](#Distributed-Problem-Statement)：形式化安全性和活性属性的时间属性。

- [第四部分](#part-iv---light-client-verification-protocol)：协议的规范。

    - [定义](#Definitions)：描述协议使用的输入、输出、变量和辅助函数。

    - [核心验证](#core-verification)：概述解决方案的概要，并详细说明使用的函数（包括前提条件、后置条件、错误条件）。

- [活性场景](#liveness-scenarios)：轻客户端的进展严重依赖于区块链验证者集合的变化。我们讨论一些典型的场景。

- [第五部分](#part-v---supporting-the-ibc-relayer)：上述部分关注的是一个常见情况，即最后一个验证的区块高度为 *h1*，而请求的高度 *h2* 满足 *h2 > h1*。对于 IBC，存在一些情况可能不是这样。在本部分中，我们提供了一些支持的初步工作。由于 IBC 要求的细节尚不清楚，我们暂时不提供完整的规范。我们用 "Open Question" 标记需要解决的问题，以便最终确定该规范。需要注意的是，在技术上最具挑战性的情况是第四部分中指定的情况。

在本文档中，我们广泛使用标签，以便能够在未来的交流中引用假设、不变量等。在这些标签中，我们经常使用以下简写形式：

- TMBC：Tendermint 区块链
- SEQ：用于顺序规范
- LCV：轻客户端验证
- LIVE：活性
- SAFE：安全
- FUNC：函数
- INV：不变量
- A：假设

# 第一部分 - Tendermint 区块链

## 轻客户端所需的头字段

#### **[TMBC-HEADER.1]**

一组区块链交易存储在一个称为 *block* 的数据结构中，其中包含一个称为 *header* 的字段。（数据结构 *block* 的定义在[这里][block]）。由于头包含对块的相关字段的哈希，因此在本规范中，我们假设区块链是一个头的列表，而不是一个块的列表。

#### **[TMBC-HASH-UNIQUENESS.1]**

我们假设头中的每个哈希都标识其哈希的数据。因此，在本规范中，我们不区分哈希和它们所代表的数据。

#### **[TMBC-HEADER-FIELDS.2]**

头包含以下字段：

- `Height`：非负整数
- `Time`：时间（非负整数）
- `LastBlockID`：哈希值
- `LastCommit`：DomainCommit
- `Validators`：DomainVal
- `NextValidators`：DomainVal
- `Data`：DomainTX
- `AppState`：DomainApp
- `LastResults`：DomainRes

[block]: https://example.com/block

#### **[TMBC-SEQ.1]**

Tendermint区块链是一个头部的链表。

#### **[TMBC-VALIDATOR-PAIR.1]**

给定一个全节点，*验证器对*是一个*(peerID, voting_power)*的对，其中

- *peerID*是全节点的PeerID（公钥），
- *voting_power*是一个整数（表示全节点在某个共识实例中的投票权重）。

> 在Golang实现中，*验证器对*的数据类型被称为`Validator`。

#### **[TMBC-VALIDATOR-SET.1]**

*验证器集*是一组验证器对。对于一个验证器集*vs*，我们用*TotalVotingPower(vs)*表示其验证器对的投票权重之和。

#### **[TMBC-VOTE.1]**

*投票*包含由验证器节点在[共识][arXiv]执行期间发送和签名的`prevote`或`precommit`消息。每个消息包含以下字段：

- `Type`：prevote或precommit
- `Height`：正整数
- `Round`：正整数
- `BlockID`：一个块的哈希值（不一定是链上的块）

#### **[TMBC-COMMIT.1]**

一个commit是一组`precommit`消息。

## Tendermint故障模型

#### **[TMBC-AUTH-BYZ.1]**

我们假设在认证的拜占庭容错模型中，没有节点（故障或正确）可以破坏数字签名，但是除此之外，对于故障节点的内部行为没有做出其他假设。也就是说，故障节点只受到不能伪造消息的限制。

#### **[TMBC-TIME-PARAMS.1]**

Tendermint区块链具有以下配置参数：

- *unbondingPeriod*：一个时间段。
- *trustingPeriod*：一个小于*unbondingPeriod*的时间段。

#### **[TMBC-CORRECT.1]**

我们定义一个谓词*correctUntil(n, t)*，其中*n*是一个节点，*t*是一个时间点。
当且仅当节点*n*遵循所有协议（至少）直到时间*t*时，谓词*correctUntil(n, t)*为真。

#### **[TMBC-FM-2THIRDS.1]**

如果块*h*在链上，
那么存在*h.NextValidators*的一个子集*CorrV*，满足以下条件：

- *TotalVotingPower(CorrV) > 2/3
    TotalVotingPower(h.NextValidators)*；参见[TMBC-VALIDATOR-SET.1]
- 对于*CorrV*中的每个验证器对*(n,p)*，满足*correctUntil(n,
    h.Time + trustingPeriod)*；参见[TMBC-CORRECT.1]

> 正确的定义
> [**[TMBC-CORRECT.1]**][TMBC-CORRECT-link] 指的是实时性，而在这里它与 *Time* 和 *trustingPeriod* 一起使用，它们是 "硬件时间"。我们在这里不做区分。

#### **[TMBC-CORR-FULL.1]**

每个正确的全节点本地存储了来自 [**[TMBC-SEQ.1]**][TMBC-SEQ-link] 的当前头部列表的前缀。

## 轻客户端的检查内容

> 从 [TMBC-FM-2THIRDS.1] 我们直接得出以下观察结果：

#### **[TMBC-VAL-CONTAINS-CORR.1]**

给定区块链的（可信任的）区块 *tb*，给定的全节点集合 *N* 在实时 *t* 上包含一个正确的节点，如果满足以下条件：

- *t - trustingPeriod < tb.Time < t*
- *N* 中节点在 *tb.NextValidators* 的投票权大于 *TotalVotingPower(tb.NextValidators)* 的 1/3

> 以下描述了给定区块 *b* 的提交应该是什么样子。

#### **[TMBC-SOUND-DISTR-POSS-COMMIT.1]**

对于区块 *b*，*PossibleCommit(b)* 的每个元素 *pc* 都满足以下条件：

- *pc* 只包含来自 *b.Validators* 的投票（参见 [TMBC-VOTE.1]）
- *pc* 中投票权的总和大于 *TotalVotingPower(b.Validators)* 的 2/3
- 存在一个 *r*，使得 *pc* 中的每个投票 *v* 都满足以下条件
    - v.Type = precommit
    - v.Height = b.Height
    - v.Round = r
    - v.blockID = hash(b)

> 以下属性来自 [共识][arXiv] 的有效性：如果新的（待决定的）区块的 `BlockID` 等于最后一个区块的哈希值，那么正确的验证节点只会发送 `prevote` 或 `precommit`。

#### **[TMBC-VAL-COMMIT.1]**

如果对于区块 *b*，存在一个提交 *c*

- 至少包含一个验证者对 *(v,p)*，其中 *v* 是一个**正确的**验证节点，并且
- *c* 包含在 *PossibleCommit(b)* 中

那么区块 *b* 在区块链上。

## 本文档的背景

在本文档中，我们指定了轻客户端验证组件，称为 *核心验证*。*核心验证* 与全节点进行通信。由于全节点可能存在故障，轻客户端不能信任接收到的信息，而是必须检查接收到的头部是否与 Tendermint 共识生成的头部一致。

两个属性[[TMBC-VAL-CONTAINS-CORR.1]][TMBC-VAL-CONTAINS-CORR-link]和[[TMBC-VAL-COMMIT]][TMBC-VAL-COMMIT-link]形式化了此规范所做的检查：
给定一个可信的块*tb*和一个带有提交*cub*的不可信块*ub*，必须检查*cub*是否在*PossibleCommit(ub)*中，并且*cub*是否包含使用*tb*的正确节点。

# 第二部分 - 验证问题的顺序定义

## 验证问题的非正式陈述

给定一个输入高度*targetHeight*，*Verifier*最终在本地存储高度为*targetHeight*的头部*h*。此头部*h*由Tendermint [blockchain][block]生成。特别地，不应存储未由区块链生成的头部。

## 顺序问题的陈述

#### **[LCV-SEQ-LIVE.1]**

*Verifier*以高度*targetHeight*作为输入，并最终存储区块链高度为*targetHeight*的头部。

#### **[LCV-SEQ-SAFE.1]**

*Verifier*永远不会存储不在区块链中的头部。

# 第三部分 - 分布式系统中的轻客户端

## 激励

有缺陷的全节点可能通过欺骗轻客户端（例如，包含额外交易的块）使轻客户端接受与Tendermint共识生成的块不一致的块。使用轻客户端的用户可能会因接受伪造的头部而受到伤害。

轻客户端的[攻击检测器][attack-detector]可以帮助正确的全节点了解其头部是否良好。因此，结合轻客户端检测器，正确的全节点有动机做出响应。因此，我们可以基于正确的全节点可靠地与轻客户端通信的假设来进行活跃性论证。

## 计算模型

#### **[LCV-A-PEER.1]**

验证器与称为*primary*的全节点进行通信。对于全节点，不做任何假设（可能是正确的或有缺陷的）。

#### **[LCV-A-COMM.1]**

轻客户端与正确的全节点之间的通信是可靠且有时间限制的。可靠的通信意味着消息不会丢失、重复，并最终会被传递。存在一个（已知的）端到端延迟*Delta*，如果在时间*t*发送消息，则在时间*t + Delta*之前接收并处理该消息。这意味着我们需要至少*2 Delta*的超时时间来确保正确对等方的响应在超时到期之前到达。

#### **[LCV-A-TFM.1]**

Tendermint区块链满足Tendermint故障模型[**[TMBC-FM-2THIRDS.1]**][TMBC-FM-2THIRDS-link]。

#### **[LCV-A-VAL.1]**

该系统满足[**[TMBC-AUTH-BYZ.1]**][TMBC-Auth-Byz-link]和[**[TMBC-FM-2THIRDS.1]**][TMBC-FM-2THIRDS-link]。因此，存在一个满足完整性要求（即[[block]]中的验证规则）的区块链。

## 分布式问题陈述

### 两种终止方式

我们不假设*primary*是正确的。在这种假设下，没有协议可以保证顺序属性的组合。因此，在（不可靠的）分布式环境中，我们考虑两种终止方式（成功和失败），并且我们将在下面指定在什么（有利的）条件下*核心验证*能够成功终止，并满足顺序问题陈述的要求：

#### **[LCV-DIST-TERM.1]**

*核心验证*要么*成功终止*，要么*以失败终止*。

### 设计选择

#### **[LCV-DIST-STORE.2]**

*核心验证*返回一个名为*LightStore*的数据结构，其中包含轻区块（包含一个头部）。

#### **[LCV-DIST-INIT.2]**

*核心验证*使用以下参数调用：

- *primary*：一个具有验证通信的全节点的PeerID
- *root*：一个轻区块（信任的根）
- *targetHeight*：一个高度（应该获取的头部的高度）

### 时间属性

#### **[LCV-DIST-SAFE.2]**

*LightStore*中的每个头部都是由Tendermint共识的一个实例生成的。

#### **[LCV-DIST-LIVE.2]**

如果使用一个高度*targetHeight*大于root.Header.Height的新的*核心验证*实例进行调用，它必须最终终止。

- 如果
    - *primary*是正确的（并且本地具有*targetHeight*的块），并且
    - root的年龄始终小于信任期限，
    则*核心验证*将向*LightStore*添加一个高度为*targetHeight*的已验证头部*hd*，并且**成功终止**。

> 这些定义意味着，如果主节点出现故障，*LightStore* 可能会或可能不会添加标头。无论如何，必须满足 [**[LCV-DIST-SAFE.2]**](#lcv-dist-safe2)。
> 不变式 [**[LCV-DIST-SAFE.2]**](#lcv-dist-safe2) 和活性要求 [**[LCV-DIST-LIVE.2]**](#lcv-dist-life) 允许将已验证的标头添加到 *LightStore* 中，其高度未传递给验证器（例如，用于二分法的中间标头；请参见下文）。
> 请注意，对于活性，最初在 *trustinPeriod* 内具有 *root* 是不够的。然而，由于本规范在下载中间标头的顺序方面留有一定的自由度，我们在此不提供更精确的活性规范。在给出协议规范之后，我们将讨论一些活性场景[下文](#liveness-scenarios)。

### 解决顺序规范问题

该规范为顺序规范提供了部分解决方案。
*Verifier* 解决了顺序部分的不变式

[**[LCV-DIST-SAFE.2]**](#lcv-dist-safe2) => [**[LCV-SEQ-SAFE.1]**](#lcv-seq-safe1)

在主节点正确且 *root* 是 *LightStore* 中的最新标头的情况下，验证器满足活性要求。

⋀ *主节点正确*  
⋀ *root.header.Time* > *now* - *trustingPeriod*  
⋀ [**[LCV-A-Comm.1]**](#lcv-a-comm) ⋀ (
       ( [**[TMBC-CorrFull.1]**][TMBC-CorrFull-link] ⋀
         [**[LCV-DIST-LIVE.2]**](#lcv-dist-live2) )
       ⟹ [**[LCV-SEQ-LIVE.1]**](#lcv-seq-live1)
)

# 第四部分 - 轻客户端验证协议

我们提供了轻客户端验证的规范。本地验证代码由一个顺序函数 `VerifyToTarget` 提供，以突出显示此功能的控制流程。我们注意到，如果对于实现考虑了不同的并发模型，则可以使用互斥锁等实现函数的顺序流程。然而，轻客户端验证被分为三个块，可以独立实现和测试：

- `FetchLightBlock` 被调用以从对等节点下载给定高度的轻区块（头部）。
- `ValidAndVerified` 是一个本地代码，用于检查区块头。
- `Schedule` 决定下一个要尝试验证的高度。我们没有具体说明，因为不同的实现（目前有 Goland 和 Rust）可能在这里实现不同的优化。我们只提供了高度可能如何演变的必要条件。

<!-- > `ValidAndVerified` 是在 IBC 上下文中有时被称为 "轻客户端" 的函数。 -->

## 定义

### 数据类型

协议的核心数据结构是 LightBlock。

#### **[LCV-DATA-LIGHTBLOCK.1]**

```go
type LightBlock struct {
  Header          Header
  Commit          Commit
  Validators      ValidatorSet
}
```

#### **[LCV-DATA-LIGHTSTORE.2]**

LightBlock 存储在一个结构中，该结构存储了从初始化或从对等节点接收到的所有 LightBlock。

```go
type LightStore struct {
 ...
}

```

#### **[LCV-DATA-LS-ROOT.2]**

对于 lightstore 中的每个 lightblock，我们在一个名为 `verification-root` 的字段中记录一个类型为 Height 的值。

> `verification-root` 记录了一个可以用于一步验证 lightblock 的 lightblock 的高度。

#### **[LCV-INV-LS-ROOT.2]**

在任何时候，如果 lightstore 中的 lightblock *b* 具有 *b.verification-root = h*，那么

- lightstore 包含一个高度为 *h* 的 lightblock，或者
- *b* 是 lightstore 中所有 lightblock 中的最小高度，则 b.verification-root 应为 nil。

LightStore 提供以下函数来查询存储的 LightBlocks。

#### **[LCV-DATA-LS-STATE.1]**

每个 LightBlock 处于以下状态之一：

```go
type VerifiedState int

const (
 StateUnverified = iota + 1
 StateVerified
 StateFailed
 StateTrusted
)
```

#### **[LCV-FUNC-GET.1]**

```go
func (ls LightStore) Get(height Height) (LightBlock, bool)
```

- 预期后置条件
    - 如果 LightStore 不包含指定的 LightBlock，则返回给定高度的 LightBlock 或 false。

#### **[LCV-FUNC-LATEST.1]**

```go
func (ls LightStore) Latest() LightBlock
```

- 预期后置条件
    - 返回最高的轻区块

#### **[LCV-FUNC-ADD.1]**

```go
func (ls LightStore) Add(newBlock)
```

- 预期前置条件
    - lightstore 为空
- 预期后置条件
    - 将 newBlock 添加到 lightstore 中

#### **[LCV-FUNC-STORE.1]**

```go
func (ls LightStore) store_chain(newLS LightStore)
```

- 预期后置条件
    - 将 `newLS` 添加到 lightstore 中

#### **[LCV-FUNC-LATEST-VERIF.2]**

```go
func (ls LightStore) LatestVerified() LightBlock
```

- 预期后置条件
    - 返回状态为 `StateVerified` 的最高 light block

#### **[LCV-FUNC-FILTER.1]**

```go
func (ls LightStore) FilterVerified() LightStore
```

- 预期后置条件
    - 返回 lightstore 中状态为 `StateVerified` 的所有 lightblock

#### **[LCV-FUNC-UPDATE.2]**

```go
func (ls LightStore) Update(lightBlock LightBlock, verfiedState VerifiedState, root-height Height)
```

- 预期后置条件
    - lightblock 是 lightstore 的一部分
    - LightBlock 的状态设置为 *verifiedState*
    - LightBlock 的验证根设置为 *root-height*

```go
func (ls LightStore) TraceTo(lightBlock LightBlock) (LightBlock, LightStore)
```

- 预期后置条件
    - 从 lightstore 返回一个**可信任的** lightblock `root`，其高度小于 `lightBlock`
    - 返回一个包含构成从 `root` 到 `lightBlock` 的[验证追踪](TODOlinkToDetectorSpecOnceThere)的 lightstore（包括 `lightBlock`）

### 输入

- *root*：一个可信任的 light block
- *primary*：peerID
- *targetHeight*：所需头部的高度

### 配置参数

- *trustThreshold*：一个浮点数。如果正确性不应基于更多的投票权和 1/3，则可以使用。
- *trustingPeriod*：时间持续时间[**[TMBC-TIME_PARAMS.1]**][TMBC-TIME_PARAMS-link]。
- *clockDrift*：时间持续时间。纠正参数，仅处理大致同步的时钟。

### 变量

- *nextHeight*：初始值为 *targetHeight*
  > *nextHeight* 应被视为“我们需要下载和验证的下一个头部的高度”

### 假设

#### **[LCV-A-INIT.2]**

- *root* 来自区块链

- *targetHeight > root.Header.Height*

### 不变量

#### **[LCV-INV-TP.1]**

始终满足 *LightStore.LatestTrusted.Header.Time > now - trustingPeriod*。

> 如果不变量被违反，轻客户端将没有一个可以信任的头部。可信任的头部必须从外部获取，其信任只能基于社会共识。
> 我们使用的约定是假定 root 已经被验证。

### 使用的远程函数

我们使用提供的 `commit` 和 `validators` 函数，这些函数由 [Tendermint 的 RPC 客户端][RPC] 提供。

```go
func Commit(height int64) (SignedHeader, error)
```

- 实现备注
    - RPC 到全节点 *n*
    - 发送的 JSON：

```javascript
// POST /commit
{
 "jsonrpc": "2.0",
 "id": "ccc84631-dfdb-4adc-b88c-5291ea3c2cfb", // UUID v4, unique per request
 "method": "commit",
 "params": {
  "height": 1234
 }
}
```

- 预期前提条件
    - 区块链上存在高度为 `height` 的头部
- 预期后置条件
    - 如果 *n* 正确：如果通信及时（没有超时），则从区块链返回高度为 `height` 的签名头部
    - 如果 *n* 错误：返回任意内容的签名头部
- 错误条件
    - 如果 *n* 正确：前提条件被违反或超时
    - 如果 *n* 错误：任意错误

----;

```go
func Validators(height int64) (ValidatorSet, error)
```

- 实现备注
    - RPC 到全节点 *n*
    - 发送的 JSON：

```javascript
// POST /validators
{
 "jsonrpc": "2.0",
 "id": "ccc84631-dfdb-4adc-b88c-5291ea3c2cfb", // UUID v4, unique per request
 "method": "validators",
 "params": {
  "height": 1234
 }
}
```

- 预期前提条件
    - 区块链上存在高度为 `height` 的头部
- 预期后置条件
    - 如果 *n* 正确：如果通信及时（没有超时），则从区块链返回高度为 `height` 的验证者集合
    - 如果 *n* 错误：返回任意验证者集合
- 错误条件
    - 如果 *n* 正确：前提条件被违反或超时
    - 如果 *n* 错误：任意错误

----;

### 通信函数

#### **[LCV-FUNC-FETCH.1]**


  ```go
func FetchLightBlock(peer PeerID, height Height) LightBlock
```

- Implementation remark
    - RPC to peer at *PeerID*
    - calls `Commit` for *height* and `Validators` for *height* and *height+1*
- Expected precondition
    - `height` is less than or equal to height of the peer **[LCV-IO-PRE-HEIGHT.1]**
- Expected postcondition:
    - if *node* is correct:
        - Returns the LightBlock *lb* of height `height`
      that is consistent with the blockchain
        - *lb.provider = peer* **[LCV-IO-POST-PROVIDER.1]**
        - *lb.Header* is a header consistent with the blockchain
        - *lb.Validators* is the validator set of the blockchain at height *nextHeight*
        - *lb.NextValidators* is the validator set of the blockchain at height *nextHeight + 1*
    - if *node* is faulty: Returns a LightBlock with arbitrary content
    [**[TMBC-AUTH-BYZ.1]**][TMBC-Auth-Byz-link]
- Error condition
    - if *n* is correct: precondition violated
    - if *n* is faulty: arbitrary error
    - if *lb.provider != peer*
    - times out after 2 Delta (by assumption *n* is faulty)

----;

## Core Verification

### Outline

The `VerifyToTarget` is the main function and uses the following functions.

- `FetchLightBlock` is called to download the next light block. It is
  the only function that communicates with other nodes
- `ValidAndVerified` checks whether header is valid and checks if a
  new lightBlock should be trusted
  based on a previously verified lightBlock.
- `Schedule` decides which height to try to verify next

In the following description of `VerifyToTarget` we do not deal with error
handling. If any of the above function returns an error, VerifyToTarget just
passes the error on.

#### **[LCV-FUNC-MAIN.2]**

```go
func VerifyToTarget(primary PeerID, root LightBlock,
                    targetHeight Height) (LightStore, Result) {

    lightStore = new LightStore;
    lightStore.Update(root, StateVerified, root.verifiedBy);
    nextHeight := targetHeight;

    for lightStore.LatestVerified.height < targetHeight {

        // Get next LightBlock for verification
        current, found := lightStore.Get(nextHeight)
        if !found {
            current = FetchLightBlock(primary, nextHeight)
            lightStore.Update(current, StateUnverified, nil)
        }

        // Verify
        verdict = ValidAndVerified(lightStore.LatestVerified, current)

        // Decide whether/how to continue
        if verdict == SUCCESS {
            lightStore.Update(current, StateVerified, lightStore.LatestVerified.Height)
        }
        else if verdict == NOT_ENOUGH_TRUST {
            // do nothing
            // the light block current passed validation, but the validator
            // set is too different to verify it. We keep the state of
            // current at StateUnverified. For a later iteration, Schedule
            // might decide to try verification of that light block again.
        }
        else {
            // verdict is some error code
            lightStore.Update(current, StateFailed, nil)
            return (nil, ResultFailure)
        }
        nextHeight = Schedule(lightStore, nextHeight, targetHeight)
    }
    return (lightStore.FilterVerified, ResultSuccess)
}
```

- Expected precondition
    - *root* is within the *trustingPeriod*  **[LCV-PRE-TP.1]**
    - *targetHeight* is greater than the height of *root*
- Expected postcondition:
    - returns *lightStore* that contains a LightBlock that corresponds to a block
     of the blockchain of height *targetHeight*
     (that is, the LightBlock has been added to *lightStore*) **[LCV-POST-LS.1]**
- Error conditions
    - if the precondition is violated
    - if `ValidAndVerified` or `FetchLightBlock` report an error
    - if [**[LCV-INV-TP.1]**](#LCV-INV-TP.1) is violated
  
### Details of the Functions

#### **[LCV-FUNC-VALID.2]**

```go
func ValidAndVerified(trusted LightBlock, untrusted LightBlock) Result
```

- Expected precondition:
    - *untrusted* is valid, that is, satisfies the soundness [checks][block]
    - *untrusted* is **well-formed**, that is,
        - *untrusted.Header.Time < now + clockDrift*
        - *untrusted.Validators = hash(untrusted.Header.Validators)*
        - *untrusted.NextValidators = hash(untrusted.Header.NextValidators)*
    - *trusted.Header.Time > now - trustingPeriod*
    - the `Height` and `Time` of `trusted` are smaller than the Height and
  `Time` of `untrusted`, respectively
    - the *untrusted.Header* is well-formed (passes the tests from
     [[block]]), and in particular
        - if the untrusted header `unstrusted.Header` is the immediate
   successor  of  `trusted.Header`, then it holds that
            - *trusted.Header.NextValidators =
    untrusted.Header.Validators*, and
    moreover,
            - *untrusted.Header.Commit*
                - contains signatures by more than two-thirds of the validators
                - contains no signature from nodes that are not in *trusted.Header.NextValidators*
- Expected postcondition:
    - Returns `SUCCESS`:
        - if *untrusted* is the immediate successor of *trusted*, or otherwise,
        - if the signatures of a set of validators that have more than
             *max(1/3,trustThreshold)* of voting power in
             *trusted.Nextvalidators* is contained in
             *untrusted.Commit* (that is, header passes the tests
             [**[TMBC-VAL-CONTAINS-CORR.1]**][TMBC-VAL-CONTAINS-CORR-link]
             and [**[TMBC-VAL-COMMIT.1]**][TMBC-VAL-COMMIT-link])
    - Returns `NOT_ENOUGH_TRUST` if:
        - *untrusted* is *not* the immediate successor of
           *trusted*
     and the  *max(1/3,trustThreshold)* threshold is not reached
           (that is, if
      [**[TMBC-VAL-CONTAINS-CORR.1]**][TMBC-VAL-CONTAINS-CORR-link]
      fails and header is does not violate the soundness
         checks [[block]]).
- Error condition:
    - if precondition violated

----;

#### **[LCV-FUNC-SCHEDULE.1]**

```go
func Schedule(lightStore, nextHeight, targetHeight) Height
```

- Implementation remark: If picks the next height to be verified.
  We keep the precise choice of the next header under-specified. It is
  subject to performance optimizations that do not influence the correctness
- Expected postcondition: **[LCV-SCHEDULE-POST.1]**
   Return *H* s.t.
   1. if *lightStore.LatestVerified.Height = nextHeight* and
      *lightStore.LatestVerified < targetHeight* then  
   *nextHeight < H <= targetHeight*
   2. if *lightStore.LatestVerified.Height < nextHeight* and
      *lightStore.LatestVerified.Height < targetHeight* then  
   *lightStore.LatestVerified.Height < H < nextHeight*
   3. if *lightStore.LatestVerified.Height = targetHeight* then  
     *H =  targetHeight*

> Case i. captures the case where the light block at height *nextHeight*
> has been verified, and we can choose a height closer to the *targetHeight*.
> As we get the *lightStore* as parameter, the choice of the next height can
> depend on the *lightStore*, e.g., we can pick a height for which we have
> already downloaded a light block.
> In Case ii. the header of *nextHeight* could not be verified, and we need to pick a smaller height.
> In Case iii. is a special case when we have verified the *targetHeight*.

### Solving the distributed specification

Analogous to [[001_published]](./verification_001_published.md#solving-the-distributed-specification)

## Liveness Scenarios

Analogous to [[001_published]](./verification_001_published.md#liveness-scenarios)

# Part V - Supporting the IBC Relayer

The above specification focuses on the most common case, which also
constitutes the most challenging task: using the Tendermint [security
model][TMBC-FM-2THIRDS-link] to verify light blocks without
downloading all intermediate blocks. To focus on this challenge, above
we have restricted ourselves to the case where  *targetHeight* is
greater than the height of any trusted header. This simplified
presentation of the algorithm as initially
`lightStore.LatestVerified()` is less than *targetHeight*, and in the
process of verification `lightStore.LatestVerified()` increases until
*targetHeight* is reached.

For [IBC][ibc-rs] there are two additional challenges:

1. it might be that some "older" header is needed, that is,
*targetHeight < lightStore.LatestVerified()*.  The
[supervisor](../supervisor/supervisor.md) checks whether it is in this
case by calling `LatestPrevious` and `MinVerified` and if so it calls
`Backwards`. All these functions are specified below.

2. In order to submit proof of a light client attack, a relayer may
   need to submit a verification trace. This it is important to
   compute such a trace efficiently. That it can be done is based on
   the invariant [[LCV-INV-LS-ROOT.2]](#LCV-INV-LS-ROOT2) that needs
   to be maintained by the light client. In particular
   `VerifyToTarget` and `Backwards` need to take care of setting
   `verification-root`.

#### **[LCV-FUNC-LATEST-PREV.2]**

```go
func (ls LightStore) LatestPrevious(height Height) (LightBlock, bool)
```

- Expected postcondition
    - returns a light block *lb* that satisfies:
        - *lb* is in lightStore
        - *lb* is in StateTrusted
        - *lb* is not expired
        - *lb.Header.Height < height*
        - for all *b* in lightStore s.t. *b* is trusted and not expired it
          holds *lb.Header.Height >= b.Header.Height*
    - *false* in the second argument if
      the LightStore does not contain such an *lb*.

----;

#### **[LCV-FUNC-LOWEST.2]**

```go
func (ls LightStore) Lowest() (LightBlock)
```

- Expected postcondition
    - returns the lowest trusted light block within trusting period

----;

#### **[LCV-FUNC-MIN.2]**

```go
func (ls LightStore) MinVerified() (LightBlock, bool)
```

- Expected postcondition
    - returns a light block *lb* that satisfies:
        - *lb* is in lightStore
        - *lb.Header.Height* is minimal in the lightStore
    - *false* in the second argument if
      the LightStore does not contain such an *lb*.

If a height that is smaller than the smallest height in the lightstore
is required, we check the hashes backwards. This is done with the
following function:

#### **[LCV-FUNC-BACKWARDS.2]**

```go
func Backwards (primary PeerID, root LightBlock, targetHeight Height)
               (LightStore, Result) {
  
    lb := root;
    lightStore := new LightStore;
    lightStore.Update(lb, StateTrusted, lb.verifiedBy)

    latest := lb.Header
    for i := lb.Header.height - 1; i >= targetHeight; i-- {
        // here we download height-by-height. We might first download all
        // headers down to targetHeight and then check them.
        current := FetchLightBlock(primary,i)
        if (hash(current) != latest.Header.LastBlockId) {
            return (nil, ResultFailure)
        }
        else {
            // latest and current are linked together by LastBlockId
            // therefore it is not relevant which we verified first
            // for consistency, we store latest was veried using
            // current so that the verifiedBy is always pointing down
            // the chain
            lightStore.Update(current, StateTrusted, nil)
            lightStore.Update(latest, StateTrusted, current.Header.Height)
        }
        latest = current
    }
    return (lightStore, ResultSuccess)
}
```

# References

[[block]] Specification of the block data structure.

[[RPC]] RPC client for Tendermint

[[attack-detector]] The specification of the light client attack detector.

[[fullnode]] Specification of the full node API

[[ibc-rs]] Rust implementation of IBC modules and relayer.

[[lightclient]] The light client ADR [77d2651 on Dec 27, 2019].

[RPC]: https://docs.tendermint.com/v0.34/rpc/

[block]: https://github.com/tendermint/spec/blob/d46cd7f573a2c6a2399fcab2cde981330aa63f37/spec/core/data_structures.md

[TMBC-HEADER-link]: #tmbc-header1
[TMBC-SEQ-link]: #tmbc-seq1
[TMBC-CorrFull-link]: #tmbc-corr-full1
[TMBC-Auth-Byz-link]: #tmbc-auth-byz1
[TMBC-TIME_PARAMS-link]: #tmbc-time-params1
[TMBC-FM-2THIRDS-link]: #tmbc-fm-2thirds1
[TMBC-VAL-CONTAINS-CORR-link]: #tmbc-val-contains-corr1
[TMBC-VAL-COMMIT-link]: #tmbc-val-commit1
[TMBC-SOUND-DISTR-POSS-COMMIT-link]: #tmbc-sound-distr-poss-commit1

[lightclient]: https://github.com/interchainio/tendermint-rs/blob/e2cb9aca0b95430fca2eac154edddc9588038982/docs/architecture/adr-002-lite-client.md
[attack-detector]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_001_reviewed.md
[fullnode]: https://github.com/tendermint/tendermint/blob/v0.34.x/spec/blockchain/fullnode.md

[ibc-rs]:https://github.com/informalsystems/ibc-rs

[blockchain-validator-set]: https://github.com/tendermint/tendermint/blob/v0.34.x/spec/blockchain/blockchain.md#data-structures
[fullnode-data-structures]: https://github.com/tendermint/tendermint/blob/v0.34.x/spec/blockchain/fullnode.md#data-structures

[FN-ManifestFaulty-link]: https://github.com/tendermint/tendermint/blob/v0.34.x/spec/blockchain/fullnode.md#fn-manifestfaulty

[arXiv]: https://arxiv.org/abs/1807.04938



# Light Client Verification

The light client implements a read operation of a
[header][TMBC-HEADER-link] from the [blockchain][TMBC-SEQ-link], by
communicating with full nodes.  As some full nodes may be faulty, this
functionality must be implemented in a fault-tolerant way.

In the Tendermint blockchain, the validator set may change with every
new block.  The staking and unbonding mechanism induces a [security
model][TMBC-FM-2THIRDS-link]: starting at time *Time* of the
[header][TMBC-HEADER-link],
more than two-thirds of the next validators of a new block are correct
for the duration of *TrustedPeriod*. The fault-tolerant read
operation is designed for this security model.

The challenge addressed here is that the light client might have a
block of height *h1* and needs to read the block of height *h2*
greater than *h1*.  Checking all headers of heights from *h1* to *h2*
might be too costly (e.g., in terms of energy for mobile devices).
This specification tries to reduce the number of intermediate blocks
that need to be checked, by exploiting the guarantees provided by the
[security model][TMBC-FM-2THIRDS-link].

# Status

## Previous Versions

- [[001_published]](./verification_001_published.md)
 is thoroughly reviewed, and the protocol has been
formalized in TLA+ and model checked.

## Issues that are addressed in this revision

As it is part of the larger light node, its data structures and
functions interact with the attack dectection functionality of the light
client. As a result of the work on

- [attack detection](https://github.com/tendermint/spec/pull/164) for light nodes

- attack detection for IBC and [relayer requirements](https://github.com/informalsystems/tendermint-rs/issues/497)

- light client
  [supervisor](https://github.com/tendermint/spec/pull/159) (also in
  [Rust proposal](https://github.com/informalsystems/tendermint-rs/pull/509))
  
adaptations to the semantics and functions exposed by the LightStore
needed to be made. In contrast to [version
001](./verification_001_published.md) we specify the following:

- `VerifyToTarget` and `Backwards` are called with a single lightblock
  as root of trust in contrast to passing the complete lightstore.

- During verification, we record for each lightblock which other
  lightblock can be used to verify it in one step. This is needed to
  generate verification traces that are needed for IBC.
  
# Outline

- [Part I](#part-i---tendermint-blockchain): Introduction of
 relevant terms of the Tendermint
blockchain.

- [Part II](#part-ii---sequential-definition-of-the-verification-problem): Introduction
of the problem addressed by the Lightclient Verification protocol.
    - [Verification Informal Problem
      statement](#Verification-Informal-Problem-statement): For the general
      audience, that is, engineers who want to get an overview over what
      the component is doing from a bird's eye view.
    - [Sequential Problem statement](#Sequential-Problem-statement):
      Provides a mathematical definition of the problem statement in
      its sequential form, that is, ignoring the distributed aspect of
      the implementation of the blockchain.

- [Part III](#part-iii---light-client-as-distributed-system): Distributed
  aspects of the light client, system assumptions and temporal
  logic specifications.

    - [Incentives](#incentives): how faulty full nodes may benefit from
    misbehaving and how correct full nodes benefit from cooperating.
  
    - [Computational Model](#Computational-Model):
      timing and correctness assumptions.

    - [Distributed Problem Statement](#Distributed-Problem-Statement):
      temporal properties that formalize safety and liveness
      properties in the distributed setting.

- [Part IV](#part-iv---light-client-verification-protocol):
  Specification of the protocols.

    - [Definitions](#Definitions): Describes inputs, outputs,
       variables used by the protocol, auxiliary functions

    - [Core Verification](#core-verification): gives an outline of the solution,
       and details of the functions used (with preconditions,
       postconditions, error conditions).

    - [Liveness Scenarios](#liveness-scenarios): when the light
       client makes progress depends heavily on the changes in the
       validator sets of the blockchain. We discuss some typical scenarios.

- [Part V](#part-v---supporting-the-ibc-relayer): The above parts
  focus on a common case where the last verified block has height *h1*
  and the
  requested height *h2* satisfies *h2 > h1*. For IBC, there are
  scenarios where this might not be the case. In this part, we provide
  some preliminaries for supporting this. As not all details of the
  IBC requirements are clear by now, we do not provide a complete
  specification at this point. We mark with "Open Question" points
  that need to be addressed in order to finalize this specification.
  It should be noted that the technically
  most challenging case is the one specified in Part IV.

In this document we quite extensively use tags in order to be able to
reference assumptions, invariants, etc. in future communication. In
these tags we frequently use the following short forms:

- TMBC: Tendermint blockchain
- SEQ: for sequential specifications
- LCV: Lightclient Verification
- LIVE: liveness
- SAFE: safety
- FUNC: function
- INV: invariant
- A: assumption

# Part I - Tendermint Blockchain

## Header Fields necessary for the Light Client

#### **[TMBC-HEADER.1]**

A set of blockchain transactions is stored in a data structure called
*block*, which contains a field called *header*. (The data structure
*block* is defined [here][block]).  As the header contains hashes to
the relevant fields of the block, for the purpose of this
specification, we will assume that the blockchain is a list of
headers, rather than a list of blocks.

#### **[TMBC-HASH-UNIQUENESS.1]**

We assume that every hash in the header identifies the data it hashes.
Therefore, in this specification, we do not distinguish between hashes and the
data they represent.

#### **[TMBC-HEADER-FIELDS.2]**

A header contains the following fields:

- `Height`: non-negative integer
- `Time`: time (non-negative integer)
- `LastBlockID`: Hashvalue
- `LastCommit` DomainCommit
- `Validators`: DomainVal
- `NextValidators`: DomainVal
- `Data`: DomainTX
- `AppState`: DomainApp
- `LastResults`: DomainRes

#### **[TMBC-SEQ.1]**

The Tendermint blockchain is a list *chain* of headers.

#### **[TMBC-VALIDATOR-PAIR.1]**

Given a full node, a
*validator pair* is a pair *(peerID, voting_power)*, where

- *peerID* is the PeerID (public key) of a full node,
- *voting_power* is an integer (representing the full node's
  voting power in a certain consensus instance).
  
> In the Golang implementation the data type for *validator
pair* is called `Validator`

#### **[TMBC-VALIDATOR-SET.1]**

A *validator set* is a set of validator pairs. For a validator set
*vs*, we write *TotalVotingPower(vs)* for the sum of the voting powers
of its validator pairs.

#### **[TMBC-VOTE.1]**

A *vote* contains a `prevote` or `precommit` message sent and signed by
a validator node during the execution of [consensus][arXiv]. Each
message contains the following fields

- `Type`: prevote or precommit
- `Height`: positive integer
- `Round` a positive integer
- `BlockID` a Hashvalue of a block (not necessarily a block of the chain)

#### **[TMBC-COMMIT.1]**

A commit is a set of `precommit` message.

## Tendermint Failure Model

#### **[TMBC-AUTH-BYZ.1]**

We assume the authenticated Byzantine fault model in which no node (faulty or
correct) may break digital signatures, but otherwise, no additional
assumption is made about the internal behavior of faulty
nodes. That is, faulty nodes are only limited in that they cannot forge
messages.

#### **[TMBC-TIME-PARAMS.1]**

A Tendermint blockchain has the following configuration parameters:

- *unbondingPeriod*: a time duration.
- *trustingPeriod*: a time duration smaller than *unbondingPeriod*.

#### **[TMBC-CORRECT.1]**

We define a predicate *correctUntil(n, t)*, where *n* is a node and *t* is a
time point.
The predicate *correctUntil(n, t)* is true if and only if the node *n*
follows all the protocols (at least) until time *t*.

#### **[TMBC-FM-2THIRDS.1]**

If a block *h* is in the chain,
then there exists a subset *CorrV*
of *h.NextValidators*, such that:

- *TotalVotingPower(CorrV) > 2/3
    TotalVotingPower(h.NextValidators)*; cf. [TMBC-VALIDATOR-SET.1]
- For every validator pair *(n,p)* in *CorrV*, it holds *correctUntil(n,
    h.Time + trustingPeriod)*; cf. [TMBC-CORRECT.1]

> The definition of correct
> [**[TMBC-CORRECT.1]**][TMBC-CORRECT-link] refers to realtime, while it
> is used here with *Time* and *trustingPeriod*, which are "hardware
> times".  We do not make a distinction here.

#### **[TMBC-CORR-FULL.1]**

Every correct full node locally stores a prefix of the
current list of headers from [**[TMBC-SEQ.1]**][TMBC-SEQ-link].

## What the Light Client Checks

> From [TMBC-FM-2THIRDS.1] we directly derive the following observation:

#### **[TMBC-VAL-CONTAINS-CORR.1]**

Given a (trusted) block *tb* of the blockchain, a given set of full nodes
*N* contains a correct node at a real-time *t*, if

- *t - trustingPeriod < tb.Time < t*
- the voting power in tb.NextValidators of nodes in *N* is more
     than 1/3 of *TotalVotingPower(tb.NextValidators)*

> The following describes how a commit for a given block *b* must look
> like.

#### **[TMBC-SOUND-DISTR-POSS-COMMIT.1]**

For a block *b*, each element *pc* of *PossibleCommit(b)* satisfies:

- *pc* contains only votes (cf. [TMBC-VOTE.1])
  by validators from *b.Validators*
- the sum of the voting powers in *pc* is greater than 2/3
  *TotalVotingPower(b.Validators)*
- and there is an *r* such that  each vote *v* in *pc* satisfies
    - v.Type = precommit
    - v.Height = b.Height
    - v.Round = r
    - v.blockID = hash(b)

> The following property comes from the validity of the [consensus][arXiv]: A
> correct validator node only sends `prevote` or `precommit`, if
> `BlockID` of the new (to-be-decided) block is equal to the hash of
> the last block.

#### **[TMBC-VAL-COMMIT.1]**

If for a block *b*,  a commit *c*

- contains at least one validator pair *(v,p)* such that *v* is a
    **correct** validator node, and
- is contained in *PossibleCommit(b)*
  
then the block *b* is on the blockchain.

## Context of this document

In this document we specify the light client verification component,
called *Core Verification*.  The *Core Verification* communicates with
a full node.  As full nodes may be faulty, it cannot trust the
received information, but the light client has to check whether the
header it receives coincides with the one generated by Tendermint
consensus.

The two
 properties [[TMBC-VAL-CONTAINS-CORR.1]][TMBC-VAL-CONTAINS-CORR-link] and
[[TMBC-VAL-COMMIT]][TMBC-VAL-COMMIT-link]  formalize the checks done
 by this specification:
Given a trusted block *tb* and an untrusted block *ub* with a commit *cub*,
one has to check that *cub* is in *PossibleCommit(ub)*, and that *cub*
contains a correct node using *tb*.

# Part II - Sequential Definition of the Verification Problem

## Verification Informal Problem statement

Given a height *targetHeight* as an input, the *Verifier* eventually
stores a header *h* of height *targetHeight* locally.  This header *h*
is generated by the Tendermint [blockchain][block]. In
particular, a header that was not generated by the blockchain should
never be stored.

## Sequential Problem statement

#### **[LCV-SEQ-LIVE.1]**

The *Verifier* gets as input a height *targetHeight*, and eventually stores the
header of height *targetHeight* of the blockchain.

#### **[LCV-SEQ-SAFE.1]**

The *Verifier* never stores a header which is not in the blockchain.

# Part III - Light Client as Distributed System

## Incentives

Faulty full nodes may benefit from lying to the light client, by making the
light client accept a block that deviates (e.g., contains additional
transactions) from the one generated by Tendermint consensus.
Users using the light client might be harmed by accepting a forged header.

The [attack detector][attack-detector] of the light client may help the
correct full nodes to understand whether their header is a good one.
Hence, in combination with the light client detector, the correct full
nodes have the incentive to respond.  We can thus base liveness
arguments on the assumption that correct full nodes reliably talk to
the light client.

## Computational Model

#### **[LCV-A-PEER.1]**

The verifier communicates with a full node called *primary*. No assumption is made about the full node (it may be correct or faulty).

#### **[LCV-A-COMM.1]**

Communication between the light client and a correct full node is
reliable and bounded in time. Reliable communication means that
messages are not lost, not duplicated, and eventually delivered. There
is a (known) end-to-end delay *Delta*, such that if a message is sent
at time *t* then it is received and processes by time *t + Delta*.
This implies that we need a timeout of at least *2 Delta* for remote
procedure calls to ensure that the response of a correct peer arrives
before the timeout expires.

#### **[LCV-A-TFM.1]**

The Tendermint blockchain satisfies the Tendermint failure model [**[TMBC-FM-2THIRDS.1]**][TMBC-FM-2THIRDS-link].

#### **[LCV-A-VAL.1]**

The system satisfies [**[TMBC-AUTH-BYZ.1]**][TMBC-Auth-Byz-link] and
[**[TMBC-FM-2THIRDS.1]**][TMBC-FM-2THIRDS-link]. Thus, there is a
blockchain that satisfies the soundness requirements (that is, the
validation rules in [[block]]).

## Distributed Problem Statement

### Two Kinds of Termination

We do not assume that *primary* is correct. Under this assumption no
protocol can guarantee the combination of the sequential
properties. Thus, in the (unreliable) distributed setting, we consider
two kinds of termination (successful and failure) and we will specify
below under what (favorable) conditions *Core Verification* ensures to
terminate successfully, and satisfy the requirements of the sequential
problem statement:

#### **[LCV-DIST-TERM.1]**

*Core Verification* either *terminates
successfully* or it *terminates with failure*.

### Design choices

#### **[LCV-DIST-STORE.2]**

*Core Verification* returns a data structure called *LightStore* that
contains light blocks (that contain a header).

#### **[LCV-DIST-INIT.2]**

*Core Verification* is called with

- *primary*: the PeerID of a full node (with verification communicates)
- *root*: a light block (the root of trust)
- *targetHeight*: a height (the height of a header that should be obtained)

### Temporal Properties

#### **[LCV-DIST-SAFE.2]**

It is always the case that every header in *LightStore* was
generated by an instance of Tendermint consensus.

#### **[LCV-DIST-LIVE.2]**

If a new instance of *Core Verification* is called with a
height *targetHeight* greater than root.Header.Height it must
must eventually terminate.

- If
    - the  *primary* is correct (and locally has the block of
       *targetHeight*), and
    - the age of root is always less than the trusting period,  
    then *Core Verification* adds a verified header *hd* with height
    *targetHeight* to *LightStore* and it **terminates successfully**

> These definitions imply that if the primary is faulty, a header may or
> may not be added to *LightStore*. In any case,
> [**[LCV-DIST-SAFE.2]**](#lcv-dist-safe2) must hold.
> The invariant [**[LCV-DIST-SAFE.2]**](#lcv-dist-safe2) and the liveness
> requirement [**[LCV-DIST-LIVE.2]**](#lcv-dist-life)
> allow that verified headers are added to *LightStore* whose
> height was not passed
> to the verifier (e.g., intermediate headers used in bisection; see below).
> Note that for liveness, initially having a *root* within
> the *trustinPeriod* is not sufficient. However, as this
> specification will leave some freedom with respect to the strategy
> in which order to download intermediate headers, we do not give a
> more precise liveness specification here. After giving the
> specification of the protocol, we will discuss some liveness
> scenarios [below](#liveness-scenarios).

### Solving the sequential specification

This specification provides a partial solution to the sequential specification.
The *Verifier* solves the invariant of the sequential part

[**[LCV-DIST-SAFE.2]**](#lcv-dist-safe2) => [**[LCV-SEQ-SAFE.1]**](#lcv-seq-safe1)

In the case the primary is correct, and *root*  is a recent header in *LightStore*, the verifier satisfies the liveness requirements.

⋀ *primary is correct*  
⋀ *root.header.Time* > *now* - *trustingPeriod*  
⋀ [**[LCV-A-Comm.1]**](#lcv-a-comm) ⋀ (
       ( [**[TMBC-CorrFull.1]**][TMBC-CorrFull-link] ⋀
         [**[LCV-DIST-LIVE.2]**](#lcv-dist-live2) )
       ⟹ [**[LCV-SEQ-LIVE.1]**](#lcv-seq-live1)
)

# Part IV - Light Client Verification Protocol

We provide a specification for Light Client Verification. The local
code for verification is presented by a sequential function
`VerifyToTarget` to highlight the control flow of this functionality.
We note that if a different concurrency model is considered for
an implementation, the sequential flow of the function may be
implemented with mutexes, etc. However, the light client verification
is partitioned into three blocks that can be implemented and tested
independently:

- `FetchLightBlock` is called to download a light block (header) of a
  given height from a peer.
- `ValidAndVerified` is a local code that checks the header.
- `Schedule` decides which height to try to verify next. We keep this
  underspecified as different implementations (currently in Goland and
  Rust) may implement different optimizations here. We just provide
  necessary conditions on how the height may evolve.
  
<!-- > `ValidAndVerified` is the function that is sometimes called "Light -->
<!-- > Client" in the IBC context. -->

## Definitions

### Data Types

The core data structure of the protocol is the LightBlock.

#### **[LCV-DATA-LIGHTBLOCK.1]**

```go
type LightBlock struct {
  Header          Header
  Commit          Commit
  Validators      ValidatorSet
}
```

#### **[LCV-DATA-LIGHTSTORE.2]**

LightBlocks are stored in a structure which stores all LightBlock from
initialization or received from peers.

```go
type LightStore struct {
 ...
}

```

#### **[LCV-DATA-LS-ROOT.2]**

For each lightblock in a lightstore we record in a field `verification-root` of
type Height.

> `verification-root` records the height of a lightblock that can be used to verify
> the lightblock in one step

#### **[LCV-INV-LS-ROOT.2]**

At all times, if a lightblock *b* in a lightstore has *b.verification-root = h*,
then

- the lightstore contains a lightblock with height *h*, or
- *b* has the minimal height of all lightblocks in lightstore, then
  b.verification-root should be nil.

The LightStore exposes the following functions to query stored LightBlocks.

#### **[LCV-DATA-LS-STATE.1]**

Each LightBlock is in one of the following states:

```go
type VerifiedState int

const (
 StateUnverified = iota + 1
 StateVerified
 StateFailed
 StateTrusted
)
```

#### **[LCV-FUNC-GET.1]**

```go
func (ls LightStore) Get(height Height) (LightBlock, bool)
```

- Expected postcondition
    - returns a LightBlock at a given height or false in the second argument if
    the LightStore does not contain the specified LightBlock.

#### **[LCV-FUNC-LATEST.1]**

```go
func (ls LightStore) Latest() LightBlock
```

- Expected postcondition
    - returns the highest light block

#### **[LCV-FUNC-ADD.1]**

```go
func (ls LightStore) Add(newBlock)
```

- Expected precondition
    - the lightstore is empty
- Expected postcondition
    - adds newBlock into light store

#### **[LCV-FUNC-STORE.1]**

```go
func (ls LightStore) store_chain(newLS LightStore)
```

- Expected postcondition
    - adds `newLS` to the lightStore.

#### **[LCV-FUNC-LATEST-VERIF.2]**

```go
func (ls LightStore) LatestVerified() LightBlock
```

- Expected postcondition
    - returns the highest light block whose state is `StateVerified`

#### **[LCV-FUNC-FILTER.1]**

```go
func (ls LightStore) FilterVerified() LightStore
```

- Expected postcondition
    - returns all the lightblocks of the lightstore with state `StateVerified`

#### **[LCV-FUNC-UPDATE.2]**

```go
func (ls LightStore) Update(lightBlock LightBlock, verfiedState
VerifiedState, root-height Height)
```

- Expected postcondition
    - the lightblock is part of the lightstore
    - The state of the LightBlock is set to *verifiedState*.
    - The verification-root of the LightBlock is set to *root-height*

```go
func (ls LightStore) TraceTo(lightBlock LightBlock) (LightBlock, LightStore)
```

- Expected postcondition
    - returns a **trusted** lightblock `root` from the lightstore with a height
      less than `lightBlock`
    - returns a lightstore that contains lightblocks that constitute a
      [verification trace](TODOlinkToDetectorSpecOnceThere) from
      `root` to `lightBlock` (including `lightBlock`)

### Inputs

- *root*: A light block that is trusted
- *primary*: peerID
- *targetHeight*: the height of the needed header

### Configuration Parameters

- *trustThreshold*: a float. Can be used if correctness should not be based on more voting power and 1/3.
- *trustingPeriod*: a time duration [**[TMBC-TIME_PARAMS.1]**][TMBC-TIME_PARAMS-link].
- *clockDrift*: a time duration. Correction parameter dealing with only approximately synchronized clocks.

### Variables

- *nextHeight*: initially *targetHeight*
  > *nextHeight* should be thought of the "height of the next header we need
  > to download and verify"

### Assumptions

#### **[LCV-A-INIT.2]**

- *root* is from the blockchain

- *targetHeight > root.Header.Height*

### Invariants

#### **[LCV-INV-TP.1]**

It is always the case that *LightStore.LatestTrusted.Header.Time > now - trustingPeriod*.

> If the invariant is violated, the light client does not have a
> header it can trust. A trusted header must be obtained externally,
> its trust can only be based on social consensus.  
> We use the convention that root is assumed to be verified.

### Used Remote Functions

We use the functions `commit` and `validators` that are provided
by the [RPC client for Tendermint][RPC].

```go
func Commit(height int64) (SignedHeader, error)
```

- Implementation remark
    - RPC to full node *n*
    - JSON sent:

```javascript
// POST /commit
{
 "jsonrpc": "2.0",
 "id": "ccc84631-dfdb-4adc-b88c-5291ea3c2cfb", // UUID v4, unique per request
 "method": "commit",
 "params": {
  "height": 1234
 }
}
```

- Expected precondition
    - header of `height` exists on blockchain
- Expected postcondition
    - if *n* is correct: Returns the signed header of height `height`
  from the blockchain if communication is timely (no timeout)
    - if *n* is faulty: Returns a signed header with arbitrary content
- Error condition
    - if *n* is correct: precondition violated or timeout
    - if *n* is faulty: arbitrary error

----;

```go
func Validators(height int64) (ValidatorSet, error)
```

- Implementation remark
    - RPC to full node *n*
    - JSON sent:

```javascript
// POST /validators
{
 "jsonrpc": "2.0",
 "id": "ccc84631-dfdb-4adc-b88c-5291ea3c2cfb", // UUID v4, unique per request
 "method": "validators",
 "params": {
  "height": 1234
 }
}
```

- Expected precondition
    - header of `height` exists on blockchain
- Expected postcondition
    - if *n* is correct: Returns the validator set of height `height`
  from the blockchain if communication is timely (no timeout)
    - if *n* is faulty: Returns arbitrary validator set
- Error condition
    - if *n* is correct: precondition violated or timeout
    - if *n* is faulty: arbitrary error

----;

### Communicating Function

#### **[LCV-FUNC-FETCH.1]**

  ```go
func FetchLightBlock(peer PeerID, height Height) LightBlock
```

- Implementation remark
    - RPC to peer at *PeerID*
    - calls `Commit` for *height* and `Validators` for *height* and *height+1*
- Expected precondition
    - `height` is less than or equal to height of the peer **[LCV-IO-PRE-HEIGHT.1]**
- Expected postcondition:
    - if *node* is correct:
        - Returns the LightBlock *lb* of height `height`
      that is consistent with the blockchain
        - *lb.provider = peer* **[LCV-IO-POST-PROVIDER.1]**
        - *lb.Header* is a header consistent with the blockchain
        - *lb.Validators* is the validator set of the blockchain at height *nextHeight*
        - *lb.NextValidators* is the validator set of the blockchain at height *nextHeight + 1*
    - if *node* is faulty: Returns a LightBlock with arbitrary content
    [**[TMBC-AUTH-BYZ.1]**][TMBC-Auth-Byz-link]
- Error condition
    - if *n* is correct: precondition violated
    - if *n* is faulty: arbitrary error
    - if *lb.provider != peer*
    - times out after 2 Delta (by assumption *n* is faulty)

----;

## Core Verification

### Outline

The `VerifyToTarget` is the main function and uses the following functions.

- `FetchLightBlock` is called to download the next light block. It is
  the only function that communicates with other nodes
- `ValidAndVerified` checks whether header is valid and checks if a
  new lightBlock should be trusted
  based on a previously verified lightBlock.
- `Schedule` decides which height to try to verify next

In the following description of `VerifyToTarget` we do not deal with error
handling. If any of the above function returns an error, VerifyToTarget just
passes the error on.

#### **[LCV-FUNC-MAIN.2]**

```go
func VerifyToTarget(primary PeerID, root LightBlock,
                    targetHeight Height) (LightStore, Result) {

    lightStore = new LightStore;
    lightStore.Update(root, StateVerified, root.verifiedBy);
    nextHeight := targetHeight;

    for lightStore.LatestVerified.height < targetHeight {

        // Get next LightBlock for verification
        current, found := lightStore.Get(nextHeight)
        if !found {
            current = FetchLightBlock(primary, nextHeight)
            lightStore.Update(current, StateUnverified, nil)
        }

        // Verify
        verdict = ValidAndVerified(lightStore.LatestVerified, current)

        // Decide whether/how to continue
        if verdict == SUCCESS {
            lightStore.Update(current, StateVerified, lightStore.LatestVerified.Height)
        }
        else if verdict == NOT_ENOUGH_TRUST {
            // do nothing
            // the light block current passed validation, but the validator
            // set is too different to verify it. We keep the state of
            // current at StateUnverified. For a later iteration, Schedule
            // might decide to try verification of that light block again.
        }
        else {
            // verdict is some error code
            lightStore.Update(current, StateFailed, nil)
            return (nil, ResultFailure)
        }
        nextHeight = Schedule(lightStore, nextHeight, targetHeight)
    }
    return (lightStore.FilterVerified, ResultSuccess)
}
```

- Expected precondition
    - *root* is within the *trustingPeriod*  **[LCV-PRE-TP.1]**
    - *targetHeight* is greater than the height of *root*
- Expected postcondition:
    - returns *lightStore* that contains a LightBlock that corresponds to a block
     of the blockchain of height *targetHeight*
     (that is, the LightBlock has been added to *lightStore*) **[LCV-POST-LS.1]**
- Error conditions
    - if the precondition is violated
    - if `ValidAndVerified` or `FetchLightBlock` report an error
    - if [**[LCV-INV-TP.1]**](#LCV-INV-TP.1) is violated
  
### Details of the Functions

#### **[LCV-FUNC-VALID.2]**

```go
func ValidAndVerified(trusted LightBlock, untrusted LightBlock) Result
```

- Expected precondition:
    - *untrusted* is valid, that is, satisfies the soundness [checks][block]
    - *untrusted* is **well-formed**, that is,
        - *untrusted.Header.Time < now + clockDrift*
        - *untrusted.Validators = hash(untrusted.Header.Validators)*
        - *untrusted.NextValidators = hash(untrusted.Header.NextValidators)*
    - *trusted.Header.Time > now - trustingPeriod*
    - the `Height` and `Time` of `trusted` are smaller than the Height and
  `Time` of `untrusted`, respectively
    - the *untrusted.Header* is well-formed (passes the tests from
     [[block]]), and in particular
        - if the untrusted header `unstrusted.Header` is the immediate
   successor  of  `trusted.Header`, then it holds that
            - *trusted.Header.NextValidators =
    untrusted.Header.Validators*, and
    moreover,
            - *untrusted.Header.Commit*
                - contains signatures by more than two-thirds of the validators
                - contains no signature from nodes that are not in *trusted.Header.NextValidators*
- Expected postcondition:
    - Returns `SUCCESS`:
        - if *untrusted* is the immediate successor of *trusted*, or otherwise,
        - if the signatures of a set of validators that have more than
             *max(1/3,trustThreshold)* of voting power in
             *trusted.Nextvalidators* is contained in
             *untrusted.Commit* (that is, header passes the tests
             [**[TMBC-VAL-CONTAINS-CORR.1]**][TMBC-VAL-CONTAINS-CORR-link]
             and [**[TMBC-VAL-COMMIT.1]**][TMBC-VAL-COMMIT-link])
    - Returns `NOT_ENOUGH_TRUST` if:
        - *untrusted* is *not* the immediate successor of
           *trusted*
     and the  *max(1/3,trustThreshold)* threshold is not reached
           (that is, if
      [**[TMBC-VAL-CONTAINS-CORR.1]**][TMBC-VAL-CONTAINS-CORR-link]
      fails and header is does not violate the soundness
         checks [[block]]).
- Error condition:
    - if precondition violated

----;

#### **[LCV-FUNC-SCHEDULE.1]**

```go
func Schedule(lightStore, nextHeight, targetHeight) Height
```

- Implementation remark: If picks the next height to be verified.
  We keep the precise choice of the next header under-specified. It is
  subject to performance optimizations that do not influence the correctness
- Expected postcondition: **[LCV-SCHEDULE-POST.1]**
   Return *H* s.t.
   1. if *lightStore.LatestVerified.Height = nextHeight* and
      *lightStore.LatestVerified < targetHeight* then  
   *nextHeight < H <= targetHeight*
   2. if *lightStore.LatestVerified.Height < nextHeight* and
      *lightStore.LatestVerified.Height < targetHeight* then  
   *lightStore.LatestVerified.Height < H < nextHeight*
   3. if *lightStore.LatestVerified.Height = targetHeight* then  
     *H =  targetHeight*

> Case i. captures the case where the light block at height *nextHeight*
> has been verified, and we can choose a height closer to the *targetHeight*.
> As we get the *lightStore* as parameter, the choice of the next height can
> depend on the *lightStore*, e.g., we can pick a height for which we have
> already downloaded a light block.
> In Case ii. the header of *nextHeight* could not be verified, and we need to pick a smaller height.
> In Case iii. is a special case when we have verified the *targetHeight*.

### Solving the distributed specification

Analogous to [[001_published]](./verification_001_published.md#solving-the-distributed-specification)

## Liveness Scenarios

Analogous to [[001_published]](./verification_001_published.md#liveness-scenarios)

# Part V - Supporting the IBC Relayer

The above specification focuses on the most common case, which also
constitutes the most challenging task: using the Tendermint [security
model][TMBC-FM-2THIRDS-link] to verify light blocks without
downloading all intermediate blocks. To focus on this challenge, above
we have restricted ourselves to the case where  *targetHeight* is
greater than the height of any trusted header. This simplified
presentation of the algorithm as initially
`lightStore.LatestVerified()` is less than *targetHeight*, and in the
process of verification `lightStore.LatestVerified()` increases until
*targetHeight* is reached.

For [IBC][ibc-rs] there are two additional challenges:

1. it might be that some "older" header is needed, that is,
*targetHeight < lightStore.LatestVerified()*.  The
[supervisor](../supervisor/supervisor.md) checks whether it is in this
case by calling `LatestPrevious` and `MinVerified` and if so it calls
`Backwards`. All these functions are specified below.

2. In order to submit proof of a light client attack, a relayer may
   need to submit a verification trace. This it is important to
   compute such a trace efficiently. That it can be done is based on
   the invariant [[LCV-INV-LS-ROOT.2]](#LCV-INV-LS-ROOT2) that needs
   to be maintained by the light client. In particular
   `VerifyToTarget` and `Backwards` need to take care of setting
   `verification-root`.

#### **[LCV-FUNC-LATEST-PREV.2]**

```go
func (ls LightStore) LatestPrevious(height Height) (LightBlock, bool)
```

- Expected postcondition
    - returns a light block *lb* that satisfies:
        - *lb* is in lightStore
        - *lb* is in StateTrusted
        - *lb* is not expired
        - *lb.Header.Height < height*
        - for all *b* in lightStore s.t. *b* is trusted and not expired it
          holds *lb.Header.Height >= b.Header.Height*
    - *false* in the second argument if
      the LightStore does not contain such an *lb*.

----;

#### **[LCV-FUNC-LOWEST.2]**

```go
func (ls LightStore) Lowest() (LightBlock)
```

- Expected postcondition
    - returns the lowest trusted light block within trusting period

----;

#### **[LCV-FUNC-MIN.2]**

```go
func (ls LightStore) MinVerified() (LightBlock, bool)
```

- Expected postcondition
    - returns a light block *lb* that satisfies:
        - *lb* is in lightStore
        - *lb.Header.Height* is minimal in the lightStore
    - *false* in the second argument if
      the LightStore does not contain such an *lb*.

If a height that is smaller than the smallest height in the lightstore
is required, we check the hashes backwards. This is done with the
following function:

#### **[LCV-FUNC-BACKWARDS.2]**

```go
func Backwards (primary PeerID, root LightBlock, targetHeight Height)
               (LightStore, Result) {
  
    lb := root;
    lightStore := new LightStore;
    lightStore.Update(lb, StateTrusted, lb.verifiedBy)

    latest := lb.Header
    for i := lb.Header.height - 1; i >= targetHeight; i-- {
        // here we download height-by-height. We might first download all
        // headers down to targetHeight and then check them.
        current := FetchLightBlock(primary,i)
        if (hash(current) != latest.Header.LastBlockId) {
            return (nil, ResultFailure)
        }
        else {
            // latest and current are linked together by LastBlockId
            // therefore it is not relevant which we verified first
            // for consistency, we store latest was veried using
            // current so that the verifiedBy is always pointing down
            // the chain
            lightStore.Update(current, StateTrusted, nil)
            lightStore.Update(latest, StateTrusted, current.Header.Height)
        }
        latest = current
    }
    return (lightStore, ResultSuccess)
}
```

# References

[[block]] Specification of the block data structure.

[[RPC]] RPC client for Tendermint

[[attack-detector]] The specification of the light client attack detector.

[[fullnode]] Specification of the full node API

[[ibc-rs]] Rust implementation of IBC modules and relayer.

[[lightclient]] The light client ADR [77d2651 on Dec 27, 2019].

[RPC]: https://docs.tendermint.com/v0.34/rpc/

[block]: https://github.com/tendermint/spec/blob/d46cd7f573a2c6a2399fcab2cde981330aa63f37/spec/core/data_structures.md

[TMBC-HEADER-link]: #tmbc-header1
[TMBC-SEQ-link]: #tmbc-seq1
[TMBC-CorrFull-link]: #tmbc-corr-full1
[TMBC-Auth-Byz-link]: #tmbc-auth-byz1
[TMBC-TIME_PARAMS-link]: #tmbc-time-params1
[TMBC-FM-2THIRDS-link]: #tmbc-fm-2thirds1
[TMBC-VAL-CONTAINS-CORR-link]: #tmbc-val-contains-corr1
[TMBC-VAL-COMMIT-link]: #tmbc-val-commit1
[TMBC-SOUND-DISTR-POSS-COMMIT-link]: #tmbc-sound-distr-poss-commit1

[lightclient]: https://github.com/interchainio/tendermint-rs/blob/e2cb9aca0b95430fca2eac154edddc9588038982/docs/architecture/adr-002-lite-client.md
[attack-detector]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_001_reviewed.md
[fullnode]: https://github.com/tendermint/tendermint/blob/v0.34.x/spec/blockchain/fullnode.md

[ibc-rs]:https://github.com/informalsystems/ibc-rs

[blockchain-validator-set]: https://github.com/tendermint/tendermint/blob/v0.34.x/spec/blockchain/blockchain.md#data-structures
[fullnode-data-structures]: https://github.com/tendermint/tendermint/blob/v0.34.x/spec/blockchain/fullnode.md#data-structures

[FN-ManifestFaulty-link]: https://github.com/tendermint/tendermint/blob/v0.34.x/spec/blockchain/fullnode.md#fn-manifestfaulty

[arXiv]: https://arxiv.org/abs/1807.04938
