-- HallQueue 数据库结构
-- 说明：所有 DDL 均为幂等（IF NOT EXISTS），服务启动与测试建库都执行本文件。

-- 大厅（为多大厅预留 hall_id，本版本仅使用单大厅）
CREATE TABLE IF NOT EXISTS hall (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  address     TEXT,
  open_time   TEXT    NOT NULL DEFAULT '09:00',
  close_time  TEXT    NOT NULL DEFAULT '17:00',
  status      TEXT    NOT NULL DEFAULT 'open',
  created_at  TEXT    NOT NULL
);

-- 业务事项 / 业务类型（如「社保卡办理」）
CREATE TABLE IF NOT EXISTS service_type (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id       INTEGER NOT NULL REFERENCES hall(id),
  name          TEXT    NOT NULL,
  prefix        TEXT    NOT NULL,               -- 展示号前缀，如 'A'
  supports_appt INTEGER NOT NULL DEFAULT 1,     -- 是否支持线上预约 0/1
  est_minutes   INTEGER NOT NULL DEFAULT 5,     -- 预计办理时长（分钟）
  status        TEXT    NOT NULL DEFAULT 'active',
  created_at    TEXT    NOT NULL,
  UNIQUE (hall_id, prefix)
);
CREATE INDEX IF NOT EXISTS idx_service_type_hall ON service_type (hall_id, status);

-- 号源时段池：某业务类型某日某时段的可预约名额
CREATE TABLE IF NOT EXISTS slot (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  service_type_id INTEGER NOT NULL REFERENCES service_type(id),
  service_date    TEXT    NOT NULL,             -- 'YYYY-MM-DD'
  start_time      TEXT    NOT NULL,             -- 'HH:mm'
  end_time        TEXT    NOT NULL,             -- 'HH:mm'
  capacity        INTEGER NOT NULL,
  booked          INTEGER NOT NULL DEFAULT 0,   -- 已预约数（条件 UPDATE 原子递增）
  is_open         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL,
  UNIQUE (service_type_id, service_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_slot_lookup ON slot (service_type_id, service_date, is_open);

-- 窗口（须先于 ticket 定义：ticket.counter_id 引用本表）
CREATE TABLE IF NOT EXISTS counter (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_id            INTEGER NOT NULL REFERENCES hall(id),
  counter_no         TEXT    NOT NULL,          -- 如 '1号窗口'
  current_service_id INTEGER REFERENCES service_type(id),
  current_ticket_id  INTEGER,                   -- 当前叫到的号（后置加 FK，避免与 ticket 循环引用）
  status             TEXT    NOT NULL DEFAULT 'idle',
  UNIQUE (hall_id, counter_no)
);
CREATE INDEX IF NOT EXISTS idx_counter_hall ON counter (hall_id, status);

-- 取号记录
CREATE TABLE IF NOT EXISTS ticket (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no       TEXT    NOT NULL,             -- 展示号，如 'A001'
  service_type_id INTEGER NOT NULL REFERENCES service_type(id),
  slot_id         INTEGER REFERENCES slot(id),  -- 现场取号为 NULL
  service_date    TEXT    NOT NULL,             -- 用于当日队列隔离
  seq             INTEGER NOT NULL,             -- 当日该业务类型内排队序号
  source          TEXT    NOT NULL,             -- appointment | walk_in
  holder_id_card  TEXT    NOT NULL,             -- 证件号（幂等键组成部分）
  holder_phone    TEXT,
  status          TEXT    NOT NULL DEFAULT 'waiting',
  counter_id      INTEGER REFERENCES counter(id),
  called_at       TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  created_at      TEXT    NOT NULL,
  -- 号序不重复的最终防线
  UNIQUE (service_type_id, service_date, seq)
);

-- 排队核心索引：叫下一位 = 按 status='waiting' ORDER BY seq 取队首
CREATE INDEX IF NOT EXISTS idx_ticket_queue
  ON ticket (service_type_id, service_date, status, seq);

-- 幂等兜底 1：同业务类型同日同证件仅允许一张活跃号
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_dedupe
  ON ticket (service_type_id, service_date, holder_id_card)
  WHERE status NOT IN ('cancelled', 'expired');

-- 幂等兜底 2：同一 slot 同证件仅允许一张活跃号
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_slot_holder
  ON ticket (slot_id, holder_id_card)
  WHERE slot_id IS NOT NULL AND status NOT IN ('cancelled', 'expired');
