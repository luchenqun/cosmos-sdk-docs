# ADR 047: 扩展升级计划

## 更新日志

* 2021年11月23日：初稿

## 状态

提议中 未实现

## 摘要

本ADR扩展了现有的x/upgrade `Plan` proto消息，以包括定义升级工具中的预运行和后运行过程的新字段。
它还定义了一个结构，用于提供与升级相关的可下载的文件。

## 背景

`upgrade` 模块与 Cosmovisor 结合使用，旨在促进和自动化区块链从一个版本过渡到另一个版本。

用户提交一个包含升级 `Plan` 的软件升级治理提案。
[Plan](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/proto/cosmos/upgrade/v1beta1/upgrade.proto#L12) 目前包含以下字段：
* `name`：标识新版本的简短字符串。
* `height`：执行升级的链高度。
* `info`：包含有关升级的信息的字符串。

`info` 字符串可以是任何内容。
然而，Cosmovisor 将尝试使用 `info` 字段自动下载区块链可执行文件的新版本。
为了使自动下载工作，Cosmovisor 期望 `info` 字段要么是一个字符串化的 JSON 对象（通过文档定义了特定结构），要么是一个返回这样的 JSON 的 URL。
JSON 对象标识用于下载不同平台（操作系统和架构，例如 "linux/amd64"）的新区块链可执行文件的 URL。
这样的 URL 可以直接返回可执行文件，也可以返回包含可执行文件和可能的其他资源的存档文件。

如果 URL 返回一个存档文件，它将被解压缩到 `{DAEMON_HOME}/cosmovisor/{upgrade name}`。
然后，如果 `{DAEMON_HOME}/cosmovisor/{upgrade name}/bin/{DAEMON_NAME}` 不存在，但 `{DAEMON_HOME}/cosmovisor/{upgrade name}/{DAEMON_NAME}` 存在，则后者将被复制到前者。
如果 URL 返回的是除存档文件以外的内容，它将被下载到 `{DAEMON_HOME}/cosmovisor/{upgrade name}/bin/{DAEMON_NAME}`。

如果达到升级高度但新版本的可执行文件不可用，Cosmovisor 将停止运行。

`DAEMON_HOME`和`DAEMON_NAME`都是[用于配置Cosmovisor的环境变量](https://github.com/cosmos/cosmos-sdk/blob/cosmovisor/v1.0.0/cosmovisor/README.md#command-line-arguments-and-environment-variables)。

目前，Cosmovisor没有机制在升级的链重新启动后运行命令。

当前的升级流程如下：

1. 提交并批准升级治理提案。
2. 达到升级高度。
3. `x/upgrade`模块写入`upgrade_info.json`文件。
4. 链停止。
5. Cosmovisor备份数据目录（如果已设置）。
6. Cosmovisor下载新的可执行文件（如果尚未就位）。
7. Cosmovisor执行`${DAEMON_NAME} pre-upgrade`。
8. Cosmovisor使用新版本和最初提供的相同参数重新启动应用。

## 决策

### Protobuf 更新

我们将更新`x/upgrade.Plan`消息以提供升级说明。
升级说明将包含每个平台可用的工件列表。
它允许定义预运行和后运行命令。
这些命令不是共识保证的；它们将由Cosmosvisor（或其他）在其升级处理期间执行。

```protobuf
message Plan {
  // ... (existing fields)

  UpgradeInstructions instructions = 6;
}
```

新的`UpgradeInstructions instructions`字段必须是可选的。

```protobuf
message UpgradeInstructions {
  string pre_run              = 1;
  string post_run             = 2;
  repeated Artifact artifacts = 3;
  string description          = 4;
}
```

`UpgradeInstructions`中的所有字段都是可选的。
* `pre_run`是在升级的链重新启动之前运行的命令。
  如果定义了该命令，它将在停止和下载新工件之后但在重新启动升级的链之前执行。
  此命令运行的工作目录必须是`{DAEMON_HOME}/cosmovisor/{upgrade name}`。
  该命令必须与当前的[pre-upgrade](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/docs/migrations/pre-upgrade.md)命令具有相同的行为。
  它不接受任何命令行参数，并且预计以以下退出代码终止：

  | 退出状态码 | 在Cosmosvisor中的处理方式                                                                                      |
  |------------|---------------------------------------------------------------------------------------------------------------|
  | `0`        | 假设`pre-upgrade`命令成功执行并继续升级。                                                                     |
  | `1`        | 当`pre-upgrade`命令未实现时的默认退出代码。                                                                   |
  | `30`       | `pre-upgrade`命令已执行但失败。这将导致整个升级失败。                                                          |
  | `31`       | `pre-upgrade`命令已执行但失败。但是，该命令会重试，直到返回退出代码`1`或`30`。                                   |
  如果定义了该命令，则应用程序监管者（例如Cosmovisor）不得运行`app pre-run`。
* `post_run`是在升级的链启动后运行的命令。如果定义了该命令，则此命令最多只能由升级节点执行一次。
  输出和退出代码应记录，但不应影响升级链的运行。
  该命令运行的工作目录必须是`{DAEMON_HOME}/cosmovisor/{upgrade name}`。
* `artifacts`定义要下载的项目。
  它应该每个平台只有一个条目。
* `description`包含关于升级的人类可读信息，可能包含对外部资源的引用。
  它不应用于结构化处理信息。

```protobuf
message Artifact {
  string platform      = 1;
  string url           = 2;
  string checksum      = 3;
  string checksum_algo = 4;
}
```

* `platform` 是一个必需的字符串，应该采用 `{OS}/{CPU}` 的格式，例如 `"linux/amd64"`。
  字符串 `"any"` 也应该被允许。
  当找不到特定的 `{OS}/{CPU}` 条目时，应该使用 `platform` 为 `"any"` 的 `Artifact` 作为备用。
  也就是说，如果存在一个 `platform` 与系统的操作系统和 CPU 匹配的 `Artifact`，应该使用该 `Artifact`；
  否则，如果存在一个 `platform` 为 `any` 的 `Artifact`，应该使用该 `Artifact`；
  否则不应下载任何 `Artifact`。
* `url` 是一个必需的 URL 字符串，必须符合 [RFC 1738: 统一资源定位符](https://www.ietf.org/rfc/rfc1738.txt) 的规范。
  对该 `url` 的请求必须返回一个可执行文件或包含 `bin/{DAEMON_NAME}` 或 `{DAEMON_NAME}` 的存档文件。
  URL 不应包含校验和 - 校验和应由 `checksum` 属性指定。
* `checksum` 是对请求 `url` 返回结果的期望校验和。
  它不是必需的，但是建议提供。
  如果提供了，它必须是一个十六进制编码的校验和字符串。
  使用这些 `UpgradeInstructions` 的工具如果提供的 `checksum` 与 `url` 返回结果的校验和不同，必须失败。
* `checksum_algo` 是一个标识用于生成 `checksum` 的算法的字符串。
  推荐的算法有：`sha256`、`sha512`。
  也支持的算法（但不推荐使用）有：`sha1`、`md5`。
  如果提供了 `checksum`，还必须提供 `checksum_algo`。

`url` 不需要包含 `checksum` 查询参数。
如果 `url` 包含 `checksum` 查询参数，则 `checksum` 和 `checksum_algo` 字段也必须填充，并且它们的值必须与查询参数的值匹配。
例如，如果 `url` 是 `"https://example.com?checksum=md5:d41d8cd98f00b204e9800998ecf8427e"`，那么 `checksum` 字段必须是 `"d41d8cd98f00b204e9800998ecf8427e"`，`checksum_algo` 字段必须是 `"md5"`。

### 升级模块更新

如果一个升级 `Plan` 不使用新的 `UpgradeInstructions` 字段，现有功能将被保留。
将弃用将 `info` 字段解析为 URL 或 `binaries` JSON。
在验证过程中，如果将 `info` 字段用作此类用途，将发出警告，但不会报错。

我们将更新创建`upgrade-info.json`文件以包含`UpgradeInstructions`。

我们将更新通过CLI可用的可选验证以适应新的`Plan`结构。我们将添加以下验证：

1. 如果提供了`UpgradeInstructions`：
    1. `artifacts`中必须至少有一个条目。
    1. 所有的`artifacts`必须具有唯一的`platform`。
    1. 对于每个`Artifact`，如果`url`包含`checksum`查询参数：
        1. `checksum`查询参数的值必须符合`{checksum_algo}:{checksum}`的格式。
        1. 查询参数中的`{checksum}`必须等于`Artifact`中提供的`checksum`。
        1. 查询参数中的`{checksum_algo}`必须等于`Artifact`中提供的`checksum_algo`。
1. 目前使用`info`字段进行以下验证。我们将类似的验证应用于`UpgradeInstructions`。
    对于每个`Artifact`：
    1. `platform`必须具有`{OS}/{CPU}`的格式或为`"any"`。
    1. `url`字段不能为空。
    1. `url`字段必须是一个正确的URL。
    1. 必须在`checksum`字段中或作为`url`的查询参数中提供`checksum`。
    1. 如果`checksum`字段有一个值，并且`url`也有一个`checksum`查询参数，则这两个值必须相等。
    1. `url`必须返回一个包含`bin/{DAEMON_NAME}`或`{DAEMON_NAME}`的文件或存档。
    1. 如果提供了`checksum`（在字段或查询参数中），则`url`的结果的校验和必须等于提供的校验和。

下载`Artifact`的方式与当前从`info`下载的URL相同。

### Cosmovisor 更新

如果`upgrade-info.json`文件不包含任何`UpgradeInstructions`，将保持现有功能。

我们将更新Cosmovisor以查找并处理`upgrade-info.json`中的新`UpgradeInstructions`。如果提供了`UpgradeInstructions`，我们将执行以下操作：

1. `info`字段将被忽略。
1. `artifacts`字段将用于根据Cosmovisor运行的`platform`来识别要下载的artifact。
1. 如果提供了`checksum`（无论是在字段中还是作为`url`的查询参数），并且下载的artifact具有不同的校验和，则升级过程将被中断，Cosmovisor将以错误退出。
1. 如果定义了`pre_run`命令，它将在与`app pre-upgrade`命令执行的过程中的相同位置执行。它将使用Cosmovisor运行的其他命令的相同环境来执行。
1. 如果定义了`post_run`命令，它将在执行重新启动链的命令后执行。它将在后台进程中使用与其他命令相同的环境来执行。命令生成的任何输出都将被记录。完成后，将记录退出代码。

我们将不再推荐使用`info`字段来定义除人类可读信息之外的内容。
如果`info`字段用于定义资产（无论是通过URL还是JSON），将会记录警告日志。

新的升级时间表与当前时间表非常相似。以下是变更的部分：

1. 提交并批准升级治理提案。
1. 达到升级高度。
1. `x/upgrade`模块编写`upgrade_info.json`文件（**现在可能包含`UpgradeInstructions`**）。
1. 链停止。
1. Cosmovisor备份数据目录（如果已设置）。
1. Cosmovisor下载新的可执行文件（如果尚未安装）。
1. Cosmovisor执行**如果提供了`pre_run`命令**，否则执行`${DAEMON_NAME} pre-upgrade`命令。
1. Cosmovisor使用新版本和最初提供的相同参数重新启动应用程序。
1. **Cosmovisor立即在一个独立的进程中运行`post_run`命令**。

## 影响

### 向后兼容性

由于对现有定义的唯一更改是将`Plan`消息中的`instructions`字段添加为可选字段，并且当未提供`UpgradeInstructions`时将保持当前行为，因此在proto消息方面没有向后不兼容性。
此外，当未提供`UpgradeInstructions`时，将保持当前行为，因此在升级模块或Cosmovisor方面也没有向后不兼容性。

### 向前兼容性

为了将`UpgradeInstructions`作为软件升级的一部分使用，必须同时满足以下两个条件：

1. 链必须已经使用足够先进的Cosmos SDK版本。
2. 链的节点必须使用足够先进的Cosmovisor版本。

### 积极因素

1. 通过在proto中定义而不是在文档中定义，定义工件的结构更清晰。
2. 提供预运行命令更加明显。
3. 可以提供后运行命令。

### 负面因素

1. `Plan`消息变得更大。这是可以忽略的，因为A）`x/upgrades`模块最多只存储一个升级计划，B）升级的频率很低，增加的燃气成本不是问题。
2. 没有提供返回`UpgradeInstructions`的URL选项。
3. 为一个平台提供多个资产（可执行文件和其他文件）的唯一方法是使用存档作为该平台的工件。

### 中立

1. 当未提供`UpgradeInstructions`时，保留`info`字段的现有功能。

## 进一步讨论

1. [草案 PR #10032 评论](https://github.com/cosmos/cosmos-sdk/pull/10032/files?authenticity_token=pLtzpnXJJB%2Fif2UWiTp9Td3MvRrBF04DvjSuEjf1azoWdLF%2BSNymVYw9Ic7VkqHgNLhNj6iq9bHQYnVLzMXd4g%3D%3D&file-filters%5B%5D=.go&file-filters%5B%5D=.proto#r698708349):
    考虑为`UpgradeInstructions instructions`选择不同的名称（可以是消息类型或字段名）。
1. [草案 PR #10032 评论](https://github.com/cosmos/cosmos-sdk/pull/10032/files?authenticity_token=pLtzpnXJJB%2Fif2UWiTp9Td3MvRrBF04DvjSuEjf1azoWdLF%2BSNymVYw9Ic7VkqHgNLhNj6iq9bHQYnVLzMXd4g%3D%3D&file-filters%5B%5D=.go&file-filters%5B%5D=.proto#r754655072):
    1. 考虑将`string platform`字段放在`UpgradeInstructions`内，并将`UpgradeInstructions`作为`Plan`中的重复字段。
    1. 考虑在`Plan`中使用`oneof`字段，可以是`UpgradeInstructions`，也可以是返回`UpgradeInstructions`的URL。
    1. 考虑允许`info`既可以是`UpgradeInstructions`的JSON序列化版本，也可以是返回该版本的URL。
1. [草案 PR #10032 评论](https://github.com/cosmos/cosmos-sdk/pull/10032/files?authenticity_token=pLtzpnXJJB%2Fif2UWiTp9Td3MvRrBF04DvjSuEjf1azoWdLF%2BSNymVYw9Ic7VkqHgNLhNj6iq9bHQYnVLzMXd4g%3D%3D&file-filters%5B%5D=.go&file-filters%5B%5D=.proto#r755462876):
    考虑不包含`UpgradeInstructions.description`字段，而是将`info`字段用于该目的。
1. [草案 PR #10032 评论](https://github.com/cosmos/cosmos-sdk/pull/10032/files?authenticity_token=pLtzpnXJJB%2Fif2UWiTp9Td3MvRrBF04DvjSuEjf1azoWdLF%2BSNymVYw9Ic7VkqHgNLhNj6iq9bHQYnVLzMXd4g%3D%3D&file-filters%5B%5D=.go&file-filters%5B%5D=.proto#r754643691):
    考虑通过向`Artifact`消息添加`name`字段，允许为任何给定的`platform`下载多个文件。
1. [PR #10502 评论](https://github.com/cosmos/cosmos-sdk/pull/10602#discussion_r781438288)
    允许通过URL提供新的`UpgradeInstructions`。
1. [PR #10502 评论](https://github.com/cosmos/cosmos-sdk/pull/10602#discussion_r781438288)
    允许为资产定义一个`signer`（作为使用`checksum`的替代方案）。

## 参考资料

* [当前的 upgrade.proto](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/proto/cosmos/upgrade/v1beta1/upgrade.proto)
* [Upgrade 模块 README](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/x/upgrade/spec/README.md)
* [Cosmovisor README](https://github.com/cosmos/cosmos-sdk/blob/cosmovisor/v1.0.0/cosmovisor/README.md)
* [Pre-upgrade README](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/docs/migrations/pre-upgrade.md)
* [Draft/POC PR #10032](https://github.com/cosmos/cosmos-sdk/pull/10032)
* [RFC 1738: 统一资源定位符](https://www.ietf.org/rfc/rfc1738.txt)


# ADR 047: Extend Upgrade Plan

## Changelog

* Nov, 23, 2021: Initial Draft

## Status

PROPOSED Not Implemented

## Abstract

This ADR expands the existing x/upgrade `Plan` proto message to include new fields for defining pre-run and post-run processes within upgrade tooling.
It also defines a structure for providing downloadable artifacts involved in an upgrade.

## Context

The `upgrade` module in conjunction with Cosmovisor are designed to facilitate and automate a blockchain's transition from one version to another.

Users submit a software upgrade governance proposal containing an upgrade `Plan`.
The [Plan](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/proto/cosmos/upgrade/v1beta1/upgrade.proto#L12) currently contains the following fields:
* `name`: A short string identifying the new version.
* `height`: The chain height at which the upgrade is to be performed.
* `info`: A string containing information about the upgrade.

The `info` string can be anything.
However, Cosmovisor will try to use the `info` field to automatically download a new version of the blockchain executable.
For the auto-download to work, Cosmovisor expects it to be either a stringified JSON object (with a specific structure defined through documentation), or a URL that will return such JSON.
The JSON object identifies URLs used to download the new blockchain executable for different platforms (OS and Architecture, e.g. "linux/amd64").
Such a URL can either return the executable file directly or can return an archive containing the executable and possibly other assets.

If the URL returns an archive, it is decompressed into `{DAEMON_HOME}/cosmovisor/{upgrade name}`.
Then, if `{DAEMON_HOME}/cosmovisor/{upgrade name}/bin/{DAEMON_NAME}` does not exist, but `{DAEMON_HOME}/cosmovisor/{upgrade name}/{DAEMON_NAME}` does, the latter is copied to the former.
If the URL returns something other than an archive, it is downloaded to `{DAEMON_HOME}/cosmovisor/{upgrade name}/bin/{DAEMON_NAME}`.

If an upgrade height is reached and the new version of the executable version isn't available, Cosmovisor will stop running.

Both `DAEMON_HOME` and `DAEMON_NAME` are [environment variables used to configure Cosmovisor](https://github.com/cosmos/cosmos-sdk/blob/cosmovisor/v1.0.0/cosmovisor/README.md#command-line-arguments-and-environment-variables).

Currently, there is no mechanism that makes Cosmovisor run a command after the upgraded chain has been restarted.

The current upgrade process has this timeline:

1. An upgrade governance proposal is submitted and approved.
1. The upgrade height is reached.
1. The `x/upgrade` module writes the `upgrade_info.json` file.
1. The chain halts.
1. Cosmovisor backs up the data directory (if set up to do so).
1. Cosmovisor downloads the new executable (if not already in place).
1. Cosmovisor executes the `${DAEMON_NAME} pre-upgrade`.
1. Cosmovisor restarts the app using the new version and same args originally provided.

## Decision

### Protobuf Updates

We will update the `x/upgrade.Plan` message for providing upgrade instructions.
The upgrade instructions will contain a list of artifacts available for each platform.
It allows for the definition of a pre-run and post-run commands.
These commands are not consensus guaranteed; they will be executed by Cosmosvisor (or other) during its upgrade handling.

```protobuf
message Plan {
  // ... (existing fields)

  UpgradeInstructions instructions = 6;
}
```

The new `UpgradeInstructions instructions` field MUST be optional.

```protobuf
message UpgradeInstructions {
  string pre_run              = 1;
  string post_run             = 2;
  repeated Artifact artifacts = 3;
  string description          = 4;
}
```

All fields in the `UpgradeInstructions` are optional.
* `pre_run` is a command to run prior to the upgraded chain restarting.
  If defined, it will be executed after halting and downloading the new artifact but before restarting the upgraded chain.
  The working directory this command runs from MUST be `{DAEMON_HOME}/cosmovisor/{upgrade name}`.
  This command MUST behave the same as the current [pre-upgrade](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/docs/migrations/pre-upgrade.md) command.
  It does not take in any command-line arguments and is expected to terminate with the following exit codes:

  | Exit status code | How it is handled in Cosmosvisor                                                                                    |
  |------------------|---------------------------------------------------------------------------------------------------------------------|
  | `0`              | Assumes `pre-upgrade` command executed successfully and continues the upgrade.                                      |
  | `1`              | Default exit code when `pre-upgrade` command has not been implemented.                                              |
  | `30`             | `pre-upgrade` command was executed but failed. This fails the entire upgrade.                                       |
  | `31`             | `pre-upgrade` command was executed but failed. But the command is retried until exit code `1` or `30` are returned. |
  If defined, then the app supervisors (e.g. Cosmovisor) MUST NOT run `app pre-run`.
* `post_run` is a command to run after the upgraded chain has been started. If defined, this command MUST be only executed at most once by an upgrading node.
  The output and exit code SHOULD be logged but SHOULD NOT affect the running of the upgraded chain.
  The working directory this command runs from MUST be `{DAEMON_HOME}/cosmovisor/{upgrade name}`.
* `artifacts` define items to be downloaded.
  It SHOULD have only one entry per platform.
* `description` contains human-readable information about the upgrade and might contain references to external resources.
  It SHOULD NOT be used for structured processing information.

```protobuf
message Artifact {
  string platform      = 1;
  string url           = 2;
  string checksum      = 3;
  string checksum_algo = 4;
}
```

* `platform` is a required string that SHOULD be in the format `{OS}/{CPU}`, e.g. `"linux/amd64"`.
  The string `"any"` SHOULD also be allowed.
  An `Artifact` with a `platform` of `"any"` SHOULD be used as a fallback when a specific `{OS}/{CPU}` entry is not found.
  That is, if an `Artifact` exists with a `platform` that matches the system's OS and CPU, that should be used;
  otherwise, if an `Artifact` exists with a `platform` of `any`, that should be used;
  otherwise no artifact should be downloaded.
* `url` is a required URL string that MUST conform to [RFC 1738: Uniform Resource Locators](https://www.ietf.org/rfc/rfc1738.txt).
  A request to this `url` MUST return either an executable file or an archive containing either `bin/{DAEMON_NAME}` or `{DAEMON_NAME}`.
  The URL should not contain checksum - it should be specified by the `checksum` attribute.
* `checksum` is a checksum of the expected result of a request to the `url`.
  It is not required, but is recommended.
  If provided, it MUST be a hex encoded checksum string.
  Tools utilizing these `UpgradeInstructions` MUST fail if a `checksum` is provided but is different from the checksum of the result returned by the `url`.
* `checksum_algo` is a string identify the algorithm used to generate the `checksum`.
  Recommended algorithms: `sha256`, `sha512`.
  Algorithms also supported (but not recommended): `sha1`, `md5`.
  If a `checksum` is provided, a `checksum_algo` MUST also be provided.

A `url` is not required to contain a `checksum` query parameter.
If the `url` does contain a `checksum` query parameter, the `checksum` and `checksum_algo` fields MUST also be populated, and their values MUST match the value of the query parameter.
For example, if the `url` is `"https://example.com?checksum=md5:d41d8cd98f00b204e9800998ecf8427e"`, then the `checksum` field must be `"d41d8cd98f00b204e9800998ecf8427e"` and the `checksum_algo` field must be `"md5"`.

### Upgrade Module Updates

If an upgrade `Plan` does not use the new `UpgradeInstructions` field, existing functionality will be maintained.
The parsing of the `info` field as either a URL or `binaries` JSON will be deprecated.
During validation, if the `info` field is used as such, a warning will be issued, but not an error.

We will update the creation of the `upgrade-info.json` file to include the `UpgradeInstructions`.

We will update the optional validation available via CLI to account for the new `Plan` structure.
We will add the following validation:

1.  If `UpgradeInstructions` are provided:
    1.  There MUST be at least one entry in `artifacts`.
    1.  All of the `artifacts` MUST have a unique `platform`.
    1.  For each `Artifact`, if the `url` contains a `checksum` query parameter:
        1. The `checksum` query parameter value MUST be in the format of `{checksum_algo}:{checksum}`.
        1. The `{checksum}` from the query parameter MUST equal the `checksum` provided in the `Artifact`.
        1. The `{checksum_algo}` from the query parameter MUST equal the `checksum_algo` provided in the `Artifact`.
1.  The following validation is currently done using the `info` field. We will apply similar validation to the `UpgradeInstructions`.
    For each `Artifact`:
    1.  The `platform` MUST have the format `{OS}/{CPU}` or be `"any"`.
    1.  The `url` field MUST NOT be empty.
    1.  The `url` field MUST be a proper URL.
    1.  A `checksum` MUST be provided either in the `checksum` field or as a query parameter in the `url`.
    1.  If the `checksum` field has a value and the `url` also has a `checksum` query parameter, the two values MUST be equal.
    1.  The `url` MUST return either a file or an archive containing either `bin/{DAEMON_NAME}` or `{DAEMON_NAME}`.
    1.  If a `checksum` is provided (in the field or as a query param), the checksum of the result of the `url` MUST equal the provided checksum.

Downloading of an `Artifact` will happen the same way that URLs from `info` are currently downloaded.

### Cosmovisor Updates

If the `upgrade-info.json` file does not contain any `UpgradeInstructions`, existing functionality will be maintained.

We will update Cosmovisor to look for and handle the new `UpgradeInstructions` in `upgrade-info.json`.
If the `UpgradeInstructions` are provided, we will do the following:

1.  The `info` field will be ignored.
1.  The `artifacts` field will be used to identify the artifact to download based on the `platform` that Cosmovisor is running in.
1.  If a `checksum` is provided (either in the field or as a query param in the `url`), and the downloaded artifact has a different checksum, the upgrade process will be interrupted and Cosmovisor will exit with an error.
1.  If a `pre_run` command is defined, it will be executed at the same point in the process where the `app pre-upgrade` command would have been executed.
    It will be executed using the same environment as other commands run by Cosmovisor.
1.  If a `post_run` command is defined, it will be executed after executing the command that restarts the chain.
    It will be executed in a background process using the same environment as the other commands.
    Any output generated by the command will be logged.
    Once complete, the exit code will be logged.

We will deprecate the use of the `info` field for anything other than human readable information.
A warning will be logged if the `info` field is used to define the assets (either by URL or JSON).

The new upgrade timeline is very similar to the current one. Changes are in bold:

1. An upgrade governance proposal is submitted and approved.
1. The upgrade height is reached.
1. The `x/upgrade` module writes the `upgrade_info.json` file **(now possibly with `UpgradeInstructions`)**.
1. The chain halts.
1. Cosmovisor backs up the data directory (if set up to do so).
1. Cosmovisor downloads the new executable (if not already in place).
1. Cosmovisor executes **the `pre_run` command if provided**, or else the `${DAEMON_NAME} pre-upgrade` command.
1. Cosmovisor restarts the app using the new version and same args originally provided.
1. **Cosmovisor immediately runs the `post_run` command in a detached process.**

## Consequences

### Backwards Compatibility

Since the only change to existing definitions is the addition of the `instructions` field to the `Plan` message, and that field is optional, there are no backwards incompatibilities with respects to the proto messages.
Additionally, current behavior will be maintained when no `UpgradeInstructions` are provided, so there are no backwards incompatibilities with respects to either the upgrade module or Cosmovisor.

### Forwards Compatibility

In order to utilize the `UpgradeInstructions` as part of a software upgrade, both of the following must be true:

1.  The chain must already be using a sufficiently advanced version of the Cosmos SDK.
1.  The chain's nodes must be using a sufficiently advanced version of Cosmovisor.

### Positive

1.  The structure for defining artifacts is clearer since it is now defined in the proto instead of in documentation.
1.  Availability of a pre-run command becomes more obvious.
1.  A post-run command becomes possible.

### Negative

1.  The `Plan` message becomes larger. This is negligible because A) the `x/upgrades` module only stores at most one upgrade plan, and B) upgrades are rare enough that the increased gas cost isn't a concern.
1.  There is no option for providing a URL that will return the `UpgradeInstructions`.
1.  The only way to provide multiple assets (executables and other files) for a platform is to use an archive as the platform's artifact.

### Neutral

1. Existing functionality of the `info` field is maintained when the `UpgradeInstructions` aren't provided.

## Further Discussions

1.  [Draft PR #10032 Comment](https://github.com/cosmos/cosmos-sdk/pull/10032/files?authenticity_token=pLtzpnXJJB%2Fif2UWiTp9Td3MvRrBF04DvjSuEjf1azoWdLF%2BSNymVYw9Ic7VkqHgNLhNj6iq9bHQYnVLzMXd4g%3D%3D&file-filters%5B%5D=.go&file-filters%5B%5D=.proto#r698708349):
    Consider different names for `UpgradeInstructions instructions` (either the message type or field name).
1.  [Draft PR #10032 Comment](https://github.com/cosmos/cosmos-sdk/pull/10032/files?authenticity_token=pLtzpnXJJB%2Fif2UWiTp9Td3MvRrBF04DvjSuEjf1azoWdLF%2BSNymVYw9Ic7VkqHgNLhNj6iq9bHQYnVLzMXd4g%3D%3D&file-filters%5B%5D=.go&file-filters%5B%5D=.proto#r754655072):
    1.  Consider putting the `string platform` field inside `UpgradeInstructions` and make `UpgradeInstructions` a repeated field in `Plan`.
    1.  Consider using a `oneof` field in the `Plan` which could either be `UpgradeInstructions` or else a URL that should return the `UpgradeInstructions`.
    1.  Consider allowing `info` to either be a JSON serialized version of `UpgradeInstructions` or else a URL that returns that.
1.  [Draft PR #10032 Comment](https://github.com/cosmos/cosmos-sdk/pull/10032/files?authenticity_token=pLtzpnXJJB%2Fif2UWiTp9Td3MvRrBF04DvjSuEjf1azoWdLF%2BSNymVYw9Ic7VkqHgNLhNj6iq9bHQYnVLzMXd4g%3D%3D&file-filters%5B%5D=.go&file-filters%5B%5D=.proto#r755462876):
    Consider not including the `UpgradeInstructions.description` field, using the `info` field for that purpose instead.
1.  [Draft PR #10032 Comment](https://github.com/cosmos/cosmos-sdk/pull/10032/files?authenticity_token=pLtzpnXJJB%2Fif2UWiTp9Td3MvRrBF04DvjSuEjf1azoWdLF%2BSNymVYw9Ic7VkqHgNLhNj6iq9bHQYnVLzMXd4g%3D%3D&file-filters%5B%5D=.go&file-filters%5B%5D=.proto#r754643691):
    Consider allowing multiple artifacts to be downloaded for any given `platform` by adding a `name` field to the `Artifact` message.
1.  [PR #10502 Comment](https://github.com/cosmos/cosmos-sdk/pull/10602#discussion_r781438288)
    Allow the new `UpgradeInstructions` to be provided via URL.
1.  [PR #10502 Comment](https://github.com/cosmos/cosmos-sdk/pull/10602#discussion_r781438288)
    Allow definition of a `signer` for assets (as an alternative to using a `checksum`).

## References

* [Current upgrade.proto](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/proto/cosmos/upgrade/v1beta1/upgrade.proto)
* [Upgrade Module README](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/x/upgrade/spec/README.md)
* [Cosmovisor README](https://github.com/cosmos/cosmos-sdk/blob/cosmovisor/v1.0.0/cosmovisor/README.md)
* [Pre-upgrade README](https://github.com/cosmos/cosmos-sdk/blob/v0.44.5/docs/migrations/pre-upgrade.md)
* [Draft/POC PR #10032](https://github.com/cosmos/cosmos-sdk/pull/10032)
* [RFC 1738: Uniform Resource Locators](https://www.ietf.org/rfc/rfc1738.txt)
