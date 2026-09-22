import { describe, expect, it } from 'vitest';
import { verify, type Candidate } from '../../src/gate/verify.js';
import { reasonFor } from '../../src/refusals/reasons.js';

/**
 * Gate tests use fixed text fixtures only: no PDFs, no network, no framework. The
 * constitution requires this suite to be fast and deterministic, and it is the suite that
 * proves "evidence or refusal" actually holds.
 */

const ROW = 'FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00';
const PAGE_1 = ['Ironbark Trade Merchants Ltd', 'Tax Invoice', ROW].join('\n');

const reason = (f: { code: Parameters<typeof reasonFor>[0]; page: number }, c: Candidate) =>
  reasonFor(f.code, { page: f.page, field: c.field });

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  lineItemId: 'p1-r1',
  field: 'amount',
  value: 124800,
  claimedPage: 1,
  claimedSourceText: ROW,
  isMoney: true,
  ...over,
});

const pages = (entries: Array<[number, string]>) => new Map(entries);

describe('verification gate', () => {
  it('accepts a candidate whose source text is on the page exactly once and contains the value', () => {
    const { accepted, refused } = verify([candidate()], pages([[1, PAGE_1]]), reason);

    expect(refused).toHaveLength(0);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ field: 'amount', value: 124800, page: 1, sourceText: ROW });
  });

  it('refuses source text that is absent from the page', () => {
    const { accepted, refused } = verify(
      [candidate({ claimedSourceText: 'ZZ-999 Imaginary product 1 ea $9.99 $9.99' })],
      pages([[1, PAGE_1]]),
      reason,
    );

    expect(accepted).toHaveLength(0);
    expect(refused[0]?.code).toBe('source_text_not_found');
  });

  it('refuses a candidate claiming a page that is not in the document', () => {
    const { accepted, refused } = verify([candidate({ claimedPage: 7 })], pages([[1, PAGE_1]]), reason);

    expect(accepted).toHaveLength(0);
    expect(refused[0]?.code).toBe('source_text_not_found');
    expect(refused[0]?.page).toBe(7);
  });

  it('refuses when the claimed page has no text at all', () => {
    const { accepted, refused } = verify([candidate()], pages([[1, '']]), reason);

    expect(accepted).toHaveLength(0);
    expect(refused[0]?.code).toBe('source_text_not_found');
  });

  it('refuses source text that occurs more than once on the page', () => {
    // IB-STMT47.pdf repeats identical rows across pages; within a page, a bare fragment
    // like "$60.00" proves nothing about which row it came from.
    const repeated = ['CX-1000 Consolidated line 1-1 5 ea $12.00 $60.00', 'Freight $60.00'].join('\n');

    const { accepted, refused } = verify(
      [candidate({ value: 6000, claimedSourceText: '$60.00' })],
      pages([[1, repeated]]),
      reason,
    );

    expect(accepted).toHaveLength(0);
    expect(refused[0]?.code).toBe('source_text_ambiguous');
  });

  it('refuses a value that does not appear in its own source text', () => {
    const { accepted, refused } = verify(
      [candidate({ value: 999900 })], // $9,999.00 is not in the quoted row
      pages([[1, PAGE_1]]),
      reason,
    );

    expect(accepted).toHaveLength(0);
    expect(refused[0]?.code).toBe('value_not_in_source_text');
  });

  it('accepts a value that matches only after bounded normalization', () => {
    // 124800 cents must be recognized in "$1,248.00".
    const { accepted } = verify([candidate({ value: 124800 })], pages([[1, PAGE_1]]), reason);
    expect(accepted).toHaveLength(1);
  });

  it('refuses an empty source text without throwing', () => {
    expect(() =>
      verify([candidate({ claimedSourceText: '' })], pages([[1, PAGE_1]]), reason),
    ).not.toThrow();

    const { accepted, refused } = verify(
      [candidate({ claimedSourceText: '' })],
      pages([[1, PAGE_1]]),
      reason,
    );
    expect(accepted).toHaveLength(0);
    expect(refused[0]?.code).toBe('source_text_not_found');
  });

  it('refuses source text differing only in whitespace — page text is never normalized', () => {
    const doubleSpaced = ROW.replace('$52.00 $1,248.00', '$52.00  $1,248.00');

    const { accepted, refused } = verify(
      [candidate({ claimedSourceText: doubleSpaced })],
      pages([[1, PAGE_1]]),
      reason,
    );

    expect(accepted).toHaveLength(0);
    expect(refused[0]?.code).toBe('source_text_not_found');
  });

  it('never throws on a malformed candidate', () => {
    const malformed = { lineItemId: '', field: 'amount', value: NaN, claimedPage: -1, claimedSourceText: ROW } as Candidate;
    expect(() => verify([malformed], pages([[1, PAGE_1]]), reason)).not.toThrow();
  });

  describe('the hallucination case', () => {
    it('refuses a computed-but-unprinted number even when the quoted row is genuine', () => {
      // IB-56010.pdf: the washers row states quantity 2000 and unit price $0.02. Their
      // product, $40.00, is arithmetically tempting and appears nowhere on the page. A model
      // proposing it quotes a real row, so check 1 and check 2 both pass -- check 3 is what
      // stops it. This test must pass before any LLM integration exists.
      const washers = 'FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea';

      const { accepted, refused } = verify(
        [candidate({ lineItemId: 'p1-r2', field: 'amount', value: 4000, claimedSourceText: washers })],
        pages([[1, washers]]),
        reason,
      );

      expect(accepted).toHaveLength(0);
      expect(refused[0]?.code).toBe('value_not_in_source_text');
    });

    it('does not accept a number that only appears inside a longer number', () => {
      // Regression guard. A substring check for "40" finds it inside "640g total", which
      // would let the fabricated $40.00 amount through while looking like a real match.
      const washers = 'FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea';

      for (const fabricated of [4000, 200, 64000]) {
        const { accepted } = verify(
          [candidate({ field: 'amount', value: fabricated, claimedSourceText: washers })],
          pages([[1, washers]]),
          reason,
        );
        expect(accepted, `value ${fabricated}`).toHaveLength(0);
      }
    });

    it('accepts a price written without a currency symbol', () => {
      // Found by a live test against an invoice printing "@ 22.40 each". Requiring a "$"
      // refused every correct unit price on the document. Two-decimal formatting is the
      // signal that "22.40" is money while the bare "640" in "640g" is not.
      const row = 'Dressed pine skirting 90x18 12 lengths @ 22.40 each';

      const { accepted } = verify(
        [candidate({ field: 'unitPrice', value: 2240, claimedSourceText: row })],
        pages([[1, row]]),
        reason,
      );

      expect(accepted).toHaveLength(1);
    });

    it('still rejects a fabricated amount that only matches an unformatted number', () => {
      const washers = 'FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea';

      // $640.00 would match the weight token "640", which is not written as money.
      const { accepted } = verify(
        [candidate({ field: 'amount', value: 64000, claimedSourceText: washers })],
        pages([[1, washers]]),
        reason,
      );

      expect(accepted).toHaveLength(0);
    });

    it('still accepts values that genuinely are whole tokens in the row', () => {
      const washers = 'FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea';

      const { accepted } = verify(
        [
          candidate({ field: 'quantity', value: 2000, claimedSourceText: washers, isMoney: false }),
          candidate({ field: 'unitPrice', value: 2, claimedSourceText: washers }),
        ],
        pages([[1, washers]]),
        reason,
      );

      expect(accepted).toHaveLength(2);
    });
  });
});
