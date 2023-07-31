---
order: 5
---

# 指标

Tendermint可以报告和提供Prometheus指标，这些指标可以被Prometheus收集器消费。

此功能默认情况下是禁用的。

要启用Prometheus指标，在配置文件中设置`instrumentation.prometheus=true`。指标将默认在26660端口的`/metrics`下提供。监听地址可以在配置文件中更改（参见`instrumentation.prometheus\_listen\_addr`）。

## 可用指标列表

以下是可用的指标：

| **名称**                                 | **类型**  | **标签**          | **描述**                                                        |
|------------------------------------------|-----------|-------------------|------------------------------------------------------------------------|
| `consensus_height`                       | Gauge     |                   | 链的高度                                                    |
| `consensus_validators`                   | Gauge     |                   | 验证者的数量                                                   |
| `consensus_validators_power`             | Gauge     |                   | 所有验证者的总投票权力                                   |
| `consensus_validator_power`              | Gauge     |                   | 如果节点在验证者集中，则为节点的投票权力                       |
| `consensus_validator_last_signed_height` | Gauge     |                   | 如果节点是验证者，则为节点上次签名的块高度        |
| `consensus_validator_missed_blocks`      | Gauge     |                   | 如果节点是验证者，则为节点错过的块总数 |
| `consensus_missing_validators`           | Gauge     |                   | 未签名的验证者数量                                  |
| `consensus_missing_validators_power`     | Gauge     |                   | 未签名的验证者的总投票权力                           |
| `consensus_byzantine_validators`         | Gauge     |                   | 试图双重签名的验证者数量                          |
| `consensus_byzantine_validators_power`   | Gauge     |                   | 双重签名的验证者的总投票权力                         |
| `consensus_block_interval_seconds`       | Histogram |                   | 本块和上一块之间的时间（Block.Header.Time）（以秒为单位）        |
| `consensus_rounds`                       | Gauge     |                   | 轮数                                                       |
| `consensus_num_txs`                      | Gauge     |                   | 交易数量                                                 |
| `consensus_total_txs`                    | Gauge     |                   | 提交的交易总数                                 |
| `consensus_block_parts`                  | Counter   | `peer_id`         | 每个对等方传输的块部分数量                               |
| `consensus_latest_block_height`          | Gauge     |                   | /status sync\_info 数量                                              |
| `consensus_fast_syncing`                 | Gauge     |                   | 0（不是快速同步）或1（同步中）                             |
| `consensus_state_syncing`                | Gauge     |                   | 0（不是状态同步）或1（同步中）                            |
| `consensus_block_size_bytes`             | Gauge     |                   | 块大小（以字节为单位）                                                    |
| `p2p_message_send_bytes_total`           | Counter   | `message_type`    | 每个消息类型发送给所有对等方的字节数                     |
| `p2p_message_receive_bytes_total`        | Counter   | `message_type`    | 每个消息类型从所有对等方接收的字节数               |
| `p2p_peers`                              | Gauge     |                   | 节点连接的对等方数量                                    |
| `p2p_peer_receive_bytes_total`           | Counter   | `peer_id`, `chID` | 每个通道从给定对等方接收的字节数                 |
| `p2p_peer_send_bytes_total`              | Counter   | `peer_id`, `chID` | 每个通道发送给给定对等方的字节数                       |
| `p2p_peer_pending_send_bytes`            | Gauge     | `peer_id`         | 发送给给定对等方的待发送字节数                     |
| `p2p_num_txs`                            | Gauge     | `peer_id`         | 每个`peer_id`提交的交易数量                      |
| `p2p_pending_send_bytes`                 | Gauge     | `peer_id`         | 待发送给对等方的数据量                              |
| `mempool_size`                           | Gauge     |                   | 未提交的交易数量                                     |
| `mempool_tx_size_bytes`                  | Histogram |                   | 交易大小（以字节为单位）                                             |
| `mempool_failed_txs`                     | Counter   |                   | 失败的交易数量                                          |
| `mempool_recheck_times`                  | Counter   |                   | 在内存池中重新检查的交易数量                        |
| `state_block_processing_time`            | Histogram |                   | BeginBlock和EndBlock之间的时间（以毫秒为单位）                             |

## 有用的查询

缺失 + 拜占庭验证者的百分比：

