# ADR 053: Go模块重构

## 更新日志

* 2022-04-27: 初稿

## 状态

提议中

## 摘要

当前的SDK是作为一个单一的大型Go模块构建的。本ADR描述了我们如何将SDK重构为更小的、独立版本的Go模块，以便更容易进行维护。

## 背景

Go模块对软件项目有一定的要求，特别是对于稳定的版本号（大于0.x）来说，[任何API破坏性的变更都需要增加主版本号](https://go.dev/doc/modules/release-workflow#breaking)，从技术上讲，这会创建一个新的Go模块（带有v2、v3等后缀）。

以这种方式[保持模块的API兼容性](https://go.dev/blog/module-compatibility)需要一定的思考和纪律。

Cosmos SDK是一个相当大的项目，它在Go模块出现之前就开始了，并且一直处于v0.x版本，尽管它已经在生产环境中使用了多年。这并不是因为它不是生产质量的软件，而是因为Go模块所要求的API兼容性保证对于如此大的项目来说相当复杂。到目前为止，通常认为能够在需要时打破API比要求所有用户更新所有包导入路径以适应破坏性变更（导致v2、v3等发布）更为重要。这还要加上与protobuf生成的代码相关的其他复杂性，这将在另一个ADR中解决。

尽管如此，社区对语义化版本的需求一直很强烈，而单一的Go模块发布流程使得及时发布独立功能的小改进变得非常困难。发布周期通常超过六个月，这意味着在一两天内完成的小改进会被整个大型发布周期所阻塞。

## 决策

为了改善当前的情况，SDK正在被重构为多个Go模块，这些模块位于当前的代码库中。关于如何做到这一点，已经进行了[相当多的讨论](https://github.com/cosmos/cosmos-sdk/discussions/10582#discussioncomment-1813377)，一些开发人员主张更大的模块范围，而另一些人则主张更小的模块范围。这两种方法都有利弊（将在下面的[后果](#consequences)部分讨论），但采用的方法是：

* 一个Go模块通常应该限定于特定的一组相关功能（例如数学、错误、存储等）。
* 当代码从核心SDK中移除并移到新的模块路径时，应尽一切努力避免对现有代码进行API破坏性更改，可以使用别名和包装类型来实现（如在https://github.com/cosmos/cosmos-sdk/pull/10779和https://github.com/cosmos/cosmos-sdk/pull/11788中所做的）。
* 在将新的Go模块标记为`v1.0.0`之前，应将其移至独立的域名（`cosmossdk.io`），以适应它们将来可能更适合独立存储库的可能性。
* 所有的Go模块在标记为`v1.0.0`之前都应遵循https://go.dev/blog/module-compatibility中的指南，并应使用`internal`包来限制公开的API接口。
* 新的Go模块的API可能会与现有代码有所不同，如果有明显的改进或需要删除旧的依赖项（例如amino或gogo proto），则可以使用别名和包装器来避免API破坏。
* 当尝试将现有包转换为新的Go模块时，需要小心处理：https://github.com/golang/go/wiki/Modules#is-it-possible-to-add-a-module-to-a-multi-module-repository。总的来说，与其尝试将旧的包转换为新的模块，似乎更安全的做法是创建一个新的模块路径（如果需要，附加v2、v3等）。

## 影响

### 向后兼容性

如果按照上述指南使用别名或包装类型指向指向新的Go模块的现有API，应该不会或只会有非常有限的对现有API的破坏性更改。

### 积极影响

* 独立的软件组件将更快地达到`v1.0.0`版本。
* 特定功能的新功能将更早发布。

### 负面影响

* 在SDK本身和每个项目中将有更多的Go模块版本需要更新，尽管其中大部分希望是间接的。

### 中性影响

## 进一步讨论

进一步的讨论主要在https://github.com/cosmos/cosmos-sdk/discussions/10582和Cosmos SDK Framework Working Group内进行。

## 参考资料

* [https://go.dev/doc/modules/release-workflow](https://go.dev/doc/modules/release-workflow)
* [https://go.dev/blog/module-compatibility](https://go.dev/blog/module-compatibility)
* [https://github.com/cosmos/cosmos-sdk/discussions/10162](https://github.com/cosmos/cosmos-sdk/discussions/10162)
* [https://github.com/cosmos/cosmos-sdk/discussions/10582](https://github.com/cosmos/cosmos-sdk/discussions/10582)
* [https://github.com/cosmos/cosmos-sdk/pull/10779](https://github.com/cosmos/cosmos-sdk/pull/10779)
* [https://github.com/cosmos/cosmos-sdk/pull/11788](https://github.com/cosmos/cosmos-sdk/pull/11788)


# ADR 053: Go Module Refactoring

## Changelog

* 2022-04-27: First Draft

## Status

PROPOSED

## Abstract

The current SDK is built as a single monolithic go module. This ADR describes
how we refactor the SDK into smaller independently versioned go modules
for ease of maintenance.

## Context

Go modules impose certain requirements on software projects with respect to
stable version numbers (anything above 0.x) in that [any API breaking changes
necessitate a major version](https://go.dev/doc/modules/release-workflow#breaking)
increase which technically creates a new go module
(with a v2, v3, etc. suffix).

[Keeping modules API compatible](https://go.dev/blog/module-compatibility) in
this way requires a fair amount of fair thought and discipline.

The Cosmos SDK is a fairly large project which originated before go modules
came into existence and has always been under a v0.x release even though
it has been used in production for years now, not because it isn't production
quality software, but rather because the API compatibility guarantees required
by go modules are fairly complex to adhere to with such a large project.
Up to now, it has generally been deemed more important to be able to break the
API if needed rather than require all users update all package import paths
to accommodate breaking changes causing v2, v3, etc. releases. This is in
addition to the other complexities related to protobuf generated code that will
be addressed in a separate ADR.

Nevertheless, the desire for semantic versioning has been [strong in the
community](https://github.com/cosmos/cosmos-sdk/discussions/10162) and the
single go module release process has made it very hard to
release small changes to isolated features in a timely manner. Release cycles
often exceed six months which means small improvements done in a day or
two get bottle-necked by everything else in the monolithic release cycle.

## Decision

To improve the current situation, the SDK is being refactored into multiple
go modules within the current repository. There has been a [fair amount of
debate](https://github.com/cosmos/cosmos-sdk/discussions/10582#discussioncomment-1813377)
as to how to do this, with some developers arguing for larger vs smaller
module scopes. There are pros and cons to both approaches (which will be
discussed below in the [Consequences](#consequences) section), but the
approach being adopted is the following:

* a go module should generally be scoped to a specific coherent set of
functionality (such as math, errors, store, etc.)
* when code is removed from the core SDK and moved to a new module path, every 
effort should be made to avoid API breaking changes in the existing code using
aliases and wrapper types (as done in https://github.com/cosmos/cosmos-sdk/pull/10779
and https://github.com/cosmos/cosmos-sdk/pull/11788)
* new go modules should be moved to a standalone domain (`cosmossdk.io`) before
being tagged as `v1.0.0` to accommodate the possibility that they may be
better served by a standalone repository in the future
* all go modules should follow the guidelines in https://go.dev/blog/module-compatibility
before `v1.0.0` is tagged and should make use of `internal` packages to limit
the exposed API surface
* the new go module's API may deviate from the existing code where there are
clear improvements to be made or to remove legacy dependencies (for instance on
amino or gogo proto), as long the old package attempts
to avoid API breakage with aliases and wrappers
* care should be taken when simply trying to turn an existing package into a
new go module: https://github.com/golang/go/wiki/Modules#is-it-possible-to-add-a-module-to-a-multi-module-repository.
In general, it seems safer to just create a new module path (appending v2, v3, etc.
if necessary), rather than trying to make an old package a new module.

## Consequences

### Backwards Compatibility

If the above guidelines are followed to use aliases or wrapper types pointing
in existing APIs that point back to the new go modules, there should be no or
very limited breaking changes to existing APIs.

### Positive

* standalone pieces of software will reach `v1.0.0` sooner
* new features to specific functionality will be released sooner 

### Negative

* there will be more go module versions to update in the SDK itself and
per-project, although most of these will hopefully be indirect

### Neutral

## Further Discussions

Further discussions are occurring in primarily in
https://github.com/cosmos/cosmos-sdk/discussions/10582 and within
the Cosmos SDK Framework Working Group.

## References

* https://go.dev/doc/modules/release-workflow
* https://go.dev/blog/module-compatibility
* https://github.com/cosmos/cosmos-sdk/discussions/10162
* https://github.com/cosmos/cosmos-sdk/discussions/10582
* https://github.com/cosmos/cosmos-sdk/pull/10779
* https://github.com/cosmos/cosmos-sdk/pull/11788
