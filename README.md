# Insta Quote AI

Upload a trade PDF (invoice, packing list, delivery docket); get back every line item the
service could extract **with the page and exact source text proving each value**, every value
it could not extract **with a specific reason**, and every contradiction the document makes
with itself **without either side being chosen**.

- **Part A** — `apps/extraction-api`, the extraction service.
- **Part B** — `apps/web`, the review page a non-technical person actually reads.

The governing rule, from [the project constitution](.specify/memory/constitution.md):

> Never emit a number without evidence. A confident wrong answer is a worse failure than an
> explicit refusal.

## Quick start

```bash
pnpm install
pnpm test        # 230 tests, no network, no API key needed

# two terminals
pnpm --filter @insta-quote/extraction-api dev   # http://localhost:3001
pnpm --filter @insta-quote/web dev              # http://localhost:3000  <- open this
```

`apps/web/.env.local` needs one line (copy `apps/web/.env.example`):

```bash
EXTRACTION_API_URL=http://localhost:3001
```

`OPENAI_API_KEY` is optional — see [The LLM path](#the-llm-path-and-what-it-is-not) below.

## Running it

```bash
pnpm install                                    # once
pnpm --filter @insta-quote/extraction-api dev   # http://localhost:3001, reloads on change
```

Or without watch mode: `pnpm --filter @insta-quote/extraction-api start`.

```bash
curl -F file=@sample-files-variant/IB-55871.pdf http://localhost:3001/extract | jq   # clean
curl -F file=@sample-files-variant/IB-56150.pdf http://localhost:3001/extract | jq   # ambiguity
curl -F file=@sample-files-variant/IB-56010.pdf http://localhost:3001/extract | jq   # refusals
curl http://localhost:3001/health
```

Tests need no key and no network:

```bash
pnpm test              # all 108
pnpm test -- verify    # the verification gate alone
pnpm typecheck
```

## Testing the real LLM path

**An API key on its own proves nothing here.** The LLM is consulted only for pages where the
rules parser matched *no rows at all*, and the rules read every page of every sample
document. Upload a sample with a key set and the model is never called.

To exercise it for real you need a document the rules cannot read. One is generated for you:

```bash
# 1. a deliberately unfamiliar layout: no product codes, no $ signs, quantities as words
node scripts/make-unfamiliar-invoice.mjs /tmp/unfamiliar.pdf

# 2. confirm the rules find nothing in it — 0 line items, 1 refusal
pnpm --filter @insta-quote/extraction-api start
curl -F file=@/tmp/unfamiliar.pdf http://localhost:3001/extract | jq

# 3. now with a key
export OPENAI_API_KEY=sk-...
pnpm --filter @insta-quote/extraction-api start
curl -F file=@/tmp/unfamiliar.pdf http://localhost:3001/extract | jq
```

Between runs 2 and 3 the server logs the escalation, so you can see the model being consulted
rather than inferring it:

```
[escalation] Rules matched nothing on page 1; asking the model to propose candidates.
             Anything it returns still has to pass the verification gate.
[escalation] Model proposed 15 candidate value(s) for page 1 in 2140ms. Gate verdict follows.
```

`OPENAI_MODEL` overrides the default (`gpt-4o-2024-08-06`). One page is one request — cents.

### What to actually look at in the output

The interesting result is not "did it extract things". It is whether the gate held:

- Every value returned should carry a `sourceText` that is **verbatim** in
  `node scripts/dump-page-text.mjs /tmp/unfamiliar.pdf`. Check one by hand.
- The generated invoice states `Net 574.55`, but 12x22.40 + 4x68.00 + 7x31.25 = 758.55.
  **The document's own arithmetic is wrong on purpose.** If the model "helpfully" returns
  computed line totals, they are not printed on the page and the gate refuses them.
- If the model reformats a value (`22.40` as `$22.40`, or a rephrased description), the gate
  refuses it — correctly. Refusals here are the feature working, not a failure.

### What a live run actually produced

Run against the generated unfamiliar invoice with a real key (recorded 2026-09-22):

```
[escalation] Rules matched nothing on page 1; asking the model to propose candidates.
[escalation] Model proposed 12 candidate value(s) for page 1 in 2711ms.

lineItems: 3   refusals: 6   ambiguities: 0
  p1-llm1 {description: 'Dressed pine skirting 90x18',      quantity: 12, unit: 'lengths', unitPrice: 2240}
  p1-llm2 {description: 'MDF door blank, hollow core',      quantity: 4,  unit: 'units',   unitPrice: 6800}
  p1-llm3 {description: 'Architrave set, colonial profile', quantity: 7,  unit: 'sets',    unitPrice: 3125}
```

Two things worth noting, both good:

- **The model did not fabricate the line totals.** The invoice prints no amount column, and
  `758.55` — the true sum — appears nowhere in the response. The six refusals are the three
  missing product codes and three missing amounts.
- **The first version of this run refused all three unit prices.** The gate required money to
  carry a currency symbol, and the invoice prints `@ 22.40 each`. That was a real defect in
  the gate, found by running it rather than by reasoning about it, and it is why the rule is
  now two-decimal formatting instead. The `640g` hole it was guarding against is still
  closed — there is a test for each case.

### Testing against your own documents

```bash
curl -F file=@/path/to/your-invoice.pdf http://localhost:3001/extract | jq
node scripts/dump-page-text.mjs /path/to/your-invoice.pdf   # what the gate compares against
```

A real supplier invoice that is not from Ironbark is the most honest test available, and the
one most likely to expose the limitations listed at the bottom of this file.

## What it does with the sample documents

Every row below is asserted by a test in `apps/extraction-api/tests/corpus/`.

| Document | Line items | Refusals | Ambiguities | What it demonstrates |
|---|---|---|---|---|
| `IB-55871.pdf` | 4 | 0 | 0 | The control. Fully evidenced, nothing flagged |
| `IB-56150.pdf` | 4 | 0 | 1 | Stated total $1,501.80 vs subtotal $1,270.00 + GST $190.50 = $1,460.50 — **out by $41.30** |
| `IB-56088.pdf` | 3 | 0 | 1 | Money reconciles perfectly, but the prose says **9 cartons** in one place and **11 cartons** in another |
| `IB-56010.pdf` | 4 | 4 | 0 | No Amount column. Quantities and unit prices extracted; the four absent amounts refused by name |
| `IB-STMT47.pdf` | 21 | 1 | 0 | 8 pages, page 4 blank. The other seven pages still return |
| `IB-55902.pdf` | 0 | 1 | 0 | Image-only scan. HTTP **200** with a named refusal, not an error |

### The single sharpest case

`IB-56010.pdf` has a row reading `FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea`.
Quantity 2000 and unit price $0.02 are both extracted with evidence. Their product, **$40.00,
is refused** — because that number is not printed anywhere on the page. A test asserts the
string `40.00` appears nowhere in the response.

## Part B — the review page

`apps/web`. One screen: choose a PDF, see what came back. Open <http://localhost:3000>.

What it does with each sample document — every row is asserted by a test:

| Upload | What you see |
|---|---|
| `IB-55871.pdf` | 4 line items with evidence. **No summary strip, no refusals section, no warning styling** — a clean document must not be decorated with problems it doesn't have |
| `IB-56010.pdf` | 4 items, each showing `Amount — Not extracted` with the reason **inline**, plus all 4 in the refusals inventory |
| `IB-56150.pdf` | 4 items plus one contradiction: stated $1,501.80 against $1,460.50 calculated, out by $41.30, neither marked correct |
| `IB-56088.pdf` | 3 items plus the 9-vs-11 cartons conflict |
| `IB-STMT47.pdf` | 21 items and one page-4 refusal — **visible without scrolling past the 21 rows** |
| `IB-55902.pdf` | No line items. The refusal is the result, not an error |

### Three design decisions worth explaining

**Refusals appear twice, on purpose.** A line-item refusal shows inline against the missing
value *and* in the refusals inventory. The duplication answers two different questions —
"why is this number missing?" and "how much did this document withhold?" — and a test
forbids the obvious tidy-up of replacing one copy with "see below".

**Refusals and contradictions render above the line items.** This looks backwards until you
try `IB-STMT47.pdf`: 21 rows and one refused page. Underneath, that refusal is off-screen.
Requiring no interaction to see it means not requiring a scroll either.

**Contradiction severity is labelled but never ranked.** A rounding difference and a material
mismatch get the same size, the same reading position, neither collapsed — differing only in
label and accent. The extraction service distinguishes them so a reviewer can triage, not so
the lesser one can be de-emphasised, and giving it less visual weight here would undo that
intent one design decision later.

### Four failure states, four different messages

Never one shared "something went wrong". Each is a separate component, rendered from an
exhaustive switch with no default branch, so collapsing them is a deletion rather than a
quiet refactor.

| Situation | What the person reads |
|---|---|
| Not a PDF, empty, none selected | Named in the browser **before any request is sent** |
| Extraction service unreachable or timed out | "Couldn't reach the service… try again in a moment" |
| Service replied with something unreadable | "…can't read… retrying is unlikely to help" |
| Service declined the upload | Its own message, verbatim |

The middle two are the pair most likely to merge — both are "the service misbehaved" — but
one means retry and the other means escalate, so they read differently.

### The two states no sample document can reach

Measured, not assumed: **no corpus document produces a `rounding_difference`**, and **none
contains refusals and contradictions together**. Both are rendered from checked-in fixtures,
schema-validated so they cannot drift:

```bash
open http://localhost:3000/dev/fixtures/both-ambiguity-kinds
open http://localhost:3000/dev/fixtures/refusals-and-ambiguities
open http://localhost:3000/dev/fixtures/unexplained-gap
```

Without these, the equal-prominence rule would have no coverage at all and could be dropped
without a single test noticing.

## How the guarantee actually holds

```
PDF ──► 1. page text        pdfjs-dist, text items clustered into rows by y-coordinate.
        (deterministic)        Ground truth. No model involved.
                │
                ▼
        2. candidates        Regex rules first. The LLM is asked only for pages where the
        (rules, then LLM)       rules matched nothing at all.
                │
                ▼
        3. VERIFICATION GATE  Pure function. The only way into `lineItems`.
                │                Both candidate paths produce the identical shape, so the
                │                gate cannot tell a rule from a model.
         ┌──────┴──────┐
      pass           fail
         ▼              ▼
    line item       refusal
                │
                ▼
        4. ambiguity detection  Runs regardless of which path produced the candidates.
```

### The gate's three checks

`apps/extraction-api/src/gate/verify.ts` — no imports from Fastify, pdfjs, or OpenAI, and a
test (`gate-purity.test.ts`) enforces that mechanically rather than by convention.

1. **The claimed source text is a literal substring of the claimed page.** No normalization.
2. **It occurs exactly once on that page.** `IB-STMT47.pdf` repeats `$60.00` on all seven
   readable pages — a fragment that matches three rows is evidence for none of them.
3. **The value appears inside its own source text**, as a whole token, and for money as a
   *currency-marked* token.

Checks 2 and 3 go beyond the constitution's required substring check. They are strictly
stronger — they never accept anything check 1 would reject.

Check 3 was not academic. Two real bugs were caught by its own tests during implementation:
a substring match let the fabricated `40.00` through by finding `40` inside `640g`, and after
switching to whole-token matching, `$640.00` still passed by matching the weight token `640`.
Requiring a currency marker for monetary values is what finally closed it.

### Why totals reconcile along a ladder

Comparing the line-item sum directly against a stated tax-inclusive total **flags the clean
control document**: `IB-55871`'s lines sum to $3,259.00 against a stated total of $3,747.85,
differing by exactly the GST. So reconciliation walks the ladder the document itself prints —
line sum → stated subtotal → plus stated tax → stated total — comparing only numbers literally
on the page, skipping any rung the document omits.

A detector that cries wolf on the control trains a reviewer to ignore ambiguities entirely,
which defeats the point of having them.

This is arithmetic on printed figures, **not tax logic**. The service never checks that a tax
rate is correct, never computes tax from a subtotal, and never converts between tax-inclusive
and tax-exclusive figures.

## The LLM path, and what it is not

`apps/extraction-api/src/candidates/llm.ts` proposes candidates via OpenAI structured outputs
for pages the rules cannot read. It is **not trusted**: its output passes the same gate, so a
fabricated figure is refused like any other unevidenced value. Tests prove this with a fake
proposer that returns an invented amount (`llm-gated.test.ts`).

**No test makes a live OpenAI call.** The service runs without `OPENAI_API_KEY`; pages the
rules cannot read simply produce refusals instead of candidates.

## CI/CD

One workflow, `.github/workflows/ci-cd.yml`. Every pull request is verified. Only `main`
deploys.

```
pull request ──► verify ──► (nothing is deployed)

push to main ──► verify ──► deploy-api (Railway) ──► deploy-web (Vercel) ──► smoke test
                                                                              │
                                                                            report
```

`verify` installs from a clean checkout with a frozen lockfile, type-checks **both**
applications as separately named steps, runs all 230 tests, and builds the web app. It
references no secrets at all — which is what makes fork pull requests safe by construction
rather than by policy.

### Setup — do step 1 first

**1. Turn off both platforms' own git auto-deploy.** Railway and Vercel will each happily
watch the repository and deploy on push by themselves. Leave either enabled and commits reach
production **without passing verification** — the pipeline's main guarantee becomes
decorative while still appearing satisfied. The pipeline cannot detect this; it is a dashboard
setting on each platform.

A symptom worth recognising: a deployment appearing seconds after a push, before `verify` has
finished.

**2. Add seven repository secrets** (Settings → Secrets and variables → Actions):

```
RAILWAY_API_TOKEN   RAILWAY_PROJECT   RAILWAY_SERVICE   RAILWAY_ENVIRONMENT
VERCEL_TOKEN        VERCEL_ORG_ID     VERCEL_PROJECT_ID
```

`RAILWAY_PROJECT` is the project **ID** — a UUID from the project's Settings page or its
dashboard URL — **not its display name**. `railway up` requires the ID and fails with a bare
`404 Not Found` during upload when given a name, which is how the first real run failed. If a
secret is missing, the deploy job stops and names it before running any CLI; if the target
does not resolve, the *Resolve the Railway target* step says which of the three values is
wrong.

**3. Set two platform environment variables** — these live on the platforms, deliberately not
in the pipeline:

| Platform | Variable | Value |
|---|---|---|
| Vercel | `EXTRACTION_API_URL` | the deployed Railway service's address, no trailing slash |
| Railway | `OPENAI_API_KEY` | optional; without it, unfamiliar layouts yield refusals |

The pipeline does not write `EXTRACTION_API_URL`; it verifies the consequence of it being
right. Managing it here would mask someone changing it by hand — exactly the drift the smoke
test should expose.

**Set the Vercel project's Root Directory to `apps/web`** (Vercel → Project → Settings →
Build and Deployment → Root Directory). `apps/web/vercel.json` is only read when `apps/web`
is the project root, and its build commands `cd` to the monorepo root from there. With it
unset, Vercel builds the repository root, finds no Next.js project, and deploys an empty site
that answers 404 on every path. The pipeline now checks this after `vercel pull` and fails
with that explanation rather than deploying nothing.

