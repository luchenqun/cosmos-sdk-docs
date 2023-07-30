# ADR 016: 验证人共识密钥轮换

## 更新日志

* 2019年10月23日：初稿
* 2019年11月28日：添加密钥轮换费用

## 背景

验证人共识密钥轮换功能已经讨论和请求了很长时间，为了更安全的验证人密钥管理策略（例如：https://github.com/tendermint/tendermint/issues/1136）。因此，我们建议在Cosmos SDK上实现验证人共识密钥轮换的最简形式。

我们不需要在Tendermint的共识逻辑上进行任何更新，因为Tendermint没有任何映射共识密钥和验证人操作密钥的信息，这意味着从Tendermint的角度来看，验证人的共识密钥轮换只是将一个共识密钥替换为另一个。

此外，需要注意的是，本ADR仅包括最简形式的共识密钥轮换，不考虑多个共识密钥的概念。这种多个共识密钥的概念应该作为Tendermint和Cosmos SDK的长期目标。

## 决策

### 共识密钥轮换的伪过程

* 创建新的随机共识密钥。
* 创建并广播一笔交易，其中包含一个`MsgRotateConsPubKey`，声明新的共识密钥现在与验证人操作密钥配对，并由验证人的操作密钥签名。
* 在链上更新密钥映射状态后，旧的共识密钥立即无法参与共识。
* 使用新的共识密钥进行验证。
* 使用HSM和KMS的验证人应该在高度`h`之后更新HSM中的共识密钥，以使用新的轮换密钥，此时`MsgRotateConsPubKey`已经提交到区块链。

### 考虑因素

* 共识密钥映射信息管理策略
    * 在kvstore中存储每个密钥映射更改的历史记录。
    * 状态机可以在最近的解绑期内搜索与给定验证人操作密钥配对的相应共识密钥，以任意高度。
    * 状态机不需要任何超过解绑期的历史映射信息。
* 与LCD和IBC相关的密钥轮换成本
    * 当存在频繁的权力更改时，LCD和IBC将承担流量/计算负担。
    * 在当前的Tendermint设计中，共识密钥轮换被视为来自LCD或IBC的权力更改。
    * 因此，为了最小化不必要的频繁密钥轮换行为，我们限制了最近解绑期内的最大轮换次数，并且应用了指数增加的轮换费用。
* 限制
    * 验证人在任何解绑期内不能轮换其共识密钥超过`MaxConsPubKeyRotations`次，以防止垃圾邮件。
    * 参数可以由治理决定并存储在创世文件中。
* 密钥轮换费用
    * 验证人应支付`KeyRotationFee`来轮换共识密钥，计算如下
    * `KeyRotationFee` = (max(`VotingPowerPercentage` *100, 1)* `InitialKeyRotationFee`) * 2^(最近解绑期内`ConsPubKeyRotationHistory`中的轮换次数)
* 证据模块
    * 证据模块可以通过惩罚保管者从任意高度搜索相应的共识密钥，以便决定给定高度应该使用哪个共识密钥。
* abci.ValidatorUpdate
    * Tendermint已经通过ABCI通信（`ValidatorUpdate`）具备更改共识密钥的能力。
    * 验证人共识密钥的更新可以通过创建新的+删除旧的，将权力更改为零来完成。
    * 因此，我们预计实现此功能时甚至不需要改变Tendermint的代码库。
* `staking`模块中的新创世参数
    * `MaxConsPubKeyRotations`：验证人在最近解绑期内可以执行的最大轮换次数。建议默认值为10（第11次密钥轮换将被拒绝）。
    * `InitialKeyRotationFee`：在最近解绑期内没有发生密钥轮换时的初始密钥轮换费用。建议默认值为1atom（最近解绑期内第一次密钥轮换的1atom费用）。

### 工作流程

1. 验证器生成一个新的共识密钥对。
2. 验证器使用其操作员密钥和新的ConsPubKey生成并签署`MsgRotateConsPubKey`交易。

    ```go
    type MsgRotateConsPubKey struct {
        ValidatorAddress  sdk.ValAddress
        NewPubKey         crypto.PubKey
    }
    ```

