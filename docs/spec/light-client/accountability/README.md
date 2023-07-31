---
order: 1
parent:
  title: 账户责任
  order: 4
---

# 分叉的责任

## 问题陈述

Tendermint共识对于所有高度都保证了以下规范：

* 一致性 - 没有两个正确的全节点会对同一个高度的区块做出不同的决策。
* 有效性 - 所决定的区块满足预定义的谓词*valid()*。
* 终止性 - 所有正确的全节点最终都会做出决策。

如果有错误的验证者在当前验证者集中的投票权少于1/3，那么以上规范可能会被违反。

一致性规则表示对于给定的高度，任何两个正确的验证者在该高度上对一个区块做出决策时会选择相同的区块。可以通过从一个可信的（创世）区块开始验证，并检查所有后续区块是否被正确签名来验证该区块确实是由区块链生成的。

然而，错误的节点可能伪造区块，并试图说服用户（轻客户端）这些区块已经被正确生成。此外，如果1/3或更多的投票权属于错误的验证者，Tendermint共识可能会违反一致性规则：两个正确的验证者对不同的区块做出决策。后一种情况促使了“分叉”这个术语的出现：由于Tendermint共识还同意下一个验证者集，正确的验证者可能对不相交的下一个验证者集做出决策，从而使链分为两个或更多分区（可能有共同的错误验证者），并且每个分支都继续独立地生成区块。

我们称为分叉是指在区块链的相同高度上存在两个不同区块的情况。问题是确保在这些情况下我们能够检测到错误的验证者（而不是错误地指责正确的验证者），并因此激励验证者按照协议规范行事。

**概念限制。** 为了证明节点的不当行为，我们必须展示其行为与给定算法的正确行为偏离。因此，必须针对算法*A*定义一个检测节点执行某个算法的不当行为的算法。在我们的情况下，*A*是Tendermint共识（+基础设施中的其他协议，例如全节点和轻客户端）。如果共识算法在未来发生变化/更新/优化，我们必须检查是否还需要对责任算法进行更改。因此，本文中的所有讨论都与Tendermint共识和轻客户端规范密切相关。

**问：** 我们是否应该区分验证人和全节点对协议的一致性？当所有正确的验证人对一个区块达成一致意见，但一个正确的全节点决定选择另一个区块时，似乎比两个正确的验证人选择不同的区块情况稍微不严重一些。然而，如果一个受污染的全节点成为验证人，这可能会在以后引起问题。而且，如果一个受污染的全节点位于不同的分支上，不清楚传播会受到什么影响。

*备注：* 如果有1/3或更多的投票权属于有故障的验证人，也会破坏有效性和终止性。如果有故障的进程只是不发送需要推进进展的消息，那么终止性就会被破坏。由于异步性，这是不可惩罚的，因为有故障的验证人总是可以声称他们从未收到强制他们发送消息的消息。

## 有故障的验证人的不当行为

分叉是有故障的验证人偏离协议的结果。原则上，可以在没有实际发生分叉的情况下检测到几种这样的偏差：

1. 双重提案：有故障的提案者为同一轮次和高度提出两个不同的值（区块）。

2. 双重签名：Tendermint共识要求正确的验证人每轮只能prevote和precommit一个值。如果有故障的验证人为同一高度/轮次的不同值发送多个prevote和/或precommit消息，这是一种不当行为。

3. 疯狂的验证人：Tendermint共识要求正确的验证人只能为满足*valid(v)*的值*v*进行prevote和precommit。如果有故障的验证人为*valid(v)=false*的值*v*进行prevote和precommit，这是一种不当行为。

*备注：* 单独看，第3点是对有效性的攻击（而不是一致性）。然而，prevote和precommit也可以用来伪造区块。

1. 遗忘：Tendermint共识有一个锁定机制。如果一个验证人锁定了某个值*v*，那么它只能为*v*或nil进行prevote/precommit。在持有值*v*的锁的情况下，发送prevote/precommit消息给不同的值*v'*（不为nil）是不当行为。

2. 伪造消息：在Tendermint共识中，大部分的消息发送指令都受到阈值保护的限制，例如，需要接收到 *2f + 1* 个prevote消息才能发送precommit。有缺陷的验证者可能在没有接收到prevote消息的情况下发送precommit。

无论是否发生分叉，惩罚这种行为可能是重要的，以防止分叉的发生。这可以阻止攻击者的恶意行为：如果不到1/3的投票权是有问题的，这种不当行为是可以被检测到的，但不会导致安全违规。因此，除非攻击者控制了1/3或更多（或在某些情况下超过2/3）的投票权，否则攻击者没有动机进行不当行为。如果攻击者控制了过多的投票权，我们就必须处理分叉问题，正如本文档中所讨论的那样。

## 两种类型的分叉

* 完全分叉。两个正确的验证者对同一高度的区块做出了不同的决策。由于下一个验证者集也是决定的，正确的验证者可能被分割成参与分叉链的两个不同分支。

