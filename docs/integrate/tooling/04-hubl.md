# Hubl

`Hubl`是一个工具，允许您查询任何基于Cosmos SDK的区块链。
它利用了Cosmos SDK的新[AutoCLI](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/client/v2@v2.0.0-20220916140313-c5245716b516/cli)功能<!-- TODO replace with AutoCLI docs -->。

## 安装

可以使用`go install`安装Hubl：

```shell
go install cosmossdk.io/tools/hubl/cmd/hubl@latest
```

或者从源代码构建：

```shell
git clone --depth=1 https://github.com/cosmos/cosmos-sdk
make hubl
```

二进制文件将位于`tools/hubl`目录下。

## 使用

```shell
hubl --help
```

### 添加链

要配置新的链，请使用`--init`标志和链的名称（在链注册表<https://github.com/cosmos/chain-registry>中列出）运行此命令。

如果链未在链注册表中列出，可以使用任何唯一的名称。

```shell
hubl init [chain-name]
hubl init regen
```

链配置存储在`~/.hubl/config.toml`中。

:::tip

当使用不安全的gRPC端点时，在配置文件中将`insecure`字段更改为`true`。

```toml
[chains]
[chains.regen]
[[chains.regen.trusted-grpc-endpoints]]
endpoint = 'localhost:9090'
insecure = true
```

或者使用`--insecure`标志：

```shell
hubl init regen --insecure
```

:::

### 查询

要查询链，可以使用`query`命令。
然后指定要查询的模块和查询本身。

```shell
hubl regen query auth module-accounts
```




# Hubl

`Hubl` is a tool that allows you to query any Cosmos SDK based blockchain.
It takes advantage of the new [AutoCLI](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/client/v2@v2.0.0-20220916140313-c5245716b516/cli) feature <!-- TODO replace with AutoCLI docs --> of the Cosmos SDK.

## Installation

Hubl can be installed using `go install`:

```shell
go install cosmossdk.io/tools/hubl/cmd/hubl@latest
```

Or build from source:

```shell
git clone --depth=1 https://github.com/cosmos/cosmos-sdk
make hubl
```

The binary will be located in `tools/hubl`.

## Usage

```shell
hubl --help
```

### Add chain

To configure a new chain just run this command using the --init flag and the name of the chain as it's listed in the chain registry (<https://github.com/cosmos/chain-registry>).

If the chain is not listed in the chain registry, you can use any unique name.

```shell
hubl init [chain-name]
hubl init regen
```

The chain configuration is stored in `~/.hubl/config.toml`.

:::tip

When using an unsecure gRPC endpoint, change the `insecure` field to `true` in the config file.

```toml
[chains]
[chains.regen]
[[chains.regen.trusted-grpc-endpoints]]
endpoint = 'localhost:9090'
insecure = true
```

Or use the `--insecure` flag:

```shell
hubl init regen --insecure
```

:::

### Query

To query a chain, you can use the `query` command.
Then specify which module you want to query and the query itself.

```shell
hubl regen query auth module-accounts
```
