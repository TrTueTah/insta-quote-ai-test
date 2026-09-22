#!/usr/bin/env node
/**
 * Does the OpenAI configuration actually work?
 *
 * Checks four things in order, stopping at the first failure, so the answer is never
 * "something went wrong":
 *
 *   1. Is a key present, and did it come from where you think it did?
 *   2. Does the key authenticate at all?
 *   3. Is the configured model reachable by this key?
 *   4. Does a real structured-output proposal come back in the shape the proposer expects?
 *
 * Step 4 is the one that matters. A key can be valid and the model reachable while the
 * structured-output call still fails, and that is the part the service depends on.
 *
 *   node scripts/check-openai.mjs
 */
import { readFileSync } from 'node:fs';

const DEFAULT_MODEL = 'gpt-4o-2024-08-06';

// --- 1. key present ---------------------------------------------------------------------

const ENV_FILES = ['apps/extraction-api/.env', '.env'];
const loaded = [];

for (const path of ENV_FILES) {
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  loaded.push(path);
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^export\s+/, '');
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at === -1) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, hint) => {
  console.log(`  FAIL  ${m}`);
  if (hint) console.log(`\n        ${hint}\n`);
  process.exit(1);
};

console.log('\nChecking OpenAI configuration\n');

console.log(
  loaded.length ? `  read  ${loaded.join(', ')}` : '  note  no .env file found; using the shell environment',
);

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

if (!apiKey) {
  const nearMiss = ['OPENAI_KEY', 'OPENAI_TOKEN', 'OPEN_AI_API_KEY', 'OPENAI_SECRET_KEY'].filter(
    (n) => process.env[n],
  );
  fail(
    'OPENAI_API_KEY is not set',
    nearMiss.length
      ? `Found ${nearMiss.join(', ')} instead. This service reads OPENAI_API_KEY — rename it in apps/extraction-api/.env`
      : 'Add OPENAI_API_KEY=sk-... to apps/extraction-api/.env (see .env.example)',
  );
}

pass(`OPENAI_API_KEY is set (${apiKey.slice(0, 7)}…, ${apiKey.length} chars)`);
pass(`model: ${model}`);

// --- 2. key authenticates ---------------------------------------------------------------

const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

let response;
try {
  response = await fetch('https://api.openai.com/v1/models', { headers: auth });
} catch (error) {
  fail(`could not reach api.openai.com (${error.message})`, 'Check your network or proxy.');
}

if (response.status === 401) {
  fail('the key was rejected (401)', 'The key is invalid, revoked, or from a different account.');
}
if (response.status === 429) {
  fail('rate limited or out of quota (429)', 'The key is valid but the account has no available quota.');
}
if (!response.ok) {
  fail(`unexpected ${response.status} from /v1/models`, (await response.text()).slice(0, 200));
}

pass('key authenticates');

// --- 3. model reachable -----------------------------------------------------------------

const { data } = await response.json();
const available = new Set((data ?? []).map((m) => m.id));

if (!available.has(model)) {
  const suggestions = [...available].filter((id) => id.startsWith('gpt-4o')).slice(0, 5);
  fail(
    `model "${model}" is not available to this key`,
    suggestions.length
      ? `Try one of: ${suggestions.join(', ')}\n        Set it with OPENAI_MODEL=<id>`
      : 'This key has no gpt-4o models. Check the project/org the key belongs to.',
  );
}

pass(`model "${model}" is available`);

// --- 4. the real call the service makes -------------------------------------------------

const PAGE = [
  'Harding & Sons Joinery',
  'Item                                    Supplied      Rate',
  'Dressed pine skirting 90x18          12 lengths    @ 22.40 each',
].join('\n');

const body = {
  model,
  temperature: 0,
  messages: [
    {
      role: 'system',
      content:
        'You read line items out of trade documents. Copy values exactly as printed. Never calculate a value. "sourceText" must be one complete line copied character for character. Use null for anything not printed.',
    },
    { role: 'user', content: `Page 1 text:\n\n${PAGE}` },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'line_items',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['rows'],
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['sourceText', 'description', 'quantity', 'unitPrice'],
              properties: {
                sourceText: { type: 'string' },
                description: { type: ['string', 'null'] },
                quantity: { type: ['string', 'null'] },
                unitPrice: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  },
};

const started = Date.now();
const completion = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify(body),
});

if (!completion.ok) {
  fail(
    `the structured-output call failed (${completion.status})`,
    (await completion.text()).slice(0, 300),
  );
}

const payload = await completion.json();
const content = payload.choices?.[0]?.message?.content;

if (!content) fail('the model returned no content');

let parsed;
try {
  parsed = JSON.parse(content);
} catch {
  fail('the model returned content that is not valid JSON', content.slice(0, 200));
}

if (!Array.isArray(parsed.rows)) fail('the response had no "rows" array', content.slice(0, 200));

pass(`structured output works (${parsed.rows.length} row(s), ${Date.now() - started}ms)`);

// Does the excerpt it quoted actually exist? This is the gate's check, run here so a
// misbehaving model shows up now rather than as a pile of refusals later.
const quoted = parsed.rows[0]?.sourceText;
if (typeof quoted === 'string' && quoted !== '') {
  const verbatim = PAGE.includes(quoted);
  console.log(
    verbatim
      ? '  ok    the excerpt it quoted is verbatim from the page'
      : '  note  the excerpt it quoted is NOT verbatim — the gate would refuse this value.\n        Not a configuration problem: this is the gate doing its job.',
  );
}

const usage = payload.usage;
if (usage) console.log(`  note  ${usage.total_tokens} tokens used for this check`);

console.log('\nOpenAI configuration is working.\n');
