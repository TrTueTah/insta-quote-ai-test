import { validateFile } from '../validation/file';
import { classifyResponse } from './classify';
import type { PageState } from './page-state';

/**
 * Validate, send, classify. Never throws — every outcome is a PageState.
 *
 * A throw here would land in whatever error boundary happened to be nearest, which is how a
 * specific situation turns into a generic one.
 */
export async function submit(file: File | null): Promise<PageState> {
  const validation = await validateFile(file);
  if (!validation.ok) {
    return { kind: 'file_rejected', reason: validation.reason };
  }

  const chosen = file as File;
  const form = new FormData();
  form.append('file', chosen);

  let response: Response;
  try {
    response = await fetch('/api/extract', { method: 'POST', body: form });
  } catch {
    // The browser could not reach this app's own route handler.
    return {
      kind: 'unreachable',
      detail: 'This page could not send the document for processing. Check your connection and try again.',
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      kind: 'bad_shape',
      detail: 'The reply was not in a form this page can read.',
    };
  }

  return classifyResponse(response.status, body, chosen.name);
}
