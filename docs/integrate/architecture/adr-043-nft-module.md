# ADR 43: NFT 模块

## 更新日志

* 2021-05-01: 初始草案
* 2021-07-02: 审查更新
* 2022-06-15: 添加批量操作
* 2022-11-11: 移除对 classID 和 tokenID 的严格验证

## 状态

提议中

## 摘要

本 ADR 定义了 `x/nft` 模块，它是 NFT 的通用实现，与 ERC721 "兼容"。**使用 `x/nft` 模块的应用程序必须实现以下功能**：

* `MsgNewClass` - 接收用户创建类的请求，并调用 `x/nft` 模块的 `NewClass` 函数。
* `MsgUpdateClass` - 接收用户更新类的请求，并调用 `x/nft` 模块的 `UpdateClass` 函数。
* `MsgMintNFT` - 接收用户铸造 NFT 的请求，并调用 `x/nft` 模块的 `MintNFT` 函数。
* `BurnNFT` - 接收用户销毁 NFT 的请求，并调用 `x/nft` 模块的 `BurnNFT` 函数。
* `UpdateNFT` - 接收用户更新 NFT 的请求，并调用 `x/nft` 模块的 `UpdateNFT` 函数。

## 背景

NFT 不仅仅是加密艺术品，对于 Cosmos 生态系统的价值积累非常有帮助。因此，Cosmos Hub 应该实现 NFT 功能，并在 https://github.com/cosmos/cosmos-sdk/discussions/9065 中讨论的方式中启用一种统一的机制，用于存储和发送 NFT 的所有权代表。

