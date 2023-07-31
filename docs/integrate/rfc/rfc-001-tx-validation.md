# RFC 001: 交易验证

## 变更日志

* 2023-03-12: 提议

## 背景

交易验证对于一个正常运行的状态机至关重要。在 Cosmos SDK 中，有两种验证流程，一种是在消息服务器外部，另一种是在内部。消息服务器外部的流程是 `ValidateBasic` 函数。它在 `CheckTx` 和 `DeliverTx` 的 antehandler 中被调用。这两个流程中存在额外的验证开销和有时重复验证的情况。这种额外的验证在进入内存池之前提供了额外的检查。

随着 [`GetSigners`](https://github.com/cosmos/cosmos-sdk/issues/11275) 的弃用，我们有选择性地移除了 [sdk.Msg](https://github.com/cosmos/cosmos-sdk/blob/16a5404f8e00ddcf8857c8a55dca2f7c109c29bc/types/tx_msg.go#L16) 和 `ValidateBasic` 函数。

在 CometBFT 和 Cosmos-SDK 的分离中，缺乏对广播和包含在区块中的交易的控制。antehandler 中的这种额外验证旨在帮助解决这个问题。在大多数情况下，交易会被模拟针对一个节点进行验证。通过这种流程，交易将被同等对待。

## 提议

接受此 RFC 将会将 `ValidateBasic` 中的验证移动到模块中的消息服务器，更新教程和文档，删除对使用 `ValidateBasic` 的提及，而是处理在执行消息时的所有验证。

我们仍然可以并将继续支持用户使用 `Validatebasic` 函数，并在 `sdk.Msg` 被弃用后提供该函数的扩展接口。

> 注意：这是以太坊和 CosmWasm 等虚拟机中处理消息的方式。

### 结果

更新交易流程的结果是，之前可能因为 `ValidateBasic` 流程而失败的交易现在将被包含在一个区块中，并收取费用。


# RFC 001: Transaction Validation

## Changelog

* 2023-03-12: Proposed

## Background

Transation Validation is crucial to a functioning state machine. Within the Cosmos SDK there are two validation flows, one is outside the message server and the other within. The flow outside of the message server is the `ValidateBasic` function. It is called in the antehandler on both `CheckTx` and `DeliverTx`. There is an overhead and sometimes duplication of validation within these two flows. This extra validation provides an additional check before entering the mempool.

With the deprecation of [`GetSigners`](https://github.com/cosmos/cosmos-sdk/issues/11275) we have the optionality to remove [sdk.Msg](https://github.com/cosmos/cosmos-sdk/blob/16a5404f8e00ddcf8857c8a55dca2f7c109c29bc/types/tx_msg.go#L16) and the `ValidateBasic` function. 

With the separation of CometBFT and Cosmos-SDK, there is a lack of control of what transactions get broadcasted and included in a block. This extra validation in the antehandler is meant to help in this case. In most cases the transaction is or should be simulated against a node for validation. With this flow transactions will be treated the same. 

## Proposal

The acceptance of this RFC would move validation within `ValidateBasic` to the message server in modules, update tutorials and docs to remove mention of using `ValidateBasic` in favour of handling all validation for a message where it is executed.

We can and will still support the `Validatebasic` function for users and provide an extension interface of the function once `sdk.Msg` is depreacted. 

> Note: This is how messages are handled in VMs like Ethereum and CosmWasm. 

### Consequences

The consequence of updating the transaction flow is that transaction that may have failed before with the `ValidateBasic` flow will now be included in a block and fees charged. 
