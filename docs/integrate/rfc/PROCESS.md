# RFC创建流程

1. 复制`rfc-template.md`文件。使用以下文件名模式：`rfc-next_number-title.md`
2. 如果您想要获得早期反馈，请创建一个草案Pull Request。
3. 确保上下文和解决方案清晰并且有良好的文档记录。
4. 在[README](README.md)文件的列表中添加一个条目。
5. 创建一个Pull Request来提议一个新的ADR。

## 什么是RFC？

RFC是一种异步的白板讨论会。它旨在取代分布式团队共同做出决策的需要。目前，Cosmos SDK团队和贡献者分布在世界各地。团队进行工作组以进行同步讨论，而RFC可以用来记录讨论，以便更广泛的观众更好地理解即将到来的软件变化。

Cosmos SDK将RFC和ADR之间的主要区别定义为一种达成共识并传播有关潜在变化或功能的信息的方式。如果对某个功能或变化已经达成共识，并且不需要明确说明即将到来的变化，则使用ADR。ADR将详细说明变化并具有较少的沟通量。

## RFC生命周期

RFC的创建是一个**迭代**的过程。RFC旨在作为分布式协作会议，可能会有很多评论，通常是没有工作组或同步通信的副产品。

1. 提案可以从一个新的GitHub Issue开始，也可以是现有Issue或讨论的结果。

2. RFC不必在单个PR中以“已接受”的状态到达`main`分支。如果动机明确，解决方案可行，我们应该能够合并它并保持“建议”状态。与其有长时间未合并的Pull Request，更好的做法是采用迭代方法。

3. 如果合并了一个“建议”状态的RFC，则应在RFC文档注释或GitHub Issue中清楚地记录未解决的问题。

4. PR应始终被合并。在出现错误的RFC的情况下，我们仍然更喜欢将其与“已拒绝”的状态合并。唯一不应合并RFC的情况是作者放弃了该RFC。

5. 合并的RFC不应该被删除。

6. 如果达成共识并获得足够的反馈，则可以接受RFC。

> 注意：当没有工作组或团队会议讨论问题时，才编写RFC。RFC旨在作为分布式白板会议。如果有关于提案的工作组，则不需要有RFC，因为已经进行了同步的白板讨论。

### RFC状态

状态有两个组成部分：

```text
{CONSENSUS STATUS}
```

#### 共识状态

```text
DRAFT -> PROPOSED -> LAST CALL yyyy-mm-dd -> ACCEPTED | REJECTED -> SUPERSEDED by ADR-xxx
                  \        |
                   \       |
                    v      v
                     ABANDONED
```

* `DRAFT`：[可选]正在进行中的ADR，尚未准备好进行全面审查。这是为了展示早期工作并在草案拉取请求形式中获得早期反馈。
* `PROPOSED`：涵盖完整解决方案架构并仍在审查中的ADR-项目利益相关者尚未达成一致意见。
* `LAST CALL <最后通知日期>`：[可选]明确通知我们即将接受更新。将状态更改为`LAST CALL`意味着已经达成了社会共识（Cosmos SDK维护者的共识），我们仍然希望给予时间让社区做出反应或分析。
* `ACCEPTED`：ADR将代表当前已实施或将要实施的架构设计。
* `REJECTED`：如果项目利益相关者之间达成共识，则从`PROPOSED`或`ACCEPTED`转为被拒绝。
* `SUPERSEEDED by ADR-xxx`：已被新的ADR取代的ADR。
* `ABANDONED`：原始作者不再追求该ADR。

## RFC中使用的语言

* 背景/目标应以现在时态写成。
* 避免使用第一人称形式。


# RFC Creation Process

1. Copy the `rfc-template.md` file. Use the following filename pattern: `rfc-next_number-title.md`
2. Create a draft Pull Request if you want to get an early feedback.
3. Make sure the context and a solution is clear and well documented.
4. Add an entry to a list in the [README](README.md) file.
5. Create a Pull Request to propose a new ADR.

## What is an RFC?

An RFC is a sort of async whiteboarding session. It is meant to replace the need for a distributed team to come together to make a decision. Currently, the Cosmos SDK team and contributors are distributed around the world. The team conducts working groups to have a synchronous discussion and an RFC can be used to capture the discussion for a wider audience to better understand the changes that are coming to the software. 

The main difference the Cosmos SDK is defining as a differentiation between RFC and ADRs is that one is to come to consensus and circulate information about a potential change or feature. An ADR is used if there is already consensus on a feature or change and there is not a need to articulate the change coming to the software. An ADR will articulate the changes and have a lower amount of communication .   

## RFC life cycle

RFC creation is an **iterative** process. An RFC is meant as a distributed colloboration session, it may have many comments and is usually the bi-product of no working group or synchornous communication 

1. Proposals could start with a new GitHub Issue,  be a result of existing Issues or a discussion.

2. An RFC doesn't have to arrive to `main` with an _accepted_ status in a single PR. If the motivation is clear and the solution is sound, we SHOULD be able to merge it and keep a _proposed_ status. It's preferable to have an iterative approach rather than long, not merged Pull Requests.

3. If a _proposed_ RFC is merged, then it should clearly document outstanding issues either in the RFC document notes or in a GitHub Issue.

4. The PR SHOULD always be merged. In the case of a faulty RFC, we still prefer to  merge it with a _rejected_ status. The only time the RFC SHOULD NOT be merged is if the author abandons it.

5. Merged RFCs SHOULD NOT be pruned.

6. If there is consensus and enough feedback then the RFC can be accepted. 

> Note: An RFC is written when there is no working group or team session on the problem. RFC's are meant as a distributed white boarding session. If there is a working group on the proposal there is no need to have an RFC as there is synchornous whiteboarding going on. 

### RFC status

Status has two components:

```text
{CONSENSUS STATUS}
```

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

## Language used in RFC

* The background/goal should be written in the present tense.
* Avoid using a first, personal form.
