# DreamArchive 项目改进分析

生成时间：2026-06-03  
分析范围：当前 `master` 分支，最近提交 `052bd72 docs: 更新 README 接口清单和安全设计，application.properties.example 补全 CORS/Auth 配置`  
目标：从安全、后端、前端、数据、AI、测试、部署、产品体验等方面，梳理下一阶段最值得改进的事项。

> 说明：本文不复述任何真实密钥、邮箱授权码、服务器账号、数据库密码或 API Key。若本地文件中出现真实凭据，应立即移除并轮换。

## 1. 总体判断

DreamArchive 已经不是一个只有 CRUD 的练手项目，核心功能基本成型：账号系统、梦境记录、AI 解析、游客模式、图片上传、统计、管理员后台、AI provider 池化、CORS 集中配置、错误信息隐藏、安全响应头、`analysis_status` 状态字段等都已经接入。

现在最重要的改进方向不是继续堆新页面，而是把项目从“能跑、能展示”推进到“可安全上线、可持续维护、可稳定扩展”：

1. 先处理敏感信息、Token 存储、权限一致性和数据库迁移问题。
2. 再补测试、CI、部署资产和监控。
3. 然后完善 AI 解析可靠性、统计正确性和用户体验。
4. 最后再做更高级的产品功能，例如导出、标签、搜索增强、隐私设置、分析反馈闭环。

## 2. 已验证状态

本次分析实际执行过以下验证：

| 项目 | 结果 | 说明 |
|---|---|---|
| 后端编译 | 通过 | 设置 `JAVA_HOME=C:\Program Files\Java\jdk-17.0.4.1` 后，`mvn -DskipTests compile` 成功 |
| 后端测试 | 通过 | `mvn test` 通过，当前 11 个测试 |
| 前端构建 | 通过 | `npm run build` 成功 |
| 前端脚本测试 | 通过 | `npm run test:analysis-status` 成功 |

注意：第一次后端编译失败原因是当前 shell 使用的是 JRE 而不是 JDK，提示没有 Java 编译器。这不是源码问题，但说明本地构建环境需要固定化。

## 3. 最高优先级问题

这些建议应优先处理，因为它们直接影响安全、部署和权限正确性。

| 优先级 | 问题 | 风险 | 建议 |
|---|---|---|---|
| P0 | 仓库代码中存在硬编码 AI API Key | 如果已提交或被复制，Key 可能泄露并被滥用 | 立即从 `src/test/java/.../main.java` 移除，轮换该 Key，并把这类手动测试文件移出源码树 |✅️
| P0 | 未跟踪的 `docker-compose.yml`、`.env.example` 中有真实感很强的默认凭据 | 一旦误提交，数据库、MinIO、邮箱凭据会泄露 | 不要提交真实默认值；改为占位符；若这些值使用过，立即轮换 |❗️
| P0 | 前端 Token 仍存在 `localStorage` | XSS 后 Token 容易被读取，前端 15 分钟会话过期不能让后端 Token 失效 | 完成 `feat/httponly-cookie`：HttpOnly Cookie + SameSite + CSRF 防护 + 后端 Cookie 登录/退出 |✅️
| P0 | 数据库迁移缺少统一来源 | 新环境部署容易漏 `avatar_url`、`analysis_status`、`image_url` 等字段 | 引入 Flyway 或 Liquibase，建立完整 baseline 和增量迁移 |
| P1 | `SUPER_ADMIN` 权限判断不一致 | Spring Security 允许 `SUPER_ADMIN`，但部分业务方法只认 `ADMIN` | 统一角色判断工具，修复 Dream/Stats 等 Controller 的管理员判断 |

## 4. 安全与隐私

### 4.1 Token 与会话

当前前端在 `fount/src/utils/authHeader.ts` 和 `fount/src/stores/index.ts` 中读取、保存 `authToken` 到 `localStorage`。这套方案开发方便，但生产安全性有限。

建议：

