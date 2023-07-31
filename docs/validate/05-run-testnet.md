# 运行测试网络

:::note 概要
`simd testnet` 子命令可以方便地初始化和启动一个模拟测试网络，用于测试目的。
:::

除了[运行节点](../user/run-node/01-run-node.md)的命令之外，`simd` 二进制文件还包括一个 `testnet` 命令，允许您在进程内启动一个模拟测试网络，或者初始化一个在单独进程中运行的模拟测试网络的文件。

## 初始化文件

首先，让我们看一下 `init-files` 子命令。

这类似于初始化单个节点时的 `init` 命令，但在这种情况下，我们正在初始化多个节点，为每个节点生成创世事务，然后收集这些事务。

`init-files` 子命令初始化了在单独进程中运行测试网络所需的文件（即使用 Docker 容器）。运行此命令不是 `start` 子命令的先决条件（[请参见下文](#start-testnet)）。

为了初始化测试网络的文件，请运行以下命令：

```bash
simd testnet init-files
```

您应该在终端中看到以下输出：

```bash
成功初始化了 4 个节点目录
```

默认的输出目录是一个相对的 `.testnets` 目录。让我们看一下 `.testnets` 目录中创建的文件。

### gentxs

`gentxs` 目录包含每个验证节点的创世事务。每个文件包含一个 JSON 编码的创世事务，用于在创世时注册验证节点。这些创世事务在初始化过程中添加到每个节点目录中的 `genesis.json` 文件中。

### nodes

为每个验证节点创建一个节点目录。在每个节点目录中有一个 `simd` 目录。`simd` 目录是每个节点的主目录，其中包含该节点的配置和数据文件（即在运行单个节点时包含在默认的 `~/.simapp` 目录中的相同文件）。

## 启动测试网络

现在，让我们看一下 `start` 子命令。

`start`子命令既初始化又启动一个内部测试网络。这是最快的方法来启动一个本地测试网络，用于测试目的。

您可以通过运行以下命令来启动本地测试网络：

```bash
simd testnet start
```

您应该会看到类似以下的内容：

```bash
acquiring test network lock
preparing test network with chain-id "chain-mtoD9v"


+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
++       THIS MNEMONIC IS FOR TESTING PURPOSES ONLY        ++
++                DO NOT USE IN PRODUCTION                 ++
++                                                         ++
++  sustain know debris minute gate hybrid stereo custom   ++
++  divorce cross spoon machine latin vibrant term oblige  ++
++   moment beauty laundry repeat grab game bronze truly   ++
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


starting test network...
started test network
press the Enter Key to terminate
```

第一个验证节点现在正在内部运行，这意味着一旦关闭终端窗口或按下回车键，测试网络将终止。在输出中，为了测试目的，提供了第一个验证节点的助记词短语。验证节点使用与初始化和启动单个节点时相同的默认地址（无需提供`--node`标志）。

检查第一个验证节点的状态：

```shell
simd status
```

从提供的助记词中导入密钥：

```shell
simd keys add test --recover --keyring-backend test
```

检查账户地址的余额：

```shell
simd q bank balances [address]
```

使用这个测试账户手动测试测试网络。

## 测试网络选项

您可以使用标志自定义测试网络的配置。为了查看所有标志选项，请在每个命令后附加`--help`标志。




# Running a Testnet

:::note Synopsis
The `simd testnet` subcommand makes it easy to initialize and start a simulated test network for testing purposes.
:::

In addition to the commands for [running a node](../user/run-node/01-run-node.md), the `simd` binary also includes a `testnet` command that allows you to start a simulated test network in-process or to initialize files for a simulated test network that runs in a separate process.

## Initialize Files

First, let's take a look at the `init-files` subcommand.

This is similar to the `init` command when initializing a single node, but in this case we are initializing multiple nodes, generating the genesis transactions for each node, and then collecting those transactions.

The `init-files` subcommand initializes the necessary files to run a test network in a separate process (i.e. using a Docker container). Running this command is not a prerequisite for the `start` subcommand ([see below](#start-testnet)).

In order to initialize the files for a test network, run the following command:

```bash
simd testnet init-files
```

You should see the following output in your terminal:

```bash
Successfully initialized 4 node directories
```

The default output directory is a relative `.testnets` directory. Let's take a look at the files created within the `.testnets` directory.

### gentxs

The `gentxs` directory includes a genesis transaction for each validator node. Each file includes a JSON encoded genesis transaction used to register a validator node at the time of genesis. The genesis transactions are added to the `genesis.json` file within each node directory during the initilization process.

### nodes

A node directory is created for each validator node. Within each node directory is a `simd` directory. The `simd` directory is the home directory for each node, which includes the configuration and data files for that node (i.e. the same files included in the default `~/.simapp` directory when running a single node).

## Start Testnet

Now, let's take a look at the `start` subcommand.

The `start` subcommand both initializes and starts an in-process test network. This is the fastest way to spin up a local test network for testing purposes.

You can start the local test network by running the following command:

```bash
simd testnet start
```

You should see something similar to the following:

```bash
acquiring test network lock
preparing test network with chain-id "chain-mtoD9v"


+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
++       THIS MNEMONIC IS FOR TESTING PURPOSES ONLY        ++
++                DO NOT USE IN PRODUCTION                 ++
++                                                         ++
++  sustain know debris minute gate hybrid stereo custom   ++
++  divorce cross spoon machine latin vibrant term oblige  ++
++   moment beauty laundry repeat grab game bronze truly   ++
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


starting test network...
started test network
press the Enter Key to terminate
```

The first validator node is now running in-process, which means the test network will terminate once you either close the terminal window or you press the Enter key. In the output, the mnemonic phrase for the first validator node is provided for testing purposes. The validator node is using the same default addresses being used when initializing and starting a single node (no need to provide a `--node` flag).

Check the status of the first validator node:

```shell
simd status
```

Import the key from the provided mnemonic:

```shell
simd keys add test --recover --keyring-backend test
```

Check the balance of the account address:

```shell
simd q bank balances [address]
```

Use this test account to manually test against the test network.

## Testnet Options

You can customize the configuration of the test network with flags. In order to see all flag options, append the `--help` flag to each command.
