/**
 * 校验中间件：把 zod schema 的结果写入 req.validated，失败则转 400。
 *
 * 用法：router.post('/x', validate({ body: schema }), handler)
 * handler 中通过 req.validated.body / .query / .params 取已校验数据。
 */
import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError, ERROR_CODES } from '../utils/errors.ts';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/** 把 zod issues 压平成便于前端定位的 details 数组 */
function formatIssues(err: unknown): Array<{ path: string; message: string }> {
  const issues = (err as { issues?: Array<{ path: Array<string | number>; message: string }> })
    .issues;
  if (!Array.isArray(issues)) return [];
  return issues.map((i) => ({
    path: i.path.length > 0 ? i.path.join('.') : '(root)',
    message: i.message,
  }));
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const validated: { body?: unknown; query?: unknown; params?: unknown } = {};

    for (const key of ['body', 'query', 'params'] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        next(
          AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, '请求参数校验失败', {
            in: key,
            issues: formatIssues(result.error),
          }),
        );
        return;
      }
      validated[key] = result.data;
    }

    // Express 5 的 req 类型无自定义字段，统一挂到 res.locals 传递
    _res.locals.validated = validated;
    next();
  };
}
