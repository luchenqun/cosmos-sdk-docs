---
order: 1
title: 方法
---

# 方法

本文档详细描述了QA流程。
它旨在供工程师在未来测试Tendermint的实验设置时使用。

QA流程（第一次迭代）如[RELEASES.md文档][releases]中所述，已应用于版本v0.34.x，以获得作为基准的一组结果。
然后将此基准与后续版本的结果进行比较。

在[发布文档][releases]中描述的基于测试网的测试用例中，我们关注了其中的两个：
_200节点测试_和_旋转节点测试_。

[releases]: https://github.com/tendermint/tendermint/blob/v0.37.x/RELEASES.md#large-scale-testnets

## 软件依赖

### 运行测试的基础设施要求

* 在Digital Ocean（DO）上拥有一个帐户，具有较高的droplet限制（>202）
* 用于编排测试的机器应安装以下内容：
    * [testnet仓库][testnet-repo]的克隆
        * 此仓库包含本节其余部分提到的所有脚本
    * [Digital Ocean CLI][doctl]
    * [Terraform CLI][Terraform]
    * [Ansible CLI][Ansible]

[testnet-repo]: https://github.com/interchainio/tendermint-testnet
[Ansible]: https://docs.ansible.com/ansible/latest/index.html
[Terraform]: https://www.terraform.io/docs
[doctl]: https://docs.digitalocean.com/reference/doctl/how-to/install/

### 提取结果的要求

* Matlab或Octave
* 安装了[Prometheus][prometheus]服务器
* 测试网中一个完整节点的blockstore数据库
* Prometheus数据库

[prometheus]: https://prometheus.io/

## 200节点测试网

### 运行测试

本节解释了为了可重现性而进行的测试。

1. [如果之前没有进行过]
   按照testnet仓库顶部的`README.md`的步骤1-4配置Terraform和`doctl`。
2. 将文件`testnets/testnet200.toml`复制到`testnet.toml`（不要提交此更改）
3. 在`Makefile`中将变量`VERSION_TAG`设置为要测试的git哈希。
4. 按照`README.md`的步骤5-10配置和启动200节点测试网
    * 警告：完成测试后，不要忘记运行`make terraform-destroy`（参见步骤9）
5. 作为一项合理性检查，连接到Prometheus节点的Web界面，并检查`tendermint_consensus_height`指标的图表。
   所有节点的高度应该在增加。
6. `ssh`进入`testnet-load-runner`，然后复制脚本`script/200-node-loadscript.sh`并从负载运行节点运行它。
    * 在运行之前，您需要编辑脚本以提供一个完整节点的IP地址。
      此节点将接收来自负载运行节点的所有交易。
    * 此脚本将运行约40分钟
    * 它在循环中以不同的负载运行90秒的实验
7. 运行`make retrieve-data`，将测试网的所有相关数据收集到编排机器中
8. 验证数据是否无误地收集
    * 至少一个Tendermint验证器的blockstore数据库
    * 来自Prometheus节点的Prometheus数据库
    * 为了额外的注意，您可以在`prometheus.zip`文件和（其中之一）`blockstore.db.zip`文件上运行`zip -T`
9. **运行`make terraform-destroy`**
    * 不要忘记输入`yes`！否则会有麻烦。

### 结果提取

目前，这里描述的结果提取方法是高度手动的（和探索性的）阶段。核心团队应该在每个迭代中改进它，以增加自动化的程度。

#### 步骤

1. 将块存储解压到一个目录中。
2. 从包含块存储的目录中运行以下命令，提取延迟报告和所有实验的原始延迟：
    * `go run github.com/tendermint/tendermint/test/loadtime/cmd/report@3ec6e424d --database-type goleveldb --data-dir ./ > results/report.txt`
    * `go run github.com/tendermint/tendermint/test/loadtime/cmd/report@3ec6e424d --database-type goleveldb --data-dir ./ --csv results/raw.csv`
