# Depinject

> **免责声明**：这是一个**测试版**软件包。SDK团队正在积极开发此功能，并期待社区的反馈。请尝试使用并告诉我们您的想法。

## 概述

`depinject`是Cosmos SDK的依赖注入框架。该模块与`core/appconfig`一起旨在通过使用配置文件（Go、YAML或JSON）来简化区块链的定义，以替换大部分`app.go`中的样板代码。

* [Go Doc](https://pkg.go.dev/cosmossdk.io/depinject)

## 用法

`depinject`包括一个富有表达力且可组合的[配置API](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/depinject#Config)。
核心配置函数是`Provide`。下面的示例演示了通过`Provide` API注册自由的**提供者函数**。

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

提供者函数是依赖树的基础，它们会被内省，然后将它们的输入识别为依赖项，将输出识别为依赖项，无论是另一个提供者函数还是存储在DI容器之外的状态，就像上面的`&x`和`&y`一样。

### 接口类型解析

`depinject`支持将接口类型作为提供者函数的输入。在SDK的情况下，这种模式用于解耦模块之间的`Keeper`依赖关系。例如，`x/bank`期望一个[AccountKeeper](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/x/bank/types#AccountKeeper)接口作为[ProvideModule的输入](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/module.go#L208-L260)。

具体来说，`SimApp`使用了`x/auth`中的实现，但这种设计允许这种松耦合关系发生变化。

给定以下类型：

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

这种用法

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

将*隐式*将`Duck`绑定到`Mallard`。这是因为容器中只有一个`Duck`的实现。  
然而，如果添加第二个`Duck`的提供者，将会导致错误：

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

在上述情况下，为给定接口绑定注册绑定可能如下所示

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

现在，`depinject` 有足够的信息将 `Mallard` 作为 `APond` 的输入提供。

### 在真实应用中的完整示例

:::warning
在使用 `depinject.Inject` 时，注入的类型必须是指针。
:::

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_v2.go#L219-L244
```

## 调试

可以通过日志和 [Graphviz](https://graphviz.org) 渲染容器树来解决容器中解析依赖项的问题。
默认情况下，每当出现错误时，日志将打印到 stderr，并且依赖图的 Graphviz DOT 格式渲染将保存到 `debug_container.dot`。

下面是一个成功构建依赖图的 Graphviz 渲染示例：
![Graphviz 示例](https://raw.githubusercontent.com/cosmos/cosmos-sdk/ff39d243d421442b400befcd959ec3ccd2525154/depinject/testdata/example.svg)

矩形表示函数，椭圆表示类型，圆角矩形表示模块，而单个六边形表示调用了 `Build` 的函数。
黑色的形状表示在没有错误的情况下调用/解析的函数和类型。灰色的节点表示容器中可能已经调用/解析但未使用的函数和类型。

下面是一个构建依赖图失败的 Graphviz 渲染示例：
![Graphviz 错误示例](https://raw.githubusercontent.com/cosmos/cosmos-sdk/ff39d243d421442b400befcd959ec3ccd2525154/depinject/testdata/example_error.svg)

可以使用 `dot` 命令行工具将 Graphviz DOT 文件转换为 SVG，在 Web 浏览器中查看，例如：

```txt
dot -Tsvg debug_container.dot > debug_container.svg
```

许多其他工具，包括一些集成开发环境，支持使用 DOT 文件进行工作。




# Depinject

> **DISCLAIMER**: This is a **beta** package. The SDK team is actively working on this feature and we are looking for feedback from the community. Please try it out and let us know what you think.

## Overview

`depinject` is a dependency injection framework for the Cosmos SDK. This module together with `core/appconfig` are meant to simplify the definition of a blockchain by replacing most of `app.go`'s boilerplate code with a configuration file (Go, YAML or JSON).

* [Go Doc](https://pkg.go.dev/cosmossdk.io/depinject)

## Usage

`depinject` includes an expressive and composable [Configuration API](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/depinject#Config).
A core configuration function is `Provide`. The example below demonstrates the registration of free **provider functions** via the `Provide` API.


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

Provider functions form the basis of the dependency tree, they are introspected then their inputs identified as dependencies and outputs as dependants, either for another provider function or state stored outside the DI container, as is the case of `&x` and `&y` above.

### Interface type resolution

`depinject` supports interface types as inputs to provider functions.  In the SDK's case this pattern is used to decouple
`Keeper` dependencies between modules.  For example `x/bank` expects an [AccountKeeper](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/x/bank/types#AccountKeeper) interface as [input to ProvideModule](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/module.go#L208-L260).

Concretely `SimApp` uses the implementation in `x/auth`, but this design allows for this loose coupling to change.

Given the following types:

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

This usage

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

results in an *implicit* binding of `Duck` to `Mallard`.  This works because there is only one implementation of `Duck` in the container.  
However, adding a second provider of `Duck` will result in an error:

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

In the above situation registering a binding for a given interface binding may look like

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
