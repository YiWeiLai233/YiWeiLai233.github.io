# Kubernetes 运维面试题库 · 深度版

> 难度标记：`【初】` 必答 · `【中】` 分水岭 · `【高】` 加分项
> 范围：这份题库只打 K8s 运维日常那一摊——控制面组件与一次请求的完整链路、kubectl 与资源对象操作、Pod 生命周期与调度、工作负载与滚动更新、服务发现与集群网络、Ingress 与流量治理、存储与 CSI、配置与密钥、认证授权与准入、资源管理与弹性伸缩、节点运维与集群升级、etcd 与备份恢复、故障排查实战、可观测性与审计、Operator 与扩展生态。答案仍然按 **是什么 → 为什么 → 怎么做 → 踩过什么坑** 组织，能直接背成面试口语。

---

## 目录

1. 集群架构与控制面组件
2. kubectl 与资源对象操作
3. Pod 生命周期与调度机制
4. 工作负载控制器与更新
5. 服务发现与集群网络
6. Ingress、网关与流量治理
7. 存储、PV 与 CSI
8. 配置、密钥与镜像拉取
9. 认证、授权与准入控制
10. 资源管理、QoS 与弹性伸缩
11. 节点运维与集群升级
12. etcd 与集群备份恢复
13. 故障排查实战
14. 可观测性、日志与审计
15. Operator、CRD 与扩展生态
16. Kubernetes 运维速记卡

---

## 一、集群架构与控制面组件

### Q1. 控制面和工作节点的核心组件各自负责什么？【初】

| 组件 | 跑在哪 | 核心职责 |
| --- | --- | --- |
| `kube-apiserver` | 控制面 | 唯一入口：认证 → 授权 → 准入 → 校验 → 写入 etcd |
| `etcd` | 控制面 | 唯一持久化存储，raft 集群 |
| `kube-scheduler` | 控制面 | 为未绑定 Pod 选节点，只回写 `spec.nodeName` |
| `kube-controller-manager` | 控制面 | 一堆控制器循环，把实际状态收敛到期望状态 |
| `kubelet` | 工作节点 | 节点 agent：管 Pod 生命周期、探针、挂盘、上报 status |
| `kube-proxy` | 工作节点 | 维护 Service 的 iptables / IPVS 转发规则 |

**只有 apiserver 直接读写 etcd，其他组件一律通过 apiserver 的 list/watch 通信**——这是理解整条链路的钥匙。数据面（真正转发流量）是内核，`kube-proxy` 只写规则。

答题要点：能按「控制面 / 节点 / 数据面」三层说清，比逐个背名字更能加分。

---

### Q2. 一次 `kubectl apply` 到 Pod 跑起来，中间发生了什么？【中】

1. `kubectl` 读 kubeconfig 取集群地址与客户端证书，构造 `PATCH/PUT` 请求
2. apiserver 做**认证**（证书 / Token / OIDC）→ **授权**（RBAC）→ **mutating 准入**（补默认值、注入 sidecar）
3. OpenAPI schema 校验 + 默认值填充 → **validating 准入** → 写入 etcd
4. `deployment` 控制器 watch 到变化，生成新的 ReplicaSet；RS 控制器创建 Pod（此时 `nodeName` 为空）
5. `scheduler` watch 到未绑定的 Pod，走「过滤 + 打分」，把结果写回 `spec.nodeName`
6. 目标节点的 `kubelet` watch 到「该我管」，拉镜像 → 创建 sandbox → 调 CNI 配网络 → 挂卷 → 启容器 → 探针通过
7. kubelet 持续上报 status，控制器再比对期望副本数

坑：`apply` 返回 `created` 只代表**写进了 etcd**，后面全靠异步控制器。所以「apply 成功但 Pending」是正常现象，要看 `kubectl describe pod` 的 Events。

---

### Q3. 静态 Pod 是什么？kubelet 从哪读它的定义？【中】

- kubelet 定时扫描 `--pod-manifest-path`（kubeadm 默认 `/etc/kubernetes/manifests`），文件出现即创建，消失即删除
- 由 kubelet 直接管理，**不经过 apiserver 调度**；apiserver 里看到的是一份 mirror pod，`kubectl delete` 删不掉（删了 kubelet 立刻重建）
- kubeadm 装的集群，`apiserver`、`etcd`、`controller-manager`、`scheduler` 本身就是静态 Pod

坑：改完 yaml 后容器会重建，但镜像没变时要等 kubelet 同步周期；换文件名等于新建 Pod 再加删除旧 Pod；静态 Pod 不支持 Deployment 那套滚动更新，升级窗口全靠 kubeadm 控制。

---

### Q4. 自建控制面怎么做高可用？etcd 为什么必须是奇数？【高】

- `apiserver` 无状态，多实例 + 前置 VIP（keepalived/HAProxy 或云 LB），证书 SAN 必须覆盖 VIP
- `scheduler` / `controller-manager` 靠 **lease 选主**，一主多备，不做负载均衡
- etcd 用 3 或 5 节点，raft 要求多数派：`quorum = n/2 + 1`

| 节点数 | 容忍故障 | 说明 |
| --- | --- | --- |
| 3 | 1 | 生产最小可用 |
| 4 | 1 | 不加容错，只加延迟与成本 |
| 5 | 2 | 大规模首选 |

**偶数节点不提升容错度，所以没人用 4 或 6**。坑：把 3 节点缩成 2 节点会直接失去 quorum，整个集群只读；VIP 漂移后旧 kubeconfig 还指向原地址，节点 Join 会挂。

---

### Q5. scheduler 和 controller-manager 的高可用怎么保证不打架？【中】

靠 **leader election**：在 `kube-system` 里各有一把 Lease（`kube-scheduler`、`kube-controller-manager`），谁拿到租约谁干活，其余实例 standby 并持续续约。

```bash
kubectl -n kube-system get lease kube-scheduler -o yaml
# 关键参数：--leader-elect=true --lease-duration=15s
#          --renew-deadline=10s --retry-period=2s
```

坑：网络分区 + 时钟漂移可能导致短暂双主（两个控制器同时创建资源），所以要看 `leaderElection` 相关日志和时钟同步（chrony）。升级时**不能一次性重启所有副本**，否则选主期间 Deployment 不会滚动、节点失联不会重建。

---

### Q6. kube-proxy 到底做什么？没有它集群还能通吗？【中】

- watch `Service` 与 `EndpointSlice`，在本机生成 DNAT 规则（iptables / IPVS / nftables），把 ClusterIP 映射到真实 Pod IP
- **它不转发任何数据包**，只维护内核规则；真正转发的是 conntrack + 内核
- 没有它也能通：eBPF 方案（Cilium）用 tc/XDP 直接在内核层做 Service 负载均衡，把 kube-proxy 整个替换掉

坑：`--masquerade-all`、`sessionAffinity`、`externalTrafficPolicy=Local` 的行为都取决于 kube-proxy 模式；IPVS 模式下规则数量增长平滑，上万 Service 的集群 iptables 线性匹配会明显变慢。

---

### Q7. 云托管 K8s 和自建怎么选？【高】

| 维度 | 托管 | 自建 |
| --- | --- | --- |
| 控制面运维 | 厂商负责，SLA 99.9%+ | 自己升级、自己备份 etcd |
| 可定制 | 受限，改不了 apiserver 参数 | 完全可控，feature gate / admission 随意 |
| 成本 | 每集群固定管理费 | 大规模摊薄后更便宜 |
| 风险 | 厂商锁定、跨云迁移贵 | 人力与事故风险自担 |

结论：**中小团队闭眼选托管**；规模大、有平台团队、需要深度定制网络或调度时再自建。现实中最常见的是混合形态——控制面托管，节点池自管，再叠一层自己的 Operator 做发布。

追问常考：托管集群的 etcd 备份你怎么验证？（答案：定期用 velero 做业务级备份 + 演练恢复，别指望厂商的 etcd 快照能回滚误删的 Namespace。）

---

## 二、kubectl 与资源对象操作

### Q8. 常用的 kubectl 命令有哪些？多集群怎么切上下文？【初】

```bash
kubectl config get-contexts                 # 列出所有上下文
kubectl config use-context prod-shanghai    # 切换
kubectl get pods -A -o wide                 # 全命名空间
kubectl -n app logs -f deploy/api --tail=100
kubectl -n app exec -it api-0 -- sh
kubectl top pod -n app --sort-by=cpu
kubectl api-resources | grep -i ingress    # 找短名和是否命名空间级
```

多集群靠 `KUBECONFIG` 环境变量合并多份配置文件（Linux 用 `:` 分隔，**Windows 用 `;`**）。日常用 `kubectx` / `kubens` 快速切换。

坑：`-n` 忘了写就会打到 `default`，改错环境；生产建议给上下文起带环境前缀的名字，并配 `kubectl config set-context --current --namespace=app` 固定默认命名空间。

---

### Q9. `kubectl apply` 和 `create` / `replace` 的本质区别？【中】

- `apply`：声明式，做**三方合并**（本地文件 + 集群现状 + `kubectl.kubernetes.io/last-applied-configuration` 注解），可反复执行
- `create`：命令式，已存在就报 `AlreadyExists`
- `replace`：全量替换，**文件里没写的字段会被清空**（包括控制器自动补的默认值）

坑（高频）：先用 `create` 建资源、之后改用 `apply` 管，因为缺 last-applied 注解，apply 会把没写进文件的字段当成「要删除」，典型表现是 Service 的 `clusterIP`、Deployment 的 `strategy` 被打回默认值。规矩是**一个资源只走一条管理路径**，且 `kubectl edit` 手改过的字段要记得同步回仓库。

---

### Q10. `kubectl explain` 和 `--dry-run` 怎么用出价值？【中】

```bash
kubectl explain deployment.spec.strategy.rollingUpdate
kubectl explain pod.spec.containers --recursive     # 递归展开
kubectl create deploy api --image=nginx --dry-run=client -o yaml > api.yaml
kubectl apply -f api.yaml --dry-run=server          # 走完整准入链
```

- `--dry-run=client`：本地生成/校验，不联网，用来**造模板**
- `--dry-run=server`：真实打到 apiserver，**mutating/validating webhook 都会执行**，能提前暴露 OPA、PSA、配额拦截

坑：CI 里只跑 client 侧 dry-run 是假的安全感，配额不足、webhook 拒绝都查不出来；CRD 的字段说明取决于 CRD 有没有维护 `openAPIV3Schema` 的描述。

---

### Q11. 标签选择器和字段选择器有什么区别？【中】

| 类型 | 作用对象 | 支持的运算符 | 典型用途 |
| --- | --- | --- | --- |
| label selector | `metadata.labels` | `=`, `!=`, `in`, `notin`, `exists` | Service/RS 关联 Pod、批量运维 |
| field selector | 少量对象字段 | `=`, `==`, `!=` | `status.phase`、`spec.nodeName` |

```bash
kubectl get pods -l 'app=web,tier in (frontend)'
kubectl get pods --field-selector status.phase=Pending,spec.nodeName=node-1
```

**字段选择器由 apiserver 在存储层过滤，能省流量；标签选择器几乎全资源可用**。坑：`-l` 传空值 `app=` 表示「该 label 存在但值为空」，和 `app`（exists）语义不同；`--field-selector` 不支持 `in`，写错会直接报错。

---

### Q12. JSONPath 和 custom-columns 怎么用？【中】

```bash
# 所有镜像
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{range .spec.containers[*]}{.image}{" "}{end}{"\n"}{end}'
# 重启次数最多的 Pod
kubectl get pods -A -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,RESTARTS:.status.containerStatuses[*].restartCount'
# 按条件过滤
kubectl get pods -o jsonpath='{range .items[?(@.status.phase=="Pending")]}{.metadata.name}{"\n"}{end}'
```

坑：字段不存在时输出空串不报错，脚本里要 `sort -u` 去重；`custom-columns` 对数组字段会把多个值拼在一列；JSONPath 里的 `\t` 必须写在引号内，被 shell 吃掉就粘成一串。

答题要点：JSONPath 适合取单值拼格式化输出，`custom-columns` 适合做表格，两者都不适合做逻辑判断——复杂过滤交给 `-l` 或 `jq`。

---

### Q13. patch 有哪几种类型，什么时候用哪种？【高】

