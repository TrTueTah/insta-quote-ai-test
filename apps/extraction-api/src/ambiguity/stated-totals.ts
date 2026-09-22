import type { Evidence } from '@insta-quote/contracts';
import { parseMoneyToCents } from '../candidates/parse-values.js';

/**
 * Figures the document prints about itself, read literally off the page.
 *
 * Every field is optional. A document that states no total (IB-56010, IB-STMT47) supports no
 * reconciliation, and absence of a total is not a contradiction.
 */
export interface StatedFigure {
  label: string;
  cents: number;
  evidence: Evidence;
}

export interface StatedTotals {
  subtotal?: StatedFigure;
  tax?: StatedFigure;
  total?: StatedFigure;
  /** Every figure labelled as a document total, to detect two differing ones. */
  allTotals: StatedFigure[];
}

const MONEY = /(-?\$[\d,]+\.\d{2})/;

const SUBTOTAL = /^Sub-?total\s*:?\s*/i;
const TAX = /^(GST|VAT|Tax)\b[^:]*:?\s*/i;
const TOTAL = /^Total\b[^:]*:?\s*/i;

export function readStatedTotals(pageTexts: ReadonlyMap<number, string>): StatedTotals {
  const result: StatedTotals = { allTotals: [] };

  for (const [page, pageText] of pageTexts) {
    for (const rawLine of pageText.split('\n')) {
      const line = rawLine.trim();
      if (line === '') continue;

      const money = MONEY.exec(line);
      if (!money) continue;

      const cents = parseMoneyToCents(money[1] ?? '');
      if (cents === null) continue;

      const evidence: Evidence = { page, sourceText: line };

      if (SUBTOTAL.test(line)) {
        result.subtotal ??= { label: 'stated subtotal', cents, evidence };
      } else if (TAX.test(line)) {
        result.tax ??= { label: 'stated tax', cents, evidence };
      } else if (TOTAL.test(line)) {
        const figure: StatedFigure = { label: 'stated total', cents, evidence };
        result.total ??= figure;
        result.allTotals.push(figure);
      }
    }
  }

  return result;
}
