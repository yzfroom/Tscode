/**
 * 展示号生成：业务类型前缀 + 3 位左侧补零序号。
 * 例如 prefix='A', seq=7 → 'A007'
 *
 * 注意：这是「展示用」号码，接口 URL 中一律使用内部自增 id。
 */
export function formatTicketNo(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(3, '0')}`;
}
