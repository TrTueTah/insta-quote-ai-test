/**
 * Display formatting for values only.
 *
 * The formatted number is a rendering; the quoted source text beside it is the proof, and it
 * is never reformatted (FR-007). If these two ever disagree, the source text is right.
 */

/** 124800 -> "$1,248.00" */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-NZ');
  return `${negative ? '-' : ''}$${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** Quantities print as the document states them: 2000, 24, 1.5 */
export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
