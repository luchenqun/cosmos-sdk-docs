---
order: 1
parent:
  title: 验证
  order: 2
---
# 核心验证

## 问题陈述

我们假设轻客户端已经知道一个它信任的（基础）头部 `inithead`（通过社会共识或者因为轻客户端在之前决定信任该头部）。目标是根据 `inithead` 中的数据来检查是否可以信任另一个头部 `newhead`。

协议的正确性基于一个假设，即 `inithead` 是由 Tendermint 共识的一个实例生成的。

### 失败模型

为了下面的定义，我们假设存在一个函数 `validators`，它返回给定哈希的相应验证器集合。

轻客户端协议是根据以下的失败模型定义的：

给定一个已知的上限 `TRUSTED_PERIOD`，以及一个在时间 `Time`（即 `h.Time = Time`）生成的块 `b` 和其头部 `h`，在 `validators(b.Header.NextValidatorsHash)` 中拥有超过 2/3 的投票权的验证器集合在时间 `b.Header.Time + TRUSTED_PERIOD` 之前是正确的。

*假设*："正确" 是相对于实时的（某个牛顿式的全局时间概念，即墙上时间），而 `Header.Time` 对应于 [BFT 时间](../consensus/bft-time.md)。在本文中，我们假设正确的进程的时钟是同步的（例如使用 NTP），因此本地时钟和 BFT 时间之间存在有界的时钟漂移（`CLOCK_DRIFT`）。更准确地说，对于每个正确的轻客户端进程和每个 `header.Time`（即由 Tendermint 共识正确生成的头部的 BFT 时间），以下不等式成立：`Header.Time < now + CLOCK_DRIFT`，其中 `now` 对应于轻客户端进程的系统时钟。

此外，我们假设 `TRUSTED_PERIOD` 的数量级比 `CLOCK_DRIFT` 大（`TRUSTED_PERIOD >> CLOCK_DRIFT`），因为 `CLOCK_DRIFT`（使用 NTP）的数量级是毫秒级，而 `TRUSTED_PERIOD` 的数量级是周级。

我们期望本文中定义的轻客户端进程在某个更大的时间段内被用于检测和惩罚行为不端的验证器（我们通常将其称为 `UNBONDING_PERIOD`，因为现代权益证明系统中存在 "bonding" 机制）。此外，我们假设 `TRUSTED_PERIOD < UNBONDING_PERIOD`，并且它们通常具有相同的数量级，例如 `TRUSTED_PERIOD = UNBONDING_PERIOD / 2`。

这份文档中的规范考虑了在上述故障模型下实现轻客户端的情况。
像“分叉问责”和“证据提交”这样的机制是在“解绑期”上下文中定义的，并且它们激励验证人遵循本文档中定义的协议规范。如果他们不这样做，并且我们有1/3（或更多）的错误验证人，可能会违反安全性。因此，我们的方法是在事后“检测”这些情况，并采取适当的修复措施（自动和社交）。这在[Fork accountability](./accountability.md)文档中有所讨论。

上述的“可信任”一词表示协议的正确性取决于这个假设。运行轻客户端的用户有责任确保信任被破坏/伪造的`inithead`的风险是可以忽略的。

*备注*：这个故障模型可能在未来改变为考虑高度的混合版本。

### 高层解决方案

在初始化时，轻客户端会得到一个它信任的头部`inithead`（通过社会共识）。当轻客户端看到一个新的已签名头部`snh`时，它必须决定是否信任这个新的头部。可以通过以下三种方法（可能的组合）来获得信任。

1. **连续的头部序列。**给定一个受信任的头部`h`和一个不受信任的头部`h1`，如果轻客户端信任`h`和`h1`之间的所有头部，则它信任头部`h1`。

2. **可信任期间。**给定一个受信任的头部`h`，一个不受信任的头部`h1 > h`和在此期间（`TRUSTED_PERIOD`）内故障模型成立，我们可以检查是否有至少一个验证人，从`h.Time`一直到现在一直正确，已经签署了`h1`。如果是这样，我们可以信任`h1`。

3. **二分法。**如果根据第2点（可信任期间）的检查失败，轻客户端可以尝试获得一个高度位于`h`和`h1`之间的头部`hp`，以检查是否可以使用`h`来获得对`hp`的信任，并且可以使用`hp`来获得对`snh`的信任。如果是这样，我们可以信任`h1`；如果不是，我们将继续递归，直到找到一组可以建立（传递性）信任关系的头部，或者我们失败，因为两个连续的头部不能相互验证。

## 定义

### 数据结构

以下仅提供了本规范所需的数据结构的详细信息。


 ```go
   type Header struct {
        Height               int64
        Time                 Time          // the chain time when the header (block) was generated

        LastBlockID          BlockID       // prev block info
        ValidatorsHash       []byte        // hash of the validators for the current block
        NextValidatorsHash   []byte        // hash of the validators for the next block
   }

   type SignedHeader struct {
        Header        Header
        Commit        Commit            // commit for the given header
   }

   type ValidatorSet struct {
        Validators         []Validator
        TotalVotingPower   int64
   }

   type Validator struct {
        Address       Address           // validator address (we assume validator's addresses are unique)
        VotingPower   int64             // validator's voting power
   }

   type TrustedState {
        SignedHeader   SignedHeader
        ValidatorSet   ValidatorSet
   }
 ```

### Functions

For the purpose of this light client specification, we assume that the Tendermint Full Node
exposes the following functions over Tendermint RPC:

```go
    // returns signed header: Header with Commit, for the given height
    func Commit(height int64) (SignedHeader, error)

    // returns validator set for the given height
    func Validators(height int64) (ValidatorSet, error)
```

Furthermore, we assume the following auxiliary functions:

```go
    // returns true if the commit is for the header, ie. if it contains
    // the correct hash of the header; otherwise false
    func matchingCommit(header Header, commit Commit) bool

    // returns the set of validators from the given validator set that
    // committed the block (that correctly signed the block)
    // it assumes signature verification so it can be computationally expensive
    func signers(commit Commit, validatorSet ValidatorSet) []Validator

    // returns the voting power the validators in v1 have according to their voting power in set v2
    // it does not assume signature verification
    func votingPowerIn(v1 []Validator, v2 ValidatorSet) int64

    // returns hash of the given validator set
    func hash(v2 ValidatorSet) []byte
```

