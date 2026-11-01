---
title: "从零搭一条 CI 流水线，五个报错全指错了方向"
date: 2026-11-01
summary: "Ubuntu 26.04 的 Docker 源不存在、PEP 668 报错里不提 venv、CRLF 让 Dockerfile 在 Linux 里静默失效、密码认证早已废弃、空仓库推不上去——每条报错指引的地方都不是根因。"
tags: ["CI/CD", "Docker", "调试记录"]
category: "项目复盘"
draft: false
---

`cicd-demo` 第一阶段的目标很小：一个 Flask 应用，push 之后自动跑测试、构建镜像、推到 ghcr。真正花掉时间的不是写代码，是五个报错——每一个都在指错方向。

## 一、Ubuntu 26.04 的代号，Docker 的源里根本不存在

按官方文档那套 `$(lsb_release -cs)` 拼源地址，`apt update` 直接 404。

根因在 apt 取索引的机制：它会去拼 `dists/<codename>/Release` 这个 URL，先把这个索引拿下来才知道源里有哪些包。我的系统是 Ubuntu 26.04，代号 `resolute`，而 Docker 官方源和阿里云镜像最新只做到 `noble`（24.04）——非 LTS 版本经常直接被跳过。所以这不是网络问题，是那个路径在服务器上压根不存在。

验证只要一条：

```bash
curl -I https://download.docker.com/linux/ubuntu/dists/resolute/Release   # 404
curl -I https://download.docker.com/linux/ubuntu/dists/noble/Release      # 200
```

修复是在 `sources.list.d/docker.list` 里把代号写成 `noble`。Docker 的 .deb 只依赖 libc 这类基础库，24.04 的包在 26.04 上装得上。

这段还有个连带的坑：`download.docker.com` 在国内 443 超时了 133 秒，于是换阿里云 `mirrors.aliyun.com/docker-ce/linux/ubuntu`——**GPG 密钥也必须一起换**，用阿里云源却留着官方 keyring，会报签名错误。那个错误看起来像「仓库被人篡改了」，实际只是钥匙配错了锁。

## 二、`externally-managed-environment` 里没有半个字提到 venv

```
error: externally-managed-environment
× This environment is externally managed
```

Ubuntu 23.04 起（PEP 668）系统 Python 被标记为外部管理：只要 `/usr/lib/python3.14/EXTERNALLY-MANAGED` 存在，pip 就拒绝往系统目录写包，怕 `apt` 和 `pip` 互相覆盖、把系统自带的工具链搞坏。

但我的情况是——venv 建了，`source` 也执行了。问题在于我是在**另一个终端窗口**里建的，`source` 只对那一个 shell 生效；新开的窗口里 `which pip` 指向 `/usr/bin/pip`。

一条命令就能分清：

```bash
which pip
# /usr/bin/pip                          → 系统的，必然报这个错
# .../cicd-demo/.venv/bin/pip           → 正确的
```

修的时候还有个细节：Ubuntu 26.04 的 `python3-venv` 不含 ensurepip，只装它建出来的 venv 是缺 pip 的，得连 `python3-full` 一起装。

被否掉的方案是 `pip install --break-system-packages`。它确实能让命令当场跑过去，代价是把 Flask 装进系统目录，之后 `apt upgrade` 和 pip 互相覆盖，问题从「装不上」变成「某天莫名其妙就坏了」。为了省一次排查而埋一颗延迟引信，不划算。

## 三、CRLF：Dockerfile 在 Windows 上看着完美，在 Linux 里执行失败

`git add` 之后一排警告：

```
warning: in the working copy of 'Dockerfile', LF will be replaced by CRLF the next time Git touches it
```

Windows 上的 git 默认 `core.autocrlf=true`，检出时 LF 换 CRLF，提交时换回来。Python 文件带着 CRLF 无所谓，但 Dockerfile 的换行会被当成指令的一部分交给 shell：

```dockerfile
RUN pip install -r requirements.txt\r
```

