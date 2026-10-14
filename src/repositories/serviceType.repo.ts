/** service_type / hall 的读取（本版本无需写入接口，seed 负责初始化）。 */
import type { Db } from '../db/index.ts';
import type { ServiceTypeRow, HallRow } from '../types/domain.ts';

export function findHallById(db: Db, hallId: number): HallRow | undefined {
  return db.prepare<[number], HallRow>('SELECT * FROM hall WHERE id = ?').get(hallId);
}

export function findFirstHall(db: Db): HallRow | undefined {
  return db.prepare<[], HallRow>('SELECT * FROM hall ORDER BY id LIMIT 1').get();
}

export function listServiceTypes(db: Db, hallId: number | undefined): ServiceTypeRow[] {
  if (hallId === undefined) {
    return db
      .prepare<[], ServiceTypeRow>(
        `SELECT * FROM service_type WHERE status = 'active' ORDER BY id`,
      )
      .all();
  }
  return db
    .prepare<[number], ServiceTypeRow>(
      `SELECT * FROM service_type WHERE hall_id = ? AND status = 'active' ORDER BY id`,
    )
    .all(hallId);
}

export function findServiceType(db: Db, id: number): ServiceTypeRow | undefined {
  return db.prepare<[number], ServiceTypeRow>('SELECT * FROM service_type WHERE id = ?').get(id);
}
