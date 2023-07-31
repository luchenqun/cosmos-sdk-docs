# 轻客户端主管草案，供讨论使用

## 待办事项

此规范与验证规范的更新并行进行。因此，某些超链接最终必须放置到正确的文件中。

# 轻客户端顺序主管

轻客户端通过与所谓的主节点和若干所谓的见证节点进行通信，实现对区块链中的[头部](TMBC-HEADER-link)的读取操作。由于某些全节点可能存在故障，因此必须以容错的方式实现此功能。

在Tendermint区块链中，验证者集合可能会随着每个新区块的产生而发生变化。质押和解质押机制引入了一个[安全模型](TMBC-FM-2THIRDS-link)：从[头部](TMBC-HEADER-link)的时间*Time*开始，下一个新区块的验证者中有超过三分之二的验证者在*TrustedPeriod*的持续时间内是正确的。

[轻客户端验证](https://informal.systems)实现了针对此安全模型设计的容错读取操作。也就是说，如果满足模型的假设，它是安全的，并且如果与正确的主节点通信，它会取得进展。

然而，如果违反了[安全模型](TMBC-FM-2THIRDS-link)，有故障的节点（曾经是验证者）可能会对Tendermint网络和轻客户端发起攻击。这些攻击以及对区块的公理化定义在[一个包含当前在detection.md中的定义的文档中](https://informal.systems)。

如果存在轻客户端攻击（但网络没有受到成功的攻击），则可能会违反验证步骤的安全性（因为我们在其基本假设之外操作）。轻客户端还包含一种防御机制，用于防范轻客户端攻击，称为检测。

[轻客户端检测](https://informal.systems)实现了对验证步骤结果的交叉检查。如果存在轻客户端攻击，并且轻客户端连接到正确的节点，则整个轻客户端是安全的，也就是说，它不会对无效的区块进行操作。然而，在这种情况下，它无法成功读取，因为系统中存在不一致的区块。然而，在这种情况下，检测执行一种分布式计算，产生所谓的证据。证据可以用来向正确的全节点证明存在轻客户端攻击。

[轻客户端证据可追溯性](https://informal.systems) 是在完整节点上运行的协议，用于检查提交的证据是否确实证明了轻客户端攻击的存在。此外，根据证据及其对区块链的了解，完整节点计算出一组参与攻击的已绑定完整节点（在某个时间点具有超过三分之一的投票权），并通过 ABCI 报告给应用程序。

在本文档中，我们详细说明了以下内容：

- 轻客户端的初始化
- [验证](https://informal.systems) 和 [检测](https://informal.systems) 的交互

这两个协议的详细信息在它们各自的文档中进行了描述，[可追溯性](https://informal.systems) 协议也是如此。

> 另一个相关的内容是 IBC 攻击的检测和提交，以及 IBC 处理程序的攻击验证。这将需要另一个规范。

# 状态

本文档正在进行中。为了逐步开发规范，它假设了 [验证](https://informal.systems) 和 [检测](https://informal.systems) 的某些细节，这些细节在各自的当前版本中尚未指定。这些不一致性将在接下来的几个 PR 中进行解决。

# 第一部分 - Tendermint 区块链

请参阅 [验证规范](addLinksWhenDone)

# 第二部分 - 顺序问题定义

#### **[LC-SEQ-INIT-LIVE.1]**

在初始化时，轻客户端以区块链的头部或区块链的创世文件作为输入，并最终存储区块链的头部。

#### **[LC-SEQ-LIVE.1]**

轻客户端以一系列高度作为输入。对于每个输入高度 *targetHeight*，它最终存储高度为 *targetHeight* 的头部。

#### **[LC-SEQ-SAFE.1]**

轻客户端永远不会存储不在区块链中的头部。

# 第三部分 - 轻客户端作为分布式系统

## 计算模型

轻客户端仅通过 [验证](TODO) 和 [检测](TODO) 协议与远程进程进行通信。相关的假设在那里给出。

## 分布式问题陈述

### 两种活跃性

在轻客户端攻击的情况下，顺序问题陈述不能总是得到满足。轻客户端无法确定哪个块来自链上，哪个不是。因此，轻客户端只是创建证据，提交它，并终止。
为了保证活跃性属性，我们还添加了一种可能性，即在存在攻击的情况下，不仅可以添加轻区块，还可以终止。

#### **[LC-DIST-TERM.1]**

轻客户端要么永远运行，要么在攻击时终止。

### 设计选择

#### [LC-DIST-STORE.1]

轻客户端有一个名为LightStore的本地数据结构，其中包含轻区块（包含一个头部）。

> 轻存储公开了用于查询和更新的函数。它们在[这里](TODO:onceVerificationIsMerged)中指定。

**TODO:** 引用轻存储不变式[LCV-INV-LS-ROOT.2]，一旦验证合并完成。

#### **[LC-DIST-SAFE.1]**

对于*LightStore*中的每个头部，它总是由Tendermint共识的一个实例生成的。

#### **[LC-DIST-LIVE.1]**

每当轻客户端获得一个新的高度*h*作为输入时，

- 如果在高度*h*之前没有轻客户端攻击，则轻客户端最终将高度*h*的轻区块放入轻存储中，并等待另一个输入。
- 否则，即如果在高度*h*上存在轻客户端攻击，则轻客户端必须执行以下操作之一：
    - 在攻击时终止。
    - 最终将高度*h*的轻区块放入轻存储中，并等待另一个输入。

> 注意，“存在轻客户端攻击”仅意味着某个节点已生成冲突的区块。这并不一定意味着（有故障的）对等方将这样的区块发送给“我们”的轻客户端。因此，即使系统中存在攻击，我们的轻客户端仍可能继续正常运行。

### 解决顺序规范

[LC-DIST-SAFE.1]由检测器保证；特别是它遵循自[[LCD-DIST-INV-STORE.1]](TODO)和[[LCD-DIST-LIVE.1]](TODO)。

# 第四部分 - 轻客户端监督协议

我们提供了一个顺序轻客户端监督的规范。
本地代码用一个顺序函数`Sequential-Supervisor`来展示这个功能的控制流。每个轻区块首先与主区块进行验证，然后与次要区块进行交叉检查，如果一切顺利，轻区块将被添加到轻存储中（带有"trusted"属性）。用于验证目标区块但未进行交叉检查的中间轻区块将被存储为"verified"。

> 我们注意到，如果考虑了不同的并发模型来实现，轻存储的语义可能会发生变化：
> 在并发实现中，我们可能会对某个高度*h*进行验证，将轻区块添加到轻存储中，并启动并发线程来执行以下操作：
>
> - 对下一个高度*h' != h*进行验证
> - 对高度*h*进行交叉检查。如果发现攻击，我们将从轻存储中移除*h*
> - 用户可能已经开始使用*h*
>
> 因此，这种并发模型改变了轻存储的语义（用户读取的并非所有轻区块都是可信的；如果发现问题，它们可能会被移除）。是否希望这样的改变，以及性能上的收益是否值得，我们将保留以供将来版本/轻客户端协议的讨论。

## 定义

### 节点

#### **[LC-DATA-PEERS.1]:**

在初始化时，配置中提供了一组固定的全节点。最初，这个集合被分成以下几部分：

- 一个全节点作为*主节点*（单例集合），
- 一个大小固定的集合*Secondaries*（例如，3个节点），
- 一个集合*FullNodes*，它不包括*primary*和*Secondaries*节点。
- 一个节点集合*FaultyNodes*，轻客户端怀疑这些节点存在故障；最初为空集合。

#### **[LC-INV-NODES.1]:**

检测器应该维持以下不变式：

- *FullNodes \intersect Secondaries = {}*
- *FullNodes \intersect FaultyNodes = {}*
- *Secondaries \intersect FaultyNodes = {}*

以及以下过渡不变式

- *FullNodes的并集Secondaries的并集FaultyNodes的 = FullNodes的并集Secondaries的并集FaultyNodes*

#### **[LC-FUNC-REPLACE-PRIMARY.1]:**

```go
Replace_Primary(根信任块 LightBlock)
```

- 实现备注
    - 将主节点替换为辅助节点
    - 为了保持辅助节点数量的恒定，需要
        - 选择一个新的辅助节点 *nsec*，同时确保 [LC-INV-ROOT-AGREED.1]
        - 即，我们需要确保根信任块 = FetchLightBlock(nsec, 根信任块.Header.Height)
- 预期前置条件
    - *FullNodes* 非空
- 预期后置条件
    - *primary* 移动到 *FaultyNodes*
    - 从 *Secondaries* 移动一个辅助节点 *s* 到主节点
- 错误条件
    - 如果前置条件被违反

#### **[LC-FUNC-REPLACE-SECONDARY.1]:**

```go
Replace_Secondary(地址 addr, 根信任块 LightBlock)
```

- 实现备注
    - 保持 [LC-INV-ROOT-AGREED.1]，即，
    确保根信任块 = FetchLightBlock(nsec, 根信任块.Header.Height)
- 预期前置条件
    - *FullNodes* 非空
- 预期后置条件
    - 地址 addr 从 *Secondaries* 移动到 *FaultyNodes*
    - 一个地址 *nsec* 从 *FullNodes* 移动到 *Secondaries*
- 错误条件
    - 如果前置条件被违反

### 数据类型

协议的核心数据结构是 LightBlock。

#### **[LC-DATA-LIGHTBLOCK.1]**

```go
type LightBlock struct {
                Header          Header
                Commit          Commit
                Validators      ValidatorSet
                NextValidators  ValidatorSet
                Provider        PeerID
}
```

#### **[LC-DATA-LIGHTSTORE.1]**

LightBlocks 存储在一个结构中，该结构存储从初始化或从对等方接收到的所有 LightBlock。

```go
type LightStore struct {
        ...
}

```

我们使用 LightStore 提供的函数，这些函数在 [验证规范](TODO) 中定义。

### 输入

轻客户端使用 LCInitData 进行初始化。

#### **[LC-DATA-INIT.1]**

```go
type LCInitData struct {
    lightBlock     LightBlock
    genesisDoc     GenesisDoc
}
```

其中只需提供其中一个组件。`GenesisDoc` 在 [Tendermint
Types](https://github.com/tendermint/tendermint/blob/v0.34.x/types/genesis.go) 中定义。

#### **[LC-DATA-GENESIS.1]**

```go
type GenesisDoc struct {
    GenesisTime     time.Time                `json:"genesis_time"`
    ChainID         string                   `json:"chain_id"`
    InitialHeight   int64                    `json:"initial_height"`
    ConsensusParams *tmproto.ConsensusParams `json:"consensus_params,omitempty"`
    Validators      []GenesisValidator       `json:"validators,omitempty"`
    AppHash         tmbytes.HexBytes         `json:"app_hash"`
    AppState        json.RawMessage          `json:"app_state,omitempty"`
}
```

我们使用以下函数 `makeblock`，以便根据创世文件创建一个轻块，以便基于创世文件的数据使用与正常操作中使用的相同的验证函数进行验证。

#### **[LC-FUNC-MAKEBLOCK.1]**

```go
func makeblock (genesisDoc GenesisDoc) (lightBlock LightBlock))
```

- 实现备注
    - 无
- 预期前置条件
    - 无
- 预期后置条件
    - lightBlock.Header.Height =  genesisDoc.InitialHeight
    - lightBlock.Header.Time = genesisDoc.GenesisTime
    - lightBlock.Header.LastBlockID = nil
    - lightBlock.Header.LastCommit = nil
    - lightBlock.Header.Validators = genesisDoc.Validators
    - lightBlock.Header.NextValidators = genesisDoc.Validators
    - lightBlock.Header.Data = nil
    - lightBlock.Header.AppState =  genesisDoc.AppState
    - lightBlock.Header.LastResult = nil
    - lightBlock.Commit = nil
    - lightBlock.Validators = genesisDoc.Validators
    - lightBlock.NextValidators = genesisDoc.Validators
    - lightBlock.Provider = nil
- 错误条件
    - 无

----

### 配置参数

#### **[LC-INV-ROOT-AGREED.1]**

在Sequential-Supervisor中，主节点和所有辅助节点始终对lightStore.Latest()达成一致。

### 假设

我们必须假设初始化数据（lightblock或genesis文件）与区块链一致。这是主观的初始化，无法在本地进行检查。

### 不变量

#### **[LC-INV-PEERLIST.1]:**

对等节点列表包含一个主节点和一个辅助节点。

> 如果不变量被违反，轻客户端没有足够的对等节点从中下载头部。因此，如果违反了此不变量，轻客户端需要终止。

## 主管

### 概述

主管实现了轻客户端的功能。它使用一个genesis文件或用户信任的lightblock进行初始化。这种初始化是主观的，也就是说，轻客户端的安全性基于输入的有效性。如果genesis文件或lightblock与区块链上的实际情况不符，轻客户端将不提供任何保证。

初始化后，主管等待输入，即应获取的下一个lightblock的高度。然后，它下载、验证和交叉检查一个lightblock，如果所有测试都通过，则将lightblock（以及可能的其他lightblock）添加到lightstore中，并将其作为输出事件返回给用户。

以下的主循环负责与用户进行交互（输入、输出），并调用以下两个函数：

- `InitLightClient`：它使用提供的轻区块或与区块链生成的第一个区块对应的轻区块来初始化轻存储（lightstore）。
- `VerifyAndDetect`：接受轻存储和高度作为输入，并返回更新后的轻存储。

#### **[LC-FUNC-SUPERVISOR.1]:**

```go
func Sequential-Supervisor (initdata LCInitData) (Error) {

    lightStore,result := InitLightClient(initData);
    if result != OK {
        return result;
    }

    loop {
        // get the next height
        nextHeight := input();
  
        lightStore,result := VerifyAndDetect(lightStore, nextHeight);
  
        if result == OK {
            output(LightStore.Get(targetHeight));
   // we only output a trusted lightblock
        }
        else {
            return result
        }
        // QUESTION: is it OK to generate output event in normal case,
        // and terminate with failure in the (light client) attack case?
    }
}
```

- 实现备注
    - 除非检测到轻客户端攻击，否则无限循环。
    - 在典型的实现中（例如 Rust 中的实现），有多个输入操作：
      `VerifytoLatest`、`LatestTrusted` 和 `GetStatus`。可以从轻存储轻松获取这些信息，因此我们在这里不会显式处理这些请求，而只考虑需要更复杂计算和通信的给定高度的区块请求。
- 预期的前置条件
    - *LCInitData* 包含创世文件或轻区块。
- 预期的后置条件
    - 如果检测到轻客户端攻击：停止并提交证据（在 `InitLightClient` 或 `VerifyAndDetect` 中）
    - 否则：无。它将永远运行。
- 不变条件：*lightStore* 只包含可信任的轻区块。
- 错误条件
    - 如果 `InitLightClient` 或 `VerifyAndDetect` 失败（如果检测到攻击，或者违反了 [LCV-INV-TP.1]）

----

### 函数详细信息

#### 初始化

轻客户端基于主观初始化。它必须信任用户提供的初始数据。它无法检测攻击。因此，要么在初始化时我们获得一个轻区块并将轻存储初始化为它，要么在使用创世文件的情况下，我们下载、验证和交叉检查第一个区块，以使用这个第一个区块初始化轻存储。原因是我们希望从一开始就保持 [LCV-INV-TP.1]。

> 如果使用轻区块初始化轻客户端，当交叉检查初始轻区块时，可能会增加信任。然而，如果某个节点提供了一个冲突的轻区块，问题是要区分一个“伪造”块（操作应继续）和一个“轻客户端攻击”（操作应停止）的情况。对于伪造块，轻客户端可能被迫进行反向验证，直到区块超出了可信任期，以确保之前的验证人集合无法生成伪造块，这实际上为轻客户端打开了一种拒绝服务（DoS）攻击，而没有增加有效的鲁棒性。

#### **[LC-FUNC-INIT.1]:**

```go
func InitLightClient (initData LCInitData) (LightStore, Error) {

    if LCInitData.LightBlock != nil {
        // we trust the provided initial block.
        newblock := LCInitData.LightBlock
    }
    else {
        genesisBlock := makeblock(initData.genesisDoc);

        result := NoResult;
        while result != ResultSuccess {
            current = FetchLightBlock(PeerList.primary(), genesisBlock.Header.Height + 1)
            // QUESTION: is the height with "+1" OK?

            if CANNOT_VERIFY = ValidAndVerify(genesisBlock, current) {
                Replace_Primary();
            }
            else {
                result = ResultSuccess
            }
        }
  
        // cross-check
  auxLS := new LightStore
  auxLS.Add(current)
        Evidences := AttackDetector(genesisBlock, auxLS)
        if Evidences.Empty {
            newBlock := current
        }
        else {
            // [LC-SUMBIT-EVIDENCE.1]
            submitEvidence(Evidences);
            return(nil, ErrorAttack);
        }
    }

    lightStore := new LightStore;
    lightStore.Add(newBlock);
    return (lightStore, OK);
}

```

- 实现备注
    - 无
- 预期前置条件
    - *LCInitData* 包含创世文件或轻区块
    - 如果是创世文件，需要通过 `ValidateAndComplete()` 进行验证，参见 [Tendermint](https://informal.systems)
- 预期后置条件
    - *lightStore* 使用可信的轻区块进行初始化。它可能已经通过交叉检查（来自创世文件）或用户的初始信任进行验证。
- 错误条件
    - 如果前置条件被违反
    - peerList 为空

----

#### 主要验证和检测逻辑

#### **[LC-FUNC-MAIN-VERIF-DETECT.1]:**

```go
func VerifyAndDetect (lightStore LightStore, targetHeight Height)
                     (LightStore, Result) {

    b1, r1 = lightStore.Get(targetHeight)
    if r1 == true {
        if b1.State == StateTrusted {
            // block already there and trusted
            return (lightStore, ResultSuccess)
  }
  else {
            // We have a lightblock in the store, but it has not been 
            // cross-checked by now. We do that now.
            root_of_trust, auxLS := lightstore.TraceTo(b1);
   
            // Cross-check
            Evidences := AttackDetector(root_of_trust, auxLS);
            if Evidences.Empty {
                // no attack detected, we trust the new lightblock
                lightStore.Update(auxLS.Latest(), 
                                  StateTrusted, 
                                  verfiedLS.Latest().verification-root);
                return (lightStore, OK);
            }
            else {
                // there is an attack, we exit
  submitEvidence(Evidences);
                return(lightStore, ErrorAttack);
            }
        }
    }

    // get the lightblock with maximum height smaller than targetHeight
    // would typically be the heighest, if we always move forward
    root_of_trust, r2 = lightStore.LatestPrevious(targetHeight);

    if r2 = false {
        // there is no lightblock from which we can do forward
        // (skipping) verification. Thus we have to go backwards.
        // No cross-check needed. We trust hashes. Therefore, we
        // directly return the result
        return Backwards(primary, lightStore.Lowest(), targetHeight)
    }
    else {
        // Forward verification + detection
        result := NoResult;
        while result != ResultSuccess {
            verifiedLS,result := VerifyToTarget(primary,
                                                root_of_trust,
                                                nextHeight);
            if result == ResultFailure {
                // pick new primary (promote a secondary to primary)
                Replace_Primary(root_of_trust);
            }
            else if result == ResultExpired {
                return (lightStore, result)
            }
        }

        // Cross-check
        Evidences := AttackDetector(root_of_trust, verifiedLS);
        if Evidences.Empty {
            // no attack detected, we trust the new lightblock
            verifiedLS.Update(verfiedLS.Latest(), 
                              StateTrusted, 
                              verfiedLS.Latest().verification-root);
            lightStore.store_chain(verifidLS);
            return (lightStore, OK);
        }
        else {
            // there is an attack, we exit
            return(lightStore, ErrorAttack);
        }
    }
}
```

- 实现备注
    - 无
- 预期前置条件
    - 无
- 预期后置条件
    - 高度为 *targetHeight* 的轻区块（以及可能的其他区块）已添加到 *lightStore*
- 错误条件
    - 检测到攻击
    - 违反了 [LC-DATA-PEERLIST-INV.1]


# Draft of Light Client Supervisor for discussion

## TODOs

This specification in done in parallel with updates on the
verification specification. So some hyperlinks have to be placed to
the correct files eventually.

# Light Client Sequential Supervisor

The light client implements a read operation of a
[header](TMBC-HEADER-link) from the [blockchain](TMBC-SEQ-link), by
communicating with full nodes, a so-called primary and several
so-called witnesses. As some full nodes may be faulty, this
functionality must be implemented in a fault-tolerant way.

In the Tendermint blockchain, the validator set may change with every
new block.  The staking and unbonding mechanism induces a [security
model](TMBC-FM-2THIRDS-link): starting at time *Time* of the
[header](TMBC-HEADER-link),
more than two-thirds of the next validators of a new block are correct
for the duration of *TrustedPeriod*.

[Light Client Verification](https://informal.systems) implements the fault-tolerant read
operation designed for this security model. That is, it is safe if the
model assumptions are satisfied and makes progress if it communicates
to a correct primary.

However, if the [security model](TMBC-FM-2THIRDS-link) is violated,
faulty peers (that have been validators at some point in the past) may
launch attacks on the Tendermint network, and on the light
client. These attacks as well as an axiomatization of blocks in
general are defined in [a document that contains the definitions that
are currently in detection.md](https://informal.systems).

If there is a light client attack (but no
successful attack on the network), the safety of the verification step
may be violated (as we operate outside its basic assumption).
The light client also
contains a defense mechanism against light clients attacks, called detection.

[Light Client Detection](https://informal.systems) implements a cross check of the result
of the verification step. If there is a light client attack, and the
light client is connected to a correct peer, the light client as a
whole is safe, that is, it will not operate on invalid
blocks. However, in this case it cannot successfully read, as
inconsistent blocks are in the system. However, in this case the
detection performs a distributed computation that results in so-called
evidence. Evidence can be used to prove
to a correct full node that there has been a
light client attack.

[Light Client Evidence Accountability](https://informal.systems) is a protocol run on a
full node to check whether submitted evidence indeed proves the
existence of a light client attack. Further, from the evidence and its
own knowledge about the blockchain, the full node computes a set of
bonded full nodes (that at some point had more than one third of the
voting power) that participated in the attack that will be reported
via ABCI to the application.

In this document we specify

- Initialization of the Light Client
- The interaction of [verification](https://informal.systems) and [detection](https://informal.systems)

The details of these two protocols are captured in their own
documents, as is the [accountability](https://informal.systems) protocol.

> Another related line is IBC attack detection and submission at the
> relayer, as well as attack verification at the IBC handler. This
> will call for yet another spec.

# Status

This document is work in progress. In order to develop the
specification step-by-step,
it assumes certain details of [verification](https://informal.systems) and
[detection](https://informal.systems) that are not specified in the respective current
versions yet. This inconsistencies will be addresses over several
upcoming PRs.

# Part I - Tendermint Blockchain

See [verification spec](addLinksWhenDone)

# Part II - Sequential Problem Definition

#### **[LC-SEQ-INIT-LIVE.1]**

Upon initialization, the light client gets as input a header of the
blockchain, or the genesis file of the blockchain, and eventually
stores a header of the blockchain.

#### **[LC-SEQ-LIVE.1]**

The light client gets a sequence of heights as inputs. For each input
height *targetHeight*, it eventually stores the header of height
*targetHeight*.

#### **[LC-SEQ-SAFE.1]**

The light client never stores a header which is not in the blockchain.

# Part III - Light Client as Distributed System

## Computational Model

The light client communicates with remote processes only via the
[verification](TODO) and the [detection](TODO) protocols. The
respective assumptions are given there.

## Distributed Problem Statement

### Two Kinds of Liveness

In case of light client attacks, the sequential problem statement
cannot always be satisfied. The lightclient cannot decide which block
is from the chain and which is not. As a result, the light client just
creates evidence, submits it, and terminates.
For the liveness property, we thus add the
possibility that instead of adding a lightblock, we also might terminate
in case there is an attack.

#### **[LC-DIST-TERM.1]**

The light client either runs forever or it *terminates on attack*.

### Design choices

#### [LC-DIST-STORE.1]

The light client has a local data structure called LightStore
that contains light blocks (that contain a header).

> The light store exposes functions to query and update it. They are
> specified [here](TODO:onceVerificationIsMerged).

**TODO:** reference light store invariant [LCV-INV-LS-ROOT.2] once
verification is merged

#### **[LC-DIST-SAFE.1]**

It is always the case that every header in *LightStore* was
generated by an instance of Tendermint consensus.

#### **[LC-DIST-LIVE.1]**

Whenever the light client gets a new height *h* as input,

- and there is
no light client attack up to height *h*, then the lightclient
eventually puts the lightblock of height *h* in the lightstore and
wait for another input.
- otherwise, that is, if there
is a light client attack on height *h*, then the light client
must perform one of the following:
    - it terminates on attack.
    - it eventually puts the lightblock of height *h* in the lightstore and
wait for another input.

> Observe that the "existence of a lightclient attack" just means that some node has generated a conflicting block. It does not necessarily mean that a (faulty) peer sends such a block to "our" lightclient. Thus, even if there is an attack somewhere in the system, our lightclient might still continue to operate normally.

### Solving the sequential specification

[LC-DIST-SAFE.1] is guaranteed by the detector; in particular it
follows from
[[LCD-DIST-INV-STORE.1]](TODO)
[[LCD-DIST-LIVE.1]](TODO)

# Part IV - Light Client Supervisor Protocol

We provide a specification for a sequential Light Client Supervisor.
The local code for verification is presented by a sequential function
`Sequential-Supervisor` to highlight the control flow of this
functionality. Each lightblock is first verified with a primary, and then
cross-checked with secondaries, and if all goes well, the lightblock
is
added (with the attribute "trusted") to the
lightstore. Intermiate lightblocks that were used to verify the target
block but were not cross-checked are stored as "verified"

> We note that if a different concurrency model is considered
> for an implementation, the semantics of the lightstore might change:
> In a concurrent implementation, we might do verification for some
> height *h*, add the
> lightblock to the lightstore, and start concurrent threads that
>
> - do verification for the next height *h' != h*
> - do cross-checking for height *h*. If we find an attack, we remove
>   *h* from the lightstore.
> - the user might already start to use *h*
>
> Thus, this concurrency model changes the semantics of the
> lightstore (not all lightblocks that are read by the user are
> trusted; they may be removed if
> we find a problem). Whether this is desirable, and whether the gain in
> performance is worth it, we keep for future versions/discussion of
> lightclient protocols.

## Definitions

### Peers

#### **[LC-DATA-PEERS.1]:**

A fixed set of full nodes is provided in the configuration upon
initialization. Initially this set is partitioned into

- one full node that is the *primary* (singleton set),
- a set *Secondaries* (of fixed size, e.g., 3),
- a set *FullNodes*; it excludes *primary* and *Secondaries* nodes.
- A set *FaultyNodes* of nodes that the light client suspects of
    being faulty; it is initially empty

#### **[LC-INV-NODES.1]:**

The detector shall maintain the following invariants:

- *FullNodes \intersect Secondaries = {}*
- *FullNodes \intersect FaultyNodes = {}*
- *Secondaries \intersect FaultyNodes = {}*

and the following transition invariant

- *FullNodes' \union Secondaries' \union FaultyNodes' = FullNodes
   \union Secondaries \union FaultyNodes*

#### **[LC-FUNC-REPLACE-PRIMARY.1]:**

```go
Replace_Primary(root-of-trust LightBlock)
```

- Implementation remark
    - the primary is replaced by a secondary
    - to maintain a constant size of secondaries, need to
        - pick a new secondary *nsec* while ensuring [LC-INV-ROOT-AGREED.1]
        - that is, we need to ensure that root-of-trust = FetchLightBlock(nsec, root-of-trust.Header.Height)
- Expected precondition
    - *FullNodes* is nonempty
- Expected postcondition
    - *primary* is moved to *FaultyNodes*
    - a secondary *s* is moved from *Secondaries* to primary
- Error condition
    - if precondition is violated

#### **[LC-FUNC-REPLACE-SECONDARY.1]:**

```go
Replace_Secondary(addr Address, root-of-trust LightBlock)
```

- Implementation remark
    - maintain [LC-INV-ROOT-AGREED.1], that is,
    ensure root-of-trust = FetchLightBlock(nsec, root-of-trust.Header.Height)
- Expected precondition
    - *FullNodes* is nonempty
- Expected postcondition
    - addr is moved from *Secondaries* to *FaultyNodes*
    - an address *nsec* is moved from *FullNodes* to *Secondaries*
- Error condition
    - if precondition is violated

### Data Types

The core data structure of the protocol is the LightBlock.

#### **[LC-DATA-LIGHTBLOCK.1]**

```go
type LightBlock struct {
                Header          Header
                Commit          Commit
                Validators      ValidatorSet
                NextValidators  ValidatorSet
                Provider        PeerID
}
```

#### **[LC-DATA-LIGHTSTORE.1]**

LightBlocks are stored in a structure which stores all LightBlock from
initialization or received from peers.

```go
type LightStore struct {
        ...
}

```

We use the functions that the LightStore exposes, which
are defined in the [verification specification](TODO).

### Inputs

The lightclient is initialized with LCInitData

#### **[LC-DATA-INIT.1]**

```go
type LCInitData struct {
    lightBlock     LightBlock
    genesisDoc     GenesisDoc
}
```

where only one of the components must be provided. `GenesisDoc` is
defined in the [Tendermint
Types](https://github.com/tendermint/tendermint/blob/v0.34.x/types/genesis.go).

#### **[LC-DATA-GENESIS.1]**

```go
type GenesisDoc struct {
    GenesisTime     time.Time                `json:"genesis_time"`
    ChainID         string                   `json:"chain_id"`
    InitialHeight   int64                    `json:"initial_height"`
    ConsensusParams *tmproto.ConsensusParams `json:"consensus_params,omitempty"`
    Validators      []GenesisValidator       `json:"validators,omitempty"`
    AppHash         tmbytes.HexBytes         `json:"app_hash"`
    AppState        json.RawMessage          `json:"app_state,omitempty"`
}
```

We use the following function
`makeblock` so that we create a lightblock from the genesis
file in order to do verification based on the data from the genesis
file using the same verification function we use in normal operation.

#### **[LC-FUNC-MAKEBLOCK.1]**

```go
func makeblock (genesisDoc GenesisDoc) (lightBlock LightBlock))
```

- Implementation remark
    - none
- Expected precondition
    - none
- Expected postcondition
    - lightBlock.Header.Height =  genesisDoc.InitialHeight
    - lightBlock.Header.Time = genesisDoc.GenesisTime
    - lightBlock.Header.LastBlockID = nil
    - lightBlock.Header.LastCommit = nil
    - lightBlock.Header.Validators = genesisDoc.Validators
    - lightBlock.Header.NextValidators = genesisDoc.Validators
    - lightBlock.Header.Data = nil
    - lightBlock.Header.AppState =  genesisDoc.AppState
    - lightBlock.Header.LastResult = nil
    - lightBlock.Commit = nil
    - lightBlock.Validators = genesisDoc.Validators
    - lightBlock.NextValidators = genesisDoc.Validators
    - lightBlock.Provider = nil
- Error condition
    - none

----

### Configuration Parameters

#### **[LC-INV-ROOT-AGREED.1]**

In the Sequential-Supervisor, it is always the case that the primary
and all secondaries agree on lightStore.Latest().

### Assumptions

We have to assume that the initialization data (the lightblock or the
genesis file) are consistent with the blockchain. This is subjective
initialization and it cannot be checked locally.

### Invariants

#### **[LC-INV-PEERLIST.1]:**

The peer list contains a primary and a secondary.

> If the invariant is violated, the light client does not have enough
> peers to download headers from. As a result, the light client
> needs to terminate in case this invariant is violated.

## Supervisor

### Outline

The supervisor implements the functionality of the lightclient. It is
initialized with a genesis file or with a lightblock the user
trusts. This initialization is subjective, that is, the security of
the lightclient is based on the validity of the input. If the genesis
file or the lightblock deviate from the actual ones on the blockchain,
the lightclient provides no guarantees.

After initialization, the supervisor awaits an input, that is, the
height of the next lightblock that should be obtained. Then it
downloads, verifies, and cross-checks a lightblock, and if all tests
go through, the light block (and possibly other lightblocks) are added
to the lightstore, which is returned in an output event to the user.

The following main loop does the interaction with the user (input,
output) and calls the following two functions:

- `InitLightClient`: it initializes the lightstore either with the
  provided lightblock or with the lightblock that corresponds to the
  first block generated by the blockchain (by the validators defined
  by the genesis file)
- `VerifyAndDetect`: takes as input a lightstore and a height and
  returns the updated lightstore.

#### **[LC-FUNC-SUPERVISOR.1]:**

```go
func Sequential-Supervisor (initdata LCInitData) (Error) {

    lightStore,result := InitLightClient(initData);
    if result != OK {
        return result;
    }

    loop {
        // get the next height
        nextHeight := input();
  
        lightStore,result := VerifyAndDetect(lightStore, nextHeight);
  
        if result == OK {
            output(LightStore.Get(targetHeight));
   // we only output a trusted lightblock
        }
        else {
            return result
        }
        // QUESTION: is it OK to generate output event in normal case,
        // and terminate with failure in the (light client) attack case?
    }
}
```

- Implementation remark
    - infinite loop unless a light client attack is detected
    - In typical implementations (e.g., the one in Rust),
   there are mutliple input actions:
      `VerifytoLatest`, `LatestTrusted`, and `GetStatus`. The
      information can be easily obtained from the lightstore, so that
      we do not treat these requests explicitly here but just consider
   the request for a block of a given height which requires more
   involved computation and communication.
- Expected precondition
    - *LCInitData* contains a genesis file or a lightblock.
- Expected postcondition
    - if a light client attack is detected: it stops and submits
      evidence (in `InitLightClient` or `VerifyAndDetect`)
    - otherwise: non. It runs forever.
- Invariant: *lightStore* contains trusted lightblocks only.
- Error condition
    - if `InitLightClient` or `VerifyAndDetect` fails (if a attack is
 detected, or if [LCV-INV-TP.1] is violated)

----

### Details of the Functions

#### Initialization

The light client is based on subjective initialization. It has to
trust the initial data given to it by the user. It cannot do any
detection of attack. So either upon initialization we obtain a
lightblock and just initialize the lightstore with it. Or in case of a
genesis file, we download, verify, and cross-check the first block, to
initialize the lightstore with this first block. The reason is that
we want to maintain [LCV-INV-TP.1] from the beginning.

> If the lightclient is initialized with a lightblock, one might think
> it may increase trust, when one cross-checks the initial light
> block. However, if a peer provides a conflicting
> lightblock, the question is to distinguish the case of a
> [bogus](https://informal.systems) block (upon which operation should proceed) from a
> [light client attack](https://informal.systems) (upon which operation should stop). In
> case of a bogus block, the lightclient might be forced to do
> backwards verification until the blocks are out of the trusting
> period, to make sure no previous validator set could have generated
> the bogus block, which effectively opens up a DoS attack on the lightclient
> without adding effective robustness.

#### **[LC-FUNC-INIT.1]:**

```go
func InitLightClient (initData LCInitData) (LightStore, Error) {

    if LCInitData.LightBlock != nil {
        // we trust the provided initial block.
        newblock := LCInitData.LightBlock
    }
    else {
        genesisBlock := makeblock(initData.genesisDoc);

        result := NoResult;
        while result != ResultSuccess {
            current = FetchLightBlock(PeerList.primary(), genesisBlock.Header.Height + 1)
            // QUESTION: is the height with "+1" OK?

            if CANNOT_VERIFY = ValidAndVerify(genesisBlock, current) {
                Replace_Primary();
            }
            else {
                result = ResultSuccess
            }
        }
  
        // cross-check
  auxLS := new LightStore
  auxLS.Add(current)
        Evidences := AttackDetector(genesisBlock, auxLS)
        if Evidences.Empty {
            newBlock := current
        }
        else {
            // [LC-SUMBIT-EVIDENCE.1]
            submitEvidence(Evidences);
            return(nil, ErrorAttack);
        }
    }

    lightStore := new LightStore;
    lightStore.Add(newBlock);
    return (lightStore, OK);
}

```

- Implementation remark
    - none
- Expected precondition
    - *LCInitData* contains either a genesis file of a lightblock
    - if genesis it passes `ValidateAndComplete()` see [Tendermint](https://informal.systems)
- Expected postcondition
    - *lightStore* initialized with trusted lightblock. It has either been
      cross-checked (from genesis) or it has initial trust from the
      user.
- Error condition
    - if precondition is violated
    - empty peerList

----

#### Main verification and detection logic

#### **[LC-FUNC-MAIN-VERIF-DETECT.1]:**

```go
func VerifyAndDetect (lightStore LightStore, targetHeight Height)
                     (LightStore, Result) {

    b1, r1 = lightStore.Get(targetHeight)
    if r1 == true {
        if b1.State == StateTrusted {
            // block already there and trusted
            return (lightStore, ResultSuccess)
  }
  else {
            // We have a lightblock in the store, but it has not been 
            // cross-checked by now. We do that now.
            root_of_trust, auxLS := lightstore.TraceTo(b1);
   
            // Cross-check
            Evidences := AttackDetector(root_of_trust, auxLS);
            if Evidences.Empty {
                // no attack detected, we trust the new lightblock
                lightStore.Update(auxLS.Latest(), 
                                  StateTrusted, 
                                  verfiedLS.Latest().verification-root);
                return (lightStore, OK);
            }
            else {
                // there is an attack, we exit
  submitEvidence(Evidences);
                return(lightStore, ErrorAttack);
            }
        }
    }

    // get the lightblock with maximum height smaller than targetHeight
    // would typically be the heighest, if we always move forward
    root_of_trust, r2 = lightStore.LatestPrevious(targetHeight);

    if r2 = false {
        // there is no lightblock from which we can do forward
        // (skipping) verification. Thus we have to go backwards.
        // No cross-check needed. We trust hashes. Therefore, we
        // directly return the result
        return Backwards(primary, lightStore.Lowest(), targetHeight)
    }
    else {
        // Forward verification + detection
        result := NoResult;
        while result != ResultSuccess {
            verifiedLS,result := VerifyToTarget(primary,
                                                root_of_trust,
                                                nextHeight);
            if result == ResultFailure {
                // pick new primary (promote a secondary to primary)
                Replace_Primary(root_of_trust);
            }
            else if result == ResultExpired {
                return (lightStore, result)
            }
        }

        // Cross-check
        Evidences := AttackDetector(root_of_trust, verifiedLS);
        if Evidences.Empty {
            // no attack detected, we trust the new lightblock
            verifiedLS.Update(verfiedLS.Latest(), 
                              StateTrusted, 
                              verfiedLS.Latest().verification-root);
            lightStore.store_chain(verifidLS);
            return (lightStore, OK);
        }
        else {
            // there is an attack, we exit
            return(lightStore, ErrorAttack);
        }
    }
}
```

- Implementation remark
    - none
- Expected precondition
    - none
- Expected postcondition
    - lightblock of height *targetHeight* (and possibly additional blocks) added to *lightStore*
- Error condition
    - an attack is detected
    - [LC-DATA-PEERLIST-INV.1] is violated

----
