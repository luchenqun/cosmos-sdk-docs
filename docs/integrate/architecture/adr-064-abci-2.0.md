# ADR 64: ABCI 2.0 集成（第二阶段）

## 变更日志

* 2023-01-17: 初始草稿（@alexanderbez）
* 2023-04-06: 添加升级部分（@alexanderbez）
* 2023-04-10: 简化投票扩展状态持久化（@alexanderbez）

## 状态

已接受

## 摘要

本 ADR 概述了在 Cosmos SDK 中实现 ABCI++ 的工作的继续，该工作在 [ADR 060: ABCI 1.0（第一阶段）](adr-060-abci-1.0.md) 中有所提及。

具体而言，本 ADR 概述了 ABCI 2.0 的设计和实现，其中包括 `ExtendVote`、`VerifyVoteExtension` 和 `FinalizeBlock`。

## 背景

ABCI 2.0 继续了 ABCI++ 的承诺更新，具体而言是增加了三个应用程序可以实现的额外 ABCI 方法，以便进一步控制、洞察和定制共识过程，解锁了许多以前不可能的新领域用例。我们在下面描述了这三个新方法：

### `ExtendVote`

该方法允许每个验证器进程扩展 CometBFT 共识过程的预提交阶段。具体而言，它允许应用程序执行自定义业务逻辑，扩展预提交投票并提供额外的数据作为投票的一部分，尽管它们由同一密钥单独签名。

所谓的投票扩展数据将与其扩展的投票一起广播和接收，并将在下一个高度中提供给应用程序。具体而言，下一个区块的提议者将在 `RequestPrepareProposal.local_last_commit.votes` 中接收投票扩展。

如果应用程序没有投票扩展信息可提供，则返回一个长度为 0 的字节数组作为其投票扩展。

**注意**：

* 尽管每个验证器进程都提交自己的投票扩展，但**只有**下一个区块的**提议者**将接收到作为上一个区块预提交阶段的一部分的所有投票扩展。这意味着只有提议者将隐式地访问所有投票扩展，通过 `RequestPrepareProposal`，并且并非所有投票扩展都可能被包含，因为验证器不必等待所有预提交，只需 2/3。
* 预提交投票与投票扩展是独立签名的。

### `VerifyVoteExtension`（验证投票扩展）

该方法允许验证人验证附加到每个预提交消息的投票扩展数据。如果验证失败，整个预提交消息将被视为无效，并被 CometBFT 忽略。

当验证预提交投票时，CometBFT 使用 `VerifyVoteExtension` 方法。具体而言，对于预提交，CometBFT 将执行以下操作：

* 如果消息不包含已签名的投票和已签名的投票扩展，则拒绝该消息。
* 如果投票的签名或投票扩展的签名无法验证，则拒绝该消息。
* 如果应用程序拒绝了 `VerifyVoteExtension`，则拒绝该消息。

否则，CometBFT 将接受预提交消息。

请注意，这对于活性具有重要影响，即如果正确的验证人无法重复验证投票扩展，即使有足够多（+2/3）的验证人为该块发送预提交投票，CometBFT 也可能无法完成块的最终化。因此，应谨慎使用 `VerifyVoteExtension`。

CometBFT 建议，如果检测到无效的投票扩展，应用程序应在 `ResponseVerifyVoteExtension` 中接受该扩展并在自身逻辑中忽略它。

### `FinalizeBlock`（最终化块）

该方法将决定的块传递给应用程序。应用程序必须以确定性方式执行块中的交易，并相应地更新其状态。通过 `ResponseFinalizeBlock` 中的相应参数返回的块和交易结果的加密承诺将包含在下一个块的头部中。当决定一个新块时，CometBFT 调用该方法。

换句话说，`FinalizeBlock` 将当前的 ABCI 执行流程（`BeginBlock`、一个或多个 `DeliverTx` 和 `EndBlock`）封装为一个单独的 ABCI 方法。CometBFT 将不再执行这些传统方法的请求，而只会简单地调用 `FinalizeBlock`。

## 决策

我们将讨论对 Cosmos SDK 进行更改以实现 ABCI 2.0 的两个不同阶段，即 `VoteExtensions` 和 `FinalizeBlock`。

### `VoteExtensions`（投票扩展）

类似于 `PrepareProposal` 和 `ProcessProposal`，我们建议引入两个新的处理程序，应用程序可以实现这两个处理程序以提供和验证投票扩展。

我们建议应用程序实现以下新的处理程序：

```go
type ExtendVoteHandler func(sdk.Context, abci.RequestExtendVote) abci.ResponseExtendVote
type VerifyVoteExtensionHandler func(sdk.Context, abci.RequestVerifyVoteExtension) abci.ResponseVerifyVoteExtension
```

将引入一个新的执行状态`voteExtensionState`，并将其作为提供给两个处理程序的`Context`。它将包含相关的元数据，如区块高度和区块哈希。请注意，`voteExtensionState`永远不会被提交，它只会作为单个区块上下文中的临时状态存在。

