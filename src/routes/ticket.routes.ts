/** 号码查询与状态流转路由。 */
import { Router } from 'express';
import type { Db } from '../db/index.ts';
import { validate } from '../middlewares/validate.ts';
import { validatedBody, validatedParams } from '../middlewares/validated.ts';
import { ticketIdParam, callTicketBody } from '../validators/schemas.ts';
import {
  getTicketStatus,
  startServing,
  finishServing,
  passTicket,
  cancelTicket,
} from '../services/ticket.service.ts';
import { callTicket } from '../services/queue.service.ts';
import type { CallTicketBody } from '../validators/schemas.ts';

export function createTicketRouter(db: Db): Router {
  const router = Router();

  // 查询号码状态与排队进度
  router.get('/tickets/:id', validate({ params: ticketIdParam }), (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    res.json({ data: getTicketStatus(db, id) });
  });

  // 指定叫号（窗口主动叫某一个号）
  router.post(
    '/tickets/:id/call',
    validate({ params: ticketIdParam, body: callTicketBody }),
    (req, res) => {
      const { id } = validatedParams<{ id: number }>(res);
      const body = validatedBody<CallTicketBody>(res);
      res.json({ data: callTicket(db, { ticketId: id, counterId: body.counterId }) });
    },
  );

  router.post('/tickets/:id/start', validate({ params: ticketIdParam }), (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    res.json({ data: startServing(db, id) });
  });

  router.post('/tickets/:id/finish', validate({ params: ticketIdParam }), (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    res.json({ data: finishServing(db, id) });
  });

  router.post('/tickets/:id/pass', validate({ params: ticketIdParam }), (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    res.json({ data: passTicket(db, id) });
  });

  router.post('/tickets/:id/cancel', validate({ params: ticketIdParam }), (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    res.json({ data: cancelTicket(db, id) });
  });

  return router;
}