在这种情况下，由于存在两个不同的区块（都有相同的存在/不存在权利），中央系统的不变性（由正确的验证者决定每个高度的一个区块）被违反了。由于在这种情况下全节点也受到污染，这种污染也可能传播到轻客户端。然而，即使不违反这个系统不变性，轻客户端也可能受到分叉的影响：

* 轻量级分叉。所有正确的验证者对高度 *h* 的同一个区块做出了相同的决策，但是有缺陷的进程（验证者或非验证者）伪造了一个不同的区块，以欺骗使用轻客户端的用户。

# 攻击场景

## 在链上的攻击

### 双重声明（一轮）

有几种情况可能导致分叉的发生。第一种情况是在一轮内进行双重签名。

* F1. 双重声明：有缺陷的验证者在给定高度 *h* 的同一轮 *r* 中对不同的值进行多次投票消息（prevote和/或precommit）的签名。

### 翻转

Tendermint共识实现了一种锁定机制：如果正确的验证者 *p* 在轮 *r* 中收到值 *v* 的提案和 *2f + 1* 个对值 *id(v)* 的prevote，它会锁定 *v* 并记住 *r*。在这种情况下，*p* 还会发送一个关于 *id(v)* 的precommit消息，这个消息后来可以作为 *p* 锁定 *v* 的证据。
在后续的轮次中，*p* 只会为它之前锁定的值发送prevote消息。然而，如果在未来的某个轮次 *r' > r* 中，该进程收到了关于不同值 *v'* 的提案和 *2f + 1* 个prevote，它可以更改已锁定的值。在这种情况下，*p* 可以发送一个关于 *id(v')* 的prevote/precommit。这个算法特性可以被利用的方式有两种：

* F2. 故障翻转（遗忘）：故障验证者在轮次 *r* 中预提交了某个值 *id(v)*（值 *v* 在轮次 *r* 中被锁定），然后在更高的轮次 *r' > r* 中预投了不同的值 *id(v')*，而没有正确解锁值 *v*。在这种情况下，故障进程“忘记”它们已经锁定了值 *v*，并在后续轮次中预投了其他值。
一些正确的验证者可能已经在 *r* 中决定了 *v*，而其他正确的验证者在 *r'* 中决定了 *v'*。这样就会在主链上产生分叉（Fork-Full）。

* F3. 正确的翻转（回到过去）：在轮次 *r* 中，有一些由（正确的）验证者签名的预提交消息，针对值 *id(v)*。然而，*v* 尚未被决定，并且所有进程都进入下一轮。然后，正确的验证者在某个轮次 *r' > r* 中（正确地）锁定并决定了不同的值 *v'*。正确的验证者继续进行，主链上没有分叉。
然而，故障验证者可能会使用来自轮次 *r* 的正确预提交消息，以及为轮次 *r* 生成的故障预提交消息，来伪造一个在主链上未被决定的值的区块（Fork-Light）。

## 离链攻击

F1-F3 可能会污染全节点（甚至验证者）的状态。因此，被污染的（但其他方面正确的）全节点可能会向轻客户端传递错误的区块。
类似地，在实际上不干扰主链的情况下，我们可以有以下情况：

* F4. 幻影验证者：故障验证者在它们不属于验证者集合的高度中投票（签署预投和预提交消息）。

* F5. 疯狂验证者：故障验证者签署投票消息以支持与有效状态转换结果不同的（任意的）应用程序状态。

## 受攻击的类型

我们考虑三种潜在的攻击受害者类型：

* FN：全节点
* LCS：具有顺序头部验证的轻客户端
* LCB：具有二分头部验证的轻客户端

F1 和 F2 可以被故障验证者用来在区块链上实际创建多个分支。这意味着正确运行的全节点对于同一高度决定了不同的区块。在本地的全节点检测到分叉之前（通过从其他节点接收证据或其他本地检查失败），全节点可以向轻客户端传播被损坏的区块。

*备注.* 如果全节点选择了与验证者不同的分支，可能会影响八卦协议的活跃性。我们应该对此进行更详细的研究。然而，由于它不影响安全性，这不是一个主要问题。

F3与F1类似，只是没有两个正确的验证者会选择不同的区块。但仍然可能导致全节点受到影响。

此外，在不在主链上创建分叉的情况下，轻客户端可能会受到超过三分之一的有故障的验证者的污染，并签署伪造的区块头。
F4无法欺骗正确的全节点，因为它们知道当前的验证者集。同样，轻客户端也知道验证者是谁。因此，F4是针对不一定知道完整区块头前缀（Fork-Light）的LCB的攻击，因为它们信任至少由一个正确的验证者签署的区块头（信任期方法）。

下表概述了不同攻击可能对不同节点的影响。F1-F3是*链上*攻击，因此它们可以破坏全节点的状态。然后，如果轻客户端（LCS或LCB）联系全节点获取区块头（或区块），被破坏的状态可能传播到轻客户端。

