import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@insta-quote/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['apps/**/tests/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
