import type { LineItemField, Refusal, RefusalCode } from '@insta-quote/contracts';
import { valueAppearsIn } from './normalize.js';

/**
 * A proposal for one field of one line item.
 *
 * Candidates from the rules parser and candidates from the LLM are the SAME shape. The gate
 * cannot tell them apart, and that is the entire point: both paths go through this one
 * check, so an LLM's confidence buys it nothing.
 */
export interface Candidate {
  lineItemId: string;
  field: LineItemField;
  value: string | number;
  claimedPage: number;
  claimedSourceText: string;
  /** Monetary fields are integer cents and need the decimal form for check 3. */
  isMoney?: boolean;
}

export interface AcceptedValue {
  lineItemId: string;
  field: LineItemField;
  value: string | number;
  page: number;
  sourceText: string;
}

export interface GateResult {
  accepted: AcceptedValue[];
  refused: Refusal[];
}

/** Why a candidate failed, before it is turned into a display-ready reason string. */
export interface GateFailure {
  code: RefusalCode;
  page: number;
}

export type ReasonFor = (failure: GateFailure, candidate: Candidate) => string;

/**
 * The verification gate. Pure: no I/O, no clock, no randomness, and no imports from
 * Fastify, pdfjs, or the OpenAI client. Never throws -- a malformed candidate is refused,
 * not raised (Principle III).
 *
 * Three checks, in order, first failure wins:
 *
 *   1. The claimed source text is a literal substring of the claimed page's text.
 *      This is the constitutional gate. No normalization whatsoever.
 *   2. It occurs exactly once on that page. A fragment matching three rows is not evidence
 *      for any one of them -- IB-STMT47.pdf repeats "$60.00" on all seven readable pages.
 *   3. The value itself appears inside its own source text, so a candidate cannot pass by
 *      quoting a real row while reporting a number that is not in it.
 *
 * Checks 2 and 3 are strictly stronger than check 1 and never accept anything check 1 would
 * reject, so they comply with the constitution while closing a real hole in it.
 */
export function verify(
  candidates: readonly Candidate[],
  pageTexts: ReadonlyMap<number, string>,
  reasonFor: ReasonFor,
): GateResult {
  const accepted: AcceptedValue[] = [];
  const refused: Refusal[] = [];

  for (const candidate of candidates) {
    const failure = checkCandidate(candidate, pageTexts);

    if (failure === null) {
      accepted.push({
        lineItemId: candidate.lineItemId,
        field: candidate.field,
        value: candidate.value,
        page: candidate.claimedPage,
        sourceText: candidate.claimedSourceText,
      });
      continue;
    }

    refused.push({
      scope: 'value',
      page: candidate.claimedPage,
      lineItemId: candidate.lineItemId,
      field: candidate.field,
      code: failure.code,
      reason: reasonFor(failure, candidate),
    });
  }

  return { accepted, refused };
}

function checkCandidate(
  candidate: Candidate,
  pageTexts: ReadonlyMap<number, string>,
): GateFailure | null {
  const { claimedPage, claimedSourceText } = candidate;

  // Check 0: the claimed page must exist and carry text.
  const pageText = pageTexts.get(claimedPage);
  if (pageText === undefined || pageText.length === 0) {
    return { code: 'source_text_not_found', page: claimedPage };
  }

  // A candidate quoting nothing has quoted no evidence.
  if (typeof claimedSourceText !== 'string' || claimedSourceText.length === 0) {
    return { code: 'source_text_not_found', page: claimedPage };
  }

  // Check 1: literal substring. No normalization -- this is the constitutional gate.
  const first = pageText.indexOf(claimedSourceText);
  if (first === -1) {
    return { code: 'source_text_not_found', page: claimedPage };
  }

  // Check 2: exactly one occurrence.
  if (pageText.indexOf(claimedSourceText, first + 1) !== -1) {
    return { code: 'source_text_ambiguous', page: claimedPage };
  }

  // Check 3: the value is present in its own source text, as a whole value rather than an
  // accidental substring.
  if (!valueAppearsIn(candidate.value, claimedSourceText, candidate.isMoney === true)) {
    return { code: 'value_not_in_source_text', page: claimedPage };
  }

  return null;
}
