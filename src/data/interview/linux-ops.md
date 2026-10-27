# Linux 运维面试题库 · 全面版

> 难度标记：`【初】` 必答 · `【中】` 分水岭 · `【高】` 加分项
> 范围：这份题库只打 Linux 运维日常那一摊——账号权限、磁盘存储、进程与 systemd、启动内核、网络与抓包、防火墙加固、软件包、日志审计、性能调优、内核参数、批量运维、备份容灾、高可用共享存储、巡检场景、运维脚本。答案仍然按 **是什么 → 为什么 → 怎么做 → 踩过什么坑** 组织，能直接背成面试口语。

---

## 目录

1. 用户、组与权限体系
2. 文件系统与磁盘存储
3. 进程、资源与 systemd
4. 启动流程与内核基础
5. 网络配置与抓包排障
6. 防火墙与安全加固
7. 软件包与仓库管理
8. 日志体系与审计
9. 性能分析与调优
10. 内核参数与资源限制
11. 定时任务与批量运维
12. 备份、恢复与容灾
13. 高可用与共享存储
14. 日常巡检与故障场景
15. Shell 运维脚本实战
16. Linux 运维速记卡

---

## 一、用户、组与权限体系

### Q1. 用户和组的关键文件是哪几个，各存什么？【初】

- `/etc/passwd`：账号主信息，7 段 `用户名:x:UID:GID:描述:家目录:登录shell`
- `/etc/shadow`：口令哈希 + 老化策略，`!!` / `*` 表示该账号不能口令登录
- `/etc/group`、`/etc/gshadow`：组、组成员、组口令
- `/etc/login.defs`：UID 起始范围、口令有效期等默认值
- `/etc/skel/`：`useradd -m` 时复制到家目录的骨架文件

**生产里用 `useradd / usermod / groupmod` 改，不要手改 `/etc/passwd`**，手改容易漏掉 shadow、家目录属主和 selinux 上下文。

追问常考：UID 0 是谁（root），普通用户 UID 从 1000 起，系统服务账号 1–999。

### Q2. `useradd` 和 `adduser` 的区别？新建运维账号怎么做才规范？【初】

- `useradd` 是底层命令，只建账号，家目录要 `-m`，shell 要 `-s`，不设口令
- `adduser` 是发行版封装（Debian 系交互式；CentOS 的 `adduser` 是 `useradd` 的软链）

规范做法：

```bash
useradd -m -s /bin/bash -G wheel,ops deploy
passwd deploy                 # 或 echo 'xxx' | passwd --stdin deploy
chage -M 90 -W 7 deploy       # 90 天过期，提前 7 天提醒
usermod -aG docker deploy     # 追加附加组，必须 -a，否则覆盖原组
```

坑：`usermod -G` 不带 `-a` 会把用户原有附加组全部冲掉，Docker/轮值权限瞬间丢失。

### Q3. 权限位 755、644、750 分别什么意思？目录的 x 位为什么特殊？【初】

三位一组：属主 / 属组 / 其他，`r=4 w=2 x=1`。

- `755`：属主读写执行，其他人读+进入
- `644`：文件属主读写，其他人只读
- `750`：属组可读可进入，其他人完全没权限

**目录上的 `x` = 能否进入（cd）和穿过它访问子项**，`r` 只决定能否 `ls` 列出名字。所以只有 `r` 没有 `x` 的目录，`ls` 能看到文件名但 `cat` 文件会 Permission denied——这是最容易被面试官追问的点。

### Q4. `umask` 是怎么算的？为什么要统一成 022 或 027？【中】

新建文件权限 = `666 & ~umask`，新建目录 = `777 & ~umask`。

- `umask 022`：文件 644、目录 755，同组可读
- `umask 027`：文件 640、目录 750，其他组完全不可见

统一 umask 是为了**避免不同人上传的文件权限不一致**导致服务读不到。落地点：`/etc/profile` 或 `/etc/bashrc` 里加 `umask 027`；systemd 服务则用 `UMask=0027`；上传目录由应用自己 chmod。

坑：`umask` 只影响新建，对已有文件无效，历史文件要 `find ... -exec chmod` 批量修。

### Q5. SUID、SGID、粘滞位分别解决什么问题？【中】

- **SUID(4)**：执行时以文件属主身份运行，典型 `/usr/bin/passwd`。**安全风险最高**，运维要定期扫 `find / -perm -4000 -type f`
- **SGID(2)**：作用于文件时以属组身份运行；作用于目录时**新建文件继承目录的属组**，团队共享目录标配 `chmod 2775 /data/share` + 属组统一
- **粘滞位(1)**：目录如 `/tmp`，只允许属主删除自己的文件，防止互相删

排查 SUID 提权是入侵排查固定动作：`find / -xdev -perm -4000 -type f 2>/dev/null`。

### Q6. ACL 什么时候必须用？和传统权限怎么共存？【中】

需要**给某个用户单独授权，又不想动属组**时用 ACL，例如只让 `audit` 用户读某日志目录。

```bash
setfacl -m u:audit:rx /var/log/app
setfacl -m d:u:audit:rx /var/log/app     # d: 默认 ACL，对新建文件生效
getfacl /var/log/app
```

`ls -l` 权限位末尾出现 `+` 就说明该文件有 ACL。坑：`cp` 默认不保留 ACL（要 `-p`），`tar` 默认也不带（要 `--acls`），所以「备份恢复后权限丢了」经常是这个原因。

### Q7. `sudo` 怎么配才安全？为什么不能给 `ALL=(ALL) NOPASSWD: ALL`？【中】

`/etc/sudoers`（用 `visudo` 改，它会做语法检查）：

```text
%ops ALL=(root) NOPASSWD: /bin/systemctl restart nginx, /bin/systemctl reload nginx
deploy ALL=(root) /usr/bin/journalctl, /usr/bin/tail
```

原则：**按命令白名单授权，而不是给人 root**。`NOPASSWD: ALL` 等于给了一个不需要口令的 root shell（而且命令里带 `!`、编辑器、`tar` 都能逃逸成 shell），审计也查不出谁干了什么。

审计落地：`/var/log/sudo.log`（`Defaults logfile=`）+ `/etc/sudoers.d/` 分文件管理，别所有人改同一个大文件。

### Q8. 怎么排查「某个用户登录不进来」？【中】

按链路走，别乱试：

1. 账号状态：`passwd -S user`（是否锁定 LK）、`chage -l user`（是否过期）
2. 口令：是否 `!` 前缀（`/etc/shadow`）
3. Shell：`/etc/passwd` 里 shell 是否存在、是否在 `/etc/shells`
4. 家目录：属主是否被改错、是否只读
5. 认证日志：`/var/log/secure`（或 `/var/log/auth.log`），看是「认证失败」还是「认证通过但会话被拒」
6. PAM/限制：`/etc/security/access.conf`、`/etc/ssh/sshd_config` 的 `AllowUsers/DenyUsers`

**关键区分点：secure 里有 "Accepted" 却登不上，说明是登录后环境问题（家目录、shell、PAM session），不是密码问题。**

### Q9. 怎么做到「只允许指定 IP 登录 SSH，且只能密钥登录」？【中】

```text
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers deploy@10.0.0.* ops@192.168.1.0/24
MaxAuthTries 3
ClientAliveInterval 300
```

`sshd -t` 校验语法后 `systemctl reload sshd`，**先另开一个会话验证新配置再断开旧会话**，这是运维铁律。

再加一层网络侧限制（安全组 / firewalld rich rule），两层防护比只改 sshd 可靠。

### Q10. 普通用户怎么提权到 root？`su` 和 `sudo -i` 有什么区别？【初】

- `su -`：切换到目标用户并加载其完整登录环境，**需要目标用户口令**
- `sudo -i`：以 root 身份启动登录 shell，**需要自己的口令**（走 sudoers 授权）
- `su`（不带 `-`）：只换身份不换环境，PATH 还是原来的，容易执行到错误版本命令

运维推荐 `sudo` 体系：可审计、可按命令授权、可免密。排查 `PATH` 类故障时要先确认「是不是 `su` 没带 `-` 导致环境变量没刷新」。

---

## 二、文件系统与磁盘存储

### Q11. MBR 和 GPT 有什么区别？2T 以上必须用哪个？【初】

| 项 | MBR | GPT |
|---|---|---|
| 最大磁盘 | 2 TB | 远大于 2 TB（ZB 级） |
| 分区数 | 主分区最多 4 个 | 默认 128 个 |
| 分区表备份 | 无 | 有主备两份 |
| 启动 | BIOS + grub | UEFI（也可 BIOS+GPT） |

**单盘超过 2T 必须 GPT**，`fdisk` 对大于 2T 的盘会退化成 GPT 或直接拒绝，用 `parted` 更稳。

坑：MBR 转 GPT（`gdisk` 转换）在已有数据盘上操作前必须做块级备份，误操作分区表直接丢盘。

### Q12. 新加一块盘，从识别到能用，完整步骤是什么？【初】

```bash
lsblk                                  # 确认内核识别到（没有就 rescan-scsi-bus）
parted /dev/sdb mklabel gpt
parted -s /dev/sdb mkpart primary 0% 100%
mkfs.xfs /dev/sdb1
mkdir -p /data && mount /dev/sdb1 /data
blkid /dev/sdb1                        # 取 UUID
echo "UUID=xxxx /data xfs defaults,noatime 0 2" >> /etc/fstab
mount -a                               # 验证 fstab 正确性
```

**顺序不能乱：fstab 一定要用 UUID，`/dev/sdb1` 在盘序变化时会指错盘，导致开机进紧急模式。**

### Q13. LVM 解决了什么问题？在线扩容怎么操作？【中】

解决**分区大小事先定死**的问题：物理卷（PV）→ 卷组（VG）→ 逻辑卷（LV），空间可以事后从 VG 里再切给 LV。

在线扩容：

```bash
pvcreate /dev/sdc && vgextend vg_data /dev/sdc
lvextend -L +50G /dev/vg_data/lv_app
xfs_growfs /data            # XFS
resize2fs /dev/vg_data/lv_app   # ext4
```

**扩 LV 之后必须扩文件系统**，否则 `df` 不变——这是新手最常漏的一步。XFS 只能扩不能缩，ext4 缩容要先 `umount` 且必须 `e2fsck`。

### Q14. `df` 显示满但 `du` 加起来很小，怎么查？【高】

典型原因是**文件被删除但仍被进程持有句柄**，空间不会释放：

```bash
df -h /
du -sh /* 2>/dev/null | sort -h | tail
lsof +L1                               # 已删除但未释放的文件
lsof | grep deleted
```

找到进程后重启/`kill` 它，空间立刻回收；或者 `: > /proc/<pid>/fd/<n>` 原地清空（对日志型文件可用，**不要对数据文件这么干**）。

其他可能：挂载点被覆盖（`mount --bind` 后原目录里的文件），`du` 看不到 → `mount | grep <dir>` 确认。

### Q15. inode 满了怎么处理？和磁盘满有什么区别？【中】

`df -i` 看 inode，**空间还有但 inode 100% → 建不了新文件**，典型是小文件海量（session 文件、邮件队列、缓存碎片）。

```bash
df -i
find / -xdev -type f | wc -l
find /var/spool -type f -mtime +7 -delete
```

根治：调大 `mkfs -i` 的 inode 密度（建文件系统时定，事后难改）；业务层控制小文件数量（单目录文件数控制在一万以内，必要时按日期分目录）。

坑：`rm -rf` 海量小文件极慢，用 `find dir -type f -delete` 或 `rsync --delete` 空目录同步更快。

### Q16. `/etc/fstab` 写错导致开机进不了系统，怎么救？【高】

现象：开机卡在 `emergency mode` / `dracut` 提示 `Failed to mount /data`。

救援步骤：

1. 按提示输入 root 口令进 emergency shell（根分区没坏的情况下）
2. `mount -o remount,rw /` 让根可写
3. `vi /etc/fstab` 注释掉错误行，或改成正确的 UUID（`blkid` 查）
4. `systemctl daemon-reload`，`mount -a` 验证
5. `reboot`

如果根分区本身挂不上，用安装 ISO 的救援模式 chroot 进去修。**预防：改完 fstab 必须先 `mount -a` 验证，再重启。**

### Q17. 一个 NFS 挂载点把服务器卡死了，怎么处理？【高】

现象：`df -h` 卡住、`ls` 卡住、大量进程变 `D` 状态。

原因：NFS 服务器失联且挂载参数是 `hard`，客户端无限重试，内核态不可中断。

处置顺序：

1. `mount | grep nfs` 找到挂载点（此时可能已卡）
2. `umount -f -l /mnt/nfs`（`-l` 惰性卸载，能立刻解除目录占用）
3. 卸载不掉就 `kill` 掉访问该目录的进程，再卸
4. 参数改 `soft,timeo=30,retrans=3` 或缩短 `timeo`

**规范：非关键路径不要 `hard` + 默认超时的 NFS；关键路径读写要么本地盘，要么 `soft` 加应用侧重试。**

### Q18. `mount` 的 `noatime`、`ro`、`sync` 分别用来干什么？【中】

- `noatime`：不更新访问时间，**降低大量读场景的元数据写**，数据库和日志盘常用（`relatime` 是现代默认，比 `atime` 省一半元数据更新）
- `ro`：只读挂载，救援/取证/写保护时用
- `sync`：每次写都落盘，安全但性能极差；数据库场景反而应该用 `fsync` 由应用控制，不要全局 `sync`
- `nobarrier`（XFS/ext4）：有电池缓存阵列时可放开，**无 BBU 的盘不要开**

### Q19. 磁盘 IO 调度器怎么选？现在还需要手调吗？【高】

| 调度器 | 适用 |
|---|---|
| `none`/`noop` | NVMe、SSD（自身有队列调度） |
| `mq-deadline` | 通用 SSD / 虚拟盘 |
| `kyber` | 高速 NVMe |
| `bfq` | 桌面、单用户交互 |

多队列（blk-mq）之后，云盘/NVMe 基本交给硬件和 virtio，**生产上多数场景保持默认即可**，只有明确遇到「延迟毛刺」才考虑手调。

改法：`echo mq-deadline > /sys/block/sda/queue/scheduler`，永久化写 udev 规则，别写 rc.local。

### Q20. 怎么检查一块盘是不是快坏了？【中】

```bash
smartctl -a /dev/sda         # 看 Reallocated_Sector_Ct、Pending_Sector、Media_Wearout
smartctl -t short /dev/sda   # 短自检
dmesg | grep -i -E 'ata|smart|I/O error'
cat /proc/mdstat             # 软 RAID 重建进度
```

关注点：**重映射扇区数持续增长**基本等于盘要坏，别等 FAILED。SSD 看剩余寿命（`Percentage Used`）。

巡检建议：`smartd` 起了之后会主动告警，比人工看强。

### Q21. 软 RAID 怎么建、怎么换盘？重建时要注意什么？【中】

```bash
mdadm -C /dev/md0 -l 1 -n 2 /dev/sdb /dev/sdc
mdadm --detail /dev/md0
mdadm /dev/md0 -f /dev/sdb -r /dev/sdb   # 标坏、移除
mdadm /dev/md0 -a /dev/sdd               # 加新盘自动重建
```

重建风险：**RAID5 重建期间再坏一块就全丢**，大容量盘重建要几小时到几天，所以生产要么 RAID10，要么 RAID5 + 热备 + 快照/备份双保险。重建期间别做全量备份压 IO。

### Q22. 磁盘配额（quota）怎么用？为什么现在很少用？【高】

`/etc/fstab` 加 `usrquota,grpquota` → `quotacheck -cugm` → `quotaon` → `setquota`/`edquota` 限制用户或组的块数与 inode 数。

少用的原因：**配额是按用户/组维度，容器和共享账号体系下粒度不对**；而且大目录配额维护成本高。现在更常见的是：LVM 限量 + 项目目录单独文件系统 + 应用层限流。

### Q23. 怎么给一块盘做 LVM 快照，用快照做备份要注意什么？【高】

```bash
lvcreate -L 20G -s -n lv_app_snap /dev/vg_data/lv_app
mount -o ro /dev/vg_data/lv_app_snap /mnt/snap
# 备份完立刻卸载并删除
umount /mnt/snap && lvremove /dev/vg_data/lv_app_snap
```

坑：快照区**必须足够容纳快照期间的变化量**，写满后快照直接失效（`lvs` 看 `Data%`）；快照期间 IO 有额外损耗；快照不是备份，机器整体挂掉时同盘快照一起没。

### Q24. `tmpfs` 和 `/dev/shm` 有什么用？踩过什么坑？【中】

`tmpfs` 是**内存文件系统**，快、重启即丢，适合 `/tmp`、session、编译缓存。