如 [#9065](https://github.com/cosmos/cosmos-sdk/discussions/9065) 中所讨论的，可以考虑几种潜在的解决方案：

* irismod/nft 和 modules/incubator/nft
* CW721
* DID NFTs
* interNFT

由于 NFT 的功能/用例与其逻辑紧密相关，通过定义和实现不同的交易类型，几乎不可能在一个 Cosmos SDK 模块中支持所有 NFT 的用例。

考虑到跨链协议（包括 IBC 和 Gravity Bridge）的通用使用和兼容性，最好设计一个通用的 NFT 模块，处理通用的 NFT 逻辑。
这个设计思路可以实现可组合性，应用程序特定的功能应该由 Cosmos Hub 上的其他模块或其他区域通过导入 NFT 模块来管理。

当前的设计基于[IRISnet团队](https://github.com/irisnet/irismod/tree/master/modules/nft)的工作以及[Cosmos存储库](https://github.com/cosmos/modules/tree/master/incubator/nft)中的旧实现。

## 决策

我们创建了一个`x/nft`模块，其中包含以下功能：

* 存储NFT并跟踪其所有权。
* 提供`Keeper`接口，用于组合模块以转移、铸造和销毁NFT。
* 提供外部`Message`接口，供用户转移其NFT的所有权。
* 查询NFT及其供应信息。

所提议的模块是NFT应用逻辑的基础模块。其目标是为存储、基本转移功能和IBC提供一个通用层。该模块不应作为独立模块使用。相反，应用程序应创建一个专门的模块来处理特定的应用逻辑（例如：NFT ID构建、版税），用户级别的铸造和销毁。此外，应用程序专用模块应处理辅助数据以支持应用逻辑（例如索引、ORM、业务数据）。

通过IBC传输的所有数据必须是下面描述的`NFT`或`Class`类型的一部分。应用程序特定的NFT数据应编码在`NFT.data`中以实现跨链完整性。与NFT相关但对完整性不重要的其他对象可以是应用程序特定模块的一部分。

### 类型

我们提议两种主要类型：

* `Class` -- 描述NFT类。我们可以将其视为智能合约地址。
* `NFT` -- 表示唯一的非同质化资产的对象。每个NFT与一个Class相关联。

#### Class

NFT **Class**类似于ERC-721智能合约（提供智能合约的描述），在该合约下可以创建和管理一组NFT。

```protobuf
message Class {
  string id          = 1;
  string name        = 2;
  string symbol      = 3;
  string description = 4;
  string uri         = 5;
  string uri_hash    = 6;
  google.protobuf.Any data = 7;
}
```

* `id` 用作存储类的主索引；_必需_
* `name` 是NFT类的描述性名称；_可选_
* `symbol` 是通常在交易所上显示的NFT类的符号；_可选_
* `description` 是NFT类的详细描述；_可选_
* `uri` 是存储在链外的类元数据的URI。它应该是一个包含有关NFT类和NFT数据模式的元数据的JSON文件（[OpenSea示例](https://docs.opensea.io/docs/contract-level-metadata)）；_可选_
* `uri_hash` 是由uri指向的文档的哈希值；_可选_
* `data` 是类的应用程序特定元数据；_可选_

#### NFT

我们将`NFT`定义为以下通用模型。

```protobuf
message NFT {
  string class_id           = 1;
  string id                 = 2;
  string uri                = 3;
  string uri_hash           = 4;
  google.protobuf.Any data  = 10;
}
```

* `class_id`是NFT所属的NFT类别的标识符；_必填_
* `id`是NFT的标识符，在其类别范围内是唯一的。它由NFT的创建者指定，并且将来可能会扩展为使用DID。`class_id`与`id`的组合唯一标识了一个NFT，并用作存储NFT的主索引；_必填_

  ```text
  {class_id}/{id} --> NFT (bytes)
  ```

* `uri` is a URI for the NFT metadata stored off chain. Should point to a JSON file that contains metadata about this NFT (Ref: [ERC721 standard and OpenSea extension](https://docs.opensea.io/docs/metadata-standards)); _required_
* `uri_hash` is a hash of the document pointed by uri; _optional_
* `data` is an app specific data of the NFT. CAN be used by composing modules to specify additional properties of the NFT; _optional_

This ADR doesn't specify values that `data` can take; however, best practices recommend upper-level NFT modules clearly specify their contents.  Although the value of this field doesn't provide the additional context required to manage NFT records, which means that the field can technically be removed from the specification, the field's existence allows basic informational/UI functionality.

### `Keeper` Interface

```go
type Keeper interface {
  NewClass(ctx sdk.Context,class Class)
  UpdateClass(ctx sdk.Context,class Class)

  Mint(ctx sdk.Context,nft NFT，receiver sdk.AccAddress)   // 更新totalSupply
  BatchMint(ctx sdk.Context, tokens []NFT,receiver sdk.AccAddress) error

  Burn(ctx sdk.Context, classId string, nftId string)    // 更新totalSupply
  BatchBurn(ctx sdk.Context, classID string, nftIDs []string) error

  Update(ctx sdk.Context, nft NFT)
  BatchUpdate(ctx sdk.Context, tokens []NFT) error

  Transfer(ctx sdk.Context, classId string, nftId string, receiver sdk.AccAddress)
  BatchTransfer(ctx sdk.Context, classID string, nftIDs []string, receiver sdk.AccAddress) error

  GetClass(ctx sdk.Context, classId string) Class
  GetClasses(ctx sdk.Context) []Class

  GetNFT(ctx sdk.Context, classId string, nftId string) NFT
  GetNFTsOfClassByOwner(ctx sdk.Context, classId string, owner sdk.AccAddress) []NFT
  GetNFTsOfClass(ctx sdk.Context, classId string) []NFT

  GetOwner(ctx sdk.Context, classId string, nftId string) sdk.AccAddress
  GetBalance(ctx sdk.Context, classId string, owner sdk.AccAddress) uint64
  GetTotalSupply(ctx sdk.Context, classId string) uint64
}
```

Other business logic implementations should be defined in composing modules that import `x/nft` and use its `Keeper`.

### `Msg` Service

```protobuf
service Msg {
  rpc Send(MsgSend)         returns (MsgSendResponse);
}

message MsgSend {
  string class_id = 1;
  string id       = 2;
  string sender   = 3;
  string reveiver = 4;
}
message MsgSendResponse {}
```

`MsgSend` can be used to transfer the ownership of an NFT to another address.

The implementation outline of the server is as follows:

```go
type msgServer struct{
  k Keeper
}

func (m msgServer) Send(ctx context.Context, msg *types.MsgSend) (*types.MsgSendResponse, error) {
  // 检查当前所有权
  assertEqual(msg.Sender, m.k.GetOwner(msg.ClassId, msg.Id))

  // 转移所有权
  m.k.Transfer(msg.ClassId, msg.Id, msg.Receiver)

  return &types.MsgSendResponse{}, nil
}
```

The query service methods for the `x/nft` module are:

```protobuf
service Query {
  // Balance查询所有者拥有的给定类别的NFT数量，与ERC721中的balanceOf相同
  rpc Balance(QueryBalanceRequest) returns (QueryBalanceResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/balance/{owner}/{class_id}";
  }

  // Owner根据NFT的类别和标识符查询NFT的所有者，与ERC721中的ownerOf相同
  rpc Owner(QueryOwnerRequest) returns (QueryOwnerResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/owner/{class_id}/{id}";
  }

  // Supply查询给定类别的NFT数量，与ERC721中的totalSupply相同
  rpc Supply(QuerySupplyRequest) returns (QuerySupplyResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/supply/{class_id}";
  }

  // NFTs查询给定类别或所有者的所有NFT，至少选择其中之一，类似于ERC721Enumerable中的tokenByIndex
  rpc NFTs(QueryNFTsRequest) returns (QueryNFTsResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/nfts";
  }

  // NFT根据其类别和标识符查询NFT
  rpc NFT(QueryNFTRequest) returns (QueryNFTResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/nfts/{class_id}/{id}";
  }

  // Class根据其标识符查询NFT类别
  rpc Class(QueryClassRequest) returns (QueryClassResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/classes/{class_id}";
  }

  // Classes查询所有NFT类别
  rpc Classes(QueryClassesRequest) returns (QueryClassesResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/classes";
  }
}

// QueryBalanceRequest是Query/Balance RPC方法的请求类型
message QueryBalanceRequest {
  string class_id = 1;
  string owner    = 2;
}

// QueryBalanceResponse是Query/Balance RPC方法的响应类型
message QueryBalanceResponse {
  uint64 amount = 1;
}

// QueryOwnerRequest是Query/Owner RPC方法的请求类型
message QueryOwnerRequest {
  string class_id = 1;
  string id       = 2;
}

// QueryOwnerResponse是Query/Owner RPC方法的响应类型
message QueryOwnerResponse {
  string owner = 1;
}

// QuerySupplyRequest是Query/Supply RPC方法的请求类型
message QuerySupplyRequest {
  string class_id = 1;
}

// QuerySupplyResponse是Query/Supply RPC方法的响应类型
message QuerySupplyResponse {
  uint64 amount = 1;
}

// QueryNFTstRequest是Query/NFTs RPC方法的请求类型
message QueryNFTsRequest {
  string                                class_id   = 1;
  string                                owner      = 2;
  cosmos.base.query.v1beta1.PageRequest pagination = 3;
}

// QueryNFTsResponse是Query/NFTs RPC方法的响应类型
message QueryNFTsResponse {
  repeated cosmos.nft.v1beta1.NFT        nfts       = 1;
  cosmos.base.query.v1beta1.PageResponse pagination = 2;
}

// QueryNFTRequest是Query/NFT RPC方法的请求类型
message QueryNFTRequest {
  string class_id = 1;
  string id       = 2;
}

// QueryNFTResponse是Query/NFT RPC方法的响应类型
message QueryNFTResponse {
  cosmos.nft.v1beta1.NFT nft = 1;
}

// QueryClassRequest是Query/Class RPC方法的请求类型
message QueryClassRequest {
  string class_id = 1;
}

// QueryClassResponse是Query/Class RPC方法的响应类型
message QueryClassResponse {
  cosmos.nft.v1beta1.Class class = 1;
}

// QueryClassesRequest是Query/Classes RPC方法的请求类型
message QueryClassesRequest {
  // pagination定义了请求的可选分页。
  cosmos.base.query.v1beta1.PageRequest pagination = 1;
}

// QueryClassesResponse是Query/Classes RPC方法的响应类型
message QueryClassesResponse {
  repeated cosmos.nft.v1beta1.Class      classes    = 1;
  cosmos.base.query.v1beta1.PageResponse pagination = 2;
}
```

### 互操作性

互操作性是关于在模块和链之间重用资产。前者通过ADR-33实现：Protobuf客户端 - 服务器通信。在撰写本文时，ADR-33尚未最终确定。后者通过IBC实现。在这里，我们将重点关注IBC方面。
IBC是按模块实现的。在这里，我们确定NFT将在x/nft中记录和管理。这需要创建一个新的IBC标准并对其进行实现。

对于IBC互操作性，NFT自定义模块必须使用IBC客户端理解的NFT对象类型。因此，对于x/nft的互操作性，自定义的NFT实现（例如：x/cryptokitty）应该使用规范的x/nft模块，并将所有NFT余额保持功能代理给x/nft，或者使用IBC客户端理解的NFT对象类型重新实现所有功能。换句话说：x/nft成为所有Cosmos NFT的标准NFT注册表（例如：x/cryptokitty将在x/nft中注册一个kitty NFT，并使用x/nft进行账目管理）。这在使用x/bank作为通用资产余额账本的背景下进行了[讨论](https://github.com/cosmos/cosmos-sdk/discussions/9065#discussioncomment-873206)。如果不使用x/nft，将需要为IBC实现另一个模块。

## 结果

### 向后兼容性

没有向后不兼容性。

### 向前兼容性

此规范符合ERC-721智能合约规范的NFT标识符。请注意，ERC-721根据（合约地址，uint256 tokenId）定义唯一性，我们隐式地符合这一点，因为目前一个单独的模块旨在跟踪NFT标识符。注意：使用（可变的）数据字段来确定唯一性是不安全的。

### 积极影响

* Cosmos Hub上可用的NFT标识符。
* 能够为Cosmos Hub构建不同的NFT模块，例如ERC-721。
* 支持与IBC和其他跨链基础设施（如Gravity Bridge）的互操作性的NFT模块

### 负面影响

* 需要为x/nft创建新的IBC应用程序
* 需要CW721适配器

### 中性影响

* 其他功能需要更多的模块。例如，NFT交易功能需要一个托管模块，定义NFT属性需要一个可收藏模块。

## 进一步讨论

对于 Hub 上的其他类型应用，未来可以开发更多特定应用的模块：

* `x/nft/custody`：用于支持交易功能的 NFT 托管。
* `x/nft/marketplace`：使用 sdk.Coins 进行 NFT 的买卖。
* `x/fractional`：用于将资产（NFT 或其他资产）的所有权分割给多个利益相关者的模块。大多数情况下，`x/group` 应该可以满足需求。

Cosmos 生态系统中的其他网络可以为特定的 NFT 应用和用例设计和实现自己的 NFT 模块。

## 参考资料

* 初始讨论：https://github.com/cosmos/cosmos-sdk/discussions/9065
* x/nft：初始化模块：https://github.com/cosmos/cosmos-sdk/pull/9174
* [ADR 033](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-033-protobuf-inter-module-comm.md)


# ADR 43: NFT Module

## Changelog

* 2021-05-01: Initial Draft
* 2021-07-02: Review updates
* 2022-06-15: Add batch operation
* 2022-11-11: Remove strict validation of classID and tokenID

## Status

PROPOSED

## Abstract

This ADR defines the `x/nft` module which is a generic implementation of NFTs, roughly "compatible" with ERC721. **Applications using the `x/nft` module must implement the following functions**:

* `MsgNewClass` - Receive the user's request to create a class, and call the `NewClass` of the `x/nft` module.
* `MsgUpdateClass` - Receive the user's request to update a class, and call the `UpdateClass` of the `x/nft` module.
* `MsgMintNFT` - Receive the user's request to mint a nft, and call the `MintNFT` of the `x/nft` module.
* `BurnNFT` - Receive the user's request to burn a nft, and call the `BurnNFT` of the `x/nft` module.
* `UpdateNFT` - Receive the user's request to update a nft, and call the `UpdateNFT` of the `x/nft` module.

## Context

NFTs are more than just crypto art, which is very helpful for accruing value to the Cosmos ecosystem. As a result, Cosmos Hub should implement NFT functions and enable a unified mechanism for storing and sending the ownership representative of NFTs as discussed in https://github.com/cosmos/cosmos-sdk/discussions/9065.

As discussed in [#9065](https://github.com/cosmos/cosmos-sdk/discussions/9065), several potential solutions can be considered:

* irismod/nft and modules/incubator/nft
* CW721
* DID NFTs
* interNFT

Since functions/use cases of NFTs are tightly connected with their logic, it is almost impossible to support all the NFTs' use cases in one Cosmos SDK module by defining and implementing different transaction types.

Considering generic usage and compatibility of interchain protocols including IBC and Gravity Bridge, it is preferred to have a generic NFT module design which handles the generic NFTs logic.
This design idea can enable composability that application-specific functions should be managed by other modules on Cosmos Hub or on other Zones by importing the NFT module.

The current design is based on the work done by [IRISnet team](https://github.com/irisnet/irismod/tree/master/modules/nft) and an older implementation in the [Cosmos repository](https://github.com/cosmos/modules/tree/master/incubator/nft).

## Decision

We create a `x/nft` module, which contains the following functionality:

* Store NFTs and track their ownership.
* Expose `Keeper` interface for composing modules to transfer, mint and burn NFTs.
* Expose external `Message` interface for users to transfer ownership of their NFTs.
* Query NFTs and their supply information.

The proposed module is a base module for NFT app logic. It's goal it to provide a common layer for storage, basic transfer functionality and IBC. The module should not be used as a standalone.
Instead an app should create a specialized module to handle app specific logic (eg: NFT ID construction, royalty), user level minting and burning. Moreover an app specialized module should handle auxiliary data to support the app logic (eg indexes, ORM, business data).

All data carried over IBC must be part of the `NFT` or `Class` type described below. The app specific NFT data should be encoded in `NFT.data` for cross-chain integrity. Other objects related to NFT, which are not important for integrity can be part of the app specific module.

### Types

We propose two main types:

* `Class` -- describes NFT class. We can think about it as a smart contract address.
* `NFT` -- object representing unique, non fungible asset. Each NFT is associated with a Class.

#### Class

NFT **Class** is comparable to an ERC-721 smart contract (provides description of a smart contract), under which a collection of NFTs can be created and managed.

```protobuf
message Class {
  string id          = 1;
  string name        = 2;
  string symbol      = 3;
  string description = 4;
  string uri         = 5;
  string uri_hash    = 6;
  google.protobuf.Any data = 7;
}
```

* `id` is used as the primary index for storing the class; _required_
* `name` is a descriptive name of the NFT class; _optional_
* `symbol` is the symbol usually shown on exchanges for the NFT class; _optional_
* `description` is a detailed description of the NFT class; _optional_
* `uri` is a URI for the class metadata stored off chain. It should be a JSON file that contains metadata about the NFT class and NFT data schema ([OpenSea example](https://docs.opensea.io/docs/contract-level-metadata)); _optional_
* `uri_hash` is a hash of the document pointed by uri; _optional_
* `data` is app specific metadata of the class; _optional_

#### NFT

We define a general model for `NFT` as follows.

```protobuf
message NFT {
  string class_id           = 1;
  string id                 = 2;
  string uri                = 3;
  string uri_hash           = 4;
  google.protobuf.Any data  = 10;
}
```

* `class_id` is the identifier of the NFT class where the NFT belongs; _required_
* `id` is an identifier of the NFT, unique within the scope of its class. It is specified by the creator of the NFT and may be expanded to use DID in the future. `class_id` combined with `id` uniquely identifies an NFT and is used as the primary index for storing the NFT; _required_

  ```text
  {class_id}/{id} --> NFT (bytes)
  ```

* `uri` is a URI for the NFT metadata stored off chain. Should point to a JSON file that contains metadata about this NFT (Ref: [ERC721 standard and OpenSea extension](https://docs.opensea.io/docs/metadata-standards)); _required_
* `uri_hash` is a hash of the document pointed by uri; _optional_
* `data` is an app specific data of the NFT. CAN be used by composing modules to specify additional properties of the NFT; _optional_

This ADR doesn't specify values that `data` can take; however, best practices recommend upper-level NFT modules clearly specify their contents.  Although the value of this field doesn't provide the additional context required to manage NFT records, which means that the field can technically be removed from the specification, the field's existence allows basic informational/UI functionality.

### `Keeper` Interface

```go
type Keeper interface {
  NewClass(ctx sdk.Context,class Class)
  UpdateClass(ctx sdk.Context,class Class)

  Mint(ctx sdk.Context,nft NFT，receiver sdk.AccAddress)   // updates totalSupply
  BatchMint(ctx sdk.Context, tokens []NFT,receiver sdk.AccAddress) error

  Burn(ctx sdk.Context, classId string, nftId string)    // updates totalSupply
  BatchBurn(ctx sdk.Context, classID string, nftIDs []string) error

  Update(ctx sdk.Context, nft NFT)
  BatchUpdate(ctx sdk.Context, tokens []NFT) error

  Transfer(ctx sdk.Context, classId string, nftId string, receiver sdk.AccAddress)
  BatchTransfer(ctx sdk.Context, classID string, nftIDs []string, receiver sdk.AccAddress) error

  GetClass(ctx sdk.Context, classId string) Class
  GetClasses(ctx sdk.Context) []Class

  GetNFT(ctx sdk.Context, classId string, nftId string) NFT
  GetNFTsOfClassByOwner(ctx sdk.Context, classId string, owner sdk.AccAddress) []NFT
  GetNFTsOfClass(ctx sdk.Context, classId string) []NFT

  GetOwner(ctx sdk.Context, classId string, nftId string) sdk.AccAddress
  GetBalance(ctx sdk.Context, classId string, owner sdk.AccAddress) uint64
  GetTotalSupply(ctx sdk.Context, classId string) uint64
}
```

Other business logic implementations should be defined in composing modules that import `x/nft` and use its `Keeper`.

### `Msg` Service

```protobuf
service Msg {
  rpc Send(MsgSend)         returns (MsgSendResponse);
}

message MsgSend {
  string class_id = 1;
  string id       = 2;
  string sender   = 3;
  string reveiver = 4;
}
message MsgSendResponse {}
```

`MsgSend` can be used to transfer the ownership of an NFT to another address.

The implementation outline of the server is as follows:

```go
type msgServer struct{
  k Keeper
}

func (m msgServer) Send(ctx context.Context, msg *types.MsgSend) (*types.MsgSendResponse, error) {
  // check current ownership
  assertEqual(msg.Sender, m.k.GetOwner(msg.ClassId, msg.Id))

  // transfer ownership
  m.k.Transfer(msg.ClassId, msg.Id, msg.Receiver)

  return &types.MsgSendResponse{}, nil
}
```

The query service methods for the `x/nft` module are:

```protobuf
service Query {
  // Balance queries the number of NFTs of a given class owned by the owner, same as balanceOf in ERC721
  rpc Balance(QueryBalanceRequest) returns (QueryBalanceResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/balance/{owner}/{class_id}";
  }

  // Owner queries the owner of the NFT based on its class and id, same as ownerOf in ERC721
  rpc Owner(QueryOwnerRequest) returns (QueryOwnerResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/owner/{class_id}/{id}";
  }

  // Supply queries the number of NFTs from the given class, same as totalSupply of ERC721.
  rpc Supply(QuerySupplyRequest) returns (QuerySupplyResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/supply/{class_id}";
  }

  // NFTs queries all NFTs of a given class or owner,choose at least one of the two, similar to tokenByIndex in ERC721Enumerable
  rpc NFTs(QueryNFTsRequest) returns (QueryNFTsResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/nfts";
  }

  // NFT queries an NFT based on its class and id.
  rpc NFT(QueryNFTRequest) returns (QueryNFTResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/nfts/{class_id}/{id}";
  }

  // Class queries an NFT class based on its id
  rpc Class(QueryClassRequest) returns (QueryClassResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/classes/{class_id}";
  }

  // Classes queries all NFT classes
  rpc Classes(QueryClassesRequest) returns (QueryClassesResponse) {
    option (google.api.http).get = "/cosmos/nft/v1beta1/classes";
  }
}

// QueryBalanceRequest is the request type for the Query/Balance RPC method
message QueryBalanceRequest {
  string class_id = 1;
  string owner    = 2;
}

// QueryBalanceResponse is the response type for the Query/Balance RPC method
message QueryBalanceResponse {
  uint64 amount = 1;
}

// QueryOwnerRequest is the request type for the Query/Owner RPC method
message QueryOwnerRequest {
  string class_id = 1;
  string id       = 2;
}

// QueryOwnerResponse is the response type for the Query/Owner RPC method
message QueryOwnerResponse {
  string owner = 1;
}

// QuerySupplyRequest is the request type for the Query/Supply RPC method
message QuerySupplyRequest {
  string class_id = 1;
}

// QuerySupplyResponse is the response type for the Query/Supply RPC method
message QuerySupplyResponse {
  uint64 amount = 1;
}

// QueryNFTstRequest is the request type for the Query/NFTs RPC method
message QueryNFTsRequest {
  string                                class_id   = 1;
  string                                owner      = 2;
  cosmos.base.query.v1beta1.PageRequest pagination = 3;
}

// QueryNFTsResponse is the response type for the Query/NFTs RPC methods
message QueryNFTsResponse {
  repeated cosmos.nft.v1beta1.NFT        nfts       = 1;
  cosmos.base.query.v1beta1.PageResponse pagination = 2;
}

// QueryNFTRequest is the request type for the Query/NFT RPC method
message QueryNFTRequest {
  string class_id = 1;
  string id       = 2;
}

// QueryNFTResponse is the response type for the Query/NFT RPC method
message QueryNFTResponse {
  cosmos.nft.v1beta1.NFT nft = 1;
}

// QueryClassRequest is the request type for the Query/Class RPC method
message QueryClassRequest {
  string class_id = 1;
}

// QueryClassResponse is the response type for the Query/Class RPC method
message QueryClassResponse {
  cosmos.nft.v1beta1.Class class = 1;
}

// QueryClassesRequest is the request type for the Query/Classes RPC method
message QueryClassesRequest {
  // pagination defines an optional pagination for the request.
  cosmos.base.query.v1beta1.PageRequest pagination = 1;
}

// QueryClassesResponse is the response type for the Query/Classes RPC method
message QueryClassesResponse {
  repeated cosmos.nft.v1beta1.Class      classes    = 1;
  cosmos.base.query.v1beta1.PageResponse pagination = 2;
}
```

### Interoperability

Interoperability is all about reusing assets between modules and chains. The former one is achieved by ADR-33: Protobuf client - server communication. At the time of writing ADR-33 is not finalized. The latter is achieved by IBC. Here we will focus on the IBC side.
IBC is implemented per module. Here, we aligned that NFTs will be recorded and managed in the x/nft. This requires creation of a new IBC standard and implementation of it.

For IBC interoperability, NFT custom modules MUST use the NFT object type understood by the IBC client. So, for x/nft interoperability, custom NFT implementations (example: x/cryptokitty) should use the canonical x/nft module and proxy all NFT balance keeping functionality to x/nft or else re-implement all functionality using the NFT object type understood by the IBC client. In other words: x/nft becomes the standard NFT registry for all Cosmos NFTs (example: x/cryptokitty will register a kitty NFT in x/nft and use x/nft for book keeping). This was [discussed](https://github.com/cosmos/cosmos-sdk/discussions/9065#discussioncomment-873206) in the context of using x/bank as a general asset balance book. Not using x/nft will require implementing another module for IBC.

## Consequences

### Backward Compatibility

No backward incompatibilities.

### Forward Compatibility

This specification conforms to the ERC-721 smart contract specification for NFT identifiers. Note that ERC-721 defines uniqueness based on (contract address, uint256 tokenId), and we conform to this implicitly because a single module is currently aimed to track NFT identifiers. Note: use of the (mutable) data field to determine uniqueness is not safe.s

### Positive

* NFT identifiers available on Cosmos Hub.
* Ability to build different NFT modules for the Cosmos Hub, e.g., ERC-721.
* NFT module which supports interoperability with IBC and other cross-chain infrastructures like Gravity Bridge

### Negative

* New IBC app is required for x/nft
* CW721 adapter is required

### Neutral

* Other functions need more modules. For example, a custody module is needed for NFT trading function, a collectible module is needed for defining NFT properties.

## Further Discussions

For other kinds of applications on the Hub, more app-specific modules can be developed in the future:

* `x/nft/custody`: custody of NFTs to support trading functionality.
* `x/nft/marketplace`: selling and buying NFTs using sdk.Coins.
* `x/fractional`: a module to split an ownership of an asset (NFT or other assets) for multiple stakeholder. `x/group`  should work for most of the cases.

Other networks in the Cosmos ecosystem could design and implement their own NFT modules for specific NFT applications and use cases.

## References

* Initial discussion: https://github.com/cosmos/cosmos-sdk/discussions/9065
* x/nft: initialize module: https://github.com/cosmos/cosmos-sdk/pull/9174
* [ADR 033](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-033-protobuf-inter-module-comm.md)
