/**
 * SQLite 连接管理。
 *
 * 设计要点：
 * - better-sqlite3 同步 API，让「事务 + 条件 UPDATE」的并发逻辑清晰可读。
 * - 降级预案：若原生模块不可用，可改用 Node 24 内置 `node:sqlite`（已转正），
 *   仅需替换本文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config/index.ts';

export type Db = Database.Database;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let instance: Db | null = null;

/** 读取并返回 DDL 文本（打包后 schema.sql 与编译产物同目录） */
function loadSchema(): string {
  const schemaPath = path.join(__dirname, 'schema.sql');
  return fs.readFileSync(schemaPath, 'utf8');
}

/** 对数据库连接应用统一 pragma 与建表 */
export function migrate(db: Db): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(loadSchema());
}

/** 创建一个新连接（测试用 ':memory:'，生产用文件路径） */
export function createDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  migrate(db);
  return db;
}

/** 获取进程内单例连接（服务运行期使用） */
export function getDb(): Db {
  if (instance === null) {
    instance = createDb(config.dbPath);
  }
  return instance;
}

/** 关闭单例连接（优雅退出 / 测试清理） */
export function closeDb(): void {
  if (instance !== null) {
    instance.close();
    instance = null;
  }
}
