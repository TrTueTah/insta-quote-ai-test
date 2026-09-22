import { defineWorkspace } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const contracts = fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url));
const alias = { '@insta-quote/contracts': contracts };

export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: 'api',
      include: ['apps/extraction-api/tests/**/*.test.ts'],
      environment: 'node',
      testTimeout: 60_000,
    },
  },
  {
    resolve: { alias },
    // React 19's automatic runtime, so component tests need no `import React`.
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    test: {
      name: 'web',
      include: ['apps/web/tests/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: ['./apps/web/tests/setup.ts'],
      globals: true,
      testTimeout: 30_000,
    },
  },
]);
