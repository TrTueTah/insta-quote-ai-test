# Quickstart: Review Web Page (Part B)

**Feature**: `002-review-web-page` | **Date**: 2026-09-22

## Run both halves

Part B is useless without Part A running. Two terminals:

```bash
# terminal 1 — the extraction service
pnpm --filter @insta-quote/extraction-api dev     # http://localhost:3001

# terminal 2 — the review page
pnpm --filter @insta-quote/web dev                # http://localhost:3000
```

`apps/web/.env.local`:

```bash
EXTRACTION_API_URL=http://localhost:3001   # server-side only, never sent to the browser
```

## Walk the states

Every row is a state the page must render differently. This table *is* the acceptance
walkthrough for FR-016 and SC-005.

| Do this | Expect |
|---|---|
| Upload `IB-55871.pdf` | 4 line items with evidence. **No summary strip, no refusals section, no warning styling** — a clean document must not look like it has open questions |
| Upload `IB-56010.pdf` | 4 items, each showing `Amount —` with its reason **inline**, plus all 4 in the refusals inventory. Same sentence in both places, neither shortened |
| Upload `IB-56150.pdf` | 4 items plus one contradiction: stated total $1,501.80 against $1,460.50 calculated, difference $41.30, no value marked correct |
| Upload `IB-56088.pdf` | 3 items plus one contradiction: 9 cartons against 11 cartons |
| Upload `IB-STMT47.pdf` | 21 items and one page-4 refusal — and **the refusal must be visible without scrolling past the 21 items** |
| Upload `IB-55902.pdf` | No line items. The refusal is the primary content, reading as information rather than as an error |
| Upload a `.txt` file | Rejected in the browser with a named reason, **no network request made** — check the network tab |
| Upload an empty file | Same, named differently |
| Stop the extraction service, upload anything | "couldn't reach the extraction service" — not a generic error |
| Point `EXTRACTION_API_URL` at a server returning HTML, upload | A message about an unreadable reply, **visibly different** from the unreachable message |

## The two states no sample document can reach

Measured, not assumed (see [research.md](./research.md) R1): no corpus document produces a
`rounding_difference`, and none contains refusals and ambiguities together. Both are rendered
from fixtures:

```bash
# render any fixture without a running extraction service
open http://localhost:3000/dev/fixtures/both-ambiguity-kinds
open http://localhost:3000/dev/fixtures/refusals-and-ambiguities
open http://localhost:3000/dev/fixtures/unexplained-gap
```

On `both-ambiguity-kinds`, check with a ruler or devtools: the rounding difference and the
material mismatch must have **the same height, the same indentation, and neither collapsed**
(FR-028, SC-012). If the quieter one looks quieter, that is the bug this fixture exists to
catch.

## Test

```bash
pnpm test                       # everything, both apps
pnpm --filter @insta-quote/web test
```

No test makes a network call. The web tests run against captured corpus responses and the
three fixtures.

## Checks worth doing by hand

- **Search the rendered page for banned phrases.** "something went wrong", "an error
  occurred", "unexpected error" must appear zero times in every state (FR-017, SC-006).
- **Search for internal identifiers.** `p1-r2`, `value_not_provided`, `unitPrice` must never
  reach the screen (FR-021).
- **Compare an inline refusal to its inventory entry** word for word (FR-025).
- **Open `IB-STMT47.pdf` and do not scroll.** If you cannot see that page 4 was refused, R7's
  ordering has regressed.

## Known limitations to carry into the README

- **The rounding-difference layout is verified against a fixture, not a real document.** No
  supplier invoice in the corpus produces one, so the equal-prominence rule is demonstrated
  only by constructed data.
- **Phone-sized layouts are not a target.** Desktop and tablet only, per the spec.
- **Nothing is saved.** Reloading loses the result; there is no history.
- **The page cannot show the PDF itself.** Evidence is a page number and quoted text; the
  person checks against their own copy.
- **The refusal inventory repeats every inline reason**, by design (FR-026). On a document
  with many partial rows this is visibly redundant.
