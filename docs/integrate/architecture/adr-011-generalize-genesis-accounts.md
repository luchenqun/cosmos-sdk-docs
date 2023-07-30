# ADR 011: 通用化创世账户

## 变更日志

* 2019-08-30: 初始草稿

## 背景

目前，Cosmos SDK 允许自定义账户类型；`auth` keeper 存储任何满足其 `Account` 接口的类型。然而，`auth` 不处理将账户导出或加载到/从创世文件中的操作，这由 `genaccounts` 完成，它只处理 4 种具体的账户类型之一（`BaseAccount`、`ContinuousVestingAccount`、`DelayedVestingAccount` 和 `ModuleAccount`）。

希望使用自定义账户（例如自定义锁仓账户）的项目需要分叉并修改 `genaccounts`。

## 决策

总结一下，我们将直接使用 amino 对所有账户（接口类型）进行（反）序列化，而不是转换为 `genaccounts` 的 `GenesisAccount` 类型。由于这样做会删除大部分 `genaccounts` 的代码，我们将把 `genaccounts` 合并到 `auth` 中。序列化后的账户将存储在 `auth` 的创世状态中。

详细变更如下：

### 1) 使用 amino 直接（反）序列化账户

`auth` 模块的 `GenesisState` 增加一个新字段 `Accounts`。请注意，由于第 3 节中概述的原因，这些账户不是 `exported.Account` 类型。

```go
// GenesisState - all auth state that must be provided at genesis
type GenesisState struct {
    Params   Params           `json:"params" yaml:"params"`
    Accounts []GenesisAccount `json:"accounts" yaml:"accounts"`
}
```

现在，`auth` 的 `InitGenesis` 和 `ExportGenesis` 将（反）序列化账户以及定义的参数。

```go
// InitGenesis - Init store state from genesis data
func InitGenesis(ctx sdk.Context, ak AccountKeeper, data GenesisState) {
    ak.SetParams(ctx, data.Params)
    // load the accounts
    for _, a := range data.Accounts {
        acc := ak.NewAccount(ctx, a) // set account number
        ak.SetAccount(ctx, acc)
    }
}

// ExportGenesis returns a GenesisState for a given context and keeper
func ExportGenesis(ctx sdk.Context, ak AccountKeeper) GenesisState {
    params := ak.GetParams(ctx)

    var genAccounts []exported.GenesisAccount
    ak.IterateAccounts(ctx, func(account exported.Account) bool {
        genAccount := account.(exported.GenesisAccount)
        genAccounts = append(genAccounts, genAccount)
        return false
    })

    return NewGenesisState(params, genAccounts)
}
```

### 2) 在 `auth` 编解码器上注册自定义账户类型

`auth` 编解码器必须注册所有自定义账户类型以进行序列化。我们将遵循 `gov` 提案中建立的模式。

一个示例的自定义账户定义：

```go
import authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

// Register the module account type with the auth module codec so it can decode module accounts stored in a genesis file
func init() {
    authtypes.RegisterAccountTypeCodec(ModuleAccount{}, "cosmos-sdk/ModuleAccount")
}

type ModuleAccount struct {
    ...
```

`auth` 编解码器定义：

```go
var ModuleCdc *codec.LegacyAmino

func init() {
    ModuleCdc = codec.NewLegacyAmino()
    // register module msg's and Account interface
    ...
    // leave the codec unsealed
}

// RegisterAccountTypeCodec registers an external account type defined in another module for the internal ModuleCdc.
func RegisterAccountTypeCodec(o interface{}, name string) {
    ModuleCdc.RegisterConcrete(o, name, nil)
}
```

### 3) 自定义账户类型的创世验证

模块实现了一个 `ValidateGenesis` 方法。由于 `auth` 不知道账户的具体实现，账户需要自行验证。

我们将把账户（反）序列化为包含 `Validate` 方法的 `GenesisAccount` 接口。

```go
type GenesisAccount interface {
    exported.Account
    Validate() error
}
```

然后，`auth` 的 `ValidateGenesis` 函数变为：

```go
// ValidateGenesis performs basic validation of auth genesis data returning an
// error for any failed validation criteria.
func ValidateGenesis(data GenesisState) error {
    // Validate params
    ...

    // Validate accounts
    addrMap := make(map[string]bool, len(data.Accounts))
    for _, acc := range data.Accounts {

        // check for duplicated accounts
        addrStr := acc.GetAddress().String()
        if _, ok := addrMap[addrStr]; ok {
            return fmt.Errorf("duplicate account found in genesis state; address: %s", addrStr)
        }
        addrMap[addrStr] = true

        // check account specific validation
        if err := acc.Validate(); err != nil {
            return fmt.Errorf("invalid account found in genesis state; address: %s, error: %s", addrStr, err.Error())
        }

    }
    return nil
}
```

### 4) 将 add-genesis-account 命令行工具移至 `auth`

`genaccounts`模块包含一个命令行命令，用于向创世文件中添加基本账户或锁定账户。

这将被移动到`auth`模块。我们将让项目自己编写命令来添加自定义账户。可以创建一个可扩展的命令行处理程序，类似于`gov`，但对于这个小的用例来说，这样做并不值得复杂化。

### 5) 更新模块和锁定账户

在新方案下，模块和锁定账户类型需要进行一些小的更新：

* 在`auth`的编解码器上进行类型注册（如上所示）
* 每个`Account`具体类型都需要一个`Validate`方法

## 状态

建议中

## 影响

### 积极影响