Docker 收到的包名是 `requirements.txt\r`。`\r` 不可见，报错会写成 `package '\r' not found` 这种完全指错方向的话，而文件在编辑器里看起来毫无异常。

判断：`file Dockerfile`，输出里带 `CRLF line terminators` 就是它。

修复用 `.gitattributes`，内容是 `* text=auto eol=lf`，再补一个仓库级的 `git config core.autocrlf false`。为什么不能只改配置——`.gitattributes` 跟着仓库走，别人克隆、换电脑、CI 里 checkout 都拿到一致的结果；`core.autocrlf` 是每个人自己机器上的私有设置，管不住任何别人。

## 四、GitHub 早就不要密码了，而我把令牌贴进了聊天框

```
remote: Invalid username or token. Password authentication is not supported for Git operations.
fatal: Authentication failed for 'https://github.com/...'
```

2021 年 8 月起 GitHub 关闭了 HTTP 密码认证，必须用 Personal Access Token。这个报错算友好的，至少明确说了 token。

真正危险的是下一步：我直接把 `ghp_` 开头的那串令牌贴进对话，问「这个怎么用」。令牌一旦离开本机就等于公开——拿到它的人可以以我的身份推代码、读私有仓库、删包。没有技术判断可言，这是流程事故。

处理是立刻吊销重建，然后换一种不落地的方式：

```bash
docker login ghcr.io -u <用户名>
# 提示 Password 时粘贴，不回显，不进历史
```

想连 shell 历史都不留，用交互读入：

```bash
read -rsp "PAT: " CR_PAT; echo
echo "$CR_PAT" | docker login ghcr.io -u <用户名> --password-stdin
unset CR_PAT
```

同样别做的：把令牌拼进 remote URL（`https://ghp_xxx@github.com/...`）。它会明文写进 `.git/config`，哪次 `git add -A` 就跟着进了提交历史，之后要清干净得改写历史。

## 五、空仓库推不出去

```
error: src refspec main does not match any
error: failed to push some refs to 'https://github.com/...'
```

这个报错最容易被读成「分支名写错了」或者「remote 配错了」，然后开始一通乱查。它的实际意思是：**本地一个 commit 都没有，没有东西可以推**。远端 `main` 这个 ref 还不存在，本地也变不出来。

验证：`git log --oneline` 会直接说 `your current branch 'main' does not have any commits yet`。

修法是先 `git add` + `git commit`，再 `git push -u origin main`（`-u` 只有第一次需要）。

连带一个认知修正。`git reset` 之后执行 `git add .`，再 `git status --short`，屏幕一片空白，我以为 add 失败了。实际上是之前已经 commit 过一次——工作区干净、暂存区也空，所以没有任何输出。一条 `git log --oneline` 就能看见真相，我却先去怀疑 `.gitignore` 和 exclude 规则了。

## 共性

五条里三条是环境与版本差异（代号 `resolute`、CRLF、密码认证废弃），一条是 shell 状态（venv 未激活），一条是 git 语义误读。

共同点是**报错信息指向的位置全都不是根因**。`externally-managed-environment` 不会告诉你 `which pip` 指向了哪；CRLF 让你去查 pip 的包名解析；`src refspec` 让你去查分支配置。所以现在养成的顺序是：先跑一条能看见真实状态的验证命令（`which pip`、`file Dockerfile`、`git log`、`curl -I`），再决定改哪里。猜着改的成本比验证高一个数量级。

另一条属于流程：密钥类的东西落地即泄露，这不是「小心点」能防的。要么用不回显的交互输入，要么用凭据管理器，让它根本不经过命令行。人手动搬运的环节，迟早会搬错一次。

第一阶段剩下的验证（从 ghcr 拉回镜像、跑起来）是纯机械操作，没有新坑。下一阶段进 Kubernetes，kind 把节点跑在 Docker 容器里，那时候 `-p 端口映射` 和 `Service` 的关系会真正咬人。
