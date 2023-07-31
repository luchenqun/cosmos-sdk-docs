---
order: 3
title: 客户端和服务器
---

# 客户端和服务器

本节适用于那些希望在新的编程语言中实现自己的 ABCI 服务器的人。

您应该已经阅读了 [ABCI 方法和类型](./abci.md) 和 [ABCI 应用程序](./apps.md)。

## 消息协议

消息协议由在 [protobuf 文件](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/tendermint/abci/types.proto) 中定义的请求和响应对组成。

有些消息没有字段，而其他消息可能包含字节数组、字符串、整数或自定义的 protobuf 类型。

有关 protobuf 的更多详细信息，请参阅 [文档](https://developers.google.com/protocol-buffers/docs/overview)。

对于每个请求，服务器应该用相应的响应进行回应，请求的顺序在响应的顺序中保持不变。

## 服务器实现

要在您选择的编程语言中使用 ABCI，该语言必须有一个 ABCI 服务器。Tendermint 支持三种 ABCI 的实现，均使用 Go 语言编写：

- 内部实现（[Golang](https://github.com/tendermint/tendermint/tree/v0.34.x/abci)，[Rust](https://github.com/tendermint/rust-abci)）
- ABCI-socket
- GRPC

后两种可以通过设置 `abci-cli` 的 `--abci` 标志来进行测试（即设置为 `socket` 或 `grpc`）。

在以下链接中可以找到一些示例，这些示例处于不同的维护阶段：
[Go](https://github.com/tendermint/tendermint/tree/v0.34.x/abci/server)，
[JavaScript](https://github.com/tendermint/js-abci)，
[C++](https://github.com/mdyring/cpp-tmsp)，
[Java](https://github.com/jTendermint/jabci)。

### 内部实现

最简单的实现方式是在 Golang 中使用函数调用。
这意味着使用 Golang 编写的 ABCI 应用程序可以与 Tendermint Core 一起编译，并作为单个二进制文件运行。

### GRPC

如果您的语言支持 GRPC，这是最简单的方法，但会有显著的性能开销。

要开始使用 GRPC，请复制 [protobuf 文件](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/tendermint/abci/types.proto) 并使用您的语言的 GRPC 插件进行编译。例如，对于 Golang，命令是 `protoc --go_out=plugins=grpc:. types.proto`。有关更多详细信息，请参阅 [grpc 文档](http://www.grpc.io/docs/)。`protoc` 将自动生成您的语言中用于处理请求的 ABCI 客户端和服务器所需的所有必要代码，包括您的应用程序必须满足的任何接口。

请注意，在套接字实现（TSP）中使用的长度前缀在GRPC中不适用。

### TSP

Tendermint Socket Protocol是一个异步的原始套接字服务器，提供有序的消息传递，可以通过unix或tcp进行通信。
消息使用Protobuf3进行序列化，并使用[有符号Varint](https://developers.google.com/protocol-buffers/docs/encoding?csw=1#signed-integers)进行长度前缀。

如果您的语言中没有可用的GRPC，或者您需要更高的性能，或者您喜欢编程，您可以使用Tendermint Socket Protocol实现自己的ABCI服务器。第一步仍然是使用`protoc`自动生成相关的数据类型和编解码器。除了使用proto3进行编码外，通过套接字传输的消息还会进行长度前缀以便于作为流式协议使用。proto3没有官方的长度前缀标准，所以我们使用自己的标准。前缀中的第一个字节表示大端编码长度的长度。前缀中的其余字节是大端编码的长度。

例如，如果proto3编码的ABCI消息是0xDEADBEEF（4个字节），那么长度前缀消息将是0x0104DEADBEEF。如果proto3编码的ABCI消息长度为65535字节，那么长度前缀消息将类似于0x02FFFF....

使用这种`varint`编码而不是旧版本（其中整数被编码为`<len of len><big endian len>`）的好处在于它是在Protobuf中编码整数的标准方式。而且通常更短。

如上所述，这种前缀不适用于GRPC。

ABCI服务器还必须能够支持多个连接，因为Tendermint使用四个连接。

### 异步与同步

主要的ABCI服务器（即非GRPC）提供有序的异步消息。这对于DeliverTx和CheckTx非常有用，因为它允许Tendermint在处理前一个事务之前将事务转发给应用程序。

因此，DeliverTx和CheckTx消息是异步发送的，而其他所有消息都是同步发送的。

## 客户端

目前有两种ABCI客户端的用例。一种是测试工具，例如`abci-cli`，它允许通过命令行发送ABCI请求。另一种是共识引擎，例如Tendermint Core，在每次接收到新的事务或提交一个区块时向应用程序发出请求。

很可能您不需要实现一个客户端。有关我们的客户端的详细信息，请参阅[这里](https://github.com/tendermint/tendermint/tree/v0.34.x/abci/client)。


---
order: 3
title: Client and Server
---

# Client and Server

This section is for those looking to implement their own ABCI Server, perhaps in
a new programming language.

You are expected to have read [ABCI Methods and Types](./abci.md) and [ABCI
Applications](./apps.md).

## Message Protocol

The message protocol consists of pairs of requests and responses defined in the
[protobuf file](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/tendermint/abci/types.proto).

Some messages have no fields, while others may include byte-arrays, strings, integers,
or custom protobuf types.

For more details on protobuf, see the [documentation](https://developers.google.com/protocol-buffers/docs/overview).

For each request, a server should respond with the corresponding
response, where the order of requests is preserved in the order of
responses.

## Server Implementations

To use ABCI in your programming language of choice, there must be a ABCI
server in that language. Tendermint supports three implementations of the ABCI, written in Go:

- In-process ([Golang](https://github.com/tendermint/tendermint/tree/v0.34.x/abci), [Rust](https://github.com/tendermint/rust-abci))
- ABCI-socket
- GRPC

The latter two can be tested using the `abci-cli` by setting the `--abci` flag
appropriately (ie. to `socket` or `grpc`).

See examples, in various stages of maintenance, in
[Go](https://github.com/tendermint/tendermint/tree/v0.34.x/abci/server),
[JavaScript](https://github.com/tendermint/js-abci),
[C++](https://github.com/mdyring/cpp-tmsp), and
[Java](https://github.com/jTendermint/jabci).

### In Process

The simplest implementation uses function calls within Golang.
This means ABCI applications written in Golang can be compiled with Tendermint Core and run as a single binary.

### GRPC

If GRPC is available in your language, this is the easiest approach,
though it will have significant performance overhead.

To get started with GRPC, copy in the [protobuf
file](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/tendermint/abci/types.proto)
and compile it using the GRPC plugin for your language. For instance,
for golang, the command is `protoc --go_out=plugins=grpc:. types.proto`.
See the [grpc documentation for more details](http://www.grpc.io/docs/).
`protoc` will autogenerate all the necessary code for ABCI client and
server in your language, including whatever interface your application
must satisfy to be used by the ABCI server for handling requests.

Note the length-prefixing used in the socket implementation (TSP) does not apply for GRPC.

### TSP

Tendermint Socket Protocol is an asynchronous, raw socket server which provides ordered message passing over unix or tcp.
Messages are serialized using Protobuf3 and length-prefixed with a [signed Varint](https://developers.google.com/protocol-buffers/docs/encoding?csw=1#signed-integers)

If GRPC is not available in your language, or you require higher
performance, or otherwise enjoy programming, you may implement your own
ABCI server using the Tendermint Socket Protocol. The first step is still to auto-generate the relevant data
types and codec in your language using `protoc`. In addition to being proto3 encoded, messages coming over
the socket are length-prefixed to facilitate use as a streaming protocol. proto3 doesn't have an
official length-prefix standard, so we use our own. The first byte in
the prefix represents the length of the Big Endian encoded length. The
remaining bytes in the prefix are the Big Endian encoded length.

For example, if the proto3 encoded ABCI message is 0xDEADBEEF (4
bytes), the length-prefixed message is 0x0104DEADBEEF. If the proto3
encoded ABCI message is 65535 bytes long, the length-prefixed message
would be like 0x02FFFF....

The benefit of using this `varint` encoding over the old version (where integers were encoded as `<len of len><big endian len>` is that
it is the standard way to encode integers in Protobuf. It is also generally shorter.

As noted above, this prefixing does not apply for GRPC.

An ABCI server must also be able to support multiple connections, as
Tendermint uses four connections.

### Async vs Sync

The main ABCI server (ie. non-GRPC) provides ordered asynchronous messages.
This is useful for DeliverTx and CheckTx, since it allows Tendermint to forward
transactions to the app before it's finished processing previous ones.

Thus, DeliverTx and CheckTx messages are sent asynchronously, while all other
messages are sent synchronously.

## Client

There are currently two use-cases for an ABCI client. One is a testing
tool, as in the `abci-cli`, which allows ABCI requests to be sent via
command line. The other is a consensus engine, such as Tendermint Core,
which makes requests to the application every time a new transaction is
received or a block is committed.

It is unlikely that you will need to implement a client. For details of
our client, see
[here](https://github.com/tendermint/tendermint/tree/v0.34.x/abci/client).
