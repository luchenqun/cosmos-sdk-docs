# 升级 Cosmos SDK

本指南提供了升级到特定版本的 Cosmos SDK 的说明。
请注意，始终阅读 **SimApp** 部分以获取有关应用程序连接更新的更多信息。

## [未发布]

### 迁移到 CometBFT（第二部分）

Cosmos SDK 在其之前的版本中已迁移到 CometBFT。
一些函数已被重命名以反映命名更改。

以下是详尽的列表：

* `client.TendermintRPC` -> `client.CometRPC`
* `clitestutil.MockTendermintRPC` -> `clitestutil.MockCometRPC`
* `clitestutilgenutil.CreateDefaultTendermintConfig` -> `clitestutilgenutil.CreateDefaultCometConfig`
* 包 `client/grpc/tmservice` -> `client/grpc/cmtservice`

此外，提到 `tendermint` 的命令和标志已被重命名为 `comet`。
然而，这些命令和标志仍然支持向后兼容。

为了向后兼容，`**/tendermint/**` gRPC 服务仍然受支持。

此外，SDK 正在通过代码库从 CometBFT Go 类型开始抽象化：

* CometBFT 的使用已被替换为使用 Cosmos SDK 日志记录器接口（`cosmossdk.io/log.Logger`）。
* `github.com/cometbft/cometbft/libs/bytes.HexByte` 的使用已被 `[]byte` 替换。

### 配置

已创建了一个新工具来迁移 SDK 的配置。使用以下命令来迁移您的配置：

```bash
simd config migrate v0.48
```

