# 配置

本文档涉及 app.toml，如果您想阅读有关 config.toml 的内容，请访问[CometBFT文档](https://docs.cometbft.com/v0.37/)。

<!-- 以下内容不是 Python 参考，但语法着色使文件在文档中更易读 -->
```python reference
https://github.com/cosmos/cosmos-sdk/blob/main/tools/confix/data/v0.47-app.toml 
```

## inter-block-cache

启用此功能将消耗比普通节点更多的内存。

## iavl-cache-size

使用此功能将增加内存消耗。

## iavl-lazy-loading

此功能用于存档节点，使其能够更快地启动。




# Configuration

This documentation refers to the app.toml, if you'd like to read about the config.toml please visit [CometBFT docs](https://docs.cometbft.com/v0.37/).

<!-- the following is not a python reference, however syntax coloring makes the file more readable in the docs -->
```python reference
https://github.com/cosmos/cosmos-sdk/blob/main/tools/confix/data/v0.47-app.toml 
```

## inter-block-cache

This feature will consume more ram than a normal node, if enabled.

## iavl-cache-size

Using this feature will increase ram consumption

## iavl-lazy-loading

This feature is to be used for archive nodes, allowing them to have a faster start up time. 
