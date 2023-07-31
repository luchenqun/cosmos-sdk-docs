# 用于分叉检测和分叉证明提交的函数草稿

本文档收集了在IBC上下文中生成和提交分叉证明的函数草稿。

- [IBC](#on---chain-ibc-component)

- [中继器](#relayer)

## On-chain IBC 组件

> 以下是对ICS 007中定义的函数的建议更改

#### [TAG-IBC-MISBEHAVIOR.1]

```go
func checkMisbehaviourAndUpdateState(cs: ClientState, PoF: LightNodeProofOfFork)
```

**TODO:** 完成条件

- 实现备注
- 预期前提条件
    - PoF.TrustedBlock.Header与存储中的lightBlock在相同高度上相等
    - 两个追踪都以相同高度的头结尾
    - 头结构不同
    - 两个追踪都由PoF.TrustedBlock支持（在[TMBC-FUNC]中定义的`supports`），即对于`t = currentTimestamp()`（参见ICS 024）
        - supports(PoF.TrustedBlock, PoF.PrimaryTrace[1], t)
        - supports(PoF.PrimaryTrace[i], PoF.PrimaryTrace[i+1], t) 对于 *0 < i < length(PoF.PrimaryTrace)*
        - supports(PoF.TrustedBlock,  PoF.SecondaryTrace[1], t)
        - supports(PoF.SecondaryTrace[i], PoF.SecondaryTrace[i+1], t) 对于 *0 < i < length(PoF.SecondaryTrace)*  
- 预期后置条件
    - 将cs.FrozenHeight设置为min(cs.FrozenHeight, PoF.TrustedBlock.Header.Height)
- 错误条件
    - 无

----

> 以下是对ICS 002和007添加功能的建议。
> 我认为上述方法是获取所需信息的最有效方式。另一种选择是通过CosmosSDK订阅“header install”事件。

#### [TAG-IBC-HEIGHTS.1]

```go
func QueryHeightsRange(id, from, to) ([]Height)
```

- 预期后置条件
    - 返回IBC组件具有共识状态的所有高度*h*，其中 *from <= h <= to*。

----

> 如果中继器对IBC组件没有任何信息，可以使用此函数。这允许后加入的中继器参与分叉检测和生成分叉证明。或者，我们还可以假设中继器不负责检测它们开始之前的高度的分叉（并订阅报告IBC组件中安装的新头事务）。



## Relayer

### 在轻客户端中实现的辅助函数

#### [LCV-LS-FUNC-GET-PREV.1]

```go
func (ls LightStore) GetPreviousVerified(height Height) (LightBlock, bool)
```

- 预期后置条件
    - 返回一个已验证的 LightBlock，其高度在小于 `height` 的所有已验证的 lightblock 中最大

----

### Relayer 向 IBC 组件提交分叉证明

Relayer 可以通过以下两种方式检测到分叉：

- 通过其任一轻客户端的分叉检测器
- 通过检查 IBC 组件的共识状态

下面的函数忽略了分叉证明是如何生成的。
它以分叉证明作为输入，并计算出一个将被 IBC 组件接受的分叉证明。
这里解决的问题是，Relayer 的轻客户端和 IBC 组件都有不完整的轻存储，可能没有所有的共同轻区块。
因此，Relayer 必须弄清楚 IBC 组件的了解情况（直观地说，是两个轻存储在 `commonRoot` 中计算的交汇点），并计算出一个 IBC 组件将基于其了解情况接受的分叉证明（`extendPoF`）。

辅助函数 `commonRoot` 和 `extendPoF` 的定义如下。

#### [TAG-SUBMIT-POF-IBC.1]

```go
func SubmitIBCProofOfFork(
  lightStore LightStore,
  PoF: LightNodeProofOfFork,
  ibc IBCComponent) (Error) {
    if ibc.queryChainConsensusState(PoF.TrustedBlock.Height) = PoF.TrustedBlock {
  // IBC component has root of PoF on store, we can just submit
        ibc.submitMisbehaviourToClient(ibc.id,PoF)
  return Success
     // note sure about the id parameter
    }
    else {
        // the ibc component does not have the TrustedBlock and might
  // even be on yet a different branch. We have to compute a PoF
  // that the ibc component can verifiy based on its current
        // knowledge
  
        ibcLightBlock, lblock, _, result := commonRoot(lightStore, ibc, PoF.TrustedBlock)

     if result = Success {
   newPoF = extendPoF(ibcLightBlock, lblock, lightStore, PoF)
      ibc.submitMisbehaviourToClient(ibc.id, newPoF)
      return Success
     }
  else{
   return CouldNotGeneratePoF
     }
    }
}
```

**TODO:** 完成条件

- 实现备注
- 预期前置条件
- 预期后置条件
- 错误条件
    - 无

----

### Relayer 的辅助函数

> 如果 Relayer 检测到分叉，它必须计算一个能够说服 IBC 组件的分叉证明。也就是说，它必须将 Relayer 的本地轻存储与 IBC 组件的轻存储进行比较，并找到共同的祖先轻区块。

#### [TAG-COMMON-ROOT.1]

```go
func commonRoot(lightStore LightStore, ibc IBCComponent, lblock
LightBlock) (LightBlock, LightBlock, LightStore, Result) {

    auxLS.Init

       // first we ask for the heights the ibc component is aware of
  ibcHeights = ibc.QueryHeightsRange(
                     ibc.id,
                     lightStore.LowestVerified().Height,
                     lblock.Height - 1);
  // this function does not exist yet. Alternatively, we may
  // request all transactions that installed headers via CosmosSDK
  

        for {
            h, result = max(ibcHeights)
   if result = Empty {
       return (_, _, _, NoRoot)
      }
      ibcLightBlock = ibc.queryChainConsensusState(h)
   auxLS.Update(ibcLightBlock, StateVerified);
      connector, result := Connector(lightStore, ibcLightBlock, lblock.Header.Height)
      if result = success {
       return (ibcLightBlock, connector, auxLS, Success)
   }
   else{
       ibcHeights.remove(h)
      }
  }
}
```

- 预期后置条件
    - 返回
        - 来自 IBC 组件的一个 lightBlock b1，以及
        - 一个来自本地轻存储的 lightBlock b2，其高度小于 lblock.Header.Hight，并且 b1 支持 b2，以及
        - 一个包含从 IBC 组件下载的区块的轻存储

----

#### [TAG-LS-FUNC-CONNECT.1]

```go
func Connector (lightStore LightStore, lb LightBlock, h Height) (LightBlock, bool)
```

- 预期后置条件
    - 返回一个经过验证的LightBlock，其高度小于*h*，可以通过lb在一步中进行验证。

**TODO：** 为了使上述工作正常运行，我们需要一个不变量，即所有经过验证的lightblock形成一个信任链。否则，我们需要一个具有到高度的信任链的lightblock。

> 一旦找到共同的根，就需要生成一个能够被IBC组件接受的分叉证明。这是在以下函数中完成的。

#### [TAG-EXTEND-POF.1]

```go
func extendPoF (root LightBlock,
                connector LightBlock,
    lightStore LightStore,
    Pof LightNodeProofofFork) (LightNodeProofofFork}
```

- 实现备注
    - PoF不足以说服IBC组件，因此我们将分叉证明向过去扩展
- 预期后置条件
    - 返回一个新的POF：
        - newPoF.TrustedBlock = root
        - 让prefix =
       connector +
       lightStore.Subtrace(connector.Header.Height, PoF.TrustedBlock.Header.Height-1) +
       PoF.TrustedBlock  
            - newPoF.PrimaryTrace = prefix + PoF.PrimaryTrace
            - newPoF.SecondaryTrace = prefix + PoF.SecondaryTrace

### 在IBC组件中检测分叉

假定定期调用以下函数来检查IBC组件的最新共识状态。或者，可以在通知中继器（通过事件）安装了新的标头时执行此逻辑。

#### [TAG-HANDLER-DETECT-FORK.1]

```go
func DetectIBCFork(ibc IBCComponent, lightStore LightStore) (LightNodeProofOfFork, Error) {
    cs = ibc.queryClientState(ibc);
 lb, found := lightStore.Get(cs.Header.Height)
    if !found {
 **TODO:** need verify to target
        lb, result = LightClient.Main(primary, lightStore, cs.Header.Height)
  // [LCV-FUNC-IBCMAIN.1]
  **TODO** decide what to do following the outcome of Issue #499
  
  // I guess here we have to get into the light client

    }
 if cs != lb {
     // IBC component disagrees with my primary.
  // I fetch the
     ibcLightBlock, lblock, ibcStore, result := commonRoot(lightStore, ibc, lb)
  pof = new LightNodeProofOfFork;
  pof.TrustedBlock := ibcLightBlock
  pof.PrimaryTrace := ibcStore + cs
  pof.SecondaryTrace :=  lightStore.Subtrace(lblock.Header.Height,
                                    lb.Header.Height);
        return(pof, Fork)
 }
 return(nil , NoFork)
}
```

**TODO：** 完成条件

- 实现备注
    - 我们向处理程序询问最新的检查。与链进行交叉检查。如果它们偏离，我们生成PoF。
    - 我们假设IBC组件是正确的。它已经验证了共识状态
- 预期前置条件
- 预期后置条件


# Draft of Functions for Fork detection and Proof of Fork Submisstion

This document collects drafts of function for generating and
submitting proof of fork in the IBC context

- [IBC](#on---chain-ibc-component)

- [Relayer](#relayer)

## On-chain IBC Component

> The following is a suggestions to change the function defined in ICS 007

#### [TAG-IBC-MISBEHAVIOR.1]

```go
func checkMisbehaviourAndUpdateState(cs: ClientState, PoF: LightNodeProofOfFork)
```

**TODO:** finish conditions

- Implementation remark
- Expected precondition
    - PoF.TrustedBlock.Header is equal to lightBlock on store with
      same height
    - both traces end with header of same height
    - headers are different
    - both traces are supported by PoF.TrustedBlock (`supports`
   defined in [TMBC-FUNC]), that is, for `t = currentTimestamp()` (see
   ICS 024)
        - supports(PoF.TrustedBlock, PoF.PrimaryTrace[1], t)
        - supports(PoF.PrimaryTrace[i], PoF.PrimaryTrace[i+1], t) for
     *0 < i < length(PoF.PrimaryTrace)*
        - supports(PoF.TrustedBlock,  PoF.SecondaryTrace[1], t)
        - supports(PoF.SecondaryTrace[i], PoF.SecondaryTrace[i+1], t) for
     *0 < i < length(PoF.SecondaryTrace)*  
- Expected postcondition
    - set cs.FrozenHeight to min(cs.FrozenHeight, PoF.TrustedBlock.Header.Height)
- Error condition
    - none

----

> The following is a suggestions to add functionality to ICS 002 and 007.
> I suppose the above is the most efficient way to get the required
> information. Another option is to subscribe to "header install"
> events via CosmosSDK

#### [TAG-IBC-HEIGHTS.1]

```go
func QueryHeightsRange(id, from, to) ([]Height)
```

- Expected postcondition
    - returns all heights *h*, with *from <= h <= to* for which the
      IBC component has a consensus state.

----

> This function can be used if the relayer has no information about
> the IBC component. This allows late-joining relayers to also
> participate in fork dection and the generation in proof of
> fork. Alternatively, we may also postulate that relayers are not
> responsible to detect forks for heights before they started (and
> subscribed to the transactions reporting fresh headers being
> installed at the IBC component).

## Relayer

### Auxiliary Functions to be implemented in the Light Client

#### [LCV-LS-FUNC-GET-PREV.1]

```go
func (ls LightStore) GetPreviousVerified(height Height) (LightBlock, bool)
```

- Expected postcondition
    - returns a verified LightBlock, whose height is maximal among all
      verified lightblocks with height smaller than `height`

----

### Relayer Submitting Proof of Fork to the IBC Component

There are two ways the relayer can detect a fork

- by the fork detector of one of its lightclients
- be checking the consensus state of the IBC component

The following function ignores how the proof of fork was generated.
It takes a proof of fork as input and computes a proof of fork that
     will be accepted by the IBC component.
The problem addressed here is that both, the relayer's light client
     and the IBC component have incomplete light stores, that might
     not have all light blocks in common.
Hence the relayer has to figure out what the IBC component knows
     (intuitively, a meeting point between the two lightstores
     computed in `commonRoot`)  and compute a proof of fork
     (`extendPoF`) that the IBC component will accept based on its
     knowledge.

The auxiliary functions `commonRoot` and `extendPoF` are
defined below.

#### [TAG-SUBMIT-POF-IBC.1]

```go
func SubmitIBCProofOfFork(
  lightStore LightStore,
  PoF: LightNodeProofOfFork,
  ibc IBCComponent) (Error) {
    if ibc.queryChainConsensusState(PoF.TrustedBlock.Height) = PoF.TrustedBlock {
  // IBC component has root of PoF on store, we can just submit
        ibc.submitMisbehaviourToClient(ibc.id,PoF)
  return Success
     // note sure about the id parameter
    }
    else {
        // the ibc component does not have the TrustedBlock and might
  // even be on yet a different branch. We have to compute a PoF
  // that the ibc component can verifiy based on its current
        // knowledge
  
        ibcLightBlock, lblock, _, result := commonRoot(lightStore, ibc, PoF.TrustedBlock)

     if result = Success {
   newPoF = extendPoF(ibcLightBlock, lblock, lightStore, PoF)
      ibc.submitMisbehaviourToClient(ibc.id, newPoF)
      return Success
     }
  else{
   return CouldNotGeneratePoF
     }
    }
}
```

**TODO:** finish conditions

- Implementation remark
- Expected precondition
- Expected postcondition
- Error condition
    - none

----

### Auxiliary Functions at the Relayer

> If the relayer detects a fork, it has to compute a proof of fork that
> will convince the IBC component. That is it has to compare the
> relayer's local lightstore against the lightstore of the IBC
> component, and find common ancestor lightblocks.

#### [TAG-COMMON-ROOT.1]

```go
func commonRoot(lightStore LightStore, ibc IBCComponent, lblock
LightBlock) (LightBlock, LightBlock, LightStore, Result) {

    auxLS.Init

       // first we ask for the heights the ibc component is aware of
  ibcHeights = ibc.QueryHeightsRange(
                     ibc.id,
                     lightStore.LowestVerified().Height,
                     lblock.Height - 1);
  // this function does not exist yet. Alternatively, we may
  // request all transactions that installed headers via CosmosSDK
  

        for {
            h, result = max(ibcHeights)
   if result = Empty {
       return (_, _, _, NoRoot)
      }
      ibcLightBlock = ibc.queryChainConsensusState(h)
   auxLS.Update(ibcLightBlock, StateVerified);
      connector, result := Connector(lightStore, ibcLightBlock, lblock.Header.Height)
      if result = success {
       return (ibcLightBlock, connector, auxLS, Success)
   }
   else{
       ibcHeights.remove(h)
      }
  }
}
```

- Expected postcondition
    - returns
        - a lightBlock b1 from the IBC component, and
        - a lightBlock b2
            from the local lightStore with height less than
   lblock.Header.Hight, s.t. b1 supports b2, and
        - a lightstore with the blocks downloaded from
          the ibc component

----

#### [TAG-LS-FUNC-CONNECT.1]

```go
func Connector (lightStore LightStore, lb LightBlock, h Height) (LightBlock, bool)
```

- Expected postcondition
    - returns a verified LightBlock from lightStore with height less
      than *h* that can be
      verified by lb in one step.

**TODO:** for the above to work we need an invariant that all verified
lightblocks form a chain of trust. Otherwise, we need a lightblock
that has a chain of trust to height.

> Once the common root is found, a proof of fork that will be accepted
> by the IBC component needs to be generated. This is done in the
> following function.

#### [TAG-EXTEND-POF.1]

```go
func extendPoF (root LightBlock,
                connector LightBlock,
    lightStore LightStore,
    Pof LightNodeProofofFork) (LightNodeProofofFork}
```

- Implementation remark
    - PoF is not sufficient to convince an IBC component, so we extend
      the proof of fork farther in the past
- Expected postcondition
    - returns a newPOF:
        - newPoF.TrustedBlock = root
        - let prefix =
       connector +
       lightStore.Subtrace(connector.Header.Height, PoF.TrustedBlock.Header.Height-1) +
       PoF.TrustedBlock  
            - newPoF.PrimaryTrace = prefix + PoF.PrimaryTrace
            - newPoF.SecondaryTrace = prefix + PoF.SecondaryTrace

### Detection a fork at the IBC component

The following functions is assumed to be called regularly to check
that latest consensus state of the IBC component. Alternatively, this
logic can be executed whenever the relayer is informed (via an event)
that a new header has been installed.

#### [TAG-HANDLER-DETECT-FORK.1]

```go
func DetectIBCFork(ibc IBCComponent, lightStore LightStore) (LightNodeProofOfFork, Error) {
    cs = ibc.queryClientState(ibc);
 lb, found := lightStore.Get(cs.Header.Height)
    if !found {
 **TODO:** need verify to target
        lb, result = LightClient.Main(primary, lightStore, cs.Header.Height)
  // [LCV-FUNC-IBCMAIN.1]
  **TODO** decide what to do following the outcome of Issue #499
  
  // I guess here we have to get into the light client

    }
 if cs != lb {
     // IBC component disagrees with my primary.
  // I fetch the
     ibcLightBlock, lblock, ibcStore, result := commonRoot(lightStore, ibc, lb)
  pof = new LightNodeProofOfFork;
  pof.TrustedBlock := ibcLightBlock
  pof.PrimaryTrace := ibcStore + cs
  pof.SecondaryTrace :=  lightStore.Subtrace(lblock.Header.Height,
                                    lb.Header.Height);
        return(pof, Fork)
 }
 return(nil , NoFork)
}
```

**TODO:** finish conditions

- Implementation remark
    - we ask the handler for the lastest check. Cross-check with the
      chain. In case they deviate we generate PoF.
    - we assume IBC component is correct. It has verified the
      consensus state
- Expected precondition
- Expected postcondition