1. 登录后由后端写入 HttpOnly Cookie，前端不再接触 Token 字符串。
2. Cookie 使用 `HttpOnly; Secure; SameSite=Lax`，跨站部署时根据实际域名评估 `SameSite=None`。
3. 开启 CSRF 防护。迁移到 Cookie 后不能继续简单关闭 CSRF，需要双提交 Cookie 或 CSRF Token。
4. 后端增加退出登录接口，必要时做 Token 版本号或服务端会话表，实现主动失效。
5. 对齐前端 15 分钟会话和后端 `app.auth.ttl-seconds`，避免前端退出后后端 Token 仍长时间有效。

### 4.2 凭据治理

已发现两类敏感信息风险：

1. `src/test/java/com/yiweilai/DreamArchive/main.java` 中存在硬编码 AI API Key。
2. 未跟踪的部署文件中存在数据库、MinIO、邮件等真实感很强的默认值。

建议：

1. 所有真实凭据只放本机 `.env`、服务器环境变量或密钥管理系统。
2. `.env.example` 只能写占位符，例如 `CHANGE_ME`，不能写可用密码。
3. 增加 secret scanning，例如 Gitleaks、TruffleHog 或 GitHub secret scanning。
4. 如果这些凭据已被使用过，即使未提交，也建议轮换。

### 4.3 登录、验证码与接口限流

验证码发送已有 Redis 60 秒频率限制，但还缺更完整的攻击防护。

建议：

1. 密码登录增加失败次数限制，按 IP、账号、邮箱组合限流。
2. 注册、登录验证码、重置密码、游客 AI 分析都加 IP 维度限制。
3. 减少账号枚举信息，例如登录时不要明确区分“用户不存在”和“密码错误”；重置密码可以返回统一提示。
4. 邮件发送人不要在代码中硬编码，改为读取 `spring.mail.username` 或单独的 `app.mail.from`。
5. 验证码校验失败也应计数，防止暴力猜 6 位码。

### 4.4 安全响应头与公开接口

项目已经加入 CSP、Frame Options、Content-Type Options、Referrer Policy，这是好方向。

继续改进：

1. 生产环境限制 Swagger UI 和 `/v3/api-docs`，不要默认对公网开放。
2. CSP 当前 `connect-src`、`img-src` 范围较宽，生产部署后应收敛到明确域名。
3. 如果前端不使用 Google Fonts，可去掉外部字体域名，减少 CSP 例外。
4. 文件上传除了 content-type 和 magic bytes，还可以增加图片尺寸限制、重编码、去除 EXIF 元数据。

### 4.5 梦境内容隐私

梦境内容、AI 解读和图片都属于高度私密数据，安全要求应高于普通笔记。

建议：

1. 增加用户数据导出和永久删除能力。
2. 明确隐私说明：梦境内容会发送给第三方 AI provider。
3. 可选：对 `dream_content.content`、`interpretation` 做字段级加密，至少为生产环境保留方案。
4. 管理员查看用户梦境应有审计日志，避免后台权限过大但无记录。

## 5. 后端架构与 API

### 5.1 Controller 参数模型

多个接口仍使用 `@RequestBody Map<String, Object>` 或 `Map<String, String>`，例如登录、梦境保存、游客分析、改密码等。

问题：

1. 缺少类型约束，字段名写错不容易发现。
2. 参数校验散落在 Controller 内。
3. Swagger/OpenAPI 文档无法准确表达请求结构。
4. 前后端类型更容易漂移。

建议：

1. 为每个接口建立请求 DTO，例如 `DreamSaveRequest`、`GuestAnalyzeRequest`、`LoginRequest`。
2. 使用 `jakarta.validation` 注解做统一校验。
3. Controller 只负责接收参数、调用 Service、返回结果。
4. 对复杂字段使用枚举，例如 `AnalysisStatus`、`UserRole`、`UserStatus`。

### 5.2 权限判断统一

目前 Spring Security 中 `/api/admin/**` 允许 `ADMIN` 和 `SUPER_ADMIN`，但 `DreamController`、`StatsController` 的 `isAdmin` 只认 `ADMIN`。这会造成超级管理员在部分非 admin 路径中无法按管理员身份访问数据。

