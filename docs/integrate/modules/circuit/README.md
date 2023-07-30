# `x/circuit`

## 概念

断路器是一个模块，旨在避免在存在漏洞的情况下需要停止/关闭链，而是允许禁用特定消息或所有消息。在操作链时，如果是特定于应用程序的，则链的停止影响较小，但如果有建立在链上的应用程序，则停止是昂贵的，因为会对应用程序造成干扰。

断路器的工作原理是，一个地址或一组地址有权阻止消息的执行和/或包含在内存池中。具有权限的任何地址都可以重置消息的断路器。

## 状态

### 账户

* AccountPermissions `0x1 | account_address  -> ProtocolBuffer(CircuitBreakerPermissions)`

```go
type level int32

const (
    // LEVEL_NONE_UNSPECIFIED indicates that the account will have no circuit
    // breaker permissions.
    LEVEL_NONE_UNSPECIFIED = iota
    // LEVEL_SOME_MSGS indicates that the account will have permission to
    // trip or reset the circuit breaker for some Msg type URLs. If this level
    // is chosen, a non-empty list of Msg type URLs must be provided in
    // limit_type_urls.
    LEVEL_SOME_MSGS
    // LEVEL_ALL_MSGS indicates that the account can trip or reset the circuit
    // breaker for Msg's of all type URLs.
    LEVEL_ALL_MSGS 
    // LEVEL_SUPER_ADMIN indicates that the account can take all circuit breaker
    // actions and can grant permissions to other accounts.
    LEVEL_SUPER_ADMIN
)

type Access struct {
	level int32 
	msgs []string // if full permission, msgs can be empty
}
```


### 禁用列表

禁用的类型 URL 列表。

* DisableList `0x2 | msg_type_url -> []byte{}` <!--- 是否应该将其存储为 JSON 以跳过每个块的编码和解码，这是否重要？-->

## 状态转换

### 授权

授权由模块权限（默认的治理模块账户）或具有 `LEVEL_SUPER_ADMIN` 的任何账户调用，以授权另一个账户禁用/启用消息。可以授予三个级别的权限。`LEVEL_SOME_MSGS` 限制可以禁用的消息数量。`LEVEL_ALL_MSGS` 允许禁用所有消息。`LEVEL_SUPER_ADMIN` 允许一个账户执行所有断路器操作，包括授权和取消授权其他账户。

```protobuf
  // AuthorizeCircuitBreaker allows a super-admin to grant (or revoke) another
  // account's circuit breaker permissions.
  rpc AuthorizeCircuitBreaker(MsgAuthorizeCircuitBreaker) returns (MsgAuthorizeCircuitBreakerResponse);
```

### 触发

触发由一个账户调用，以禁用特定 msgURL 的消息执行。

```protobuf
  // TripCircuitBreaker pauses processing of Msg's in the state machine.
  rpc TripCircuitBreaker(MsgTripCircuitBreaker) returns (MsgTripCircuitBreakerResponse);
```

### 重置

重置被调用以启用先前禁用的消息的执行。

```protobuf
  // ResetCircuitBreaker resumes processing of Msg's in the state machine that
  // have been been paused using TripCircuitBreaker.
  rpc ResetCircuitBreaker(MsgResetCircuitBreaker) returns (MsgResetCircuitBreakerResponse);
```

## 消息

### MsgAuthorizeCircuitBreaker

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/circuit/v1/tx.proto#L25-L75
```

这条消息预计会失败，如果：

* 授权者不是具有`LEVEL_SUPER_ADMIN`权限级别或模块权限的帐户
* 类型URL不存在 <!-- TODO: 这可能吗？-->

### MsgTripCircuitBreaker

```protobuf reference 
https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/circuit/v1/tx.proto#L77-L93
```

这条消息预计会失败，如果：

* 签名者没有具有禁用指定类型URL消息的权限级别
* 类型URL不存在 <!-- TODO: 这可能吗？-->

### MsgResetCircuitBreaker

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/circuit/v1/tx.proto#L95-109
```

这条消息预计会失败，如果：

* 类型URL不存在 <!-- TODO: 这可能吗？-->
* 类型URL未被禁用

