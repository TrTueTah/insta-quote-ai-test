import { ExtractionResultSchema } from '@insta-quote/contracts';
import type { PageState } from './page-state';

/**
 * Map one HTTP response to exactly one page state.
 *
 * Pure, and the single place this decision is made. Every row of the table in
 * contracts/proxy-route.md is a case here, and there is deliberately no catch-all: an
 * unrecognised combination is a bug to fix, not a case to absorb into a generic message.
 */

/** Codes the route handler authors itself when it could not reach the service at all. */
const TRANSPORT_CODES = new Set(['service_unreachable', 'service_timeout']);

export function classifyResponse(
  status: number,
  body: unknown,
  fileName: string,
): PageState {
  // The route handler could not reach the extraction service, or it timed out.
  if (status === 504 && isApiError(body) && TRANSPORT_CODES.has(body.error.code)) {
    return { kind: 'unreachable', detail: body.error.message };
  }

  if (status === 200) {
    const parsed = ExtractionResultSchema.safeParse(body);

    if (parsed.success) {
      return { kind: 'result', result: parsed.data, fileName };
    }

    // A 200 that is not a result we can read. This includes a body that is not JSON at all,
    // and a structurally valid response that promises nothing -- the extraction service
    // guarantees it never returns a result with no line items and no refusals, so one
    // arriving means something upstream is wrong.
    return {
      kind: 'bad_shape',
      detail: firstIssue(parsed.error.issues),
    };
  }

  // The extraction service declined the upload. Its message is display-ready and belongs to
  // the person; it is passed through untouched.
  if (isApiError(body)) {
    return { kind: 'service_rejected', message: body.error.message };
  }

  // A non-200 whose body is not the documented error shape is also a reply we cannot read.
  return {
    kind: 'bad_shape',
    detail: `The extraction service replied with status ${status} in a form this page does not recognise.`,
  };
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

function isApiError(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null) return false;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  return (
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

function firstIssue(issues: ReadonlyArray<{ path: (string | number)[]; message: string }>): string {
  const issue = issues[0];
  if (!issue) return 'The reply did not match the expected result.';
  const where = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
  return `${issue.message}${where}`;
}
