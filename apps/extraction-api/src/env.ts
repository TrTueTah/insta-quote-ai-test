import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Load `.env` files before anything reads `process.env`.
 *
 * Self-contained rather than a dependency: the format needed here is a few lines of
 * KEY=value, and the service should not grow a supply chain for that.
 *
 * Existing environment variables always win, so an exported value or a platform's own
 * configuration is never silently overridden by a file left on disk.
 */

const CANDIDATE_PATHS = [
  // apps/extraction-api/.env — next to .env.example, the documented location
  new URL('../.env', import.meta.url),
  // repo root .env — where people commonly put it instead
  new URL('../../../.env', import.meta.url),
];

export interface LoadedEnv {
  loadedFrom: string[];
  keysSet: string[];
}

export function loadEnvFiles(): LoadedEnv {
  const loadedFrom: string[] = [];
  const keysSet: string[] = [];

  for (const url of CANDIDATE_PATHS) {
    const path = fileURLToPath(url);

    let contents: string;
    try {
      contents = readFileSync(path, 'utf8');
    } catch {
      continue; // absent is normal, not an error
    }

    loadedFrom.push(path);

    for (const [key, value] of parseEnv(contents)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        keysSet.push(key);
      }
    }
  }

  return { loadedFrom, keysSet };
}

export function parseEnv(contents: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = withoutExport.indexOf('=');
    if (separator === -1) continue;

    const key = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(separator + 1).trim();

    // Strip matching surrounding quotes; leave inner content alone.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      // An unquoted trailing comment is not part of the value.
      const comment = value.indexOf(' #');
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    entries.push([key, value]);
  }

  return entries;
}

/**
 * Names people reach for that are not the one this service reads. Getting told "no key set"
 * while looking at a file that plainly contains a key is a miserable way to lose an hour.
 */
const NEAR_MISSES = ['OPENAI_KEY', 'OPENAI_TOKEN', 'OPENAI_SECRET_KEY', 'OPEN_AI_API_KEY'];

export function misnamedKeyWarning(): string | null {
  if (process.env['OPENAI_API_KEY']) return null;

  const found = NEAR_MISSES.filter((name) => process.env[name]);
  if (found.length === 0) return null;

  return `Found ${found.join(', ')} but this service reads OPENAI_API_KEY. Rename it.`;
}
