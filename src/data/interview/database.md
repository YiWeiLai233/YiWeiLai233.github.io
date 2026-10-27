# 数据库运维面试题库 · 全面版

> 难度标记：`【初】` 必答 · `【中】` 分水岭 · `【高】` 加分项
> 范围：这份题库只打数据库运维那一摊——选型与架构、MySQL 参数索引事务锁复制备份、性能诊断，PostgreSQL / Redis / MongoDB / Elasticsearch 各自的运维要点，再加上账号安全、容量规划、迁移变更。答案按 **是什么 → 为什么 → 怎么做 → 踩过什么坑** 组织，能直接背成面试口语。

---

## 目录

1. 数据库选型与架构设计
2. MySQL 安装、配置与参数
3. MySQL 索引与执行计划
4. MySQL 事务、锁与隔离级别
5. MySQL 主从复制与高可用
6. MySQL 备份与恢复
7. MySQL 性能诊断与优化
8. PostgreSQL 运维要点
9. Redis 持久化与高可用
10. Redis 内存与性能治理
11. MongoDB 运维要点
12. Elasticsearch 运维要点
13. 数据库账号、权限与安全
14. 容量规划与慢查询治理
15. 数据迁移与变更发布
16. 数据库运维速记卡

---

## 一、数据库选型与架构设计

### Q1. 关系型数据库和 NoSQL 该怎么选？【初】

先问 **一致性要求和查询模式**，再谈产品。

| 类型 | 代表 | 适合 | 不适合 |
|---|---|---|---|
| 关系型 | MySQL / PostgreSQL | 强事务、多表关联、结构稳定 | 海量写入、灵活 schema |
| 键值缓存 | Redis | 缓存、计数、排行榜、锁 | 当唯一数据源 |
| 文档 | MongoDB | 结构不定的内容、快速迭代 | 强一致账务、跨文档事务 |
| 搜索 | Elasticsearch | 全文检索、多维聚合 | 当主库（无事务、无真更新） |
| 分析 | ClickHouse / Doris | 大宽表聚合、报表 | 高并发点查、频繁更新 |

**判断顺序**：数据量与增长 → 是否需要事务 → 读写比与延迟 SLA → 团队会不会运维。最后一条最容易被忽略，选了一堆没人会用的组件等于给自己埋雷。

---

### Q2. 主从读写分离什么时候必须做？【中】

出现下面任一信号就该做：

- 读 SQL 占比 **> 80%**，主库 CPU 长期 **> 70%**
- 后台报表、跑批任务把主库拖慢，影响线上
- 单机 QPS 余量不足 50%，且已经优化过索引
- 需要一份能随时做备份/DDL 演练的副本

落地形态：一主多从 + 应用内路由或中间件（ProxySQL / ShardingSphere）。事务内的读、写后立即读必须走主库。

坑：**主从延迟 1 秒也足够让「下单后立刻查订单」查不到**，这类问题上线后才暴露，属于设计阶段就该拆开的读路径。

---

### Q3. 分库分表的时机怎么判断？【中】

先穷尽单机优化：索引、慢 SQL、归档冷数据、加内存、读写分离、分区表。还是不够才考虑拆分。

真正的拆分信号：

- 单表 **> 2000 万行** 或 **> 100 GB**，且写入还在涨
- DDL 窗口已经不可控（改一个字段要停服几小时）
- 单实例 IOPS、连接数打满且无法再扩

早拆的代价：跨分片 join、分布式事务、跨页分页、全局唯一 ID、在线扩容全部变难，运维成本 ×N。

分片键三原则：**高基数、分布均匀、查询必带**。按 `user_id` 分片后运营按时间查全表就只能广播，这是最常见的翻车点。

---

### Q4. 单机 MySQL 的容量上限怎么判断？【中】

分四个维度看，不要只盯磁盘：

| 维度 | 经验上限 | 判断依据 |
|---|---|---|
| 数据量 | 单实例 500 GB ~ 1 TB（SSD） | 备份/恢复/DDL 窗口撑不住 |
| 内存 | buffer pool 装得下热数据 | 命中率 < 95% 就是内存不够 |
| 连接数 | 1000 ~ 3000 | 再往上线程切换成本陡增 |
| 写入 | 受 redo、双写、刷盘限制 | `Innodb_data_pending_fsyncs` 长期 > 0 |

验证手段是压测 + 看现场：`Innodb_buffer_pool_reads`（物理读）与 `Threads_running`。**`Threads_running` 长期大于 CPU 核数**，说明已经在排队，此时加配置比调 SQL 更有效。

---

### Q5. OLTP 和 OLAP 为什么要分离？【中】

混跑的危害是连锁的：

- 大查询把热数据挤出 buffer pool，线上命中率暴跌
- 长事务/大排序让 undo 膨胀、临时表写满磁盘
- 统计 SQL 持有大量行锁，阻塞业务写入

三种分离力度：

1. **轻量**：只读从库跑报表，加 `max_execution_time` 提示兜底
2. **中量**：binlog 订阅同步到 ClickHouse / Doris，报表查新库
3. **重量**：独立数仓 + 调度，T+1 或准实时

坑：报表直接连主库是最典型的夜间事故——跑批一开，第二天早高峰全线超时。

---

### Q6. 主从复制、双主、多活三者到底差在哪？【高】

| 形态 | 写入点 | 故障切换 | 代价 |
|---|---|---|---|
| 主从 | 单点写 | 需要外部组件（MHA / Orchestrator / MGR） | 切换有窗口，可能丢最后一段 |
| 双主 | 两个 | 可互切 | 自增步长或 GTID 防冲突，**脑裂风险最高** |
| 多活 | 多地写入 | 就近写就近读 | 冲突解决 + 数据归属 + 延迟，成本最高 |

- 双主一般只做**切换过渡态**，长期双写几乎必冲突
- 多活的冲突解决通常是「按用户归属分片写」或「最后写入胜」，后者会丢更新
- 一句话：**RPO = 0 的多活没有免费方案**，要么多数派提交（延迟），要么业务容忍丢数据

追问常考：MGR 单主模式下其实还是「一写多读」，多主模式才允许多点写。

---

### Q7. 选型时真正该问的问题有哪些？【高】

技术参数之外的六问，答不上来就别定方案：

1. **三年后数据量多大**？增长曲线决定要不要一开始就分片
2. **一致性要求到哪一级**？能否接受最终一致，直接决定能不能用缓存/异步
3. **峰值 QPS、读写比、P99 延迟 SLA** 是多少？没有 SLA 就无法验收
4. **谁来运维**？团队没人会调 `autovacuum` 就别选 PG
5. **备份恢复演练做过吗**？没演练过的备份等于没有备份
6. **版本生命周期**：5.7 已 EOL、ES 6.x 停更，选个马上要升级的版本等于埋技术债

答题要点：面试官问选型，八成想听你怎么**排除**一个方案，而不是背产品特性。

---

## 二、MySQL 安装、配置与参数

### Q8. MySQL 5.7 和 8.0 该怎么选？【初】

新项目一律 **8.0**，理由不是新，而是 5.7 已 EOL 没有安全补丁。

8.0 的关键变化：

- 默认字符集 `utf8mb4` + `utf8mb4_0900_ai_ci`，不再有 `utf8` 三字节坑
- **原子 DDL**：DDL 有完整事务语义，不再出现「表改了但数据字典没改」
- 默认 `caching_sha2_password`，老客户端/驱动连不上是第一大坑
- 支持角色（`CREATE ROLE`）、降序索引、通用表表达式（CTE）、窗口函数
- 数据字典改为 InnoDB 表，不再有 `.frm`

**迁移前必查**：驱动版本、`GROUP BY` 不再隐式排序、保留字新增（`RANK`、`GROUPS`、`LEAD`）。

---

### Q9. `my.cnf` 里哪些参数最该先调？【中】

```ini
[mysqld]
innodb_buffer_pool_size         = 物理内存的 60%~70%
innodb_buffer_pool_instances    = 8                  # buffer pool > 8G 才分实例
innodb_log_file_size            = 1G~2G              # 5.7 改大需重新初始化/8.0 可直接改
innodb_flush_log_at_trx_commit  = 1                  # 要 RPO=0 就别动
sync_binlog                     = 1                  # 双 1 才是真持久
max_connections                 = 1000               # 按并发峰值 ×1.5，不是越大越好
binlog_format                   = ROW
binlog_expire_logs_seconds      = 604800             # 8.0 写法，5.7 是 expire_logs_days
```

顺序：**buffer pool → 日志大小 → 连接数 → binlog**。改 buffer pool 是唯一能立刻见效的，其余是防止尖刺。

---

### Q10. `innodb_buffer_pool_size` 设多大？命中率怎么看？【中】

经验值 **物理内存的 60%~70%**（专用 DB 机），留出连接线程、临时表、OS page cache 的空间。

```sql
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read%';
```

- `Innodb_buffer_pool_read_requests`：逻辑读
- `Innodb_buffer_pool_reads`：穿透到磁盘的物理读
- 命中率 = `1 - reads / read_requests`，**稳态应 > 99%**

坑：buffer pool 超过 **8 GB** 后要开多个 instance（每个 1 GB 左右）降低 mutex 争用；另外它是**慢慢预热**的，重启后命中率要几十分钟才恢复，重要实例可开 `innodb_buffer_pool_dump_at_shutdown` + `load_at_startup` 做预热。

---

### Q11. `binlog_format` 三种格式怎么选？【中】

| 格式 | 内容 | 优点 | 缺点 |
|---|---|---|---|
| STATEMENT | SQL 原文 | 日志小 | 函数、`NOW()`、自增不可靠 |
| ROW | 行变更前后镜像 | 最安全、可做数据恢复 | 日志大，批量更新膨胀 |
| MIXED | 自动切换 | 折中 | 排查时不知道实际是哪种 |

**生产统一 ROW**。理由：主从不一致风险最低，且 binlog 能直接当「误删数据找回」的原料（`binlog2sql` / `my2sql` 反解）。

坑：ROW 格式下一次 `UPDATE` 十万行会产生几百 MB binlog，需要评估磁盘和网络带宽。

---

### Q12. 字符集和排序规则怎么设才不出乱码？【中】

- 库、表、连接**三段全用 `utf8mb4`**，排序规则 8.0 用 `utf8mb4_0900_ai_ci`
- 5.7 及老库统一 `utf8mb4_general_ci`，**不要混用 `_bin` 和 `_ci`**
- 连接串必须显式指定：`charset=utf8mb4`

```sql
SHOW VARIABLES LIKE 'character_set%';   -- 看 client / connection / results 是否都是 utf8mb4
```

坑：`latin1` 库里的中文是「假乱码」——数据本身按 latin1 存了 UTF-8 字节，转码要用 `CONVERT(BINARY CONVERT(col USING latin1) USING utf8mb4)`，直接 `ALTER` 会二次损坏。

排序规则不一致还会导致 **JOIN 无法走索引**（`Illegal mix of collations`），这是隐蔽的性能杀手。

---

### Q13. 初始化安装后必须做哪些安全加固？【中】

```bash
mysqld --initialize --datadir=/data/mysql    # 生成临时 root 口令在 error log
mysql_secure_installation                    # 删匿名用户、禁远程 root、删 test 库
```

之后手工补四条：

1. `root@'%'` 必须删掉，只留 `root@localhost`
2. 业务账号按库授权，禁止 `GRANT ALL ON *.*`
3. `bind-address = 127.0.0.1` 或内网 IP，别监听 0.0.0.0
4. 开慢查询日志，`log_error_verbosity=2` 保留审计线索

必查尾项：`SELECT user,host FROM mysql.user;` 一行一行看，比任何扫描器都可靠。

---

### Q14. 改了参数到底要不要重启？【高】

分三类，答错就是事故：

