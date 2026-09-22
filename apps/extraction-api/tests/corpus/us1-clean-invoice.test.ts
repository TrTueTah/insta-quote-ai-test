import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema } from '@insta-quote/contracts';
import { extractCorpus } from '../helpers/run-corpus.js';
import { auditEvidence, auditNoSilentOmissions } from '../helpers/audit-evidence.js';

/**
 * IB-55871.pdf is the control document. It must return four fully evidenced line items and
 * NOTHING else -- zero refusals, zero ambiguities. A detector that flags this document is
 * too eager and has regressed.
 */
describe('US1: clean invoice', () => {
  it('extracts all four line items with every field evidenced', async () => {
    const { result } = await extractCorpus('IB-55871');

    expect(result.lineItems).toHaveLength(4);

    for (const item of result.lineItems) {
      expect(item.code, item.id).toBeDefined();
      expect(item.description, item.id).toBeDefined();
      expect(item.quantity, item.id).toBeDefined();
      expect(item.unit, item.id).toBeDefined();
      expect(item.unitPrice, item.id).toBeDefined();
      expect(item.amount, item.id).toBeDefined();
    }

    const first = result.lineItems[0]!;
    expect(first.code?.value).toBe('FX-201');
    expect(first.description?.value).toBe('Framing nail gun coil, 90mm galv');
    expect(first.quantity?.value).toBe(24);
    expect(first.unit?.value).toBe('box');
    expect(first.unitPrice?.value).toBe(5200);
    expect(first.amount?.value).toBe(124800);
    expect(first.amount?.evidence).toEqual({
      page: 1,
      sourceText: 'FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00',
    });
  });

  it('returns no refusals and no ambiguities — the control must stay clean', async () => {
    const { result } = await extractCorpus('IB-55871');

    expect(result.refusals).toEqual([]);
    expect(result.ambiguities).toEqual([]);
  });

  it('every returned sourceText is verbatim and unique on the page it claims', async () => {
    const { result, data } = await extractCorpus('IB-55871');

    await auditEvidence(result, data);
    auditNoSilentOmissions(result);
  });

  it('validates against the shared contract schema', async () => {
    const { result } = await extractCorpus('IB-55871');

    expect(() => ExtractionResultSchema.parse(result)).not.toThrow();
  });
});
