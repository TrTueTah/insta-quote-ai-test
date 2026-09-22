# Phase 1 Data Model: Review Web Page (Part B)

**Feature**: `002-review-web-page` | **Date**: 2026-09-22
**Source**: [spec.md](./spec.md) Key Entities + [research.md](./research.md)

Part B introduces **no new data**. Everything displayed comes from `@insta-quote/contracts`,
imported for real from the same package the extraction service uses. What is modelled here is
the page's own state and the view shapes derived from a result.

## `PageState` — the discriminated union FR-016 rests on

Exactly one variant is active at a time. Each renders from its own component; there is no
shared error component with a message prop, because that is how four situations become one
(research R4).

| Variant | Carries | Rendered by | Requirement |
|---|---|---|---|
| `idle` | — | the upload form alone | — |
| `file_rejected` | `reason: string` | the upload form, with the reason attached | FR-002, FR-016.3 |
| `processing` | `fileName: string` | a state naming what is happening to that document | FR-003 |
| `result` | `ExtractionResult` | the full result view | FR-005..FR-015 |
| `unreachable` | — | its own message, naming the service as unreachable | FR-016.1 |
| `bad_shape` | `detail: string` | its own message, naming an unreadable reply | FR-016.2, FR-019 |
| `service_rejected` | `message: string` (from the service, verbatim) | its own message | FR-016.3 |

`service_rejected` is the fifth situation the spec folds into FR-016.3: the extraction
service declining the upload itself (a non-PDF that passed the browser's check, an oversized
file). Its `message` is display-ready and shown unaltered, exactly like a refusal reason.

**Invariants**:

- Every variant is reachable from `idle`, and every terminal variant returns to a state from
  which another upload can be attempted without reloading (FR-020, SC-009).
- No two variants may produce the same user-facing sentence (FR-016, SC-005).
- No variant's text may contain "something went wrong", "an error occurred", or "unexpected
  error" (FR-017, SC-006). Asserted across every variant, not per component.

### State transitions

```text
idle ──select file──► (browser validation, FR-002)
                        │                    │
                    rejected               valid
                        ▼                    ▼
                 file_rejected          processing ──┐
                        │                            │
                        └────select again────────────┤
                                                     │
        ┌──────────────┬──────────────┬──────────────┤
        ▼              ▼              ▼              ▼
    unreachable    bad_shape   service_rejected   result
        │              │              │              │
        └──────────────┴──────────────┴──────────────┘
                              │
                     select another file
                              ▼
                           processing
```

A refusal or an ambiguity **never** appears in this diagram as a failure. They arrive inside
`result` and are rendered as content (FR-016.4).

## Imported from `@insta-quote/contracts` — not redefined

`ExtractionResult`, `LineItem`, `Refusal`, `RefusalCode`, `Ambiguity`, `Evidence`,
`EvidencedValue`, `ApiError`. The page validates every response against
`ExtractionResultSchema` before rendering (FR-019); a parse failure produces `bad_shape`.

Part B **must not** define its own copy of any of these, nor widen them locally. The
constitution requires the schemas to be a single source of truth imported by both apps.

## `LineItemView` — derived for rendering, never for meaning

A presentation-only projection of one `LineItem`, computed with its related refusals.

| Field | Type | Derivation |
|---|---|---|
| `id` | string | from the line item |
| `page` | number | from the line item |
| `values` | `Array<{ field, label, display, evidence }>` | one entry per field the item carries |
| `missing` | `Array<{ field, label, reason }>` | one entry per field absent from the item, with the reason from its matching refusal |
| `sharedEvidence` | `Evidence \| null` | the single evidence all present values agree on, else `null` |

**`missing` is how FR-015 and FR-023 are held.** It is built by joining the item's absent
fields to the refusals carrying that `lineItemId` and `field`. The join happens once, so the
person never performs it themselves.

**If an absent field has no matching refusal**, `missing` still gets an entry, flagged as
unexplained. Part A guarantees this cannot happen; the page surfaces it rather than rendering
a silent gap if it ever does. An unexplained gap is precisely the failure both features exist
to prevent, so the page does not quietly tidy one away.

**`sharedEvidence` is `null` when values disagree**, and evidence then renders per value
(research R2). Measured across the corpus, all 29 line items share one evidence string, but
the page does not assume it.

**Money formatting**: values arrive as integer cents. The page formats for display only —
`124800` → `$1,248.00` — and the evidence quoted beside it is the untouched source text. The
formatted number is a rendering of the value; the source text is the proof, and it is never
reformatted (FR-007).

## `ResultSummary` — derived, and conditional

| Field | Type | Notes |
|---|---|---|
| `lineItemCount` | number | |
| `refusalCount` | number | every refusal, line-item and page and document scoped |
| `ambiguityCount` | number | |
| `hasNothingToFlag` | boolean | `refusalCount === 0 && ambiguityCount === 0` |

When `hasNothingToFlag` is true the summary strip, the refusals section and the ambiguities
section are **not rendered at all** — no empty sections, no zero counts, no warning styling
(FR-014). A clean document must not be made to look like it has open questions.

Otherwise the summary renders at the top, and refusals and ambiguities are ordered **above**
the line items (research R7), so a 21-item result cannot bury a single refusal below the
fold.

## Ambiguity presentation

`Ambiguity.kind` is `rounding_difference` or `material_mismatch`.

| Rule | Requirement |
|---|---|
| The kind is shown as a label on every ambiguity | FR-027 |
| Both kinds get identical size, reading position and expansion state | FR-028 |
| They may differ only by label text and a non-hierarchical accent | FR-028 |
| No sorting, grouping, or styling that ranks one kind | FR-029 |
| Every conflicting value shown with its page and source text | FR-011 |
| No value marked, ordered, or styled as the answer | FR-012 |

`Ambiguity.computed` — the one figure in the system without page evidence — is rendered with
its `derivedFrom` text and **visibly marked as calculated rather than quoted**, so it is not
mistaken for something printed on the document.

**No corpus document produces a `rounding_difference`** (research R1), so FR-028 is
demonstrable only against the fixture described below.

## Fixtures — for the states the corpus cannot reach

Checked in as JSON validated against `ExtractionResultSchema` at test time, so a change to
the shared schema breaks them rather than letting them drift.

| Fixture | Contains | Exists because |
|---|---|---|
| `both-ambiguity-kinds.json` | one `rounding_difference` and one `material_mismatch` | no real document produces a rounding difference (FR-028, SC-012) |
| `refusals-and-ambiguities.json` | refusals and ambiguities in one result | no real document contains both (SC-004) |
| `unexplained-gap.json` | a line item with an absent field and no matching refusal | proves the page surfaces a contract violation rather than rendering a silent gap |

The six real corpus responses are captured alongside them and used for every other state.
