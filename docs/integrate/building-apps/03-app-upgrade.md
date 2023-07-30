# 应用程序升级

:::note
本文档描述了如何升级您的应用程序。如果您特别关注在SDK版本之间执行的更改，请参阅[SDK迁移文档](https://docs.cosmos.network/main/migrations/intro)。
:::

:::warning
此部分目前尚未完成。您可以在[此处](https://github.com/cosmos/cosmos-sdk/issues/11504)跟踪此文档的进度。
:::

## 升级前处理

Cosmovisor支持自定义的升级前处理。当您需要在执行升级之前实施新版本中所需的应用程序配置更改时，请使用升级前处理。

使用Cosmovisor的升级前处理是可选的。如果未实施升级前处理，升级将继续进行。

例如，在升级前处理期间对`app.toml`设置进行所需的新版本更改。升级前处理过程意味着在升级后无需手动更新文件。

在应用程序二进制文件升级之前，Cosmovisor调用一个`pre-upgrade`命令，该命令可以由应用程序实现。

`pre-upgrade`命令不接受任何命令行参数，并且预计以以下退出代码终止：

| 退出状态码 | 在Cosmosvisor中的处理方式                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `0`        | 假定`pre-upgrade`命令成功执行，并继续升级。                                                                       |
| `1`        | 当`pre-upgrade`命令未实施时的默认退出代码。                                                                       |
| `30`       | `pre-upgrade`命令已执行但失败。这将导致整个升级失败。                                                              |
| `31`       | `pre-upgrade`命令已执行但失败。但是，该命令将重试，直到返回退出代码`1`或`30`。                                      |

## 示例

这是`pre-upgrade`命令的示例结构：

```go
func preUpgradeCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "pre-upgrade",
		Short: "Pre-upgrade command",
        Long: "Pre-upgrade command to implement custom pre-upgrade handling",
		Run: func(cmd *cobra.Command, args []string) {

			err := HandlePreUpgrade()

			if err != nil {
				os.Exit(30)
			}

			os.Exit(0)

		},
	}

	return cmd
}
```

确保在应用程序中已注册pre-upgrade命令：

```go
rootCmd.AddCommand(
		// ..
		preUpgradeCommand(),
		// ..
	)
```



# Application upgrade

:::note
This document describes how to upgrade your application. If you are looking specifically for the changes to perform between SDK versions, see the [SDK migrations documentation](https://docs.cosmos.network/main/migrations/intro).
:::

:::warning
This section is currently incomplete. Track the progress of this document [here](https://github.com/cosmos/cosmos-sdk/issues/11504).
:::

## Pre-Upgrade Handling

Cosmovisor supports custom pre-upgrade handling. Use pre-upgrade handling when you need to implement application config changes that are required in the newer version before you perform the upgrade.

Using Cosmovisor pre-upgrade handling is optional. If pre-upgrade handling is not implemented, the upgrade continues.

For example, make the required new-version changes to `app.toml` settings during the pre-upgrade handling. The pre-upgrade handling process means that the file does not have to be manually updated after the upgrade.

Before the application binary is upgraded, Cosmovisor calls a `pre-upgrade` command that can  be implemented by the application.

The `pre-upgrade` command does not take in any command-line arguments and is expected to terminate with the following exit codes:

| Exit status code | How it is handled in Cosmosvisor                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `0`              | Assumes `pre-upgrade` command executed successfully and continues the upgrade.                                      |
| `1`              | Default exit code when `pre-upgrade` command has not been implemented.                                              |
| `30`             | `pre-upgrade` command was executed but failed. This fails the entire upgrade.                                       |
| `31`             | `pre-upgrade` command was executed but failed. But the command is retried until exit code `1` or `30` are returned. |

## Sample

Here is a sample structure of the `pre-upgrade` command:

```go
func preUpgradeCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "pre-upgrade",
		Short: "Pre-upgrade command",
        Long: "Pre-upgrade command to implement custom pre-upgrade handling",
		Run: func(cmd *cobra.Command, args []string) {

			err := HandlePreUpgrade()

			if err != nil {
				os.Exit(30)
			}

			os.Exit(0)

		},
	}

	return cmd
}
```

Ensure that the pre-upgrade command has been registered in the application:

```go
rootCmd.AddCommand(
		// ..
		preUpgradeCommand(),
		// ..
	)
```
