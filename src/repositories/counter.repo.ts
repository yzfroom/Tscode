/** counter（窗口）数据访问：只写 SQL。 */
import type { Db } from '../db/index.ts';
import type { CounterRow, CounterStatus } from '../types/domain.ts';

export function findCounter(db: Db, id: number): CounterRow | undefined {
  return db.prepare<[number], CounterRow>('SELECT * FROM counter WHERE id = ?').get(id);
}

export function listCounters(db: Db, hallId: number): CounterRow[] {
  return db
    .prepare<[number], CounterRow>('SELECT * FROM counter WHERE hall_id = ? ORDER BY id')
    .all(hallId);
}

export function setCounterState(
  db: Db,
  counterId: number,
  state: {
    currentServiceId: number | null;
    currentTicketId: number | null;
    status: CounterStatus;
  },
): void {
  db.prepare(
    'UPDATE counter SET current_service_id = ?, current_ticket_id = ?, status = ? WHERE id = ?',
  ).run(state.currentServiceId, state.currentTicketId, state.status, counterId);
}
