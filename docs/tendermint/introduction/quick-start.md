---
order: 2
---

# 快速入门

## 概述

这是一个快速入门指南。如果你对 Tendermint 的工作原理有一个模糊的概念，并且想要立即开始使用，那么请继续阅读。

## 安装

### 快速安装

要在一个全新的 Ubuntu 16.04 机器上快速安装 Tendermint，请使用[此脚本](https://git.io/fFfOR)。

> :warning: 不要在不知道脚本功能的情况下将脚本复制到你的机器上运行。

```sh
curl -L https://git.io/fFfOR | bash
source ~/.profile
```

该脚本也用于下面的集群部署。

### 手动安装

对于手动安装，请参阅[安装说明](install.md)。

## 初始化

运行：

```sh
tendermint init
```

将会创建一个单独的本地节点所需的文件。

这些文件位于 `$HOME/.tendermint` 目录下：

```sh
$ ls $HOME/.tendermint

config  data

$ ls $HOME/.tendermint/config/

config.toml  genesis.json  node_key.json  priv_validator.json
```

对于单独的本地节点，不需要进一步的配置。如何配置集群将在下面详细介绍。

## 本地节点

使用一个简单的内部应用程序启动 Tendermint：

```sh
tendermint node --proxy_app=kvstore
```

> 注意：`kvstore` 是一个非持久化应用程序，如果你想要运行一个具有持久性的应用程序，请使用 `--proxy_app=persistent_kvstore`。

然后区块将开始流入：

```sh
I[01-06|01:45:15.592] 执行区块                                 module=state height=1 validTxs=0 invalidTxs=0
I[01-06|01:45:15.624] 提交状态                                 module=state height=1 txs=0 appHash=
```

使用以下命令检查状态：

```sh
curl -s localhost:26657/status
```

### 发送交易

在 KVstore 应用程序运行时，我们可以发送交易：

```sh
curl -s 'localhost:26657/broadcast_tx_commit?tx="abcd"'
```

并使用以下命令检查是否成功：

```sh
curl -s 'localhost:26657/abci_query?data="abcd"'
```

我们还可以发送带有键和值的交易：

```sh
curl -s 'localhost:26657/broadcast_tx_commit?tx="name=satoshi"'
```

并查询该键：

```sh
curl -s 'localhost:26657/abci_query?data="name"'
```

其中值以十六进制返回。

## 节点集群

首先创建四个 Ubuntu 云机器。以下内容在 Digital Ocean Ubuntu 16.04 x64 (3GB/1CPU, 20GB SSD) 上进行了测试。我们将在下面将它们的 IP 地址分别称为 IP1、IP2、IP3、IP4。

然后，`ssh` 进入每台机器，并执行[此脚本](https://git.io/fFfOR)：

```sh
curl -L https://git.io/fFfOR | bash
source ~/.profile
```

这将安装 `go` 和其他依赖项，获取 Tendermint 源代码，然后编译 `tendermint` 二进制文件。

接下来，使用 `tendermint testnet` 命令创建四个配置文件目录（在 `./mytestnet` 中找到），并将每个目录复制到云中的相应机器上，以便每台机器都有 `$HOME/mytestnet/node[0-3]` 目录。

在启动网络之前，您需要节点标识符（IP 不足以且可能会更改）。我们将称其为 ID1、ID2、ID3、ID4。

```sh
tendermint show_node_id --home ./mytestnet/node0
tendermint show_node_id --home ./mytestnet/node1
tendermint show_node_id --home ./mytestnet/node2
tendermint show_node_id --home ./mytestnet/node3
```

最后，从每台机器上运行：

```sh
tendermint node --home ./mytestnet/node0 --proxy_app=kvstore --p2p.persistent_peers="ID1@IP1:26656,ID2@IP2:26656,ID3@IP3:26656,ID4@IP4:26656"
tendermint node --home ./mytestnet/node1 --proxy_app=kvstore --p2p.persistent_peers="ID1@IP1:26656,ID2@IP2:26656,ID3@IP3:26656,ID4@IP4:26656"
tendermint node --home ./mytestnet/node2 --proxy_app=kvstore --p2p.persistent_peers="ID1@IP1:26656,ID2@IP2:26656,ID3@IP3:26656,ID4@IP4:26656"
tendermint node --home ./mytestnet/node3 --proxy_app=kvstore --p2p.persistent_peers="ID1@IP1:26656,ID2@IP2:26656,ID3@IP3:26656,ID4@IP4:26656"
```

请注意，在第三个节点启动后，区块将开始流入，因为已经有超过2/3的验证者（在 `genesis.json` 中定义）上线了。
持久节点也可以在 `config.toml` 中指定。有关配置选项的更多信息，请参阅[此处](../tendermint-core/configuration.md)。

然后，可以按照上面单个本地节点示例中的说明发送交易。


---
order: 2
---

# Quick Start

## Overview

This is a quick start guide. If you have a vague idea about how Tendermint
works and want to get started right away, continue.

## Install

### Quick Install

To quickly get Tendermint installed on a fresh
Ubuntu 16.04 machine, use [this script](https://git.io/fFfOR).

> :warning: Do not copy scripts to run on your machine without knowing what they do.

```sh
curl -L https://git.io/fFfOR | bash
source ~/.profile
```

The script is also used to facilitate cluster deployment below.

### Manual Install

For manual installation, see the [install instructions](install.md)

## Initialization

Running:

```sh
tendermint init
```

will create the required files for a single, local node.

These files are found in `$HOME/.tendermint`:

```sh
$ ls $HOME/.tendermint

config  data

$ ls $HOME/.tendermint/config/

config.toml  genesis.json  node_key.json  priv_validator.json
```

For a single, local node, no further configuration is required.
Configuring a cluster is covered further below.

## Local Node

Start Tendermint with a simple in-process application:

```sh
tendermint node --proxy_app=kvstore
```

> Note: `kvstore` is a non persistent app, if you would like to run an application with persistence run `--proxy_app=persistent_kvstore`

and blocks will start to stream in:

```sh
I[01-06|01:45:15.592] Executed block                               module=state height=1 validTxs=0 invalidTxs=0
I[01-06|01:45:15.624] Committed state                              module=state height=1 txs=0 appHash=
```

Check the status with:

```sh
curl -s localhost:26657/status
```

### Sending Transactions

With the KVstore app running, we can send transactions:

```sh
curl -s 'localhost:26657/broadcast_tx_commit?tx="abcd"'
```

and check that it worked with:

```sh
curl -s 'localhost:26657/abci_query?data="abcd"'
```

We can send transactions with a key and value too:

```sh
curl -s 'localhost:26657/broadcast_tx_commit?tx="name=satoshi"'
```

and query the key:

```sh
curl -s 'localhost:26657/abci_query?data="name"'
```

where the value is returned in hex.

## Cluster of Nodes

First create four Ubuntu cloud machines. The following was tested on Digital
Ocean Ubuntu 16.04 x64 (3GB/1CPU, 20GB SSD). We'll refer to their respective IP
addresses below as IP1, IP2, IP3, IP4.

Then, `ssh` into each machine, and execute [this script](https://git.io/fFfOR):

```sh
curl -L https://git.io/fFfOR | bash
source ~/.profile
```

This will install `go` and other dependencies, get the Tendermint source code, then compile the `tendermint` binary.

Next, use the `tendermint testnet` command to create four directories of config files (found in `./mytestnet`) and copy each directory to the relevant machine in the cloud, so that each machine has `$HOME/mytestnet/node[0-3]` directory.

Before you can start the network, you'll need peers identifiers (IPs are not enough and can change). We'll refer to them as ID1, ID2, ID3, ID4.

```sh
tendermint show_node_id --home ./mytestnet/node0
tendermint show_node_id --home ./mytestnet/node1
tendermint show_node_id --home ./mytestnet/node2
tendermint show_node_id --home ./mytestnet/node3
```

Finally, from each machine, run:

```sh
tendermint node --home ./mytestnet/node0 --proxy_app=kvstore --p2p.persistent_peers="ID1@IP1:26656,ID2@IP2:26656,ID3@IP3:26656,ID4@IP4:26656"
tendermint node --home ./mytestnet/node1 --proxy_app=kvstore --p2p.persistent_peers="ID1@IP1:26656,ID2@IP2:26656,ID3@IP3:26656,ID4@IP4:26656"
tendermint node --home ./mytestnet/node2 --proxy_app=kvstore --p2p.persistent_peers="ID1@IP1:26656,ID2@IP2:26656,ID3@IP3:26656,ID4@IP4:26656"
tendermint node --home ./mytestnet/node3 --proxy_app=kvstore --p2p.persistent_peers="ID1@IP1:26656,ID2@IP2:26656,ID3@IP3:26656,ID4@IP4:26656"
```

Note that after the third node is started, blocks will start to stream in
because >2/3 of validators (defined in the `genesis.json`) have come online.
Persistent peers can also be specified in the `config.toml`. See [here](../tendermint-core/configuration.md) for more information about configuration options.

Transactions can then be sent as covered in the single, local node example above.