**Deployment configuration lives at the repository root.** `railway up` uploads the root of
the repo, and Railway reads `railway.json` from the root of what was uploaded — a config file
inside `apps/extraction-api/` is never read. The root `package.json` also carries a matching
`start` script, because Railpack's first check is that script rather than the JSON.

**4. Turn off Vercel Deployment Protection**, or the smoke test cannot reach the site.
Vercel → Project → Settings → Deployment Protection → Vercel Authentication. While it is on,
every request to a `*.vercel.app` address is answered with a 302 to `vercel.com/sso-api`
before it reaches the page — including the pipeline's upload. The alternatives are a custom
domain or a Protection Bypass secret.

**Environment variables only apply to new deployments.** Changing `EXTRACTION_API_URL` on
Vercel does nothing to a deployment that already exists; re-run the pipeline, or redeploy from
the Vercel dashboard, for it to take effect.

**5. Optionally** require the `verify` check on `main` in branch protection. The pipeline
already refuses to deploy an unverified commit, so this protects the branch rather than the
deployment.

### Reading the outcome

The `report` job writes one of four outcomes to the run summary:

| Outcome | Meaning | What to do |
|---|---|---|
| **Both live** | both deployed from this commit, and an upload through the site returned the control result | nothing |
| **Neither half moved** | the service deploy failed; the site was never touched | fix and re-run — nothing is inconsistent |
| **The two halves disagree** | the service is at this commit, the site is not | re-run. Until then the site may report a reply it cannot read |
| *(smoke test failed)* | both deployed but not proven to work together | check `EXTRACTION_API_URL` on Vercel first |

