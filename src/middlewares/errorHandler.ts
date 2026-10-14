/**
 * 统一错误处理中间件（Express 5 终末中间件）。
 *
 * Express 5 会自动把 async 路由中抛出的异常转发到这里，因此无需 asyncHandler 包装。
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, ERROR_CODES } from '../utils/errors.ts';

/** 404 兜底（放在所有路由之后） */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `未找到路由 ${req.method} ${req.path}`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const payload: { code: string; message: string; details?: Record<string, unknown> } = {
      code: err.code,
      message: err.message,
    };
    if (err.details !== undefined) payload.details = err.details;
    res.status(err.httpStatus).json({ error: payload });
    return;
  }

  // 未预期异常：对外隐藏内部细节，仅服务端日志保留
  console.error('[UNHANDLED_ERROR]', err);
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: '服务内部错误',
    },
  });
};
