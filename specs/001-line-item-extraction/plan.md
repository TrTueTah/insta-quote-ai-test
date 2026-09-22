# Implementation Plan: Line-Item Extraction Service (Part A)

**Branch**: `001-line-item-extraction` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-line-item-extraction/spec.md`

## Summary

Accept one uploaded PDF and return `{ lineItems, refusals, ambiguities }` where every
returned value carries a page number and a literal, uniquely-occurring substring of that
page's text as evidence. Anything that cannot be evidenced becomes a named refusal from a
fixed set of eight cases; anything the document contradicts itself about becomes an explicit
ambiguity that never nominates a winner.

Technical approach: extract per-page text deterministically with `pdfjs-dist`, clustering
text items into rows by y-coordinate to produce each page's canonical text. Propose
candidate line items with regex rules first, escalating to an OpenAI structured-output call
only for the one sample layout that demonstrably defeats rules (`IB-56010.pdf`). Pass **every**
candidate from both paths through one pure verification gate that checks the claimed source
text against the claimed page. Run deterministic ambiguity detectors independently of which
path produced the candidates.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 20+ LTS (local dev verified on Node v25.9.0)
**Primary Dependencies**: Fastify, `@fastify/multipart`, `pdfjs-dist@^4.10`, `zod`, `openai`
**Storage**: None — nothing is persisted; uploads are processed in memory and discarded
**Testing**: Vitest. Gate tests use fixed string fixtures; pipeline tests run the real
sample corpus with the LLM boundary faked. Zero live API calls in any suite
**Target Platform**: Plain Node server, deploy-target-agnostic (Railway/Render), no
serverless-specific entry point
**Project Type**: pnpm monorepo — `apps/extraction-api`, `apps/web` (Part B), `packages/contracts`
**Performance Goals**: A ≤ 10-page document returns within 30 s (SC-009). Corpus max is 8
pages / 186 KB, so extraction is milliseconds; the LLM call dominates when it fires
**Constraints**: ≤ 20 MB, ≤ 50 pages per upload. No OCR. No persistence. No auth
**Scale/Scope**: One document per request. Six-document acceptance corpus, 36 line items

No `NEEDS CLARIFICATION` items remain — FR-021/FR-022 were resolved with the user before
planning, and all Phase 0 unknowns are closed in [research.md](./research.md) R8.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*Source: `.specify/memory/constitution.md` v1.0.0. Principles I and IV admit no justified
violation — a design that requires violating them is rejected, not tracked below.*

**Initial evaluation (pre-Phase 0): PASS.**
**Post-design re-evaluation (post-Phase 1): PASS**, with one scope addition tracked below.

- [x] **I. Evidence or refusal**: `EvidencedValue<T>` requires `evidence` — the type system
      admits no evidence-free value ([data-model.md](./data-model.md)). Absent fields always
      have a matching refusal. No default, zero, or null fill-in path exists.
- [x] **I. Same gate for every path**: rules and LLM both emit the identical `Candidate`
      shape; the gate cannot distinguish them
      ([contracts/verification-gate.md](./contracts/verification-gate.md)). The gate is the
      only writer of `lineItems`.
- [x] **II. Ambiguity is typed separately**: `Ambiguity` is a third top-level collection
      with no `resolved`/`preferred`/`bestGuess` field, so FR-014 cannot be violated without
      changing the schema.
- [x] **III. Fault isolation**: refusals carry `scope: document | page | lineItem | value`.
      Page extraction and per-row parsing are each wrapped; the gate never throws.
      `IB-STMT47.pdf` page 4 is the live test.
- [x] **IV. Reason strings survive to the UI**: `reason` is specified as display-ready and
      passed through verbatim; the contract states that re-bucketing is a violation.
- [x] **IV. Shared contract**: Zod schemas live only in `packages/contracts` and are
      imported by both apps. Part B validates before rendering.
- [x] **Tests**: the gate has direct unit tests with fixed text fixtures, including a
      candidate that fails the substring check, one that occurs twice, and the
      hallucinated-value case. No live API calls.
- [x] **V. README honesty**: five known limitations are already written down in
      [quickstart.md](./quickstart.md) for transfer to the README, including the row-clustering
      heuristic and the single-supplier tuning of the rules path. `IB-56010.pdf` is named as
      the escalation trigger with three concrete structural reasons.
- [x] **Deploy-target-agnostic API**: plain Fastify, no Vercel serverless entry point.

## Project Structure

### Documentation (this feature)

```text
specs/001-line-item-extraction/
├── plan.md                        # This file
├── spec.md                        # Feature specification
├── research.md                    # Phase 0 output — corpus survey, extractor decision
├── data-model.md                  # Phase 1 output — entities, refusal codes, invariants
├── quickstart.md                  # Phase 1 output — run/test, per-document expectations
├── contracts/
│   ├── extract-api.md             # POST /extract request/response contract
│   └── verification-gate.md       # the pure gate's signature and test obligations
├── checklists/
│   └── requirements.md            # spec quality checklist (16/16 pass)
└── tasks.md                       # Phase 2 output — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/
└── extraction-api/
    ├── src/
    │   ├── server.ts              # Fastify app factory (no side effects on import)
    │   ├── index.ts               # listen() — the only deploy-specific file
    │   ├── routes/
    │   │   └── extract.ts         # POST /extract — multipart in, envelope out
    │   ├── pdf/
    │   │   └── page-text.ts       # pdfjs-dist + y-clustering → canonical page text
    │   ├── candidates/
    │   │   ├── rules.ts           # regex row parser (the six-column shape)
    │   │   └── llm.ts             # OpenAI structured-output proposer (behind an interface)
    │   ├── gate/
    │   │   └── verify.ts          # THE GATE — pure, no framework imports
    │   ├── ambiguity/
    │   │   ├── totals.ts          # stated-ladder reconciliation (R6)
    │   │   ├── unit-prices.ts     # conflicting unit prices for one item
    │   │   └── counts.ts          # conflicting stated counts (R7)
    │   └── refusals/
    │       └── reasons.ts         # the eight codes → display-ready strings
    └── tests/
        ├── unit/
        │   ├── verify.test.ts     # gate, fixed strings, no PDFs, no network
        │   ├── rules.test.ts
        │   └── ambiguity/*.test.ts
        └── corpus/
            └── samples.test.ts    # the six real PDFs, LLM faked

packages/
└── contracts/
    └── src/index.ts               # Zod: Evidence, EvidencedValue, LineItem, Refusal,
                                   # RefusalCode, Ambiguity, ExtractionResult
```

`apps/web` is Part B and out of scope for this feature.

**Structure Decision**: pnpm monorepo as mandated by the constitution's tech stack. Within
`extraction-api`, modules are split along the pipeline's four stages so the gate can be
imported and tested with no Fastify, no pdfjs, and no OpenAI in scope — the constitution
requires it to be "framework-free, unit-testable in isolation", and directory structure is
what makes that claim enforceable rather than aspirational.

## Phase 2 preview — implementation ordering

Not generated here (that is `/speckit-tasks`), but the dependency spine is fixed by the
design:

1. `packages/contracts` — nothing typechecks without it.
2. `gate/verify.ts` + its unit tests — the constitutional heart, and it needs no PDF, no
   server, and no model, so it can and should be built and proven first.
3. `pdf/page-text.ts` — canonical page text, the gate's other input.
4. `candidates/rules.ts` — covers 32 of 36 corpus line items.
5. Route wiring — first end-to-end result.
6. Ambiguity detectors — independent of the candidate path.
7. `candidates/llm.ts` — last, because everything above must already be green without it.

Building the gate before the LLM is deliberate: it makes it impossible to ship a path where
model output reaches the response ungated.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. One item recorded because it **exceeds the spec as written** and
needs the user's decision:

| Item | Why needed | Simpler alternative rejected because |
|------|-----------|-------------------------------------|
| Fourth ambiguity detector: `conflicting_counts` (research.md R7) | `IB-56088.pdf` states "9 cartons dispatched" and "11 cartons picked and loaded". Its monetary figures reconcile perfectly, so every detector FR-015 mandates passes it cleanly and the planted contradiction is reported nowhere | Leaving it undetected and listing it as a README limitation is permitted and honest. Rejected because the corpus plants this conflict in the one document whose numbers are otherwise flawless, which reads as a direct test of whether Principle II was implemented narrowly or genuinely. **Requires amending FR-015 to add a fourth detector** |
| Gate checks 2 and 3 beyond the constitutional substring check (research.md R4) | `IB-STMT47.pdf` repeats `$60.00` on all seven readable pages, so a bare-fragment `sourceText` substring-matches while identifying no row | Substring-only is the constitutional minimum and would pass. Rejected because it lets a candidate satisfy the gate with evidence that proves nothing. Both additions are strictly stronger than the minimum, so this is not a deviation — it is recorded for visibility |