| 类型 | 参数 | 语义 | 适用 |
| --- | --- | --- | --- |
| strategic merge | 默认 | 按 key 合并，list 按 `patchMergeKey`（如容器 name）局部改 | 常规改镜像、改副本数 |
| merge | `--type=merge` | RFC 7386，list **整体替换** | CRD、不支持 strategic 的资源 |
| json | `--type=json` | 按路径 `add/remove/replace/test` | 精确删除数组元素、改特定容器 |

```bash
kubectl -n app patch deploy api -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","image":"api:1.4.0"}]}}}}'
kubectl -n app patch deploy api --type=json -p '[{"op":"remove","path":"/spec/template/spec/containers/0/env/0"}]'
```

坑：CRD 没有 `patchStrategy` 元数据，用默认 patch 会**整个替换数组**，把 sidecar 冲掉；json patch 的 `path` 一旦数组下标变化就会打错位置，不如用 label 定位后 `kubectl edit`。

---

### Q14. `--force` 删除和 finalizer 到底卡在哪？【高】

- 正常删除：apiserver 打上 `metadata.deletionTimestamp`，对象进入 `Terminating`
- 若 `metadata.finalizers` 非空，**对象不会真正从 etcd 删除**，要等对应控制器摘掉 finalizer
- `kubectl delete --force --grace-period=0` 会跳过优雅终止直接删 etcd 记录，**但绕不过 finalizer 的语义**（新版本会拒绝或在 finalizer 存在时仍停在 Terminating）

常见 finalizer：`kubernetes.io/pvc-protection`（PVC 被 Pod 使用时）、`kubernetes.io/pv-protection`、`kubernetes.io/namespace-deletion`（命名空间里还有未清理资源）。

坑：手工 `patch` 掉 finalizer 虽然能让对象消失，但云上 SLB、EIP、PV 会变成孤儿资源一直计费。正确顺序永远是**先查谁该摘 finalizer，再排障它为什么不摘**。

---
## 三、Pod 生命周期与调度机制

### Q15. Pod 有哪些阶段？各阶段意味着什么？【初】

`status.phase` 只有五个值：

- `Pending`：已进 etcd，但镜像未拉完 / 卷未挂好 / 还没绑定节点
- `Running`：至少一个容器在跑（**探针没过也算 Running**，要看 `Ready` 条件）
- `Succeeded`：所有容器正常退出且不重启
- `Failed`：至少一个容器以非零码退出且不重启
- `Unknown`：kubelet 失联，apiserver 拿不到状态

**真正的判断要看 `conditions`（`PodScheduled`/`Initialized`/`ContainersReady`/`Ready`）和 `containerStatuses`**，`phase` 太粗。

坑：面试常问「Pod 是 Running 为什么还接不到流量」——答案是 `Ready=False`，Service 的 EndpointSlice 不会收录未 Ready 的 Pod（除非 `publishNotReadyAddresses`）。

---

### Q16. Init 容器和 sidecar 的启动顺序是怎样的？【中】

- Init 容器**严格串行**，前一个成功才跑下一个，全部成功后才启动业务容器
- 多个业务容器**并行**启动，无顺序保证
- 普通 sidecar（同一个 Pod 里的第二个容器）与主容器同生共死，**没有「先启动完再启动主容器」的保证**

真正要「按序启动的 sidecar」用 **原生 sidecar**（K8s 1.29+ 的 `initContainers` + `restartPolicy: Always`），它的启动早于主容器、退出晚于主容器。

```yaml
initContainers:
  - name: wait-db
    image: busybox:1.36
    command: ['sh', '-c', 'until nc -z db 5432; do sleep 2; done']
  - name: proxy            # 原生 sidecar：始终运行
    image: envoy:v1.30
    restartPolicy: Always
```

坑：Init 容器失败会让 Pod 一直 `Init:Error` / `Init:CrashLoopBackOff`，`kubectl logs` 必须加 `-c <init容器名>`；Init 容器**不支持探针**（liveness/readiness 无效）。

---

### Q17. 三种探针分别解决什么问题？参数怎么设？【中】

| 探针 | 失败后果 | 该测什么 |
| --- | --- | --- |
| `livenessProbe` | 重启容器 | 进程是否死锁、卡住 |
| `readinessProbe` | 摘流量（不进 Endpoint） | 依赖是否就绪、能否接请求 |
| `startupProbe` | 重启容器（启动期） | 慢启动应用，成功后 liveness 才开始计 |

```yaml
startupProbe:   { httpGet: { path: /healthz, port: 8080 }, failureThreshold: 30, periodSeconds: 5 }
readinessProbe: { httpGet: { path: /ready,   port: 8080 }, periodSeconds: 5,  failureThreshold: 3 }
livenessProbe:  { httpGet: { path: /healthz, port: 8080 }, periodSeconds: 10, failureThreshold: 3, timeoutSeconds: 2 }
```

坑（血泪）：**liveness 里查数据库依赖 = 自找雪崩**，DB 抖一下全集群 Pod 一起重启。liveness 只探自己进程，依赖交给 readiness。另外 `timeoutSeconds` 默认 1 秒，Java 应用 GC 停顿时极易误杀。

---

### Q18. 调度器是怎么给 Pod 挑节点的？【中】

两段式：

1. **过滤（Filter）**：资源是否够（`NodeResourcesFit`）、污点容忍（`TaintToleration`）、亲和性（`NodeAffinity`）、卷的拓扑（`VolumeBinding`）、端口冲突、`nodeSelector`
2. **打分（Score）**：`LeastAllocated`（资源最空闲优先）、`ImageLocality`（镜像已在节点加分）、`InterPodAffinity`、`TopologySpread`、`NodeAffinity` 权重
3. 选最高分，同分随机；全失败则 Pod 停在 `Pending` 并在 Events 里给出 `0/N nodes are available: ...` 的原因

```bash
kubectl -n app get events --sort-by=.lastTimestamp | grep -i failedscheduling
kubectl describe pod api-xxx | sed -n '/Events/,$p'
```

坑：`0/5 nodes are available: 5 Insufficient cpu` 是最常见的 Pending 原因；调度只看 `requests` 不看 `limits`，也不看实际用量。

---

### Q19. 节点亲和、Pod 亲和/反亲和有什么区别？【中】

- `nodeAffinity`：Pod 和**节点标签**的关系（`requiredDuringSchedulingIgnoredDuringExecution` 硬性 / `preferred...` 软性）
- `podAffinity` / `podAntiAffinity`：Pod 和**其他 Pod** 的关系，按 `topologyKey` 定义「同拓扑域」

```yaml
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector: { matchLabels: { app: api } }
        topologyKey: kubernetes.io/hostname   # 同节点只允许一个
```

坑：`required` 的反亲和在大集群里是**扩容杀手**——节点数不够时新 Pod 永远 Pending。高可用场景更该用 `topologySpreadConstraints`（带 `whenUnsatisfiable: ScheduleAnyway`），它能在「尽量分散」和「能调度」之间平衡。另外 `topologyKey` 用 `zone` 时，节点必须真有该标签，否则整个规则被跳过。

---

### Q20. 污点和容忍怎么用？NoSchedule / NoExecute 差在哪？【中】

```bash
kubectl taint node gpu-1 dedicated=gpu:NoSchedule
kubectl taint node node-3 node.kubernetes.io/unreachable:NoExecute   # 系统自动打
```

| effect | 含义 |
| --- | --- |
| `NoSchedule` | 新 Pod 不调度上来，**已存在的留下** |
| `PreferNoSchedule` | 软性，尽量不调度 |
| `NoExecute` | 新 Pod 不调度，**已存在的被驱逐**（带 `tolerationSeconds` 可延时） |

坑：容忍只是「允许」，**不保证只调度到该节点**——专用节点必须「污点 + 节点亲和/`nodeSelector`」双管齐下，否则普通 Pod 照样能来。系统污点（`node.kubernetes.io/not-ready`、`memory-pressure`）配合默认容忍 `300s`，就是节点失联后 Pod 迟迟不迁移的原因。

---

### Q21. 拓扑分布约束和 PDB 分别在解决什么问题？【高】

- `topologySpreadConstraints`：让副本均匀分布到 `zone` / `hostname`，`maxSkew` 控制容忍差值，`whenUnsatisfiable` 选 `DoNotSchedule` 或 `ScheduleAnyway`
- `PodDisruptionBudget`：限制**自愿中断**（drain、升级）时同时不可用的 Pod 数，`minAvailable` 或 `maxUnavailable`

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: api-pdb, namespace: app }
spec:
  minAvailable: 2
  selector: { matchLabels: { app: api } }
```

坑：

- PDB **只保护自愿中断**，节点宕机、OOM、`kubectl delete pod` 它管不了
- `minAvailable` 等于副本数时，`drain` 会永久卡住，必须设得比副本数小
- 分区数少于副本数时 `DoNotSchedule` 会直接导致 Pending，`maxSkew: 1` + `whenUnsatisfiable: ScheduleAnyway` 才是生产常态

---

## 四、工作负载控制器与更新

### Q22. Deployment、StatefulSet、DaemonSet、Job 各管什么场景？【初】

| 控制器 | 特点 | 典型场景 |
| --- | --- | --- |
| Deployment | 无状态、Pod 可互换、滚动更新 | Web/API 服务 |
| StatefulSet | 稳定网络标识 + 稳定存储 + 有序启停 | 数据库、消息队列、etcd |
| DaemonSet | 每节点一个（或按 nodeSelector 一部分） | 日志采集、CNI、监控 agent |
| Job / CronJob | 跑完即止 / 定时跑 | 数据迁移、离线任务 |
| ReplicaSet | Deployment 的底层实现，一般不直接建 | — |

**判据是「Pod 之间是否可互换」**：可互换用 Deployment，需要身份/顺序/独立存储就 StatefulSet。

坑：把有状态服务硬塞进 Deployment（多副本共享一个 PVC、没稳定主机名）是最常见的架构错误；DaemonSet 也不擅长「新节点先装 agent 再跑业务」这种顺序依赖。

---

### Q23. Deployment 的 revision 和 ReplicaSet 是怎么对应的？【中】

- 每次改 `spec.template` 就生成一个新的 ReplicaSet，`deployment.kubernetes.io/revision` 注解自增
- 改 `replicas`、`labels` 等**不动 template** 的字段不会产生新 revision
- `kubectl rollout history` 只保留 `revisionHistoryLimit`（默认 10）个旧 RS

```bash
kubectl -n app rollout status deploy/api --timeout=120s
kubectl -n app rollout history deploy/api --revision=3
kubectl -n app rollout undo deploy/api --to-revision=3
kubectl -n app get rs -l app=api --show-labels
```

坑：`rollout undo` 是**回滚 template**，不是回滚镜像 tag 之外的其他配置（比如 ConfigMap 内容不会一起回滚）。旧 RS 副本数为 0 但仍保留 Pod 模板，`revisionHistoryLimit: 0` 会让回滚彻底失效。

---

### Q24. `maxSurge` 和 `maxUnavailable` 怎么配才不抖？【中】

- `maxSurge`：更新期间**最多超出**期望副本数多少（可写数值或百分比）
- `maxUnavailable`：更新期间**最多不可用**多少
- 两者不能同时为 0

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0        # 先起新的、再停旧的，容量不掉
```

坑：`maxUnavailable: 0` + `maxSurge: 0` 会被 API 拒绝；副本数很小（比如 2）时百分比会向下取整成 0，导致卡住；**配置了 readinessProbe 才有意义**，否则新 Pod 一起来就被判定可用，滚动等于瞬间全切。

追问常考：`progressDeadlineSeconds`（默认 600s）超时后 Deployment 标记 `ProgressDeadlineExceeded`，但**不会自动回滚**，得靠 CI 或 Argo Rollouts 做自动判读。

---

### Q25. StatefulSet 的序号、PVC 模板和 headless Service 怎么配合？【中】

- Pod 名固定为 `<sts>-0..N-1`，DNS 为 `<pod>.<svc>.<ns>.svc.cluster.local`，**需要 `serviceName` 指向一个 headless Service（`clusterIP: None`）**
- `volumeClaimTemplates` 给每个副本生成独立 PVC `<模板名>-<sts名>-<序号>`，**删除/缩容 StatefulSet 不会删 PVC**
- 默认 `podManagementPolicy: OrderedReady`：0 号 Ready 才起 1 号；要并行改 `Parallel`

