# `x/auth/tx`

:::note

### 先决条件阅读

* [交易](https://docs.cosmos.network/main/core/transactions#transaction-generation)
* [编码](https://docs.cosmos.network/main/core/encoding#transaction-encoding)

:::

## 摘要

本文档详细说明了 Cosmos SDK 的 `x/auth/tx` 包。

该包表示 Cosmos SDK 对 `client.TxConfig`、`client.TxBuilder`、`client.TxEncoder` 和 `client.TxDecoder` 接口的实现。

## 目录

* [交易](#transactions)
    * [`TxConfig`](#txconfig)
    * [`TxBuilder`](#txbuilder)
    * [`TxEncoder`/ `TxDecoder`](#txencoder-txdecoder)
* [客户端](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)

## 交易

### `TxConfig`

`client.TxConfig` 定义了一个客户端可以使用的接口，用于生成应用程序定义的具体交易类型。
该接口定义了一组用于创建 `client.TxBuilder` 的方法。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx_config.go#L25-L31
```

`client.TxConfig` 的默认实现由 `x/auth/tx` 模块中的 `NewTxConfig` 实例化。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/config.go#L22-L28
```

### `TxBuilder`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx_config.go#L33-L50
```

[`client.TxBuilder`](https://docs.cosmos.network/main/core/transactions#transaction-generation) 接口也由 `x/auth/tx` 实现。
可以使用 `TxConfig.NewTxBuilder()` 访问 `client.TxBuilder`。

### `TxEncoder`/ `TxDecoder`

有关 `TxEncoder` 和 `TxDecoder` 的更多信息，请参阅[此处](https://docs.cosmos.network/main/core/encoding#transaction-encoding)。

## 客户端

### CLI

#### 查询

`x/auth/tx` 模块提供了一个 CLI 命令，用于查询任何交易，可以使用交易哈希、交易序列或签名进行查询。

如果没有任何参数，该命令将使用交易哈希进行查询。

```shell
simd query tx DFE87B78A630C0EFDF76C80CD24C997E252792E0317502AE1A02B9809F0D8685
```

当根据序列查询账户的交易时，请使用 `--type=acc_seq` 标志：

```shell
simd query tx --type=acc_seq cosmos1u69uyr6v9qwe6zaaeaqly2h6wnedac0xpxq325/1
```

当根据签名查询交易时，请使用 `--type=signature` 标志：

```shell
simd query tx --type=signature Ofjvgrqi8twZfqVDmYIhqwRLQjZZ40XbxEamk/veH3gQpRF0hL2PH4ejRaDzAX+2WChnaWNQJQ41ekToIi5Wqw==
```

当根据事件查询交易时，请使用 `--type=events` 标志：

```shell
simd query txs --events 'message.sender=cosmos...' --page 1 --limit 30
```

`x/auth/block` 模块提供了一个用于查询任何块的 CLI 命令，可以根据其哈希、高度或事件进行查询。

当根据哈希查询块时，请使用 `--type=hash` 标志：

```shell
simd query block --type=hash DFE87B78A630C0EFDF76C80CD24C997E252792E0317502AE1A02B9809F0D8685
```

当根据高度查询块时，请使用 `--type=height` 标志：

```shell
simd query block --type=height 1357
```

当根据事件查询块时，请使用 `--query` 标志：

```shell
simd query blocks --query 'message.sender=cosmos...' --page 1 --limit 30
```

#### 交易

`x/auth/tx` 模块提供了一个方便的 CLI 命令，用于解码和编码交易。

#### `encode`

`encode` 命令用于对使用 `--generate-only` 标志创建的交易或使用签名命令签名的交易进行编码。
该交易被序列化为 Protobuf 并以 base64 返回。

```bash
$ simd tx encode tx.json
Co8BCowBChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEmwKLWNvc21vczFsNnZzcWhoN3Jud3N5cjJreXozampnM3FkdWF6OGd3Z3lsODI3NRItY29zbW9zMTU4c2FsZHlnOHBteHU3Znd2dDBkNng3amVzd3A0Z3d5a2xrNnkzGgwKBXN0YWtlEgMxMDASBhIEEMCaDA==
$ simd tx encode tx.signed.json
```

有关 `encode` 命令的更多信息，请运行 `simd tx encode --help`。

#### `decode`

`decode` 命令用于解码使用 `encode` 命令编码的交易。

```bash
simd tx decode Co8BCowBChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEmwKLWNvc21vczFsNnZzcWhoN3Jud3N5cjJreXozampnM3FkdWF6OGd3Z3lsODI3NRItY29zbW9zMTU4c2FsZHlnOHBteHU3Znd2dDBkNng3amVzd3A0Z3d5a2xrNnkzGgwKBXN0YWtlEgMxMDASBhIEEMCaDA==
```

有关 `decode` 命令的更多信息，请运行 `simd tx decode --help`。

### gRPC

用户可以使用 gRPC 端点查询 `x/auth/tx` 模块。

#### `TxDecode`

`TxDecode`端点允许解码交易。

```shell
cosmos.tx.v1beta1.Service/TxDecode
```

示例：

```shell
grpcurl -plaintext \
    -d '{"tx_bytes":"Co8BCowBChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEmwKLWNvc21vczFsNnZzcWhoN3Jud3N5cjJreXozampnM3FkdWF6OGd3Z3lsODI3NRItY29zbW9zMTU4c2FsZHlnOHBteHU3Znd2dDBkNng3amVzd3A0Z3d5a2xrNnkzGgwKBXN0YWtlEgMxMDASBhIEEMCaDA=="}' \
    localhost:9090 \
    cosmos.tx.v1beta1.Service/TxDecode
```

示例输出：

```json
{
  "tx": {
    "body": {
      "messages": [
        {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"100"}],"fromAddress":"cosmos1l6vsqhh7rnwsyr2kyz3jjg3qduaz8gwgyl8275","toAddress":"cosmos158saldyg8pmxu7fwvt0d6x7jeswp4gwyklk6y3"}
      ]
    },
    "authInfo": {
      "fee": {
        "gasLimit": "200000"
      }
    }
  }
}
```

#### `TxEncode`

`TxEncode`端点允许编码交易。

```shell
cosmos.tx.v1beta1.Service/TxEncode
```

示例：

```shell
grpcurl -plaintext \
    -d '{"tx": {
    "body": {
      "messages": [
        {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"100"}],"fromAddress":"cosmos1l6vsqhh7rnwsyr2kyz3jjg3qduaz8gwgyl8275","toAddress":"cosmos158saldyg8pmxu7fwvt0d6x7jeswp4gwyklk6y3"}
      ]
    },
    "authInfo": {
      "fee": {
        "gasLimit": "200000"
      }
    }
  }}' \
    localhost:9090 \
    cosmos.tx.v1beta1.Service/TxEncode