F4和F5是*链下*攻击，也就是说，这些攻击不能用来破坏全节点的状态（全节点对链的状态有足够的了解，不会被欺骗）。

| 攻击 |  FN | LCS | LCB |
|:------:|:------:|:------:|:------:|
| F1 |  直接  | FN |     FN |
| F2 |   直接 | FN |     FN |
| F3 |  直接  | FN |     FN |
| F4 |          |    | 直接 |
| F5 |          |    | 直接 |

**问：** 轻客户端比全节点更容易受到攻击，因为前者只验证区块头而不执行交易。全节点执行交易后获得了什么样的确定性？

作为一个全节点验证所有交易，只有在区块链本身违反其不变性（每个高度一个区块）的情况下，即出现导致分叉的情况下，它才会受到攻击的污染。

## 详细攻击场景

### 基于等价攻击

在等价攻击的情况下，有缺陷的验证者在某个高度的同一轮中对多个投票（prevote和/或precommit）进行签名。这种攻击可以在全节点和轻客户端上执行。执行此攻击需要执行1/3或更多的投票权。

#### 场景1：在主链上进行等价攻击

验证者：

* CA - 一组具有少于1/3投票权的正确验证者
* CB - 一组具有少于1/3投票权的正确验证者
* CA和CB是不相交的
* F - 一组具有1/3或更多投票权的有缺陷的验证者

观察到这种设置违反了Tendermint的故障模型。

执行：

* 有缺陷的提议者向CA提议块A
* 有缺陷的提议者向CB提议块B
* CA和CB的验证者分别对A和B进行prevote。
* F集合中的有缺陷的验证者同时对A和B进行prevote。
* 有缺陷的prevote消息
    * 对于A的消息比B的消息早到达CA
    * 对于B的消息比A的消息早到达CB
* 因此，CA和CB的正确验证者将观察到超过2/3的prevotes对于A和B以及precommit对于A和B。
* F集合中的有缺陷的验证者对A和B都进行precommit。
* 因此，我们对于A和B都有超过2/3的commits。

后果：

* 在这种情况下，证明不当行为是简单的，因为我们有同一轮中由同一有缺陷的进程签名的多个消息，这些消息对应不同的值。

* 我们必须确保这些不同的消息到达正确的进程（全节点、监视器？），以便可以提交证据。

* 这是对全节点级别的攻击（Fork-Full）。
* 它也适用于轻客户端，
* 对于两者，我们都需要一种检测和恢复机制。

#### 场景2：对轻客户端（LCS）进行等价攻击

验证者：

* 一组F具有超过2/3投票权的有缺陷的验证者。

执行：

* 对于主链，F表现良好
* F协调签署一个与主链上的块B不同的块。
* 轻客户端获取B并信任它，因为它由超过2/3的投票权签名。

后果：

一旦使用错误行为来攻击轻客户端，就会打开空间，以便进行不同类型的攻击，因为应用程序状态可以朝任何方向发散。例如，它可以修改验证器集，使其只包含没有任何抵押的验证器。请注意，在轻客户端被分叉欺骗之后，这意味着攻击者可以任意更改应用程序状态和验证器集。

为了检测这种（基于错误行为的）攻击，轻客户端需要与某个正确的验证器交叉检查其状态（或者使用带外通道从主链获取状态的哈希）。

*备注*：轻客户端将能够创建错误行为的证据，但这将需要从正确的全节点中获取大量数据。也许我们需要找出一种不同的架构，其中受到攻击的轻客户端将把当前的解绑期间的所有数据推送给一个正确的节点，该节点将检查这些数据并提交相应的证据。还有一些架构假设一个特殊角色（有时称为渔夫），其目标是从网络中收集尽可能多的有用数据，进行分析并创建证据交易。该功能超出了本文档的范围。

*备注*：LCS和LCB之间的区别可能只在于使轻客户端相信任意状态所需的投票权的数量。在LCB的情况下，安全阈值最低，攻击者可以使用1/3或更多的投票权任意修改应用程序状态，而在LCS的情况下，需要超过2/3的投票权。

### 翻转：基于遗忘的攻击

在遗忘的情况下，错误的验证器在某个轮次*r*中锁定某个值*v*，然后在更高的轮次中投票给不同的值*v'*，而没有正确解锁值*v*。这种攻击可以用于全节点和轻客户端。

#### 场景3：最多2/3的错误

验证器：

* 一组具有1/3或更多但最多2/3投票权的错误验证器F
* 一组正确的验证器C

执行：

* 有故障的验证器（在主链上不公开）在第 *r* 轮提交一个块 A，通过收集超过 2/3 的投票权（包含正确和有故障的验证器）。
* 所有验证器（正确和有故障的）达到了一个大于第 *r* 轮的第 *r'* 轮。
* 一些正确的验证器在第 *r'* 轮之前没有锁定任何值。
* 有故障的验证器在 F 中偏离 Tendermint 共识，忽略了他们在第 *r* 轮中锁定的 A，并在第 *r'* 轮中提出了一个不同的块 B。
* 由于没有锁定任何值的 C 中的验证器认为 B 是可接受的，他们接受了 B 的提议并提交了一个块 B。

