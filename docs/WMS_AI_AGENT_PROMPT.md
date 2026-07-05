WMS 智能化改造 Agent 执行提示词

0\. 任务目标

基于当前仓库 YiWeiLai233/wms，为现有 WMS 仓库管理系统新增「智能知识库 + 智能助手」能力。

项目目标：

在不破坏现有 WMS 业务的前提下，新增 AI 智能助手模块。

支持知识库问答、自然语言查订单、查库存、查出库、查退货。

AI 不能直接连接数据库，必须通过 Spring Boot 后端安全接口调用业务能力。

第一阶段只做只读能力，不做自动改库存、自动出库、自动退货确认。

项目定位：

基于 Spring Boot + Vue 3 + LangChain + RAG + Qdrant + Embedding + LLM 的智能 WMS 仓储管理系统

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

1\. 当前项目真实结构

请优先读取这些文件，不要一开始扫描全仓库，节省 token：

README.md

wms-backend/pom.xml

wms-backend/src/main/resources/application.properties

wms-backend/sql/schema.sql

wms-backend/src/main/java/com/yiweilai/wms/WmsApplication.java

wms-backend/src/main/java/com/yiweilai/wms/common/Result.java

wms-backend/src/main/java/com/yiweilai/wms/config/SecurityConfig.java



wms-backend/src/main/java/com/yiweilai/wms/order/controller/OrderController.java

wms-backend/src/main/java/com/yiweilai/wms/stock/controller/StockController.java

wms-backend/src/main/java/com/yiweilai/wms/outbound/controller/OutboundController.java

wms-backend/src/main/java/com/yiweilai/wms/returns/controller/ReturnController.java

wms-backend/src/main/java/com/yiweilai/wms/file/controller/FileController.java

wms-backend/src/main/java/com/yiweilai/wms/log/controller/OperationLogController.java



wsm-web/package.json

wsm-web/src/api/request.ts

wsm-web/src/router/index.ts

wsm-web/src/layouts/DefaultLayout.vue

wsm-web/src/utils/constants.ts

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

2\. 已确认技术栈

后端

Spring Boot 4.0.6

Java 17

MyBatis Spring Boot Starter 4.0.1

MySQL Connector/J

Spring Security

JWT：jjwt 0.12.6

PageHelper 2.1.0

Spring Validation

Apache POI 5.2.5

Knife4j OpenAPI

Lombok

前端

Vue 3.5

TypeScript 5.7

Vite 6

Element Plus 2.9

Pinia

Axios

ECharts

UnoCSS

Dayjs

数据库

MySQL 8.0+

当前数据库名：wms

已有核心表：

sys\_user

sys\_role

sys\_permission

product

product\_sku

warehouse

warehouse\_area

warehouse\_shelf

stock

stock\_log

stock\_check

sales\_order

sales\_order\_item

outbound\_order

outbound\_order\_item

return\_order

return\_order\_item

file\_record

operation\_log

es\_sync\_task

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

3\. 当前已有业务接口

当前项目已经存在这些可复用接口和模块：

订单模块

Controller:

wms-backend/src/main/java/com/yiweilai/wms/order/controller/OrderController.java



接口：

GET  /api/orders

GET  /api/orders/{id}

POST /api/orders/import

POST /api/orders/import-file

用途：

AI 后续查询订单时优先复用 OrderService。

不要让 AI 直接查 sales\_order 表。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

库存模块

Controller:

wms-backend/src/main/java/com/yiweilai/wms/stock/controller/StockController.java



接口：

GET  /api/stocks/query

POST /api/stocks/adjust

要求：

第一阶段 AI 只能调用 GET /api/stocks/query 做库存查询。

不要调用 POST /api/stocks/adjust。

库存调整属于高风险可写操作，后期必须加确认机制。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

出库模块

Controller:

wms-backend/src/main/java/com/yiweilai/wms/outbound/controller/OutboundController.java



接口：

GET  /api/outbound/list

GET  /api/outbound/{id}

POST /api/outbound/create

POST /api/outbound/create-batch

POST /api/outbound/scan

POST /api/outbound/confirm

POST /api/outbound/{id}/cancel

要求：

第一阶段 AI 只能使用 GET /api/outbound/list 和 GET /api/outbound/{id}。

不要让 AI 自动创建出库单、扫码、确认出库、取消出库。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

退货模块

Controller:

wms-backend/src/main/java/com/yiweilai/wms/returns/controller/ReturnController.java



接口：

