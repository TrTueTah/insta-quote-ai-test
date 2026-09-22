/**
 * The extraction service declined the upload itself — a non-PDF that got past the browser's
 * check, an oversized file, a password-protected document.
 *
 * Its message is display-ready and written for the person reading it, so it is shown exactly
 * as received. Re-wording it here would be the violation this whole project is built to
 * avoid, one layer from the finish line.
 */
export function ServiceRejected({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 p-5"
      role="alert"
      data-testid="state-service-rejected"
    >
      <p className="font-medium text-amber-900">This document wasn&apos;t processed</p>
      <p className="mt-1 text-sm text-amber-950" data-testid="service-message">
        {message}
      </p>
      <p className="mt-2 text-sm text-amber-900">Choose a different file and try again.</p>
    </div>
  );
}
