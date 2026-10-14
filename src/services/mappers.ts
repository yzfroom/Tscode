/** 领域行 → DTO 的映射（多处复用，避免重复拼装）。 */
import type { Db } from '../db/index.ts';
import type { TicketRow, ServiceTypeRow, SlotRow, CounterRow } from '../types/domain.ts';
import type {
  TicketDTO,
  ServiceTypeDTO,
  SlotDTO,
  CounterDTO,
} from '../types/api.ts';
import * as counterRepo from '../repositories/counter.repo.ts';

export function toServiceTypeDTO(row: ServiceTypeRow): ServiceTypeDTO {
  return {
    id: row.id,
    hallId: row.hall_id,
    name: row.name,
    prefix: row.prefix,
    supportsAppointment: row.supports_appt === 1,
    estMinutes: row.est_minutes,
  };
}

export function toSlotDTO(row: SlotRow): SlotDTO {
  return {
    slotId: row.id,
    serviceTypeId: row.service_type_id,
    serviceDate: row.service_date,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    booked: row.booked,
    remaining: Math.max(0, row.capacity - row.booked),
    isOpen: row.is_open === 1,
  };
}

export function toCounterDTO(row: CounterRow): CounterDTO {
  return {
    id: row.id,
    hallId: row.hall_id,
    counterNo: row.counter_no,
    currentServiceId: row.current_service_id,
    currentTicketId: row.current_ticket_id,
    status: row.status,
  };
}

/** ticket 行 + 窗口号 → DTO */
export function toTicketDTO(db: Db, row: TicketRow): TicketDTO {
  let counterNo: string | null = null;
  if (row.counter_id !== null) {
    counterNo = counterRepo.findCounter(db, row.counter_id)?.counter_no ?? null;
  }
  return {
    ticketId: row.id,
    ticketNo: row.ticket_no,
    serviceTypeId: row.service_type_id,
    slotId: row.slot_id,
    serviceDate: row.service_date,
    seq: row.seq,
    source: row.source,
    status: row.status,
    counterId: row.counter_id,
    counterNo,
    calledAt: row.called_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}