坑：**默认大小是物理内存的一半**，程序往 `/dev/shm` 狂写会把内存吃光触发 OOM；Docker 容器里 `/dev/shm` 默认只有 64M，Chrome/Java 容易报 `No space left on device`。解决：`mount -o remount,size=1G /dev/shm` 或容器参数 `--shm-size`。

### Q25. 怎么给系统加 swap？云主机为什么经常禁用 swap？【中】

```bash
dd if=/dev/zero of=/swapfile bs=1M count=4096
chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

K8s 节点和数据库主机常禁用：**swap 会让内存压力变成性能抖动**，调度器和 JVM 都假设内存是独占的。K8s 1.28+ 才实验性支持 swap。

排查换页：`vmstat 1` 的 `si/so` 持续非零 = 在换页，性能已经受伤。

### Q26. `ext4` 和 `XFS` 生产怎么选？【中】

- **ext4**：通用、工具链成熟、支持离线缩容，小文件多、单机通用盘
- **XFS**：大文件、大目录、高并发元数据操作强，RHEL/CentOS 默认，**不支持缩容**

选型口诀：**不确定就 XFS（RHEL 系默认），需要缩容或老系统就 ext4**。两者都要注意 `fsck` 只在卸载状态执行，XFS 的修复命令是 `xfs_repair`。

### Q27. 磁盘只读（Read-only file system）怎么排查？【高】

内核检测到文件系统错误时会把挂载点降为只读保护数据。

```bash
dmesg -T | tail -50        # 找 "Remounting filesystem read-only" / "I/O error"
mount | grep ' ro,'
touch /data/test           # 确认只读范围
```

处理：定位是盘坏、线缆、HBA、还是文件系统坏了；能重启就 `fsck -y`（XFS 用 `xfs_repair -n` 先检查）；硬件问题先换盘再修。**别直接 `mount -o remount,rw` 硬顶**，那只是把错误延后并放大。

### Q28. 怎么看目录/文件被谁占着、为什么删不掉？【中】

```bash
lsof +D /data/logs              # 目录被哪些进程打开（慢，慎用大目录）
fuser -vm /data                 # 谁在用这个挂载点
lsof | grep deleted             # 已删除未释放
ls -l /proc/<pid>/fd | grep deleted
```

删不掉常见原因：进程持有句柄、目录是挂载点、文件被 `chattr +i`（`lsattr` 看）、SELinux 拒绝（`ausearch -m avc`）、文件系统只读。

---

## 三、进程、资源与 systemd

### Q29. 怎么看一个进程的完整信息？【初】

```bash
ps -ef | grep nginx
ps -o pid,ppid,user,stat,%cpu,%mem,etime,cmd -p <pid>
cat /proc/<pid>/status      # 内存、线程数、状态
cat /proc/<pid>/limits      # 该进程的 ulimit 实际值
ls -l /proc/<pid>/fd | wc -l  # 打开的文件描述符数
cat /proc/<pid>/environ | tr '\0' '\n'  # 启动环境变量
```

追问常考：**怎么确认一个进程实际用的是哪个配置文件**——看 `/proc/<pid>/cmdline` 和 `lsof -p <pid> | grep conf`，比看启动脚本可靠。

### Q30. 进程优先级怎么调？`nice` 和 `ionice` 区别？【中】

- `nice` 调 CPU 调度优先级，范围 -20（最高）~ 19（最低），普通用户只能调高数值（降优先级）
- `ionice` 调 IO 优先级，类 `1` realtime / `2` best-effort / `3` idle，配合 `-n 0-7`

```bash
nice -n 10 tar czf backup.tar.gz /data
renice -n 5 -p <pid>
ionice -c3 -p <pid>          # 备份任务降到 idle，别和业务抢 IO
```

运维用法：**离线备份、日志压缩、大批量 rsync 一律 `ionice -c3` + `nice -n 19`**，这是避免「备份跑起来业务就抖」的最低成本手段。

### Q31. 进程杀不掉，除了 `-9` 还有什么手段？【高】

按顺序：

1. `kill -TERM` 给优雅退出机会，等 5–10 秒
2. `kill -9`，还不行说明进程卡在内核态（`D` 状态）或在等不可中断资源
3. `cat /proc/<pid>/stack` 看内核栈，确认阻塞在哪个系统调用
4. `cat /proc/<pid>/wchan`、`ps -o wchan= -p <pid>`
5. 是 NFS/存储挂死 → 修存储或 `umount -l`
6. 僵尸进程（`Z`）杀不掉，**只能杀父进程或让父进程 `wait()`**

`:(){ :|:& };:` 这种 fork 炸弹要用 `ulimit -u` 限制或直接重启。

### Q32. 一个 unit 文件的关键字段有哪些？写一个规范的服务单元。【中】

```ini
[Unit]
Description=Demo API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/demo
EnvironmentFile=/etc/demo/env
ExecStart=/opt/demo/bin/demo --config /etc/demo/config.yaml
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
KillSignal=SIGTERM
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

要点：`Type=simple/forking/notify` 选错会导致 systemd 以为服务秒退；**`Restart=on-failure` + `RestartSec` 是自愈的最低配置**；`LimitNOFILE` 写在这里才能覆盖 `limits.conf`（systemd 服务不走 PAM）。

### Q33. 服务起不来，按什么顺序排查？【中】

```bash
systemctl status demo -l         # 看 Active 状态和最后几行日志
journalctl -u demo -n 100 --no-pager
systemctl cat demo               # 实际生效的 unit（含 drop-in）
systemctl show demo -p ExecStart -p Environment
```

常见根因排序：路径/权限不对（`User=` 下读不到配置）→ 端口被占（`ss -lntp`）→ 依赖没起（`After=` 只管顺序不管依赖，要 `Requires=`）→ 环境变量缺失（`EnvironmentFile` 文件不存在会直接失败）→ SELinux 拒绝。

`journalctl -u demo -b` 只看本次启动，比翻整个日志快。

### Q34. systemd 的 `Restart` 策略怎么选？服务被 OOM 杀掉算不算失败？【中】

- `no`（默认）：不重启
- `on-failure`：非 0 退出、被信号杀、超时杀 → 重启（**OOM 属于这个**）
- `always`：无条件重启，注意 `systemctl stop` 也会被拉起（配合 `RestartPreventExitStatus`）
- `on-abnormal`：只对信号/超时/看门狗重启

OOM 被杀算 `on-failure`，会重启，但**如果内存泄漏没修，就是无限重启循环**，要用 `StartLimitIntervalSec` / `StartLimitBurst` 限流，并去看 `journalctl -k | grep -i oom`。

### Q35. `systemd-timer` 和 `cron` 该用哪个？【中】

| 维度 | cron | systemd timer |
|---|---|---|
| 精度 | 分钟级 | 秒级 + 单调时钟（`OnBootSec`） |
| 依赖 | 无 | 可 `After=`、`Requires=` |
| 日志 | 邮件/自己重定向 | 自动进 journal |
| 错过补偿 | 无 | `Persistent=true` 可补跑 |
| 资源限制 | 无 | 可设 cgroup、`Nice`、`IOSchedulingClass` |

新系统建议用 timer，尤其需要「开机后 N 分钟跑」和「错过后补跑」的场景。老脚本迁移成本低，`cron` 也没问题，**关键是别两套混用同一定时任务**。

### Q36. `journald` 日志占满磁盘怎么办？怎么持久化？【中】

```bash
journalctl --disk-usage
journalctl --vacuum-size=500M      # 按大小清
journalctl --vacuum-time=7d        # 按时间清
```

`/etc/systemd/journald.conf`：

```ini
Storage=persistent        # 默认 auto，容器里常变成 volatile（重启即丢）
SystemMaxUse=2G
SystemMaxFileSize=100M
MaxRetentionSec=2week
```

坑：`Storage=volatile` 或 `/var/log/journal` 不存在时日志只在内存，**重启后查不到"为什么挂了"**，线上必须确认是 persistent。

### Q37. 怎么临时以某个用户/限制资源跑一条命令？【中】

```bash
systemd-run --uid=deploy --gid=deploy --working-directory=/opt --pty /bin/bash
systemd-run --scope -p MemoryMax=512M -p CPUQuota=50% /opt/demo/bench
```

比 `su -c` 强的地方：能直接套 cgroup 限制、自动进 journal、可以 `--on-active` 定时。压测和临时任务用这个比手搓 `ulimit` 干净。

### Q38. 怎么查一个进程属于哪个容器/命名空间？【高】

```bash
ls -l /proc/<pid>/ns/*            # 看 mnt/pid/net 命名空间的 inode
readlink /proc/<pid>/cgroup       # 找 docker/kubepods 的 cgroup 路径
crictl ps | grep <容器id前缀>
docker ps --no-trunc | grep <容器id前缀>
nsenter -t <pid> -n ss -lntp      # 进容器的网络命名空间执行命令
nsenter -t <pid> -m -u -i -p -n /bin/bash
```

运维价值：**宿主机上看到高 CPU 进程，靠 cgroup 路径反查容器 ID**，再进容器里看应用，这是容器宿主排障的基本功。

### Q39. 文件描述符泄漏怎么查？【高】

```bash
ls /proc/<pid>/fd | wc -l
ls -l /proc/<pid>/fd | awk '{print $NF}' | sort | uniq -c | sort -rn | head
cat /proc/<pid>/limits | grep 'open files'
lsof -p <pid> | wc -l
```

判断：fd 数持续单调增长且不回落 = 泄漏。常见于 HTTP 连接没关、`open()` 后异常分支没 `close()`、日志轮转后仍持有旧句柄。

应急：`ulimit -n` / unit 里 `LimitNOFILE` 临时调大 + 重启进程，根治要改代码。**监控项里必须有 fd 使用率**，比等 `Too many open files` 报错早得多。

### Q40. `nohup`、`&`、`disown`、`setsid` 有什么区别？【中】

- `&`：放后台，但**退出终端（SIGHUP）会被杀**
- `nohup cmd &`：忽略 SIGHUP，输出默认进 `nohup.out`
- `disown -h %1`：已在后台的任务补上「忽略 SIGHUP」
- `setsid cmd`：新会话，彻底脱离终端
- `screen` / `tmux`：真正的交互式长任务方案

运维建议：**长任务一律 `tmux`**，`nohup` 只适合一次性的后台脚本，且必须显式重定向输出，否则 `nohup.out` 会把磁盘写满。

### Q41. 系统 CPU 不高但负载很高，除了 IO 还有什么可能？【高】

load average = 可运行队列 + **不可中断睡眠（D）**。除了磁盘 IO，还有：

- NFS/CIFS 挂载失联，大量进程 `D` 在等网络文件系统
- 内存不足导致频繁直接回收（`direct reclaim`），进程卡在内核态
- 锁竞争：内核锁或文件锁（`flock`）排队
- 大量短命进程 fork/exit，`vmstat` 的 `cs`、`in` 很高
- cgroup CPU 限流（`cpu.stat` 的 `nr_throttled`）

排查：`vmstat 1`（`r`/`b`/`cs`）→ `ps -eo stat,pid,cmd | grep '^D'` → `cat /proc/<pid>/stack`。

### Q42. 怎么限制某个进程的 CPU/内存/IO？【中】

优先级从低到高：

1. `ulimit`：只管单进程单会话，容器/服务要靠 PAM 或 systemd
2. `systemd` unit：`CPUQuota=50%`、`MemoryMax=1G`、`IOWeight=100`、`LimitNOFILE`
3. `cgroup v2` 直接写：`/sys/fs/cgroup/<path>/cpu.max`、`memory.max`
4. `cpulimit` / `nice`/`ionice`：只能降优先级，不能硬限

坑：`MemoryMax` 触发的是 **cgroup OOM killer**，日志在 `journalctl -k` 或 `/sys/fs/cgroup/<path>/memory.events`（`oom_kill` 计数），和应用自身 OOM 不是一回事。

## 四、启动流程与内核基础

### Q43. 从按电源键到能 SSH 登录，中间发生了什么？【中】

1. **固件** BIOS/UEFI 自检，按启动顺序找可引导设备
2. **引导器** GRUB2 读 `/boot/grub2/grub.cfg`，加载 `vmlinuz` 和 `initramfs`
3. **内核** 解压、初始化内存管理/调度器、探测硬件、挂根
4. **initramfs** 里加载挂真实根所需的驱动（LVM、软 RAID、加密盘、网卡 iSCSI）
5. **root switch** 挂载真实 `/`，执行 `/usr/lib/systemd/systemd`（PID 1）
6. **systemd** 按 `sysinit → basic → multi-user → graphical` 顺序拉起 unit
7. **服务层** network、sshd、业务进程
8. **登录** getty 或 sshd 接受会话

**故障定位锚点**：卡在 GRUB 是引导器/磁盘问题；卡在 dracut 是 initramfs 缺驱动或 fstab 错；进 emergency mode 基本是挂载失败。

### Q44. GRUB 菜单怎么加内核参数？`ro` 改成 `rw` 有什么后果？【中】

启动时在 GRUB 界面按 `e` 编辑内核行，临时追加参数（如 `rd.break`、`single`、`systemd.unit=rescue.target`），`Ctrl+X` 启动。**这是临时的，重启失效。**

永久：改 `/etc/default/grub` 的 `GRUB_CMDLINE_LINUX`，再 `grub2-mkconfig -o /boot/grub2/grub.cfg`（Debian 系 `update-grub`）。

`ro`/`rw` 决定根文件系统挂载时的初始读写状态。**默认 `ro` 是故意的**：systemd 会先 `fsck` 再 remount rw，改成 `rw` 等于跳过检查直接写，文件系统有脏位时更容易放大损坏。

### Q45. `/etc/rc.local` 为什么在新系统里失效了？【初】

RHEL 7+ / Ubuntu 16.04+ 之后 systemd 接管，`rc-local.service` 默认不 enable，且要求 `/etc/rc.local` 有可执行权限、首行有 shebang。

```bash
chmod +x /etc/rc.local
systemctl enable --now rc-local
```

**但仍不推荐用它做自启**：没有依赖管理、没有重启策略、日志不进 journal。正经做法是写 unit 或 cron `@reboot`。

### Q46. 内核模块怎么加载、怎么让它开机自动加载？【中】

```bash
lsmod | head
modinfo <module>              # 看依赖、参数、路径
modprobe <module> param=1     # 自动解决依赖
modprobe -r <module>
```

永久：

```bash
echo "<module>" > /etc/modules-load.d/xx.conf
echo "options <module> param=1" > /etc/modprobe.d/xx.conf
```

坑：`insmod` 不解决依赖，只在调试时用；`modprobe -r` 有进程在用会失败（`lsmod` 的 `Used by` 非 0）；内核升级后第三方模块（如旧版 ZFS、自编译驱动）会因 vermagic 不匹配加载失败，必须重建 dkms。

### Q47. 内核升级了但没生效，怎么查？【中】

```bash
uname -r                                # 当前运行内核
rpm -qa | grep ^kernel                  # 已安装内核（RHEL 系）
dpkg -l | grep linux-image              # Debian 系
grubby --default-kernel                 # 默认启动项
grub2-editenv list                      # saved_entry
```

原因通常是：默认启动项还指向旧内核、新内核装进 `/boot` 但空间不足没写完整、或云主机用的是外部内核（`ls /boot` 里没有对应 `vmlinuz`）。

`/boot` 分区被旧内核塞满是经典事故：**先 `package-cleanup --oldkernels --count=2` 清一批，再装新内核**。

### Q48. 什么是 `initramfs`？为什么换机器/换 RAID 卡后起不来？【高】

`initramfs` 是一个临时内存根文件系统，里面只有「把真实根挂起来」所需的最小驱动和脚本。

换 RAID 卡、改 LVM、加密盘、iSCSI 根时，**新驱动不在 initramfs 里 → 内核找不到根 → `dracut` 超时进 emergency**。

修法：进救援模式 `chroot`，重新生成——RHEL `dracut -f`，Debian `update-initramfs -u -k all`。规范做法是**改存储链路之前先重建一次 initramfs 并验证**。

### Q49. `dmesg` 里的 ring buffer 会被刷掉，怎么保住关键日志？【中】

```bash
dmesg -T | tail -100
journalctl -k -b -1             # 上一次启动的内核日志（persistent 存储时）
sysctl -w kernel.printk="4 4 1 7"
```

`dmesg` 是环形缓冲，量大了旧消息被覆盖；`journalctl -k -b -1` 能看上一次启动（前提 journald 是 `Storage=persistent`）。

**硬件类告警（EDAC、MCE、ATA error）必须第一时间捞出来落盘**，`grep -i -E 'error|fail|mce|edac' dmesg`，否则重启后证据全没。

### Q50. 系统时间不对会引发哪些故障？怎么保证同步？【中】