```md
((consensus\_byzantine\_validators\_power + consensus\_missing\_validators\_power) / consensus\_validators\_power) * 100
```


---
order: 5
---

# Metrics

Tendermint can report and serve the Prometheus metrics, which in their turn can
be consumed by Prometheus collector(s).

This functionality is disabled by default.

To enable the Prometheus metrics, set `instrumentation.prometheus=true` in your
config file. Metrics will be served under `/metrics` on 26660 port by default.
Listen address can be changed in the config file (see
`instrumentation.prometheus\_listen\_addr`).

## List of available metrics

The following metrics are available:

| **Name**                                 | **Type**  | **Tags**          | **Description**                                                        |
|------------------------------------------|-----------|-------------------|------------------------------------------------------------------------|
| `consensus_height`                       | Gauge     |                   | Height of the chain                                                    |
| `consensus_validators`                   | Gauge     |                   | Number of validators                                                   |
| `consensus_validators_power`             | Gauge     |                   | Total voting power of all validators                                   |
| `consensus_validator_power`              | Gauge     |                   | Voting power of the node if in the validator set                       |
| `consensus_validator_last_signed_height` | Gauge     |                   | Last height the node signed a block, if the node is a validator        |
| `consensus_validator_missed_blocks`      | Gauge     |                   | Total amount of blocks missed for the node, if the node is a validator |
| `consensus_missing_validators`           | Gauge     |                   | Number of validators who did not sign                                  |
| `consensus_missing_validators_power`     | Gauge     |                   | Total voting power of the missing validators                           |
| `consensus_byzantine_validators`         | Gauge     |                   | Number of validators who tried to double sign                          |
| `consensus_byzantine_validators_power`   | Gauge     |                   | Total voting power of the byzantine validators                         |
| `consensus_block_interval_seconds`       | Histogram |                   | Time between this and last block (Block.Header.Time) in seconds        |
| `consensus_rounds`                       | Gauge     |                   | Number of rounds                                                       |
| `consensus_num_txs`                      | Gauge     |                   | Number of transactions                                                 |
| `consensus_total_txs`                    | Gauge     |                   | Total number of transactions committed                                 |
| `consensus_block_parts`                  | Counter   | `peer_id`         | Number of blockparts transmitted by peer                               |
| `consensus_latest_block_height`          | Gauge     |                   | /status sync\_info number                                              |
| `consensus_fast_syncing`                 | Gauge     |                   | Either 0 (not fast syncing) or 1 (syncing)                             |
| `consensus_state_syncing`                | Gauge     |                   | Either 0 (not state syncing) or 1 (syncing)                            |
| `consensus_block_size_bytes`             | Gauge     |                   | Block size in bytes                                                    |
| `p2p_message_send_bytes_total`           | Counter   | `message_type`    | Number of bytes sent to all peers per message type                     |
| `p2p_message_receive_bytes_total`        | Counter   | `message_type`    | Number of bytes received from all peers per message type               |
| `p2p_peers`                              | Gauge     |                   | Number of peers node's connected to                                    |
| `p2p_peer_receive_bytes_total`           | Counter   | `peer_id`, `chID` | Number of bytes per channel received from a given peer                 |
| `p2p_peer_send_bytes_total`              | Counter   | `peer_id`, `chID` | Number of bytes per channel sent to a given peer                       |
| `p2p_peer_pending_send_bytes`            | Gauge     | `peer_id`         | Number of pending bytes to be sent to a given peer                     |
| `p2p_num_txs`                            | Gauge     | `peer_id`         | Number of transactions submitted by each peer\_id                      |
| `p2p_pending_send_bytes`                 | Gauge     | `peer_id`         | Amount of data pending to be sent to peer                              |
| `mempool_size`                           | Gauge     |                   | Number of uncommitted transactions                                     |
| `mempool_tx_size_bytes`                  | Histogram |                   | Transaction sizes in bytes                                             |
| `mempool_failed_txs`                     | Counter   |                   | Number of failed transactions                                          |
| `mempool_recheck_times`                  | Counter   |                   | Number of transactions rechecked in the mempool                        |
| `state_block_processing_time`            | Histogram |                   | Time between BeginBlock and EndBlock in ms                             |

## Useful queries

Percentage of missing + byzantine validators:

```md
((consensus\_byzantine\_validators\_power + consensus\_missing\_validators\_power) / consensus\_validators\_power) * 100
```
