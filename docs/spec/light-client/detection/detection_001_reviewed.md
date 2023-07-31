# ***这是一个未完成的草稿。欢迎评论！***

**TODO：** 我们需要对验证规范进行小的调整，以反映在LightStore中的语义（不再需要验证、可信、不可信等）。具体来说：

- Lightstore的状态需要消失。像`LatestVerified`这样的函数可以保留名称，但会忽略状态，因为它将不再存在。

- 验证规范应该适应`VerifyToTarget`的第二个参数为lightblock的情况；函数标签的新版本号；

- 我们应该澄清`VerifyToTarget`的期望，以便如果它返回`TimeoutError`，可以假定是有问题的。我猜想，使用正确的全节点进行`VerifyToTarget`应该不会以`TimeoutError`终止。

- 我们需要为新规范引入一个新的版本号。所以我们应该决定如何处理。

# 轻客户端攻击检测器

在本规范中，我们加强了轻客户端以抵御所谓的轻客户端攻击。在轻客户端攻击中，所有正确的Tendermint全节点都同意生成块的顺序（没有分叉），但一组有问题的全节点通过生成（签名）与区块链上相同高度的块不一致的块来攻击轻客户端。为了做到这一点，其中一些有问题的全节点必须之前是验证者，并违反了[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link)，否则，如果[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link)成立，[verification](verification)将满足[[LCV-SEQ-SAFE.1]](LCV-SEQ-SAFE-link)。

攻击检测器（或简称检测器）是轻客户端在与主节点进行[verification](verification)后，与其他节点（次要节点）交叉检查新学到的轻块的机制。它期望输入一个具有某个高度*root*（作为信任根）的轻块，以及主节点提供的验证跟踪（一系列轻块）。

如果检测器观察到轻客户端攻击，它会计算证据数据，这些数据可以被Tendermint全节点用来隔离仍处于解绑期的一组有问题的全节点（在链的某个块上，其投票权超过验证者集合的1/3），并通过ABCI将它们报告给Tendermint区块链的应用程序，以惩罚有问题的节点。

## 本文档的背景

轻客户端[验证](verification)规范是为Tendermint的故障模型（1/3假设）设计的[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link)。在这个假设下是安全的，并且如果能够可靠地（即没有消息丢失、没有重复，最终能够被传递）和及时地与正确的全节点进行通信，那么它是活跃的。如果违反了[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link)的假设，轻客户端可能会被欺骗，相信一个不是由Tendermint共识生成的轻区块。

这个规范，攻击检测器，是在1/3假设被违反的情况下的“第二道防线”。它的目标是检测轻客户端攻击（冲突的轻区块）并收集证据。然而，探测所有全节点是不切实际的。目前，我们考虑一个简单的方案，维护一个已知全节点的地址簿，最初选择其中的一小部分（例如4个）进行通信。在项目的后期可以考虑更复杂的记录保持方案，具有概率保证。

轻客户端维护一个简单的地址簿，其中包含它可以选择作为主节点和备用节点的全节点的地址。为了获取一个新的轻区块，轻客户端首先与主节点进行[验证](verification)，然后使用本规范通过与备用节点交叉检查轻区块（以及导致轻区块的轻区块的轨迹）。

## Tendermint共识和轻客户端攻击

在本节中，我们将给出一些数学定义，解释我们在本规范中所指的轻客户端攻击以及它们与主链分叉的区别。为此，我们首先定义了Tendermint共识在正常运行中（如果Tendermint故障模型成立[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link)）决定的区块序列的一些属性，然后定义了与攻击场景相对应的不同偏差。

#### **[TMBC-GENESIS.1]**

让*Genesis*是达成一致的初始区块（文件）。

#### **[TMBC-FUNC-SIGN.1]**

设*b*和*c*是两个轻区块，满足*b.Header.Height + 1 = c.Header.Height*。我们定义谓词**signs(b,c)**成立，当且仅当*c.Header.LastCommit*在*PossibleCommit(b)*中。
[[TMBC-SOUND-DISTR-POSS-COMMIT.1]](TMBC-SOUND-DISTR-POSS-COMMIT-link)。

> 上述编码了顺序验证，也就是直观地说，*b.Header.NextValidators = c.Header.Validators*，并且这些验证者中的2/3签署了*c*？

#### **[TMBC-FUNC-SUPPORT.1]**

设*b*和*c*是两个轻区块。我们定义谓词**supports(b,c,t)**成立，当且仅当：

- *t - trustingPeriod < b.Header.Time < t*
- *c.Commit*中节点在*b.NextValidators*中的投票权超过了*TotalVotingPower(b.Header.NextValidators)*的1/3

