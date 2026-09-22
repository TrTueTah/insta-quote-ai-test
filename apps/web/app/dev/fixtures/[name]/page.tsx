import { notFound } from 'next/navigation';
import { ExtractionResultSchema } from '@insta-quote/contracts';
import { ResultView } from '../../../../src/components/ResultView';
import bothAmbiguityKinds from '../../../../tests/fixtures/both-ambiguity-kinds.json';
import refusalsAndAmbiguities from '../../../../tests/fixtures/refusals-and-ambiguities.json';
import unexplainedGap from '../../../../tests/fixtures/unexplained-gap.json';

/**
 * Render a fixture without the extraction service running.
 *
 * Two of the required states cannot be produced by any sample document: no corpus PDF yields
 * a rounding difference, and none contains refusals and contradictions at once. This route is
 * how the equal-prominence rule (FR-028) can actually be looked at rather than only asserted.
 *
 * The fixtures are imported statically rather than read from disk so they are bundled with
 * the build and the route works wherever it is deployed.
 */
const FIXTURES: Record<string, unknown> = {
  'both-ambiguity-kinds': bothAmbiguityKinds,
  'refusals-and-ambiguities': refusalsAndAmbiguities,
  'unexplained-gap': unexplainedGap,
};

export function generateStaticParams() {
  return Object.keys(FIXTURES).map((name) => ({ name }));
}

export default async function FixturePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const raw = FIXTURES[name];
  if (raw === undefined) notFound();

  // Parsed through the shared schema like any other result, so a fixture cannot drift into a
  // shape the real service would never produce.
  const result = ExtractionResultSchema.parse(raw);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <p className="rounded border border-dashed border-zinc-400 bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
        Fixture: <code>{name}</code> — constructed data, not a real document. Exists because no
        sample PDF reaches this state.
      </p>
      <ResultView result={result} fileName={`${name}.pdf`} />
    </main>
  );
}
