# ADR 010: 模块化 AnteHandler

## 变更日志

* 2019年8月31日：初稿
* 2021年9月14日：被 ADR-045 取代

## 状态

被 ADR-045 取代

## 背景

当前的 AnteHandler 设计允许用户使用 `x/auth` 中提供的默认 AnteHandler，或者从头开始构建自己的 AnteHandler。理想情况下，AnteHandler 功能应该被拆分为多个模块化函数，可以与自定义的 ante 函数一起链接，这样当用户想要实现自定义行为时，就不必重写常见的 antehandler 逻辑。

例如，假设用户想要实现一些自定义的签名验证逻辑。在当前的代码库中，用户必须从头开始编写自己的 Antehandler，大部分时间都在重新实现相同的代码，然后在 baseapp 中设置自己的自定义的、庞大的 Antehandler。相反，我们希望允许用户在必要时指定自定义行为，并将其与默认的 ante-handler 功能结合起来，以实现尽可能模块化和灵活的方式。

## 提案

### 每个模块的 AnteHandler

一种方法是使用 [ModuleManager](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/types/module)，并让每个模块实现自己的 antehandler，如果需要自定义的 antehandler 逻辑。然后，可以将 ModuleManager 传递给 AnteHandler 顺序，就像它对于 BeginBlockers 和 EndBlockers 有一个顺序一样。ModuleManager 返回一个单独的 AnteHandler 函数，该函数将接收一个交易并按照指定的顺序运行每个模块的 `AnteHandle`。模块管理器的 AnteHandler 被设置为 baseapp 的 AnteHandler。

优点：

1. 实现简单
2. 利用现有的 ModuleManager 架构

缺点：

1. 提高了粒度，但仍然无法比每个模块更细粒度。例如，如果 auth 的 `AnteHandle` 函数负责验证备注和签名，用户无法在保留 auth 的 `AnteHandle` 功能的同时交换签名检查功能。
2. 模块的 AnteHandler 会依次运行。没有办法让一个 AnteHandler 包装或“装饰”另一个 AnteHandler。

### 装饰器模式

