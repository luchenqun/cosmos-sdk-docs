# P2P多路复用连接

## MConnection

`MConnection`是一种支持在单个TCP连接上具有不同服务质量保证的多个独立流的多路复用连接。
每个流称为一个`Channel`，每个`Channel`都有一个全局唯一的_字节ID_。
每个`Channel`还有一个相对优先级，用于确定该`Channel`相对于其他`Channel`的服务质量。
每个`Channel`的_字节ID_和相对优先级在连接初始化时进行配置。

`MConnection`支持三种数据包类型：

- Ping
- Pong
- Msg

### Ping和Pong

Ping和Pong消息是通过向连接写入一个字节来实现的；分别是0x1和0x2。

当在`MConnection`上在时间`pingTimeout`内没有接收到任何消息时，我们发送一个ping消息。
当在`MConnection`上接收到一个ping时，只有在没有其他要发送的消息并且对等方没有向我们发送过多的ping时，才会发送一个pong作为响应（TODO）。

如果在ping之后一段时间内没有收到pong或消息，则会断开与对等方的连接。

### Msg

通道中的消息被分割成较小的`msgPacket`以进行多路复用。

```go
type msgPacket struct {
 ChannelID byte
 EOF       byte // 1 means message ends here.
 Bytes     []byte
}
```