```yaml
volumeClaimTemplates:
  - metadata: { name: data }
    spec:
      accessModes: ['ReadWriteOnce']
      storageClassName: fast-ssd
      resources: { requests: { storage: 100Gi } }
```

坑：缩容后再扩容，**旧 PVC 会被重新挂上**（好事，但也意味着数据是旧的）；PVC 不会随 StatefulSet 删除，残留 PVC 会一直计费；改 `volumeClaimTemplates` 是**不可变字段**，想加盘只能新建 STS。

---

### Q26. Job 和 CronJob 的并发与清理怎么控？【中】

```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: report, namespace: app }
spec:
  schedule: '0 2 * * *'
  concurrencyPolicy: Forbid        # Allow / Forbid / Replace
  startingDeadlineSeconds: 300     # 错过多久内还补跑
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 2
  jobTemplate:
    spec:
      backoffLimit: 3
      activeDeadlineSeconds: 1800
      ttlSecondsAfterFinished: 3600
      template:
        spec:
          restartPolicy: Never     # Job 只能用 Never / OnFailure
          containers: [{ name: r, image: report:1.2 }]
```

坑：`concurrencyPolicy: Allow` + 任务跑得比周期长 → 任务堆积把集群打满；`ttlSecondsAfterFinished` **依赖 TTL 控制器**，老版本要开 feature gate；CronJob 的时间按 **controller-manager 所在节点时区**（默认 UTC），国内要显式设 `timeZone: Asia/Shanghai`。

---

### Q27. HPA 怎么算副本数？为什么总在抖？【中】

公式：`期望副本 = ceil(当前副本 × 当前指标值 / 目标值)`，`tolerance` 默认 10%，波动小于 10% 不动作。

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: api, namespace: app }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 60 } }
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies: [{ type: Percent, value: 10, periodSeconds: 60 }]
```

坑：

- CPU 指标依赖 `requests`，**没设 requests 的 Pod 永远不扩**
- 默认 15s 一次、指标有延迟，突发流量来不及；应对是「预热副本 + `behavior.scaleUp` 放开 + KEDA/预测式扩容」
- 内存型指标不适合做 HPA（内存不会自己降），扩了也缩不回来

---

### Q28. HPA 和 VPA 能一起用吗？【高】

**可以，但绝不能同时作用于同一个指标（CPU/内存）**，否则会互相打架：VPA 改 requests → HPA 的利用率分母变化 → HPA 忽扩忽缩。

可行组合：

- HPA 用 CPU/自定义指标控制副本数，VPA 用 `updateMode: Off` 只做**推荐值**（先观察再手改 requests）
- HPA 用 QPS 等业务指标 + VPA 管内存（内存是「调参型」资源，扩容无效）
- 垂直扩容需要重启 Pod（`Auto` 模式下），对延迟敏感的服务用 `InPlaceOrRecreate`（1.33+ 试验特性）或干脆不用

坑：VPA 的 `Auto` 模式在大集群会产生大量驱逐，极易被误判成节点故障；VPA 需要 metrics-server + recommender + updater + admission 四件套，Helm 装漏一个就静默不生效。

---
## 五、服务发现与集群网络

### Q29. 四种 Service 类型分别怎么工作？【初】

| 类型 | 暴露范围 | 实现 |
| --- | --- | --- |
| `ClusterIP` | 集群内 | 分配虚拟 IP，kube-proxy 下发转发规则 |
| `NodePort` | 集群外（节点端口） | 在 ClusterIP 基础上占用 `30000-32767` 端口 |
| `LoadBalancer` | 集群外（云 LB） | 控制器向云 API 申请 SLB，回填 `status.loadBalancer` |
| `ExternalName` | — | 只返回一条 CNAME，**没有任何代理** |

```bash
kubectl -n app expose deploy api --type=NodePort --port=80 --targetPort=8080
kubectl -n app get svc api -o wide
kubectl -n app get endpointslice -l kubernetes.io/service-name=api
```

坑：`ExternalName` 的解析在**客户端**完成，集群内 kube-dns 直接返回 CNAME，所以不参与 Service 的负载均衡，也没有 ClusterIP；`externalTrafficPolicy: Local` 能保留真实源 IP，但会让没有 Pod 的节点直接丢包。

---

### Q30. CoreDNS 的解析链路是怎样的？`ndots:5` 有什么坑？【高】

Pod 里 `/etc/resolv.conf` 大致是：

```text
search app.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

解析 `redis` 时，因为点数 < `ndots`，客户端会**先尝试补全 search 域**（最多 6 次查询：4 个 search 域带 A/AAAA），全部 NXDOMAIN 才查原始名字。解析外部域名 `api.github.com` 有 3 个点，仍然 < 5，所以也走 search 链——**一个外部域名可能产生 8 次 DNS 查询**，高并发下直接打爆 CoreDNS。

对策：

- 外部域名写成全限定 `api.github.com.`（末尾加点，跳过 search）
- 调小 `dnsConfig.options: [{ name: ndots, value: '2' }]`
- `NodeLocal DNSCache` 缓存 + 降延迟

坑：`ndots` 太大（默认 5）是大量 `UDP 53 timeout` 的元凶；CoreDNS 只有 2 副本时极易被节点级并发打满，要看 `coredns_dns_requests_total` 和 `coredns_cache_hits_total`。

---

### Q31. iptables、IPVS、nftables 三种 kube-proxy 模式怎么选？【中】

| 模式 | 原理 | 规模表现 |
| --- | --- | --- |
| `iptables` | 线性匹配 chain，随机概率做负载均衡 | Service > 1000 时规则膨胀、同步慢 |
| `ipvs` | 内核哈希表，O(1) 查找，支持 rr/lc/sh 等调度算法 | 万级 Service 仍平稳，生产首选 |
| `nftables` | 集合 + 原生 NAT，规则同步快 | 较新（1.29+ alpha/1.31 beta），替代方向 |

```bash
kubectl -n kube-system logs -l k8s-app=kube-proxy --tail=20
ipvsadm -Ln | head -20          # 节点上看 IPVS 规则
```

坑：切 IPVS 后**要确认 `ip_vs` 系列内核模块已加载**，很多发行版默认不加载导致规则为空、Service 直接不通；IPVS 模式还要配 `strictARP: true` 才能和 IPVS 的 `--ipvs-exclude-cidrs` 一起正常回源。

---

### Q32. CNI 到底负责什么？常见插件怎么选？【中】

CNI 只做三件事，**不管 Service 转发**：

1. 给 Pod 创建网络命名空间并分配 IP（IPAM）
2. 建 veth 对、接网桥或路由、下发路由到其他节点
3. 执行 `ADD` / `DEL` / `CHECK`，并为 NetworkPolicy 提供实现（可选）

| 插件 | 特点 |
| --- | --- |
| Calico | BGP 路由，成熟、支持 NetworkPolicy，运维门槛低，大集群首选 |
| Cilium | eBPF，可替换 kube-proxy，L7 策略 + 可观测性强，版本耦合高 |
| Flannel | 简单（VXLAN/host-gw），**不支持 NetworkPolicy** |
| Antrea / Kube-OVN | 基于 OVS，贴近传统网络运维习惯 |

坑：装 CNI 前节点一定处于 `NotReady`（`cni plugin not initialized`）；**换 CNI 等于重建网络**，存量 Pod 必须全部重建；MTU 不一致（VXLAN 要减 50）会表现为「小包通、大包丢」这种极难排查的故障。

---

### Q33. 同一个节点上的两个 Pod 是怎么通信的？【中】

默认走 **网桥 / veth 对**，不经过 kube-proxy：

- 每个 Pod 有自己的 netns 和 eth0（veth 一端），另一端在宿主 `cni0` / `cali*` 这类网桥上
- 同网段直接二层转发，不查 Service 规则
- 跨节点则依赖 CNI 建立的路由/隧道（BGP、VXLAN、IPIP）

```bash
kubectl -n app exec api-0 -- ip -4 addr show eth0
nsenter -t $(pidof containerd-shim) -n ip route   # 节点上排查
crictl pods && crictl inspectp <id> | grep -i netns
```

坑：**Pod 间通信默认不做任何隔离**，同集群任意 Pod 能访问任意 Pod（含 kube-system），安全组管不到，必须靠 NetworkPolicy；`--network-plugin=cni` 缺失时 kubelet 会用 host 网络兜底，表现为「Pod IP 就是节点 IP」。

---

### Q34. NetworkPolicy 的选择器语义和「默认拒绝」怎么落地？【高】

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-api-from-gw, namespace: app }
spec:
  podSelector: { matchLabels: { app: api } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: ingress } }
          podSelector: { matchLabels: { app: nginx } }
      ports: [{ protocol: TCP, port: 8080 }]
  egress:
    - to: [{ namespaceSelector: { matchLabels: { name: kube-system } } }]
      ports: [{ protocol: UDP, port: 53 }]
```

- 一个 Pod 被**任一**策略选中即进入「默认拒绝」，策略之间是**并集（allow 列表）**
- `from` 里数组的每一项之间是 **OR**，同一项里的 `namespaceSelector` + `podSelector` 是 **AND**

坑：

- 忘了放行 DNS（UDP 53）是最经典的翻车，表现为整个命名空间解析超时
- 没有 `policyTypes` 时会根据规则推断，空 `ingress: []` 和「没写 ingress」语义不同
- NetworkPolicy 只是**声明**，Flannel、纯 host-gw 等插件根本不实现，写了也不生效

---

## 六、Ingress、网关与流量治理

### Q35. Ingress、IngressClass 和 Ingress Controller 是什么关系？【初】

- `Ingress`：路由规则声明（域名 + 路径 → Service）
- `IngressClass`：标记「这批 Ingress 归哪个控制器实现」，通过 `spec.ingressClassName` 或注解 `kubernetes.io/ingress.class` 关联
- `Ingress Controller`：真正干活的程序（nginx-ingress、Traefik、ALB Controller…），watch Ingress 后生成自己的配置

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: api, namespace: app }
spec:
  ingressClassName: nginx
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: api, port: { number: 80 } } }
```

**Ingress 自己不转发任何流量**，没有对应 Controller 时它只是一份没人读的 yaml。坑：`pathType` 1.22 后必填，`Prefix` 按路径段匹配（`/api` 不匹配 `/apix`），`ImplementationSpecific` 各控制器行为不同。

---

### Q36. Ingress Controller 怎么选？【中】

| 方案 | 优势 | 代价 |
| --- | --- | --- |
| ingress-nginx | 生态最全、注解最多、案例最多 | 注解沦为配置垃圾场；reload 有抖动 |
| Traefik | 自动服务发现、内置中间件 | 复杂规则表达弱于 nginx |
| Envoy Gateway / Istio Gateway | 标准 API、L7 治理强 | 资源开销大、运维门槛高 |
| 云厂商 Controller | 与 SLB/WAF/证书托管打通 | 厂商锁定、成本高 |

选型看三件事：**要不要 L7 灰度与限流**（要就上 Gateway API / Service Mesh）、**团队会不会写 Lua/OpenResty**、**是否必须和云上 WAF 打通**。中小团队 `ingress-nginx` 仍是性价比最高的默认答案。

---

### Q37. 注解式配置（annotation）的痛点是什么？为什么要迁 Gateway API？【高】

痛点：

- 几十个注解没有 schema 校验，写错只会在 controller 日志里静默失效
- 每家的注解名不同（`nginx.ingress.kubernetes.io/...`），**换控制器等于重写路由**
- 一个 Ingress 只能挂一个 Controller，多团队共用 LB 时无法做职责划分
- 超时、重试、限流、鉴权全塞注解，配置不可复用、不可组合

Gateway API 的改进：`GatewayClass` / `Gateway` / `HTTPRoute` **角色分离**（基础设施团队管 Gateway、业务团队管 Route），原生支持 header 匹配、权重分流、流量镜像，且有 CRD schema 校验。

坑：迁移不是免费的，`HTTPRoute` 的表达力虽强但各实现（Envoy Gateway、Cilium、Istio）覆盖度不一，能力矩阵要实测。

追问常考：超大 Ingress 让 nginx 频繁 reload 怎么办？（答案：开 `--watch-ingress-without-class`、拆多个 Controller、或直接换 Envoy 系的动态配置。）

---

### Q38. 超时、重试、限流应该放在哪一层？【高】

