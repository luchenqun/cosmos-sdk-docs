# P2P配置

在这里，我们描述了与对等节点交换相关的配置选项。
这些选项可以通过标志或通过`$TMHOME/config/config.toml`文件进行设置。

## 种子模式

`--p2p.seed_mode`

节点以种子模式运行。在种子模式下，节点会持续爬取网络以寻找对等节点，并在建立连接后分享一些对等节点并断开连接。

## 种子节点

`--p2p.seeds “id100000000000000000000000000000000@1.2.3.4:26656,id200000000000000000000000000000000@2.3.4.5:4444”`

在需要更多对等节点时，拨号这些种子节点。它们应该返回一组对等节点，然后断开连接。
如果我们的地址簿中已经有足够的对等节点，我们可能永远不需要拨号这些种子节点。

## 持久对等节点

`--p2p.persistent_peers “id100000000000000000000000000000000@1.2.3.4:26656,id200000000000000000000000000000000@2.3.4.5:26656”`

拨号这些对等节点，并在连接失败时自动重新拨号。
这些对等节点旨在成为可信的持久对等节点，可以帮助我们在P2P网络中锚定。
自动重新拨号使用指数退避，并在尝试连接一天后放弃。

但是，如果`persistent_peers_max_dial_period`大于零，
在指数退避期间，每次拨号到每个持久对等节点之间的暂停时间不会超过`persistent_peers_max_dial_period`，
我们会继续尝试重新连接而不放弃。

**注意：**如果`seeds`和`persistent_peers`有交集，
用户将收到警告，指出种子节点可能会自动关闭连接，
并且节点可能无法保持持久连接。

## 私有对等节点

`--p2p.private_peer_ids “id100000000000000000000000000000000,id200000000000000000000000000000000”`

这些是我们不会将其添加到地址簿或向其他对等节点传播的对等节点的ID。它们对我们来说是私有的。

## 无条件对等节点

`--p2p.unconditional_peer_ids “id100000000000000000000000000000000,id200000000000000000000000000000000”`

这些是允许通过入站或出站连接的对等节点的ID，无论用户节点的`max_num_inbound_peers`或`max_num_outbound_peers`是否达到。


# P2P Config

Here we describe configuration options around the Peer Exchange.
These can be set using flags or via the `$TMHOME/config/config.toml` file.

## Seed Mode

`--p2p.seed_mode`

The node operates in seed mode. In seed mode, a node continuously crawls the network for peers,
and upon incoming connection shares some peers and disconnects.

## Seeds

`--p2p.seeds “id100000000000000000000000000000000@1.2.3.4:26656,id200000000000000000000000000000000@2.3.4.5:4444”`

Dials these seeds when we need more peers. They should return a list of peers and then disconnect.
If we already have enough peers in the address book, we may never need to dial them.

## Persistent Peers

`--p2p.persistent_peers “id100000000000000000000000000000000@1.2.3.4:26656,id200000000000000000000000000000000@2.3.4.5:26656”`

Dial these peers and auto-redial them if the connection fails.
These are intended to be trusted persistent peers that can help
anchor us in the p2p network. The auto-redial uses exponential
backoff and will give up after a day of trying to connect.

But If `persistent_peers_max_dial_period` is set greater than zero,
pause between each dial to each persistent peer will not exceed `persistent_peers_max_dial_period`
during exponential backoff and we keep trying again without giving up

**Note:** If `seeds` and `persistent_peers` intersect,
the user will be warned that seeds may auto-close connections
and that the node may not be able to keep the connection persistent.

## Private Peers

`--p2p.private_peer_ids “id100000000000000000000000000000000,id200000000000000000000000000000000”`

These are IDs of the peers that we do not add to the address book or gossip to
other peers. They stay private to us.

## Unconditional Peers

`--p2p.unconditional_peer_ids “id100000000000000000000000000000000,id200000000000000000000000000000000”`

These are IDs of the peers which are allowed to be connected by both inbound or outbound regardless of
`max_num_inbound_peers` or `max_num_outbound_peers` of user's node reached or not.
