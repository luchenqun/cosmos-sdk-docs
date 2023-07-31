# 与节点交互

:::note 概要
与节点进行交互有多种方式：使用命令行界面（CLI）、使用 gRPC 或使用 REST 端点。
:::

:::note

### 先决条件阅读

* [gRPC、REST 和 CometBFT 端点](../../develop/advanced-concepts/09-grpc_rest.md)
* [运行节点](01-run-node.md)

:::

## 使用命令行界面（CLI）

现在，您的链正在运行，是时候尝试将代币从您创建的第一个账户发送到第二个账户了。在一个新的终端窗口中，首先运行以下查询命令：

```bash
simd query bank balances $MY_VALIDATOR_ADDRESS
```

您应该看到您创建的账户的当前余额，等于您授予它的 `stake` 的原始余额减去您通过 `gentx` 委托的金额。现在，创建第二个账户：

```bash
simd keys add recipient --keyring-backend test

# Put the generated address in a variable for later use.
RECIPIENT=$(simd keys show recipient -a --keyring-backend test)
```

上述命令创建了一个尚未在链上注册的本地密钥对。账户在第一次从另一个账户接收到代币时创建。现在，运行以下命令将代币发送到 `recipient` 账户：

```bash
simd tx bank send $MY_VALIDATOR_ADDRESS $RECIPIENT 1000000stake --chain-id my-test-chain --keyring-backend test

# Check that the recipient account did receive the tokens.
simd query bank balances $RECIPIENT
```

最后，将发送到 `recipient` 账户的一部分质押代币委托给验证人：

```bash
simd tx staking delegate $(simd keys show my_validator --bech val -a --keyring-backend test) 500stake --from recipient --chain-id my-test-chain --keyring-backend test

# Query the total delegations to `validator`.
simd query staking delegations-to $(simd keys show my_validator --bech val -a --keyring-backend test)
```

您应该看到两个委托，第一个是通过 `gentx` 进行的，第二个是您刚刚从 `recipient` 账户执行的。

## 使用 gRPC

Protobuf 生态系统为不同的用例开发了工具，包括从 `*.proto` 文件生成各种语言的代码。这些工具可以轻松构建客户端。通常，客户端连接（即传输）可以很容易地插入和替换。让我们探索其中一个最受欢迎的传输方式：[gRPC](../../develop/advanced-concepts/09-grpc_rest.md)。

由于代码生成库在很大程度上取决于您自己的技术栈，我们只会介绍三种替代方案：

* `grpcurl` 用于通用调试和测试，
* 通过 Go 编程，
* 适用于 JavaScript/TypeScript 开发人员的 CosmJS。

### grpcurl

