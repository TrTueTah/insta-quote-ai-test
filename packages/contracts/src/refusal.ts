import { z } from 'zod';

/**
 * The fixed, enumerated set of refusal cases (FR-009).
 *
 * Behaviour is only predictable and testable if this set is closed. Nothing may produce a
 * refusal outside it, and every reason string is built from the catalog in
 * `apps/extraction-api/src/refusals/reasons.ts`.
 */
export const RefusalCodeSchema = z.enum([
  /** The page yielded zero text items — most often a scanned image. */
  'no_text_on_page',
  /** The page threw while being read. */
  'page_unreadable',
  /** The document could not be opened as a PDF at all. */
  'document_unreadable',
  /** The document is password-protected. */
  'document_encrypted',
  /** Gate check 1: the claimed source text is not on the claimed page. */
  'source_text_not_found',
  /** Gate check 2: the claimed source text occurs more than once, so it identifies no row. */
  'source_text_ambiguous',
  /** Gate check 3: the value does not appear inside its own claimed source text. */
  'value_not_in_source_text',
  /** The document genuinely does not state this value (e.g. a docket with no prices). */
  'value_not_provided',
]);

export type RefusalCode = z.infer<typeof RefusalCodeSchema>;

export const RefusalScopeSchema = z.enum(['document', 'page', 'lineItem', 'value']);
export type RefusalScope = z.infer<typeof RefusalScopeSchema>;

export const LineItemFieldSchema = z.enum([
  'code',
  'description',
  'quantity',
  'unit',
  'unitPrice',
  'amount',
]);
export type LineItemField = z.infer<typeof LineItemFieldSchema>;

/**
 * A named thing the service would not extract.
 *
 * `scope` records the smallest boundary the failure was contained at, which is how fault
 * isolation (Principle III) is made visible rather than merely claimed.
 *
 * `reason` is the exact string shown to the end user (FR-011). It is not re-derived or
 * re-bucketed by any consumer.
 */
export const RefusalSchema = z.object({
  scope: RefusalScopeSchema,
  page: z.number().int().min(1).optional(),
  lineItemId: z.string().optional(),
  field: LineItemFieldSchema.optional(),
  code: RefusalCodeSchema,
  reason: z.string().min(1),
});

export type Refusal = z.infer<typeof RefusalSchema>;
