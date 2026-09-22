# Phase 0 Research: Review Web Page (Part B)

**Feature**: `002-review-web-page` | **Date**: 2026-09-22
**Input**: [spec.md](./spec.md) | **Governing**: [constitution.md](../../.specify/memory/constitution.md) v1.0.0
**Upstream**: [Part A](../001-line-item-extraction/spec.md), merged to `main`

Findings below come from running the real Part A pipeline over the real sample corpus, not
from reading its types.

## R1. What Part A actually returns — measured

```
IB-55871   items= 4  partial=0  refusals=0 (lineItem-scoped=0)  ambiguities=0
IB-56010   items= 4  partial=4  refusals=4 (lineItem-scoped=4)  ambiguities=0
IB-56088   items= 3  partial=0  refusals=0 (lineItem-scoped=0)  ambiguities=1 [material_mismatch]
IB-56150   items= 4  partial=0  refusals=0 (lineItem-scoped=0)  ambiguities=1 [material_mismatch]
IB-STMT47  items=21  partial=0  refusals=1 (lineItem-scoped=0)  ambiguities=0
IB-55902   items= 0  partial=0  refusals=1 (lineItem-scoped=0)  ambiguities=0
```

**Three consequences for this feature, none of them obvious from the spec:**

1. **Only `IB-56010.pdf` exercises inline refusals.** FR-023's inline-and-inventory rule —
   the thing Q1 was decided about — is demonstrated by exactly one document in the corpus.
2. **No corpus document produces a `rounding_difference`.** Both ambiguities are
   `material_mismatch`. FR-028, which requires the two severities to be given equal visual
   prominence, **cannot be demonstrated against any real sample.**
3. **No corpus document contains refusals and ambiguities at the same time.** SC-004 asks a
   person to tell one from the other on screen; no real document puts both there.

**Decision**: Build the page against the corpus for the states it covers, and add two
**fixture responses** — checked-in JSON conforming to the shared schema — for the two states
it does not: a result containing both a rounding difference and a material mismatch, and a
result containing refusals and ambiguities together.

**Rationale**: FR-028 and SC-004 are the two requirements most likely to be silently dropped,
because nothing in normal testing would reveal their absence. A fixture makes them visible in
development and assertable in tests.

**Alternatives considered**: Adding a sample PDF that triggers a rounding difference.
Rejected — it would mean authoring a PDF to provoke Part A behavior, and the fixture tests
Part B's rendering, which is the actual subject here.

## R2. Evidence layout — one source text per line item, measured

For all 29 line items across `IB-55871`, `IB-56010` and `IB-STMT47`, **every field of a line
item shares one identical `sourceText`** — the whole clustered row it was read from. Zero
items had fields with differing evidence. The longest source text in the corpus is 64
characters.

**Decision**: Render evidence **once per line item**, as a quoted row directly beneath that
item's values, showing the page number alongside. When an item's fields do have differing
source texts, fall back to rendering evidence per value.

**Rationale**: Repeating the identical 64-character string six times per row would triple the
height of every line item and bury the refusals below the fold — which would satisfy FR-006
literally while defeating FR-005 by layout. The spec's edge case about long results burying
refusals is exactly this failure. One shared quote keeps the connection obvious (FR-006) and
the page compact.

The fallback matters because the shared-evidence property is a measured fact about the
current corpus, not a guarantee of Part A's contract. An LLM-proposed row could carry
differing excerpts per field, and the page must not then show one value's evidence against
another's.

**Alternatives considered**: Evidence per value always (rejected: layout cost above);
evidence behind a hover or expander (rejected outright — FR-006 requires no interaction).

## R3. Where the UI talks to the extraction service

The web app is deployed to Vercel and the extraction service to Railway/Render, so they are
on different origins.

**Decision**: The browser posts to a route handler in the web app, which forwards the upload
to the extraction service and returns its response. The route handler is a **transport hop
only**: it passes the extraction service's status code and body through unchanged, and adds
nothing of its own except when it could not reach the service at all.

**Rationale**: Avoids configuring CORS on the extraction service (a change to Part A for the
benefit of Part B), keeps the service URL server-side, and means one place to enforce the
timeout.

**The risk this creates, stated plainly**: a proxy is precisely where Principle IV gets
violated. The natural thing to write is a `try/catch` that turns every failure into one 500,
which would collapse FR-016's four situations into one and make the whole feature fail. The
contract in [contracts/proxy-route.md](./contracts/proxy-route.md) therefore fixes the
pass-through rule explicitly, and a test asserts that an extraction-service 400 reaches the
browser with its original status and message.

**Alternatives considered**: Browser calling the extraction service directly. Rejected for
CORS and URL exposure, though it is genuinely simpler and would remove the collapse risk
entirely — recorded here because it is the better choice if the proxy ever grows logic.

## R4. Distinguishing four failure situations at the point they occur

