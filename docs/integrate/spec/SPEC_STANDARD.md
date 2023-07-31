# 什么是SDK标准？

SDK标准是一份设计文档，描述了Cosmos SDK预期使用的特定协议、标准或功能。SDK标准应列出标准的期望属性，解释设计原理，并提供简明但全面的技术规范。主要作者负责推动提案通过标准化流程，征求社区的意见和支持，并与相关利益相关者进行沟通，以确保（社会）共识。

## 章节

SDK标准包括：

* 概要，
* 概述和基本概念，
* 技术规范，
* 历史记录，以及
* 版权声明。

所有顶级章节都是必需的。引用应以内联链接的形式包含在内，或者在必要时以表格形式列在章节底部。包含的子章节应按照指定的顺序列出。

### 目录

在文件顶部提供一个目录，以帮助读者导航。

### 概要

文档应包括一个简短（约200字）的概要，提供对规范的高级描述和基本原理。

### 概述和基本概念

该部分应包括一个动机子部分和一个定义子部分（如果需要）：

* *动机* - 对所提议的功能存在的理由，或对现有功能所提议的更改的理由。
* *定义* - 列出文档中使用或需要理解的新术语或概念的列表。

### 系统模型和属性

该部分应包括一个假设子部分（如果有），强制属性子部分和依赖关系子部分。请注意，前两个子部分是紧密耦合的：如何强制属性将直接取决于所做的假设。该子部分对于捕捉指定功能与“整个世界”即生态系统中的其他功能的交互非常重要。

* *假设* - 功能设计者所做的任何假设的列表。它应该捕捉到规范下的功能使用了哪些功能，以及我们对它们的期望。
* *属性* - 指定功能的期望属性或特征的列表，以及在违反这些属性时预期的效果或故障。如果相关，还可以包括功能不保证的属性列表。
* *依赖关系* - 使用规范下的功能以及如何使用的功能的列表。

### 技术规范

这是文档的主要部分，应包含协议文档、设计原理、必要的参考资料和适当的技术细节。
根据具体规范的需要，本节可以包含以下任意或全部子节。特别鼓励在适当的情况下包含API子节。

* *API* - 对功能的API的详细描述。
* *技术细节* - 所有技术细节，包括语法、图表、语义、协议、数据结构、算法和伪代码等。技术规范应该足够详细，以便在不知道彼此的情况下，可以正确实现规范并保持兼容性。
* *向后兼容性* - 讨论与先前功能或协议版本的兼容性（或不兼容性）。
* *已知问题* - 已知问题的列表。对于已经在使用中的功能的规范，这个子节尤为重要。
* *示例实现* - 具体的示例实现或对预期实现的描述，作为实施者的主要参考。

### 历史

规范应包括一个历史部分，列出任何启发性文件和重大更改的纯文本日志。