如果应用程序决定实现`ExtendVoteHandler`，它必须返回一个非空的`ResponseExtendVote.VoteExtension`。

请记住，`ExtendVoteHandler`的实现不需要是确定性的，但是，对于一组投票扩展，`VerifyVoteExtensionHandler`必须是确定性的，否则链可能会遭受活性故障。此外，请记住，CometBFT按照每个高度的轮次进行操作，因此如果在给定高度上无法对块提案做出决策，CometBFT将继续到下一轮，因此将为每个验证器的新轮次再次执行`ExtendVote`和`VerifyVoteExtension`，直到可以获得2/3个有效的预提交。

考虑到投票扩展的潜在实现和用例的广泛范围，以及如何验证它们，大多数应用程序应选择通过单个处理程序类型来实现处理程序，该类型可以注入任意数量的依赖项，如保管人。此外，此处理程序类型可以包含某种易失性投票扩展状态管理的概念，这将有助于投票扩展的验证。此状态管理可以是临时的，也可以是某种形式的磁盘持久化。

示例：

```go
// VoteExtensionHandler implements an Oracle vote extension handler.
type VoteExtensionHandler struct {
	cdc   Codec
	mk    MyKeeper
	state VoteExtState // This could be a map or a DB connection object
}

// ExtendVoteHandler can do something with h.mk and possibly h.state to create
// a vote extension, such as fetching a series of prices for supported assets.
func (h VoteExtensionHandler) ExtendVoteHandler(ctx sdk.Context, req abci.RequestExtendVote) abci.ResponseExtendVote {
	prices := GetPrices(ctx, h.mk.Assets())
	bz, err := EncodePrices(h.cdc, prices)
	if err != nil {
		panic(fmt.Errorf("failed to encode prices for vote extension: %w", err))
	}

	// store our vote extension at the given height
	//
	// NOTE: Vote extensions can be overridden since we can timeout in a round.
	SetPrices(h.state, req, bz)

	return abci.ResponseExtendVote{VoteExtension: bz}
}

// VerifyVoteExtensionHandler can do something with h.state and req to verify
// the req.VoteExtension field, such as ensuring the provided oracle prices are
// within some valid range of our prices.
func (h VoteExtensionHandler) VerifyVoteExtensionHandler(ctx sdk.Context, req abci.RequestVerifyVoteExtension) abci.ResponseVerifyVoteExtension {
	prices, err := DecodePrices(h.cdc, req.VoteExtension)
	if err != nil {
		log("failed to decode vote extension", "err", err)
		return abci.ResponseVerifyVoteExtension{Status: REJECT}
	}

	if err := ValidatePrices(h.state, req, prices); err != nil {
		log("failed to validate vote extension", "prices", prices, "err", err)
		return abci.ResponseVerifyVoteExtension{Status: REJECT}
	}

	// store updated vote extensions at the given height
	//
	// NOTE: Vote extensions can be overridden since we can timeout in a round.
	SetPrices(h.state, req, req.VoteExtension)

	return abci.ResponseVerifyVoteExtension{Status: ACCEPT}
}
```

#### 投票扩展传播和验证

如前所述，高度`H`的投票扩展仅在`PrepareProposal`期间提供给高度`H+1`的提议者。然而，为了使投票扩展有用，所有验证器在`H+1`期间应该能够访问在高度`H`上达成一致的投票扩展。

由于CometBFT在`RequestPrepareProposal`中包含了所有的投票扩展签名，我们建议提议的验证者通过一个特殊的交易`VoteExtsTx`在`PrepareProposal`期间手动"注入"投票扩展及其相应的签名到区块提案中。`VoteExtsTx`将被填充为一个包含单个`ExtendedCommitInfo`对象的交易，该对象直接从`RequestPrepareProposal`中接收到。

按照惯例，`VoteExtsTx`交易应该是区块提案中的第一个交易，尽管链可以实现它们自己的偏好。出于安全目的，我们还建议提议者自己验证在`RequestPrepareProposal`中接收到的所有投票扩展签名。

在`RequestProcessProposal`期间，验证者将接收到包含投票扩展及其签名的`VoteExtsTx`。如果不存在这样的交易，验证者必须拒绝该提案。

当验证者检查`VoteExtsTx`时，它将评估每个`SignedVoteExtension`。对于每个已签名的投票扩展，验证者将生成签名字节并验证签名。至少需要收到2/3的有效签名（基于投票权重），才能使区块提案有效，否则验证者必须拒绝该提案。

为了能够验证签名，`BaseApp`必须能够访问`x/staking`模块，因为该模块存储了从共识地址到公钥的索引。然而，我们将避免直接依赖于`x/staking`，而是依赖于一个接口。此外，Cosmos SDK将提供一个默认的签名验证方法，应用程序可以使用该方法：

