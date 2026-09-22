import type { Ambiguity, ConflictingValue } from '@insta-quote/contracts';

/**
 * Conflicting stated counts of the same document-level unit.
 *
 * IB-56088.pdf says "Summary: 9 cartons dispatched from Ironbark warehouse this run." in one
 * place and "Warehouse notes: 11 cartons picked and loaded onto the truck." in another. Its
 * monetary figures reconcile perfectly, so every money-based detector passes it cleanly and
 * the contradiction would be reported nowhere at all.
 *
 * A reviewer told "3 line items, total $2,050.00, no issues" about a document that disagrees
 * with itself over whether 9 or 11 cartons shipped has been handed a confident, incomplete
 * answer -- which is the failure Principle II exists to prevent.
 *
 * The noun list is closed on purpose. This is a deterministic, testable check for a specific
 * shape of contradiction, not general-purpose contradiction detection over prose, and the
 * README says so rather than overclaiming.
 */
const COUNT_NOUNS: Record<string, string> = {
  carton: 'cartons',
  cartons: 'cartons',
  pallet: 'pallets',
  pallets: 'pallets',
  box: 'boxes',
  boxes: 'boxes',
  item: 'items',
  items: 'items',
  package: 'packages',
  packages: 'packages',
  crate: 'crates',
  crates: 'crates',
};

interface StatedCount {
  count: number;
  line: string;
  page: number;
}

/**
 * Line-item rows are excluded, and this is the most important rule in the file.
 *
 * A row like "FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00" contains the
 * phrase "24 box", and another row on the same invoice contains "10 box". Read as
 * document-level statements they look like a contradiction, and the detector would flag
 * IB-55871 -- the clean control document -- as disagreeing with itself about boxes.
 *
 * They are not statements about the document. They are quantities of different products.
 * This detector is only ever about narrative prose: "9 cartons dispatched" against
 * "11 cartons picked and loaded".
 */
const LINE_ITEM_ROW = /^[A-Z]{2,3}-\d{2,5}\s/;
const TABLE_HEADER = /^Code\s+Description/i;

export function detectConflictingCounts(pageTexts: ReadonlyMap<number, string>): Ambiguity[] {
  const byNoun = new Map<string, StatedCount[]>();

  for (const [page, pageText] of pageTexts) {
    for (const rawLine of pageText.split('\n')) {
      const line = rawLine.trim();
      if (line === '') continue;
      if (LINE_ITEM_ROW.test(line) || TABLE_HEADER.test(line)) continue;

      for (const match of line.matchAll(/\b(\d+)\s+([A-Za-z]+)\b/g)) {
        const count = Number(match[1]);
        const noun = COUNT_NOUNS[(match[2] ?? '').toLowerCase()];
        if (noun === undefined || !Number.isFinite(count)) continue;

        const bucket = byNoun.get(noun);
        if (bucket) bucket.push({ count, line, page });
        else byNoun.set(noun, [{ count, line, page }]);
      }
    }
  }

  const ambiguities: Ambiguity[] = [];

  for (const [noun, statements] of byNoun) {
    const distinct = new Map<number, StatedCount>();
    for (const statement of statements) {
      if (!distinct.has(statement.count)) distinct.set(statement.count, statement);
    }
    if (distinct.size < 2) continue;

    const values: ConflictingValue[] = [...distinct.values()].map((s) => ({
      label: `${s.count} ${noun}`,
      value: s.count,
      evidence: { page: s.page, sourceText: s.line },
    }));

    ambiguities.push({
      kind: 'material_mismatch',
      type: 'conflicting_counts',
      fact: noun,
      values,
      reason: `This document states different numbers of ${noun}: ${values
        .map((v) => `${v.value} on page ${v.evidence.page}`)
        .join(' and ')}. Neither has been chosen over the other.`,
    });
  }

  return ambiguities;
}