后果：TLS 证书校验失败、Kerberos/JWT 失效、分布式锁与事务判断错乱、日志时间线对不上、备份增量误判、K8s 证书与 token 过期。

```bash
timedatectl                       # 看 NTP synchronized 是否 yes
chronyc sources -v
chronyc tracking
timedatectl set-timezone Asia/Shanghai
```

规范：内网自建 NTP（`chronyd`），所有机器指向内网源，内网源向 `ntp.aliyun.com` 同步；**虚拟机上装 `qemu-guest-agent` 或开 `chrony` 的 `makestep`**，否则迁移/挂起后时间会大幅漂。

### Q51. `systmed` 的 target 和传统 runlevel 怎么对应？【初】

| runlevel | target |
|---|---|
| 0 | poweroff.target |
| 1 / S | rescue.target |
| 3 | multi-user.target |
| 5 | graphical.target |
| 6 | reboot.target |

`systemctl get-default`、`systemctl set-default multi-user.target`。`isolate` 切 target 会停掉不属于该 target 的服务，**生产上 `systemctl isolate` 慎用，等于局部重启**。

### Q52. 怎么恢复被误改的 root 口令或 `/etc/passwd`？【高】

1. GRUB 编辑内核行加 `rd.break`（RHEL）或 `init=/bin/bash`，`Ctrl+X`
2. RHEL：`mount -o remount,rw /sysroot && chroot /sysroot && passwd root && touch /.autorelabel && exit && reboot`
3. Debian 系用 `init=/bin/bash` + `mount -o remount,rw /`

**`touch /.autorelabel` 不能省**，否则 SELinux 上下文错乱，下次启动服务大面积起不来。如果是 `/etc/passwd` 写坏了，进救援模式从 `/etc/passwd-` 恢复（系统自动保留 `-` 备份）。

### Q53. 什么是 runlevel 之外的单用户 / 救援模式，什么时候用哪个？【中】

- `rescue.target`：单用户，挂载本地文件系统、起基本服务，用于改口令、修配置
- `emergency.target`：只挂根分区且只读，几乎不起任何服务，用于根分区修复、`fsck`
- 救援 ISO：系统完全起不来（内核坏、引导坏）时的最后手段

进法：GRUB 加 `systemd.unit=rescue.target` 或 `systemd.unit=emergency.target`；有 root 口令时也可以 `systemctl isolate`。

### Q54. 内核 panic 后怎么定位？【高】

```bash
journalctl -k -b -1 | tail -100       # 上次启动的内核日志
cat /var/crash/*/ 或 /var/spool/abrt/  # kdump 生成的 vmcore
crash /usr/lib/debug/lib/modules/$(uname -r)/vmlinuz /var/crash/xxx/vmcore
```

**前提是装了 `kexec-tools` 且 `kdump.service` 正常**，否则 panic 后内存里的证据随重启消失。云主机还要确认控制台能拿到串口日志（`console=ttyS0`）。

常见 panic 原因：驱动 bug、内存硬件错误（MCE）、文件系统损坏、OOM 之外的 cgroup 限制、`panic_on_oops` 被打开。

### Q55. `/proc` 和 `/sys` 有什么区别？运维为什么离不开它们？【中】

- `/proc`：进程与内核运行时的**虚拟视图**，`/proc/<pid>/*`、`/proc/meminfo`、`/proc/net/*`、`/proc/sys/*`（参数可写）
- `/sys`：统一的设备与驱动模型（sysfs），`/sys/block/*/queue/*`、`/sys/class/net/*`、cgroup v2 全部在 `/sys/fs/cgroup`

运维价值：**不改配置、不停服务就能读实时状态**。例如 `cat /proc/net/dev` 看网卡计数，`cat /sys/class/net/eth0/statistics/dropped` 看丢包，`cat /proc/pressure/cpu` 看 PSI 压力指标。

### Q56. 内核参数改了怎么永久生效，`sysctl -p` 有什么坑？【中】

```bash
sysctl -w net.ipv4.ip_forward=1          # 临时
echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-tuning.conf
sysctl --system                          # 加载 /etc/sysctl.d/* 与 /etc/sysctl.conf
```

坑：
- `sysctl -p` 只加载 `/etc/sysctl.conf`（或指定文件），**不会加载 `/etc/sysctl.d/` 目录**，用 `--system`
- 同名参数在多个文件里时，**后加载的覆盖先加载的**，所以要带数字前缀排序（`99-`）
- 有些参数（如 `vm.swappiness` 之外的）只对新建连接/进程生效，改完要重启对应服务

---

## 五、网络配置与抓包排障

### Q57. `ip` 命令怎么替代掉老旧的 `ifconfig/route/netstat`？【初】

```bash
ip addr show                 # ifconfig
ip link set eth0 up/down
ip route show                # route -n
ip route add 10.0.0.0/8 via 192.168.1.1 dev eth0
ip neigh                     # arp -a
ss -lntp                    # netstat -lntp
ss -s                       # 连接统计
```

`net-tools` 已从多数发行版默认安装中去掉，**`ifconfig` 看到的 IP 在 NetworkManager/systemd-networkd 场景下可能不准**，`ip` 才是唯一事实来源。

### Q58. 一台机器 ping 不通，按什么顺序排查？【中】

自下而上，别跳步：

1. **链路/网卡** `ip link`（是否 `state UP`）、`ethtool eth0`（link detected yes）
2. **IP 配置** `ip addr`（是否配了地址、是否冲突）
3. **同网段** `ping 网关`、`ip neigh` 是否有 ARP 条目
4. **路由** `ip route get 8.8.8.8`、`traceroute`
5. **DNS** `getent hosts domain`（先于 ping，避免被 DNS 误导）
6. **防火墙** `iptables -L -n -v`、`firewalld`、云安全组
7. **对端** 服务是否监听（`ss -lntp`）、对端是否禁 ping（`icmp_echo_ignore_all`）

**关键习惯：ping 不通先 `ip route get`，能定 80% 的方向。**

### Q59. `ss` 的常用姿势有哪些？怎么找到占端口的进程？【初】

```bash
ss -lntp                          # 监听中的 TCP + 进程
ss -tnp state established         # 已建立连接
ss -tn state time-wait | wc -l    # TIME_WAIT 数量
ss -tn state close-wait          # CLOSE_WAIT（应用没 close）
ss -s                             # 汇总统计
ss -tnp dst 10.0.0.5:3306         # 到某目标的连接
```

`-p` 需要 root 才能看到别人的进程。找端口占用：`ss -lntp | grep :8080` 或 `fuser -n tcp 8080` / `lsof -i:8080`。

### Q60. `netstat`/`ss` 里 `Recv-Q` 和 `Send-Q` 分别代表什么？【中】

- **LISTEN 状态**：`Recv-Q` = 已完成三次握手但还没被 `accept()` 的连接数（accept 队列），`Send-Q` = backlog（`somaxconn` 与 `listen()` 参数较小值）
- **ESTABLISHED 状态**：`Recv-Q` = 已收到但应用没读的字节数，`Send-Q` = 已发但未被对端确认的字节数

`Recv-Q` 持续不为 0 → 应用太慢/阻塞，典型是「连接能建但业务超时」。这是判断「网络问题还是应用问题」的分水岭指标。

### Q61. `tcpdump` 怎么抓包才能抓到有用的？【中】

```bash
tcpdump -i eth0 -nn -s0 -w /tmp/cap.pcap
tcpdump -i any -nn 'host 10.0.0.5 and port 3306'
tcpdump -i eth0 -nn -A 'tcp port 80 and (((ip[2:2] - ((ip[0]&0xf)<<2)) - ((tcp[12]&0xf0)>>2)) != 0)'
tcpdump -r /tmp/cap.pcap -nn | head
```

要点：

- `-s0` 抓全包（默认截断，会丢 payload）
- `-w` 落盘而不是打印（打印会大量丢包）
- 高流量下加 `-B 4096` 或用 `-c` 限量
- **生产抓包限时长限大小**，`timeout 60 tcpdump ...` 是保命习惯

分析用 Wireshark：重点看 `tcp.analysis.flags`（重传、`Dup ACK`、`ZeroWindow`）。

### Q62. TCP 重传率高说明什么？怎么定位？【高】

```bash
ss -ti | grep -E 'retrans|rtt'
nstat -az TcpRetransSegs TcpOutSegs
sar -n ETCP 1
```

`TcpRetransSegs / TcpOutSegs` 就是重传率，**超过 1% 就该查，5% 以上肯定是故障**。

方向：链路质量（`mtr` 看丢包节点）、对端处理慢导致超时重传（同 `Dup ACK`）、MTU 不匹配（大包全丢小包通 → `ping -M do -s 1472`）、网卡/交换机丢包（`ethtool -S eth0 | grep -i drop`）。

### Q63. 网卡丢包怎么区分是驱动丢了还是内核丢了？【高】

```bash
ip -s link show eth0                       # RX errors/dropped
ethtool -S eth0 | grep -i -E 'drop|error|miss|fifo'
cat /proc/net/softnet_stat                 # 每核 backlog 溢出（第 2 列 = dropped）
```

`ethtool -S` 的计数是**硬件/驱动层**丢；`/proc/net/softnet_stat` 是有包但内核来不及处理（`netdev_max_backlog` 溢出）丢；`ip -s link` 的 `dropped` 多来自协议栈。

解决方向：开多队列 `RPS/RSS`、调 `net.core.netdev_max_backlog`、关 `irqbalance` 手工绑核、排查是否被 `tc`/iptables 丢。

### Q64. DNS 解析慢怎么查？【中】

```bash
cat /etc/resolv.conf              # 是否配了不可达的 DNS
getent hosts example.com          # 走 NSS，最接近应用行为（推荐）
dig +trace example.com
dig @8.8.8.8 example.com +tcp     # 对比 UDP 与 TCP
tcpdump -i any -nn port 53
```

常见根因：`resolv.conf` 里第一个 DNS 不可达（**默认超时 5 秒×重试 2 次 = 10 秒**）、`/etc/nsswitch.conf` 里 `hosts:` 顺序把 `dns` 排在 `files` 前、`search` 域过多导致多轮查询、IPv6 优先但没 IPv6 出口（`dig AAAA` 超时）。

**应用层超时排查一定先 `getent`，别只用 `dig`。**

### Q65. `/etc/hosts`、`resolv.conf`、`nsswitch.conf` 的优先级关系？【中】

解析顺序由 `/etc/nsswitch.conf` 的 `hosts:` 决定，典型 `files dns`：先 `/etc/hosts`，再 DNS。

`/etc/hosts` 里出现 IPv6 空映射（`::1 localhost`）或错误条目会导致「明明域名能解析却连到 127.0.0.1」。**排查诡异解析问题时三个文件一起看**，只看 `resolv.conf` 会漏。

坑：`systemd-resolved` 或 NetworkManager 会重写 `resolv.conf`（可能是软链到 `/run/systemd/resolve/stub-resolv.conf`），手改会被冲掉，要用 `resolvectl` 或 `nmcli` 配。

### Q66. 一个端口 telnet 不通但 curl 是通的，为什么？【中】

典型场景和原因：

- **`telnet` 走 TCP 明文到目标端口**，如果目标是 HTTPS（443），握手会挂住但你看到的是「连上了」——`telnet` 只验证 TCP 可达
- 应用层代理：走 `curl` 时用了 `http_proxy` 环境变量，`telnet` 不走代理 → 直连不通
- `curl` 命中 DNS 缓存/hosts，`telnet` 用另一个解析器
- 目标只放行了特定 ACL 或基于 SNI 的策略

**结论：判连通性用 `nc -vz host port`，判业务可用性必须用 `curl -v`，两者不能互相替代。**

### Q67. 怎么只让某台机器访问某端口，又不挡同网段其他服务？【中】

用 firewalld rich rule 或 iptables：

```bash
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.5/32" port port="3306" protocol="tcp" accept'
firewall-cmd --reload

iptables -A INPUT -p tcp --dport 3306 -s 10.0.0.5 -j ACCEPT
iptables -A INPUT -p tcp --dport 3306 -j REJECT
```

**顺序决定结果**：iptables 按规则顺序匹配，`REJECT` 必须在 `ACCEPT` 之后。`REJECT` 优于 `DROP`（对端立刻收到拒绝，不会干等超时）。

### Q68. 双网卡/多 IP 场景下，回包走错网卡怎么办？【高】

现象：外部能进包但回不去（`tcpdump` 看到入站没出站），或回包从另一块网卡出去被丢。

原因：内核按路由表选出口，**默认路由只有一个**。

方案：

```bash
ip rule add from 10.0.0.10 table 100
ip route add default via 10.0.0.1 table 100
ip route add 10.0.0.0/24 dev eth0 table 100
```

这叫**策略路由**。云主机还常见「弹性 IP 与内网 IP 分离」导致的回包不对称，需要 SNAT 或源地址选择（`ip route ... src`）。

### Q69. 为什么 `TIME_WAIT` 集中在客户端？怎么减少？【中】

`TIME_WAIT` 只出现在**主动关闭方**。客户端用短连接请求 → 每次都是客户端先关 → 客户端堆积。

减少手段（从优到劣）：

1. **用长连接 / 连接池**（应用层优化，唯一根治）
2. 服务端先关（`nginx keepalive_timeout` 调小），把 TIME_WAIT 转移给服务端
3. `net.ipv4.tcp_tw_reuse=1`（仅对出站连接、且要求 `timestamp` 开启，安全）
4. 扩大 `ip_local_port_range` 提高可用端口数
5. **不要用 `tcp_tw_recycle`**（已被内核移除，NAT 环境下会拔错连接）

### Q70. `CLOSE_WAIT` 很多是什么问题？【中】

**应用收到了 FIN 但没有调用 `close()`**，是代码 bug，改内核参数无效。

```bash
ss -tn state close-wait | head
lsof -p <pid> | grep CLOSE_WAIT
```

根源：异常分支没关连接、连接池归还逻辑缺失、阻塞在读/写而没有超时。**这类故障会稳定消耗 fd 直到进程报 `Too many open files`**，应急只能重启进程，根治必须改代码。

### Q71. 怎么排查「偶发 1 秒/3 秒/5 秒超时」？【高】

1 秒 / 3 秒 / 5 秒这种整齐的耗时几乎都是**超时重试**，不是「慢」：

- DNS 超时（5s 起，重试翻倍）
- TCP SYN 重传（1s、3s、7s 指数退避）→ 说明丢包或目标没监听
- 连接池耗尽等待超时
- `connect` 到未开放端口被防火墙 `DROP`（不是 `REJECT`）→ 吃满 SYN 重传时间

排查：`strace -f -T -e trace=network -p <pid>` 看哪个系统调用耗时；`ss -ti` 看 RTT；`tcpdump` 看是否有 SYN 无 SYN-ACK。

### Q72. MTU 不匹配会有什么表现？怎么验证和修正？【高】

表现：**小包通、大包不通**；SSH 能登录但一执行命令就卡；HTTPS 握手成功但下载大文件挂死；ping 通但 `curl` 超时。

验证：

```bash
ping -M do -s 1472 -c 2 8.8.8.8      # 1500 - 20(IP) - 8(ICMP) = 1472
ping -M do -s 1400 -c 2 8.8.8.8      # 逐步减小定位真实 MTU
```

修正：隧道/VPN 场景把 MTU 调小（`ip link set dev tun0 mtu 1400`），或开 `net.ipv4.tcp_mtu_probing=1` 让内核自动探测，同时清 `icmp-*` 相关的阻断规则（**PMTUD 依赖 ICMP，阻断 ICMP 是 MTU 故障的头号元凶**）。

### Q73. `curl` 排障的常用参数？【初】

```bash
curl -v https://api.example.com/health
curl -o /dev/null -s -w '%{http_code} %{time_connect} %{time_starttransfer} %{time_total}\n' https://x
curl --resolve api.example.com:443:10.0.0.5 https://api.example.com/health   # 绕过 DNS 直连指定 IP
curl -x http://proxy:8080 -I https://x
curl -k -I --connect-timeout 3 --max-time 10 https://x
```

`--resolve` 是最实用的一个：**证书要匹配域名，不能直接换成 IP**，用 `--resolve` 可以同时验证「DNS 有问题还是后端有问题」。

### Q74. 怎么做带宽/时延/丢包的持续监测？【中】

```bash
mtr -rwzc 100 10.0.0.5                     # 逐跳丢包
ping -i 0.2 -c 1000 target | tail -3
sar -n DEV 1 10                            # 网卡吞吐
iftop -i eth0 / nethogs                    # 实时按连接/按进程
iperf3 -c server -t 30 -P 4                # 打流测吞吐
tc qdisc show dev eth0                     # 是否有人加了限速
```

