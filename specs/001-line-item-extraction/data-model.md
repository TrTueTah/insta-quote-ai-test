# Phase 1 Data Model: Line-Item Extraction Service

**Feature**: `001-line-item-extraction` | **Date**: 2026-09-22
**Source**: [spec.md](./spec.md) Key Entities + [research.md](./research.md)

These shapes are defined once as Zod schemas in `packages/contracts` and imported by both
apps (constitution, tech stack). Nothing here is duplicated in either app.

## Core principle expressed in the type system

Evidence attaches to **a value**, never to a line item as a whole. This is the structural
reason a partially readable row can return its readable parts (FR-006) while the unreadable
part becomes a refusal (FR-005). If evidence hung off the line item, "quantity is evidenced
but price is not" would have no representation and the design would force a null or a guess.

## `Evidence`

| Field | Type | Rules |
|-------|------|-------|
| `page` | integer ≥ 1 | 1-indexed page number the value was read from |
| `sourceText` | non-empty string | Literal substring of that page's canonical text (R2). Never paraphrased, reformatted, or normalized |

Validated by the gate, not by Zod alone — Zod can only confirm it is a non-empty string;
only the gate can confirm it is genuine evidence by checking it against the page.

## `EvidencedValue<T>`

The unit that carries Principle I. Wraps every extracted value.

| Field | Type | Rules |
|-------|------|-------|
| `value` | `T` (string \| number) | The extracted value |
| `evidence` | `Evidence` | Required — the type admits no evidence-free value |

There is deliberately **no** `EvidencedValue` variant with optional evidence. A value
without evidence is not representable; it can only exist as a `Refusal`.

## `LineItem`

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | Stable within one result; used to link refusals to their row |
| `page` | integer ≥ 1 | Page the row appeared on |
| `description` | `EvidencedValue<string>` \| absent | Absent ⇒ a matching refusal exists |
| `quantity` | `EvidencedValue<number>` \| absent | Absent ⇒ a matching refusal exists |
| `unit` | `EvidencedValue<string>` \| absent | e.g. `box`, `ea`, `length`. Absent is common |
| `unitPrice` | `EvidencedValue<number>` \| absent | Absent ⇒ a matching refusal exists |
| `amount` | `EvidencedValue<number>` \| absent | Line total. Absent ⇒ a matching refusal exists |
| `code` | `EvidencedValue<string>` \| absent | Supplier product code, e.g. `FX-201` |

**Invariant (enforced in code and asserted in tests)**: for every field that is absent, the
result contains a `Refusal` naming that `lineItemId` and that `field`. There is no silent
omission. A `LineItem` with every field absent is never emitted — it becomes refusals only.

**Monetary representation**: integer cents, not floats. `$1,248.00` → `124800`. Chosen so
the `$0.01 × lineItemCount` rounding threshold (FR-025) is exact rather than subject to
binary floating-point drift, which would make the rounding-vs-material boundary flaky.

## `Refusal`

| Field | Type | Rules |
|-------|------|-------|
| `scope` | `'document'` \| `'page'` \| `'lineItem'` \| `'value'` | Smallest boundary the failure was contained at (Principle III) |
| `page` | integer ≥ 1 \| absent | Absent only when `scope` is `'document'` |
| `lineItemId` | string \| absent | Present when `scope` is `'lineItem'` or `'value'` |
| `field` | field name \| absent | Present when `scope` is `'value'` |
| `code` | `RefusalCode` | One of the eight enumerated cases below |
| `reason` | non-empty string | **The exact string shown to the end user** (FR-011, Principle IV) |

### `RefusalCode` — the fixed, enumerated set (FR-009)

| Code | When | Example reason string |
|------|------|----------------------|
| `no_text_on_page` | Page yielded zero text items | `Page 4 contains no extractable text — it may be a scanned image.` |
| `page_unreadable` | Page threw while being read | `Page 4 could not be read: the page data is damaged.` |
| `document_unreadable` | Document could not be opened at all | `This file could not be opened as a PDF.` |
| `document_encrypted` | Password-protected | `This PDF is password-protected and cannot be read.` |
| `source_text_not_found` | Gate check 1 failed | `Source text not found on page 3.` |
| `source_text_ambiguous` | Gate check 2 failed — occurs more than once | `Source text appears more than once on page 6, so it cannot identify a single row.` |
| `value_not_in_source_text` | Gate check 3 failed | `The amount is not present in the source text quoted for it.` |
| `value_not_provided` | The document genuinely does not state this value | `This document does not state an amount for this line.` |

