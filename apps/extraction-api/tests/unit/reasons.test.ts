import { describe, expect, it } from 'vitest';
import { RefusalCodeSchema, type RefusalCode } from '@insta-quote/contracts';
import { reasonFor } from '../../src/refusals/reasons.js';

const ALL_CODES = RefusalCodeSchema.options as readonly RefusalCode[];

/**
 * FR-010: refusal reasons must never be generic. These are the strings a merchant reads, so
 * the test asserts on how they read, not merely that they exist.
 */
describe('refusal reason strings', () => {
  it.each(ALL_CODES)('%s produces a non-empty, specific reason', (code) => {
    const reason = reasonFor(code, { page: 3, field: 'amount', itemLabel: 'FX-201' });

    expect(reason.length).toBeGreaterThan(20);
    expect(reason).not.toMatch(/something went wrong|couldn't process|could not process/i);
    expect(reason).not.toMatch(/\berror\b|\bfailed\b|\bexception\b|\bnull\b|\bundefined\b/i);
  });

  it('names the page for page-scoped cases', () => {
    expect(reasonFor('no_text_on_page', { page: 4 }).toLowerCase()).toContain('page 4');
    expect(reasonFor('page_unreadable', { page: 4 }).toLowerCase()).toContain('page 4');
  });

  it('names the field for value-scoped cases', () => {
    expect(reasonFor('value_not_provided', { page: 1, field: 'amount' })).toContain('amount');
    expect(reasonFor('source_text_not_found', { page: 1, field: 'unitPrice' })).toContain('unit price');
  });

  it('distinguishes "not provided" from "not found" in the words a reader sees', () => {
    const notProvided = reasonFor('value_not_provided', { page: 1, field: 'amount' });
    const notFound = reasonFor('source_text_not_found', { page: 1, field: 'amount' });

    // A docket with no prices is not a damaged document, and must not read like one.
    expect(notProvided).toMatch(/absent from the page rather than unreadable/);
    expect(notProvided).not.toEqual(notFound);
  });
});