请参见下面的一个历史部分示例 [below](#history-1)。

### 版权

规范应包括一个版权部分，通过 [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) 放弃权利。

## 格式

### 通用

规范必须使用 GitHub风格的Markdown编写。

有关GitHub风格的Markdown备忘单，请参见[此处](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet)。有关本地Markdown渲染器，请参见[此处](https://github.com/joeyespo/grip)。

### 语言

规范应使用简单英语编写，避免使用晦涩的术语和不必要的行话。有关简单英语的优秀示例，请参见[简单英语维基百科](https://simple.wikipedia.org/wiki/Main_Page)。

在规范中，关键词"MUST"、"MUST NOT"、"REQUIRED"、"SHALL"、"SHALL NOT"、"SHOULD"、"SHOULD NOT"、"RECOMMENDED"、"MAY"和"OPTIONAL"的解释应遵循[RFC 2119](https://tools.ietf.org/html/rfc2119)的描述。

### 伪代码

规范中的伪代码应该是与语言无关的，并且采用简单的命令式标准格式，包括行号、变量、简单的条件块、for循环以及必要时用英语片段来解释进一步的功能，比如调度超时。应避免使用LaTeX图像，因为它们在diff形式下很难审查。

结构体的伪代码可以使用简单的语言，如Typescript或golang，作为接口来编写。

示例Golang伪代码结构体：

```go
type CacheKVStore interface {
  cache: map[Key]Value
  parent: KVStore
  deleted: Key
}
```

算法的伪代码应该使用简单的Golang编写，作为函数。

示例伪代码算法：

```go
func get(
  store CacheKVStore,
  key Key) Value {

  value = store.cache.get(Key)
  if (value !== null) {
    return value
  } else {
    value = store.parent.get(key)
    store.cache.set(key, value)
    return value
  }
}
```

## 历史

本规范在很大程度上受到IBC的启发和衍生，[ICS](https://github.com/cosmos/ibc/blob/main/spec/ics-001-ics-standard/README.md)，而IBC又是从以太坊的[EIP 1](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1.md)衍生而来。

2022年11月24日 - 初始草案完成并提交为PR

## 版权

此处的所有内容均根据[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)许可。


# What is an SDK standard?

An SDK standard is a design document describing a particular protocol, standard, or feature expected to be used by the Cosmos SDK. A SDK standard should list the desired properties of the standard, explain the design rationale, and provide a concise but comprehensive technical specification. The primary author is responsible for pushing the proposal through the standardization process, soliciting input and support from the community, and communicating with relevant stakeholders to ensure (social) consensus.

## Sections

A SDK standard consists of:

* a synopsis, 
* overview and basic concepts,
* technical specification,
* history log, and
* copyright notice.

All top-level sections are required. References should be included inline as links, or tabulated at the bottom of the section if necessary.  Included sub-sections should be listed in the order specified below. 

### Table Of Contents 
 
Provide a table of contents at the top of the file to assist readers.

### Synopsis

The document should include a brief (~200 word) synopsis providing a high-level description of and rationale for the specification.

### Overview and basic concepts

This section should include a motivation sub-section and a definitions sub-section if required:

* *Motivation* - A rationale for the existence of the proposed feature, or the proposed changes to an existing feature.
* *Definitions* - A list of new terms or concepts utilized in the document or required to understand it.

### System model and properties

This section should include an assumptions sub-section if any, the mandatory properties sub-section, and a dependencies sub-section. Note that the first two sub-section are are tightly coupled: how to enforce a property will depend directly on the assumptions made. This sub-section is important to capture the interactions of the specified feature with the "rest-of-the-world", i.e., with other features of the ecosystem.

* *Assumptions* - A list of any assumptions made by the feature designer. It should capture which features are used by the feature under specification, and what do we expect from them.
* *Properties* - A list of the desired properties or characteristics of the feature specified, and expected effects or failures when the properties are violated. In case it is relevant, it can also include a list of properties that the feature does not guarantee.
* *Dependencies* - A list of the features that use the feature under specification and how.

### Technical specification

This is the main section of the document, and should contain protocol documentation, design rationale, required references, and technical details where appropriate.
The section may have any or all of the following sub-sections, as appropriate to the particular specification. The API sub-section is especially encouraged when appropriate.

* *API* - A detailed description of the features's API.
* *Technical Details* - All technical details including syntax, diagrams, semantics, protocols, data structures, algorithms, and pseudocode as appropriate. The technical specification should be detailed enough such that separate correct implementations of the specification without knowledge of each other are compatible.
* *Backwards Compatibility* - A discussion of compatibility (or lack thereof) with previous feature or protocol versions.
* *Known Issues* - A list of known issues. This sub-section is specially important for specifications of already in-use features.
* *Example Implementation* - A concrete example implementation or description of an expected implementation to serve as the primary reference for implementers.

### History

A specification should include a history section, listing any inspiring documents and a plaintext log of significant changes.

See an example history section [below](#history-1).

### Copyright

A specification should include a copyright section waiving rights via [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).

## Formatting

### General

Specifications must be written in GitHub-flavoured Markdown.

For a GitHub-flavoured Markdown cheat sheet, see [here](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet). For a local Markdown renderer, see [here](https://github.com/joeyespo/grip).

### Language

Specifications should be written in Simple English, avoiding obscure terminology and unnecessary jargon. For excellent examples of Simple English, please see the [Simple English Wikipedia](https://simple.wikipedia.org/wiki/Main_Page).

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in specifications are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119).

### Pseudocode

Pseudocode in specifications should be language-agnostic and formatted in a simple imperative standard, with line numbers, variables, simple conditional blocks, for loops, and
English fragments where necessary to explain further functionality such as scheduling timeouts. LaTeX images should be avoided because they are difficult to review in diff form.

Pseudocode for structs can be written in a simple language like Typescript or golang, as interfaces.

Example Golang pseudocode struct:

```go
type CacheKVStore interface {
  cache: map[Key]Value
  parent: KVStore
  deleted: Key
}
```

Pseudocode for algorithms should be written in simple Golang, as functions.

Example pseudocode algorithm:

```go
func get(
  store CacheKVStore,
  key Key) Value {

  value = store.cache.get(Key)
  if (value !== null) {
    return value
  } else {
    value = store.parent.get(key)
    store.cache.set(key, value)
    return value
  }
}
```

## History

This specification was significantly inspired by and derived from IBC's [ICS](https://github.com/cosmos/ibc/blob/main/spec/ics-001-ics-standard/README.md), which
was in turn derived from Ethereum's [EIP 1](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1.md).

Nov 24, 2022 - Initial draft finished and submitted as a PR

## Copyright

All content herein is licensed under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).
