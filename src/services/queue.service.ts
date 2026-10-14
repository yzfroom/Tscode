/**
 * 队列服务：窗口叫号。
 *
 * 并发要点：两个窗口同时叫号不得发出同一个号 —— 单事务内
 * 「SELECT 队首 → 条件 UPDATE（status='waiting' → 'called'）」，
 * changes===0 表示该号刚被其他窗口抢占，返回 QUEUE_EMPTY 由调用方重试。
 */
import type { Db } from '../db/index.ts';
import { ERROR_CODES, AppError } from '../utils/errors.ts';
import { nowIso, today } from '../utils/time.ts';
import * as ticketRepo from '../repositories/ticket.repo.ts';
import * as counterRepo from '../repositories/counter.repo.ts';
import { toTicketDTO } from './mappers.ts';
import type { TicketDTO } from '../types/api.ts';

interface CallNextInput {
  counterId: number;
  serviceTypeId: number;
}

/** 叫下一位（按业务类型取当日 waiting 队列队首） */
export function callNext(db: Db, input: CallNextInput): TicketDTO {
  const counter = counterRepo.findCounter(db, input.counterId);
  if (!counter) {
    throw AppError.notFound(ERROR_CODES.COUNTER_NOT_FOUND, '窗口不存在', {
      counterId: input.counterId,
    });
  }

  const serviceDate = today();
  const at = nowIso();

  const ticketId = db.transaction((): number => {
    const head = ticketRepo.findQueueHead(db, input.serviceTypeId, serviceDate);
    if (!head) {
      throw AppError.conflict(ERROR_CODES.QUEUE_EMPTY, '当前队列已空，无可叫号码', {
        serviceTypeId: input.serviceTypeId,
      });
    }

    const ok = ticketRepo.transitionStatus(db, head.id, ['waiting'], 'called', {
      counterId: input.counterId,
      timestampField: 'called_at',
      at,
    });
    if (!ok) {
      // 队首已被其他窗口抢占
      throw AppError.conflict(ERROR_CODES.QUEUE_EMPTY, '当前队列已空，无可叫号码', {
        serviceTypeId: input.serviceTypeId,
      });
    }

    counterRepo.setCounterState(db, input.counterId, {
      currentServiceId: input.serviceTypeId,
      currentTicketId: head.id,
      status: 'busy',
    });

    return head.id;
  })();

  return toTicketDTO(db, ticketRepo.findTicket(db, ticketId)!);
}

interface CallSpecificInput {
  ticketId: number;
  counterId: number;
}

/** 指定叫号（窗口主动叫某一个号） */
export function callTicket(db: Db, input: CallSpecificInput): TicketDTO {
  const ticket = ticketRepo.findTicket(db, input.ticketId);
  if (!ticket) {
    throw AppError.notFound(ERROR_CODES.TICKET_NOT_FOUND, '号码不存在', {
      ticketId: input.ticketId,
    });
  }
  const counter = counterRepo.findCounter(db, input.counterId);
  if (!counter) {
    throw AppError.notFound(ERROR_CODES.COUNTER_NOT_FOUND, '窗口不存在', {
      counterId: input.counterId,
    });
  }

  const at = nowIso();
  db.transaction(() => {
    const ok = ticketRepo.transitionStatus(db, input.ticketId, ['waiting'], 'called', {
      counterId: input.counterId,
      timestampField: 'called_at',
      at,
    });
    if (!ok) {
      throw AppError.invalidTransition(ticket.status, ['waiting']);
    }
    counterRepo.setCounterState(db, input.counterId, {
      currentServiceId: ticket.service_type_id,
      currentTicketId: input.ticketId,
      status: 'busy',
    });
  })();

  return toTicketDTO(db, ticketRepo.findTicket(db, input.ticketId)!);
}