3. 文件 `report.txt` 包含了一个无序列表，其中列出了具有不同并发连接和事务速率的实验。
    * 为 `report.txt` 文件中的每个实验创建文件 `report01.txt`、`report02.txt`、`report04.txt`，将其相关行复制到与连接数匹配的文件名中。
    * 对 `report01.txt`、`report02.txt` 和 `report04.txt` 中的实验按照事务速率升序排序。
4. 通过将 `report01.txt`、`report02.txt` 和 `report04.txt` 的内容并排显示，生成文件 `report_tabbed.txt`。
   * 这实际上创建了一个表格，其中行是特定的事务速率，列是特定的 WebSocket 连接数。
5. 使用以下 bash 循环从文件 `raw.csv` 中提取原始延迟。这将为每个实验创建一个 `.csv` 文件和一个 `.dat` 文件。
   `.dat` 文件的格式适合在 Octave 中将其加载为矩阵。

    ```bash
    uuids=($(cat report01.txt report02.txt report04.txt | grep '^Experiment ID: ' | awk '{ print $3 }'))
    c=1
    for i in 01 02 04; do
      for j in 0025 0050 0100 0200; do
        echo $i $j $c "${uuids[$c]}"
        filename=c${i}_r${j}
        grep ${uuids[$c]} raw.csv > ${filename}.csv
        cat ${filename}.csv | tr , ' ' | awk '{ print $2, $3 }' > ${filename}.dat
        c=$(expr $c + 1)
      done
    done
    ```

6. 进入 Octave
7. 使用以下 Octave 代码片段将步骤 5 生成的所有 `.dat` 文件加载到矩阵中

    ```octave
    conns =  { "01"; "02"; "04" };
    rates =  { "0025"; "0050"; "0100"; "0200" };
    for i = 1:length(conns)
      for j = 1:length(rates)
        filename = strcat("c", conns{i}, "_r", rates{j}, ".dat");
        load("-ascii", filename);
      endfor
    endfor
    ```

8. 将变量 `release` 设置为当前正在进行 QA 的版本

    ```octave
    release = "v0.34.x";
    ```

9. 生成一个包含所有（或部分）实验的图表，其中 X 轴是实验时间，Y 轴是事务的延迟。
   以下代码片段绘制了所有实验。

    ```octave
    legends = {};
    hold off;
    for i = 1:length(conns)
      for j = 1:length(rates)
        data_name = strcat("c", conns{i}, "_r", rates{j});
        l = strcat("c=", conns{i}, " r=", rates{j});
        m = eval(data_name); plot((m(:,1) - min(m(:,1))) / 1e+9, m(:,2) / 1e+9, ".");
        hold on;
        legends(1, end+1) = l;
      endfor
    endfor
    legend(legends, "location", "northeastoutside");
    xlabel("实验时间（秒）");
    ylabel("延迟（秒）");
    t = sprintf("200 节点测试网络 - %s", release);
    title(t);
    ```

10. 如果需要与基准结果进行比较，可以考虑调整坐标轴

    ```octave
    axis([0, 100, 0, 30], "tic");
    ```

11. 使用 Octave 的 GUI 菜单保存图表（例如保存为 `.png` 格式）

12. 重复步骤 9 和 10，根据需要生成多个图表。

13. 要生成延迟 vs 吞吐量图表，使用步骤 2 生成的原始 CSV 文件，按照 [`latency_throughput.py`] 脚本的说明进行操作。

[`latency_throughput.py`]: ../../scripts/qa/reporting/README.md

#### 提取 Prometheus 指标

1. 如果 Prometheus 作为服务运行（例如 `systemd` 单元），请停止 Prometheus 服务器。
2. 解压从测试网络中检索到的 Prometheus 数据库，并将其移动以替换本地的 Prometheus 数据库。
3. 启动 Prometheus 服务器，并确保启动时没有出现错误日志。
4. 添加要收集或绘制的指标。

## 旋转节点测试网

### 运行测试

本节介绍了为了可重现性而进行测试的方法。

