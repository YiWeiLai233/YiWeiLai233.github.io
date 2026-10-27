# 桌面运维面试题库 · 全面版

> 难度标记：`【初】` 必答 · `【中】` 分水岭 · `【高】` 加分项
> 范围：这份题库只打企业桌面支持那一摊——工单流程、装机与镜像、AD 域与组策略、共享与打印、终端故障、macOS 与 Linux 桌面、办公软件、外设硬件、账号权限、终端安全、远程与分发、备份与资产、实战场景、脚本自动化。答案按 **是什么 → 为什么 → 怎么做 → 踩过什么坑** 组织，能直接背成面试口语。

---

## 目录

1. 桌面支持流程与工单规范
2. Windows 安装、镜像与系统封装
3. Windows 账户、域与组策略
4. Windows 网络、共享与打印
5. Windows 常见故障排查
6. macOS 桌面运维
7. Linux 桌面运维
8. 办公软件与协作工具支持
9. 外设、驱动与硬件维护
10. 账号身份与权限管理
11. 终端安全、杀毒与合规
12. 远程支持与软件分发
13. 数据备份、迁移与资产
14. 桌面故障场景实战
15. 桌面运维脚本与自动化
16. 桌面运维速记卡

---

## 一、桌面支持流程与工单规范

### Q1. 一线、二线、三线支持怎么分工？什么情况该升级？【初】

| 层级 | 角色 | 典型动作 |
|---|---|---|
| 一线 | 服务台 / Helpdesk | 接单、远程复现、重置密码、标准软件安装、FAQ 答复 |
| 二线 | 桌面运维工程师 | 域账号、组策略、驱动与外设、镜像重装、权限申请执行 |
| 三线 | 系统 / 网络 / 安全 / 厂商 | 服务器侧、域控与架构、网络设备、安全事件、硬件保修 |

升级判据要写成可执行的条件：

- 一线 **15 分钟** 内无法给出下一步动作，或需要管理员权限做变更 → 升二线
- 二线 **2 小时** 内定位不到根因，或涉及域控、网络、安全策略、厂商硬件 → 升三线

**升级不是甩单**：交接必须带齐「现象 + 复现步骤 + 已做的动作 + 影响面 + 用户联系方式」，否则任务回到二线时一切重来。

---

### Q2. 工单怎么分级？响应时限和解决时限怎么定？【中】

按 **影响面 × 紧急度** 分级，不要按「用户语气」分级：

| 级别 | 定义 | 响应 | 解决 |
|---|---|---|---|
| P1 | 整层/整部门不可用、域控或核心业务中断、勒索事件 | 15 分钟 | 4 小时 |
| P2 | 单人无法工作且无替代方案（如财务开票机蓝屏） | 30 分钟 | 8 小时 |
| P3 | 单人受影响但有替代方案（如外接屏不亮） | 4 小时 | 2 个工作日 |
| P4 | 咨询、需求、优化类（装软件、要权限） | 1 个工作日 | 按排期 |

要点：**响应时限指「第一次有效回复并给出下一步」**，不是「回一句收到了」；解决时限指恢复可用，不是彻底闭环。P1 要有专人同步进展，**每 30 分钟** 更新一次状态。

坑：把 P4 也套 4 小时响应，一线会被咨询单淹掉，真正 P1 反而没人接。

---

### Q3. 桌面支持的 SLA 该怎么定？指标怎么落地？【中】

SLA 是服务方和业务方签的「可度量承诺」，桌面运维常见四类指标：

- **响应率 / 首次解决率（FCR）**：一线一次对话就解决的比例，目标 **≥ 60%**
- **按时响应率**：在承诺时限内首次回复的工单占比，目标 **≥ 95%**
- **一次上门解决率**：上门不带二次备件/驱动的比例
- **满意度（CSAT）**：关单后一条五星评价，目标 **≥ 4.5**

```yaml
# 指标口径必须写进文档，否则每月扯皮
sla:
  p1_first_response: 15m
  p1_resolve: 4h
  p3_first_response: 4h
  fcr_target: 0.6
  csat_target: 4.5
  timezone: Asia/Shanghai   # 只算工作时间 9:00-18:00
```

坑：不写「工作时间口径」和「暂停条件」，用户凌晨提单、等你等配件的那几天全算进解决时限，指标永远不达标。

---

### Q4. 远程支持和上门怎么取舍？【中】

默认 **先远程**，因为省时间、省人力，也留下可复用记录。判断顺序：

1. 用户能正常启动系统并联网 → 远程
2. 需要进 BIOS、断电、换硬件、装系统、进安全模式、蓝屏循环 → 上门
3. 涉及敏感数据（人事、财务）→ 远程要 **用户在场并授权**，或直接上门

远程优先的前提是三条：**工单里留证据**（截图/录屏）、**操作前口头确认**、**改配置前留备份或导出**。

坑：为了省一次上门，远程折腾一小时还失败了，用户当天工时全浪费——**远程预算应该是 15 分钟，超时就约上门**。

---

### Q5. 知识库怎么沉淀才有人看？【中】

知识库不是写完就完，关键在「从工单长出来，再回到工单里去」：

- **来源**：同一问题关单时，二线顺手写一条 KB，标题用用户会搜的错词（如「打印机显示脱机」「0x80070005」）
- **结构**：现象 → 影响范围 → 判定依据 → 处置步骤（可复制命令）→ 验证方法 → 关联工单号
- **复用**：KB 编号写进工单回复模板；一线接单时先搜 KB，命中就直接套用
- **维护**：半年一次过期评审，产品版本变了就失效，过期 KB 比没有 KB 更害人

衡量指标看 **KB 命中率**（引用 KB 关闭的工单占比）而不是 KB 数量。

---

### Q6. 用户催单、投诉、领导插单，怎么沟通？【高】

三段式：**先接情绪 → 再给事实 → 最后给确定性**。

- 催单：不说「在查了」，说「目前定位到 X，下一步做 Y，**17:00 前**给你结果，没有结果我也会来告诉你」
- 投诉：先承认影响（「确实耽误了你两个小时」），再说明已做的动作和后续预防，**不当场解释内部流程多难**
- 领导插单：不硬顶也不全接，回「这件事我可以插进去，但会顺延今天的 A、B 两单，你确认优先级我立刻调」

追问常考：用户坚持说是「你们上次改坏的」怎么处理——**先用证据对齐时间线**（变更记录、日志），不认也不辩，先恢复业务再复盘。

---

### Q7. 同一类工单反复出现，怎么从根上压下去？【高】

思路固定：**统计 → 分类 → 找共性 → 一次性消除**。

1. 拉近 3 个月工单，按「现象 + 应用 + 机型」聚类，找出 Top 10，通常占总量 **60%~70%**
2. 逐个判断成因：配置错（用组策略/镜像统一）、版本旧（推补丁）、硬件老化（批量换）、流程缺（加自助入口）
3. 消除手段按性价比排序：**改默认配置 > 做自动化脚本 > 写知识库 > 加人力**

```powershell
# 拉 Top 问题类型，先看数据再动手
Get-ChildItem D:\tickets\*.csv | ForEach-Object {
  Import-Csv $_.FullName
} | Group-Object Category | Sort-Object Count -Descending |
  Select-Object -First 10 Count, Name
```

坑：只做「培训用户」这一类动作，第二个月工单量原地反弹——**能靠默认配置解决的，永远不要靠人记住**。

---

## 二、Windows 安装、镜像与系统封装

### Q8. 一台电脑重装的标准流程是什么？数据怎么保？【初】

固定顺序，任何一步跳过都会返工：

1. **确认授权与备份**：用户签署数据确认，桌面、文档、下载、浏览器书签、微信/QQ 聊天记录、`.pst` 邮件文件全部外置备份
2. **记录现场**：IP（是否静态）、加域状态、打印机、专用软件清单、License Key、加密狗
3. **进 PE**：DiskGenius 分区 + 确认系统盘，**先确认盘符，再动手格式化**
4. **装系统**：镜像安装 → 驱动 → 补丁 → 加域 → 装业务软件
5. **还原数据**：按清单回填，验证打印机、共享盘、邮件
6. **验收**：用户当场登录试一遍常用系统，签字关单

**最贵的坑是「数据没备份就格盘」**，所以流程里第一步必须是数据确认；BitLocker 机器还要先取恢复密钥或 `manage-bde -off` 解密，否则 PE 里根本看不到盘。

---

### Q9. 装机时驱动怎么注入？离线环境怎么办？【中】

三条路，按环境选：

- **在线**：Windows Update / 厂商工具（Dell Command Update、Lenovo Vantage）
- **离线单机**：`pnputil` 直接装 `.inf`

```powershell
# 离线安装驱动包（当前系统）
pnputil /add-driver D:\drivers\*.inf /subdirs /install
pnputil /enum-drivers            # 看已安装的第三方驱动

# 离线镜像注入（挂载 install.wim）
dism /Mount-Image /ImageFile:D:\sources\install.wim /Index:1 /MountDir:C:\mnt
dism /Image:C:\mnt /Add-Driver /Driver:D:\drivers /Recurse
dism /Unmount-Image /MountDir:C:\mnt /Commit
```

坑：**注入了网卡/存储驱动却漏了 USB3 与 NVMe 驱动**，新机型装完直接键鼠失灵或找不到硬盘；驱动包要用厂商「企业部署包」，别用消费级一键安装器（带全家桶）。

---

### Q10. sysprep 是干什么的？封装镜像的关键步骤有哪些？【中】

`sysprep` 做的是 **把系统还原成「首次开机」状态并清除机器相关信息**（SID、计算机名、驱动缓存标记），这样同一份镜像可以装到 N 台机器上而不冲突。

```text
# 通用化 + 关机，之后用 PE 抓成 wim
C:\Windows\System32\Sysprep\sysprep.exe /generalize /oobe /shutdown /unattend:C:\unattend.xml
```

关键点：

- **只能 generalize 有限次数**（注册表 `CleanupCount`，Win10/11 默认 1001 次），反复失败会卡在 sysprep 报错
- **应答文件 `unattend.xml`** 决定计算机名规则、语言、时区、跳过 OOBE、自动加域
- 封装前要清理：临时文件、`C:\Windows\Temp`、用户配置文件残留、事件日志
- 封装后 **不要再开机进系统**，直接 PE 抓镜像

坑：sysprep 常因「已安装的 Appx 包被更新过」失败，看 `C:\Windows\System32\Sysprep\Panther\setuperr.log` 定位到具体包，卸载后重试。

---

### Q11. WDS、MDT、SCCM 有什么区别？该怎么选？【中】

| 方案 | 定位 | 强项 | 短板 |
|---|---|---|---|
| WDS | 网络引导服务（PXE 服务端） | 轻量、装得快、只负责「把镜像推下去」 | 无任务序列、无应用分发、无报表 |
| MDT | 部署框架（脚本 + 任务序列） | 免费、灵活、可定制任务序列、能配合 WDS | 无客户端管理、报表弱、需自己维护 |
| SCCM / MECM | 企业终端管理平台 | 部署 + 软件分发 + 补丁 + 合规 + 报表一体 | 部署重、需 SQL 与许可、运维成本高 |

选型经验：**几十台 → WDS + MDT 够用；上千台、要合规审计与补丁闭环 → SCCM/Intune**。三者可以叠加：WDS 提供 PXE 引导，MDT 提供任务序列，SCCM 做分发与合规。

---

### Q12. 批量装机（PXE）的原理和常见卡点？【中】

流程：客户端网卡 PXE ROM → DHCP 发地址并给 `next-server`/引导文件名 → TFTP 下载引导程序 → 进入 WinPE → 连部署共享拉镜像 → 套任务序列装完。

```text
DHCP 选项（IPv4）：
  066 Boot Server Host Name   = 10.0.0.20
  067 Bootfile Name            = boot\x64\wdsnbp.com
```

卡点清单：

- **DHCP 不在同一网段**：要配 IP Helper / DHCP Relay，否则 PXE 广播过不去
- **有多个 DHCP**：第三方 DHCP 也回了地址但没给 066/067，客户端卡在 `TFTP timeout`
- **网卡驱动缺失**：WinPE 里认不到网卡，引导后无网络，需给 boot.wim 注入网卡驱动
- **安全启动/交换机防护**：端口安全或 DHCP Snooping 拦了 PXE

---

### Q13. 系统盘怎么分区？UEFI+GPT 和 Legacy+MBR 有什么差别？【高】

| 项 | UEFI + GPT | Legacy + MBR |
|---|---|---|
| 引导 | EFI 系统分区（ESP，FAT32，约 300 MB） | 活动主分区 + MBR 引导代码 |
| 磁盘上限 | 18 EB（实践无限制） | 2 TB |
| 分区数 | 128 个 | 4 主分区（或 3 主 + 扩展） |
| 安全启动 | 支持 | 不支持 |

给单机的推荐布局：**ESP 300 MB → MSR 16 MB → C: 系统盘 150~200 GB → D: 数据盘剩余**，并保留 WinRE 恢复分区。

坑：**把 C 盘分成 500 GB 是典型浪费**——系统盘越大，备份、还原、镜像抓取都越慢；用户数据放 D 盘，重装时只格式化 C。

---

### Q14. Windows 激活有哪几种方式？怎么保证授权合规？【高】

- **OEM/数字许可证**：绑定主板，重装同版本自动激活
- **MAK**：一次性密钥，按次数消耗，适合少量离线机器
- **KMS**：客户端连 KMS 主机激活，**180 天续期一次**，适合内网批量
- **订阅制**：Microsoft 365 / Windows 365，随账号走

```powershell
slmgr /dlv                 # 看激活类型、剩余次数、KMS 主机
slmgr /ato                 # 立即尝试激活
cscript //nologo C:\Windows\System32\slmgr.vbs /xpr
```

合规底线：**企业内不得使用破解工具或第三方激活器**，这是审计红线；KMS 主机必须由公司持有正版批量授权；资产台账里要记录每台机器的激活方式与密钥来源。

坑：换主板后数字许可证失效是正常的，需要走 Microsoft 账户重新关联或改走 MAK。

---

## 三、Windows 账户、域与组策略

### Q15. 本地账户和域账户有什么区别？日常该用哪个？【初】

| 项 | 本地账户 | 域账户 |
|---|---|---|
| 存储位置 | 本机 SAM | 域控 AD 数据库 |
| 能否跨机登录 | 不能 | 能，任意加入域的机器 |
| 密码策略 | 本机策略 | 域组策略统一 |
| 权限管理 | 本机管理员组 | 域组 + GPO |

日常原则：**登录用域账户（普通用户权限），本地 Administrator 仅作应急**，且密码由 IT 保管、定期更换。

**域账户离职禁用后本机缓存凭据仍可登录**——离线登录走的是缓存凭据（默认缓存 10 个），所以离职回收要同时清本机缓存或直接重装。

---

### Q16. 加域和退域怎么做？容易踩哪些坑？【中】

加域前四项检查：**计算机名规范、DNS 必须指向域控、时间与 DC 相差不超过 5 分钟、域管理员凭据可用**。

```powershell
Add-Computer -DomainName corp.example.com -Credential (Get-Credential) `
  -OUPath "OU=Workstations,OU=Shanghai,DC=corp,DC=example,DC=com" -Restart