*备注*：在这种情况下，超过 1/3 的有故障的验证器不需要提交一个等价错误（F1），因为他们每轮只投票一次。

在这种攻击情况下，通过在以下文档中描述的分叉可追溯性机制可以检测到有故障的验证器： <https://docs.google.com/document/d/11ZhMsCj3y7zIZz4udO9l25xqb0kl7gmWqNpGVRzOeyY/edit?usp=sharing>。

如果使用这种攻击方式攻击轻客户端，并且拥有 1/3 或更多的投票权（但少于 2/3），攻击者无法任意更改应用程序状态。相反，攻击者受限于正确验证器认为可接受的状态：在上述执行中，正确的验证器仍然认为该值是可接受的，然而，轻客户端信任的块与主链上的块有所偏差。

#### 场景 4：超过 2/3 的故障

如果有超过 2/3 的投票权的攻击，攻击者可以任意更改应用程序状态。

验证器：

* 一组 F1，其中包含 1/3 或更多的故障验证器
* 一组 F2，其中包含少于 1/3 的故障验证器

执行：

* 类似于场景 3（但不需要正确验证器的消息）
* F1 中的有故障的验证器在第 *r* 轮锁定值 A
* 他们在后续轮中签署了一个不同的值
* F2 在第 *r* 轮没有锁定 A

后果：

* F1 中的验证器可以通过分叉可追溯性机制进行检测。
* F2 中的验证器无法使用此机制进行检测。除非他们签署了与应用程序冲突的内容，否则他们没有做任何不正确的事情。
* 此情况不在报告 <https://docs.google.com/document/d/11ZhMsCj3y7zIZz4udO9l25xqb0kl7gmWqNpGVRzOeyY/edit?usp=sharing> 中涵盖，因为它只假设最多有 2/3 的故障验证器。

**问题：**我们是否需要为验证者任意签署状态定义一种特殊类型的攻击？检测这种攻击似乎需要一种不同的机制，该机制需要作为证据提供导致该状态的一系列区块。这可能非常棘手实现。

### 回到过去

在这种攻击中，有缺陷的验证者利用了他们在过去某些轮次中没有签署消息的事实。由于Tendermint运行在异步网络中，我们无法轻易区分这种攻击和延迟的消息。这种攻击可以在全节点和轻客户端中使用。

#### 场景5

验证者：

* C1 - 一组拥有超过1/3投票权的正确验证者
* C2 - 一组拥有1/3投票权的正确验证者
* C1和C2是不相交的
* F - 一组拥有少于1/3投票权的有缺陷的验证者
* 一个额外的有缺陷的进程*q*
* F和*q*违反了Tendermint的故障模型。

执行：

* 在高度为*h*的轮次*r*中，C1预提交了值A，
* C2预提交了nil，
* F没有发送任何消息
* *q*预提交了nil。
* 在某个轮次*r' > r*中，F、*q*和C2提交了与A不同的其他值B。
* F和*fp*“回到过去”，并在轮次*r*中为值A签署预提交消息。
* 与C1的预提交消息一起，这足以对值A进行提交。

后果：

* 只有一个之前预提交了nil的有缺陷的验证者进行了不一致行为，而其他1/3的有缺陷的验证者实际上执行了与遗忘攻击的一系列消息完全相同的攻击。检测这种攻击的关键在于不一致和遗忘的机制。

**问题：**我们是否应将此作为一种单独的攻击类型保留？看起来，不一致、遗忘和幻影验证者是我们需要支持的唯一攻击类型，这也为我们在其他情况下提供了安全性。这并不奇怪，因为不一致和遗忘是从协议中产生的攻击，而幻影攻击实际上不是针对Tendermint的攻击，而更多是针对权益证明模块的攻击。

### 幻影验证者

在幻影验证者的情况下，那些不属于当前验证者集合但仍然被绑定的过程（因为攻击发生在它们的解绑期间）可以通过签署投票消息参与攻击。这种攻击可以针对全节点和轻客户端执行。

#### 场景6

验证者：

* F - 一组在主链上高度为 *h + k* 时不属于验证者集合的错误验证者

执行：

* 存在一个分叉，并且存在两个不同的高度为 *h + k* 的头部，具有不同的验证者集合：
    * 主链上的 VS2
    * 由 F（和其他人）签署的伪造头部 VS2'

* 一个轻客户端对高度为 *h* 的头部（以及相应的验证者集合 VS1）有信任。
* 作为二分头部验证的一部分，它验证了高度为 *h + k* 的头部，其中包含新的验证者集合 VS2'。

后果：

* 要检测到这种情况，节点需要同时看到伪造的头部和链上的规范头部。
* 如果是这种情况，检测这种类型的攻击很容易，只需要验证进程是否在它们不属于验证者集合的高度上签署消息。

