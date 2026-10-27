# CI/CD 与发布工程面试题库 · 全面版

> 难度标记：`【初】` 必答 · `【中】` 分水岭 · `【高】` 加分项
> 范围：这份题库只打持续集成与发布那一摊——流水线阶段划分、Jenkins / GitLab CI / GitHub Actions 三套工具、构建与依赖、镜像构建、制品仓库、分支模型、测试与质量门禁、静态扫描与供应链安全、凭证管理、IaC、发布策略、GitOps、回滚热修、流水线排障。答案仍然按 **是什么 → 为什么 → 怎么做 → 踩过什么坑** 组织，能直接背成面试口语。

---

## 目录

1. 流水线设计与阶段划分
2. Jenkins 运维与 Groovy 流水线
3. GitLab CI 与 GitHub Actions
4. 构建工具与依赖管理
5. 容器镜像构建与优化
6. 制品仓库与版本管理
7. Git 工作流与分支策略
8. 测试自动化与质量门禁
9. 静态扫描与依赖安全
10. 密钥与凭证管理
11. 基础设施即代码与环境编排
12. 发布策略与流量切换
13. GitOps 与配置漂移
14. 回滚、热修与降级
15. 流水线故障排查与性能
16. CI/CD 与发布速记卡

---

## 一、流水线设计与阶段划分

### Q1. 一条完整的 CI/CD 流水线通常分几个阶段，每个阶段在回答什么问题？【初】

按「代码能不能合 → 制品能不能出 → 这个制品能不能上 → 上了会不会炸」四问拆：

| 阶段 | 干什么 | 产出 | 失败意味着 |
|---|---|---|---|
| 校验 | lint、类型检查、单测 | 报告 | 代码质量不合格，不该合 |
| 构建 | 编译、打包、出镜像 | **唯一制品 + 版本号** | 环境/依赖问题，不该继续 |
| 验证 | 集成、E2E、扫描 | 测试与扫描报告 | 制品不可信，不该发 |
| 发布 | 部署、灰度、放量 | 部署记录 | 变更本身有问题，回滚 |

**核心约束：后面所有阶段都消费构建阶段那一个制品，绝不再重新编译。** 这是 build once、deploy anywhere 的落点。

踩坑：把安全扫描放在发布阶段，扫出高危只能硬着头皮发或者临时豁免；放在构建后、上生产前才有关门的意义。

追问常考：哪些阶段必须阻断合入，哪些只做记录（lint 警告、覆盖率下降不作硬门禁）。

---

### Q2. 构建、测试、发布三个环节的职责边界怎么划？边界不清会出什么问题？【初】

一句话分工：

- **构建只负责把源码确定性地变成制品**，不碰环境、不碰流量
- **测试只负责证明制品可用**，不改制品内容
- **发布只负责让制品到达流量**，不重新构建

边界不清最典型的三种事故：

1. **发布脚本里偷偷重新 build** → 线上跑的产物和测试过的产物不是同一个，回归失效
2. **构建阶段写死了环境地址** → 制品被环境绑死，一套镜像发不了三个环境
3. **测试阶段改配置文件** → 制品的可复现性被破坏，事后无法复原

**判据：制品的 digest 从构建结束到线上运行，全程不能变。** 谁改制品谁就是错的一方。

---

### Q3. 流水线里的并行与依赖怎么编排？怎么找到最短路径？【中】

编排的本质是画 DAG：**只声明依赖，不声明顺序**，让没有依赖的任务自然并行。

```yaml
stages: [check, build, verify, deploy]

unit:
  stage: check
  script: npm run test:unit

compile:
  stage: build
  needs: [unit]
  script: npm run build

e2e:
  stage: verify
  needs: [compile]
  script: npm run test:e2e

scan:
  stage: verify
  needs: [compile]
  script: trivy image app:$CI_COMMIT_SHA
```

三条原则：

- **关键路径决定总时长**，优化要打在最长的链上，把非关键路径并行掉收益有限
- 同一 stage 内默认并行，`needs` 可以跨 stage 抢跑（GitLab 的 `needs` 会打破 stage 屏障）
- 并行任务**禁止共享工作目录**，各自用独立 workspace，否则互相删文件

踩坑：为了「看起来并行」把 E2E 和单测放同一 stage，结果 E2E 占满 runner，单测排队反而更慢——并行要配合资源配额看。

---

### Q4. 单条流水线还是拆成多条流水线？判断依据是什么？【中】

看五个维度，不是看个人喜好：

| 维度 | 倾向单条 | 倾向多条 |
|---|---|---|
| 触发源 | 都是 push 触发 | 定时/手动/上游流水线触发各自独立 |
| 权限 | 同一批人能改 | 发布需要 separate 审批人 |
| 时长 | 全流程 10 分钟内 | 单测 3 分钟、E2E 40 分钟 |
| 复用 | 只有一个应用 | 多服务共用同一套模板 |
| 失败影响面 | 失败一起红 | 一个服务挂了不该阻塞其他服务 |

**生产主流做法是「一条主干流水线 + 可复用的模板/子流水线」**：主干保证一次提交端到端可验证，模板保证几百个仓库不用各写一遍。GitLab 的 `include`/`trigger`、GitHub 的 reusable workflow、Jenkins 的共享库都是这个路子。

踩坑：拆太碎会出现「A 流水线绿、B 流水线红，没人知道整体能不能发」，必须有一个汇总视图或者发布火车来兜。

---

### Q5. 质量门禁应该卡在哪几个位置？门禁该怎么设计才不会被绕过？【中】

三个卡点，位置不同、目的不同：

1. **合入前（PR 门禁）**：单测、lint、SAST 增量扫描。要求**快**（10 分钟内），慢门禁会逼人找管理员跳过
2. **制品产出后（制品门禁）**：镜像扫描、签名、SBOM 生成。卡的是「这个制品能不能进仓库」，不合格就打不上 release tag
3. **上线前（变更门禁）**：审批、灰度判定、变更窗口。卡的是「现在能不能发」

设计要点：

- **门禁只能收紧不能绕过**：管理员跳过要留审计记录，不能静默 `--force`
- **区分阻断与告警**：高危漏洞阻断，代码异味只告警，全都阻断等于全都放行
- **门禁要能解释**：报错必须给出「哪一行、哪个 CVE、怎么修」，否则开发者只会不断重跑

踩坑：门禁阈值随时间腐烂。半年前定的覆盖率 80%，现在没人敢动，最后被整体豁免——**门禁要有 owner 和定期复核**。

---

### Q6. 怎么做到「失败快速反馈」？哪些手段真的有效？【高】

原则：**按「失败概率 × 单次耗时」倒序排，最容易挂、最快能判死的放最前面。**

有效手段：

- **前置超快的检查**：`pre-commit` + CI 第一分钟跑 lint / 类型检查，把 80% 的低级错误挡在 60 秒内
- **分片并行**：单测按文件分 8 片跑，40 分钟压到 6 分钟
- **只跑受影响的**：monorepo 用依赖图算 affected projects，改一个包不跑全量
- **fail fast 语义**：`set -e`、`--bail`、`-x`（Maven 用 `-ff`），第一个失败就停，别跑完 2000 个用例再报
- **预热与常驻**：dependency cache、构建机预拉基础镜像、常驻的 test container
- **把慢的挪到非关键路径**：E2E 和全量扫描可以异步跑、结果回写到 PR

要盯的指标：**提交到第一个失败反馈的 p50 / p95**，而不是总时长。

踩坑：为了「快」把单测删了，反馈是快了，但问题挪到了线上，这是负优化。

---

### Q7. 要设计一个支撑几百个仓库的流水线平台，你会怎么分层？【高】

四层，缺一层就会退化成「每个人都来问运维」：

| 层 | 职责 | 典型实现 |
|---|---|---|
| 模板层 | 统一的阶段、门禁、命名规范 | shared library / reusable workflow / CI component |
| 执行层 | runner 池、标签、配额、缓存 | K8s 上的 ephemeral runner、自动扩缩 |
| 制品层 | 仓库、签名、保留策略 | Harbor + cosign + Nexus |
| 观测层 | 时长、成功率、队列等待、成本 | 埋点到 Prometheus + 看板 |

三条设计红线：

- **自助接入**：新仓库只提一个 PR 加几行 yaml 就能用上全部门禁，不需要找人开权限
- **别自研调度器**：调度、重试、并发控制这些交给成熟工具，自研的最终都变成不可维护的脚本堆
- **配额与限流必须一开始就有**：否则一个大仓的 matrix 会把整个 runner 池打满，全公司排队

踩坑：模板层写得太"聪明"，几十个 `if` 分支覆盖各种特例，最后没人敢改——**模板要允许逃生舱（显式 opt-out），但不能默认例外**。

---

## 二、Jenkins 运维与 Groovy 流水线

### Q8. Jenkins 的 master/agent 架构是怎样的？为什么构建不能跑在 master 上？【初】

- **controller（原 master）**：存配置、调度任务、提供 Web UI、管理插件与凭据。**不该执行构建**
- **agent（原 slave）**：真正跑 job 的机器，通过 JNLP（TCP/WebSocket）或 SSH 连回 controller
- 通信走 agent → controller 主动建连（出网方向），这样 agent 可以放在内网

构建不能跑在 controller 上的原因：

1. **安全**：流水线代码等同于在 controller 上执行任意代码，`Jenkinsfile` 被改就能读走所有凭据、改所有 job
2. **稳定性**：构建把磁盘写满、CPU 打满，controller 挂了全公司停摆
3. **隔离**：不同项目的依赖、环境互相污染

落地：controller 上把 executor 数量设成 **0**，强制所有 job 带 `agent { label ... }`。

追问常考：controller 要不要 HA？单点怎么降级（定期备份 `$JENKINS_HOME` + JCasC 声明式配置，随时可重建）。

---

### Q9. agent 怎么扩容？标签（label）体系怎么设计？并发怎么控？【中】

扩容三种路子：

- **静态机器池**：简单、可预测，但空闲也占资源，适合有特殊硬件的场景
- **K8s 动态 agent**：`kubernetes` 插件按需起 Pod，用完即销，**是目前主流**
- **云主机弹性**：EC2/竞价实例插件，启动慢（分钟级），适合长任务

标签体系按**能力**而不是按**项目**打：

```text
linux && docker && highmem      # 能力组合
macos && xcode15                # 特殊平台
gpu && a100                     # 特殊硬件
```

用一个 job 用一组标签做交集匹配，避免出现 `build-for-project-a` 这种一次性标签。

并发控制：

- `options { disableConcurrentBuilds() }` 防同一分支并发覆盖工作区
- 节流插件（Throttle Concurrent Builds）按标签限制总并发，防止一个仓库打满池子

踩坑：动态 agent 起来要先拉镜像、装依赖，**冷启动 1–2 分钟**是常态，别把 30 秒的小任务扔给它。

---

### Q10. Declarative 和 Scripted 流水线怎么选？Declarative 里怎么写复杂逻辑？【中】

| | Declarative | Scripted |
|---|---|---|
| 形态 | `pipeline { agent/stages/steps }` 固定结构 | 纯 Groovy，`node {}` 起手 |
| 校验 | 起手就校验结构，报错早 | 运行到那行才知道错 |
| 表达力 | 受限，复杂逻辑要 `script {}` 逃逸 | 完全自由 |
| 推荐 | **新项目默认选它** | 历史存量、极复杂的动态编排 |

Declarative 里写复杂逻辑的三个合法出口：

- `script { }` 块里写任意 Groovy
- `when { expression { ... } }` 做条件
- 抽到共享库里做成 step，让 Jenkinsfile 保持干净

```text
pipeline {
  agent { label 'linux && docker' }
  options { timeout(time: 30, unit: 'MINUTES'); disableConcurrentBuilds() }
  stages {
    stage('test') {
      steps { sh 'make test' }
    }
    stage('deploy') {
      when { branch 'main' }
      steps { sh './deploy.sh' }
    }
  }
}
```

踩坑：`script {}` 里用 `return` 会从整个 pipeline 退出，而不是退出那个块；要提前终止用 `error('...')`。

---

### Q11. 共享库（Shared Library）怎么组织？为什么大团队必须用？【中】

目录结构固定，别自创：

```text
vars/            # 全局变量，Jenkinsfile 里直接调 deployTo('prod')
  deployTo.groovy
src/org/example/ # 真正的 Groovy 类，需要 @Library + import
resources/       # 静态文件，libraryResource 'scripts/notify.sh'
```

引用方式：

```text
@Library('company-ci@v2.3.0') _

pipeline {
  agent any
  stages { stage('deploy') { steps { deployTo(env: 'prod', app: 'api') } } }
}
```

必须用的理由：**几百个 Jenkinsfile 复制粘贴，改一条规则要开几百个 PR**。共享库把「阶段划分、门禁、通知、重试」收成一处。

三条纪律：

- **打 tag 引用**（`@v2.3.0`），别用 `@master`，否则改库等于全公司同时变更
- **库要能单测**，用 JenkinsPipelineUnit 或至少一个自测 job
- **库里不放业务逻辑**，只做编排和通用能力

踩坑：库里用 `env.BRANCH_NAME` 这类全局变量，在 PR 场景下可能是 `PR-123` 而非分支名，判断分支要用 `BRANCH_NAME` + `CHANGE_ID` 组合。

---

### Q12. 参数化构建怎么做？哪些参数是坑？【中】

```text
parameters {
  choice(name: 'ENV', choices: ['dev', 'staging', 'prod'], description: '目标环境')
  string(name: 'VERSION', defaultValue: '', description: '留空取最新制品')
  booleanParam(name: 'SKIP_TEST', defaultValue: false, description: '仅紧急热修使用')
  password(name: 'TOKEN', defaultValue: '', description: '一次性令牌')
}
```

要点：

- **参数变化会触发一次构建**（Jenkins 的行为），改参数定义时注意别误触发
- 参数在**第一次构建时还不存在**，`params.X` 会是 null，用 `env.X ?: 'default'` 兜底
- `password` 参数只在 UI 隐藏，**日志里照样可能被打出来**，敏感值走凭据绑定（`withCredentials`）
- `SKIP_TEST` 这类开关要限制谁能点（用 `input` 步骤 + 超时），否则迟早被当成常规操作

踩坑：`choice` 的 defaultValue 必须是 choices 里的值，写错会让整个 job 配置保存失败；改 choices 时顺手检查 defaultValue。

---

### Q13. Jenkins 的「插件依赖地狱」怎么治理？升级插件有什么风险？【高】

症状：装一个插件带进来五个依赖，升级一个核心插件导致其他插件不兼容，最后没人敢点升级。

治理手法：

- **最小插件集**：只装真正在用的，卸载前先看「谁在用这个插件」（插件页面有使用列表）
- **锁版本**：用 `plugins.txt` + `jenkins-plugin-cli --plugin-file` 做可复现的镜像，别在 UI 里手点
- **先备份再升级**：升级前备份 `$JENKINS_HOME`，或者干脆用 JCasC 重建一个容器做验证
- **定期跟 LTS**：跟住 LTS 节奏，比攒两年一次大跳安全得多
- **不用插件做能脚本化的事**：一条 `sh` 能解决的别引入插件

风险排序：

1. **核心（core）大版本升级**：最容易连带一堆插件不兼容，必须在测试实例先跑
2. **SCM / 凭据 / 授权类插件**：出问题影响所有 job
3. **UI 类插件**：挂了只是难看，优先级最低

踩坑：`Offline` 一个节点后插件升级，重启时正好有 job 在跑，流水线状态错乱——**升级窗口要选在没有长任务的时候，先 `quietDown`**。

---

### Q14. JNLP（inbound）agent 和 SSH agent 有什么区别？agent 安全要注意什么？【高】

| | JNLP / inbound | SSH |
|---|---|---|
| 连接方向 | **agent → controller**（出网） | controller → agent（需 controller 能连到 agent） |
| 适用网络 | agent 在内网/NAT 后、跨云 | 同网段、可控网络 |
| 认证 | agent 上的 secret + 证书 | SSH 密钥 |
| 配置成本 | 需要预置 secret（可用配置即代码下发） | 需要账号、密钥分发 |

安全要点：

- **agent 上的凭据等同泄露**：能跑流水线的人就能读走 agent 环境里的所有东西。凭据用 `withCredentials` 临时注入，不要设成全局环境变量
- **不要在 agent 上放长生命周期的高权令牌**，尤其是能推生产的
- **共享 agent 目录要隔离**：多个 job 共用一个 workspace 会互相覆盖，K8s 动态 agent 天然隔离
- **限制谁能创建/修改 job**：能改 Jenkinsfile 就等于能在 agent 上执行任意代码
- 出网要收敛：agent 只需要能访问制品库、代码库、controller，别给全量出网

