#!/usr/bin/env node
/**
 * Generate a PDF whose layout the rules parser cannot read, so the LLM escalation path
 * actually fires.
 *
 * Every document in sample-files-variant/ is from the same supplier and matches one of the
 * two shapes the rules handle, so none of them escalate. Setting OPENAI_API_KEY and
 * uploading a sample proves nothing: the model is never consulted.
 *
 * This writes a deliberately different invoice -- no product-code column, quantities written
 * as words with units attached, prices in a trailing "@" clause -- to exercise the path for
 * real.
 *
 *   node scripts/make-unfamiliar-invoice.mjs /tmp/unfamiliar.pdf
 */
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/unfamiliar-invoice.pdf';

const LINES = [
  'Harding & Sons Joinery',
  'INVOICE  #HS-4412        14 September 2026',
  'To: Riverbend Construction Ltd',
  '',
  'Item                                    Supplied      Rate',
  '',
  'Dressed pine skirting 90x18          12 lengths    @ 22.40 each',
  'MDF door blank, hollow core            4 units      @ 68.00 each',
  'Architrave set, colonial profile       7 sets       @ 31.25 each',
  '',
  'Net              574.55',
  'GST at 15%        86.18',
  'Amount due       660.73',
];

const content =
  `BT /F1 11 Tf 14 TL 56 730 Td\n` +
  LINES.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`).join('\n') +
  `\nET`;

const objects = [
  '<</Type/Catalog/Pages 2 0 R>>',
  '<</Type/Pages/Kids[3 0 R]/Count 1>>',
  '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>',
  `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
  '<</Type/Font/Subtype/Type1/BaseFont/Courier>>',
];

let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefAt = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`;

writeFileSync(out, pdf, 'latin1');
console.log(`Wrote ${out}`);
console.log('This layout has no product codes and no $ signs, so the rules parser matches');
console.log('nothing and the page escalates to the LLM proposer.');
