/** 测试用内存数据库：每次调用返回全新 :memory: 实例并写入基础数据。 */
import { createDb, type Db } from '../../src/db/index.ts';
import { seed } from '../../src/db/seed.ts';
import { today } from '../../src/utils/time.ts';

export interface TestContext {
  db: Db;
  serviceDate: string;
  /** seed 出的业务类型 id（A=社保卡办理, B=不动产登记查询） */
  serviceTypeA: number;
  serviceTypeB: number;
  slots: Array<{ id: number; capacity: number }>;
}

export function makeTestDb(): TestContext {
  const db = createDb(':memory:');
  const serviceDate = today();
  seed(db, { serviceDate });

  const a = db
    .prepare<[string], { id: number }>(
      'SELECT id FROM service_type WHERE prefix = ? ORDER BY id LIMIT 1',
    )
    .get('A');
  const b = db
    .prepare<[string], { id: number }>(
      'SELECT id FROM service_type WHERE prefix = ? ORDER BY id LIMIT 1',
    )
    .get('B');

  const slots = db
    .prepare<[number, string], { id: number; capacity: number }>(
      'SELECT id, capacity FROM slot WHERE service_type_id = ? AND service_date = ? ORDER BY start_time',
    )
    .all(a!.id, serviceDate);

  return {
    db,
    serviceDate,
    serviceTypeA: a!.id,
    serviceTypeB: b!.id,
    slots,
  };
}
