/** ticket（取号记录）数据访问：只写 SQL，不含业务判断。 */
import type { Db } from '../db/index.ts';
import type { TicketRow, TicketStatus, TicketSource } from '../types/domain.ts';

export interface InsertTicketInput {
  ticketNo: string;
  serviceTypeId: number;
  slotId: number | null;
  serviceDate: string;
  seq: number;
  source: TicketSource;
  holderIdCard: string;
  holderPhone: string | null;
  createdAt: string;
}

export function findTicket(db: Db, id: number): TicketRow | undefined {
  return db.prepare<[number], TicketRow>('SELECT * FROM ticket WHERE id = ?').get(id);
}

/** 事务内取下一个排队序号（同一写事务中调用，配合 UNIQUE 约束兜底） */
export function nextSeq(db: Db, serviceTypeId: number, serviceDate: string): number {
  const row = db
    .prepare<[number, string], { n: number }>(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS n
         FROM ticket WHERE service_type_id = ? AND service_date = ?`,
    )
    .get(serviceTypeId, serviceDate);
  return row!.n;
}

export function insertTicket(db: Db, input: InsertTicketInput): number {
  const info = db
    .prepare(
      `INSERT INTO ticket
         (ticket_no, service_type_id, slot_id, service_date, seq, source,
          holder_id_card, holder_phone, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?)`,
    )
    .run(
      input.ticketNo,
      input.serviceTypeId,
      input.slotId,
      input.serviceDate,
      input.seq,
      input.source,
      input.holderIdCard,
      input.holderPhone,
      input.createdAt,
    );
  return Number(info.lastInsertRowid);
}

/** 取队首（按 seq 升序的第一个 waiting 号） */
export function findQueueHead(
  db: Db,
  serviceTypeId: number,
  serviceDate: string,
): TicketRow | undefined {
  return db
    .prepare<[number, string], TicketRow>(
      `SELECT * FROM ticket
        WHERE service_type_id = ? AND service_date = ? AND status = 'waiting'
        ORDER BY seq LIMIT 1`,
    )
    .get(serviceTypeId, serviceDate);
}

/** 统计某号前面还有多少人（同业务类型同日、waiting、seq 更小） */
export function countAhead(
  db: Db,
  serviceTypeId: number,
  serviceDate: string,
  seq: number,
): number {
  const row = db
    .prepare<[number, string, number], { c: number }>(
      `SELECT COUNT(*) AS c FROM ticket
        WHERE service_type_id = ? AND service_date = ? AND status = 'waiting' AND seq < ?`,
    )
    .get(serviceTypeId, serviceDate, seq);
  return row!.c;
}

/**
 * 原子状态流转。
 * @returns 是否成功（changes === 0 表示前置状态不匹配，即非法流转）
 */
export function transitionStatus(
  db: Db,
  id: number,
  fromStatuses: TicketStatus[],
  toStatus: TicketStatus,
  extra: { counterId?: number | null; timestampField?: 'called_at' | 'started_at' | 'finished_at'; at?: string } = {},
): boolean {
  const placeholders = fromStatuses.map(() => '?').join(', ');
  const sets = ['status = ?'];
  const params: unknown[] = [toStatus];

  if (extra.counterId !== undefined) {
    sets.push('counter_id = ?');
    params.push(extra.counterId);
  }
  if (extra.timestampField !== undefined && extra.at !== undefined) {
    sets.push(`${extra.timestampField} = ?`);
    params.push(extra.at);
  }

  params.push(id, ...fromStatuses);

  const info = db
    .prepare(`UPDATE ticket SET ${sets.join(', ')} WHERE id = ? AND status IN (${placeholders})`)
    .run(...params);
  return info.changes === 1;
}

/** 取消时清空窗口占用（counter 侧同步由 service 负责） */
export function listWaitingQueue(
  db: Db,
  serviceTypeId: number,
  serviceDate: string,
): TicketRow[] {
  return db
    .prepare<[number, string], TicketRow>(
      `SELECT * FROM ticket
        WHERE service_type_id = ? AND service_date = ? AND status = 'waiting'
        ORDER BY seq`,
    )
    .all(serviceTypeId, serviceDate);
}