踩坑：把 agent 挂成 `root` 跑 Docker（`/var/run/docker.sock` 挂进去），等于给流水线一个 root shell——**用 rootless 或 kaniko/BuildKit 替代**。

---

## 三、GitLab CI 与 GitHub Actions

### Q15. `.gitlab-ci.yml` 的整体结构是怎样的？核心关键字各管什么？【初】

```yaml
stages: [build, test, deploy]

variables:
  MAVEN_OPTS: '-Xmx1g'

default:
  image: eclipse-temurin:21-jdk
  retry:
    max: 2
    when: [runner_system_failure, stuck_or_timeout_failure]

build-job:
  stage: build
  script:
    - ./mvnw -B package -DskipTests
  artifacts:
    paths: [target/*.jar]
    expire_in: 1 week
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
```

关键字分工：

- `stages`：定义阶段顺序，**只有顺序，没有并行语义**；同 stage 的 job 并行
- `script` / `before_script` / `after_script`：真正执行的命令，`after_script` 在新 shell 里跑，**拿不到前面定义的变量**
- `rules`：唯一决定「跑不跑」，`only/except` 是旧写法
- `artifacts`：给下游 job 用的产物（打进 GitLab 存储）
- `cache`：给同类 job 复用的依赖缓存（落在 runner 本地或对象存储）
- `needs`：跨阶段抢跑，打破 stage 屏障

踩坑：`after_script` 失败不影响 job 状态（旧版本），别把关键断言写在那里。

---

### Q16. `rules`、`only/except`、`needs` 三者怎么配合？`rules` 的坑在哪？【中】

`only/except` 是旧模型，`rules` 是现在的唯一推荐；两者混用会报错。`needs` 只影响执行顺序，**不影响是否执行**。

```yaml
deploy-prod:
  stage: deploy
  needs: ['build-job']          # 只要 build 好了就能跑
  rules:
    - if: '$CI_COMMIT_TAG'                       # 打 tag 才发
      when: on_success
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual                               # 主分支手动点
      allow_failure: false
    - when: never                                # 其余一律不跑
```

`rules` 的三个坑：

1. **匹配到第一条就停**，顺序是从上到下，最后一定要有兜底（`- when: never`），否则默认行为会咬人
2. **`changes` 在合并请求里才靠谱**，push 事件下它比对的是上次提交，可能永远为真
3. **`rules` 里的变量来自 job 之前**，脚本里 `export` 的变量在这里不可见

踩坑：`when: manual` 默认 `allow_failure: true`，会让整个流水线显示"通过"但其实没部署——**生产发布要显式写 `allow_failure: false`**。

---

### Q17. GitLab Runner 有哪几种类型？executor 怎么选？缓存怎么配？【中】

类型先分两类：**shared runner（实例级共享）**、**specific/group runner（项目或组专属）**。安全上，能跑生产发布的 runner 必须绑定到受信项目。

executor 选择：

| executor | 适用 | 隔离性 |
|---|---|---|
| `docker` | 大多数构建任务 | 好，容器级 |
| `kubernetes` | 弹性、按需 | 好，Pod 级 |
| `shell` | 裸机、需要直连硬件 | **差，共用主机** |
| `docker+machine` | 自动扩缩云主机 | 好，但启动慢 |

缓存配置（`config.toml`）：

```text
[runners.cache]
  Type = "s3"
  Path = "gitlab-runner"
  Shared = true
  [runners.cache.s3]
    ServerAddress = "minio.internal:9000"
    BucketName = "gitlab-cache"
    Insecure = false
```

要点：

- **本地缓存依赖具体 runner 机器**，job 落到另一台就 miss，所以共享缓存要走 S3/MinIO
- **`cache: key`** 要含 `$CI_COMMIT_REF_SLUG` 或依赖锁文件的 hash，否则主分支缓存和特性分支互相污染
- **`cache` vs `artifacts`**：cache 是"可能命中"的加速，缺失不影响正确性；artifacts 是"必须存在"的产物

踩坑：把 `target/` 既写进 cache 又写进 artifacts，缓存膨胀到几百 G——**缓存只放依赖下载目录，产物放 artifacts**。

---

### Q18. GitHub Actions 的 workflow 结构是什么？`on`、`jobs`、`steps` 的关系？【初】

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

层级关系：

- `on`：触发条件，一个 workflow 可以有多个事件
- `jobs`：**默认并行**，用 `needs` 串行
- `steps`：job 内串行，**每个 step 共享同一个 runner 工作区**
- `runs-on`：选 runner，`ubuntu-latest` / `self-hosted` / 标签组合

踩坑：`steps` 之间传值要走 `$GITHUB_OUTPUT` 或 `$GITHUB_ENV`，直接 `export` 不跨 step 生效。

---

### Q19. Actions 的 matrix 怎么用？怎么控制爆炸半径和成本？【中】

matrix 是笛卡尔积展开，两个维度各 3 个值就是 9 个 job 并行。

```yaml
strategy:
  fail-fast: false          # 一个挂了不取消其他，想拿全量结果就 false
  max-parallel: 4           # 最多同时 4 个
  matrix:
    os: [ubuntu-latest, windows-latest]
    node: [20, 22]
    exclude:
      - os: windows-latest
        node: 20
    include:
      - os: ubuntu-latest     # 追加一个额外组合
        node: 24
        experimental: true
```

控制成本：

- `fail-fast: true`（默认）能省大量时间——**主流程用 true，兼容性矩阵用 false**
- `max-parallel` 防止打满并发配额（个人/团队有并发上限，超了会排队）
- `exclude` 干掉无意义组合，比事后过滤便宜
- 全量 matrix 放 PR 太贵，**PR 跑缩减矩阵，main/夜间跑全量**

踩坑：`include` 在已有组合上会**覆盖**属性而不是新建 job，想新增组合要带一个矩阵里不存在的维度值。

---

### Q20. cache 和 artifacts 在 Actions 里的区别？各自什么时候用？【中】

| | cache | artifacts |
|---|---|---|
| 目的 | **加速**（下次跑更快） | **传物**（job 之间/事后下载） |
| 命中要求 | 可 miss，逻辑必须照常正确 | 必须存在，缺了下游就失败 |
| 生命周期 | 7 天不访问自动清理，有 10 GB 上限 | 默认 90 天，按仓库配额 |
| 作用域 | 分支/PR 隔离，默认不能跨分支读 | 同一次 workflow run 内共享 |
| 典型内容 | `~/.pnpm-store`、`~/.m2/repository` | 测试报告、构建产物、覆盖率 |

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.m2/repository
    key: m2-${{ hashFiles('**/pom.xml') }}
    restore-keys: m2-
```

**`key` 用锁文件 hash，`restore-keys` 做降级命中**——这是命中率的关键：完全 miss 时靠前缀捞到最近一份旧缓存，仍然能省大部分下载。

踩坑：把 `node_modules` 放进 cache，跨平台/跨架构（x64 vs arm）会拿到错误二进制，`key` 里必须带 `runner.os` 和架构。

---

### Q21. self-hosted runner 有什么安全风险？怎么用才不炸？【高】

核心风险：**self-hosted runner 上跑的是不可信代码**。任何能提 PR 的人在 PR 里写一行 `curl` 就能读走 runner 上的所有东西。

必须做的事：

- **绝不给公开仓库的 `pull_request` 事件用 self-hosted runner**，这是最经典的挖矿/盗密路径（`pull_request_target` + checkout PR 代码同理，极其危险）
- **用 ephemeral runner**：每个 job 一个新容器/新 VM，跑完销毁，杜绝持久化后门
- **最小权限**：runner 机器不挂生产网络、不给云 IAM 角色、不存长生命周期密钥
- **出网收敛**：只允许访问必要的制品库和代码库，否则被拿来当出口节点
- **不给 Docker socket**：需要构建镜像用 kaniko / BuildKit rootless

推荐组合：K8s 上的 Actions Runner Controller（ARC）或 GitLab 的 `kubernetes` executor，配合 per-job service account。

踩坑：为了"复用缓存"把 runner 做成长期存活的共享机器，结果一次被投毒，之后所有 job 的产物都可能被篡改——**持久 runner 必须能快速重建，且构建产物要有签名校验**。

---

## 四、构建工具与依赖管理

### Q22. Maven、Gradle、npm、pnpm、go mod 的缓存机制各是什么？CI 里怎么配？【中】

| 工具 | 缓存目录 | 关键点 |
|---|---|---|
| Maven | `~/.m2/repository` | 只缓存下载物，插件也在这 |
| Gradle | `~/.gradle/caches` + `~/.gradle/wrapper` | **构建缓存**另开 `--build-cache` |
| npm | `~/.npm` | 慢，建议换 pnpm |
| pnpm | `~/.local/share/pnpm/store` | **内容寻址**，一份 store 全仓库共享 |
| go mod | `$GOMODCACHE`（`~/go/pkg/mod`） | 还可缓存 `~/.cache/go-build` |

CI 里的通用写法：

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.m2/repository
      ~/.gradle/caches
    key: deps-${{ runner.os }}-${{ hashFiles('**/pom.xml', '**/*.gradle*') }}
    restore-keys: deps-${{ runner.os }}-
```

**pnpm 的关键是 store 而不是 `node_modules`**：`pnpm install --frozen-lockfile --store-dir` 指向缓存目录，靠硬链接秒装。

踩坑：Maven 的 `SNAPSHOT` 依赖会缓存"没更新"的旧版本，CI 上要加 `-U` 强制刷新，或者干脆禁止 SNAPSHOT 进构建。

---

### Q23. 私有仓库和代理怎么配？为什么必须走代理而不是直连？【中】

直连公网的三个问题：**不稳定（构建随机失败）、不安全（供应链投毒无审计）、不可控（没有缓存，每次全量下载）**。

Maven 走 Nexus 代理：

```text
<!-- ~/.m2/settings.xml -->
<mirrors>
  <mirror>
    <id>nexus</id>
    <mirrorOf>*</mirrorOf>
    <url>https://nexus.internal/repository/maven-public/</url>
  </mirror>
</mirrors>
```

npm 走 registry：

```bash
npm config set registry https://nexus.internal/repository/npm-group/
pnpm config set registry https://nexus.internal/repository/npm-group/
```

要点：

- **`mirrorOf` 用 `*` 或 `external:*`**，只镜像 `central` 会漏掉插件仓库
- 代理仓库要配**上游 + 本地缓存**，命中本地才算真省
- 私有包发布走 hosted 仓库，**组仓库（group）** 聚合 hosted + proxy 供他人拉取
- Go 用 `GOPROXY=https://goproxy.internal,direct`，`GONOSUMDB` 谨慎用

踩坑：`settings.xml` 里的 mirror 密码明文进了 Git——**用 CI 注入的 settings.xml 模板 + 环境变量占位**，别提交真实凭据。

---

### Q24. 锁文件和可复现构建是什么关系？「可复现」到底要做到哪一步？【中】

锁文件把**间接依赖的精确版本 + 完整性哈希**固定下来，让 `A 依赖 B 依赖 C` 的 C 版本不再浮动。

| 工具 | 锁文件 | 必须提交 |
|---|---|---|
| npm | `package-lock.json` | 是 |
| pnpm | `pnpm-lock.yaml` | 是 |
| Maven | 无原生锁文件 | **靠 `dependencyManagement` + 私有仓库不可变** |
| Gradle | `gradle.lockfile`（需开启） | 是 |
| Go | `go.sum` | 是 |

CI 上强制锁文件：

```bash
npm ci                    # 不是 npm install
pnpm install --frozen-lockfile
go mod download -x
```

可复现构建的三层要求，做到第一层就够面试答：

1. **依赖层可复现**：同样的锁文件拉到同样的依赖（有锁文件 + 私有仓库不覆盖同名版本）
2. **环境层可复现**：固定基础镜像 digest、固定 JDK/Node 版本、固定构建工具版本（wrapper）
3. **字节层可复现**：连构建时间戳、文件顺序、路径都固定（`SOURCE_DATE_EPOCH`、可复现 JAR）

踩坑：`npm install` 会**顺手改锁文件**，CI 上跑它就等于放弃了可复现性——用 `npm ci`，它锁文件不匹配直接失败。

---

### Q25. 依赖冲突怎么排查？「类找不到」「方法不存在」这类错误怎么定位？【中】

Maven 系：

```bash
mvn dependency:tree -Dverbose -Dincludes=com.google.guava
mvn dependency:tree -Dincludes=org.slf4j   # 看 slf4j 多版本绑定情况
```

典型症状与病因：

| 症状 | 病因 |
|---|---|
| `NoSuchMethodError` | 运行时是旧版，编译时是新版 |
| `NoClassDefFoundError` | 依赖被 `provided`/`exclusion` 排掉了 |
| `ClassCastException` 同名类 | 两个版本都被打进了包 |
| `SLF4J: Class path contains multiple bindings` | 日志实现重复 |

治理顺序：`dependency:tree` 定位 → 在 `dependencyManagement` 里**统一版本** → 必要时 `exclusions` → 用 Enforcer 插件**设规则防复发**：

```text
<requireUpperBoundDeps/>
<bannedDependencies><excludes><exclude>commons-logging</exclude></excludes></bannedDependencies>
```

npm/pnpm 系：`pnpm why <pkg>`、`npm ls <pkg>`，pnpm 默认严格 node_modules 结构，**幽灵依赖直接不解析**，反而更早暴露问题。

踩坑：只在本地 `mvn dependency:tree` 看是够的，但**运行时 classpath 由打包方式决定**（fat jar 的合并顺序、`BOOT-INF/lib`），要在镜像里 `java -cp` 实测。

---

### Q26. 怎么保证构建产物一致？「本地能跑线上不行」怎么系统性消灭？【中】

一致性四要素，缺一就可能出「玄学」：

1. **同一个基础镜像**：本地用 `docker run` 同一镜像，或者干脆**本地也用容器构建**
2. **同一个工具版本**：用 wrapper（`mvnw` / `gradlew` / `.nvmrc` / `.tool-versions`），不用裸 `mvn`
3. **同一份依赖来源**：本地也指向私有代理，别一半走公网一半走内网
4. **同一组构建参数**：profile、`NODE_ENV`、`JAVA_TOOL_OPTIONS` 写进脚本，不靠人记

落地检测手段：

- 产物里写入 **git sha + 构建时间 + 构建机**（`/build-info.json`），线上追问题第一眼看它
- 对比本地与 CI 产物的 `sha256`，不一致就直接失败
- **本地与 CI 用同一个 Dockerfile 构建**，本地不再有"手动装的 JDK 8"

踩坑：`npm run build` 在 macOS（arm64）产出的原生模块二进制，拿到 Linux x64 镜像里直接崩——**原生依赖必须在目标架构的容器里构建**。

---

### Q27. monorepo 的增量构建怎么做？如何只构建受影响的包？【高】

三件事：**依赖图 + 变更检测 + 远程缓存**。

```bash
# pnpm workspace，只跑受影响包的测试
pnpm --filter "...[origin/main]" test

# Turborepo，靠任务图的 hash 做缓存
turbo run build test --filter='...[origin/main]'
```

关键机制：

- **包依赖图**（workspace 的 `dependencies`）决定"改了 A 要不要重建 B"
- **任务 hash**：输入（源码、依赖版本、环境变量、命令）算 hash，命中远程缓存直接下载产物
- **远程缓存**放对象存储，CI 与本地共享，命中率高的时候整体时长掉一个数量级

工具选型：pnpm workspaces / Turborepo / Nx / Bazel（最重但最强），Java 侧有 Gradle 的 `configuration cache` + build scan。

踩坑：

1. **变更检测的基线选错**：`origin/main` 没 fetch 就是空，要用 `git fetch --depth=1 origin main` 或 CI 提供的 base sha
2. **hash 里漏了环境变量**，改了配置但缓存命中，产出旧产物——这类 bug 极难发现，**缓存一定要有"清空"开关**

---

### Q28. 构建工具该不该升级？大版本升级怎么做才不炸？【高】

先说结论：**跟住小版本，跨大版本要有专门的项目窗口，不要夹在业务需求里做。**

升级前的三项评估：

- **兼容性矩阵**：JDK 版本、插件版本、CI 镜像里的系统依赖（如 glibc）
- **依赖是否跟得上**：Spring Boot 3 要 JDK 17+，很多老依赖永远不升级——先扫一遍
- **构建时长变化**：Gradle 大版本经常带来编译缓存行为变化

灰度做法：

1. 分支上先跑通 `./gradlew --version` + 全量测试
2. 用**矩阵构建**让旧版和新版并行跑一段时间，对比结果
3. 切默认版本，保留回退路径（wrapper 的版本就是开关）

踩坑：`mvn` 升级后 `-DskipTests` 行为、`npm` 7→8 的 peer 依赖解析、Gradle 7→8 的 `buildDir` 弃用，都是升级时集中爆发的点——**升级 PR 要单独开，不要和功能混在一起，否则出问题不知道是谁的锅**。

