# Implementation Plan: Review Web Page (Part B)

**Branch**: `002-review-web-page` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-review-web-page/spec.md`

## Summary

A single-screen page where someone uploads a PDF and sees the extraction result: line items
with the page and source text proving each value, refusals naming what was not extracted and
why, and contradictions shown as their own distinct thing — all three as first-class content,
never behind a click.

Technical approach: a Next.js App Router page holding an explicit discriminated union of
states, one component per state, so FR-016's four situations cannot collapse into a shared
error message. Uploads go through a route handler that is a transport hop only, passing the
extraction service's status and body through unchanged. Every response is validated against
`@insta-quote/contracts` — the same Zod schemas the extraction service uses — before
rendering, and a mismatch is its own named state rather than a partial render.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 15 (App Router)
**Primary Dependencies**: `next`, `react`, `tailwindcss`, `@insta-quote/contracts`, `zod`
**Storage**: None. Nothing is persisted; a reload loses the result
**Testing**: Vitest + React Testing Library, against captured corpus responses and three
fixtures. No network calls in any suite
**Target Platform**: Desktop and tablet browsers. Phone-sized layouts are not a target
**Project Type**: Web app in the existing pnpm monorepo — `apps/web`
**Performance Goals**: Result renders as soon as it arrives; the in-progress state is built
for the tens of seconds a model-assisted extraction can take
**Constraints**: 60 s request timeout. One file per submission. No auth, no history
**Scale/Scope**: One document at a time. Largest corpus result is 21 line items

No `NEEDS CLARIFICATION` items remain — FR-023 and FR-027 were resolved with the user before
planning, and all Phase 0 unknowns are closed in [research.md](./research.md) R8.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*Source: `.specify/memory/constitution.md` v1.0.0. Principles I and IV admit no justified
violation — a design that requires violating them is rejected, not tracked below.*

**Initial evaluation (pre-Phase 0): PASS.**
**Post-design re-evaluation (post-Phase 1): PASS.**

Principles I, II and III are Part A's obligations. This feature's job is to not undo them:

- [x] **I. Evidence or refusal, preserved to the screen**: every displayed value renders its
      page and source text without interaction (FR-006), and source text is shown in full and
      unreformatted (FR-007). The page adds no value that the service did not send.
- [x] **I. No gap left unexplained**: `LineItemView.missing` joins absent fields to their
      refusals, and flags an absent field that has *no* refusal rather than rendering a silent
      blank — surfacing a contract violation instead of hiding it.
- [x] **II. Ambiguity stays a distinct result**: its own section, its own treatment,
      distinguishable without reading the detail (FR-010). No value is marked as the answer
      (FR-012), and severities are labelled but never ranked (FR-028, FR-029).
- [x] **III. Fault isolation, honoured in presentation**: a result carrying refusals is
      rendered as a success (FR-016.4). A document that yielded nothing makes its refusals the
      primary content rather than an error state (FR-013).
- [x] **IV. Reason strings survive verbatim**: rendered exactly as received, inline and in the
      inventory, with re-wording, re-bucketing and shortening all explicitly forbidden
      (FR-009, FR-025, FR-026). **This is the principle this feature exists to satisfy** —
      Part A's audit marked it "unproven for the UI, because the UI does not exist yet".
- [x] **IV. No generic error anywhere**: four situations, four components, three banned
      phrases asserted absent across every state (FR-017, SC-006).
- [x] **IV. Shared contract, imported**: `@insta-quote/contracts` imported for real; Part B
      defines no copy of any schema and validates before rendering (FR-019).
- [x] **The proxy does not become the collapse point**: the route-handler contract fixes
      pass-through explicitly, with a test that an extraction-service 400 reaches the browser
      with its original status and message.
- [x] **Tests**: component tests against the six captured corpus responses plus three
      fixtures for states no real document reaches. No network calls.
- [x] **V. README honesty**: five limitations already drafted in
      [quickstart.md](./quickstart.md), including that equal-prominence is verified against a
      fixture rather than a real document.

## Project Structure

### Documentation (this feature)

```text
specs/002-review-web-page/
├── plan.md                     # This file
├── spec.md                     # FR-001..FR-029, SC-001..SC-012
├── research.md                 # Phase 0 — measured Part A output, layout decisions
├── data-model.md               # Phase 1 — PageState union, LineItemView, fixtures
├── quickstart.md               # Phase 1 — run both halves, walk every state
├── contracts/
│   ├── proxy-route.md          # POST /api/extract — exhaustive pass-through table
│   └── result-view.md          # what the person sees, mapped to requirements
├── checklists/requirements.md  # 16/16 pass
└── tasks.md                    # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── page.tsx                    # the single screen; owns PageState
│   ├── layout.tsx
│   ├── globals.css
│   ├── api/extract/route.ts        # transport hop only — see contracts/proxy-route.md
│   └── dev/fixtures/[name]/page.tsx  # renders a fixture without the service running
├── src/
│   ├── state/
│   │   ├── page-state.ts           # the discriminated union
│   │   └── submit.ts               # validate → post → classify, one place
│   ├── validation/
│   │   └── file.ts                 # selected, non-empty, %PDF- magic bytes
│   ├── view/
│   │   └── line-item-view.ts       # LineItemView + ResultSummary derivation
│   └── components/
│       ├── UploadForm.tsx
│       ├── Processing.tsx
│       ├── ResultView.tsx
│       ├── ResultSummary.tsx
│       ├── LineItemCard.tsx        # values + inline refusals + shared evidence
│       ├── RefusalInventory.tsx
│       ├── AmbiguityCard.tsx       # equal prominence across kinds
│       └── states/
│           ├── FileRejected.tsx    # ── four separate components, deliberately.
│           ├── Unreachable.tsx     #    No shared Error component with a message
│           ├── BadShape.tsx        #    prop, because that is how four situations
│           └── ServiceRejected.tsx #    become one.
└── tests/
    ├── fixtures/
    │   ├── corpus/*.json           # captured real responses, all six documents
    │   ├── both-ambiguity-kinds.json
    │   ├── refusals-and-ambiguities.json
    │   └── unexplained-gap.json
    ├── unit/                       # file validation, view derivation, state classification
    ├── components/                 # rendering rules per contracts/result-view.md
    └── integration/                # route handler pass-through
```

**Structure Decision**: `apps/web` in the existing monorepo, per the constitution's tech
stack. The four failure states live in separate files under `components/states/` because a
single `Error.tsx` taking a message prop is the exact shape FR-016 forbids — the split is
structural, so collapsing it later is a visible deletion rather than a quiet refactor.

## Phase 2 preview — implementation ordering

Not generated here (that is `/speckit-tasks`), but the spine is fixed by the design:

1. Scaffold `apps/web`, Tailwind, and the real import of `@insta-quote/contracts`.
2. Capture the six corpus responses and author the three fixtures — every test depends on
   them, and they are what makes the two unreachable states visible at all.
3. File validation (magic bytes) — pure, testable, no network.
4. `PageState` union and the classification function — pure, and the heart of FR-016.
5. The route handler with its pass-through tests.
6. Line item rendering with evidence, then inline refusals.
7. Refusal inventory, then ambiguities with the equal-prominence rule.
8. The four failure components, and the banned-phrase assertion across all of them.
9. Ordering and the summary strip — the `IB-STMT47` burial check.

Classification (step 4) comes before any component so the four situations exist as data
before anything renders them.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Two items recorded because they are costs the design knowingly
accepts:

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Three checked-in fixtures beyond the real corpus | Measured: no sample document produces a `rounding_difference`, and none contains refusals and ambiguities together (research R1). FR-028 and SC-004 would otherwise be untestable and silently droppable | Testing only against real documents. Rejected — the two requirements most at risk of being quietly skipped are exactly the two nothing would reveal. A fixture is the cheapest way to make their absence fail |
| Deliberate duplication of every line-item refusal (FR-023..FR-026) | The user chose inline *and* inventory so "why is this number missing?" and "how much did this document withhold?" are both answerable at a glance | Showing each refusal once. Rejected by the user with the trade-off stated. Measured cost on `IB-56010.pdf`: four reasons, each naming its own product code, shown twice — less repetitive than feared, since the sentences differ from each other (research R6) |
