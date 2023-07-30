# 错误

:::note 概要
本文档概述了在 Cosmos SDK 模块中处理错误的推荐用法和 API。
:::

鼓励模块定义和注册自己的错误，以提供有关失败的消息或处理程序执行的更好上下文。通常，这些错误应该是常见或通用错误，可以进一步包装以提供额外的特定执行上下文。

## 注册

模块应该在 `x/{module}/errors.go` 中定义和注册自定义错误。错误的注册是通过 [`errors` 包](https://github.com/cosmos/cosmos-sdk/blob/main/errors/errors.go) 处理的。

示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/distribution/types/errors.go#L1-L21
```

每个自定义模块错误必须提供 codespace，通常是模块名称（例如 "distribution"），并且在模块内是唯一的，以及一个 uint32 的代码。代码空间和代码一起提供了一个全局唯一的 Cosmos SDK 错误。通常，代码是单调递增的，但不一定非要如此。对错误代码的唯一限制如下：

* 必须大于 1，因为代码值 1 保留给内部错误。
* 在模块内必须是唯一的。

请注意，Cosmos SDK 提供了一组核心的 *常见* 错误。这些错误在 [`types/errors/errors.go`](https://github.com/cosmos/cosmos-sdk/blob/main/types/errors/errors.go) 中定义。

## 包装

自定义模块错误可以作为其具体类型返回，因为它们已经满足了 `error` 接口。然而，模块错误可以被包装以提供进一步的上下文和含义，以表示执行失败。

示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/keeper.go#L141-L182
```

无论错误是否被包装，Cosmos SDK 的 `errors` 包都提供了一个函数 `Is` 来确定错误是否属于特定类型。

## ABCI

如果模块错误已注册，Cosmos SDK 的 `errors` 包允许通过 `ABCIInfo` 函数提取 ABCI 信息。该包还提供了 `ResponseCheckTx` 和 `ResponseDeliverTx` 作为辅助函数，以自动从错误中获取 `CheckTx` 和 `DeliverTx` 的响应。

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.




# Errors

:::note Synopsis
This document outlines the recommended usage and APIs for error handling in Cosmos SDK modules.
:::

Modules are encouraged to define and register their own errors to provide better
context on failed message or handler execution. Typically, these errors should be
common or general errors which can be further wrapped to provide additional specific
execution context.

## Registration

Modules should define and register their custom errors in `x/{module}/errors.go`.
Registration of errors is handled via the [`errors` package](https://github.com/cosmos/cosmos-sdk/blob/main/errors/errors.go).

Example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/distribution/types/errors.go#L1-L21
```

Each custom module error must provide the codespace, which is typically the module name
(e.g. "distribution") and is unique per module, and a uint32 code. Together, the codespace and code
provide a globally unique Cosmos SDK error. Typically, the code is monotonically increasing but does not
necessarily have to be. The only restrictions on error codes are the following:

* Must be greater than one, as a code value of one is reserved for internal errors.
* Must be unique within the module.

Note, the Cosmos SDK provides a core set of *common* errors. These errors are defined in [`types/errors/errors.go`](https://github.com/cosmos/cosmos-sdk/blob/main/types/errors/errors.go).

## Wrapping

The custom module errors can be returned as their concrete type as they already fulfill the `error`
interface. However, module errors can be wrapped to provide further context and meaning to failed
execution.

Example:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/bank/keeper/keeper.go#L141-L182
```

Regardless if an error is wrapped or not, the Cosmos SDK's `errors` package provides a function to determine if
an error is of a particular kind via `Is`.

## ABCI

If a module error is registered, the Cosmos SDK `errors` package allows ABCI information to be extracted
through the `ABCIInfo` function. The package also provides `ResponseCheckTx` and `ResponseDeliverTx` as
auxiliary functions to automatically get `CheckTx` and `DeliverTx` responses from an error.
