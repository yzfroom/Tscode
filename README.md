# HallQueue — 政务大厅预约取号与排队叫号后端服务

面向政务服务大厅的**线上预约取号 + 现场取号 + 窗口排队叫号**后端服务。
办事群众可线上预约指定业务事项的号源时段并取得排队号，也可到大厅现场取号；窗口工作人员按队列依次叫号、办理、办结，支持过号处理。

技术栈：**Node.js 24 + TypeScript + Express 5 + SQLite（better-sqlite3）**。零外部服务依赖，开箱即跑。

---

## 快速开始

```bash
# 1. 安装依赖（已内置预编译二进制，无需编译工具链）
npm install

# 2. 启动服务（首次启动自动建库并写入基础数据）
npm start
# → HallQueue listening on http://localhost:3000

# 3. 验证
curl http://localhost:3000/health
# → {"status":"ok"}
```

可选环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `DB_PATH` | `data/hall-queue.db` | SQLite 数据库文件路径 |

其他脚本：

```bash
npm run typecheck   # TypeScript 类型门禁（tsc --noEmit）
npm test            # 运行测试套件（vitest）
npm run seed        # 单独初始化基础数据（幂等）
```

---

## 业务模型

```
hall（大厅）
  └─ service_type（业务类型，如「社保卡办理」，前缀决定展示号 A/B）
       └─ slot（号源时段：业务类型 × 日期 × 时段，含 capacity / booked）
counter（窗口）                          ticket（取号记录）
```

- **展示号**（如 `A001`）= 业务类型前缀 + 3 位序号，仅用于展示。
  **接口 URL 一律使用内部自增 `id`**。
- **号序 `seq`** 是「当日该业务类型内」的排队序号，`UNIQUE(service_type_id, service_date, seq)` 保证不重复。
- **现场取号**的 `slot_id` 为 `NULL`（不占预约名额）。

### 号码状态机

```
[waiting] ──call──> [called] ──start──> [serving] ──finish──> [done]
    │                   │
    │                   └── pass ──> [passed]   （终态：过号作废，需重新取号）
    │
    ├── cancel ──> [cancelled]        （取消预约会释放 slot 名额）
    └── expire ──> [expired]          （保留状态，供后续日终清理）
```

| 转换 | 接口 | 允许的前置状态 |
|---|---|---|
| `waiting → called` | `POST /api/tickets/:id/call`、`POST /api/counters/:id/call-next` | waiting |
| `called → serving` | `POST /api/tickets/:id/start` | called |
| `serving → done` | `POST /api/tickets/:id/finish` | serving |
| `called → passed` | `POST /api/tickets/:id/pass` | called |
| `waiting/called → cancelled` | `POST /api/tickets/:id/cancel` | waiting, called |

非法转换统一返回 `409 INVALID_STATE_TRANSITION`，`details` 中带 `{ from, required }`。

> **过号规则**：按业务约定为「**过号作废**」——`passed` 为终态，需重新取号。
> 配置开关位于 `src/config/index.ts` 的 `business.allowRequeueAfterPassed`（当前为 `false`）。

---

## API 契约

统一前缀 `/api`，响应 `application/json`。列表类响应统一包在 `{ "data": ... }` 中。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | GET | `/health` | 健康检查 |
| 2 | GET | `/api/service-types?hallId=` | 业务类型列表 |
| 3 | GET | `/api/slots?serviceTypeId=&date=` | 某业务类型某日的时段与余量 |
| 4 | POST | `/api/appointments` | 创建线上预约 |
| 5 | POST | `/api/tickets/walk-in` | 现场取号 |
| 6 | GET | `/api/tickets/:id` | 号码状态 + 排队进度 |
| 7 | POST | `/api/counters/:id/call-next` | 叫下一位（取队首） |
| 8 | POST | `/api/tickets/:id/call` | 指定叫号 |
| 9 | POST | `/api/tickets/:id/start` | 开始办理 |
| 10 | POST | `/api/tickets/:id/finish` | 办结 |
| 11 | POST | `/api/tickets/:id/pass` | 过号（终态） |
| 12 | POST | `/api/tickets/:id/cancel` | 取消（释放名额） |

### 请求 / 响应示例

**创建预约** `POST /api/appointments`

```json
// Request
{ "slotId": 1, "idCard": "110101199001011234", "phone": "13800000001" }
// 201 Created
{ "data": { "ticketId": 1, "ticketNo": "A001", "seq": 1, "status": "waiting",
            "source": "appointment", "slotId": 1, "aheadCount": 0,
            "estimatedWaitMinutes": 0 } }
```

**叫下一位** `POST /api/counters/1/call-next`

```json
// Request
{ "serviceTypeId": 1 }
// 200 OK
{ "data": { "ticketId": 1, "ticketNo": "A001", "status": "called",
            "counterId": 1, "counterNo": "1号窗口", "calledAt": "..." } }
```

**查询号码** `GET /api/tickets/2`