| 治理点 | 推荐位置 | 理由 |
| --- | --- | --- |
| 超时 | 网关 + 客户端 SDK | 网关兜底防雪崩，SDK 层能感知语义 |
| 重试 | 网关（只重试幂等请求）+ SDK | 盲目重试会放大故障 |
| 限流 | 网关做粗粒度（按 IP/租户），服务内做细粒度 | 网关扛住流量洪峰 |
| 熔断降级 | 服务内 / Service Mesh | 需要感知下游错误率 |

```yaml
# ingress-nginx 侧常见配置
metadata:
  annotations:
    nginx.ingress.kubernetes.io/proxy-connect-timeout: '5'
    nginx.ingress.kubernetes.io/proxy-read-timeout: '60'
    nginx.ingress.kubernetes.io/proxy-next-upstream: 'error timeout http_502'
    nginx.ingress.kubernetes.io/limit-rps: '200'
```

坑：`proxy-read-timeout` 默认 60s，长轮询/大文件必超时；**重试次数和超时是乘法关系**（3 次 × 60s = 180s），别让用户在网关就等三分钟。

---

### Q39. 灰度发布和流量镜像怎么做？【高】

- **金丝雀**：Gateway API 的 `backendRefs` 带 `weight`，或 ingress-nginx 的 `canary` 系列注解
- **按 header / 用户**：`HTTPRoute` 的 `matches.headers` 精确路由
- **流量镜像**：`RequestMirror` filter 把请求复制一份到新版本，**只看响应不使用**，用来验证新版本行为

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
spec:
  rules:
    - backendRefs:
        - name: api-v1
          port: 80
          weight: 90
        - name: api-v2
          port: 80
          weight: 10
```

坑：金丝雀只调权重不看指标等于赌博，必须和 Prometheus 的错误率/延迟联动（Argo Rollouts 的 `AnalysisTemplate`）；流量镜像会让新版本**收到生产写请求**，如果没有幂等或影子库，会把脏数据写进去。

---

### Q40. TLS 证书在哪终止？长连接怎么处理？【中】

- 证书用 `Secret`（`tls.crt` / `tls.key`）挂给 Controller，在**入口处终止**最常见
- 需要端到端加密时用 `ssl-passthrough`（只支持 SNI，无法按路径路由）或重加密（backend TLS）
- 证书自动化：`cert-manager` + `ClusterIssuer`（ACME），续期靠 watch 到期时间

长连接要点：

- `websocket` 需要 `Upgrade` 头透传，nginx 要 `proxy_http_version 1.1` + `Connection ""` 清空
- `proxy-read-timeout` 必须大于心跳间隔，否则空闲连接被切
- 滚动更新时设 `terminationGracePeriodSeconds` 并处理 `SIGTERM`，否则在线连接直接被断

坑：`LoadBalancer` 类型的 Service 在更新期可能重建 LB，导致 VIP 变化；`cert-manager` 的 `HTTP01` 校验在 NetworkPolicy 默认拒绝下会失败，要放行 `/.well-known/acme-challenge`。

---
## 七、存储、PV 与 CSI

### Q41. emptyDir、hostPath、PV、PVC、StorageClass 是什么关系？【初】

| 对象 | 生命周期 | 用途 |
| --- | --- | --- |
| `emptyDir` | 随 Pod 删除 | 容器间共享临时目录、缓存 |
| `hostPath` | 跟节点走 | 采集宿主机日志、特殊 agent，**生产慎用** |
| `PV` | 集群级资源，独立于 Pod | 一块具体的存储 |
| `PVC` | 命名空间级，用户的申请单 | 声明「我要 100Gi、ReadWriteOnce」 |
| `StorageClass` | 集群级模板 | 定义供给者（provisioner）和参数，**动态供给靠它** |

绑定关系：PVC 找 PV 靠 `storageClassName` + 容量 + 访问模式匹配；有 StorageClass 且 `provisioner` 存在时**先建 PVC 再自动建 PV**。

坑：`hostPath` 无法做资源隔离和配额，且 Pod 迁移后数据留在旧节点；`emptyDir` 默认写节点磁盘，`medium: Memory` 时吃内存并计入 Pod 的 `memory` limit。

---

### Q42. 三种访问模式实际意味着什么？【中】

- `ReadWriteOnce`（RWO）：**单节点**读写，同节点的多个 Pod 可共享
- `ReadOnlyMany`（ROX）：多节点只读
- `ReadWriteMany`（RWX）：多节点读写，**只有 NFS/CephFS/EFS 这类共享文件系统支持**
- `ReadWriteOncePod`（RWOP，1.22+）：单 Pod 独占，解决同节点多 Pod 抢同一块盘

坑（高频）：把 RWO 的云盘挂给两个副本的 Deployment，第二个 Pod 会 `Multi-Attach error` 一直 Pending——因为 RWO 限制的是**节点**，两个副本被调度到不同节点就必然冲突。RWX 需求要提前选存储类，别上线才发现云盘不支持。

---

### Q43. PV 的回收策略有哪些？删了 PVC 数据会丢吗？【初】

- `Retain`：PV 保留，状态变 `Released`，数据还在，需人工清理后重建 PV
- `Delete`：连带删除后端存储（云盘、Ceph image），**默认值**
- `Recycle`：已被废弃（只支持 NFS）

`persistentVolumeReclaimPolicy` 在 PV 上；动态供给时由 StorageClass 的 `reclaimPolicy` 决定，**默认是 `Delete`**。

坑：生产把数据库跑在默认 StorageClass 上，删一个 PVC 就把库删了——**有状态存储的 StorageClass 一定显式写 `reclaimPolicy: Retain`**，并配 `velero` 做卷备份。另外 `Retain` 的 PV 变 `Released` 后不能重新绑定，要手工删掉 `claimRef`。

---

### Q44. 动态供给（dynamic provisioning）的完整流程？【中】

1. 用户创建 PVC，指定 `storageClassName`
2. `kube-controller-manager` 里的 `external-provisioner`（CSI sidecar）watch 到未绑定的 PVC
3. 调 CSI 驱动的 `CreateVolume`，在存储侧创建卷
4. 创建 PV 对象并绑定 PVC（`volume.kubernetes.io/selected-node` 注解参与拓扑决策）
5. Pod 调度时 `VolumeBinding` 插件按 PV 的 `nodeAffinity` 过滤节点，然后 `ControllerPublishVolume` + 节点侧 `NodeStageVolume`/`NodePublishVolume`

```bash
kubectl get sc
kubectl -n app get pvc -o wide
kubectl -n app describe pvc data-0        # 看 Events 卡在哪一步
```

坑：`WaitForFirstConsumer`（延迟绑定）能解决跨 AZ 卷和 Pod 调度不一致的问题，但**默认 `Immediate` 会先把卷建在随机 AZ**，Pod 只能去那个 AZ，进而引发 Pending。

---

### Q45. StatefulSet 挂盘的顺序和坑？【中】

- `volumeClaimTemplates` 按序号生成 PVC：`data-web-0`、`data-web-1`…
- `OrderedReady` 下 0 号先起、Ready 后才有 1 号，**和 PVC 绑定顺序一致**
- 缩容**不删 PVC**，扩容时复用同名 PVC

坑：跨 AZ 场景下 PVC 已绑定在 AZ-a，而调度器把所有节点排除了，Pod 永远 Pending（Events 里是 `node(s) had volume node affinity conflict`）；想换存储类得先删 PVC 再重建，而删 PVC 会触发 `pvc-protection` finalizer，必须先把 Pod 停掉。

---

### Q46. 卷扩容和快照怎么做？【中】

**扩容**：`allowVolumeExpansion: true` 的 StorageClass 才能改 `pvc.spec.resources.requests.storage`，改大后：

- 只支持「扩不能缩」
- 文件系统扩容（`resizefs`）需要 Pod 重建或由 CSI 在线完成，取决于驱动
- 云盘还有「每 6 小时只能扩一次」之类的限制

**快照**：

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata: { name: data-0-snap, namespace: app }
spec:
  volumeSnapshotClassName: csi-snapclass
  source: { persistentVolumeClaimName: data-0 }
```

坑：快照**不是备份**——同一存储池的快照和源卷一起丢；恢复要先 `VolumeSnapshotContent` 还原成新 PVC，再挂到新 Pod，不能原地覆盖；`snapshot-controller` 和 CSI `external-snapshotter` 两个组件缺一不可。

---

### Q47. Pod 挂不上盘，你会按什么顺序查？【中】

```bash
kubectl -n app describe pod api-0 | sed -n '/Volumes/,$p'
kubectl -n app get events --sort-by=.lastTimestamp | tail -20
kubectl -n app get pvc,pv
kubectl get csidrivers
kubectl -n kube-system logs ds/csi-node --tail=50
```

判断依据：

| 现象 | 原因 |
| --- | --- |
| `Multi-Attach error for volume` | RWO 卷被另一节点占用（旧 Pod 没死透/节点失联） |
| `volume node affinity conflict` | 卷在 AZ-a，Pod 被调度到 AZ-b |
| PVC 一直 `Pending` | 没匹配的 StorageClass / 配额不足 / provisioner 没跑 |
| `failed to mount` / `timeout` | CSI node 插件异常、挂载点残留、NFS 网络不通 |
| `pvc-protection` 卡删除 | 还有 Pod 在用 |

坑：节点异常掉线后 RWO 卷会被「幽灵占用」，新 Pod 卡 Multi-Attach；处理是确认旧节点真的下线后删掉残留的 `VolumeAttachment`，**不要直接删 PV**。

---

## 八、配置、密钥与镜像拉取

### Q48. ConfigMap 和 Secret 怎么注入？什么时候会热更新？【中】

四种注入方式：环境变量（`envFrom` / `valueFrom`）、命令行参数、volume 挂载、`subPath` 单文件挂载。

**热更新边界（必背）**：

| 方式 | 会热更新吗 |
| --- | --- |
| 整个 ConfigMap 挂成 volume | **会**（kubelet 同步周期约 1 分钟，且应用要自己重读文件） |
| `subPath` 挂单个文件 | **不会** |
| 环境变量 | **不会**，必须重建 Pod |

坑：Java/Go 应用通常启动时只读一次配置，所以「热更新」在应用层也是假的——要么应用监听文件变化，要么用 `checksum/config` 注解触发滚动更新（Helm 的 `sha256sum` 技巧）。

---

### Q49. Secret 安全吗？`base64` 算什么加密？【中】

- Secret **只做 base64 编码**，不是加密；有 etcd 读权限就等于有全部密钥
- 真正的加固：etcd 静态加密（`EncryptionConfiguration`）、RBAC 收紧、开 `--encryption-provider-config`
- 更彻底：External Secrets Operator / Vault CSI Driver，Secret 不进 etcd

```yaml
# EncryptionConfiguration 关键片段
resources:
  - resources: [secrets]
    providers:
      - aescbc: { keys: [{ name: key1, secret: <base64-32字节> }] }
      - identity: {}
```

坑：`kubectl get secret -o yaml` 直接 `base64 -d` 就出明文，所以别把 Secret 提交进 Git；`stringData` 只是写入时的便利字段，读出来永远是 `data`。

---

### Q50. 配置改了怎么触发滚动更新？env 和 volume 怎么选？【中】

| 方式 | 优点 | 缺点 |
| --- | --- | --- |
| env | 简单、显式 | **不热更新**，改一次要重启 |
| volume | 可热更新 | 多一层文件读取逻辑，权限/属主易踩坑 |

触发滚动的手段：

```bash
# 1) 改注解打散 template hash
kubectl -n app patch deploy api -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"config/version\":\"$(date +%s)\"}}}}}"
# 2) 直接用 rollout restart（本质同上，官方注解）
kubectl -n app rollout restart deploy/api
# 3) Helm 里自动算 checksum
# annotations: { checksum/config: {{ include (print $.Template.BasePath "/cm.yaml") . | sha256sum }} }
```

坑：`rollout restart` 会新建 RS，**revision 会涨**，`rollout undo` 时别把这次也算进去；ConfigMap 名带 hash 后缀（`cm-v2`）是更干净的做法，天然触发更新且可回滚。

---

### Q51. 私有仓库拉镜像的几种姿势？【中】

1. `imagePullSecrets`：命名空间内建 `docker-registry` 类型的 Secret，Pod 或 ServiceAccount 引用
2. **节点级凭据**：把 `.docker/config.json` 放到节点 `/var/lib/kubelet/config.json`，或配 `--image-credential-provider-config`
3. 云厂商免密：ECR/ACR 的 credential provider 插件，自动换取短期 token

