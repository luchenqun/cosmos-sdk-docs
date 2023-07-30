# ORM

Cosmos SDK ORM是一个状态管理库，提供了一套丰富但有主见的工具，用于管理模块的状态。它提供以下支持：

* 类型安全的状态管理
* 多部分键
* 二级索引
* 唯一索引
* 简单的前缀和范围查询
* 自动的创世导入/导出
* 为客户端提供自动查询服务，包括对轻客户端证明的支持（仍在开发中）
* 在外部数据库中索引状态数据（仍在开发中）

## 设计和理念

ORM的数据模型受到SQL数据库中的关系数据模型的启发。核心抽象是具有主键和可选二级索引的表。

由于Cosmos SDK使用protobuf作为其编码层，ORM表直接在.proto文件中使用protobuf选项进行定义。每个表由单个protobuf `message`类型和一个包含多个表的模式在单个.proto文件中表示。

表结构在与消息定义的同一文件中指定，以便更容易专注于状态层的更好设计。因为区块链状态布局是客户端的公共API的一部分（TODO：链接到关于轻客户端证明的文档），所以重要的是将状态布局视为模块的公共API的一部分。更改状态布局实际上会破坏客户端，因此最好事先仔细考虑并力求设计一个能够消除或最小化后续破坏性更改的设计。此外，良好的状态设计可以构建更高性能和复杂的应用程序。提供一组受关系数据库启发的工具，并允许在单个位置声明性地指定模式，是ORM为实现更好的设计和更持久的API而做出的设计选择。

此外，通过仅支持表抽象而不是键值对映射，可以轻松地向任何数据结构添加新的列/字段，而不会引起破坏性更改，并且可以将数据结构轻松地索引在任何现成的SQL数据库中以进行更复杂的查询。

键中字段的编码设计旨在支持所有protobuf原始字段类型的有序迭代，除了`bytes`以及`google.protobuf.Timestamp`和`google.protobuf.Duration`这两个已知类型。编码在存储空间方面进行了优化（有关更多详细信息，请参阅`cosmos/orm/v1/orm.proto`中的文档），表行不会使用额外的存储空间来存储键字段的值。

我们建议ORM的用户尝试遵循数据库设计的最佳实践，例如[规范化](https://en.wikipedia.org/wiki/Database_normalization)（至少符合第一范式）。例如，在表中定义`repeated`字段被认为是一种反模式，因为它违反了第一范式（1NF）。尽管我们支持在表中使用`repeated`字段，但由于这个原因，它们不能用作键字段。这可能看起来有限制，但多年的最佳实践（以及SDK中的经验）表明，遵循这种模式会导致更易于维护的模式。

为了用SDK中的一个例子说明这些原则的动机，历史上余额被存储为从账户到代币余额的映射。这种方式不适用于规模化，因为每当单个代币余额发生变化时，需要对一个具有100个代币余额的账户进行编码/解码。现在，余额被存储为账户、代币 -> 金额，就像上面的例子一样。使用ORM的数据模型，如果我们想要向`Balance`添加一个新字段，例如`unlocked_balance`（如果按照这种方式重新设计了锁定账户），则可以轻松将其添加到此表中，而无需进行数据迁移。由于ORM的优化，账户和代币仅存储在存储的键部分，而不存储在值部分，从而实现了灵活的数据模型和高效的存储使用。

## 定义表

要定义一个表：

1）创建一个.proto文件来描述模块的状态（建议将其命名为`state.proto`以保持一致性），并导入"cosmos/orm/v1/orm.proto"，例如：

```protobuf
syntax = "proto3";
package bank_example;

import "cosmos/orm/v1/orm.proto";
```

2）为表定义一个`message`，例如：

```protobuf
message Balance {
  bytes account = 1;
  string denom = 2;
  uint64 balance = 3;
}
```

3) 将 `cosmos.orm.v1.table` 选项添加到表中，并为该表分配一个在此 .proto 文件中唯一的 `id`：

