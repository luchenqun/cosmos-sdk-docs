# 在生产环境中运行

:::note 概述
本节介绍如何在公共环境和/或 Cosmos SDK 公共区块链的主网上安全地运行节点。
:::

在生产环境中操作节点（全节点或验证人节点）时，设置服务器的安全性非常重要。

:::note
有许多不同的方法可以保护服务器和节点的安全性，本文档中描述的步骤是其中一种方法。如果想了解另一种设置服务器的方法，请参阅[在生产环境中运行教程](https://tutorials.cosmos.network/hands-on-exercise/5-run-in-prod/1-overview.html)。
:::

:::note
本教程假设底层操作系统为 Ubuntu。
:::

## 服务器设置

### 用户

在创建服务器时，通常会创建一个名为 `root` 的用户。该用户在服务器上具有较高的权限。在操作节点时，建议不要使用 root 用户运行节点。

1. 创建一个新用户

```bash
sudo adduser change_me
```

2. 授权该用户执行 sudo 任务的权限

```bash
sudo usermod -aG sudo change_me
```

现在可以使用非 root 用户登录服务器了。

### Go

1. 安装应用程序推荐的 [Go](https://go.dev/doc/install) 版本。

:::warning
过去，验证人在使用不同版本的 Go 时曾遇到问题。建议整个验证人集合使用应用程序推荐的 Go 版本。
:::

### 防火墙

节点不应该对外开放所有端口，这样很容易遭受分布式拒绝服务攻击（DDoS）。此外，[CometBFT](github.com/cometbft/cometbft) 建议不要公开不需要用于节点操作的端口。

在设置防火墙时，操作 Cosmos SDK 节点时可以打开一些端口。这些端口包括 CometBFT 的 json-RPC、prometheus、p2p、远程签名和 Cosmos SDK 的 GRPC 和 REST。如果节点作为不提供用于提交或查询的端点的节点运行，则最多只需要三个端点。

大多数服务器都配备了 [ufw](https://help.ubuntu.com/community/UFW)。本教程将使用 ufw。

1. 重置 UFW，禁止所有传入连接并允许传出连接

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

2. 确保端口22（ssh）保持开放。

```bash
sudo ufw allow ssh
```

或者

```bash
sudo ufw allow 22
```

上述两个命令是相同的。

3. 允许端口26656（cometbft p2p端口）。如果节点有修改的p2p端口，则必须在此处使用该端口。

```bash
sudo ufw allow 26656/tcp
```

4. 允许端口26660（cometbft [prometheus](https://prometheus.io)）。这也作为应用程序的监控端口。

```bash
sudo ufw allow 26660/tcp
```

5. 如果正在设置的节点希望公开 CometBFT 的 jsonRPC 和 Cosmos SDK 的 GRPC 和 REST，则按照以下步骤进行。（可选）

##### CometBFT JsonRPC

```bash
sudo ufw allow 26657/tcp
```

##### Cosmos SDK GRPC

```bash
sudo ufw allow 9090/tcp
```

##### Cosmos SDK REST

```bash
sudo ufw allow 1317/tcp
```

6. 最后，启用 UFW

```bash
sudo ufw enable
```

### 签名

如果要启动的节点是验证者，有多种方式可以对区块进行签名。

#### 文件

基于文件的签名是最简单且默认的方法。该方法通过存储在初始化过程中生成的共识密钥来对区块进行签名。该方法的安全性取决于服务器的设置，如果服务器受到攻击，则密钥也会受到威胁。该密钥位于 `config/priv_val_key.json` 目录中。

还有一个用户必须了解的第二个文件，该文件位于数据目录 `data/priv_val_state.json`。该文件用于防止节点进行双重签名。它记录了共识密钥的最后签名高度、轮次和最新签名。如果节点崩溃并需要恢复，必须保留此文件，以确保共识密钥不会用于签署先前已签署的区块。

#### 远程签名

远程签名是指与运行节点分离的辅助服务器使用共识密钥对区块进行签名。这意味着共识密钥不存储在节点本身上。这增加了安全性，因为连接到远程签名服务器的全节点可以在不丢失区块的情况下进行更换。

最常用的两个远程签名者是[Iqlusion](https://www.iqlusion.io)的[tmkms](https://github.com/iqlusioninc/tmkms)和[Strangelove](https://strange.love)的[horcrux](https://github.com/strangelove-ventures/horcrux)。

##### TMKMS 

###### 依赖项

1. 更新服务器依赖项并安装所需的额外组件。

```sh
sudo apt update -y && sudo apt install build-essential curl jq -y
```

2. 安装 Rust：

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

3. 安装 Libusb：

```sh
sudo apt install libusb-1.0-0-dev
```

###### 设置

有两种安装 tmkms 的方式，从源代码安装或使用 `cargo install`。在示例中，我们将介绍从源代码下载或构建以及使用 softsign 的方法。Softsign 代表软件签名，但如果您愿意，也可以使用 [yubihsm](https://www.yubico.com/products/hardware-security-module/) 作为签名密钥。

1. 构建：

从源代码：

```bash
cd $HOME
git clone https://github.com/iqlusioninc/tmkms.git
cd $HOME/tmkms
cargo install tmkms --features=softsign
tmkms init config
tmkms softsign keygen ./config/secrets/secret_connection_key
```

或者

Cargo 安装：

```bash
cargo install tmkms --features=softsign
tmkms init config
tmkms softsign keygen ./config/secrets/secret_connection_key
```

:::note
要使用 yubikey 运行 tmkms，请使用 `--features=yubihsm` 安装二进制文件。
:::

2. 将验证器密钥从全节点迁移到新的 tmkms 实例。

```bash
scp user@123.456.32.123:~/.simd/config/priv_validator_key.json ~/tmkms/config/secrets
```

3. 将验证器密钥导入到 tmkms 中。

```bash
tmkms softsign import $HOME/tmkms/config/secrets/priv_validator_key.json $HOME/tmkms/config/secrets/priv_validator_key
```

此时，需要从验证器节点和 tmkms 节点中删除 `priv_validator_key.json`。由于密钥已导入到 tmkms（上述步骤），在节点上不再需要该密钥。可以将密钥安全地离线存储。

4. 修改 `tmkms.toml`。

```bash
vim $HOME/tmkms/config/tmkms.toml
```

此示例显示了可用于软签名的配置。示例具有 IP 为 `123.456.12.345`，端口为 `26659`，chain_id 为 `test-chain-waSDSe`。这些是需要根据 tmkms 和网络的用例进行修改的项目。

```toml
# CometBFT KMS configuration file

## Chain Configuration

[[chain]]
id = "osmosis-1"
key_format = { type = "bech32", account_key_prefix = "cosmospub", consensus_key_prefix = "cosmosvalconspub" }
state_file = "/root/tmkms/config/state/priv_validator_state.json"

## Signing Provider Configuration

### Software-based Signer Configuration

[[providers.softsign]]
chain_ids = ["test-chain-waSDSe"]
key_type = "consensus"
path = "/root/tmkms/config/secrets/priv_validator_key"

## Validator Configuration

[[validator]]
chain_id = "test-chain-waSDSe"
addr = "tcp://123.456.12.345:26659"
secret_key = "/root/tmkms/config/secrets/secret_connection_key"
protocol_version = "v0.34"
reconnect = true
```

5. 设置 tmkms 实例的地址。

```bash
vim $HOME/.simd/config/config.toml

priv_validator_laddr = "tcp://0.0.0.0:26659"
```

:::tip
上述地址设置为`0.0.0.0`，但建议设置tmkms服务器以确保启动安全。
:::

:::tip
建议注释或删除指定验证器密钥和验证器路径的行：

```toml
# Path to the JSON file containing the private key to use as a validator in the consensus protocol
# priv_validator_key_file = "config/priv_validator_key.json"

# Path to the JSON file containing the last sign state of a validator
# priv_validator_state_file = "data/priv_validator_state.json"
```

:::

6. 启动两个进程。

```bash
tmkms start -c $HOME/tmkms/config/tmkms.toml
```

```bash
simd start
```




# Running in Production

:::note Synopsis
This section describes how to securely run a node in a public setting and/or on a mainnet on one of the many Cosmos SDK public blockchains. 
:::

When operating a node, full node or validator, in production it is important to set your server up securely. 

:::note
There are many different ways to secure a server and your node, the described steps here is one way. To see another way of setting up a server see the [run in production tutorial](https://tutorials.cosmos.network/hands-on-exercise/5-run-in-prod/1-overview.html).
:::

:::note
This walkthrough assumes the underlying operating system is Ubuntu. 
:::

## Sever Setup

### User

When creating a server most times it is created as user `root`. This user has heightened privileges on the server. When operating a node, it is recommended to not run your node as the root user.  

1. Create a new user

```bash
sudo adduser change_me
```

2. We want to allow this user to perform sudo tasks

```bash
sudo usermod -aG sudo change_me
```

Now when logging into the server, the non `root` user can be used. 

### Go

1. Install the [Go](https://go.dev/doc/install) version preconized by the application.

:::warning
In the past, validators [have had issues](https://github.com/cosmos/cosmos-sdk/issues/13976) when using different versions of Go. It is recommended that the whole validator set uses the version of Go that is preconized by the application.
:::

### Firewall

Nodes should not have all ports open to the public, this is a simple way to get DDOS'd. Secondly it is recommended by [CometBFT](github.com/cometbft/cometbft) to never expose ports that are not required to operate a node. 

When setting up a firewall there are a few ports that can be open when operating a Cosmos SDK node. There is the CometBFT json-RPC, prometheus, p2p, remote signer and Cosmos SDK GRPC and REST. If the node is being operated as a node that does not offer endpoints to be used for submission or querying then a max of three endpoints are needed.

Most, if not all servers come equipped with [ufw](https://help.ubuntu.com/community/UFW). Ufw will be used in this tutorial. 

1. Reset UFW to disallow all incoming connections and allow outgoing

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

2. Lets make sure that port 22 (ssh) stays open. 

```bash
sudo ufw allow ssh
```

or 

```bash
sudo ufw allow 22
```

Both of the above commands are the same. 

3. Allow Port 26656 (cometbft p2p port). If the node has a modified p2p port then that port must be used here.

```bash
sudo ufw allow 26656/tcp
```

4. Allow port 26660 (cometbft [prometheus](https://prometheus.io)). This acts as the applications monitoring port as well. 

```bash
sudo ufw allow 26660/tcp
```

5. IF the node which is being setup would like to expose CometBFTs jsonRPC and Cosmos SDK GRPC and REST then follow this step. (Optional)

##### CometBFT JsonRPC

```bash
sudo ufw allow 26657/tcp
```

##### Cosmos SDK GRPC

```bash
sudo ufw allow 9090/tcp
```

##### Cosmos SDK REST

```bash
sudo ufw allow 1317/tcp
```

6. Lastly, enable ufw

```bash
sudo ufw enable
```

### Signing

If the node that is being started is a validator there are multiple ways a validator could sign blocks. 

#### File

File based signing is the simplest and default approach. This approach works by storing the consensus key, generated on initialization, to sign blocks. This approach is only as safe as your server setup as if the server is compromised so is your key.  This key is located in the `config/priv_val_key.json` directory generated on initialization.

A second file exists that user must be aware of, the file is located in the data directory `data/priv_val_state.json`. This file protects your node from double signing. It keeps track of the consensus keys last sign height, round and latest signature. If the node crashes and needs to be recovered this file must be kept in order to ensure that the consensus key will not be used for signing a block that was previously signed. 

#### Remote Signer

A remote signer is a secondary server that is separate from the running node that signs blocks with the consensus key. This means that the consensus key does not live on the node itself. This increases security because your full node which is connected to the remote signer can be swapped without missing blocks. 

The two most used remote signers are [tmkms](https://github.com/iqlusioninc/tmkms) from [Iqlusion](https://www.iqlusion.io) and [horcrux](https://github.com/strangelove-ventures/horcrux) from [Strangelove](https://strange.love).

##### TMKMS 

###### Dependencies

1. Update server dependencies and install extras needed. 

```sh
sudo apt update -y && sudo apt install build-essential curl jq -y
```

2. Install Rust: 

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

3. Install Libusb:

```sh
sudo apt install libusb-1.0-0-dev
```

###### Setup

There are two ways to install tmkms, from source or `cargo install`. In the examples we will cover downloading or building from source and using softsign. Softsign stands for software signing, but you could use a [yubihsm](https://www.yubico.com/products/hardware-security-module/) as your signing key if you wish. 

1. Build:

From source:

```bash
cd $HOME
git clone https://github.com/iqlusioninc/tmkms.git
cd $HOME/tmkms
cargo install tmkms --features=softsign
tmkms init config
tmkms softsign keygen ./config/secrets/secret_connection_key
```

or 

Cargo install: 

```bash
cargo install tmkms --features=softsign
tmkms init config
tmkms softsign keygen ./config/secrets/secret_connection_key
```

:::note
To use tmkms with a yubikey install the binary with `--features=yubihsm`.
:::

2. Migrate the validator key from the full node to the new tmkms instance. 

```bash
scp user@123.456.32.123:~/.simd/config/priv_validator_key.json ~/tmkms/config/secrets
```

3. Import the validator key into tmkms. 

```bash
tmkms softsign import $HOME/tmkms/config/secrets/priv_validator_key.json $HOME/tmkms/config/secrets/priv_validator_key
```

At this point, it is necessary to delete the `priv_validator_key.json` from the validator node and the tmkms node. Since the key has been imported into tmkms (above) it is no longer necessary on the nodes. The key can be safely stored offline. 

4. Modifiy the `tmkms.toml`. 

```bash
vim $HOME/tmkms/config/tmkms.toml
```

This example shows a configuration that could be used for soft signing. The example has an IP of `123.456.12.345` with a port of `26659` a chain_id of `test-chain-waSDSe`. These are items that most be modified for the usecase of tmkms and the network. 

```toml
# CometBFT KMS configuration file

## Chain Configuration

[[chain]]
id = "osmosis-1"
key_format = { type = "bech32", account_key_prefix = "cosmospub", consensus_key_prefix = "cosmosvalconspub" }
state_file = "/root/tmkms/config/state/priv_validator_state.json"

## Signing Provider Configuration

### Software-based Signer Configuration

[[providers.softsign]]
chain_ids = ["test-chain-waSDSe"]
key_type = "consensus"
path = "/root/tmkms/config/secrets/priv_validator_key"

## Validator Configuration

[[validator]]
chain_id = "test-chain-waSDSe"
addr = "tcp://123.456.12.345:26659"
secret_key = "/root/tmkms/config/secrets/secret_connection_key"
protocol_version = "v0.34"
reconnect = true
```

5. Set the address of the tmkms instance. 

```bash
vim $HOME/.simd/config/config.toml

priv_validator_laddr = "tcp://0.0.0.0:26659"
```

:::tip
The above address it set to `0.0.0.0` but it is recommended to set the tmkms server to secure the startup
:::

:::tip
It is recommended to comment or delete the lines that specify the path of the validator key and validator:

```toml
# Path to the JSON file containing the private key to use as a validator in the consensus protocol
# priv_validator_key_file = "config/priv_validator_key.json"

# Path to the JSON file containing the last sign state of a validator
# priv_validator_state_file = "data/priv_validator_state.json"
```

:::

6. Start the two processes. 

```bash
tmkms start -c $HOME/tmkms/config/tmkms.toml
```

```bash
simd start
```
