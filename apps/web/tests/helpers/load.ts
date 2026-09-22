import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExtractionResultSchema, type ExtractionResult } from '@insta-quote/contracts';

// Resolved from the vitest root rather than from import.meta.url: these tests run in a
// jsdom environment, where import.meta.url is not a file: URL.
const FIXTURES = `${resolve(process.cwd(), 'apps/web/tests/fixtures')}/`;

export type CorpusName =
  | 'IB-55871'
  | 'IB-55902'
  | 'IB-56010'
  | 'IB-56088'
  | 'IB-56150'
  | 'IB-STMT47';

export type FixtureName =
  | 'both-ambiguity-kinds'
  | 'refusals-and-ambiguities'
  | 'unexplained-gap';

function read(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** A captured real response from Part A. Parsed through the shared schema, never trusted raw. */
export function corpus(name: CorpusName): ExtractionResult {
  return ExtractionResultSchema.parse(read(`${FIXTURES}corpus/${name}.json`));
}

/** A hand-authored response for a state no real document reaches. */
export function fixture(name: FixtureName): ExtractionResult {
  return ExtractionResultSchema.parse(read(`${FIXTURES}${name}.json`));
}

export function allCorpusNames(): CorpusName[] {
  return readdirSync(`${FIXTURES}corpus`)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, '') as CorpusName)
    .sort();
}

export function rawFixturePaths(): string[] {
  const top = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => `${FIXTURES}${f}`);
  const corpusFiles = readdirSync(`${FIXTURES}corpus`)
    .filter((f) => f.endsWith('.json'))
    .map((f) => `${FIXTURES}corpus/${f}`);
  return [...top, ...corpusFiles];
}

export function readRaw(path: string): unknown {
  return read(path);
}
