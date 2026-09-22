import { describe, expect, it } from 'vitest';
import { extractCorpus } from '../helpers/run-corpus.js';
import { auditEvidence, auditNoSilentOmissions } from '../helpers/audit-evidence.js';

/**
 * IB-56010.pdf has no Amount column at all. The quantities and unit prices are there and
 * must be extracted; the amounts are absent from the document and must be refused.
 */
describe('US2: a document that states no line amounts', () => {
  it('extracts quantity and unit price, and refuses the absent amounts by name', async () => {
    const { result } = await extractCorpus('IB-56010');

    expect(result.lineItems).toHaveLength(4);

    for (const item of result.lineItems) {
      expect(item.quantity, item.id).toBeDefined();
      expect(item.unitPrice, item.id).toBeDefined();
      expect(item.amount, item.id).toBeUndefined();
    }

    const amountRefusals = result.refusals.filter((r) => r.field === 'amount');
    expect(amountRefusals).toHaveLength(4);

    for (const refusal of amountRefusals) {
      expect(refusal.code).toBe('value_not_provided');
      expect(refusal.scope).toBe('value');
      expect(refusal.reason).toMatch(/absent from the page rather than unreadable/);
    }
  });

  it('takes the unit from the price suffix, never from the weight column', async () => {
    const { result } = await extractCorpus('IB-56010');

    const units = result.lineItems.map((i) => i.unit?.value);
    expect(units).toEqual(['carton', 'ea', 'kit', 'tub']);

    // "20kg" and "640g total" are weights, a different dimension. Reporting one as a unit of
    // sale would be a fabrication dressed up as an extraction.
    for (const unit of units) {
      expect(unit).not.toMatch(/kg|g total/);
    }
  });

  describe('the anti-computation guard', () => {
    it('never derives the washers amount from quantity x unit price', async () => {
      const { result } = await extractCorpus('IB-56010');

      // 2000 x $0.02 = $40.00. That product appears nowhere on the page, so it must appear
      // nowhere in the response. This is the sharpest test of "never emit a number without
      // evidence" in the whole corpus.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('4000');
      expect(serialized).not.toContain('40.00');

      const washers = result.lineItems.find((i) => i.code?.value === 'FX-402');
      expect(washers?.quantity?.value).toBe(2000);
      expect(washers?.unitPrice?.value).toBe(2);
      expect(washers?.amount).toBeUndefined();
    });
  });

  it('holds the evidence and no-silent-omission invariants', async () => {
    const { result, data } = await extractCorpus('IB-56010');

    await auditEvidence(result, data);
    auditNoSilentOmissions(result);
  });
});
