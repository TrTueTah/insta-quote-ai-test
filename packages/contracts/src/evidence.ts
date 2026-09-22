import { z } from 'zod';

/**
 * Where a value came from: a page number and the exact text on that page that supports it.
 *
 * `sourceText` must be a literal substring of the page's canonical text. It is never a
 * paraphrase, a reformatted number, or a reconstruction. Zod can only check that it is a
 * non-empty string — only the verification gate can confirm it is genuine evidence, by
 * checking it against the page it claims.
 */
export const EvidenceSchema = z.object({
  page: z.number().int().min(1),
  sourceText: z.string().min(1),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * A value that carries its evidence. This is the unit that enforces "evidence or refusal".
 *
 * There is deliberately no variant with optional evidence: a value without evidence is not
 * representable in this type system, so it can only exist as a Refusal.
 */
export const evidencedValue = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, evidence: EvidenceSchema });

export const EvidencedStringSchema = evidencedValue(z.string());
export const EvidencedNumberSchema = evidencedValue(z.number());

export type EvidencedValue<T> = { value: T; evidence: Evidence };
