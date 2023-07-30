# 推荐的文件夹结构

:::note 概要
本文档概述了Cosmos SDK模块的推荐结构。这些想法旨在作为建议应用。鼓励应用开发者改进和贡献模块结构和开发设计。
:::

## 结构

典型的Cosmos SDK模块可以按照以下方式组织：

```shell
proto
└── {project_name}
    └── {module_name}
        └── {proto_version}
            ├── {module_name}.proto
            ├── event.proto
            ├── genesis.proto
            ├── query.proto
            └── tx.proto
```

* `{module_name}.proto`：模块的常见消息类型定义。
* `event.proto`：与事件相关的模块消息类型定义。
* `genesis.proto`：与创世状态相关的模块消息类型定义。
* `query.proto`：模块的查询服务和相关消息类型定义。
* `tx.proto`：模块的消息服务和相关消息类型定义。

```shell
x/{module_name}
├── client
│   ├── cli
│   │   ├── query.go
│   │   └── tx.go
│   └── testutil
│       ├── cli_test.go
│       └── suite.go
├── exported
│   └── exported.go
├── keeper
│   ├── genesis.go
│   ├── grpc_query.go
│   ├── hooks.go
│   ├── invariants.go
│   ├── keeper.go
│   ├── keys.go
│   ├── msg_server.go
│   └── querier.go
├── module
│   └── module.go
│   └── abci.go
│   └── autocli.go
├── simulation
│   ├── decoder.go
│   ├── genesis.go
│   ├── operations.go
│   └── params.go
├── {module_name}.pb.go
├── codec.go
├── errors.go
├── events.go
├── events.pb.go
├── expected_keepers.go
├── genesis.go
├── genesis.pb.go
├── keys.go
├── msgs.go
├── params.go
├── query.pb.go
├── tx.pb.go
└── 05-depinject.md
```

* `client/`：模块的CLI客户端功能实现和模块的CLI测试套件。
* `exported/`：模块的导出类型 - 通常是接口类型。如果一个模块依赖于另一个模块的保管者，它应该通过`expected_keepers.go`文件（见下文）作为接口合同接收保管者，以避免对实现保管者的模块的直接依赖。然而，这些接口合同可以定义操作和/或返回特定于实现保管者的模块的类型的方法，这就是`exported/`的作用。在`exported/`中定义的接口类型使用规范类型，允许模块通过`expected_keepers.go`文件接收保管者作为接口合同。这种模式可以使代码保持DRY，并减轻导入循环混乱。
* `keeper/`：模块的`Keeper`和`MsgServer`实现。
* `module/`：模块的`AppModule`和`AppModuleBasic`实现。
    * `abci.go`：模块的`BeginBlocker`和`EndBlocker`实现（只有在需要定义`BeginBlocker`和/或`EndBlocker`时才需要此文件）。
    * `autocli.go`：模块的[autocli](../tooling/03-autocli.md)选项。
