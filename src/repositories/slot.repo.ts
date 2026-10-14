/** slot（号源时段）数据访问：只写 SQL，不含业务判断。 */
import type { Db } from '../db/index.ts';
import type { SlotRow } from '../types/domain.ts';

export function findSlot(db: Db, id: number): SlotRow | undefined {
  return db.prepare<[number], SlotRow>('SELECT * FROM slot WHERE id = ?').get(id);
}

export function listSlots(db: Db, serviceTypeId: number, serviceDate: string): SlotRow[] {
  return db
    .prepare<[number, string], SlotRow>(
      `SELECT * FROM slot
        WHERE service_type_id = ? AND service_date = ?
        ORDER BY start_time`,
    )
    .all(serviceTypeId, serviceDate);
}

/**
 * 原子占用一个名额。
 * 条件 UPDATE 保证「已满」时 changes === 0，无需应用层加锁。
 * @returns 是否成功占用
 */
export function tryBookSlot(db: Db, slotId: number): boolean {
  const info = db
    .prepare(
      `UPDATE slot SET booked = booked + 1
        WHERE id = ? AND is_open = 1 AND booked < capacity`,
    )
    .run(slotId);
  return info.changes === 1;
}

/** 释放一个名额（取消预约时调用），不会低于 0 */
export function releaseSlot(db: Db, slotId: number): void {
  db.prepare('UPDATE slot SET booked = booked - 1 WHERE id = ? AND booked > 0').run(slotId);
}
