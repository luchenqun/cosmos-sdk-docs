# AutoCLI

:::note 概述
本文档详细介绍了如何为模块构建 CLI 和 REST 接口。其中包括了来自各种 Cosmos SDK 模块的示例。
:::

:::note

## 先决条件阅读

* [构建模块简介](../building-modules/00-intro.md)

:::

`autocli` 包是一个用于为基于 Cosmos SDK 的应用程序生成 CLI（命令行界面）接口的 [Go 库](https://pkg.go.dev/cosmossdk.io/client/v2/autocli)。它通过根据您的 gRPC 服务定义自动生成 CLI 命令，为您的应用程序提供了一种简单的方式来添加 CLI 命令。`autocli` 会直接从您的 protobuf 消息中生成 CLI 命令和标志，包括选项、输入参数和输出参数。这意味着您可以轻松地为您的应用程序添加 CLI 接口，而无需手动创建和管理命令。

## 入门指南

以下是使用 `autocli` 包的步骤：

1. 定义实现 `appmodule.AppModule` 接口的应用程序模块。
2. 通过在模块上实现 `func (am AppModule) AutoCLIOptions() *autocliv1.ModuleOptions` 方法，配置 `autocli` 命令生成的行为。了解更多信息，请参阅[此处](#高级用法)。
3. 使用 `autocli.AppOptions` 结构指定您定义的模块。如果您使用 `depinject` 包来管理应用程序的依赖关系，它可以根据应用程序的配置自动创建 `autocli.AppOptions` 的实例。
4. 使用 `autocli` 提供的 `EnhanceRootCommand()` 方法，将指定模块的 CLI 命令添加到您的根命令中。该方法还可以在 `client/v2/autocli/app.go` 文件中找到。此外，该方法还将 `autocli` 功能添加到您的应用程序的根命令中。该方法仅是增量的，这意味着如果已经为某个模块注册了命令，则不会创建命令。相反，它会将任何缺失的命令添加到根命令中。

以下是如何使用 `autocli` 的示例：

``` go
// Define your app's modules
testModules := map[string]appmodule.AppModule{
    "testModule": &TestModule{},
}

// Define the autocli AppOptions
autoCliOpts := autocli.AppOptions{
    Modules: testModules,
}

// Get the root command
rootCmd := &cobra.Command{
    Use: "app",
}

// Enhance the root command with autocli
autocli.EnhanceRootCommand(rootCmd, autoCliOpts)

// Run the root command
if err := rootCmd.Execute(); err != nil {
    fmt.Println(err)
}
```

## 标志

`autocli` 为 protobuf 消息中的每个字段生成标志。默认情况下，标志的名称是根据消息中字段的名称生成的。您可以使用 `Builder.AddMessageFlags()` 方法的 `namingOptions` 参数自定义标志名称。

定义消息的标志，您可以使用`Builder.AddMessageFlags()`方法。此方法接受`cobra.Command`实例和消息类型作为输入，并为消息中的每个字段生成标志。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/1ac260cb1c6f05666f47e67f8b2cfd6229a55c3b/client/v2/autocli/common.go#L44-L49
```

`AddMessageFlags()`方法返回的`binder`变量用于将命令行参数绑定到消息中的字段。

您还可以使用`Builder.AddMessageFlags()`方法的`namingOptions`参数自定义标志的行为。此参数允许您指定标志的自定义前缀，并指定是否为重复字段生成标志以及是否为具有默认值的字段生成标志。

## 命令和查询

`autocli`包为您的gRPC服务中定义的每个方法生成CLI命令和标志。默认情况下，它为不返回消息流的每个RPC方法生成命令。命令的名称基于服务方法的名称。

例如，给定以下用于服务的protobuf定义：

```protobuf
service MyService {
  rpc MyMethod(MyRequest) returns (MyResponse) {}
}
```

`autocli`将为`MyMethod`方法生成一个名为`my-method`的命令。该命令将为`MyRequest`消息中的每个字段生成标志。

如果您想自定义命令的行为，可以通过实现`autocli.Command`接口来定义自定义命令。然后，您可以将该命令注册到您的应用程序的`autocli.Builder`实例中。

类似地，您可以通过实现`autocli.Query`接口来定义自定义查询。然后，您可以将该查询注册到您的应用程序的`autocli.Builder`实例中。

要添加自定义命令或查询，可以使用`Builder.AddCustomCommand`或`Builder.AddCustomQuery`方法。这些方法分别接受`cobra.Command`或`cobra.Command`实例，可用于定义命令或查询的行为。

## 高级用法

### 指定子命令

默认情况下，`autocli` 会为 gRPC 服务中的每个方法生成一个命令。但是，您可以指定子命令来将相关的命令分组在一起。要指定子命令，您可以使用 `autocliv1.ServiceCommandDescriptor` 结构体。

以下示例展示了如何使用 `autocliv1.ServiceCommandDescriptor` 结构体来将相关的命令分组在一起，并在您的 gRPC 服务中指定子命令。您需要在 `autocli.go` 文件中定义 `autocliv1.ModuleOptions` 的实例。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/bcdf81cbaf8d70c4e4fa763f51292d54aed689fd/x/gov/autocli.go#L9-L27
```

`autocli` 包中的 `AutoCLIOptions()` 方法允许您指定要映射到应用程序的服务和子命令。在示例代码中，`autocliv1.ModuleOptions` 结构体的实例被定义在 `x/gov/autocli.go` 文件中的 `appmodule.AppModule` 实现中。此配置将相关的命令分组在一起，并为每个服务指定了子命令。

### 位置参数

位置参数是在不被指定为标志的情况下传递给命令的参数。它们通常用于为命令提供附加的上下文，例如文件名或搜索查询。

要向命令添加位置参数，您可以使用 `autocliv1.PositionalArgDescriptor` 结构体，如下面的示例所示。您需要指定 `ProtoField` 参数，该参数是应作为位置参数使用的 protobuf 字段的名称。此外，如果参数是可变长度参数，则可以将 `Varargs` 参数指定为 `true`。这只能应用于最后一个位置参数，并且 `ProtoField` 必须是一个重复字段。

以下是如何为 `auth` 服务的 `Account` 方法定义位置参数的示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/bcdf81cbaf8d70c4e4fa763f51292d54aed689fd/x/auth/autocli.go#L8-L32
```

以下是使用我们上面定义的位置参数的一些示例命令：

查询账户地址：

```bash
<appd> query auth account cosmos1abcd...xyz
```

通过账户号码查询账户地址：

```bash
<appd> query auth address-by-acc-num 1
```

在这两个命令中，使用 `auth` 服务进行查询，使用 `query` 子命令，后跟调用的具体方法（`account` 或 `address-by-acc-num`）。位置参数包含在命令的末尾（`cosmos1abcd...xyz` 或 `1`），分别指定地址或账户号码。

### 自定义标志名称

默认情况下，`autocli` 根据您的 protobuf 消息中字段的名称生成标志名称。但是，您可以通过向 `Builder.AddMessageFlags()` 方法提供 `FlagOptions` 参数来自定义标志名称。该参数允许您根据消息字段的名称指定自定义标志的名称。例如，如果您有一个包含字段 `test` 和 `test1` 的消息，您可以使用以下命名选项来自定义标志

``` go
options := autocliv1.RpcCommandOptions{ 
    FlagOptions: map[string]*autocliv1.FlagOptions{ 
        "test": { Name: "custom_name", }, 
        "test1": { Name: "other_name", }, 
    }, 
}

builder.AddMessageFlags(message, options)
```

请注意，`autocliv1.RpcCommandOptions` 是 `autocliv1.ServiceCommandDescriptor` 结构体的一个字段，该结构体在 `autocliv1` 包中定义。要使用此选项，您可以在 `appmodule.AppModule` 实现中定义 `autocliv1.ModuleOptions` 的实例，并为相关的服务命令描述符指定 `FlagOptions`。

## 结论

`autocli` 是一个强大的工具，可为基于 Cosmos SDK 的应用程序添加 CLI 接口。它允许您轻松地从 protobuf 消息生成 CLI 命令和标志，并提供许多选项来自定义 CLI 应用程序的行为。

要进一步提升基于 Cosmos SDK 的区块链的 CLI 体验，您可以使用 `Hubl`。`Hubl` 是一个工具，允许您使用 Cosmos SDK 的新 AutoCLI 功能查询任何基于 Cosmos SDK 的区块链。使用 hubl，您可以轻松配置一个新的链，并仅使用几个简单的命令查询模块。

有关 `Hubl` 的更多信息，包括如何配置新链和查询模块，请参阅 [Hubl 文档](https://docs.cosmos.network/main/tooling/hubl)。

Please paste the Markdown content here.





# AutoCLI

:::note Synopsis
This document details how to build CLI and REST interfaces for a module. Examples from various Cosmos SDK modules are included.
:::

:::note

## Pre-requisite Readings

* [Building Modules Intro](../building-modules/00-intro.md)

:::

The `autocli` package is a [Go library](https://pkg.go.dev/cosmossdk.io/client/v2/autocli) for generating CLI (command line interface) interfaces for Cosmos SDK-based applications. It provides a simple way to add CLI commands to your application by generating them automatically based on your gRPC service definitions. Autocli generates CLI commands and flags directly from your protobuf messages, including options, input parameters, and output parameters. This means that you can easily add a CLI interface to your application without having to manually create and manage commands.

## Getting Started

Here are the steps to use the `autocli` package:

1. Define your app's modules that implement the `appmodule.AppModule` interface.
2. Configure how behave `autocli` command generation, by implementing the `func (am AppModule) AutoCLIOptions() *autocliv1.ModuleOptions` method on the module. Learn more [here](#advanced-usage).
3. Use the `autocli.AppOptions` struct to specifies the modules you defined. If you are using the `depinject` package to manage your app's dependencies, it can automatically create an instance of `autocli.AppOptions` based on your app's configuration.
4. Use the `EnhanceRootCommand()` method provided by `autocli` to add the CLI commands for the specified modules to your root command and can also be found in the `client/v2/autocli/app.go` file. Additionally, this method adds the `autocli` functionality to your app's root command. This method is additive only, meaning that it does not create commands if they are already registered for a module. Instead, it adds any missing commands to the root command.

Here's an example of how to use `autocli`:

``` go
// Define your app's modules
testModules := map[string]appmodule.AppModule{
    "testModule": &TestModule{},
}

// Define the autocli AppOptions
autoCliOpts := autocli.AppOptions{
    Modules: testModules,
}

// Get the root command
rootCmd := &cobra.Command{
    Use: "app",
}

// Enhance the root command with autocli
autocli.EnhanceRootCommand(rootCmd, autoCliOpts)

// Run the root command
if err := rootCmd.Execute(); err != nil {
    fmt.Println(err)
}
```

## Flags

`autocli` generates flags for each field in a protobuf message. By default, the names of the flags are generated based on the names of the fields in the message. You can customise the flag names using the `namingOptions` parameter of the `Builder.AddMessageFlags()` method.

To define flags for a message, you can use the `Builder.AddMessageFlags()` method. This method takes the `cobra.Command` instance and the message type as input, and generates flags for each field in the message.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/1ac260cb1c6f05666f47e67f8b2cfd6229a55c3b/client/v2/autocli/common.go#L44-L49
```

The `binder` variable returned by the `AddMessageFlags()` method is used to bind the command-line arguments to the fields in the message.

You can also customise the behavior of the flags using the `namingOptions` parameter of the `Builder.AddMessageFlags()` method. This parameter allows you to specify a custom prefix for the flags, and to specify whether to generate flags for repeated fields and whether to generate flags for fields with default values.

## Commands and Queries

The `autocli` package generates CLI commands and flags for each method defined in your gRPC service. By default, it generates commands for each RPC method that does not return a stream of messages. The commands are named based on the name of the service method.

For example, given the following protobuf definition for a service:

```protobuf
service MyService {
  rpc MyMethod(MyRequest) returns (MyResponse) {}
}
```

`autocli` will generate a command named `my-method` for the `MyMethod` method. The command will have flags for each field in the `MyRequest` message.

If you want to customise the behavior of a command, you can define a custom command by implementing the `autocli.Command` interface. You can then register the command with the `autocli.Builder` instance for your application.

Similarly, you can define a custom query by implementing the `autocli.Query` interface. You can then register the query with the `autocli.Builder` instance for your application.

To add a custom command or query, you can use the `Builder.AddCustomCommand` or `Builder.AddCustomQuery` methods, respectively. These methods take a `cobra.Command` or `cobra.Command` instance, respectively, which can be used to define the behavior of the command or query.

## Advanced Usage

### Specifying Subcommands

By default, `autocli` generates a command for each method in your gRPC service. However, you can specify subcommands to group related commands together. To specify subcommands, you can use the `autocliv1.ServiceCommandDescriptor` struct.

This example shows how to use the `autocliv1.ServiceCommandDescriptor` struct to group related commands together and specify subcommands in your gRPC service by defining an instance of `autocliv1.ModuleOptions` in your `autocli.go` file.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/bcdf81cbaf8d70c4e4fa763f51292d54aed689fd/x/gov/autocli.go#L9-L27
```

The `AutoCLIOptions()` method in the autocli package allows you to specify the services and sub-commands to be mapped for your app. In the example code, an instance of the `autocliv1.ModuleOptions` struct is defined in the `appmodule.AppModule` implementation located in the `x/gov/autocli.go` file. This configuration groups related commands together and specifies subcommands for each service.

### Positional Arguments

Positional arguments are arguments that are passed to a command without being specified as a flag. They are typically used for providing additional context to a command, such as a filename or search query.

To add positional arguments to a command, you can use the `autocliv1.PositionalArgDescriptor` struct, as seen in the example below. You need to specify the `ProtoField` parameter, which is the name of the protobuf field that should be used as the positional argument. In addition, if the parameter is a variable-length argument, you can specify the `Varargs` parameter as `true`. This can only be applied to the last positional parameter, and the `ProtoField` must be a repeated field.

Here's an example of how to define a positional argument for the `Account` method of the `auth` service:

```go reference
https://github.com/cosmos/cosmos-sdk/blob/bcdf81cbaf8d70c4e4fa763f51292d54aed689fd/x/auth/autocli.go#L8-L32
```

Here are some example commands that use the positional arguments we defined above:

To query an account by address:

```bash
<appd> query auth account cosmos1abcd...xyz
```

To query an account address by account number:

```bash
<appd> query auth address-by-acc-num 1
```

In both of these commands, the `auth` service is being queried with the `query` subcommand, followed by the specific method being called (`account` or `address-by-acc-num`). The positional argument is included at the end of the command (`cosmos1abcd...xyz` or `1`) to specify the address or account number, respectively.

### Customising Flag Names

By default, `autocli` generates flag names based on the names of the fields in your protobuf message. However, you can customise the flag names by providing a `FlagOptions` parameter to the `Builder.AddMessageFlags()` method. This parameter allows you to specify custom names for flags based on the names of the message fields. For example, if you have a message with the fields `test` and `test1`, you can use the following naming options to customise the flags

``` go
options := autocliv1.RpcCommandOptions{ 
    FlagOptions: map[string]*autocliv1.FlagOptions{ 
        "test": { Name: "custom_name", }, 
        "test1": { Name: "other_name", }, 
    }, 
}

builder.AddMessageFlags(message, options)
```

Note that `autocliv1.RpcCommandOptions` is a field of the `autocliv1.ServiceCommandDescriptor` struct, which is defined in the `autocliv1` package. To use this option, you can define an instance of `autocliv1.ModuleOptions` in your `appmodule.AppModule` implementation and specify the `FlagOptions` for the relevant service command descriptor.

## Conclusion

`autocli` is a powerful tool for adding CLI interfaces to your Cosmos SDK-based applications. It allows you to easily generate CLI commands and flags from your protobuf messages, and provides many options for customising the behavior of your CLI application.

To further enhance your CLI experience with Cosmos SDK-based blockchains, you can use `Hubl`. `Hubl` is a tool that allows you to query any Cosmos SDK-based blockchain using the new AutoCLI feature of the Cosmos SDK. With hubl, you can easily configure a new chain and query modules with just a few simple commands.

For more information on `Hubl`, including how to configure a new chain and query a module, see the [Hubl documentation](https://docs.cosmos.network/main/tooling/hubl).
