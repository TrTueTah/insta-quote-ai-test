import type { Ambiguity, LineItem } from '@insta-quote/contracts';
import { formatCents } from '../candidates/parse-values.js';
import type { StatedFigure, StatedTotals } from './stated-totals.js';

/**
 * Reconcile the document's own printed arithmetic.
 *
 * The ladder is the one the document itself prints: line sum -> stated subtotal -> plus
 * stated tax -> stated total. Every rung is optional; a missing rung means that comparison
 * is skipped, never assumed.
 *
 * Why the ladder rather than comparing the line sum straight to the stated total: on
 * IB-55871 -- the clean control document -- the line sum is $3,259.00 and the stated total
 * is $3,747.85, because the total includes GST. A direct comparison reports a contradiction
 * on the one document that is definitively correct, and a detector that cries wolf on the
 * control trains a reviewer to ignore ambiguities entirely.
 *
 * This is arithmetic on printed figures, not tax logic. The service never checks that a tax
 * RATE is correct, never computes tax from a subtotal, and never infers a tax-exclusive
 * figure from a tax-inclusive one. It only asks whether the printed numbers agree.
 */
export function detectTotalAmbiguities(
  lineItems: readonly LineItem[],
  stated: StatedTotals,
): Ambiguity[] {
  const ambiguities: Ambiguity[] = [];

  const summable = lineItems.filter((item) => item.amount !== undefined);
  const lineSum = summable.reduce((total, item) => total + (item.amount?.value ?? 0), 0);

  // Rung 1: the line-item sum against the stated subtotal.
  if (stated.subtotal && summable.length > 0) {
    const difference = lineSum - stated.subtotal.cents;
    if (difference !== 0) {
      ambiguities.push(
        buildTotalAmbiguity({
          fact: 'document subtotal',
          figures: [stated.subtotal],
          computed: { value: lineSum, derivedFrom: `sum of ${summable.length} line item amounts` },
          difference,
          lineItemCount: summable.length,
        }),
      );
    }
  }

  // Rung 2: stated subtotal plus stated tax against the stated total.
  if (stated.subtotal && stated.tax && stated.total) {
    const expected = stated.subtotal.cents + stated.tax.cents;
    const difference = stated.total.cents - expected;
    if (difference !== 0) {
      ambiguities.push(
        buildTotalAmbiguity({
          fact: 'document total',
          figures: [stated.subtotal, stated.tax, stated.total],
          computed: { value: expected, derivedFrom: 'stated subtotal plus stated tax' },
          difference,
          lineItemCount: Math.max(summable.length, 1),
        }),
      );
    }
  } else if (stated.total && !stated.tax && summable.length > 0) {
    // No tax line at all (IB-56088): the total should equal the line sum directly.
    const difference = stated.total.cents - lineSum;
    if (difference !== 0) {
      ambiguities.push(
        buildTotalAmbiguity({
          fact: 'document total',
          figures: [stated.total],
          computed: { value: lineSum, derivedFrom: `sum of ${summable.length} line item amounts` },
          difference,
          lineItemCount: summable.length,
        }),
      );
    }
  }

  // Two differing figures both labelled as the document total.
  const distinctTotals = dedupeByCents(stated.allTotals);
  if (distinctTotals.length > 1) {
    ambiguities.push({
      kind: 'material_mismatch',
      type: 'conflicting_totals',
      fact: 'document total',
      values: distinctTotals.map((figure) => ({
        label: figure.label,
        value: figure.cents,
        evidence: figure.evidence,
      })),
      reason: `This document states more than one total: ${distinctTotals
        .map((f) => `${formatCents(f.cents)} on page ${f.evidence.page}`)
        .join(' and ')}. Neither has been chosen over the other.`,
    });
  }

  return ambiguities;
}

interface TotalAmbiguityInput {
  fact: string;
  figures: StatedFigure[];
  computed: { value: number; derivedFrom: string };
  difference: number;
  lineItemCount: number;
}

function buildTotalAmbiguity(input: TotalAmbiguityInput): Ambiguity {
  const { fact, figures, computed, difference, lineItemCount } = input;

  // FR-025: a difference of at most one cent per line item is the expected consequence of
  // per-line rounding. It is still reported -- only labelled, never hidden.
  const threshold = Math.max(lineItemCount, 1);
  const kind = Math.abs(difference) <= threshold ? 'rounding_difference' : 'material_mismatch';

  const stated = figures.map((f) => `${f.label} of ${formatCents(f.cents)}`).join(', ');
  const gap = formatCents(Math.abs(difference));

  const reason =
    kind === 'rounding_difference'
      ? `The ${fact} is out by ${gap}: ${stated}, against ${formatCents(computed.value)} from the ${computed.derivedFrom}. This is the size of difference per-line rounding produces, but it has not been adjusted away.`
      : `The ${fact} does not add up: ${stated}, against ${formatCents(computed.value)} from the ${computed.derivedFrom} — a difference of ${gap}. Neither figure has been chosen over the other.`;

  return {
    kind,
    type: 'total_vs_sum',
    fact,
    values: figures.map((f) => ({ label: f.label, value: f.cents, evidence: f.evidence })),
    computed,
    reason,
  };
}

function dedupeByCents(figures: readonly StatedFigure[]): StatedFigure[] {
  const seen = new Map<number, StatedFigure>();
  for (const figure of figures) if (!seen.has(figure.cents)) seen.set(figure.cents, figure);
  return [...seen.values()];
}
