# 文档构建工作流程

Tendermint Core的文档托管在以下网址：

- <https://docs.tendermint.com/>

从此目录(`/docs`)中的文件构建而成。

## 工作原理

有一个[GitHub Action](../.github/workflows/docs-deployment.yml)会在`main`分支以及每个主要支持的版本分支（例如`v0.34.x`）中的`/docs`目录发生变化时触发。在这些分支上对此目录中的文件进行更新将自动触发网站部署。

## README

[README.md](./README.md)也是网站上文档的首页。

## Config.js

[config.js](./.vuepress/config.js)会在网站文档中生成侧边栏和目录。请注意相对链接的使用以及省略文件扩展名。还有其他功能可用于改善侧边栏的外观。

## 链接

**注意：**在移动或删除文件时，请务必考虑现有链接，包括此目录内部和指向网站文档的链接。

目录链接**必须**以`/`结尾。

几乎在任何地方都应使用相对链接，经过发现和权衡后，我们得出以下结论：

### 相对链接

其他文件相对于当前文件的位置在哪里？

- 在GitHub和VuePress构建中都有效
- 使用`../../../../myfile.md`之类的链接会令人困惑和烦恼
- 当文件重新排序时需要进行更多的更新

### 绝对链接

给定存储库的根目录，其他文件在哪里？

- 在GitHub上有效，但在VuePress构建中无效
- `/docs/hereitis/myfile.md`更好
- 如果移动该文件，其中的链接将保持不变（当然，指向该文件的链接除外）

### 完整链接

文件或目录的完整GitHub URL。在某些情况下，当将用户发送到GitHub时使用。

## 本地构建

确保您在`docs`目录中，并运行以下命令：

```bash
rm -rf node_modules
```

此命令将删除旧版本的可视化主题和所需的软件包。此步骤是可选的。

```bash
npm install
```

安装主题和所有依赖项。

```bash
npm run serve
```

<!-- markdown-link-check-disable -->

运行 `pre` 和 `post` 钩子，并启动一个热重载的 Web 服务器。查看此命令的输出以获取 URL（通常为 <https://localhost:8080>）。

<!-- markdown-link-check-enable -->

要将文档构建为静态网站，请运行 `npm run build`。您将在 `.vuepress/dist` 目录中找到网站。

## 搜索

我们使用 [Algolia](https://www.algolia.com) 提供全文搜索功能。这使用了 `config.js` 中的公共 API 搜索密钥，以及一个可以通过 PR 更新的 [tendermint.json](https://github.com/algolia/docsearch-configs/blob/master/configs/tendermint.json) 配置文件。

## 一致性

由于构建过程相同（包含的信息也相同），因此应尽可能使此文件与 [Cosmos SDK 存储库中的对应文件](https://github.com/cosmos/cosmos-sdk/blob/master/docs/DOCS_README.md) 保持同步。


# Docs Build Workflow

The documentation for Tendermint Core is hosted at:

- <https://docs.tendermint.com/>

built from the files in this (`/docs`) directory.

## How It Works

There is a [GitHub Action](../.github/workflows/docs-deployment.yml) that is
triggered by changes in the `/docs` directory on `main` as well as the branch of
each major supported version (e.g. `v0.34.x`). Any updates to files in this
directory on those branches will automatically trigger a website deployment.

## README

The [README.md](./README.md) is also the landing page for the documentation on
the website.

## Config.js

The [config.js](./.vuepress/config.js) generates the sidebar and Table of
Contents on the website docs. Note the use of relative links and the omission of
file extensions. Additional features are available to improve the look of the
sidebar.

## Links

**NOTE:** Strongly consider the existing links - both within this directory and
to the website docs - when moving or deleting files.

Links to directories _MUST_ end in a `/`.

Relative links should be used nearly everywhere, having discovered and weighed
the following:

### Relative

Where is the other file, relative to the current one?

- works both on GitHub and for the VuePress build
- confusing / annoying to have things like: `../../../../myfile.md`
- requires more updates when files are re-shuffled

### Absolute

Where is the other file, given the root of the repo?

- works on GitHub, doesn't work for the VuePress build
- this is much nicer: `/docs/hereitis/myfile.md`
- if you move that file around, the links inside it are preserved (but not to it, of course)

### Full

The full GitHub URL to a file or directory. Used occasionally when it makes sense
to send users to the GitHub.

## Building Locally

Make sure you are in the `docs` directory and run the following commands:

```bash
rm -rf node_modules
```

This command will remove old version of the visual theme and required packages.
This step is optional.

```bash
npm install
```

Install the theme and all dependencies.

```bash
npm run serve
```

<!-- markdown-link-check-disable -->

Run `pre` and `post` hooks and start a hot-reloading web-server. See output of
this command for the URL (it is often <https://localhost:8080>).

<!-- markdown-link-check-enable -->

To build documentation as a static website run `npm run build`. You will find
the website in `.vuepress/dist` directory.

## Search

We are using [Algolia](https://www.algolia.com) to power full-text search. This
uses a public API search-only key in the `config.js` as well as a
[tendermint.json](https://github.com/algolia/docsearch-configs/blob/master/configs/tendermint.json)
configuration file that we can update with PRs.

## Consistency

Because the build processes are identical (as is the information contained
herein), this file should be kept in sync as much as possible with its
[counterpart in the Cosmos SDK
repo](https://github.com/cosmos/cosmos-sdk/blob/master/docs/DOCS_README.md).
