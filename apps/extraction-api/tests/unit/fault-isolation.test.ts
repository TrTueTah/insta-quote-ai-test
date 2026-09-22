import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/pipeline/assemble.js';
import { parsePage } from '../../src/candidates/rules.js';

/**
 * Principle III: catch at the smallest reasonable boundary and convert failures into
 * refusals, never into a thrown error that aborts the request.
 */
describe('fault isolation', () => {
  it('isolates an unparseable row and keeps its neighbours on the same page', () => {
    const page = [
      'Code Description Qty Unit Unit Price Amount',
      'FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00',
      'FX-999 Corrupted row with no usable columns at all',
      'FX-118 Timber connector bolts M12x150 60 ea $3.40 $204.00',
    ].join('\n');

    const parsed = parsePage(1, page);

    const ids = new Set(parsed.candidates.map((c) => c.lineItemId));
    expect(ids.size).toBe(2); // the two good rows
    expect(parsed.failures).toHaveLength(1);
    expect(parsed.failures[0]?.line).toContain('FX-999');
  });

  it('turns a page-level failure into a refusal without losing other pages', () => {
    const { lineItems, refusals } = assemble({
      accepted: [
        {
          lineItemId: 'p1-r1',
          field: 'description',
          value: 'Widget',
          page: 1,
          sourceText: 'WX-001 Widget 1 ea $1.00 $1.00',
        },
      ],
      gateRefusals: [],
      absences: [],
      parseFailures: [],
      emptyPages: [],
      unreadablePages: [2],
    });

    expect(lineItems).toHaveLength(1);
    const pageRefusal = refusals.find((r) => r.scope === 'page' && r.page === 2);
    expect(pageRefusal?.code).toBe('page_unreadable');
  });

  it('never returns an empty result with no explanation', () => {
    const { lineItems, refusals } = assemble({
      accepted: [],
      gateRefusals: [],
      absences: [],
      parseFailures: [],
      emptyPages: [],
      unreadablePages: [],
    });

    expect(lineItems).toEqual([]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.scope).toBe('document');
  });

  it('explains every field absent from a line item', () => {
    const { lineItems, refusals } = assemble({
      accepted: [
        {
          lineItemId: 'p1-r1',
          field: 'quantity',
          value: 5,
          page: 1,
          sourceText: 'WX-001 Widget 5',
        },
      ],
      gateRefusals: [],
      absences: [],
      parseFailures: [],
      emptyPages: [],
      unreadablePages: [],
    });

    const item = lineItems[0]!;
    const explained = new Set(refusals.filter((r) => r.field).map((r) => `${r.lineItemId}:${r.field}`));

    for (const field of ['code', 'description', 'unit', 'unitPrice', 'amount'] as const) {
      expect(item[field], field).toBeUndefined();
      expect(explained.has(`p1-r1:${field}`), `${field} unexplained`).toBe(true);
    }
  });
});
