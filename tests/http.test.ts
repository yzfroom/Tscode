/**
 * HTTP 层集成测试：通过 supertest 直接打 express app，覆盖路由/校验/中间件全链路。
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { makeTestDb, type TestContext } from './helpers/testDb.ts';
import { createApp } from '../src/app.ts';

let ctx: TestContext;
afterEach(() => ctx?.db.close());

function idCard(n: number): string {
  return `1101011990010${String(n).padStart(4, '0')}`;
}

describe('GET /api/service-types', () => {
  it('返回业务类型列表', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app).get('/api/service-types');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0]).toHaveProperty('prefix');
  });
});

describe('GET /api/slots', () => {
  it('返回时段与余量', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app)
      .get('/api/slots')
      .query({ serviceTypeId: ctx.serviceTypeA, date: ctx.serviceDate });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('remaining');
    expect(res.body.data[0]).toHaveProperty('capacity');
  });

  it('缺参数 → 400 VALIDATION_ERROR', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app).get('/api/slots').query({ serviceTypeId: ctx.serviceTypeA });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/appointments', () => {
  it('创建预约 → 201 且返回展示号', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app)
      .post('/api/appointments')
      .send({ slotId: ctx.slots[0]!.id, idCard: idCard(1), phone: '13800000001' });

    expect(res.status).toBe(201);
    expect(res.body.data.ticketNo).toBe('A001');
    expect(res.body.data.status).toBe('waiting');
  });

  it('非法手机号 → 400 VALIDATION_ERROR', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app)
      .post('/api/appointments')
      .send({ slotId: ctx.slots[0]!.id, idCard: idCard(1), phone: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.in).toBe('body');
  });

  it('slot 不存在 → 404 SLOT_NOT_FOUND', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app)
      .post('/api/appointments')
      .send({ slotId: 99999, idCard: idCard(1) });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SLOT_NOT_FOUND');
  });

  it('号源约满 → 409 SLOT_FULL', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const slotId = ctx.slots[2]!.id; // 容量 2

    await request(app).post('/api/appointments').send({ slotId, idCard: idCard(1) });
    await request(app).post('/api/appointments').send({ slotId, idCard: idCard(2) });
    const res = await request(app).post('/api/appointments').send({ slotId, idCard: idCard(3) });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_FULL');
  });
});

describe('POST /api/tickets/walk-in', () => {
  it('现场取号 → 201', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app)
      .post('/api/tickets/walk-in')
      .send({ serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });

    expect(res.status).toBe(201);
    expect(res.body.data.ticketNo).toBe('A001');
    expect(res.body.data.source).toBe('walk_in');
  });

  it('业务类型不存在 → 404 SERVICE_TYPE_NOT_FOUND', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app)
      .post('/api/tickets/walk-in')
      .send({ serviceTypeId: 99999, idCard: idCard(1) });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_TYPE_NOT_FOUND');
  });
});

describe('主流程：取号 → 查进度 → 叫号 → 办理 → 办结', () => {
  it('完整主路径贯通', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);

    // 现场取号
    const walk = await request(app)
      .post('/api/tickets/walk-in')
      .send({ serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    expect(walk.status).toBe(201);
    const ticketId: number = walk.body.data.ticketId;

    // 查进度
    const status = await request(app).get(`/api/tickets/${ticketId}`);
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe('waiting');
    expect(status.body.data.aheadCount).toBe(0);

    // 叫下一位
    const call = await request(app)
      .post('/api/counters/1/call-next')
      .send({ serviceTypeId: ctx.serviceTypeA });
    expect(call.status).toBe(200);
    expect(call.body.data.ticketId).toBe(ticketId);
    expect(call.body.data.status).toBe('called');
    expect(call.body.data.counterNo).toBe('1号窗口');

    // 开始办理
    const start = await request(app).post(`/api/tickets/${ticketId}/start`);
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('serving');

    // 办结
    const finish = await request(app).post(`/api/tickets/${ticketId}/finish`);
    expect(finish.status).toBe(200);
    expect(finish.body.data.status).toBe('done');
    expect(finish.body.data.finishedAt).not.toBeNull();
  });

  it('异常路径：对已办结的票再叫号 → 409 INVALID_STATE_TRANSITION', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);

    const walk = await request(app)
      .post('/api/tickets/walk-in')
      .send({ serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    const ticketId: number = walk.body.data.ticketId;

    await request(app).post('/api/counters/1/call-next').send({ serviceTypeId: ctx.serviceTypeA });
    await request(app).post(`/api/tickets/${ticketId}/start`);
    await request(app).post(`/api/tickets/${ticketId}/finish`);

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/call`)
      .send({ counterId: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(res.body.error.details).toMatchObject({ from: 'done', required: ['waiting'] });
  });

  it('异常路径：号码不存在 → 404 TICKET_NOT_FOUND', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app).get('/api/tickets/99999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TICKET_NOT_FOUND');
  });

  it('过号：called → passed，队列推进到下一号', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);

    await request(app)
      .post('/api/tickets/walk-in')
      .send({ serviceTypeId: ctx.serviceTypeA, idCard: idCard(1) });
    const second = await request(app)
      .post('/api/tickets/walk-in')
      .send({ serviceTypeId: ctx.serviceTypeA, idCard: idCard(2) });
    const secondId: number = second.body.data.ticketId;

    const called = await request(app)
      .post('/api/counters/1/call-next')
      .send({ serviceTypeId: ctx.serviceTypeA });
    const firstId: number = called.body.data.ticketId;

    const passed = await request(app).post(`/api/tickets/${firstId}/pass`);
    expect(passed.status).toBe(200);
    expect(passed.body.data.status).toBe('passed');

    const next = await request(app)
      .post('/api/counters/1/call-next')
      .send({ serviceTypeId: ctx.serviceTypeA });
    expect(next.body.data.ticketId).toBe(secondId);
  });

  it('未匹配路由 → 404 ROUTE_NOT_FOUND', async () => {
    ctx = makeTestDb();
    const app = createApp(ctx.db);
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