> 也就是说，如果[Tendermint故障模型](TMBC-FM-2THIRDS-link)成立，那么*c*至少被一个正确的全节点签署，参见[[TMBC-VAL-CONTAINS-CORR.1]](TMBC-VAL-CONTAINS-CORR-link)。
> 以下正式说明了*Tendermint*正确生成了*b*；*b*可以追溯到创世区块。

#### **[TMBC-SEQ-ROOTED.1]**

设*b*是一个轻区块。
我们定义*sequ-rooted(b)*成立，当且仅当对于所有的*i*，*1 <= i < h = b.Header.Height*，存在轻区块*a(i)*满足：

- *a(1) = Genesis*
- *a(h) = b*
- *signs( a(i) , a(i+1) )*.

> 以下正式说明了在跳过验证中，基于*b*对*c*的信任。注意，我们在这里（尚）不要求*b*是正确生成的。

#### **[TMBC-SKIP-TRACE.1]**

设*b*和*c*是轻区块。如果在时间t存在*h*和序列*a(1)*, ... *a(h)*满足：

- *a(1) = b*
- *a(h) = c*
- 对于所有的*i*，*1 <= i < h*，*supports( a(i), a(i+1), t)*.

我们称这样的序列*a(1)*, ... *a(h)*为**验证追踪**。

> 以下正式说明了相同高度的两个轻区块应该在头部内容上达成一致。注意，*b*和*c*可能在Commit上存在分歧。这是一个特殊情况，如果尚未决定规范的Commit，也就是说，如果*b.Header.Height*是*Tendermint*此刻决定的所有区块的最大高度。

#### **[TMBC-SIGN-SKIP-MATCH.1]**

对于轻区块 *a*、*b*、*c* 和时间 *t*，我们定义 *sign-skip-match(a,b,c,t) = true* 当且仅当以下蕴含式为真：

- *sequ-rooted(a)* 并且
- *b.Header.Height = c.Header.Height* 并且
- *skip-trace(a,b,t)* 并且
- *skip-trace(a,c,t)*

蕴含 *b.Header = c.Header*。

> 注意，*sign-skip-match* 是通过蕴含式定义的。如果其结果为假，这意味着蕴含式的左侧为真，右侧为假。特别地，存在两个**不同的**头部 *b* 和 *c*，它们都可以从链上的一个共同区块 *a* 进行验证。因此，以下描述了一种攻击。

#### **[TMBC-ATTACK.1]**

如果存在三个轻区块 *a*、*b* 和 *c*，使得 *sign-skip-match(a,b,c,t) = false*，则我们有一个*攻击*。我们称其为**攻击高度**为 *b.Header.Height*，并写作 *attack(a,b,c,t)*。

> 轻区块 *a* 不一定是唯一的，也就是说，可能有多个区块满足上述要求，对于相同的 *b* 和 *c*。

