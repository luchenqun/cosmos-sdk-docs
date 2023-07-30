# `x/authz`

## 摘要

`x/authz` 是 Cosmos SDK 模块的实现，根据 [ADR 30](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-030-authz-module.md)，允许将任意权限从一个账户（授权者）授予另一个账户（受让者）。授权必须逐个为特定的 Msg 服务方法授予，使用 `Authorization` 接口的实现。

## 目录

* [概念](#概念)
    * [授权和授予](#授权和授予)
    * [内置授权](#内置授权)
    * [Gas](#gas)
* [状态](#状态)
    * [授予](#授予)
    * [授予队列](#授予队列)
* [消息](#消息)
    * [MsgGrant](#msggrant)
    * [MsgRevoke](#msgrevoke)
    * [MsgExec](#msgexec)
* [事件](#事件)
* [客户端](#客户端)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)

## 概念

### 授权和授予

`x/authz` 模块定义了接口和消息，用于授予其他账户代表一个账户执行操作的权限。该设计在 [ADR 030](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-030-authz-module.md) 中定义。

*授予* 是授予受让者代表授权者执行 Msg 的许可。授权是一个接口，必须由具体的授权逻辑实现来验证和执行授予。授权是可扩展的，可以为任何 Msg 服务方法定义授权，甚至可以在定义 Msg 方法的模块之外。有关更多详细信息，请参阅下一节中的 `SendAuthorization` 示例。

**注意：** authz 模块与负责指定基本交易和账户类型的 [auth（身份验证）](../auth/README.md) 模块不同。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/authz/authorizations.go#L11-L25
```

### 内置授权

Cosmos SDK `x/authz` 模块提供以下授权类型：

#### GenericAuthorization

`GenericAuthorization` 实现了 `Authorization` 接口，为授权者的账户执行提供了无限制的权限。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/authz.proto#L14-L22
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/authz/generic_authorization.go#L16-L29
```

* `msg` 存储了 Msg 类型的 URL。

#### SendAuthorization

`SendAuthorization` 实现了 `cosmos.bank.v1beta1.MsgSend` Msg 的 `Authorization` 接口。

* 它接受一个（正数）`SpendLimit`，指定了受让人可以花费的最大代币数量。`SpendLimit` 在代币被花费时会更新。
* 它接受一个（可选的）`AllowList`，指定了受让人可以向哪些地址发送代币。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/authz.proto#L11-L30
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/types/send_authorization.go#L29-L62
```

* `spend_limit` 跟踪授权中剩余的代币数量。
* `allow_list` 指定了一个可选的地址列表，授权人可以代表授权受让人向这些地址发送代币。

#### StakeAuthorization

`StakeAuthorization` 实现了 [staking 模块](../staking/README.md) 中消息的 `Authorization` 接口。它接受一个 `AuthorizationType`，用于指定您要授权委托、取消委托还是重新委托（即这些必须分别进行授权）。它还接受一个必需的 `MaxTokens`，用于跟踪可以委托/取消委托/重新委托的代币数量的限制。如果留空，则数量不受限制。此外，该 Msg 还接受一个 `AllowList` 或 `DenyList`，允许您选择允许或拒绝受让人与哪些验证人进行委托。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/authz.proto#L11-L35
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/types/authz.go#L15-L35
```

### Gas

为了防止 DoS 攻击，使用 `x/authz` 授予 `StakeAuthorization` 需要消耗 gas。`StakeAuthorization` 允许您授权另一个账户委托、取消委托或重新委托给验证人。授权人可以定义一个允许或拒绝委托的验证人列表。Cosmos SDK 会遍历这些列表，并为列表中的每个验证人收取 10 gas。

由于状态维护了一个具有相同过期时间的授权者和受让者对的列表，我们正在遍历该列表以从列表中删除授权（在特定的 `msgType` 撤销时），并且我们每次迭代都要收取 20 gas。

## 状态

### 授权

授权由授权者地址（授权者的地址字节）、受让者地址（受让者的地址字节）和授权类型（其类型 URL）组合标识。因此，我们只允许为（授权者、受让者、授权）三元组创建一个授权。

* 授权：`0x01 | 授权者地址长度（1 字节）| 授权者地址字节 | 受让者地址长度（1 字节）| 受让者地址字节 |  msgType 字节 -> ProtocolBuffer（AuthorizationGrant）`

授权对象封装了一个 `Authorization` 类型和一个过期时间戳：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/authz.proto#L24-L32
```

### 授权队列

我们维护一个用于授权修剪的队列。每当创建一个授权时，将使用过期时间、授权者和受让者作为键将项目添加到 `GrantQueue` 中。

在 `EndBlock`（每个区块运行一次）中，我们通过使用当前区块时间形成一个前缀键，该键通过存储在 `GrantQueue` 中的过期时间来检查和修剪过期的授权。我们遍历从 `GrantQueue` 中匹配的所有记录，并从 `GrantQueue` 和 `Grant` 存储中删除它们。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/5f4ddc6f80f9707320eec42182184207fff3833a/x/authz/keeper/keeper.go#L378-L403
```

* 授权队列：`0x02 | 过期时间字节 | 授权者地址长度（1 字节）| 授权者地址字节 | 受让者地址长度（1 字节）| 受让者地址字节 -> ProtocalBuffer（GrantQueueItem）`

`过期时间字节` 是 UTC 格式的过期日期，格式为 `"2006-01-02T15:04:05.000000000"`。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/authz/keeper/keys.go#L77-L93
```

`GrantQueueItem` 对象包含在键中指示的时间到期的授权者和受让者之间的类型 URL 列表。

## 消息

在本节中，我们描述了用于 authz 模块的消息处理。

### MsgGrant

使用 `MsgGrant` 消息创建授权许可。
如果 `(授权者, 受让者, 授权)` 三元组已经存在授权许可，则新的授权许可将覆盖之前的许可。要更新或扩展现有的授权许可，应创建一个具有相同的 `(授权者, 受让者, 授权)` 三元组的新授权许可。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/tx.proto#L35-L45
```

如果满足以下条件，则消息处理应失败：

* 授权者和受让者具有相同的地址。
* 提供的 `Expiration` 时间小于当前的 Unix 时间戳（但如果未提供 `expiration` 时间，则将创建一个授权许可，因为 `expiration` 是可选的）。
* 提供的 `Grant.Authorization` 未实现。
* `Authorization.MsgTypeURL()` 在路由器中未定义（应用程序路由器中没有定义处理该消息类型的处理程序）。

### MsgRevoke

可以使用 `MsgRevoke` 消息删除授权许可。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/tx.proto#L69-L78
```

如果满足以下条件，则消息处理应失败：

* 授权者和受让者具有相同的地址。
* 提供的 `MsgTypeUrl` 为空。

注意：如果授权许可已过期，则 `MsgExec` 消息将删除授权许可。

### MsgExec

当受让者想要代表授权者执行事务时，他们必须发送 `MsgExec`。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/tx.proto#L52-L63
```

如果满足以下条件，则消息处理应失败：

* 提供的 `Authorization` 未实现。
* 受让者没有运行该事务的权限。
* 授予的授权已过期。

## 事件

authz 模块发出的 proto 事件在 [Protobuf 参考](https://buf.build/cosmos/cosmos-sdk/docs/main/cosmos.authz.v1beta1#cosmos.authz.v1beta1.EventGrant) 中定义。

## 客户端

### CLI

用户可以使用 CLI 查询和与 `authz` 模块进行交互。

#### 查询

`query` 命令允许用户查询 `authz` 状态。

```bash
simd query authz --help
```

##### grants

`grants` 命令允许用户查询授权者-受权者对的授权。如果消息类型 URL 已设置，则仅选择该消息类型的授权。

```bash
simd query authz grants [授权者地址] [受权者地址] [消息类型 URL]? [flags]
```

示例：

```bash
simd query authz grants cosmos1.. cosmos1.. /cosmos.bank.v1beta1.MsgSend
```

示例输出：

```bash
grants:
- authorization:
    '@type': /cosmos.bank.v1beta1.SendAuthorization
    spend_limit:
    - amount: "100"
      denom: stake
  expiration: "2022-01-01T00:00:00Z"
pagination: null
```

#### 交易

`tx` 命令允许用户与 `authz` 模块进行交互。

```bash
simd tx authz --help
```

##### exec

`exec` 命令允许受权者代表授权者执行交易。

```bash
  simd tx authz exec [tx-json-file] --from [受权者] [flags]
```

示例：

```bash
simd tx authz exec tx.json --from=cosmos1..
```

##### grant

`grant` 命令允许授权者向受权者授予授权。

```bash
simd tx authz grant <受权者> <授权类型="send"|"generic"|"delegate"|"unbond"|"redelegate"> --from <授权者> [flags]
```

示例：

```bash
simd tx authz grant cosmos1.. send --spend-limit=100stake --from=cosmos1..
```

##### revoke

`revoke` 命令允许授权者从受权者那里撤销授权。

```bash
simd tx authz revoke [受权者] [消息类型 URL] --from=[授权者] [flags]
```

示例：

```bash
simd tx authz revoke cosmos1.. /cosmos.bank.v1beta1.MsgSend --from=cosmos1..
```

### gRPC

用户可以使用 gRPC 端点查询 `authz` 模块。

#### Grants

`Grants` 端点允许用户查询授权者-受权者对的授权。如果消息类型 URL 已设置，则仅选择该消息类型的授权。

```bash
cosmos.authz.v1beta1.Query/Grants
```

示例：

```bash
grpcurl -plaintext \
    -d '{"granter":"cosmos1..","grantee":"cosmos1..","msg_type_url":"/cosmos.bank.v1beta1.MsgSend"}' \
    localhost:9090 \
    cosmos.authz.v1beta1.Query/Grants
```

示例输出：

```bash
{
  "grants": [
    {
      "authorization": {
        "@type": "/cosmos.bank.v1beta1.SendAuthorization",
        "spendLimit": [
          {
            "denom":"stake",
            "amount":"100"
          }
        ]
      },
      "expiration": "2022-01-01T00:00:00Z"
    }
  ]
}
```

### REST

用户可以使用 REST 端点查询 `authz` 模块。

```bash
/cosmos/authz/v1beta1/grants
```

示例：

```bash
curl "localhost:1317/cosmos/authz/v1beta1/grants?granter=cosmos1..&grantee=cosmos1..&msg_type_url=/cosmos.bank.v1beta1.MsgSend"
```

```bash
{
  "grants": [
    {
      "authorization": {
        "@type": "/cosmos.bank.v1beta1.SendAuthorization",
        "spend_limit": [
          {
            "denom": "stake",
            "amount": "100"
          }
        ]
      },
      "expiration": "2022-01-01T00:00:00Z"
    }
  ],
  "pagination": null
}
```




# `x/authz`

## Abstract

`x/authz` is an implementation of a Cosmos SDK module, per [ADR 30](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-030-authz-module.md), that allows
granting arbitrary privileges from one account (the granter) to another account (the grantee). Authorizations must be granted for a particular Msg service method one by one using an implementation of the `Authorization` interface.

## Contents

* [Concepts](#concepts)
    * [Authorization and Grant](#authorization-and-grant)
    * [Built-in Authorizations](#built-in-authorizations)
    * [Gas](#gas)
* [State](#state)
    * [Grant](#grant)
    * [GrantQueue](#grantqueue)
* [Messages](#messages)
    * [MsgGrant](#msggrant)
    * [MsgRevoke](#msgrevoke)
    * [MsgExec](#msgexec)
* [Events](#events)
* [Client](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)
    * [REST](#rest)

## Concepts

### Authorization and Grant

The `x/authz` module defines interfaces and messages grant authorizations to perform actions
on behalf of one account to other accounts. The design is defined in the [ADR 030](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-030-authz-module.md).

A *grant* is an allowance to execute a Msg by the grantee on behalf of the granter.
Authorization is an interface that must be implemented by a concrete authorization logic to validate and execute grants. Authorizations are extensible and can be defined for any Msg service method even outside of the module where the Msg method is defined. See the `SendAuthorization` example in the next section for more details.

**Note:** The authz module is different from the [auth (authentication)](../auth/README.md) module that is responsible for specifying the base transaction and account types.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/authz/authorizations.go#L11-L25
```

### Built-in Authorizations

The Cosmos SDK `x/authz` module comes with following authorization types:

#### GenericAuthorization

`GenericAuthorization` implements the `Authorization` interface that gives unrestricted permission to execute the provided Msg on behalf of granter's account.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/authz.proto#L14-L22
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/authz/generic_authorization.go#L16-L29
```

* `msg` stores Msg type URL.

#### SendAuthorization

`SendAuthorization` implements the `Authorization` interface for the `cosmos.bank.v1beta1.MsgSend` Msg.

* It takes a (positive) `SpendLimit` that specifies the maximum amount of tokens the grantee can spend. The `SpendLimit` is updated as the tokens are spent.
* It takes an (optional) `AllowList` that specifies to which addresses a grantee can send token.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/bank/v1beta1/authz.proto#L11-L30
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/types/send_authorization.go#L29-L62
```

* `spend_limit` keeps track of how many coins are left in the authorization.
* `allow_list` specifies an optional list of addresses to whom the grantee can send tokens on behalf of the granter.

#### StakeAuthorization

`StakeAuthorization` implements the `Authorization` interface for messages in the [staking module](../staking/README.md). It takes an `AuthorizationType` to specify whether you want to authorise delegating, undelegating or redelegating (i.e. these have to be authorised seperately). It also takes a required `MaxTokens` that keeps track of a limit to the amount of tokens that can be delegated/undelegated/redelegated. If left empty, the amount is unlimited. Additionally, this Msg takes an `AllowList` or a `DenyList`, which allows you to select which validators you allow or deny grantees to stake with.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/staking/v1beta1/authz.proto#L11-L35
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/staking/types/authz.go#L15-L35
```

### Gas

In order to prevent DoS attacks, granting `StakeAuthorization`s with `x/authz` incurs gas. `StakeAuthorization` allows you to authorize another account to delegate, undelegate, or redelegate to validators. The authorizer can define a list of validators they allow or deny delegations to. The Cosmos SDK iterates over these lists and charge 10 gas for each validator in both of the lists.

Since the state maintaining a list for granter, grantee pair with same expiration, we are iterating over the list to remove the grant (incase of any revoke of paritcular `msgType`) from the list and we are charging 20 gas per iteration.

## State

### Grant

Grants are identified by combining granter address (the address bytes of the granter), grantee address (the address bytes of the grantee) and Authorization type (its type URL). Hence we only allow one grant for the (granter, grantee, Authorization) triple.

* Grant: `0x01 | granter_address_len (1 byte) | granter_address_bytes | grantee_address_len (1 byte) | grantee_address_bytes |  msgType_bytes -> ProtocolBuffer(AuthorizationGrant)`

The grant object encapsulates an `Authorization` type and an expiration timestamp:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/authz.proto#L24-L32
```

### GrantQueue

We are maintaining a queue for authz pruning. Whenever a grant is created, an item will be added to `GrantQueue` with a key of expiration, granter, grantee.

In `EndBlock` (which runs for every block) we continuously check and prune the expired grants by forming a prefix key with current blocktime that passed the stored expiration in `GrantQueue`, we iterate through all the matched records from `GrantQueue` and delete them from the `GrantQueue` & `Grant`s store.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/5f4ddc6f80f9707320eec42182184207fff3833a/x/authz/keeper/keeper.go#L378-L403
```

* GrantQueue: `0x02 | expiration_bytes | granter_address_len (1 byte) | granter_address_bytes | grantee_address_len (1 byte) | grantee_address_bytes -> ProtocalBuffer(GrantQueueItem)`

The `expiration_bytes` are the expiration date in UTC with the format `"2006-01-02T15:04:05.000000000"`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/authz/keeper/keys.go#L77-L93
```

The `GrantQueueItem` object contains the list of type urls between granter and grantee that expire at the time indicated in the key.

## Messages

In this section we describe the processing of messages for the authz module.

### MsgGrant

An authorization grant is created using the `MsgGrant` message.
If there is already a grant for the `(granter, grantee, Authorization)` triple, then the new grant overwrites the previous one. To update or extend an existing grant, a new grant with the same `(granter, grantee, Authorization)` triple should be created.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/tx.proto#L35-L45
```

The message handling should fail if:

* both granter and grantee have the same address.
* provided `Expiration` time is less than current unix timestamp (but a grant will be created if no `expiration` time is provided since `expiration` is optional).
* provided `Grant.Authorization` is not implemented.
* `Authorization.MsgTypeURL()` is not defined in the router (there is no defined handler in the app router to handle that Msg types).

### MsgRevoke

A grant can be removed with the `MsgRevoke` message.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/tx.proto#L69-L78
```

The message handling should fail if:

* both granter and grantee have the same address.
* provided `MsgTypeUrl` is empty.

NOTE: The `MsgExec` message removes a grant if the grant has expired.

### MsgExec

When a grantee wants to execute a transaction on behalf of a granter, they must send `MsgExec`.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/authz/v1beta1/tx.proto#L52-L63
```

The message handling should fail if:

* provided `Authorization` is not implemented.
* grantee doesn't have permission to run the transaction.
* if granted authorization is expired.

## Events

The authz module emits proto events defined in [the Protobuf reference](https://buf.build/cosmos/cosmos-sdk/docs/main/cosmos.authz.v1beta1#cosmos.authz.v1beta1.EventGrant).

## Client

### CLI

A user can query and interact with the `authz` module using the CLI.

#### Query

The `query` commands allow users to query `authz` state.

```bash
simd query authz --help
```

##### grants

The `grants` command allows users to query grants for a granter-grantee pair. If the message type URL is set, it selects grants only for that message type.

```bash
simd query authz grants [granter-addr] [grantee-addr] [msg-type-url]? [flags]
```

Example:

```bash
simd query authz grants cosmos1.. cosmos1.. /cosmos.bank.v1beta1.MsgSend
```

Example Output:

```bash
grants:
- authorization:
    '@type': /cosmos.bank.v1beta1.SendAuthorization
    spend_limit:
    - amount: "100"
      denom: stake
  expiration: "2022-01-01T00:00:00Z"
pagination: null
```

#### Transactions

The `tx` commands allow users to interact with the `authz` module.

```bash
simd tx authz --help
```

##### exec

The `exec` command allows a grantee to execute a transaction on behalf of granter.

```bash
  simd tx authz exec [tx-json-file] --from [grantee] [flags]
```

Example:

```bash
simd tx authz exec tx.json --from=cosmos1..
```

##### grant

The `grant` command allows a granter to grant an authorization to a grantee.

```bash
simd tx authz grant <grantee> <authorization_type="send"|"generic"|"delegate"|"unbond"|"redelegate"> --from <granter> [flags]
```

Example:

```bash
simd tx authz grant cosmos1.. send --spend-limit=100stake --from=cosmos1..
```

##### revoke

The `revoke` command allows a granter to revoke an authorization from a grantee.

```bash
simd tx authz revoke [grantee] [msg-type-url] --from=[granter] [flags]
```

Example:

```bash
simd tx authz revoke cosmos1.. /cosmos.bank.v1beta1.MsgSend --from=cosmos1..
```

### gRPC

A user can query the `authz` module using gRPC endpoints.

#### Grants

The `Grants` endpoint allows users to query grants for a granter-grantee pair. If the message type URL is set, it selects grants only for that message type.

```bash
cosmos.authz.v1beta1.Query/Grants
```

Example:

```bash
grpcurl -plaintext \
    -d '{"granter":"cosmos1..","grantee":"cosmos1..","msg_type_url":"/cosmos.bank.v1beta1.MsgSend"}' \
    localhost:9090 \
    cosmos.authz.v1beta1.Query/Grants
```

Example Output:

```bash
{
  "grants": [
    {
      "authorization": {
        "@type": "/cosmos.bank.v1beta1.SendAuthorization",
        "spendLimit": [
          {
            "denom":"stake",
            "amount":"100"
          }
        ]
      },
      "expiration": "2022-01-01T00:00:00Z"
    }
  ]
}
```

### REST

A user can query the `authz` module using REST endpoints.

```bash
/cosmos/authz/v1beta1/grants
```

Example:

```bash
curl "localhost:1317/cosmos/authz/v1beta1/grants?granter=cosmos1..&grantee=cosmos1..&msg_type_url=/cosmos.bank.v1beta1.MsgSend"
```

Example Output:

```bash
{
  "grants": [
    {
      "authorization": {
        "@type": "/cosmos.bank.v1beta1.SendAuthorization",
        "spend_limit": [
          {
            "denom": "stake",
            "amount": "100"
          }
        ]
      },
      "expiration": "2022-01-01T00:00:00Z"
    }
  ],
  "pagination": null
}
```
