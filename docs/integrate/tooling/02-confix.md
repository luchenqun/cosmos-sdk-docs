# Confix

`Confix` 是一个配置管理工具，允许您通过命令行界面管理配置。

它基于 [CometBFT RFC 019](https://github.com/cometbft/cometbft/blob/5013bc3f4a6d64dcc2bf02ccc002ebc9881c62e4/docs/rfc/rfc-019-config-version.md)。

## 安装

### 添加配置命令

要添加 confix 工具，需要将 `ConfigCommand` 添加到应用程序的根命令文件中（例如 `simd/cmd/root.go`）。

导入 `confixCmd` 包：

```go
import "cosmossdk.io/tools/confix/cmd"
```

找到以下行：

```go
initRootCmd(rootCmd, encodingConfig)
```

在该行之后添加以下内容：

```go
rootCmd.AddCommand(
    confixcmd.ConfigCommand(),
)
```

`ConfixCommand` 函数构建了 `config` 根命令，并在 `confixCmd` 包（`cosmossdk.io/tools/confix/cmd`）中定义。
在 `simapp` 中可以找到一个实现示例。

该命令将作为 `simd config` 可用。

### 使用独立的 Confix

要在应用程序中不添加 Confix 的情况下使用独立的 Confix，请使用以下命令进行安装：

```bash
go install cosmossdk.io/tools/confix/cmd/confix@latest
```

:::warning
目前，由于 Confix go.mod 中的替换指令，无法使用 `go install`。
需要从源代码构建或导入到应用程序中，直到该替换指令被移除为止。
:::

或者，要从源代码构建，请简单运行 `make confix`。二进制文件将位于 `tools/confix`。

## 用法

独立使用：

```shell
confix --help
```

在 simd 中使用：

```shell
simd config fix --help
```

### 获取

获取配置值，例如：

```shell
simd config get app pruning # 从 app.toml 获取 pruning 的值
simd config get client chain-id # 从 client.toml 获取 chain-id 的值
```

```shell
confix get ~/.simapp/config/app.toml pruning # 从 app.toml 获取 pruning 的值
confix get ~/.simapp/config/client.toml chain-id # 从 client.toml 获取 chain-id 的值
```

### 设置

设置配置值，例如：

```shell
simd config set app pruning "enabled" # 将 app.toml 中的 pruning 设置为 "enabled"
simd config set client chain-id "foo-1" # 将 client.toml 中的 chain-id 设置为 "foo-1"
```

```shell
confix set ~/.simapp/config/app.toml pruning "enabled" # 从 app.toml 文件中设置 pruning 的值
confix set ~/.simapp/config/client.toml chain-id "foo-1" # 从 client.toml 文件中设置 chain-id 的值
```

### 迁移

将配置文件迁移到新版本，例如：

```shell
simd config migrate v0.47 # 将 defaultHome/config/app.toml 迁移到最新的 v0.47 配置
```

```shell
confix migrate v0.47 ~/.simapp/config/app.toml # 将 ~/.simapp/config/app.toml 迁移到最新的 v0.47 配置
```

### 差异

获取给定配置文件与默认配置文件之间的差异，例如：

```shell
simd config diff v0.47 # 获取 defaultHome/config/app.toml 与最新的 v0.47 配置之间的差异
```

```shell
confix diff v0.47 ~/.simapp/config/app.toml # 获取 ~/.simapp/config/app.toml 与最新的 v0.47 配置之间的差异
```

### 维护者

在每次 SDK 修改默认配置时，将默认的 SDK 配置添加到 `data/v0.XX-app.toml` 下。
这允许用户独立使用该工具。

## 鸣谢

该项目基于 [CometBFT RFC 019](https://github.com/cometbft/cometbft/blob/5013bc3f4a6d64dcc2bf02ccc002ebc9881c62e4/docs/rfc/rfc-019-config-version.md) 和他们自己的 [confix 实现](https://github.com/cometbft/cometbft/blob/v0.36.x/scripts/confix/confix.go)。




# Confix

`Confix` is a configuration management tool that allows you to manage your configuration via CLI.

It is based on the [CometBFT RFC 019](https://github.com/cometbft/cometbft/blob/5013bc3f4a6d64dcc2bf02ccc002ebc9881c62e4/docs/rfc/rfc-019-config-version.md).

## Installation

### Add Config Command

To add the confix tool, it's required to add the `ConfigCommand` to your application's root command file (e.g. `simd/cmd/root.go`).

Import the `confixCmd` package:

```go
import "cosmossdk.io/tools/confix/cmd"
```

Find the following line:

```go
initRootCmd(rootCmd, encodingConfig)
```

After that line, add the following:

```go
rootCmd.AddCommand(
    confixcmd.ConfigCommand(),
)
```

The `ConfixCommand` function builds the `config` root command and is defined in the `confixCmd` package (`cosmossdk.io/tools/confix/cmd`).
An implementation example can be found in `simapp`.

The command will be available as `simd config`.

### Using Confix Standalone

To use Confix standalone, without having to add it in your application, install it with the following command:

```bash
go install cosmossdk.io/tools/confix/cmd/confix@latest
```

:::warning
Currently, due to the replace directive in the Confix go.mod, it is not possible to use `go install`.
Building from source or importing in an application is required until that replace directive is removed.
:::

Alternatively, for building from source, simply run `make confix`. The binary will be located in `tools/confix`.

## Usage

Use standalone:

```shell
confix --help
```

Use in simd:

```shell
simd config fix --help
```

### Get

Get a configuration value, e.g.:

```shell
simd config get app pruning # gets the value pruning from app.toml
simd config get client chain-id # gets the value chain-id from client.toml
```

```shell
confix get ~/.simapp/config/app.toml pruning # gets the value pruning from app.toml
confix get ~/.simapp/config/client.toml chain-id # gets the value chain-id from client.toml
```

### Set

Set a configuration value, e.g.:

```shell
simd config set app pruning "enabled" # sets the value pruning from app.toml
simd config set client chain-id "foo-1" # sets the value chain-id from client.toml
```

```shell
confix set ~/.simapp/config/app.toml pruning "enabled" # sets the value pruning from app.toml
confix set ~/.simapp/config/client.toml chain-id "foo-1" # sets the value chain-id from client.toml
```

### Migrate

Migrate a configuration file to a new version, e.g.:

```shell
simd config migrate v0.47 # migrates defaultHome/config/app.toml to the latest v0.47 config
```

```shell
confix migrate v0.47 ~/.simapp/config/app.toml # migrate ~/.simapp/config/app.toml to the latest v0.47 config
```

### Diff

Get the diff between a given configuration file and the default configuration file, e.g.:

```shell
simd config diff v0.47 # gets the diff between defaultHome/config/app.toml and the latest v0.47 config
```

```shell
confix diff v0.47 ~/.simapp/config/app.toml # gets the diff between ~/.simapp/config/app.toml and the latest v0.47 config
```

### Maintainer

At each SDK modification of the default configuration, add the default SDK config under `data/v0.XX-app.toml`.
This allows users to use the tool standalone.

## Credits

This project is based on the [CometBFT RFC 019](https://github.com/cometbft/cometbft/blob/5013bc3f4a6d64dcc2bf02ccc002ebc9881c62e4/docs/rfc/rfc-019-config-version.md) and their own implementation of [confix](https://github.com/cometbft/cometbft/blob/v0.36.x/scripts/confix/confix.go).