建议：

1. 抽出 `CurrentUserService` 或 `SecurityContextUtil`。
2. 统一 `isAdminLike(user)`：`ADMIN` 和 `SUPER_ADMIN` 都视为管理员权限。
3. 尽量使用 Spring Security 上下文，不要在 AdminService 里重复解析 Authorization Header。
4. 对关键权限规则补单元测试和 MockMvc 测试。

### 5.3 管理员接口重复认证

`AdminController` 已经处于 `/api/admin/**`，Spring Security 会先做认证和角色检查，但 `AdminService` 又手动解析 Authorization Header。这会让认证逻辑重复、增加迁移到 Cookie 的成本。

建议：

1. AdminService 从 `SecurityContextHolder` 获取当前用户，或由 Controller 注入 `Authentication`。
2. 删除手动传 `Authorization` header 的业务参数。
3. 前端 `fount/src/api/admin.ts` 改用共享 axios 实例，不要直接 `import axios from 'axios'` 手动拼 token。

### 5.4 统计口径

`StatsService.getDreamStats()` 当前用最近 7 天统计表求 total，`getTotalDreams()` 用最近 365 天统计表求 total。这和“总梦境数”的语义不一致。✅️

建议：

1. 总数直接查 `dream_content` 或统计全量汇总，不要用最近 N 天代替。
2. 趋势图保留 N 天口径，并补齐没有梦境的日期为 0。
3. 情绪分布明确是“最近 365 天”还是“全部数据”。
4. 增加统计重建任务，用于修复历史数据和统计表漂移。

### 5.5 异步任务可靠性

当前 AI 解析使用 `@Async` 线程池，适合轻量场景，但任务没有持久化队列。服务重启、线程池满、进程崩溃时，`PENDING` 状态可能长期停留。

建议：

1. 给 `PENDING` 任务增加超时扫描和自动重试。
2. 记录 `analysis_started_at`、`analysis_completed_at`、`analysis_attempts`。
3. 中期引入 Redis Stream、数据库任务表或消息队列，保证任务可恢复。
4. 前端展示失败原因和“重新解析”入口。

### 5.6 依赖注入与代码风格

大量类仍使用字段注入 `@Autowired`。功能上能跑，但不利于测试和构造约束。

建议：

1. 新代码统一使用构造器注入。
2. 旧代码可以按模块逐步迁移，不必一次性全改。
3. 清理无用 import、重复 import 和小语法噪音，例如 `java.util.*;;`。
4. 删除未使用依赖：`unirest-java`、`qianfan` 当前未发现代码引用。

## 6. 数据库与迁移

### 6.1 迁移管理

当前数据库资产分散：

1. `dream.sql` 是旧导出，不包含所有最新字段。
2. `src/main/resources/db/*.sql` 是补丁式脚本。
3. 未跟踪的 `sql/init.sql` 看起来更完整，但未纳入版本管理。
4. `loginMapper.xml` 使用 `avatar_url`，但 `src/main/resources/db` 没有对应补丁。

建议：

1. 使用 Flyway：`V1__baseline.sql`、`V2__admin_status.sql`、`V3__analysis_status.sql`、`V4__avatar_url.sql`。
2. 删除或标记旧 `dream.sql`，避免部署时执行过时脚本。
3. 所有字段变更必须有迁移文件和回滚说明。
4. 数据库结构测试不只检查一个字段，而是校验 mapper 使用的关键列都存在。

### 6.2 表结构与索引

建议补充：

1. `dream_content` 增加组合索引 `(user_id, created_at)`，列表和统计常用。
2. 搜索可考虑 MySQL FULLTEXT 或专门的搜索字段，避免 `%keyword%` 在数据量大后全表慢查。
3. `dream_content.user_id`、统计表 `user_id` 建议加外键或至少建立应用层一致性检查。
4. `analysis_status` 可使用 check constraint 或枚举约束，避免脏状态。
5. 删除用户时明确处理用户梦境：保留、匿名化、软删还是级联删除。

