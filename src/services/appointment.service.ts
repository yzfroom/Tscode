/**
 * 预约服务：线上预约取号 + 现场取号。
 *
 * 并发与幂等要点：
 * - 防超卖：slot 用条件 UPDATE（booked < capacity），changes===0 即失败。
 * - 防重号序：号序与 insert 在同一事务内完成，UNIQUE 约束兜底。
 * - 防重复取号：DB 部分唯一索引兜底，应用层捕获唯一约束错误。
 */
import type { Db } from '../db/index.ts';
import { ERROR_CODES, AppError, isUniqueConstraintError } from '../utils/errors.ts';
import { nowIso, today } from '../utils/time.ts';
import { formatTicketNo } from '../utils/ticketNo.ts';
import * as slotRepo from '../repositories/slot.repo.ts';
import * as ticketRepo from '../repositories/ticket.repo.ts';
import * as serviceTypeRepo from '../repositories/serviceType.repo.ts';
import { toTicketDTO } from './mappers.ts';
import type { TicketCreatedDTO } from '../types/api.ts';
import { countAhead } from '../repositories/ticket.repo.ts';

/** 估算等待时间：队列前方人数 × 单号预计时长（分钟） */
function estimateWaitMinutes(estMinutes: number, aheadCount: number): number {
  return aheadCount * estMinutes;
}

interface CreateAppointmentInput {
  slotId: number;
  idCard: string;
  phone?: string | undefined;
}

/** 创建线上预约 */
export function createAppointment(db: Db, input: CreateAppointmentInput): TicketCreatedDTO {
  const slot = slotRepo.findSlot(db, input.slotId);
  if (!slot) {
    throw AppError.notFound(ERROR_CODES.SLOT_NOT_FOUND, '号源时段不存在', {
      slotId: input.slotId,
    });
  }

  const serviceType = serviceTypeRepo.findServiceType(db, slot.service_type_id);
  if (!serviceType) {
    throw AppError.notFound(ERROR_CODES.SERVICE_TYPE_NOT_FOUND, '业务类型不存在', {
      serviceTypeId: slot.service_type_id,
    });
  }
  if (serviceType.supports_appt !== 1) {
    throw AppError.conflict(
      ERROR_CODES.SERVICE_NOT_SUPPORT_APPOINTMENT,
      '该业务类型不支持线上预约',
      { serviceTypeId: serviceType.id },
    );
  }

  const createdAt = nowIso();

  try {
    const ticketId = db.transaction((): number => {
      // 1) 原子占名额（失败即视为已满；下方再区分具体原因）
      const claimed = slotRepo.tryBookSlot(db, input.slotId);
      if (!claimed) {
        const fresh = slotRepo.findSlot(db, input.slotId);
        if (!fresh) {
          throw AppError.notFound(ERROR_CODES.SLOT_NOT_FOUND, '号源时段不存在', {
            slotId: input.slotId,
          });
        }
        if (fresh.is_open !== 1) {
          throw AppError.conflict(ERROR_CODES.SLOT_NOT_OPEN, '该时段号源未开放', {
            slotId: input.slotId,
          });
        }
        throw AppError.conflict(ERROR_CODES.SLOT_FULL, '该时段号源已约满', {
          slotId: input.slotId,
          capacity: fresh.capacity,
          booked: fresh.booked,
        });
      }

      // 2) 事务内取号序并写入（UNIQUE(service_type_id, service_date, seq) 兜底）
      const seq = ticketRepo.nextSeq(db, slot.service_type_id, slot.service_date);
      return ticketRepo.insertTicket(db, {
        ticketNo: formatTicketNo(serviceType.prefix, seq),
        serviceTypeId: slot.service_type_id,
        slotId: slot.id,
        serviceDate: slot.service_date,
        seq,
        source: 'appointment',
        holderIdCard: input.idCard,
        holderPhone: input.phone ?? null,
        createdAt,
      });
    })();

    const row = ticketRepo.findTicket(db, ticketId)!;
    const ahead = countAhead(db, row.service_type_id, row.service_date, row.seq);
    return {
      ...toTicketDTO(db, row),
      aheadCount: ahead,
      estimatedWaitMinutes: estimateWaitMinutes(serviceType.est_minutes, ahead),
    };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw AppError.conflict(
        ERROR_CODES.DUPLICATE_APPOINTMENT,
        '您在该业务类型今日已有预约，或该时段已预约过',
        { slotId: input.slotId },
      );
    }
    throw err;
  }
}

interface CreateWalkInInput {
  serviceTypeId: number;
  idCard: string;
  phone?: string | undefined;
}

/** 现场取号 */
export function createWalkIn(db: Db, input: CreateWalkInInput): TicketCreatedDTO {
  const serviceType = serviceTypeRepo.findServiceType(db, input.serviceTypeId);
  if (!serviceType) {
    throw AppError.notFound(ERROR_CODES.SERVICE_TYPE_NOT_FOUND, '业务类型不存在', {
      serviceTypeId: input.serviceTypeId,
    });
  }

  const serviceDate = today();
  const createdAt = nowIso();

  try {
    const ticketId = db.transaction((): number => {
      const seq = ticketRepo.nextSeq(db, serviceType.id, serviceDate);
      return ticketRepo.insertTicket(db, {
        ticketNo: formatTicketNo(serviceType.prefix, seq),
        serviceTypeId: serviceType.id,
        slotId: null,
        serviceDate,
        seq,
        source: 'walk_in',
        holderIdCard: input.idCard,
        holderPhone: input.phone ?? null,
        createdAt,
      });
    })();

    const row = ticketRepo.findTicket(db, ticketId)!;
    const ahead = countAhead(db, row.service_type_id, row.service_date, row.seq);
    return {
      ...toTicketDTO(db, row),
      aheadCount: ahead,
      estimatedWaitMinutes: estimateWaitMinutes(serviceType.est_minutes, ahead),
    };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw AppError.conflict(
        ERROR_CODES.DUPLICATE_WALKIN_TICKET,
        '您在该业务类型今日已取过号',
        { serviceTypeId: input.serviceTypeId },
      );
    }
    throw err;
  }
}
