# Protocol Buffers

众所周知，Cosmos SDK广泛使用协议缓冲区（protocol buffers），本文档旨在提供有关在cosmos-sdk中如何使用协议缓冲区的指南。

为了生成proto文件，Cosmos SDK使用了一个Docker镜像，该镜像也提供给所有人使用。最新版本是`ghcr.io/cosmos/proto-builder:0.12.x`

下面是Cosmos SDK用于生成、lint和格式化可在任何应用程序的makefile中重用的protobuf文件的命令示例。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/Makefile#L411-L432
```

用于生成protobuf文件的脚本可以在`scripts/`目录中找到。

```shell reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/scripts/protocgen.sh#L1-L37
```

## Buf

[Buf](https://buf.build)是一个protobuf工具，它在各种其他功能之上抽象了使用复杂的`protoc`工具链的需求，以确保您按照大多数生态系统的要求使用protobuf。在cosmos-sdk存储库中，有一些文件具有buf前缀。让我们从顶层开始，然后深入研究各个目录。

### Workspace

在根目录下，使用[buf workspaces](https://docs.buf.build/configuration/v1/buf-work-yaml)定义了一个工作区。这对于项目中存在一个或多个包含protobuf的目录非常有帮助。

Cosmos SDK示例：

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/buf.work.yaml#L6-L9
```

### Proto Directory

接下来是`proto/`目录，其中包含所有的protobuf文件。在这里，定义了许多不同的buf文件，每个文件都有不同的用途。

```bash
├── 05-depinject.md
├── buf.gen.gogo.yaml
├── buf.gen.pulsar.yaml
├── buf.gen.swagger.yaml
├── buf.lock
├── buf.md
├── buf.yaml
├── cosmos
└── tendermint
```

上面的图示了Cosmos SDK `proto/`目录中的所有文件和目录。

#### `buf.gen.gogo.yaml`

