import { z } from 'zod';
import { EvidenceSchema } from './evidence.js';

/**
 * How severe a total-versus-sum difference is (FR-025).
 *
 * Both kinds are reported. The distinction exists so a reviewer can tell expected per-line
 * rounding apart from a real discrepancy — NOT so the smaller kind can be hidden.
 */
export const AmbiguityKindSchema = z.enum(['rounding_difference', 'material_mismatch']);
export type AmbiguityKind = z.infer<typeof AmbiguityKindSchema>;

/** Which detector fired. */
export const AmbiguityTypeSchema = z.enum([
  'total_vs_sum',
  'conflicting_totals',
  'conflicting_unit_prices',
  'conflicting_counts',
]);
export type AmbiguityType = z.infer<typeof AmbiguityTypeSchema>;

const ConflictingValueSchema = z.object({
  /** What this figure is called on the page, e.g. "stated subtotal". */
  label: z.string().min(1),
  value: z.number(),
  evidence: EvidenceSchema,
});

/**
 * A contradiction found in the document.
 *
 * Note what is absent: there is no `resolved`, `preferred`, or `bestGuess` field. FR-014
 * ("never silently pick one of the conflicting values") is enforced by the shape of the
 * type, so it cannot be violated by a later change without altering this schema.
 */
export const AmbiguitySchema = z.object({
  kind: AmbiguityKindSchema,
  type: AmbiguityTypeSchema,
  /** The single fact in conflict, e.g. "document total" or "cartons". */
  fact: z.string().min(1),
  /** Every conflicting value, each with its own evidence (FR-013). */
  values: z.array(ConflictingValueSchema).min(2),
  /**
   * Present only where one side of the comparison is a sum rather than a printed figure.
   * This is the only number in the entire system not backed by page evidence, so it is
   * structurally segregated and labelled with its derivation rather than being smuggled in
   * as an evidenced value.
   */
  computed: z
    .object({
      value: z.number(),
      derivedFrom: z.string().min(1),
    })
    .optional(),
  /** Shown to the user verbatim, exactly like a refusal reason. */
  reason: z.string().min(1),
});

export type Ambiguity = z.infer<typeof AmbiguitySchema>;
export type ConflictingValue = z.infer<typeof ConflictingValueSchema>;
