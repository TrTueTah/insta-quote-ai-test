import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema } from '@insta-quote/contracts';
import { extractCorpus } from '../helpers/run-corpus.js';

/**
 * IB-55902.pdf is an image-only scan with no text layer. Reading text from images is out of
 * scope, so the correct behaviour is a named refusal -- not an error, and not an empty
 * result with no explanation.
 */
describe('US2: image-only document', () => {
  it('returns a page-scoped refusal rather than failing', async () => {
    const { result } = await extractCorpus('IB-55902');

    expect(result.lineItems).toEqual([]);
    expect(result.ambiguities).toEqual([]);
    expect(result.refusals).toHaveLength(1);

    const refusal = result.refusals[0]!;
    expect(refusal.code).toBe('no_text_on_page');
    expect(refusal.scope).toBe('page');
    expect(refusal.page).toBe(1);
    expect(refusal.reason).toMatch(/scanned image/);
  });

  it('never returns an unexplained empty result (FR-016)', async () => {
    const { result } = await extractCorpus('IB-55902');

    expect(() => ExtractionResultSchema.parse(result)).not.toThrow();
    expect(result.refusals.length).toBeGreaterThan(0);
  });
});
