/**
 * Checks run in the browser BEFORE any request is sent (FR-002).
 *
 * The point is to avoid a failed round trip: a person who picked the wrong file learns why
 * immediately rather than after waiting for the extraction service to tell them.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // matches the extraction service's limit

export type FileValidation = { ok: true } | { ok: false; reason: string };

/**
 * Magic bytes, not the file extension.
 *
 * A text file renamed to `.pdf` passes an extension check and then fails at the extraction
 * service — which is exactly the round trip FR-002 exists to prevent. Reading the first five
 * bytes costs nothing and matches the check the service itself performs, so the two cannot
 * disagree about what a PDF is.
 */
async function startsWithPdfHeader(file: File): Promise<boolean> {
  const header = await readFirstBytes(file, 5);
  return new TextDecoder('latin1').decode(header) === '%PDF-';
}

/**
 * Read the first `count` bytes.
 *
 * Browsers give `Blob.slice()` an `arrayBuffer()`; jsdom's slice does not, and FileReader is
 * the portable path. The fallbacks are ordered cheapest first so a real browser never reads
 * more than the header.
 */
async function readFirstBytes(file: File, count: number): Promise<ArrayBuffer> {
  const head = file.slice(0, count);

  if (typeof head.arrayBuffer === 'function') {
    return head.arrayBuffer();
  }

  if (typeof FileReader !== 'undefined') {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(head);
    });
  }

  return (await file.arrayBuffer()).slice(0, count);
}

export async function validateFile(file: File | null): Promise<FileValidation> {
  if (file === null) {
    return { ok: false, reason: 'No file was selected. Choose a PDF to review.' };
  }

  if (file.size === 0) {
    return {
      ok: false,
      reason: `"${file.name}" is empty, so there is nothing in it to read.`,
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `"${file.name}" is ${mb} MB, which is larger than the 20 MB limit. Try a smaller file.`,
    };
  }

  if (!(await startsWithPdfHeader(file))) {
    return {
      ok: false,
      reason: `"${file.name}" is not a PDF. This page reads PDF invoices, packing lists and delivery dockets.`,
    };
  }

  return { ok: true };
}