In the functions below we will be using `trustThreshold` as a parameter. For simplicity
we assume that `trustThreshold` is a float between `1/3` and `2/3` and we will not be checking it
in the pseudo-code.

**VerifySingle.** The function `VerifySingle` attempts to validate given untrusted header and the corresponding validator sets
based on a given trusted state. It ensures that the trusted state is still within its trusted period,
and that the untrusted header is within assumed `clockDrift` bound of the passed time `now`.
Note that this function is not making external (RPC) calls to the full node; the whole logic is
based on the local (given) state. This function is supposed to be used by the IBC handlers.

```go
func VerifySingle(untrustedSh SignedHeader,
                  untrustedVs ValidatorSet,
                  untrustedNextVs ValidatorSet,
                  trustedState TrustedState,
                  trustThreshold float,
                  trustingPeriod Duration,
                  clockDrift Duration,
                  now Time) (TrustedState, error) {

    if untrustedSh.Header.Time > now + clockDrift {
        return (trustedState, ErrInvalidHeaderTime)
    }

    trustedHeader = trustedState.SignedHeader.Header
    if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
        return (state, ErrHeaderNotWithinTrustedPeriod)
    }

    // we assume that time it takes to execute verifySingle function
    // is several order of magnitudes smaller than trustingPeriod
    error = verifySingle(
                trustedState,
                untrustedSh,
                untrustedVs,
                untrustedNextVs,
                trustThreshold)

    if error != nil return (state, error)

    // the untrusted header is now trusted
    newTrustedState = TrustedState(untrustedSh, untrustedNextVs)
    return (newTrustedState, nil)
}

// return true if header is within its light client trusted period; otherwise returns false
func isWithinTrustedPeriod(header Header,
                           trustingPeriod Duration,
                           now Time) bool {

    return header.Time + trustedPeriod > now
}
```

Note that in case `VerifySingle` returns without an error (untrusted header
is successfully verified) then we have a guarantee that the transition of the trust
from `trustedState` to `newTrustedState` happened during the trusted period of
`trustedState.SignedHeader.Header`.

TODO: Explain what happens in case `VerifySingle` returns with an error.

**verifySingle.** The function `verifySingle` verifies a single untrusted header
against a given trusted state. It includes all validations and signature verification.
It is not publicly exposed since it does not check for header expiry (time constraints)
and hence it's possible to use it incorrectly.

```go
func verifySingle(trustedState TrustedState,
                  untrustedSh SignedHeader,
                  untrustedVs ValidatorSet,
                  untrustedNextVs ValidatorSet,
                  trustThreshold float) error {

    untrustedHeader = untrustedSh.Header
    untrustedCommit = untrustedSh.Commit

    trustedHeader = trustedState.SignedHeader.Header
    trustedVs = trustedState.ValidatorSet

    if trustedHeader.Height >= untrustedHeader.Height return ErrNonIncreasingHeight
    if trustedHeader.Time >= untrustedHeader.Time return ErrNonIncreasingTime

    // validate the untrusted header against its commit, vals, and next_vals
    error = validateSignedHeaderAndVals(untrustedSh, untrustedVs, untrustedNextVs)
    if error != nil return error

    // check for adjacent headers
    if untrustedHeader.Height == trustedHeader.Height + 1 {
        if trustedHeader.NextValidatorsHash != untrustedHeader.ValidatorsHash {
            return ErrInvalidAdjacentHeaders
        }
    } else {
        error = verifyCommitTrusting(trustedVs, untrustedCommit, untrustedVs, trustThreshold)
        if error != nil return error
    }

    // verify the untrusted commit
    return verifyCommitFull(untrustedVs, untrustedCommit)
}

// returns nil if header and validator sets are consistent; otherwise returns error
func validateSignedHeaderAndVals(signedHeader SignedHeader, vs ValidatorSet, nextVs ValidatorSet) error {
    header = signedHeader.Header
    if hash(vs) != header.ValidatorsHash return ErrInvalidValidatorSet
    if hash(nextVs) != header.NextValidatorsHash return ErrInvalidNextValidatorSet
    if !matchingCommit(header, signedHeader.Commit) return ErrInvalidCommitValue
    return nil
}

// returns nil if at least single correst signer signed the commit; otherwise returns error
func verifyCommitTrusting(trustedVs ValidatorSet,
                          commit Commit,
                          untrustedVs ValidatorSet,
                          trustLevel float) error {

    totalPower := trustedVs.TotalVotingPower
    signedPower := votingPowerIn(signers(commit, untrustedVs), trustedVs)

    // check that the signers account for more than max(1/3, trustLevel) of the voting power
    // this ensures that there is at least single correct validator in the set of signers
    if signedPower < max(1/3, trustLevel) * totalPower return ErrInsufficientVotingPower
    return nil
}

// returns nil if commit is signed by more than 2/3 of voting power of the given validator set
// return error otherwise
func verifyCommitFull(vs ValidatorSet, commit Commit) error {
    totalPower := vs.TotalVotingPower;
    signedPower := votingPowerIn(signers(commit, vs), vs)

    // check the signers account for +2/3 of the voting power
    if signedPower * 3 <= totalPower * 2 return ErrInvalidCommit
    return nil
}
```

**VerifyHeaderAtHeight.** The function `VerifyHeaderAtHeight` captures high level
logic, i.e., application call to the light client module to download and verify header
for some height.

```go
func VerifyHeaderAtHeight(untrustedHeight int64,
                          trustedState TrustedState,
                          trustThreshold float,
                          trustingPeriod Duration,
                          clockDrift Duration) (TrustedState, error)) {

    trustedHeader := trustedState.SignedHeader.Header

    now := System.Time()
    if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
        return (trustedState, ErrHeaderNotWithinTrustedPeriod)
    }

    newTrustedState, err := VerifyBisection(untrustedHeight,
                                            trustedState,
                                            trustThreshold,
                                            trustingPeriod,
                                            clockDrift,
                                            now)

    if err != nil return (trustedState, err)

    now = System.Time()
    if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
        return (trustedState, ErrHeaderNotWithinTrustedPeriod)
    }

    return (newTrustedState, err)
}
```

