# `x/upgrade`

## 摘要

`x/upgrade` 是一个 Cosmos SDK 模块的实现，用于平滑地将活跃的 Cosmos 链升级到新的（有破坏性的）软件版本。它通过提供一个 `BeginBlocker` 钩子来实现，在达到预定义的升级区块高度后，阻止区块链状态机继续运行。

该模块不规定关于治理如何进行升级的任何事项，只提供了安全协调升级的机制。如果没有软件支持，升级活跃链是有风险的，因为所有验证者都需要在过程中的同一点暂停其状态机。如果这个过程没有正确执行，可能会导致难以恢复的状态不一致。

* [概念](#概念)
* [状态](#状态)
* [事件](#事件)
* [客户端](#客户端)
  * [命令行界面（CLI）](#命令行界面-cli)
  * [REST](#rest)
  * [gRPC](#grpc)
* [资源](#资源)

## 概念

### 计划

`x/upgrade` 模块定义了一个 `Plan` 类型，用于安排活跃链的升级。`Plan` 可以在特定的区块高度上安排。一旦达成一致意见，即冻结的候选发布版本与相应的升级 `Handler`（见下文）一起，就会创建一个 `Plan`，其中 `Plan` 的 `Name` 对应于特定的 `Handler`。通常，`Plan` 是通过治理提案流程创建的，如果投票通过，将被安排。`Plan` 的 `Info` 可以包含有关升级的各种元数据，通常是特定应用程序的升级信息，可以包含在链上，例如验证者可以自动升级到的 git 提交。

#### 辅助进程

如果运行应用程序二进制文件的操作员还运行一个辅助进程来协助二进制文件的自动下载和升级，`Info` 允许此过程无缝进行。这个工具是 [Cosmovisor](https://github.com/cosmos/cosmos-sdk/tree/main/tools/cosmovisor#readme)。

```go
type Plan struct {
  Name   string
  Height int64
  Info   string
}
```

### 处理器

`x/upgrade` 模块支持从主版本 X 升级到主版本 Y。为了实现这一点，节点操作员必须首先将当前的二进制文件升级到具有新版本 Y 的相应 `Handler` 的新二进制文件。假设这个版本已经经过了全面的测试并得到了社区的批准。这个 `Handler` 定义了在新的二进制文件 Y 成功运行链之前需要进行的状态迁移。当然，这个 `Handler` 是特定于应用程序的，而不是按模块定义的。在应用程序中，通过 `Keeper#SetUpgradeHandler` 来注册一个 `Handler`。

```go
type UpgradeHandler func(Context, Plan, VersionMap) (VersionMap, error)
```

在每次`EndBlock`执行期间，`x/upgrade`模块会检查是否存在应该执行的`Plan`（在该高度上计划执行）。如果是这样，将执行相应的`Handler`。如果预计应该执行`Plan`但没有注册`Handler`，或者如果二进制文件升级得太早，节点将优雅地发生恐慌并退出。

### StoreLoader

`x/upgrade`模块还作为升级的一部分促进存储迁移。`StoreLoader`设置了在新的二进制文件能够成功运行链之前需要进行的迁移。这个`StoreLoader`也是应用程序特定的，而不是在每个模块上定义的。通过应用程序中的`app#SetStoreLoader`来注册这个`StoreLoader`。

```go
func UpgradeStoreLoader (upgradeHeight int64, storeUpgrades *store.StoreUpgrades) baseapp.StoreLoader
```

如果有计划的升级并且达到了升级高度，旧的二进制文件在发生恐慌之前将`Plan`写入磁盘。

这些信息对于确保`StoreUpgrades`在正确的高度和预期的升级时顺利进行非常重要。它消除了新的二进制文件在每次重新启动时多次执行`StoreUpgrades`的机会。此外，如果在同一高度上计划了多个升级，`Name`将确保这些`StoreUpgrades`只在计划的升级处理程序中进行。

### Proposal

通常，通过治理提议和包含`MsgSoftwareUpgrade`消息的提议来提出和提交`Plan`。此提议遵循标准的治理流程。如果提议通过，将持久化并计划执行针对特定`Handler`的`Plan`。可以通过在新的提议中更新`Plan.Height`来延迟或加快升级。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/upgrade/v1beta1/tx.proto#L29-L41
```

#### 取消升级提议

可以取消升级提议。存在一个启用了治理的`MsgCancelUpgrade`消息类型，可以嵌入到提议中进行投票，并且如果通过，将删除计划的升级`Plan`。当然，这要求在升级本身之前就已经知道升级是个坏主意，以便为投票留出时间。

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/upgrade/v1beta1/tx.proto#L48-L57
```

如果需要这样的可能性，升级高度将从升级提案开始的时间算起，为`2 * (VotingPeriod + DepositPeriod) + (SafetyDelta)`。`SafetyDelta`是从升级提案成功到认识到这是个坏主意（由于外部社会共识）的时间。

在原始的`MsgSoftwareUpgrade`提案仍在投票中时，也可以提出`MsgCancelUpgrade`提案，只要`VotingPeriod`在`MsgSoftwareUpgrade`提案之后结束。

## 状态

`x/upgrade`模块的内部状态相对较少且简单。状态包含当前活动的升级`Plan`（如果存在）的键为`0x0`，以及如果`Plan`标记为“完成”的键为`0x1`。状态包含应用程序中所有模块的共识版本。版本以大端序的`uint64`形式存储，并且可以通过附加相应模块名称的前缀`0x2`访问。状态维护一个可以通过键`0x3`访问的`Protocol Version`。

* Plan: `0x0 -> Plan`
* Done: `0x1 | byte(plan name)  -> BigEndian(Block Height)`
* ConsensusVersion: `0x2 | byte(module name)  -> BigEndian(Module Consensus Version)`
* ProtocolVersion: `0x3 -> BigEndian(Protocol Version)`

`x/upgrade`模块不包含创世状态。

## 事件

`x/upgrade`模块本身不会发出任何事件。所有与提案相关的事件都是通过`x/gov`模块发出的。

## 客户端

### CLI

用户可以使用CLI查询和与`upgrade`模块交互。

#### 查询

`query`命令允许用户查询`upgrade`状态。

```bash
simd query upgrade --help
```

##### applied

`applied`命令允许用户查询已应用完成升级的高度的区块头。

```bash
simd query upgrade applied [upgrade-name] [flags]
```

如果在链上先前执行了`upgrade-name`，则返回应用该升级的区块的区块头。这有助于客户端确定在给定的一系列区块上哪个二进制文件是有效的，以及更多上下文来理解过去的迁移。

##### 模块版本

`module_versions` 命令获取模块名称及其对应的共识版本的列表。

在命令后跟上特定的模块名称将只返回该模块的信息。

```bash
simd query upgrade module_versions [可选的模块名称] [标志]
```

示例：

```bash
simd query upgrade module_versions
```

示例输出：

```bash
module_versions:
- name: auth
  version: "2"
- name: authz
  version: "1"
- name: bank
  version: "2"
- name: crisis
  version: "1"
- name: distribution
  version: "2"
- name: evidence
  version: "1"
- name: feegrant
  version: "1"
- name: genutil
  version: "1"
- name: gov
  version: "2"
- name: ibc
  version: "2"
- name: mint
  version: "1"
- name: params
  version: "1"
- name: slashing
  version: "2"
- name: staking
  version: "2"
- name: transfer
  version: "1"
- name: upgrade
  version: "1"
- name: vesting
  version: "1"
```

示例：

```bash
regen query upgrade module_versions ibc
```

示例输出：

```bash
module_versions:
- name: ibc
  version: "2"
```

##### 计划

`plan` 命令获取当前计划的升级计划（如果存在）。

```bash
regen query upgrade plan [标志]
```

示例：

```bash
simd query upgrade plan
```

示例输出：

```bash
height: "130"
info: ""
name: test-upgrade
time: "0001-01-01T00:00:00Z"
upgraded_client_state: null
```

#### 交易

升级模块支持以下交易：

* `software-proposal` - 提交升级提案：

```bash
simd tx upgrade software-upgrade v2 --title="Test Proposal" --summary="testing" --deposit="100000000stake" --upgrade-height 1000000 \
--upgrade-info '{ "binaries": { "linux/amd64":"https://example.com/simd.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f" } }' --from cosmos1..
```

* `cancel-software-upgrade` - 取消先前提交的升级提案：

```bash
simd tx upgrade cancel-software-upgrade --title="Test Proposal" --summary="testing" --deposit="100000000stake" --from cosmos1..
```

### REST

用户可以使用 REST 端点查询 `upgrade` 模块。

#### 已应用计划

`AppliedPlan` 根据名称查询先前应用的升级计划。

```bash
/cosmos/upgrade/v1beta1/applied_plan/{name}
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/upgrade/v1beta1/applied_plan/v2.0-upgrade" -H "accept: application/json"
```

示例输出：

```bash
{
  "height": "30"
}
```

#### 当前计划

`CurrentPlan` 查询当前的升级计划。

```bash
/cosmos/upgrade/v1beta1/current_plan
```

#### 模块版本

`ModuleVersions` 从状态中查询模块版本列表。

```bash
/cosmos/upgrade/v1beta1/module_versions
```

示例：

```bash
curl -X GET "http://localhost:1317/cosmos/upgrade/v1beta1/module_versions" -H "accept: application/json"
```

示例输出：

```bash
{
  "module_versions": [
    {
      "name": "auth",
      "version": "2"
    },
    {
      "name": "authz",
      "version": "1"
    },
    {
      "name": "bank",
      "version": "2"
    },
    {
      "name": "crisis",
      "version": "1"
    },
    {
      "name": "distribution",
      "version": "2"
    },
    {
      "name": "evidence",
      "version": "1"
    },
    {
      "name": "feegrant",
      "version": "1"
    },
    {
      "name": "genutil",
      "version": "1"
    },
    {
      "name": "gov",
      "version": "2"
    },
    {
      "name": "ibc",
      "version": "2"
    },
    {
      "name": "mint",
      "version": "1"
    },
    {
      "name": "params",
      "version": "1"
    },
    {
      "name": "slashing",
      "version": "2"
    },
    {
      "name": "staking",
      "version": "2"
    },
    {
      "name": "transfer",
      "version": "1"
    },
    {
      "name": "upgrade",
      "version": "1"
    },
    {
      "name": "vesting",
      "version": "1"
    }
  ]
}
```

### gRPC

用户可以使用 gRPC 端点查询 `upgrade` 模块。

#### 已应用计划

`AppliedPlan` 根据计划名称查询先前应用的升级计划。

```bash
cosmos.upgrade.v1beta1.Query/AppliedPlan
```

示例：

```bash
grpcurl -plaintext \
    -d '{"name":"v2.0-upgrade"}' \
    localhost:9090 \
    cosmos.upgrade.v1beta1.Query/AppliedPlan
```

示例输出：

```bash
{
  "height": "30"
}
```

#### 当前计划

`CurrentPlan` 查询当前的升级计划。

```bash
cosmos.upgrade.v1beta1.Query/CurrentPlan
```

示例：

```bash
grpcurl -plaintext localhost:9090 cosmos.slashing.v1beta1.Query/CurrentPlan
```

示例输出：

```bash
{
  "plan": "v2.1-upgrade"
}
```

#### 模块版本

`ModuleVersions` 从状态中查询模块版本列表。

```bash
cosmos.upgrade.v1beta1.Query/ModuleVersions
```

示例：

```bash
grpcurl -plaintext localhost:9090 cosmos.slashing.v1beta1.Query/ModuleVersions
```

示例输出：

```bash
{
  "module_versions": [
    {
      "name": "auth",
      "version": "2"
    },
    {
      "name": "authz",
      "version": "1"
    },
    {
      "name": "bank",
      "version": "2"
    },
    {
      "name": "crisis",
      "version": "1"
    },
    {
      "name": "distribution",
      "version": "2"
    },
    {
      "name": "evidence",
      "version": "1"
    },
    {
      "name": "feegrant",
      "version": "1"
    },
    {
      "name": "genutil",
      "version": "1"
    },
    {
      "name": "gov",
      "version": "2"
    },
    {
      "name": "ibc",
      "version": "2"
    },
    {
      "name": "mint",
      "version": "1"
    },
    {
      "name": "params",
      "version": "1"
    },
    {
      "name": "slashing",
      "version": "2"
    },
    {
      "name": "staking",
      "version": "2"
    },
    {
      "name": "transfer",
      "version": "1"
    },
    {
      "name": "upgrade",
      "version": "1"
    },
    {
      "name": "vesting",
      "version": "1"
    }
  ]
}
```

## 资源

有关 `x/upgrade` 模块的更多（外部）资源列表。

* [Cosmos Dev 系列：Cosmos 区块链升级](https://medium.com/web3-surfers/cosmos-dev-series-cosmos-sdk-based-blockchain-upgrade-b5e99181554c) - 解释了软件升级的详细工作原理的博文。




# `x/upgrade`

## Abstract

`x/upgrade` is an implementation of a Cosmos SDK module that facilitates smoothly
upgrading a live Cosmos chain to a new (breaking) software version. It accomplishes this by
providing a `BeginBlocker` hook that prevents the blockchain state machine from
proceeding once a pre-defined upgrade block height has been reached.

The module does not prescribe anything regarding how governance decides to do an
upgrade, but just the mechanism for coordinating the upgrade safely. Without software
support for upgrades, upgrading a live chain is risky because all of the validators
need to pause their state machines at exactly the same point in the process. If
this is not done correctly, there can be state inconsistencies which are hard to
recover from.

* [Concepts](#concepts)
* [State](#state)
* [Events](#events)
* [Client](#client)
  * [CLI](#cli)
  * [REST](#rest)
  * [gRPC](#grpc)
* [Resources](#resources)

## Concepts

### Plan

The `x/upgrade` module defines a `Plan` type in which a live upgrade is scheduled
to occur. A `Plan` can be scheduled at a specific block height.
A `Plan` is created once a (frozen) release candidate along with an appropriate upgrade
`Handler` (see below) is agreed upon, where the `Name` of a `Plan` corresponds to a
specific `Handler`. Typically, a `Plan` is created through a governance proposal
process, where if voted upon and passed, will be scheduled. The `Info` of a `Plan`
may contain various metadata about the upgrade, typically application specific
upgrade info to be included on-chain such as a git commit that validators could
automatically upgrade to.

#### Sidecar Process

If an operator running the application binary also runs a sidecar process to assist
in the automatic download and upgrade of a binary, the `Info` allows this process to
be seamless. This tool is [Cosmovisor](https://github.com/cosmos/cosmos-sdk/tree/main/tools/cosmovisor#readme).

```go
type Plan struct {
  Name   string
  Height int64
  Info   string
}
```

### Handler

The `x/upgrade` module facilitates upgrading from major version X to major version Y. To
accomplish this, node operators must first upgrade their current binary to a new
binary that has a corresponding `Handler` for the new version Y. It is assumed that
this version has fully been tested and approved by the community at large. This
`Handler` defines what state migrations need to occur before the new binary Y
can successfully run the chain. Naturally, this `Handler` is application specific
and not defined on a per-module basis. Registering a `Handler` is done via
`Keeper#SetUpgradeHandler` in the application.

```go
type UpgradeHandler func(Context, Plan, VersionMap) (VersionMap, error)
```

During each `EndBlock` execution, the `x/upgrade` module checks if there exists a
`Plan` that should execute (is scheduled at that height). If so, the corresponding
`Handler` is executed. If the `Plan` is expected to execute but no `Handler` is registered
or if the binary was upgraded too early, the node will gracefully panic and exit.

### StoreLoader

The `x/upgrade` module also facilitates store migrations as part of the upgrade. The
`StoreLoader` sets the migrations that need to occur before the new binary can
successfully run the chain. This `StoreLoader` is also application specific and
not defined on a per-module basis. Registering this `StoreLoader` is done via
`app#SetStoreLoader` in the application.

```go
func UpgradeStoreLoader (upgradeHeight int64, storeUpgrades *store.StoreUpgrades) baseapp.StoreLoader
```

If there's a planned upgrade and the upgrade height is reached, the old binary writes `Plan` to the disk before panicking.

This information is critical to ensure the `StoreUpgrades` happens smoothly at correct height and
expected upgrade. It eliminiates the chances for the new binary to execute `StoreUpgrades` multiple
times everytime on restart. Also if there are multiple upgrades planned on same height, the `Name`
will ensure these `StoreUpgrades` takes place only in planned upgrade handler.

### Proposal

Typically, a `Plan` is proposed and submitted through governance via a proposal
containing a `MsgSoftwareUpgrade` message.
This proposal prescribes to the standard governance process. If the proposal passes,
the `Plan`, which targets a specific `Handler`, is persisted and scheduled. The
upgrade can be delayed or hastened by updating the `Plan.Height` in a new proposal.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/upgrade/v1beta1/tx.proto#L29-L41
```

#### Cancelling Upgrade Proposals

Upgrade proposals can be cancelled. There exists a gov-enabled `MsgCancelUpgrade`
message type, which can be embedded in a proposal, voted on and, if passed, will
remove the scheduled upgrade `Plan`.
Of course this requires that the upgrade was known to be a bad idea well before the
upgrade itself, to allow time for a vote.

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/upgrade/v1beta1/tx.proto#L48-L57
```

If such a possibility is desired, the upgrade height is to be
`2 * (VotingPeriod + DepositPeriod) + (SafetyDelta)` from the beginning of the
upgrade proposal. The `SafetyDelta` is the time available from the success of an
upgrade proposal and the realization it was a bad idea (due to external social consensus).

A `MsgCancelUpgrade` proposal can also be made while the original
`MsgSoftwareUpgrade` proposal is still being voted upon, as long as the `VotingPeriod`
ends after the `MsgSoftwareUpgrade` proposal.

## State

The internal state of the `x/upgrade` module is relatively minimal and simple. The
state contains the currently active upgrade `Plan` (if one exists) by key
`0x0` and if a `Plan` is marked as "done" by key `0x1`. The state
contains the consensus versions of all app modules in the application. The versions
are stored as big endian `uint64`, and can be accessed with prefix `0x2` appended
by the corresponding module name of type `string`. The state maintains a
`Protocol Version` which can be accessed by key `0x3`.

* Plan: `0x0 -> Plan`
* Done: `0x1 | byte(plan name)  -> BigEndian(Block Height)`
* ConsensusVersion: `0x2 | byte(module name)  -> BigEndian(Module Consensus Version)`
* ProtocolVersion: `0x3 -> BigEndian(Protocol Version)`

The `x/upgrade` module contains no genesis state.

## Events

The `x/upgrade` does not emit any events by itself. Any and all proposal related
events are emitted through the `x/gov` module.

## Client

### CLI

A user can query and interact with the `upgrade` module using the CLI.

#### Query

The `query` commands allow users to query `upgrade` state.

```bash
simd query upgrade --help
```

##### applied

The `applied` command allows users to query the block header for height at which a completed upgrade was applied.

```bash
simd query upgrade applied [upgrade-name] [flags]
```

If upgrade-name was previously executed on the chain, this returns the header for the block at which it was applied.
This helps a client determine which binary was valid over a given range of blocks, as well as more context to understand past migrations.

Example:

```bash
simd query upgrade applied "test-upgrade"
```

Example Output:

```bash
"block_id": {
    "hash": "A769136351786B9034A5F196DC53F7E50FCEB53B48FA0786E1BFC45A0BB646B5",
    "parts": {
      "total": 1,
      "hash": "B13CBD23011C7480E6F11BE4594EE316548648E6A666B3575409F8F16EC6939E"
    }
  },
  "block_size": "7213",
  "header": {
    "version": {
      "block": "11"
    },
    "chain_id": "testnet-2",
    "height": "455200",
    "time": "2021-04-10T04:37:57.085493838Z",
    "last_block_id": {
      "hash": "0E8AD9309C2DC411DF98217AF59E044A0E1CCEAE7C0338417A70338DF50F4783",
      "parts": {
        "total": 1,
        "hash": "8FE572A48CD10BC2CBB02653CA04CA247A0F6830FF19DC972F64D339A355E77D"
      }
    },
    "last_commit_hash": "DE890239416A19E6164C2076B837CC1D7F7822FC214F305616725F11D2533140",
    "data_hash": "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
    "validators_hash": "A31047ADE54AE9072EE2A12FF260A8990BA4C39F903EAF5636B50D58DBA72582",
    "next_validators_hash": "A31047ADE54AE9072EE2A12FF260A8990BA4C39F903EAF5636B50D58DBA72582",
    "consensus_hash": "048091BC7DDC283F77BFBF91D73C44DA58C3DF8A9CBC867405D8B7F3DAADA22F",
    "app_hash": "28ECC486AFC332BA6CC976706DBDE87E7D32441375E3F10FD084CD4BAF0DA021",
    "last_results_hash": "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
    "evidence_hash": "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
    "proposer_address": "2ABC4854B1A1C5AA8403C4EA853A81ACA901CC76"
  },
  "num_txs": "0"
}
```

##### module versions

The `module_versions` command gets a list of module names and their respective consensus versions.

Following the command with a specific module name will return only
that module's information.

```bash
simd query upgrade module_versions [optional module_name] [flags]
```

Example:

```bash
simd query upgrade module_versions
```

Example Output:

```bash
module_versions:
- name: auth
  version: "2"
- name: authz
  version: "1"
- name: bank
  version: "2"
- name: crisis
  version: "1"
- name: distribution
  version: "2"
- name: evidence
  version: "1"
- name: feegrant
  version: "1"
- name: genutil
  version: "1"
- name: gov
  version: "2"
- name: ibc
  version: "2"
- name: mint
  version: "1"
- name: params
  version: "1"
- name: slashing
  version: "2"
- name: staking
  version: "2"
- name: transfer
  version: "1"
- name: upgrade
  version: "1"
- name: vesting
  version: "1"
```

Example:

```bash
regen query upgrade module_versions ibc
```

Example Output:

```bash
module_versions:
- name: ibc
  version: "2"
```

##### plan

The `plan` command gets the currently scheduled upgrade plan, if one exists.

```bash
regen query upgrade plan [flags]
```

Example:

```bash
simd query upgrade plan
```

Example Output:

```bash
height: "130"
info: ""
name: test-upgrade
time: "0001-01-01T00:00:00Z"
upgraded_client_state: null
```

#### Transactions

The upgrade module supports the following transactions:

* `software-proposal` - submits an upgrade proposal:

```bash
simd tx upgrade software-upgrade v2 --title="Test Proposal" --summary="testing" --deposit="100000000stake" --upgrade-height 1000000 \
--upgrade-info '{ "binaries": { "linux/amd64":"https://example.com/simd.zip?checksum=sha256:aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f" } }' --from cosmos1..
```

* `cancel-software-upgrade` - cancels a previously submitted upgrade proposal:

```bash
simd tx upgrade cancel-software-upgrade --title="Test Proposal" --summary="testing" --deposit="100000000stake" --from cosmos1..
```

### REST

A user can query the `upgrade` module using REST endpoints.

#### Applied Plan

`AppliedPlan` queries a previously applied upgrade plan by its name.

```bash
/cosmos/upgrade/v1beta1/applied_plan/{name}
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/upgrade/v1beta1/applied_plan/v2.0-upgrade" -H "accept: application/json"
```

Example Output:

```bash
{
  "height": "30"
}
```

#### Current Plan

`CurrentPlan` queries the current upgrade plan.

```bash
/cosmos/upgrade/v1beta1/current_plan
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/upgrade/v1beta1/current_plan" -H "accept: application/json"
```

Example Output:

```bash
{
  "plan": "v2.1-upgrade"
}
```

#### Module versions

`ModuleVersions` queries the list of module versions from state.

```bash
/cosmos/upgrade/v1beta1/module_versions
```

Example:

```bash
curl -X GET "http://localhost:1317/cosmos/upgrade/v1beta1/module_versions" -H "accept: application/json"
```

Example Output:

```bash
{
  "module_versions": [
    {
      "name": "auth",
      "version": "2"
    },
    {
      "name": "authz",
      "version": "1"
    },
    {
      "name": "bank",
      "version": "2"
    },
    {
      "name": "crisis",
      "version": "1"
    },
    {
      "name": "distribution",
      "version": "2"
    },
    {
      "name": "evidence",
      "version": "1"
    },
    {
      "name": "feegrant",
      "version": "1"
    },
    {
      "name": "genutil",
      "version": "1"
    },
    {
      "name": "gov",
      "version": "2"
    },
    {
      "name": "ibc",
      "version": "2"
    },
    {
      "name": "mint",
      "version": "1"
    },
    {
      "name": "params",
      "version": "1"
    },
    {
      "name": "slashing",
      "version": "2"
    },
    {
      "name": "staking",
      "version": "2"
    },
    {
      "name": "transfer",
      "version": "1"
    },
    {
      "name": "upgrade",
      "version": "1"
    },
    {
      "name": "vesting",
      "version": "1"
    }
  ]
}
```

### gRPC

A user can query the `upgrade` module using gRPC endpoints.

#### Applied Plan

`AppliedPlan` queries a previously applied upgrade plan by its name.

```bash
cosmos.upgrade.v1beta1.Query/AppliedPlan
```

Example:

```bash
grpcurl -plaintext \
    -d '{"name":"v2.0-upgrade"}' \
    localhost:9090 \
    cosmos.upgrade.v1beta1.Query/AppliedPlan
```

Example Output:

```bash
{
  "height": "30"
}
```

#### Current Plan

`CurrentPlan` queries the current upgrade plan.

```bash
cosmos.upgrade.v1beta1.Query/CurrentPlan
```

Example:

```bash
grpcurl -plaintext localhost:9090 cosmos.slashing.v1beta1.Query/CurrentPlan
```

Example Output:

```bash
{
  "plan": "v2.1-upgrade"
}
```

#### Module versions

`ModuleVersions` queries the list of module versions from state.

```bash
cosmos.upgrade.v1beta1.Query/ModuleVersions
```

Example:

```bash
grpcurl -plaintext localhost:9090 cosmos.slashing.v1beta1.Query/ModuleVersions
```

Example Output:

```bash
{
  "module_versions": [
    {
      "name": "auth",
      "version": "2"
    },
    {
      "name": "authz",
      "version": "1"
    },
    {
      "name": "bank",
      "version": "2"
    },
    {
      "name": "crisis",
      "version": "1"
    },
    {
      "name": "distribution",
      "version": "2"
    },
    {
      "name": "evidence",
      "version": "1"
    },
    {
      "name": "feegrant",
      "version": "1"
    },
    {
      "name": "genutil",
      "version": "1"
    },
    {
      "name": "gov",
      "version": "2"
    },
    {
      "name": "ibc",
      "version": "2"
    },
    {
      "name": "mint",
      "version": "1"
    },
    {
      "name": "params",
      "version": "1"
    },
    {
      "name": "slashing",
      "version": "2"
    },
    {
      "name": "staking",
      "version": "2"
    },
    {
      "name": "transfer",
      "version": "1"
    },
    {
      "name": "upgrade",
      "version": "1"
    },
    {
      "name": "vesting",
      "version": "1"
    }
  ]
}
```

## Resources

A list of (external) resources to learn more about the `x/upgrade` module.

* [Cosmos Dev Series: Cosmos Blockchain Upgrade](https://medium.com/web3-surfers/cosmos-dev-series-cosmos-sdk-based-blockchain-upgrade-b5e99181554c) - The blog post that explains how software upgrades work in detail.
