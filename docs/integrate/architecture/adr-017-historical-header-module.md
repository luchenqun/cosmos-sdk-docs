# ADR 17: 历史头模块

## 变更日志

* 2019年11月26日：第一个版本开始
* 2019年12月2日：第一个版本的最终草稿

## 背景

为了使 Cosmos SDK 能够实现 [IBC 规范](https://github.com/cosmos/ics)，Cosmos SDK 内的模块必须具备检查其他链上这些值的最近共识状态（验证人集和承诺根）的能力，因为在握手期间必须检查这些值的证明。

## 决策

应用程序必须将最近的 `n` 个头部存储在持久存储中。起初，这个存储可以是当前的 Merklised 存储。稍后可以使用非 Merklised 存储，因为不需要证明。

应用程序必须通过在处理 `abci.RequestBeginBlock` 时立即存储新的头部来存储这些信息：

```go
func BeginBlock(ctx sdk.Context, keeper HistoricalHeaderKeeper, req abci.RequestBeginBlock) abci.ResponseBeginBlock {
  info := HistoricalInfo{
    Header: ctx.BlockHeader(),
    ValSet: keeper.StakingKeeper.GetAllValidators(ctx), // note that this must be stored in a canonical order
  }
  keeper.SetHistoricalInfo(ctx, ctx.BlockHeight(), info)
  n := keeper.GetParamRecentHeadersToStore()
  keeper.PruneHistoricalInfo(ctx, ctx.BlockHeight() - n)
  // continue handling request
}
```

或者，应用程序可以仅存储验证人集的哈希。

应用程序必须通过 `Keeper` 的 `GetHistoricalInfo` 函数，使过去的 `n` 个已提交的头部可供 Cosmos SDK 模块查询。这可以在一个新的模块中实现，也可以集成到现有模块中（可能是 `x/staking` 或 `x/ibc`）。

`n` 可以配置为参数存储参数，这样可以通过 `ParameterChangeProposal` 进行更改，尽管如果增加 `n`，存储的信息需要一些块才能追赶上。

## 状态

建议。

## 影响

实施此 ADR 将需要对 Cosmos SDK 进行更改。不需要对 Tendermint 进行更改。

### 积极影响

* Cosmos SDK 中的任何模块都可以轻松检索最近过去高度的头部和状态根。
* 不需要调用 Tendermint 的 RPC。
* 不需要更改 ABCI。

### 负面影响

* 在 Tendermint 和应用程序中重复存储 `n` 个头部的数据（增加磁盘使用量）- 从长远来看，可能更倾向于采用类似 [这个](https://github.com/tendermint/tendermint/issues/4210) 的方法。

### 中性影响

（无已知）

## 参考资料

* [ICS 2: "共识状态内省"](https://github.com/cosmos/ibc/tree/master/spec/core/ics-002-client-semantics#consensus-state-introspection)

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


# ADR 17: Historical Header Module

## Changelog

* 26 November 2019: Start of first version
* 2 December 2019: Final draft of first version

## Context

In order for the Cosmos SDK to implement the [IBC specification](https://github.com/cosmos/ics), modules within the Cosmos SDK must have the ability to introspect recent consensus states (validator sets & commitment roots) as proofs of these values on other chains must be checked during the handshakes.

## Decision

The application MUST store the most recent `n` headers in a persistent store. At first, this store MAY be the current Merklised store. A non-Merklised store MAY be used later as no proofs are necessary.

The application MUST store this information by storing new headers immediately when handling `abci.RequestBeginBlock`:

```go
func BeginBlock(ctx sdk.Context, keeper HistoricalHeaderKeeper, req abci.RequestBeginBlock) abci.ResponseBeginBlock {
  info := HistoricalInfo{
    Header: ctx.BlockHeader(),
    ValSet: keeper.StakingKeeper.GetAllValidators(ctx), // note that this must be stored in a canonical order
  }
  keeper.SetHistoricalInfo(ctx, ctx.BlockHeight(), info)
  n := keeper.GetParamRecentHeadersToStore()
  keeper.PruneHistoricalInfo(ctx, ctx.BlockHeight() - n)
  // continue handling request
}
```

Alternatively, the application MAY store only the hash of the validator set.

The application MUST make these past `n` committed headers available for querying by Cosmos SDK modules through the `Keeper`'s `GetHistoricalInfo` function. This MAY be implemented in a new module, or it MAY also be integrated into an existing one (likely `x/staking` or `x/ibc`).

`n` MAY be configured as a parameter store parameter, in which case it could be changed by `ParameterChangeProposal`s, although it will take some blocks for the stored information to catch up if `n` is increased.

## Status

Proposed.

## Consequences

Implementation of this ADR will require changes to the Cosmos SDK. It will not require changes to Tendermint.

### Positive

* Easy retrieval of headers & state roots for recent past heights by modules anywhere in the Cosmos SDK.
* No RPC calls to Tendermint required.
* No ABCI alterations required.

### Negative

* Duplicates `n` headers data in Tendermint & the application (additional disk usage) - in the long term, an approach such as [this](https://github.com/tendermint/tendermint/issues/4210) might be preferable.

### Neutral

(none known)

## References

* [ICS 2: "Consensus state introspection"](https://github.com/cosmos/ibc/tree/master/spec/core/ics-002-client-semantics#consensus-state-introspection)