* `simulation/`：模块的[simulation](14-simulator.md)包定义了区块链模拟器应用程序（`simapp`）使用的函数。
* `REAMDE.md`：模块的规范文档，概述了重要概念、状态存储结构以及消息和事件类型定义。了解如何在[规范指南](../spec/SPEC_MODULE.md)中编写模块规范。
* 根目录包括消息、事件和创世状态的类型定义，包括Protocol Buffers生成的类型定义。
    * `codec.go`：模块的接口类型的注册方法。
    * `errors.go`：模块的哨兵错误。
    * `events.go`：模块的事件类型和构造函数。
    * `expected_keepers.go`：模块的[预期保管者](06-keeper.md#type-definition)接口。
    * `genesis.go`：模块的创世状态方法和辅助函数。
    * `keys.go`：模块的存储键和相关的辅助函数。
    * `msgs.go`：模块的消息类型定义和相关方法。
    * `params.go`：模块的参数类型定义和相关方法。
    * `*.pb.go`：模块的Protocol Buffers生成的类型定义（如上述各自的`*.proto`文件中定义）。

I'm sorry, but as an AI text-based model, I am unable to receive or process any files or attachments. However, you can copy and paste the Markdown content here, and I will do my best to translate it for you.




# Recommended Folder Structure

:::note Synopsis
This document outlines the recommended structure of Cosmos SDK modules. These ideas are meant to be applied as suggestions. Application developers are encouraged to improve upon and contribute to module structure and development design.
:::

## Structure

A typical Cosmos SDK module can be structured as follows:

```shell
proto
└── {project_name}
    └── {module_name}
        └── {proto_version}
            ├── {module_name}.proto
            ├── event.proto
            ├── genesis.proto
            ├── query.proto
            └── tx.proto
```

* `{module_name}.proto`: The module's common message type definitions.
* `event.proto`: The module's message type definitions related to events.
* `genesis.proto`: The module's message type definitions related to genesis state.
* `query.proto`: The module's Query service and related message type definitions.
* `tx.proto`: The module's Msg service and related message type definitions.

```shell
x/{module_name}
├── client
│   ├── cli
│   │   ├── query.go
│   │   └── tx.go
│   └── testutil
│       ├── cli_test.go
│       └── suite.go
├── exported
│   └── exported.go
├── keeper
│   ├── genesis.go
│   ├── grpc_query.go
│   ├── hooks.go
│   ├── invariants.go
│   ├── keeper.go
│   ├── keys.go
│   ├── msg_server.go
│   └── querier.go
├── module
│   └── module.go
│   └── abci.go
│   └── autocli.go
├── simulation
│   ├── decoder.go
│   ├── genesis.go
│   ├── operations.go
│   └── params.go
├── {module_name}.pb.go
├── codec.go
├── errors.go
├── events.go
├── events.pb.go
├── expected_keepers.go
├── genesis.go
├── genesis.pb.go
├── keys.go
├── msgs.go
├── params.go
├── query.pb.go
├── tx.pb.go
└── 05-depinject.md
```

* `client/`: The module's CLI client functionality implementation and the module's CLI testing suite.
* `exported/`: The module's exported types - typically interface types. If a module relies on keepers from another module, it is expected to receive the keepers as interface contracts through the `expected_keepers.go` file (see below) in order to avoid a direct dependency on the module implementing the keepers. However, these interface contracts can define methods that operate on and/or return types that are specific to the module that is implementing the keepers and this is where `exported/` comes into play. The interface types that are defined in `exported/` use canonical types, allowing for the module to receive the keepers as interface contracts through the `expected_keepers.go` file. This pattern allows for code to remain DRY and also alleviates import cycle chaos.
* `keeper/`: The module's `Keeper` and `MsgServer` implementation.
* `module/`: The module's `AppModule` and `AppModuleBasic` implementation.
    * `abci.go`: The module's `BeginBlocker` and `EndBlocker` implementations (this file is only required if `BeginBlocker` and/or `EndBlocker` need to be defined).
    * `autocli.go`: The module [autocli](../tooling/03-autocli.md) options.
* `simulation/`: The module's [simulation](14-simulator.md) package defines functions used by the blockchain simulator application (`simapp`).
* `REAMDE.md`: The module's specification documents outlining important concepts, state storage structure, and message and event type definitions. Learn more how to write module specs in the [spec guidelines](../spec/SPEC_MODULE.md).
* The root directory includes type definitions for messages, events, and genesis state, including the type definitions generated by Protocol Buffers.
    * `codec.go`: The module's registry methods for interface types.
    * `errors.go`: The module's sentinel errors.
    * `events.go`: The module's event types and constructors.
    * `expected_keepers.go`: The module's [expected keeper](06-keeper.md#type-definition) interfaces.
    * `genesis.go`: The module's genesis state methods and helper functions.
    * `keys.go`: The module's store keys and associated helper functions.
    * `msgs.go`: The module's message type definitions and associated methods.
    * `params.go`: The module's parameter type definitions and associated methods.
    * `*.pb.go`: The module's type definitions generated by Protocol Buffers (as defined in the respective `*.proto` files above).
