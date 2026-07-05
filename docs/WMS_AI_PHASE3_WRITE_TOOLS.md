\# WMS AI 第三阶段：可写业务操作与确认机制提示词



\## 0. 阶段目标



本阶段目标是在第二阶段「AI 只读业务查询工具」基础上，新增可写业务操作能力。



注意：可写操作风险高，必须先确认，再执行。



```text

目标：

1\. AI 可以生成业务操作计划。

2\. 用户确认后，后端才执行业务操作。

3\. 支持创建出库单。

4\. 支持确认出库。

5\. 支持创建退货单。

6\. 支持退货质检。

7\. 支持确认退货入库。

8\. 支持库存调整。

9\. 所有可写操作必须校验权限。

10\. 所有可写操作必须写 ai\_tool\_call\_log。

11\. 所有可写操作必须写 operation\_log。

12\. 所有可写操作必须使用事务。

```



\---



\## 1. 前置条件



开始第三阶段前，必须确认第二阶段已经完成：



```text

1\. AI 可以查订单。

2\. AI 可以查库存。

3\. AI 可以查出库单。

4\. AI 可以查退货单。

5\. AI 可以统计待出库订单。

6\. 所有只读工具调用已写 ai\_tool\_call\_log。

7\. wms-ai-service 不直接连接 MySQL。

8\. LLM 不生成 SQL。

```



如果第二阶段未完成，不要开始第三阶段。



\---



\## 2. 第三阶段核心原则



```text

AI 不直接执行可写操作。

AI 只能生成操作计划。

用户点击确认后，Spring Boot 后端执行。

后端执行前必须校验权限。

后端执行前必须校验参数。

后端执行必须使用事务。

执行成功必须写 ai\_tool\_call\_log 和 operation\_log。

执行失败必须回滚并返回错误。

```



\---



\## 3. 第三阶段新增能力



新增可写工具：



```text

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

```



\---



\## 4. 禁止事项



```text

不要跳过用户确认。

不要让 wms-ai-service 直接调用原业务写接口。

不要让 LLM 直接执行写操作。

不要让 LLM 生成 SQL。

不要让 Python 服务连接 MySQL。

不要绕过 Spring Security。

不要绕过权限校验。

不要绕过 Service 层直接改 Mapper。

不要吞掉异常。

不要执行无日志的操作。

不要让 AI 自动批量修改大量数据。

```



\---



\## 5. 新增确认机制



新增确认表：



```text

ai\_pending\_action

```



新增 SQL 文件：



```text

wms-backend/sql/V20260614\_\_ai\_pending\_action.sql

```



SQL：



```sql

CREATE TABLE IF NOT EXISTS ai\_pending\_action (

&#x20;   id BIGINT PRIMARY KEY AUTO\_INCREMENT COMMENT '待确认操作ID',

&#x20;   user\_id BIGINT NOT NULL COMMENT '用户ID',

&#x20;   conversation\_id BIGINT DEFAULT NULL COMMENT '会话ID',

&#x20;   action\_type VARCHAR(100) NOT NULL COMMENT '操作类型',

&#x20;   action\_name VARCHAR(100) NOT NULL COMMENT '操作名称',

&#x20;   request\_params JSON NOT NULL COMMENT '待执行参数',

&#x20;   risk\_level VARCHAR(30) NOT NULL DEFAULT 'MEDIUM' COMMENT '风险等级：LOW/MEDIUM/HIGH',

&#x20;   status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING/CONFIRMED/EXECUTED/CANCELLED/FAILED/EXPIRED',

&#x20;   expire\_at DATETIME NOT NULL COMMENT '过期时间',

&#x20;   confirmed\_at DATETIME DEFAULT NULL COMMENT '确认时间',

&#x20;   executed\_at DATETIME DEFAULT NULL COMMENT '执行时间',

&#x20;   result\_data JSON DEFAULT NULL COMMENT '执行结果',

&#x20;   error\_message TEXT DEFAULT NULL COMMENT '错误信息',

&#x20;   created\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP COMMENT '创建时间',

&#x20;   updated\_at DATETIME NOT NULL DEFAULT CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP COMMENT '更新时间',

&#x20;   KEY idx\_user\_id (user\_id),

&#x20;   KEY idx\_conversation\_id (conversation\_id),

&#x20;   KEY idx\_status (status),

&#x20;   KEY idx\_action\_type (action\_type),

&#x20;   KEY idx\_expire\_at (expire\_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI待确认操作表';

```