注意：**`mtr` 中间跳丢包但末跳不丢是正常的**（中间设备对 ICMP 限速），只有末跳丢包才代表真实问题。

### Q75. 什么是 `tc` 限速，运维什么时候需要它？【高】

```bash
tc qdisc add dev eth0 root tbf rate 100mbit burst 32kbit latency 400ms
tc qdisc del dev eth0 root
tc -s qdisc show dev eth0
```

用途：压测环境模拟弱网、防止某业务打满带宽影响其他服务、容器网络限速（CNI 底层就是 tc/eBPF）。

坑：`tbf` 是整形（会排队，增加延迟），要限速+低延迟用 `htb` 分层；**限速配错会导致整机网络全断**，生产操作前必须先确认出口 qdisc 现状。

### Q76. 容器里 `curl` 不通但宿主机通，怎么查？【高】

1. 容器网络模式（`docker inspect -f '{{.HostConfig.NetworkMode}}'`）：`none`/`host`/`bridge`/自定义网络
2. 容器内 DNS：`/etc/resolv.conf` 是否是 `127.0.0.11`（Docker 内嵌 DNS）
3. 网关是否可达：`ip route`、`ping 网关`
4. NAT/转发：宿主机 `net.ipv4.ip_forward=1`、`firewalld` 是否拦 `docker0`
5. 进容器网络命名空间对比：`nsenter -t <pid> -n curl ...`

最常见两个根因：**宿主机 iptables 的 `FORWARD` 链被默认 `DROP`**（常见于手动加固过），以及 **MTU 不匹配**（容器 1500，Overlay 网络实际 1450）。

---

## 六、防火墙与安全加固

### Q77. `firewalld` 和 `iptables` 什么关系？【初】

`firewalld` 是 `iptables/nftables` 的**管理层**（动态规则、zone 概念、不需要 reload 就生效）；`iptables` 是直接写规则的底层工具。

现在 `firewalld` 默认后端已经是 **nftables**，纯 `nft` 也可以直接管。

**不要混用**：`firewall-cmd` 写的规则和手工 `iptables -A` 的规则会互相覆盖/重排，`systemctl restart firewalld` 会清掉手工规则。选定一套。

### Q78. `firewalld` 的 zone 怎么理解？生产常用配置是什么？【中】

zone = 一张规则集，接口/IP 绑定到 zone，按 zone 决定放行什么。

```bash
firewall-cmd --get-active-zones
firewall-cmd --permanent --zone=public --add-service=http --add-service=https
firewall-cmd --permanent --zone=public --add-port=8080/tcp
firewall-cmd --permanent --zone=trusted --add-source=10.0.0.0/8
firewall-cmd --reload
firewall-cmd --list-all
```

生产套路：公网口放 `public` 只开 22/80/443，内网段加进 `trusted`（全通），数据库层单独 zone 只放应用段。**`--permanent` 与立即生效是两套，改完必须 `--reload`。**

### Q79. `iptables` 四表五链是什么？包怎么走？【中】

表：`filter`（默认）、`nat`、`mangle`、`raw`。
链：`PREROUTING`、`INPUT`、`FORWARD`、`OUTPUT`、`POSTROUTING`。

入站简要路径：`PREROUTING(nat/mangle)` → 路由判断 → 本机则 `INPUT(filter)` → 应用。
转发：`PREROUTING` → `FORWARD` → `POSTROUTING`。
出站：`OUTPUT` → `POSTROUTING`。

**记住 `FORWARD` 是容器网络和路由转发命门**，Docker 依赖它做 NAT，加固时把它设成 `DROP` 会让所有容器断网。

### Q80. 怎么只放行必要端口，并防止被暴力破解 SSH？【中】

```bash
# 只允许 22/80/443
firewall-cmd --permanent --remove-service=dhcpv6-client
firewall-cmd --permanent --add-service=ssh --add-service=http --add-service=https
firewall-cmd --reload

# 防爆破：fail2ban（Debian/Ubuntu 常见）或 firewalld ipset
fail2ban-client status sshd
```

`firewalld` 侧也可以：

```bash
firewall-cmd --permanent --add-rich-rule='rule service name=ssh limit value=4/m burst=8 accept'
```

再加 sshd 本身：禁 root、禁口令、`MaxAuthTries 3`。**多层叠加才是正解**，单靠一层都可能被绕过。

### Q81. SELinux 到底该关还是该调？遇到拦了怎么办？【高】

**不要 `setenforce 0` 了事**，那是把整个强制访问控制关掉，等保和合规直接不合格。

```bash
getenforce
sestatus
ls -Z /var/www/html              # 看上下文
ausearch -m avc -ts recent
semanage fcontext -a -t httpd_sys_content_t '/data/www(/.*)?'
restorecon -Rv /data/www
setsebool -P httpd_can_network_connect on
```

关键点：`semanage fcontext` 只改「规则」，必须再 `restorecon` 才落到文件上；`setsebool -P` 的 `-P` 才是永久。

`audit2allow -a -M mypol` 可以生成策略模块，但**先确认这是正常的业务访问**，不要见一个 AVC 就放行。

### Q82. 出问题第一时间怎么判断是不是 SELinux 干的？【中】

```bash
getenforce                        # Enforcing 才可能拦
journalctl -t setroubleshoot --since -1h
ausearch -m avc -ts today
grep -i denied /var/log/audit/audit.log | tail
```

快速验证：`setenforce 0` 后复现——**通了就确定是 SELinux，但立刻 `setenforce 1` 恢复**，再正经加策略。生产上长期 `Permissive` 只是掩盖问题，日志还在涨，等于没解决。

### Q83. 怎么做基线加固（不用专业工具的话）？【中】

按清单逐项：

1. 账号：删默认/无用账号，`passwd -l` 锁定，`chage` 设口令策略，禁用 root 直接登录
2. SSH：禁口令登录、改端口（可选）、`AllowUsers`
3. 权限：`/etc/passwd /etc/shadow /etc/sudoers` 权限收敛（`chmod 600 /etc/shadow`）
4. 服务：关 `telnet/ftp/rsh`，禁用不用服务 `systemctl disable`
5. 内核：`rp_filter`、`accept_redirects=0`、`kptr_restrict`、`dmesg_restrict`
6. 时间同步 + 日志外发（防止攻击者清本地日志）
7. 补丁：`yum update --security` 定期打

工具化：`OpenSCAP`、`Lynis`、`Ansible` 剧本（一次写好反复用）。

### Q84. 勒索/入侵后的应急动作顺序是什么？【高】

**顺序错了会毁掉证据或让攻击者提前清除痕迹。**

1. **隔离**：先拔网线/改安全组，别急着 `shutdown`（内存里有进程和连接信息）
2. **保全证据**：内存镜像、`/var/log` 打包外传、`ps`/`ss`/`lsof` 快照
3. **定位**：`crontab`、`/etc/rc.local`、systemd unit、`~/.ssh/authorized_keys`、SUID 文件、`ld.so.preload`、异常账号、异常外联
4. **清除**：确认入口后重建机器（**劝退「在中毒机上杀毒」，尤其挖矿和 rootkit**）
5. **复盘**：入口、横向移动路径、影响范围、加固项

必查命令：

```bash
last -a | head;  lastb | head
crontab -l -u root; ls -l /etc/cron.d/
find / -xdev -perm -4000 -type f 2>/dev/null
cat /etc/ld.so.preload
ss -tnp | grep ESTAB
```

### Q85. 文件完整性怎么做校验？【中】

```bash
sha256sum file > file.sha256
sha256sum -c file.sha256
find /etc -type f -exec md5sum {} + > /root/etc.md5
```

生产用 `AIDE` 或 `Tripwire`：建基线库 → 定期 `aide --check` → 变更告警。**注意排除 `/var/log`、`/proc`、`/tmp` 这些高频变化目录**，否则每天都是噪声告警。

### Q86. SSH 密钥登录已经配了但不生效，查什么？【中】

1. 权限（**最常见**）：`chmod 700 ~/.ssh`、`chmod 600 ~/.ssh/authorized_keys`，家目录不能对 group/other 可写
2. SELinux 上下文：`restorecon -Rv ~/.ssh`
3. `sshd_config`：`PubkeyAuthentication yes`、`AuthorizedKeysFile .ssh/authorized_keys`
4. sshd 日志：`/var/log/secure` 里会有 `Authentication refused: bad ownership or modes`
5. 公钥格式：必须是一行（换行会被截断），`ssh-rsa AAA... comment`
6. `StrictModes yes`（默认）会严格检查权限

调试：客户端 `ssh -vvv`，服务端临时 `LogLevel DEBUG2` 再 `systemctl reload sshd`。

### Q87. 怎么防止误操作把自己的 SSH 锁死？【中】

- 改 `sshd_config` 前备份，改完 `sshd -t` 校验
- **保留一个已登录会话**，改完另开新窗口验证
- 用 `AllowUsers` 加白前先确认当前 IP 在内
- 防火墙规则变更用 `firewall-cmd --timeout=60` 临时生效，60 秒后自动回滚
- `iptables` 用 `at` 定时任务做「10 分钟后清空规则」的保险

这是运维最基本的自保习惯，比任何工具都有效。

### Q88. `chattr` 和 `chmod` 有什么区别？谁更强？【中】

- `chmod` 改权限位（DAC，属主/组/其他）
- `chattr` 改**文件系统属性**，如 `+i`（不可变，root 也不能改/删）、`+a`（只能追加，日志防篡改）

```bash
chattr +i /etc/passwd
lsattr /etc/passwd
chattr -i /etc/passwd
```

`+i` 对 root 也生效，比 `chmod` 更硬。**坑：加了 `+i` 的目录会让 `yum/apt` 升级失败**（无法替换文件），升级前记得去掉；也别忘了它会让 `rm` 报 `Operation not permitted`，排查时容易误判成权限问题。

---

## 七、软件包与仓库管理

### Q89. `yum/dnf` 和 `apt` 的常用操作对照？【初】

| 目的 | RHEL 系 | Debian 系 |
|---|---|---|
| 更新索引 | `dnf makecache` | `apt update` |
| 装包 | `dnf install pkg` | `apt install pkg` |
| 删包 | `dnf remove pkg` | `apt remove --purge pkg` |
| 查已装 | `dnf list installed` | `dpkg -l` |
| 找包 | `dnf provides '*/ifconfig'` | `apt-file search ifconfig` |
| 升级系统 | `dnf update` | `apt upgrade` / `full-upgrade` |
| 查依赖 | `dnf deplist pkg` | `apt-cache depends pkg` |

**`dnf provides` 是排障神器**：「某命令找不到」直接反查属于哪个包。

### Q90. 装包报依赖冲突 / `Protected multilib versions` 怎么处理？【中】

先看清是「版本冲突」还是「仓库冲突」：

```bash
dnf repoquery --duplicates
dnf history
dnf history undo <id>
dnf --enablerepo=xx install pkg --allowerasing
```

常见根因：混装了多个源（EPEL + 自建源 + 官方源）里同名不同版本包、手工 `rpm -ivh` 装过老版本、`baseurl` 指向的镜像不同步。

铁律：**能用 `dnf` 就别用 `rpm -ivh --nodeps`**，`--nodeps` 装上去的包后面会连锁崩。

### Q91. 内网环境怎么搭本地 yum 仓库？【中】

```bash
# 有外网的机器同步
dnf install -y createrepo_c
reposync -n --repoid=baseos --download-path=/data/repo
createrepo_c /data/repo/baseos

# 内网机器
cat > /etc/yum.repos.d/local.repo <<'EOF'
[local]
name=Local
baseurl=http://10.0.0.10/repo/baseos
enabled=1
gpgcheck=0
EOF
```

更省事：挂载 ISO 做本地源（`/etc/yum.repos.d/cdrom.repo` 指向 `file:///mnt/cdrom`）。**内网必须做这件事**，否则每台机器离线装包都是灾难。

### Q92. 怎么只装安全补丁，不全量升级？【中】

```bash
dnf update --security
dnf updateinfo list security
apt list --upgradable
apt install --only-upgrade pkg
```

`dnf update --security` 只装标了 security 的更新，风险最小。生产建议流程：**先在灰度机打 → 观察 24h → 批次推送**，别一次升级全部机器（内核/glibc/openssl 升级通常要重启）。

### Q93. 编译安装的软件怎么卸载干净？【中】

`./configure --prefix=/usr/local/app && make && make install` 的包**没有包管理器记录**，卸载只能：

```bash
cd src && make uninstall          # 有 uninstall 目标才行
rm -rf /usr/local/app
```

规范做法：装的时候用 `checkinstall`（生成 rpm/deb）或 `--prefix` 到独立目录，甚至打成 RPM 用包管理器管。**「装得进去、删不干净」是运维负债的典型来源。**

### Q94. 生产服务器能不能随便 `dnf update`？【中】

不能。风险点：

- 内核升级 → 需要重启才生效，且第三方驱动（nvidia、zfs、dkms）可能不兼容
- glibc/openssl 升级 → 长跑进程仍用旧库，行为不一致
- 依赖被顺带升级 → 应用 ABI 变化
- 镜像源不同步 → 装到半新半旧的版本

规范：固定版本（`dnf versionlock`）、维护内网快照源、变更窗口执行、**先备份再升级**、留回滚方案（`dnf history undo` 或快照）。

### Q95. `rpm -V` 能做什么？【高】

校验已安装包的文件是否被改动（大小、权限、MD5、属主、时间）：

```bash
rpm -V openssh-server
rpm -Va                          # 全量校验（慢）
```

输出 `S.5....T.` 之类标记：`S`大小 `M`权限 `5`MD5 `D`设备 `L`链接 `U`属主 `G`属组 `T`时间。

**入侵排查必用**：`rpm -Va | grep '^..5'` 找被替换过的二进制。

### Q96. 怎么给一个服务「固定版本」避免被顺手升级？【中】

```bash
dnf install -y 'dnf-command(versionlock)'
dnf versionlock add nginx
dnf versionlock list
dnf versionlock delete nginx
```

Debian 系：`apt-mark hold nginx` / `apt-mark unhold nginx`。

配合监控「有没有人解锁」，否则 `versionlock` 只是摆设。

### Q97. 源码编译时 `configure` 报找不到库，怎么办？【中】

```bash
dnf install -y gcc make autoconf automake libtool pkgconfig
dnf install -y openssl-devel zlib-devel pcre-devel
pkg-config --cflags --libs openssl
```

关键：**装的是 `-devel` / `-dev` 包（头文件），不是运行库**。报错里 `checking for XXX... no` 直接对应缺失的开发包。

找不到但确实装了 → 检查 `PKG_CONFIG_PATH`、`CFLAGS/LDFLAGS` 是否指到自定义 `--prefix` 目录。

### Q98. `ldd` 报 `not found` 但库文件明明存在，为什么？【高】

```bash
ldd /usr/local/bin/app | grep 'not found'
ldconfig -p | grep libfoo
cat /etc/ld.so.conf; ls /etc/ld.so.conf.d/
LD_DEBUG=libs /usr/local/bin/app 2>&1 | head -50
```

原因：

- 库在非标准路径且没写进 `/etc/ld.so.conf.d/` + 没跑 `ldconfig`
- 库架构不匹配（32/64 位）
- `LD_LIBRARY_PATH` 只在交互 shell 里设了，systemd 服务没继承
- 库本身还有依赖没满足（`ldd libfoo.so` 递归查）

**`ldd` 在不可信二进制上别乱跑**（老版本 `ldd` 会执行目标），用 `objdump -p | grep NEEDED` 更安全。

### Q99. `alternatives` / `update-alternatives` 是干什么的？【中】

管理同一功能的多个版本共存与默认选择，如 `java`、`python`、`gcc`。

```bash
alternatives --config java
update-alternatives --install /usr/bin/python3 python3 /usr/local/bin/python3.11 100
update-alternatives --display python3
```

坑：**`alternatives` 只改 `/usr/bin/xxx` 的软链，改不了 `PATH` 里更靠前的路径**。排查「版本不对」时先 `which -a python3` + `echo $PATH`，再看 alternatives。

### Q100. 怎么判断一个包是谁装的（是不是我装的）？【中】

```bash
rpm -qi nginx                        # 安装时间、来源、大小
dnf history | grep install
grep -i "install" /var/log/dnf.log
dpkg -S /usr/bin/nginx               # 文件属于哪个包
dpkg -l | grep ^rc                   # 残留配置
```

`rpm -qi` 的 `Install Date` 和 `Vendor` 能区分「ISO 自带」与「后来装」。**接手别人的机器时，用这个 + `rpm -Va` 建立基线最快。**

---

## 八、日志体系与审计

### Q101. Linux 日志都放在哪，各自的职责？【初】

