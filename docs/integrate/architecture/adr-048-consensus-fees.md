# ADR 048: 多层级 Gas 价格系统

## 更新日志

* 2021年12月1日：初稿

## 状态

已拒绝

## 摘要

本 ADR 描述了一种灵活的机制，用于维护共识级别的 Gas 价格，用户可以通过配置选择多层级 Gas 价格系统或类似 EIP-1559 的系统。

## 背景

目前，每个验证者在 `app.yaml` 中配置自己的 `minimal-gas-prices`。但是，设置适当的最低 Gas 价格对于保护网络免受 DoS 攻击至关重要，而所有验证者很难选择一个合理的值，因此我们建议在共识级别上维护 Gas 价格。

由于 tendermint 0.34.20 已支持内存池优先级排序，我们可以利用这一点来实现更复杂的 Gas 费用系统。

## 多层级价格系统

我们提出了一种在共识级别上提供最大灵活性的多层级价格系统：

* 第一层：恒定的 Gas 价格，只能通过治理提案偶尔进行修改。
* 第二层：根据先前区块负载调整的动态 Gas 价格。
* 第三层：根据先前区块负载以更高速度调整的动态 Gas 价格。

较高层级的 Gas 价格应大于较低层级的价格。

交易费用按照共识计算的准确 Gas 价格收取。

参数模式如下：

```protobuf
message TierParams {
  uint32 priority = 1           // priority in tendermint mempool
  Coin initial_gas_price = 2    //
  uint32 parent_gas_target = 3  // the target saturation of block
  uint32 change_denominator = 4 // decides the change speed
  Coin min_gas_price = 5        // optional lower bound of the price adjustment
  Coin max_gas_price = 6        // optional upper bound of the price adjustment
}

message Params {
  repeated TierParams tiers = 1;
}
```

### 扩展选项

我们需要允许用户指定交易的服务层级，为了以可扩展的方式支持它，我们在 `AuthInfo` 中添加了一个扩展选项：

```protobuf
message ExtensionOptionsTieredTx {
  uint32 fee_tier = 1
}
```

`fee_tier` 的值只是 `tiers` 参数列表的索引。

我们还改变了现有的 `Tx` 的 `fee` 字段的语义，不再按照精确的 `fee` 金额收取用户费用，而是将其视为费用上限，实际收取的费用金额是动态决定的。如果 `fee` 小于动态费用，交易将不会包含在当前区块中，并且理想情况下应该保留在内存池中，直到共识 Gas 价格下降。内存池最终可以清除旧的交易。

### 交易优先级

交易的优先级基于层级，层级越高，优先级越高。

在相同层级中，遵循默认的 Tendermint 顺序（目前是先进先出）。请注意，内存池的交易排序逻辑不是共识的一部分，可能会被恶意验证者修改。

这个机制可以与优先级机制轻松组合使用：

* 我们可以在用户控制之外添加额外的层级：
    * 示例 1：用户可以设置层级 0、10 或 20，但协议将创建层级 0、1、2...29。例如，IBC 交易将进入层级 `user_tier + 5`：如果用户选择层级 1，则该交易将进入层级 15。
    * 示例 2：我们可以保留层级 4、5... 仅用于特殊的交易类型。例如，层级 5 保留给证据交易。因此，如果提交了一个 bank.Send 交易并设置层级 5，它将被委派到层级 3（任何交易可用的最高层级）。
    * 示例 3：我们可以强制所有特定类型的交易都进入特定的层级。例如，层级 100 将保留给证据交易，所有证据交易将始终进入该层级。

### `min-gas-prices`

弃用当前每个验证者的 `min-gas-prices` 配置，因为它与共识的 gas 价格一起工作会令人困惑。

### 根据区块负载调整

对于层级 2 和层级 3 的交易，根据先前的区块负载调整 gas 价格，逻辑可以类似于 EIP-1559：

```python
def adjust_gas_price(gas_price, parent_gas_used, tier):
  if parent_gas_used == tier.parent_gas_target:
    return gas_price
  elif parent_gas_used > tier.parent_gas_target:
    gas_used_delta = parent_gas_used - tier.parent_gas_target
    gas_price_delta = max(gas_price * gas_used_delta // tier.parent_gas_target // tier.change_speed, 1)
    return gas_price + gas_price_delta
  else:
    gas_used_delta = parent_gas_target - parent_gas_used
    gas_price_delta = gas_price * gas_used_delta // parent_gas_target // tier.change_speed
    return gas_price - gas_price_delta
```

### 区块段保留

理想情况下，我们应该为每个层级保留区块段，这样较低层级的交易不会被较高层级的交易完全挤出，这将迫使用户使用更高的层级，使系统降级为单一层级。

我们需要 Tendermint 的帮助来实现这一点。

## 实现

我们可以在协议参数中使每个层级的 gas 价格策略完全可配置，同时提供一个合理的默认策略。

类似于 Python 伪代码的伪代码：

