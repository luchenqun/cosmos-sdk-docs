# `x/auth/vesting`


* [介绍和要求](#intro-and-requirements)
* [注意](#note)
* [锁仓账户类型](#vesting-account-types)
    * [BaseVestingAccount](#basevestingaccount)
    * [ContinuousVestingAccount](#continuousvestingaccount)
    * [DelayedVestingAccount](#delayedvestingaccount)
    * [Period](#period)
    * [PeriodicVestingAccount](#periodicvestingaccount)
    * [PermanentLockedAccount](#permanentlockedaccount)
* [锁仓账户规范](#vesting-account-specification)
    * [确定锁仓和解锁金额](#determining-vesting--vested-amounts)
    * [周期性锁仓账户](#periodic-vesting-accounts)
    * [转账/发送](#transferringsending)
    * [委托](#delegating)
    * [取消委托](#undelegating)
* [保管人和处理程序](#keepers--handlers)
* [创世初始化](#genesis-initialization)
* [示例](#examples)
    * [简单](#simple)
    * [惩罚](#slashing)
    * [周期性锁仓](#periodic-vesting)
* [术语表](#glossary)

## 介绍和要求

本规范定义了 Cosmos Hub 使用的锁仓账户实现。该锁仓账户的要求是在创世时应初始化一个起始余额 `X` 和一个锁仓结束时间 `ET`。锁仓账户可以在初始化时设置一个锁仓开始时间 `ST` 和一定数量的锁仓周期 `P`。如果设置了锁仓开始时间，则锁仓周期将从开始时间开始计算。如果设置了锁仓周期，则锁仓将在指定的周期数内进行。

对于所有的锁仓账户，锁仓账户的所有者可以委托和取消委托给验证人，但在代币解锁之前不能将代币转移到其他账户。本规范允许四种不同类型的锁仓：

* 延迟锁仓，即在达到 `ET` 时所有代币解锁。
* 连续锁仓，即代币从 `ST` 开始解锁，并且按照时间线性解锁，直到达到 `ET`。
* 周期性锁仓，即代币从 `ST` 开始解锁，并且根据周期数和每个周期的解锁金额进行周期性解锁。周期数、每个周期的长度和金额都是可配置的。周期性锁仓账户与连续锁仓账户的区别在于代币可以分批释放。例如，周期性锁仓账户可以用于代币按季度、年度或其他时间函数释放的锁仓安排。
* 永久锁仓，即代币永久锁定。即使在锁定状态下，该账户中的代币仍可用于委托和治理投票。

## 注意

可锁定账户可以初始化一些可锁定和不可锁定的币。不可锁定的币可以立即转移。DelayedVesting ContinuousVesting、PeriodicVesting和PermenantVesting账户可以在创世时创建。其他类型的可锁定账户必须在创世时创建，或者作为手动网络升级的一部分。当前规范只允许_无条件_锁定（即没有可能达到`ET`并导致币无法锁定）。

## 可锁定账户类型

```go
// VestingAccount defines an interface that any vesting account type must
// implement.
type VestingAccount interface {
  Account

  GetVestedCoins(Time)  Coins
  GetVestingCoins(Time) Coins

  // TrackDelegation performs internal vesting accounting necessary when
  // delegating from a vesting account. It accepts the current block time, the
  // delegation amount and balance of all coins whose denomination exists in
  // the account's original vesting balance.
  TrackDelegation(Time, Coins, Coins)

  // TrackUndelegation performs internal vesting accounting necessary when a
  // vesting account performs an undelegation.
  TrackUndelegation(Coins)

  GetStartTime() int64
  GetEndTime()   int64
}
```

### BaseVestingAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L11-L35
```

### ContinuousVestingAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L37-L46
```

### DelayedVestingAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L48-L57
```

### Period

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L59-L69
```

```go
// Stores all vesting periods passed as part of a PeriodicVestingAccount
type Periods []Period

```

### PeriodicVestingAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L71-L81
```

为了方便非临时类型检查和断言，并支持账户余额使用的灵活性，现有的`x/bank` `ViewKeeper`接口更新为包含以下内容：

```go
type ViewKeeper interface {
  // ...

  // Calculates the total locked account balance.
  LockedCoins(ctx sdk.Context, addr sdk.AccAddress) sdk.Coins

  // Calculates the total spendable balance that can be sent to other accounts.
  SpendableCoins(ctx sdk.Context, addr sdk.AccAddress) sdk.Coins
}
```

### PermanentLockedAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L83-L94
```

## 可锁定账户规范

给定一个可锁定账户，我们在下面的操作中定义了以下内容：

* `OV`：原始锁定币数量。它是一个常量值。
* `V`：仍在_锁定_状态的`OV`币数量。它由`OV`、`StartTime`和`EndTime`派生。此值按需计算，而不是按每个区块计算。
* `V'`：已_解锁_（解除锁定）的`OV`币数量。此值按需计算，而不是按每个区块计算。
* `DV`：委托的_锁定_币数量。它是一个可变值。它直接存储和修改在可锁定账户中。
* `DF`：委托的_解锁_（解除锁定）币数量。它是一个可变值。它直接存储和修改在可锁定账户中。
* `BC`：`OV`币数量减去任何转移的币（可以是负数或委托）。它被视为嵌入基本账户的余额。它直接存储和修改在可锁定账户中。

### 确定解锁和已解锁金额

需要注意的是，这些值是按需计算的，而不是强制性的每个区块基础上计算（例如 `BeginBlocker` 或 `EndBlocker`）。

#### 持续解锁账户

要确定给定区块时间 `T` 的解锁代币数量，执行以下步骤：

1. 计算 `X := T - StartTime`
2. 计算 `Y := EndTime - StartTime`
3. 计算 `V' := OV * (X / Y)`
4. 计算 `V := OV - V'`

因此，_已解锁_ 代币的总数量是 `V'`，剩余数量 `V` 是 _解锁中_。

```go
func (cva ContinuousVestingAccount) GetVestedCoins(t Time) Coins {
    if t <= cva.StartTime {
        // We must handle the case where the start time for a vesting account has
        // been set into the future or when the start of the chain is not exactly
        // known.
        return ZeroCoins
    } else if t >= cva.EndTime {
        return cva.OriginalVesting
    }

    x := t - cva.StartTime
    y := cva.EndTime - cva.StartTime

    return cva.OriginalVesting * (x / y)
}

func (cva ContinuousVestingAccount) GetVestingCoins(t Time) Coins {
    return cva.OriginalVesting - cva.GetVestedCoins(t)
}
```

### 定期解锁账户

定期解锁账户需要计算给定区块时间 `T` 的每个周期释放的代币。请注意，在调用 `GetVestedCoins` 时，可能已经过了多个周期，因此我们必须迭代每个周期，直到该周期的结束时间在 `T` 之后。

1. 设置 `CT := StartTime`
2. 设置 `V' := 0`

对于每个周期 P：

  1. 计算 `X := T - CT`
  2. 如果 `X >= P.Length`
      1. 计算 `V' += P.Amount`
      2. 计算 `CT += P.Length`
      3. 否则跳出循环
  3. 计算 `V := OV - V'`

```go
func (pva PeriodicVestingAccount) GetVestedCoins(t Time) Coins {
  if t < pva.StartTime {
    return ZeroCoins
  }
  ct := pva.StartTime // The start of the vesting schedule
  vested := 0
  periods = pva.GetPeriods()
  for _, period  := range periods {
    if t - ct < period.Length {
      break
    }
    vested += period.Amount
    ct += period.Length // increment ct to the start of the next vesting period
  }
  return vested
}

func (pva PeriodicVestingAccount) GetVestingCoins(t Time) Coins {
    return pva.OriginalVesting - cva.GetVestedCoins(t)
}
```

#### 延迟/离散解锁账户

延迟解锁账户更容易理解，因为它们只有在特定时间之前的全部金额解锁，然后所有代币都解锁（解锁）。这不包括账户可能最初拥有的任何解锁代币。

```go
func (dva DelayedVestingAccount) GetVestedCoins(t Time) Coins {
    if t >= dva.EndTime {
        return dva.OriginalVesting
    }

    return ZeroCoins
}

func (dva DelayedVestingAccount) GetVestingCoins(t Time) Coins {
    return dva.OriginalVesting - dva.GetVestedCoins(t)
}
```

### 转账/发送

在任何给定时间，解锁账户可以转账：`min((BC + DV) - V, BC)`。

换句话说，解锁账户可以转账的金额是基本账户余额和基本账户余额加上当前委托的解锁代币数量减去到目前为止解锁的代币数量的最小值。

然而，鉴于账户余额是通过 `x/bank` 模块进行跟踪的，并且我们希望避免加载整个账户余额，我们可以确定锁定余额，即 `max(V - DV, 0)`，并从中推断可支配余额。

```go
func (va VestingAccount) LockedCoins(t Time) Coins {
   return max(va.GetVestingCoins(t) - va.DelegatedVesting, 0)
}
```

`x/bank`的`ViewKeeper`可以为任何账户提供确定锁定和可用币的API：

```go
func (k Keeper) LockedCoins(ctx Context, addr AccAddress) Coins {
    acc := k.GetAccount(ctx, addr)
    if acc != nil {
        if acc.IsVesting() {
            return acc.LockedCoins(ctx.BlockTime())
        }
    }

    // non-vesting accounts do not have any locked coins
    return NewCoins()
}
```

#### Keepers/Handlers

相应的`x/bank` keeper应适当处理发送币的情况，根据账户是否为锁定账户。

```go
func (k Keeper) SendCoins(ctx Context, from Account, to Account, amount Coins) {
    bc := k.GetBalances(ctx, from)
    v := k.LockedCoins(ctx, from)

    spendable := bc - v
    newCoins := spendable - amount
    assert(newCoins >= 0)

    from.SetBalance(newCoins)
    to.AddBalance(amount)

    // save balances...
}
```

### 委托

对于尝试委托`D`个币的锁定账户，执行以下操作：

1. 验证`BC >= D > 0`
2. 计算`X := min(max(V - DV, 0), D)`（`D`中正在锁定的部分）
3. 计算`Y := D - X`（`D`中可自由支配的部分）
4. 设置`DV += X`
5. 设置`DF += Y`

```go
func (va VestingAccount) TrackDelegation(t Time, balance Coins, amount Coins) {
    assert(balance <= amount)
    x := min(max(va.GetVestingCoins(t) - va.DelegatedVesting, 0), amount)
    y := amount - x

    va.DelegatedVesting += x
    va.DelegatedFree += y
}
```

**注意**：`TrackDelegation`仅修改`DelegatedVesting`和`DelegatedFree`字段，因此上游调用者必须通过减去`amount`来修改`Coins`字段。

#### Keepers/Handlers

```go
func DelegateCoins(t Time, from Account, amount Coins) {
    if isVesting(from) {
        from.TrackDelegation(t, amount)
    } else {
        from.SetBalance(sc - amount)
    }

    // save account...
}
```

### 解委托

对于尝试解委托`D`个币的锁定账户，执行以下操作：

> 注意：由于委托/解委托逻辑的舍入问题，`DV < D`和`(DV + DF) < D`可能是可能的。

1. 验证`D > 0`
2. 计算`X := min(DF, D)`（应该变为自由币的`D`的部分，优先使用自由币）
3. 计算`Y := min(DV, D - X)`（应该保持锁定的`D`的部分）
4. 设置`DF -= X`
5. 设置`DV -= Y`

```go
func (cva ContinuousVestingAccount) TrackUndelegation(amount Coins) {
    x := min(cva.DelegatedFree, amount)
    y := amount - x

    cva.DelegatedFree -= x
    cva.DelegatedVesting -= y
}
```

**注意**：`TrackUnDelegation`仅修改`DelegatedVesting`和`DelegatedFree`字段，因此上游调用者必须通过添加`amount`来修改`Coins`字段。

**注意**：如果委托被削减，连续锁定账户最终会有多余的`DV`金额，即使所有币都已解锁。这是因为解委托自由币具有优先级。

**注意**：由于解委托截断债券退款的方式，债券退款金额可能超过委托锁定金额，这可能会略微增加验证人的兑换率（代币/份额），如果解委托的代币是非整数的。

#### Keepers/Handlers

```go
func UndelegateCoins(to Account, amount Coins) {
    if isVesting(to) {
        if to.DelegatedFree + to.DelegatedVesting >= amount {
            to.TrackUndelegation(amount)
            // save account ...
        }
    } else {
        AddBalance(to, amount)
        // save account...
    }
}
```

## Keepers & Handlers

`VestingAccount`的实现位于`x/auth`中。然而，任何模块中的keeper（例如`x/staking`中的staking）如果希望可能利用任何锁定币，必须调用`x/bank` keeper上的显式方法（例如`DelegateCoins`），而不是`SendCoins`和`SubtractCoins`。

此外，锁仓账户还应该能够使用其从其他用户那里收到的任何代币。因此，银行模块的`MsgSend`处理程序应该在锁仓账户尝试发送超过其解锁代币数量的金额时报错。

有关完整的实现细节，请参阅上述规范。

## 创世初始化

为了初始化锁仓账户和非锁仓账户，`GenesisAccount`结构体包括了新的字段：`Vesting`、`StartTime`和`EndTime`。用于表示`BaseAccount`或任何非锁仓类型的账户的`Vesting`字段设置为`false`。创世初始化逻辑（例如`initFromGenesisState`）必须根据这些字段解析并返回正确的账户。

```go
type GenesisAccount struct {
    // ...

    // vesting account fields
    OriginalVesting  sdk.Coins `json:"original_vesting"`
    DelegatedFree    sdk.Coins `json:"delegated_free"`
    DelegatedVesting sdk.Coins `json:"delegated_vesting"`
    StartTime        int64     `json:"start_time"`
    EndTime          int64     `json:"end_time"`
}

func ToAccount(gacc GenesisAccount) Account {
    bacc := NewBaseAccount(gacc)

    if gacc.OriginalVesting > 0 {
        if ga.StartTime != 0 && ga.EndTime != 0 {
            // return a continuous vesting account
        } else if ga.EndTime != 0 {
            // return a delayed vesting account
        } else {
            // invalid genesis vesting account provided
            panic()
        }
    }

    return bacc
}
```

## 示例

### 简单示例

给定一个连续锁仓账户，拥有10个锁仓代币。

```text
OV = 10
DF = 0
DV = 0
BC = 10
V = 10
V' = 0
```

1. 立即收到1个代币

    ```text
    BC = 11
    ```

2. Time passes, 2 coins vest

    ```text
    V = 8
    V' = 2
    ```

3. Delegates 4 coins to validator A

    ```text
    DV = 4
    BC = 7
    ```

4. Sends 3 coins

    ```text
    BC = 4
    ```

5. More time passes, 2 more coins vest

    ```text
    V = 6
    V' = 4
    ```

6. Sends 2 coins. At this point the account cannot send anymore until further
coins vest or it receives additional coins. It can still however, delegate.

    ```text
    BC = 2
    ```

### Slashing

Same initial starting conditions as the simple example.

1. Time passes, 5 coins vest

    ```text
    V = 5
    V' = 5
    ```

2. Delegate 5 coins to validator A

    ```text
    DV = 5
    BC = 5
    ```

3. Delegate 5 coins to validator B

    ```text
    DF = 5
    BC = 0
    ```

4. Validator A gets slashed by 50%, making the delegation to A now worth 2.5 coins
5. Undelegate from validator A (2.5 coins)

    ```text
    DF = 5 - 2.5 = 2.5
    BC = 0 + 2.5 = 2.5
    ```

6. Undelegate from validator B (5 coins). The account at this point can only
send 2.5 coins unless it receives more coins or until more coins vest.
It can still however, delegate.

    ```text
    DV = 5 - 2.5 = 2.5
    DF = 2.5 - 2.5 = 0
    BC = 2.5 + 5 = 7.5
    ```

    Notice how we have an excess amount of `DV`.

### Periodic Vesting

A vesting account is created where 100 tokens will be released over 1 year, with
1/4 of tokens vesting each quarter. The vesting schedule would be as follows:

```yaml
Periods:
- amount: 25stake, length: 7884000
- amount: 25stake, length: 7884000
- amount: 25stake, length: 7884000
- amount: 25stake, length: 7884000
```

```text
OV = 100
DF = 0
DV = 0
BC = 100
V = 100
V' = 0
```

1. Immediately receives 1 coin

    ```text
    BC = 101
    ```

2. Vesting period 1 passes, 25 coins vest

    ```text
    V = 75
    V' = 25
    ```

3. During vesting period 2, 5 coins are transfered and 5 coins are delegated

    ```text
    DV = 5
    BC = 91
    ```

4. Vesting period 2 passes, 25 coins vest

    ```text
    V = 50
    V' = 50
    ```

## Glossary

* OriginalVesting: The amount of coins (per denomination) that are initially
part of a vesting account. These coins are set at genesis.
* StartTime: The BFT time at which a vesting account starts to vest.
* EndTime: The BFT time at which a vesting account is fully vested.
* DelegatedFree: The tracked amount of coins (per denomination) that are
delegated from a vesting account that have been fully vested at time of delegation.
* DelegatedVesting: The tracked amount of coins (per denomination) that are
delegated from a vesting account that were vesting at time of delegation.
* ContinuousVestingAccount: A vesting account implementation that vests coins
linearly over time.
* DelayedVestingAccount: A vesting account implementation that only fully vests
all coins at a given time.
* PeriodicVestingAccount: A vesting account implementation that vests coins
according to a custom vesting schedule.
* PermanentLockedAccount: It does not ever release coins, locking them indefinitely.
Coins in this account can still be used for delegating and for governance votes even while locked.


## CLI

A user can query and interact with the `vesting` module using the CLI.

### Transactions

The `tx` commands allow users to interact with the `vesting` module.

```bash
simd tx vesting --help
```

#### create-periodic-vesting-account

The `create-periodic-vesting-account` command creates a new vesting account funded with an allocation of tokens, where a sequence of coins and period length in seconds. Periods are sequential, in that the duration of of a period only starts at the end of the previous period. The duration of the first period starts upon account creation.

```bash
simd tx vesting create-periodic-vesting-account [to_address] [periods_json_file] [flags]
```

Example:

```bash
simd tx vesting create-periodic-vesting-account cosmos1.. periods.json
```

#### create-vesting-account

The `create-vesting-account` command creates a new vesting account funded with an allocation of tokens. The account can either be a delayed or continuous vesting account, which is determined by the '--delayed' flag. All vesting accouts created will have their start time set by the committed block's time. The end_time must be provided as a UNIX epoch timestamp.

```bash
simd tx vesting create-vesting-account [to_address] [amount] [end_time] [flags]
```

Example:

```bash
simd tx vesting create-vesting-account cosmos1.. 100stake 2592000
```





# `x/auth/vesting`


* [Intro and Requirements](#intro-and-requirements)
* [Note](#note)
* [Vesting Account Types](#vesting-account-types)
    * [BaseVestingAccount](#basevestingaccount)
    * [ContinuousVestingAccount](#continuousvestingaccount)
    * [DelayedVestingAccount](#delayedvestingaccount)
    * [Period](#period)
    * [PeriodicVestingAccount](#periodicvestingaccount)
    * [PermanentLockedAccount](#permanentlockedaccount)
* [Vesting Account Specification](#vesting-account-specification)
    * [Determining Vesting & Vested Amounts](#determining-vesting--vested-amounts)
    * [Periodic Vesting Accounts](#periodic-vesting-accounts)
    * [Transferring/Sending](#transferringsending)
    * [Delegating](#delegating)
    * [Undelegating](#undelegating)
* [Keepers & Handlers](#keepers--handlers)
* [Genesis Initialization](#genesis-initialization)
* [Examples](#examples)
    * [Simple](#simple)
    * [Slashing](#slashing)
    * [Periodic Vesting](#periodic-vesting)
* [Glossary](#glossary)

## Intro and Requirements

This specification defines the vesting account implementation that is used by the Cosmos Hub. The requirements for this vesting account is that it should be initialized during genesis with a starting balance `X` and a vesting end time `ET`. A vesting account may be initialized with a vesting start time `ST` and a number of vesting periods `P`. If a vesting start time is included, the vesting period does not begin until start time is reached. If vesting periods are included, the vesting occurs over the specified number of periods.

For all vesting accounts, the owner of the vesting account is able to delegate and undelegate from validators, however they cannot transfer coins to another account until those coins are vested. This specification allows for four different kinds of vesting:

* Delayed vesting, where all coins are vested once `ET` is reached.
* Continous vesting, where coins begin to vest at `ST` and vest linearly with respect to time until `ET` is reached
* Periodic vesting, where coins begin to vest at `ST` and vest periodically according to number of periods and the vesting amount per period. The number of periods, length per period, and amount per period are configurable. A periodic vesting account is distinguished from a continuous vesting account in that coins can be released in staggered tranches. For example, a periodic vesting account could be used for vesting arrangements where coins are relased quarterly, yearly, or over any other function of tokens over time.
* Permanent locked vesting, where coins are locked forever. Coins in this account can still be used for delegating and for governance votes even while locked.

## Note

Vesting accounts can be initialized with some vesting and non-vesting coins. The non-vesting coins would be immediately transferable. DelayedVesting ContinuousVesting, PeriodicVesting and PermenantVesting accounts can be created with normal messages after genesis. Other types of vesting accounts must be created at genesis, or as part of a manual network upgrade. The current specification only allows for _unconditional_ vesting (ie. there is no possibility of reaching `ET` and
having coins fail to vest).

## Vesting Account Types

```go
// VestingAccount defines an interface that any vesting account type must
// implement.
type VestingAccount interface {
  Account

  GetVestedCoins(Time)  Coins
  GetVestingCoins(Time) Coins

  // TrackDelegation performs internal vesting accounting necessary when
  // delegating from a vesting account. It accepts the current block time, the
  // delegation amount and balance of all coins whose denomination exists in
  // the account's original vesting balance.
  TrackDelegation(Time, Coins, Coins)

  // TrackUndelegation performs internal vesting accounting necessary when a
  // vesting account performs an undelegation.
  TrackUndelegation(Coins)

  GetStartTime() int64
  GetEndTime()   int64
}
```

### BaseVestingAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L11-L35
```

### ContinuousVestingAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L37-L46
```

### DelayedVestingAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L48-L57
```

### Period

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L59-L69
```

```go
// Stores all vesting periods passed as part of a PeriodicVestingAccount
type Periods []Period

```

### PeriodicVestingAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L71-L81
```

In order to facilitate less ad-hoc type checking and assertions and to support flexibility in account balance usage, the existing `x/bank` `ViewKeeper` interface is updated to contain the following:

```go
type ViewKeeper interface {
  // ...

  // Calculates the total locked account balance.
  LockedCoins(ctx sdk.Context, addr sdk.AccAddress) sdk.Coins

  // Calculates the total spendable balance that can be sent to other accounts.
  SpendableCoins(ctx sdk.Context, addr sdk.AccAddress) sdk.Coins
}
```

### PermanentLockedAccount

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/vesting/v1beta1/vesting.proto#L83-L94
```

## Vesting Account Specification

Given a vesting account, we define the following in the proceeding operations:

* `OV`: The original vesting coin amount. It is a constant value.
* `V`: The number of `OV` coins that are still _vesting_. It is derived by
`OV`, `StartTime` and `EndTime`. This value is computed on demand and not on a per-block basis.
* `V'`: The number of `OV` coins that are _vested_ (unlocked). This value is computed on demand and not a per-block basis.
* `DV`: The number of delegated _vesting_ coins. It is a variable value. It is stored and modified directly in the vesting account.
* `DF`: The number of delegated _vested_ (unlocked) coins. It is a variable value. It is stored and modified directly in the vesting account.
* `BC`: The number of `OV` coins less any coins that are transferred
(which can be negative or delegated). It is considered to be balance of the embedded base account. It is stored and modified directly in the vesting account.

### Determining Vesting & Vested Amounts

It is important to note that these values are computed on demand and not on a mandatory per-block basis (e.g. `BeginBlocker` or `EndBlocker`).

#### Continuously Vesting Accounts

To determine the amount of coins that are vested for a given block time `T`, the
following is performed:

1. Compute `X := T - StartTime`
2. Compute `Y := EndTime - StartTime`
3. Compute `V' := OV * (X / Y)`
4. Compute `V := OV - V'`

Thus, the total amount of _vested_ coins is `V'` and the remaining amount, `V`,
is _vesting_.

```go
func (cva ContinuousVestingAccount) GetVestedCoins(t Time) Coins {
    if t <= cva.StartTime {
        // We must handle the case where the start time for a vesting account has
        // been set into the future or when the start of the chain is not exactly
        // known.
        return ZeroCoins
    } else if t >= cva.EndTime {
        return cva.OriginalVesting
    }

    x := t - cva.StartTime
    y := cva.EndTime - cva.StartTime

    return cva.OriginalVesting * (x / y)
}

func (cva ContinuousVestingAccount) GetVestingCoins(t Time) Coins {
    return cva.OriginalVesting - cva.GetVestedCoins(t)
}
```

### Periodic Vesting Accounts

Periodic vesting accounts require calculating the coins released during each period for a given block time `T`. Note that multiple periods could have passed when calling `GetVestedCoins`, so we must iterate over each period until the end of that period is after `T`.

1. Set `CT := StartTime`
2. Set `V' := 0`

For each Period P:

  1. Compute `X := T - CT`
  2. IF `X >= P.Length`
      1. Compute `V' += P.Amount`
      2. Compute `CT += P.Length`
      3. ELSE break
  3. Compute `V := OV - V'`

```go
func (pva PeriodicVestingAccount) GetVestedCoins(t Time) Coins {
  if t < pva.StartTime {
    return ZeroCoins
  }
  ct := pva.StartTime // The start of the vesting schedule
  vested := 0
  periods = pva.GetPeriods()
  for _, period  := range periods {
    if t - ct < period.Length {
      break
    }
    vested += period.Amount
    ct += period.Length // increment ct to the start of the next vesting period
  }
  return vested
}

func (pva PeriodicVestingAccount) GetVestingCoins(t Time) Coins {
    return pva.OriginalVesting - cva.GetVestedCoins(t)
}
```

#### Delayed/Discrete Vesting Accounts

Delayed vesting accounts are easier to reason about as they only have the full amount vesting up until a certain time, then all the coins become vested (unlocked). This does not include any unlocked coins the account may have initially.

```go
func (dva DelayedVestingAccount) GetVestedCoins(t Time) Coins {
    if t >= dva.EndTime {
        return dva.OriginalVesting
    }

    return ZeroCoins
}

func (dva DelayedVestingAccount) GetVestingCoins(t Time) Coins {
    return dva.OriginalVesting - dva.GetVestedCoins(t)
}
```

### Transferring/Sending

At any given time, a vesting account may transfer: `min((BC + DV) - V, BC)`.

In other words, a vesting account may transfer the minimum of the base account balance and the base account balance plus the number of currently delegated vesting coins less the number of coins vested so far.

However, given that account balances are tracked via the `x/bank` module and that we want to avoid loading the entire account balance, we can instead determine the locked balance, which can be defined as `max(V - DV, 0)`, and infer the spendable balance from that.

```go
func (va VestingAccount) LockedCoins(t Time) Coins {
   return max(va.GetVestingCoins(t) - va.DelegatedVesting, 0)
}
```

The `x/bank` `ViewKeeper` can then provide APIs to determine locked and spendable coins for any account:

```go
func (k Keeper) LockedCoins(ctx Context, addr AccAddress) Coins {
    acc := k.GetAccount(ctx, addr)
    if acc != nil {
        if acc.IsVesting() {
            return acc.LockedCoins(ctx.BlockTime())
        }
    }

    // non-vesting accounts do not have any locked coins
    return NewCoins()
}
```

#### Keepers/Handlers

The corresponding `x/bank` keeper should appropriately handle sending coins based on if the account is a vesting account or not.

```go
func (k Keeper) SendCoins(ctx Context, from Account, to Account, amount Coins) {
    bc := k.GetBalances(ctx, from)
    v := k.LockedCoins(ctx, from)

    spendable := bc - v
    newCoins := spendable - amount
    assert(newCoins >= 0)

    from.SetBalance(newCoins)
    to.AddBalance(amount)

    // save balances...
}
```

### Delegating

For a vesting account attempting to delegate `D` coins, the following is performed:

1. Verify `BC >= D > 0`
2. Compute `X := min(max(V - DV, 0), D)` (portion of `D` that is vesting)
3. Compute `Y := D - X` (portion of `D` that is free)
4. Set `DV += X`
5. Set `DF += Y`

```go
func (va VestingAccount) TrackDelegation(t Time, balance Coins, amount Coins) {
    assert(balance <= amount)
    x := min(max(va.GetVestingCoins(t) - va.DelegatedVesting, 0), amount)
    y := amount - x

    va.DelegatedVesting += x
    va.DelegatedFree += y
}
```

**Note** `TrackDelegation` only modifies the `DelegatedVesting` and `DelegatedFree` fields, so upstream callers MUST modify the `Coins` field by subtracting `amount`.

#### Keepers/Handlers

```go
func DelegateCoins(t Time, from Account, amount Coins) {
    if isVesting(from) {
        from.TrackDelegation(t, amount)
    } else {
        from.SetBalance(sc - amount)
    }

    // save account...
}
```

### Undelegating

For a vesting account attempting to undelegate `D` coins, the following is performed:

> NOTE: `DV < D` and `(DV + DF) < D` may be possible due to quirks in the rounding of delegation/undelegation logic.

1. Verify `D > 0`
2. Compute `X := min(DF, D)` (portion of `D` that should become free, prioritizing free coins)
3. Compute `Y := min(DV, D - X)` (portion of `D` that should remain vesting)
4. Set `DF -= X`
5. Set `DV -= Y`

```go
func (cva ContinuousVestingAccount) TrackUndelegation(amount Coins) {
    x := min(cva.DelegatedFree, amount)
    y := amount - x

    cva.DelegatedFree -= x
    cva.DelegatedVesting -= y
}
```

**Note** `TrackUnDelegation` only modifies the `DelegatedVesting` and `DelegatedFree` fields, so upstream callers MUST modify the `Coins` field by adding `amount`.

**Note**: If a delegation is slashed, the continuous vesting account ends up with an excess `DV` amount, even after all its coins have vested. This is because undelegating free coins are prioritized.

**Note**: The undelegation (bond refund) amount may exceed the delegated vesting (bond) amount due to the way undelegation truncates the bond refund, which can increase the validator's exchange rate (tokens/shares) slightly if the undelegated tokens are non-integral.

#### Keepers/Handlers

```go
func UndelegateCoins(to Account, amount Coins) {
    if isVesting(to) {
        if to.DelegatedFree + to.DelegatedVesting >= amount {
            to.TrackUndelegation(amount)
            // save account ...
        }
    } else {
        AddBalance(to, amount)
        // save account...
    }
}
```

## Keepers & Handlers

The `VestingAccount` implementations reside in `x/auth`. However, any keeper in a module (e.g. staking in `x/staking`) wishing to potentially utilize any vesting coins, must call explicit methods on the `x/bank` keeper (e.g. `DelegateCoins`) opposed to `SendCoins` and `SubtractCoins`.

In addition, the vesting account should also be able to spend any coins it receives from other users. Thus, the bank module's `MsgSend` handler should error if a vesting account is trying to send an amount that exceeds their unlocked coin amount.

See the above specification for full implementation details.

## Genesis Initialization

To initialize both vesting and non-vesting accounts, the `GenesisAccount` struct includes new fields: `Vesting`, `StartTime`, and `EndTime`. Accounts meant to be of type `BaseAccount` or any non-vesting type have `Vesting = false`. The genesis initialization logic (e.g. `initFromGenesisState`) must parse and return the correct accounts accordingly based off of these fields.

```go
type GenesisAccount struct {
    // ...

    // vesting account fields
    OriginalVesting  sdk.Coins `json:"original_vesting"`
    DelegatedFree    sdk.Coins `json:"delegated_free"`
    DelegatedVesting sdk.Coins `json:"delegated_vesting"`
    StartTime        int64     `json:"start_time"`
    EndTime          int64     `json:"end_time"`
}

func ToAccount(gacc GenesisAccount) Account {
    bacc := NewBaseAccount(gacc)

    if gacc.OriginalVesting > 0 {
        if ga.StartTime != 0 && ga.EndTime != 0 {
            // return a continuous vesting account
        } else if ga.EndTime != 0 {
            // return a delayed vesting account
        } else {
            // invalid genesis vesting account provided
            panic()
        }
    }

    return bacc
}
```

## Examples

### Simple

Given a continuous vesting account with 10 vesting coins.

```text
OV = 10
DF = 0
DV = 0
BC = 10
V = 10
V' = 0
```

1. Immediately receives 1 coin

    ```text
    BC = 11
    ```

2. Time passes, 2 coins vest

    ```text
    V = 8
    V' = 2
    ```

3. Delegates 4 coins to validator A

    ```text
    DV = 4
    BC = 7
    ```

4. Sends 3 coins

    ```text
    BC = 4
    ```

5. More time passes, 2 more coins vest

    ```text
    V = 6
    V' = 4
    ```

6. Sends 2 coins. At this point the account cannot send anymore until further
coins vest or it receives additional coins. It can still however, delegate.

    ```text
    BC = 2
    ```

### Slashing

Same initial starting conditions as the simple example.

1. Time passes, 5 coins vest

    ```text
    V = 5
    V' = 5
    ```

2. Delegate 5 coins to validator A

    ```text
    DV = 5
    BC = 5
    ```

3. Delegate 5 coins to validator B

    ```text
    DF = 5
    BC = 0
    ```

4. Validator A gets slashed by 50%, making the delegation to A now worth 2.5 coins
5. Undelegate from validator A (2.5 coins)

    ```text
    DF = 5 - 2.5 = 2.5
    BC = 0 + 2.5 = 2.5
    ```

6. Undelegate from validator B (5 coins). The account at this point can only
send 2.5 coins unless it receives more coins or until more coins vest.
It can still however, delegate.

    ```text
    DV = 5 - 2.5 = 2.5
    DF = 2.5 - 2.5 = 0
    BC = 2.5 + 5 = 7.5
    ```

    Notice how we have an excess amount of `DV`.

### Periodic Vesting

A vesting account is created where 100 tokens will be released over 1 year, with
1/4 of tokens vesting each quarter. The vesting schedule would be as follows:

```yaml
Periods:
- amount: 25stake, length: 7884000
- amount: 25stake, length: 7884000
- amount: 25stake, length: 7884000
- amount: 25stake, length: 7884000
```

```text
OV = 100
DF = 0
DV = 0
BC = 100
V = 100
V' = 0
```

1. Immediately receives 1 coin

    ```text
    BC = 101
    ```

2. Vesting period 1 passes, 25 coins vest

    ```text
    V = 75
    V' = 25
    ```

3. During vesting period 2, 5 coins are transfered and 5 coins are delegated

    ```text
    DV = 5
    BC = 91
    ```

4. Vesting period 2 passes, 25 coins vest

    ```text
    V = 50
    V' = 50
    ```

## Glossary

* OriginalVesting: The amount of coins (per denomination) that are initially
part of a vesting account. These coins are set at genesis.
* StartTime: The BFT time at which a vesting account starts to vest.
* EndTime: The BFT time at which a vesting account is fully vested.
* DelegatedFree: The tracked amount of coins (per denomination) that are
delegated from a vesting account that have been fully vested at time of delegation.
* DelegatedVesting: The tracked amount of coins (per denomination) that are
delegated from a vesting account that were vesting at time of delegation.
* ContinuousVestingAccount: A vesting account implementation that vests coins
linearly over time.
* DelayedVestingAccount: A vesting account implementation that only fully vests
all coins at a given time.
* PeriodicVestingAccount: A vesting account implementation that vests coins
according to a custom vesting schedule.
* PermanentLockedAccount: It does not ever release coins, locking them indefinitely.
Coins in this account can still be used for delegating and for governance votes even while locked.


## CLI

A user can query and interact with the `vesting` module using the CLI.

### Transactions

The `tx` commands allow users to interact with the `vesting` module.

```bash
simd tx vesting --help
```

#### create-periodic-vesting-account

The `create-periodic-vesting-account` command creates a new vesting account funded with an allocation of tokens, where a sequence of coins and period length in seconds. Periods are sequential, in that the duration of of a period only starts at the end of the previous period. The duration of the first period starts upon account creation.

```bash
simd tx vesting create-periodic-vesting-account [to_address] [periods_json_file] [flags]
```

Example:

```bash
simd tx vesting create-periodic-vesting-account cosmos1.. periods.json
```

#### create-vesting-account

The `create-vesting-account` command creates a new vesting account funded with an allocation of tokens. The account can either be a delayed or continuous vesting account, which is determined by the '--delayed' flag. All vesting accouts created will have their start time set by the committed block's time. The end_time must be provided as a UNIX epoch timestamp.

```bash
simd tx vesting create-vesting-account [to_address] [amount] [end_time] [flags]
```

Example:

```bash
simd tx vesting create-vesting-account cosmos1.. 100stake 2592000
```