**备注。** 我们可以将基于幻影验证者的攻击视为等价或遗忘攻击的后续，其中分叉状态包含不属于主链上的验证者集合的验证者。在这种情况下，它们会继续签署贡献给分叉链（错误分支）的消息，尽管它们不属于主链上的验证者集合。这种攻击也可以用来攻击在被遮蔽的一段时间内的全节点。

**备注。** 幻影验证者的证据已从实现中删除，因为尽管可能是一种合理的证据形式，但并不相关。涉及幻影验证者的轻客户端的任何攻击都必须由1/3+的疯狂验证者发起，他们可以伪造一个包括幻影验证者的新验证者集合。只有在这种情况下，轻客户端才会接受幻影验证者的投票。我们只需要担心惩罚1/3+的疯狂阴谋集团，这是攻击的根本原因。

### 疯狂的验证器

疯狂的验证器同意为任意应用状态签署提交消息。它被用于攻击轻客户端。
请注意，检测此行为需要应用程序知识。可以通过参考发生高度之前的块来检测此行为。

**问：** 在这种情况下，我们可以说验证器在投票之前拒绝检查提议的值是否有效吗？


---
order: 1
parent:
  title: Accountability
  order: 4
---

# Fork accountability

## Problem Statement

Tendermint consensus guarantees the following specifications for all heights:

* agreement -- no two correct full nodes decide differently.
* validity -- the decided block satisfies the predefined predicate *valid()*.
* termination -- all correct full nodes eventually decide,

If the faulty validators have less than 1/3 of voting power in the current validator set. In the case where this assumption
does not hold, each of the specification may be violated.

The agreement property says that for a given height, any two correct validators that decide on a block for that height decide on the same block. That the block was indeed generated by the blockchain, can be verified starting from a trusted (genesis) block, and checking that all subsequent blocks are properly signed.

However, faulty nodes may forge blocks and try to convince users (light clients) that the blocks had been correctly generated. In addition, Tendermint agreement might be violated in the case where 1/3 or more of the voting power belongs to faulty validators: Two correct validators decide on different blocks. The latter case motivates the term "fork": as Tendermint consensus also agrees on the next validator set, correct validators may have decided on disjoint next validator sets, and the chain branches into two or more partitions (possibly having faulty validators in common) and each branch continues to generate blocks independently of the other.

We say that a fork is a case in which there are two commits for different blocks at the same height of the blockchain. The proplem is to ensure that in those cases we are able to detect faulty validators (and not mistakenly accuse correct validators), and incentivize therefore validators to behave according to the protocol specification.

**Conceptual Limit.** In order to prove misbehavior of a node, we have to show that the behavior deviates from correct behavior with respect to a given algorithm. Thus, an algorithm that detects misbehavior of nodes executing some algorithm *A* must be defined with respect to algorithm *A*. In our case, *A* is Tendermint consensus (+ other protocols in the infrastructure; e.g.,full nodes and the Light Client). If the consensus algorithm is changed/updated/optimized in the future, we have to check whether changes to the accountability algorithm are also required. All the discussions in this document are thus inherently specific to Tendermint consensus and the Light Client specification.

**Q:** Should we distinguish agreement for validators and full nodes for agreement? The case where all correct validators agree on a block, but a correct full node decides on a different block seems to be slightly less severe that the case where two correct validators decide on different blocks. Still, if a contaminated full node becomes validator that may be problematic later on. Also it is not clear how gossiping is impaired if a contaminated full node is on a different branch.

*Remark.* In the case 1/3 or more of the voting power belongs to faulty validators, also validity and termination can be broken. Termination can be broken if faulty processes just do not send the messages that are needed to make progress. Due to asynchrony, this is not punishable, because faulty validators can always claim they never received the messages that would have forced them to send messages.

## The Misbehavior of Faulty Validators

Forks are the result of faulty validators deviating from the protocol. In principle several such deviations can be detected without a fork actually occurring:

1. double proposal: A faulty proposer proposes two different values (blocks) for the same height and the same round in Tendermint consensus.

2. double signing: Tendermint consensus forces correct validators to prevote and precommit for at most one value per round. In case a faulty validator sends multiple prevote and/or precommit messages for different values for the same height/round, this is a misbehavior.

3. lunatic validator: Tendermint consensus forces correct validators to prevote and precommit only for values *v* that satisfy *valid(v)*. If faulty validators prevote and precommit for *v* although *valid(v)=false* this is misbehavior.

*Remark.* In isolation, Point 3 is an attack on validity (rather than agreement). However, the prevotes and precommits can then also be used to forge blocks.

1. amnesia: Tendermint consensus has a locking mechanism. If a validator has some value v locked, then it can only prevote/precommit for v or nil. Sending prevote/precomit message for a different value v' (that is not nil) while holding lock on value v is misbehavior.

2. spurious messages: In Tendermint consensus most of the message send instructions are guarded by threshold guards, e.g., one needs to receive *2f + 1* prevote messages to send precommit. Faulty validators may send precommit without having received the prevote messages.