### 6.3 统计一致性

新增梦境时同步更新统计表，删除时重建对应日期和地点，这是合理的预计算思路。但统计表未来容易和主表漂移。

建议：

1. 增加手动/定时统计重建接口，仅管理员可用。
2. 增加每日对账任务：对比 `dream_content` 与统计表结果。
3. 统计查询返回口径写清楚：全部、最近 365 天、最近 7 天。

## 7. AI 解析与 provider 池

### 7.1 池化能力持久化

AI provider 池现在支持运行时增删改、权重、熔断和延迟感知，但运行时修改重启后丢失。

建议：

1. 建立 `ai_provider_config` 表，保存 name、url、model、weight、enabled、用途等配置。
2. API Key 加密存储或只允许通过环境变量引用。
3. 管理端修改 provider 后持久化，重启自动恢复。
4. 运行时状态如 failCount、latency、circuitOpen 可以单独作为状态，不一定持久化。

### 7.2 可观测性

AI 目前有日志，但缺少面向管理端的指标。

建议：

1. 记录 provider 维度的成功率、失败率、平均耗时、最近错误、请求次数。
2. 增加模型成本估算：输入/输出 token、每日消耗、游客消耗。
3. 管理后台显示 provider 健康状态和最近心跳时间。
4. 失败原因内部记录详细信息，给用户显示友好文案。

### 7.3 输出稳定性

AI 输出目前靠 prompt 约束。为了前端展示和长期质量，建议引入结构化输出策略。

建议：

1. 让 AI 返回固定 JSON 或固定段落结构，后端校验后再保存。
2. 保存 prompt version 和 model name，便于以后比较不同 prompt 效果。
3. 增加用户反馈：有用/无用、重新生成、偏情绪/偏象征/偏现实建议。
4. 对图片分析增加图片压缩和尺寸限制，避免大图导致成本和超时失控。

## 8. 前端工程与体验

### 8.1 文件体积和组件拆分

当前几个 Vue 单文件组件很大：

| 文件 | 行数 |
|---|---:|
| `AdminView.vue` | 2490 |
| `RecordDreamView.vue` | 1636 |
| `HomeView.vue` | 1181 |
| `DreamListView.vue` | 1140 |

建议：

1. `AdminView` 拆成用户表、梦境表、分页、用户弹窗、详情弹窗、确认弹窗。
2. `RecordDreamView` 拆成桌面布局、移动向导、表单字段、AI 状态、图片上传。
3. 公共按钮、输入框、提示条、分页组件抽出来，统一风格和行为。
4. 拆分时先补测试或至少保留构建验证，避免 UI 行为回退。

### 8.2 API 层统一

`api/axios.ts` 已有共享实例，但 `api/admin.ts` 直接使用原始 axios 并手动传 token。

建议：

1. 所有 API 模块统一使用共享 axios 实例。
2. 错误处理不要所有 400/500 都跳错误页，表单错误应该留在当前页面展示。
3. API 返回类型与后端 DTO 对齐，减少 `any`。
4. 中期可用 OpenAPI 生成 TypeScript 类型。

### 8.3 登录态和用户信息

当前 Pinia 状态大量依赖 localStorage，迁移 Cookie 后需要重构。

建议：

1. 登录后调用 `/api/me` 获取当前用户，而不是长期依赖本地缓存。
2. 本地只保存非敏感偏好，例如主题、最近页面。
3. 401 后统一清理状态并跳转登录。
4. `role` 类型需要包含 `SUPER_ADMIN`，当前部分类型只写了 `USER | ADMIN`。

### 8.4 可访问性与移动体验

主功能页风格完整，但可以进一步产品化：

1. 表单控件补 `label`、`aria`、错误提示关联。
2. 按钮 loading 状态避免重复提交。
3. 移动端长文本和 AI 解析结果增加折叠、复制、重新生成。
4. 梦境列表支持日期筛选、情绪筛选、地点筛选、仅看未解析/失败。
5. 记录页游客模式增加剩余次数提示和登录同步状态。

