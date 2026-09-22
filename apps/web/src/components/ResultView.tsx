import type { ExtractionResult } from '@insta-quote/contracts';
import { summarise } from '../view/result-summary';
import { ResultSummaryStrip } from './ResultSummary';
import { RefusalInventory } from './RefusalInventory';
import { AmbiguityList } from './AmbiguityCard';
import { LineItemCard } from './LineItemCard';

/**
 * The whole result, in reading order.
 *
 * Contradictions and refusals come ABOVE the line items, which looks backwards until you try
 * it with IB-STMT47.pdf: 21 line items and one refused page. Put the refusal underneath and
 * it is off-screen. FR-005 forbids requiring interaction to reveal any of the three sections,
 * and scrolling past 21 rows is interaction.
 *
 * Ordering by what a reader most needs to know -- what is missing or contradictory -- rather
 * than by what is most numerous is what makes "first-class" true in layout and not only in
 * markup.
 */
export function ResultView({
  result,
  fileName,
}: {
  result: ExtractionResult;
  fileName: string;
}) {
  const summary = summarise(result);

  return (
    <div className="space-y-8" data-testid="result-view">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">{fileName}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {result.pageCount} {result.pageCount === 1 ? 'page' : 'pages'} read.
        </p>
      </header>

      <ResultSummaryStrip summary={summary} />

      <AmbiguityList ambiguities={result.ambiguities} />

      <RefusalInventory refusals={result.refusals} />

      {result.lineItems.length > 0 ? (
        <section aria-labelledby="line-items-heading" data-testid="line-items-section">
          <h2 id="line-items-heading" className="text-lg font-semibold text-zinc-900">
            Line items
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Every value below shows the page and the exact wording it was read from.
          </p>
          <ul className="mt-3 space-y-3">
            {result.lineItems.map((item) => (
              <li key={item.id}>
                <LineItemCard item={item} refusals={result.refusals} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        // FR-013: a document that yielded nothing is an informative outcome, not a failure.
        // The refusals above ARE the result, and the page does not apologise for them.
        <p className="text-sm text-zinc-600" data-testid="no-line-items-note">
          No line items were read from this document. The reasons above explain why.
        </p>
      )}
    </div>
  );
}
