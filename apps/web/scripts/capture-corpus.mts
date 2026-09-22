/**
 * Capture the real extraction results for all six sample documents.
 *
 * Component tests run against these rather than against a live service, so the page can be
 * verified without Part A running and without a network call. Re-run after any Part A change
 * that alters the response.
 *
 *   pnpm --filter @insta-quote/web capture
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runExtraction } from '../../extraction-api/src/pipeline/run.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = fileURLToPath(new URL('../tests/fixtures/corpus/', import.meta.url));

const DOCS = ['IB-55871', 'IB-55902', 'IB-56010', 'IB-56088', 'IB-56150', 'IB-STMT47'];

mkdirSync(OUT, { recursive: true });

for (const name of DOCS) {
  const data = new Uint8Array(readFileSync(`${ROOT}sample-files-variant/${name}.pdf`));
  const result = await runExtraction(data, { documentName: `${name}.pdf` });

  writeFileSync(`${OUT}${name}.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `${name}: ${result.lineItems.length} items, ${result.refusals.length} refusals, ${result.ambiguities.length} ambiguities`,
  );
}
