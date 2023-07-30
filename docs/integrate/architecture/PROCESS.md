# ADR 创建流程

1. 复制 `adr-template.md` 文件。使用以下文件名模式：`adr-next_number-title.md`
2. 如果您想要获得早期反馈，请创建一个草稿 Pull Request。
3. 确保上下文和解决方案清晰并且有良好的文档记录。
4. 在 [README](README.md) 文件中的列表中添加一个条目。
5. 创建一个 Pull Request 来提议一个新的 ADR。

## 什么是 ADR？

ADR 是一个用于记录实现和设计的文档，这些实现和设计可能已经在 RFC 中讨论过，也可能没有。虽然 RFC 旨在取代分布式环境中的同步通信，但 ADR 旨在记录已经做出的决策。ADR 不会带来太多的沟通开销，因为讨论已经在 RFC 或同步讨论中记录下来。如果共识来自同步讨论，则应在 ADR 中添加一个简短的摘录来解释目标。

## ADR 生命周期

ADR 创建是一个**迭代**的过程。ADR 用于在已经做出决策并且需要添加实现细节时，以减少沟通开销。ADR 应该记录特定问题的集体共识以及如何解决它。

1. 每个 ADR 应该始于 RFC 或讨论，其中已经达成共识。

2. 一旦达成共识，就会创建一个 GitHub Pull Request（PR），其中包含基于 `adr-template.md` 的新文档。

3. 如果合并了一个 _proposed_ ADR，则应在 ADR 文档注释或 GitHub Issue 中清楚地记录未解决的问题。

4. PR 应该始终被合并。在出现错误的 ADR 的情况下，我们仍然更喜欢将其与 _rejected_ 状态合并。唯一不合并 ADR 的情况是作者放弃了它。

5. 合并的 ADR 不应被修剪。

### ADR 状态

状态由两个组成部分组成：

```text
{共识状态} {实现状态}
```

实现状态可以是 `Implemented` 或 `Not Implemented`。

#### 共识状态

```text
DRAFT -> PROPOSED -> LAST CALL yyyy-mm-dd -> ACCEPTED | REJECTED -> SUPERSEDED by ADR-xxx
                  \        |
                   \       |
                    v      v
                     ABANDONED
```

* `DRAFT`：[可选]正在进行中的 ADR，尚未准备好进行全面审查。这是为了展示早期工作并在草稿 Pull Request 形式中获得早期反馈。
* `PROPOSED`：涵盖完整解决方案架构并仍在审查中的 ADR - 项目利益相关者尚未达成一致意见。
* `LAST CALL <最后通知日期>`：[可选]明确通知我们即将接受更新。将状态更改为 `LAST CALL` 意味着已经达成了社会共识（Cosmos SDK 维护者的共识），我们仍然希望给予时间让社区做出反应或分析。
* `ACCEPTED`：代表当前已实施或将要实施的架构设计的 ADR。
* `REJECTED`：如果项目利益相关者之间的共识决定如此，ADR 可从 PROPOSED 或 ACCEPTED 转为 rejected。
* `SUPERSEEDED by ADR-xxx`：已被新 ADR 取代的 ADR。
* `ABANDONED`：原始作者不再追求该 ADR。

## ADR中使用的语言

* 上下文/背景应以现在时态写成。
* 避免使用第一人称形式。


# ADR Creation Process

1. Copy the `adr-template.md` file. Use the following filename pattern: `adr-next_number-title.md`
2. Create a draft Pull Request if you want to get an early feedback.
3. Make sure the context and a solution is clear and well documented.
4. Add an entry to a list in the [README](README.md) file.
5. Create a Pull Request to propose a new ADR.

## What is an ADR? 

An ADR is a document to document an implementation and design that may or may not have been discussed in an RFC. While an RFC is meant to replace synchoronus communication in a distributed environment, an ADR is meant to document an already made decision. An ADR wont come with much of a communication overhead because the discussion was recorded in an RFC or a synchronous discussion. If the consensus came from a synchoronus discussion then a short excerpt should be added to the ADR to explain the goals. 

## ADR life cycle

ADR creation is an **iterative** process. Instead of having a high amount of communication overhead, an ADR is used when there is already a decision made and implementation details need to be added. The ADR should document what the collective consensus for the specific issue is and how to solve it. 

1. Every ADR should start with either an RFC or discussion where consensus has been met. 

2. Once consensus is met, a GitHub Pull Request (PR) is created with a new document based on the `adr-template.md`.

3. If a _proposed_ ADR is merged, then it should clearly document outstanding issues either in ADR document notes or in a GitHub Issue.

4. The PR SHOULD always be merged. In the case of a faulty ADR, we still prefer to  merge it with a _rejected_ status. The only time the ADR SHOULD NOT be merged is if the author abandons it.

5. Merged ADRs SHOULD NOT be pruned.

### ADR status

Status has two components:

```text
{CONSENSUS STATUS} {IMPLEMENTATION STATUS}
```

IMPLEMENTATION STATUS is either `Implemented` or `Not Implemented`.

#### Consensus Status

```text
DRAFT -> PROPOSED -> LAST CALL yyyy-mm-dd -> ACCEPTED | REJECTED -> SUPERSEDED by ADR-xxx
                  \        |
                   \       |
                    v      v
                     ABANDONED
```

* `DRAFT`: [optional] an ADR which is work in progress, not being ready for a general review. This is to present an early work and get an early feedback in a Draft Pull Request form.
* `PROPOSED`: an ADR covering a full solution architecture and still in the review - project stakeholders haven't reached an agreed yet.
* `LAST CALL <date for the last call>`: [optional] clear notify that we are close to accept updates. Changing a status to `LAST CALL` means that social consensus (of Cosmos SDK maintainers) has been reached and we still want to give it a time to let the community react or analyze.
* `ACCEPTED`: ADR which will represent a currently implemented or to be implemented architecture design.
* `REJECTED`: ADR can go from PROPOSED or ACCEPTED to rejected if the consensus among project stakeholders will decide so.
* `SUPERSEEDED by ADR-xxx`: ADR which has been superseded by a new ADR.
* `ABANDONED`: the ADR is no longer pursued by the original authors.

## Language used in ADR

* The context/background should be written in the present tense.
* Avoid using a first, personal form.
