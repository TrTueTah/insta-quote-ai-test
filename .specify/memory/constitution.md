<!--
SYNC IMPACT REPORT
==================
Version change: [CONSTITUTION_VERSION] (uninitialized template) → 1.0.0
Bump rationale: MAJOR — first ratification. All template placeholders replaced with
concrete, binding principles; no prior version existed to be backward compatible with.

Modified principles (template placeholder → concrete principle):
  [PRINCIPLE_1_NAME] → I. Evidence or Refusal — No Third Option (NON-NEGOTIABLE)
  [PRINCIPLE_2_NAME] → II. Ambiguity Is a Result, Not a Bug
  [PRINCIPLE_3_NAME] → III. Fault Isolation Per Document, Per Line Item
  [PRINCIPLE_4_NAME] → IV. The API Response Is the Contract With the UI
  [PRINCIPLE_5_NAME] → V. Honesty Over Completeness in the README

Added sections:
  - Purpose (why this project exists; the two things under test)
  - Technology & Architecture Constraints (replaces [SECTION_2_NAME])
  - Extraction Pipeline & Development Workflow (replaces [SECTION_3_NAME])

Removed sections: none (all template slots filled)

Templates requiring updates:
  ✅ .specify/memory/constitution.md — rewritten (this file)
  ✅ .specify/templates/plan-template.md — Constitution Check gate populated
  ✅ .specify/templates/spec-template.md — reviewed; placeholders are feature-scoped
     and compatible as-is. No mandatory section added or removed by this constitution.
  ✅ .specify/templates/tasks-template.md — reviewed; task categorization is
     principle-agnostic and compatible. Tests are NOT optional under Principle I;
     that obligation is enforced by the plan-template Constitution Check gate.
  ✅ .claude/skills/speckit-constitution — reviewed; no outdated agent-specific refs
  ⚠ README.md — does not exist yet. Principle V requires it before delivery.

Follow-up TODOs: none. All dates known; no deferred placeholders.

Note on source input: the authoring input ended mid-heading at "## Architecture layout"
with no body. The layout in "Technology & Architecture Constraints" below is derived
from the paths named elsewhere in that same input (apps/extraction-api, apps/web,
packages/contracts) and is marked as amendable if the author intended otherwise.
-->

# Insta Quote AI Constitution

## Purpose

This project is a take-home assessment. Two things are under test — not "build features":

1. **Never emit a number without evidence.** A confident wrong answer is a worse failure
   than an explicit refusal.
2. **A correct result inside the engine is worthless if it dies on the way to the screen
   as a generic error.** The refusal or the ambiguity MUST survive intact all the way to
   the UI.

Every principle below exists to protect those two things. When in doubt, optimize for
these over polish, scope, or cleverness.

## Core Principles

### I. Evidence or Refusal — No Third Option (NON-NEGOTIABLE)

Every extracted line item MUST carry a page number and exact source text — a literal
substring of the PDF's extracted text for that page, never a paraphrase, normalization,
or reconstruction.

- If a value cannot be tied to a specific string on a specific page, it MUST NOT be
  extracted. It goes in the refusals list with a reason.
- There is NO best-guess path, NO default value, NO silent fallback.
- Partial extraction (e.g. quantity found, unit price ambiguous) MUST produce a refusal
  entry for the missing piece rather than a `null`, a zero, or a guess.
- An LLM's stated confidence is NEVER sufficient grounds for acceptance on its own. The
  LLM MAY *propose* a candidate line item with a claimed source excerpt; acceptance
  depends only on the deterministic verification gate.
- Candidates from regex/rules and candidates from the LLM MUST pass through the same
  gate. No path bypasses it.

**Rationale**: The failure mode being tested is a fluent, plausible, wrong number. An
un-evidenced value is indistinguishable from a hallucinated one, so the system treats
them identically.

### II. Ambiguity Is a Result, Not a Bug

When a document contains contradictory values for the same field — two different totals,
a quantity that does not match the line-item sum, illegible OCR — that contradiction MUST
be surfaced as its own explicit entry, distinct in type from a "could not extract"
refusal.

- The system MUST NOT silently pick the first match, the larger number, the more recent
  page, or the cleaner-looking value.
- Ambiguity detection MUST run regardless of which interpretation path (rules or LLM)
  produced the candidates.

**Rationale**: "Could not find it" and "found two answers that disagree" demand different
human actions. Collapsing them into one bucket destroys the information the user needs.

### III. Fault Isolation Per Document, Per Line Item

One malformed page, one corrupt line item, or one parsing exception MUST NOT fail the
whole document.

- Errors MUST be caught at the smallest reasonable boundary: per line item where
  possible, per page as fallback.
- Caught failures MUST be converted into refusal entries carrying the reason, NOT rethrown
  as errors that abort the request.
- A request MUST still return a well-formed `{ lineItems, refusals }` envelope when parts
  of the document failed.

**Rationale**: A partially readable document still has value. Aborting discards every
correctly extracted line item because of one bad row.

### IV. The API Response Is the Contract With the UI

The refusal/ambiguity reason string produced by the extraction API MUST be the SAME string
shown to the end user in the web app.

- Reason strings MUST NOT be re-derived, re-worded, or re-classified into generic buckets
  ("validation error", "server error", "something went wrong") anywhere along the path.
- The web app MUST render `lineItems`, `refusals`, and ambiguities as first-class
  sections — never a refusal buried in a collapsed error toast.
