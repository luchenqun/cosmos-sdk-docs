---
order: 3
---

# Terraform和Ansible

> 注意：这些命令/文件目前不由tendermint团队维护。请谨慎使用。

自动化部署使用[Terraform](https://www.terraform.io/)在Digital Ocean上创建服务器，然后使用[Ansible](http://www.ansible.com/)在这些服务器上创建和管理测试网络。

## 安装

注意：请参考[集成bash脚本](https://github.com/tendermint/tendermint/blob/v0.34.x/networks/remote/integration.sh)，该脚本可以在全新的DO droplet上运行，并自动启动一个由4个节点组成的测试网络。该脚本基本上执行了下面描述的所有操作。

- 在Linux机器上安装[Terraform](https://www.terraform.io/downloads.html)和[Ansible](http://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html)。
- 创建一个具有读写权限的[DigitalOcean API token](https://cloud.digitalocean.com/settings/api/tokens)。
- 安装python dopy包（`pip install dopy`）。
- 创建SSH密钥（`ssh-keygen`）。
- 设置环境变量：

```sh
export DO_API_TOKEN="abcdef01234567890abcdef01234567890"
export SSH_KEY_FILE="$HOME/.ssh/id_rsa.pub"
```

这些变量将被`terraform`和`ansible`共同使用。

## Terraform

这一步将创建四个Digital Ocean droplets。首先，进入正确的目录：

```sh
cd $GOPATH/src/github.com/tendermint/tendermint/networks/remote/terraform
```

然后执行：

```sh
terraform init
terraform apply -var DO_API_TOKEN="$DO_API_TOKEN" -var SSH_KEY_FILE="$SSH_KEY_FILE"
```

你将得到一个属于你的droplets的IP地址列表。

创建并运行droplets后，让我们来设置Ansible。

## Ansible

在[ansible目录](https://github.com/tendermint/tendermint/tree/v0.34.x/networks/remote/ansible)中的playbooks运行ansible角色以配置sentry节点架构。你必须切换到该目录来运行ansible（`cd $GOPATH/src/github.com/tendermint/tendermint/networks/remote/ansible`）。

有几个角色是自解释的：

首先，我们通过指定tendermint的路径（`BINARY`）和节点文件的路径（`CONFIGDIR`）来配置我们的droplets。后者期望有任意数量的名为`node0, node1, ...`等的目录（与创建的droplets数量相等）。

要创建节点文件，请运行：

```sh
tendermint testnet
```

然后，要配置我们的 droplets，请运行：

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet config.yml -e BINARY=$GOPATH/src/github.com/tendermint/tendermint/build/tendermint -e CONFIGDIR=$GOPATH/src/github.com/tendermint/tendermint/networks/remote/ansible/mytestnet
```

大功告成！现在，您的所有 droplets 都有了 `tendermint` 二进制文件和所需的配置文件，可以运行一个测试网络。

接下来，我们运行安装角色：

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet install.yml
```

如下所示，它在所有 droplets 上执行 `tendermint node --proxy_app=kvstore`。虽然我们很快会修改此角色并再次运行它，但是第一次执行允许我们获取每个 `node_info.listen_addr` 对应的 `node_info.id`。（这部分将来会自动化）。在浏览器中（或使用 `curl`），对于每个 droplet，请转到 IP:26657/status，并记录上述两个 `node_info` 字段。请注意，没有创建区块（`latest_block_height` 应为零且不增加）。

接下来，打开 `roles/install/templates/systemd.service.j2`，查找 `ExecStart` 行，应该类似于：

```sh
ExecStart=/usr/bin/tendermint node --proxy_app=kvstore
```

并添加 `--p2p.persistent_peers` 标志以及每个节点的相关信息。生成的文件应该类似于：

```sh
[Unit]
Description={{service}}
Requires=network-online.target
After=network-online.target

[Service]
Restart=on-failure
User={{service}}
Group={{service}}
PermissionsStartOnly=true
ExecStart=/usr/bin/tendermint node --proxy_app=kvstore --p2p.persistent_peers=167b80242c300bf0ccfb3ced3dec60dc2a81776e@165.227.41.206:26656,3c7a5920811550c04bf7a0b2f1e02ab52317b5e6@165.227.43.146:26656,303a1a4312c30525c99ba66522dd81cca56a361a@159.89.115.32:26656,b686c2a7f4b1b46dca96af3a0f31a6a7beae0be4@159.89.119.125:26656
ExecReload=/bin/kill -HUP $MAINPID
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

然后，停止节点：

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet stop.yml
```

最后，再次运行安装角色：

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet install.yml
```

以使用新标志重新运行 `tendermint node` 在所有 droplets 上。`latest_block_hash` 现在应该在变化，而 `latest_block_height` 在增加。您的测试网络现在已经启动 :)

使用状态角色查看日志：

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet status.yml
```

## 日志记录

最简单的方法是上面描述的状态角色。您还可以将日志发送到 Logz.io，这是一个 Elastic Stack（Elasticsearch、Logstash 和 Kibana）服务提供商。您可以设置节点自动将日志发送到那里。在 [此页面](https://app.logz.io/#/dashboard/data-sources/Filebeat) 上创建帐户并获取 API 密钥，然后：

```sh
yum install systemd-devel || echo "This will only work on RHEL-based systems."
apt-get install libsystemd-dev || echo "This will only work on Debian-based systems."

go get github.com/mheese/journalbeat
ansible-playbook -i inventory/digital_ocean.py -l sentrynet logzio.yml -e LOGZIO_TOKEN=ABCDEFGHIJKLMNOPQRSTUVWXYZ012345
```

## 清理

要删除您的 droplets，请运行以下命令：

```sh
terraform destroy -var DO_API_TOKEN="$DO_API_TOKEN" -var SSH_KEY_FILE="$SSH_KEY_FILE"
```



---
order: 3
---

# Terraform & Ansible

> Note: These commands/files are not being maintained by the tendermint team currently. Please use them carefully.

Automated deployments are done using
[Terraform](https://www.terraform.io/) to create servers on Digital
Ocean then [Ansible](http://www.ansible.com/) to create and manage
testnets on those servers.

## Install

NOTE: see the [integration bash
script](https://github.com/tendermint/tendermint/blob/v0.34.x/networks/remote/integration.sh)
that can be run on a fresh DO droplet and will automatically spin up a 4
node testnet. The script more or less does everything described below.

- Install [Terraform](https://www.terraform.io/downloads.html) and
  [Ansible](http://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html)
  on a Linux machine.
- Create a [DigitalOcean API
  token](https://cloud.digitalocean.com/settings/api/tokens) with read
  and write capability.
- Install the python dopy package (`pip install dopy`)
- Create SSH keys (`ssh-keygen`)
- Set environment variables:

```sh
export DO_API_TOKEN="abcdef01234567890abcdef01234567890"
export SSH_KEY_FILE="$HOME/.ssh/id_rsa.pub"
```

These will be used by both `terraform` and `ansible`.

## Terraform

This step will create four Digital Ocean droplets. First, go to the
correct directory:

```sh
cd $GOPATH/src/github.com/tendermint/tendermint/networks/remote/terraform
```

then:

```sh
terraform init
terraform apply -var DO_API_TOKEN="$DO_API_TOKEN" -var SSH_KEY_FILE="$SSH_KEY_FILE"
```

and you will get a list of IP addresses that belong to your droplets.

With the droplets created and running, let's setup Ansible.

## Ansible

The playbooks in [the ansible
directory](https://github.com/tendermint/tendermint/tree/v0.34.x/networks/remote/ansible)
run ansible roles to configure the sentry node architecture. You must
switch to this directory to run ansible
(`cd $GOPATH/src/github.com/tendermint/tendermint/networks/remote/ansible`).

There are several roles that are self-explanatory:

First, we configure our droplets by specifying the paths for tendermint
(`BINARY`) and the node files (`CONFIGDIR`). The latter expects any
number of directories named `node0, node1, ...` and so on (equal to the
number of droplets created).

To create the node files run:

```sh
tendermint testnet
```

Then, to configure our droplets run:

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet config.yml -e BINARY=$GOPATH/src/github.com/tendermint/tendermint/build/tendermint -e CONFIGDIR=$GOPATH/src/github.com/tendermint/tendermint/networks/remote/ansible/mytestnet
```

Voila! All your droplets now have the `tendermint` binary and required
configuration files to run a testnet.

Next, we run the install role:

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet install.yml
```

which as you'll see below, executes
`tendermint node --proxy_app=kvstore` on all droplets. Although we'll
soon be modifying this role and running it again, this first execution
allows us to get each `node_info.id` that corresponds to each
`node_info.listen_addr`. (This part will be automated in the future). In
your browser (or using `curl`), for every droplet, go to IP:26657/status
and note the two just mentioned `node_info` fields. Notice that blocks
aren't being created (`latest_block_height` should be zero and not
increasing).

Next, open `roles/install/templates/systemd.service.j2` and look for the
line `ExecStart` which should look something like:

```sh
ExecStart=/usr/bin/tendermint node --proxy_app=kvstore
```

and add the `--p2p.persistent_peers` flag with the relevant information
for each node. The resulting file should look something like:

```sh
[Unit]
Description={{service}}
Requires=network-online.target
After=network-online.target

[Service]
Restart=on-failure
User={{service}}
Group={{service}}
PermissionsStartOnly=true
ExecStart=/usr/bin/tendermint node --proxy_app=kvstore --p2p.persistent_peers=167b80242c300bf0ccfb3ced3dec60dc2a81776e@165.227.41.206:26656,3c7a5920811550c04bf7a0b2f1e02ab52317b5e6@165.227.43.146:26656,303a1a4312c30525c99ba66522dd81cca56a361a@159.89.115.32:26656,b686c2a7f4b1b46dca96af3a0f31a6a7beae0be4@159.89.119.125:26656
ExecReload=/bin/kill -HUP $MAINPID
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

Then, stop the nodes:

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet stop.yml
```

Finally, we run the install role again:

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet install.yml
```

to re-run `tendermint node` with the new flag, on all droplets. The
`latest_block_hash` should now be changing and `latest_block_height`
increasing. Your testnet is now up and running :)

Peek at the logs with the status role:

```sh
ansible-playbook -i inventory/digital_ocean.py -l sentrynet status.yml
```

## Logging

The crudest way is the status role described above. You can also ship
logs to Logz.io, an Elastic stack (Elastic search, Logstash and Kibana)
service provider. You can set up your nodes to log there automatically.
Create an account and get your API key from the notes on [this
page](https://app.logz.io/#/dashboard/data-sources/Filebeat), then:

```sh
yum install systemd-devel || echo "This will only work on RHEL-based systems."
apt-get install libsystemd-dev || echo "This will only work on Debian-based systems."

go get github.com/mheese/journalbeat
ansible-playbook -i inventory/digital_ocean.py -l sentrynet logzio.yml -e LOGZIO_TOKEN=ABCDEFGHIJKLMNOPQRSTUVWXYZ012345
```

## Cleanup

To remove your droplets, run:

```sh
terraform destroy -var DO_API_TOKEN="$DO_API_TOKEN" -var SSH_KEY_FILE="$SSH_KEY_FILE"
```
