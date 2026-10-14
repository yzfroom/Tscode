import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // 串行执行：SQLite 单文件写锁，避免并行测试互相干扰
    fileParallelism: false,
  },
});
