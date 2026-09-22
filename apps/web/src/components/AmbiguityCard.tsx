import type { Ambiguity, AmbiguityKind } from '@insta-quote/contracts';
import { formatCents } from '../view/format';

/**
 * A contradiction the document makes with itself.
 *
 * Two rules hold this component together, and both are easy to break by accident:
 *
 * 1. No conflicting value is presented as the answer (FR-012). They are listed in the order
 *    received, styled identically, with nothing marked correct.
 * 2. The two severities get equal prominence (FR-028). Same padding, same text size, same
 *    reading position, neither collapsed. They differ ONLY in the label and its accent
 *    colour.
 *
 * On (2): the extraction service distinguishes a rounding difference from a material mismatch
 * so a reviewer can triage, explicitly not so the lesser one can be de-emphasised. Making the
 * quieter kind visually quieter here would undo that intent one design decision later, and a
 * reviewer who learns to skip the quiet ones will eventually skip a real one.
 */

const KIND_LABEL: Record<AmbiguityKind, string> = {
  rounding_difference: 'Rounding difference',
  material_mismatch: "Figures don't match",
};

/** Accent only. Deliberately equal in weight, size and saturation — see FR-028. */
const KIND_ACCENT: Record<AmbiguityKind, string> = {
  rounding_difference: 'bg-sky-100 text-sky-900',
  material_mismatch: 'bg-rose-100 text-rose-900',
};

export function AmbiguityCard({ ambiguity }: { ambiguity: Ambiguity }) {
  return (
    <article
      className="rounded-lg border border-zinc-300 bg-white p-4"
      data-testid="ambiguity"
      data-kind={ambiguity.kind}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${KIND_ACCENT[ambiguity.kind]}`}
          data-testid="ambiguity-kind-label"
        >
          {KIND_LABEL[ambiguity.kind]}
        </span>
        <h3 className="text-base font-semibold text-zinc-900">{ambiguity.fact}</h3>
      </div>

      <ul className="mt-3 space-y-2">
        {ambiguity.values.map((value, index) => (
          <li key={index} data-testid="conflicting-value">
            <p className="text-sm text-zinc-900">
              <span className="text-zinc-600">{value.label}: </span>
              <span className="font-medium">{formatCents(value.value)}</span>
              <span className="text-zinc-500"> — page {value.evidence.page}</span>
            </p>
            <p className="mt-0.5 break-words border-l-2 border-zinc-300 pl-3 font-mono text-sm text-zinc-700">
              {value.evidence.sourceText}
            </p>
          </li>
        ))}
      </ul>

      {ambiguity.computed && (
        <p className="mt-3 text-sm text-zinc-700" data-testid="computed-value">
          <span className="font-medium">{formatCents(ambiguity.computed.value)}</span>{' '}
          <span className="text-zinc-600">
            — calculated, not printed on the document ({ambiguity.computed.derivedFrom})
          </span>
        </p>
      )}

      <p className="mt-3 text-sm text-zinc-900" data-testid="ambiguity-reason">
        {ambiguity.reason}
      </p>
    </article>
  );
}

/**
 * Contradictions in the order received. No severity-based sorting or grouping (FR-029) —
 * sorting is how "equally prominent" quietly becomes a hierarchy.
 */
export function AmbiguityList({ ambiguities }: { ambiguities: readonly Ambiguity[] }) {
  if (ambiguities.length === 0) return null;

  return (
    <section aria-labelledby="contradictions-heading" data-testid="ambiguity-section">
      <h2 id="contradictions-heading" className="text-lg font-semibold text-zinc-900">
        This document contradicts itself
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        The figures below disagree with each other. Neither has been chosen — check the
        document, and ask the supplier if it still doesn&apos;t add up.
      </p>

      <ul className="mt-3 space-y-3">
        {ambiguities.map((ambiguity, index) => (
          <li key={index}>
            <AmbiguityCard ambiguity={ambiguity} />
          </li>
        ))}
      </ul>
    </section>
  );
}