GET  /api/returns/list

GET  /api/returns/{id}

POST /api/returns/create

POST /api/returns/check

POST /api/returns/confirm

POST /api/returns/{id}/cancel

POST /api/returns/cancel-by-order/{orderId}

要求：

第一阶段 AI 只能使用 GET /api/returns/list 和 GET /api/returns/{id}。

不要让 AI 自动创建退货单、质检、确认入库、取消退货。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

文件模块

Controller:

wms-backend/src/main/java/com/yiweilai/wms/file/controller/FileController.java



接口：

POST   /api/files/upload

GET    /api/files/{id}

DELETE /api/files/{id}

用途：

知识库文档上传可以复用现有文件上传模块，也可以新增 /api/ai/knowledge/upload。

建议第一阶段新增独立 AI 知识库上传接口，不要直接改原文件模块逻辑。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

日志模块

Controller:

wms-backend/src/main/java/com/yiweilai/wms/log/controller/OperationLogController.java



接口：

GET /api/operation-logs

用途：

AI 工具调用日志建议新增 ai\_tool\_call\_log 表，不要混入 operation\_log。

operation\_log 继续保留给普通业务操作日志。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

4\. 当前前端结构

前端 API 封装：

wsm-web/src/api/request.ts

特点：

axios baseURL = /api

请求自动携带 localStorage.token

后端统一返回格式：{ code, message, data }

code === 200 表示成功

401 自动跳转登录页

前端路由：

wsm-web/src/router/index.ts

当前已有页面：

/dashboard

/warehouse/list

/warehouse/shelves

/product/list

/product/sku

/stock/query

/stock/log

/stock/check

/order/list

/outbound/list

/returns/list

/express/query

/express/companies

/express/fee-templates

/express/fee-report

/system/users

/system/files

/system/logs

菜单配置：

wsm-web/src/utils/constants.ts

智能助手前端建议新增：

wsm-web/src/api/ai.ts

wsm-web/src/views/ai/AiAssistantView.vue

wsm-web/src/views/ai/KnowledgeBaseView.vue

并在路由和菜单中新增：

/ai/assistant

/ai/knowledge

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

5\. 安全配置要求

当前 Spring Security 已经保护所有非公开接口。

已有公开接口：

/api/health

/api/auth/login

/api/auth/register

/swagger-ui/\*\*

/v3/api-docs/\*\*

/doc.html

/webjars/\*\*

OPTIONS /\*\*

新增 AI 接口时：

/api/ai/chat

/api/ai/conversations

/api/ai/knowledge/upload

/api/ai/knowledge/list

/api/ai/knowledge/{id}

要求：

AI 接口默认需要登录。

不要把 /api/ai/\*\* 加到 permitAll。

wms-ai-service 调 Spring Boot 内部工具接口时必须带服务端密钥或通过内部网络访问。

不要让前端直接访问 wms-ai-service。

前端统一访问 Spring Boot 的 /api/ai/\*\*。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

6\. 重要安全修复

当前 application.properties 里存在真实数据库地址、账号、密码、JWT Secret。

必须先改成环境变量：

