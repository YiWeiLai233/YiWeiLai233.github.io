# DreamArchive 开发记录

Dream Archive - Spring Boot 3.5.7 + MyBatis + MySQL，Java 17。Vue 3 + TypeScript 前端。

**当前状态：核心功能已可用，AI 池化已接入。**

- 用户注册/登录（验证码登录、密码登录）
- 梦境记录、AI 解析（多 provider 池化）
- 管理员控制台
- 统计图表

---

## 项目结构

```text
src/main/java/com/yiweilai/DreamArchive/
├── controller/    # Controller (LoginController, RegisterController, ChangePasswordController,
│                  #   ResetPasswordController, AdminController, DreamController, StatsController,
│                  #   UserController, AiPoolController)
├── service/       # Service (LoginService, RegisterService, AdminService, AiService,
│                  #   AiProviderPool, DreamService, DreamAiTaskService, StatsService, TokenService,
│                  #   ResetPasswordService, VerificationCodeService)
├── mapper/        # Mapper (LoginMapper, RegisterMapper, AdminMapper, DreamContentMapper,
│                  #   DreamStatsMapper, StatsMapper, ResetPasswordMapper, DreamMapper)
├── DTO/           # DTO (User, LoginResponse, DreamContent, DreamStats, AdminOverview, AiProvider 等)
├── config/        # Config (SecurityConfig, TokenAuthenticationFilter, SecurityPaths,
│                  #   WebConfig, AsyncConfig, GlobalExceptionHandler)
└── util/          # Util (Result, PasswordEncrypt, CaptchaGenerator)
src/main/resources/
├── mapper/        # MyBatis XML
├── db/            # admin_role_patch.sql, admin_user_status_patch.sql
└── application.properties
frontend/             # Vue 3 + TS + Vite 前端，12 个 View 组件
```

## 核心表结构

| 表 | 用途 | 主键 |
|---|---|---|
| `user` | 用户表 (id, username, password, email, role, status, deleted, created_at) | INT 自增 |
| `dream_content` | 梦境主表 (id, user_id, title, content, emotion, place, time, interpretation, created_at) | UUID varchar(36) |
| `dream_stats` | 每日情绪统计 (user_id, stat_date, 各情绪计数) | INT 自增，uk_user_date 唯一 |
| `dream_place_stats` | 地点统计 (user_id, place, dream_count) | INT 自增，uk_user_place 唯一 |

**关键规则**：所有新梦境数据写入 `dream_content`，统计 SQL 查 `dream_content` 或预计算表。

---

## 已完成功能

### 用户系统

- 注册（验证码强制校验）
- 登录（密码 + 验证码双模式，新用户自动注册+设置弹窗）
- 修改密码（需验证码）
- 重置密码（多步流程）
- Token 认证（HMAC-SHA256）
- Session 超时（前端 15 分钟）

### 梦境系统

- 保存梦境 + 异步 AI 解析
- 梦境列表 + 搜索 + 详情
- 删除梦境
- AI 解析结果自动轮询刷新

### AI 资源池化

- 多 provider 加权轮询
- 延迟感知（EMA 更新，低延迟 provider 自动获得更高有效权重）
- 熔断降级（连续失败 3 次 → 熔断 60 秒 → 半开试探）
- 运行时管理（管理员 API 动态增删改 provider、重置熔断）
- 详见 `docs/AI-POOL.md`

### 管理员系统

- 管理员控制台（用户管理 + 最近梦境）
- 用户操作：新增、编辑、封禁/解封、软删除
- 梦境查看：分页搜索 + AI 解析详情
- 角色权限：ROLE_ADMIN 才能访问 `/api/admin/**`

### 统计系统

- 情绪分布、地点分布、趋势图
- 预计算表（dream_stats / dream_place_stats）

### 安全

- Spring Security 过滤链
- TokenAuthenticationFilter（验 token + 查数据库确认用户状态）
- 全局 CORS
- 密码 SHA-256+盐值加密

---

## 认证与安全

