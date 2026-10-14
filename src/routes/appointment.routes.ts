/** 取号路由：线上预约 + 现场取号。 */
import { Router } from 'express';
import type { Db } from '../db/index.ts';
import { validate } from '../middlewares/validate.ts';
import { validatedBody } from '../middlewares/validated.ts';
import { createAppointmentBody, walkInBody } from '../validators/schemas.ts';
import {
  createAppointment,
  createWalkIn,
} from '../services/appointment.service.ts';
import type { CreateAppointmentBody, WalkInBody } from '../validators/schemas.ts';

export function createTicketCreateRouter(db: Db): Router {
  const router = Router();

  router.post('/appointments', validate({ body: createAppointmentBody }), (req, res) => {
    const body = validatedBody<CreateAppointmentBody>(res);
    const result = createAppointment(db, {
      slotId: body.slotId,
      idCard: body.idCard,
      phone: body.phone,
    });
    res.status(201).json({ data: result });
  });

  router.post('/tickets/walk-in', validate({ body: walkInBody }), (req, res) => {
    const body = validatedBody<WalkInBody>(res);
    const result = createWalkIn(db, {
      serviceTypeId: body.serviceTypeId,
      idCard: body.idCard,
      phone: body.phone,
    });
    res.status(201).json({ data: result });
  });

  return router;
}
