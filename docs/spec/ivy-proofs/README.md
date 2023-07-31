# Ivy证明

```copyright
版权所有 (c) 2020 Galois, Inc.
SPDX许可证标识符：Apache-2.0
```

## 目录

此文件夹包含以下内容：

* `tendermint.ivy`，Tendermint算法的规范，如E. Buchman、J. Kwon、Z. Milosevic在《关于BFT共识的最新八卦》中所述。
* `abstract_tendermint.ivy`，更抽象的Tendermint规范，更适合验证。
* `classic_safety.ivy`，证明Tendermint满足BFT共识的经典安全性属性：如果每两个法定人数都有一个行为良好的节点共同存在，则没有两个行为良好的节点会发生分歧。
* `accountable_safety_1.ivy`，证明在假设每个法定人数至少包含一个行为良好的节点的情况下，如果两个行为良好的节点发生分歧，则存在证据表明至少f+1个节点行为不端。
* `accountable_safety_2.ivy`，证明无论对法定人数做出任何假设，行为良好的节点都无法被恶意节点陷害。换句话说，恶意节点永远无法构造指控行为良好节点的证据。
* `network_shim.ivy`，网络模型和一个方便的`shim`对象，用于与Tendermint规范进行交互。
* `domain_model.ivy`，Tendermint规范的基础领域模型的规范，即轮次、值、法定人数等。

所有规范和证明都是用[Ivy](https://github.com/kenmcmil/ivy)编写的。

上述许可证适用于此文件夹中的所有文件。

## 构建和运行

检查证明的最简单方法是使用[Docker](https://www.docker.com/)。

1. 安装[Docker](https://docs.docker.com/get-docker/)和[Docker Compose](https://docs.docker.com/compose/install/)。
2. 构建Docker镜像：`docker-compose build`
3. 在Docker容器中运行证明：`docker-compose run tendermint-proof`。这将使用`ivy_check`命令检查所有证明，并将`ivy_check`的输出写入`./output/`的子目录中。


# Ivy Proofs

```copyright
Copyright (c) 2020 Galois, Inc.
SPDX-License-Identifier: Apache-2.0
```

## Contents

This folder contains:

* `tendermint.ivy`, a specification of Tendermint algorithm as described in *The latest gossip on BFT consensus* by E. Buchman, J. Kwon, Z. Milosevic.
* `abstract_tendermint.ivy`, a more abstract specification of Tendermint that is more verification-friendly.
* `classic_safety.ivy`, a proof that Tendermint satisfies the classic safety property of BFT consensus: if every two quorums have a well-behaved node in common, then no two well-behaved nodes ever disagree.
* `accountable_safety_1.ivy`, a proof that, assuming every quorum contains at least one well-behaved node, if two well-behaved nodes disagree, then there is evidence demonstrating at least f+1 nodes misbehaved.
* `accountable_safety_2.ivy`, a proof that, regardless of any assumption about quorums, well-behaved nodes cannot be framed by malicious nodes. In other words, malicious nodes can never construct evidence that incriminates a well-behaved node.
* `network_shim.ivy`, the network model and a convenience `shim` object to interface with the Tendermint specification.
* `domain_model.ivy`, a specification of the domain model underlying the Tendermint specification, i.e. rounds, value, quorums, etc.

All specifications and proofs are written in [Ivy](https://github.com/kenmcmil/ivy).

The license above applies to all files in this folder.


## Building and running

The easiest way to check the proofs is to use [Docker](https://www.docker.com/).

1. Install [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).
2. Build a Docker image: `docker-compose build`
3. Run the proofs inside the Docker container: `docker-compose run
tendermint-proof`. This will check all the proofs with the `ivy_check`
command and write the output of `ivy_check` to a subdirectory of `./output/'
