import type { Refusal } from '@insta-quote/contracts';
import { fieldLabel } from '../view/labels';

/**
 * Every refusal in the result, whatever its scope — the complete inventory (FR-024).
 *
 * Line-item refusals appear here AND inline on their row. That duplication is deliberate and
 * must not be tidied away (FR-026): the two placements answer different questions. Inline
 * answers "why is this number missing?"; this list answers "how much did this document not
 * give me?"
 */
export function RefusalInventory({ refusals }: { refusals: readonly Refusal[] }) {
  if (refusals.length === 0) return null;

  return (
    <section aria-labelledby="not-extracted-heading" data-testid="refusal-inventory">
      <h2 id="not-extracted-heading" className="text-lg font-semibold text-zinc-900">
        Not extracted
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Everything below is missing from the result, with the reason it was left out.
      </p>

      <ul className="mt-3 space-y-3">
        {refusals.map((refusal, index) => (
          <li
            key={`${refusal.scope}-${refusal.lineItemId ?? ''}-${refusal.field ?? ''}-${index}`}
            className="rounded-lg border border-amber-200 bg-amber-50 p-4"
            data-testid="refusal"
          >
            <p className="text-sm font-medium text-amber-900">{concerns(refusal)}</p>
            <p className="mt-1 text-sm text-amber-950" data-testid="refusal-reason">
              {refusal.reason}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What this refusal is about, in words rather than identifiers.
 *
 * FR-021 forbids showing `p1-r2` or `value_not_provided`, so a line-item refusal is described
 * by its field and page — the things a person can actually find on their document.
 */
function concerns(refusal: Refusal): string {
  switch (refusal.scope) {
    case 'value':
      return refusal.field
        ? `${fieldLabel(refusal.field)} on page ${refusal.page ?? '?'}`
        : `A value on page ${refusal.page ?? '?'}`;
    case 'lineItem':
      return `A line on page ${refusal.page ?? '?'}`;
    case 'page':
      return `Page ${refusal.page ?? '?'}`;
    case 'document':
      return 'This document';
  }
}
