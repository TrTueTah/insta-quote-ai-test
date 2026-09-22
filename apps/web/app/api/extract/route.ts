import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 90;

const TIMEOUT_MS = 60_000;

/**
 * POST /api/extract — a transport hop, and nothing else.
 *
 * This handler exists only so the browser is not making a cross-origin request and so the
 * extraction service's address stays server-side. It adds no interpretation.
 *
 * The rule that matters: the extraction service's status and body are passed through
 * UNCHANGED. Its refusal reasons and error messages are written for the person reading them,
 * and re-wording or re-coding them here would break the one guarantee this whole project is
 * built on.
 *
 * There is deliberately NO catch-all mapping unrecognised conditions to a generic 500. The
 * two responses below are the only ones this file authors. If something reaches here that
 * neither covers, that is a bug to fix rather than a case to absorb — absorbing it is how
 * four distinct situations become one "something went wrong".
 */
export async function POST(request: Request): Promise<Response> {
  const target = process.env['EXTRACTION_API_URL'];

  if (!target) {
    // Misconfiguration, named as such rather than disguised as a service failure.
    return NextResponse.json(
      {
        error: {
          code: 'service_unreachable',
          message:
            'This page is not configured with an address for the extraction service, so the document could not be sent for processing.',
        },
      },
      { status: 504 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(`${target.replace(/\/$/, '')}/extract`, {
      method: 'POST',
      body: request.body,
      headers: forwardedHeaders(request),
      // Required by Node's fetch when streaming a request body.
      duplex: 'half',
      signal: controller.signal,
    } as RequestInit & { duplex: 'half' });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';

    return NextResponse.json(
      {
        error: timedOut
          ? {
              code: 'service_timeout',
              message:
                'The extraction service did not finish reading this document within 60 seconds, so processing was stopped.',
            }
          : {
              code: 'service_unreachable',
              message:
                'The extraction service could not be reached, so this document was not processed. It may be starting up or temporarily offline.',
            },
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }

  // Pass-through: the upstream status and body reach the browser exactly as they left the
  // extraction service. Note what is absent -- no schema validation. That decision is made
  // once, in the browser, so two places cannot disagree about what a valid result is.
  const body = await upstream.arrayBuffer();

  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    },
  });
}

function forwardedHeaders(request: Request): HeadersInit {
  const contentType = request.headers.get('content-type');
  return contentType ? { 'content-type': contentType } : {};
}
