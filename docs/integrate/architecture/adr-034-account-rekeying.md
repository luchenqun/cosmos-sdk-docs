# ADR 034: 账户重新密钥

## 变更日志

* 2020年9月30日：初稿

## 状态

提议中

## 摘要

账户重新密钥是一个过程，允许账户用新的身份验证公钥替换其原有的公钥。

## 背景

目前，在 Cosmos SDK 中，auth `BaseAccount` 的地址是基于公钥的哈希值。一旦创建了一个账户，该账户的公钥就无法更改。这对用户来说可能是一个问题，因为密钥轮换是一种有用的安全实践，但目前无法实现。此外，由于多重签名是一种公钥类型，一旦为账户设置了多重签名，就无法更新。这是一个问题，因为多重签名通常由组织或公司使用，他们可能因内部原因需要更改其多重签名签署者的集合。

将账户的所有资产转移到具有更新的公钥的新账户是不够的，因为账户的某些“参与”是不容易转移的。例如，在质押中，要转移质押的 Atoms，账户必须解除所有委托，并等待三周的解绑期。更重要的是，对于验证人操作者来说，对验证人的所有权根本无法转移，这意味着验证人的操作者密钥永远无法更新，从而导致验证人的操作安全性较差。

## 决策

我们提议在 `x/auth` 中添加一个新功能，允许账户更新与其账户关联的公钥，同时保持地址不变。

这是可能的，因为 Cosmos SDK 的 `BaseAccount` 将账户的公钥存储在状态中，而不是像比特币和以太坊等其他区块链那样假设公钥包含在交易中（无论是显式还是隐式通过签名）。因为公钥存储在链上，所以公钥不需要哈希为账户的地址，因为地址与签名检查过程无关。

为了构建这个系统，我们设计了一个新的 Msg 类型，如下所示：

```protobuf
service Msg {
    rpc ChangePubKey(MsgChangePubKey) returns (MsgChangePubKeyResponse);
}

message MsgChangePubKey {
  string address = 1;
  google.protobuf.Any pub_key = 2;
}

message MsgChangePubKeyResponse {}
```

MsgChangePubKey交易需要由状态中的现有公钥进行签名。

一旦获得批准，处理此消息类型的处理程序将使用AccountKeeper更新帐户的状态中的公钥，并将其替换为来自Msg的公钥。

已更改公钥的帐户无法自动从状态中删除。这是因为如果删除，将需要原始帐户的公钥来重新创建相同的地址，但地址的所有者可能不再拥有原始公钥。目前，我们不会自动删除任何帐户，但我们希望保持这个选项开放（这是帐户编号的目的）。为了解决这个问题，我们对此操作收取额外的gas费用，以补偿这个外部性（此绑定的gas数量配置为参数`PubKeyChangeCost`）。奖励的gas在处理程序内部收取，使用`ConsumeGas`函数。此外，将来，我们可以允许已重新设置密钥的帐户使用新的Msg类型（例如`MsgDeleteAccount`）手动删除自己。手动删除帐户可以提供gas退款作为执行操作的激励。

```go
	amount := ak.GetParams(ctx).PubKeyChangeCost
	ctx.GasMeter().ConsumeGas(amount, "pubkey change fee")
```

每当更改地址的密钥时，我们将在链的状态中存储此更改的日志，从而创建地址的所有先前密钥的堆栈以及它们处于活动状态的时间间隔。这使得dapp和客户端可以轻松查询帐户的过去密钥，这对于验证时间戳的链下签名消息等功能可能很有用。

## 后果

### 积极影响

* 将允许用户和验证器操作员使用密钥轮换的更好操作安全性实践。
* 将允许组织或团体轻松更改和添加/删除多签名签名者。

### 负面影响

