# ADR 002: SDK 文档结构

## 背景

需要一个可扩展的 Cosmos SDK 文档结构。当前的文档包含了许多与 Cosmos SDK 无关的内容，难以维护，对用户来说也难以理解。

理想情况下，我们希望：

* 所有与开发框架或工具相关的文档都存放在各自的 GitHub 仓库中（SDK 仓库包含 SDK 文档，Hub 仓库包含 Hub 文档，Lotion 仓库包含 Lotion 文档等）。
* 所有其他文档（常见问题、白皮书、关于 Cosmos 的高层次材料）都存放在网站上。

## 决策

按照以下方式重新组织 Cosmos SDK GitHub 仓库中的 `/docs` 文件夹：

```text
docs/
├── README
├── intro/
├── concepts/
│   ├── baseapp
│   ├── types
│   ├── store
│   ├── server
│   ├── modules/
│   │   ├── keeper
│   │   ├── handler
│   │   ├── cli
│   ├── gas
│   └── commands
├── clients/
│   ├── lite/
│   ├── service-providers
├── modules/
├── spec/
├── translations/
└── architecture/
```

每个子文件夹中的文件并不重要，可能会经常更改。重要的是分区：

* `README`：文档的首页。
* `intro`：入门材料。目标是简要解释 Cosmos SDK，然后引导用户到他们需要的资源。将突出显示 [Cosmos SDK 教程](https://github.com/cosmos/sdk-application-tutorial/)，以及 `godocs`。
* `concepts`：包含 Cosmos SDK 抽象的高层次解释。不包含具体的代码实现，不需要经常更新。**它不是接口的 API 规范**。API 规范在 `godoc` 中。
* `clients`：包含各种 Cosmos SDK 客户端的规范和信息。
* `spec`：包含模块的规范和其他内容。
* `modules`：包含到 `godocs` 和模块规范的链接。
* `architecture`：包含与架构相关的文档，如当前文档。
* `translations`：包含文档的不同翻译版本。

网站文档的侧边栏只包括以下部分：

* `README`
* `intro`
* `concepts`
* `clients`

`architecture` 不需要在网站上显示。

## 状态

已接受

## 结果

### 积极影响

* Cosmos SDK 文档的组织更加清晰。
* `/docs` 文件夹现在只包含 Cosmos SDK 和 Gaia 相关的内容。以后，它将只包含 Cosmos SDK 相关的内容。
* 开发人员只需要在提交 PR 时更新 `/docs` 文件夹（而不是例如 `/examples`）。
* 由于重新设计的架构，开发人员更容易找到需要在文档中更新的内容。
* 网站文档的 vuepress 构建更加清洁。
* 将有助于构建可执行文档（参见 https://github.com/cosmos/cosmos-sdk/issues/2611）

### 中性

* 我们需要将一堆已弃用的内容移动到 `/_attic` 文件夹中。
* 我们需要将 `docs/sdk/docs/core` 中的内容整合到 `concepts` 中。
* 我们需要将当前存放在 `docs` 中但不适合新结构的所有内容（如 `lotion`、介绍材料、白皮书）移动到网站存储库中。
* 更新 `DOCS_README.md`

## 参考资料

* https://github.com/cosmos/cosmos-sdk/issues/1460
* https://github.com/cosmos/cosmos-sdk/pull/2695
* https://github.com/cosmos/cosmos-sdk/issues/2611


# ADR 002: SDK Documentation Structure

## Context

There is a need for a scalable structure of the Cosmos SDK documentation. Current documentation includes a lot of non-related Cosmos SDK material, is difficult to maintain and hard to follow as a user.

Ideally, we would have:

* All docs related to dev frameworks or tools live in their respective github repos (sdk repo would contain sdk docs, hub repo would contain hub docs, lotion repo would contain lotion docs, etc.)
* All other docs (faqs, whitepaper, high-level material about Cosmos) would live on the website.

## Decision

Re-structure the `/docs` folder of the Cosmos SDK github repo as follows:

```text
docs/
├── README
├── intro/
├── concepts/
│   ├── baseapp
│   ├── types
│   ├── store
│   ├── server
│   ├── modules/
│   │   ├── keeper
│   │   ├── handler
│   │   ├── cli
│   ├── gas
│   └── commands
├── clients/
│   ├── lite/
│   ├── service-providers
├── modules/
├── spec/
├── translations/
└── architecture/
```

The files in each sub-folders do not matter and will likely change. What matters is the sectioning:

* `README`: Landing page of the docs.
* `intro`: Introductory material. Goal is to have a short explainer of the Cosmos SDK and then channel people to the resource they need. The [Cosmos SDK tutorial](https://github.com/cosmos/sdk-application-tutorial/) will be highlighted, as well as the `godocs`.
* `concepts`: Contains high-level explanations of the abstractions of the Cosmos SDK. It does not contain specific code implementation and does not need to be updated often. **It is not an API specification of the interfaces**. API spec is the `godoc`.
* `clients`: Contains specs and info about the various Cosmos SDK clients.
* `spec`: Contains specs of modules, and others.
* `modules`: Contains links to `godocs` and the spec of the modules.
* `architecture`: Contains architecture-related docs like the present one.
* `translations`: Contains different translations of the documentation.

Website docs sidebar will only include the following sections:

* `README`
* `intro`
* `concepts`
* `clients`

`architecture` need not be displayed on the website.

## Status

Accepted

## Consequences

### Positive

* Much clearer organisation of the Cosmos SDK docs.
* The `/docs` folder now only contains Cosmos SDK and gaia related material. Later, it will only contain Cosmos SDK related material.
* Developers only have to update `/docs` folder when they open a PR (and not `/examples` for example).
* Easier for developers to find what they need to update in the docs thanks to reworked architecture.
* Cleaner vuepress build for website docs.
* Will help build an executable doc (cf https://github.com/cosmos/cosmos-sdk/issues/2611)

### Neutral

* We need to move a bunch of deprecated stuff to `/_attic` folder.
* We need to integrate content in `docs/sdk/docs/core` in `concepts`.
* We need to move all the content that currently lives in `docs` and does not fit in new structure (like `lotion`, intro material, whitepaper) to the website repository.
* Update `DOCS_README.md`

## References

* https://github.com/cosmos/cosmos-sdk/issues/1460
* https://github.com/cosmos/cosmos-sdk/pull/2695
* https://github.com/cosmos/cosmos-sdk/issues/2611
