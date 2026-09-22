import type { LineItemField } from '@insta-quote/contracts';
import type { Candidate } from '../gate/verify.js';
import { parseMoneyToCents, parseQuantity } from './parse-values.js';

/**
 * Candidate interpretation -- pipeline stage 2. Rules first.
 *
 * Every candidate quotes the WHOLE clustered row as its source text. That matters: a bare
 * fragment like "$60.00" substring-matches trivially on a page that repeats it, which is
 * why the gate also requires uniqueness. A whole row is unique on the page in every document
 * in the sample corpus, and it is what a human can actually verify at a glance.
 */

export interface RuleAbsence {
  lineItemId: string;
  page: number;
  field: LineItemField;
  itemLabel?: string;
}

export interface RuleParseFailure {
  lineItemId: string;
  page: number;
  line: string;
}

export interface RuleResult {
  candidates: Candidate[];
  /** Fields the document genuinely does not state -- refused as `value_not_provided`. */
  absences: RuleAbsence[];
  /** Rows that looked like line items but could not be parsed. Isolated per row. */
  failures: RuleParseFailure[];
  /** Whether any row on this page matched at all -- drives LLM escalation. */
  matchedAny: boolean;
}

const PRODUCT_CODE = String.raw`[A-Z]{2,3}-\d{2,5}`;
const MONEY = String.raw`\$[\d,]+\.\d{2}`;

/**
 * The six-column shape shared by IB-55871, IB-56150, IB-56088 and every readable page of
 * IB-STMT47: CODE DESCRIPTION QTY UNIT $UNIT_PRICE $AMOUNT.
 */
const SIX_COLUMN = new RegExp(
  String.raw`^(${PRODUCT_CODE})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]{1,12})\s+(${MONEY})\s+(${MONEY})$`,
);

/**
 * The five-column shape of IB-56010: CODE DESCRIPTION QTY WEIGHT $UNIT_PRICE /PER.
 *
 * This document has no Amount column, a Weight column where the others put Unit, and price
 * suffixes like "/carton". The unit of measure is taken from the price suffix, which is what
 * the price is actually per -- NOT from the weight column, which is a different dimension
 * entirely and would be a fabrication if reported as a unit.
 */
const FIVE_COLUMN_NO_AMOUNT = new RegExp(
  String.raw`^(${PRODUCT_CODE})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(.+?)\s+(${MONEY})\s*/\s*(\w+)$`,
);

const SKIP_PATTERNS = [
  /^Code\s+Description/i,
  /^-{5,}$/,
  /^(Sub)?total\b/i,
  /^GST\b/i,
  /^Page \d+ of \d+$/i,
  /^Document No:/i,
  /^Date:/i,
  /^Bill to:/i,
  /^Job ref:/i,
  /^Payment due/i,
  /^Note:/i,
  /^Summary:/i,
  /^Warehouse notes:/i,
];

function isSkippable(line: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(line.trim()));
}

/** Does this line look like it is trying to be a line item? Used for fault isolation. */
function looksLikeLineItem(line: string): boolean {
  return new RegExp(String.raw`^${PRODUCT_CODE}\s`).test(line.trim());
}

export function parsePage(page: number, pageText: string): RuleResult {
  const candidates: Candidate[] = [];
  const absences: RuleAbsence[] = [];
  const failures: RuleParseFailure[] = [];
  let matchedAny = false;
  let rowIndex = 0;

  for (const rawLine of pageText.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || isSkippable(line)) continue;
    if (!looksLikeLineItem(line)) continue;

    rowIndex += 1;
    const lineItemId = `p${page}-r${rowIndex}`;

    // Per-row isolation: one unparseable row must not cost us its neighbours (FR-017).
    try {
      const parsed = parseRow(lineItemId, page, line);
      if (parsed === null) {
        failures.push({ lineItemId, page, line });
        continue;
      }
      matchedAny = true;
      candidates.push(...parsed.candidates);
      absences.push(...parsed.absences);
    } catch {
      failures.push({ lineItemId, page, line });
    }
  }

  return { candidates, absences, failures, matchedAny };
}

interface ParsedRow {
  candidates: Candidate[];
  absences: RuleAbsence[];
}

function parseRow(lineItemId: string, page: number, line: string): ParsedRow | null {
  const six = SIX_COLUMN.exec(line);
  if (six) {
    const [, code, description, qty, unit, unitPrice, amount] = six;
    const candidates = [
      text(lineItemId, page, line, 'code', code),
      text(lineItemId, page, line, 'description', description),
      quantity(lineItemId, page, line, qty),
      text(lineItemId, page, line, 'unit', unit),
      money(lineItemId, page, line, 'unitPrice', unitPrice),
      money(lineItemId, page, line, 'amount', amount),
    ].filter((c): c is Candidate => c !== null);

    return { candidates, absences: [] };
  }

  const five = FIVE_COLUMN_NO_AMOUNT.exec(line);
  if (five) {
    const [, code, description, qty, , unitPrice, per] = five;
    const candidates = [
      text(lineItemId, page, line, 'code', code),
      text(lineItemId, page, line, 'description', description),
      quantity(lineItemId, page, line, qty),
      text(lineItemId, page, line, 'unit', per),
      money(lineItemId, page, line, 'unitPrice', unitPrice),
    ].filter((c): c is Candidate => c !== null);

    // The document states no line amount. That is absence, not damage, and it must never be
    // computed from quantity x unit price -- the product is not on the page.
    return {
      candidates,
      absences: [{ lineItemId, page, field: 'amount', ...(code ? { itemLabel: code } : {}) }],
    };
  }

  return null;
}

function text(
  lineItemId: string,
  page: number,
  line: string,
  field: LineItemField,
  value: string | undefined,
): Candidate | null {
  if (value === undefined || value.trim() === '') return null;
  return {
    lineItemId,
    field,
    value: value.trim(),
    claimedPage: page,
    claimedSourceText: line,
  };
}

function quantity(
  lineItemId: string,
  page: number,
  line: string,
  raw: string | undefined,
): Candidate | null {
  if (raw === undefined) return null;
  const value = parseQuantity(raw);
  if (value === null) return null;
  return { lineItemId, field: 'quantity', value, claimedPage: page, claimedSourceText: line };
}

function money(
  lineItemId: string,
  page: number,
  line: string,
  field: LineItemField,
  raw: string | undefined,
): Candidate | null {
  if (raw === undefined) return null;
  const value = parseMoneyToCents(raw);
  if (value === null) return null;
  return { lineItemId, field, value, claimedPage: page, claimedSourceText: line, isMoney: true };
}