`msgPacket`使用[Proto3](https://developers.google.com/protocol-buffers/docs/proto3)进行序列化。
一组连续的数据包的接收`Bytes`被追加在一起，直到接收到一个`EOF=1`的数据包，然后完整的序列化消息将被返回，
以供相应通道的`onReceive`函数进行处理。

### 多路复用

消息从单个`sendRoutine`发送，该循环通过选择语句循环，并导致发送ping、pong或一批数据消息。
数据消息的批量发送可能包括来自多个通道的消息。
消息字节被排队等待发送到各自的通道，每个通道一次只保持一个未发送的消息。
从具有最低的最近发送字节与通道优先级之比的通道中逐个选择要发送的消息。

## 发送消息

发送消息有两种方法：

```go
func (m MConnection) Send(chID byte, msg interface{}) bool {}
func (m MConnection) TrySend(chID byte, msg interface{}) bool {}
```

`Send(chID, msg)` 是一个阻塞调用，它会等待直到将 `msg` 成功排队到具有给定 id 字节 `chID` 的通道中。消息 `msg` 使用 `tendermint/go-amino` 子模块的 `WriteBinary()` 反射例程进行序列化。

`TrySend(chID, msg)` 是一个非阻塞调用，如果队列未满，则将消息 `msg` 排队到具有给定 id 字节 `chID` 的通道中；否则，它会立即返回 false。

`Send()` 和 `TrySend()` 也对每个 `Peer` 开放。

## Peer

每个对等节点都有一个 `MConnection` 实例，并包括其他信息，例如连接是否为出站连接，如果连接关闭是否应重新创建连接，有关节点的各种身份信息，以及其他由反应器使用的高级线程安全数据。

## Switch/Reactor

`Switch` 处理对等节点的连接，并公开一个 API 以在 `Reactors` 上接收传入消息。每个 `Reactor` 负责处理一个或多个 `Channels` 的传入消息。因此，尽管发送传出消息通常在对等节点上执行，但接收传入消息是在反应器上完成的。

```go
// Declare a MyReactor reactor that handles messages on MyChannelID.
type MyReactor struct{}

func (reactor MyReactor) GetChannels() []*ChannelDescriptor {
    return []*ChannelDescriptor{ChannelDescriptor{ID:MyChannelID, Priority: 1}}
}

func (reactor MyReactor) Receive(chID byte, peer *Peer, msgBytes []byte) {
    r, n, err := bytes.NewBuffer(msgBytes), new(int64), new(error)
    msgString := ReadString(r, n, err)
    fmt.Println(msgString)
}

// Other Reactor methods omitted for brevity
...

switch := NewSwitch([]Reactor{MyReactor{}})

...

// Send a random message to all outbound connections
for _, peer := range switch.Peers().List() {
    if peer.IsOutbound() {
        peer.Send(MyChannelID, "Here's a random message")
    }
}
```


# P2P Multiplex Connection

## MConnection

`MConnection` is a multiplex connection that supports multiple independent streams
with distinct quality of service guarantees atop a single TCP connection.
Each stream is known as a `Channel` and each `Channel` has a globally unique _byte id_.
Each `Channel` also has a relative priority that determines the quality of service
of the `Channel` compared to other `Channel`s.
The _byte id_ and the relative priorities of each `Channel` are configured upon
initialization of the connection.

The `MConnection` supports three packet types:

- Ping
- Pong
- Msg

### Ping and Pong

The ping and pong messages consist of writing a single byte to the connection; 0x1 and 0x2, respectively.

When we haven't received any messages on an `MConnection` in time `pingTimeout`, we send a ping message.
When a ping is received on the `MConnection`, a pong is sent in response only if there are no other messages
to send and the peer has not sent us too many pings (TODO).

If a pong or message is not received in sufficient time after a ping, the peer is disconnected from.

### Msg

Messages in channels are chopped into smaller `msgPacket`s for multiplexing.

```go
type msgPacket struct {
 ChannelID byte
 EOF       byte // 1 means message ends here.
 Bytes     []byte
}
```

The `msgPacket` is serialized using [Proto3](https://developers.google.com/protocol-buffers/docs/proto3).
The received `Bytes` of a sequential set of packets are appended together
until a packet with `EOF=1` is received, then the complete serialized message
is returned for processing by the `onReceive` function of the corresponding channel.

### Multiplexing

Messages are sent from a single `sendRoutine`, which loops over a select statement and results in the sending
of a ping, a pong, or a batch of data messages. The batch of data messages may include messages from multiple channels.
Message bytes are queued for sending in their respective channel, with each channel holding one unsent message at a time.
Messages are chosen for a batch one at a time from the channel with the lowest ratio of recently sent bytes to channel priority.

## Sending Messages

There are two methods for sending messages:

```go
func (m MConnection) Send(chID byte, msg interface{}) bool {}
func (m MConnection) TrySend(chID byte, msg interface{}) bool {}
```

`Send(chID, msg)` is a blocking call that waits until `msg` is successfully queued
for the channel with the given id byte `chID`. The message `msg` is serialized
using the `tendermint/go-amino` submodule's `WriteBinary()` reflection routine.

`TrySend(chID, msg)` is a nonblocking call that queues the message msg in the channel
with the given id byte chID if the queue is not full; otherwise it returns false immediately.

`Send()` and `TrySend()` are also exposed for each `Peer`.

## Peer

Each peer has one `MConnection` instance, and includes other information such as whether the connection
was outbound, whether the connection should be recreated if it closes, various identity information about the node,
and other higher level thread-safe data used by the reactors.

## Switch/Reactor

The `Switch` handles peer connections and exposes an API to receive incoming messages
on `Reactors`. Each `Reactor` is responsible for handling incoming messages of one
or more `Channels`. So while sending outgoing messages is typically performed on the peer,
incoming messages are received on the reactor.

```go
// Declare a MyReactor reactor that handles messages on MyChannelID.
type MyReactor struct{}

func (reactor MyReactor) GetChannels() []*ChannelDescriptor {
    return []*ChannelDescriptor{ChannelDescriptor{ID:MyChannelID, Priority: 1}}
}

func (reactor MyReactor) Receive(chID byte, peer *Peer, msgBytes []byte) {
    r, n, err := bytes.NewBuffer(msgBytes), new(int64), new(error)
    msgString := ReadString(r, n, err)
    fmt.Println(msgString)
}

// Other Reactor methods omitted for brevity
...

switch := NewSwitch([]Reactor{MyReactor{}})

...

// Send a random message to all outbound connections
for _, peer := range switch.Peers().List() {
    if peer.IsOutbound() {
        peer.Send(MyChannelID, "Here's a random message")
    }
}
```
