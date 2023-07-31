# Tendermint-spec

该存储库包含了Tendermint共识协议的规范（和证明）。

## 如何在Mac OS上安装Latex

MacTex是Mac OS上的Latex发行版。您可以在[这里](http://www.tug.org/mactex/mactex-download.html)下载它。

用于基于Latex的项目的流行IDE是TexStudio。可以在[这里](https://www.texstudio.org/)下载。

## 如何构建项目

为了编译Latex文件（并编写参考文献），执行以下命令：

`$ pdflatex paper` <br/>
`$ bibtex paper` <br/>
`$ pdflatex paper` <br/>
`$ pdflatex paper` <br/>

生成的文件是paper.pdf。您可以使用以下命令打开它：

`$ open paper.pdf`


# Tendermint-spec

The repository contains the specification (and the proofs) of the Tendermint
consensus protocol.

## How to install Latex on Mac OS

MacTex is Latex distribution for Mac OS. You can download it [here](http://www.tug.org/mactex/mactex-download.html).

Popular IDE for Latex-based projects is TexStudio. It can be downloaded
[here](https://www.texstudio.org/).

## How to build project

In order to compile the latex files (and write bibliography), execute

`$ pdflatex paper` <br/>
`$ bibtex paper` <br/>
`$ pdflatex paper` <br/>
`$ pdflatex paper` <br/>

The generated file is paper.pdf. You can open it with

`$ open paper.pdf`
