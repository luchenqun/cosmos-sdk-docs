---
order: 13
---

# 轻客户端

对于大多数应用程序来说，轻客户端是完整区块链系统的重要组成部分。Tendermint为轻客户端应用程序提供了独特的速度和安全性。

请参阅我们的[轻客户端包](https://pkg.go.dev/github.com/tendermint/tendermint/light?tab=doc)。

## 概述

轻客户端协议的目标是获取最近区块哈希的提交，其中提交包括来自最后已知验证器集合的大多数签名。从那里，可以使用[默克尔证明](https://github.com/tendermint/spec/blob/953523c3cb99fdb8c8f7a2d21e3a99094279e9de/spec/blockchain/encoding.md#iavl-tree)验证所有应用程序状态。

## 特性

- 您可以获得Tendermint的完整抵押安全性优势，无需等待确认。
- 您可以获得Tendermint的完整速度优势，交易立即提交。
- 您可以非交互式地获取应用程序状态的最新版本（无需将任何内容提交到区块链）。例如，这意味着您可以获取名称注册表中名称的最新值，而无需担心分叉审查攻击，也无需发布提交并等待确认。它快速、安全且免费！

## 获取可信高度和哈希的方法

[信任选项](https://pkg.go.dev/github.com/tendermint/tendermint/light?tab=doc#TrustOptions)

一种获取半可信哈希和高度的方法是查询多个完整节点并比较它们的哈希：

```bash
$ curl -s https://233.123.0.140:26657:26657/commit | jq "{height: .result.signed_header.header.height, hash: .result.signed_header.commit.block_id.hash}"
{
  "height": "273",
  "hash": "188F4F36CBCD2C91B57509BBF231C777E79B52EE3E0D90D06B1A25EB16E6E23D"
}
```

## 将轻客户端作为HTTP代理服务器运行

Tendermint附带了一个内置的`tendermint light`命令，可用于运行轻客户端代理服务器，验证Tendermint RPC。所有可以通过证明追溯到区块头的调用将在将其返回给调用方之前进行验证。除此之外，它将呈现与完整的Tendermint节点相同的接口。

您可以通过运行`Tendermint light <chainID>`来启动轻客户端代理服务器，使用各种标志来指定主节点、见证节点（用于交叉检查主节点提供的信息）、可信头的哈希和高度等。

例如：

```bash
$ tendermint light supernova -p tcp://233.123.0.140:26657 \
  -w tcp://179.63.29.15:26657,tcp://144.165.223.135:26657 \
  --height=10 --hash=37E9A6DD3FA25E83B22C18835401E8E56088D0D7ABC6FD99FCDC920DD76C1C57
```

要获取更多选项，请运行 `tendermint light --help`。


---
order: 13
---

# Light Client

Light clients are an important part of the complete blockchain system for most
applications. Tendermint provides unique speed and security properties for
light client applications.

See our [light
package](https://pkg.go.dev/github.com/tendermint/tendermint/light?tab=doc).

## Overview

The objective of the light client protocol is to get a commit for a recent
block hash where the commit includes a majority of signatures from the last
known validator set. From there, all the application state is verifiable with
[merkle proofs](https://github.com/tendermint/spec/blob/953523c3cb99fdb8c8f7a2d21e3a99094279e9de/spec/blockchain/encoding.md#iavl-tree).

## Properties

- You get the full collateralized security benefits of Tendermint; no
  need to wait for confirmations.
- You get the full speed benefits of Tendermint; transactions
  commit instantly.
- You can get the most recent version of the application state
  non-interactively (without committing anything to the blockchain). For
  example, this means that you can get the most recent value of a name from the
  name-registry without worrying about fork censorship attacks, without posting
  a commit and waiting for confirmations. It's fast, secure, and free!

## Where to obtain trusted height & hash

[Trust Options](https://pkg.go.dev/github.com/tendermint/tendermint/light?tab=doc#TrustOptions)

One way to obtain semi-trusted hash & height is to query multiple full nodes
and compare their hashes:

```bash
$ curl -s https://233.123.0.140:26657:26657/commit | jq "{height: .result.signed_header.header.height, hash: .result.signed_header.commit.block_id.hash}"
{
  "height": "273",
  "hash": "188F4F36CBCD2C91B57509BBF231C777E79B52EE3E0D90D06B1A25EB16E6E23D"
}
```

## Running a light client as an HTTP proxy server

Tendermint comes with a built-in `tendermint light` command, which can be used
to run a light client proxy server, verifying Tendermint RPC. All calls that
can be tracked back to a block header by a proof will be verified before
passing them back to the caller. Other than that, it will present the same
interface as a full Tendermint node.

You can start the light client proxy server by running `tendermint light <chainID>`,
with a variety of flags to specify the primary node,  the witness nodes (which cross-check
the information provided by the primary), the hash and height of the trusted header,
and more.

For example:

```bash
$ tendermint light supernova -p tcp://233.123.0.140:26657 \
  -w tcp://179.63.29.15:26657,tcp://144.165.223.135:26657 \
  --height=10 --hash=37E9A6DD3FA25E83B22C18835401E8E56088D0D7ABC6FD99FCDC920DD76C1C57
```

For additional options, run `tendermint light --help`.
