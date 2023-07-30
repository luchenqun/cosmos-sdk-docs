# ADR 006: Secret Store Replacement

## 更新日志

* 2019年7月29日：初稿
* 2019年9月11日：开始工作
* 11月4日：合并了Cosmos SDK的更改
* 11月18日：合并了Gaia的更改

## 背景

目前，Cosmos SDK应用程序的CLI目录将密钥材料和元数据存储在用户的主目录中的纯文本数据库中。密钥材料由密码短语加密，受bcrypt哈希算法保护。元数据（例如地址、公钥、密钥存储详细信息）以纯文本形式可用。

这种做法有许多不可取之处。可能最大的原因是密钥材料和元数据的安全保护不足。泄露纯文本会使攻击者能够通过多种技术（如受损的依赖项而无需任何特权执行）监视给定计算机控制的密钥。这可能随后对特定用户/计算机进行更有针对性的攻击。

所有现代桌面计算机操作系统（Ubuntu、Debian、MacOS、Windows）都提供了一个内置的秘密存储，旨在允许应用程序存储与所有其他应用程序隔离并需要输入密码才能访问数据的信息。

我们正在寻找一种解决方案，为许多不同的后端提供一个通用的抽象层，并为不提供本地秘密存储的最小平台提供合理的回退。

## 决策

我们建议使用99 designs的[Keyring](https://github.com/99designs/keyring)替换基于LevelDB的当前Keybase后端。该应用程序旨在提供一个通用的抽象层和统一的接口，用于许多秘密存储，并且被99-designs应用程序的AWS Vault应用程序使用。

这似乎满足了保护用户计算机上的密钥材料和元数据免受恶意软件攻击的要求。

## 状态

已接受

## 影响

### 积极影响

增加用户的安全性。

### 负面影响

用户必须手动迁移。

难以对所有支持的后端进行测试。

在Mac上本地运行测试需要大量重复输入密码。

### 中立

{中立的后果}

## 参考资料

* #4754 切换密钥存储到密钥环密钥存储（由 @poldsam 提交的原始 PR）【已关闭】
* #5029 添加对 github.com/99designs/keyring-backed keybases 的支持【已合并】
* #5097 添加 keys migrate 命令【已合并】
* #5180 放弃磁盘上的密钥库，转而使用密钥环【待审核】
* cosmos/gaia#164 放弃磁盘上的密钥库，转而使用密钥环（gaia 的更改）【待审核】


# ADR 006: Secret Store Replacement

## Changelog

* July 29th, 2019: Initial draft
* September 11th, 2019: Work has started
* November 4th: Cosmos SDK changes merged in
* November 18th: Gaia changes merged in

## Context

Currently, a Cosmos SDK application's CLI directory stores key material and metadata in a plain text database in the user’s home directory.  Key material is encrypted by a passphrase, protected by bcrypt hashing algorithm. Metadata (e.g. addresses, public keys, key storage details) is available in plain text.

This is not desirable for a number of reasons. Perhaps the biggest reason is insufficient security protection of key material and metadata. Leaking the plain text allows an attacker to surveil what keys a given computer controls via a number of techniques, like compromised dependencies without any privilege execution. This could be followed by a more targeted attack on a particular user/computer.

All modern desktop computers OS (Ubuntu, Debian, MacOS, Windows) provide a built-in secret store that is designed to allow applications to store information that is isolated from all other applications and requires passphrase entry to access the data.

We are seeking solution that provides a common abstraction layer to the many different backends and reasonable fallback for minimal platforms that don’t provide a native secret store.

## Decision

We recommend replacing the current Keybase backend based on LevelDB with [Keyring](https://github.com/99designs/keyring) by 99 designs. This application is designed to provide a common abstraction and uniform interface between many secret stores and is used by AWS Vault application by 99-designs application.

This appears to fulfill the requirement of protecting both key material and metadata from rouge software on a user’s machine.

## Status

Accepted

## Consequences

### Positive

Increased safety for users.

### Negative

Users must manually migrate.

Testing against all supported backends is difficult.

Running tests locally on a Mac require numerous repetitive password entries.

### Neutral

{neutral consequences}

## References

* #4754 Switch secret store to the keyring secret store (original PR by @poldsam) [__CLOSED__]
* #5029 Add support for github.com/99designs/keyring-backed keybases [__MERGED__]
* #5097 Add keys migrate command [__MERGED__]
* #5180 Drop on-disk keybase in favor of keyring [_PENDING_REVIEW_]
* cosmos/gaia#164 Drop on-disk keybase in favor of keyring (gaia's changes) [_PENDING_REVIEW_]