```protobuf
message Balance {
  option (cosmos.orm.v1.table) = {
    id: 1
  };
  
  bytes account = 1;
  string denom = 2;
  uint64 balance = 3;
}
```

4) 将主键字段定义为消息中应构成主键的字段的逗号分隔列表：

```protobuf
message Balance {
  option (cosmos.orm.v1.table) = {
    id: 1
    primary_key: { fields: "account,denom" }
  };

  bytes account = 1;
  string denom = 2;
  uint64 balance = 3;
}
```

5) 通过指定在表中唯一的 `id` 和逗号分隔的索引字段列表来添加任何所需的二级索引：

```protobuf
message Balance {
  option (cosmos.orm.v1.table) = {
    id: 1;
    primary_key: { fields: "account,denom" }
    index: { id: 1 fields: "denom" } // this allows querying for the accounts which own a denom
  };

  bytes account = 1;
  string denom   = 2;
  uint64 amount  = 3;
}
```

### 自增主键

在 SDK 模块和数据库设计中常见的模式是定义具有单个整数 `id` 字段的表，该字段具有自动生成的主键。在 ORM 中，我们可以通过在主键上将 `auto_increment` 选项设置为 `true` 来实现这一点，例如：

```protobuf
message Account {
  option (cosmos.orm.v1.table) = {
    id: 2;
    primary_key: { fields: "id", auto_increment: true }
  };

  uint64 id = 1;
  bytes address = 2;
}
```

### 唯一索引

可以通过在索引上将 `unique` 选项设置为 `true` 来添加唯一索引，例如：

```protobuf
message Account {
  option (cosmos.orm.v1.table) = {
    id: 2;
    primary_key: { fields: "id", auto_increment: true }
    index: {id: 1, fields: "address", unique: true}
  };

  uint64 id = 1;
  bytes address = 2;
}
```

### 单例

ORM 还支持只有一行的特殊类型表，称为 `singleton`。这可用于存储模块参数。单例只需要定义一个唯一的 `id`，并且不能与同一 .proto 文件中的其他表或单例的 id 冲突。例如：

```protobuf
message Params {
  option (cosmos.orm.v1.singleton) = {
    id: 3;
  };
  
  google.protobuf.Duration voting_period = 1;
  uint64 min_threshold = 2;
}
```

## 运行代码生成