\---



\## 6. 后端新增模块



新增 entity：



```text

wms-backend/src/main/java/com/yiweilai/wms/ai/entity/AiPendingAction.java

```



新增 mapper：



```text

wms-backend/src/main/java/com/yiweilai/wms/ai/mapper/AiPendingActionMapper.java

wms-backend/src/main/resources/mapper/ai/AiPendingActionMapper.xml

```



新增 service：



```text

wms-backend/src/main/java/com/yiweilai/wms/ai/service/AiPendingActionService.java

wms-backend/src/main/java/com/yiweilai/wms/ai/service/AiWriteToolService.java

```



新增 controller：



```text

wms-backend/src/main/java/com/yiweilai/wms/ai/controller/AiActionController.java

```



新增 dto：



```text

wms-backend/src/main/java/com/yiweilai/wms/ai/dto/action/AiPendingActionVO.java

wms-backend/src/main/java/com/yiweilai/wms/ai/dto/action/AiCreateActionRequest.java

wms-backend/src/main/java/com/yiweilai/wms/ai/dto/action/AiConfirmActionRequest.java

wms-backend/src/main/java/com/yiweilai/wms/ai/dto/action/AiActionExecuteResult.java

```



\---



\## 7. 新增确认接口



\### 创建待确认操作



```http

POST /api/ai/actions/pending

```



用途：



```text

wms-ai-service 根据用户意图生成操作计划。

Spring Boot 保存为 PENDING 状态。

返回 actionId 给前端。

```



响应示例：



```json

{

&#x20; "actionId": 1001,

&#x20; "actionType": "create\_outbound\_order",

&#x20; "actionName": "创建出库单",

&#x20; "riskLevel": "MEDIUM",

&#x20; "summary": "将为订单 SO202606140001 创建出库单",

&#x20; "needConfirm": true,

&#x20; "expireAt": "2026-06-14 23:59:59"

}

```



\### 获取待确认操作详情



```http

GET /api/ai/actions/{actionId}

```



\### 确认可写操作



```http

POST /api/ai/actions/{actionId}/confirm

```



\### 取消可写操作



```http

POST /api/ai/actions/{actionId}/cancel

```



\### 查询当前用户待确认操作



```http

GET /api/ai/actions/pending

```



\---



\## 8. 可写工具执行规则



状态流转：



```text

PENDING

用户确认后 → CONFIRMED

后端执行中 → EXECUTED / FAILED

用户取消 → CANCELLED

超过过期时间 → EXPIRED

```



执行前必须检查：



```text

1\. actionId 是否存在。

2\. action.userId 是否等于当前登录用户。

3\. action.status 是否为 PENDING。

4\. action.expireAt 是否未过期。

5\. 当前用户是否有权限执行该操作。

6\. request\_params 是否完整。

7\. 业务对象是否存在。

8\. 业务状态是否允许修改。

```



\---



\## 9. 权限建议



第三阶段至少需要权限控制。



建议新增权限编码：



```text

AI\_OUTBOUND\_CREATE

AI\_OUTBOUND\_CONFIRM

AI\_RETURN\_CREATE

AI\_RETURN\_CHECK

AI\_RETURN\_CONFIRM

AI\_STOCK\_ADJUST

```



映射到操作：



```text

create\_outbound\_order  → AI\_OUTBOUND\_CREATE

confirm\_outbound\_order → AI\_OUTBOUND\_CONFIRM

create\_return\_order    → AI\_RETURN\_CREATE

check\_return\_order     → AI\_RETURN\_CHECK

confirm\_return\_order   → AI\_RETURN\_CONFIRM

adjust\_stock           → AI\_STOCK\_ADJUST

```



如果项目当前没有细粒度按钮权限拦截，可以先在 Service 层做角色判断：



```text

SUPER\_ADMIN：允许全部 AI 可写操作

WAREHOUSE\_ADMIN：允许出库、退货、库存相关操作

OPERATOR：只允许低风险操作，库存调整禁止

VIEWER：禁止所有可写操作

```



\---



\## 10. 风险等级



可写工具风险等级：



