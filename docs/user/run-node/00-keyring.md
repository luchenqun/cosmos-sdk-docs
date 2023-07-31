# 设置密钥环

:::note 概要
本文档描述了如何配置和使用密钥环及其各种后端，用于与[**应用程序**](../../develop/high-level-concepts/00-overview-app.md)进行交互。
:::

密钥环保存了用于与节点进行交互的私钥/公钥对。例如，在运行区块链节点之前，需要设置验证器密钥，以便正确签名区块。私钥可以存储在不同的位置，称为“后端”，例如文件或操作系统自带的密钥存储。

## 密钥环的可用后端

从v0.38.0版本开始，Cosmos SDK提供了一个新的密钥环实现，以安全的方式提供一组命令来管理加密密钥。新的密钥环支持多个存储后端，其中一些可能在所有操作系统上都不可用。

### `os` 后端

`os` 后端依赖于操作系统特定的默认设置来安全处理密钥存储。通常，操作系统的凭据子系统根据用户的密码策略处理密码提示、私钥存储和用户会话。下面是一些最受欢迎的操作系统及其相应的密码管理器列表：

* macOS: [Keychain](https://support.apple.com/en-gb/guide/keychain-access/welcome/mac)
* Windows: [Credentials Management API](https://docs.microsoft.com/en-us/windows/win32/secauthn/credentials-management)
* GNU/Linux:
    * [libsecret](https://gitlab.gnome.org/GNOME/libsecret)
    * [kwallet](https://api.kde.org/frameworks/kwallet/html/index.html)

默认桌面环境为GNOME的GNU/Linux发行版通常配备了[Seahorse](https://wiki.gnome.org/Apps/Seahorse)。基于KDE的发行版通常提供[KDE Wallet Manager](https://userbase.kde.org/KDE_Wallet_Manager)。前者实际上是`libsecret`的便捷前端，而后者是`kwallet`的客户端。

`os` 是默认选项，因为操作系统的默认凭据管理器旨在满足用户的常见需求，并为他们提供舒适的体验，同时不会影响安全性。

推荐用于无头环境的后端是 `file` 和 `pass`。

### `file` 后端

`file` 后端更接近于 v0.38.1 之前使用的 keybase 实现。它将密钥环以加密形式存储在应用程序的配置目录中。每次访问密钥环时都会要求输入密码，这可能会在单个命令中多次发生，导致重复的密码提示。如果使用 bash 脚本使用 `file` 选项执行命令，您可能希望使用以下格式来处理多个提示：

```shell
# assuming that KEYPASSWD is set in the environment
$ gaiacli config keyring-backend file                             # use file backend
$ (echo $KEYPASSWD; echo $KEYPASSWD) | gaiacli keys add me        # multiple prompts
$ echo $KEYPASSWD | gaiacli keys show me                          # single prompt
```

:::tip
第一次向空的密钥环添加密钥时，会提示您两次输入密码。
:::

### `pass` 后端

`pass` 后端使用 [pass](https://www.passwordstore.org/) 实用程序来管理密钥的敏感数据和元数据的磁盘加密。密钥存储在应用程序特定目录中的 `gpg` 加密文件中。`pass` 可用于最流行的 UNIX 操作系统以及 GNU/Linux 发行版。请参考其手册页面以获取有关如何下载和安装的信息。

:::tip
**pass** 使用 [GnuPG](https://gnupg.org/) 进行加密。`gpg` 在执行时会自动调用 `gpg-agent` 守护程序，用于处理 GnuPG 凭据的缓存。请参考 `gpg-agent` 的手册页面，了解如何配置缓存参数，例如凭据 TTL 和密码过期时间。
:::

首次使用前必须设置密码存储库：

```shell
pass init <GPG_KEY_ID>
```

将 `<GPG_KEY_ID>` 替换为您的 GPG 密钥 ID。您可以使用个人 GPG 密钥或其他您希望专门用于加密密码存储库的密钥。

### `kwallet` 后端

`kwallet` 后端使用 `KDE Wallet Manager`，它默认安装在以 KDE 为默认桌面环境的 GNU/Linux 发行版上。请参考[KWallet 手册](https://docs.kde.org/stable5/en/kdeutils/kwallet5/index.html)以获取更多信息。

### `test` 后端

`test` 后端是 `file` 后端的无密码变体。密钥以明文形式存储在磁盘上。

**仅供测试目的使用。不建议在生产环境中使用`test`后端**。

### `memory`后端

`memory`后端将键存储在内存中。程序退出后，键会立即被删除。

**仅供测试目的使用。不建议在生产环境中使用`memory`后端**。

### 使用环境变量设置后端

您可以使用环境变量`BINNAME_KEYRING_BACKEND`来设置`keyring-backend`。例如，如果您的二进制文件名是`gaia-v5`，则设置为：`export GAIA_V5_KEYRING_BACKEND=pass`

## 将键添加到密钥环中

:::warning
确保您可以构建自己的二进制文件，并在代码片段中将`simd`替换为您的二进制文件名。
:::

使用Cosmos SDK开发的应用程序带有`keys`子命令。在本教程中，我们正在运行`simd` CLI，它是使用Cosmos SDK构建的用于测试和教育目的的应用程序。有关更多信息，请参见[`simapp`](https://github.com/cosmos/cosmos-sdk/tree/main/simapp)。

您可以使用`simd keys`获取有关`keys`命令的帮助，使用`simd keys [command] --help`获取有关特定子命令的更多信息。

要在密钥环中创建一个新的密钥，请使用`add`子命令和`<key_name>`参数。在本教程中，我们将仅使用`test`后端，并将新密钥命名为`my_validator`。此密钥将在下一节中使用。

```bash
$ simd keys add my_validator --keyring-backend test

# Put the generated address in a variable for later use.
MY_VALIDATOR_ADDRESS=$(simd keys show my_validator -a --keyring-backend test)
```

此命令生成一个新的24个单词的助记词短语，将其持久化到相关后端，并输出有关密钥对的信息。如果此密钥对将用于持有带有价值的代币，请务必将助记词短语写在安全的地方！

默认情况下，密钥环生成一个`secp256k1`密钥对。密钥环还支持`ed25519`密钥，可以通过传递`--algo ed25519`标志来创建。密钥环当然可以同时持有这两种类型的密钥，而Cosmos SDK的`x/auth`模块本地支持这两种公钥算法。




# Setting up the keyring

:::note Synopsis
This document describes how to configure and use the keyring and its various backends for an [**application**](../../develop/high-level-concepts/00-overview-app.md).
:::

The keyring holds the private/public keypairs used to interact with a node. For instance, a validator key needs to be set up before running the blockchain node, so that blocks can be correctly signed. The private key can be stored in different locations, called "backends", such as a file or the operating system's own key storage.

## Available backends for the keyring

Starting with the v0.38.0 release, Cosmos SDK comes with a new keyring implementation
that provides a set of commands to manage cryptographic keys in a secure fashion. The
new keyring supports multiple storage backends, some of which may not be available on
all operating systems.

### The `os` backend

The `os` backend relies on operating system-specific defaults to handle key storage
securely. Typically, an operating system's credential sub-system handles password prompts,
private keys storage, and user sessions according to the user's password policies. Here
is a list of the most popular operating systems and their respective passwords manager:

* macOS: [Keychain](https://support.apple.com/en-gb/guide/keychain-access/welcome/mac)
* Windows: [Credentials Management API](https://docs.microsoft.com/en-us/windows/win32/secauthn/credentials-management)
* GNU/Linux:
    * [libsecret](https://gitlab.gnome.org/GNOME/libsecret)
    * [kwallet](https://api.kde.org/frameworks/kwallet/html/index.html)

GNU/Linux distributions that use GNOME as default desktop environment typically come with
[Seahorse](https://wiki.gnome.org/Apps/Seahorse). Users of KDE based distributions are
commonly provided with [KDE Wallet Manager](https://userbase.kde.org/KDE_Wallet_Manager).
Whilst the former is in fact a `libsecret` convenient frontend, the latter is a `kwallet`
client.

`os` is the default option since operating system's default credentials managers are
designed to meet users' most common needs and provide them with a comfortable
experience without compromising on security.

The recommended backends for headless environments are `file` and `pass`.

### The `file` backend

The `file` backend more closely resembles the keybase implementation used prior to
v0.38.1. It stores the keyring encrypted within the app's configuration directory. This
keyring will request a password each time it is accessed, which may occur multiple
times in a single command resulting in repeated password prompts. If using bash scripts
to execute commands using the `file` option you may want to utilize the following format
for multiple prompts:

```shell
# assuming that KEYPASSWD is set in the environment
$ gaiacli config keyring-backend file                             # use file backend
$ (echo $KEYPASSWD; echo $KEYPASSWD) | gaiacli keys add me        # multiple prompts
$ echo $KEYPASSWD | gaiacli keys show me                          # single prompt
```

:::tip
The first time you add a key to an empty keyring, you will be prompted to type the password twice.
:::

### The `pass` backend

The `pass` backend uses the [pass](https://www.passwordstore.org/) utility to manage on-disk
encryption of keys' sensitive data and metadata. Keys are stored inside `gpg` encrypted files
within app-specific directories. `pass` is available for the most popular UNIX
operating systems as well as GNU/Linux distributions. Please refer to its manual page for
information on how to download and install it.

:::tip
**pass** uses [GnuPG](https://gnupg.org/) for encryption. `gpg` automatically invokes the `gpg-agent`
daemon upon execution, which handles the caching of GnuPG credentials. Please refer to `gpg-agent`
man page for more information on how to configure cache parameters such as credentials TTL and
passphrase expiration.
:::

The password store must be set up prior to first use:

```shell
pass init <GPG_KEY_ID>
```

Replace `<GPG_KEY_ID>` with your GPG key ID. You can use your personal GPG key or an alternative
one you may want to use specifically to encrypt the password store.

### The `kwallet` backend

The `kwallet` backend uses `KDE Wallet Manager`, which comes installed by default on the
GNU/Linux distributions that ships KDE as default desktop environment. Please refer to
[KWallet Handbook](https://docs.kde.org/stable5/en/kdeutils/kwallet5/index.html) for more
information.

### The `test` backend

The `test` backend is a password-less variation of the `file` backend. Keys are stored
unencrypted on disk.

**Provided for testing purposes only. The `test` backend is not recommended for use in production environments**.

### The `memory` backend

The `memory` backend stores keys in memory. The keys are immediately deleted after the program has exited.

**Provided for testing purposes only. The `memory` backend is not recommended for use in production environments**.

### Setting backend using the env variable 

You can set the keyring-backend using env variable: `BINNAME_KEYRING_BACKEND`. For example, if you binary name is `gaia-v5` then set: `export GAIA_V5_KEYRING_BACKEND=pass`

## Adding keys to the keyring

:::warning
Make sure you can build your own binary, and replace `simd` with the name of your binary in the snippets.
:::

Applications developed using the Cosmos SDK come with the `keys` subcommand. For the purpose of this tutorial, we're running the `simd` CLI, which is an application built using the Cosmos SDK for testing and educational purposes. For more information, see [`simapp`](https://github.com/cosmos/cosmos-sdk/tree/main/simapp).

You can use `simd keys` for help about the keys command and `simd keys [command] --help` for more information about a particular subcommand.

To create a new key in the keyring, run the `add` subcommand with a `<key_name>` argument. For the purpose of this tutorial, we will solely use the `test` backend, and call our new key `my_validator`. This key will be used in the next section.

```bash
$ simd keys add my_validator --keyring-backend test

# Put the generated address in a variable for later use.
MY_VALIDATOR_ADDRESS=$(simd keys show my_validator -a --keyring-backend test)
```

This command generates a new 24-word mnemonic phrase, persists it to the relevant backend, and outputs information about the keypair. If this keypair will be used to hold value-bearing tokens, be sure to write down the mnemonic phrase somewhere safe!

By default, the keyring generates a `secp256k1` keypair. The keyring also supports `ed25519` keys, which may be created by passing the `--algo ed25519` flag. A keyring can of course hold both types of keys simultaneously, and the Cosmos SDK's `x/auth` module supports natively these two public key algorithms.
