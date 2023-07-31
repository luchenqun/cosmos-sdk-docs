# Cosmos上的Bech32

在Cosmos网络中，优先使用Bech32地址格式来处理二进制数据。Bech32编码提供了对数据的强大完整性检查，而可读部分（HRP）则提供了上下文提示，可以帮助UI开发人员提供信息丰富的错误消息。

在Cosmos网络中，密钥和地址可以指代网络中的多种不同角色，如账户、验证人等。

## HRP表格

| HRP              | 定义                                  |
| ---------------- | ------------------------------------- |
| cosmos           | Cosmos账户地址                       |
| cosmosvalcons    | Cosmos验证人共识地址                  |
| cosmosvaloper    | Cosmos验证人操作地址                  |

## 编码

虽然所有面向用户的Cosmos软件界面都应该使用Bech32接口，但许多内部接口会将二进制值编码为十六进制或base64编码形式。

要在其他二进制表示的地址和密钥之间进行转换，首先需要在Bech32编码之前应用Amino编码过程。

在大多数情况下，不需要完整实现Amino序列化格式。只需在Bech32编码之前将字节从此[表格](https://github.com/cometbft/cometbft/blob/main/spec/blockchain/05-encoding.md)添加到字节字符串有效负载的前面，即可获得兼容的表示形式。


# Bech32 on Cosmos

The Cosmos network prefers to use the Bech32 address format wherever users must handle binary data. Bech32 encoding provides robust integrity checks on data and the human readable part (HRP) provides contextual hints that can assist UI developers with providing informative error messages.

In the Cosmos network, keys and addresses may refer to a number of different roles in the network like accounts, validators etc.

## HRP table

| HRP              | Definition                            |
| ---------------- | ------------------------------------- |
| cosmos           | Cosmos Account Address                |
| cosmosvalcons    | Cosmos Validator Consensus Address    |
| cosmosvaloper    | Cosmos Validator Operator Address     |

## Encoding

While all user facing interfaces to Cosmos software should exposed Bech32 interfaces, many internal interfaces encode binary value in hex or base64 encoded form.

To covert between other binary representation of addresses and keys, it is important to first apply the Amino encoding process before Bech32 encoding.

A complete implementation of the Amino serialization format is unnecessary in most cases. Simply prepending bytes from this [table](https://github.com/cometbft/cometbft/blob/main/spec/blockchain/05-encoding.md) to the byte string payload before Bech32 encoding will sufficient for compatible representation.