| 类型 | 例子 | 生效方式 |
|---|---|---|
| 动态全局 | `max_connections`、`long_query_time`、`innodb_buffer_pool_size`（8.0 可在线） | `SET GLOBAL` 立即生效，但**重启后丢失** |
| 静态 | `innodb_log_file_size`（5.7）、`lower_case_table_names`、`datadir` | 改配置 + 重启 |
| 需重建 | `innodb_page_size`、`character_set_server`（已存在库的） | 初始化参数，改不了 |

铁律：**`SET GLOBAL` 之后一定要同步写回 `my.cnf`**，否则下次重启全部回退，这个坑每年都有人踩。

坑：`lower_case_table_names` 只能在初始化时定，Linux 上改成 1 会导致已有大写表名全部找不到。

---

## 三、MySQL 索引与执行计划

### Q15. 为什么 InnoDB 用 B+ 树而不用 B 树或哈希？【初】

三点：

- **B+ 树只有叶子存数据**，非叶子只存键，同样磁盘页能放更多键 → 树更矮，3~4 层就能撑起千万级
- **叶子节点用双向链表串起来**，范围查询、`ORDER BY`、`BETWEEN` 直接顺序扫，不用回根
- B 树每个节点都带数据，页内键少、树更高，且范围扫描要在层间反复跳

哈希索引只支持等值查询，`InnoDB` 只能用自适应哈希（AHI）内部加速；Memory 引擎的哈希索引范围查询直接退化成全表。

一句话：**B+ 树是「磁盘页 + 范围查询」双重约束下的最优解**。

---

### Q16. 聚簇索引和二级索引有什么区别？回表是什么？【初】

- **聚簇索引**：主键索引，叶子节点直接存整行，一张表只有一棵
- **二级索引**：叶子存的是「索引列 + 主键值」，不是行

查二级索引拿到主键后，再去聚簇索引取整行 —— 这就是**回表**。

```sql
SELECT * FROM orders WHERE user_id = 100;   -- user_id 有索引，但要 SELECT * → 回表
```

代价：一次查询 1 次二级索引 IO + N 次回表 IO。所以 **`SELECT *` 在高频查询里是要被 review 掉的**。

坑：没有显式主键时 InnoDB 用隐藏的 6 字节 `ROW_ID`，等于把聚簇索引交给系统，二级索引会更大更慢；**主键必须显式定义，且尽量短、递增**。

---

### Q17. 覆盖索引怎么用？为什么它能提升几倍性能？【中】

查询涉及的列全部在索引里，不用回表，这就是覆盖索引。

```sql
-- 索引 (user_id, created_at, amount)
SELECT created_at, amount FROM orders WHERE user_id = 100 ORDER BY created_at DESC;
```

`EXPLAIN` 的 `Extra` 出现 **`Using index`** 即命中覆盖索引。

收益：省掉回表随机 IO，几十万行的报表从分钟级降到秒级。代价是索引变宽、写放大。

坑：`SELECT *` 一定破覆盖；`ORDER BY` 的列不在索引里时，即使覆盖了也要 filesort。

---

### Q18. 最左前缀原则是什么？哪些写法会让索引失效？【中】

联合索引 `(a, b, c)` 相当于 `(a)`、`(a,b)`、`(a,b,c)` 三个索引，**必须从最左列开始连续匹配**。

常见失效场景：

| 写法 | 原因 |
|---|---|
| `WHERE b = 1` | 跳过了最左列 a |
| `WHERE a LIKE '%x'` | 前导模糊无法定位 |
| `WHERE a + 1 = 5` / `DATE(a) = '...'` | 列上做运算/函数 |
| `WHERE a = 1 OR d = 2` | OR 两边有一边无索引 |
| 隐式类型转换 `WHERE phone = 13800000000` | varchar 列传数字，索引列被转成数字 |
| 排序方向混用 `ORDER BY a ASC, b DESC`（8.0 前） | 无法用索引排序 |

**范围查询会截断后续列**：`WHERE a=1 AND b>2 AND c=3` 里 c 用不上索引，只能靠索引下推过滤。

---

### Q19. 联合索引的列顺序怎么定？【高】

三条排序原则：

1. **等值在前，范围在后**：`WHERE a=? AND b>?` 就建 `(a, b)`
2. **区分度高的在前**（等值列之间），但别教条——`(status, user_id)` 里 status 只有 5 个值，若查询几乎都带 status，把它放前面反而能少扫
3. **考虑复用**：`(a,b,c)` 能顶 `(a)` 和 `(a,b)`，别再单独建 `(a)`

还要照顾排序：`WHERE a=? ORDER BY b` 用 `(a, b)` 可以直接免排序。

坑：把区分度极高的列放最后，范围查询一出现就整段失效；把 `status` 单独建索引几乎没有收益，它更适合做联合索引的前缀或干脆不建。

---

### Q20. `EXPLAIN` 每一列到底怎么读？【中】

| 列 | 关注点 |
|---|---|
| `type` | 从好到坏：`system` > `const` > `eq_ref` > `ref` > `range` > `index` > **`ALL`（全表）** |
| `key` | 实际用的索引；期望有值却为 `NULL` 就是失效 |
| `key_len` | 用了索引的前几列，可反推是否用全了联合索引 |
| `rows` | 预估扫描行数，乘 `filtered` 才是最终行数 |
| `Extra` | `Using index`（覆盖）好；`Using filesort`、`Using temporary` 要警惕；`Using where` 表示回表后再过滤 |

三个最该看的信号：**`type=ALL`、`rows` 远大于返回行数、`Extra` 里出现 `Using temporary; Using filesort`**。

注意 `EXPLAIN` 是**估算**，行数偏差大时看 `EXPLAIN ANALYZE`（8.0.18+）拿真实耗时。

---

### Q21. `EXPLAIN ANALYZE` 和 optimizer trace 分别什么时候用？【高】

- **`EXPLAIN ANALYZE`**：真跑一遍，给每个算子的实际行数和耗时（8.0.18+）。用它区分「优化器选错了索引」还是「索引本身不够」
- **`optimizer trace`**：看优化器**为什么**这么选——候选索引、每个 index 的估算成本、被 rule-based 优化砍掉的方案

```sql
SET optimizer_trace='enabled=on';
SELECT * FROM orders WHERE user_id=100 AND status=1;
SELECT TRACE FROM information_schema.OPTIMIZER_TRACE\G
SET optimizer_trace='enabled=off';
```

`rows_estimation` 里能看到各索引的 `rows` 与 `cost`，如果某索引成本更低却没被选，通常是**统计信息过期**（`ANALYZE TABLE`）或 `rows` 估算被采样误差带偏。

提醒：trace 输出极大，**只在单条 SQL 上开，用完立刻关**，否则内存会被吃满。

---

## 四、MySQL 事务、锁与隔离级别

### Q22. ACID 分别靠什么实现？两阶段提交解决什么问题？【初】

| 特性 | 实现手段 |
|---|---|
| 原子性 A | undo log（回滚） |
| 一致性 C | 约束 + 由 A、I、D 共同保证 |
| 隔离性 I | 锁 + MVCC + Read View |
| 持久性 D | redo log + 双写缓冲 + `sync_binlog`/`flush_log_at_trx_commit` |

**两阶段提交**协调 redo log 与 binlog：先写 redo 标记 `prepare`，再写 binlog，最后 redo 标记 `commit`。崩溃恢复时若 redo 里是 `prepare` 而 binlog 完整就提交，不完整就回滚。

没有 2PC，主库崩溃会出现「redo 有、binlog 没有」——主库数据在，从库/备份恢复后数据丢了，这是主从不一致的经典来源。

---

### Q23. 四种隔离级别分别解决什么问题？幻读到底解决了没？【中】

| 级别 | 脏读 | 不可重复读 | 幻读 |
|---|---|---|---|
| READ UNCOMMITTED | 会 | 会 | 会 |
| READ COMMITTED | 不会 | 会 | 会 |
| REPEATABLE READ（默认） | 不会 | 不会 | 快照读不会，当前读仍可能 |
| SERIALIZABLE | 不会 | 不会 | 不会 |

关键澄清：**InnoDB 的 RR 在「快照读」下靠 MVCC 避免了幻读，但「当前读」仍会幻读**，需要 `SELECT ... FOR UPDATE` 加间隙锁来防。

RC 与 RR 的差别只在 Read View 生成时机：RC 每条语句新建快照，RR 事务内复用第一次的快照。这也是为什么 RC 下 undo 更容易被清理、长事务危害在 RR 下更大。

---

### Q24. MVCC 的版本链和 Read View 是怎么工作的？【中】

每行有隐藏列：`DB_TRX_ID`（最后修改的事务 ID）、`DB_ROLL_PTR`（指向 undo 版本链）。

`Read View` 四个要素：`m_ids`（活跃事务列表）、`min_trx_id`、`max_trx_id`、`creator_trx_id`。

判断可见性的规则：

1. `trx_id < min_trx_id`：已提交，可见
2. `trx_id >= max_trx_id`：快照后才开的事务，不可见
3. `trx_id` 在 `m_ids` 里：未提交，不可见
4. 否则可见；不可见就沿 `ROLL_PTR` 往上找更老的版本

坑：**长事务导致 undo 版本链无法清理**，`SHOW ENGINE INNODB STATUS` 里 `History list length` 持续增长就是信号，最终会撑爆 undo 表空间。

---

### Q25. 间隙锁和临键锁是什么？什么时候会加？【高】

- **记录锁**：锁住索引上的一条记录
- **间隙锁（Gap）**：锁住两条记录之间的空隙，**只防插入，不防读**
- **临键锁（Next-Key）**：记录 + 前面的间隙，左开右闭 `(a, b]`，RR 下的默认锁单位

触发场景：RR 级别下对**非唯一索引**做等值/范围查询并加锁，或对唯一索引范围查询。

```sql
-- 索引 idx_age 有 10、20、30
SELECT * FROM t WHERE age = 20 FOR UPDATE;
-- 会锁 (10,20] 和 (20,30) 的间隙，插 age=15 会被阻塞
```

坑：间隙锁之间**互相不冲突**，但都与插入意向锁冲突；一旦锁范围过大，很容易出现「两个人查不同行却互相锁死」。

RC 级别下间隙锁基本关闭（除唯一性检查），所以很多互联网公司把隔离级别调成 RC 就是为了减少锁冲突。

---

### Q26. 死锁怎么排查？怎么从设计上规避？【中】

排查三板斧：

```sql
SHOW ENGINE INNODB STATUS\G     -- LATEST DETECTED DEADLOCK 段有完整的两条 SQL 和锁信息
SELECT * FROM performance_schema.data_locks;      -- 8.0
SELECT * FROM sys.innodb_lock_waits;              -- 阻塞关系
```

高发场景：**两个事务以相反顺序更新同一批行**（先 A 后 B vs 先 B 后 A）。

规避手段：

1. 固定加锁顺序（按主键排序后批量更新）
2. 缩短事务，别在事务里做 RPC / 发消息 / 等锁
3. 批量更新拆小批，控制单次锁范围
4. 尽量走主键或唯一索引，避免大范围间隙锁

`innodb_deadlock_detect=ON` 时 InnoDB 会主动检测并回滚代价小的事务，**应用层必须有重试逻辑**，否则业务直接报错。

---

### Q27. 长事务有哪些危害？怎么发现？【中】

危害：

- undo 链无限延长，**purge 线程被卡住**，undo 表空间暴涨
- 持有锁时间长，`metadata lock` 会让后续 DDL 全部排队，进而阻塞所有查询
- 主从延迟中被复制的长事务放大
- 崩溃恢复时间变长

发现方式：

```sql
SELECT trx_id, trx_started, TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS sec,
       trx_mysql_thread_id, trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started LIMIT 10;
```

`trx_state='RUNNING'` 且 `sec` 超过 60 秒，基本可以判定异常。强制手段是 `KILL` 线程，但**要先确认它是只读还是已在写**，杀掉正在写的大事务会触发长时间回滚。

---

### Q28. 大事务怎么拆？【高】

按「一次处理多少行」拆，不要按时间拆。

