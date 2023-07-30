# ADR 038: KVStore状态监听

## 变更记录

* 2020年11月23日：初稿
* 2022年10月06日：基于hashicorp/go-plugin引入插件系统
* 2022年10月14日：
    * 添加`ListenCommit`，将状态写入块扁平化为单个批处理。
    * 从缓存存储中移除监听器，只应监听`rootmulti.Store`。
    * 移除`HaltAppOnDeliveryError()`，错误默认传播，实现应返回nil以防止错误传播。


## 状态

建议中

## 摘要

本ADR定义了一系列更改，以使得可以监听单个KVStore的状态变化，并将这些数据暴露给消费者。

## 背景

目前，可以通过[查询](https://github.com/cosmos/cosmos-sdk/blob/master/docs/building-modules/02-messages-and-queries.md#queries)远程访问KVStore数据，这些查询可以通过Tendermint和ABCI或gRPC服务器进行处理。除了这些请求/响应查询之外，实时监听状态变化将非常有益。

## 决策

我们将修改`CommitMultiStore`接口及其具体的(`rootmulti`)实现，并引入一个新的`listenkv.Store`，以允许监听底层KVStore的状态变化。我们不需要监听缓存存储，因为我们无法确定写入是否最终提交，并且写入最终会在`rootmulti.Store`中重复，所以我们只需要监听`rootmulti.Store`。
我们将引入一个插件系统，用于配置和运行将这些状态变化及其周围的ABCI消息上下文写入不同目标的流式服务。

### 监听

在一个新文件`store/types/listening.go`中，我们将创建一个`MemoryListener`结构体，用于从KVStore中流出经过protobuf编码的KV对状态变化。`MemoryListener`将在具体的`rootmulti`实现中内部使用，以收集来自KVStore的状态变化。

```go
// MemoryListener listens to the state writes and accumulate the records in memory.
type MemoryListener struct {
	stateCache []StoreKVPair
}

// NewMemoryListener creates a listener that accumulate the state writes in memory.
func NewMemoryListener() *MemoryListener {
	return &MemoryListener{}
}

// OnWrite writes state change events to the internal cache
func (fl *MemoryListener) OnWrite(storeKey StoreKey, key []byte, value []byte, delete bool) {
	fl.stateCache = append(fl.stateCache, StoreKVPair{
		StoreKey: storeKey.Name(),
		Delete:   delete,
		Key:      key,
		Value:    value,
	})
}

// PopStateCache returns the current state caches and set to nil
func (fl *MemoryListener) PopStateCache() []StoreKVPair {
	res := fl.stateCache
	fl.stateCache = nil
	return res
}
```

我们还将定义一个用于KV对的protobuf类型。除了键和值字段外，此消息还将包括源KVStore的StoreKey，以便我们可以从不同的KVStore中收集信息并确定每个KV对的来源。

```protobuf
message StoreKVPair {
  optional string store_key = 1; // the store key for the KVStore this pair originates from
  required bool set = 2; // true indicates a set operation, false indicates a delete operation
  required bytes key = 3;
  required bytes value = 4;
}
```

### ListenKVStore

我们将创建一个新的`Store`类型`listenkv.Store`，`rootmulti`存储将使用它来包装一个`KVStore`以实现状态监听。
我们将使用`MemoryListener`配置`Store`，它将收集状态变化并输出到特定的目标。

```go
// Store implements the KVStore interface with listening enabled.
// Operations are traced on each advanced-concepts KVStore call and written to any of the
// underlying listeners with the proper key and operation permissions
type Store struct {
    parent    types.KVStore
    listener  *types.MemoryListener
    parentStoreKey types.StoreKey
}

// NewStore returns a reference to a new traceKVStore given a parent
// KVStore implementation and a buffered writer.
func NewStore(parent types.KVStore, psk types.StoreKey, listener *types.MemoryListener) *Store {
    return &Store{parent: parent, listener: listener, parentStoreKey: psk}
}

// Set implements the KVStore interface. It traces a write operation and
// delegates the Set call to the parent KVStore.
func (s *Store) Set(key []byte, value []byte) {
    types.AssertValidKey(key)
    s.parent.Set(key, value)
    s.listener.OnWrite(s.parentStoreKey, key, value, false)
}

// Delete implements the KVStore interface. It traces a write operation and
// delegates the Delete call to the parent KVStore.
func (s *Store) Delete(key []byte) {
    s.parent.Delete(key)
    s.listener.OnWrite(s.parentStoreKey, key, nil, true)
}
```

### MultiStore接口更新

我们将更新`CommitMultiStore`接口，以允许我们将`MemoryListener`包装到特定的`KVStore`中。
请注意，`MemoryListener`将由具体的`rootmulti`实现内部附加。

```go
type CommitMultiStore interface {
    ...

    // AddListeners adds a listener for the KVStore belonging to the provided StoreKey
    AddListeners(keys []StoreKey)

    // PopStateCache returns the accumulated state change messages from MemoryListener
    PopStateCache() []StoreKVPair
}
```


### MultiStore实现更新

我们将调整`rootmulti`的`GetKVStore`方法，如果该`Store`开启了监听功能，将使用`listenkv.Store`包装返回的`KVStore`。

```go
func (rs *Store) GetKVStore(key types.StoreKey) types.KVStore {
    store := rs.stores[key].(types.KVStore)

    if rs.TracingEnabled() {
        store = tracekv.NewStore(store, rs.traceWriter, rs.traceContext)
    }
    if rs.ListeningEnabled(key) {
        store = listenkv.NewStore(store, key, rs.listeners[key])
    }

    return store
}
```

我们将实现`AddListeners`来在内部管理KVStore监听器，并实现`PopStateCache`以获取当前状态的方法。

```go
// AddListeners adds state change listener for a specific KVStore
func (rs *Store) AddListeners(keys []types.StoreKey) {
	listener := types.NewMemoryListener()
	for i := range keys {
		rs.listeners[keys[i]] = listener
	}
}
```

```go
func (rs *Store) PopStateCache() []types.StoreKVPair {
	var cache []types.StoreKVPair
	for _, ls := range rs.listeners {
		cache = append(cache, ls.PopStateCache()...)
	}
	sort.SliceStable(cache, func(i, j int) bool {
		return cache[i].StoreKey < cache[j].StoreKey
	})
	return cache
}
```

我们还将调整`rootmulti`的`CacheMultiStore`和`CacheMultiStoreWithVersion`方法，以在缓存层启用监听功能。

```go
func (rs *Store) CacheMultiStore() types.CacheMultiStore {
    stores := make(map[types.StoreKey]types.CacheWrapper)
    for k, v := range rs.stores {
        store := v.(types.KVStore)
        // Wire the listenkv.Store to allow listeners to observe the writes from the cache store,
        // set same listeners on cache store will observe duplicated writes.
        if rs.ListeningEnabled(k) {
            store = listenkv.NewStore(store, k, rs.listeners[k])
        }
        stores[k] = store
    }
    return cachemulti.NewStore(rs.db, stores, rs.keysByName, rs.traceWriter, rs.getTracingContext())
}
```

```go
func (rs *Store) CacheMultiStoreWithVersion(version int64) (types.CacheMultiStore, error) {
 // ...

        // Wire the listenkv.Store to allow listeners to observe the writes from the cache store,
        // set same listeners on cache store will observe duplicated writes.
        if rs.ListeningEnabled(key) {
            cacheStore = listenkv.NewStore(cacheStore, key, rs.listeners[key])
        }

        cachedStores[key] = cacheStore
    }

    return cachemulti.NewStore(rs.db, cachedStores, rs.keysByName, rs.traceWriter, rs.getTracingContext()), nil
}
```

### 数据暴露

#### 流式服务

我们将引入一个新的`ABCIListener`接口，它插入到BaseApp中并传递ABCI请求和响应，以便服务可以将状态变化与ABCI请求分组。

```go
// baseapp/streaming.go

// ABCIListener is the interface that we're exposing as a streaming service.
type ABCIListener interface {
    // ListenBeginBlock updates the streaming service with the latest BeginBlock messages
    ListenBeginBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error
    // ListenEndBlock updates the steaming service with the latest EndBlock messages
    ListenEndBlock(ctx types.Context, req abci.RequestEndBlock, res abci.ResponseEndBlock) error
    // ListenDeliverTx updates the steaming service with the latest DeliverTx messages
    ListenDeliverTx(ctx context.Context, req abci.RequestDeliverTx, res abci.ResponseDeliverTx) error
    // ListenCommit updates the steaming service with the latest Commit messages and state changes
    ListenCommit(ctx context.Context, res abci.ResponseCommit, changeSet []*store.StoreKVPair) error
}
```

#### BaseApp注册

我们将在`BaseApp`中添加一个新的方法，以启用`StreamingService`的注册：

```go
 // SetStreamingService is used to set a streaming service into the BaseApp hooks and load the listeners into the multistore
func (app *BaseApp) SetStreamingService(s ABCIListener) {
    // register the StreamingService within the BaseApp
    // BaseApp will pass BeginBlock, DeliverTx, and EndBlock requests and responses to the streaming services to update their ABCI context
    app.abciListeners = append(app.abciListeners, s)
}
```

我们将在`BaseApp`结构体中添加两个新字段：

```go
type BaseApp struct {

    ...

    // abciListenersAsync for determining if abciListeners will run asynchronously.
    // When abciListenersAsync=false and stopNodeOnABCIListenerErr=false listeners will run synchronized but will not stop the node.
    // When abciListenersAsync=true stopNodeOnABCIListenerErr will be ignored.
    abciListenersAsync bool

    // stopNodeOnABCIListenerErr halts the node when ABCI streaming service listening results in an error.
    // stopNodeOnABCIListenerErr=true must be paired with abciListenersAsync=false.
    stopNodeOnABCIListenerErr bool
}
```

#### ABCI事件钩子

我们将修改`BeginBlock`、`EndBlock`、`DeliverTx`和`Commit`方法，将ABCI请求和响应传递给与`BaseApp`注册的任何流式服务钩子。

```go
func (app *BaseApp) BeginBlock(req abci.RequestBeginBlock) (res abci.ResponseBeginBlock) {

    ...

    // call the streaming service hook with the BeginBlock messages
    for _, abciListener := range app.abciListeners {
        ctx := app.deliverState.ctx
        blockHeight := ctx.BlockHeight()
        if app.abciListenersAsync {
            go func(req abci.RequestBeginBlock, res abci.ResponseBeginBlock) {
                if err := app.abciListener.ListenBeginBlock(ctx, req, res); err != nil {
                    app.logger.Error("BeginBlock listening hook failed", "height", blockHeight, "err", err)
                }
            }(req, res)
        } else {
            if err := app.abciListener.ListenBeginBlock(ctx, req, res); err != nil {
                app.logger.Error("BeginBlock listening hook failed", "height", blockHeight, "err", err)
                if app.stopNodeOnABCIListenerErr {
                    os.Exit(1)
                }
            }
        }
    }

    return res
}
```

```go
func (app *BaseApp) EndBlock(req abci.RequestEndBlock) (res abci.ResponseEndBlock) {

    ...

    // call the streaming service hook with the EndBlock messages
    for _, abciListener := range app.abciListeners {
        ctx := app.deliverState.ctx
        blockHeight := ctx.BlockHeight()
        if app.abciListenersAsync {
            go func(req abci.RequestEndBlock, res abci.ResponseEndBlock) {
                if err := app.abciListener.ListenEndBlock(blockHeight, req, res); err != nil {
                    app.logger.Error("EndBlock listening hook failed", "height", blockHeight, "err", err)
                }
            }(req, res)
        } else {
            if err := app.abciListener.ListenEndBlock(blockHeight, req, res); err != nil {
                app.logger.Error("EndBlock listening hook failed", "height", blockHeight, "err", err)
                if app.stopNodeOnABCIListenerErr {
                    os.Exit(1)
                }
            }
        }
    }

    return res
}
```

```go
func (app *BaseApp) DeliverTx(req abci.RequestDeliverTx) abci.ResponseDeliverTx {

    var abciRes abci.ResponseDeliverTx
    defer func() {
        // call the streaming service hook with the EndBlock messages
        for _, abciListener := range app.abciListeners {
            ctx := app.deliverState.ctx
            blockHeight := ctx.BlockHeight()
            if app.abciListenersAsync {
                go func(req abci.RequestDeliverTx, res abci.ResponseDeliverTx) {
                    if err := app.abciListener.ListenDeliverTx(blockHeight, req, res); err != nil {
                        app.logger.Error("DeliverTx listening hook failed", "height", blockHeight, "err", err)
                    }
                }(req, abciRes)
            } else {
                if err := app.abciListener.ListenDeliverTx(blockHeight, req, res); err != nil {
                    app.logger.Error("DeliverTx listening hook failed", "height", blockHeight, "err", err)
                    if app.stopNodeOnABCIListenerErr {
                        os.Exit(1)
                    }
                }
            }
        }
    }()

    ...

    return abciRes
}
```

```go
func (app *BaseApp) Commit() abci.ResponseCommit {

    ...

    res := abci.ResponseCommit{
        Data:         commitID.Hash,
        RetainHeight: retainHeight,
    }

    // call the streaming service hook with the Commit messages
    for _, abciListener := range app.abciListeners {
        ctx := app.deliverState.ctx
        blockHeight := ctx.BlockHeight()
        changeSet := app.cms.PopStateCache()
        if app.abciListenersAsync {
            go func(res abci.ResponseCommit, changeSet []store.StoreKVPair) {
                if err := app.abciListener.ListenCommit(ctx, res, changeSet); err != nil {
                    app.logger.Error("ListenCommit listening hook failed", "height", blockHeight, "err", err)
                }
            }(res, changeSet)
        } else {
            if err := app.abciListener.ListenCommit(ctx, res, changeSet); err != nil {
                app.logger.Error("ListenCommit listening hook failed", "height", blockHeight, "err", err)
                if app.stopNodeOnABCIListenerErr {
                    os.Exit(1)
                }
            }
        }
    }

    ...

    return res
}
```

#### Go插件系统

我们提出了一个插件架构，用于加载和运行`Streaming`插件和其他类型的实现。我们将引入一个基于gRPC的插件系统，用于加载和运行Cosmos-SDK插件。该插件系统使用[hashicorp/go-plugin](https://github.com/hashicorp/go-plugin)。每个插件必须有一个实现`plugin.Plugin`接口的结构体和一个用于通过gRPC处理消息的`Impl`接口。每个插件还必须有一个为gRPC服务定义的消息协议：

```go
// streaming/plugins/abci/{plugin_version}/interface.go

// Handshake is a common handshake that is shared by streaming and host.
// This prevents users from executing bad plugins or executing a plugin
// directory. It is a UX feature, not a security feature.
var Handshake = plugin.HandshakeConfig{
    ProtocolVersion:  1,
    MagicCookieKey:   "ABCI_LISTENER_PLUGIN",
    MagicCookieValue: "ef78114d-7bdf-411c-868f-347c99a78345",
}

// ListenerPlugin is the base struc for all kinds of go-plugin implementations
// It will be included in interfaces of different Plugins
type ABCIListenerPlugin struct {
    // GRPCPlugin must still implement the Plugin interface
    plugin.Plugin
    // Concrete implementation, written in Go. This is only used for plugins
    // that are written in Go.
    Impl baseapp.ABCIListener
}

func (p *ListenerGRPCPlugin) GRPCServer(_ *plugin.GRPCBroker, s *grpc.Server) error {
    RegisterABCIListenerServiceServer(s, &GRPCServer{Impl: p.Impl})
    return nil
}

func (p *ListenerGRPCPlugin) GRPCClient(
    _ context.Context,
    _ *plugin.GRPCBroker,
    c *grpc.ClientConn,
) (interface{}, error) {
    return &GRPCClient{client: NewABCIListenerServiceClient(c)}, nil
}
```

`plugin.Plugin`接口有两个方法`Client`和`Server`。对于我们的GRPC服务，它们分别是`GRPCClient`和`GRPCServer`。
`Impl`字段保存了我们在Go中编写的`baseapp.ABCIListener`接口的具体实现。
注意：这仅用于使用Go编写的插件实现。

拥有这样的插件系统的优势在于，插件作者可以在每个插件中以适应其用例的方式定义消息协议。
例如，当需要状态变化监听时，`ABCIListener`消息协议可以定义如下（仅供示例）。
当不需要状态变化监听时，可以从协议中省略`ListenCommit`。

```protobuf
syntax = "proto3";

...

message Empty {}

message ListenBeginBlockRequest {
  RequestBeginBlock  req = 1;
  ResponseBeginBlock res = 2;
}
message ListenEndBlockRequest {
  RequestEndBlock  req = 1;
  ResponseEndBlock res = 2;
}
message ListenDeliverTxRequest {
  int64             block_height = 1;
  RequestDeliverTx  req          = 2;
  ResponseDeliverTx res          = 3;
}
message ListenCommitRequest {
  int64                block_height = 1;
  ResponseCommit       res          = 2;
  repeated StoreKVPair changeSet    = 3;
}

// plugin that listens to state changes
service ABCIListenerService {
  rpc ListenBeginBlock(ListenBeginBlockRequest) returns (Empty);
  rpc ListenEndBlock(ListenEndBlockRequest) returns (Empty);
  rpc ListenDeliverTx(ListenDeliverTxRequest) returns (Empty);
  rpc ListenCommit(ListenCommitRequest) returns (Empty);
}
```

```protobuf
...
// plugin that doesn't listen to state changes
service ABCIListenerService {
  rpc ListenBeginBlock(ListenBeginBlockRequest) returns (Empty);
  rpc ListenEndBlock(ListenEndBlockRequest) returns (Empty);
  rpc ListenDeliverTx(ListenDeliverTxRequest) returns (Empty);
  rpc ListenCommit(ListenCommitRequest) returns (Empty);
}
```

实现上述服务：

```go
// streaming/plugins/abci/{plugin_version}/grpc.go

var (
    _ baseapp.ABCIListener = (*GRPCClient)(nil)
)

// GRPCClient is an implementation of the ABCIListener and ABCIListenerPlugin interfaces that talks over RPC.
type GRPCClient struct {
    client ABCIListenerServiceClient
}

func (m *GRPCClient) ListenBeginBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error {
    _, err := m.client.ListenBeginBlock(ctx, &ListenBeginBlockRequest{Req: req, Res: res})
    return err
}

func (m *GRPCClient) ListenEndBlock(goCtx context.Context, req abci.RequestEndBlock, res abci.ResponseEndBlock) error {
    _, err := m.client.ListenEndBlock(ctx, &ListenEndBlockRequest{Req: req, Res: res})
    return err
}

func (m *GRPCClient) ListenDeliverTx(goCtx context.Context, req abci.RequestDeliverTx, res abci.ResponseDeliverTx) error {
    ctx := sdk.UnwrapSDKContext(goCtx)
    _, err := m.client.ListenDeliverTx(ctx, &ListenDeliverTxRequest{BlockHeight: ctx.BlockHeight(), Req: req, Res: res})
    return err
}

func (m *GRPCClient) ListenCommit(goCtx context.Context, res abci.ResponseCommit, changeSet []store.StoreKVPair) error {
    ctx := sdk.UnwrapSDKContext(goCtx)
    _, err := m.client.ListenCommit(ctx, &ListenCommitRequest{BlockHeight: ctx.BlockHeight(), Res: res, ChangeSet: changeSet})
    return err
}

// GRPCServer is the gRPC server that GRPCClient talks to.
type GRPCServer struct {
    // This is the real implementation
    Impl baseapp.ABCIListener
}

func (m *GRPCServer) ListenBeginBlock(ctx context.Context, req *ListenBeginBlockRequest) (*Empty, error) {
    return &Empty{}, m.Impl.ListenBeginBlock(ctx, req.Req, req.Res)
}

func (m *GRPCServer) ListenEndBlock(ctx context.Context, req *ListenEndBlockRequest) (*Empty, error) {
    return &Empty{}, m.Impl.ListenEndBlock(ctx, req.Req, req.Res)
}

func (m *GRPCServer) ListenDeliverTx(ctx context.Context, req *ListenDeliverTxRequest) (*Empty, error) {
    return &Empty{}, m.Impl.ListenDeliverTx(ctx, req.Req, req.Res)
}

func (m *GRPCServer) ListenCommit(ctx context.Context, req *ListenCommitRequest) (*Empty, error) {
    return &Empty{}, m.Impl.ListenCommit(ctx, req.Res, req.ChangeSet)
}

```

以及预编译的Go插件`Impl`（仅用于使用Go编写的插件）：

```go
// streaming/plugins/abci/{plugin_version}/impl/plugin.go

// Plugins are pre-compiled and loaded by the plugin system

// ABCIListener is the implementation of the baseapp.ABCIListener interface
type ABCIListener struct{}

func (m *ABCIListenerPlugin) ListenBeginBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error {
    // send data to external system
}

func (m *ABCIListenerPlugin) ListenEndBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error {
    // send data to external system
}

func (m *ABCIListenerPlugin) ListenDeliverTxBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error {
    // send data to external system
}

func (m *ABCIListenerPlugin) ListenCommit(ctx context.Context, res abci.ResponseCommit, changeSet []store.StoreKVPair) error {
    // send data to external system
}

func main() {
    plugin.Serve(&plugin.ServeConfig{
        HandshakeConfig: grpc_abci_v1.Handshake,
        Plugins: map[string]plugin.Plugin{
           "grpc_plugin_v1": &grpc_abci_v1.ABCIListenerGRPCPlugin{Impl: &ABCIListenerPlugin{}},
        },

        // A non-nil value here enables gRPC serving for this streaming...
        GRPCServer: plugin.DefaultGRPCServer,
    })
}
```

我们将引入一个插件加载系统，它将返回`(interface{}, error)`。
这样做的好处是可以使用版本化的插件，其中插件接口和gRPC协议随时间变化。
此外，它允许构建独立的插件，可以通过gRPC公开系统的不同部分。

```go
func NewStreamingPlugin(name string, logLevel string) (interface{}, error) {
    logger := hclog.New(&hclog.LoggerOptions{
       Output: hclog.DefaultOutput,
       Level:  toHclogLevel(logLevel),
       Name:   fmt.Sprintf("plugin.%s", name),
    })

    // We're a host. Start by launching the streaming process.
    env := os.Getenv(GetPluginEnvKey(name))
    client := plugin.NewClient(&plugin.ClientConfig{
       HandshakeConfig: HandshakeMap[name],
       Plugins:         PluginMap,
       Cmd:             exec.Command("sh", "-c", env),
       Logger:          logger,
       AllowedProtocols: []plugin.Protocol{
           plugin.ProtocolNetRPC, plugin.ProtocolGRPC},
    })

    // Connect via RPC
    rpcClient, err := client.Client()
    if err != nil {
       return nil, err
    }

    // Request streaming plugin
    return rpcClient.Dispense(name)
}

```

我们提出了一个`RegisterStreamingPlugin`函数，用于App向App的BaseApp注册`NewStreamingPlugin`。
流式插件可以是`Any`类型；因此，该函数接受一个接口而不是具体类型。
例如，我们可以有`ABCIListener`、`WasmListener`或`IBCListener`的插件。请注意，`RegisterStreamingPluing`函数是辅助函数，而不是必需的。插件注册可以轻松地从App直接移动到BaseApp。

```go
// baseapp/streaming.go

// RegisterStreamingPlugin registers streaming plugins with the App.
// This method returns an error if a plugin is not supported.
func RegisterStreamingPlugin(
    bApp *BaseApp,
    appOpts servertypes.AppOptions,
    keys map[string]*types.KVStoreKey,
    streamingPlugin interface{},
) error {
    switch t := streamingPlugin.(type) {
    case ABCIListener:
        registerABCIListenerPlugin(bApp, appOpts, keys, t)
    default:
        return fmt.Errorf("unexpected plugin type %T", t)
    }
    return nil
}
```

```go
func registerABCIListenerPlugin(
    bApp *BaseApp,
    appOpts servertypes.AppOptions,
    keys map[string]*store.KVStoreKey,
    abciListener ABCIListener,
) {
    asyncKey := fmt.Sprintf("%s.%s.%s", StreamingTomlKey, StreamingABCITomlKey, StreamingABCIAsync)
    async := cast.ToBool(appOpts.Get(asyncKey))
    stopNodeOnErrKey := fmt.Sprintf("%s.%s.%s", StreamingTomlKey, StreamingABCITomlKey, StreamingABCIStopNodeOnErrTomlKey)
    stopNodeOnErr := cast.ToBool(appOpts.Get(stopNodeOnErrKey))
    keysKey := fmt.Sprintf("%s.%s.%s", StreamingTomlKey, StreamingABCITomlKey, StreamingABCIKeysTomlKey)
    exposeKeysStr := cast.ToStringSlice(appOpts.Get(keysKey))
    exposedKeys := exposeStoreKeysSorted(exposeKeysStr, keys)
    bApp.cms.AddListeners(exposedKeys)
    bApp.SetStreamingService(abciListener)
    bApp.stopNodeOnABCIListenerErr = stopNodeOnErr
    bApp.abciListenersAsync = async
}
```

```go
func exposeAll(list []string) bool {
    for _, ele := range list {
        if ele == "*" {
            return true
        }
    }
    return false
}

func exposeStoreKeys(keysStr []string, keys map[string]*types.KVStoreKey) []types.StoreKey {
    var exposeStoreKeys []types.StoreKey
    if exposeAll(keysStr) {
        exposeStoreKeys = make([]types.StoreKey, 0, len(keys))
        for _, storeKey := range keys {
            exposeStoreKeys = append(exposeStoreKeys, storeKey)
        }
    } else {
        exposeStoreKeys = make([]types.StoreKey, 0, len(keysStr))
        for _, keyStr := range keysStr {
            if storeKey, ok := keys[keyStr]; ok {
                exposeStoreKeys = append(exposeStoreKeys, storeKey)
            }
        }
    }
    // sort storeKeys for deterministic output
    sort.SliceStable(exposeStoreKeys, func(i, j int) bool {
        return exposeStoreKeys[i].Name() < exposeStoreKeys[j].Name()
    })

    return exposeStoreKeys
}
```

`NewStreamingPlugin`和`RegisterStreamingPlugin`函数用于向App的BaseApp注册插件。

例如，在`NewSimApp`中：

```go
func NewSimApp(
    logger log.Logger,
    db dbm.DB,
    traceStore io.Writer,
    loadLatest bool,
    appOpts servertypes.AppOptions,
    baseAppOptions ...func(*baseapp.BaseApp),
) *SimApp {

    ...

    keys := sdk.NewKVStoreKeys(
       authtypes.StoreKey, banktypes.StoreKey, stakingtypes.StoreKey,
       minttypes.StoreKey, distrtypes.StoreKey, slashingtypes.StoreKey,
       govtypes.StoreKey, paramstypes.StoreKey, ibchost.StoreKey, upgradetypes.StoreKey,
       evidencetypes.StoreKey, ibctransfertypes.StoreKey, capabilitytypes.StoreKey,
    )

    ...

    // register streaming services
    streamingCfg := cast.ToStringMap(appOpts.Get(baseapp.StreamingTomlKey))
    for service := range streamingCfg {
        pluginKey := fmt.Sprintf("%s.%s.%s", baseapp.StreamingTomlKey, service, baseapp.StreamingPluginTomlKey)
        pluginName := strings.TrimSpace(cast.ToString(appOpts.Get(pluginKey)))
        if len(pluginName) > 0 {
            logLevel := cast.ToString(appOpts.Get(flags.FlagLogLevel))
            plugin, err := streaming.NewStreamingPlugin(pluginName, logLevel)
            if err != nil {
                tmos.Exit(err.Error())
            }
            if err := baseapp.RegisterStreamingPlugin(bApp, appOpts, keys, plugin); err != nil {
                tmos.Exit(err.Error())
            }
        }
    }

    return app
```

#### 配置

插件系统将在App的TOML配置文件中进行配置。

```toml
# gRPC streaming
[streaming]

# ABCI streaming service
[streaming.abci]

# The plugin version to use for ABCI listening
plugin = "abci_v1"

# List of kv store keys to listen to for state changes.
# Set to ["*"] to expose all keys.
keys = ["*"]

# Enable abciListeners to run asynchronously.
# When abciListenersAsync=false and stopNodeOnABCIListenerErr=false listeners will run synchronized but will not stop the node.
# When abciListenersAsync=true stopNodeOnABCIListenerErr will be ignored.
async = false

# Whether to stop the node on message deliver error.
stop-node-on-err = true
```

配置`ABCIListener`插件有四个参数：`streaming.abci.plugin`、`streaming.abci.keys`、`streaming.abci.async`和`streaming.abci.stop-node-on-err`。
`streaming.abci.plugin`是我们要用于流式处理的插件的名称，`streaming.abci.keys`是它监听的存储的一组键，
`streaming.abci.async`是一个布尔值，用于启用异步监听，`streaming.abci.stop-node-on-err`是一个布尔值，当为true时停止节点，当操作在同步模式下时`streaming.abci.async=false`。请注意，如果`streaming.abci.async=true`，则`streaming.abci.stop-node-on-err=true`将被忽略。

上述配置通过将插件添加到`[streaming]`配置部分并使用`RegisterStreamingPlugin`辅助函数注册插件来支持其他流式插件。

请注意，每个插件必须包含`streaming.{service}.plugin`属性，因为它是查找并注册插件到App所需的。
所有其他属性都是特定于各个服务的。

#### 流的编码和解码

ADR-038引入了从KVStores中流式传输状态更改的接口和类型，将这些数据与相关的ABCI请求和响应关联起来，并注册一个服务来消费这些数据并将其流式传输到最终格式的某个目标。
在这个ADR中，没有规定最终数据格式，而是由特定的插件实现来定义和记录这个格式。
我们采用这种方法是因为灵活性对于支持各种流式服务插件是必要的。例如，将数据写入一组文件的流式服务的数据格式将与写入Kafka主题的数据格式不同。

## 结果

这些更改将提供一种实时订阅KVStore状态更改的方法。

### 向后兼容性

* 这个ADR改变了`CommitMultiStore`接口，支持之前版本的实现将不支持新版本

### 积极影响

* 能够实时监听KVStore状态更改并将这些事件暴露给外部消费者

### 负面影响

* 更改了`CommitMultiStore`接口及其实现

### 中性影响

* 引入了额外的（但可选的）复杂性来配置和运行cosmos应用程序
* 如果应用程序开发人员选择使用这些功能来暴露数据，则需要意识到与其应用程序的具体情况相关的数据暴露的影响/风险


# ADR 038: KVStore state listening

## Changelog

* 11/23/2020: Initial draft
* 10/06/2022: Introduce plugin system based on hashicorp/go-plugin
* 10/14/2022:
    * Add `ListenCommit`, flatten the state writes in a block to a single batch.
    * Remove listeners from cache stores, should only listen to `rootmulti.Store`.
    * Remove `HaltAppOnDeliveryError()`, the errors are propagated by default, the implementations should return nil if don't want to propogate errors.


## Status

Proposed

## Abstract

This ADR defines a set of changes to enable listening to state changes of individual KVStores and exposing these data to consumers.

## Context

Currently, KVStore data can be remotely accessed through [Queries](https://github.com/cosmos/cosmos-sdk/blob/master/docs/building-modules/02-messages-and-queries.md#queries)
which proceed either through Tendermint and the ABCI, or through the gRPC server.
In addition to these request/response queries, it would be beneficial to have a means of listening to state changes as they occur in real time.

## Decision

We will modify the `CommitMultiStore` interface and its concrete (`rootmulti`) implementations and introduce a new `listenkv.Store` to allow listening to state changes in underlying KVStores. We don't need to listen to cache stores, because we can't be sure that the writes will be committed eventually, and the writes are duplicated in `rootmulti.Store` eventually, so we should only listen to `rootmulti.Store`.
We will introduce a plugin system for configuring and running streaming services that write these state changes and their surrounding ABCI message context to different destinations.

### Listening

In a new file, `store/types/listening.go`, we will create a `MemoryListener` struct for streaming out protobuf encoded KV pairs state changes from a KVStore.
The `MemoryListener` will be used internally by the concrete `rootmulti` implementation to collect state changes from KVStores.

```go
// MemoryListener listens to the state writes and accumulate the records in memory.
type MemoryListener struct {
	stateCache []StoreKVPair
}

// NewMemoryListener creates a listener that accumulate the state writes in memory.
func NewMemoryListener() *MemoryListener {
	return &MemoryListener{}
}

// OnWrite writes state change events to the internal cache
func (fl *MemoryListener) OnWrite(storeKey StoreKey, key []byte, value []byte, delete bool) {
	fl.stateCache = append(fl.stateCache, StoreKVPair{
		StoreKey: storeKey.Name(),
		Delete:   delete,
		Key:      key,
		Value:    value,
	})
}

// PopStateCache returns the current state caches and set to nil
func (fl *MemoryListener) PopStateCache() []StoreKVPair {
	res := fl.stateCache
	fl.stateCache = nil
	return res
}
```

We will also define a protobuf type for the KV pairs. In addition to the key and value fields this message
will include the StoreKey for the originating KVStore so that we can collect information from separate KVStores and determine the source of each KV pair.

```protobuf
message StoreKVPair {
  optional string store_key = 1; // the store key for the KVStore this pair originates from
  required bool set = 2; // true indicates a set operation, false indicates a delete operation
  required bytes key = 3;
  required bytes value = 4;
}
```

### ListenKVStore

We will create a new `Store` type `listenkv.Store` that the `rootmulti` store will use to wrap a `KVStore` to enable state listening.
We will configure the `Store` with a `MemoryListener` which will collect state changes for output to specific destinations.

```go
// Store implements the KVStore interface with listening enabled.
// Operations are traced on each advanced-concepts KVStore call and written to any of the
// underlying listeners with the proper key and operation permissions
type Store struct {
    parent    types.KVStore
    listener  *types.MemoryListener
    parentStoreKey types.StoreKey
}

// NewStore returns a reference to a new traceKVStore given a parent
// KVStore implementation and a buffered writer.
func NewStore(parent types.KVStore, psk types.StoreKey, listener *types.MemoryListener) *Store {
    return &Store{parent: parent, listener: listener, parentStoreKey: psk}
}

// Set implements the KVStore interface. It traces a write operation and
// delegates the Set call to the parent KVStore.
func (s *Store) Set(key []byte, value []byte) {
    types.AssertValidKey(key)
    s.parent.Set(key, value)
    s.listener.OnWrite(s.parentStoreKey, key, value, false)
}

// Delete implements the KVStore interface. It traces a write operation and
// delegates the Delete call to the parent KVStore.
func (s *Store) Delete(key []byte) {
    s.parent.Delete(key)
    s.listener.OnWrite(s.parentStoreKey, key, nil, true)
}
```

### MultiStore interface updates

We will update the `CommitMultiStore` interface to allow us to wrap a `Memorylistener` to a specific `KVStore`.
Note that the `MemoryListener` will be attached internally by the concrete `rootmulti` implementation.

```go
type CommitMultiStore interface {
    ...

    // AddListeners adds a listener for the KVStore belonging to the provided StoreKey
    AddListeners(keys []StoreKey)

    // PopStateCache returns the accumulated state change messages from MemoryListener
    PopStateCache() []StoreKVPair
}
```


### MultiStore implementation updates

We will adjust the `rootmulti` `GetKVStore` method to wrap the returned `KVStore` with a `listenkv.Store` if listening is turned on for that `Store`.

```go
func (rs *Store) GetKVStore(key types.StoreKey) types.KVStore {
    store := rs.stores[key].(types.KVStore)

    if rs.TracingEnabled() {
        store = tracekv.NewStore(store, rs.traceWriter, rs.traceContext)
    }
    if rs.ListeningEnabled(key) {
        store = listenkv.NewStore(store, key, rs.listeners[key])
    }

    return store
}
```

We will implement `AddListeners` to manage KVStore listeners internally and implement `PopStateCache`
for a means of retrieving the current state.

```go
// AddListeners adds state change listener for a specific KVStore
func (rs *Store) AddListeners(keys []types.StoreKey) {
	listener := types.NewMemoryListener()
	for i := range keys {
		rs.listeners[keys[i]] = listener
	}
}
```

```go
func (rs *Store) PopStateCache() []types.StoreKVPair {
	var cache []types.StoreKVPair
	for _, ls := range rs.listeners {
		cache = append(cache, ls.PopStateCache()...)
	}
	sort.SliceStable(cache, func(i, j int) bool {
		return cache[i].StoreKey < cache[j].StoreKey
	})
	return cache
}
```

We will also adjust the `rootmulti` `CacheMultiStore` and `CacheMultiStoreWithVersion` methods to enable listening in
the cache layer.

```go
func (rs *Store) CacheMultiStore() types.CacheMultiStore {
    stores := make(map[types.StoreKey]types.CacheWrapper)
    for k, v := range rs.stores {
        store := v.(types.KVStore)
        // Wire the listenkv.Store to allow listeners to observe the writes from the cache store,
        // set same listeners on cache store will observe duplicated writes.
        if rs.ListeningEnabled(k) {
            store = listenkv.NewStore(store, k, rs.listeners[k])
        }
        stores[k] = store
    }
    return cachemulti.NewStore(rs.db, stores, rs.keysByName, rs.traceWriter, rs.getTracingContext())
}
```

```go
func (rs *Store) CacheMultiStoreWithVersion(version int64) (types.CacheMultiStore, error) {
 // ...

        // Wire the listenkv.Store to allow listeners to observe the writes from the cache store,
        // set same listeners on cache store will observe duplicated writes.
        if rs.ListeningEnabled(key) {
            cacheStore = listenkv.NewStore(cacheStore, key, rs.listeners[key])
        }

        cachedStores[key] = cacheStore
    }

    return cachemulti.NewStore(rs.db, cachedStores, rs.keysByName, rs.traceWriter, rs.getTracingContext()), nil
}
```

### Exposing the data

#### Streaming Service

We will introduce a new `ABCIListener` interface that plugs into the BaseApp and relays ABCI requests and responses
so that the service can group the state changes with the ABCI requests.

```go
// baseapp/streaming.go

// ABCIListener is the interface that we're exposing as a streaming service.
type ABCIListener interface {
    // ListenBeginBlock updates the streaming service with the latest BeginBlock messages
    ListenBeginBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error
    // ListenEndBlock updates the steaming service with the latest EndBlock messages
    ListenEndBlock(ctx types.Context, req abci.RequestEndBlock, res abci.ResponseEndBlock) error
    // ListenDeliverTx updates the steaming service with the latest DeliverTx messages
    ListenDeliverTx(ctx context.Context, req abci.RequestDeliverTx, res abci.ResponseDeliverTx) error
    // ListenCommit updates the steaming service with the latest Commit messages and state changes
    ListenCommit(ctx context.Context, res abci.ResponseCommit, changeSet []*store.StoreKVPair) error
}
```

#### BaseApp Registration

We will add a new method to the `BaseApp` to enable the registration of `StreamingService`s:

 ```go
 // SetStreamingService is used to set a streaming service into the BaseApp hooks and load the listeners into the multistore
func (app *BaseApp) SetStreamingService(s ABCIListener) {
    // register the StreamingService within the BaseApp
    // BaseApp will pass BeginBlock, DeliverTx, and EndBlock requests and responses to the streaming services to update their ABCI context
    app.abciListeners = append(app.abciListeners, s)
}
```

We will add two new fields to the `BaseApp` struct:

```go
type BaseApp struct {

    ...

    // abciListenersAsync for determining if abciListeners will run asynchronously.
    // When abciListenersAsync=false and stopNodeOnABCIListenerErr=false listeners will run synchronized but will not stop the node.
    // When abciListenersAsync=true stopNodeOnABCIListenerErr will be ignored.
    abciListenersAsync bool

    // stopNodeOnABCIListenerErr halts the node when ABCI streaming service listening results in an error.
    // stopNodeOnABCIListenerErr=true must be paired with abciListenersAsync=false.
    stopNodeOnABCIListenerErr bool
}
```

#### ABCI Event Hooks

We will modify the `BeginBlock`, `EndBlock`, `DeliverTx` and `Commit` methods to pass ABCI requests and responses
to any streaming service hooks registered with the `BaseApp`.

```go
func (app *BaseApp) BeginBlock(req abci.RequestBeginBlock) (res abci.ResponseBeginBlock) {

    ...

    // call the streaming service hook with the BeginBlock messages
    for _, abciListener := range app.abciListeners {
        ctx := app.deliverState.ctx
        blockHeight := ctx.BlockHeight()
        if app.abciListenersAsync {
            go func(req abci.RequestBeginBlock, res abci.ResponseBeginBlock) {
                if err := app.abciListener.ListenBeginBlock(ctx, req, res); err != nil {
                    app.logger.Error("BeginBlock listening hook failed", "height", blockHeight, "err", err)
                }
            }(req, res)
        } else {
            if err := app.abciListener.ListenBeginBlock(ctx, req, res); err != nil {
                app.logger.Error("BeginBlock listening hook failed", "height", blockHeight, "err", err)
                if app.stopNodeOnABCIListenerErr {
                    os.Exit(1)
                }
            }
        }
    }

    return res
}
```

```go
func (app *BaseApp) EndBlock(req abci.RequestEndBlock) (res abci.ResponseEndBlock) {

    ...

    // call the streaming service hook with the EndBlock messages
    for _, abciListener := range app.abciListeners {
        ctx := app.deliverState.ctx
        blockHeight := ctx.BlockHeight()
        if app.abciListenersAsync {
            go func(req abci.RequestEndBlock, res abci.ResponseEndBlock) {
                if err := app.abciListener.ListenEndBlock(blockHeight, req, res); err != nil {
                    app.logger.Error("EndBlock listening hook failed", "height", blockHeight, "err", err)
                }
            }(req, res)
        } else {
            if err := app.abciListener.ListenEndBlock(blockHeight, req, res); err != nil {
                app.logger.Error("EndBlock listening hook failed", "height", blockHeight, "err", err)
                if app.stopNodeOnABCIListenerErr {
                    os.Exit(1)
                }
            }
        }
    }

    return res
}
```

```go
func (app *BaseApp) DeliverTx(req abci.RequestDeliverTx) abci.ResponseDeliverTx {

    var abciRes abci.ResponseDeliverTx
    defer func() {
        // call the streaming service hook with the EndBlock messages
        for _, abciListener := range app.abciListeners {
            ctx := app.deliverState.ctx
            blockHeight := ctx.BlockHeight()
            if app.abciListenersAsync {
                go func(req abci.RequestDeliverTx, res abci.ResponseDeliverTx) {
                    if err := app.abciListener.ListenDeliverTx(blockHeight, req, res); err != nil {
                        app.logger.Error("DeliverTx listening hook failed", "height", blockHeight, "err", err)
                    }
                }(req, abciRes)
            } else {
                if err := app.abciListener.ListenDeliverTx(blockHeight, req, res); err != nil {
                    app.logger.Error("DeliverTx listening hook failed", "height", blockHeight, "err", err)
                    if app.stopNodeOnABCIListenerErr {
                        os.Exit(1)
                    }
                }
            }
        }
    }()

    ...

    return abciRes
}
```

```go
func (app *BaseApp) Commit() abci.ResponseCommit {

    ...

    res := abci.ResponseCommit{
        Data:         commitID.Hash,
        RetainHeight: retainHeight,
    }

    // call the streaming service hook with the Commit messages
    for _, abciListener := range app.abciListeners {
        ctx := app.deliverState.ctx
        blockHeight := ctx.BlockHeight()
        changeSet := app.cms.PopStateCache()
        if app.abciListenersAsync {
            go func(res abci.ResponseCommit, changeSet []store.StoreKVPair) {
                if err := app.abciListener.ListenCommit(ctx, res, changeSet); err != nil {
                    app.logger.Error("ListenCommit listening hook failed", "height", blockHeight, "err", err)
                }
            }(res, changeSet)
        } else {
            if err := app.abciListener.ListenCommit(ctx, res, changeSet); err != nil {
                app.logger.Error("ListenCommit listening hook failed", "height", blockHeight, "err", err)
                if app.stopNodeOnABCIListenerErr {
                    os.Exit(1)
                }
            }
        }
    }

    ...

    return res
}
```

#### Go Plugin System

We propose a plugin architecture to load and run `Streaming` plugins and other types of implementations. We will introduce a plugin
system over gRPC that is used to load and run Cosmos-SDK plugins. The plugin system uses [hashicorp/go-plugin](https://github.com/hashicorp/go-plugin).
Each plugin must have a struct that implements the `plugin.Plugin` interface and an `Impl` interface for processing messages over gRPC.
Each plugin must also have a message protocol defined for the gRPC service:

```go
// streaming/plugins/abci/{plugin_version}/interface.go

// Handshake is a common handshake that is shared by streaming and host.
// This prevents users from executing bad plugins or executing a plugin
// directory. It is a UX feature, not a security feature.
var Handshake = plugin.HandshakeConfig{
    ProtocolVersion:  1,
    MagicCookieKey:   "ABCI_LISTENER_PLUGIN",
    MagicCookieValue: "ef78114d-7bdf-411c-868f-347c99a78345",
}

// ListenerPlugin is the base struc for all kinds of go-plugin implementations
// It will be included in interfaces of different Plugins
type ABCIListenerPlugin struct {
    // GRPCPlugin must still implement the Plugin interface
    plugin.Plugin
    // Concrete implementation, written in Go. This is only used for plugins
    // that are written in Go.
    Impl baseapp.ABCIListener
}

func (p *ListenerGRPCPlugin) GRPCServer(_ *plugin.GRPCBroker, s *grpc.Server) error {
    RegisterABCIListenerServiceServer(s, &GRPCServer{Impl: p.Impl})
    return nil
}

func (p *ListenerGRPCPlugin) GRPCClient(
    _ context.Context,
    _ *plugin.GRPCBroker,
    c *grpc.ClientConn,
) (interface{}, error) {
    return &GRPCClient{client: NewABCIListenerServiceClient(c)}, nil
}
```

The `plugin.Plugin` interface has two methods `Client` and `Server`. For our GRPC service these are `GRPCClient` and `GRPCServer`
The `Impl` field holds the concrete implementation of our `baseapp.ABCIListener` interface written in Go.
Note: this is only used for plugin implementations written in Go.

The advantage of having such a plugin system is that within each plugin authors can define the message protocol in a way that fits their use case.
For example, when state change listening is desired, the `ABCIListener` message protocol can be defined as below (*for illustrative purposes only*).
When state change listening is not desired than `ListenCommit` can be omitted from the protocol.

```protobuf
syntax = "proto3";

...

message Empty {}

message ListenBeginBlockRequest {
  RequestBeginBlock  req = 1;
  ResponseBeginBlock res = 2;
}
message ListenEndBlockRequest {
  RequestEndBlock  req = 1;
  ResponseEndBlock res = 2;
}
message ListenDeliverTxRequest {
  int64             block_height = 1;
  RequestDeliverTx  req          = 2;
  ResponseDeliverTx res          = 3;
}
message ListenCommitRequest {
  int64                block_height = 1;
  ResponseCommit       res          = 2;
  repeated StoreKVPair changeSet    = 3;
}

// plugin that listens to state changes
service ABCIListenerService {
  rpc ListenBeginBlock(ListenBeginBlockRequest) returns (Empty);
  rpc ListenEndBlock(ListenEndBlockRequest) returns (Empty);
  rpc ListenDeliverTx(ListenDeliverTxRequest) returns (Empty);
  rpc ListenCommit(ListenCommitRequest) returns (Empty);
}
```

```protobuf
...
// plugin that doesn't listen to state changes
service ABCIListenerService {
  rpc ListenBeginBlock(ListenBeginBlockRequest) returns (Empty);
  rpc ListenEndBlock(ListenEndBlockRequest) returns (Empty);
  rpc ListenDeliverTx(ListenDeliverTxRequest) returns (Empty);
  rpc ListenCommit(ListenCommitRequest) returns (Empty);
}
```

Implementing the service above:

```go
// streaming/plugins/abci/{plugin_version}/grpc.go

var (
    _ baseapp.ABCIListener = (*GRPCClient)(nil)
)

// GRPCClient is an implementation of the ABCIListener and ABCIListenerPlugin interfaces that talks over RPC.
type GRPCClient struct {
    client ABCIListenerServiceClient
}

func (m *GRPCClient) ListenBeginBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error {
    _, err := m.client.ListenBeginBlock(ctx, &ListenBeginBlockRequest{Req: req, Res: res})
    return err
}

func (m *GRPCClient) ListenEndBlock(goCtx context.Context, req abci.RequestEndBlock, res abci.ResponseEndBlock) error {
    _, err := m.client.ListenEndBlock(ctx, &ListenEndBlockRequest{Req: req, Res: res})
    return err
}

func (m *GRPCClient) ListenDeliverTx(goCtx context.Context, req abci.RequestDeliverTx, res abci.ResponseDeliverTx) error {
    ctx := sdk.UnwrapSDKContext(goCtx)
    _, err := m.client.ListenDeliverTx(ctx, &ListenDeliverTxRequest{BlockHeight: ctx.BlockHeight(), Req: req, Res: res})
    return err
}

func (m *GRPCClient) ListenCommit(goCtx context.Context, res abci.ResponseCommit, changeSet []store.StoreKVPair) error {
    ctx := sdk.UnwrapSDKContext(goCtx)
    _, err := m.client.ListenCommit(ctx, &ListenCommitRequest{BlockHeight: ctx.BlockHeight(), Res: res, ChangeSet: changeSet})
    return err
}

// GRPCServer is the gRPC server that GRPCClient talks to.
type GRPCServer struct {
    // This is the real implementation
    Impl baseapp.ABCIListener
}

func (m *GRPCServer) ListenBeginBlock(ctx context.Context, req *ListenBeginBlockRequest) (*Empty, error) {
    return &Empty{}, m.Impl.ListenBeginBlock(ctx, req.Req, req.Res)
}

func (m *GRPCServer) ListenEndBlock(ctx context.Context, req *ListenEndBlockRequest) (*Empty, error) {
    return &Empty{}, m.Impl.ListenEndBlock(ctx, req.Req, req.Res)
}

func (m *GRPCServer) ListenDeliverTx(ctx context.Context, req *ListenDeliverTxRequest) (*Empty, error) {
    return &Empty{}, m.Impl.ListenDeliverTx(ctx, req.Req, req.Res)
}

func (m *GRPCServer) ListenCommit(ctx context.Context, req *ListenCommitRequest) (*Empty, error) {
    return &Empty{}, m.Impl.ListenCommit(ctx, req.Res, req.ChangeSet)
}

```

And the pre-compiled Go plugin `Impl`(*this is only used for plugins that are written in Go*):

```go
// streaming/plugins/abci/{plugin_version}/impl/plugin.go

// Plugins are pre-compiled and loaded by the plugin system

// ABCIListener is the implementation of the baseapp.ABCIListener interface
type ABCIListener struct{}

func (m *ABCIListenerPlugin) ListenBeginBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error {
    // send data to external system
}

func (m *ABCIListenerPlugin) ListenEndBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error {
    // send data to external system
}

func (m *ABCIListenerPlugin) ListenDeliverTxBlock(ctx context.Context, req abci.RequestBeginBlock, res abci.ResponseBeginBlock) error {
    // send data to external system
}

func (m *ABCIListenerPlugin) ListenCommit(ctx context.Context, res abci.ResponseCommit, changeSet []store.StoreKVPair) error {
    // send data to external system
}

func main() {
    plugin.Serve(&plugin.ServeConfig{
        HandshakeConfig: grpc_abci_v1.Handshake,
        Plugins: map[string]plugin.Plugin{
           "grpc_plugin_v1": &grpc_abci_v1.ABCIListenerGRPCPlugin{Impl: &ABCIListenerPlugin{}},
        },

        // A non-nil value here enables gRPC serving for this streaming...
        GRPCServer: plugin.DefaultGRPCServer,
    })
}
```

We will introduce a plugin loading system that will return `(interface{}, error)`.
This provides the advantage of using versioned plugins where the plugin interface and gRPC protocol change over time.
In addition, it allows for building independent plugin that can expose different parts of the system over gRPC.

```go
func NewStreamingPlugin(name string, logLevel string) (interface{}, error) {
    logger := hclog.New(&hclog.LoggerOptions{
       Output: hclog.DefaultOutput,
       Level:  toHclogLevel(logLevel),
       Name:   fmt.Sprintf("plugin.%s", name),
    })

    // We're a host. Start by launching the streaming process.
    env := os.Getenv(GetPluginEnvKey(name))
    client := plugin.NewClient(&plugin.ClientConfig{
       HandshakeConfig: HandshakeMap[name],
       Plugins:         PluginMap,
       Cmd:             exec.Command("sh", "-c", env),
       Logger:          logger,
       AllowedProtocols: []plugin.Protocol{
           plugin.ProtocolNetRPC, plugin.ProtocolGRPC},
    })

    // Connect via RPC
    rpcClient, err := client.Client()
    if err != nil {
       return nil, err
    }

    // Request streaming plugin
    return rpcClient.Dispense(name)
}

```

We propose a `RegisterStreamingPlugin` function for the App to register `NewStreamingPlugin`s with the App's BaseApp.
Streaming plugins can be of `Any` type; therefore, the function takes in an interface vs a concrete type.
For example, we could have plugins of `ABCIListener`, `WasmListener` or `IBCListener`. Note that `RegisterStreamingPluing` function
is helper function and not a requirement. Plugin registration can easily be moved from the App to the BaseApp directly.

```go
// baseapp/streaming.go

// RegisterStreamingPlugin registers streaming plugins with the App.
// This method returns an error if a plugin is not supported.
func RegisterStreamingPlugin(
    bApp *BaseApp,
    appOpts servertypes.AppOptions,
    keys map[string]*types.KVStoreKey,
    streamingPlugin interface{},
) error {
    switch t := streamingPlugin.(type) {
    case ABCIListener:
        registerABCIListenerPlugin(bApp, appOpts, keys, t)
    default:
        return fmt.Errorf("unexpected plugin type %T", t)
    }
    return nil
}
```

```go
func registerABCIListenerPlugin(
    bApp *BaseApp,
    appOpts servertypes.AppOptions,
    keys map[string]*store.KVStoreKey,
    abciListener ABCIListener,
) {
    asyncKey := fmt.Sprintf("%s.%s.%s", StreamingTomlKey, StreamingABCITomlKey, StreamingABCIAsync)
    async := cast.ToBool(appOpts.Get(asyncKey))
    stopNodeOnErrKey := fmt.Sprintf("%s.%s.%s", StreamingTomlKey, StreamingABCITomlKey, StreamingABCIStopNodeOnErrTomlKey)
    stopNodeOnErr := cast.ToBool(appOpts.Get(stopNodeOnErrKey))
    keysKey := fmt.Sprintf("%s.%s.%s", StreamingTomlKey, StreamingABCITomlKey, StreamingABCIKeysTomlKey)
    exposeKeysStr := cast.ToStringSlice(appOpts.Get(keysKey))
    exposedKeys := exposeStoreKeysSorted(exposeKeysStr, keys)
    bApp.cms.AddListeners(exposedKeys)
    bApp.SetStreamingService(abciListener)
    bApp.stopNodeOnABCIListenerErr = stopNodeOnErr
    bApp.abciListenersAsync = async
}
```

```go
func exposeAll(list []string) bool {
    for _, ele := range list {
        if ele == "*" {
            return true
        }
    }
    return false
}

func exposeStoreKeys(keysStr []string, keys map[string]*types.KVStoreKey) []types.StoreKey {
    var exposeStoreKeys []types.StoreKey
    if exposeAll(keysStr) {
        exposeStoreKeys = make([]types.StoreKey, 0, len(keys))
        for _, storeKey := range keys {
            exposeStoreKeys = append(exposeStoreKeys, storeKey)
        }
    } else {
        exposeStoreKeys = make([]types.StoreKey, 0, len(keysStr))
        for _, keyStr := range keysStr {
            if storeKey, ok := keys[keyStr]; ok {
                exposeStoreKeys = append(exposeStoreKeys, storeKey)
            }
        }
    }
    // sort storeKeys for deterministic output
    sort.SliceStable(exposeStoreKeys, func(i, j int) bool {
        return exposeStoreKeys[i].Name() < exposeStoreKeys[j].Name()
    })

    return exposeStoreKeys
}
```

The `NewStreamingPlugin` and `RegisterStreamingPlugin` functions are used to register a plugin with the App's BaseApp.

e.g. in `NewSimApp`:

```go
func NewSimApp(
    logger log.Logger,
    db dbm.DB,
    traceStore io.Writer,
    loadLatest bool,
    appOpts servertypes.AppOptions,
    baseAppOptions ...func(*baseapp.BaseApp),
) *SimApp {

    ...

    keys := sdk.NewKVStoreKeys(
       authtypes.StoreKey, banktypes.StoreKey, stakingtypes.StoreKey,
       minttypes.StoreKey, distrtypes.StoreKey, slashingtypes.StoreKey,
       govtypes.StoreKey, paramstypes.StoreKey, ibchost.StoreKey, upgradetypes.StoreKey,
       evidencetypes.StoreKey, ibctransfertypes.StoreKey, capabilitytypes.StoreKey,
    )

    ...

    // register streaming services
    streamingCfg := cast.ToStringMap(appOpts.Get(baseapp.StreamingTomlKey))
    for service := range streamingCfg {
        pluginKey := fmt.Sprintf("%s.%s.%s", baseapp.StreamingTomlKey, service, baseapp.StreamingPluginTomlKey)
        pluginName := strings.TrimSpace(cast.ToString(appOpts.Get(pluginKey)))
        if len(pluginName) > 0 {
            logLevel := cast.ToString(appOpts.Get(flags.FlagLogLevel))
            plugin, err := streaming.NewStreamingPlugin(pluginName, logLevel)
            if err != nil {
                tmos.Exit(err.Error())
            }
            if err := baseapp.RegisterStreamingPlugin(bApp, appOpts, keys, plugin); err != nil {
                tmos.Exit(err.Error())
            }
        }
    }

    return app
```

#### Configuration

The plugin system will be configured within an App's TOML configuration files.

```toml
# gRPC streaming
[streaming]

# ABCI streaming service
[streaming.abci]

# The plugin version to use for ABCI listening
plugin = "abci_v1"

# List of kv store keys to listen to for state changes.
# Set to ["*"] to expose all keys.
keys = ["*"]

# Enable abciListeners to run asynchronously.
# When abciListenersAsync=false and stopNodeOnABCIListenerErr=false listeners will run synchronized but will not stop the node.
# When abciListenersAsync=true stopNodeOnABCIListenerErr will be ignored.
async = false

# Whether to stop the node on message deliver error.
stop-node-on-err = true
```

There will be four parameters for configuring `ABCIListener` plugin: `streaming.abci.plugin`, `streaming.abci.keys`, `streaming.abci.async` and `streaming.abci.stop-node-on-err`.
`streaming.abci.plugin` is the name of the plugin we want to use for streaming, `streaming.abci.keys` is a set of store keys for stores it listens to,
`streaming.abci.async` is bool enabling asynchronous listening and `streaming.abci.stop-node-on-err` is a bool that stops the node when true and when operating
on synchronized mode `streaming.abci.async=false`. Note that `streaming.abci.stop-node-on-err=true` will be ignored if `streaming.abci.async=true`.

The configuration above support additional streaming plugins by adding the plugin to the `[streaming]` configuration section
and registering the plugin with `RegisterStreamingPlugin` helper function.

Note the that each plugin must include `streaming.{service}.plugin` property as it is a requirement for doing the lookup and registration of the plugin
with the App. All other properties are unique to the individual services.

#### Encoding and decoding streams

ADR-038 introduces the interfaces and types for streaming state changes out from KVStores, associating this
data with their related ABCI requests and responses, and registering a service for consuming this data and streaming it to some destination in a final format.
Instead of prescribing a final data format in this ADR, it is left to a specific plugin implementation to define and document this format.
We take this approach because flexibility in the final format is necessary to support a wide range of streaming service plugins. For example,
the data format for a streaming service that writes the data out to a set of files will differ from the data format that is written to a Kafka topic.

## Consequences

These changes will provide a means of subscribing to KVStore state changes in real time.

### Backwards Compatibility

* This ADR changes the `CommitMultiStore` interface, implementations supporting the previous version of this interface will not support the new one

### Positive

* Ability to listen to KVStore state changes in real time and expose these events to external consumers

### Negative

* Changes `CommitMultiStore` interface and its implementations

### Neutral

* Introduces additional- but optional- complexity to configuring and running a cosmos application
* If an application developer opts to use these features to expose data, they need to be aware of the ramifications/risks of that data exposure as it pertains to the specifics of their application
