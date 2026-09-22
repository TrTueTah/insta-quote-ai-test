import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { registerExtractRoute } from './routes/extract.js';
import { registerHealthRoute } from './routes/health.js';
import type { CandidateProposer } from './candidates/proposer.js';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_PAGES = 50;

export interface ServerOptions {
  /**
   * Injected so tests can supply a fake and never make a live model call. Omitted in
   * production wiring, where the OpenAI-backed proposer is used.
   */
  proposer?: CandidateProposer;
  logger?: boolean;
}

/**
 * App factory with no side effects on import: nothing listens, nothing reads the
 * environment. `index.ts` is the only file that binds a port, which is what keeps this
 * deployable anywhere without a Vercel-specific entry point.
 */
export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 2 },
  });

  registerHealthRoute(app);
  registerExtractRoute(app, options.proposer ? { proposer: options.proposer } : {});

  return app;
}
