import type { ExtractionResult } from '@insta-quote/contracts';

export interface ResultSummary {
  lineItemCount: number;
  refusalCount: number;
  ambiguityCount: number;
  /** True when there is nothing to flag, so no summary or warning is rendered at all. */
  hasNothingToFlag: boolean;
}

/**
 * When a document came back clean, the page must not decorate it with empty sections or zero
 * counts (FR-014). "0 problems" is still a report about problems, and a reviewer reading it
 * has been given something to worry about that does not exist.
 */
export function summarise(result: ExtractionResult): ResultSummary {
  const refusalCount = result.refusals.length;
  const ambiguityCount = result.ambiguities.length;

  return {
    lineItemCount: result.lineItems.length,
    refusalCount,
    ambiguityCount,
    hasNothingToFlag: refusalCount === 0 && ambiguityCount === 0,
  };
}
