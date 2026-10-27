---
title: "一天写出一个运维 agent：从找空档到跑通 V1"
date: 2026-10-28
summary: "先扒 11 个开源同类项目找空档，把定位定在主机侧深挖，然后一天之内从零走到 V1 能跑完整链路。记下 15 条决策是怎么来的、正则改 tokenizer 那次架构转向、修掉的十来个真 bug，以及 langgraph 文档里查不到的三条事实。"
tags: ["AI Agent", "运维", "Python", "LangGraph", "SSH"]
category: "开发日志"
draft: false
---

一天之内从"想做个运维 agent"走到 V1 能跑完整链路。31 次提交，34 个模块文件 6083 行，13 个测试文件 3192 行 472 个测试。

这篇不是变更日志（那看 `git log`），记的是**当时的判断依据**——三个月后回来看，"为什么不用正则匹配命令"这类问题只有这里能答。

## 先找空档，再动手

没有直接开写，先扒了 11 个开源同类项目（星数为当天快照）：

| 项目 | 星数 | 技术栈 | 结论 |
|---|---|---|---|
| `k8sgpt-ai/k8sgpt` | 8275 | Go | 约 60 条规则分析器，值得抄结构 |
| `GoogleCloudPlatform/kubectl-ai` | 7593 | Go | 绑定 K8s |
| `kagent-dev/kagent` | 4090 | Go | 绑定 K8s |
| `HolmesGPT/holmesgpt` | 3680 | Python | CNCF Sandbox，toolset 设计最值得学 |
| `openocta/openocta` | 3218 | Go | 桌面版 ITOps Agent，Skills 市场 |
| `ongridio/ongrid` | 1221 | Go+TS | **与需求重合度最高**，双层 Agent |
| `microsoft/AIOpsLab` | 1019 | Python | 评测基准，不是产品 |

浅克隆了 7 个到本地参考目录（约 340MB，已 gitignore）。

**核心判断：这条赛道已经挤满了，但挤在同一个地方**——全部押注 Kubernetes 与可观测性数据（Prometheus / Loki / Tempo）。**Linux 主机侧的深度诊断几乎无人做**：systemd 依赖链、dmesg / OOM killer 现场、conntrack 表、netns、nftables 规则链、nginx 配置到底生效没生效。

这不是"没人想到"，是"不好做"：K8s 有结构化 API，主机只有一堆文本输出。但恰恰因为难，做出来的东西才有价值。于是把项目定位定在**主机侧深挖**，K8s 放 roadmap。

## 需求先对齐，不猜

用问答方式定了 15 条决策。几条关键的：

- **MVP 只做 Linux + Docker + Nginx**。原需求列了十项（还有 k8s、网络、防火墙、JVM、Node.js、监控、通知），全做等于全做不深。砍到三个，其余写进 roadmap。
- **只读诊断 + 人工确认后执行**。不是"全自动修复"——建立信任要分阶段，第一版就自动改生产环境的 agent 没人敢用。
- **目标机身份双模式**：低权账号 + sudo 白名单 / root，按主机配。默认最小权限。
- **LangGraph + LiteLLM**。选 LangGraph 的理由很具体：`interrupt()` + checkpointer 天生就是"执行前暂停待批、批准后断点续跑"，自己实现这套状态机要写一堆代码还容易错。

事后看这个选择是对的，但也付出了代价（见后面 langgraph 那节）。

## 最关键的架构转向：命令不能靠正则判

最初的 `policy.py` 是拿正则匹配整条命令字符串判断"这条能不能只读跑"。写到一半去读了 ongrid 的 `internal/edgeagent/cmdpolicy/`，发现人家的做法完全不同：

**手写 tokenizer 把命令切成 argv** → 重定向 / `;` / `&&` / `$()` / 反引号 / 未闭合引号一律报错 → 按二进制分类（read-fs / read-system / mixed / network / denied）→ `mixed` 类按子命令与参数判别读写 → 最后拿干净 argv **不经 shell** 执行。

正则为什么不行？`systemctl status nginx; rm -rf /` 这种，正则匹配到前缀 `systemctl status` 就放行了。这类绕过想不完，只能从结构上杜绝——**不认识的东西一律拒绝**。

