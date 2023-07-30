# `x/crisis`

## 概述

危机模块在区块链不变性被破坏的情况下停止区块链。在应用程序初始化过程中，可以向应用程序注册不变性。

## 目录

* [状态](#状态)
* [消息](#消息)
* [事件](#事件)
* [参数](#参数)
* [客户端](#客户端)
    * [CLI](#CLI)

## 状态

### ConstantFee

由于验证不变性所需的预期大量燃气成本（以及可能超过最大允许的区块燃气限制），使用常量费用而不是标准燃气消耗方法。常量费用应大于使用标准燃气消耗方法运行不变性的预期燃气成本。

ConstantFee 参数存储在模块参数状态中，前缀为 `0x01`，可以通过治理或具有权限的地址进行更新。

* 参数：`mint/params -> legacy_amino(sdk.Coin)`

## 消息

在本节中，我们描述了危机消息的处理以及对状态的相应更新。

### MsgVerifyInvariant

可以使用 `MsgVerifyInvariant` 消息来检查区块链不变性。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/crisis/v1beta1/tx.proto#L26-L42
```

如果以下情况发生，此消息预计会失败：

* 发送者没有足够的代币支付常量费用
* 未注册不变性路由

此消息检查所提供的不变性，如果不变性被破坏，它会引发 panic，停止区块链。如果不变性被破坏，常量费用不会被扣除，因为交易不会被提交到区块（相当于退款）。然而，如果不变性没有被破坏，常量费用将不会被退还。

## 事件

危机模块会发出以下事件：

### 处理程序

#### MsgVerifyInvariance

| 类型      | 属性键        | 属性值           |
| --------- | ------------- | ---------------- |
| 不变性    | 路由          | {invariantRoute} |
| 消息      | 模块          | crisis           |
| 消息      | 动作          | verify_invariant |
| 消息      | 发送者        | {senderAddress}  |

## 参数

危机模块包含以下参数：

| 键           | 类型            | 示例                             |
| ------------ | --------------- | -------------------------------- |
| ConstantFee  | 对象 (coin)     | {"denom":"uatom","amount":"1000"} |

## 客户端

### 命令行界面 (CLI)

用户可以使用命令行界面 (CLI) 查询和与 `crisis` 模块进行交互。

#### 交易

`tx` 命令允许用户与 `crisis` 模块进行交互。

```bash
simd tx crisis --help
```

##### invariant-broken

`invariant-broken` 命令在不变式被破坏时提交证明以停止链的运行。

```bash
simd tx crisis invariant-broken [module-name] [invariant-route] [flags]
```

示例：

```bash
simd tx crisis invariant-broken bank total-supply --from=[keyname or address]
```




# `x/crisis`

## Overview

The crisis module halts the blockchain under the circumstance that a blockchain
invariant is broken. Invariants can be registered with the application during the
application initialization process.

## Contents

* [State](#state)
* [Messages](#messages)
* [Events](#events)
* [Parameters](#parameters)
* [Client](#client)
    * [CLI](#cli)

## State

### ConstantFee

Due to the anticipated large gas cost requirement to verify an invariant (and
potential to exceed the maximum allowable block gas limit) a constant fee is
used instead of the standard gas consumption method. The constant fee is
intended to be larger than the anticipated gas cost of running the invariant
with the standard gas consumption method.

The ConstantFee param is stored in the module params state with the prefix of `0x01`,
it can be updated with governance or the address with authority.

* Params: `mint/params -> legacy_amino(sdk.Coin)`

## Messages

In this section we describe the processing of the crisis messages and the
corresponding updates to the state.

### MsgVerifyInvariant

Blockchain invariants can be checked using the `MsgVerifyInvariant` message.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/crisis/v1beta1/tx.proto#L26-L42
```

This message is expected to fail if:

* the sender does not have enough coins for the constant fee
* the invariant route is not registered

This message checks the invariant provided, and if the invariant is broken it
panics, halting the blockchain. If the invariant is broken, the constant fee is
never deducted as the transaction is never committed to a block (equivalent to
being refunded). However, if the invariant is not broken, the constant fee will
not be refunded.

## Events

The crisis module emits the following events:

### Handlers

#### MsgVerifyInvariance

| Type      | Attribute Key | Attribute Value  |
| --------- | ------------- | ---------------- |
| invariant | route         | {invariantRoute} |
| message   | module        | crisis           |
| message   | action        | verify_invariant |
| message   | sender        | {senderAddress}  |

## Parameters

The crisis module contains the following parameters:

| Key         | Type          | Example                           |
| ----------- | ------------- | --------------------------------- |
| ConstantFee | object (coin) | {"denom":"uatom","amount":"1000"} |

## Client

### CLI

A user can query and interact with the `crisis` module using the CLI.

#### Transactions

The `tx` commands allow users to interact with the `crisis` module.

```bash
simd tx crisis --help
```

##### invariant-broken

The `invariant-broken` command submits proof when an invariant was broken to halt the chain

```bash
simd tx crisis invariant-broken [module-name] [invariant-route] [flags]
```

Example:

```bash
simd tx crisis invariant-broken bank total-supply --from=[keyname or address]
```