- **Spring Security**：`SecurityConfig` 过滤链，CSRF 关闭、无状态 session、全局 CORS
- **Token**：`TokenService` HMAC-SHA256 签名，前端存 localStorage，axios 拦截器自动附带
- **TokenAuthenticationFilter**：验 token + 查数据库确认用户未删除/未封禁
- **SecurityPaths**：公开接口白名单（login, register, reset-password, hello, swagger）
- **密码**：`PasswordEncrypt` SHA-256+盐值
- **管理员**：`/api/admin/**` 要求 `ROLE_ADMIN`
- **前端守卫**：guestOnly(`/login`, `/register`, `/reset-password`)、requiresAuth、requiresAdmin(`/admin`)
- **Session**：前端 15 分钟超时
- **软删除**：`user.deleted=1`，封禁：`user.status='BANNED'`

## 验证码 + 邮件系统

- **VerificationCodeService**：支持多场景（register/login/change-password/reset-password）
- Redis 存储验证码（5 分钟 TTL）+ 频率限制（60 秒）
- QQ 邮箱 SMTP：`spring.mail.host=smtp.qq.com`，端口 587
- 邮件发送失败返回用户友好提示，不泄露 SMTP 技术错误

---

## 接口清单

### 公开接口（无需认证）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/login` | 密码登录 |
| POST | `/api/login/send-code` | 登录验证码 |
| POST | `/api/login/code` | 验证码登录（不存在则自动注册） |
| POST | `/api/register` | 注册（需验证码） |
| POST | `/api/register/send-code` | 注册验证码 |
| POST | `/api/reset-password/send-code` | 重置密码验证码 |
| POST | `/api/reset-password` | 重置密码 |
| GET | `/api/hello` | 健康检查 |

