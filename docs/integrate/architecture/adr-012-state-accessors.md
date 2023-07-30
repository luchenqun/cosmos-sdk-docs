# ADR 012: 状态访问器

## 更新日志

* 2019年9月4日：初稿

## 背景

Cosmos SDK模块目前使用`KVStore`接口和`Codec`来访问它们各自的状态。虽然这为模块开发人员提供了很大的自由度，但它很难模块化，并且用户体验一般。

首先，每次模块尝试访问状态时，都需要对值进行编组、设置或获取值，最后再进行解组。通常，这是通过声明`Keeper.GetXXX`和`Keeper.SetXXX`函数来完成的，这些函数是重复的，难以维护。

其次，这使得与对象能力定理保持一致更加困难：访问状态的权利被定义为`StoreKey`，它在整个Merkle树上具有完全访问权限，因此一个模块不能安全地将访问权发送给另一个模块的特定键值对（或一组键值对）。

最后，由于getter/setter函数被定义为模块的`Keeper`的方法，所以在审查访问状态的任何函数时，审查人员必须考虑整个Merkle树空间。没有静态的方法可以知道函数正在访问的状态的哪一部分（以及哪一部分没有）。

## 决策

我们将定义一个名为`Value`的类型：

```go
type Value struct {
  m   Mapping
  key []byte
}
```

`Value`作为状态中键值对的引用，其中`Value.m`定义了它将访问的键值空间，`Value.key`定义了引用的确切键。

我们将定义一个名为`Mapping`的类型：

```go
type Mapping struct {
  storeKey sdk.StoreKey
  cdc      *codec.LegacyAmino
  prefix   []byte
}
```

`Mapping`作为状态中键值空间的引用，其中`Mapping.storeKey`定义了IAVL（子）树，`Mapping.prefix`定义了可选的子空间前缀。

我们将为`Value`类型定义以下核心方法：

```go
// Get and unmarshal stored data, noop if not exists, panic if cannot unmarshal
func (Value) Get(ctx Context, ptr interface{}) {}

// Get and unmarshal stored data, return error if not exists or cannot unmarshal
func (Value) GetSafe(ctx Context, ptr interface{}) {}

// Get stored data as raw byte slice
func (Value) GetRaw(ctx Context) []byte {}

// Marshal and set a raw value
func (Value) Set(ctx Context, o interface{}) {}

// Check if a raw value exists
func (Value) Exists(ctx Context) bool {}

// Delete a raw value value
func (Value) Delete(ctx Context) {}
```

我们将为`Mapping`类型定义以下核心方法：

```go
// Constructs key-value pair reference corresponding to the key argument in the Mapping space
func (Mapping) Value(key []byte) Value {}

// Get and unmarshal stored data, noop if not exists, panic if cannot unmarshal
func (Mapping) Get(ctx Context, key []byte, ptr interface{}) {}

// Get and unmarshal stored data, return error if not exists or cannot unmarshal
func (Mapping) GetSafe(ctx Context, key []byte, ptr interface{})

// Get stored data as raw byte slice
func (Mapping) GetRaw(ctx Context, key []byte) []byte {}

// Marshal and set a raw value
func (Mapping) Set(ctx Context, key []byte, o interface{}) {}

// Check if a raw value exists
func (Mapping) Has(ctx Context, key []byte) bool {}

// Delete a raw value value
func (Mapping) Delete(ctx Context, key []byte) {}
```

对于`Mapping`类型的每个传递了参数`ctx`、`key`和`args...`的方法，将使用参数`ctx`和`args...`将调用代理到`Mapping.Value(key)`。

此外，我们将定义并提供一组基于`Value`类型的常见类型：

```go
type Boolean struct { Value }
type Enum struct { Value }
type Integer struct { Value; enc IntEncoding }
type String struct { Value }
// ...
```

在这些编码方案可能不同的情况下，核心方法中的`o`参数是有类型的，并且核心方法中的`ptr`参数被显式的返回类型所替代。

最后，我们将定义一系列基于`Mapping`类型的类型：

```go
type Indexer struct {
  m   Mapping
  enc IntEncoding
}
```

其中核心方法中的`key`参数是有类型的。

访问器类型的一些属性包括：

* 只有在调用以`Context`作为参数的函数时才会访问状态
* 访问器类型结构体只能访问其引用的状态，不能访问其他状态
* 在核心方法中隐式进行编组/解组

## 状态

建议中

## 结果

### 积极影响

* 序列化将自动完成
* 代码长度更短，减少样板代码，提供更好的用户体验
* 可以安全地传输对状态的引用
* 显式访问范围

### 负面影响

* 序列化格式将被隐藏
* 与当前架构不同，但可以选择使用访问器类型
* 必须手动定义特定类型的类型（例如`Boolean`和`Integer`）