# 退域（换域或报废前）
Remove-Computer -UnjoinDomainCredential (Get-Credential) -Restart
```

常见坑：

- **DNS 写了 8.8.8.8**：找不到 SRV 记录，报「找不到域控制器」，加域必失败
- **计算机名重复**：先改名再加域，加完再改名要重启两次
- 退域后本地账户仍在，但**用户配置文件（`C:\Users\<user>`）保留原样**，域账户 `CORP\user` 与本地 `user` 是两个目录
- 加域机器**不要用本地管理员长期登录**，配置文件会分裂

---

### Q17. OU 与组策略的继承、优先级是怎么算的？【中】

处理顺序 **LSDOU**：Local → Site → Domain → OU（**子 OU 后处理，覆盖父 OU**）。

- 同一容器内多条 GPO 按 **Link Order，数字小的优先级高**
- **Block Inheritance**（阻止继承）在 OU 上打断父级
- **Enforced**（强制）覆盖 Block Inheritance，且**强制优先于一切**，这是唯一能压住子 OU 的开关
- 冲突项按「最后写入胜出」，非冲突项累加

```text
corp.example.com
└─ Shanghai
   └─ Workstations        [GPO-A Link Order 1] [GPO-B Link Order 2]
      └─ Finance          [GPO-C]  ← 处理后生效，覆盖 A/B 的冲突项
```

坑：排查时永远先跑 `gpresult /h`，看实际生效的 **Applied GPOs / Denied（Security Filtering）/ Filtered（WMI Filter）**，别凭结构图猜。

---

### Q18. 映射网络驱动器、桌面背景、禁用 USB、密码策略，分别在哪配？【中】

都在 `计算机配置` 或 `用户配置 → 策略/首选项` 下，路径要背得住：

| 需求 | 路径 |
|---|---|
| 映射盘 | 用户配置 → 首选项 → Windows 设置 → 驱动器映射（`User Configuration\Preferences\Drive Maps`） |
| 桌面/壁纸 | 用户配置 → 管理模板 → 桌面 → 桌面壁纸 |
| 禁用 USB 存储 | 计算机配置 → 管理模板 → 系统 → 可移动存储访问 → 所有可移动存储类：拒绝所有访问 |
| 密码策略 | 计算机配置 → Windows 设置 → 安全设置 → 账户策略 → 密码策略（**只在域根/域控 OU 生效**） |
| 屏幕保护/锁屏 | 用户配置 → 管理模板 → 控制面板 → 个性化 |

坑：**密码策略放在普通 OU 不生效**，它属于账户策略，必须链接到域根或 Domain Controllers OU；USB 管控用「拒绝所有访问」会把键盘鼠标一起废掉，要做白名单（按设备 ID 放行 HID）。

---

### Q19. 策略不生效怎么排查？`gpupdate` 和 `gpresult` 怎么用？【中】

固定四步，别重启瞎试：

```powershell
gpupdate /force /boot /logoff      # 强制刷新，/boot /logoff 处理需重启的项
gpresult /r /scope:computer        # 简洁结果：应用了哪些、被谁拒绝
gpresult /h C:\temp\gp.html        # 详细报告，含获胜 GPO 与冲突明细
Get-GPO -All | Where-Object { $_.GpoStatus -ne 'AllSettingsEnabled' }
```

判读顺序：

1. **组策略有没有下发到机器**：`gpresult` 里 GPO 列表为空 → 检查链接、安全筛选（机器要在 `Authenticated Users` 或指定组的 **Read + Apply**）
2. **被谁挡住**：报告里的 `Denied`（安全筛选）/ `Filtered`（WMI Filter）
3. **赢了但没效果**：项本身是「用户配置」而你在验证计算机，或需要注销/重启
4. **慢处理**：客户端有 **90 分钟 ± 随机 30 分钟** 的后台刷新周期

---

### Q20. 漫游配置文件、文件夹重定向、UEV 怎么选？【高】

- **漫游配置文件**：整个 `C:\Users\<user>` 存到网络共享，登录/注销时同步。**登录慢、易损坏、大文件（`.pst`、缓存）会拖垮**，已不推荐
- **文件夹重定向**：只把「桌面、文档、图片、下载」指向网络路径，配合脱机文件。**现在的主流方案**
- **UEV / FSLogix**：只同步指定注册表与目录，适合 VDI 与多设备

```text
用户配置 → 策略 → Windows 设置 → 文件夹重定向
  → 基本：将每个人的文件夹重定向到同一位置
  → 目标：\\fileserver\users\%username%\Documents
  权限：用户对自身目录「完全控制」，共享权限「更改」
```

坑：重定向后**权限没给「创建者所有者完全控制」**，用户建不了文件；`%username%` 跟着改名走，改名后目录不会自动建，要手动补或用 `%USERPROFILE%` 变量替代。

---

### Q21. 域信任和 AD 站点是什么？跨站点登录慢怎么查？【高】

- **信任**：让两个域的用户互相认证，方向分单向/双向，类型有父子、树根、外部、林信任。**信任是认证通道，不自动给权限**，资源侧还要授组
- **站点（Sites & Subnets）**：把子网映射到站点，客户端按「**最近的 DC**」做 DC 定位（`DsGetDcName`），站点内复制 15 秒，站点间按 `Intersite Transport` 排期

登录慢的排查链：

```powershell
echo $env:LOGONSERVER              # 当前登录的是哪个 DC
nltest /dsgetdc:corp.example.com   # DC 定位结果与站点
nltest /sc_query:corp              # 安全通道状态
```

坑：**子网没登记到 Sites and Services**，客户端只能随便挑 DC，跨城 VPN 登录就慢到 1 分钟；加了新网段忘记加 Subnet 是这类问题的高频原因。

---

## 四、Windows 网络、共享与打印

### Q22. 桌面 IP、DNS、网关怎么配？静态地址怎么规划？【初】

```powershell
netsh interface ip show config
netsh interface ip set address "以太网" static 10.20.30.15 255.255.255.0 10.20.30.1
netsh interface ip set dns "以太网" static 10.20.30.10
ipconfig /flushdns
```

规划原则：**按部门/楼层划 VLAN 与网段，DHCP 保留区留给打印机与服务器，静态地址只给必须固定的设备**，并在 IPAM 或资产表里登记。

坑：**加域机器的 DNS 必须是内网 DC**，写公网 DNS 会解析不到域、组策略失效；改完 IP 用 `ipconfig /all` 复核，别只看图形界面。

---

### Q23. 共享权限和 NTFS 权限叠加规则是什么？【中】

最终权限 = **共享权限 ∩ NTFS 权限**（取交集），NTFS 内部再按「**拒绝 > 允许**，累加用户所在所有组」计算。

| 层级 | 作用范围 | 建议 |
|---|---|---|
| 共享权限 | 仅网络访问 | 统一给 `Everyone 完全控制`（或 `Authenticated Users 更改`） |
| NTFS 权限 | 本地 + 网络 | **精细控制放这里**，唯一真实权限来源 |

业内通行做法：**共享权限给宽、NTFS 收窄**，这样本地登录和网络访问行为一致，排查只有一处。

```powershell
icacls "D:\share\finance"
icacls "D:\share\finance" /grant "CORP\fin-read:(OI)(CI)(RX)" /T
```

坑：`(OI)(CI)` 是继承标记，漏了它只对当前文件夹生效；`拒绝` 权限优先于一切允许，重排权限时先删拒绝项。

---

### Q24. 映射网络驱动器有哪几种方式？断线重连怎么处理？【初】

- 临时：`net use Z: \\fs01\share /user:CORP\user *`
- 持久：`net use Z: \\fs01\share /persistent:yes`，对应注册表 `HKCU\Network\Z`
- 组策略首选项 Drive Maps（推荐，可统一、可删除、可按 OU 差异化）
- 登录脚本 `net use`（老环境）

```powershell
net use * /delete /y            # 清掉所有残留映射
net use Z: /delete              # 删单个
Get-SmbMapping                  # 查看当前会话映射
```

坑：**凭据冲突**（一台机器连了两个不同账号的共享）会报「多重连接不允许」，先 `net use * /delete` 再重连；断线红叉一般是网络切换或休眠后 SMB 会话失效，`net use Z: /delete` 后重连即可。

---

### Q25. 打印机怎么装、怎么共享？驱动问题怎么绕？【初】

- **网络打印机**：`控制面板 → 设备和打印机 → 添加打印机 → 按 IP 添加`，或直接 `\\打印服务器\打印机名`
- **共享打印机**：打印服务器装驱动并共享 → 客户端走 `\\printserver\HP-402` 自动拉驱动
- **驱动不匹配**：64 位客户端连 32 位驱动共享会失败，需在服务器上同时装 x86/x64 驱动（Print Management → 驱动程序）

```powershell
Add-PrinterPort -Name "IP_10.20.30.50" -PrinterHostAddress "10.20.30.50"
Add-Printer -Name "HP-402-3F" -DriverName "HP LaserJet M402" -PortName "IP_10.20.30.50"
Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus
```

坑：`Windows 无法连接到打印机，错误 0x0000011b` 是补丁收紧 RPC 认证导致，根治是服务器侧修驱动/用 IP 直连，临时方案要改注册表 `RpcAuthnLevelPrivacyEnabled`，**改之前先报备安全**。

---

### Q26. 打印任务卡在队列里删不掉，怎么处理？【中】

按「软 → 硬」四步：

1. 清队列：`控制面板 → 设备 → 右键 → 查看现在正在打印什么 → 取消所有`
2. 停服务清 spool：**必须停服务再删**，否则文件被占用删不掉

```powershell
Stop-Service Spooler -Force
Remove-Item C:\Windows\System32\spool\PRINTERS\* -Force
Start-Service Spooler
```

3. 重启打印机电源 + 检查纸盒/卡纸/碳粉（**很多"卡队列"其实是设备侧报错**）
4. 换端口测试：TCP/IP 端口改成 `RAW 9100`（部分驱动用 LPR 会卡）

坑：只删文档不停服务，`PRINTERS` 目录里残留的 `.SPL/.SHD` 会让队列一直「正在删除」；网络打印还要看打印机 IP 是否被 DHCP 换掉（做的第一件事应该是 ping 一下打印机）。

---

### Q27. 代理和 PAC 怎么配？内网外网都要通怎么设计？【高】

三种模式：

- **全局代理**：所有流量走代理，简单但内网访问要写例外
- **PAC（自动配置脚本）**：按域名/网段分流，最常用
- **透明代理/网关级**：用户无感，桌面侧不配

```text
# proxy.pac 关键逻辑：内网直连，其余走代理
function FindProxyForURL(url, host) {
  if (isPlainHostName(host) || shExpMatch(host, "*.corp.example.com")) return "DIRECT";
  if (isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0")) return "DIRECT";
  return "PROXY proxy.corp.example.com:8080; DIRECT";
}
```

客户端配置：`设置 → 网络和 Internet → 代理 → 使用设置脚本`，或组策略统一分发；命令行验证 `netsh winhttp show proxy`（**系统级代理和用户级代理是两套**，很多程序只认 WinHTTP）。

坑：PAC 文件放在内网 HTTP 上，出差/VPN 未连时取不到脚本，浏览器会回退直连导致全部超时——**PAC 要放在可公网访问或本地缓存的位置**。

---

### Q28. VPN 连不上或连上访问不了内网，怎么排？【高】

分层排查，先看隧道再看路由：

1. **认证层**：账号密码/证书/双因子是否过期，客户端日志有没有 `authentication failed`
2. **隧道层**：是否拿到内网 IP（`ipconfig` 看虚拟网卡），有没有 `隧道已建立`
3. **路由层**：分流模式（全局 vs 指定网段）是否覆盖目标网段

```powershell
ipconfig /all | Select-String -Context 0,6 "PPP"
route print -4
Test-NetConnection 10.20.30.10 -Port 445
nslookup fs01.corp.example.com 10.20.30.10
```

常见结论：

- 能 ping 通 IP 但域名不通 → **DNS 没走内网**，把虚拟网卡的 DNS 指到内网 DC
- 只有部分网段不通 → 服务端**下发的路由表**缺该网段，或本地已有冲突路由抢了前缀
- 连上就断内网 → 全局模式把本地局域网也吞了，加 `split tunnel` 例外

坑：**分流的优先级永远高于 VPN**，家里路由器和公司网段撞号（都是 192.168.1.0/24）时，访问内网实际打到了自家路由器。

---

## 五、Windows 常见故障排查

### Q29. 蓝屏怎么读 dump？【中】

先确认转储类型：`系统属性 → 高级 → 启动和故障恢复`。小内存转储 `C:\Windows\Minidump\*.dmp`（256 KB），完整转储 `C:\Windows\MEMORY.DMP`。

```powershell
# 用 WinDbg / kd 打开 dump
windbg -z C:\Windows\Minidump\102826-12345-01.dmp
g            # 重新加载
!analyze -v  # 关键：Stop Code + 可疑模块
lmvm nt      # 内核版本
!irp         # IRP 相关崩溃
```

判读要点：

- **Stop Code**：`0x7E` 系统线程异常、`0x50` 页错误、`0x9F` 驱动电源、`0xEF` 引导驱动、`0xD1` 驱动越界写
- **`Probably caused by`** 后面那个 `.sys` 就是嫌疑驱动（网络类看 `ndis.sys` 上游，存储类看 `storport.sys`）
- `!analyze -v` 里 **BugCheck 参数 4** 常直接给出出错的地址或文件名

坑：dump 里的 `Probably caused by` 只是「崩溃现场」，不一定是元凶；**看 `MODULE_NAME` 和最近一次驱动/补丁更新时间**，八九不离十。

---

### Q30. 开机进不了系统，启动修复和 bootrec 怎么用？【中】

进恢复环境（WinRE）后按「先诊断、再重建」：

```text
bootrec /scanos        # 扫描已安装的 Windows
bootrec /fixmbr        # 重写 MBR（Legacy 引导）
bootrec /fixboot       # 重写引导扇区（UEFI 下常报拒绝访问，属正常）
bootrec /rebuildbcd    # 重建 BCD
bcdedit /enum all      # 查看引导项
```

UEFI 机器更稳的做法是重建 BCD 而不是 `fixboot`：

```text
diskpart → list volume → （确认 ESP 盘符，如 S:）
bcdboot C:\Windows /s S: /f UEFI
```

坑：`rebuildbcd` 报「找不到系统」通常是**引导分区没挂载**或 C 盘不是当前系统盘；如果 ESP 被格式化过，必须 `bcdboot` 重新生成；**做完引导修复再跑一次 `chkdsk C: /f`**，文件系统损坏会反复坏引导。

---

### Q31. explorer.exe 崩溃、桌面黑屏或任务栏消失，怎么处理？【初】

先恢复可用，再查根因：

```powershell
Stop-Process -Name explorer -Force    # 结束并自动重启
# 若没自动起：
Start-Process explorer.exe
# 黑屏但能开任务管理器：文件 → 运行新任务 → explorer.exe
```

再查原因：

- **开机自启的第三方 shell 扩展**（右键菜单、输入法、网盘挂载）——用 `shell:startup` 与 Autoruns 逐个禁用
- **显卡驱动异常**：`Win + Ctrl + Shift + B` 重启显卡驱动，黑屏闪烁属于此类
- **系统文件损坏**：`sfc /scannow`、`DISM /Online /Cleanup-Image /RestoreHealth`
- **用户配置文件损坏**：新建本地账户测试，正常就迁移数据

坑：一上来就「重装系统」是最差答案；**先建新用户测试**，能区分是「用户配置文件坏了」还是「系统级问题」，省一小时。

---

### Q32. 软件装不上，报 0x80070005 或 2503/2502，怎么办？【中】

按错误码分类，先看日志再看权限：

| 错误 | 含义 | 处置 |
|---|---|---|
| `0x80070005` | 拒绝访问 | 用管理员运行、检查 `Program Files` 与注册表 ACL、临时关杀软 |
| `2503 / 2502` | MSI 无法访问临时目录 | 给 `C:\Windows\Temp` 赋权（见下） |
| `0x80070643` | 安装过程中致命错误 | 看 `%TEMP%\MSI*.log`，多为残留旧版本 |
| `0x80070652` | 另一个安装正在进行 | 结束 `msiexec`、重启 Windows Installer 服务 |

```powershell
# 2503/2502 的标准修法
$p = "C:\Windows\Temp"
icacls $p /grant "Everyone:(OI)(CI)F"
msiexec /i "\\fs01\deploy\app.msi" /qn /l*v C:\temp\install.log
```

坑：**杀软/EDR 把安装包当可疑文件静默拦截**，日志里看不到任何权限错误，只有「安装程序提前结束」——先在 EDR 控制台看拦截记录。

---

### Q33. 输入法、字体、时区这类小问题为什么会反复出现？【初】

因为它们**依赖用户配置文件与系统区域设置**，一旦镜像层配错，全公司一起错：

- **输入法丢失**：语言栏设置写在用户配置，重装后只剩「微软拼音」——用组策略/Intune 下发输入法列表，别让用户自己加
- **字体缺失**：CAD、票据打印、公文类软件依赖特定字体（宋体/仿宋/方正），字体要**装到系统级**（`C:\Windows\Fonts`）而不是用户级
- **时区/时间不对**：`w32tm /resync` 强制同步内网 NTP；时区用组策略统一，否则日历、双因素令牌、证书全部错乱

```powershell
tzutil /g                          # 当前时区
tzutil /s "China Standard Time"
w32tm /resync /force
Copy-Item D:\fonts\*.ttf C:\Windows\Fonts\   # 系统级装字体，需管理员
```

---

### Q34. 事件查看器该怎么用？盯哪几个日志？【中】

**事件查看器不是"翻日志"，是按 ID 查结论**。桌面运维常看四个日志：

| 日志 | 位置 | 关注点 |
|---|---|---|
| System | `Windows 日志 → 系统` | 服务崩溃（7000/7009）、磁盘错误（7/51）、驱动（219） |
| Application | `Windows 日志 → 应用程序` | 应用崩溃（1000/1002）、MSI 安装（11707/11708） |
| Security | 安全日志 | 登录成功（4624）/失败（4625）/锁定（4740） |
| 应用与服务日志 | 各组件独立 | 打印（`Microsoft-Windows-PrintService/Admin`） |

```powershell
Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=(Get-Date).AddDays(-1)} |
  Select-Object TimeCreated, Id, ProviderName, Message -First 20

