/**
 * Parsing printed figures into the values the result carries.
 *
 * Money becomes integer cents so the FR-025 rounding threshold is exact rather than subject
 * to binary floating-point drift, which would make the rounding-vs-material boundary flaky.
 */

/** "$1,248.00" -> 124800. Returns null if the text is not a currency figure. */
export function parseMoneyToCents(text: string): number | null {
  const match = /^-?[$£€]?\s?(-?[\d,]+(?:\.\d{1,2})?)$/.exec(text.trim());
  if (!match) return null;

  const numeric = (match[1] ?? '').replace(/,/g, '');
  if (numeric === '') return null;

  const value = Number(numeric);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}

/** "24" -> 24, "2000" -> 2000. Returns null if not a plain quantity. */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Format cents for a display string: 124800 -> "$1,248.00". */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-NZ');
  return `${negative ? '-' : ''}$${whole}.${String(abs % 100).padStart(2, '0')}`;
}