spring.datasource.url=${MYSQL\_URL:jdbc:mysql://localhost:3306/wms?useSSL=false\&serverTimezone=Asia/Shanghai\&characterEncoding=utf8\&allowPublicKeyRetrieval=true}

spring.datasource.username=${MYSQL\_USERNAME:root}

spring.datasource.password=${MYSQL\_PASSWORD:root}

jwt.secret=${JWT\_SECRET:ChangeMeToLongRandomSecret}

jwt.expiration=${JWT\_EXPIRATION:86400000}

同时新增：

wms-backend/src/main/resources/application-example.properties

禁止：

不要把真实数据库密码提交到 GitHub。

不要把真实 JWT Secret 提交到 GitHub。

不要把 LLM API Key 提交到 GitHub。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

7\. 推荐新增架构

采用轻量分布式架构，不要过度微服务化。

wsm-web

&#x20;  ↓

Spring Boot wms-backend

&#x20;  ↓

/api/ai/chat

&#x20;  ↓

wms-ai-service

Python FastAPI + LangChain

&#x20;  ↓

RAG / Retriever / Agent / LLM

&#x20;  ↓

Qdrant 向量数据库

&#x20;  ↓

Embedding 模型

业务查询流程：

用户问：今天还有多少订单没出库？

↓

前端请求 /api/ai/chat

↓

Spring Boot 鉴权并记录会话

↓

Spring Boot 转发到 wms-ai-service

↓

LangChain 判断需要查业务数据

↓

wms-ai-service 调用 Spring Boot 内部只读工具接口

↓

Spring Boot 通过 OrderService / StockService / OutboundService 查询数据

↓

返回结构化结果

↓

LLM 组织回答

↓

Spring Boot 保存消息和工具日志

↓

前端展示答案

知识库流程：

上传文档

↓

Spring Boot 保存文件和文档记录

↓

wms-ai-service 解析文档

↓

文本切分

↓

本地 Embedding 模型向量化

↓

写入 Qdrant

↓

用户提问

↓

Qdrant 相似度检索

↓

LLM 基于检索内容回答

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

8\. 新增后端模块

在后端新增包：

wms-backend/src/main/java/com/yiweilai/wms/ai

├── controller

│   ├── AiChatController.java

│   └── AiKnowledgeController.java

├── service

│   ├── AiChatService.java

│   ├── AiKnowledgeService.java

│   └── AiToolLogService.java

├── client

│   └── AiServiceClient.java

├── dto

│   ├── AiChatRequest.java

│   ├── AiChatResponse.java

│   ├── AiSourceDTO.java

│   ├── AiToolCallDTO.java

│   ├── AiKnowledgeUploadDTO.java

│   └── AiConfirmRequest.java

├── entity

│   ├── AiConversation.java

│   ├── AiMessage.java

│   ├── AiKnowledgeDocument.java

│   ├── AiKnowledgeChunk.java

│   └── AiToolCallLog.java

├── mapper

│   ├── AiConversationMapper.java

│   ├── AiMessageMapper.java

│   ├── AiKnowledgeDocumentMapper.java

│   ├── AiKnowledgeChunkMapper.java

│   └── AiToolCallLogMapper.java

└── tool

&#x20;   ├── AiOrderToolService.java

&#x20;   ├── AiStockToolService.java

&#x20;   ├── AiOutboundToolService.java

&#x20;   └── AiReturnToolService.java

MyBatis XML 新增：

wms-backend/src/main/resources/mapper/ai/AiConversationMapper.xml

wms-backend/src/main/resources/mapper/ai/AiMessageMapper.xml

wms-backend/src/main/resources/mapper/ai/AiKnowledgeDocumentMapper.xml

wms-backend/src/main/resources/mapper/ai/AiKnowledgeChunkMapper.xml

wms-backend/src/main/resources/mapper/ai/AiToolCallLogMapper.xml

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

9\. 新增 AI 服务目录

在仓库根目录新增：

wms-ai-service

├── app

│   ├── main.py

│   ├── config.py

│   ├── api

│   │   ├── chat.py

│   │   └── knowledge.py

│   ├── rag

│   │   ├── loader.py

│   │   ├── splitter.py

│   │   ├── embedding.py

│   │   ├── vector\_store.py

│   │   ├── retriever.py

│   │   └── chain.py

│   ├── llm

│   │   └── llm\_client.py

│   ├── agent

│   │   └── wms\_agent.py

│   └── tools

│       └── wms\_tools.py

├── requirements.txt

├── Dockerfile

└── README.md

第一阶段 requirements.txt 建议：

fastapi

uvicorn

pydantic

pydantic-settings

python-multipart

langchain

langchain-community

langchain-openai

qdrant-client

sentence-transformers

pypdf

python-docx

openpyxl

requests

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

10\. 新增数据库表

新增 SQL 文件：

wms-backend/sql/V20260614\_\_ai\_assistant.sql

SQL：

CREATE TABLE IF NOT EXISTS ai\_conversation (

&#x20;   id BIGINT PRIMARY KEY AUTO\_INCREMENT COMMENT '会话ID',

&#x20;   user\_id BIGINT NOT NULL COMMENT '用户ID',

&#x20;   title VARCHAR(255) DEFAULT NULL COMMENT '会话标题',

&#x20;   created\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP COMMENT '创建时间',

&#x20;   updated\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP COMMENT '更新时间',

&#x20;   KEY idx\_user\_id (user\_id),

&#x20;   KEY idx\_created\_at (created\_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI会话表';



CREATE TABLE IF NOT EXISTS ai\_message (

&#x20;   id BIGINT PRIMARY KEY AUTO\_INCREMENT COMMENT '消息ID',

&#x20;   conversation\_id BIGINT NOT NULL COMMENT '会话ID',

&#x20;   user\_id BIGINT DEFAULT NULL COMMENT '用户ID',

&#x20;   role VARCHAR(30) NOT NULL COMMENT '角色：user/assistant/system/tool',

&#x20;   content TEXT NOT NULL COMMENT '消息内容',

&#x20;   metadata JSON DEFAULT NULL COMMENT '元数据',

&#x20;   created\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP COMMENT '创建时间',

&#x20;   KEY idx\_conversation\_id (conversation\_id),

&#x20;   KEY idx\_user\_id (user\_id),

&#x20;   KEY idx\_created\_at (created\_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI消息表';



CREATE TABLE IF NOT EXISTS ai\_knowledge\_document (

&#x20;   id BIGINT PRIMARY KEY AUTO\_INCREMENT COMMENT '知识库文档ID',

&#x20;   title VARCHAR(255) NOT NULL COMMENT '标题',

&#x20;   file\_id BIGINT DEFAULT NULL COMMENT '关联file\_record.id',

&#x20;   file\_name VARCHAR(255) DEFAULT NULL COMMENT '文件名',

&#x20;   file\_path VARCHAR(500) DEFAULT NULL COMMENT '文件路径',

&#x20;   source\_type VARCHAR(50) NOT NULL DEFAULT 'FILE' COMMENT '来源类型',

&#x20;   status VARCHAR(50) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING/PROCESSING/SUCCESS/FAILED',

&#x20;   chunk\_count INT NOT NULL DEFAULT 0 COMMENT '分块数量',

&#x20;   error\_message TEXT DEFAULT NULL COMMENT '错误信息',

&#x20;   created\_by BIGINT DEFAULT NULL COMMENT '创建人',

&#x20;   created\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP COMMENT '创建时间',

&#x20;   updated\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP COMMENT '更新时间',

&#x20;   KEY idx\_status (status),

&#x20;   KEY idx\_created\_by (created\_by)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI知识库文档表';



CREATE TABLE IF NOT EXISTS ai\_knowledge\_chunk (

&#x20;   id BIGINT PRIMARY KEY AUTO\_INCREMENT COMMENT '知识片段ID',

&#x20;   document\_id BIGINT NOT NULL COMMENT '文档ID',

&#x20;   chunk\_index INT NOT NULL COMMENT '分块序号',

&#x20;   content TEXT NOT NULL COMMENT '文本内容',

&#x20;   vector\_id VARCHAR(100) DEFAULT NULL COMMENT 'Qdrant向量ID',

&#x20;   metadata JSON DEFAULT NULL COMMENT '元数据',

&#x20;   created\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP COMMENT '创建时间',

&#x20;   KEY idx\_document\_id (document\_id),

&#x20;   KEY idx\_vector\_id (vector\_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI知识库分块表';



CREATE TABLE IF NOT EXISTS ai\_tool\_call\_log (

&#x20;   id BIGINT PRIMARY KEY AUTO\_INCREMENT COMMENT '工具调用日志ID',

&#x20;   user\_id BIGINT DEFAULT NULL COMMENT '用户ID',

&#x20;   conversation\_id BIGINT DEFAULT NULL COMMENT '会话ID',

&#x20;   message\_id BIGINT DEFAULT NULL COMMENT '消息ID',

&#x20;   tool\_name VARCHAR(100) NOT NULL COMMENT '工具名称',

&#x20;   request\_params JSON DEFAULT NULL COMMENT '请求参数',

&#x20;   response\_data JSON DEFAULT NULL COMMENT '响应数据',

&#x20;   status VARCHAR(50) NOT NULL COMMENT '状态：SUCCESS/FAILED',

&#x20;   error\_message TEXT DEFAULT NULL COMMENT '错误信息',

&#x20;   created\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP COMMENT '创建时间',

&#x20;   KEY idx\_user\_id (user\_id),

&#x20;   KEY idx\_conversation\_id (conversation\_id),

&#x20;   KEY idx\_tool\_name (tool\_name),

&#x20;   KEY idx\_created\_at (created\_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI工具调用日志表';

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

11\. Spring Boot AI 接口设计

聊天接口

POST /api/ai/chat

请求：

{

&#x20; "conversationId": 1,

&#x20; "message": "今天还有多少订单没出库？",

&#x20; "mode": "auto"

}

响应：

{

&#x20; "answer": "今天还有 12 个订单待出库。",

&#x20; "conversationId": 1,

&#x20; "needConfirm": false,

&#x20; "sources": \[],

&#x20; "toolCalls": \[

&#x20;   {

&#x20;     "toolName": "count\_pending\_outbound\_orders",

&#x20;     "status": "SUCCESS"

&#x20;   }

&#x20; ]

}

会话接口

GET    /api/ai/conversations

GET    /api/ai/conversations/{id}/messages

DELETE /api/ai/conversations/{id}

知识库接口

POST   /api/ai/knowledge/upload

GET    /api/ai/knowledge/list

GET    /api/ai/knowledge/{id}

DELETE /api/ai/knowledge/{id}

POST   /api/ai/knowledge/{id}/rebuild

内部工具接口

内部工具接口只给 wms-ai-service 调用，前端不要直接调用：

POST /api/ai/tools/order/search

POST /api/ai/tools/order/detail

POST /api/ai/tools/stock/search

POST /api/ai/tools/outbound/search

POST /api/ai/tools/returns/search

要求：

内部工具接口必须校验 X-AI-Service-Token。

不能 permitAll。

不能让普通前端绕过权限调用。

所有工具调用写入 ai\_tool\_call\_log。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

12\. 第一阶段只实现这些

第一阶段目标：

知识库问答 + AI 聊天入口 + 聊天记录保存

必须实现：

1\. 新增 ai\_conversation 表

2\. 新增 ai\_message 表

3\. 新增 ai\_knowledge\_document 表

4\. 新增 ai\_knowledge\_chunk 表

5\. 新增 ai\_tool\_call\_log 表

6\. 新增 Spring Boot /api/ai/chat

7\. 新增 Spring Boot /api/ai/knowledge/upload

8\. 新增 wms-ai-service

9\. 新增 Qdrant

10\. 新增前端 AI 助手页面

11\. 新增前端知识库页面

第一阶段不要实现：

AI 自动改库存

AI 自动创建出库单

AI 自动确认出库

AI 自动创建退货单

AI 自动退货入库

AI 自动删除业务数据

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

13\. 第二阶段实现只读业务工具

第二阶段新增只读工具：

query\_order\_by\_no

根据订单号 / 平台订单号查询订单详情。



search\_orders

按订单状态、收件人、手机号、时间范围、备注搜索订单。



count\_pending\_outbound\_orders

统计待出库订单数量。



query\_sku\_inventory

按 SKU 编码、商品名、仓库查询库存。



query\_outbound\_orders

查询出库单列表和状态。



query\_return\_orders

查询退货单列表和状态。

工具调用规则：

涉及实时订单、库存、出库、退货数据，必须调用工具。

工具返回空就回答未查询到。

工具异常就回答查询失败原因。

不允许编造业务数据。

不允许让 LLM 直接拼 SQL。

不允许让 wms-ai-service 直接连 MySQL。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

14\. 第三阶段再做可写操作

第三阶段可写工具：

create\_outbound\_order

创建出库单。



confirm\_outbound\_order

确认出库。



create\_return\_order

创建退货单。



check\_return\_order

退货质检。



confirm\_return\_order

确认退货入库。



adjust\_stock

库存调整。

可写工具必须满足：

1\. 前端弹出确认框。

2\. 后端校验当前用户权限。

3\. 后端校验参数。

4\. 后端使用事务。

5\. 写入 ai\_tool\_call\_log。

6\. 写入 operation\_log。

7\. 返回执行结果。

8\. 失败必须回滚。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

15\. AI 服务系统提示词

wms-ai-service 的系统提示词：

你是易仓 WMS 智能助手。

你只能基于知识库检索内容和工具返回结果回答。

你不能编造订单、库存、出库、退货、快递、用户数据。

当用户询问实时业务数据时，必须调用对应工具。

当用户询问系统规则、操作流程、异常处理时，优先使用 RAG 知识库。

当工具返回空结果时，明确说明未查询到。

当工具调用失败时，明确说明失败原因。

当用户要求修改库存、出库、退货、订单状态时，不能直接执行，必须返回 needConfirm=true，并生成操作计划。

回答要简洁、准确，适合仓库人员理解。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

16\. Agent 开发规则

请严格按以下步骤执行：

1\. 先分析项目结构，不要直接大改代码。

2\. 优先复用现有 Result<T>、PageResult<T>、SecurityConfig、FileService、OrderService、StockService、OutboundService、ReturnService。

3\. 不要破坏现有订单、库存、出库、退货逻辑。

4\. 不要修改原业务接口行为。

5\. 新增 AI 模块放到 com.yiweilai.wms.ai 包。

6\. 新增前端页面放到 wsm-web/src/views/ai。

7\. 新增前端 API 放到 wsm-web/src/api/ai.ts。

8\. 每次只完成一个明确阶段。

9\. 代码必须能运行。

10\. 每次输出修改文件清单。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

17\. Docker Compose 新增建议

如果项目根目录还没有 docker-compose.yml，则新增：

services:

&#x20; qdrant:

&#x20;   image: qdrant/qdrant:latest

&#x20;   container\_name: wms-qdrant

&#x20;   ports:

&#x20;     - "6333:6333"

&#x20;     - "6334:6334"

&#x20;   volumes:

&#x20;     - qdrant\_data:/qdrant/storage



&#x20; wms-ai-service:

&#x20;   build:

&#x20;     context: ./wms-ai-service

&#x20;   container\_name: wms-ai-service

&#x20;   ports:

&#x20;     - "8010:8010"

&#x20;   environment:

&#x20;     QDRANT\_URL: http://qdrant:6333

&#x20;     WMS\_BACKEND\_URL: http://host.docker.internal:8080

&#x20;     AI\_SERVICE\_TOKEN: ${AI\_SERVICE\_TOKEN}

&#x20;     LLM\_PROVIDER: ${LLM\_PROVIDER:deepseek}

&#x20;     LLM\_API\_KEY: ${LLM\_API\_KEY}

&#x20;     EMBEDDING\_MODEL: ${EMBEDDING\_MODEL:bge-small-zh-v1.5}

&#x20;   depends\_on:

&#x20;     - qdrant



volumes:

&#x20; qdrant\_data:

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

18\. 前端新增要求

新增 API 文件：

wsm-web/src/api/ai.ts

至少包含：

sendAiMessage

getAiConversations

getAiMessages

uploadKnowledge

getKnowledgeList

deleteKnowledge

新增页面：

wsm-web/src/views/ai/AiAssistantView.vue

wsm-web/src/views/ai/KnowledgeBaseView.vue

新增路由：

/ai/assistant

/ai/knowledge

新增菜单：

智能助手

├── AI 助手

└── 知识库管理

UI 要求：

复用 Element Plus。

聊天页面左侧为会话列表，右侧为聊天窗口。

支持输入消息、发送、加载中状态。

回答显示 toolCalls 和 sources。

知识库页面支持上传文档、查看状态、删除、重建。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

19\. 验收标准

第一阶段验收：

1\. 后端可以启动。

2\. 前端可以启动。

3\. Qdrant 可以启动。

4\. wms-ai-service 可以启动。

5\. 用户登录后能进入 AI 助手页面。

6\. 用户可以发送问题。

7\. AI 可以返回知识库问答结果。

8\. 聊天记录写入 ai\_conversation 和 ai\_message。

9\. 知识库文件上传后写入 ai\_knowledge\_document。

10\. 文档切分后写入 ai\_knowledge\_chunk。

11\. 向量写入 Qdrant。

12\. 所有接口保持统一 Result<T> 格式。

第二阶段验收：

1\. AI 可以查订单。

2\. AI 可以查库存。

3\. AI 可以查出库单。

4\. AI 可以查退货单。

5\. 工具调用写入 ai\_tool\_call\_log。

6\. AI 不编造业务数据。

7\. AI 查询失败时能返回明确错误。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

20\. 禁止事项

不要让 wms-ai-service 直接连接 MySQL。

不要让 LLM 生成 SQL 并执行。

不要把 AI 逻辑塞进已有业务 Controller。

不要改坏现有 /api/orders、/api/stocks、/api/outbound、/api/returns。

不要把真实密码、JWT Secret、LLM API Key 写死到代码。

不要一开始做可写操作。

不要一次性生成大量无法运行的代码。

不要引入 Nacos、Gateway、Seata 等重型微服务组件。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

21\. Agent 输出格式

每次回答必须按以下格式：

\## 本次分析



\## 本次修改目标



\## 修改文件



\## 新增文件



\## 关键代码



\## 运行方式



\## 验证方式



\## 下一步建议

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

22\. 立即执行指令

请先执行第一步，不要直接大改代码：

读取指定关键文件，分析当前项目结构。

输出：

1\. 当前技术栈

2\. 已有模块

3\. 可复用接口

4\. AI 改造风险点

5\. 第一阶段需要新增的文件清单

6\. 第一阶段数据库脚本

7\. 第一阶段开发顺序

确认后再开始写代码。