The last one is deliberately distinct from `source_text_not_found`. `IB-56010` has no
Amount column at all — reporting that as "source text not found" would imply damage where
the document is simply a docket without pricing (spec edge case).

**`reason` is written for a merchant, not an engineer**, and is passed through to the UI
byte-for-byte. Part B must not re-derive or re-bucket it.

## `Ambiguity`

| Field | Type | Rules |
|-------|------|-------|
| `kind` | `'rounding_difference'` \| `'material_mismatch'` | Per FR-025 |
| `type` | `'total_vs_sum'` \| `'conflicting_totals'` \| `'conflicting_unit_prices'` \| `'conflicting_counts'` | Which detector fired |
| `fact` | string | The single fact in conflict, e.g. `document total`, `cartons dispatched` |
| `values` | array of ≥ 2 `EvidencedValue` | Every conflicting value, each with its own evidence (FR-013) |
| `computed` | `{ value, derivedFrom: string }` \| absent | Present only for `total_vs_sum`, where one side is a sum rather than a printed figure. Explicitly marked as computed so it is never mistaken for an evidenced value |
| `reason` | non-empty string | Shown to the user verbatim, like `Refusal.reason` |

**Invariant**: an `Ambiguity` never nominates a winner. There is no `resolved`, `preferred`,
or `bestGuess` field, so FR-014 cannot be violated by a later change without altering this
schema — which is the point of encoding it here.

`computed` is the one number in the entire system not backed by page evidence. It is
structurally segregated and labelled with its derivation (`sum of 4 line item amounts`)
rather than being smuggled in as an `EvidencedValue`.

## `ExtractionResult` — the response envelope

| Field | Type | Rules |
|-------|------|-------|
| `documentName` | string | Original filename |
| `pageCount` | integer ≥ 0 | Pages the document reports |
| `lineItems` | `LineItem[]` | May be empty |
| `refusals` | `Refusal[]` | May be empty |
| `ambiguities` | `Ambiguity[]` | May be empty |

**Invariant (FR-016)**: `lineItems` empty ⇒ `refusals` non-empty. A result that extracted
nothing and refused nothing is never valid output — it is the silent failure the whole
feature exists to prevent. Asserted in tests against `IB-55902.pdf`.

## Detector inputs — `StatedTotals`

Internal to the reconciliation step (R6), not part of the response. Every field optional;
each is an `EvidencedValue<number>` when present, because each is read literally off a page.

| Field | Example source line |
|-------|--------------------|
| `subtotal` | `Subtotal: $3,259.00` |
| `tax` | `GST (15%): $488.85` |
| `total` | `Total (incl GST): $3,747.85` or `Total: $2,050.00` |

Reconciliation compares only rungs that are present. `IB-56010` and `IB-STMT47` supply none,
so no comparison runs and no ambiguity is reported for them — absence of a total is not a
contradiction.

## Entity relationships

```text
ExtractionResult
├── lineItems[]     LineItem ──(id)──┐
│                    └── each field: EvidencedValue ── Evidence ──(page)──> page text
├── refusals[]      Refusal ─────────┘  links back by lineItemId + field
└── ambiguities[]   Ambiguity
                     ├── values[]: EvidencedValue ── Evidence ──(page)──> page text
                     └── computed?: { value, derivedFrom }   ← the only unevidenced number
```

## State transitions — a candidate's path to the result

```text
                    ┌─────────────────────────────────────────┐
raw page text ──►  candidate (from rules, or from LLM proposal) │
                    └──────────────────┬──────────────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │  verification gate (pure)    │
                        │  1. substring on claimed page│
                        │  2. occurs exactly once      │
                        │  3. value present in source  │
                        └───────┬──────────────┬───────┘
                          pass  │              │  fail
                                ▼              ▼
                    EvidencedValue on      Refusal with the
                    a LineItem             matching RefusalCode
```

A candidate has exactly two possible destinations. There is no third path, no fallback
branch, and no way to reach `lineItems` without passing the gate — which is Principle I
rendered as control flow.