Note that in case `VerifyHeaderAtHeight` returns without an error (untrusted header
is successfully verified) then we have a guarantee that the transition of the trust
from `trustedState` to `newTrustedState` happened during the trusted period of
`trustedState.SignedHeader.Header`.

In case `VerifyHeaderAtHeight` returns with an error, then either (i) the full node we are talking to is faulty
or (ii) the trusted header has expired (it is outside its trusted period). In case (i) the full node is faulty so
light client should disconnect and reinitialise with new peer. In the case (ii) as the trusted header has expired,
we need to reinitialise light client with a new trusted header (that is within its trusted period),
but we don't necessarily need to disconnect from the full node we are talking to (as we haven't observed full node misbehavior in this case).

**VerifyBisection.** The function `VerifyBisection` implements
recursive logic for checking if it is possible building trust
relationship between `trustedState` and untrusted header at the given height over
finite set of (downloaded and verified) headers.

```go
func VerifyBisection(untrustedHeight int64,
                     trustedState TrustedState,
                     trustThreshold float,
                     trustingPeriod Duration,
                     clockDrift Duration,
                     now Time) (TrustedState, error) {

    untrustedSh, error := Commit(untrustedHeight)
    if error != nil return (trustedState, ErrRequestFailed)

    untrustedHeader = untrustedSh.Header

    // note that we pass now during the recursive calls. This is fine as
    // all other untrusted headers we download during recursion will be
    // for a smaller heights, and therefore should happen before.
    if untrustedHeader.Time > now + clockDrift {
        return (trustedState, ErrInvalidHeaderTime)
    }

    untrustedVs, error := Validators(untrustedHeight)
    if error != nil return (trustedState, ErrRequestFailed)

    untrustedNextVs, error := Validators(untrustedHeight + 1)
    if error != nil return (trustedState, ErrRequestFailed)

    error = verifySingle(
             trustedState,
             untrustedSh,
             untrustedVs,
             untrustedNextVs,
             trustThreshold)

    if fatalError(error) return (trustedState, error)

    if error == nil {
        // the untrusted header is now trusted.
        newTrustedState = TrustedState(untrustedSh, untrustedNextVs)
        return (newTrustedState, nil)
    }

    // at this point in time we need to do bisection
    pivotHeight := ceil((trustedHeader.Height + untrustedHeight) / 2)

    error, newTrustedState = VerifyBisection(pivotHeight,
                                             trustedState,
                                             trustThreshold,
                                             trustingPeriod,
                                             clockDrift,
                                             now)
    if error != nil return (newTrustedState, error)

    return VerifyBisection(untrustedHeight,
                           newTrustedState,
                           trustThreshold,
                           trustingPeriod,
                           clockDrift,
                           now)
}

func fatalError(err) bool {
    return err == ErrHeaderNotWithinTrustedPeriod OR
           err == ErrInvalidAdjacentHeaders OR
           err == ErrNonIncreasingHeight OR
           err == ErrNonIncreasingTime OR
           err == ErrInvalidValidatorSet OR
           err == ErrInvalidNextValidatorSet OR
           err == ErrInvalidCommitValue OR
           err == ErrInvalidCommit
}
```

### The case `untrustedHeader.Height < trustedHeader.Height`

In the use case where someone tells the light client that application data that is relevant for it
can be read in the block of height `k` and the light client trusts a more recent header, we can use the
hashes to verify headers "down the chain." That is, we iterate down the heights and check the hashes in each step.

*Remark.* For the case were the light client trusts two headers `i` and `j` with `i < k < j`, we should
discuss/experiment whether the forward or the backward method is more effective.

```go
func VerifyHeaderBackwards(trustedHeader Header,
                           untrustedHeader Header,
                           trustingPeriod Duration,
                           clockDrift Duration) error {

  if untrustedHeader.Height >= trustedHeader.Height return ErrErrNonDecreasingHeight
  if untrustedHeader.Time >= trustedHeader.Time return ErrNonDecreasingTime

  now := System.Time()
  if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
    return ErrHeaderNotWithinTrustedPeriod
  }

  old := trustedHeader
  for i := trustedHeader.Height - 1; i > untrustedHeader.Height; i-- {
    untrustedSh, error := Commit(i)
    if error != nil return ErrRequestFailed

    if (hash(untrustedSh.Header) != old.LastBlockID.Hash) {
      return ErrInvalidAdjacentHeaders
    }

    old := untrustedSh.Header
  }

  if hash(untrustedHeader) != old.LastBlockID.Hash {
    return ErrInvalidAdjacentHeaders
  }

  now := System.Time()
  if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
    return ErrHeaderNotWithinTrustedPeriod
  }

  return nil
 }
```

*假设*：在接下来的内容中，我们假设*untrusted_h.Header.height > trusted_h.Header.height*。我们将在下一节快速讨论另一种情况。

我们考虑以下设置：

- 轻客户端与一个完整节点进行通信
- 轻客户端在本地存储通过基本验证的所有头部，并且这些头部在轻客户端的信任期内。在下面的伪代码中，我们使用*Store.Add(header)*表示这一操作。如果一个头部未能通过验证，则表示我们正在与有问题的完整节点进行通信，我们应该与其断开连接并重新初始化与新节点的连接。
- 如果`CanTrust`返回*error*，则表示轻客户端已经看到了一个伪造的头部，或者信任的头部已经过期（超出了其信任期）。
    - 如果是伪造的头部，那么完整节点有问题，轻客户端应该断开连接并重新初始化与新节点的连接。如果信任的头部已经过期，我们需要使用新的信任头部（在其信任期内）重新初始化轻客户端，但不一定需要断开与完整节点的连接（因为在这种情况下我们没有观察到完整节点的错误行为）。

## 轻客户端协议的正确性