有关 [confix](https://docs.cosmos.network/main/tooling/confix) 的更多信息。

#### 事件

在成功执行消息的情况下，abci.TxResult 的日志部分不会填充。相反，所有消息都添加了一个新属性，指示 `msg_index`，该属性标识哪些事件和属性与同一事务相关联。

#### gRPC-Web

gRPC-Web 现在监听与 gRPC Gateway API 服务器相同的地址（默认为 `localhost:1317`）。
已删除监听不同地址的可能性，以及其设置。
使用 `confix` 清理您的 `app.toml`。可以设置一个 nginx（或类似的）反向代理来保持先前的行为。

#### 数据库支持

ClevelDB、BoltDB和BadgerDB不再受支持。要从不受支持的数据库迁移到受支持的数据库，请使用数据库迁移工具。

### Protobuf

SDK正在删除所有`gogoproto`注释。

#### Stringer

`gogoproto.goproto_stringer = false`注释已从大多数proto文件中删除。这意味着对于以前具有此注释的类型，将生成`String()`方法。生成的`String()`方法使用`proto.CompactTextString`来将结构体转换为字符串。
[验证](https://github.com/cosmos/cosmos-sdk/pull/13850#issuecomment-1328889651)修改后的`String()`方法的使用情况，并仔细检查它们是否在状态机代码中使用。

### SimApp

<!-- TODO(@julienrbrt)将此部分分为3个部分，一般部分、应用程序v1和应用程序v2的更改，现在有点混乱 -->

#### 模块断言

以前，所有模块都需要在`app.go` / `app_config.go`的`OrderBeginBlockers`、`OrderEndBlockers`和`OrderInitGenesis / OrderExportGenesis`中设置。
现在不再需要这样，断言已经放宽，只需要模块分别实现`module.BeginBlockAppModule`、`module.EndBlockAppModule`和`module.HasGenesis`接口。

#### 模块保管者

以下模块的`NewKeeper`函数现在接受`KVStoreService`而不是`StoreKey`：

* `x/auth`
* `x/authz`
* `x/bank`
* `x/consensus`
* `x/distribution`
* `x/feegrant`
* `x/nft`

用户在手动连接链时需要使用`runtime.NewKVStoreService`方法从`StoreKey`创建`KVStoreService`：

```diff
app.ConsensusParamsKeeper = consensusparamkeeper.NewKeeper(
  appCodec,
- keys[consensusparamtypes.StoreKey]
+ runtime.NewKVStoreService(keys[consensusparamtypes.StoreKey]),
  authtypes.NewModuleAddress(govtypes.ModuleName).String(),
)
```

以下模块的`Keeper`方法现在接受`context.Context`而不是`sdk.Context`。如果需要，任何具有这些接口的模块（如“预期保管者”）都需要更新和重新生成模拟对象：

* `x/authz`
* `x/bank`
* `x/distribution`

**使用depinject的用户不需要进行任何更改，这将自动完成。**

#### 日志记录器

以下模块的`NewKeeper`函数现在接受`log.Logger`：

* `x/bank`

现在，`depinject` 用户必须通过主要的 `depinject.Supply` 函数提供日志记录器，而不是将其传递给 `appBuilder.Build`。

```diff
appConfig = depinject.Configs(
	AppConfig,
	depinject.Supply(
		// supply the application options
		appOpts,
+		logger,
	...
```

```diff
- app.App = appBuilder.Build(logger, db, traceStore, baseAppOptions...)
+ app.App = appBuilder.Build(db, traceStore, baseAppOptions...)
```

手动连接他们的链时，需要在创建 keeper 时添加日志记录器参数。

#### 模块基础知识

以前，`ModuleBasics` 是一个全局变量，用于注册所有模块的 `AppModuleBasic` 实现。
全局变量已被移除，基础模块管理器现在可以从模块管理器中创建。

对于 `depinject` 用户，这是自动完成的，但是对于提供不同的应用程序模块实现，可以通过在主 `AppConfig` (`app_config.go`) 中通过 `depinject.Supply` 传递它们：

```go
depinject.Supply(
			// supply custom module basics
			map[string]module.AppModuleBasic{
				genutiltypes.ModuleName: genutil.NewAppModuleBasic(genutiltypes.DefaultMessageValidator),
				govtypes.ModuleName: gov.NewAppModuleBasic(
					[]govclient.ProposalHandler{
						paramsclient.ProposalHandler,
					},
				),
			},
		)
```

手动连接他们的链时，需要在模块管理器创建后使用新的 `module.NewBasicManagerFromManager` 函数，并传递一个 `map[string]module.AppModuleBasic` 作为参数，以可选地覆盖某些模块的 `AppModuleBasic`。

### 包

#### 存储

对于包含存储类型别名的 `types/store.go` 的引用已被重新映射到适当的 `store/types`，因此不再需要 `types/store.go` 文件，并已被删除。

##### 将存储提取为独立模块

`store` 模块已被提取为具有单独的 go.mod 文件的独立模块。
现在，所有存储导入都已重命名为使用 `cosmossdk.io/store` 而不是 `github.com/cosmos/cosmos-sdk/store`。

#### 客户端

接口方法 `TxConfig.SignModeHandler()` 的返回类型已从 `x/auth/signing.SignModeHandler` 更改为 `x/tx/signing.HandlerMap`。对于大多数用户来说，这个更改是透明的，因为 `TxConfig` 接口通常由私有的 `x/auth/tx.config` 结构实现（由 `auth.NewTxConfig` 返回），该结构已更新为返回新类型。如果用户已经实现了自己的 `TxConfig` 接口，则需要更新其实现以返回新类型。

### 模块

#### `**all**`

[RFC 001](https://docs.cosmos.network/main/rfc/rfc-001-tx-validation) 定义了模块消息验证过程的简化。`sdk.Msg` 接口已更新，不再需要实现 `ValidateBasic` 方法。现在建议在消息服务器中直接验证消息。当在消息服务器中执行验证时，消息上的 `ValidateBasic` 方法不再需要，并且可以删除。

#### `x/auth`

对于通过 `ante.NewAnteHandler` 进行 ante 处理程序构建，字段 `ante.HandlerOptions.SignModeHandler` 已从 `x/auth/signing/SignModeHandler` 更新为 `x/tx/signing/HandlerMap`。调用者通常从 `client.TxConfig.SignModeHandler()`（也已更改）中获取此值，因此此更改对大多数用户来说应该是透明的。

#### `x/capability`

Capability 已移至 [IBC-GO](https://github.com/cosmos/ibc-go)。IBC V8 将包含必要的更改以合并新的模块位置。

#### `x/gov`

##### 加速提案

`gov` v1 模块已更新，支持加速治理提案的能力。当提案被加速时，投票期将缩短为 `ExpeditedVotingPeriod` 参数。加速提案的投票门槛必须高于经典提案，该门槛由 `ExpeditedThreshold` 参数定义。

##### 取消提案

`gov` 模块已更新，支持取消治理提案的能力。当提案被取消时，提案的所有存款将被烧毁或发送到 `ProposalCancelDest` 地址。存款的烧毁比例将由一个名为 `ProposalCancelRatio` 的新参数确定。

```text
	1. deposits * proposal_cancel_ratio 将被烧毁或发送到 `ProposalCancelDest` 地址，如果 `ProposalCancelDest` 为空，则存款将被烧毁。
	2. deposits * (1 - proposal_cancel_ratio) 将发送给存款人。
```

默认情况下，在迁移期间，新的 `ProposalCancelRatio` 参数设置为 0.5，`ProposalCancelDest` 设置为空字符串（即烧毁）。

#### `x/evidence`

##### 提取证据到独立模块

`x/evidence` 模块被提取为一个独立的 go.mod 文件，使其成为一个独立的模块。
现在，所有的证据导入都被重命名为 `cosmossdk.io/x/evidence`，而不是 SDK 中的 `github.com/cosmos/cosmos-sdk/x/evidence`。

#### `x/nft`

##### 提取 NFT 到独立模块

`x/nft` 模块被提取为一个独立的 go.mod 文件，使其成为一个独立的模块。

#### `x/feegrant`

##### 提取 FeeGrant 到独立模块

`x/feegrant` 模块被提取为一个独立的 go.mod 文件，使其成为一个独立的模块。
现在，所有的 FeeGrant 导入都被重命名为 `cosmossdk.io/x/feegrant`，而不是 SDK 中的 `github.com/cosmos/cosmos-sdk/x/feegrant`。

#### `x/upgrade`

##### 提取 Upgrade 到独立模块

`x/upgrade` 模块被提取为一个独立的 go.mod 文件，使其成为一个独立的模块。
现在，所有的 Upgrade 导入都被重命名为 `cosmossdk.io/x/upgrade`，而不是 SDK 中的 `github.com/cosmos/cosmos-sdk/x/upgrade`。

## [v0.47.x](https://github.com/cosmos/cosmos-sdk/releases/tag/v0.47.0)

### 迁移到 CometBFT（第一部分）

Cosmos SDK 已经迁移到 CometBFT 作为其默认的共识引擎。
CometBFT 是 Tendermint 共识算法的实现，也是 Tendermint Core 的继任者。
由于导入的更改，这是一个破坏性的变更。链需要**完全**从其代码库中删除对 Tendermint Core 的导入，包括直接和间接导入在其 `go.mod` 中。

* 将 `github.com/tendermint/tendermint` 替换为 `github.com/cometbft/cometbft`
* 将 `github.com/tendermint/tm-db` 替换为 `github.com/cometbft/cometbft-db`
* 验证 `github.com/tendermint/tendermint` 不是间接或直接依赖项
* 运行 `make proto-gen`

除此之外，迁移应该是无缝的。
在 SDK 方面，变量和函数的清理以反映新名称将仅在 v0.48（第二部分）中进行。

注意：在执行这些步骤之前，可能需要先由您的依赖项执行这些步骤。

### 模拟

从 `AppModuleSimulation` 接口中移除 `RandomizedParams`。之前，它用于在模拟过程中生成随机的参数更改，但是现在通过 ParamChangeProposal 来实现，已经过时了。由于所有模块都已迁移，我们现在可以安全地从 `AppModuleSimulation` 接口中移除它。

此外，为了支持每个模块的 `MsgUpdateParams` 治理提案，`AppModuleSimulation` 现在除了 `AppModule.ProposalContents` 方法外，还定义了一个 `AppModule.ProposalMsgs` 方法。该方法定义了可以用于提交提案的消息，并且应该在模拟中进行测试。

当一个模块没有提案消息或提案内容需要通过模拟进行测试时，可以删除 `AppModule.ProposalMsgs` 和 `AppModule.ProposalContents` 方法。

### gRPC

引入了一个新的 gRPC 服务 `proto/cosmos/base/node/v1beta1/query.proto`，它公开了各种运营商配置。应用程序开发者应该确保通过在应用程序构建中的 `nodeservice.RegisterGRPCGatewayRoutes` 注册服务到 gRPC-gateway 服务中，通常可以在 `RegisterAPIRoutes` 中找到。

### AppModule 接口

`AppModule` 的 `Querier`、`Route` 和 `LegacyQuerier` 方法的支持已经完全从 `AppModule` 接口中移除。这将移除并完全废弃所有旧的查询器。所有模块不再支持之前被称为 LCD 的 REST API，`sdk.Msg#Route` 方法也不再使用。

大多数其他现有的 `AppModule` 方法已经移动到扩展接口中，为下一个版本中迁移到 `cosmossdk.io/core/appmodule` API 做准备。大多数 `AppModule` 的实现不应该受到此更改的影响。

### SimApp

**不应该在您自己的应用程序中导入** `simapp` 包。相反，您应该导入定义了 `App` 的 `runtime.AppI` 接口，并使用 [`simtestutil` 包](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/testutil/sims) 进行应用程序测试。

#### 应用程序连接

SimApp的`app_v2.go`使用了Cosmos SDK的依赖注入框架[App Wiring](https://docs.cosmos.network/main/building-apps/app-go-v2)。
这意味着模块直接注入到SimApp中，通过一个[配置文件](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_config.go)实现。
之前的行为，即没有依赖注入框架的行为，仍然存在于[`app.go`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go)，并且不会消失。

如果您正在使用没有依赖注入的`app.go`，请在您的`app.go`中添加以下行以提供更新的gRPC服务：

```go
autocliv1.RegisterQueryServer(app.GRPCQueryRouter(), runtimeservices.NewAutoCLIQueryService(app.ModuleManager.Modules))

reflectionSvc, err := runtimeservices.NewReflectionService()
if err != nil {
    panic(err)
}
reflectionv1.RegisterReflectionServiceServer(app.GRPCQueryRouter(), reflectionSvc)
```

#### 构造函数

构造函数`NewSimApp`已经简化：

* `NewSimApp`不再接受编码参数(`encodingConfig`)作为输入，而是通过注入编码参数(使用app wiring)或直接在构造函数中创建。我们可以实例化`SimApp`以获取编码配置。
* `NewSimApp`现在使用`AppOptions`来获取主目录路径(`homePath`)和不变性检查周期(`invCheckPeriod`)。这些参数作为参数给出是不必要的，因为它们已经存在于`AppOptions`中。

#### 编码

`simapp.MakeTestEncodingConfig()`已被弃用并已被移除。相反，您可以使用`types/module/testutil`包中的`TestEncodingConfig`。
这意味着您可以在测试中将`simapp.MakeTestEncodingConfig`的使用替换为`moduletestutil.MakeTestEncodingConfig`，它以一系列相关的`AppModuleBasic`作为输入(被测试的模块和任何潜在的依赖项)。

#### 导出

`ExportAppStateAndValidators`接受一个额外的参数`modulesToExport`，它是要导出的模块名称列表。
该参数应该传递给模块管理器的`ExportGenesisFromModules`方法。

#### 替换

应用程序中的`GoLevelDB`版本必须固定为`v1.0.1-0.20210819022825-2ae1ddf74ef7`，其他版本可能会导致意外行为。
可以通过将`replace github.com/syndtr/goleveldb => github.com/syndtr/goleveldb v1.0.1-0.20210819022825-2ae1ddf74ef7`添加到`go.mod`文件中来实现。

* [cosmos-sdk上的问题＃14949](https://github.com/cosmos/cosmos-sdk/issues/14949)
* [go-ethereum上的问题＃25413](https://github.com/ethereum/go-ethereum/pull/25413)

### Protobuf

SDK已从`gogo/protobuf`（目前未维护）迁移到我们自己维护的分支[`cosmos/gogoproto`](https://github.com/cosmos/gogoproto)。

这意味着您应该将所有对`github.com/gogo/protobuf`的导入替换为`github.com/cosmos/gogoproto`。
这允许您从`go.mod`文件中删除替换指令`replace github.com/gogo/protobuf => github.com/regen-network/protobuf v1.3.3-alpha.regen.1`。

请使用`ghcr.io/cosmos/proto-builder`镜像（版本>= `0.11.5`）生成protobuf文件。

在您的`buf.yaml`文件中查看要固定在`cosmos/cosmos-sdk`中的buf提交[此处](../tooling)。

#### Gogoproto导入路径

SDK对其gogoproto存储库进行了[补丁修复](https://github.com/cosmos/gogoproto/pull/32)，要求每个proto文件的包名与其OS导入路径匹配（相对于protobuf根导入路径，通常是根`proto/`文件夹，由`protoc -I`标志设置）。

例如，假设您将所有proto文件放在根`proto/`文件夹内的子文件夹中，那么包名为`myapp.mymodule.v1`的proto文件应该在`proto/myapp/mymodule/v1/`文件夹中找到。如果它在另一个文件夹中，proto生成命令将抛出错误。

如果您正在为proto文件使用自定义文件夹结构，请重新组织它们，以使其OS路径与其proto包名匹配。

这样可以正确注册proto FileDescriptSets，并且此标准化的OS导入路径允许[Hubl](https://github.com/cosmos/cosmos-sdk/tree/main/tools/hubl)与任何链进行反射式通信。

#### `{accepts,implements}_interface` proto注释

SDK正在规范化Protobuf `accepts_interface`和`implements_interface`注释中的字符串。我们要求它们是完全作用域的名称。它们很快将被代码生成器（如Pulsar和Telescope）使用，以匹配哪些消息可以或不可以打包在`Any`中。

以下是您需要在proto文件中执行的替换操作：

```diff
- "Content"
+ "cosmos.gov.v1beta1.Content"
- "Authorization"
+ "cosmos.authz.v1beta1.Authorization"
- "sdk.Msg"
+ "cosmos.base.v1beta1.Msg"
- "AccountI"
+ "cosmos.auth.v1beta1.AccountI"
- "ModuleAccountI"
+ "cosmos.auth.v1beta1.ModuleAccountI"
- "FeeAllowanceI"
+ "cosmos.feegrant.v1beta1.FeeAllowanceI"
```

请确保在您自己的应用程序的proto文件中，没有为这两个proto注释使用单词名称。如果有，请将它们替换为完全限定名称，即使这些名称实际上并不解析为实际的protobuf实体。

有关更多信息，请参阅[编码指南](../../develop/advanced-concepts/06-encoding.md)。

### 交易

#### 广播模式

广播模式`block`已被弃用并已删除。请改用`sync`模式。在将测试从`block`升级到`sync`并检查事务代码时，您需要首先查询事务（使用其哈希）以获取正确的代码。

### 模块

#### `**all**`

`EventTypeMessage`事件，带有`sdk.AttributeKeyModule`和`sdk.AttributeKeySender`，现在直接在消息执行时（在`baseapp`中）发出。
这意味着您所有自定义模块中的以下样板代码应该被删除：

```go
ctx.EventManager().EmitEvent(
	sdk.NewEvent(
		sdk.EventTypeMessage,
		sdk.NewAttribute(sdk.AttributeKeyModule, types.AttributeValueCategory),
		sdk.NewAttribute(sdk.AttributeKeySender, `signer/sender`),
	),
)
```

模块名称由`baseapp`假定为消息路由的第二个元素：`"cosmos.bank.v1beta1.MsgSend" -> "bank"`。
如果模块不遵循标准的消息路径（例如IBC），建议继续发出模块名称事件。
`Baseapp`仅在模块尚未发出该事件时才发出该事件。

#### `x/params`

`params`模块自v0.46起已被弃用。Cosmos SDK已经迁移到了自己的模块而不是`x/params`。
Cosmos SDK模块现在直接在其各自的模块中存储其参数。
`params`模块将在`v0.48`中被删除，如[v0.46发布说明](https://github.com/cosmos/cosmos-sdk/blob/v0.46.1/UPGRADING.md#xparams)中所述。强烈建议在`v0.48`之前迁移到`x/params`。

在执行链迁移时，必须手动初始化params表。在以前的版本中，这是在模块keepers中完成的。
请参考`simapp.RegisterUpgradeHandlers()`中的示例。

#### `x/gov`

##### 提交时的最低提案押金

`gov` 模块已更新以支持在提交时设置最低提案押金。这是通过一个名为 `MinInitialDepositRatio` 的新参数来确定的。当它与现有的 `MinDeposit` 参数相乘，就可以得到在提案提交时所需的代币比例。这个改变的动机是为了防止提案滥发。

默认情况下，新的 `MinInitialDepositRatio` 参数在迁移时被设置为零。零的值表示该功能被禁用。如果链希望在提交时使用最低提案押金，迁移逻辑需要被修改以将新参数设置为所需的值。

##### 新的 Proposal.Proposer 字段

`Proposal` proto 已更新，添加了 proposer 字段。对于提案状态迁移，开发者可以在升级处理器中调用 `v4.AddProposerAddressToProposal` 来更新所有现有的提案并使它们兼容，**这个迁移是可选的**。

```go
import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	v4 "github.com/cosmos/cosmos-sdk/x/gov/migrations/v4"
	upgradetypes "github.com/cosmos/cosmos-sdk/x/upgrade/types"
)

func (app SimApp) RegisterUpgradeHandlers() {
	app.UpgradeKeeper.SetUpgradeHandler(UpgradeName,
		func(ctx sdk.Context, plan upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
			// this migration is optional
			// add proposal ids with proposers which are active (deposit or voting period)
			proposals := make(map[uint64]string)
			proposals[1] = "cosmos1luyncewxk4lm24k6gqy8y5dxkj0klr4tu0lmnj" ...
			v4.AddProposerAddressToProposal(ctx, sdk.NewKVStoreKey(v4.ModuleName), app.appCodec, proposals)
			return app.ModuleManager.RunMigrations(ctx, app.Configurator(), fromVM)
		})
}

```

#### `x/consensus`

引入了一个新的 `x/consensus` 模块来处理 Tendermint 共识参数的管理。为了进行迁移，需要调用特定的迁移函数将已弃用的 `x/params` 模块的现有参数迁移到 `x/consensus` 模块中。应用程序开发者应确保在升级处理器中调用 `baseapp.MigrateParams`。

示例：

```go
func (app SimApp) RegisterUpgradeHandlers() {
 	----> baseAppLegacySS := app.ParamsKeeper.Subspace(baseapp.Paramspace).WithKeyTable(paramstypes.ConsensusParamsKeyTable()) <----

 	app.UpgradeKeeper.SetUpgradeHandler(
 		UpgradeName,
 		func(ctx sdk.Context, _ upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
 			// Migrate Tendermint consensus parameters from x/params module to a
 			// dedicated x/consensus module.
 			----> baseapp.MigrateParams(ctx, baseAppLegacySS, &app.ConsensusParamsKeeper) <----

			// ...

 			return app.ModuleManager.RunMigrations(ctx, app.Configurator(), fromVM)
 		},
 	)

  // ...
}
```

为了处理这个迁移，旧的 params 模块仍然需要在你的 app.go 中导入。

##### `app.go` 的变化

当使用没有应用程序连接的 `app.go` 时，需要进行以下更改：

```diff
- bApp.SetParamStore(app.ParamsKeeper.Subspace(baseapp.Paramspace).WithKeyTable(paramstypes.ConsensusParamsKeyTable()))
+ app.ConsensusParamsKeeper = consensusparamkeeper.NewKeeper(appCodec, keys[consensusparamstypes.StoreKey], authtypes.NewModuleAddress(govtypes.ModuleName).String())
+ bApp.SetParamStore(&app.ConsensusParamsKeeper)
```

当使用应用程序连接时，参数存储会自动为您设置。

#### `x/nft`

SDK 不再验证 NFT 的 `classID` 和 `nftID`，以增加 NFT 实现的灵活性。这意味着链开发者需要验证 NFT 的 `classID` 和 `nftID`。

### 账本

账本支持已被泛化，以便使用使用 `secp256k1` 的不同应用程序和密钥类型。Ledger 接口保持不变，但现在可以通过 Keyring 的 `Options` 提供，允许更高级的链连接到不同的 Ledger 应用程序或使用自定义实现。此外，更高级的链可以提供围绕 Ledger 公钥的自定义密钥实现，以实现更大的地址生成和签名灵活性。

这不是一个破坏性的变更，因为所有的值都将默认使用标准的 Cosmos 应用实现，除非另有规定。

## [v0.46.x](https://github.com/cosmos/cosmos-sdk/releases/tag/v0.46.0)

### Go API 变更

`go.mod` 中的 `replace google.golang.org/grpc` 指令可以被移除，不再需要阻止版本。

在上一个版本中被弃用的一些包现在已经被移除。

例如，REST API 在 v0.45 中被弃用，现在已经被移除。如果您还没有迁移，请按照[说明](https://docs.cosmos.network/v0.45/migrations/rest.html)进行操作。

为了提高 API 的清晰度，进行了一些重命名和改进：

| 包        | 之前的名称                          | 当前的名称                             |
| --------- | ---------------------------------- | ------------------------------------ |
| `simapp`  | `encodingConfig.Marshaler`         | `encodingConfig.Codec`               |
| `simapp`  | `FundAccount`, `FundModuleAccount` | 函数已移至 `x/bank/testutil`         |
| `types`   | `AccAddressFromHex`                | `AccAddressFromHexUnsafe`            |
| `x/auth`  | `MempoolFeeDecorator`              | 使用 `DeductFeeDecorator` 替代        |
| `x/bank`  | `AddressFromBalancesStore`         | `AddressAndDenomFromBalancesStore`   |
| `x/gov`   | `keeper.DeleteDeposits`            | `keeper.DeleteAndBurnDeposits`       |
| `x/gov`   | `keeper.RefundDeposits`            | `keeper.RefundAndDeleteDeposits`     |
| `x/{mod}` | 包 `legacy`                         | 包 `migrations`                       |

有关 API 重命名的详尽列表，请参阅[CHANGELOG](https://github.com/cosmos/cosmos-sdk/blob/main/CHANGELOG.md)。

#### 新包

此外，为了进一步拆分代码库，引入了一些新的包。在进行新的 API 破坏性迁移时，可以使用别名，但建议迁移到这些新的包：

* 当注册错误或包装 SDK 错误时，应使用 `errors` 替代 `types/errors`。
* `math` 包含在 SDK 中使用的 `Int` 或 `Uint` 类型。
* `x/nft` 是一个 NFT 基础模块。
* `x/group` 是一个允许创建 DAO、多签和策略的群组模块。与 `x/authz` 高度组合。

#### `x/authz`

* `authz.NewMsgGrant` 的 `expiration` 现在是一个指针。当使用 `nil` 时，将不设置过期时间（授权不会过期）。
* `authz.NewGrant` 接受一个新的参数：块时间，以正确验证过期时间。

### Keyring

密钥环在 v0.46 中进行了重构。

* `Unsafe*` 接口已从密钥环包中移除。如果您希望访问这些不安全的函数，请使用接口转换。
* 密钥的实现已重构为序列化为 proto。
* `keyring.NewInMemory` 和 `keyring.New` 现在接受一个 `codec.Codec`。
* 在以下函数中，将 `keyring.Record` 替换为 `Info` 作为第一个参数：
        * `MkConsKeyOutput`
        * `MkValKeyOutput`
        * `MkAccKeyOutput`
* 重命名：
        * `SavePubKey` 为 `SaveOfflineKey` 并删除 `algo` 参数。
        * `NewMultiInfo`、`NewLedgerInfo` 为 `NewLegacyMultiInfo`、`newLegacyLedgerInfo`。
        * `NewOfflineInfo` 为 `newLegacyOfflineInfo` 并将其移动到 `migration_test.go`。

### PostHandler

`postHandler` 类似于 `antehandler`，但在 `runMsgs` 执行之后运行。它位于与 `runMsgs` 相同的存储分支中，这意味着 `runMsgs` 和 `postHandler` 都可以运行。这允许在消息执行后运行自定义逻辑。

### IAVL

v0.19.0 IAVL 引入了一个新的 "fast" 索引。该索引以保留键的数据局部性的格式表示 IAVL 的最新状态。因此，它允许更快的查询和迭代，因为数据现在可以按字典顺序读取，这在 Cosmos-SDK 链中经常发生。

在升级后第一次启动链时，将创建上述索引。创建过程可能需要时间，取决于链的最新状态的大小。例如，Osmosis 需要大约 15 分钟来重建索引。

在创建索引时，节点操作员可以在日志中观察到以下内容："Upgrading IAVL storage for faster queries + execution on the live state. This may take a while"。消息中附加了存储键。该消息将为每个具有非瞬态存储的模块打印。因此，它可以很好地指示升级的进度。

还有降级和重新升级的保护机制。如果节点操作员选择降级到 IAVL 预快速索引，然后再次升级，索引将从头开始重建。在大多数情况下，这个实现细节应该不相关。它是为了防止操作员的错误而添加的保护措施。

### 模块

#### `x/params`

* `x/params` 模块已被弃用，推荐每个模块自行管理和提供修改参数的方式。每个具有在运行时可更改的参数的模块都有一个权限，该权限可以是模块或用户账户。Cosmos SDK 团队建议将模块迁移到不使用 param 模块的方式。可以在[这里](https://github.com/cosmos/cosmos-sdk/pull/12363)找到一个示例。
* Param 模块将在2023年4月18日之前继续维护。此时，该模块将到达生命周期的尽头，并从 Cosmos SDK 中删除。

#### `x/gov`

`gov` 模块已经得到了很大的改进。之前的 API 已经移动到 `v1beta1`，而新的实现被称为 `v1`。

现在，要使用 `submit-proposal` 提交提案，您需要传递一个 `proposal.json` 文件。
您仍然可以使用旧的方式，即使用 `submit-legacy-proposal`。但不建议这样做。
更多信息可以在 gov 模块的[客户端文档](https://docs.cosmos.network/v0.46/modules/gov/07_client.html)中找到。

#### `x/staking`

`staking` 模块添加了一种新的消息类型来取消解绑委托。现在，用户可以指定要取消解绑的金额和验证人。

### Protobuf

[之前版本](https://github.com/cosmos/cosmos-sdk/tree/v0.45.3/third_party/proto)中存在的 `third_party/proto` 文件夹现在不直接包含[proto文件](https://github.com/cosmos/cosmos-sdk/tree/release/v0.46.x/third_party/proto)。

相反，SDK 使用 [`buf`](https://buf.build)。客户端应该有自己的 [`buf.yaml`](https://docs.buf.build/configuration/v1/buf-yaml)，其中依赖项为 `buf.build/cosmos/cosmos-sdk`，以避免复制粘贴这些文件。

protos也可以使用`buf export buf.build/cosmos/cosmos-sdk:8cb30a2c4de74dc9bd8d260b1e75e176 --output <some_folder>`进行下载。

Cosmos消息的protobuf应该扩展为`cosmos.msg.v1.signer`：

```protobuf
message MsgSetWithdrawAddress {
  option (cosmos.msg.v1.signer) = "delegator_address"; ++

  option (gogoproto.equal)           = false;
  option (gogoproto.goproto_getters) = false;

  string delegator_address = 1 [(cosmos_proto.scalar) = "cosmos.AddressString"];
  string withdraw_address  = 2 [(cosmos_proto.scalar) = "cosmos.AddressString"];
}
```

当客户端与节点进行交互时，需要在grpc.Dial中设置一个编解码器。更多信息可以在此[文档](https://docs.cosmos.network/v0.46/run-node/interact-node.html#programmatically-via-go)中找到。


# Upgrading Cosmos SDK

This guide provides instructions for upgrading to specific versions of Cosmos SDK.
Note, always read the **SimApp** section for more information on application wiring updates.

## [Unreleased]

### Migration to CometBFT (Part 2)

The Cosmos SDK has migrated in its previous versions, to CometBFT.
Some functions have been renamed to reflect the naming change.

Following an exhaustive list:

* `client.TendermintRPC` -> `client.CometRPC`
* `clitestutil.MockTendermintRPC` -> `clitestutil.MockCometRPC`
* `clitestutilgenutil.CreateDefaultTendermintConfig` -> `clitestutilgenutil.CreateDefaultCometConfig`
* Package `client/grpc/tmservice` -> `client/grpc/cmtservice`

Additionally, the commands and flags mentioning `tendermint` have been renamed to `comet`.
However, these commands and flags is still supported for backward compatibility.

For backward compatibility, the `**/tendermint/**` gRPC services are still supported.

Additionally, the SDK is starting its abstraction from CometBFT Go types thorought the codebase:

* The usage of CometBFT have been replaced to use the Cosmos SDK logger interface (`cosmossdk.io/log.Logger`).
* The usage of `github.com/cometbft/cometbft/libs/bytes.HexByte` have been replaced by `[]byte`.

### Configuration

A new tool have been created for migrating configuration of the SDK. Use the following command to migrate your configuration:

```bash
simd config migrate v0.48
```

More information about [confix](https://docs.cosmos.network/main/tooling/confix).

#### Events

The log section of abci.TxResult is not populated in the case of successful msg(s) execution. Instead a new attribute is added to all messages indicating the `msg_index` which identifies which events and attributes relate the same transaction

#### gRPC-Web

gRPC-Web is now listening to the same address as the gRPC Gateway API server (default: `localhost:1317`).
The possibility to listen to a different address has been removed, as well as its settings.
Use `confix` to clean-up your `app.toml`. A nginx (or alike) reverse-proxy can be set to keep the previous behavior.

#### Database Support

ClevelDB, BoltDB and BadgerDB are not supported anymore. To migrate from a unsupported database to a supported database please use the database migration tool.

### Protobuf

The SDK is in the process of removing all `gogoproto` annotations.

#### Stringer

The `gogoproto.goproto_stringer = false` annotation has been removed from most proto files. This means that the `String()` method is being generated for types that previously had this annotation. The generated `String()` method uses `proto.CompactTextString` for _stringifying_ structs.
[Verify](https://github.com/cosmos/cosmos-sdk/pull/13850#issuecomment-1328889651) the usage of the modified `String()` methods and double-check that they are not used in state-machine code.

### SimApp

<!-- TODO(@julienrbrt) collapse this section in 3 parts, general, app v1 and app v2 changes, now it is a bit confusing -->

#### Module Assertions

Previously, all modules were required to be set in `OrderBeginBlockers`, `OrderEndBlockers` and `OrderInitGenesis / OrderExportGenesis` in `app.go` / `app_config.go`.
This is no longer the case, the assertion has been loosened to only require modules implementing, respectively, the `module.BeginBlockAppModule`, `module.EndBlockAppModule` and `module.HasGenesis` interfaces.

#### Modules Keepers

The following modules `NewKeeper` function now take a `KVStoreService` instead of a `StoreKey`:

* `x/auth`
* `x/authz`
* `x/bank`
* `x/consensus`
* `x/distribution`
* `x/feegrant`
* `x/nft`

User manually wiring their chain need to use the `runtime.NewKVStoreService` method to create a `KVStoreService` from a `StoreKey`:

```diff
app.ConsensusParamsKeeper = consensusparamkeeper.NewKeeper(
  appCodec,
- keys[consensusparamtypes.StoreKey]
+ runtime.NewKVStoreService(keys[consensusparamtypes.StoreKey]),
  authtypes.NewModuleAddress(govtypes.ModuleName).String(),
)
```

The following modules' `Keeper` methods now take in a `context.Context` instead of `sdk.Context`. Any module that has an interfaces for them (like "expected keepers") will need to update and re-generate mocks if needed:

* `x/authz`
* `x/bank`
* `x/distribution`

**Users using depinject do not need any changes, this is automatically done for them.**

#### Logger

The following modules `NewKeeper` function now take a `log.Logger`:

* `x/bank`

`depinject` users must now supply the logger through the main `depinject.Supply` function instead of passing it to `appBuilder.Build`.

```diff
appConfig = depinject.Configs(
	AppConfig,
	depinject.Supply(
		// supply the application options
		appOpts,
+		logger,
	...
```

```diff
- app.App = appBuilder.Build(logger, db, traceStore, baseAppOptions...)
+ app.App = appBuilder.Build(db, traceStore, baseAppOptions...)
```

User manually wiring their chain need to add the logger argument when creating the keeper.

#### Module Basics

Previously, the `ModuleBasics` was a global variable that was used to register all modules's `AppModuleBasic` implementation.
The global variable has been removed and the basic module manager can be now created from the module manager.

This is automatically done for depinject users, however for supplying different app module implementation, pass them via `depinject.Supply` in the main `AppConfig` (`app_config.go`):

```go
depinject.Supply(
			// supply custom module basics
			map[string]module.AppModuleBasic{
				genutiltypes.ModuleName: genutil.NewAppModuleBasic(genutiltypes.DefaultMessageValidator),
				govtypes.ModuleName: gov.NewAppModuleBasic(
					[]govclient.ProposalHandler{
						paramsclient.ProposalHandler,
					},
				),
			},
		)
```

Users manually wiring their chain need to use the new `module.NewBasicManagerFromManager` function, after the module manager creation, and pass a `map[string]module.AppModuleBasic` as argument for optionally overridding some module's `AppModuleBasic`.

### Packages

#### Store

References to `types/store.go` which contained aliases for store types have been remapped to point to appropriate  store/types, hence the `types/store.go` file is no longer needed and has been removed.

##### Extract Store to a standalone module

The `store` module is extracted to have a separate go.mod file which allows it be a standalone module. 
All the store imports are now renamed to use `cosmossdk.io/store` instead of `github.com/cosmos/cosmos-sdk/store` across the SDK.

#### Client

The return type of the interface method `TxConfig.SignModeHandler()` has been changed from `x/auth/signing.SignModeHandler` to `x/tx/signing.HandlerMap`. This change is transparent to most users as the `TxConfig` interface is typically implemented by private `x/auth/tx.config` struct (as returned by `auth.NewTxConfig`) which has been updated to return the new type.  If users have implemented their own `TxConfig` interface, they will need to update their implementation to return the new type.

### Modules

#### `**all**`

[RFC 001](https://docs.cosmos.network/main/rfc/rfc-001-tx-validation) has defined a simplification of the message validation process for modules.
The `sdk.Msg` interface has been updated to not require the implementation of the `ValidateBasic` method.
It is now recommended to validate message directly in the message server. When the validation is performed in the message server, the `ValidateBasic` method on a message is no longer required and can be removed.

#### `x/auth`

For ante handler construction via `ante.NewAnteHandler`, the field `ante.HandlerOptions.SignModeHandler` has been updated to `x/tx/signing/HandlerMap` from `x/auth/signing/SignModeHandler`.  Callers typically fetch this value from `client.TxConfig.SignModeHandler()` (which is also changed) so this change should be transparent to most users.

#### `x/capability`

Capability was moved to [IBC-GO](https://github.com/cosmos/ibc-go). IBC V8 will contain the necessary changes to incorporate the new module location

#### `x/gov`

##### Expedited Proposals

The `gov` v1 module has been updated to support the ability to expedite governance proposals. When a proposal is expedited, the voting period will be shortened to `ExpeditedVotingPeriod` parameter. An expedited proposal must have an higher voting threshold than a classic proposal, that threshold is defined with the `ExpeditedThreshold` parameter.

##### Cancelling Proposals

The `gov` module has been updated to support the ability to cancel governance proposals. When a proposal is canceled, all the deposits of the proposal are either burnt or sent to `ProposalCancelDest` address. The deposits burn rate will be determined by a new parameter called `ProposalCancelRatio` parameter.

```text
	1. deposits * proposal_cancel_ratio will be burned or sent to `ProposalCancelDest` address , if `ProposalCancelDest` is empty then deposits will be burned.
	2. deposits * (1 - proposal_cancel_ratio) will be sent to depositors.
```

By default, the new `ProposalCancelRatio` parameter is set to 0.5 during migration and `ProposalCancelDest` is set to empty string (i.e. burnt).

#### `x/evidence`

##### Extract evidence to a standalone module

The `x/evidence` module is extracted to have a separate go.mod file which allows it be a standalone module. 
All the evidence imports are now renamed to use `cosmossdk.io/x/evidence` instead of `github.com/cosmos/cosmos-sdk/x/evidence` across the SDK.

#### `x/nft`

##### Extract nft to a standalone module

The `x/nft` module is extracted to have a separate go.mod file which allows it to be a standalone module. 

#### x/feegrant

##### Extract feegrant to a standalone module

The `x/feegrant` module is extracted to have a separate go.mod file which allows it to be a standalone module.
All the feegrant imports are now renamed to use `cosmossdk.io/x/feegrant` instead of `github.com/cosmos/cosmos-sdk/x/feegrant` across the SDK.

#### `x/upgrade`

##### Extract upgrade to a standalone module

The `x/upgrade` module is extracted to have a separate go.mod file which allows it to be a standalone module. 
All the upgrade imports are now renamed to use `cosmossdk.io/x/upgrade` instead of `github.com/cosmos/cosmos-sdk/x/upgrade` across the SDK.

## [v0.47.x](https://github.com/cosmos/cosmos-sdk/releases/tag/v0.47.0)

### Migration to CometBFT (Part 1)

The Cosmos SDK has migrated to CometBFT, as its default consensus engine.
CometBFT is an implementation of the Tendermint consensus algorithm, and the successor of Tendermint Core.
Due to the import changes, this is a breaking change. Chains need to remove **entirely** their imports of Tendermint Core in their codebase, from direct and indirects imports in their `go.mod`.

* Replace `github.com/tendermint/tendermint` by `github.com/cometbft/cometbft`
* Replace `github.com/tendermint/tm-db` by `github.com/cometbft/cometbft-db`
* Verify `github.com/tendermint/tendermint` is not an indirect or direct dependency
* Run `make proto-gen`

Other than that, the migration should be seamless.
On the SDK side, clean-up of variables, functions to reflect the new name will only happen from v0.48 (part 2).

Note: It is possible that these steps must first be performed by your dependencies before you can perform them on your own codebase.

### Simulation

Remove `RandomizedParams` from `AppModuleSimulation` interface. Previously, it used to generate random parameter changes during simulations, however, it does so through ParamChangeProposal which is now legacy. Since all modules were migrated, we can now safely remove this from `AppModuleSimulation` interface.

Moreover, to support the `MsgUpdateParams` governance proposals for each modules, `AppModuleSimulation` now defines a `AppModule.ProposalMsgs` method in addition to `AppModule.ProposalContents`. That method defines the messages that can be used to submit a proposal and that should be tested in simulation.

When a module has no proposal messages or proposal content to be tested by simulation, the `AppModule.ProposalMsgs` and `AppModule.ProposalContents` methods can be deleted.

### gRPC

A new gRPC service, `proto/cosmos/base/node/v1beta1/query.proto`, has been introduced
which exposes various operator configuration. App developers should be sure to
register the service with the gRPC-gateway service via
`nodeservice.RegisterGRPCGatewayRoutes` in their application construction, which
is typically found in `RegisterAPIRoutes`.

### AppModule Interface

Support for the `AppModule` `Querier`, `Route` and `LegacyQuerier` methods has been entirely removed from the `AppModule`
interface. This removes and fully deprecates all legacy queriers. All modules no longer support the REST API previously
known as the LCD, and the `sdk.Msg#Route` method won't be used anymore.

Most other existing `AppModule` methods have been moved to extension interfaces in preparation for the migration
to the `cosmossdk.io/core/appmodule` API in the next release. Most `AppModule` implementations should not be broken
by this change.

### SimApp

The `simapp` package **should not be imported in your own app**. Instead, you should import the `runtime.AppI` interface, that defines an `App`, and use the [`simtestutil` package](https://pkg.go.dev/github.com/cosmos/cosmos-sdk/testutil/sims) for application testing.

#### App Wiring

SimApp's `app_v2.go` is using [App Wiring](https://docs.cosmos.network/main/building-apps/app-go-v2), the dependency injection framework of the Cosmos SDK.
This means that modules are injected directly into SimApp thanks to a [configuration file](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_config.go).
The previous behavior, without the dependency injection framework, is still present in [`app.go`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go) and is not going anywhere.

If you are using a `app.go` without dependency injection, add the following lines to your `app.go` in order to provide newer gRPC services:

```go
autocliv1.RegisterQueryServer(app.GRPCQueryRouter(), runtimeservices.NewAutoCLIQueryService(app.ModuleManager.Modules))

reflectionSvc, err := runtimeservices.NewReflectionService()
if err != nil {
    panic(err)
}
reflectionv1.RegisterReflectionServiceServer(app.GRPCQueryRouter(), reflectionSvc)
```

#### Constructor

The constructor, `NewSimApp` has been simplified:

* `NewSimApp` does not take encoding parameters (`encodingConfig`) as input, instead the encoding parameters are injected (when using app wiring), or directly created in the constructor. Instead, we can instantiate `SimApp` for getting the encoding configuration.
* `NewSimApp` now uses `AppOptions` for getting the home path (`homePath`) and the invariant checks period (`invCheckPeriod`). These were unnecessary given as arguments as they were already present in the `AppOptions`.

#### Encoding

`simapp.MakeTestEncodingConfig()` was deprecated and has been removed. Instead you can use the `TestEncodingConfig` from the `types/module/testutil` package.
This means you can replace your usage of `simapp.MakeTestEncodingConfig` in tests to `moduletestutil.MakeTestEncodingConfig`, which takes a series of relevant `AppModuleBasic` as input (the module being tested and any potential dependencies).

#### Export

`ExportAppStateAndValidators` takes an extra argument, `modulesToExport`, which is a list of module names to export.
That argument should be passed to the module maanager `ExportGenesisFromModules` method.

#### Replaces

The `GoLevelDB` version must pinned to `v1.0.1-0.20210819022825-2ae1ddf74ef7` in the application, following versions might cause unexpected behavior.
This can be done adding `replace github.com/syndtr/goleveldb => github.com/syndtr/goleveldb v1.0.1-0.20210819022825-2ae1ddf74ef7` to the `go.mod` file.

* [issue #14949 on cosmos-sdk](https://github.com/cosmos/cosmos-sdk/issues/14949)
* [issue #25413 on go-ethereum](https://github.com/ethereum/go-ethereum/pull/25413)

### Protobuf

The SDK has migrated from `gogo/protobuf` (which is currently unmaintained), to our own maintained fork, [`cosmos/gogoproto`](https://github.com/cosmos/gogoproto).

This means you should replace all imports of `github.com/gogo/protobuf` to `github.com/cosmos/gogoproto`.
This allows you to remove the replace directive `replace github.com/gogo/protobuf => github.com/regen-network/protobuf v1.3.3-alpha.regen.1` from your `go.mod` file.

Please use the `ghcr.io/cosmos/proto-builder` image (version >= `0.11.5`) for generating protobuf files.

See which buf commit for `cosmos/cosmos-sdk` to pin in your `buf.yaml` file [here](../tooling).

#### Gogoproto Import Paths

The SDK made a [patch fix](https://github.com/cosmos/gogoproto/pull/32) on its gogoproto repository to require that each proto file's package name matches its OS import path (relatively to a protobuf root import path, usually the root `proto/` folder, set by the `protoc -I` flag).

For example, assuming you put all your proto files in subfolders inside your root `proto/` folder, then a proto file with package name `myapp.mymodule.v1` should be found in the `proto/myapp/mymodule/v1/` folder. If it is in another folder, the proto generation command will throw an error.

If you are using a custom folder structure for your proto files, please reorganize them so that their OS path matches their proto package name.

This is to allow the proto FileDescriptSets to be correctly registered, and this standardized OS import paths allows [Hubl](https://github.com/cosmos/cosmos-sdk/tree/main/tools/hubl) to reflectively talk to any chain.

#### `{accepts,implements}_interface` proto annotations

The SDK is normalizing the strings inside the Protobuf `accepts_interface` and `implements_interface` annotations. We require them to be fully-scoped names. They will soon be used by code generators like Pulsar and Telescope to match which messages can or cannot be packed inside `Any`s.

Here are the following replacements that you need to perform on your proto files:

```diff
- "Content"
+ "cosmos.gov.v1beta1.Content"
- "Authorization"
+ "cosmos.authz.v1beta1.Authorization"
- "sdk.Msg"
+ "cosmos.base.v1beta1.Msg"
- "AccountI"
+ "cosmos.auth.v1beta1.AccountI"
- "ModuleAccountI"
+ "cosmos.auth.v1beta1.ModuleAccountI"
- "FeeAllowanceI"
+ "cosmos.feegrant.v1beta1.FeeAllowanceI"
```

Please also check that in your own app's proto files that there are no single-word names for those two proto annotations. If so, then replace them with fully-qualified names, even though those names don't actually resolve to an actual protobuf entity.

For more information, see the [encoding guide](../../develop/advanced-concepts/06-encoding.md).

### Transactions

#### Broadcast Mode

Broadcast mode `block` was deprecated and has been removed. Please use `sync` mode
instead. When upgrading your tests from `block` to `sync` and checking for a
transaction code, you need to query the transaction first (with its hash) to get
the correct code.

### Modules

#### `**all**`

`EventTypeMessage` events, with `sdk.AttributeKeyModule` and `sdk.AttributeKeySender` are now emitted directly at message excecution (in `baseapp`).
This means that the following boilerplate should be removed from all your custom modules:

```go
ctx.EventManager().EmitEvent(
	sdk.NewEvent(
		sdk.EventTypeMessage,
		sdk.NewAttribute(sdk.AttributeKeyModule, types.AttributeValueCategory),
		sdk.NewAttribute(sdk.AttributeKeySender, `signer/sender`),
	),
)
```

The module name is assumed by `baseapp` to be the second element of the message route: `"cosmos.bank.v1beta1.MsgSend" -> "bank"`.
In case a module does not follow the standard message path, (e.g. IBC), it is advised to keep emitting the module name event.
`Baseapp` only emits that event if the module has not already done so.

#### `x/params`

The `params` module was deprecated since v0.46. The Cosmos SDK has migrated away from `x/params` for its own modules.
Cosmos SDK modules now store their parameters directly in its repective modules.
The `params` module will be removed in `v0.48`, as mentioned [in v0.46 release](https://github.com/cosmos/cosmos-sdk/blob/v0.46.1/UPGRADING.md#xparams). It is strongly encouraged to migrate away from `x/params` before `v0.48`.

When performing a chain migration, the params table must be initizalied manually. This was done in the modules keepers in previous versions.
Have a look at `simapp.RegisterUpgradeHandlers()` for an example.

#### `x/gov`

##### Minimum Proposal Deposit At Time of Submission

The `gov` module has been updated to support a minimum proposal deposit at submission time. It is determined by a new
parameter called `MinInitialDepositRatio`. When multiplied by the existing `MinDeposit` parameter, it produces
the necessary proportion of coins needed at the proposal submission time. The motivation for this change is to prevent proposal spamming.

By default, the new `MinInitialDepositRatio` parameter is set to zero during migration. The value of zero signifies that this 
feature is disabled. If chains wish to utilize the minimum proposal deposits at time of submission, the migration logic needs to be 
modified to set the new parameter to the desired value.

##### New Proposal.Proposer field

The `Proposal` proto has been updated with proposer field. For proposal state migraton developers can call `v4.AddProposerAddressToProposal` in their upgrade handler to update all existing proposal and make them compatible and **this migration is optional**.

```go
import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	v4 "github.com/cosmos/cosmos-sdk/x/gov/migrations/v4"
	upgradetypes "github.com/cosmos/cosmos-sdk/x/upgrade/types"
)

func (app SimApp) RegisterUpgradeHandlers() {
	app.UpgradeKeeper.SetUpgradeHandler(UpgradeName,
		func(ctx sdk.Context, plan upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
			// this migration is optional
			// add proposal ids with proposers which are active (deposit or voting period)
			proposals := make(map[uint64]string)
			proposals[1] = "cosmos1luyncewxk4lm24k6gqy8y5dxkj0klr4tu0lmnj" ...
			v4.AddProposerAddressToProposal(ctx, sdk.NewKVStoreKey(v4.ModuleName), app.appCodec, proposals)
			return app.ModuleManager.RunMigrations(ctx, app.Configurator(), fromVM)
		})
}

```

#### `x/consensus`

Introducing a new `x/consensus` module to handle managing Tendermint consensus
parameters. For migration it is required to call a specific migration to migrate
existing parameters from the deprecated `x/params` to `x/consensus` module. App
developers should ensure to call `baseapp.MigrateParams` in their upgrade handler.

Example:

```go
func (app SimApp) RegisterUpgradeHandlers() {
 	----> baseAppLegacySS := app.ParamsKeeper.Subspace(baseapp.Paramspace).WithKeyTable(paramstypes.ConsensusParamsKeyTable()) <----

 	app.UpgradeKeeper.SetUpgradeHandler(
 		UpgradeName,
 		func(ctx sdk.Context, _ upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
 			// Migrate Tendermint consensus parameters from x/params module to a
 			// dedicated x/consensus module.
 			----> baseapp.MigrateParams(ctx, baseAppLegacySS, &app.ConsensusParamsKeeper) <----

			// ...

 			return app.ModuleManager.RunMigrations(ctx, app.Configurator(), fromVM)
 		},
 	)

  // ...
}
```

The old params module is required to still be imported in your app.go in order to handle this migration. 

##### `app.go` changes

When using an `app.go` without App Wiring, the following changes are required:

```diff
- bApp.SetParamStore(app.ParamsKeeper.Subspace(baseapp.Paramspace).WithKeyTable(paramstypes.ConsensusParamsKeyTable()))
+ app.ConsensusParamsKeeper = consensusparamkeeper.NewKeeper(appCodec, keys[consensusparamstypes.StoreKey], authtypes.NewModuleAddress(govtypes.ModuleName).String())
+ bApp.SetParamStore(&app.ConsensusParamsKeeper)
```

When using App Wiring, the paramater store is automatically set for you.

#### `x/nft`

The SDK does not validate anymore the `classID` and `nftID` of an NFT, for extra flexibility in your NFT implementation.
This means chain developers need to validate the `classID` and `nftID` of an NFT.

### Ledger

Ledger support has been generalized to enable use of different apps and keytypes that use `secp256k1`. The Ledger interface remains the same, but it can now be provided through the Keyring `Options`, allowing higher-level chains to connect to different Ledger apps or use custom implementations. In addition, higher-level chains can provide custom key implementations around the Ledger public key, to enable greater flexibility with address generation and signing.

This is not a breaking change, as all values will default to use the standard Cosmos app implementation unless specified otherwise.

## [v0.46.x](https://github.com/cosmos/cosmos-sdk/releases/tag/v0.46.0)

### Go API Changes

The `replace google.golang.org/grpc` directive can be removed from the `go.mod`, it is no more required to block the version.

A few packages that were deprecated in the previous version are now removed.

For instance, the REST API, deprecated in v0.45, is now removed. If you have not migrated yet, please follow the [instructions](https://docs.cosmos.network/v0.45/migrations/rest.html).

To improve clarity of the API, some renaming and improvements has been done:

| Package   | Previous                           | Current                              |
| --------- | ---------------------------------- | ------------------------------------ |
| `simapp`  | `encodingConfig.Marshaler`         | `encodingConfig.Codec`               |
| `simapp`  | `FundAccount`, `FundModuleAccount` | Functions moved to `x/bank/testutil` |
| `types`   | `AccAddressFromHex`                | `AccAddressFromHexUnsafe`            |
| `x/auth`  | `MempoolFeeDecorator`              | Use `DeductFeeDecorator` instead     |
| `x/bank`  | `AddressFromBalancesStore`         | `AddressAndDenomFromBalancesStore`   |
| `x/gov`   | `keeper.DeleteDeposits`            | `keeper.DeleteAndBurnDeposits`       |
| `x/gov`   | `keeper.RefundDeposits`            | `keeper.RefundAndDeleteDeposits`     |
| `x/{mod}` | package `legacy`                   | package `migrations`                 |

For the exhaustive list of API renaming, please refer to the [CHANGELOG](https://github.com/cosmos/cosmos-sdk/blob/main/CHANGELOG.md).

#### new packages

Additionally, new packages have been introduced in order to further split the codebase. Aliases are available for a new API breaking migration, but it is encouraged to migrate to this new packages:

* `errors` should replace `types/errors` when registering errors or wrapping SDK errors.
* `math` contains the `Int` or `Uint` types that are used in the SDK.
* `x/nft` an NFT base module.
* `x/group` a group module allowing to create DAOs, multisig and policies. Greatly composes with `x/authz`.

#### `x/authz`

* `authz.NewMsgGrant` `expiration` is now a pointer. When `nil` is used, then no expiration will be set (grant won't expire).
* `authz.NewGrant` takes a new argument: block time, to correctly validate expire time.

### Keyring

The keyring has been refactored in v0.46.

* The `Unsafe*` interfaces have been removed from the keyring package. Please use interface casting if you wish to access those unsafe functions.
* The keys' implementation has been refactored to be serialized as proto.
* `keyring.NewInMemory` and `keyring.New` takes now a `codec.Codec`.
* Take `keyring.Record` instead of `Info` as first argument in:
        * `MkConsKeyOutput`
        * `MkValKeyOutput`
        * `MkAccKeyOutput`
* Rename:
        * `SavePubKey` to `SaveOfflineKey` and remove the `algo` argument.
        * `NewMultiInfo`, `NewLedgerInfo`  to `NewLegacyMultiInfo`, `newLegacyLedgerInfo` respectively.
        * `NewOfflineInfo` to `newLegacyOfflineInfo` and move it to `migration_test.go`.

### PostHandler

A `postHandler` is like an `antehandler`, but is run _after_ the `runMsgs` execution. It is in the same store branch that `runMsgs`, meaning that both `runMsgs` and `postHandler`. This allows to run a custom logic after the execution of the messages.

### IAVL

v0.19.0 IAVL introduces a new "fast" index. This index represents the latest state of the
IAVL laid out in a format that preserves data locality by key. As a result, it allows for faster queries and iterations
since data can now be read in lexicographical order that is frequent for Cosmos-SDK chains.

The first time the chain is started after the upgrade, the aforementioned index is created. The creation process
might take time and depends on the size of the latest state of the chain. For example, Osmosis takes around 15 minutes to rebuild the index.

While the index is being created, node operators can observe the following in the logs:
"Upgrading IAVL storage for faster queries + execution on the live state. This may take a while". The store
key is appended to the message. The message is printed for every module that has a non-transient store.
As a result, it gives a good indication of the progress of the upgrade.

There is also downgrade and re-upgrade protection. If a node operator chooses to downgrade to IAVL pre-fast index, and then upgrade again, the index is rebuilt from scratch. This implementation detail should not be relevant in most cases. It was added as a safeguard against operator
mistakes.

### Modules

#### `x/params`

* The `x/params` module has been depreacted in favour of each module housing and providing way to modify their parameters. Each module that has parameters that are changable during runtime have an authority, the authority can be a module or user account. The Cosmos SDK team recommends migrating modules away from using the param module. An example of how this could look like can be found [here](https://github.com/cosmos/cosmos-sdk/pull/12363). 
* The Param module will be maintained until April 18, 2023. At this point the module will reach end of life and be removed from the Cosmos SDK.

#### `x/gov`

The `gov` module has been greatly improved. The previous API has been moved to `v1beta1` while the new implementation is called `v1`.

In order to submit a proposal with `submit-proposal` you now need to pass a `proposal.json` file.
You can still use the old way by using `submit-legacy-proposal`. This is not recommended.
More information can be found in the gov module [client documentation](https://docs.cosmos.network/v0.46/modules/gov/07_client.html).

#### `x/staking`

The `staking module` added a new message type to cancel unbonding delegations. Users that have unbonded by accident or wish to cancel a undelegation can now specify the amount and valdiator they would like to cancel the unbond from

### Protobuf

The `third_party/proto` folder that existed in [previous version](https://github.com/cosmos/cosmos-sdk/tree/v0.45.3/third_party/proto) now does not contains directly the [proto files](https://github.com/cosmos/cosmos-sdk/tree/release/v0.46.x/third_party/proto).

Instead, the SDK uses [`buf`](https://buf.build). Clients should have their own [`buf.yaml`](https://docs.buf.build/configuration/v1/buf-yaml) with `buf.build/cosmos/cosmos-sdk` as dependency, in order to avoid having to copy paste these files.

The protos can as well be downloaded using `buf export buf.build/cosmos/cosmos-sdk:8cb30a2c4de74dc9bd8d260b1e75e176 --output <some_folder>`.

Cosmos message protobufs should be extended with `cosmos.msg.v1.signer`: 

```protobuf
message MsgSetWithdrawAddress {
  option (cosmos.msg.v1.signer) = "delegator_address"; ++

  option (gogoproto.equal)           = false;
  option (gogoproto.goproto_getters) = false;

  string delegator_address = 1 [(cosmos_proto.scalar) = "cosmos.AddressString"];
  string withdraw_address  = 2 [(cosmos_proto.scalar) = "cosmos.AddressString"];
}
```

When clients interract with a node they are required to set a codec in in the grpc.Dial. More information can be found in this [doc](https://docs.cosmos.network/v0.46/run-node/interact-node.html#programmatically-via-go).
