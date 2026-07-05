\# WMS AI 第二阶段：只读业务工具改造提示词



\## 0. 阶段目标



本阶段目标是在第一阶段「AI 聊天 + 知识库问答」基础上，新增 AI 对 WMS 真实业务数据的只读查询能力。



只做查询，不做修改。



```text

目标：

1\. AI 可以自然语言查询订单。

2\. AI 可以自然语言查询库存。

3\. AI 可以自然语言查询出库单。

4\. AI 可以自然语言查询退货单。

5\. AI 可以统计待出库订单数量。

6\. AI 可以调用后端安全工具接口获取真实数据。

7\. 所有工具调用必须写入 ai\_tool\_call\_log。

8\. LLM 不允许直接访问 MySQL。

9\. LLM 不允许生成 SQL 执行。

10\. wms-ai-service 不允许直接连接数据库。

```



\---



\## 1. 当前项目上下文



当前项目为：



```text

仓库：YiWeiLai233/wms

后端：wms-backend

前端：wsm-web

AI 服务：wms-ai-service

```



后端包名：



```text

com.yiweilai.wms

```



第一阶段应该已经存在：



```text

com.yiweilai.wms.ai

├── controller

├── service

├── client

├── dto

├── entity

├── mapper

└── tool

```



第一阶段应该已经存在数据表：



```text

ai\_conversation

ai\_message

ai\_knowledge\_document

ai\_knowledge\_chunk

ai\_tool\_call\_log

```



当前已有业务模块：



```text

order      订单模块

stock      库存模块

outbound   出库模块

returns    退货模块

file       文件模块

log        操作日志模块

```



当前已有接口：



```text

GET /api/orders

GET /api/orders/{id}



GET /api/stocks/query



GET /api/outbound/list

GET /api/outbound/{id}



GET /api/returns/list

GET /api/returns/{id}

```



\---



\## 2. 第二阶段新增能力



新增 AI 只读工具：



```text

query\_order\_by\_no

根据订单号 / 平台订单号查询订单详情。



search\_orders

按订单状态、收件人、手机号、备注、时间范围查询订单。



count\_pending\_outbound\_orders

统计待出库订单数量。



query\_sku\_inventory

按 SKU 编码、SKU 名称、仓库查询库存。



query\_outbound\_orders

查询出库单列表和状态。



query\_return\_orders

查询退货单列表和状态。

```



\---



\## 3. 禁止事项



```text

不要实现库存调整。

不要实现创建出库单。

不要实现确认出库。

不要实现创建退货单。

不要实现退货质检。

不要实现退货入库。

不要让 AI 自动修改订单状态。

不要让 AI 直接查数据库。

不要让 wms-ai-service 直接连接 MySQL。

不要让 LLM 生成 SQL。

不要改坏现有业务接口。

```



\---



\## 4. 后端新增接口



新增内部工具 Controller：



```text

wms-backend/src/main/java/com/yiweilai/wms/ai/controller/AiToolController.java

```



接口路径：



```http

POST /api/ai/tools/order/query

POST /api/ai/tools/order/search

POST /api/ai/tools/order/count-pending-outbound

POST /api/ai/tools/stock/query

POST /api/ai/tools/outbound/query

POST /api/ai/tools/return/query

```



注意：



```text

这些接口只给 wms-ai-service 调用。

前端不要直接调用。

必须校验 X-AI-Service-Token。

接口返回统一 Result<T>。

每次工具调用必须写 ai\_tool\_call\_log。

```



\---



\## 5. 后端新增 DTO



新增目录：



```text

wms-backend/src/main/java/com/yiweilai/wms/ai/dto/tool

```



新增 DTO：



```text

AiOrderQueryRequest.java

AiOrderSearchRequest.java

AiStockQueryRequest.java

AiOutboundQueryRequest.java

AiReturnQueryRequest.java

AiToolResult.java

```



建议字段：



