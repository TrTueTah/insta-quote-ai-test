import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The constitution requires the verification gate to be "a pure function, framework-free,
 * unit-testable in isolation". Without this test that is a convention, and conventions
 * decay. Here it is enforced mechanically.
 */
describe('gate purity', () => {
  const gateFiles = ['../../src/gate/verify.ts', '../../src/gate/normalize.ts'];

  const forbidden = ['fastify', 'pdfjs-dist', 'openai', 'node:fs', 'node:http'];

  for (const relative of gateFiles) {
    it(`${relative} imports no framework, PDF library, or model client`, () => {
      const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

      for (const module of forbidden) {
        expect(source).not.toContain(`'${module}`);
      }
    });

    it(`${relative} performs no I/O, timing, or randomness`, () => {
      const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

      expect(source).not.toMatch(/Math\.random|Date\.now|new Date\(|fetch\(|process\.env/);
    });
  }
});
