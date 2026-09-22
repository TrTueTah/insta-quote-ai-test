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
const AmbiguityShape = z.object({
  kind: AmbiguityKindSchema,
  type: AmbiguityTypeSchema,
  /** The single fact in conflict, e.g. "document total" or "cartons". */
  fact: z.string().min(1),
  /** Every conflicting value printed on the page, each with its own evidence (FR-013). */
  values: z.array(ConflictingValueSchema).min(1),
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

/**
 * A contradiction needs at least two things in conflict — but they are not always two
 * evidenced values.
 *
 * A total-versus-sum conflict often has ONE figure printed on the page and a computed sum on
 * the other side: a document stating `Total: $245.00` whose line items add to $190.00 states
 * that total exactly once. Requiring two entries in `values` rejected that shape, so Part A
 * detected the contradiction correctly and then threw while validating its own response,
 * turning a real finding into an HTTP 500.
 *
 * The invariant is therefore about the conflict, not about the array: `values` plus
 * `computed` must describe at least two sides.
 */
export const AmbiguitySchema = AmbiguityShape.refine(
  (a) => a.values.length + (a.computed ? 1 : 0) >= 2,
  {
    message:
      'A contradiction must have at least two sides: either two conflicting values, or one value and a computed figure.',
    path: ['values'],
  },
);

export type Ambiguity = z.infer<typeof AmbiguityShape>;
export type ConflictingValue = z.infer<typeof ConflictingValueSchema>;
