# 包

Cosmos SDK 是一组 Go 模块。本节提供了在开发 Cosmos SDK 链时可以使用的各种包的文档。
它列出了 Cosmos SDK 的所有独立 Go 模块。

:::tip
有关 SDK 模块的更多信息，请参阅 [SDK 模块](https://docs.cosmos.network/main/modules) 部分。
有关 SDK 工具的更多信息，请参阅 [工具](https://docs.cosmos.network/main/tooling) 部分。
:::

## 核心

* [核心](https://pkg.go.dev/cosmossdk.io/core) - 定义 SDK 接口的核心库 ([ADR-063](https://docs.cosmos.network/main/architecture/adr-063-core-module-api))
* [API](https://pkg.go.dev/cosmossdk.io/api) - 包含生成的 SDK Pulsar API 的 API 库
* [存储](https://pkg.go.dev/cosmossdk.io/store) - Cosmos SDK 存储的实现

## 状态管理

* [集合](02-collections.md) - 状态管理库
* [ORM](03-orm.md) - 状态管理库

## 自动化

* [Depinject](01-depinject.md) - 依赖注入框架
* [Client/v2](https://pkg.go.dev/cosmossdk.io/client/v2) - 驱动 [AutoCLI](https://docs.cosmos.network/main/building-modules/autocli) 的库

## 实用工具

* [日志](https://pkg.go.dev/cosmossdk.io/log) - 日志记录库
* [错误](https://pkg.go.dev/cosmossdk.io/errors) - 错误处理库
* [数学](https://pkg.go.dev/cosmossdk.io/math) - 用于 SDK 算术操作的数学库

## 示例

* [SimApp](https://pkg.go.dev/cosmossdk.io/simapp) - SimApp 是**样例** Cosmos SDK 链。此包不应在您的应用程序中导入。



# Packages

The Cosmos SDK is a collection of Go modules. This section provides documentation on various packages that can used when developing a Cosmos SDK chain.
It lists all standalone Go modules that are part of the Cosmos SDK.

:::tip
For more information on SDK modules, see the [SDK Modules](https://docs.cosmos.network/main/modules) section.
For more information on SDK tooling, see the [Tooling](https://docs.cosmos.network/main/tooling) section.
:::

## Core

* [Core](https://pkg.go.dev/cosmossdk.io/core) - Core library defining SDK interfaces ([ADR-063](https://docs.cosmos.network/main/architecture/adr-063-core-module-api))
* [API](https://pkg.go.dev/cosmossdk.io/api) - API library containing generated SDK Pulsar API
* [Store](https://pkg.go.dev/cosmossdk.io/store) - Implementation of the Cosmos SDK store

## State Management

* [Collections](02-collections.md) - State management library
* [ORM](03-orm.md) - State management library

## Automation

* [Depinject](01-depinject.md) - Dependency injection framework
* [Client/v2](https://pkg.go.dev/cosmossdk.io/client/v2) - Library powering [AutoCLI](https://docs.cosmos.network/main/building-modules/autocli)

## Utilities

* [Log](https://pkg.go.dev/cosmossdk.io/log) - Logging library
* [Errors](https://pkg.go.dev/cosmossdk.io/errors) - Error handling library
* [Math](https://pkg.go.dev/cosmossdk.io/math) - Math library for SDK arithmetic operations

## Example

* [SimApp](https://pkg.go.dev/cosmossdk.io/simapp) - SimApp is **the** sample Cosmos SDK chain. This package should not be imported in your application.