```text

create\_outbound\_order：MEDIUM

confirm\_outbound\_order：HIGH

create\_return\_order：MEDIUM

check\_return\_order：MEDIUM

confirm\_return\_order：HIGH

adjust\_stock：HIGH

```



高风险操作要求：



```text

必须二次确认。

前端确认弹窗显示红色警告。

后端必须写 operation\_log。

后端必须写 ai\_tool\_call\_log。

```



\---



\## 11. 可写工具参数



\### 创建出库单



```json

{

&#x20; "orderId": 1,

&#x20; "warehouseId": 1,

&#x20; "remark": "AI助手创建出库单"

}

```



执行时复用：



```text

OutboundService.create(...)

```



\---



\### 确认出库



```json

{

&#x20; "outboundId": 1,

&#x20; "trackingNo": "SF123456",

&#x20; "expressCompanyId": 1,

&#x20; "shippingFee": 8.5

}

```



执行时复用：



```text

OutboundService.confirm(...)

```



\---



\### 创建退货单



```json

{

&#x20; "orderId": 1,

&#x20; "warehouseId": 1,

&#x20; "reason": "客户退货",

&#x20; "remark": "AI助手创建退货单"

}

```



执行时复用：



```text

ReturnService.create(...)

```



\---



\### 退货质检



```json

{

&#x20; "returnId": 1,

&#x20; "items": \[

&#x20;   {

&#x20;     "itemId": 10,

&#x20;     "qualityStatus": "SELLABLE"

&#x20;   }

&#x20; ]

}

```



执行时复用：



```text

ReturnService.check(...)

```



\---



\### 确认退货入库



```json

{

&#x20; "returnId": 1

}

```



执行时复用：



```text

ReturnService.confirm(...)

```



\---



\### 库存调整



```json

{

&#x20; "skuId": 1,

&#x20; "warehouseId": 1,

&#x20; "quantityChange": 10,

&#x20; "remark": "AI助手库存调整"

}

```



执行时复用：



```text

StockService.adjust(...)

```



\---



\## 12. wms-ai-service 修改



修改：



```text

wms-ai-service/app/agent/wms\_agent.py

wms-ai-service/app/tools/wms\_tools.py

```



第三阶段逻辑：



```text

用户提出可写操作

↓

AI 不直接调用写接口

↓

AI 生成 action plan

↓

调用 Spring Boot /api/ai/actions/pending 创建待确认操作

↓

返回 needConfirm=true 和 actionId

↓

前端展示确认卡片

↓

用户点击确认

↓

前端调用 /api/ai/actions/{actionId}/confirm

↓

Spring Boot 校验权限和状态

↓

Spring Boot 调用原业务 Service 执行

↓

记录 ai\_tool\_call\_log 和 operation\_log

↓

返回执行结果

```



\---



\## 13. AI 系统提示词



第三阶段系统提示词：



```text

你是易仓 WMS 智能助手。

你可以帮助用户生成订单、库存、出库、退货相关操作计划。

涉及修改业务数据时，你不能直接执行。

你必须先生成待确认操作，返回 needConfirm=true。

你必须说明将要执行什么操作、影响哪些业务对象、风险等级是什么。

用户确认前，不能调用任何可写业务工具。

用户取消时，不能执行操作。

工具执行失败时，必须明确说明失败原因。

不能编造数据。

不能生成 SQL。

不能绕过权限。

回答要简洁、准确，适合仓库人员理解。

```



\---



\## 14. 前端新增确认卡片



修改：



```text

wsm-web/src/views/ai/AiAssistantView.vue

```



新增确认卡片组件：



```text

wsm-web/src/components/ai/AiActionConfirmCard.vue

```



确认卡片展示：



```text

操作名称

操作类型

风险等级

操作摘要

影响对象

参数详情

过期时间

确认按钮

取消按钮

```



高风险样式：



```text

riskLevel = HIGH 时使用红色警告样式。

确认按钮文案：确认执行高风险操作。

```



前端调用：



```text

POST /api/ai/actions/{actionId}/confirm

POST /api/ai/actions/{actionId}/cancel

```



\---



\## 15. 后端执行日志



执行成功必须写：



```text

ai\_tool\_call\_log

operation\_log

```



ai\_tool\_call\_log：



```text

tool\_name = create\_outbound\_order / confirm\_outbound\_order / ...

status = SUCCESS / FAILED

request\_params = action.request\_params

response\_data = 执行结果

```



