/**
 * Situation 3 of FR-016: the file could not be submitted at all.
 *
 * Caught in the browser before any request, so the person is not waiting on a round trip to
 * learn they picked the wrong file (FR-002).
 */
export function FileRejected({ reason }: { reason: string }) {
  return (
    <div
      className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4"
      role="alert"
      data-testid="state-file-rejected"
    >
      <p className="font-medium text-amber-900">That file can&apos;t be read</p>
      <p className="mt-1 text-sm text-amber-950">{reason}</p>
      <p className="mt-2 text-sm text-amber-900">Choose a different file and try again.</p>
    </div>
  );
}
