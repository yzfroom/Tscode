/** zod 校验 schema：请求参数的唯一真源（同时提供运行时校验与 TS 类型）。 */
import { z } from 'zod';

/** 证件号：1-32 位（本版本不强制身份证格式，兼容护照等） */
const idCard = z.string().trim().min(1, '证件号不能为空').max(32, '证件号过长');

/** 手机号：中国大陆 11 位 */
const phone = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, '手机号格式不正确');

const positiveInt = z.coerce.number().int('必须为整数').positive('必须为正整数');

export const listServiceTypesQuery = z.object({
  hallId: positiveInt.optional(),
});

export const listSlotsQuery = z.object({
  serviceTypeId: positiveInt,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
});

export const createAppointmentBody = z.object({
  slotId: positiveInt,
  idCard,
  phone: phone.optional(),
});

export const walkInBody = z.object({
  serviceTypeId: positiveInt,
  idCard,
  phone: phone.optional(),
});

export const ticketIdParam = z.object({
  id: positiveInt,
});

export const counterIdParam = z.object({
  id: positiveInt,
});

export const callNextBody = z.object({
  serviceTypeId: positiveInt,
});

export const callTicketBody = z.object({
  counterId: positiveInt,
});

export type ListServiceTypesQuery = z.infer<typeof listServiceTypesQuery>;
export type ListSlotsQuery = z.infer<typeof listSlotsQuery>;
export type CreateAppointmentBody = z.infer<typeof createAppointmentBody>;
export type WalkInBody = z.infer<typeof walkInBody>;
export type CallNextBody = z.infer<typeof callNextBody>;
export type CallTicketBody = z.infer<typeof callTicketBody>;