operation\_log：



```text

module = AI\_ASSISTANT

action = 对应操作名称

target\_type = 订单 / 出库单 / 退货单 / 库存

target\_id = 业务ID

detail = AI助手经用户确认后执行

```



\---



\## 16. 事务要求



以下操作必须加事务：



```text

create\_outbound\_order

confirm\_outbound\_order

create\_return\_order

check\_return\_order

confirm\_return\_order

adjust\_stock

```



要求：



```text

业务执行失败时回滚。

日志写入失败不能导致业务部分成功部分失败。

建议业务操作和关键日志在同一事务内。

```



\---



\## 17. 第三阶段验收用例



\### 创建出库单



用户输入：



```text

帮我给订单 SO202606140001 创建出库单

```



期望：



```text

AI 返回操作计划。

needConfirm=true。

生成 ai\_pending\_action。

前端显示确认卡片。

用户确认后调用 OutboundService.create。

写 ai\_tool\_call\_log。

写 operation\_log。

```



\---



\### 确认出库



用户输入：



```text

帮我确认出库单 OB202606140001，快递单号 SF123456

```



期望：



```text

AI 返回高风险操作计划。

riskLevel=HIGH。

用户确认后才执行。

执行后扣减库存。

失败必须回滚。

```



\---



\### 创建退货单



用户输入：



```text

帮我给订单 SO202606140001 创建退货单，原因是客户不喜欢

```



期望：



```text

AI 创建待确认操作。

用户确认后调用 ReturnService.create。

```



\---



\### 退货质检



用户输入：



```text

把退货单 RT202606140001 质检为可售

```



期望：



```text

AI 创建待确认操作。

用户确认后调用 ReturnService.check。

```



\---



\### 确认退货入库



用户输入：



```text

帮我确认退货单 RT202606140001 入库

```



期望：



```text

riskLevel=HIGH。

用户确认后调用 ReturnService.confirm。

库存变化正确。

```



\---



\### 库存调整



用户输入：



```text

帮我把 SKU A001 的库存增加 10 件

```



期望：



```text

riskLevel=HIGH。

用户确认后调用 StockService.adjust。

写库存流水。

写 AI 工具日志。

写 operation\_log。

```



\---



\## 18. 第三阶段验收标准



完成后必须满足：



```text

1\. AI 遇到可写操作时不会直接执行。

2\. AI 会生成 ai\_pending\_action。

3\. 前端会显示确认卡片。

4\. 用户确认后才执行。

5\. 用户取消后不执行。

6\. 超时操作不能执行。

7\. 权限不足不能执行。

8\. 参数不完整不能执行。

9\. 执行失败必须回滚。

10\. 成功写 ai\_tool\_call\_log。

11\. 成功写 operation\_log。

12\. 高风险操作有明显提示。

13\. VIEWER 角色不能执行任何可写操作。

14\. wms-ai-service 不直接连接数据库。

15\. LLM 不生成 SQL。

```



\---



\## 19. Agent 执行顺序



请按顺序执行：



```text

1\. 检查第二阶段代码是否完成。

2\. 新增 ai\_pending\_action 表。

3\. 新增 AiPendingAction entity / mapper / xml。

4\. 新增 AiPendingActionService。

5\. 新增 AiActionController。

6\. 新增 AiWriteToolService。

7\. 复用 OutboundService、ReturnService、StockService。

8\. 增加权限校验。

9\. 增加风险等级。

10\. 增加操作日志。

11\. 修改 wms-ai-service，让可写操作只生成 pending action。

12\. 修改前端 AI 聊天页面。

13\. 新增 AiActionConfirmCard.vue。

14\. 测试创建出库、确认出库、创建退货、退货质检、退货入库、库存调整。

```



\---



\## 20. Agent 输出格式



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



\## 21. 立即执行指令



请先执行分析，不要直接大改代码：



```text

检查第二阶段只读工具是否完成。

然后输出：

1\. 可写操作涉及的已有 Service

2\. 需要新增的确认机制文件

3\. ai\_pending\_action 表结构确认

4\. 权限校验方案

5\. 风险等级方案

6\. 第三阶段开发顺序

7\. 可能影响库存和订单状态的风险点

```



确认后再开始写代码。