"Deploy failed" is deliberately not one of these. It cannot distinguish "nothing moved" from
"the service moved and the site did not", and those need different responses.

**Nothing rolls back and nothing retries.** A half-finished deployment is reported for a
person to resolve. An automatic rollback is an unrequested action that can itself fail,
leaving a worse and less obvious state than the one it was fixing.

### The smoke test

After both deploys, the pipeline uploads `IB-55871.pdf` to the **deployed site** — not the
service — and requires exactly 4 line items, 0 refusals, 0 ambiguities.

Going through the site is the point: it is the only check that catches the site pointing at
the wrong service, which is the most likely misconfiguration and the least visible. A health
check on the service alone would pass while the site talked to nothing.

The control document is used because its expected result is exact. "Some line items came
back" would pass against a stale deployment of either half.

### Guarding the workflow's shape

`apps/web/tests/unit/workflow-invariants.test.ts` parses the YAML and asserts the rules that
are each one line away from being broken by someone acting reasonably: `verify` contains no
`secrets.` reference, `deploy-web` declares `needs: deploy-api` rather than `needs: verify`,
`pull_request_target` appears nowhere, no step carries `continue-on-error`, and no rollback or
retry exists. 25 assertions, run as part of the normal suite.

The workflow also passes `actionlint`, which includes shellcheck on every embedded script:

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest .github/workflows/ci-cd.yml
```

## Honest limitations

Things that are flaky, untested, or deliberately out of scope. Please read this section
before trusting anything above it.

### A bug in Part A that Part B found

`AmbiguitySchema` required `values` to hold at least two entries. But a total-versus-sum
conflict often has **one** figure printed on the page and a computed sum on the other side:
a document stating `Total: $245.00` whose line items add to $190.00 states that total exactly
once.

Part A detected that contradiction correctly and then **threw while validating its own
response**, turning a real finding into an HTTP 500. No sample document hits it because
`IB-56088` — the only single-total document — happens to add up exactly, so it sat undetected
through all of Part A's 110 tests.

It surfaced when a Part B fixture, written to look like a plausible response, failed schema
validation. The invariant is now about the conflict rather than the array: `values` plus
`computed` must describe at least two sides. Regression test at
`apps/extraction-api/tests/unit/ambiguity/single-stated-total.test.ts`.

### A correction to the project's own planning documents

`specs/001-line-item-extraction/research.md` (R3) claimed `IB-56010.pdf`'s layout
*demonstrably defeats* the rules and therefore required LLM escalation. **That was
overstated.** After inspecting the layout, a second deterministic rule for the five-column
no-amount shape handles it completely, and all 36 line items in the corpus are extracted by
rules alone. The genuinely hard problem is generalizing to a layout nobody has looked at yet —
which is what the LLM path is for, and which the corpus cannot demonstrate.

### Known limitations

- **The LLM path has never run against a real model.** It is implemented, type-checked, and
  tested with fakes. Its prompt, its JSON schema, and its behavior on a genuinely unfamiliar
  layout are all unverified against live OpenAI. This is the weakest part of the submission.
  See [Testing the real LLM path](#testing-the-real-llm-path) to exercise it — and note that
  **no sample document triggers it**, because the rules read all six. An API key changes
  nothing about how this repo handles its own corpus.
- **Row clustering is a heuristic.** Page text is built by rounding text-item y-coordinates
  into rows. All six sample documents cluster cleanly; a document with slanted, overlapping,
  or multi-column baselines could split one visual row into two and cause spurious refusals.
  The entire evidence guarantee is defined in terms of this text, so this is the assumption
  everything else rests on.
- **The rules are tuned to one supplier.** Every sample document is from Ironbark Trade
  Merchants. A different supplier's invoice will likely fall through to the LLM path — the
  designed fallback, and the one that is least exercised.
- **Monetary values must be written with two decimal places** (`22.40`, `$1,248.00`) to be
  recognised in their own source text. A document printing a price as `22.4` or `22` will
  have it refused. This replaced a stricter rule requiring a currency symbol, which a live
  test proved wrong — see below.
- **Total labels are matched by vocabulary**, not position: `Subtotal`, `Total`, `GST`/`VAT`/
  `Tax`. A document labelling them `Net` and `Amount due` supplies no ladder to reconcile, so
  no total ambiguity is reported even if its arithmetic is wrong. Confirmed on the generated
  unfamiliar invoice.
- **`conflicting_counts` uses a closed noun list** (carton, pallet, box, item, package,
  crate, and plurals) and reads only narrative lines, never line-item rows. It is not
  general-purpose contradiction detection over prose and will miss any conflict phrased with
  another noun.
- **No OCR.** Image-only pages are refused by name, never read.
- **Conflicting unit prices are detected by product code only.** Two rows describing the same
  item with different codes will not be compared.
- **Nothing is persisted.** No storage, no auth, no rate limiting.
### Part B limitations

- **Equal prominence across contradiction severities is verified against a fixture, not a
  real document.** No supplier invoice in the corpus produces a rounding difference, so the
  rule that matters most for triage is demonstrated only by constructed data.
- **Phone-sized layouts are not a target.** Desktop and tablet only.
- **Nothing is saved.** Reloading loses the result; there is no history and no comparison
  between documents.
- **The page cannot show the PDF itself.** Evidence is a page number and quoted text; the
  person checks against their own copy. An in-page preview was deliberately out of scope.
- **The refusal inventory repeats every inline reason**, by design. On a document with many
  partial rows this is visibly redundant.
- **Row evidence is shown once per line item** when every value agrees on it, which is true
  for all 29 line items in the corpus. If a future response carried differing evidence per
  value, the page falls back to showing it per value — untested against real data, because no
  real data produces it.
- **The proxy has no retry, no rate limiting and no auth.**

### CI/CD limitations

- **Lint is not part of verification.** `pnpm lint` does not run — ESLint was never
  installed, so the script fails with `command not found`. Adding it as `|| true` to keep the
  pipeline green would report assurance it does not provide, so it is left out and said out
  loud instead.
- **Two things stay unverified until a successful deployment**: the exact stdout shape
  `vercel deploy` prints its URL in, and whether the platform git integrations are genuinely
  disabled. The third — that `RAILWAY_API_TOKEN` is the variable the Railway CLI
  authenticates with — **was confirmed** by the first real run, which reached Railway and
  failed on the target rather than the credential.
- **Nothing rolls back.** The window where the deployed halves are from different commits is
  accepted, not eliminated.
- **No staging environment.** `main` deploys straight to production.
- **The smoke test uses one document.** It proves the pair is connected and working for the
  control case, not that extraction is correct — that is what the 230 tests are for.
- **Pull requests get no preview deployment.** Reviewing means reading the change and running
  it locally.

## Verify the evidence guarantee yourself

Don't take the service's word for it:

```bash
node scripts/dump-page-text.mjs sample-files-variant/IB-55871.pdf
```

That prints exactly the text the gate checks against. Take any `sourceText` from a response
and confirm it appears, character for character, under the page it claims.

## Project layout

```
apps/extraction-api/     Fastify service
  src/pdf/               canonical page text (pdfjs + row clustering)
  src/candidates/        rules parser, LLM proposer behind an interface
  src/gate/              THE GATE — pure, framework-free
  src/ambiguity/         totals ladder, unit prices, stated counts
  src/refusals/          the eight refusal codes → display-ready strings
  tests/unit/            fixed string fixtures, no PDFs, no network
  tests/corpus/          the six real sample documents
packages/contracts/      Zod schemas — single source of truth for both apps
specs/001-line-item-extraction/   spec, plan, research, data model, contracts
```

## Constitution audit

| Principle | Status |
|---|---|
| I. Evidence or refusal | **Held.** `EvidencedValue` requires evidence; the gate is the only writer of `lineItems`; both candidate paths share it |
| II. Ambiguity is a result | **Held.** Separate collection, no `resolved`/`preferred` field exists to set. Extended beyond the spec with `conflicting_counts` |
| III. Fault isolation | **Held.** Refusals are scoped document/page/lineItem/value; the gate never throws; `IB-STMT47` page 4 proves it end to end |
| IV. API response is the contract | **Held end to end.** Reason strings are display-ready, emitted once, passed through the proxy unchanged, and rendered verbatim. Tests assert every reason on screen appears character for character in the response, and that no state contains a generic phrase |
| V. README honesty | This section, plus the correction and limitations above |
| IV, applied to the pipeline | **Held.** Every verification step is separately named, and the release report distinguishes "nothing moved" from "the service moved and the site did not". A bare "deploy failed" is a contract violation, not a wording preference |

Deliberately not implemented: OCR, multi-currency, tax-rate validation, persistence, batch
upload, authentication, and an in-page PDF preview.
