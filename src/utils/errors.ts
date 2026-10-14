/**
 * 统一错误体系。
 *
 * 所有业务错误都抛 AppError，由 errorHandler 中间件统一转成：
 *   { "error": { "code": "...", "message": "...", "details": {...} } }
 */
import type { TicketStatus } from '../types/domain.ts';

/** 错误码常量（大写蛇形，唯一真源） */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  SERVICE_TYPE_NOT_FOUND: 'SERVICE_TYPE_NOT_FOUND',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  COUNTER_NOT_FOUND: 'COUNTER_NOT_FOUND',
  HALL_NOT_FOUND: 'HALL_NOT_FOUND',

  SLOT_NOT_OPEN: 'SLOT_NOT_OPEN',
  SLOT_FULL: 'SLOT_FULL',
  SERVICE_NOT_SUPPORT_APPOINTMENT: 'SERVICE_NOT_SUPPORT_APPOINTMENT',
  DUPLICATE_APPOINTMENT: 'DUPLICATE_APPOINTMENT',
  DUPLICATE_WALKIN_TICKET: 'DUPLICATE_WALKIN_TICKET',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  QUEUE_EMPTY: 'QUEUE_EMPTY',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 业务异常：携带 HTTP 状态码 + 机器可读错误码 + 可选细节 */
export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    httpStatus: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }

  static notFound(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    return new AppError(404, code, message, details);
  }

  static conflict(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    return new AppError(409, code, message, details);
  }

  static badRequest(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    return new AppError(400, code, message, details);
  }

  /** 非法状态流转：details 里带 from / required，便于前端定位 */
  static invalidTransition(from: TicketStatus, required: TicketStatus[]) {
    return new AppError(
      409,
      ERROR_CODES.INVALID_STATE_TRANSITION,
      `当前号码状态为「${from}」，不允许此操作`,
      { from, required },
    );
  }
}

/** SQLite 唯一约束冲突错误码（better-sqlite3 抛出） */
export const SQLITE_CONSTRAINT_UNIQUE = 'SQLITE_CONSTRAINT_UNIQUE';
export const SQLITE_CONSTRAINT_PRIMARYKEY = 'SQLITE_CONSTRAINT_PRIMARYKEY';

/** 判断是否唯一约束冲突 */
export function isUniqueConstraintError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return (
    code === SQLITE_CONSTRAINT_UNIQUE ||
    code === SQLITE_CONSTRAINT_PRIMARYKEY ||
    (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT'))
  );
}
