---
order: 6
---

# 事务索引

Tendermint允许您对事务和区块进行索引，并在以后查询或订阅其结果。事务通过`TxResult.Events`进行索引，而区块通过`Response(Begin|End)Block.Events`进行索引。然而，事务还通过包含事务哈希的主键进行索引，并映射和存储相应的`TxResult`。区块通过包含区块高度的主键进行索引，并映射和存储区块高度，即区块本身不会被存储。

每个事件包含一个类型和一组属性，这些属性是键值对，表示方法执行过程中发生的事情。有关`Events`的更多详细信息，请参阅[ABCI](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/abci.md#events)文档。

一个`Event`与一个复合键相关联。一个`compositeKey`由其类型和键用点分隔构成。

例如：

```json
"jack": [
  "account.number": 100
]
```

将等于`jack.account.number`的复合键。

默认情况下，Tendermint将通过它们各自的哈希和高度索引所有事务，并通过它们的高度索引所有区块。

## 配置

操作员可以通过`[tx_index]`部分配置索引。`indexer`字段接受一系列支持的索引器。如果包含`null`，无论提供的其他值如何，索引都将被关闭。

```toml
[tx-index]

# The backend database to back the indexer.
# If indexer is "null", no indexer service will be used.
#
# The application will set which txs to index. In some cases a node operator will be able
# to decide which txs to index based on configuration set in the application.
#
# Options:
#   1) "null"
#   2) "kv" (default) - the simplest possible indexer, backed by key-value storage (defaults to levelDB; see DBBackend).
#     - When "kv" is chosen "tx.height" and "tx.hash" will always be indexed.
#   3) "psql" - the indexer services backed by PostgreSQL.
# indexer = "kv"
```

### 支持的索引器

#### KV

`kv`索引器类型是由主要的底层Tendermint数据库支持的嵌入式键值存储。使用`kv`索引器类型可以直接针对Tendermint的RPC查询区块和事务事件。然而，查询语法有限，因此这种索引器类型可能会在将来被弃用或删除。

#### PostgreSQL

`psql`索引器类型允许操作员通过将其代理到外部的PostgreSQL实例来启用区块和事务事件索引，从而将事件存储在关系模型中。由于事件存储在关系型数据库中，操作员可以利用SQL执行一系列丰富而复杂的查询，这是`kv`索引器类型不支持的。由于操作员可以直接利用SQL，因此通过Tendermint的RPC不支持`psql`索引器类型的搜索--任何此类查询都将失败。

注意，SQL模式存储在`state/indexer/sink/psql/schema.sql`中，操作者必须在启动Tendermint并启用`psql`索引器类型之前显式创建关系。

示例：

```shell
$ psql ... -f state/indexer/sink/psql/schema.sql
```

## 默认索引

Tendermint的交易和区块事件索引器默认索引了一些特定的保留事件。

### 交易

以下索引是默认索引：

- `tx.height`
- `tx.hash`

### 区块

以下索引是默认索引：

- `block.height`

## 添加事件

应用程序可以自由定义要索引的事件。Tendermint不提供定义要索引和要忽略的事件的功能。在应用程序的`DeliverTx`方法中，使用UTF-8编码的字符串对添加`Events`字段（例如："transfer.sender": "Bob"，"transfer.recipient": "Alice"，"transfer.balance": "100"）。

示例：

```go
func (app *KVStoreApplication) DeliverTx(req types.RequestDeliverTx) types.Result {
    //...
    events := []abci.Event{
        {
            Type: "transfer",
            Attributes: []abci.EventAttribute{
                {Key: []byte("sender"), Value: []byte("Bob"), Index: true},
                {Key: []byte("recipient"), Value: []byte("Alice"), Index: true},
                {Key: []byte("balance"), Value: []byte("100"), Index: true},
                {Key: []byte("note"), Value: []byte("nothing"), Index: true},
            },
        },
    }
    return types.ResponseDeliverTx{Code: code.CodeTypeOK, Events: events}
}
```

如果索引器不为`null`，则将索引该交易。每个事件都使用`{eventType}.{eventAttribute}={eventValue}`的复合键进行索引，例如`transfer.sender=bob`。

## 查询交易事件

您可以通过调用`/tx_search` RPC端点按事件查询分页的一组交易：

```bash
curl "localhost:26657/tx_search?query=\"message.sender='cosmos1...'\"&prove=true"
```

有关查询语法和其他选项的更多信息，请查看[API文档](https://docs.tendermint.com/v0.34/rpc/#/Info/tx_search)。

## 订阅交易

客户端可以通过向`/subscribe` RPC端点提供查询来通过WebSocket订阅具有给定标签的交易。

```json
{
  "jsonrpc": "2.0",
  "method": "subscribe",
  "id": "0",
  "params": {
    "query": "message.sender='cosmos1...'"
  }
}
```

有关查询语法和其他选项的更多信息，请查看[API文档](https://docs.tendermint.com/v0.34/rpc/#subscribe)。

## 查询区块事件

您可以通过调用`/block_search` RPC端点按事件查询分页的一组区块：

```bash
curl "localhost:26657/block_search?query=\"block.height > 10 AND val_set.num_changed > 0\""
```

请查看[API文档](https://docs.tendermint.com/v0.34/rpc/#/Info/block_search)以获取有关查询语法和其他选项的更多信息。


---
order: 6
---

# Indexing Transactions

Tendermint allows you to index transactions and blocks and later query or
subscribe to their results. Transactions are indexed by `TxResult.Events` and
blocks are indexed by `Response(Begin|End)Block.Events`. However, transactions
are also indexed by a primary key which includes the transaction hash and maps
to and stores the corresponding `TxResult`. Blocks are indexed by a primary key
which includes the block height and maps to and stores the block height, i.e.
the block itself is never stored.

Each event contains a type and a list of attributes, which are key-value pairs
denoting something about what happened during the method's execution. For more
details on `Events`, see the
[ABCI](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/abci.md#events)
documentation.

An `Event` has a composite key associated with it. A `compositeKey` is
constructed by its type and key separated by a dot.

For example:

```json
"jack": [
  "account.number": 100
]
```

would be equal to the composite key of `jack.account.number`.

By default, Tendermint will index all transactions by their respective hashes
and height and blocks by their height.

## Configuration

Operators can configure indexing via the `[tx_index]` section. The `indexer`
field takes a series of supported indexers. If `null` is included, indexing will
be turned off regardless of other values provided.

```toml
[tx-index]

# The backend database to back the indexer.
# If indexer is "null", no indexer service will be used.
#
# The application will set which txs to index. In some cases a node operator will be able
# to decide which txs to index based on configuration set in the application.
#
# Options:
#   1) "null"
#   2) "kv" (default) - the simplest possible indexer, backed by key-value storage (defaults to levelDB; see DBBackend).
#     - When "kv" is chosen "tx.height" and "tx.hash" will always be indexed.
#   3) "psql" - the indexer services backed by PostgreSQL.
# indexer = "kv"
```

### Supported Indexers

#### KV

The `kv` indexer type is an embedded key-value store supported by the main
underlying Tendermint database. Using the `kv` indexer type allows you to query
for block and transaction events directly against Tendermint's RPC. However, the
query syntax is limited and so this indexer type might be deprecated or removed
entirely in the future.

#### PostgreSQL

The `psql` indexer type allows an operator to enable block and transaction event
indexing by proxying it to an external PostgreSQL instance allowing for the events
to be stored in relational models. Since the events are stored in a RDBMS, operators
can leverage SQL to perform a series of rich and complex queries that are not
supported by the `kv` indexer type. Since operators can leverage SQL directly,
searching is not enabled for the `psql` indexer type via Tendermint's RPC -- any
such query will fail.

Note, the SQL schema is stored in `state/indexer/sink/psql/schema.sql` and operators
must explicitly create the relations prior to starting Tendermint and enabling
the `psql` indexer type.

Example:

```shell
$ psql ... -f state/indexer/sink/psql/schema.sql
```

## Default Indexes

The Tendermint tx and block event indexer indexes a few select reserved events
by default.

### Transactions

The following indexes are indexed by default:

- `tx.height`
- `tx.hash`

### Blocks

The following indexes are indexed by default:

- `block.height`

## Adding Events

Applications are free to define which events to index. Tendermint does not
expose functionality to define which events to index and which to ignore. In
your application's `DeliverTx` method, add the `Events` field with pairs of
UTF-8 encoded strings (e.g. "transfer.sender": "Bob", "transfer.recipient":
"Alice", "transfer.balance": "100").

Example:

```go
func (app *KVStoreApplication) DeliverTx(req types.RequestDeliverTx) types.Result {
    //...
    events := []abci.Event{
        {
            Type: "transfer",
            Attributes: []abci.EventAttribute{
                {Key: []byte("sender"), Value: []byte("Bob"), Index: true},
                {Key: []byte("recipient"), Value: []byte("Alice"), Index: true},
                {Key: []byte("balance"), Value: []byte("100"), Index: true},
                {Key: []byte("note"), Value: []byte("nothing"), Index: true},
            },
        },
    }
    return types.ResponseDeliverTx{Code: code.CodeTypeOK, Events: events}
}
```

If the indexer is not `null`, the transaction will be indexed. Each event is
indexed using a composite key in the form of `{eventType}.{eventAttribute}={eventValue}`,
e.g. `transfer.sender=bob`.

## Querying Transactions Events

You can query for a paginated set of transaction by their events by calling the
`/tx_search` RPC endpoint:

```bash
curl "localhost:26657/tx_search?query=\"message.sender='cosmos1...'\"&prove=true"
```

Check out [API docs](https://docs.tendermint.com/v0.34/rpc/#/Info/tx_search)
for more information on query syntax and other options.

## Subscribing to Transactions

Clients can subscribe to transactions with the given tags via WebSocket by providing
a query to `/subscribe` RPC endpoint.

```json
{
  "jsonrpc": "2.0",
  "method": "subscribe",
  "id": "0",
  "params": {
    "query": "message.sender='cosmos1...'"
  }
}
```

Check out [API docs](https://docs.tendermint.com/v0.34/rpc/#subscribe) for more information
on query syntax and other options.

## Querying Blocks Events

You can query for a paginated set of blocks by their events by calling the
`/block_search` RPC endpoint:

```bash
curl "localhost:26657/block_search?query=\"block.height > 10 AND val_set.num_changed > 0\""
```

Check out [API docs](https://docs.tendermint.com/v0.34/rpc/#/Info/block_search)
for more information on query syntax and other options.
