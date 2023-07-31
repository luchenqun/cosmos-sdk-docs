# Rosetta

`rosetta` 包实现了 Coinbase 的 [Rosetta API](https://www.rosetta-api.org)。本文档提供了如何使用 Rosetta API 集成的说明。有关动机和设计选择的信息，请参阅 [ADR 035](https://docs.cosmos.network/main/architecture/adr-035-rosetta-api-support)。

## 添加 Rosetta 命令

Rosetta API 服务器是一个独立的服务器，连接到使用 Cosmos SDK 开发的链的节点。

要启用 Rosetta API 支持，需要将 `RosettaCommand` 添加到应用程序的根命令文件中（例如 `simd/cmd/root.go`）。

导入 `rosettaCmd` 包：

```go
import "cosmossdk.io/tools/rosetta/cmd"
```

找到以下行：

```go
initRootCmd(rootCmd, encodingConfig)
```

在该行之后，添加以下内容：

```go
rootCmd.AddCommand(
  rosettaCmd.RosettaCommand(encodingConfig.InterfaceRegistry, encodingConfig.Codec)
)
```

`RosettaCommand` 函数构建了 `rosetta` 根命令，并在 `rosettaCmd` 包（`cosmossdk.io/tools/rosetta/cmd`）中定义。

由于我们已经更新了 Cosmos SDK 以与 Rosetta API 兼容，只需更新应用程序的根命令文件即可。

在 `simapp` 包中可以找到一个实现示例。

## 使用 Rosetta 命令

要在应用程序的 CLI 中运行 Rosetta，请使用以下命令：

```shell
simd rosetta --help
```

要测试和运行正在运行和公开的应用程序的 Rosetta API 端点，请使用以下命令：

```shell
simd rosetta
     --blockchain "your application name (ex: gaia)"
     --network "your chain identifier (ex: testnet-1)"
     --tendermint "tendermint endpoint (ex: localhost:26657)"
     --grpc "gRPC endpoint (ex: localhost:9090)"
     --addr "rosetta binding address (ex: :8080)"
```

## 使用独立的 Rosetta

要在应用程序中不添加 Rosetta 的情况下使用独立的 Rosetta，请使用以下命令进行安装：

```bash
go install cosmossdk.io/tools/rosetta/cmd/rosetta
```

或者，如果要从源代码构建，请直接运行 `make rosetta`。二进制文件将位于 `tools/rosetta` 目录中。

## 扩展

有两种方式可以使用自定义设置来自定义和扩展实现。

### 消息扩展

为了使 `sdk.Msg` 能够被 Rosetta 理解，唯一需要的是为您的消息添加满足 `rosetta.Msg` 接口的方法。如何实现这些方法的示例可以在委托类型（例如 `MsgDelegate`）或银行类型（例如 `MsgSend`）中找到。

### 客户端接口覆盖

如果需要更多的自定义，可以嵌入Client类型并覆盖需要自定义的方法。

示例：

```go
package custom_client
import (

"context"
"github.com/coinbase/rosetta-sdk-go/types"
"cosmossdk.io/tools/rosetta/lib"
)

// CustomClient embeds the standard cosmos client
// which means that it implements the cosmos-rosetta-gateway Client
// interface while at the same time allowing to customize certain methods
type CustomClient struct {
    *rosetta.Client
}

func (c *CustomClient) ConstructionPayload(_ context.Context, request *types.ConstructionPayloadsRequest) (resp *types.ConstructionPayloadsResponse, err error) {
    // provide custom signature bytes
    panic("implement me")
}
```

注意：当使用自定义客户端时，由于所需的构造函数可能不同，无法使用该命令，因此需要创建一个新的客户端。我们计划在未来提供一种在不编写额外代码的情况下初始化自定义客户端的方法。

### 错误扩展

由于Rosetta要求将“返回”的错误提供给网络选项。为了声明一个新的Rosetta错误，我们在cosmos-rosetta-gateway中使用`errors`包。

示例：

```go
package custom_errors
import crgerrs "cosmossdk.io/tools/rosetta/lib/errors"

var customErrRetriable = true
var CustomError = crgerrs.RegisterError(100, "custom message", customErrRetriable, "description")
```

注意：必须在调用cosmos-rosetta-gateway的`Server`.`Start`方法之前注册错误。否则，注册将被忽略。相同代码的错误也将被忽略。




# Rosetta

The `rosetta` package implements Coinbase's [Rosetta API](https://www.rosetta-api.org). This document provides instructions on how to use the Rosetta API integration. For information about the motivation and design choices, refer to [ADR 035](https://docs.cosmos.network/main/architecture/adr-035-rosetta-api-support).

## Add Rosetta Command

The Rosetta API server is a stand-alone server that connects to a node of a chain developed with Cosmos SDK.

To enable Rosetta API support, it's required to add the `RosettaCommand` to your application's root command file (e.g. `simd/cmd/root.go`).

Import the `rosettaCmd` package:

```go
import "cosmossdk.io/tools/rosetta/cmd"
```

Find the following line:

```go
initRootCmd(rootCmd, encodingConfig)
```

After that line, add the following:

```go
rootCmd.AddCommand(
  rosettaCmd.RosettaCommand(encodingConfig.InterfaceRegistry, encodingConfig.Codec)
)
```

The `RosettaCommand` function builds the `rosetta` root command and is defined in the `rosettaCmd` package (`cosmossdk.io/tools/rosetta/cmd`).

Since we’ve updated the Cosmos SDK to work with the Rosetta API, updating the application's root command file is all you need to do.

An implementation example can be found in `simapp` package.

## Use Rosetta Command

To run Rosetta in your application CLI, use the following command:

```shell
simd rosetta --help
```

To test and run Rosetta API endpoints for applications that are running and exposed, use the following command:

```shell
simd rosetta
     --blockchain "your application name (ex: gaia)"
     --network "your chain identifier (ex: testnet-1)"
     --tendermint "tendermint endpoint (ex: localhost:26657)"
     --grpc "gRPC endpoint (ex: localhost:9090)"
     --addr "rosetta binding address (ex: :8080)"
```

## Use Rosetta Standalone

To use Rosetta standalone, without having to add it in your application, install it with the following command:

```bash
go install cosmossdk.io/tools/rosetta/cmd/rosetta
```

Alternatively, for building from source, simply run `make rosetta`. The binary will be located in `tools/rosetta`.

## Extensions

There are two ways in which you can customize and extend the implementation with your custom settings.

### Message extension

In order to make an `sdk.Msg` understandable by rosetta the only thing which is required is adding the methods to your messages that satisfy the `rosetta.Msg` interface. Examples on how to do so can be found in the staking types such as `MsgDelegate`, or in bank types such as `MsgSend`.

### Client interface override

In case more customization is required, it's possible to embed the Client type and override the methods which require customizations.

Example:

```go
package custom_client
import (

"context"
"github.com/coinbase/rosetta-sdk-go/types"
"cosmossdk.io/tools/rosetta/lib"
)

// CustomClient embeds the standard cosmos client
// which means that it implements the cosmos-rosetta-gateway Client
// interface while at the same time allowing to customize certain methods
type CustomClient struct {
    *rosetta.Client
}

func (c *CustomClient) ConstructionPayload(_ context.Context, request *types.ConstructionPayloadsRequest) (resp *types.ConstructionPayloadsResponse, err error) {
    // provide custom signature bytes
    panic("implement me")
}
```

NOTE: when using a customized client, the command cannot be used as the constructors required **may** differ, so it's required to create a new one. We intend to provide a way to init a customized client without writing extra code in the future.

### Error extension

Since rosetta requires to provide 'returned' errors to network options. In order to declare a new rosetta error, we use the `errors` package in cosmos-rosetta-gateway.

Example:

```go
package custom_errors
import crgerrs "cosmossdk.io/tools/rosetta/lib/errors"

var customErrRetriable = true
var CustomError = crgerrs.RegisterError(100, "custom message", customErrRetriable, "description")
```

Note: errors must be registered before cosmos-rosetta-gateway's `Server`.`Start` method is called. Otherwise the registration will be ignored. Errors with same code will be ignored too.
