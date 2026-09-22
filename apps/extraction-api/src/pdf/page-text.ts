import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * The canonical text of each page, 1-indexed. This is the ground truth that all evidence is
 * checked against, and it is produced before any interpretation happens.
 */
export type PageTexts = ReadonlyMap<number, string>;

export interface PageExtractionFailure {
  page: number;
  error: string;
}

export interface ExtractedDocument {
  pageCount: number;
  pageTexts: PageTexts;
  /** Pages that threw while being read. They become `page_unreadable` refusals. */
  failures: PageExtractionFailure[];
}

export class DocumentUnreadableError extends Error {
  constructor(readonly reason: unknown) {
    super('document unreadable');
    this.name = 'DocumentUnreadableError';
  }
}

export class DocumentEncryptedError extends Error {
  constructor() {
    super('document encrypted');
    this.name = 'DocumentEncryptedError';
  }
}

/**
 * Build one page's canonical text from positioned text items.
 *
 * pdfjs returns each run of glyphs with a transform matrix. Joined naively they run
 * together with no row or word boundaries, which makes row-shaped evidence impossible. So
 * items are clustered into rows by their rounded y-coordinate (`transform[5]`), each row is
 * sorted left-to-right by x (`transform[4]`), cells are joined with a single space and rows
 * with a newline.
 *
 * The result is that a whole visual row -- "FX-201 Framing nail gun coil, 90mm galv 24 box
 * $52.00 $1,248.00" -- is a literal substring of the page text, so a line item's evidence
 * can be the row it came from and a human can verify it at a glance.
 *
 * This clustering is a heuristic, and it is the foundation the entire evidence guarantee
 * rests on: a document with slanted or overlapping baselines could split one visual row into
 * two. Recorded as a known limitation in the README rather than claimed as solved.
 */
export function clusterItemsIntoText(
  items: ReadonlyArray<{ str: string; transform: number[] }>,
): string {
  const rows = new Map<number, Array<{ x: number; str: string }>>();

  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5] ?? 0);
    const x = item.transform[4] ?? 0;
    const row = rows.get(y);
    if (row) row.push({ x, str: item.str });
    else rows.set(y, [{ x, str: item.str }]);
  }

  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, cells]) =>
      cells
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Deterministic text extraction -- pipeline stage 1. No model is involved.
 *
 * A page that throws yields an empty string for that page and is recorded as a failure; it
 * never aborts the document (Principle III). Only a document that cannot be opened at all
 * throws, because at that point there is nothing to isolate a fault within.
 */
export async function extractPageTexts(data: Uint8Array): Promise<ExtractedDocument> {
  let doc;
  try {
    // pdfjs transfers (and detaches) the buffer it is handed, which would make the caller's
    // copy unusable afterwards. Extraction must be repeatable -- the evidence audit re-reads
    // the same document -- so it gets its own copy.
    doc = await getDocument({
      data: data.slice(),
      useSystemFonts: true,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
  } catch (error) {
    if (isPasswordError(error)) throw new DocumentEncryptedError();
    throw new DocumentUnreadableError(error);
  }

  const pageTexts = new Map<number, string>();
  const failures: PageExtractionFailure[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    try {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.set(pageNumber, clusterItemsIntoText(content.items as never[]));
    } catch (error) {
      pageTexts.set(pageNumber, '');
      failures.push({
        page: pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { pageCount: doc.numPages, pageTexts, failures };
}

function isPasswordError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  return (
    name === 'PasswordException' ||
    (typeof message === 'string' && /password/i.test(message))
  );
}
