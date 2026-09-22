'use client';

import { useRef, useState } from 'react';

/**
 * A native file input. No form library — one field does not need form-state management.
 */
export function UploadForm({
  onSubmit,
  disabled,
  children,
}: {
  onSubmit: (file: File | null) => void;
  disabled: boolean;
  children?: React.ReactNode;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      className="rounded-lg border border-zinc-200 bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(inputRef.current?.files?.[0] ?? null);
      }}
    >
      <label htmlFor="document" className="block font-medium text-zinc-900">
        Choose an invoice, packing list or delivery docket
      </label>
      <p className="mt-1 text-sm text-zinc-600">PDF, up to 20 MB, one document at a time.</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          id="document"
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={disabled}
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Read this document
        </button>
      </div>

      {fileName && <p className="mt-2 text-sm text-zinc-600">Selected: {fileName}</p>}

      {children}
    </form>
  );
}
