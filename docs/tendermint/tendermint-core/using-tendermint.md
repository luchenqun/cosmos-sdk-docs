# 使用 Tendermint

这是一个使用命令行中的 `tendermint` 程序的指南。
它假设您已经安装了 `tendermint` 二进制文件，并对 Tendermint 和 ABCI 有一些基本的了解。

您可以使用 `tendermint --help` 命令查看帮助菜单，并使用 `tendermint version` 命令查看版本号。

## 目录根

区块链数据的默认目录是 `~/.tendermint`。通过设置 `TMHOME` 环境变量可以覆盖此设置。

## 初始化

通过运行以下命令来初始化根目录：

```sh
tendermint init
```

这将在 `$TMHOME/config` 目录下创建一个新的私钥文件 (`priv_validator_key.json`) 和一个创世文件 (`genesis.json`)，其中包含相关的公钥。这是运行本地测试网络的必要步骤，只需要一个验证者。

要进行更复杂的初始化，请参阅测试网络命令：

```sh
tendermint testnet --help
```

### 创世文件

`$TMHOME/config/` 目录中的 `genesis.json` 文件定义了区块链创世时的初始 TendermintCore 状态（[参见定义](https://github.com/tendermint/tendermint/blob/v0.34.x/types/genesis.go)）。

#### 字段

- `genesis_time`：区块链开始的官方时间。
- `chain_id`：区块链的 ID。**每个区块链的 ID 必须是唯一的。** 如果您的测试网络区块链没有唯一的链 ID，您将会遇到问题。ChainID 必须少于 50 个字符。
- `initial_height`：Tendermint 应该开始的高度。如果区块链正在进行网络升级，从停止的高度开始可以为以前的高度带来独特性。
- `consensus_params` [spec](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/core/data_structures.md#consensusparams)
    - `block`
        - `max_bytes`：区块的最大大小（以字节为单位）。
        - `max_gas`：每个区块的最大 gas。
        - `time_iota_ms`：连续区块之间的最小时间增量（以毫秒为单位）。如果区块头的时间戳超前于系统时钟，请减小此值。
    - `evidence`
        - `max_age_num_blocks`：证据的最大年龄（以区块为单位）。计算此值的基本公式为：MaxAgeDuration / {平均区块时间}。
        - `max_age_duration`：证据的最大年龄（以时间为单位）。它应该与应用程序的 "解绑期" 或其他类似机制相对应，用于处理[无利益攻击](https://github.com/ethereum/wiki/wiki/Proof-of-Stake-FAQ#what-is-the-nothing-at-stake-problem-and-how-can-it-be-fixed)。
        - `max_num`：这设置了可以在单个区块中提交的最大证据数量，并且在考虑每个证据的大小时应该明显低于最大区块字节数。
    - `validator`
        - `pub_key_types`：验证者可以使用的公钥类型。
    - `version`
        - `app_version`：ABCI 应用程序版本。
- `validators`：初始验证者列表。请注意，应用程序可以完全覆盖此列表，并且可以将其留空以明确表示应用程序将使用 ResponseInitChain 初始化验证者集合。
    - `pub_key`：第一个元素指定 `pub_key` 类型。1 == Ed25519。第二个元素是公钥字节。
    - `power`：验证者的投票权重。
    - `name`：验证者的名称（可选）。
- `app_hash`：创世时的预期应用程序哈希（由 `ResponseInfo` ABCI 消息返回）。如果应用程序的哈希不匹配，Tendermint 将会出现错误。
- `app_state`：应用程序状态（例如，代币的初始分配）。

> :warning: **ChainID必须对每个区块链都是唯一的。重用旧的ChainID可能会导致问题**

#### 示例genesis.json

```json
{
  "genesis_time": "2020-04-21T11:17:42.341227868Z",
  "chain_id": "test-chain-ROp9KF",
  "initial_height": "0",
  "consensus_params": {
    "block": {
      "max_bytes": "22020096",
      "max_gas": "-1",
      "time_iota_ms": "1000"
    },
    "evidence": {
      "max_age_num_blocks": "100000",
      "max_age_duration": "172800000000000",
      "max_num": 50,
    },
    "validator": {
      "pub_key_types": [
        "ed25519"
      ]
    }
  },
  "validators": [
    {
      "address": "B547AB87E79F75A4A3198C57A8C2FDAF8628CB47",
      "pub_key": {
        "type": "tendermint/PubKeyEd25519",
        "value": "P/V6GHuZrb8rs/k1oBorxc6vyXMlnzhJmv7LmjELDys="
      },
      "power": "10",
      "name": ""
    }
  ],
  "app_hash": ""
}
```

## 运行

要运行Tendermint节点，请使用以下命令：

```bash
tendermint node
```

默认情况下，Tendermint将尝试连接到`127.0.0.1:26658`上的ABCI应用程序。如果您已安装`kvstore` ABCI应用程序，请在另一个窗口中运行它。如果没有，请停止Tendermint并运行`kvstore`应用程序的内部版本：

```bash
tendermint node --proxy_app=kvstore
```

几秒钟后，您应该会看到区块开始流入。请注意，即使没有交易，区块也会定期产生。请参阅下面的“无空块”以修改此设置。

Tendermint支持`counter`、`kvstore`和`noop`应用程序的内部版本，这些应用程序作为`abci-cli`的示例提供。如果您的应用程序是用Go编写的，那么将其与Tendermint一起编译为内部版本非常容易。如果您的应用程序不是用Go编写的，请在另一个进程中运行它，并使用`--proxy_app`标志指定它正在侦听的套接字的地址，例如：

```bash
tendermint node --proxy_app=/var/run/abci.sock
```

您可以通过运行`tendermint node --help`来了解支持的标志。

## 交易

要发送交易，请使用`curl`向Tendermint RPC服务器发出请求，例如：

```sh
curl http://localhost:26657/broadcast_tx_commit?tx=\"abcd\"
```

我们可以在`/status`端点处查看链的状态：

```sh
curl http://localhost:26657/status | json_pp
```

特别是查看`latest_app_hash`：

```sh
curl http://localhost:26657/status | json_pp | grep latest_app_hash
```

在浏览器中访问`http://localhost:26657`以查看其他端点的列表。有些不需要参数（如`/status`），而其他一些则指定参数名称并使用`_`作为占位符。

> 提示：在此处查找RPC文档[here](https://docs.tendermint.com/v0.34/rpc/)

### 格式化

在发送/格式化交易时，应考虑以下细微差别：

使用`GET`：

要发送UTF8字符串字节数组，请引用tx参数的值：

```sh
curl 'http://localhost:26657/broadcast_tx_commit?tx="hello"'
```

这将发送一个5字节的交易："h e l l o" \[68 65 6c 6c 6f\]。

请注意，URL必须用单引号括起来，否则bash会忽略双引号。为了避免使用单引号，需要转义双引号：

```sh
curl http://localhost:26657/broadcast_tx_commit?tx=\"hello\"
```

使用特殊字符：

```sh
curl 'http://localhost:26657/broadcast_tx_commit?tx="€5"'
```

这将发送一个4字节的交易："€5" (UTF8) \[e2 82 ac 35\]。

要以原始十六进制发送，省略引号，并在十六进制字符串前加上`0x`前缀：

```sh
curl http://localhost:26657/broadcast_tx_commit?tx=0x01020304
```

这将发送一个4字节的交易：\[01 02 03 04\]。

使用`POST`（使用`json`），原始十六进制必须进行`base64`编码：

```sh
curl --data-binary '{"jsonrpc":"2.0","id":"anything","method":"broadcast_tx_commit","params": {"tx": "AQIDBA=="}}' -H 'content-type:text/plain;' http://localhost:26657
```

这将发送相同的4字节交易：\[01 02 03 04\]。

请注意，原始十六进制不能在`POST`交易中使用。

## 重置

> :warning: **不安全** 仅在开发环境中进行此操作，并且仅在您可以承受丢失所有区块链数据的情况下进行！

要重置区块链，请停止节点并运行以下命令：

```sh
tendermint unsafe_reset_all
```

此命令将删除数据目录并重置私有验证器和地址簿文件。

## 配置

Tendermint使用`config.toml`进行配置。有关详细信息，请参阅[配置规范](./configuration.md)。

值得注意的选项包括应用程序的套接字地址（`proxy_app`），Tendermint对等节点的监听地址（`p2p.laddr`）以及RPC服务器的监听地址（`rpc.laddr`）。

配置文件中的某些字段可以使用标志进行覆盖。

## 无空块

虽然`tendermint`的默认行为仍然是每秒创建一个块，但可以禁用空块或设置块创建间隔。在前一种情况下，只有在有新的交易或AppHash更改时才会创建块。

配置Tendermint以避免生成空块，除非存在交易或应用哈希发生变化，请使用以下附加标志运行Tendermint：

```sh
tendermint node --consensus.create_empty_blocks=false
```

或通过`config.toml`文件设置配置：

```toml
[consensus]
create_empty_blocks = false
```

请记住：因为默认情况下是_创建空块_，要避免空块，需要将配置选项设置为`false`。

块间隔设置允许在创建每个新的空块之间设置延迟（以`time.Duration`格式[ParseDuration](https://golang.org/pkg/time/#ParseDuration)）。可以使用以下附加标志进行设置：

```sh
--consensus.create_empty_blocks_interval="5s"
```

或通过`config.toml`文件设置配置：

```toml
[consensus]
create_empty_blocks_interval = "5s"
```

使用此设置，如果没有生成块，每5秒将生成一个空块，而不管`create_empty_blocks`的值如何。

## 广播 API

之前，我们使用`broadcast_tx_commit`端点发送交易。当将交易发送到Tendermint节点时，它将通过`CheckTx`针对应用程序运行。如果通过了`CheckTx`，它将被包含在内存池中，广播给其他节点，并最终包含在一个块中。

由于处理交易有多个阶段，我们提供了多个端点来广播交易：

```md
/broadcast_tx_async
/broadcast_tx_sync
/broadcast_tx_commit
```

这些对应于无处理、通过内存池处理和通过块处理。也就是说，`broadcast_tx_async`将立即返回，而不等待交易是否有效，而`broadcast_tx_sync`将返回通过`CheckTx`运行交易的结果。使用`broadcast_tx_commit`将等待交易在块中提交，或者直到达到某个超时时间，但如果交易未通过`CheckTx`，它将立即返回。`broadcast_tx_commit`的返回值包括两个字段，`check_tx`和`deliver_tx`，涉及运行交易通过这些ABCI消息的结果。

使用`broadcast_tx_commit`的好处是请求在事务提交后返回（即包含在一个区块中），但这可能需要大约一秒的时间。如果需要快速结果，请使用`broadcast_tx_sync`，但是事务直到稍后才会被提交，并且在那时其对状态的影响可能会发生变化。

请注意，内存池不提供强有力的保证 - 仅仅因为一个事务通过了CheckTx（即被接受到内存池中），并不意味着它将被提交，因为在节点得到提议之前，拥有该事务的节点可能会崩溃。有关更多信息，请参阅[mempool写前日志](../tendermint-core/running-in-production.md#mempool-wal)

## Tendermint网络

当运行`tendermint init`时，会在`~/.tendermint/config`目录下创建`genesis.json`和`priv_validator_key.json`文件。`genesis.json`的内容可能如下所示：

```json
{
  "validators" : [
    {
      "pub_key" : {
        "value" : "h3hk+QE8c6QLTySp8TcfzclJw/BG79ziGB/pIA+DfPE=",
        "type" : "tendermint/PubKeyEd25519"
      },
      "power" : 10,
      "name" : ""
    }
  ],
  "app_hash" : "",
  "chain_id" : "test-chain-rDlYSN",
  "genesis_time" : "0001-01-01T00:00:00Z"
}
```

而`priv_validator_key.json`的内容如下：

```json
{
  "last_step" : 0,
  "last_round" : "0",
  "address" : "B788DEDE4F50AD8BC9462DE76741CCAFF87D51E2",
  "pub_key" : {
    "value" : "h3hk+QE8c6QLTySp8TcfzclJw/BG79ziGB/pIA+DfPE=",
    "type" : "tendermint/PubKeyEd25519"
  },
  "last_height" : "0",
  "priv_key" : {
    "value" : "JPivl82x+LfVkp8i3ztoTjY6c6GJ4pBxQexErOCyhwqHeGT5ATxzpAtPJKnxNx/NyUnD8Ebv3OIYH+kgD4N88Q==",
    "type" : "tendermint/PrivKeyEd25519"
  }
}
```

`priv_validator_key.json`实际上包含了一个私钥，因此必须绝对保密；目前我们使用明文进行工作。请注意`last_`字段，它们用于防止我们签署冲突的消息。

还要注意，在`priv_validator_key.json`中的`pub_key`（公钥）也存在于`genesis.json`中。

genesis文件包含了可以参与共识的公钥列表及其相应的投票权重。超过2/3的投票权重必须是活跃的（即相应的私钥必须生成签名），才能使共识取得进展。在我们的情况下，genesis文件包含了我们的`priv_validator_key.json`的公钥，因此使用默认根目录启动的Tendermint节点将能够取得进展。投票权重使用int64类型，但必须是正数，因此范围是：0到9223372036854775807。由于当前提议者选择算法的工作方式，我们不建议投票权重超过10^12（即1万亿）。

如果我们想要向网络中添加更多节点，我们有两个选择：我们可以添加一个新的验证节点，该节点也将通过提议区块和对其进行投票来参与共识，或者我们可以添加一个新的非验证节点，该节点不会直接参与，但会验证并跟上共识协议的进展。

### 节点

#### 种子节点

种子节点是一个节点，它会传递其他节点的地址。这些节点会不断地在网络中搜索更多的节点。种子节点传递的地址会保存在本地地址簿中。一旦地址保存在地址簿中，你将直接连接到这些地址。基本上，种子节点的工作就是传递每个人的地址。在收到足够的地址后，你将不再连接到种子节点，所以通常只在第一次启动时需要它们。种子节点在发送一些地址后会立即与你断开连接。

#### 持久节点

持久节点是你希望始终保持连接的节点。如果你断开连接，你将尝试直接重新连接到它们，而不是使用地址簿中的其他地址。在重新启动时，无论地址簿的大小如何，你都将始终尝试连接到这些节点。

所有节点默认会传递它们所知道的其他节点。这被称为节点交换协议（PeX）。通过PeX，节点将会传递已知节点的信息并形成一个网络，将节点地址存储在地址簿中。因此，如果你有一个活跃的持久节点，你就不需要使用种子节点。

#### 连接到节点

要在启动时连接到节点，请在`$TMHOME/config/config.toml`文件或命令行中指定它们。使用`seeds`来指定种子节点，使用`persistent_peers`来指定你的节点将与之保持持久连接的节点。

例如，

```sh
tendermint node --p2p.seeds "f9baeaa15fedf5e1ef7448dd60f46c01f1a9e9c4@1.2.3.4:26656,0491d373a8e0fcf1023aaf18c51d6a1d0d4f31bd@5.6.7.8:26656"
```

或者，你可以使用RPC的`/dial_seeds`端点来指定运行中的节点连接到的种子节点：

```sh
curl 'localhost:26657/dial_seeds?seeds=\["f9baeaa15fedf5e1ef7448dd60f46c01f1a9e9c4@1.2.3.4:26656","0491d373a8e0fcf1023aaf18c51d6a1d0d4f31bd@5.6.7.8:26656"\]'
```

注意，启用PeX后，你在第一次启动后应该不再需要种子节点。

如果你希望Tendermint连接到特定的一组地址并与每个地址保持持久连接，你可以使用`--p2p.persistent_peers`标志或在`config.toml`文件中的相应设置，或使用`/dial_peers` RPC端点来实现，而无需停止Tendermint核心实例。

```sh
tendermint node --p2p.persistent_peers "429fcf25974313b95673f58d77eacdd434402665@10.11.12.13:26656,96663a3dd0d7b9d17d4c8211b191af259621c693@10.11.12.14:26656"

curl 'localhost:26657/dial_peers?persistent=true&peers=\["429fcf25974313b95673f58d77eacdd434402665@10.11.12.13:26656","96663a3dd0d7b9d17d4c8211b191af259621c693@10.11.12.14:26656"\]'
```

### 添加非验证节点

添加非验证节点很简单。只需将原始的 `genesis.json` 复制到新机器的 `~/.tendermint/config` 目录下，并启动节点，根据需要指定种子节点或持久节点。如果没有指定种子节点或持久节点，该节点将不会生成任何区块，因为它不是验证节点，并且它也不会接收到任何区块，因为它没有与其他节点连接。

### 添加验证节点

添加新的验证节点最简单的方法是在启动网络之前在 `genesis.json` 中进行添加。例如，我们可以创建一个新的 `priv_validator_key.json`，并将其 `pub_key` 复制到上述的 genesis 文件中。

我们可以使用以下命令生成新的 `priv_validator_key.json`：

```sh
tendermint gen_validator
```

现在我们可以更新我们的 genesis 文件。例如，如果新的 `priv_validator_key.json` 如下所示：

```json
{
  "address" : "5AF49D2A2D4F5AD4C7C8C4CC2FB020131E9C4902",
  "pub_key" : {
    "value" : "l9X9+fjkeBzDfPGbUM7AMIRE6uJN78zN5+lk5OYotek=",
    "type" : "tendermint/PubKeyEd25519"
  },
  "priv_key" : {
    "value" : "EDJY9W6zlAw+su6ITgTKg2nTZcHAH1NMTW5iwlgmNDuX1f35+OR4HMN88ZtQzsAwhETq4k3vzM3n6WTk5ii16Q==",
    "type" : "tendermint/PrivKeyEd25519"
  },
  "last_step" : 0,
  "last_round" : "0",
  "last_height" : "0"
}
```

那么新的 `genesis.json` 将是：

```json
{
  "validators" : [
    {
      "pub_key" : {
        "value" : "h3hk+QE8c6QLTySp8TcfzclJw/BG79ziGB/pIA+DfPE=",
        "type" : "tendermint/PubKeyEd25519"
      },
      "power" : 10,
      "name" : ""
    },
    {
      "pub_key" : {
        "value" : "l9X9+fjkeBzDfPGbUM7AMIRE6uJN78zN5+lk5OYotek=",
        "type" : "tendermint/PubKeyEd25519"
      },
      "power" : 10,
      "name" : ""
    }
  ],
  "app_hash" : "",
  "chain_id" : "test-chain-rDlYSN",
  "genesis_time" : "0001-01-01T00:00:00Z"
}
```

更新 `~/.tendermint/config` 目录下的 `genesis.json`。将 genesis 文件和新的 `priv_validator_key.json` 复制到新机器的 `~/.tendermint/config` 目录下。

现在在两台机器上运行 `tendermint node` 命令，并使用 `--p2p.persistent_peers` 或 `/dial_peers` 来使它们进行对等连接。它们应该开始生成区块，并且只有在两台机器都在线时才会继续生成区块。

要创建一个可以容忍一个验证节点故障的 Tendermint 网络，您至少需要四个验证节点（例如，2/3）。

在运行中的网络中更新验证节点是支持的，但必须由应用程序开发人员显式编程。有关更多详细信息，请参阅[应用程序开发人员指南](../app-dev/app-development.md)。

### 本地网络

要在本地运行网络，例如在单台机器上，您必须更改 `config.toml` 中的 `_laddr` 字段（或使用标志）以避免各个套接字的监听地址冲突。此外，您还必须在 `config.toml` 中设置 `addr_book_strict=false`，否则 Tendermint 的 p2p 库将拒绝与具有相同 IP 地址的节点建立连接。

### 升级

请参阅[UPGRADING.md](https://github.com/tendermint/tendermint/blob/v0.34.x/UPGRADING.md)指南。在主要的重大版本发布之间，您可能需要重置您的链。尽管如此，我们预计在未来Tendermint将有更少的重大版本发布（特别是在1.0版本发布之后）。


---
order: 2
---

# Using Tendermint

This is a guide to using the `tendermint` program from the command line.
It assumes only that you have the `tendermint` binary installed and have
some rudimentary idea of what Tendermint and ABCI are.

You can see the help menu with `tendermint --help`, and the version
number with `tendermint version`.

## Directory Root

The default directory for blockchain data is `~/.tendermint`. Override
this by setting the `TMHOME` environment variable.

## Initialize

Initialize the root directory by running:

```sh
tendermint init
```

This will create a new private key (`priv_validator_key.json`), and a
genesis file (`genesis.json`) containing the associated public key, in
`$TMHOME/config`. This is all that's necessary to run a local testnet
with one validator.

For more elaborate initialization, see the testnet command:

```sh
tendermint testnet --help
```

### Genesis

The `genesis.json` file in `$TMHOME/config/` defines the initial
TendermintCore state upon genesis of the blockchain ([see
definition](https://github.com/tendermint/tendermint/blob/v0.34.x/types/genesis.go)).

#### Fields

- `genesis_time`: Official time of blockchain start.
- `chain_id`: ID of the blockchain. **This must be unique for
  every blockchain.** If your testnet blockchains do not have unique
  chain IDs, you will have a bad time. The ChainID must be less than 50 symbols.
- `initial_height`: Height at which Tendermint should begin at. If a blockchain is conducting a network upgrade, 
    starting from the stopped height brings uniqueness to previous heights. 
- `consensus_params` [spec](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/core/data_structures.md#consensusparams)
    - `block`
        - `max_bytes`: Max block size, in bytes.
        - `max_gas`: Max gas per block.
        - `time_iota_ms`: Minimum time increment between consecutive blocks (in
      milliseconds). If the block header timestamp is ahead of the system clock,
      decrease this value.
    - `evidence`
        - `max_age_num_blocks`: Max age of evidence, in blocks. The basic formula
      for calculating this is: MaxAgeDuration / {average block time}.
        - `max_age_duration`: Max age of evidence, in time. It should correspond
      with an app's "unbonding period" or other similar mechanism for handling
      [Nothing-At-Stake
      attacks](https://github.com/ethereum/wiki/wiki/Proof-of-Stake-FAQ#what-is-the-nothing-at-stake-problem-and-how-can-it-be-fixed).
        - `max_num`: This sets the maximum number of evidence that can be committed
      in a single block. and should fall comfortably under the max block
      bytes when we consider the size of each evidence.
    - `validator`
        - `pub_key_types`: Public key types validators can use.
    - `version`
        - `app_version`: ABCI application version.
- `validators`: List of initial validators. Note this may be overridden entirely by the
  application, and may be left empty to make explicit that the
  application will initialize the validator set with ResponseInitChain.
    - `pub_key`: The first element specifies the `pub_key` type. 1
    == Ed25519. The second element are the pubkey bytes.
    - `power`: The validator's voting power.
    - `name`: Name of the validator (optional).
- `app_hash`: The expected application hash (as returned by the
  `ResponseInfo` ABCI message) upon genesis. If the app's hash does
  not match, Tendermint will panic.
- `app_state`: The application state (e.g. initial distribution
  of tokens).

> :warning: **ChainID must be unique to every blockchain. Reusing old chainID can cause issues**

#### Sample genesis.json

```json
{
  "genesis_time": "2020-04-21T11:17:42.341227868Z",
  "chain_id": "test-chain-ROp9KF",
  "initial_height": "0",
  "consensus_params": {
    "block": {
      "max_bytes": "22020096",
      "max_gas": "-1",
      "time_iota_ms": "1000"
    },
    "evidence": {
      "max_age_num_blocks": "100000",
      "max_age_duration": "172800000000000",
      "max_num": 50,
    },
    "validator": {
      "pub_key_types": [
        "ed25519"
      ]
    }
  },
  "validators": [
    {
      "address": "B547AB87E79F75A4A3198C57A8C2FDAF8628CB47",
      "pub_key": {
        "type": "tendermint/PubKeyEd25519",
        "value": "P/V6GHuZrb8rs/k1oBorxc6vyXMlnzhJmv7LmjELDys="
      },
      "power": "10",
      "name": ""
    }
  ],
  "app_hash": ""
}
```

## Run

To run a Tendermint node, use:

```bash
tendermint node
```

By default, Tendermint will try to connect to an ABCI application on
`127.0.0.1:26658`. If you have the `kvstore` ABCI app installed, run it in
another window. If you don't, kill Tendermint and run an in-process version of
the `kvstore` app:

```bash
tendermint node --proxy_app=kvstore
```

After a few seconds, you should see blocks start streaming in. Note that blocks
are produced regularly, even if there are no transactions. See _No Empty
Blocks_, below, to modify this setting.

Tendermint supports in-process versions of the `counter`, `kvstore`, and `noop`
apps that ship as examples with `abci-cli`. It's easy to compile your app
in-process with Tendermint if it's written in Go. If your app is not written in
Go, run it in another process, and use the `--proxy_app` flag to specify the
address of the socket it is listening on, for instance:

```bash
tendermint node --proxy_app=/var/run/abci.sock
```

You can find out what flags are supported by running `tendermint node --help`.

## Transactions

To send a transaction, use `curl` to make requests to the Tendermint RPC
server, for example:

```sh
curl http://localhost:26657/broadcast_tx_commit?tx=\"abcd\"
```

We can see the chain's status at the `/status` end-point:

```sh
curl http://localhost:26657/status | json_pp
```

and the `latest_app_hash` in particular:

```sh
curl http://localhost:26657/status | json_pp | grep latest_app_hash
```

Visit `http://localhost:26657` in your browser to see the list of other
endpoints. Some take no arguments (like `/status`), while others specify
the argument name and use `_` as a placeholder.


> TIP: Find the RPC Documentation [here](https://docs.tendermint.com/v0.34/rpc/)

### Formatting

The following nuances when sending/formatting transactions should be
taken into account:

With `GET`:

To send a UTF8 string byte array, quote the value of the tx parameter:

```sh
curl 'http://localhost:26657/broadcast_tx_commit?tx="hello"'
```

which sends a 5 byte transaction: "h e l l o" \[68 65 6c 6c 6f\].

Note the URL must be wrapped with single quotes, else bash will ignore
the double quotes. To avoid the single quotes, escape the double quotes:

```sh
curl http://localhost:26657/broadcast_tx_commit?tx=\"hello\"
```

Using a special character:

```sh
curl 'http://localhost:26657/broadcast_tx_commit?tx="€5"'
```

sends a 4 byte transaction: "€5" (UTF8) \[e2 82 ac 35\].

To send as raw hex, omit quotes AND prefix the hex string with `0x`:

```sh
curl http://localhost:26657/broadcast_tx_commit?tx=0x01020304
```

which sends a 4 byte transaction: \[01 02 03 04\].

With `POST` (using `json`), the raw hex must be `base64` encoded:

```sh
curl --data-binary '{"jsonrpc":"2.0","id":"anything","method":"broadcast_tx_commit","params": {"tx": "AQIDBA=="}}' -H 'content-type:text/plain;' http://localhost:26657
```

which sends the same 4 byte transaction: \[01 02 03 04\].

Note that raw hex cannot be used in `POST` transactions.

## Reset

> :warning: **UNSAFE** Only do this in development and only if you can
afford to lose all blockchain data!


To reset a blockchain, stop the node and run:

```sh
tendermint unsafe_reset_all
```

This command will remove the data directory and reset private validator and
address book files.

## Configuration

Tendermint uses a `config.toml` for configuration. For details, see [the
config specification](./configuration.md).

Notable options include the socket address of the application
(`proxy_app`), the listening address of the Tendermint peer
(`p2p.laddr`), and the listening address of the RPC server
(`rpc.laddr`).

Some fields from the config file can be overwritten with flags.

## No Empty Blocks

While the default behavior of `tendermint` is still to create blocks
approximately once per second, it is possible to disable empty blocks or
set a block creation interval. In the former case, blocks will be
created when there are new transactions or when the AppHash changes.

To configure Tendermint to not produce empty blocks unless there are
transactions or the app hash changes, run Tendermint with this
additional flag:

```sh
tendermint node --consensus.create_empty_blocks=false
```

or set the configuration via the `config.toml` file:

```toml
[consensus]
create_empty_blocks = false
```

Remember: because the default is to _create empty blocks_, avoiding
empty blocks requires the config option to be set to `false`.

The block interval setting allows for a delay (in time.Duration format [ParseDuration](https://golang.org/pkg/time/#ParseDuration)) between the
creation of each new empty block. It can be set with this additional flag:

```sh
--consensus.create_empty_blocks_interval="5s"
```

or set the configuration via the `config.toml` file:

```toml
[consensus]
create_empty_blocks_interval = "5s"
```

With this setting, empty blocks will be produced every 5s if no block
has been produced otherwise, regardless of the value of
`create_empty_blocks`.

## Broadcast API

Earlier, we used the `broadcast_tx_commit` endpoint to send a
transaction. When a transaction is sent to a Tendermint node, it will
run via `CheckTx` against the application. If it passes `CheckTx`, it
will be included in the mempool, broadcasted to other peers, and
eventually included in a block.

Since there are multiple phases to processing a transaction, we offer
multiple endpoints to broadcast a transaction:

```md
/broadcast_tx_async
/broadcast_tx_sync
/broadcast_tx_commit
```

These correspond to no-processing, processing through the mempool, and
processing through a block, respectively. That is, `broadcast_tx_async`,
will return right away without waiting to hear if the transaction is
even valid, while `broadcast_tx_sync` will return with the result of
running the transaction through `CheckTx`. Using `broadcast_tx_commit`
will wait until the transaction is committed in a block or until some
timeout is reached, but will return right away if the transaction does
not pass `CheckTx`. The return value for `broadcast_tx_commit` includes
two fields, `check_tx` and `deliver_tx`, pertaining to the result of
running the transaction through those ABCI messages.

The benefit of using `broadcast_tx_commit` is that the request returns
after the transaction is committed (i.e. included in a block), but that
can take on the order of a second. For a quick result, use
`broadcast_tx_sync`, but the transaction will not be committed until
later, and by that point its effect on the state may change.

Note the mempool does not provide strong guarantees - just because a tx passed
CheckTx (ie. was accepted into the mempool), doesn't mean it will be committed,
as nodes with the tx in their mempool may crash before they get to propose.
For more information, see the [mempool
write-ahead-log](../tendermint-core/running-in-production.md#mempool-wal)

## Tendermint Networks

When `tendermint init` is run, both a `genesis.json` and
`priv_validator_key.json` are created in `~/.tendermint/config`. The
`genesis.json` might look like:

```json
{
  "validators" : [
    {
      "pub_key" : {
        "value" : "h3hk+QE8c6QLTySp8TcfzclJw/BG79ziGB/pIA+DfPE=",
        "type" : "tendermint/PubKeyEd25519"
      },
      "power" : 10,
      "name" : ""
    }
  ],
  "app_hash" : "",
  "chain_id" : "test-chain-rDlYSN",
  "genesis_time" : "0001-01-01T00:00:00Z"
}
```

And the `priv_validator_key.json`:

```json
{
  "last_step" : 0,
  "last_round" : "0",
  "address" : "B788DEDE4F50AD8BC9462DE76741CCAFF87D51E2",
  "pub_key" : {
    "value" : "h3hk+QE8c6QLTySp8TcfzclJw/BG79ziGB/pIA+DfPE=",
    "type" : "tendermint/PubKeyEd25519"
  },
  "last_height" : "0",
  "priv_key" : {
    "value" : "JPivl82x+LfVkp8i3ztoTjY6c6GJ4pBxQexErOCyhwqHeGT5ATxzpAtPJKnxNx/NyUnD8Ebv3OIYH+kgD4N88Q==",
    "type" : "tendermint/PrivKeyEd25519"
  }
}
```

The `priv_validator_key.json` actually contains a private key, and should
thus be kept absolutely secret; for now we work with the plain text.
Note the `last_` fields, which are used to prevent us from signing
conflicting messages.

Note also that the `pub_key` (the public key) in the
`priv_validator_key.json` is also present in the `genesis.json`.

The genesis file contains the list of public keys which may participate
in the consensus, and their corresponding voting power. Greater than 2/3
of the voting power must be active (i.e. the corresponding private keys
must be producing signatures) for the consensus to make progress. In our
case, the genesis file contains the public key of our
`priv_validator_key.json`, so a Tendermint node started with the default
root directory will be able to make progress. Voting power uses an int64
but must be positive, thus the range is: 0 through 9223372036854775807.
Because of how the current proposer selection algorithm works, we do not
recommend having voting powers greater than 10\^12 (ie. 1 trillion).

If we want to add more nodes to the network, we have two choices: we can
add a new validator node, who will also participate in the consensus by
proposing blocks and voting on them, or we can add a new non-validator
node, who will not participate directly, but will verify and keep up
with the consensus protocol.

### Peers

#### Seed

A seed node is a node who relays the addresses of other peers which they know
of. These nodes constantly crawl the network to try to get more peers. The
addresses which the seed node relays get saved into a local address book. Once
these are in the address book, you will connect to those addresses directly.
Basically the seed nodes job is just to relay everyones addresses. You won't
connect to seed nodes once you have received enough addresses, so typically you
only need them on the first start. The seed node will immediately disconnect
from you after sending you some addresses.

#### Persistent Peer

Persistent peers are people you want to be constantly connected with. If you
disconnect you will try to connect directly back to them as opposed to using
another address from the address book. On restarts you will always try to
connect to these peers regardless of the size of your address book.

All peers relay peers they know of by default. This is called the peer exchange
protocol (PeX). With PeX, peers will be gossiping about known peers and forming
a network, storing peer addresses in the addrbook. Because of this, you don't
have to use a seed node if you have a live persistent peer.

#### Connecting to Peers

To connect to peers on start-up, specify them in the
`$TMHOME/config/config.toml` or on the command line. Use `seeds` to
specify seed nodes, and
`persistent_peers` to specify peers that your node will maintain
persistent connections with.

For example,

```sh
tendermint node --p2p.seeds "f9baeaa15fedf5e1ef7448dd60f46c01f1a9e9c4@1.2.3.4:26656,0491d373a8e0fcf1023aaf18c51d6a1d0d4f31bd@5.6.7.8:26656"
```

Alternatively, you can use the `/dial_seeds` endpoint of the RPC to
specify seeds for a running node to connect to:

```sh
curl 'localhost:26657/dial_seeds?seeds=\["f9baeaa15fedf5e1ef7448dd60f46c01f1a9e9c4@1.2.3.4:26656","0491d373a8e0fcf1023aaf18c51d6a1d0d4f31bd@5.6.7.8:26656"\]'
```

Note, with PeX enabled, you
should not need seeds after the first start.

If you want Tendermint to connect to specific set of addresses and
maintain a persistent connection with each, you can use the
`--p2p.persistent_peers` flag or the corresponding setting in the
`config.toml` or the `/dial_peers` RPC endpoint to do it without
stopping Tendermint core instance.

```sh
tendermint node --p2p.persistent_peers "429fcf25974313b95673f58d77eacdd434402665@10.11.12.13:26656,96663a3dd0d7b9d17d4c8211b191af259621c693@10.11.12.14:26656"

curl 'localhost:26657/dial_peers?persistent=true&peers=\["429fcf25974313b95673f58d77eacdd434402665@10.11.12.13:26656","96663a3dd0d7b9d17d4c8211b191af259621c693@10.11.12.14:26656"\]'
```

### Adding a Non-Validator

Adding a non-validator is simple. Just copy the original `genesis.json`
to `~/.tendermint/config` on the new machine and start the node,
specifying seeds or persistent peers as necessary. If no seeds or
persistent peers are specified, the node won't make any blocks, because
it's not a validator, and it won't hear about any blocks, because it's
not connected to the other peer.

### Adding a Validator

The easiest way to add new validators is to do it in the `genesis.json`,
before starting the network. For instance, we could make a new
`priv_validator_key.json`, and copy it's `pub_key` into the above genesis.

We can generate a new `priv_validator_key.json` with the command:

```sh
tendermint gen_validator
```

Now we can update our genesis file. For instance, if the new
`priv_validator_key.json` looks like:

```json
{
  "address" : "5AF49D2A2D4F5AD4C7C8C4CC2FB020131E9C4902",
  "pub_key" : {
    "value" : "l9X9+fjkeBzDfPGbUM7AMIRE6uJN78zN5+lk5OYotek=",
    "type" : "tendermint/PubKeyEd25519"
  },
  "priv_key" : {
    "value" : "EDJY9W6zlAw+su6ITgTKg2nTZcHAH1NMTW5iwlgmNDuX1f35+OR4HMN88ZtQzsAwhETq4k3vzM3n6WTk5ii16Q==",
    "type" : "tendermint/PrivKeyEd25519"
  },
  "last_step" : 0,
  "last_round" : "0",
  "last_height" : "0"
}
```

then the new `genesis.json` will be:

```json
{
  "validators" : [
    {
      "pub_key" : {
        "value" : "h3hk+QE8c6QLTySp8TcfzclJw/BG79ziGB/pIA+DfPE=",
        "type" : "tendermint/PubKeyEd25519"
      },
      "power" : 10,
      "name" : ""
    },
    {
      "pub_key" : {
        "value" : "l9X9+fjkeBzDfPGbUM7AMIRE6uJN78zN5+lk5OYotek=",
        "type" : "tendermint/PubKeyEd25519"
      },
      "power" : 10,
      "name" : ""
    }
  ],
  "app_hash" : "",
  "chain_id" : "test-chain-rDlYSN",
  "genesis_time" : "0001-01-01T00:00:00Z"
}
```

Update the `genesis.json` in `~/.tendermint/config`. Copy the genesis
file and the new `priv_validator_key.json` to the `~/.tendermint/config` on
a new machine.

Now run `tendermint node` on both machines, and use either
`--p2p.persistent_peers` or the `/dial_peers` to get them to peer up.
They should start making blocks, and will only continue to do so as long
as both of them are online.

To make a Tendermint network that can tolerate one of the validators
failing, you need at least four validator nodes (e.g., 2/3).

Updating validators in a live network is supported but must be
explicitly programmed by the application developer. See the [application
developers guide](../app-dev/app-development.md) for more details.

### Local Network

To run a network locally, say on a single machine, you must change the `_laddr`
fields in the `config.toml` (or using the flags) so that the listening
addresses of the various sockets don't conflict. Additionally, you must set
`addr_book_strict=false` in the `config.toml`, otherwise Tendermint's p2p
library will deny making connections to peers with the same IP address.

### Upgrading

See the
[UPGRADING.md](https://github.com/tendermint/tendermint/blob/v0.34.x/UPGRADING.md)
guide. You may need to reset your chain between major breaking releases.
Although, we expect Tendermint to have fewer breaking releases in the future
(especially after 1.0 release).