```sql
-- 反例：一次删 500 万行
DELETE FROM logs WHERE created_at < '2025-01-01';

-- 正例：分批 + 主键游标 + 每批 sleep
DELETE FROM logs WHERE created_at < '2025-01-01' ORDER BY id LIMIT 2000;
```

拆分要点：

1. 每批 `1000~5000` 行，批间 `SELECT SLEEP(0.1)` 让主从跟上
2. 循环用**主键游标**而不是 `LIMIT offset`，避免越删越慢
3. 大批量删除优先考虑 **`pt-archiver`** 或按分区 `DROP PARTITION`
4. 应用侧避免「一个事务里循环插入十万行」，改成多事务批提交

坑：拆小后总耗时更长，但对线上影响从「卡死」变成「可接受」。**同时要监控主从延迟**，批间 sleep 就是为它准备的。

---

## 五、MySQL 主从复制与高可用

### Q29. 主从复制的三个线程各干什么？【初】

- **主库 dump 线程**：读 binlog 发给从库
- **从库 IO 线程**：收 binlog 写进 relay log
- **从库 SQL 线程**：回放 relay log

```sql
SHOW SLAVE STATUS\G
-- Slave_IO_Running / Slave_SQL_Running 必须都是 Yes
-- Seconds_Behind_Master 是回放延迟的粗略估计
```

两个 `Yes` 缺一个就说明复制断了：IO 线程断是**网络/认证/binlog 被删**，SQL 线程断是**回放报错**（主键冲突、表不存在、字符集问题），两者排查方向完全不同。

---

### Q30. GTID 相比传统复制好在哪？【中】

传统复制靠 `binlog_file + position`，机器一换、日志一清就找不到位点。

GTID 给每个事务一个全局唯一编号 `server_uuid:事务号`：

```ini
gtid_mode                        = ON
enforce_gtid_consistency         = ON
```

好处：

1. 切换后从库自动找位点，不用人工算 position
2. 能直接看出主从是否**已经包含某事务**（`WAIT_FOR_EXECUTED_GTID_SET`）
3. 多级复制、级联切换不会重复/漏执行

坑：`enforce_gtid_consistency=ON` 会禁掉 `CREATE TABLE ... SELECT`、临时表与事务混用等写法，老应用升级前必须查一遍。

---

### Q31. 半同步复制和增强半同步有什么区别？【中】

- **半同步（老实现）**：主库提交并返回客户端后，等至少一个从库 ACK；从库宕机时主库已确认的事务可能丢失
- **增强半同步（`AFTER_SYNC`）**：主库写完 binlog 后**先等 ACK 再返回客户端**，保证客户端收到「成功」时数据至少在两个节点

```sql
SET GLOBAL rpl_semi_sync_master_enabled = ON;
SET GLOBAL rpl_semi_sync_master_timeout = 1000;   -- ms，超时退化为异步
```

关键权衡：**`rpl_semi_sync_master_timeout` 到了就自动降级为异步**，这是可用性与一致性的取舍开关。设太小等于半同步形同虚设，设太大则从库抖动直接拖垮主库写入。

---

### Q32. 复制延迟的原因有哪些？怎么治理？【中】

按发生频率排：

1. **大事务/大表 DDL**：一个事务回放几分钟，延迟瞬间冲到几千秒 → 拆小事务
2. **从库 SQL 线程单线程瓶颈**：主库并发写，从库串行回放 → 开并行复制
3. **从库配置弱于主库**：CPU/IO 跟不上
4. **无主键表**：ROW 格式下每行都要全表扫描定位 → 必须补主键
5. **从库上还有大查询**：争抢资源

治理顺序：**先看是不是大事务，再看并行复制，最后才考虑换硬件**。

监控口径：`Seconds_Behind_Master` 在从库 SQL 线程空闲时会显示 0 或 NULL，**不能只看它**，更可靠的是对比 `Retrieved_Gtid_Set` 与 `Executed_Gtid_Set` 的差集。

---

### Q33. 主从切换有哪些方案？MHA、MGR、Orchestrator 怎么选？【高】

| 方案 | 原理 | 优点 | 缺点 |
|---|---|---|---|
| MHA | 外部 manager，选最接近主库的从库提升 | 成熟、切换快（10~30s） | 已停止维护，依赖 SSH |
| Orchestrator | 拓扑管理 + 自动故障转移 | 拓扑可视化、支持复杂级联 | 需配合 VIP/Proxy 做流量切换 |
| MGR | Paxos 多数派，组内自动选主 | 内置、RPO=0（单主模式） | 对网络延迟敏感，写性能有损耗 |
| 云托管 | 厂商控制台 | 省心 | 切换逻辑黑盒 |

无论哪种，**切换本身只完成一半**，另一半是流量切换（VIP 漂移 / DNS / ProxySQL 改后端）和**应用重连**。切换后必须核对：新主库的 GTID 是否包含旧主库所有已提交事务。

---

### Q34. 双主为什么会脑裂？怎么防？【高】

脑裂 = 两个节点都认为自己是主库，同时接受写入 → 数据分叉，事后无法简单合并。

诱因：网络分区（心跳断但两个节点都活着）、切换脚本误判、人为误操作。

防护三层：

1. **仲裁**：MGR 的多数派、哨兵的 quorum，单点无法自行提升
2. **fencing**：切换前先确保旧主库停止写入（关端口、`SET GLOBAL super_read_only=ON`、断开 VIP、STONITH 关机）
3. **自增隔离**：`auto_increment_increment=2`、`auto_increment_offset=1/2` 避免主键冲突——但**这只防冲突不防分叉**

答题要点：**先 fencing 再提升**，顺序反了就会出现双写窗口。

---

### Q35. 读写分离最容易踩的延迟坑是什么？【中】

三个高频事故：

1. **写后读**：下单后立刻跳订单详情，从库还没回放 → 查不到。解法：同事务内读主，或写后 N 秒内强制走主
2. **读己之写**：用户改完资料刷新看不到 → 用 cookie/session 记录 `gtid_executed`，路由层等从库追上
3. **事务混读**：一个事务里先读从库再写主库，导致基于旧数据写 → **事务内所有语句必须走同一节点（主库）**

工程做法：路由层（ProxySQL / ShardingSphere）按 SQL 类型分流，把「必须走主」的路径显式标注（注解或 hint），不要靠猜测。

监控口径：`Seconds_Behind_Master` 为 0 不代表没延迟，**GTID 差集 + 心跳表（`pt-heartbeat`）** 才是准的。

---

## 六、MySQL 备份与恢复

### Q36. 逻辑备份和物理备份怎么选？【初】

| 维度 | 逻辑（mysqldump / mydumper） | 物理（XtraBackup / 快照） |
|---|---|---|
| 内容 | SQL 文本 | 数据文件 + redo |
| 速度 | 慢，GB 级要几十分钟 | 快，TB 级也可控 |
| 体积 | 小（压缩后） | 大 |
| 跨版本 | 基本可以 | 受限 |
| 单表恢复 | 容易 | 需要单表导出流程 |
| 适合 | 中小库、单表误删 | 大库、全量恢复 |

通用做法：**物理做全量底座，binlog 做增量，逻辑备份兜底单表**。

坑：逻辑备份是「一致性快照」而不是「一致性日志」——不加 `--single-transaction` 会拿到撕裂的数据。

---

### Q37. `mysqldump` 的关键参数怎么配？【中】

```bash
mysqldump -uroot -p \
  --single-transaction \
  --master-data=2 \
  --set-gtid-purged=ON \
  --routines --triggers --events \
  --default-character-set=utf8mb4 \
  --hex-blob --quick \
  db_name | gzip > db_$(date +%F).sql.gz
```

参数含义：

- `--single-transaction`：InnoDB 一致性快照，不锁表
- `--master-data=2`：注释形式记录 binlog 位点，PITR 起点
- `--set-gtid-purged=ON`：GTID 环境必须，否则导入后 GTID 冲突
- `--quick`：结果集流式返回，避免大表把客户端内存吃满

`--single-transaction` 的前提是**全是 InnoDB 表**；有 MyISAM 表时它会退化成锁表，必须显式处理。

---

### Q38. XtraBackup 的增量备份和 prepare 是怎么回事？【高】

物理备份的核心是「拷数据文件的同时持续追 redo」，所以备份出来的目录**不可直接启动**，必须 `--prepare` 做崩溃恢复。

```bash
xtrabackup --backup --target-dir=/backup/full
xtrabackup --backup --target-dir=/backup/inc1 --incremental-basedir=/backup/full
xtrabackup --prepare --apply-log-only --target-dir=/backup/full      # 合并增量时用
xtrabackup --prepare --target-dir=/backup/full                       # 最后一次不加 apply-log-only
xtrabackup --copy-back --target-dir=/backup/full --datadir=/data/mysql
```

两个关键点：

1. 合并增量的中间步骤必须 `--apply-log-only`，**只有最后一次不加**，否则回滚掉未提交事务后就无法继续合并
2. `--copy-back` 后目录属主必须改回 `mysql:mysql`，否则起不来

坑：8.0 要用 XtraBackup 8.0.x，**版本必须与 MySQL 大版本对齐**，2.4 备份不了 8.0 的库。

---

### Q39. 怎么用 binlog 做 PITR 恢复？【中】

流程：

1. 恢复最近一次全量备份
2. 找到全量备份对应的位点（`xtrabackup_binlog_info` 或 dump 文件头部注释）
3. 重放从该位点到「灾难发生前一刻」的 binlog

```bash
mysqlbinlog --start-position=1234 --stop-datetime='2026-10-28 06:00:00' \
  --database=app mysql-bin.000123 mysql-bin.000124 | mysql -uroot -p app
```

GTID 环境用 `--include-gtids` / `--exclude-gtids` 更精确，误删场景把「误操作那个 GTID」排除掉即可。

必做前置：**用 `--base64-output=DECODE-ROWS -v` 先预览**要重放的内容，确认时间点和库名无误再执行。直接灌进生产是二次事故的经典来源。

---

### Q40. 备份做好了怎么校验？【高】

没有校验的备份等于没备份。三层校验：

1. **文件级**：压缩包能否解开、大小是否与前一日同量级（骤减说明备份失败但脚本没报错）
2. **恢复级**：每周在隔离实例上做一次自动恢复，跑 `CHECKSUM TABLE` 或行数抽样比对
3. **一致性**：`pt-table-checksum` 对比备份库与主库，或对比关键表的 `COUNT(*) + MAX(id)`

```bash
gunzip -t backup.sql.gz && echo gz-ok
```

常见「备份失效」套路：磁盘满导致脚本静默失败、`mysqldump` 因为锁等待超时退出、备份文件被清理脚本按天数删掉（比保留策略更早）。

落地纪律：**恢复演练要写进值班表**，并且恢复耗时必须实测，RTO 只能靠演练证明。

---

### Q41. 误删数据了，救回来的步骤是什么？【高】

按顺序做，**第一步是止血不是恢复**：

1. **立刻停止写入**（`SET GLOBAL super_read_only=ON` 或停应用），防止误删位点后的日志被覆盖
2. 确认误删范围：哪张表、哪个时间段、影响了多少行
3. 评估恢复方式：全量 + PITR 到误删前一刻（最稳），还是从备份单表恢复到临时实例再 `INSERT ... SELECT` 补回
4. 若用 PITR，**恢复到临时实例**验证数据完整后再决定是否切生产
5. 记录时间线与根因，补上 `sql_safe_updates`、权限收敛、双人复核

```bash
# 反解 binlog 生成回滚 SQL（工具 binlog2sql / my2sql）
python binlog2sql.py -h127.0.0.1 -uroot -p -d app -t orders \
  --start-file='mysql-bin.000123' --start-datetime='2026-10-28 05:50:00' -B
```

坑：`DROP TABLE` 无法反解，只能靠全量 + PITR；`TRUNCATE` 同理。所以**大表 DDL/删除必须走审批**。

---

## 七、MySQL 性能诊断与优化

### Q42. 慢查询日志怎么开？`pt-query-digest` 怎么用？【初】

