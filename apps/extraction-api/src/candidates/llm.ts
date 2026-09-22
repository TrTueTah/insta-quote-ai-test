import OpenAI from 'openai';
import type { LineItemField } from '@insta-quote/contracts';
import type { Candidate } from '../gate/verify.js';
import type { CandidateProposer, ProposalInput } from './proposer.js';
import { parseMoneyToCents, parseQuantity } from './parse-values.js';

/**
 * Candidate interpretation, escalation path.
 *
 * This proposer is called only for pages where the rules parser matched nothing at all. It
 * *proposes*; it does not decide. Everything it returns goes through the same verification
 * gate as a rule-derived candidate, so a fabricated figure -- however confidently produced,
 * and however plausible the arithmetic behind it -- is refused because the number is not on
 * the page.
 *
 * The prompt asks for a source excerpt precisely because the gate will check it. The model
 * is not being trusted; it is being made to show its working so the working can be verified.
 */

const MONEY_FIELDS = new Set<LineItemField>(['unitPrice', 'amount']);

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceText', 'fields'],
        properties: {
          sourceText: {
            type: 'string',
            description:
              'The complete line from the page text that this row was read from, copied character for character.',
          },
          fields: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'description', 'quantity', 'unit', 'unitPrice', 'amount'],
            properties: {
              code: { type: ['string', 'null'] },
              description: { type: ['string', 'null'] },
              quantity: { type: ['string', 'null'] },
              unit: { type: ['string', 'null'] },
              unitPrice: { type: ['string', 'null'] },
              amount: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You read line items out of trade documents.

You will be given the exact text of one page. Identify the line items on it.

Rules you must follow:
- Copy values exactly as they are printed. Never reformat, round, or convert them.
- Never calculate a value. If a line shows a quantity and a unit price but no total, the
  total is null. Do not multiply.
- "sourceText" must be one complete line from the page text, copied character for character.
- If a field is not printed on the line, use null. Never guess and never substitute a
  plausible value.

Every value you return is checked against the page text. Anything that is not literally
there is discarded, so inventing a value gains nothing.`;

export interface OpenAIProposerOptions {
  apiKey: string;
  model?: string;
}

export function createOpenAIProposer(options: OpenAIProposerOptions): CandidateProposer {
  const client = new OpenAI({ apiKey: options.apiKey });
  const model = options.model ?? 'gpt-4o-2024-08-06';

  return {
    async propose({ page, pageText }: ProposalInput): Promise<Candidate[]> {
      try {
        const response = await client.chat.completions.create({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Page ${page} text:\n\n${pageText}` },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'line_items', strict: true, schema: RESPONSE_SCHEMA },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        return toCandidates(page, JSON.parse(content));
      } catch {
        // A proposal failure is not a document failure: the page simply yields no candidates
        // and its values become refusals like any other unevidenced value.
        return [];
      }
    },
  };
}

interface ProposedRow {
  sourceText?: unknown;
  fields?: Record<string, unknown>;
}

export function toCandidates(page: number, payload: unknown): Candidate[] {
  const rows = (payload as { rows?: ProposedRow[] })?.rows;
  if (!Array.isArray(rows)) return [];

  const candidates: Candidate[] = [];

  rows.forEach((row, index) => {
    const sourceText = typeof row?.sourceText === 'string' ? row.sourceText : '';
    if (sourceText === '') return;

    const lineItemId = `p${page}-llm${index + 1}`;
    const fields = row.fields ?? {};

    for (const field of ['code', 'description', 'quantity', 'unit', 'unitPrice', 'amount'] as const) {
      const raw = fields[field];
      if (typeof raw !== 'string' || raw.trim() === '') continue;

      const isMoney = MONEY_FIELDS.has(field);
      const value = isMoney
        ? parseMoneyToCents(raw)
        : field === 'quantity'
          ? parseQuantity(raw)
          : raw.trim();

      if (value === null) continue;

      candidates.push({
        lineItemId,
        field,
        value,
        claimedPage: page,
        claimedSourceText: sourceText,
        ...(isMoney ? { isMoney: true } : {}),
      });
    }
  });

  return candidates;
}