```json
{ "data": { "ticketId": 2, "ticketNo": "A002", "status": "waiting",
            "aheadCount": 1, "estimatedWaitMinutes": 5 } }
```

### 统一错误响应

```json
{ "error": { "code": "SLOT_FULL", "message": "该时段号源已约满",
             "details": { "slotId": 3, "capacity": 2, "booked": 2 } } }
```

| HTTP | 错误码 | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 参数校验失败（`details.issues` 逐字段说明） |
| 404 | `SLOT_NOT_FOUND` / `TICKET_NOT_FOUND` / `COUNTER_NOT_FOUND` / `SERVICE_TYPE_NOT_FOUND` / `ROUTE_NOT_FOUND` | 资源不存在 |
| 409 | `SLOT_FULL` / `SLOT_NOT_OPEN` / `SERVICE_NOT_SUPPORT_APPOINTMENT` / `DUPLICATE_APPOINTMENT` / `DUPLICATE_WALKIN_TICKET` / `INVALID_STATE_TRANSITION` / `QUEUE_EMPTY` | 业务冲突 |
| 500 | `INTERNAL_ERROR` | 未预期异常（内部细节不外泄） |

---

## 并发与幂等设计

| 关注点 | 实现方式 |
|---|---|
| **防超卖** | `UPDATE slot SET booked = booked + 1 WHERE id = ? AND is_open = 1 AND booked < capacity`，以 `changes === 0` 判定失败，无需应用层加锁 |
| **叫号不重号** | 单事务内「`SELECT` 队首 → 条件 `UPDATE (waiting→called)`」；`changes === 0` 表示被其他窗口抢占，返回 `QUEUE_EMPTY` |
| **号序原子** | 同一写事务内 `SELECT COALESCE(MAX(seq),0)+1` → `INSERT`；`UNIQUE(service_type_id, service_date, seq)` 作为最终防线 |
| **重复取号幂等** | DB 部分唯一索引兜底（`uq_ticket_dedupe` / `uq_ticket_slot_holder`，仅对非终态记录生效），应用层捕获唯一约束错误转 409 |
| **取消可再约** | 部分唯一索引带 `WHERE status NOT IN ('cancelled','expired')`，取消后自动放行 |
| **写锁竞争** | `journal_mode=WAL` + `busy_timeout=5000` |

---

## 项目结构

```
src/
├── server.ts                 # 入口：建库 → seed → listen
├── app.ts                    # 组装 express app（导出供测试复用）
├── config/index.ts           # 端口 / DB 路径 / 业务开关
├── db/
│   ├── index.ts              # 连接、pragma、migrate
│   ├── schema.sql            # 全部 DDL（幂等）
│   └── seed.ts               # 基础数据（幂等）
├── types/
│   ├── domain.ts             # 领域类型（as const + union，禁用 enum）
│   └── api.ts                # 请求/响应 DTO
├── repositories/             # 只写 SQL，不含业务判断
├── services/                 # 业务规则 + 事务边界
├── routes/                   # 只做 HTTP 解析与响应组装
├── validators/schemas.ts     # zod schema
├── middlewares/              # validate / errorHandler
└── utils/                    # errors / time / ticketNo
tests/
├── helpers/testDb.ts         # :memory: 建库 + seed
├── appointment.test.ts       # 预约、超卖、幂等、取消
├── queue.test.ts             # 叫号、并发、过号、状态机
└── http.test.ts              # HTTP 层集成（supertest）
```

**依赖方向（单向）**：`routes → services → repositories → db`；`types` / `utils` 被各层依赖且自身无依赖。

---

## 验证记录（实测证据）

环境：Node **v24.21.0**、npm 11.19.0、Windows（Git Bash）。

### 1. 依赖安装

```
$ npm install
added 140 packages, and audited 141 packages in 2m
found 0 vulnerabilities
exit 0
```

better-sqlite3 使用包内预编译二进制（`prebuilds/win32-x64.node`，`gypfile: false`），**无 node-gyp 编译**。

### 2. 类型门禁

```
$ node node_modules/typescript/bin/tsc --noEmit
（无输出）
exit 0
```

### 3. 测试套件

```
$ node node_modules/vitest/vitest.mjs run
 ✓ tests/http.test.ts        (14 tests) 156ms
 ✓ tests/queue.test.ts       (11 tests)  32ms
 ✓ tests/appointment.test.ts  (9 tests)  27ms
 Test Files  3 passed (3)
      Tests  34 passed (34)
exit 0
```

覆盖的关键用例：超卖拒绝、并发叫号不重号、非法状态转换、幂等重复取号、取消释放名额、
过号推进队列、队列空、业务类型不存在、参数校验、404 兜底。

### 4. 真实 HTTP 冒烟（服务实跑）

主流程（全部实测通过）：