# 查谁把账号锁了
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4740} -MaxEvents 10
```

坑：**安全日志默认只有 20 MB 左右，很快被覆盖**，要做审计就得调大并转发到 SIEM；另外「错误红叉」80% 是噪声，**要看时间点是否和故障时间对得上**，否则会被误导。

---

### Q35. Windows Update 卡在「正在安装」或反复失败，怎么修？【中】

按顺序修，每步验证：

```powershell
net stop wuauserv; net stop bits; net stop cryptsvc
Rename-Item C:\Windows\SoftwareDistribution SoftwareDistribution.old
Rename-Item C:\Windows\System32\catroot2 catroot2.old
net start cryptsvc; net start bits; net start wuauserv

# 修组件存储与系统文件
DISM /Online /Cleanup-Image /RestoreHealth
sfc /scannow

# 重置更新组件（PS 的 Update 模块）
Reset-WindowsUpdateComponents.ps1   # 或手动重注册 wuaueng.dll 等
```

再看错误码：`0x80073712` 组件存储损坏、`0x800f081f` 缺源文件（需挂载同版本 ISO 作源）、`0x8024402c` 代理/WUS 服务器问题、`0x8007000e` 内存不足。

坑：**直接用第三方"更新修复工具"容易把组件注册搞乱**，后续连 DISM 都跑不起来；大版本升级失败优先看 `C:\$WINDOWS.~BT\Sources\Panther\setuperr.log`。

---

## 六、macOS 桌面运维

### Q36. macOS 装系统和 Time Machine 怎么做？【中】

- **安装系统**：App Store 下载安装器 → 制作 U 盘（`createinstallmedia`）→ 开机按 `Option` 选 U 盘 → 用「磁盘工具」抹盘（**APFS + GUID 分区图**）→ 装系统
- **Time Machine**：外置盘或网络共享（需支持 `SMB/AFP` 且开 `vfs objects = fruit` 之类兼容配置），首次备份要几小时

```bash
# 制作 U 盘安装器（U 盘会被抹掉，卷名必须是 MyVolume）
sudo /Applications/Install\ macOS\ Sonoma.app/Contents/Resources/createinstallmedia --volume /Volumes/MyVolume

# Time Machine 命令行
tmutil destinationinfo
sudo tmutil setdestination -a /Volumes/TM
tmutil startbackup --block
tmutil listbackups
```

坑：**Time Machine 不能替代归档**——它按小时/天滚动，盘满了会删最老的备份；要给关键数据另做一份冷备，并且**定期做恢复验证**，不然磁盘坏了才发现备份从未成功。

---

### Q37. macOS 管理员账户和标准用户怎么规划？sudo 怎么管？【中】

原则和 Windows 一致：**日常标准用户 + 单独的管理员账户**。

- 系统设置 → 用户与群组 → 添加账户，类型区分「管理员 / 标准 / 仅共享」
- 标准用户需要提权时，用「**管理员账户授权**」弹窗输入管理员密码，而不是切账户
- `sudo` 的执行记录在 **统一日志** 里，可审计

```bash
dscl . -list /Users UniqueID            # 列出所有用户及 UID
dseditgroup -o edit -a alice -t user admin   # 把 alice 加入 admin 组
sudo -l                                 # 当前用户可执行的 sudo 命令
sudo -u _www whoami                     # 以指定用户执行
```

坑：**root 默认禁用**，用 `dsenableroot` 开启后一定记得 `dsenableroot -d` 关掉；`admin` 组是「能 sudo」的关键，光把用户类型改成管理员不生效时要检查组成员。

---

### Q38. 钥匙串是什么？证书和密码问题怎么排？【中】

钥匙串（Keychain）是 macOS 的凭据仓库，分 **登录钥匙串（用户级）** 与 **系统钥匙串**。

- 保存：Wi-Fi、网站密码、证书私钥、应用令牌
- 加密：登录钥匙串用登录密码加密，**改密码时不同步会造成钥匙串锁死**
- 排障：`钥匙串访问` → 右键「锁定/解锁」→ 「钥匙串急救（First Aid）」

```bash
security list-keychains
security find-generic-password -s "Wi-Fi" -g     # 需授权访问
security unlock-keychain ~/Library/Keychains/login.keychain-db
security dump-keychain | grep -i "svce"
```

典型症状与结论：

- 反复弹「请输入钥匙串密码」→ 登录密码被 AD/本地改了但钥匙串没更新，**用旧密码解锁后改新密码**，或重建登录钥匙串
- 网页证书报「不受信任」→ 企业根证书没装到「**系统**钥匙串」并设为「始终信任」
- 安装描述文件后 Wi-Fi 连不上 → 描述文件下发的证书过期或被吊销

---

### Q39. macOS 装软件被 Gatekeeper 拦住怎么办？【中】

三层防护要分清：**Gatekeeper（来源检查）、公证（Notarization）、SIP（系统完整性保护）**。

- 「无法打开，因为来自身份不明的开发者」→ 系统设置 → 隐私与安全性 → 「仍要打开」，或右键 → 打开
- 「已损坏，无法打开」→ 多是 **quarantine 属性**导致，而不是真损坏：`xattr -dr com.apple.quarantine /Applications/App.app`
- 企业内部分发 → 用 **MDM 推送**（PPPC/描述文件）或给应用做签名+公证，不要教用户关 SIP

```bash
spctl --status                 # 查看 Gatekeeper 状态
spctl -a -vv /Applications/App.app   # 评估某应用是否被放行
codesign -dv --verbose=4 /Applications/App.app
```

坑：`sudo spctl --master-disable` 关掉 Gatekeeper 是**最差答案**，安全审计直接判不合格；正确解法是把内部应用签名并公证，或用 MDM 白名单。

---

### Q40. MDM 和描述文件是怎么管 Mac 的？【高】

MDM 通过 **APNs 推送**下发指令，设备侧靠「描述文件（Profile）」落地配置；用户手动装的描述文件叫「手动描述文件」，MDM 下发的叫「设备管理描述文件」。

- **注册**：用户自助通过 `Company Portal` / `自我注册` 完成，或在 DEP（Apple Business Manager）阶段自动注册
- **能力**：Wi-Fi/VPN/邮件账户、证书、限制项（禁 iCloud、禁 USB、强制 FileVault）、应用分发（VPP）、远程锁定与抹除
- **监管（Supervised）**：ABM/DEP 注册的机器才能做不可移除的 MDM、静默装应用、禁改设置

```bash
profiles -P                     # 列出已安装描述文件（-P 含 payload 详情）
sudo profiles renew -type enrollment   # 重新拉取注册
sudo profiles -e -o /tmp/profile.mobileconfig  # 导出
```

坑：**用户能在「系统设置 → 隐私与安全性 → 描述文件」里删掉非监管机的手动描述文件**，所以关键策略必须走监管 + MDM；MDM 证书过期会导致所有设备失联，**要提前 90 天换证书**。

---

### Q41. Mac 的 Wi-Fi、外接屏、SMB 共享、打印常见问题怎么排？【中】

| 现象 | 排查链 |
|---|---|
| Wi-Fi 连不上/频繁掉 | 忘记网络重连 → 换 5G 频段 → 检查 802.1X 证书 → `sudo wdutil info` 看 RSSI/信道 |
| 外接屏不亮 | 换线（**优先 USB-C 直连，避开廉价扩展坞**）→ `系统设置 → 显示器` 检测 → 按 `Option` 点「检测显示器」→ 合盖模式需接电源与键鼠 |
| SMB 共享连不上 | `smb://fs01/share` → 用户名写 `CORP\user` 或 `user@corp.example.com` → 服务器侧要求 SMB2/3 签名 → 清 `~/Library/...` 里的旧凭据 |
| 打印机找不到 | 添加时选「IP」→ 协议 `Line Printer Daemon` 或 `IPP` → 驱动选「通用 PostScript」→ 检查是否被 MDM 下发了队列 |

```bash
sudo wdutil info | grep -Ei "ssid|rssi|channel|security"
networksetup -listallhardwareports
smbutil view -N //user@fs01
lpstat -p -d
```

坑：Mac 连 Windows 共享时**用户名格式**是头号问题（`CORP\user` 里的反斜杠在 shell 里要转义）；打印用 AirPrint 找不到时，用 `lpadmin` 命令行加队列最稳。

---

### Q42. macOS 常用终端命令有哪些？桌面运维至少该会哪些？【中】

按场景记，不用背全：**先会定位（谁占资源、哪个盘满、网络卡在哪），再会取证（版本、硬件、日志）**。

```bash
# 系统与硬件
sw_vers                          # 系统版本
system_profiler SPHardwareDataType SPStorageDataType
sysctl -n machdep.cpu.brand_string
ioreg -l | grep -i battery       # 电池循环次数/健康

# 磁盘与文件
df -h; diskutil list; diskutil apfs list
du -sh ~/* | sort -h | tail      # 快速找大目录

# 网络
ifconfig; netstat -an | grep LISTEN; lsof -i :8080
scutil --dns | head -20

# 服务与进程
launchctl list | grep -i corp
sudo launchctl print system/com.corp.agent
ps aux | sort -nrk 3 | head

# 电源与休眠
pmset -g; caffeinate -u -t 3600
```

坑：macOS 是 BSD 系，`sed -i` 要带备份后缀（`sed -i ''`）、`ps` 参数与 Linux 不同、`launchd` 而不是 `systemd`——**照抄 Linux 命令会静默出错**。

---

## 七、Linux 桌面运维

### Q43. 桌面发行版怎么选？Ubuntu、Deepin、麒麟各适合什么场景？【中】

| 发行版 | 优势 | 适用 |
|---|---|---|
| Ubuntu LTS | 生态最全、驱动与办公软件兼容好、社区文档多 | 研发、通用办公、需要最新硬件支持 |
| Deepin / UOS | 界面接近 Windows、国产化适配好、预装中文输入法与办公套件 | 普通办公用户过渡、国产化试点 |
| 麒麟（Kylin） | 信创目录内、等保与政务合规、软硬件适配认证齐全 | 党政、金融等要求国产化合规的场景 |

选型真正要问的是三个问题：**业务软件能不能跑、外设有没有驱动、出了问题谁支持**。桌面发行版的技术优劣远不如「生态与支持」重要。

坑：为了「界面好看」选小众发行版，结果打印机、指纹、投屏全没驱动，最后整批回退——**先做 5 台试点跑两周真实业务，再批量铺**。

---

### Q44. Linux 桌面显卡驱动怎么装？NVIDIA 和开源驱动怎么选？【中】

- **开源（amdgpu / i915 / nouveau）**：装完即用，稳定，适合办公与日常
- **闭源 NVIDIA**：需要 CUDA 或高性能游戏/渲染才装，版本要和内核模块匹配

```bash
ubuntu-drivers devices            # 推荐驱动
sudo ubuntu-drivers autoinstall   # 自动装推荐版
nvidia-smi                        # 验证
lspci -k | grep -A3 VGA           # 看当前加载的驱动模块

# 安全模式重装（黑屏时）：卸载再装
sudo apt purge '^nvidia-.*'
sudo apt install nvidia-driver-550
```

踩坑清单：

- **内核升级后 NVIDIA 模块失效**（`nvidia-smi` 报 `Failed to initialize NVML`）→ 装 `dkms` 版本让模块自动重建
- **Secure Boot 下模块未签名**会被拒载，要 `mokutil --import` 注册密钥
- 双显卡笔记本黑屏/花屏 → 用 PRIME 或 `prime-select` 切换，别手动改 xorg.conf

---

### Q45. Linux 桌面输入法和中文字体怎么配？【中】

- **输入法框架**：`fcitx5`（主流）或 `ibus`，配 `fcitx5-rime` / 搜狗输入法 Linux 版
- **环境变量**：`GTK_IM_MODULE`、`QT_IM_MODULE`、`XMODIFIERS` 要统一，否则部分应用打不出中文
- **字体**：装 `fonts-noto-cjk`、`fonts-wqy-zenhei`，公文类还要装宋体/仿宋替代或商用授权字体

```bash
sudo apt install fcitx5 fcitx5-chinese-addons fcitx5-frontend-gtk3 fcitx5-frontend-qt5
# /etc/environment 里统一
GTK_IM_MODULE=fcitx
QT_IM_MODULE=fcitx
XMODIFIERS=@im=fcitx

fc-cache -fv            # 装完字体刷新缓存
fc-list :lang=zh | head # 验证中文字体
```

