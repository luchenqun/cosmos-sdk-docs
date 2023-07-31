# 轻客户端攻击检测器

在本规范中，我们加强了轻客户端以抵抗所谓的轻客户端攻击。在轻客户端攻击中，所有正确的Tendermint全节点都同意生成的区块序列（没有分叉），但一组有故障的全节点通过生成（签名）一个与区块链上相同高度的区块不一致的区块来攻击轻客户端。为了做到这一点，其中一些有故障的全节点必须之前是验证者，并违反了“正确投票权超过三分之二”的假设[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]，否则，如果[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]成立，[验证][verification]将满足[[LCV-SEQ-SAFE.1]][LCV-SEQ-SAFE-link]。

攻击检测器（简称检测器）是轻客户端在与主节点进行[验证][verification]后，与其他节点（次要节点）交叉检查新学习到的轻区块的机制。它的输入包括一个具有某个高度*root*（作为信任根源）的轻区块和主节点提供的验证跟踪（轻区块序列）。

如果检测器观察到轻客户端攻击，它会计算证据数据，这些数据可以被Tendermint全节点用来隔离仍处于解绑期内的一组有故障的全节点（在链上某个区块上的验证者集合的投票权超过三分之一），并通过ABCI（应用程序/区块链接口）向Tendermint区块链的应用程序报告它们，以惩罚有故障的节点。

## 本文档的背景

轻客户端[验证][verification]规范是为Tendermint故障模型（1/3假设）[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]设计的。在这个假设下，它是安全的，并且如果能够可靠地（即没有消息丢失、没有重复，且最终被传递）和及时地与正确的全节点进行通信，它是活跃的。如果[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]假设被违反，轻客户端可能会被欺骗相信一个不是由Tendermint共识生成的轻区块。

这个规范，攻击检测器，是一种“第二道防线”，用于在1/3假设被违反时进行检测。其目标是检测轻客户端攻击（冲突的轻区块）并收集证据。然而，探测所有全节点是不切实际的。目前，我们考虑采用一种简单的方案，即维护一个已知全节点的地址簿，最初选择其中的一小部分（例如4个）进行通信。在项目的后期阶段可以考虑更复杂的记录保留方案，具有概率保证。

轻客户端维护一个简单的地址簿，其中包含它可以选择作为主节点和备用节点的全节点的地址。为了获取一个新的轻区块，轻客户端首先与主节点进行[验证][verification]，然后使用本规范与备用节点交叉检查轻区块（以及导致轻区块的轻区块的轨迹）。

# 大纲

