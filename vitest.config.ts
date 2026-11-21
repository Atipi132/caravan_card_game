import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@caravan/engine': fileURLToPath(new URL('./packages/engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/server/test/**/*.test.ts', 'apps/client/src/**/*.test.ts'],
    testTimeout: 30000,
  },
});
