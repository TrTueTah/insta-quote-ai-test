# Contract: `POST /api/extract` (web app route handler)

**Feature**: `002-review-web-page`
**Role**: transport hop between the browser and the extraction service. Nothing else.

## Why this has its own contract

A proxy is exactly where Principle IV — "the API response is the contract with the UI" —
gets violated. The natural implementation is a `try/catch` that turns every failure into one
500 with a generic message, which collapses FR-016's four situations into one and defeats the
feature. This contract fixes the pass-through rule so that collapsing it becomes a visible
change rather than an omission.

## Request

```http
POST /api/extract
Content-Type: multipart/form-data
```

One part, `file`, containing a PDF. Forwarded unchanged to the extraction service's
`POST /extract`.

## Behaviour — exhaustive

| The extraction service… | The route handler returns | Browser maps to |
|---|---|---|
| responds `200` with a body | **that exact status and body**, unmodified | `result`, after schema validation |
| responds `4xx` with `{ error: { code, message } }` | **that exact status and body**, unmodified | `service_rejected`, showing `message` verbatim |
| responds `5xx` | **that exact status and body**, unmodified | `service_rejected`, showing `message` verbatim |
| cannot be reached (DNS, refused, network) | `504` with `{ error: { code: "service_unreachable", message: … } }` | `unreachable` |
| does not respond within 60 s | `504` with `{ error: { code: "service_timeout", message: … } }` | `unreachable` |
| responds with a non-JSON body | **that exact status and the raw body**, unmodified | `bad_shape` |

### Rules

1. **The handler MUST NOT re-word, re-code, or re-classify** any message the extraction
   service produced. Its reason strings are display-ready and belong to the person.
2. **The handler MUST NOT validate the result schema.** Validation happens once, in the
   browser, so there is one place where `bad_shape` is decided. A handler that also validated
   would give two components the power to disagree.
3. **The handler MUST NOT add a default catch-all** that maps unrecognised conditions to a
   generic 500. The table above is exhaustive; anything outside it is a bug to fix, not a
   case to absorb.
4. `service_unreachable` and `service_timeout` are the **only** bodies the handler authors.
   Both are display-ready sentences naming what happened.
5. The extraction service's URL comes from server-side configuration and is never sent to the
   browser.

### Tests this contract requires

| Case | Assertion |
|---|---|
| Service returns 200 + valid result | Browser receives the identical body |
| Service returns 400 `not_a_pdf` | Browser receives status 400 and the service's own message, not a rewritten one |
| Service unreachable | Browser receives 504 `service_unreachable`, distinct from the 400 case |
| Service exceeds 60 s | Browser receives 504 `service_timeout` |
| Service returns 200 with HTML | Browser receives it and classifies `bad_shape` |
| Every response the handler can produce | Contains none of the banned generic phrases (FR-017) |
