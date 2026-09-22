import type { Candidate } from '../gate/verify.js';

/**
 * The boundary the LLM sits behind.
 *
 * Declared as an interface so every test can inject a fake and no suite ever makes a live
 * model call. It returns *proposals* only -- nothing it returns reaches the response without
 * passing the verification gate first, exactly like a candidate from the rules parser.
 */
export interface CandidateProposer {
  propose(input: ProposalInput): Promise<Candidate[]>;
}

export interface ProposalInput {
  page: number;
  pageText: string;
}

/** Used when no proposer is configured: pages that defeat the rules simply yield nothing. */
export const nullProposer: CandidateProposer = {
  async propose() {
    return [];
  },
};

/**
 * Wraps a proposer so escalation is visible in the logs.
 *
 * Worth being explicit about: no page in the sample corpus escalates, because the rules
 * parser reads every one of them. Without this logging it is impossible to tell whether the
 * model was consulted or the key was simply never used.
 */
export function withEscalationLogging(
  proposer: CandidateProposer,
  log: (message: string) => void,
): CandidateProposer {
  return {
    async propose(input) {
      log(
        `Rules matched nothing on page ${input.page}; asking the model to propose candidates. ` +
          `Anything it returns still has to pass the verification gate.`,
      );

      const started = Date.now();
      const proposed = await proposer.propose(input);

      log(
        `Model proposed ${proposed.length} candidate value(s) for page ${input.page} in ` +
          `${Date.now() - started}ms. Gate verdict follows.`,
      );

      return proposed;
    },
  };
}
