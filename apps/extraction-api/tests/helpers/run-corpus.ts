import type { ExtractionResult } from '@insta-quote/contracts';
import { runExtraction } from '../../src/pipeline/run.js';
import { readCorpus, type CorpusDoc } from './corpus.js';
import type { CandidateProposer } from '../../src/candidates/proposer.js';

/**
 * Run the real pipeline over a real sample document.
 *
 * No proposer is passed unless a test supplies a fake, so no suite ever makes a live model
 * call -- the constitution requires it and the absence of an API key must never change a
 * test outcome.
 */
export async function extractCorpus(
  name: CorpusDoc,
  proposer?: CandidateProposer,
): Promise<{ result: ExtractionResult; data: Uint8Array }> {
  const data = readCorpus(name);
  const result = await runExtraction(data, {
    documentName: `${name}.pdf`,
    ...(proposer ? { proposer } : {}),
  });
  return { result, data };
}