### 定义

- `TRUSTED_PERIOD`：信任期
- 对于实时时间`t`，谓词`correct(v,t)`为真，如果验证者`v`遵循协议直到时间`t`（我们稍后会讨论恢复）。
- 验证者字段。我们将验证者表示为元组`(v,p)`，其中
    - `v`是标识符（即验证者地址；我们假设每个验证者集合中的标识符是唯一的）
    - `p`是其投票权重
- 对于每个头部`h`，如果轻客户端信任`h`，我们写作`trust(h) = true`。

### 失败模型

如果在时间`Time`（即`h.Time = Time`）生成了一个带有头部`h`的块`b`，那么在时间`h.Time + TRUSTED_PERIOD`之前，持有`validators(h.NextValidatorsHash)`中超过`2/3`投票权重的验证者集合是正确的。

形式化地表示为：
\[
\sum_{(v,p) \in validators(h.NextValidatorsHash) \wedge correct(v,h.Time + TRUSTED_PERIOD)} p >
2/3 \sum_{(v,p) \in validators(h.NextValidatorsHash)} p
\]

轻客户端与完整节点进行通信并学习新的区块头。目标是在本地决定是否信任一个区块头。我们的实现需要确保以下两个属性：

- *轻客户端完整性*：如果一个区块头 `h` 是由 Tendermint 共识的一个实例正确生成的（并且其年龄小于可信任期限），那么轻客户端应该最终将 `trust(h)` 设置为 `true`。

- *轻客户端准确性*：如果一个区块头 `h` *不是*由 Tendermint 共识的一个实例生成的，那么轻客户端永远不应将 `trust(h)` 设置为 `true`。

*备注*：如果在计算过程中，轻客户端确信某些区块头是由对手伪造的（即不是由 Tendermint 共识的一个实例生成的），它可以提交（部分）已见过的区块头作为不当行为的证据。

*备注*：在完整性中我们使用了 "最终" 这个词，但在实践中，`trust(h)` 应该在 `h.Time + TRUSTED_PERIOD` 之前设置为 `true`。如果没有这样做，该区块头就不能被信任，因为它太旧了。

*备注*：如果一个区块头 `h` 被标记为 `trust(h)`，但在某个时间点上它已经太旧了（即 `h.Time + TRUSTED_PERIOD < now`），那么轻客户端应该在时间 `now` 再次将 `trust(h)` 设置为 `false`。

*假设*：最初，轻客户端有一个它信任的区块头 `inithead`，也就是说，`inithead` 是由 Tendermint 共识正确生成的。

为了推理正确性，我们可以证明以下不变式。

*验证条件：轻客户端不变式*。
对于每个轻客户端 `l` 和每个区块头 `h`：
如果 `l` 已经将 `trust(h) = true`，
  那么在时间 `h.Time + TRUSTED_PERIOD` 之前正确的验证者在 `validators(h.NextValidatorsHash)` 中拥有超过三分之二的投票权。

  形式上，
  \[
  \sum_{(v,p) \in validators(h.NextValidatorsHash) \wedge correct(v,h.Time + TRUSTED_PERIOD)} p >
  2/3 \sum_{(v,p) \in validators(h.NextValidatorsHash)} p
  \]

*备注*：为了证明不变式，我们将不得不证明轻客户端只信任由 Tendermint 共识正确生成的区块头。然后上述公式可以从故障模型中得出。

## 详细信息

**观察 1.** 如果 `h.Time + TRUSTED_PERIOD > now`，我们信任验证器集合 `validators(h.NextValidatorsHash)`。

当我们说我们信任 `validators(h.NextValidatorsHash)` 时，我们并不信任 `validators(h.NextValidatorsHash)` 中的每个个体验证器是否正确，而只是相信其中不超过 `1/3` 的验证器是有问题的（更准确地说，有问题的验证器的总投票权不超过总投票权的 `1/3`）。

*`VerifySingle` 的正确性论证*

轻客户端的准确性：

- 假设反证法，`untrustedHeader` 未正确生成，但轻客户端通过 `verifySingle` 返回无误将其设置为可信。
- `trustedState` 是可信且足够新的。
- 根据故障模型，有问题的验证器持有的投票权不超过总投票权的 `1/3`，因此至少有一个正确的验证器 `v` 对 `untrustedHeader` 进行了签名。
- 由于 `v` 目前是正确的，它至少在签署 `untrustedHeader` 之前遵循了 Tendermint 共识协议，因此 `untrustedHeader` 被正确生成。
我们得到了所需的矛盾。

轻客户端的完整性：

- 如果 `trustedState` 中有足够多的验证器仍然是 `untrustedHeader.Height` 高度的验证器，并对 `untrustedHeader` 进行了签名，则检查成功。
- 如果 `untrustedHeader.Height = trustedHeader.Height + 1`，并且两个头部都正确生成，则测试通过。

*验证条件：* 我们可能需要一个 Tendermint 不变式，它说明如果 `untrustedSignedHeader.Header.Height = trustedHeader.Height + 1`，那么 `signers(untrustedSignedHeader.Commit) \subseteq validators(trustedHeader.NextValidatorsHash)`。

*备注：* 如果用户认为依赖一个正确的验证器不足够，可以使用变量 `trustThreshold`。然而，在验证器集合频繁更改的情况下，选择更高的 `trustThreshold`，`verifySingle` 对于非相邻的头部返回错误的可能性就越小。

- `VerifyBisection` 的正确性论证（概述）*

轻客户端的准确性：

- 假设反证法，从全节点获得的 `untrustedHeight` 处的头部未正确生成，但轻客户端通过 `VerifyBisection` 返回无误将其设置为可信。
- `VerifyBisection` 仅在递归中的所有对 `verifySingle` 的调用都返回无误（返回 `nil`）时才会返回无误。
- 因此，我们有一系列满足 `verifySingle` 的头部。
- 再次矛盾。

轻客户端的完整性：

只有在`Commit(pivot)`时，轻客户端始终能够获得正确生成的头部，才能确保完整性。

*停滞*

