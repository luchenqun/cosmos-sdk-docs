<!---
order: 3
--->

# 在Java中创建一个应用程序

## 指南假设

本指南适用于想要从零开始使用Tendermint Core应用程序的初学者。它不假设您具有任何关于Tendermint Core的先前经验。

Tendermint Core是拜占庭容错（BFT）中间件，它接受一个状态转换机器（您的应用程序） - 用任何编程语言编写 - 并在许多机器上安全地复制它。

通过按照本指南的步骤，您将创建一个名为kvstore的Tendermint Core项目，这是一个（非常）简单的分布式BFT键值存储。该应用程序（应该实现区块链接口（ABCI））将使用Java编写。

本指南假设您对JVM世界并不陌生。如果您是新手，请参阅[JVM最小生存指南](https://hadihariri.com/2013/12/29/jvm-minimal-survival-guide-for-the-dotnet-developer/#java-the-language-java-the-ecosystem-java-the-jvm)和[Gradle文档](https://docs.gradle.org/current/userguide/userguide.html)。

## 内置应用程序与外部应用程序

如果您使用Golang，可以在同一个进程中运行您的应用程序和Tendermint Core，以获得最大的性能。
[Cosmos SDK](https://github.com/cosmos/cosmos-sdk)就是这样编写的。
有关详细信息，请参阅[在Go中编写内置的Tendermint Core应用程序](./go-built-in.md)指南。

如果您选择其他语言，就像我们在本指南中所做的那样，您必须编写一个单独的应用程序，
该应用程序将通过套接字（UNIX或TCP）或gRPC与Tendermint Core进行通信。
本指南将向您展示如何使用RPC服务器构建外部应用程序。

拥有一个单独的应用程序可能会给您更好的安全保证，因为两个进程将通过已建立的二进制协议进行通信。Tendermint
Core将无法访问应用程序的状态。

## 1.1 安装Java和Gradle

请参阅[Oracle的JDK安装指南](https://www.oracle.com/technetwork/java/javase/downloads/index.html)。

验证您已成功安装Java：

```bash
$ java -version
java version "12.0.2" 2019-07-16
Java(TM) SE Runtime Environment (build 12.0.2+10)
Java HotSpot(TM) 64-Bit Server VM (build 12.0.2+10, mixed mode, sharing)
```

你可以选择任何高于或等于8的Java版本。
本指南是使用Java SE Development Kit 12编写的。

请确保设置了`$JAVA_HOME`环境变量：

```bash
$ echo $JAVA_HOME
/Library/Java/JavaVirtualMachines/jdk-12.0.2.jdk/Contents/Home
```

有关Gradle的安装，请参考[官方指南](https://gradle.org/install/)。

## 1.2 创建一个新的Java项目

我们将从创建一个新的Gradle项目开始。

```bash
export KVSTORE_HOME=~/kvstore
mkdir $KVSTORE_HOME
cd $KVSTORE_HOME
```

在示例目录中运行以下命令：

```bash
gradle init --dsl groovy --package io.example --project-name example --type java-application --test-framework junit
```

这将为您创建一个新的项目。文件树应该如下所示：

```bash
$ tree
.
|-- build.gradle
|-- gradle
|   `-- wrapper
|       |-- gradle-wrapper.jar
|       `-- gradle-wrapper.properties
|-- gradlew
|-- gradlew.bat
|-- settings.gradle
`-- src
    |-- main
    |   |-- java
    |   |   `-- io
    |   |       `-- example
    |   |           `-- App.java
    |   `-- resources
    `-- test
        |-- java
        |   `-- io
        |       `-- example
        |           `-- AppTest.java
        `-- resources
```

运行时，这应该将"Hello world."打印到标准输出。

```bash
$ ./gradlew run
> Task :run
Hello world.
```

## 1.3 编写Tendermint Core应用程序

Tendermint Core通过应用程序区块链接口（ABCI）与应用程序通信。所有消息类型都在[protobuf文件](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/tendermint/abci/types.proto)中定义。这使得Tendermint Core可以运行使用任何编程语言编写的应用程序。

### 1.3.1 编译.proto文件

在`build.gradle`的顶部添加以下内容：

```groovy
buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath 'com.google.protobuf:protobuf-gradle-plugin:0.8.8'
    }
}
```

在`build.gradle`的`plugins`部分启用protobuf插件：

```groovy
plugins {
    id 'com.google.protobuf' version '0.8.8'
}
```

在`build.gradle`中添加以下代码：

```groovy
protobuf {
    protoc {
        artifact = "com.google.protobuf:protoc:3.7.1"
    }
    plugins {
        grpc {
            artifact = 'io.grpc:protoc-gen-grpc-java:1.22.1'
        }
    }
    generateProtoTasks {
        all()*.plugins {
            grpc {}
        }
    }
}
```

现在我们应该准备好编译`*.proto`文件了。

将必要的`.proto`文件复制到您的项目中：

```bash
mkdir -p \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/abci \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/version \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/types \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/crypto \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/libs \
  $KVSTORE_HOME/src/main/proto/github.com/gogo/protobuf/gogoproto

cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/abci/types.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/abci/types.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/version/version.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/version/version.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/types/types.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/types/types.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/types/evidence.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/types/evidence.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/types/params.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/types/params.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/crypto/merkle.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/crypto/merkle.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/crypto/keys.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/crypto/keys.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/libs/types.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/libs/types.proto
cp $GOPATH/src/github.com/gogo/protobuf/gogoproto/gogo.proto \
   $KVSTORE_HOME/src/main/proto/github.com/gogo/protobuf/gogoproto/gogo.proto
```

将以下依赖项添加到`build.gradle`：

```groovy
dependencies {
    implementation 'io.grpc:grpc-protobuf:1.22.1'
    implementation 'io.grpc:grpc-netty-shaded:1.22.1'
    implementation 'io.grpc:grpc-stub:1.22.1'
}
```

要生成所有protobuf类型的类，请运行：

```bash
./gradlew generateProto
```

要验证一切是否顺利，您可以检查`build/generated/`目录：

```bash
$ tree build/generated/
build/generated/
|-- source
|   `-- proto
|       `-- main
|           |-- grpc
|           |   `-- types
|           |       `-- ABCIApplicationGrpc.java
|           `-- java
|               |-- com
|               |   `-- google
|               |       `-- protobuf
|               |           `-- GoGoProtos.java
|               |-- common
|               |   `-- Types.java
|               |-- merkle
|               |   `-- Merkle.java
|               `-- types
|                   `-- Types.java
```

### 1.3.2 实现ABCI

生成的`$KVSTORE_HOME/build/generated/source/proto/main/grpc/types/ABCIApplicationGrpc.java`文件包含了抽象类`ABCIApplicationImplBase`，这是我们需要实现的接口。

创建`$KVSTORE_HOME/src/main/java/io/example/KVStoreApp.java`文件，并使用以下内容：

```java
package io.example;

import io.grpc.stub.StreamObserver;
import types.ABCIApplicationGrpc;
import types.Types.*;

class KVStoreApp extends ABCIApplicationGrpc.ABCIApplicationImplBase {

    // methods implementation

}
```

现在，我将逐个解释`ABCIApplicationImplBase`的每个方法何时被调用，并添加所需的业务逻辑。

### 1.3.3 CheckTx

当向Tendermint Core添加新的交易时，它会要求应用程序对其进行检查（验证格式、签名等）。

```java
@Override
public void checkTx(RequestCheckTx req, StreamObserver<ResponseCheckTx> responseObserver) {
    var tx = req.getTx();
    int code = validate(tx);
    var resp = ResponseCheckTx.newBuilder()
            .setCode(code)
            .setGasWanted(1)
            .build();
    responseObserver.onNext(resp);
    responseObserver.onCompleted();
}

private int validate(ByteString tx) {
    List<byte[]> parts = split(tx, '=');
    if (parts.size() != 2) {
        return 1;
    }
    byte[] key = parts.get(0);
    byte[] value = parts.get(1);

    // check if the same key=value already exists
    var stored = getPersistedValue(key);
    if (stored != null && Arrays.equals(stored, value)) {
        return 2;
    }

    return 0;
}

private List<byte[]> split(ByteString tx, char separator) {
    var arr = tx.toByteArray();
    int i;
    for (i = 0; i < tx.size(); i++) {
        if (arr[i] == (byte)separator) {
            break;
        }
    }
    if (i == tx.size()) {
        return Collections.emptyList();
    }
    return List.of(
            tx.substring(0, i).toByteArray(),
            tx.substring(i + 1).toByteArray()
    );
}
```

如果交易不符合`{bytes}={bytes}`的形式，我们返回`1`代码。当相同的键值对已经存在（相同的键和值），我们返回`2`代码。对于其他情况，我们返回零代码，表示它们是有效的。

请注意，任何非零代码的内容将被Tendermint Core视为无效（例如`-1`、`100`等）。

有效的交易最终将被提交，前提是它们不太大且具有足够的gas。要了解有关gas的更多信息，请查看["the
specification"](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/apps.md#gas)。

对于底层的键值存储，我们将使用[JetBrains Xodus](https://github.com/JetBrains/xodus)，它是一个用Java编写的事务性无模式嵌入式高性能数据库。

`build.gradle`：

```groovy
dependencies {
    implementation 'org.jetbrains.xodus:xodus-environment:1.3.91'
}
```

```java
...
import jetbrains.exodus.ArrayByteIterable;
import jetbrains.exodus.ByteIterable;
import jetbrains.exodus.env.Environment;
import jetbrains.exodus.env.Store;
import jetbrains.exodus.env.StoreConfig;
import jetbrains.exodus.env.Transaction;

class KVStoreApp extends ABCIApplicationGrpc.ABCIApplicationImplBase {
    private Environment env;
    private Transaction txn = null;
    private Store store = null;

    KVStoreApp(Environment env) {
        this.env = env;
    }

    ...

    private byte[] getPersistedValue(byte[] k) {
        return env.computeInReadonlyTransaction(txn -> {
            var store = env.openStore("store", StoreConfig.WITHOUT_DUPLICATES, txn);
            ByteIterable byteIterable = store.get(txn, new ArrayByteIterable(k));
            if (byteIterable == null) {
                return null;
            }
            return byteIterable.getBytesUnsafe();
        });
    }
}
```

### 1.3.4 BeginBlock -> DeliverTx -> EndBlock -> Commit

当Tendermint Core决定区块时，它会将其以3个部分传递给应用程序：`BeginBlock`，每个交易一个`DeliverTx`，以及最后的`EndBlock`。`DeliverTx`是异步传输的，但是期望按顺序接收响应。

```java
@Override
public void beginBlock(RequestBeginBlock req, StreamObserver<ResponseBeginBlock> responseObserver) {
    txn = env.beginTransaction();
    store = env.openStore("store", StoreConfig.WITHOUT_DUPLICATES, txn);
    var resp = ResponseBeginBlock.newBuilder().build();
    responseObserver.onNext(resp);
    responseObserver.onCompleted();
}
```

在这里，我们开始一个新的事务，它将累积区块的交易并打开相应的存储。

```java
@Override
public void deliverTx(RequestDeliverTx req, StreamObserver<ResponseDeliverTx> responseObserver) {
    var tx = req.getTx();
    int code = validate(tx);
    if (code == 0) {
        List<byte[]> parts = split(tx, '=');
        var key = new ArrayByteIterable(parts.get(0));
        var value = new ArrayByteIterable(parts.get(1));
        store.put(txn, key, value);
    }
    var resp = ResponseDeliverTx.newBuilder()
            .setCode(code)
            .build();
    responseObserver.onNext(resp);
    responseObserver.onCompleted();
}
```

如果交易格式错误或相同的键值对已经存在，我们再次返回非零代码。否则，我们将其添加到存储中。

在当前设计中，一个区块可以包含不正确的交易（通过了`CheckTx`但未通过`DeliverTx`的交易，或由提议者直接包含的交易）。这是出于性能考虑而做的。

请注意，在`DeliverTx`中我们不能提交事务，因为在这种情况下，可能会并行调用`Query`，导致返回不一致的数据（即使实际块尚未提交，它也会报告某些值已经存在）。

`Commit`指示应用程序持久化新状态。

```java
@Override
public void commit(RequestCommit req, StreamObserver<ResponseCommit> responseObserver) {
    txn.commit();
    var resp = ResponseCommit.newBuilder()
            .setData(ByteString.copyFrom(new byte[8]))
            .build();
    responseObserver.onNext(resp);
    responseObserver.onCompleted();
}
```

### 1.3.5 查询

现在，当客户端想要知道特定的键/值是否存在时，它将调用Tendermint Core的RPC `/abci_query`端点，该端点将调用应用程序的`Query`方法。

应用程序可以自由提供自己的API。但是通过使用Tendermint Core作为代理，客户端（包括[轻客户端包](https://godoc.org/github.com/tendermint/tendermint/light)）可以在不同的应用程序之间利用统一的API。此外，他们不必为额外的证明调用单独的Tendermint Core API。

请注意，这里我们不包含证明。

```java
@Override
public void query(RequestQuery req, StreamObserver<ResponseQuery> responseObserver) {
    var k = req.getData().toByteArray();
    var v = getPersistedValue(k);
    var builder = ResponseQuery.newBuilder();
    if (v == null) {
        builder.setLog("does not exist");
    } else {
        builder.setLog("exists");
        builder.setKey(ByteString.copyFrom(k));
        builder.setValue(ByteString.copyFrom(v));
    }
    responseObserver.onNext(builder.build());
    responseObserver.onCompleted();
}
```

完整的规范可以在[这里](https://github.com/tendermint/tendermint/tree/v0.34.x/spec/abci/)找到。

## 1.4 启动应用程序和Tendermint Core实例

将以下代码放入`$KVSTORE_HOME/src/main/java/io/example/App.java`文件中：

```java
package io.example;

import jetbrains.exodus.env.Environment;
import jetbrains.exodus.env.Environments;

import java.io.IOException;

public class App {
    public static void main(String[] args) throws IOException, InterruptedException {
        try (Environment env = Environments.newInstance("tmp/storage")) {
            var app = new KVStoreApp(env);
            var server = new GrpcServer(app, 26658);
            server.start();
            server.blockUntilShutdown();
        }
    }
}
```

这是应用程序的入口点。
在这里，我们创建一个特殊的对象`Environment`，它知道在哪里存储应用程序状态。
然后，我们创建并启动gRPC服务器来处理Tendermint Core的请求。

使用以下内容创建`$KVSTORE_HOME/src/main/java/io/example/GrpcServer.java`文件：

```java
package io.example;

import io.grpc.BindableService;
import io.grpc.Server;
import io.grpc.ServerBuilder;

import java.io.IOException;

class GrpcServer {
    private Server server;

    GrpcServer(BindableService service, int port) {
        this.server = ServerBuilder.forPort(port)
                .addService(service)
                .build();
    }

    void start() throws IOException {
        server.start();
        System.out.println("gRPC server started, listening on $port");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("shutting down gRPC server since JVM is shutting down");
            GrpcServer.this.stop();
            System.out.println("server shut down");
        }));
    }

    private void stop() {
        server.shutdown();
    }

    /**
     * Await termination on the main thread since the grpc library uses daemon threads.
     */
    void blockUntilShutdown() throws InterruptedException {
        server.awaitTermination();
    }
}
```

## 1.5 启动和运行

要创建默认配置、nodeKey和私有验证器文件，请执行`tendermint init`。但在执行此操作之前，我们需要安装Tendermint Core。

```bash
$ rm -rf /tmp/example
$ cd $GOPATH/src/github.com/tendermint/tendermint
$ make install
$ TMHOME="/tmp/example" tendermint init

I[2019-07-16|18:20:36.480] Generated private validator                  module=main keyFile=/tmp/example/config/priv_validator_key.json stateFile=/tmp/example2/data/priv_validator_state.json
I[2019-07-16|18:20:36.481] Generated node key                           module=main path=/tmp/example/config/node_key.json
I[2019-07-16|18:20:36.482] Generated genesis file                       module=main path=/tmp/example/config/genesis.json
```

请随意探索生成的文件，它们可以在`/tmp/example/config`目录中找到。有关配置的文档可以在[这里](https://docs.tendermint.com/v0.34/tendermint-core/configuration.html)找到。

我们准备开始我们的应用程序：

```bash
./gradlew run

gRPC server started, listening on 26658
```

然后我们需要启动Tendermint Core并将其指向我们的应用程序。在应用程序目录中执行以下命令：

```bash
$ TMHOME="/tmp/example" tendermint node --abci grpc --proxy_app tcp://127.0.0.1:26658

I[2019-07-28|15:44:53.632] Version info                                 module=main software=0.32.1 block=10 p2p=7
I[2019-07-28|15:44:53.677] Starting Node                                module=main impl=Node
I[2019-07-28|15:44:53.681] Started node                                 module=main nodeInfo="{ProtocolVersion:{P2P:7 Block:10 App:0} ID_:7639e2841ccd47d5ae0f5aad3011b14049d3f452 ListenAddr:tcp://0.0.0.0:26656 Network:test-chain-Nhl3zk Version:0.32.1 Channels:4020212223303800 Moniker:Ivans-MacBook-Pro.local Other:{TxIndex:on RPCAddress:tcp://127.0.0.1:26657}}"
I[2019-07-28|15:44:54.801] Executed block                               module=state height=8 validTxs=0 invalidTxs=0
I[2019-07-28|15:44:54.814] Committed state                              module=state height=8 txs=0 appHash=0000000000000000
```

现在在终端中打开另一个选项卡并尝试发送一个交易：

```bash
$ curl -s 'localhost:26657/broadcast_tx_commit?tx="tendermint=rocks"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {
      "gasWanted": "1"
    },
    "deliver_tx": {},
    "hash": "CDD3C6DFA0A08CAEDF546F9938A2EEC232209C24AA0E4201194E0AFB78A2C2BB",
    "height": "33"
}
```

响应应该包含此交易提交的高度。

现在让我们检查给定的键是否存在以及其值：

```bash
$ curl -s 'localhost:26657/abci_query?data="tendermint"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "response": {
      "log": "exists",
      "key": "dGVuZGVybWludA==",
      "value": "cm9ja3My"
    }
  }
}
```

`dGVuZGVybWludA==`和`cm9ja3M=`分别是ASCII的`tendermint`和`rocks`的Base64编码。

## 结束语

我希望一切顺利，您的第一个（但希望不是最后一个）Tendermint Core应用程序已经启动并运行。如果没有，请在[Github上提出问题](https://github.com/tendermint/tendermint/issues/new/choose)。要深入了解，请阅读[文档](https://docs.tendermint.com/v0.34/)。

此示例项目的完整源代码可以在[此处](https://github.com/climber73/tendermint-abci-grpc-java)找到。


<!---
order: 3
--->

# Creating an application in Java

## Guide Assumptions

This guide is designed for beginners who want to get started with a Tendermint
Core application from scratch. It does not assume that you have any prior
experience with Tendermint Core.

Tendermint Core is Byzantine Fault Tolerant (BFT) middleware that takes a state
transition machine (your application) - written in any programming language - and securely
replicates it on many machines.

By following along with this guide, you'll create a Tendermint Core project
called kvstore, a (very) simple distributed BFT key-value store. The application (which should
implementing the blockchain interface (ABCI)) will be written in Java.

This guide assumes that you are not new to JVM world. If you are new please see [JVM Minimal Survival Guide](https://hadihariri.com/2013/12/29/jvm-minimal-survival-guide-for-the-dotnet-developer/#java-the-language-java-the-ecosystem-java-the-jvm) and [Gradle Docs](https://docs.gradle.org/current/userguide/userguide.html).

## Built-in app vs external app

If you use Golang, you can run your app and Tendermint Core in the same process to get maximum performance.
[Cosmos SDK](https://github.com/cosmos/cosmos-sdk) is written this way.
Please refer to [Writing a built-in Tendermint Core application in Go](./go-built-in.md) guide for details.

If you choose another language, like we did in this guide, you have to write a separate app,
which will communicate with Tendermint Core via a socket (UNIX or TCP) or gRPC.
This guide will show you how to build external application using RPC server.

Having a separate application might give you better security guarantees as two
processes would be communicating via established binary protocol. Tendermint
Core will not have access to application's state.

## 1.1 Installing Java and Gradle

Please refer to [the Oracle's guide for installing JDK](https://www.oracle.com/technetwork/java/javase/downloads/index.html).

Verify that you have installed Java successfully:

```bash
$ java -version
java version "12.0.2" 2019-07-16
Java(TM) SE Runtime Environment (build 12.0.2+10)
Java HotSpot(TM) 64-Bit Server VM (build 12.0.2+10, mixed mode, sharing)
```

You can choose any version of Java higher or equal to 8.
This guide is written using Java SE Development Kit 12.

Make sure you have `$JAVA_HOME` environment variable set:

```bash
$ echo $JAVA_HOME
/Library/Java/JavaVirtualMachines/jdk-12.0.2.jdk/Contents/Home
```

For Gradle installation, please refer to [their official guide](https://gradle.org/install/).

## 1.2 Creating a new Java project

We'll start by creating a new Gradle project.

```bash
export KVSTORE_HOME=~/kvstore
mkdir $KVSTORE_HOME
cd $KVSTORE_HOME
```

Inside the example directory run:

```bash
gradle init --dsl groovy --package io.example --project-name example --type java-application --test-framework junit
```

This will create a new project for you. The tree of files should look like:

```bash
$ tree
.
|-- build.gradle
|-- gradle
|   `-- wrapper
|       |-- gradle-wrapper.jar
|       `-- gradle-wrapper.properties
|-- gradlew
|-- gradlew.bat
|-- settings.gradle
`-- src
    |-- main
    |   |-- java
    |   |   `-- io
    |   |       `-- example
    |   |           `-- App.java
    |   `-- resources
    `-- test
        |-- java
        |   `-- io
        |       `-- example
        |           `-- AppTest.java
        `-- resources
```

When run, this should print "Hello world." to the standard output.

```bash
$ ./gradlew run
> Task :run
Hello world.
```

## 1.3 Writing a Tendermint Core application

Tendermint Core communicates with the application through the Application
BlockChain Interface (ABCI). All message types are defined in the [protobuf
file](https://github.com/tendermint/tendermint/blob/v0.34.x/proto/tendermint/abci/types.proto).
This allows Tendermint Core to run applications written in any programming
language.

### 1.3.1 Compile .proto files

Add the following piece to the top of the `build.gradle`:

```groovy
buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath 'com.google.protobuf:protobuf-gradle-plugin:0.8.8'
    }
}
```

Enable the protobuf plugin in the `plugins` section of the `build.gradle`:

```groovy
plugins {
    id 'com.google.protobuf' version '0.8.8'
}
```

Add the following code to `build.gradle`:

```groovy
protobuf {
    protoc {
        artifact = "com.google.protobuf:protoc:3.7.1"
    }
    plugins {
        grpc {
            artifact = 'io.grpc:protoc-gen-grpc-java:1.22.1'
        }
    }
    generateProtoTasks {
        all()*.plugins {
            grpc {}
        }
    }
}
```

Now we should be ready to compile the `*.proto` files.

Copy the necessary `.proto` files to your project:

```bash
mkdir -p \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/abci \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/version \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/types \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/crypto \
  $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/libs \
  $KVSTORE_HOME/src/main/proto/github.com/gogo/protobuf/gogoproto

cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/abci/types.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/abci/types.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/version/version.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/version/version.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/types/types.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/types/types.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/types/evidence.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/types/evidence.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/types/params.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/types/params.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/crypto/merkle.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/crypto/merkle.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/crypto/keys.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/crypto/keys.proto
cp $GOPATH/src/github.com/tendermint/tendermint/proto/tendermint/libs/types.proto \
   $KVSTORE_HOME/src/main/proto/github.com/tendermint/tendermint/proto/tendermint/libs/types.proto
cp $GOPATH/src/github.com/gogo/protobuf/gogoproto/gogo.proto \
   $KVSTORE_HOME/src/main/proto/github.com/gogo/protobuf/gogoproto/gogo.proto
```

Add these dependencies to `build.gradle`:

```groovy
dependencies {
    implementation 'io.grpc:grpc-protobuf:1.22.1'
    implementation 'io.grpc:grpc-netty-shaded:1.22.1'
    implementation 'io.grpc:grpc-stub:1.22.1'
}
```

To generate all protobuf-type classes run:

```bash
./gradlew generateProto
```

To verify that everything went smoothly, you can inspect the `build/generated/` directory:

```bash
$ tree build/generated/
build/generated/
|-- source
|   `-- proto
|       `-- main
|           |-- grpc
|           |   `-- types
|           |       `-- ABCIApplicationGrpc.java
|           `-- java
|               |-- com
|               |   `-- google
|               |       `-- protobuf
|               |           `-- GoGoProtos.java
|               |-- common
|               |   `-- Types.java
|               |-- merkle
|               |   `-- Merkle.java
|               `-- types
|                   `-- Types.java
```

### 1.3.2 Implementing ABCI

The resulting `$KVSTORE_HOME/build/generated/source/proto/main/grpc/types/ABCIApplicationGrpc.java` file
contains the abstract class `ABCIApplicationImplBase`, which is an interface we'll need to implement.

Create `$KVSTORE_HOME/src/main/java/io/example/KVStoreApp.java` file with the following content:

```java
package io.example;

import io.grpc.stub.StreamObserver;
import types.ABCIApplicationGrpc;
import types.Types.*;

class KVStoreApp extends ABCIApplicationGrpc.ABCIApplicationImplBase {

    // methods implementation

}
```

Now I will go through each method of `ABCIApplicationImplBase` explaining when it's called and adding
required business logic.

### 1.3.3 CheckTx

When a new transaction is added to the Tendermint Core, it will ask the
application to check it (validate the format, signatures, etc.).

```java
@Override
public void checkTx(RequestCheckTx req, StreamObserver<ResponseCheckTx> responseObserver) {
    var tx = req.getTx();
    int code = validate(tx);
    var resp = ResponseCheckTx.newBuilder()
            .setCode(code)
            .setGasWanted(1)
            .build();
    responseObserver.onNext(resp);
    responseObserver.onCompleted();
}

private int validate(ByteString tx) {
    List<byte[]> parts = split(tx, '=');
    if (parts.size() != 2) {
        return 1;
    }
    byte[] key = parts.get(0);
    byte[] value = parts.get(1);

    // check if the same key=value already exists
    var stored = getPersistedValue(key);
    if (stored != null && Arrays.equals(stored, value)) {
        return 2;
    }

    return 0;
}

private List<byte[]> split(ByteString tx, char separator) {
    var arr = tx.toByteArray();
    int i;
    for (i = 0; i < tx.size(); i++) {
        if (arr[i] == (byte)separator) {
            break;
        }
    }
    if (i == tx.size()) {
        return Collections.emptyList();
    }
    return List.of(
            tx.substring(0, i).toByteArray(),
            tx.substring(i + 1).toByteArray()
    );
}
```

Don't worry if this does not compile yet.

If the transaction does not have a form of `{bytes}={bytes}`, we return `1`
code. When the same key=value already exist (same key and value), we return `2`
code. For others, we return a zero code indicating that they are valid.

Note that anything with non-zero code will be considered invalid (`-1`, `100`,
etc.) by Tendermint Core.

Valid transactions will eventually be committed given they are not too big and
have enough gas. To learn more about gas, check out ["the
specification"](https://github.com/tendermint/tendermint/blob/v0.34.x/spec/abci/apps.md#gas).

For the underlying key-value store we'll use
[JetBrains Xodus](https://github.com/JetBrains/xodus), which is a transactional schema-less embedded high-performance database written in Java.

`build.gradle`:

```groovy
dependencies {
    implementation 'org.jetbrains.xodus:xodus-environment:1.3.91'
}
```

```java
...
import jetbrains.exodus.ArrayByteIterable;
import jetbrains.exodus.ByteIterable;
import jetbrains.exodus.env.Environment;
import jetbrains.exodus.env.Store;
import jetbrains.exodus.env.StoreConfig;
import jetbrains.exodus.env.Transaction;

class KVStoreApp extends ABCIApplicationGrpc.ABCIApplicationImplBase {
    private Environment env;
    private Transaction txn = null;
    private Store store = null;

    KVStoreApp(Environment env) {
        this.env = env;
    }

    ...

    private byte[] getPersistedValue(byte[] k) {
        return env.computeInReadonlyTransaction(txn -> {
            var store = env.openStore("store", StoreConfig.WITHOUT_DUPLICATES, txn);
            ByteIterable byteIterable = store.get(txn, new ArrayByteIterable(k));
            if (byteIterable == null) {
                return null;
            }
            return byteIterable.getBytesUnsafe();
        });
    }
}
```

### 1.3.4 BeginBlock -> DeliverTx -> EndBlock -> Commit

When Tendermint Core has decided on the block, it's transferred to the
application in 3 parts: `BeginBlock`, one `DeliverTx` per transaction and
`EndBlock` in the end. `DeliverTx` are being transferred asynchronously, but the
responses are expected to come in order.

```java
@Override
public void beginBlock(RequestBeginBlock req, StreamObserver<ResponseBeginBlock> responseObserver) {
    txn = env.beginTransaction();
    store = env.openStore("store", StoreConfig.WITHOUT_DUPLICATES, txn);
    var resp = ResponseBeginBlock.newBuilder().build();
    responseObserver.onNext(resp);
    responseObserver.onCompleted();
}
```

Here we begin a new transaction, which will accumulate the block's transactions and open the corresponding store.

```java
@Override
public void deliverTx(RequestDeliverTx req, StreamObserver<ResponseDeliverTx> responseObserver) {
    var tx = req.getTx();
    int code = validate(tx);
    if (code == 0) {
        List<byte[]> parts = split(tx, '=');
        var key = new ArrayByteIterable(parts.get(0));
        var value = new ArrayByteIterable(parts.get(1));
        store.put(txn, key, value);
    }
    var resp = ResponseDeliverTx.newBuilder()
            .setCode(code)
            .build();
    responseObserver.onNext(resp);
    responseObserver.onCompleted();
}
```

If the transaction is badly formatted or the same key=value already exist, we
again return the non-zero code. Otherwise, we add it to the store.

In the current design, a block can include incorrect transactions (those who
passed `CheckTx`, but failed `DeliverTx` or transactions included by the proposer
directly). This is done for performance reasons.

Note we can't commit transactions inside the `DeliverTx` because in such case
`Query`, which may be called in parallel, will return inconsistent data (i.e.
it will report that some value already exist even when the actual block was not
yet committed).

`Commit` instructs the application to persist the new state.

```java
@Override
public void commit(RequestCommit req, StreamObserver<ResponseCommit> responseObserver) {
    txn.commit();
    var resp = ResponseCommit.newBuilder()
            .setData(ByteString.copyFrom(new byte[8]))
            .build();
    responseObserver.onNext(resp);
    responseObserver.onCompleted();
}
```

### 1.3.5 Query

Now, when the client wants to know whenever a particular key/value exist, it
will call Tendermint Core RPC `/abci_query` endpoint, which in turn will call
the application's `Query` method.

Applications are free to provide their own APIs. But by using Tendermint Core
as a proxy, clients (including [light client
package](https://godoc.org/github.com/tendermint/tendermint/light)) can leverage
the unified API across different applications. Plus they won't have to call the
otherwise separate Tendermint Core API for additional proofs.

Note we don't include a proof here.

```java
@Override
public void query(RequestQuery req, StreamObserver<ResponseQuery> responseObserver) {
    var k = req.getData().toByteArray();
    var v = getPersistedValue(k);
    var builder = ResponseQuery.newBuilder();
    if (v == null) {
        builder.setLog("does not exist");
    } else {
        builder.setLog("exists");
        builder.setKey(ByteString.copyFrom(k));
        builder.setValue(ByteString.copyFrom(v));
    }
    responseObserver.onNext(builder.build());
    responseObserver.onCompleted();
}
```

The complete specification can be found
[here](https://github.com/tendermint/tendermint/tree/v0.34.x/spec/abci/).

## 1.4 Starting an application and a Tendermint Core instances

Put the following code into the `$KVSTORE_HOME/src/main/java/io/example/App.java` file:

```java
package io.example;

import jetbrains.exodus.env.Environment;
import jetbrains.exodus.env.Environments;

import java.io.IOException;

public class App {
    public static void main(String[] args) throws IOException, InterruptedException {
        try (Environment env = Environments.newInstance("tmp/storage")) {
            var app = new KVStoreApp(env);
            var server = new GrpcServer(app, 26658);
            server.start();
            server.blockUntilShutdown();
        }
    }
}
```

It is the entry point of the application.
Here we create a special object `Environment`, which knows where to store the application state.
Then we create and start the gRPC server to handle Tendermint Core requests.

Create the `$KVSTORE_HOME/src/main/java/io/example/GrpcServer.java` file with the following content:

```java
package io.example;

import io.grpc.BindableService;
import io.grpc.Server;
import io.grpc.ServerBuilder;

import java.io.IOException;

class GrpcServer {
    private Server server;

    GrpcServer(BindableService service, int port) {
        this.server = ServerBuilder.forPort(port)
                .addService(service)
                .build();
    }

    void start() throws IOException {
        server.start();
        System.out.println("gRPC server started, listening on $port");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("shutting down gRPC server since JVM is shutting down");
            GrpcServer.this.stop();
            System.out.println("server shut down");
        }));
    }

    private void stop() {
        server.shutdown();
    }

    /**
     * Await termination on the main thread since the grpc library uses daemon threads.
     */
    void blockUntilShutdown() throws InterruptedException {
        server.awaitTermination();
    }
}
```

## 1.5 Getting Up and Running

To create a default configuration, nodeKey and private validator files, let's
execute `tendermint init`. But before we do that, we will need to install
Tendermint Core.

```bash
$ rm -rf /tmp/example
$ cd $GOPATH/src/github.com/tendermint/tendermint
$ make install
$ TMHOME="/tmp/example" tendermint init

I[2019-07-16|18:20:36.480] Generated private validator                  module=main keyFile=/tmp/example/config/priv_validator_key.json stateFile=/tmp/example2/data/priv_validator_state.json
I[2019-07-16|18:20:36.481] Generated node key                           module=main path=/tmp/example/config/node_key.json
I[2019-07-16|18:20:36.482] Generated genesis file                       module=main path=/tmp/example/config/genesis.json
```

Feel free to explore the generated files, which can be found at
`/tmp/example/config` directory. Documentation on the config can be found
[here](https://docs.tendermint.com/v0.34/tendermint-core/configuration.html).

We are ready to start our application:

```bash
./gradlew run

gRPC server started, listening on 26658
```

Then we need to start Tendermint Core and point it to our application. Staying
within the application directory execute:

```bash
$ TMHOME="/tmp/example" tendermint node --abci grpc --proxy_app tcp://127.0.0.1:26658

I[2019-07-28|15:44:53.632] Version info                                 module=main software=0.32.1 block=10 p2p=7
I[2019-07-28|15:44:53.677] Starting Node                                module=main impl=Node
I[2019-07-28|15:44:53.681] Started node                                 module=main nodeInfo="{ProtocolVersion:{P2P:7 Block:10 App:0} ID_:7639e2841ccd47d5ae0f5aad3011b14049d3f452 ListenAddr:tcp://0.0.0.0:26656 Network:test-chain-Nhl3zk Version:0.32.1 Channels:4020212223303800 Moniker:Ivans-MacBook-Pro.local Other:{TxIndex:on RPCAddress:tcp://127.0.0.1:26657}}"
I[2019-07-28|15:44:54.801] Executed block                               module=state height=8 validTxs=0 invalidTxs=0
I[2019-07-28|15:44:54.814] Committed state                              module=state height=8 txs=0 appHash=0000000000000000
```

Now open another tab in your terminal and try sending a transaction:

```bash
$ curl -s 'localhost:26657/broadcast_tx_commit?tx="tendermint=rocks"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "check_tx": {
      "gasWanted": "1"
    },
    "deliver_tx": {},
    "hash": "CDD3C6DFA0A08CAEDF546F9938A2EEC232209C24AA0E4201194E0AFB78A2C2BB",
    "height": "33"
}
```

Response should contain the height where this transaction was committed.

Now let's check if the given key now exists and its value:

```bash
$ curl -s 'localhost:26657/abci_query?data="tendermint"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "response": {
      "log": "exists",
      "key": "dGVuZGVybWludA==",
      "value": "cm9ja3My"
    }
  }
}
```

`dGVuZGVybWludA==` and `cm9ja3M=` are the base64-encoding of the ASCII of `tendermint` and `rocks` accordingly.

## Outro

I hope everything went smoothly and your first, but hopefully not the last,
Tendermint Core application is up and running. If not, please [open an issue on
Github](https://github.com/tendermint/tendermint/issues/new/choose). To dig
deeper, read [the docs](https://docs.tendermint.com/v0.34/).

The full source code of this example project can be found [here](https://github.com/climber73/tendermint-abci-grpc-java).
