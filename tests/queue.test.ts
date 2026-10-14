/**
 * 队列与叫号测试：并发不重号、队列空、过号终态、顺序叫号。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, type TestContext } from './helpers/testDb.ts';
import { createWalkIn } from '../src/services/appointment.service.ts';
import { callNext, callTicket } from '../src/services/queue.service.ts';
import { startServing, finishServing, passTicket } from '../src/services/ticket.service.ts';
import { AppError } from '../src/utils/errors.ts';

let ctx: TestContext;
afterEach(() => ctx?.db.close());

function idCard(n: number): string {
  return `1101011990010${String(n).padStart(4, '0')}`;
}

const COUNTER_1 = 1;
const COUNTER_2 = 2;

describe('叫下一位（call-next）', () => {
  it('按 seq 顺序叫号', () => {
    ctx = makeTestDb();
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(2) });
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(3) });

    const c1 = callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });
    const c2 = callNext(ctx.db, { counterId: COUNTER_2, serviceTypeId: ctx.serviceTypeA });

    expect(c1.ticketNo).toBe('A001');
    expect(c2.ticketNo).toBe('A002');
    expect(c1.status).toBe('called');
    expect(c2.status).toBe('called');
    // 两个窗口不得拿到同一个号
    expect(c1.ticketId).not.toBe(c2.ticketId);
  });

  it('两窗口连续抢占不重号：第 3 次 409 QUEUE_EMPTY', () => {
    ctx = makeTestDb();
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(2) });

    const c1 = callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });
    const c2 = callNext(ctx.db, { counterId: COUNTER_2, serviceTypeId: ctx.serviceTypeA });
    expect(new Set([c1.ticketId, c2.ticketId]).size).toBe(2);

    let thrown: unknown;
    try {
      callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).httpStatus).toBe(409);
    expect((thrown as AppError).code).toBe('QUEUE_EMPTY');
  });

  it('空队列叫号 → 409 QUEUE_EMPTY', () => {
    ctx = makeTestDb();
    let thrown: unknown;
    try {
      callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('QUEUE_EMPTY');
  });

  it('窗口不存在 → 404 COUNTER_NOT_FOUND', () => {
    ctx = makeTestDb();
    let thrown: unknown;
    try {
      callNext(ctx.db, { counterId: 999, serviceTypeId: ctx.serviceTypeA });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('COUNTER_NOT_FOUND');
  });
});

describe('过号（pass）', () => {
  it('called → passed 为终态，且不再参与队列', () => {
    ctx = makeTestDb();
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(2) });

    const called = callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });
    const passed = passTicket(ctx.db, called.ticketId);

    expect(passed.status).toBe('passed');

    // 过号后叫下一位应拿到 A002，而非已过号的 A001
    const next = callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });
    expect(next.ticketNo).toBe('A002');
  });

  it('对 waiting 的票直接 pass → 409 INVALID_STATE_TRANSITION', () => {
    ctx = makeTestDb();
    const t = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });

    let thrown: unknown;
    try {
      passTicket(ctx.db, t.ticketId);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('INVALID_STATE_TRANSITION');
    expect((thrown as AppError).details).toMatchObject({ from: 'waiting', required: ['called'] });
  });

  it('对 passed 的票再叫号 → 409 INVALID_STATE_TRANSITION', () => {
    ctx = makeTestDb();
    const t = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    const called = callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });
    passTicket(ctx.db, called.ticketId);

    let thrown: unknown;
    try {
      callTicket(ctx.db, { ticketId: t.ticketId, counterId: COUNTER_1 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('INVALID_STATE_TRANSITION');
  });
});

describe('办理流程', () => {
  it('called → serving → done 主路径', () => {
    ctx = makeTestDb();
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    const called = callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });

    const serving = startServing(ctx.db, called.ticketId);
    expect(serving.status).toBe('serving');
    expect(serving.startedAt).not.toBeNull();

    const done = finishServing(ctx.db, called.ticketId);
    expect(done.status).toBe('done');
    expect(done.finishedAt).not.toBeNull();
  });

  it('对已办结的票再叫号 → 409 INVALID_STATE_TRANSITION', () => {
    ctx = makeTestDb();
    createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    const called = callNext(ctx.db, { counterId: COUNTER_1, serviceTypeId: ctx.serviceTypeA });
    startServing(ctx.db, called.ticketId);
    finishServing(ctx.db, called.ticketId);

    let thrown: unknown;
    try {
      callTicket(ctx.db, { ticketId: called.ticketId, counterId: COUNTER_1 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).httpStatus).toBe(409);
    expect((thrown as AppError).code).toBe('INVALID_STATE_TRANSITION');
  });

  it('waiting 状态不能直接 finish → 409', () => {
    ctx = makeTestDb();
    const t = createWalkIn(ctx.db, { serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });

    let thrown: unknown;
    try {
      finishServing(ctx.db, t.ticketId);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('INVALID_STATE_TRANSITION');
  });

  it('不存在的号码 → 404 TICKET_NOT_FOUND', () => {
    ctx = makeTestDb();
    let thrown: unknown;
    try {
      startServing(ctx.db, 99999);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).httpStatus).toBe(404);
    expect((thrown as AppError).code).toBe('TICKET_NOT_FOUND');
  });
});
