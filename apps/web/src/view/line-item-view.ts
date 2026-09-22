import type { Evidence, LineItem, LineItemField, Refusal } from '@insta-quote/contracts';
import { FIELD_ORDER, MONEY_FIELDS, fieldLabel } from './labels';
import { formatCents, formatQuantity } from './format';

export interface PresentedValue {
  field: LineItemField;
  label: string;
  display: string;
  evidence: Evidence;
}

export interface MissingValue {
  field: LineItemField;
  label: string;
  /** The extraction service's own words, verbatim. Null when nothing explained the gap. */
  reason: string | null;
}

export interface LineItemView {
  id: string;
  page: number;
  values: PresentedValue[];
  missing: MissingValue[];
  /** The one evidence every present value agrees on, or null when they differ. */
  sharedEvidence: Evidence | null;
}

/**
 * Project one line item for display, joining its absent fields to the refusals explaining
 * them.
 *
 * The join happens here, once, so the person never does it themselves (FR-015). It is the
 * whole reason `missing` exists: a blank where a number should be is useless, and asking
 * someone to match `p1-r2` against a separate list is worse.
 */
export function toLineItemView(item: LineItem, refusals: readonly Refusal[]): LineItemView {
  const values: PresentedValue[] = [];
  const missing: MissingValue[] = [];

  for (const field of FIELD_ORDER) {
    const evidenced = item[field];

    if (evidenced === undefined) {
      const refusal = refusals.find((r) => r.lineItemId === item.id && r.field === field);

      // A gap with no refusal naming it should be impossible -- the extraction service
      // guarantees every absent field carries one. If it ever happens the page says so,
      // because an unexplained blank is exactly the failure both halves exist to prevent.
      missing.push({
        field,
        label: fieldLabel(field),
        reason: refusal?.reason ?? null,
      });
      continue;
    }

    values.push({
      field,
      label: fieldLabel(field),
      display: displayOf(field, evidenced.value),
      evidence: evidenced.evidence,
    });
  }

  return { id: item.id, page: item.page, values, missing, sharedEvidence: sharedEvidence(values) };
}

function displayOf(field: LineItemField, value: string | number): string {
  if (typeof value === 'string') return value;
  return MONEY_FIELDS.has(field) ? formatCents(value) : formatQuantity(value);
}

/**
 * Evidence is rendered once per line item when every value agrees on it, which is true for
 * all 29 line items in the sample corpus -- each field of a row is read from that same row.
 *
 * Repeating the identical 64-character quote six times per row would triple every row's
 * height and push a single refusal below the fold on a long document, satisfying FR-006
 * literally while defeating FR-005 by layout.
 *
 * Returning null when they differ matters: the shared property is a measured fact about the
 * current corpus, not a guarantee, and showing one value's evidence against another's would
 * be worse than showing it twice.
 */
function sharedEvidence(values: readonly PresentedValue[]): Evidence | null {
  const first = values[0]?.evidence;
  if (!first) return null;

  const allAgree = values.every(
    (v) => v.evidence.page === first.page && v.evidence.sourceText === first.sourceText,
  );

  return allAgree ? first : null;
}