---

## 五、容器镜像构建与优化

### Q29. Dockerfile 的分层和缓存是怎么工作的？怎么让缓存命中率高？【初】

每条 `RUN` / `COPY` / `ADD` 产生一层，Docker 用**指令文本 + 父层 ID** 算 cache key。**任何一层失效，后面全部重建。**

命中率的核心原则：**变化频率从低到高排列**。

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./     # 依赖描述先来
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .                                # 源码最后来
RUN pnpm build
CMD ["node", "dist/main.js"]
```

常见反例：

- `COPY . .` 写在 `install` 前面 → 改一行代码就重装依赖
- `RUN apt-get update && apt-get install -y ...` 拆成两条 → 缓存过期导致装到旧索引
- 没写 `.dockerignore` → 把 `node_modules`、`.git` 拷进去，缓存和体积双爆

**`apt` 类安装必须 update 和 install 在同一层**，否则 `update` 的层被缓存，`install` 拿旧索引 404。

---

### Q30. 多阶段构建解决什么问题？「builder 阶段」怎么设计？【中】

解决的问题：**编译工具链不该进运行镜像**。一个 Maven 构建镜像动辄 800 MB，运行只要 200 MB 的 JRE。

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /src
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:21-jre-alpine
RUN adduser -D -u 10001 app
USER 10001
COPY --from=builder /src/target/app.jar /app/app.jar
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

设计要点：

- **`dependency:go-offline` 单独一层**，把"下载依赖"和"编译源码"拆开，源码改动不重下
- **只 `COPY --from` 最终产物**，别把 `/root/.m2` 带过去
- **多架构构建**用 `--platform=$BUILDPLATFORM` 让 builder 跑在本机架构，只有运行阶段跨架构，速度差好几倍

踩坑：`COPY --from=builder` 时带上了 `target/` 整个目录，把测试报告、源码包一起塞进运行镜像——**用 `--chown` + 精确路径**。

---

### Q31. 基础镜像怎么选？alpine、slim、distroless、scratch 各适合什么？【中】

| 镜像 | 体积 | 优势 | 坑 |
|---|---|---|---|
| `ubuntu`/`debian` | 70–120 MB | 工具全、兼容好 | 大，CVE 多 |
| `-slim` | 30–80 MB | Debian 系，去掉文档/编译器 | 无 `curl`、无 shell 工具 |
| `alpine` | 5–15 MB | 极小，musl libc | **glibc 二进制跑不了**，`pip`/`npm` 原生模块要重新编译 |
| `distroless` | 20–50 MB | 无 shell、无包管理器，攻击面最小 | 调试难，得用 `kubectl debug` 旁挂 |
| `scratch` | 0 | 只有你自己的二进制 | 静态编译才行，无 CA 证书需手动拷 |

选择建议：

- **Go/Rust 静态二进制** → `scratch` 或 `distroless/static`
- **Java** → `eclipse-temurin:21-jre-alpine` 或 `distroless/java21`
- **Python/Node 带原生依赖** → `-slim`（alpine 的 musl 会让你重编译一堆东西）

踩坑：alpine 上 `pip install cryptography` 要装 rust 和 gcc 编译，构建时间翻倍——**换 `python:3.12-slim`，别硬扛**。

---

### Q32. 镜像怎么瘦身？有哪些立竿见影的手段？【中】

按收益排序：

1. **多阶段构建**：直接砍掉工具链，通常减 60% 以上
2. **换基础镜像**：`ubuntu` → `-slim` / `alpine` / `distroless`
3. **一个 `RUN` 里装完就清**：

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
```

4. **`.dockerignore` 排除** `.git`、`node_modules`、`test`、`docs`
5. **不装 `recommends`**、不装 build-essential 到运行镜像
6. **用 `dive` 看层级**，找出最大的浪费层

```bash
dive app:1.0.0        # 交互式看每层大小与浪费
docker history --no-trunc app:1.0.0
```

注意：`rm` 放在**另一个 RUN** 里没用，文件在上一层仍然存在，压缩传输时仍占体积——**必须在同一层删**。

踩坑：为了瘦身把 `ca-certificates` 删了，容器里 HTTPS 全挂；为了瘦身删掉 `tzdata`，时间显示 UTC 被当成 bug。

---

### Q33. 容器为什么不能以 root 运行？非 root 化具体怎么做？【中】

原因：**容器内的 root 和宿主 root 是同一个 uid 0**（未开 user namespace 时）。容器逃逸、卷挂载权限、误删宿主文件，都是 root 权限放大。

三步落地：

```dockerfile
FROM node:22-alpine
RUN addgroup -g 10001 app && adduser -D -u 10001 -G app app
WORKDIR /app
COPY --chown=10001:10001 . .
USER 10001:10001
EXPOSE 8080
CMD ["node", "dist/main.js"]
```

配合项：

- **`EXPOSE` 别用 80/1024 以下端口**，非 root 绑不了特权端口
- **K8s 里加 `securityContext`**：`runAsNonRoot: true`、`runAsUser: 10001`、`allowPrivilegeEscalation: false`、`readOnlyRootFilesystem: true`
- **需要写文件的目录**先 `chown` 并挂 `emptyDir`，否则只读根文件系统下应用起不来
- **不用 `--privileged`、不挂 `docker.sock`**，需要构建就用 kaniko/BuildKit rootless

踩坑：只加 `USER` 但没 `--chown`，应用读不到自己的文件，报 `EACCES`——**`COPY` 的属主是 root**。

---

### Q34. 怎么加速镜像构建？BuildKit、kaniko、缓存分别解决什么？【高】

按层次拆：

| 手段 | 解决什么 | 代价 |
|---|---|---|
| BuildKit（`DOCKER_BUILDKIT=1`） | 并行构建、更好的缓存、`--mount=type=cache` | 默认已开，基本无脑用 |
| 远程缓存（`--cache-from type=registry`） | CI 无状态机器之间的缓存复用 | 需要推拉缓存镜像 |
| kaniko | **无需 Docker daemon**，K8s 里安全构建 | 慢一些，缓存要靠 `--cache-repo` |
| BuildKit rootless + `buildx` | 多架构（amd64 + arm64） | QEMU 模拟慢，需原生节点 |
| 依赖预拉 | 基础镜像、依赖包放内网 registry | 维护成本 |

`--mount=type=cache` 是性价比最高的一招：

```dockerfile
RUN --mount=type=cache,target=/root/.m2 \
    --mount=type=cache,target=/root/.gradle \
    mvn -B package -DskipTests
```

它把 Maven 仓库做成**可复用的缓存挂载**，不进最终镜像层，CI 上第二次构建能省 80% 时间。

踩坑：

- `--cache-from` 的镜像必须**先 `docker pull`** 到本地，否则 buildx 找不到
- 多架构用 `buildx` 时忘了 `--push`，只在本地缓存里，CI 下一台机器依旧全量构建
- 远程缓存需要 registry 支持 `--cache-from type=registry` 的 manifest 格式

---

### Q35. 为什么不能在生产用 `latest` tag？镜像该用什么标识来引用？【中】

`latest` 的三个致命问题：

1. **不可复现**：同一份 yaml 今天拉到的和明天拉到的不是同一个镜像，出问题无法回滚到"昨天那个"
2. **不触发更新**：K8s 的 `imagePullPolicy` 在 tag 不是 `latest` 时默认 `IfNotPresent`，用 `latest` 会变成 `Always`，也可能被缓存住不动
3. **回滚失效**：`kubectl rollout undo` 回到的还是 `latest`，等于没回滚

正确姿势：

- **部署用 digest**：`registry.example.com/app@sha256:abc...`，绝对不可变
- **tag 用 git sha 或版本号**：`app:1.4.2`、`app:20261028-a1b2c3d`
- **`latest` 只作为"最新构建"的便利指针**，不参与部署，且发布时同步更新

```yaml
# 部署清单里两个都写，tag 给人看，digest 给机器用
image: registry.example.com/app:1.4.2@sha256:abc123...
```

踩坑：很多人以为私有仓库的 tag 不会被覆盖——**同一个 tag 推两次就能覆盖**，除非开启 immutable tag 策略（Harbor 有）。

---

## 六、制品仓库与版本管理

### Q36. Nexus、Harbor、Artifactory 分别管什么？怎么选？【初】

| 产品 | 主要管 | 特点 |
|---|---|---|
| **Nexus** | Maven/npm/pip/go/docker 等多格式 | 轻量、免费版够用、Java 生态最常见 |
| **Harbor** | **只做容器镜像** | 镜像签名、扫描、复制、保留策略强，K8s 场景标配 |
| **Artifactory** | 全格式 + 强元数据 | 功能最全，企业级，商业授权贵 |

典型组合：**Harbor 管镜像 + Nexus 管语言包**，两者都做代理（proxy）缓存公网源。

选型判断：

- 只发容器 → Harbor 一个就够，别为统一而引入更重的
- 多语言 + 已有 Java 团队 → Nexus
- 需要"制品血缘 / 构建信息 / 多站点复制 / 合规审计" → Artifactory

踩坑：Harbor 的「项目」是权限和配额的单位，规划时按**团队或业务域**分项目，别所有镜像塞一个 `library`，否则保留策略和权限都没法分。

---

### Q37. 语义化版本（SemVer）怎么用在服务端和内部库上？【中】

`MAJOR.MINOR.PATCH`：不兼容 / 加功能 / 修 bug。

服务端应用（对外是 HTTP 接口）和内部库的用法不同：

- **内部库**：严格 SemVer，`^` 允许 MINOR，`~` 只允许 PATCH，**MAJOR 必须人工介入**
- **服务端应用**：版本号更多是**标识**而非兼容性承诺，用 `1.4.2` 表示第 4 次功能发布第 2 次修复；真正的兼容性靠 API 版本（`/v2/`）和灰度
- **`0.x.y`**：表示不稳定，任何版本都可能破坏兼容，生产别依赖 `0.x` 的传递性

工程落地：

- 版本号由 **CI 从 git tag 推导**，不手填（`git describe --tags`）
- `SNAPSHOT` / `-dev` 后缀只用于未发布构建，**永远不进生产**
- 预发布用 `1.5.0-rc.1`，`rc` 语义化排序上小于正式版

踩坑：`1.10.0` 和 `1.9.0` 用字符串比较会得出错误结论，**版本比较必须用 semver 库**，脚本里 `sort -V`。

---

### Q38. 制品和代码怎么对应起来？线上一个镜像怎么反查到源码？【中】

答案：**构建时把溯源信息写进制品本身**，而不是事后去猜。

三层做法：

1. **镜像里放 `/build-info.json`**：git sha、分支、构建号、构建时间、CI 链接、构建人。线上 `kubectl exec` 一条命令就能看
2. **镜像 label / OCI annotation**：`org.opencontainers.image.revision`、`.source`、`.created`
3. **附上 SBOM 与 provenance**：`cosign attest` 或 buildx 的 `--provenance=true`，能反查"这个镜像由哪次构建、哪些输入产出"

```bash
docker inspect app:1.4.2 --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
cosign verify-attestation --type slsaprovenance registry/app:1.4.2
```

再反向查：从 pod 拿 `imageID`（digest）→ 查 registry 的 tag 列表 → 找到 git sha → 回到仓库。

踩坑：靠 tag 反查是不够的，**tag 可能被覆盖或复用**，必须用 **digest** 做唯一键，并保证 registry 开了 immutable tag。

---

### Q39. 制品仓库的保留策略怎么定？无脑保留全量有什么后果？【中】

后果：存储成本线性涨、拉取变慢（部分 registry 的 tag 列表会超时）、**合规扫描结果被历史噪音淹没**。

策略设计维度：

| 维度 | 规则示例 |
|---|---|
| 生产在用 | **永不删除**（打 `prod` 标记或保留 digest 清单） |
| 最近 N 个版本 | 每仓库保留最近 20 个 tag |
| 时间 | 90 天未拉取则清理 |
| 分支构建 | `feature-*` 保留 7 天 |
| PR 构建 | 保留 3 天，MR 合并即清 |
| 有 CVE 的旧版 | 到期即清，不因"可能还要回滚"留着 |

Harbor 的 tag retention 可以按 `n days since last pull` + tag 正则组合：

```text
规则1: tags matching 'prod-*'  -> keep forever
规则2: tags matching 'pr-*'    -> keep 3 days
规则3: retain the most recently pushed 20 artifacts
```

**必须有的保护**：保留策略前先"干跑"（dry run）确认命中范围，再开定时任务。删错生产镜像的恢复成本极高。

踩坑：只按时间清理，把半年没动但**当前线上正在跑**的镜像删了——K8s 节点上一旦驱逐重建，拉不到镜像直接 CrashLoop。**清理前先比对集群实际在用的 digest 清单**。

---

### Q40. 镜像签名和校验怎么做？为什么需要它？【高】

需要它的场景：**供应链攻击**——镜像在构建、推送、存储、拉取任一环节被替换，你无法靠 tag 或 digest 的名字发现。

主流方案 `cosign`（sigstore）：

```bash
cosign sign --key cosign.key registry.example.com/app@sha256:abc123
cosign verify --key cosign.pub registry.example.com/app@sha256:abc123
```

三种密钥模式：

- **keyless**：基于 OIDC 身份（GitHub/GitLab 的 workload identity），签名绑定"谁在哪个流水线签的"，无长期密钥，**推荐**
- **key pair**：简单，但私钥管理是负担
- **KMS 托管**：企业合规场景

校验要落到**准入层**，不是靠人：

- K8s 用 **Kyverno / OPA Gatekeeper** 校验 `verifyImages`，未签名直接拒绝调度
- Harbor 可以配「只允许签名的镜像被拉取」
- 同时校验 **SBOM 存在** 和 **无高危 CVE**，三件套一起卡

踩坑：只签名不校验等于没做——**签名是给别人验证用的**，没有 admission 拦截的签名只是仪式感。另外 `cosign` 的 keyless 依赖 Fulcio/Rekor 的可用性，内网要提前规划离线/私有化方案。

---

### Q41. 镜像 tag 命名规范怎么定？举一套可落地的方案。【中】

目标：**人看得懂 + 机器能排序 + 能反查源码**。

推荐三类 tag 并存：

```text
app:1.4.2                          # 语义化版本，用于正式发布
app:1.4.2-a1b2c3d                  # 版本 + git 短 sha，强溯源
app:sha-a1b2c3d                    # 每次构建都推，供内部联调
app:pr-1289                        # PR 预览环境用，合并即删
```

规则清单：

- **只允许 `[a-z0-9._-]`**，全小写（部分 registry 大写会报错）
- **不用 `latest` 部署**，只作为"主分支最新"的便利指针
- **`prod-*` 前缀给生产**，配合保留策略做「永不删」
- **不要用分支名裸 tag**（`feature/login` 里的 `/` 在某些 registry 里当路径分隔符，会报错）
- **tag 里带日期**时用 `20261028` 而不是 `2026-10-28`，避免分隔符问题

踩坑：多个流水线同时推同一个 tag（比如都用 `sha-<commit>` 但在不同架构），后推的覆盖前者，导致 `manifest` 只剩单架构——**多架构要推 manifest list，而不是逐个覆盖 tag**。

---

## 七、Git 工作流与分支策略

### Q42. Git Flow、Trunk Based、GitHub Flow 分别适合什么团队？【初】

| 模型 | 结构 | 适合 | 代价 |
|---|---|---|---|
| **Git Flow** | `main` + `develop` + `feature/*` + `release/*` + `hotfix/*` | 有明确版本发布周期、需要同时维护多个版本（如客户端、私有化部署） | **分支多、合并痛苦、`develop` 与 `main` 长期分叉** |
| **GitHub Flow** | `main` + 短分支 + PR | 小型团队、持续部署 | 对测试覆盖要求高，主干必须随时可发 |
| **Trunk Based** | 几乎只有 `main`，短命分支（< 1 天）或直接提交 | 高成熟度、强 CI、需要高频发布 | 依赖 **feature flag** 和强自动化 |

判断依据：

- **发布节奏**：一天多次 → Trunk Based；一个月一次 → Git Flow 也能忍
- **版本维护**：同时维护 3 个客户版本 → 必须有多条 release 分支（Git Flow 或 release branch 变体）
- **自动化成熟度**：没有可靠 CI 就上 Trunk Based，等于把风险摊到主干

踩坑：抄了 Git Flow 但团队一周发一次、没有多版本维护需求，结果 `develop` 变成第二个主干，所有人天天解冲突——**分支模型要匹配发布模型，不是匹配别人的博客**。

---

### Q43. 分支保护规则该配哪些？为什么「保护 main」不等于安全？【中】

必配项：

