# 节点

本文档解释了如何识别 Tendermint 节点以及它们如何相互连接。

有关节点发现的详细信息，请参阅[节点交换（PEX）反应器文档](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/reactors/pex/pex.md)。

## 节点身份

Tendermint 节点应该以公钥的形式维护长期持久的身份。
每个节点都有一个定义为 `peer.ID == peer.PubKey.Address()` 的 ID，其中 `Address` 使用 `crypto` 包中定义的方案。

一个节点 ID 可以关联多个 IP 地址，但一个节点一次只会连接一个 IP 地址。

在尝试连接到节点时，我们使用 PeerURL：`<ID>@<IP>:<PORT>`。
我们将尝试连接到 IP:PORT 的节点，并通过经过身份验证的加密方式验证它是否拥有与 `<ID>` 对应的私钥。这可以防止对节点层的中间人攻击。

## 连接

所有的 p2p 连接都使用 TCP。
在与节点建立成功的 TCP 连接后，会执行两次握手：一次用于身份验证加密，一次用于 Tendermint 版本控制。
这两次握手都有可配置的超时时间（应该快速完成）。

### 身份验证加密握手

Tendermint 使用 X25519 密钥实现 Station-to-Station 协议进行 Diffie-Helman 密钥交换，并使用 chacha20poly1305 进行加密。