```ini
slow_query_log              = 1
slow_query_log_file         = /var/log/mysql/slow.log
long_query_time             = 1          # 秒，线上先 1s，稳定的再往下调
log_queries_not_using_indexes = 0        # 小表全扫会被刷屏，先别开
```

```bash
pt-query-digest /var/log/mysql/slow.log > report.txt
pt-query-digest --since '2026-10-28 00:00:00' slow.log | head -80
```

报告看三块：**总耗时占比 Top（不是单次最慢）**、`Rows examined vs Rows sent` 比值、`Query_time` 的 `p99`。单次 30 秒但一天一次，不如每次 300 ms 但一秒 50 次的查询值得优化。

---

### Q43. `SHOW PROCESSLIST` 和 `performance_schema` 各解决什么问题？【中】

`SHOW PROCESSLIST` 看**当下**：谁在跑、跑了多久、在等什么状态。

```sql
SELECT id, user, time, state, LEFT(info, 80) FROM information_schema.processlist
WHERE command <> 'Sleep' ORDER BY time DESC LIMIT 20;
```

`performance_schema` 看**历史与汇总**：

```sql
SELECT DIGEST_TEXT, COUNT_STAR, AVG_TIMER_WAIT/1e9 AS avg_ms, SUM_ROWS_EXAMINED
FROM performance_schema.events_statements_summary_by_digest
ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;
```

`state` 列的读法很关键：`Sending data` 通常是在扫数据不是真在发；`Waiting for table metadata lock` 是 DDL 卡住了；`Copying to tmp table` 是大排序/无索引 GROUP BY。

---

### Q44. 连接数怎么设？连接池和线程池是一回事吗？【中】

- `max_connections` 按「应用实例数 × 单实例池大小 × 1.5」估，**不是越大越好**：每连接一个线程，线程切换和内存开销会反噬
- 连接数打满的第一反应不该是调大，而是查**连接泄漏**（`Sleep` 状态堆积）和**长事务占着不释放**

```sql
SHOW STATUS LIKE 'Threads_connected';   -- 当前连接
SHOW STATUS LIKE 'Threads_running';     -- 正在执行，持续 > CPU 核数说明排队
SHOW STATUS LIKE 'Max_used_connections';
SHOW VARIABLES LIKE 'max_connections';
```

线程池（`thread_handling=pool-of-threads`）解决的是**高并发短查询**下的线程创建销毁开销，与连接池（客户端侧复用连接）是两个层的东西。连接池是「复用连接」，线程池是「复用执行线程」。

---

### Q45. 临时表和文件排序为什么慢？怎么消除？【中】

`EXPLAIN` 的 `Extra` 出现 `Using temporary` 或 `Using filesort` 就要警惕。

- **`Using temporary`**：GROUP BY / DISTINCT / UNION 需要中间结果。临时表超过 `tmp_table_size` 与 `max_heap_table_size` 就**落盘**，从内存操作变成磁盘 IO
- **`Using filesort`**：排序无法利用索引顺序，要把结果集读出来再排；数据量大时用磁盘归并，`Sort_merge_passes` 会涨

消除手段：

1. 让 `ORDER BY` 的列成为索引的最左连续前缀，且方向一致
2. `GROUP BY` 走索引，避免对函数结果分组
3. 减少 `SELECT` 的列，让排序元组更小
4. 必须大排序时，分批 + 游标翻页替代 `LIMIT 100000, 20`

监控：`SHOW GLOBAL STATUS LIKE 'Created_tmp_disk_tables'` 相对 `Created_tmp_tables` 的比例，超过 25% 就该查了。

---

### Q46. 大表 DDL 有几种做法？`online DDL`、`gh-ost`、`pt-osc` 怎么选？【高】

| 方案 | 原理 | 锁 | 适合 |
|---|---|---|---|
| 原生 `ALGORITHM=INPLACE` | 在线重建，允许并发 DML | 开始/结束短暂 MDL | 加索引、改列顺序等支持的操作 |
| `pt-online-schema-change` | 建影子表 + 触发器同步 | 全程可读写 | 有主键、写入不太疯狂的表 |
| `gh-ost` | 影子表 + **解析 binlog** 同步，无触发器 | 全程可读写，可限流 | 高写入、触发器有副作用的环境 |

```sql
ALTER TABLE orders ADD INDEX idx_uid (user_id), ALGORITHM=INPLACE, LOCK=NONE;
```

选型要点：

- 原生支持的操作优先原生，最省事
- 触发器会放大写入开销且与已有触发器冲突 → 高并发选 `gh-ost`
- 表无主键/唯一键时三个方案都危险，先补主键

坑：任何 DDL 都要拿 `metadata lock`，**前面有长事务就会把整张表的查询全部排队**，DDL 前必须查 `information_schema.innodb_trx` 和 `performance_schema.metadata_locks`。

---

### Q47. 锁等待和阻塞链怎么定位？【中】

```sql
SELECT * FROM sys.innodb_lock_waits\G          -- 谁等谁，一眼看清
SELECT * FROM performance_schema.data_lock_waits;
SELECT * FROM performance_schema.data_locks;
```

`sys.innodb_lock_waits` 会给出 `waiting_pid`、`blocking_pid` 和双方的 SQL，直接定位「罪魁」。

处置顺序：

1. 先判断阻塞者是**长事务**还是**未提交的空闲事务**（`trx_state='RUNNING'` 但 `trx_query` 为空 = 应用忘了 commit）
2. 优先 `KILL` 阻塞源而不是等待方
3. 因为 MDL 阻塞的，杀 DDL 或杀长事务，两者选影响小的

坑：`innodb_lock_wait_timeout` 默认 50 秒，业务超时通常设得更短，所以现象往往是「业务报超时」而不是「数据库报锁等待」。

---

### Q48. CPU 高和 IO 高分别按什么顺序查？【高】

**CPU 高**：

1. `top -H` 找最热线程 → 转成 TID
2. `SHOW PROCESSLIST` 对照 `Threads_running`，是不是并发查询太多
3. `performance_schema.events_statements_summary_by_digest` 按 `SUM_TIMER_WAIT` 排序找元凶
4. 排除非 SQL 因素：`innodb_spin_wait_delay`、大量 `S` 状态（上下文切换）、中断不均

**IO 高**：

1. `iostat -x 1` 看 `%util` 与 `await`，区分「IO 量大」还是「IO 慢」
2. `SHOW GLOBAL STATUS LIKE 'Innodb_data_read%'`、`Innodb_buffer_pool_reads` 是否暴涨（buffer pool 装不下）
3. 慢日志里找全表扫描、`filesort` 落盘、临时表落盘
4. 排除 binlog 刷盘、双写缓冲、备份任务抢 IO

答题要点：**先区分是「资源不够」还是「SQL 太差」**。加机器能缓解前者，对后者毫无作用——这是面试官最想听的一句。

---

## 八、PostgreSQL 运维要点

### Q49. PostgreSQL 的进程模型和 MySQL 有什么不同？【初】

PG 是**多进程**架构：

- `postmaster` 主进程监听连接，每来一个客户端 `fork` 一个后端进程
- 进程间靠**共享内存**（`shared_buffers`）通信，会话内存是私有的
- 后台进程：`checkpointer`、`bgwriter`、`walwriter`、`autovacuum launcher`、`archiver`

对比 MySQL：MySQL 连接 = 线程（开销小），PG 连接 = 进程（开销大、内存隔离好）。

后果：**PG 单机连接数要控制在几百级**，几千连接会直接 OOM 或上下文切换爆炸，所以连接池（`pgbouncer`）在 PG 里不是可选项。

---

### Q50. MVCC、膨胀和 autovacuum 三者什么关系？【中】

PG 的 MVCC 用「新版本写入、老版本标记 `xmax`」实现，**老版本不会立刻消失**，等没有事务能看到它了才由 `VACUUM` 回收。

死元组堆积 = **表膨胀**：磁盘占用翻倍、扫描要跳过大量死行、索引也跟着膨胀。

`autovacuum` 的触发阈值：

```ini
autovacuum_vacuum_scale_factor = 0.05   # 20% 太大，大表永远轮不到
autovacuum_vacuum_threshold    = 50
autovacuum_naptime             = 10s
autovacuum_max_workers         = 4
```

```sql
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
```

关键坑：**默认阈值是按表大小的百分比算的**，亿级大表要等 2000 万行死元组才触发，等于永不触发 → 大表必须单独调低 `scale_factor`（如 0.01）或按表设 `autovacuum_vacuum_scale_factor`。

`VACUUM FULL` 能彻底回收但会**持有 ACCESS EXCLUSIVE 锁**，生产禁用；替代是 `pg_repack`。

---

### Q51. WAL 和归档怎么配？【中】

WAL 是 PG 的 redo 日志，崩溃恢复和流复制都靠它。

```ini
wal_level          = replica        # 逻辑复制要 logical
archive_mode       = on
archive_command    = 'test ! -f /pgwal/%f && cp %p /pgwal/%f'
max_wal_size       = 4GB            # 太小会导致频繁 checkpoint
checkpoint_timeout = 15min
```

要点：

1. `archive_command` 必须幂等且**有失败可见性**，返回非 0 会一直重试并堆积 `pg_wal`
2. `pg_wal` 目录暴涨通常就是归档失败——这是 PG 最常见的磁盘打满原因
3. 需要 PITR 时，基础备份 + WAL 归档缺一不可

```sql
SELECT * FROM pg_stat_archiver;   -- failed_count 持续增长就是归档坏了
```

---

### Q52. 流复制和逻辑复制有什么区别？【中】

| 维度 | 流复制（物理） | 逻辑复制 |
|---|---|---|
| 粒度 | 整个实例/集群 | 表级 |
| 版本 | 主备必须同版本 | 可跨大版本 |
| 只读从库 | 是（可开 `hot_standby`） | 不是，目标端可写 |
| 用途 | 高可用、读扩展 | 升级迁移、多活、按表同步 |
| DDL | 自动同步 | **不同步，需手动执行** |

```sql
-- 逻辑复制槽
SELECT * FROM pg_replication_slots;
SELECT status, sender_host, write_lag, flush_lag, replay_lag FROM pg_stat_replication;
```

坑：逻辑复制槽不消费会**无限堆积 WAL**，把磁盘撑满——`inactive` 的槽必须尽快删。

---

### Q53. `pg_dump` 和 `pg_basebackup` 怎么选？【初】

- `pg_dump`：逻辑备份，单库、可跨版本、可只导某张表，恢复慢
- `pg_dumpall`：含全局对象（角色、表空间）
- `pg_basebackup`：物理全量，**是搭建从库和 PITR 的基础**

```bash
pg_dump -Fc -Z6 -f app.dump appdb          # 自定义格式，支持并行恢复
pg_restore -d appdb -j4 app.dump
pg_basebackup -h 10.0.0.1 -D /data/pg -X stream -P -R   # -R 自动写 primary_conninfo
```

坑：`pg_dump` 一致性靠 `REPEATABLE READ` 快照，但**不包含角色和表空间**；`pg_basebackup` 要求 `wal_level >= replica` 且有复制权限。

---

### Q54. `pgbouncer` 三种池模式怎么选？【高】

| 模式 | 连接复用粒度 | 限制 |
|---|---|---|
| session | 一个客户端独占一条服务端连接 | 最安全，几乎不复用 |
| transaction | 事务结束即归还 | **不支持会话级特性**（prepared statement、临时表、`SET`、advisory lock） |
| statement | 每条语句归还 | 更激进，连多语句事务都不行 |

生产绝大多数用 **transaction**，能带来数量级的连接复用收益。

核心坑：transaction 模式下 **应用不能用会话级 prepared statement**（需要 `server_reset_query` 与 PG 版本配合，或改用 `max_prepared_statements`）。这类问题上线才暴露，表现为「偶发报错 prepared statement already exists」。

监控：`SHOW POOLS;` 看 `sv_active`/`cl_waiting`，`cl_waiting` 持续 > 0 说明池子不够。