```java

public class AiOrderQueryRequest {

&#x20;   private String orderNo;

&#x20;   private String platformOrderNo;

}



public class AiOrderSearchRequest {

&#x20;   private String keyword;

&#x20;   private String orderStatus;

&#x20;   private String receiverName;

&#x20;   private String receiverPhone;

&#x20;   private String startDate;

&#x20;   private String endDate;

&#x20;   private Integer page = 1;

&#x20;   private Integer size = 10;

}



public class AiStockQueryRequest {

&#x20;   private String skuCode;

&#x20;   private String skuName;

&#x20;   private Long warehouseId;

&#x20;   private Integer page = 1;

&#x20;   private Integer size = 10;

}



public class AiOutboundQueryRequest {

&#x20;   private String outboundNo;

&#x20;   private String orderNo;

&#x20;   private String status;

&#x20;   private Long warehouseId;

&#x20;   private Integer page = 1;

&#x20;   private Integer size = 10;

}



public class AiReturnQueryRequest {

&#x20;   private String returnNo;

&#x20;   private String orderNo;

&#x20;   private String status;

&#x20;   private Long warehouseId;

&#x20;   private Integer page = 1;

&#x20;   private Integer size = 10;

}

```



\---



\## 6. 后端新增 Tool Service



新增目录：



```text

wms-backend/src/main/java/com/yiweilai/wms/ai/tool

```



新增类：



```text

AiOrderToolService.java

AiStockToolService.java

AiOutboundToolService.java

AiReturnToolService.java

```



职责：



```text

AiOrderToolService：

复用 OrderService / OrderMapper 查询订单。

提供 queryOrderByNo、searchOrders、countPendingOutboundOrders。



AiStockToolService：

复用 StockService 查询库存。

提供 querySkuInventory。



AiOutboundToolService：

复用 OutboundService 查询出库单。

提供 queryOutboundOrders。



AiReturnToolService：

复用 ReturnService 查询退货单。

提供 queryReturnOrders。

```



要求：



```text

不要在 Controller 写业务查询逻辑。

Controller 只接收请求、校验 token、调用 ToolService、返回 Result。

ToolService 查询完成后必须记录 ai\_tool\_call\_log。

```



\---



\## 7. 工具调用日志要求



每次工具调用必须记录：



```text

user\_id

conversation\_id

message\_id

tool\_name

request\_params

response\_data

status

error\_message

created\_at

```



成功：



```text

status = SUCCESS

```



失败：



```text

status = FAILED

error\_message 写入失败原因

```



工具名称固定：



```text

query\_order\_by\_no

search\_orders

count\_pending\_outbound\_orders

query\_sku\_inventory

query\_outbound\_orders

query\_return\_orders

```



\---



\## 8. wms-ai-service 新增工具封装



新增或修改：



```text

wms-ai-service/app/tools/wms\_tools.py

```



工具列表：



```text

query\_order\_by\_no

search\_orders

count\_pending\_outbound\_orders

query\_sku\_inventory

query\_outbound\_orders

query\_return\_orders

```



每个工具通过 HTTP 调用 Spring Boot：



```text

WMS\_BACKEND\_URL=http://localhost:8080

AI\_SERVICE\_TOKEN=xxx

```



请求头必须带：



```http

X-AI-Service-Token: ${AI\_SERVICE\_TOKEN}

Content-Type: application/json

```



禁止：



```text

不要在 Python 里连接 MySQL。

不要在 Python 里写 SQL。

不要把数据库连接信息写到 wms-ai-service。

```



\---



\## 9. AI Agent 路由规则



修改：



```text

wms-ai-service/app/agent/wms\_agent.py

```



意图判断规则：



```text

用户问操作流程、系统规则、异常处理：

走 RAG 知识库。



用户问订单号、平台订单号、订单状态、收件人、手机号：

调用订单工具。



用户问 SKU、库存、仓库、库存不足：

调用库存工具。



用户问待拣货、拣货中、已发货、出库单：

调用出库工具。



用户问退货单、退货状态、质检、退货原因：

调用退货工具。



用户问“今天还有多少没出库”：

调用 count\_pending\_outbound\_orders。

```



\---



\## 10. 第二阶段系统提示词



更新 wms-ai-service 系统提示词：