### 中性影响

## 参考资料

* [#4554](https://github.com/cosmos/cosmos-sdk/issues/4554)


# ADR 012: State Accessors

## Changelog

* 2019 Sep 04: Initial draft

## Context

Cosmos SDK modules currently use the `KVStore` interface and `Codec` to access their respective state. While
this provides a large degree of freedom to module developers, it is hard to modularize and the UX is
mediocre.

First, each time a module tries to access the state, it has to marshal the value and set or get the
value and finally unmarshal. Usually this is done by declaring `Keeper.GetXXX` and `Keeper.SetXXX` functions,
which are repetitive and hard to maintain.

Second, this makes it harder to align with the object capability theorem: the right to access the
state is defined as a `StoreKey`, which gives full access on the entire Merkle tree, so a module cannot
send the access right to a specific key-value pair (or a set of key-value pairs) to another module safely.

Finally, because the getter/setter functions are defined as methods of a module's `Keeper`, the reviewers
have to consider the whole Merkle tree space when they reviewing a function accessing any part of the state.
There is no static way to know which part of the state that the function is accessing (and which is not).

## Decision

We will define a type named `Value`:

```go
type Value struct {
  m   Mapping
  key []byte
}
```

The `Value` works as a reference for a key-value pair in the state, where `Value.m` defines the key-value
space it will access and `Value.key` defines the exact key for the reference.

We will define a type named `Mapping`:

```go
type Mapping struct {
  storeKey sdk.StoreKey
  cdc      *codec.LegacyAmino
  prefix   []byte
}
```

The `Mapping` works as a reference for a key-value space in the state, where `Mapping.storeKey` defines
the IAVL (sub-)tree and `Mapping.prefix` defines the optional subspace prefix.

We will define the following core methods for the `Value` type:

```go
// Get and unmarshal stored data, noop if not exists, panic if cannot unmarshal
func (Value) Get(ctx Context, ptr interface{}) {}

// Get and unmarshal stored data, return error if not exists or cannot unmarshal
func (Value) GetSafe(ctx Context, ptr interface{}) {}

// Get stored data as raw byte slice
func (Value) GetRaw(ctx Context) []byte {}

// Marshal and set a raw value
func (Value) Set(ctx Context, o interface{}) {}

// Check if a raw value exists
func (Value) Exists(ctx Context) bool {}

// Delete a raw value value
func (Value) Delete(ctx Context) {}
```

We will define the following core methods for the `Mapping` type:

```go
// Constructs key-value pair reference corresponding to the key argument in the Mapping space
func (Mapping) Value(key []byte) Value {}

// Get and unmarshal stored data, noop if not exists, panic if cannot unmarshal
func (Mapping) Get(ctx Context, key []byte, ptr interface{}) {}

// Get and unmarshal stored data, return error if not exists or cannot unmarshal
func (Mapping) GetSafe(ctx Context, key []byte, ptr interface{})

// Get stored data as raw byte slice
func (Mapping) GetRaw(ctx Context, key []byte) []byte {}

// Marshal and set a raw value
func (Mapping) Set(ctx Context, key []byte, o interface{}) {}

// Check if a raw value exists
func (Mapping) Has(ctx Context, key []byte) bool {}

// Delete a raw value value
func (Mapping) Delete(ctx Context, key []byte) {}
```

Each method of the `Mapping` type that is passed the arguments `ctx`, `key`, and `args...` will proxy
the call to `Mapping.Value(key)` with arguments `ctx` and `args...`.

In addition, we will define and provide a common set of types derived from the `Value` type:

```go
type Boolean struct { Value }
type Enum struct { Value }
type Integer struct { Value; enc IntEncoding }
type String struct { Value }
// ...
```

Where the encoding schemes can be different, `o` arguments in core methods are typed, and `ptr` arguments
in core methods are replaced by explicit return types.

Finally, we will define a family of types derived from the `Mapping` type:

```go
type Indexer struct {
  m   Mapping
  enc IntEncoding
}
```

Where the `key` argument in core method is typed.

Some of the properties of the accessor types are:

* State access happens only when a function which takes a `Context` as an argument is invoked
* Accessor type structs give rights to access the state only that the struct is referring, no other
* Marshalling/Unmarshalling happens implicitly within the core methods

## Status

Proposed

## Consequences

### Positive

* Serialization will be done automatically
* Shorter code size, less boilerplate, better UX
* References to the state can be transferred safely
* Explicit scope of accessing

### Negative

* Serialization format will be hidden
* Different architecture from the current, but the use of accessor types can be opt-in
* Type-specific types (e.g. `Boolean` and `Integer`) have to be defined manually

### Neutral

## References

* [#4554](https://github.com/cosmos/cosmos-sdk/issues/4554)
