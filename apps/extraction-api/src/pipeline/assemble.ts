import type { LineItem, LineItemField, Refusal } from '@insta-quote/contracts';
import type { AcceptedValue } from '../gate/verify.js';
import type { RuleAbsence, RuleParseFailure } from '../candidates/rules.js';
import { noLineItemsReason, reasonFor } from '../refusals/reasons.js';

/** Fields a six-column row is expected to carry. Absence of any of them is explained. */
const EXPECTED_FIELDS: readonly LineItemField[] = [
  'code',
  'description',
  'quantity',
  'unit',
  'unitPrice',
  'amount',
];

export interface AssembleInput {
  accepted: readonly AcceptedValue[];
  gateRefusals: readonly Refusal[];
  absences: readonly RuleAbsence[];
  parseFailures: readonly RuleParseFailure[];
  /** Pages whose canonical text was empty. */
  emptyPages: readonly number[];
  /** Pages that threw while being read. */
  unreadablePages: readonly number[];
}

export interface AssembleOutput {
  lineItems: LineItem[];
  refusals: Refusal[];
}

/**
 * Turn gate output into the response body.
 *
 * The invariant this function exists to hold: for every field absent from a line item,
 * there is a refusal naming that item and that field. A field is never filled with a null,
 * a zero, or an empty string to keep the shape tidy (FR-005, FR-006).
 */
export function assemble(input: AssembleInput): AssembleOutput {
  const refusals: Refusal[] = [];
  const byItem = new Map<string, { page: number; values: Map<LineItemField, AcceptedValue> }>();

  for (const value of input.accepted) {
    const existing = byItem.get(value.lineItemId);
    if (existing) existing.values.set(value.field, value);
    else byItem.set(value.lineItemId, { page: value.page, values: new Map([[value.field, value]]) });
  }

  // Refusals produced by the gate itself keep their reason strings untouched.
  refusals.push(...input.gateRefusals);

  // Pages with no text at all, and pages that could not be read.
  for (const page of input.emptyPages) {
    refusals.push({
      scope: 'page',
      page,
      code: 'no_text_on_page',
      reason: reasonFor('no_text_on_page', { page }),
    });
  }
  for (const page of input.unreadablePages) {
    refusals.push({
      scope: 'page',
      page,
      code: 'page_unreadable',
      reason: reasonFor('page_unreadable', { page }),
    });
  }

  // Rows that looked like line items but could not be parsed -- isolated per row.
  for (const failure of input.parseFailures) {
    refusals.push({
      scope: 'lineItem',
      page: failure.page,
      lineItemId: failure.lineItemId,
      code: 'source_text_not_found',
      reason: `A line on page ${failure.page} looked like a line item but its columns could not be read, so nothing was taken from it. Every other line on this page was processed normally.`,
    });
  }

  // Values the document genuinely does not state.
  for (const absence of input.absences) {
    refusals.push({
      scope: 'value',
      page: absence.page,
      lineItemId: absence.lineItemId,
      field: absence.field,
      code: 'value_not_provided',
      reason: reasonFor('value_not_provided', {
        page: absence.page,
        field: absence.field,
        ...(absence.itemLabel ? { itemLabel: absence.itemLabel } : {}),
      }),
    });
  }

  const explained = new Set(
    refusals
      .filter((r) => r.lineItemId !== undefined && r.field !== undefined)
      .map((r) => `${r.lineItemId}:${r.field}`),
  );

  const lineItems: LineItem[] = [];

  for (const [id, { page, values }] of byItem) {
    const item: LineItem = { id, page };
    for (const field of EXPECTED_FIELDS) {
      const accepted = values.get(field);
      if (accepted) {
        setField(item, field, accepted);
      } else if (!explained.has(`${id}:${field}`)) {
        // No value and no explanation yet: say so rather than leaving a silent hole.
        const label = values.get('code')?.value;
        refusals.push({
          scope: 'value',
          page,
          lineItemId: id,
          field,
          code: 'value_not_provided',
          reason: reasonFor('value_not_provided', {
            page,
            field,
            ...(typeof label === 'string' ? { itemLabel: label } : {}),
          }),
        });
      }
    }

    // A row where nothing at all survived is refusals only, never an empty line item.
    if (EXPECTED_FIELDS.some((field) => values.has(field))) lineItems.push(item);
  }

  lineItems.sort((a, b) => a.page - b.page || a.id.localeCompare(b.id, 'en'));

  // FR-016: a result with nothing extracted must explain itself.
  if (lineItems.length === 0 && refusals.length === 0) {
    refusals.push({ scope: 'document', code: 'value_not_provided', reason: noLineItemsReason() });
  }

  return { lineItems, refusals };
}

function setField(item: LineItem, field: LineItemField, accepted: AcceptedValue): void {
  const evidenced = {
    value: accepted.value,
    evidence: { page: accepted.page, sourceText: accepted.sourceText },
  };

  switch (field) {
    case 'code':
    case 'description':
    case 'unit':
      if (typeof accepted.value === 'string') {
        item[field] = evidenced as { value: string; evidence: { page: number; sourceText: string } };
      }
      return;
    case 'quantity':
    case 'unitPrice':
    case 'amount':
      if (typeof accepted.value === 'number') {
        item[field] = evidenced as { value: number; evidence: { page: number; sourceText: string } };
      }
      return;
  }
}
