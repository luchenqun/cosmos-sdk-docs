# ADR 045: BaseApp `{Check,Deliver}Tx` 作为中间件

## 变更日志

* 2021年8月20日：初稿。
* 2021年12月7日：更新 `tx.Handler` 接口 ([\#10693](https://github.com/cosmos/cosmos-sdk/pull/10693))。
* 2022年5月17日：ADR 被废弃，因为认为中间件过于难以理解。

## 状态

废弃。正在讨论替代方案 [#11955](https://github.com/cosmos/cosmos-sdk/issues/11955)。

## 摘要

本ADR使用基于中间件的设计替换当前的BaseApp `runTx` 和 antehandlers 设计。

## 背景

BaseApp 的 ABCI `{Check,Deliver}Tx()` 和它自己的 `Simulate()` 方法在底层调用 `runTx` 方法，该方法首先运行 antehandlers，然后执行 `Msg`。然而，[交易提示](https://github.com/cosmos/cosmos-sdk/issues/9406)和[退还未使用的gas](https://github.com/cosmos/cosmos-sdk/issues/2150)的用例需要在 `Msg` 执行后运行自定义逻辑。目前没有办法实现这一点。

一个简单的解决方案是向 BaseApp 添加 post-`Msg` 钩子。然而，Cosmos SDK 团队同时考虑使应用程序的连接更简单的整体大局 ([#9181](https://github.com/cosmos/cosmos-sdk/discussions/9182))，这包括使 BaseApp 更轻量和模块化。

## 决策

我们决定将 BaseApp 的 ABCI `{Check,Deliver}Tx` 和它自己的 `Simulate` 方法的实现转换为基于中间件的设计。

以下两个接口是中间件设计的基础，并在 `types/tx` 中定义：

```go
type Handler interface {
    CheckTx(ctx context.Context, req Request, checkReq RequestCheckTx) (Response, ResponseCheckTx, error)
    DeliverTx(ctx context.Context, req Request) (Response, error)
    SimulateTx(ctx context.Context, req Request (Response, error)
}

type Middleware func(Handler) Handler
```

在这里我们定义了以下参数和返回类型：

```go
type Request struct {
	Tx      sdk.Tx
	TxBytes []byte
}

type Response struct {
	GasWanted uint64
	GasUsed   uint64
	// MsgResponses is an array containing each Msg service handler's response
	// type, packed in an Any. This will get proto-serialized into the `Data` field
	// in the ABCI Check/DeliverTx responses.
	MsgResponses []*codectypes.Any
	Log          string
	Events       []abci.Event
}

type RequestCheckTx struct {
	Type abci.CheckTxType
}

type ResponseCheckTx struct {
	Priority int64
}
```

请注意，由于 CheckTx 处理与 mempool 优先级相关的单独逻辑，其签名与 DeliverTx 和 SimulateTx 不同。

BaseApp 持有对 `tx.Handler` 的引用：

```go
type BaseApp  struct {
    // other fields
    txHandler tx.Handler
}
```

BaseApp 的 ABCI `{Check,Deliver}Tx()` 和 `Simulate()` 方法只是使用相关参数调用 `app.txHandler.{Check,Deliver,Simulate}Tx()`。例如，对于 `DeliverTx`：

```go
func (app *BaseApp) DeliverTx(req abci.RequestDeliverTx) abci.ResponseDeliverTx {
    var abciRes abci.ResponseDeliverTx
	ctx := app.getContextForTx(runTxModeDeliver, req.Tx)
	res, err := app.txHandler.DeliverTx(ctx, tx.Request{TxBytes: req.Tx})
	if err != nil {
		abciRes = sdkerrors.ResponseDeliverTx(err, uint64(res.GasUsed), uint64(res.GasWanted), app.trace)
		return abciRes
	}

	abciRes, err = convertTxResponseToDeliverTx(res)
	if err != nil {
		return sdkerrors.ResponseDeliverTx(err, uint64(res.GasUsed), uint64(res.GasWanted), app.trace)
	}

	return abciRes
}

// convertTxResponseToDeliverTx converts a tx.Response into a abci.ResponseDeliverTx.
func convertTxResponseToDeliverTx(txRes tx.Response) (abci.ResponseDeliverTx, error) {
	data, err := makeABCIData(txRes)
	if err != nil {
		return abci.ResponseDeliverTx{}, nil
	}

	return abci.ResponseDeliverTx{
		Data:   data,
		Log:    txRes.Log,
		Events: txRes.Events,
	}, nil
}

// makeABCIData generates the Data field to be sent to ABCI Check/DeliverTx.
func makeABCIData(txRes tx.Response) ([]byte, error) {
	return proto.Marshal(&sdk.TxMsgData{MsgResponses: txRes.MsgResponses})
}
```

`BaseApp.CheckTx`和`BaseApp.Simulate`的实现方式相似。

`baseapp.txHandler`的三个方法的实现可以是单体函数，但为了模块化，我们提出了一种中间件组合设计，其中中间件只是一个接受`tx.Handler`并返回包装在前一个中间件周围的另一个`tx.Handler`的函数。

### 实现一个中间件

实际上，中间件是由一个接受中间件所需参数的Go函数创建的，并返回一个`tx.Middleware`。

例如，要创建一个任意的`MyMiddleware`，我们可以实现：

```go
// myTxHandler is the tx.Handler of this middleware. Note that it holds a
// reference to the next tx.Handler in the stack.
type myTxHandler struct {
    // next is the next tx.Handler in the middleware stack.
    next tx.Handler
    // some other fields that are relevant to the middleware can be added here
}

// NewMyMiddleware returns a middleware that does this and that.
func NewMyMiddleware(arg1, arg2) tx.Middleware {
    return func (txh tx.Handler) tx.Handler {
        return myTxHandler{
            next: txh,
            // optionally, set arg1, arg2... if they are needed in the middleware
        }
    }
}

// Assert myTxHandler is a tx.Handler.
var _ tx.Handler = myTxHandler{}

func (h myTxHandler) CheckTx(ctx context.Context, req Request, checkReq RequestcheckTx) (Response, ResponseCheckTx, error) {
    // CheckTx specific pre-processing logic

    // run the next middleware
    res, checkRes, err := txh.next.CheckTx(ctx, req, checkReq)

    // CheckTx specific post-processing logic

    return res, checkRes, err
}

func (h myTxHandler) DeliverTx(ctx context.Context, req Request) (Response, error) {
    // DeliverTx specific pre-processing logic

    // run the next middleware
    res, err := txh.next.DeliverTx(ctx, tx, req)

    // DeliverTx specific post-processing logic

    return res, err
}

func (h myTxHandler) SimulateTx(ctx context.Context, req Request) (Response, error) {
    // SimulateTx specific pre-processing logic

    // run the next middleware
    res, err := txh.next.SimulateTx(ctx, tx, req)

    // SimulateTx specific post-processing logic

    return res, err
}
```

### 组合中间件

虽然BaseApp只持有对`tx.Handler`的引用，但这个`tx.Handler`本身是使用中间件堆栈定义的。Cosmos SDK公开了一个基本（即最内层）的`tx.Handler`，称为`RunMsgsTxHandler`，用于执行消息。

然后，应用程序开发人员可以在基本`tx.Handler`之上组合多个中间件。每个中间件可以在其下一个中间件周围运行前处理和后处理逻辑，如上一节所述。概念上，例如，给定中间件`A`、`B`和`C`以及基本`tx.Handler` `H`，堆栈如下所示：

```text
A.pre
    B.pre
        C.pre
            H # The base tx.handler, for example `RunMsgsTxHandler`
        C.post
    B.post
A.post
```

我们定义了一个`ComposeMiddlewares`函数来组合中间件。它以基本处理程序作为第一个参数，并按照“从外到内”的顺序提供中间件。对于上述堆栈，最终的`tx.Handler`是：

```go
txHandler := middleware.ComposeMiddlewares(H, A, B, C)
```

通过其`SetTxHandler`设置器，在BaseApp中设置中间件：

```go
// simapp/app.go

txHandler := middleware.ComposeMiddlewares(...)
app.SetTxHandler(txHandler)
```

应用程序开发人员可以定义自己的中间件，或使用Cosmos SDK中预定义的中间件`middleware.NewDefaultTxHandler()`。

### Cosmos SDK维护的中间件

虽然应用程序开发人员可以定义和组合自己选择的中间件，但Cosmos SDK提供了一组中间件，以满足生态系统中最常见的用例。这些中间件包括：

| 中间件                  | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RunMsgsTxHandler        | 这是基本的`tx.Handler`。它替换了旧的baseapp的`runMsgs`，并执行事务的`Msg`。                                                                                                                                                                                                                                                                                                                                                                             |
| TxDecoderMiddleware     | 此中间件接收事务的原始字节，并将其解码为`sdk.Tx`。它替换了`baseapp.txDecoder`字段，以使BaseApp尽可能保持简洁。由于大多数中间件读取`sdk.Tx`的内容，TxDecoderMiddleware应该在中间件堆栈中首先运行。                                                                                                                                                                                                                                                   |
| {Antehandlers}          | 每个antehandler都转换为自己的中间件。这些中间件对传入的事务执行签名验证、费用扣除和其他验证操作。                                                                                                                                                                                                                                                                                                                                                                                 |
| IndexEventsTxMiddleware | 这是一个简单的中间件，用于选择在Tendermint中索引的事件。替换了`baseapp.indexEvents`（不幸的是，它仍然存在于baseapp中，因为它用于索引Begin/EndBlock事件）                                                                                                                                                                                                                                                                                                                     |
| RecoveryTxMiddleware    | 此索引从panic中恢复。它替换了baseapp.runTx中描述的panic恢复[ADR-022](adr-022-custom-panic-handling.md)。                                                                                                                                                                                                                                                                                                                                                  |
| GasTxMiddleware         | 这替换了[`Setup`](https://github.com/cosmos/cosmos-sdk/blob/v0.43.0/x/auth/ante/setup.go) Antehandler。它在sdk.Context上设置了一个GasMeter。请注意，以前，GasMeter是在antehandlers内部的sdk.Context上设置的，并且在antehandlers周围有一些混乱，因为antehandlers有自己的panic恢复系统，以便GasMeter可以被baseapp的恢复系统读取。现在，这个混乱全部消除了：一个中间件设置GasMeter，另一个中间件处理恢复。 |

### Antehandlers 和 Middlewares 的相似之处和不同之处

基于中间件的设计是建立在已经在 [ADR-010](adr-010-modular-antehandler.md) 中描述的 antehandlers 设计之上的。尽管 ADR-010 的最终决定是采用 "简单装饰器" 的方法，但中间件设计实际上与另一个 [装饰器模式](adr-010-modular-antehandler.md#decorator-pattern) 提案非常相似，该提案也在 [weave](https://github.com/iov-one/weave) 中使用。

#### 与 Antehandlers 的相似之处

* 设计为链式/组合小模块。
* 允许对 `{Check,Deliver}Tx` 和 `Simulate` 进行代码重用。
* 在 `app.go` 中设置，并且可以由应用程序开发人员轻松自定义。
* 顺序很重要。

#### 与 Antehandlers 的不同之处

* Antehandlers 在 `Msg` 执行之前运行，而中间件可以在之前和之后运行。
* 中间件方法使用单独的方法来处理 `{Check,Deliver,Simulate}Tx`，而 antehandlers 通过传递一个 `simulate bool` 标志并使用 `sdkCtx.Is{Check,Recheck}Tx()` 标志来确定我们处于哪种事务模式。
* 中间件设计允许每个中间件持有对下一个中间件的引用，而 antehandlers 在 `AnteHandle` 方法中传递一个 `next` 参数。
* 中间件设计使用 Go 的标准 `context.Context`，而 antehandlers 使用 `sdk.Context`。

## 结果

### 向后兼容性

由于此重构将一些逻辑从 BaseApp 中移出并放入中间件中，它为应用程序开发人员引入了破坏 API 的更改。最重要的是，应用程序开发人员不再需要在 `app.go` 中创建 antehandler 链，而是需要创建一个中间件堆栈：

```diff
- anteHandler, err := ante.NewAnteHandler(
-    ante.HandlerOptions{
-        AccountKeeper:   app.AccountKeeper,
-        BankKeeper:      app.BankKeeper,
-        SignModeHandler: encodingConfig.TxConfig.SignModeHandler(),
-        FeegrantKeeper:  app.FeeGrantKeeper,
-        SigGasConsumer:  ante.DefaultSigVerificationGasConsumer,
-    },
-)
+txHandler, err := authmiddleware.NewDefaultTxHandler(authmiddleware.TxHandlerOptions{
+    Debug:             app.Trace(),
+    IndexEvents:       indexEvents,
+    LegacyRouter:      app.legacyRouter,
+    MsgServiceRouter:  app.msgSvcRouter,
+    LegacyAnteHandler: anteHandler,
+    TxDecoder:         encodingConfig.TxConfig.TxDecoder,
+})
if err != nil {
    panic(err)
}
- app.SetAnteHandler(anteHandler)
+ app.SetTxHandler(txHandler)
```

其他更小的破坏 API 的更改也将在 CHANGELOG 中提供。与往常一样，Cosmos SDK 将为应用程序开发人员提供发布迁移文档。

此 ADR 不会引入任何破坏状态机、客户端或 CLI 的更改。

### 积极影响

* 允许在 `Msg` 执行之前和之后运行自定义逻辑。这使得 [小费](https://github.com/cosmos/cosmos-sdk/issues/9406) 和 [燃料退款](https://github.com/cosmos/cosmos-sdk/issues/2150) 等用例成为可能，也可能有其他用例。
* 使 BaseApp 更加轻量化，并将复杂逻辑延迟到小型模块化组件中。
* 使用不同的返回类型分离 `{Check,Deliver,Simulate}Tx` 的路径。这允许提高可读性（用单独的方法替换 `if sdkCtx.IsRecheckTx() && !simulate {...}`）和更灵活性（例如，在 `ResponseCheckTx` 中返回一个 `priority`）。

### 负面影响

* 一开始很难一眼看出在 `sdk.Context` 和 `tx` 运行后中间件会发生的状态更新。一个中间件可以在其函数体内调用任意数量的嵌套中间件，每个中间件可能在调用链上的下一个中间件之前进行一些预处理和后处理。因此，要理解一个中间件在做什么，还必须了解链上每个其他中间件在做什么，而且中间件的顺序很重要。这可能变得非常复杂难以理解。
* 对应用程序开发者来说，这可能会导致破坏 API 的变化。

### 中性影响

没有中性影响。

## 进一步讨论

* [#9934](https://github.com/cosmos/cosmos-sdk/discussions/9934) 将 BaseApp 的其他 ABCI 方法分解为中间件。
* 在 `tx.Handler` 方法的签名中，用具体的 protobuf Tx 类型替换 `sdk.Tx` 接口。

## 测试用例

我们更新现有的 baseapp 和 antehandlers 测试，使用新的中间件 API，但保持相同的测试用例和逻辑，以避免引入回归。现有的 CLI 测试也将保持不变。

对于新的中间件，我们引入单元测试。由于中间件故意保持较小，单元测试非常适合。

## 参考资料

* 初始讨论：https://github.com/cosmos/cosmos-sdk/issues/9585
* 实现：[#9920 BaseApp refactor](https://github.com/cosmos/cosmos-sdk/pull/9920) 和 [#10028 Antehandlers migration](https://github.com/cosmos/cosmos-sdk/pull/10028)


# ADR 045: BaseApp `{Check,Deliver}Tx` as Middlewares

## Changelog

* 20.08.2021: Initial draft.
* 07.12.2021: Update `tx.Handler` interface ([\#10693](https://github.com/cosmos/cosmos-sdk/pull/10693)).
* 17.05.2022: ADR is abandoned, as middlewares are deemed too hard to reason about.

## Status

ABANDONED. Replacement is being discussed in [#11955](https://github.com/cosmos/cosmos-sdk/issues/11955).

## Abstract

This ADR replaces the current BaseApp `runTx` and antehandlers design with a middleware-based design.

## Context

BaseApp's implementation of ABCI `{Check,Deliver}Tx()` and its own `Simulate()` method call the `runTx` method under the hood, which first runs antehandlers, then executes `Msg`s. However, the [transaction Tips](https://github.com/cosmos/cosmos-sdk/issues/9406) and [refunding unused gas](https://github.com/cosmos/cosmos-sdk/issues/2150) use cases require custom logic to be run after the `Msg`s execution. There is currently no way to achieve this.

An naive solution would be to add post-`Msg` hooks to BaseApp. However, the Cosmos SDK team thinks in parallel about the bigger picture of making app wiring simpler ([#9181](https://github.com/cosmos/cosmos-sdk/discussions/9182)), which includes making BaseApp more lightweight and modular.

## Decision

We decide to transform Baseapp's implementation of ABCI `{Check,Deliver}Tx` and its own `Simulate` methods to use a middleware-based design.

The two following interfaces are the base of the middleware design, and are defined in `types/tx`:

```go
type Handler interface {
    CheckTx(ctx context.Context, req Request, checkReq RequestCheckTx) (Response, ResponseCheckTx, error)
    DeliverTx(ctx context.Context, req Request) (Response, error)
    SimulateTx(ctx context.Context, req Request (Response, error)
}

type Middleware func(Handler) Handler
```

where we define the following arguments and return types:

```go
type Request struct {
	Tx      sdk.Tx
	TxBytes []byte
}

type Response struct {
	GasWanted uint64
	GasUsed   uint64
	// MsgResponses is an array containing each Msg service handler's response
	// type, packed in an Any. This will get proto-serialized into the `Data` field
	// in the ABCI Check/DeliverTx responses.
	MsgResponses []*codectypes.Any
	Log          string
	Events       []abci.Event
}

type RequestCheckTx struct {
	Type abci.CheckTxType
}

type ResponseCheckTx struct {
	Priority int64
}
```

Please note that because CheckTx handles separate logic related to mempool priotization, its signature is different than DeliverTx and SimulateTx.

BaseApp holds a reference to a `tx.Handler`:

```go
type BaseApp  struct {
    // other fields
    txHandler tx.Handler
}
```

Baseapp's ABCI `{Check,Deliver}Tx()` and `Simulate()` methods simply call `app.txHandler.{Check,Deliver,Simulate}Tx()` with the relevant arguments. For example, for `DeliverTx`:

```go
func (app *BaseApp) DeliverTx(req abci.RequestDeliverTx) abci.ResponseDeliverTx {
    var abciRes abci.ResponseDeliverTx
	ctx := app.getContextForTx(runTxModeDeliver, req.Tx)
	res, err := app.txHandler.DeliverTx(ctx, tx.Request{TxBytes: req.Tx})
	if err != nil {
		abciRes = sdkerrors.ResponseDeliverTx(err, uint64(res.GasUsed), uint64(res.GasWanted), app.trace)
		return abciRes
	}

	abciRes, err = convertTxResponseToDeliverTx(res)
	if err != nil {
		return sdkerrors.ResponseDeliverTx(err, uint64(res.GasUsed), uint64(res.GasWanted), app.trace)
	}

	return abciRes
}

// convertTxResponseToDeliverTx converts a tx.Response into a abci.ResponseDeliverTx.
func convertTxResponseToDeliverTx(txRes tx.Response) (abci.ResponseDeliverTx, error) {
	data, err := makeABCIData(txRes)
	if err != nil {
		return abci.ResponseDeliverTx{}, nil
	}

	return abci.ResponseDeliverTx{
		Data:   data,
		Log:    txRes.Log,
		Events: txRes.Events,
	}, nil
}

// makeABCIData generates the Data field to be sent to ABCI Check/DeliverTx.
func makeABCIData(txRes tx.Response) ([]byte, error) {
	return proto.Marshal(&sdk.TxMsgData{MsgResponses: txRes.MsgResponses})
}
```

The implementations are similar for `BaseApp.CheckTx` and `BaseApp.Simulate`.

`baseapp.txHandler`'s three methods' implementations can obviously be monolithic functions, but for modularity we propose a middleware composition design, where a middleware is simply a function that takes a `tx.Handler`, and returns another `tx.Handler` wrapped around the previous one.

### Implementing a Middleware

In practice, middlewares are created by Go function that takes as arguments some parameters needed for the middleware, and returns a `tx.Middleware`.

For example, for creating an arbitrary `MyMiddleware`, we can implement:

```go
// myTxHandler is the tx.Handler of this middleware. Note that it holds a
// reference to the next tx.Handler in the stack.
type myTxHandler struct {
    // next is the next tx.Handler in the middleware stack.
    next tx.Handler
    // some other fields that are relevant to the middleware can be added here
}

// NewMyMiddleware returns a middleware that does this and that.
func NewMyMiddleware(arg1, arg2) tx.Middleware {
    return func (txh tx.Handler) tx.Handler {
        return myTxHandler{
            next: txh,
            // optionally, set arg1, arg2... if they are needed in the middleware
        }
    }
}

// Assert myTxHandler is a tx.Handler.
var _ tx.Handler = myTxHandler{}

func (h myTxHandler) CheckTx(ctx context.Context, req Request, checkReq RequestcheckTx) (Response, ResponseCheckTx, error) {
    // CheckTx specific pre-processing logic

    // run the next middleware
    res, checkRes, err := txh.next.CheckTx(ctx, req, checkReq)

    // CheckTx specific post-processing logic

    return res, checkRes, err
}

func (h myTxHandler) DeliverTx(ctx context.Context, req Request) (Response, error) {
    // DeliverTx specific pre-processing logic

    // run the next middleware
    res, err := txh.next.DeliverTx(ctx, tx, req)

    // DeliverTx specific post-processing logic

    return res, err
}

func (h myTxHandler) SimulateTx(ctx context.Context, req Request) (Response, error) {
    // SimulateTx specific pre-processing logic

    // run the next middleware
    res, err := txh.next.SimulateTx(ctx, tx, req)

    // SimulateTx specific post-processing logic

    return res, err
}
```

### Composing Middlewares

While BaseApp simply holds a reference to a `tx.Handler`, this `tx.Handler` itself is defined using a middleware stack. The Cosmos SDK exposes a base (i.e. innermost) `tx.Handler` called `RunMsgsTxHandler`, which executes messages.

Then, the app developer can compose multiple middlewares on top on the base `tx.Handler`. Each middleware can run pre-and-post-processing logic around its next middleware, as described in the section above. Conceptually, as an example, given the middlewares `A`, `B`, and `C` and the base `tx.Handler` `H` the stack looks like:

```text
A.pre
    B.pre
        C.pre
            H # The base tx.handler, for example `RunMsgsTxHandler`
        C.post
    B.post
A.post
```

We define a `ComposeMiddlewares` function for composing middlewares. It takes the base handler as first argument, and middlewares in the "outer to inner" order. For the above stack, the final `tx.Handler` is:

```go
txHandler := middleware.ComposeMiddlewares(H, A, B, C)
```

The middleware is set in BaseApp via its `SetTxHandler` setter:

```go
// simapp/app.go

txHandler := middleware.ComposeMiddlewares(...)
app.SetTxHandler(txHandler)
```

The app developer can define their own middlewares, or use the Cosmos SDK's pre-defined middlewares from `middleware.NewDefaultTxHandler()`.

### Middlewares Maintained by the Cosmos SDK

While the app developer can define and compose the middlewares of their choice, the Cosmos SDK provides a set of middlewares that caters for the ecosystem's most common use cases. These middlewares are:

| Middleware              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RunMsgsTxHandler        | This is the base `tx.Handler`. It replaces the old baseapp's `runMsgs`, and executes a transaction's `Msg`s.                                                                                                                                                                                                                                                                                                                                                                             |
| TxDecoderMiddleware     | This middleware takes in transaction raw bytes, and decodes them into a `sdk.Tx`. It replaces the `baseapp.txDecoder` field, so that BaseApp stays as thin as possible. Since most middlewares read the contents of the `sdk.Tx`, the TxDecoderMiddleware should be run first in the middleware stack.                                                                                                                                                                                   |
| {Antehandlers}          | Each antehandler is converted to its own middleware. These middlewares perform signature verification, fee deductions and other validations on the incoming transaction.                                                                                                                                                                                                                                                                                                                 |
| IndexEventsTxMiddleware | This is a simple middleware that chooses which events to index in Tendermint. Replaces `baseapp.indexEvents` (which unfortunately still exists in baseapp too, because it's used to index Begin/EndBlock events)                                                                                                                                                                                                                                                                         |
| RecoveryTxMiddleware    | This index recovers from panics. It replaces baseapp.runTx's panic recovery described in [ADR-022](adr-022-custom-panic-handling.md).                                                                                                                                                                                                                                                                                                                                                  |
| GasTxMiddleware         | This replaces the [`Setup`](https://github.com/cosmos/cosmos-sdk/blob/v0.43.0/x/auth/ante/setup.go) Antehandler. It sets a GasMeter on sdk.Context. Note that before, GasMeter was set on sdk.Context inside the antehandlers, and there was some mess around the fact that antehandlers had their own panic recovery system so that the GasMeter could be read by baseapp's recovery system. Now, this mess is all removed: one middleware sets GasMeter, another one handles recovery. |

### Similarities and Differences between Antehandlers and Middlewares

The middleware-based design builds upon the existing antehandlers design described in [ADR-010](adr-010-modular-antehandler.md). Even though the final decision of ADR-010 was to go with the "Simple Decorators" approach, the middleware design is actually very similar to the other [Decorator Pattern](adr-010-modular-antehandler.md#decorator-pattern) proposal, also used in [weave](https://github.com/iov-one/weave).

#### Similarities with Antehandlers

* Designed as chaining/composing small modular pieces.
* Allow code reuse for `{Check,Deliver}Tx` and for `Simulate`.
* Set up in `app.go`, and easily customizable by app developers.
* Order is important.

#### Differences with Antehandlers

* The Antehandlers are run before `Msg` execution, whereas middlewares can run before and after.
* The middleware approach uses separate methods for `{Check,Deliver,Simulate}Tx`, whereas the antehandlers pass a `simulate bool` flag and uses the `sdkCtx.Is{Check,Recheck}Tx()` flags to determine in which transaction mode we are.
* The middleware design lets each middleware hold a reference to the next middleware, whereas the antehandlers pass a `next` argument in the `AnteHandle` method.
* The middleware design use Go's standard `context.Context`, whereas the antehandlers use `sdk.Context`.

## Consequences

### Backwards Compatibility

Since this refactor removes some logic away from BaseApp and into middlewares, it introduces API-breaking changes for app developers. Most notably, instead of creating an antehandler chain in `app.go`, app developers need to create a middleware stack:

```diff
- anteHandler, err := ante.NewAnteHandler(
-    ante.HandlerOptions{
-        AccountKeeper:   app.AccountKeeper,
-        BankKeeper:      app.BankKeeper,
-        SignModeHandler: encodingConfig.TxConfig.SignModeHandler(),
-        FeegrantKeeper:  app.FeeGrantKeeper,
-        SigGasConsumer:  ante.DefaultSigVerificationGasConsumer,
-    },
-)
+txHandler, err := authmiddleware.NewDefaultTxHandler(authmiddleware.TxHandlerOptions{
+    Debug:             app.Trace(),
+    IndexEvents:       indexEvents,
+    LegacyRouter:      app.legacyRouter,
+    MsgServiceRouter:  app.msgSvcRouter,
+    LegacyAnteHandler: anteHandler,
+    TxDecoder:         encodingConfig.TxConfig.TxDecoder,
+})
if err != nil {
    panic(err)
}
- app.SetAnteHandler(anteHandler)
+ app.SetTxHandler(txHandler)
```

Other more minor API breaking changes will also be provided in the CHANGELOG. As usual, the Cosmos SDK will provide a release migration document for app developers.

This ADR does not introduce any state-machine-, client- or CLI-breaking changes.

### Positive

* Allow custom logic to be run before an after `Msg` execution. This enables the [tips](https://github.com/cosmos/cosmos-sdk/issues/9406) and [gas refund](https://github.com/cosmos/cosmos-sdk/issues/2150) uses cases, and possibly other ones.
* Make BaseApp more lightweight, and defer complex logic to small modular components.
* Separate paths for `{Check,Deliver,Simulate}Tx` with different returns types. This allows for improved readability (replace `if sdkCtx.IsRecheckTx() && !simulate {...}` with separate methods) and more flexibility (e.g. returning a `priority` in `ResponseCheckTx`).

### Negative

* It is hard to understand at first glance the state updates that would occur after a middleware runs given the `sdk.Context` and `tx`. A middleware can have an arbitrary number of nested middleware being called within its function body, each possibly doing some pre- and post-processing before calling the next middleware on the chain. Thus to understand what a middleware is doing, one must also understand what every other middleware further along the chain is also doing, and the order of middlewares matters. This can get quite complicated to understand.
* API-breaking changes for app developers.

### Neutral

No neutral consequences.

## Further Discussions

* [#9934](https://github.com/cosmos/cosmos-sdk/discussions/9934) Decomposing BaseApp's other ABCI methods into middlewares.
* Replace `sdk.Tx` interface with the concrete protobuf Tx type in the `tx.Handler` methods signature.

## Test Cases

We update the existing baseapp and antehandlers tests to use the new middleware API, but keep the same test cases and logic, to avoid introducing regressions. Existing CLI tests will also be left untouched.

For new middlewares, we introduce unit tests. Since middlewares are purposefully small, unit tests suit well.

## References

* Initial discussion: https://github.com/cosmos/cosmos-sdk/issues/9585
* Implementation: [#9920 BaseApp refactor](https://github.com/cosmos/cosmos-sdk/pull/9920) and [#10028 Antehandlers migration](https://github.com/cosmos/cosmos-sdk/pull/10028)