整个 `policy.py` 推倒重写（569 行，全项目最大的单文件）。分类用"写优先"：`ip link set eth0 down` 的写动词在第二位，只看第一个词会漏。

同源借鉴的还有 holmesgpt 的两样东西：

- **toolset = YAML 命令模板**，启发了我"工具就是命令模板 + 参数校验"的写法。
- **一句血泪教训**写在他们仓库的 `CLAUDE.md` 里："Server-Side Filtering is Critical — Never return unbounded data from APIs"。他们的 `opensearch_list_shards` 返回全部 shards，一次吃掉 25K+ tokens。这直接决定了我们的 8KB 单次输出上限。

## 编码顺序：底座先硬

一天的实际顺序，每一步都是"上一步不硬就不往下走"：

1. `config.py` — 配置分层、主机清单、sudo 白名单
2. `ssh.py` — 长连接池、跳板机、超时、按字节裁剪
3. `policy.py` + `privileges.py` — 只读策略、权限三级、提权申请单
4. `tools/` — **32 个只读诊断工具**（linux 14 / docker 8 / nginx 7 / knowledge 3，linux 组含 `run_shell`）
5. `runbooks/` — **8 份故障判定树**，每份 53–70 行，是判定树不是摘要
6. `store/` — SQLite 七张表
7. `notify/` — 五通道（飞书/钉钉/企微/邮件/webhook）
8. `agent/` — LangGraph 图：plan → act → observe → report → approve
9. `runner.py` — 把上面全部串起来
10. `cli.py` + `mcp_server.py` — 两个入口
11. 审批中断（最后一块，也是最难的一块）

## 修掉的真缺陷

测试不是走过场，**472 个测试抓出了十来个真 bug**，有几个是安全侧的：

- **危险命令黑名单里混着大写**（`"iptables -F"`、`"nft flush"`），但匹配前已经 `lower()` 过了 → 这两条**永远匹配不上**。等于最危险的命令反而没被拦。
- **故障判定树检索返回零分命中**。测试用"用户头像上传后模糊"去查，居然命中了 nginx-502 和 nginx-504——因为 runbook 的适用说明里有"用户""报告""出现"这些泛用词。零分命中比查不到更坏：模型会以为找对了场景，然后往错的方向查。修法是加停用词 + 丢零分。**返回空比返回错的好。**
- **工具预算的静默漏洞**。四个节点各自读 `ctx.get("budget")`，但测试只在 `tool_ctx.budget` 上设了耗尽状态 → 预算明明用尽还在执行命令。
- **零证据兜底自己产出的报告过不了自己的检查**。它的证据节写的是"（无）"，而"（无）"在占位符黑名单里。零证据时直接给结论是最后的防线，防线自己塌了。
- **动作抽取会整条吞掉危险命令**。切分函数原来按"上一块是否已有命令行"判是否开新块，结果 `rm -rf /var/log/app/*.log` 被并进上一块、整条消失。**抽不到动作 = 这条危险操作永远不会提示人**，属于安全侧漏报。改成只按行首缩进判顶层。
- **`2>&1` 与自己的策略冲突**。`docker_logs` 为了合并容器日志拼了 `2>&1`，但 tokenizer 把重定向当 shell 操作符直接拒绝——功能上线即失效。改成走 ssh 层合并。
- **进程列表表头切错**。硬取前三行，两行数据被当表头。这类"看起来对"的 bug 最隐蔽。
- **`load_config(path)` 会叠加用户级配置**，导致"指定配置文件"这件事失效。doctor 拿着临时配置去查，读到的却是真实配置。

还有一个是准备测真机时才发现的：`host_ip` 一直在跑 `ip -br addr`，而我们自己的只读策略只认"子命令在最前面"的写法，`-br` 挡在前面就判"无法判定"直接拒绝。更糟的是拒绝原因被当成正文拼进了数据段——**模型拿到的是伪装成地址数据的拒绝消息**，497 个单测全绿，真机上一直喂空气。同类还有 `systemctl --failed`，恰好是排查服务起不来最常用的那条命令。

## langgraph 的坑：探针比文档可靠

审批中断是最后一块。文档读不出关键语义，于是写了两个探针脚本实跑（跑完删了），拿到三条**文档里没有的事实**：

