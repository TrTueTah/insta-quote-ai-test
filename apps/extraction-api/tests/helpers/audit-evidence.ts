import { expect } from 'vitest';
import type { ExtractionResult, LineItem } from '@insta-quote/contracts';
import { extractPageTexts } from '../../src/pdf/page-text.js';

const EVIDENCED_FIELDS = ['code', 'description', 'quantity', 'unit', 'unitPrice', 'amount'] as const;

/**
 * SC-001 in executable form.
 *
 * Re-extracts the document independently and asserts that every sourceText in the result is
 * found VERBATIM and EXACTLY ONCE on the page it claims. This is the guarantee the whole
 * feature rests on, so it is checked against the document rather than against the pipeline's
 * own idea of the page.
 */
export async function auditEvidence(result: ExtractionResult, data: Uint8Array): Promise<void> {
  const { pageTexts } = await extractPageTexts(data);

  for (const item of result.lineItems) {
    for (const field of EVIDENCED_FIELDS) {
      const evidenced = item[field as keyof LineItem] as
        | { value: unknown; evidence: { page: number; sourceText: string } }
        | undefined;
      if (evidenced === undefined) continue;

      const { page, sourceText } = evidenced.evidence;
      const pageText = pageTexts.get(page);

      expect(pageText, `${item.id}.${field} claims page ${page}`).toBeDefined();

      const first = pageText!.indexOf(sourceText);
      expect(first, `${item.id}.${field}: "${sourceText}" not found on page ${page}`).toBeGreaterThan(-1);
      expect(
        pageText!.indexOf(sourceText, first + 1),
        `${item.id}.${field}: source text occurs more than once on page ${page}`,
      ).toBe(-1);
    }
  }

  for (const ambiguity of result.ambiguities) {
    for (const value of ambiguity.values) {
      const pageText = pageTexts.get(value.evidence.page);
      expect(pageText, `ambiguity ${ambiguity.fact} claims page ${value.evidence.page}`).toBeDefined();
      expect(
        pageText!.includes(value.evidence.sourceText),
        `ambiguity ${ambiguity.fact}: "${value.evidence.sourceText}" not on page ${value.evidence.page}`,
      ).toBe(true);
    }
  }
}

/** Every absent field on every line item must be explained by a refusal (FR-005, FR-006). */
export function auditNoSilentOmissions(result: ExtractionResult): void {
  const explained = new Set(
    result.refusals
      .filter((r) => r.lineItemId !== undefined && r.field !== undefined)
      .map((r) => `${r.lineItemId}:${r.field}`),
  );

  for (const item of result.lineItems) {
    for (const field of EVIDENCED_FIELDS) {
      if (item[field as keyof LineItem] === undefined) {
        expect(
          explained.has(`${item.id}:${field}`),
          `${item.id}.${field} is absent with no refusal explaining it`,
        ).toBe(true);
      }
    }
  }
}