| 位置 | 内容 |
|---|---|
| `/var/log/messages`（RHEL）/ `syslog`（Debian） | 系统级通用日志 |
| `/var/log/secure` / `auth.log` | 认证、sudo、SSH |
| `/var/log/cron` | 定时任务执行记录 |
| `/var/log/dmesg` / `journalctl -k` | 内核日志 |
| `/var/log/boot.log` | 启动过程 |
| `/var/log/yum.log` / `dpkg.log` | 包管理 |
| `/var/log/audit/audit.log` | 审计（SELinux AVC 也在这） |
| `journalctl` | systemd 统一日志（二进制，需工具读） |

**注意 journald 与 rsyslog 并存**：journald 是采集层，rsyslog 从 journal 读出来写文件，两条链路都要看。

### Q102. 日志轮转怎么配？`copytruncate` 有什么坑？【中】

`/etc/logrotate.d/app`：

```text
/var/log/app/*.log {
    daily
    rotate 14
    size 200M
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        /bin/systemctl reload app >/dev/null 2>&1 || true
    endscript
}
```

`copytruncate` 是「复制后清空原文件」，适合**不支持重开文件的应用**，代价是复制与清空之间会丢日志，大文件还会造成 IO 抖动。

**首选 `create` + `postrotate` 发信号让应用重开文件**（`reload`），日志零丢失。

### Q103. `logrotate` 跑了但没生效，怎么查？【中】

```bash
logrotate -d /etc/logrotate.conf          # dry-run，看匹配到哪些文件
logrotate -vf /etc/logrotate.d/app        # 强制跑一次看细节
cat /var/lib/logrotate/logrotate.status   # 上次轮转时间
grep logrotate /var/log/cron
```

常见原因：配置文件名带 `.` 后缀被忽略（`app.conf.bak`）、`su` 指令和目录属主不匹配（不安全路径会被跳过）、`size` 与 `daily` 同时存在时以 `size` 优先、状态文件没更新导致认为「今天已跑过」。

### Q104. 应用日志把磁盘写满了，怎么快速定位并止损？【中】

```bash
df -h
du -sh /var/log/* | sort -h | tail
lsof +L1 | grep -i log                   # 已删除但仍被占用
find /var/log -type f -size +1G -exec ls -lh {} \;
```

止损：`> /var/log/app.log`（原地清空，进程仍持有 fd，**不会释放 inode 但会释放空间**）；或 `truncate -s 0 file`。

根治：接 logrotate、接入集中日志（ELK/Loki）、给 `/var/log` 单独分区或 LVM、设置磁盘水位告警（**85% 就告警，别等 100%**）。

### Q105. 怎么把日志实时发到中心服务器？【中】

```bash
# rsyslog 客户端 /etc/rsyslog.d/50-remote.conf
*.* @@10.0.0.10:514        # @@ TCP，@ 是 UDP
```

服务端开 `module(load="imtcp")` + `input(type="imtcp" port="514")`。

现代方案：`Filebeat/Vector/Promtail` → Kafka → ES/Loki。**关键设计：本地留 3–7 天作为网络中断时的缓冲，远端留 30–180 天做审计**，只靠远端一旦断网就全丢。

### Q106. `auditd` 怎么用？监控文件改动给个例子。【高】

```bash
# /etc/audit/rules.d/audit.rules
-w /etc/passwd -p wa -k passwd_change
-w /etc/sudoers -p wa -k sudoers_change
-a always,exit -F arch=b64 -S execve -F path=/usr/bin/curl -k curl_exec

systemctl restart auditd
ausearch -k passwd_change -ts today
aureport -au --summary
```

`-p wa` 是「写 + 属性变更」。**注意 auditd 负载**：监控 `execve` 这类高频系统调用会让 CPU 和日志量暴涨，规则要收敛到关键路径。

Debian 系如果 auditd 装了却不生效，检查 `/etc/audit/auditd.conf` 的 `log_file` 权限和 `audit=1` 内核参数。

### Q107. 日志里要 grep 时间范围，怎么写才高效？【中】

```bash
grep -E '2026-10-28 (1[0-2]):' app.log
awk '$0 >= "2026-10-28 10:00" && $0 <= "2026-10-28 11:00"' app.log
sed -n '/2026-10-28 10:00/,/2026-10-28 11:00/p' app.log
journalctl --since "2026-10-28 10:00" --until "2026-10-28 11:00" -u app
```

大文件别用 `cat`，用 `awk`/`sed` 流式处理；几 GB 以上先 `split` 或直接上 `rg`/`clickhouse`。**能用 `journalctl --since` 就别 grep**，它有索引。

### Q108. 怎么统计 Nginx access log 的 Top IP / 状态码 / 慢请求？【中】

```bash
# Top 20 IP
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -20

# 状态码分布
awk '{print $9}' access.log | sort | uniq -c | sort -rn

# 最慢的 20 个请求（假设 $request_time 是最后一列）
awk '{print $NF, $7}' access.log | sort -rn | head -20

# 5xx 按小时统计
awk '$9 ~ /^5/ {print substr($4,2,14)}' access.log | uniq -c
```

坑：日志格式改过（加了字段）后列号会漂，**依赖列号的脚本必须和 `log_format` 一起维护**，最好用 `$request_time` 放到固定位置或用 JSON 格式日志。

### Q109. 为什么日志要打 request-id？怎么排查跨服务问题？【中】

没有 request-id 时，一次失败请求在 5 个服务的日志里是 5 条互不关联的记录；有 id 时一次 `grep` 就能串起来。

做法：入口生成（Nginx `$request_id` 或应用生成 UUID）→ 通过 header 透传（`X-Request-Id`）→ 每个服务写入日志 → 集中查询。

**这是可观测性的最低成本改造**，比上 tracing 便宜得多，收益却很大。

### Q110. 容器日志怎么看？为什么 `docker logs` 会丢？【中】

```bash
docker logs --tail 200 -f <container>
docker inspect -f '{{.LogPath}}' <container>
journalctl -u docker --since -1h
kubectl logs -f deploy/app --previous     # --previous 看上次崩溃的容器
```

`docker logs` 只保留 json-file 驱动的日志，且**默认无大小限制会写满磁盘**——必须配 `--log-opt max-size=50m --log-opt max-file=3` 或 daemon.json 全局配。

容器重启后旧日志在 `--previous`（K8s）或 `json.log.1` 里；`Storage=none` 或日志驱动为 journald 时 `docker logs` 是空的。

---

## 九、性能分析与调优

### Q111. 接到「服务器很慢」，你的排查顺序是什么？【中】

**先看整体，再下钻，别一上来就看进程列表。**

```bash
uptime                       # load 与趋势
dmesg -T | tail              # 有没有硬件/内核报错
vmstat 1 5                   # CPU/内存/IO/上下文切换
iostat -x 1 3                # 磁盘 util/await
free -h                      # 内存与 swap
sar -n DEV 1 3               # 网络
pidstat -u -d 1 3            # 按进程看 CPU/IO
```

顺序对应 USE 方法：**使用率、饱和度、错误**，先定位资源类型（CPU/内存/IO/网络），再定位进程，再看进程内部（`strace`/火焰图）。

### Q112. `vmstat` 每一列都代表什么？重点看哪几列？【中】

```text
procs -----------memory---------- ---swap-- -----io---- --system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
```

重点：

- `r`：可运行队列长度，**持续 > CPU 核数说明 CPU 排队**
- `b`：不可中断睡眠（等 IO）进程数
- `si/so`：换入换出，**非零就是在用 swap，性能已受伤**
- `bi/bo`：块设备读写
- `in/cs`：中断与上下文切换，异常高说明短命进程多或锁竞争
- `us/sy/id/wa/st`：**`wa` 高 = IO 瓶颈，`sy` 高 = 系统调用/内核态开销大，`st` 非零 = 被虚拟化宿主机抢走 CPU**

### Q113. CPU 使用率高，怎么定位到具体代码？【高】

```bash
top -H -p <pid>                       # 找最耗 CPU 的线程 TID
printf '%x\n' <tid>                   # 转十六进制
jstack <pid> | grep -A 30 'nid=0x<hex>'   # Java
perf top -p <pid>                     # 通用：函数级热点
perf record -F 99 -p <pid> -g -- sleep 30 && perf report
```

非 Java：`gdb -p <pid>` 打栈、`py-spy top --pid <pid>`（Python）、`0x`/`pprof`。

**关键点：`top` 的 `us` 高是业务代码，`sy` 高是系统调用/内核，`si` 高是软中断（网卡流量大）——先分这三类再下钻。**

### Q114. `iostat` 的 `%util` 和 `await` 怎么解读？【中】

- `%util`：设备繁忙百分比，**接近 100% 说明队列一直非空**（但对 NVMe 多队列不完全适用）
- `await`：平均 IO 等待时间（ms），包含排队时间，**这才是业务感知的延迟**
- `r/s w/s`：IOPS；`rkB/s wkB/s`：吞吐
- `aqu-sz`：平均队列深度，持续 > 2 说明设备跟不上

判断：`await` 明显高于盘的理论延迟（SSD < 1ms，HDD < 20ms）就是瓶颈。**单看 `%util` 会误判 SSD**，要结合 `await` 和队列深度。

### Q115. 用 `sar` 怎么做事后复盘？【中】

`sar` 的价值是**历史数据**，故障过去后还能回看。

```bash
sar -u -f /var/log/sa/sa28            # 那天 CPU
sar -r -s 10:00:00 -e 11:00:00        # 内存
sar -d -p                             # 磁盘
sar -n DEV                            # 网络
```

前提是 `sysstat` 的 `sa1` 定时采集在跑（`/etc/cron.d/sysstat`），默认保留 7 天，生产建议调到 30 天并开 `sa2` 出日报。**没有历史数据是排障时最痛的事。**

### Q116. 内存泄漏和内存暴涨怎么区分？【高】

- **泄漏**：进程 RSS 单调上升、不回落，重启后恢复，`smaps` 里 `Anonymous` 持续增长
- **暴涨**：短时间阶梯式上升，多与流量/批量任务相关，任务结束后回落
- **cache 高不是泄漏**：`free` 的 `buff/cache` 可回收，看 `available`

```bash
ps -o pid,rss,vsz,cmd -p <pid>        # 多刷几次看趋势
cat /proc/<pid>/smaps_rollup
pmap -x <pid> | sort -k3 -n | tail
```

工具：`valgrind`（开发期）、`heaptrack`、Java 用 `jmap -histo:live` + `jcmd GC.heap_info`。

### Q117. OOM Killer 日志怎么读？怎么避免误杀关键进程？【高】

```bash
journalctl -k | grep -i -E 'oom|killed process'
dmesg -T | grep -i oom
```

日志里关键信息：触发进程、**`oom_score_adj`**、各进程内存占用表。

降低被杀概率：

- `echo -1000 > /proc/<pid>/oom_score_adj`（-1000 = 永不杀，谨慎）
- 限制容器内存并设置合理 limit（**cgroup 内存限制触发的是 cgroup OOM，不看宿主 `oom_score_adj`**）
- 加 swap（治标）、修内存泄漏（治本）

**别指望 OOM Killer 救你**：它触发说明内存已经到临界，进程被杀前的服务已经不可用。

### Q118. 上下文切换很高是什么原因？【高】

```bash
vmstat 1        # cs 列
pidstat -w 1    # 按进程的 cswch（自愿）/ nvcswch（非自愿）
```

- **自愿切换**多：进程在等 IO/锁/睡眠，通常伴随 IO 或锁竞争
- **非自愿切换**多：CPU 不够，被时间片抢占 → 加核或减少线程
- 短命进程暴增（`fork` 风暴）：`in` 和 `cs` 同时高
- 虚拟化环境开 `nohz_full` 不当、大量小包网络中断

线程数远超核数（几百上千）本身就是切换开销的来源，**线程池大小要和核数匹配**。

### Q119. 怎么用 `perf` 做一次火焰图？【高】

```bash
perf record -F 99 -g -p <pid> -- sleep 30
perf script > out.perf
# 用 FlameGraph 工具
stackcollapse-perf.pl out.perf > out.folded
flamegraph.pl out.folded > flame.svg
```

读图：**横轴是占比（越宽越费时），纵轴是调用栈（越深是越底层）**，找「平顶宽块」就是热点。

注意：`perf_event_paranoid` 默认限制采样，需要 `sysctl -w kernel.perf_event_paranoid=1`；容器里要 `--cap-add SYS_ADMIN` 或 `--privileged` 才能采。

### Q120. 网络吞吐上不去，可能卡在哪？【高】

逐层排查：

1. 网卡速率：`ethtool eth0 | grep Speed`（是不是协商成 100M）
2. 丢包：`ip -s link`、`ethtool -S`、`/proc/net/softnet_stat`
3. 单连接 vs 多连接：`iperf3 -P` 多流对比 → **单流慢多流快说明是单连接 TCP 窗口/延迟限制**
4. 内核参数：`tcp_wmem/rmem`、`netdev_max_backlog`、`somaxconn`
5. 中断绑核与队列：`/proc/interrupts`、`ethtool -l eth0`
6. 应用层：单线程读写、序列化开销

**云主机还要看带宽上限**（包年包月带宽被打满很常见）。

### Q121. `strace` 怎么用才不拖垮生产？【中】

```bash
strace -f -T -tt -e trace=network -p <pid>       # 只看网络类
strace -f -c -p <pid>                            # 只统计耗时
strace -f -o /tmp/trace.txt -s 256 -p <pid>
timeout 10 strace -f -p <pid> -o /tmp/x
```

风险：

- **被 trace 的进程会显著变慢**（每次系统调用都陷入内核）
- `-f` 跟子进程，输出量可能爆炸
- 生产上必须限时长（`timeout`）、限系统调用（`-e`）、写到文件而不是终端

替代：`perf trace`、`bpftrace`（开销低得多）、`/proc/<pid>/syscall` 看当前阻塞点。

### Q122. `uptime`、`top` 里的 `load average` 三个数是什么？怎么用？【初】

分别是 **1 / 5 / 15 分钟**的指数加权平均负载。

用法看趋势：

- 三个都高且接近 → 稳定高负载，需要扩容量
- 1 分钟高、15 分钟低 → 刚起来的突发
- 1 分钟低、15 分钟高 → 刚恢复，正在消化

判断压力要看**除以核数**：8 核 load 8 ≈ 跑满，load 16 = 严重排队。`nproc` 拿核数（注意容器里看到的是宿主机核数，要用 cgroup quota 判断）。

### Q123. 磁盘 IO 高但业务不慢，需要处理吗？【中】

看是谁在写、是否影响关键路径：

```bash
iotop -oPa                          # 按进程看实际 IO
pidstat -d 1
cat /proc/pressure/io               # PSI：IO 压力导致任务停顿的时间占比
```

如果 `%util` 高但业务 `await` 正常、PSI `io` 的 `some` 不高，说明是**后台任务在跑但没挤占关键路径**，可以不处理；反之 `full` 占比上升就必须限流。

**PSI 是比 `%util` 更贴近业务感受的指标**，新内核优先看它。

### Q124. `nmon`/`atop`/`glances` 这类工具值得用吗？【初】

值得，尤其 `atop`：**它会把历史数据落盘（`/var/log/atop/`），能回放任意时间点的进程级快照**，是「昨晚 3 点到底谁在吃 CPU」这类问题的标准答案。

```bash
atop -r /var/log/atop/atop_20261028 -b 03:00
```

`nmon` 适合快速出一份 ASCII 报表给同事；`glances` 适合交互式看全貌。**工具不重要，有历史数据才重要。**

### Q125. 压测时怎么确定瓶颈在应用还是系统？【高】

```bash
# 压测同时观察
top -H -p <pid>            # 应用线程
pidstat -u -d -w 1         # CPU/IO/切换
ss -s / ss -ti             # 连接数与重传
vmstat 1                   # 系统整体
```

判断：

- **CPU 到 100% 且 `us` 占主导** → 应用计算瓶颈
- **`sy` 高** → 系统调用多（小包、频繁读写）
- **`wa` 高、`await` 高** → IO 瓶颈
- **CPU 空闲但 QPS 上不去、延迟高** → 线程池/连接池太小、锁竞争、下游慢

**必须在压测机上同时看被测机指标，只看压测机结果等于盲猜。**

### Q126. 服务器 CPU 型号/核数/缓存怎么查？为什么容器里查不准？【初】

```bash
lscpu
cat /proc/cpuinfo | grep 'model name' | head -1
nproc
lscpu | grep -E 'Socket|Core|Thread'
```

容器里 `/proc/cpuinfo` 和 `nproc` 显示的是**宿主机**的，真实可用量在 cgroup：

```bash
cat /sys/fs/cgroup/cpu.max          # cgroup v2: "quota period"
cat /sys/fs/cgroup/memory.max
```

