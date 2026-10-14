/** 窗口路由：叫下一位。 */
import { Router } from 'express';
import type { Db } from '../db/index.ts';
import { validate } from '../middlewares/validate.ts';
import { validatedBody, validatedParams } from '../middlewares/validated.ts';
import { counterIdParam, callNextBody } from '../validators/schemas.ts';
import { callNext } from '../services/queue.service.ts';
import type { CallNextBody } from '../validators/schemas.ts';

export function createCounterRouter(db: Db): Router {
  const router = Router();

  router.post(
    '/counters/:id/call-next',
    validate({ params: counterIdParam, body: callNextBody }),
    (req, res) => {
      const { id } = validatedParams<{ id: number }>(res);
      const body = validatedBody<CallNextBody>(res);
      res.json({ data: callNext(db, { counterId: id, serviceTypeId: body.serviceTypeId }) });
    },
  );

  return router;
}