```

示例输出：

```json
{
  "txBytes": "Co8BCowBChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEmwKLWNvc21vczFsNnZzcWhoN3Jud3N5cjJreXozampnM3FkdWF6OGd3Z3lsODI3NRItY29zbW9zMTU4c2FsZHlnOHBteHU3Znd2dDBkNng3amVzd3A0Z3d5a2xrNnkzGgwKBXN0YWtlEgMxMDASBhIEEMCaDA=="
}
```

#### `TxDecodeAmino`

`TxDecode`端点允许解码amino交易。

```shell
cosmos.tx.v1beta1.Service/TxDecodeAmino
```

示例：

```shell
grpcurl -plaintext \
    -d '{"amino_binary": "KCgWqQpvqKNhmgotY29zbW9zMXRzeno3cDJ6Z2Q3dnZrYWh5ZnJlNHduNXh5dTgwcnB0ZzZ2OWg1Ei1jb3Ntb3MxdHN6ejdwMnpnZDd2dmthaHlmcmU0d241eHl1ODBycHRnNnY5aDUaCwoFc3Rha2USAjEwEhEKCwoFc3Rha2USAjEwEMCaDCIGZm9vYmFy"}' \
    localhost:9090 \
    cosmos.tx.v1beta1.Service/TxDecodeAmino