1. **`invoke()` 撞到 `interrupt()` 不抛异常**，返回的状态里多一个 `__interrupt__` 键。文档的说法容易让人写成 try/except。
2. **恢复时节点会从头重跑**（TRACE 里 `gate:enter` 出现两次）。这条最要命——`interrupt()` 之前的代码会执行两遍。**所以执行命令、切计数、落库必须放在 interrupt 之后**，否则用户批一次、命令跑两次。
3. **`SqliteSaver` 不支持 `with` 语句**，得手动 `sqlite3.connect` → `SqliteSaver(conn)` → `setup()` → 用完 `close()`。

第 2 条如果没验证，写出来的代码测试全绿、逻辑全错——因为它只在"用户真的批准了"的时候才暴露成双跑。

## 事故：不要用 PowerShell 改源码

用 `(Get-Content -Raw) -replace ... | Set-Content -NoNewline` 批量改 `nginx.py`，把文件写成了非 UTF-8。之后读报 "invalid UTF-8 text"，写报 "file changed since it was read"——工具层直接锁死。

修复路径很绕：删掉 → 建空文件 → 读一次让它进入已读状态 → 全量重写。

**教训：改源码一律用编辑工具，绝不用 shell 的字符串替换。** 后者不检查编码、不检查行尾、也不进入工具的已读状态管理。

其他环境坑：

- git 把进度写 stderr 时，PowerShell 5.1 报 `NativeCommandError` 且 exit code 1，**但命令实际成功了**。差点因此重试一次已成功的 push。
- `git commit -m "多行中文"` 在 PowerShell 5.1 里被拆成多个 pathspec，直接失败。可靠做法是消息写文件 + `git commit -F`。
- `gh` 装好了但不在当前进程 PATH 里（winget 改了用户 PATH，要重开终端），只能用绝对路径调。

## 现在的样子

```
opsmate/                 34 文件 6083 行
├── transport/           命令策略 569 · ssh 354 · 权限 163
├── tools/               32 个只读工具 + registry
├── runbooks/            8 份判定树 485 行
├── agent/               plan→act→observe→report→approve，含审批断点
├── store/               七张表，审计存命令原文、只裁输出
├── notify/              五通道
├── runner.py            装配层
├── cli.py               ask / hosts / tools / runbooks / runs / show / doctor / selftest / version
└── mcp_server.py        31 个采集工具（run_shell 要 --allow-shell）

tests/                  13 文件 3192 行 472 测试，ruff 全绿
```

四个能力入口：CLI 诊断、MCP 给 Claude Desktop 这类客户端、审批续跑、工具自检。

## 没做、拿不准的地方

诚实记下来，免得下版当成"已完成"：

- **全链路没在真机跑过**。472 个测试全是假 executor，真实 SSH 下的诊断质量、提示词效果、模型会不会胡编，一次都没验证。这是当前最大的未知。
- **审批断点只在进程内**（待批队列是内存字典）。进程退了断点就没了，`checkpoints.db` 落了盘但没人从磁盘捡回来。跨进程续跑是下一版的事。
- **工具预算 15 次拍脑袋定的**，没实测过够不够排查一个真实故障。
- **动作抽取靠文本格式**，本质脆弱。模型不照格式写就抽不到，抽不到就静默不执行——安全方向是对的，但可用性有隐患。长期应该改成结构化输出。
- **JVM / Node.js 有隐藏门槛**：`jstack` / `jcmd` 必须以运行进程的 owner 身份执行，权限层现在没留这个扩展点。Node 的事件循环滞后没有通用只读手段，需要埋点。

## 下一步

优先级排序的理由：**验证 > 扩张**。

1. 找一台真机（或 docker-compose 起 5 个故障场景）跑通，把提示词和判断树调准。现在所有信心都建立在"测试全绿"上，而测试用的是假数据。
2. 把提权申请流跑通——磁盘满、Docker OOM 这类最常见故障恰恰需要读 `dmesg` 和 `/var/log`，没权限就是查不下去。这在 V1 是**日常路径**不是边缘功能。
3. 然后才开 V2（网络防火墙 / JVM / Node.js / 多主机并行）。
