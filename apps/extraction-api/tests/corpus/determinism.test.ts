import { describe, expect, it } from 'vitest';
import type { ExtractionResult } from '@insta-quote/contracts';
import { extractCorpus } from '../helpers/run-corpus.js';
import type { CorpusDoc } from '../helpers/corpus.js';

/**
 * FR-021, FR-022, FR-023 and SC-008.
 *
 * The guarantee is stable CLASSIFICATION, not byte-identical output: the same value lands in
 * the same collection with the same page number on every run. Description wording and entry
 * ordering are allowed to vary, so this asserts on the classification fingerprint rather
 * than on a deep equality of the whole response.
 */

const DOCS: CorpusDoc[] = ['IB-55871', 'IB-55902', 'IB-56010', 'IB-56088', 'IB-56150', 'IB-STMT47'];

function fingerprint(result: ExtractionResult): string {
  const values = result.lineItems
    .flatMap((item) =>
      (['code', 'description', 'quantity', 'unit', 'unitPrice', 'amount'] as const)
        .filter((field) => item[field] !== undefined)
        .map((field) => `item:${item.id}:${field}:p${item[field]!.evidence.page}`),
    )
    .sort();

  const refusals = result.refusals
    .map((r) => `refusal:${r.scope}:${r.page ?? '-'}:${r.lineItemId ?? '-'}:${r.field ?? '-'}:${r.code}`)
    .sort();

  const ambiguities = result.ambiguities
    .map((a) => `ambiguity:${a.type}:${a.kind}:${a.fact}:${a.values.map((v) => v.value).sort().join(',')}`)
    .sort();

  return [...values, ...refusals, ...ambiguities].join('\n');
}

describe('determinism', () => {
  it.each(DOCS)('%s classifies identically across ten runs', async (doc) => {
    const first = fingerprint((await extractCorpus(doc)).result);

    for (let run = 2; run <= 10; run++) {
      const next = fingerprint((await extractCorpus(doc)).result);
      expect(next, `${doc} run ${run} differs from run 1`).toBe(first);
    }
  });
});
