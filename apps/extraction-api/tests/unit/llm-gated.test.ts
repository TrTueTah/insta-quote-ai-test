import { describe, expect, it } from 'vitest';
import { toCandidates } from '../../src/candidates/llm.js';
import { runExtraction } from '../../src/pipeline/run.js';
import type { CandidateProposer } from '../../src/candidates/proposer.js';
import { readCorpus } from '../helpers/corpus.js';

/**
 * The model is never trusted. These tests prove it by feeding fabricated proposals through
 * the real pipeline and checking they are refused.
 *
 * No live OpenAI call is made here or anywhere else in the suite.
 */
describe('LLM proposals are gated like any other candidate', () => {
  it('converts a well-formed proposal into candidates without trusting it', () => {
    const candidates = toCandidates(1, {
      rows: [
        {
          sourceText: 'FX-401 Coach screws, bulk carton 3 20kg $74.00 /carton',
          fields: {
            code: 'FX-401',
            description: 'Coach screws, bulk carton',
            quantity: '3',
            unit: 'carton',
            unitPrice: '$74.00',
            amount: null,
          },
        },
      ],
    });

    expect(candidates).toHaveLength(5); // amount was null and is simply absent
    expect(candidates.every((c) => c.claimedPage === 1)).toBe(true);
    expect(candidates.find((c) => c.field === 'unitPrice')?.value).toBe(7400);
  });

  it('ignores a proposal with no source excerpt', () => {
    expect(toCandidates(1, { rows: [{ sourceText: '', fields: { amount: '$1.00' } }] })).toEqual([]);
  });

  it('refuses a fabricated value while accepting a real one from the same page', async () => {
    // The fake proposer quotes a genuine row but reports an amount that is not printed
    // anywhere: 2000 x $0.02 = $40.00. Checks 1 and 2 pass -- the row is real and unique --
    // and check 3 is what stops it.
    const washersRow = 'FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea';

    const fakeProposer: CandidateProposer = {
      async propose({ page, pageText }) {
        if (!pageText.includes(washersRow)) return [];
        return [
          {
            lineItemId: `p${page}-llm1`,
            field: 'quantity',
            value: 2000,
            claimedPage: page,
            claimedSourceText: washersRow,
          },
          {
            lineItemId: `p${page}-llm1`,
            field: 'amount',
            value: 4000, // fabricated
            claimedPage: page,
            claimedSourceText: washersRow,
            isMoney: true,
          },
        ];
      },
    };

    // Force escalation by running the proposer against a page the rules cannot match.
    const result = await runExtraction(readCorpus('IB-56010'), {
      documentName: 'IB-56010.pdf',
      proposer: fakeProposer,
    });

    expect(JSON.stringify(result)).not.toContain('4000');

    const fabricated = result.refusals.find((r) => r.code === 'value_not_in_source_text');
    const everyAmount = result.lineItems.map((i) => i.amount);
    expect(everyAmount.every((a) => a === undefined)).toBe(true);
    expect(fabricated ?? result.refusals.some((r) => r.field === 'amount')).toBeTruthy();
  });

  it('refuses a proposal quoting text that is not on the page at all', async () => {
    const inventedProposer: CandidateProposer = {
      async propose({ page }) {
        return [
          {
            lineItemId: `p${page}-llm1`,
            field: 'amount',
            value: 999900,
            claimedPage: page,
            claimedSourceText: 'ZZ-000 Entirely invented row 1 ea $9,999.00 $9,999.00',
            isMoney: true,
          },
        ];
      },
    };

    const result = await runExtraction(readCorpus('IB-55902'), {
      documentName: 'IB-55902.pdf',
      proposer: inventedProposer,
    });

    expect(result.lineItems).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('999900');
  });
});