- The web app MUST validate the API response against the shared `packages/contracts` Zod
  schema before rendering, and MUST report a shape mismatch to the user by name
  ("response didn't match expected shape") rather than swallowing it.
- If the UI shows a generic error for a case the API named specifically, that is a
  constitution violation — a defect to fix now, not a polish item for later.

**Rationale**: Principle I is worth nothing if the specific, honest reason is laundered
into a generic string before the human reads it.

### V. Honesty Over Completeness in the README

The README MUST document what is flaky, untested, deliberately out of scope, or known to
fail on a specific sample document.

- Where the pipeline escalated from rules to LLM-assisted proposal, the README MUST name
  which sample document forced it and why rules were insufficient.
- Claiming coverage that does not exist is Principle I applied to project reporting, and
  fails for the same reason.

**Rationale**: An overstated README is a confident wrong answer about the project itself.

## Technology & Architecture Constraints

### Repository layout

```text
apps/
├── extraction-api/    # Fastify + TypeScript service
└── web/               # Next.js + React + Tailwind CSS
packages/
└── contracts/         # Zod schemas — single source of truth
```

This layout is derived from the paths named in the ratifying input. Amending it is a MINOR
change under Governance.

### apps/extraction-api — Fastify, TypeScript

- `POST /extract` — multipart PDF in, `{ lineItems, refusals }` JSON out.
- `pdfjs-dist` (or `pdf-parse`) for per-page raw text extraction. This is ground truth and
  MUST be produced before any interpretation happens.
- OpenAI API (structured outputs / JSON schema mode) for candidate line-item proposal,
  used only where regex/rules cannot generalize to a sample doc's layout. Output MUST NOT
  be trusted directly; it always passes the verification gate.
- Zod for schema validation, defined once in `packages/contracts` and imported — never
  copied or manually kept in sync.
- Vitest for tests. Refusal-rule tests MUST run against the verification gate directly
  with fixed text fixtures and MUST NOT make live API calls, so the suite stays fast and
  deterministic.

### apps/web — Next.js, React, Tailwind CSS

- Native `<input type="file">`. No form library; one field does not need form-state
  management.
- Rendering and validation obligations are binding under Principle IV.

### packages/contracts

- Zod schemas: `LineItem`, `Refusal`, `Ambiguity`, and the response envelope.
- Single source of truth, imported for real by both apps.

### Deployment

- `apps/web` → Vercel.
- `apps/extraction-api` → built deploy-target-agnostic from the start: a plain Fastify
  app with NO Vercel-specific serverless entry point, deployed to Railway/Render, since
  PDF processing plus LLM calls can plausibly exceed serverless timeout limits. Moving it
  to Vercel functions later MUST remain a config change under this setup, not a rewrite.

## Extraction Pipeline & Development Workflow

The pipeline inside `apps/extraction-api` runs in this fixed order:

1. **Deterministic text extraction** — `pdfjs-dist`/`pdf-parse` pulls raw text per page,
   verbatim, with page numbers. Ground truth. No model involved.
2. **Candidate interpretation** — regex/rules first. Escalation to OpenAI-assisted
   proposal is permitted only where a sample doc's layout demonstrably defeats rules, and
   the README MUST note which doc and why (Principle V).
3. **Deterministic verification gate** — a pure function, framework-free and unit-testable
   in isolation. For every candidate, check whether its claimed source text literally
   substring-matches the extracted text on its claimed page.
   - Match → accepted as a line item; evidence is real.
   - No match → auto-refused, reason: `"source text not found on page N"`.
4. **Ambiguity detection** — a separate deterministic check for contradictory values (e.g.
   mismatched totals), run regardless of which interpretation path produced the candidates.

### Quality gates

- The verification gate MUST have direct unit tests with fixed text fixtures, including
  at least one candidate that fails the substring check.
- No code path may write a line item into the response without having passed step 3.
- Changes to reason strings MUST be made in the extraction API only; the web app displays
  them unaltered.

## Governance

This constitution supersedes all other practices, conventions, and preferences in this
repository. Where a tool default, a library idiom, or a convenience conflicts with a
principle above, the principle wins.

**Amendment procedure**: Amendments MUST be made by editing this file, MUST state the
version bump and its rationale in the Sync Impact Report comment at the top, and MUST
propagate to dependent artifacts (`.specify/templates/plan-template.md`,
`.specify/templates/spec-template.md`, `.specify/templates/tasks-template.md`, README) in
the same change.

**Versioning policy** (semantic versioning):

- **MAJOR** — backward-incompatible governance or principle removal or redefinition.
- **MINOR** — a new principle or section is added, or existing guidance is materially
  expanded (including changes to the repository layout or tech stack).
- **PATCH** — clarifications, wording, typo fixes, non-semantic refinements.

**Compliance review**: Every plan MUST pass the Constitution Check gate in
`.specify/templates/plan-template.md` before Phase 0 research and again after Phase 1
design. Any violation MUST be recorded in that plan's Complexity Tracking table with a
concrete justification and the rejected simpler alternative — or the design MUST change.
Principles I and IV admit no justified violation; a plan that requires violating them is
rejected rather than tracked.

**Runtime guidance**: `CLAUDE.md` at the repository root points to the current plan for
project structure, shell commands, and technology context. It does not override this file.

**Version**: 1.0.0 | **Ratified**: 2026-09-22 | **Last Amended**: 2026-09-22
