/**
 * 初始化基础数据：大厅、业务类型、窗口、当日号源时段。
 * 幂等：重复执行不会重复插入（按唯一键判重）。
 *
 * 使用：node src/db/seed.ts
 */
import { createDb, type Db } from './index.ts';
import { config } from '../config/index.ts';
import { nowIso, today } from '../utils/time.ts';

interface SeedServiceType {
  name: string;
  prefix: string;
  supportsAppt: number;
  estMinutes: number;
  /** 当日时段：[开始, 结束, 容量] */
  slots: Array<[string, string, number]>;
}

const SEED_SERVICE_TYPES: SeedServiceType[] = [
  {
    name: '社保卡办理',
    prefix: 'A',
    supportsAppt: 1,
    estMinutes: 5,
    slots: [
      ['09:00', '09:30', 3],
      ['09:30', '10:00', 3],
      ['10:00', '10:30', 2],
    ],
  },
  {
    name: '不动产登记查询',
    prefix: 'B',
    supportsAppt: 1,
    estMinutes: 8,
    slots: [
      ['09:00', '09:30', 2],
      ['10:00', '10:30', 2],
    ],
  },
];

export function seed(db: Db, opts: { serviceDate?: string } = {}): void {
  const serviceDate = opts.serviceDate ?? today();
  const now = nowIso();

  db.transaction(() => {
    // 大厅
    let hall = db.prepare<[], { id: number }>('SELECT id FROM hall ORDER BY id LIMIT 1').get();
    if (!hall) {
      const info = db
        .prepare('INSERT INTO hall (name, address, created_at) VALUES (?, ?, ?)')
        .run('市民服务中心', '示例市示例区示例路 1 号', now);
      hall = { id: Number(info.lastInsertRowid) };
    }
    const hallId = hall.id;

    // 窗口
    const counterCount = db
      .prepare<[number], { c: number }>('SELECT COUNT(*) AS c FROM counter WHERE hall_id = ?')
      .get(hallId)!.c;
    if (counterCount === 0) {
      const ins = db.prepare('INSERT INTO counter (hall_id, counter_no, status) VALUES (?, ?, ?)');
      ins.run(hallId, '1号窗口', 'idle');
      ins.run(hallId, '2号窗口', 'idle');
    }

    // 业务类型 + 号源时段
    for (const st of SEED_SERVICE_TYPES) {
      let row = db
        .prepare<[number, string], { id: number }>(
          'SELECT id FROM service_type WHERE hall_id = ? AND prefix = ?',
        )
        .get(hallId, st.prefix);

      if (!row) {
        const info = db
          .prepare(
            `INSERT INTO service_type (hall_id, name, prefix, supports_appt, est_minutes, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', ?)`,
          )
          .run(hallId, st.name, st.prefix, st.supportsAppt, st.estMinutes, now);
        row = { id: Number(info.lastInsertRowid) };
      }

      for (const [start, end, capacity] of st.slots) {
        db.prepare(
          `INSERT OR IGNORE INTO slot (service_type_id, service_date, start_time, end_time, capacity, booked, is_open, created_at)
           VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
        ).run(row.id, serviceDate, start, end, capacity, now);
      }
    }
  })();
}

/** CLI 入口：仅在直接运行时执行（ESM 判定） */
const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (isDirectRun) {
  const db = createDb(config.dbPath);
  seed(db);
  const h = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM hall').get()!;
  const s = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM service_type').get()!;
  const sl = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM slot').get()!;
  const ct = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM counter').get()!;
  console.log(`SEED_OK hall=${h.c} service_type=${s.c} slot=${sl.c} counter=${ct.c}`);
  console.log(`DB_PATH=${config.dbPath}`);
  db.close();
}