Java 老版本就是这样把堆大小按宿主机内存配出来的（`-XX:MaxRAMPercentage` + `UseContainerSupport` 才修好）。

---

## 十、内核参数与资源限制

### Q127. `ulimit -n` 改了为什么服务还是 `Too many open files`？【高】

因为 **`ulimit` 只影响当前 shell 及其子进程**，而服务往往由 systemd（PID 1）启动，不走你的 shell，也不读 PAM 的 `limits.conf`。

正确做法（三选一，按优先级）：

```ini
# 1. systemd unit（最可靠）
[Service]
LimitNOFILE=65535
```

```text
# 2. /etc/security/limits.conf（走 PAM 的登录会话）
* soft nofile 65535
* hard nofile 65535
```

```text
# 3. /etc/systemd/system.conf（全局默认）
DefaultLimitNOFILE=65535
```

验证必须看**进程实际值**：`cat /proc/<pid>/limits | grep 'open files'`，看 shell 的 `ulimit -n` 不算数。

### Q128. `net.core.somaxconn` 和 `tcp_max_syn_backlog` 有什么区别？【中】

- `somaxconn`：**已完成握手**的 accept 队列上限（应用 `listen()` 的 backlog 取 `min(backlog, somaxconn)`）
- `tcp_max_syn_backlog`：**半连接**（收到 SYN 未完成握手）队列上限

现象对应：`ss -lnt` 的 `Recv-Q` 接近 `Send-Q` → accept 队列满，需要调 `somaxconn` 和应用 backlog；SYN 被丢导致客户端超时 → 调 `tcp_max_syn_backlog` 并确认 `tcp_syncookies`。

现代内核默认 `somaxconn=4096`，Nginx/Java 高并发场景建议 8192–65535。

### Q129. `vm.swappiness`、`overcommit_memory`、`dirty_ratio` 怎么调？【高】

- `vm.swappiness=1~10`：尽量不用 swap（数据库/中间件主机常用；**不是 0，0 在老内核会引发 OOM**）
- `vm.overcommit_memory=1`：允许超量分配，Redis fork 子进程做 RDB 时必须；`=2` 是严格模式并配合 `overcommit_ratio`
- `vm.dirty_ratio` / `vm.dirty_background_ratio`：脏页比例上限，**写多场景调小（如 10/5）可以避免一次性刷盘造成 IO 毛刺**，代价是更频繁的小批量写

原则：**这些参数是「缓解症状」，改之前先确认瓶颈真的在这**。改错 `dirty_ratio` 会让吞吐掉一半。

### Q130. 端口范围不够用怎么调？有什么副作用？【中】

```bash
sysctl -w net.ipv4.ip_local_port_range="10000 65000"
```

副作用：

- 低端口段可能和已有服务冲突（**别调到 1024 以下**）
- 扩大了端口范围但**对端（NAT/防火墙）也可能有端口限制**，只改本机可能没用
- 端口不释放（TIME_WAIT）时，单纯扩范围只是把问题延后

正确顺序：先减少 TIME_WAIT（长连接/池化）→ 再扩范围 → 再考虑多 IP/多网卡。

### Q131. 为什么文件描述符上限不是越大越好？【高】

- 每个 fd 都占内核内存（`file` 结构体），几十万连接会吃掉大量 slab
- `select()` 有 1024 限制，`epoll` 没这个限制（**所以高并发必须用 epoll**）
- 盲目调大掩盖了 fd 泄漏，问题会在更晚、更难查的时候爆
- 系统级还要看 `fs.file-max` 与 `nr_open`，两者不匹配时会静默失败

规范：按业务实际连接数设（如 65535），加监控（fd 使用率 > 70% 告警），**同时压测验证**。

### Q132. `net.ipv4.tcp_tw_reuse` 和 `tcp_tw_recycle` 的区别？为什么后者被移除？【高】

- `tcp_tw_reuse=1`：允许**出站**连接复用处于 TIME_WAIT 的四元组（需 `timestamps=1`），风险可控
- `tcp_tw_recycle=1`：快速回收 TIME_WAIT，但它会让**同一 NAT 后不同客户端的包被误判为旧包丢弃**，NAT 环境下大面积连接失败

`tcp_tw_recycle` 在 Linux 4.12 已移除。**任何教程还让你开它，直接跳过。** 对比 `sysctl net.ipv4.tcp_tw_recycle` 返回 `cannot stat` 就是新版内核。

### Q133. `rp_filter` 是什么？多网卡场景为什么要关掉？【中】

`rp_filter`（反向路径过滤）会检查入包源地址能否按路由表从同一网卡回出去，不能就丢包——用来防 IP 欺骗。

```bash
sysctl net.ipv4.conf.all.rp_filter
sysctl -w net.ipv4.conf.all.rp_filter=2      # 2=宽松模式
```

多网卡/策略路由/负载均衡（LVS DR、Keepalived 双活）场景下，回包路径和入包网卡不一致，`rp_filter=1` 会直接丢包，表现为「包到了但不通」。

**排查「网络层看着通、实际不通」时，`rp_filter` 一定要看一眼。**

### Q134. 怎么限制单个用户的进程数，防止 fork 炸弹？【中】

```text
# /etc/security/limits.conf
@dev  soft  nproc  200
@dev  hard  nproc  400
```

```bash
# systemd 服务级
systemd-run --scope -p TasksMax=200 /opt/app
```

`nproc` 走 PAM，对 systemd 起的服务无效，服务要写 `TasksMax=`。cgroup v2 里对应 `pids.max`：

```bash
cat /sys/fs/cgroup/<path>/pids.current
echo 200 > /sys/fs/cgroup/<path>/pids.max
```

容器 `--pids-limit` 就是这个。

### Q135. `kernel.pid_max` 需要调吗？PID 用完是什么现象？【中】

现象：`fork: Cannot allocate memory`（实际是 PID 耗尽，不是真的内存不够）、无法新建进程、SSH 登不上。

```bash
cat /proc/sys/kernel/pid_max
ps -eLf | wc -l                  # 线程也算 PID
```

现代默认 `32768`（旧）或 `4194304`（新）。线程多的 Java 进程一台机器几万线程很常见，建议调到 100 万以上。

**PID 耗尽的根因通常是线程泄漏或僵尸进程堆积，调大只是拖延。**

### Q136. 改了 `/etc/security/limits.conf` 只对某些服务不生效，为什么？【高】

因为它**只对通过 PAM 建立的登录会话生效**。以下场景都不生效：

- systemd 启动的服务（用 `LimitNOFILE=`）
- cron 任务（cron 会读 `/etc/security/limits.conf`，但需要 `pam_limits` 在 `/etc/pam.d/crond` 里）
- `su`/`sudo` 切换用户（依赖 PAM 配置顺序，`su -` 才完整加载）
- 容器内进程（继承 daemon 的限制，要改 containerd/docker 的 `LimitNOFILE`）

**判断方法一律看 `/proc/<pid>/limits`，不看配置写了什么。**

---

## 十一、定时任务与批量运维

### Q137. `crontab` 五个字段是什么？`/etc/crontab` 和 `crontab -e` 有什么区别？【初】

```text
* * * * * command
分 时 日 月 周
```

- `crontab -e`：当前用户的表，**没有用户字段**
- `/etc/crontab`、`/etc/cron.d/*`：**多一个用户字段**（第六列），`* * * * * root cmd`

其它特殊：`@reboot`、`@daily`、`@hourly`。**最容易错：`/etc/cron.d/` 下的文件名不能带 `.`（如 `app.conf`），会被忽略。**

### Q138. cron 任务不执行，排查顺序是什么？【中】

1. **环境**：cron 的 `PATH` 只有 `/usr/bin:/bin`，脚本里必须用绝对路径或自己设 `PATH`
2. **权限**：脚本要可执行；`/etc/cron.allow`、`/etc/cron.deny`
3. **日志**：`grep CRON /var/log/cron`（或 `journalctl -u crond`），看有没有被执行
4. **语法**：`/etc/cron.d/` 下漏写用户字段是最常见错误
5. **时间语义**：`日` 和 `周` 同时指定时是 **OR** 关系（`0 3 1 * 1` 是「1 号或周一」都跑）
6. **环境变量**：cron 里没有 `HOME`、`LANG`，中文/编码、相对路径都会出问题

**调试技巧：脚本第一行打印 `env`、`pwd`、`whoami` 重定向到文件。**

### Q139. 一个任务跑了 2 小时还没结束，下次又起来了，怎么防重叠？【中】

用 `flock`：

```bash
*/10 * * * * /usr/bin/flock -n /var/lock/backup.lock /opt/scripts/backup.sh
```

`-n` 拿不到锁立刻退出（不排队）；不加 `-n` 会等待。也可以 `-w 60` 等 60 秒。

其他方案：PID 文件 + 进程检查、`systemd timer` + `RemainAfterExit`、K8s CronJob 的 `concurrencyPolicy: Forbid`。

**这是备份/清理类任务最常见的事故源：多实例并发跑把磁盘 IO 打满。**

### Q140. `rsync` 增量和全量怎么用？`--delete` 有什么风险？【中】

```bash
rsync -avz --progress src/ host:/dst/            # 增量（按大小+时间）
rsync -avz --checksum src/ host:/dst/            # 按内容校验（慢但可靠）
rsync -avz --delete src/ host:/dst/              # 镜像，删掉目标端多余文件
rsync -avz --dry-run --delete src/ host:/dst/    # 先演练！
```

风险：**`--delete` 配错源目录（多了/少了斜杠）会删掉目标端数据**。`src/` 是「同步目录内容」，`src` 是「把目录本身放进去」，一个斜杠之差。

其它常用：`--exclude`、`--bwlimit=10000`（限速，KB/s）、`-e 'ssh -p 2222'`。

### Q141. SSH 批量运维怎么做得又快又安全？【中】

```bash
# 简单场景
for h in $(cat hosts.txt); do ssh -o ConnectTimeout=5 $h 'uptime'; done

# 并行 + 超时（pssh / pdsh）
pdsh -w ^hosts.txt -R ssh -t 10 'systemctl is-active nginx'

# 配置复用
# ~/.ssh/config
Host web-*
  User ops
  ControlMaster auto
  ControlPersist 5m
```

规范：

- **必须设 `ConnectTimeout` 和 `-o BatchMode=yes`**，否则一台掉线会卡住整个循环
- 先 `-o StrictHostKeyChecking=accept-new` 或预置 `known_hosts`
- 生产用 Ansible/K8s，别手搓 for 循环执行变更

### Q142. Ansible 的核心概念是什么？为什么比脚本强？【中】

- **Inventory**（主机清单）→ **Module**（幂等操作单元）→ **Playbook**（YAML 编排）→ **Role**（可复用包）
- 无 agent，走 SSH，天然适合存量机器

比脚本强的地方：**幂等**（跑几次结果一样）、有状态收集（`gather_facts`）、有 dry-run（`--check`）、有任务粒度失败处理（`ignore_errors`/`block`）。

```bash
ansible all -m ping
ansible-playbook -i hosts site.yml --check --diff
ansible all -m setup -a 'filter=ansible_memtotal_mb'
```

坑：`--check` 对 `command`/`shell` 模块不真正生效；大量机器要调 `forks`；**默认并发 5，慢是配置问题不是 Ansible 问题**。

### Q143. `scp`、`rsync`、`sftp`、`nc` 传文件怎么选？【中】

| 场景 | 选择 |
|---|---|
| 少量小文件、简单 | `scp`（已弃用但在，新版本推荐 `sftp`） |
| 大量文件、要断点续传/增量 | `rsync -avz --partial --progress` |
| 目录同步、要排除规则 | `rsync` |
| 内网快速裸传（无加密） | `nc -l 9000 > f` / `nc host 9000 < f` |
| 大文件一次传 | `rsync --bwlimit` 或 `bbcp` |

坑：`rsync` 传大文件中断后**必须用 `--partial`（新版默认 `--partial-dir`）**才能续传；`scp` 跨版本有 `-O` 兼容问题。

### Q144. `nohup` 起的脚本跑一半没了，怎么排查？【中】

按可能性：

1. **OOM Killer** 杀了：`grep -i 'killed process' /var/log/messages`
2. 会话结束发 SIGHUP：确认用了 `nohup` 或 `setsid`（`nohup` 只对当前命令有效，脚本内部再起子进程可能仍被挂断）
3. 定时任务或运维脚本误杀：`/var/log/secure` 看有没有人 `pkill`
4. 磁盘满导致写日志失败退出：`df -h`
5. 脚本自身 `set -e` 遇到某条命令非 0 就退：加 `set -x` 重跑

**长任务一律 `tmux`，并且在脚本里记录 `date +%F\ %T` 到日志头尾，否则事后连「跑到哪一步挂的」都不知道。**

---

## 十二、备份、恢复与容灾

### Q145. 备份的 3-2-1 原则是什么？为什么说「没验证过的备份等于没有备份」？【中】

**3 份数据、2 种介质、1 份异地。**

「没验证」的含义：备份文件可能因磁盘坏、压缩中途被杀、权限不足、`mysqldump` 静默失败而不可用。必须定期做**恢复演练**：

```bash
tar -tzf backup.tar.gz > /dev/null && echo OK      # 完整性
# 定期在测试机真恢复一次，记录耗时（RTO）
```

**RTO（恢复要多久）和 RPO（能丢多少数据）必须在演练中量出来**，面试问「你们备份怎么做的」时，报这两个数字比报工具名有说服力。

### Q146. `tar` 备份要注意什么？【初】

```bash
tar czf /backup/etc-$(date +%F).tar.gz /etc
tar czf /backup/data.tar.gz -C /data .            # 避免绝对路径
tar tzf backup.tar.gz | head                      # 验证
tar xzf backup.tar.gz -C /restore                 # 恢复
```

要点：

- **用 `-C` 而不是绝对路径**，否则恢复时可能覆盖到根分区
- 打包前确认磁盘空间 ≥ 压缩包大小
- `--exclude` 排除缓存、临时文件
- 大目录考虑 `--use-compress-program=zstd`（快很多）
- 备份时 `nice -n 19 ionice -c3 tar ...` 避免影响业务

### Q147. 增量备份方案怎么设计？【高】

- **全量 + 增量**：每周日全量，每天增量（`rsync --link-dest` 硬链快照最省空间）
- **`--link-dest` 实现类似 snapshots**：

```bash
rsync -av --delete --link-dest=/backup/latest /data/ /backup/$(date +%F)/
ln -sfn /backup/$(date +%F) /backup/latest
```

未变化的文件用硬链，几乎不占空间，但每个目录看起来都是完整副本——**这是运维最实用的备份模式之一**。

- 数据库不要用 rsync 备数据文件：用 `mysqldump --single-transaction` 或 XtraBackup，或用 LVM 快照一致性备份。

### Q148. 数据库备份和文件备份有什么区别？【中】

文件备份（rsync/tar）对运行中的数据库**不安全**，因为数据文件在写入过程中不一致，恢复出来可能无法启动。

正确：

- 逻辑备份：`mysqldump --single-transaction --master-data=2`（InnoDB 一致性快照）
- 物理备份：Percona XtraBackup / `pg_basebackup`
- 文件系统级：LVM 快照（先 `FLUSH TABLES WITH READ LOCK` 或 `fsfreeze`）

**并且必须备份 binlog，否则只能恢复到全量那一刻，无法做时间点恢复（PITR）。**

### Q149. 单机备份脚本怎么写才算合格？【中】

合格要素：

1. 有锁（`flock`）防重叠
2. 有日志（成功/失败/耗时/大小）
3. 有校验（`tar -t` 或 `sha256sum`）
4. 有保留策略（删 7 天前）
5. 有告警（失败发邮件/webhook / 写 Prometheus textfile）
6. 异地/对象存储上传

```bash
#!/bin/bash
set -euo pipefail
LOG=/var/log/backup.log
echo "$(date '+%F %T') start" >> $LOG
tar czf /backup/etc-$(date +%F).tar.gz /etc 2>>$LOG
sha256sum /backup/etc-$(date +%F).tar.gz >> $LOG
find /backup -name 'etc-*.tar.gz' -mtime +7 -delete
echo "$(date '+%F %T') done" >> $LOG
```

**最容易忽略的是第 5 条：脚本默默失败半年，谁都不知道。**

### Q150. 有了 RAID 还需要备份吗？【中】

需要。RAID 只防**单盘物理故障**，不防：

- 误删（`rm -rf` 会在阵列上立刻生效）
- 勒索软件加密
- 文件系统损坏、坏块在重建期间扩散
- 机房/云可用区整体故障

**「RAID 是可用性，备份是数据安全」，两者不能互相替代。**

### Q151. 文件系统级恢复和整机恢复的流程差别？【高】