通过`VerifyBisection`，一个有问题的全节点可以通过创建一个长序列的头部来使轻客户端停滞，轻客户端会逐个查询这些头部并且看起来都没问题，直到最终轻客户端检测到问题。有几种方法可以解决这个问题：

- 每次调用`Commit`时，可以选择不同的全节点进行请求。
- 轻客户端不再逐个查询头部，而是告诉一个全节点它信任的头部以及所需的头部高度。全节点会回复包含中间头部的证明，轻客户端可以用来进行验证。大致上，`VerifyBisection`将在全节点上执行。
- 我们可以设置`VerifyBisection`的超时时间。


---
order: 1
parent:
  title: Verification
  order: 2
---
# Core Verification

## Problem statement

We assume that the light client knows a (base) header `inithead` it trusts (by social consensus or because
the light client has decided to trust the header before). The goal is to check whether another header
`newhead` can be trusted based on the data in `inithead`.

The correctness of the protocol is based on the assumption that `inithead` was generated by an instance of
Tendermint consensus.

### Failure Model

For the purpose of the following definitions we assume that there exists a function
`validators` that returns the corresponding validator set for the given hash.

The light client protocol is defined with respect to the following failure model:

Given a known bound `TRUSTED_PERIOD`, and a block `b` with header `h` generated at time `Time`
(i.e. `h.Time = Time`), a set of validators that hold more than 2/3 of the voting power
in `validators(b.Header.NextValidatorsHash)` is correct until time `b.Header.Time + TRUSTED_PERIOD`.

*Assumption*: "correct" is defined w.r.t. realtime (some Newtonian global notion of time, i.e., wall time),
while `Header.Time` corresponds to the [BFT time](../consensus/bft-time.md). In this note, we assume that clocks of correct processes
are synchronized (for example using NTP), and therefore there is bounded clock drift (`CLOCK_DRIFT`) between local clocks and
BFT time. More precisely, for every correct light client process and every `header.Time` (i.e. BFT Time, for a header correctly
generated by the Tendermint consensus), the following inequality holds: `Header.Time < now + CLOCK_DRIFT`,
where `now` corresponds to the system clock at the light client process.

Furthermore, we assume that `TRUSTED_PERIOD` is (several) order of magnitude bigger than `CLOCK_DRIFT` (`TRUSTED_PERIOD >> CLOCK_DRIFT`),
as `CLOCK_DRIFT` (using NTP) is in the order of milliseconds and `TRUSTED_PERIOD` is in the order of weeks.

We expect a light client process defined in this document to be used in the context in which there is some
larger period during which misbehaving validators can be detected and punished (we normally refer to it as `UNBONDING_PERIOD`
due to the "bonding" mechanism in modern proof of stake systems). Furthermore, we assume that
`TRUSTED_PERIOD < UNBONDING_PERIOD` and that they are normally of the same order of magnitude, for example
`TRUSTED_PERIOD = UNBONDING_PERIOD / 2`.

The specification in this document considers an implementation of the light client under the Failure Model defined above.
Mechanisms like `fork accountability` and `evidence submission` are defined in the context of `UNBONDING_PERIOD` and
they incentivize validators to follow the protocol specification defined in this document. If they don't,
and we have 1/3 (or more) faulty validators, safety may be violated. Our approach then is
to *detect* these cases (after the fact), and take suitable repair actions (automatic and social).
This is discussed in document on [Fork accountability](./accountability.md).

The term "trusted" above indicates that the correctness of the protocol depends on
this assumption. It is in the responsibility of the user that runs the light client to make sure that the risk
of trusting a corrupted/forged `inithead` is negligible.

*Remark*: This failure model might change to a hybrid version that takes heights into account in the future.

### High Level Solution

Upon initialization, the light client is given a header `inithead` it trusts (by
social consensus). When a light clients sees a new signed header `snh`, it has to decide whether to trust the new
header. Trust can be obtained by (possibly) the combination of three methods.

1. **Uninterrupted sequence of headers.** Given a trusted header `h` and an untrusted header `h1`,
the light client trusts a header `h1` if it trusts all headers in between `h` and `h1`.

2. **Trusted period.** Given a trusted header `h`, an untrusted header `h1 > h` and `TRUSTED_PERIOD` during which
the failure model holds, we can check whether at least one validator, that has been continuously correct
from `h.Time` until now, has signed `h1`. If this is the case, we can trust `h1`.

3. **Bisection.** If a check according to 2. (trusted period) fails, the light client can try to
obtain a header `hp` whose height lies between `h` and `h1` in order to check whether `h` can be used to
get trust for `hp`, and `hp` can be used to get trust for `snh`. If this is the case we can trust `h1`;
if not, we continue recursively until either we found set of headers that can build (transitively) trust relation
between `h` and `h1`, or we failed as two consecutive headers don't verify against each other.

## Definitions

### Data structures

In the following, only the details of the data structures needed for this specification are given.

 ```go
   type Header struct {
        Height               int64
        Time                 Time          // the chain time when the header (block) was generated

        LastBlockID          BlockID       // prev block info
        ValidatorsHash       []byte        // hash of the validators for the current block
        NextValidatorsHash   []byte        // hash of the validators for the next block
   }

   type SignedHeader struct {
        Header        Header
        Commit        Commit            // commit for the given header
   }

   type ValidatorSet struct {
        Validators         []Validator
        TotalVotingPower   int64
   }

   type Validator struct {
        Address       Address           // validator address (we assume validator's addresses are unique)
        VotingPower   int64             // validator's voting power
   }

   type TrustedState {
        SignedHeader   SignedHeader
        ValidatorSet   ValidatorSet
   }
 ```

### Functions

For the purpose of this light client specification, we assume that the Tendermint Full Node
exposes the following functions over Tendermint RPC:

```go
    // returns signed header: Header with Commit, for the given height
    func Commit(height int64) (SignedHeader, error)

    // returns validator set for the given height
    func Validators(height int64) (ValidatorSet, error)
```

Furthermore, we assume the following auxiliary functions:

