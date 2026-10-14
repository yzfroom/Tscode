/**
 * 从 res.locals 读取已校验数据（类型安全，避免在每个 handler 里做 as 断言）。
 */
import type { Response } from 'express';

interface ValidatedBag {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

function bag(res: Response): ValidatedBag {
  return (res.locals.validated ?? {}) as ValidatedBag;
}

export function validatedBody<T>(res: Response): T {
  return bag(res).body as T;
}

export function validatedQuery<T>(res: Response): T {
  return bag(res).query as T;
}

export function validatedParams<T>(res: Response): T {
  return bag(res).params as T;
}