1. [如果你之前没有做过]
   按照测试网存储库顶部的 `README.md` 的步骤 1-4 配置 Terraform 和 `doctl`。
2. 将文件 `testnet_rotating.toml` 复制到 `testnet.toml`（不要提交此更改）
3. 将变量 `VERSION_TAG` 设置为要测试的 git 哈希。
4. 运行 `make terraform-apply EPHEMERAL_SIZE=25`
    * 警告：在测试完成后不要忘记运行 `make terraform-destroy`
5. 按照 `README.md` 的步骤 6-10 配置并启动旋转节点测试网的 "stable" 部分
6. 作为健全性检查，连接到 Prometheus 节点的 Web 接口，并检查 `tendermint_consensus_height` 指标的图表。
   所有节点的高度应该在增加。
7. 在另一个 shell 中，
    * 运行 `make runload ROTATE_CONNECTIONS=X ROTATE_TX_RATE=Y`
    * `X` 和 `Y` 应该反映出低于饱和点的负载（有关更多信息，请参见，例如，
      [此段落](./v034/README.md#finding-the-saturation-point)）
8. 运行 `make rotate` 启动创建临时节点并在它们追赶上时杀死它们的脚本。
    * 警告：如果你从笔记本电脑上运行此命令，则笔记本电脑需要一直开机并连接到网络，以便完整地运行实验。
9. 当链的高度达到 3000 时，停止 `make rotate` 脚本
10. 当旋转脚本在高度 3000 达到后进行了两次迭代（即所有临时节点都追赶上两次）后，停止 `make rotate`
11. 运行 `make retrieve-data` 将测试网的所有相关数据收集到编排机器中
12. 验证数据是否收集成功
    * 至少一个 Tendermint 验证器的块存储数据库
    * 来自 Prometheus 节点的 Prometheus 数据库
    * 如果需要额外的注意，可以对 `prometheus.zip` 文件和（其中之一）`blockstore.db.zip` 文件运行 `zip -T`
13. **运行 `make terraform-destroy`**

目前步骤 8 到 10 非常手动，并将在下一次迭代中进行改进。

### 结果提取

为了获得延迟图，按照上述200个节点实验的说明进行操作，但是：

* `results.txt` 文件只包含一个实验
* 因此，不需要任何 `for` 循环

至于 Prometheus，可以应用与200个节点实验相同的方法。


---
order: 1
title: Method
---

# Method

This document provides a detailed description of the QA process.
It is intended to be used by engineers reproducing the experimental setup for future tests of Tendermint.

The (first iteration of the) QA process as described [in the RELEASES.md document][releases]
was applied to version v0.34.x in order to have a set of results acting as benchmarking baseline.
This baseline is then compared with results obtained in later versions.

Out of the testnet-based test cases described in [the releases document][releases] we focused on two of them:
_200 Node Test_, and _Rotating Nodes Test_.

[releases]: https://github.com/tendermint/tendermint/blob/v0.37.x/RELEASES.md#large-scale-testnets

## Software Dependencies

### Infrastructure Requirements to Run the Tests

* An account at Digital Ocean (DO), with a high droplet limit (>202)
* The machine to orchestrate the tests should have the following installed:
    * A clone of the [testnet repository][testnet-repo]
        * This repository contains all the scripts mentioned in the reminder of this section
    * [Digital Ocean CLI][doctl]
    * [Terraform CLI][Terraform]
    * [Ansible CLI][Ansible]

[testnet-repo]: https://github.com/interchainio/tendermint-testnet
[Ansible]: https://docs.ansible.com/ansible/latest/index.html
[Terraform]: https://www.terraform.io/docs
[doctl]: https://docs.digitalocean.com/reference/doctl/how-to/install/

### Requirements for Result Extraction

* Matlab or Octave
* [Prometheus][prometheus] server installed
* blockstore DB of one of the full nodes in the testnet
* Prometheus DB

[prometheus]: https://prometheus.io/

## 200 Node Testnet

### Running the test

This section explains how the tests were carried out for reproducibility purposes.

1. [If you haven't done it before]
   Follow steps 1-4 of the `README.md` at the top of the testnet repository to configure Terraform, and `doctl`.
2. Copy file `testnets/testnet200.toml` onto `testnet.toml` (do NOT commit this change)
3. Set the variable `VERSION_TAG` in the `Makefile` to the git hash that is to be tested.
4. Follow steps 5-10 of the `README.md` to configure and start the 200 node testnet
    * WARNING: Do NOT forget to run `make terraform-destroy` as soon as you are done with the tests (see step 9)
5. As a sanity check, connect to the Prometheus node's web interface and check the graph for the `tendermint_consensus_height` metric.
   All nodes should be increasing their heights.
6. `ssh` into the `testnet-load-runner`, then copy script `script/200-node-loadscript.sh` and run it from the load runner node.
    * Before running it, you need to edit the script to provide the IP address of a full node.
      This node will receive all transactions from the load runner node.
    * This script will take about 40 mins to run
    * It is running 90-seconds-long experiments in a loop with different loads
7. Run `make retrieve-data` to gather all relevant data from the testnet into the orchestrating machine
8. Verify that the data was collected without errors
    * at least one blockstore DB for a Tendermint validator
    * the Prometheus database from the Prometheus node
    * for extra care, you can run `zip -T` on the `prometheus.zip` file and (one of) the `blockstore.db.zip` file(s)
9. **Run `make terraform-destroy`**
    * Don't forget to type `yes`! Otherwise you're in trouble.

### Result Extraction

The method for extracting the results described here is highly manual (and exploratory) at this stage.
The Core team should improve it at every iteration to increase the amount of automation.

#### Steps

1. Unzip the blockstore into a directory
2. Extract the latency report and the raw latencies for all the experiments. Run these commands from the directory containing the blockstore
    * `go run github.com/tendermint/tendermint/test/loadtime/cmd/report@3ec6e424d --database-type goleveldb --data-dir ./ > results/report.txt`
    * `go run github.com/tendermint/tendermint/test/loadtime/cmd/report@3ec6e424d --database-type goleveldb --data-dir ./ --csv results/raw.csv`
3. File `report.txt` contains an unordered list of experiments with varying concurrent connections and transaction rate
    * Create files `report01.txt`, `report02.txt`, `report04.txt` and, for each experiment in file `report.txt`,
      copy its related lines to the filename that matches the number of connections.
    * Sort the experiments in `report01.txt` in ascending tx rate order. Likewise for `report02.txt` and `report04.txt`.
4. Generate file `report_tabbed.txt` by showing the contents `report01.txt`, `report02.txt`, `report04.txt` side by side
   * This effectively creates a table where rows are a particular tx rate and columns are a particular number of websocket connections.
5. Extract the raw latencies from file `raw.csv` using the following bash loop. This creates a `.csv` file and a `.dat` file per experiment.
   The format of the `.dat` files is amenable to loading them as matrices in Octave

    ```bash
    uuids=($(cat report01.txt report02.txt report04.txt | grep '^Experiment ID: ' | awk '{ print $3 }'))
    c=1
    for i in 01 02 04; do
      for j in 0025 0050 0100 0200; do
        echo $i $j $c "${uuids[$c]}"
        filename=c${i}_r${j}
        grep ${uuids[$c]} raw.csv > ${filename}.csv
        cat ${filename}.csv | tr , ' ' | awk '{ print $2, $3 }' > ${filename}.dat
        c=$(expr $c + 1)
      done
    done
    ```

6. Enter Octave
7. Load all `.dat` files generated in step 5 into matrices using this Octave code snippet

    ```octave
    conns =  { "01"; "02"; "04" };
    rates =  { "0025"; "0050"; "0100"; "0200" };
    for i = 1:length(conns)
      for j = 1:length(rates)
        filename = strcat("c", conns{i}, "_r", rates{j}, ".dat");
        load("-ascii", filename);
      endfor
    endfor
    ```

8. Set variable release to the current release undergoing QA

    ```octave
    release = "v0.34.x";
    ```

9. Generate a plot with all (or some) experiments, where the X axis is the experiment time,
   and the y axis is the latency of transactions.
   The following snippet plots all experiments.

    ```octave
    legends = {};
    hold off;
    for i = 1:length(conns)
      for j = 1:length(rates)
        data_name = strcat("c", conns{i}, "_r", rates{j});
        l = strcat("c=", conns{i}, " r=", rates{j});
        m = eval(data_name); plot((m(:,1) - min(m(:,1))) / 1e+9, m(:,2) / 1e+9, ".");
        hold on;
        legends(1, end+1) = l;
      endfor
    endfor
    legend(legends, "location", "northeastoutside");
    xlabel("experiment time (s)");
    ylabel("latency (s)");
    t = sprintf("200-node testnet - %s", release);
    title(t);
    ```

10. Consider adjusting the axis, in case you want to compare your results to the baseline, for instance

    ```octave
    axis([0, 100, 0, 30], "tic");
    ```

11. Use Octave's GUI menu to save the plot (e.g. as `.png`)

12. Repeat steps 9 and 10 to obtain as many plots as deemed necessary.

13. To generate a latency vs throughput plot, using the raw CSV file generated
    in step 2, follow the instructions for the [`latency_throughput.py`] script.

[`latency_throughput.py`]: ../../scripts/qa/reporting/README.md

#### Extracting Prometheus Metrics

1. Stop the prometheus server if it is running as a service (e.g. a `systemd` unit).
2. Unzip the prometheus database retrieved from the testnet, and move it to replace the
   local prometheus database.
3. Start the prometheus server and make sure no error logs appear at start up.
4. Introduce the metrics you want to gather or plot.

## Rotating Node Testnet

### Running the test

This section explains how the tests were carried out for reproducibility purposes.

1. [If you haven't done it before]
   Follow steps 1-4 of the `README.md` at the top of the testnet repository to configure Terraform, and `doctl`.
2. Copy file `testnet_rotating.toml` onto `testnet.toml` (do NOT commit this change)
3. Set variable `VERSION_TAG` to the git hash that is to be tested.
4. Run `make terraform-apply EPHEMERAL_SIZE=25`
    * WARNING: Do NOT forget to run `make terraform-destroy` as soon as you are done with the tests
5. Follow steps 6-10 of the `README.md` to configure and start the "stable" part of the rotating node testnet
6. As a sanity check, connect to the Prometheus node's web interface and check the graph for the `tendermint_consensus_height` metric.
   All nodes should be increasing their heights.
7. On a different shell,
    * run `make runload ROTATE_CONNECTIONS=X ROTATE_TX_RATE=Y`
    * `X` and `Y` should reflect a load below the saturation point (see, e.g.,
      [this paragraph](./v034/README.md#finding-the-saturation-point) for further info)
8. Run `make rotate` to start the script that creates the ephemeral nodes, and kills them when they are caught up.
    * WARNING: If you run this command from your laptop, the laptop needs to be up and connected for full length
      of the experiment.
9. When the height of the chain reaches 3000, stop the `make rotate` script
10. When the rotate script has made two iterations (i.e., all ephemeral nodes have caught up twice)
    after height 3000 was reached, stop `make rotate`
11. Run `make retrieve-data` to gather all relevant data from the testnet into the orchestrating machine
12. Verify that the data was collected without errors
    * at least one blockstore DB for a Tendermint validator
    * the Prometheus database from the Prometheus node
    * for extra care, you can run `zip -T` on the `prometheus.zip` file and (one of) the `blockstore.db.zip` file(s)
13. **Run `make terraform-destroy`**

Steps 8 to 10 are highly manual at the moment and will be improved in next iterations.

### Result Extraction

In order to obtain a latency plot, follow the instructions above for the 200 node experiment, but:

* The `results.txt` file contains only one experiment
* Therefore, no need for any `for` loops

As for prometheus, the same method as for the 200 node experiment can be applied.