```bash
kubectl -n app create secret docker-registry regcred \
  --docker-server=harbor.example.com --docker-username=robot --docker-password='***'
kubectl -n app patch sa default -p '{"imagePullSecrets":[{"name":"regcred"}]}'
```

坑：Secret 绑在**命名空间**，跨 ns 拉不到；token 过期后报 `401 Unauthorized`，但错误常被显示成 `ImagePullBackOff`，要看 `kubectl describe pod` 的 Events 细节。节点级凭据省事但**全节点可见**，多租户下不能用。

---

### Q52. 为什么我的 Pod 一直 ImagePullBackOff？【中】

按顺序检查：

```bash
kubectl -n app describe pod api-xxx | sed -n '/Events/,$p'
# 1) 镜像名/tag 错，或 tag 不存在（latest 也会 404）
# 2) 私有仓库要认证：no basic auth credentials
# 3) 网络不通：节点出网被限、代理、DNS
crictl pull harbor.example.com/app/api:1.2.3   # 节点上直接试
```

| 错误 | 含义 |
| --- | --- |
| `manifest unknown` | tag 不存在 |
| `unauthorized` | 缺凭据或凭据过期 |
| `i/o timeout` / `TLS handshake timeout` | 网络/证书问题 |
| `toomanyrequests` | 被仓库限流（Docker Hub 常见） |

坑：`ImagePullBackOff` 会指数退避，最长 5 分钟，所以修好凭据后别急着重启，等一下或删 Pod 重建；另外 `IfNotPresent` 在 tag 不变时**不会重新拉**，用 `Always` 或改 digest。

---

### Q53. 多环境配置怎么管？配置漂移怎么防？【高】

三种主流管法，按团队规模选：

| 方式 | 做法 | 适用 |
| --- | --- | --- |
| 目录分环境 | `overlays/dev`、`overlays/prod` 各放一份 yaml | 环境少、差异大 |
| Kustomize overlay | base 一份，overlay 只写 patch | 环境多、差异小（**推荐**） |
| Helm values | 同 chart，`values-dev.yaml` / `values-prod.yaml` | 需要模板逻辑 |

铁律：**镜像 tag 走变量，其余同源**，多环境之间只允许 ConfigMap、副本数、资源、域名不同。

```bash
kubectl diff -f overlays/prod/          # 有差异就 fail，不许对着集群手改
kubectl apply -f overlays/prod/ --server-side --field-manager=ci
```

防漂移靠四件事：**Git 是唯一真相**，集群只允许 CI 写入（RBAC 只给 CI 的 SA）；`kubectl edit` 一律禁止；定期 `kubectl diff` 巡检；生产开审计日志。

坑：`apply` 是**三路合并**，只回收自己管过的字段，手工加的字段删不掉——这就是「yaml 里的 env 删了集群里还在」的根因，要明确归属得用 `--server-side`。改了 ConfigMap 却没触发滚动时，老 Pod 和新版本混跑，`kubectl diff` 也看不出来。

答题要点：同源 + 差异最小化 + 只有 CI 能写 + 有闸门能发现。

---
## 九、认证、授权与准入控制

### Q54. 访问 apiserver 的认证方式有哪几种？【中】

| 方式 | 说明 | 典型场景 |
| --- | --- | --- |
| 客户端证书 | `X509`，CN 用作用户名、O 用作组 | kubelet、控制面组件 |
| Bearer Token | ServiceAccount JWT / bootstrap token | Pod 内进程 |
| OIDC | 对接企业 IdP，短期 token | 人（`kubectl`） |
| Webhook | 外部服务做认证 | 特殊对接 |

ServiceAccount Token 现在有两种：**长期 Secret 型（不推荐）**和 **`TokenRequest` 短期投射卷（默认，自动轮换）**。

坑：`--anonymous-auth=true`（1.19+ 默认 false）配合宽松 RBAC 会造成未授权访问；证书里的 CN/O 写错，认证能过但授权全 403，排查时先 `kubectl auth whoami`。

---

### Q55. RBAC 的四要素是什么？Role 和 ClusterRole 差在哪？【初】

四要素：**Subject（谁）× Verb（能做什么）× Resource（对什么）× Scope（范围）**

- `Role` / `RoleBinding`：命名空间级
- `ClusterRole` / `ClusterRoleBinding`：集群级；**ClusterRole 也能被 RoleBinding 引用**，此时只在该命名空间内生效（常用技巧）
- Verb：`get list watch create update patch delete deletecollection`

```bash
kubectl create role pod-reader --verb=get,list,watch --resource=pods -n app
kubectl create rolebinding alice-pod-reader --role=pod-reader --user=alice -n app
kubectl auth can-i delete pods -n app --as=alice
kubectl auth can-i --list -n app --as=alice
```

坑：`resources: [pods/log]` 和 `pods/exec` 是子资源，**必须单独授权**；`deletecollection` 很容易被忽略，给了 `get/list` 不等于能批量删。

---

### Q56. 怎么做最小权限？有哪些坑必须避开？【中】

原则：

1. 一人/一服务一 SA，**不要共用 `default` SA**
2. 优先 RoleBinding + ClusterRole（限定命名空间），尽量少用 ClusterRoleBinding
3. 拒绝通配：`resources: ["*"]`、`verbs: ["*"]` 等于 admin
4. 用 `aggregate-to-edit` 之类的标签聚合规则，而不是复制粘贴
5. 权限上线前用 `kubectl auth can-i --list` / `rakkess` 出一份权限清单做 review

高危权限清单：`secrets: get`（等于全集群钥匙）、`pods/exec`（等于进容器）、`pods: create`（可挂 hostPath 逃逸）、`escalate`/`bind`（能给自己提权）、`certificatesigningrequests/approval`（可伪造证书）。

坑：**给 `create pod` 就等于给节点 root**——Pod 能挂 `hostPath: /`；`impersonate` 权限能让任何用户伪装成 admin。

---

### Q57. 准入控制器和 webhook 在链路里的位置？【高】

```text
认证 → 授权 → MutatingAdmissionWebhook → 对象 schema 校验 → ValidatingAdmissionWebhook → 写入 etcd
```

- 内置准入：`NamespaceLifecycle`、`ResourceQuota`、`LimitRanger`、`PodSecurity`、`ServiceAccount`、`DefaultStorageClass`、`MutatingAdmissionWebhook`、`ValidatingAdmissionWebhook`
- 动态准入：`MutatingWebhookConfiguration` / `ValidatingWebhookConfiguration`，也可以用 `ValidatingAdmissionPolicy`（CEL，1.30 GA）避免外部依赖

```bash
kubectl get mutatingwebhookconfigurations
kubectl get validatingwebhookconfigurations
```

坑：webhook 挂了（`failurePolicy: Fail`）会导致**全集群无法创建资源**，这是最经典的自伤，救火方式是临时改成 `Ignore` 或删掉配置；`sideEffects: None` 声明错误会让 dry-run 失败；`namespaceSelector` 忘了排除 `kube-system` 会把系统组件也拦死。

---

### Q58. PSA 和 PodSecurityPolicy 的关系？多租户怎么隔离？【高】

- PSP 已废弃（1.25 移除），继任者是内置的 **Pod Security Admission**，按命名空间标签生效：

```yaml
metadata:
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/audit: baseline
```

- 三档：`privileged` < `baseline` < `restricted`（restricted 要求非 root、禁特权、必须 `seccompProfile`、只读根文件系统）

多租户分层：**命名空间 + RBAC + ResourceQuota + NetworkPolicy + PSA** 是逻辑隔离，**独立集群或 vCluster / 独立节点池**是物理隔离。

坑：给已运行工作负载的命名空间直接 `enforce: restricted` 会让新 Pod 全部被拒（老 Pod 不受影响），必须先 `warn`+`audit` 观察一段时间。

---

### Q59. 审计日志怎么开、怎么看？【中】

apiserver 的 `--audit-policy-file` 定义规则，`--audit-log-path` 落地：

```yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  - level: None
    users: ['system:kube-proxy']
  - level: Metadata
    resources: [{ group: '', resources: [pods, services] }]
  - level: RequestResponse        # 只对敏感资源记请求体
    resources: [{ group: '', resources: [secrets] }]
  - level: Metadata
```

级别：`None` < `Metadata` < `Request` < `RequestResponse`。坑：`RequestResponse` 全开会让日志暴涨几个数量级，还会把 Secret 明文写进日志；审计日志要单独轮转（`--audit-log-maxage`），并注意它会拖慢 apiserver。

---

## 十、资源管理、QoS 与弹性伸缩

### Q60. requests 和 limits 到底影响什么？【初】

| 字段 | 作用 |
| --- | --- |
| `requests.cpu` | 调度依据 + **CPU 权重的基准**（cgroup `cpu.shares`） |
| `requests.memory` | 调度依据 + QoS 判定 |
| `limits.cpu` | 硬上限，靠 CFS 配额（`cpu.cfs_quota_us`）**限流**，不杀进程 |
| `limits.memory` | 硬上限，超了直接 **OOMKilled** |

坑：CPU 超 limit 表现是「变慢」不再是「报错」，所以 `limits.cpu` 设太低会引发**节流**（`container_cpu_cfs_throttled_seconds_total` 飙升），P99 毛刺但 CPU 使用率看着不高——这是最容易被误判的故障。

---

### Q61. CPU throttling 怎么发现和缓解？【中】

```bash
# 单 Pod 节流比例
rate(container_cpu_cfs_throttled_periods_total{namespace="app"}[5m])
  / rate(container_cpu_cfs_periods_total{namespace="app"}[5m])
# 容器里直接看
cat /sys/fs/cgroup/cpu.stat | grep throttled
```

缓解：

1. `limits.cpu` 抬高，或直接**去掉 CPU limit（只留 requests）**——很多团队的做法
2. `requests` 按实际 P95 设，别一刀切
3. 多线程/GC 型应用要留意 `cpu.cfs_period_us` 与线程数不匹配（100ms 周期内 8 线程抢 1 核）

坑：只删 limit 不涨 requests 会让节点超卖更严重；Java 应用由于 `Runtime.availableProcessors()` 看 limit，`-XX:ActiveProcessorCount` 不设会导致线程池按 limit 配置却拿不到那么多 CPU。

---

### Q62. QoS 三档和驱逐顺序？【初】

| QoS | 条件 | 驱逐优先级 |
| --- | --- | --- |
| `Guaranteed` | 每个容器 cpu/memory 的 request == limit | 最低（最后被驱逐） |
| `Burstable` | 至少一个容器设了 request/limit 但不相等 | 中 |
| `BestEffort` | 所有容器都没设 request/limit | 最高（先被驱逐） |

同一档内，**按「用量超出 request 的程度」排序**驱逐（`oom_score_adj` 与 `evictionRank`）。

坑：只想设 `limits` 不设 `requests` 时，K8s 会自动把 requests 补成 limits（默认行为），结果 QoS 变成 Guaranteed、调度也更占资源；想清楚再写。

---

### Q63. 节点压力驱逐有哪些信号？【中】

`kubelet` 的 `--eviction-hard` / `--eviction-soft`：

| 信号 | 默认硬阈值 | 含义 |
| --- | --- | --- |
| `memory.available` | `<100Mi` | 内存不足 |
| `nodefs.available` | `<10%` | 根盘可用空间 |
| `imagefs.available` | `<15%` | 镜像盘空间 |
| `pid.available` | `<10%` | 进程数（fork 炸弹） |

```bash
kubectl describe node node-1 | sed -n '/Conditions/,/Addresses/p'
# MemoryPressure / DiskPressure / PIDPressure / NetworkUnavailable
```

坑：`nodefs` 满了最先崩的是 kubelet 自己（容器日志、死容器、未使用镜像都占盘），所以节点要配 `imageGC` 和日志轮转；`Evicted` 的 Pod 事件在 `kubectl get events` 里保留时间很短，事后往往只能靠监控。

---

### Q64. LimitRange 和 ResourceQuota 分别管什么？【中】

- `LimitRange`：**单个 Pod/容器的默认值与上下限**（没写 requests/limits 时自动补）
- `ResourceQuota`：**命名空间总量**（cpu/memory/pods/pvc 数量、`requests.storage`）

