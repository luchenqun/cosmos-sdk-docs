# 模块 depinject-ready

:::note

### 先决条件阅读

* [Depinject 文档](../libraries/01-depinject.md)

:::

[`depinject`](../libraries/01-depinject.md) 用于在 `app.go` 中连接任何模块。
所有核心模块已经配置好以支持依赖注入。

要使用 `depinject`，模块必须定义其配置和需求，以便 `depinject` 可以提供正确的依赖项。

简而言之，作为模块开发者，需要执行以下步骤：

1. 使用 Protobuf 定义模块配置
2. 在 `x/{moduleName}/module.go` 中定义模块依赖项

然后，链开发者可以按照以下两个步骤使用该模块：

1. 在 `app_config.go` 或 `app.yaml` 中配置模块
2. 在 `app.go` 中注入模块

## 模块配置

模块可用的配置在 Protobuf 文件中定义，位于 `{moduleName}/module/v1/module.proto`。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/module/v1/module.proto
```

* `go_import` 必须指向自定义模块的 Go 包。
* 消息字段定义了模块配置。
  链开发者可以在 `app_config.go` / `app.yaml` 文件中设置该配置，以配置模块。
  以 `group` 为例，链开发者可以通过 `uint64 max_metadata_len` 决定组提案的最大元数据长度。

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_config.go#L226-L230
  ```

That message is generated using [`pulsar`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/scripts/protocgen-pulsar.sh) (by running `make proto-gen`).
In the case of the `group` module, this file is generated here: https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/api/cosmos/group/module/v1/module.pulsar.go.

The part that is relevant for the module configuration is:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/api/cosmos/group/module/v1/module.pulsar.go#L515-L527
```

:::note
Pulsar is optional. The official [`protoc-gen-go`](https://developers.google.com/protocol-buffers/docs/reference/go-generated) can be used as well.
:::

## Dependency Definition

Once the configuration proto is defined, the module's `module.go` must define what dependencies are required by the module.
The boilerplate is similar for all modules.

:::warning
All methods, structs and their fields must be public for `depinject`.
:::

1. Import the module configuration generated package:

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L12-L14
  ```

  Define an `init()` function for defining the `providers` of the module configuration:  
  This registers the module configuration message and the wiring of the module.

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L199-L204
  ```

2. Ensure that the module implements the `appmodule.AppModule` interface:

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0/x/group/module/module.go#L58-L64
  ```

3. Define a struct that inherits `depinject.In` and define the module inputs (i.e. module dependencies):
   * `depinject` provides the right dependencies to the module.
   * `depinject` also checks that all dependencies are provided.

  :::tip
  For making a dependency optional, add the `optional:"true"` struct tag.  
  :::

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L206-L216
  ```

4. Define the module outputs with a public struct that inherits `depinject.Out`:
   The module outputs are the dependencies that the module provides to other modules. It is usually the module itself and its keeper.

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L218-L223
  ```

5. Create a function named `ProvideModule` (as called in 1.) and use the inputs for instantiating the module outputs.

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L225-L235
  ```

The `ProvideModule` function should return an instance of `cosmossdk.io/core/appmodule.AppModule` which implements
one or more app module extension interfaces for initializing the module.

Following is the complete app wiring configuration for `group`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L195-L235
```

该模块现在已经准备好供链开发者使用。

## 集成到应用程序中

应用程序的连接工作在 `app_config.go` / `app.yaml` 和 `app_v2.go` 中完成，详细说明在[ `app_v2.go` 概述](../building-apps/01-app-go-v2.md)中解释。




# Modules depinject-ready

:::note

### Pre-requisite Readings

* [Depinject Documentation](../libraries/01-depinject.md)

:::

[`depinject`](../libraries/01-depinject.md) is used to wire any module in `app.go`.
All core modules are already configured to support dependency injection.

To work with `depinject` a module must define its configuration and requirements so that `depinject` can provide the right dependencies.

In brief, as a module developer, the following steps are required:

1. Define the module configuration using Protobuf
2. Define the module dependencies in `x/{moduleName}/module.go`

A chain developer can then use the module by following these two steps:

1. Configure the module in `app_config.go` or `app.yaml`
2. Inject the module in `app.go`

## Module Configuration

The module available configuration is defined in a Protobuf file, located at `{moduleName}/module/v1/module.proto`.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/group/module/v1/module.proto
```

* `go_import` must point to the Go package of the custom module.
* Message fields define the module configuration.
  That configuration can be set in the `app_config.go` / `app.yaml` file for a chain developer to configure the module.  
  Taking `group` as example, a chain developer is able to decide, thanks to `uint64 max_metadata_len`, what the maximum metatada length allowed for a group porposal is.

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app_config.go#L226-L230
  ```

That message is generated using [`pulsar`](https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/scripts/protocgen-pulsar.sh) (by running `make proto-gen`).
In the case of the `group` module, this file is generated here: https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/api/cosmos/group/module/v1/module.pulsar.go.

The part that is relevant for the module configuration is:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/api/cosmos/group/module/v1/module.pulsar.go#L515-L527
```

:::note
Pulsar is optional. The official [`protoc-gen-go`](https://developers.google.com/protocol-buffers/docs/reference/go-generated) can be used as well.
:::

## Dependency Definition

Once the configuration proto is defined, the module's `module.go` must define what dependencies are required by the module.
The boilerplate is similar for all modules.

:::warning
All methods, structs and their fields must be public for `depinject`.
:::

1. Import the module configuration generated package:

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L12-L14
  ```

  Define an `init()` function for defining the `providers` of the module configuration:  
  This registers the module configuration message and the wiring of the module.

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L199-L204
  ```

2. Ensure that the module implements the `appmodule.AppModule` interface:

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0/x/group/module/module.go#L58-L64
  ```

3. Define a struct that inherits `depinject.In` and define the module inputs (i.e. module dependencies):
   * `depinject` provides the right dependencies to the module.
   * `depinject` also checks that all dependencies are provided.

  :::tip
  For making a dependency optional, add the `optional:"true"` struct tag.  
  :::

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L206-L216
  ```

4. Define the module outputs with a public struct that inherits `depinject.Out`:
   The module outputs are the dependencies that the module provides to other modules. It is usually the module itself and its keeper.

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L218-L223
  ```

5. Create a function named `ProvideModule` (as called in 1.) and use the inputs for instantiating the module outputs.

  ```go reference
  https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L225-L235
  ```

The `ProvideModule` function should return an instance of `cosmossdk.io/core/appmodule.AppModule` which implements
one or more app module extension interfaces for initializing the module.

Following is the complete app wiring configuration for `group`:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/x/group/module/module.go#L195-L235
```

The module is now ready to be used with `depinject` by a chain developer.

## Integrate in an application

The App Wiring is done in `app_config.go` / `app.yaml` and `app_v2.go` and is explained in detail in the [overview of `app_v2.go`](../building-apps/01-app-go-v2.md).