---

### Q55. `EXPLAIN (ANALYZE, BUFFERS)` 怎么看？常用参数有哪些？【中】

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE user_id = 1;
```

读法：

- 从**最内层缩进**往外读，`cost=0.00..123.45` 是启动成本..总成本
- `actual time` 是真实耗时，与估算 `rows` 对比：**差 10 倍以上说明统计信息不准或条件相关性被忽略**
- `Buffers: shared hit=X read=Y`，`read` 大就是缓存没命中

必记参数：

```ini
shared_buffers          = 内存的 25%
effective_cache_size    = 内存的 50%~75%
work_mem                = 按并发算，别超过 (内存×0.25/并发数)
maintenance_work_mem    = 1GB~2GB，影响 VACUUM 和建索引
random_page_cost        = 1.1（SSD）
max_connections         = 200~500，配 pgbouncer
```

坑：`work_mem` 是**每个排序/哈希节点**都申请，一条复杂 SQL 有 5 个排序节点就 ×5，配大了很容易 OOM。

---

## 九、Redis 持久化与高可用

### Q56. RDB 和 AOF 怎么选？【初】

| 维度 | RDB | AOF |
|---|---|---|
| 内容 | 二进制快照 | 命令追加日志 |
| 恢复速度 | 快 | 慢（要重放全部命令） |
| 数据安全 | 丢最后一次快照后的数据 | `everysec` 最多丢 1 秒 |
| 体积 | 小 | 大，有重写开销 |
| 阻塞 | `fork` 时短暂阻塞 | `fsync` 策略影响延迟 |

生产推荐 **两者都开或混合持久化**：RDB 用于冷备和快速恢复，AOF 用于兜住最近数据。

坑：只开 RDB 且 `save 900 1`，宕机丢 15 分钟数据，业务方会认为「Redis 是缓存丢了无所谓」——但很多项目把分布式锁、计数、队列都放在里面。

---

### Q57. 混合持久化和 AOF 重写是怎么工作的？【中】

4.0+ 的 `aof-use-rdb-preamble yes`：重写时先写一份 RDB 格式的全量，后面追加增量命令。恢复时先加载 RDB 部分再重放增量，**兼顾体积与速度**。

```ini
appendonly yes
appendfsync everysec        # always 最安全但极慢，no 交给 OS
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

`fork` 子进程做重写期间，主进程的写命令会同时写入 **AOF 重写缓冲区**，避免重写期间的数据丢失。

坑：AOF 文件在 `appendfsync everysec` 下也可能损坏（断电），需要用 `redis-check-aof --fix` 修复，修复会截断尾部不完整命令。

---

### Q58. 主从全量同步时 fork 和 copy-on-write 有什么代价？【高】

从库第一次连接或 `runid` 不匹配时触发**全量同步（full resync）**：主库 `fork` 子进程把内存 dump 成 RDB 发给从库。

代价：

- `fork` 本身的耗时与内存页表大小成正比，**16 GB 实例 fork 可能阻塞 200 ms+**
- COW 期间主库的写入会复制内存页，**写入越猛内存膨胀越多**，极端情况 OOM
- 传输期间从库不可用

缓解：`repl-backlog-size` 调大让短暂断线走**部分同步（psync）**而不是全量；避免在高峰期扩从库；`repl-diskless-sync yes` 省掉落盘但更吃网络。

坑：`maxmemory` 设得太接近物理内存，全量同步时 COW 一膨胀就被 OOM Killer 干掉主库。

---

### Q59. 哨兵的故障转移原理是什么？【中】

三件事：**监控 → 主观下线（SDOWN）→ 客观下线（ODOWN）→ 选举领头哨兵 → 提升从库**。

- 单个哨兵 ping 超时 → SDOWN
- 达到 `quorum` 个哨兵都认为下线 → ODOWN
- 哨兵之间用 Raft-like 投票选 leader，leader 再选新主（优先级 `replica-priority` → 复制偏移量最大 → runid 最小）

```ini
sentinel monitor mymaster 10.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1
```

坑：**哨兵数量必须是奇数且 ≥3**；`quorum` 只是判定下线的票数，真正选举还需要**多数派**，两个哨兵永远选不出 leader。

---

### Q60. Cluster 的槽和 MOVED/ASK 重定向是怎么回事？【高】

16384 个槽分给多个主节点，key 用 `CRC16(key) % 16384` 定位。

- `MOVED`：槽已经永久迁移到别的节点 → 客户端应**刷新槽缓存**后重试
- `ASK`：槽正在迁移中，本次请求要去目标节点 → 客户端发 `ASKING` 再执行，**不刷新缓存**

```bash
redis-cli -c -h 10.0.0.1 -p 6379     # -c 自动跟随重定向
redis-cli --cluster check 10.0.0.1:6379
redis-cli --cluster reshard 10.0.0.1:6379
```

坑：多 key 操作（`MGET`、事务、Lua）**必须落在同一个槽**，用 hash tag `{user:1}:name` 强制同槽。跨槽会直接报 `CROSSSLOT`。

---

### Q61. Redis 脑裂为什么会丢数据？【高】

脑裂场景：主节点与哨兵/集群失联但仍在接受写入 → 哨兵提升新主 → 网络恢复后旧主降级为从库，**从库全量同步会清空自己**，那段时间的写入彻底丢失。

两个防线：

```ini
min-replicas-to-write 1        # 至少有 1 个从库连着才允许写
min-replicas-max-lag 10        # 从库延迟不超过 10 秒
```

原理：孤立的主节点没有健康从库，**直接拒绝写入**，把「静默丢数据」变成「明确报错」，业务可以降级。

配套：`redis.conf` 里配 `replica-read-only yes`，禁止误写从库。

---

### Q62. 持久化对延迟有什么影响？怎么权衡？【中】

- `appendfsync everysec`：后台线程每秒 `fsync`，正常 < 1 ms，但**磁盘抖动时主线程会等待上一次 fsync 完成**，出现几百毫秒毛刺
- `appendfsync always`：每条命令都 fsync，QPS 直接掉一个数量级
- RDB `save` 或 AOF 重写触发 `fork`：内存越大阻塞越久，几十 GB 实例可到秒级
- `no-appendfsync-on-rewrite yes`：重写期间不 fsync，能减少毛刺但违背「最多丢 1 秒」

治理方向：把持久化和业务分开（Redis 只做缓存则关持久化）、控制单实例内存 ≤ 16 GB、把 `save` 放到低峰、用 SSD 且别与其他 IO 密集服务混部。

监控：`latest_fork_usec`（最近一次 fork 耗时）、`aof_rewrite_in_progress`、`rdb_last_bgsave_status`。

---

## 十、Redis 内存与性能治理

### Q63. 八种内存淘汰策略怎么选？【中】

| 策略 | 行为 |
|---|---|
| `noeviction` | 不淘汰，写满直接报 OOM 错误（默认） |
| `allkeys-lru` | 所有 key 里按 LRU 淘汰 |
| `allkeys-lfu` | 按访问频率淘汰（4.0+，更抗偶发扫描） |
| `allkeys-random` | 随机淘汰 |
| `volatile-lru/lfu/random` | 只在**设了过期时间**的 key 里淘汰 |
| `volatile-ttl` | 优先淘汰剩余 TTL 最短的 |

**纯缓存场景选 `allkeys-lru` 或 `allkeys-lfu`**；Redis 同时存不可丢数据时用 `noeviction` + 独立实例，别混。

坑：`volatile-*` 在「所有 key 都有 TTL」时才安全；混着永久 key 时可能淘汰不掉任何东西，直接 OOM。

---

### Q64. 大 key 和热 key 怎么发现、怎么治？【中】

**大 key**（String > 10 KB / 集合元素 > 5000）：

```bash
redis-cli --bigkeys                  # 采样扫描，别在高峰跑
redis-cli --memkeys                  # 看内存占用分布
MEMORY USAGE user:1000:profile       # 单 key 精确占用
```

危害：删除/过期时阻塞主线程、网络传输突刺、集群迁移卡顿、主从同步放大。

治：拆分（`hash` 分桶、大 List 切片）、用 `UNLINK` 异步删除、`SCAN` 替代 `KEYS`。

**热 key**（单 key QPS 占比过高）：`redis-cli --hotkeys`（需 LFU 策略）、`MONITOR` 短时采样。

治：本地缓存（多级缓存）、key 加随机后缀分散到多个节点、读写分离到从库。

---

### Q65. 单线程为什么会阻塞？慢查询怎么查？【中】

Redis 命令是单线程执行的，**一条慢命令会阻塞所有客户端**。

常见阻塞源：

- `KEYS *`、`FLUSHALL`、大 `SMEMBERS`/`HGETALL`
- 大 key 的 `DEL`
- Lua 脚本死循环或复杂度高
- `fork`（RDB/AOF 重写）
- AOF `fsync` 抖动

```bash
redis-cli SLOWLOG GET 10
redis-cli CONFIG SET slowlog-log-slower-than 10000   # 微秒，10ms
redis-cli --latency -h 10.0.0.1
redis-cli --intrinsic-latency 100
```

`SLOWLOG` 只记录**命令执行时间**，不含网络排队；`--intrinsic-latency` 测的是系统本身的延迟基线，两者要分开看。

---

### Q66. pipeline、批量命令和事务怎么选？【中】

- **pipeline**：客户端攒一批命令一次发，减少 RTT。**不保证原子性**，中间某条失败其余照常执行
- **`MGET`/`MSET`**：服务端一次处理多个 key，比 pipeline 更省，但 key 必须同槽（Cluster）
- **`MULTI/EXEC`**：原子执行，但**没有回滚**，只有语法错才整批不执行

```bash
(echo -en "PING\r\nPING\r\nPING\r\n"; sleep 0.1) | redis-cli --pipe
```

坑：一次 pipeline 塞十万条会把服务端的输出缓冲区打爆（`client-output-buffer-limit normal`），连接直接被断；建议单批 500~1000 条。

---

### Q67. 缓存穿透、击穿、雪崩分别怎么防？【中】

| 问题 | 现象 | 解法 |
|---|---|---|
| 穿透 | 查不存在的数据，每次都打到 DB | 缓存空值（短 TTL）、布隆过滤器、参数校验 |
| 击穿 | 单个热 key 过期瞬间，大量请求打 DB | 互斥锁重建、逻辑过期 + 异步刷新、永不过期 |
| 雪崩 | 大批 key 同时过期 / Redis 整体挂 | TTL 加随机抖动、多级缓存、熔断降级、集群高可用 |

**最关键的一条：所有缓存路径都必须有「回源限流」**。哪怕缓存全挂，DB 也只应该承受它能承受的流量，否则缓存的作用就是把故障从 Redis 转移到数据库。

答题要点：穿透防的是「查不到」，击穿防的是「单个热点失效」，雪崩防的是「大面积同时失效」。

---

### Q68. 缓存和数据库怎么保证一致性？【高】

按强度排：

1. **先更新 DB，再删除缓存（Cache-Aside）**，最常用。仍有极小概率不一致，可加延迟双删
2. **binlog 订阅 + 异步删缓存**（Canal），把删缓存做成可靠消息，能重试
3. **读多写少 + 允许短暂不一致**：TTL 兜底，最简单
4. **强一致**：不要用缓存，或者用「更新 DB 时把缓存标记为脏 + 读时加锁重建」

反面教材：**先删缓存再更新 DB**。并发下读请求在删缓存后、更新 DB 前把旧值重新加载进来，长期脏数据。

兜底手段：给所有缓存设 TTL，**一致性最终靠过期收敛**，这是工程上最现实的做法。

---

### Q69. `KEYS` 为什么危险？替代方案是什么？【初】

`KEYS pattern` 会**遍历整个 keyspace**，O(N) 且在主线程执行。百万 key 的实例上执行一次可能阻塞几百毫秒到几秒，期间所有请求排队、超时、雪崩。

替代：

```bash
SCAN 0 MATCH user:* COUNT 1000     # 游标式增量遍历，不阻塞
```

