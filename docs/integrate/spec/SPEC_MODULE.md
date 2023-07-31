# 模块规范

本文件旨在概述此目录中规范的常见结构。

## 时态

为了保持一致性，规范应以被动现在时书写。

## 伪代码

通常情况下，规范中应尽量减少使用伪代码。通常，用简单的项目列表描述函数的操作已足够，并且应被视为首选。在某些情况下，由于所描述的功能的复杂性，伪代码可能是最合适的规范形式。在这些情况下，可以使用伪代码，但应以简洁的方式呈现，最好仅限于作为更大描述的一部分的复杂元素。

## 常见布局

应使用以下通用的 `README` 结构来拆分模块的规范。以下列表是非约束性的，所有部分都是可选的。

* `# {模块名称}` - 模块的概述
* `## 概念` - 描述规范中使用的专业概念和定义
* `## 状态` - 指定并描述预期被编组到存储中的结构及其键
* `## 状态转换` - 由钩子、消息等触发的标准状态转换操作
* `## 消息` - 指定消息结构和预期的状态机行为
* `## 开始区块` - 指定任何开始区块操作
* `## 结束区块` - 指定任何结束区块操作
* `## 钩子` - 描述可供此模块调用/调用的可用钩子
* `## 事件` - 列出并描述使用的事件标签
* `## 客户端` - 列出并描述 CLI 命令和 gRPC 和 REST 端点
* `## 参数` - 列出所有模块参数、它们的类型（以 JSON 格式）和示例
* `## 未来改进` - 描述此模块的未来改进
* `## 测试` - 验收测试
* `## 附录` - 在规范中引用的其他补充细节

### 键值映射的表示法

在 `## 状态` 中，应使用以下表示法 `->` 来描述键值映射：

```text
键 -> 值
```

为了表示字节串的连接，可以使用 `|`。此外，可以指定编码类型，例如：

```text
0x00 | addressBytes | address2Bytes -> amino(value_object)
```

此外，还可以通过将其映射到`nil`值来指定索引映射，例如：

```text
0x01 | address2Bytes | addressBytes -> nil
```



# Specification of Modules

This file intends to outline the common structure for specifications within
this directory.

## Tense

For consistency, specs should be written in passive present tense.

## Pseudo-Code

Generally, pseudo-code should be minimized throughout the spec. Often, simple
bulleted-lists which describe a function's operations are sufficient and should
be considered preferable. In certain instances, due to the complex nature of
the functionality being described pseudo-code may the most suitable form of
specification. In these cases use of pseudo-code is permissible, but should be
presented in a concise manner, ideally restricted to only the complex
element as a part of a larger description.

## Common Layout

The following generalized `README` structure should be used to breakdown
specifications for modules. The following list is nonbinding and all sections are optional.

* `# {Module Name}` - overview of the module
* `## Concepts` - describe specialized concepts and definitions used throughout the spec
* `## State` - specify and describe structures expected to marshalled into the store, and their keys
* `## State Transitions` - standard state transition operations triggered by hooks, messages, etc.
* `## Messages` - specify message structure(s) and expected state machine behaviour(s)
* `## Begin Block` - specify any begin-block operations
* `## End Block` - specify any end-block operations
* `## Hooks` - describe available hooks to be called by/from this module
* `## Events` - list and describe event tags used
* `## Client` - list and describe CLI commands and gRPC and REST endpoints
* `## Params` - list all module parameters, their types (in JSON) and examples
* `## Future Improvements` - describe future improvements of this module
* `## Tests` - acceptance tests
* `## Appendix` - supplementary details referenced elsewhere within the spec

### Notation for key-value mapping

Within `## State` the following notation `->` should be used to describe key to
value mapping:

```text
key -> value
```

to represent byte concatenation the `|` may be used. In addition, encoding
type may be specified, for example:

```text
0x00 | addressBytes | address2Bytes -> amino(value_object)
```

Additionally, index mappings may be specified by mapping to the `nil` value, for example:

```text
0x01 | address2Bytes | addressBytes -> nil
```
