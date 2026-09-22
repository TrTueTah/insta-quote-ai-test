import type { Ambiguity, LineItem } from '@insta-quote/contracts';
import { readStatedTotals } from './stated-totals.js';
import { detectTotalAmbiguities } from './totals.js';
import { detectConflictingUnitPrices } from './unit-prices.js';
import { detectConflictingCounts } from './counts.js';

export interface DetectInput {
  lineItems: readonly LineItem[];
  pageTexts: ReadonlyMap<number, string>;
}

/**
 * Ambiguity detection -- pipeline stage 4.
 *
 * Runs regardless of which interpretation path produced the candidates, because a
 * contradiction is a property of the document, not of how it was read.
 */
export function detectAmbiguities(input: DetectInput): Ambiguity[] {
  const stated = readStatedTotals(input.pageTexts);

  return [
    ...detectTotalAmbiguities(input.lineItems, stated),
    ...detectConflictingUnitPrices(input.lineItems),
    ...detectConflictingCounts(input.pageTexts),
  ];
}
