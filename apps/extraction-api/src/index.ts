// Must come first: everything below reads process.env.
import { loadEnvFiles, misnamedKeyWarning } from './env.js';

const env = loadEnvFiles();

import { buildServer } from './server.js';
import { createOpenAIProposer } from './candidates/llm.js';
import { withEscalationLogging } from './candidates/proposer.js';

/**
 * The only deploy-specific file in the service. A plain Node process binding a port: no
 * serverless handler, no platform adapter. Moving to a different host is a config change.
 */
const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';
const apiKey = process.env['OPENAI_API_KEY'];
const model = process.env['OPENAI_MODEL'];

// Escalation is logged so it is possible to tell whether the model was actually consulted.
// No page in the sample corpus escalates -- the rules read all of them -- so without this
// an API key looks active while never being used.
const proposer = apiKey
  ? withEscalationLogging(
      createOpenAIProposer({ apiKey, ...(model ? { model } : {}) }),
      (message) => console.log(`[escalation] ${message}`),
    )
  : undefined;

const app = await buildServer({
  logger: true,
  // Without a key the service still runs: pages whose layout defeats the rules yield
  // refusals instead of candidates, which is the honest degradation.
  ...(proposer ? { proposer } : {}),
});

if (env.loadedFrom.length > 0) {
  app.log.info(`Loaded environment from: ${env.loadedFrom.join(', ')}`);
}

const misnamed = misnamedKeyWarning();
if (misnamed) app.log.warn(misnamed);

app.log.info(
  apiKey
    ? `LLM escalation active (model: ${model ?? 'gpt-4o-2024-08-06'}). Proposals still pass the verification gate.`
    : 'OPENAI_API_KEY is not set. Pages the rules cannot read will produce refusals rather than escalating.',
);

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
