import { describe, expect, it } from 'vitest';
import { extractPageTexts } from '../../src/pdf/page-text.js';
import { readCorpus } from '../helpers/corpus.js';

/**
 * Page text is the ground truth every evidence claim is checked against, so these
 * assertions are against the real sample documents, not fixtures.
 */
describe('canonical page text', () => {
  it('produces row-shaped text so a whole row is a literal substring', async () => {
    const { pageCount, pageTexts } = await extractPageTexts(readCorpus('IB-55871'));

    expect(pageCount).toBe(1);
    expect(pageTexts.get(1)).toContain(
      'FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00',
    );
    expect(pageTexts.get(1)).toContain('Subtotal: $3,259.00');
    expect(pageTexts.get(1)).toContain('Total (incl GST): $3,747.85');
  });

  it('reports an image-only page as empty rather than throwing', async () => {
    const { pageCount, pageTexts, failures } = await extractPageTexts(readCorpus('IB-55902'));

    expect(pageCount).toBe(1);
    expect(pageTexts.get(1)).toBe('');
    expect(failures).toHaveLength(0); // absent text is not a read failure
  });

  it('isolates a blank page inside an otherwise readable document', async () => {
    const { pageCount, pageTexts } = await extractPageTexts(readCorpus('IB-STMT47'));

    expect(pageCount).toBe(8);
    expect(pageTexts.get(4)).toBe('');

    for (const page of [1, 2, 3, 5, 6, 7, 8]) {
      expect(pageTexts.get(page), `page ${page}`).not.toBe('');
      expect(pageTexts.get(page), `page ${page}`).toContain(`Page ${page} of 8`);
    }
  });

  it('keeps the five-column layout intact, including two-token weights and price suffixes', async () => {
    const { pageTexts } = await extractPageTexts(readCorpus('IB-56010'));

    expect(pageTexts.get(1)).toContain('FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea');
    expect(pageTexts.get(1)).not.toContain('$40.00');
  });
});