坑：**只改 `~/.xprofile` 不管用**，因为 Wayland 会话和 systemd 用户会话读不到；Java/Electron 应用有自己的输入法栈，要单独配 `XMODIFIERS`；字体没刷新缓存时 LibreOffice 里仍然显示方框。

---

### Q46. 包管理和软件源怎么维护？内网源怎么搭？【中】

- **dpkg + apt**（Debian 系）：`apt update && apt install`，`.deb` 用 `dpkg -i` 后 `apt -f install` 补依赖
- **rpm + dnf/yum**（RHEL 系）：`dnf install`，`.rpm` 用 `rpm -ivh`
- **应用层包**：`snap`、`flatpak`、AppImage（免安装，各有沙箱差异）

```bash
# 换源（Ubuntu 24.04 用 deb822 格式）
sudo sed -i 's|http://archive.ubuntu.com|https://mirrors.corp.example.com|g' /etc/apt/sources.list.d/ubuntu.sources
sudo apt update

# 离线装 .deb 及依赖
sudo apt install ./app.deb        # 自动解决依赖，优于 dpkg -i
sudo dpkg -i app.deb && sudo apt -f install   # 兜底
```

内网源：用 `apt-mirror` / `reprepro` / Nexus 做代理缓存，好处是**统一版本、可控、省带宽**，也是信创环境合规要求。坑：直接把公网源指向内网但没同步 `InRelease` 签名，`apt update` 报 `NO_PUBKEY`。

---

### Q47. Linux 桌面起不来（黑屏/循环登录）怎么排？【高】

先切 TTY（`Ctrl + Alt + F3`）拿控制台，再按层排查：

```bash
# 1. 看显示管理器状态
systemctl status gdm3     # 或 lightdm / sddm
journalctl -u gdm3 -b --no-pager | tail -50

# 2. 看图形栈日志
journalctl -b -p 3 --no-pager | tail -80
cat ~/.xsession-errors
ls -l /var/log/Xorg.*.log && grep -iE "EE|fail" /var/log/Xorg.0.log

# 3. 磁盘满/权限问题也会导致循环登录
df -h; df -i; ls -ld ~ ~/.Xauthority ~/.config
```

高频原因对照：

- **循环登录** → 家目录满、`~/.Xauthority` 属主错、`~/.config` 只读、shell 被改成 `/usr/sbin/nologin`
- **黑屏无光标** → 显卡驱动与内核不匹配、Wayland 兼容问题（临时切 Xorg 会话验证）
- **停在启动画面** → 上次更新中断，`apt --fix-broken install` 或 `dpkg --configure -a`

坑：**别急着 `rm -rf ~/.config`**，会连浏览器、输入法、桌面布局一起清掉；先备份再逐目录排除。

---

### Q48. Linux 桌面怎么远程？xrdp 和 VNC 怎么选？【中】

| 方案 | 协议 | 特点 |
|---|---|---|
| xrdp | RDP | 用 Windows 自带远程桌面客户端直连，**最贴近 Windows 用户习惯** |
| VNC (TigerVNC/TightVNC) | RFB | 跨平台、轻量，但性能与安全较弱 |
| NoMachine / AnyDesk | 私有 | 体验好，需商业授权或自建 |
| SSH X11 转发 | X11 | 只转发单应用，局域网可用 |

```bash
# xrdp 快速落地
sudo apt install xrdp
sudo systemctl enable --now xrdp
sudo adduser xrdp ssl-cert        # 关键：否则证书读不到
sudo ufw allow 3389/tcp
```

坑：

- **登录后是黑屏或新会话**：xrdp 默认起独立会话，要 `startwm.sh` 配成接管已有桌面（或用 `xorgxrdp`）
- **同一用户已本地登录**，远程再登录会冲突（GNOME 不允许重复会话），需开 `X11Forwarding` 或改用 VNC 镜像当前屏
- RDP 暴露公网极危险，**必须套 VPN 或跳板**，改端口不叫安全加固

---

### Q49. 国产化办公环境适配要注意什么？【高】

信创桌面不是「装上 Linux 就完事」，四个维度都要过：

- **硬件**：CPU 架构（ARM64 的鲲鹏/飞腾、x86 的海光/兆芯、LoongArch 的龙芯）决定软件包架构，**不能混装 x86 的 .deb**
- **系统**：麒麟、统信 UOS 各有版本分支与官方源，升级要走官方通道
- **应用**：WPS 专业版、国产浏览器（奇安信/360/红莲花）、OA 客户端、电子签章、版式文件（OFD）要逐项验证
- **外设**：打印机（奔图/立思辰）、高拍仪、读卡器、UKey 必须有对应架构的驱动

```bash
dpkg --print-architecture        # amd64 / arm64 / mips64el / loongarch64
uname -m
cat /etc/os-release              # 确认发行版与版本号
dpkg -l | grep -i wps
lsusb                            # UKey/读卡器识别情况
```

坑：**x86 的 Windows 软件不能直接跑**，要评估 Wine/虚拟机方案（麒麟自带 `kylin-wine`）或者推动业务方出 Linux 版；UKey 驱动常常只有 x86 版本，是信创落地最常见的卡点。

---

## 八、办公软件与协作工具支持

### Q50. Office 和 WPS 的许可与激活怎么管？【初】

- **Office 零售版**：绑定 Microsoft 账户，换机要解绑
- **批量版（Volume）**：MAK 或 KMS，企业首选 KMS，180 天续期
- **Microsoft 365**：订阅制按用户走，**同一账号最多 5 台设备**
- **WPS**：个人免费版 / 专业版（按年授权，有序列号或内网授权服务器）

```powershell
# Office 激活状态
cscript //nologo "C:\Program Files\Microsoft Office\Office16\OSPP.VBS" /dstatus
cscript //nologo "...\OSPP.VBS" /sethst:kms.corp.example.com
cscript //nologo "...\OSPP.VBS" /act
```

合规要点：**不用破解补丁、不用「一键激活工具」**；离职必回收 M365 席位；台账记录每人授权类型与到期日。

坑：同一台机器装了多个版本（2016 + 2019 + 365）会互相打架，`OSPP.VBS /dstatus` 显示多份密钥，激活状态混乱——先彻底卸载再装。

---

### Q51. 文档打开乱码、排版错乱、公式变图片，怎么处理？【中】

按「文件 → 字体 → 编码 → 软件版本」四层查：

- **乱码（文字变方块/问号）**：缺字体。中文常见 `宋体/仿宋_GB2312/方正小标宋`，把字体装到系统级再重开
- **排版错乱**：版本差异（WPS 与 Office 的段落/表格渲染不同）、缺少嵌入字体、打印机驱动导致分页变化
- **CSV 乱码**：编码问题，Excel 默认按 ANSI 打开，UTF-8 要「数据 → 从文本/CSV」导入并指定 UTF-8
- **高版本文件打不开**：`.docx/.xlsx` 在老版本需装兼容包

```powershell
# CSV 转 Excel 友好编码（保留 BOM 的 UTF-8）
Get-Content .\data.csv -Encoding UTF8 | Set-Content .\data_bom.csv -Encoding UTF8BOM
```

坑：**改文件后缀名不改变编码**（`.txt` 改 `.csv` 没用）；跨系统传文件用「另存为 → Excel 97-2003」反而丢格式，正解是统一版本 + 嵌入字体。

---

### Q52. 邮箱客户端怎么配？IMAP、POP3、Exchange 差别在哪？【中】

| 协议 | 行为 | 适用 |
|---|---|---|
| POP3 | 下载到本地，**默认服务器不留副本** | 单设备、需离线归档 |
| IMAP | 服务器为准，多端同步文件夹与已读状态 | 多设备、移动办公（主流） |
| Exchange / MAPI / EWS | 全功能（日历、联系人、共享邮箱、全局地址簿） | 企业邮箱首选 |
| SMTP | 只负责发信，端口 25/465/587 | 所有客户端都要配 |

```text
Outlook 手动配置示例（企业自建）
  接收 IMAP: mail.corp.example.com  993  SSL
  发送 SMTP: mail.corp.example.com  587  STARTTLS（需身份验证）
  用户名: CORP\alice 或 alice@corp.example.com（看服务端要求）
```

坑：**能收不能发**基本都是 SMTP 认证或端口被封（25 端口被运营商/云厂商屏蔽，改用 587）；Exchange 自动发现失败时，先确认 `autodiscover.corp.example.com` 的 DNS 与证书是否有效。

---

### Q53. 会议软件卡顿、麦克风没声音、共享屏幕黑屏，怎么排？【中】

按「设备 → 权限 → 带宽 → 服务端」顺序：

1. **设备层**：`设置 → 声音` 里选对输入输出设备（外接 USB 耳机常被识别成两个设备）
2. **权限层**：Windows 隐私设置里允许应用访问麦克风/摄像头；macOS 要在「隐私与安全性」授权
3. **带宽层**：会议软件看网络质量面板（丢包 > 3%、抖动 > 30ms 就会卡），优先有线、关掉后台同步
4. **服务端层**：企业防火墙要放行会议软件的 UDP 媒体端口段，只放 443 会导致降级或连不上

```powershell
Get-PnpDevice -Class AudioEndpoint | Select-Object Status, FriendlyName
Get-NetAdapterStatistics | Select-Object Name, ReceivedBytes, OutboundBytes
```

坑：**共享屏幕黑屏**在独显笔记本上极常见，是硬件加速冲突——在会议软件里关掉「使用硬件加速」即可；投屏卡顿先怀疑无线同频干扰，双频合一的企业 AP 尤其明显。

---

### Q54. 浏览器证书报错怎么判断是「证书问题」还是「网络问题」？【中】

看错误码区分，别一概说「网站有问题」：

| 报错 | 含义 | 处置 |
|---|---|---|
| `NET::ERR_CERT_AUTHORITY_INVALID` | 签发机构不受信任 | 装企业根证书到「受信任的根证书颁发机构」 |
| `NET::ERR_CERT_DATE_INVALID` | 本机时间不对或证书过期 | 校准时间 → `w32tm /resync`；再查证书有效期 |
| `NET::ERR_CERT_COMMON_NAME_INVALID` | 域名与证书不匹配 | 换正确域名访问，或证书 SAN 缺该域名 |
| `NET::ERR_CERT_REVOKED` | 证书被吊销 | 联系站点/安全团队 |
| `NET::ERR_CONNECTION_RESET` | 不是证书问题，是链路/中间设备 | 查代理、防火墙、SSL 解密设备 |

```powershell
# 直接看服务端证书链与有效期
$req = [Net.HttpWebRequest]::Create("https://intranet.corp.example.com")
$req.GetResponse() | Out-Null
$req.ServicePoint.Certificate | Format-List Subject, Issuer, GetEffectiveDateString, GetExpirationDateString
```

坑：企业 SSL 解密设备（上网行为管理）会重签证书，**不装它的根证书就全线报错**；反过来，私自把可疑证书加进信任库是安全事故。

---

### Q55. 内网系统打不开、提示「无法访问此网站」，怎么分层排查？【高】

按 DNS → 连通性 → 端口 → 应用 四层：

```powershell
nslookup intranet.corp.example.com 10.20.30.10   # 指定内网 DNS
Test-NetConnection intranet.corp.example.com -Port 443
tracert -d 10.20.30.20
curl.exe -vkI https://intranet.corp.example.com  # 看 TLS 与响应头
```

分层结论：

- **DNS 解析不到** → 客户端 DNS 指错、或记录只在某个 DC 上未复制
- **IP 通、端口不通** → 防火墙/安全组/主机防火墙拦了，或服务没监听
- **端口通、返回 502/503** → 应用层或反向代理问题，转三线
- **全公司都打不开但 ping 通** → 代理 PAC 把内网域名也代理了，PAC 里要加 `DIRECT` 例外

坑：**只 ping 通就报「网络没问题」是最常见的误判**，ICMP 通不代表端口通；反过来有设备禁 ping 也不代表不通。永远用 `Test-NetConnection -Port` 验证。

---

## 九、外设、驱动与硬件维护

### Q56. 打印机常见硬件故障怎么判断？【中】

先看面板提示，别一上来就拆：

| 现象 | 判断 | 处置 |
|---|---|---|
| 打印空白页 | 硒鼓封条未拆 / 碳粉耗尽 / 转印带故障 | 换硒鼓、检查封条 |
| 卡纸在定影处 | 纸张受潮或定影膜磨损 | 换纸、清理碎纸（**断电操作**） |
| 打印有纵向黑线 | 感光鼓划伤或清洁刮板脏 | 换鼓/清洁 |
| 频繁提示「缺纸」但纸盒有纸 | 传感器脏或纸型设置不符 | 清洁传感器、统一 A4 设置 |
| 网络打印时通时断 | 打印机 IP 被 DHCP 变更 | 改静态 IP / DHCP 保留 |

```powershell
# 网络打印机连通性四连
ping 10.20.30.50
Test-NetConnection 10.20.30.50 -Port 9100
Get-PrinterPort | Where-Object Name -like "IP_*"
```

坑：**卡纸后只抽纸不清理碎屑**，残片留在定影器里，下次必卡；激光机换硒鼓要断电，带电插拔会烧高压板。

---

### Q57. 投影和投屏连不上，怎么快速定位？【中】

先分清有线还是无线：

- **有线（HDMI/Type-C/VGA）**：`Win + P` 选复制/扩展 → 检查线材与转接头 → 换一台笔记本验证是机器还是投影的锅
- **无线（Miracast/投屏器）**：确认双方在同一网段、AP 未开「客户端隔离」、无线网卡支持 Wi-Fi Direct

```powershell
# 检查无线显示支持
Get-NetAdapter | Select-Object Name, InterfaceDescription, Status
netsh wlan show drivers | Select-String "无线显示|Wireless Display"
# 重启无线显示服务
Restart-Service -Name "WlanSvc" -Force
```

常见结论：

- **能搜到投屏器但连不上** → AP 开了客户端隔离，或投屏器与电脑不在同一 VLAN
- **连接后花屏/卡顿** → 5G 频段拥挤、距离远；改用有线或投屏器走 HDMI 直连
- **Mac 投屏找不到** → AirPlay 需要同网段且支持 mDNS，跨 VLAN 要做 mDNS 中继

坑：会议室「投屏突然全都不好使」多半是**交换机侧策略变更或 AP 隔离**，不是每台电脑的问题——先问网络组有没有动过配置。

---

### Q58. USB 设备识别不了，怎么系统化排查？【中】

```powershell
Get-PnpDevice -PresentOnly | Where-Object { $_.Status -ne 'OK' }
Get-PnpDevice -Class USB | Select-Object Status, FriendlyName, InstanceId
# 卸载后重扫
pnputil /scan-devices
# 看 USB 控制器与历史错误
Get-WinEvent -LogName System | Where-Object { $_.ProviderName -like "*USB*" } | Select-Object -First 10
```

排查顺序：

