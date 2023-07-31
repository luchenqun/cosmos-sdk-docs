---
order: 1
parent:
  title: 分叉检测
  order: 2
---

# Tendermint分叉检测和IBC分叉检测

## 状态

这是一个正在进行中的工作。
该目录记录了关于Tendermint轻节点和IBC上下文中分叉检测的工作和讨论。它包含以下文件：

### [detection.md](./detection.md)

轻节点分叉检测的草稿，包括“分叉证明”的定义，即向全节点提交证据的数据结构。

### [discussions.md](./discussions.md)

最近讨论中的想法和直觉的集合

- 最近讨论的结果
- 轻客户端监督器的草图，以提供分叉检测发生的上下文
- 关于lightstore语义的讨论

### [req-ibc-detection.md](./req-ibc-detection.md)

- IBC上下文中分叉检测的要求集合。特别是它包含了一个“ICS 007中所需的更改”部分，其中包含了支持Tendermint分叉检测所需的ICS 007的必要更新。

### [draft-functions.md](./draft-functions.md)

为了满足收集到的要求，我们开始勾勒出一些未来需要详细说明的函数

- 分叉检测
- 分叉证明生成
- 分叉证明验证

在以下组件上。

- IBC链上组件
- 中继器

### 待办事项

我们决定在还有待解决的问题时合并这些文件，以记录当前状态并继续前进。特别是，需要解决以下问题：

- <https://github.com/informalsystems/tendermint-rs/pull/479#discussion_r466504876>

- <https://github.com/informalsystems/tendermint-rs/pull/479#discussion_r466493900>
  
- <https://github.com/informalsystems/tendermint-rs/pull/479#discussion_r466489045>
  
- <https://github.com/informalsystems/tendermint-rs/pull/479#discussion_r466491471>
  
很可能我们会根据以下结果编写一个轻客户端监督器的规范

- <https://github.com/informalsystems/tendermint-rs/pull/509>

这也涉及到初始化

- <https://github.com/tendermint/spec/issues/131>


---
order: 1
parent:
  title: Fork Detection
  order: 2
---

# Tendermint fork detection and IBC fork detection

## Status

This is a work in progress.
This directory captures the ongoing work and discussion on fork
detection both in the context of a Tendermint light node and in the
context of IBC. It contains the following files

### [detection.md](./detection.md)

a draft of the light node fork detection including "proof of fork"
  definition, that is, the data structure to submit evidence to full
  nodes.
  
### [discussions.md](./discussions.md)

A collection of ideas and intuitions from recent discussions

- the outcome of recent discussion
- a sketch of the light client supervisor to provide the context in
  which fork detection happens
- a discussion about lightstore semantics

### [req-ibc-detection.md](./req-ibc-detection.md)

- a collection of requirements for fork detection in the IBC
  context. In particular it contains a section "Required Changes in
  ICS 007" with necessary updates to ICS 007 to support Tendermint
  fork detection

### [draft-functions.md](./draft-functions.md)

In order to address the collected requirements, we started to sketch
some functions that we will need in the future when we specify in more
detail the

- fork detections
- proof of fork generation
- proof of fork verification

on the following components.

- IBC on-chain components
- Relayer

### TODOs

We decided to merge the files while there are still open points to
address to record the current state an move forward. In particular,
the following points need to be addressed:

- <https://github.com/informalsystems/tendermint-rs/pull/479#discussion_r466504876>

- <https://github.com/informalsystems/tendermint-rs/pull/479#discussion_r466493900>
  
- <https://github.com/informalsystems/tendermint-rs/pull/479#discussion_r466489045>
  
- <https://github.com/informalsystems/tendermint-rs/pull/479#discussion_r466491471>
  
Most likely we will write a specification on the light client
supervisor along the outcomes of
  
- <https://github.com/informalsystems/tendermint-rs/pull/509>

that also addresses initialization

- <https://github.com/tendermint/spec/issues/131>