```go
    // returns true if the commit is for the header, ie. if it contains
    // the correct hash of the header; otherwise false
    func matchingCommit(header Header, commit Commit) bool

    // returns the set of validators from the given validator set that
    // committed the block (that correctly signed the block)
    // it assumes signature verification so it can be computationally expensive
    func signers(commit Commit, validatorSet ValidatorSet) []Validator

    // returns the voting power the validators in v1 have according to their voting power in set v2
    // it does not assume signature verification
    func votingPowerIn(v1 []Validator, v2 ValidatorSet) int64

    // returns hash of the given validator set
    func hash(v2 ValidatorSet) []byte
```

In the functions below we will be using `trustThreshold` as a parameter. For simplicity
we assume that `trustThreshold` is a float between `1/3` and `2/3` and we will not be checking it
in the pseudo-code.

**VerifySingle.** The function `VerifySingle` attempts to validate given untrusted header and the corresponding validator sets
based on a given trusted state. It ensures that the trusted state is still within its trusted period,
and that the untrusted header is within assumed `clockDrift` bound of the passed time `now`.
Note that this function is not making external (RPC) calls to the full node; the whole logic is
based on the local (given) state. This function is supposed to be used by the IBC handlers.

```go
func VerifySingle(untrustedSh SignedHeader,
                  untrustedVs ValidatorSet,
                  untrustedNextVs ValidatorSet,
                  trustedState TrustedState,
                  trustThreshold float,
                  trustingPeriod Duration,
                  clockDrift Duration,
                  now Time) (TrustedState, error) {

    if untrustedSh.Header.Time > now + clockDrift {
        return (trustedState, ErrInvalidHeaderTime)
    }

    trustedHeader = trustedState.SignedHeader.Header
    if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
        return (state, ErrHeaderNotWithinTrustedPeriod)
    }

    // we assume that time it takes to execute verifySingle function
    // is several order of magnitudes smaller than trustingPeriod
    error = verifySingle(
                trustedState,
                untrustedSh,
                untrustedVs,
                untrustedNextVs,
                trustThreshold)

    if error != nil return (state, error)

    // the untrusted header is now trusted
    newTrustedState = TrustedState(untrustedSh, untrustedNextVs)
    return (newTrustedState, nil)
}

// return true if header is within its light client trusted period; otherwise returns false
func isWithinTrustedPeriod(header Header,
                           trustingPeriod Duration,
                           now Time) bool {

    return header.Time + trustedPeriod > now
}
```

Note that in case `VerifySingle` returns without an error (untrusted header
is successfully verified) then we have a guarantee that the transition of the trust
from `trustedState` to `newTrustedState` happened during the trusted period of
`trustedState.SignedHeader.Header`.

TODO: Explain what happens in case `VerifySingle` returns with an error.

**verifySingle.** The function `verifySingle` verifies a single untrusted header
against a given trusted state. It includes all validations and signature verification.
It is not publicly exposed since it does not check for header expiry (time constraints)
and hence it's possible to use it incorrectly.

```go
func verifySingle(trustedState TrustedState,
                  untrustedSh SignedHeader,
                  untrustedVs ValidatorSet,
                  untrustedNextVs ValidatorSet,
                  trustThreshold float) error {

    untrustedHeader = untrustedSh.Header
    untrustedCommit = untrustedSh.Commit

    trustedHeader = trustedState.SignedHeader.Header
    trustedVs = trustedState.ValidatorSet

    if trustedHeader.Height >= untrustedHeader.Height return ErrNonIncreasingHeight
    if trustedHeader.Time >= untrustedHeader.Time return ErrNonIncreasingTime

    // validate the untrusted header against its commit, vals, and next_vals
    error = validateSignedHeaderAndVals(untrustedSh, untrustedVs, untrustedNextVs)
    if error != nil return error

    // check for adjacent headers
    if untrustedHeader.Height == trustedHeader.Height + 1 {
        if trustedHeader.NextValidatorsHash != untrustedHeader.ValidatorsHash {
            return ErrInvalidAdjacentHeaders
        }
    } else {
        error = verifyCommitTrusting(trustedVs, untrustedCommit, untrustedVs, trustThreshold)
        if error != nil return error
    }

    // verify the untrusted commit
    return verifyCommitFull(untrustedVs, untrustedCommit)
}

// returns nil if header and validator sets are consistent; otherwise returns error
func validateSignedHeaderAndVals(signedHeader SignedHeader, vs ValidatorSet, nextVs ValidatorSet) error {
    header = signedHeader.Header
    if hash(vs) != header.ValidatorsHash return ErrInvalidValidatorSet
    if hash(nextVs) != header.NextValidatorsHash return ErrInvalidNextValidatorSet
    if !matchingCommit(header, signedHeader.Commit) return ErrInvalidCommitValue
    return nil
}

// returns nil if at least single correst signer signed the commit; otherwise returns error
func verifyCommitTrusting(trustedVs ValidatorSet,
                          commit Commit,
                          untrustedVs ValidatorSet,
                          trustLevel float) error {

    totalPower := trustedVs.TotalVotingPower
    signedPower := votingPowerIn(signers(commit, untrustedVs), trustedVs)

    // check that the signers account for more than max(1/3, trustLevel) of the voting power
    // this ensures that there is at least single correct validator in the set of signers
    if signedPower < max(1/3, trustLevel) * totalPower return ErrInsufficientVotingPower
    return nil
}

// returns nil if commit is signed by more than 2/3 of voting power of the given validator set
// return error otherwise
func verifyCommitFull(vs ValidatorSet, commit Commit) error {
    totalPower := vs.TotalVotingPower;
    signedPower := votingPowerIn(signers(commit, vs), vs)

    // check the signers account for +2/3 of the voting power
    if signedPower * 3 <= totalPower * 2 return ErrInvalidCommit
    return nil
}
```

**VerifyHeaderAtHeight.** The function `VerifyHeaderAtHeight` captures high level
logic, i.e., application call to the light client module to download and verify header
for some height.

