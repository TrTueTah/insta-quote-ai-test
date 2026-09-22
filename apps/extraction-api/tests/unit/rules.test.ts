import { describe, expect, it } from 'vitest';
import { parsePage } from '../../src/candidates/rules.js';
import { parseMoneyToCents, parseQuantity } from '../../src/candidates/parse-values.js';

describe('rules parser', () => {
  const fieldsOf = (line: string) => {
    const parsed = parsePage(1, line);
    return Object.fromEntries(parsed.candidates.map((c) => [c.field, c.value]));
  };

  it('parses a six-column row', () => {
    expect(fieldsOf('FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00')).toEqual({
      code: 'FX-201',
      description: 'Framing nail gun coil, 90mm galv',
      quantity: 24,
      unit: 'box',
      unitPrice: 5200,
      amount: 124800,
    });
  });

  it('parses a description containing its own numbers', () => {
    expect(fieldsOf('PL-201 Copper pipe 15mm, 3m length 40 length $14.60 $584.00')).toEqual({
      code: 'PL-201',
      description: 'Copper pipe 15mm, 3m length',
      quantity: 40,
      unit: 'length',
      unitPrice: 1460,
      amount: 58400,
    });
  });

  it('parses a five-column row and records the missing amount as an absence', () => {
    const parsed = parsePage(1, 'FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea');

    expect(Object.fromEntries(parsed.candidates.map((c) => [c.field, c.value]))).toEqual({
      code: 'FX-402',
      description: 'Washers, assorted, loose',
      quantity: 2000,
      unit: 'ea',
      unitPrice: 2,
    });
    expect(parsed.absences).toEqual([
      { lineItemId: 'p1-r1', page: 1, field: 'amount', itemLabel: 'FX-402' },
    ]);
  });

  it('quotes the whole row as source text for every field', () => {
    const line = 'FX-118 Timber connector bolts M12x150 60 ea $3.40 $204.00';
    const parsed = parsePage(1, line);

    expect(parsed.candidates).not.toHaveLength(0);
    for (const candidate of parsed.candidates) {
      expect(candidate.claimedSourceText).toBe(line);
    }
  });

  it('skips headers, separators and totals', () => {
    const page = [
      'Ironbark Trade Merchants Ltd',
      'Code Description Qty Unit Unit Price Amount',
      '-'.repeat(60),
      'Subtotal: $3,259.00',
      'GST (15%): $488.85',
      'Total (incl GST): $3,747.85',
      'Payment due 20 days from invoice date.',
    ].join('\n');

    const parsed = parsePage(1, page);
    expect(parsed.candidates).toEqual([]);
    expect(parsed.failures).toEqual([]);
    expect(parsed.matchedAny).toBe(false);
  });

  it('does not mistake a document number for a product code', () => {
    expect(parsePage(1, 'Document No: IB-55871').candidates).toEqual([]);
  });

  it('reports a row it cannot parse instead of silently dropping it', () => {
    const parsed = parsePage(1, 'FX-999 Corrupted row with no usable columns');

    expect(parsed.candidates).toEqual([]);
    expect(parsed.failures).toHaveLength(1);
  });
});

describe('value parsing', () => {
  it('converts printed money to integer cents', () => {
    expect(parseMoneyToCents('$1,248.00')).toBe(124800);
    expect(parseMoneyToCents('$0.02')).toBe(2);
    expect(parseMoneyToCents('$3,747.85')).toBe(374785);
    expect(parseMoneyToCents('not money')).toBeNull();
  });

  it('parses quantities and rejects non-quantities', () => {
    expect(parseQuantity('2000')).toBe(2000);
    expect(parseQuantity('24')).toBe(24);
    expect(parseQuantity('20kg')).toBeNull();
  });
});