### 需认证接口

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/account/setup` | 新用户设置用户名密码 |
| POST | `/api/change-password/send-code` | 修改密码验证码 |
| POST | `/api/change-password` | 修改密码（需验证码） |
| GET | `/api/dream/{id}` | 查单个梦境 |
| GET | `/api/dreams/user/{userId}` | 查用户所有梦境 |
| POST | `/api/analysisDream` | 保存梦境 |
| POST | `/api/dreams/save-and-analyze` | 保存 + 异步 AI 解析 |
| POST | `/api/dream/{id}/delete` | 删除梦境 |
| GET | `/api/stats/{userId}/*` | 统计接口 |
| GET | `/api/user/by-email` | 邮箱查用户 |

### 管理员接口（需 ROLE_ADMIN）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/admin/overview` | 管理总览 |
| POST | `/api/admin/user-action` | 用户操作 |
| POST | `/api/admin/delete-user` | 软删除 |
| POST | `/api/admin/dream-detail` | 梦境详情 |
| GET | `/api/admin/ai-pool/providers` | 查看所有 AI provider 状态 |
| POST | `/api/admin/ai-pool/providers` | 添加 provider |
| POST | `/api/admin/ai-pool/providers/{name}/update` | 更新 provider |
| POST | `/api/admin/ai-pool/providers/{name}/delete` | 删除 provider |
| POST | `/api/admin/ai-pool/providers/{name}/reset` | 重置熔断 |

---

## 前端 API 模块

| 文件 | 用途 |
|---|---|
| `api/axios.ts` | 共享 axios 实例，带 `attachAuthHeader` 拦截器 |
| `api/user.ts` | 注册、登录（密码/验证码）、统计、验证码发送、setupAccount |
| `api/dream.ts` | 梦境 CRUD、AI 解析 |
| `api/admin.ts` | 管理员后台 |

## 前端页面

| 页面 | 路径 | 说明 |
|------|------|------|
| HomeView | `/` | 首页/仪表板 |
| LoginView | `/login` | 密码登录/验证码登录切换，新用户自动注册+设置弹窗 |
| RegisterView | `/register` | 注册（验证码强制校验，注册后自动登录） |
| ResetPasswordView | `/reset-password` | 多步密码重置 |
| RecordDreamView | `/record-dream` | 记录梦境 + AI 解析，PC 左右分栏/手机向导式 |
| DreamListView | `/dreams` | 梦境列表 + 搜索 + 详情 |
| ProfileView | `/profile` | 个人资料 + 头像 |
| ChangePasswordView | `/change-password` | 修改密码（需验证码） |
| DreamStatsView | `/dream-stats` | 统计图表 |
| AdminView | `/admin` | 管理员控制台 |
| ErrorView | `/error/:code` | 错误页 |
| LearnMoreView | `/learn-more` | 产品介绍 |

## 前端设计风格

项目有两套视觉风格，按页面类型选用。

### 主功能页面：梦幻玻璃拟态（Dreamy Glassmorphism）

适用于：HomeView、LoginView、RegisterView、RecordDreamView、DreamListView、ProfileView、ChangePasswordView、ResetPasswordView、DreamStatsView、LearnMoreView、ErrorView。

- **色彩**：主色 `#7C6FE0`（紫）+ 辅色 `#FFB347`（橙），渐变背景 `#E8D5F5` → `#B8E6FF`，文字深紫 `#2D2B55` / 浅紫 `#6B6899`。CSS 变量在 `assets/main.css` `:root` 中定义。
- **视觉**：毛玻璃卡片（`rgba(255,255,255,0.25)` + `backdrop-filter: blur(20-24px)`）、梦幻背景层（星星/云朵/光晕）、浮动 emoji 装饰（🌙✨⭐💫🔮）、渐变文字（`-webkit-background-clip: text`）。
- **交互**：胶囊按钮（radius 50px）、hover 上浮 + 紫色投影、入场动画 `card-enter`（下方淡入缩放）、submit 按钮光泽扫过效果。
- **字体**：Noto Sans SC，PC 端 `font-size: 18px`。
- **响应式**：≤768px / ≥1024px / ≥1440px 三档，侧边装饰仅 ≥1024px 显示。
- **规范**：新主功能页面必须复用此风格，参考 `HomeView.vue` 和 `LoginView.vue`。

### 管理员后台：简洁 Dashboard 风格

适用于：AdminView。

- **色彩**：浅灰白背景（`#f5f7fb`）、indigo 主色（`#4f46e5` → `#7c3aed`）、白色卡片 + 细边框。
- **视觉**：无毛玻璃、无浮动装饰、无梦幻背景。白色实底卡片 + 微投影、指标卡左侧色条、表格布局。
- **交互**：圆角按钮（radius 10-12px）、hover 微上浮、modal 弹窗带 hero 渐变头部。
- **规范**：管理类页面用此风格，参考 `AdminView.vue`。

## 前端响应式布局策略

RecordDreamView 采用 JS 切换模板的方式实现响应式：

- **PC (>= 1024px)**：左右分栏，左侧边栏（情绪/时间/地点）+ 右侧主内容区
- **手机 (< 1024px)**：向导式两步卡片，步骤指示器 + 上一步/下一步导航
- 实现：`isMobile = ref(window.innerWidth < 1024)` + resize 监听 + `v-if`/`v-else` 切换
- CSS 断点：`@media (max-width: 1023px)` 覆盖手机端样式

---

## 技术约定

### HTTP 方法

项目只使用 GET 和 POST，不使用 PUT/DELETE/PATCH。操作类接口用 POST，路径加动词后缀（如 `/dream/{id}/delete`、`/providers/{name}/update`）。

### 敏感信息

`application.properties` 不提交到 Git，用 `.gitignore` 排除。敏感值用环境变量。

### 编码

`pom.xml` 已配置 UTF-8 编码。Java 源文件避免使用中文引号，统一使用 ASCII 引号。

---

## AI 资源池化

详见 `docs/AI-POOL.md`。

- `DTO/AiProvider`：provider 模型
- `service/AiProviderPool`：加权轮询 + 延迟感知 + 熔断降级
- `controller/AiPoolController`：管理员 CRUD 接口
- 配置格式：`ai.pool.providers[0].name/url/apiKey/model/weight/enabled`

---

## 遗留代码

### 已清理

- `config/Aiconfig.java`
- `util/JsonUtil.java`
- `service/captcha.java`
- `service/emailCode.java`

### 仍可安全删除或继续核对

- `config/Ai.java`：旧 AI 配置结构
- `DTO/Dream.java` + `mapper/DreamMapper.java` + `mapper/dreamMapper.xml`：旧 dream 表结构
- `DTO/AI.java` + `DTO/messages.java`：旧 AI 请求结构
- `controller/TestDataController.java`：测试数据
- `controller/InitController.java`：DDL 操作

---

## 开发命令

```bash
# 前端
cd frontend && npm run build

# 后端（需 JDK 17）
mvn -DskipTests compile

# Docker 一键部署
cd docker && ./deploy.sh

# 本机 Java 17 位置（Windows）
JAVA_HOME=C:\Program Files\Java\jdk-17.0.4.1
```

## Docker 部署

分支：[`docker-install`](https://github.com/YiWeiLai233/DreamArchive/tree/docker-install)

所有 Docker 脚本集中在 `docker/` 文件夹：

```
docker/
├── docker-compose.yml    # MySQL + Redis + MinIO + Backend + Frontend
├── Dockerfile            # 后端构建
├── frontend.Dockerfile   # 前端构建
├── nginx.conf            # 反向代理 + 限流
├── .env.example          # 环境变量模板
├── deploy.sh             # Linux 一键部署
└── deploy.ps1            # Windows 一键部署
```

部署步骤：`cd docker && cp .env.example .env && vim .env && ./deploy.sh`

### 安全加固（2026-06-06）

- 生产环境只暴露 80 端口，MySQL/Redis/Backend 改为内部 expose
- Redis 加密码认证（`REDIS_PASSWORD`）
- 邮箱账号改为环境变量（`MAIL_USERNAME`），不再硬编码
- MinIO bucket 自动初始化（`minio-init` 服务）
- Swagger 默认注释，AUTH_SECRET 32 位长度校验
- 限流配置前缀对齐 `app.security.rate-limit.*`
- 上传接口专用 Nginx 限流 30r/m
- GitHub Actions：`ci.yml`（构建+测试）、`docker-build.yml`（镜像构建验证）

## 服务器

- 数据库：MySQL 192.168.199.136:3306
- Redis：192.168.199.136:6379
- 邮件：QQ 邮箱 859399899@qq.com

---

## 2026-05-23 改动

### 密码加密：BCrypt
- 将密码加密方式从 SHA-256+盐值 改为 BCrypt
- BCrypt 自带盐值，安全性更高

### 游客模式
- 未登录可记录梦境，数据存 localStorage (`guest_dreams`)
- `GuestController` — `/api/guest/analyze` 接口，Redis+设备ID限制每设备3次
- `SecurityPaths` — `/api/guest/**` 加入公开接口白名单
- 登录/注册后自动同步游客梦境到后端（含解析结果）
- `utils/guestDreams.ts` — 抽离游客梦境工具函数（getDeviceId、saveGuestDream、syncGuestDreams 等）

### AI 解析优化
- 添加 `max_tokens: 600` 限制输出长度
- temperature 从 0.5 降到 0.3
- timeout 从 60s 降到 30s

### 前端修复
- `dreamInterpretation.ts` — 清理 `[]` 和 `【】` 括号
- `errorHandler.ts` — 游客接口 `/api/guest/*` 不走全局错误跳转
- `RecordDreamView` — 游客解析完成后创建新对象赋值，修复 Vue 响应式问题

### 路由调整
- `/record-dream` 移除 `requiresAuth`，游客可直接访问

---

## 本地协作约定

- 本机 Java 17 路径：`C:\Program Files\Java\jdk-17.0.4.1`
- 上传 GitHub 时不要加入所有 `.md` 文档文件。
- 上传 GitHub 时不要加入配置文件信息、密钥、账号、服务器连接等敏感信息。
- 以后写入本地 `AGENTS.md` 的协作说明，也同步追加到 `CLAUDE.md`。
- 同步到 `CLAUDE.md` 时只添加新内容，不删除已有内容。

## 变更记录

### 2026-05-23 部署修复 + 前端优化

| 文件 | 改动 |
|------|------|
| `SecurityConfig.java` | CORS 白名单加 `http://175.178.84.239:*`，修复新服务器部署 403 |
| `WebConfig.java` | CORS 白名单加 `http://175.178.84.239:*` |
| `RecordDreamView.vue` | 时间选择器从原生 select 改为标签式，显示具体时间段（00-02、08-10 等）；手机端情绪按钮 flex:1 加宽 |
| `DreamListView.vue` | AI 解析序号显示改为自动递增 |
| `dreamInterpretation.ts` | AI 解析序号逻辑：忽略 AI 原始序号，改为 itemCounter 自动递增 1,2,3,4,5 |

### 2026-06-02 CORS 配置集中化

- CORS 只保留在 `SecurityConfig.java` 的 `CorsConfigurationSource` 中，由 Spring Security `.cors(Customizer.withDefaults())` 读取；删除重复的 `WebConfig.java`，避免两处白名单改漏。
- 新增 `config/CorsProperties.java`，所有 CORS 值从 `application.properties` 的 `app.cors.*` 读取；Java 代码不要硬编码 `localhost`、`127.0.0.1` 或服务器 IP。
- `application.properties` 被 `.gitignore` 排除，部署服务器时必须同步补 `app.cors.allowed-origin-patterns`、`app.cors.allowed-methods`、`app.cors.allowed-headers`、`app.cors.exposed-headers`、`app.cors.allow-credentials`、`app.cors.max-age`。
- 当前提交：`7a4213b refactor: load CORS settings from application config`，已推送到 `origin/master`。

### 2026-06-02 安全响应头 + HttpOnly Cookie 分支

| 文件 | 改动 |
|------|------|
| `SecurityConfig.java` | 添加 CSP（script-src 'self'）、X-Frame-Options、X-Content-Type-Options、Referrer-Policy 安全响应头 |
| `feat/httponly-cookie` 分支 | 已创建并推送，待开发 Token 从 localStorage 迁移到 HttpOnly Cookie |
| `RecordDreamView.vue` | AI 解析免责声明升级（两行详细版），保存并解析按钮上方加提醒 |
| `DreamListView.vue` | AI 解析免责声明同步升级 |

### 2026-06-02 笔记同步约定

- 用户以后说“写入笔记”时，必须同步写入三个位置：本项目 `AGENTS.md`、本项目 `CLAUDE.md`、桌面 `DreamAc笔记.md`。
- 桌面 DreamAc 笔记路径：`C:\Users\85939\Desktop\DreamAc笔记.md`。

### 2026-06-02 错误信息隐藏 + analysis_status 分支

| 文件 | 改动 |
|------|------|
| `GlobalExceptionHandler.java` | catch-all 异常不再返回 `e.getMessage()`，改为固定友好提示 + `log.error()` |
| `DreamController.java` / `FileController.java` / `GuestController.java` / `UserController.java` | 错误响应隐藏异常详情，加 Logger |
| `StatsService.java` / `ResetPasswordService.java` / `MinioService.java` / `AiService.java` | 同上 |
| `feat/analysis-status` 分支 | `dream_content` 新增 `analysis_status`（NONE/PENDING/SUCCESS/FAILED）+ `analysis_error`，替代哨兵字符串。部署需先执行 `db/analysis_status_patch.sql` |

### 2026-06-03 桌面路径修正

- 用户本机桌面路径统一按 `D:\desktop\` 处理，不再使用 `C:\Users\85939\Desktop\` 作为桌面路径。
- `dreamAC` 桌面文件夹路径为 `D:\desktop\dreamAC\`。
- 桌面 DreamAc 笔记路径改按 `D:\desktop\DreamAc笔记.md`。

### 2026-06-03 HttpOnly Cookie + CSRF 测试记录

| 文件 | 改动 |
|------|------|
| `CsrfProtectionFilter.java` | 给三参构造函数加 `@Autowired`，修复 Spring 启动时 `No default constructor found` |
| `SecurityConfig.java` | `csrfProtectionFilter` 改挂到 `UsernamePasswordAuthenticationFilter` 前，避免用自定义 `TokenAuthenticationFilter` 作为排序锚导致 `does not have a registered order` |
| `application.properties.example` / 本地 `application.properties` | `app.cors.allowed-headers` 补 `X-XSRF-TOKEN`，跨域部署时允许 CSRF header 预检 |

验证结果：
- `mvn test`：20 tests，0 failures，0 errors。
- `npm run build`：通过。
- `npm run test:cookie-auth`：通过。
- `java -jar target/DreamArchive-0.0.1-SNAPSHOT.jar`：Tomcat 成功启动到 8080。
- `GET /api/hello`：200，返回 `Hello Dream Archive`。
- CORS 预检带 `Access-Control-Request-Headers: X-XSRF-TOKEN, Content-Type`：200，并返回 `Access-Control-Allow-Headers: X-XSRF-TOKEN, Content-Type`。
- CSRF smoke test：带认证 Cookie 但不带 CSRF header 的 POST 返回 403 `CSRF token invalid`；带匹配 `XSRF-TOKEN` 后进入认证阶段，假 token 返回 401，符合预期。

注意：
- 部署服务器的 `application.properties` 也必须同步补 `X-XSRF-TOKEN`。
- 生产 HTTPS 部署时 `app.auth.cookie-secure=true`。
- 本机验证时出现 MinIO 和 AI provider heartbeat 的 `Permission denied`，属于外部服务/网络权限问题，不影响 HttpOnly Cookie + CSRF 验证。

### 2026-06-03 AI 资源池 Dashboard

| 文件 | 改动 |
|------|------|
| `frontend/src/api/admin.ts` | 新增 `AiProviderInfo`/`AiProviderForm` 接口 + 5 个 API 函数（getAiProviders/addAiProvider/updateAiProvider/deleteAiProvider/resetAiProviderCircuit） |
| `frontend/src/views/AdminView.vue` | 侧边栏新增"AI 资源池"tab，onMounted 自动加载 provider 列表；内容面板表格（名称/模型/URL/权重/状态/熔断/失败次数/平均延迟/操作）；新增/编辑 Provider 弹窗；启禁用/重置熔断/删除操作+确认框；深色模式适配 |
| `frontend/src/views/AdminView.vue` | 修复梦境面板 `v-else` 导致与 AI 面板混显，改为 `v-if="activePanel === 'dreams'"` |

### 2026-06-03 梦境总数统计修复

根因：
- 首页、梦境统计页使用 `/api/stats/{userId}`，原实现把最近 7 天 `dream_stats` 汇总误当成总梦境数。
- 个人资料页使用 `/api/stats/{userId}/total`，原实现只汇总 365 天 `dream_stats`，不是 `dream_content` 全量。
- “我的梦境”列表从 `dream_content` 查询全量，因此页面之间总数不一致。

| 文件 | 改动 |
|------|------|
| `StatsService.java` | `getDreamStats` 和 `getTotalDreams` 的总数统一改为 `statsMapper.countByUserId(userId)`，直接以 `dream_content` 为准 |
| `StatsServiceTest.java` | 新增回归测试，覆盖统计总览和个人资料总数必须使用 `dream_content` 全量计数 |

验证结果：
- `mvn test`：22 tests，0 failures，0 errors。
- `npm run build`：通过。

当前提交：`3b9c169 fix: count total dreams from dream content`，已推送到 `origin/master`。

### 2026-06-06 CI 修复 + Workflow 清理

**Java 文件名大小写修复**：

Linux CI 大小写敏感，小写文件名导致编译失败（本地 Windows 不报错）。修正 4 个文件：

| 原文件名 | 新文件名 |
|---|---|
| `mapper/loginMapper.java` | `mapper/LoginMapper.java` |
| `mapper/registerMapper.java` | `mapper/RegisterMapper.java` |
| `mapper/resetPasswordMapper.java` | `mapper/ResetPasswordMapper.java` |
| `service/registerService.java` | `service/RegisterService.java` |

验证：`mvn test` 40 tests, 0 failures。

**CI Workflow 清理**：

删除 2 个重复的 workflow 文件，每次推送从 4 个减到 2 个：

| 文件 | 状态 |
|---|---|
| `ci.yml` | ✅ 保留（构建+测试） |
| `docker-build.yml` | ✅ 保留（Docker 构建） |
| `maven-publish.yml` | ❌ 删除（与 ci.yml 重复） |
| `jekyll-docker.yml` | ❌ 删除（与 docker-build.yml 重复） |

**docker-build.yml 增强**：

1. 添加 `pull_request` 触发，PR 合入前自动验证 Docker 构建
2. 新增 `validate-compose` job，`docker compose config --quiet` 校验配置语法

### 2026-06-07 AI 资源池数据库迁移 + AES 加密

**AI 资源池迁移到数据库**：

| 文件 | 改动 |
|------|------|
| `DTO/AiProviderUpdateRequest.java` | 新建：更新请求 DTO |
| `mapper/AiProviderMapper.java` | 新建：数据库 Mapper 接口 |
| `mapper/aiProviderMapper.xml` | 新建：MyBatis XML 映射 |
| `db/ai_provider_table.sql` | 新建：建表 SQL |
| `AiProviderPool.java` | 重构：从数据库加载，@PostConstruct 初始化 |
| `AiPoolController.java` | 更新接口支持数据库持久化 |
| `AdminView.vue` | 前端支持编辑完整 Provider 信息 |
| `init.sql` | 添加 ai_provider 建表语句 |

**AES-256-GCM 加密存储 apiKey**：

| 文件 | 改动 |
|------|------|
| `util/AesEncryptor.java` | 新建：AES-256-GCM 可逆加密工具 |
| `AiProviderPool.java` | 写入时自动加密，读取时自动解密 |
| `AiPoolController.java` | 新增迁移接口 `POST /api/admin/ai-pool/providers/encrypt-api-keys` |
| `application.properties.example` | 新增 `app.encryption.aes-key` 配置项 |
| `application.properties` | 本地添加 32 位 AES 密钥 |

**测试**：

| 文件 | 改动 |
|------|------|
| `AesEncryptorTest.java` | 16 个测试：加密/解密往返、特殊字符、中文、边界条件 |
| `AiProviderPoolAesTest.java` | 8 个测试：加密存储流程、旧数据兼容、null 处理 |

**验证结果**：
- `mvn test`：24 tests，0 failures，0 errors。

**使用说明**：
1. `application.properties` 添加 `app.encryption.aes-key=你的32位密钥`
2. 启动后调用 `POST /api/admin/ai-pool/providers/encrypt-api-keys` 加密现有数据
3. 后续新增/更新 Provider 时 apiKey 自动加密存储

**AI 资源池权限控制**：

- 后端：`AiPoolController` 所有接口添加 `requireSuperAdmin` 校验
- 前端：AI 资源池 tab 和面板仅 `ROLE_SUPER_ADMIN` 可见
- 普通管理员 (`ROLE_ADMIN`) 无法访问 AI 资源池功能

**测试**：

| 文件 | 测试数 | 覆盖点 |
|------|--------|--------|
| `AdminServiceRoleTest.java` | 10 | requireSuperAdmin/requireAdmin、各角色权限、null/空token、删除/封禁用户 |

**后端改动必须写测试**：
- 以后修改后端代码时，必须同步编写单元测试或集成测试
- 测试覆盖核心逻辑、边界条件、异常情况

### 2026-06-08 MinIO 图片公网访问修复

根因：
- Docker 环境后端使用 `minio.endpoint=http://minio:9000` 生成预签名图片 URL，浏览器无法解析容器内主机名 `minio`，导致头像/梦境图片请求 `net::ERR_NAME_NOT_RESOLVED`。

改动：
- `MinioService.java` 新增 `minio.public-endpoint`，后端上传/下载仍使用内部 `minio.endpoint`，返回给前台的预签名 URL 使用浏览器可访问的公网 endpoint。
- `extractObjectName` 改为从 URL 路径中的 `/dream-archive/...` 提取 objectName，兼容旧的完整预签名 URL 和不同 host 的公网 URL。
- `application-docker.properties`、`application.properties.example`、`docker/.env.example`、`docker/docker-compose.yml` 增加 `MINIO_PUBLIC_ENDPOINT` / `minio.public-endpoint` 配置入口。
- 新增 `MinioServiceTest.java` 覆盖公网 URL 签名与 objectName 提取。

部署注意：
- Docker `.env` 必须配置 `MINIO_PUBLIC_ENDPOINT=http://公网IP或域名:9000`，必须带 `http://` 或 `https://`。
- 如果使用 Nginx/domain 代理 MinIO，也可以填代理后的公网地址。

验证：
- `mvn -Dtest=MinioServiceTest test` 通过。
- `mvn test` 83 tests，0 failures，0 errors。
- 用户线上反馈头像图片访问已恢复正常。
