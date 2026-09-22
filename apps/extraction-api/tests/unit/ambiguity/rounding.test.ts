import { describe, expect, it } from 'vitest';
import type { LineItem } from '@insta-quote/contracts';
import { detectTotalAmbiguities } from '../../../src/ambiguity/totals.js';
import type { StatedTotals } from '../../../src/ambiguity/stated-totals.js';

/**
 * FR-025: a difference of at most one cent per line item is the expected consequence of
 * per-line rounding. It is labelled, not hidden -- both kinds are reported.
 */

const evidence = (sourceText: string) => ({ page: 1, sourceText });

const lineItem = (id: string, cents: number): LineItem => ({
  id,
  page: 1,
  amount: { value: cents, evidence: evidence(`row ${id} $${(cents / 100).toFixed(2)}`) },
});

const statedTotalOf = (cents: number): StatedTotals => ({
  total: { label: 'stated total', cents, evidence: evidence(`Total: $${(cents / 100).toFixed(2)}`) },
  allTotals: [
    { label: 'stated total', cents, evidence: evidence(`Total: $${(cents / 100).toFixed(2)}`) },
  ],
});

describe('rounding threshold', () => {
  const items = [lineItem('r1', 1000), lineItem('r2', 1000), lineItem('r3', 1000)]; // sum 3000

  it('labels a difference of exactly one cent per line item as a rounding difference', () => {
    const [ambiguity] = detectTotalAmbiguities(items, statedTotalOf(3003)); // 3 items, 3c out

    expect(ambiguity?.kind).toBe('rounding_difference');
  });

  it('labels one cent beyond the threshold as a material mismatch', () => {
    const [ambiguity] = detectTotalAmbiguities(items, statedTotalOf(3004));

    expect(ambiguity?.kind).toBe('material_mismatch');
  });

  it('reports the rounding difference rather than absorbing it', () => {
    const found = detectTotalAmbiguities(items, statedTotalOf(3001));

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toMatch(/has not been adjusted away/);
  });

  it('reports nothing when the figures agree exactly', () => {
    expect(detectTotalAmbiguities(items, statedTotalOf(3000))).toEqual([]);
  });

  it('never nominates a winning value', () => {
    const [ambiguity] = detectTotalAmbiguities(items, statedTotalOf(9999));

    expect(ambiguity).not.toHaveProperty('resolved');
    expect(ambiguity?.computed?.derivedFrom).toMatch(/sum of 3 line item amounts/);
  });
});