[weave项目](https://github.com/iov-one/weave)通过使用装饰器模式实现了AnteHandler的模块化。接口设计如下：

```go
// Decorator wraps a Handler to provide common functionality
// like authentication, or fee-handling, to many Handlers
type Decorator interface {
	Check(ctx Context, store KVStore, tx Tx, next Checker) (*CheckResult, error)
	Deliver(ctx Context, store KVStore, tx Tx, next Deliverer) (*DeliverResult, error)
}
```

每个装饰器都像一个模块化的Cosmos SDK antehandler函数，但它可以接受一个`next`参数，该参数可以是另一个装饰器或一个不带`next`参数的Handler。这些装饰器可以链接在一起，一个装饰器作为前一个装饰器链中的`next`参数传递。链的最后是一个Router，它可以接收一个tx并路由到适当的msg处理程序。

这种方法的一个关键优点是，一个装饰器可以在下一个Checker/Deliverer周围包装其内部逻辑。一个weave装饰器可以执行以下操作：

```go
// Example Decorator's Deliver function
func (example Decorator) Deliver(ctx Context, store KVStore, tx Tx, next Deliverer) {
    // Do some pre-processing logic

    res, err := next.Deliver(ctx, store, tx)

    // Do some post-processing logic given the result and error
}
```

优点：

1. Weave装饰器可以在链中的下一个装饰器/处理程序上进行包装。在某些情况下，能够进行预处理和后处理可能非常有用。
2. 提供了一个嵌套的模块化结构，这在上述解决方案中是不可能的，同时也允许线性的一个接一个的结构，就像上述解决方案一样。

缺点：

1. 很难一眼看出在装饰器运行后会发生的状态更新，给定`ctx`、`store`和`tx`。装饰器可以在其函数体内调用任意数量的嵌套装饰器，在调用链上的下一个装饰器之前可能会进行一些预处理和后处理。因此，要理解装饰器在做什么，还必须了解链中每个后续装饰器也在做什么。这可能变得非常复杂。线性的一个接一个的方法虽然不太强大，但可能更容易理解。

### 链式微函数

Weave方法的好处是装饰器可以非常简洁，当它们链接在一起时，可以实现最大的可定制性。然而，嵌套结构可能变得非常复杂，因此很难理解。

另一种方法是将AnteHandler功能拆分为范围严密的“微函数”，同时保留ModuleManager方法中的一个接一个的顺序。

我们可以通过一种方式将这些微函数链接起来，以便它们一个接一个地运行。模块可以定义多个ante微函数，然后还可以提供一个默认的模块级别的AnteHandler，该AnteHandler实现了这些微函数的默认建议顺序。

用户可以通过使用ModuleManager轻松地对AnteHandlers进行排序。ModuleManager将接收一个AnteHandlers列表，并返回一个单一的AnteHandler，按照提供的列表顺序运行每个AnteHandler。如果用户对每个模块的默认顺序感到满意，只需提供一个包含每个模块的antehandler的列表即可（与BeginBlocker和EndBlocker完全相同）。

然而，如果用户希望改变顺序或以任何方式添加、修改或删除ante微函数，他们始终可以定义自己的ante微函数，并将它们明确地添加到传递给模块管理器的列表中。

#### 默认工作流程

这是一个用户的AnteHandler示例，如果他们选择不创建任何自定义微函数。

##### Cosmos SDK 代码

```go
// Chains together a list of AnteHandler micro-functions that get run one after the other.
// Returned AnteHandler will abort on first error.
func Chainer(order []AnteHandler) AnteHandler {
    return func(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
        for _, ante := range order {
            ctx, err := ante(ctx, tx, simulate)
            if err != nil {
                return ctx, err
            }
        }
        return ctx, err
    }
}
```

```go
// AnteHandler micro-function to verify signatures
func VerifySignatures(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // verify signatures
    // Returns InvalidSignature Result and abort=true if sigs invalid
    // Return OK result and abort=false if sigs are valid
}

// AnteHandler micro-function to validate memo
func ValidateMemo(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // validate memo
}

// Auth defines its own default ante-handler by chaining its micro-functions in a recommended order
AuthModuleAnteHandler := Chainer([]AnteHandler{VerifySignatures, ValidateMemo})
```

```go
// Distribution micro-function to deduct fees from tx
func DeductFees(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // Deduct fees from tx
    // Abort if insufficient funds in account to pay for fees
}

// Distribution micro-function to check if fees > mempool parameter
func CheckMempoolFees(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // If CheckTx: Abort if the fees are less than the mempool's minFee parameter
}

// Distribution defines its own default ante-handler by chaining its micro-functions in a recommended order
DistrModuleAnteHandler := Chainer([]AnteHandler{CheckMempoolFees, DeductFees})
```

```go
type ModuleManager struct {
    // other fields
    AnteHandlerOrder []AnteHandler
}

func (mm ModuleManager) GetAnteHandler() AnteHandler {
    retun Chainer(mm.AnteHandlerOrder)
}
```

##### 用户代码

```go
// Note: Since user is not making any custom modifications, we can just SetAnteHandlerOrder with the default AnteHandlers provided by each module in our preferred order
moduleManager.SetAnteHandlerOrder([]AnteHandler(AuthModuleAnteHandler, DistrModuleAnteHandler))

app.SetAnteHandler(mm.GetAnteHandler())
```

#### 自定义工作流程

这是一个用户想要实现自定义antehandler逻辑的工作流程示例。在此示例中，用户希望实现自定义的签名验证，并更改antehandler的顺序，以便在签名验证之前运行验证备忘录。

##### 用户代码

```go
// User can implement their own custom signature verification antehandler micro-function
func CustomSigVerify(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // do some custom signature verification logic
}
```

```go
// Micro-functions allow users to change order of when they get executed, and swap out default ante-functionality with their own custom logic.
// Note that users can still chain the default distribution module handler, and auth micro-function along with their custom ante function
moduleManager.SetAnteHandlerOrder([]AnteHandler(ValidateMemo, CustomSigVerify, DistrModuleAnteHandler))
```

优点：

1. 允许ante功能尽可能模块化。
2. 对于不需要自定义ante功能的用户，antehandler的工作方式与ModuleManager中的BeginBlock和EndBlock没有太大区别。
3. 仍然容易理解。

缺点：

1. 无法像Weave一样使用装饰器包装antehandlers。

### 简单装饰器

这种方法受到Weave的装饰器设计的启发，同时试图最小化对Cosmos SDK的破坏性变更，并最大化简单性。与Weave装饰器类似，这种方法允许一个`AnteDecorator`包装下一个AnteHandler，对结果进行前后处理。这很有用，因为装饰器可以在AnteHandler返回后执行延迟/清理操作，并在之前执行一些设置。与Weave装饰器不同，这些`AnteDecorator`函数只能包装AnteHandler，而不能包装整个处理程序执行路径。这是有意的，因为我们希望来自不同模块的装饰器对`tx`执行身份验证/验证，但我们不希望装饰器能够包装和修改`MsgHandler`的结果。

此外，这种方法不会破坏任何核心的 Cosmos SDK API。由于我们保留了 AnteHandler 的概念并在 baseapp 中设置了一个单独的 AnteHandler，装饰器只是为那些需要更多自定义的用户提供的额外方法。模块的 API（即 `x/auth`）可能会因此方法而破坏，但核心 API 保持不变。

允许装饰器接口，可以将它们链接在一起创建 Cosmos SDK AnteHandler。

这使得用户可以选择自己实现 AnteHandler 并将其设置在 baseapp 中，或者使用装饰器模式将他们自定义的装饰器与 Cosmos SDK 提供的装饰器按照他们希望的顺序链接在一起。

```go
// An AnteDecorator wraps an AnteHandler, and can do pre- and post-processing on the next AnteHandler
type AnteDecorator interface {
    AnteHandle(ctx Context, tx Tx, simulate bool, next AnteHandler) (newCtx Context, err error)
}
```

```go
// ChainAnteDecorators will recursively link all of the AnteDecorators in the chain and return a final AnteHandler function
// This is done to preserve the ability to set a single AnteHandler function in the baseapp.
func ChainAnteDecorators(chain ...AnteDecorator) AnteHandler {
    if len(chain) == 1 {
        return func(ctx Context, tx Tx, simulate bool) {
            chain[0].AnteHandle(ctx, tx, simulate, nil)
        }
    }
    return func(ctx Context, tx Tx, simulate bool) {
        chain[0].AnteHandle(ctx, tx, simulate, ChainAnteDecorators(chain[1:]))
    }
}
```

#### 示例代码

定义 AnteDecorator 函数

```go
// Setup GasMeter, catch OutOfGasPanic and handle appropriately
type SetUpContextDecorator struct{}

func (sud SetUpContextDecorator) AnteHandle(ctx Context, tx Tx, simulate bool, next AnteHandler) (newCtx Context, err error) {
    ctx.GasMeter = NewGasMeter(tx.Gas)

    defer func() {
        // recover from OutOfGas panic and handle appropriately
    }

    return next(ctx, tx, simulate)
}

// Signature Verification decorator. Verify Signatures and move on
type SigVerifyDecorator struct{}

func (svd SigVerifyDecorator) AnteHandle(ctx Context, tx Tx, simulate bool, next AnteHandler) (newCtx Context, err error) {
    // verify sigs. Return error if invalid

    // call next antehandler if sigs ok
    return next(ctx, tx, simulate)
}

// User-defined Decorator. Can choose to pre- and post-process on AnteHandler
type UserDefinedDecorator struct{
    // custom fields
}

func (udd UserDefinedDecorator) AnteHandle(ctx Context, tx Tx, simulate bool, next AnteHandler) (newCtx Context, err error) {
    // pre-processing logic

    ctx, err = next(ctx, tx, simulate)

    // post-processing logic
}
```

将 AnteDecorators 链接在一起创建最终的 AnteHandler。将此 AnteHandler 设置在 baseapp 中。

```go
// Create final antehandler by chaining the decorators together
antehandler := ChainAnteDecorators(NewSetUpContextDecorator(), NewSigVerifyDecorator(), NewUserDefinedDecorator())

// Set chained Antehandler in the baseapp
bapp.SetAnteHandler(antehandler)
```

优点：

1. 允许一个装饰器对下一个 AnteHandler 进行前后处理，类似于 Weave 设计。
2. 不需要破坏 baseapp API。用户仍然可以选择设置一个单独的 AnteHandler。

缺点：

1. 装饰器模式可能具有深层嵌套的结构，很难理解，但通过在 `ChainAnteDecorators` 函数中明确列出装饰器的顺序来缓解这个问题。
2. 不使用 ModuleManager 设计。由于该设计模式已经用于 BeginBlocker/EndBlocker，这个提案似乎与该设计模式不一致。

## 后果

由于优缺点已经针对每种方法进行了说明，因此在本节中省略了这部分内容。

## 参考资料

* [#4572](https://github.com/cosmos/cosmos-sdk/issues/4572): 模块化 AnteHandler 问题
* [#4582](https://github.com/cosmos/cosmos-sdk/pull/4583): Per-Module AnteHandler 方法的初始实现
* [Weave Decorator 代码](https://github.com/iov-one/weave/blob/master/handler.go#L35)
* [Weave 设计视频](https://vimeo.com/showcase/6189877)


# ADR 010: Modular AnteHandler

## Changelog

* 2019 Aug 31: Initial draft
* 2021 Sep 14: Superseded by ADR-045

## Status

SUPERSEDED by ADR-045

## Context

The current AnteHandler design allows users to either use the default AnteHandler provided in `x/auth` or to build their own AnteHandler from scratch. Ideally AnteHandler functionality is split into multiple, modular functions that can be chained together along with custom ante-functions so that users do not have to rewrite common antehandler logic when they want to implement custom behavior.

For example, let's say a user wants to implement some custom signature verification logic. In the current codebase, the user would have to write their own Antehandler from scratch largely reimplementing much of the same code and then set their own custom, monolithic antehandler in the baseapp. Instead, we would like to allow users to specify custom behavior when necessary and combine them with default ante-handler functionality in a way that is as modular and flexible as possible.

## Proposals

### Per-Module AnteHandler

One approach is to use the [ModuleManager](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/types/module) and have each module implement its own antehandler if it requires custom antehandler logic. The ModuleManager can then be passed in an AnteHandler order in the same way it has an order for BeginBlockers and EndBlockers. The ModuleManager returns a single AnteHandler function that will take in a tx and run each module's `AnteHandle` in the specified order. The module manager's AnteHandler is set as the baseapp's AnteHandler.

Pros:

1. Simple to implement
2. Utilizes the existing ModuleManager architecture

Cons:

1. Improves granularity but still cannot get more granular than a per-module basis. e.g. If auth's `AnteHandle` function is in charge of validating memo and signatures, users cannot swap the signature-checking functionality while keeping the rest of auth's `AnteHandle` functionality.
2. Module AnteHandler are run one after the other. There is no way for one AnteHandler to wrap or "decorate" another.

### Decorator Pattern

The [weave project](https://github.com/iov-one/weave) achieves AnteHandler modularity through the use of a decorator pattern. The interface is designed as follows:

```go
// Decorator wraps a Handler to provide common functionality
// like authentication, or fee-handling, to many Handlers
type Decorator interface {
	Check(ctx Context, store KVStore, tx Tx, next Checker) (*CheckResult, error)
	Deliver(ctx Context, store KVStore, tx Tx, next Deliverer) (*DeliverResult, error)
}
```

Each decorator works like a modularized Cosmos SDK antehandler function, but it can take in a `next` argument that may be another decorator or a Handler (which does not take in a next argument). These decorators can be chained together, one decorator being passed in as the `next` argument of the previous decorator in the chain. The chain ends in a Router which can take a tx and route to the appropriate msg handler.

A key benefit of this approach is that one Decorator can wrap its internal logic around the next Checker/Deliverer. A weave Decorator may do the following:

```go
// Example Decorator's Deliver function
func (example Decorator) Deliver(ctx Context, store KVStore, tx Tx, next Deliverer) {
    // Do some pre-processing logic

    res, err := next.Deliver(ctx, store, tx)

    // Do some post-processing logic given the result and error
}
```

Pros:

1. Weave Decorators can wrap over the next decorator/handler in the chain. The ability to both pre-process and post-process may be useful in certain settings.
2. Provides a nested modular structure that isn't possible in the solution above, while also allowing for a linear one-after-the-other structure like the solution above.

Cons:

1. It is hard to understand at first glance the state updates that would occur after a Decorator runs given the `ctx`, `store`, and `tx`. A Decorator can have an arbitrary number of nested Decorators being called within its function body, each possibly doing some pre- and post-processing before calling the next decorator on the chain. Thus to understand what a Decorator is doing, one must also understand what every other decorator further along the chain is also doing. This can get quite complicated to understand. A linear, one-after-the-other approach while less powerful, may be much easier to reason about.

### Chained Micro-Functions

The benefit of Weave's approach is that the Decorators can be very concise, which when chained together allows for maximum customizability. However, the nested structure can get quite complex and thus hard to reason about.

Another approach is to split the AnteHandler functionality into tightly scoped "micro-functions", while preserving the one-after-the-other ordering that would come from the ModuleManager approach.

We can then have a way to chain these micro-functions so that they run one after the other. Modules may define multiple ante micro-functions and then also provide a default per-module AnteHandler that implements a default, suggested order for these micro-functions.

Users can order the AnteHandlers easily by simply using the ModuleManager. The ModuleManager will take in a list of AnteHandlers and return a single AnteHandler that runs each AnteHandler in the order of the list provided. If the user is comfortable with the default ordering of each module, this is as simple as providing a list with each module's antehandler (exactly the same as BeginBlocker and EndBlocker).

If however, users wish to change the order or add, modify, or delete ante micro-functions in anyway; they can always define their own ante micro-functions and add them explicitly to the list that gets passed into module manager.

#### Default Workflow

This is an example of a user's AnteHandler if they choose not to make any custom micro-functions.

##### Cosmos SDK code

```go
// Chains together a list of AnteHandler micro-functions that get run one after the other.
// Returned AnteHandler will abort on first error.
func Chainer(order []AnteHandler) AnteHandler {
    return func(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
        for _, ante := range order {
            ctx, err := ante(ctx, tx, simulate)
            if err != nil {
                return ctx, err
            }
        }
        return ctx, err
    }
}
```

```go
// AnteHandler micro-function to verify signatures
func VerifySignatures(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // verify signatures
    // Returns InvalidSignature Result and abort=true if sigs invalid
    // Return OK result and abort=false if sigs are valid
}

// AnteHandler micro-function to validate memo
func ValidateMemo(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // validate memo
}

// Auth defines its own default ante-handler by chaining its micro-functions in a recommended order
AuthModuleAnteHandler := Chainer([]AnteHandler{VerifySignatures, ValidateMemo})
```

```go
// Distribution micro-function to deduct fees from tx
func DeductFees(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // Deduct fees from tx
    // Abort if insufficient funds in account to pay for fees
}

// Distribution micro-function to check if fees > mempool parameter
func CheckMempoolFees(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // If CheckTx: Abort if the fees are less than the mempool's minFee parameter
}

// Distribution defines its own default ante-handler by chaining its micro-functions in a recommended order
DistrModuleAnteHandler := Chainer([]AnteHandler{CheckMempoolFees, DeductFees})
```

```go
type ModuleManager struct {
    // other fields
    AnteHandlerOrder []AnteHandler
}

func (mm ModuleManager) GetAnteHandler() AnteHandler {
    retun Chainer(mm.AnteHandlerOrder)
}
```

##### User Code

```go
// Note: Since user is not making any custom modifications, we can just SetAnteHandlerOrder with the default AnteHandlers provided by each module in our preferred order
moduleManager.SetAnteHandlerOrder([]AnteHandler(AuthModuleAnteHandler, DistrModuleAnteHandler))

app.SetAnteHandler(mm.GetAnteHandler())
```

#### Custom Workflow

This is an example workflow for a user that wants to implement custom antehandler logic. In this example, the user wants to implement custom signature verification and change the order of antehandler so that validate memo runs before signature verification.

##### User Code

```go
// User can implement their own custom signature verification antehandler micro-function
func CustomSigVerify(ctx Context, tx Tx, simulate bool) (newCtx Context, err error) {
    // do some custom signature verification logic
}
```

```go
// Micro-functions allow users to change order of when they get executed, and swap out default ante-functionality with their own custom logic.
// Note that users can still chain the default distribution module handler, and auth micro-function along with their custom ante function
moduleManager.SetAnteHandlerOrder([]AnteHandler(ValidateMemo, CustomSigVerify, DistrModuleAnteHandler))
```

Pros:

1. Allows for ante functionality to be as modular as possible.
2. For users that do not need custom ante-functionality, there is little difference between how antehandlers work and how BeginBlock and EndBlock work in ModuleManager.
3. Still easy to understand

Cons:

1. Cannot wrap antehandlers with decorators like you can with Weave.

### Simple Decorators

This approach takes inspiration from Weave's decorator design while trying to minimize the number of breaking changes to the Cosmos SDK and maximizing simplicity. Like Weave decorators, this approach allows one `AnteDecorator` to wrap the next AnteHandler to do pre- and post-processing on the result. This is useful since decorators can do defer/cleanups after an AnteHandler returns as well as perform some setup beforehand. Unlike Weave decorators, these `AnteDecorator` functions can only wrap over the AnteHandler rather than the entire handler execution path. This is deliberate as we want decorators from different modules to perform authentication/validation on a `tx`. However, we do not want decorators being capable of wrapping and modifying the results of a `MsgHandler`.

In addition, this approach will not break any core Cosmos SDK API's. Since we preserve the notion of an AnteHandler and still set a single AnteHandler in baseapp, the decorator is simply an additional approach available for users that desire more customization. The API of modules (namely `x/auth`) may break with this approach, but the core API remains untouched.

Allow Decorator interface that can be chained together to create a Cosmos SDK AnteHandler.

This allows users to choose between implementing an AnteHandler by themselves and setting it in the baseapp, or use the decorator pattern to chain their custom decorators with the Cosmos SDK provided decorators in the order they wish.

```go
// An AnteDecorator wraps an AnteHandler, and can do pre- and post-processing on the next AnteHandler
type AnteDecorator interface {
    AnteHandle(ctx Context, tx Tx, simulate bool, next AnteHandler) (newCtx Context, err error)
}
```

```go
// ChainAnteDecorators will recursively link all of the AnteDecorators in the chain and return a final AnteHandler function
// This is done to preserve the ability to set a single AnteHandler function in the baseapp.
func ChainAnteDecorators(chain ...AnteDecorator) AnteHandler {
    if len(chain) == 1 {
        return func(ctx Context, tx Tx, simulate bool) {
            chain[0].AnteHandle(ctx, tx, simulate, nil)
        }
    }
    return func(ctx Context, tx Tx, simulate bool) {
        chain[0].AnteHandle(ctx, tx, simulate, ChainAnteDecorators(chain[1:]))
    }
}
```

#### Example Code

Define AnteDecorator functions

```go
// Setup GasMeter, catch OutOfGasPanic and handle appropriately
type SetUpContextDecorator struct{}

func (sud SetUpContextDecorator) AnteHandle(ctx Context, tx Tx, simulate bool, next AnteHandler) (newCtx Context, err error) {
    ctx.GasMeter = NewGasMeter(tx.Gas)

    defer func() {
        // recover from OutOfGas panic and handle appropriately
    }

    return next(ctx, tx, simulate)
}

// Signature Verification decorator. Verify Signatures and move on
type SigVerifyDecorator struct{}

func (svd SigVerifyDecorator) AnteHandle(ctx Context, tx Tx, simulate bool, next AnteHandler) (newCtx Context, err error) {
    // verify sigs. Return error if invalid

    // call next antehandler if sigs ok
    return next(ctx, tx, simulate)
}

// User-defined Decorator. Can choose to pre- and post-process on AnteHandler
type UserDefinedDecorator struct{
    // custom fields
}

func (udd UserDefinedDecorator) AnteHandle(ctx Context, tx Tx, simulate bool, next AnteHandler) (newCtx Context, err error) {
    // pre-processing logic

    ctx, err = next(ctx, tx, simulate)

    // post-processing logic
}
```

Link AnteDecorators to create a final AnteHandler. Set this AnteHandler in baseapp.

```go
// Create final antehandler by chaining the decorators together
antehandler := ChainAnteDecorators(NewSetUpContextDecorator(), NewSigVerifyDecorator(), NewUserDefinedDecorator())

// Set chained Antehandler in the baseapp
bapp.SetAnteHandler(antehandler)
```

Pros:

1. Allows one decorator to pre- and post-process the next AnteHandler, similar to the Weave design.
2. Do not need to break baseapp API. Users can still set a single AnteHandler if they choose.

Cons:

1. Decorator pattern may have a deeply nested structure that is hard to understand, this is mitigated by having the decorator order explicitly listed in the `ChainAnteDecorators` function.
2. Does not make use of the ModuleManager design. Since this is already being used for BeginBlocker/EndBlocker, this proposal seems unaligned with that design pattern.

## Consequences

Since pros and cons are written for each approach, it is omitted from this section

## References

* [#4572](https://github.com/cosmos/cosmos-sdk/issues/4572):  Modular AnteHandler Issue
* [#4582](https://github.com/cosmos/cosmos-sdk/pull/4583): Initial Implementation of Per-Module AnteHandler Approach
* [Weave Decorator Code](https://github.com/iov-one/weave/blob/master/handler.go#L35)
* [Weave Design Videos](https://vimeo.com/showcase/6189877)
