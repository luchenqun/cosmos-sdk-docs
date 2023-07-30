# 测试

Cosmos SDK 包含不同类型的[测试](https://martinfowler.com/articles/practical-test-pyramid.html)。
这些测试有不同的目标，并在开发周期的不同阶段使用。
我们建议在开发周期的所有阶段都使用测试作为一般规则。
作为一个链开发者，建议您以与 SDK 类似的方式测试您的应用程序和模块。

测试背后的原理可以在[ADR-59](https://docs.cosmos.network/main/architecture/adr-059-test-scopes.html)中找到。

## 单元测试

单元测试是[测试金字塔](https://martinfowler.com/articles/practical-test-pyramid.html)中最低的测试类别。
所有的包和模块都应该有单元测试覆盖率。模块应该对其依赖进行模拟：这意味着模拟 keepers。

SDK 使用 `mockgen` 为 keepers 生成模拟：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/scripts/mockgen.sh#L3-L6
```

您可以在[这里](https://github.com/golang/mock)了解更多关于 mockgen 的信息。

### 示例

作为一个示例，我们将演示 `x/gov` 模块的[keeper tests](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/keeper_test.go)。

`x/gov` 模块有一个 `Keeper` 类型，需要一些外部依赖（即在 `x/gov` 之外的导入）才能正常工作。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/keeper.go#L61-L65
```

为了仅测试 `x/gov`，我们模拟了[预期的 keepers](https://docs.cosmos.network/v0.46/building-modules/keeper.html#type-definition)，并使用模拟的依赖项实例化了 `Keeper`。请注意，我们可能需要配置模拟的依赖项以返回预期的值：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/common_test.go#L67-L81
```

这样我们就可以在不导入其他模块的情况下测试 `x/gov` 模块。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/keeper_test.go#L3-L35
```

然后，我们可以使用新创建的 `Keeper` 实例创建单元测试。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/keeper_test.go#L73-L91
```

## 集成测试

集成测试位于[test pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)的第二层。
在SDK中，我们将集成测试放在[`/tests/integrations`](https://github.com/cosmos/cosmos-sdk/tree/main/tests/integration)目录下。

这些集成测试的目标是测试组件与其他依赖项的交互。与单元测试不同，集成测试不会模拟依赖项，而是使用组件的直接依赖项。这也与端到端测试不同，端到端测试会使用完整的应用程序来测试组件。

集成测试通过定义的`Msg`和`Query`服务与被测试模块进行交互。可以通过检查应用程序的状态、检查发出的事件或响应来验证测试的结果。建议使用这两种方法中的两种来验证测试的结果。

SDK提供了一些小的辅助函数，用于快速设置集成测试。这些辅助函数可以在<https://github.com/cosmos/cosmos-sdk/blob/main/testutil/integration>找到。

### 示例

```go reference
https://github.com/cosmos/cosmos-sdk/blob/29e22b3bdb05353555c8e0b269311bbff7b8deca/testutil/integration/example_test.go#L22-L89
```

## 确定性和回归测试

在Cosmos SDK中，针对具有`module_query_safe` Protobuf注释的查询编写了测试。

每个查询使用两种方法进行测试：

* 使用[`rapid`](https://pkg.go.dev/pgregory.net/rapid@v0.5.3)库进行基于属性的测试。测试的属性是在1000次查询调用中，查询响应和燃气消耗是否相同。
* 使用硬编码的响应和燃气编写回归测试，并验证它们在1000次调用和SDK补丁版本之间是否不变。

以下是回归测试的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/tests/integration/bank/keeper/deterministic_test.go#L102-L115
```

## 模拟

模拟也使用了一个最小的应用程序，使用 [`depinject`](../libraries/01-depinject.md) 构建：

:::note
您也可以使用 `AppConfig` `configurator` 来创建一个 `AppConfig` [内联](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/slashing/app_test.go#L54-L62)。这两种方式没有区别，可以根据您的喜好选择使用。
:::

以下是 `x/gov/` 模拟的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/simulation/operations_test.go#L292-L310
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/simulation/operations_test.go#L69-L111
```

## 端到端测试

端到端测试位于 [测试金字塔](https://martinfowler.com/articles/practical-test-pyramid.html) 的顶部。
它们必须测试整个应用程序的流程，从用户的角度来看（例如，CLI 测试）。它们位于 [`/tests/e2e`](https://github.com/cosmos/cosmos-sdk/tree/main/tests/e2e) 目录下。

<!-- @julienrbrt: 使用一个已连接的应用程序更有意义，以减少对 simapp 的依赖 -->
为此，SDK 使用 `simapp`，但您应该使用自己的应用程序（`appd`）。
以下是一些示例：

* SDK 端到端测试：<https://github.com/cosmos/cosmos-sdk/tree/main/tests/e2e>.
* Cosmos Hub 端到端测试：<https://github.com/cosmos/gaia/tree/main/tests/e2e>.
* Osmosis 端到端测试：<https://github.com/osmosis-labs/osmosis/tree/main/tests/e2e>.

:::note warning
SDK 正在创建其端到端测试，如 [ADR-59](https://docs.cosmos.network/main/architecture/adr-059-test-scopes.html) 中所定义。此页面将随后更新以提供更好的示例。
:::

## 了解更多

在 [ADR-59](https://docs.cosmos.network/main/architecture/adr-059-test-scopes.html) 中了解有关测试范围的更多信息。




# Testing

The Cosmos SDK contains different types of [tests](https://martinfowler.com/articles/practical-test-pyramid.html).
These tests have different goals and are used at different stages of the development cycle.
We advice, as a general rule, to use tests at all stages of the development cycle.
It is adviced, as a chain developer, to test your application and modules in a similar way than the SDK.

The rationale behind testing can be found in [ADR-59](https://docs.cosmos.network/main/architecture/adr-059-test-scopes.html).

## Unit Tests

Unit tests are the lowest test category of the [test pyramid](https://martinfowler.com/articles/practical-test-pyramid.html).
All packages and modules should have unit test coverage. Modules should have their dependencies mocked: this means mocking keepers.

The SDK uses `mockgen` to generate mocks for keepers:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/scripts/mockgen.sh#L3-L6
```

You can read more about mockgen [here](https://github.com/golang/mock).

### Example

As an example, we will walkthrough the [keeper tests](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/keeper_test.go) of the `x/gov` module.

The `x/gov` module has a `Keeper` type requires a few external dependencies (ie. imports outside `x/gov` to work properly).

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/keeper.go#L61-L65
```

In order to only test `x/gov`, we mock the [expected keepers](https://docs.cosmos.network/v0.46/building-modules/keeper.html#type-definition) and instantiate the `Keeper` with the mocked dependencies. Note that we may need to configure the mocked dependencies to return the expected values:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/common_test.go#L67-L81
```

This allows us to test the `x/gov` module without having to import other modules.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/keeper_test.go#L3-L35
```

We can test then create unit tests using the newly created `Keeper` instance.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/keeper/keeper_test.go#L73-L91
```

## Integration Tests

Integration tests are at the second level of the [test pyramid](https://martinfowler.com/articles/practical-test-pyramid.html).
In the SDK, we locate our integration tests under [`/tests/integrations`](https://github.com/cosmos/cosmos-sdk/tree/main/tests/integration).

The goal of these integration tests is to test how a component interacts with other dependencies. Compared to unit tests, integration tests do not mock dependencies. Instead, they use the direct dependencies of the component. This differs as well from end-to-end tests, which test the component with a full application.

Integration tests interact with the tested module via the defined `Msg` and `Query` services. The result of the test can be verified by checking the state of the application, by checking the emitted events or the response. It is adviced to combine two of these methods to verify the result of the test.

The SDK provides small helpers for quickly setting up an integration tests. These helpers can be found at <https://github.com/cosmos/cosmos-sdk/blob/main/testutil/integration>.

### Example

```go reference
https://github.com/cosmos/cosmos-sdk/blob/29e22b3bdb05353555c8e0b269311bbff7b8deca/testutil/integration/example_test.go#L22-L89
```

## Deterministic and Regression tests	

Tests are written for queries in the Cosmos SDK which have `module_query_safe` Protobuf annotation.

Each query is tested using 2 methods:

* Use property-based testing with the [`rapid`](https://pkg.go.dev/pgregory.net/rapid@v0.5.3) library. The property that is tested is that the query response and gas consumption are the same upon 1000 query calls.
* Regression tests are written with hardcoded responses and gas, and verify they don't change upon 1000 calls and between SDK patch versions.

Here's an example of regression tests:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/tests/integration/bank/keeper/deterministic_test.go#L102-L115
```

## Simulations

Simulations uses as well a minimal application, built with [`depinject`](../libraries/01-depinject.md):

:::note
You can as well use the `AppConfig` `configurator` for creating an `AppConfig` [inline](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/slashing/app_test.go#L54-L62). There is no difference between those two ways, use whichever you prefer.
:::

Following is an example for `x/gov/` simulations:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/simulation/operations_test.go#L292-L310
```

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/gov/simulation/operations_test.go#L69-L111
```

## End-to-end Tests

End-to-end tests are at the top of the [test pyramid](https://martinfowler.com/articles/practical-test-pyramid.html).
They must test the whole application flow, from the user perspective (for instance, CLI tests). They are located under [`/tests/e2e`](https://github.com/cosmos/cosmos-sdk/tree/main/tests/e2e).

<!-- @julienrbrt: makes more sense to use an app wired app to have 0 simapp dependencies -->
For that, the SDK is using `simapp` but you should use your own application (`appd`).
Here are some examples:

* SDK E2E tests: <https://github.com/cosmos/cosmos-sdk/tree/main/tests/e2e>.
* Cosmos Hub E2E tests: <https://github.com/cosmos/gaia/tree/main/tests/e2e>.
* Osmosis E2E tests: <https://github.com/osmosis-labs/osmosis/tree/main/tests/e2e>.

:::note warning
The SDK is in the process of creating its E2E tests, as defined in [ADR-59](https://docs.cosmos.network/main/architecture/adr-059-test-scopes.html). This page will eventually be updated with better examples.
:::

## Learn More

Learn more about testing scope in [ADR-59](https://docs.cosmos.network/main/architecture/adr-059-test-scopes.html).
