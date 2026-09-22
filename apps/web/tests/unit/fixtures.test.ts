import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema } from '@insta-quote/contracts';
import { allCorpusNames, corpus, fixture, rawFixturePaths, readRaw } from '../helpers/load';

/**
 * Every fixture is parsed through the schema the extraction service itself uses.
 *
 * This is what stops the fixtures drifting: if Part A's contract changes, these fail
 * immediately rather than letting the page be developed against a shape that no longer
 * exists.
 */
describe('fixtures conform to the shared contract', () => {
  it.each(rawFixturePaths())('%s parses against ExtractionResultSchema', (path) => {
    expect(() => ExtractionResultSchema.parse(readRaw(path))).not.toThrow();
  });

  it('captured all six sample documents', () => {
    expect(allCorpusNames()).toEqual([
      'IB-55871',
      'IB-55902',
      'IB-56010',
      'IB-56088',
      'IB-56150',
      'IB-STMT47',
    ]);
  });

  it('the corpus really does lack the two states the fixtures exist for', () => {
    // If this ever fails, a sample document started producing one of these states and the
    // corresponding fixture is no longer the only coverage. That is good news, but the
    // research note and the tests should be updated rather than silently diverging.
    const all = allCorpusNames().map(corpus);

    const anyRounding = all.some((r) =>
      r.ambiguities.some((a) => a.kind === 'rounding_difference'),
    );
    const anyBoth = all.some((r) => r.refusals.length > 0 && r.ambiguities.length > 0);

    expect(anyRounding, 'no sample document produces a rounding_difference').toBe(false);
    expect(anyBoth, 'no sample document has refusals and ambiguities together').toBe(false);
  });

  it('both-ambiguity-kinds carries one of each kind', () => {
    const kinds = fixture('both-ambiguity-kinds').ambiguities.map((a) => a.kind);
    expect(kinds).toContain('rounding_difference');
    expect(kinds).toContain('material_mismatch');
  });

  it('refusals-and-ambiguities carries both in one result', () => {
    const r = fixture('refusals-and-ambiguities');
    expect(r.refusals.length).toBeGreaterThan(0);
    expect(r.ambiguities.length).toBeGreaterThan(0);
  });

  it('unexplained-gap has a field absent with no refusal naming it', () => {
    const r = fixture('unexplained-gap');
    const item = r.lineItems[0]!;
    const explained = r.refusals.some((x) => x.lineItemId === item.id && x.field === 'unitPrice');

    expect(item.unitPrice).toBeUndefined();
    expect(explained, 'the gap must be genuinely unexplained for this fixture to be useful').toBe(false);
  });
});
