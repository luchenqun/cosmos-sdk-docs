---
order: 2
---

# Docker Compose

使用Docker Compose，您可以使用一个命令启动本地测试网络。

## 要求

1. [安装 tendermint](../introduction/install.md)
2. [安装 docker](https://docs.docker.com/engine/installation/)
3. [安装 docker-compose](https://docs.docker.com/compose/install/)

## 构建

构建 `tendermint` 二进制文件，以及可选的 `tendermint/localnode`
docker 镜像。

请注意，二进制文件将被挂载到容器中，因此可以在不重新构建镜像的情况下进行更新。

```sh
# Build the linux binary in ./build
make build-linux

# (optionally) Build tendermint/localnode image
make build-docker-localnode
```

## 运行测试网络

要启动一个包含 4 个节点的测试网络，请运行以下命令：

```sh
make localnet-start
```

节点将将其 RPC 服务器绑定到主机上的端口 26657、26660、26662 和 26664。

此文件使用 localnode 镜像创建了一个包含 4 个节点的网络。

网络的节点将其 P2P 和 RPC 端点暴露给主机机器，分别使用端口 26656-26657、26659-26660、26661-26662 和 26663-26664。

要更新二进制文件，只需重新构建并重新启动节点：

```sh
make build-linux
make localnet-start
```

## 配置

`make localnet-start` 命令通过调用 `tendermint testnet` 命令在 `./build` 目录下创建了一个包含 4 个节点的测试网络的文件。

`./build` 目录被挂载到 `/tendermint` 挂载点，以将二进制文件和配置文件附加到容器中。

要更改验证人/非验证人的数量，请在 [这里](../../Makefile) 更改 `localnet-start` Makefile 目标：

```makefile
localnet-start: localnet-stop
  @if ! [ -f build/node0/config/genesis.json ]; then docker run --rm -v $(CURDIR)/build:/tendermint:Z tendermint/localnode testnet --v 5 --n 3 --o . --populate-persistent-peers --starting-ip-address 192.167.10.2 ; fi
  docker-compose up
```

现在，该命令将为 5 个验证人和 3 个非验证人生成配置文件。除了生成新的配置文件外，还需要编辑 docker-compose 文件。
为了充分利用生成的配置文件，需要添加 4 个额外的节点。

```yml
  node3: # bump by 1 for every node
    container_name: node3 # bump by 1 for every node
    image: "tendermint/localnode"
    environment:
      - ID=3
      - LOG=${LOG:-tendermint.log}
    ports:
      - "26663-26664:26656-26657" # Bump 26663-26664 by one for every node
    volumes:
      - ./build:/tendermint:Z
    networks:
      localnet:
        ipv4_address: 192.167.10.5 # bump the final digit by 1 for every node
```

在运行之前，不要忘记清理旧文件：

```sh
# 清理 build 文件夹
rm -rf ./build/node*
```

## 配置 ABCI 容器

要在 4 个节点设置中使用自己的 ABCI 应用程序，请编辑 [docker-compose.yaml](https://github.com/tendermint/tendermint/blob/v0.34.x/docker-compose.yml) 文件，并将图像添加到您的 ABCI 应用程序中。

```yml
 abci0:
    container_name: abci0
    image: "abci-image"
    build:
      context: .
      dockerfile: abci.Dockerfile
    command: <insert command to run your abci application>
    networks:
      localnet:
        ipv4_address: 192.167.10.6

  abci1:
    container_name: abci1
    image: "abci-image"
    build:
      context: .
      dockerfile: abci.Dockerfile
    command: <insert command to run your abci application>
    networks:
      localnet:
        ipv4_address: 192.167.10.7

  abci2:
    container_name: abci2
    image: "abci-image"
    build:
      context: .
      dockerfile: abci.Dockerfile
    command: <insert command to run your abci application>
    networks:
      localnet:
        ipv4_address: 192.167.10.8

  abci3:
    container_name: abci3
    image: "abci-image"
    build:
      context: .
      dockerfile: abci.Dockerfile
    command: <insert command to run your abci application>
    networks:
      localnet:
        ipv4_address: 192.167.10.9

```

覆盖每个节点中的[命令](https://github.com/tendermint/tendermint/blob/v0.34.x/networks/local/localnode/Dockerfile#L12)，以连接到其ABCI。

```yml
  node0:
    container_name: node0
    image: "tendermint/localnode"
    ports:
      - "26656-26657:26656-26657"
    environment:
      - ID=0
      - LOG=$${LOG:-tendermint.log}
    volumes:
      - ./build:/tendermint:Z
    command: node --proxy_app=tcp://abci0:26658
    networks:
      localnet:
        ipv4_address: 192.167.10.2
```

同样地，对于node1、node2和node3，然后[运行测试网络](https://github.com/tendermint/tendermint/blob/v0.34.x/docs/networks/docker-compose.md#run-a-testnet)

## 日志

日志保存在附加的卷中，位于`tendermint.log`文件中。如果在启动时将`LOG`环境变量设置为`stdout`，则日志不会被保存，而是打印在屏幕上。

## 特殊二进制文件

如果您有多个具有不同名称的二进制文件，您可以使用`BINARY`环境变量指定要运行的二进制文件。二进制文件的路径是相对于附加的卷。


---
order: 2
---

# Docker Compose

With Docker Compose, you can spin up local testnets with a single command.

## Requirements

1. [Install tendermint](../introduction/install.md)
2. [Install docker](https://docs.docker.com/engine/installation/)
3. [Install docker-compose](https://docs.docker.com/compose/install/)

## Build

Build the `tendermint` binary and, optionally, the `tendermint/localnode`
docker image.

Note the binary will be mounted into the container so it can be updated without
rebuilding the image.

```sh
# Build the linux binary in ./build
make build-linux

# (optionally) Build tendermint/localnode image
make build-docker-localnode
```

## Run a testnet

To start a 4 node testnet run:

```sh
make localnet-start
```

The nodes bind their RPC servers to ports 26657, 26660, 26662, and 26664 on the
host.

This file creates a 4-node network using the localnode image.

The nodes of the network expose their P2P and RPC endpoints to the host machine
on ports 26656-26657, 26659-26660, 26661-26662, and 26663-26664 respectively.

To update the binary, just rebuild it and restart the nodes:

```sh
make build-linux
make localnet-start
```

## Configuration

The `make localnet-start` creates files for a 4-node testnet in `./build` by
calling the `tendermint testnet` command.

The `./build` directory is mounted to the `/tendermint` mount point to attach
the binary and config files to the container.

To change the number of validators / non-validators change the `localnet-start` Makefile target [here](../../Makefile):

```makefile
localnet-start: localnet-stop
  @if ! [ -f build/node0/config/genesis.json ]; then docker run --rm -v $(CURDIR)/build:/tendermint:Z tendermint/localnode testnet --v 5 --n 3 --o . --populate-persistent-peers --starting-ip-address 192.167.10.2 ; fi
  docker-compose up
```

The command now will generate config files for 5 validators and 3
non-validators. Along with generating new config files the docker-compose file needs to be edited.
Adding 4 more nodes is required in order to fully utilize the config files that were generated.

```yml
  node3: # bump by 1 for every node
    container_name: node3 # bump by 1 for every node
    image: "tendermint/localnode"
    environment:
      - ID=3
      - LOG=${LOG:-tendermint.log}
    ports:
      - "26663-26664:26656-26657" # Bump 26663-26664 by one for every node
    volumes:
      - ./build:/tendermint:Z
    networks:
      localnet:
        ipv4_address: 192.167.10.5 # bump the final digit by 1 for every node
```

Before running it, don't forget to cleanup the old files:

```sh
# Clear the build folder
rm -rf ./build/node*
```

## Configuring ABCI containers

To use your own ABCI applications with 4-node setup edit the [docker-compose.yaml](https://github.com/tendermint/tendermint/blob/v0.34.x/docker-compose.yml) file and add image to your ABCI application.

```yml
 abci0:
    container_name: abci0
    image: "abci-image"
    build:
      context: .
      dockerfile: abci.Dockerfile
    command: <insert command to run your abci application>
    networks:
      localnet:
        ipv4_address: 192.167.10.6

  abci1:
    container_name: abci1
    image: "abci-image"
    build:
      context: .
      dockerfile: abci.Dockerfile
    command: <insert command to run your abci application>
    networks:
      localnet:
        ipv4_address: 192.167.10.7

  abci2:
    container_name: abci2
    image: "abci-image"
    build:
      context: .
      dockerfile: abci.Dockerfile
    command: <insert command to run your abci application>
    networks:
      localnet:
        ipv4_address: 192.167.10.8

  abci3:
    container_name: abci3
    image: "abci-image"
    build:
      context: .
      dockerfile: abci.Dockerfile
    command: <insert command to run your abci application>
    networks:
      localnet:
        ipv4_address: 192.167.10.9

```

Override the [command](https://github.com/tendermint/tendermint/blob/v0.34.x/networks/local/localnode/Dockerfile#L12) in each node to connect to it's ABCI.

```yml
  node0:
    container_name: node0
    image: "tendermint/localnode"
    ports:
      - "26656-26657:26656-26657"
    environment:
      - ID=0
      - LOG=$${LOG:-tendermint.log}
    volumes:
      - ./build:/tendermint:Z
    command: node --proxy_app=tcp://abci0:26658
    networks:
      localnet:
        ipv4_address: 192.167.10.2
```

Similarly do for node1, node2 and node3 then [run testnet](https://github.com/tendermint/tendermint/blob/v0.34.x/docs/networks/docker-compose.md#run-a-testnet)

## Logging

Log is saved under the attached volume, in the `tendermint.log` file. If the
`LOG` environment variable is set to `stdout` at start, the log is not saved,
but printed on the screen.

## Special binaries

If you have multiple binaries with different names, you can specify which one
to run with the `BINARY` environment variable. The path of the binary is relative
to the attached volume.
