/**
 * 组装 Express 应用（导出给 server.ts 与 supertest 共用）。
 *
 * Express 5 注意：具体路径为主，不使用 `*` 通配符与可选段。
 */
import express, { type Express } from 'express';
import type { Db } from './db/index.ts';
import { createCatalogRouter } from './routes/catalog.routes.ts';
import { createTicketCreateRouter } from './routes/appointment.routes.ts';
import { createTicketRouter } from './routes/ticket.routes.ts';
import { createCounterRouter } from './routes/counter.routes.ts';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.ts';

export function createApp(db: Db): Express {
  const app = express();

  app.use(express.json({ limit: '64kb' }));

  // 健康检查
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const api = express.Router();
  api.use(createCatalogRouter(db));
  api.use(createTicketCreateRouter(db));
  api.use(createTicketRouter(db));
  api.use(createCounterRouter(db));
  app.use('/api', api);

  // 兜底：404 与统一错误处理必须最后注册
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
