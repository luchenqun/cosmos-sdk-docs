# ADR 023: Protocol Buffer 命名和版本约定

## 更新日志

* 2020年4月27日：初稿
* 2020年8月5日：更新指南

## 状态

已接受

## 背景

Protocol Buffers 提供了一个基本的[样式指南](https://developers.google.com/protocol-buffers/docs/style)，而 [Buf](https://buf.build/docs/style-guide) 在此基础上进行了扩展。在可能的情况下，我们希望遵循业界公认的指南和经验，以有效地使用 protobuf，只有在我们的用例有明确理由时才会偏离这些指南。

### 采用 `Any`

采用 `google.protobuf.Any` 作为推荐的编码接口类型的方法（而不是 `oneof`）使得包命名成为编码的核心部分，因为完全限定的消息名称现在出现在编码的消息中。

### 当前目录组织

到目前为止，我们大部分遵循了 [Buf](https://buf.build) 的[默认](https://buf.build/docs/lint-checkers#default)建议，只是在禁用 [`PACKAGE_DIRECTORY_MATCH`](https://buf.build/docs/lint-checkers#file_layout) 方面稍有偏离，尽管这对于开发代码很方便，但 Buf 警告说：

> 如果不这样做，您将在各种语言的许多 Protobuf 插件中遇到很多问题

### 采用 gRPC 查询

在 [ADR 021](adr-021-protobuf-query-encoding.md) 中，gRPC 被采用作为 Protobuf 原生查询的方式。因此，完整的 gRPC 服务路径成为 ABCI 查询路径的关键部分。在将来，通过诸如 CosmWasm 等技术，可能允许从持久化脚本中进行 gRPC 查询，并且这些查询路由将存储在脚本二进制文件中。

## 决策

本 ADR 的目标是提供周到的命名约定，以便：

* 在用户直接与 .proto 文件和完全限定的 protobuf 名称进行交互时，鼓励良好的用户体验
* 在简洁性和过度优化（使名称过短和晦涩）或不足优化（接受冗余信息较多的臃肿名称）之间取得平衡

这些准则旨在成为 Cosmos SDK 和第三方模块的样式指南。

作为起点，我们应该采用 [Buf](https://buf.build) 中的所有 [DEFAULT](https://buf.build/docs/lint-checkers#default) 检查器，包括 [`PACKAGE_DIRECTORY_MATCH`](https://buf.build/docs/lint-checkers#file_layout)，但不包括以下内容：

* [PACKAGE_VERSION_SUFFIX](https://buf.build/docs/lint-checkers#package_version_suffix)
* [SERVICE_SUFFIX](https://buf.build/docs/lint-checkers#service_suffix)

下面将描述更多准则。

### 原则

#### 简洁且描述性的命名

命名应该足够描述其含义，并与其他命名区分开来。

考虑到我们在 `google.protobuf.Any` 和 gRPC 查询路由中使用了完全限定名，我们应该尽量保持命名简洁，但不要过度。一般的经验法则是，如果一个更短的名字可以传达更多或相同的信息，那么选择更短的名字。

例如，`cosmos.bank.MsgSend`（19个字节）传达的信息与 `cosmos_sdk.x.bank.v1.MsgSend`（28个字节）大致相同，但更加简洁。

这种简洁性使得命名更加愉快，并且在交易和传输中占用的空间更小。

我们还应该抵制过度优化的诱惑，不要使用缩写来使命名变得晦涩。例如，我们不应该将 `cosmos.bank.MsgSend` 缩写为 `csm.bk.MSnd`，仅仅为了节省几个字节。

目标是使命名**_简洁而不晦涩_**。

#### 以客户为先的命名

包和类型的命名应该是为了用户的利益，而不仅仅是因为与 Go 代码库相关的遗留问题。

#### 长期支持计划

为了长期支持的利益，我们应该计划所选择的命名在很长一段时间内都在使用，所以现在是为未来做出最佳选择的机会。

### 版本控制

#### 关于稳定包版本的准则

一般来说，模式演化是更新 protobuf 模式的方式。这意味着新字段、消息和 RPC 方法被“添加”到现有模式中，旧字段、消息和 RPC 方法尽可能地保留。

在区块链场景中，破坏事物通常是不可接受的。例如，不可变的智能合约可能依赖于主链上的某些数据模式。如果主链破坏了这些模式，智能合约可能会无法修复地破坏。即使事物可以修复（例如在客户端软件中），这通常代价很高。

与其破坏事物，我们应该尽一切努力来演进模式，而不仅仅是破坏它们。应该在所有稳定（非 alpha 或 beta）的软件包上使用 [Buf](https://buf.build) 的破坏性变更检测，以防止此类破坏。

在此基础上，不同的稳定版本（例如 `v1` 或 `v2`）应该被视为不同的软件包，这应该是升级 protobuf 模式的最后手段。以下情况下可能需要创建 `v2`：

* 我们想要创建一个与现有模块功能类似的新模块，并且添加 `v2` 是最自然的方式。在这种情况下，实际上只有两个不同但相似的模块具有不同的 API。
* 我们想要为现有模块添加一个新的改进 API，但将其添加到现有软件包中太麻烦，因此将其放在 `v2` 中对用户更加清晰。在这种情况下，应注意不要废弃对 `v1` 的支持，如果它在不可变的智能合约中被积极使用。

#### 关于不稳定（alpha 和 beta）软件包版本的指南

建议按照以下准则将软件包标记为 alpha 或 beta：

* 只有在有积极讨论要在不久的将来删除或显著改变软件包时，才应将其标记为 `alpha` 或 `beta`，应优先将其放在稳定软件包中（例如 `v1` 或 `v2`）。
* 只有在有积极讨论要在不久的将来对功能进行重大重构/改进而不是删除时，才应将软件包标记为 `beta`。
* 模块可以在稳定（例如 `v1` 或 `v2`）和不稳定（`alpha` 或 `beta`）软件包中都有类型。

_`alpha`和`beta`不应该被使用来逃避对兼容性的责任。_
当代码发布到公共领域，尤其是在区块链上时，更改事物的成本很高。在某些情况下，例如不可变的智能合约，可能无法修复破坏性的更改。

当将某个东西标记为`alpha`或`beta`时，维护者应该考虑以下问题：

* 要求他人更改他们的代码的成本与我们保持更改选项的好处相比如何？
* 将其移动到`v1`的计划是什么，这将如何影响用户？

`alpha`或`beta`应该真正用于传达“计划进行更改”。

以gRPC反射为例，它位于`grpc.reflection.v1alpha`包中。自2017年以来，它没有发生过变化，现在被其他广泛使用的软件如gRPCurl使用。一些人可能在生产服务中使用它，所以如果他们实际上更改了包名为`grpc.reflection.v1`，一些软件将会出现问题，他们可能不想这样做...所以现在`v1alpha`包几乎成为事实上的`v1`。我们不要这样做。

以下是使用非稳定包的指南：

* 对于非稳定包，应该使用[Buf推荐的版本后缀](https://buf.build/docs/lint-checkers#package_version_suffix)（例如`v1alpha1`）
* 非稳定包通常应该被排除在破坏性更改检测之外
* 不可变的智能合约模块（例如CosmWasm）应该阻止智能合约/持久化脚本与`alpha`/`beta`包进行交互

#### 省略v1后缀

对于实际上没有第二个版本的包，我们可以省略[Buf推荐的版本后缀](https://buf.build/docs/lint-checkers#package_version_suffix)中的`v1`。这样可以为常见用例（如`cosmos.bank.Send`）提供更简洁的名称。具有第二个或第三个版本的包可以使用`.v2`或`.v3`来表示。

### 包命名

#### 采用短且唯一的顶级包名

顶级包应采用一个短名称，已知该名称不会与Cosmos生态系统中常见用法中的其他名称冲突。在不久的将来，应创建一个注册表来保留和索引在Cosmos生态系统中使用的顶级包名称。因为Cosmos SDK旨在为Cosmos项目提供顶级类型，所以建议在Cosmos SDK中使用顶级包名称`cosmos`，而不是较长的`cosmos_sdk`。[ICS](https://github.com/cosmos/ics)规范可以考虑使用基于标准编号的短顶级包名称，例如`ics23`。

#### 限制子包深度

应谨慎增加子包深度。通常一个模块或库只需要一个子包。尽管源代码中使用 `x` 或 `modules` 来表示模块，但对于 .proto 文件来说，这通常是不必要的，因为子包的主要用途是用于模块。只有那些已知很少使用的项目才应该有深层次的子包深度。

对于 Cosmos SDK，建议我们只需编写 `cosmos.bank`、`cosmos.gov` 等，而不是 `cosmos.x.bank`。实际上，大多数非模块类型可以直接放在 `cosmos` 包中，或者如果需要的话，我们可以引入一个 `cosmos.base` 包。请注意，这种命名方式 _不会_ 更改 go 包名，即 `cosmos.bank` 的 protobuf 包仍将位于 `x/bank` 中。

### 消息命名

消息类型名称应尽可能简洁，同时不失清晰度。在交易中使用的 `sdk.Msg` 类型将保留 `Msg` 前缀，因为这提供了有用的上下文。

### 服务和 RPC 命名

[ADR 021](adr-021-protobuf-query-encoding.md) 指定模块应实现一个 gRPC 查询服务。我们应该考虑查询服务和 RPC 名称的简洁原则，因为这些名称可能会被持久脚本模块（如 CosmWasm）调用。此外，用户可能会使用这些查询路径来调用类似 [gRPCurl](https://github.com/fullstorydev/grpcurl) 的工具。例如，我们可以将 `/cosmos_sdk.x.bank.v1.QueryService/QueryBalance` 缩短为 `/cosmos.bank.Query/Balance`，而不会丢失太多有用的信息。

RPC 请求和响应类型 _应该_ 遵循 `ServiceNameMethodNameRequest`/`ServiceNameMethodNameResponse` 的命名约定。例如，对于名为 `Balance` 的 RPC 方法，在 `Query` 服务上，请求和响应类型将分别是 `QueryBalanceRequest` 和 `QueryBalanceResponse`。这比 `BalanceRequest` 和 `BalanceResponse` 更加自解释。

#### 仅使用 `Query` 作为查询服务

与 [Buf 的默认服务后缀建议](https://github.com/cosmos/cosmos-sdk/pull/6033) 不同，我们应该只使用更短的 `Query` 作为查询服务的后缀。

对于其他类型的gRPC服务，我们应该考虑遵循Buf的默认建议。

#### 从查询服务RPC名称中省略`Get`和`Query`

在`Query`服务名称中应省略`Get`和`Query`，因为在完全限定名称中它们是多余的。例如，`/cosmos.bank.Query/QueryBalance`只是重复了两次`Query`而没有提供任何新信息。

## 未来的改进

应创建一个顶级包名称的注册表，以协调整个生态系统中的命名，防止冲突，并帮助开发人员发现有用的模式。一个简单的起点可以是一个具有社区治理的git存储库。

## 影响

### 积极的

* 名称将更简洁，更易于阅读和输入
* 所有使用`Any`的交易将更短（`_sdk.x`和`.v1`将被删除）
* `.proto`文件的导入将更标准（路径中不包含`"third_party/proto"`）
* 代码生成对于客户端将更容易，因为`.proto`文件将位于单个`proto/`目录中，可以直接复制，而不是分散在整个Cosmos SDK中

### 负面的

### 中性的

* `.proto`文件需要重新组织和重构
* 一些模块可能需要标记为alpha或beta

## 参考资料


# ADR 023: Protocol Buffer Naming and Versioning Conventions

## Changelog

* 2020 April 27: Initial Draft
* 2020 August 5: Update guidelines

## Status

Accepted

## Context

Protocol Buffers provide a basic [style guide](https://developers.google.com/protocol-buffers/docs/style)
and [Buf](https://buf.build/docs/style-guide) builds upon that. To the
extent possible, we want to follow industry accepted guidelines and wisdom for
the effective usage of protobuf, deviating from those only when there is clear
rationale for our use case.

### Adoption of `Any`

The adoption of `google.protobuf.Any` as the recommended approach for encoding
interface types (as opposed to `oneof`) makes package naming a central part
of the encoding as fully-qualified message names now appear in encoded
messages.

### Current Directory Organization

Thus far we have mostly followed [Buf's](https://buf.build) [DEFAULT](https://buf.build/docs/lint-checkers#default)
recommendations, with the minor deviation of disabling [`PACKAGE_DIRECTORY_MATCH`](https://buf.build/docs/lint-checkers#file_layout)
which although being convenient for developing code comes with the warning
from Buf that:

> you will have a very bad time with many Protobuf plugins across various languages if you do not do this

### Adoption of gRPC Queries

In [ADR 021](adr-021-protobuf-query-encoding.md), gRPC was adopted for Protobuf
native queries. The full gRPC service path thus becomes a key part of ABCI query
path. In the future, gRPC queries may be allowed from within persistent scripts
by technologies such as CosmWasm and these query routes would be stored within
script binaries.

## Decision

The goal of this ADR is to provide thoughtful naming conventions that:

* encourage a good user experience for when users interact directly with
.proto files and fully-qualified protobuf names
* balance conciseness against the possibility of either over-optimizing (making
names too short and cryptic) or under-optimizing (just accepting bloated names
with lots of redundant information)

These guidelines are meant to act as a style guide for both the Cosmos SDK and
third-party modules.

As a starting point, we should adopt all of the [DEFAULT](https://buf.build/docs/lint-checkers#default)
checkers in [Buf's](https://buf.build) including [`PACKAGE_DIRECTORY_MATCH`](https://buf.build/docs/lint-checkers#file_layout),
except:

* [PACKAGE_VERSION_SUFFIX](https://buf.build/docs/lint-checkers#package_version_suffix)
* [SERVICE_SUFFIX](https://buf.build/docs/lint-checkers#service_suffix)

Further guidelines to be described below.

### Principles

#### Concise and Descriptive Names

Names should be descriptive enough to convey their meaning and distinguish
them from other names.

Given that we are using fully-qualifed names within
`google.protobuf.Any` as well as within gRPC query routes, we should aim to
keep names concise, without going overboard. The general rule of thumb should
be if a shorter name would convey more or else the same thing, pick the shorter
name.

For instance, `cosmos.bank.MsgSend` (19 bytes) conveys roughly the same information
as `cosmos_sdk.x.bank.v1.MsgSend` (28 bytes) but is more concise.

Such conciseness makes names both more pleasant to work with and take up less
space within transactions and on the wire.

We should also resist the temptation to over-optimize, by making names
cryptically short with abbreviations. For instance, we shouldn't try to
reduce `cosmos.bank.MsgSend` to `csm.bk.MSnd` just to save a few bytes.

The goal is to make names **_concise but not cryptic_**.

#### Names are for Clients First

Package and type names should be chosen for the benefit of users, not
necessarily because of legacy concerns related to the go code-base.

#### Plan for Longevity

In the interests of long-term support, we should plan on the names we do
choose to be in usage for a long time, so now is the opportunity to make
the best choices for the future.

### Versioning

#### Guidelines on Stable Package Versions

In general, schema evolution is the way to update protobuf schemas. That means that new fields,
messages, and RPC methods are _added_ to existing schemas and old fields, messages and RPC methods
are maintained as long as possible.

Breaking things is often unacceptable in a blockchain scenario. For instance, immutable smart contracts
may depend on certain data schemas on the host chain. If the host chain breaks those schemas, the smart
contract may be irreparably broken. Even when things can be fixed (for instance in client software),
this often comes at a high cost.

Instead of breaking things, we should make every effort to evolve schemas rather than just breaking them.
[Buf](https://buf.build) breaking change detection should be used on all stable (non-alpha or beta) packages
to prevent such breakage.

With that in mind, different stable versions (i.e. `v1` or `v2`) of a package should more or less be considered
different packages and this should be last resort approach for upgrading protobuf schemas. Scenarios where creating
a `v2` may make sense are:

* we want to create a new module with similar functionality to an existing module and adding `v2` is the most natural
way to do this. In that case, there are really just two different, but similar modules with different APIs.
* we want to add a new revamped API for an existing module and it's just too cumbersome to add it to the existing package,
so putting it in `v2` is cleaner for users. In this case, care should be made to not deprecate support for
`v1` if it is actively used in immutable smart contracts.

#### Guidelines on unstable (alpha and beta) package versions

The following guidelines are recommended for marking packages as alpha or beta:

* marking something as `alpha` or `beta` should be a last resort and just putting something in the
stable package (i.e. `v1` or `v2`) should be preferred
* a package _should_ be marked as `alpha` _if and only if_ there are active discussions to remove
or significantly alter the package in the near future
* a package _should_ be marked as `beta` _if and only if_ there is an active discussion to
significantly refactor/rework the functionality in the near future but not remove it
* modules _can and should_ have types in both stable (i.e. `v1` or `v2`) and unstable (`alpha` or `beta`) packages.

_`alpha` and `beta` should not be used to avoid responsibility for maintaining compatibility._
Whenever code is released into the wild, especially on a blockchain, there is a high cost to changing things. In some
cases, for instance with immutable smart contracts, a breaking change may be impossible to fix.

When marking something as `alpha` or `beta`, maintainers should ask the questions:

* what is the cost of asking others to change their code vs the benefit of us maintaining the optionality to change it?
* what is the plan for moving this to `v1` and how will that affect users?

`alpha` or `beta` should really be used to communicate "changes are planned".

As a case study, gRPC reflection is in the package `grpc.reflection.v1alpha`. It hasn't been changed since
2017 and it is now used in other widely used software like gRPCurl. Some folks probably use it in production services
and so if they actually went and changed the package to `grpc.reflection.v1`, some software would break and
they probably don't want to do that... So now the `v1alpha` package is more or less the de-facto `v1`. Let's not do that.

The following are guidelines for working with non-stable packages:

* [Buf's recommended version suffix](https://buf.build/docs/lint-checkers#package_version_suffix)
(ex. `v1alpha1`) _should_ be used for non-stable packages
* non-stable packages should generally be excluded from breaking change detection
* immutable smart contract modules (i.e. CosmWasm) _should_ block smart contracts/persistent
scripts from interacting with `alpha`/`beta` packages

#### Omit v1 suffix

Instead of using [Buf's recommended version suffix](https://buf.build/docs/lint-checkers#package_version_suffix),
we can omit `v1` for packages that don't actually have a second version. This
allows for more concise names for common use cases like `cosmos.bank.Send`.
Packages that do have a second or third version can indicate that with `.v2`
or `.v3`.

### Package Naming

#### Adopt a short, unique top-level package name

Top-level packages should adopt a short name that is known to not collide with
other names in common usage within the Cosmos ecosystem. In the near future, a
registry should be created to reserve and index top-level package names used
within the Cosmos ecosystem. Because the Cosmos SDK is intended to provide
the top-level types for the Cosmos project, the top-level package name `cosmos`
is recommended for usage within the Cosmos SDK instead of the longer `cosmos_sdk`.
[ICS](https://github.com/cosmos/ics) specifications could consider a
short top-level package like `ics23` based upon the standard number.

#### Limit sub-package depth

Sub-package depth should be increased with caution. Generally a single
sub-package is needed for a module or a library. Even though `x` or `modules`
is used in source code to denote modules, this is often unnecessary for .proto
files as modules are the primary thing sub-packages are used for. Only items which
are known to be used infrequently should have deep sub-package depths.

For the Cosmos SDK, it is recommended that that we simply write `cosmos.bank`,
`cosmos.gov`, etc. rather than `cosmos.x.bank`. In practice, most non-module
types can go straight in the `cosmos` package or we can introduce a
`cosmos.base` package if needed. Note that this naming _will not_ change
go package names, i.e. the `cosmos.bank` protobuf package will still live in
`x/bank`.

### Message Naming

Message type names should be as concise possible without losing clarity. `sdk.Msg`
types which are used in transactions will retain the `Msg` prefix as that provides
helpful context.

### Service and RPC Naming

[ADR 021](adr-021-protobuf-query-encoding.md) specifies that modules should
implement a gRPC query service. We should consider the principle of conciseness
for query service and RPC names as these may be called from persistent script
modules such as CosmWasm. Also, users may use these query paths from tools like
[gRPCurl](https://github.com/fullstorydev/grpcurl). As an example, we can shorten
`/cosmos_sdk.x.bank.v1.QueryService/QueryBalance` to
`/cosmos.bank.Query/Balance` without losing much useful information.

RPC request and response types _should_ follow the `ServiceNameMethodNameRequest`/
`ServiceNameMethodNameResponse` naming convention. i.e. for an RPC method named `Balance`
on the `Query` service, the request and response types would be `QueryBalanceRequest`
and `QueryBalanceResponse`. This will be more self-explanatory than `BalanceRequest`
and `BalanceResponse`.

#### Use just `Query` for the query service

Instead of [Buf's default service suffix recommendation](https://github.com/cosmos/cosmos-sdk/pull/6033),
we should simply use the shorter `Query` for query services.

For other types of gRPC services, we should consider sticking with Buf's
default recommendation.

#### Omit `Get` and `Query` from query service RPC names

`Get` and `Query` should be omitted from `Query` service names because they are
redundant in the fully-qualified name. For instance, `/cosmos.bank.Query/QueryBalance`
just says `Query` twice without any new information.

## Future Improvements

A registry of top-level package names should be created to coordinate naming
across the ecosystem, prevent collisions, and also help developers discover
useful schemas. A simple starting point would be a git repository with
community-based governance.

## Consequences

### Positive

* names will be more concise and easier to read and type
* all transactions using `Any` will be at shorter (`_sdk.x` and `.v1` will be removed)
* `.proto` file imports will be more standard (without `"third_party/proto"` in
the path)
* code generation will be easier for clients because .proto files will be
in a single `proto/` directory which can be copied rather than scattered
throughout the Cosmos SDK

### Negative

### Neutral

* `.proto`  files will need to be reorganized and refactored
* some modules may need to be marked as alpha or beta

## References
