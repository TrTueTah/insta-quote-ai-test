import type { FastifyInstance, FastifyReply } from 'fastify';
import { ExtractionResultSchema } from '@insta-quote/contracts';
import { runExtraction } from '../pipeline/run.js';
import { DocumentEncryptedError, DocumentUnreadableError } from '../pdf/page-text.js';
import { reasonFor } from '../refusals/reasons.js';
import type { CandidateProposer } from '../candidates/proposer.js';
import { MAX_PAGES, MAX_UPLOAD_BYTES } from '../server.js';

export interface ExtractRouteOptions {
  proposer?: CandidateProposer;
}

const PDF_MAGIC = '%PDF-';

/**
 * POST /extract -- multipart PDF in, `{ lineItems, refusals, ambiguities }` out.
 *
 * An error status is returned ONLY when no result could be produced at all. Anything that
 * can be expressed as a refusal is a 200 with refusals, because a named refusal is more
 * useful to a reviewer than an error code. Note the deliberate split: a password-protected
 * PDF is a 200 with a `document_encrypted` refusal (it was a document, and the reason is
 * specific), while a file that is not a PDF is a 400 (it never became a document).
 */
export function registerExtractRoute(
  app: FastifyInstance,
  options: ExtractRouteOptions = {},
): void {
  app.post('/extract', async (request, reply) => {
    let data: Uint8Array;
    let filename: string;

    try {
      const parts = request.files();
      const first = await parts.next();

      if (first.done || !first.value) {
        return fail(reply, 400, 'no_file', 'No PDF was uploaded. Attach one file and try again.');
      }

      filename = first.value.filename || 'upload.pdf';
      const buffer = await first.value.toBuffer();

      const second = await parts.next();
      if (!second.done) {
        return fail(
          reply,
          400,
          'too_many_files',
          'More than one file was uploaded. This service reads one PDF at a time.',
        );
      }

      if (buffer.length === 0) {
        return fail(reply, 400, 'empty_file', 'The uploaded file is empty, so there was nothing to read.');
      }

      if (!buffer.subarray(0, 5).toString('latin1').startsWith(PDF_MAGIC)) {
        return fail(reply, 400, 'not_a_pdf', reasonFor('document_unreadable'));
      }

      data = new Uint8Array(buffer);
    } catch (error) {
      if (isFileTooLarge(error)) {
        return fail(
          reply,
          413,
          'file_too_large',
          `This file is larger than the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit, so it was not processed.`,
        );
      }
      return fail(reply, 400, 'upload_failed', 'The upload could not be read. Please try again.');
    }

    try {
      const result = await runExtraction(data, {
        documentName: filename,
        ...(options.proposer ? { proposer: options.proposer } : {}),
      });

      if (result.pageCount > MAX_PAGES) {
        return fail(
          reply,
          400,
          'too_many_pages',
          `This document has ${result.pageCount} pages, more than the ${MAX_PAGES}-page limit, so it was not processed.`,
        );
      }

      // The response is validated against the shared schema before it leaves, so the FR-016
      // invariant is enforced on the way out rather than trusted.
      return reply.status(200).send(ExtractionResultSchema.parse(result));
    } catch (error) {
      if (error instanceof DocumentEncryptedError) {
        return reply.status(200).send(
          ExtractionResultSchema.parse({
            documentName: filename,
            pageCount: 0,
            lineItems: [],
            ambiguities: [],
            refusals: [
              {
                scope: 'document',
                code: 'document_encrypted',
                reason: reasonFor('document_encrypted'),
              },
            ],
          }),
        );
      }

      if (error instanceof DocumentUnreadableError) {
        return fail(reply, 400, 'not_a_pdf', reasonFor('document_unreadable'));
      }

      request.log.error(error);
      return fail(
        reply,
        500,
        'internal_error',
        'This document could not be processed because of an unexpected problem on our side.',
      );
    }
  });
}

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { code, message } });
}

function isFileTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE'
  );
}
