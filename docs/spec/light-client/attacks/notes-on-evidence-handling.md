# 轻客户端攻击

我们将轻客户端攻击定义为在给定高度上可以从可信轻区块开始验证的冲突头的检测。轻客户端攻击是在轻客户端与两个节点之间的交互环境中定义的。其中一个节点（称为主节点）定义了已验证的轻区块的追踪（主追踪），这些轻区块正在与另一个节点的追踪（称为见证节点）进行检查，我们称之为见证追踪。

轻客户端攻击由主追踪和见证追踪定义，它们具有共同的根（相同高度的相同可信轻区块），但形成冲突的分支（追踪的末尾具有不同的头）。请注意，冲突的分支可以任意大，因为在分叉点之后分支继续发散。我们提出了一种方法，只需一个共同的轻区块和一个冲突的轻区块就可以定义一个有效的轻客户端攻击。我们依赖于以下事实：我们假设主节点受到怀疑（因此不可信），而见证节点扮演支持角色来检测和处理攻击（因此可信）。因此，一旦轻客户端检测到攻击，它只需要向见证节点发送缺失的数据（共同高度和冲突的轻区块），因为它有自己的追踪。保持轻客户端攻击数据的大小恒定可以节省带宽并减少攻击面。正如我们将在下面解释的那样，在轻客户端核心[验证](https://github.com/informalsystems/tendermint-rs/tree/master/docs/spec/lightclient/verification)的上下文中，主节点和见证节点的角色是明确定义的，但在攻击的情况下，我们运行相同的攻击检测过程两次，只是角色互换了。这样做的原因是轻客户端不知道哪个节点是正确的（在正确的主分支上），因此它尝试创建并提交攻击证据给两个节点。

轻客户端攻击证据由一个冲突的轻区块和一个共同的高度组成。

```go
type LightClientAttackEvidence struct {
    ConflictingBlock   LightBlock
    CommonHeight       int64
}
```

完整节点可以通过执行以下过程来验证轻客户端攻击证据：

```go
func IsValid(lcaEvidence LightClientAttackEvidence, bc Blockchain) boolean {
    commonBlock = GetLightBlock(bc, lcaEvidence.CommonHeight)
    if commonBlock == nil return false

    // Note that trustingPeriod in ValidAndVerified is set to UNBONDING_PERIOD
    verdict = ValidAndVerified(commonBlock, lcaEvidence.ConflictingBlock)
    conflictingHeight = lcaEvidence.ConflictingBlock.Header.Height

    return verdict == OK and bc[conflictingHeight].Header != lcaEvidence.ConflictingBlock.Header
}
```

## 轻客户端攻击创建

给定一个可信的轻区块 `trusted`，轻节点执行二分算法来验证某个高度 `h` 的头部 `untrusted`。如果二分算法成功，则验证头部 `untrusted`。作为二分算法的一部分下载的头部存储在存储器中，并且它们也处于验证状态。因此，在二分算法成功终止后，我们有一个从主节点获得的轻区块（[] LightBlock）的追踪，我们称之为主追踪。

### 主追踪

主追踪满足以下不变式：

- 给定一个 `trusted` 轻区块，目标高度 `h` 和 `primary_trace`（[] LightBlock）：
    *primary_trace[0] == trusted* 和 *primary_trace[len(primary_trace)-1].Height == h*，并且连续的轻区块通过轻客户端验证逻辑。

### 具有冲突头部的证人

在高度 `h` 处，验证的头部与每个证人进行交叉检查，作为[detection](https://github.com/informalsystems/tendermint-rs/tree/master/docs/spec/lightclient/detection)的一部分。如果一个证人返回高度 `h` 处的冲突头部，则执行以下过程来验证冲突头部是否来自有效追踪，如果是这样，则创建攻击证据：

#### 辅助函数

我们假设以下辅助函数：

```go
// Returns trace of verified light blocks starting from rootHeight and ending with targetHeight.
Trace(lightStore LightStore, rootHeight int64, targetHeight int64) LightBlock[]

// Returns validator set for the given height
GetValidators(bc Blockchain, height int64) Validator[]

// Returns validator set for the given height
GetValidators(bc Blockchain, height int64) Validator[]

// Return validator addresses for the given validators
GetAddresses(vals Validator[]) ValidatorAddress[]
```

```go
func DetectLightClientAttacks(primary PeerID,
                              primary_trace []LightBlock,
                              witness PeerID) (LightClientAttackEvidence, LightClientAttackEvidence) {
    primary_lca_evidence, witness_trace = DetectLightClientAttack(primary_trace, witness)

    witness_lca_evidence = nil
    if witness_trace != nil {
        witness_lca_evidence, _ = DetectLightClientAttack(witness_trace, primary)
    }
    return primary_lca_evidence, witness_lca_evidence
}

func DetectLightClientAttack(trace []LightBlock, peer PeerID) (LightClientAttackEvidence, []LightBlock) {

    lightStore = new LightStore().Update(trace[0], StateTrusted)

    for i in 1..len(trace)-1 {
        lightStore, result = VerifyToTarget(peer, lightStore, trace[i].Header.Height)

        if result == ResultFailure then return (nil, nil)

        current = lightStore.Get(trace[i].Header.Height)

        // if obtained header is the same as in the trace we continue with a next height
        if current.Header == trace[i].Header continue

        // we have identified a conflicting header
        commonBlock = trace[i-1]
        conflictingBlock = trace[i]

        return (LightClientAttackEvidence { conflictingBlock, commonBlock.Header.Height },
                Trace(lightStore, trace[i-1].Header.Height, trace[i].Header.Height))
    }
    return (nil, nil)
}
```

## 证据处理

作为链上证据处理的一部分，全节点识别出恶意进程并通知应用程序，以便对其进行惩罚。请注意，只有已绑定的验证者应该向应用程序报告。对 Tendermint 轻客户端可以执行三种类型的攻击：

- 疯狂攻击
- 相互矛盾攻击
- 遗忘攻击

现在我们来具体说明证据处理逻辑。

```go
func detectMisbehavingProcesses(lcAttackEvidence LightClientAttackEvidence, bc Blockchain) []ValidatorAddress {
   assume IsValid(lcaEvidence, bc)

   // lunatic light client attack
   if !isValidBlock(current.Header, conflictingBlock.Header) {
        conflictingCommit = lcAttackEvidence.ConflictingBlock.Commit
        bondedValidators = GetNextValidators(bc, lcAttackEvidence.CommonHeight)

        return getSigners(conflictingCommit) intersection GetAddresses(bondedValidators)

   // equivocation light client attack
   } else if current.Header.Round == conflictingBlock.Header.Round {
        conflictingCommit = lcAttackEvidence.ConflictingBlock.Commit
        trustedCommit = bc[conflictingBlock.Header.Height+1].LastCommit

        return getSigners(trustedCommit) intersection getSigners(conflictingCommit)

   // amnesia light client attack
   } else {
        HandleAmnesiaAttackEvidence(lcAttackEvidence, bc)
   }
}

// Block validity in this context is defined by the trusted header.
func isValidBlock(trusted Header, conflicting Header) boolean {
    return trusted.ValidatorsHash == conflicting.ValidatorsHash and
           trusted.NextValidatorsHash == conflicting.NextValidatorsHash and
           trusted.ConsensusHash == conflicting.ConsensusHash and
           trusted.AppHash == conflicting.AppHash and
           trusted.LastResultsHash == conflicting.LastResultsHash
}

func getSigners(commit Commit) []ValidatorAddress {
    signers = []ValidatorAddress
    for (i, commitSig) in commit.Signatures {
        if commitSig.BlockIDFlag == BlockIDFlagCommit {
            signers.append(commitSig.ValidatorAddress)
        }
    }
    return signers
}
```

请注意，遗忘攻击的证据处理涉及更复杂的处理，即不能简单地定义在遗忘攻击的证据上。我们在下一节中解释了处理遗忘攻击证据的协议。

### 处理遗忘攻击的证据

在遗忘攻击的情况下，检测到故障进程更加复杂，不能仅仅基于攻击证据数据进行推断。在这种情况下，为了检测到行为不端的进程，我们需要访问冲突高度期间进程发送/接收的投票。因此，遗忘攻击处理假设验证者在多轮高度（因为遗忘攻击只可能发生在执行多轮的高度，即提交轮数 > 0）期间持久化所有接收到的和发送的投票。

为了简化算法的描述，我们假设存在一个可信的被称为监视器的预言机，它将驱动算法并在最后输出故障进程。监视器可以在分布式环境中作为链上模块实现。算法的工作如下：
    1) 监视器向冲突高度的验证者发送投票集请求。预期验证者在预定义的超时时间内发送其投票集。
    2) 在收到投票集请求后，验证者将其投票集发送给监视器。
    2) 在超时时间内未发送其投票集的验证者被认为是有故障的。
    3) 对投票集进行预处理。这意味着分析接收到的投票集，并将每个由进程 p 发送的（有效的）投票添加到发送者 p 的投票集中。这个阶段确保了至少有一个正确的验证者观察到的由有故障的进程发送的投票不能被排除在分析之外。
    4) 独立地分析每个验证者的投票集，以决定验证者是正确的还是有故障的。
       有故障的验证者是那些至少有以下一种无效转换的验证者：
            - 在一轮中发送了多个 PREVOTE 消息
            - 在一轮中发送了多个 PRECOMMIT 消息
            - 发送了 PRECOMMIT 消息，但没有接收到等同于 +2/3 的投票权重的适当 PREVOTE 消息
            - 在轮数 r' 中发送了值为 V' 的 PREVOTE 消息，并且同一进程在轮数 r 中发送了值为 V 的 PRECOMMIT 消息（r' > r），并且没有等同于 +2/3 的投票权重的 PREVOTE(vr, V') 消息（vr ≥ 0，vr > r，vr < r'）作为发送 PREVOTE(r', V') 的理由

