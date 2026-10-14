/** 服务入口：初始化数据库 → 启动 HTTP 服务。 */
import { config } from './config/index.ts';
import { getDb, closeDb } from './db/index.ts';
import { seed } from './db/seed.ts';
import { createApp } from './app.ts';

const db = getDb();
// 首次启动自动写入基础数据（幂等）
seed(db);
const app = createApp(db);

const server = app.listen(config.port, () => {
  console.log(`HallQueue listening on http://localhost:${config.port}`);
  console.log(`DB_PATH=${config.dbPath}`);
});

/** 优雅退出：关闭 HTTP 与数据库连接 */
function shutdown(signal: string): void {
  console.log(`\nReceived ${signal}, shutting down...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
