# Depinject

> **免责声明**：这是一个**测试版**软件包。SDK团队正在积极开发此功能，并期待社区的反馈。请尝试使用并告诉我们您的想法。

## 概述

`depinject` 是 Cosmos SDK 的依赖注入（DI）框架，旨在简化构建和配置区块链应用程序的过程。它与 `core/appconfig` 模块配合使用，用 Go、YAML 或 JSON 格式的配置文件替换了 `app.go` 中的大部分样板代码。

`depinject` 对于开发区块链应用程序特别有用：

*   具有多个相互依赖的组件、模块或服务。有助于有效管理它们的依赖关系。
*   需要解耦这些组件，使得可以更容易地测试、修改或替换单个部分而不影响整个系统。
*   希望通过减少样板代码和自动化依赖管理来简化模块及其依赖项的设置和初始化。

通过使用 `depinject`，开发人员可以实现：

*   更清晰和更有组织的代码。
*   改进的模块化和可维护性。
*   区块链应用程序的更可维护和模块化结构，最终提高开发速度和代码质量。

* [Go Doc](https://pkg.go.dev/cosmossdk.io/depinject)

## 用法

基于依赖注入概念的 `depinject` 框架，使用其配置 API 简化了在区块链应用程序中管理依赖关系的过程。该 API 提供了一组函数和方法来创建易于使用的配置，使得定义、修改和访问依赖关系及其关系变得简单。

[配置 API](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/depinject#Config) 的核心组件是 `Provide` 函数，它允许您注册提供依赖项的提供者函数。受构造函数注入的启发，这些提供者函数构成了依赖树的基础，以结构化和可维护的方式管理和解析依赖关系。此外，`depinject` 还支持将接口类型作为提供者函数的输入，提供了组件之间的灵活性和解耦，类似于接口注入的概念。

通过利用`depinject`及其配置API，您可以高效地处理区块链应用程序中的依赖关系，确保代码库的清晰、模块化和良好组织。

示例：

```go
package main

import (
	"fmt"

	"cosmossdk.io/depinject"
)

type AnotherInt int

func main() {
	var (
	  x int
	  y AnotherInt
	)

	fmt.Printf("Before (%v, %v)\n", x, y)
	depinject.Inject(
		depinject.Provide(
			func() int { return 1 },
			func() AnotherInt { return AnotherInt(2) },
		),
		&x,
		&y,
	)
	fmt.Printf("After (%v, %v)\n", x, y)
}
```

在这个示例中，`depinject.Provide`注册了两个提供者函数，它们返回`int`和`AnotherInt`值。然后，`depinject.Inject`函数用于将这些值注入到变量`x`和`y`中。

提供者函数作为依赖树的基础。它们被分析以识别它们的输入作为依赖项和它们的输出作为依赖项。这些依赖项可以被另一个提供者函数使用，也可以存储在DI容器之外（例如上面示例中的`&x`和`&y`）。

### 接口类型解析

`depinject`支持将接口类型作为提供者函数的输入，这有助于解耦模块之间的依赖关系。这种方法在管理具有多个模块的复杂系统（例如Cosmos SDK）时特别有用，其中依赖关系需要灵活和可维护。

例如，`x/bank`期望一个[AccountKeeper](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/x/bank/types#AccountKeeper)接口作为[ProvideModule的输入](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/module.go#L208-L260)。`SimApp`使用了`x/auth`中的实现，但模块化设计允许根据需要轻松更改实现。

考虑以下示例：

```go
package duck

type Duck interface {
	quack()
}

type AlsoDuck interface {
	quack()
}

type Mallard struct{}
type Canvasback struct{}

func (duck Mallard) quack()    {}
func (duck Canvasback) quack() {}

type Pond struct {
	Duck AlsoDuck
}
```

在这个示例中，有一个`Pond`结构体，它有一个类型为`AlsoDuck`的`Duck`字段。当只有一个可用的实现时，`depinject`框架可以自动解析适当的实现，如下所示：

```go
var pond Pond

depinject.Inject(
  depinject.Provide(
    func() Mallard { return Mallard{} },
    func(duck Duck) Pond {
      return Pond{Duck: duck}
    }),
   &pond)
```

这段代码将导致`Pond`的`Duck`字段隐式绑定到`Mallard`实现，因为它是容器中`Duck`接口的唯一实现。

然而，如果存在多个`Duck`接口的实现，如下面的示例所示，您将遇到错误：

```go
var pond Pond

depinject.Inject(
  depinject.Provide(
    func() Mallard { return Mallard{} },
    func() Canvasback { return Canvasback{} },
    func(duck Duck) Pond {
      return Pond{Duck: duck}
    }),
   &pond)
```

需要为`Duck`指定特定的绑定优先级。

#### `BindInterface` API

在上述情况下，注册给定接口绑定的绑定可能如下所示：

```go
depinject.Inject(
  depinject.Configs(
    depinject.BindInterface(
      "duck.Duck",
      "duck.Mallard"),
     depinject.Provide(
       func() Mallard { return Mallard{} },
       func() Canvasback { return Canvasback{} },
       func(duck Duck) APond {
         return Pond{Duck: duck}
      })),
   &pond)
```

现在`depinject`有足够的信息将`Mallard`作为`APond`的输入提供。

### 在真实应用中的完整示例

:::warning
使用`depinject.Inject`时，注入的类型必须是指针。
:::

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_v2.go#L219-L244
```

## 调试

可以通过日志和[Graphviz](https://graphviz.org)渲染容器树来解决容器中解析依赖项的问题。
默认情况下，每当出现错误时，日志将打印到stderr，并且依赖图的Graphviz DOT格式渲染将保存到`debug_container.dot`。

下面是成功构建依赖图的Graphviz渲染示例：
![Graphviz示例](https://raw.githubusercontent.com/cosmos/cosmos-sdk/ff39d243d421442b400befcd959ec3ccd2525154/depinject/testdata/example.svg)

矩形表示函数，椭圆表示类型，圆角矩形表示模块，单个六边形表示调用`Build`的函数。
黑色的形状表示已经调用/解析而没有错误的函数和类型。灰色的节点表示容器中可能已经调用/解析但未使用的函数和类型。

下面是构建失败的依赖图的Graphviz渲染示例：
![Graphviz错误示例](https://raw.githubusercontent.com/cosmos/cosmos-sdk/ff39d243d421442b400befcd959ec3ccd2525154/depinject/testdata/example_error.svg)

可以使用`dot`命令行工具将Graphviz DOT文件转换为SVG格式，以在Web浏览器中查看，例如：

```txt
dot -Tsvg debug_container.dot > debug_container.svg
```

许多其他工具，包括一些IDE，支持使用DOT文件进行工作。
```




# Depinject

> **DISCLAIMER**: This is a **beta** package. The SDK team is actively working on this feature and we are looking for feedback from the community. Please try it out and let us know what you think.

## Overview

`depinject` is a dependency injection (DI) framework for the Cosmos SDK, designed to streamline the process of building and configuring blockchain applications. It works in conjunction with the `core/appconfig` module to replace the majority of boilerplate code in `app.go` with a configuration file in Go, YAML, or JSON format.

`depinject` is particularly useful for developing blockchain applications:

*   With multiple interdependent components, modules, or services. Helping manage their dependencies effectively.
*   That require decoupling of these components, making it easier to test, modify, or replace individual parts without affecting the entire system.
*   That are wanting to simplify the setup and initialisation of modules and their dependencies by reducing boilerplate code and automating dependency management.

By using `depinject`, developers can achieve:

*   Cleaner and more organised code.
*   Improved modularity and maintainability.
*   A more maintainable and modular structure for their blockchain applications, ultimately enhancing development velocity and code quality.

* [Go Doc](https://pkg.go.dev/cosmossdk.io/depinject)

## Usage

The `depinject` framework, based on dependency injection concepts, streamlines the management of dependencies within your blockchain application using its Configuration API. This API offers a set of functions and methods to create easy to use configurations, making it simple to define, modify, and access dependencies and their relationships.

A core component of the [Configuration API](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/depinject#Config) is the `Provide` function, which allows you to register provider functions that supply dependencies. Inspired by constructor injection, these provider functions form the basis of the dependency tree, enabling the management and resolution of dependencies in a structured and maintainable manner. Additionally, `depinject` supports interface types as inputs to provider functions, offering flexibility and decoupling between components, similar to interface injection concepts.

By leveraging `depinject` and its Configuration API, you can efficiently handle dependencies in your blockchain application, ensuring a clean, modular, and well-organised codebase.

Example:

```go
package main

import (
	"fmt"

	"cosmossdk.io/depinject"
)

type AnotherInt int

func main() {
	var (
	  x int
	  y AnotherInt
	)

	fmt.Printf("Before (%v, %v)\n", x, y)
	depinject.Inject(
		depinject.Provide(
			func() int { return 1 },
			func() AnotherInt { return AnotherInt(2) },
		),
		&x,
		&y,
	)
	fmt.Printf("After (%v, %v)\n", x, y)
}
```

In this example, `depinject.Provide` registers two provider functions that return `int` and `AnotherInt` values. The `depinject.Inject` function is then used to inject these values into the variables `x` and `y`.

Provider functions serve as the basis for the dependency tree. They are analysed to identify their inputs as dependencies and their outputs as dependents. These dependents can either be used by another provider function or be stored outside the DI container (e.g., `&x` and `&y` in the example above).

### Interface type resolution

`depinject` supports the use of interface types as inputs to provider functions, which helps decouple dependencies between modules. This approach is particularly useful for managing complex systems with multiple modules, such as the Cosmos SDK, where dependencies need to be flexible and maintainable.

For example, `x/bank` expects an [AccountKeeper](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/x/bank/types#AccountKeeper) interface as [input to ProvideModule](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/module.go#L208-L260). `SimApp` uses the implementation in `x/auth`, but the modular design allows for easy changes to the implementation if needed.

Consider the following example:

```go
package duck

type Duck interface {
	quack()
}

type AlsoDuck interface {
	quack()
}

type Mallard struct{}
type Canvasback struct{}

func (duck Mallard) quack()    {}
func (duck Canvasback) quack() {}

type Pond struct {
	Duck AlsoDuck
}
```

In this example, there's a `Pond` struct that has a `Duck` field of type `AlsoDuck`. The `depinject` framework can automatically resolve the appropriate implementation when there's only one available, as shown below:

```go
var pond Pond

depinject.Inject(
  depinject.Provide(
    func() Mallard { return Mallard{} },
    func(duck Duck) Pond {
      return Pond{Duck: duck}
    }),
   &pond)
```

This code snippet results in the `Duck` field of `Pond` being implicitly bound to the `Mallard` implementation because it's the only implementation of the `Duck` interface in the container.

However, if there are multiple implementations of the `Duck` interface, as in the following example, you'll encounter an error:

```go
var pond Pond

depinject.Inject(
  depinject.Provide(
    func() Mallard { return Mallard{} },
    func() Canvasback { return Canvasback{} },
    func(duck Duck) Pond {
      return Pond{Duck: duck}
    }),
   &pond)
```

A specific binding preference for `Duck` is required.

#### `BindInterface` API

In the above situation registering a binding for a given interface binding may look like:

```go
depinject.Inject(
  depinject.Configs(
    depinject.BindInterface(
      "duck.Duck",
      "duck.Mallard"),
     depinject.Provide(
       func() Mallard { return Mallard{} },
       func() Canvasback { return Canvasback{} },
       func(duck Duck) APond {
         return Pond{Duck: duck}
      })),
   &pond)
```

Now `depinject` has enough information to provide `Mallard` as an input to `APond`. 

### Full example in real app

:::warning
When using `depinject.Inject`, the injected types must be pointers.
:::

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_v2.go#L219-L244
```

## Debugging

Issues with resolving dependencies in the container can be done with logs and [Graphviz](https://graphviz.org) renderings of the container tree.
By default, whenever there is an error, logs will be printed to stderr and a rendering of the dependency graph in Graphviz DOT format will be saved to `debug_container.dot`.

Here is an example Graphviz rendering of a successful build of a dependency graph:
![Graphviz Example](https://raw.githubusercontent.com/cosmos/cosmos-sdk/ff39d243d421442b400befcd959ec3ccd2525154/depinject/testdata/example.svg)

Rectangles represent functions, ovals represent types, rounded rectangles represent modules and the single hexagon
represents the function which called `Build`. Black-colored shapes mark functions and types that were called/resolved
without an error. Gray-colored nodes mark functions and types that could have been called/resolved in the container but
were left unused.

Here is an example Graphviz rendering of a dependency graph build which failed:
![Graphviz Error Example](https://raw.githubusercontent.com/cosmos/cosmos-sdk/ff39d243d421442b400befcd959ec3ccd2525154/depinject/testdata/example_error.svg)

Graphviz DOT files can be converted into SVG's for viewing in a web browser using the `dot` command-line tool, ex:

```txt
dot -Tsvg debug_container.dot > debug_container.svg
```

Many other tools including some IDEs support working with DOT files.