注意：ORM 仅适用于实现了 [google.golang.org/protobuf](https://pkg.go.dev/google.golang.org/protobuf) API 的 protobuf 代码。这意味着它不适用于使用 gogo-proto 生成的代码。

要安装 ORM 的代码生成器，请运行：

```shell
go install cosmossdk.io/orm/cmd/protoc-gen-go-cosmos-orm@latest
```

建议使用 [buf build](https://docs.buf.build/build/usage) 来运行代码生成器。以下是使用 buf 管理模式运行 `protoc-gen-go`、`protoc-gen-go-grpc` 和 `protoc-gen-go-cosmos-orm` 的示例 `buf.gen.yaml`：

```yaml
version: v1
managed:
  enabled: true
  go_package_prefix:
    default: foo.bar/api # the go package prefix of your package
    override:
      buf.build/cosmos/cosmos-sdk: cosmossdk.io/api # required to import the Cosmos SDK api module
plugins:
  - name: go
    out: .
    opt: paths=source_relative
  - name: go-grpc
    out: .
    opt: paths=source_relative
  - name: go-cosmos-orm
    out: .
    opt: paths=source_relative
```

## 在模块中使用 ORM

### 初始化

要在模块中使用 ORM，请首先创建一个 `ModuleSchemaDescriptor`。这告诉 ORM 哪些 .proto 文件定义了 ORM 模式，并为它们分配一个唯一的非零 id。例如：

```go
var MyModuleSchema = &ormv1alpha1.ModuleSchemaDescriptor{
    SchemaFile: []*ormv1alpha1.ModuleSchemaDescriptor_FileEntry{
        {
            Id:            1,
            ProtoFileName: mymodule.File_my_module_state_proto.Path(),
        },
    },
}
```

在名为 `state.proto` 的文件的 ORM 生成的代码中，应该有一个名为 `StateStore` 的接口，它是通过一个名为 `NewStateStore` 的构造函数生成的，该构造函数接受一个类型为 `ormdb.ModuleDB` 的参数。将 `StateStore` 添加到您模块的 keeper 结构体中。例如：

```go
type Keeper struct {
    db StateStore
}
```

然后，通过从上面的 `SchemaDescriptor` 实例化的 `ormdb.ModuleDB` 和一个或多个来自 `cosmossdk.io/core/store` 的存储服务来实例化 `StateStore` 实例。例如：

```go
func NewKeeper(storeService store.KVStoreService) (*Keeper, error) {
    modDb, err := ormdb.NewModuleDB(MyModuleSchema, ormdb.ModuleDBOptions{KVStoreService: storeService})
    if err != nil {
        return nil, err
    }
    db, err := NewStateStore(modDb)
    if err != nil {
        return nil, err
    }
    return Keeper{db: db}, nil
}
```

### 使用生成的代码

ORM 生成的代码包含用于插入、更新、删除和查询表条目的方法。对于 .proto 文件中的每个表，生成的代码中都有一个类型安全的表接口。例如，对于名为 `Balance` 的表，应该有一个名为 `BalanceTable` 的接口，它看起来像这样：

```go
type BalanceTable interface {
    Insert(ctx context.Context, balance *Balance) error
    Update(ctx context.Context, balance *Balance) error
    Save(ctx context.Context, balance *Balance) error
    Delete(ctx context.Context, balance *Balance) error
    Has(ctx context.Context, acocunt []byte, denom string) (found bool, err error)
    // Get returns nil and an error which responds true to ormerrors.IsNotFound() if the record was not found.
    Get(ctx context.Context, acocunt []byte, denom string) (*Balance, error)
    List(ctx context.Context, prefixKey BalanceIndexKey, opts ...ormlist.Option) (BalanceIterator, error)
    ListRange(ctx context.Context, from, to BalanceIndexKey, opts ...ormlist.Option) (BalanceIterator, error)
    DeleteBy(ctx context.Context, prefixKey BalanceIndexKey) error
    DeleteRange(ctx context.Context, from, to BalanceIndexKey) error

    doNotImplement()
}
```

通过 `StateStore` 接口（假设我们的文件名为 `state.proto`），可以通过 `BalanceTable()` 访问器方法访问此 `BalanceTable`。如果上述所有示例表/单例都在同一个 `state.proto` 中，那么 `StateStore` 将生成如下：

```go
type BankStore interface {
    BalanceTable() BalanceTable
    AccountTable() AccountTable
    ParamsTable() ParamsTable

    doNotImplement()
}
```

因此，在 keeper 方法中使用 `BalanceTable`，我们可以使用以下代码：

```go
func (k keeper) AddBalance(ctx context.Context, acct []byte, denom string, amount uint64) error {
    balance, err := k.db.BalanceTable().Get(ctx, acct, denom)
    if err != nil && !ormerrors.IsNotFound(err) {
        return err
    }

    if balance == nil {
        balance = &Balance{
            Account: acct,
            Denom:   denom,
            Amount:  amount,
        }
    } else {
        balance.Amount = balance.Amount + amount
    }

    return k.db.BalanceTable().Save(ctx, balance)
}
```

`List` 方法接受 `IndexKey` 参数。例如，`BalanceTable.List` 接受 `BalanceIndexKey`。`BalanceIndexKey` 用于表示 `Balance` 表上的不同索引（主键和次要键）的索引键。`Balance` 表中的主键使用结构体 `BalanceAccountDenomIndexKey`，第一个索引使用索引键 `BalanceDenomIndexKey`。如果我们想要列出账户持有的所有货币和金额，我们可以使用 `BalanceAccountDenomIndexKey` 并在账户前缀上使用 `List` 查询。例如：

```go
it, err := keeper.db.BalanceTable().List(ctx, BalanceAccountDenomIndexKey{}.WithAccount(acct))
```



# ORM

The Cosmos SDK ORM is a state management library that provides a rich, but opinionated set of tools for managing a
module's state. It provides support for:

* type safe management of state
* multipart keys
* secondary indexes
* unique indexes
* easy prefix and range queries
* automatic genesis import/export
* automatic query services for clients, including support for light client proofs (still in development)
* indexing state data in external databases (still in development)

## Design and Philosophy

The ORM's data model is inspired by the relational data model found in SQL databases. The core abstraction is a table
with a primary key and optional secondary indexes.

Because the Cosmos SDK uses protobuf as its encoding layer, ORM tables are defined directly in .proto files using
protobuf options. Each table is defined by a single protobuf `message` type and a schema of multiple tables is
represented by a single .proto file.

Table structure is specified in the same file where messages are defined in order to make it easy to focus on better
design of the state layer. Because blockchain state layout is part of the public API for clients (TODO: link to docs on
light client proofs), it is important to think about the state layout as being part of the public API of a module.
Changing the state layout actually breaks clients, so it is ideal to think through it carefully up front and to aim for
a design that will eliminate or minimize breaking changes down the road. Also, good design of state enables building
more performant and sophisticated applications. Providing users with a set of tools inspired by relational databases
which have a long history of database design best practices and allowing schema to be specified declaratively in a
single place are design choices the ORM makes to enable better design and more durable APIs.

Also, by only supporting the table abstraction as opposed to key-value pair maps, it is easy to add to new
columns/fields to any data structure without causing a breaking change and the data structures can easily be indexed in
any off-the-shelf SQL database for more sophisticated queries.

The encoding of fields in keys is designed to support ordered iteration for all protobuf primitive field types
except for `bytes` as well as the well-known types `google.protobuf.Timestamp` and `google.protobuf.Duration`. Encodings
are optimized for storage space when it makes sense (see the documentation in `cosmos/orm/v1/orm.proto` for more details)
and table rows do not use extra storage space to store key fields in the value.

We recommend that users of the ORM attempt to follow database design best practices such as
[normalization](https://en.wikipedia.org/wiki/Database_normalization) (at least 1NF).
For instance, defining `repeated` fields in a table is considered an anti-pattern because breaks first normal form (1NF).
Although we support `repeated` fields in tables, they cannot be used as key fields for this reason. This may seem
restrictive but years of best practice (and also experience in the SDK) have shown that following this pattern
leads to easier to maintain schemas.

To illustrate the motivation for these principles with an example from the SDK, historically balances were stored
as a mapping from account -> map of denom to amount. This did not scale well because an account with 100 token balances
needed to be encoded/decoded every time a single coin balance changed. Now balances are stored as account,denom -> amount
as in the example above. With the ORM's data model, if we wanted to add a new field to `Balance` such as
`unlocked_balance` (if vesting accounts were redesigned in this way), it would be easy to add it to this table without
requiring a data migration. Because of the ORM's optimizations, the account and denom are only stored in the key part
of storage and not in the value leading to both a flexible data model and efficient usage of storage.

## Defining Tables

To define a table:

1) create a .proto file to describe the module's state (naming it `state.proto` is recommended for consistency),
and import "cosmos/orm/v1/orm.proto", ex:

```protobuf
syntax = "proto3";
package bank_example;

import "cosmos/orm/v1/orm.proto";
```

2) define a `message` for the table, ex:

```protobuf
message Balance {
  bytes account = 1;
  string denom = 2;
  uint64 balance = 3;
}
```

3) add the `cosmos.orm.v1.table` option to the table and give the table an `id` unique within this .proto file:

