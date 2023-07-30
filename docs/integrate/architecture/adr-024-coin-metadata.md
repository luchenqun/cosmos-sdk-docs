# ADR 024: 币种元数据

## 变更日志

* 05/19/2020: 初始草稿

## 状态

建议中

## 背景

Cosmos SDK 中的资产通过 `Coins` 类型表示，该类型由 `amount` 和 `denom` 组成，其中 `amount` 可以是任意大或小的值。此外，Cosmos SDK 使用基于账户的模型，其中有两种主要账户类型 -- 基本账户和模块账户。所有账户类型都有一组由 `Coins` 组成的余额。`x/bank` 模块跟踪所有账户的余额，并且还跟踪应用程序中余额的总供应量。

对于余额 `amount`，Cosmos SDK 假设存在一个静态和固定的计量单位，而不考虑计量单位本身。换句话说，构建在 Cosmos SDK 基础链上的客户端和应用程序可以选择定义和使用任意计量单位以提供更丰富的用户体验，然而，当交易或操作到达 Cosmos SDK 状态机时，`amount` 被视为单个单位。例如，对于 Cosmos Hub（Gaia），客户端假设 1 ATOM = 10^6 uatom，因此 Cosmos SDK 中的所有交易和操作都使用 10^6 的单位。

这显然会导致用户体验差和受限，特别是随着网络互操作性的增加以及资产类型的总量增加。我们建议 `x/bank` 还应该跟踪每个 `denom` 的元数据，以帮助客户端、钱包提供者和浏览器改善用户体验，并消除对计量单位的任何假设要求。

## 决策

`x/bank` 模块将被更新以按 `denom` 存储和索引元数据，具体是指 "base" 或最小单位 -- Cosmos SDK 状态机所使用的单位。

元数据还可以包括一个非零长度的计量单位列表。每个条目包含计量单位 `denom` 的名称、指数和别名列表。一个条目应被解释为 `1 denom = 10^exponent base_denom`（例如 `1 ETH = 10^18 wei` 和 `1 uatom = 10^0 uatom`）。

有两个对客户端非常重要的单位：`base`，它是最小的可能单位；`display`，它是在人类交流和交易所中常用的单位。这些字段中的值链接到单位列表中的一个条目。

`denom_units`列表和`display`条目可以通过治理进行更改。

因此，我们可以定义类型如下：

```protobuf
message DenomUnit {
  string denom    = 1;
  uint32 exponent = 2;  
  repeated string aliases = 3;
}

message Metadata {
  string description = 1;
  repeated DenomUnit denom_units = 2;
  string base = 3;
  string display = 4;
}
```

例如，ATOM的元数据可以定义如下：

```json
{
  "name": "atom",
  "description": "The native staking token of the Cosmos Hub.",
  "denom_units": [
    {
      "denom": "uatom",
      "exponent": 0,
      "aliases": [
        "microatom"
      ],
    },
    {
      "denom": "matom",
      "exponent": 3,
      "aliases": [
        "milliatom"
      ]
    },
    {
      "denom": "atom",
      "exponent": 6,
    }
  ],
  "base": "uatom",
  "display": "atom",
}
```

根据上述元数据，客户端可以推断出以下内容：

* 4.3atom = 4.3 * (10^6) = 4,300,000uatom
* 字符串"atom"可以在代币列表中用作显示名称。
* 余额4300000可以显示为4,300,000uatom或4,300matom或4.3atom。
  如果客户端的作者没有明确选择其他表示形式，`display`单位4.3atom是一个很好的默认值。

客户端应该能够通过CLI和REST接口查询denom的元数据。此外，我们将在这些接口中添加处理程序，以便在基础框架的基础上将任何单位转换为另一个单位。

最后，我们需要确保`x/bank`模块的`GenesisState`中存在与基本`denom`索引相关的元数据。

```go
type GenesisState struct {
  SendEnabled   bool        `json:"send_enabled" yaml:"send_enabled"`
  Balances      []Balance   `json:"balances" yaml:"balances"`
  Supply        sdk.Coins   `json:"supply" yaml:"supply"`
  DenomMetadata []Metadata  `json:"denom_metadata" yaml:"denom_metadata"`
}
```

## 未来工作

为了使客户端避免手动或通过端点将资产转换为基本单位，我们可以考虑支持自动转换给定的单位输入。

## 影响

### 积极影响

* 为客户端、钱包提供商和区块浏览器提供有关资产单位的附加数据，以改善用户体验，并消除对单位的任何假设。

### 负面影响

* `x/bank`模块中需要一小部分额外的存储空间。额外的存储空间应该很小，因为总资产的数量不应该很大。

