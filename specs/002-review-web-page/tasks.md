---
description: "Task list for the Review Web Page (Part B)"
---

# Tasks: Review Web Page (Part B)

**Input**: Design documents from `/specs/002-review-web-page/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks ARE included. SC-003 (reasons verbatim), SC-005 (four distinguishable
outcomes), SC-006 (zero banned phrases), SC-011 (every inline refusal also in the inventory)
and SC-012 (equal prominence) are only meaningful as assertions — checked by eye they will
pass on the day and regress the week after.

**Organization**: Grouped by user story. Each story is verifiable against captured real
responses or a fixture, without the extraction service running.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Paths are repo-relative and exact

## Path Conventions

`apps/web/` in the existing pnpm monorepo, per [plan.md](./plan.md). Part A lives in
`apps/extraction-api/` and is not modified by this feature.

---

## Phase 1: Setup

**Purpose**: Scaffold the web app inside the existing workspace. No feature logic.

- [X] T001 Create `apps/web/package.json` with `next`, `react`, `react-dom`, `tailwindcss`, and `@insta-quote/contracts` as a `workspace:*` dependency
- [X] T002 Add `apps/web/tsconfig.json` extending `tsconfig.base.json`, and register the app in the root `tsconfig.json` include list
- [X] T003 [P] Configure Tailwind in `apps/web/tailwind.config.ts` and `apps/web/app/globals.css`
- [X] T004 [P] Add `apps/web/next.config.ts` with `transpilePackages: ['@insta-quote/contracts']` so the shared Zod schemas resolve from source
- [X] T005 [P] Add React Testing Library and `jsdom` to the root dev dependencies, and add a `web` project with `environment: 'jsdom'` to `vitest.config.ts`
- [X] T006 Create `apps/web/.env.example` documenting `EXTRACTION_API_URL`, noting it is server-side only and never sent to the browser
- [X] T007 Create `apps/web/app/layout.tsx` and a placeholder `apps/web/app/page.tsx` that renders and nothing more

**Checkpoint**: `pnpm --filter @insta-quote/web dev` serves a page; `pnpm test` still passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The fixtures every test depends on, the state union FR-016 rests on, and the
transport hop. No rendering yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Fixtures — built first because everything is verified against them

- [X] T008 Write `apps/web/scripts/capture-corpus.mts` that runs Part A's `runExtraction` over all six sample PDFs and writes each result to `apps/web/tests/fixtures/corpus/<name>.json`
- [X] T009 Run the capture script and commit the six corpus responses under `apps/web/tests/fixtures/corpus/`
- [X] T010 [P] Author `apps/web/tests/fixtures/both-ambiguity-kinds.json` containing one `rounding_difference` and one `material_mismatch`, because no real document produces a rounding difference (research R1) and FR-028 is otherwise untestable
- [X] T011 [P] Author `apps/web/tests/fixtures/refusals-and-ambiguities.json` containing both in one result, because no real document contains both and SC-004 is otherwise untestable
- [X] T012 [P] Author `apps/web/tests/fixtures/unexplained-gap.json` with a line item missing a field that has no matching refusal — a contract violation the page must surface rather than render as a silent blank
- [X] T013 Write `apps/web/tests/unit/fixtures.test.ts` asserting every fixture and captured response parses against `ExtractionResultSchema` from `@insta-quote/contracts`, so a schema change breaks them instead of letting them drift

### File validation

- [X] T014 Implement `validateFile(file)` in `apps/web/src/validation/file.ts` — checks a file is selected, is non-empty, is within 20 MB, and begins with the bytes `%PDF-`; returns a named reason per failure
- [X] T015 [P] Write `apps/web/tests/unit/file-validation.test.ts` covering: no file, empty file, oversized file, a `.txt` file, and a text file renamed `.pdf` (which extension checking alone would wrongly accept)

### Page state and classification

- [X] T016 Define the `PageState` discriminated union in `apps/web/src/state/page-state.ts` with the seven variants from [data-model.md](./data-model.md) — `idle`, `file_rejected`, `processing`, `result`, `unreachable`, `bad_shape`, `service_rejected`
- [X] T017 Implement `classifyResponse(status, body)` in `apps/web/src/state/classify.ts` — a pure function mapping an HTTP status and body to exactly one non-`idle`, non-`processing` variant, validating success bodies with `ExtractionResultSchema`
- [X] T018 Write `apps/web/tests/unit/classify.test.ts` covering every row of the table in [contracts/proxy-route.md](./contracts/proxy-route.md): valid 200, 200 with HTML, 200 failing schema, 400 from the service, 504 unreachable, 504 timeout
- [X] T019 Implement `submit(file)` in `apps/web/src/state/submit.ts` — validate, post to `/api/extract`, classify the response, returning the next `PageState` and never throwing

### Transport hop

- [X] T020 Implement `POST /api/extract` in `apps/web/app/api/extract/route.ts` — forward the multipart body to `EXTRACTION_API_URL` and return the service's status and body unchanged, with a 60 s `AbortController` timeout
- [X] T021 Add the two authored responses in `apps/web/app/api/extract/route.ts` — `service_unreachable` on a rejected fetch and `service_timeout` on abort — and NO default catch-all mapping unrecognised conditions to a generic 500
- [X] T022 Write `apps/web/tests/integration/proxy-passthrough.test.ts` with a stubbed upstream, asserting a 400 `not_a_pdf` reaches the caller with its original status and its original message text — the test that stops the proxy becoming the point where four situations collapse into one

**Checkpoint**: Uploading a PDF returns a classified `PageState`. Nothing renders it yet.

---

## Phase 3: User Story 1 - Read the numbers and see where each came from (Priority: P1) 🎯 MVP

**Goal**: Extracted line items on screen, each value showing the page and source text that
supports it, with no interaction required.

**Independent Test**: Render the captured `IB-55871` response. Every value shows its page and
source text without clicking; the source text matches the document word for word.

### Tests for User Story 1

- [X] T023 [P] [US1] Write `apps/web/tests/components/line-item.test.tsx` asserting the `IB-55871` response renders 4 line items, each showing code, description, quantity, unit, unit price and amount
- [X] T024 [P] [US1] Add an assertion in `apps/web/tests/components/line-item.test.tsx` that every rendered source text is present in the DOM without any `details`, `hidden`, or collapsed ancestor — FR-006 is about no interaction, not about the string existing
- [X] T025 [P] [US1] Write `apps/web/tests/components/evidence-integrity.test.tsx` asserting each rendered source text equals the `evidence.sourceText` from the response character for character, with no truncation or ellipsis (FR-007)
- [X] T026 [P] [US1] Write `apps/web/tests/components/clean-result.test.tsx` asserting the `IB-55871` response renders no refusals section, no summary strip, no zero counts, and no warning or error styling (FR-014)

### Implementation for User Story 1

- [X] T027 [US1] Implement `toLineItemView(item, refusals)` in `apps/web/src/view/line-item-view.ts` — builds `values`, `missing`, and `sharedEvidence`, returning `sharedEvidence` only when every present value agrees
- [X] T028 [P] [US1] Implement money and quantity display formatting in `apps/web/src/view/format.ts` — cents to `$1,248.00` for the value only; the quoted source text is never reformatted
- [X] T029 [P] [US1] Implement field labelling in `apps/web/src/view/labels.ts` mapping `unitPrice` to "unit price" and so on, so no internal identifier reaches the screen (FR-021)
- [X] T030 [US1] Build `apps/web/src/components/LineItemCard.tsx` rendering values with the shared evidence quoted once beneath, and per-value evidence when `sharedEvidence` is null
- [X] T031 [US1] Build `apps/web/src/components/ResultView.tsx` rendering the line items section
- [X] T032 [US1] Build `apps/web/src/components/UploadForm.tsx` with a native `<input type="file">`, no form library
- [X] T033 [US1] Build `apps/web/src/components/Processing.tsx` naming the document being processed rather than showing an unlabelled spinner (FR-003)
- [X] T034 [US1] Wire `PageState` into `apps/web/app/page.tsx` so a real upload moves idle → processing → result

**Checkpoint**: Uploading `IB-55871.pdf` shows 4 fully evidenced line items and nothing else.

---

## Phase 4: User Story 2 - Understand what was not extracted, and why (Priority: P2)

**Goal**: Refusals as first-class content — inline against the missing value *and* in a
complete inventory, with reasons verbatim.

**Independent Test**: Render the captured `IB-56010` response. Each of the 4 rows shows its
amount as not extracted with the reason inline, and all 4 also appear in the inventory with
identical text.

### Tests for User Story 2

- [X] T035 [P] [US2] Write `apps/web/tests/components/inline-refusal.test.tsx` asserting the `IB-56010` response renders each row's missing amount with its reason inline within that row (FR-023)
- [X] T036 [P] [US2] Write `apps/web/tests/components/refusal-inventory.test.tsx` asserting every refusal in the response appears in the inventory, whatever its scope (FR-024)
- [X] T037 [P] [US2] Write `apps/web/tests/components/refusal-duplication.test.tsx` asserting each inline reason and its inventory entry are identical strings, and that neither is truncated or replaced by a reference such as "see below" (FR-025, FR-026, SC-011)
- [X] T038 [P] [US2] Write `apps/web/tests/components/reasons-verbatim.test.tsx` asserting every reason on screen appears character for character in the response, across all six captured responses (FR-009, SC-003)
- [X] T039 [P] [US2] Write `apps/web/tests/components/no-line-items.test.tsx` asserting the `IB-55902` response renders the refusal as primary content with no error styling and no apology wording (FR-013)
- [X] T040 [P] [US2] Write `apps/web/tests/components/unexplained-gap.test.tsx` asserting the `unexplained-gap.json` fixture renders the absent field as visibly unexplained rather than as a silent blank

### Implementation for User Story 2

- [X] T041 [US2] Extend `toLineItemView` in `apps/web/src/view/line-item-view.ts` to join absent fields to their refusals by `lineItemId` and `field`, and to mark an absent field with no matching refusal as unexplained
- [X] T042 [US2] Render `missing` entries inline in `apps/web/src/components/LineItemCard.tsx`, in the position the value would have occupied
- [X] T043 [US2] Build `apps/web/src/components/RefusalInventory.tsx` listing every refusal with what it concerns and the reason verbatim
- [X] T044 [US2] Render page- and document-scoped refusals in `apps/web/src/components/RefusalInventory.tsx` with the page named in plain language
- [X] T045 [US2] Handle the zero-line-item case in `apps/web/src/components/ResultView.tsx` so refusals become the primary content rather than a secondary note (FR-013)

**Checkpoint**: `IB-56010.pdf` and `IB-55902.pdf` render per [contracts/result-view.md](./contracts/result-view.md).

---

## Phase 5: User Story 3 - Tell a contradiction apart from something unreadable (Priority: P3)

**Goal**: Contradictions as their own distinct thing, every conflicting value evidenced, no
winner nominated, and severities labelled but never ranked.

**Independent Test**: Render `both-ambiguity-kinds.json`. Both contradictions have the same
height and indentation, both are labelled, neither is collapsed.

### Tests for User Story 3

- [X] T046 [P] [US3] Write `apps/web/tests/components/ambiguity.test.tsx` asserting the `IB-56150` response renders one contradiction showing all three stated figures with their pages and source texts (FR-011)
- [X] T047 [P] [US3] Add an assertion in `apps/web/tests/components/ambiguity.test.tsx` that no conflicting value carries a "correct", "selected", or emphasised treatment that the others lack (FR-012)
- [X] T048 [P] [US3] Write `apps/web/tests/components/ambiguity-prominence.test.tsx` against `both-ambiguity-kinds.json` asserting the two kinds render with equal class-derived size and indentation, neither inside a collapsed element, and neither reordered ahead of the other (FR-028, FR-029, SC-012)
- [X] T049 [P] [US3] Write `apps/web/tests/components/refusal-vs-ambiguity.test.tsx` against `refusals-and-ambiguities.json` asserting the two are rendered in separate labelled regions distinguishable without reading their detail text (FR-010, SC-004)

### Implementation for User Story 3

- [X] T050 [US3] Build `apps/web/src/components/AmbiguityCard.tsx` rendering the fact, every conflicting value with its page and source text, and the reason verbatim
- [X] T051 [US3] Render `computed` in `apps/web/src/components/AmbiguityCard.tsx` visibly marked as calculated with its `derivedFrom` text, so the one figure without page evidence is never mistaken for something printed on the document
- [X] T052 [US3] Implement severity labelling in `apps/web/src/components/AmbiguityCard.tsx` using identical size, spacing and expansion state for both kinds, differing only in label text and a non-hierarchical accent (FR-027, FR-028)
- [X] T053 [US3] Render contradictions in `apps/web/src/components/ResultView.tsx` in their own labelled region, preserving the order received with no severity-based sorting (FR-029)
- [X] T054 [P] [US3] Add `apps/web/app/dev/fixtures/[name]/page.tsx` rendering any fixture by name, so the equal-prominence rule can be inspected without the extraction service running

**Checkpoint**: `IB-56150.pdf`, `IB-56088.pdf` and both fixtures render correctly.

---

## Phase 6: User Story 4 - Know which thing went wrong (Priority: P4)

**Goal**: Four situations, four visibly different outcomes, no generic message anywhere.

**Independent Test**: Trigger each of the four states and confirm four distinct messages,
none sharing text and none containing a banned phrase.

### Tests for User Story 4

- [X] T055 [P] [US4] Write `apps/web/tests/components/failure-states.test.tsx` rendering all four failure variants and asserting their user-visible text is pairwise distinct (FR-016, SC-005)
- [X] T056 [P] [US4] Write `apps/web/tests/components/no-generic-errors.test.tsx` rendering every `PageState` variant and asserting the text contains none of "something went wrong", "an error occurred", "unexpected error" (FR-017, SC-006)
- [X] T057 [P] [US4] Write `apps/web/tests/components/no-internal-identifiers.test.tsx` asserting that across all six captured responses no rendered text contains a line item id such as `p1-r2`, a refusal code such as `value_not_provided`, or a raw field name such as `unitPrice` (FR-021)
- [X] T058 [P] [US4] Write `apps/web/tests/components/recover-after-failure.test.tsx` asserting each failure state offers another upload without a page reload (FR-020, SC-009)

### Implementation for User Story 4

- [X] T059 [P] [US4] Build `apps/web/src/components/states/FileRejected.tsx` showing the validation reason and keeping the upload form usable
- [X] T060 [P] [US4] Build `apps/web/src/components/states/Unreachable.tsx` naming the extraction service as unreachable
- [X] T061 [P] [US4] Build `apps/web/src/components/states/BadShape.tsx` naming a reply that could not be understood — wording clearly different from `Unreachable.tsx`
- [X] T062 [P] [US4] Build `apps/web/src/components/states/ServiceRejected.tsx` showing the extraction service's own message verbatim
- [X] T063 [US4] Render the four variants from `apps/web/app/page.tsx` by exhaustive switch on `PageState`, with no shared error component and no default branch
- [X] T064 [US4] Surface `file_rejected` from `apps/web/src/components/UploadForm.tsx` before any request is sent, and add a test asserting no `fetch` occurs for an invalid file (FR-002, SC-008)

**Checkpoint**: All four failure states render differently; the banned-phrase test passes.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T065 Implement `ResultSummary` derivation in `apps/web/src/view/result-summary.ts` with `hasNothingToFlag`, and render `apps/web/src/components/ResultSummary.tsx` only when there is something to flag (FR-014)
- [X] T066 Order contradictions and refusals above the line items in `apps/web/src/components/ResultView.tsx`, so `IB-STMT47`'s single refusal is not buried beneath 21 rows (research R7)
- [X] T067 [P] Write `apps/web/tests/components/burial.test.tsx` asserting that for the `IB-STMT47` response the refusal region precedes the line items region in document order
- [X] T068 [P] Add a long-source-text case to `apps/web/tests/components/line-item.test.tsx` confirming the layout holds without truncating the quoted text
- [X] T069 [P] Make `apps/web/app/page.tsx` and the result components usable at tablet width; phone widths are not a target
- [X] T070 [P] Add `apps/web/vercel.json` and document the `EXTRACTION_API_URL` production value in `apps/web/.env.example`
- [X] T071 Update the root `README.md` with a Part B section: how to run both halves, the state walkthrough table from [quickstart.md](./quickstart.md), and its five limitations
- [X] T072 Record in `README.md` that equal prominence across contradiction severities is verified against a fixture rather than a real document, since no sample produces a rounding difference
- [X] T073 Update the constitution audit table in `README.md` — Principle IV is currently marked "unproven for the UI, because the UI does not exist yet", which this feature is what settles

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on US1 — T041/T042 extend `line-item-view.ts` and `LineItemCard.tsx`
- **US3 (Phase 5)**: depends on Foundational; touches `ResultView.tsx`, which US1 creates
- **US4 (Phase 6)**: depends on Foundational only — the failure components share no files with US1–US3 and are the most independent story here
- **Polish (Phase 7)**: depends on US1–US3 for the ordering and summary work

### Within each story

- Tests first, failing, before implementation
- Fixtures before any test that renders one
- View derivation before the component that renders it
- Classification (T016–T018) before any failure component, so the four situations exist as
  data before anything draws them

### Parallel Opportunities

- T003, T004, T005 in Setup
- T010, T011, T012 (three fixture files) in Foundational
- All of T023, T024, T025, T026 (US1 tests, separate files)
- All of T035–T040 (US2 tests, separate files)
- All of T046–T049 (US3 tests, separate files)
- All of T055–T058 (US4 tests) and all of T059–T062 (four independent components)
- T067, T068, T069, T070 in Polish

US4 is genuinely parallelisable against US1–US3: different files, no shared state beyond the
union defined in Foundational. If two people work on this, that is the split.

## Parallel Example: User Story 4

```bash
# Four failure components, four files, no shared dependencies:
Task: "Build src/components/states/FileRejected.tsx"
Task: "Build src/components/states/Unreachable.tsx"
Task: "Build src/components/states/BadShape.tsx"
Task: "Build src/components/states/ServiceRejected.tsx"
```

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Phase 1: Setup
2. Phase 2: Foundational — fixtures, validation, state classification, transport
3. Phase 3: US1
4. **STOP and VALIDATE**: upload `IB-55871.pdf`, see 4 line items each showing its page and
   source text, with no refusals section implying a problem
5. That alone is a working reviewer's page for clean documents

### Incremental Delivery

1. Setup + Foundational → uploads classify correctly, nothing renders
2. + US1 → evidenced line items on screen (MVP)
3. + US2 → refusals inline and in the inventory; the zero-item document reads as information
4. + US3 → contradictions distinct, severities labelled but not ranked
5. + US4 → four failure states, none generic
6. + Polish → ordering, summary, README

## Notes

- Every component test runs against a captured real response or a checked-in fixture. No
  test starts the extraction service and none makes a network call
- `IB-55871.pdf` is the control for this feature too: 4 line items, **no summary strip, no
  refusals section, no warning styling**. A page that decorates a clean result has regressed
- The two fixtures exist because measurement showed the corpus cannot reach those states
  (research R1). Deleting them silently removes the only coverage FR-028 and SC-004 have
- Commit after each task or logical group


---

## Implementation record (2026-09-22)

All 73 tasks complete. **205 tests pass** across both apps (113 API, 92 web), no network
calls, no API key required. `next build` succeeds and both halves were verified running
together.

### A Part A bug this feature found

`AmbiguitySchema` required `values.min(2)`, but a total-versus-sum conflict often has one
printed figure and a computed sum on the other side. Part A detected such a contradiction
correctly and then threw while validating its own response — an HTTP 500 in place of a real
finding. No sample document hits it (`IB-56088`, the only single-total document, adds up
exactly), so it survived all 110 of Part A's tests.

It surfaced when `refusals-and-ambiguities.json` — written to look like a plausible response
— failed schema validation. Fixed in `packages/contracts/src/ambiguity.ts`: the invariant is
now `values.length + (computed ? 1 : 0) >= 2`. Regression test at
`apps/extraction-api/tests/unit/ambiguity/single-stated-total.test.ts`.

### Four things planning did not anticipate

1. **Vitest 2.x uses `workspace`, not `projects`.** The per-environment config was silently
   ignored and no web test ran at all until `vitest.workspace.ts` was added (T005).
2. **`import.meta.url` is not a `file:` URL under jsdom**, so fixture loading had to resolve
   from the vitest root instead (T013).
3. **jsdom's `Blob.slice()` has no `arrayBuffer()`**, so the magic-byte read needed a
   FileReader path to work in both the browser and tests (T014).
4. **Next's webpack does not resolve `./x.js` to `x.tsx`.** Rather than degrade the shared
   package's ESM-correct specifiers, `next.config.ts` declares an `extensionAlias` (T004).

### One test that was nearly wrong

`line-item.test.tsx` originally asserted the source text was present in the DOM. That would
pass with the evidence inside a collapsed `<details>`, which is exactly what FR-006 forbids.
It now asserts no collapsed or hidden ancestor.