注意 `SCAN` 的语义：**可能返回重复元素、不保证一次遍历期间的新增/删除可见**，只适合「找出符合条件的 key 并逐个处理」，不能用来做精确计数。

其他高危命令：`FLUSHALL`/`FLUSHDB`（用 `ASYNC` 变体）、`DEBUG SLEEP`、`MONITOR`（长开拖垮性能）、`CONFIG SET` 改错参数。

---

## 十一、MongoDB 运维要点

### Q70. 副本集和分片集群的结构各是什么？【初】

- **副本集（Replica Set）**：1 主 + N 从 + 可选 arbiter，靠 oplog 复制，自动选主（绝大多数场景够用）
- **分片集群（Sharded Cluster）**：`mongos`（路由）+ `config server`（元数据副本集）+ `shard`（每个 shard 本身是副本集）

分片键决定数据分布，一旦选定**极难更改**：

```text
sh.shardCollection("app.orders", { userId: "hashed" })
sh.status()
```

坑：单调递增的分片键（如时间戳、ObjectId）会把写入全部集中到最后一个 chunk，形成**热点 shard**，这是分片最常见的翻车。

---

### Q71. 写关注（writeConcern）和读偏好（readPreference）怎么配？【中】

```text
db.orders.insertOne(doc, { writeConcern: { w: "majority", j: true, wtimeout: 5000 } })
db.orders.find({}).readPref("secondaryPreferred")
```

`w` 的取值：`1`（默认，主库确认）、`majority`（多数派落盘，可靠但慢）、`0`（不确认，危险）。

读偏好：`primary`（默认，强一致）、`primaryPreferred`、`secondary`、`secondaryPreferred`、`nearest`。

**关键组合**：`w:"majority"` + 读 `primary` 才接近关系库的强一致；读 `secondary` 必然可能读到旧数据。

坑：`w:"majority"` 在 3 节点副本集里要等 2 个节点确认，**跨机房部署时延迟 = 最慢那个机房**，写入性能直接砍半。

---

### Q72. 索引和执行计划怎么分析？【中】

```text
db.orders.createIndex({ userId: 1, createdAt: -1 })
db.orders.find({ userId: 100 }).sort({ createdAt: -1 }).explain("executionStats")
```

看四件事：

- `winningPlan.stage`：`IXSCAN` 好，`COLLSCAN` 是全表扫描
- `totalDocsExamined` vs `nReturned`：比值接近 1 才算高效
- `totalKeysExamined`：索引扫描了多少键
- `executionTimeMillis`

复合索引同样**遵循最左前缀**。

坑：`$or`、`$ne`、`$nin`、正则不锚定首字符都可能退化为全表扫描；数组字段的多键索引（multikey）会让一个文档产生多个索引项。

---

### Q73. oplog 是什么？和增量同步什么关系？【中】

oplog 是副本集的**固定大小** capped collection，记录所有写操作，从库靠 `tailable cursor` 拉取回放。

```text
db.getSiblingDB("local").oplog.rs.stats().maxSize
db.getReplicationInfo()     // 看 oplog 时间窗口
```

`maxSize` 默认是磁盘的 5%（最小 990 MB），**oplog 窗口太短是运维事故源头**：从库停机超过窗口，恢复时无法增量追上，只能做**全量 initial sync**（复制全量数据，代价极大）。

坑：批量 `updateMany` 会写大量 oplog，可能瞬间冲掉窗口；从库长期离线再上线，第一件事就是看 oplog 窗口够不够。

---

### Q74. 备份怎么做？`mongodump` 和快照怎么选？【中】

- `mongodump`：逻辑备份，**`--oplog` 才能拿到一致快照**，恢复要 `--oplogReplay`
- 文件系统/云盘快照：物理备份，快但也必须**对整个副本集做一致性快照**（先 `fsyncLock` 或停写）
- `mongodump` 单线程导出，TB 级数据很慢

```bash
mongodump --uri="mongodb://10.0.0.1:27017" --oplog --gzip --out=/backup/2026-10-28
mongorestore --oplogReplay --gzip /backup/2026-10-28
```

坑：`mongodump` 按集合并发导出，**大集合中途失败整份不可用**；分片集群必须连 `mongos` 并同时备份 config 库。

---

### Q75. WiredTiger 缓存怎么配？无模式设计有什么坑？【高】

```yaml
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 物理内存的 50%
      journal:
        compressor: snappy
```

WiredTiger 用**文档级并发控制 + checkpoint**，`cacheSizeGB` 超过 50% 会挤压文件系统缓存，反而变慢。缓存压力大时看 `db.serverStatus().wiredTiger.cache` 里的 `dirty` 比例，超过 20% 会触发强制淘汰，表现为写延迟飙升。

无模式的坑：

- **字段名重复存储**，10 万文档每个多存 20 字节字段名就是 2 MB
- 同一字段在不同文档里类型不一致（`"1"` 与 `1`），查询和索引全部失效
- 文档超过 **16 MB** 上限，只能拆成 GridFS
- 数组无限增长会导致文档重写放大

治理：用 JSON Schema 校验（`$jsonSchema`）、统一字段命名、给常用查询字段建索引、避免深层嵌套。

---

### Q76. MongoDB 常见故障怎么定位？【中】

| 现象 | 排查 |
|---|---|
| 副本集选不出主 | `rs.status()` 看各节点 `stateStr`/`health`，多半是多数派不可达 |
| 写入变慢 | `db.currentOp()` 找长操作；看 WiredTiger dirty 比例与 checkpoint |
| 从库延迟 | `rs.printSecondaryReplicationInfo()`，`optimeDate` 差值即延迟 |
| 连接被打满 | `db.serverStatus().connections`，配合 `currentOp` 找泄漏 |
| 磁盘暴涨 | `db.stats()` 与 `coll.stats()`，多因删除后未 `compact` 或 oplog 太大 |
| 选举风暴 | 网络抖动或心跳超时（`heartbeatTimeoutMillis`）设置不当 |

固定三连：`rs.status()` → `db.currentOp()` → `db.serverStatus()`。日志在 `/var/log/mongodb/mongod.log`，选主和网络分区事件都记在里面。

---

## 十二、Elasticsearch 运维要点

### Q77. 分片和副本怎么设计？【中】

- **分片（primary shard）数在索引创建时定死，不能改**（只能 reindex 或 split）
- 单分片建议 **10~50 GB**，过大会导致恢复慢、合并压力大
- 副本数随时可调，副本同时提供**读扩展**和**高可用**

```bash
# 经验：每 GB 堆内存对应 20~25 个分片，包含副本后总数别超过 1000/节点
curl -s -XPUT 'http://10.0.0.1:9200/orders/_settings' -H 'Content-Type: application/json' \
  -d '{"index":{"number_of_replicas":1}}'
```

坑：小索引过多是最常见的集群病——每天一个索引、按小时切分，几千个分片后 master 压力大、集群状态更新慢。

---

### Q78. 写入流程里 refresh、flush、translog 各是什么？【中】

写入链路：**协调节点 → 主分片 → 副本分片 → 应答**。

- **refresh**：把内存 buffer 生成新的 segment 并让文档**可被搜索**（默认 1 秒）
- **flush**：把内存数据落盘 + 提交，同时清空 translog（默认 30 分钟或 translog 达阈值）
- **translog**：预写日志，保证两次 flush 之间的数据不丢

```bash
curl -s -XPUT 'http://10.0.0.1:9200/orders/_settings' -H 'Content-Type: application/json' \
  -d '{"index":{"refresh_interval":"30s"}}'
```

调优要点：**批量导入时把 `refresh_interval` 设为 `-1`、副本数设 0**，导完再改回来，速度能差好几倍。

`refresh_interval` 直接决定「写入后多久能查到」，把它当实时性参数用是常见误区。

---

### Q79. mapping 和动态映射有什么坑？【中】

动态映射会根据第一条数据的形态猜类型，猜错就是长期麻烦：

- `"123"` 被映射成 `text`，之后想按数值范围查就废了
- 字符串默认 `text` + `.keyword` 双字段，**聚合必须用 `.keyword`**，用 `text` 会报 fielddata 错误
- 时间字符串格式不统一会解析失败，整条文档被拒

生产规矩：**显式定义 mapping，关闭动态映射**。

```json
{
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "orderId": { "type": "keyword" },
      "amount":  { "type": "scaled_float", "scaling_factor": 100 }
    }
  }
}
```

关键坑：**已有字段的类型不能改**，要改只能新建索引 + reindex + 别名切换。

---

### Q80. 查询慢和聚合慢分别怎么查？【高】

先用 **Profile API** 定位耗时落在哪个 phase：

```json
{ "profile": true, "query": { "match": { "title": "redis" } } }
```

查询慢的常见原因：

- 用了 `wildcard`/正则前导通配
- `script` 查询逐文档计算
- `from + size` 深分页（每个分片都要取前 N 条）→ 改用 `search_after` 或 `scroll`
- 分片过多，每次查询都要等最慢的那个分片

聚合慢：

- 对 `text` 字段做 `terms` 聚合（应改 `.keyword`）
- 高基数字段的 `cardinality`，用 `precision_threshold` 换精度换性能
- 大范围 `date_histogram` 跨全年数据 → 用**预聚合索引**

兜底：`search.max_buckets`（默认 65536）超了直接报错，说明聚合设计有问题。

---

### Q81. 堆内存怎么设？GC 怎么调？【中】

- 堆 **≤ 物理内存的 50%，且 ≤ 31 GB**（超过 32 GB 会丢失压缩指针，反而更费内存）
- 剩下的内存全给 **Lucene 的文件系统缓存**，这才是搜索性能的关键
- 用 G1（JDK 8u212+ 默认）+ `-XX:MaxGCPauseMillis=200`

```ini
-Xms16g
-Xmx16g        # 必须相等，避免动态扩堆导致停顿
```

必看监控：GC 停顿时间（`_nodes/stats/jvm` 的 `collection_time_in_millis`）、`indices.fielddata.memory.size` 是否逼近 `indices.breaker.fielddata.limit`（默认 40% 堆）。

坑：对 `text` 字段做聚合会把 fielddata 加载进堆，**一次误操作就能把节点打 OOM**，这是 ES 集群最常见的宕机原因。

---

### Q82. master 选举和脑裂怎么防？【高】

7.x 之后用 **基于 quorum 的选举**：只有拿到多数票的候选节点才能当选，旧版的 `discovery.zen.minimum_master_nodes` 已移除。

```yaml
node.roles: [ master ]    # 7.9+ 用 roles 替代 node.master/node.data
discovery.seed_hosts: ["10.0.0.1:9300", "10.0.0.2:9300", "10.0.0.3:9300"]
cluster.initial_master_nodes: ["node-1", "node-2", "node-3"]   # 只在首次启动用
```

防脑裂三原则：

1. **专用 master 节点数 ≥ 3 且为奇数**，且不承担 data 角色（避免 GC 抖动导致掉主）
2. `cluster.initial_master_nodes` **只在集群初始化时配置**，之后再留着是事故隐患
3. 网络分区时小分区无法选出 master，自动停止服务而不是双主

坑：把 `initial_master_nodes` 留在配置里，集群整体重启后可能选出多个 master。

---

### Q83. 快照备份和集群扩容怎么做？【高】

**快照**必须先配 repository：

```bash
curl -s -XPUT 'http://10.0.0.1:9200/_snapshot/backup' -H 'Content-Type: application/json' \
  -d '{"type":"fs","settings":{"location":"/mnt/backup/es","compress":true}}'
curl -s -XPUT 'http://10.0.0.1:9200/_snapshot/backup/snap-2026-10-28?wait_for_completion=false'
```

坑：`path.repo` 必须在 `elasticsearch.yml` 里配好并**在每个节点都可访问**（共享存储），这是快照失败的头号原因。快照是增量的，但**必须保留基础快照**，只删中间会破坏链。

