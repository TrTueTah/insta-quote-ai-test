import type { ExtractionResult } from '@insta-quote/contracts';

/**
 * The page is in exactly one of these states.
 *
 * Four of them are the situations FR-016 requires never to share a message. They are separate
 * variants, each with its own component, because a single error state carrying a message prop
 * is how four situations quietly become one: the next person adds a default case and the
 * distinction is gone.
 *
 * Note what is NOT here: a refusal or a contradiction. Those arrive inside `result` and are
 * rendered as content, never as a failure (FR-016.4).
 */
export type PageState =
  | { kind: 'idle' }
  /** The file could not be submitted at all — checked in the browser (FR-002). */
  | { kind: 'file_rejected'; reason: string }
  | { kind: 'processing'; fileName: string }
  /** A successful result, whatever it contains. */
  | { kind: 'result'; result: ExtractionResult; fileName: string }
  /** The extraction service could not be reached, or did not answer in time. */
  | { kind: 'unreachable'; detail: string }
  /** The service answered with something that is not a result we can read. */
  | { kind: 'bad_shape'; detail: string }
  /** The service declined the upload itself, with its own display-ready message. */
  | { kind: 'service_rejected'; message: string };

export type PageStateKind = PageState['kind'];

/** Terminal states offer another attempt without a reload (FR-020). */
export function canRetry(state: PageState): boolean {
  return state.kind !== 'processing';
}