```text

你是易仓 WMS 智能助手。

你可以回答知识库问题，也可以调用只读工具查询订单、库存、出库、退货数据。

涉及实时业务数据时，必须调用工具，不允许凭空回答。

工具返回为空时，明确说明未查询到。

工具调用失败时，说明失败原因。

不能编造订单、库存、出库、退货数据。

不能生成 SQL。

不能修改任何业务数据。

用户要求修改库存、创建出库、退货入库时，只说明该操作需要进入第三阶段确认流程，本阶段不能执行。

回答要简洁、准确，适合仓库人员理解。

```



\---



\## 11. 前端展示要求



修改：



```text

wsm-web/src/views/ai/AiAssistantView.vue

```



聊天回答中展示：



```text

AI 回答内容

调用了哪些工具

工具调用状态

引用来源 sources

失败原因

```



toolCalls 展示格式：



```text

工具：query\_sku\_inventory

状态：SUCCESS

```



如果 needConfirm=true，本阶段不执行，只提示：



```text

当前阶段不支持可写操作，请进入第三阶段实现确认机制。

```



\---



\## 12. 验收用例



\### 订单查询



用户输入：



```text

帮我查一下订单 SO202606140001

```



期望：



```text

调用 query\_order\_by\_no

返回真实订单信息

写 ai\_tool\_call\_log

```



\### 待出库统计



用户输入：



```text

今天还有多少订单没出库？

```



期望：



```text

调用 count\_pending\_outbound\_orders

返回统计数量

不编造数据

```



\### 库存查询



用户输入：



```text

SKU A001 现在还有多少库存？

```



期望：



```text

调用 query\_sku\_inventory

返回库存数量和仓库信息

```



\### 出库查询



用户输入：



```text

订单 SO202606140001 出库了吗？

```



期望：



```text

调用 query\_outbound\_orders

返回出库状态

```



\### 退货查询



用户输入：



```text

这个订单有没有退货？

```



期望：



```text

调用 query\_return\_orders

返回退货状态

```



\---



\## 13. 第二阶段验收标准



完成后必须满足：



```text

1\. 后端新增 /api/ai/tools/\*\* 只读接口。

2\. 接口必须校验 X-AI-Service-Token。

3\. wms-ai-service 可以调用这些工具接口。

4\. AI 可以查订单。

5\. AI 可以查库存。

6\. AI 可以查出库单。

7\. AI 可以查退货单。

8\. AI 可以统计待出库订单。

9\. 所有工具调用写入 ai\_tool\_call\_log。

10\. 工具返回空时 AI 不编造。

11\. 工具失败时 AI 返回明确错误。

12\. 不产生任何业务数据修改。

```



\---



\## 14. Agent 执行顺序



请按顺序执行：



```text

1\. 读取第一阶段 AI 模块代码。

2\. 读取 OrderController、StockController、OutboundController、ReturnController。

3\. 读取对应 Service、Mapper、DTO、VO。

4\. 设计只读 Tool DTO。

5\. 实现 AiToolController。

6\. 实现 AiOrderToolService。

7\. 实现 AiStockToolService。

8\. 实现 AiOutboundToolService。

9\. 实现 AiReturnToolService。

10\. 实现工具调用日志。

11\. 修改 wms-ai-service 的 wms\_tools.py。

12\. 修改 wms\_agent.py 工具选择逻辑。

13\. 修改前端 AI 助手页面展示 toolCalls。

14\. 编写测试用例或手动验证步骤。

```



\---



\## 15. Agent 输出格式



每次输出必须按以下格式：



```text

\## 本次分析



\## 本次修改目标



\## 修改文件



\## 新增文件



\## 关键代码



\## 运行方式



\## 验证方式



\## 下一步建议

```



\---



\## 16. 立即执行指令



请先执行分析，不要直接大改代码：



```text

读取第一阶段 AI 模块和现有订单、库存、出库、退货模块。

输出：

1\. 当前已有 AI 代码结构

2\. 可复用的业务 Service

3\. 第二阶段要新增的接口

4\. 第二阶段要新增的文件清单

5\. 第二阶段风险点

6\. 开发顺序

```



确认后再开始写代码。



