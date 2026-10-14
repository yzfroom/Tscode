/**
 * 领域类型定义。
 *
 * 注意：Node 原生执行 TypeScript（type stripping）时不支持 `enum`，
 * 因此全项目统一使用 `as const` 对象 + 联合类型来替代枚举。
 */

/** 号码状态 */
export const TICKET_STATUSES = [
  'waiting', // 排队中
  'called', // 已叫号，等待办事人到位
  'serving', // 办理中
  'done', // 已办结
  'passed', // 已过号（终态，需重新取号）
  'cancelled', // 已取消
  'expired', // 已过期（收尾清理）
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** 终态：不可再流转 */
export const TERMINAL_STATUSES: readonly TicketStatus[] = [
  'done',
  'passed',
  'cancelled',
  'expired',
];

/** 号码来源 */
export const TICKET_SOURCES = ['appointment', 'walk_in'] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

/** 业务类型状态 */
export const SERVICE_TYPE_STATUSES = ['active', 'inactive'] as const;
export type ServiceTypeStatus = (typeof SERVICE_TYPE_STATUSES)[number];

/** 窗口状态 */
export const COUNTER_STATUSES = ['idle', 'busy', 'closed'] as const;
export type CounterStatus = (typeof COUNTER_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* 数据行类型（与 SQLite 表结构一一对应）                                 */
/* ------------------------------------------------------------------ */

export interface HallRow {
  id: number;
  name: string;
  address: string | null;
  open_time: string;
  close_time: string;
  status: string;
  created_at: string;
}

export interface ServiceTypeRow {
  id: number;
  hall_id: number;
  name: string;
  prefix: string;
  supports_appt: number; // 0 / 1
  est_minutes: number;
  status: ServiceTypeStatus;
  created_at: string;
}

export interface SlotRow {
  id: number;
  service_type_id: number;
  service_date: string; // 'YYYY-MM-DD'
  start_time: string; // 'HH:mm'
  end_time: string; // 'HH:mm'
  capacity: number;
  booked: number;
  is_open: number; // 0 / 1
  created_at: string;
}

export interface TicketRow {
  id: number;
  ticket_no: string;
  service_type_id: number;
  slot_id: number | null;
  service_date: string;
  seq: number;
  source: TicketSource;
  holder_id_card: string;
  holder_phone: string | null;
  status: TicketStatus;
  counter_id: number | null;
  called_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface CounterRow {
  id: number;
  hall_id: number;
  counter_no: string;
  current_service_id: number | null;
  current_ticket_id: number | null;
  status: CounterStatus;
}