* `## Events` - 列出并描述使用的事件标签
* `## Client` - 列出并描述CLI命令以及gRPC和REST端点


# `x/circuit`

## Concepts

Circuit Breaker is a module that is meant to avoid a chain needing to halt/shut down in the presence of a vulnerability, instead the module will allow specific messages or all messages to be disabled. When operating a chain, if it is app specific then a halt of the chain is less detrimental, but if there are applications built on top of the chain then halting is expensive due to the disturbance to applications. 

Circuit Breaker works with the idea that an address or set of addresses have the right to block messages from being executed and/or included in the mempool. Any address with a permission is able to reset the circuit breaker for the message. 

## State

### Accounts

* AccountPermissions `0x1 | account_address  -> ProtocolBuffer(CircuitBreakerPermissions)`

```go
type level int32

const (
    // LEVEL_NONE_UNSPECIFIED indicates that the account will have no circuit
    // breaker permissions.
    LEVEL_NONE_UNSPECIFIED = iota
    // LEVEL_SOME_MSGS indicates that the account will have permission to
    // trip or reset the circuit breaker for some Msg type URLs. If this level
    // is chosen, a non-empty list of Msg type URLs must be provided in
    // limit_type_urls.
    LEVEL_SOME_MSGS
    // LEVEL_ALL_MSGS indicates that the account can trip or reset the circuit
    // breaker for Msg's of all type URLs.
    LEVEL_ALL_MSGS 
    // LEVEL_SUPER_ADMIN indicates that the account can take all circuit breaker
    // actions and can grant permissions to other accounts.
    LEVEL_SUPER_ADMIN
)

type Access struct {
	level int32 
	msgs []string // if full permission, msgs can be empty
}
```


### Disable List

List of type urls that are disabled.

* DisableList `0x2 | msg_type_url -> []byte{}` <!--- should this be stored in json to skip encoding and decoding each block, does it matter?-->

## State Transitions

### Authorize 

Authorize, is called by the module authority (default governance module account) or any account with `LEVEL_SUPER_ADMIN` to give permission to disable/enable messages to another account. There are three levels of permissions that can be granted. `LEVEL_SOME_MSGS` limits the number of messages that can be disabled. `LEVEL_ALL_MSGS` permits all messages to be disabled. `LEVEL_SUPER_ADMIN` allows an account to take all circuit breaker actions including authorizing and deauthorizing other accounts.

```protobuf
  // AuthorizeCircuitBreaker allows a super-admin to grant (or revoke) another
  // account's circuit breaker permissions.
  rpc AuthorizeCircuitBreaker(MsgAuthorizeCircuitBreaker) returns (MsgAuthorizeCircuitBreakerResponse);
```

### Trip

Trip, is called by an account to disable message execution for a specific msgURL. 

```protobuf
  // TripCircuitBreaker pauses processing of Msg's in the state machine.
  rpc TripCircuitBreaker(MsgTripCircuitBreaker) returns (MsgTripCircuitBreakerResponse);
```

### Reset

Reset is called to enable execution of a previously disabled message. 

```protobuf
  // ResetCircuitBreaker resumes processing of Msg's in the state machine that
  // have been been paused using TripCircuitBreaker.
  rpc ResetCircuitBreaker(MsgResetCircuitBreaker) returns (MsgResetCircuitBreakerResponse);
```

## Messages

### MsgAuthorizeCircuitBreaker

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/circuit/v1/tx.proto#L25-L75
```

This message is expected to fail if:

* the granter is not an account with permission level `LEVEL_SUPER_ADMIN` or the module authority
* if the type urls does not exist <!-- TODO: is this possible?-->

### MsgTripCircuitBreaker

```protobuf reference 
https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/circuit/v1/tx.proto#L77-L93
```

This message is expected to fail if:

* if the signer does not have a permission level with the ability to disable the specified type url message
* if the type urls does not exist <!-- TODO: is this possible?-->

### MsgResetCircuitBreaker

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/circuit/v1/tx.proto#L95-109
```

This message is expected to fail if:

* if the type urls does not exist <!-- TODO: is this possible?-->
* if the type url is not disabled

* `## Events` - list and describe event tags used
* `## Client` - list and describe CLI commands and gRPC and REST endpoints