- **单文件恢复**：从备份里 `tar -xzf ... path/to/file -C /tmp` 单独取出，**先恢复到临时目录再对比**，别直接覆盖生产
- **整机恢复**：装机 → 恢复 `/etc` → 恢复数据 → 重新生成 initramfs/grub → 恢复服务 → 验证。风险点是**引导和 initramfs 与硬件绑定**，裸机换硬件常失败

规范：**保留一份「新机器从零能起来」的部署文档**，比备份本身更重要——恢复时人是慌的，文档能救命。

### Q152. 异地容灾要考虑什么？【高】

- **RPO/RTO 目标**：决定用同步（贵、一致）还是异步（便宜、可能丢数据）
- **网络带宽与延迟**：跨地域同步天然有延迟
- **数据一致性**：主备切换时的数据回补（binlog 差异、回环复制）
- **切换演练**：只写预案不演练，真故障时切不过去
- **DNS/流量切换**：GSLB 或 CDN 的 TTL 提前调小

**面试重点：能说清「切换过几次、每次多久、踩了什么坑」。**

### Q153. 快照（云盘/LVM）能当备份吗？【中】

不能。原因：

- 快照通常和原盘在**同一个存储系统**，存储故障/账号误删一起没
- 快照依赖原卷，原卷损坏时快照可能也不可用
- 保留周期短，且很多云快照是崩溃一致性（不是应用一致性）

**快照的价值是「快速回滚」，备份的价值是「灾难恢复」，两者互补。** 正确做法：快照 + 异地备份 + 定期恢复演练三者都有。

### Q154. 怎么备份后验证「备份是可恢复的」？【中】

自动化的最小验证：

```bash
# 1. 完整性
tar -tzf backup.tar.gz > /dev/null || alert
gzip -t backup.tar.gz
sha256sum -c backup.sha256

# 2. 可解压（抽查）
tar -xzf backup.tar.gz -C /tmp/verify ./etc/passwd

# 3. 数据库逻辑备份要真导入一次
mysql -e 'create database verify' && zcat db.sql.gz | mysql verify
```

工程化：每天自动恢复一台临时实例并跑健康检查，**这才是「备份可用」的唯一证明**。

---

## 十三、高可用与共享存储

### Q155. Keepalived 的 VRRP 是怎么工作的？脑裂怎么防？【高】

主备各跑一份 `keepalived`，通过 VRRP 组播（`224.0.0.18`，协议 112）互发心跳；主节点持有 VIP 并定时宣告；备节点在 `advert_int` 内收不到 3 个心跳就接管 VIP。

```text
vrrp_instance VI_1 {
    state BACKUP
    interface eth0
    virtual_router_id 51
    priority 100
    advert_int 1
    authentication { auth_type PASS; auth_pass xxx }
    virtual_ipaddress { 10.0.0.100/24 }
}
```

**防脑裂：**

- 心跳必须走独立链路（直连心跳线）
- `nopreempt` 避免抖动抢占
- 应用层健康检查（`vrrp_script`）比单纯网卡存活可靠
- **必须有仲裁手段**：共享存储的锁、`etcd` 租约、云厂商的独占 IP

脑裂的后果是**两个节点同时挂 VIP 写数据**，比宕机严重得多。

### Q156. VIP 漂移后为什么业务还是不通？【高】

常见原因（按概率）：

1. **ARP 未更新**：客户端/交换机的 ARP 缓存还指向旧 MAC。Keepalived 靠 `gratuitous ARP` 通知，但如果交换机开了 ARP 抑制、或者客户端在别的 VLAN，就收不到。可用 `arping -U -I eth0 10.0.0.100`
2. **后端连接未断**：旧连接的 conntrack 条目还在
3. **应用状态不一致**：新主没有会话/缓存数据
4. **防火墙只放行了原节点**（按 IP 白名单的场景）

### Q157. NFS 能用来做数据库存储吗？为什么不行？【中】

不能（除非是云厂商的高性能 NAS 且明确验证过）。

- NFS 没有块级语义，**不支持 `fsync` 之外的原子性保证**，数据库依赖的直接 IO 和 O_DIRECT 行为不可靠
- 锁机制（NLM）在断网时极易死锁
- 延迟抖动大，数据库对延迟极敏感
- 并发写一致性靠客户端缓存，易损坏

**NFS 适合：静态资源、图片、日志汇聚、K8s 的 RWX 卷（如配置文件、共享上传目录）。**

### Q158. `rsync + inotify` 做实时同步有什么坑？为什么不推荐做双写？【高】

坑：

- `inotify` 有 `max_user_watches` 限制，大目录会报 `No space left on device`（`sysctl fs.inotify.max_user_watches=524288`）
- 事件会丢/合并，海量小文件时延迟大
- **删除事件不同步会导致源删了目标还在**
- 单向同步没有冲突检测，**两边都写就互相覆盖**

因此**不能当双活用**。真需要多写，应该用分布式存储（Ceph/GlusterFS）或应用层分片。

### Q159. 共享存储方案怎么选？【中】

| 方案 | 场景 | 注意 |
|---|---|---|
| NFS | 通用共享目录、K8s RWX | 延迟、单点 |
| Ceph RBD | 块设备、云盘替代 | 运维复杂、需 3 副本 |
| GlusterFS | 简单共享、小规模 | 性能一般，维护弱 |
| 云 NAS/云盘 | 云上最稳 | 贵、跨 AZ 延迟 |
| 对象存储 S3 | 静态资源、备份 | 不适合频繁改写的文件 |

**选型首要看「访问模式」：块、文件、对象三种不能混用。**

### Q160. K8s 里为什么 `ReadWriteMany` 这么难？【高】

`RWM`（多人同时写）需要真正的共享文件系统，而：

- 云盘通常是 `RWO`（块设备，只能单节点挂载）
- 本地盘更不可能共享
- 所以要 NFS/CephFS/云 NAS

实践建议：**能不用 RWM 就不用**——上传目录改用对象存储，配置用 ConfigMap，日志走采集器。**RWM 是架构上偷懒的代价，后面运维成本很高。**

### Q161. 数据库主从延迟怎么监控和缓解？【高】

监控：

```sql
SHOW SLAVE STATUS\G   -- Seconds_Behind_Master（不可靠，空闲时会骗人）
SHOW MASTER STATUS;  SHOW SLAVE STATUS;   -- 对比 GTID / binlog 位点
```

可靠做法：**心跳表**（主库每秒更新时间戳，从库读出来算差值），或 `pt-heartbeat`。

缓解：**读己之写**（写后短时间强制读主）、并行复制（`slave_parallel_workers`）、减少大事务、从库加索引、网络优化。

**`Seconds_Behind_Master` 为 0 不代表没延迟**，这是面试常考的坑。

### Q162. 什么是「惊群」？Nginx 怎么处理？【高】

多个进程/线程同时 `accept()` 同一个监听 socket，一个连接到达时全部被唤醒，只有一个拿到，其余白醒——浪费 CPU。

Nginx 用 **`accept_mutex`（默认 off）+ EPOLLEXCLUSIVE** 缓解，配合 `reuseport`（`listen ... reuseport`）让内核按四元组 hash 分发到不同 worker 的独立 listen socket，彻底避免争抢。

这也是排查「Nginx `sy` 高但 `us` 不高」时要看的点。

### Q163. 负载均衡四层和七层的运维差异是什么？【中】

| 维度 | 四层（LVS/云 SLB） | 七层（Nginx/HAProxy） |
|---|---|---|
| 转发依据 | IP+端口 | URL/Header/Cookie |
| 性能 | 极高（内核态） | 较低（用户态解析） |
| 会话保持 | 源 IP hash | Cookie 插入 |
| TLS | 透传（不解密） | 可终止 |
| 排障 | 看不到 HTTP 内容 | 可看状态码、日志 |

**运维差异最大的一点：四层只保证 TCP 通，业务 5xx 它不知道**；七层能做健康检查、能改 header、能做灰度。

### Q164. 双机热备切换后，怎么保证数据不丢？【高】

- **共享存储**：数据只有一份，天然一致，但存储是单点（需双控）
- **主备复制**：异步一定可能丢最后一段，要能接受 RPO；同步复制延迟高
- **仲裁**：切换前必须确认旧主真的挂了（否则切过去就是双写）
- **切换脚本要幂等**：重复执行不能造成二次破坏
- **切换后立即校验**：数据一致性检查、业务探活、告警恢复通知

**核心认知：高可用解决的是「可用」，不是「不丢数据」，两者要分开设计。**

---

## 十四、日常巡检与故障场景

### Q165. 每天巡检看哪些指标？【中】

固定清单（建议做成脚本/看板）：

1. **CPU**：load 5/15 分钟趋势、`%wa`、`%st`
2. **内存**：`available`、swap 使用、OOM 记录
3. **磁盘**：各分区使用率（>85% 预警）、inode、`await`
4. **网络**：网卡错误/丢包、重传率、连接数、TIME_WAIT
5. **服务**：关键进程存活、端口监听、健康检查接口
6. **日志**：错误日志量、认证失败次数
7. **证书/域名**：到期时间（**这条最容易漏，一到期就是全站事故**）
8. **备份**：昨日备份是否成功、大小是否正常
9. **时间同步**：`chronyc tracking` 是否正常

**巡检的价值不在「看」，在于「有阈值、有告警、有责任人」。**

### Q166. 磁盘使用率突然涨到 90%，怎么快速定位？【中】

```bash
df -h; df -i
du -sh /var/* | sort -h | tail -10
du -sh /var/log/* | sort -h | tail
lsof +L1 | sort -k7 -n | tail          # 已删除未释放
find / -xdev -type f -size +1G -exec ls -lh {} \; 2>/dev/null
```

按「增长速率」判断：`du` 两次间隔 1 分钟对比，涨得快就先止损（清日志/临时文件），再查根因。

**别直接 `rm -rf /var/log/*`**，先确认是不是被进程占用（占用时 `rm` 不释放空间），也别删掉正在写的当前日志。

### Q167. 内存使用率 95%，但服务正常，要处理吗？【中】

先分清构成：

```bash
free -h                    # 看 available 而不是 used
cat /proc/meminfo | grep -E 'MemAvailable|Cached|Slab|SReclaimable'
slabtop -o | head
```

- `buff/cache` 大 → 正常，可回收
- `Slab` 异常大 → 内核对象泄漏（常见于 dentry/inode 缓存、网络 conntrack）
- `available` 已经很低 → 危险，随时 OOM

**真正该告警的是 `MemAvailable` 低于阈值（如 10%）和 swap 换页，而不是「used 95%」。**

### Q168. 服务器被大量连接打到连不上，怎么应急？【高】

1. **确认来源**：`ss -tn state established | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head`
2. **止损**：云安全组/防火墙封 IP 段 → `firewall-cmd --add-rich-rule` 或 `ipset`；Nginx 层限流（`limit_req`）；上层 WAF/CDN 开防护
3. **保护 SSH**：单独放行管理 IP，避免自己也进不去
4. **看资源**：`somaxconn`、`file-max`、`conntrack` 是否打满（`dmesg | grep -i 'nf_conntrack: table full'`）
5. **恢复后复盘**：限流/防爬/扩容/接入 CDN

**这类场景下最容易犯的错：直接 `systemctl restart` 服务，结果瞬间被新连接打满，还丢掉了现场。**

### Q169. 系统启动后某个服务没起来，怎么系统化排查？【中】

```bash
systemctl --failed                       # 所有失败单元
systemctl status xxx -l
journalctl -u xxx -b --no-pager | tail -50
systemctl list-dependencies xxx --reverse
```

按类型判断：

- `failed` 且日志有 `Permission denied` → 权限/SELinux
- `activating (start)` 一直不变 → `Type=` 选错或进程前台不退出
- `not found` → 路径错，`ExecStart` 用的是绝对路径吗
- 依赖问题 → `After=` 只排顺序，不保证依赖存在，要配 `Requires=`

**开机慢/服务起不来时先看 `systemd-analyze blame` 和 `critical-chain`。**

### Q170. 时间跳变导致证书/令牌失效，怎么快速判断？【中】

```bash
date -s 对比实际时间
timedatectl
journalctl | grep -i -E 'time (jump|changed)'
dmesg | grep -i -E 'clocksource|time'
```

表现：TLS 握手报 `certificate is not yet valid`、JWT 全部 401、Kerberos 票据失效、日志时间倒序。

处理：立刻 `chronyc makestep` 强制校时，确认是虚拟机挂起恢复还是 NTP 源问题；**时间回退会导致依赖时间的业务逻辑错乱，要检查是否有重复执行的任务。**

### Q171. 误删了文件还有救吗？【高】

分情况：

- **进程还开着**：`cp /proc/<pid>/fd/<n> /recovered` —— 前提是删之前进程持有句柄
- **ext4**：立刻卸载分区（**停止一切写入**），用 `extundelete` / `testdisk` 恢复；写入越多成功率越低
- **XFS**：没有成熟的删除恢复工具，基本只能靠备份
- **LVM/云盘**：从快照恢复
- **数据库表**：从 binlog 反解（`binlog2sql`）

**铁律：发现误删，第一动作是 `umount` 或 `mount -o ro`，不是继续找工具。** 也别在同一个分区上装恢复软件。

### Q172. 一台机器突然变成只读，怎么处理？【高】

```bash
dmesg -T | grep -i -E 'read-only|I/O error|EXT4-fs error|XFS'
mount | grep ' ro,'
```

按根因处理：

- 文件系统错误 → 卸载后 `fsck -y` / `xfs_repair`
- 磁盘硬件错误 → 换盘、从备份恢复
- 云盘配额/只读挂载策略 → 控制台确认
- 内核把 `remount-ro` 触发（`errors=remount-ro` 是 ext4 默认）

**不能只 `mount -o remount,rw` 就完事**，那是在坏盘上继续写，会把可恢复变成不可恢复。

### Q173. 系统 load 突然飙到 100+，你的 10 分钟应急流程？【高】

1. 保现场：`date; uptime; vmstat 1 5; ps aux --sort=-%cpu | head; dmesg -T | tail` 全部重定向到文件
2. 判断类型：CPU（`us/sy`）、IO（`wa`、`b` 高）、内存（swap）、D 状态
3. 找源头：`pidstat`、`top -H`、`iotop -oPa`
4. 快速止血：重启失控进程（**先抓到栈/日志再重启**）、限流、临时降级
5. 恢复后：`journalctl`、应用日志、变更记录对齐时间点
6. 复盘：根因、影响时长、监控缺口

**「先保现场再动手」是运维和开发排障最大的差别。**

### Q174. `ssh` 连不上，但 ping 通，怎么分层排查？【中】

1. 端口：`nc -vz host 22` —— 通不通
2. 防火墙：`firewall-cmd --list-all` / 云安全组
3. sshd 进程：`systemctl status sshd`、`ss -lntp | grep :22`
4. **`MaxStartups` 打满**：并发未认证连接数到限，新连接直接被拒（`/var/log/secure` 有明显提示）
5. `DenyHosts`/`fail2ban` 把自己的 IP 封了：`fail2ban-client status sshd`
6. `hosts.deny` / `pam` 限制
7. TCP Wrappers（老系统）

**「ping 通但端口不通」时，`nc -vz` 是第一步，`ss -lntp` 是第二步，能过滤掉 80% 的可能。**

### Q175. 文件权限看起来对，但服务还是读不到，还有什么可能？【高】

- **SELinux**：`ls -Z` 看上下文，`ausearch -m avc`
- **父目录缺 `x`**：只有目标文件可读没用，路径上任何一级目录没 `x` 都进不去
- **ACL 拒绝**：`getfacl` 看有没有 `mask` 把权限吃掉了
- **AppArmor**（Ubuntu）：`aa-status`
- **挂载 `noexec`/`nosuid`**：`mount | grep noexec`
- **NFS 的 root_squash**：root 访问被映射成 `nobody`
- **systemd 的 `ProtectSystem=` / `ReadOnlyPaths=`**：unit 里做了沙箱限制

**权限问题永远要「身份 + 路径 + 策略」三层一起看，只看 `ls -l` 是新手做法。**

### Q176. 服务器时钟正常但日志时间不对，为什么？【中】

- 应用/容器**时区**没设：容器默认 UTC，`TZ=Asia/Shanghai` 或挂 `/etc/localtime`
- 日志框架写的是 UTC 时间戳
- `date` 对但 `/etc/localtime` 是错的软链
- 多机日志汇聚后未统一时区

**规范：所有机器和容器统一 `Asia/Shanghai`，日志时间戳带时区偏移（ISO 8601），跨时区团队用 UTC 存储 + 展示时转换。**

### Q177. 怎么排查「服务每隔一小时就抖一下」？【高】

周期性抖动 = **一定有周期性任务**。