- [第一部分](#part-i---Tendermint-Consensus-and-Light-Client-Attacks)：基于Tendermint共识的轻客户端攻击的形式化定义，基于基本的属性。
    - [基于节点的攻击特征](#Node-based-characterization-of-attacks)：在本规范的问题陈述中使用的攻击定义。
    - [基于区块的攻击特征](#Block-based-characterization-of-attacks)：提供未来参考的替代定义。

- [第二部分](#part-ii---problem-statement)：轻客户端攻击检测的问题陈述。
    - [非正式问题陈述](#informal-problem-statement)
    - [假设](#Assumptions)
    - [定义](#definitions)
    - [分布式问题陈述](#Distributed-Problem-statement)

- [第三部分](#part-iii---protocol)：协议。
    - [在其他规范中定义的函数和数据](#Functions-and-Data-defined-in-other-Specifications)
    - [解决方案概述](#Outline-of-solution)
    - [函数的详细信息](#Details-of-the-functions)
    - [正确性论证](#Correctness-arguments)

# 第一部分 - Tendermint共识和轻客户端攻击

在本节中，我们将对轻客户端攻击（在本规范中考虑的攻击）的数学定义进行说明，并解释它们与主链分叉的区别。为此，我们首先定义了Tendermint共识在正常操作中决定的区块序列的一些属性（如果Tendermint故障模型成立[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]），然后定义了对应于攻击场景的不同偏差。我们考虑了“轻区块”[light blocks][LCV-LB-link]和“头部”[headers][LVC-HD-link]的概念。

#### **[TMBC-GENESIS.1]**

让*Genesis*是约定的初始区块（文件）。

#### **[TMBC-FUNC-SIGN.1]**

让*b*和*c*是两个轻区块，其中*b.Header.Height + 1 = c.Header.Height*。我们定义谓词**signs(b,c)**成立，当且仅当*c.Header.LastCommit*在*PossibleCommit(b)*中。
[[TMBC-SOUND-DISTR-POSS-COMMIT.1]][TMBC-SOUND-DISTR-POSS-COMMIT-link]。

> 上述编码了顺序验证，也就是直观地说，b.Header.NextValidators = c.Header.Validators，并且这些验证者中的2/3签署了c。

#### **[TMBC-FUNC-SUPPORT.1]**

让*b*和*c*是两个轻区块。我们定义谓词**supports(b,c,t)**成立，当且仅当

- *t - trustingPeriod < b.Header.Time < t*
- *c.Commit*中节点在*b.NextValidators*中的投票权超过*b.Header.NextValidators*的1/3

> 也就是说，如果[Tendermint故障模型][TMBC-FM-2THIRDS-link]成立，则*c*至少被一个正确的全节点签署，参见[[TMBC-VAL-CONTAINS-CORR.1]][TMBC-VAL-CONTAINS-CORR-link]。以下正式说明了*Tendermint*正确生成了*b*；*b*可以追溯到创世区块。

#### **[TMBC-SEQ-ROOTED.1]**

让*b*是一个轻区块。
当对于所有的*i*，*1 <= i < h = b.Header.Height*，存在轻区块*a(i)*满足以下条件时，我们定义*sequ-rooted(b)*成立：

- *a(1) = Genesis*
- *a(h) = b*
- *signs( a(i) , a(i+1) )*。

> 以下正式说明了在跳过验证中，*c*基于*b*是可信的。请注意，我们在这里（尚）不要求*b*是正确生成的。

#### **[TMBC-SKIP-TRACE.1]**

设 *b* 和 *c* 为轻区块。我们定义 *skip-trace(b,c,t)*，如果在时间 t 存在整数 *h* 和序列 *a(1)*, ... *a(h)*，满足以下条件：

- *a(1) = b*，
- *a(h) = c*，
- 对于所有的 i，*1 <= i < h*，*supports( a(i), a(i+1), t)*。

我们称这样的序列 *a(1)*, ... *a(h)* 为**验证追踪**。

> 下面的内容明确了相同高度的两个轻区块应该在头部内容上达成一致。注意，*b* 和 *c* 可能在 Commit 上存在差异。这是一个特殊情况，如果尚未决定规范的提交，即如果 b.Header.Height 是 Tendermint 在此刻决定的所有区块中的最大高度。

#### **[TMBC-SIGN-SKIP-MATCH.1]**

设 *a*, *b*, *c* 为轻区块，*t* 为时间，我们定义 *sign-skip-match(a,b,c,t) = true*，当且仅当以下蕴含式为真：

- *sequ-rooted(a)*，
- *b.Header.Height = c.Header.Height*，
- *skip-trace(a,b,t)*，
- *skip-trace(a,c,t)*，

则 *b.Header = c.Header*。

> 注意，*sign-skip-match* 是通过蕴含式定义的。如果它的值为假，这意味着蕴含式的左边为真，右边为假。特别地，存在两个**不同的**头部 *b* 和 *c*，它们都可以从链中的一个共同区块 *a* 进行验证。因此，以下描述了一种攻击。

#### **[TMBC-ATTACK.1]**

如果存在三个轻区块 a, b 和 c，满足 *sign-skip-match(a,b,c,t) = false*，则我们有一个*攻击*。我们称其为**攻击高度** *b.Header.Height*，并写作 *attack(a,b,c,t)*。

> 轻区块 *a* 不一定是唯一的，也就是说，可能有多个区块满足上述要求，对于相同的 *b* 和 *c*。

[[TMBC-ATTACK.1]](#TMBC-ATTACK1) 是基于共识结果，即生成的区块，违反一致性属性的一个形式化描述。

**备注。**
只有当超过 1/3 的验证者（或下一个验证者）在某个先前区块中偏离协议时，才可能违反一致性。即将到来的“可追究责任”规范将描述如何从两个冲突的区块中计算出至少 1/3 个故障节点的集合。 []

有不同的方式来描述分叉和攻击场景。本规范使用“基于节点的攻击描述”，重点关注受影响的节点类型（轻节点 vs. 全节点）。为了以后的参考和讨论，我们还提供了下面的“基于区块的攻击描述”。

## 基于节点的攻击描述

#### **[TMBC-MC-FORK.1]**

我们称在时间 *t* 存在（主链）分叉，如果满足以下条件：

- 存在两个正确的全节点 *i* 和 *j*，
- *i* 不等于 *j*，
- *i* 已经决定了 *b*，
- *j* 已经决定了 *c*，
- 存在 *a* 使得 *attack(a,b,c,t)* 成立。

#### **[TMBC-LC-ATTACK.1]**

我们称在时间 *t* 存在轻客户端攻击，如果满足以下条件：

- 没有（主链）分叉 [[TMBC-MC-FORK.1]](#TMBC-MC-FORK1)，
- 存在计算了轻区块 *b* 和 *c* 的节点，
- 存在 *a* 使得 *attack(a,b,c,t)* 成立。

我们称该攻击发生在高度 *a.Header.Height*。

> 在本规范中，我们考虑轻客户端攻击的检测。直观地说，我们考虑的情况是轻区块 *b* 是来自区块链的区块，某个攻击者计算了 *c* 并试图错误地说服轻客户端 *c* 是来自该链的区块。

#### **[TMBC-LC-ATTACK-EVIDENCE.1]**

我们考虑轻客户端攻击的以下情况 [[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)：

- *attack(a,b,c,t)*
- 存在一个对等节点 p1，它有一个从 *a* 到 *b* 的区块序列 *chain*
- *skip-trace(a,c,t)*：根据 [[TMBC-SKIP-TRACE.1]](#TMBC-SKIP-TRACE1)，存在一个验证追踪 *v*，形式为 *a = v(1)*, ... *v(h) = c*

对于证明攻击给 p1 的证据，索引 i 的证据包括 v(i) 和 v(i+1)，满足以下条件：

- E1(i). v(i) 等于 *chain* 中高度为 v(i).Height 的区块，
- E2(i). v(i+1) 不同于 *chain* 中高度为 v(i+1).height 的区块。

> 注意 p1 可以
>
> - 检查 v(i+1) 与其在该高度的区块是否不同，并且
> - 通过一步验证 v(i+1) 从 v(i) 进行验证，因为 v 是一个验证追踪。

#### **[TMBC-LC-EVIDENCE-DATA.1]**

为了证明对p1的攻击，基于点E1，只需提交以下信息：

- v(i).Height（而不是v(i)）
- v(i+1)

这些信息是*v(i).Height的证据*。

## 基于区块的攻击特征

在本节中，我们提供了一种不同的攻击特征。它不是基于受影响的节点，而是纯粹基于区块的内容。从这个意义上说，这些定义不太具体。

> 它们可能与链上分叉场景的更详细分析相关，但超出了本规范的范围。

#### **[TMBC-SIGN-UNIQUE.1]**

设*b*和*c*为轻区块，我们定义谓词*sign-unique(b,c)*，当以下蕴含式为真时，它的值为真：

- *b.Header.Height = c.Header.Height* 且
- *sequ-rooted(b)* 且
- *sequ-rooted(c)*

蕴含 *b = c*。

#### **[TMBC-BLOCKS-MCFORK.1]**

如果存在两个轻区块b和c，使得*sign-unique(b,c) = false*，则我们有一个*分叉*。

> 上述定义与[[TMBC-MC-FORK.1]](#TMBC-MC-FORK1)的区别微妙。后者要求一个完整节点受到恶意区块的影响，而[[TMBC-BLOCKS-MCFORK.1]](#TMBC-BLOCKS-MCFORK1)只要求存在一个恶意区块，可能在攻击者的内存中。下面描述了一个轻客户端分叉。在区块b的高度之前没有分叉。然而，c是该高度的区块，它与b不同，并且通过了跳过验证。这是比[[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)更严格的属性，因为[[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)要求没有正确的完整节点受到影响。

#### **[TMBC-BLOCKS-LCFORK.1]**

设*a*、*b*、*c*为轻区块，*t*为时间。当满足以下条件时，我们定义*light-client-fork(a,b,c,t)*：

- *sign-skip-match(a,b,c,t) = false* 且
- *sequ-rooted(b)* 且
- *b*是“唯一”的，即对于所有*d*，*sequ-rooted(d)* 且 *d.Header.Height = b.Header.Height* 蕴含 *d = b*

> 最后，让我们也定义没有支持的虚假区块。请注意，即使存在分叉，虚假区块也是有定义的。此外，对于定义来说，将*a*限制为*a.height < b.height*就足够了（这是由展开到*supports()*的定义所蕴含的）。

#### **[TMBC-BOGUS.1]**

设 *b* 为一个轻区块，*t* 为一个时间。我们定义 *bogus(b,t)* 当且仅当：

- *sequ-rooted(b) = false* 并且
- 对于所有的 *a*，*sequ-rooted(a)* 蕴含 *skip-trace(a,b,t) = false*

# 第二部分 - 问题陈述

## 非正式问题陈述

没有顺序规范：检测器只在一些节点行为不端的分布式系统中才有意义。

我们假设全节点和验证节点负责检测主链上的攻击，而证据反应器负责通过 ABCI 将证据广播给应用程序，以及在出现分叉时停止链的运行。这个规范的目的是保护轻客户端免受全节点无法检测到的攻击，并且完全由轻客户端（以及因此使用轻客户端协议观察区块链状态的 IBC 中继器）来处理。为了激励全节点在与轻客户端通信时遵循协议，该规范还考虑生成证据，这些证据也将由 Tendermint 区块链进行处理。

#### **[LCD-IP-MODEL.1]**

该检测器的设计基于以下假设：

- [[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link] 可能被违反
- 主链上没有分叉。

> 结果是一些有故障的全节点可能对轻客户端发起攻击。

以下要求是操作性的，因为它们描述了应该如何做，而不是应该做什么。然而，它们并不构成时间逻辑验证条件。有关这方面的条件，请参见下面的 [LCD-DIST-*]。

在 [supervisor][supervisor] 中调用检测器如下所示：

```go
Evidences := AttackDetector(root_of_trust, verifiedLS);`
```

其中

- `root-of-trust` 是一个被信任的轻区块（也就是说，在初始化之外，主节点和备份节点在过去达成了一致），并且
- `verifiedLS` 是一个包含验证跟踪的轻存储，该验证跟踪从一个可以在一步中使用 `root-of-trust` 进行验证的轻区块开始，以用户请求的高度结束
- `Evidences` 是一组关于不当行为的证据

#### **[LCD-IP-STATEMENT.1]**

每当调用 AttackDetector 时，检测器应该对每个次要交叉检查 verifiedLS 中的最大头部与次要提供的相同高度的头部进行比较。如果存在偏差，检测器应该尝试使用 verifiedLS 重新播放验证跟踪。

- 如果重新播放导致检测到轻客户端攻击（与 verifiedLS 中相同高度的轻区块与之不同），我们应该返回证据。
- 如果次要无法提供验证跟踪，我们无法证明存在攻击。块 *b* 可能是伪造的。在这种情况下，次要是有问题的，应该被替换。

## 假设

只要检测器连接至少一个正确的全节点，有故障的全节点就没有兴趣与检测器通信。这只会增加检测到不当行为的可能性。而且我们不能轻易（廉价地）惩罚它们。全节点不响应不一定是全节点的错。

正确的全节点有动机回应，因为检测器可以帮助他们了解他们的头部是否正确。因此，我们可以基于正确的全节点可靠地与检测器通信的假设来建立检测器的活跃性论证。

#### **[LCD-A-CorrFull.1]**

在任何时候，主节点和次要节点中至少有一个正确的全节点。

> 对于这个版本的检测，我们采取这个假设。它允许我们建立 lightblock 的“root-of-trust”始终是来自区块链的，并且我们可以将其用作证据计算的起点。此外，它允许我们在监督者中建立这样的不变性：（顶层）lightstore 中的任何 lightblock 都来自区块链。将来，我们可能会设计一个基于假设的轻客户端，即轻客户端定期连接到一个正确的全节点。这将要求检测器重新考虑“root-of-trust”，并从顶层 lightstore 中删除 lightblock。

#### **[LCD-A-RelComm.1]**

探测器与正确的全节点之间的通信是可靠且有时间限制的。可靠的通信意味着消息不会丢失、不会重复，并最终会被传递。存在一个已知的端到端延迟 *Delta*，如果一条消息在时间 *t* 发送，则在时间 *t + Delta* 之前会被接收和处理。这意味着我们需要至少 *2 Delta* 的超时时间来确保正确的对等方的响应在超时之前到达。

## 定义

### 证据

根据[[TMBC-LC-ATTACK-EVIDENCE.1]](#TMBC-LC-ATTACK-EVIDENCE1)的定义，我们将证据指代为以下类型的变量

#### **[LC-DATA-EVIDENCE.1]**

```go
type LightClientAttackEvidence struct {
    ConflictingBlock   LightBlock
    CommonHeight       int64

    // Evidence also includes application specific data which is not
    // part of verification but is sent to the application once the
    // evidence gets committed on chain.
}
```

由于上述数据是针对特定对等方计算的，以下数据结构包装了证据并添加了对等方ID。

#### **[LC-DATA-EVIDENCE-INT.1]**

```go
type InternalEvidence struct {
    Evidence           LightClientAttackEvidence
    Peer               PeerID
}
```

#### **[LC-SUMBIT-EVIDENCE.1]**

```go
func submitEvidence(Evidences []InternalEvidence)
```

- 预期后置条件
    - 对于 `Evidences` 中的每个 `ev`：将 `ev.Evidence` 提交给 `ev.Peer`

---

### LightStore

Lightblocks 和 LightStores 的定义在验证规范[[LCV-DATA-LIGHTBLOCK.1]][LCV-LB-link]和[[LCV-DATA-LIGHTSTORE.2]][LCV-LS-link]中。有关详细信息，请参阅[验证规范][verification]。

## 分布式问题陈述

> 由于攻击探测器的目的是减少错误节点的影响，并且错误节点意味着存在一个分布式系统，因此没有顺序规范可以参考此分布式问题陈述。

探测器的输入是一个可信的根 lightblock，称为 *root*，以及一个辅助的 lightstore，称为 *primary_trace*，其中包含之前已经验证过的 lightblocks，并且是由主节点提供的。

#### **[LCD-DIST-INV-ATTACK.1]**

如果探测器返回高度为 *h* 的证据[[TMBC-LC-EVIDENCE-DATA.1]](#TMBC-LC-EVIDENCE-DATA1)，则表示在高度 *h* 存在攻击。[[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)

#### **[LCD-DIST-INV-STORE.1]**

如果探测器没有返回证据，则*primary_trace*只包含来自区块链的区块。

#### **[LCD-DIST-LIVE.1]**

探测器最终终止。

#### **[LCD-DIST-TERM-NORMAL.1]**

如果

- *primary_trace*只包含来自区块链的区块，并且
- 没有攻击，并且
- *Secondaries*始终非空，并且
- *root*的年龄始终小于可信期限，

则探测器不返回证据。

#### **[LCD-DIST-TERM-ATTACK.1]**

如果

- 存在攻击，并且
- 一个辅助节点报告了与*primary_trace*中的某个区块冲突的区块，并且
- *Secondaries*始终非空，并且
- *root*的年龄始终小于可信期限，

则探测器返回证据。

> 注意，上述要求中我们要求"一个辅助节点报告了冲突的区块"。如果存在攻击，但没有辅助节点试图对探测器发起攻击（或者辅助节点的消息在网络中丢失），那么对我们来说就没有什么可检测的。

#### **[LCD-DIST-SAFE-SECONDARY.1]**

没有正确的辅助节点会被替换。

#### **[LCD-DIST-SAFE-BOGUS.1]**

如果

- 一个辅助节点报告了虚假的轻区块，并且
- *root*的年龄始终小于可信期限，

则在探测器终止之前替换该辅助节点。

> 上述属性是相当操作性的（例如，使用了"报告"一词），但它紧密地捕捉到了要求。由于探测器只在分布式环境中有意义，并且没有顺序规范，较不"纯粹"的规范是可以接受的。

# 第三部分 - 协议

## 在其他规范中定义的函数和数据

### 来自[supervisor][supervisor]

[[LC-FUNC-REPLACE-SECONDARY.1]][repl]

```go
Replace_Secondary(addr Address, root-of-trust LightBlock)
```

### 来自[verifier][verification]

[[LCV-FUNC-MAIN.2]][vtt]

```go
func VerifyToTarget(primary PeerID, root LightBlock,
                    targetHeight Height) (LightStore, Result)
```

请注意，`VerifyToTarget`通过函数[FetchLightBlock][fetch]与辅助节点进行通信。

### 轻客户端的共享数据

- 一个未被联系过的全节点池 *FullNodes*
- 一个称为 *Secondaries* 的对等集合
- 主节点

> 注意，不需要共享 lightStore。

## 解决方案概述

通过调用函数 `AttackDetector` 来解决所述问题，该函数使用包含刚刚被验证者验证的轻区块的 lightStore。

然后，`AttackDetector` 从 secondaries 下载头部。如果从 secondary 下载到了冲突的头部，它会调用 `CreateEvidenceForPeer` 来计算证据，以确认是否存在攻击。可能是 secondary 报告了一个虚假的区块，这意味着可能不存在攻击，并且需要替换该 secondary。

## 函数详细信息

#### **[LCD-FUNC-DETECTOR.2]:**

```go
func AttackDetector(root LightBlock, primary_trace []LightBlock)
                   ([]InternalEvidence) {

    Evidences := new []InternalEvidence;

    for each secondary in Secondaries {
        lb, result := FetchLightBlock(secondary,primary_trace.Latest().Header.Height);
        if result != ResultSuccess {
            Replace_Secondary(root);
        }
        else if lb.Header != primary_trace.Latest().Header {
  
            // we replay the primary trace with the secondary, in
            // order to generate evidence that we can submit to the
            // secondary. We return the evidence + the trace the
            // secondary told us that spans the evidence at its local store

            EvidenceForSecondary, newroot, secondary_trace, result :=
                    CreateEvidenceForPeer(secondary,
                                          root,
                                          primary_trace);
            if result == FaultyPeer {
                Replace_Secondary(root);
            }
            else if result == FoundEvidence {
                // the conflict is not bogus
                Evidences.Add(EvidenceForSecondary);
                // we replay the secondary trace with the primary, ...
                EvidenceForPrimary, _, result :=
                        CreateEvidenceForPeer(primary,
                                              newroot,
                                              secondary_trace);
                if result == FoundEvidence {
                    Evidences.Add(EvidenceForPrimary);
                }
                // At this point we do not care about the other error
                // codes. We already have generated evidence for an
                // attack and need to stop the lightclient. It does not
                // help to call replace_primary. Also we will use the
                // same primary to check with other secondaries in
                // later iterations of the loop
            }
            // In the case where the secondary reports NoEvidence
            // after initially it reported a conflicting header.
            // secondary is faulty
            Replace_Secondary(root);
        }
    }
    return Evidences;
}
```

- 预期前置条件
    - root 和 primary trace 是验证追踪
- 预期后置条件
    - 解决问题陈述（如果发现攻击，则报告证据）
- 错误条件
    - `ErrorTrustExpired`：如果 root 过期（超出信任期）[[LCV-INV-TP.1]][LCV-INV-TP1-link]
    - `ErrorNoPeers`：如果没有剩余的对等体来替换 secondaries，并且在此之前没有找到证据

---

```go
func CreateEvidenceForPeer(peer PeerID, root LightBlock, trace LightStore)
                          (Evidence, LightBlock, LightStore, result) {

    common := root;

    for i in 1 .. len(trace) {
        auxLS, result := VerifyToTarget(peer, common, trace[i].Header.Height)
  
        if result != ResultSuccess {
            // something went wrong; peer did not provide a verifiable block
            return (nil, nil, nil, FaultyPeer)
        }
        else {
            if auxLS.LatestVerified().Header != trace[i].Header {
                // the header reported by the peer differs from the
                // reference header in trace but both could be
                // verified from common in one step.
                // we can create evidence for submission to the secondary
                ev := new InternalEvidence;
                ev.Evidence.ConflictingBlock := trace[i];
                // CommonHeight is used to indicate the type of attack
                // if the CommonHeight != ConflictingBlock.Height this 
                // is by definition a lunatic attack else it is an
                // equivocation attack
                ev.Evidence.CommonHeight := common.Height;
                ev.Peer := peer
                return (ev, common, auxLS, FoundEvidence)
            }
            else {
                // the peer agrees with the trace, we move common forward.
                // we could delete auxLS as it will be overwritten in
                // the next iteration
                common := trace[i]
            }
        }
    }
    return (nil, nil, nil, NoEvidence)
}
```

- 预期前置条件
    - root 和 trace 是验证追踪
- 预期后置条件
    - 找到 trace 和 peer 分歧的证据
- 错误条件
    - `ErrorTrustExpired`：如果 root 过期（超出信任期）[[LCV-INV-TP.1]][LCV-INV-TP1-link]
    - 如果 `VerifyToTarget` 返回错误但 root 未过期，则返回 `FaultyPeer`

---

## 正确性论证

#### 关于证据存在性

**命题.** 在攻击的情况下，存在证据 [[TMBC-LC-ATTACK-EVIDENCE.1]](#TMBC-LC-ATTACK-EVIDENCE1)。  
*证明.* 首先观察到

- (A). (NOT E2(i)) 意味着 E1(i+1)

现假设不存在证据，通过反证法得出

- 对于所有 i，我们有 NOT E1(i) 或 NOT E2(i)
- 对于 i = 1，我们有 E1(1)，因此 NOT E2(1)
  因此通过对 i 进行归纳，根据 (A) 我们有对于所有 i 都成立的 **E1(i)**
- 从攻击中我们有 E2(h-1)，并且由于 i = h - 1 没有证据，我们得到 **NOT E1(h-1)**。矛盾。
证毕。

#### [[LCD-DIST-INV-ATTACK.1]](#LCD-DIST-INV-ATTACK1)的论证

在假设根和追踪是验证追踪的情况下，当在`CreateEvidenceForPeer`中检测器创建证据时，轻客户端已经看到了两个不同的头（一个通过`trace`，一个通过`VerifyToTarget`）对于相同高度的两个头都可以在一步中验证。

#### [[LCD-DIST-INV-STORE.1]](#LCD-DIST-INV-STORE1)的论证

我们假设至少有一个正确的节点，并且没有分叉。因此，正确的节点具有正确的区块序列。由于主追踪也会逐个区块地与每个次要追踪进行检查，并且在任何时候都没有生成证据，这意味着在任何时候都没有冲突的区块。

#### [[LCD-DIST-LIVE.1]](#LCD-DIST-LIVE1)的论证

最迟当违反[[LCV-INV-TP.1]][LCV-INV-TP1-link]时，`AttackDetector`终止。

#### [[LCD-DIST-TERM-NORMAL.1]](#LCD-DIST-TERM-NORMAL1)的论证

由于节点是有限的，最终主循环会终止。由于没有攻击，因此不会生成任何证据。

#### [[LCD-DIST-TERM-ATTACK.1]](#LCD-DIST-TERM-ATTACK1)的论证

与[[LCD-DIST-TERM-NORMAL.1]](#LCD-DIST-TERM-NORMAL1)类似的论证

#### [[LCD-DIST-SAFE-SECONDARY.1]](#LCD-DIST-SAFE-SECONDARY1)的论证

只有当次要追踪超时或报告虚假区块时，次要追踪才会被替换。前者被时间假设排除，后者被正确的节点只报告链上的区块排除。

#### [[LCD-DIST-SAFE-BOGUS.1]](#LCD-DIST-SAFE-BOGUS1)的论证

一旦识别出虚假区块，次要追踪将被移除。

# 参考资料

> 链接到本文档所引用的其他规范/ADR

[[verification]] 轻客户端验证的规范。

[[supervisor]] 轻客户端监督者的规范。

[verification]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md

[supervisor]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/supervisor/supervisor_001_draft.md

[block]: https://github.com/tendermint/spec/blob/d46cd7f573a2c6a2399fcab2cde981330aa63f37/spec/core/data_structures.md

[TMBC-FM-2THIRDS-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-fm-2thirds1

[TMBC-SOUND-DISTR-POSS-COMMIT-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-sound-distr-poss-commit1

[LCV-SEQ-SAFE-link]:https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-seq-safe1

[TMBC-VAL-CONTAINS-CORR-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-val-contains-corr1

[fetch]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-func-fetch1

[LCV-INV-TP1-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-inv-tp1

[LCV-LB-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-data-lightblock1

[LCV-LS-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-data-lightstore2

[LVC-HD-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-header-fields2

[repl]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/supervisor/supervisor_001_draft.md#lc-func-replace-secondary1

[vtt]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-func-main2


# Light Client Attack Detector

In this specification, we strengthen the light client to be resistant
against so-called light client attacks. In a light client attack, all
the correct Tendermint full nodes agree on the sequence of generated
blocks (no fork), but a set of faulty full nodes attack a light client
by generating (signing) a block that deviates from the block of the
same height on the blockchain. In order to do so, some of these faulty
full nodes must have been validators before and violate the assumption
of more than two thirds of "correct voting power"
[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link], as otherwise, if
[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link] would hold,
[verification][verification] would satisfy
[[LCV-SEQ-SAFE.1]][LCV-SEQ-SAFE-link].

An attack detector (or detector for short) is a mechanism that is used
by the light client [supervisor][supervisor] after
[verification][verification] of a new light block
with the primary, to cross-check the newly learned light block with
other peers (secondaries).  It expects as input a light block with some
height *root* (that serves as a root of trust), and a verification
trace (a sequence of lightblocks) that the primary provided.

In case the detector observes a light client attack, it computes
evidence data that can be used by Tendermint full nodes to isolate a
set of faulty full nodes that are still within the unbonding period
(more than 1/3 of the voting power of the validator set at some block
of the chain), and report them via ABCI (application/blockchain
interface)
to the application of a
Tendermint blockchain in order to punish faulty nodes.

## Context of this document

The light client [verification][verification] specification is
designed for the Tendermint failure model (1/3 assumption)
[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link].  It is safe under this
assumption, and live if it can reliably (that is, no message loss, no
duplication, and eventually delivered) and timely communicate with a
correct full node. If [[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]
assumption is violated, the light client can be fooled to trust a
light block that was not generated by Tendermint consensus.

This specification, the attack detector, is a "second line of
defense", in case the 1/3 assumption is violated.  Its goal is to
detect a light client attack (conflicting light blocks) and collect
evidence. However, it is impractical to probe all full nodes. At this
time we consider a simple scheme of maintaining an address book of
known full nodes from which a small subset (e.g., 4) are chosen
initially to communicate with. More involved book keeping with
probabilistic guarantees can be considered at later stages of the
project.

The light client maintains a simple address book containing addresses
of full nodes that it can pick as primary and secondaries.  To obtain
a new light block, the light client first does
[verification][verification] with the primary, and then cross-checks
the light block (and the trace of light blocks that led to it) with
the secondaries using this specification.

# Outline

- [Part I](#part-i---Tendermint-Consensus-and-Light-Client-Attacks):
  Formal definitions of lightclient attacks, based on basic
  properties of Tendermint consensus.
    - [Node-based characterization of
       attacks](#Node-based-characterization-of-attacks). The
       definition of attacks used in the problem statement of
    this specification.

    - [Block-based characterization of attacks](#Block-based-characterization-of-attacks). Alternative definitions
  provided for future reference.

- [Part II](#part-ii---problem-statement): Problem statement of
  lightclient attack detection
  
    - [Informal Problem Statement](#informal-problem-statement)
    - [Assumptions](#Assumptions)
    - [Definitions](#definitions)
    - [Distributed Problem statement](#Distributed-Problem-statement)
  
- [Part III](#part-iii---protocol): The protocol

    - [Functions and Data defined in other Specifications](#Functions-and-Data-defined-in-other-Specifications)
    - [Outline of Solution](#Outline-of-solution)
    - [Details of the functions](#Details-of-the-functions)
    - [Correctness arguments](#Correctness-arguments)

# Part I - Tendermint Consensus and Light Client Attacks

In this section we will give some mathematical definitions of what we
mean by light client attacks (that are considered in this
specification) and how they differ from main-chain forks. To this end,
we start by defining some properties of the sequence of blocks that is
decided upon by Tendermint consensus in normal operation (if the
Tendermint failure model holds
[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]),
and then define different
deviations that correspond to attack scenarios. We consider the notion
of [light blocks][LCV-LB-link] and [headers][LVC-HD-link].

#### **[TMBC-GENESIS.1]**

Let *Genesis* be the agreed-upon initial block (file).

#### **[TMBC-FUNC-SIGN.1]**

Let *b* and *c* be two light blocks with *b.Header.Height + 1 =
c.Header.Height*. We define the predicate **signs(b,c)** to hold
iff *c.Header.LastCommit* is in *PossibleCommit(b)*.
[[TMBC-SOUND-DISTR-POSS-COMMIT.1]][TMBC-SOUND-DISTR-POSS-COMMIT-link].

> The above encodes sequential verification, that is, intuitively,
> b.Header.NextValidators = c.Header.Validators and 2/3 of
> these Validators signed c.

#### **[TMBC-FUNC-SUPPORT.1]**

Let *b* and *c* be two light blocks. We define the predicate
**supports(b,c,t)** to hold iff

- *t - trustingPeriod < b.Header.Time < t*
- the voting power in *b.NextValidators* of nodes in *c.Commit*
  is more than 1/3 of *TotalVotingPower(b.Header.NextValidators)*

> That is, if the [Tendermint failure model][TMBC-FM-2THIRDS-link]
> holds, then *c* has been signed by at least one correct full node, cf.
> [[TMBC-VAL-CONTAINS-CORR.1]][TMBC-VAL-CONTAINS-CORR-link].
> The following formalizes that *b* was properly generated by
> Tendermint; *b* can be traced back to genesis.

#### **[TMBC-SEQ-ROOTED.1]**

Let *b* be a light block.
We define *sequ-rooted(b)* iff for all *i*, *1 <= i < h = b.Header.Height*,
there exist light blocks *a(i)* s.t.

- *a(1) = Genesis* and
- *a(h) = b* and
- *signs( a(i) , a(i+1) )*.

> The following formalizes that *c* is trusted based on *b* in
> skipping verification. Observe that we do not require here (yet)
> that *b* was properly generated.

#### **[TMBC-SKIP-TRACE.1]**

Let *b* and *c* be light blocks. We define *skip-trace(b,c,t)* if at
time t there exists an integer *h* and a sequence *a(1)*, ... *a(h)* s.t.

- *a(1) = b* and
- *a(h) = c* and
- *supports( a(i), a(i+1), t)*, for all i, *1 <= i < h*.

We call such a sequence *a(1)*, ... *a(h)* a **verification trace**.

> The following formalizes that two light blocks of the same height
> should agree on the content of the header. Observe that *b* and *c*
> may disagree on the Commit. This is a special case if the canonical
> commit has not been decided on yet, that is, if b.Header.Height is the
> maximum height of all blocks decided upon by Tendermint at this
> moment.

#### **[TMBC-SIGN-SKIP-MATCH.1]**

Let *a*, *b*, *c*, be light blocks and *t* a time, we define
*sign-skip-match(a,b,c,t) = true* iff the following implication
evaluates to true:

- *sequ-rooted(a)* and
- *b.Header.Height = c.Header.Height* and
- *skip-trace(a,b,t)*
- *skip-trace(a,c,t)*

implies *b.Header = c.Header*.

> Observe that *sign-skip-match* is defined via an implication. If it
> evaluates to false this means that the left-hand-side of the
> implication evaluates to true, and the right-hand-side evaluates to
> false. In particular, there are two **different** headers *b* and
> *c* that both can be verified from a common block *a* from the
> chain. Thus, the following describes an attack.

#### **[TMBC-ATTACK.1]**

If there exists three light blocks a, b, and c, with
*sign-skip-match(a,b,c,t) = false* then we have an *attack*.  We say
we have **an attack at height** *b.Header.Height* and write
*attack(a,b,c,t)*.

> The lightblock *a* need not be unique, that is, there may be
> several blocks that satisfy the above requirement for the same
> blocks *b* and *c*.

[[TMBC-ATTACK.1]](#TMBC-ATTACK1) is a formalization of the violation
of the agreement property based on the result of consensus, that is,
the generated blocks.

**Remark.**
Violation of agreement is only possible if more than 1/3 of the validators (or
next validators) of some previous block deviated from the protocol. The
upcoming "accountability" specification will describe how to compute
a set of at least 1/3 faulty nodes from two conflicting blocks. []

There are different ways to characterize forks
and attack scenarios. This specification uses the "node-based
characterization of attacks" which focuses on what kinds of nodes are
affected (light nodes vs. full nodes). For future reference and
discussion we also provide a
"block-based characterization of attacks" below.

## Node-based characterization of attacks

#### **[TMBC-MC-FORK.1]**

We say there is a (main chain) fork at time *t* if

- there are two correct full nodes *i* and *j* and
- *i* is different from *j* and
- *i* has decided on *b* and
- *j* has decided on *c* and
- there exist *a* such that *attack(a,b,c,t)*.

#### **[TMBC-LC-ATTACK.1]**

We say there is a light client attack at time *t*, if

- there is **no** (main chain) fork [[TMBC-MC-FORK.1]](#TMBC-MC-FORK1), and
- there exist nodes that have computed light blocks *b* and *c* and
- there exist *a* such that *attack(a,b,c,t)*.

We say the attack is at height *a.Header.Height*.

> In this specification we consider detection of light client
> attacks. Intuitively, the case we consider is that
> light block *b* is the one from the
> blockchain, and some attacker has computed *c* and tries to wrongly
> convince
> the light client that *c* is the block from the chain.

#### **[TMBC-LC-ATTACK-EVIDENCE.1]**

We consider the following case of a light client attack
[[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1):

- *attack(a,b,c,t)*
- there is a peer p1 that has a sequence *chain* of blocks from *a* to *b*
- *skip-trace(a,c,t)*: by [[TMBC-SKIP-TRACE.1]](#TMBC-SKIP-TRACE1) there is a
  verification trace *v* of the form *a = v(1)*, ... *v(h) = c*

Evidence for p1 (that proves an attack to p1) consists for index i
of v(i) and v(i+1) such that

- E1(i). v(i) is equal to the block of *chain* at height v(i).Height, and
- E2(i). v(i+1) that is different from  the block of *chain* at
  height v(i+1).height

> Observe p1 can
>
> - check that v(i+1)  differs from its block at that height, and
> - verify v(i+1) in one step from v(i) as v is a verification trace.

#### **[TMBC-LC-EVIDENCE-DATA.1]**

To prove the attack to p1, because of Point E1, it is sufficient to
submit

- v(i).Height (rather than v(i)).
- v(i+1)

This information is *evidence for height v(i).Height*.

## Block-based characterization of attacks

In this section we provide a different characterization of attacks. It
is not defined on the nodes that are affected but purely on the
content of the blocks. In that sense these definitions are less
operational.

> They might be relevant for a closer analysis of fork scenarios on the
> chain, which is out of the scope of this specification.
  
#### **[TMBC-SIGN-UNIQUE.1]**

Let *b* and *c* be  light blocks, we define the predicate
*sign-unique(b,c)* to evaluate to true iff the following implication
evaluates to true:

- *b.Header.Height =  c.Header.Height* and
- *sequ-rooted(b)* and
- *sequ-rooted(c)*

implies *b = c*.

#### **[TMBC-BLOCKS-MCFORK.1]**

If there exists two light blocks b and c, with *sign-unique(b,c) =
false* then we have a *fork*.

> The difference of the above definition to
> [[TMBC-MC-FORK.1]](#TMBC-MC-FORK1) is subtle. The latter requires a
> full node being affected by a bad block while
> [[TMBC-BLOCKS-MCFORK.1]](#TMBC-BLOCKS-MCFORK1) just requires that a
> bad block exists, possibly in memory of an attacker.
> The following captures a light client fork. There is no fork up to
> the height of block b. However, c is of that height, is different,
> and passes skipping verification. It is a stricter property than
> [[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1), as
> [[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1) requires that no correct full
> node is affected.

#### **[TMBC-BLOCKS-LCFORK.1]**

Let *a*, *b*, *c*, be light blocks and *t* a time. We define
*light-client-fork(a,b,c,t)* iff

- *sign-skip-match(a,b,c,t) = false* and
- *sequ-rooted(b)* and
- *b* is "unique", that is, for all *d*,  *sequ-rooted(d)* and
     *d.Header.Height = b.Header.Height* implies *d = b*

> Finally, let us also define bogus blocks that have no support.
> Observe that bogus is even defined if there is a fork.
> Also, for the definition it would be sufficient to restrict *a* to
> *a.height < b.height* (which is implied by the definitions which
> unfold until *supports()*).

#### **[TMBC-BOGUS.1]**

Let *b* be a light block and *t* a time. We define *bogus(b,t)* iff

- *sequ-rooted(b) = false* and
- for all *a*, *sequ-rooted(a)* implies *skip-trace(a,b,t) = false*
  
# Part II - Problem Statement
  
## Informal Problem statement

There is no sequential specification: the detector only makes sense
in a distributed systems where some nodes misbehave.

We work under the assumption that full nodes and validators are
responsible for detecting attacks on the main chain, and the evidence
reactor takes care of broadcasting evidence to communicate
misbehaving nodes via ABCI to the application, and halt the chain in
case of a fork. The point of this specification is to shield a light
clients against attacks that cannot be detected by full nodes, and
are fully addressed at light clients (and consequently IBC relayers,
which use the light client protocols to observe the state of a
blockchain). In order to provide full nodes the incentive to follow
the protocols when communicating with the light client, this
specification also considers the generation of evidence that will
also be processed by the Tendermint blockchain.

#### **[LCD-IP-MODEL.1]**

The detector is designed under the assumption that

- [[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link] may be violated
- there is no fork on the main chain.

> As a result some faulty full nodes may launch an attack on a light
> client.

The following requirements are operational in that they describe how
things should be done, rather than what should be done. However, they
do not constitute temporal logic verification conditions. For those,
see [LCD-DIST-*] below.

The detector is called in the [supervisor][supervisor] as follows

```go
Evidences := AttackDetector(root_of_trust, verifiedLS);`
```

where

- `root-of-trust` is a light block that is trusted (that is,
except upon initialization, the primary and the secondaries
agreed on in the past), and
- `verifiedLS` is a lightstore that contains a verification trace that
  starts from a lightblock that can be verified with the
  `root-of-trust` in one step and ends with a lightblock of the height
  requested by the user
- `Evidences` is a list of evidences for misbehavior

#### **[LCD-IP-STATEMENT.1]**

Whenever AttackDetector is called, the detector should for each
secondary cross check the largest header in verifiedLS with the
corresponding header of the same height provided by the secondary. If
there is a deviation, the detector should
try to replay the verification trace `verifiedLS` with the
secondary
  
- in case replaying leads to detection of a light client attack
  (one of the lightblocks differ from the one in verifiedLS with
  the same height), we should return evidence
- if the secondary cannot provide a verification trace, we have no
  proof for an attack. Block *b* may be bogus. In this case the
  secondary is faulty and it should be replaced.

## Assumptions

It is not in the interest of faulty full nodes to talk to the
detector as long as the  detector is connected to at least one
correct full node. This would only increase the likelihood of
misbehavior being detected. Also we cannot punish them easily
(cheaply). The absence of a response need not be the fault of the full
node.

Correct full nodes have the incentive to respond, because the
detector may help them to understand whether their header is a good
one. We can thus base liveness arguments of the  detector on
the assumptions that correct full nodes reliably talk to the
detector.

#### **[LCD-A-CorrFull.1]**

At all times there is at least one correct full
node among the primary and the secondaries.

> For this version of the detection we take this assumption. It
> allows us to establish the invariant that the lightblock
> `root-of-trust` is always the one from the blockchain, and we can
> use it as starting point for the evidence computation. Moreover, it
> allows us to establish the invariant at the supervisor that any
> lightblock in the (top-level) lightstore is from the blockchain.  
> In the future we might design a lightclient based on the assumption
> that at least in regular intervals the lightclient is connected to a
> correct full node. This will require the detector to reconsider
> `root-of-trust`, and remove lightblocks from the top-level
> lightstore.

#### **[LCD-A-RelComm.1]**

Communication between the  detector and a correct full node is
reliable and bounded in time. Reliable communication means that
messages are not lost, not duplicated, and eventually delivered. There
is a (known) end-to-end delay *Delta*, such that if a message is sent
at time *t* then it is received and processed by time *t + Delta*.
This implies that we need a timeout of at least *2 Delta* for remote
procedure calls to ensure that the response of a correct peer arrives
before the timeout expires.

## Definitions

### Evidence

Following the definition of
[[TMBC-LC-ATTACK-EVIDENCE.1]](#TMBC-LC-ATTACK-EVIDENCE1), by evidence
we refer to a variable of the following type

#### **[LC-DATA-EVIDENCE.1]**

```go
type LightClientAttackEvidence struct {
    ConflictingBlock   LightBlock
    CommonHeight       int64

    // Evidence also includes application specific data which is not
    // part of verification but is sent to the application once the
    // evidence gets committed on chain.
}
```

As the above data is computed for a specific peer, the following
data structure wraps the evidence and adds the peerID.

#### **[LC-DATA-EVIDENCE-INT.1]**

```go
type InternalEvidence struct {
    Evidence           LightClientAttackEvidence
    Peer               PeerID
}
```

#### **[LC-SUMBIT-EVIDENCE.1]**

```go
func submitEvidence(Evidences []InternalEvidence)
```

- Expected postcondition
    - for each `ev` in `Evidences`: submit `ev.Evidence` to `ev.Peer`

---

### LightStore

Lightblocks and LightStores are defined in the verification
specification [[LCV-DATA-LIGHTBLOCK.1]][LCV-LB-link]
and [[LCV-DATA-LIGHTSTORE.2]][LCV-LS-link]. See
the [verification specification][verification] for details.

## Distributed Problem statement

> As the attack detector is there to reduce the impact of faulty
> nodes, and faulty nodes imply that there is a distributed system,
> there is no sequential specification to which this distributed
> problem statement may refer to.

The detector gets as input a trusted lightblock called *root* and an
auxiliary lightstore called *primary_trace* with lightblocks that have
been verified before, and that were provided by the primary.

#### **[LCD-DIST-INV-ATTACK.1]**

If the detector returns evidence for height *h*
[[TMBC-LC-EVIDENCE-DATA.1]](#TMBC-LC-EVIDENCE-DATA1), then there is an
attack at height *h*. [[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)

#### **[LCD-DIST-INV-STORE.1]**

If the detector does not return evidence, then *primary_trace*
contains only blocks from the blockchain.

#### **[LCD-DIST-LIVE.1]**

The detector eventually terminates.

#### **[LCD-DIST-TERM-NORMAL.1]**

If

- the *primary_trace* contains only blocks from the blockchain, and
- there is no attack, and
- *Secondaries* is always non-empty, and
- the age of *root* is always less than the trusting period,

then the detector does not return evidence.

#### **[LCD-DIST-TERM-ATTACK.1]**

If

- there is an attack, and
- a secondary reports a block that conflicts
  with one of the blocks in *primary_trace*, and
- *Secondaries* is always non-empty, and
- the age of *root* is always less than the trusting period,

then the detector returns evidence.

> Observe that above we require that "a secondary reports a block that
> conflicts". If there is an attack, but no secondary tries to launch
> it against the detector (or the message from the secondary is lost
> by the network), then there is nothing to detect for us.

#### **[LCD-DIST-SAFE-SECONDARY.1]**

No correct secondary is ever replaced.

#### **[LCD-DIST-SAFE-BOGUS.1]**

If

- a secondary reports a bogus lightblock,
- the age of *root* is always less than the trusting period,

then the secondary is replaced before the detector terminates.

> The above property is quite operational (e.g., the usage of
> "reports"), but it captures closely the requirement. As the
> detector only makes sense in a distributed setting, and does not
> have a sequential specification, a less "pure" specification are
> acceptable.

# Part III - Protocol

## Functions and Data defined in other Specifications

### From the [supervisor][supervisor]

[[LC-FUNC-REPLACE-SECONDARY.1]][repl]

```go
Replace_Secondary(addr Address, root-of-trust LightBlock)
```

### From the [verifier][verification]

[[LCV-FUNC-MAIN.2]][vtt]

```go
func VerifyToTarget(primary PeerID, root LightBlock,
                    targetHeight Height) (LightStore, Result)
```

Observe that `VerifyToTarget` does communication with the secondaries
via the function [FetchLightBlock][fetch].

### Shared data of the light client

- a pool of full nodes *FullNodes* that have not been contacted before
- peer set called *Secondaries*
- primary

> Note that the lightStore is not needed to be shared.

## Outline of solution

The problem laid out is solved by calling the function `AttackDetector`
with a lightstore that contains a light block that has just been
verified by the verifier.

Then `AttackDetector` downloads headers from the secondaries. In case
a conflicting header is downloaded from a secondary, it calls
`CreateEvidenceForPeer` which computes evidence in the case that
indeed an attack is confirmed. It could be that the secondary reports
a bogus block, which means that there need not be an attack, and the
secondary is replaced.
  
## Details of the functions

#### **[LCD-FUNC-DETECTOR.2]:**

```go
func AttackDetector(root LightBlock, primary_trace []LightBlock)
                   ([]InternalEvidence) {

    Evidences := new []InternalEvidence;

    for each secondary in Secondaries {
        lb, result := FetchLightBlock(secondary,primary_trace.Latest().Header.Height);
        if result != ResultSuccess {
            Replace_Secondary(root);
        }
        else if lb.Header != primary_trace.Latest().Header {
  
            // we replay the primary trace with the secondary, in
            // order to generate evidence that we can submit to the
            // secondary. We return the evidence + the trace the
            // secondary told us that spans the evidence at its local store

            EvidenceForSecondary, newroot, secondary_trace, result :=
                    CreateEvidenceForPeer(secondary,
                                          root,
                                          primary_trace);
            if result == FaultyPeer {
                Replace_Secondary(root);
            }
            else if result == FoundEvidence {
                // the conflict is not bogus
                Evidences.Add(EvidenceForSecondary);
                // we replay the secondary trace with the primary, ...
                EvidenceForPrimary, _, result :=
                        CreateEvidenceForPeer(primary,
                                              newroot,
                                              secondary_trace);
                if result == FoundEvidence {
                    Evidences.Add(EvidenceForPrimary);
                }
                // At this point we do not care about the other error
                // codes. We already have generated evidence for an
                // attack and need to stop the lightclient. It does not
                // help to call replace_primary. Also we will use the
                // same primary to check with other secondaries in
                // later iterations of the loop
            }
            // In the case where the secondary reports NoEvidence
            // after initially it reported a conflicting header.
            // secondary is faulty
            Replace_Secondary(root);
        }
    }
    return Evidences;
}
```

- Expected precondition
    - root and primary trace are a verification trace
- Expected postcondition
    - solves the problem statement (if attack found, then evidence is reported)
- Error condition
    - `ErrorTrustExpired`: fails if root expires (outside trusting
    period) [[LCV-INV-TP.1]][LCV-INV-TP1-link]
    - `ErrorNoPeers`: if no peers are left to replace secondaries, and
    no evidence was found before that happened

---

```go
func CreateEvidenceForPeer(peer PeerID, root LightBlock, trace LightStore)
                          (Evidence, LightBlock, LightStore, result) {

    common := root;

    for i in 1 .. len(trace) {
        auxLS, result := VerifyToTarget(peer, common, trace[i].Header.Height)
  
        if result != ResultSuccess {
            // something went wrong; peer did not provide a verifiable block
            return (nil, nil, nil, FaultyPeer)
        }
        else {
            if auxLS.LatestVerified().Header != trace[i].Header {
                // the header reported by the peer differs from the
                // reference header in trace but both could be
                // verified from common in one step.
                // we can create evidence for submission to the secondary
                ev := new InternalEvidence;
                ev.Evidence.ConflictingBlock := trace[i];
                // CommonHeight is used to indicate the type of attack
                // if the CommonHeight != ConflictingBlock.Height this 
                // is by definition a lunatic attack else it is an
                // equivocation attack
                ev.Evidence.CommonHeight := common.Height;
                ev.Peer := peer
                return (ev, common, auxLS, FoundEvidence)
            }
            else {
                // the peer agrees with the trace, we move common forward.
                // we could delete auxLS as it will be overwritten in
                // the next iteration
                common := trace[i]
            }
        }
    }
    return (nil, nil, nil, NoEvidence)
}
```

- Expected precondition
    - root and trace are a verification trace
- Expected postcondition
    - finds evidence where trace and peer diverge
- Error condition
    - `ErrorTrustExpired`: fails if root expires (outside trusting
       period) [[LCV-INV-TP.1]][LCV-INV-TP1-link]
    - If `VerifyToTarget` returns error but root is not expired then return
 `FaultyPeer`

---

## Correctness arguments

#### On the existence of evidence

**Proposition.** In the case of attack,
evidence [[TMBC-LC-ATTACK-EVIDENCE.1]](#TMBC-LC-ATTACK-EVIDENCE1)
 exists.  
*Proof.* First observe that

- (A). (NOT E2(i)) implies E1(i+1)

Now by contradiction assume there is no evidence. Thus

- for all i, we have NOT E1(i) or NOT E2(i)
- for i = 1 we have E1(1) and thus NOT E2(1)
  thus by induction on i, by (A) we have for all i that **E1(i)**
- from attack we have E2(h-1), and as there is no evidence for
  i = h - 1 we get **NOT E1(h-1)**. Contradiction.
QED.

#### Argument for [[LCD-DIST-INV-ATTACK.1]](#LCD-DIST-INV-ATTACK1)

Under the assumption that root and trace are a verification trace,
when in `CreateEvidenceForPeer` the detector creates
evidence, then the lightclient has seen two different headers (one via
`trace` and one via `VerifyToTarget`) for the same height that can both
be verified in one step.

#### Argument for [[LCD-DIST-INV-STORE.1]](#LCD-DIST-INV-STORE1)

We assume that there is at least one correct peer, and there is no
fork. As a result, the correct peer has the correct sequence of
blocks. Since the primary_trace is checked block-by-block also against
each secondary, and at no point evidence was generated that means at
no point there were conflicting blocks.

#### Argument for [[LCD-DIST-LIVE.1]](#LCD-DIST-LIVE1)

At the latest when [[LCV-INV-TP.1]][LCV-INV-TP1-link] is violated,
`AttackDetector` terminates.

#### Argument for [[LCD-DIST-TERM-NORMAL.1]](#LCD-DIST-TERM-NORMAL1)

As there are finitely many peers, eventually the main loop
terminates. As there is no attack no evidence can be generated.

#### Argument for [[LCD-DIST-TERM-ATTACK.1]](#LCD-DIST-TERM-ATTACK1)

Argument similar to  [[LCD-DIST-TERM-NORMAL.1]](#LCD-DIST-TERM-NORMAL1)

#### Argument for [[LCD-DIST-SAFE-SECONDARY.1]](#LCD-DIST-SAFE-SECONDARY1)

Secondaries are only replaced if they time-out or if they report bogus
blocks. The former is ruled out by the timing assumption, the latter
by correct peers only reporting blocks from the chain.

#### Argument for [[LCD-DIST-SAFE-BOGUS.1]](#LCD-DIST-SAFE-BOGUS1)

Once a bogus block is recognized as such the secondary is removed.

# References

> links to other specifications/ADRs this document refers to

[[verification]] The specification of the light client verification.

[[supervisor]] The specification of the light client supervisor.

[verification]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md

[supervisor]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/supervisor/supervisor_001_draft.md

[block]: https://github.com/tendermint/spec/blob/d46cd7f573a2c6a2399fcab2cde981330aa63f37/spec/core/data_structures.md

[TMBC-FM-2THIRDS-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-fm-2thirds1

[TMBC-SOUND-DISTR-POSS-COMMIT-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-sound-distr-poss-commit1

[LCV-SEQ-SAFE-link]:https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-seq-safe1

[TMBC-VAL-CONTAINS-CORR-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-val-contains-corr1

[fetch]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-func-fetch1

[LCV-INV-TP1-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-inv-tp1

[LCV-LB-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-data-lightblock1

[LCV-LS-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-data-lightstore2

[LVC-HD-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-header-fields2

[repl]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/supervisor/supervisor_001_draft.md#lc-func-replace-secondary1

[vtt]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-func-main2
