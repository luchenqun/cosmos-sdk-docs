# Cosmovisor

`cosmovisor`是一个用于监控治理模块中链升级提案的Cosmos SDK应用程序二进制文件的小型进程管理器。如果它看到一个被批准的提案，`cosmovisor`可以自动下载新的二进制文件，停止当前的二进制文件，从旧的二进制文件切换到新的二进制文件，最后使用新的二进制文件重新启动节点。

* [设计](#design)
* [贡献](#contributing)
* [设置](#setup)
    * [安装](#installation)
    * [命令行参数和环境变量](#command-line-arguments-and-environment-variables)
    * [文件夹布局](#folder-layout)
* [用法](#usage)
    * [初始化](#initialization)
    * [检测升级](#detecting-upgrades)
    * [自动下载](#auto-download)
* [示例：SimApp升级](#example-simapp-upgrade)
    * [链设置](#chain-setup)
        * [准备Cosmovisor并启动链](#prepare-cosmovisor-and-start-the-chain)
        * [更新应用程序](#update-app)

## 设计

Cosmovisor被设计为`Cosmos SDK`应用程序的包装器：

* 它将参数传递给关联的应用程序（由`DAEMON_NAME`环境变量配置）。运行`cosmovisor run arg1 arg2 ....`将运行`app arg1 arg2 ...`；
* 它将通过重新启动和升级来管理应用程序；
* 它使用环境变量进行配置，而不是位置参数。

*注意：如果应用程序的新版本没有设置为在原地进行存储迁移，则需要在使用新的二进制文件重新启动`cosmovisor`之前手动运行迁移。因此，我们建议应用程序采用原地存储迁移。*

*注意：如果验证人想要启用自动下载选项（我们不建议这样做），并且他们当前正在运行使用Cosmos SDK `v0.42`的应用程序，则需要使用Cosmovisor [`v0.1`](https://github.com/cosmos/cosmos-sdk/releases/tag/cosmovisor%2Fv0.1.0)。如果启用了自动下载选项，较新版本的Cosmovisor不支持Cosmos SDK `v0.44.3`或更早的版本。

## 贡献

Cosmovisor是Cosmos SDK monorepo的一部分，但它是一个独立的模块，有自己的发布计划。

发布分支的格式为`release/cosmovisor/vA.B.x`，其中A和B是一个数字（例如`release/cosmovisor/v1.3.x`）。发布使用以下格式进行标记：`cosmovisor/vA.B.C`。

## 设置

### 安装

您可以从[GitHub发布页面](https://github.com/cosmos/cosmos-sdk/releases/tag/cosmovisor%2Fv1.3.0)下载Cosmovisor。

要安装最新版本的`cosmovisor`，请运行以下命令：

```shell
go install cosmossdk.io/tools/cosmovisor/cmd/cosmovisor@latest
```

要安装先前的版本，您可以指定版本。重要提示：使用Cosmos SDK v0.44.3或更早版本（例如v0.44.2）并希望使用自动下载功能的链必须使用`cosmovisor v0.1.0`

```shell
go install github.com/cosmos/cosmos-sdk/cosmovisor/cmd/cosmovisor@v0.1.0
```

运行`cosmovisor version`以检查cosmovisor版本。

另外，要从源代码构建，只需运行`make cosmovisor`。二进制文件将位于`tools/cosmovisor`目录中。

:::warning
使用`make cosmovisor`从源代码构建不会显示正确的`cosmovisor`版本。
:::

### 命令行参数和环境变量

传递给`cosmovisor`的第一个参数是`cosmovisor`要执行的操作。选项包括：

* `help`、`--help`或`-h` - 输出`cosmovisor`的帮助信息并检查您的`cosmovisor`配置。
* `run` - 使用提供的其余参数运行配置的二进制文件。
* `version` - 输出`cosmovisor`的版本，并使用`version`参数运行二进制文件。

传递给`cosmovisor run`的所有参数都将传递给应用程序二进制文件（作为子进程）。`cosmovisor`将返回子进程的`/dev/stdout`和`/dev/stderr`作为自己的输出。因此，`cosmovisor run`不能接受除应用程序二进制文件可用参数之外的任何命令行参数。

*注意：不带任何操作参数使用`cosmovisor`已被弃用。为了向后兼容，如果第一个参数不是操作参数，则默认为`run`。然而，这种回退可能会在将来的版本中被删除，因此建议您始终提供`run`。

`cosmovisor` 从环境变量中读取其配置：

* `DAEMON_HOME` 是 `cosmovisor/` 目录所在的位置，该目录包含创世二进制文件、升级二进制文件以及与每个二进制文件相关的任何附加辅助文件（例如 `$HOME/.gaiad`、`$HOME/.regend`、`$HOME/.simd` 等）。
* `DAEMON_NAME` 是二进制文件本身的名称（例如 `gaiad`、`regend`、`simd` 等）。
* `DAEMON_ALLOW_DOWNLOAD_BINARIES`（*可选*），如果设置为 `true`，将启用自动下载新的二进制文件（出于安全原因，此选项仅适用于全节点而不是验证节点）。默认情况下，`cosmovisor` 不会自动下载新的二进制文件。
* `DAEMON_RESTART_AFTER_UPGRADE`（*可选*，默认值为 `true`），如果为 `true`，在成功升级后，使用相同的命令行参数和标志（但使用新的二进制文件）重新启动子进程。否则（`false`），`cosmovisor` 在升级后停止运行，并需要系统管理员手动重新启动它。请注意，重新启动仅在升级后进行，不会在发生错误后自动重新启动子进程。
* `DAEMON_RESTART_DELAY`（*可选*，默认值为无），允许节点操作员定义节点停止（用于升级）和备份之间的延迟时间。该值必须是一个持续时间（例如 `1s`）。
* `DAEMON_POLL_INTERVAL`（*可选*，默认值为 300 毫秒），是轮询升级计划文件的间隔长度。该值必须是一个持续时间（例如 `1s`）。
* `DAEMON_DATA_BACKUP_DIR` 选项用于设置自定义备份目录。如果未设置，将使用 `DAEMON_HOME`。
* `UNSAFE_SKIP_BACKUP`（默认为 `false`），如果设置为 `true`，将在执行升级之前直接进行升级，而不进行备份。否则（`false`，默认值），在尝试升级之前备份数据。在发生故障和需要回滚时，建议使用默认的备份选项 `UNSAFE_SKIP_BACKUP=false`。
* `DAEMON_PREUPGRADE_MAX_RETRIES`（默认为 `0`）。在应用程序退出状态为 `31` 后，调用 `pre-upgrade` 的最大次数。达到最大重试次数后，Cosmovisor 将升级失败。
* `COSMOVISOR_DISABLE_LOGS`（默认为 `false`）。如果设置为 true，将完全禁用 Cosmovisor 日志（但不会禁用底层进程）。这在执行的 Cosmovisor 子命令返回有效的 JSON 并进行解析时可能很有用，因为 Cosmovisor 添加的日志会使输出不是有效的 JSON。

### 文件夹布局

`$DAEMON_HOME/cosmovisor` 应完全属于 `cosmovisor` 及其控制的子进程。文件夹内容的组织如下：

```text
.
├── current -> genesis or upgrades/<name>
├── genesis
│   └── bin
│       └── $DAEMON_NAME
└── upgrades
    └── <name>
        ├── bin
        │   └── $DAEMON_NAME
        └── upgrade-info.json
```

`cosmovisor/` 目录包含了每个应用程序版本的子目录（例如 `genesis` 或 `upgrades/<name>`）。在每个子目录中，都包含了应用程序的二进制文件（例如 `bin/$DAEMON_NAME`）以及与每个二进制文件相关的其他辅助文件。`current` 是一个符号链接，指向当前活动的目录（即 `genesis` 或 `upgrades/<name>`）。`upgrades/<name>` 中的 `name` 变量是升级模块计划中指定的升级的小写 URI 编码名称。请注意，升级名称路径被规范化为小写：例如，`MyUpgrade` 被规范化为 `myupgrade`，其路径为 `upgrades/myupgrade`。

请注意，`$DAEMON_HOME/cosmovisor` 仅存储*应用程序二进制文件*。`cosmovisor` 二进制文件本身可以存储在任何典型位置（例如 `/usr/local/bin`）。应用程序将继续将其数据存储在默认数据目录（例如 `$HOME/.gaiad`）或使用 `--home` 标志指定的数据目录中。`$DAEMON_HOME` 独立于数据目录，可以设置为任何位置。如果将 `$DAEMON_HOME` 设置为与数据目录相同的目录，则会得到以下配置：

```text
.gaiad
├── config
├── data
└── cosmovisor
```

## 使用方法

系统管理员负责：

* 安装 `cosmovisor` 二进制文件
* 配置主机的初始化系统（例如 `systemd`、`launchd` 等）
* 适当设置环境变量
* 创建 `<DAEMON_HOME>/cosmovisor` 目录
* 创建 `<DAEMON_HOME>/cosmovisor/genesis/bin` 文件夹
* 创建 `<DAEMON_HOME>/cosmovisor/upgrades/<name>/bin` 文件夹
* 将不同版本的 `<DAEMON_NAME>` 可执行文件放置在相应的 `bin` 文件夹中。

`cosmovisor` 将在首次启动时（即当不存在 `current` 链接时）将 `current` 链接设置为指向 `genesis`，然后在正确的时间点处理切换二进制文件，以便系统管理员可以提前准备并在升级时放松。

为了支持可下载的二进制文件，每个升级二进制文件都需要打包并通过一个规范的URL提供。此外，可以打包一个包含创世二进制文件和所有可用升级二进制文件的tarball，并提供下载，以便可以轻松地下载所有必要的二进制文件来同步一个完整节点。

`DAEMON` 特定的代码和操作（例如 cometBFT 配置、应用程序数据库、同步区块等）都按预期工作。应用程序二进制文件的指令，如命令行标志和环境变量，也按预期工作。

### 初始化

`cosmovisor init <可执行文件路径>` 命令会创建使用 cosmovisor 所需的文件夹结构。

它会执行以下操作：

* 如果尚不存在，创建 `<DAEMON_HOME>/cosmovisor` 文件夹
* 如果尚不存在，创建 `<DAEMON_HOME>/cosmovisor/genesis/bin` 文件夹
* 将提供的可执行文件复制到 `<DAEMON_HOME>/cosmovisor/genesis/bin/<DAEMON_NAME>`
* 创建指向 `genesis` 文件夹的 `current` 链接

它使用 `DAEMON_HOME` 和 `DAEMON_NAME` 环境变量来确定文件夹位置和可执行文件名。

`cosmovisor init` 命令专门用于初始化 cosmovisor，不应与链的 `init` 命令（例如 `cosmovisor run init`）混淆。

### 检测升级

`cosmovisor` 会轮询 `$DAEMON_HOME/data/upgrade-info.json` 文件以获取新的升级指令。当检测到升级并且区块链达到升级高度时，`x/upgrade` 模块会在 `BeginBlocker` 中创建该文件。
以下启发式规则用于检测升级：

* 在启动时，`cosmovisor` 对当前运行的升级了解不多，只知道 `current/bin/` 中的二进制文件。它尝试读取 `current/update-info.json` 文件以获取有关当前升级名称的信息。
* 如果既不存在 `cosmovisor/current/upgrade-info.json`，也不存在 `data/upgrade-info.json`，那么 `cosmovisor` 将等待 `data/upgrade-info.json` 文件触发升级。
* 如果 `cosmovisor/current/upgrade-info.json` 不存在，但 `data/upgrade-info.json` 存在，那么 `cosmovisor` 假设 `data/upgrade-info.json` 中的内容是一个有效的升级请求。在这种情况下，`cosmovisor` 会立即根据 `data/upgrade-info.json` 中的 `name` 属性进行升级。
* 否则，`cosmovisor` 将等待 `upgrade-info.json` 的更改。一旦文件中记录了新的升级名称，`cosmovisor` 将触发升级机制。

当触发升级机制时，`cosmovisor` 将执行以下操作：

1. 如果启用了 `DAEMON_ALLOW_DOWNLOAD_BINARIES`，则首先自动下载一个新的二进制文件到 `cosmovisor/<name>/bin` 目录中（其中 `<name>` 是 `upgrade-info.json:name` 属性）；
2. 更新 `current` 符号链接，使其指向新的目录，并将 `data/upgrade-info.json` 保存到 `cosmovisor/current/upgrade-info.json`。

### 自动下载

通常情况下，`cosmovisor` 要求系统管理员在升级之前将所有相关的二进制文件放置在磁盘上。然而，对于不需要这种控制并希望进行自动设置的用户（可能正在同步非验证全节点并希望进行少量维护），还有另一种选择。

**注意：我们不建议使用自动下载**，因为它不会提前验证二进制文件是否可用。如果下载二进制文件时出现任何问题，cosmovisor 将停止并不会重新启动应用程序（这可能导致链停止）。

如果 `DAEMON_ALLOW_DOWNLOAD_BINARIES` 设置为 `true`，并且在触发升级时找不到本地二进制文件，`cosmovisor` 将尝试根据 `data/upgrade-info.json` 文件中 `info` 属性中的指令自行下载和安装二进制文件。该文件由 x/upgrade 模块构建，并包含来自升级 `Plan` 对象的数据。`Plan` 对象具有一个 info 字段，该字段应具有以下两种有效格式之一来指定下载：

1. 在升级计划的 info 字段中以 JSON 格式存储一个操作系统/架构 -> 二进制文件 URI 的映射，存储在 `"binaries"` 键下。例如：

    ```json
    {
      "binaries": {
        "linux/amd64":"https://example.com/gaia.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f"
      }
    }
    ```

    You can include multiple binaries at once to ensure more than one environment will receive the correct binaries:

    ```json
    {
      "binaries": {
        "linux/amd64":"https://example.com/gaia.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
        "linux/arm64":"https://example.com/gaia.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
        "darwin/amd64":"https://example.com/gaia.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f"
        }
    }
    ```

    When submitting this as a proposal ensure there are no spaces. An example command using `gaiad` could look like:

    ```shell
    > gaiad tx upgrade software-upgrade Vega \
    --title Vega \
    --deposit 100uatom \
    --upgrade-height 7368420 \
    --upgrade-info '{"binaries":{"linux/amd64":"https://github.com/cosmos/gaia/releases/download/v6.0.0-rc1/gaiad-v6.0.0-rc1-linux-amd64","linux/arm64":"https://github.com/cosmos/gaia/releases/download/v6.0.0-rc1/gaiad-v6.0.0-rc1-linux-arm64","darwin/amd64":"https://github.com/cosmos/gaia/releases/download/v6.0.0-rc1/gaiad-v6.0.0-rc1-darwin-amd64"}}' \
    --summary "upgrade to Vega" \
    --gas 400000 \
    --from user \
    --chain-id test \
    --home test/val2 \
    --node tcp://localhost:36657 \
    --yes
    ```

2. Store a link to a file that contains all information in the above format (e.g. if you want to specify lots of binaries, changelog info, etc. without filling up the blockchain). For example:

    ```text
    https://example.com/testnet-1001-info.json?checksum=sha256:deaaa99fda9407c4dbe1d04bd49bab0cc3c1dd76fa392cd55a9425be074af01e
    ```

When `cosmovisor` is triggered to download the new binary, `cosmovisor` will parse the `"binaries"` field, download the new binary with [go-getter](https://github.com/hashicorp/go-getter), and unpack the new binary in the `upgrades/<name>` folder so that it can be run as if it was installed manually.

Note that for this mechanism to provide strong security guarantees, all URLs should include a SHA 256/512 checksum. This ensures that no false binary is run, even if someone hacks the server or hijacks the DNS. `go-getter` will always ensure the downloaded file matches the checksum if it is provided. `go-getter` will also handle unpacking archives into directories (in this case the download link should point to a `zip` file of all data in the `bin` directory).

To properly create a sha256 checksum on linux, you can use the `sha256sum` utility. For example:

```shell
sha256sum ./testdata/repo/zip_directory/autod.zip
```

The result will look something like the following: `29139e1381b8177aec909fab9a75d11381cab5adf7d3af0c05ff1c9c117743a7`.

You can also use `sha512sum` if you would prefer to use longer hashes, or `md5sum` if you would prefer to use broken hashes. Whichever you choose, make sure to set the hash algorithm properly in the checksum argument to the URL.

## Example: SimApp Upgrade

The following instructions provide a demonstration of `cosmovisor` using the simulation application (`simapp`) shipped with the Cosmos SDK's source code. The following commands are to be run from within the `cosmos-sdk` repository.

### Chain Setup

Let's create a new chain using the `v0.44` version of simapp (the Cosmos SDK demo app):

```shell
git checkout v0.44.6
make build
```

Clean `~/.simapp` (never do this in a production environment):

```shell
./build/simd unsafe-reset-all
```

Set up app config:

```shell
./build/simd config set client chain-id test
./build/simd config set client keyring-backend test
./build/simd config set client broadcast-mode sync
```

Initialize the node and overwrite any previous genesis file (never do this in a production environment):

<!-- TODO: init does not read chain-id from config -->

```shell
./build/simd init test --chain-id test --overwrite
```

Set the minimum gas price to `0stake` in `~/.simapp/config/app.toml`:

```shell
minimum-gas-prices = "0stake"
```

For the sake of this demonstration, amend `voting_period` in `genesis.json` to a reduced time of 20 seconds (`20s`):

```shell
cat <<< $(jq '.app_state.gov.voting_params.voting_period = "20s"' $HOME/.simapp/config/genesis.json) > $HOME/.simapp/config/genesis.json
```

Create a validator, and setup genesis transaction:

```shell
./build/simd keys add validator
./build/simd genesis add-genesis-account validator 1000000000stake --keyring-backend test
./build/simd genesis gentx validator 1000000stake --chain-id test
./build/simd genesis collect-gentxs
```

#### Prepare Cosmovisor and Start the Chain

Set the required environment variables:

```shell
export DAEMON_NAME=simd
export DAEMON_HOME=$HOME/.simapp
```

Set the optional environment variable to trigger an automatic app restart:

```shell
export DAEMON_RESTART_AFTER_UPGRADE=true
```

Create the folder for the genesis binary and copy the `simd` binary:

```shell
mkdir -p $DAEMON_HOME/cosmovisor/genesis/bin
cp ./build/simd $DAEMON_HOME/cosmovisor/genesis/bin
```

Now you can run cosmovisor with simapp v0.44:

```shell
cosmovisor run start
```

#### Update App

Update app to the latest version (e.g. v0.45).

Next, we can add a migration - which is defined using `x/upgrade` [upgrade plan](https://github.com/cosmos/cosmos-sdk/blob/main/docs/advanced-concepts/13-upgrade.md) (you may refer to a past version if you are using an older Cosmos SDK release). In a migration we can do any deterministic state change.

Build the new version `simd` binary:

```shell
make build
```

Create the folder for the upgrade binary and copy the `simd` binary:

```shell
mkdir -p $DAEMON_HOME/cosmovisor/upgrades/test1/bin
cp ./build/simd $DAEMON_HOME/cosmovisor/upgrades/test1/bin
```

Open a new terminal window and submit an upgrade proposal along with a deposit and a vote (these commands must be run within 20 seconds of each other):

**<= v0.45**:

```shell
./build/simd tx gov submit-proposal software-upgrade test1 --title upgrade --description upgrade --upgrade-height 200 --from validator --yes
./build/simd tx gov deposit 1 10000000stake --from validator --yes
./build/simd tx gov vote 1 yes --from validator --yes
```

**v0.46, v0.47**:

```shell
./build/simd tx gov submit-legacy-proposal software-upgrade test1 --title upgrade --description upgrade --upgrade-height 200 --from validator --yes
./build/simd tx gov deposit 1 10000000stake --from validator --yes
./build/simd tx gov vote 1 yes --from validator --yes
```

**>= v0.48+**:

```shell
./build/simd tx upgrade software-upgrade test1 --title upgrade --summary upgrade --upgrade-height 200 --from validator --yes
./build/simd tx gov deposit 1 10000000stake --from validator --yes
./build/simd tx gov vote 1 yes --from validator --yes
```

升级将在高度200自动发生。注意：如果您的测试播放时间更长，可能需要在上面的代码片段中更改升级高度。




# Cosmovisor

`cosmovisor` is a small process manager for Cosmos SDK application binaries that monitors the governance module for incoming chain upgrade proposals. If it sees a proposal that gets approved, `cosmovisor` can automatically download the new binary, stop the current binary, switch from the old binary to the new one, and finally restart the node with the new binary.

* [Design](#design)
* [Contributing](#contributing)
* [Setup](#setup)
    * [Installation](#installation)
    * [Command Line Arguments And Environment Variables](#command-line-arguments-and-environment-variables)
    * [Folder Layout](#folder-layout)
* [Usage](#usage)
    * [Initialization](#initialization)
    * [Detecting Upgrades](#detecting-upgrades)
    * [Auto-Download](#auto-download)
* [Example: SimApp Upgrade](#example-simapp-upgrade)
    * [Chain Setup](#chain-setup)
        * [Prepare Cosmovisor and Start the Chain](#prepare-cosmovisor-and-start-the-chain)
        * [Update App](#update-app)

## Design

Cosmovisor is designed to be used as a wrapper for a `Cosmos SDK` app:

* it will pass arguments to the associated app (configured by `DAEMON_NAME` env variable).
  Running `cosmovisor run arg1 arg2 ....` will run `app arg1 arg2 ...`;
* it will manage an app by restarting and upgrading if needed;
* it is configured using environment variables, not positional arguments.

*Note: If new versions of the application are not set up to run in-place store migrations, migrations will need to be run manually before restarting `cosmovisor` with the new binary. For this reason, we recommend applications adopt in-place store migrations.*

*Note: If validators would like to enable the auto-download option (which [we don't recommend](#auto-download)), and they are currently running an application using Cosmos SDK `v0.42`, they will need to use Cosmovisor [`v0.1`](https://github.com/cosmos/cosmos-sdk/releases/tag/cosmovisor%2Fv0.1.0). Later versions of Cosmovisor do not support Cosmos SDK `v0.44.3` or earlier if the auto-download option is enabled.*

## Contributing

Cosmovisor is part of the Cosmos SDK monorepo, but it's a separate module with it's own release schedule.

Release branches have the following format `release/cosmovisor/vA.B.x`, where A and B are a number (e.g. `release/cosmovisor/v1.3.x`). Releases are tagged using the following format: `cosmovisor/vA.B.C`.

## Setup

### Installation

You can download Cosmovisor from the [GitHub releases](https://github.com/cosmos/cosmos-sdk/releases/tag/cosmovisor%2Fv1.3.0).

To install the latest version of `cosmovisor`, run the following command:

```shell
go install cosmossdk.io/tools/cosmovisor/cmd/cosmovisor@latest
```

To install a previous version, you can specify the version. IMPORTANT: Chains that use Cosmos SDK v0.44.3 or earlier (eg v0.44.2) and want to use auto-download feature MUST use `cosmovisor v0.1.0`

```shell
go install github.com/cosmos/cosmos-sdk/cosmovisor/cmd/cosmovisor@v0.1.0
```

Run `cosmovisor version` to check the cosmovisor version.

Alternatively, for building from source, simply run `make cosmovisor`. The binary will be located in `tools/cosmovisor`.

:::warning
Building from source using `make cosmovisor` won't display the correct `cosmovisor` version.
:::

### Command Line Arguments And Environment Variables

The first argument passed to `cosmovisor` is the action for `cosmovisor` to take. Options are:

* `help`, `--help`, or `-h` - Output `cosmovisor` help information and check your `cosmovisor` configuration.
* `run` - Run the configured binary using the rest of the provided arguments.
* `version` - Output the `cosmovisor` version and also run the binary with the `version` argument.

All arguments passed to `cosmovisor run` will be passed to the application binary (as a subprocess). `cosmovisor` will return `/dev/stdout` and `/dev/stderr` of the subprocess as its own. For this reason, `cosmovisor run` cannot accept any command-line arguments other than those available to the application binary.

*Note: Use of `cosmovisor` without one of the action arguments is deprecated. For backwards compatibility, if the first argument is not an action argument, `run` is assumed. However, this fallback might be removed in future versions, so it is recommended that you always provide `run`.

`cosmovisor` reads its configuration from environment variables:

* `DAEMON_HOME` is the location where the `cosmovisor/` directory is kept that contains the genesis binary, the upgrade binaries, and any additional auxiliary files associated with each binary (e.g. `$HOME/.gaiad`, `$HOME/.regend`, `$HOME/.simd`, etc.).
* `DAEMON_NAME` is the name of the binary itself (e.g. `gaiad`, `regend`, `simd`, etc.).
* `DAEMON_ALLOW_DOWNLOAD_BINARIES` (*optional*), if set to `true`, will enable auto-downloading of new binaries (for security reasons, this is intended for full nodes rather than validators). By default, `cosmovisor` will not auto-download new binaries.
* `DAEMON_RESTART_AFTER_UPGRADE` (*optional*, default = `true`), if `true`, restarts the subprocess with the same command-line arguments and flags (but with the new binary) after a successful upgrade. Otherwise (`false`), `cosmovisor` stops running after an upgrade and requires the system administrator to manually restart it. Note restart is only after the upgrade and does not auto-restart the subprocess after an error occurs.
* `DAEMON_RESTART_DELAY` (*optional*, default none), allow a node operator to define a delay between the node halt (for upgrade) and backup by the specified time. The value must be a duration (e.g. `1s`).
* `DAEMON_POLL_INTERVAL` (*optional*, default 300 milliseconds), is the interval length for polling the upgrade plan file. The value must be a duration (e.g. `1s`).
* `DAEMON_DATA_BACKUP_DIR` option to set a custom backup directory. If not set, `DAEMON_HOME` is used.
* `UNSAFE_SKIP_BACKUP` (defaults to `false`), if set to `true`, upgrades directly without performing a backup. Otherwise (`false`, default) backs up the data before trying the upgrade. The default value of false is useful and recommended in case of failures and when a backup needed to rollback. We recommend using the default backup option `UNSAFE_SKIP_BACKUP=false`.
* `DAEMON_PREUPGRADE_MAX_RETRIES` (defaults to `0`). The maximum number of times to call `pre-upgrade` in the application after exit status of `31`. After the maximum number of retries, Cosmovisor fails the upgrade.
* `COSMOVISOR_DISABLE_LOGS` (defaults to `false`). If set to true, this will disable Cosmovisor logs (but not the underlying process) completely. This may be useful, for example, when a Cosmovisor subcommand you are executing returns a valid JSON you are then parsing, as logs added by Cosmovisor make this output not a valid JSON.

### Folder Layout

`$DAEMON_HOME/cosmovisor` is expected to belong completely to `cosmovisor` and the subprocesses that are controlled by it. The folder content is organized as follows:

```text
.
├── current -> genesis or upgrades/<name>
├── genesis
│   └── bin
│       └── $DAEMON_NAME
└── upgrades
    └── <name>
        ├── bin
        │   └── $DAEMON_NAME
        └── upgrade-info.json
```

The `cosmovisor/` directory incudes a subdirectory for each version of the application (i.e. `genesis` or `upgrades/<name>`). Within each subdirectory is the application binary (i.e. `bin/$DAEMON_NAME`) and any additional auxiliary files associated with each binary. `current` is a symbolic link to the currently active directory (i.e. `genesis` or `upgrades/<name>`). The `name` variable in `upgrades/<name>` is the lowercased URI-encoded name of the upgrade as specified in the upgrade module plan. Note that the upgrade name path are normalized to be lowercased: for instance, `MyUpgrade` is normalized to `myupgrade`, and its path is `upgrades/myupgrade`.

Please note that `$DAEMON_HOME/cosmovisor` only stores the *application binaries*. The `cosmovisor` binary itself can be stored in any typical location (e.g. `/usr/local/bin`). The application will continue to store its data in the default data directory (e.g. `$HOME/.gaiad`) or the data directory specified with the `--home` flag. `$DAEMON_HOME` is independent of the data directory and can be set to any location. If you set `$DAEMON_HOME` to the same directory as the data directory, you will end up with a configuation like the following:

```text
.gaiad
├── config
├── data
└── cosmovisor
```

## Usage

The system administrator is responsible for:

* installing the `cosmovisor` binary
* configuring the host's init system (e.g. `systemd`, `launchd`, etc.)
* appropriately setting the environmental variables
* creating the `<DAEMON_HOME>/cosmovisor` directory
* creating the `<DAEMON_HOME>/cosmovisor/genesis/bin` folder
* creating the `<DAEMON_HOME>/cosmovisor/upgrades/<name>/bin` folders
* placing the different versions of the `<DAEMON_NAME>` executable in the appropriate `bin` folders.

`cosmovisor` will set the `current` link to point to `genesis` at first start (i.e. when no `current` link exists) and then handle switching binaries at the correct points in time so that the system administrator can prepare days in advance and relax at upgrade time.

In order to support downloadable binaries, a tarball for each upgrade binary will need to be packaged up and made available through a canonical URL. Additionally, a tarball that includes the genesis binary and all available upgrade binaries can be packaged up and made available so that all the necessary binaries required to sync a fullnode from start can be easily downloaded.

The `DAEMON` specific code and operations (e.g. cometBFT config, the application db, syncing blocks, etc.) all work as expected. The application binaries' directives such as command-line flags and environment variables also work as expected.

### Initialization

The `cosmovisor init <path to executable>` command creates the folder structure required for using cosmovisor.

It does the following:

* creates the `<DAEMON_HOME>/cosmovisor` folder if it doesn't yet exist
* creates the `<DAEMON_HOME>/cosmovisor/genesis/bin` folder if it doesn't yet exist
* copies the provided executable file to `<DAEMON_HOME>/cosmovisor/genesis/bin/<DAEMON_NAME>`
* creates the `current` link, pointing to the `genesis` folder

It uses the `DAEMON_HOME` and `DAEMON_NAME` environment variables for folder location and executable name.

The `cosmovisor init` command is specifically for initializing cosmovisor, and should not be confused with a chain's `init` command (e.g. `cosmovisor run init`).

### Detecting Upgrades

`cosmovisor` is polling the `$DAEMON_HOME/data/upgrade-info.json` file for new upgrade instructions. The file is created by the x/upgrade module in `BeginBlocker` when an upgrade is detected and the blockchain reaches the upgrade height.
The following heuristic is applied to detect the upgrade:

* When starting, `cosmovisor` doesn't know much about currently running upgrade, except the binary which is `current/bin/`. It tries to read the `current/update-info.json` file to get information about the current upgrade name.
* If neither `cosmovisor/current/upgrade-info.json` nor `data/upgrade-info.json` exist, then `cosmovisor` will wait for `data/upgrade-info.json` file to trigger an upgrade.
* If `cosmovisor/current/upgrade-info.json` doesn't exist but `data/upgrade-info.json` exists, then `cosmovisor` assumes that whatever is in `data/upgrade-info.json` is a valid upgrade request. In this case `cosmovisor` tries immediately to make an upgrade according to the `name` attribute in `data/upgrade-info.json`.
* Otherwise, `cosmovisor` waits for changes in `upgrade-info.json`. As soon as a new upgrade name is recorded in the file, `cosmovisor` will trigger an upgrade mechanism.

When the upgrade mechanism is triggered, `cosmovisor` will:

1. if `DAEMON_ALLOW_DOWNLOAD_BINARIES` is enabled, start by auto-downloading a new binary into `cosmovisor/<name>/bin` (where `<name>` is the `upgrade-info.json:name` attribute);
2. update the `current` symbolic link to point to the new directory and save `data/upgrade-info.json` to `cosmovisor/current/upgrade-info.json`.

### Auto-Download

Generally, `cosmovisor` requires that the system administrator place all relevant binaries on disk before the upgrade happens. However, for people who don't need such control and want an automated setup (maybe they are syncing a non-validating fullnode and want to do little maintenance), there is another option.

**NOTE: we don't recommend using auto-download** because it doesn't verify in advance if a binary is available. If there will be any issue with downloading a binary, the cosmovisor will stop and won't restart an App (which could lead to a chain halt).

If `DAEMON_ALLOW_DOWNLOAD_BINARIES` is set to `true`, and no local binary can be found when an upgrade is triggered, `cosmovisor` will attempt to download and install the binary itself based on the instructions in the `info` attribute in the `data/upgrade-info.json` file. The files is constructed by the x/upgrade module and contains data from the upgrade `Plan` object. The `Plan` has an info field that is expected to have one of the following two valid formats to specify a download:

1. Store an os/architecture -> binary URI map in the upgrade plan info field as JSON under the `"binaries"` key. For example:

    ```json
    {
      "binaries": {
        "linux/amd64":"https://example.com/gaia.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f"
      }
    }
    ```

    You can include multiple binaries at once to ensure more than one environment will receive the correct binaries:

    ```json
    {
      "binaries": {
        "linux/amd64":"https://example.com/gaia.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
        "linux/arm64":"https://example.com/gaia.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
        "darwin/amd64":"https://example.com/gaia.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f"
        }
    }
    ```

    When submitting this as a proposal ensure there are no spaces. An example command using `gaiad` could look like:

    ```shell
    > gaiad tx upgrade software-upgrade Vega \
    --title Vega \
    --deposit 100uatom \
    --upgrade-height 7368420 \
    --upgrade-info '{"binaries":{"linux/amd64":"https://github.com/cosmos/gaia/releases/download/v6.0.0-rc1/gaiad-v6.0.0-rc1-linux-amd64","linux/arm64":"https://github.com/cosmos/gaia/releases/download/v6.0.0-rc1/gaiad-v6.0.0-rc1-linux-arm64","darwin/amd64":"https://github.com/cosmos/gaia/releases/download/v6.0.0-rc1/gaiad-v6.0.0-rc1-darwin-amd64"}}' \
    --summary "upgrade to Vega" \
    --gas 400000 \
    --from user \
    --chain-id test \
    --home test/val2 \
    --node tcp://localhost:36657 \
    --yes
    ```

2. Store a link to a file that contains all information in the above format (e.g. if you want to specify lots of binaries, changelog info, etc. without filling up the blockchain). For example:

    ```text
    https://example.com/testnet-1001-info.json?checksum=sha256:deaaa99fda9407c4dbe1d04bd49bab0cc3c1dd76fa392cd55a9425be074af01e
    ```

When `cosmovisor` is triggered to download the new binary, `cosmovisor` will parse the `"binaries"` field, download the new binary with [go-getter](https://github.com/hashicorp/go-getter), and unpack the new binary in the `upgrades/<name>` folder so that it can be run as if it was installed manually.

Note that for this mechanism to provide strong security guarantees, all URLs should include a SHA 256/512 checksum. This ensures that no false binary is run, even if someone hacks the server or hijacks the DNS. `go-getter` will always ensure the downloaded file matches the checksum if it is provided. `go-getter` will also handle unpacking archives into directories (in this case the download link should point to a `zip` file of all data in the `bin` directory).

To properly create a sha256 checksum on linux, you can use the `sha256sum` utility. For example:

```shell
sha256sum ./testdata/repo/zip_directory/autod.zip
```

The result will look something like the following: `29139e1381b8177aec909fab9a75d11381cab5adf7d3af0c05ff1c9c117743a7`.

You can also use `sha512sum` if you would prefer to use longer hashes, or `md5sum` if you would prefer to use broken hashes. Whichever you choose, make sure to set the hash algorithm properly in the checksum argument to the URL.

## Example: SimApp Upgrade

The following instructions provide a demonstration of `cosmovisor` using the simulation application (`simapp`) shipped with the Cosmos SDK's source code. The following commands are to be run from within the `cosmos-sdk` repository.

### Chain Setup

Let's create a new chain using the `v0.44` version of simapp (the Cosmos SDK demo app):

```shell
git checkout v0.44.6
make build
```

Clean `~/.simapp` (never do this in a production environment):

```shell
./build/simd unsafe-reset-all
```

Set up app config:

```shell
./build/simd config set client chain-id test
./build/simd config set client keyring-backend test
./build/simd config set client broadcast-mode sync
```

Initialize the node and overwrite any previous genesis file (never do this in a production environment):

<!-- TODO: init does not read chain-id from config -->

```shell
./build/simd init test --chain-id test --overwrite
```

Set the minimum gas price to `0stake` in `~/.simapp/config/app.toml`:

```shell
minimum-gas-prices = "0stake"
```

For the sake of this demonstration, amend `voting_period` in `genesis.json` to a reduced time of 20 seconds (`20s`):

```shell
cat <<< $(jq '.app_state.gov.voting_params.voting_period = "20s"' $HOME/.simapp/config/genesis.json) > $HOME/.simapp/config/genesis.json
```

Create a validator, and setup genesis transaction:

```shell
./build/simd keys add validator
./build/simd genesis add-genesis-account validator 1000000000stake --keyring-backend test
./build/simd genesis gentx validator 1000000stake --chain-id test
./build/simd genesis collect-gentxs
```

#### Prepare Cosmovisor and Start the Chain

Set the required environment variables:

```shell
export DAEMON_NAME=simd
export DAEMON_HOME=$HOME/.simapp
```

Set the optional environment variable to trigger an automatic app restart:

```shell
export DAEMON_RESTART_AFTER_UPGRADE=true
```

Create the folder for the genesis binary and copy the `simd` binary:

```shell
mkdir -p $DAEMON_HOME/cosmovisor/genesis/bin
cp ./build/simd $DAEMON_HOME/cosmovisor/genesis/bin
```

Now you can run cosmovisor with simapp v0.44:

```shell
cosmovisor run start
```

#### Update App

Update app to the latest version (e.g. v0.45).

Next, we can add a migration - which is defined using `x/upgrade` [upgrade plan](https://github.com/cosmos/cosmos-sdk/blob/main/docs/advanced-concepts/13-upgrade.md) (you may refer to a past version if you are using an older Cosmos SDK release). In a migration we can do any deterministic state change.

Build the new version `simd` binary:

```shell
make build
```

Create the folder for the upgrade binary and copy the `simd` binary:

```shell
mkdir -p $DAEMON_HOME/cosmovisor/upgrades/test1/bin
cp ./build/simd $DAEMON_HOME/cosmovisor/upgrades/test1/bin
```

Open a new terminal window and submit an upgrade proposal along with a deposit and a vote (these commands must be run within 20 seconds of each other):

**<= v0.45**:

```shell
./build/simd tx gov submit-proposal software-upgrade test1 --title upgrade --description upgrade --upgrade-height 200 --from validator --yes
./build/simd tx gov deposit 1 10000000stake --from validator --yes
./build/simd tx gov vote 1 yes --from validator --yes
```

**v0.46, v0.47**:

```shell
./build/simd tx gov submit-legacy-proposal software-upgrade test1 --title upgrade --description upgrade --upgrade-height 200 --from validator --yes
./build/simd tx gov deposit 1 10000000stake --from validator --yes
./build/simd tx gov vote 1 yes --from validator --yes
```

**>= v0.48+**:

```shell
./build/simd tx upgrade software-upgrade test1 --title upgrade --summary upgrade --upgrade-height 200 --from validator --yes
./build/simd tx gov deposit 1 10000000stake --from validator --yes
./build/simd tx gov vote 1 yes --from validator --yes
```

The upgrade will occur automatically at height 200. Note: you may need to change the upgrade height in the snippet above if your test play takes more time.
