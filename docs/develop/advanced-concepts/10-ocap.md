# 对象能力模型

## 简介

在考虑安全性时，从一个具体的威胁模型开始是很好的。我们的威胁模型如下：

> 我们假设一个繁荣的 Cosmos SDK 模块生态系统，这些模块易于组合成区块链应用程序，但其中可能包含有缺陷或恶意的模块。

Cosmos SDK 旨在通过成为对象能力系统的基础来解决这个威胁。

> 对象能力系统的结构特性有利于代码设计的模块化，并确保代码实现的可靠封装。
>
> 这些结构特性有助于分析对象能力程序或操作系统的某些安全属性。其中一些属性，特别是信息流属性，可以在对象引用和连接的级别上进行分析，而无需了解或分析确定对象行为的代码。
>
> 因此，在存在包含未知和可能恶意代码的新对象的情况下，这些安全属性可以得到建立和维护。
>
> 这些结构特性源于对访问现有对象的两个规则的控制：
>
> 1. 只有当对象 A 持有对 B 的引用时，对象 A 才能向 B 发送消息。
> 2. 只有当对象 A 收到包含对 C 的引用的消息时，对象 A 才能获得对 C 的引用。由于这两个规则的存在，对象只能通过预先存在的引用链获得对另一个对象的引用。简而言之，"只有连接性能够产生连接性"。

有关对象能力的介绍，请参阅[维基百科文章](https://en.wikipedia.org/wiki/Object-capability_model)。

## 实践中的对象能力

这个想法是只透露完成工作所必需的内容。

例如，下面的代码片段违反了对象能力原则：

```go
type AppAccount struct {...}
account := &AppAccount{
    Address: pub.Address(),
    Coins: sdk.Coins{sdk.NewInt64Coin("ATM", 100)},
}
sumValue := externalModule.ComputeSumValue(account)
```

`ComputeSumValue` 方法暗示了一个纯函数，但接受指针值的能力却是修改该值的能力。首选的方法签名应该采用复制而不是引用。

```go
sumValue := externalModule.ComputeSumValue(*account)
```

在 Cosmos SDK 中，您可以在 simapp 中看到此原则的应用。

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L294-L318
```

下图显示了当前 keeper 之间的依赖关系。

![Keeper 依赖关系](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/keeper_dependencies.svg)




# Object-Capability Model

## Intro

When thinking about security, it is good to start with a specific threat model. Our threat model is the following:

> We assume that a thriving ecosystem of Cosmos SDK modules that are easy to compose into a blockchain application will contain faulty or malicious modules.

The Cosmos SDK is designed to address this threat by being the
foundation of an object capability system.

> The structural properties of object capability systems favor
> modularity in code design and ensure reliable encapsulation in
> code implementation.
>
> These structural properties facilitate the analysis of some
> security properties of an object-capability program or operating
> system. Some of these — in particular, information flow properties
> — can be analyzed at the level of object references and
> connectivity, independent of any knowledge or analysis of the code
> that determines the behavior of the objects.
>
> As a consequence, these security properties can be established
> and maintained in the presence of new objects that contain unknown
> and possibly malicious code.
>
> These structural properties stem from the two rules governing
> access to existing objects:
>
> 1. An object A can send a message to B only if object A holds a
>     reference to B.
> 2. An object A can obtain a reference to C only
>     if object A receives a message containing a reference to C. As a
>     consequence of these two rules, an object can obtain a reference
>     to another object only through a preexisting chain of references.
>     In short, "Only connectivity begets connectivity."

For an introduction to object-capabilities, see this [Wikipedia article](https://en.wikipedia.org/wiki/Object-capability_model).

## Ocaps in practice

The idea is to only reveal what is necessary to get the work done.

For example, the following code snippet violates the object capabilities
principle:

```go
type AppAccount struct {...}
account := &AppAccount{
    Address: pub.Address(),
    Coins: sdk.Coins{sdk.NewInt64Coin("ATM", 100)},
}
sumValue := externalModule.ComputeSumValue(account)
```

The method `ComputeSumValue` implies a pure function, yet the implied
capability of accepting a pointer value is the capability to modify that
value. The preferred method signature should take a copy instead.

```go
sumValue := externalModule.ComputeSumValue(*account)
```

In the Cosmos SDK, you can see the application of this principle in simapp.

```go reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/simapp/app.go#L294-L318
```

The following diagram shows the current dependencies between keepers.

![Keeper dependencies](https://raw.githubusercontent.com/cosmos/cosmos-sdk/release/v0.46.x/docs/uml/svg/keeper_dependencies.svg)