## 9. 管理后台

管理员后台已具备基础用户管理和梦境查看，但还可以更像真正的运营后台。

建议：

1. 增加操作审计：谁在什么时候封禁、解封、编辑、删除了哪个用户。
2. 超级管理员和普通管理员权限分层：谁能创建管理员、谁能修改 provider、谁能查看梦境详情。
3. AI provider 管理前端需要和后端接口打通，显示运行时健康状态。
4. 梦境详情显示 `analysis_status`、`analysis_error`、图片、重新解析入口。
5. 搜索建议加更多筛选条件，而不是只靠关键词。

## 10. 测试与质量保障

当前测试状态：后端 11 个测试通过，前端只有一个 analysis status 脚本测试。测试能证明最近几个工具函数没问题，但还不足以保护主要业务。

建议优先补这些测试：

1. `TokenService`：过期、签名错误、格式错误、角色解析。
2. `TokenAuthenticationFilter`：删除用户、封禁用户、无 Token、非法 Token。
3. 登录/注册/重置密码：验证码成功、失败、过期、频率限制。
4. `DreamController`：用户只能访问自己的梦境，管理员/超级管理员权限一致。
5. `StatsService`：总数、最近趋势、删除后重建统计。
6. `AiProviderPool`：权重分配、熔断、半开恢复、指定 provider。
7. 前端：使用 Vitest 测 utils/store，使用 Playwright 测登录、记录梦境、AI 状态轮询、管理员页面。
8. 数据库：用 Testcontainers 或 H2 不足时用 MySQL 容器，验证 mapper 和迁移脚本。

CI 建议：

1. 后端：`mvn test`。
2. 前端：`npm ci && npm run build && npm run test:analysis-status`。
3. 安全：secret scan。
4. 依赖：Maven/npm 依赖审计。
5. 只在测试通过后允许部署。

## 11. 部署与运维

### 11.1 Docker 与 compose

当前已跟踪的 `compose.yaml` 只有 `services:`，是空壳；未跟踪的 `docker-compose.yml` 比较完整，但含真实感很强的默认凭据，不能直接提交。

建议：

1. 决定保留哪个 compose 文件，删除空壳或改成完整开发环境。
2. 所有默认密码改为占位符，不提供可用默认密码。
3. 后端 Dockerfile 可以改成多阶段构建，或明确要求先 `mvn package`。
4. 前端可增加 Nginx 静态镜像，或者在部署文档里只保留手工部署方案。
5. docker-compose 只用于本地开发时，明确不要暴露 MySQL/Redis/MinIO 到公网。

### 11.2 配置和环境

建议：

1. 固定本机 JDK 环境，避免 Maven 使用 JRE。
2. 增加 `.env.example` 安全模板。
3. `application.properties.example` 已补全 CORS/Auth，这很好；后续继续保持真实配置不入库。
4. Redis、MySQL、MinIO、邮件、AI provider 都应支持环境变量覆盖。

### 11.3 监控和日志

建议：

1. 引入 Spring Boot Actuator，开放受控的 `/actuator/health`。
2. 增加请求 ID/correlation ID，方便排查一次请求的完整链路。
3. AI provider 失败、邮件失败、上传失败、异步任务失败都要有可检索日志。
4. 生产环境配置 logrotate，避免日志打满磁盘。
5. 数据库和 MinIO 做定期备份，并实际演练恢复。

## 12. 产品功能建议

这些不是立即上线必须，但能显著提升产品完整度。

### 12.1 梦境记录体验

1. 梦境标签：人物、主题、场景、重复梦、清醒梦等。
2. 日历视图：按日期查看梦境和情绪。
3. 高级搜索：时间、情绪、地点、关键词、是否有图片、解析状态。
4. 草稿能力：写到一半自动保存。
5. 导出能力：按时间导出 Markdown/PDF/JSON。

### 12.2 AI 体验

