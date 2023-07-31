# 轻客户端主管草案，供讨论

## 初始化的修改

轻客户端使用LCInitData进行初始化

### **[LC-DATA-INIT.2]**

```go
type LCInitData struct {
    TrustedBlock   LightBlock
    Genesis        GenesisDoc
    TrustedHash    []byte
    TrustedHeight  int64
}
```

其中只需要提供其中一个组件。`GenesisDoc`在[Tendermint
Types](https://github.com/tendermint/tendermint/blob/v0.34.x/types/genesis.go)中定义。

### 初始化

轻客户端基于主观初始化。它必须信任用户提供的初始数据。它目前无法检测攻击，因此需要一个初始的信任点。有三种形式的初始数据用于获取第一个可信任的区块：

- 从先前的初始化中获取的可信任区块
- 可信任的高度和哈希
- 创世文件

Golang轻客户端实现按照这个顺序检查初始数据；首先尝试从可信任存储中找到可信任区块，然后获取主节点上可信任高度和匹配哈希的轻区块，最后检查创世文件以验证初始头部。

轻客户端无需检查可信任区块是否在可信任期内，因为它已经信任它，但是如果轻区块超出了可信任期，轻客户端将无法验证任何内容的可能性更高。

在初始化时与提供者交叉检查这个可信任区块有助于确保节点响应并正确配置，但并不增加信任，因为证明一个冲突的区块是一个[轻客户端攻击](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/light-client/detection/detection_003_reviewed.md#tmbc-lc-attack1)，而不仅仅是一个[虚假的](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/light-client/detection/detection_003_reviewed.md#tmbc-bogus1)区块可能导致在可信任期之外执行向后验证，因此是徒劳的努力。

然而，考虑到宁愿早失败也不愿晚失败的观点，Golang轻客户端实现将对所有提供者执行一致性检查，如果其中一个返回不同的头部，则会报错，让用户有机会重新初始化。

#### **[LC-FUNC-INIT.2]:**

```go
func InitLightClient(initData LCInitData) (LightStore, Error) {
    var initialBlock LightBlock

    switch {
    case LCInitData.TrustedBlock != nil:
        // we trust the block from a prior initialization
        initialBlock = LCInitData.TrustedBlock

    case LCInitData.TrustedHash != nil:
        untrustedBlock := FetchLightBlock(PeerList.Primary(), LCInitData.TrustedHeight)
        

        // verify that the hashes match
        if untrustedBlock.Hash() != LCInitData.TrustedHash {
            return nil, Error("Primary returned block with different hash")
        }
        // after checking the hash we now trust the block
        initialBlock = untrustedBlock        
    }
    case LCInitData.Genesis != nil:
        untrustedBlock := FetchLightBlock(PeerList.Primary(), LCInitData.Genesis.InitialHeight)
        
        // verify that 2/3+ of the validator set signed the untrustedBlock
        if err := VerifyCommitFull(untrustedBlock.Commit, LCInitData.Genesis.Validators); err != nil {
            return nil, err
        }

        // we can now trust the block
        initialBlock = untrustedBlock
    default:
        return nil, Error("No initial data was provided")

    // This is done in the golang version but is optional and not strictly part of the protocol
    if err := CrossCheck(initialBlock, PeerList.Witnesses()); err != nil {
        return nil, err
    }

    // initialize light store
    lightStore := new LightStore;
    lightStore.Add(newBlock);
    return (lightStore, OK);
}

func CrossCheck(lb LightBlock, witnesses []Provider) error {
    for _, witness := range witnesses {
        witnessBlock := FetchLightBlock(witness, lb.Height)

        if witnessBlock.Hash() != lb.Hash() {
            return Error("Witness has different block")
        }
    }
    return OK
}

```

- 实现备注
    - 无
- 预期前置条件
    - *LCInitData* 包含创世文件或轻区块
    - 如果是创世文件，需要通过 `ValidateAndComplete()` 进行验证和补全，参见 [Tendermint](https://informal.systems)
- 预期后置条件
    - *lightStore* 使用可信的轻区块进行初始化。它可能已经通过交叉检查（来自创世文件）或者用户的初始信任进行了验证。
- 错误条件
    - 如果前置条件被违反
    - peerList 为空

----


# Draft of Light Client Supervisor for discussion

## Modification to the initialization

The lightclient is initialized with LCInitData

### **[LC-DATA-INIT.2]**

```go
type LCInitData struct {
    TrustedBlock   LightBlock
    Genesis        GenesisDoc
    TrustedHash    []byte
    TrustedHeight  int64
}
```

where only one of the components must be provided. `GenesisDoc` is
defined in the [Tendermint
Types](https://github.com/tendermint/tendermint/blob/v0.34.x/types/genesis.go).


### Initialization

The light client is based on subjective initialization. It has to
trust the initial data given to it by the user. It cannot perform any
detection of an attack yet instead requires an initial point of trust.
There are three forms of initial data which are used to obtain the 
first trusted block:

- A trusted block from a prior initialization
- A trusted height and hash
- A genesis file

The golang light client implementation checks this initial data in that
order; first attempting to find a trusted block from the trusted store,
then acquiring a light block from the primary at the trusted height and matching
the hash, or finally checking for a genesis file to verify the initial header.

The light client doesn't need to check if the trusted block is within the
trusted period because it already trusts it, however, if the light block is
outside the trust period, there is a higher chance the light client won't be
able to verify anything.

Cross-checking this trusted block with providers upon initialization is helpful
for ensuring that the node is responsive and correctly configured but does not
increase trust since proving a conflicting block is a
[light client attack](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/light-client/detection/detection_003_reviewed.md#tmbc-lc-attack1)
and not just a [bogus](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/light-client/detection/detection_003_reviewed.md#tmbc-bogus1) block could result in
performing backwards verification beyond the trusted period, thus a fruitless
endeavour.

However, with the notion of it's better to fail earlier than later, the golang
light client implementation will perform a consistency check on all providers
and will error if one returns a different header, allowing the user
the opportunity to reinitialize.

#### **[LC-FUNC-INIT.2]:**

```go
func InitLightClient(initData LCInitData) (LightStore, Error) {
    var initialBlock LightBlock

    switch {
    case LCInitData.TrustedBlock != nil:
        // we trust the block from a prior initialization
        initialBlock = LCInitData.TrustedBlock

    case LCInitData.TrustedHash != nil:
        untrustedBlock := FetchLightBlock(PeerList.Primary(), LCInitData.TrustedHeight)
        

        // verify that the hashes match
        if untrustedBlock.Hash() != LCInitData.TrustedHash {
            return nil, Error("Primary returned block with different hash")
        }
        // after checking the hash we now trust the block
        initialBlock = untrustedBlock        
    }
    case LCInitData.Genesis != nil:
        untrustedBlock := FetchLightBlock(PeerList.Primary(), LCInitData.Genesis.InitialHeight)
        
        // verify that 2/3+ of the validator set signed the untrustedBlock
        if err := VerifyCommitFull(untrustedBlock.Commit, LCInitData.Genesis.Validators); err != nil {
            return nil, err
        }

        // we can now trust the block
        initialBlock = untrustedBlock
    default:
        return nil, Error("No initial data was provided")

    // This is done in the golang version but is optional and not strictly part of the protocol
    if err := CrossCheck(initialBlock, PeerList.Witnesses()); err != nil {
        return nil, err
    }

    // initialize light store
    lightStore := new LightStore;
    lightStore.Add(newBlock);
    return (lightStore, OK);
}

func CrossCheck(lb LightBlock, witnesses []Provider) error {
    for _, witness := range witnesses {
        witnessBlock := FetchLightBlock(witness, lb.Height)

        if witnessBlock.Hash() != lb.Hash() {
            return Error("Witness has different block")
        }
    }
    return OK
}

```

- Implementation remark
    - none
- Expected precondition
    - *LCInitData* contains either a genesis file of a lightblock
    - if genesis it passes `ValidateAndComplete()` see [Tendermint](https://informal.systems)
- Expected postcondition
    - *lightStore* initialized with trusted lightblock. It has either been
      cross-checked (from genesis) or it has initial trust from the
      user.
- Error condition
    - if precondition is violated
    - empty peerList

----