```protobuf
message Balance {
  option (cosmos.orm.v1.table) = {
    id: 1
  };
  
  bytes account = 1;
  string denom = 2;
  uint64 balance = 3;
}
```

4) define the primary key field or fields, as a comma-separated list of the fields from the message which should make
up the primary key:

```protobuf
message Balance {
  option (cosmos.orm.v1.table) = {
    id: 1
    primary_key: { fields: "account,denom" }
  };

  bytes account = 1;
  string denom = 2;
  uint64 balance = 3;
}
```

5) add any desired secondary indexes by specifying an `id` unique within the table and a comma-separate list of the
index fields:

```protobuf
message Balance {
  option (cosmos.orm.v1.table) = {
    id: 1;
    primary_key: { fields: "account,denom" }
    index: { id: 1 fields: "denom" } // this allows querying for the accounts which own a denom
  };

  bytes account = 1;
  string denom   = 2;
  uint64 amount  = 3;
}
```

### Auto-incrementing Primary Keys

A common pattern in SDK modules and in database design is to define tables with a single integer `id` field with an
automatically generated primary key. In the ORM we can do this by setting the `auto_increment` option to `true` on the
primary key, ex:

```protobuf
message Account {
  option (cosmos.orm.v1.table) = {
    id: 2;
    primary_key: { fields: "id", auto_increment: true }
  };

  uint64 id = 1;
  bytes address = 2;
}
```

