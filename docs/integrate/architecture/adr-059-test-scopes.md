# ADR 059: 测试范围

## 变更日志

* 2022-08-02: 初始草稿
* 2023-03-02: 为集成测试添加精确度
* 2023-03-23: 为端到端测试添加精确度

## 状态

提议 部分实施

## 摘要

最近在 SDK 中的工作旨在拆分单体根 Go 模块，这突显了我们测试范式中的不足和不一致之处。本 ADR 阐明了关于测试范围的共同语言，并提出了每个范围中测试的理想状态。

## 背景

[ADR-053: Go 模块重构](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-053-go-module-refactoring.md) 表达了我们希望 SDK 由许多独立版本的 Go 模块组成的愿望，而 [ADR-057: 应用程序连接](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-057-app-wiring.md) 则提供了一种通过依赖注入来拆分模块间依赖关系的方法论。正如 [EPIC: 将所有 SDK 模块分解为独立的 Go 模块](https://github.com/cosmos/cosmos-sdk/issues/11899) 中所描述的那样，模块依赖在测试阶段尤其复杂，其中 simapp 用作设置和运行测试的关键测试夹具。很明显，该 EPIC 的第 3 和第 4 阶段的成功完成需要解决这个依赖问题。

在 [EPIC: 通过模拟进行模块的单元测试](https://github.com/cosmos/cosmos-sdk/issues/12398) 中，人们认为可以通过在每个模块的测试阶段模拟所有依赖项来解开这个难题，但是由于这些重构是测试套件的完全重写，因此开始讨论现有集成测试的命运。一种观点是它们应该被丢弃，另一种观点是集成测试在 SDK 的测试故事中具有一定的实用性和位置。

另一个令人困惑的问题是当前 CLI 测试套件的状态，例如 [x/auth](https://github.com/cosmos/cosmos-sdk/blob/0f7e56c6f9102cda0ca9aba5b6f091dbca976b5a/x/auth/client/testutil/suite.go#L44-L49)。在代码中，它们被称为集成测试，但实际上它们是通过启动 tendermint 节点和完整应用程序来进行端到端测试。[EPIC: 重写和简化 CLI 测试](https://github.com/cosmos/cosmos-sdk/issues/12696) 确定了使用模拟的 CLI 测试的理想状态，但没有解决端到端测试在 SDK 中可能存在的位置。

从这里开始，我们确定了三个测试范围，**单元测试**，**集成测试**和**端到端测试**，旨在定义每个范围的边界，它们的缺点（真实和强制性），以及它们在SDK中的理想状态。

### 单元测试

单元测试独立于代码库中的其他部分，对一个单一模块（例如`/x/bank`）或包（例如`/client`）中的代码进行测试。在这里，我们确定了两个级别的单元测试，即*示例*和*路径*。下面的定义在很大程度上依赖于[The BDD Books - Formulation](https://leanpub.com/bddbooks-formulation)第1.3节。

*示例*测试独立地测试模块的一个原子部分 - 在这种情况下，我们可能会对模块的其他部分进行固定设置/模拟。

使用模拟依赖项来测试整个模块的功能的测试属于*路径*测试。这些测试与集成测试几乎相似，因为它们一起测试了许多内容，但仍然使用模拟。

示例1 路径测试与示例测试 - [depinject的BDD风格测试](https://github.com/cosmos/cosmos-sdk/blob/main/depinject/features/bindings.feature)，展示了我们如何快速构建许多示例案例，以演示行为规则，而[代码量很少](https://github.com/cosmos/cosmos-sdk/blob/main/depinject/binding_test.go)，同时保持高层次的可读性。

示例2 [depinject表驱动测试](https://github.com/cosmos/cosmos-sdk/blob/main/depinject/provider_desc_test.go)

示例3 [Bank keeper测试](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/x/bank/keeper/keeper_test.go#L94-L105) - 给keeper构造函数提供了一个`AccountKeeper`的模拟实现。

#### 限制

某些模块在测试阶段之外紧密耦合。最近对`bank -> auth`的依赖关系报告发现，在`bank`中总共使用了274次`auth`，其中50次是在生产代码中，224次是在测试中。这种紧密耦合可能表明，这些模块应该合并，或者需要重构以抽象出将模块联系在一起的核心类型的引用。这也可能表明，这些模块应该在模拟的单元测试之外进行集成测试。

在某些情况下，为具有许多模拟依赖项的模块设置测试用例可能非常麻烦，并且生成的测试可能只能显示模拟框架按预期工作，而不是作为相互依赖模块行为的功能测试。

### 集成测试

集成测试定义并测试任意数量的模块和/或应用程序子系统之间的关系。

集成测试的连接由`depinject`提供，并且一些[辅助代码](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/testutil/sims/app_helpers.go#L95)启动了一个正在运行的应用程序。然后可以测试运行中的应用程序的某个部分。在应用程序生命周期的不同阶段期望产生不变的输出，而不太关注组件内部。这种类型的黑盒测试比单元测试的范围更大。

示例1 [client/grpc_query_test/TestGRPCQuery](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/client/grpc_query_test.go#L111-L129) - 此测试放错了位置，但测试了（至少）`runtime`和`bank`在启动、创世和查询时的生命周期。它还通过使用[QueryServiceTestHelper](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/baseapp/grpcrouter_helpers.go#L31)在不通过网络发送字节的情况下测试了客户端和查询服务器的适应性。

示例2 `x/evidence` Keeper集成测试 - 启动由[8个模块](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/x/evidence/testutil/app.yaml#L1)和[5个keeper](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/x/evidence/keeper/keeper_test.go#L101-L106)组成的应用程序，这些keeper在集成测试套件中使用。套件中的一个测试通过[HandleEquivocationEvidence](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/x/evidence/keeper/infraction_test.go#L42)来测试，其中包含与质押keeper的许多交互。

示例3 - 集成套件应用程序配置也可以通过golang（而不是上述的YAML）[静态地](https://github.com/cosmos/cosmos-sdk/blob/main/x/nft/testutil/app_config.go)或[动态地](https://github.com/cosmos/cosmos-sdk/blob/8c23f6f957d1c0bedd314806d1ac65bea59b084c/tests/integration/bank/keeper/keeper_test.go#L129-L134)指定。

#### 限制

由于应用程序从零状态开始，设置特定的输入状态可能更具挑战性。其中一些问题可以通过良好的测试夹具抽象来解决，并进行测试。测试也可能更加脆弱，较大的重构可能会以意想不到的方式影响应用程序初始化，并导致更难理解的错误。这也可以被视为一种好处，事实上，SDK的当前集成测试在早期的应用程序连接重构阶段有助于追踪逻辑错误。

### 模拟

模拟（也称为生成测试）是集成测试的一种特殊情况，其中针对运行中的simapp执行确定性随机模块操作，构建链上的区块，直到达到指定的高度。对于由模块操作导致的状态转换，不会进行*特定*断言，但任何错误都会停止并失败模拟。由于`crisis`包含在simapp中，并且模拟在每个区块的末尾运行EndBlockers，任何模块不变性违规也会导致模拟失败。

模块必须实现[AppModuleSimulation.WeightedOperations](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/types/module/simulation.go#L31)来定义它们的模拟操作。请注意，并非所有模块都实现了这个接口，这可能表示当前模拟测试覆盖范围存在差距。

不返回模拟操作的模块：

* `auth`
* `evidence`
* `mint`
* `params`

一个单独的二进制文件，[runsim](https://github.com/cosmos/tools/tree/master/cmd/runsim)，负责启动其中一些测试并管理它们的生命周期。

#### 限制

* [成功](https://github.com/cosmos/cosmos-sdk/runs/7606931983?check_suite_focus=true) 可能需要很长时间来运行，在 CI 中每个模拟需要 7-10 分钟。
* [超时](https://github.com/cosmos/cosmos-sdk/runs/7606932295?check_suite_focus=true) 有时会在明显成功的情况下发生，没有任何指示原因。
* CI 中没有提供有用的错误消息，需要开发人员在本地运行模拟以重现 [失败](https://github.com/cosmos/cosmos-sdk/runs/7606932548?check_suite_focus=true)。

### E2E 测试

端到端测试尽可能接近生产环境，对整个系统进行测试。目前这些测试位于 [tests/e2e](https://github.com/cosmos/cosmos-sdk/tree/main/tests/e2e)，并依赖于 [testutil/network](https://github.com/cosmos/cosmos-sdk/tree/main/testutil/network) 来启动一个内部 Tendermint 节点。

应尽可能简化应用程序以测试所需的功能。SDK 仅使用测试所需的模块。建议应用程序开发人员在 E2E 测试中使用自己的应用程序。

#### 限制

总体而言，端到端测试的限制在于编排和计算成本。需要搭建脚手架来启动和运行类似生产环境的环境，这个过程比单元测试或集成测试的启动和运行时间更长。

Tendermint 代码中的全局锁在 CI 环境中有时会导致有状态的启动/停止出现挂起或间歇性失败。

E2E 测试的范围已与命令行界面测试相结合。

## 决策

我们接受这些测试范围，并为每个范围确定以下决策点。

| 范围       | 应用程序类型        | 模拟？ |
| ----------- | ------------------- | ------ |
| 单元测试        | 无                | 是    |
| 集成测试 | 集成测试辅助工具 | 一些   |
| 模拟  | 最小化应用程序         | 否     |
| E2E         | 最小化应用程序         | 否     |

上述决策对于 SDK 是有效的。应用程序开发人员应该使用完整的应用程序来测试他们的应用程序，而不是使用最小化的应用程序。

### 单元测试

所有模块都必须具备模拟的单元测试覆盖率。

示例测试应该比单元测试中的路径数量多。

单元测试应该比集成测试中的数量多。

单元测试不能引入除了已经存在于生产代码中的依赖之外的其他依赖项。

当根据[EPIC: Unit testing of modules via mocks](https://github.com/cosmos/cosmos-sdk/issues/12398)的要求引入模块单元测试时，如果导致集成测试套件的几乎完全重写，则应保留该测试套件并将其移动到`/tests/integration`目录下。我们接受测试逻辑的重复，但建议通过添加示例测试来改进单元测试套件。

### 集成测试

所有集成测试都应位于`/tests/integration`目录下，即使它们不引入额外的模块依赖项。

为了限制范围和复杂性，建议在应用程序启动时使用尽可能少的模块，即不依赖于simapp。

集成测试应该比端到端测试的数量多。

### 模拟

模拟应使用最小的应用程序（通常通过应用程序的连接）进行。它们位于`/x/{moduleName}/simulation`目录下。

### 端到端测试

现有的端到端测试应通过移除对测试网络和进程内Tendermint节点的依赖来迁移到集成测试中，以确保我们不会失去测试覆盖。

端到端测试运行器应从进程内Tendermint过渡到由[Docker](https://github.com/ory/dockertest)驱动的运行器。

应编写测试涵盖完整网络升级的端到端测试。

现有端到端测试中的CLI测试部分应使用[PR#12706](https://github.com/cosmos/cosmos-sdk/pull/12706)中演示的网络模拟进行重写。

## 结果

### 积极的结果

* 增加了测试覆盖率
* 改进了测试组织
* 减少了模块中的依赖图大小
* 从模块中删除了simapp作为依赖项
* 移除了测试代码中引入的模块间依赖关系
* 在从进程内Tendermint过渡后，减少了CI运行时间

### 负面

* 在过渡期间，单元测试和集成测试之间存在一些测试逻辑重复
* 使用 dockertest DX 编写的测试可能稍微差一些

### 中性

* 过渡到 dockertest 需要一些发现工作

## 进一步讨论

如果测试套件可以在集成模式下运行（使用模拟的 tendermint）或者使用端到端的固定装置（使用真实的 tendermint 和多个节点），可能会很有用。集成固定装置可以用于更快的运行，端到端固定装置可以用于更加稳定的测试。

在 PR [#12847](https://github.com/cosmos/cosmos-sdk/pull/12847) 中完成了一个 PoC `x/gov`，用于演示单元测试的 BDD [已拒绝]。观察到 BDD 规范的优点是可读性强，缺点是编写和维护时的认知负荷，目前的共识是将 BDD 用于 SDK 中展示复杂规则和模块交互的地方。更直接或低级的测试案例将继续依赖于 go 表格测试。

在集成和端到端测试中，网络模拟的级别仍在进行中，并正在形式化。


# ADR 059: Test Scopes

## Changelog

* 2022-08-02: Initial Draft
* 2023-03-02: Add precision for integration tests
* 2023-03-23: Add precision for E2E tests

## Status

PROPOSED Partially Implemented

## Abstract

Recent work in the SDK aimed at breaking apart the monolithic root go module has highlighted
shortcomings and inconsistencies in our testing paradigm. This ADR clarifies a common
language for talking about test scopes and proposes an ideal state of tests at each scope.

## Context

[ADR-053: Go Module Refactoring](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-053-go-module-refactoring.md) expresses our desire for an SDK composed of many
independently versioned Go modules, and [ADR-057: App Wiring](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-057-app-wiring.md) offers a methodology
for breaking apart inter-module dependencies through the use of dependency injection. As
described in [EPIC: Separate all SDK modules into standalone go modules](https://github.com/cosmos/cosmos-sdk/issues/11899), module
dependencies are particularly complected in the test phase, where simapp is used as
the key test fixture in setting up and running tests. It is clear that the successful
completion of Phases 3 and 4 in that EPIC require the resolution of this dependency problem.

In [EPIC: Unit Testing of Modules via Mocks](https://github.com/cosmos/cosmos-sdk/issues/12398) it was thought this Gordian knot could be
unwound by mocking all dependencies in the test phase for each module, but seeing how these
refactors were complete rewrites of test suites discussions began around the fate of the
existing integration tests. One perspective is that they ought to be thrown out, another is
that integration tests have some utility of their own and a place in the SDK's testing story.

Another point of confusion has been the current state of CLI test suites, [x/auth](https://github.com/cosmos/cosmos-sdk/blob/0f7e56c6f9102cda0ca9aba5b6f091dbca976b5a/x/auth/client/testutil/suite.go#L44-L49) for
example. In code these are called integration tests, but in reality function as end to end
tests by starting up a tendermint node and full application. [EPIC: Rewrite and simplify
CLI tests](https://github.com/cosmos/cosmos-sdk/issues/12696) identifies the ideal state of CLI tests using mocks, but does not address the
place end to end tests may have in the SDK.

From here we identify three scopes of testing, **unit**, **integration**, **e2e** (end to
end), seek to define the boundaries of each, their shortcomings (real and imposed), and their
ideal state in the SDK.

### Unit tests

Unit tests exercise the code contained in a single module (e.g. `/x/bank`) or package
(e.g. `/client`) in isolation from the rest of the code base. Within this we identify two
levels of unit tests, *illustrative* and *journey*. The definitions below lean heavily on
[The BDD Books - Formulation](https://leanpub.com/bddbooks-formulation) section 1.3.

*Illustrative* tests exercise an atomic part of a module in isolation - in this case we
might do fixture setup/mocking of other parts of the module.

Tests which exercise a whole module's function with dependencies mocked, are *journeys*.
These are almost like integration tests in that they exercise many things together but still
use mocks.

Example 1 journey vs illustrative tests - [depinject's BDD style tests](https://github.com/cosmos/cosmos-sdk/blob/main/depinject/features/bindings.feature), show how we can
rapidly build up many illustrative cases demonstrating behavioral rules without [very much code](https://github.com/cosmos/cosmos-sdk/blob/main/depinject/binding_test.go) while maintaining high level readability.

Example 2 [depinject table driven tests](https://github.com/cosmos/cosmos-sdk/blob/main/depinject/provider_desc_test.go)

Example 3 [Bank keeper tests](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/x/bank/keeper/keeper_test.go#L94-L105) - A mock implementation of `AccountKeeper` is supplied to the keeper constructor.

#### Limitations

Certain modules are tightly coupled beyond the test phase. A recent dependency report for
`bank -> auth` found 274 total usages of `auth` in `bank`, 50 of which are in
production code and 224 in test. This tight coupling may suggest that either the modules
should be merged, or refactoring is required to abstract references to the core types tying
the modules together. It could also indicate that these modules should be tested together
in integration tests beyond mocked unit tests.

In some cases setting up a test case for a module with many mocked dependencies can be quite
cumbersome and the resulting test may only show that the mocking framework works as expected
rather than working as a functional test of interdependent module behavior.

### Integration tests

Integration tests define and exercise relationships between an arbitrary number of modules
and/or application subsystems.

Wiring for integration tests is provided by `depinject` and some [helper code](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/testutil/sims/app_helpers.go#L95) starts up
a running application. A section of the running application may then be tested. Certain
inputs during different phases of the application life cycle are expected to produce
invariant outputs without too much concern for component internals. This type of black box
testing has a larger scope than unit testing.

Example 1 [client/grpc_query_test/TestGRPCQuery](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/client/grpc_query_test.go#L111-L129) - This test is misplaced in `/client`,
but tests the life cycle of (at least) `runtime` and `bank` as they progress through
startup, genesis and query time. It also exercises the fitness of the client and query
server without putting bytes on the wire through the use of [QueryServiceTestHelper](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/baseapp/grpcrouter_helpers.go#L31).

Example 2 `x/evidence` Keeper integration tests - Starts up an application composed of [8
modules](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/x/evidence/testutil/app.yaml#L1) with [5 keepers](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/x/evidence/keeper/keeper_test.go#L101-L106) used in the integration test suite. One test in the suite
exercises [HandleEquivocationEvidence](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/x/evidence/keeper/infraction_test.go#L42) which contains many interactions with the staking
keeper.

Example 3 - Integration suite app configurations may also be specified via golang (not
YAML as above) [statically](https://github.com/cosmos/cosmos-sdk/blob/main/x/nft/testutil/app_config.go) or [dynamically](https://github.com/cosmos/cosmos-sdk/blob/8c23f6f957d1c0bedd314806d1ac65bea59b084c/tests/integration/bank/keeper/keeper_test.go#L129-L134).

#### Limitations

Setting up a particular input state may be more challenging since the application is
starting from a zero state. Some of this may be addressed by good test fixture
abstractions with testing of their own. Tests may also be more brittle, and larger
refactors could impact application initialization in unexpected ways with harder to
understand errors. This could also be seen as a benefit, and indeed the SDK's current
integration tests were helpful in tracking down logic errors during earlier stages
of app-wiring refactors.

### Simulations

Simulations (also called generative testing) are a special case of integration tests where
deterministically random module operations are executed against a running simapp, building
blocks on the chain until a specified height is reached. No *specific* assertions are
made for the state transitions resulting from module operations but any error will halt and
fail the simulation. Since `crisis` is included in simapp and the simulation runs
EndBlockers at the end of each block any module invariant violations will also fail
the simulation.

Modules must implement [AppModuleSimulation.WeightedOperations](https://github.com/cosmos/cosmos-sdk/blob/2bec9d2021918650d3938c3ab242f84289daef80/types/module/simulation.go#L31) to define their
simulation operations. Note that not all modules implement this which may indicate a
gap in current simulation test coverage.

Modules not returning simulation operations:

* `auth`
* `evidence`
* `mint`
* `params`

A separate binary, [runsim](https://github.com/cosmos/tools/tree/master/cmd/runsim), is responsible for kicking off some of these tests and
managing their life cycle.

#### Limitations

* [A success](https://github.com/cosmos/cosmos-sdk/runs/7606931983?check_suite_focus=true) may take a long time to run, 7-10 minutes per simulation in CI.
* [Timeouts](https://github.com/cosmos/cosmos-sdk/runs/7606932295?check_suite_focus=true) sometimes occur on apparent successes without any indication why.
* Useful error messages not provided on [failure](https://github.com/cosmos/cosmos-sdk/runs/7606932548?check_suite_focus=true) from CI, requiring a developer to run
  the simulation locally to reproduce.

### E2E tests

End to end tests exercise the entire system as we understand it in as close an approximation
to a production environment as is practical. Presently these tests are located at
[tests/e2e](https://github.com/cosmos/cosmos-sdk/tree/main/tests/e2e) and rely on [testutil/network](https://github.com/cosmos/cosmos-sdk/tree/main/testutil/network) to start up an in-process Tendermint node.

An application should be built as minimally as possible to exercise the desired functionality.
The SDK uses an application will only the required modules for the tests. The application developer is adviced to use its own application for e2e tests.

#### Limitations

In general the limitations of end to end tests are orchestration and compute cost.
Scaffolding is required to start up and run a prod-like environment and the this
process takes much longer to start and run than unit or integration tests.

Global locks present in Tendermint code cause stateful starting/stopping to sometimes hang
or fail intermittently when run in a CI environment.

The scope of e2e tests has been complected with command line interface testing.

## Decision

We accept these test scopes and identify the following decisions points for each.

| Scope       | App Type            | Mocks? |
| ----------- | ------------------- | ------ |
| Unit        | None                | Yes    |
| Integration | integration helpers | Some   |
| Simulation  | minimal app         | No     |
| E2E         | minimal app         | No     |

The decision above is valid for the SDK. An application developer should test their application with their full application instead of the minimal app.

### Unit Tests

All modules must have mocked unit test coverage.

Illustrative tests should outnumber journeys in unit tests.

Unit tests should outnumber integration tests.

Unit tests must not introduce additional dependencies beyond those already present in
production code.

When module unit test introduction as per [EPIC: Unit testing of modules via mocks](https://github.com/cosmos/cosmos-sdk/issues/12398)
results in a near complete rewrite of an integration test suite the test suite should be
retained and moved to `/tests/integration`. We accept the resulting test logic
duplication but recommend improving the unit test suite through the addition of
illustrative tests.

### Integration Tests

All integration tests shall be located in `/tests/integration`, even those which do not
introduce extra module dependencies.

To help limit scope and complexity, it is recommended to use the smallest possible number of
modules in application startup, i.e. don't depend on simapp.

Integration tests should outnumber e2e tests.

### Simulations

Simulations shall use a minimal application (usually via app wiring). They are located under `/x/{moduleName}/simulation`.

### E2E Tests

Existing e2e tests shall be migrated to integration tests by removing the dependency on the
test network and in-process Tendermint node to ensure we do not lose test coverage.

The e2e rest runner shall transition from in process Tendermint to a runner powered by
Docker via [dockertest](https://github.com/ory/dockertest).

E2E tests exercising a full network upgrade shall be written.

The CLI testing aspect of existing e2e tests shall be rewritten using the network mocking
demonstrated in [PR#12706](https://github.com/cosmos/cosmos-sdk/pull/12706).

## Consequences

### Positive

* test coverage is increased
* test organization is improved
* reduced dependency graph size in modules
* simapp removed as a dependency from modules
* inter-module dependencies introduced in test code are removed
* reduced CI run time after transitioning away from in process Tendermint

### Negative

* some test logic duplication between unit and integration tests during transition
* test written using dockertest DX may be a bit worse

### Neutral

* some discovery required for e2e transition to dockertest

## Further Discussions

It may be useful if test suites could be run in integration mode (with mocked tendermint) or
with e2e fixtures (with real tendermint and many nodes). Integration fixtures could be used
for quicker runs, e2e fixures could be used for more battle hardening.

A PoC `x/gov` was completed in PR [#12847](https://github.com/cosmos/cosmos-sdk/pull/12847)
is in progress for unit tests demonstrating BDD [Rejected].
Observing that a strength of BDD specifications is their readability, and a con is the
cognitive load while writing and maintaining, current consensus is to reserve BDD use
for places in the SDK where complex rules and module interactions are demonstrated.
More straightforward or low level test cases will continue to rely on go table tests.

Levels are network mocking in integration and e2e tests are still being worked on and formalized.