此协议的早期版本（0.32 及以下）存在可塑性攻击，其中主动的中间人攻击者可以破坏机密性，如 [Prime, Order Please!
Revisiting Small Subgroup and Invalid Curve Attacks on
Protocols using Diffie-Hellman](https://eprint.iacr.org/2019/526.pdf) 中所述。

我们已经添加了对 Merlin 的依赖，它是基于 Keccak 的传输哈希协议，以确保不可塑性。

具体步骤如下：

- 生成一个临时的 X25519 密钥对
- 将临时公钥发送给节点
- 等待接收节点的临时公钥
- 使用字符串 "TENDERMINT_SECRET_CONNECTION_TRANSCRIPT_HASH" 创建一个新的 Merlin Transcript
- 对临时密钥进行排序，并将高位标记为 "EPHEMERAL_UPPER_PUBLIC_KEY"，低位标记为 "EPHEMERAL_LOWER_PUBLIC_KEY"，添加到 Merlin Transcript 中
- 使用节点的临时公钥和我们的临时私钥计算 Diffie-Hellman 共享密钥
- 将 DH 密钥添加到标记为 DH_SECRET 的 Transcript 中
- 生成两个用于加密（发送和接收）的密钥和一个用于身份验证的挑战，具体步骤如下：
    - 使用 Diffie-Hellman 共享密钥创建一个 hkdf-sha256 实例，其中密钥为 Diffie-Hellman 共享密钥，info 参数为 `TENDERMINT_SECRET_CONNECTION_KEY_AND_CHALLENGE_GEN`
    - 从 hkdf-sha256 中获取 64 字节的输出
    - 如果我们有较小的临时公钥，则使用前 32 字节作为接收密钥，后 32 字节作为发送密钥；否则反之。
- 对接收和发送使用不同的 nonce。两个 nonce 都从 0 开始，并应支持完整的 96 位 nonce 范围
- 从现在开始，所有的通信都使用 1400 字节的帧进行加密（加上编码开销），使用相应的密钥和 nonce。每次使用后，每个 nonce 都会递增一次。
- 现在我们有了一个加密通道，但仍然需要进行身份验证
- 从 Merlin Transcript 中提取一个带有标记 "SECRET_CONNECTION_MAC" 的 32 字节挑战
- 使用我们的持久私钥对从 hkdf 获取的公共挑战进行签名
- 将氨编码的持久公钥和签名发送给节点
- 等待接收节点的持久公钥和签名
- 使用节点的持久公钥验证挑战上的签名

如果这是一个主动连接（我们拨打了对等方），并且我们使用了对等方的ID，
那么最后验证对等方的持久公钥是否与我们拨打的对等方ID相对应，
即 `peer.PubKey.Address() == <ID>`。

连接现在已经通过身份验证。所有流量都是加密的。

注意：只有拨号方可以验证对等方的身份，
但这是我们关心的，因为当我们加入网络时，我们希望确保我们已经到达了预期的对等方（而不是被中间人攻击）。

### 对等方过滤器

在继续之前，我们检查新对等方是否具有与我们自己或现有对等方相同的ID。如果是，则断开连接。

我们还检查对等方的地址和公钥是否与可选的白名单匹配，该白名单可以通过ABCI应用程序进行管理 -
如果启用了白名单并且对等方不符合条件，则连接将被终止。

### Tendermint版本握手

Tendermint版本握手允许对等方交换它们的NodeInfo：

```golang
type NodeInfo struct {
  Version    p2p.Version
  ID         p2p.ID
  ListenAddr string

  Network    string
  SoftwareVersion    string
  Channels   []int8

  Moniker    string
  Other      NodeInfoOther
}

type Version struct {
 P2P uint64
 Block uint64
 App uint64
}

type NodeInfoOther struct {
 TxIndex          string
 RPCAddress       string
}
```

如果以下条件成立，则断开连接：

- `peer.NodeInfo.ID` 不等于 `peerConn.ID`
- `peer.NodeInfo.Version.Block` 与我们的不匹配
- `peer.NodeInfo.Network` 与我们的不同
- `peer.Channels` 与我们已知的Channels没有交集。
- `peer.NodeInfo.ListenAddr` 格式不正确或者是无法解析的DNS主机

此时，如果我们没有断开连接，那么对等方是有效的。
它将通过 `AddPeer` 方法添加到switch和所有的reactors中。
请注意，每个reactor可能处理多个channels。

## 连接活动

一旦添加了对等方，给定reactor的传入消息将通过该reactor的 `Receive` 方法处理，输出消息则直接由每个对等方上的Reactors发送。典型的reactor会维护每个对等方的go协程来处理这个过程。


# Peers

This document explains how Tendermint Peers are identified and how they connect to one another.

For details on peer discovery, see the [peer exchange (PEX) reactor doc](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/reactors/pex/pex.md).

## Peer Identity

Tendermint peers are expected to maintain long-term persistent identities in the form of a public key.
Each peer has an ID defined as `peer.ID == peer.PubKey.Address()`, where `Address` uses the scheme defined in `crypto` package.

A single peer ID can have multiple IP addresses associated with it, but a node
will only ever connect to one at a time.

When attempting to connect to a peer, we use the PeerURL: `<ID>@<IP>:<PORT>`.
We will attempt to connect to the peer at IP:PORT, and verify,
via authenticated encryption, that it is in possession of the private key
corresponding to `<ID>`. This prevents man-in-the-middle attacks on the peer layer.

## Connections

All p2p connections use TCP.
Upon establishing a successful TCP connection with a peer,
two handshakes are performed: one for authenticated encryption, and one for Tendermint versioning.
Both handshakes have configurable timeouts (they should complete quickly).

### Authenticated Encryption Handshake

Tendermint implements the Station-to-Station protocol
using X25519 keys for Diffie-Helman key-exchange and chacha20poly1305 for encryption.

Previous versions of this protocol (0.32 and below) suffered from malleability attacks whereas an active man
in the middle attacker could compromise confidentiality as described in [Prime, Order Please!
Revisiting Small Subgroup and Invalid Curve Attacks on
Protocols using Diffie-Hellman](https://eprint.iacr.org/2019/526.pdf).

We have added dependency on the Merlin a keccak based transcript hashing protocol to ensure non-malleability.

It goes as follows:

- generate an ephemeral X25519 keypair
- send the ephemeral public key to the peer
- wait to receive the peer's ephemeral public key
- create a new Merlin Transcript with the string "TENDERMINT_SECRET_CONNECTION_TRANSCRIPT_HASH"
- Sort the ephemeral keys and add the high labeled "EPHEMERAL_UPPER_PUBLIC_KEY" and the low keys labeled "EPHEMERAL_LOWER_PUBLIC_KEY" to the Merlin transcript.
- compute the Diffie-Hellman shared secret using the peers ephemeral public key and our ephemeral private key
- add the DH secret to the transcript labeled DH_SECRET.
- generate two keys to use for encryption (sending and receiving) and a challenge for authentication as follows:
    - create a hkdf-sha256 instance with the key being the diffie hellman shared secret, and info parameter as
    `TENDERMINT_SECRET_CONNECTION_KEY_AND_CHALLENGE_GEN`
    - get 64 bytes of output from hkdf-sha256
    - if we had the smaller ephemeral pubkey, use the first 32 bytes for the key for receiving, the second 32 bytes for sending; else the opposite.
- use a separate nonce for receiving and sending. Both nonces start at 0, and should support the full 96 bit nonce range
- all communications from now on are encrypted in 1400 byte frames (plus encoding overhead),
  using the respective secret and nonce. Each nonce is incremented by one after each use.
- we now have an encrypted channel, but still need to authenticate
- extract a 32 bytes challenge from merlin transcript with the label "SECRET_CONNECTION_MAC"
- sign the common challenge obtained from the hkdf with our persistent private key
- send the amino encoded persistent pubkey and signature to the peer
- wait to receive the persistent public key and signature from the peer
- verify the signature on the challenge using the peer's persistent public key

If this is an outgoing connection (we dialed the peer) and we used a peer ID,
then finally verify that the peer's persistent public key corresponds to the peer ID we dialed,
ie. `peer.PubKey.Address() == <ID>`.

The connection has now been authenticated. All traffic is encrypted.

Note: only the dialer can authenticate the identity of the peer,
but this is what we care about since when we join the network we wish to
ensure we have reached the intended peer (and are not being MITMd).

### Peer Filter

Before continuing, we check if the new peer has the same ID as ourselves or
an existing peer. If so, we disconnect.

We also check the peer's address and public key against
an optional whitelist which can be managed through the ABCI app -
if the whitelist is enabled and the peer does not qualify, the connection is
terminated.

### Tendermint Version Handshake

The Tendermint Version Handshake allows the peers to exchange their NodeInfo:

```golang
type NodeInfo struct {
  Version    p2p.Version
  ID         p2p.ID
  ListenAddr string

  Network    string
  SoftwareVersion    string
  Channels   []int8

  Moniker    string
  Other      NodeInfoOther
}

type Version struct {
 P2P uint64
 Block uint64
 App uint64
}

type NodeInfoOther struct {
 TxIndex          string
 RPCAddress       string
}
```

The connection is disconnected if:

- `peer.NodeInfo.ID` is not equal `peerConn.ID`
- `peer.NodeInfo.Version.Block` does not match ours
- `peer.NodeInfo.Network` is not the same as ours
- `peer.Channels` does not intersect with our known Channels.
- `peer.NodeInfo.ListenAddr` is malformed or is a DNS host that cannot be
  resolved

At this point, if we have not disconnected, the peer is valid.
It is added to the switch and hence all reactors via the `AddPeer` method.
Note that each reactor may handle multiple channels.

## Connection Activity

Once a peer is added, incoming messages for a given reactor are handled through
that reactor's `Receive` method, and output messages are sent directly by the Reactors
on each peer. A typical reactor maintains per-peer go-routine(s) that handle this.
