# ADR 032: 类型化事件

## 更新日志

* 2020年9月28日：初稿

## 作者

* Anil Kumar (@anilcse)
* Jack Zampolin (@jackzampolin)
* Adam Bozanich (@boz)

## 状态

建议中

## 摘要

目前在 Cosmos SDK 中，事件是在每个消息的处理程序以及 `BeginBlock` 和 `EndBlock` 中定义的。每个模块没有为每个事件定义类型，而是实现为 `map[string]string`。最重要的是，这使得这些事件难以消费，因为需要大量的原始字符串匹配和解析。本提案的重点是更新事件，使用在每个模块中定义的**类型化事件**，以便更容易地发出和订阅事件。这个工作流程来自 Akash Network 团队的经验。

## 背景

目前在 Cosmos SDK 中，事件是在每个消息的处理程序中定义的，这意味着每个模块没有一个规范的类型集合来定义每个事件。最重要的是，这使得这些事件难以消费，因为需要大量的原始字符串匹配和解析。本提案的重点是更新事件，使用在每个模块中定义的**类型化事件**，以便更容易地发出和订阅事件。这个工作流程来自 Akash Network 团队的经验。

[我们的平台](http://github.com/ovrclk/akash)需要进行一些链上的编程交互，包括提供者（数据中心 - 对新订单进行竞标并监听创建的租约）和用户（应用程序开发者 - 将应用程序清单发送给提供者）方面。此外，Akash 团队现在还在维护 IBC [`relayer`](https://github.com/ovrclk/relayer)，这是另一个非常事件驱动的过程。在开发这些基础设施的核心部分，并整合从 Kubernetes 开发中学到的经验时，我们的团队已经开发出了一种在 Cosmos SDK 模块中定义和使用类型化事件的标准方法。我们发现，在构建这种类型的事件驱动应用程序时，它非常有用。

随着 Cosmos SDK 在像 `peggy`、其他 peg 区域、IBC、DeFi 等方面被广泛应用，将会出现对事件驱动应用程序的爆炸性需求，以支持用户所需的新功能。我们建议将我们的发现上游到 Cosmos SDK，以使所有 Cosmos SDK 应用程序能够快速、轻松地构建事件驱动的应用程序，以帮助它们的核心应用程序。钱包、交易所、浏览器和 DeFi 协议都将从这项工作中受益。

如果这个提案被接受，用户将能够通过编写针对特定事件类型的 `EventHandler` 并将其传递给 Cosmos SDK 中定义的 `EventEmitters` 来构建基于事件驱动的 Go 语言 Cosmos SDK 应用程序。

提案的最后部分包含了一个详细的示例，展示了在此重构之后如何消费事件。

这个提案专门讨论了如何作为区块链的客户端来消费这些事件，而不是用于模块间通信。

## 决策

**步骤1**：在 `types` 包中实现额外的功能：`EmitTypedEvent` 和 `ParseTypedEvent` 函数

```go
// types/events.go

// EmitTypedEvent takes typed event and emits converting it into sdk.Event
func (em *EventManager) EmitTypedEvent(event proto.Message) error {
	evtType := proto.MessageName(event)
	evtJSON, err := codec.ProtoMarshalJSON(event)
	if err != nil {
		return err
	}

	var attrMap map[string]json.RawMessage
	err = json.Unmarshal(evtJSON, &attrMap)
	if err != nil {
		return err
	}

	var attrs []abci.EventAttribute
	for k, v := range attrMap {
		attrs = append(attrs, abci.EventAttribute{
			Key:   []byte(k),
			Value: v,
		})
	}

	em.EmitEvent(Event{
		Type:       evtType,
		Attributes: attrs,
	})

	return nil
}

// ParseTypedEvent converts abci.Event back to typed event
func ParseTypedEvent(event abci.Event) (proto.Message, error) {
	concreteGoType := proto.MessageType(event.Type)
	if concreteGoType == nil {
		return nil, fmt.Errorf("failed to retrieve the message of type %q", event.Type)
	}

	var value reflect.Value
	if concreteGoType.Kind() == reflect.Ptr {
		value = reflect.New(concreteGoType.Elem())
	} else {
		value = reflect.Zero(concreteGoType)
    }

	protoMsg, ok := value.Interface().(proto.Message)
	if !ok {
		return nil, fmt.Errorf("%q does not implement proto.Message", event.Type)
	}

	attrMap := make(map[string]json.RawMessage)
	for _, attr := range event.Attributes {
		attrMap[string(attr.Key)] = attr.Value
	}

	attrBytes, err := json.Marshal(attrMap)
	if err != nil {
		return nil, err
	}

	err = jsonpb.Unmarshal(strings.NewReader(string(attrBytes)), protoMsg)
	if err != nil {
		return nil, err
	}

	return protoMsg, nil
}
```

在这里，`EmitTypedEvent` 是 `EventManager` 上的一个方法，它接受类型化的事件作为输入，并对其进行 JSON 序列化。然后将 JSON 键值对映射到 `event.Attributes` 上，并以 `sdk.Event` 的形式发出。`Event.Type` 将是 proto 消息的类型 URL。

当我们在 CometBFT websocket 上订阅发出的事件时，它们以 `abci.Event` 的形式发出。`ParseTypedEvent` 将事件解析回其原始的 proto 消息。

**步骤2**：为每个模块中的消息定义类型化事件的 proto 定义：

例如，让我们以 `gov` 模块的 `MsgSubmitProposal` 为例，并实现该事件的类型。

```protobuf
// proto/cosmos/gov/v1beta1/gov.proto
// Add typed event definition

package cosmos.gov.v1beta1;

message EventSubmitProposal {
    string from_address   = 1;
    uint64 proposal_id    = 2;
    TextProposal proposal = 3;
}
```

**步骤3**：重构事件发射以使用创建的类型化事件，并使用 `sdk.EmitTypedEvent` 发射：

```go
// x/gov/handler.go
func handleMsgSubmitProposal(ctx sdk.Context, keeper keeper.Keeper, msg types.MsgSubmitProposalI) (*sdk.Result, error) {
    ...
    types.Context.EventManager().EmitTypedEvent(
        &EventSubmitProposal{
            FromAddress: fromAddress,
            ProposalId: id,
            Proposal: proposal,
        },
    )
    ...
}
```

### 如何在 `Client` 中订阅这些类型化事件

> 注意：下面是完整的代码示例

用户将能够使用 `client.Context.Client.Subscribe` 进行订阅，并消费使用 `EventHandler` 发出的事件。

Akash Network 构建了一个简单的 [`pubsub`](https://github.com/ovrclk/akash/blob/90d258caeb933b611d575355b8df281208a214f8/pubsub/bus.go#L20)。可以使用它来订阅 `abci.Events` 并将其作为类型化事件 [发布](https://github.com/ovrclk/akash/blob/90d258caeb933b611d575355b8df281208a214f8/events/publish.go#L21)。

请参考下面的代码示例，了解更多关于客户端的流程细节。

## 结果

### 积极影响

* 提高了 Cosmos SDK 中当前事件实现的一致性
* 提供了一种更加人性化的处理事件的方式，便于编写事件驱动的应用程序
* 这个实现将支持一个 `EventHandler` 的中间件生态系统

### 负面影响

## 发布事件的详细代码示例

该 ADR 还提议添加发出和消费这些事件的便利方式。这样开发人员只需要编写定义所需操作的 `EventHandler` 即可。

```go
// EventEmitter is a type that describes event emitter functions
// This should be defined in `types/events.go`
type EventEmitter func(context.Context, client.Context, ...EventHandler) error

// EventHandler is a type of function that handles events coming out of the event bus
// This should be defined in `types/events.go`
type EventHandler func(proto.Message) error

// Sample use of the functions below
func main() {
    ctx, cancel := context.WithCancel(context.Background())

    if err := TxEmitter(ctx, client.Context{}.WithNodeURI("tcp://localhost:26657"), SubmitProposalEventHandler); err != nil {
        cancel()
        panic(err)
    }

    return
}

// SubmitProposalEventHandler is an example of an event handler that prints proposal details
// when any EventSubmitProposal is emitted.
func SubmitProposalEventHandler(ev proto.Message) (err error) {
    switch event := ev.(type) {
    // Handle governance proposal events creation events
    case govtypes.EventSubmitProposal:
        // Users define business logic here e.g.
        fmt.Println(ev.FromAddress, ev.ProposalId, ev.Proposal)
        return nil
    default:
        return nil
    }
}

// TxEmitter is an example of an event emitter that emits just transaction events. This can and
// should be implemented somewhere in the Cosmos SDK. The Cosmos SDK can include an EventEmitters for tm.event='Tx'
// and/or tm.event='NewBlock' (the new block events may contain typed events)
func TxEmitter(ctx context.Context, cliCtx client.Context, ehs ...EventHandler) (err error) {
    // Instantiate and start CometBFT RPC client
    client, err := cliCtx.GetNode()
    if err != nil {
        return err
    }

    if err = client.Start(); err != nil {
        return err
    }

    // Start the pubsub bus
    bus := pubsub.NewBus()
    defer bus.Close()

    // Initialize a new error group
    eg, ctx := errgroup.WithContext(ctx)

    // Publish chain events to the pubsub bus
    eg.Go(func() error {
        return PublishChainTxEvents(ctx, client, bus, simapp.ModuleBasics)
    })

    // Subscribe to the bus events
    subscriber, err := bus.Subscribe()
    if err != nil {
        return err
    }

	// Handle all the events coming out of the bus
	eg.Go(func() error {
        var err error
        for {
            select {
            case <-ctx.Done():
                return nil
            case <-subscriber.Done():
                return nil
            case ev := <-subscriber.Events():
                for _, eh := range ehs {
                    if err = eh(ev); err != nil {
                        break
                    }
                }
            }
        }
        return nil
	})

	return group.Wait()
}

// PublishChainTxEvents events using cmtclient. Waits on context shutdown signals to exit.
func PublishChainTxEvents(ctx context.Context, client cmtclient.EventsClient, bus pubsub.Bus, mb module.BasicManager) (err error) {
    // Subscribe to transaction events
    txch, err := client.Subscribe(ctx, "txevents", "tm.event='Tx'", 100)
    if err != nil {
        return err
    }

    // Unsubscribe from transaction events on function exit
    defer func() {
        err = client.UnsubscribeAll(ctx, "txevents")
    }()

    // Use errgroup to manage concurrency
    g, ctx := errgroup.WithContext(ctx)

    // Publish transaction events in a goroutine
    g.Go(func() error {
        var err error
        for {
            select {
            case <-ctx.Done():
                break
            case ed := <-ch:
                switch evt := ed.Data.(type) {
                case cmttypes.EventDataTx:
                    if !evt.Result.IsOK() {
                        continue
                    }
                    // range over events, parse them using the basic manager and
                    // send them to the pubsub bus
                    for _, abciEv := range events {
                        typedEvent, err := sdk.ParseTypedEvent(abciEv)
                        if err != nil {
                            return er
                        }
                        if err := bus.Publish(typedEvent); err != nil {
                            bus.Close()
                            return
                        }
                        continue
                    }
                }
            }
        }
        return err
	})

    // Exit on error or context cancelation
    return g.Wait()
}
```

## 参考资料

* [通过总线发布自定义事件](https://github.com/ovrclk/akash/blob/90d258caeb933b611d575355b8df281208a214f8/events/publish.go#L19-L58)
* [在 `Client` 中消费事件](https://github.com/ovrclk/deploy/blob/bf6c633ab6c68f3026df59efd9982d6ca1bf0561/cmd/event-handlers.go#L57)


# ADR 032: Typed Events

## Changelog

* 28-Sept-2020: Initial Draft

## Authors

* Anil Kumar (@anilcse)
* Jack Zampolin (@jackzampolin)
* Adam Bozanich (@boz)

## Status

Proposed

## Abstract

Currently in the Cosmos SDK, events are defined in the handlers for each message as well as `BeginBlock` and `EndBlock`. Each module doesn't have types defined for each event, they are implemented as `map[string]string`. Above all else this makes these events difficult to consume as it requires a great deal of raw string matching and parsing. This proposal focuses on updating the events to use **typed events** defined in each module such that emiting and subscribing to events will be much easier. This workflow comes from the experience of the Akash Network team.

## Context

Currently in the Cosmos SDK, events are defined in the handlers for each message, meaning each module doesn't have a cannonical set of types for each event. Above all else this makes these events difficult to consume as it requires a great deal of raw string matching and parsing. This proposal focuses on updating the events to use **typed events** defined in each module such that emiting and subscribing to events will be much easier. This workflow comes from the experience of the Akash Network team.

[Our platform](http://github.com/ovrclk/akash) requires a number of programatic on chain interactions both on the provider (datacenter - to bid on new orders and listen for leases created) and user (application developer - to send the app manifest to the provider) side. In addition the Akash team is now maintaining the IBC [`relayer`](https://github.com/ovrclk/relayer), another very event driven process. In working on these core pieces of infrastructure, and integrating lessons learned from Kubernetes developement, our team has developed a standard method for defining and consuming typed events in Cosmos SDK modules. We have found that it is extremely useful in building this type of event driven application.

As the Cosmos SDK gets used more extensively for apps like `peggy`, other peg zones, IBC, DeFi, etc... there will be an exploding demand for event driven applications to support new features desired by users. We propose upstreaming our findings into the Cosmos SDK to enable all Cosmos SDK applications to quickly and easily build event driven apps to aid their core application. Wallets, exchanges, explorers, and defi protocols all stand to benefit from this work.

If this proposal is accepted, users will be able to build event driven Cosmos SDK apps in go by just writing `EventHandler`s for their specific event types and passing them to `EventEmitters` that are defined in the Cosmos SDK.

The end of this proposal contains a detailed example of how to consume events after this refactor.

This proposal is specifically about how to consume these events as a client of the blockchain, not for intermodule communication.

## Decision

**Step-1**:  Implement additional functionality in the `types` package: `EmitTypedEvent` and `ParseTypedEvent` functions

```go
// types/events.go

// EmitTypedEvent takes typed event and emits converting it into sdk.Event
func (em *EventManager) EmitTypedEvent(event proto.Message) error {
	evtType := proto.MessageName(event)
	evtJSON, err := codec.ProtoMarshalJSON(event)
	if err != nil {
		return err
	}

	var attrMap map[string]json.RawMessage
	err = json.Unmarshal(evtJSON, &attrMap)
	if err != nil {
		return err
	}

	var attrs []abci.EventAttribute
	for k, v := range attrMap {
		attrs = append(attrs, abci.EventAttribute{
			Key:   []byte(k),
			Value: v,
		})
	}

	em.EmitEvent(Event{
		Type:       evtType,
		Attributes: attrs,
	})

	return nil
}

// ParseTypedEvent converts abci.Event back to typed event
func ParseTypedEvent(event abci.Event) (proto.Message, error) {
	concreteGoType := proto.MessageType(event.Type)
	if concreteGoType == nil {
		return nil, fmt.Errorf("failed to retrieve the message of type %q", event.Type)
	}

	var value reflect.Value
	if concreteGoType.Kind() == reflect.Ptr {
		value = reflect.New(concreteGoType.Elem())
	} else {
		value = reflect.Zero(concreteGoType)
    }

	protoMsg, ok := value.Interface().(proto.Message)
	if !ok {
		return nil, fmt.Errorf("%q does not implement proto.Message", event.Type)
	}

	attrMap := make(map[string]json.RawMessage)
	for _, attr := range event.Attributes {
		attrMap[string(attr.Key)] = attr.Value
	}

	attrBytes, err := json.Marshal(attrMap)
	if err != nil {
		return nil, err
	}

	err = jsonpb.Unmarshal(strings.NewReader(string(attrBytes)), protoMsg)
	if err != nil {
		return nil, err
	}

	return protoMsg, nil
}
```

Here, the `EmitTypedEvent` is a method on `EventManager` which takes typed event as input and apply json serialization on it. Then it maps the JSON key/value pairs to `event.Attributes` and emits it in form of `sdk.Event`. `Event.Type` will be the type URL of the proto message.

When we subscribe to emitted events on the CometBFT websocket, they are emitted in the form of an `abci.Event`. `ParseTypedEvent` parses the event back to it's original proto message.

**Step-2**: Add proto definitions for typed events for msgs in each module:

For example, let's take `MsgSubmitProposal` of `gov` module and implement this event's type.

```protobuf
// proto/cosmos/gov/v1beta1/gov.proto
// Add typed event definition

package cosmos.gov.v1beta1;

message EventSubmitProposal {
    string from_address   = 1;
    uint64 proposal_id    = 2;
    TextProposal proposal = 3;
}
```

**Step-3**: Refactor event emission to use the typed event created and emit using `sdk.EmitTypedEvent`:

```go
// x/gov/handler.go
func handleMsgSubmitProposal(ctx sdk.Context, keeper keeper.Keeper, msg types.MsgSubmitProposalI) (*sdk.Result, error) {
    ...
    types.Context.EventManager().EmitTypedEvent(
        &EventSubmitProposal{
            FromAddress: fromAddress,
            ProposalId: id,
            Proposal: proposal,
        },
    )
    ...
}
```

### How to subscribe to these typed events in `Client`

> NOTE: Full code example below

Users will be able to subscribe using `client.Context.Client.Subscribe` and consume events which are emitted using `EventHandler`s.

Akash Network has built a simple [`pubsub`](https://github.com/ovrclk/akash/blob/90d258caeb933b611d575355b8df281208a214f8/pubsub/bus.go#L20). This can be used to subscribe to `abci.Events` and [publish](https://github.com/ovrclk/akash/blob/90d258caeb933b611d575355b8df281208a214f8/events/publish.go#L21) them as typed events.

Please see the below code sample for more detail on this flow looks for clients.

## Consequences

### Positive

* Improves consistency of implementation for the events currently in the Cosmos SDK
* Provides a much more ergonomic way to handle events and facilitates writing event driven applications
* This implementation will support a middleware ecosystem of `EventHandler`s

### Negative

## Detailed code example of publishing events

This ADR also proposes adding affordances to emit and consume these events. This way developers will only need to write
`EventHandler`s which define the actions they desire to take.

```go
// EventEmitter is a type that describes event emitter functions
// This should be defined in `types/events.go`
type EventEmitter func(context.Context, client.Context, ...EventHandler) error

// EventHandler is a type of function that handles events coming out of the event bus
// This should be defined in `types/events.go`
type EventHandler func(proto.Message) error

// Sample use of the functions below
func main() {
    ctx, cancel := context.WithCancel(context.Background())

    if err := TxEmitter(ctx, client.Context{}.WithNodeURI("tcp://localhost:26657"), SubmitProposalEventHandler); err != nil {
        cancel()
        panic(err)
    }

    return
}

// SubmitProposalEventHandler is an example of an event handler that prints proposal details
// when any EventSubmitProposal is emitted.
func SubmitProposalEventHandler(ev proto.Message) (err error) {
    switch event := ev.(type) {
    // Handle governance proposal events creation events
    case govtypes.EventSubmitProposal:
        // Users define business logic here e.g.
        fmt.Println(ev.FromAddress, ev.ProposalId, ev.Proposal)
        return nil
    default:
        return nil
    }
}

// TxEmitter is an example of an event emitter that emits just transaction events. This can and
// should be implemented somewhere in the Cosmos SDK. The Cosmos SDK can include an EventEmitters for tm.event='Tx'
// and/or tm.event='NewBlock' (the new block events may contain typed events)
func TxEmitter(ctx context.Context, cliCtx client.Context, ehs ...EventHandler) (err error) {
    // Instantiate and start CometBFT RPC client
    client, err := cliCtx.GetNode()
    if err != nil {
        return err
    }

    if err = client.Start(); err != nil {
        return err
    }

    // Start the pubsub bus
    bus := pubsub.NewBus()
    defer bus.Close()

    // Initialize a new error group
    eg, ctx := errgroup.WithContext(ctx)

    // Publish chain events to the pubsub bus
    eg.Go(func() error {
        return PublishChainTxEvents(ctx, client, bus, simapp.ModuleBasics)
    })

    // Subscribe to the bus events
    subscriber, err := bus.Subscribe()
    if err != nil {
        return err
    }

	// Handle all the events coming out of the bus
	eg.Go(func() error {
        var err error
        for {
            select {
            case <-ctx.Done():
                return nil
            case <-subscriber.Done():
                return nil
            case ev := <-subscriber.Events():
                for _, eh := range ehs {
                    if err = eh(ev); err != nil {
                        break
                    }
                }
            }
        }
        return nil
	})

	return group.Wait()
}

// PublishChainTxEvents events using cmtclient. Waits on context shutdown signals to exit.
func PublishChainTxEvents(ctx context.Context, client cmtclient.EventsClient, bus pubsub.Bus, mb module.BasicManager) (err error) {
    // Subscribe to transaction events
    txch, err := client.Subscribe(ctx, "txevents", "tm.event='Tx'", 100)
    if err != nil {
        return err
    }

    // Unsubscribe from transaction events on function exit
    defer func() {
        err = client.UnsubscribeAll(ctx, "txevents")
    }()

    // Use errgroup to manage concurrency
    g, ctx := errgroup.WithContext(ctx)

    // Publish transaction events in a goroutine
    g.Go(func() error {
        var err error
        for {
            select {
            case <-ctx.Done():
                break
            case ed := <-ch:
                switch evt := ed.Data.(type) {
                case cmttypes.EventDataTx:
                    if !evt.Result.IsOK() {
                        continue
                    }
                    // range over events, parse them using the basic manager and
                    // send them to the pubsub bus
                    for _, abciEv := range events {
                        typedEvent, err := sdk.ParseTypedEvent(abciEv)
                        if err != nil {
                            return er
                        }
                        if err := bus.Publish(typedEvent); err != nil {
                            bus.Close()
                            return
                        }
                        continue
                    }
                }
            }
        }
        return err
	})

    // Exit on error or context cancelation
    return g.Wait()
}
```

## References

* [Publish Custom Events via a bus](https://github.com/ovrclk/akash/blob/90d258caeb933b611d575355b8df281208a214f8/events/publish.go#L19-L58)
* [Consuming the events in `Client`](https://github.com/ovrclk/deploy/blob/bf6c633ab6c68f3026df59efd9982d6ca1bf0561/cmd/event-handlers.go#L57)
