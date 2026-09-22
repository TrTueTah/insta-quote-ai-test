# Contract: Result View

**Feature**: `002-review-web-page`
**Role**: what the person sees when a result comes back. This is the contract the feature is
judged on.

## Ordering

When a result has refusals or ambiguities:

```
┌────────────────────────────────────────────────┐
│ Summary: N line items · N not extracted · N    │  always visible, links to each section
│          contradictions                        │
├────────────────────────────────────────────────┤
│ Contradictions   (if any)                      │  above the line items, deliberately
├────────────────────────────────────────────────┤
│ Not extracted    (if any)  — full inventory    │
├────────────────────────────────────────────────┤
│ Line items                                     │
└────────────────────────────────────────────────┘
```

When a result has neither: **only the line items render.** No summary strip, no empty
sections, no zero counts, no warning styling (FR-014).

Refusals and ambiguities sit above the line items because `IB-STMT47.pdf` returns 21 items
and one refusal; below, that refusal is off-screen. FR-005 forbids requiring interaction to
reveal any of the three, and scrolling past 21 rows is interaction.

## Line item

```
┌────────────────────────────────────────────────────────────────┐
│ FX-402   Washers, assorted, loose                              │
│ Qty 2000 ea      Unit price $0.02      Amount —  NOT EXTRACTED │
│                                        This document does not  │
│                                        state an amount for     │
│                                        FX-402 on page 1 — the  │
│                                        information is absent   │
│                                        from the page rather    │
│                                        than unreadable.        │
│ ── from page 1 ────────────────────────────────────────────────│
│ "FX-402 Washers, assorted, loose 2000 640g total $0.02 /ea"    │
└────────────────────────────────────────────────────────────────┘
```

| Rule | Requirement |
|---|---|
| Evidence is visible without interaction | FR-006 |
| Source text shown in full, never truncated or reformatted | FR-007 |
| Shared evidence rendered once per item; per-value when they differ | research R2 |
| A missing value shows its reason **inline**, against that value | FR-023 |
| The same refusal also appears in the inventory | FR-024 |
| Inline and inventory carry identical reason text | FR-025 |
| Neither is shortened to a reference like "see below" | FR-026 |
| Money formatted for display; the quoted source text never reformatted | FR-007 |

## Refusal inventory

Every refusal in the result, whatever its scope — line-item, page, document. Each shows what
it concerns and the reason verbatim.

When a result has **no line items at all** (`IB-55902.pdf`), this is the primary content and
reads as an informative outcome, not an apology or an error (FR-013).

## Contradictions

```
┌────────────────────────────────────────────────────────────────┐
│ [ROUNDING DIFFERENCE]        document total                    │
│                                                                │
│   stated subtotal   $1,270.00   page 1                         │
│   "Subtotal: $1,270.00"                                        │
│   stated tax          $190.50   page 1                         │
│   "GST (15%): $190.50"                                         │
│   stated total      $1,501.80   page 1                         │
│   "Total (incl GST): $1,501.80"                                │
│                                                                │
│   calculated        $1,460.50   ← not from the document        │
│                     (stated subtotal plus stated tax)          │
│                                                                │
│   <reason, verbatim>                                           │
└────────────────────────────────────────────────────────────────┘
```

| Rule | Requirement |
|---|---|
| The kind is labelled on every contradiction | FR-027 |
| Both kinds: identical size, reading position, expansion state | FR-028 |
| Differ only by label text and a non-hierarchical accent | FR-028 |
| No sorting, grouping or styling that ranks the kinds | FR-029 |
| Every conflicting value with its page and source text | FR-011 |
| No value marked, ordered or styled as the answer | FR-012 |
| `computed` visibly marked as calculated, with its derivation | data-model |

**No corpus document produces a `rounding_difference`**, so this is verified against
`both-ambiguity-kinds.json`.

## Language

| Rule | Requirement |
|---|---|
| Reasons rendered exactly as the service supplied them | FR-009, FR-022, SC-003 |
| No field identifiers, status codes or internal names on screen | FR-021 |
| `p1-r2`, `value_not_provided`, `unitPrice` never displayed | FR-021 |
| Field names shown as "unit price", "amount", "quantity" | FR-021 |
