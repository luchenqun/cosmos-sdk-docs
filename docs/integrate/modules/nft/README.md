# `x/nft`

## 内容

## 摘要

`x/nft` 是 Cosmos SDK 模块的实现，根据 [ADR 43](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-043-nft-module.md)，它允许您创建 NFT 分类、创建 NFT、转移 NFT、更新 NFT，并通过集成该模块支持各种查询。它与 ERC721 规范完全兼容。

* [概念](#概念)
    * [分类](#分类)
    * [NFT](#nft)
* [状态](#状态)
    * [分类](#分类-1)
    * [NFT](#nft-1)
    * [按所有者分类的 NFT](#按所有者分类的-nft)
    * [所有者](#所有者)
    * [总供应量](#总供应量)
* [消息](#消息)
    * [MsgSend](#msgsend)
* [事件](#事件)

## 概念

### 分类

`x/nft` 模块定义了一个结构体 `分类`，用于描述一类 NFT 的共同特征，在这个分类下，您可以创建各种 NFT，相当于以太坊的 ERC721 合约。该设计在 [ADR 043](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-043-nft-module.md) 中定义。

### NFT

NFT 的全称是不可替代代币（Non-Fungible Tokens）。由于 NFT 的不可替代性，它可以用来代表独特的事物。该模块实现的 NFT 与以太坊的 ERC721 标准完全兼容。

## 状态

### 分类

分类主要由 `id`、`name`、`symbol`、`description`、`uri`、`uri_hash` 和 `data` 组成，其中 `id` 是分类的唯一标识符，类似于以太坊的 ERC721 合约地址，其他字段是可选的。

* 分类：`0x01 | classID | -> ProtocolBuffer(Class)`

### NFT

NFT 主要由 `class_id`、`id`、`uri`、`uri_hash` 和 `data` 组成。其中，`class_id` 和 `id` 是用于标识 NFT 唯一性的二元组，`uri` 和 `uri_hash` 是可选的，用于标识 NFT 的链外存储位置，`data` 是 Any 类型。通过扩展此字段，可以使用 `x/nft` 模块的 Any 链进行自定义。

* NFT：`0x02 | classID | 0x00 | nftID |-> ProtocolBuffer(NFT)`

### 按所有者分类的 NFT

按所有者分类的 NFT 主要实现了使用 classID 和所有者查询所有 NFT 的功能，没有其他多余的功能。

* NFTOfClassByOwner: `0x03 | owner | 0x00 | classID | 0x00 | nftID |-> 0x01`

### 所有者

由于 NFT 中没有额外的字段来指示 NFT 的所有者，因此使用额外的键值对来保存 NFT 的所有权。随着 NFT 的转移，键值对会同步更新。

* OwnerKey: `0x04 | classID | 0x00  | nftID |-> owner`

### 总供应量

总供应量负责跟踪特定类别下所有 NFT 的数量。在更改类别下进行铸造操作时，供应量增加一，进行销毁操作时，供应量减少一。

* OwnerKey: `0x05 | classID |-> totalSupply`

## 消息

在本节中，我们描述了 NFT 模块的消息处理。

:::warning
`ClassID` 和 `NftID` 的验证由应用程序开发人员负责。  
SDK 不对这些字段进行任何验证。
:::

### MsgSend

您可以使用 `MsgSend` 消息来转移 NFT 的所有权。这是 `x/nft` 模块提供的一个功能。当然，您也可以使用 `Transfer` 方法来实现自己的转移逻辑，但是需要额外注意转移权限。

如果出现以下情况，消息处理应该失败：

* 提供的 `ClassID` 不存在。
* 提供的 `Id` 不存在。
* 提供的 `Sender` 不是 NFT 的所有者。

## 事件

NFT 模块发出的 proto 事件在 [Protobuf 参考文档](https://buf.build/cosmos/cosmos-sdk/docs/main:cosmos.nft.v1beta1) 中定义。




# `x/nft`

## Contents

## Abstract

`x/nft` is an implementation of a Cosmos SDK module, per [ADR 43](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-043-nft-module.md), that allows you to create nft classification, create nft, transfer nft, update nft, and support various queries by integrating the module. It is fully compatible with the ERC721 specification.

* [Concepts](#concepts)
    * [Class](#class)
    * [NFT](#nft)
* [State](#state)
    * [Class](#class-1)
    * [NFT](#nft-1)
    * [NFTOfClassByOwner](#nftofclassbyowner)
    * [Owner](#owner)
    * [TotalSupply](#totalsupply)
* [Messages](#messages)
    * [MsgSend](#msgsend)
* [Events](#events)

## Concepts

### Class

`x/nft` module defines a struct `Class` to describe the common characteristics of a class of nft, under this class, you can create a variety of nft, which is equivalent to an erc721 contract for Ethereum. The design is defined in the [ADR 043](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-043-nft-module.md).

### NFT

The full name of NFT is Non-Fungible Tokens. Because of the irreplaceable nature of NFT, it means that it can be used to represent unique things. The nft implemented by this module is fully compatible with Ethereum ERC721 standard.

## State

### Class

Class is mainly composed of `id`, `name`, `symbol`, `description`, `uri`, `uri_hash`,`data` where `id` is the unique identifier of the class, similar to the Ethereum ERC721 contract address, the others are optional.

* Class: `0x01 | classID | -> ProtocolBuffer(Class)`

### NFT

NFT is mainly composed of `class_id`, `id`, `uri`, `uri_hash` and `data`. Among them, `class_id` and `id` are two-tuples that identify the uniqueness of nft, `uri` and `uri_hash` is optional, which identifies the off-chain storage location of the nft, and `data` is an Any type. Use Any chain of `x/nft` modules can be customized by extending this field

* NFT: `0x02 | classID | 0x00 | nftID |-> ProtocolBuffer(NFT)`

### NFTOfClassByOwner

NFTOfClassByOwner is mainly to realize the function of querying all nfts using classID and owner, without other redundant functions.

* NFTOfClassByOwner: `0x03 | owner | 0x00 | classID | 0x00 | nftID |-> 0x01`

### Owner

Since there is no extra field in NFT to indicate the owner of nft, an additional key-value pair is used to save the ownership of nft. With the transfer of nft, the key-value pair is updated synchronously.

* OwnerKey: `0x04 | classID | 0x00  | nftID |-> owner`

### TotalSupply

TotalSupply is responsible for tracking the number of all nfts under a certain class. Mint operation is performed under the changed class, supply increases by one, burn operation, and supply decreases by one.

* OwnerKey: `0x05 | classID |-> totalSupply`

## Messages

In this section we describe the processing of messages for the NFT module.

:::warning
The validation of `ClassID` and `NftID` is left to the app developer.  
The SDK does not provide any validation for these fields.
:::

### MsgSend

You can use the `MsgSend` message to transfer the ownership of nft. This is a function provided by the `x/nft` module. Of course, you can use the `Transfer` method to implement your own transfer logic, but you need to pay extra attention to the transfer permissions.

The message handling should fail if:

* provided `ClassID` does not exist.
* provided `Id` does not exist.
* provided `Sender` does not the owner of nft.

## Events

The nft module emits proto events defined in [the Protobuf reference](https://buf.build/cosmos/cosmos-sdk/docs/main:cosmos.nft.v1beta1).
