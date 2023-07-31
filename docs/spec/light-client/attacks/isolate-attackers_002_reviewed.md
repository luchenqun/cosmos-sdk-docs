# 轻客户端攻击者隔离

对于轻客户端而言，对于 Tendermint 区块链的状态，攻击性节点可能有动机进行虚假陈述。试图这样做被称为攻击。轻客户端 [验证][verification] 通过检查所谓的“提交”来检查传入数据，提交是一组（假设）在执行 Tendermint 共识期间产生的已签名消息。因此，攻击归结为创建和签署与 Tendermint 共识算法规则不符的 Tendermint 共识消息。

由于在每个区块中，Tendermint 共识和轻客户端验证在假设超过 2/3 的正确投票权力的情况下是安全的[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]，这意味着如果存在攻击，则违反了[[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link]，也就是说，存在这样一个区块：

- 验证者偏离了协议，并且
- 这些验证者在该区块中代表了超过 1/3 的投票权力。

在[攻击][node-based-attack-characterization]的情况下，轻客户端[攻击检测机制][detection]计算数据，即所谓的证据[[LC-DATA-EVIDENCE.1]][LC-DATA-EVIDENCE-link]，可以用于

- 证明已经发生了攻击[[TMBC-LC-EVIDENCE-DATA.1]][TMBC-LC-EVIDENCE-DATA-link]，以及
- 作为找到偏离 Tendermint 协议的实际节点的基础。

本规范考虑了 Tendermint 区块链中的完整节点如何隔离发起攻击的一组攻击者。该集合应满足以下条件：

- 该集合不包含正确的验证者
- 该集合包含代表仍处于解绑期的区块的超过 1/3 的投票权力的验证者

# 大纲

在提供了[问题陈述](#第一部分-基础和问题定义)之后，我们指定了[隔离函数](#第二部分-协议)，并以对 Tendermint 共识的计算机辅助分析为基础讨论了其[正确性](#第三部分-完整性)。

# 第一部分 - 基础和问题定义

对于此处使用的数据结构的定义，特别是LightBlocks [[LCV-DATA-LIGHTBLOCK.1]](https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-data-lightblock1)，我们参考了[轻客户端验证][verification]的规范。

[检测机制][detection]的规范描述了以下内容：

- 什么是轻客户端攻击，
- 检测器在何种条件下会检测到轻客户端攻击，
- 以及在检测到攻击时的输出数据格式，称为证据。该格式在[[LC-DATA-EVIDENCE.1]][LC-DATA-EVIDENCE-link]中定义，如下所示：

```go
type LightClientAttackEvidence struct {
    ConflictingBlock   LightBlock
    CommonHeight       int64
}
```

隔离器是一个函数，它以证据`ev`和区块链的前缀`bc`作为输入，至少要达到高度`ev.ConflictingBlock.Header.Height + 1`。输出是一组验证者的*peerIDs*。

我们假设全节点与区块链同步，并且已经达到高度`ev.ConflictingBlock.Header.Height + 1`。

#### **[LCAI-INV-Output.1]**

当生成输出时，满足以下属性：

- 如果
    - `bc[CommonHeight].bfttime`在全节点的解绑定期内，
    - `ev.ConflictingBlock.Header != bc[ev.ConflictingBlock.Header.Height]`
    - `ev.ConflictingBlock.Commit`中的验证者在`bc[ev.CommonHeight].NextValidators`中代表超过1/3的投票权
- 那么：输出是`bc[CommonHeight].NextValidators`中的一组验证者，这些验证者
    - 在`bc[ev.commonHeight].NextValidators`中代表超过1/3的投票权
    - 通过违反Tendermint共识协议为高度`ev.ConflictingBlock.Header.Height`签署了Tendermint共识消息。
- 否则：为空集。

# 第二部分 - 协议

在这里，我们讨论如何解决隔离恶意进程的问题。我们描述了函数`isolateMisbehavingProcesses`以及下面的所有辅助函数。在[第三部分](#part-III---Completeness)中，我们将根据使用自动化工具进行分析的结果讨论解决方案的完整性。

## 隔离

### 大纲

我们首先检查是否可以从共同高度验证冲突块。然后，我们首先检查是否是疯狂攻击（违反有效性）。如果不是这种情况，我们检查是否存在不一致。如果也不是这种情况，我们开始进行链上[问责协议](https://docs.google.com/document/d/11ZhMsCj3y7zIZz4udO9l25xqb0kl7gmWqNpGVRzOeyY/edit)。

#### **[LCAI-FUNC-MAIN.1]**

```go
func isolateMisbehavingProcesses(ev LightClientAttackEvidence, bc Blockchain) []ValidatorAddress {

    reference := bc[ev.conflictingBlock.Header.Height].Header
    ev_header := ev.conflictingBlock.Header

    ref_commit := bc[ev.conflictingBlock.Header.Height + 1].Header.LastCommit // + 1 !!
    ev_commit := ev.conflictingBlock.Commit

    if violatesTMValidity(reference, ev_header) {
        // lunatic light client attack
        signatories := Signers(ev.ConflictingBlock.Commit)
        bonded_vals := Addresses(bc[ev.CommonHeight].NextValidators)
        return intersection(signatories,bonded_vals)

    }
    // If this point is reached the validator sets in reference and ev_header are identical
    else if RoundOf(ref_commit) == RoundOf(ev_commit) {
        // equivocation light client attack
        return intersection(Signers(ref_commit), Signers(ev_commit))
    }
    else {
        // amnesia light client attack
        return IsolateAmnesiaAttacker(ev, bc)
    }
}
```

- 实现注释
    - 如果全节点只达到高度`ev.conflictingBlock.Header.Height`，那么`bc[ev.conflictingBlock.Header.Height + 1].Header.LastCommit`指的是该高度的本地存储的提交。（根据`length(bc)`的前提条件，此提交必须存在。）
    - 我们在前提条件中检查解绑期是否已过期。然而，由于时间的推移，在将验证器交给Cosmos SDK之前，需要再次检查时间，以满足仅报告已绑定的验证器的合约要求。将验证器传递给SDK超出了本规范的范围。
- 预期前提条件
    - `length(bc) >= ev.conflictingBlock.Header.Height`
    - `ValidAndVerifiedUnbonding(bc[ev.CommonHeight], ev.ConflictingBlock) == SUCCESS`
    - `ev.ConflictingBlock.Header != bc[ev.ConflictingBlock.Header.Height]`
    - `ev.conflictingBlock`满足基本验证（特别是Commit中的所有签名消息来自同一轮）
- 预期后置条件
    - [[FN-INV-Output.1]](#FN-INV-Output1)成立
- 错误条件
    - 如果违反前提条件，则返回错误。

### 函数细节

#### **[LCAI-FUNC-VVU.1]**

```go
func ValidAndVerifiedUnbonding(trusted LightBlock, untrusted LightBlock) Result
```

- 条件与[[LCV-FUNC-VALID.2]][LCV-FUNC-VALID.link]相同，只是将前提条件“*trusted.Header.Time > now - trustingPeriod*”替换为
    - `trusted.Header.Time > now - UnbondingPeriod`

#### **[LCAI-FUNC-NONVALID.1]**

```go
func violatesTMValidity(ref Header, ev Header) boolean
```

- 实现备注
    - 通过与参考头进行比较，检查证据头`ev`是否违反了Tendermint共识的有效性属性
- 预期前提条件
    - `ref.Height == ev.Height`
- 预期后置条件
    - 返回以下析取式的评估结果  
    **[LCAI-NONVALID-OUTPUT.1]** ==  
    `ref.ValidatorsHash != ev.ValidatorsHash` 或者  
    `ref.NextValidatorsHash != ev.NextValidatorsHash` 或者  
    `ref.ConsensusHash != ev.ConsensusHash` 或者  
    `ref.AppHash != ev.AppHash` 或者  
    `ref.LastResultsHash != ev.LastResultsHash`

```go
func IsolateAmnesiaAttacker(ev LightClientAttackEvidence, bc Blockchain) []ValidatorAddress
```

- 实现备注
    - 这会触发[查询/响应协议](https://docs.google.com/document/d/11ZhMsCj3y7zIZz4udO9l25xqb0kl7gmWqNpGVRzOeyY/edit)。
- 预期后置条件
    - 根据[LCAI-INV-Output.1]返回攻击者。

```go
func RoundOf(commit Commit) []ValidatorAddress
```

- 预期前提条件
    - `commit`是格式良好的。特别是所有投票都来自同一轮`r`。
- 预期后置条件
    - 返回在commit的所有投票中编码的轮次`r`
- 错误条件
    - 如果违反了前提条件，则报告错误

```go
func Signers(commit Commit) []ValidatorAddress
```

- 预期后置条件
    - 返回`commit`中的所有验证者地址

```go
func Addresses(vals Validator[]) ValidatorAddress[]
```

- 预期后置条件
    - 返回`vals`中的所有验证者地址

# 第三部分 - 完整性

正如本文档开头所讨论的，攻击归结为根据Tendermint共识算法规则创建和签署共识消息。
主要函数`isolateMisbehavingProcesses`区分了三种错误签名的消息，即，

- 疯狂的：签署无效的区块
- 矛盾：在同一共识轮次中双重签署有效的区块
- 遗忘：在不同的共识轮次中签署冲突的区块，而没有看到足够的消息来允许这样做。

问题是是否捕捉到了所有攻击。
首先观察`isolateMisbehavingProcesses`中的第一个检查是`violatesTMValidity`。它处理了疯狂攻击。如果这个检查通过，也就是`violatesTMValidity`返回`FALSE`，这意味着[[LCAI-NONVALID-OUTPUT.1]](#LCAI-FUNC-NONVALID1])的结果为false，这意味着`ref.ValidatorsHash = ev.ValidatorsHash`。因此，在`violatesTMValidity`之后，所有涉及的验证者都是来自区块链的验证者。因此，分析具有固定成员组（验证者集合）的Tendermint共识的一个实例就足够了。此外，由于同一高度有两个不同的区块，只需要考虑两个不同的有效共识值，即二进制共识。

对于这个固定的成员组，我们使用[Tendermint Consensus in TLA+][tendermint-accountability]的TLA+规范分析了攻击。我们检查了确实只有可能导致协议违反的情况是**equivocation**和**amnesia**。Galois对基于[Ivy proofs](https://github.com/tendermint/spec/tree/master/ivy-proofs)的协议进行的独立研究得出了相同的结论。

# 参考资料

[[supervisor]] 轻客户端监督者的规范。

[[verification]] 轻客户端验证协议的规范。

[[detection]] 轻客户端攻击检测机制的规范。

[[tendermint-accountability]]: 用于检查攻击类型的TLA+规范

[tendermint-accountability]:
https://github.com/tendermint/spec/blob/master/rust-spec/tendermint-accountability/README.md

[supervisor]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/supervisor/supervisor_001_draft.md

[verification]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md

[detection]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_003_reviewed.md

[LC-DATA-EVIDENCE-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_003_reviewed.md#lc-data-evidence1

[TMBC-LC-EVIDENCE-DATA-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_003_reviewed.md#tmbc-lc-evidence-data1

[node-based-attack-characterization]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_003_reviewed.md#node-based-characterization-of-attacks

[TMBC-FM-2THIRDS-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-fm-2thirds1

[LCV-FUNC-VALID.link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-func-valid2


# Lightclient Attackers Isolation

Adversarial nodes may have the incentive to lie to a lightclient about the state of a Tendermint blockchain. An attempt to do so is called attack. Light client [verification][verification] checks incoming data by checking a so-called "commit", which is a forwarded set of signed messages that is (supposedly) produced during executing Tendermint consensus. Thus, an attack boils down to creating and signing Tendermint consensus messages in deviation from the Tendermint consensus algorithm rules.

As Tendermint consensus and light client verification is safe under the assumption of more than 2/3 of correct voting power per block [[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link], this implies that if there was an attack then [[TMBC-FM-2THIRDS]][TMBC-FM-2THIRDS-link] was violated, that is, there is a block such that

- validators deviated from the protocol, and
- these validators represent more than 1/3 of the voting power in that block.

In the case of an [attack][node-based-attack-characterization], the lightclient [attack detection mechanism][detection] computes data, so called evidence [[LC-DATA-EVIDENCE.1]][LC-DATA-EVIDENCE-link], that can be used

- to proof that there has been attack [[TMBC-LC-EVIDENCE-DATA.1]][TMBC-LC-EVIDENCE-DATA-link] and
- as basis to find the actual nodes that deviated from the Tendermint protocol.

This specification considers how a full node in a Tendermint blockchain can isolate a set of attackers that launched the attack. The set should satisfy

- the set does not contain a correct validator
- the set contains validators that represent more than 1/3 of the voting power of a block that is still within the unbonding period

# Outline

After providing the [problem statement](#Part-I---Basics-and-Definition-of-the-Problem), we specify the [isolator function](#Part-II---Protocol) and close with the discussion about its [correctness](#Part-III---Completeness) which is based on computer-aided analysis of Tendermint Consensus.

# Part I - Basics and Definition of the Problem

For definitions of data structures used here, in particular LightBlocks [[LCV-DATA-LIGHTBLOCK.1]](https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-data-lightblock1), we refer to the specification of [Light Client Verification][verification].

The specification of the [detection mechanism][detection] describes

- what is a light client attack,
- conditions under which the detector will detect a light client attack,
- and the format of the output data, called evidence, in the case an attack is detected. The format is defined in
[[LC-DATA-EVIDENCE.1]][LC-DATA-EVIDENCE-link] and looks as follows

```go
type LightClientAttackEvidence struct {
    ConflictingBlock   LightBlock
    CommonHeight       int64
}
```

The isolator is a function that gets as input evidence `ev`
and a prefix of the blockchain `bc` at least up to height `ev.ConflictingBlock.Header.Height + 1`. The output is a set of *peerIDs* of validators.

We assume that the full node is synchronized with the blockchain and has reached the height `ev.ConflictingBlock.Header.Height + 1`.

#### **[LCAI-INV-Output.1]**

When an output is generated it satisfies the following properties:

- If
    - `bc[CommonHeight].bfttime` is within the unbonding period w.r.t. the time at the full node,
    - `ev.ConflictingBlock.Header != bc[ev.ConflictingBlock.Header.Height]`
    - Validators in `ev.ConflictingBlock.Commit` represent more than 1/3 of the voting power in `bc[ev.CommonHeight].NextValidators`
- Then: The output is a set of validators in `bc[CommonHeight].NextValidators` that
    - represent more than 1/3 of the voting power in `bc[ev.commonHeight].NextValidators`
    - signed Tendermint consensus messages for height `ev.ConflictingBlock.Header.Height` by violating the Tendermint consensus protocol.
- Else: the empty set.

# Part II - Protocol

Here we discuss how to solve the problem of isolating misbehaving processes. We describe the function `isolateMisbehavingProcesses` as well as all the helping functions below. In [Part III](#part-III---Completeness), we discuss why the solution is complete based on result from analysis with automated tools.

## Isolation

### Outline

We first check whether the conflicting block can indeed be verified from the common height. We then first check whether it was a lunatic attack (violating validity). If this is not the case, we check for equivocation. If this also is not the case, we start the on-chain [accountability protocol](https://docs.google.com/document/d/11ZhMsCj3y7zIZz4udO9l25xqb0kl7gmWqNpGVRzOeyY/edit).

#### **[LCAI-FUNC-MAIN.1]**

```go
func isolateMisbehavingProcesses(ev LightClientAttackEvidence, bc Blockchain) []ValidatorAddress {

    reference := bc[ev.conflictingBlock.Header.Height].Header
    ev_header := ev.conflictingBlock.Header

    ref_commit := bc[ev.conflictingBlock.Header.Height + 1].Header.LastCommit // + 1 !!
    ev_commit := ev.conflictingBlock.Commit

    if violatesTMValidity(reference, ev_header) {
        // lunatic light client attack
        signatories := Signers(ev.ConflictingBlock.Commit)
        bonded_vals := Addresses(bc[ev.CommonHeight].NextValidators)
        return intersection(signatories,bonded_vals)

    }
    // If this point is reached the validator sets in reference and ev_header are identical
    else if RoundOf(ref_commit) == RoundOf(ev_commit) {
        // equivocation light client attack
        return intersection(Signers(ref_commit), Signers(ev_commit))
    }
    else {
        // amnesia light client attack
        return IsolateAmnesiaAttacker(ev, bc)
    }
}
```

- Implementation comment
    - If the full node has only reached height `ev.conflictingBlock.Header.Height` then `bc[ev.conflictingBlock.Header.Height + 1].Header.LastCommit` refers to the locally stored commit for this height. (This commit must be present by the precondition on `length(bc)`.)
    - We check in the precondition that the unbonding period is not expired. However, since time moves on, before handing the validators over Cosmos SDK, the time needs to be checked again to satisfy the contract which requires that only bonded validators are reported. This passing of validators to the SDK is out of scope of this specification.
- Expected precondition
    - `length(bc) >= ev.conflictingBlock.Header.Height`
    - `ValidAndVerifiedUnbonding(bc[ev.CommonHeight], ev.ConflictingBlock) == SUCCESS`
    - `ev.ConflictingBlock.Header != bc[ev.ConflictingBlock.Header.Height]`
    - `ev.conflictingBlock` satisfies basic validation (in particular all signed messages in the Commit are from the same round)
- Expected postcondition
    - [[FN-INV-Output.1]](#FN-INV-Output1) holds
- Error condition
    - returns an error if precondition is violated.

### Details of the Functions

#### **[LCAI-FUNC-VVU.1]**

```go
func ValidAndVerifiedUnbonding(trusted LightBlock, untrusted LightBlock) Result
```

- Conditions are identical to [[LCV-FUNC-VALID.2]][LCV-FUNC-VALID.link] except the precondition "*trusted.Header.Time > now - trustingPeriod*" is substituted with
    - `trusted.Header.Time > now - UnbondingPeriod`

#### **[LCAI-FUNC-NONVALID.1]**

```go
func violatesTMValidity(ref Header, ev Header) boolean
```

- Implementation remarks
    - checks whether the evidence header `ev` violates the validity property of Tendermint Consensus, by checking against a reference header
- Expected precondition
    - `ref.Height == ev.Height`
- Expected postcondition
    - returns evaluation of the following disjunction  
    **[LCAI-NONVALID-OUTPUT.1]** ==  
    `ref.ValidatorsHash != ev.ValidatorsHash` or  
    `ref.NextValidatorsHash != ev.NextValidatorsHash` or  
    `ref.ConsensusHash != ev.ConsensusHash` or  
    `ref.AppHash != ev.AppHash` or  
    `ref.LastResultsHash != ev.LastResultsHash`

```go
func IsolateAmnesiaAttacker(ev LightClientAttackEvidence, bc Blockchain) []ValidatorAddress
```

- Implementation remarks
    - This triggers the [query/response protocol](https://docs.google.com/document/d/11ZhMsCj3y7zIZz4udO9l25xqb0kl7gmWqNpGVRzOeyY/edit).
- Expected postcondition
    - returns attackers according to [LCAI-INV-Output.1].

```go
func RoundOf(commit Commit) []ValidatorAddress
```

- Expected precondition
    - `commit` is well-formed. In particular all votes are from the same round `r`.
- Expected postcondition
    - returns round `r` that is encoded in all the votes of the commit
- Error condition
    - reports error if precondition is violated

```go
func Signers(commit Commit) []ValidatorAddress
```

- Expected postcondition
    - returns all validator addresses in `commit`

```go
func Addresses(vals Validator[]) ValidatorAddress[]
```

- Expected postcondition
    - returns all validator addresses in `vals`

# Part III - Completeness

As discussed in the beginning of this document, an attack boils down to creating and signing Tendermint consensus messages in deviation from the Tendermint consensus algorithm rules.
The main function `isolateMisbehavingProcesses` distinguishes three kinds of wrongly signed messages, namely,

- lunatic: signing invalid blocks
- equivocation: double-signing valid blocks in the same consensus round
- amnesia: signing conflicting blocks in different consensus rounds, without having seen a quorum of messages that would have allowed to do so.

The question is whether this captures all attacks.
First observe that the first check in `isolateMisbehavingProcesses` is `violatesTMValidity`. It takes care of lunatic attacks. If this check passes, that is, if `violatesTMValidity` returns `FALSE` this means that [[LCAI-NONVALID-OUTPUT.1]](#LCAI-FUNC-NONVALID1]) evaluates to false, which implies that `ref.ValidatorsHash = ev.ValidatorsHash`. Hence, after `violatesTMValidity`, all the involved validators are the ones from the blockchain. It is thus sufficient to analyze one instance of Tendermint consensus with a fixed group membership (set of validators). Also, as we have two different blocks for the same height, it is sufficient to consider two different valid consensus values, that is, binary consensus.

For this fixed group membership, we have analyzed the attacks using the TLA+ specification of [Tendermint Consensus in TLA+][tendermint-accountability]. We checked that indeed the only possible scenarios that can lead to violation of agreement are **equivocation** and **amnesia**. An independent study by Galois of the protocol based on [Ivy proofs](https://github.com/tendermint/spec/tree/master/ivy-proofs) led to the same conclusion.

# References

[[supervisor]] The specification of the light client supervisor.

[[verification]] The specification of the light client verification protocol.

[[detection]] The specification of the light client attack detection mechanism.

[[tendermint-accountability]]: TLA+ specification to check the types of attacks

[tendermint-accountability]:
https://github.com/tendermint/spec/blob/master/rust-spec/tendermint-accountability/README.md

[supervisor]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/supervisor/supervisor_001_draft.md

[verification]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md

[detection]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_003_reviewed.md

[LC-DATA-EVIDENCE-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_003_reviewed.md#lc-data-evidence1

[TMBC-LC-EVIDENCE-DATA-link]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_003_reviewed.md#tmbc-lc-evidence-data1

[node-based-attack-characterization]:
https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/detection/detection_003_reviewed.md#node-based-characterization-of-attacks

[TMBC-FM-2THIRDS-link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#tmbc-fm-2thirds1

[LCV-FUNC-VALID.link]: https://github.com/tendermint/spec/blob/master/rust-spec/lightclient/verification/verification_002_draft.md#lcv-func-valid2
