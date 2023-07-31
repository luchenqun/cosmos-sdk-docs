---
order: 3
---

# 安装 Tendermint

## 从二进制文件安装

要下载预编译的二进制文件，请参阅[发布页面](https://github.com/tendermint/tendermint/releases)。

## 从源代码安装

您需要先[安装](https://golang.org/doc/install) `go` 并设置所需的环境变量，可以使用以下命令完成：

```sh
echo export GOPATH=\"\$HOME/go\" >> ~/.bash_profile
echo export PATH=\"\$PATH:\$GOPATH/bin\" >> ~/.bash_profile
```

### 获取源代码

```sh
git clone https://github.com/tendermint/tendermint.git
cd tendermint
```

### 编译

```sh
make install
```

将二进制文件放在 `$GOPATH/bin` 中，或者使用：

```sh
make build
```

将二进制文件放在 `./build` 中。

免责声明：Tendermint 的二进制文件是在没有 DWARF 符号表的情况下构建/安装的。如果您希望使用 DWARF 符号和调试信息构建/安装 Tendermint，请从 makefile 的 `BUILD_FLAGS` 中删除 `-s -w`。

最新的 Tendermint 已经安装完成。您可以通过运行以下命令来验证安装：

```sh
tendermint version
```

## 运行

要启动一个带有简单内部应用程序的单节点区块链：

```sh
tendermint init
tendermint node --proxy_app=kvstore
```

## 重新安装

如果您已经安装了 Tendermint，并且进行了更新，只需运行：

```sh
make install
```

要升级，请运行：

```sh
git pull origin master
make install
```

## 使用 CLevelDB 支持进行编译

安装 [LevelDB](https://github.com/google/leveldb)（最低版本为 1.7）。

使用 snappy 安装 LevelDB（可选）。以下是 Ubuntu 的命令：

```sh
sudo apt-get update
sudo apt install build-essential

sudo apt-get install libsnappy-dev

wget https://github.com/google/leveldb/archive/v1.20.tar.gz && \
  tar -zxvf v1.20.tar.gz && \
  cd leveldb-1.20/ && \
  make && \
  sudo cp -r out-static/lib* out-shared/lib* /usr/local/lib/ && \
  cd include/ && \
  sudo cp -r leveldb /usr/local/include/ && \
  sudo ldconfig && \
  rm -f v1.20.tar.gz
```

将数据库后端设置为 `cleveldb`：

```toml
# config/config.toml
db_backend = "cleveldb"
```

要安装 Tendermint，请运行：

```sh
CGO_LDFLAGS="-lsnappy" make install TENDERMINT_BUILD_OPTIONS=cleveldb
```

或者运行：

```sh
CGO_LDFLAGS="-lsnappy" make build TENDERMINT_BUILD_OPTIONS=cleveldb
```

将二进制文件放在 `./build` 中。


---
order: 3
---

# Install Tendermint

## From Binary

To download pre-built binaries, see the [releases page](https://github.com/tendermint/tendermint/releases).

## From Source

You'll need `go` [installed](https://golang.org/doc/install) and the required
environment variables set, which can be done with the following commands:

```sh
echo export GOPATH=\"\$HOME/go\" >> ~/.bash_profile
echo export PATH=\"\$PATH:\$GOPATH/bin\" >> ~/.bash_profile
```

### Get Source Code

```sh
git clone https://github.com/tendermint/tendermint.git
cd tendermint
```

### Compile

```sh
make install
```

to put the binary in `$GOPATH/bin` or use:

```sh
make build
```

to put the binary in `./build`.

_DISCLAIMER_ The binary of Tendermint is build/installed without the DWARF
symbol table. If you would like to build/install Tendermint with the DWARF
symbol and debug information, remove `-s -w` from `BUILD_FLAGS` in the make
file.

The latest Tendermint is now installed. You can verify the installation by
running:

```sh
tendermint version
```

## Run

To start a one-node blockchain with a simple in-process application:

```sh
tendermint init
tendermint node --proxy_app=kvstore
```

## Reinstall

If you already have Tendermint installed, and you make updates, simply

```sh
make install
```

To upgrade, run

```sh
git pull origin master
make install
```

## Compile with CLevelDB support

Install [LevelDB](https://github.com/google/leveldb) (minimum version is 1.7).

Install LevelDB with snappy (optionally). Below are commands for Ubuntu:

```sh
sudo apt-get update
sudo apt install build-essential

sudo apt-get install libsnappy-dev

wget https://github.com/google/leveldb/archive/v1.20.tar.gz && \
  tar -zxvf v1.20.tar.gz && \
  cd leveldb-1.20/ && \
  make && \
  sudo cp -r out-static/lib* out-shared/lib* /usr/local/lib/ && \
  cd include/ && \
  sudo cp -r leveldb /usr/local/include/ && \
  sudo ldconfig && \
  rm -f v1.20.tar.gz
```

Set a database backend to `cleveldb`:

```toml
# config/config.toml
db_backend = "cleveldb"
```

To install Tendermint, run:

```sh
CGO_LDFLAGS="-lsnappy" make install TENDERMINT_BUILD_OPTIONS=cleveldb
```

or run:

```sh
CGO_LDFLAGS="-lsnappy" make build TENDERMINT_BUILD_OPTIONS=cleveldb
```

which puts the binary in `./build`.