1. 重新解析时允许选择风格：温和陪伴、象征分析、现实启发、简短总结。
2. 增加“这条分析是否有帮助”的反馈按钮。
3. 解析结果保留历史版本，避免新结果覆盖旧结果。
4. 明确标注“AI 解析不是医学诊断或心理治疗建议”。
5. 对游客显示剩余 AI 次数，减少突然 403 的挫败感。

### 12.3 统计体验

1. 情绪趋势不只看数量，也看情绪变化。
2. 地点、时间段、关键词云可以作为长期洞察。
3. 连续记录天数可配合徽章，但不要过度游戏化。
4. 给用户提供“本周梦境回顾”摘要。

## 13. 文档与协作

当前文档很多，且 `.gitignore` 忽略 `*.md`，但 README 仍被跟踪。需要明确哪些文档应入库，哪些只是本地笔记。

建议：

1. README 保留项目介绍、安装、运行、接口摘要。
2. `docs/DEPLOYMENT.md` 保留部署步骤，但不要写真实服务器信息。
3. `docs/AI-POOL.md` 保留 AI 池设计和运维说明。
4. 本地协作笔记继续放 AGENTS/CLAUDE/桌面笔记，不提交。
5. 对“上传 GitHub 不要加入所有 .md 文档文件”的规则做一次明确清单，避免误删 README 或必要 docs。

## 14. 建议路线图

### 第一阶段：安全和部署打底（1-3 天）

1. 移除硬编码 API Key、清理未跟踪部署文件中的真实凭据、轮换已使用凭据。
2. 补 `avatar_url` 迁移，统一数据库 baseline。
3. 修复 `SUPER_ADMIN` 权限判断不一致。
4. 管理端 API 统一使用共享 axios，后端 AdminService 不再重复解析 Token。
5. 固定本地 JDK 构建配置。

### 第二阶段：认证升级和质量保障（3-7 天）

1. 完成 HttpOnly Cookie 分支。
2. 增加 CSRF 防护和 `/api/me`。
3. 补后端核心单元测试和权限测试。
4. 建立 CI：后端测试、前端构建、secret scan。
5. 引入 Flyway/Liquibase。

### 第三阶段：AI 与统计稳定性（1-2 周）

1. AI 异步任务增加超时扫描、重试、尝试次数和完成时间。
2. Provider 配置持久化，管理端显示健康指标。
3. 修正统计口径，补齐趋势空日期。
4. 增加统计重建和对账任务。
5. 增加 AI prompt version 和输出结构化。

### 第四阶段：前端产品化（1-2 周）

1. 拆分大型 Vue 文件，建立公共 UI 组件。
2. 改善错误处理，不让普通表单错误跳全局错误页。
3. 增加高级搜索、筛选、导出、日历视图。
4. 提升移动端记录和详情体验。
5. 增加 Playwright E2E。

## 15. 不建议现在做的事

1. 不建议现在拆微服务。项目规模还没到需要微服务的程度，先把单体架构做稳。
2. 不建议现在上 Kubernetes。当前更需要 Docker Compose、systemd、Nginx、备份和监控。
3. 不建议重写前端技术栈。Vue 3 + TypeScript 已够用，重点是拆组件和补测试。
4. 不建议继续无边界加功能。先解决安全、迁移、测试、部署和权限一致性。

## 16. 最小可执行清单

如果只挑最短的一批任务，建议按这个顺序：

1. 移除并轮换硬编码 AI API Key。
2. 清理 `.env.example` 和未跟踪 `docker-compose.yml` 中的真实凭据。
3. 补 `avatar_url` 数据库迁移，建立正式迁移体系。
4. 修复 `SUPER_ADMIN` 在 Dream/Stats 接口中的权限判断。
5. Admin 前端改用共享 axios，后端改用 SecurityContext。
6. 完成 HttpOnly Cookie 迁移。
7. 给登录、验证码、游客分析补限流。
8. 补核心测试并建立 CI。
9. 修正统计总数口径。
10. 给 AI 异步任务加超时重试和状态恢复。