[grpcurl](https://github.com/fullstorydev/grpcurl) 类似于 `curl`，但用于 gRPC。它也可以作为一个 Go 库使用，但我们只会将其用作用于调试和测试的 CLI 命令。请按照上面链接中的说明安装它。

假设您已经运行了一个本地节点（可以是本地网络或连接到一个活跃网络），您应该能够运行以下命令来列出可用的 Protobuf 服务（您可以将 `localhost:9000` 替换为另一个节点的 gRPC 服务器端点，该端点在 [`app.toml`](01-run-node.md#configuring-the-node-using-apptoml-and-configtoml) 的 `grpc.address` 字段中配置）：

```bash
grpcurl -plaintext localhost:9090 list
```

您应该会看到一个 gRPC 服务列表，例如 `cosmos.bank.v1beta1.Query`。这被称为反射，它是一个返回所有可用端点描述的 Protobuf 端点。其中每个端点代表一个不同的 Protobuf 服务，每个服务都公开多个您可以查询的 RPC 方法。

为了获取服务的描述，您可以运行以下命令：

```bash
grpcurl -plaintext \
    localhost:9090 \
    describe cosmos.bank.v1beta1.Query                  # Service we want to inspect
```

还可以执行一个 RPC 调用来查询节点的信息：

```bash
grpcurl \
    -plaintext \
    -d "{\"address\":\"$MY_VALIDATOR_ADDRESS\"}" \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/AllBalances
```

所有可用的 gRPC 查询端点列表即将推出（[链接](https://github.com/cosmos/cosmos-sdk/issues/7786)）。

#### 使用 grpcurl 查询历史状态

您还可以通过传递一些 [gRPC 元数据](https://github.com/grpc/grpc-go/blob/master/Documentation/grpc-metadata.md) 来查询历史数据：`x-cosmos-block-height` 元数据应该包含要查询的块。使用上述的 grpcurl，命令如下：

```bash
grpcurl \
    -plaintext \
    -H "x-cosmos-block-height: 123" \
    -d "{\"address\":\"$MY_VALIDATOR_ADDRESS\"}" \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/AllBalances
```

假设该块的状态尚未被节点修剪，此查询应返回一个非空响应。

### 通过 Go 编程

以下代码片段展示了如何在 Go 程序中使用 gRPC 查询状态。其思路是创建一个 gRPC 连接，并使用生成的 Protobuf 客户端代码来查询 gRPC 服务器。

#### 安装 Cosmos SDK

```bash
go get github.com/cosmos/cosmos-sdk@main
```

```go
package main

import (
    "context"
    "fmt"

    "google.golang.org/grpc"

    "github.com/cosmos/cosmos-sdk/codec"
    sdk "github.com/cosmos/cosmos-sdk/types"
    banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
)

func queryState() error {
    myAddress, err := sdk.AccAddressFromBech32("cosmos1...") // the my_validator or recipient address.
    if err != nil {
        return err
    }

    // Create a connection to the gRPC server.
    grpcConn, err := grpc.Dial(
        "127.0.0.1:9090", // your gRPC server address.
        grpc.WithInsecure(), // The Cosmos SDK doesn't support any transport security mechanism. 
        // This instantiates a general gRPC codec which handles proto bytes. We pass in a nil interface registry
        // if the request/response types contain interface instead of 'nil' you should pass the application specific codec.
		grpc.WithDefaultCallOptions(grpc.ForceCodec(codec.NewProtoCodec(nil).GRPCCodec())),
	)
    if err != nil {
        return err
    }
    defer grpcConn.Close()

    // This creates a gRPC client to query the x/bank service.
    bankClient := banktypes.NewQueryClient(grpcConn)
    bankRes, err := bankClient.Balance(
        context.Background(),
        &banktypes.QueryBalanceRequest{Address: myAddress.String(), Denom: "stake"},
    )
    if err != nil {
        return err
    }

    fmt.Println(bankRes.GetBalance()) // Prints the account balance

    return nil
}

func main() {
    if err := queryState(); err != nil {
        panic(err)
    }
}
```

您可以将查询客户端（这里我们使用的是 `x/bank` 的客户端）替换为从任何其他 Protobuf 服务生成的客户端。所有可用的 gRPC 查询端点列表即将推出（[链接](https://github.com/cosmos/cosmos-sdk/issues/7786)）。

#### 使用 Go 查询历史状态

通过在 gRPC 请求中添加块高度元数据来查询历史块。

```go
package main

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"
	grpctypes "github.com/cosmos/cosmos-sdk/types/grpc"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
)

func queryState() error {
	myAddress, err := sdk.AccAddressFromBech32("cosmos1yerherx4d43gj5wa3zl5vflj9d4pln42n7kuzu") // the my_validator or recipient address.
	if err != nil {
		return err
	}

	// Create a connection to the gRPC server.
	grpcConn, err := grpc.Dial(
		"127.0.0.1:9090",    // your gRPC server address.
		grpc.WithInsecure(), // The Cosmos SDK doesn't support any transport security mechanism.
		// This instantiates a general gRPC codec which handles proto bytes. We pass in a nil interface registry
		// if the request/response types contain interface instead of 'nil' you should pass the application specific codec.
		grpc.WithDefaultCallOptions(grpc.ForceCodec(codec.NewProtoCodec(nil).GRPCCodec())),
	)
	if err != nil {
		return err
	}
	defer grpcConn.Close()

	// This creates a gRPC client to query the x/bank service.
	bankClient := banktypes.NewQueryClient(grpcConn)

	var header metadata.MD
	_, err = bankClient.Balance(
		metadata.AppendToOutgoingContext(context.Background(), grpctypes.GRPCBlockHeightHeader, "12"), // Add metadata to request
		&banktypes.QueryBalanceRequest{Address: myAddress.String(), Denom: "stake"},
		grpc.Header(&header), // Retrieve header from response
	)
	if err != nil {
		return err
	}
	blockHeight := header.Get(grpctypes.GRPCBlockHeightHeader)

	fmt.Println(blockHeight) // Prints the block height (12)

	return nil
}

func main() {
    if err := queryState(); err != nil {
        panic(err)
    }
}
```

### CosmJS

CosmJS 文档可以在 [https://cosmos.github.io/cosmjs](https://cosmos.github.io/cosmjs) 找到。截至2021年1月，CosmJS 文档仍在进行中。

## 使用 REST 端点

如 [gRPC 指南](../../develop/advanced-concepts/09-grpc_rest.md) 中所述，通过 gRPC-gateway，Cosmos SDK 上的所有 gRPC 服务都可以通过更方便的基于 REST 的查询来使用。URL 路径的格式基于 Protobuf 服务方法的完全限定名，但可能包含一些自定义，以使最终的 URL 看起来更符合惯例。例如，`cosmos.bank.v1beta1.Query/AllBalances` 方法的 REST 端点是 `GET /cosmos/bank/v1beta1/balances/{address}`。请求参数作为查询参数传递。

请注意，REST 端点默认情况下是禁用的。要启用它们，请编辑 `~/.simapp/config/app.toml` 文件中的 `api` 部分：

```toml
# Enable defines if the API server should be enabled.
enable = true
```

作为一个具体的示例，用于进行余额请求的 `curl` 命令如下：

```bash
curl \
    -X GET \
    -H "Content-Type: application/json" \
    http://localhost:1317/cosmos/bank/v1beta1/balances/$MY_VALIDATOR_ADDRESS
```

请确保将 `localhost:1317` 替换为您节点的 REST 端点，该端点在 `api.address` 字段下配置。

所有可用的 REST 端点列表作为 Swagger 规范文件可用，可以在 `localhost:1317/swagger` 查看。请确保您的 [`app.toml`](01-run-node.md#configuring-the-node-using-apptoml) 文件中的 `api.swagger` 字段设置为 true。

### 使用 REST 查询历史状态

使用 HTTP 头 `x-cosmos-block-height` 查询历史状态。例如，curl 命令如下：

```bash
curl \
    -X GET \
    -H "Content-Type: application/json" \
    -H "x-cosmos-block-height: 123" \
    http://localhost:1317/cosmos/bank/v1beta1/balances/$MY_VALIDATOR_ADDRESS
```

假设该块的状态尚未被节点修剪，此查询应返回一个非空响应。

### 跨源资源共享（CORS）

默认情况下，未启用 [CORS 策略](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) 以提高安全性。如果您希望在公共环境中使用 rest-server，我们建议您提供一个反向代理，可以使用 [nginx](https://www.nginx.com/) 完成此操作。对于测试和开发目的，在 [`app.toml`](01-run-node.md#configuring-the-node-using-apptoml) 文件中有一个 `enabled-unsafe-cors` 字段。

Please paste the Markdown content here.




# Interacting with the Node

:::note Synopsis
There are multiple ways to interact with a node: using the CLI, using gRPC or using the REST endpoints.
:::

:::note

### Pre-requisite Readings

* [gRPC, REST and CometBFT Endpoints](../../develop/advanced-concepts/09-grpc_rest.md)
* [Running a Node](01-run-node.md)

:::

## Using the CLI

Now that your chain is running, it is time to try sending tokens from the first account you created to a second account. In a new terminal window, start by running the following query command:

```bash
simd query bank balances $MY_VALIDATOR_ADDRESS
```

You should see the current balance of the account you created, equal to the original balance of `stake` you granted it minus the amount you delegated via the `gentx`. Now, create a second account:

```bash
simd keys add recipient --keyring-backend test

# Put the generated address in a variable for later use.
RECIPIENT=$(simd keys show recipient -a --keyring-backend test)
```

The command above creates a local key-pair that is not yet registered on the chain. An account is created the first time it receives tokens from another account. Now, run the following command to send tokens to the `recipient` account:

```bash
simd tx bank send $MY_VALIDATOR_ADDRESS $RECIPIENT 1000000stake --chain-id my-test-chain --keyring-backend test

# Check that the recipient account did receive the tokens.
simd query bank balances $RECIPIENT
```

Finally, delegate some of the stake tokens sent to the `recipient` account to the validator:

```bash
simd tx staking delegate $(simd keys show my_validator --bech val -a --keyring-backend test) 500stake --from recipient --chain-id my-test-chain --keyring-backend test

# Query the total delegations to `validator`.
simd query staking delegations-to $(simd keys show my_validator --bech val -a --keyring-backend test)
```

You should see two delegations, the first one made from the `gentx`, and the second one you just performed from the `recipient` account.

## Using gRPC

The Protobuf ecosystem developed tools for different use cases, including code-generation from `*.proto` files into various languages. These tools allow the building of clients easily. Often, the client connection (i.e. the transport) can be plugged and replaced very easily. Let's explore one of the most popular transport: [gRPC](../../develop/advanced-concepts/09-grpc_rest.md).

Since the code generation library largely depends on your own tech stack, we will only present three alternatives:

* `grpcurl` for generic debugging and testing,
* programmatically via Go,
* CosmJS for JavaScript/TypeScript developers.

### grpcurl

[grpcurl](https://github.com/fullstorydev/grpcurl) is like `curl` but for gRPC. It is also available as a Go library, but we will use it only as a CLI command for debugging and testing purposes. Follow the instructions in the previous link to install it.

Assuming you have a local node running (either a localnet, or connected a live network), you should be able to run the following command to list the Protobuf services available (you can replace `localhost:9000` by the gRPC server endpoint of another node, which is configured under the `grpc.address` field inside [`app.toml`](01-run-node.md#configuring-the-node-using-apptoml-and-configtoml)):

```bash
grpcurl -plaintext localhost:9090 list
```

You should see a list of gRPC services, like `cosmos.bank.v1beta1.Query`. This is called reflection, which is a Protobuf endpoint returning a description of all available endpoints. Each of these represents a different Protobuf service, and each service exposes multiple RPC methods you can query against.

In order to get a description of the service you can run the following command:

```bash
grpcurl -plaintext \
    localhost:9090 \
    describe cosmos.bank.v1beta1.Query                  # Service we want to inspect
```

It's also possible to execute an RPC call to query the node for information:

```bash
grpcurl \
    -plaintext \
    -d "{\"address\":\"$MY_VALIDATOR_ADDRESS\"}" \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/AllBalances
```

The list of all available gRPC query endpoints is [coming soon](https://github.com/cosmos/cosmos-sdk/issues/7786).

#### Query for historical state using grpcurl

You may also query for historical data by passing some [gRPC metadata](https://github.com/grpc/grpc-go/blob/master/Documentation/grpc-metadata.md) to the query: the `x-cosmos-block-height` metadata should contain the block to query. Using grpcurl as above, the command looks like:

```bash
grpcurl \
    -plaintext \
    -H "x-cosmos-block-height: 123" \
    -d "{\"address\":\"$MY_VALIDATOR_ADDRESS\"}" \
    localhost:9090 \
    cosmos.bank.v1beta1.Query/AllBalances
```

Assuming the state at that block has not yet been pruned by the node, this query should return a non-empty response.

### Programmatically via Go

The following snippet shows how to query the state using gRPC inside a Go program. The idea is to create a gRPC connection, and use the Protobuf-generated client code to query the gRPC server.

#### Install Cosmos SDK


```bash
go get github.com/cosmos/cosmos-sdk@main
```

```go
package main

import (
    "context"
    "fmt"

    "google.golang.org/grpc"

    "github.com/cosmos/cosmos-sdk/codec"
    sdk "github.com/cosmos/cosmos-sdk/types"
    banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
)

func queryState() error {
    myAddress, err := sdk.AccAddressFromBech32("cosmos1...") // the my_validator or recipient address.
    if err != nil {
        return err
    }

    // Create a connection to the gRPC server.
    grpcConn, err := grpc.Dial(
        "127.0.0.1:9090", // your gRPC server address.
        grpc.WithInsecure(), // The Cosmos SDK doesn't support any transport security mechanism. 
        // This instantiates a general gRPC codec which handles proto bytes. We pass in a nil interface registry
        // if the request/response types contain interface instead of 'nil' you should pass the application specific codec.
		grpc.WithDefaultCallOptions(grpc.ForceCodec(codec.NewProtoCodec(nil).GRPCCodec())),
	)
    if err != nil {
        return err
    }
    defer grpcConn.Close()

    // This creates a gRPC client to query the x/bank service.
    bankClient := banktypes.NewQueryClient(grpcConn)
    bankRes, err := bankClient.Balance(
        context.Background(),
        &banktypes.QueryBalanceRequest{Address: myAddress.String(), Denom: "stake"},
    )
    if err != nil {
        return err
    }

    fmt.Println(bankRes.GetBalance()) // Prints the account balance

    return nil
}

func main() {
    if err := queryState(); err != nil {
        panic(err)
    }
}
```

You can replace the query client (here we are using `x/bank`'s) with one generated from any other Protobuf service. The list of all available gRPC query endpoints is [coming soon](https://github.com/cosmos/cosmos-sdk/issues/7786).

#### Query for historical state using Go

Querying for historical blocks is done by adding the block height metadata in the gRPC request.

```go
package main

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"
	grpctypes "github.com/cosmos/cosmos-sdk/types/grpc"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
)

func queryState() error {
	myAddress, err := sdk.AccAddressFromBech32("cosmos1yerherx4d43gj5wa3zl5vflj9d4pln42n7kuzu") // the my_validator or recipient address.
	if err != nil {
		return err
	}

	// Create a connection to the gRPC server.
	grpcConn, err := grpc.Dial(
		"127.0.0.1:9090",    // your gRPC server address.
		grpc.WithInsecure(), // The Cosmos SDK doesn't support any transport security mechanism.
		// This instantiates a general gRPC codec which handles proto bytes. We pass in a nil interface registry
		// if the request/response types contain interface instead of 'nil' you should pass the application specific codec.
		grpc.WithDefaultCallOptions(grpc.ForceCodec(codec.NewProtoCodec(nil).GRPCCodec())),
	)
	if err != nil {
		return err
	}
	defer grpcConn.Close()

	// This creates a gRPC client to query the x/bank service.
	bankClient := banktypes.NewQueryClient(grpcConn)

	var header metadata.MD
	_, err = bankClient.Balance(
		metadata.AppendToOutgoingContext(context.Background(), grpctypes.GRPCBlockHeightHeader, "12"), // Add metadata to request
		&banktypes.QueryBalanceRequest{Address: myAddress.String(), Denom: "stake"},
		grpc.Header(&header), // Retrieve header from response
	)
	if err != nil {
		return err
	}
	blockHeight := header.Get(grpctypes.GRPCBlockHeightHeader)

	fmt.Println(blockHeight) // Prints the block height (12)

	return nil
}

func main() {
    if err := queryState(); err != nil {
        panic(err)
    }
}
```

### CosmJS

CosmJS documentation can be found at [https://cosmos.github.io/cosmjs](https://cosmos.github.io/cosmjs). As of January 2021, CosmJS documentation is still work in progress.

## Using the REST Endpoints

As described in the [gRPC guide](../../develop/advanced-concepts/09-grpc_rest.md), all gRPC services on the Cosmos SDK are made available for more convenient REST-based queries through gRPC-gateway. The format of the URL path is based on the Protobuf service method's full-qualified name, but may contain small customizations so that final URLs look more idiomatic. For example, the REST endpoint for the `cosmos.bank.v1beta1.Query/AllBalances` method is `GET /cosmos/bank/v1beta1/balances/{address}`. Request arguments are passed as query parameters.

Note that the REST endpoints are not enabled by default. To enable them, edit the `api` section of your  `~/.simapp/config/app.toml` file:

```toml
# Enable defines if the API server should be enabled.
enable = true
```

As a concrete example, the `curl` command to make balances request is:

```bash
curl \
    -X GET \
    -H "Content-Type: application/json" \
    http://localhost:1317/cosmos/bank/v1beta1/balances/$MY_VALIDATOR_ADDRESS
```

Make sure to replace `localhost:1317` with the REST endpoint of your node, configured under the `api.address` field.

The list of all available REST endpoints is available as a Swagger specification file, it can be viewed at `localhost:1317/swagger`. Make sure that the `api.swagger` field is set to true in your [`app.toml`](01-run-node.md#configuring-the-node-using-apptoml) file.

### Query for historical state using REST

Querying for historical state is done using the HTTP header `x-cosmos-block-height`. For example, a curl command would look like:

```bash
curl \
    -X GET \
    -H "Content-Type: application/json" \
    -H "x-cosmos-block-height: 123" \
    http://localhost:1317/cosmos/bank/v1beta1/balances/$MY_VALIDATOR_ADDRESS
```

Assuming the state at that block has not yet been pruned by the node, this query should return a non-empty response.

### Cross-Origin Resource Sharing (CORS)

[CORS policies](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) are not enabled by default to help with security. If you would like to use the rest-server in a public environment we recommend you provide a reverse proxy, this can be done with [nginx](https://www.nginx.com/). For testing and development purposes there is an `enabled-unsafe-cors` field inside [`app.toml`](01-run-node.md#configuring-the-node-using-apptoml).