- **禁止直接 push**，只能通过 PR/MR
- **要求至少 1 个 review 通过**（关键仓库 2 个，且不能是本人）
- **要求 CI 全绿才能合并**（status check 必须包含门禁 job）
- **要求分支是最新的**（`Require branches to be up to date`），否则测的是旧代码
- **禁止 force push**、**禁止删除分支**
- **CODEOWNERS** 指定关键路径（`/deploy/`、`/.github/`、`/Dockerfile`）必须由 owner 审
- **签名提交**（`Require signed commits`）防伪造作者

为什么保护 `main` 不够：

1. **保护规则可以被有 admin 权限的人绕过**——要审计 bypass 记录
2. **规则可能对"从 fork 来的 PR"不生效**，或者对 bot 账号豁免过宽
3. **保护了 `main` 但没保护 `release/*`**，热修通道成为后门
4. **CI 的 check 可以被伪造**（自己建的 check name 相同），要用提交状态而非自定义状态

踩坑：开了 `Require approvals` 但**允许"最后推送者自己批准"**，等于自审自过；GitLab 里对应 `Prevent approval by author`。

---

### Q44. `rebase` 和 `merge` 怎么选？团队里怎么统一？【中】

区别一句话：**merge 保留真实历史（有分叉），rebase 重写历史（线性）**。

| 场景 | 选择 | 理由 |
|---|---|---|
| 个人特性分支同步主干 | `git rebase main` | 保持线性，PR diff 干净 |
| 特性分支合并进主干 | `merge --no-ff` 或 squash | 保留"一个功能一个提交" |
| 已推送的共享分支 | **绝不 rebase** | 会改写他人历史，引发大面积冲突 |
| 清理本地零碎提交 | `rebase -i` | 合并成有意义的提交 |

统一政策建议：

- **主干只接受 squash merge 或 `--no-ff`**，禁止 fast-forward（丢掉 PR 边界）
- **PR 分支上允许 rebase，但必须在 review 前完成**，review 中改历史会让 reviewer 丢失评论定位
- **`git pull --rebase` 设为默认**（`pull.rebase = true`），避免无意义的 merge commit

踩坑：`rebase` 后没跑测试就 force push，等于把未验证的代码推上共享分支；**`--force-with-lease` 而不是 `--force`**，能避免覆盖别人的新提交。

---

### Q45. tag 和 release 怎么管理？release notes 从哪来？【中】

- **tag**：git 层的不可变指针，`git tag -a v1.4.2 -m "..."`，**必须 annotated 且签名**（`-s`）
- **release**：GitHub/GitLab 的发布记录，绑定 tag + 变更说明 + 制品附件

自动化链路：

```bash
# 从 conventional commits 生成 changelog 与版本号
npx standard-version --release-as minor
git push --follow-tags
gh release create v1.5.0 --generate-notes dist/*.tar.gz
```

要点：

- **提交信息规范是前提**：`feat:` / `fix:` / `BREAKING CHANGE:`，否则生成不出有意义的 notes
- **tag 一旦发布不可移动**，打错了要发新版本并注明 `yanked`
- **release notes 分「用户可见变更」和「内部变更」**，把 200 条依赖升级刷屏对用户没价值
- **制品附件放校验和**（`sha256sum`），下载方能验证

踩坑：用轻量 tag（`git tag v1.0`）会丢失签名和作者信息；删了 tag 再重打，别人的本地 tag 不会自动更新，导致"我这里是 v1.0，你那里也是 v1.0，内容不同"。

---

### Q46. 大仓库性能怎么优化？`git clone` 很慢怎么办？【中】

先分清是**历史太大**还是**文件太大**：

- 历史大（提交多、二进制多）→ 浅克隆 / 部分克隆
- 文件大（模型、数据集）→ Git LFS

手段：

```bash
git clone --depth=1 --single-branch <url>     # CI 常用，只要最新
git clone --filter=blob:none <url>            # 部分克隆，按需取 blob
git config --global core.fsmonitor true       # Windows/macOS 大仓 status 提速
git maintenance start                         # 后台 gc/commit-graph
```

CI 侧：

- **`fetch-depth: 1`**（Actions）/ `GIT_DEPTH: 1`（GitLab），除非需要 diff 或 tag
- **需要 diff 时用 `--depth=50` + `--deepen`**，别一把梭全量
- **缓存 `.git` 目录**（谨慎：可能拖慢且易冲突），更好的做法是自建 mirror 让 fetch 走内网

踩坑：

- `--filter=blob:none` 在旧版 Git（< 2.19）不可用，agent 镜像要跟上
- 开了 LFS 但 CI 没装 `git-lfs`，拉下来是 130 字节的指针文件，构建报"文件损坏"
- **DNS/出网慢才是真凶**，别急着改 Git 参数，先自建镜像

---

### Q47. 线上出问题要热修，cherry-pick 怎么用才不出事？【高】

热修的核心矛盾：**线上跑的是旧版本，主干已经有新代码**，不能直接发主干。

标准流程：

```bash
git checkout -b hotfix/order-npe v1.4.2     # 从线上版本拉
# 修问题，提交，跑测试
git tag -a v1.4.2.1 -m "hotfix: NPE when order empty"
git push --follow-tags
# 同时把修复带回主干，否则下个版本会复发
git checkout main && git cherry-pick <fix-sha>
```

三条纪律：

1. **必须回灌主干**：只热修主干不带上，下个版本发布时 bug 复活——这是最常见的运维事故
2. **热修范围最小化**：只改引起故障的那几行，不做"顺手优化"，减少引入新风险的面积
3. **cherry-pick 后重新跑全量测试**，不能因为"主干测过了"就跳过

`cherry-pick` 的坑：

- **冲突解决容易丢改动**，解决完要看 `git diff <原提交> HEAD` 确认逻辑一致
- **`-x` 参数会记录来源 commit**（`(cherry picked from commit ...)`），回头追溯很有用
- 连续 cherry-pick 一串提交时，用 `git cherry-pick A..B` 比逐个挑安全

踩坑：从 `main` 拉 hotfix 分支而不是从 tag 拉，导致热修版本里混进了一堆未发布的功能——**热修分支的基线必须是"线上正在跑的那个提交"**。

---

## 八、测试自动化与质量门禁

### Q48. 单元、集成、端到端测试怎么分层？各自的耗时和比例怎么定？【初】

按「金字塔」分，但真实项目更接近「冰淇淋 + 金字塔混合」：

| 层 | 测什么 | 单次耗时 | 比例建议 |
|---|---|---|---|
| 单元 | 纯逻辑、函数、类 | 毫秒 | **最多**，占 70% |
| 集成 | 与 DB/缓存/MQ/HTTP 的真实交互 | 秒 | 20% |
| 端到端 | 用户视角的完整链路 | 十秒~分钟 | **最少**，占 10% |

分层目的不是形式，是**故障定位成本**：

- 单测挂了，直接定位到函数
- 集成挂了，怀疑边界（序列化、事务、超时）
- E2E 挂了，只能看截图和日志猜

落地建议：

- **单测不碰网络、不碰 DB**，用 mock/fake，保证能在毫秒级跑几千个
- **集成测试用 Testcontainers** 起真实依赖，比 H2/mock 更可信
- **E2E 只留「关键用户旅程」十几条**，全量 E2E 是维护地狱

踩坑：为了"覆盖率高"把单测写成调用真实 DB，几千个用例跑 40 分钟——**层级混淆会让整个流水线变慢且不稳定**。

---

### Q49. 测试环境怎么隔离？测试数据怎么准备才不打架？【中】

环境隔离三个层次：

1. **物理/命名空间隔离**：每个 PR 一个临时 namespace（K8s）或一套 docker-compose
2. **数据隔离**：每个测试用自己的 schema/database（`test_${CI_JOB_ID}`）
3. **依赖隔离**：MQ 的 topic 前缀带随机后缀，避免不同 job 抢消息

数据准备三种模式：

| 模式 | 做法 | 适用 |
|---|---|---|
| 每次重建 | 测试前 `migrate` + 灌 fixture | 集成测试，干净但慢 |
| 事务回滚 | 每个用例包在事务里，结束 rollback | 单库单测，最快 |
| 快照恢复 | 预置好的 DB 快照，秒级恢复 | 大数据量场景 |

```bash
# Testcontainers + 每次干净库
docker run -d --name pg-test -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16
```

踩坑：

- **共用一套测试库**，A 的测试删表导致 B 的测试挂——这叫 flaky，不是被测代码的问题
- **依赖执行顺序的测试**（test1 造数据、test2 用）在并行下必挂
- 时间相关的测试要用**可注入的时钟**，别用 `sleep` 等

---

### Q50. flaky 测试怎么治理？「重跑三次就过」有什么问题？【中】

flaky = **同一个提交，跑多次结果不同**。它是 CI 可信度的最大杀手。

先定位根因，别急着加重试：

| 根因 | 典型表现 | 修法 |
|---|---|---|
| 时间/时区 | 凌晨跑必挂、跨月挂 | 注入 Clock，不用 `LocalDateTime.now()` |
| 并发/竞态 | 单独跑过、并行挂 | 加锁或用独立数据，别用共享静态变量 |
| 外部依赖 | 调第三方接口偶发超时 | 打桩/Mock，或加重试+超时 |
| 端口/资源冲突 | `Address already in use` | 随机端口（`--server.port=0`） |
| 顺序依赖 | 单独跑过、全量挂 | 每个用例自备数据，`@DirtiesContext` |
| 浮点/随机 | 概率性失败 | 固定 seed、用容差比较 |

「重跑三次就过」的问题：

- **掩盖真 bug**：偶发失败的代码在线上就是偶发故障
- **拖慢流水线**：一次失败重跑 10 分钟，反馈时间翻倍
- **降低可信度**：所有人都学会「红了再点一次」，真问题被忽略

正确处理：**自动重试只作为止血（同时开 issue 追踪），flaky 用例要进「隔离清单」并限时修复**，超期不修则删除或标记 skip 并计入技术债看板。

踩坑：加了 `retry: 2` 但没记录重试次数，半年后没人知道到底有多少 flaky 用例——**必须把重试事件上报到监控**。

---

### Q51. 覆盖率门禁靠谱吗？该卡什么指标、卡多少？【中】

一句话：**覆盖率是"下限保护"，不是"质量证明"**。100% 覆盖的代码照样可以全是 bug（没断言）。

该用和不该用的方式：

- ✅ **卡"新增代码覆盖率"**（diff coverage ≥ 80%），避免整体数字被历史代码稀释
- ✅ **卡"不能下降"**（比上次低就失败），防止新代码无测试
- ❌ **卡整体行覆盖率 90%**，结果是写一堆 `assertNotNull` 的空测试刷数字
- ❌ 把覆盖率当 KPI，必然催生垃圾测试

更有意义的替代或补充指标：

- **变异测试**（mutation testing，PITest/Stryker）：故意改代码看测试能不能发现，**真正测「测试有没有用」**
- **分支覆盖率** 优先于行覆盖率
- **关键模块单独要求**（支付、权限）比全局要求合理

```text
# 门禁示例：diff coverage 80%
mvn org.jacoco:jacoco-maven-plugin:check -Djacoco.haltOnFailure=true
```

踩坑：`lombok` 生成的代码、DTO、`main` 方法算进分母，覆盖率永远上不去——**配置 `excludes` 排除生成代码再统计**，否则门禁会被迫放宽到没意义。

---

### Q52. 冒烟测试和回归测试怎么在流水线里安排？【中】

- **冒烟（smoke）**：部署后跑十几条核心链路，几分钟内判断"这次部署能不能活"，**失败就自动回滚**
- **回归（regression）**：完整验证，耗时几十分钟到几小时，可异步跑

流水线位置：

```text
build → deploy(staging) → smoke(2min) → 批准 → deploy(prod) → smoke(prod) → 异步回归
```

冒烟用例的挑选原则：

- **只挑"用户最先感知"的路径**：登录、下单、支付、核心查询
- **只读或可回滚的写操作**，别在冒烟里真扣款
- **必须快**：超过 5 分钟就失去"快速判定"的意义
- **要有明确断言**：HTTP 200 不算通过，要验证关键字段

生产冒烟的特殊做法：

- 用**专用的 smoketest 账号 + 打标数据**，测完清理
- 用**只读接口 + 健康检查聚合端点**（`/health/ready` 里带上依赖连通性）
- 结果要**通知到发布 channel**，失败时人能 30 秒内决定回滚

踩坑：把冒烟写成完整回归，一次 40 分钟，结果没人等它，红灯被无视——**冒烟的价值在于快，不在全**。

---

### Q53. 并行测试怎么做？分片的坑有哪些？【中】

三种分片方式：

| 方式 | 做法 | 均衡性 |
|---|---|---|
| 按文件/类 | `--shard=1/4`、按文件名 hash | 一般，大文件拖尾 |
| 按历史耗时 | 记录每个测试的耗时，做 LPT 装箱 | **最好** |
| 按动态队列 | 先跑完的先领下一个（`pytest-xdist --dist loadfile`） | 好，需要协调机制 |

```bash
# Jest 官方分片
jest --shard=1/4
# pytest 并行
pytest -n auto --dist worksteal
```

关键坑：

1. **拖尾效应**：按文件均分时，某个文件占了 50% 时间，其他 3 片早跑完在等——要用耗时数据重排
2. **共享资源冲突**：并行跑同一套 DB/端口/账号，互相踩
3. **合并报告**：每个分片产出部分报告，需要 `merge` 步骤汇总（JUnit XML、覆盖率合并）
4. **失败聚合**：`fail-fast` 在 shard 模式下要显式处理，否则一个分片挂了其他还在跑

踩坑：覆盖率在分片下**不能简单相加**，需要各分片产出 `.exec` / `lcov` 后再 `merge`，否则数字虚高。

---

### Q54. 怎么设计一套「可信」的测试门禁体系？【高】

可信 = **红灯一定是真问题，绿灯一定代表能发**。

四条设计原则：

1. **门禁结果可复现**：本地跑 `make test` 和 CI 结果一致（同容器、同版本、同数据）
2. **门禁失败有明确 owner 与修复指引**：报错里带"点这里看怎么修"
3. **门禁要能被度量**：统计"红灯中真问题的比例"，低于 80% 说明门禁噪音太大，要清理
4. **门禁要能被撤销**：某个例外要有到期时间，不是永久豁免

分层门禁建议：

| 阶段 | 门禁 | 时间预算 |
|---|---|---|
| pre-commit | 格式化、lint、类型 | < 10s |
| PR | 单测、diff 覆盖率、增量 SAST | < 10min |
| 合并后 | 集成、全量扫描、镜像构建 | < 30min |
| 发布前 | E2E 冒烟、制品签名校验、审批 | 视情况 |

反向指标（比通过率更值得看）：

- **门禁拦截后又被 bypass 的次数与原因**
- **红灯修复的平均时长**
- **重跑才过的比例**（flaky 率）

踩坑：门禁越加越多，最后 PR 要等 45 分钟——**给总时长设预算，超了就砍门禁或并行化，而不是让它无限膨胀**。

---

## 九、静态扫描与依赖安全

### Q55. SAST、DAST、SCA 分别是什么？各能发现什么问题？【初】

| 类型 | 扫描对象 | 时机 | 能发现 | 发现不了 |
|---|---|---|---|---|
| **SAST** | 源码/字节码 | 编码、PR | SQL 注入、硬编码密码、反序列化 | 运行时配置、依赖漏洞 |
| **DAST** | 运行中的服务 | 测试环境、发版前 | 越权、XSS、敏感信息暴露、配置错误 | 源码级缺陷、深层业务逻辑 |
| **SCA** | 依赖清单/锁文件 | 构建、持续 | 三方库 CVE、许可证风险 | 自己写的代码 |

一句话记忆：**SAST 看自己写的，SCA 看别人写的，DAST 看跑起来的样子**。

三者不重叠也不可替代：

- 只做 SAST，会漏掉"Spring Boot Actuator 暴露在公网"这类配置问题
- 只做 SCA，自己代码里的硬编码密钥完全看不见
- 只做 DAST，扫描覆盖率受限于爬虫能覆盖的接口

踩坑：很多人把 `trivy fs` 当 SAST 用——它扫的是依赖和配置，不会分析你的业务逻辑漏洞。**分类清楚才不会在报告里找错东西**。

---

### Q56. SonarQube 的质量门禁怎么配才合理？【中】

Sonar 的门禁（Quality Gate）是**一组条件全部满足才通过**，配错了要么形同虚设，要么永远红。

推荐配法（Clean as You Code 思路）：

| 指标 | 阈值 | 说明 |
|---|---|---|
| New code: Coverage | ≥ 80% | 只卡新增代码，历史债不阻塞 |
| New code: Duplicated lines | ≤ 3% | 新增重复率 |
| New code: Maintainability rating | A | 新增代码不能引入新异味 |
| New code: Security hotspots reviewed | 100% | 安全热点必须有人看过 |
| New code: Reliability rating | A | 新增 bug 数为 0 |

