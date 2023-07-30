# ADR 3: 动态能力存储

## 更新日志

* 2019年12月12日：初始版本
* 2020年4月2日：内存存储修订

## 背景

完整实现 [IBC 规范](https://github.com/cosmos/ibc) 需要在运行时（即在事务执行期间）创建和验证对象能力密钥的能力，如 [ICS 5](https://github.com/cosmos/ibc/tree/master/spec/core/ics-005-port-allocation#technical-specification) 中所述。在 IBC 规范中，为每个新初始化的端口和通道创建能力密钥，并用于验证将来对端口或通道的使用。由于通道和潜在的端口可以在事务执行期间初始化，因此状态机必须能够在此时创建对象能力密钥。

目前，Cosmos SDK 没有这样的能力。对象能力密钥当前是指向在 `app.go` 中应用程序初始化时创建的 `StoreKey` 结构体的指针（内存地址）（[示例](https://github.com/cosmos/gaia/blob/dcbddd9f04b3086c0ad07ee65de16e7adedc7da4/app/app.go#L132)），并作为固定参数传递给 Keepers（[示例](https://github.com/cosmos/gaia/blob/dcbddd9f04b3086c0ad07ee65de16e7adedc7da4/app/app.go#L160)）。Keepers 无法在事务执行期间创建或存储能力密钥 —— 尽管它们可以调用 `NewKVStoreKey` 并获取返回的结构体的内存地址，但将其存储在 Merklised 存储中将导致共识故障，因为每台机器上的内存地址都将不同（这是有意的 —— 如果不是这样，密钥将是可预测的，无法作为对象能力）。

Keepers 需要一种在事务执行期间可以更改的私有存储键映射方式，以及一种在每次启动或重新启动应用程序时重新生成此映射中的唯一内存地址（能力密钥）的适当机制，以及一种在事务失败时撤销能力创建的机制。本 ADR 提出了这样的接口和机制。

## 决策

Cosmos SDK将包括一个新的`CapabilityKeeper`抽象，负责在运行时提供、跟踪和验证功能。在`app.go`的应用程序初始化期间，通过唯一的函数引用（通过调用下面定义的`ScopeToModule`）将`CapabilityKeeper`与模块连接起来，以便在稍后调用时可以识别调用模块。

当从磁盘加载初始状态时，`CapabilityKeeper`的`Initialise`函数将为所有先前分配的功能标识符（在执行过去的事务期间分配并分配给特定模式）创建新的功能键，并在链运行时将它们保存在仅内存存储中。

`CapabilityKeeper`将包括一个持久的`KVStore`、一个`MemoryStore`和一个内存映射。持久的`KVStore`跟踪哪个模块拥有哪个功能。`MemoryStore`存储从模块名称、功能元组到功能名称的正向映射，以及从模块名称、功能名称到功能索引的反向映射。由于我们无法将功能序列化为`KVStore`并在不更改功能的内存位置的情况下反序列化，因此`KVStore`中的反向映射将简单地映射到一个索引。然后，可以使用此索引作为临时go-map中的键来检索原始内存位置的功能。

`CapabilityKeeper`将定义以下类型和函数：

`Capability`类似于`StoreKey`，但具有全局唯一的`Index()`而不是名称。提供了一个`String()`方法用于调试。

`Capability`只是一个结构体，其地址被用于实际功能。

```go
type Capability struct {
  index uint64
}
```

`CapabilityKeeper`包含一个持久存储键、内存存储键和分配的模块名称的映射。

```go
type CapabilityKeeper struct {
  persistentKey StoreKey
  memKey        StoreKey
  capMap        map[uint64]*Capability
  moduleNames   map[string]interface{}
  sealed        bool
}
```

`CapabilityKeeper`提供了创建与特定模块名称相关联的*作用域*子`Keeper`的能力。这些`ScopedCapabilityKeeper`必须在应用程序初始化时创建并传递给模块，然后模块可以使用它们来声明接收到的功能和按名称检索自己拥有的功能，以及创建新功能和验证其他模块传递的功能。

```go
type ScopedCapabilityKeeper struct {
  persistentKey StoreKey
  memKey        StoreKey
  capMap        map[uint64]*Capability
  moduleName    string
}
```

`ScopeToModule`用于创建具有特定名称的作用域子存储器，该名称必须是唯一的。
在调用`InitialiseAndSeal`之前，必须调用它。

```go
func (ck CapabilityKeeper) ScopeToModule(moduleName string) ScopedCapabilityKeeper {
	if k.sealed {
		panic("cannot scope to module via a sealed capability keeper")
	}

	if _, ok := k.scopedModules[moduleName]; ok {
		panic(fmt.Sprintf("cannot create multiple scoped keepers for the same module name: %s", moduleName))
	}

	k.scopedModules[moduleName] = struct{}{}

	return ScopedKeeper{
		cdc:      k.cdc,
		storeKey: k.storeKey,
		memKey:   k.memKey,
		capMap:   k.capMap,
		module:   moduleName,
	}
}
```

在加载初始状态并创建所有必要的`ScopedCapabilityKeeper`之后，必须且仅能调用`InitialiseAndSeal`一次，
以便根据先前由特定模块声明的键，在内存存储器中填充新创建的能力键，并防止创建任何新的`ScopedCapabilityKeeper`。

```go
func (ck CapabilityKeeper) InitialiseAndSeal(ctx Context) {
  if ck.sealed {
    panic("capability keeper is sealed")
  }

  persistentStore := ctx.KVStore(ck.persistentKey)
  map := ctx.KVStore(ck.memKey)
  
  // initialise memory store for all names in persistent store
  for index, value := range persistentStore.Iter() {
    capability = &CapabilityKey{index: index}

    for moduleAndCapability := range value {
      moduleName, capabilityName := moduleAndCapability.Split("/")
      memStore.Set(moduleName + "/fwd/" + capability, capabilityName)
      memStore.Set(moduleName + "/rev/" + capabilityName, index)

      ck.capMap[index] = capability
    }
  }

  ck.sealed = true
}
```

任何模块都可以调用`NewCapability`来创建一个新的唯一、不可伪造的对象能力引用。
新创建的能力会自动持久化；调用模块不需要调用`ClaimCapability`。

```go
func (sck ScopedCapabilityKeeper) NewCapability(ctx Context, name string) (Capability, error) {
  // check name not taken in memory store
  if capStore.Get("rev/" + name) != nil {
    return nil, errors.New("name already taken")
  }

  // fetch the current index
  index := persistentStore.Get("index")
  
  // create a new capability
  capability := &CapabilityKey{index: index}
  
  // set persistent store
  persistentStore.Set(index, Set.singleton(sck.moduleName + "/" + name))
  
  // update the index
  index++
  persistentStore.Set("index", index)
  
  // set forward mapping in memory store from capability to name
  memStore.Set(sck.moduleName + "/fwd/" + capability, name)
  
  // set reverse mapping in memory store from name to index
  memStore.Set(sck.moduleName + "/rev/" + name, index)

  // set the in-memory mapping from index to capability pointer
  capMap[index] = capability
  
  // return the newly created capability
  return capability
}
```

任何模块都可以调用`AuthenticateCapability`来检查能力是否确实对应于特定名称（名称可以是不可信的用户输入），
并且该名称是调用模块先前关联的。

```go
func (sck ScopedCapabilityKeeper) AuthenticateCapability(name string, capability Capability) bool {
  // return whether forward mapping in memory store matches name
  return memStore.Get(sck.moduleName + "/fwd/" + capability) === name
}
```

`ClaimCapability`允许一个模块声明它从另一个模块接收到的能力键，
以便将来的`GetCapability`调用将成功。

如果一个模块接收到一个能力并希望在将来通过名称访问它，必须调用`ClaimCapability`。
能力是多所有者的，因此如果多个模块拥有一个`Capability`引用，它们都将拥有它。

```go
func (sck ScopedCapabilityKeeper) ClaimCapability(ctx Context, capability Capability, name string) error {
  persistentStore := ctx.KVStore(sck.persistentKey)

  // set forward mapping in memory store from capability to name
  memStore.Set(sck.moduleName + "/fwd/" + capability, name)

  // set reverse mapping in memory store from name to capability
  memStore.Set(sck.moduleName + "/rev/" + name, capability)

  // update owner set in persistent store
  owners := persistentStore.Get(capability.Index())
  owners.add(sck.moduleName + "/" + name)
  persistentStore.Set(capability.Index(), owners)
}
```

`GetCapability`允许一个模块获取它先前通过名称声明的能力。
该模块不允许检索它不拥有的能力。

```go
func (sck ScopedCapabilityKeeper) GetCapability(ctx Context, name string) (Capability, error) {
  // fetch the index of capability using reverse mapping in memstore
  index := memStore.Get(sck.moduleName + "/rev/" + name)

  // fetch capability from go-map using index
  capability := capMap[index]

  // return the capability
  return capability
}
```

`ReleaseCapability`允许一个模块释放它先前声明的能力。
如果没有更多的所有者存在，该能力将在全局范围内被删除。

```go
func (sck ScopedCapabilityKeeper) ReleaseCapability(ctx Context, capability Capability) err {
  persistentStore := ctx.KVStore(sck.persistentKey)

  name := capStore.Get(sck.moduleName + "/fwd/" + capability)
  if name == nil {
    return error("capability not owned by module")
  }

  // delete forward mapping in memory store
  memoryStore.Delete(sck.moduleName + "/fwd/" + capability, name)

  // delete reverse mapping in memory store
  memoryStore.Delete(sck.moduleName + "/rev/" + name, capability)

  // update owner set in persistent store
  owners := persistentStore.Get(capability.Index())
  owners.remove(sck.moduleName + "/" + name)
  if owners.size() > 0 {
    // there are still other owners, keep the capability around
    persistentStore.Set(capability.Index(), owners)
  } else {
    // no more owners, delete the capability
    persistentStore.Delete(capability.Index())
    delete(capMap[capability.Index()])
  }
}
```

### 使用模式

#### 初始化

任何使用动态能力的模块都必须在`app.go`中提供一个`ScopedCapabilityKeeper`：

```go
ck := NewCapabilityKeeper(persistentKey, memoryKey)
mod1Keeper := NewMod1Keeper(ck.ScopeToModule("mod1"), ....)
mod2Keeper := NewMod2Keeper(ck.ScopeToModule("mod2"), ....)

// other initialisation logic ...

// load initial state...

ck.InitialiseAndSeal(initialContext)
```

#### 创建、传递、声明和使用能力

考虑这样一种情况，`mod1`想要创建一个能力，将其与资源（例如IBC通道）关联起来，并通过名称传递给稍后将使用它的`mod2`：

模块1将具有以下代码：

```go
capability := scopedCapabilityKeeper.NewCapability(ctx, "resourceABC")
mod2Keeper.SomeFunction(ctx, capability, args...)
```

在模块2中运行的`SomeFunction`可以声明该能力：

```go
func (k Mod2Keeper) SomeFunction(ctx Context, capability Capability) {
  k.sck.ClaimCapability(ctx, capability, "resourceABC")
  // other logic...
}
```

稍后，模块2可以通过名称检索该能力，并将其传递给模块1，模块1将对其进行资源验证：

```go
func (k Mod2Keeper) SomeOtherFunction(ctx Context, name string) {
  capability := k.sck.GetCapability(ctx, name)
  mod1.UseResource(ctx, capability, "resourceABC")
}
```

然后，模块1将检查此能力密钥是否经过身份验证以使用该资源，然后允许模块2使用它：

```go
func (k Mod1Keeper) UseResource(ctx Context, capability Capability, resource string) {
  if !k.sck.AuthenticateCapability(name, capability) {
    return errors.New("unauthenticated")
  }
  // do something with the resource
}
```

如果模块2将能力密钥传递给模块3，模块3可以声明它并像模块2一样调用模块1
（在这种情况下，模块1、模块2和模块3都能够使用此能力）。

## 状态

建议。

## 结果

### 积极影响

* 动态能力支持。
* 允许CapabilityKeeper从go-map返回相同的能力指针，同时在交易失败时还原对持久`KVStore`和内存`MemoryStore`的任何写入。

### 负面影响

* 需要额外的keeper。
* 与现有的`StoreKey`系统有一些重叠（将来可以合并，因为在功能上这是一个超集）。
* 在反向映射中需要额外的间接层，因为MemoryStore必须映射到索引，然后在go map中使用该索引作为键来检索实际的能力。

### 中性影响

（目前没有已知的）

## 参考资料

* [原始讨论](https://github.com/cosmos/cosmos-sdk/pull/5230#discussion_r343978513)


# ADR 3: Dynamic Capability Store

## Changelog

* 12 December 2019: Initial version
* 02 April 2020: Memory Store Revisions

## Context

Full implementation of the [IBC specification](https://github.com/cosmos/ibc) requires the ability to create and authenticate object-capability keys at runtime (i.e., during transaction execution),
as described in [ICS 5](https://github.com/cosmos/ibc/tree/master/spec/core/ics-005-port-allocation#technical-specification). In the IBC specification, capability keys are created for each newly initialised
port & channel, and are used to authenticate future usage of the port or channel. Since channels and potentially ports can be initialised during transaction execution, the state machine must be able to create
object-capability keys at this time.

At present, the Cosmos SDK does not have the ability to do this. Object-capability keys are currently pointers (memory addresses) of `StoreKey` structs created at application initialisation in `app.go` ([example](https://github.com/cosmos/gaia/blob/dcbddd9f04b3086c0ad07ee65de16e7adedc7da4/app/app.go#L132))
and passed to Keepers as fixed arguments ([example](https://github.com/cosmos/gaia/blob/dcbddd9f04b3086c0ad07ee65de16e7adedc7da4/app/app.go#L160)). Keepers cannot create or store capability keys during transaction execution — although they could call `NewKVStoreKey` and take the memory address
of the returned struct, storing this in the Merklised store would result in a consensus fault, since the memory address will be different on each machine (this is intentional — were this not the case, the keys would be predictable and couldn't serve as object capabilities).

Keepers need a way to keep a private map of store keys which can be altered during transaction execution, along with a suitable mechanism for regenerating the unique memory addresses (capability keys) in this map whenever the application is started or restarted, along with a mechanism to revert capability creation on tx failure.
This ADR proposes such an interface & mechanism.

## Decision

The Cosmos SDK will include a new `CapabilityKeeper` abstraction, which is responsible for provisioning,
tracking, and authenticating capabilities at runtime. During application initialisation in `app.go`,
the `CapabilityKeeper` will be hooked up to modules through unique function references
(by calling `ScopeToModule`, defined below) so that it can identify the calling module when later
invoked.

When the initial state is loaded from disk, the `CapabilityKeeper`'s `Initialise` function will create
new capability keys for all previously allocated capability identifiers (allocated during execution of
past transactions and assigned to particular modes), and keep them in a memory-only store while the
chain is running.

The `CapabilityKeeper` will include a persistent `KVStore`, a `MemoryStore`, and an in-memory map.
The persistent `KVStore` tracks which capability is owned by which modules.
The `MemoryStore` stores a forward mapping that map from module name, capability tuples to capability names and
a reverse mapping that map from module name, capability name to the capability index.
Since we cannot marshal the capability into a `KVStore` and unmarshal without changing the memory location of the capability,
the reverse mapping in the KVStore will simply map to an index. This index can then be used as a key in the ephemeral
go-map to retrieve the capability at the original memory location.

The `CapabilityKeeper` will define the following types & functions:

The `Capability` is similar to `StoreKey`, but has a globally unique `Index()` instead of
a name. A `String()` method is provided for debugging.

A `Capability` is simply a struct, the address of which is taken for the actual capability.

```go
type Capability struct {
  index uint64
}
```

A `CapabilityKeeper` contains a persistent store key, memory store key, and mapping of allocated module names.

```go
type CapabilityKeeper struct {
  persistentKey StoreKey
  memKey        StoreKey
  capMap        map[uint64]*Capability
  moduleNames   map[string]interface{}
  sealed        bool
}
```

The `CapabilityKeeper` provides the ability to create *scoped* sub-keepers which are tied to a
particular module name. These `ScopedCapabilityKeeper`s must be created at application initialisation
and passed to modules, which can then use them to claim capabilities they receive and retrieve
capabilities which they own by name, in addition to creating new capabilities & authenticating capabilities
passed by other modules.

```go
type ScopedCapabilityKeeper struct {
  persistentKey StoreKey
  memKey        StoreKey
  capMap        map[uint64]*Capability
  moduleName    string
}
```

`ScopeToModule` is used to create a scoped sub-keeper with a particular name, which must be unique.
It MUST be called before `InitialiseAndSeal`.

```go
func (ck CapabilityKeeper) ScopeToModule(moduleName string) ScopedCapabilityKeeper {
	if k.sealed {
		panic("cannot scope to module via a sealed capability keeper")
	}

	if _, ok := k.scopedModules[moduleName]; ok {
		panic(fmt.Sprintf("cannot create multiple scoped keepers for the same module name: %s", moduleName))
	}

	k.scopedModules[moduleName] = struct{}{}

	return ScopedKeeper{
		cdc:      k.cdc,
		storeKey: k.storeKey,
		memKey:   k.memKey,
		capMap:   k.capMap,
		module:   moduleName,
	}
}
```

`InitialiseAndSeal` MUST be called exactly once, after loading the initial state and creating all
necessary `ScopedCapabilityKeeper`s, in order to populate the memory store with newly-created
capability keys in accordance with the keys previously claimed by particular modules and prevent the
creation of any new `ScopedCapabilityKeeper`s.

```go
func (ck CapabilityKeeper) InitialiseAndSeal(ctx Context) {
  if ck.sealed {
    panic("capability keeper is sealed")
  }

  persistentStore := ctx.KVStore(ck.persistentKey)
  map := ctx.KVStore(ck.memKey)
  
  // initialise memory store for all names in persistent store
  for index, value := range persistentStore.Iter() {
    capability = &CapabilityKey{index: index}

    for moduleAndCapability := range value {
      moduleName, capabilityName := moduleAndCapability.Split("/")
      memStore.Set(moduleName + "/fwd/" + capability, capabilityName)
      memStore.Set(moduleName + "/rev/" + capabilityName, index)

      ck.capMap[index] = capability
    }
  }

  ck.sealed = true
}
```

`NewCapability` can be called by any module to create a new unique, unforgeable object-capability
reference. The newly created capability is automatically persisted; the calling module need not
call `ClaimCapability`.

```go
func (sck ScopedCapabilityKeeper) NewCapability(ctx Context, name string) (Capability, error) {
  // check name not taken in memory store
  if capStore.Get("rev/" + name) != nil {
    return nil, errors.New("name already taken")
  }

  // fetch the current index
  index := persistentStore.Get("index")
  
  // create a new capability
  capability := &CapabilityKey{index: index}
  
  // set persistent store
  persistentStore.Set(index, Set.singleton(sck.moduleName + "/" + name))
  
  // update the index
  index++
  persistentStore.Set("index", index)
  
  // set forward mapping in memory store from capability to name
  memStore.Set(sck.moduleName + "/fwd/" + capability, name)
  
  // set reverse mapping in memory store from name to index
  memStore.Set(sck.moduleName + "/rev/" + name, index)

  // set the in-memory mapping from index to capability pointer
  capMap[index] = capability
  
  // return the newly created capability
  return capability
}
```

`AuthenticateCapability` can be called by any module to check that a capability
does in fact correspond to a particular name (the name can be untrusted user input)
with which the calling module previously associated it.

```go
func (sck ScopedCapabilityKeeper) AuthenticateCapability(name string, capability Capability) bool {
  // return whether forward mapping in memory store matches name
  return memStore.Get(sck.moduleName + "/fwd/" + capability) === name
}
```

`ClaimCapability` allows a module to claim a capability key which it has received from another module
so that future `GetCapability` calls will succeed.

`ClaimCapability` MUST be called if a module which receives a capability wishes to access it by name
in the future. Capabilities are multi-owner, so if multiple modules have a single `Capability` reference,
they will all own it.

```go
func (sck ScopedCapabilityKeeper) ClaimCapability(ctx Context, capability Capability, name string) error {
  persistentStore := ctx.KVStore(sck.persistentKey)

  // set forward mapping in memory store from capability to name
  memStore.Set(sck.moduleName + "/fwd/" + capability, name)

  // set reverse mapping in memory store from name to capability
  memStore.Set(sck.moduleName + "/rev/" + name, capability)

  // update owner set in persistent store
  owners := persistentStore.Get(capability.Index())
  owners.add(sck.moduleName + "/" + name)
  persistentStore.Set(capability.Index(), owners)
}
```

`GetCapability` allows a module to fetch a capability which it has previously claimed by name.
The module is not allowed to retrieve capabilities which it does not own.

```go
func (sck ScopedCapabilityKeeper) GetCapability(ctx Context, name string) (Capability, error) {
  // fetch the index of capability using reverse mapping in memstore
  index := memStore.Get(sck.moduleName + "/rev/" + name)

  // fetch capability from go-map using index
  capability := capMap[index]

  // return the capability
  return capability
}
```

`ReleaseCapability` allows a module to release a capability which it had previously claimed. If no
more owners exist, the capability will be deleted globally.

```go
func (sck ScopedCapabilityKeeper) ReleaseCapability(ctx Context, capability Capability) err {
  persistentStore := ctx.KVStore(sck.persistentKey)

  name := capStore.Get(sck.moduleName + "/fwd/" + capability)
  if name == nil {
    return error("capability not owned by module")
  }

  // delete forward mapping in memory store
  memoryStore.Delete(sck.moduleName + "/fwd/" + capability, name)

  // delete reverse mapping in memory store
  memoryStore.Delete(sck.moduleName + "/rev/" + name, capability)

  // update owner set in persistent store
  owners := persistentStore.Get(capability.Index())
  owners.remove(sck.moduleName + "/" + name)
  if owners.size() > 0 {
    // there are still other owners, keep the capability around
    persistentStore.Set(capability.Index(), owners)
  } else {
    // no more owners, delete the capability
    persistentStore.Delete(capability.Index())
    delete(capMap[capability.Index()])
  }
}
```

### Usage patterns

#### Initialisation

Any modules which use dynamic capabilities must be provided a `ScopedCapabilityKeeper` in `app.go`:

```go
ck := NewCapabilityKeeper(persistentKey, memoryKey)
mod1Keeper := NewMod1Keeper(ck.ScopeToModule("mod1"), ....)
mod2Keeper := NewMod2Keeper(ck.ScopeToModule("mod2"), ....)

// other initialisation logic ...

// load initial state...

ck.InitialiseAndSeal(initialContext)
```

#### Creating, passing, claiming and using capabilities

Consider the case where `mod1` wants to create a capability, associate it with a resource (e.g. an IBC channel) by name, then pass it to `mod2` which will use it later:

Module 1 would have the following code:

```go
capability := scopedCapabilityKeeper.NewCapability(ctx, "resourceABC")
mod2Keeper.SomeFunction(ctx, capability, args...)
```

`SomeFunction`, running in module 2, could then claim the capability:

```go
func (k Mod2Keeper) SomeFunction(ctx Context, capability Capability) {
  k.sck.ClaimCapability(ctx, capability, "resourceABC")
  // other logic...
}
```

Later on, module 2 can retrieve that capability by name and pass it to module 1, which will authenticate it against the resource:

```go
func (k Mod2Keeper) SomeOtherFunction(ctx Context, name string) {
  capability := k.sck.GetCapability(ctx, name)
  mod1.UseResource(ctx, capability, "resourceABC")
}
```

Module 1 will then check that this capability key is authenticated to use the resource before allowing module 2 to use it:

```go
func (k Mod1Keeper) UseResource(ctx Context, capability Capability, resource string) {
  if !k.sck.AuthenticateCapability(name, capability) {
    return errors.New("unauthenticated")
  }
  // do something with the resource
}
```

If module 2 passed the capability key to module 3, module 3 could then claim it and call module 1 just like module 2 did
(in which case module 1, module 2, and module 3 would all be able to use this capability).

## Status

Proposed.

## Consequences

### Positive

* Dynamic capability support.
* Allows CapabilityKeeper to return same capability pointer from go-map while reverting any writes to the persistent `KVStore` and in-memory `MemoryStore` on tx failure.

### Negative

* Requires an additional keeper.
* Some overlap with existing `StoreKey` system (in the future they could be combined, since this is a superset functionality-wise).
* Requires an extra level of indirection in the reverse mapping, since MemoryStore must map to index which must then be used as key in a go map to retrieve the actual capability

### Neutral

(none known)

## References

* [Original discussion](https://github.com/cosmos/cosmos-sdk/pull/5230#discussion_r343978513)