Sure, please paste the Markdown content that you would like me to translate.



# Light client attacks

We define a light client attack as detection of conflicting headers for a given height that can be verified
starting from the trusted light block. A light client attack is defined in the context of interactions of
light client with two peers. One of the peers (called primary) defines a trace of verified light blocks
(primary trace) that are being checked against trace of the other peer (called witness) that we call
witness trace.

A light client attack is defined by the primary and witness traces
that have a common root (the same trusted light block for a common height) but forms
conflicting branches (end of traces is for the same height but with different headers).
Note that conflicting branches could be arbitrarily big as branches continue to diverge after
a bifurcation point. We propose an approach that allows us to define a valid light client attack
only with a common light block and a single conflicting light block. We rely on the fact that
we assume that the primary is under suspicion (therefore not trusted) and that the witness plays
support role to detect and process an attack (therefore trusted). Therefore, once a light client
detects an attack, it needs to send to a witness only missing data (common height
and conflicting light block) as it has its trace. Keeping light client attack data of constant size
saves bandwidth and reduces an attack surface. As we will explain below, although in the context of
light client core
[verification](https://github.com/informalsystems/tendermint-rs/tree/master/docs/spec/lightclient/verification)
the roles of primary and witness are clearly defined,
in case of the attack, we run the same attack detection procedure twice where the roles are swapped.
The rationale is that the light client does not know what peer is correct (on a right main branch)
so it tries to create and submit an attack evidence to both peers.

Light client attack evidence consists of a conflicting light block and a common height.

```go
type LightClientAttackEvidence struct {
    ConflictingBlock   LightBlock
    CommonHeight       int64
}
```

Full node can validate a light client attack evidence by executing the following procedure:

```go
func IsValid(lcaEvidence LightClientAttackEvidence, bc Blockchain) boolean {
    commonBlock = GetLightBlock(bc, lcaEvidence.CommonHeight)
    if commonBlock == nil return false

    // Note that trustingPeriod in ValidAndVerified is set to UNBONDING_PERIOD
    verdict = ValidAndVerified(commonBlock, lcaEvidence.ConflictingBlock)
    conflictingHeight = lcaEvidence.ConflictingBlock.Header.Height

    return verdict == OK and bc[conflictingHeight].Header != lcaEvidence.ConflictingBlock.Header
}
```

## Light client attack creation

Given a trusted light block `trusted`, a light node executes the bisection algorithm to verify header
`untrusted` at some height `h`. If the bisection algorithm succeeds, then the header `untrusted` is verified.
Headers that are downloaded as part of the bisection algorithm are stored in a store and they are also in
the verified state. Therefore, after the bisection algorithm successfully terminates we have a trace of
the light blocks ([] LightBlock) we obtained from the primary that we call primary trace.

### Primary trace

The following invariant holds for the primary trace:

- Given a `trusted` light block, target height `h`, and `primary_trace` ([] LightBlock):
    *primary_trace[0] == trusted* and *primary_trace[len(primary_trace)-1].Height == h* and
    successive light blocks are passing light client verification logic.

### Witness with a conflicting header

The verified header at height `h` is cross-checked with every witness as part of
[detection](https://github.com/informalsystems/tendermint-rs/tree/master/docs/spec/lightclient/detection).
If a witness returns the conflicting header at the height `h` the following procedure is executed to verify
if the conflicting header comes from the valid trace and if that's the case to create an attack evidence:

#### Helper functions

We assume the following helper functions:

```go
// Returns trace of verified light blocks starting from rootHeight and ending with targetHeight.
Trace(lightStore LightStore, rootHeight int64, targetHeight int64) LightBlock[]

// Returns validator set for the given height
GetValidators(bc Blockchain, height int64) Validator[]

// Returns validator set for the given height
GetValidators(bc Blockchain, height int64) Validator[]

// Return validator addresses for the given validators
GetAddresses(vals Validator[]) ValidatorAddress[]
```

```go
func DetectLightClientAttacks(primary PeerID,
                              primary_trace []LightBlock,
                              witness PeerID) (LightClientAttackEvidence, LightClientAttackEvidence) {
    primary_lca_evidence, witness_trace = DetectLightClientAttack(primary_trace, witness)

    witness_lca_evidence = nil
    if witness_trace != nil {
        witness_lca_evidence, _ = DetectLightClientAttack(witness_trace, primary)
    }
    return primary_lca_evidence, witness_lca_evidence
}

func DetectLightClientAttack(trace []LightBlock, peer PeerID) (LightClientAttackEvidence, []LightBlock) {

    lightStore = new LightStore().Update(trace[0], StateTrusted)

    for i in 1..len(trace)-1 {
        lightStore, result = VerifyToTarget(peer, lightStore, trace[i].Header.Height)

        if result == ResultFailure then return (nil, nil)

        current = lightStore.Get(trace[i].Header.Height)

        // if obtained header is the same as in the trace we continue with a next height
        if current.Header == trace[i].Header continue

        // we have identified a conflicting header
        commonBlock = trace[i-1]
        conflictingBlock = trace[i]

        return (LightClientAttackEvidence { conflictingBlock, commonBlock.Header.Height },
                Trace(lightStore, trace[i-1].Header.Height, trace[i].Header.Height))
    }
    return (nil, nil)
}
```

## Evidence handling

As part of on chain evidence handling, full nodes identifies misbehaving processes and informs
the application, so they can be slashed. Note that only bonded validators should
be reported to the application. There are three types of attacks that can be executed against
Tendermint light client:

- lunatic attack
- equivocation attack and
- amnesia attack.  

We now specify the evidence handling logic.

```go
func detectMisbehavingProcesses(lcAttackEvidence LightClientAttackEvidence, bc Blockchain) []ValidatorAddress {
   assume IsValid(lcaEvidence, bc)

   // lunatic light client attack
   if !isValidBlock(current.Header, conflictingBlock.Header) {
        conflictingCommit = lcAttackEvidence.ConflictingBlock.Commit
        bondedValidators = GetNextValidators(bc, lcAttackEvidence.CommonHeight)

        return getSigners(conflictingCommit) intersection GetAddresses(bondedValidators)

   // equivocation light client attack
   } else if current.Header.Round == conflictingBlock.Header.Round {
        conflictingCommit = lcAttackEvidence.ConflictingBlock.Commit
        trustedCommit = bc[conflictingBlock.Header.Height+1].LastCommit

        return getSigners(trustedCommit) intersection getSigners(conflictingCommit)

   // amnesia light client attack
   } else {
        HandleAmnesiaAttackEvidence(lcAttackEvidence, bc)
   }
}

// Block validity in this context is defined by the trusted header.
func isValidBlock(trusted Header, conflicting Header) boolean {
    return trusted.ValidatorsHash == conflicting.ValidatorsHash and
           trusted.NextValidatorsHash == conflicting.NextValidatorsHash and
           trusted.ConsensusHash == conflicting.ConsensusHash and
           trusted.AppHash == conflicting.AppHash and
           trusted.LastResultsHash == conflicting.LastResultsHash
}

func getSigners(commit Commit) []ValidatorAddress {
    signers = []ValidatorAddress
    for (i, commitSig) in commit.Signatures {
        if commitSig.BlockIDFlag == BlockIDFlagCommit {
            signers.append(commitSig.ValidatorAddress)
        }
    }
    return signers
}
```

Note that amnesia attack evidence handling involves more complex processing, i.e., cannot be
defined simply on amnesia attack evidence. We explain in the following section a protocol
for handling amnesia attack evidence.

### Amnesia attack evidence handling

Detecting faulty processes in case of the amnesia attack is more complex and cannot be inferred
purely based on attack evidence data. In this case, in order to detect misbehaving processes we need
access to votes processes sent/received during the conflicting height. Therefore, amnesia handling assumes that
validators persist all votes received and sent during multi-round heights (as amnesia attack
is only possible in heights that executes over multiple rounds, i.e., commit round > 0).  

To simplify description of the algorithm we assume existence of the trusted oracle called monitor that will
drive the algorithm and output faulty processes at the end. Monitor can be implemented in a
distributed setting as on-chain module. The algorithm works as follows:
    1) Monitor sends votesets request to validators of the conflicting height. Validators
    are expected to send their votesets within predefined timeout.
    2) Upon receiving votesets request, validators send their votesets to a monitor.  
    2) Validators which have not sent its votesets within timeout are considered faulty.
    3) The preprocessing of the votesets is done. That means that the received votesets are analyzed
    and each vote (valid) sent by process p is added to the voteset of the sender p. This phase ensures that
    votes sent by faulty processes observed by at least one correct validator cannot be excluded from the analysis.
    4) Votesets of every validator are analyzed independently to decide whether the validator is correct or faulty.
       A faulty validators is the one where at least one of those invalid transitions is found:
            - More than one PREVOTE message is sent in a round
            - More than one PRECOMMIT message is sent in a round
            - PRECOMMIT message is sent without receiving +2/3 of voting-power equivalent
            appropriate PREVOTE messages
            - PREVOTE message is sent for the value V’ in round r’ and the PRECOMMIT message had
            been sent for the value V in round r by the same process (r’ > r) and there are no
            +2/3 of voting-power equivalent PREVOTE(vr, V’) messages (vr ≥ 0 and vr > r and vr < r’)
            as the justification for sending PREVOTE(r’, V’)
