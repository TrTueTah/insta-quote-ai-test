import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CORPUS_DIR = fileURLToPath(
  new URL('../../../../sample-files-variant/', import.meta.url),
);

export type CorpusDoc =
  | 'IB-55871'
  | 'IB-55902'
  | 'IB-56010'
  | 'IB-56088'
  | 'IB-56150'
  | 'IB-STMT47';

export function readCorpus(name: CorpusDoc): Uint8Array {
  return new Uint8Array(readFileSync(`${CORPUS_DIR}${name}.pdf`));
}