```go
type ValidatorStore interface {
	GetValidatorByConsAddr(sdk.Context, cryptotypes.Address) (cryptotypes.PubKey, error)
}

// ValidateVoteExtensions is a function that an application can execute in
// ProcessProposal to verify vote extension signatures.
func (app *BaseApp) ValidateVoteExtensions(ctx sdk.Context, currentHeight int64, extCommit abci.ExtendedCommitInfo) error {
	for _, vote := range extCommit.Votes {
		if !vote.SignedLastBlock || len(vote.VoteExtension) == 0 {
			continue
		}

		valConsAddr := cmtcrypto.Address(vote.Validator.Address)

		validator, err := app.validatorStore.GetValidatorByConsAddr(ctx, valConsAddr)
		if err != nil {
			return fmt.Errorf("failed to get validator %s for vote extension", valConsAddr)
		}

		cmtPubKey, err := validator.CmtConsPublicKey()
		if err != nil {
			return fmt.Errorf("failed to convert public key: %w", err)
		}

		if len(vote.ExtensionSignature) == 0 {
			return fmt.Errorf("received a non-empty vote extension with empty signature for validator %s", valConsAddr)
		}

		cve := cmtproto.CanonicalVoteExtension{
			Extension: vote.VoteExtension,
			Height:    currentHeight - 1, // the vote extension was signed in the previous height
			Round:     int64(extCommit.Round),
			ChainId:   app.GetChainID(),
		}

		extSignBytes, err := cosmosio.MarshalDelimited(&cve)
		if err != nil {
			return fmt.Errorf("failed to encode CanonicalVoteExtension: %w", err)
		}

		if !cmtPubKey.VerifySignature(extSignBytes, vote.ExtensionSignature) {
			return errors.New("received vote with invalid signature")
		}

		return nil
	}
}
```

一旦收到并验证了至少2/3的签名（按投票权重计算），验证者可以使用投票扩展来推导出额外的数据或根据投票扩展做出决策。

> 注意：非常重要的一点是，上述描述的投票传播技术和投票扩展验证机制对于应用程序的实现并不是必需的。换句话说，提议者不需要验证和传播带有签名的投票扩展，也不需要验证这些签名。应用程序可以实现自己的PKI机制，并使用该机制对投票扩展进行签名和验证。

#### 投票扩展持久性

