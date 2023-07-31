# 编码

## Protocol Buffers

Tendermint使用[Protocol Buffers](https://developers.google.com/protocol-buffers)（具体为proto3）来定义所有的数据结构。

请参阅[Proto3语言指南](https://developers.google.com/protocol-buffers/docs/proto3)以获取更多详细信息。

## 字节数组

字节数组的编码是将原始字节与数组长度作为`UVarint`（proto中称为`Varint`）的前缀。

有关varints的详细信息，请参阅[protobuf规范](https://developers.google.com/protocol-buffers/docs/encoding#varints)。

例如，字节数组`[0xA, 0xB]`将被编码为`0x020A0B`，而包含300个以`[0xA, 0xB, ...]`开头的条目的字节数组将被编码为`0xAC020A0B...`，其中`0xAC02`是300的UVarint编码。

## 哈希

Tendermint使用`SHA256`作为其哈希函数。
对象在进行哈希之前总是被序列化。
因此，`SHA256(obj)`等同于`SHA256(ProtoEncoding(obj))`。

## 公钥密码学

Tendermint使用Protobuf的[Oneof](https://developers.google.com/protocol-buffers/docs/proto3#oneof)来区分不同类型的公钥和签名。
此外，对于每个公钥，Tendermint定义了一个Address函数，可以用作更紧凑的标识符，代替公钥。
下面列出了具体类型、名称以及公钥和签名的前缀字节，以及每个PubKey的地址方案。
为简洁起见，我们不包含私钥的详细信息，仅列出其类型和名称。

### 密钥类型

每种类型都指定了其自己的公钥、地址和签名格式。

#### Ed25519

地址是原始32字节公钥的SHA256哈希的前20字节：

```go
address = SHA256(pubkey)[:20]
```

签名是原始64字节的ED25519签名。

Tendermint采用了[zip215](https://zips.z.cash/zip-0215)来验证ed25519签名。

> 注意：此更改将在Tendermint-Go的下一个主要版本（0.35）中发布。

#### Secp256k1

地址是原始32字节公钥的SHA256哈希的前20字节：

```go
address = SHA256(pubkey)[:20]
```

## 其他常见类型

### BitArray

BitArray 在一些共识消息中用于表示从验证者接收到的投票或从块中接收到的部分。它由一个包含位数 (`Bits`) 和以 base64 编码的位数组 (`Elems`) 的结构体表示。

| 名称   | 类型                          |
|--------|-------------------------------|
| bits   | int64                         |
| elems  | int64 切片 (`[]int64`)         |

注意：BitArray 在 JSON 编码中以 `x` 和 `_` 表示 `1` 和 `0`。例如，BitArray `10110` 在 JSON 编码中为 `"x_xx_"`。

### Part

Part 用于将块分解为可以并行传播和使用部分的 Merkle 树进行安全验证的片段。

Part 包含部分的索引 (`Index`)、部分的实际底层数据 (`Bytes`) 和证明该部分包含在集合中的 Merkle 证明 (`Proof`)。

| 名称   | 类型                          |
|--------|-------------------------------|
| index  | uint32                        |
| bytes  | 字节切片 (`[]byte`)            |
| proof  | [proof](#merkle-proof)        |

请参阅下面的 SimpleProof 的详细信息。

### MakeParts

使用 Protobuf 对象进行编码，并将其切片为多个部分。
Tendermint 使用 65536 字节的部分大小，并允许最多 1601 个部分（参见 `types.MaxBlockPartsCount`）。这对应于硬编码的块大小限制为 100MB。

```go
func MakeParts(block Block) []Part
```

## Merkle 树

有关 Merkle 树的概述，请参见 [维基百科](https://en.wikipedia.org/wiki/Merkle_tree)。

我们使用 RFC 6962 规范的 Merkle 树，其中哈希函数为 sha256。Merkle 树在 Tendermint 中用于计算数据结构的加密摘要。
RFC 6962 和最简单形式的 Merkle 树之间的区别在于：

1. 叶节点和内部节点具有不同的哈希值。
   这是为了实现 "第二原像抗性"，防止内部节点的证明被作为叶节点的证明有效。
   叶节点的哈希值为 `SHA256(0x00 || 叶数据)`，内部节点的哈希值为 `SHA256(0x01 || 左哈希 || 右哈希)`。

2. 当项目数量不是2的幂时，树的左半部分尽可能大。
   （小于项目数量的最大2的幂）这样可以在添加新叶子时减少重新计算。例如：

```md
   Simple Tree with 6 items           Simple Tree with 7 items

              *                                  *
             / \                                / \
           /     \                            /     \
         /         \                        /         \
       /             \                    /             \
      *               *                  *               *
     / \             / \                / \             / \
    /   \           /   \              /   \           /   \
   /     \         /     \            /     \         /     \
  *       *       h4     h5          *       *       *       h6
 / \     / \                        / \     / \     / \
h0  h1  h2 h3                      h0  h1  h2  h3  h4  h5
```

### MerkleRoot

函数`MerkleRoot`是一个简单的递归函数，定义如下：

```go
// SHA256([]byte{})
func emptyHash() []byte {
    return tmhash.Sum([]byte{})
}

// SHA256(0x00 || leaf)
func leafHash(leaf []byte) []byte {
 return tmhash.Sum(append(0x00, leaf...))
}

// SHA256(0x01 || left || right)
func innerHash(left []byte, right []byte) []byte {
 return tmhash.Sum(append(0x01, append(left, right...)...))
}

// largest power of 2 less than k
func getSplitPoint(k int) { ... }

func MerkleRoot(items [][]byte) []byte{
 switch len(items) {
 case 0:
  return empthHash()
 case 1:
  return leafHash(items[0])
 default:
  k := getSplitPoint(len(items))
  left := MerkleRoot(items[:k])
  right := MerkleRoot(items[k:])
  return innerHash(left, right)
 }
}
```

注意：`MerkleRoot`操作的是任意字节数组的项目，不一定是哈希值。对于需要先进行哈希的项目，我们引入了`Hashes`函数：

```go
func Hashes(items [][]byte) [][]byte {
    return SHA256 of each item
}
```

注意：我们会滥用概念，并使用类型为`struct`或`[]struct`的参数调用`MerkleRoot`。对于`struct`参数，我们计算一个包含结构体中每个字段的protobuf编码的`[][]byte`，按照结构体中字段出现的顺序排列。对于`[]struct`参数，我们通过对各个`struct`元素进行protobuf编码，计算一个`[][]byte`。

### Merkle Proof

证明一个叶子在Merkle树中的方法如下：

| 名称      | 类型                          |
|-----------|-------------------------------|
| total     | int64                         |
| index     | int64                         |
| leafHash  | 字节切片 (`[]byte`)            |
| aunts     | 字节矩阵 ([][]byte)            |

验证方法如下：

```golang
func (proof Proof) Verify(rootHash []byte, leaf []byte) bool {
 assert(proof.LeafHash, leafHash(leaf)

 computedHash := computeHashFromAunts(proof.Index, proof.Total, proof.LeafHash, proof.Aunts)
    return computedHash == rootHash
}

func computeHashFromAunts(index, total int, leafHash []byte, innerHashes [][]byte) []byte{
 assert(index < total && index >= 0 && total > 0)

 if total == 1{
  assert(len(proof.Aunts) == 0)
  return leafHash
 }

 assert(len(innerHashes) > 0)

 numLeft := getSplitPoint(total) // largest power of 2 less than total
 if index < numLeft {
  leftHash := computeHashFromAunts(index, numLeft, leafHash, innerHashes[:len(innerHashes)-1])
  assert(leftHash != nil)
  return innerHash(leftHash, innerHashes[len(innerHashes)-1])
 }
 rightHash := computeHashFromAunts(index-numLeft, total-numLeft, leafHash, innerHashes[:len(innerHashes)-1])
 assert(rightHash != nil)
 return innerHash(innerHashes[len(innerHashes)-1], rightHash)
}
```

阿姨的数量限制为100（`MaxAunts`），以保护节点免受DOS攻击。
这将树的大小限制为2^100个叶子，对于任何可想象的目的应该足够了。

### IAVL+树

因为Tendermint只使用了一个简单的Merkle树，应用程序开发者需要在他们的应用程序中使用自己的Merkle树。例如，IAVL+树是一种用于持久化应用程序状态的不可变自平衡二叉树，被[Cosmos SDK](https://github.com/cosmos/cosmos-sdk/blob/ae77f0080a724b159233bd9b289b2e91c0de21b5/docs/interfaces/lite/specification.md)使用。

## JSON

Tendermint有自己的JSON编码，以保持与先前的RPC层的向后兼容性。

已注册的类型被编码为：

```json
{
  "type": "<type name>",
  "value": <JSON>
}
```

例如，一个ED25519 PubKey看起来像：

```json
{
  "type": "tendermint/PubKeyEd25519",
  "value": "uZ4h63OFWuQ36ZZ4Bd6NF+/w9fWUwrOncrQsackrsTk="
}
```

其中 `"value"` 是原始公钥字节的base64编码，`"type"` 是Ed25519公钥的类型名称。

### 签名消息

共识中的签名消息（例如，投票、提案）使用protobuf进行编码。

在签名时，消息的元素被重新排序，使得固定长度的字段首先出现，这样可以快速检查类型、高度和轮数。
`ChainID` 也附加在末尾。
我们称这种编码为 SignBytes。例如，投票的 SignBytes 是以下结构的protobuf编码：

```protobuf
message CanonicalVote {
  SignedMsgType             type      = 1;  
  sfixed64                  height    = 2;  // canonicalization requires fixed size encoding here
  sfixed64                  round     = 3;  // canonicalization requires fixed size encoding here
  CanonicalBlockID          block_id  = 4;
  google.protobuf.Timestamp timestamp = 5;
  string                    chain_id  = 6;
}
```

字段的排序和前三个字段的固定大小编码被优化，以便于在HSM中解析 SignBytes。它为需要在这个上下文中读取的相关字段创建了固定的偏移量。

> 注意：所有规范消息都有长度前缀。

更多详情，请参阅[签名规范](../consensus/signing.md)。
此外，还请参阅[#1622](https://github.com/tendermint/tendermint/issues/1622)中的相关讨论。


# Encoding

## Protocol Buffers

Tendermint uses [Protocol Buffers](https://developers.google.com/protocol-buffers), specifically proto3, for all data structures.

Please see the [Proto3 language guide](https://developers.google.com/protocol-buffers/docs/proto3) for more details.

## Byte Arrays

The encoding of a byte array is simply the raw-bytes prefixed with the length of
the array as a `UVarint` (what proto calls a `Varint`).

For details on varints, see the [protobuf
spec](https://developers.google.com/protocol-buffers/docs/encoding#varints).

For example, the byte-array `[0xA, 0xB]` would be encoded as `0x020A0B`,
while a byte-array containing 300 entires beginning with `[0xA, 0xB, ...]` would
be encoded as `0xAC020A0B...` where `0xAC02` is the UVarint encoding of 300.

## Hashing

Tendermint uses `SHA256` as its hash function.
Objects are always serialized before being hashed.
So `SHA256(obj)` is short for `SHA256(ProtoEncoding(obj))`.

## Public Key Cryptography

Tendermint uses Protobuf [Oneof](https://developers.google.com/protocol-buffers/docs/proto3#oneof)
to distinguish between different types public keys, and signatures.
Additionally, for each public key, Tendermint
defines an Address function that can be used as a more compact identifier in
place of the public key. Here we list the concrete types, their names,
and prefix bytes for public keys and signatures, as well as the address schemes
for each PubKey. Note for brevity we don't
include details of the private keys beyond their type and name.

### Key Types

Each type specifies it's own pubkey, address, and signature format.

#### Ed25519

The address is the first 20-bytes of the SHA256 hash of the raw 32-byte public key:

```go
address = SHA256(pubkey)[:20]
```

The signature is the raw 64-byte ED25519 signature.

Tendermint adopted [zip215](https://zips.z.cash/zip-0215) for verification of ed25519 signatures.

> Note: This change will be released in the next major release of Tendermint-Go (0.35).

#### Secp256k1

The address is the first 20-bytes of the SHA256 hash of the raw 32-byte public key:

```go
address = SHA256(pubkey)[:20]
```

## Other Common Types

### BitArray

The BitArray is used in some consensus messages to represent votes received from
validators, or parts received in a block. It is represented
with a struct containing the number of bits (`Bits`) and the bit-array itself
encoded in base64 (`Elems`).

| Name  | Type                       |
|-------|----------------------------|
| bits  | int64                      |
| elems | slice of int64 (`[]int64`) |

Note BitArray receives a special JSON encoding in the form of `x` and `_`
representing `1` and `0`. Ie. the BitArray `10110` would be JSON encoded as
`"x_xx_"`

### Part

Part is used to break up blocks into pieces that can be gossiped in parallel
and securely verified using a Merkle tree of the parts.

Part contains the index of the part (`Index`), the actual
underlying data of the part (`Bytes`), and a Merkle proof that the part is contained in
the set (`Proof`).

| Name  | Type                      |
|-------|---------------------------|
| index | uint32                    |
| bytes | slice of bytes (`[]byte`) |
| proof | [proof](#merkle-proof)    |

See details of SimpleProof, below.

### MakeParts

Encode an object using Protobuf and slice it into parts.
Tendermint uses a part size of 65536 bytes, and allows a maximum of 1601 parts
(see `types.MaxBlockPartsCount`). This corresponds to the hard-coded block size
limit of 100MB.

```go
func MakeParts(block Block) []Part
```

## Merkle Trees

For an overview of Merkle trees, see
[wikipedia](https://en.wikipedia.org/wiki/Merkle_tree)

We use the RFC 6962 specification of a merkle tree, with sha256 as the hash function.
Merkle trees are used throughout Tendermint to compute a cryptographic digest of a data structure.
The differences between RFC 6962 and the simplest form a merkle tree are that:

1. leaf nodes and inner nodes have different hashes.
   This is for "second pre-image resistance", to prevent the proof to an inner node being valid as the proof of a leaf.
   The leaf nodes are `SHA256(0x00 || leaf_data)`, and inner nodes are `SHA256(0x01 || left_hash || right_hash)`.

2. When the number of items isn't a power of two, the left half of the tree is as big as it could be.
   (The largest power of two less than the number of items) This allows new leaves to be added with less
   recomputation. For example:

```md
   Simple Tree with 6 items           Simple Tree with 7 items

              *                                  *
             / \                                / \
           /     \                            /     \
         /         \                        /         \
       /             \                    /             \
      *               *                  *               *
     / \             / \                / \             / \
    /   \           /   \              /   \           /   \
   /     \         /     \            /     \         /     \
  *       *       h4     h5          *       *       *       h6
 / \     / \                        / \     / \     / \
h0  h1  h2 h3                      h0  h1  h2  h3  h4  h5
```

### MerkleRoot

The function `MerkleRoot` is a simple recursive function defined as follows:

```go
// SHA256([]byte{})
func emptyHash() []byte {
    return tmhash.Sum([]byte{})
}

// SHA256(0x00 || leaf)
func leafHash(leaf []byte) []byte {
 return tmhash.Sum(append(0x00, leaf...))
}

// SHA256(0x01 || left || right)
func innerHash(left []byte, right []byte) []byte {
 return tmhash.Sum(append(0x01, append(left, right...)...))
}

// largest power of 2 less than k
func getSplitPoint(k int) { ... }

func MerkleRoot(items [][]byte) []byte{
 switch len(items) {
 case 0:
  return empthHash()
 case 1:
  return leafHash(items[0])
 default:
  k := getSplitPoint(len(items))
  left := MerkleRoot(items[:k])
  right := MerkleRoot(items[k:])
  return innerHash(left, right)
 }
}
```

Note: `MerkleRoot` operates on items which are arbitrary byte arrays, not
necessarily hashes. For items which need to be hashed first, we introduce the
`Hashes` function:

```go
func Hashes(items [][]byte) [][]byte {
    return SHA256 of each item
}
```

Note: we will abuse notion and invoke `MerkleRoot` with arguments of type `struct` or type `[]struct`.
For `struct` arguments, we compute a `[][]byte` containing the protobuf encoding of each
field in the struct, in the same order the fields appear in the struct.
For `[]struct` arguments, we compute a `[][]byte` by protobuf encoding the individual `struct` elements.

### Merkle Proof

Proof that a leaf is in a Merkle tree is composed as follows:

| Name     | Type                       |
|----------|----------------------------|
| total    | int64                      |
| index    | int64                      |
| leafHash | slice of bytes (`[]byte`)  |
| aunts    | Matrix of bytes ([][]byte) |

Which is verified as follows:

```golang
func (proof Proof) Verify(rootHash []byte, leaf []byte) bool {
 assert(proof.LeafHash, leafHash(leaf)

 computedHash := computeHashFromAunts(proof.Index, proof.Total, proof.LeafHash, proof.Aunts)
    return computedHash == rootHash
}

func computeHashFromAunts(index, total int, leafHash []byte, innerHashes [][]byte) []byte{
 assert(index < total && index >= 0 && total > 0)

 if total == 1{
  assert(len(proof.Aunts) == 0)
  return leafHash
 }

 assert(len(innerHashes) > 0)

 numLeft := getSplitPoint(total) // largest power of 2 less than total
 if index < numLeft {
  leftHash := computeHashFromAunts(index, numLeft, leafHash, innerHashes[:len(innerHashes)-1])
  assert(leftHash != nil)
  return innerHash(leftHash, innerHashes[len(innerHashes)-1])
 }
 rightHash := computeHashFromAunts(index-numLeft, total-numLeft, leafHash, innerHashes[:len(innerHashes)-1])
 assert(rightHash != nil)
 return innerHash(innerHashes[len(innerHashes)-1], rightHash)
}
```

The number of aunts is limited to 100 (`MaxAunts`) to protect the node against DOS attacks.
This limits the tree size to 2^100 leaves, which should be sufficient for any
conceivable purpose.

### IAVL+ Tree

Because Tendermint only uses a Simple Merkle Tree, application developers are expect to use their own Merkle tree in their applications. For example, the IAVL+ Tree - an immutable self-balancing binary tree for persisting application state is used by the [Cosmos SDK](https://github.com/cosmos/cosmos-sdk/blob/ae77f0080a724b159233bd9b289b2e91c0de21b5/docs/interfaces/lite/specification.md)

## JSON

Tendermint has its own JSON encoding in order to keep backwards compatibility with the previous RPC layer.

Registered types are encoded as:

```json
{
  "type": "<type name>",
  "value": <JSON>
}
```

For instance, an ED25519 PubKey would look like:

```json
{
  "type": "tendermint/PubKeyEd25519",
  "value": "uZ4h63OFWuQ36ZZ4Bd6NF+/w9fWUwrOncrQsackrsTk="
}
```

Where the `"value"` is the base64 encoding of the raw pubkey bytes, and the
`"type"` is the type name for Ed25519 pubkeys.

### Signed Messages

Signed messages (eg. votes, proposals) in the consensus are encoded using protobuf.

When signing, the elements of a message are re-ordered so the fixed-length fields
are first, making it easy to quickly check the type, height, and round.
The `ChainID` is also appended to the end.
We call this encoding the SignBytes. For instance, SignBytes for a vote is the protobuf encoding of the following struct:

```protobuf
message CanonicalVote {
  SignedMsgType             type      = 1;  
  sfixed64                  height    = 2;  // canonicalization requires fixed size encoding here
  sfixed64                  round     = 3;  // canonicalization requires fixed size encoding here
  CanonicalBlockID          block_id  = 4;
  google.protobuf.Timestamp timestamp = 5;
  string                    chain_id  = 6;
}
```

The field ordering and the fixed sized encoding for the first three fields is optimized to ease parsing of SignBytes
in HSMs. It creates fixed offsets for relevant fields that need to be read in this context.

> Note: All canonical messages are length prefixed.

For more details, see the [signing spec](../consensus/signing.md).
Also, see the motivating discussion in
[#1622](https://github.com/tendermint/tendermint/issues/1622).