为什么不用整体指标：**整体覆盖率和历史技术债会把门禁永久钉死在红**，团队最后学会无视它。

接入流水线：

```bash
mvn -B verify sonar:sonar \
  -Dsonar.projectKey=app \
  -Dsonar.qualitygate.wait=true
```

`qualitygate.wait=true` 让 Jenkins/GitLab 真正等门禁结果，否则构建会先绿后红。

踩坑：`sonar.qualitygate.wait` 超时默认较短，大项目要调 `-Dsonar.qualitygate.timeout=300`，否则门禁还没算完就报失败。

---

### Q57. Trivy / Grype 这类镜像扫描怎么用？为什么扫出来一堆 CVE？【中】

基本用法：

```bash
trivy image --severity HIGH,CRITICAL --exit-code 1 app:1.4.2
trivy image --ignore-unfixed --format sarif -o trivy.sarif app:1.4.2
grype app:1.4.2 -o table --fail-on high
```

扫出一堆 CVE 的原因，按占比排序：

1. **基础镜像自带的系统包**（OpenSSL、glibc、zlib），占绝大多数——**升级基础镜像就消掉一大半**
2. **语言包的管理工具链**（npm 自身的依赖、pip 的 setuptools），运行时根本不用
3. **`--ignore-unfixed` 没开**，扫出一堆上游还没修、你也修不了的
4. **误报**：CVE 匹配的是包名+版本范围，实际代码路径不可达

治理手段：

- **换更小的基础镜像**（distroless/slim），攻击面直接变小
- **多阶段构建把构建工具留在 builder**，不扫它们
- **`.trivyignore` 只用于有依据的误报**，每条要写原因和复审日期
- **区分「有修复版本的」和「无修复版本的」**，前者必须修，后者记录风险

踩坑：`--exit-code 1` 配 `--severity HIGH,CRITICAL`，结果基础镜像里一个 CRITICAL 让所有构建永久红，团队直接把扫描从流水线删了——**先 `--ignore-unfixed` 跑通，再逐步收紧**。

---

### Q58. SCA 误报怎么治理？怎么让扫描结果真的被修？【中】

误报的三个来源：

1. **不可达代码路径**：依赖了但那个有洞的函数从没被调用
2. **版本区间误判**：CVE 说的是 `>=1.2.0,<1.2.5`，实际用的是 patched 的 `1.2.4-r1`
3. **传递依赖重复报**：同一个 CVE 在 5 个间接依赖里各报一次

治理机制：

- **统一入口**：SCA 只从**锁文件/SBOM** 扫一遍，别每个模块扫一遍造成重复
- **VEX 文档**：对"不受影响"给出正式声明（CycloneDX VEX / OpenVEX），而不是简单 ignore
- **豁免要有到期日**：`.trivyignore` 或平台里的 ignore 必须带 `expired_at` 和责任人
- **按可达性排序**：能拿到调用链的工具（如 Snyk、Semgrep Supply Chain）优先修可达的

让它被真的修 —— 三个组织手段：

1. **报告进 PR 而不是进邮件**：开发者在改代码时才能看到
2. **只阻断新增，不阻断存量**：新引入的高危必须修，历史 CVE 排期
3. **给出修复命令**：`npm audit fix`、`pnpm update pkg@^2.1.5`，别只报 CVE 号

踩坑：把所有误报都 `ignore` 掉，半年后 ignore 文件比代码还长，真正的漏洞混在里面没人看——**豁免要像代码一样 review**。

---

### Q59. 密钥泄漏扫描怎么做？发现泄漏后第一时间干什么？【中】

扫描分两道：

- **提交前**：`pre-commit` 挂 `gitleaks` / `detect-secrets`，把问题挡在本地
- **提交后**：CI 全量扫 + 平台侧开启 push protection（GitHub Secret Scanning），**覆盖历史提交**

```bash
gitleaks detect --source . --verbose --redact
gitleaks protect --staged          # pre-commit 用
trufflehog git file://. --only-verified
```

发现泄漏后的正确顺序（**顺序错了等于没做**）：

1. **立刻吊销/轮换密钥**——先止血，别先删提交
2. 评估影响：这个 key 能访问什么、有没有被用过的痕迹（云厂商的 Access Analyzer / 审计日志）
3. 清理 git 历史（`git filter-repo` / BFG），force push 并通知所有人重新 clone
4. 排查同类问题（同一批代码里还有没有别的硬编码）
5. 复盘：为什么会进来、门禁为什么没拦住

**关键认知：git 历史里删掉不等于安全**。只要推过远端、被人 clone 过、被 fork 过、被 CI 缓存过，那个密钥就必须视为已泄露。

踩坑：只删了最新提交里的密钥，历史提交还在，`git log -p` 一搜就出来了——**必须按"已泄露"处理**。

---

### Q60. SBOM 是什么？为什么监管和客户都在要？怎么落地？【高】

SBOM = 软件物料清单，列出制品里**所有组件及其版本、来源、依赖关系**，格式主流两种：**SPDX** 和 **CycloneDX**。

为什么需要：

- **漏洞响应**：Log4Shell 那天，能 10 分钟内回答"我们哪些服务受影响"的公司和查三天的公司，差距就在有没有 SBOM
- **合规**：美国 EO 14028、欧盟 CRA 都在往这个方向要求；金融、政企客户采购时会要
- **许可证审计**：GPL/AGPL 传染性依赖混进商业产品是法律风险

落地：

```bash
# 构建时生成镜像 SBOM
syft app:1.4.2 -o cyclonedx-json > sbom.json
# 把 SBOM 作为 attestation 附着到镜像上
cosign attest --predicate sbom.json --type cyclonedx registry/app:1.4.2
# 之后按 CVE 反查
grype sbom:sbom.json
```

三个关键实践：

1. **SBOM 跟制品绑定**（同一个 digest），不是单独存一份文件让它飘走
2. **构建时生成，不是事后扫描**——事后扫描扫的是"当前仓库里的镜像"，历史版本就丢了
3. **SBOM 要能被查询**：接进平台，支持"哪个 CVE 影响了哪些服务"

踩坑：只生成不消费。SBOM 生成了一堆文件躺在 S3 里没人读，等于没做——**价值在于下一次漏洞爆发时的 5 分钟响应**。

---

### Q61. 供应链安全整体要考虑什么？只扫依赖够吗？【高】

不够。供应链的完整攻击面：

| 环节 | 风险 | 防护 |
|---|---|---|
| 源码 | 恶意 PR、被投毒的维护者账号 | 分支保护、签名提交、双人 review |
| 依赖 | 恶意包、typosquatting、依赖混淆 | 私有代理、锁文件、`--ignore-scripts`、来源白名单 |
| 构建 | 构建机被入侵、CI 配置被改 | ephemeral runner、权限最小化、构建日志审计 |
| 制品 | 镜像被替换 | 签名 + admission 校验、immutable tag |
| 分发 | 下载源被劫持 | HTTPS + 校验和、私有 registry |

重点说两个容易被忽略的：

- **依赖混淆（dependency confusion）**：内部包名 `@company/utils` 在公网 npm 上被别人抢注，如果你的 registry 配了 fallback 到公网，就会拉到恶意版本。**对策：内部 scope 强制只走私有源**
- **`npm install` 的 postinstall 脚本**：装包即执行任意代码。CI 里加 `--ignore-scripts`，或只在可信包上允许

```bash
npm ci --ignore-scripts        # 禁止依赖的安装脚本
pnpm install --frozen-lockfile --ignore-scripts
```

踩坑：只做 SCA 扫描，忽略了「构建环节」——攻击者不需要污染依赖，改一下 CI 的 yaml 就能在构建时把后门塞进产物。

---

## 十、密钥与凭证管理

### Q62. 为什么凭据绝对不能写进仓库？有哪些"看起来没事"的写法？【初】

因为 **git 历史是不可变的**：删了文件、改了行，历史提交里还在，`git log -p`、`git show` 一搜就出来。而且仓库会被 clone、fork、缓存、备份到无数地方。

「看起来没事」的危险写法：

```text
# 全部不合格
password: "Prod@2024"
export AWS_SECRET_ACCESS_KEY=AKIA...
--token=ghp_xxxxxxxx
DATABASE_URL=postgres://user:pass@host/db
```

还有几个更隐蔽的：

- **写进 `docker-compose.yml`** 的 `environment:` ——同仓库，同样泄露
- **写进测试 fixture / 示例配置**——示例常被复制到生产
- **写进 `.env.example`**——怕别人不会填，就填了真值
- **base64 编码**——不算加密，`base64 -d` 一秒还原
- **注释掉的旧配置**——历史里照样能搜到

判断标准：**这个值如果明天出现在公开网页上，会不会造成损失**。会，就不能进仓库。

正确位置：CI 的 secret 变量、Vault/KMS、K8s 的 external secret、云上的 IAM role。

---

### Q63. Vault 的核心思路是什么？和 K8s Secret 有什么本质区别？【中】

Vault 的核心思路：**密钥集中托管 + 动态签发 + 全程审计**。

- **集中**：所有应用从一处取，不再散落在几十个 CI 变量和配置文件里
- **动态**：数据库凭据按需签发，**有效期几小时，用完自动失效**（`database/creds/` 引擎）。这是和静态密钥最大的区别
- **审计**：谁在什么时候取了哪个 secret，全有日志
- **加密即服务**：`transit` 引擎做加解密，密钥永不出 Vault

K8s Secret 的本质：**base64 编码的配置对象，默认存在 etcd 里，不是加密**。

| | Vault | K8s Secret |
|---|---|---|
| 存储 | 加密后端（可接 KMS） | etcd（开 encryption at rest 才加密） |
| 权限 | 细粒度 policy + 多种认证 | RBAC，按 namespace 粗粒度 |
| 轮换 | 原生支持，可自动 | 手工，改完要重启 Pod |
| 动态凭据 | 支持 | 不支持 |
| 跨集群 | 支持 | 不支持 |

典型组合：**Vault 存真实值 → External Secrets Operator 同步成 K8s Secret → Pod 挂载**，或者用 Vault Agent Injector 直接注入内存。

踩坑：K8s Secret 被 `kubectl get secret -o yaml` 就能看到明文（base64），**任何有 get secret 权限的人都能读**——RBAC 一定要收紧。

---

### Q64. CI 变量和掩码有什么局限？怎么真正保护流水线里的密钥？【中】

掩码（masking）的机制：日志里出现该值时替换成 `***`。局限很明显：

- **只对完全匹配生效**：`base64` 一下、拼进 URL、截断输出，掩码就失效
- **多行值**（证书、私钥）经常掩不住
- **子进程直接写文件不再输出**，掩码管不到
- **掩码不是加密**：环境变量对同机其他进程可见（`/proc/<pid>/environ`）

真正的保护手段：

1. **不用环境变量，用文件 + 及时删除**：`withCredentials` 把凭据写到临时文件，步骤结束自动清理
2. **短期令牌**：CI 凭据有效期设成一次构建的长度，别用永久的
3. **OIDC 免密**（见 Q65）：CI 里根本没有长期密钥
4. **限制谁能改流水线**：能改 `.gitlab-ci.yml` / workflow 的人就拥有 CI 的所有凭据
5. **关掉 `set -x`**，或者在敏感段临时 `set +x`

```bash
set +x
curl -H "Authorization: Bearer $TOKEN" https://api.internal/deploy
set -x
```

踩坑：GitLab 的 masked variable 要求值**至少 8 个字符、单行、只含特定字符**，不符合的变量根本没法 mask；把多行私钥贴进去，日志里就是明文。

---

### Q65. OIDC 免密怎么做？为什么它是现在的最佳实践？【高】

核心思路：**CI 平台签发一个带身份的短期 JWT，云厂商验证签名和 claims 后临时授予权限**，全程没有长期密钥。

GitHub Actions 取云上权限：

```yaml
permissions:
  id-token: write          # 必须显式开
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789012:role/ci-deploy
      aws-region: ap-northeast-1
```

云侧信任策略要限制死：

```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:org/app:ref:refs/heads/main"
    }
  }
}
```

**`sub` 的条件是最关键的一行**——不限制就等于允许任意分支（包括 PR）冒充生产发布身份。

为什么是最佳实践：

- **无长期密钥可泄露**，token 有效期通常十几分钟
- **身份可审计**：云侧日志里直接看到是哪个仓库哪个分支取走的
- **天然最小权限**：不同分支可以映射到不同的 role

踩坑：`sub` 只写了 `repo:org/app:*`，结果任何人开个 PR 就能拿到生产 role——**PR 场景要单独拒绝，或者用 `pull_request` 事件时映射到只读 role**。

---

### Q66. 密钥轮换怎么做？不轮换的风险有多大？【中】

不轮换的风险：**一次泄露 = 永久有效**。离职员工、误提交、日志泄漏、第三方被攻破，任何一个环节漏了就长期暴露。

轮换策略：

| 类型 | 周期 | 方式 |
|---|---|---|
| 数据库口令 | 30–90 天 | Vault 动态凭据，或双口令过渡 |
| API Key | 90 天 | 新旧并存 → 切流量 → 吊销旧的 |
| TLS 证书 | 60–90 天 | ACME 自动续期（cert-manager） |
| 云 IAM 密钥 | 尽量不用 | 换成 OIDC / instance role |
| CI 令牌 | 每次构建 | 短期 token |

**双密钥过渡是核心技巧**（保证轮换不中断）：

1. 生成新密钥，**新旧同时有效**
2. 应用切到新密钥，观察一段时间
3. 确认旧密钥无调用，再吊销

踩坑：

- 直接吊销旧密钥，还没更新的应用全挂——**先确认调用方清单**
- 轮换脚本改了一个系统的配置，忘了另一个（比如 cron job 用的独立账号）
- **轮换完没演练过恢复**，出问题发现新密钥没生效
- cert-manager 证书过期：`Certificate` 健康但 `CertificateRequest` 卡住，通常是 DNS-01 的凭据过期了

建议：把轮换做成**定期演练**，随机挑一个非关键密钥真的吊销一次，验证告警和恢复流程能用。

---

### Q67. 历史提交里泄漏了密钥，怎么彻底处置？【高】

处置是「止血 → 评估 → 清理 → 防复发」四步，**顺序不能颠倒**。

**第一步：止血（5 分钟内）**

- 立刻轮换/吊销。这一步**不依赖清理历史完成**
- 检查有没有被用过的痕迹：云审计日志、异常 IP、账单突增

**第二步：评估影响面**

- 这个凭据能访问什么（最小权限会大幅缩小影响）
- 是否已经 fork / 被第三方 clone（GitHub 的 network 里能看）
- 是否在 CI 缓存、制品、日志里出现过

**第三步：清理历史**

```bash
# 推荐 git-filter-repo（比 BFG 更现代）
git filter-repo --path secrets.yaml --invert-paths
# 或者替换具体字符串
git filter-repo --replace-text replacements.txt
git push --force --all
git push --force --tags
```

清理后必须做的事：

- **通知所有协作者删除本地仓库重新 clone**（他们的历史里还有）
- 联系平台（GitHub/GitLab）**清理缓存的旧 commit**，否则通过 sha 仍能访问
- 检查 CI 平台上引用旧 commit 的构建缓存

**第四步：防复发**

- 开 push protection / pre-commit 扫描
- 把"凭据不进仓库"写进 review checklist
- 用 OIDC 替代长期密钥，从根上减少可泄漏的东西

**关键认知：第三步的清理是"减少扩散"，不是"恢复安全"。** 一旦推送到远端，就必须按已泄露处理。

---

## 十一、基础设施即代码与环境编排

### Q68. Terraform 和 Ansible 分别管什么？为什么不能用一个代替另一个？【初】

一句话分工：**Terraform 管"有哪些资源"，Ansible 管"资源里面配成什么样"**。

| | Terraform | Ansible |
|---|---|---|
| 范式 | 声明式 + 状态文件 | 过程式（任务按序执行） |
| 对象 | 云资源：VPC、ECS、RDS、SLB | 机器内部：包、配置文件、服务 |
| 幂等 | 靠 state diff | 靠模块自身幂等（`copy`、`service`） |
| 生命周期 | 有 create/update/destroy | 只有执行任务 |
| 典型用途 | 开一台机器、建一个库 | 在这台机器上装 Docker、发配置 |

为什么不能互相代替：

- **Terraform 做不了精细的机器配置**：`remote-exec` 里塞一堆 shell，就是失去了幂等和可读性
- **Ansible 做不了资源生命周期**：删掉 playbook 不会删机器，`state: absent` 只删它创建的东西，云资源的编排关系（先 VPC 后子网）很难表达