```python
interface TieredTx:
  def tier(self) -> int:
    pass

def tx_tier(tx):
    if isinstance(tx, TieredTx):
      return tx.tier()
    else:
      # default tier for custom transactions
      return 0
    # NOTE: we can add more rules here per "Tx Prioritization" section 

class TierParams:
  'gas price strategy parameters of one tier'
  priority: int           # priority in tendermint mempool
  initial_gas_price: Coin
  parent_gas_target: int
  change_speed: Decimal   # 0 means don't adjust for block load.

class Params:
    'protocol parameters'
    tiers: List[TierParams]

class State:
    'consensus state'
    # total gas used in last block, None when it's the first block
    parent_gas_used: Optional[int]
    # gas prices of last block for all tiers
    gas_prices: List[Coin]

def begin_block():
    'Adjust gas prices'
    for i, tier in enumerate(Params.tiers):
        if State.parent_gas_used is None:
            # initialized gas price for the first block
	          State.gas_prices[i] = tier.initial_gas_price
        else:
            # adjust gas price according to gas used in previous block
            State.gas_prices[i] = adjust_gas_price(State.gas_prices[i], State.parent_gas_used, tier)

def mempoolFeeTxHandler_checkTx(ctx, tx):
    # the minimal-gas-price configured by validator, zero in deliver_tx context
    validator_price = ctx.MinGasPrice()
    consensus_price = State.gas_prices[tx_tier(tx)]
    min_price = max(validator_price, consensus_price)

    # zero means infinity for gas price cap
    if tx.gas_price() > 0 and tx.gas_price() < min_price:
        return 'insufficient fees'
    return next_CheckTx(ctx, tx)

def txPriorityHandler_checkTx(ctx, tx):
    res, err := next_CheckTx(ctx, tx)
    # pass priority to tendermint
    res.Priority = Params.tiers[tx_tier(tx)].priority
    return res, err

def end_block():
    'Update block gas used'
    State.parent_gas_used = block_gas_meter.consumed()
```

### Dos 攻击保护

为了完全饱和区块并阻止其他交易执行，攻击者需要使用最高级别的交易，这将导致成本显著高于默认级别。

如果攻击者使用较低级别的交易进行垃圾邮件攻击，用户可以通过发送较高级别的交易来减轻影响。

## 后果

### 向后兼容性

* 新的协议参数。
* 新的共识状态。
* 交易体中的新/更改字段。

### 积极影响

* 默认级别保持相同的可预测的燃气价格体验。
* 较高级别的燃气价格可以根据区块负载进行调整。
* 与基于交易类型的自定义优先级冲突，因为此提案仅占用三个优先级级别。
* 可以通过级别组合不同的优先级规则。

### 负面影响

* 钱包和工具需要更新以支持新的 `tier` 参数，并且 `fee` 字段的语义发生了变化。

### 中性影响

## 参考资料

* https://eips.ethereum.org/EIPS/eip-1559
* https://iohk.io/en/blog/posts/2021/11/26/network-traffic-and-tiered-pricing/


# ADR 048: Multi Tire Gas Price System

## Changelog

* Dec 1, 2021: Initial Draft

## Status

Rejected

## Abstract

This ADR describes a flexible mechanism to maintain a consensus level gas prices, in which one can choose a multi-tier gas price system or EIP-1559 like one through configuration.

## Context

Currently, each validator configures it's own `minimal-gas-prices` in `app.yaml`. But setting a proper minimal gas price is critical to protect network from dos attack, and it's hard for all the validators to pick a sensible value, so we propose to maintain a gas price in consensus level.

Since tendermint 0.34.20 has supported mempool prioritization, we can take advantage of that to implement more sophisticated gas fee system.

## Multi-Tier Price System

We propose a multi-tier price system on consensus to provide maximum flexibility:

* Tier 1: a constant gas price, which could only be modified occasionally through governance proposal.
* Tier 2: a dynamic gas price which is adjusted according to previous block load.
* Tier 3: a dynamic gas price which is adjusted according to previous block load at a higher speed.

The gas price of higher tier should bigger than the lower tier.

The transaction fees are charged with the exact gas price calculated on consensus.

The parameter schema is like this:

```protobuf
message TierParams {
  uint32 priority = 1           // priority in tendermint mempool
  Coin initial_gas_price = 2    //
  uint32 parent_gas_target = 3  // the target saturation of block
  uint32 change_denominator = 4 // decides the change speed
  Coin min_gas_price = 5        // optional lower bound of the price adjustment
  Coin max_gas_price = 6        // optional upper bound of the price adjustment
}

message Params {
  repeated TierParams tiers = 1;
}
```

### Extension Options

We need to allow user to specify the tier of service for the transaction, to support it in an extensible way, we add an extension option in `AuthInfo`:

```protobuf
message ExtensionOptionsTieredTx {
  uint32 fee_tier = 1
}
```

The value of `fee_tier` is just the index to the `tiers` parameter list.

We also change the semantic of existing `fee` field of `Tx`, instead of charging user the exact `fee` amount, we treat it as a fee cap, while the actual amount of fee charged is decided dynamically. If the `fee` is smaller than dynamic one, the transaction won't be included in current block and ideally should stay in the mempool until the consensus gas price drop. The mempool can eventually prune old transactions.

### Tx Prioritization

Transactions are prioritized based on the tier, the higher the tier, the higher the priority.