1. **物理层**：换口、换线、换电脑（三步定位是设备坏还是接口坏）
2. **供电层**：移动硬盘/高拍仪要外部供电或接后置口；USB Hub 不带电源会掉盘
3. **驱动层**：设备管理器卸载设备（勾「删除驱动程序」）→ 重新插拔 → `pnputil /scan-devices`
4. **策略层**：**组策略或安全软件禁用了 USB 存储**（「设备已被策略禁用」），这是企业环境高频原因
5. **电源管理**：`USB 选择性暂停` 导致休眠后掉设备，在电源选项里关掉

坑：键盘鼠标也失灵时，先排除是不是 USB 控制器整体掉了（换 PS/2 或远程进系统看设备管理器）；`未知 USB 设备（设备描述符请求失败）` 九成是线材或供电问题。

---

### Q59. 驱动冲突怎么判断？回退和干净卸载怎么做？【中】

判断依据：**装完新驱动/Windows Update 后开始出问题**（蓝屏、花屏、USB 失效、音频爆音），且时间点吻合。

```powershell
# 看驱动版本与日期
Get-CimInstance Win32_PnPSignedDriver |
  Where-Object { $_.DeviceName -like "*Display*" } |
  Select-Object DeviceName, DriverVersion, DriverDate, Manufacturer

# 设备管理器回退（图形界面：属性 → 驱动程序 → 回退驱动程序）
pnputil /enum-drivers                 # 列出第三方驱动包 (oemXX.inf)
pnputil /delete-driver oem12.inf /uninstall /force
```

干净卸载要点：

- **显卡驱动要用厂商 DDU 工具在安全模式下清**，普通卸载会残留注册表与 INF
- 芯片组/网卡驱动先用 `pnputil` 删旧 INF，再装新版
- **Windows Update 会自动把驱动换回来**，需组策略「关闭驱动自动更新」或「设备安装限制」

坑：`回退驱动程序` 按钮是灰的，说明旧驱动包已被清理（磁盘清理会删 `FileRepository`），此时只能手动装旧版本。

---

### Q60. 硬盘健康怎么判断？SMART 该看哪些项？【高】

先用 SMART 看**关键几项**，不要被几十个属性淹没：

| 属性 | ID | 危险信号 |
|---|---|---|
| Reallocated Sectors | 05 | 非 0 且增长 → 盘面坏道 |
| Current Pending Sector | C5 | 非 0 → 有不可读扇区，随时恶化 |
| Uncorrectable Sector | C6 | 非 0 → 已有数据读不出来 |
| Reported Uncorrect | 187 | 非 0 |
| Power-On Hours | 09 | 仅作寿命参考 |
| SSD Wear Leveling / Percentage Used | 5E/CA | 接近 100% 就该换 |

```powershell
Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus, OperationalStatus
Get-Disk | Select-Object Number, FriendlyName, HealthStatus
# 读取 SMART（需厂商工具或 smartmontools）
smartctl -a /dev/sda
Get-WinEvent -LogName System | Where-Object { $_.Id -in 7,11,51,153 } | Select-Object -First 20
```

**事件 ID 7（坏块）/ 51（分页错误）/ 153（IO 重试）反复出现 = 盘要坏了**，立刻备份再换盘。

坑：`HealthStatus = Healthy` **不代表盘没问题**，它只看 SMART 总体阈值；HDD 有异响、SSD 掉速严重都可能是「健康」的。

---

### Q61. 内存和电源故障怎么区分？【高】

症状高度重叠（随机蓝屏、重启、无法开机），靠特征区分：

| 特征 | 内存 | 电源 |
|---|---|---|
| 表现 | 随机蓝屏 `0x1A/0x50/0x3B`、程序崩溃、解压报错 | **高负载就重启/关机**、开机无反应、风扇转但无显示 |
| 复现 | 跑 `MemTest86` 或 Windows 内存诊断 | 加显卡负载或换大功率电源测试 |
| 其他 | 换插槽/单条测试能定位 | 摸外壳温度、听电源异响、看电容鼓包 |

```powershell
# Windows 内存诊断（重启后跑，结果在事件查看器 MemoryDiagnostics-Results）
mdsched.exe
# 查是否有内存相关崩溃
Get-WinEvent -FilterHashtable @{LogName='System'; Id=1001} |
  Where-Object { $_.Message -match 'Memory|内存' } | Select-Object -First 5
```

**交换法是最快的结论**：换一根已知良好的内存条 / 换一个电源，症状消失即定位。

坑：内存条「金手指氧化」用橡皮擦一下能好，但**别用手直接摸金手指**；电源功率不足时表现是「高负载瞬间断电」，用办公软件测不出来，必须跑负载。

---

### Q62. 硬件报修流程怎么走？【中】

标准链路：**报修判定 → 厂商报修 → 备件/上门 → 修复验证 → 资产更新**。

1. **判定是否在保**：查序列号（`wmic bios get serialnumber`），到厂商保修查询页确认
2. **收集证据**：故障现象、报错截图、事件日志、SMART 报告、已做的排查动作
3. **提交报修**：厂商热线/门户登记，记录**报修单号**，明确上门时间与备件类型
4. **数据处置**：送修前**拆下硬盘或确认已加密**，含敏感数据的机器必须走数据擦除审批
5. **回单验收**：修复后跑一遍稳定性测试（AIDA64/Prime95 15 分钟），更新资产台账的维修记录

坑：**没提前备份就送修**，厂商换主板后数据全没；另外「换个件就好了」也要登记维修历史，同一台机器一年修三次就该申请换新，别继续修。

---

## 十、账号身份与权限管理

### Q63. 入职开通、离职回收的标准动作是什么？【初】

**入职（开通）**：HR 系统触发 → 生成工号与账号 → 加对应部门组 → 分配邮箱、VPN、共享盘、业务系统 → 发初始密码（**首次登录强制改密**）→ 交付设备并登记资产。

**离职（回收）**：收到离职单 → **立即禁用账号**（不是删除）→ 断开 VPN/邮箱登录 → 收回设备与门禁卡 → 交接数据归属 → 满一个保留期后再删除。

```powershell
# AD 离职禁用 + 移出所有组 + 记录
Disable-ADAccount -Identity alice
Get-ADUser alice -Properties MemberOf | Select-Object -ExpandProperty MemberOf |
  ForEach-Object { Remove-ADGroupMember -Identity $_ -Members alice -Confirm:$false }
Set-ADUser alice -Description "离职 2026-10-28，工单 INC12345"
```

坑：**只禁用不移动 OU**，账号散落在原部门 OU 里，GPO 还在生效；离职账号被同事「借用一下」是重大事故——**共享账号一律视为安全事件**。

---

### Q64. 账号命名怎么定？唯一性怎么保证？【中】

常见规范：`名.姓`（`alice.zhang`）、`工号`（`e12345`）、`首字母+序号`（`zalb01`）。

选择原则：

- **唯一且稳定**：改名、转部门、结婚改姓都不影响登录名（**优先工号**）
- **可读**：便于在邮件、审批、审计里认人（纯工号可读性差，可加 `DisplayName` 补）
- **不与系统保留冲突**：避开 `admin`、`root`、`test`、`guest` 这类保留或高仿名

```powershell
# 重名检查
Get-ADUser -Filter "SamAccountName -eq 'alice.zhang'" -ErrorAction SilentlyContinue
Get-ADUser -Filter "DisplayName -like 'Zhang, Alice*'"
```

坑：**用姓名拼音做账号，重名和改名都是雷**（中国常见重名，`li.wei` 能凑出几十个）；账号一旦启用就不再改，改名只改 `DisplayName` 与邮箱别名。

---

### Q65. 多系统统一认证怎么做？LDAP、AD、SSO 的关系？【中】

- **AD**：微软的目录服务，底层就是 LDAP + Kerberos
- **LDAP**：通用目录访问协议，Linux、NAS、GitLab、Jira 都通过它对接 AD
- **SSO**：单点登录，用户登录一次可访问多个系统；协议有 SAML 2.0、OAuth2/OIDC、CAS

```text
典型链路
用户 → 企业 IdP（AD FS / Keycloak / Azure AD）
     → 各业务系统（SAML/OIDC 联邦）
     ← LDAP 同步用户与组（Linux/NAS 用 sssd 直连 AD）
```

落地要点：

- **单一身份源**：以 AD/IdP 为唯一权威，其他系统只做同步或联邦，**不要在业务系统里再建一套账号**
- **组映射**：用 AD 安全组映射到应用角色，权限跟着组走，人走组变
- **多因素**：对外暴露的系统（VPN、邮箱、OA）必须上 MFA

坑：Linux 用 `sssd` 直连 AD 要处理 **Kerberos 时间偏移（5 分钟内）** 与 `realm join` 的 DNS SRV 解析，这两条不通就永远 join 失败。

---

### Q66. 权限申请和审批怎么做才不乱？【中】

核心是**流程化 + 可审计 + 有到期**：

1. 申请走工单，写清「**系统 + 权限级别 + 原因 + 期限**」
2. 审批人 = **数据/系统的属主（Owner）**，不是 IT
3. IT 只做执行，不做判断——「IT 觉得可以给」是权限泛滥的根源
4. 执行后回填工单，附组名与生效截图

```text
权限矩阵示例（简化）
  系统        角色        审批人       期限
  文件服务器  fin-read   财务经理     长期（随岗位）
  ERP         采购录入   采购经理     长期
  VPN         全量       直属主管     90 天
  数据库只读  prod-ro    DBA 负责人   7 天
```

坑：**审批人写成「IT 主管」**，等于所有权限都由同一人兜底，既不合规也审不出来；申请单里不写期限，权限就永远不回收。

---

### Q67. 临时权限怎么管？到期怎么保证回收？【高】

**临时权限必须有到期时间，且到期自动失效，不依赖人记得。**

- 技术手段：AD 有 **临时组成员资格（Temporary Group Membership，AD 2016+）**，到期自动移除
- 脚本手段：定时任务扫描「临时权限台账」，到期前 1 天提醒、到期当天自动移除并通知

```powershell
# 临时加入组并设定到期时间（AD 2016 功能级别以上）
$exp = (Get-Date).AddDays(7)
Add-ADGroupMember -Identity "VPN-Users" -Members alice
Set-ADObject -Identity (Get-ADGroup "VPN-Users").DistinguishedName `
  -Replace @{member=@()}   # 简化写法，实际用 ADACL 或 Set-ADGroup 处理 TTL

# 台账式：到期扫描并回收
Get-Content D:\iam\temp-grants.csv | Import-Csv | Where-Object {
  [datetime]$_.ExpireAt -lt (Get-Date)
} | ForEach-Object {
  Remove-ADGroupMember -Identity $_.Group -Members $_.User -Confirm:$false
  "$($_.User) 已从 $($_.Group) 回收" | Out-File D:\iam\recycle.log -Append
}
```

坑：**靠日历提醒人工回收**，休假/换人就会漏，一年后审计发现几十个过期权限；临时权限要单独一个组（如 `VPN-Users-Temp`），别和长期组混在一起。

---

### Q68. 共享账号有什么风险？怎么治理？【高】

共享账号（`admin`、`guest`、部门公用 `finance01`）的四个问题：

- **不可追溯**：出事查不出是谁干的，日志全是同一个名字
- **无法回收**：一个人离职密码不换，前员工仍能登
- **密码扩散**：贴便签、存微信群，改一次全网通知
- **违反合规**：等保、ISO 27001 都明确要求「一人一账号」

治理路径：**先盘点 → 再拆分成个人账号 → 保留必要的「特权账号」并纳入密码库（PAM）**。

```powershell
# 找出长期无人使用/多人共用的账号线索
Get-ADUser -Filter {Enabled -eq $true} -Properties LastLogonDate, Description |
  Where-Object { $_.LastLogonDate -lt (Get-Date).AddDays(-90) } |
  Select-Object Name, SamAccountName, LastLogonDate, Description
```

坑：直接禁用公用账号会打断业务（如车间看板机），要**先找到实际使用场景再逐个替换**；确需保留的，用密码保险库 + 定期轮换 + 使用审批。

---

### Q69. 最小权限在桌面怎么落地？【高】

最小权限不是口号，桌面侧有五个具体动作：

1. **日常用标准用户**，管理员账户单独、改名、密码托管
2. **本地管理员组收紧**：只有 LAPS 托管的账号在里面，不给个人
3. **应用按需授权**：能装到用户目录的软件就别要管理员
4. **共享盘按组授权**，拒绝项不要滥用，权限随岗位调整
5. **定期复核**：每季度导出一次组清单，让业务确认

```powershell
# 本地管理员组成员盘点（LAPS 部署后应只剩托管账户）
Get-LocalGroupMember -Group "Administrators" | Select-Object Name, ObjectClass

# 域内高权限组盘点
Get-ADGroupMember "Domain Admins" | Select-Object Name, SamAccountName
Get-ADGroupMember "Enterprise Admins"
```

坑：**为了省事把所有人都加进本地管理员**（"不然装软件老找你"），一次勒索软件就全网加密；正解是用软件分发/自助提权工具（如 Intune、Make Me Admin）替代给管理员权限。

---

## 十一、终端安全、杀毒与合规

### Q70. 杀毒软件和 EDR 怎么选？部署时要注意什么？【中】

先分清定位：

- **杀毒（AV）**：靠特征库查已知恶意文件
- **EDR**：记录进程、网络、注册表行为，能做溯源与响应（隔离主机、拉取证据）
- **EPP**：AV + 行为防护 + 管理的合集

选型看四点：**检测能力（第三方测评）、对性能的影响、与现有平台的集成（SCCM/Intune/SIEM）、运维成本**。

部署要点：

```powershell
# 静默部署示例（以 MSI 包为例）
msiexec /i "\\fs01\deploy\edr-agent.msi" /qn /norestart SERVER=edr.corp.example.com
# 验证服务与连通性
Get-Service | Where-Object Name -like "*EDR*" | Select-Object Name, Status
Test-NetConnection edr.corp.example.com -Port 443
```

- **先小范围试点**：挑研发、财务各 5 台，跑一周看蓝屏率和性能占用
- **排他项要配**：把业务系统目录加入扫描排除，否则数据库/编译任务会被拖死
- **卸载保护必开**：否则用户自己就能卸载，等于没装

坑：**多套安全软件并存**（老 AV 没卸干净又装 EDR）会导致系统卡死、蓝屏，部署前必须先彻底卸载。

---

### Q71. 中了病毒或勒索软件，应急处置的步骤是什么？【高】

顺序是 **断、保、查、清、复、改**，任何一步乱序都会扩大损失：

1. **断网**：拔网线/禁用网卡（**不要关机**，内存里有证据，加密进程也可能在跑）
2. **保现场**：截图勒索信息、记录时间点、导出 `Get-WinEvent` 日志、保留可疑文件样本
3. **隔离影响面**：查同网段共享盘是否被写、其他机器是否有同特征（EDR 控制台看告警时间线）
4. **清除**：EDR 隔离/重装系统，**不要只杀毒后继续用**，持久化项（计划任务、服务、启动项）往往杀不干净
5. **恢复**：从**离线备份**恢复数据，恢复前确认备份未被加密
6. **改**：改所有相关口令、开 MFA、补漏洞、收紧共享权限

```powershell
# 快速看感染时间线（示例：异常服务与计划任务创建）
Get-WinEvent -LogName Security -MaxEvents 200 |
  Where-Object { $_.Id -in 4697,4698,7045 } | Select-Object TimeCreated, Id, Message