Independently of a fork happening, punishing this behavior might be important to prevent forks altogether. This should keep attackers from misbehaving: if less than 1/3 of the voting power is faulty, this misbehavior is detectable but will not lead to a safety violation. Thus, unless they have 1/3 or more (or in some cases more than 2/3) of the voting power attackers have the incentive to not misbehave. If attackers control too much voting power, we have to deal with forks, as discussed in this document.

## Two types of forks

* Fork-Full. Two correct validators decide on different blocks for the same height. Since also the next validator sets are decided upon, the correct validators may be partitioned to participate in two distinct branches of the forked chain.

As in this case we have two different blocks (both having the same right/no right to exist), a central system invariant (one block per height decided by correct validators) is violated. As full nodes are contaminated in this case, the contamination can spread also to light clients. However, even without breaking this system invariant, light clients can be subject to a fork:

* Fork-Light. All correct validators decide on the same block for height *h*, but faulty processes (validators or not), forge a different block for that height, in order to fool users (who use the light client).

# Attack scenarios

## On-chain attacks

### Equivocation (one round)

There are several scenarios in which forks might happen. The first is double signing within a round.

* F1. Equivocation: faulty validators sign multiple vote messages (prevote and/or precommit) for different values *during the same round r* at a given height h.

### Flip-flopping

