/** 时间工具：统一使用本地时区的 `YYYY-MM-DD` 与 ISO8601 时间戳。 */

/** 返回当前时间的 ISO8601 字符串（含毫秒与时区） */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 返回 `YYYY-MM-DD`（本地时区），用于 ticket.service_date / slot.service_date */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 校验 `YYYY-MM-DD` 格式且为真实日期 */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