```go
func VerifyHeaderAtHeight(untrustedHeight int64,
                          trustedState TrustedState,
                          trustThreshold float,
                          trustingPeriod Duration,
                          clockDrift Duration) (TrustedState, error)) {

    trustedHeader := trustedState.SignedHeader.Header

    now := System.Time()
    if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
        return (trustedState, ErrHeaderNotWithinTrustedPeriod)
    }

    newTrustedState, err := VerifyBisection(untrustedHeight,
                                            trustedState,
                                            trustThreshold,
                                            trustingPeriod,
                                            clockDrift,
                                            now)

    if err != nil return (trustedState, err)

    now = System.Time()
    if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
        return (trustedState, ErrHeaderNotWithinTrustedPeriod)
    }

    return (newTrustedState, err)
}
```

Note that in case `VerifyHeaderAtHeight` returns without an error (untrusted header
is successfully verified) then we have a guarantee that the transition of the trust
from `trustedState` to `newTrustedState` happened during the trusted period of
`trustedState.SignedHeader.Header`.

In case `VerifyHeaderAtHeight` returns with an error, then either (i) the full node we are talking to is faulty
or (ii) the trusted header has expired (it is outside its trusted period). In case (i) the full node is faulty so
light client should disconnect and reinitialise with new peer. In the case (ii) as the trusted header has expired,
we need to reinitialise light client with a new trusted header (that is within its trusted period),
but we don't necessarily need to disconnect from the full node we are talking to (as we haven't observed full node misbehavior in this case).

**VerifyBisection.** The function `VerifyBisection` implements
recursive logic for checking if it is possible building trust
relationship between `trustedState` and untrusted header at the given height over
finite set of (downloaded and verified) headers.

```go
func VerifyBisection(untrustedHeight int64,
                     trustedState TrustedState,
                     trustThreshold float,
                     trustingPeriod Duration,
                     clockDrift Duration,
                     now Time) (TrustedState, error) {

    untrustedSh, error := Commit(untrustedHeight)
    if error != nil return (trustedState, ErrRequestFailed)

    untrustedHeader = untrustedSh.Header

    // note that we pass now during the recursive calls. This is fine as
    // all other untrusted headers we download during recursion will be
    // for a smaller heights, and therefore should happen before.
    if untrustedHeader.Time > now + clockDrift {
        return (trustedState, ErrInvalidHeaderTime)
    }

    untrustedVs, error := Validators(untrustedHeight)
    if error != nil return (trustedState, ErrRequestFailed)

    untrustedNextVs, error := Validators(untrustedHeight + 1)
    if error != nil return (trustedState, ErrRequestFailed)

    error = verifySingle(
             trustedState,
             untrustedSh,
             untrustedVs,
             untrustedNextVs,
             trustThreshold)

    if fatalError(error) return (trustedState, error)

    if error == nil {
        // the untrusted header is now trusted.
        newTrustedState = TrustedState(untrustedSh, untrustedNextVs)
        return (newTrustedState, nil)
    }

    // at this point in time we need to do bisection
    pivotHeight := ceil((trustedHeader.Height + untrustedHeight) / 2)

    error, newTrustedState = VerifyBisection(pivotHeight,
                                             trustedState,
                                             trustThreshold,
                                             trustingPeriod,
                                             clockDrift,
                                             now)
    if error != nil return (newTrustedState, error)

    return VerifyBisection(untrustedHeight,
                           newTrustedState,
                           trustThreshold,
                           trustingPeriod,
                           clockDrift,
                           now)
}

func fatalError(err) bool {
    return err == ErrHeaderNotWithinTrustedPeriod OR
           err == ErrInvalidAdjacentHeaders OR
           err == ErrNonIncreasingHeight OR
           err == ErrNonIncreasingTime OR
           err == ErrInvalidValidatorSet OR
           err == ErrInvalidNextValidatorSet OR
           err == ErrInvalidCommitValue OR
           err == ErrInvalidCommit
}
```

### The case `untrustedHeader.Height < trustedHeader.Height`

In the use case where someone tells the light client that application data that is relevant for it
can be read in the block of height `k` and the light client trusts a more recent header, we can use the
hashes to verify headers "down the chain." That is, we iterate down the heights and check the hashes in each step.

*Remark.* For the case were the light client trusts two headers `i` and `j` with `i < k < j`, we should
discuss/experiment whether the forward or the backward method is more effective.

```go
func VerifyHeaderBackwards(trustedHeader Header,
                           untrustedHeader Header,
                           trustingPeriod Duration,
                           clockDrift Duration) error {

  if untrustedHeader.Height >= trustedHeader.Height return ErrErrNonDecreasingHeight
  if untrustedHeader.Time >= trustedHeader.Time return ErrNonDecreasingTime

  now := System.Time()
  if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
    return ErrHeaderNotWithinTrustedPeriod
  }

  old := trustedHeader
  for i := trustedHeader.Height - 1; i > untrustedHeader.Height; i-- {
    untrustedSh, error := Commit(i)
    if error != nil return ErrRequestFailed

    if (hash(untrustedSh.Header) != old.LastBlockID.Hash) {
      return ErrInvalidAdjacentHeaders
    }

    old := untrustedSh.Header
  }

  if hash(untrustedHeader) != old.LastBlockID.Hash {
    return ErrInvalidAdjacentHeaders
  }

  now := System.Time()
  if !isWithinTrustedPeriod(trustedHeader, trustingPeriod, now) {
    return ErrHeaderNotWithinTrustedPeriod
  }

  return nil
 }
```

*Assumption*: In the following, we assume that *untrusted_h.Header.height > trusted_h.Header.height*. We will quickly discuss the other case in the next section.

We consider the following set-up:

