/**
 * 预约与现场取号测试（含超卖拒绝、幂等、取消释放）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, type TestContext } from './helpers/testDb.ts';
import { createAppointment, createWalkIn } from '../src/services/appointment.service.ts';
import { cancelTicket } from '../src/services/ticket.service.ts';
import { AppError } from '../src/utils/errors.ts';

let ctx: TestContext;
afterEach(() => ctx?.db.close());

function idCard(n: number): string {
  return `1101011990010${String(n).padStart(4, '0')}`;
}

describe('线上预约', () => {
  it('正常预约：返回 201 语义、号序与余量正确', () => {
    ctx = makeTestDb();
    const slotId = ctx.slots[0]!.id;

    const res = createAppointment(ctx.db, { slotId, idCard: idCard(1), phone: '13800000001' });

    expect(res.ticketNo).toBe('A001');
    expect(res.seq).toBe(1);
    expect(res.status).toBe('waiting');
    expect(res.source).toBe('appointment');
    expect(res.aheadCount).toBe(0);
    expect(res.slotId).toBe(slotId);

    const slot = ctx.db
      .prepare<[number], { booked: number }>('SELECT booked FROM slot WHERE id = ?')
      .get(slotId)!;
    expect(slot.booked).toBe(1);
  });

  it('超卖拒绝：capacity=2 连约 3 次，第 3 次 409 SLOT_FULL 且 booked 仍为 2', () => {
    ctx = makeTestDb();
    const slotId = ctx.slots[2]!.id; // 容量 2

    createAppointment(ctx.db, { slotId, idCard: idCard(1) });
    createAppointment(ctx.db, { slotId, idCard: idCard(2) });

    let thrown: unknown;
    try {
      createAppointment(ctx.db, { slotId, idCard: idCard(3) });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).httpStatus).toBe(409);
    expect((thrown as AppError).code).toBe('SLOT_FULL');

    const slot = ctx.db
      .prepare<[number], { booked: number; capacity: number }>(
        'SELECT booked, capacity FROM slot WHERE id = ?',
      )
      .get(slotId)!;
    expect(slot.booked).toBe(2);
    expect(slot.capacity).toBe(2);
  });

  it('幂等：同证件同 slot 预约两次，第二次 409 DUPLICATE_APPOINTMENT', () => {
    ctx = makeTestDb();
    const slotId = ctx.slots[0]!.id;
    createAppointment(ctx.db, { slotId, idCard: idCard(9) });

    let thrown: unknown;
    try {
      createAppointment(ctx.db, { slotId, idCard: idCard(9) });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('DUPLICATE_APPOINTMENT');
  });

  it('预约不存在的 slot → 404 SLOT_NOT_FOUND', () => {
    ctx = makeTestDb();
    let thrown: unknown;
    try {
      createAppointment(ctx.db, { slotId: 99999, idCard: idCard(1) });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).httpStatus).toBe(404);
    expect((thrown as AppError).code).toBe('SLOT_NOT_FOUND');
  });
});

describe('现场取号', () => {
  it('正常取号：A001、seq=1、aheadCount=0', () => {
    ctx = makeTestDb();
    const res = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });

    expect(res.ticketNo).toBe('A001');
    expect(res.seq).toBe(1);
    expect(res.status).toBe('waiting');
    expect(res.source).toBe('walk_in');
    expect(res.slotId).toBeNull();
    expect(res.aheadCount).toBe(0);
  });

  it('顺序保证：连续取号 seq 依次为 1,2,3，且号码正确', () => {
    ctx = makeTestDb();
    const r1 = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    const r2 = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(2) });
    const r3 = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(3) });

    expect([r1.seq, r2.seq, r3.seq]).toEqual([1, 2, 3]);
    expect([r1.ticketNo, r2.ticketNo, r3.ticketNo]).toEqual(['A001', 'A002', 'A003']);
    expect(r3.aheadCount).toBe(2);
  });

  it('同业务类型同日同证件重复取号 → 409 DUPLICATE_WALKIN_TICKET', () => {
    ctx = makeTestDb();
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(5) });

    let thrown: unknown;
    try {
      createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(5) });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('DUPLICATE_WALKIN_TICKET');
  });

  it('不同业务类型可各自取号（队列隔离）', () => {
    ctx = makeTestDb();
    const a = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    const b = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeB, idCard: idCard(1) });

    expect(a.ticketNo).toBe('A001');
    expect(b.ticketNo).toBe('B001');
  });
});

describe('取消预约', () => {
  it('取消后释放 slot 名额，且同证件可重新预约', () => {
    ctx = makeTestDb();
    const slotId = ctx.slots[0]!.id;

    const created = createAppointment(ctx.db, { slotId, idCard: idCard(7) });
    const bookedAfterCreate = ctx.db
      .prepare<[number], { booked: number }>('SELECT booked FROM slot WHERE id = ?')
      .get(slotId)!.booked;
    expect(bookedAfterCreate).toBe(1);

    const cancelled = cancelTicket(ctx.db, created.ticketId);
    expect(cancelled.status).toBe('cancelled');

    const bookedAfterCancel = ctx.db
      .prepare<[number], { booked: number }>('SELECT booked FROM slot WHERE id = ?')
      .get(slotId)!.booked;
    expect(bookedAfterCancel).toBe(0);

    // 取消后可再次预约（部分唯一索引已放行 cancelled）
    const again = createAppointment(ctx.db, { slotId, idCard: idCard(7) });
    expect(again.status).toBe('waiting');
  });
});
