# 易仓 WMS 仓库管理系统

一站式仓库管理解决方案，支持商品管理、库存管理、订单管理、出库管理、退货管理、快递管理等核心业务功能。

## 技术栈

### 后端

| 技术 | 版本 | 说明 |
|---|---|---|
| Spring Boot | 4.0.6 | 应用框架 |
| MyBatis | - | ORM 持久层 |
| PageHelper | - | 分页插件 |
| Spring Security + JWT | - | 认证授权 |
| Knife4j | - | API 文档 |
| MySQL | 8.0+ | 数据库 |

### 前端

| 技术 | 版本 | 说明 |
|---|---|---|
| Vue | 3.5 | 前端框架 |
| TypeScript | 5.7 | 类型系统 |
| Element Plus | 2.9 | UI 组件库 |
| Vite | 6 | 构建工具 |
| Pinia | 2.3 | 状态管理 |
| ECharts | 5.6 | 图表库 |
| UnoCSS | 0.65 | 原子化 CSS |

## 项目结构

```
wms/
├── wms-backend/              # 后端 Spring Boot 项目
│   ├── src/main/java/
│   │   └── com/yiweilai/wms/
│   │       ├── common/       # 公共类（Result、PageResult）
│   │       ├── config/       # 配置（CORS、Security、MyBatis）
│   │       ├── exception/    # 异常处理
│   │       ├── security/     # JWT 认证
│   │       ├── user/         # 用户管理
│   │       ├── product/      # 商品管理（SPU/SKU/条码）
│   │       ├── warehouse/    # 仓库管理（仓库/货架）
│   │       ├── stock/        # 库存管理（库存/流水/盘点）
│   │       ├── order/        # 订单管理
│   │       ├── outbound/     # 出库管理
│   │       ├── returns/      # 退货管理
│   │       ├── express/      # 快递管理
│   │       ├── report/       # 报表统计
│   │       ├── file/         # 文件管理
│   │       ├── log/          # 操作日志
│   │       ├── ocr/          # OCR 识别
│   │       └── search/       # 搜索
│   ├── src/main/resources/
│   │   ├── mapper/           # MyBatis XML
│   │   └── application.properties
│   └── sql/                  # 数据库脚本
│
├── wsm-web/                  # 前端 Vue 项目
│   ├── src/
│   │   ├── api/              # API 接口
│   │   ├── components/       # 公共组件
│   │   ├── composables/      # 组合式函数
│   │   ├── layouts/          # 布局
│   │   ├── router/           # 路由
│   │   ├── stores/           # 状态管理
│   │   ├── utils/            # 工具函数
│   │   └── views/            # 页面
│   └── vite.config.ts
│
└── docs/                     # 文档
```

## 功能模块

### 仪表盘
- 今日订单/待出库/今日出库/今日退货统计卡片
- 近 7 天订单趋势折线图
- 订单状态分布饼图
- 本月出货量 TOP 10 SKU 柱状图

### 仓库管理
- 仓库 CRUD，支持仓库类型（普通仓/次品仓/报废仓）
- 货架管理，按仓库分组

### 商品管理
- 商品 SPU 管理
- SKU 管理，支持尺码矩阵批量生成
- 商品条码管理
- 商品分类管理

### 库存管理
- 库存查询（按商品/仓库/库存状态筛选）
- 手动入库
- 库存流水记录
- 库存盘点（创建盘点单 → 录入实盘数量 → 自动调整差异）

### 订单管理
- 手动录入订单
- 文件导入订单（Excel/CSV）
- 订单详情查看
- 创建出库单
- 创建退货单

### 出库管理
- 出库单创建（支持批量）
- 扫码拣货
- 确认出库（填写快递单号/快递公司/费用）
- 自动扣减库存

### 退货管理
- 退货单创建
- 质检（可售/次品/报废）
- 确认入库（按质检结果自动路由到对应仓库）

### 快递管理
- 快递公司管理
- 快递费用模板（支持阶梯计费）
- 快递查询（快递100集成）
- 快递费用统计（按日期范围查询汇总）

### 系统管理
- 用户管理（CRUD + 角色分配）
- 文件管理
- 操作日志

## 快速开始

### 环境要求

- JDK 17+
- Maven 3.8+
- MySQL 8.0+
- Node.js 18+

### 数据库初始化

```sql
CREATE DATABASE IF NOT EXISTS wms DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE wms;
-- 执行 wms-backend/sql/schema.sql
```

执行 `sql/` 目录下的增量迁移脚本更新表结构。

### 后端启动

```bash
cd wms-backend

# 修改数据库连接信息
vim src/main/resources/application.properties

# 启动
mvn spring-boot:run
```

后端启动后访问 API 文档：http://localhost:8080/swagger-ui.html

### 前端启动

```bash
cd wsm-web

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端访问地址：http://localhost:5173

### 默认账号

| 用户名 | 密码 | 角色 |
|---|---|---|
| admin | 123456 | 超级管理员 |

## API 概览

| 模块 | 路径前缀 | 说明 |
|---|---|---|
| 认证 | `/api/auth` | 登录、获取用户信息 |
| 用户 | `/api/users` | 用户 CRUD |
| 商品 | `/api/products` | 商品 SPU CRUD |
| SKU | `/api/skus` | SKU CRUD |
| 分类 | `/api/categories` | 分类 CRUD |
| 仓库 | `/api/warehouses` | 仓库 CRUD |
| 货架 | `/api/warehouse-shelves` | 货架 CRUD |
| 库存 | `/api/stocks` | 库存查询、调整 |
| 库存流水 | `/api/stock-logs` | 流水查询 |
| 盘点 | `/api/stock-checks` | 盘点 CRUD |
| 订单 | `/api/orders` | 订单 CRUD、导入 |
| 出库 | `/api/outbound` | 出库单管理 |
| 退货 | `/api/returns` | 退货单管理 |
| 快递公司 | `/api/express/companies` | 快递公司 CRUD |
| 费用模板 | `/api/express/fee-templates` | 费用模板 CRUD |
| 快递查询 | `/api/express/query` | 快递轨迹查询 |
| 报表 | `/api/reports` | 仪表盘、统计 |
| 文件 | `/api/files` | 文件上传 |
| 日志 | `/api/operation-logs` | 操作日志 |

## License

MIT