`buf.gen.gogo.yaml`定义了如何为模块生成protobuf文件。该文件使用[gogoproto](https://github.com/gogo/protobuf)，这是一个与Google go-proto生成器分开的生成器，使得使用各种对象更加方便，并且具有更高性能的编码和解码步骤。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.gen.gogo.yaml#L1-L9
```

:::tip
可以在[这里](https://docs.buf.build/tour/generate-go-code)找到定义`gen`文件的示例。
:::

#### `buf.gen.pulsar.yaml`

`buf.gen.pulsar.yaml`定义了如何使用[新的golang apiv2 protobuf](https://go.dev/blog/protobuf-apiv2)生成protobuf文件。此生成器用于替代google go-proto生成器，因为它为Cosmos SDK应用程序提供了一些额外的辅助功能，并且在编码和解码方面比google go-proto生成器更高效。您可以在[这里](https://github.com/cosmos/cosmos-proto)跟踪此生成器的开发进展。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.gen.pulsar.yaml#L1-L18
```

:::tip
可以在[这里](https://docs.buf.build/tour/generate-go-code)找到定义`gen`文件的示例。
:::

#### `buf.gen.swagger.yaml`

`buf.gen.swagger.yaml`为链的查询和消息生成swagger文档。这将仅定义在查询和消息服务器中定义的REST API端点。您可以在[这里](https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/bank/v1beta1/query.proto#L19)找到示例。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.gen.swagger.yaml#L1-L6
```

:::tip
可以在[这里](https://docs.buf.build/tour/generate-go-code)找到定义`gen`文件的示例。
:::

#### `buf.lock`

这是一个基于`.gen`文件所需的依赖项自动生成的文件。无需复制当前文件。如果您依赖于cosmos-sdk proto定义，将需要提供Cosmos SDK的新条目。您需要使用的依赖项是`buf.build/cosmos/cosmos-sdk`。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.lock#L1-L16
```

#### `buf.yaml`

`buf.yaml`定义了[您的包的名称](https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.yaml#L3)，要使用的[破坏检查器](https://docs.buf.build/tour/detect-breaking-changes)以及如何[对protobuf文件进行lint](https://docs.buf.build/tour/lint-your-api)。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.yaml#L1-L24
```

我们在 Cosmos SDK 的 protobuf 文件中使用了各种 linter。该仓库还在 ci 中进行了检查。

可以在[这里](https://github.com/cosmos/cosmos-sdk/blob/main/.github/workflows/proto.yml#L1-L32)找到对 GitHub Actions 的引用。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/.github/workflows/proto.yml#L1-L32
```




# Protocol Buffers

It is known that Cosmos SDK uses protocol buffers extensively, this docuemnt is meant to provide a guide on how it is used in the cosmos-sdk. 

To generate the proto file, the Cosmos SDK uses a docker image, this image is provided to all to use as well. The latest version is `ghcr.io/cosmos/proto-builder:0.12.x`

Below is the example of the Cosmos SDK's commands for generating, linting, and formatting protobuf files that can be reused in any applications makefile. 

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/Makefile#L411-L432
```

The script used to generate the protobuf files can be found in the `scripts/` directory. 

```shell reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/scripts/protocgen.sh#L1-L37
```

## Buf

[Buf](https://buf.build) is a protobuf tool that abstracts the needs to use the complicated `protoc` toolchain on top of various other things that ensure you are using protobuf in accordance with the majority of the ecosystem. Within the cosmos-sdk repository there are a few files that have a buf prefix. Lets start with the top level and then dive into the various directories. 

### Workspace

At the root level directory a workspace is defined using [buf workspaces](https://docs.buf.build/configuration/v1/buf-work-yaml). This helps if there are one or more protobuf containing directories in your project. 

Cosmos SDK example: 

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/buf.work.yaml#L6-L9
```

### Proto Directory

Next is the `proto/` directory where all of our protobuf files live. In here there are many different buf files defined each serving a different purpose. 

```bash
├── 05-depinject.md
├── buf.gen.gogo.yaml
├── buf.gen.pulsar.yaml
├── buf.gen.swagger.yaml
├── buf.lock
├── buf.md
├── buf.yaml
├── cosmos
└── tendermint
```

The above diagram all the files and directories within the Cosmos SDK `proto/` directory. 

#### `buf.gen.gogo.yaml`

`buf.gen.gogo.yaml` defines how the protobuf files should be generated for use with in the module. This file uses [gogoproto](https://github.com/gogo/protobuf), a separate generator from the google go-proto generator that makes working with various objects more ergonomic, and it has more performant encode and decode steps

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.gen.gogo.yaml#L1-L9
```

:::tip
Example of how to define `gen` files can be found [here](https://docs.buf.build/tour/generate-go-code)
:::

#### `buf.gen.pulsar.yaml`

`buf.gen.pulsar.yaml` defines how protobuf files should be generated using the [new golang apiv2 of protobuf](https://go.dev/blog/protobuf-apiv2). This generator is used instead of the google go-proto generator because it has some extra helpers for Cosmos SDK applications and will have more performant encode and decode than the google go-proto generator. You can follow the development of this generator [here](https://github.com/cosmos/cosmos-proto). 

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.gen.pulsar.yaml#L1-L18
```

:::tip
Example of how to define `gen` files can be found [here](https://docs.buf.build/tour/generate-go-code)
:::

#### `buf.gen.swagger.yaml`

`buf.gen.swagger.yaml` generates the swagger documentation for the query and messages of the chain. This will only define the REST API end points that were defined in the query and msg servers. You can find examples of this [here](https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/bank/v1beta1/query.proto#L19)

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.gen.swagger.yaml#L1-L6
```

:::tip
Example of how to define `gen` files can be found [here](https://docs.buf.build/tour/generate-go-code)
:::

#### `buf.lock`

This is a autogenerated file based off the dependencies required by the `.gen` files. There is no need to copy the current one. If you depend on cosmos-sdk proto definitions a new entry for the Cosmos SDK will need to be provided. The dependency you will need to use is `buf.build/cosmos/cosmos-sdk`.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.lock#L1-L16
```

#### `buf.yaml`

`buf.yaml` defines the [name of your package](https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.yaml#L3), which [breakage checker](https://docs.buf.build/tour/detect-breaking-changes) to use and how to [lint your protobuf files](https://docs.buf.build/tour/lint-your-api). 

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/proto/buf.yaml#L1-L24
```

We use a variety of linters for the Cosmos SDK protobuf files. The repo also checks this in ci. 

A reference to the github actions can be found [here](https://github.com/cosmos/cosmos-sdk/blob/main/.github/workflows/proto.yml#L1-L32)

```go reference
https://github.com/cosmos/cosmos-sdk/blob/main/.github/workflows/proto.yml#L1-L32
```
