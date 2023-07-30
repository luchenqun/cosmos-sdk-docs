# ADR 050: SIGN_MODE_TEXTUAL: 附录 2 XXX

## 变更日志

* 2022年10月3日：初稿

## 状态

草稿

## 摘要

本附录提供了关于如何在硬件安全设备（如Ledger）上呈现`SIGN_MODE_TEXTUAL`文档的规范指导。

## 背景

`SIGN_MODE_TEXTUAL`允许在硬件安全设备上签署可读版本的交易，例如Ledger。早期版本的设计直接将交易呈现为ASCII文本行，但这种方式在其带内信号传递和在交易中显示Unicode文本方面都证明不太方便。

## 决策

`SIGN_MODE_TEXTUAL`呈现为一个抽象表示，具体如何呈现这个表示取决于设备特定的软件，以满足设备的能力、限制和约定。

我们提供以下规范指导：

1. 呈现应尽可能对用户可读，考虑到设备的能力。如果为了其他属性而牺牲可读性，我们建议使用其他签名模式。可读性应重点关注常见情况，对于不常见的情况可读性可以较低。

2. 如果可能，呈现应可逆，而不会牺牲可读性。对呈现数据的任何更改都应导致呈现的可见变化。这扩展了签名对用户可见呈现的完整性。

3. 呈现应遵循设备的正常约定，而不会牺牲可读性或可逆性。

作为这些原则的示例，这里有一个在可以显示单行80个可打印ASCII字符的设备上呈现的算法：

* 呈现被分成多行，每行按顺序呈现，并提供用户控件以前进或后退一行。

* 仅当设备处于专家模式时才呈现专家模式屏幕。

* 屏幕的每一行以等于屏幕缩进级别的`>`字符开始，如果这不是屏幕的第一行，则后跟一个`+`字符，如果已经发出了`>`或`+`，或者如果此标题后跟一个`>`、`+`或空格，则后跟一个空格。

* 如果一行以空格或`@`字符结尾，则在该行末尾添加一个额外的`@`字符。

* 下列ASCII控制字符或反斜杠（`\`）将被转换为反斜杠后跟一个字母代码，类似于许多语言中的字符串文字：

    * a：U+0007 警报或响铃
    * b：U+0008 退格
    * f：U+000C 换页
    * n：U+000A 换行
    * r：U+000D 回车
    * t：U+0009 水平制表符
    * v：U+000B 垂直制表符
    * `\`：U+005C 反斜杠

* 所有其他ASCII控制字符，以及非ASCII Unicode代码点，都显示为以下形式之一：

    * 对于基本多语言平面（BMP）中的代码点，使用`\u`后跟4个大写十六进制字符。

    * 对于其他代码点，使用`\U`后跟8个大写十六进制字符。

* 屏幕将被分成多行以适应80个字符的限制，考虑到上述转换方式，以尽量减少生成的行数。扩展的控制字符或Unicode字符永远不会跨行拆分。

示例输出：

```
An introductory line.
key1: 123456
key2: a string that ends in whitespace   @
key3: a string that ends in  a single ampersand - @@
 >tricky key4<: note the leading space in the presentation
introducing an aggregate
> key5: false
> key6: a very long line of text, please co\u00F6perate and break into
>+  multiple lines.
> Can we do further nesting?
>> You bet we can!
```

逆映射给出了唯一可能生成此输出的输入（字符串数据的JSON表示）：

```
Indent  Text
------  ----
0       "An introductory line."
0       "key1: 123456"
0       "key2: a string that ends in whitespace   "
0       "key3: a string that ends in  a single ampersand - @"
0       ">tricky key4<: note the leading space in the presentation"
0       "introducing an aggregate"
1       "key5: false"
1       "key6: a very long line of text, please coöperate and break into multiple lines."
1       "Can we do further nesting?"
2       "You bet we can!"
```


# ADR 050: SIGN_MODE_TEXTUAL: Annex 2 XXX

## Changelog

* Oct 3, 2022: Initial Draft

## Status

DRAFT

## Abstract

This annex provides normative guidance on how devices should render a
`SIGN_MODE_TEXTUAL` document.

## Context

`SIGN_MODE_TEXTUAL` allows a legible version of a transaction to be signed
on a hardware security device, such as a Ledger. Early versions of the
design rendered transactions directly to lines of ASCII text, but this
proved awkward from its in-band signaling, and for the need to display
Unicode text within the transaction.

## Decision

`SIGN_MODE_TEXTUAL` renders to an abstract representation, leaving it
up to device-specific software how to present this representation given the
capabilities, limitations, and conventions of the deivce.

We offer the following normative guidance:

1. The presentation should be as legible as possible to the user, given
the capabilities of the device. If legibility could be sacrificed for other
properties, we would recommend just using some other signing mode.
Legibility should focus on the common case - it is okay for unusual cases
to be less legible.

2. The presentation should be invertible if possible without substantial
sacrifice of legibility.  Any change to the rendered data should result
in a visible change to the presentation. This extends the integrity of the
signing to user-visible presentation.

3. The presentation should follow normal conventions of the device,
without sacrificing legibility or invertibility.

As an illustration of these principles, here is an example algorithm
for presentation on a device which can display a single 80-character
line of printable ASCII characters:

* The presentation is broken into lines, and each line is presented in
sequence, with user controls for going forward or backward a line.

* Expert mode screens are only presented if the device is in expert mode.

* Each line of the screen starts with a number of `>` characters equal
to the screen's indentation level, followed by a `+` character if this
isn't the first line of the screen, followed by a space if either a
`>` or a `+` has been emitted,
or if this header is followed by a `>`, `+`, or space.

* If the line ends with whitespace or an `@` character, an additional `@`
character is appended to the line.

* The following ASCII control characters or backslash (`\`) are converted
to a backslash followed by a letter code, in the manner of string literals
in many languages:

    * a: U+0007 alert or bell
    * b: U+0008 backspace
    * f: U+000C form feed
    * n: U+000A line feed
    * r: U+000D carriage return
    * t: U+0009 horizontal tab
    * v: U+000B vertical tab
    * `\`: U+005C backslash

* All other ASCII control characters, plus non-ASCII Unicode code points,
are shown as either:

    * `\u` followed by 4 uppercase hex chacters for code points
    in the basic multilingual plane (BMP).

    * `\U` followed by 8 uppercase hex characters for other code points.

* The screen will be broken into multiple lines to fit the 80-character
limit, considering the above transformations in a way that attempts to
minimize the number of lines generated. Expanded control or Unicode characters
are never split across lines.

Example output:

```
An introductory line.
key1: 123456
key2: a string that ends in whitespace   @
key3: a string that ends in  a single ampersand - @@
 >tricky key4<: note the leading space in the presentation
introducing an aggregate
> key5: false
> key6: a very long line of text, please co\u00F6perate and break into
>+  multiple lines.
> Can we do further nesting?
>> You bet we can!
```

The inverse mapping gives us the only input which could have
generated this output (JSON notation for string data):

```
Indent  Text
------  ----
0       "An introductory line."
0       "key1: 123456"
0       "key2: a string that ends in whitespace   "
0       "key3: a string that ends in  a single ampersand - @"
0       ">tricky key4<: note the leading space in the presentation"
0       "introducing an aggregate"
1       "key5: false"
1       "key6: a very long line of text, please coöperate and break into multiple lines."
1       "Can we do further nesting?"
2       "You bet we can!"
```