Get-ScheduledTask | Where-Object { $_.TaskPath -notlike "\Microsoft\*" } | Select-Object TaskName, State
```

**最贵的错：先删文件再断网**——证据没了、根因查不出，一周后同网段再爆一次。**勒索付款不是方案**，付了也常常解不开。

---

### Q72. 补丁管理和漏洞修复节奏怎么定？【中】

按漏洞**可利用性 + 暴露面**分级，而不是「有补丁就全推」：

| 级别 | 情形 | 时限 |
|---|---|---|
| 紧急 | 在野利用的 0day、蠕虫型漏洞（如永恒之蓝类） | 24~72 小时 |
| 高危 | CVSS ≥ 9.0 且终端可触达（浏览器、Office、VPN 客户端） | 7 天 |
| 中危 | 需本地权限或交互 | 30 天 |
| 低危 | 功能更新、非安全补丁 | 按季度窗口 |

```powershell
# 用 PSWindowsUpdate 或 WU API 检查缺失补丁
Get-WindowsUpdate -MicrosoftUpdate -Category "Security Updates"
# WSUS 侧：确认目标组、审批状态、失败客户端的错误码
wuauclt /reportnow
```

节奏落地：**先试点（IT 自己 + 5% 机器）→ 观察 3~5 天 → 分批灰度 → 全量**，每批都留回滚点（系统还原点或镜像）。

坑：**跳过试点直接全推**，一个网卡驱动类补丁能让整层楼断网；另外「补丁装完必须重启」——只装不重启等于没装，合规扫描永远不通过。

---

### Q73. USB 和移动介质怎么管控才既安全又不影响业务？【初】

分三档，不要一刀切：

1. **完全禁用**：涉密/财务/研发核心岗，组策略「所有可移动存储类：拒绝所有访问」
2. **只读**：「拒绝写入访问」，允许拷出（防数据外带）或允许拷入（防病毒带入），按场景选
3. **白名单**：按设备 ID 放行公司统一发放的加密 U 盘

```text
# 组策略位置
计算机配置 → 管理模板 → 系统 → 可移动存储访问
  - 所有可移动存储类：拒绝所有访问
  - 可移动磁盘：拒绝写入访问
计算机配置 → 管理模板 → Windows 组件 → 设备安装 → 设备安装限制
  - 禁止安装未由其他策略设置描述的设备（配白名单 ID）
```

```powershell
# 查当前策略是否生效
Get-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices\*"
# 查 U 盘设备 ID（做白名单用）
Get-PnpDevice -Class DiskDrive | Select-Object FriendlyName, InstanceId
```

坑：**「拒绝所有访问」会连 USB 键鼠一起废掉**（HID 也在可移动设备里），必须用白名单放行键盘鼠标；另外**只堵 USB 不管网络共享和邮件**，数据照样能出去。

---

### Q74. 数据防泄漏（DLP）在终端侧怎么落地？【高】

DLP 的本质是 **识别敏感数据 → 定义策略 → 拦截或审计 → 留证据**。

终端侧常见能力：

- **内容识别**：正则（身份证、银行卡）、关键字、文档指纹、水印
- **通道管控**：U 盘、打印、截屏、邮件、网盘、剪贴板
- **动作**：仅审计 / 弹窗提示 / 阻断 / 审批后放行

```text
落地顺序（不要一上来就阻断）
1. 只审计 2 周 → 看真实外发路径与误报率
2. 收紧到提示 + 记录，培训用户
3. 对高风险通道（U 盘、个人网盘）阻断，走审批放行
4. 定期出报表：事件数、Top 用户、Top 通道
```

```json
{
  "rule": "客户名单外发管控",
  "match": { "type": "regex", "pattern": "客户编号[:：]\\s*\\d{8}" },
  "channels": ["usb", "print", "webmail", "cloud_disk"],
  "action": "block_with_approval",
  "notify": ["security@corp.example.com"]
}
```

坑：**误报率高会直接摧毁 DLP 的可信度**，用户学会点「忽略」之后策略就形同虚设；所有阻断类策略都要有**审批放行通道**，否则业务会绕过 IT 用个人设备。

---

### Q75. 终端合规基线怎么检查？软件白名单怎么落地？【中】

基线检查就是「**对照清单逐项打分**」，通常包含：补丁级别、杀软在线、磁盘加密、屏幕锁定、管理员组人员、防火墙开启、Guest 禁用。

```powershell
# 一份可执行的基线体检脚本（节选）
$r = [ordered]@{}
$r['BitLocker']   = (Get-BitLockerVolume -MountPoint C:).ProtectionStatus
$r['Defender']    = (Get-MpComputerStatus).RealTimeProtectionEnabled
$r['Firewall']    = (Get-NetFirewallProfile | Where-Object Enabled -eq $false).Count -eq 0
$r['LocalAdmin']  = (Get-LocalGroupMember Administrators).Name -join ';'
$r['Guest']       = (Get-LocalUser Guest).Enabled
$r | Format-List
```

软件白名单三条路：

- **AppLocker**：按发布者/路径/哈希放行，`%ProgramFiles%` 放行、`%TEMP%` 与 `%APPDATA%` 禁跑
- **WDAC**：更彻底，内核级，适合高安全场景（配置复杂，需谨慎灰度）
- **EDR 应用管控**：按进程信誉阻断，运维成本最低

坑：**白名单一刀切会拦掉所有自研工具和安装包**，上线前必须先跑「仅审计」模式收集两周真实软件清单，否则第一天就全员停工。

---

## 十二、远程支持与软件分发

### Q76. 远程工具怎么选？向日葵、TeamViewer、RDP、AnyDesk 各适合什么？【中】

| 工具 | 协议/特点 | 适用 | 注意 |
|---|---|---|---|
| RDP | 系统自带，性能好 | 域内固定办公机、服务器 | 需要网络可达，**别暴露公网** |
| 向日葵/ToDesk | 国产、穿透好、易用 | 员工自助、外网设备 | 走厂商云，注意数据合规 |
| TeamViewer | 稳定、跨平台强 | 跨国/跨平台支持 | 商业授权贵，**免费版用于商用违规** |
| AnyDesk | 轻量、低延迟 | 弱网、老旧机器 | 同样需商业授权 |
| SCCM Remote Control | 与资产/工单集成 | 大企业内网 | 需 SCCM 客户端在线 |

选型要点：**内网优先系统自带或 SCCM，外网用有审计与二次确认的商业工具**；无论哪个，必须满足三条——**可审计（会话记录）、可管控（谁能连谁）、可断开（用户能拒绝/中断）**。

坑：把 RDP 3389 直接映射到公网是最常见的入侵入口，一年内必被打；**TeamViewer 免费版用于企业会被判定违规并断连**。

---

### Q77. 软件怎么批量静默安装？参数怎么找？【中】

核心是三件事：**安装包类型、静默参数、分发包方式**。

```powershell
# 常见安装包静默参数
msiexec /i app.msi /qn /norestart /l*v C:\temp\app.log
app.exe /S                       # NSIS（Inno/NSIS 系常见）
app.exe /silent /norestart       # InstallShield
setup.exe -s -f1"C:\temp\setup.iss"   # InstallShield 响应文件
setup.exe --silent --accept-license   # 部分 Electron/新版安装器

# 检测安装结果
Get-Package -Name "App*" | Select-Object Name, Version, ProviderName
```

参数不确定时：`app.exe /?`、安装目录里的 `.iss`/`setup.ini`、或用 `Process Monitor` 抓一次交互式安装的动作。

分发方式：SCCM 部署类型（含检测规则）、Intune Win32 应用、组策略启动脚本、PDQ Deploy、自写 PS 脚本 + 计划任务。

坑：**静默安装成功但用户首次打开要手动配**，解决方案是把配置写进安装参数或首启动脚本；另外 `msiexec` 的 `/qn` 遇到需要重启的包要加 `/norestart` 并**自己控制重启窗口**，否则中午批量重启会炸。

---

### Q78. 脚本怎么批量推送到终端？SCCM、Intune、GPO、Ansible 怎么选？【中】

| 方式 | 触发 | 适用 | 短板 |
|---|---|---|---|
| GPO 启动/登录脚本 | 开机或登录 | 域内 Windows，简单脚本 | 无回执、难排错 |
| SCCM 包/脚本 | 集合下发 | 大企业 Windows 全场景 | 需客户端在线 |
| Intune | 云侧下发 | 混合办公、外网设备 | 依赖 Azure/网络 |
| Ansible / SaltStack | SSH/WinRM | Linux 为主、混合环境 | Windows 需配 WinRM |
| 计划任务 + 共享脚本 | 定时 | 兜底方案 | 无编排、无汇总 |

```powershell
# 计划任务方式（无 MDM 时的兜底）：每天登录后跑一次清单脚本
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File \\fs01\scripts\inventory.ps1"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Corp-Inventory" -Action $action -Trigger $trigger `
  -User "SYSTEM" -RunLevel Highest -Force
```

要点：**脚本要从只读共享/HTTPS 拉取，避免本地版本漂移**；执行策略用 `-ExecutionPolicy Bypass` 或签名，别长期 `Set-ExecutionPolicy Unrestricted`。

坑：GPO 脚本**没有回执**，跑没跑通只能自己去日志翻，所以任何批量脚本都要写本地日志并回传（`\\fs01\logs\%COMPUTERNAME%.log`）。

---

### Q79. 资产台账怎么建、怎么巡检？【初】

台账最小字段：**资产编号、序列号、使用人、部门、位置、机型配置、系统版本、加域状态、加密状态、保修到期、领用日期**。

- **来源**：域内计算机对象（`Get-ADComputer`）+ 客户端上报脚本 + 采购单，三者合并去重
- **更新**：不是人工填表，而是**脚本定期上报**，人工只做异常处理

```powershell
# 每周采集一次并写入共享 CSV
$info = [PSCustomObject]@{
  Computer = $env:COMPUTERNAME
  Serial   = (Get-CimInstance Win32_BIOS).SerialNumber
  Model    = (Get-CimInstance Win32_ComputerSystem).Model
  User     = (Get-CimInstance Win32_ComputerSystem).UserName
  OS       = (Get-CimInstance Win32_OperatingSystem).Caption
  LastBoot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
  DiskFree = [math]::Round((Get-PSDrive C).Free/1GB,1)
}
$info | Export-Csv "\\fs01\asset\$env:COMPUTERNAME.csv" -NoTypeInformation -Encoding UTF8
```

巡检分日常与定期：日常看**在线率、磁盘余量、杀软在线、补丁合规**；定期（季度）做**实物盘点**，台账与实物不符就是最大的审计问题。

坑：台账只在上线时录一次，之后就烂掉——**必须让脚本自动上报**，否则一年后台账和现实差距大到没法用。

---

### Q80. 远程支持的安全边界在哪？【高】

四条红线：

- **不越权**：只做用户授权的操作，看到与工单无关的私人文件**不打开**
- **不留后门**：不装未经审批的远控软件、不留共享账号、不关闭安全软件
- **不泄密**：远程会话中的屏幕内容、口令不得外传；会话记录按合规要求留存
- **可审计**：会话有记录、有工单号、有开始结束时间

技术手段：企业版远程工具开启**会话录屏 + 二次确认 + 按角色授权**；RDP 走跳板机并记录；高危操作（删数据、改权限）要**双人复核**。

```powershell
# 查机器上有没有非授权远控软件（示例文件名关键词）
$suspicious = "sunlogin|todesk|teamviewer|anydesk|rustdesk|vnc"
Get-Process | Where-Object { $_.Name -match $suspicious } |
  Select-Object Name, Id, Path
```

坑：为了「方便下次再连」私自给用户装第三方远控并记下 ID 密码，一旦出事这条记录就是**无法解释的证据**——所有会话都应走企业统一入口。

---

### Q81. 远程操作用户电脑，隐私怎么处理？【高】

原则：**用户在场、目的明确、范围最小、过程可见**。

- **先征得同意**：明确告知要做哪些操作、大概多久，得到口头或书面确认
- **用户在场**：涉及个人目录、微信/QQ、照片时，要么用户自己操作，要么请用户临时关闭相关窗口
- **限定范围**：只看工单相关路径；需要看桌面文件时让用户指定
- **可中断**：明确告知「随时可以要求我停止」，并在用户提出时立刻停止
- **事后留痕**：会话记录 + 工单备注，涉及敏感数据的加签

```text
标准话术（远程前）
"接下来我要连上来处理打印机驱动，大概 10 分钟，过程中屏幕会共享，你可以在旁边看着，
随时可以让我停下。现在方便吗？"
```

坑：**趁用户不在偷偷连上去**，即使动机是好的，也会被视为安全事件；另外「顺手帮你清理了一下浏览器缓存」这类超范围操作，是投诉高发点。

---

## 十三、数据备份、迁移与资产

### Q82. 用户数据备份要覆盖哪些范围？【初】

不是「拷个桌面」就算备份，清单要固定：

- **桌面、文档、下载、图片、视频**（重定向后自动在网络上）
- **浏览器书签、密码、扩展**（Chrome/Edge 账号同步，或导出 `Bookmarks`）
- **邮件数据**：Outlook 的 `.pst/.ost`（`.ost` 只是缓存，**不能直接当备份**）
- **聊天记录**：微信/企业微信/钉钉的文件目录（`WeChat Files`、`Documents\WeChat Files`）
- **专用软件配置**：财务/设计软件的自定义模板、License 文件、加密狗驱动
- **输入法词库、字体、快捷方式**（低频但用户最在意）

```powershell
# 重装前的一键清单（示例，先只读不写）
$paths = @("$env:USERPROFILE\Desktop","$env:USERPROFILE\Documents","$env:USERPROFILE\Downloads",
           "$env:USERPROFILE\Pictures","$env:APPDATA\Microsoft\Windows\Recent")
foreach ($p in $paths) {
  $size = (Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  "{0,-60} {1,8:N2} GB" -f $p, ($size/1GB)
}
```

坑：**`.ost` 拷走以为备份了邮件**，结果账号一改就得重新同步；**浏览器密码若未导出，用户重装后全丢**，这是投诉第一名。

---

### Q83. OneDrive、企业网盘、文件服务器该怎么选？【中】

| 方案 | 优势 | 短板 | 适用 |
|---|---|---|---|
| OneDrive/SharePoint | 与 Office 深度集成、版本历史、随账号走 | 容量与合规受订阅限制，跨组织共享麻烦 | 日常办公文档、个人工作区 |
| 企业网盘（自建/ SaaS） | 权限细、可审计、支持大文件与预览 | 需要部署与运维，客户端体验参差 | 部门协作、设计素材、对外传输 |
| 文件服务器（SMB） | 稳定、权限模型成熟、性能好 | 远程访问需 VPN，无版本管理 | 内网重协作、财务/生产共享盘 |
| 归档存储（冷备） | 成本低 | 取回慢 | 历史数据、合规留存 |

选型建议：**个人工作文件 → OneDrive（配合 Known Folder Move 把桌面/文档重定向）；部门共享 → 文件服务器或企业网盘；对外交付 → 企业网盘带时效链接**。

```powershell
# Known Folder Move 状态
Get-ItemProperty "HKCU:\Software\Microsoft\OneDrive\Accounts\Business1" -ErrorAction SilentlyContinue
```