```yaml
apiVersion: v1
kind: ResourceQuota
metadata: { name: app-quota, namespace: app }
spec:
  hard:
    requests.cpu: '20'
    requests.memory: 40Gi
    limits.cpu: '40'
    pods: '100'
```

坑：配额一旦设了 `requests.cpu`，**没写 requests 的 Pod 会被直接拒绝**（除非 LimitRange 补默认值）——很多「突然创建不了 Pod」就是这么来的；`ResourceQuota` 是命名空间级，不能管跨 ns 的聚合。

---

### Q65. 集群扩容为什么总是慢？超卖比例怎么定？【中】

自建 `cluster-autoscaler` 的链路：Pod Pending → CA 每 10s 扫一次 → 模拟调度找到不合适 → 调云 API 扩节点组 → **节点注册（1~3 分钟）→ 装 CNI/agent → 镜像拉取**。冷启动动辄 3~5 分钟，对突发流量完全不够。

对策：

- 预留 **buffer 节点**（`--scale-down-delay-after-add`、`--expander=least-waste`）
- 用 Karpenter / 阿里云弹性伸缩的「预测扩容」，或在协议层做排队
- 镜像预热（DaemonSet 预拉）、缩小镜像体积（别在启动时下载依赖）

超卖：`requests` 总量 / 节点可分配容量。生产一般 **CPU 1.0~1.5 倍、内存 1.0 倍**，宁可多留；`BestEffort` Pod 越多，节点 OOM 风险越高。

---

## 十一、节点运维与集群升级

### Q66. 节点 NotReady，按什么顺序查？【高】

```bash
kubectl describe node node-1 | sed -n '/Conditions/,/Addresses/p'
kubectl -n kube-system get pods -o wide | grep node-1
ssh node-1
systemctl status kubelet
journalctl -u kubelet -n 200 --no-pager
df -h /var/lib/kubelet /var/lib/containerd
free -m && uptime
```

判断顺序：

1. **kubelet 进程在不在**（被 OOM、配置错误、证书过期都会退出）
2. **容器运行时**：`systemctl status containerd`、`crictl info`
3. **磁盘/内存压力**：`DiskPressure` 会让节点直接 NotReady
4. **网络**：kubelet 连不上 apiserver（证书、VIP、防火墙）
5. **CNI 未就绪**：`runtime network not ready: cni plugin not initialized`
6. **时钟**：`--node-status-update-frequency` 与 apiserver 超时不匹配（默认 10s/40s）

坑：`kubelet` 证书过期（kubeadm 默认 CA 10 年、kubelet 证书 1 年）表现为 `x509: certificate has expired`，要用 `kubeadm certs renew` 或开自动轮换。

---

### Q67. cordon / drain / uncordon 的差别和坑？【中】

```bash
kubectl cordon node-1                    # 标记不可调度（不影响已有 Pod）
kubectl drain node-1 --ignore-daemonsets --delete-emptydir-data --timeout=300s
kubectl uncordon node-1
```

`drain` = `cordon` + 逐出（eviction API），**受 PDB 约束**。

坑：

- 没有 `--ignore-daemonsets` 会报错退出
- `--delete-emptydir-data` 是明确同意丢数据，忘加会拒绝
- 还有裸 Pod（非控制器管理）时 drain 会失败
- PDB `minAvailable` 太高会一直卡住，`--timeout` 到点就退出但**已驱逐的不回滚**
- 驱逐走的是 eviction 接口，会尊重 `terminationGracePeriodSeconds`，长连接服务要配好优雅停机

---

### Q68. kubelet 的关键参数和 cgroup driver 怎么定？【中】

```ini
# /var/lib/kubelet/config.yaml
cgroupDriver: systemd
cgroupRoot: /kubepods
maxPods: 110
evictionHard: { memory.available: '100Mi' }
kubeReserved: { cpu: 500m, memory: 1Gi }
systemReserved: { cpu: 500m, memory: 1Gi }
evictionPressureTransitionPeriod: 5m
```

**cgroup driver 必须和容器运行时一致**（containerd 默认 `systemd`），不一致的典型现象是 `kubelet` 起来后 Pod 资源统计为 0、重负载下随机被 OOM。1.25+ 已要求显式配置。

坑：`kubeReserved`/`systemReserved` 不设，系统进程和业务抢 CPU，节点在压力下直接失联；`maxPods` 受 CNI 网段大小限制（`/24` 最多 254），改大前先算 IP 池。

---

### Q69. 集群升级的顺序和版本偏差策略？【高】

顺序：**etcd → 控制面（逐个）→ 工作节点（分批）→ 加载项（CNI/CSI/Ingress）**，绝不先升工作节点。

版本偏差（官方 skew policy）：kubelet 最多比 apiserver **落后 3 个小版本**，`kubectl` ±1，控制面组件之间不允许偏差。**一次只能升一个次版本**（1.28 → 1.29 → 1.30）。

```bash
kubeadm upgrade plan
kubeadm upgrade apply v1.30.5
kubectl drain node-1 --ignore-daemonsets
apt-get install -y kubelet=1.30.5-1.1 kubeadm=1.30.5-1.1
systemctl daemon-reload && systemctl restart kubelet
kubectl uncordon node-1
```

坑：升级前必须备份 etcd + 检查**弃用 API**（`kubectl deprecations` / `pluto`），1.22 的 Ingress/PSP 移除曾让大批集群升完就挂；`Static Pod` 镜像不会自动清理，节点磁盘要预留。

---

### Q70. 证书怎么轮换？集群灾备怎么重建？【高】

证书：

```bash
kubeadm certs check-expiration
kubeadm certs renew all          # 控制面证书
systemctl restart kubelet
# kubelet 客户端证书靠 --rotate-certificates 自动轮换
```

灾备三件事：**etcd 快照 + 集群清单（yaml/Helm values）+ 镜像与存储的外部依赖**。重建流程就是新集群 + `etcdctl snapshot restore` + 重新 apply 清单。

坑：只备份 etcd 但忘了 `--encryption-provider-config` 的密钥，恢复后 Secret 全是乱码；节点 IP 变了而 etcd 快照里的 `peerURLs` 没改，恢复要靠 `--initial-cluster` 重写。

---

### Q71. 单节点能跑多少 Pod？容量规划怎么算？【中】

先算四个上限，取最小的那个：

| 约束 | 典型值 |
| --- | --- |
| kubelet `maxPods` | 110 |
| CNI IP 池（Pod CIDR `/24`） | 254 |
| iptables 规则数 / conntrack 表 | 500~1000 |
| 内存：(节点内存 - reserved) / 单 Pod 均值 | 通常最先撞 |

```bash
kubectl describe node node-1 | grep -A6 'Allocated resources'   # 已分配 requests
kubectl get node node-1 -o jsonpath='{.status.capacity.pods}{"\n"}'
```

规划要点：

- **按 requests 算，不按实际用量算**——调度器只看 requests
- 留 **10~20% buffer** 给突发和 DaemonSet（多一个 DaemonSet 就是 N 个 Pod）
- 大规格节点省心但**爆炸半径大**；小节点灵活但固定开销占比高
- 生产常见做法：`8C16G~16C32G`，单节点 30~60 个业务 Pod

坑：只看 CPU/内存不看 **Pod 数量上限**，大促扩到 120 个 Pod 直接 Pending；`maxPods` 改大了但 CNI 的 `/24` 没扩，报 `failed to allocate for range`；`kubeReserved` 不配，节点被系统进程吃满后驱逐业务 Pod。

答题要点：先算上限取最小值，按 requests 规划，留 buffer，盯 IP 池。

---
## 十二、etcd 与集群备份恢复

### Q72. etcd 在 K8s 里承担什么角色？为什么它是单点风险？【初】

- 唯一的**持久化状态存储**：所有对象（Pod、Deployment、Secret、ConfigMap）都存在里面，格式是 protobuf 的 key-value
- 无状态组件（apiserver 除外）都可以随时重启重建，**etcd 丢了等于集群丢了**
- 默认只监听 `127.0.0.1:2379`（kubeadm 静态 Pod 用 hostNetwork + `--listen-client-urls=https://127.0.0.1:2379`）

坑：`kubectl get` 的每一次 list 都可能打到 etcd（apiserver 有 watch cache，但冷启动/大规模 list 会穿透），这就是「apiserver 慢其实是 etcd 慢」的原因。

---

### Q73. raft 和仲裁：3 节点挂 1 个还能写吗？【中】

能。raft 要求**多数派（quorum = n/2 + 1）**：

- 3 节点 → 2 票通过，挂 1 台仍可读写；**挂 2 台则整个集群只读**
- 5 节点 → 容忍 2 台故障
- 2 节点 → 需要 2 票，挂 1 台就不可用，**比 1 节点还差**

```bash
etcdctl endpoint status --cluster -w table
etcdctl endpoint health --cluster
etcdctl member list -w table
```

坑：偶数节点（4、6）容错和少一个一样，只会增加写延迟。集群抖动时频繁 leader 选举会导致 apiserver 大量 `context deadline exceeded`，要检查网络延迟和 `--heartbeat-interval`/`--election-timeout`。

---

### Q74. etcd 快照怎么做、怎么恢复？【高】

```bash
# 备份（对任一健康的 endpoint 执行即可，会阻塞式读取）
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /backup/etcd-$(date +%F-%H%M).db
etcdctl snapshot status /backup/etcd-2026-10-28.db -w table

# 恢复（必须先停掉所有 etcd 和控制面）
etcdctl snapshot restore /backup/etcd-2026-10-28.db \
  --data-dir=/var/lib/etcd-restore \
  --initial-cluster=etcd-1=https://10.0.0.1:2380,etcd-2=https://10.0.0.2:2380,etcd-3=https://10.0.0.3:2380 \
  --initial-cluster-token=etcd-cluster \
  --initial-advertise-peer-urls=https://10.0.0.1:2380
```

坑：恢复是**全量覆盖**，恢复到老快照等于丢掉之后创建的所有资源；`restore` 出来的目录属主是 root，要 `chown -R etcd:etcd` 否则静态 Pod 起不来；**只备份一个 etcd 节点的快照就够，但三个节点必须恢复成同一份**。

---

### Q75. defrag 是干什么的？为什么要告警 `NOSPACE`？【中】

- etcd 的 boltdb 文件只会变大不会自动收缩，大量更新/删除后产生碎片
- `defrag` 是**在线阻塞式**整理（该节点在此期间不可用），要逐节点做，且每做完一个等它追上 leader
- 配额默认 2GiB（`--quota-backend-bytes`），写满后集群**整体只读**，返回 `etcdserver: mvcc: database space exceeded`

```bash
etcdctl defrag --cluster
etcdctl alarm list
etcdctl alarm disarm          # 清理 NOSPACE 告警后必须 disarm 才能恢复写
```

必盯指标：`etcd_server_quota_backend_bytes`、`etcd_mvcc_db_total_size_in_bytes`、`etcd_server_slow_apply_total`、`etcd_disk_wal_fsync_duration_seconds`（P99 > 100ms 说明磁盘有问题）、`etcd_server_leader_changes_seen_total`。

坑：defrag 前不做快照是赌博；用网络盘（NFS/部分云盘）跑 etcd 会因 fsync 延迟过高导致频繁选主，**etcd 必须用本地 SSD**。

---

### Q76. etcd 磁盘 io 差会怎样表现？【中】

- `etcd_disk_wal_fsync_duration_seconds` 和 `backend_commit_duration_seconds` 升高
- 写请求超时 → apiserver 报 `etcdserver: request timed out` → 控制器重试风暴
- leader 心跳发不出去 → 频繁选举 → 集群 intermittent 不可用

排查：

```bash
iostat -x 1 5
fio --name=fsync --filename=/var/lib/etcd/test --rw=write --fsync=10 --size=100M --direct=1
```

坑：`--quota-backend-bytes` 调大不解决 io 问题；把 etcd 的和业务高 io 的负载放同一个盘是最常见的架构失误。

---

### Q77. velero 这类工具能替代 etcd 快照吗？【高】

不能，两者面向不同的恢复目标：

| 方式 | 恢复粒度 | 恢复场景 |
| --- | --- | --- |
| etcd 快照 | 整个集群（全有或全无） | 集群级灾难、误删 CRD |
| velero | 命名空间/资源/卷 | 误删 Namespace、跨集群迁移、单应用回滚 |