```

示例输出：

```json
{
  "aminoJson": "{\"type\":\"cosmos-sdk/StdTx\",\"value\":{\"msg\":[{\"type\":\"cosmos-sdk/MsgSend\",\"value\":{\"from_address\":\"cosmos1tszz7p2zgd7vvkahyfre4wn5xyu80rptg6v9h5\",\"to_address\":\"cosmos1tszz7p2zgd7vvkahyfre4wn5xyu80rptg6v9h5\",\"amount\":[{\"denom\":\"stake\",\"amount\":\"10\"}]}}],\"fee\":{\"amount\":[{\"denom\":\"stake\",\"amount\":\"10\"}],\"gas\":\"200000\"},\"signatures\":null,\"memo\":\"foobar\",\"timeout_height\":\"0\"}}"
}
```

#### `TxEncodeAmino`

`TxEncodeAmino`端点允许编码amino交易。

```shell
cosmos.tx.v1beta1.Service/TxEncodeAmino
```

示例：

```shell
grpcurl -plaintext \
    -d '{"amino_json":"{\"type\":\"cosmos-sdk/StdTx\",\"value\":{\"msg\":[{\"type\":\"cosmos-sdk/MsgSend\",\"value\":{\"from_address\":\"cosmos1tszz7p2zgd7vvkahyfre4wn5xyu80rptg6v9h5\",\"to_address\":\"cosmos1tszz7p2zgd7vvkahyfre4wn5xyu80rptg6v9h5\",\"amount\":[{\"denom\":\"stake\",\"amount\":\"10\"}]}}],\"fee\":{\"amount\":[{\"denom\":\"stake\",\"amount\":\"10\"}],\"gas\":\"200000\"},\"signatures\":null,\"memo\":\"foobar\",\"timeout_height\":\"0\"}}"}' \
    localhost:9090 \
    cosmos.tx.v1beta1.Service/TxEncodeAmino
```

示例输出：

```json
{
  "amino_binary": "KCgWqQpvqKNhmgotY29zbW9zMXRzeno3cDJ6Z2Q3dnZrYWh5ZnJlNHduNXh5dTgwcnB0ZzZ2OWg1Ei1jb3Ntb3MxdHN6ejdwMnpnZDd2dmthaHlmcmU0d241eHl1ODBycHRnNnY5aDUaCwoFc3Rha2USAjEwEhEKCwoFc3Rha2USAjEwEMCaDCIGZm9vYmFy"
}
```




# `x/auth/tx`

:::note

### Pre-requisite Readings

* [Transactions](https://docs.cosmos.network/main/core/transactions#transaction-generation)
* [Encoding](https://docs.cosmos.network/main/core/encoding#transaction-encoding)

:::

## Abstract

This document specifies the `x/auth/tx` package of the Cosmos SDK.

This package represents the Cosmos SDK implementation of the `client.TxConfig`, `client.TxBuilder`, `client.TxEncoder` and `client.TxDecoder` interfaces.

## Contents

* [Transactions](#transactions)
    * [`TxConfig`](#txconfig)
    * [`TxBuilder`](#txbuilder)
    * [`TxEncoder`/ `TxDecoder`](#txencoder-txdecoder)
* [Client](#client)
    * [CLI](#cli)
    * [gRPC](#grpc)

## Transactions

### `TxConfig`

`client.TxConfig` defines an interface a client can utilize to generate an application-defined concrete transaction type.
The interface defines a set of methods for creating a `client.TxBuilder`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx_config.go#L25-L31
```

The default implementation of `client.TxConfig` is instantiated by `NewTxConfig` in `x/auth/tx` module.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/auth/tx/config.go#L22-L28
```

### `TxBuilder`

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/client/tx_config.go#L33-L50
```

