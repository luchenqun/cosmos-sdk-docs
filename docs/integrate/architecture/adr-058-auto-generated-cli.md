# ADR 058: 自动生成的 CLI

## 变更日志

* 2022-05-04: 初始草稿

## 状态

已接受 部分实现

## 摘要

为了让开发者更容易编写 Cosmos SDK 模块，我们提供了基于 protobuf 定义自动生成 CLI 命令的基础设施。

## 背景

当前的 Cosmos SDK 模块通常为每个事务和查询实现一个 CLI 命令。这些命令是手动编写的，基本上是为 protobuf 消息中的特定字段提供一些 CLI 标志或位置参数。

为了确保 CLI 命令的正确实现，并确保应用程序在端到端场景中正常工作，我们使用 CLI 命令进行集成测试。虽然这些测试在某种程度上是有价值的，但编写和维护它们可能很困难，并且运行速度较慢。[一些团队已经考虑过](https://github.com/regen-network/regen-ledger/issues/1041)从 CLI 风格的集成测试（实际上是端到端测试）转向更窄的集成测试，直接使用 `MsgClient` 和 `QueryClient` 进行测试。这可能涉及用单元测试替换当前的端到端 CLI 测试，因为仍然需要某种方式来测试这些 CLI 命令以进行全面的质量保证。

## 决策

为了简化模块开发，我们提供了基础设施 - 在新的 [`client/v2`](https://github.com/cosmos/cosmos-sdk/tree/main/client/v2) Go 模块中 - 用于根据 protobuf 定义自动生成 CLI 命令，以替代或补充手动编写的 CLI 命令。这意味着在开发模块时，可以跳过编写和测试 CLI 命令，因为这些都可以由框架处理。

自动生成 CLI 命令的基本设计如下：

* 为 protobuf 的 `Query` 或 `Msg` 服务中的每个 `rpc` 方法创建一个 CLI 命令
* 为 `rpc` 请求类型中的每个字段创建一个 CLI 标志
* 对于 `query` 命令，调用 gRPC 并将响应以 protobuf JSON 或 YAML 的形式打印出来（通过 `-o`/`--output` 标志）
* 对于 `tx` 命令，创建一个事务并应用常见的事务标志

为了使自动生成的命令行界面（CLI）比手写的CLI更易于使用（或更易于使用），我们需要对特定的protobuf字段类型进行自定义处理，以便输入格式对人类来说更容易理解：

* `Coin`、`Coins`、`DecCoin`和`DecCoins`应该使用现有的格式进行输入（例如`1000uatom`）
* 可以使用bech32地址字符串或密钥环中的命名密钥来指定地址
* `Timestamp`和`Duration`应该接受类似于`2001-01-01T00:00:00Z`和`1h3m`的字符串
* 分页应该使用`--page-limit`、`--page-offset`等标志进行处理
* 可以通过消息名称或`cosmos_proto.scalar`注释来自定义任何其他protobuf类型

基本上，应该能够为单个`rpc`方法生成一个命令，以及为整个protobuf `service`定义生成所有命令。可以混合使用自动生成的和手写的命令。

## 结果

### 向后兼容性

现有的模块可以混合使用自动生成的和手写的CLI命令，因此是否通过使用稍有不同的自动生成命令来进行破坏性更改取决于它们自己。

目前，SDK将为了向后兼容性而保留现有的一组CLI命令，但新的命令将使用此功能。

### 积极影响

* 模块开发人员无需编写CLI命令
* 模块开发人员无需测试CLI命令
* [lens](https://github.com/strangelove-ventures/lens)可能会从中受益

### 负面影响

### 中性影响

## 进一步讨论

我们希望能够自定义以下内容：

* 命令的简短和长用法字符串
* 标志的别名（例如，`-a`代表`--amount`）
* 哪些字段是位置参数而不是标志

关于这些自定义选项应该放在以下哪个位置，目前还是一个[开放讨论](https://github.com/cosmos/cosmos-sdk/pull/11725#issuecomment-1108676129)：

* .proto文件本身，
* 单独的配置文件（例如YAML），或者
* 直接在代码中

提供.proto文件中的选项将允许动态客户端自动生成CLI命令。然而，这可能会使.proto文件本身被只对一小部分用户相关的信息所污染。

## 参考资料

* https://github.com/regen-network/regen-ledger/issues/1041
* https://github.com/cosmos/cosmos-sdk/tree/main/client/v2
* https://github.com/cosmos/cosmos-sdk/pull/11725#issuecomment-1108676129


# ADR 058: Auto-Generated CLI

## Changelog

* 2022-05-04: Initial Draft

## Status

ACCEPTED Partially Implemented

## Abstract

In order to make it easier for developers to write Cosmos SDK modules, we provide infrastructure which automatically
generates CLI commands based on protobuf definitions.

## Context

Current Cosmos SDK modules generally implement a CLI command for every transaction and every query supported by the
module. These are handwritten for each command and essentially amount to providing some CLI flags or positional
arguments for specific fields in protobuf messages.

In order to make sure CLI commands are correctly implemented as well as to make sure that the application works
in end-to-end scenarios, we do integration tests using CLI commands. While these tests are valuable on some-level,
they can be hard to write and maintain, and run slowly. [Some teams have contemplated](https://github.com/regen-network/regen-ledger/issues/1041)
moving away from CLI-style integration tests (which are really end-to-end tests) towards narrower integration tests
which exercise `MsgClient` and `QueryClient` directly. This might involve replacing the current end-to-end CLI
tests with unit tests as there still needs to be some way to test these CLI commands for full quality assurance.

## Decision

To make module development simpler, we provide infrastructure - in the new [`client/v2`](https://github.com/cosmos/cosmos-sdk/tree/main/client/v2)
go module - for automatically generating CLI commands based on protobuf definitions to either replace or complement
handwritten CLI commands. This will mean that when developing a module, it will be possible to skip both writing and
testing CLI commands as that can all be taken care of by the framework.

The basic design for automatically generating CLI commands is to:

* create one CLI command for each `rpc` method in a protobuf `Query` or `Msg` service
* create a CLI flag for each field in the `rpc` request type
* for `query` commands call gRPC and print the response as protobuf JSON or YAML (via the `-o`/`--output` flag)
* for `tx` commands, create a transaction and apply common transaction flags

In order to make the auto-generated CLI as easy to use (or easier) than handwritten CLI, we need to do custom handling
of specific protobuf field types so that the input format is easy for humans:

* `Coin`, `Coins`, `DecCoin`, and `DecCoins` should be input using the existing format (i.e. `1000uatom`)
* it should be possible to specify an address using either the bech32 address string or a named key in the keyring
* `Timestamp` and `Duration` should accept strings like `2001-01-01T00:00:00Z` and `1h3m` respectively
* pagination should be handled with flags like `--page-limit`, `--page-offset`, etc.
* it should be possible to customize any other protobuf type either via its message name or a `cosmos_proto.scalar` annotation

At a basic level it should be possible to generate a command for a single `rpc` method as well as all the commands for
a whole protobuf `service` definition. It should be possible to mix and match auto-generated and handwritten commands.

## Consequences

### Backwards Compatibility

Existing modules can mix and match auto-generated and handwritten CLI commands so it is up to them as to whether they
make breaking changes by replacing handwritten commands with slightly different auto-generated ones.

For now the SDK will maintain the existing set of CLI commands for backwards compatibility but new commands will use
this functionality.

### Positive

* module developers will not need to write CLI commands
* module developers will not need to test CLI commands
* [lens](https://github.com/strangelove-ventures/lens) may benefit from this

### Negative

### Neutral

## Further Discussions

We would like to be able to customize:

* short and long usage strings for commands
* aliases for flags (ex. `-a` for `--amount`)
* which fields are positional parameters rather than flags

It is an [open discussion](https://github.com/cosmos/cosmos-sdk/pull/11725#issuecomment-1108676129)
as to whether these customizations options should line in:

* the .proto files themselves,
* separate config files (ex. YAML), or
* directly in code

Providing the options in .proto files would allow a dynamic client to automatically generate
CLI commands on the fly. However, that may pollute the .proto files themselves with information that is only relevant
for a small subset of users.

## References

* https://github.com/regen-network/regen-ledger/issues/1041
* https://github.com/cosmos/cosmos-sdk/tree/main/client/v2
* https://github.com/cosmos/cosmos-sdk/pull/11725#issuecomment-1108676129
