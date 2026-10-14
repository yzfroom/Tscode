/** 服务配置：环境变量优先，缺省值保证开箱即跑。 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

export const config = {
  /** 监听端口 */
  port: Number(process.env.PORT ?? 3000),

  /** SQLite 数据库文件路径（测试时用 ':memory:' 覆盖） */
  dbPath: process.env.DB_PATH ?? path.join(rootDir, 'data', 'hall-queue.db'),

  /** 数据目录（首次运行自动创建） */
  dataDir: path.join(rootDir, 'data'),

  /** 业务开关 */
  business: {
    /**
     * 过号后是否允许重新入队。
     * 本次交付按用户决策为「过号作废」，固定 false。
     */
    allowRequeueAfterPassed: false,
    /** 默认窗口办理一个号的预估时长（分钟），用于估算等待时间 */
    defaultEstMinutes: 5,
  },
} as const;

export type AppConfig = typeof config;