[[TMBC-ATTACK.1]](#TMBC-ATTACK1) 是基于共识结果，即生成的区块，违反协议属性的一个形式化描述。

**备注。**
只有当某个先前区块的验证者（或下一个验证者）中超过1/3的节点偏离协议时，才可能违反一致性。即将到来的“可追究责任”规范将描述如何从两个冲突的区块中计算出至少1/3个故障节点的集合。[]

有不同的方式来描述分叉和攻击场景。本规范使用“基于节点的攻击描述”，重点关注受影响的节点类型（轻节点 vs. 全节点）。供将来参考和讨论，我们还提供了下面的“基于区块的攻击描述”。

### 基于节点的攻击描述

#### **[TMBC-MC-FORK.1]**

如果满足以下条件，则我们称时间 *t* 存在（主链）分叉：

- 存在两个正确的全节点 *i* 和 *j*，并且
- *i* 不等于 *j*，并且
- *i* 已经决定使用 *b*，并且
- *j* 已经决定使用 *c*，并且
- 存在 *a*，使得 *attack(a,b,c,t)*。

#### **[TMBC-LC-ATTACK.1]**

我们说在时间 *t* 发生了轻客户端攻击，如果满足以下条件：

- 没有（主链）分叉 [[TMBC-MC-FORK.1]](#TMBC-MC-FORK1)，
- 存在计算了轻区块 *b* 和 *c* 的节点，
- 存在 *a* 使得 *attack(a,b,c,t)* 成立。

我们称该攻击发生在高度 *a.Header.Height*。

> 在本规范中，我们考虑轻客户端攻击的检测。直观上，我们考虑的情况是轻区块 *b* 是来自区块链的区块，而某个攻击者计算了 *c* 并试图错误地使轻客户端相信 *c* 是来自该链的区块。

#### **[TMBC-LC-ATTACK-EVIDENCE.1]**

我们考虑轻客户端攻击的以下情况 [[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)：

- *attack(a,b,c,t)*
- 存在一个对等节点 p1，它有一个从 *a* 到 *b* 的区块序列 *chain*
- *skip-trace(a,c,t)*：根据 [[TMBC-SKIP-TRACE.1]](#TMBC-SKIP-TRACE1)，存在一个验证追踪 *v*，形式为 *a = v(1)*，...，*v(h) = c*

对于证明攻击的 p1 的索引 i，证据包括 v(i) 和 v(i+1)，满足以下条件：

- E1(i). v(i) 等于 *chain* 中高度为 v(i).Height 的区块，
- E2(i). v(i+1) 与 *chain* 中高度为 v(i+1).Height 的区块不同。

> 注意 p1 可以
>
> - 检查 v(i+1) 与其在该高度的区块是否不同，并且
> - 通过将 v 视为验证追踪，一步验证 v(i+1)。

**命题.** 在攻击的情况下，存在证据。  
*证明.* 首先观察到

- (A). (NOT E2(i)) 意味着 E1(i+1)

现假设存在没有证据的矛盾情况。因此

- 对于所有 i，我们有 NOT E1(i) 或 NOT E2(i)
- 对于 i = 1，我们有 E1(1)，因此 NOT E2(1)
  因此通过对 i 进行归纳，根据 (A) 我们有对于所有 i 都满足 **E1(i)**
- 从攻击中我们有 E2(h-1)，由于 i = h - 1 没有证据，我们得到 **NOT E1(h-1)**。矛盾。
证毕。

#### **[TMBC-LC-EVIDENCE-DATA.1]**

为了向 p1 证明攻击，根据 E1 点，只需提交以下信息：

- v(i).Height（而不是 v(i)）。
- v(i+1)

这些信息是关于高度 v(i).Height 的证据。

### 基于区块的攻击特征化

在本节中，我们提供了一种不同的攻击特征化方式。它不是基于受影响的节点，而是纯粹基于区块的内容。从这个意义上说，这些定义不太具体。

> 它可能与链上分叉场景的更详细分析相关，但超出了本规范的范围。

#### **[TMBC-SIGN-UNIQUE.1]**

设 *b* 和 *c* 为轻区块，我们定义谓词 *sign-unique(b,c)* 为真，当且仅当以下蕴含式为真：

- *b.Header.Height = c.Header.Height* 且
- *sequ-rooted(b)* 且
- *sequ-rooted(c)*

蕴含 *b = c*。

#### **[TMBC-BLOCKS-MCFORK.1]**

如果存在两个轻区块 *b* 和 *c*，使得 *sign-unique(b,c) = false*，那么我们有一个*分叉*。

> 与[[TMBC-MC-FORK.1]](#TMBC-MC-FORK1)的定义的区别是微妙的。后者要求一个完整节点受到了一个坏区块的影响，而[[TMBC-BLOCKS-MCFORK.1]](#TMBC-BLOCKS-MCFORK1)只要求存在一个坏区块，可能在攻击者的内存中。以下是轻客户端分叉的定义。在区块 *b* 的高度之前没有分叉。然而，区块 *c* 的高度与之相同，但内容不同，并且通过了跳过验证。这是比[[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)更严格的属性，因为[[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)要求没有正确的完整节点受到影响。

#### **[TMBC-BLOCKS-LCFORK.1]**

设 *a*、*b*、*c* 为轻区块，*t* 为时间。我们定义 *light-client-fork(a,b,c,t)* 当且仅当以下条件为真：

- *sign-skip-match(a,b,c,t) = false* 且
- *sequ-rooted(b)* 且
- *b* 是“唯一”的，也就是说，对于所有的 *d*，*sequ-rooted(d)* 且 *d.Header.Height = b.Header.Height* 蕴含 *d = b*

> 最后，让我们也定义一些没有支持的虚假区块。请注意，即使存在分叉，虚假区块也是有定义的。此外，对于定义来说，将 *a* 限制为 *a.height < b.height* 就足够了（这是由展开到 *supports()* 的定义所隐含的）。

#### **[TMBC-BOGUS.1]**

让 *b* 为一个轻区块，*t* 为一个时间。我们定义 *bogus(b,t)* 当且仅当：

- *sequ-rooted(b) = false* 并且
- 对于所有的 *a*，*sequ-rooted(a)* 意味着 *skip-trace(a,b,t) = false*

### 非正式问题陈述

没有顺序规范：检测器只在一些节点行为不端的分布式系统中有意义。

我们假设全节点和验证者负责检测主链上的攻击，而证据反应器负责通过 ABCI 将证据广播给应用程序，以及在出现分叉时停止链的运行。这个规范的目的是保护轻客户端免受全节点无法检测到的攻击，并且完全解决轻客户端（以及使用轻客户端协议观察区块链状态的 IBC 中继器）的问题。为了激励全节点在与轻客户端通信时遵循协议，该规范还考虑生成证据，这些证据也将由 Tendermint 区块链处理。

#### **[LCD-IP-MODEL.1]**

该检测器的设计基于以下假设：

- [[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link) 可能被违反
- 主链上没有分叉。

> 结果是一些有故障的全节点可能对轻客户端发起攻击。

以下要求是操作性的，因为它们描述了应该如何做，而不是应该做什么。然而，它们不构成时间逻辑验证条件。有关这些条件，请参见下面的 [LCD-DIST-*]。

检测器在 [supervisor](supervisor) 中被调用，如下所示：

```go
Evidences := AttackDetector(root_of_trust, verifiedLS);`
```

其中

- `root-of-trust` 是一个被信任的轻区块（也就是说，除了初始化之外，主节点和备份节点在过去达成了一致），并且
- `verifiedLS` 是一个包含验证跟踪的轻存储，该验证跟踪从一个可以通过 `root-of-trust` 在一步内进行验证的轻区块开始，以用户请求的高度结束
- `Evidences` 是一组关于不当行为的证据

#### **[LCD-IP-STATEMENT.1]**

每当调用AttackDetector时，检测器应该对每个次要的尝试使用验证跟踪`verifiedLS`进行回放。

- 如果回放导致检测到轻客户端攻击（与验证跟踪中的一个轻区块在相同高度上不同），我们应该返回证据。
- 如果次要节点无法提供验证跟踪，我们无法证明存在攻击。区块*b*可能是伪造的。在这种情况下，次要节点存在故障，应该被替换。

## 假设/激励/环境

对于有故障的全节点来说，只要检测器连接至少一个正确的全节点，它们就没有与检测器通信的兴趣。这只会增加检测到不当行为的可能性。而且我们不能轻易（廉价地）惩罚它们。没有响应不一定是全节点的错。

正确的全节点有动机回应，因为检测器可以帮助他们了解他们的头部是否正确。因此，我们可以基于正确的全节点可靠地与检测器通信的假设来建立检测器的活跃性论证。

### 假设

#### **[LCD-A-CorrFull.1]**

在任何时候，主节点和次要节点中至少有一个正确的全节点。

> 对于这个版本的检测，我们采取这个假设。它允许我们建立轻区块`root-of-trust`始终是来自区块链的不变性，并将其用作证据计算的起点。此外，它允许我们在监督者中建立一个不变性，即（顶层）轻存储中的任何轻区块都来自区块链。在将来，我们可能会设计一个基于假设的轻客户端，即轻客户端至少在规则间隔内连接到一个正确的全节点。这将要求检测器重新考虑`root-of-trust`，并从顶层轻存储中删除轻区块。

#### **[LCD-A-RelComm.1]**

检测器与正确的全节点之间的通信是可靠且有时间限制的。可靠的通信意味着消息不会丢失、不会重复，并最终会被传递。存在一个（已知的）端到端延迟*Delta*，如果在时间*t*发送消息，则在时间*t + Delta*之前接收并处理该消息。这意味着我们需要至少*2 Delta*的超时时间来确保正确对等方的响应在超时到期之前到达。

## 定义

### 证据

根据[[TMBC-LC-ATTACK-EVIDENCE.1]](#TMBC-LC-ATTACK-EVIDENCE1)的定义，我们将证据指的是以下类型的变量

#### **[LC-DATA-EVIDENCE.1]**

```go
type LightClientAttackEvidence struct {
    ConflictingBlock   LightBlock
    CommonHeight       int64
}
```

由于上述数据是针对特定节点计算的，下面的数据结构将证据包装起来并添加了peerID。

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
    - 对于`Evidences`中的每个`ev`：将`ev.Evidence`提交给`ev.Peer`

---

### LightStore

Lightblocks和LightStores在验证规范[LCV-DATA-LIGHTBLOCK.1]和[LCV-DATA-LIGHTSTORE.1]中定义。有关详细信息，请参阅[验证规范][verification]。

## （分布式）问题陈述

> 由于攻击检测器的存在是为了减少错误节点的影响，并且错误节点意味着存在一个分布式系统，因此没有顺序规范可以参考此分布式问题陈述。

检测器的输入是一个可信的称为*root*的轻区块和一个称为*primary_trace*的辅助轻存储，其中包含之前已经验证过的轻区块，并且这些轻区块是由primary提供的。

#### **[LCD-DIST-INV-ATTACK.1]**

如果检测器返回高度*h*的证据[[TMBC-LC-EVIDENCE-DATA.1]](#TMBC-LC-EVIDENCE-DATA1)，则在高度*h*存在攻击。[[TMBC-LC-ATTACK.1]](#TMBC-LC-ATTACK1)

#### **[LCD-DIST-INV-STORE.1]**

如果检测器没有返回证据，则*primary_trace*仅包含来自区块链的区块。

#### **[LCD-DIST-LIVE.1]**

检测器最终终止。

#### **[LCD-DIST-TERM-NORMAL.1]**

如果

- *primary_trace*仅包含来自区块链的区块，并且
- 没有攻击，并且
- *Secondaries*始终非空，并且
- *root*的年龄始终小于信任期限，

则检测器不返回证据。

#### **[LCD-DIST-TERM-ATTACK.1]**

如果

- 存在攻击，并且
- 某个secondary报告了与*primary_trace*中的某个区块冲突的区块，并且
- *Secondaries*始终非空，并且
- *root*的年龄始终小于信任期限，

然后检测器返回证据。

> 注意，上面我们要求“一个次级报告了一个冲突的区块”。如果存在攻击，但没有次级尝试对检测器发起攻击（或者次级的消息在网络中丢失），那么对我们来说就没有什么可检测的。

#### **[LCD-DIST-SAFE-SECONDARY.1]**

没有正确的次级被替换。

#### **[LCD-DIST-SAFE-BOGUS.1]**

如果

- 一个次级报告了一个虚假的轻区块，
- *root* 的年龄始终小于可信期限，

那么在检测器终止之前，次级将被替换。

> 上述属性是相当操作性的（“报告”），但它非常贴近要求。由于检测器只在分布式环境中有意义，并且没有顺序规范，因此可以接受较不“纯粹”的规范。

# 协议

## 在其他规范中定义的函数和数据

### 来自监督者

```go
Replace_Secondary(addr Address, root-of-trust LightBlock)
```

### 来自验证者

```go
func VerifyToTarget(primary PeerID, root LightBlock,
                    targetHeight Height) (LightStore, Result)
```

> 注意：上述与当前版本中的第二个参数不同。验证将进行修订。

观察到`VerifyToTarget`通过函数[FetchLightBlock](fetch)与次级进行通信。

### 轻客户端的共享数据

- 一个未被联系过的全节点池*FullNodes*
- 称为*Secondaries*的对等集合
- 主节点

> 注意，不需要共享lightStore。

## 大纲

通过使用一个刚刚由验证者验证的轻区块组成的lightstore，调用函数`AttackDetector`来解决所提出的问题。

然后，`AttackDetector`从次级下载头部。如果从次级下载到了一个冲突的头部，那么`CreateEvidenceForPeer`将计算证据，以确认是否确实存在攻击。可能是次级报告了一个虚假的区块，这意味着可能没有攻击，而次级将被替换。

## 函数细节

#### **[LCD-FUNC-DETECTOR.1]:**

```go
func AttackDetector(root LightBlock, primary_trace []LightBlock)
                   ([]InternalEvidence) {

    Evidences := new []InternalEvidence;

    for each secondary in Secondaries {
        // we replay the primary trace with the secondary, in
        // order to generate evidence that we can submit to the
        // secodary. We return the evidence + the trace the
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
         // we do nothing
    }
    return Evidences;
}
```

- 预期前置条件
    - 根和主要追踪是验证追踪
- 预期后置条件
    - 解决问题陈述（如果发现攻击，则报告证据）
- 错误条件
    - `ErrorTrustExpired`：如果根过期（超出信任期），则失败 [[LCV-INV-TP.1]](LCV-INV-TP1-link)
    - `ErrorNoPeers`：如果没有副本可以替换第二副本，并且在此之前没有找到证据

---

```go
func CreateEvidenceForPeer(peer PeerID, root LightBlock, trace LightStore)
                          (Evidence, LightBlock, LightStore, result) {

    common := root;

    for i in 1 .. len(trace) {
        auxLS, result := VerifyToTarget(peer, common, trace[i].Header.Height)
  
        if result != ResultSuccess {
            // something went wrong; peer did not provide a verifyable block
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
                ev.Evidence.CommonHeight := common.Height;
                ev.Peer := peer
                return (ev, common, auxLS, FoundEvidence)
            }
            else {
                // the peer agrees with the trace, we move common forward
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
    - 根和追踪是验证追踪
- 预期后置条件
    - 找到追踪和对等方分歧的证据
- 错误条件
    - `ErrorTrustExpired`：如果根过期（超出信任期）则失败 [[LCV-INV-TP.1]](LCV-INV-TP1-link)
    - 如果`VerifyToTarget`返回错误但根未过期，则返回`FaultyPeer`

---

## 正确性论证

#### [[LCD-DIST-INV-ATTACK.1]](#LCD-DIST-INV-ATTACK1)的论证

在假设根和追踪是验证追踪的情况下，当在`CreateEvidenceForPeer`中检测器创建证据时，轻客户端已经看到了两个不同的头（一个通过`trace`，一个通过`VerifyToTarget`）对于相同的高度，这两个头可以在一步中都被验证。

#### [[LCD-DIST-INV-STORE.1]](#LCD-DIST-INV-STORE1)的论证

我们假设至少有一个正确的对等方，并且没有分叉。因此，正确的对等方具有正确的区块序列。由于主要追踪也会逐个区块与每个副本进行检查，并且在任何时候都没有生成证据，这意味着没有冲突的区块。

#### [[LCD-DIST-LIVE.1]](#LCD-DIST-LIVE1)的论证

最迟当违反[[LCV-INV-TP.1]](LCV-INV-TP1-link)时，`AttackDetector`终止。

#### [[LCD-DIST-TERM-NORMAL.1]](#LCD-DIST-TERM-NORMAL1)的论证

由于对等方是有限的，最终主循环会终止。由于没有攻击，因此不会生成任何证据。

#### [[LCD-DIST-TERM-ATTACK.1]](#LCD-DIST-TERM-ATTACK1)的参数

类似于[[LCD-DIST-TERM-NORMAL.1]](#LCD-DIST-TERM-NORMAL1)的参数

#### [[LCD-DIST-SAFE-SECONDARY.1]](#LCD-DIST-SAFE-SECONDARY1)的参数

只有在次要节点超时或报告虚假块时才会被替换。前者被时间假设排除，后者被正确的节点仅报告来自链的块所排除。

#### [[LCD-DIST-SAFE-BOGUS.1]](#LCD-DIST-SAFE-BOGUS1)的参数

一旦识别出虚假块，次要节点将被移除。

# 参考资料

> 链接到本文档所引用的其他规范/ADR

[[verification]] 轻客户端验证的规范。

[[supervisor]] 轻客户端监督者的规范。

[verification]:  https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md

[supervisor]:  https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/supervisor/supervisor.md

[block]: https://github.com/tendermint/spec/blob/d46cd7f573a2c6a2399fcab2cde981330aa63f37/spec/core/data_structures.md

[TMBC-FM-2THIRDS-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#tmbc-fm-2thirds1

[TMBC-SOUND-DISTR-POSS-COMMIT-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#tmbc-sound-distr-poss-commit1

[LCV-SEQ-SAFE-link]:https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#lcv-seq-safe1

[TMBC-VAL-CONTAINS-CORR-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#tmbc-val-contains-corr1

[fetch]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#lcv-func-fetch1

[LCV-INV-TP1-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#lcv-inv-tp1


# ***This an unfinished draft. Comments are welcome!***

**TODO:** We will need to do small adaptations to the verification
spec to reflect the semantics in the LightStore (verified, trusted,
untrusted, etc. not needed anymore). In more detail:

- The state of the Lightstore needs to go. Functions like `LatestVerified` can
keep the name but will ignore state as it will not exist anymore.

- verification spec should be adapted to the second parameter of
`VerifyToTarget`
being a lightblock; new version number of function tag;

- We should clarify what is the expectation of VerifyToTarget
so if it returns TimeoutError it can be assumed faulty. I guess that
VerifyToTarget with correct full node should never terminate with
TimeoutError.

- We need to introduce a new version number for the new
specification. So we should decide how
  to handle that.

# Light Client Attack Detector

In this specification, we strengthen the light client to be resistant
against so-called light client attacks. In a light client attack, all
the correct Tendermint full nodes agree on the sequence of generated
blocks (no fork), but a set of faulty full nodes attack a light client
by generating (signing) a block that deviates from the block of the
same height on the blockchain. In order to do so, some of these faulty
full nodes must have been validators before and violate
[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link), as otherwise, if
[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link) would hold,
[verification](verification) would satisfy
[[LCV-SEQ-SAFE.1]](LCV-SEQ-SAFE-link).

An attack detector (or detector for short) is a mechanism that is used
by the light client [supervisor](supervisor) after
[verification](verification) of a new light block
with the primary, to cross-check the newly learned light block with
other peers (secondaries).  It expects as input a light block with some
height *root* (that serves as a root of trust), and a verification
trace (a sequence of lightblocks) that the primary provided.

In case the detector observes a light client attack, it computes
evidence data that can be used by Tendermint full nodes to isolate a
set of faulty full nodes that are still within the unbonding period
(more than 1/3 of the voting power of the validator set at some block of the chain),
and report them via ABCI to the application of a Tendermint blockchain
in order to punish faulty nodes.

## Context of this document

The light client [verification](verification) specification is
designed for the Tendermint failure model (1/3 assumption)
[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link).  It is safe under this
assumption, and live if it can reliably (that is, no message loss, no
duplication, and eventually delivered) and timely communicate with a
correct full node. If [[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link) assumption is violated, the light client
can be fooled to trust a light block that was not generated by
Tendermint consensus.

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
[verification](verification) with the primary, and then cross-checks
the light block (and the trace of light blocks that led to it) with
the secondaries using this specification.

## Tendermint Consensus and Light Client Attacks

In this section we will give some mathematical definitions of what we
mean by light client attacks (that are considered in this
specification) and how they differ from main-chain forks. To this end
we start by defining some properties of the sequence of blocks that is
decided upon by Tendermint consensus in normal operation (if the
Tendermint failure model holds
[[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link)),
and then define different
deviations that correspond to attack scenarios.

#### **[TMBC-GENESIS.1]**

Let *Genesis* be the agreed-upon initial block (file).

#### **[TMBC-FUNC-SIGN.1]**

Let *b* and *c* be two light blocks with *b.Header.Height + 1 =
c.Header.Height*. We define the predicate **signs(b,c)** to hold
iff *c.Header.LastCommit* is in *PossibleCommit(b)*.
[[TMBC-SOUND-DISTR-POSS-COMMIT.1]](TMBC-SOUND-DISTR-POSS-COMMIT-link).

> The above encodes sequential verification, that is, intuitively,
> b.Header.NextValidators = c.Header.Validators and 2/3 of
> these Validators signed c?

#### **[TMBC-FUNC-SUPPORT.1]**

Let *b* and *c* be two light blocks. We define the predicate
**supports(b,c,t)** to hold iff

- *t - trustingPeriod < b.Header.Time < t*
- the voting power in *b.NextValidators* of nodes in *c.Commit*
  is more than 1/3 of *TotalVotingPower(b.Header.NextValidators)*

> That is, if the [Tendermint failure model](TMBC-FM-2THIRDS-link)
> holds, then *c* has been signed by at least one correct full node, cf.
> [[TMBC-VAL-CONTAINS-CORR.1]](TMBC-VAL-CONTAINS-CORR-link).
> The following formalizes that *b* was properly generated by
> Tendermint; *b* can be traced back to genesis

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
time t there exists an *h* and a sequence *a(1)*, ... *a(h)* s.t.

- *a(1) = b* and
- *a(h) = c* and
- *supports( a(i), a(i+1), t)*, for all i, *1 <= i < h*.

We call such a sequence *a(1)*, ... *a(h)* a **verification trace**.

> The following formalizes that two light blocks of the same height
> should agree on the content of the header. Observe that *b* and *c*
> may disagree on the Commit. This is a special case if the canonical
> commit has not been decided on, that is, if b.Header.Height is the
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

### Node-based characterization of attacks

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

Evidence for p1 (that proves an attack) consists for index i
of v(i) and v(i+1) such that

- E1(i). v(i) is equal to the block of *chain* at height v(i).Height, and
- E2(i). v(i+1) that is different from  the block of *chain* at
  height v(i+1).height

> Observe p1 can
>
> - check that v(i+1)  differs from its block at that height, and
> - verify v(i+1) in one step from v(i) as v is a verification trace.

**Proposition.** In the case of attack, evidence exists.  
*Proof.* First observe that

- (A). (NOT E2(i)) implies E1(i+1)

Now by contradiction assume there is no evidence. Thus

- for all i, we have NOT E1(i) or NOT E2(i)
- for i = 1 we have E1(1) and thus NOT E2(1)
  thus by induction on i, by (A) we have for all i that **E1(i)**
- from attack we have E2(h-1), and as there is no evidence for
  i = h - 1 we get **NOT E1(h-1)**. Contradiction.
QED.

#### **[TMBC-LC-EVIDENCE-DATA.1]**

To prove the attack to p1, because of Point E1, it is sufficient to
submit

- v(i).Height (rather than v(i)).
- v(i+1)

This information is *evidence for height v(i).Height*.

### Block-based characterization of attacks

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
  
### Informal Problem statement

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

- [[TMBC-FM-2THIRDS]](TMBC-FM-2THIRDS-link) may be violated
- there is no fork on the main chain.

> As a result some faulty full nodes may launch an attack on a light
> client.

The following requirements are operational in that they describe how
things should be done, rather than what should be done. However, they
do not constitute temporal logic verification conditions. For those,
see [LCD-DIST-*] below.

The detector is called in the [supervisor](supervisor) as follows

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
secondary try to replay the verification trace `verifiedLS` with the
secondary
  
- in case replaying leads to detection of a light client attack
  (one of the lightblocks differ from the one in verifiedLS with
  the same height), we should return evidence
- if the secondary cannot provide a verification trace, we have no
  proof for an attack. Block *b* may be bogus. In this case the
  secondary is faulty and it should be replaced.

## Assumptions/Incentives/Environment

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

### Assumptions

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
specification [LCV-DATA-LIGHTBLOCK.1] and [LCV-DATA-LIGHTSTORE.1]. See
the [verification specification][verification] for details.

## (Distributed) Problem statement

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

> The above property is quite operational ("reports"), but it captures
> quite closely the requirement. As the
> detector only makes sense in a distributed setting, and does
> not have a sequential specification, less "pure"
> specification are acceptable.

# Protocol

## Functions and Data defined in other Specifications

### From the supervisor

```go
Replace_Secondary(addr Address, root-of-trust LightBlock)
```

### From the verifier

```go
func VerifyToTarget(primary PeerID, root LightBlock,
                    targetHeight Height) (LightStore, Result)
```

> Note: the above differs from the current version in the second
> parameter. verification will be revised.

Observe that `VerifyToTarget` does communication with the secondaries
via the function [FetchLightBlock](fetch).

### Shared data of the light client

- a pool of full nodes *FullNodes* that have not been contacted before
- peer set called *Secondaries*
- primary

> Note that the lightStore is not needed to be shared.

## Outline

The problem laid out is solved by calling the function `AttackDetector`
with a lightstore that contains a light block that has just been
verified by the verifier.

Then `AttackDetector` downloads headers from the secondaries. In case
a conflicting header is downloaded from a secondary,
`CreateEvidenceForPeer` which computes evidence in the case that
indeed an attack is confirmed. It could be that the secondary reports
a bogus block, which means that there need not be an attack, and the
secondary is replaced.
  
## Details of the functions

#### **[LCD-FUNC-DETECTOR.1]:**

```go
func AttackDetector(root LightBlock, primary_trace []LightBlock)
                   ([]InternalEvidence) {

    Evidences := new []InternalEvidence;

    for each secondary in Secondaries {
        // we replay the primary trace with the secondary, in
        // order to generate evidence that we can submit to the
        // secodary. We return the evidence + the trace the
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
         // we do nothing
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
    period) [[LCV-INV-TP.1]](LCV-INV-TP1-link)
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
            // something went wrong; peer did not provide a verifyable block
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
                ev.Evidence.CommonHeight := common.Height;
                ev.Peer := peer
                return (ev, common, auxLS, FoundEvidence)
            }
            else {
                // the peer agrees with the trace, we move common forward
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
       period) [[LCV-INV-TP.1]](LCV-INV-TP1-link)
    - If `VerifyToTarget` returns error but root is not expired then return
 `FaultyPeer`

---

## Correctness arguments

#### Argument for [[LCD-DIST-INV-ATTACK.1]](#LCD-DIST-INV-ATTACK1)

Under the assumption that root and trace are a verification trace,
when in `CreateEvidenceForPeer` the detector the detector creates
evidence, then the lightclient has seen two different headers (one via
`trace` and one via `VerifyToTarget` for the same height that can both
be verified in one step.

#### Argument for [[LCD-DIST-INV-STORE.1]](#LCD-DIST-INV-STORE1)

We assume that there is at least one correct peer, and there is no
fork. As a result the correct peer has the correct sequence of
blocks. Since the primary_trace is checked block-by-block also against
each secondary, and at no point evidence was generated that means at
no point there were conflicting blocks.

#### Argument for [[LCD-DIST-LIVE.1]](#LCD-DIST-LIVE1)

At the latest when [[LCV-INV-TP.1]](LCV-INV-TP1-link) is violated,
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

[verification]:  https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md

[supervisor]:  https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/supervisor/supervisor.md

[block]: https://github.com/tendermint/spec/blob/d46cd7f573a2c6a2399fcab2cde981330aa63f37/spec/core/data_structures.md

[TMBC-FM-2THIRDS-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#tmbc-fm-2thirds1

[TMBC-SOUND-DISTR-POSS-COMMIT-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#tmbc-sound-distr-poss-commit1

[LCV-SEQ-SAFE-link]:https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#lcv-seq-safe1

[TMBC-VAL-CONTAINS-CORR-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#tmbc-val-contains-corr1

[fetch]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#lcv-func-fetch1

[LCV-INV-TP1-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification.md#lcv-inv-tp1
