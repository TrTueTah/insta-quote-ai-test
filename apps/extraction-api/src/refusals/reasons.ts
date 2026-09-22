import type { LineItemField, RefusalCode } from '@insta-quote/contracts';

/**
 * The display-ready reason strings.
 *
 * These are the exact strings the end user reads (FR-011, Principle IV). The web app
 * renders them verbatim: it does not re-derive them, and it does not re-classify them into
 * generic buckets. If the UI ever shows "something went wrong" for a case named here, that
 * is a constitution violation.
 *
 * They are written for a merchant or estimator, not an engineer. No error codes, no stack
 * language, no "failed to process".
 */

const FIELD_LABELS: Record<LineItemField, string> = {
  code: 'product code',
  description: 'description',
  quantity: 'quantity',
  unit: 'unit',
  unitPrice: 'unit price',
  amount: 'amount',
};

export function fieldLabel(field: LineItemField): string {
  return FIELD_LABELS[field];
}

export interface ReasonContext {
  page?: number;
  field?: LineItemField;
  /** A human handle for the row, e.g. a product code, when one is known. */
  itemLabel?: string;
}

export function reasonFor(code: RefusalCode, context: ReasonContext = {}): string {
  const { page, field, itemLabel } = context;
  const what = field ? FIELD_LABELS[field] : 'value';
  const row = itemLabel ? ` for ${itemLabel}` : '';
  const onPage = page === undefined ? '' : ` on page ${page}`;

  switch (code) {
    case 'no_text_on_page':
      return `Page ${page} contains no extractable text — it may be a scanned image. Reading text from scanned pages is not supported, so nothing was taken from this page.`;

    case 'page_unreadable':
      return `Page ${page} could not be read because the page data is damaged. Every other page in this document was processed normally.`;

    case 'document_unreadable':
      return 'This file could not be opened as a PDF, so nothing could be read from it.';

    case 'document_encrypted':
      return 'This PDF is password-protected, so its contents could not be read.';

    case 'source_text_not_found':
      return `The ${what}${row} was not extracted: the text it was supposed to come from could not be found${onPage || ' on the page it was attributed to'}.`;

    case 'source_text_ambiguous':
      return `The ${what}${row} was not extracted: the text quoted as its source appears more than once${onPage}, so it cannot identify a single line.`;

    case 'value_not_in_source_text':
      return `The ${what}${row} was not extracted: the number does not appear in the text quoted as its source${onPage}, so it could not be confirmed against the document.`;

    case 'value_not_provided':
      return `This document does not state ${indefinite(what)}${row}${onPage} — the information is absent from the page rather than unreadable.`;

    default: {
      // Exhaustiveness: adding a RefusalCode without a reason string fails to compile.
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function indefinite(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/** Reason for a whole document that yielded nothing and had no other explanation. */
export function noLineItemsReason(): string {
  return 'No line items could be read from this document. It may not be an invoice, packing list, or delivery docket.';
}
