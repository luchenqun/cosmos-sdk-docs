# `x/slashing`

## 摘要

本节规定了 Cosmos SDK 的 slashing 模块，该模块实现了 2016 年 6 月在 [Cosmos 白皮书](https://cosmos.network/about/whitepaper) 中首次概述的功能。

slashing 模块使得基于 Cosmos SDK 的区块链能够通过惩罚具有价值的协议认可参与者来使其不再具有动机执行可归因的行为（"slashing"）。

惩罚可能包括但不限于：

* 烧毁一定数量的质押
* 在一段时间内取消其对未来区块的投票权。

该模块将被 Cosmos 生态系统中的第一个中心化枢纽 Cosmos Hub 使用。

## 目录

* [概念](#概念)
    * [状态](#状态)
    * [墓碑上限](#墓碑上限)
    * [违规时间线](#违规时间线)
* [状态](#状态)
    * [签名信息（活跃性）](#签名信息活跃性)
    * [参数](#参数)
* [消息](#消息)
    * [解除监禁](#解除监禁)
* [BeginBlock](#beginblock)
    * [活跃性跟踪](#活跃性跟踪)
* [钩子](#钩子)
* [事件](#事件)
* [质押墓碑](#质押墓碑)
* [参数](#参数)
* [CLI](#cli)
    * [查询](#查询)
    * [交易](#交易)
    * [gRPC](#grpc)
    * [REST](#rest)

## 概念

### 状态

在任何给定时间，状态机中都可能有任意数量的验证人注册。每个区块，前 `MaxValidators`（由 `x/staking` 定义）个未被监禁的验证人将成为 _bonded_，这意味着他们可以提议和投票区块。_bonded_ 的验证人处于 _at stake_ 状态，这意味着他们的一部分或全部质押以及他们的委托人的质押将因为他们的协议错误而面临风险。

对于这些验证人，我们保留一个 `ValidatorSigningInfo` 记录，其中包含与验证人的活跃性和其他违规相关属性有关的信息。

### 墓碑上限

为了减轻最初可能的非恶意协议错误的影响，Cosmos Hub 为每个验证人实施了一个 _tombstone_ 上限，该上限仅允许对双签错误进行一次惩罚。例如，如果您错误配置了 HSM 并双签了一堆旧区块，您只会因为第一次双签而受到惩罚（然后立即被墓碑化）。这仍然是相当昂贵且值得避免的，但墓碑上限在一定程度上减轻了意外配置错误的经济影响。

活性故障没有上限，因为它们不能叠加在一起。一旦发生违规行为，活性错误就会被“检测”出来，验证人会立即被监禁，因此他们不可能在解除监禁之前多次发生活性故障。

### 违规时间线

为了说明`x/slashing`模块如何通过CometBFT共识处理提交的证据，考虑以下示例：

**定义**：

_[_：时间线开始  
_]_：时间线结束  
_C<sub>n</sub>_：违规行为 `n` 发生  
_D<sub>n</sub>_：违规行为 `n` 发现  
_V<sub>b</sub>_：验证人已绑定  
_V<sub>u</sub>_：验证人已解绑

#### 单个双签违规

\[----------C<sub>1</sub>----D<sub>1</sub>,V<sub>u</sub>-----\]

先发生单个违规行为，然后稍后发现，此时验证人被解绑并按照违规行为的全额进行惩罚。

#### 多个双签违规

\[----------C<sub>1</sub>--C<sub>2</sub>---C<sub>3</sub>---D<sub>1</sub>,D<sub>2</sub>,D<sub>3</sub>V<sub>u</sub>-----\]

先发生多个违规行为，然后稍后发现，此时验证人被监禁并仅因为一个违规行为而被惩罚。由于验证人也被标记为已删除，他们无法重新加入验证人集合。

## 状态

### 签名信息（活性）

每个区块都包含验证人对上一个区块的预提交，即由CometBFT提供的`LastCommitInfo`。只要`LastCommitInfo`包含超过总投票权的2/3的预提交，它就是有效的。

通过在CometBFT的`LastCommitInfo`中包含所有验证人的预提交，提案人可以获得额外的费用，该费用与`LastCommitInfo`中包含的投票权与2/3之间的差异成比例（参见[费用分配](../distribution/README.md#begin-block)）。

```go
type LastCommitInfo struct {
	Round int32
	Votes []VoteInfo
}
```

如果验证人在某些区块中未被包含在`LastCommitInfo`中，他们将受到惩罚，自动被监禁，可能会被削减资金，并解除绑定。

有关验证人活跃性的信息通过`ValidatorSigningInfo`进行跟踪。
它在存储中的索引如下所示：

* ValidatorSigningInfo：`0x01 | ConsAddrLen（1字节）| ConsAddress -> ProtocolBuffer（ValSigningInfo）`
* MissedBlocksBitArray：`0x02 | ConsAddrLen（1字节）| ConsAddress | LittleEndianUint64（signArrayIndex）-> VarInt（didMiss）`（varint是一种数字编码格式）

第一个映射允许我们根据验证人的共识地址轻松查找最近的签名信息。

第二个映射（`MissedBlocksBitArray`）充当大小为`SignedBlocksWindow`的位数组，告诉我们验证人是否在位数组中的给定索引处错过了块。位数组中的索引以小端uint64的形式给出。结果是一个`varint`，取值为`0`或`1`，其中`0`表示验证人没有错过（已签名）相应的块，而`1`表示他们错过了该块（未签名）。

请注意，`MissedBlocksBitArray`不是在前期明确初始化的。在我们通过新绑定的验证人的前`SignedBlocksWindow`个块中进行进展时，会添加键。`SignedBlocksWindow`参数定义了用于跟踪验证人活跃性的滑动窗口的大小（块数）。

用于跟踪验证人活跃性的存储信息如下所示：

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/slashing/v1beta1/slashing.proto#L13-L35
```

### 参数

slashing模块将其参数存储在具有前缀`0x00`的状态中，可以通过治理或具有权限的地址进行更新。

* Params：`0x00 | ProtocolBuffer（Params）`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/slashing/v1beta1/slashing.proto#L37-L59
```

## 消息

在本节中，我们描述了`slashing`模块的消息处理。

### 解锁

如果由于停机而自动解除绑定的验证人希望重新上线并可能重新加入绑定集合，它必须发送`MsgUnjail`：

```protobuf
// MsgUnjail is an sdk.Msg used for unjailing a jailed validator, thus returning
// them into the bonded validator set, so they can begin receiving provisions
// and rewards again.
message MsgUnjail {
  string validator_addr = 1;
}
```

下面是 `MsgSrv/Unjail` RPC 的伪代码：

```go
unjail(tx MsgUnjail)
    validator = getValidator(tx.ValidatorAddr)
    if validator == nil
      fail with "No validator found"

    if getSelfDelegation(validator) == 0
      fail with "validator must self delegate before unjailing"

    if !validator.Jailed
      fail with "Validator not jailed, cannot unjail"

    info = GetValidatorSigningInfo(operator)
    if info.Tombstoned
      fail with "Tombstoned validator cannot be unjailed"
    if block time < info.JailedUntil
      fail with "Validator still jailed, cannot unjail until period has expired"

    validator.Jailed = false
    setValidator(validator)

    return
```

如果验证人的质押足够高，使其位于前 `n = MaximumBondedValidators` 名验证人之中，它将自动重新质押，
并且所有仍然委托给该验证人的委托人将重新质押，并开始重新收集奖励和回报。

## BeginBlock

### 存活性跟踪

在每个区块的开始，我们更新每个验证人的 `ValidatorSigningInfo`，并检查它们是否在滑动窗口内跌破了存活性阈值。
这个滑动窗口由 `SignedBlocksWindow` 定义，而在验证人的 `ValidatorSigningInfo` 中的 `IndexOffset` 决定了该窗口中的索引。
对于每个处理的区块，无论验证人是否签名，`IndexOffset` 都会递增。
一旦确定了索引，`MissedBlocksBitArray` 和 `MissedBlocksCounter` 将相应地进行更新。

最后，为了确定验证人是否跌破了存活性阈值，我们获取了最大错过区块数 `maxMissed`，它的计算公式为
`SignedBlocksWindow - (MinSignedPerWindow * SignedBlocksWindow)`，以及可以确定存活性的最小高度 `minHeight`。
如果当前区块高度大于 `minHeight`，并且验证人的 `MissedBlocksCounter` 大于 `maxMissed`，则它们将被罚款 `SlashFractionDowntime`，
并被监禁 `DowntimeJailDuration`，同时以下值将被重置：`MissedBlocksBitArray`、`MissedBlocksCounter` 和 `IndexOffset`。

**注意**：存活性罚款**不会**导致验证人被标记为墓碑。

```go
height := block.Height

for vote in block.LastCommitInfo.Votes {
  signInfo := GetValidatorSigningInfo(vote.Validator.Address)

  // This is a relative index, so we counts blocks the validator SHOULD have
  // signed. We use the 0-value default signing info if not present, except for
  // start height.
  index := signInfo.IndexOffset % SignedBlocksWindow()
  signInfo.IndexOffset++

  // Update MissedBlocksBitArray and MissedBlocksCounter. The MissedBlocksCounter
  // just tracks the sum of MissedBlocksBitArray. That way we avoid needing to
  // read/write the whole array each time.
  missedPrevious := GetValidatorMissedBlockBitArray(vote.Validator.Address, index)
  missed := !signed

  switch {
  case !missedPrevious && missed:
    // array index has changed from not missed to missed, increment counter
    SetValidatorMissedBlockBitArray(vote.Validator.Address, index, true)
    signInfo.MissedBlocksCounter++

  case missedPrevious && !missed:
    // array index has changed from missed to not missed, decrement counter
    SetValidatorMissedBlockBitArray(vote.Validator.Address, index, false)
    signInfo.MissedBlocksCounter--

  default:
    // array index at this index has not changed; no need to update counter
  }

  if missed {
    // emit events...
  }

  minHeight := signInfo.StartHeight + SignedBlocksWindow()
  maxMissed := SignedBlocksWindow() - MinSignedPerWindow()

  // If we are past the minimum height and the validator has missed too many
  // jail and slash them.
  if height > minHeight && signInfo.MissedBlocksCounter > maxMissed {
    validator := ValidatorByConsAddr(vote.Validator.Address)

    // emit events...

    // We need to retrieve the stake distribution which signed the block, so we
    // subtract ValidatorUpdateDelay from the block height, and subtract an
    // additional 1 since this is the LastCommit.
    //
    // Note, that this CAN result in a negative "distributionHeight" up to
    // -ValidatorUpdateDelay-1, i.e. at the end of the pre-genesis block (none) = at the beginning of the genesis block.
    // That's fine since this is just used to filter unbonding delegations & redelegations.
    distributionHeight := height - sdk.ValidatorUpdateDelay - 1

    SlashWithInfractionReason(vote.Validator.Address, distributionHeight, vote.Validator.Power, SlashFractionDowntime(), stakingtypes.Downtime)
    Jail(vote.Validator.Address)

    signInfo.JailedUntil = block.Time.Add(DowntimeJailDuration())

    // We need to reset the counter & array so that the validator won't be
    // immediately slashed for downtime upon rebonding.
    signInfo.MissedBlocksCounter = 0
    signInfo.IndexOffset = 0
    ClearValidatorMissedBlockBitArray(vote.Validator.Address)
  }

  SetValidatorSigningInfo(vote.Validator.Address, signInfo)
}
```

## Hooks

本节包含模块的 `hooks` 的描述。`hooks` 是在事件触发时自动执行的操作。

### Staking hooks

Slashing 模块实现了 `x/staking` 中定义的 `StakingHooks`，用于记录验证人信息。在应用程序初始化期间，这些 hooks 应该在 staking 模块结构中注册。

以下 hooks 影响 slashing 状态：

* `AfterValidatorBonded` 在下面的章节中创建了一个 `ValidatorSigningInfo` 实例。
* `AfterValidatorCreated` 存储了验证人的共识密钥。
* `AfterValidatorRemoved` 移除了验证人的共识密钥。

### 验证人绑定

在成功首次绑定新验证人时，我们为新绑定的验证人创建一个新的 `ValidatorSigningInfo` 结构，其 `StartHeight` 为当前区块的高度。

如果验证人曾经不在验证人集合中并再次绑定，其新的绑定高度将被设置。

```go
onValidatorBonded(address sdk.ValAddress)

  signingInfo, found = GetValidatorSigningInfo(address)
  if !found {
    signingInfo = ValidatorSigningInfo {
      StartHeight         : CurrentHeight,
      IndexOffset         : 0,
      JailedUntil         : time.Unix(0, 0),
      Tombstone           : false,
      MissedBloskCounter  : 0
    } else {
      signingInfo.StartHeight = CurrentHeight
    }

    setValidatorSigningInfo(signingInfo)
  }

  return
```

## 事件

Slashing 模块会发出以下事件：

### MsgServer

#### MsgUnjail

| 类型    | 属性键        | 属性值           |
| ------- | ------------- | ------------------ |
| message | module        | slashing           |
| message | sender        | {validatorAddress} |

### Keeper

### BeginBlocker: HandleValidatorSignature

| 类型  | 属性键        | 属性值             |
| ----- | ------------- | --------------------------- |
| slash | address       | {validatorConsensusAddress} |
| slash | power         | {validatorPower}            |
| slash | reason        | {slashReason}               |
| slash | jailed [0]    | {validatorConsensusAddress} |
| slash | burned coins  | {math.Int}                  |

* [0] 仅当验证人被监禁时包含。

| 类型     | 属性键        | 属性值             |
| -------- | ------------- | --------------------------- |
| liveness | address       | {validatorConsensusAddress} |
| liveness | missed_blocks | {missedBlocksCounter}       |
| liveness | height        | {blockHeight}               |

#### Slash

* 与 `HandleValidatorSignature` 的 `"slash"` 事件相同，但不包含 `jailed` 属性。

#### Jail

| 类型  | 属性键        | 属性值           |
| ----- | ------------- | ------------------ |
| slash | jailed        | {validatorAddress} |

## Staking Tombstone

### 摘要

在当前 `slashing` 模块的实现中，当共识引擎通知状态机发生了验证人的共识错误时，验证人会被部分惩罚，并被放入“监禁期”，在此期间，他们不被允许重新加入验证人集合。然而，由于共识错误和 ABCI 的性质，可能会存在一个违规发生和违规证据到达状态机之间的延迟（这是存在解绑期的主要原因之一）。

> 注意：墓碑概念仅适用于故障发生和证据到达状态机之间存在延迟的情况。例如，由于不可预测的证据传播层延迟和验证人有选择地公开双签名（例如，对于不经常在线的轻客户端），验证人双签名的证据可能需要一段时间才能到达状态机。另一方面，活跃性惩罚是在违规发生后立即检测到的，因此不需要惩罚期。验证人立即进入禁闭期，直到解禁之前，他们不能再次犯活跃性故障。未来可能会出现其他类型的拜占庭故障存在延迟的情况（例如，将无效提案的证据提交为交易）。在实施时，必须决定这些未来类型的拜占庭故障是否会导致墓碑（如果不会，则惩罚金额不会受到惩罚期的限制）。

在当前系统设计中，一旦验证人因共识故障而被禁闭，在`JailPeriod`之后，他们可以发送一个交易来解禁自己，从而重新加入验证人集合。

`slashing`模块的一个“设计愿望”是，如果在执行证据之前发生多个违规行为（并且验证人被禁闭），他们应该只受到最严重违规行为的惩罚，而不是累积惩罚。例如，如果事件序列如下：

1. 验证人A犯了违规行为1（价值30%的惩罚）
2. 验证人A犯了违规行为2（价值40%的惩罚）
3. 验证人A犯了违规行为3（价值35%的惩罚）
4. 违规行为1的证据到达状态机（验证人被禁闭）
5. 违规行为2的证据到达状态机
6. 违规行为3的证据到达状态机

只有违规行为2应该生效，因为它是最严重的。这样做是为了防止验证人的共识密钥被黑客入侵后，即使黑客双签了很多区块，他们也只会受到一次惩罚。由于解禁必须使用验证人的操作员密钥进行，他们有机会重新保护他们的共识密钥，然后使用操作员密钥发出准备信号。我们将这个仅跟踪最大违规行为的期间称为“惩罚期”。

一旦验证人通过解除监禁重新加入，我们就开始一个新的惩罚周期；
如果他们在解除监禁后再次犯规，将会在上一个惩罚周期的最严重犯规的基础上进行累计惩罚。

然而，虽然根据惩罚周期对违规行为进行分组，但由于可以在`解绑周期`之后提交证据，我们仍然必须允许对之前的惩罚周期提交证据。
例如，如果事件的顺序是：

1. 验证人A犯规1（价值30%的惩罚）
2. 验证人A犯规2（价值40%的惩罚）
3. 犯规1的证据到达状态机（验证人A被监禁）
4. 验证人A解除监禁

现在我们进入了一个新的惩罚周期，但我们仍然必须为之前的违规行为开放大门，因为犯规2的证据可能仍然会出现。
随着惩罚周期的增加，我们必须跟踪每个惩罚周期的最高惩罚金额，这增加了更多的复杂性。

> 注意：目前根据`slashing`模块规范，每当验证人解除绑定然后重新绑定时，都会创建一个新的惩罚周期。
> 这可能应该更改为监禁/解除监禁。有关详细信息，请参见问题[#3205](https://github.com/cosmos/cosmos-sdk/issues/3205)。
> 在接下来的内容中，我将假设我们只在验证人解除监禁时开始一个新的惩罚周期。

最大的惩罚周期数是`len(UnbondingPeriod) / len(JailPeriod)`。
Gaia中`UnbondingPeriod`和`JailPeriod`的默认值分别为3周和2天。
这意味着每个验证人可能同时跟踪多达11个惩罚周期。
如果我们设置`JailPeriod >= UnbondingPeriod`，我们只需要跟踪1个惩罚周期（即不需要跟踪惩罚周期）。

目前，在监禁期实施中，一旦验证人解除监禁，所有仍然委托给他们的委托人（未解绑/重新委托）将与他们一起。
鉴于共识安全故障非常严重（比活性故障严重得多），让委托人不自动重新委托给验证人可能是明智的选择。

#### 提案：无限牢狱

我们建议将对于提交共识安全故障的验证人的“牢狱时间”设置为`无限`（即墓碑状态）。这实际上将验证人从验证人集合中踢出，并且不允许其重新加入验证人集合。他们的所有委托人（包括操作者自己）必须解除委托或重新委托给其他验证人。验证人操作者可以选择创建一个新的验证人，使用新的操作者密钥和共识密钥，但是他们必须“重新赢得”他们的委托。

实施墓碑系统并且摒弃对于惩罚期跟踪将使得`slashing`模块变得更简单，特别是因为我们可以删除`staking`模块中使用的`slashing`模块定义的所有钩子。

#### 单一惩罚金额

另一个可以进行的优化是，如果我们假设所有CometBFT共识的ABCI故障都以相同的水平进行惩罚，那么我们就不需要跟踪“最大惩罚”。一旦发生ABCI故障，我们就不需要担心将来可能发生的故障来寻找最大值。

目前唯一的CometBFT ABCI故障是：

* 不合理的预提交（双签名）

计划在不久的将来包括以下故障：

* 在解绑阶段签署预提交（需要使轻客户端二分法安全）

鉴于这些故障都是可归因的拜占庭故障，我们可能希望对它们进行相同的惩罚，因此我们可以实施上述更改。

> 注意：这个更改对于当前的CometBFT共识可能是合理的，但对于其他共识算法或未来版本的CometBFT可能不适用，因为它们可能希望以不同的水平进行惩罚（例如，部分惩罚）。

## 参数

`slashing`模块包含以下参数：

| 键名                    | 类型           | 示例                   |
| ----------------------- | -------------- | ---------------------- |
| SignedBlocksWindow      | string (int64) | "100"                  |
| MinSignedPerWindow      | string (dec)   | "0.500000000000000000" |
| DowntimeJailDuration    | string (ns)    | "600000000000"         |
| SlashFractionDoubleSign | string (dec)   | "0.050000000000000000" |
| SlashFractionDowntime   | string (dec)   | "0.010000000000000000" |

## CLI

用户可以使用CLI查询和与`slashing`模块进行交互。

### 查询

`query`命令允许用户查询`slashing`状态。

```shell
simd query slashing --help
```

#### params

`params`命令允许用户查询`slashing`模块的创世参数。

```shell
simd query slashing params [flags]
```

示例：

```shell
simd query slashing params
```

示例输出：

```yml
downtime_jail_duration: 600s
min_signed_per_window: "0.500000000000000000"
signed_blocks_window: "100"
slash_fraction_double_sign: "0.050000000000000000"
slash_fraction_downtime: "0.010000000000000000"
```

#### signing-info

`signing-info`命令允许用户查询使用共识公钥的验证人的签名信息。

```shell
simd query slashing signing-infos [flags]
```

示例：

```shell
simd query slashing signing-info '{"@type":"/cosmos.crypto.ed25519.PubKey","key":"Auxs3865HpB/EfssYOzfqNhEJjzys6jD5B6tPgC8="}'
```

示例输出：

```yml
address: cosmosvalcons1nrqsld3aw6lh6t082frdqc84uwxn0t958c
index_offset: "2068"
jailed_until: "1970-01-01T00:00:00Z"
missed_blocks_counter: "0"
start_height: "0"
tombstoned: false
```

#### signing-infos

`signing-infos`命令允许用户查询所有验证人的签名信息。

```shell
simd query slashing signing-infos [flags]
```

示例：

```shell
simd query slashing signing-infos
```

示例输出：

```yml
info:
- address: cosmosvalcons1nrqsld3aw6lh6t082frdqc84uwxn0t958c
  index_offset: "2075"
  jailed_until: "1970-01-01T00:00:00Z"
  missed_blocks_counter: "0"
  start_height: "0"
  tombstoned: false
pagination:
  next_key: null
  total: "0"
```

### 交易

`tx`命令允许用户与`slashing`模块进行交互。

```bash
simd tx slashing --help
```

#### unjail

`unjail`命令允许用户解除先前因停机而被监禁的验证人。

```bash
simd tx slashing unjail --from mykey [flags]
```

示例：

```bash
simd tx slashing unjail --from mykey
```

### gRPC

用户可以使用gRPC端点查询`slashing`模块。

#### Params

`Params`端点允许用户查询`slashing`模块的参数。

```shell
cosmos.slashing.v1beta1.Query/Params
```

示例：

```shell
grpcurl -plaintext localhost:9090 cosmos.slashing.v1beta1.Query/Params
```

示例输出：

```json
{
  "params": {
    "signedBlocksWindow": "100",
    "minSignedPerWindow": "NTAwMDAwMDAwMDAwMDAwMDAw",
    "downtimeJailDuration": "600s",
    "slashFractionDoubleSign": "NTAwMDAwMDAwMDAwMDAwMDA=",
    "slashFractionDowntime": "MTAwMDAwMDAwMDAwMDAwMDA="
  }
}
```

#### SigningInfo

SigningInfo查询给定共识地址的签名信息。

```shell
cosmos.slashing.v1beta1.Query/SigningInfo
```

示例：

```shell
grpcurl -plaintext -d '{"cons_address":"cosmosvalcons1nrqsld3aw6lh6t082frdqc84uwxn0t958c"}' localhost:9090 cosmos.slashing.v1beta1.Query/SigningInfo
```

#### SigningInfos

SigningInfos 查询所有验证人的签名信息。

```shell
cosmos.slashing.v1beta1.Query/SigningInfos
```

示例：

```shell
grpcurl -plaintext localhost:9090 cosmos.slashing.v1beta1.Query/SigningInfos
```

示例输出：

```json
{
  "info": [
    {
      "address": "cosmosvalcons1nrqslkwd3pz096lh6t082frdqc84uwxn0t958c",
      "indexOffset": "2467",
      "jailedUntil": "1970-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### REST

用户可以使用 REST 端点查询 `slashing` 模块。

#### Params

```shell
/cosmos/slashing/v1beta1/params
```

示例：

```shell
curl "localhost:1317/cosmos/slashing/v1beta1/params"
```

示例输出：

```json
{
  "params": {
    "signed_blocks_window": "100",
    "min_signed_per_window": "0.500000000000000000",
    "downtime_jail_duration": "600s",
    "slash_fraction_double_sign": "0.050000000000000000",
    "slash_fraction_downtime": "0.010000000000000000"
}
```

#### signing_info

```shell
/cosmos/slashing/v1beta1/signing_infos/%s
```

示例：

```shell
curl "localhost:1317/cosmos/slashing/v1beta1/signing_infos/cosmosvalcons1nrqslkwd3pz096lh6t082frdqc84uwxn0t958c"
```

示例输出：

```json
{
  "val_signing_info": {
    "address": "cosmosvalcons1nrqslkwd3pz096lh6t082frdqc84uwxn0t958c",
    "start_height": "0",
    "index_offset": "4184",
    "jailed_until": "1970-01-01T00:00:00Z",
    "tombstoned": false,
    "missed_blocks_counter": "0"
  }
}
```

#### signing_infos

```shell
/cosmos/slashing/v1beta1/signing_infos
```

示例：

```shell
curl "localhost:1317/cosmos/slashing/v1beta1/signing_infos
```

示例输出：

```json
{
  "info": [
    {
      "address": "cosmosvalcons1nrqslkwd3pz096lh6t082frdqc84uwxn0t958c",
      "start_height": "0",
      "index_offset": "4169",
      "jailed_until": "1970-01-01T00:00:00Z",
      "tombstoned": false,
      "missed_blocks_counter": "0"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```




# `x/slashing`

## Abstract

This section specifies the slashing module of the Cosmos SDK, which implements functionality
first outlined in the [Cosmos Whitepaper](https://cosmos.network/about/whitepaper) in June 2016.

The slashing module enables Cosmos SDK-based blockchains to disincentivize any attributable action
by a protocol-recognized actor with value at stake by penalizing them ("slashing").

Penalties may include, but are not limited to:

* Burning some amount of their stake
* Removing their ability to vote on future blocks for a period of time.

This module will be used by the Cosmos Hub, the first hub in the Cosmos ecosystem.

## Contents

* [Concepts](#concepts)
    * [States](#states)
    * [Tombstone Caps](#tombstone-caps)
    * [Infraction Timelines](#infraction-timelines)
* [State](#state)
    * [Signing Info (Liveness)](#signing-info-liveness)
    * [Params](#params)
* [Messages](#messages)
    * [Unjail](#unjail)
* [BeginBlock](#beginblock)
    * [Liveness Tracking](#liveness-tracking)
* [Hooks](#hooks)
* [Events](#events)
* [Staking Tombstone](#staking-tombstone)
* [Parameters](#parameters)
* [CLI](#cli)
    * [Query](#query)
    * [Transactions](#transactions)
    * [gRPC](#grpc)
    * [REST](#rest)

## Concepts

### States

At any given time, there are any number of validators registered in the state
machine. Each block, the top `MaxValidators` (defined by `x/staking`) validators
who are not jailed become _bonded_, meaning that they may propose and vote on
blocks. Validators who are _bonded_ are _at stake_, meaning that part or all of
their stake and their delegators' stake is at risk if they commit a protocol fault.

For each of these validators we keep a `ValidatorSigningInfo` record that contains
information partaining to validator's liveness and other infraction related
attributes.

### Tombstone Caps

In order to mitigate the impact of initially likely categories of non-malicious
protocol faults, the Cosmos Hub implements for each validator
a _tombstone_ cap, which only allows a validator to be slashed once for a double
sign fault. For example, if you misconfigure your HSM and double-sign a bunch of
old blocks, you'll only be punished for the first double-sign (and then immediately tombstombed). This will still be quite expensive and desirable to avoid, but tombstone caps
somewhat blunt the economic impact of unintentional misconfiguration.

Liveness faults do not have caps, as they can't stack upon each other. Liveness bugs are "detected" as soon as the infraction occurs, and the validators are immediately put in jail, so it is not possible for them to commit multiple liveness faults without unjailing in between.

### Infraction Timelines

To illustrate how the `x/slashing` module handles submitted evidence through
CometBFT consensus, consider the following examples:

**Definitions**:

_[_ : timeline start  
_]_ : timeline end  
_C<sub>n</sub>_ : infraction `n` committed  
_D<sub>n</sub>_ : infraction `n` discovered  
_V<sub>b</sub>_ : validator bonded  
_V<sub>u</sub>_ : validator unbonded

#### Single Double Sign Infraction

\[----------C<sub>1</sub>----D<sub>1</sub>,V<sub>u</sub>-----\]

A single infraction is committed then later discovered, at which point the
validator is unbonded and slashed at the full amount for the infraction.

#### Multiple Double Sign Infractions

\[----------C<sub>1</sub>--C<sub>2</sub>---C<sub>3</sub>---D<sub>1</sub>,D<sub>2</sub>,D<sub>3</sub>V<sub>u</sub>-----\]

Multiple infractions are committed and then later discovered, at which point the
validator is jailed and slashed for only one infraction. Because the validator
is also tombstoned, they can not rejoin the validator set.

## State

### Signing Info (Liveness)

Every block includes a set of precommits by the validators for the previous block,
known as the `LastCommitInfo` provided by CometBFT. A `LastCommitInfo` is valid so
long as it contains precommits from +2/3 of total voting power.

Proposers are incentivized to include precommits from all validators in the CometBFT `LastCommitInfo`
by receiving additional fees proportional to the difference between the voting
power included in the `LastCommitInfo` and +2/3 (see [fee distribution](../distribution/README.md#begin-block)).

```go
type LastCommitInfo struct {
	Round int32
	Votes []VoteInfo
}
```

Validators are penalized for failing to be included in the `LastCommitInfo` for some
number of blocks by being automatically jailed, potentially slashed, and unbonded.

Information about validator's liveness activity is tracked through `ValidatorSigningInfo`.
It is indexed in the store as follows:

* ValidatorSigningInfo: `0x01 | ConsAddrLen (1 byte) | ConsAddress -> ProtocolBuffer(ValSigningInfo)`
* MissedBlocksBitArray: `0x02 | ConsAddrLen (1 byte) | ConsAddress | LittleEndianUint64(signArrayIndex) -> VarInt(didMiss)` (varint is a number encoding format)

The first mapping allows us to easily lookup the recent signing info for a
validator based on the validator's consensus address.

The second mapping (`MissedBlocksBitArray`) acts
as a bit-array of size `SignedBlocksWindow` that tells us if the validator missed
the block for a given index in the bit-array. The index in the bit-array is given
as little endian uint64.
The result is a `varint` that takes on `0` or `1`, where `0` indicates the
validator did not miss (did sign) the corresponding block, and `1` indicates
they missed the block (did not sign).

Note that the `MissedBlocksBitArray` is not explicitly initialized up-front. Keys
are added as we progress through the first `SignedBlocksWindow` blocks for a newly
bonded validator. The `SignedBlocksWindow` parameter defines the size
(number of blocks) of the sliding window used to track validator liveness.

The information stored for tracking validator liveness is as follows:

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/slashing/v1beta1/slashing.proto#L13-L35
```

### Params

The slashing module stores it's params in state with the prefix of `0x00`,
it can be updated with governance or the address with authority.

* Params: `0x00 | ProtocolBuffer(Params)`

```protobuf reference
https://github.com/cosmos/cosmos-sdk/blob/v0.47.0-rc1/proto/cosmos/slashing/v1beta1/slashing.proto#L37-L59
```

## Messages

In this section we describe the processing of messages for the `slashing` module.

### Unjail

If a validator was automatically unbonded due to downtime and wishes to come back online &
possibly rejoin the bonded set, it must send `MsgUnjail`:

```protobuf
// MsgUnjail is an sdk.Msg used for unjailing a jailed validator, thus returning
// them into the bonded validator set, so they can begin receiving provisions
// and rewards again.
message MsgUnjail {
  string validator_addr = 1;
}
```

Below is a pseudocode of the `MsgSrv/Unjail` RPC:

```go
unjail(tx MsgUnjail)
    validator = getValidator(tx.ValidatorAddr)
    if validator == nil
      fail with "No validator found"

    if getSelfDelegation(validator) == 0
      fail with "validator must self delegate before unjailing"

    if !validator.Jailed
      fail with "Validator not jailed, cannot unjail"

    info = GetValidatorSigningInfo(operator)
    if info.Tombstoned
      fail with "Tombstoned validator cannot be unjailed"
    if block time < info.JailedUntil
      fail with "Validator still jailed, cannot unjail until period has expired"

    validator.Jailed = false
    setValidator(validator)

    return
```

If the validator has enough stake to be in the top `n = MaximumBondedValidators`, it will be automatically rebonded,
and all delegators still delegated to the validator will be rebonded and begin to again collect
provisions and rewards.

## BeginBlock

### Liveness Tracking

At the beginning of each block, we update the `ValidatorSigningInfo` for each
validator and check if they've crossed below the liveness threshold over a
sliding window. This sliding window is defined by `SignedBlocksWindow` and the
index in this window is determined by `IndexOffset` found in the validator's
`ValidatorSigningInfo`. For each block processed, the `IndexOffset` is incremented
regardless if the validator signed or not. Once the index is determined, the
`MissedBlocksBitArray` and `MissedBlocksCounter` are updated accordingly.

Finally, in order to determine if a validator crosses below the liveness threshold,
we fetch the maximum number of blocks missed, `maxMissed`, which is
`SignedBlocksWindow - (MinSignedPerWindow * SignedBlocksWindow)` and the minimum
height at which we can determine liveness, `minHeight`. If the current block is
greater than `minHeight` and the validator's `MissedBlocksCounter` is greater than
`maxMissed`, they will be slashed by `SlashFractionDowntime`, will be jailed
for `DowntimeJailDuration`, and have the following values reset:
`MissedBlocksBitArray`, `MissedBlocksCounter`, and `IndexOffset`.

**Note**: Liveness slashes do **NOT** lead to a tombstombing.

```go
height := block.Height

for vote in block.LastCommitInfo.Votes {
  signInfo := GetValidatorSigningInfo(vote.Validator.Address)

  // This is a relative index, so we counts blocks the validator SHOULD have
  // signed. We use the 0-value default signing info if not present, except for
  // start height.
  index := signInfo.IndexOffset % SignedBlocksWindow()
  signInfo.IndexOffset++

  // Update MissedBlocksBitArray and MissedBlocksCounter. The MissedBlocksCounter
  // just tracks the sum of MissedBlocksBitArray. That way we avoid needing to
  // read/write the whole array each time.
  missedPrevious := GetValidatorMissedBlockBitArray(vote.Validator.Address, index)
  missed := !signed

  switch {
  case !missedPrevious && missed:
    // array index has changed from not missed to missed, increment counter
    SetValidatorMissedBlockBitArray(vote.Validator.Address, index, true)
    signInfo.MissedBlocksCounter++

  case missedPrevious && !missed:
    // array index has changed from missed to not missed, decrement counter
    SetValidatorMissedBlockBitArray(vote.Validator.Address, index, false)
    signInfo.MissedBlocksCounter--

  default:
    // array index at this index has not changed; no need to update counter
  }

  if missed {
    // emit events...
  }

  minHeight := signInfo.StartHeight + SignedBlocksWindow()
  maxMissed := SignedBlocksWindow() - MinSignedPerWindow()

  // If we are past the minimum height and the validator has missed too many
  // jail and slash them.
  if height > minHeight && signInfo.MissedBlocksCounter > maxMissed {
    validator := ValidatorByConsAddr(vote.Validator.Address)

    // emit events...

    // We need to retrieve the stake distribution which signed the block, so we
    // subtract ValidatorUpdateDelay from the block height, and subtract an
    // additional 1 since this is the LastCommit.
    //
    // Note, that this CAN result in a negative "distributionHeight" up to
    // -ValidatorUpdateDelay-1, i.e. at the end of the pre-genesis block (none) = at the beginning of the genesis block.
    // That's fine since this is just used to filter unbonding delegations & redelegations.
    distributionHeight := height - sdk.ValidatorUpdateDelay - 1

    SlashWithInfractionReason(vote.Validator.Address, distributionHeight, vote.Validator.Power, SlashFractionDowntime(), stakingtypes.Downtime)
    Jail(vote.Validator.Address)

    signInfo.JailedUntil = block.Time.Add(DowntimeJailDuration())

    // We need to reset the counter & array so that the validator won't be
    // immediately slashed for downtime upon rebonding.
    signInfo.MissedBlocksCounter = 0
    signInfo.IndexOffset = 0
    ClearValidatorMissedBlockBitArray(vote.Validator.Address)
  }

  SetValidatorSigningInfo(vote.Validator.Address, signInfo)
}
```

## Hooks

This section contains a description of the module's `hooks`. Hooks are operations that are executed automatically when events are raised.

### Staking hooks

The slashing module implements the `StakingHooks` defined in `x/staking` and are used as record-keeping of validators information. During the app initialization, these hooks should be registered in the staking module struct.

The following hooks impact the slashing state:

* `AfterValidatorBonded` creates a `ValidatorSigningInfo` instance as described in the following section.
* `AfterValidatorCreated` stores a validator's consensus key.
* `AfterValidatorRemoved` removes a validator's consensus key.

### Validator Bonded

Upon successful first-time bonding of a new validator, we create a new `ValidatorSigningInfo` structure for the
now-bonded validator, which `StartHeight` of the current block.

If the validator was out of the validator set and gets bonded again, its new bonded height is set.

```go
onValidatorBonded(address sdk.ValAddress)

  signingInfo, found = GetValidatorSigningInfo(address)
  if !found {
    signingInfo = ValidatorSigningInfo {
      StartHeight         : CurrentHeight,
      IndexOffset         : 0,
      JailedUntil         : time.Unix(0, 0),
      Tombstone           : false,
      MissedBloskCounter  : 0
    } else {
      signingInfo.StartHeight = CurrentHeight
    }

    setValidatorSigningInfo(signingInfo)
  }

  return
```

## Events

The slashing module emits the following events:

### MsgServer

#### MsgUnjail

| Type    | Attribute Key | Attribute Value    |
| ------- | ------------- | ------------------ |
| message | module        | slashing           |
| message | sender        | {validatorAddress} |

### Keeper

### BeginBlocker: HandleValidatorSignature

| Type  | Attribute Key | Attribute Value             |
| ----- | ------------- | --------------------------- |
| slash | address       | {validatorConsensusAddress} |
| slash | power         | {validatorPower}            |
| slash | reason        | {slashReason}               |
| slash | jailed [0]    | {validatorConsensusAddress} |
| slash | burned coins  | {math.Int}                  |

* [0] Only included if the validator is jailed.

| Type     | Attribute Key | Attribute Value             |
| -------- | ------------- | --------------------------- |
| liveness | address       | {validatorConsensusAddress} |
| liveness | missed_blocks | {missedBlocksCounter}       |
| liveness | height        | {blockHeight}               |

#### Slash

* same as `"slash"` event from `HandleValidatorSignature`, but without the `jailed` attribute.

#### Jail

| Type  | Attribute Key | Attribute Value    |
| ----- | ------------- | ------------------ |
| slash | jailed        | {validatorAddress} |

## Staking Tombstone

### Abstract

In the current implementation of the `slashing` module, when the consensus engine
informs the state machine of a validator's consensus fault, the validator is
partially slashed, and put into a "jail period", a period of time in which they
are not allowed to rejoin the validator set. However, because of the nature of
consensus faults and ABCI, there can be a delay between an infraction occurring,
and evidence of the infraction reaching the state machine (this is one of the
primary reasons for the existence of the unbonding period).

> Note: The tombstone concept, only applies to faults that have a delay between
> the infraction occurring and evidence reaching the state machine. For example,
> evidence of a validator double signing may take a while to reach the state machine
> due to unpredictable evidence gossip layer delays and the ability of validators to
> selectively reveal double-signatures (e.g. to infrequently-online light clients).
> Liveness slashing, on the other hand, is detected immediately as soon as the
> infraction occurs, and therefore no slashing period is needed. A validator is
> immediately put into jail period, and they cannot commit another liveness fault
> until they unjail. In the future, there may be other types of byzantine faults
> that have delays (for example, submitting evidence of an invalid proposal as a transaction).
> When implemented, it will have to be decided whether these future types of
> byzantine faults will result in a tombstoning (and if not, the slash amounts
> will not be capped by a slashing period).

In the current system design, once a validator is put in the jail for a consensus
fault, after the `JailPeriod` they are allowed to send a transaction to `unjail`
themselves, and thus rejoin the validator set.

One of the "design desires" of the `slashing` module is that if multiple
infractions occur before evidence is executed (and a validator is put in jail),
they should only be punished for single worst infraction, but not cumulatively.
For example, if the sequence of events is:

1. Validator A commits Infraction 1 (worth 30% slash)
2. Validator A commits Infraction 2 (worth 40% slash)
3. Validator A commits Infraction 3 (worth 35% slash)
4. Evidence for Infraction 1 reaches state machine (and validator is put in jail)
5. Evidence for Infraction 2 reaches state machine
6. Evidence for Infraction 3 reaches state machine

Only Infraction 2 should have its slash take effect, as it is the highest. This
is done, so that in the case of the compromise of a validator's consensus key,
they will only be punished once, even if the hacker double-signs many blocks.
Because, the unjailing has to be done with the validator's operator key, they
have a chance to re-secure their consensus key, and then signal that they are
ready using their operator key. We call this period during which we track only
the max infraction, the "slashing period".

Once, a validator rejoins by unjailing themselves, we begin a new slashing period;
if they commit a new infraction after unjailing, it gets slashed cumulatively on
top of the worst infraction from the previous slashing period.

However, while infractions are grouped based off of the slashing periods, because
evidence can be submitted up to an `unbondingPeriod` after the infraction, we
still have to allow for evidence to be submitted for previous slashing periods.
For example, if the sequence of events is:

1. Validator A commits Infraction 1 (worth 30% slash)
2. Validator A commits Infraction 2 (worth 40% slash)
3. Evidence for Infraction 1 reaches state machine (and Validator A is put in jail)
4. Validator A unjails

We are now in a new slashing period, however we still have to keep the door open
for the previous infraction, as the evidence for Infraction 2 may still come in.
As the number of slashing periods increase, it creates more complexity as we have
to keep track of the highest infraction amount for every single slashing period.

> Note: Currently, according to the `slashing` module spec, a new slashing period
> is created every time a validator is unbonded then rebonded. This should probably
> be changed to jailed/unjailed. See issue [#3205](https://github.com/cosmos/cosmos-sdk/issues/3205)
> for further details. For the remainder of this, I will assume that we only start
> a new slashing period when a validator gets unjailed.

The maximum number of slashing periods is the `len(UnbondingPeriod) / len(JailPeriod)`.
The current defaults in Gaia for the `UnbondingPeriod` and `JailPeriod` are 3 weeks
and 2 days, respectively. This means there could potentially be up to 11 slashing
periods concurrently being tracked per validator. If we set the `JailPeriod >= UnbondingPeriod`,
we only have to track 1 slashing period (i.e not have to track slashing periods).

Currently, in the jail period implementation, once a validator unjails, all of
their delegators who are delegated to them (haven't unbonded / redelegated away),
stay with them. Given that consensus safety faults are so egregious
(way more so than liveness faults), it is probably prudent to have delegators not
"auto-rebond" to the validator.

#### Proposal: infinite jail

We propose setting the "jail time" for a
validator who commits a consensus safety fault, to `infinite` (i.e. a tombstone state).
This essentially kicks the validator out of the validator set and does not allow
them to re-enter the validator set. All of their delegators (including the operator themselves)
have to either unbond or redelegate away. The validator operator can create a new
validator if they would like, with a new operator key and consensus key, but they
have to "re-earn" their delegations back.

Implementing the tombstone system and getting rid of the slashing period tracking
will make the `slashing` module way simpler, especially because we can remove all
of the hooks defined in the `slashing` module consumed by the `staking` module
(the `slashing` module still consumes hooks defined in `staking`).

#### Single slashing amount

Another optimization that can be made is that if we assume that all ABCI faults
for CometBFT consensus are slashed at the same level, we don't have to keep
track of "max slash". Once an ABCI fault happens, we don't have to worry about
comparing potential future ones to find the max.

Currently the only CometBFT ABCI fault is:

* Unjustified precommits (double signs)

It is currently planned to include the following fault in the near future:

* Signing a precommit when you're in unbonding phase (needed to make light client bisection safe)

Given that these faults are both attributable byzantine faults, we will likely
want to slash them equally, and thus we can enact the above change.

> Note: This change may make sense for current CometBFT consensus, but maybe
> not for a different consensus algorithm or future versions of CometBFT that
> may want to punish at different levels (for example, partial slashing).

## Parameters

The slashing module contains the following parameters:

| Key                     | Type           | Example                |
| ----------------------- | -------------- | ---------------------- |
| SignedBlocksWindow      | string (int64) | "100"                  |
| MinSignedPerWindow      | string (dec)   | "0.500000000000000000" |
| DowntimeJailDuration    | string (ns)    | "600000000000"         |
| SlashFractionDoubleSign | string (dec)   | "0.050000000000000000" |
| SlashFractionDowntime   | string (dec)   | "0.010000000000000000" |

## CLI

A user can query and interact with the `slashing` module using the CLI.

### Query

The `query` commands allow users to query `slashing` state.

```shell
simd query slashing --help
```

#### params

The `params` command allows users to query genesis parameters for the slashing module.

```shell
simd query slashing params [flags]
```

Example:

```shell
simd query slashing params
```

Example Output:

```yml
downtime_jail_duration: 600s
min_signed_per_window: "0.500000000000000000"
signed_blocks_window: "100"
slash_fraction_double_sign: "0.050000000000000000"
slash_fraction_downtime: "0.010000000000000000"
```

#### signing-info

The `signing-info` command allows users to query signing-info of the validator using consensus public key.

```shell
simd query slashing signing-infos [flags]
```

Example:

```shell
simd query slashing signing-info '{"@type":"/cosmos.crypto.ed25519.PubKey","key":"Auxs3865HpB/EfssYOzfqNhEJjzys6jD5B6tPgC8="}'

```

Example Output:

```yml
address: cosmosvalcons1nrqsld3aw6lh6t082frdqc84uwxn0t958c
index_offset: "2068"
jailed_until: "1970-01-01T00:00:00Z"
missed_blocks_counter: "0"
start_height: "0"
tombstoned: false
```

#### signing-infos

The `signing-infos` command allows users to query signing infos of all validators.

```shell
simd query slashing signing-infos [flags]
```

Example:

```shell
simd query slashing signing-infos
```

Example Output:

```yml
info:
- address: cosmosvalcons1nrqsld3aw6lh6t082frdqc84uwxn0t958c
  index_offset: "2075"
  jailed_until: "1970-01-01T00:00:00Z"
  missed_blocks_counter: "0"
  start_height: "0"
  tombstoned: false
pagination:
  next_key: null
  total: "0"
```

### Transactions

The `tx` commands allow users to interact with the `slashing` module.

```bash
simd tx slashing --help
```

#### unjail

The `unjail` command allows users to unjail a validator previously jailed for downtime.

```bash
simd tx slashing unjail --from mykey [flags]
```

Example:

```bash
simd tx slashing unjail --from mykey
```

### gRPC

A user can query the `slashing` module using gRPC endpoints.

#### Params

The `Params` endpoint allows users to query the parameters of slashing module.

```shell
cosmos.slashing.v1beta1.Query/Params
```

Example:

```shell
grpcurl -plaintext localhost:9090 cosmos.slashing.v1beta1.Query/Params
```

Example Output:

```json
{
  "params": {
    "signedBlocksWindow": "100",
    "minSignedPerWindow": "NTAwMDAwMDAwMDAwMDAwMDAw",
    "downtimeJailDuration": "600s",
    "slashFractionDoubleSign": "NTAwMDAwMDAwMDAwMDAwMDA=",
    "slashFractionDowntime": "MTAwMDAwMDAwMDAwMDAwMDA="
  }
}
```

#### SigningInfo

The SigningInfo queries the signing info of given cons address.

```shell
cosmos.slashing.v1beta1.Query/SigningInfo
```

Example:

```shell
grpcurl -plaintext -d '{"cons_address":"cosmosvalcons1nrqsld3aw6lh6t082frdqc84uwxn0t958c"}' localhost:9090 cosmos.slashing.v1beta1.Query/SigningInfo
```

Example Output:

```json
{
  "valSigningInfo": {
    "address": "cosmosvalcons1nrqsld3aw6lh6t082frdqc84uwxn0t958c",
    "indexOffset": "3493",
    "jailedUntil": "1970-01-01T00:00:00Z"
  }
}
```

#### SigningInfos

The SigningInfos queries signing info of all validators.

```shell
cosmos.slashing.v1beta1.Query/SigningInfos
```

Example:

```shell
grpcurl -plaintext localhost:9090 cosmos.slashing.v1beta1.Query/SigningInfos
```

Example Output:

```json
{
  "info": [
    {
      "address": "cosmosvalcons1nrqslkwd3pz096lh6t082frdqc84uwxn0t958c",
      "indexOffset": "2467",
      "jailedUntil": "1970-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": "1"
  }
}
```

### REST

A user can query the `slashing` module using REST endpoints.

#### Params

```shell
/cosmos/slashing/v1beta1/params
```

Example:

```shell
curl "localhost:1317/cosmos/slashing/v1beta1/params"
```

Example Output:

```json
{
  "params": {
    "signed_blocks_window": "100",
    "min_signed_per_window": "0.500000000000000000",
    "downtime_jail_duration": "600s",
    "slash_fraction_double_sign": "0.050000000000000000",
    "slash_fraction_downtime": "0.010000000000000000"
}
```

#### signing_info

```shell
/cosmos/slashing/v1beta1/signing_infos/%s
```

Example:

```shell
curl "localhost:1317/cosmos/slashing/v1beta1/signing_infos/cosmosvalcons1nrqslkwd3pz096lh6t082frdqc84uwxn0t958c"
```

Example Output:

```json
{
  "val_signing_info": {
    "address": "cosmosvalcons1nrqslkwd3pz096lh6t082frdqc84uwxn0t958c",
    "start_height": "0",
    "index_offset": "4184",
    "jailed_until": "1970-01-01T00:00:00Z",
    "tombstoned": false,
    "missed_blocks_counter": "0"
  }
}
```

#### signing_infos

```shell
/cosmos/slashing/v1beta1/signing_infos
```

Example:

```shell
curl "localhost:1317/cosmos/slashing/v1beta1/signing_infos
```

Example Output:

```json
{
  "info": [
    {
      "address": "cosmosvalcons1nrqslkwd3pz096lh6t082frdqc84uwxn0t958c",
      "start_height": "0",
      "index_offset": "4169",
      "jailed_until": "1970-01-01T00:00:00Z",
      "tombstoned": false,
      "missed_blocks_counter": "0"
    }
  ],
  "pagination": {
    "next_key": null,
    "total": "1"
  }
}
```
