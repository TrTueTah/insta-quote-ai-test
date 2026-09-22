#!/usr/bin/env node
/**
 * Print the canonical page text of a PDF -- exactly the string the verification gate checks
 * evidence against.
 *
 * This exists so a reviewer can confirm the evidence guarantee without trusting the service:
 * take any `sourceText` from a response and check it appears, verbatim, in this output under
 * the page it claims.
 *
 *   node scripts/dump-page-text.mjs sample-files-variant/IB-55871.pdf
 */
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/dump-page-text.mjs <file.pdf>');
  process.exit(1);
}

const doc = await getDocument({
  data: new Uint8Array(readFileSync(file)),
  useSystemFonts: true,
  isEvalSupported: false,
  verbosity: 0,
}).promise;

for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
  const page = await doc.getPage(pageNumber);
  const { items } = await page.getTextContent();

  const rows = new Map();
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5]);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: item.transform[4], str: item.str });
  }

  const text = [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, cells]) =>
      cells.sort((a, b) => a.x - b.x).map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim(),
    )
    .filter((line) => line.length > 0)
    .join('\n');

  console.log(`\n===== PAGE ${pageNumber} of ${doc.numPages} =====`);
  console.log(text === '' ? '(no extractable text on this page)' : text);
}