```bash
crontab -l; ls -l /etc/cron.*/
systemctl list-timers --all
grep -r 'logrotate\|updatedb' /etc/cron*
```

高频元凶：`logrotate` 大文件压缩、`updatedb`（mlocate）、`yum makecache`、备份任务、`certbot renew`、云厂商监控 agent、JVM 定时 GC 与 `cron` 撞车。

验证方法：**把可疑任务临时停掉观察**，或 `atop -r` 回放那个时间点的进程。

### Q178. 线上机器要不要开 swap、要不要开 `transparent_hugepage`？【高】

- **swap**：数据库和 K8s 节点建议关（或极小）；普通应用机开一点作为兜底。**关键是监控 `si/so`，而不是争论开关。**
- **THP**：`transparent_hugepage` 对某些负载（老版本 Redis、MongoDB、JVM）会造成明显延迟毛刺，建议 `never` 或 `madvise`：

```bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
```

**结论：默认配置不一定适合你的负载，但任何修改都要有压测/观测支撑，别照抄博客。**

---

## 十五、Shell 运维脚本实战

### Q179. 写一个「检查磁盘使用率并告警」的脚本。【中】

```bash
#!/bin/bash
set -euo pipefail
THRESHOLD=85
LOG=/var/log/disk-check.log

df -hP | awk 'NR>1 && $5+0 >= '"$THRESHOLD"' {print $6, $5}' | while read -r mount used; do
  msg="[$(date '+%F %T')] WARN disk ${mount} used ${used}"
  echo "$msg" >> "$LOG"
  # curl -s -X POST "$WEBHOOK" -d "{\"text\":\"$msg\"}"
done
```

要点：

- **`df -P`** 保证输出单行不折行（长设备名会换行，普通 `df` 在脚本里极易解析错）
- 用 `awk` 判断而不是 `grep` 数字
- 阈值从参数/环境变量来，别硬编码
- 告警要能幂等（避免每次都发）

### Q180. 脚本里怎么安全地处理「参数里有空格/特殊字符」？【中】

```bash
# 正确
for f in "$@"; do echo "$f"; done
find . -type f -print0 | xargs -0 rm -f
while IFS= read -r line; do echo "$line"; done < file.txt

# 错误示范
for f in $@; do ... done         # 空格被拆开
find . | xargs rm                # 文件名带空格就删错
ls | while read l; do ...        # 特殊字符
```

原则：**变量一律加双引号 `"$var"`**，遍历用 `"$@"`，管文件名用 `-print0` + `xargs -0`，读文件用 `while IFS= read -r`。

### Q181. `set -e` 有哪些坑？【高】

`set -e` 在以下场景**不生效**：

- `if cmd; then`、`while cmd`、`cmd || true`、`cmd && cmd` 中的命令
- 管道中非最后一个命令（要 `set -o pipefail`）
- 命令替换中的部分场景
- 子 shell 里的 `set -e` 不传递

```bash
set -euo pipefail
trap 'echo "failed at line $LINENO" >&2' ERR
```

**生产脚本不要盲信 `set -e`**：关键步骤显式判断 `if ! cmd; then exit 1; fi` 才最可靠。

### Q182. 怎么写一个「失败可重试」的脚本？【中】

```bash
retry() {
  local n=0 max=3
  until "$@"; do
    n=$((n+1))
    [ "$n" -ge "$max" ] && { echo "give up: $*"; return 1; }
    echo "retry $n: $*" >&2
    sleep $((n * 2))
  done
}

retry curl -fsS -o /dev/null https://api.example.com/health
```

要点：**指数退避**（避免雪崩）、有最大次数、日志记录每次重试、只对幂等操作重试（**不要重试 `rm`/`created` 类操作**）。

### Q183. 怎么用脚本来做日志清理，又不误删？【中】

```bash
# 1. 先 dry-run 输出要删什么
find /var/log/app -name '*.log' -mtime +7 -print

# 2. 确认后加 -delete，且限制类型与目录
find /var/log/app -type f -name '*.log' -mtime +7 -delete

# 3. 不删当前正在写的文件
find /var/log/app -type f -name '*.log' -mtime +7 ! -name 'current.log' -delete
```

安全要点：**只删 `-type f`**（别删目录）、路径写绝对、限制 `-maxdepth`、保留当前日志、先 dry-run 后记录清单，删前 `tar` 备份一次关键日志。

### Q184. 一个批量改配置的脚本，怎么保证不出灾难？【高】

1. **预检**：目标机器清单从哪来、是否可达、当前配置是什么
2. **灰度**：先 1 台，验证后再 10 台，最后全量
3. **备份**：改前 `cp -a file file.bak.$(date +%s)`
4. **幂等**：重复执行结果一致（用 `sed -i` 前先 `grep -q` 判断）
5. **可回滚**：保留 `.bak` 并在脚本里提供 `--rollback`
6. **有 dry-run**：`--dry-run` 只打印不执行

```bash
if grep -q '^max_conn' /etc/app.conf; then
  sed -i 's/^max_conn.*/max_conn = 1000/' /etc/app.conf
else
  echo 'max_conn = 1000' >> /etc/app.conf
fi
```

**批量变更最恐怖的不是改错，是改完不知道改了什么。**

### Q185. `trap` 能做什么？给例子。【中】

```bash
#!/bin/bash
set -euo pipefail
LOCK=/var/lock/mytask.lock
TMP=$(mktemp -d)

cleanup() {
  echo "cleanup at line $LINENO" >&2
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'echo interrupted; exit 130' INT TERM

exec 9>"$LOCK" || exit 1
flock -n 9 || { echo "already running"; exit 1; }
```

用途：**脚本退出/中断时清理临时文件、释放锁、发通知**。`EXIT` 陷阱在脚本因 `set -e` 退出时也会触发，是保证「不留垃圾」的关键。

### Q186. 怎么在脚本里等一个服务真正可用？【中】

```bash
wait_for() {
  local host=$1 port=$2 timeout=${3:-60} i=0
  until nc -z "$host" "$port" 2>/dev/null; do
    i=$((i+1)); [ "$i" -ge "$timeout" ] && return 1; sleep 1
  done
}

wait_for 127.0.0.1 8080 60 && echo ready
```

**只判端口不够**：端口通了但应用还没 ready（配置加载完、依赖连上）的情况很常见，所以健康检查要打业务探针：

```bash
until curl -fsS http://127.0.0.1:8080/health >/dev/null; do sleep 1; done
```

### Q187. 怎么写一个并发执行上千台机器命令的脚本？【高】

```bash
#!/bin/bash
set -euo pipefail
MAX=16
run() {
  local host=$1
  timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=5 "$host" 'uptime' \
    >"/tmp/out/$host.log" 2>&1
  echo "done $host"
}
export -f run
mkdir -p /tmp/out
xargs -P "$MAX" -I{} bash -c 'run {}' < hosts.txt
```

要点：

- **必须有超时**（`timeout` + `ConnectTimeout`），否则一台卡住全卡
- 控制并发（`xargs -P`），别一次打 1000 个连接
- 每台机器输出单独落文件，便于失败重跑
- 生产用 Ansible/pdsh，脚本只用来快速取数

### Q188. 脚本里怎么解析 JSON？【中】

```bash
jq -r '.data[].name' resp.json
jq -r '.items[] | select(.status=="bad") | .id' resp.json
curl -s https://api/x | jq -e '.ok' || echo fail
```

**别用 `grep`/`sed` 解析 JSON**，格式一变（换行、空格、转义）就崩。没装 `jq` 时用 Python：`python3 -c 'import json,sys;print(json.load(sys.stdin)["key"])'`。

### Q189. `awk` 做运维统计的典型套路有哪些？【中】

```bash
awk '{s+=$1} END {print s}' numbers          # 求和
awk '{print $1}' f | sort | uniq -c | sort -rn   # Top N
awk '$9 >= 500 {c++} END {print c+0}' access.log # 计数（+0 防空文件输出空）
awk -F: '$3>=1000 && $3<65534 {print $1}' /etc/passwd  # 普通用户
awk '{a[$1]+=$2} END {for (k in a) print k, a[k]}' f   # 分组累加
awk '!seen[$0]++' file                        # 去重保序（比 sort -u 强）
```

**`awk '!seen[$0]++'` 这个去重保序技巧面试很加分。**

### Q190. 脚本怎么打日志才规范？【中】

```bash
log() {
  local level=$1; shift
  printf '%s [%s] %s\n' "$(date '+%F %T')" "$level" "$*" >&2
}
log INFO "start backup"
log ERROR "disk full"
```

规范：

- 带**时间戳 + 级别 + 内容**
- 日志写 **stderr**（stdout 留给数据输出，便于管道处理）
- 结构化（能 JSON 就 JSON，便于采集）
- 关键步骤记录耗时和结果
- **不要用 `echo` 到处打**，统一函数便于以后加采集

### Q191. 怎么调试一个「看起来正确但结果不对」的 shell 脚本？【中】

```bash
bash -n script.sh            # 只做语法检查
bash -x script.sh            # 打印每条命令（带 set -x 位置更清晰）
set -o xtrace                # 脚本内开启
PS4='+${LINENO}: '           # 显示行号
shellcheck script.sh         # 静态检查，能发现引号/变量/陷阱问题
```

**`shellcheck` 是投入产出比最高的手段**，能自动发现 `$var` 没加引号、`for f in $(ls)`、`cd` 失败没判断等经典 bug。

### Q192. 怎么让脚本支持 `--dry-run` 和 `-h`？【中】

```bash
usage() { echo "用法: $0 [--dry-run] [--help] [--target HOST]"; }

DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --target) TARGET="${2:?缺少值}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 2 ;;
  esac
done

run() { [ "$DRY" -eq 1 ] && { echo "[dry] $*"; return 0; }; "$@"; }
```

要点：未知参数报错退出（**静默忽略参数是事故之源**）、`--dry-run` 在唯一出口处统一处理、`${2:?...}` 检查缺值。

### Q193. 脚本里 `cd` 失败会怎样？怎么防？【初】

`cd /nonexistent || exit 1` —— 否则 `cd` 失败后后续命令在**当前目录**继续跑，`rm -rf *` 就删错地方了。

```bash
cd /backup && tar czf ... ||
```

更严谨：

```bash
set -euo pipefail
cd /backup
```

`set -e` 会让 `cd` 失败直接退出。**定时任务里的脚本必须这么写**，因为 cron 的 `HOME` 是用户家目录，相对路径全都会指错。

### Q194. 怎么把散落的一堆手工命令沉淀成运维脚本？【中】

流程：

1. **记录**：遇到故障时把命令按顺序贴到一个临时文件（`history` 也行）
2. **抽象**：找出哪些是变量（主机、路径、阈值），抽成参数
3. **加固**：`set -euo pipefail`、`trap cleanup EXIT`、`flock` 防重叠、日志、超时
4. **固化**：放进 git 仓库（`ops-scripts/`），写 README 说明输入输出
5. **复用**：能进 Ansible/Cron/systemd timer 的就别再手工跑
6. **验证**：在测试机跑一遍，`--dry-run` 一遍

**「每次故障都加一条检查」是运维能力复利增长的唯一方式。**

---

## 十六、Linux 运维速记卡

### 端口与协议速查

| 服务 | 端口 |
|---|---|
| SSH / Telnet | 22 / 23（禁） |
| HTTP / HTTPS | 80 / 443 |
| DNS | 53（UDP+TCP） |
| NTP | 123/udp |
| SMTP / SMTPs | 25 / 587 / 465 |
| MySQL / PostgreSQL / Oracle | 3306 / 5432 / 1521 |
| Redis / Memcached | 6379 / 11211 |
| MongoDB / Elasticsearch | 27017 / 9200,9300 |
| Kafka / ZooKeeper / RabbitMQ | 9092 / 2181 / 5672,15672 |
| Prometheus / Grafana / Alertmanager | 9090 / 3000 / 9093 |
| etcd / K8s API | 2379,2380 / 6443 |

### 文件与目录速查

| 路径 | 用途 |
|---|---|
| `/etc/passwd` `/etc/shadow` `/etc/group` | 账号与口令 |
| `/etc/sudoers` `/etc/sudoers.d/` | 提权授权 |
| `/etc/fstab` | 开机挂载（写错就进 emergency） |
| `/etc/sysctl.conf` `/etc/sysctl.d/*.conf` | 内核参数 |
| `/etc/security/limits.conf` | 资源限制（PAM） |
| `/etc/systemd/system/*.service` | 自建服务单元 |
| `/etc/logrotate.d/` | 日志轮转 |
| `/etc/cron.d/` `/var/spool/cron/` | 定时任务 |
| `/etc/ssh/sshd_config` | SSH 服务配置 |
| `/etc/resolv.conf` `/etc/nsswitch.conf` `/etc/hosts` | 名字解析三件套 |
| `/etc/firewalld/` `/etc/sysconfig/iptables` | 防火墙 |
| `/var/log/{messages,secure,cron,audit/audit.log}` | 主要日志 |
| `/proc/<pid>/{status,limits,fd,environ,stack}` | 进程现场 |
| `/proc/pressure/{cpu,io,memory}` | PSI 压力 |
| `/sys/fs/cgroup/` | cgroup v2 限制 |

### 排查命令链速查

| 症状 | 命令链 |
|---|---|
| 系统慢 | `uptime` → `vmstat 1` → `iostat -x 1` → `pidstat -u -d 1` |
| 磁盘满 | `df -h` → `df -i` → `du -sh /*` → `lsof +L1` |
| IO 高 | `iostat -x 1` → `iotop -oPa` → `cat /proc/pressure/io` |
| 内存高 | `free -h` → `cat /proc/meminfo` → `ps aux --sort=-rss` → `journalctl -k \| grep -i oom` |
| CPU 高 | `top -H` → `printf %x <tid>` → `jstack` / `perf top` |
| 端口不通 | `ss -lntp` → `nc -vz host port` → `iptables -L -n` |
| 网络慢 | `ss -ti` → `mtr -rwz` → `ping -M do -s 1472` → `tcpdump` |
| 服务起不来 | `systemctl status` → `journalctl -u` → `systemctl cat` |
| 权限不对 | `ls -l` → `namei -l path` → `getfacl` → `ls -Z` → `ausearch -m avc` |
| 进程杀不掉 | `ps -o stat,wchan` → `cat /proc/<pid>/stack` → 查 NFS/存储 |

### 必记数字（Linux 向）

- 页面大小 **4 KB**；`load` 要除以 `nproc`
- MTU **1500**（`ping -s 1472 -M do` 验证）
- 默认 fd **1024**，`somaxconn` 新内核 **4096**
- TIME_WAIT = **2MSL ≈ 60s**
- `pid_max` 新内核 **4194304**
- TCP SYN 重传退避 **1s / 3s / 7s**
- DNS 超时 **5s × 2 次重试**
- `vm.swappiness` 默认 **60**（数据库机建议 1–10）
- ext4 默认 `errors=remount-ro`，XFS 不可缩容
- MBR 上限 **2 TB / 4 主分区**

### 一句话快答

| 问题 | 一句话 |
|---|---|
| `D` 状态为啥杀不掉 | 内核态不可中断等待，信号打不进去 |
| `df` 满 `du` 小 | 文件被删但进程仍持有句柄，`lsof +L1` |
| inode 满 | `df -i`，小文件海量，删或调 `mkfs` 密度 |
| 服务不读 `limits.conf` | systemd 不走 PAM，要写 `LimitNOFILE=` |
| `umask` 是什么 | 建文件时从默认权限里减掉的位 |
| 目录 `x` 位 | 能否进入/穿过目录，只有 `r` 不能访问文件 |
| `su -` vs `sudo -i` | 前者要目标用户口令、加载其环境；后者要自己口令、走 sudoers |
| 机器只读 | 内核检测文件系统错误后保护性 remount-ro，先查 `dmesg` |
| 换盘后起不来 | initramfs 缺驱动，重建 `dracut -f` |
| `rp_filter` | 反向路径过滤，多网卡/策略路由场景会误丢包 |
| `tcp_tw_recycle` | 已从内核移除，NAT 下会大面积误杀 |
| 备份 3-2-1 | 3 份、2 种介质、1 份异地 |
| 高可用 vs 备份 | 前者保可用，后者保数据，别互相替代 |
| 巡检先看什么 | 磁盘/内存可用量、OOM、证书到期、备份成功 |

### 面试反向提问（运维向加分项）

- 目前硬件/云资源规模多少，自动化覆盖到什么程度？
- 变更流程是工单制还是自助发布？有没有灰度与回滚演练？
- 监控告警的噪声比如何，有没有明确的 SLO/错误预算？
- 事故复盘的产出能落到标准动作和自动化检查吗？
- 团队对「非 root 化」「最小权限」「密钥管理」的实践到什么阶段？
