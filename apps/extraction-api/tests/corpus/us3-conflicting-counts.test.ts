import { describe, expect, it } from 'vitest';
import { extractCorpus } from '../helpers/run-corpus.js';
import { auditEvidence } from '../helpers/audit-evidence.js';

/**
 * IB-56088.pdf's monetary figures reconcile perfectly, so every money-based detector passes
 * it cleanly. Its contradiction is in prose: "9 cartons dispatched" against "11 cartons
 * picked and loaded onto the truck".
 *
 * Without this detector a reviewer is told "3 line items, total $2,050.00, no issues" about
 * a document that disagrees with itself.
 */
describe('US3: conflicting stated counts in prose', () => {
  it('reports the carton conflict with both statements evidenced', async () => {
    const { result } = await extractCorpus('IB-56088');

    expect(result.lineItems).toHaveLength(3);

    const counts = result.ambiguities.filter((a) => a.type === 'conflicting_counts');
    expect(counts).toHaveLength(1);

    const ambiguity = counts[0]!;
    expect(ambiguity.fact).toBe('cartons');
    expect(ambiguity.kind).toBe('material_mismatch');
    expect(ambiguity.values.map((v) => v.value).sort((a, b) => a - b)).toEqual([9, 11]);

    const sources = ambiguity.values.map((v) => v.evidence.sourceText);
    expect(sources.some((s) => s.includes('9 cartons dispatched'))).toBe(true);
    expect(sources.some((s) => s.includes('11 cartons picked and loaded'))).toBe(true);
  });

  it('keeps both statements traceable to the page', async () => {
    const { result, data } = await extractCorpus('IB-56088');

    await auditEvidence(result, data);
  });
});