| 步骤 | 请求 | 结果 |
|---|---|---|
| 1 | `GET /api/service-types` | 200，返回 2 个业务类型 |
| 2 | `GET /api/slots?serviceTypeId=1&date=<today>` | 200，返回 3 个时段带 `remaining` |
| 3 | `POST /api/appointments` slotId=1 | **201**，`ticketNo=A001`，`seq=1` |
| 4 | `POST /api/tickets/walk-in` | **201**，`ticketNo=A002`，`aheadCount=1` |
| 5 | `GET /api/tickets/2` | 200，`aheadCount=1`，`estimatedWaitMinutes=5` |
| 6 | `POST /api/counters/1/call-next` | 200，叫到 `A001`，`status=called`，`counterNo=1号窗口` |
| 7 | `POST /api/tickets/1/start` | 200，`status=serving` |
| 8 | `POST /api/tickets/1/finish` | 200，`status=done`，`finishedAt` 已写 |

异常路径（全部实测通过）：

| 场景 | 期望 | 实测结果 |
|---|---|---|
| slot 容量 2 连约 3 次 | 第 3 次拒绝 | **409** `SLOT_FULL`，`details: {capacity:2, booked:2}` |
| 对已 `done` 的票再叫号 | 拒绝 | **409** `INVALID_STATE_TRANSITION`，`details: {from:"done", required:["waiting"]}` |
| 非法手机号 `"123"` | 拒绝 | **400** `VALIDATION_ERROR`，`issues:[{path:"phone",...}]` |
| 同证件重复现场取号 | 拒绝 | **409** `DUPLICATE_WALKIN_TICKET` |
| 空队列叫号 | 拒绝 | **409** `QUEUE_EMPTY` |
| 访问不存在路由 | 拒绝 | **404** `ROUTE_NOT_FOUND` |

过号作废验证：`call-next`(A002) → `pass`(A002→passed) → `call-next` 推进到 **A003**，
确认过号号不再参与队列。

### 5. 数据不变量核验（直查数据库）

```
超卖记录数（booked > capacity，应为 0）: 0
重复号序数（同类型同日同 seq，应为 0）: 0
```

---

## 部署说明

单进程 Node 服务，无外部依赖（数据库为本地文件）。

1. 在目标机器安装 Node ≥ 22（本项目在 24.21.0 实测）
2. 拉取代码后 `npm ci`（严格按 lockfile 安装）
3. 通过环境变量注入 `PORT` / `DB_PATH`（**生产环境务必把 `DB_PATH` 指向持久化磁盘**）
4. 启动：`node src/server.ts`（建议用 systemd / pm2 等进程管理器托管，并配置日志轮转）
5. 健康检查：`GET /health`

### 回滚

- 代码回滚：切回上一版本目录 / commit，重启进程
- 数据回滚：SQLite 单文件，回滚前备份 `DB_PATH` 指向的 `.db` 文件即可整库还原
- 本版本无破坏性 DDL 迁移，schema 全部为 `CREATE ... IF NOT EXISTS`，可安全重复执行

---

## 已知限制

1. **无鉴权**：本版本不含用户注册登录 / JWT / 角色权限（按需求约定为「仅核心」）。
   窗口叫号类接口目前任何人可调用，**生产使用前必须补充鉴权与操作审计**。
2. **单大厅语义**：表结构已含 `hall_id` 字段以预留多大厅，但接口层未做大厅维度的隔离校验。
3. **无预约时段时间窗校验**：未校验「预约时段是否已过」「预约日期是否在可预约范围内」，
   也未接入大厅开关门时间（`hall.open_time` / `close_time`）约束取号。
4. **`expired` 状态未落定时任务**：状态已定义，但日终自动过期清理未实现。
5. **无叫号通知**：不含短信 / 大屏 / 语音叫号推送。
6. **单进程假设**：并发正确性依赖「单进程 + SQLite 写事务串行化」。
   若未来横向扩展为多进程 / 多实例，需改为独立的号源与队列协调机制（如 MySQL 行锁 + 唯一约束）。
7. **测试运行方式**：需用 `node node_modules/vitest/vitest.mjs run`（或 `npm test`）调用，
   因项目为 ESM 且 Node 原生执行 `.ts` 时不重写导入说明符。

---

## 工程约定（供后续维护）

- **ESM + Node 原生 TypeScript**：`package.json` 为 `"type": "module"`；
  相对导入**必须写 `.ts` 扩展名**（Node 原生 strip-types 不重写说明符），
  tsconfig 已开 `allowImportingTsExtensions`。
- **禁用 `enum`**：Node 原生执行 TS 不支持 enum，状态等常量一律用
  `as const` 对象 + 联合类型（见 `src/types/domain.ts`）。
- **Express 5**：async 路由抛出的异常会自动进入错误中间件，**无需 `asyncHandler` 包装**；
  路由只用具体路径，避免 path-to-regexp 8.x 的 `*` 通配符与可选段语法变更。
- **分层纪律**：`repositories` 只写 SQL；`services` 不碰 `req`/`res`；`routes` 不含业务规则。
