import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { readCorpus } from '../helpers/corpus.js';

/**
 * An error status is returned only when no result could be produced at all. Anything that
 * can be said as a refusal is a 200 with refusals.
 *
 * Every message asserted here is display-ready: a reviewer reads it as written.
 */
describe('upload handling', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const multipart = (parts: Array<{ name: string; filename?: string; body: Buffer | string }>) => {
    const boundary = '----testboundary0123456789';
    const chunks: Buffer[] = [];

    for (const part of parts) {
      const disposition = part.filename
        ? `form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: application/pdf`
        : `form-data; name="${part.name}"`;
      chunks.push(
        Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}\r\n\r\n`),
        Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body),
        Buffer.from('\r\n'),
      );
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    return {
      payload: Buffer.concat(chunks),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    };
  };

  it('accepts a valid PDF and returns a schema-shaped result', async () => {
    const { payload, headers } = multipart([
      { name: 'file', filename: 'IB-55871.pdf', body: Buffer.from(readCorpus('IB-55871')) },
    ]);

    const response = await app.inject({ method: 'POST', url: '/extract', payload, headers });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.lineItems).toHaveLength(4);
    expect(body.documentName).toBe('IB-55871.pdf');
  });

  it('rejects a request with no file', async () => {
    const { payload, headers } = multipart([{ name: 'note', body: 'no file here' }]);

    const response = await app.inject({ method: 'POST', url: '/extract', payload, headers });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('no_file');
    expect(response.json().error.message).toMatch(/Attach one file/);
  });

  it('rejects more than one file', async () => {
    const pdf = Buffer.from(readCorpus('IB-55871'));
    const { payload, headers } = multipart([
      { name: 'file', filename: 'a.pdf', body: pdf },
      { name: 'file', filename: 'b.pdf', body: pdf },
    ]);

    const response = await app.inject({ method: 'POST', url: '/extract', payload, headers });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('too_many_files');
  });

  it('rejects an empty file', async () => {
    const { payload, headers } = multipart([{ name: 'file', filename: 'empty.pdf', body: '' }]);

    const response = await app.inject({ method: 'POST', url: '/extract', payload, headers });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('empty_file');
  });

  it('rejects a file that is not a PDF, by name rather than as a validation error', async () => {
    const { payload, headers } = multipart([
      { name: 'file', filename: 'notes.txt', body: 'this is plainly not a pdf' },
    ]);

    const response = await app.inject({ method: 'POST', url: '/extract', payload, headers });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('not_a_pdf');
    expect(response.json().error.message).toMatch(/could not be opened as a PDF/);
    expect(response.json().error.message).not.toMatch(/validation|invalid input/i);
  });

  it('returns 200 with a named refusal for an image-only document', async () => {
    const { payload, headers } = multipart([
      { name: 'file', filename: 'IB-55902.pdf', body: Buffer.from(readCorpus('IB-55902')) },
    ]);

    const response = await app.inject({ method: 'POST', url: '/extract', payload, headers });

    expect(response.statusCode).toBe(200);
    expect(response.json().refusals[0].code).toBe('no_text_on_page');
  });

  it('answers the health check', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });
});