```bash
velero backup create app-daily --include-namespaces app --snapshot-volumes
velero restore create --from-backup app-daily
velero schedule create daily --schedule='0 1 * * *' --include-namespaces app --ttl 168h
```

坑：velero 依赖对象存储 + 卷快照（CSI `VolumeSnapshotClass`），**velero 自身也要部署在集群里**，集群全毁时先重建再 restore；它默认不备份 `kube-system` 的某些资源，ServiceAccount token 恢复后需要重建。

---

### Q78. etcd 空间满了、集群只读，怎么救？【高】

```bash
etcdctl endpoint status -w table          # 看 DB SIZE 是否接近 2GiB
kubectl get events -A | grep -i "space"
etcdctl alarm list && etcdctl alarm disarm
etcdctl defrag --cluster
etcdctl compact $(etcdctl endpoint status --write-out=json | jq '.[0].Status.header.revision')
```

步骤：**compact 压缩历史版本 → defrag 释放空间 → disarm 告警**。如果还是满，只能临时调大 `--quota-backend-bytes`（要滚动重启 etcd）或迁移到更大盘。

根治：查谁在疯狂写（通常是某个 reconcile 死循环的 Operator、或 `kubectl get -w` 的脚本），加 `--event-ttl` 缩短事件保留时间。

坑：`compact` 只标记可回收，**不 defrag 磁盘不会变小**；顺序错了（先 defrag 后 compact）等于白做。

---

## 十三、故障排查实战

### Q79. Pod 一直 CrashLoopBackOff，怎么查？【中】

```bash
kubectl -n app get pod api-xxx -o wide
kubectl -n app describe pod api-xxx | sed -n '/Events/,$p'
kubectl -n app logs api-xxx --previous        # 关键：上一次崩溃的日志
kubectl -n app logs api-xxx -c sidecar --previous
```

判断依据：

| 现象 | 结论 |
| --- | --- |
| 日志里 `connection refused` | 依赖没起来，缺 Init 容器或重试 |
| `OOMKilled`（看 `lastState.terminated.reason`） | 内存 limit 太小或内存泄漏 |
| 立即退出、无日志 | 命令写错、镜像 entrypoint 不对 |
| 探针失败导致重启 | liveness 阈值太严 |

坑：`--previous` 是**必用参数**，不加只能看到新一轮的启动日志；退避时间指数增长（最长 5 分钟），调完参数后手动删 Pod 才快。

---

### Q80. Pod 一直 Pending，怎么定位？【中】

```bash
kubectl -n app describe pod api-xxx | tail -20     # 看 0/N nodes are available
kubectl describe node <候选节点> | grep -A5 Allocated
kubectl get pvc -n app
```

常见原因：

- `Insufficient cpu/memory`：requests 太大或节点已满
- `node(s) had untolerated taint`：节点被污染
- `node(s) didn't match Pod's node affinity`：标签不匹配
- `node(s) had volume node affinity conflict`：卷在别的 AZ
- `pod has unbound immediate PersistentVolumeClaims`：PVC 没绑上
- 没有可用节点被 `cordon`、或 `maxPods` 已满

坑：先看 **Events 最后一行**，调度器会把所有失败原因列出来，别一上去就猜资源不足。

---

### Q81. OOMKilled 和 Evicted 怎么区分？【初】

| 现象 | 触发者 | 表现 |
| --- | --- | --- |
| `OOMKilled` | 内核 OOM killer（cgroup 内） | 容器 `lastState.terminated.reason=OOMKilled`，退出码 137 |
| `Evicted` | kubelet 驱逐 | Pod `status.reason=Evicted`，节点 `MemoryPressure=True` |

```bash
kubectl -n app get pod api-xxx -o jsonpath='{.status.containerStatuses[*].lastState.terminated}'
kubectl describe node node-1 | grep -E 'MemoryPressure|Evicted'
dmesg -T | grep -i 'killed process'
```

坑：`exit code 137` 也可能是 `SIGKILL`（人为删、探针失败），要结合 `reason` 判断；`Evicted` 的 Pod 不会被重建，要靠 Deployment 重新调度——如果节点压力持续，Pod 会在节点间来回横跳。

---

### Q82. Pod 卡在 Terminating 不动？【中】

```bash
kubectl -n app get pod api-xxx -o yaml | grep -A5 finalizers
kubectl -n app describe pod api-xxx | grep -i finalizer
kubectl get events -n app --field-selector involvedObject.name=api-xxx
```

原因排序：

1. **finalizer 未摘**（PV 保护、自定义控制器）
2. **容器进程忽略 SIGTERM**，等 `terminationGracePeriodSeconds`（默认 30s）
3. **kubelet 失联**（节点 NotReady），Pod 状态只存在于 etcd，无法真正停止
4. 挂载的卷卸载阻塞（NFS `hard` 挂载、CSI 异常）

处置：先 `kubectl delete pod --grace-period=0 --force`（对节点失联有效）；finalizer 卡住要找到对应控制器修好；NFS 卷要用 `soft`+`timeo` 或杀掉挂载进程。

坑：**强制删除只是删了 etcd 里的记录，节点上容器可能还在跑**，会造成端口/卷被占用；force delete 后必须上节点 `crictl ps` 确认。

---

### Q83. Service 访问不通，按什么链路查？【高】

从内到外，**每一步都能独立验证**：

```bash
# 1) Service 有没有 Endpoint（没有 = 标签选错 / Pod 未 Ready）
kubectl -n app get endpointslice -l kubernetes.io/service-name=api
kubectl -n app get pod --show-labels
# 2) 端口对不对（port / targetPort / containerPort）
kubectl -n app get svc api -o yaml | grep -A6 ports
# 3) Pod 本身通不通
kubectl -n app exec debug -- nc -zv api 80
kubectl -n app exec debug -- wget -qO- http://api.app.svc.cluster.local:80/healthz
# 4) 规则有没有下发
kubectl -n kube-system logs -l k8s-app=kube-proxy --tail=30
# 5) NetworkPolicy / 安全组
kubectl -n app get networkpolicy
```

判断依据：**Endpoints 为空是最高频根因**（selector 不匹配、readiness 失败、`targetPort` 写错）。有 Endpoint 但不通，就往 kube-proxy/CNI/NetworkPolicy 方向查。

坑：`targetPort` 是**容器端口**不是 Service 端口；headless Service 没有 ClusterIP，用 `dig` 只能拿到 Pod IP 列表。

---

### Q84. 集群内 DNS 解析失败怎么查？【高】

```bash
kubectl run dnstest --rm -it --image=busybox:1.36 --restart=Never -- nslookup kubernetes.default
kubectl -n kube-system get pods -l k8s-app=kube-dns -o wide
kubectl -n kube-system logs -l k8s-app=kube-dns --tail=50
kubectl -n kube-system get svc kube-dns
kubectl -n kube-system get cm coredns -o yaml
```

排查顺序：

1. CoreDNS Pod 是否 Ready、是否只剩 1 个副本（都挂了就是全集群故障）
2. `kube-dns` Service 的 Endpoints 是否正常
3. Pod 的 `/etc/resolv.conf` 里 nameserver 是否是 `kube-dns` 的 ClusterIP
4. 节点到 CoreDNS 的 53/UDP 是否被 NetworkPolicy 拦
5. CoreDNS 自身日志：`plugin/forward` 报上游超时说明节点 DNS 坏了

坑：`ndots:5` 造成大量无效查询（详见 Q30）；CoreDNS 的 `autopath` 能减少查询次数但会带来额外复杂度；改了 `coredns` ConfigMap 后要 `rollout restart` 才生效。

---

### Q85. apiserver 变慢 / 5xx，怎么定位？【高】

```bash
kubectl get --raw='/metrics' | grep apiserver_request_duration_seconds
kubectl -n kube-system logs kube-apiserver-<node> --tail=100
kubectl get --raw='/readyz?verbose'
kubectl get --raw='/livez?verbose'
```

| 现象 | 根因方向 |
| --- | --- |
| `etcdserver: request timed out` | etcd io 慢 / 空间满 |
| `too many requests` / 429 | 客户端 list 无 `resourceVersion=0`、`--max-requests-inflight` 打满 |
| `context deadline exceeded` | 大对象 list、CRD 数量爆炸 |
| watch 断连重连风暴 | 客户端没做 `resourceVersion` 续传 |
| 证书错误 | 证书轮换失败 / 客户端 kubeconfig 过期 |

常见诱因：**大规模 list**（监控系统每 30s 拉全量 Pod）、`kubectl get all -A` 脚本、CRD 上千个、`--audit-log-path` 全量 RequestResponse。

坑：`apiserver` 慢不一定是它自己的问题，**90% 是 etcd 或某个疯狂 list 的客户端**；先看 `apiserver_request_total{verb="LIST"}` 的调用方（`user_agent`）。

---
## 十四、可观测性、日志与审计

### Q86. metrics-server 和 Prometheus 的分工？【中】

| 组件 | 定位 | 数据 |
| --- | --- | --- |
| `metrics-server` | 只提供**当前值**，给 HPA / `kubectl top` 用 | 15s 抓一次，内存里只留最近点 |
| `Prometheus` | 时序数据库，长期存储 + 查询 | 自定义抓取间隔、保留 15~30 天 |

**两者不能互相替代**：metrics-server 是聚合 API（`metrics.k8s.io`），查历史什么也拿不到；Prometheus 能出趋势但 HPA 需要的是低延迟当前值。

坑：`metrics-server` 挂了 → HPA 报 `unable to get metrics` 且不缩容也不扩容（用 `--kubelet-insecure-tls` 在自签集群上很常见）；集群内 Prometheus 与 metrics-server 都在抓 kubelet，要注意 `kubelet` 的 `/metrics` 鉴权（`--authentication-token-webhook`）。

---

### Q87. kube-state-metrics 的指标为什么重要？【中】

它不抓资源用量，而是把**对象状态翻译成指标**：

```text
kube_deployment_status_replicas_unavailable
kube_pod_container_status_restarts_total
kube_pod_status_phase{phase="Pending"}
kube_node_status_condition{condition="Ready",status="true"}
kube_persistentvolumeclaim_status_phase
kube_job_status_failed
```

典型告警：

- `kube_deployment_status_replicas_unavailable > 0` 持续 5 分钟
- `increase(kube_pod_container_status_restarts_total[10m]) > 3`
- `kube_node_status_condition{condition="Ready",status="true"} == 0`

坑：`kube-state-metrics` 的基数会爆炸（每个 Pod 一堆 label），要开 `--metric-labels-allowlist` 白名单，否则 Prometheus 内存撑不住；它和 cAdvisor 类指标是**互补**关系，别混成一个。

---

### Q88. 容器日志落在哪？怎么轮转？【初】

- containerd 默认写 `/var/log/pods/<ns>_<pod>_<uid>/<container>/<n>.log`，本质是 **CRI 格式的软链**到 `/var/log/containers/*.log`
- kubelet 的 `containerLogMaxSize`（默认 10Mi）、`containerLogMaxFiles`（默认 5）控制轮转

```yaml
# /var/lib/kubelet/config.yaml
containerLogMaxSize: 50Mi
containerLogMaxFiles: 5
```

坑：**只写 stdout/stderr 才能被 `kubectl logs` 看到**，写文件里的日志要靠 sidecar 或 hostPath 采集；节点根盘被日志写满是 `DiskPressure` 的头号原因，`/var/log` 和 `/var/lib/docker` 要单独分区或单独监控。

---

### Q89. 集中式日志方案怎么选？【中】

| 方案 | 特点 |
| --- | --- |
| Loki + Promtail | 索引少、成本低，适合「按 label 查」 |
| EFK（Elasticsearch/Fluentd/Kibana） | 全文检索强，资源吃得多 |
| 云厂商日志服务 | 免运维、按量计费，长期成本高 |
| Vector / Fluent Bit | 轻量采集器，常做 Loki 的前端 |

采集模型两种：**DaemonSet 采集节点上的 `/var/log/containers`**（通用）或 **sidecar 跟随单个容器**（多行日志/特殊格式）。推荐前者 + 应用侧结构化 JSON。

坑：多行日志（Java 堆栈）必须配 `multiline` 规则，否则一行一条日志；采集器自身的资源 limit 给小了会丢日志，`promtail` 被 OOM 是常见事故。

---

### Q90. `kubectl describe` 的 Events 和链路追踪各解决什么问题？【中】