坑：**文件服务器当网盘用**，用户在外面没 VPN 就干不了活；反过来**把财务共享盘迁到个人 OneDrive**，权限模型直接崩掉——共享与个人要分开。

---

### Q84. 换机迁移的标准流程是什么？【中】

八步，一步不能少：

1. **确认新机配置**与用户软件清单（老机导出已安装列表）
2. **确认授权**：Windows/Office 许可、加密狗、专用软件序列号
3. **备份老机数据**（按 Q84 清单）
4. **新机装机 + 加域 + 装软件**
5. **迁移数据**（用户配置、邮件、浏览器、聊天记录）
6. **逐项验证**：打印机、共享盘、邮箱收发、业务系统登录
7. **老机处置**：数据擦除（`cipher /w` 或专业擦除工具）后入库/报废
8. **更新资产台账**（序列号、使用人变更）

```powershell
# 老机软件清单导出，作为新机安装依据
Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*,
  HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* |
  Where-Object DisplayName | Select-Object DisplayName, DisplayVersion |
  Sort-Object DisplayName | Export-Csv D:\softlist.csv -NoTypeInformation -Encoding UTF8
```

坑：**先擦老机再验证新机**——新机缺东西时老机已经没数据了，这条顺序错一次就够记一辈子。

---

### Q85. 硬盘快坏了，怎么抢救数据？【中】

原则：**先镜像，再操作，别反复通电尝试**。

1. **立即停止写入**：拔掉该盘，不要再往里拷文件，也不要在上面跑修复工具
2. **做全盘镜像**：用 `ddrescue`（Linux）或 HDDSuperClone 把盘镜像到健康盘，**先镜像再恢复文件**
3. **镜像上做恢复**：用 TestDisk/PhotoRec、R-Studio 从镜像里提数据
4. **物理故障（异响、认不到盘）**：立刻停手，送专业数据恢复，开盖尝试是毁灭性的

```bash
# ddrescue 分段镜像，先快后慢，保留日志可续
sudo ddrescue -f -n /dev/sdb /dev/sdc rescue.map    # 第一遍只抓好的块
sudo ddrescue -f -r3 /dev/sdb /dev/sdc rescue.map   # 第二遍重试坏块
```

坑：**用 `chkdsk` 修快坏的盘**是常见致命操作——它会大量读写，把快掉的盘彻底写死；**数据恢复前不要"格式化试试"**，格式化只会让后续恢复更难。

---

### Q86. 资产全生命周期怎么管？License 台账怎么做？【中】

生命周期五段，每段都有台账动作：

- **采购**：登记订单号、型号、序列号、保修起止、供应商
- **入库**：贴资产标签，录入台账，状态「在库」
- **领用**：绑定使用人与部门，签收记录，状态「在用」
- **维修**：记录故障现象、更换部件、维修单号（同一机器多次维修要触发换新评估）
- **报废**：审批 → 数据擦除 → 拆解/回收 → 状态「已报废」，保留证明

License 台账字段：**软件名、版本、授权类型（订阅/永久/并发）、数量、密钥或账号归属、到期日、责任人**。

```powershell
# 到期提醒（提前 60 天）
Import-Csv D:\asset\licenses.csv | Where-Object {
  [datetime]$_.Expire -lt (Get-Date).AddDays(60)
} | Sort-Object { [datetime]$_.Expire } |
  Select-Object Software, Seats, Expire, Owner
```

坑：**只记数量不记到期日**，License 到期当天全公司 Office 变只读；**并发授权按人数买**导致永久不够用，是典型的采购误判。

---

### Q87. 报废设备的数据怎么擦除？【高】

分三档，按数据敏感度选：

- **普通擦除**：`cipher /w:C:` 覆写空闲空间（只清未使用区域，**不是整盘擦除**）
- **整盘覆写**：多次随机覆写，HDD 有效，**SSD 不适用**（有磨损均衡与预留区）
- **SSD/eMMC**：用厂商工具或 `nvme format` / `hdparm --security-erase` 做 **Secure Erase**，或直接**物理销毁**
- **加密盘**：直接**销毁/丢弃密钥**即视为数据不可读（BitLocker/FileVault 场景最省事的方案）

```powershell
# Windows：查看 BitLocker 状态，确认"销毁密钥即等于擦除"
Get-BitLockerVolume C: | Select-Object MountPoint, ProtectionStatus, EncryptionMethod
# 整盘覆写（HDD，耗时按容量算，500GB 约需数小时）
cipher /w:C:\
```

```bash
# Linux HDD 覆写（确保写的是正确的盘，写错就是灾难）
lsblk -o NAME,SIZE,MODEL,SERIAL
sudo dd if=/dev/urandom of=/dev/sdX bs=4M status=progress
```

合规要求：**报废必须有擦除记录（谁、何时、用什么方法、哪台机器）并留证明**，含涉密数据的介质应物理销毁（粉碎/消磁）。

坑：`Format` 或「恢复出厂」**不等于擦除**，数据仍可恢复；只对 C 盘跑 `cipher /w` 而盘上还有 D 盘数据，等于没做。

---

## 十四、桌面故障场景实战

### Q88. 用户报「断网了，什么都打不开」，排查链是什么？【中】

按 **物理 → 链路 → 地址 → 解析 → 应用** 五层推，每层给出判断依据：

```powershell
# 1 物理/链路：网卡是否连接，有无 IP
Get-NetAdapter | Select-Object Name, Status, LinkSpeed
ipconfig /all
# 2 网关与外部连通
ping 10.20.30.1 -n 4
tracert -d 8.8.8.8
# 3 解析
nslookup www.example.com 10.20.30.10
ipconfig /flushdns
# 4 端口与代理
Test-NetConnection www.example.com -Port 443
netsh winhttp show proxy
```

结论对照：网卡「已断开」→ 线/交换机口；有 IP 但 ping 不通网关 → VLAN 或 DHCP 地址池耗尽（拿到 `169.254.x.x` 就是没拿到地址）；ping 通 IP 但域名不通 → DNS；DNS 正常但网页打不开 → 代理/防火墙。

坑：**「整个部门断网」先问网络组有没有变更**，再逐台处理；单台断网先 `ipconfig /release` + `/renew`，比点图形界面快。

---

### Q89. 一整层楼的打印机突然全部显示离线，怎么查？【高】

「全部离线」几乎不是打印机的问题，按**共享链路**倒查：

1. **打印服务器是否活着**：`Test-NetConnection printserver -Port 445`，能不能 `\\printserver` 打开共享
2. **Spooler 服务是否挂了**：服务器上 `Get-Service Spooler`，挂了所有队列集体离线
3. **网络是否隔离**：该楼层 VLAN 是否被改、交换机口是否 down、无线是否换了 SSID
4. **域信任/凭据**：机器账户密码失效（`nltest /sc_verify:corp`）会导致共享访问被拒
5. **组策略是否推错**：新下发的 GPO 删了打印机或改了端口

```powershell
Get-Service Spooler -ComputerName printserver
Get-Printer -ComputerName printserver | Select-Object Name, PrinterStatus, PortName
Get-WinEvent -ComputerName printserver -LogName "Microsoft-Windows-PrintService/Admin" -MaxEvents 20
```

坑：**挨个去重启打印机**是最费时的错误做法；先确认「是不是同一台打印服务器」，一台服务器挂掉就是全楼离线，重启 Spooler 三分钟解决。

---

### Q90. 域账号被锁死，用户改密码也登不上，怎么处理？【中】

先解锁，再找**是谁在反复用旧密码**，否则解开五分钟又被锁。

```powershell
Unlock-ADAccount -Identity alice
# 找锁定来源：域控安全日志 4740（账号被锁定）里有 Caller Computer Name
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4740} -MaxEvents 20 |
  Select-Object TimeCreated, @{n='Msg';e={$_.Message}} | Format-List
```

高频锁定源：

- 手机/平板上的**旧邮箱密码**在后台重试（Exchange ActiveSync）
- 映射的网络驱动器用旧凭据重连
- 保存了旧密码的**计划任务或服务**（以该账号运行）
- 用户改了密码但**另一台电脑还开着**，一联网就撞锁

处置：找到 `Caller Computer Name` → 那台设备上清掉保存的凭据（`控制面板 → 凭据管理器`）→ 手机删掉重配邮箱账号 → 再解锁。

坑：**只解锁不找源头**，用户一天被锁五次；另外公司若配了「锁定阈值 5 次、锁定 30 分钟」，要注意别让用户反复试。

---

### Q91. 用户说「电脑特别慢」，怎么在两小时内给出结论？【高】

用数据分层定位，不靠感觉：

```powershell
# 1 资源占用 Top
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, CPU, WS
Get-Process | Sort-Object WS -Descending | Select-Object -First 10 Name, WS
Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk |
  Select-Object Name, PercentDiskTime, AvgDiskQueueLength
# 2 启动项与计划任务
Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location
# 3 磁盘健康与剩余空间
Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus
Get-PSDrive C
# 4 系统事件：磁盘错误、应用崩溃
Get-WinEvent -LogName System -MaxEvents 100 |
  Where-Object { $_.Id -in 7,11,51,129,153 } | Select-Object TimeCreated, Id, Message
```

四类结论：

- **磁盘 100% 占用 + `AvgDiskQueueLength` 高** → HDD 老化、杀软全盘扫描、Windows 更新在后台，换 SSD 是根治
- **内存不足** → 看 `WS` 总量与 `Hard Faults`，4G 内存跑新版 Office 就是不够
- **启动项过多** → 20+ 自启项，禁用非必要项立刻见效
- **CPU 长期高** → 挖矿/病毒/业务软件死循环，看进程签名与网络连接

坑：**直接重装系统**是「不讲证据」，且一周后原样变慢；先量数据再动手，用户才会信服。

---

### Q92. 共享盘提示「无权限访问」，可能的原因有几层？【中】

三层都要看，不要只盯 NTFS：

1. **共享权限**：`\\fs01\share` 的共享 ACL 里有没有该用户所在组（含 `Everyone`/`Authenticated Users`）
2. **NTFS 权限**：目录 ACL 是否给了 `读取和执行`，是否被**拒绝项**覆盖
3. **身份与网络**：实际用的是哪个账号（`whoami`、`net use` 里的用户），是否连过别人的凭据

```powershell
whoami
net use
Get-SmbMapping
# 服务器侧（有权限时）
Get-SmbShareAccess -Name share
icacls "D:\share" 
# 看有效权限
(Get-Acl "\\fs01\share").Access | Select-Object IdentityReference, FileSystemRights, AccessControlType
```

常见结论：**「多重连接」用错账号**（先 `net use * /delete /y`）；**组里加了人但用户没重新登录**（组成员资格要重新获取令牌，`klist purge` 后重新登录）；**权限给了用户但没给「遍历」**导致深层目录进不去。

坑：只查 NTFS 不查共享权限，两边不一致时永远解释不通；`拒绝` 项优先级最高，排查时先找 `Deny`。

---

### Q93. 邮件收不到，怎么快速判断是发件方、服务器还是客户端？【高】

按 **服务器 → 客户端 → 规则/容量** 三处查：

1. **服务器侧**：让对方提供退信（NDR）原文，看是 `550`（不存在/被拒）、`552`（超容量）、`554`（被判垃圾）
2. **邮件跟踪**：Exchange 用 `Get-MessageTrackingLog`，SaaS 邮箱用管理后台的投递日志，确认「有没有到服务器」「投递到哪个文件夹」
3. **客户端侧**：Outlook 是否在「脱机工作」、发送/接收组是否只同步部分文件夹、`.ost` 是否损坏
4. **规则与容量**：收件箱规则误删/移到其他文件夹、邮箱配额满、垃圾邮件隔离区里被拦

```powershell
# Exchange 侧追踪（示例）
Get-MessageTrackingLog -Sender "a@corp.example.com" -Recipients "b@corp.example.com" `
  -Start (Get-Date).AddDays(-1) | Select-Object Timestamp, EventId, RecipientStatus
# 客户端：重建缓存 / 看配额
Test-NetConnection outlook.office365.com -Port 443
```

坑：**只看客户端**会漏掉「邮件在服务器就被判垃圾拦了」；另外**用户自己建了规则**删掉某类邮件，是「收不到」的高频原因，一定要在 OWA/网页端交叉验证。

---

### Q94. 加密文件打不开，提示「拒绝访问」或要求证书，怎么处理？【高】

先分清是什么加密：

| 类型 | 识别 | 处置 |
|---|---|---|
| EFS | 文件名绿色、`cipher /c` 能看证书 | 需要**原用户证书+私钥**，导出 `.pfx` 后导入 |
| BitLocker | 整盘加密、开机要恢复密钥 | 用 48 位恢复密钥解锁（AD/Entra 里查） |
| Office 密码/IRM | 打开时要密码或登录 | 密码由创建者提供；IRM 需要权限策略账号 |
| 第三方加密软件 | 有专用客户端 | 走厂商/管理员账号解密，**不要强删** |

```powershell
cipher /c D:\secret.txt          # 查看 EFS 加密信息与用户
manage-bde -status C:            # BitLocker 状态
manage-bde -protectors -get C:   # 找恢复密钥 ID
certutil -user -store My         # 当前用户证书
```

关键结论：**EFS 的私钥丢了，数据基本救不回来**——这是 EFS 最大的坑，所以企业要么禁用 EFS，要么强制密钥归档（KRA）。

坑：**直接重装系统**会让 EFS 文件永久不可读；BitLocker 恢复了系统但没备份恢复密钥，等于自己把数据锁死。所有加密方案上线前必须解决「密钥怎么存、谁能取」。

---

## 十五、桌面运维脚本与自动化

### Q95. PowerShell 常用命令有哪些？服务、进程、注册表、WMI 各怎么查？【中】

按对象记，比背参数有用：PowerShell 的核心是**动词-名词**（`Get`/`Set`/`New`/`Remove` + 对象），拿到对象就能 `Where-Object` 过滤、`Select-Object` 挑列、`Export-Csv` 出报表，比 `cmd` 里截字符串稳得多。

```powershell
# 服务
Get-Service | Where-Object Status -eq 'Stopped'
Restart-Service -Name Spooler -Force
Set-Service -Name Spooler -StartupType Automatic
Get-Service -ComputerName pc-001 -Name Spooler    # 远程（需 WinRM）

# 进程
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, Id, CPU, WS
Stop-Process -Id 1234 -Force
Get-Process -Name chrome | Select-Object Name, Path, Company

# 注册表
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion" |
  Select-Object ProductName, CurrentBuild, UBR
Set-ItemProperty "HKCU:\Control Panel\Desktop" -Name Wallpaper -Value "D:\bg.jpg"
New-Item -Path "HKLM:\SOFTWARE\Policies\Corp" -Force

# WMI / CIM（取硬件与系统信息）
Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, TotalPhysicalMemory
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, Size, FreeSpace
Get-CimInstance Win32_Product   # 慎用：会触发 MSI 重新配置，很慢
```

坑：`Win32_Product` 每次查询都会触发 MSI 一致性检查，**在大批量脚本里会拖慢整机几分钟**，改用注册表 Uninstall 键枚举。

---

### Q96. 批量改文件名、批量替换内容怎么做？【中】

```powershell
# 批量重命名：把 "IMG_001.jpg" → "旅行_001.jpg"
Get-ChildItem D:\photos\*.jpg | ForEach-Object {
  $new = $_.Name -replace '^IMG_', '旅行_'
  Rename-Item -LiteralPath $_.FullName -NewName $new -WhatIf    # 先 -WhatIf 看结果
}