推荐边界：**Terraform 到"机器存在且能 SSH"为止，Ansible 接手之后的所有事**。

踩坑：用 Terraform 的 `local-exec` 调 ansible-playbook，结果 plan 阶段就执行了——`local-exec` 在 apply 时跑，但依赖关系一乱就重复执行。

---

### Q69. Terraform 的 state 为什么这么重要？远端 backend 怎么配？【中】

state 是 Terraform 的**唯一真相来源**：它记录"我创建了哪些资源、它们的 ID 和属性"。丢了 state，Terraform 就不知道现存资源归它管，下次 apply 会**重复创建一套**。

本地 state 的三个致命问题：

1. **多人协作互相覆盖**，后 apply 的人用旧 state 覆盖新的
2. **没有锁**，两个人同时 apply 会创建重复资源
3. **state 里有明文敏感信息**（数据库密码、私钥）

远端 backend 最小配置：

```json
terraform {
  backend "s3" {
    bucket         = "tfstate-prod"
    key            = "app/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "tfstate-lock"
    encrypt        = true
  }
}
```

`dynamodb_table` 提供**状态锁**，防止并发 apply；`encrypt` 让 state 在 S3 上加密。

必须记住的几条：

- **state 要开版本控制**（S3 versioning），误删能回滚
- **state 桶权限要最小**，能读 state 基本等于能读所有明文凭据
- **不要提交 state 到 git**，`.gitignore` 加 `*.tfstate*`
- 迁移用 `terraform state mv`，别手工改 JSON

踩坑：`terraform state rm` 之后忘了 `import`，下次 apply 又建了一套，账单翻倍——**rm 只是"忘掉"，不是"删除"**。

---

### Q70. Terraform plan 怎么审？怎么防止"plan 看着没事，apply 炸了"？【中】

plan 必须看的三类信号：

1. **`-/+`（replace）**：资源会被**销毁重建**。数据库、EIP、负载均衡出现 replace 通常意味着停机
2. **`destroy` 数量不为 0**：确认是不是预期的
3. **敏感字段的 diff**：密码、证书被改成空值或新随机值

工程化的做法：

```bash
terraform plan -out=tfplan -detailed-exitcode
# exit 0 = 无变更；1 = 出错；2 = 有变更
terraform show -json tfplan > plan.json
```

- **plan 文件与 apply 用同一个**：`terraform apply tfplan`，避免 plan 和 apply 之间被 push 新代码
- **CI 里自动贴 plan 到 PR**：人看 diff，比看日志强十倍
- **高风险资源加 `prevent_destroy`**：数据库、state 桶
- **`-refresh-only` 先确认漂移**：apply 前发现状态已漂移，先 refresh 再看 plan

踩坑：CI 里 `terraform plan` 和 `terraform apply` 分两个 job 跑，中间有人合并了别的 PR——**apply 的和 plan 的不是同一份代码**。要么把 plan 文件当 artifact 传下去，要么 apply 前重新 plan 并人工确认。

---

### Q71. 怎么保证多环境（dev/staging/prod）一致性？目录还是 workspace？【中】

三种主流组织方式：

| 方式 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **目录分离** | `envs/dev/`、`envs/prod/` 各自 backend | 隔离强、可独立 apply | 模块改动要同步多处 |
| **workspace** | 同一份代码 `terraform workspace select prod` | 代码只有一份 | 容易切错环境炸生产 |
| **Terragrunt/Atlantis** | 自动生成 backend 与依赖 | 减少重复 | 引入额外工具链 |

推荐**目录分离 + 共享 modules**：

```text
infra/
  modules/network/       # 唯一真源，只写一次
  envs/dev/main.tf       # module 调用 + 该环境变量
  envs/prod/main.tf
```

一致性靠这三条：

- **同一份 module 代码**，环境差异只通过 `tfvars` 传入（实例数、规格、域名）
- **禁止在某环境手写独有逻辑**，要加就加到 module 里加开关
- **环境差异清单化**，写成文档，review 时对照

踩坑：`workspace` 方式下把 `prod` 的 backend 和 `dev` 混在一个桶里，误操作 `workspace select` 后 apply 直接把开发配置推到生产。**workspace 适合临时环境，不适合隔离生产**。

---

### Q72. 幂等到底意味着什么？怎么写出幂等的配置？【中】

幂等 = **执行一次和执行 N 次结果相同，且第二次执行不产生额外变更**。

不幂等的典型写法：

```bash
# 每次执行都追加一行
echo "export PATH=/opt/bin:\$PATH" >> /etc/profile
# 每次执行都重启
systemctl restart app
```

幂等的写法：

```yaml
- name: 只追加一次
  lineinfile:
    path: /etc/profile
    line: 'export PATH=/opt/bin:$PATH'
    state: present
- name: 配置变了才重启
  template: { src: app.conf.j2, dest: /etc/app/app.conf }
  notify: restart app
```

关键机制：

- **声明目标状态**，不是"执行动作"：`state: present` 而不是 `shell: mkdir`
- **用带判断的模块**：`copy`、`template`、`lineinfile`、`user`、`package`
- **`creates` / `changed_when` / `failed_when`** 给 shell 补上幂等语义
- **`notify` + handler**：只有发生变化才触发重启

为什么重要：幂等是**可重复执行**的前提，配置漂移修复、故障重试、日常巡检全靠它。不幂等的 playbook 跑第二次就可能把服务弄坏。

踩坑：`shell: systemctl restart app` 每次都报 changed，导致整个 playbook 永远显示"有变更"，真实变更被淹没——用 `changed_when: false` 或改成 handler。

---

### Q73. IaC 的漂移（drift）怎么发现和收敛？【高】

漂移 = **实际基础设施和 IaC 描述不一致**，来源三类：

1. **手工改**：线上出问题，有人直接改安全组、改配置"先止血"
2. **外部系统改**：自动扩缩容改了实例数、云厂商自动轮换证书
3. **IaC 之外创建**：别的团队/脚本建了资源

发现手段：

```bash
terraform plan -refresh-only -detailed-exitcode
# exit 2 表示检测到漂移
terraform state list           # 看 Terraform 认为存在什么
terraform show -json | jq '.values.root_module.resources[].address'
```

工程化：

- **定时跑只读 plan**（每天/每小时），结果推告警或看板
- **手工改必须回填**：约定"改完当天必须写进代码或提 issue"
- **对可预期漂移做豁免**：自动扩缩容的 `desired_count` 用 `lifecycle { ignore_changes = [desired_count] }`
- **收敛策略分两种**：`apply` 让实际回到代码（代码是真理）；或改代码让描述回到实际（现实是真理）。**先判断哪个是对的**

踩坑：加了 `ignore_changes` 就再也不知道那个字段漂了——**豁免要显式、要有注释说明为什么豁免**，否则漂移慢慢累积成"代码和线上完全两回事"。

---

### Q74. IaC 的变更审批怎么做才不形式化？【高】

形式化审批的特征：审批人只看"有没有通过 CI"，不看 plan。

有效的做法：

- **把 plan 贴到 MR 里**，审批人看的是"要创建/修改/销毁什么"，不是"有没有 +1"
- **分级审批**：生产环境破坏性变更（destroy/replace）需要两个人 + 变更窗口；只增资源可以单人
- **`-target` 用得要谨慎**：局部 apply 会让 state 和代码偏离，事后必须补一次全量 plan
- **禁止直接改线上**：技术上收掉写权限（只留 CI 的 role 有 apply 权限），比制度有效
- **apply 只有一条路**：只在 CI 里 apply（Atlantis / GitLab CI / Terraform Cloud），人不能本地 apply 生产

```text
提交 MR → CI 跑 plan → plan 作为 comment 贴回 → 双人 approve
→ 合并 → CI 用同一份 plan 文件 apply → 记录审计日志
```

踩坑：给所有人本地生产 apply 的凭据，制度上写"必须先审批"——不出事则已，出事无法追溯是谁 apply 的。**权限收敛比流程约束可靠**。

---

## 十二、发布策略与流量切换

### Q75. 蓝绿、金丝雀、滚动发布怎么选？【初】

| 策略 | 资源成本 | 回滚速度 | 灰度精度 | 适用场景 |
|---|---|---|---|---|
| **滚动** | 低（原地替换） | 中（再滚回去） | 无 | 无状态服务、K8s 默认 |
| **蓝绿** | 高（双份） | **极快**（切流量） | 全有或全无 | 强依赖快速回滚的核心服务 |
| **金丝雀** | 低（少量新实例） | 快（摘掉新实例） | **按比例细** | 用户量大、影响面敏感的服务 |

选择逻辑：

- **能接受短暂双版本共存 → 滚动**（默认选项，成本最低）
- **回滚速度是第一诉求 → 蓝绿**（切 DNS/网关，秒级）
- **要按 1%/5%/50% 验证指标 → 金丝雀**（必须有流量切分能力和指标观测）

关键约束：**数据库 schema 必须兼容新旧两个版本**，否则滚动/蓝绿阶段两个版本同时读写会炸。这点决定了策略可行性，比资源成本优先级更高。

踩坑：选了蓝绿但共享同一个数据库和缓存，新版本写入了旧版本不认识的数据，回切后发现数据已经"污染"——**回滚不是无损的**。

---

### Q76. 金丝雀发布的判定指标怎么定？自动还是手动推进？【中】

至少看四层指标：

| 层次 | 指标 | 判定方式 |
|---|---|---|
| 可用性 | 5xx 率、超时率 | 与基线对比，**相对增幅**而非绝对值 |
| 延迟 | P95 / P99 | 涨 20% 以上告警 |
| 业务 | 下单成功率、支付转化 | 最容易发现"没报错但业务错了" |
| 资源 | CPU、内存、GC 次数、连接数 | 新版本突然吃满连接池 |

推进策略：

```text
5% 观察 10min → 25% 观察 20min → 50% 观察 30min → 100%
每档满足条件自动推进，不满足自动回滚并告警
```

自动化的前提（缺一不可）：

- **有稳定的指标基线**（对比同时间段的历史，排除大促影响）
- **有自动回滚通道**（把流量切回去，一条命令或自动触发）
- **样本量足够**：1% 流量下 100 个请求的 5xx 率没有统计意义，**别用绝对值判定**

踩坑：只看错误率，不看延迟和业务指标——新版本接口都 200，但每个都慢了 3 倍，业务侧转化掉了 15%，监控一片绿。**金丝雀的判定要包含业务指标**。

---

### Q77. 流量切分有哪些手段？各有什么坑？【中】

| 手段 | 做法 | 精度 | 坑 |
|---|---|---|---|
| **DNS** | 改解析权重 | 粗（受 TTL 和缓存影响） | TTL 太长切不动，切了也回不来 |
| **Nginx/LB** | `upstream` 权重 | 按连接/请求 | `weight` 是连接的，长连接不均衡 |
| **K8s Service** | 两个 Deployment + 标签 | 按 Pod 数 | 只能按实例比例，不能按用户 |
| **Ingress / Gateway** | header / cookie 路由 | 可指定用户 | 需要网关支持 |
| **Service Mesh** | VirtualService 权重 | 精细、支持 header | 引入 sidecar，运维复杂度上升 |

Nginx 权重示例：

```text
upstream app {
    server 10.0.0.11:8080 weight=9;   # 老版本
    server 10.0.0.12:8080 weight=1;   # 新版本
}
```

两个常见坑：

- **会话粘性导致不均衡**：开了 `ip_hash` 后，权重就没有意义了
- **网关层切了，但异步任务/消费者没切**：HTTP 流量灰度，MQ 消费者还是老代码，数据被老逻辑消费

工程建议：**优先用网关/Mesh 做基于 header 的定向灰度**（内部员工先打新版本），再做比例灰度。定向灰度比随机比例更容易复现问题。

---

### Q78. 数据库 schema 变更和发布怎么配合？【高】

核心原则：**数据库变更必须向后兼容，永远不假设新版本一定能上线**。

标准顺序（Expand-Migrate-Contract）：

1. **Expand**：加新列（可空）、加索引、加新表 —— 旧代码不受影响
2. **双写/回填**：应用同时写新旧字段，后台任务回填历史数据
3. **Migrate**：分批回填，校验一致性（抽样比对）
4. **切读**：读路径切到新字段，观察
5. **Contract**：确认无回滚可能后，删除旧字段

禁止在一次发布里做的：

- **删列 / 改名**（旧版本还在读，直接 500）
- **加 NOT NULL 且无默认值**（旧版本插入失败）
- **改列类型**（隐式转换、锁表）
- **大表加索引不并发**：MySQL 用 `ALGORITHM=INPLACE, LOCK=NONE` 或 gh-ost/pt-osc

```text
迁移脚本必须：可重复执行（IF NOT EXISTS）+ 有回退脚本 + 在预发跑过全量数据
```

踩坑：发布顺序错了——先上代码后跑迁移，新代码查一个还不存在的列，全站 500。**迁移必须先于代码，且兼容旧代码**。

---

### Q79. 发布窗口和冻结期有必要吗？怎么定？【中】

有必要，但目的不是"控制风险"，而是**降低不可控因素的叠加**。

典型的冻结期：

- **大促/业务高峰前 3–7 天**：如双 11、财报日、月初结算
- **节假日/周末**：值班人力不足，出问题恢复慢
- **重大活动期间**：营销投放、直播

冻结期内允许的例外（**白名单比全禁更现实**）：

- 安全漏洞紧急修复
- 已定位且影响面明确的生产故障修复
- 纯配置类、可秒级回滚的变更
- 已经过灰度验证、只差全量的发布

配套机制：

- **变更日历**：所有团队可见，谁在什么时间动了什么，冲突提前发现
- **变更分级**：L1（全量停服）/ L2（局部影响）/ L3（无感），只有 L1/L2 受限
- **例外审批通道要留**：冻结期一刀切，结果大家都"临时绕过流程"，反而更危险

踩坑：冻结期定了但没人执行，因为审批人不知道有这个制度——**变更日历 + 自动拦截（部署系统在冻结期直接拒绝）比发文有效**。

---

### Q80. 发布过程怎么做到可观测？出了事怎么快速定位是哪个变更引起的？【高】

关键：**把变更事件注入到监控时间线里**。

必做的四件事：

1. **打版本标记**：`/health` 或 `/version` 返回 commit sha、构建号、镜像 digest
2. **变更事件推到监控系统**（Grafana annotation / 告警平台事件流），出问题时时间线上直接看到"14:32 发布了 v2.3.1"
3. **关键指标带版本维度**：`http_requests_total{version="v2.3.1"}`
4. **发布日志可检索**：谁在什么时候发的、谁审批的、灰度到哪一步

```bash
# 部署时打 annotation
curl -X POST "$GRAFANA/api/annotations" \
  -H "Authorization: Bearer $KEY" \
  -d '{"text":"deploy v2.3.1","tags":["deploy","prod"]}'
```

定位"是不是发布引起的"最快的三个问题：

- 指标曲线拐点和发布时间点**重合吗**
- 回滚到上一版本，问题**消失吗**（这条最有说服力）
- 影响范围是否**只在新版本实例上**（对比两组实例的错误率）

踩坑：只打了 tag，但没有版本维度的指标，回滚前后只能靠猜——**发布可观测性要在平时建好，事故时才建已经来不及**。

---

### Q81. 多集群/多区域发布怎么保证顺序和一致性？【高】

基本策略：

- **按区域串行**：先发一个边缘区域或小流量区域，验证后再发其他区域。**永远不要全区域同时发**
- **按层串行**：基础设施层 → 数据层 → 业务层，层内有依赖的按依赖顺序
- **统一的发布编排层**：Argo Rollouts / Flux / 自研发布系统，把"区域顺序、等待条件、回滚触发"写成声明式

数据一致性是难点，三条铁律：

1. **先扩 schema 再发代码**，且所有区域的 schema 变更都先于任何区域的代码发布
2. **跨区域数据同步不能假设即时**：主从延迟下，新区域读到旧数据的代码必须能处理
3. **不在发布里做数据迁移**，迁移走独立的后台任务

```text
第 1 步：全区域 schema 变更（向后兼容）
第 2 步：单区域代码发布 + 灰度
第 3 步：观察 → 逐区域推进
第 4 步：全部完成后，才允许 Contract 阶段删旧字段
```

踩坑：先发 A 区域代码，同时删了旧字段，B 区域还在跑旧代码直接挂——**"最后才删"是硬约束，不是优化**。

---

## 十三、GitOps 与配置漂移

### Q82. GitOps 的核心思想是什么？和"用 Git 管配置"有什么区别？【初】

GitOps = **Git 是期望状态的唯一真源，集群里有一个自动化 agent 持续把实际状态收敛到 Git 描述的状态**。

四个要素：