打破了地址和公钥之间的当前假设关系，即 H(pubkey) = address。这有一些后果。
```

* 这使得支持此功能的钱包更加复杂。例如，如果链上的地址被更新，CLI钱包中对应的密钥也需要被更新。
* 无法自动删除余额为0且公钥已更改的账户。

### 中立

* 虽然这个功能的目的是允许账户的所有者更新为自己拥有的新公钥，但从技术上讲，这也可以用于将账户的所有权转移给新的所有者。例如，这可以用于出售已抵押的仓位而无需解除抵押，或者用于拥有锁定期代币的账户。然而，这样做的摩擦非常大，因为实际上必须以非常具体的场外交易方式进行。此外，可以添加额外的约束条件以防止拥有锁定期代币的账户使用此功能。
* 需要在创世导出中包含账户的公钥。

## 参考资料

* https://www.algorand.com/resources/blog/announcing-rekeying


# ADR 034: Account Rekeying

## Changelog

* 30-09-2020: Initial Draft

## Status

PROPOSED

## Abstract

Account rekeying is a process hat allows an account to replace its authentication pubkey with a new one.

## Context

Currently, in the Cosmos SDK, the address of an auth `BaseAccount` is based on the hash of the public key.  Once an account is created, the public key for the account is set in stone, and cannot be changed.  This can be a problem for users, as key rotation is a useful security practice, but is not possible currently.  Furthermore, as multisigs are a type of pubkey, once a multisig for an account is set, it can not be updated.  This is problematic, as multisigs are often used by organizations or companies, who may need to change their set of multisig signers for internal reasons.

Transferring all the assets of an account to a new account with the updated pubkey is not sufficient, because some "engagements" of an account are not easily transferable.  For example, in staking, to transfer bonded Atoms, an account would have to unbond all delegations and wait the three week unbonding period.  Even more significantly, for validator operators, ownership over a validator is not transferrable at all, meaning that the operator key for a validator can never be updated, leading to poor operational security for validators.

## Decision

We propose the addition of a new feature to `x/auth` that allows accounts to update the public key associated with their account, while keeping the address the same.

This is possible because the Cosmos SDK `BaseAccount` stores the public key for an account in state, instead of making the assumption that the public key is included in the transaction (whether explicitly or implicitly through the signature) as in other blockchains such as Bitcoin and Ethereum.  Because the public key is stored on chain, it is okay for the public key to not hash to the address of an account, as the address is not pertinent to the signature checking process.

To build this system, we design a new Msg type as follows:

```protobuf
service Msg {
    rpc ChangePubKey(MsgChangePubKey) returns (MsgChangePubKeyResponse);
}

message MsgChangePubKey {
  string address = 1;
  google.protobuf.Any pub_key = 2;
}

message MsgChangePubKeyResponse {}
```

The MsgChangePubKey transaction needs to be signed by the existing pubkey in state.

Once, approved, the handler for this message type, which takes in the AccountKeeper, will update the in-state pubkey for the account and replace it with the pubkey from the Msg.

An account that has had its pubkey changed cannot be automatically pruned from state.  This is because if pruned, the original pubkey of the account would be needed to recreate the same address, but the owner of the address may not have the original pubkey anymore.  Currently, we do not automatically prune any accounts anyways, but we would like to keep this option open the road (this is the purpose of account numbers).  To resolve this, we charge an additional gas fee for this operation to compensate for this this externality (this bound gas amount is configured as parameter `PubKeyChangeCost`). The bonus gas is charged inside the handler, using the `ConsumeGas` function.  Furthermore, in the future, we can allow accounts that have rekeyed manually prune themselves using a new Msg type such as `MsgDeleteAccount`.  Manually pruning accounts can give a gas refund as an incentive for performing the action.

```go
	amount := ak.GetParams(ctx).PubKeyChangeCost
	ctx.GasMeter().ConsumeGas(amount, "pubkey change fee")
```

Everytime a key for an address is changed, we will store a log of this change in the state of the chain, thus creating a stack of all previous keys for an address and the time intervals for which they were active.  This allows dapps and clients to easily query past keys for an account which may be useful for features such as verifying timestamped off-chain signed messages.

## Consequences

### Positive

* Will allow users and validator operators to employ better operational security practices with key rotation.
* Will allow organizations or groups to easily change and add/remove multisig signers.

### Negative

Breaks the current assumed relationship between address and pubkeys as H(pubkey) = address. This has a couple of consequences.

* This makes wallets that support this feature more complicated. For example, if an address on chain was updated, the corresponding key in the CLI wallet also needs to be updated.
* Cannot automatically prune accounts with 0 balance that have had their pubkey changed.

### Neutral

* While the purpose of this is intended to allow the owner of an account to update to a new pubkey they own, this could technically also be used to transfer ownership of an account to a new owner.  For example, this could be use used to sell a staked position without unbonding or an account that has vesting tokens.  However, the friction of this is very high as this would essentially have to be done as a very specific OTC trade. Furthermore, additional constraints could be added to prevent accouns with Vesting tokens to use this feature.
* Will require that PubKeys for an account are included in the genesis exports.

## References

* https://www.algorand.com/resources/blog/announcing-rekeying