**扩容**：加节点后不会自动均衡分片，需要 `_cluster/reroute` 或等 `cluster.routing.allocation` 慢慢迁移。迁移期间带宽和 IO 会明显上升，**低峰操作**，并用 `cluster.routing.allocation.cluster_concurrent_rebalance` 限制并发。

---

## 十三、数据库账号、权限与安全

### Q84. 最小权限怎么落地？账号怎么分？【初】

按「用途」分账号，一个账号只做一件事：

| 账号 | 权限 |
|---|---|
| `app_rw` | 业务库 `SELECT/INSERT/UPDATE/DELETE`，无 DDL |
| `app_ro` | 只读，给报表和排查用 |
| `ddl_bot` | 变更平台专用，可 `ALTER/CREATE`，来源 IP 固定 |
| `backup` | `SELECT, LOCK TABLES, RELOAD, REPLICATION CLIENT` |
| `dba_admin` | 运维账号，双因素 + 跳板机 |

```sql
CREATE USER 'app_rw'@'10.0.0.%' IDENTIFIED BY 'xxx';
GRANT SELECT, INSERT, UPDATE, DELETE ON app.* TO 'app_rw'@'10.0.0.%';
```

**禁止 `GRANT ALL ON *.*`**，也禁止业务账号带 `SUPER`、`FILE`（能读写服务器文件）、`GRANT OPTION`。

---

### Q85. 网络层怎么隔离？白名单怎么做？【初】

四层防线，缺一不可：

1. **不监听公网**：`bind-address = 内网IP`，纯本地用 `skip-networking`
2. **安全组/防火墙**只放业务网段，拒绝 0.0.0.0/0
3. **数据库层 host 白名单**：`'app_rw'@'10.0.0.%'`，比 `'%'` 安全得多
4. **跳板机 + 堡垒机审计**，运维不直连生产库

```bash
# 验证是否真的没监听公网
ss -lntp | grep 3306
```

坑：`user@'%'` 与 `user@'10.0.0.%'` 同时存在时，MySQL 按**最具体的 host 匹配**，很容易出现「改了密码但应用还连得上」的困惑——排查时 `SELECT user,host FROM mysql.user` 全看一遍。

---

### Q86. 审计日志怎么开？要记什么？【中】

要能回答三个问题：**谁、什么时候、对什么数据做了什么**。

- MySQL：`general_log` 太吵只用于短期取证；生产用**审计插件**（`audit_log` / `server_audit`），或 `performance_schema` 的语句历史
- PostgreSQL：`pgaudit` 扩展，`pgaudit.log = 'write, ddl'`
- Redis：`MONITOR` 只能短开，长期靠代理层记录
- 云上：优先用云审计，避免自建插件影响性能

```sql
SET GLOBAL general_log = ON;   -- 仅临时排障，量大时能瞬间写满磁盘
```

落地要求：审计日志**独立存储、只追加、保留 ≥ 180 天**，并且**不能由被审计者自己删**。

---

### Q87. TDE 和落盘加密解决什么问题？【高】

- **TDE（透明数据加密）**：加密数据文件和备份文件，防的是「磁盘/备份文件被拿走」
- **传输加密（TLS）**：防的是链路上被抓包
- **应用层字段加密**：防的是「DBA 和有库权限的人」，这是唯一能防内部人的一层

```sql
-- MySQL 8.0 InnoDB 表空间加密
SET GLOBAL default_table_encryption = ON;
```

关键认知：**TDE 不防有数据库账号的人**——他照常 `SELECT` 就能看到明文。TDE 真正的价值是合规（等保、GDPR）和物理介质丢失场景。

坑：密钥管理比加密本身更重要。密钥丢了数据等于永久丢失；密钥和加密数据放在同一台机器上，等于没加密。

---

### Q88. SQL 注入的防线有哪几层？【中】

1. **参数化查询/预编译**——唯一有效的根治手段，`PreparedStatement`、ORM 参数绑定
2. **输入校验与类型约束**——白名单优于黑名单，不要把转义当防线
3. **最小权限**——注入成功后能做的事被限制（没有 `FILE`、没有跨库权限）
4. **WAF + 审计**——拦截已知 payload、发现异常查询模式

```python
cur.execute("SELECT * FROM users WHERE name = %s", (name,))   # 正确
cur.execute(f"SELECT * FROM users WHERE name = '{name}'")     # 绝对错误
```

坑：`ORDER BY`、表名、列名无法参数化，必须用**白名单映射**，这是注入的高发残留点。

---

### Q89. 备份文件为什么也是敏感数据？【高】

备份里是**全量明文业务数据**，而且往往：

- 存在成本更低的存储上（对象存储、NAS），访问控制更松
- 用共享账号传输，脚本里明文密码
- 下载到个人电脑做「临时排查」，然后忘了删

治理清单：

1. 备份加密（存储层加密或工具加密），密钥独立管理
2. 备份存储单独授权，访问留审计
3. 传输走内网 + TLS，禁止公网直传
4. 定期清理过期备份，**销毁要有记录**
5. 恢复演练在隔离环境，用完立即销毁

答题要点：**备份的权限等级必须 ≥ 生产库本身**，很多数据泄露事故的出口就是一份没人管的备份。

---

### Q90. 离职和权限回收怎么做才不留尾巴？【中】

1. 账号**立即禁用**（`ALTER USER ... ACCOUNT LOCK`），不是改密码——改密码后旧会话还在
2. 断开会话：`SELECT id FROM information_schema.processlist WHERE user='xxx'` 后逐个 `KILL`
3. 收回授权：`REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'xxx'@'%'`
4. 轮换该人接触过的**所有共享口令**（应用账号、备份账号）
5. 检查他创建的对象：存储过程、定时任务、临时表、SSH 密钥
6. 交接文档 + 双人确认，审计日志留档

坑：只删 `mysql.user` 里的账号，忘了 PostgreSQL 的 `pg_hba.conf`、Redis 的 ACL、MongoDB 的 `db.createUser`，以及**跳板机上的 `authorized_keys`**——这是最常被漏的一处。

---

## 十四、容量规划与慢查询治理

### Q91. 容量怎么估？QPS、连接数、磁盘各怎么算？【中】

三个维度分开算，别混在一起：

| 维度 | 估算式 |
|---|---|
| QPS | 峰值 = 日均 × (3~5) 倍；预留 **50% 余量** |
| 连接数 | 单实例 `max_connections` 的 60% 为安全水位；一个业务请求可能占多条连接 |
| 磁盘 | 数据量 + 索引（约为数据的 20%~40%）+ binlog + 临时表 + 30% 空余 |

```sql
-- 实际数据量：别只看 information_schema 的估算值
SELECT table_name,
       ROUND(data_length/1024/1024/1024, 2) AS data_gb,
       ROUND(index_length/1024/1024/1024, 2) AS index_gb
FROM information_schema.tables
WHERE table_schema = 'app' ORDER BY data_length DESC LIMIT 10;
```

坑：只按当前数据量估磁盘，忘了 **binlog 保留 7 天** 的量，高峰期一天写 200 GB binlog 就足以打满盘。

---

### Q92. 磁盘水位和清理策略怎么定？【初】

分级阈值，按数据性质分开：

- **70%** 预警：开始规划扩容、盘点可清理对象
- **80%** 行动：立即清 binlog、归档历史分区、清临时文件
- **90%** 紧急：只允许扩容和删数据两类操作，其他变更一律冻结

清理顺序（先安全后激进）：过期 binlog → 临时表空间/慢日志 → 归档冷数据分区 → 删索引 → 缩表/缩实例。

```sql
PURGE BINARY LOGS BEFORE DATE_SUB(NOW(), INTERVAL 3 DAY);
```

坑：`rm` 删了 binlog 文件但没 `PURGE`，`mysql-bin.index` 里还留着，下次重启直接起不来——**永远用 SQL 命令删，不要用手删文件**。

---

### Q93. 连接数打满了怎么处置？【中】

现场顺序，别上来就重启：

1. 看是谁占的：
```sql
SELECT user, host, command, COUNT(*) c FROM information_schema.processlist
GROUP BY user, host, command ORDER BY c DESC;
```
2. 区分 `Sleep`（连接池没回收）和 `Query`（真在跑慢 SQL）
3. `Sleep` 过多 → 应用连接池配置问题，改 `maxIdle`、`maxLifetime`
4. `Query` 卡住 → 找阻塞源，`KILL` 掉罪魁而非全部
5. 临时兜底 `SET GLOBAL max_connections = 1000`（不重启生效），但这是止血不是治病

坑：`KILL` 掉连接后应用会立刻重连重试，可能瞬间把连接数打回满，形成雪崩。**先限流再 KILL**。

---

### Q94. 慢查询治理闭环怎么跑？【中】

**发现 → 归因 → 优化 → 验证**，缺一环就退化成「救火」。

```ini
slow_query_log = ON
long_query_time = 1
log_queries_not_using_indexes = ON
```

- 发现：`pt-query-digest` 按总耗时排序，**优先看总耗时高而非单次慢**
- 归因：`EXPLAIN` 看 `type`/`rows`/`Extra`，区分「没走索引」还是「走了但扫太多」
- 优化：加/改索引、改写 SQL、拆查询、加缓存
- 验证：对比优化前后的 `Handler_read_*` 与耗时，**保留基线数据**才算闭环

答题要点：慢查询日志只是入口，真正的治理是**把高频 SQL 纳入发布前评审**，让慢查询不产生。

---

### Q95. 索引维护和统计信息该怎么管？【中】

- 统计信息不准 → 优化器选错索引。`ANALYZE TABLE t;` 手动更新，MySQL 8.0 可用 `innodb_stats_persistent` 让结果持久化
- **冗余索引**：`(a)` 和 `(a,b)` 并存时前者冗余；用 `sys.schema_redundant_indexes` 查
- **未使用索引**：`sys.schema_unused_indexes`，但要看够长时间（至少覆盖一个完整业务周期）再删
- 索引不是越多越好：每个索引都增加写放大和 buffer pool 占用

```sql
SELECT * FROM sys.schema_redundant_indexes;
SELECT * FROM sys.schema_unused_indexes;
```

坑：删索引前先确认没有 `FORCE INDEX` 提示、没有依赖它的唯一约束、没有覆盖索引带来的免回表收益。

---

### Q96. 归档和冷热分离怎么做？【高】

**热数据**（近 3 个月）在主库，**温数据**（3~12 个月）在归档库，**冷数据**（1 年以上）进对象存储或数仓。

三种落地方式：

| 方式 | 适用 | 风险 |
|---|---|---|
| 按时间分区 + `DROP PARTITION` | 有天然时间维度 | 需改造表结构 |
| 归档表 + 分批 `DELETE` | 改造小 | 删除产生大量 binlog 与碎片 |
| 逻辑同步到历史库后删除 | 灵活 | 一致性校验成本高 |

```sql
-- 分批删除，每批 5000 行，避免长事务和主从延迟
DELETE FROM orders WHERE created_at < '2025-01-01' ORDER BY id LIMIT 5000;
```

坑：一次性 `DELETE` 几千万行会撑爆 undo、产生巨大 binlog、主从延迟飙升，还可能把表锁住。**必须分批 + sleep**。

---

### Q97. 一个库「撑不住」了，先扩容还是先优化？【中】

先做**低成本高收益**的优化，再考虑架构级扩容。判断顺序：

1. 慢查询占比多少？能不能通过索引消掉 30% 以上？
2. 是不是热点集中？能不能加缓存、读写分离？
3. 单表多大？超过 **2000 万行 / 50 GB** 再谈分表
4. 写入是否是瓶颈？分表对写扩展有效，读扩展优先加从库
5. 以上都做过还撑不住，才上分库分表或换引擎

```bash
# 快速看当前压力来源：CPU 高还是 IO 高
iostat -x 1 3
top -H -p $(pgrep -f mysqld | head -1)
```

答题要点：**分库分表是最后一招**，因为它带来跨库事务、分布式 ID、聚合查询、扩容迁移四座大山。先证明优化走到尽头。

---

## 十五、数据迁移与变更发布

