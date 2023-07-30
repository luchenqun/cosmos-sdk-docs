# `x/params`

> 注意：Params 模块已被弃用，现在每个模块都应该自己管理自己的参数。

## 摘要

params 包提供了一个全局可用的参数存储。

有两种主要类型，Keeper 和 Subspace。Subspace 是一个隔离的命名空间，用于参数存储，其中的键以预配置的 spacename 为前缀。Keeper 具有访问所有现有空间的权限。

Subspace 可以被个别的 keepers 使用，这些 keepers 需要一个私有的参数存储，其他 keepers 无法修改。params Keeper 可以用于在提案通过后，向 `x/gov` 路由器添加路由以修改任何参数。

以下内容解释了如何在主模块和用户模块中使用 params 模块。

## 内容

* [Keeper](#keeper)
* [Subspace](#subspace)
    * [Key](#key)
    * [KeyTable](#keytable)
    * [ParamSet](#paramset)

## Keeper

在应用程序初始化阶段，可以使用 `Keeper.Subspace` 为其他模块的 keeper 分配 [subspaces](#subspace)，并将其存储在 `Keeper.spaces` 中。然后，这些模块可以通过 `Keeper.GetSubspace` 引用其特定的参数存储。

示例：

```go
type ExampleKeeper struct {
	paramSpace paramtypes.Subspace
}

func (k ExampleKeeper) SetParams(ctx sdk.Context, params types.Params) {
	k.paramSpace.SetParamSet(ctx, &params)
}
```

## Subspace

`Subspace` 是参数存储的带前缀的子空间。每个使用参数存储的模块都会使用一个 `Subspace` 来隔离访问权限。

### Key

参数键是可读的字母数字字符串。键为 `"ExampleParameter"` 的参数存储在 `[]byte("SubspaceName" + "/" + "ExampleParameter")` 下，其中 `"SubspaceName"` 是子空间的名称。

子键是与主参数键一起使用的次要参数键。子键可以用于分组或在运行时生成动态参数键。

### KeyTable

所有将要使用的参数键都应在编译时注册。`KeyTable` 本质上是一个 `map[string]attribute`，其中 `string` 是参数键。

目前，`attribute` 包括一个 `reflect.Type`，用于检查提供的键和值是否兼容并已注册的参数类型，以及一个函数 `ValueValidatorFn` 用于验证值。

只有主键需要在`KeyTable`上注册。子键会继承主键的属性。

### ParamSet

模块通常将参数定义为proto消息。生成的结构体可以实现`ParamSet`接口，以便与以下方法一起使用：

* `KeyTable.RegisterParamSet()`: 注册结构体中的所有参数
* `Subspace.{Get, Set}ParamSet()`: 从结构体中获取和设置参数

实现者应该是一个指针，以便使用`GetParamSet()`方法。




# `x/params`

> Note: The Params module has been depreacted in favour of each module housing its own parameters. 

## Abstract

Package params provides a globally available parameter store.

There are two main types, Keeper and Subspace. Subspace is an isolated namespace for a
paramstore, where keys are prefixed by preconfigured spacename. Keeper has a
permission to access all existing spaces.

Subspace can be used by the individual keepers, which need a private parameter store
that the other keepers cannot modify. The params Keeper can be used to add a route to `x/gov` router in order to modify any parameter in case a proposal passes.

The following contents explains how to use params module for master and user modules.

## Contents

* [Keeper](#keeper)
* [Subspace](#subspace)
    * [Key](#key)
    * [KeyTable](#keytable)
    * [ParamSet](#paramset)

## Keeper

In the app initialization stage, [subspaces](#subspace) can be allocated for other modules' keeper using `Keeper.Subspace` and are stored in `Keeper.spaces`. Then, those modules can have a reference to their specific parameter store through `Keeper.GetSubspace`.

Example:

```go
type ExampleKeeper struct {
	paramSpace paramtypes.Subspace
}

func (k ExampleKeeper) SetParams(ctx sdk.Context, params types.Params) {
	k.paramSpace.SetParamSet(ctx, &params)
}
```

## Subspace

`Subspace` is a prefixed subspace of the parameter store. Each module which uses the
parameter store will take a `Subspace` to isolate permission to access.

### Key

Parameter keys are human readable alphanumeric strings. A parameter for the key
`"ExampleParameter"` is stored under `[]byte("SubspaceName" + "/" + "ExampleParameter")`,
	where `"SubspaceName"` is the name of the subspace.

Subkeys are secondary parameter keys those are used along with a primary parameter key.
Subkeys can be used for grouping or dynamic parameter key generation during runtime.

### KeyTable

All of the parameter keys that will be used should be registered at the compile
time. `KeyTable` is essentially a `map[string]attribute`, where the `string` is a parameter key.

Currently, `attribute` consists of a `reflect.Type`, which indicates the parameter
type to check that provided key and value are compatible and registered, as well as a function `ValueValidatorFn` to validate values.

Only primary keys have to be registered on the `KeyTable`. Subkeys inherit the
attribute of the primary key.

### ParamSet

Modules often define parameters as a proto message. The generated struct can implement
`ParamSet` interface to be used with the following methods:

* `KeyTable.RegisterParamSet()`: registers all parameters in the struct
* `Subspace.{Get, Set}ParamSet()`: Get to & Set from the struct

The implementor should be a pointer in order to use `GetParamSet()`.
