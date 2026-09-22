import { describe, expect, it } from 'vitest';
import type { LineItem } from '@insta-quote/contracts';
import { detectTotalAmbiguities } from '../../../src/ambiguity/totals.js';
import { readStatedTotals } from '../../../src/ambiguity/stated-totals.js';

/**
 * Absence of a total is not a contradiction. A delivery docket that states no total simply
 * supports no reconciliation, and must not be reported as disagreeing with itself.
 */
describe('documents with no stated totals', () => {
  const items: LineItem[] = [
    { id: 'r1', page: 1, amount: { value: 1000, evidence: { page: 1, sourceText: 'row r1 $10.00' } } },
  ];

  it('reports nothing when the document states no subtotal, tax or total', () => {
    const stated = readStatedTotals(
      new Map([[1, 'FX-401 Coach screws, bulk carton 3 20kg $74.00 /carton\nTotal consignment weight: see individual lines.']]),
    );

    expect(stated.subtotal).toBeUndefined();
    expect(stated.tax).toBeUndefined();
    expect(detectTotalAmbiguities(items, stated)).toEqual([]);
  });

  it('reports nothing when there are no summable line items', () => {
    const stated = readStatedTotals(new Map([[1, 'Total: $50.00']]));

    expect(detectTotalAmbiguities([{ id: 'r1', page: 1 }], stated)).toEqual([]);
  });

  it('reads the ladder when the document does print it', () => {
    const stated = readStatedTotals(
      new Map([[1, 'Subtotal: $1,270.00\nGST (15%): $190.50\nTotal (incl GST): $1,501.80']]),
    );

    expect(stated.subtotal?.cents).toBe(127000);
    expect(stated.tax?.cents).toBe(19050);
    expect(stated.total?.cents).toBe(150180);
  });
});
