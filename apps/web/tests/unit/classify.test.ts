import { describe, expect, it } from 'vitest';
import { classifyResponse } from '../../src/state/classify';
import { corpus } from '../helpers/load';

/**
 * One case per row of contracts/proxy-route.md. These four situations must never collapse
 * into one another, and this is where that is decided.
 */
describe('classifying a response', () => {
  it('a valid 200 becomes a result', () => {
    const state = classifyResponse(200, corpus('IB-55871'), 'IB-55871.pdf');

    expect(state.kind).toBe('result');
    expect(state.kind === 'result' && state.result.lineItems).toHaveLength(4);
  });

  it('a result carrying refusals is still a result, not a failure', () => {
    // FR-016.4: the service refusing specific content is a successful outcome.
    const state = classifyResponse(200, corpus('IB-55902'), 'IB-55902.pdf');

    expect(state.kind).toBe('result');
    expect(state.kind === 'result' && state.result.refusals).toHaveLength(1);
  });

  it('a 200 that is not a result becomes bad_shape', () => {
    expect(classifyResponse(200, { hello: 'world' }, 'x.pdf').kind).toBe('bad_shape');
  });

  it('a 200 carrying an HTML string becomes bad_shape', () => {
    expect(classifyResponse(200, '<!doctype html><html></html>', 'x.pdf').kind).toBe('bad_shape');
  });

  it('a 400 from the service becomes service_rejected, carrying its own message', () => {
    const state = classifyResponse(
      400,
      { error: { code: 'not_a_pdf', message: 'This file could not be opened as a PDF, so nothing could be read from it.' } },
      'x.txt',
    );

    expect(state.kind).toBe('service_rejected');
    expect(state.kind === 'service_rejected' && state.message).toBe(
      'This file could not be opened as a PDF, so nothing could be read from it.',
    );
  });

  it('a 504 service_unreachable becomes unreachable', () => {
    const state = classifyResponse(
      504,
      { error: { code: 'service_unreachable', message: 'The extraction service could not be reached.' } },
      'x.pdf',
    );
    expect(state.kind).toBe('unreachable');
  });

  it('a 504 service_timeout also becomes unreachable', () => {
    const state = classifyResponse(
      504,
      { error: { code: 'service_timeout', message: 'The extraction service did not answer in time.' } },
      'x.pdf',
    );
    expect(state.kind).toBe('unreachable');
  });

  it('a 500 with an unrecognised body becomes bad_shape, not a generic failure', () => {
    expect(classifyResponse(500, 'boom', 'x.pdf').kind).toBe('bad_shape');
  });

  it('unreachable and service_rejected are never the same state', () => {
    const unreachable = classifyResponse(
      504,
      { error: { code: 'service_unreachable', message: 'a' } },
      'x.pdf',
    );
    const rejected = classifyResponse(400, { error: { code: 'not_a_pdf', message: 'b' } }, 'x.pdf');

    expect(unreachable.kind).not.toBe(rejected.kind);
  });

  it('classifies every captured corpus response as a result', () => {
    for (const name of ['IB-55871', 'IB-55902', 'IB-56010', 'IB-56088', 'IB-56150', 'IB-STMT47'] as const) {
      expect(classifyResponse(200, corpus(name), `${name}.pdf`).kind, name).toBe('result');
    }
  });
});
