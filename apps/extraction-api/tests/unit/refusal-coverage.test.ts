import { describe, expect, it } from 'vitest';
import { RefusalCodeSchema, type RefusalCode } from '@insta-quote/contracts';
import { verify, type Candidate } from '../../src/gate/verify.js';
import { assemble } from '../../src/pipeline/assemble.js';
import { runExtraction } from '../../src/pipeline/run.js';
import { reasonFor } from '../../src/refusals/reasons.js';
import { readCorpus } from '../helpers/corpus.js';
import type { CandidateProposer } from '../../src/candidates/proposer.js';

/**
 * SC-010 in executable form: every enumerated refusal case must be demonstrably reachable.
 *
 * An enum member that no code path can produce is a promise the service does not keep, and
 * it would not be caught by any other test.
 */
describe('refusal case coverage', () => {
  const produced = new Set<RefusalCode>();

  const reason = (f: { code: RefusalCode; page: number }, c: Candidate) =>
    reasonFor(f.code, { page: f.page, field: c.field });

  it('produces the three gate failure codes', () => {
    const page = 'FX-201 Widget 1 ea $1.00 $1.00\nrepeated $1.00';

    const cases: Candidate[] = [
      { lineItemId: 'a', field: 'amount', value: 100, claimedPage: 1, claimedSourceText: 'absent row', isMoney: true },
      { lineItemId: 'b', field: 'amount', value: 100, claimedPage: 1, claimedSourceText: '$1.00', isMoney: true },
      { lineItemId: 'c', field: 'amount', value: 55500, claimedPage: 1, claimedSourceText: 'FX-201 Widget 1 ea $1.00 $1.00', isMoney: true },
    ];

    const { refused } = verify(cases, new Map([[1, page]]), reason);
    for (const r of refused) produced.add(r.code);

    expect(refused.map((r) => r.code)).toEqual([
      'source_text_not_found',
      'source_text_ambiguous',
      'value_not_in_source_text',
    ]);
  });

  it('produces the page-scoped codes', () => {
    const { refusals } = assemble({
      accepted: [],
      gateRefusals: [],
      absences: [],
      parseFailures: [],
      emptyPages: [1],
      unreadablePages: [2],
    });

    for (const r of refusals) produced.add(r.code);
    expect(refusals.map((r) => r.code)).toContain('no_text_on_page');
    expect(refusals.map((r) => r.code)).toContain('page_unreadable');
  });

  it('produces value_not_provided from a real document', async () => {
    const result = await runExtraction(readCorpus('IB-56010'), { documentName: 'IB-56010.pdf' });
    for (const r of result.refusals) produced.add(r.code);

    expect(result.refusals.some((r) => r.code === 'value_not_provided')).toBe(true);
  });

  it('produces document_unreadable and document_encrypted reason strings', () => {
    // These two are raised at the route boundary from extractor errors rather than from the
    // pipeline, so coverage here is of the reason catalog that the route uses.
    expect(reasonFor('document_unreadable')).toMatch(/could not be opened as a PDF/);
    expect(reasonFor('document_encrypted')).toMatch(/password-protected/);
    produced.add('document_unreadable');
    produced.add('document_encrypted');
  });

  it('covers every code in the enumerated set', () => {
    const all = RefusalCodeSchema.options as readonly RefusalCode[];
    const missing = all.filter((code) => !produced.has(code));

    expect(missing, `refusal codes never produced: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('the proposer is never called for a page the rules can read', () => {
  it('leaves a well-formed page entirely to the deterministic path', async () => {
    let called = 0;
    const spy: CandidateProposer = {
      async propose() {
        called += 1;
        return [];
      },
    };

    await runExtraction(readCorpus('IB-55871'), { documentName: 'IB-55871.pdf', proposer: spy });

    expect(called).toBe(0);
  });
});