### Q98. 大表结构变更有哪些方案？分别适合什么场景？【中】

| 方案 | 原理 | 适合 | 代价 |
|---|---|---|---|
| `ALGORITHM=INPLACE` | 8.0 原生 online DDL | 加索引、改注释、加列（部分） | 仍需短暂元数据锁 |
| `gh-ost` | 影子表 + binlog 回放 | 大表、高写入 | 需要额外磁盘与切换窗口 |
| `pt-osc` | 影子表 + 触发器 | 大表、写入一般 | 触发器有额外开销 |
| 主从切换法 | 先在从库改，再切主 | 允许切换的窗口 | 需要可靠的高可用 |

```sql
ALTER TABLE orders ADD COLUMN remark VARCHAR(255) NULL, ALGORITHM=INPLACE, LOCK=NONE;
```

**加列注意**：`NOT NULL` 且无默认值在旧版本会锁表；8.0 的 instant add column 只支持加在**最后一列**。

坑：`LOCK=NONE` 不等于零影响——元数据锁在开始和结束时仍会短暂申请，长事务未提交时会**把整个表堵住**，上线前先查 `information_schema.innodb_trx`。

---

### Q99. 数据迁移怎么校验？双写怎么做？【中】

双写三阶段，缺一段就会丢数据：

1. **双写**：新老库同时写，以老库为准，新库失败只记日志不影响主流程
2. **双读比对**：抽样读新库与老库比对，差异率降到阈值以下
3. **切读 → 停双写**：读切到新库，观察一段时间后停掉老库写入

校验手段：

```sql
-- 分段对账，避免全表扫描
SELECT COUNT(*), SUM(amount), MAX(id) FROM orders WHERE id BETWEEN 1 AND 100000;
```

- 行数、关键字段求和、主键区间最大值三项对齐才算通过
- 用 `CHECKSUM TABLE` 或业务级指纹（`MD5(CONCAT_WS(...))`）抽样比对
- **差异必须能解释**（时区、字符集、默认值、精度截断是四大元凶）

答题要点：迁移的验收标准不是「能跑通」，而是「差异可解释、可回滚、可对账」。

---

### Q100. 跨库跨实例迁移怎么做？【中】

按数据量和停机容忍度选路线：

- **停机迁移**：停写 → dump/restore 或物理拷贝 → 校验 → 切流量。简单、可控，适合几十分钟窗口
- **不停机迁移**：全量快照 + 增量追平（binlog/DTS/Canal）→ 追到延迟接近 0 → 短时禁写 → 切流量
- **同构库**优先物理备份（XtraBackup / pg_basebackup），**异构库**（MySQL→PG）只能逻辑迁移 + 类型映射

```bash
# 全量导出（一致性快照，不加锁）
mysqldump -h old -u root -p --single-transaction --master-data=2 \
  --set-gtid-purged=ON app > app.sql
```

坑：`--master-data=2` 记下的位点是**导出的那一刻**，从它开始追 binlog 才不丢不重；字符集不同（`utf8` vs `utf8mb4`）会在迁移后才发现 emoji 全变问号。

---

### Q101. 停机迁移和不停机迁移怎么选？【中】

判断只有两个变量：**能容忍多长停机**、**数据能不能追平**。

- 停机迁移：窗口内完成，成功后切 DNS/VIP。风险集中但可控，回滚就是切回去
- 不停机迁移：新老库并行，风险分散但周期长，任何一个环节的一致性漏洞都会在切换瞬间爆发

必须准备的兜底：

1. **回滚预案**要有具体命令和判定条件（延迟 > 30 秒、错误率 > 0.5% 就回滚）
2. 老库**至少保留一个完整业务周期**再下线，别切完就删
3. 切换窗口选低峰，且提前通知相关方

答题要点：能停机就停机——**不停机迁移的复杂度是停机迁移的 5 倍**，别为了面子选难的路。

---

### Q102. 变更评审和回滚脚本该怎么做？【中】

评审要能回答：改什么、影响谁、怎么验证、怎么退。

- **变更单必须含回滚脚本**，且回滚脚本要**在预发环境实测过**，没测过的回滚等于没有
- DDL 与 DML 分开，先 DDL 后 DML，脚本必须**可重复执行**（`IF NOT EXISTS`）
- 数据订正类变更必须有 `WHERE` 边界和影响行数预估，`SELECT` 验证后再 `UPDATE`
- 高风险变更（大表 DDL、批量删数据）安排**双人复核 + 有人值守**

```sql
-- 变更前先固化影响范围
SELECT COUNT(*) FROM orders WHERE status = 0 AND created_at < '2026-01-01';
```

坑：回滚脚本只回滚了表结构没回滚数据，或者只写了 `DROP COLUMN` 却忘了列里已经有新写入的数据——**回滚前先备份被改动的数据**。

---

### Q103. DDL 变更和业务发布的顺序怎么定？【中】

核心原则：**先兼容，后切换，最后清理**。

1. **加字段/加表**：DDL 先行，老代码无感
2. **改字段语义**：先双写（新老字段都写）→ 切读 → 停写老字段 → 删老字段（分多次发布）
3. **删字段/删表**：先发代码停止使用 → 观察一个周期 → 再删结构
4. **改字段类型/长度**：先扩后缩，缩之前确认数据已收敛

```text
发布顺序示例（字段重命名）：
1. DDL: 新增 new_col
2. 代码: 双写 old_col + new_col
3. 代码: 读切换到 new_col
4. 数据: 回填历史数据并校验
5. 代码: 停写 old_col
6. DDL: 删除 old_col
```

答题要点：**任何时候都要保证老代码 + 新表结构、新代码 + 旧表结构都能跑**，这是滚动发布不炸的前提。

---

### Q104. 数据一致性核对怎么长期做？【高】

一次性对账只能证明当时一致，**持续对账**才能防回归。

分层设计：

- **实时层**：binlog 订阅做准实时比对，发现差异立即告警
- **准实时层**：按主键区间分批比对，用 `id > last_id LIMIT 10000` 游标推进，不锁表
- **离线层**：T+1 跑全量对账，产出差异明细表和修复脚本

```sql
-- 游标式分批，避免深分页
SELECT id, amount FROM orders WHERE id > 0 ORDER BY id LIMIT 10000;
```

差异处理：**先记录后修复**，修复走正常变更流程（有审计、有回滚），不要写个脚本直连数据库 `UPDATE` 完事。

坑：对账任务自己把主库压垮——务必走从库、限速、错峰，并给比对查询加超时。

---

## 十六、数据库运维速记卡

### 端口与默认路径速查

| 组件 | 默认端口 | 数据目录 | 配置文件 |
|---|---|---|---|
| MySQL | 3306 | `/var/lib/mysql` | `/etc/my.cnf` |
| PostgreSQL | 5432 | `/var/lib/pgsql/data` | `/var/lib/pgsql/data/postgresql.conf` |
| Redis | 6379 | `/var/lib/redis` | `/etc/redis/redis.conf` |
| MongoDB | 27017 | `/var/lib/mongo` | `/etc/mongod.conf` |
| Elasticsearch | 9200 / 9300 | `/var/lib/elasticsearch` | `/etc/elasticsearch/elasticsearch.yml` |
| 哨兵 | 26379 | — | `sentinel.conf` |
| MySQL 复制 | 3306 | — | — |

### 必记命令速查

```bash
# MySQL
mysql -h host -u user -p -e 'SHOW PROCESSLIST'      # 在线连接、看会话
mysqldump --single-transaction --master-data=2 app > app.sql
mysqladmin -uroot -p status                          # QPS/线程数快照

# 物理备份与恢复
xtrabackup --backup --target-dir=/backup/full --user=root
xtrabackup --prepare --target-dir=/backup/full

# PostgreSQL
psql -c 'SELECT pid, state, query FROM pg_stat_activity;'
pg_basebackup -h master -D /data/base -Ft -z -P

# Redis / Mongo / ES
redis-cli INFO stats
mongostat --host rs0/10.0.0.1:27017
curl -s 'http://10.0.0.1:9200/_cluster/health?pretty'
```

### 线程状态与锁等待对照

| 现象 | 常见 `State` | 含义与动作 |
|---|---|---|
| 连接多但 CPU 不高 | `Sleep` | 连接池没回收，调 idle 与 lifetime |
| 一直等 | `Waiting for table metadata lock` | 有长事务/未提交事务挡住 DDL，找 `innodb_trx` |
| 一直等 | `Waiting for table flush` | 有长查询或 `FLUSH TABLES` 冲突 |
| 一直等 | `Waiting for global read lock` | 有人在 `FTWRL` 做备份 |
| 占着不动 | `Sending data` | 别被名字骗了，实际在执行/读数据 |
| 排队 | `Locked` | 行锁冲突，查 `innodb_lock_waits` |

```sql
-- 一条 SQL 找出阻塞链
SELECT waiting_pid, blocking_pid, wait_age, locked_table
FROM sys.innodb_lock_waits;
```

### 常见报错对照表

| 报错 | 原因 | 处置 |
|---|---|---|
| `Too many connections` | 连接数打满 | 查 `processlist` 归因，临时调 `max_connections` |
| `Lock wait timeout exceeded` | 行锁等待超时 | 找阻塞源 `KILL`，缩短事务 |
| `Deadlock found` | 加锁顺序不一致 | 应用捕获重试 + 统一加锁顺序 |
| `Disk full` | 磁盘满 | 清 binlog、归档分区，别手删数据文件 |
| `Slave_SQL_Running: No` | 复制中断 | 看 `Last_SQL_Error`，跳过或重做 |
| `ERROR 1045 Access denied` | 认证失败 | 检查 `user@host` 具体匹配与授权 |
| `ERROR 1114 table is full` | 临时表空间满 | 调 `tmp_table_size`/`internal_tmp_disk_storage_engine` |
| `max_buckets exceeded` | ES 聚合桶超限 | 缩小范围或预聚合 |

### 必记参数

```ini
# my.cnf 考前必背
innodb_buffer_pool_size = 物理内存的 50%~70%
innodb_log_file_size = 1~2 GB（8.0 用 innodb_redo_log_capacity）
innodb_flush_log_at_trx_commit = 1   # 不丢数据；2 牺牲 1 秒换性能
sync_binlog = 1                       # 与上一行并称「双 1」
max_connections = 500
long_query_time = 1
binlog_format = ROW
transaction_isolation = REPEATABLE-READ
```

```yaml
# PostgreSQL 常调项
shared_buffers: 物理内存 25%
work_mem: 4MB~64MB
maintenance_work_mem: 1GB
max_connections: 300        # 再往上要靠 pgbouncer
wal_level: replica
```

```yaml
# Redis 关键项
appendonly: yes             # AOF；appendfsync everysec
maxmemory: 物理内存 75%
maxmemory-policy: allkeys-lru
```

### 一句话速答

- **双 1 是什么**：`innodb_flush_log_at_trx_commit=1` + `sync_binlog=1`，保证不丢已提交事务
- **为什么用 B+ 树**：矮胖、一次 IO 多个节点、叶子链表适合范围扫描
- **回表和覆盖索引**：二级索引查不到全部列就去主键树再查一次；索引里含全部所需列则免回表
- **间隙锁何时出现**：RR 隔离级别下对非唯一索引等值/范围查询会锁间隙，RC 下基本不锁
- **主从延迟怎么治**：并行复制 + 大事务拆分 + 从库独立 IO + 关键读走主库
- **RPO 与 RTO**：RPO 是能丢多少数据，RTO 是多久能恢复；备份方案由这两个指标反推
- **缓存三大问题**：穿透（查不存在）、击穿（热点过期）、雪崩（大批同时过期）
- **为什么不用 `KEYS *`**：单线程全量扫描，阻塞所有请求，用 `SCAN` 游标替代
- **分库分表的代价**：跨库事务、分布式 ID、聚合查询、扩容迁移
- **ES 为什么不能当主库**：近实时（默认 1 秒 refresh）、无事务、更新代价高