### Unique Indexes

A unique index can be added by setting the `unique` option to `true` on an index, ex:

```protobuf
message Account {
  option (cosmos.orm.v1.table) = {
    id: 2;
    primary_key: { fields: "id", auto_increment: true }
    index: {id: 1, fields: "address", unique: true}
  };

  uint64 id = 1;
  bytes address = 2;
}
```

### Singletons

The ORM also supports a special type of table with only one row called a `singleton`. This can be used for storing
module parameters. Singletons only need to define a unique `id` and that cannot conflict with the id of other
tables or singletons in the same .proto file. Ex:

```protobuf
message Params {
  option (cosmos.orm.v1.singleton) = {
    id: 3;
  };
  
  google.protobuf.Duration voting_period = 1;
  uint64 min_threshold = 2;
}
```

## Running Codegen

NOTE: the ORM will only work with protobuf code that implements the [google.golang.org/protobuf](https://pkg.go.dev/google.golang.org/protobuf)
API. That means it will not work with code generated using gogo-proto.

To install the ORM's code generator, run:

```shell
go install cosmossdk.io/orm/cmd/protoc-gen-go-cosmos-orm@latest
```

The recommended way to run the code generator is to use [buf build](https://docs.buf.build/build/usage).
This is an example `buf.gen.yaml` that runs `protoc-gen-go`, `protoc-gen-go-grpc` and `protoc-gen-go-cosmos-orm`
using buf managed mode:

```yaml
version: v1
managed:
  enabled: true
  go_package_prefix:
    default: foo.bar/api # the go package prefix of your package
    override:
      buf.build/cosmos/cosmos-sdk: cosmossdk.io/api # required to import the Cosmos SDK api module
plugins:
  - name: go
    out: .
    opt: paths=source_relative
  - name: go-grpc
    out: .
    opt: paths=source_relative
  - name: go-cosmos-orm
    out: .
    opt: paths=source_relative
```

## Using the ORM in a module

### Initialization

To use the ORM in a module, first create a `ModuleSchemaDescriptor`. This tells the ORM which .proto files have defined
an ORM schema and assigns them all a unique non-zero id. Ex:

```go
var MyModuleSchema = &ormv1alpha1.ModuleSchemaDescriptor{
    SchemaFile: []*ormv1alpha1.ModuleSchemaDescriptor_FileEntry{
        {
            Id:            1,
            ProtoFileName: mymodule.File_my_module_state_proto.Path(),
        },
    },
}
```

In the ORM generated code for a file named `state.proto`, there should be an interface `StateStore` that got generated
with a constructor `NewStateStore` that takes a parameter of type `ormdb.ModuleDB`. Add a reference to `StateStore`
to your module's keeper struct. Ex:

```go
type Keeper struct {
    db StateStore
}
```

Then instantiate the `StateStore` instance via an `ormdb.ModuleDB` that is instantiated from the `SchemaDescriptor`
above and one or more store services from `cosmossdk.io/core/store`. Ex:

```go
func NewKeeper(storeService store.KVStoreService) (*Keeper, error) {
    modDb, err := ormdb.NewModuleDB(MyModuleSchema, ormdb.ModuleDBOptions{KVStoreService: storeService})
    if err != nil {
        return nil, err
    }
    db, err := NewStateStore(modDb)
    if err != nil {
        return nil, err
    }
    return Keeper{db: db}, nil
}
```

### Using the generated code

The generated code for the ORM contains methods for inserting, updating, deleting and querying table entries.
For each table in a .proto file, there is a type-safe table interface implemented in generated code. For instance,
for a table named `Balance` there should be a `BalanceTable` interface that looks like this:

```go
type BalanceTable interface {
    Insert(ctx context.Context, balance *Balance) error
    Update(ctx context.Context, balance *Balance) error
    Save(ctx context.Context, balance *Balance) error
    Delete(ctx context.Context, balance *Balance) error
    Has(ctx context.Context, acocunt []byte, denom string) (found bool, err error)
    // Get returns nil and an error which responds true to ormerrors.IsNotFound() if the record was not found.
    Get(ctx context.Context, acocunt []byte, denom string) (*Balance, error)
    List(ctx context.Context, prefixKey BalanceIndexKey, opts ...ormlist.Option) (BalanceIterator, error)
    ListRange(ctx context.Context, from, to BalanceIndexKey, opts ...ormlist.Option) (BalanceIterator, error)
    DeleteBy(ctx context.Context, prefixKey BalanceIndexKey) error
    DeleteRange(ctx context.Context, from, to BalanceIndexKey) error

    doNotImplement()
}
```

This `BalanceTable` should be accessible from the `StateStore` interface (assuming our file is named `state.proto`)
via a `BalanceTable()` accessor method. If all the above example tables/singletons were in the same `state.proto`,
then `StateStore` would get generated like this:

```go
type BankStore interface {
    BalanceTable() BalanceTable
    AccountTable() AccountTable
    ParamsTable() ParamsTable

    doNotImplement()
}
```

So to work with the `BalanceTable` in a keeper method we could use code like this:

```go
func (k keeper) AddBalance(ctx context.Context, acct []byte, denom string, amount uint64) error {
    balance, err := k.db.BalanceTable().Get(ctx, acct, denom)
    if err != nil && !ormerrors.IsNotFound(err) {
        return err
    }

    if balance == nil {
        balance = &Balance{
            Account: acct,
            Denom:   denom,
            Amount:  amount,
        }
    } else {
        balance.Amount = balance.Amount + amount
    }

    return k.db.BalanceTable().Save(ctx, balance)
}
```

`List` methods take `IndexKey` parameters. For instance, `BalanceTable.List` takes `BalanceIndexKey`. `BalanceIndexKey`
let's represent index keys for the different indexes (primary and secondary) on the `Balance` table. The primary key
in the `Balance` table gets a struct `BalanceAccountDenomIndexKey` and the first index gets an index key `BalanceDenomIndexKey`.
If we wanted to list all the denoms and amounts that an account holds, we would use `BalanceAccountDenomIndexKey`
with a `List` query just on the account prefix. Ex:

```go
it, err := keeper.db.BalanceTable().List(ctx, BalanceAccountDenomIndexKey{}.WithAccount(acct))
```