The [`client.TxBuilder`](https://docs.cosmos.network/main/core/transactions#transaction-generation) interface is as well implemented by `x/auth/tx`.
A `client.TxBuilder` can be accessed with `TxConfig.NewTxBuilder()`.  

### `TxEncoder`/ `TxDecoder`

More information about `TxEncoder` and `TxDecoder` can be found [here](https://docs.cosmos.network/main/core/encoding#transaction-encoding).

## Client

### CLI

#### Query

The `x/auth/tx` module provides a CLI command to query any transaction, given its hash, transaction sequence or signature.

Without any argument, the command will query the transaction using the transaction hash.

```shell
simd query tx DFE87B78A630C0EFDF76C80CD24C997E252792E0317502AE1A02B9809F0D8685
```

When querying a transaction from an account given its sequence, use the `--type=acc_seq` flag:

```shell
simd query tx --type=acc_seq cosmos1u69uyr6v9qwe6zaaeaqly2h6wnedac0xpxq325/1
```

When querying a transaction given its signature, use the `--type=signature` flag:

```shell
simd query tx --type=signature Ofjvgrqi8twZfqVDmYIhqwRLQjZZ40XbxEamk/veH3gQpRF0hL2PH4ejRaDzAX+2WChnaWNQJQ41ekToIi5Wqw==
```

When querying a transaction given its events, use the `--type=events` flag:

```shell
simd query txs --events 'message.sender=cosmos...' --page 1 --limit 30
```

The `x/auth/block` module provides a CLI command to query any block, given its hash, height, or events.

When querying a block by its hash, use the `--type=hash` flag:

```shell
simd query block --type=hash DFE87B78A630C0EFDF76C80CD24C997E252792E0317502AE1A02B9809F0D8685
```

When querying a block by its height, use the `--type=height` flag:

```shell
simd query block --type=height 1357
```

When querying a block by its events, use the `--query` flag:

```shell
simd query blocks --query 'message.sender=cosmos...' --page 1 --limit 30
```

#### Transactions

The `x/auth/tx` module provides a convinient CLI command for decoding and encoding transactions.

#### `encode`

The `encode` command encodes a transaction created with the `--generate-only` flag or signed with the sign command.
The transaction is seralized it to Protobuf and returned as base64.

```bash
$ simd tx encode tx.json
Co8BCowBChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEmwKLWNvc21vczFsNnZzcWhoN3Jud3N5cjJreXozampnM3FkdWF6OGd3Z3lsODI3NRItY29zbW9zMTU4c2FsZHlnOHBteHU3Znd2dDBkNng3amVzd3A0Z3d5a2xrNnkzGgwKBXN0YWtlEgMxMDASBhIEEMCaDA==
$ simd tx encode tx.signed.json
```

More information about the `encode` command can be found running `simd tx encode --help`.

#### `decode`

The `decode` commands decodes a transaction encoded with the `encode` command.


```bash
simd tx decode Co8BCowBChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEmwKLWNvc21vczFsNnZzcWhoN3Jud3N5cjJreXozampnM3FkdWF6OGd3Z3lsODI3NRItY29zbW9zMTU4c2FsZHlnOHBteHU3Znd2dDBkNng3amVzd3A0Z3d5a2xrNnkzGgwKBXN0YWtlEgMxMDASBhIEEMCaDA==
```

More information about the `decode` command can be found running `simd tx decode --help`.

### gRPC

A user can query the `x/auth/tx` module using gRPC endpoints.

#### `TxDecode`

The `TxDecode` endpoint allows to decode a transaction.

```shell
cosmos.tx.v1beta1.Service/TxDecode
```

Example:

```shell
grpcurl -plaintext \
    -d '{"tx_bytes":"Co8BCowBChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEmwKLWNvc21vczFsNnZzcWhoN3Jud3N5cjJreXozampnM3FkdWF6OGd3Z3lsODI3NRItY29zbW9zMTU4c2FsZHlnOHBteHU3Znd2dDBkNng3amVzd3A0Z3d5a2xrNnkzGgwKBXN0YWtlEgMxMDASBhIEEMCaDA=="}' \
    localhost:9090 \
    cosmos.tx.v1beta1.Service/TxDecode
```

Example Output:

```json
{
  "tx": {
    "body": {
      "messages": [
        {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"100"}],"fromAddress":"cosmos1l6vsqhh7rnwsyr2kyz3jjg3qduaz8gwgyl8275","toAddress":"cosmos158saldyg8pmxu7fwvt0d6x7jeswp4gwyklk6y3"}
      ]
    },
    "authInfo": {
      "fee": {
        "gasLimit": "200000"
      }
    }
  }
}
```

#### `TxEncode`

The `TxEncode` endpoint allows to encode a transaction.

```shell
cosmos.tx.v1beta1.Service/TxEncode
```

Example:

```shell
grpcurl -plaintext \
    -d '{"tx": {
    "body": {
      "messages": [
        {"@type":"/cosmos.bank.v1beta1.MsgSend","amount":[{"denom":"stake","amount":"100"}],"fromAddress":"cosmos1l6vsqhh7rnwsyr2kyz3jjg3qduaz8gwgyl8275","toAddress":"cosmos158saldyg8pmxu7fwvt0d6x7jeswp4gwyklk6y3"}
      ]
    },
    "authInfo": {
      "fee": {
        "gasLimit": "200000"
      }
    }
  }}' \
    localhost:9090 \
    cosmos.tx.v1beta1.Service/TxEncode
```

Example Output:

```json
{
  "txBytes": "Co8BCowBChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEmwKLWNvc21vczFsNnZzcWhoN3Jud3N5cjJreXozampnM3FkdWF6OGd3Z3lsODI3NRItY29zbW9zMTU4c2FsZHlnOHBteHU3Znd2dDBkNng3amVzd3A0Z3d5a2xrNnkzGgwKBXN0YWtlEgMxMDASBhIEEMCaDA=="
}
```

#### `TxDecodeAmino`

The `TxDecode` endpoint allows to decode an amino transaction.

```shell
cosmos.tx.v1beta1.Service/TxDecodeAmino
```

Example:

```shell
grpcurl -plaintext \
    -d '{"amino_binary": "KCgWqQpvqKNhmgotY29zbW9zMXRzeno3cDJ6Z2Q3dnZrYWh5ZnJlNHduNXh5dTgwcnB0ZzZ2OWg1Ei1jb3Ntb3MxdHN6ejdwMnpnZDd2dmthaHlmcmU0d241eHl1ODBycHRnNnY5aDUaCwoFc3Rha2USAjEwEhEKCwoFc3Rha2USAjEwEMCaDCIGZm9vYmFy"}' \
    localhost:9090 \
    cosmos.tx.v1beta1.Service/TxDecodeAmino
```

Example Output:

```json
{
  "aminoJson": "{\"type\":\"cosmos-sdk/StdTx\",\"value\":{\"msg\":[{\"type\":\"cosmos-sdk/MsgSend\",\"value\":{\"from_address\":\"cosmos1tszz7p2zgd7vvkahyfre4wn5xyu80rptg6v9h5\",\"to_address\":\"cosmos1tszz7p2zgd7vvkahyfre4wn5xyu80rptg6v9h5\",\"amount\":[{\"denom\":\"stake\",\"amount\":\"10\"}]}}],\"fee\":{\"amount\":[{\"denom\":\"stake\",\"amount\":\"10\"}],\"gas\":\"200000\"},\"signatures\":null,\"memo\":\"foobar\",\"timeout_height\":\"0\"}}"
}
```

#### `TxEncodeAmino`

The `TxEncodeAmino` endpoint allows to encode an amino transaction.

```shell
cosmos.tx.v1beta1.Service/TxEncodeAmino
```

Example:

```shell
grpcurl -plaintext \
    -d '{"amino_json":"{\"type\":\"cosmos-sdk/StdTx\",\"value\":{\"msg\":[{\"type\":\"cosmos-sdk/MsgSend\",\"value\":{\"from_address\":\"cosmos1tszz7p2zgd7vvkahyfre4wn5xyu80rptg6v9h5\",\"to_address\":\"cosmos1tszz7p2zgd7vvkahyfre4wn5xyu80rptg6v9h5\",\"amount\":[{\"denom\":\"stake\",\"amount\":\"10\"}]}}],\"fee\":{\"amount\":[{\"denom\":\"stake\",\"amount\":\"10\"}],\"gas\":\"200000\"},\"signatures\":null,\"memo\":\"foobar\",\"timeout_height\":\"0\"}}"}' \
    localhost:9090 \
    cosmos.tx.v1beta1.Service/TxEncodeAmino
```

Example Output:

```json
{
  "amino_binary": "KCgWqQpvqKNhmgotY29zbW9zMXRzeno3cDJ6Z2Q3dnZrYWh5ZnJlNHduNXh5dTgwcnB0ZzZ2OWg1Ei1jb3Ntb3MxdHN6ejdwMnpnZDd2dmthaHlmcmU0d241eHl1ODBycHRnNnY5aDUaCwoFc3Rha2USAjEwEhEKCwoFc3Rha2USAjEwEMCaDCIGZm9vYmFy"
}
```
