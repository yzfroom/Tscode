/** API 层 DTO：请求参数与响应体形状。 */
import type { TicketStatus, TicketSource, CounterStatus } from './domain.ts';

/** 统一错误响应体 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ServiceTypeDTO {
  id: number;
  hallId: number;
  name: string;
  prefix: string;
  supportsAppointment: boolean;
  estMinutes: number;
}

export interface SlotDTO {
  slotId: number;
  serviceTypeId: number;
  serviceDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  booked: number;
  remaining: number;
  isOpen: boolean;
}

export interface TicketDTO {
  ticketId: number;
  ticketNo: string;
  serviceTypeId: number;
  slotId: number | null;
  serviceDate: string;
  seq: number;
  source: TicketSource;
  status: TicketStatus;
  counterId: number | null;
  counterNo: string | null;
  calledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/** 取号/预约成功响应（含排队进度） */
export interface TicketCreatedDTO extends TicketDTO {
  aheadCount: number;
  estimatedWaitMinutes: number;
}

/** 号码状态查询响应 */
export interface TicketStatusDTO extends TicketDTO {
  aheadCount: number;
  estimatedWaitMinutes: number;
}

export interface CounterDTO {
  id: number;
  hallId: number;
  counterNo: string;
  currentServiceId: number | null;
  currentTicketId: number | null;
  status: CounterStatus;
}
