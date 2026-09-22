import { describe, expect, it } from 'vitest';
import { extractCorpus } from '../helpers/run-corpus.js';

/**
 * The regression guard that matters most for US3.
 *
 * IB-55871.pdf is arithmetically perfect: its line items sum to the stated subtotal, and
 * subtotal plus GST equals the stated total. Comparing the line sum ($3,259.00) directly
 * against the tax-inclusive total ($3,747.85) would report a $488.85 "contradiction" on the
 * one document that is definitively correct.
 *
 * A detector that cries wolf on the control trains a reviewer to ignore ambiguities, which
 * defeats the purpose of having them.
 */
describe('US3: the clean control document raises nothing', () => {
  it('reports zero ambiguities for an internally consistent invoice', async () => {
    const { result } = await extractCorpus('IB-55871');

    expect(result.ambiguities).toEqual([]);
  });

  it('reports zero ambiguities for a document with no totals at all', async () => {
    // IB-56010 states no subtotal, no tax and no total. Absence is not a contradiction.
    const { result } = await extractCorpus('IB-56010');

    expect(result.ambiguities.filter((a) => a.type === 'total_vs_sum')).toEqual([]);
  });

  it('reports no total ambiguity for a document whose single total matches its line sum', async () => {
    // IB-56088: Total $2,050.00 equals 1360 + 312 + 378. No GST line to reconcile.
    const { result } = await extractCorpus('IB-56088');

    expect(result.ambiguities.filter((a) => a.type === 'total_vs_sum')).toEqual([]);
  });
});