在某些情况下，应用程序可能需要将从投票扩展中派生的数据持久化。为了促进这种用例，我们建议允许应用程序开发人员手动检索`finalizeState`上下文（参见下面的[`FinalizeBlock`](#finalizeblock-1)）。使用此上下文，可以直接将状态写入`finalizeState`，该状态将在`FinalizeBlock`期间使用，并最终提交到应用程序状态。请注意，由于`ProcessProposal`可能超时，因此需要另一轮共识，我们将在`ProcessProposal`开始时重置`finalizeState`。

`ProcessProposal`处理程序可能如下所示：

```go
func (h MyHandler) ProcessProposalHandler() sdk.ProcessProposalHandler {
	return func(ctx sdk.Context, req abci.RequestProcessProposal) abci.ResponseProcessProposal {
		for _, txBytes := range req.Txs {
			_, err := h.app.ProcessProposalVerifyTx(txBytes)
			if err != nil {
				return abci.ResponseProcessProposal{Status: abci.ResponseProcessProposal_REJECT}
			}
		}

		fCtx := h.app.GetFinalizeState()

		// Any state changes that occur on the provided fCtx WILL be written to state!
		h.myKeeper.SetVoteExtResult(fCtx, ...)
	
		return abci.ResponseProcessProposal{Status: abci.ResponseProcessProposal_ACCEPT}
	}
}
```

### `FinalizeBlock`

现有的ABCI方法`BeginBlock`，`DeliverTx`和`EndBlock`自ABCI应用程序诞生以来就存在。因此，应用程序、工具和开发人员已经习惯了这些方法及其用例。具体而言，`BeginBlock`和`EndBlock`在ABCI应用程序中已经变得非常重要和强大。例如，一个应用程序可能希望在执行交易之前运行与分配和通胀相关的操作，然后在执行所有交易后进行与质押相关的更改。

我们建议仅在SDK的核心模块接口中保留`BeginBlock`和`EndBlock`，以便应用程序开发人员可以继续构建现有的执行流程。但是，我们将从SDK的`BaseApp`实现以及ABCI表面删除`BeginBlock`，`DeliverTx`和`EndBlock`。

然后将存在一个单独的`FinalizeBlock`执行流程。具体而言，在`FinalizeBlock`中，我们将执行应用程序的`BeginBlock`，然后执行所有交易，最后执行应用程序的`EndBlock`。

请注意，我们仍将在`BaseApp`中保留现有的交易执行机制，但将删除所有与`DeliverTx`相关的概念，即`deliverState`将被替换为`finalizeState`，该状态将在`Commit`时提交。

然而，在现有的`BeginBlock`和`EndBlock` ABCI类型中存在当前参数和字段，例如在分发中使用的投票和在证据处理中使用的拜占庭验证器。这些参数存在于`FinalizeBlock`请求类型中，并且需要传递给应用程序对`BeginBlock`和`EndBlock`的实现。

这意味着Cosmos SDK的核心模块接口需要更新以反映这些参数。最简单和直接的方法是将`RequestFinalizeBlock`传递给`BeginBlock`和`EndBlock`。或者，我们可以在SDK中创建专用的代理类型来反映这些传统的ABCI类型，例如`LegacyBeginBlockRequest`和`LegacyEndBlockRequest`。或者，我们可以完全提出新的类型和名称。

```go
func (app *BaseApp) FinalizeBlock(req abci.RequestFinalizeBlock) abci.ResponseFinalizeBlock {
	// merge any state changes from ProcessProposal into the FinalizeBlock state
	app.MergeProcessProposalState()

	beginBlockResp := app.beginBlock(ctx, req)
	appendBlockEventAttr(beginBlockResp.Events, "begin_block")

	txExecResults := make([]abci.ExecTxResult, 0, len(req.Txs))
	for _, tx := range req.Txs {
		result := app.runTx(runTxModeFinalize, tx)
		txExecResults = append(txExecResults, result)
	}

	endBlockResp := app.endBlock(ctx, req)
	appendBlockEventAttr(beginBlockResp.Events, "end_block")

	return abci.ResponseFinalizeBlock{
		TxResults:             txExecResults,
		Events:                joinEvents(beginBlockResp.Events, endBlockResp.Events),
		ValidatorUpdates:      endBlockResp.ValidatorUpdates,
		ConsensusParamUpdates: endBlockResp.ConsensusParamUpdates,
		AppHash:               nil,
	}
}
```

#### 事件

许多工具、索引器和生态系统库依赖于`BeginBlock`和`EndBlock`事件的存在。由于CometBFT现在只公开`FinalizeBlockEvents`，我们发现对于这些客户端和工具来说，仍然查询和依赖于现有事件仍然很有用，特别是因为应用程序仍然会定义`BeginBlock`和`EndBlock`的实现。

为了方便现有的事件功能，我们建议所有的`BeginBlock`和`EndBlock`事件都有一个专用的`EventAttribute`，其中`key=block`，`value=begin_block|end_block`。`EventAttribute`将附加到`BeginBlock`和`EndBlock`事件的每个事件中。

### 升级

CometBFT定义了一个共识参数，[`VoteExtensionsEnableHeight`](https://github.com/cometbft/cometbft/blob/v0.38.0-alpha.1/spec/abci/abci%2B%2B_app_requirements.md#abciparamsvoteextensionsenableheight)，它指定启用和**必需**投票扩展的高度。如果值设置为零，即默认值，则禁用投票扩展，应用程序不需要实现和使用投票扩展。

然而，如果值`H`为正数，则在大于配置的高度`H`的所有高度上，投票扩展必须存在（即使为空）。当达到配置的高度`H`时，`PrepareProposal`将不包括投票扩展，但将调用`ExtendVote`和`VerifyVoteExtension`。然后，当达到高度`H+1`时，`PrepareProposal`将包括来自高度`H`的投票扩展。

请注意，对于高度 H 之后的所有高度：

- 无法禁用投票扩展
- 它们是强制性的，即所有发送的预提交消息必须附带扩展（即使为空）

当应用程序升级到支持 CometBFT v0.38 的 Cosmos SDK 版本时，在升级处理程序中必须确保将共识参数 `VoteExtensionsEnableHeight` 设置为正确的值。例如，如果应用程序设置在高度 `H` 执行升级，则 `VoteExtensionsEnableHeight` 的值应设置为 `>=H+1` 的任何值。这意味着在升级高度 `H` 时，投票扩展尚未启用，但在高度 `H+1` 时将启用。

## 影响

### 向后兼容性

ABCI 2.0 自然与 Cosmos SDK 和 CometBFT 的早期版本不兼容。例如，向不支持 ABCI 2.0 的同一应用程序请求 `RequestFinalizeBlock` 将自然失败。

此外，`BeginBlock`、`DeliverTx` 和 `EndBlock` 将从应用程序 ABCI 接口中删除，并且模块接口中的输入和输出也将被修改。

### 积极影响

* `BeginBlock` 和 `EndBlock` 的语义保持不变，因此应用程序开发人员的负担应该有限。
* 通信开销较小，因为多个 ABCI 请求被合并为单个请求。
* 为乐观执行奠定了基础。
* 投票扩展允许开发全新的应用程序原语，例如进程内价格预言机和加密内存池。

### 负面影响

* 某些现有的 Cosmos SDK 核心 API 可能需要修改，因此可能会出现问题。
* 在 `ProcessProposal` 中对 100+ 个投票扩展签名进行签名验证将给 `ProcessProposal` 带来显著的性能开销。当然，签名验证过程可以使用 `GOMAXPROCS` 个 goroutine 并发进行。

### 中性影响

* 在 `PrepareProposal` 过程中手动“注入”投票扩展到区块提案是一种笨拙的方法，并且会不必要地占用区块空间。
* `ResetProcessProposalState` 的要求可能会给应用程序开发人员带来麻烦，但这是为了使应用程序能够提交来自投票扩展计算的状态。

## 进一步讨论

未来的讨论包括ABCI 3.0的设计和实现，这是ABCI++的延续，以及对乐观执行的一般讨论。

## 参考资料

* [ADR 060: ABCI 1.0 (第一阶段)](adr-060-abci-1.0.md)


# ADR 64: ABCI 2.0 Integration (Phase II)

## Changelog

* 2023-01-17: Initial Draft (@alexanderbez)
* 2023-04-06: Add upgrading section (@alexanderbez)
* 2023-04-10: Simplify vote extension state persistence (@alexanderbez)

## Status

ACCEPTED

## Abstract

This ADR outlines the continuation of the efforts to implement ABCI++ in the Cosmos
SDK outlined in [ADR 060: ABCI 1.0 (Phase I)](adr-060-abci-1.0.md).

Specifically, this ADR outlines the design and implementation of ABCI 2.0, which
includes `ExtendVote`, `VerifyVoteExtension` and `FinalizeBlock`.

## Context

ABCI 2.0 continues the promised updates from ABCI++, specifically three additional
ABCI methods that the application can implement in order to gain further control,
insight and customization of the consensus process, unlocking many novel use-cases
that previously not possible. We describe these three new methods below:

### `ExtendVote`

This method allows each validator process to extend the pre-commit phase of the
CometBFT consensus process. Specifically, it allows the application to perform
custom business logic that extends the pre-commit vote and supply additional data
as part of the vote, although they are signed separately by the same key.

The data, called vote extension, will be broadcast and received together with the
vote it is extending, and will be made available to the application in the next
height. Specifically, the proposer of the next block will receive the vote extensions
in `RequestPrepareProposal.local_last_commit.votes`.

If the application does not have vote extension information to provide, it
returns a 0-length byte array as its vote extension.

**NOTE**: 

* Although each validator process submits its own vote extension, ONLY the *proposer*
  of the *next* block will receive all the vote extensions included as part of the
  pre-commit phase of the previous block. This means only the proposer will
  implicitly have access to all the vote extensions, via `RequestPrepareProposal`,
  and that not all vote extensions may be included, since a validator does not
  have to wait for all pre-commits, only 2/3.
* The pre-commit vote is signed independently from the vote extension.

### `VerifyVoteExtension`

This method allows validators to validate the vote extension data attached to
each pre-commit message it receives. If the validation fails, the whole pre-commit
message will be deemed invalid and ignored by CometBFT.

CometBFT uses `VerifyVoteExtension` when validating a pre-commit vote. Specifically,
for a pre-commit, CometBFT will:

* Reject the message if it doesn't contain a signed vote AND a signed vote extension
* Reject the message if the vote's signature OR the vote extension's signature fails to verify
* Reject the message if `VerifyVoteExtension` was rejected by the app

Otherwise, CometBFT will accept the pre-commit message.

Note, this has important consequences on liveness, i.e., if vote extensions repeatedly
cannot be verified by correct validators, CometBFT may not be able to finalize
a block even if sufficiently many (+2/3) validators send pre-commit votes for
that block. Thus, `VerifyVoteExtension` should be used with special care.

CometBFT recommends that an application that detects an invalid vote extension
SHOULD accept it in `ResponseVerifyVoteExtension` and ignore it in its own logic.

### `FinalizeBlock`

This method delivers a decided block to the application. The application must
execute the transactions in the block deterministically and update its state
accordingly. Cryptographic commitments to the block and transaction results,
returned via the corresponding parameters in `ResponseFinalizeBlock`, are
included in the header of the next block. CometBFT calls it when a new block
is decided.

In other words, `FinalizeBlock` encapsulates the current ABCI execution flow of
`BeginBlock`, one or more `DeliverTx`, and `EndBlock` into a single ABCI method.
CometBFT will no longer execute requests for these legacy methods and instead
will just simply call `FinalizeBlock`.

## Decision

We will discuss changes to the Cosmos SDK to implement ABCI 2.0 in two distinct
phases, `VoteExtensions` and `FinalizeBlock`.

### `VoteExtensions`

Similarly for `PrepareProposal` and `ProcessProposal`, we propose to introduce
two new handlers that an application can implement in order to provide and verify
vote extensions.

We propose the following new handlers for applications to implement:

```go
type ExtendVoteHandler func(sdk.Context, abci.RequestExtendVote) abci.ResponseExtendVote
type VerifyVoteExtensionHandler func(sdk.Context, abci.RequestVerifyVoteExtension) abci.ResponseVerifyVoteExtension
```

A new execution state, `voteExtensionState`, will be introduced and provided as
the `Context` that is supplied to both handlers. It will contain relevant metadata
such as the block height and block hash. Note, `voteExtensionState` is never
committed and will exist as ephemeral state only in the context of a single block.

If an application decides to implement `ExtendVoteHandler`, it must return a
non-nil `ResponseExtendVote.VoteExtension`.

Recall, an implementation of `ExtendVoteHandler` does NOT need to be deterministic,
however, given a set of vote extensions, `VerifyVoteExtensionHandler` must be
deterministic, otherwise the chain may suffer from liveness faults. In addition,
recall CometBFT proceeds in rounds for each height, so if a decision cannot be
made about about a block proposal at a given height, CometBFT will proceed to the
next round and thus will execute `ExtendVote` and `VerifyVoteExtension` again for
the new round for each validator until 2/3 valid pre-commits can be obtained.

Given the broad scope of potential implementations and use-cases of vote extensions,
and how to verify them, most applications should choose to implement the handlers
through a single handler type, which can have any number of dependencies injected
such as keepers. In addition, this handler type could contain some notion of
volatile vote extension state management which would assist in vote extension
verification. This state management could be ephemeral or could be some form of
on-disk persistence.

Example:

```go
// VoteExtensionHandler implements an Oracle vote extension handler.
type VoteExtensionHandler struct {
	cdc   Codec
	mk    MyKeeper
	state VoteExtState // This could be a map or a DB connection object
}

// ExtendVoteHandler can do something with h.mk and possibly h.state to create
// a vote extension, such as fetching a series of prices for supported assets.
func (h VoteExtensionHandler) ExtendVoteHandler(ctx sdk.Context, req abci.RequestExtendVote) abci.ResponseExtendVote {
	prices := GetPrices(ctx, h.mk.Assets())
	bz, err := EncodePrices(h.cdc, prices)
	if err != nil {
		panic(fmt.Errorf("failed to encode prices for vote extension: %w", err))
	}

	// store our vote extension at the given height
	//
	// NOTE: Vote extensions can be overridden since we can timeout in a round.
	SetPrices(h.state, req, bz)

	return abci.ResponseExtendVote{VoteExtension: bz}
}

// VerifyVoteExtensionHandler can do something with h.state and req to verify
// the req.VoteExtension field, such as ensuring the provided oracle prices are
// within some valid range of our prices.
func (h VoteExtensionHandler) VerifyVoteExtensionHandler(ctx sdk.Context, req abci.RequestVerifyVoteExtension) abci.ResponseVerifyVoteExtension {
	prices, err := DecodePrices(h.cdc, req.VoteExtension)
	if err != nil {
		log("failed to decode vote extension", "err", err)
		return abci.ResponseVerifyVoteExtension{Status: REJECT}
	}

	if err := ValidatePrices(h.state, req, prices); err != nil {
		log("failed to validate vote extension", "prices", prices, "err", err)
		return abci.ResponseVerifyVoteExtension{Status: REJECT}
	}

	// store updated vote extensions at the given height
	//
	// NOTE: Vote extensions can be overridden since we can timeout in a round.
	SetPrices(h.state, req, req.VoteExtension)

	return abci.ResponseVerifyVoteExtension{Status: ACCEPT}
}
```

#### Vote Extension Propagation & Verification

As mentioned previously, vote extensions for height `H` are only made available
to the proposer at height `H+1` during `PrepareProposal`. However, in order to
make vote extensions useful, all validators should have access to the agreed upon
vote extensions at height `H` during `H+1`.

Since CometBFT includes all the vote extension signatures in `RequestPrepareProposal`,
we propose that the proposing validator manually "inject" the vote extensions
along with their respective signatures via a special transaction, `VoteExtsTx`,
into the block proposal during `PrepareProposal`. The `VoteExtsTx` will be
populated with a single `ExtendedCommitInfo` object which is received directly
from `RequestPrepareProposal`.

For convention, the `VoteExtsTx` transaction should be the first transaction in
the block proposal, although chains can implement their own preferences. For
safety purposes, we also propose that the proposer itself verify all the vote
extension signatures it receives in `RequestPrepareProposal`.

A validator, upon a `RequestProcessProposal`, will receive the injected `VoteExtsTx`
which includes the vote extensions along with their signatures. If no such transaction
exists, the validator MUST REJECT the proposal.

When a validator inspects a `VoteExtsTx`, it will evaluate each `SignedVoteExtension`.
For each signed vote extension, the validator will generate the signed bytes and
verify the signature. At least 2/3 valid signatures, based on voting power, must
be received in order for the block proposal to be valid, otherwise the validator
MUST REJECT the proposal.

In order to have the ability to validate signatures, `BaseApp` must have access
to the `x/staking` module, since this module stores an index from consensus
address to public key. However, we will avoid a direct dependency on `x/staking`
and instead rely on an interface instead. In addition, the Cosmos SDK will expose
a default signature verification method which applications can use:

```go
type ValidatorStore interface {
	GetValidatorByConsAddr(sdk.Context, cryptotypes.Address) (cryptotypes.PubKey, error)
}

// ValidateVoteExtensions is a function that an application can execute in
// ProcessProposal to verify vote extension signatures.
func (app *BaseApp) ValidateVoteExtensions(ctx sdk.Context, currentHeight int64, extCommit abci.ExtendedCommitInfo) error {
	for _, vote := range extCommit.Votes {
		if !vote.SignedLastBlock || len(vote.VoteExtension) == 0 {
			continue
		}

		valConsAddr := cmtcrypto.Address(vote.Validator.Address)

		validator, err := app.validatorStore.GetValidatorByConsAddr(ctx, valConsAddr)
		if err != nil {
			return fmt.Errorf("failed to get validator %s for vote extension", valConsAddr)
		}

		cmtPubKey, err := validator.CmtConsPublicKey()
		if err != nil {
			return fmt.Errorf("failed to convert public key: %w", err)
		}

		if len(vote.ExtensionSignature) == 0 {
			return fmt.Errorf("received a non-empty vote extension with empty signature for validator %s", valConsAddr)
		}

		cve := cmtproto.CanonicalVoteExtension{
			Extension: vote.VoteExtension,
			Height:    currentHeight - 1, // the vote extension was signed in the previous height
			Round:     int64(extCommit.Round),
			ChainId:   app.GetChainID(),
		}

		extSignBytes, err := cosmosio.MarshalDelimited(&cve)
		if err != nil {
			return fmt.Errorf("failed to encode CanonicalVoteExtension: %w", err)
		}

		if !cmtPubKey.VerifySignature(extSignBytes, vote.ExtensionSignature) {
			return errors.New("received vote with invalid signature")
		}

		return nil
	}
}
```

Once at least 2/3 signatures, by voting power, are received and verified, the
validator can use the vote extensions to derive additional data or come to some
decision based on the vote extensions.

> NOTE: It is very important to state, that neither the vote propagation technique
> nor the vote extension verification mechanism described above is required for
> applications to implement. In other words, a proposer is not required to verify
> and propagate vote extensions along with their signatures nor are proposers
> required to verify those signatures. An application can implement it's own
> PKI mechanism and use that to sign and verify vote extensions.

#### Vote Extension Persistence

In certain contexts, it may be useful or necessary for applications to persist
data derived from vote extensions. In order to facilitate this use case, we
propose to allow application developers to manually retrieve the `finalizeState`
context (see [`FinalizeBlock`](#finalizeblock-1) below). Using this context,
state can be directly written to `finalizeState`, which will be used during
`FinalizeBlock` and eventually committed to the application state. Note, since
`ProcessProposal` can timeout and thus require another round of consensus, we
will reset `finalizeState` in the beginning of `ProcessProposal`.

A `ProcessProposal` handler could look like the following:

```go
func (h MyHandler) ProcessProposalHandler() sdk.ProcessProposalHandler {
	return func(ctx sdk.Context, req abci.RequestProcessProposal) abci.ResponseProcessProposal {
		for _, txBytes := range req.Txs {
			_, err := h.app.ProcessProposalVerifyTx(txBytes)
			if err != nil {
				return abci.ResponseProcessProposal{Status: abci.ResponseProcessProposal_REJECT}
			}
		}

		fCtx := h.app.GetFinalizeState()

		// Any state changes that occur on the provided fCtx WILL be written to state!
		h.myKeeper.SetVoteExtResult(fCtx, ...)
	
		return abci.ResponseProcessProposal{Status: abci.ResponseProcessProposal_ACCEPT}
	}
}
```

### `FinalizeBlock`

The existing ABCI methods `BeginBlock`, `DeliverTx`, and `EndBlock` have existed
since the dawn of ABCI-based applications. Thus, applications, tooling, and developers
have grown used to these methods and their use-cases. Specifically, `BeginBlock`
and `EndBlock` have grown to be pretty integral and powerful within ABCI-based
applications. E.g. an application might want to run distribution and inflation
related operations prior to executing transactions and then have staking related
changes to happen after executing all transactions.

We propose to keep `BeginBlock` and `EndBlock` within the SDK's core module
interfaces only so application developers can continue to build against existing
execution flows. However, we will remove `BeginBlock`, `DeliverTx` and `EndBlock`
from the SDK's `BaseApp` implementation and thus the ABCI surface area.

What will then exist is a single `FinalizeBlock` execution flow. Specifically, in
`FinalizeBlock` we will execute the application's `BeginBlock`, followed by
execution of all the transactions, finally followed by execution of the application's
`EndBlock`.

Note, we will still keep the existing transaction execution mechanics within
`BaseApp`, but all notions of `DeliverTx` will be removed, i.e. `deliverState`
will be replace with `finalizeState`, which will be committed on `Commit`.

However, there are current parameters and fields that exist in the existing
`BeginBlock` and `EndBlock` ABCI types, such as votes that are used in distribution
and byzantine validators used in evidence handling. These parameters exist in the
`FinalizeBlock` request type, and will need to be passed to the application's
implementations of `BeginBlock` and `EndBlock`.

This means the Cosmos SDK's core module interfaces will need to be updated to
reflect these parameters. The easiest and most straightforward way to achieve
this is to just pass `RequestFinalizeBlock` to `BeginBlock` and `EndBlock`.
Alternatively, we can create dedicated proxy types in the SDK that reflect these
legacy ABCI types, e.g. `LegacyBeginBlockRequest` and `LegacyEndBlockRequest`. Or,
we can come up with new types and names altogether.

```go
func (app *BaseApp) FinalizeBlock(req abci.RequestFinalizeBlock) abci.ResponseFinalizeBlock {
	// merge any state changes from ProcessProposal into the FinalizeBlock state
	app.MergeProcessProposalState()

	beginBlockResp := app.beginBlock(ctx, req)
	appendBlockEventAttr(beginBlockResp.Events, "begin_block")

	txExecResults := make([]abci.ExecTxResult, 0, len(req.Txs))
	for _, tx := range req.Txs {
		result := app.runTx(runTxModeFinalize, tx)
		txExecResults = append(txExecResults, result)
	}

	endBlockResp := app.endBlock(ctx, req)
	appendBlockEventAttr(beginBlockResp.Events, "end_block")

	return abci.ResponseFinalizeBlock{
		TxResults:             txExecResults,
		Events:                joinEvents(beginBlockResp.Events, endBlockResp.Events),
		ValidatorUpdates:      endBlockResp.ValidatorUpdates,
		ConsensusParamUpdates: endBlockResp.ConsensusParamUpdates,
		AppHash:               nil,
	}
}
```

#### Events

Many tools, indexers and ecosystem libraries rely on the existence `BeginBlock`
and `EndBlock` events. Since CometBFT now only exposes `FinalizeBlockEvents`, we
find that it will still be useful for these clients and tools to still query for
and rely on existing events, especially since applications will still define
`BeginBlock` and `EndBlock` implementations.

In order to facilitate existing event functionality, we propose that all `BeginBlock`
and `EndBlock` events have a dedicated `EventAttribute` with `key=block` and
`value=begin_block|end_block`. The `EventAttribute` will be appended to each event
in both `BeginBlock` and `EndBlock` events`. 


### Upgrading

CometBFT defines a consensus parameter, [`VoteExtensionsEnableHeight`](https://github.com/cometbft/cometbft/blob/v0.38.0-alpha.1/spec/abci/abci%2B%2B_app_requirements.md#abciparamsvoteextensionsenableheight),
which specifies the height at which vote extensions are enabled and **required**.
If the value is set to zero, which is the default, then vote extensions are
disabled and an application is not required to implement and use vote extensions.

However, if the value `H` is positive, at all heights greater than the configured
height `H` vote extensions must be present (even if empty). When the configured
height `H` is reached, `PrepareProposal` will not include vote extensions yet,
but `ExtendVote` and `VerifyVoteExtension` will be called. Then, when reaching
height `H+1`, `PrepareProposal` will include the vote extensions from height `H`.

It is very important to note, for all heights after H:

* Vote extensions CANNOT be disabled
* They are mandatory, i.e. all pre-commit messages sent MUST have an extension
  attached (even if empty)

When an application updates to the Cosmos SDK version with CometBFT v0.38 support,
in the upgrade handler it must ensure to set the consensus parameter
`VoteExtensionsEnableHeight` to the correct value. E.g. if an application is set
to perform an upgrade at height `H`, then the value of `VoteExtensionsEnableHeight`
should be set to any value `>=H+1`. This means that at the upgrade height, `H`,
vote extensions will not be enabled yet, but at height `H+1` they will be enabled.

## Consequences

### Backwards Compatibility

ABCI 2.0 is naturally not backwards compatible with prior versions of the Cosmos SDK
and CometBFT. For example, an application that requests `RequestFinalizeBlock`
to the same application that does not speak ABCI 2.0 will naturally fail.

In addition, `BeginBlock`, `DeliverTx` and `EndBlock` will be removed from the
application ABCI interfaces and along with the inputs and outputs being modified
in the module interfaces.

### Positive

* `BeginBlock` and `EndBlock` semantics remain, so burden on application developers
  should be limited.
* Less communication overhead as multiple ABCI requests are condensed into a single
  request.
* Sets the groundwork for optimistic execution.
* Vote extensions allow for an entirely new set of application primitives to be
  developed, such as in-process price oracles and encrypted mempools.

### Negative

* Some existing Cosmos SDK core APIs may need to be modified and thus broken.
* Signature verification in `ProcessProposal` of 100+ vote extension signatures
  will add significant performance overhead to `ProcessProposal`. Granted, the
	signature verification process can happen concurrently using an error group
	with `GOMAXPROCS` goroutines.

### Neutral

* Having to manually "inject" vote extensions into the block proposal during
  `PrepareProposal` is an awkward approach and takes up block space unnecessarily.
* The requirement of `ResetProcessProposalState` can create a footgun for
  application developers if they're not careful, but this is necessary in order
	for applications to be able to commit state from vote extension computation.

## Further Discussions

Future discussions include design and implementation of ABCI 3.0, which is a
continuation of ABCI++ and the general discussion of optimistic execution.

## References

* [ADR 060: ABCI 1.0 (Phase I)](adr-060-abci-1.0.md)
