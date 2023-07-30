# ADR 035: Rosetta API 支持

## 作者

* Jonathan Gimeno (@jgimeno)
* David Grierson (@senormonito)
* Alessio Treglia (@alessio)
* Frojdy Dymylja (@fdymylja)

## 变更日志

* 2021-05-12: 外部库 [cosmos-rosetta-gateway](https://github.com/tendermint/cosmos-rosetta-gateway) 已经移动到 Cosmos SDK 中。

## 背景

[Rosetta API](https://www.rosetta-api.org/) 是由 Coinbase 开发的开源规范和一套工具，用于标准化区块链交互。

通过使用标准的 API 来集成区块链应用，将会：

* 让用户更容易与给定的区块链进行交互
* 允许交易所快速、轻松地集成新的区块链
* 让应用开发者以更低的成本和努力构建跨区块链的应用，如区块浏览器、钱包和 dApp。

## 决策

很明显，将 Rosetta API 支持添加到 Cosmos SDK 中将为所有开发者和基于 Cosmos SDK 的链带来价值。如何实现是关键。

该设计提议的驱动原则是：

1. **可扩展性：** 应用开发者设置网络配置以公开符合 Rosetta API 的服务应尽可能无风险和无痛苦。
2. **长期支持：** 该提议旨在为所有支持的 Cosmos SDK 发布系列提供支持。
3. **成本效益：** 从 `master` 分支将 Rosetta API 规范的更改回溯到 Cosmos SDK 的各个稳定分支是一项需要降低成本的工作。

我们将通过以下方式实现这些原则：

1. 将有一个名为 `rosetta/lib` 的包，用于实现核心的 Rosetta API 功能，特别是：
   a. 类型和接口（`Client`、`OfflineClient`...），这将设计与实现细节分离。
   b. `Server` 功能，因为它与 Cosmos SDK 版本无关。
   c. `Online/OfflineNetwork`，它不会被导出，并使用 `Client` 接口来查询节点、构建交易等来实现 Rosetta API。
   d. `errors` 包，用于扩展 Rosetta 错误。
2. 由于 Cosmos 发布系列之间存在差异，每个系列将有自己特定的 `Client` 接口实现。
3. 在应用程序中启动 API 服务将有两个选项：
   a. API 共享应用程序进程
   b. API 专用进程。

## 架构

### 外部仓库

本节将描述所提议的外部库，包括服务实现以及定义的类型和接口。

#### 服务器

`Server` 是一个简单的 `struct`，它启动并监听在设置中指定的端口。这旨在在所有活跃支持的 Cosmos SDK 版本中使用。

构造函数如下：

`func NewServer(settings Settings) (Server, error)`

用于构造新服务器的 `Settings` 如下：

```go
// Settings define the rosetta server settings
type Settings struct {
	// Network contains the information regarding the network
	Network *types.NetworkIdentifier
	// Client is the online API handler
	Client crgtypes.Client
	// Listen is the address the handler will listen at
	Listen string
	// Offline defines if the rosetta service should be exposed in offline mode
	Offline bool
	// Retries is the number of readiness checks that will be attempted when instantiating the handler
	// valid only for online API
	Retries int
	// RetryWait is the time that will be waited between retries
	RetryWait time.Duration
}
```

#### 类型

类型包使用了 Rosetta 类型和自定义定义的类型包装器的混合，客户端在执行操作时必须解析并返回这些类型。

##### 接口

每个 SDK 版本使用不同的格式进行连接（rpc、gRPC 等）、查询和构建交易，我们在 `Client` 接口中对此进行了抽象。
客户端使用 Rosetta 类型，而 `Online/OfflineNetwork` 负责返回正确解析的 Rosetta 响应和错误。

每个 Cosmos SDK 发布系列都将有自己的 `Client` 实现。
开发人员可以根据需要实现自己的自定义 `Client`。

```go
// Client defines the API the client implementation should provide.
type Client interface {
	// Needed if the client needs to perform some action before connecting.
	Bootstrap() error
	// Ready checks if the servicer constraints for queries are satisfied
	// for example the node might still not be ready, it's useful in process
	// when the rosetta instance might come up before the node itself
	// the servicer must return nil if the node is ready
	Ready() error

	// Data API

	// Balances fetches the balance of the given address
	// if height is not nil, then the balance will be displayed
	// at the provided height, otherwise last block balance will be returned
	Balances(ctx context.Context, addr string, height *int64) ([]*types.Amount, error)
	// BlockByHashAlt gets a block and its transaction at the provided height
	BlockByHash(ctx context.Context, hash string) (BlockResponse, error)
	// BlockByHeightAlt gets a block given its height, if height is nil then last block is returned
	BlockByHeight(ctx context.Context, height *int64) (BlockResponse, error)
	// BlockTransactionsByHash gets the block, parent block and transactions
	// given the block hash.
	BlockTransactionsByHash(ctx context.Context, hash string) (BlockTransactionsResponse, error)
	// BlockTransactionsByHash gets the block, parent block and transactions
	// given the block hash.
	BlockTransactionsByHeight(ctx context.Context, height *int64) (BlockTransactionsResponse, error)
	// GetTx gets a transaction given its hash
	GetTx(ctx context.Context, hash string) (*types.Transaction, error)
	// GetUnconfirmedTx gets an unconfirmed Tx given its hash
	// NOTE(fdymylja): NOT IMPLEMENTED YET!
	GetUnconfirmedTx(ctx context.Context, hash string) (*types.Transaction, error)
	// Mempool returns the list of the current non confirmed transactions
	Mempool(ctx context.Context) ([]*types.TransactionIdentifier, error)
	// Peers gets the peers currently connected to the node
	Peers(ctx context.Context) ([]*types.Peer, error)
	// Status returns the node status, such as sync data, version etc
	Status(ctx context.Context) (*types.SyncStatus, error)

	// Construction API

	// PostTx posts txBytes to the node and returns the transaction identifier plus metadata related
	// to the transaction itself.
	PostTx(txBytes []byte) (res *types.TransactionIdentifier, meta map[string]interface{}, err error)
	// ConstructionMetadataFromOptions
	ConstructionMetadataFromOptions(ctx context.Context, options map[string]interface{}) (meta map[string]interface{}, err error)
	OfflineClient
}

// OfflineClient defines the functionalities supported without having access to the node
type OfflineClient interface {
	NetworkInformationProvider
	// SignedTx returns the signed transaction given the tx bytes (msgs) plus the signatures
	SignedTx(ctx context.Context, txBytes []byte, sigs []*types.Signature) (signedTxBytes []byte, err error)
	// TxOperationsAndSignersAccountIdentifiers returns the operations related to a transaction and the account
	// identifiers if the transaction is signed
	TxOperationsAndSignersAccountIdentifiers(signed bool, hexBytes []byte) (ops []*types.Operation, signers []*types.AccountIdentifier, err error)
	// ConstructionPayload returns the construction payload given the request
	ConstructionPayload(ctx context.Context, req *types.ConstructionPayloadsRequest) (resp *types.ConstructionPayloadsResponse, err error)
	// PreprocessOperationsToOptions returns the options given the preprocess operations
	PreprocessOperationsToOptions(ctx context.Context, req *types.ConstructionPreprocessRequest) (options map[string]interface{}, err error)
	// AccountIdentifierFromPublicKey returns the account identifier given the public key
	AccountIdentifierFromPublicKey(pubKey *types.PublicKey) (*types.AccountIdentifier, error)
}
```

### 2. Cosmos SDK 实现

基于版本的 Cosmos SDK 实现负责满足 `Client` 接口。
在 Stargate、Launchpad 和 0.37 版本中，我们引入了 rosetta.Msg 的概念，该消息不在共享仓库中，因为 sdk.Msg 类型在 Cosmos SDK 版本之间有所不同。

rosetta.Msg 接口如下：

```go
// Msg represents a cosmos-sdk message that can be converted from and to a rosetta operation.
type Msg interface {
	sdk.Msg
	ToOperations(withStatus, hasError bool) []*types.Operation
	FromOperations(ops []*types.Operation) (sdk.Msg, error)
}
```

因此，希望扩展 rosetta 支持的操作集的开发人员只需使用 `ToOperations` 和 `FromOperations` 方法扩展其模块的 sdk.Msgs。

### 3. API 服务调用

如前所述，应用程序开发人员将有两种调用 Rosetta API 服务的方法：

1. 应用程序和 API 共享进程
2. 独立的 API 服务

#### 共享进程（仅限 Stargate）

Rosetta API 服务可以在与应用程序相同的执行进程中运行。这可以通过 app.toml 设置启用，如果未启用 gRPC，则 rosetta 实例将以离线模式运行（仅具备构建交易的能力）。

#### 分离的API服务

客户端应用程序开发人员还可以编写一个新的命令，作为一个独立的进程启动Rosetta API服务器，使用位于`/server/rosetta`包中的rosetta命令。命令的构建取决于Cosmos SDK的版本。示例可以在stargate的`simd`中找到，其他发布系列可以在`contrib/rosetta/simapp`中找到。

## 状态

建议中

## 影响

### 积极的

* Cosmos SDK内置的Rosetta API支持。
* 区块链接口标准化

## 参考

* https://www.rosetta-api.org/


# ADR 035: Rosetta API Support

## Authors

* Jonathan Gimeno (@jgimeno)
* David Grierson (@senormonito)
* Alessio Treglia (@alessio)
* Frojdy Dymylja (@fdymylja)

## Changelog

* 2021-05-12: the external library  [cosmos-rosetta-gateway](https://github.com/tendermint/cosmos-rosetta-gateway) has been moved within the Cosmos SDK.

## Context

[Rosetta API](https://www.rosetta-api.org/) is an open-source specification and set of tools developed by Coinbase to
standardise blockchain interactions.

Through the use of a standard API for integrating blockchain applications it will

* Be easier for a user to interact with a given blockchain
* Allow exchanges to integrate new blockchains quickly and easily
* Enable application developers to build cross-blockchain applications such as block explorers, wallets and dApps at
  considerably lower cost and effort.

## Decision

It is clear that adding Rosetta API support to the Cosmos SDK will bring value to all the developers and
Cosmos SDK based chains in the ecosystem. How it is implemented is key.

The driving principles of the proposed design are:

1. **Extensibility:** it must be as riskless and painless as possible for application developers to set-up network
   configurations to expose Rosetta API-compliant services.
2. **Long term support:** This proposal aims to provide support for all the supported Cosmos SDK release series.
3. **Cost-efficiency:** Backporting changes to Rosetta API specifications from `master` to the various stable
   branches of Cosmos SDK is a cost that needs to be reduced.

We will achieve these delivering on these principles by the following:

1. There will be a package `rosetta/lib`
   for the implementation of the core Rosetta API features, particularly:
   a. The types and interfaces (`Client`, `OfflineClient`...), this separates design from implementation detail.
   b. The `Server` functionality as this is independent of the Cosmos SDK version.
   c. The `Online/OfflineNetwork`, which is not exported, and implements the rosetta API using the `Client` interface to query the node, build tx and so on.
   d. The `errors` package to extend rosetta errors.
2. Due to differences between the Cosmos release series, each series will have its own specific implementation of `Client` interface.
3. There will be two options for starting an API service in applications:
   a. API shares the application process
   b. API-specific process.

## Architecture

### The External Repo

As section will describe the proposed external library, including the service implementation, plus the defined types and interfaces.

#### Server

`Server` is a simple `struct` that is started and listens to the port specified in the settings. This is meant to be used across all the Cosmos SDK versions that are actively supported.

The constructor follows:

`func NewServer(settings Settings) (Server, error)`

`Settings`, which are used to construct a new server, are the following:

```go
// Settings define the rosetta server settings
type Settings struct {
	// Network contains the information regarding the network
	Network *types.NetworkIdentifier
	// Client is the online API handler
	Client crgtypes.Client
	// Listen is the address the handler will listen at
	Listen string
	// Offline defines if the rosetta service should be exposed in offline mode
	Offline bool
	// Retries is the number of readiness checks that will be attempted when instantiating the handler
	// valid only for online API
	Retries int
	// RetryWait is the time that will be waited between retries
	RetryWait time.Duration
}
```

#### Types

Package types uses a mixture of rosetta types and custom defined type wrappers, that the client must parse and return while executing operations.

##### Interfaces

Every SDK version uses a different format to connect (rpc, gRPC, etc), query and build transactions, we have abstracted this in what is the `Client` interface.
The client uses rosetta types, whilst the `Online/OfflineNetwork` takes care of returning correctly parsed rosetta responses and errors.

Each Cosmos SDK release series will have their own `Client` implementations.
Developers can implement their own custom `Client`s as required.

```go
// Client defines the API the client implementation should provide.
type Client interface {
	// Needed if the client needs to perform some action before connecting.
	Bootstrap() error
	// Ready checks if the servicer constraints for queries are satisfied
	// for example the node might still not be ready, it's useful in process
	// when the rosetta instance might come up before the node itself
	// the servicer must return nil if the node is ready
	Ready() error

	// Data API

	// Balances fetches the balance of the given address
	// if height is not nil, then the balance will be displayed
	// at the provided height, otherwise last block balance will be returned
	Balances(ctx context.Context, addr string, height *int64) ([]*types.Amount, error)
	// BlockByHashAlt gets a block and its transaction at the provided height
	BlockByHash(ctx context.Context, hash string) (BlockResponse, error)
	// BlockByHeightAlt gets a block given its height, if height is nil then last block is returned
	BlockByHeight(ctx context.Context, height *int64) (BlockResponse, error)
	// BlockTransactionsByHash gets the block, parent block and transactions
	// given the block hash.
	BlockTransactionsByHash(ctx context.Context, hash string) (BlockTransactionsResponse, error)
	// BlockTransactionsByHash gets the block, parent block and transactions
	// given the block hash.
	BlockTransactionsByHeight(ctx context.Context, height *int64) (BlockTransactionsResponse, error)
	// GetTx gets a transaction given its hash
	GetTx(ctx context.Context, hash string) (*types.Transaction, error)
	// GetUnconfirmedTx gets an unconfirmed Tx given its hash
	// NOTE(fdymylja): NOT IMPLEMENTED YET!
	GetUnconfirmedTx(ctx context.Context, hash string) (*types.Transaction, error)
	// Mempool returns the list of the current non confirmed transactions
	Mempool(ctx context.Context) ([]*types.TransactionIdentifier, error)
	// Peers gets the peers currently connected to the node
	Peers(ctx context.Context) ([]*types.Peer, error)
	// Status returns the node status, such as sync data, version etc
	Status(ctx context.Context) (*types.SyncStatus, error)

	// Construction API

	// PostTx posts txBytes to the node and returns the transaction identifier plus metadata related
	// to the transaction itself.
	PostTx(txBytes []byte) (res *types.TransactionIdentifier, meta map[string]interface{}, err error)
	// ConstructionMetadataFromOptions
	ConstructionMetadataFromOptions(ctx context.Context, options map[string]interface{}) (meta map[string]interface{}, err error)
	OfflineClient
}

// OfflineClient defines the functionalities supported without having access to the node
type OfflineClient interface {
	NetworkInformationProvider
	// SignedTx returns the signed transaction given the tx bytes (msgs) plus the signatures
	SignedTx(ctx context.Context, txBytes []byte, sigs []*types.Signature) (signedTxBytes []byte, err error)
	// TxOperationsAndSignersAccountIdentifiers returns the operations related to a transaction and the account
	// identifiers if the transaction is signed
	TxOperationsAndSignersAccountIdentifiers(signed bool, hexBytes []byte) (ops []*types.Operation, signers []*types.AccountIdentifier, err error)
	// ConstructionPayload returns the construction payload given the request
	ConstructionPayload(ctx context.Context, req *types.ConstructionPayloadsRequest) (resp *types.ConstructionPayloadsResponse, err error)
	// PreprocessOperationsToOptions returns the options given the preprocess operations
	PreprocessOperationsToOptions(ctx context.Context, req *types.ConstructionPreprocessRequest) (options map[string]interface{}, err error)
	// AccountIdentifierFromPublicKey returns the account identifier given the public key
	AccountIdentifierFromPublicKey(pubKey *types.PublicKey) (*types.AccountIdentifier, error)
}
```

### 2. Cosmos SDK Implementation

The Cosmos SDK implementation, based on version, takes care of satisfying the `Client` interface.
In Stargate, Launchpad and 0.37, we have introduced the concept of rosetta.Msg, this message is not in the shared repository as the sdk.Msg type differs between Cosmos SDK versions.

The rosetta.Msg interface follows:

```go
// Msg represents a cosmos-sdk message that can be converted from and to a rosetta operation.
type Msg interface {
	sdk.Msg
	ToOperations(withStatus, hasError bool) []*types.Operation
	FromOperations(ops []*types.Operation) (sdk.Msg, error)
}
```

Hence developers who want to extend the rosetta set of supported operations just need to extend their module's sdk.Msgs with the `ToOperations` and `FromOperations` methods.

### 3. API service invocation

As stated at the start, application developers will have two methods for invocation of the Rosetta API service:

1. Shared process for both application and API
2. Standalone API service

#### Shared Process (Only Stargate)

Rosetta API service could run within the same execution process as the application. This would be enabled via app.toml settings, and if gRPC is not enabled the rosetta instance would be spinned in offline mode (tx building capabilities only).

#### Separate API service

Client application developers can write a new command to launch a Rosetta API server as a separate process too, using the rosetta command contained in the `/server/rosetta` package. Construction of the command depends on Cosmos SDK version. Examples can be found inside `simd` for stargate, and `contrib/rosetta/simapp` for other release series.

## Status

Proposed

## Consequences

### Positive

* Out-of-the-box Rosetta API support within Cosmos SDK.
* Blockchain interface standardisation

## References

* https://www.rosetta-api.org/
