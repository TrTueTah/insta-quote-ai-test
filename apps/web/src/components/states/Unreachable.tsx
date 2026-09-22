/**
 * Situation 1 of FR-016: the extraction service could not be reached, or did not answer.
 *
 * Deliberately its own component. Merging these four into one with a message prop is how they
 * end up sharing a sentence, which FR-016 forbids and SC-005 tests.
 *
 * This one means "wait and retry" — the document is fine, the service is not answering.
 */
export function Unreachable({ detail }: { detail: string }) {
  return (
    <div
      className="rounded-lg border border-orange-300 bg-orange-50 p-5"
      role="alert"
      data-testid="state-unreachable"
    >
      <p className="font-medium text-orange-900">
        Couldn&apos;t reach the service that reads documents
      </p>
      <p className="mt-1 text-sm text-orange-950">{detail}</p>
      <p className="mt-2 text-sm text-orange-900">
        Nothing is wrong with your document — it was never processed. Try again in a moment.
      </p>
    </div>
  );
}