- the light client communicates with one full node
- the light client locally stores all the headers that has passed basic verification and that are within light client trust period. In the pseudo code below we
write *Store.Add(header)* for this. If a header failed to verify, then
the full node we are talking to is faulty and we should disconnect from it and reinitialise with new peer.
- If `CanTrust` returns *error*, then the light client has seen a forged header or the trusted header has expired (it is outside its trusted period).
    - In case of forged header, the full node is faulty so light client should disconnect and reinitialise with new peer. If the trusted header has expired,
  we need to reinitialise light client with new trusted header (that is within its trusted period), but we don't necessarily need to disconnect from the full node
  we are talking to (as we haven't observed full node misbehavior in this case).

## Correctness of the Light Client Protocols

### Definitions

- `TRUSTED_PERIOD`: trusted period
- for realtime `t`, the predicate `correct(v,t)` is true if the validator `v`
  follows the protocol until time `t` (we will see about recovery later).
- Validator fields. We will write a validator as a tuple `(v,p)` such that
    - `v` is the identifier (i.e., validator address; we assume identifiers are unique in each validator set)
    - `p` is its voting power
- For each header `h`, we write `trust(h) = true` if the light client trusts `h`.

### Failure Model

If a block `b` with a header `h` is generated at time `Time` (i.e. `h.Time = Time`), then a set of validators that
hold more than `2/3` of the voting power in `validators(h.NextValidatorsHash)` is correct until time
`h.Time + TRUSTED_PERIOD`.

Formally,
\[
\sum_{(v,p) \in validators(h.NextValidatorsHash) \wedge correct(v,h.Time + TRUSTED_PERIOD)} p >
2/3 \sum_{(v,p) \in validators(h.NextValidatorsHash)} p
\]

The light client communicates with a full node and learns new headers. The goal is to locally decide whether to trust a header. Our implementation needs to ensure the following two properties:

- *Light Client Completeness*: If a header `h` was correctly generated by an instance of Tendermint consensus (and its age is less than the trusted period),
then the light client should eventually set `trust(h)` to `true`.

- *Light Client Accuracy*: If a header `h` was *not generated* by an instance of Tendermint consensus, then the light client should never set `trust(h)` to true.

*Remark*: If in the course of the computation, the light client obtains certainty that some headers were forged by adversaries
(that is were not generated by an instance of Tendermint consensus), it may submit (a subset of) the headers it has seen as evidence of misbehavior.

*Remark*: In Completeness we use "eventually", while in practice `trust(h)` should be set to true before `h.Time + TRUSTED_PERIOD`. If not, the header
cannot be trusted because it is too old.

*Remark*: If a header `h` is marked with `trust(h)`, but it is too old at some point in time we denote with `now` (`h.Time + TRUSTED_PERIOD < now`),
then the light client should set `trust(h)` to `false` again at time `now`.

*Assumption*: Initially, the light client has a header `inithead` that it trusts, that is, `inithead` was correctly generated by the Tendermint consensus.

To reason about the correctness, we may prove the following invariant.

*Verification Condition: light Client Invariant.*
 For each light client `l` and each header `h`:
if `l` has set `trust(h) = true`,
  then validators that are correct until time `h.Time + TRUSTED_PERIOD` have more than two thirds of the voting power in `validators(h.NextValidatorsHash)`.

  Formally,
  \[
  \sum_{(v,p) \in validators(h.NextValidatorsHash) \wedge correct(v,h.Time + TRUSTED_PERIOD)} p >
  2/3 \sum_{(v,p) \in validators(h.NextValidatorsHash)} p
  \]

*Remark.* To prove the invariant, we will have to prove that the light client only trusts headers that were correctly generated by Tendermint consensus.
Then the formula above follows from the failure model.

## Details

**Observation 1.** If `h.Time + TRUSTED_PERIOD > now`, we trust the validator set `validators(h.NextValidatorsHash)`.

When we say we trust `validators(h.NextValidatorsHash)` we do `not` trust that each individual validator in `validators(h.NextValidatorsHash)`
is correct, but we only trust the fact that less than `1/3` of them are faulty (more precisely, the faulty ones have less than `1/3` of the total voting power).

*`VerifySingle` correctness arguments*

Light Client Accuracy:

- Assume by contradiction that `untrustedHeader` was not generated correctly and the light client sets trust to true because `verifySingle` returns without error.
- `trustedState` is trusted and sufficiently new
- by the Failure Model, less than `1/3` of the voting power held by faulty validators => at least one correct validator `v` has signed `untrustedHeader`.
- as `v` is correct up to now, it followed the Tendermint consensus protocol at least up to signing `untrustedHeader` => `untrustedHeader` was correctly generated.
We arrive at the required contradiction.

Light Client Completeness:

- The check is successful if sufficiently many validators of `trustedState` are still validators in the height `untrustedHeader.Height` and signed `untrustedHeader`.
- If `untrustedHeader.Height = trustedHeader.Height + 1`, and both headers were generated correctly, the test passes.

*Verification Condition:* We may need a Tendermint invariant stating that if `untrustedSignedHeader.Header.Height = trustedHeader.Height + 1` then
`signers(untrustedSignedHeader.Commit) \subseteq validators(trustedHeader.NextValidatorsHash)`.

*Remark*: The variable `trustThreshold` can be used if the user believes that relying on one correct validator is not sufficient.
However, in case of (frequent) changes in the validator set, the higher the `trustThreshold` is chosen, the more unlikely it becomes that
`verifySingle` returns with an error for non-adjacent headers.

- `VerifyBisection` correctness arguments (sketch)*

Light Client Accuracy:

- Assume by contradiction that the header at `untrustedHeight` obtained from the full node was not generated correctly and
the light client sets trust to true because `VerifyBisection` returns without an error.
- `VerifyBisection` returns without error only if all calls to `verifySingle` in the recursion return without error (return `nil`).
- Thus we have a sequence of headers that all satisfied the `verifySingle`
- again a contradiction

light Client Completeness:

This is only ensured if upon `Commit(pivot)` the light client is always provided with a correctly generated header.

*Stalling*

With `VerifyBisection`, a faulty full node could stall a light client by creating a long sequence of headers that are queried one-by-one by the light client and look OK,
before the light client eventually detects a problem. There are several ways to address this:

- Each call to `Commit` could be issued to a different full node
- Instead of querying header by header, the light client tells a full node which header it trusts, and the height of the header it needs. The full node responds with
the header along with a proof consisting of intermediate headers that the light client can use to verify. Roughly, `VerifyBisection` would then be executed at the full node.
- We may set a timeout how long `VerifyBisection` may take.
