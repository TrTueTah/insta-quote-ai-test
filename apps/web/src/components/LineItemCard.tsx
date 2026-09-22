import type { LineItem, Refusal } from '@insta-quote/contracts';
import { toLineItemView } from '../view/line-item-view';
import { EvidenceQuote } from './Evidence';

/**
 * One extracted row: its values, the reason for anything missing, and the evidence.
 *
 * The inline reason (FR-023) is the point of this component. A person looking at a row with a
 * blank amount should never have to go anywhere else to learn why it is blank.
 */
export function LineItemCard({
  item,
  refusals,
}: {
  item: LineItem;
  refusals: readonly Refusal[];
}) {
  const view = toLineItemView(item, refusals);

  return (
    <article
      className="rounded-lg border border-zinc-200 bg-white p-4"
      data-testid="line-item"
      data-page={view.page}
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {view.values.map((value) => (
          <div key={value.field}>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{value.label}</dt>
            <dd className="mt-0.5 font-medium text-zinc-900" data-testid={`value-${value.field}`}>
              {value.display}
            </dd>
            {view.sharedEvidence === null && (
              <EvidenceQuote evidence={value.evidence} label={value.label} />
            )}
          </div>
        ))}

        {view.missing.map((missing) => (
          <div key={missing.field} data-testid={`missing-${missing.field}`}>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{missing.label}</dt>
            <dd className="mt-0.5 font-medium text-amber-800">Not extracted</dd>
            <p className="mt-1 text-sm text-amber-900" data-testid="inline-refusal-reason">
              {missing.reason ??
                'This value is missing and the extraction service did not say why. Treat this document as incompletely read.'}
            </p>
          </div>
        ))}
      </dl>

      {view.sharedEvidence !== null && <EvidenceQuote evidence={view.sharedEvidence} />}
    </article>
  );
}
