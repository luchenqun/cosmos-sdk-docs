# 讨论和决策结果

- 生成一个最小的分叉证明（如[问题 #5083](https://github.com/tendermint/tendermint/issues/5083)中建议的）在轻客户端上成本太高
    - 我们不知道主节点的所有轻区块
    - 因此存在许多情况。我们甚至可能需要再次向主节点请求额外的轻区块来隔离分支。

> 例如，轻节点从高度1的区块开始，主节点提供了一个高度为10的区块，轻节点可以立即验证。在交叉检查中，一个次要节点现在提供了一个冲突的高度为10的头部b10，需要另一个高度为5的头部b5来验证。现在，为了让轻节点说服主节点：

> - 轻节点不能只发送b5，因为不清楚分叉是在5之前还是之后发生的
> - 轻节点不能只发送b10，因为主节点也需要b5来验证
> - 为了最小化证据，轻节点可以尝试找出分支发生的位置，例如通过向主节点请求高度为5的区块（可能需要更多的查询，还要向次要节点查询）。然而，假设在这种情况下主节点存在故障，它可能不会响应。

   由于主要目标是捕获主节点的不当行为，证据生成和惩罚不能依赖于它们的合作。因此，一旦我们拥有分叉的证据（即使它包含多个轻区块），我们应该立即提交。

- 决策：完整的分叉证明由两个起源于相同轻区块并导致相同高度的冲突头部的追踪组成。

- 对于提交分叉证明，我们可以进行一些优化，例如，我们可能只提交一个轻区块的追踪，该追踪验证了一个与完整节点所知的区块不同的区块（我们不将主节点给我们的追踪发送回主节点）。

- 轻客户端攻击是通过主节点进行的。因此，我们试图捕获主节点是否安装了一个错误的轻区块
    - 我们不会对次要节点进行检查
    - 对于每个次要节点，我们将主节点与一个次要节点进行检查

- 注意，仅仅两个相同高度的区块并不足以证明存在分叉。
其中一个区块可能是伪造的[TMBC-BOGUS.1]，并不构成可惩罚的行为。
这就引出了一个问题，轻节点是否应该在初始区块（从主观初始化开始）上进行分叉检测。
可以通过向后验证（使用哈希）直到找到一个分叉区块来实现这一点。
虽然存在一些场景可以找到分叉，但也存在一种情况，即有一个有问题的全节点向轻节点提供虚假的轻区块，并迫使轻节点检查哈希直到虚假链超出可信任期。
因此，轻客户端不应该在初始头部上尝试检测分叉。**初始头部必须被信任为原样。**

# 轻客户端顺序监督员

**TODO：**决定将以下内容放在哪个规范中：

我们通过给出顺序版本的监督员函数来描述分叉检测器被调用的上下文。
大致上，它交替进行两个阶段，即：

- 轻客户端验证。结果是，已经从主节点下载并验证了所需高度的头部。
- 轻客户端分叉检测。结果是，头部已经与备用节点进行了交叉检查。如果存在分叉，我们提交“分叉证明”并退出。

#### **[LC-FUNC-SUPERVISOR.1]:**

```go
func Sequential-Supervisor () (Error) {
    loop {
     // get the next height
        nextHeight := input();
  
  // Verify
        result := NoResult;
        while result != ResultSuccess {
            lightStore,result := VerifyToTarget(primary, lightStore, nextHeight);
            if result == ResultFailure {
    // pick new primary (promote a secondary to primary)
    /// and delete all lightblocks above
             // LastTrusted (they have not been cross-checked)
             Replace_Primary();
   }
        }
  
  // Cross-check
        PoFs := Forkdetector(lightStore, PoFs);
        if PoFs.Empty {
      // no fork detected with secondaries, we trust the new
   // lightblock
            LightStore.Update(testedLB, StateTrusted);
        }
        else {
      // there is a fork, we submit the proofs and exit
            for i, p range PoFs {
                SubmitProofOfFork(p);
            }
            return(ErrorFork);
        }
    }
}
```

**TODO：**完成条件

- 实现备注
- 预期前置条件
    - *lightStore* 使用可信任的头部进行初始化
    - *PoFs* 为空
- 预期后置条件
    - 永远运行，或者
    - 被用户终止并满足LightStore不变式，或者**TODO**
    - 在检测到分叉时已经提交了分叉证明
- 错误条件
    - 无

----

# 轻存储的语义

目前，轻存储中的轻区块可以处于以下状态之一：

- 未验证状态（StateUnverified）
- 已验证状态（StateVerified）
- 失败状态（StateFailed）
- 可信任状态（StateTrusted）

直觉上，`StateVerified`表示轻区块已经与主节点进行了验证，而`StateTrusted`是在与备用节点进行了成功的交叉检查后的状态。

假设在主节点和次要节点中**始终有一个正确的节点**，并且区块链上没有分叉，那么处于`StateTrusted`状态的轻节点可以被用户使用，并且具有“确定性”的保证。如果使用了`StateVerified`状态的区块，可能会在后续的检测中发现分叉，并且可能需要进行回滚。

**备注：**假设只有一个正确的节点并不意味着验证变得无用。确实，如果主节点和次要节点返回相同的区块，我们可以信任它。然而，如果有一个节点提供了不同的区块，轻节点仍然需要进行验证，以了解是否存在分叉，或者不同的区块是否只是虚假的（没有任何先前验证者集的支持）。

**备注：**轻节点可以选择与之通信的全节点（甚至轻节点和全节点可能属于同一个利益相关者），因此在某些情况下，这种假设可能是合理的。

在未来，我们将进行以下更改：

- 我们假设轻节点只偶尔连接到一个正确的全节点
- 这意味着在有限的时间内，轻节点可能无法抵御轻客户端攻击
- 结果是我们没有确定性
- 一旦轻节点重新连接到一个正确的全节点，它应该检测到轻客户端攻击并提交证据。

在这些假设下，`StateTrusted`失去了意义。因此，应该从API中删除它。我们建议用一个名为“trusted”的标志来替代它，可以用于：

- 内部的效率原因（在检测到分叉之前维护[LCD-INV-TRUSTED-AGREED.1]）
- 基于“一个正确的全节点”假设的轻客户端使用


# Results of Discussions and Decisions

- Generating a minimal proof of fork (as suggested in [Issue #5083](https://github.com/tendermint/tendermint/issues/5083)) is too costly at the light client
    - we do not know all lightblocks from the primary
    - therefore there are many scenarios. we might even need to ask
      the primary again for additional lightblocks to isolate the
      branch.

> For instance, the light node starts with block at height 1 and the
> primary provides a block of height 10 that the light node can
> verify immediately. In cross-checking, a secondary now provides a
> conflicting header b10 of height 10 that needs another header b5
> of height 5 to
> verify. Now, in order for the light node to convince the primary:
>
> - The light node cannot just sent b5, as it is not clear whether
>     the fork happened before or after 5
> - The light node cannot just send b10, as the primary would also
>     need  b5 for verification
> - In order to minimize the evidence, the light node may try to
>     figure out where the branch happens, e.g., by asking the primary
>     for height 5 (it might be that more queries are required, also
>     to the secondary. However, assuming that in this scenario the
>     primary is faulty it may not respond.

   As the main goal is to catch misbehavior of the primary,
      evidence generation and punishment must not depend on their
      cooperation. So the moment we have proof of fork (even if it
      contains several light blocks) we should submit right away.

- decision: "full" proof of fork consists of two traces that originate in the
  same lightblock and lead to conflicting headers of the same height.
  
- For submission of proof of fork, we may do some optimizations, for
  instance, we might just submit  a trace of lightblocks that verifies a block
  different from the one the full node knows (we do not send the trace
  the primary gave us back to the primary)

- The light client attack is via the primary. Thus we try to
  catch if the primary installs a bad light block
    - We do not check secondary against secondary
    - For each secondary, we check the primary against one secondary

- Observe that just two blocks for the same height are not
sufficient proof of fork.
One of the blocks may be bogus [TMBC-BOGUS.1] which does
not constitute slashable behavior.  
Which leads to the question whether the light node should try to do
fork detection on its initial block (from subjective
initialization). This could be done by doing backwards verification
(with the hashes) until a bifurcation block is found.
While there are scenarios where a
fork could be found, there is also the scenario where a faulty full
node feeds the light node with bogus light blocks and forces the light
node to check hashes until a bogus chain is out of the trusting period.
As a result, the light client
should not try to detect a fork for its initial header. **The initial
header must be trusted as is.**

# Light Client Sequential Supervisor

**TODO:** decide where (into which specification) to put the
following:

We describe the context on which the fork detector is called by giving
a sequential version of the supervisor function.
Roughly, it alternates two phases namely:

- Light Client Verification. As a result, a header of the required
     height has been downloaded from and verified with the primary.
- Light Client Fork Detections. As a result the header has been
     cross-checked with the secondaries. In case there is a fork we
     submit "proof of fork" and exit.

#### **[LC-FUNC-SUPERVISOR.1]:**

```go
func Sequential-Supervisor () (Error) {
    loop {
     // get the next height
        nextHeight := input();
  
  // Verify
        result := NoResult;
        while result != ResultSuccess {
            lightStore,result := VerifyToTarget(primary, lightStore, nextHeight);
            if result == ResultFailure {
    // pick new primary (promote a secondary to primary)
    /// and delete all lightblocks above
             // LastTrusted (they have not been cross-checked)
             Replace_Primary();
   }
        }
  
  // Cross-check
        PoFs := Forkdetector(lightStore, PoFs);
        if PoFs.Empty {
      // no fork detected with secondaries, we trust the new
   // lightblock
            LightStore.Update(testedLB, StateTrusted);
        }
        else {
      // there is a fork, we submit the proofs and exit
            for i, p range PoFs {
                SubmitProofOfFork(p);
            }
            return(ErrorFork);
        }
    }
}
```

**TODO:** finish conditions

- Implementation remark
- Expected precondition
    - *lightStore* initialized with trusted header
    - *PoFs* empty
- Expected postcondition
    - runs forever, or
    - is terminated by user and satisfies LightStore invariant, or **TODO**
    - has submitted proof of fork upon detecting a fork
- Error condition
    - none

----

# Semantics of the LightStore

Currently, a lightblock in the lightstore can be in one of the
following states:

- StateUnverified
- StateVerified
- StateFailed
- StateTrusted

The intuition is that `StateVerified` captures that the lightblock has
been verified with the primary, and `StateTrusted` is the state after
successful cross-checking with the secondaries.

Assuming there is **always one correct node among primary and
secondaries**, and there is no fork on the blockchain, lightblocks that
are in `StateTrusted` can be used by the user with the guarantee of
"finality". If a block in  `StateVerified` is used, it might be that
detection later finds a fork, and a roll-back might be needed.

**Remark:** The assumption of one correct node, does not render
verification useless. It is true that if the primary and the
secondaries return the same block we may trust it. However, if there
is a node that provides a different block, the light node still needs
verification to understand whether there is a fork, or whether the
different block is just bogus (without any support of some previous
validator set).

**Remark:** A light node may choose the full nodes it communicates
with (the light node and the full node might even belong to the same
stakeholder) so the assumption might be justified in some cases.

In the future, we will do the following changes

- we assume that only from time to time, the light node is
     connected to a correct full node
- this means for some limited time, the light node might have no
     means to defend against light client attacks
- as a result we do not have finality
- once the light node reconnects with a correct full node, it
     should detect the light client attack and submit evidence.

Under these assumptions, `StateTrusted` loses its meaning. As a
result, it should be removed from the API. We suggest that we replace
it with a flag "trusted" that can be used

- internally for efficiency reasons (to maintain
  [LCD-INV-TRUSTED-AGREED.1] until a fork is detected)
- by light client based on the "one correct full node" assumption

----
