# `x/mint`

## 内容

* [状态](#state)
    * [铸币者](#minter)
    * [参数](#params)
* [Begin-Block](#begin-block)
    * [下一个通胀率](#nextinflationrate)
    * [下一个年度供应](#nextannualprovisions)
    * [区块供应](#blockprovision)
* [参数](#parameters)
* [事件](#events)
    * [BeginBlocker](#beginblocker)
* [客户端](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)

## 概念

### 铸币机制

铸币机制的设计目的是：

* 允许根据市场需求确定灵活的通胀率，以达到特定的绑定股份比率
* 在市场流动性和抵押供应之间取得平衡

为了最好地确定通胀奖励的适当市场利率，使用了一个移动变化率。移动变化率机制确保如果绑定的百分比超过或低于目标绑定百分比，通胀率将调整以进一步激励或抑制绑定。将目标绑定百分比设置为小于100%鼓励网络保持一些非抵押代币，这应该有助于提供一些流动性。

可以分解如下：

* 如果通胀率低于目标绑定百分比，则通胀率将增加，直到达到最大值
* 如果保持目标绑定百分比（Cosmos-Hub为67%），则通胀率将保持不变
* 如果通胀率高于目标绑定百分比，则通胀率将减少，直到达到最小值


## 状态

### 铸币者

铸币者是保存当前通胀信息的空间。

* 铸币者：`0x00 -> ProtocolBuffer(minter)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/mint/v1beta1/mint.proto#L10-L24
```

### 参数

铸币模块将其参数存储在带有前缀`0x01`的状态中，可以通过治理或具有权限的地址进行更新。

* 参数：`mint/params -> legacy_amino(params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/mint/v1beta1/mint.proto#L26-L59
```

## 开始区块

每个区块开始时，通胀参数会重新计算并支付。

### 通胀率计算

通胀率是使用传递给 `NewAppModule` 函数的“通胀计算函数”来计算的。如果没有传递函数，则将使用 SDK 的默认通胀函数（`NextInflationRate`）。如果需要自定义通胀计算逻辑，可以定义并传递一个与 `InflationCalculationFn` 签名匹配的函数。

```go
type InflationCalculationFn func(ctx sdk.Context, minter Minter, params Params, bondedRatio math.LegacyDec) math.LegacyDec
```

#### NextInflationRate

目标年通胀率每个区块都会重新计算。通胀率还受到与期望比率（67%）的距离相关的利率变化（正或负）的影响。最大利率变化为每年的13%，但年通胀率被限制在7%至20%之间。

```go
NextInflationRate(params Params, bondedRatio math.LegacyDec) (inflation math.LegacyDec) {
	inflationRateChangePerYear = (1 - bondedRatio/params.GoalBonded) * params.InflationRateChange
	inflationRateChange = inflationRateChangePerYear/blocksPerYr

	// increase the new annual inflation for this next block
	inflation += inflationRateChange
	if inflation > params.InflationMax {
		inflation = params.InflationMax
	}
	if inflation < params.InflationMin {
		inflation = params.InflationMin
	}

	return inflation
}
```

### NextAnnualProvisions

根据当前总供应量和通胀率计算年度供应。该参数每个区块计算一次。

```go
NextAnnualProvisions(params Params, totalSupply math.LegacyDec) (provisions math.LegacyDec) {
	return Inflation * totalSupply
```

### BlockProvision

根据当前年度供应计算每个区块生成的供应量。然后，`mint` 模块的 `ModuleMinterAccount` 会铸造这些供应量，并将其转移到 `auth` 的 `FeeCollector` `ModuleAccount`。

```go
BlockProvision(params Params) sdk.Coin {
	provisionAmt = AnnualProvisions/ params.BlocksPerYear
	return sdk.NewCoin(params.MintDenom, provisionAmt.Truncate())
```


## 参数

铸币模块包含以下参数：

| 键名                | 类型            | 示例                   |
| ------------------- | --------------- | ---------------------- |
| MintDenom           | string          | "uatom"                |
| InflationRateChange | string (dec)    | "0.130000000000000000" |
| InflationMax        | string (dec)    | "0.200000000000000000" |
| InflationMin        | string (dec)    | "0.070000000000000000" |
| GoalBonded          | string (dec)    | "0.670000000000000000" |
| BlocksPerYear       | string (uint64) | "6311520"              |

## 事件

铸币模块会发出以下事件：

### BeginBlocker

| 类型  | 属性键            | 属性值              |
| ----- | ----------------- | ------------------ |
| mint  | bonded_ratio      | {bondedRatio}      |
| mint  | inflation         | {inflation}        |
| mint  | annual_provisions | {annualProvisions} |
| mint  | amount            | {amount}           |


## 客户端

### 命令行界面

用户可以使用命令行界面与 `mint` 模块进行查询和交互。

#### 查询

`query` 命令允许用户查询 `mint` 的状态。

```shell
simd query mint --help
```

##### 年度预算

`annual-provisions` 命令允许用户查询当前铸币年度预算的值

```shell
simd query mint annual-provisions [flags]
```

示例：

```shell
simd query mint annual-provisions
```

示例输出：

```shell
22268504368893.612100895088410693
```

##### 通胀率

`inflation` 命令允许用户查询当前铸币通胀率的值

```shell
simd query mint inflation [flags]
```

示例：

```shell
simd query mint inflation
```

示例输出：

```shell
0.199200302563256955
```

##### 参数

`params` 命令允许用户查询当前铸币参数

```shell
simd query mint params [flags]
```

示例：

```yml
blocks_per_year: "4360000"
goal_bonded: "0.670000000000000000"
inflation_max: "0.200000000000000000"
inflation_min: "0.070000000000000000"
inflation_rate_change: "0.130000000000000000"
mint_denom: stake
```

### gRPC

用户可以使用 gRPC 端点查询 `mint` 模块。

#### 年度预算

`AnnualProvisions` 端点允许用户查询当前铸币年度预算的值

```shell
/cosmos.mint.v1beta1.Query/AnnualProvisions
```

示例：

```shell
grpcurl -plaintext localhost:9090 cosmos.mint.v1beta1.Query/AnnualProvisions
```

示例输出：

```json
{
  "annualProvisions": "1432452520532626265712995618"
}
```

#### 通胀率

`Inflation` 端点允许用户查询当前铸币通胀率的值

```shell
/cosmos.mint.v1beta1.Query/Inflation
```

示例：

```shell
grpcurl -plaintext localhost:9090 cosmos.mint.v1beta1.Query/Inflation
```

示例输出：

```json
{
  "inflation": "130197115720711261"
}
```

#### 参数

`Params` 端点允许用户查询当前铸币参数

```shell
/cosmos.mint.v1beta1.Query/Params
```

示例：

```shell
grpcurl -plaintext localhost:9090 cosmos.mint.v1beta1.Query/Params
```

示例输出：

```json
{
  "params": {
    "mintDenom": "stake",
    "inflationRateChange": "130000000000000000",
    "inflationMax": "200000000000000000",
    "inflationMin": "70000000000000000",
    "goalBonded": "670000000000000000",
    "blocksPerYear": "6311520"
  }
}
```

### REST

用户可以使用 REST 端点查询 `mint` 模块。

#### 年度供应量

```shell
/cosmos/mint/v1beta1/annual_provisions
```

示例：

```shell
curl "localhost:1317/cosmos/mint/v1beta1/annual_provisions"
```

示例输出：

```json
{
  "annualProvisions": "1432452520532626265712995618"
}
```

#### 通胀率

```shell
/cosmos/mint/v1beta1/inflation
```

示例：

```shell
curl "localhost:1317/cosmos/mint/v1beta1/inflation"
```

示例输出：

```json
{
  "inflation": "130197115720711261"
}
```

#### 参数

```shell
/cosmos/mint/v1beta1/params
```

示例：

```shell
curl "localhost:1317/cosmos/mint/v1beta1/params"
```

示例输出：

```json
{
  "params": {
    "mintDenom": "stake",
    "inflationRateChange": "130000000000000000",
    "inflationMax": "200000000000000000",
    "inflationMin": "70000000000000000",
    "goalBonded": "670000000000000000",
    "blocksPerYear": "6311520"
  }
}
```




# `x/mint`

## Contents

* [State](#state)
    * [Minter](#minter)
    * [Params](#params)
* [Begin-Block](#begin-block)
    * [NextInflationRate](#nextinflationrate)
    * [NextAnnualProvisions](#nextannualprovisions)
    * [BlockProvision](#blockprovision)
* [Parameters](#parameters)
* [Events](#events)
    * [BeginBlocker](#beginblocker)
* [Client](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)

## Concepts

### The Minting Mechanism

The minting mechanism was designed to:

* allow for a flexible inflation rate determined by market demand targeting a particular bonded-stake ratio
* effect a balance between market liquidity and staked supply

In order to best determine the appropriate market rate for inflation rewards, a
moving change rate is used.  The moving change rate mechanism ensures that if
the % bonded is either over or under the goal %-bonded, the inflation rate will
adjust to further incentivize or disincentivize being bonded, respectively. Setting the goal
%-bonded at less than 100% encourages the network to maintain some non-staked tokens
which should help provide some liquidity.

It can be broken down in the following way:

* If the inflation rate is below the goal %-bonded the inflation rate will
   increase until a maximum value is reached
* If the goal % bonded (67% in Cosmos-Hub) is maintained, then the inflation
   rate will stay constant
* If the inflation rate is above the goal %-bonded the inflation rate will
   decrease until a minimum value is reached


## State

### Minter

The minter is a space for holding current inflation information.

* Minter: `0x00 -> ProtocolBuffer(minter)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/mint/v1beta1/mint.proto#L10-L24
```

### Params

The mint module stores it's params in state with the prefix of `0x01`,
it can be updated with governance or the address with authority.

* Params: `mint/params -> legacy_amino(params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/mint/v1beta1/mint.proto#L26-L59
```

## Begin-Block

Minting parameters are recalculated and inflation paid at the beginning of each block.

### Inflation rate calculation

Inflation rate is calculated using an "inflation calculation function" that's
passed to the `NewAppModule` function. If no function is passed, then the SDK's
default inflation function will be used (`NextInflationRate`). In case a custom
inflation calculation logic is needed, this can be achieved by defining and
passing a function that matches `InflationCalculationFn`'s signature.

```go
type InflationCalculationFn func(ctx sdk.Context, minter Minter, params Params, bondedRatio math.LegacyDec) math.LegacyDec
```

#### NextInflationRate

The target annual inflation rate is recalculated each block.
The inflation is also subject to a rate change (positive or negative)
depending on the distance from the desired ratio (67%). The maximum rate change
possible is defined to be 13% per year, however the annual inflation is capped
as between 7% and 20%.

```go
NextInflationRate(params Params, bondedRatio math.LegacyDec) (inflation math.LegacyDec) {
	inflationRateChangePerYear = (1 - bondedRatio/params.GoalBonded) * params.InflationRateChange
	inflationRateChange = inflationRateChangePerYear/blocksPerYr

	// increase the new annual inflation for this next block
	inflation += inflationRateChange
	if inflation > params.InflationMax {
		inflation = params.InflationMax
	}
	if inflation < params.InflationMin {
		inflation = params.InflationMin
	}

	return inflation
}
```

### NextAnnualProvisions

Calculate the annual provisions based on current total supply and inflation
rate. This parameter is calculated once per block.

```go
NextAnnualProvisions(params Params, totalSupply math.LegacyDec) (provisions math.LegacyDec) {
	return Inflation * totalSupply
```

### BlockProvision

Calculate the provisions generated for each block based on current annual provisions. The provisions are then minted by the `mint` module's `ModuleMinterAccount` and then transferred to the `auth`'s `FeeCollector` `ModuleAccount`.

```go
BlockProvision(params Params) sdk.Coin {
	provisionAmt = AnnualProvisions/ params.BlocksPerYear
	return sdk.NewCoin(params.MintDenom, provisionAmt.Truncate())
```


## Parameters

The minting module contains the following parameters:

| Key                 | Type            | Example                |
| ------------------- | --------------- | ---------------------- |
| MintDenom           | string          | "uatom"                |
| InflationRateChange | string (dec)    | "0.130000000000000000" |
| InflationMax        | string (dec)    | "0.200000000000000000" |
| InflationMin        | string (dec)    | "0.070000000000000000" |
| GoalBonded          | string (dec)    | "0.670000000000000000" |
| BlocksPerYear       | string (uint64) | "6311520"              |


## Events

The minting module emits the following events:

### BeginBlocker

| Type | Attribute Key     | Attribute Value    |
| ---- | ----------------- | ------------------ |
| mint | bonded_ratio      | {bondedRatio}      |
| mint | inflation         | {inflation}        |
| mint | annual_provisions | {annualProvisions} |
| mint | amount            | {amount}           |


## Client

### CLI

A user can query and interact with the `mint` module using the CLI.

#### Query

The `query` commands allow users to query `mint` state.

```shell
simd query mint --help
```

##### annual-provisions

The `annual-provisions` command allow users to query the current minting annual provisions value

```shell
simd query mint annual-provisions [flags]
```

Example:

```shell
simd query mint annual-provisions
```

Example Output:

```shell
22268504368893.612100895088410693
```

##### inflation

The `inflation` command allow users to query the current minting inflation value

```shell
simd query mint inflation [flags]
```

Example:

```shell
simd query mint inflation
```

Example Output:

```shell
0.199200302563256955
```

##### params

The `params` command allow users to query the current minting parameters

```shell
simd query mint params [flags]
```

Example:

```yml
blocks_per_year: "4360000"
goal_bonded: "0.670000000000000000"
inflation_max: "0.200000000000000000"
inflation_min: "0.070000000000000000"
inflation_rate_change: "0.130000000000000000"
mint_denom: stake
```

### gRPC

A user can query the `mint` module using gRPC endpoints.

#### AnnualProvisions

The `AnnualProvisions` endpoint allow users to query the current minting annual provisions value

```shell
/cosmos.mint.v1beta1.Query/AnnualProvisions
```

Example:

```shell
grpcurl -plaintext localhost:9090 cosmos.mint.v1beta1.Query/AnnualProvisions
```

Example Output:

```json
{
  "annualProvisions": "1432452520532626265712995618"
}
```

#### Inflation

The `Inflation` endpoint allow users to query the current minting inflation value

```shell
/cosmos.mint.v1beta1.Query/Inflation
```

Example:

```shell
grpcurl -plaintext localhost:9090 cosmos.mint.v1beta1.Query/Inflation
```

Example Output:

```json
{
  "inflation": "130197115720711261"
}
```

#### Params

The `Params` endpoint allow users to query the current minting parameters

```shell
/cosmos.mint.v1beta1.Query/Params
```

Example:

```shell
grpcurl -plaintext localhost:9090 cosmos.mint.v1beta1.Query/Params
```

Example Output:

```json
{
  "params": {
    "mintDenom": "stake",
    "inflationRateChange": "130000000000000000",
    "inflationMax": "200000000000000000",
    "inflationMin": "70000000000000000",
    "goalBonded": "670000000000000000",
    "blocksPerYear": "6311520"
  }
}
```

### REST

A user can query the `mint` module using REST endpoints.

#### annual-provisions

```shell
/cosmos/mint/v1beta1/annual_provisions
```

Example:

```shell
curl "localhost:1317/cosmos/mint/v1beta1/annual_provisions"
```

Example Output:

```json
{
  "annualProvisions": "1432452520532626265712995618"
}
```

#### inflation

```shell
/cosmos/mint/v1beta1/inflation
```

Example:

```shell
curl "localhost:1317/cosmos/mint/v1beta1/inflation"
```

Example Output:

```json
{
  "inflation": "130197115720711261"
}
```

#### params

```shell
/cosmos/mint/v1beta1/params
```

Example:

```shell
curl "localhost:1317/cosmos/mint/v1beta1/params"
```

Example Output:

```json
{
  "params": {
    "mintDenom": "stake",
    "inflationRateChange": "130000000000000000",
    "inflationMax": "200000000000000000",
    "inflationMin": "70000000000000000",
    "goalBonded": "670000000000000000",
    "blocksPerYear": "6311520"
  }
}
```
