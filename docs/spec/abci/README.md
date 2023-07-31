---
order: 1
parent:
  title: ABCI
  order: 2
---

# ABCI

ABCI代表“**A**pplication **B**lock**c**hain **I**nterface”（应用区块链接口）。
ABCI是Tendermint（一个状态机复制引擎）与您的应用程序（实际状态机）之间的接口。它由一组_methods_组成，每个方法都有相应的`Request`和`Response`消息类型。
为了执行状态机复制，Tendermint通过发送`Request*`消息并接收返回的`Response*`消息来调用ABCI应用程序上的ABCI方法。

所有ABCI消息和方法都在[协议缓冲区](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/abci/types.proto)中定义。这使得Tendermint可以与使用许多编程语言编写的应用程序一起运行。

此规范分为以下几个部分：

- [方法和类型](./abci.md) - 所有ABCI方法和消息类型的详细信息
- [应用程序](./apps.md) - 如何管理ABCI应用程序状态以及构建ABCI应用程序的其他详细信息
- [客户端和服务器](./client-server.md) - 适用于希望实现自己的ABCI应用程序服务器的人们


---
order: 1
parent:
  title: ABCI
  order: 2
---

# ABCI

ABCI stands for "**A**pplication **B**lock**c**hain **I**nterface".
ABCI is the interface between Tendermint (a state-machine replication engine)
and your application (the actual state machine). It consists of a set of
_methods_, each with a corresponding `Request` and `Response`message type. 
To perform state-machine replication, Tendermint calls the ABCI methods on the 
ABCI application by sending the `Request*` messages and receiving the `Response*` messages in return.

All ABCI messages and methods are defined in [protocol buffers](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/abci/types.proto). 
This allows Tendermint to run with applications written in many programming languages.

This specification is split as follows:

- [Methods and Types](./abci.md) - complete details on all ABCI methods and
  message types
- [Applications](./apps.md) - how to manage ABCI application state and other
  details about building ABCI applications
- [Client and Server](./client-server.md) - for those looking to implement their
  own ABCI application servers