3. `handleMsgRotateConsPubKey`接收`MsgRotateConsPubKey`，调用`RotateConsPubKey`并触发事件。
4. `RotateConsPubKey`执行以下操作：
    * 检查`ValidatorsByConsAddr`上是否存在重复的`NewPubKey`。
    * 通过迭代`ConsPubKeyRotationHistory`检查验证器是否超过参数`MaxConsPubKeyRotations`。
    * 检查签名账户是否有足够的余额支付`KeyRotationFee`。
    * 将`KeyRotationFee`支付给社区基金。
    * 在`validator.ConsPubKey`中覆盖`NewPubKey`。
    * 删除旧的`ValidatorByConsAddr`。
    * 为`NewPubKey`设置`SetValidatorByConsAddr`。
    * 添加`ConsPubKeyRotationHistory`以跟踪密钥轮换。

    ```go
    type ConsPubKeyRotationHistory struct {
        OperatorAddress         sdk.ValAddress
        OldConsPubKey           crypto.PubKey
        NewConsPubKey           crypto.PubKey
        RotatedHeight           int64
    }
    ```

5. `ApplyAndReturnValidatorSetUpdates`检查是否存在`ConsPubKeyRotationHistory`，并且`ConsPubKeyRotationHistory.RotatedHeight`等于`ctx.BlockHeight()`，如果是，则生成两个`ValidatorUpdate`，一个用于删除验证器，一个用于创建新的验证器。

    ```go
    abci.ValidatorUpdate{
        PubKey: cmttypes.TM2PB.PubKey(OldConsPubKey),
        Power:  0,
    }

    abci.ValidatorUpdate{
        PubKey: cmttypes.TM2PB.PubKey(NewConsPubKey),
        Power:  v.ConsensusPower(),
    }
    ```

6. 在`AllocateTokens`的`previousVotes`迭代逻辑中，使用`OldConsPubKey`匹配`ConsPubKeyRotationHistory`，并替换令牌分配的验证器。
7. 将`ValidatorSigningInfo`和`ValidatorMissedBlockBitArray`从`OldConsPubKey`迁移到`NewConsPubKey`。

* 注意：以上所有功能应在`staking`模块中实现。

## 状态

提议中

## 影响

### 正面影响

* 验证人可以立即或定期更换他们的共识密钥，以获得更好的安全策略
* 在验证人丢弃旧的共识密钥后，可以提供更好的安全性，以防范长程攻击（https://nearprotocol.com/blog/long-range-attacks-and-a-new-fork-choice-rule）

### 负面影响

* Slash 模块需要更多计算，因为它需要查找每个高度的验证人对应的共识密钥
* 频繁的密钥更换会使轻客户端二分法变得不那么高效

### 中性影响

## 参考资料

* 在 tendermint 仓库上：https://github.com/tendermint/tendermint/issues/1136
* 在 cosmos-sdk 仓库上：https://github.com/cosmos/cosmos-sdk/issues/5231
* 关于多个共识密钥：https://github.com/tendermint/tendermint/issues/1758#issuecomment-545291698


# ADR 016: Validator Consensus Key Rotation

## Changelog

* 2019 Oct 23: Initial draft
* 2019 Nov 28: Add key rotation fee

## Context