FR-016 requires four situations never to share a message. Each is detectable at a different
point, and the classification must happen once rather than being re-derived:

| Situation | Where detected | How |
|---|---|---|
| File cannot be submitted | Browser, before any request | No file, empty file, or not a PDF by extension and magic bytes |
| Service unreachable / timed out | Route handler | `fetch` rejects, or the 60s abort fires |
| Response does not match expected shape | Browser, after parsing | The shared Zod schema fails, or a 200 body is not JSON |
| Service refused specific content | Neither — this is a success | A valid result carrying refusals/ambiguities, rendered normally |

Plus a fifth the spec folds into the third: the extraction service itself rejecting the
upload with a 4xx (a non-PDF that passed the browser's check, an oversized file). That
carries the service's own display-ready message and is shown as-is.

**Decision**: Model the page as an explicit discriminated union of states, with one variant
per situation, and render each from its own component. No shared "error" component with a
message prop.

**Rationale**: A single error component with a message prop is how four situations become one
in practice — the next person adds a default case. Separate variants make collapsing them a
visible change rather than an omission. FR-017's ban on generic phrasing is then testable by
searching the rendered output of every state.

**Alternatives considered**: A single error state carrying a discriminating code. Rejected —
it keeps the four situations one refactor away from sharing a message.

## R5. Magic-byte checking in the browser

FR-002 requires the file to be rejected before any request is sent. Extension checking alone
is insufficient: a `.pdf` extension on a text file would pass the browser and fail at the
service, which is the round trip FR-002 exists to prevent.

**Decision**: Read the first five bytes in the browser and require `%PDF-`, alongside checks
for a file being selected, non-empty, and within the size limit.

**Rationale**: Matches the extraction service's own check exactly, so the two cannot
disagree. Cheap — five bytes, no full read.

**Alternatives considered**: Trusting the file extension or the browser-reported MIME type.
Both are supplied by the client OS and are wrong often enough to produce the round trip
FR-002 forbids.

## R6. Displaying refusals twice without the duplication reading as a bug

FR-023 through FR-026 require every line-item refusal inline *and* in the inventory, with the
tidy-up explicitly forbidden. The measured cost on `IB-56010.pdf`:

```
[p1-r1.amount] This document does not state an amount for FX-401 on page 1 — the information is absent from the page rather than unreadable.
[p1-r2.amount] This document does not state an amount for FX-402 on page 1 — the information is absent from the page rather than unreadable.
[p1-r3.amount] This document does not state an amount for AD-118 on page 1 — the information is absent from the page rather than unreadable.
[p1-r4.amount] This document does not state an amount for AD-119 on page 1 — the information is absent from the page rather than unreadable.
```

**Worth correcting an earlier concern**: these four reasons are *not* identical — each names
its own product code. The repetition is between the inline copy and the inventory copy of the
same sentence, not four copies of one sentence. That is considerably less jarring than
expected when the decision was made.

**Decision**: Inline, render the reason against the missing value inside the line item.
In the inventory, render the same sentence with the item it belongs to. Both verbatim, both
full length, per FR-025 and FR-026.

**Rationale**: The two placements answer two different questions — "why is this number
missing?" and "how much did this document not give me?" — and a reader uses only one at a
time, so the redundancy costs less on screen than it does on paper.

## R7. Making a 21-item result not bury the refusals

`IB-STMT47.pdf` returns 21 line items and one page-scoped refusal. Rendered as one long list
with refusals beneath, the refusal sits well below the fold — satisfying FR-005's markup
requirement while defeating its intent, which the spec names as an edge case.

**Decision**: A result summary strip at the top of the result, always visible, stating the
counts in all three categories and linking to each section. Refusals and ambiguities are
placed **above** the line items in the reading order when either is non-empty.

**Rationale**: FR-005 says none of the three may require interaction to reveal. Scrolling
past 21 rows is interaction. Ordering by what the reader most needs to know — what is missing
or contradictory — rather than by what is most numerous is what makes "first-class" true in
layout rather than only in markup.

Note this does not conflict with FR-014: when there are no refusals and no ambiguities, no
empty sections and no summary counts of zero are rendered at all.

**Alternatives considered**: A sticky sidebar (rejected: a second navigation model for a
single-screen page); tabs (rejected outright — a tab is a collapsed section, which FR-005
forbids).

## R8. Resolved unknowns

| Unknown | Resolution |
|---|---|
| Framework | Next.js App Router + React + Tailwind, per the constitution's tech stack |
| Schema validation in the UI | `@insta-quote/contracts`, imported for real (constitution) |
| Transport | Route handler proxy, pass-through only (R3) |
| Timeout | 60 s, per the spec's assumption, enforced in the route handler |
| Evidence layout | Once per line item, with a per-value fallback (R2) |
| States not covered by the corpus | Two checked-in fixture responses (R1) |
| Test approach | Component tests against fixtures + the six real corpus responses |

No `NEEDS CLARIFICATION` items remain.
