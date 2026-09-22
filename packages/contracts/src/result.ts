import { z } from 'zod';
import { EvidencedNumberSchema, EvidencedStringSchema } from './evidence.js';
import { RefusalSchema } from './refusal.js';
import { AmbiguitySchema } from './ambiguity.js';

/**
 * One extracted row.
 *
 * Every field is optional, and that is the point: a field is present only when it was
 * independently evidenced. For every absent field the result carries a Refusal naming this
 * item and that field — absence is never silent (FR-005, FR-006).
 *
 * Monetary values are integer cents (`$1,248.00` -> `124800`) so the FR-025 rounding
 * threshold is exact rather than subject to floating-point drift.
 */
export const LineItemSchema = z.object({
  id: z.string().min(1),
  page: z.number().int().min(1),
  code: EvidencedStringSchema.optional(),
  description: EvidencedStringSchema.optional(),
  quantity: EvidencedNumberSchema.optional(),
  unit: EvidencedStringSchema.optional(),
  unitPrice: EvidencedNumberSchema.optional(),
  amount: EvidencedNumberSchema.optional(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

/**
 * The single envelope returned for one document.
 *
 * Invariant (FR-016): if `lineItems` is empty then `refusals` must not be empty. A result
 * that extracted nothing and refused nothing is exactly the silent failure this whole
 * feature exists to prevent, so it is rejected by the schema itself.
 */
export const ExtractionResultSchema = z
  .object({
    documentName: z.string(),
    pageCount: z.number().int().min(0),
    lineItems: z.array(LineItemSchema),
    refusals: z.array(RefusalSchema),
    ambiguities: z.array(AmbiguitySchema),
  })
  .refine((r) => r.lineItems.length > 0 || r.refusals.length > 0, {
    message:
      'A result with no line items must explain itself with at least one refusal (FR-016).',
  });

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** Error body for the statuses where no result could be produced at all. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    /** Display-ready, for the same reason refusal reasons are. */
    message: z.string().min(1),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
