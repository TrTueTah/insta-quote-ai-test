import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema } from '@insta-quote/contracts';
import { extractCorpus } from '../helpers/run-corpus.js';
import { auditEvidence, auditNoSilentOmissions } from '../helpers/audit-evidence.js';
import type { CorpusDoc } from '../helpers/corpus.js';

/**
 * The quickstart expectation table, asserted. This is the acceptance walkthrough in
 * executable form.
 */
const EXPECTED: Record<CorpusDoc, { lineItems: number; refusals: number; ambiguities: number }> = {
  'IB-55871': { lineItems: 4, refusals: 0, ambiguities: 0 },
  'IB-55902': { lineItems: 0, refusals: 1, ambiguities: 0 },
  'IB-56010': { lineItems: 4, refusals: 4, ambiguities: 0 },
  'IB-56088': { lineItems: 3, refusals: 0, ambiguities: 1 },
  'IB-56150': { lineItems: 4, refusals: 0, ambiguities: 1 },
  'IB-STMT47': { lineItems: 21, refusals: 1, ambiguities: 0 },
};

describe('the whole sample corpus', () => {
  it.each(Object.entries(EXPECTED))('%s matches its expected shape', async (name, expected) => {
    const { result, data } = await extractCorpus(name as CorpusDoc);

    expect(() => ExtractionResultSchema.parse(result)).not.toThrow();
    expect(result.lineItems).toHaveLength(expected.lineItems);
    expect(result.refusals).toHaveLength(expected.refusals);
    expect(result.ambiguities).toHaveLength(expected.ambiguities);

    await auditEvidence(result, data);
    auditNoSilentOmissions(result);
  });

  it('every refusal reason is specific enough to act on', async () => {
    for (const name of Object.keys(EXPECTED) as CorpusDoc[]) {
      const { result } = await extractCorpus(name);

      for (const refusal of result.refusals) {
        expect(refusal.reason.length, `${name}: ${refusal.code}`).toBeGreaterThan(20);
        expect(refusal.reason, `${name}: ${refusal.code}`).not.toMatch(
          /something went wrong|could not process|unknown error/i,
        );
      }
    }
  });

  it('processes the eight-page document well within the 30 second budget', async () => {
    const started = Date.now();
    await extractCorpus('IB-STMT47');
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(30_000);
  });
});
