import { describe, expect, it } from 'vitest';
import { extractCorpus } from '../helpers/run-corpus.js';
import { auditEvidence } from '../helpers/audit-evidence.js';

/**
 * A line item must report the page it actually appeared on, not page 1 for everything.
 * IB-STMT47.pdf spreads identical-looking rows across seven readable pages, which is exactly
 * where sloppy page attribution would go unnoticed.
 */
describe('US1: page attribution across a multi-page document', () => {
  it('attributes each line item to the page it appears on', async () => {
    const { result } = await extractCorpus('IB-STMT47');

    const pages = [...new Set(result.lineItems.map((i) => i.page))].sort((a, b) => a - b);
    expect(pages).toEqual([1, 2, 3, 5, 6, 7, 8]);

    for (const item of result.lineItems) {
      // Each page's rows are numbered "Consolidated line <page>-<n>".
      expect(item.description?.value, item.id).toMatch(new RegExp(`^Consolidated line ${item.page}-`));
      expect(item.code?.evidence.page, item.id).toBe(item.page);
    }
  });

  it('keeps evidence unique per page despite rows repeating across pages', async () => {
    const { result, data } = await extractCorpus('IB-STMT47');

    // Every page repeats the amounts $60.00, $105.00 and $162.00, so a bare-fragment
    // evidence string would be ambiguous. Whole-row evidence is what makes this pass.
    await auditEvidence(result, data);
  });
});