### 中性影响

## 参考资料


# ADR 024: Coin Metadata

## Changelog

* 05/19/2020: Initial draft

## Status

Proposed

## Context

Assets in the Cosmos SDK are represented via a `Coins` type that consists of an `amount` and a `denom`,
where the `amount` can be any arbitrarily large or small value. In addition, the Cosmos SDK uses an
account-based model where there are two types of primary accounts -- basic accounts and module accounts.
All account types have a set of balances that are composed of `Coins`. The `x/bank` module keeps
track of all balances for all accounts and also keeps track of the total supply of balances in an
application.

With regards to a balance `amount`, the Cosmos SDK assumes a static and fixed unit of denomination,
regardless of the denomination itself. In other words, clients and apps built atop a Cosmos-SDK-based
chain may choose to define and use arbitrary units of denomination to provide a richer UX, however, by
the time a tx or operation reaches the Cosmos SDK state machine, the `amount` is treated as a single
unit. For example, for the Cosmos Hub (Gaia), clients assume 1 ATOM = 10^6 uatom, and so all txs and
operations in the Cosmos SDK work off of units of 10^6.

This clearly provides a poor and limited UX especially as interoperability of networks increases and
as a result the total amount of asset types increases. We propose to have `x/bank` additionally keep
track of metadata per `denom` in order to help clients, wallet providers, and explorers improve their
UX and remove the requirement for making any assumptions on the unit of denomination.

## Decision

The `x/bank` module will be updated to store and index metadata by `denom`, specifically the "base" or
smallest unit -- the unit the Cosmos SDK state-machine works with.

Metadata may also include a non-zero length list of denominations. Each entry contains the name of
the denomination `denom`, the exponent to the base and a list of aliases. An entry is to be
interpreted as `1 denom = 10^exponent base_denom` (e.g. `1 ETH = 10^18 wei` and `1 uatom = 10^0 uatom`).

There are two denominations that are of high importance for clients: the `base`, which is the smallest
possible unit and the `display`, which is the unit that is commonly referred to in human communication
and on exchanges. The values in those fields link to an entry in the list of denominations.

The list in `denom_units` and the `display` entry may be changed via governance.

As a result, we can define the type as follows:

```protobuf
message DenomUnit {
  string denom    = 1;
  uint32 exponent = 2;  
  repeated string aliases = 3;
}

message Metadata {
  string description = 1;
  repeated DenomUnit denom_units = 2;
  string base = 3;
  string display = 4;
}
```

As an example, the ATOM's metadata can be defined as follows:

```json
{
  "name": "atom",
  "description": "The native staking token of the Cosmos Hub.",
  "denom_units": [
    {
      "denom": "uatom",
      "exponent": 0,
      "aliases": [
        "microatom"
      ],
    },
    {
      "denom": "matom",
      "exponent": 3,
      "aliases": [
        "milliatom"
      ]
    },
    {
      "denom": "atom",
      "exponent": 6,
    }
  ],
  "base": "uatom",
  "display": "atom",
}
```

Given the above metadata, a client may infer the following things:

* 4.3atom = 4.3 * (10^6) = 4,300,000uatom
* The string "atom" can be used as a display name in a list of tokens.
* The balance 4300000 can be displayed as 4,300,000uatom or 4,300matom or 4.3atom.
  The `display` denomination 4.3atom is a good default if the authors of the client don't make
  an explicit decision to choose a different representation.

A client should be able to query for metadata by denom both via the CLI and REST interfaces. In
addition, we will add handlers to these interfaces to convert from any unit to another given unit,
as the base framework for this already exists in the Cosmos SDK.

Finally, we need to ensure metadata exists in the `GenesisState` of the `x/bank` module which is also
indexed by the base `denom`.

```go
type GenesisState struct {
  SendEnabled   bool        `json:"send_enabled" yaml:"send_enabled"`
  Balances      []Balance   `json:"balances" yaml:"balances"`
  Supply        sdk.Coins   `json:"supply" yaml:"supply"`
  DenomMetadata []Metadata  `json:"denom_metadata" yaml:"denom_metadata"`
}
```

## Future Work

In order for clients to avoid having to convert assets to the base denomination -- either manually or
via an endpoint, we may consider supporting automatic conversion of a given unit input.

## Consequences

### Positive

* Provides clients, wallet providers and block explorers with additional data on
  asset denomination to improve UX and remove any need to make assumptions on
  denomination units.

### Negative

* A small amount of required additional storage in the `x/bank` module. The amount
  of additional storage should be minimal as the amount of total assets should not
  be large.

### Neutral

## References
