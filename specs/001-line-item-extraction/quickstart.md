# Quickstart: Line-Item Extraction Service

**Feature**: `001-line-item-extraction` | **Date**: 2026-09-22

## Prerequisites

| Requirement | Verified locally |
|-------------|-----------------|
| Node | v25.9.0 present; target Node 20+ LTS |
| pnpm | v11.12.1 present — used as the monorepo package manager |
| OpenAI API key | needed only for the `IB-56010`-style escalation path; the test suite never calls it |

## Layout

```text
apps/
├── extraction-api/     Fastify service — POST /extract
└── web/                Next.js UI (Part B, not this feature)
packages/
└── contracts/          Zod schemas — imported by both apps
sample-files-variant/   the six-document acceptance corpus
```

## Run

```bash
pnpm install
pnpm --filter extraction-api dev          # http://localhost:3001

curl -F file=@sample-files-variant/IB-55871.pdf http://localhost:3001/extract | jq
```

## Test

```bash
pnpm test                                  # everything, no network
pnpm --filter extraction-api test verification-gate   # the gate alone, pure strings
```

The suite makes **zero** live OpenAI calls. If a test needs a model proposal, it injects a
fake through the LLM boundary interface.

## What each sample document should produce

Use these as the acceptance walkthrough. They are the observable form of US1–US4.

| Upload | Expect |
|--------|--------|
| `IB-55871.pdf` | 4 line items, every field evidenced, **0 refusals, 0 ambiguities**. The control — if anything is flagged here, a detector is too eager |
| `IB-56150.pdf` | 4 line items, plus **1 ambiguity**: `material_mismatch`, stated total $1,501.80 vs subtotal $1,270.00 + GST $190.50 = $1,460.50, off by $41.30 |
| `IB-56088.pdf` | 3 line items, total reconciles cleanly, plus **1 ambiguity**: `conflicting_counts`, "9 cartons dispatched" vs "11 cartons picked and loaded" |
| `IB-56010.pdf` | 4 line items with quantity + unit price evidenced, plus **4 refusals** (`value_not_provided`, one per row's missing amount). The `$40.00` for 2000 washers at $0.02 must **not** appear anywhere |
| `IB-STMT47.pdf` | **21 line items** from pages 1–3 and 5–8, plus **1 page-scoped refusal** for page 4 (`no_text_on_page`). Request succeeds |
| `IB-55902.pdf` | **0 line items**, **1 refusal** (`no_text_on_page`, page 1), HTTP **200** — not an error status |

## Verifying the evidence guarantee by hand

The whole feature rests on one claim: every returned `sourceText` is literally on the page
it names. Check it yourself without trusting the service:

```bash
# dump what the service considers page text, using the same extractor and clustering
node scripts/dump-page-text.mjs sample-files-variant/IB-55871.pdf

# then confirm any sourceText from the response appears verbatim in that dump
```

## Reproducing the Phase 0 corpus survey

These are the exact probes behind [research.md](./research.md); re-run them if the corpus
changes.

```bash
# which pages have a text layer (independent cross-check with a second extractor)
python3 -c "
from pypdf import PdfReader
import pathlib
for f in sorted(pathlib.Path('sample-files-variant').glob('*.pdf')):
    r = PdfReader(str(f))
    print(f.name, len(r.pages), [len(p.extract_text() or '') for p in r.pages])
"
```

Expected: `IB-55902` reports `[0]`, and `IB-STMT47` reports `0` at index 3 (page 4). Every
other page is non-empty. `pdfjs-dist` agrees with `pypdf` on all six documents.

## Known limitations to carry into the README (Principle V)

State these plainly rather than letting them be discovered:

- **Row clustering is a heuristic.** Page text is built by rounding text-item y-coordinates
  into rows. All six sample documents cluster cleanly; a document with slanted or
  overlapping baselines could split one visual row in two and cause spurious refusals.
- **No OCR.** Image-only pages are refused by name, never read. `IB-55902.pdf` returns
  nothing but a refusal, and that is the intended, tested behavior.
- **The rules path is tuned to one supplier's layout.** Every sample document comes from
  Ironbark Trade Merchants. A different supplier's invoice will likely fall through to the
  LLM path, which is the designed fallback but is far less exercised.
- **`conflicting_counts` uses a closed noun list** (`carton`, `pallet`, `box`, `item`,
  `package` and plurals). It is not general contradiction detection over prose and will
  miss conflicts phrased with any other noun.
- **Tax figures are compared, never validated.** The service checks that printed subtotal +
  printed tax equals the printed total. It does not check that a tax rate is correct.