Tendermint consensus implements a locking mechanism: If a correct validator *p* receives proposal for value v and *2f + 1* prevotes for a value *id(v)* in round *r*, it locks *v* and remembers *r*. In this case, *p* also sends a precommit message for *id(v)*, which later may serve as proof that *p* locked *v*.
In subsequent rounds, *p* only sends prevote messages for a value it had previously locked. However, it is possible to change the locked value if in a future round *r' > r*, if the process receives proposal and *2f + 1* prevotes for a different value *v'*. In this case, *p* could send a prevote/precommit for *id(v')*. This algorithmic feature can be exploited in two ways:

* F2. Faulty Flip-flopping (Amnesia): faulty validators precommit some value *id(v)* in round *r* (value *v* is locked in round *r*) and then prevote for different value *id(v')* in higher round *r' > r* without previously correctly unlocking value *v*. In this case faulty processes "forget" that they have locked value *v* and prevote some other value in the following rounds.
Some correct validators might have decided on *v* in *r*, and other correct validators decide on *v'* in *r'*. Here we can have branching on the main chain (Fork-Full).

* F3. Correct Flip-flopping (Back to the past): There are some precommit messages signed by (correct) validators for value *id(v)* in  round *r*. Still, *v* is not decided upon, and all processes move on to the next round. Then correct validators (correctly) lock and decide a different value *v'* in some round *r' > r*. And the correct validators continue; there is no branching on the main chain.
However, faulty validators may use the correct precommit messages from round *r* together with a posteriori generated faulty precommit messages for round *r* to forge a block for a value that was not decided on the main chain (Fork-Light).

## Off-chain attacks

F1-F3 may contaminate the state of full nodes (and even validators). Contaminated (but otherwise correct) full nodes may thus communicate faulty blocks to light clients.
Similarly, without actually interfering with the main chain, we can have the following:

* F4. Phantom validators: faulty validators vote (sign prevote and precommit messages) in heights in which they are not part of the validator sets (at the main chain).

* F5. Lunatic validator: faulty validator that sign vote messages to support (arbitrary) application state that is different from the application state that resulted from valid state transitions.

## Types of victims

We consider three types of potential attack victims:

* FN: full node
* LCS: light client with sequential header verification
* LCB: light client with bisection based header verification

F1 and F2 can be used by faulty validators to actually create multiple branches on the blockchain. That means that correctly operating full nodes decide on different blocks for the same height. Until a fork is detected locally by a full node (by receiving evidence from others or by some other local check that fails), the full node can spread corrupted blocks to light clients.

*Remark.* If full nodes take a branch different from the one taken by the validators, it may be that the liveness of the gossip protocol may be affected. We should eventually look at this more closely. However, as it does not influence safety it is not a primary concern.

F3 is similar to F1, except that no two correct validators decide on different blocks. It may still be the case that full nodes become affected.

In addition, without creating a fork on the main chain, light clients can be contaminated by more than a third of validators that are faulty and sign a forged header
F4 cannot fool correct full nodes as they know the current validator set. Similarly, LCS know who the validators are. Hence, F4 is an attack against LCB that do not necessarily know the complete prefix of headers (Fork-Light), as they trust a header that is signed by at least one correct validator (trusting period method).

The following table gives an overview of how the different attacks may affect different nodes. F1-F3 are *on-chain* attacks so they can corrupt the state of full nodes. Then if a light client (LCS or LCB) contacts a full node to obtain headers (or blocks), the corrupted state may propagate to the light client.  

F4 and F5 are *off-chain*, that is, these attacks cannot be used to corrupt the state of full nodes (which have sufficient knowledge on the state of the chain to not be fooled).

| Attack |  FN | LCS | LCB |
|:------:|:------:|:------:|:------:|
| F1 |  direct  | FN |     FN |
| F2 |   direct | FN |     FN |
| F3 |  direct  | FN |     FN |
| F4 |          |    | direct |
| F5 |          |    | direct |

**Q:** Light clients are more vulnerable than full nodes, because the former do only verify headers but do not execute transactions. What kind of certainty is gained by a full node that executes a transaction?

As a full node verifies all transactions, it can only be
contaminated by an attack if the blockchain itself violates its invariant (one block per height), that is, in case of a fork that leads to branching.

## Detailed Attack Scenarios

### Equivocation based attacks

In case of equivocation based attacks, faulty validators sign multiple votes (prevote and/or precommit) in the same
round of some height. This attack can be executed on both full nodes and light clients. It requires 1/3 or more of voting power to be executed.

#### Scenario 1: Equivocation on the main chain

Validators:

* CA - a set of correct validators with less than 1/3 of the voting power
* CB - a set of correct validators with less than 1/3 of the voting power
* CA and CB are disjoint
* F - a set of faulty validators with 1/3 or more voting power

Observe that this setting violates the Tendermint failure model.

Execution:

* A faulty proposer proposes block A to CA
* A faulty proposer proposes block B to CB
* Validators from the set CA and CB prevote for A and B, respectively.
* Faulty validators from the set F prevote both for A and B.
* The faulty prevote messages
    * for A arrive at CA long before the B messages
    * for B arrive at CB long before the A messages
* Therefore correct validators from set CA and CB will observe
more than 2/3 of prevotes for A and B and precommit for A and B, respectively.
* Faulty validators from the set F precommit both values A and B.
* Thus, we have more than 2/3 commits for both A and B.

Consequences:

* Creating evidence of misbehavior is simple in this case as we have multiple messages signed by the same faulty processes for different values in the same round.

* We have to ensure that these different messages reach a correct process (full node, monitor?), which can submit evidence.

* This is an attack on the full node level (Fork-Full).
* It extends also to the light clients,
* For both we need a detection and recovery mechanism.

#### Scenario 2: Equivocation to a light client (LCS)

Validators:

* a set F of faulty validators with more than 2/3 of the voting power.

Execution:

* for the main chain F behaves nicely
* F coordinates to sign a block B that is different from the one on the main chain.
* the light clients obtains B and trusts at as it is signed by more than 2/3 of the voting power.

Consequences:

Once equivocation is used to attack light client it opens space
for different kind of attacks as application state can be diverged in any direction. For example, it can modify validator set such that it contains only validators that do not have any stake bonded. Note that after a light client is fooled by a fork, that means that an attacker can change application state and validator set arbitrarily.

In order to detect such (equivocation-based attack), the light client would need to cross check its state with some correct validator (or to obtain a hash of the state from the main chain using out of band channels).

*Remark.* The light client would be able to create evidence of misbehavior, but this would require to pull potentially a lot of data from correct full nodes. Maybe we need to figure out different architecture where a light client that is attacked will push all its data for the current unbonding period to a correct node that will inspect this data and submit corresponding evidence. There are also architectures that assumes a special role (sometimes called fisherman) whose goal is to collect as much as possible useful data from the network, to do analysis and create evidence transactions. That functionality is outside the scope of this document.

*Remark.* The difference between LCS and LCB might only be in the amount of voting power needed to convince light client about arbitrary state. In case of LCB where security threshold is at minimum, an attacker can arbitrarily modify application state with 1/3 or more of voting power, while in case of LCS it requires more than 2/3 of the voting power.

### Flip-flopping: Amnesia based attacks

In case of amnesia, faulty validators lock some value *v* in some round *r*, and then vote for different value *v'* in higher rounds without correctly unlocking value *v*. This attack can be used both on full nodes and light clients.

#### Scenario 3: At most 2/3 of faults

Validators:

* a set F of faulty validators with 1/3 or more but at most 2/3 of the voting power
* a set C of correct validators

Execution:

* Faulty validators commit (without exposing it on the main chain) a block A in round *r* by collecting more than 2/3 of the
  voting power (containing correct and faulty validators).
* All validators (correct and faulty) reach a round *r' > r*.
* Some correct validators in C do not lock any value before round *r'*.
* The faulty validators in F deviate from Tendermint consensus by ignoring that they locked A in *r*, and propose a different block B in *r'*.
* As the validators in C that have not locked any value find B acceptable, they accept the proposal for B and commit a block B.

*Remark.* In this case, the more than 1/3 of faulty validators do not need to commit an equivocation (F1) as they only vote once per round in the execution.

Detecting faulty validators in the case of such an attack can be done by the fork accountability mechanism described in: <https://docs.google.com/document/d/11ZhMsCj3y7zIZz4udO9l25xqb0kl7gmWqNpGVRzOeyY/edit?usp=sharing>.

If a light client is attacked using this attack with 1/3 or more of voting power (and less than 2/3), the attacker cannot change the application state arbitrarily. Rather, the attacker is limited to a state a correct validator finds acceptable: In the execution above, correct validators still find the value acceptable, however, the block the light client trusts deviates from the one on the main chain.

#### Scenario 4: More than 2/3 of faults

In case there is an attack with more than 2/3 of the voting power, an attacker can arbitrarily change application state.

Validators:

* a set F1 of faulty validators with 1/3 or more of the voting power
* a set F2 of faulty validators with less than 1/3 of the voting power

Execution

* Similar to Scenario 3 (however, messages by correct validators are not needed)
* The faulty validators in F1 lock value A in round *r*
* They sign a different value in follow-up rounds
* F2 does not lock A in round *r*

Consequences:

* The validators in F1 will be detectable by the the fork accountability mechanisms.
* The validators in F2 cannot be detected using this mechanism.
Only in case they signed something which conflicts with the application this can be used against them. Otherwise they do not do anything incorrect.
* This case is not covered by the report <https://docs.google.com/document/d/11ZhMsCj3y7zIZz4udO9l25xqb0kl7gmWqNpGVRzOeyY/edit?usp=sharing> as it only assumes at most 2/3 of faulty validators.

**Q:** do we need to define a special kind of attack for the case where a validator sign arbitrarily state? It seems that detecting such attack requires a different mechanism that would require as an evidence a sequence of blocks that led to that state. This might be very tricky to implement.

### Back to the past

In this kind of attack, faulty validators take advantage of the fact that they did not sign messages in some of the past rounds. Due to the asynchronous network in which Tendermint operates, we cannot easily differentiate between such an attack and delayed message. This kind of attack can be used at both full nodes and light clients.

#### Scenario 5

Validators:

* C1 -  a set of correct validators with over 1/3 of the voting power
* C2 - a set of correct validators with 1/3 of the voting power
* C1 and C2 are disjoint
* F - a set of faulty validators with less than 1/3 voting power
* one additional faulty process *q*
* F and *q* violate the Tendermint failure model.

Execution:

* in a round *r* of height *h* we have C1 precommitting a value A,
* C2 precommits nil,
* F does not send any message
* *q* precommits nil.
* In some round *r' > r*, F and *q* and C2 commit some other value B different from A.
* F and *fp* "go back to the past" and sign precommit message for value A in round *r*.
* Together with precomit messages of C1 this is sufficient for a commit for value A.

Consequences:

* Only a single faulty validator that previously precommited nil did equivocation, while the other 1/3 of faulty validators actually executed an attack that has exactly the same sequence of messages as part of amnesia attack. Detecting this kind of attack boil down to mechanisms for equivocation and amnesia.

**Q:** should we keep this as a separate kind of attack? It seems that equivocation, amnesia and phantom validators are the only kind of attack we need to support and this gives us security also in other cases. This would not be surprising as equivocation and amnesia are attacks that followed from the protocol and phantom attack is not really an attack to Tendermint but more to the Proof of Stake module.

### Phantom validators

In case of phantom validators, processes that are not part of the current validator set but are still bonded (as attack happen during their unbonding period) can be part of the attack by signing vote messages. This attack can be executed against both full nodes and light clients.

#### Scenario 6

Validators:

* F -- a set of faulty validators that are not part of the validator set on the main chain at height *h + k*

Execution:

* There is a fork, and there exist two different headers for height *h + k*, with different validator sets:
    * VS2 on the main chain
    * forged header VS2', signed by F (and others)

* a light client has a trust in a header for height *h* (and the corresponding validator set VS1).
* As part of bisection header verification, it verifies the header at height *h + k* with new validator set VS2'.

Consequences:

* To detect this, a node needs to see both, the forged header and the canonical header from the chain.
* If this is the case, detecting these kind of attacks is easy as it just requires verifying if processes are signing messages in heights in which they are not part of the validator set.  

**Remark.** We can have phantom-validator-based attacks as a follow up of equivocation or amnesia based attack where forked state contains validators that are not part of the validator set at the main chain. In this case, they keep signing messages contributed to a forked chain (the wrong branch) although they are not part of the validator set on the main chain. This attack can also be used to attack full node during a period of time it is eclipsed.

**Remark.** Phantom validator evidence has been removed from implementation as it was deemed, although possibly a plausible form of evidence, not relevant. Any attack on
the light client involving a phantom validator will have needed to be initiated by 1/3+ lunatic
validators that can forge a new validator set that includes the phantom validator. Only in
that case will the light client accept the phantom validators vote. We need only worry about
punishing the 1/3+ lunatic cabal, that is the root cause of the attack.

### Lunatic validator

Lunatic validator agrees to sign commit messages for arbitrary application state. It is used to attack light clients.
Note that detecting this behavior require application knowledge. Detecting this behavior can probably be done by
referring to the block before the one in which height happen.  

**Q:** can we say that in this case a validator declines to check if a proposed value is valid before voting for it?