# 按序号统一改名
$i = 1
Get-ChildItem D:\scan\*.pdf | Sort-Object Name | ForEach-Object {
  Rename-Item -LiteralPath $_.FullName -NewName ("发票_{0:D3}.pdf" -f $i++)
}

# 批量替换文本内容（保留编码）
Get-ChildItem D:\cfg\*.ini -Recurse | ForEach-Object {
  (Get-Content $_.FullName -Raw -Encoding UTF8) -replace '10\.0\.0\.1', '10.0.0.2' |
    Set-Content $_.FullName -Encoding UTF8 -NoNewline
}
```

要点：**永远先 `-WhatIf` 或先输出到列表**；`-LiteralPath` 处理带方括号/通配符的文件名；`-Raw` 让 `-replace` 跨行生效，不加就按行处理。

坑：中文文件名脚本报错多半是**控制台编码**问题，脚本文件保存为 **UTF-8 with BOM**、或开头 `chcp 65001`；`Rename-Item` 遇到同名会直接报错，要加 `-ErrorAction` 或先判断。

---

### Q97. 登录脚本和开机脚本怎么写、怎么部署？【中】

- **登录脚本**：用户登录时执行，**用户权限**，适合映射盘、打印机、桌面快捷方式
- **开机脚本**：计算机启动时执行，**SYSTEM 权限**，适合装软件、写注册表、清缓存
- **部署**：组策略（用户配置/计算机配置 → 脚本）或 Intune/SCCM

```powershell
# 登录脚本示例：按部门映射盘 + 装打印机
$dept = (Get-ADUser $env:USERNAME -Properties Department).Department
switch ($dept) {
  'Finance' { net use F: \\fs01\finance /persistent:no }
  'HR'      { net use H: \\fs01\hr /persistent:no }
  default   { net use P: \\fs01\public /persistent:no }
}
if (-not (Get-Printer -Name 'HP-402-3F' -ErrorAction SilentlyContinue)) {
  Add-Printer -ConnectionName \\printserver\HP-402-3F
}
```

要点：**脚本要幂等**（重复执行结果一致）、**要写日志**（`Start-Transcript`）、**要有超时保护**（登录脚本卡住会拖慢登录，用户会以为死机）。

坑：组策略登录脚本**默认 600 秒超时**、且串行执行，脚本里加了 `Start-Sleep` 或等网络就会让登录慢到无法接受——需要等网络的逻辑放计划任务。

---

### Q98. 批量收集终端信息怎么做？怎么保证可靠？【中】

设计三原则：**只读、幂等、可汇总**。

```powershell
$ErrorActionPreference = 'SilentlyContinue'
$data = [ordered]@{
  Computer = $env:COMPUTERNAME
  User     = "$env:USERDOMAIN\$env:USERNAME"
  Serial   = (Get-CimInstance Win32_BIOS).SerialNumber
  Model    = (Get-CimInstance Win32_ComputerSystem).Model
  OS       = (Get-CimInstance Win32_OperatingSystem).Caption
  Build    = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").CurrentBuild
  DiskFreeGB = [math]::Round((Get-PSDrive C).Free/1GB, 1)
  Defender = (Get-MpComputerStatus).RealTimeProtectionEnabled
  CollectAt = (Get-Date).ToString('s')
}
$out = "\\fs01\inventory\$env:COMPUTERNAME.json"
$data | ConvertTo-Json | Set-Content $out -Encoding UTF8
```

可靠性要点：

- 输出**一机一文件**（`%COMPUTERNAME%.json`），避免多机同写一个 CSV 造成锁冲突
- 用**计划任务以 SYSTEM 运行**，不依赖用户登录
- 目标共享给**计算机账户**写权限（`Domain Computers` 修改），否则 SYSTEM 写不进去
- 采集失败也要写一条「失败记录」，否则永远不知道哪台机器掉队

坑：写共享盘用域内路径要带域名（`\\fs01.corp.example.com`）；笔记本长期离线会缺数据，得接受「最近上报时间」这个字段并定期催更。

---

### Q99. 脚本执行策略、签名和分发安全怎么处理？【高】

三件事：**执行策略（ExecutionPolicy）不是安全边界**，只是防误运行；真正的控制靠 **AppLocker/WDAC + 签名**。

```powershell
Get-ExecutionPolicy -List
Set-ExecutionPolicy RemoteSigned -Scope LocalMachine   # 本地脚本不签可跑，下载的必须签
# 单次运行绕过（不改变系统策略）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File \\fs01\scripts\x.ps1

# 自建代码签名（企业内部分发）
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Corp IT Scripts" `
  -CertStoreLocation Cert:\LocalMachine\My
Set-AuthenticodeSignature -FilePath .\inventory.ps1 -Certificate $cert -TimestampServer http://timestamp.digicert.com
Get-AuthenticodeSignature .\inventory.ps1 | Select-Object Status, SignerCertificate
```

落地建议：**脚本从内网只读共享/HTTPS 拉取**（集中版本控制），用组策略下发 `AllSigned` 并把企业签名证书装到「受信任的发布者」，这样只有 IT 签过的脚本能跑。

坑：`Set-ExecutionPolicy Unrestricted` 全公司铺开等于自废一层防护，还常被恶意脚本利用；另外**签名证书过期**会让所有脚本一夜之间全部无法执行，要提前续签。

---

### Q100. 自动化巡检报表怎么设计？【高】

目标：**每天一封邮件/一个看板，异常机器一眼可见**。

```powershell
# 巡检并出 HTML 报表（节选）
$rows = Get-Content "\\fs01\inventory\*.json" | ForEach-Object { Get-Content $_ -Raw | ConvertFrom-Json }
$alert = $rows | Where-Object {
  $_.DiskFreeGB -lt 10 -or $_.Defender -eq $false -or
  ([datetime]$_.CollectAt) -lt (Get-Date).AddDays(-3)
} | Select-Object Computer, User, DiskFreeGB, Defender, CollectAt

$html = $alert | ConvertTo-Html -Title "桌面巡检异常" -PreContent "<h2>异常清单</h2>" |
  Out-String
$html | Set-Content D:\report\inspect.html -Encoding UTF8
```

报表要素：**阈值明确**（磁盘 <10 GB、3 天未上报、杀软关闭、补丁超 30 天未打）、**责任人明确**（按部门分组发给对应工程师）、**可下钻**（点机器名能看详情）、**有趋势**（本周 vs 上周异常数）。

坑：报表只做「全量罗列」不做「异常过滤」，工程师看两次就不看了——**报表的价值在"要处理的"而不是"全部的"**；另外阈值定太严会天天告警，最后被规则忽略。

---

## 十六、桌面运维速记卡

### 必记快捷键与命令

| 场景 | 快捷键 / 命令 |
|---|---|
| 任务管理器 | `Ctrl + Shift + Esc` |
| 锁定屏幕 | `Win + L` |
| 投影/多屏 | `Win + P` |
| 重启显卡驱动 | `Win + Ctrl + Shift + B` |
| 快速打开运行 | `Win + R` |
| 资源管理器地址栏进 CMD | 地址栏输 `cmd` |
| 系统信息 | `Win + R` → `msinfo32` |
| 服务管理 | `services.msc` |
| 组策略编辑器 | `gpedit.msc`（专业版以上） |
| 事件查看器 | `eventvwr.msc` |
| 设备管理器 | `devmgmt.msc` |
| 磁盘管理 | `diskmgmt.msc` |
| 远程桌面 | `mstsc` |
| 强制刷新组策略 | `gpupdate /force` |
| 网络重置 | `netsh winsock reset` + `ipconfig /flushdns` |
| 系统文件修复 | `sfc /scannow` + `DISM /Online /Cleanup-Image /RestoreHealth` |

### 必记路径与端口

| 路径 / 端口 | 用途 |
|---|---|
| `C:\Windows\Minidump\` | 蓝屏小转储 |
| `C:\Windows\MEMORY.DMP` | 完整内存转储 |
| `C:\Windows\System32\spool\PRINTERS\` | 打印队列残留（停 Spooler 再删） |
| `C:\Windows\SoftwareDistribution\Download\` | 更新缓存 |
| `C:\Windows\WinSxS\` | 组件存储（**不可手删**） |
| `C:\Windows\System32\winevt\Logs\` | 事件日志文件 |
| `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` | 用户自启目录 |
| `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp` | 全局自启目录 |
| `C:\Users\<user>\AppData\Local\Temp` | 用户临时目录 |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` | 用户自启项 |
| `HKLM\SOFTWARE\Policies\Microsoft\Windows\` | 组策略落地位置 |
| `C:\Windows\System32\Sysprep\Panther\setuperr.log` | sysprep 失败原因 |
| 3389 / 445 / 139 | RDP / SMB / NetBIOS |
| 9100 / 515 / 631 | 打印 RAW / LPD / IPP |
| 53 / 88 / 389 / 636 / 3268 | DNS / Kerberos / LDAP / LDAPS / 全局编录 |
| 25 / 587 / 143 / 993 | SMTP / 提交 / IMAP / IMAPS |
| 1194 / 443 | OpenVPN / SSL VPN |

### 常见报错对照表

| 报错 | 大概率原因 | 第一动作 |
|---|---|---|
| `0x80070005` | 权限不足 | 用管理员运行、查目录 ACL |
| `0x80070002` | 文件/路径不存在 | 检查安装源与路径 |
| `2503 / 2502` | MSI 无 Temp 权限 | 给 `C:\Windows\Temp` 赋 Everyone 完全控制 |
| `0x80073712` | 组件存储损坏 | `DISM /Online /Cleanup-Image /RestoreHealth` |
| `0x800f081f` | 缺源文件 | 挂载同版本 ISO 作 `/Source` |
| `0x8024402c` | 代理 / WSUS 地址错 | 查 `netsh winhttp show proxy`、WU 策略 |
| `0x0000011b` | 打印 RPC 隐私级别收紧 | 服务器侧修驱动，或走 IP 直连 |
| 「找不到域控制器」 | DNS 未指向内网 DC | 改 DNS 为 DC 地址后重试 |
| 「此工作站和主域间的信任关系失败」 | 机器账户密码失效 | 退域重加，或 `Reset-ComputerMachinePassword` |
| 「账户已被锁定」 | 旧凭据反复重试 | 解锁 + 查 4740 的 Caller Computer |
| 「多重连接不允许」 | 同一服务器用了两个账号 | `net use * /delete /y` 后重连 |
| 「来自身份不明的开发者」（Mac） | Gatekeeper 拦截 | 右键打开或 `xattr -dr com.apple.quarantine` |
| `NO_PUBKEY`（Linux） | 源签名键缺失 | `apt-key` / `signed-by` 导入公钥 |

### 组策略位置速查

| 需求 | 路径（计算机配置 / 用户配置） |
|---|---|
| 映射网络驱动器 | 用户 → 首选项 → Windows 设置 → 驱动器映射 |
| 桌面壁纸 | 用户 → 管理模板 → 桌面 → 桌面壁纸 |
| 禁用 USB 存储 | 计算机 → 管理模板 → 系统 → 可移动存储访问 |
| 密码策略 | 计算机 → Windows 设置 → 安全设置 → 账户策略（**仅域根/DC OU**） |
| 屏幕锁定超时 | 计算机 → 安全设置 → 安全选项 → 交互式登录：计算机不活动限制 |
| 关闭驱动自动更新 | 计算机 → 管理模板 → Windows 组件 → Windows 更新 → 管理最终用户体验 |
| 打印机部署 | 用户 → 首选项 → 控制面板设置 → 打印机 |
| 软件限制（AppLocker） | 计算机 → Windows 设置 → 安全设置 → 应用程序控制策略 |
| 文件夹重定向 | 用户 → 策略 → Windows 设置 → 文件夹重定向 |
| 电源计划 | 计算机 → 管理模板 → 系统 → 电源管理 |

### 排查命令链速查

| 症状 | 命令链 |
|---|---|
| 断网 | `Get-NetAdapter` → `ipconfig /all` → `ping 网关` → `nslookup` → `Test-NetConnection -Port 443` |
| 蓝屏 | `WinDbg → !analyze -v` → 看 `MODULE_NAME` → 回退对应驱动 |
| 开机慢 | `任务管理器 → 启动` → `msconfig` → `Get-WinEvent -LogName System`（Id 100/200） |
| 系统卡 | `Get-Process -CPU` → `Win32_PerfFormattedData_PerfDisk_PhysicalDisk` → SMART |
| 磁盘满 | `Get-PSDrive` → 目录 Top → `WinSxS`/`SoftwareDistribution`/`hiberfil.sys` |
| 共享没权限 | `whoami` → `net use` → `Get-SmbShareAccess` → `icacls` |
| 打印卡住 | 停 `Spooler` → 清 `PRINTERS` → 启 `Spooler` → ping 打印机 |
| 策略不生效 | `gpupdate /force` → `gpresult /h` → 看 Denied/Filtered |
| 加域失败 | DNS 指 DC → `ping DC` → 时间差 <5min → `nltest /dsgetdc` |
| 邮箱收不到 | 退信原文 → 服务器跟踪日志 → 客户端规则与配额 |
| 入域机器信任失败 | `nltest /sc_verify:corp` → `Reset-ComputerMachinePassword` |
| Mac 装不上软件 | `spctl --status` → 右键打开 → `xattr -dr com.apple.quarantine` |

### 一句话速答

| 问题 | 一句话 |
|---|---|
| 共享权限和 NTFS 谁大 | 取交集，NTFS 更细；拒绝优先于允许 |
| 域账户和本地账户区别 | 域账户存 AD 可跨机，本地账户存 SAM 只在本机 |
| 组策略优先级 | LSDOU，子 OU 覆盖父 OU，Enforced 最高 |
| 密码策略为什么放普通 OU 不生效 | 它属于账户策略，只能链接域根或 DC OU |
| 用户配置文件在哪 | `C:\Users\<user>`，域账户含域名前缀 |
| 为什么重装后 C 盘又满了 | 更新缓存 + WinSxS + 休眠文件 + 用户数据没迁 D 盘 |
| 加域前必查什么 | DNS 指 DC、时间同步、计算机名唯一、凭据有效 |
| 能不能直接禁用所有 USB | 不行，会连键鼠一起废，要用白名单按设备 ID 放行 |
| SSID 和 VLAN 的关系 | 无线 SSID 映射到 VLAN，跨 VLAN 投屏要做 mDNS 中继 |
| EFS 私钥丢了怎么办 | 基本无解，所以企业要么禁用 EFS，要么强制密钥归档 |
| BitLocker 恢复密钥在哪 | AD / Entra ID 托管，或用户打印的恢复密钥 |
| 离职当天第一步做什么 | 禁用账号（不是删除），再回收设备与权限 |

### 面试反向提问（桌面向加分项）

- 团队现在有多少终端、人均支持多少台，工单量峰值是什么水平？
- 装机是手工还是 MDT/SCCM/Intune 自动化？新机交付要多久？
- 有没有做终端合规基线？不合规的机器会被限制接入吗？
- 远程支持有没有会话审计和用户授权机制？
- 资产与 License 台账是系统管还是 Excel 管，多久盘一次？