1. **声明式**：描述"要什么"，不是"怎么做"
2. **版本化**：所有变更走 Git，有历史、可 review、可回滚
3. **自动拉取**：集群侧的 agent（ArgoCD/Flux）**主动 pull**，不是 CI 从外面 push
4. **持续收敛**：定期比对，实际和期望不一致就修正或告警

和"Git 里放配置文件"的本质区别在于**第 3、4 点**：

- 只把 yaml 放 Git、CI 里 `kubectl apply`，那是 **CIOps**——集群不知道 Git 长什么样，无法自愈
- GitOps 的 agent 在集群内，**CI 不需要集群凭据**，安全边界完全不同

好处：**集群凭据不用发给 CI**、漂移自动发现、回滚 = `git revert`。

踩坑：以为上了 ArgoCD 就是 GitOps，结果还在 CI 里 `kubectl apply`，两套并存互相打架——**要么 push 要么 pull，不能都要**。

---

### Q83. ArgoCD 的 sync 和 drift 检测是怎么工作的？【中】

ArgoCD 持续做三路比对：**Git 里的期望状态**、**集群里的实际状态**、**上次 sync 记录的状态**。

状态判定：

| 状态 | 含义 | 处置 |
|---|---|---|
| `Synced` | 实际 = 期望 | 正常 |
| `OutOfSync` | 有差异 | 自动或手动 sync |
| `Unknown` | 比对失败（权限、CRD 缺失） | 查 Application 事件 |

同步策略：

```yaml
syncPolicy:
  automated:
    prune: true        # 删除 Git 里已删的资源
    selfHeal: true     # 集群被手工改了就改回去
  syncOptions:
    - CreateNamespace=true
    - ApplyOutOfSyncOnly=true
```

两个参数的风险要清楚：

- **`prune: true`**：Git 里删掉 = 集群里真删。误删 yaml 会直接删生产资源，**必须有 `Prune=false` 标记和审批**
- **`selfHeal: true`**：自动纠正手工改动，好处是漂移自动收敛，坏处是**线上救火时的临时改动会被反复回滚**（比如临时调大 `replicas`）

踩坑：`Unknown` 状态通常是 ArgoCD 的 ServiceAccount 权限不够，看不到某些资源——不是代码问题，先查 RBAC。

---

### Q84. 声明式和命令式的边界在哪？哪些事不该放进 GitOps？【中】

判断标准：**这个操作能不能用"最终状态"完整表达**。

适合声明式（进 Git）：

- Deployment、Service、ConfigMap、Ingress 等 K8s 资源
- 云资源（Terraform / Crossplane）
- 告警规则、Dashboard、RBAC

不适合（留在命令式）：

| 场景 | 原因 | 替代 |
|---|---|---|
| 数据库迁移 | 有严格顺序、不可重复执行 | Job + 独立流水线 |
| 一次性数据修复 | 与具体时点绑定 | 受控脚本 + 审计 |
| 紧急热修 | 需要立即生效 | 走 break-glass 流程后回填 Git |
| 证书私钥分发 | 敏感、动态 | External Secrets / Vault |
| 灰度比例调整 | 高频、需人工判断 | Argo Rollouts 的 pause/推进 |

中间地带的做法：**把命令式操作封装成 K8s Job 或 Argo Workflow，仍然由 Git 触发**，既保留可追溯性又不要求它幂等。

踩坑：把数据库迁移塞进 ArgoCD 的 Sync Hook（`PreSync`），结果大表迁移跑了 40 分钟，ArgoCD 超时判定失败，又重跑一遍——**迁移要能防重入，用锁表或 advisory lock**。

---

### Q85. 配置仓库怎么拆？单仓还是应用仓分离？【中】

两种主流：

**A. 应用仓 + 配置仓分离**（推荐）

```text
app-repo/          # 源码 + Dockerfile + CI
config-repo/       # K8s manifests / Helm values / ArgoCD Application
```

好处：**配置变更不需要重跑应用流水线**，也不需要给 CI 应用集群权限；坏处：镜像 tag 更新要跨仓提交（通常由 CI 自动提 PR）。

**B. 单仓**：源码和配置在一起，改代码和改配置一次提交。适合小团队、少量服务。坏处是配置变更会触发应用构建。

拆分后的关键问题：**怎么把新镜像 tag 写进配置仓**。三种做法：

1. CI 直接 commit 到配置仓（简单，但需要写权限）
2. CI 提 PR，人工合并（安全，多一步）
3. 配置仓里用 `ImageUpdater` 自动跟随（ArgoCD Image Updater）

踩坑：配置仓和生产集群的权限没隔离，任何能提 PR 的人合并后就能改生产——**配置仓也要分支保护和 CODEOWNERS**。

---

### Q86. 多环境怎么用 Kustomize / Helm 做覆盖？【中】

**Kustomize（overlay 思路，无模板）**：

```text
base/            # 环境无关的公共配置
overlays/dev/    # kustomization.yaml 里 patch 镜像和副本数
overlays/prod/
```

```yaml
# overlays/prod/kustomization.yaml
resources: [../../base]
images:
  - name: app
    newTag: v2.3.1
patches:
  - target: {kind: Deployment, name: app}
    patch: |-
      - op: replace
        path: /spec/replicas
        value: "6"
```

**Helm（模板 + values）**：

```bash
helm upgrade --install app ./chart -f values-prod.yaml --set image.tag=v2.3.1
```

取舍：

- **Kustomize** 适合"同一份 yaml 微调"，不需要学模板语法，ArgoCD 原生支持
- **Helm** 适合"要打包给别人用"，参数化能力强，但 `values` 层层覆盖容易失控（`--set` 覆盖文件）

踩坑：Helm 里写了 `values.yaml` + `values-prod.yaml` + `--set` 三层，出问题根本不知道最终值是谁给的——**用 `helm template` 渲染出最终 yaml 再看**，别猜。

---

### Q87. 紧急手工改了生产，怎么回收进 GitOps 而不引发二次故障？【高】

回收流程（**先补代码，再放开自动同步**）：

1. **临时关掉 selfHeal**，防止 ArgoCD 把手工改动立刻改回去（这一步最重要，别顺手先同步）
2. **把手工改动落到配置仓**：`kubectl get deploy app -o yaml` 提取实际值，写进 Git
3. **生成 diff**，确认 Git 合入后的结果和当前线上一致（`kubectl diff` / ArgoCD 的 diff 视图）
4. **恢复 selfHeal**，此时应该显示 `Synced`，**不应该产生任何变更**
5. 补一个复盘，把这次应急通道的使用记录下来

关键点：**回收的目标是"Git 追上现实"，不是"现实追上 Git"**。顺序反了就是二次故障。

break-glass（应急通道）的设计：

- 有一个明确的"临时关闭自动同步"开关，有审计、有到期自动恢复
- 手工改动必须带 annotation 标记（`reason=incident-1234`）
- 事后自动生成待办：把这次改动回填

踩坑：直接 re-enable selfHeal，ArgoCD 立刻把救火时的 `replicas: 20` 改回 `6`，流量再次打满——**回收前一定先看 diff**。

---

### Q88. 配置漂移的告警怎么做才不噪音？【高】

漂移告警的噪音来源：

- **预期的漂移**：HPA 改副本数、自动注入的 sidecar、云厂商加的 annotation
- **高频无意义字段**：`resourceVersion`、`status`、`metadata.generation`
- **无主的资源**：别人手工建的，每天都在报

治理手段：

1. **区分"受管"和"不管"**：只对 ArgoCD/Terraform 声明过的资源告警，忽略无主资源（或用 `ignoreDifferences`）
2. **白名单字段**：把 HPA 管的 `replicas`、注入的 sidecar 排除
3. **按严重程度分级**：改了镜像 tag / 改了资源限制 → 高危，立即告警；改了 annotation → 日报
4. **聚合而不是逐条**：一次发布导致的 20 个资源漂移合并成一条告警
5. **告警要带 diff**：只说"OutOfSync"没人想点开，直接把 diff 贴出来

```yaml
ignoreDifferences:
  - group: apps
    kind: Deployment
    jsonPointers: ["/spec/replicas"]
```

踩坑：把所有 `ignoreDifferences` 都加上，最后 ArgoCD 永远 `Synced`，漂移检测形同虚设——**豁免要有清单和 review，不能随手加**。

---

## 十四、回滚、热修与降级

### Q89. 回滚要满足什么条件才能快？【初】

回滚速度取决于**发布前建好的东西**，不是发布后临时想办法。

四个前提条件：

1. **上一版本的制品还在**：镜像没被清理策略删掉，制品仓库保留策略要覆盖回滚窗口
2. **回滚不需要重新构建**：直接复用旧镜像 digest，**不要用 `latest` 或重新 build**
3. **数据库兼容**：旧代码能读新 schema（这就是 Q78 的 Expand-Contract）
4. **一条命令 / 一个按钮**：`argocd app rollback`、`kubectl rollout undo`、发布系统的回滚按钮

```bash
kubectl rollout undo deploy/app -n prod
kubectl rollout status deploy/app -n prod --timeout=120s
```

必须有回滚演练：**不定期真的回滚一次到上一版本**，验证镜像还在、schema 兼容、流量切回正常。没演练过的回滚预案等于没有。

踩坑：镜像保留策略只留最近 5 个 tag，结果发现回滚窗口需要 30 天，要回滚的版本已经被清了——**保留策略要和回滚窗口对齐**。

---

### Q90. 为什么说"镜像能回滚、数据库不能回滚"？怎么处理这种不对称？【中】

不对称的原因：

- **镜像是不可变制品**，切回去就是原来那份字节
- **数据是可变状态**，新版本可能已经写入了旧版本不认识的格式、删了旧版本依赖的列

具体冲突场景：

| 变更 | 回滚后果 |
|---|---|
| 加了新列 | 旧版本不写它，可能留下 NULL 导致后续查询异常 |
| 删了旧列 | 旧版本 SELECT 直接报错 |
| 改了枚举值含义 | 旧版本把新值当非法，数据"看起来坏了" |
| 数据格式变化（JSON 结构） | 旧版本解析失败 |

处理原则：

1. **schema 变更永远向后兼容**（只加不删），真正的删除推迟到"确认不可能回滚"之后
2. **回滚不自动回滚数据**：数据修复是独立决策，宁可保留新数据用手工脚本修
3. **所有写入带版本标记**（如新增 `schema_version` 字段），遇到不认识的值降级处理而不是报错
4. **可回滚窗口内保证双版本可读**，这就是为什么 Contract 阶段要等很久

踩坑：回滚了代码，发现新版本已经按新格式写了一天的数据，旧版本读不了——**回滚前先确认数据兼容，否则是"从服务故障变成数据故障"**。

---

### Q91. 热修（hotfix）流程怎么设计才能又快又不出新问题？【中】

热修的最大矛盾：**要快，但越急越容易出错**。

推荐流程（目标是 15 分钟上生产，但不跳过验证）：

```text
1. 从生产在跑的 tag 切 hotfix 分支（不是从 main）
2. 最小改动，只修这一个问题，不做任何"顺手优化"
3. 必须有：构建通过 + 关键冒烟 + 至少一个人 review
4. 走发布系统灰度到 1% → 指标正常 → 全量
5. 合回 main，并把 hotfix 的提交 cherry-pick 到即将发布的分支
```

三个必须坚持的规则：

- **只做最小改动**：热修里顺手重构是事故放大器
- **必须有 review**：一个人也必须有第二个人看过，紧急不是跳过的理由
- **必须回灌主干**：不 cherry-pick 回 main，下个版本会把 bug 带回来

踩坑：热修分支从 main 切的，结果带上了 main 里还没验证的其他功能——**从生产 tag 切分支是纪律**。

---

### Q92. 什么情况下用 feature flag 关掉比回滚更好？【中】

feature flag 的优势：**秒级、不需要重新部署、可以只关某个用户群/租户**。

比回滚更合适的场景：

| 场景 | 为什么 flag 更好 |
|---|---|
| 新功能有 bug 但只影响部分用户 | 只对受影响群体关闭，其他人不受影响 |
| 回滚会丢数据/不兼容 | 旧代码还在，只是功能关掉，数据继续由新代码写 |
| 数据库迁移不可逆 | 回滚代码会撞 schema，flag 不影响 |
| 回滚窗口已过 | 无法快速回滚时的唯一选择 |
| 需要按租户/地区关闭 | 回滚是全量的 |

flag 的代价（必须一起设计）：

- **开关本身是代码**：需要测试"开"和"关"两条路径，否则 flag 代码从来没被验证过
- **flag 会累积**：用完必须删除，否则一年后有 300 个永久开关，没人敢动
- **判定逻辑要能审计**：谁在什么时候关的、为什么关

踩坑：flag 关掉了功能，但**后台异步任务没读 flag**，还在处理任务；或者 flag 判断放在前端，后端接口照样执行——**开关要覆盖所有入口，包括异步链路**。

---

### Q93. 降级预案怎么设计和演练？【高】

降级 = **牺牲部分功能或数据精度，保住核心链路可用**。

先划分等级：

| 等级 | 做法 | 例子 |
|---|---|---|
| L1 功能关闭 | 关掉非核心功能 | 关闭推荐、关闭评论 |
| L2 读写分离降级 | 只读、写排队 | 大促期间关闭下单评价 |
| L3 静态兜底 | 返回缓存/静态页 | 首页返回 CDN 静态页 |
| L4 限流熔断 | 拒绝部分流量保大多数 | 按用户 ID 限流 |

设计要点：

- **每个 L 级别要有明确触发条件**（错误率 > 5% 持续 3 分钟）和**明确的执行人**
- **降级开关必须提前做好并测试过**，不能事故时才写
- **降级后要有恢复流程**，且恢复要能承受"流量瞬间回涌"（逐步放开，不是一次全开）
- **依赖方降级要协商**：下游挂了，是你的降级还是他的降级，别互相等

演练：**每季度真的把某个依赖掐掉，看系统是否按预案降级**。没演练过的降级预案，第一次使用时通常发现某个中间层没实现降级逻辑。

踩坑：降级到只读后，用户下单请求全部报错但页面显示成功——**降级路径的 UX 也要设计**，不然只是把技术故障变成了用户投诉。

---

### Q94. 发布导致的故障，复盘怎么落地？【中】

复盘的目的不是追责，是**让下一次不犯**。所以必须产出可执行项，而不是"加强意识"。

有效的复盘结构：

1. **时间线**：精确到分钟，从"变更提交"到"恢复"，包括发现、响应、止损、恢复各阶段耗时
2. **影响面**：多少用户、多少订单、多长时间、多少钱
3. **根因**：技术根因 + 流程根因（为什么门禁没拦住），**两个都要有**
4. **做对了什么**：哪些机制起了作用（监控发现了？回滚快了？）——不能只写问题
5. **行动项**：每条有**负责人 + 截止日期 + 类型**

行动项分三类，配比建议 4:4:2：

- **技术**（加监控、加门禁、加自动回滚）
- **流程**（改发布流程、加审批、加演练）
- **文档**（runbook、值班手册）

踩坑：行动项写了 20 条，三个月后一条没做——**行动项要少（3–5 条）、要进 Jira、要在周会跟踪**。写得多不如做完三条。

另外：**无指责复盘（blameless）不等于不分析个人行为**，要分析"为什么一个人能在没有 review 的情况下改生产"，然后改机制。

---

### Q95. 怎么衡量发布体系的健康度？【高】

用能反映"发布变得更容易还是更难"的指标，别用"发布次数"这种虚荣指标。

核心指标（DORA 四件套 + 补充）：

| 指标 | 定义 | 健康方向 |
|---|---|---|
| **发布频率** | 单服务日均部署次数 | 高 |
| **变更前置时间** | commit 到生产运行的时间 | 短 |
| **变更失败率** | 导致回滚/热修/故障的发布占比 | 低（< 15%） |
| **恢复时长 MTTR** | 故障到恢复的时间 | 短 |

补充指标（更能暴露问题）：

- **回滚率**：回滚次数 / 发布次数，高说明验证不足
- **热修比例**：绕过正常流程的发布占比，高说明流程太重或质量太差
- **发布耗时**：从点按钮到全量的时间，长说明流程环节多
- **首次成功率**：第一次发布就成功、无需热修的比例
- **发布相关故障占比**：所有故障里由变更引起的比例（业界通常 60%+）

用法：**不要拿这些指标考核个人**，一旦考核，所有人都会把发布拆得又小又碎来"刷指标"，或者干脆不发布。指标用于发现系统瓶颈：变更失败率高 → 补测试和灰度；前置时间长 → 砍审批和流水线耗时。

踩坑：只统计"成功发布次数"做成大屏，看起来很繁荣，实际变更失败率 40%、每月热修十几次——**要看失败侧的数据**。

---

## 十五、流水线故障排查与性能

### Q96. 流水线慢，怎么定位慢在哪？【初】

