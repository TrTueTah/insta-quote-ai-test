import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/extract/route';
import { corpus } from '../helpers/load';

/**
 * The test that protects the feature.
 *
 * A proxy is exactly where Principle IV gets violated: the natural implementation is a
 * try/catch that turns every failure into one generic 500, which collapses FR-016's four
 * situations into one. These assertions make that collapse a failing test rather than an
 * omission nobody notices.
 */

const upload = () => {
  const form = new FormData();
  form.append('file', new File(['%PDF-1.4'], 'x.pdf', { type: 'application/pdf' }));
  return new Request('http://localhost/api/extract', { method: 'POST', body: form });
};

const originalFetch = globalThis.fetch;
const originalUrl = process.env['EXTRACTION_API_URL'];

beforeEach(() => {
  process.env['EXTRACTION_API_URL'] = 'http://extraction.test';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env['EXTRACTION_API_URL'];
  else process.env['EXTRACTION_API_URL'] = originalUrl;
  vi.restoreAllMocks();
});

describe('POST /api/extract passes the extraction service through', () => {
  it('returns a 200 result byte for byte', async () => {
    const result = corpus('IB-55871');
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    const response = await POST(upload());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it('preserves a 400 with the service\'s own message, not a rewritten one', async () => {
    // This is the assertion that stops the proxy becoming the point where a specific,
    // person-ready reason turns into "something went wrong".
    const serviceMessage = 'This file could not be opened as a PDF, so nothing could be read from it.';

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'not_a_pdf', message: serviceMessage } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    const response = await POST(upload());

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe(serviceMessage);
  });

  it('preserves a 500 from the service rather than replacing it', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'internal_error', message: 'A specific upstream message.' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    const response = await POST(upload());

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe('A specific upstream message.');
  });

  it('reports an unreachable service as 504 service_unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    const response = await POST(upload());
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.error.code).toBe('service_unreachable');
  });

  it('reports a timeout as 504 service_timeout, distinct from unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }) as typeof fetch;

    const response = await POST(upload());
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.error.code).toBe('service_timeout');
  });

  it('passes a non-JSON 200 through without validating it', async () => {
    // The handler must not decide what a valid result is. That happens once, in the browser.
    globalThis.fetch = vi.fn(async () =>
      new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ) as typeof fetch;

    const response = await POST(upload());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<!doctype html>');
  });

  it('names a missing configuration instead of disguising it as a service failure', async () => {
    delete process.env['EXTRACTION_API_URL'];

    const response = await POST(upload());
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.error.message).toMatch(/not configured with an address/);
  });

  it('never emits a generic message', async () => {
    const cases: Array<() => void> = [
      () => {
        globalThis.fetch = vi.fn(async () => {
          throw new TypeError('fetch failed');
        }) as typeof fetch;
      },
      () => {
        globalThis.fetch = vi.fn(async () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          throw e;
        }) as typeof fetch;
      },
    ];

    for (const setup of cases) {
      setup();
      const text = await (await POST(upload())).text();
      expect(text).not.toMatch(/something went wrong|an error occurred|unexpected error/i);
    }
  });
});
