import type { Ambiguity, LineItem } from '@insta-quote/contracts';
import { formatCents } from '../candidates/parse-values.js';

/**
 * The same product code stated at two different unit prices within one document.
 *
 * Only evidenced values participate: a price that was refused cannot contradict anything.
 */
export function detectConflictingUnitPrices(lineItems: readonly LineItem[]): Ambiguity[] {
  const byCode = new Map<string, LineItem[]>();

  for (const item of lineItems) {
    const code = item.code?.value;
    if (code === undefined || item.unitPrice === undefined) continue;
    const bucket = byCode.get(code);
    if (bucket) bucket.push(item);
    else byCode.set(code, [item]);
  }

  const ambiguities: Ambiguity[] = [];

  for (const [code, items] of byCode) {
    const distinct = new Map<number, LineItem>();
    for (const item of items) {
      const cents = item.unitPrice?.value;
      if (cents !== undefined && !distinct.has(cents)) distinct.set(cents, item);
    }
    if (distinct.size < 2) continue;

    const values = [...distinct.entries()].map(([cents, item]) => ({
      label: `unit price on page ${item.page}`,
      value: cents,
      evidence: item.unitPrice!.evidence,
    }));

    ambiguities.push({
      kind: 'material_mismatch',
      type: 'conflicting_unit_prices',
      fact: `unit price for ${code}`,
      values,
      reason: `${code} is given more than one unit price in this document: ${values
        .map((v) => `${formatCents(v.value)} on page ${v.evidence.page}`)
        .join(' and ')}. Neither has been chosen over the other.`,
    });
  }

  return ambiguities;
}
