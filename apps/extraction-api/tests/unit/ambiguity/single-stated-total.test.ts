import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema, type LineItem } from '@insta-quote/contracts';
import { detectTotalAmbiguities } from '../../../src/ambiguity/totals.js';
import type { StatedTotals } from '../../../src/ambiguity/stated-totals.js';

/**
 * Regression: a document that prints ONE total, with no tax line, whose figure disagrees
 * with the line-item sum.
 *
 * This shape has only one page-evidenced figure — the other side of the conflict is the
 * computed sum. An earlier schema required two entries in `values`, so the contradiction was
 * detected correctly and then rejected while the service validated its own response, turning
 * a real finding into an HTTP 500.
 *
 * No sample document reaches this: IB-56088 is the only single-total document and its figure
 * happens to match exactly. The defect was found while building Part B.
 */
describe('a single stated total that disagrees with the line sum', () => {
  const evidence = (sourceText: string) => ({ page: 1, sourceText });

  const items: LineItem[] = [
    { id: 'r1', page: 1, amount: { value: 19000, evidence: evidence('CV-220 hire 2 day $95.00 $190.00') } },
  ];

  const stated: StatedTotals = {
    total: { label: 'stated total', cents: 24500, evidence: evidence('Total: $245.00') },
    allTotals: [{ label: 'stated total', cents: 24500, evidence: evidence('Total: $245.00') }],
  };

  it('reports the contradiction', () => {
    const found = detectTotalAmbiguities(items, stated);

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('material_mismatch');
    expect(found[0]?.values).toHaveLength(1);
    expect(found[0]?.computed?.value).toBe(19000);
  });

  it('produces a result that validates against the shared schema', () => {
    const result = {
      documentName: 'single-total.pdf',
      pageCount: 1,
      lineItems: items,
      refusals: [],
      ambiguities: detectTotalAmbiguities(items, stated),
    };

    expect(() => ExtractionResultSchema.parse(result)).not.toThrow();
  });

  it('still rejects an ambiguity with only one side', () => {
    const oneSided = {
      documentName: 'x.pdf',
      pageCount: 1,
      lineItems: items,
      refusals: [],
      ambiguities: [
        {
          kind: 'material_mismatch',
          type: 'total_vs_sum',
          fact: 'document total',
          values: [{ label: 'stated total', value: 24500, evidence: evidence('Total: $245.00') }],
          // no `computed`, so nothing to conflict with
          reason: 'A contradiction with nothing to contradict.',
        },
      ],
    };

    expect(() => ExtractionResultSchema.parse(oneSided)).toThrow();
  });
});
