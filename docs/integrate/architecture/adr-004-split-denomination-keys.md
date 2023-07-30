# ADR 004: 分割货币单位键

## 更新日志

* 2020-01-08: 初始版本
* 2020-01-09: 修改以处理锁定账户
* 2020-01-14: 根据审查反馈进行更新
* 2020-01-30: 根据实施进行更新

### 术语表

* denom / denomination key -- 唯一的代币标识符。

## 背景

在无需许可的 IBC 下，任何人都可以向任何其他账户发送任意的货币单位。目前，所有非零余额都与账户一起存储在 `sdk.Coins` 结构中，这可能会导致拒绝服务的问题，因为每次修改账户时，加载和存储太多的货币单位将变得昂贵。有关更多背景信息，请参见问题 [5467](https://github.com/cosmos/cosmos-sdk/issues/5467) 和 [4982](https://github.com/cosmos/cosmos-sdk/issues/4982)。

简单地在达到货币单位计数限制后拒绝接收存款是行不通的，因为这会打开一种攻击向量：某人可以通过 IBC 向用户发送大量无意义的代币，然后阻止用户接收真正的货币单位（例如质押奖励）。

## 决策

余额将按账户和货币单位分别存储在唯一的货币单位和账户唯一键下，从而实现对特定账户在特定货币单位上余额的 O(1) 读写访问。

### 账户接口 (x/auth)

`GetCoins()` 和 `SetCoins()` 将从账户接口中移除，因为现在货币余额将由银行模块存储和管理。

锁定账户接口将用 `LockedCoins` 替代 `SpendableCoins`，后者不再需要账户余额。此外，`TrackDelegation()` 现在将接受所有以锁定余额计价的代币的账户余额，而不是加载整个账户余额。

锁定账户将继续存储原始锁定、委托的自由和委托的锁定代币（这是安全的，因为它们不能包含任意的货币单位）。

### 银行管理器 (x/bank)

将向 `x/bank` 管理器添加以下 API：

* `GetAllBalances(ctx Context, addr AccAddress) Coins`
* `GetBalance(ctx Context, addr AccAddress, denom string) Coin`
* `SetBalance(ctx Context, addr AccAddress, coin Coin)`
* `LockedCoins(ctx Context, addr AccAddress) Coins`
* `SpendableCoins(ctx Context, addr AccAddress) Coins`

附加的 API 可能会被添加以便支持迭代和辅助功能，这些功能对于核心功能或持久性来说并非必需。

余额将首先按地址存储，然后按货币单位存储（反向存储也是可能的，但假定更频繁地检索单个账户的所有余额）：

```go
var BalancesPrefix = []byte("balances")

func (k Keeper) SetBalance(ctx Context, addr AccAddress, balance Coin) error {
  if !balance.IsValid() {
    return err
  }

  store := ctx.KVStore(k.storeKey)
  balancesStore := prefix.NewStore(store, BalancesPrefix)
  accountStore := prefix.NewStore(balancesStore, addr.Bytes())

  bz := Marshal(balance)
  accountStore.Set([]byte(balance.Denom), bz)

  return nil
}
```

这将导致余额按字节表示的 `balances/{address}/{denom}` 进行索引。

`DelegateCoins()` 和 `UndelegateCoins()` 将被修改为仅通过（解）委托金额中找到的货币单位加载每个单独的账户余额。因此，任何对账户余额的变动都将按货币单位进行。

`SubtractCoins()` 和 `AddCoins()` 将被修改为直接读取和写入余额，而不是调用 `GetCoins()` / `SetCoins()`（这两个方法已不存在）。

`trackDelegation()` 和 `trackUndelegation()` 将被修改为不再更新账户余额。

外部 API 需要扫描账户下的所有余额以保持向后兼容性。建议这些 API 在可能的情况下使用 `GetBalance` 和 `SetBalance`，而不是 `GetAllBalances`，以避免加载整个账户余额。

### Supply 模块

为了实现总供应量不变式，Supply 模块现在需要扫描所有账户并使用 `x/bank` Keeper 调用 `GetAllBalances`，然后对余额求和并检查它们是否与预期的总供应量相匹配。

## 状态

已接受。

## 影响

### 积极影响

* 余额的读取和写入是 O(1) 的（相对于账户具有非零余额的货币单位的数量）。注意，这与实际的 I/O 成本无关，而是指所需的直接读取总数。

### 负面影响

* 在事务中读取和写入单个账户的所有余额时，读取和写入略微低效。

### 中性影响

没有特别的影响。

## 参考资料

* Ref: https://github.com/cosmos/cosmos-sdk/issues/4982
* Ref: https://github.com/cosmos/cosmos-sdk/issues/5467
* Ref: https://github.com/cosmos/cosmos-sdk/issues/5492

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.


# ADR 004: Split Denomination Keys

## Changelog

* 2020-01-08: Initial version
* 2020-01-09: Alterations to handle vesting accounts
* 2020-01-14: Updates from review feedback
* 2020-01-30: Updates from implementation

### Glossary

* denom / denomination key -- unique token identifier.

## Context

With permissionless IBC, anyone will be able to send arbitrary denominations to any other account. Currently, all non-zero balances are stored along with the account in an `sdk.Coins` struct, which creates a potential denial-of-service concern, as too many denominations will become expensive to load & store each time the account is modified. See issues [5467](https://github.com/cosmos/cosmos-sdk/issues/5467) and [4982](https://github.com/cosmos/cosmos-sdk/issues/4982) for additional context.

Simply rejecting incoming deposits after a denomination count limit doesn't work, since it opens up a griefing vector: someone could send a user lots of nonsensical coins over IBC, and then prevent the user from receiving real denominations (such as staking rewards).

## Decision

Balances shall be stored per-account & per-denomination under a denomination- and account-unique key, thus enabling O(1) read & write access to the balance of a particular account in a particular denomination.

### Account interface (x/auth)

`GetCoins()` and `SetCoins()` will be removed from the account interface, since coin balances will
now be stored in & managed by the bank module.

The vesting account interface will replace `SpendableCoins` in favor of `LockedCoins` which does
not require the account balance anymore. In addition, `TrackDelegation()`  will now accept the
account balance of all tokens denominated in the vesting balance instead of loading the entire
account balance.

Vesting accounts will continue to store original vesting, delegated free, and delegated
vesting coins (which is safe since these cannot contain arbitrary denominations).

### Bank keeper (x/bank)

The following APIs will be added to the `x/bank` keeper:

* `GetAllBalances(ctx Context, addr AccAddress) Coins`
* `GetBalance(ctx Context, addr AccAddress, denom string) Coin`
* `SetBalance(ctx Context, addr AccAddress, coin Coin)`
* `LockedCoins(ctx Context, addr AccAddress) Coins`
* `SpendableCoins(ctx Context, addr AccAddress) Coins`

Additional APIs may be added to facilitate iteration and auxiliary functionality not essential to
core functionality or persistence.

Balances will be stored first by the address, then by the denomination (the reverse is also possible,
but retrieval of all balances for a single account is presumed to be more frequent):

```go
var BalancesPrefix = []byte("balances")

func (k Keeper) SetBalance(ctx Context, addr AccAddress, balance Coin) error {
  if !balance.IsValid() {
    return err
  }

  store := ctx.KVStore(k.storeKey)
  balancesStore := prefix.NewStore(store, BalancesPrefix)
  accountStore := prefix.NewStore(balancesStore, addr.Bytes())

  bz := Marshal(balance)
  accountStore.Set([]byte(balance.Denom), bz)

  return nil
}
```

This will result in the balances being indexed by the byte representation of
`balances/{address}/{denom}`.

`DelegateCoins()` and `UndelegateCoins()` will be altered to only load each individual
account balance by denomination found in the (un)delegation amount. As a result,
any mutations to the account balance by will made by denomination.

`SubtractCoins()` and `AddCoins()` will be altered to read & write the balances
directly instead of calling `GetCoins()` / `SetCoins()` (which no longer exist).

`trackDelegation()` and `trackUndelegation()` will be altered to no longer update
account balances.

External APIs will need to scan all balances under an account to retain backwards-compatibility. It
is advised that these APIs use `GetBalance` and `SetBalance` instead of `GetAllBalances` when
possible as to not load the entire account balance.

### Supply module

The supply module, in order to implement the total supply invariant, will now need
to scan all accounts & call `GetAllBalances` using the `x/bank` Keeper, then sum
the balances and check that they match the expected total supply.

## Status

Accepted.

## Consequences

### Positive

* O(1) reads & writes of balances (with respect to the number of denominations for
which an account has non-zero balances). Note, this does not relate to the actual
I/O cost, rather the total number of direct reads needed.

### Negative

* Slightly less efficient reads/writes when reading & writing all balances of a
single account in a transaction.

### Neutral

None in particular.

## References

* Ref: https://github.com/cosmos/cosmos-sdk/issues/4982
* Ref: https://github.com/cosmos/cosmos-sdk/issues/5467
* Ref: https://github.com/cosmos/cosmos-sdk/issues/5492