* 可以使用自定义账户而无需分叉`genaccounts`
* 代码行数减少

### 消极影响

### 中性影响

* `genaccounts`模块不再存在
* 创世文件中的账户存储在`auth`的`accounts`下，而不是`genaccounts`模块中。
-`add-genesis-account`命令现在在`auth`中


# ADR 011: Generalize Genesis Accounts

## Changelog

* 2019-08-30: initial draft

## Context

Currently, the Cosmos SDK allows for custom account types; the `auth` keeper stores any type fulfilling its `Account` interface. However `auth` does not handle exporting or loading accounts to/from a genesis file, this is done by `genaccounts`, which only handles one of 4 concrete account types (`BaseAccount`, `ContinuousVestingAccount`, `DelayedVestingAccount` and `ModuleAccount`).

Projects desiring to use custom accounts (say custom vesting accounts) need to fork and modify `genaccounts`.

## Decision

In summary, we will (un)marshal all accounts (interface types) directly using amino, rather than converting to `genaccounts`’s `GenesisAccount` type. Since doing this removes the majority of `genaccounts`'s code, we will merge `genaccounts` into `auth`. Marshalled accounts will be stored in `auth`'s genesis state.

Detailed changes:

### 1) (Un)Marshal accounts directly using amino

The `auth` module's `GenesisState` gains a new field `Accounts`. Note these aren't of type `exported.Account` for reasons outlined in section 3.

```go
// GenesisState - all auth state that must be provided at genesis
type GenesisState struct {
    Params   Params           `json:"params" yaml:"params"`
    Accounts []GenesisAccount `json:"accounts" yaml:"accounts"`
}
```

Now `auth`'s `InitGenesis` and `ExportGenesis` (un)marshal accounts as well as the defined params.

```go
// InitGenesis - Init store state from genesis data
func InitGenesis(ctx sdk.Context, ak AccountKeeper, data GenesisState) {
    ak.SetParams(ctx, data.Params)
    // load the accounts
    for _, a := range data.Accounts {
        acc := ak.NewAccount(ctx, a) // set account number
        ak.SetAccount(ctx, acc)
    }
}

// ExportGenesis returns a GenesisState for a given context and keeper
func ExportGenesis(ctx sdk.Context, ak AccountKeeper) GenesisState {
    params := ak.GetParams(ctx)

    var genAccounts []exported.GenesisAccount
    ak.IterateAccounts(ctx, func(account exported.Account) bool {
        genAccount := account.(exported.GenesisAccount)
        genAccounts = append(genAccounts, genAccount)
        return false
    })

    return NewGenesisState(params, genAccounts)
}
```

### 2) Register custom account types on the `auth` codec

The `auth` codec must have all custom account types registered to marshal them. We will follow the pattern established in `gov` for proposals.

An example custom account definition:

```go
import authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

// Register the module account type with the auth module codec so it can decode module accounts stored in a genesis file
func init() {
    authtypes.RegisterAccountTypeCodec(ModuleAccount{}, "cosmos-sdk/ModuleAccount")
}

type ModuleAccount struct {
    ...
```

The `auth` codec definition:

```go
var ModuleCdc *codec.LegacyAmino

func init() {
    ModuleCdc = codec.NewLegacyAmino()
    // register module msg's and Account interface
    ...
    // leave the codec unsealed
}

// RegisterAccountTypeCodec registers an external account type defined in another module for the internal ModuleCdc.
func RegisterAccountTypeCodec(o interface{}, name string) {
    ModuleCdc.RegisterConcrete(o, name, nil)
}
```

### 3) Genesis validation for custom account types

Modules implement a `ValidateGenesis` method. As `auth` does not know of account implementations, accounts will need to validate themselves.

We will unmarshal accounts into a `GenesisAccount` interface that includes a `Validate` method.

```go
type GenesisAccount interface {
    exported.Account
    Validate() error
}
```

Then the `auth` `ValidateGenesis` function becomes:

```go
// ValidateGenesis performs basic validation of auth genesis data returning an
// error for any failed validation criteria.
func ValidateGenesis(data GenesisState) error {
    // Validate params
    ...

    // Validate accounts
    addrMap := make(map[string]bool, len(data.Accounts))
    for _, acc := range data.Accounts {

        // check for duplicated accounts
        addrStr := acc.GetAddress().String()
        if _, ok := addrMap[addrStr]; ok {
            return fmt.Errorf("duplicate account found in genesis state; address: %s", addrStr)
        }
        addrMap[addrStr] = true

        // check account specific validation
        if err := acc.Validate(); err != nil {
            return fmt.Errorf("invalid account found in genesis state; address: %s, error: %s", addrStr, err.Error())
        }

    }
    return nil
}
```

### 4) Move add-genesis-account cli to `auth`

The `genaccounts` module contains a cli command to add base or vesting accounts to a genesis file.

This will be moved to `auth`. We will leave it to projects to write their own commands to add custom accounts. An extensible cli handler, similar to `gov`, could be created but it is not worth the complexity for this minor use case.

### 5) Update module and vesting accounts

Under the new scheme, module and vesting account types need some minor updates:

* Type registration on `auth`'s codec (shown above)
* A `Validate` method for each `Account` concrete type

## Status

Proposed

## Consequences

### Positive

* custom accounts can be used without needing to fork `genaccounts`
* reduction in lines of code

### Negative

### Neutral

* `genaccounts` module no longer exists
* accounts in genesis files are stored under `accounts` in `auth` rather than in the `genaccounts` module.
-`add-genesis-account` cli command now in `auth`

## References
