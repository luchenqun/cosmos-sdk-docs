# `x/feegrant`

## 摘要

本文档规定了费用授权模块。有关完整的ADR，请参阅[费用授权ADR-029](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-029-fee-grant-module.md)。

该模块允许账户授予费用津贴并使用其账户中的费用。受让人可以执行任何交易，而无需维持足够的费用。

## 内容

* [概念](#概念)
* [状态](#状态)
    * [费用津贴](#费用津贴)
    * [费用津贴队列](#费用津贴队列)
* [消息](#消息)
    * [Msg/授予津贴](#msg授予津贴)
    * [Msg/撤销津贴](#msg撤销津贴)
* [事件](#事件)
* [消息服务器](#消息服务器)
    * [MsgGrantAllowance](#msggrantallowance-1)
    * [MsgRevokeAllowance](#msgrevokeallowance-1)
    * [执行费用津贴](#执行费用津贴)
* [客户端](#客户端)
    * [CLI](#cli)
    * [gRPC](#grpc)

## 概念

### 授权

`授权`存储在KV存储中，记录了具有完整上下文的授权。每个授权都包含`授权者`、`受让人`和授予的`津贴`的类型。`授权者`是授予`受让人`（受益人账户地址）支付部分或全部`受让人`交易费用的账户地址。`津贴`定义了授予`受让人`的费用津贴的类型（`BasicAllowance`或`PeriodicAllowance`，请参见下文）。`津贴`接受实现了`FeeAllowanceI`接口的`Any`类型编码。对于一个`受让人`和`授权者`，只能存在一个有效的费用授权，不允许自授权。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/feegrant.proto#L83-L93
```

`FeeAllowanceI`的结构如下：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/feegrant/fees.go#L9-L32
```

### 费用津贴类型

目前有两种类型的费用津贴：

* `BasicAllowance`
* `PeriodicAllowance`
* `AllowedMsgAllowance`

### BasicAllowance

`BasicAllowance`是授权`受让人`使用`授权者`账户中的费用。如果`spend_limit`或`expiration`中的任何一个达到其限制，授权将从状态中移除。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/feegrant.proto#L15-L28
```

* `spend_limit`是允许从`granter`账户中使用的币的限制。如果为空，则假定没有花费限制，`grantee`可以在过期之前使用`granter`账户地址中的任意数量的可用币。

* `expiration`指定了此授权过期的可选时间。如果值为空，则授权没有过期。

* 当使用空值创建授权时，即`spend_limit`和`expiration`为空，它仍然是一个有效的授权。它不会限制`grantee`使用`granter`的任意数量的币，也不会有任何过期时间。唯一限制`grantee`的方法是撤销授权。

### PeriodicAllowance

`PeriodicAllowance`是一个重复的费用授权，可以指定授权的过期时间以及周期重置的时间。还可以定义在指定时间段内可以使用的最大币数。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/feegrant.proto#L34-L68
```

* `basic`是可选的周期性费用授权的`BasicAllowance`实例。如果为空，则授权将没有`expiration`和`spend_limit`。

* `period`是特定的时间段，每个时间段过去后，`period_can_spend`将被重置。

* `period_spend_limit`指定了在该时间段内可以花费的最大币数。

* `period_can_spend`是在`period_reset`时间之前剩余可花费的币数。

* `period_reset`跟踪下一个周期重置应该发生的时间。

### AllowedMsgAllowance

`AllowedMsgAllowance`是一个费用授权，可以是`BasicFeeAllowance`或`PeriodicAllowance`，但仅限于授权者所允许的消息。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/feegrant.proto#L70-L81
```

* `allowance` 可以是 `BasicAllowance` 或 `PeriodicAllowance`。

* `allowed_messages` 是允许执行给定授权的消息数组。

### FeeGranter 标志

`feegrant` 模块为了能够使用费用授权者执行交易引入了 `FeeGranter` 标志。当设置了该标志时，`clientCtx` 会在通过 CLI 生成的交易中附加授权者账户地址。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/cmd.go#L249-L260
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx/tx.go#L109-L109
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/builder.go#L275-L284
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L203-L224
```

示例命令：

```go
./simd tx gov submit-proposal --title="测试提案" --description="我的超棒提案" --type="文本" --from 验证人密钥 --fee-granter=cosmos1xh44hxt7spr67hqaa7nyx5gnutrz5fraw6grxn --chain-id=testnet --fees="10stake"
```

### 授权费用扣除

费用从授权中扣除在 `x/auth` ante 处理程序中进行。要了解有关 ante 处理程序的工作原理的更多信息，请阅读 [Auth 模块 AnteHandlers 指南](../auth/README.md#antehandlers)。

### Gas

为了防止 DoS 攻击，使用经过筛选的 `x/feegrant` 会产生 gas 费用。SDK 必须确保 `grantee` 的所有交易都符合 `granter` 设置的筛选条件。SDK 通过迭代筛选器中允许的消息，并对每个筛选的消息收取 10 gas 来实现此目的。然后，SDK 将迭代 `grantee` 发送的消息，以确保消息符合筛选条件，并对每个消息收取 10 gas。如果发现不符合筛选条件的消息，SDK 将停止迭代并使交易失败。

**警告**：gas 费用将从授权的津贴中扣除。在使用津贴发送交易之前，请确保您的消息（如果有）符合筛选条件。

### Pruning

在状态中维护了一个以授权到期时间为前缀的队列，并在每个区块的 EndBlock 中使用当前区块时间检查它们以进行修剪。

## 状态

### 费用授权

费用授权通过将`Grantee`（费用授权受让人的账户地址）与`Granter`（费用授权授予人的账户地址）进行组合来进行标识。

费用授权授予以以下方式存储在状态中：

* 授权：`0x00 | grantee_addr_len（1字节）| grantee_addr_bytes | granter_addr_len（1字节）| granter_addr_bytes -> ProtocolBuffer（Grant）`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/feegrant/feegrant.pb.go#L222-L230
```

### 费用授权队列

费用授权队列项通过将`FeeAllowancePrefixQueue`（即0x01）、`expiration`、`grantee`（费用授权受让人的账户地址）、`granter`（费用授权授予人的账户地址）进行组合来进行标识。Endblocker会检查`FeeAllowanceQueue`状态以查找已过期的授权，并从`FeeAllowance`中删除它们（如果有的话）。

费用授权队列键以以下方式存储在状态中：

* 授权：`0x01 | expiration_bytes | grantee_addr_len（1字节）| grantee_addr_bytes | granter_addr_len（1字节）| granter_addr_bytes -> EmptyBytes`

## 消息

### Msg/GrantAllowance

使用`MsgGrantAllowance`消息将创建一个费用授权授予。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/tx.proto#L25-L39
```

### Msg/RevokeAllowance

使用`MsgRevokeAllowance`消息可以移除已授权的费用授权。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/tx.proto#L41-L54
```

## 事件

feegrant模块会发出以下事件：

## 消息服务器

### MsgGrantAllowance

| 类型    | 属性键        | 属性值            |
| ------- | ------------- | ---------------- |
| message | action        | set_feegrant     |
| message | granter       | {granterAddress} |
| message | grantee       | {granteeAddress} |

### MsgRevokeAllowance

| 类型    | 属性键        | 属性值            |
| ------- | ------------- | ---------------- |
| message | action        | revoke_feegrant  |
| message | granter       | {granterAddress} |
| message | grantee       | {granteeAddress} |

### 执行费用授权

| 类型    | 属性键        | 属性值           |
| ------- | ------------- | ---------------- |
| message | action        | use_feegrant     |
| message | granter       | {granterAddress} |
| message | grantee       | {granteeAddress} |

## 客户端

### 命令行界面（CLI）

用户可以使用命令行界面（CLI）查询和与 `feegrant` 模块进行交互。

#### 查询

`query` 命令允许用户查询 `feegrant` 的状态。

```shell
simd query feegrant --help
```

##### grant

`grant` 命令允许用户查询给定 granter-grantee 对的授权。

```shell
simd query feegrant grant [granter] [grantee] [flags]
```

示例：

```shell
simd query feegrant grant cosmos1.. cosmos1..
```

示例输出：

```yml
allowance:
  '@type': /cosmos.feegrant.v1beta1.BasicAllowance
  expiration: null
  spend_limit:
  - amount: "100"
    denom: stake
grantee: cosmos1..
granter: cosmos1..
```

##### grants

`grants` 命令允许用户查询给定 grantee 的所有授权。

```shell
simd query feegrant grants [grantee] [flags]
```

示例：

```shell
simd query feegrant grants cosmos1..
```

示例输出：

```yml
allowances:
- allowance:
    '@type': /cosmos.feegrant.v1beta1.BasicAllowance
    expiration: null
    spend_limit:
    - amount: "100"
      denom: stake
  grantee: cosmos1..
  granter: cosmos1..
pagination:
  next_key: null
  total: "0"
```

#### 交易

`tx` 命令允许用户与 `feegrant` 模块进行交互。

```shell
simd tx feegrant --help
```

##### grant

`grant` 命令允许用户向另一个账户授予费用限额。费用限额可以具有到期日期、总花费限制和/或周期性花费限制。

```shell
simd tx feegrant grant [granter] [grantee] [flags]
```

示例（一次性花费限制）：

```shell
simd tx feegrant grant cosmos1.. cosmos1.. --spend-limit 100stake
```

示例（周期性花费限制）：

```shell
simd tx feegrant grant cosmos1.. cosmos1.. --period 3600 --period-limit 10stake
```

##### revoke

`revoke` 命令允许用户撤销已授予的费用限额。

```shell
simd tx feegrant revoke [granter] [grantee] [flags]
```

示例：

```shell
simd tx feegrant revoke cosmos1.. cosmos1..
```

### gRPC

用户可以使用 gRPC 端点查询 `feegrant` 模块。

#### Allowance

`Allowance` 端点允许用户查询已授予的费用限额。

```shell
cosmos.feegrant.v1beta1.Query/Allowance
```

#### 允许列表

`Allowances` 端点允许用户查询给定受让人的所有授予的费用允许列表。

```shell
cosmos.feegrant.v1beta1.Query/Allowances
```

示例：

```shell
grpcurl -plaintext \
    -d '{"address":"cosmos1.."}' \
    localhost:9090 \
    cosmos.feegrant.v1beta1.Query/Allowances
```

示例输出：

```json
{
  "allowances": [
    {
      "granter": "cosmos1..",
      "grantee": "cosmos1..",
      "allowance": {"@type":"/cosmos.feegrant.v1beta1.BasicAllowance","spendLimit":[{"denom":"stake","amount":"100"}]}
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```





# `x/feegrant`

## Abstract

This document specifies the fee grant module. For the full ADR, please see [Fee Grant ADR-029](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-029-fee-grant-module.md).

This module allows accounts to grant fee allowances and to use fees from their accounts. Grantees can execute any transaction without the need to maintain sufficient fees.

## Contents

* [Concepts](#concepts)
* [State](#state)
    * [FeeAllowance](#feeallowance)
    * [FeeAllowanceQueue](#feeallowancequeue)
* [Messages](#messages)
    * [Msg/GrantAllowance](#msggrantallowance)
    * [Msg/RevokeAllowance](#msgrevokeallowance)
* [Events](#events)
* [Msg Server](#msg-server)
    * [MsgGrantAllowance](#msggrantallowance-1)
    * [MsgRevokeAllowance](#msgrevokeallowance-1)
    * [Exec fee allowance](#exec-fee-allowance)
* [Client](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)

## Concepts

### Grant

`Grant` is stored in the KVStore to record a grant with full context. Every grant will contain `granter`, `grantee` and what kind of `allowance` is granted. `granter` is an account address who is giving permission to `grantee` (the beneficiary account address) to pay for some or all of `grantee`'s transaction fees. `allowance` defines what kind of fee allowance (`BasicAllowance` or `PeriodicAllowance`, see below) is granted to `grantee`. `allowance` accepts an interface which implements `FeeAllowanceI`, encoded as `Any` type. There can be only one existing fee grant allowed for a `grantee` and `granter`, self grants are not allowed.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/feegrant.proto#L83-L93
```

`FeeAllowanceI` looks like:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/feegrant/fees.go#L9-L32
```

### Fee Allowance types

There are two types of fee allowances present at the moment:

* `BasicAllowance`
* `PeriodicAllowance`
* `AllowedMsgAllowance`

### BasicAllowance

`BasicAllowance` is permission for `grantee` to use fee from a `granter`'s account. If any of the `spend_limit` or `expiration` reaches its limit, the grant will be removed from the state.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/feegrant.proto#L15-L28
```

* `spend_limit` is the limit of coins that are allowed to be used from the `granter` account. If it is empty, it assumes there's no spend limit, `grantee` can use any number of available coins from `granter` account address before the expiration.

* `expiration` specifies an optional time when this allowance expires. If the value is left empty, there is no expiry for the grant.

* When a grant is created with empty values for `spend_limit` and `expiration`, it is still a valid grant. It won't restrict the `grantee` to use any number of coins from `granter` and it won't have any expiration. The only way to restrict the `grantee` is by revoking the grant.

### PeriodicAllowance

`PeriodicAllowance` is a repeating fee allowance for the mentioned period, we can mention when the grant can expire as well as when a period can reset. We can also define the maximum number of coins that can be used in a mentioned period of time.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/feegrant.proto#L34-L68
```

* `basic` is the instance of `BasicAllowance` which is optional for periodic fee allowance. If empty, the grant will have no `expiration` and no `spend_limit`.

* `period` is the specific period of time, after each period passes, `period_can_spend` will be reset.

* `period_spend_limit` specifies the maximum number of coins that can be spent in the period.

* `period_can_spend` is the number of coins left to be spent before the period_reset time.

* `period_reset` keeps track of when a next period reset should happen.

### AllowedMsgAllowance

`AllowedMsgAllowance` is a fee allowance, it can be any of `BasicFeeAllowance`, `PeriodicAllowance` but restricted only to the allowed messages mentioned by the granter.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/feegrant.proto#L70-L81
```

* `allowance` is either `BasicAllowance` or `PeriodicAllowance`.

* `allowed_messages` is array of messages allowed to execute the given allowance.

### FeeGranter flag

`feegrant` module introduces a `FeeGranter` flag for CLI for the sake of executing transactions with fee granter. When this flag is set, `clientCtx` will append the granter account address for transactions generated through CLI.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/cmd.go#L249-L260
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx/tx.go#L109-L109
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/builder.go#L275-L284
```

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/tx/v1beta1/tx.proto#L203-L224
```

Example cmd:

```go
./simd tx gov submit-proposal --title="Test Proposal" --description="My awesome proposal" --type="Text" --from validator-key --fee-granter=cosmos1xh44hxt7spr67hqaa7nyx5gnutrz5fraw6grxn --chain-id=testnet --fees="10stake"
```

### Granted Fee Deductions

Fees are deducted from grants in the `x/auth` ante handler. To learn more about how ante handlers work, read the [Auth Module AnteHandlers Guide](../auth/README.md#antehandlers).

### Gas

In order to prevent DoS attacks, using a filtered `x/feegrant` incurs gas. The SDK must assure that the `grantee`'s transactions all conform to the filter set by the `granter`. The SDK does this by iterating over the allowed messages in the filter and charging 10 gas per filtered message. The SDK will then iterate over the messages being sent by the `grantee` to ensure the messages adhere to the filter, also charging 10 gas per message. The SDK will stop iterating and fail the transaction if it finds a message that does not conform to the filter.

**WARNING**: The gas is charged against the granted allowance. Ensure your messages conform to the filter, if any, before sending transactions using your allowance.

### Pruning

A queue in the state maintained with the prefix of expiration of the grants and checks them on EndBlock with the current block time for every block to prune.

## State

### FeeAllowance

Fee Allowances are identified by combining `Grantee` (the account address of fee allowance grantee) with the `Granter` (the account address of fee allowance granter).

Fee allowance grants are stored in the state as follows:

* Grant: `0x00 | grantee_addr_len (1 byte) | grantee_addr_bytes |  granter_addr_len (1 byte) | granter_addr_bytes -> ProtocolBuffer(Grant)`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/feegrant/feegrant.pb.go#L222-L230
```

### FeeAllowanceQueue

Fee Allowances queue items are identified by combining the `FeeAllowancePrefixQueue` (i.e., 0x01), `expiration`, `grantee` (the account address of fee allowance grantee), `granter` (the account address of fee allowance granter). Endblocker checks `FeeAllowanceQueue` state for the expired grants and prunes them from  `FeeAllowance` if there are any found.

Fee allowance queue keys are stored in the state as follows:

* Grant: `0x01 | expiration_bytes | grantee_addr_len (1 byte) | grantee_addr_bytes |  granter_addr_len (1 byte) | granter_addr_bytes -> EmptyBytes`

## Messages

### Msg/GrantAllowance

A fee allowance grant will be created with the `MsgGrantAllowance` message.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/tx.proto#L25-L39
```

### Msg/RevokeAllowance

An allowed grant fee allowance can be removed with the `MsgRevokeAllowance` message.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/feegrant/v1beta1/tx.proto#L41-L54
```

## Events

The feegrant module emits the following events:

## Msg Server

### MsgGrantAllowance

| Type    | Attribute Key | Attribute Value  |
| ------- | ------------- | ---------------- |
| message | action        | set_feegrant     |
| message | granter       | {granterAddress} |
| message | grantee       | {granteeAddress} |

### MsgRevokeAllowance

| Type    | Attribute Key | Attribute Value  |
| ------- | ------------- | ---------------- |
| message | action        | revoke_feegrant  |
| message | granter       | {granterAddress} |
| message | grantee       | {granteeAddress} |

### Exec fee allowance

| Type    | Attribute Key | Attribute Value  |
| ------- | ------------- | ---------------- |
| message | action        | use_feegrant     |
| message | granter       | {granterAddress} |
| message | grantee       | {granteeAddress} |

## Client

### CLI

A user can query and interact with the `feegrant` module using the CLI.

#### Query

The `query` commands allow users to query `feegrant` state.

```shell
simd query feegrant --help
```

##### grant

The `grant` command allows users to query a grant for a given granter-grantee pair.

```shell
simd query feegrant grant [granter] [grantee] [flags]
```

Example:

```shell
simd query feegrant grant cosmos1.. cosmos1..
```

Example Output:

```yml
allowance:
  '@type': /cosmos.feegrant.v1beta1.BasicAllowance
  expiration: null
  spend_limit:
  - amount: "100"
    denom: stake
grantee: cosmos1..
granter: cosmos1..
```

##### grants

The `grants` command allows users to query all grants for a given grantee.

```shell
simd query feegrant grants [grantee] [flags]
```

Example:

```shell
simd query feegrant grants cosmos1..
```

Example Output:

```yml
allowances:
- allowance:
    '@type': /cosmos.feegrant.v1beta1.BasicAllowance
    expiration: null
    spend_limit:
    - amount: "100"
      denom: stake
  grantee: cosmos1..
  granter: cosmos1..
pagination:
  next_key: null
  total: "0"
```

#### Transactions

The `tx` commands allow users to interact with the `feegrant` module.

```shell
simd tx feegrant --help
```

##### grant

The `grant` command allows users to grant fee allowances to another account. The fee allowance can have an expiration date, a total spend limit, and/or a periodic spend limit.

```shell
simd tx feegrant grant [granter] [grantee] [flags]
```

Example (one-time spend limit):

```shell
simd tx feegrant grant cosmos1.. cosmos1.. --spend-limit 100stake
```

Example (periodic spend limit):

```shell
simd tx feegrant grant cosmos1.. cosmos1.. --period 3600 --period-limit 10stake
```

##### revoke

The `revoke` command allows users to revoke a granted fee allowance.

```shell
simd tx feegrant revoke [granter] [grantee] [flags]
```

Example:

```shell
simd tx feegrant revoke cosmos1.. cosmos1..
```

### gRPC

A user can query the `feegrant` module using gRPC endpoints.

#### Allowance

The `Allowance` endpoint allows users to query a granted fee allowance.

```shell
cosmos.feegrant.v1beta1.Query/Allowance
```

Example:

```shell
grpcurl -plaintext \
    -d '{"grantee":"cosmos1..","granter":"cosmos1.."}' \
    localhost:9090 \
    cosmos.feegrant.v1beta1.Query/Allowance
```

Example Output:

```json
{
  "allowance": {
    "granter": "cosmos1..",
    "grantee": "cosmos1..",
    "allowance": {"@type":"/cosmos.feegrant.v1beta1.BasicAllowance","spendLimit":[{"denom":"stake","amount":"100"}]}
  }
}
```

#### Allowances

The `Allowances` endpoint allows users to query all granted fee allowances for a given grantee.

```shell
cosmos.feegrant.v1beta1.Query/Allowances
```

Example:

```shell
grpcurl -plaintext \
    -d '{"address":"cosmos1.."}' \
    localhost:9090 \
    cosmos.feegrant.v1beta1.Query/Allowances
```

Example Output:

```json
{
  "allowances": [
    {
      "granter": "cosmos1..",
      "grantee": "cosmos1..",
      "allowance": {"@type":"/cosmos.feegrant.v1beta1.BasicAllowance","spendLimit":[{"denom":"stake","amount":"100"}]}
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```
