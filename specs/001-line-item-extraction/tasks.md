---
description: "Task list for Line-Item Extraction Service (Part A)"
---

# Tasks: Line-Item Extraction Service (Part A)

**Input**: Design documents from `/specs/001-line-item-extraction/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks ARE included. The constitution requires the verification gate to have
direct unit tests with fixed text fixtures and no live API calls, and SC-010 requires every
refusal case and both ambiguity kinds to be covered. Tests are not optional for this feature.

**Organization**: Tasks are grouped by user story so each story can be implemented and
verified independently against the real sample corpus.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Paths are repo-relative and exact

## Path Conventions

Monorepo per [plan.md](./plan.md): `apps/extraction-api/src/`, `packages/contracts/src/`,
tests under `apps/extraction-api/tests/`. `apps/web` is Part B and out of scope here.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo skeleton and tooling. No feature logic.

- [X] T001 Create pnpm workspace root: `package.json` (private, `packages/*` + `apps/*`), `pnpm-workspace.yaml`, `.gitignore` (node_modules, dist, .env)
- [X] T002 [P] Add root `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, ES2022 target, and `exactOptionalPropertyTypes: true`
- [X] T003 [P] Configure Vitest at the workspace root in `vitest.config.ts` with projects for `apps/extraction-api` and `packages/contracts`
- [X] T004 [P] Configure linting and formatting in `eslint.config.js` and `.prettierrc`
- [X] T005 Scaffold `packages/contracts/package.json` and `apps/extraction-api/package.json` with deps from plan.md: `fastify`, `@fastify/multipart`, `pdfjs-dist@^4.10`, `zod`, `openai`, `vitest`
- [X] T006 Add `.env.example` to `apps/extraction-api/` documenting `OPENAI_API_KEY` and `PORT`, and note that the test suite never reads the key

**Checkpoint**: `pnpm install` succeeds and `pnpm test` runs (zero tests).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared contract, the canonical page text, and the verification gate. Every
user story depends on all three.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. The gate is
built and proven here, before any candidate producer exists, so that no code path can ever
reach `lineItems` without passing it.

### Shared contract

- [X] T007 Define `Evidence` and `EvidencedValue<T>` Zod schemas in `packages/contracts/src/evidence.ts` per data-model.md — `evidence` is required, with no evidence-optional variant
- [X] T008 [P] Define `RefusalCode` enum (the eight cases) and `Refusal` schema in `packages/contracts/src/refusal.ts`
- [X] T009 [P] Define `Ambiguity` schema in `packages/contracts/src/ambiguity.ts` with `kind`, `type`, `fact`, `values[]`, optional `computed` — and deliberately no `resolved`/`preferred`/`bestGuess` field
- [X] T010 Define `LineItem` and `ExtractionResult` schemas in `packages/contracts/src/result.ts`, monetary values as integer cents
- [X] T011 Export all schemas and inferred types from `packages/contracts/src/index.ts`

### Canonical page text

- [X] T012 Implement `extractPageTexts(buffer)` in `apps/extraction-api/src/pdf/page-text.ts` using `pdfjs-dist` — cluster text items by rounded `transform[5]`, sort each row by `transform[4]`, join cells with a single space and rows with `\n`; return `Map<number, string>`
- [X] T013 Wrap per-page extraction in `apps/extraction-api/src/pdf/page-text.ts` so one failing page yields an empty string for that page and never aborts the document (Principle III)
- [X] T014 [P] Write `apps/extraction-api/tests/corpus/page-text.test.ts` asserting against the real corpus: `IB-55871` page 1 contains the exact row `FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00`; `IB-55902` page 1 is empty; `IB-STMT47` has 8 pages with page 4 empty and pages 1–3, 5–8 non-empty

### The verification gate

- [X] T015 Implement `verify(candidates, pageTexts)` in `apps/extraction-api/src/gate/verify.ts` as a pure function per contracts/verification-gate.md — checks 0–3 in order, first failure wins, never throws, no framework/pdfjs/OpenAI imports
- [X] T016 Implement the bounded value normalization for gate check 3 in `apps/extraction-api/src/gate/normalize.ts` — strip currency symbol, thousands separators and surrounding whitespace for the value-vs-source comparison ONLY; never applied to page text
- [X] T017 Write `apps/extraction-api/tests/unit/verify.test.ts` covering all nine cases in contracts/verification-gate.md with hand-written strings: present-once accepted; absent → `source_text_not_found`; page missing from map; page text empty; occurs twice → `source_text_ambiguous`; value absent from its own source text → `value_not_in_source_text`; normalized match accepted; empty `claimedSourceText` refused without throwing; whitespace-differing source text refused
- [X] T018 Add an explicit test in `apps/extraction-api/tests/unit/verify.test.ts` named for the hallucination case: a candidate claiming amount `4000` quoting the `IB-56010` washers row is refused, proving a computed-but-unprinted number cannot pass
- [X] T019 Add a lint rule or test in `apps/extraction-api/tests/unit/gate-purity.test.ts` asserting `src/gate/verify.ts` imports nothing from `fastify`, `pdfjs-dist`, or `openai`, so the constitution's "framework-free" requirement is enforced mechanically rather than by convention

### Refusal reason strings

- [X] T020 Implement the reason-string catalog in `apps/extraction-api/src/refusals/reasons.ts` — one display-ready, merchant-readable string builder per `RefusalCode`, exactly as tabulated in data-model.md
- [X] T021 [P] Write `apps/extraction-api/tests/unit/reasons.test.ts` asserting every `RefusalCode` maps to a non-empty string, that each names its specific page/field, and that no string contains generic phrasing ("error", "failed", "something went wrong")

### Service skeleton

- [X] T022 Create the Fastify app factory in `apps/extraction-api/src/server.ts` with no side effects on import, registering `@fastify/multipart` with a 20 MB limit
- [X] T023 Create the deploy entry point in `apps/extraction-api/src/index.ts` that only calls `listen()` — the single deploy-specific file, with no Vercel serverless handler
- [X] T024 Add `POST /extract` in `apps/extraction-api/src/routes/extract.ts` accepting one multipart file, calling `extractPageTexts`, and returning a valid empty `ExtractionResult` envelope validated against the shared schema

**Checkpoint**: The gate is implemented and fully tested with zero PDFs and zero network.
`curl -F file=@sample-files-variant/IB-55871.pdf localhost:3001/extract` returns a
well-formed empty envelope. User stories can now begin.

---

## Phase 3: User Story 1 - Extract line items with traceable evidence (Priority: P1) 🎯 MVP

**Goal**: Return line items where every value carries a page number and a literal,
uniquely-occurring source text from that page.

**Independent Test**: Upload `IB-55871.pdf`. All 4 line items return with every field
evidenced, and every `sourceText` is found verbatim exactly once on the page it claims.

### Tests for User Story 1

> Write these first; they must fail before implementation.

- [X] T025 [P] [US1] Write `apps/extraction-api/tests/corpus/us1-clean-invoice.test.ts` asserting `IB-55871.pdf` yields exactly 4 line items with `code`, `description`, `quantity`, `unit`, `unitPrice`, `amount` all present and evidenced
- [X] T026 [P] [US1] Add an evidence-audit helper in `apps/extraction-api/tests/helpers/audit-evidence.ts` that, for any result, re-extracts page text and asserts every `sourceText` occurs exactly once on its claimed page — the machine form of SC-001
- [X] T027 [P] [US1] Write `apps/extraction-api/tests/corpus/us1-page-attribution.test.ts` asserting `IB-STMT47.pdf` line items report the page they actually appear on (pages 1–3, 5–8), not page 1 for everything

### Implementation for User Story 1

- [X] T028 [US1] Implement the six-column row parser in `apps/extraction-api/src/candidates/rules.ts` — anchored pattern for `<CODE> <description> <qty> <unit> $<unitPrice> $<amount>` over clustered rows, emitting one `Candidate` per field with the whole row as `claimedSourceText`
- [X] T029 [US1] Add header and separator detection in `apps/extraction-api/src/candidates/rules.ts` so column-header and dashed-rule lines are never parsed as line items
- [X] T030 [US1] Implement currency and quantity parsing to integer cents in `apps/extraction-api/src/candidates/parse-values.ts` (`$1,248.00` → `124800`)
- [X] T031 [US1] Assemble accepted gate output into `LineItem` records in `apps/extraction-api/src/pipeline/assemble.ts`, grouping accepted values by `lineItemId` and preserving page order
- [X] T032 [US1] Wire rules → gate → assemble into `POST /extract` in `apps/extraction-api/src/routes/extract.ts`, returning real `lineItems`
- [X] T033 [P] [US1] Write `apps/extraction-api/tests/unit/rules.test.ts` with fixed row strings covering a valid row, a header row, a separator row, and a row with a missing trailing amount

**Checkpoint**: `IB-55871.pdf` returns 4 fully evidenced line items and `IB-STMT47.pdf`
returns 21 with correct page numbers. US1 is independently demonstrable.

---

## Phase 4: User Story 2 - Specific, named reason for anything not extracted (Priority: P2)

**Goal**: Every value that cannot be evidenced becomes a refusal naming the item, the field,
and a reason from the fixed set — while the readable parts of the same row still return.

**Independent Test**: Upload `IB-56010.pdf`. Quantities and unit prices return with
evidence; each row's absent amount returns as a `value_not_provided` refusal; the computed
`$40.00` for 2000 washers at `$0.02` appears nowhere in the response.

### Tests for User Story 2

- [X] T034 [P] [US2] Write `apps/extraction-api/tests/corpus/us2-no-amount-column.test.ts` asserting `IB-56010.pdf` returns 4 line items with evidenced `quantity` and `unitPrice`, and 4 `value_not_provided` refusals for the missing amounts
- [X] T035 [P] [US2] Add an assertion to that test that the string `40.00` and the value `4000` appear nowhere in the serialized response — the anti-computation guard for the washers row
- [X] T036 [P] [US2] Write `apps/extraction-api/tests/corpus/us2-image-only.test.ts` asserting `IB-55902.pdf` returns HTTP 200, zero line items, and exactly one `no_text_on_page` refusal for page 1
- [X] T037 [P] [US2] Write `apps/extraction-api/tests/unit/refusal-coverage.test.ts` asserting every one of the eight `RefusalCode` values is produced by at least one test in the suite — the machine form of SC-010

### Implementation for User Story 2

- [X] T038 [US2] Implement the partial-row invariant in `apps/extraction-api/src/pipeline/assemble.ts`: for every field absent from a `LineItem`, emit a `scope: 'value'` refusal naming its `lineItemId` and `field`; never emit a null, zero, or empty string
- [X] T039 [US2] Emit `no_text_on_page` refusals in `apps/extraction-api/src/pipeline/assemble.ts` for every page whose canonical text is empty
- [X] T040 [US2] Detect the no-amount-column layout in `apps/extraction-api/src/candidates/rules.ts` and classify each row's missing amount as `value_not_provided` rather than `source_text_not_found`, so a priceless docket is not reported as damaged
- [X] T041 [US2] Surface gate refusals into the response in `apps/extraction-api/src/pipeline/assemble.ts` so `source_text_not_found`, `source_text_ambiguous`, and `value_not_in_source_text` reach the caller with their reason strings intact
- [X] T042 [US2] Enforce the FR-016 invariant in `apps/extraction-api/src/pipeline/assemble.ts`: if `lineItems` is empty, `refusals` MUST be non-empty; add a document-scoped refusal if no other refusal explains the emptiness
- [X] T043 [US2] Define the LLM boundary interface `CandidateProposer` in `apps/extraction-api/src/candidates/proposer.ts` so tests can inject a fake and no suite ever calls OpenAI

> The two tasks below are the last implementation work in this story, deliberately. Everything
> above must be green first, so the model can never be the reason a number reaches the response.

- [X] T044 [US2] Implement the OpenAI structured-output proposer in `apps/extraction-api/src/candidates/llm.ts` behind `CandidateProposer`, with a JSON schema requiring `claimedPage` and `claimedSourceText` on every proposed field
- [X] T045 [US2] Escalate to the proposer in `apps/extraction-api/src/pipeline/run.ts` only for pages where the rules parser matched no rows, and route its output through the identical gate call as the rules path
- [X] T046 [P] [US2] Write `apps/extraction-api/tests/unit/llm-gated.test.ts` with a fake proposer returning one valid candidate and one fabricated candidate, asserting the fabricated one is refused and never appears in `lineItems`

**Checkpoint**: `IB-56010.pdf` and `IB-55902.pdf` behave as specified in quickstart.md, and
`IB-55871.pdf` still returns zero refusals.

---

## Phase 5: User Story 3 - Contradictions surfaced, never resolved (Priority: P3)

**Goal**: Report document self-contradictions as explicit ambiguities carrying every
conflicting value with its own evidence, nominating no winner.

**Independent Test**: Upload `IB-56150.pdf`. One `material_mismatch` ambiguity reports the
stated total `$1,501.80` against subtotal `$1,270.00` plus GST `$190.50` = `$1,460.50`, a
difference of `$41.30`, and neither figure is presented as the answer.

### Tests for User Story 3

- [X] T047 [P] [US3] Write `apps/extraction-api/tests/corpus/us3-total-mismatch.test.ts` asserting `IB-56150.pdf` yields exactly one `total_vs_sum` ambiguity of kind `material_mismatch` with the three evidenced values and `computed.value === 146050`
- [X] T048 [P] [US3] Write `apps/extraction-api/tests/corpus/us3-control-no-false-positive.test.ts` asserting `IB-55871.pdf` yields **zero** ambiguities — the regression guard against naively comparing a line sum to a tax-inclusive total
- [X] T049 [P] [US3] Write `apps/extraction-api/tests/unit/ambiguity/rounding.test.ts` with synthetic stated totals proving the FR-025 boundary: a difference of exactly `$0.01 × lineItemCount` is `rounding_difference`, one cent more is `material_mismatch`, and both are reported
- [X] T050 [P] [US3] Write `apps/extraction-api/tests/unit/ambiguity/no-totals.test.ts` asserting a document with no stated subtotal, tax, or total produces no `total_vs_sum` ambiguity — absence is not a contradiction

### Implementation for User Story 3

- [X] T051 [US3] Implement stated-total detection in `apps/extraction-api/src/ambiguity/stated-totals.ts` — read `Subtotal:`, `GST (...):`, `Total (incl GST):`, and bare `Total:` lines into evidenced values, each optional
- [X] T052 [US3] Implement ladder reconciliation in `apps/extraction-api/src/ambiguity/totals.ts` — compare line sum to stated subtotal, then stated subtotal plus stated tax to stated total, skipping any rung the document omits and never computing a tax figure
- [X] T053 [US3] Classify each difference as `rounding_difference` or `material_mismatch` in `apps/extraction-api/src/ambiguity/totals.ts` using the `$0.01 × lineItemCount` threshold in integer cents
- [X] T054 [US3] Populate `computed.derivedFrom` in `apps/extraction-api/src/ambiguity/totals.ts` so the one unevidenced number in the system is explicitly labelled with its derivation
- [X] T055 [P] [US3] Implement conflicting-unit-price detection in `apps/extraction-api/src/ambiguity/unit-prices.ts` for the same product code stated at differing prices within one document
- [X] T056 [US3] Implement conflicting-stated-totals detection in `apps/extraction-api/src/ambiguity/totals.ts` for two differing figures both labelled as the document total
- [X] T057 [US3] Wire all detectors into `apps/extraction-api/src/pipeline/run.ts` so they execute regardless of whether candidates came from the rules or LLM path
- [X] T058 [US3] Write reason strings for both ambiguity kinds in `apps/extraction-api/src/ambiguity/reasons.ts`, display-ready and naming both conflicting figures with their amounts

**Checkpoint**: `IB-56150.pdf` reports the mismatch, `IB-55871.pdf` reports nothing, and no
ambiguity anywhere carries a preferred value.

---

## Phase 6: User Story 4 - One bad page does not lose the rest (Priority: P4)

**Goal**: A corrupt page, a corrupt row, or a bad upload never costs the caller the rest of
the document.

**Independent Test**: Upload `IB-STMT47.pdf`. 21 line items return from the seven readable
pages and page 4 produces its own page-scoped refusal, with HTTP 200.

### Tests for User Story 4

- [X] T059 [P] [US4] Write `apps/extraction-api/tests/corpus/us4-blank-page.test.ts` asserting `IB-STMT47.pdf` returns 21 line items and exactly one page-scoped `no_text_on_page` refusal naming page 4
- [X] T060 [P] [US4] Write `apps/extraction-api/tests/unit/fault-isolation.test.ts` with a page-text map where one page throws on access, asserting other pages' line items still return and the failure becomes a `page_unreadable` refusal
- [X] T061 [P] [US4] Write `apps/extraction-api/tests/integration/upload-errors.test.ts` covering no file part, two file parts, an empty file, a non-PDF file, and an oversized file — each returning the status and display-ready message from contracts/extract-api.md

### Implementation for User Story 4

- [X] T062 [US4] Wrap per-row candidate parsing in `apps/extraction-api/src/candidates/rules.ts` so one unparseable row becomes a `lineItem`-scoped refusal and its neighbours on the same page still parse
- [X] T063 [US4] Wrap per-page processing in `apps/extraction-api/src/pipeline/run.ts` so a page-level throw becomes a `page_unreadable` refusal and other pages continue
- [X] T064 [US4] Implement upload validation in `apps/extraction-api/src/routes/extract.ts` — exactly one file, non-empty, PDF magic bytes, ≤ 20 MB, ≤ 50 pages — returning `400`/`413` with display-ready messages
- [X] T065 [US4] Handle the encrypted-PDF case in `apps/extraction-api/src/routes/extract.ts` as HTTP 200 with a `document_encrypted` refusal, distinct from the non-PDF `400`, per contracts/extract-api.md
- [X] T066 [US4] Add a top-level error boundary in `apps/extraction-api/src/routes/extract.ts` guaranteeing any accepted upload returns a schema-valid envelope rather than an unhandled 500

**Checkpoint**: All six sample documents return results matching the quickstart.md table.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T067 Write `README.md` at the repo root covering setup, run, test, and deploy, and carrying all five known limitations verbatim from quickstart.md — the row-clustering heuristic, no OCR, single-supplier rules tuning, the closed noun list, and tax figures compared but never validated (Principle V)
- [X] T068 Name `IB-56010.pdf` in `README.md` as the document that forced LLM escalation, with the three structural reasons from research.md R3, as the constitution requires
- [X] T069 [P] Add `scripts/dump-page-text.mjs` so a reviewer can print any PDF's canonical page text and hand-verify that a returned `sourceText` really is on the page it claims
- [X] T070 [P] Write `apps/extraction-api/tests/corpus/determinism.test.ts` running all six documents ten times and asserting identical classification and page numbers for every value (FR-021, FR-022, FR-023, SC-008)
- [X] T071 [P] Add a deploy config for Railway/Render in `apps/extraction-api/` with a health-check route in `src/routes/health.ts`, confirming no Vercel-specific entry point exists
- [X] T072 [P] Add a timing assertion to `apps/extraction-api/tests/corpus/samples.test.ts` that `IB-STMT47.pdf` (8 pages) completes within 30 s with the proposer faked (SC-009)
- [X] T073 Run a final constitution audit against `.specify/memory/constitution.md` and record the result in `README.md`, listing anything deliberately unimplemented rather than leaving it to be discovered

---

## Conflicting-count detection (unblocked)

- [X] T074 [US3] Implement conflicting-stated-count detection in `apps/extraction-api/src/ambiguity/counts.ts` over the closed noun list (`carton`, `pallet`, `box`, `item`, `package` and plurals), reporting `conflicting_counts` as a `material_mismatch` with both statements evidenced
- [X] T075 [P] [US3] Write `apps/extraction-api/tests/corpus/us3-conflicting-counts.test.ts` asserting `IB-56088.pdf` yields one `conflicting_counts` ambiguity for "9 cartons dispatched" vs "11 cartons picked and loaded", alongside its 3 cleanly-reconciling line items

**Resolved 2026-09-22**: the user asked for all tasks to be implemented, so FR-015 was
amended to add the fourth detector and FR-015a was added to record the narrative-lines-only
constraint. That constraint was not anticipated during planning — the first implementation
read line-item rows too and flagged `IB-55871.pdf` (the clean control) as disagreeing with
itself about boxes, because two rows quantify `24 box` and `10 box`. See research.md R7.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational; T038/T040/T041 extend files US1 creates, so US2 follows US1 in practice
- **US3 (Phase 5)**: depends on Foundational and on US1 (needs line items to sum)
- **US4 (Phase 6)**: depends on Foundational; its fault-isolation wrappers touch files from US1 and US2
- **Polish (Phase 7)**: depends on all four stories

### Within each user story

- Tests first, failing, before implementation
- Contract schemas before the code that produces them
- The gate before any candidate producer — non-negotiable, it is the ordering that makes
  Principle I structural rather than procedural
- The LLM proposer (T044–T046) last within US2, after every rules-path test is green

### Parallel Opportunities

- T002, T003, T004 in Setup
- T008, T009 in Foundational (separate schema files); T014 and T021 alongside gate work
- All of T025, T026, T027 (US1 tests, separate files)
- All of T034, T035, T036, T037 (US2 tests, separate files)
- All of T047, T048, T049, T050 (US3 tests, separate files); T055 alongside T051–T054
- All of T059, T060, T061 (US4 tests, separate files)
- T069, T070, T071, T072 in Polish

Different stories cannot easily run in parallel across developers here: US2, US3, and US4 all
extend `pipeline/assemble.ts` and `pipeline/run.ts`. Sequential P1 → P2 → P3 → P4 is the
realistic order for one developer, which matches the take-home's scope.

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (they fail until T028–T032 land):
Task: "Write tests/corpus/us1-clean-invoice.test.ts asserting IB-55871 yields 4 evidenced line items"
Task: "Add tests/helpers/audit-evidence.ts re-verifying every sourceText against its page"
Task: "Write tests/corpus/us1-page-attribution.test.ts asserting IB-STMT47 page numbers"
```

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Phase 1: Setup
2. Phase 2: Foundational — **the gate is proven here, before anything can produce candidates**
3. Phase 3: US1
4. **STOP and VALIDATE**: `IB-55871.pdf` returns 4 fully evidenced line items; the evidence
   audit helper passes; `IB-STMT47.pdf` attributes pages correctly
5. This is already a defensible submission: it extracts nothing it cannot prove

### Incremental Delivery

1. Setup + Foundational → gate proven, empty envelope returned
2. + US1 → evidenced extraction on 32 of the corpus's 36 line items (MVP)
3. + US2 → refusals, the no-price docket, the image-only scan, and the gated LLM path
4. + US3 → ambiguities, with the control document still clean
5. + US4 → fault isolation across pages and malformed uploads
6. + Polish → README honesty, determinism proof, deploy config

Each step leaves the previous ones working and adds an observable behavior on a real file.

## Notes

- [P] tasks touch different files and have no incomplete dependencies
- Every corpus test asserts against the expectation table in quickstart.md — that table is
  the acceptance criteria in executable form
- `IB-55871.pdf` is the control: it must return 4 line items, **0 refusals, 0 ambiguities**
  at every checkpoint. A detector that flags it is too eager and has regressed
- Commit after each task or logical group
- No test in any suite may make a live OpenAI call


---

## Implementation record (2026-09-22)

All 75 tasks complete. **108 tests pass**, no network calls, no API key required.

Four things were discovered during implementation that planning did not anticipate:

1. **Substring matching let a fabricated number through.** The gate's own hallucination test
   failed on first run: the invented amount `$40.00` passed because `40` appears inside the
   weight `640g`. Fixed with whole-token matching.
2. **Token matching alone was still not enough.** `$640.00` then passed by matching the
   weight token `640`. Monetary values now require a currency-marked token (T015/T016).
3. **The counts detector flagged the clean control document.** Reading line-item rows, it saw
   `24 box` and `10 box` on `IB-55871.pdf` and reported a contradiction. Narrowed to
   narrative lines only, recorded as FR-015a (T074).
4. **pdfjs detaches the buffer it is given**, which broke the independent evidence audit on
   its second read. `page-text.ts` now copies before handing the data over (T012).

One planning claim was corrected rather than implemented: research.md R3 said `IB-56010.pdf`
defeats the rules parser. A second rule shape handles it, so all 36 corpus line items are
extracted deterministically. Recorded in research.md and the README.
