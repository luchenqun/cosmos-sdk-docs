# ADR 054: 兼容 Semver 的 SDK 模块

## 更新日志

* 2022-04-27: 初稿

## 状态

草案

## 摘要

为了将 Cosmos SDK 移动到一种由语义化版本化的解耦模块系统，这些模块可以以不同的组合方式进行组合（例如，staking v3 与 bank v1 和 distribution v2），我们需要重新评估如何组织模块的 API 表面，以避免在 go 语义化导入版本和循环依赖方面出现问题。本 ADR 探讨了解决这些问题的各种方法。

## 背景

社区中对 SDK 进行语义化版本化的需求相当大，并且已经有了将 SDK 模块拆分为独立的 go 模块的重要进展。这两者理想情况下将使生态系统能够更快地前进，因为我们不需要等待所有依赖项同步更新。例如，我们可以有 3 个与最新的 2 个 CosmWasm 版本兼容的核心 SDK 版本，以及 4 个不同版本的 staking。这种设置将允许早期采用者积极整合新版本，同时允许更保守的用户选择他们准备好的版本。

为了实现这一目标，我们需要解决以下问题：

1. 由于 [go 语义化导入版本](https://research.swtch.com/vgo-import)（SIV）的工作方式，简单地转向 SIV 实际上会使实现这些目标更加困难
2. 模块之间的循环依赖需要被打破，以便实际上可以独立发布 SDK 中的许多模块
3. 通过正确地[演进 protobuf 模式](https://developers.google.com/protocol-buffers/docs/proto3#updating)而引入的恶性次要版本不兼容性，而没有正确的[未知字段过滤](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)

请注意，以下所有讨论都假设模块的 proto 文件版本和状态机版本是不同的：

* proto文件以非破坏性的方式进行维护（使用类似 [buf breaking](https://docs.buf.build/breaking/overview) 的工具来确保所有更改都向后兼容）
* proto文件的版本更新频率较低，例如我们可能会通过多个版本来维护 `cosmos.bank.v1` 的银行模块状态机
* 状态机的破坏性更改较为常见，理想情况下，我们希望使用go模块对其进行语义化版本控制，例如 `x/bank/v2`、`x/bank/v3` 等等。

### 问题1：语义化导入版本兼容性

假设我们有一个名为 `foo` 的模块，定义了以下 `MsgDoSomething`，并且我们已经在go模块 `example.com/foo` 中发布了其状态机：

```protobuf
package foo.v1;

message MsgDoSomething {
  string sender = 1;
  uint64 amount = 2;
}

service Msg {
  DoSomething(MsgDoSomething) returns (MsgDoSomethingResponse);
}
```

现在假设我们对该模块进行了修订，在 `MsgDoSomething` 中添加了一个新的 `condition` 字段，并且还在 `amount` 上添加了一个新的验证规则，要求其必须为非零值。根据go语义化版本控制，我们将 `foo` 的下一个状态机版本发布为 `example.com/foo/v2`。

```protobuf
// Revision 1
package foo.v1;

message MsgDoSomething {
  string sender = 1;
  
  // amount must be a non-zero integer.
  uint64 amount = 2;
  
  // condition is an optional condition on doing the thing.
  //
  // Since: Revision 1
  Condition condition = 3;
}
```

如果我们采用朴素的方法，我们将在 `example.com/foo/types` 中为初始版本的 `foo` 生成protobuf类型，并在 `example.com/foo/v2/types` 中为第二个版本生成protobuf类型。

现在假设我们有一个名为 `bar` 的模块，它使用 `foo` 提供的这个 keeper 接口进行通信：

```go
type FooKeeper interface {
	DoSomething(MsgDoSomething) error
}
```

#### 情景A：向后兼容：较新的Foo，较旧的Bar

假设我们有一个同时使用 `foo` 和 `bar` 的链，并希望升级到 `foo/v2`，但是 `bar` 模块尚未升级到 `foo/v2`。

在这种情况下，链将无法升级到 `foo/v2`，直到 `bar` 将其对 `example.com/foo/types.MsgDoSomething` 的引用升级为 `example.com/foo/v2/types.MsgDoSomething`。

即使 `bar` 对 `MsgDoSomething` 的使用根本没有改变，如果没有这个更改，升级将是不可能的，因为 `example.com/foo/types.MsgDoSomething` 和 `example.com/foo/v2/types.MsgDoSomething` 在go类型系统中是根本不兼容的结构体。

#### 场景B：向前兼容性：旧版Foo，新版Bar

现在让我们考虑相反的情况，即`bar`升级到`foo/v2`，通过将`MsgDoSomething`的引用更改为`example.com/foo/v2/types.MsgDoSomething`，并将其作为`bar/v2`发布，其中还包含一些链需要的其他更改。然而，该链已经决定认为`foo/v2`中的更改过于冒险，它更愿意保持在初始版本的`foo`上。

在这种情况下，即使`bar/v2`在除了更改`MsgDoSomething`的导入路径之外与`foo`完全兼容（这意味着`bar/v2`实际上没有使用`foo/v2`的任何新功能），也无法升级到`bar/v2`而不升级到`foo/v2`。

现在，由于Go语言语义化导入版本控制的工作方式，我们要么使用`foo`和`bar`，要么使用`foo/v2`和`bar/v2`。即使这两个模块的所有版本在其他方面都是兼容的，Go类型系统也不允许这样做。

#### 幼稚的缓解方法

修复这个问题的一种幼稚方法是不重新生成`example.com/foo/v2/types`中的protobuf类型，而是只更新`example.com/foo/types`以反映`v2`所需的更改（添加`condition`并要求`amount`不为零）。然后，我们可以发布一个包含此更新的`example.com/foo/types`的补丁，并将其用于`foo/v2`。但是，这个更改对于`v1`来说会破坏状态机。它需要更改`ValidateBasic`方法以拒绝`amount`为零的情况，并添加`condition`字段，根据[ADR 020未知字段过滤](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)应该被拒绝。因此，根据语义化版本控制，将这些更改作为`v1`的补丁实际上是不正确的。希望保持在`foo`的`v1`上的链不应导入这些更改，因为它们对于`v1`来说是不正确的。

### 问题2：循环依赖

以上方法都不允许`foo`和`bar`成为独立的模块，如果由于某种原因`foo`和`bar`以不同的方式相互依赖。例如，我们不能让`foo`导入`bar/types`，而`bar`导入`foo/types`。

我们在SDK中有几个循环模块依赖的情况（例如staking、distribution和slashing），从状态机的角度来看是合理的。如果不以某种方式将API类型分离出来，就无法在没有其他补救措施的情况下对这些模块进行独立的语义版本控制。

### 问题3：处理次要版本不兼容性

假设我们解决了前两个问题，但现在出现了这样的情况：`bar/v2`希望使用`MsgDoSomething.condition`，而只有`foo/v2`支持。如果`bar/v2`与`foo`的`v1`版本一起工作，并将`condition`设置为某个非空值，那么`foo`将会默默地忽略该字段，导致潜在的逻辑错误。如果`bar/v2`能够检查`foo`是在`v1`还是`v2`上，并在动态情况下选择仅在`foo/v2`可用时使用`condition`，那将是理想的。然而，即使`bar/v2`能够执行此检查，我们如何知道它始终正确地执行检查呢？如果没有某种框架级别的[未知字段过滤](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)，很难知道这些隐蔽且难以检测的错误是否进入了我们的应用程序，可能需要像[ADR 033: Inter-Module Communication](adr-033-protobuf-inter-module-comm.md)这样的客户端-服务器层来完成此任务。

## 解决方案

### 方法A）将API和状态机模块分离

一种解决方案（最初在https://github.com/cosmos/cosmos-sdk/discussions/10582中提出）是将所有protobuf生成的代码隔离到一个单独的模块中，与状态机模块分开。这意味着我们可以有状态机的go模块`foo`和`foo/v2`，它们可以使用一个名为`foo/api`的类型或API go模块。这个`foo/api` go模块将永远保持在`v1.x`上，并且只接受非破坏性的更改。这将允许其他模块与`foo`或`foo/v2`兼容，只要模块间的API仅依赖于`foo/api`中的类型。它还将允许模块`foo`和`bar`相互依赖，因为它们都可以依赖于`foo/api`和`bar/api`，而不需要`foo`直接依赖于`bar`，反之亦然。

这与上面描述的天真缓解方法类似，只是将类型分离为单独的go模块，这本身可以用于打破循环模块依赖关系。除此之外，它与天真解决方案有相同的问题，我们可以通过以下方式进行纠正：

1. 从API模块中删除所有破坏状态机的代码（例如`ValidateBasic`和任何其他接口方法）。
2. 在二进制文件中嵌入用于未知字段过滤的正确文件描述符。

#### 将API类型上的所有接口方法迁移到处理程序

为了解决第1个问题，我们需要从生成的类型中删除所有接口实现，并改为使用处理程序方法，这意味着对于给定的类型`X`，我们有一种解析器可以解析该类型的接口实现（例如`sdk.Msg`或`authz.Authorization`）。例如：

```go
func (k Keeper) DoSomething(msg MsgDoSomething) error {
	var validateBasicHandler ValidateBasicHandler
	err := k.resolver.Resolve(&validateBasic, msg)
	if err != nil {
		return err
	}   
	
	err = validateBasicHandler.ValidateBasic()
	...
}
```

对于`sdk.Msg`上的某些方法，我们可以用声明性注解来替换它们。例如，`GetSigners`已经可以用protobuf注解`cosmos.msg.v1.signer`来替换。将来，我们可以考虑使用一种类似于https://github.com/bufbuild/protoc-gen-validate的protobuf验证框架（但更适用于Cosmos）来替换`ValidateBasic`。

#### 固定的FileDescriptor

为了解决第2个问题，状态机模块必须能够指定它们构建时所使用的protobuf文件的版本。例如，如果`foo`的API模块升级到`foo/v2`，原始的`foo`模块仍然需要原始的protobuf文件副本，以便ADR 020未知字段过滤器在设置`condition`时拒绝`MsgDoSomething`。

最简单的方法可能是将protobuf的`FileDescriptor`嵌入到模块本身中，以便在运行时使用这些`FileDescriptor`，而不是内置于`foo/api`中的可能不同的`FileDescriptor`。使用[buf build](https://docs.buf.build/build/usage#output-format)、[go embed](https://pkg.go.dev/embed)和一个构建脚本，我们可能可以找到一种相当简单的将`FileDescriptor`嵌入到模块中的解决方案。

#### 生成代码的潜在限制

这种方法的一个挑战是它对API模块的内容有很大限制，并要求大部分内容都是状态机破坏的。API模块中的所有或大部分代码都将从protobuf文件生成，因此我们可以通过控制代码生成的方式来控制这一点，但这是一个需要注意的风险。

例如，我们对ORM进行代码生成，未来可能包含破坏状态机的优化。我们要么需要非常仔细地确保这些优化在生成的代码中实际上不会破坏状态机，要么将这些生成的代码从API模块中分离出来，放入状态机模块中。这两种缓解措施都有潜在的可行性，但是API模块的方法需要额外的注意，以避免这些问题。

#### 次要版本不兼容性

这种方法本身对于解决潜在的次要版本不兼容性问题没有太大帮助，还需要进行[未知字段过滤](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)。可能需要一种类似客户端-服务器路由层的机制来进行检查，例如[ADR 033: 模块间通信](adr-033-protobuf-inter-module-comm.md)，以确保正确执行此操作。然后，我们可以允许模块在运行时检查给定的`MsgClient`，例如：

```go
func (k Keeper) CallFoo() error {
	if k.interModuleClient.MinorRevision(k.fooMsgClient) >= 2 {
		k.fooMsgClient.DoSomething(&MsgDoSomething{Condition: ...})
    } else {
        ...
    }
}
```

要执行未知字段过滤本身，ADR 033路由器需要使用[protoreflect API](https://pkg.go.dev/google.golang.org/protobuf/reflect/protoreflect)来确保不会设置接收模块未知的字段。这可能会导致性能下降，具体取决于此逻辑的复杂性。

### 方法B）对生成的代码进行更改

解决版本问题的另一种方法是改变protobuf代码的生成方式，并将模块在很大程度上或完全转向模块间通信，如[ADR 033](adr-033-protobuf-inter-module-comm.md)所述。在这种范式中，一个模块可以在内部生成所有需要的类型 - 包括其他模块的API类型 - 并通过客户端-服务器边界与其他模块进行通信。例如，如果`bar`需要与`foo`通信，它可以将自己版本的`MsgDoSomething`生成为`bar/internal/foo/v1.MsgDoSomething`，然后将其传递给模块间路由器，该路由器将其转换为foo所需的版本（例如`foo/internal.MsgDoSomething`）。

目前，在同一个 Go 二进制文件中，对于同一 protobuf 类型的两个生成的结构体，如果没有特殊的构建标志，是不能共存的（参见 https://developers.google.com/protocol-buffers/docs/reference/go/faq#fix-namespace-conflict）。
对于这个问题，一个相对简单的缓解方法是设置 protobuf 代码，如果它们是在 `internal/` 包中生成的，则不要全局注册 protobuf 类型。
这将要求模块使用应用级别的 protobuf 注册表手动注册它们的类型，这与模块已经使用 `InterfaceRegistry` 和 amino 编解码器做的类似。

如果模块只使用 ADR 033 消息传递，那么将 `bar/internal/foo/v1.MsgDoSomething` 转换为 `foo/internal.MsgDoSomething` 的一个天真且非高效的解决方案是在 ADR 033 路由器中进行编组和解组。
如果我们需要在 `Keeper` 接口中公开 protobuf 类型，这种方法将会失败，因为整个目的是尝试将这些类型保持在 `internal/` 中，以避免出现上述所有导入版本不兼容性的问题。
然而，由于次要版本不兼容性的问题以及需要[未知字段过滤](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)，与 ADR 033 相比，坚持使用 `Keeper` 范式可能从一开始就不可行。

一个更高效的解决方案（可能可以适应 `Keeper` 接口）是只为生成的类型公开 getter 和 setter，并在内部使用内存缓冲区存储数据，可以以零拷贝的方式从一个实现传递到另一个实现。

例如，假设只为 `MsgSend` 公开了具有 getter 和 setter 的 protobuf API：

```go
type MsgSend interface {
	proto.Message
	GetFromAddress() string
	GetToAddress() string
	GetAmount() []v1beta1.Coin
    SetFromAddress(string)
    SetToAddress(string)
    SetAmount([]v1beta1.Coin)
}

func NewMsgSend() MsgSend { return &msgSendImpl{memoryBuffers: ...} }
```

在底层，`MsgSend` 可以基于某些原始内存缓冲区实现，就像 [Cap'n Proto](https://capnproto.org) 和 [FlatBuffers](https://google.github.io/flatbuffers/) 那样，这样我们就可以在不进行序列化（即零拷贝）的情况下在不同版本的 `MsgSend` 之间进行转换。
这种方法还具有其他好处，例如允许在其他语言（如 Rust）中编写的模块之间进行零拷贝的消息传递，并通过虚拟机或 FFI 进行访问。如果我们要求所有新字段按顺序添加，例如只检查是否设置了 `> 5` 的字段，那么它还可以使模块间通信中的未知字段过滤更加简单。

此外，我们不会遇到由于生成的类型而导致状态机破坏代码的问题，因为状态机中使用的所有生成代码实际上都存在于状态机模块本身中。然而，根据其他语言中接口类型和protobuf `Any` 的使用方式，可能仍然希望采用描述的处理程序方法。无论采用哪种方式，实现接口的类型仍然需要在 `InterfaceRegistry` 中注册，因为没有办法通过全局注册表检索它们。

为了简化使用 ADR 033 访问其他模块，可以使用一个公共的 API 模块（甚至可以由 [Buf 远程生成](https://docs.buf.build/bsr/remote-generation/go)）来代替在内部生成所有客户端类型。

这种方法的主要缺点是它需要对如何使用 protobuf 类型进行重大更改，并且需要对 protobuf 代码生成器进行实质性的重写。然而，这些新生成的代码仍然可以与 [`google.golang.org/protobuf/reflect/protoreflect`](https://pkg.go.dev/google.golang.org/protobuf/reflect/protoreflect) API 兼容，以便与所有标准的 golang protobuf 工具一起使用。

如果认为对代码生成器的更改过于复杂，那么在 ADR 033 路由器中进行编组/解组的朴素方法可能是一种可接受的中间解决方案。然而，由于所有模块可能都需要迁移到 ADR 033，因此一次性完成所有操作可能更好。

### 方法 C）不解决这些问题

如果上述解决方案被认为过于复杂，我们也可以决定不采取任何明确的措施来实现更好的模块版本兼容性和打破循环依赖关系。

在这种情况下，当开发人员面临上述问题时，他们可以要求依赖项进行同步更新（与我们现在所做的相同），或者尝试一些临时的、可能有些笨拙的解决方案。

一种方法是完全放弃 Go 语义化导入版本控制（SIV）。一些人评论说 Go 的 SIV（即将导入路径更改为 `foo/v2`、`foo/v3` 等）过于限制性，应该是可选的。然而，Golang 的维护者不同意，只官方支持语义化导入版本控制。然而，我们可以采取相反的观点，通过使用基于 0.x 的版本控制来获得更大的灵活性，基本上永远使用这种方式。

模块版本兼容性可以通过使用 go.mod 的替换指令来固定依赖的特定兼容的 0.x 版本来实现。例如，如果我们知道 `foo` 的 0.2 和 0.3 版本都与 `bar` 的 0.3 和 0.4 版本兼容，我们可以在 go.mod 中使用替换指令来使用我们想要的 `foo` 和 `bar` 版本。只要 `foo` 和 `bar` 的作者在这些模块之间避免不兼容的重大更改，这种方法就能够正常工作。

或者，如果开发者选择使用语义化导入版本控制，他们可以尝试上述描述的简单解决方案，并且还需要使用特殊标签和替换指令来确保模块被固定到正确的版本。

然而，请注意，所有这些临时方法都会受到上述次要版本兼容性问题的影响，除非[未知字段过滤](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)得到正确解决。

### 方法 D) 避免在公共 API 中使用 protobuf 生成的代码

另一种方法是在公共模块 API 中避免使用 protobuf 生成的代码。这将有助于避免模块之间状态机版本和客户端 API 版本的不一致。这意味着我们不会基于 ADR 033 进行模块间的消息传递，而是继续使用现有的 keeper 方法，并通过避免在 keeper 接口方法中使用任何 protobuf 生成的代码来进一步改进。

使用这种方法，我们的 `foo.Keeper.DoSomething` 方法将不会有生成的 `MsgDoSomething` 结构体（来自 protobuf API），而是使用位置参数。然后，为了使 `foo/v2` 支持 `foo/v1` 的 keeper，它只需要实现 v1 和 v2 的 keeper API。v2 中的 `DoSomething` 方法可以有额外的 `condition` 参数，但在 v1 中根本不存在，因此客户端在不可用时不会意外设置它。

因此，这种方法可以避免次要版本不兼容性的挑战，因为现有的模块 keeper API 不会在 protobuf 文件中添加新字段时获得这些字段。

采用这种方法，然而，很可能需要将所有的protobuf生成的代码设为内部代码，以防止其泄漏到keeper API中。这意味着我们仍然需要修改protobuf代码生成器，以便不将`internal/`代码注册到全局注册表中，并且我们仍然需要手动注册protobuf的`FileDescriptor`（在所有情况下可能都是如此）。然而，可能可以避免需要对生成的类型的接口方法进行重构。

此外，这种方法并没有解决在模块仍然希望使用消息路由器的情况下应该做什么。无论如何，我们可能仍然希望有一种安全地将消息从一个模块传递到另一个路由器的方法，即使只是用于像`x/gov`、`x/authz`、CosmWasm等用例。这仍然需要在方法（B）中概述的大部分内容，尽管我们可以建议模块优先使用keepers与其他模块进行通信。

这种方法最大的缺点可能是它需要严格重构keeper接口，以避免生成的代码泄漏到API中。这可能导致我们需要复制已在proto文件中定义的类型，并编写用于在golang版本和protobuf版本之间进行转换的方法。这可能会导致大量不必要的样板代码，这可能会阻止模块实际采用它并实现有效的版本兼容性。虽然初始时方法（A）和（B）可能有些笨重，但它们旨在提供一种一旦采用就可以几乎免费获得开发者版本兼容性的系统，而只需最少的样板代码。方法（D）可能无法提供这样一个简单明了的系统，因为它要求在与protobuf API并行定义的golang API中进行重复和不同的设计原则（protobuf API鼓励增量更改，而golang API则禁止这样做）。

这种方法的其他缺点包括：
* 没有明确的支持其他语言（如Rust）的模块的路线图
* 无法更接近正确的对象能力安全性（ADR 033的目标之一）
* 无论如何，ADR 033都需要正确地完成，以满足确实需要它的用例集合的需求

## 决策

最新的**草案**提议如下：

1. 我们一致同意采用[ADR 033](adr-033-protobuf-inter-module-comm.md)，不仅作为框架的补充，而且作为完全替代 keeper 范式的核心。
2. ADR 033 的模块间路由器将适应任何方法（A 或 B），遵循以下规则：
   a. 如果客户端类型与服务器类型相同，则直接传递，
   b. 如果客户端和服务器都使用零拷贝生成的代码包装器（仍需定义），则将内存缓冲区从一个包装器传递到另一个包装器，或者
   c. 在客户端和服务器之间进行类型的编组/解组。

这种方法将允许最大程度的正确性，并为在其他语言中启用模块提供了明确的路径，可能在 WASM VM 中执行。

### 次要 API 修订

为了声明 proto 文件的次要 API 修订，我们提出以下准则（已在 [cosmos.app.v1alpha 模块选项](../proto/cosmos/app/v1alpha1/module.proto) 中记录）：
* 从初始版本（被视为修订 `0`）开始修订的 proto 包应在某个 .proto 文件中包含一个以测试修订号 `N` 开头的注释行，其中 `N` 是当前修订号。
* 在初始修订之后添加的所有字段、消息等都应在注释行的开头添加一个形如 `Since: Revision N` 的注释，其中 `N` 是非零修订号。

建议状态机模块与版本化的 proto 文件集之间存在一对一的对应关系，这些文件集可以作为 buf 模块、go API 模块或两者进行版本化。如果使用 buf 模式注册表，则此 buf 模块的版本应始终为 `1.N`，其中 `N` 对应包修订号。仅在更新文档注释时使用补丁版本。可以在同一个 `1.N` 版本的 buf 模块中包含名为 `v2`、`v3` 等的 proto 包（例如 `cosmos.bank.v2`），只要所有这些 proto 包都由单个 SDK 模块提供的单个 API 组成。

### 检查次要 API 修订版本

为了使模块能够检查对等模块的次要 API 修订版本，我们建议在 `cosmossdk.io/core/intermodule.Client` 中添加以下方法：

```go
ServiceRevision(ctx context.Context, serviceName string) uint64
```

模块可以使用由 Go gRPC 代码生成器静态生成的服务名称来调用此方法：

```go
intermoduleClient.ServiceRevision(ctx, bankv1beta1.Msg_ServiceDesc.ServiceName)
```

将来，我们可能决定扩展用于 protobuf 服务的代码生成器，以添加一个字段来更简洁地进行此检查，例如：

```go
package bankv1beta1

type MsgClient interface {
	Send(context.Context, MsgSend) (MsgSendResponse, error)
	ServiceRevision(context.Context) uint64
}
```

### 未知字段过滤

为了正确执行[未知字段过滤](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)，模块间路由器可以执行以下操作之一：

* 对于支持的消息，使用 `protoreflect` API
* 对于 gogo proto 消息，进行编组并使用现有的 `codec/unknownproto` 代码
* 对于零拷贝消息，对最高设置的字段编号进行简单检查（假设我们可以要求字段按递增顺序连续添加）

### `FileDescriptor` 注册

由于单个 Go 二进制文件可能包含同一生成的 protobuf 代码的不同版本，我们不能依赖全局 protobuf 注册表来包含正确的 `FileDescriptor`。因为 `appconfig` 模块配置本身是用 protobuf 编写的，所以我们希望在加载模块之前加载模块的 `FileDescriptor`。因此，我们将在模块注册时提供注册 `FileDescriptor` 的方法。我们建议为可能的 `FileDescriptor` 打包方式提供以下 `cosmossdk.io/core/appmodule.Option` 构造函数：

```go
package appmodule

// this can be used when we are using google.golang.org/protobuf compatible generated code
// Ex:
//   ProtoFiles(bankv1beta1.File_cosmos_bank_v1beta1_module_proto)
func ProtoFiles(file []protoreflect.FileDescriptor) Option {}

// this can be used when we are using gogo proto generated code.
func GzippedProtoFiles(file [][]byte) Option {}

// this can be used when we are using buf build to generated a pinned file descriptor
func ProtoImage(protoImage []byte) Option {}
```

这种方法使我们能够支持多种生成 protobuf 文件的方式：
* 模块内部生成的 proto 文件（使用 `ProtoFiles`）
* 使用固定的文件描述符的 API 模块方法（使用 `ProtoImage`）
* gogo proto（使用 `GzippedProtoFiles`）

### 模块依赖声明

ADR 033 的一个风险是在运行时调用了在加载的 SDK 模块集中不存在的依赖项。  
此外，我们希望模块能够定义它们所需的最低依赖 API 版本。因此，所有模块都应该提前声明它们的依赖项。这些依赖项可以在模块实例化时定义，但理想情况下，我们应该在实例化之前就知道这些依赖项，并且可以静态地查看应用程序配置，确定模块集合。例如，如果 `bar` 需要 `foo` 版本 `>= 1`，那么在创建一个包含两个版本的 `bar` 和 `foo` 的应用程序配置时，我们应该能够知道这一点。

我们建议在模块配置对象的 proto 选项中定义这些依赖项。

### 接口注册

我们还需要定义如何在序列化为 `google.protobuf.Any` 的类型上定义接口方法。考虑到支持其他语言的模块的需求，我们可能希望考虑一些解决方案，以适应其他语言，比如在 [ADR 033](adr-033-protobuf-inter-module-comm.md#internal-methods) 中简要描述的插件。

### 测试

为了确保模块确实与它们的多个依赖项版本兼容，我们计划提供专门的单元测试和集成测试基础设施，自动测试多个依赖项的版本。

#### 单元测试

单元测试应该在 SDK 模块内部进行，通过模拟它们的依赖项来进行。在完整的 ADR 033 场景中，这意味着与其他模块的所有交互都通过模块间路由器完成，因此模拟依赖项意味着模拟它们的消息和查询服务器实现。我们将提供测试运行器和测试夹具，以使此过程更加流畅。测试运行器测试兼容性的关键是测试所有依赖项 API 版本的组合。可以通过获取依赖项的文件描述符，解析它们的注释以确定各个元素添加的版本，并通过减去后来添加的元素创建每个版本的合成文件描述符来完成这个过程。

这是一个关于单元测试运行器和测试夹具的API建议：

```go
package moduletesting

import (
	"context"
	"testing"

	"cosmossdk.io/core/intermodule"
	"cosmossdk.io/depinject"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
)

type TestFixture interface {
	context.Context
	intermodule.Client // for making calls to the module we're testing
	BeginBlock()
	EndBlock()
}

type UnitTestFixture interface {
	TestFixture
	grpc.ServiceRegistrar // for registering mock service implementations
}

type UnitTestConfig struct {
	ModuleConfig              proto.Message    // the module's config object
	DepinjectConfig           depinject.Config // optional additional depinject config options
	DependencyFileDescriptors []protodesc.FileDescriptorProto // optional dependency file descriptors to use instead of the global registry
}

// Run runs the test function for all combinations of dependency API revisions.
func (cfg UnitTestConfig) Run(t *testing.T, f func(t *testing.T, f UnitTestFixture)) {
	// ...
}
```

这是一个关于测试调用foo的示例，它利用了预期的模拟参数中的条件服务修订版本：

```go
func TestBar(t *testing.T) {
    UnitTestConfig{ModuleConfig: &foomodulev1.Module{}}.Run(t, func (t *testing.T, f moduletesting.UnitTestFixture) {
        ctrl := gomock.NewController(t)
        mockFooMsgServer := footestutil.NewMockMsgServer()
        foov1.RegisterMsgServer(f, mockFooMsgServer)
        barMsgClient := barv1.NewMsgClient(f)
		if f.ServiceRevision(foov1.Msg_ServiceDesc.ServiceName) >= 1 {
            mockFooMsgServer.EXPECT().DoSomething(gomock.Any(), &foov1.MsgDoSomething{
				...,
				Condition: ..., // condition is expected in revision >= 1
            }).Return(&foov1.MsgDoSomethingResponse{}, nil)
        } else {
            mockFooMsgServer.EXPECT().DoSomething(gomock.Any(), &foov1.MsgDoSomething{...}).Return(&foov1.MsgDoSomethingResponse{}, nil)
        }
        res, err := barMsgClient.CallFoo(f, &MsgCallFoo{})
        ...
    })
}
```

单元测试运行器将确保没有依赖模拟返回对于正在测试的服务修订版本无效的参数，以确保模块不会错误地依赖于给定修订版本中不存在的功能。

#### 集成测试

还将提供一个集成测试运行器和测试夹具，它不使用模拟，而是测试实际模块依赖的各种组合。这是建议的API：

```go
type IntegrationTestFixture interface {
    TestFixture
}

type IntegrationTestConfig struct {
    ModuleConfig     proto.Message    // the module's config object
    DependencyMatrix map[string][]proto.Message // all the dependent module configs
}

// Run runs the test function for all combinations of dependency modules.
func (cfg IntegationTestConfig) Run(t *testing.T, f func (t *testing.T, f IntegrationTestFixture)) {
    // ...
}
```

这是一个关于foo和bar的示例：

```go
func TestBarIntegration(t *testing.T) {
    IntegrationTestConfig{
        ModuleConfig: &barmodulev1.Module{},
        DependencyMatrix: map[string][]proto.Message{
            "runtime": []proto.Message{ // test against two versions of runtime
                &runtimev1.Module{},
                &runtimev2.Module{},
            },
            "foo": []proto.Message{ // test against three versions of foo
                &foomodulev1.Module{},
                &foomodulev2.Module{},
                &foomodulev3.Module{},
            }
        }   
    }.Run(t, func (t *testing.T, f moduletesting.IntegrationTestFixture) {
        barMsgClient := barv1.NewMsgClient(f)
        res, err := barMsgClient.CallFoo(f, &MsgCallFoo{})
        ...
    })
}
```

与单元测试不同，集成测试实际上会引入其他模块的依赖关系。因此，为了使模块能够不直接依赖于其他模块，并且因为golang没有开发依赖的概念，集成测试应该在单独的go模块中编写，例如`example.com/bar/v2/test`。由于这种范式使用了go语义化版本控制，可以构建一个单一的go模块，导入3个版本的bar和2个版本的runtime，并可以在这些依赖关系的六种不同组合中进行测试。

## 结果

### 向后兼容性

完全迁移到ADR 033的模块将与使用keeper范式的现有模块不兼容。作为临时解决方法，我们可以创建一些包装类型来模拟当前的keeper接口，以最小化迁移开销。

### 积极的

* 我们将能够提供互操作的语义化版本化模块，这应该极大地增加Cosmos SDK生态系统在新功能上迭代的能力
* 在不久的将来，将能够使用其他语言编写Cosmos SDK模块

### 消极的

* 所有模块都需要进行相当大的重构

### 中立的

* `cosmossdk.io/core/appconfig`框架在模块定义方面将发挥更为核心的作用，这通常是一件好事，但对于希望坚持预依赖注入方式的用户来说，意味着额外的变化
* `depinject`可能因为完全采用ADR 033方法而变得不太需要，甚至可能被废弃。如果我们采用https://github.com/cosmos/cosmos-sdk/pull/12239中提出的核心API，那么一个模块可能总是使用`ProvideModule(appmodule.Service) (appmodule.AppModule, error)`方法实例化自己。在这种情况下，没有复杂的keeper依赖关系连接，依赖注入可能没有那么多的用例（或者根本没有用例）。

## 进一步讨论

上述决策目前处于草案阶段，需要团队和关键利益相关者的最终认可。
如果我们采用了这个方向，关键的未决讨论包括：

* 模块客户端如何审查依赖模块的 API 版本
* 模块如何确定对较小的依赖模块 API 版本的要求
* 模块如何适当地测试与不同依赖版本的兼容性
* 如何注册和解析接口实现
* 模块如何根据所采用的代码生成方法注册其 protobuf 文件描述符（API 模块方法仍然可能作为一种支持的策略，并且需要固定文件描述符）

## 参考资料

* https://github.com/cosmos/cosmos-sdk/discussions/10162
* https://github.com/cosmos/cosmos-sdk/discussions/10582
* https://github.com/cosmos/cosmos-sdk/discussions/10368
* https://github.com/cosmos/cosmos-sdk/pull/11340
* https://github.com/cosmos/cosmos-sdk/issues/11899
* [ADR 020](adr-020-protobuf-transaction-encoding.md)
* [ADR 033](adr-033-protobuf-inter-module-comm.md)


# ADR 054: Semver Compatible SDK Modules

## Changelog

* 2022-04-27: First draft

## Status

DRAFT

## Abstract

In order to move the Cosmos SDK to a system of decoupled semantically versioned
modules which can be composed in different combinations (ex. staking v3 with
bank v1 and distribution v2), we need to reassess how we organize the API surface
of modules to avoid problems with go semantic import versioning and
circular dependencies. This ADR explores various approaches we can take to
addressing these issues.

## Context

There has been [a fair amount of desire](https://github.com/cosmos/cosmos-sdk/discussions/10162)
in the community for semantic versioning in the SDK and there has been significant
movement to splitting SDK modules into [standalone go modules](https://github.com/cosmos/cosmos-sdk/issues/11899).
Both of these will ideally allow the ecosystem to move faster because we won't
be waiting for all dependencies to update synchronously. For instance, we could
have 3 versions of the core SDK compatible with the latest 2 releases of
CosmWasm as well as 4 different versions of staking . This sort of setup would
allow early adopters to aggressively integrate new versions, while allowing
more conservative users to be selective about which versions they're ready for.

In order to achieve this, we need to solve the following problems:

1. because of the way [go semantic import versioning](https://research.swtch.com/vgo-import) (SIV)
   works, moving to SIV naively will actually make it harder to achieve these goals
2. circular dependencies between modules need to be broken to actually release
   many modules in the SDK independently
3. pernicious minor version incompatibilities introduced through correctly
   [evolving protobuf schemas](https://developers.google.com/protocol-buffers/docs/proto3#updating)
   without correct [unknown field filtering](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)

Note that all the following discussion assumes that the proto file versioning and state machine versioning of a module
are distinct in that:

* proto files are maintained in a non-breaking way (using something
  like [buf breaking](https://docs.buf.build/breaking/overview)
  to ensure all changes are backwards compatible)
* proto file versions get bumped much less frequently, i.e. we might maintain `cosmos.bank.v1` through many versions
  of the bank module state machine
* state machine breaking changes are more common and ideally this is what we'd want to semantically version with
  go modules, ex. `x/bank/v2`, `x/bank/v3`, etc.

### Problem 1: Semantic Import Versioning Compatibility

Consider we have a module `foo` which defines the following `MsgDoSomething` and that we've released its state
machine in go module `example.com/foo`:

```protobuf
package foo.v1;

message MsgDoSomething {
  string sender = 1;
  uint64 amount = 2;
}

service Msg {
  DoSomething(MsgDoSomething) returns (MsgDoSomethingResponse);
}
```

Now consider that we make a revision to this module and add a new `condition` field to `MsgDoSomething` and also
add a new validation rule on `amount` requiring it to be non-zero, and that following go semantic versioning we
release the next state machine version of `foo` as `example.com/foo/v2`.

```protobuf
// Revision 1
package foo.v1;

message MsgDoSomething {
  string sender = 1;
  
  // amount must be a non-zero integer.
  uint64 amount = 2;
  
  // condition is an optional condition on doing the thing.
  //
  // Since: Revision 1
  Condition condition = 3;
}
```

Approaching this naively, we would generate the protobuf types for the initial
version of `foo` in `example.com/foo/types` and we would generate the protobuf
types for the second version in `example.com/foo/v2/types`.

Now let's say we have a module `bar` which talks to `foo` using this keeper
interface which `foo` provides:

```go
type FooKeeper interface {
	DoSomething(MsgDoSomething) error
}
```

#### Scenario A: Backward Compatibility: Newer Foo, Older Bar

Imagine we have a chain which uses both `foo` and `bar` and wants to upgrade to
`foo/v2`, but the `bar` module has not upgraded to `foo/v2`.

In this case, the chain will not be able to upgrade to `foo/v2` until `bar`
has upgraded its references to `example.com/foo/types.MsgDoSomething` to
`example.com/foo/v2/types.MsgDoSomething`.

Even if `bar`'s usage of `MsgDoSomething` has not changed at all, the upgrade
will be impossible without this change because `example.com/foo/types.MsgDoSomething`
and `example.com/foo/v2/types.MsgDoSomething` are fundamentally different
incompatible structs in the go type system.

#### Scenario B: Forward Compatibility: Older Foo, Newer Bar

Now let's consider the reverse scenario, where `bar` upgrades to `foo/v2`
by changing the `MsgDoSomething` reference to `example.com/foo/v2/types.MsgDoSomething`
and releases that as `bar/v2` with some other changes that a chain wants.
The chain, however, has decided that it thinks the changes in `foo/v2` are too
risky and that it'd prefer to stay on the initial version of `foo`.

In this scenario, it is impossible to upgrade to `bar/v2` without upgrading
to `foo/v2` even if `bar/v2` would have worked 100% fine with `foo` other
than changing the import path to `MsgDoSomething` (meaning that `bar/v2`
doesn't actually use any new features of `foo/v2`).

Now because of the way go semantic import versioning works, we are locked
into either using `foo` and `bar` OR `foo/v2` and `bar/v2`. We cannot have
`foo` + `bar/v2` OR `foo/v2` + `bar`. The go type system doesn't allow this
even if both versions of these modules are otherwise compatible with each
other.

#### Naive Mitigation

A naive approach to fixing this would be to not regenerate the protobuf types
in `example.com/foo/v2/types` but instead just update `example.com/foo/types`
to reflect the changes needed for `v2` (adding `condition` and requiring
`amount` to be non-zero). Then we could release a patch of `example.com/foo/types`
with this update and use that for `foo/v2`. But this change is state machine
breaking for `v1`. It requires changing the `ValidateBasic` method to reject
the case where `amount` is zero, and it adds the `condition` field which
should be rejected based
on [ADR 020 unknown field filtering](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering).
So adding these changes as a patch on `v1` is actually incorrect based on semantic
versioning. Chains that want to stay on `v1` of `foo` should not
be importing these changes because they are incorrect for `v1.`

### Problem 2: Circular dependencies

None of the above approaches allow `foo` and `bar` to be separate modules
if for some reason `foo` and `bar` depend on each other in different ways.
For instance, we can't have `foo` import `bar/types` while `bar` imports
`foo/types`.

We have several cases of circular module dependencies in the SDK
(ex. staking, distribution and slashing) that are legitimate from a state machine
perspective. Without separating the API types out somehow, there would be
no way to independently semantically version these modules without some other
mitigation.

### Problem 3: Handling Minor Version Incompatibilities

Imagine that we solve the first two problems but now have a scenario where
`bar/v2` wants the option to use `MsgDoSomething.condition` which only `foo/v2`
supports. If `bar/v2` works with `foo` `v1` and sets `condition` to some non-nil
value, then `foo` will silently ignore this field resulting in a silent logic
possibly dangerous logic error. If `bar/v2` were able to check whether `foo` was
on `v1` or `v2` and dynamically, it could choose to only use `condition` when
`foo/v2` is available. Even if `bar/v2` were able to perform this check, however,
how do we know that it is always performing the check properly. Without
some sort of
framework-level [unknown field filtering](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering),
it is hard to know whether these pernicious hard to detect bugs are getting into
our app and a client-server layer such as [ADR 033: Inter-Module Communication](adr-033-protobuf-inter-module-comm.md)
may be needed to do this.

## Solutions

### Approach A) Separate API and State Machine Modules

One solution (first proposed in https://github.com/cosmos/cosmos-sdk/discussions/10582) is to isolate all protobuf
generated code into a separate module
from the state machine module. This would mean that we could have state machine
go modules `foo` and `foo/v2` which could use a types or API go module say
`foo/api`. This `foo/api` go module would be perpetually on `v1.x` and only
accept non-breaking changes. This would then allow other modules to be
compatible with either `foo` or `foo/v2` as long as the inter-module API only
depends on the types in `foo/api`. It would also allow modules `foo` and `bar`
to depend on each other in that both of them could depend on `foo/api` and
`bar/api` without `foo` directly depending on `bar` and vice versa.

This is similar to the naive mitigation described above except that it separates
the types into separate go modules which in and of itself could be used to
break circular module dependencies. It has the same problems as the naive solution,
otherwise, which we could rectify by:

1. removing all state machine breaking code from the API module (ex. `ValidateBasic` and any other interface methods)
2. embedding the correct file descriptors for unknown field filtering in the binary

#### Migrate all interface methods on API types to handlers

To solve 1), we need to remove all interface implementations from generated
types and instead use a handler approach which essentially means that given
a type `X`, we have some sort of resolver which allows us to resolve interface
implementations for that type (ex. `sdk.Msg` or `authz.Authorization`). For
example:

```go
func (k Keeper) DoSomething(msg MsgDoSomething) error {
	var validateBasicHandler ValidateBasicHandler
	err := k.resolver.Resolve(&validateBasic, msg)
	if err != nil {
		return err
	}   
	
	err = validateBasicHandler.ValidateBasic()
	...
}
```

In the case of some methods on `sdk.Msg`, we could replace them with declarative
annotations. For instance, `GetSigners` can already be replaced by the protobuf
annotation `cosmos.msg.v1.signer`. In the future, we may consider some sort
of protobuf validation framework (like https://github.com/bufbuild/protoc-gen-validate
but more Cosmos-specific) to replace `ValidateBasic`.

#### Pinned FileDescriptor's

To solve 2), state machine modules must be able to specify what the version of
the protobuf files was that they were built against. For instance if the API
module for `foo` upgrades to `foo/v2`, the original `foo` module still needs
a copy of the original protobuf files it was built with so that ADR 020
unknown field filtering will reject `MsgDoSomething` when `condition` is
set.

The simplest way to do this may be to embed the protobuf `FileDescriptor`s into
the module itself so that these `FileDescriptor`s are used at runtime rather
than the ones that are built into the `foo/api` which may be different. Using
[buf build](https://docs.buf.build/build/usage#output-format), [go embed](https://pkg.go.dev/embed),
and a build script we can probably come up with a solution for embedding
`FileDescriptor`s into modules that is fairly straightforward.

#### Potential limitations to generated code

One challenge with this approach is that it places heavy restrictions on what
can go in API modules and requires that most of this is state machine breaking.
All or most of the code in the API module would be generated from protobuf
files, so we can probably control this with how code generation is done, but
it is a risk to be aware of.

For instance, we do code generation for the ORM that in the future could
contain optimizations that are state machine breaking. We
would either need to ensure very carefully that the optimizations aren't
actually state machine breaking in generated code or separate this generated code
out from the API module into the state machine module. Both of these mitigations
are potentially viable but the API module approach does require an extra level
of care to avoid these sorts of issues.

#### Minor Version Incompatibilities

This approach in and of itself does little to address any potential minor
version incompatibilities and the
requisite [unknown field filtering](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering).
Likely some sort of client-server routing layer which does this check such as
[ADR 033: Inter-Module communication](adr-033-protobuf-inter-module-comm.md)
is required to make sure that this is done properly. We could then allow
modules to perform a runtime check given a `MsgClient`, ex:

```go
func (k Keeper) CallFoo() error {
	if k.interModuleClient.MinorRevision(k.fooMsgClient) >= 2 {
		k.fooMsgClient.DoSomething(&MsgDoSomething{Condition: ...})
    } else {
        ...
    }
}
```

To do the unknown field filtering itself, the ADR 033 router would need to use
the [protoreflect API](https://pkg.go.dev/google.golang.org/protobuf/reflect/protoreflect)
to ensure that no fields unknown to the receiving module are set. This could
result in an undesirable performance hit depending on how complex this logic is.

### Approach B) Changes to Generated Code

An alternate approach to solving the versioning problem is to change how protobuf code is generated and move modules
mostly or completely in the direction of inter-module communication as described
in [ADR 033](adr-033-protobuf-inter-module-comm.md).
In this paradigm, a module could generate all the types it needs internally - including the API types of other modules -
and talk to other modules via a client-server boundary. For instance, if `bar` needs to talk to `foo`, it could
generate its own version of `MsgDoSomething` as `bar/internal/foo/v1.MsgDoSomething` and just pass this to the
inter-module router which would somehow convert it to the version which foo needs (ex. `foo/internal.MsgDoSomething`).

Currently, two generated structs for the same protobuf type cannot exist in the same go binary without special
build flags (see https://developers.google.com/protocol-buffers/docs/reference/go/faq#fix-namespace-conflict).
A relatively simple mitigation to this issue would be to set up the protobuf code to not register protobuf types
globally if they are generated in an `internal/` package. This will require modules to register their types manually
with the app-level level protobuf registry, this is similar to what modules already do with the `InterfaceRegistry`
and amino codec.

If modules _only_ do ADR 033 message passing then a naive and non-performant solution for
converting `bar/internal/foo/v1.MsgDoSomething`
to `foo/internal.MsgDoSomething` would be marshaling and unmarshaling in the ADR 033 router. This would break down if
we needed to expose protobuf types in `Keeper` interfaces because the whole point is to try to keep these types
`internal/` so that we don't end up with all the import version incompatibilities we've described above. However,
because of the issue with minor version incompatibilities and the need
for [unknown field filtering](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering),
sticking with the `Keeper` paradigm instead of ADR 033 may be unviable to begin with.

A more performant solution (that could maybe be adapted to work with `Keeper` interfaces) would be to only expose
getters and setters for generated types and internally store data in memory buffers which could be passed from
one implementation to another in a zero-copy way.

For example, imagine this protobuf API with only getters and setters is exposed for `MsgSend`:

```go
type MsgSend interface {
	proto.Message
	GetFromAddress() string
	GetToAddress() string
	GetAmount() []v1beta1.Coin
    SetFromAddress(string)
    SetToAddress(string)
    SetAmount([]v1beta1.Coin)
}

func NewMsgSend() MsgSend { return &msgSendImpl{memoryBuffers: ...} }
```

Under the hood, `MsgSend` could be implemented based on some raw memory buffer in the same way
that [Cap'n Proto](https://capnproto.org)
and [FlatBuffers](https://google.github.io/flatbuffers/) so that we could convert between one version of `MsgSend`
and another without serialization (i.e. zero-copy). This approach would have the added benefits of allowing zero-copy
message passing to modules written in other languages such as Rust and accessed through a VM or FFI. It could also make
unknown field filtering in inter-module communication simpler if we require that all new fields are added in sequential
order, ex. just checking that no field `> 5` is set.

Also, we wouldn't have any issues with state machine breaking code on generated types because all the generated
code used in the state machine would actually live in the state machine module itself. Depending on how interface
types and protobuf `Any`s are used in other languages, however, it may still be desirable to take the handler
approach described in approach A. Either way, types implementing interfaces would still need to be registered
with an `InterfaceRegistry` as they are now because there would be no way to retrieve them via the global registry.

In order to simplify access to other modules using ADR 033, a public API module (maybe even one
[remotely generated by Buf](https://docs.buf.build/bsr/remote-generation/go)) could be used by client modules instead
of requiring to generate all client types internally.

The big downsides of this approach are that it requires big changes to how people use protobuf types and would be a
substantial rewrite of the protobuf code generator. This new generated code, however, could still be made compatible
with
the [`google.golang.org/protobuf/reflect/protoreflect`](https://pkg.go.dev/google.golang.org/protobuf/reflect/protoreflect)
API in order to work with all standard golang protobuf tooling.

It is possible that the naive approach of marshaling/unmarshaling in the ADR 033 router is an acceptable intermediate
solution if the changes to the code generator are seen as too complex. However, since all modules would likely need
to migrate to ADR 033 anyway with this approach, it might be better to do this all at once.

### Approach C) Don't address these issues

If the above solutions are seen as too complex, we can also decide not to do anything explicit to enable better module
version compatibility, and break circular dependencies.

In this case, when developers are confronted with the issues described above they can require dependencies to update in
sync (what we do now) or attempt some ad-hoc potentially hacky solution.

One approach is to ditch go semantic import versioning (SIV) altogether. Some people have commented that go's SIV
(i.e. changing the import path to `foo/v2`, `foo/v3`, etc.) is too restrictive and that it should be optional. The
golang maintainers disagree and only officially support semantic import versioning. We could, however, take the
contrarian perspective and get more flexibility by using 0.x-based versioning basically forever.

Module version compatibility could then be achieved using go.mod replace directives to pin dependencies to specific
compatible 0.x versions. For instance if we knew `foo` 0.2 and 0.3 were both compatible with `bar` 0.3 and 0.4, we
could use replace directives in our go.mod to stick to the versions of `foo` and `bar` we want. This would work as
long as the authors of `foo` and `bar` avoid incompatible breaking changes between these modules.

Or, if developers choose to use semantic import versioning, they can attempt the naive solution described above
and would also need to use special tags and replace directives to make sure that modules are pinned to the correct
versions.

Note, however, that all of these ad-hoc approaches, would be vulnerable to the minor version compatibility issues
described above unless [unknown field filtering](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering)
is properly addressed.

### Approach D) Avoid protobuf generated code in public APIs

An alternative approach would be to avoid protobuf generated code in public module APIs. This would help avoid the
discrepancy between state machine versions and client API versions at the module to module boundaries. It would mean
that we wouldn't do inter-module message passing based on ADR 033, but rather stick to the existing keeper approach
and take it one step further by avoiding any protobuf generated code in the keeper interface methods.

Using this approach, our `foo.Keeper.DoSomething` method wouldn't have the generated `MsgDoSomething` struct (which
comes from the protobuf API), but instead positional parameters. Then in order for `foo/v2` to support the `foo/v1`
keeper it would simply need to implement both the v1 and v2 keeper APIs. The `DoSomething` method in v2 could have the
additional `condition` parameter, but this wouldn't be present in v1 at all so there would be no danger of a client
accidentally setting this when it isn't available. 

So this approach would avoid the challenge around minor version incompatibilities because the existing module keeper
API would not get new fields when they are added to protobuf files.

Taking this approach, however, would likely require making all protobuf generated code internal in order to prevent
it from leaking into the keeper API. This means we would still need to modify the protobuf code generator to not
register `internal/` code with the global registry, and we would still need to manually register protobuf
`FileDescriptor`s (this is probably true in all scenarios). It may, however, be possible to avoid needing to refactor
interface methods on generated types to handlers.

Also, this approach doesn't address what would be done in scenarios where modules still want to use the message router.
Either way, we probably still want a way to pass messages from one module to another router safely even if it's just for
use cases like `x/gov`, `x/authz`, CosmWasm, etc. That would still require most of the things outlined in approach (B),
although we could advise modules to prefer keepers for communicating with other modules.

The biggest downside of this approach is probably that it requires a strict refactoring of keeper interfaces to avoid
generated code leaking into the API. This may result in cases where we need to duplicate types that are already defined
in proto files and then write methods for converting between the golang and protobuf version. This may end up in a lot
of unnecessary boilerplate and that may discourage modules from actually adopting it and achieving effective version
compatibility. Approaches (A) and (B), although heavy handed initially, aim to provide a system which once adopted
more or less gives the developer version compatibility for free with minimal boilerplate. Approach (D) may not be able
to provide such a straightforward system since it requires a golang API to be defined alongside a protobuf API in a
way that requires duplication and differing sets of design principles (protobuf APIs encourage additive changes
while golang APIs would forbid it).

Other downsides to this approach are:
* no clear roadmap to supporting modules in other languages like Rust
* doesn't get us any closer to proper object capability security (one of the goals of ADR 033)
* ADR 033 needs to be done properly anyway for the set of use cases which do need it

## Decision

The latest **DRAFT** proposal is:

1. we are alignment on adopting [ADR 033](adr-033-protobuf-inter-module-comm.md) not just as an addition to the
   framework, but as a core replacement to the keeper paradigm entirely.
2. the ADR 033 inter-module router will accommodate any variation of approach (A) or (B) given the following rules:
   a. if the client type is the same as the server type then pass it directly through,
   b. if both client and server use the zero-copy generated code wrappers (which still need to be defined), then pass
   the memory buffers from one wrapper to the other, or
   c. marshal/unmarshal types between client and server.

This approach will allow for both maximal correctness and enable a clear path to enabling modules within in other
languages, possibly executed within a WASM VM.

### Minor API Revisions

To declare minor API revisions of proto files, we propose the following guidelines (which were already documented
in [cosmos.app.v1alpha module options](../proto/cosmos/app/v1alpha1/module.proto)):
* proto packages which are revised from their initial version (considered revision `0`) should include a `package`
* comment in some .proto file containing the test `Revision N` at the start of a comment line where `N` is the current
revision number.
* all fields, messages, etc. added in a version beyond the initial revision should add a comment at the start of a
comment line of the form `Since: Revision N` where `N` is the non-zero revision it was added.

It is advised that there is a 1:1 correspondence between a state machine module and versioned set of proto files
which are versioned either as a buf module a go API module or both. If the buf schema registry is used, the version of
this buf module should always be `1.N` where `N` corresponds to the package revision. Patch releases should be used when
only documentation comments are updated. It is okay to include proto packages named `v2`, `v3`, etc. in this same
`1.N` versioned buf module (ex. `cosmos.bank.v2`) as long as all these proto packages consist of a single API intended
to be served by a single SDK module.

### Introspecting Minor API Revisions

In order for modules to introspect the minor API revision of peer modules, we propose adding the following method
to `cosmossdk.io/core/intermodule.Client`:

```go
ServiceRevision(ctx context.Context, serviceName string) uint64
```

Modules could all this using the service name statically generated by the go grpc code generator:

```go
intermoduleClient.ServiceRevision(ctx, bankv1beta1.Msg_ServiceDesc.ServiceName)
```

In the future, we may decide to extend the code generator used for protobuf services to add a field
to client types which does this check more concisely, ex:

```go
package bankv1beta1

type MsgClient interface {
	Send(context.Context, MsgSend) (MsgSendResponse, error)
	ServiceRevision(context.Context) uint64
}
```

### Unknown Field Filtering

To correctly perform [unknown field filtering](adr-020-protobuf-transaction-encoding.md#unknown-field-filtering),
the inter-module router can do one of the following:

* use the `protoreflect` API for messages which support that
* for gogo proto messages, marshal and use the existing `codec/unknownproto` code
* for zero-copy messages, do a simple check on the highest set field number (assuming we can require that fields are
  adding consecutively in increasing order)

### `FileDescriptor` Registration

Because a single go binary may contain different versions of the same generated protobuf code, we cannot rely on the
global protobuf registry to contain the correct `FileDescriptor`s. Because `appconfig` module configuration is itself
written in protobuf, we would like to load the `FileDescriptor`s for a module before loading a module itself. So we
will provide ways to register `FileDescriptor`s at module registration time before instantiation. We propose the
following `cosmossdk.io/core/appmodule.Option` constructors for the various cases of how `FileDescriptor`s may be
packaged:

```go
package appmodule

// this can be used when we are using google.golang.org/protobuf compatible generated code
// Ex:
//   ProtoFiles(bankv1beta1.File_cosmos_bank_v1beta1_module_proto)
func ProtoFiles(file []protoreflect.FileDescriptor) Option {}

// this can be used when we are using gogo proto generated code.
func GzippedProtoFiles(file [][]byte) Option {}

// this can be used when we are using buf build to generated a pinned file descriptor
func ProtoImage(protoImage []byte) Option {}
```

This approach allows us to support several ways protobuf files might be generated:
* proto files generated internally to a module (use `ProtoFiles`)
* the API module approach with pinned file descriptors (use `ProtoImage`)
* gogo proto (use `GzippedProtoFiles`)

### Module Dependency Declaration

One risk of ADR 033 is that dependencies are called at runtime which are not present in the loaded set of SDK modules.  
Also we want modules to have a way to define a minimum dependency API revision that they require. Therefore, all
modules should declare their set of dependencies upfront. These dependencies could be defined when a module is
instantiated, but ideally we know what the dependencies are before instantiation and can statically look at an app
config and determine whether the set of modules. For example, if `bar` requires `foo` revision `>= 1`, then we
should be able to know this when creating an app config with two versions of `bar` and `foo`.

We propose defining these dependencies in the proto options of the module config object itself.

### Interface Registration

We will also need to define how interface methods are defined on types that are serialized as `google.protobuf.Any`'s.
In light of the desire to support modules in other languages, we may want to think of solutions that will accommodate
other languages such as plugins described briefly in [ADR 033](adr-033-protobuf-inter-module-comm.md#internal-methods).

### Testing

In order to ensure that modules are indeed with multiple versions of their dependencies, we plan to provide specialized
unit and integration testing infrastructure that automatically tests multiple versions of dependencies.

#### Unit Testing

Unit tests should be conducted inside SDK modules by mocking their dependencies. In a full ADR 033 scenario,
this means that all interaction with other modules is done via the inter-module router, so mocking of dependencies
means mocking their msg and query server implementations. We will provide both a test runner and fixture to make this
streamlined. The key thing that the test runner should do to test compatibility is to test all combinations of
dependency API revisions. This can be done by taking the file descriptors for the dependencies, parsing their comments
to determine the revisions various elements were added, and then created synthetic file descriptors for each revision
by subtracting elements that were added later.

Here is a proposed API for the unit test runner and fixture:

```go
package moduletesting

import (
	"context"
	"testing"

	"cosmossdk.io/core/intermodule"
	"cosmossdk.io/depinject"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
)

type TestFixture interface {
	context.Context
	intermodule.Client // for making calls to the module we're testing
	BeginBlock()
	EndBlock()
}

type UnitTestFixture interface {
	TestFixture
	grpc.ServiceRegistrar // for registering mock service implementations
}

type UnitTestConfig struct {
	ModuleConfig              proto.Message    // the module's config object
	DepinjectConfig           depinject.Config // optional additional depinject config options
	DependencyFileDescriptors []protodesc.FileDescriptorProto // optional dependency file descriptors to use instead of the global registry
}

// Run runs the test function for all combinations of dependency API revisions.
func (cfg UnitTestConfig) Run(t *testing.T, f func(t *testing.T, f UnitTestFixture)) {
	// ...
}
```

Here is an example for testing bar calling foo which takes advantage of conditional service revisions in the expected
mock arguments:

```go
func TestBar(t *testing.T) {
    UnitTestConfig{ModuleConfig: &foomodulev1.Module{}}.Run(t, func (t *testing.T, f moduletesting.UnitTestFixture) {
        ctrl := gomock.NewController(t)
        mockFooMsgServer := footestutil.NewMockMsgServer()
        foov1.RegisterMsgServer(f, mockFooMsgServer)
        barMsgClient := barv1.NewMsgClient(f)
		if f.ServiceRevision(foov1.Msg_ServiceDesc.ServiceName) >= 1 {
            mockFooMsgServer.EXPECT().DoSomething(gomock.Any(), &foov1.MsgDoSomething{
				...,
				Condition: ..., // condition is expected in revision >= 1
            }).Return(&foov1.MsgDoSomethingResponse{}, nil)
        } else {
            mockFooMsgServer.EXPECT().DoSomething(gomock.Any(), &foov1.MsgDoSomething{...}).Return(&foov1.MsgDoSomethingResponse{}, nil)
        }
        res, err := barMsgClient.CallFoo(f, &MsgCallFoo{})
        ...
    })
}
```

The unit test runner would make sure that no dependency mocks return arguments which are invalid for the service
revision being tested to ensure that modules don't incorrectly depend on functionality not present in a given revision.

#### Integration Testing

An integration test runner and fixture would also be provided which instead of using mocks would test actual module
dependencies in various combinations. Here is the proposed API:

```go
type IntegrationTestFixture interface {
    TestFixture
}

type IntegrationTestConfig struct {
    ModuleConfig     proto.Message    // the module's config object
    DependencyMatrix map[string][]proto.Message // all the dependent module configs
}

// Run runs the test function for all combinations of dependency modules.
func (cfg IntegationTestConfig) Run(t *testing.T, f func (t *testing.T, f IntegrationTestFixture)) {
    // ...
}
```

And here is an example with foo and bar:

```go
func TestBarIntegration(t *testing.T) {
    IntegrationTestConfig{
        ModuleConfig: &barmodulev1.Module{},
        DependencyMatrix: map[string][]proto.Message{
            "runtime": []proto.Message{ // test against two versions of runtime
                &runtimev1.Module{},
                &runtimev2.Module{},
            },
            "foo": []proto.Message{ // test against three versions of foo
                &foomodulev1.Module{},
                &foomodulev2.Module{},
                &foomodulev3.Module{},
            }
        }   
    }.Run(t, func (t *testing.T, f moduletesting.IntegrationTestFixture) {
        barMsgClient := barv1.NewMsgClient(f)
        res, err := barMsgClient.CallFoo(f, &MsgCallFoo{})
        ...
    })
}
```

Unlike unit tests, integration tests actually pull in other module dependencies. So that modules can be written
without direct dependencies on other modules and because golang has no concept of development dependencies, integration
tests should be written in separate go modules, ex. `example.com/bar/v2/test`. Because this paradigm uses go semantic
versioning, it is possible to build a single go module which imports 3 versions of bar and 2 versions of runtime and
can test these all together in the six various combinations of dependencies.

## Consequences

### Backwards Compatibility

Modules which migrate fully to ADR 033 will not be compatible with existing modules which use the keeper paradigm.
As a temporary workaround we may create some wrapper types that emulate the current keeper interface to minimize
the migration overhead.

### Positive

* we will be able to deliver interoperable semantically versioned modules which should dramatically increase the
  ability of the Cosmos SDK ecosystem to iterate on new features
* it will be possible to write Cosmos SDK modules in other languages in the near future

### Negative

* all modules will need to be refactored somewhat dramatically

### Neutral

* the `cosmossdk.io/core/appconfig` framework will play a more central role in terms of how modules are defined, this
  is likely generally a good thing but does mean additional changes for users wanting to stick to the pre-depinject way
  of wiring up modules
* `depinject` is somewhat less needed or maybe even obviated because of the full ADR 033 approach. If we adopt the
  core API proposed in https://github.com/cosmos/cosmos-sdk/pull/12239, then a module would probably always instantiate
  itself with a method `ProvideModule(appmodule.Service) (appmodule.AppModule, error)`. There is no complex wiring of
  keeper dependencies in this scenario and dependency injection may not have as much of (or any) use case.

## Further Discussions

The decision described above is considered in draft mode and is pending final buy-in from the team and key stakeholders.
Key outstanding discussions if we do adopt that direction are:

* how do module clients introspect dependency module API revisions
* how do modules determine a minor dependency module API revision requirement
* how do modules appropriately test compatibility with different dependency versions
* how to register and resolve interface implementations
* how do modules register their protobuf file descriptors depending on the approach they take to generated code (the
  API module approach may still be viable as a supported strategy and would need pinned file descriptors)

## References

* https://github.com/cosmos/cosmos-sdk/discussions/10162
* https://github.com/cosmos/cosmos-sdk/discussions/10582
* https://github.com/cosmos/cosmos-sdk/discussions/10368
* https://github.com/cosmos/cosmos-sdk/pull/11340
* https://github.com/cosmos/cosmos-sdk/issues/11899
* [ADR 020](adr-020-protobuf-transaction-encoding.md)
* [ADR 033](adr-033-protobuf-inter-module-comm.md)