Within the same tier, follow the default Tendermint order (currently FIFO). Be aware of that the mempool tx ordering logic is not part of consensus and can be modified by malicious validator.

This mechanism can be easily composed with prioritization mechanisms:

* we can add extra tiers out of a user control:
    * Example 1: user can set tier 0, 10 or 20, but the protocol will create tiers 0, 1, 2 ... 29. For example IBC transactions will go to tier `user_tier + 5`: if user selected tier 1, then the transaction will go to tier 15.
    * Example 2: we can reserve tier 4, 5, ... only for special transaction types. For example, tier 5 is reserved for evidence tx. So if submits a bank.Send transaction and set tier 5, it will be delegated to tier 3 (the max tier level available for any transaction). 
    * Example 3: we can enforce that all transactions of a sepecific type will go to specific tier. For example, tier 100 will be reserved for evidence transactions and all evidence transactions will always go to that tier.

### `min-gas-prices`

Deprecate the current per-validator `min-gas-prices` configuration, since it would confusing for it to work together with the consensus gas price.

### Adjust For Block Load

For tier 2 and tier 3 transactions, the gas price is adjusted according to previous block load, the logic could be similar to EIP-1559:

```python
def adjust_gas_price(gas_price, parent_gas_used, tier):
  if parent_gas_used == tier.parent_gas_target:
    return gas_price
  elif parent_gas_used > tier.parent_gas_target:
    gas_used_delta = parent_gas_used - tier.parent_gas_target
    gas_price_delta = max(gas_price * gas_used_delta // tier.parent_gas_target // tier.change_speed, 1)
    return gas_price + gas_price_delta
  else:
    gas_used_delta = parent_gas_target - parent_gas_used
    gas_price_delta = gas_price * gas_used_delta // parent_gas_target // tier.change_speed
    return gas_price - gas_price_delta
```

### Block Segment Reservation

Ideally we should reserve block segments for each tier, so the lower tiered transactions won't be completely squeezed out by higher tier transactions, which will force user to use higher tier, and the system degraded to a single tier.

We need help from tendermint to implement this.

## Implementation

We can make each tier's gas price strategy fully configurable in protocol parameters, while providing a sensible default one.

Pseudocode in python-like syntax:

```python
interface TieredTx:
  def tier(self) -> int:
    pass

def tx_tier(tx):
    if isinstance(tx, TieredTx):
      return tx.tier()
    else:
      # default tier for custom transactions
      return 0
    # NOTE: we can add more rules here per "Tx Prioritization" section 

class TierParams:
  'gas price strategy parameters of one tier'
  priority: int           # priority in tendermint mempool
  initial_gas_price: Coin
  parent_gas_target: int
  change_speed: Decimal   # 0 means don't adjust for block load.

class Params:
    'protocol parameters'
    tiers: List[TierParams]

class State:
    'consensus state'
    # total gas used in last block, None when it's the first block
    parent_gas_used: Optional[int]
    # gas prices of last block for all tiers
    gas_prices: List[Coin]

def begin_block():
    'Adjust gas prices'
    for i, tier in enumerate(Params.tiers):
        if State.parent_gas_used is None:
            # initialized gas price for the first block
	          State.gas_prices[i] = tier.initial_gas_price
        else:
            # adjust gas price according to gas used in previous block
            State.gas_prices[i] = adjust_gas_price(State.gas_prices[i], State.parent_gas_used, tier)

def mempoolFeeTxHandler_checkTx(ctx, tx):
    # the minimal-gas-price configured by validator, zero in deliver_tx context
    validator_price = ctx.MinGasPrice()
    consensus_price = State.gas_prices[tx_tier(tx)]
    min_price = max(validator_price, consensus_price)

    # zero means infinity for gas price cap
    if tx.gas_price() > 0 and tx.gas_price() < min_price:
        return 'insufficient fees'
    return next_CheckTx(ctx, tx)

def txPriorityHandler_checkTx(ctx, tx):
    res, err := next_CheckTx(ctx, tx)
    # pass priority to tendermint
    res.Priority = Params.tiers[tx_tier(tx)].priority
    return res, err

def end_block():
    'Update block gas used'
    State.parent_gas_used = block_gas_meter.consumed()
```

### Dos attack protection

To fully saturate the blocks and prevent other transactions from executing, attacker need to use transactions of highest tier, the cost would be significantly higher than the default tier.

If attacker spam with lower tier transactions, user can mitigate by sending higher tier transactions.

## Consequences

### Backwards Compatibility

* New protocol parameters.
* New consensus states.
* New/changed fields in transaction body.

### Positive

* The default tier keeps the same predictable gas price experience for client.
* The higher tier's gas price can adapt to block load.
* No priority conflict with custom priority based on transaction types, since this proposal only occupy three priority levels.
* Possibility to compose different priority rules with tiers

### Negative

* Wallets & tools need to update to support the new `tier` parameter, and semantic of `fee` field is changed.

### Neutral

## References

* https://eips.ethereum.org/EIPS/eip-1559
* https://iohk.io/en/blog/posts/2021/11/26/network-traffic-and-tiered-pricing/
