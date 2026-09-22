import { describe, expect, it } from 'vitest';
import { extractCorpus } from '../helpers/run-corpus.js';
import { auditEvidence } from '../helpers/audit-evidence.js';

/**
 * IB-56150.pdf: the line items sum to the stated subtotal correctly, but the stated total is
 * $41.30 more than subtotal plus GST. The document contradicts its own arithmetic.
 */
describe('US3: stated total that does not add up', () => {
  it('reports one material mismatch with every figure evidenced', async () => {
    const { result } = await extractCorpus('IB-56150');

    expect(result.lineItems).toHaveLength(4);

    const totals = result.ambiguities.filter((a) => a.type === 'total_vs_sum');
    expect(totals).toHaveLength(1);

    const ambiguity = totals[0]!;
    expect(ambiguity.kind).toBe('material_mismatch');
    expect(ambiguity.fact).toBe('document total');

    // $1,270.00 subtotal + $190.50 GST = $1,460.50, against a stated total of $1,501.80.
    expect(ambiguity.computed).toEqual({
      value: 146050,
      derivedFrom: 'stated subtotal plus stated tax',
    });
    expect(ambiguity.values.map((v) => v.value)).toEqual([127000, 19050, 150180]);
    expect(ambiguity.reason).toContain('$41.30');
  });

  it('nominates no winner', async () => {
    const { result } = await extractCorpus('IB-56150');

    for (const ambiguity of result.ambiguities) {
      expect(ambiguity).not.toHaveProperty('resolved');
      expect(ambiguity).not.toHaveProperty('preferred');
      expect(ambiguity).not.toHaveProperty('bestGuess');
      expect(ambiguity.values.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not flag the line-sum-to-subtotal rung, which reconciles correctly', async () => {
    const { result } = await extractCorpus('IB-56150');

    const subtotalIssues = result.ambiguities.filter((a) => a.fact === 'document subtotal');
    expect(subtotalIssues).toEqual([]);
  });

  it('keeps every ambiguity value traceable to the page', async () => {
    const { result, data } = await extractCorpus('IB-56150');

    await auditEvidence(result, data);
  });
});
