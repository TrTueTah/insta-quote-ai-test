# Contract: Verification Gate (internal, pure)

**Feature**: `001-line-item-extraction`
**Why this has its own contract**: the constitution names this function specifically — pure,
framework-free, unit-testable in isolation. It is the single point where Principle I is
enforced, so its interface is fixed here rather than left to implementation.

## Signature

```ts
function verify(
  candidates: Candidate[],
  pageTexts: ReadonlyMap<number, string>   // 1-indexed page → canonical page text
): { accepted: AcceptedValue[]; refused: Refusal[] }
```

**Purity requirements**, all testable:

- No I/O, no network, no filesystem, no clock, no randomness.
- No imports from Fastify, pdfjs, or the OpenAI client.
- Same inputs ⇒ same outputs, always.
- Never throws. A malformed candidate is refused, not raised (Principle III).

## `Candidate`

A proposal, from rules or from the LLM. Both paths produce this identical shape — the gate
cannot tell them apart, which is exactly the point (Principle I: both go through the same
gate).

| Field | Type |
|-------|------|
| `lineItemId` | string |
| `field` | `'code' \| 'description' \| 'quantity' \| 'unit' \| 'unitPrice' \| 'amount'` |
| `value` | string \| number |
| `claimedPage` | integer ≥ 1 |
| `claimedSourceText` | string |

## The three checks, in order

Applied per candidate. First failure wins and produces exactly one refusal.

| # | Check | Failure code |
|---|-------|-------------|
| 0 | `pageTexts` has `claimedPage`, and that text is non-empty | `source_text_not_found` |
| 1 | `pageText.includes(claimedSourceText)` — literal, no normalization | `source_text_not_found` |
| 2 | `claimedSourceText` occurs **exactly once** in `pageText` | `source_text_ambiguous` |
| 3 | The value's literal form appears within `claimedSourceText` | `value_not_in_source_text` |

Check 1 is the constitutional minimum. Checks 2 and 3 are strictly stronger additions
justified in [research.md](../research.md) R4 — they never accept anything check 1 would
reject.

### Check 3 normalization — tightly bounded

Comparing a parsed value to its own source text needs a little tolerance: `124800` cents
must be recognized in the text `$1,248.00`. The normalization applies **only** to this
comparison, and **only** these transformations:

- currency symbol stripped
- thousands separators stripped
- surrounding whitespace trimmed
- cents integer rendered back to a decimal string for comparison

It is **never** applied to the page text in checks 1 and 2. Widening what counts as present
on the page is precisely what Principle I forbids; this compares a value against a string
already proven to be on the page.

## Test obligations (constitution: gate tests use fixed text fixtures, no PDFs, no network)

Minimum cases, each with hand-written strings:

| Case | Expectation |
|------|-------------|
| Source text present exactly once, value inside it | accepted |
| Source text absent from the page | refused `source_text_not_found` |
| Claimed page not in `pageTexts` | refused `source_text_not_found` |
| Page text empty | refused `source_text_not_found` |
| Source text occurs twice (`$60.00` repeated) | refused `source_text_ambiguous` |
| Value absent from its own source text (LLM claims amount `4000` quoting a row with no such number) | refused `value_not_in_source_text` |
| Value matches only after normalization (`124800` vs `$1,248.00`) | accepted |
| Candidate with empty `claimedSourceText` | refused, does not throw |
| Whitespace-differing source text (`$52.00  $1,248.00` vs single space) | refused — no page-text normalization |

The sixth case is the one that matters most: it is the hallucinated-number test, and it
must pass before any LLM integration is written.
