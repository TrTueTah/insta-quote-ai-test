/**
 * Bounded value matching for gate check 3 ONLY.
 *
 * Check 3 asks whether an extracted value appears inside the source text quoted for it --
 * the amount 124800 cents must be recognizable in the text "$1,248.00". That needs a little
 * tolerance for currency symbols and thousands separators.
 *
 * This is NEVER applied to the page text in checks 1 and 2. Widening what counts as
 * "present on the page" is precisely what Principle I forbids. Here we compare a value
 * against a string that has *already been proven* to be on the page, which is a different
 * and much narrower question.
 */

/** Render integer cents back to the decimal form a document would print. */
export function centsToDecimalString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Every numeric literal in a piece of text, as written.
 *
 * Matching numbers as whole tokens rather than as substrings matters more than it looks.
 * The IB-56010 washers row reads "... loose 2000 640g total $0.02 /ea". A naive substring
 * check for the fabricated amount "40.00" -- or its trimmed form "40" -- finds "40" inside
 * "640g" and accepts a number that is not on the page at all.
 */
export function numericTokens(text: string): string[] {
  return [...text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ''));
}

/**
 * Numeric literals that are marked as money by an adjacent currency symbol.
 */
export function currencyTokens(text: string): string[] {
  return [...text.matchAll(/[$£€]\s?(-?\d[\d,]*(?:\.\d+)?)/g)].map((m) =>
    (m[1] ?? '').replace(/,/g, ''),
  );
}

/**
 * Numeric literals written with exactly two decimal places, e.g. "22.40".
 *
 * Plain token matching is not enough for monetary values. The IB-56010 washers row contains
 * the bare token "640" (from the weight "640g total"), so a fabricated amount of $640.00
 * would match a genuine token and pass the gate.
 *
 * Requiring a currency symbol fixes that but is too strict: a live test against an invoice
 * printing "@ 22.40 each" had every correct unit price refused, because the document simply
 * does not use "$". Two-decimal formatting is the signal that separates the two cases --
 * "22.40" is written as money, "640" is not -- without the gate needing to understand either.
 */
export function twoDecimalTokens(text: string): string[] {
  return [...text.matchAll(/-?\d[\d,]*\.\d{2}(?!\d)/g)].map((m) => m[0].replace(/,/g, ''));
}

/** Non-numeric comparison: collapse whitespace so row joining cannot break a match. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Is `value` present in `sourceText` as a value, not as an accidental substring?
 *
 * Money must match either a currency-marked token or a token written with two decimal
 * places, compared by magnitude. So 124800 cents matches "$1,248.00" and 2240 matches
 * "22.40 each", but neither matches the bare "640" in "640g total". Other numbers must match
 * a whole numeric token, so "24" matches "24.00" but never "240" or "1.24". Strings must
 * appear literally, modulo collapsed whitespace.
 */
export function valueAppearsIn(
  value: string | number,
  sourceText: string,
  isMoney: boolean,
): boolean {
  if (typeof value === 'string') {
    const needle = normalizeText(value);
    return needle.length > 0 && normalizeText(sourceText).includes(needle);
  }

  if (!Number.isFinite(value)) return false;

  const target = isMoney ? value / 100 : value;
  const tokens = isMoney
    ? [...currencyTokens(sourceText), ...twoDecimalTokens(sourceText)]
    : numericTokens(sourceText);

  return tokens.some((token) => {
    const parsed = Number(token);
    return Number.isFinite(parsed) && Math.abs(parsed - target) < 1e-9;
  });
}
