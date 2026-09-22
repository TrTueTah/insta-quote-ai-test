# Insta Quote AI — Line-Item Extraction Service (Part A)

Upload a trade PDF (invoice, packing list, delivery docket); get back every line item the
service could extract **with the page and exact source text proving each value**, every value
it could not extract **with a specific reason**, and every contradiction the document makes
with itself **without either side being chosen**.

The governing rule, from [the project constitution](.specify/memory/constitution.md):

> Never emit a number without evidence. A confident wrong answer is a worse failure than an
> explicit refusal.

## Quick start

```bash
pnpm install
pnpm test                                    # 108 tests, no network, no API key needed
pnpm --filter @insta-quote/extraction-api dev # http://localhost:3001

curl -F file=@sample-files-variant/IB-55871.pdf http://localhost:3001/extract | jq
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

## Honest limitations

Things that are flaky, untested, or deliberately out of scope. Please read this section
before trusting anything above it.

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
- **Part B (the web UI) is not built.** It was out of scope for this feature. The contract it
  will consume is specified in `specs/001-line-item-extraction/contracts/extract-api.md`,
  including the requirement that refusal reasons be rendered verbatim.

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
| IV. API response is the contract | **Held in the API.** Reason strings are display-ready and emitted once. *Unproven for the UI, because the UI does not exist yet* |
| V. README honesty | This section, plus the correction and limitations above |

Deliberately not implemented: the web UI (Part B), OCR, multi-currency, tax-rate validation,
persistence, batch upload, and authentication.