Validator consensus key rotation feature has been discussed and requested for a long time, for the sake of safer validator key management policy (e.g. https://github.com/tendermint/tendermint/issues/1136). So, we suggest one of the simplest form of validator consensus key rotation implementation mostly onto Cosmos SDK.

We don't need to make any update on consensus logic in Tendermint because Tendermint does not have any mapping information of consensus key and validator operator key, meaning that from Tendermint point of view, a consensus key rotation of a validator is simply a replacement of a consensus key to another.

Also, it should be noted that this ADR includes only the simplest form of consensus key rotation without considering multiple consensus keys concept. Such multiple consensus keys concept shall remain a long term goal of Tendermint and Cosmos SDK.

## Decision

### Pseudo procedure for consensus key rotation

* create new random consensus key.
* create and broadcast a transaction with a `MsgRotateConsPubKey` that states the new consensus key is now coupled with the validator operator with signature from the validator's operator key.
* old consensus key becomes unable to participate on consensus immediately after the update of key mapping state on-chain.
* start validating with new consensus key.
* validators using HSM and KMS should update the consensus key in HSM to use the new rotated key after the height `h` when `MsgRotateConsPubKey` committed to the blockchain.

### Considerations

* consensus key mapping information management strategy
    * store history of each key mapping changes in the kvstore.
    * the state machine can search corresponding consensus key paired with given validator operator for any arbitrary height in a recent unbonding period.
    * the state machine does not need any historical mapping information which is past more than unbonding period.
* key rotation costs related to LCD and IBC
    * LCD and IBC will have traffic/computation burden when there exists frequent power changes
    * In current Tendermint design, consensus key rotations are seen as power changes from LCD or IBC perspective
    * Therefore, to minimize unnecessary frequent key rotation behavior, we limited maximum number of rotation in recent unbonding period and also applied exponentially increasing rotation fee
* limits
    * a validator cannot rotate its consensus key more than `MaxConsPubKeyRotations` time for any unbonding period, to prevent spam.
    * parameters can be decided by governance and stored in genesis file.
* key rotation fee
    * a validator should pay `KeyRotationFee` to rotate the consensus key which is calculated as below
    * `KeyRotationFee` = (max(`VotingPowerPercentage` *100, 1)* `InitialKeyRotationFee`) * 2^(number of rotations in `ConsPubKeyRotationHistory` in recent unbonding period)
* evidence module
    * evidence module can search corresponding consensus key for any height from slashing keeper so that it can decide which consensus key is supposed to be used for given height.
* abci.ValidatorUpdate
    * tendermint already has ability to change a consensus key by ABCI communication(`ValidatorUpdate`).
    * validator consensus key update can be done via creating new + delete old by change the power to zero.
    * therefore, we expect we even do not need to change tendermint codebase at all to implement this feature.
* new genesis parameters in `staking` module
    * `MaxConsPubKeyRotations` : maximum number of rotation can be executed by a validator in recent unbonding period. default value 10 is suggested(11th key rotation will be rejected)
    * `InitialKeyRotationFee` : the initial key rotation fee when no key rotation has happened in recent unbonding period. default value 1atom is suggested(1atom fee for the first key rotation in recent unbonding period)

### Workflow

1. The validator generates a new consensus keypair.
2. The validator generates and signs a `MsgRotateConsPubKey` tx with their operator key and new ConsPubKey

    ```go
    type MsgRotateConsPubKey struct {
        ValidatorAddress  sdk.ValAddress
        NewPubKey         crypto.PubKey
    }
    ```

3. `handleMsgRotateConsPubKey` gets `MsgRotateConsPubKey`, calls `RotateConsPubKey` with emits event
4. `RotateConsPubKey`
    * checks if `NewPubKey` is not duplicated on `ValidatorsByConsAddr`
    * checks if the validator is does not exceed parameter `MaxConsPubKeyRotations` by iterating `ConsPubKeyRotationHistory`
    * checks if the signing account has enough balance to pay `KeyRotationFee`
    * pays `KeyRotationFee` to community fund
    * overwrites `NewPubKey` in `validator.ConsPubKey`
    * deletes old `ValidatorByConsAddr`
    * `SetValidatorByConsAddr` for `NewPubKey`
    * Add `ConsPubKeyRotationHistory` for tracking rotation

    ```go
    type ConsPubKeyRotationHistory struct {
        OperatorAddress         sdk.ValAddress
        OldConsPubKey           crypto.PubKey
        NewConsPubKey           crypto.PubKey
        RotatedHeight           int64
    }
    ```

5. `ApplyAndReturnValidatorSetUpdates` checks if there is `ConsPubKeyRotationHistory` with `ConsPubKeyRotationHistory.RotatedHeight == ctx.BlockHeight()` and if so, generates 2 `ValidatorUpdate` , one for a remove validator and one for create new validator

    ```go
    abci.ValidatorUpdate{
        PubKey: cmttypes.TM2PB.PubKey(OldConsPubKey),
        Power:  0,
    }

    abci.ValidatorUpdate{
        PubKey: cmttypes.TM2PB.PubKey(NewConsPubKey),
        Power:  v.ConsensusPower(),
    }
    ```

6. at `previousVotes` Iteration logic of `AllocateTokens`,  `previousVote` using `OldConsPubKey` match up with `ConsPubKeyRotationHistory`, and replace validator for token allocation
7. Migrate `ValidatorSigningInfo` and `ValidatorMissedBlockBitArray` from `OldConsPubKey` to `NewConsPubKey`

* Note : All above features shall be implemented in `staking` module.

## Status

Proposed

## Consequences

### Positive

* Validators can immediately or periodically rotate their consensus key to have better security policy
* improved security against Long-Range attacks (https://nearprotocol.com/blog/long-range-attacks-and-a-new-fork-choice-rule) given a validator throws away the old consensus key(s)

### Negative

* Slash module needs more computation because it needs to lookup corresponding consensus key of validators for each height
* frequent key rotations will make light client bisection less efficient

### Neutral

## References

* on tendermint repo : https://github.com/tendermint/tendermint/issues/1136
* on cosmos-sdk repo : https://github.com/cosmos/cosmos-sdk/issues/5231
* about multiple consensus keys : https://github.com/tendermint/tendermint/issues/1758#issuecomment-545291698
