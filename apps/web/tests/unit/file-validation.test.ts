import { describe, expect, it } from 'vitest';
import { validateFile } from '../../src/validation/file';

const pdf = (name: string, body = '%PDF-1.4 fake body') =>
  new File([body], name, { type: 'application/pdf' });

describe('file validation before any request is sent', () => {
  it('accepts a real PDF', async () => {
    expect(await validateFile(pdf('invoice.pdf'))).toEqual({ ok: true });
  });

  it('rejects no file with its own reason', async () => {
    const result = await validateFile(null);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/No file was selected/);
  });

  it('rejects an empty file with its own reason', async () => {
    const result = await validateFile(new File([], 'empty.pdf', { type: 'application/pdf' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/empty/);
  });

  it('rejects an oversized file, naming the size', async () => {
    const big = new File(['%PDF-'.padEnd(21 * 1024 * 1024, 'x')], 'big.pdf');
    const result = await validateFile(big);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/20 MB limit/);
  });

  it('rejects a text file', async () => {
    const result = await validateFile(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/not a PDF/);
  });

  it('rejects a text file renamed .pdf — extension checking alone would accept it', async () => {
    const disguised = new File(['this is plainly not a pdf'], 'invoice.pdf', {
      type: 'application/pdf',
    });

    const result = await validateFile(disguised);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/not a PDF/);
  });

  it('gives each failure a distinct reason', async () => {
    const reasons = await Promise.all(
      [
        null,
        new File([], 'empty.pdf'),
        new File(['nope'], 'notes.txt'),
      ].map(async (f) => {
        const r = await validateFile(f);
        return r.ok === false ? r.reason : 'OK';
      }),
    );

    expect(new Set(reasons).size).toBe(reasons.length);
  });
});
