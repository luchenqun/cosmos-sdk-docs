# 概述

这是一个简化的 Tendermint 共识的 TLA+ 规范，专注于分叉的可追究性。以下是对规范进行的简化：

- 协议只运行一个高度，即一次性共识。

- 该规范侧重于安全性，因此超时是用非确定性建模的。

- 提议者函数是非确定性的，不假设公平性。

- 故障进程的消息在初始状态中被注入。

- 每个进程的投票权重为1。

- 哈希被建模为身份。

在考虑上述假设的情况下，该规范遵循 Tendermint 论文的伪代码：<https://arxiv.org/abs/1807.04938>

拜占庭进程可以展示任意行为，包括没有通信。然而，我们必须展示，在正确进程收集的集体证据下，至少 `f+1` 个拜占庭进程展示以下行为之一：

- 矛盾：拜占庭进程在同一轮中发送两个不同的值。

- 遗忘：拜占庭进程锁定一个值，尽管它在过去已经锁定了另一个值。

# TLA+ 模块

- [TendermintAcc_004_draft](TendermintAcc_004_draft.tla) 是协议规范。

- [TendermintAccInv_004_draft](TendermintAccInv_004_draft.tla) 包含用于建立协议安全性以及分叉情况的归纳不变量。

- `MC_n<n>_f<f>`，例如 [MC_n4_f1](MC_n4_f1.tla)，包含用于使用 [Apalache 模型检查器](https://github.com/informalsystems/apalache) 进行模型检查的固定常量。

- [TendermintAccTrace_004_draft](TendermintAccTrace_004_draft.tla) 展示了如何将执行空间限制为固定的操作序列（例如，实例化反例）。

- [TendermintAccDebug_004_draft](TendermintAccDebug_004_draft.tla) 包含用于使用 TLC 和 Apalache 调试协议规范的有用定义。

# 对分叉场景的推理

定理陈述可以在 [TendermintAccInv_004_draft.tla](TendermintAccInv_004_draft.tla) 中找到。

首先，我们想要展示`TypedInv`是一个归纳不变量。
形式上，该语句如下所示：

```tla
THEOREM TypedInvIsInductive ==
    \/ FaultyQuorum
    \//\ Init => TypedInv
      /\ TypedInv /\ [Next]_vars => TypedInv'
```

当超过三分之二的进程出现故障时，`TypedInv`不是归纳的。
然而，在这种情况下，修复协议是没有希望的。我们只对4到5个验证者的固定实例运行[Apalache](https://github.com/informalsystems/apalache)来证明这个定理。Apalache目前不解析定理语句，所以我们使用一个shell脚本来运行Apalache。要找到一个参数化的参数，必须使用一个定理证明器，例如TLAPS。

其次，我们想要展示这个不变量意味着`Agreement`，也就是说，在不到三分之一的进程出现故障的情况下，不会出现分叉。通过将这个定理与前一个定理结合起来，我们得出结论，协议确实在`LessThanThirdFaulty`条件下满足了`Agreement`。

```tla
THEOREM AgreementWhenLessThanThirdFaulty ==
    LessThanThirdFaulty /\ TypedInv => Agreement
```

第三，在一般情况下，我们要么没有分叉，要么有两种分叉情况：

```tla
THEOREM AgreementOrFork ==
    ~FaultyQuorum /\ TypedInv => Accountability
```

# 模型检查结果

请查看[使用Apalache进行模型检查的报告](./results/001indinv-apalache-report.md)。

要运行模型检查实验，请使用以下脚本：

```console
./run.sh
```

该脚本假设apalache构建可在`~/devl/apalache-unstable`中使用。



# Synopsis

 A TLA+ specification of a simplified Tendermint consensus, tuned for
 fork accountability. The simplifications are as follows:

- the procotol runs for one height, that is, one-shot consensus

- this specification focuses on safety, so timeouts are modelled with
   with non-determinism

- the proposer function is non-determinstic, no fairness is assumed

- the messages by the faulty processes are injected right in the initial states

- every process has the voting power of 1

- hashes are modelled as identity

 Having the above assumptions in mind, the specification follows the pseudo-code
 of the Tendermint paper: <https://arxiv.org/abs/1807.04938>

 Byzantine processes can demonstrate arbitrary behavior, including
 no communication. However, we have to show that under the collective evidence
 collected by the correct processes, at least `f+1` Byzantine processes demonstrate
 one of the following behaviors:

- Equivocation: a Byzantine process sends two different values
     in the same round.

- Amnesia: a Byzantine process locks a value, although it has locked
     another value in the past.

# TLA+ modules

- [TendermintAcc_004_draft](TendermintAcc_004_draft.tla) is the protocol
   specification,

- [TendermintAccInv_004_draft](TendermintAccInv_004_draft.tla) contains an
   inductive invariant for establishing the protocol safety as well as the
   forking cases,

- `MC_n<n>_f<f>`, e.g., [MC_n4_f1](MC_n4_f1.tla), contains fixed constants for
   model checking with the [Apalache model
   checker](https://github.com/informalsystems/apalache),

- [TendermintAccTrace_004_draft](TendermintAccTrace_004_draft.tla) shows how
   to restrict the execution space to a fixed sequence of actions (e.g., to
   instantiate a counterexample),

- [TendermintAccDebug_004_draft](TendermintAccDebug_004_draft.tla) contains
   the useful definitions for debugging the protocol specification with TLC and
   Apalache.

# Reasoning about fork scenarios

The theorem statements can be found in
[TendermintAccInv_004_draft.tla](TendermintAccInv_004_draft.tla).

First, we would like to show that `TypedInv` is an inductive invariant.
Formally, the statement looks as follows:

```tla
THEOREM TypedInvIsInductive ==
    \/ FaultyQuorum
    \//\ Init => TypedInv
      /\ TypedInv /\ [Next]_vars => TypedInv'
```

When over two-thirds of processes are faulty, `TypedInv` is not inductive.
However, there is no hope to repair the protocol in this case. We run
[Apalache](https://github.com/informalsystems/apalache) to prove this theorem
only for fixed instances of 4 to 5 validators.  Apalache does not parse theorem
statements at the moment, so we ran Apalache using a shell script. To find a
parameterized argument, one has to use a theorem prover, e.g., TLAPS.

Second, we would like to show that the invariant implies `Agreement`, that is,
no fork, provided that less than one third of processes is faulty. By combining
this theorem with the previous theorem, we conclude that the protocol indeed
satisfies Agreement under the condition `LessThanThirdFaulty`.

```tla
THEOREM AgreementWhenLessThanThirdFaulty ==
    LessThanThirdFaulty /\ TypedInv => Agreement
```

Third, in the general case, we either have no fork, or two fork scenarios:

```tla
THEOREM AgreementOrFork ==
    ~FaultyQuorum /\ TypedInv => Accountability
```

# Model checking results

Check the report on [model checking with Apalache](./results/001indinv-apalache-report.md).

To run the model checking experiments, use the script:

```console
./run.sh
```

This script assumes that the apalache build is available in
`~/devl/apalache-unstable`.
