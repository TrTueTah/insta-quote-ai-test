/**
 * What is happening, named (FR-003).
 *
 * An unlabelled spinner tells a person nothing about whether to wait or give up. Extraction
 * can take tens of seconds when the document's layout is unfamiliar, so this says what is
 * being worked on and roughly how long it may take.
 */
export function Processing({ fileName }: { fileName: string }) {
  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white p-6"
      role="status"
      aria-live="polite"
      data-testid="processing"
    >
      <p className="font-medium text-zinc-900">Reading {fileName}…</p>
      <p className="mt-1 text-sm text-zinc-600">
        Every page is being read, and each number checked against the text it came from. This
        usually takes a few seconds, and up to a minute for a long or unusual document.
      </p>
    </div>
  );
}
