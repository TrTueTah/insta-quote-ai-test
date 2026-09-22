/**
 * Situation 2 of FR-016: the service answered, but with something unusable.
 *
 * Distinct from Unreachable on purpose, and the distinction is not academic: there the
 * service is down and retrying helps, here the service is up and answering wrongly, so
 * retrying will produce the same thing. Those call for different actions, so they get
 * different words.
 *
 * The page refuses to render a partial result rather than guessing at what the reply meant.
 */
export function BadShape({ detail }: { detail: string }) {
  return (
    <div
      className="rounded-lg border border-violet-300 bg-violet-50 p-5"
      role="alert"
      data-testid="state-bad-shape"
    >
      <p className="font-medium text-violet-900">
        The service replied with something this page can&apos;t read
      </p>
      <p className="mt-1 text-sm text-violet-950">
        The document may have been processed, but the reply didn&apos;t match what this page
        expects, so nothing is being shown rather than showing part of it.
      </p>
      <p className="mt-2 font-mono text-xs text-violet-800" data-testid="bad-shape-detail">
        {detail}
      </p>
      <p className="mt-2 text-sm text-violet-900">
        Retrying is unlikely to help. This needs someone to look at the service.
      </p>
    </div>
  );
}
