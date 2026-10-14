/** 业务类型与号源时段查询路由。 */
import { Router } from 'express';
import type { Db } from '../db/index.ts';
import { validate } from '../middlewares/validate.ts';
import { validatedQuery } from '../middlewares/validated.ts';
import { listServiceTypesQuery, listSlotsQuery } from '../validators/schemas.ts';
import * as serviceTypeRepo from '../repositories/serviceType.repo.ts';
import * as slotRepo from '../repositories/slot.repo.ts';
import { toServiceTypeDTO, toSlotDTO } from '../services/mappers.ts';
import { AppError, ERROR_CODES } from '../utils/errors.ts';

export function createCatalogRouter(db: Db): Router {
  const router = Router();

  router.get('/service-types', validate({ query: listServiceTypesQuery }), (req, res) => {
    const q = validatedQuery<{ hallId?: number }>(res);
    const rows = serviceTypeRepo.listServiceTypes(db, q.hallId);
    res.json({ data: rows.map(toServiceTypeDTO) });
  });

  router.get('/slots', validate({ query: listSlotsQuery }), (req, res) => {
    const q = validatedQuery<{ serviceTypeId: number; date: string }>(res);

    const serviceType = serviceTypeRepo.findServiceType(db, q.serviceTypeId);
    if (!serviceType) {
      throw AppError.notFound(ERROR_CODES.SERVICE_TYPE_NOT_FOUND, '业务类型不存在', {
        serviceTypeId: q.serviceTypeId,
      });
    }

    const rows = slotRepo.listSlots(db, q.serviceTypeId, q.date);
    res.json({ data: rows.map(toSlotDTO) });
  });

  return router;
}
