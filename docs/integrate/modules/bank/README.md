# `x/bank`

## 摘要

本文档规定了 Cosmos SDK 的银行模块。

银行模块负责处理账户之间的多资产币转移，并跟踪特殊情况下的伪转账，这些伪转账必须以不同的方式与特定类型的账户（特别是用于授予/取消授予的锁定账户）进行交互。它提供了几个接口，用于与其他必须修改用户余额的模块进行安全交互。

此外，银行模块还跟踪并提供查询支持，用于应用程序中使用的所有资产的总供应量。

该模块在 Cosmos Hub 中使用。

## 目录

* [供应](#供应)
    * [总供应量](#总供应量)
* [模块账户](#模块账户)
    * [权限](#权限)
* [状态](#状态)
* [参数](#参数)
* [保管人](#保管人)
* [消息](#消息)
* [事件](#事件)
    * [消息事件](#消息事件)
    * [保管人事件](#保管人事件)
* [参数](#参数)
    * [发送启用](#发送启用)
    * [默认发送启用](#默认发送启用)
* [客户端](#客户端)
    * [CLI](#CLI)
    * [查询](#查询)
    * [交易](#交易)
* [gRPC](#gRPC)

## 供应

`供应` 功能：

* 被动地跟踪链上的币的总供应量，
* 为模块持有/与 `Coins` 交互提供了一种模式，以及
* 引入了不变式检查，以验证链的总供应量。

### 总供应量

网络的总 `供应` 等于账户中所有币的总和。每当铸造（例如，作为通胀机制的一部分）或销毁（例如，由于惩罚或否决治理提案）`Coin` 时，总供应量都会更新。

## 模块账户

供应功能引入了一种新类型的 `auth.Account`，模块可以使用它来分配代币，并在特殊情况下铸造或销毁代币。在基本级别上，这些模块账户能够与 `auth.Account` 和其他模块账户之间发送/接收代币。这种设计取代了以前的替代设计，其中模块会从发送方账户中销毁传入的代币，然后在内部跟踪这些代币。稍后，为了发送代币，模块需要在目标账户内有效地铸造代币。新的设计消除了模块之间执行此账务操作的重复逻辑。

`ModuleAccount` 接口定义如下：

```go
type ModuleAccount interface {
  auth.Account               // same methods as the Account interface

  GetName() string           // name of the module; used to obtain the address
  GetPermissions() []string  // permissions of module account
  HasPermission(string) bool
}
```

> **警告！**
> 任何允许直接或间接发送资金的模块或消息处理程序必须明确保证这些资金不能发送到模块账户（除非允许）。

`supply` `Keeper` 还引入了与 `auth` `Keeper` 和 `bank` `Keeper` 相关的新包装函数，以便能够：

* 通过提供 `Name` 来获取和设置 `ModuleAccount`。
* 通过仅传递 `Name`，将硬币从其他 `ModuleAccount` 或标准 `Account`（`BaseAccount` 或 `VestingAccount`）发送到其他 `ModuleAccount` 或标准 `Account`。
* 为 `ModuleAccount`（仅限于其权限）进行 `Mint` 或 `Burn` 硬币。

### 权限

每个 `ModuleAccount` 都有一组不同的权限，提供执行某些操作的不同对象功能。权限需要在创建 `supply` `Keeper` 时进行注册，以便每次 `ModuleAccount` 调用允许的函数时，`Keeper` 可以查找该特定账户的权限并执行或不执行该操作。

可用的权限有：

* `Minter`：允许模块铸造特定数量的硬币。
* `Burner`：允许模块销毁特定数量的硬币。
* `Staking`：允许模块委托和取消委托特定数量的硬币。

## 状态

`x/bank` 模块保留以下主要对象的状态：

1. 账户余额
2. 货币单位元数据
3. 所有余额的总供应量
4. 允许发送的货币单位的信息。

此外，`x/bank` 模块保留以下索引来管理上述状态：

* 供应索引：`0x0 | byte(denom) -> byte(amount)`
* 货币单位元数据索引：`0x1 | byte(denom) -> ProtocolBuffer(Metadata)`
* 余额索引：`0x2 | byte(address length) | []byte(address) | []byte(balance.Denom) -> ProtocolBuffer(balance)`
* 反向货币单位到地址索引：`0x03 | byte(denom) | 0x00 | []byte(address) -> 0`

## 参数

银行模块将其参数存储在具有前缀 `0x05` 的状态中，可以通过治理或具有权限的地址进行更新。

* 参数：`0x05 | ProtocolBuffer(Params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/bank.proto#L12-L23
```

## 保管者

银行模块提供了这些可导出的保管者接口，可以传递给其他模块以读取或更新账户余额。模块应该使用提供所需功能的最低权限接口。

最佳实践要求仔细审查 `bank` 模块的代码，以确保权限被限制在您所期望的方式。

### 被拒绝的地址

`x/bank` 模块接受一个地址映射，这些地址被视为被列入黑名单，不能直接或明确地通过诸如 `MsgSend`、`MsgMultiSend` 和直接的 API 调用（如 `SendCoinsFromModuleToAccount`）接收资金。

通常，这些地址是模块账户。如果这些地址在状态机的预期规则之外接收资金，可能会破坏不变式，并导致网络停止。

通过向 `x/bank` 模块提供一个被列入黑名单的地址集合，如果用户或客户端尝试直接或间接地向被列入黑名单的账户发送资金，例如通过 [IBC](https://ibc.cosmos.network) 使用，操作将会出错。

### 常见类型

#### 输入

多方转账的输入

```protobuf
// Input models transaction input.
message Input {
  string   address                        = 1;
  repeated cosmos.base.v1beta1.Coin coins = 2;
}
```

#### 输出

多方转账的输出

```protobuf
// Output models transaction outputs.
message Output {
  string   address                        = 1;
  repeated cosmos.base.v1beta1.Coin coins = 2;
}
```

### BaseKeeper

基础保管者提供完全权限访问：能够任意修改任何账户的余额，并铸造或销毁代币。

通过使用带有 `WithMintCoinsRestriction` 的 baseKeeper，可以实现对每个模块的铸币权限的限制（例如，只铸造特定的代币）。

```go
// Keeper defines a module interface that facilitates the transfer of coins
// between accounts.
type Keeper interface {
    SendKeeper
    WithMintCoinsRestriction(MintingRestrictionFn) BaseKeeper

    InitGenesis(context.Context, *types.GenesisState)
    ExportGenesis(context.Context) *types.GenesisState

    GetSupply(ctx context.Context, denom string) sdk.Coin
    HasSupply(ctx context.Context, denom string) bool
    GetPaginatedTotalSupply(ctx context.Context, pagination *query.PageRequest) (sdk.Coins, *query.PageResponse, error)
    IterateTotalSupply(ctx context.Context, cb func(sdk.Coin) bool)
    GetDenomMetaData(ctx context.Context, denom string) (types.Metadata, bool)
    HasDenomMetaData(ctx context.Context, denom string) bool
    SetDenomMetaData(ctx context.Context, denomMetaData types.Metadata)
    IterateAllDenomMetaData(ctx context.Context, cb func(types.Metadata) bool)

    SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
    SendCoinsFromModuleToModule(ctx context.Context, senderModule, recipientModule string, amt sdk.Coins) error
    SendCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error
    DelegateCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error
    UndelegateCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
    MintCoins(ctx context.Context, moduleName string, amt sdk.Coins) error
    BurnCoins(ctx context.Context, moduleName string, amt sdk.Coins) error

    DelegateCoins(ctx context.Context, delegatorAddr, moduleAccAddr sdk.AccAddress, amt sdk.Coins) error
    UndelegateCoins(ctx context.Context, moduleAccAddr, delegatorAddr sdk.AccAddress, amt sdk.Coins) error

    // GetAuthority gets the address capable of executing governance proposal messages. Usually the gov module account.
    GetAuthority() string

    types.QueryServer
}
```

### SendKeeper

发送保管者提供对账户余额的访问以及在账户之间转移代币的能力。发送保管者不会改变总供应量（铸造或销毁代币）。

```go
// SendKeeper defines a module interface that facilitates the transfer of coins
// between accounts without the possibility of creating coins.
type SendKeeper interface {
    ViewKeeper

    InputOutputCoins(ctx context.Context, inputs types.Input, outputs []types.Output) error
    SendCoins(ctx context.Context, fromAddr sdk.AccAddress, toAddr sdk.AccAddress, amt sdk.Coins) error

    GetParams(ctx context.Context) types.Params
    SetParams(ctx context.Context, params types.Params) error

    IsSendEnabledDenom(ctx context.Context, denom string) bool
    SetSendEnabled(ctx context.Context, denom string, value bool)
    SetAllSendEnabled(ctx context.Context, sendEnableds []*types.SendEnabled)
    DeleteSendEnabled(ctx context.Context, denom string)
    IterateSendEnabledEntries(ctx context.Context, cb func(denom string, sendEnabled bool) (stop bool))
    GetAllSendEnabledEntries(ctx context.Context) []types.SendEnabled

    IsSendEnabledCoin(ctx context.Context, coin sdk.Coin) bool
    IsSendEnabledCoins(ctx context.Context, coins ...sdk.Coin) error

    BlockedAddr(addr sdk.AccAddress) bool
}
```

### ViewKeeper

查看保管者提供对账户余额的只读访问。查看保管者没有余额修改功能。所有余额查询的时间复杂度为 `O(1)`。

```go
// ViewKeeper defines a module interface that facilitates read only access to
// account balances.
type ViewKeeper interface {
    ValidateBalance(ctx context.Context, addr sdk.AccAddress) error
    HasBalance(ctx context.Context, addr sdk.AccAddress, amt sdk.Coin) bool

    GetAllBalances(ctx context.Context, addr sdk.AccAddress) sdk.Coins
    GetAccountsBalances(ctx context.Context) []types.Balance
    GetBalance(ctx context.Context, addr sdk.AccAddress, denom string) sdk.Coin
    LockedCoins(ctx context.Context, addr sdk.AccAddress) sdk.Coins
    SpendableCoins(ctx context.Context, addr sdk.AccAddress) sdk.Coins
    SpendableCoin(ctx context.Context, addr sdk.AccAddress, denom string) sdk.Coin

    IterateAccountBalances(ctx context.Context, addr sdk.AccAddress, cb func(coin sdk.Coin) (stop bool))
    IterateAllBalances(ctx context.Context, cb func(address sdk.AccAddress, coin sdk.Coin) (stop bool))
}
```

## 消息

### MsgSend

从一个地址发送货币到另一个地址。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L38-L53
```

以下情况下，该消息将失败：

* 货币没有发送权限
* `to` 地址受限制

### MsgMultiSend

从一个发送者地址发送货币到一系列不同的地址。如果任何接收地址不对应现有账户，将创建一个新账户。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L58-L69
```

以下情况下，该消息将失败：

* 任何货币没有发送权限
* 任何 `to` 地址受限制
* 任何货币被锁定
* 输入和输出不正确对应

### MsgUpdateParams

可以通过 `MsgUpdateParams` 更新 `bank` 模块的参数，可以使用治理提案来完成。签名者将始终是 `gov` 模块账户地址。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L74-L88
```

以下情况下，消息处理可能失败：

* 签名者不是 `gov` 模块账户地址。

### MsgSetSendEnabled

与 `x/gov` 模块一起使用，用于设置创建/编辑 SendEnabled 条目。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L96-L117
```

以下情况下，该消息将失败：

* 权限不是 bech32 地址。
* 权限不是 `x/gov` 模块的地址。
* 存在多个具有相同 Denom 的 SendEnabled 条目。
* 一个或多个 SendEnabled 条目具有无效的 Denom。

## 事件

银行模块会发出以下事件：

### 消息事件

#### MsgSend

| 类型     | 属性键        | 属性值             |
| -------- | ------------- | ------------------ |
| 转账     | 收款人         | {recipientAddress} |
| 转账     | 数量           | {amount}           |
| 消息     | 模块           | bank               |
| 消息     | 动作           | send               |
| 消息     | 发送者         | {senderAddress}    |

#### MsgMultiSend

| 类型      | 属性键        | 属性值             |
| --------- | ------------- | ------------------ |
| 转账      | 收款人         | {recipientAddress} |
| 转账      | 数量           | {amount}           |
| 消息      | 模块           | bank               |
| 消息      | 动作           | multisend          |
| 消息      | 发送者         | {senderAddress}    |

### Keeper 事件

除了消息事件之外，当调用以下方法时（或任何最终调用它们的方法），银行 keeper 将产生事件。

#### MintCoins

```json
{
  "type": "coinbase",
  "attributes": [
    {
      "key": "minter",
      "value": "{{sdk.AccAddress of the module minting coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being minted}}",
      "index": true
    }
  ]
}
```

```json
{
  "type": "coin_received",
  "attributes": [
    {
      "key": "receiver",
      "value": "{{sdk.AccAddress of the module minting coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being received}}",
      "index": true
    }
  ]
}
```

#### BurnCoins

```json
{
  "type": "burn",
  "attributes": [
    {
      "key": "burner",
      "value": "{{sdk.AccAddress of the module burning coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being burned}}",
      "index": true
    }
  ]
}
```

```json
{
  "type": "coin_spent",
  "attributes": [
    {
      "key": "spender",
      "value": "{{sdk.AccAddress of the module burning coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being burned}}",
      "index": true
    }
  ]
}
```

#### addCoins

```json
{
  "type": "coin_received",
  "attributes": [
    {
      "key": "receiver",
      "value": "{{sdk.AccAddress of the address beneficiary of the coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being received}}",
      "index": true
    }
  ]
}
```

#### subUnlockedCoins/DelegateCoins

```json
{
  "type": "coin_spent",
  "attributes": [
    {
      "key": "spender",
      "value": "{{sdk.AccAddress of the address which is spending coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being spent}}",
      "index": true
    }
  ]
}
```

## 参数

银行模块包含以下参数

### SendEnabled

SendEnabled 参数已被弃用，不再使用。它已被状态存储记录所取代。

### DefaultSendEnabled

默认的 send enabled 值控制所有币种的转账能力，除非特别包含在 `SendEnabled` 参数数组中。

## 客户端

### CLI

用户可以使用 CLI 查询和与 `bank` 模块进行交互。

#### 查询

`query` 命令允许用户查询 `bank` 的状态。

```shell
simd query bank --help
```

##### balances

`balances` 命令允许用户按地址查询账户余额。

```shell
simd query bank balances [address] [flags]
```

示例：

```shell
simd query bank balances cosmos1..
```

示例输出：

```yml
balances:
- amount: "1000000000"
  denom: stake
pagination:
  next_key: null
  total: "0"
```

##### denom-metadata

`denom-metadata` 命令允许用户查询币种的元数据。用户可以使用 `--denom` 标志查询单个币种的元数据，或者不使用该标志查询所有币种的元数据。

```shell
simd query bank denom-metadata [flags]
```

示例：

```shell
simd query bank denom-metadata --denom stake
```

示例输出：

```yml
metadata:
  base: stake
  denom_units:
  - aliases:
    - STAKE
    denom: stake
  description: native staking token of simulation app
  display: stake
  name: SimApp Token
  symbol: STK
```

##### total

`total` 命令允许用户查询币的总供应量。用户可以使用 `--denom` 标志查询单个币的总供应量，或者不使用该标志查询所有币的总供应量。

```shell
simd query bank total [flags]
```

示例：

```shell
simd query bank total --denom stake
```

示例输出：

```yml
amount: "10000000000"
denom: stake
```

##### send-enabled

`send-enabled` 命令允许用户查询所有或某些 SendEnabled 条目。

```shell
simd query bank send-enabled [denom1 ...] [flags]
```

示例：

```shell
simd query bank send-enabled
```

示例输出：

```yml
send_enabled:
- denom: foocoin
  enabled: true
- denom: barcoin
pagination:
  next-key: null
  total: 2 
```

#### 交易

`tx` 命令允许用户与 `bank` 模块进行交互。

```shell
simd tx bank --help
```

##### send

`send` 命令允许用户从一个账户向另一个账户发送资金。

```shell
simd tx bank send [from_key_or_address] [to_address] [amount] [flags]
```

示例：

```shell
simd tx bank send cosmos1.. cosmos1.. 100stake
```

## gRPC

用户可以使用 gRPC 端点查询 `bank` 模块。

### Balance

`Balance` 端点允许用户根据地址和给定的货币单位查询账户余额。

```shell
cosmos.bank.v1beta1.Query/Balance
```

示例：

```shell
grpcurl -plaintext \
    -d '{"address":"cosmos1..","denom":"stake"}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/Balance
```

示例输出：

```json
{
  "balance": {
    "denom": "stake",
    "amount": "1000000000"
  }
}
```

### AllBalances

`AllBalances` 端点允许用户根据地址查询所有货币单位的账户余额。

```shell
cosmos.bank.v1beta1.Query/AllBalances
```

示例：

```shell
grpcurl -plaintext \
    -d '{"address":"cosmos1.."}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/AllBalances
```

示例输出：

```json
{
  "balances": [
    {
      "denom": "stake",
      "amount": "1000000000"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### DenomMetadata

`DenomMetadata` 端点允许用户查询单个货币单位的元数据。

```shell
cosmos.bank.v1beta1.Query/DenomMetadata
```

示例：

```shell
grpcurl -plaintext \
    -d '{"denom":"stake"}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/DenomMetadata
```

示例输出：

```json
{
  "metadata": {
    "description": "native staking token of simulation app",
    "denomUnits": [
      {
        "denom": "stake",
        "aliases": [
          "STAKE"
        ]
      }
    ],
    "base": "stake",
    "display": "stake",
    "name": "SimApp Token",
    "symbol": "STK"
  }
}
```

### DenomsMetadata

`DenomsMetadata` 端点允许用户查询所有货币单位的元数据。

```shell
cosmos.bank.v1beta1.Query/DenomsMetadata
```

示例：

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/DenomsMetadata
```

示例输出：

```json
{
  "metadatas": [
    {
      "description": "native staking token of simulation app",
      "denomUnits": [
        {
          "denom": "stake",
          "aliases": [
            "STAKE"
          ]
        }
      ],
      "base": "stake",
      "display": "stake",
      "name": "SimApp Token",
      "symbol": "STK"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### DenomOwners

`DenomOwners` 端点允许用户查询单个货币单位的元数据。

```shell
cosmos.bank.v1beta1.Query/DenomOwners
```

示例：

```shell
grpcurl -plaintext \
    -d '{"denom":"stake"}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/DenomOwners
```

示例输出：

```json
{
  "denomOwners": [
    {
      "address": "cosmos1..",
      "balance": {
        "denom": "stake",
        "amount": "5000000000"
      }
    },
    {
      "address": "cosmos1..",
      "balance": {
        "denom": "stake",
        "amount": "5000000000"
      }
    },
  ],
  "pagination": {
    "total": "2"
  }
}
```

### TotalSupply

`TotalSupply` 端点允许用户查询所有币种的总供应量。

```shell
cosmos.bank.v1beta1.Query/TotalSupply
```

示例：

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/TotalSupply
```

示例输出：

```json
{
  "supply": [
    {
      "denom": "stake",
      "amount": "10000000000"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### SupplyOf

`SupplyOf` 端点允许用户查询单个币种的总供应量。

```shell
cosmos.bank.v1beta1.Query/SupplyOf
```

示例：

```shell
grpcurl -plaintext \
    -d '{"denom":"stake"}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/SupplyOf
```

示例输出：

```json
{
  "amount": {
    "denom": "stake",
    "amount": "10000000000"
  }
}
```

### Params

`Params` 端点允许用户查询 `bank` 模块的参数。

```shell
cosmos.bank.v1beta1.Query/Params
```

示例：

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/Params
```

示例输出：

```json
{
  "params": {
    "defaultSendEnabled": true
  }
}
```

### SendEnabled

`SendEnabled` 端点允许用户查询 `bank` 模块的 SendEnabled 条目。

如果没有返回任何币种，使用 `Params.DefaultSendEnabled` 值。

```shell
cosmos.bank.v1beta1.Query/SendEnabled
```

示例：

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/SendEnabled
```

示例输出：

```json
{
  "send_enabled": [
    {
      "denom": "foocoin",
      "enabled": true
    },
    {
      "denom": "barcoin"
    }
  ],
  "pagination": {
    "next-key": null,
    "total": 2
  }
}
```




# `x/bank`

## Abstract

This document specifies the bank module of the Cosmos SDK.

The bank module is responsible for handling multi-asset coin transfers between
accounts and tracking special-case pseudo-transfers which must work differently
with particular kinds of accounts (notably delegating/undelegating for vesting
accounts). It exposes several interfaces with varying capabilities for secure
interaction with other modules which must alter user balances.

In addition, the bank module tracks and provides query support for the total
supply of all assets used in the application.

This module is used in the Cosmos Hub.

## Contents

* [Supply](#supply)
    * [Total Supply](#total-supply)
* [Module Accounts](#module-accounts)
    * [Permissions](#permissions)
* [State](#state)
* [Params](#params)
* [Keepers](#keepers)
* [Messages](#messages)
* [Events](#events)
    * [Message Events](#message-events)
    * [Keeper Events](#keeper-events)
* [Parameters](#parameters)
    * [SendEnabled](#sendenabled)
    * [DefaultSendEnabled](#defaultsendenabled)
* [Client](#client)
    * [CLI](#cli)
    * [Query](#query)
    * [Transactions](#transactions)
* [gRPC](#grpc)

## Supply

The `supply` functionality:

* passively tracks the total supply of coins within a chain,
* provides a pattern for modules to hold/interact with `Coins`, and
* introduces the invariant check to verify a chain's total supply.

### Total Supply

The total `Supply` of the network is equal to the sum of all coins from the
account. The total supply is updated every time a `Coin` is minted (eg: as part
of the inflation mechanism) or burned (eg: due to slashing or if a governance
proposal is vetoed).

## Module Accounts

The supply functionality introduces a new type of `auth.Account` which can be used by
modules to allocate tokens and in special cases mint or burn tokens. At a base
level these module accounts are capable of sending/receiving tokens to and from
`auth.Account`s and other module accounts. This design replaces previous
alternative designs where, to hold tokens, modules would burn the incoming
tokens from the sender account, and then track those tokens internally. Later,
in order to send tokens, the module would need to effectively mint tokens
within a destination account. The new design removes duplicate logic between
modules to perform this accounting.

The `ModuleAccount` interface is defined as follows:

```go
type ModuleAccount interface {
  auth.Account               // same methods as the Account interface

  GetName() string           // name of the module; used to obtain the address
  GetPermissions() []string  // permissions of module account
  HasPermission(string) bool
}
```

> **WARNING!**
> Any module or message handler that allows either direct or indirect sending of funds must explicitly guarantee those funds cannot be sent to module accounts (unless allowed).

The supply `Keeper` also introduces new wrapper functions for the auth `Keeper`
and the bank `Keeper` that are related to `ModuleAccount`s in order to be able
to:

* Get and set `ModuleAccount`s by providing the `Name`.
* Send coins from and to other `ModuleAccount`s or standard `Account`s
  (`BaseAccount` or `VestingAccount`) by passing only the `Name`.
* `Mint` or `Burn` coins for a `ModuleAccount` (restricted to its permissions).

### Permissions

Each `ModuleAccount` has a different set of permissions that provide different
object capabilities to perform certain actions. Permissions need to be
registered upon the creation of the supply `Keeper` so that every time a
`ModuleAccount` calls the allowed functions, the `Keeper` can lookup the
permissions to that specific account and perform or not perform the action.

The available permissions are:

* `Minter`: allows for a module to mint a specific amount of coins.
* `Burner`: allows for a module to burn a specific amount of coins.
* `Staking`: allows for a module to delegate and undelegate a specific amount of coins.

## State

The `x/bank` module keeps state of the following primary objects:

1. Account balances
2. Denomination metadata
3. The total supply of all balances
4. Information on which denominations are allowed to be sent.

In addition, the `x/bank` module keeps the following indexes to manage the
aforementioned state:

* Supply Index: `0x0 | byte(denom) -> byte(amount)`
* Denom Metadata Index: `0x1 | byte(denom) -> ProtocolBuffer(Metadata)`
* Balances Index: `0x2 | byte(address length) | []byte(address) | []byte(balance.Denom) -> ProtocolBuffer(balance)`
* Reverse Denomination to Address Index: `0x03 | byte(denom) | 0x00 | []byte(address) -> 0`

## Params

The bank module stores it's params in state with the prefix of `0x05`,
it can be updated with governance or the address with authority.

* Params: `0x05 | ProtocolBuffer(Params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/bank.proto#L12-L23
```

## Keepers

The bank module provides these exported keeper interfaces that can be
passed to other modules that read or update account balances. Modules
should use the least-permissive interface that provides the functionality they
require.

Best practices dictate careful review of `bank` module code to ensure that
permissions are limited in the way that you expect.

### Denied Addresses

The `x/bank` module accepts a map of addresses that are considered blocklisted
from directly and explicitly receiving funds through means such as `MsgSend` and
`MsgMultiSend` and direct API calls like `SendCoinsFromModuleToAccount`.

Typically, these addresses are module accounts. If these addresses receive funds
outside the expected rules of the state machine, invariants are likely to be
broken and could result in a halted network.

By providing the `x/bank` module with a blocklisted set of addresses, an error occurs for the operation if a user or client attempts to directly or indirectly send funds to a blocklisted account, for example, by using [IBC](https://ibc.cosmos.network).

### Common Types

#### Input

An input of a multiparty transfer

```protobuf
// Input models transaction input.
message Input {
  string   address                        = 1;
  repeated cosmos.base.v1beta1.Coin coins = 2;
}
```

#### Output

An output of a multiparty transfer.

```protobuf
// Output models transaction outputs.
message Output {
  string   address                        = 1;
  repeated cosmos.base.v1beta1.Coin coins = 2;
}
```

### BaseKeeper

The base keeper provides full-permission access: the ability to arbitrary modify any account's balance and mint or burn coins.

Restricted permission to mint per module could be achieved by using baseKeeper with `WithMintCoinsRestriction` to give specific restrictions to mint (e.g. only minting certain denom).

```go
// Keeper defines a module interface that facilitates the transfer of coins
// between accounts.
type Keeper interface {
    SendKeeper
    WithMintCoinsRestriction(MintingRestrictionFn) BaseKeeper

    InitGenesis(context.Context, *types.GenesisState)
    ExportGenesis(context.Context) *types.GenesisState

    GetSupply(ctx context.Context, denom string) sdk.Coin
    HasSupply(ctx context.Context, denom string) bool
    GetPaginatedTotalSupply(ctx context.Context, pagination *query.PageRequest) (sdk.Coins, *query.PageResponse, error)
    IterateTotalSupply(ctx context.Context, cb func(sdk.Coin) bool)
    GetDenomMetaData(ctx context.Context, denom string) (types.Metadata, bool)
    HasDenomMetaData(ctx context.Context, denom string) bool
    SetDenomMetaData(ctx context.Context, denomMetaData types.Metadata)
    IterateAllDenomMetaData(ctx context.Context, cb func(types.Metadata) bool)

    SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
    SendCoinsFromModuleToModule(ctx context.Context, senderModule, recipientModule string, amt sdk.Coins) error
    SendCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error
    DelegateCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error
    UndelegateCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
    MintCoins(ctx context.Context, moduleName string, amt sdk.Coins) error
    BurnCoins(ctx context.Context, moduleName string, amt sdk.Coins) error

    DelegateCoins(ctx context.Context, delegatorAddr, moduleAccAddr sdk.AccAddress, amt sdk.Coins) error
    UndelegateCoins(ctx context.Context, moduleAccAddr, delegatorAddr sdk.AccAddress, amt sdk.Coins) error

    // GetAuthority gets the address capable of executing governance proposal messages. Usually the gov module account.
    GetAuthority() string

    types.QueryServer
}
```

### SendKeeper

The send keeper provides access to account balances and the ability to transfer coins between
accounts. The send keeper does not alter the total supply (mint or burn coins).

```go
// SendKeeper defines a module interface that facilitates the transfer of coins
// between accounts without the possibility of creating coins.
type SendKeeper interface {
    ViewKeeper

    InputOutputCoins(ctx context.Context, inputs types.Input, outputs []types.Output) error
    SendCoins(ctx context.Context, fromAddr sdk.AccAddress, toAddr sdk.AccAddress, amt sdk.Coins) error

    GetParams(ctx context.Context) types.Params
    SetParams(ctx context.Context, params types.Params) error

    IsSendEnabledDenom(ctx context.Context, denom string) bool
    SetSendEnabled(ctx context.Context, denom string, value bool)
    SetAllSendEnabled(ctx context.Context, sendEnableds []*types.SendEnabled)
    DeleteSendEnabled(ctx context.Context, denom string)
    IterateSendEnabledEntries(ctx context.Context, cb func(denom string, sendEnabled bool) (stop bool))
    GetAllSendEnabledEntries(ctx context.Context) []types.SendEnabled

    IsSendEnabledCoin(ctx context.Context, coin sdk.Coin) bool
    IsSendEnabledCoins(ctx context.Context, coins ...sdk.Coin) error

    BlockedAddr(addr sdk.AccAddress) bool
}
```

### ViewKeeper

The view keeper provides read-only access to account balances. The view keeper does not have balance alteration functionality. All balance lookups are `O(1)`.

```go
// ViewKeeper defines a module interface that facilitates read only access to
// account balances.
type ViewKeeper interface {
    ValidateBalance(ctx context.Context, addr sdk.AccAddress) error
    HasBalance(ctx context.Context, addr sdk.AccAddress, amt sdk.Coin) bool

    GetAllBalances(ctx context.Context, addr sdk.AccAddress) sdk.Coins
    GetAccountsBalances(ctx context.Context) []types.Balance
    GetBalance(ctx context.Context, addr sdk.AccAddress, denom string) sdk.Coin
    LockedCoins(ctx context.Context, addr sdk.AccAddress) sdk.Coins
    SpendableCoins(ctx context.Context, addr sdk.AccAddress) sdk.Coins
    SpendableCoin(ctx context.Context, addr sdk.AccAddress, denom string) sdk.Coin

    IterateAccountBalances(ctx context.Context, addr sdk.AccAddress, cb func(coin sdk.Coin) (stop bool))
    IterateAllBalances(ctx context.Context, cb func(address sdk.AccAddress, coin sdk.Coin) (stop bool))
}
```

## Messages

### MsgSend

Send coins from one address to another.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L38-L53
```

The message will fail under the following conditions:

* The coins do not have sending enabled
* The `to` address is restricted

### MsgMultiSend

Send coins from one sender and to a series of different address. If any of the receiving addresses do not correspond to an existing account, a new account is created.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L58-L69
```

The message will fail under the following conditions:

* Any of the coins do not have sending enabled
* Any of the `to` addresses are restricted
* Any of the coins are locked
* The inputs and outputs do not correctly correspond to one another

### MsgUpdateParams

The `bank` module params can be updated through `MsgUpdateParams`, which can be done using governance proposal. The signer will always be the `gov` module account address. 

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L74-L88
```

The message handling can fail if:

* signer is not the gov module account address.

### MsgSetSendEnabled

Used with the x/gov module to set create/edit SendEnabled entries.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/tx.proto#L96-L117
```

The message will fail under the following conditions:

* The authority is not a bech32 address.
* The authority is not x/gov module's address.
* There are multiple SendEnabled entries with the same Denom.
* One or more SendEnabled entries has an invalid Denom.

## Events

The bank module emits the following events:

### Message Events

#### MsgSend

| Type     | Attribute Key | Attribute Value    |
| -------- | ------------- | ------------------ |
| transfer | recipient     | {recipientAddress} |
| transfer | amount        | {amount}           |
| message  | module        | bank               |
| message  | action        | send               |
| message  | sender        | {senderAddress}    |

#### MsgMultiSend

| Type     | Attribute Key | Attribute Value    |
| -------- | ------------- | ------------------ |
| transfer | recipient     | {recipientAddress} |
| transfer | amount        | {amount}           |
| message  | module        | bank               |
| message  | action        | multisend          |
| message  | sender        | {senderAddress}    |

### Keeper Events

In addition to message events, the bank keeper will produce events when the following methods are called (or any method which ends up calling them)

#### MintCoins

```json
{
  "type": "coinbase",
  "attributes": [
    {
      "key": "minter",
      "value": "{{sdk.AccAddress of the module minting coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being minted}}",
      "index": true
    }
  ]
}
```

```json
{
  "type": "coin_received",
  "attributes": [
    {
      "key": "receiver",
      "value": "{{sdk.AccAddress of the module minting coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being received}}",
      "index": true
    }
  ]
}
```

#### BurnCoins

```json
{
  "type": "burn",
  "attributes": [
    {
      "key": "burner",
      "value": "{{sdk.AccAddress of the module burning coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being burned}}",
      "index": true
    }
  ]
}
```

```json
{
  "type": "coin_spent",
  "attributes": [
    {
      "key": "spender",
      "value": "{{sdk.AccAddress of the module burning coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being burned}}",
      "index": true
    }
  ]
}
```

#### addCoins

```json
{
  "type": "coin_received",
  "attributes": [
    {
      "key": "receiver",
      "value": "{{sdk.AccAddress of the address beneficiary of the coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being received}}",
      "index": true
    }
  ]
}
```

#### subUnlockedCoins/DelegateCoins

```json
{
  "type": "coin_spent",
  "attributes": [
    {
      "key": "spender",
      "value": "{{sdk.AccAddress of the address which is spending coins}}",
      "index": true
    },
    {
      "key": "amount",
      "value": "{{sdk.Coins being spent}}",
      "index": true
    }
  ]
}
```

## Parameters

The bank module contains the following parameters

### SendEnabled

The SendEnabled parameter is now deprecated and not to be use. It is replaced
with state store records.


### DefaultSendEnabled

The default send enabled value controls send transfer capability for all
coin denominations unless specifically included in the array of `SendEnabled`
parameters.

## Client

### CLI

A user can query and interact with the `bank` module using the CLI.

#### Query

The `query` commands allow users to query `bank` state.

```shell
simd query bank --help
```

##### balances

The `balances` command allows users to query account balances by address.

```shell
simd query bank balances [address] [flags]
```

Example:

```shell
simd query bank balances cosmos1..
```

Example Output:

```yml
balances:
- amount: "1000000000"
  denom: stake
pagination:
  next_key: null
  total: "0"
```

##### denom-metadata

The `denom-metadata` command allows users to query metadata for coin denominations. A user can query metadata for a single denomination using the `--denom` flag or all denominations without it.

```shell
simd query bank denom-metadata [flags]
```

Example:

```shell
simd query bank denom-metadata --denom stake
```

Example Output:

```yml
metadata:
  base: stake
  denom_units:
  - aliases:
    - STAKE
    denom: stake
  description: native staking token of simulation app
  display: stake
  name: SimApp Token
  symbol: STK
```

##### total

The `total` command allows users to query the total supply of coins. A user can query the total supply for a single coin using the `--denom` flag or all coins without it.

```shell
simd query bank total [flags]
```

Example:

```shell
simd query bank total --denom stake
```

Example Output:

```yml
amount: "10000000000"
denom: stake
```

##### send-enabled

The `send-enabled` command allows users to query for all or some SendEnabled entries.

```shell
simd query bank send-enabled [denom1 ...] [flags]
```

Example:

```shell
simd query bank send-enabled
```

Example output:

```yml
send_enabled:
- denom: foocoin
  enabled: true
- denom: barcoin
pagination:
  next-key: null
  total: 2 
```

#### Transactions

The `tx` commands allow users to interact with the `bank` module.

```shell
simd tx bank --help
```

##### send

The `send` command allows users to send funds from one account to another.

```shell
simd tx bank send [from_key_or_address] [to_address] [amount] [flags]
```

Example:

```shell
simd tx bank send cosmos1.. cosmos1.. 100stake
```

## gRPC

A user can query the `bank` module using gRPC endpoints.

### Balance

The `Balance` endpoint allows users to query account balance by address for a given denomination.

```shell
cosmos.bank.v1beta1.Query/Balance
```

Example:

```shell
grpcurl -plaintext \
    -d '{"address":"cosmos1..","denom":"stake"}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/Balance
```

Example Output:

```json
{
  "balance": {
    "denom": "stake",
    "amount": "1000000000"
  }
}
```

### AllBalances

The `AllBalances` endpoint allows users to query account balance by address for all denominations.

```shell
cosmos.bank.v1beta1.Query/AllBalances
```

Example:

```shell
grpcurl -plaintext \
    -d '{"address":"cosmos1.."}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/AllBalances
```

Example Output:

```json
{
  "balances": [
    {
      "denom": "stake",
      "amount": "1000000000"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### DenomMetadata

The `DenomMetadata` endpoint allows users to query metadata for a single coin denomination.

```shell
cosmos.bank.v1beta1.Query/DenomMetadata
```

Example:

```shell
grpcurl -plaintext \
    -d '{"denom":"stake"}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/DenomMetadata
```

Example Output:

```json
{
  "metadata": {
    "description": "native staking token of simulation app",
    "denomUnits": [
      {
        "denom": "stake",
        "aliases": [
          "STAKE"
        ]
      }
    ],
    "base": "stake",
    "display": "stake",
    "name": "SimApp Token",
    "symbol": "STK"
  }
}
```

### DenomsMetadata

The `DenomsMetadata` endpoint allows users to query metadata for all coin denominations.

```shell
cosmos.bank.v1beta1.Query/DenomsMetadata
```

Example:

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/DenomsMetadata
```

Example Output:

```json
{
  "metadatas": [
    {
      "description": "native staking token of simulation app",
      "denomUnits": [
        {
          "denom": "stake",
          "aliases": [
            "STAKE"
          ]
        }
      ],
      "base": "stake",
      "display": "stake",
      "name": "SimApp Token",
      "symbol": "STK"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### DenomOwners

The `DenomOwners` endpoint allows users to query metadata for a single coin denomination.

```shell
cosmos.bank.v1beta1.Query/DenomOwners
```

Example:

```shell
grpcurl -plaintext \
    -d '{"denom":"stake"}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/DenomOwners
```

Example Output:

```json
{
  "denomOwners": [
    {
      "address": "cosmos1..",
      "balance": {
        "denom": "stake",
        "amount": "5000000000"
      }
    },
    {
      "address": "cosmos1..",
      "balance": {
        "denom": "stake",
        "amount": "5000000000"
      }
    },
  ],
  "pagination": {
    "total": "2"
  }
}
```

### TotalSupply

The `TotalSupply` endpoint allows users to query the total supply of all coins.

```shell
cosmos.bank.v1beta1.Query/TotalSupply
```

Example:

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/TotalSupply
```

Example Output:

```json
{
  "supply": [
    {
      "denom": "stake",
      "amount": "10000000000"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### SupplyOf

The `SupplyOf` endpoint allows users to query the total supply of a single coin.

```shell
cosmos.bank.v1beta1.Query/SupplyOf
```

Example:

```shell
grpcurl -plaintext \
    -d '{"denom":"stake"}' \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/SupplyOf
```

Example Output:

```json
{
  "amount": {
    "denom": "stake",
    "amount": "10000000000"
  }
}
```

### Params

The `Params` endpoint allows users to query the parameters of the `bank` module.

```shell
cosmos.bank.v1beta1.Query/Params
```

Example:

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/Params
```

Example Output:

```json
{
  "params": {
    "defaultSendEnabled": true
  }
}
```

### SendEnabled

The `SendEnabled` enpoints allows users to query the SendEnabled entries of the `bank` module.

Any denominations NOT returned, use the `Params.DefaultSendEnabled` value.

```shell
cosmos.bank.v1beta1.Query/SendEnabled
```

Example:

```shell
grpcurl -plaintext \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/SendEnabled
```

Example Output:

```json
{
  "send_enabled": [
    {
      "denom": "foocoin",
      "enabled": true
    },
    {
      "denom": "barcoin"
    }
  ],
  "pagination": {
    "next-key": null,
    "total": 2
  }
}
```
