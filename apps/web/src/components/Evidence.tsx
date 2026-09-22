import type { Evidence } from '@insta-quote/contracts';

/**
 * Where a value came from, shown without requiring any interaction (FR-006).
 *
 * The source text is rendered in full and exactly as received (FR-007). No truncation, no
 * ellipsis, no `title` attribute standing in for the visible text -- a person checking a
 * number against their own paperwork needs to read the whole line, and a tooltip is a click.
 */
export function EvidenceQuote({ evidence, label }: { evidence: Evidence; label?: string }) {
  return (
    <div className="mt-2 border-l-2 border-zinc-300 pl-3" data-testid="evidence">
      <p className="text-xs uppercase tracking-wide text-zinc-500">
        {label ? `${label} — ` : ''}from page {evidence.page}
      </p>
      <p className="mt-0.5 break-words font-mono text-sm text-zinc-700" data-testid="source-text">
        {evidence.sourceText}
      </p>
    </div>
  );
}
