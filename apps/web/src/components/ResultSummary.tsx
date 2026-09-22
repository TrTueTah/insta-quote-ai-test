import type { ResultSummary as Summary } from '../view/result-summary';

/**
 * Counts at the top, with links into each section.
 *
 * Rendered only when there is something to flag. A clean document gets no summary at all,
 * because "0 not extracted" is still a report about problems and gives a reviewer something
 * to worry about that does not exist (FR-014).
 */
export function ResultSummaryStrip({ summary }: { summary: Summary }) {
  if (summary.hasNothingToFlag) return null;

  return (
    <div
      className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm"
      data-testid="result-summary"
    >
      <span className="text-zinc-900">
        <strong>{summary.lineItemCount}</strong> line{' '}
        {summary.lineItemCount === 1 ? 'item' : 'items'}
      </span>
      {summary.refusalCount > 0 && (
        <a href="#not-extracted-heading" className="text-amber-900 underline">
          <strong>{summary.refusalCount}</strong> not extracted
        </a>
      )}
      {summary.ambiguityCount > 0 && (
        <a href="#contradictions-heading" className="text-rose-900 underline">
          <strong>{summary.ambiguityCount}</strong>{' '}
          {summary.ambiguityCount === 1 ? 'contradiction' : 'contradictions'}
        </a>
      )}
    </div>
  );
}