先量化，再优化。

```bash
# 看每个 stage 的耗时（GitLab 有 UI，Jenkins 看 Blue Ocean / stage 日志时间戳）
# 本地复现单个 stage 的耗时
time docker build -t app .
```

分层定位：

1. **排队时间** vs **执行时间**：排队占大头说明 agent 不够，不是流水线慢
2. **stage 时间分布**：80% 的时间通常在 1–2 个 stage（构建、测试、装依赖）
3. **单个 stage 内部**：加时间戳日志找出最慢的步骤

常见瓶颈排序（经验）：

- **拉依赖**（npm/maven 无缓存）
- **构建镜像**（缓存没命中，全量重来）
- **集成测试**（串行跑、每次重建数据库）
- **单线程执行**可以并行的 stage

优化手段：**缓存依赖、并行 stage、只跑受影响的测试、把镜像构建放前面并复用、用更大的 agent**。

踩坑：把流水线拆成 20 个串行 stage，每个都有 checkout 和 setup 开销，加起来比业务构建还久——**stage 之间的固定开销要算进去**。

---

### Q97. 缓存不命中怎么排查？【中】

缓存命中的前提是 **key 完全一致**，任何一位不同就全部重来。

排查顺序：

```bash
# 1. 打印实际算出的 key
echo "key=${{ hashFiles('**/pnpm-lock.yaml') }}"

# 2. 看缓存是否真的存在
# GitHub: Settings → Actions → Caches
# GitLab: CI/CD → Pipelines → 该 job 的 cache 段

# 3. 看缓存大小是否超限被清
```

不命中的六大原因：

| 原因 | 表现 |
|---|---|
| **lock 文件变了** | 每次 install 后 lock 被改写 |
| **路径不对** | 缓存了 `~/.npm` 但用的是 pnpm，路径是 `~/.local/share/pnpm/store` |
| **key 里含 `github.sha`** | 每个 commit 一个新 key，永远不命中 |
| **保存和读取的 key 不一致** | save 用 `v1-`，restore 用 `v2-` |
| **缓存超限被淘汰** | 仓库缓存总容量有上限（GitHub 10GB） |
| **跨分支不可见** | 分支缓存默认只能被本分支和默认分支访问 |

正确的 key 设计：

```yaml
key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
restore-keys: |
  ${{ runner.os }}-pnpm-
```

`restore-keys` 是渐进式回退：精确 key 不存在就用前缀最近的，比完全 miss 好得多。

踩坑：key 里加了 `${{ github.run_id }}` "为了每次都有新缓存"——**这就是永远不命中的写法**。

---

### Q98. 构建随机失败（flaky build）怎么治？【中】

先分类，不同原因治法完全不同：

| 类型 | 特征 | 治法 |
|---|---|---|
| **测试 flaky** | 同一个 commit 重跑就过 | 见 Q（flaky 测试治理），隔离 + 重试 + 修根因 |
| **依赖下载失败** | 偶发超时、502 | 私有代理 + 重试 + 超时调大 |
| **资源不足** | 随机 OOM、超时被杀 | 提高内存、限制并发、清理磁盘 |
| **并发冲突** | 多个 job 抢同一测试库/端口 | 每 job 独立资源、随机端口 |
| **时间/时区** | 跨零点、夏令时失败 | 固定 TZ、mock 时间 |
| **顺序依赖** | 单独跑过，一起跑失败 | 测试间不共享状态 |

定位手段：

```bash
# 统计失败率：按 job 名 + 错误信息聚类
# Jenkins: 用 flaky-test-handler 插件自动识别
# GitLab: 看 job 的 retry 记录
```

工程化做法：

- **失败日志必须完整可下载**（很多人只保留控制台最后 100 行）
- **一键重试**，且**重试事件要计数**——重试率高的 job 必须修
- **失败要能本地复现**：保留镜像、参数、环境变量

踩坑：用 `retry: 3` 把所有 flaky 藏起来，失败率看起来是 0，实际测试形同虚设——**要统计"重试后才成功"的比例**。

---

### Q99. agent 磁盘满了怎么排查和预防？【中】

典型症状：`No space left on device`、Docker 构建报 `failed to register layer`、拉镜像失败。

排查：

```bash
df -h
du -sh /var/lib/docker/* /var/lib/jenkins/* 2>/dev/null | sort -h | tail -20
docker system df -v
du -sh /tmp/* | sort -h | tail -10
```

常见占用来源（按概率）：

1. **Docker 镜像层和悬空镜像**：`docker image prune -a` 能清掉几十 G
2. **构建缓存**：BuildKit 缓存 `docker builder prune`
3. **workspace 里的历史构建目录**：Jenkins 的 `workspace/<job>@tmp`
4. **日志文件**：容器 stdout 没做 rotation，单个文件涨到几十 G
5. **Core dump / 大文件误写**：`/tmp` 下堆积

预防：

```bash
# 定时清理（cron 或 agent 的启动脚本）
docker system prune -af --filter "until=72h"
find /var/lib/jenkins/workspace -name "@tmp" -mtime +2 -exec rm -rf {} +
```

- **给构建目录和 Docker 配独立的盘**，别和系统盘混用
- **日志做 rotation**（`/etc/docker/daemon.json` 里配 `max-size`）
- **磁盘水位告警**（>80% 告警，不是 100%）

踩坑：只在构建前 `docker system prune` 清理，结果并发构建时把别的 job 正在用的镜像删了——**清理要加 `until` 过滤，别清正在用的**。

---

### Q100. 并发抢占（多个流水线抢资源）怎么解决？【中】

三类冲突：

1. **抢 agent**：队列堆积，谁先谁后不可控
2. **抢共享资源**：同一个测试数据库、同一个设备、同一个部署环境
3. **抢仓库锁**：同时往同一个分支推 tag

解法：

**限流/节流（throttle）**

```text
// Jenkins：同一时间只允许 1 个 job 操作 staging
properties([disableConcurrentBuilds()])
// 或 milestone / lock 插件
lock(resource: 'staging-env') { sh './deploy.sh' }
```

GitLab 用 `resource_group` 天然串行：

```yaml
deploy-staging:
  resource_group: staging
```

**资源隔离**：每个 job 用独立的容器化测试库（Testcontainers）、随机端口、独立 namespace。

**队列优先级**：生产发布优先于 PR 构建；PR 构建可以排队甚至被后来的取消（`cancel-in-progress`）。

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true     # 同一分支新提交取消旧的
```

踩坑：没设 `cancel-in-progress`，一个 PR 连续推 10 次就有 10 个构建排队，把 agent 全占了，主分支的发布排在后面。

---

### Q101. 日志爆量怎么办？怎么留才够用又不烧钱？【中】

爆量来源：调试日志忘了关、循环里打日志、异常堆栈重复打印、依赖库 DEBUG 级别。

**先止血**：

```bash
# 找到写的最多的文件/容器
du -sh /var/log/* | sort -h | tail
docker ps -q | xargs -I{} sh -c 'echo -n "{} "; docker logs --since 5m {} 2>&1 | wc -l'
```

**源头治理**：

- **日志级别按环境区分**：生产 INFO，调试靠动态调级（不要重启）
- **限流/采样**：同一异常每分钟只打 N 条
- **结构化日志 + 字段上限**：别把整个 request body 打进去
- **容器日志 rotation**：`max-size: 50m`、`max-file: 3`

**留存策略（分层）**：

| 层 | 保留 | 用途 |
|---|---|---|
| 构建日志 | 30–90 天 | 排查发布问题、审计 |
| 应用日志热存 | 7–15 天，可全文检索 | 故障排查 |
| 冷存/归档 | 90 天–1 年，压缩不可查 | 合规审计 |
| 关键事件 | 永久 | 发布记录、审批记录 |

成本控制的关键：**热存要短、冷存要便宜、检索按需**。把 90 天的应用日志全部放热存储，账单会很可观。

踩坑：为了省钱把构建日志保留 3 天，结果一个月后要审计"当时是谁发布的、参数是什么"，查不到——**发布/审批类记录要超出日志本身的保留期**。

---

### Q102. 流水线的稳定性怎么度量？怎么持续改进？【高】

四个可度量维度：

| 维度 | 指标 | 目标 |
|---|---|---|
| **可用性** | 流水线成功率（排除代码本身失败） | > 95% |
| **速度** | 从 push 到反馈的时间（P50 / P95） | PR 反馈 < 10 分钟 |
| **可信度** | 重试后才成功的占比、误报（红但代码没问题） | < 5% |
| **成本** | 单次构建时长 × 次数、agent 利用率 | 逐季下降 |

**最关键的是"速度 + 可信度"**：

- 反馈超过 15 分钟，开发者会去干别的事，回来上下文已丢，反馈价值归零
- 误报率高，开发者学会无视红色，真失败被忽略

改进方法（Parity / 分层）：

1. **PR 阶段只跑快速检查**（lint + 单测 + 编译，5 分钟内）
2. **合并后再跑重活**（集成测试、E2E、镜像构建）
3. **只跑受影响的**（monorepo 增量、测试影响分析）
4. **把不稳定的测试隔离**到单独的、允许失败（`allow_failure: true`）的 job，并开 issue 修
5. **每周看一次最慢的 10 个 job**，逐个优化

```yaml
# 隔离 flaky 测试，不让它阻塞主流程，但不让它消失
flaky-tests:
  allow_failure: true
  script: ./run-tests.sh --tag=flaky
```

踩坑：为了让流水线"看起来稳定"，把不稳定的测试全删了——**稳定性指标会好看，缺陷会流到生产**。隔离 + 跟踪 + 修复，才是正确路径。

---

## 十六、CI/CD 与发布速记卡

### 常见流水线阶段对照

| 阶段 | 主要动作 | 失败即阻断 | 典型耗时 |
|---|---|---|---|
| 检出 | checkout、恢复缓存 | 是 | 秒级 |
| 静态检查 | lint、格式、类型检查 | 是 | < 1 min |
| 单元测试 | 快速单测 + 覆盖率 | 是 | 1–5 min |
| 构建 | 编译、打镜像 | 是 | 2–10 min |
| 安全扫描 | SCA、SAST、镜像扫描 | 高危是 | 1–5 min |
| 集成/E2E | 起环境跑链路测试 | 是（可异步） | 5–30 min |
| 制品入库 | push 镜像 + 打 tag + 签名 | 是 | 1–2 min |
| 部署预发 | 自动部署 + 冒烟 | 是 | 2–10 min |
| 生产发布 | 灰度 → 全量 | 人工/自动 | 10–60 min |

### 必记环境变量（GitHub Actions / GitLab CI 对比）

| 用途 | GitHub Actions | GitLab CI |
|---|---|---|
| 提交 SHA | `${{ github.sha }}` | `$CI_COMMIT_SHA` |
| 短 SHA | `${{ github.sha }}` 取前 7 位 | `$CI_COMMIT_SHORT_SHA` |
| 分支 | `${{ github.ref_name }}` | `$CI_COMMIT_REF_NAME` |
| 事件类型 | `${{ github.event_name }}` | `$CI_PIPELINE_SOURCE` |
| 是否 PR/MR | `github.event_name == 'pull_request'` | `$CI_MERGE_REQUEST_IID` |
| 令牌 | `${{ secrets.GITHUB_TOKEN }}` | `$CI_JOB_TOKEN` |
| 运行器 OS | `${{ runner.os }}` | `$CI_RUNNER_TAGS` |
| 流水线重试次数 | `${{ github.run_attempt }}` | `$CI_PIPELINE_ID` |
| 项目路径 | `${{ github.repository }}` | `$CI_PROJECT_PATH` |
| 工作目录 | `${{ github.workspace }}` | `$CI_PROJECT_DIR` |

### 发布策略一句话对照

| 策略 | 一句话 | 回滚方式 | 成本 |
|---|---|---|---|
| 滚动 | 一批一批换 Pod，省钱 | `rollout undo`（慢） | 低 |
| 蓝绿 | 两套并存，切流量 | 切回旧环境（秒级） | 高 |
| 金丝雀 | 少量新版本先接流量，看指标 | 摘掉新实例 | 低 |
| 影子 | 镜像流量打到新版本但不返回 | 停影子 | 中 |
| Feature Flag | 代码上了，功能没开 | 关开关 | 极低 |

### 常见构建报错对照表

| 报错 | 常见原因 | 处置 |
|---|---|---|
| `No space left on device` | 镜像/缓存堆积，磁盘满 | `docker system prune -af` |
| `failed to register layer` | 磁盘满或 overlay 层损坏 | 清磁盘，重启 dockerd |
| `toomanyrequests`（Docker Hub） | 未登录匿名拉取超限 | 配镜像加速，或登录私有 registry |
| `CERTIFICATE_VERIFY_FAILED` | 企业代理或根证书缺失 | 注入 CA 证书到镜像/agent |
| `no matching manifest for linux/amd64` | 镜像只有 arm64 架构 | `--platform linux/amd64` |
| `Cannot connect to the Docker daemon` | DinD 未启动 / socket 没挂 | 起 `docker:dind` 或挂 `/var/run/docker.sock` |
| `permission denied` 挂载脚本 | 脚本没执行位，或 SELinux | `chmod +x`，`-Z` 上下文 |
| `ETIMEDOUT` / `ECONNRESET` 拉依赖 | 网络或代理 | 配私有源和重试 |
| `ModuleNotFoundError` / `module not found` | 依赖没装或路径不对 | 确认缓存路径与 lock 文件 |
| `141` / SIGPIPE | 管道下游提前退出（如 `| head`） | 换写法或 `set +o pipefail` |
| `OOMKilled (137)` | 内存超限 | 提高 limit 或降低并发 |
| `error during connect` | agent 上 dockerd 挂了 | 重启 docker，检查 cgroup |

### 必记端口与默认路径

| 组件 | 端口 | 默认路径/关键文件 |
|---|---|---|
| Jenkins | 8080（Web）/ 50000（agent） | `/var/lib/jenkins`，`JENKINS_HOME` |
| Harbor | 80 / 443 / 4443（notary） | `/data`（挂载卷），`harbor.yml` |
| Nexus | 8081（UI）/ 8082（docker） | `/nexus-data` |
| GitLab Runner | — | `/etc/gitlab-runner/config.toml` |
| ArgoCD | 8080（UI）/ 443 | namespace `argocd`，`argocd-cm` |
| Docker | 2375（明文）/ 2376（TLS） | `/var/lib/docker`，`/etc/docker/daemon.json` |
| K8s API | 6443 | `/etc/kubernetes/admin.conf` |
| SonarQube | 9000 | `/opt/sonarqube/data` |
| Vault | 8200 | `/vault/file`（默认） |
| containerd | — | `/etc/containerd/config.toml` |
| 容器内常见路径 | — | `/app`，`/usr/local/bin`，`/etc/app` |

### 面试一句话速答

- **流水线设计**：阶段划分按"反馈速度"排，快检查在前、慢验证在后；PR 阶段只跑能 10 分钟内出结果的。
- **Jenkins**：master 只编排不干活，agent 打标签按能力调度；流水线逻辑进共享库，别写死在每个 job 里。
- **GitLab CI**：`stage` 定串行层级，`needs` 打破层级做 DAG，`rules` 决定是否入队。
- **GitHub Actions**：`cache` 存依赖、`artifacts` 传构建产物，两者定位不同不能混用。
- **构建缓存**：命中率靠稳定的 lock 文件 + 不含 sha 的 key + `restore-keys` 前缀回退。
- **镜像优化**：多阶段构建、小基础镜像、非 root、不用 `latest`、`--no-install-recommends`。
- **制品管理**：不可变 tag + digest 是真相，`latest` 永远不可用于生产；保留策略要覆盖回滚窗口。
- **分支策略**：团队小用 Trunk Based，发布节奏慢用 Git Flow，开源用 GitHub Flow。
- **质量门禁**：只卡新增代码（Clean as You Code），历史债不阻塞，否则门禁会被无视。
- **安全扫描**：SAST 看自己、SCA 看别人、DAST 看运行时；镜像扫描先 `--ignore-unfixed` 跑通。
- **密钥**：不进仓库、不写明文、用 OIDC 拿短期凭证；泄漏了先吊销再清历史。
- **IaC**：Terraform 管资源、Ansible 管配置；state 必须远端加锁，plan 要人看。
- **发布策略**：默认滚动，要快回滚就蓝绿，要精细灰度就金丝雀；数据库必须向后兼容。
- **回滚**：镜像可回滚、数据不可回滚；回滚条件在发布前就建好，并且要演练过。
- **GitOps**：Git 是真源，agent 在集群里 pull，CI 不需要集群凭据；手工改动要"现实追 Git"回收。
- **稳定性**：看成功率、反馈时长、重试率；误报比失败更伤，会让人学会无视红色。

---
