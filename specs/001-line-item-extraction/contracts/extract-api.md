# Contract: `POST /extract`

**Feature**: `001-line-item-extraction` | **Consumer**: `apps/web` (Part B) and any API client
**Schema source of truth**: `packages/contracts` (Zod). This document describes the same
shapes in prose; the Zod schemas are authoritative and are imported by both apps.

## Request

```http
POST /extract
Content-Type: multipart/form-data
```

| Part | Type | Rules |
|------|------|-------|
| `file` | PDF | Single file, ≤ 20 MB, ≤ 50 pages |

Exactly one file per request. Batch upload is out of scope.

## Response — `200 OK`

Returned for **every accepted upload**, including documents where nothing could be
extracted. `application/json`:

```jsonc
{
  "documentName": "IB-55871.pdf",
  "pageCount": 1,
  "lineItems": [
    {
      "id": "p1-r1",
      "page": 1,
      "code":        { "value": "FX-201", "evidence": { "page": 1, "sourceText": "FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00" } },
      "description": { "value": "Framing nail gun coil, 90mm galv", "evidence": { "page": 1, "sourceText": "FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00" } },
      "quantity":    { "value": 24, "evidence": { "page": 1, "sourceText": "FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00" } },
      "unit":        { "value": "box", "evidence": { "page": 1, "sourceText": "FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00" } },
      "unitPrice":   { "value": 5200, "evidence": { "page": 1, "sourceText": "FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00" } },
      "amount":      { "value": 124800, "evidence": { "page": 1, "sourceText": "FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00" } }
    }
  ],
  "refusals": [],
  "ambiguities": []
}
```

**Monetary values are integer cents.** `124800` is `$1,248.00`. Quantities are plain numbers.

### Guarantees the consumer can rely on

1. Every `EvidencedValue` present in `lineItems` passed the verification gate. Its
   `evidence.sourceText` is a literal, uniquely-occurring substring of page
   `evidence.page`'s extracted text.
2. A field absent from a `LineItem` always has a corresponding entry in `refusals` naming
   that `id` and field. Absence is never unexplained.
3. `lineItems` empty implies `refusals` non-empty.
4. `refusal.reason` and `ambiguity.reason` are **display-ready strings**. The consumer
   renders them verbatim. Re-wording, re-bucketing, or replacing them with a generic
   message is a constitution violation (Principle IV).
5. No `Ambiguity` nominates a winning value. Any UI that picks one to display as "the"
   answer violates FR-014.

## Response — error statuses

An error status is returned **only** when no result could be produced at all. Anything that
can be expressed as a refusal is a `200` with refusals, not an error.

| Status | When | Body |
|--------|------|------|
| `400` | No file part, more than one file, empty file, not a PDF, over size/page limit | `{ "error": { "code": ..., "message": ... } }` |
| `413` | Upload exceeds 20 MB | same shape |
| `500` | Unexpected internal failure | same shape |

`message` is display-ready, for the same reason `refusal.reason` is. A `400` for a
non-PDF upload says `This file could not be opened as a PDF.` — not `validation error`.

Note the deliberate split: a **password-protected PDF** returns `200` with a
`document_encrypted` refusal, because the document was accepted and the reason is specific
and document-scoped. A **non-PDF file** returns `400`, because it never became a document.

## Worked examples from the sample corpus

### `IB-56150.pdf` — material mismatch

Four line items extracted normally. Plus:

```jsonc
"ambiguities": [
  {
    "kind": "material_mismatch",
    "type": "total_vs_sum",
    "fact": "document total",
    "values": [
      { "value": 127000, "evidence": { "page": 1, "sourceText": "Subtotal: $1,270.00" } },
      { "value": 19050,  "evidence": { "page": 1, "sourceText": "GST (15%): $190.50" } },
      { "value": 150180, "evidence": { "page": 1, "sourceText": "Total (incl GST): $1,501.80" } }
    ],
    "computed": { "value": 146050, "derivedFrom": "stated subtotal plus stated GST" },
    "reason": "The stated total of $1,501.80 does not match the subtotal of $1,270.00 plus GST of $190.50, which comes to $1,460.50 — a difference of $41.30."
  }
]
```

### `IB-56010.pdf` — values the document does not provide

Quantities, units of weight, and unit prices extract with evidence. Every row additionally
produces:

```jsonc
{ "scope": "value", "page": 1, "lineItemId": "p1-r2", "field": "amount",
  "code": "value_not_provided",
  "reason": "This document does not state a line amount for FX-402 — it lists a unit price only." }
```

The washers row is the sharpest case: quantity `2000` and unit price `$0.02` are both
evidenced, and the product `$40.00` appears nowhere on the page, so it is refused rather
than computed.

### `IB-55902.pdf` — image-only scan

```jsonc
{ "documentName": "IB-55902.pdf", "pageCount": 1, "lineItems": [], "ambiguities": [],
  "refusals": [
    { "scope": "page", "page": 1, "code": "no_text_on_page",
      "reason": "Page 1 contains no extractable text — it may be a scanned image. Reading text from scanned pages is not supported." }
  ] }
```

`200`, not an error. The document was readable; its content was not.

### `IB-STMT47.pdf` — page-scoped fault isolation

21 line items from pages 1–3 and 5–8, plus one page-scoped refusal for page 4. The other
seven pages are unaffected, which is FR-018.

## Versioning

Additive changes only within this feature. Any change to `Evidence`, to the `RefusalCode`
set, or to the `Ambiguity` shape is a breaking change for Part B and requires updating
`packages/contracts` and both consumers together.
