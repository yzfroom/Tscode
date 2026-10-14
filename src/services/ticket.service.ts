/**
 * 号码服务：状态查询与状态机流转（开始办理 / 办结 / 过号 / 取消）。
 *
 * 所有状态流转均为原子条件 UPDATE：changes===0 即前置状态不匹配 → 409。
 */
import type { Db } from '../db/index.ts';
import { ERROR_CODES, AppError } from '../utils/errors.ts';
import { nowIso } from '../utils/time.ts';
import * as ticketRepo from '../repositories/ticket.repo.ts';
import * as slotRepo from '../repositories/slot.repo.ts';
import * as counterRepo from '../repositories/counter.repo.ts';
import * as serviceTypeRepo from '../repositories/serviceType.repo.ts';
import { toTicketDTO } from './mappers.ts';
import type { TicketStatusDTO, TicketDTO } from '../types/api.ts';
import type { TicketStatus } from '../types/domain.ts';

/** 查号码（含排队进度） */
export function getTicketStatus(db: Db, ticketId: number): TicketStatusDTO {
  const row = ticketRepo.findTicket(db, ticketId);
  if (!row) {
    throw AppError.notFound(ERROR_CODES.TICKET_NOT_FOUND, '号码不存在', { ticketId });
  }
  const serviceType = serviceTypeRepo.findServiceType(db, row.service_type_id);
  const estMinutes = serviceType?.est_minutes ?? 0;
  // 仅 waiting 状态才有「前面还有几人」的语义
  const ahead =
    row.status === 'waiting'
      ? ticketRepo.countAhead(db, row.service_type_id, row.service_date, row.seq)
      : 0;
  return {
    ...toTicketDTO(db, row),
    aheadCount: ahead,
    estimatedWaitMinutes: ahead * estMinutes,
  };
}

/** 通用原子流转封装：成功后回读最新行并返回 DTO */
function applyTransition(
  db: Db,
  ticketId: number,
  fromStatuses: TicketStatus[],
  toStatus: TicketStatus,
  extra: {
    counterId?: number | null;
    timestampField?: 'called_at' | 'started_at' | 'finished_at';
    at?: string;
  } = {},
): TicketDTO {
  const before = ticketRepo.findTicket(db, ticketId);
  if (!before) {
    throw AppError.notFound(ERROR_CODES.TICKET_NOT_FOUND, '号码不存在', { ticketId });
  }
  const ok = ticketRepo.transitionStatus(db, ticketId, fromStatuses, toStatus, extra);
  if (!ok) {
    throw AppError.invalidTransition(before.status, fromStatuses);
  }
  return toTicketDTO(db, ticketRepo.findTicket(db, ticketId)!);
}

/** 开始办理：called → serving */
export function startServing(db: Db, ticketId: number): TicketDTO {
  const before = ticketRepo.findTicket(db, ticketId);
  if (!before) {
    throw AppError.notFound(ERROR_CODES.TICKET_NOT_FOUND, '号码不存在', { ticketId });
  }
  const dto = applyTransition(db, ticketId, ['called'], 'serving', {
    timestampField: 'started_at',
    at: nowIso(),
  });
  if (before.counter_id !== null) {
    counterRepo.setCounterState(db, before.counter_id, {
      currentServiceId: before.service_type_id,
      currentTicketId: ticketId,
      status: 'busy',
    });
  }
  return dto;
}

/** 办结：serving → done */
export function finishServing(db: Db, ticketId: number): TicketDTO {
  const before = ticketRepo.findTicket(db, ticketId);
  if (!before) {
    throw AppError.notFound(ERROR_CODES.TICKET_NOT_FOUND, '号码不存在', { ticketId });
  }
  const dto = applyTransition(db, ticketId, ['serving'], 'done', {
    timestampField: 'finished_at',
    at: nowIso(),
  });
  if (before.counter_id !== null) {
    counterRepo.setCounterState(db, before.counter_id, {
      currentServiceId: before.service_type_id,
      currentTicketId: null,
      status: 'idle',
    });
  }
  return dto;
}

/** 过号：called → passed（终态，需重新取号） */
export function passTicket(db: Db, ticketId: number): TicketDTO {
  const before = ticketRepo.findTicket(db, ticketId);
  if (!before) {
    throw AppError.notFound(ERROR_CODES.TICKET_NOT_FOUND, '号码不存在', { ticketId });
  }
  const dto = applyTransition(db, ticketId, ['called'], 'passed');
  if (before.counter_id !== null) {
    counterRepo.setCounterState(db, before.counter_id, {
      currentServiceId: before.service_type_id,
      currentTicketId: null,
      status: 'idle',
    });
  }
  return dto;
}

/** 取消：waiting / called → cancelled；若为预约则释 slot 名额 */
export function cancelTicket(db: Db, ticketId: number): TicketDTO {
  const before = ticketRepo.findTicket(db, ticketId);
  if (!before) {
    throw AppError.notFound(ERROR_CODES.TICKET_NOT_FOUND, '号码不存在', { ticketId });
  }

  const dto = db.transaction((): TicketDTO => {
    const ok = ticketRepo.transitionStatus(db, ticketId, ['waiting', 'called'], 'cancelled');
    if (!ok) {
      throw AppError.invalidTransition(before.status, ['waiting', 'called']);
    }
    // 预约号取消后释放号源名额，允许他人再约
    if (before.slot_id !== null) {
      slotRepo.releaseSlot(db, before.slot_id);
    }
    // 若已被窗口叫到，同步释放窗口占用
    if (before.counter_id !== null) {
      counterRepo.setCounterState(db, before.counter_id, {
        currentServiceId: before.service_type_id,
        currentTicketId: null,
        status: 'idle',
      });
    }
    return toTicketDTO(db, ticketRepo.findTicket(db, ticketId)!);
  })();

  return dto;
}
