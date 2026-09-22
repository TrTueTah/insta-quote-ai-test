import type { ExtractionResult, Refusal } from '@insta-quote/contracts';
import { extractPageTexts } from '../pdf/page-text.js';
import { parsePage, type RuleAbsence, type RuleParseFailure } from '../candidates/rules.js';
import { verify, type Candidate } from '../gate/verify.js';
import { reasonFor } from '../refusals/reasons.js';
import { assemble } from './assemble.js';
import { detectAmbiguities } from '../ambiguity/detect.js';
import { nullProposer, type CandidateProposer } from '../candidates/proposer.js';

export interface RunOptions {
  documentName: string;
  proposer?: CandidateProposer;
}

/**
 * The four-stage pipeline, in the fixed order the constitution sets out:
 *
 *   1. deterministic text extraction   (ground truth, no model)
 *   2. candidate interpretation        (rules first, LLM only where rules match nothing)
 *   3. deterministic verification gate (the only way into `lineItems`)
 *   4. ambiguity detection             (independent of which path produced the candidates)
 */
export async function runExtraction(
  data: Uint8Array,
  options: RunOptions,
): Promise<ExtractionResult> {
  const proposer = options.proposer ?? nullProposer;

  // Stage 1.
  const { pageCount, pageTexts, failures } = await extractPageTexts(data);

  const candidates: Candidate[] = [];
  const absences: RuleAbsence[] = [];
  const parseFailures: RuleParseFailure[] = [];
  const emptyPages: number[] = [];
  const unreadablePages = failures.map((f) => f.page);

  // Stage 2, page by page so one bad page cannot cost us the others (FR-018).
  for (let page = 1; page <= pageCount; page++) {
    const pageText = pageTexts.get(page) ?? '';

    if (pageText === '') {
      if (!unreadablePages.includes(page)) emptyPages.push(page);
      continue;
    }

    try {
      const parsed = parsePage(page, pageText);
      candidates.push(...parsed.candidates);
      absences.push(...parsed.absences);
      parseFailures.push(...parsed.failures);

      // Escalate only where the rules matched nothing at all on this page.
      if (!parsed.matchedAny) {
        const proposed = await proposer.propose({ page, pageText });
        candidates.push(...proposed);
      }
    } catch {
      unreadablePages.push(page);
    }
  }

  // Stage 3. Rule candidates and model proposals are indistinguishable here, by design.
  const { accepted, refused } = verify(candidates, pageTexts, (failure, candidate) =>
    reasonFor(failure.code, { page: failure.page, field: candidate.field }),
  );

  const { lineItems, refusals } = assemble({
    accepted,
    gateRefusals: refused,
    absences,
    parseFailures,
    emptyPages,
    unreadablePages,
  });

  // Stage 4.
  const ambiguities = detectAmbiguities({ lineItems, pageTexts });

  return {
    documentName: options.documentName,
    pageCount,
    lineItems,
    refusals: dedupe(refusals),
    ambiguities,
  };
}

function dedupe(refusals: Refusal[]): Refusal[] {
  const seen = new Set<string>();
  return refusals.filter((r) => {
    const key = `${r.scope}|${r.page ?? ''}|${r.lineItemId ?? ''}|${r.field ?? ''}|${r.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
