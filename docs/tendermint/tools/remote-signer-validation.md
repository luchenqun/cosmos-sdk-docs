# tm-signer-harness

位于[Tendermint存储库](https://github.com/tendermint/tendermint)的`tools/tm-signer-harness`文件夹下。

Tendermint远程签名者测试工具用于促进Tendermint与远程签名者（如[KMS](https://github.com/tendermint/kms)）之间的集成测试。这些远程签名者允许使用[HSMs](https://en.wikipedia.org/wiki/Hardware_security_module)对重要的Tendermint消息进行签名，提供额外的安全性。

当执行`tm-signer-harness`时：

1. 运行一个监听器（TCP或Unix套接字）。
2. 等待远程签名者的连接。
3. 在远程签名者连接后，执行一系列自动化测试以确保兼容性。
4. 在验证成功后，测试工具进程以0退出码退出。在验证失败时，它以与错误相关的特定退出码退出。

## 先决条件

需要与构建[Tendermint](https://github.com/tendermint/tendermint)相同的先决条件。

## 构建

从Tendermint源代码库中的`tools/tm-signer-harness`目录中运行以下命令：

```bash
make

# To have global access to this executable
make install
```

## Docker镜像

要构建包含`tm-signer-harness`的Docker镜像，也可以从Tendermint源代码库的`tools/tm-signer-harness`目录中运行以下命令：

```bash
make docker-image
```

## 运行与KMS的集成测试

作为如何使用`tm-signer-harness`的示例，以下说明展示了如何对[KMS](https://github.com/tendermint/kms)执行其测试。对于此示例，我们将使用KMS中的**软件签名模块**，因为硬件签名模块需要物理的[YubiHSM](https://www.yubico.com/products/yubihsm/)设备。

### 第1步：在本地机器上安装KMS

有关如何在本地机器上设置KMS的详细信息，请参见[KMS存储库](https://github.com/tendermint/kms)。

如果您在本地机器上安装了[Rust](https://www.rust-lang.org/)，您可以通过以下命令简单地安装KMS：

```bash
cargo install tmkms
```

### 第2步：为KMS生成密钥

KMS 软件签名模块需要一个用于签署消息的密钥。在我们的示例中，我们将简单地从本地 Tendermint 实例导出一个签名密钥。

```bash
# Will generate all necessary Tendermint configuration files, including:
# - ~/.tendermint/config/priv_validator_key.json
# - ~/.tendermint/data/priv_validator_state.json
tendermint init

# Extract the signing key from our local Tendermint instance
tm-signer-harness extract_key \      # Use the "extract_key" command
    -tmhome ~/.tendermint \          # Where to find the Tendermint home directory
    -output ./signing.key            # Where to write the key
```

此外，因为我们希望 KMS 连接到 `tm-signer-harness`，我们需要提供来自 KMS 方面的秘密连接密钥：

```bash
tmkms keygen secret_connection.key
```

### 步骤 3：配置和运行 KMS

KMS 需要一些配置来告诉它使用软件签名模块以及我们刚刚生成的 `signing.key` 文件。将以下内容保存到名为 `tmkms.toml` 的文件中：

```toml
[[validator]]
addr = "tcp://127.0.0.1:61219"         # This is where we will find tm-signer-harness.
chain_id = "test-chain-0XwP5E"         # The Tendermint chain ID for which KMS will be signing (found in ~/.tendermint/config/genesis.json).
reconnect = true                       # true is the default
secret_key = "./secret_connection.key" # Where to find our secret connection key.

[[providers.softsign]]
id = "test-chain-0XwP5E"               # The Tendermint chain ID for which KMS will be signing (same as validator.chain_id above).
path = "./signing.key"                 # The signing key we extracted earlier.
```

然后使用此配置运行 KMS：

```bash
tmkms start -c tmkms.toml
```

这将启动 KMS，它将重复尝试连接到 `tcp://127.0.0.1:61219`，直到成功为止。

### 步骤 4：运行 tm-signer-harness

现在我们可以运行签名者测试工具：

```bash
tm-signer-harness run \             # The "run" command executes the tests
    -addr tcp://127.0.0.1:61219 \   # The address we promised KMS earlier
    -tmhome ~/.tendermint           # Where to find our Tendermint configuration/data files.
```

如果当前版本的 Tendermint 和 KMS 兼容，`tm-signer-harness` 应该以 0 的退出码退出。如果它们不兼容，它应该以有意义的非零退出码退出（请参阅下面的退出码）。

### 步骤 5：关闭 KMS

只需在 KMS 实例上按 Ctrl+Break（或在 Linux 上使用 `kill` 命令）以正常终止它。

## 退出码含义

以下列表显示了 `tm-signer-harness` 的各种退出码及其含义：

| 退出码 | 描述 |
| --- | --- |
| 0 | 成功！ |
| 1 | `tm-signer-harness` 提供的命令行参数无效 |
| 2 | 达到最大接受重试次数（`-accept-retries` 参数） |
| 3 | 无法加载 `${TMHOME}/config/genesis.json` |
| 4 | 无法创建由 `-addr` 参数指定的监听器 |
| 5 | 无法启动监听器 |
| 6 | 被 `SIGINT` 中断（例如按下 Ctrl+Break 或 Ctrl+C） |
| 7 | 其他未知错误 |
| 8 | 测试 1 失败：公钥不匹配 |
| 9 | 测试 2 失败：提案的签名失败 |
| 10 | 测试 3 失败：投票的签名失败 |


# tm-signer-harness

Located under the `tools/tm-signer-harness` folder in the [Tendermint
repository](https://github.com/tendermint/tendermint).

The Tendermint remote signer test harness facilitates integration testing
between Tendermint and remote signers such as
[KMS](https://github.com/tendermint/kms). Such remote signers allow for signing
of important Tendermint messages using
[HSMs](https://en.wikipedia.org/wiki/Hardware_security_module), providing
additional security.

When executed, `tm-signer-harness`:

1. Runs a listener (either TCP or Unix sockets).
2. Waits for a connection from the remote signer.
3. Upon connection from the remote signer, executes a number of automated tests
   to ensure compatibility.
4. Upon successful validation, the harness process exits with a 0 exit code.
   Upon validation failure, it exits with a particular exit code related to the
   error.

## Prerequisites

Requires the same prerequisites as for building
[Tendermint](https://github.com/tendermint/tendermint).

## Building

From the `tools/tm-signer-harness` directory in your Tendermint source
repository, simply run:

```bash
make

# To have global access to this executable
make install
```

## Docker Image

To build a Docker image containing the `tm-signer-harness`, also from the
`tools/tm-signer-harness` directory of your Tendermint source repo, simply run:

```bash
make docker-image
```

## Running against KMS

As an example of how to use `tm-signer-harness`, the following instructions show
you how to execute its tests against [KMS](https://github.com/tendermint/kms).
For this example, we will make use of the **software signing module in KMS**, as
the hardware signing module requires a physical
[YubiHSM](https://www.yubico.com/products/yubihsm/) device.

### Step 1: Install KMS on your local machine

See the [KMS repo](https://github.com/tendermint/kms) for details on how to set
KMS up on your local machine.

If you have [Rust](https://www.rust-lang.org/) installed on your local machine,
you can simply install KMS by:

```bash
cargo install tmkms
```

### Step 2: Make keys for KMS

The KMS software signing module needs a key with which to sign messages. In our
example, we will simply export a signing key from our local Tendermint instance.

```bash
# Will generate all necessary Tendermint configuration files, including:
# - ~/.tendermint/config/priv_validator_key.json
# - ~/.tendermint/data/priv_validator_state.json
tendermint init

# Extract the signing key from our local Tendermint instance
tm-signer-harness extract_key \      # Use the "extract_key" command
    -tmhome ~/.tendermint \          # Where to find the Tendermint home directory
    -output ./signing.key            # Where to write the key
```

Also, because we want KMS to connect to `tm-signer-harness`, we will need to
provide a secret connection key from KMS' side:

```bash
tmkms keygen secret_connection.key
```

### Step 3: Configure and run KMS

KMS needs some configuration to tell it to use the softer signing module as well
as the `signing.key` file we just generated. Save the following to a file called
`tmkms.toml`:

```toml
[[validator]]
addr = "tcp://127.0.0.1:61219"         # This is where we will find tm-signer-harness.
chain_id = "test-chain-0XwP5E"         # The Tendermint chain ID for which KMS will be signing (found in ~/.tendermint/config/genesis.json).
reconnect = true                       # true is the default
secret_key = "./secret_connection.key" # Where to find our secret connection key.

[[providers.softsign]]
id = "test-chain-0XwP5E"               # The Tendermint chain ID for which KMS will be signing (same as validator.chain_id above).
path = "./signing.key"                 # The signing key we extracted earlier.
```

Then run KMS with this configuration:

```bash
tmkms start -c tmkms.toml
```

This will start KMS, which will repeatedly try to connect to
`tcp://127.0.0.1:61219` until it is successful.

### Step 4: Run tm-signer-harness

Now we get to run the signer test harness:

```bash
tm-signer-harness run \             # The "run" command executes the tests
    -addr tcp://127.0.0.1:61219 \   # The address we promised KMS earlier
    -tmhome ~/.tendermint           # Where to find our Tendermint configuration/data files.
```

If the current version of Tendermint and KMS are compatible, `tm-signer-harness`
should now exit with a 0 exit code. If they are somehow not compatible, it
should exit with a meaningful non-zero exit code (see the exit codes below).

### Step 5: Shut down KMS

Simply hit Ctrl+Break on your KMS instance (or use the `kill` command in Linux)
to terminate it gracefully.

## Exit Code Meanings

The following list shows the various exit codes from `tm-signer-harness` and
their meanings:

| Exit Code | Description |
| --- | --- |
| 0 | Success! |
| 1 | Invalid command line parameters supplied to `tm-signer-harness` |
| 2 | Maximum number of accept retries reached (the `-accept-retries` parameter) |
| 3 | Failed to load `${TMHOME}/config/genesis.json` |
| 4 | Failed to create listener specified by `-addr` parameter |
| 5 | Failed to start listener |
| 6 | Interrupted by `SIGINT` (e.g. when hitting Ctrl+Break or Ctrl+C) |
| 7 | Other unknown error |
| 8 | Test 1 failed: public key mismatch |
| 9 | Test 2 failed: signing of proposals failed |
| 10 | Test 3 failed: signing of votes failed |
