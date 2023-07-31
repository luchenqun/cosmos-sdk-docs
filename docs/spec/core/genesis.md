# 创世文件

创世文件是链的起点。应用程序将在创世文件的`app_state`字段中填充其所需的字段。Tendermint无法验证此部分，因为它不知道应用程序状态的具体内容。

## 创世字段

- `genesis_time`：创世时间是区块链开始或将开始的时间。如果节点在此时间之前启动，它们将处于空闲状态，直到指定的时间。
- `chain_id`：链标识符是链的唯一标识符。在进行基于分叉的升级时，我们建议更改链标识符，以避免网络或共识错误。
- `initial_height`：此字段是区块链的起始高度。在进行链重启以避免从高度1重新启动时，网络可以在指定的高度开始。
- `consensus_params`
    - `block`
        - `max_bytes`：区块的最大字节数。
        - `max_gas`：区块的最大燃料量。
        - `time_iota_ms`：此参数在Tendermint-core中不再具有值。

- `evidence`
      - `max_age_num_blocks`：在经过预设的一定数量的区块后，单个证据被视为无效。
      - `max_age_duration`：在经过预设的一定时间后，单个证据被视为无效。
      - `max_bytes`：区块中包含的所有证据的最大字节数。

> 注意：要使证据被视为无效，证据必须早于`max_age_num_blocks`和`max_age_duration`。

- `validator`
      - `pub_key_types`：定义要接受为有效验证器共识密钥的曲线。Tendermint支持ed25519、sr25519和secp256k1。

- `version`
      - `app_version`：应用程序的版本。这由应用程序设置，并用于确定用户应使用哪个应用程序版本来操作节点。

- `validators`
    - 这是一个验证器数组。此验证器集用作链的起始验证器集。如果应用程序在`InitChain`中设置了验证器集，则此字段可以为空。

- `app_hash`：应用程序状态根哈希。在链的开始时，此字段不需要填充，应用程序可以通过 `Initchain` 提供所需的信息。

- `app_state`：此部分由应用程序填充，对 Tendermint 是未知的。


# Genesis

The genesis file is the starting point of a chain. An application will populate the `app_state` field in the genesis with their required fields. Tendermint is not able to validate this section because it is unaware what application state consists of.

## Genesis Fields

- `genesis_time`: The genesis time is the time the blockchain started or will start. If nodes are started before this time they will sit idle until the time specified.
- `chain_id`: The chainid is the chain identifier. Every chain should have a unique identifier. When conducting a fork based upgrade, we recommend changing the chainid to avoid network or consensus errors.
- `initial_height`: This field is the starting height of the blockchain. When conducting a chain restart to avoid restarting at height 1, the network is able to start at a specified height.
- `consensus_params`
    - `block`
        - `max_bytes`: The max amount of bytes a block can be.
        - `max_gas`: The maximum amount of gas that a block can have.
        - `time_iota_ms`: This parameter has no value anymore in Tendermint-core.

- `evidence`
      - `max_age_num_blocks`: After this preset amount of blocks has passed a single piece of evidence is considered invalid
      - `max_age_duration`: After this preset amount of time has passed a single piece of evidence is considered invalid.
      - `max_bytes`: The max amount of bytes of all evidence included in a block.

> Note: For evidence to be considered invalid, evidence must be older than both `max_age_num_blocks` and `max_age_duration`

- `validator`
      - `pub_key_types`: Defines which curves are to be accepted as a valid validator consensus key. Tendermint supports ed25519, sr25519 and secp256k1.

- `version`
      - `app_version`: The version of the application. This is set by the application and is used to identify which version of the app a user should be using in order to operate a node.

- `validators`
    - This is an array of validators. This validator set is used as the starting validator set of the chain. This field can be empty, if the application sets the validator set in `InitChain`.
  
- `app_hash`: The applications state root hash. This field does not need to be populated at the start of the chain, the application may provide the needed information via `Initchain`.

- `app_state`: This section is filled in by the application and is unknown to Tendermint.
