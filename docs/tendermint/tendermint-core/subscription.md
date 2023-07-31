---
order: 7
---

# 通过 Websocket 订阅事件

Tendermint 发出不同的事件，您可以通过 [Websocket](https://en.wikipedia.org/wiki/WebSocket) 进行订阅。这对于第三方应用程序（用于分析）或检查状态非常有用。

[事件列表](https://godoc.org/github.com/tendermint/tendermint/types#pkg-constants)

要通过 CLI 连接到节点的 Websocket，您可以使用类似 [wscat](https://github.com/websockets/wscat) 的工具，并运行以下命令：

```sh
wscat ws://127.0.0.1:26657/websocket
```

您可以通过调用 `subscribe` RPC 方法以及有效的查询，通过 Websocket 订阅上述任何事件。

```json
{
    "jsonrpc": "2.0",
    "method": "subscribe",
    "id": 0,
    "params": {
        "query": "tm.event='NewBlock'"
    }
}
```

查看 [API 文档](https://docs.tendermint.com/v0.34/rpc/) 以获取有关查询语法和其他选项的更多信息。

您还可以使用标签，前提是您已将其包含在 DeliverTx 响应中，以查询事务结果。有关详细信息，请参阅 [索引事务](./indexing-transactions.md)。

## ValidatorSetUpdates

当验证人集合发生更改时，将发布 ValidatorSetUpdates 事件。该事件携带一组公钥/权力对。该列表与 Tendermint 从 ABCI 应用程序接收的列表相同（请参阅 ABCI 规范中的 [EndBlock
部分](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/abci.md#endblock)）。

响应：

```json
{
    "jsonrpc": "2.0",
    "id": 0,
    "result": {
        "query": "tm.event='ValidatorSetUpdates'",
        "data": {
            "type": "tendermint/event/ValidatorSetUpdates",
            "value": {
              "validator_updates": [
                {
                  "address": "09EAD022FD25DE3A02E64B0FE9610B1417183EE4",
                  "pub_key": {
                    "type": "tendermint/PubKeyEd25519",
                    "value": "ww0z4WaZ0Xg+YI10w43wTWbBmM3dpVza4mmSQYsd0ck="
                  },
                  "voting_power": "10",
                  "proposer_priority": "0"
                }
              ]
            }
        }
    }
}
```


---
order: 7
---

# Subscribing to events via Websocket

Tendermint emits different events, which you can subscribe to via
[Websocket](https://en.wikipedia.org/wiki/WebSocket). This can be useful
for third-party applications (for analysis) or for inspecting state.

[List of events](https://godoc.org/github.com/tendermint/tendermint/types#pkg-constants)

To connect to a node via websocket from the CLI, you can use a tool such as
[wscat](https://github.com/websockets/wscat) and run:

```sh
wscat ws://127.0.0.1:26657/websocket
```

You can subscribe to any of the events above by calling the `subscribe` RPC
method via Websocket along with a valid query.

```json
{
    "jsonrpc": "2.0",
    "method": "subscribe",
    "id": 0,
    "params": {
        "query": "tm.event='NewBlock'"
    }
}
```

Check out [API docs](https://docs.tendermint.com/v0.34/rpc/) for
more information on query syntax and other options.

You can also use tags, given you had included them into DeliverTx
response, to query transaction results. See [Indexing
transactions](./indexing-transactions.md) for details.

## ValidatorSetUpdates

When validator set changes, ValidatorSetUpdates event is published. The
event carries a list of pubkey/power pairs. The list is the same
Tendermint receives from ABCI application (see [EndBlock
section](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/abci.md#endblock) in
the ABCI spec).

Response:

```json
{
    "jsonrpc": "2.0",
    "id": 0,
    "result": {
        "query": "tm.event='ValidatorSetUpdates'",
        "data": {
            "type": "tendermint/event/ValidatorSetUpdates",
            "value": {
              "validator_updates": [
                {
                  "address": "09EAD022FD25DE3A02E64B0FE9610B1417183EE4",
                  "pub_key": {
                    "type": "tendermint/PubKeyEd25519",
                    "value": "ww0z4WaZ0Xg+YI10w43wTWbBmM3dpVza4mmSQYsd0ck="
                  },
                  "voting_power": "10",
                  "proposer_priority": "0"
                }
              ]
            }
        }
    }
}
```
