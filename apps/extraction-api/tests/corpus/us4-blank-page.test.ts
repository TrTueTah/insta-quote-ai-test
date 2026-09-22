import { describe, expect, it } from 'vitest';
import { extractCorpus } from '../helpers/run-corpus.js';
import { auditEvidence } from '../helpers/audit-evidence.js';

/**
 * IB-STMT47.pdf has eight pages; page 4 carries no text at all, while the "Page 3 of 8" and
 * "Page 5 of 8" markers on its neighbours prove content is missing. Losing the other seven
 * pages over it would be the worst possible response.
 */
describe('US4: a blank page inside a readable document', () => {
  it('returns every line item from the readable pages', async () => {
    const { result } = await extractCorpus('IB-STMT47');

    expect(result.pageCount).toBe(8);
    expect(result.lineItems).toHaveLength(21); // 7 readable pages x 3 rows
  });

  it('refuses only the bad page, by name', async () => {
    const { result } = await extractCorpus('IB-STMT47');

    const pageRefusals = result.refusals.filter((r) => r.scope === 'page');
    expect(pageRefusals).toHaveLength(1);
    expect(pageRefusals[0]?.page).toBe(4);
    expect(pageRefusals[0]?.code).toBe('no_text_on_page');
  });

  it('holds the evidence guarantee across all seven readable pages', async () => {
    const { result, data } = await extractCorpus('IB-STMT47');

    await auditEvidence(result, data);
  });
});