- **Events**：集群级事实（调度失败、拉镜像失败、探针失败、驱逐），保留时间由 `--event-ttl`（默认 1h）决定，数量受 `--max-mirrored-burst` 限流
- **Tracing**：请求级因果链，跨服务定位「慢在哪一跳」

接入方式：OpenTelemetry Operator 注入 sidecar 或 SDK 埋点，导出到 Tempo/Jaeger。K8s 侧要保证 trace 上下文透传（HTTP header `traceparent`）。

坑：Events 默认只留 1 小时，**事后复盘往往已经没了**，所以要用 `kubectl-events` 导出或上 `eventrouter`；分布式追踪采样率配成 100% 会把后端打爆。

---

### Q91. 告警应该盯哪些信号？【中】

四个黄金信号 + 两个 K8s 特有：

| 信号 | 指标示例 |
| --- | --- |
| 延迟 | `histogram_quantile(0.99, ..._duration_seconds_bucket)` |
| 流量 | QPS、`container_network_receive_bytes_total` |
| 错误 | 5xx 比例、`restart_total` |
| 饱和度 | CPU throttling、`memory.working_set / limit`、etcd fsync P99 |
| K8s 特有 | `replicas_unavailable`、PVC 使用率、节点 NotReady、证书剩余天数 |
| 容量 | 集群可分配资源余量、`maxPods` 占用率 |

原则：**告警要能对应到动作**，没人会处理的告警等于噪音。用 `for: 5m` 抑制抖动，按严重度分级（P1 打电话、P2 工单）。

坑：`CPU 使用率 > 80%` 这种告警基本没用（K8s 里 CPU 是可压缩资源，超了只是变慢），真正该盯的是 **throttling 比例**和 **P99 延迟**。

---

## 十五、Operator、CRD 与扩展生态

### Q92. CRD 和自定义控制器是什么关系？【中】

- **CRD** 只是向 apiserver 注册一种新的资源类型（有 schema、有 RBAC、有 kubectl 支持），**它本身不执行任何逻辑**
- **自定义控制器** watch 这些 CR，写 reconcile 循环去驱动真实状态
- 两者合起来才叫 Operator；只建 CRD 不写控制器，等于给用户一个能创建但没人理的 yaml

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: databases.example.com
spec:
  group: example.com
  scope: Namespaced
  names: { plural: databases, singular: database, kind: Database, shortNames: [db] }
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties: { spec: { type: object, properties: { size: { type: integer } } } }
```

坑：CRD 的 `spec` 是**不可变**的部分字段（改 `group`/`kind` 要重建）；没有结构化的 `openAPIV3Schema` 会让 `kubectl apply` 无法校验，也不支持 `--dry-run=server` 的严格检查。

---

### Q93. Operator 模式适合什么场景？不适合什么？【高】

适合：**有状态、有运维知识、需要多步编排**的服务——数据库（CloudNativePG、Vitess）、消息队列（Strimzi/Kafka）、监控栈（Prometheus Operator）、证书（cert-manager）。

不适合：

- 无状态应用（Deployment 已经够了）
- 简单定时任务（CronJob 就够）
- 需要跨集群强一致的场景（Operator 只管自己那个集群）

判断标准一句话：**「这东西上线需要人记住 10 个以上操作步骤吗？」** 需要才值得写 Operator。

坑：为了「显得云原生」把普通 CRUD 包成 Operator，结果多了几百行 reconcile 代码和一堆权限，维护成本远高于收益。

---

### Q94. finalizer 和 reconcile 循环怎么配合？【高】

reconcile 的标准结构：

1. 读 CR，若 `deletionTimestamp` 非空 → 执行清理 → 摘掉 finalizer → return
2. 否则比对期望与实际，逐步创建/更新子资源
3. 任何一步失败就 `return err`，控制器**指数退避重试**
4. 用 `status.conditions` 和 `observedGeneration` 报告进度

```python
if not body.get('metadata', {}).get('deletionTimestamp'):
    # 正常 reconcile
    ensure_deployment(body)
else:
    cleanup_external(body)          # 删云上 SLB、清 DNS 记录
    remove_finalizer(body, 'example.com/cleanup')
```

坑：reconcile 必须**幂等**（同一个对象可能被并发处理多次）；忘了摘 finalizer 会让 CR 永远 Terminating；把外部 API 调用放在没有超时控制的地方会阻塞整个 worker 队列。

---

### Q95. 扩展 apiserver 的方式有几种？admission webhook 的扩展点在哪？【高】

| 扩展点 | 能力 | 代价 |
| --- | --- | --- |
| CRD + controller | 新资源、新逻辑 | 自己写控制器 |
| Admission webhook | 拦截/改写创建与更新 | 挂了会影响全集群 |
| Aggregated API（APIService） | 真正接入 apiserver 的 REST 语义 | 要实现完整 API，极重 |
| Scheduler plugin / Framework | 自定义调度 | 需改调度器配置 |
| Device Plugin / CSI / CNI | 节点侧能力 | 与运行时耦合 |

admission webhook 的两个时机：**mutating**（改对象，可多个，不能看最终形态）→ **validating**（只读，能看到 mutating 之后的结果）。

坑：aggregated API 是绝大多数团队踩不起的坑（要自己处理 watch、分页、版本转换）；优先 CRD。

---

### Q96. Helm 和 Kustomize 怎么分工？【中】

- **Helm**：模板 + values + 版本化 release，适合**对外分发**（第三方 chart、多环境参数化）
- **Kustomize**：overlay 叠加，无模板、原生 yaml，适合**内部多环境**（base + prod/dev overlay）

```bash
kustomize build overlays/prod | kubectl apply -f -
helm template api ./chart -f values-prod.yaml | kubectl apply -f -
```

组合用法：Helm 装第三方（`helm install`），自己的应用用 Kustomize（`kubectl apply -k`），或者用 `helmfile`/`Argo CD` 统一编排。

坑：Helm 的 `values` 一旦膨胀到几百行就退化成第二套 DSL；`helm upgrade` 对 CRD 不生效（`crds/` 目录只在 install 时装），Operator 升级要单独处理；Kustomize 的 `namePrefix` 会改掉所有引用，`Service` 的 `selector` 匹配不上是新手常犯的错。

---

### Q97. 用 Operator 踩过哪些坑？【中】

1. **权限过大**：ClusterRole `*/*` 是标配，一旦 CR 被恶意创建就能提权；要按需给 Role
2. **升级不可逆**：Operator 自身升级会触发所有 CR reconcile，可能一次性重建全部实例
3. **CRD 版本迁移**：`v1alpha1 → v1` 需要 conversion webhook，否则老 CR 直接读不出
4. **级联删除失控**：删 CR 时 `ownerReference` 连带删掉 PVC，数据没了（记得设 `Retain`）
5. **多副本抢活**：控制器没做 leader election，多副本同时 reconcile 导致状态抖动

治理建议：装 Operator 前 review 它的 ClusterRole、确认它支持 CRD 多版本、**给它自己的命名空间**、并把 `kubectl get crd` 纳入日常巡检。

追问常考：怎么判断一个 Operator 是否成熟？看它有没有 conversion webhook、有没有 e2e 测试、CRD schema 是否完整、社区 issue 响应速度。

---

## 十六、Kubernetes 运维速记卡

### 必记 kubectl 命令

| 场景 | 命令 |
| --- | --- |
| 上下文 | `kubectl config get-contexts` / `use-context` |
| 全量看 | `kubectl get pod -A -o wide` |
| 详情 | `kubectl describe pod <p> -n <ns>` |
| 日志（上一次崩） | `kubectl logs <p> --previous` |
| 进容器 | `kubectl exec -it <p> -- sh` |
| 事件 | `kubectl get events -A --sort-by=.lastTimestamp` |
| 回滚 | `kubectl rollout undo deploy/x --to-revision=N` |
| 重启 | `kubectl rollout restart deploy/x` |
| 权限自查 | `kubectl auth can-i --list -n <ns> --as=<u>` |
| 造模板 | `kubectl create ... --dry-run=client -o yaml` |
| 硬删节点上的 Pod | 先 `crictl ps` 再 `crictl rm <id>` |
| 资源用量 | `kubectl top pod -n <ns> --sort-by=memory` |

### Pod 状态对照表

| 状态 | 一句话原因 | 第一步动作 |
| --- | --- | --- |
| `Pending` | 没调度上 | `describe` 看 Events 末行 |
| `ContainerCreating` | 卡在挂卷/CNI | 看 Events、`get pvc` |
| `ImagePullBackOff` | 拉不到镜像 | 查 tag/凭据/网络 |
| `CrashLoopBackOff` | 启动即崩 | `logs --previous` |
| `RunContainerError` | 命令/权限错 | 看 `describe` 的 reason |
| `OOMKilled` | 超 memory limit | 提 limit 或查泄漏 |
| `Evicted` | 节点压力驱逐 | 查节点 `MemoryPressure` |
| `Terminating` 卡住 | finalizer / kubelet 失联 | 查 finalizer、`--force` |
| `Completed` / `Succeeded` | Job 正常结束 | 无需处理 |
| `Unknown` | kubelet 心跳丢失 | 查节点 NotReady |

### 常见事件与含义

| Event | 含义 |
| --- | --- |
| `FailedScheduling` | 调度失败，后面跟具体原因 |
| `FailedMount` / `FailedAttachVolume` | 卷挂载失败 |
| `BackOff` | 重启退避 |
| `Unhealthy` | 探针失败 |
| `NodeNotReady` | 节点失联 |
| `FailedCreatePodSandBox` | CNI 或运行时异常 |
| `Killing` / `Preempting` | 优雅终止 / 抢占 |
| `FailedNeedsStart` | CronJob 到点但无法创建 Job |

### 必记默认端口与路径

| 项 | 值 |
| --- | --- |
| apiserver | `6443`（HTTPS） |
| etcd client / peer | `2379` / `2380` |
| kubelet API | `10250`（`10248` 健康检查） |
| scheduler / controller | `10259` / `10257` |
| kube-proxy 健康 | `10249` |
| NodePort 范围 | `30000-32767` |
| 静态 Pod 目录 | `/etc/kubernetes/manifests` |
| kubeconfig | `/etc/kubernetes/admin.conf`、`~/.kube/config` |
| 证书目录 | `/etc/kubernetes/pki` |
| etcd 数据 | `/var/lib/etcd` |
| Pod 日志 | `/var/log/pods`、`/var/log/containers` |
| kubelet 配置 | `/var/lib/kubelet/config.yaml` |

### 必记参数

| 参数 | 归属 | 默认 |
| --- | --- | --- |
| `--max-pods` | kubelet | 110 |
| `--node-status-update-frequency` | kubelet | 10s |
| `--terminationGracePeriodSeconds` | Pod | 30 |
| `--event-ttl` | apiserver | 1h |
| `--service-node-port-range` | apiserver | 30000-32767 |
| `--cluster-cidr` | controller-manager | 依 CNI |
| `--leader-elect` | scheduler/CM | true |
| `revisionHistoryLimit` | Deployment | 10 |
| `progressDeadlineSeconds` | Deployment | 600 |
| `--quota-backend-bytes` | etcd | 2GiB |
| `ndots` | Pod dnsConfig | 5 |

### 故障一句话速答

- **Pending**：调度器进不去 → 看 Events 第一行原因（资源/污点/亲和/PVC）
- **CrashLoop**：进程起不来 → `logs --previous` 看最后一屏堆栈
- **ImagePull**：拉不到 → tag 存在吗、凭据过期吗、节点能不能出网
- **Service 不通**：先看 Endpoints 是否为空，空就是 selector / readiness 问题
- **DNS 失败**：先看 CoreDNS 副本数与 `kube-dns` Endpoints，再查 ndots 与 NetworkPolicy
- **节点 NotReady**：kubelet 存活 → 运行时 → 磁盘内存压力 → 网络与证书 → CNI
- **apiserver 慢**：90% 是 etcd io 或某个疯狂 list 的客户端，看 `apiserver_request_total{verb="LIST"}`
- **etcd 只读**：`NOSPACE` 告警 → `compact` → `defrag` → `alarm disarm`
- **OOMKilled**：容器超 memory limit，看 `lastState.terminated.reason`，不是节点 OOM
- **挂载失败**：RWO 跨节点（Multi-Attach）或 AZ 不匹配（node affinity conflict）

