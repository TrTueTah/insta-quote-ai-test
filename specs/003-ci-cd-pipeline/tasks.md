---
description: "Task list for the CI/CD pipeline"
---

# Tasks: CI/CD Pipeline

**Input**: Design documents from `/specs/003-ci-cd-pipeline/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks ARE included, in two forms.

1. **Automated** — a Vitest suite asserting the workflow's structural invariants: that
   `verify` references no secrets, that `deploy-web` needs `deploy-api`, that
   `pull_request_target` is absent, that no deploy step carries `continue-on-error`. These
   are the contract's forbidden shapes, and every one of them is a single-line edit away from
   being broken by someone acting reasonably.
2. **Deliberate verification** — fault-injection runs against the real pipeline. A workflow
   cannot be fully proven by unit tests; the only way to know a broken change is blocked is
   to open a pull request containing one.

**Organization**: Grouped by user story. Each story is verifiable on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4
- Paths are repo-relative and exact

## Path Conventions

Four files carry this feature: `.github/workflows/ci-cd.yml`, `.nvmrc`, `package.json`, and
`README.md`. Nothing in `apps/` or `packages/` changes except one measurably wrong script.

---

## Phase 1: Setup

**Purpose**: Pin the runtime and close the measured verification gap, before anything is
built on top of either.

- [X] T001 Create `.nvmrc` containing `22`, the single home of the pinned runtime version (FR-007)
- [X] T002 Fix the `typecheck` script in `package.json` to run both projects: `tsc --noEmit -p tsconfig.json && tsc --noEmit -p apps/web/tsconfig.json` (FR-003)
- [X] T003 Verify the fix by appending `const deliberateBreak: number = 'nope';` to `apps/web/src/view/format.ts`, confirming `pnpm typecheck` now exits non-zero and names the file, then reverting the change
- [X] T004 Create `.github/workflows/ci-cd.yml` with triggers only — `pull_request` targeting `main` and `push` to `main` — and no jobs yet
- [X] T005 Add the concurrency block to `.github/workflows/ci-cd.yml`: group `pipeline-${{ github.ref }}`, with `cancel-in-progress` set to `${{ github.event_name == 'pull_request' }}` so pull-request checks cancel but `main` runs queue and never interrupt a live deploy (FR-023)

**Checkpoint**: `pnpm typecheck` catches a type error in either application.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The structural guards that every later job depends on staying true.

**⚠️ CRITICAL**: T006–T008 exist so that the rules in
[contracts/workflow.md](./contracts/workflow.md) survive future edits. Writing them after the
jobs would mean the jobs were never checked against their own contract.

- [X] T006 Write `apps/web/tests/unit/workflow-invariants.test.ts` parsing `.github/workflows/ci-cd.yml` and asserting the trigger set is exactly `pull_request` on `main` plus `push` on `main`
- [X] T007 Add assertions to `apps/web/tests/unit/workflow-invariants.test.ts` that `pull_request_target` appears nowhere in the file, since it would hand repository secrets to fork code and defeat FR-022
- [X] T008 Add assertions to `apps/web/tests/unit/workflow-invariants.test.ts` that no step in the file carries `continue-on-error`, which would let a failed deployment report as success
- [X] T009 Add a `yaml` dev dependency to the root `package.json` so the invariants test parses the workflow rather than pattern-matching its text

**Checkpoint**: The invariants suite runs and fails loudly if the workflow's shape drifts.

---

## Phase 3: User Story 1 - A broken change cannot reach main (Priority: P1) 🎯 MVP

**Goal**: Every pull request is installed from a clean checkout, type-checked across both
applications, tested and built — with no deployment credentials in scope.

**Independent Test**: Open one pull request containing a type error in the web app and
another containing a failing test. Both must fail with a step name that says what broke.

### Implementation for User Story 1

- [X] T010 [US1] Add the `verify` job to `.github/workflows/ci-cd.yml` running on `ubuntu-latest`, with a checkout step and no `env` or `secrets` references anywhere in the job (FR-022)
- [X] T011 [US1] Add the Node setup step to the `verify` job using `node-version-file: .nvmrc`, so the pinned version has one home and cannot drift from the workflow (FR-007)
- [X] T012 [US1] Add pnpm setup and an install step running `pnpm install --frozen-lockfile` in the `verify` job, so a run reflects the committed dependency set (FR-002)
- [X] T013 [US1] Add a step named "Typecheck — service and shared package" running `npx tsc --noEmit -p tsconfig.json` to the `verify` job
- [X] T014 [US1] Add a separately named step "Typecheck — web application" running `npx tsc --noEmit -p apps/web/tsconfig.json`, kept separate so a failure names which project and so the gap in T003 cannot recur silently (FR-003, FR-008)
- [X] T015 [US1] Add a step named "Test" running `pnpm vitest run` to the `verify` job (FR-004)
- [X] T016 [US1] Add a step named "Build — web application" running `pnpm --filter @insta-quote/web build` to the `verify` job (FR-005)
- [X] T017 [US1] Add an assertion to `apps/web/tests/unit/workflow-invariants.test.ts` that the `verify` job contains no `secrets.` reference at all — not merely that it does not use them (FR-022)
- [X] T018 [US1] Add an assertion to `apps/web/tests/unit/workflow-invariants.test.ts` that the `verify` job never references `OPENAI_API_KEY` (FR-006)

### Verification for User Story 1

> These are run once, deliberately. They are the only evidence the pipeline does what it says.

- [ ] T019 [US1] Open a pull request breaking one test, confirm `verify` fails at the Test step, then close it without merging (SC-001)
- [ ] T020 [US1] Open a pull request with a type error in `apps/extraction-api/src`, confirm the failure names the "Typecheck — service and shared package" step, then close it (SC-002)
- [ ] T021 [US1] Open a pull request with a type error in `apps/web/src`, confirm the failure names the "Typecheck — web application" step, then close it. **This is the case that silently passed before T002** (SC-002)
- [ ] T022 [US1] Confirm from any pull-request run of `.github/workflows/ci-cd.yml` that no deployment or preview environment appeared on either platform dashboard (FR-026, SC-011)

**Checkpoint**: Broken changes are blocked, and each fault names its own step.

---

## Phase 4: User Story 2 - Merging to main publishes both halves (Priority: P2)

**Goal**: A merge deploys the service, then the site, then proves the pair actually works.

**Independent Test**: Merge a visible, harmless change. Both addresses are reported, and
uploading the control document to the public site returns its exact expected result.

### Implementation for User Story 2

- [X] T023 [US2] Add the `deploy-api` job to `.github/workflows/ci-cd.yml` with `needs: verify` and `if: github.event_name == 'push'`, so deployment is impossible without verification passing for that exact commit (FR-009, FR-010)
- [X] T024 [US2] Add the Railway credential preflight step to `deploy-api` in `.github/workflows/ci-cd.yml`, checking all four values are non-empty and failing with every missing name listed at once, without echoing any value (FR-019, FR-021)
- [X] T025 [US2] Add the Railway CLI install and `railway up --ci --service "$RAILWAY_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --project "$RAILWAY_PROJECT"` step to `deploy-api`, with `RAILWAY_API_TOKEN` supplied through the environment
- [X] T026 [US2] Add the `deploy-web` job to `.github/workflows/ci-cd.yml` with `needs: deploy-api` — not `needs: verify` — so the site is never moved ahead of the service it depends on (FR-011, FR-012)
- [X] T027 [US2] Add the Vercel credential preflight step to `deploy-web` in `.github/workflows/ci-cd.yml`, same shape as T024 for the three Vercel values
- [X] T028 [US2] Add the Vercel three-step deploy to `deploy-web`: `vercel pull --yes --environment=production`, `vercel build --prod`, `vercel deploy --prebuilt --prod`, so the artifact deployed is the one built from the verified commit
- [X] T029 [US2] Capture the deployment URL from `vercel deploy` stdout in `deploy-web`, tolerating surrounding output rather than assuming the URL is all that is printed (research R6, unverified)
- [X] T030 [US2] Add the smoke-test step to `deploy-web` uploading `sample-files-variant/IB-55871.pdf` to the **deployed site's** `/api/extract` and asserting 4 line items, 0 refusals, 0 ambiguities (FR-014, FR-016, SC-006)
- [X] T031 [US2] Add an assertion to `apps/web/tests/unit/workflow-invariants.test.ts` that `deploy-web` declares `needs: deploy-api`, since relaxing it to `needs: verify` is a one-word edit that silently breaks FR-012
- [X] T032 [US2] Add an assertion to `apps/web/tests/unit/workflow-invariants.test.ts` that both deploy jobs are guarded by `github.event_name == 'push'` (FR-025)

### Verification for User Story 2

- [ ] T033 [US2] Merge a visible, harmless change to `main` and confirm both halves deploy and the smoke-test step passes (SC-005, SC-006)
- [ ] T034 [US2] Confirm the run summary produced by the `report` job in `.github/workflows/ci-cd.yml` states both deployed addresses, reachable without hunting through logs (FR-015, SC-009)

**Checkpoint**: A merge publishes both halves and proves they work together.

---

## Phase 5: User Story 3 - A half-finished deployment is visible (Priority: P3)

**Goal**: When the service deploys and the site does not, the run says so in those words.

**Independent Test**: Break the web deployment deliberately. The run must report that the
service is at the new commit and the site is not — not merely that a deploy failed.

### Implementation for User Story 3

- [X] T035 [US3] Add the `report` job to `.github/workflows/ci-cd.yml` with `needs: [deploy-api, deploy-web]` and `if: always()`, so it still runs after a failure, and with no access to secrets
- [X] T036 [US3] Implement the outcome mapping in the `report` job per [data-model.md](./data-model.md): `both live`, `neither moved`, `halves disagree`, `pair not proven`
- [X] T037 [US3] Write the `halves disagree` message in `.github/workflows/ci-cd.yml` stating that the service is deployed at this commit and the site is not, that they may disagree about the shared data format, which step failed, and that nothing has been rolled back (FR-017, FR-028, FR-029)
- [X] T038 [US3] Write the outcome to the GitHub step summary in the `report` job so it is readable without opening logs (FR-018, SC-008)
- [X] T039 [US3] Add an assertion to `apps/web/tests/unit/workflow-invariants.test.ts` that no job in the workflow contains a retry or rollback step, since FR-030 forbids both and either could be added later as a well-meant improvement

### Verification for User Story 3

- [ ] T040 [US3] Temporarily set `VERCEL_PROJECT_ID` to an invalid value, push to `main`, and confirm the report says the service moved and the site did not — then restore the secret (SC-012)
- [ ] T041 [US3] Confirm from the same run that nothing was rolled back and no deploy was retried, matching the absence asserted by `apps/web/tests/unit/workflow-invariants.test.ts` (FR-030)

**Checkpoint**: A half-finished deployment is named, not reported as a generic failure.

---

## Phase 6: User Story 4 - Credentials never leak (Priority: P4)

**Goal**: The seven credentials exist only in repository secret storage, and appear nowhere
in the repository or in any log.

**Independent Test**: Search the repository and a completed run's logs for each value. Zero
occurrences.

### Implementation for User Story 4

- [X] T042 [P] [US4] Add an assertion to `apps/web/tests/unit/workflow-invariants.test.ts` that the workflow contains no literal that looks like a token, so a credential pasted in place of a `secrets.` reference fails the suite
- [X] T043 [P] [US4] Add an assertion to `apps/web/tests/unit/workflow-invariants.test.ts` that no step in the workflow uses `set -x` or echoes a variable holding a secret, since a command trace would print credential values into the log (FR-021)
- [X] T044 [US4] Review the preflight steps in `.github/workflows/ci-cd.yml` and confirm they test emptiness only and print names rather than values, so FR-019 is not enforced at the cost of FR-021

### Verification for User Story 4

- [X] T045 [US4] Search the full repository history with `git log -p` and `git grep` for each of the seven credential values, and confirm `.github/workflows/ci-cd.yml` references them only as `secrets.*` (FR-020, SC-007)
- [ ] T046 [US4] Download a completed run's logs for `.github/workflows/ci-cd.yml` and search for each of the seven values, confirming zero occurrences including inside command echoes (FR-021, SC-007)
- [ ] T047 [US4] Unset one Railway secret, push to `main`, and confirm `deploy-api` stops naming that specific secret before any CLI runs — then restore it (FR-019, SC-008)

**Checkpoint**: No credential is reachable from the repository or from a run's output.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T048 Write the setup steps from [contracts/setup.md](./contracts/setup.md) into `README.md`, leading with disabling both platforms' own git auto-deploy, since leaving either on makes FR-010 decorative (FR-027)
- [X] T049 Document the seven required secrets in `README.md` with their exact names, noting that `RAILWAY_PROJECT` is the project ID rather than its display name
- [X] T050 Document in `README.md` that `EXTRACTION_API_URL` and `OPENAI_API_KEY` live on the hosting platforms and are deliberately not managed by the pipeline
- [X] T051 [P] Add the six limitations from [quickstart.md](./quickstart.md) to `README.md`, including that lint is not wired up and that three facts stay unverified until the first real run
- [X] T052 [P] Document the four run outcomes in `README.md` with what to do about each, so `halves disagree` and `pair not proven` are actionable rather than puzzling
- [ ] T053 Confirm the `verify` check is required on `main` in the repository's branch protection settings, noting this protects the branch rather than the deployment, which FR-010 already covers
- [X] T054 Run `pnpm vitest run` and confirm `apps/web/tests/unit/workflow-invariants.test.ts` is part of the suite count rather than a separate command someone must remember

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T002 must precede everything, because every later
  claim about verification rests on the type-check actually covering both applications
- **Foundational (Phase 2)**: depends on T004. **Blocks nothing functionally**, but is placed
  before the jobs so each job is written against a suite that already checks its shape
- **US1 (Phase 3)**: depends on Setup and Foundational
- **US2 (Phase 4)**: depends on US1 — the deploy jobs declare `needs: verify`
- **US3 (Phase 5)**: depends on US2 — `report` needs both deploy jobs to exist
- **US4 (Phase 6)**: depends on US2 for the preflight steps it audits; its assertion tasks
  (T042, T043) depend only on Foundational
- **Polish (Phase 7)**: depends on US1–US4

### Within each story

- Workflow structure before the steps inside it
- The credential preflight (T024, T027) before the CLI steps it protects (T025, T028), so no
  version of this pipeline ever runs a CLI with an unset token
- Implementation before its deliberate verification tasks

### Parallel Opportunities

Limited, and honestly so: almost every task edits `.github/workflows/ci-cd.yml`, and tasks
touching the same file must be sequential.

- T042 and T043 (both add assertions, but to the same test file — sequential in practice)
- T051 and T052 (both edit `README.md` — sequential in practice)
- Genuinely parallel: none of the workflow tasks. This feature is one file and is best built
  in order

### A note on the verification tasks

T019–T022, T033–T034, T040–T041 and T045–T047 require pushing to a real repository with real
credentials. They cannot be completed locally and are the point at which the three unverified
assumptions in [research.md](./research.md) are settled. If the first `main` deployment fails,
start with R5 (the Railway token variable name), R6 (the `vercel deploy` output shape) and R4
(whether the platform git integrations are genuinely off).

## Implementation Strategy

### MVP First (Setup + Foundational + User Story 1)

1. Phase 1: pin the runtime, fix the type-check gap
2. Phase 2: the invariants suite
3. Phase 3: the `verify` job
4. **STOP and VALIDATE**: open three pull requests — a failing test, a type error in the
   service, a type error in the web app — and confirm all three are blocked with a named step
5. That alone is worth having. The 205 tests stop being something a person must remember to
   run, and the type-check gap that silently passed is closed

### Incremental Delivery

1. Setup + Foundational → the repository can verify itself correctly
2. + US1 → broken changes cannot reach `main` (MVP)
3. + US2 → merging publishes both halves, and the pair is proven by an upload
4. + US3 → a half-finished deployment names itself
5. + US4 → credentials audited, and their absence reported by name
6. + Polish → README, setup, branch protection

## Notes

- Almost every task edits one file. Commit after each, so a broken workflow is easy to bisect
- A workflow cannot be fully proven by unit tests. T006–T009, T017–T018, T031–T032, T039 and
  T042–T043 guard its *shape*; the deliberate verification tasks prove its *behaviour*, and
  both are needed
- `pnpm lint` stays out of the pipeline. It does not run — ESLint was never installed — and a
  step written as `|| true` to keep the pipeline green reports assurance it does not provide
- The smoke test asserts the control document's exact result. "Some line items came back"
  would pass against a stale deployment of either half


---

## Implementation record (2026-09-23)

**43 of 54 complete. 11 remain, and none of them can be done from here** — they require a
real push to GitHub with real credentials, or repository settings access. They are listed
below rather than ticked off.

**230 tests pass** (up from 205; the 25 new ones are the workflow invariants). `pnpm
typecheck` now covers both applications. `actionlint` reports 0 errors including shellcheck
on every embedded script.

### Verified, not assumed

All five `verify` steps were run in a `node:22-slim` container against a clean copy of the
repository, in the same order the workflow runs them:

```
node: v22.23.2  (pinned: 22)
Install dependencies                    ok
Typecheck — service and shared package  ok
Typecheck — web application             ok
Test                                    Test Files 31 passed, Tests 230 passed
Build — web application                 ok
```

So the pipeline will go green on its first pull request. That was the main thing worth
settling before pushing anything.

### The gap this feature closed

`pnpm typecheck` did not cover `apps/web`, proven by appending a type error and watching the
command exit 0 (T003). It was introduced while building Part B, when the root tsconfig was
narrowed and nothing re-pointed the root script. It now runs both projects and exits 1 on
that same error.

### Two things caught during implementation

1. **`actionlint` appeared to pass while examining nothing.** The first run produced no output
   and exit 0, which looked like success. Introducing a deliberately bad `needs:` still
   produced nothing — so the tool was verified against a fault it definitely catches (an
   unknown job key), which it reported immediately. Only then was the clean result
   trustworthy. `-verbose` confirms it: "Found total 0 errors".
2. **An invariant assertion was checking the wrong string.** The credential test matched
   against `JSON.stringify` output, where `missing+=("VERCEL_TOKEN")` becomes
   `missing+=(\"VERCEL_TOKEN\")`. It passed for neither platform. Rewritten to assert
   against the raw YAML, which is what the invariant is actually about.

### Remaining — requires a real repository and credentials

| Task | What it needs |
|---|---|
| T019, T020, T021 | Open three pull requests (failing test; type error in the service; type error in the web app) and confirm each fails at its named step |
| T022 | Confirm from a pull-request run that no deployment or preview appeared on either platform |
| T033, T034 | Merge to `main`; confirm both halves deploy, the smoke test passes, and both addresses are reported |
| T040, T041 | Set `VERCEL_PROJECT_ID` invalid, push, confirm the report says the service moved and the site did not — then restore |
| T046 | Download a completed run's logs and search for each of the seven credential values |
| T047 | Unset one Railway secret, push, confirm `deploy-api` names it before any CLI runs — then restore |
| T053 | Require the `verify` check on `main` in branch protection settings |

T020 and T021 have a local equivalent already proven: the typecheck commands were shown to
catch an error in each application separately (T003, and the Node 22 run above). What remains
unproven is the pull-request-level behaviour.

These are also where the three unverified assumptions in [research.md](./research.md) get
settled. If the first `main` deployment fails, start with R5 (the Railway token variable
name), R6 (the `vercel deploy` output shape) and R4 (whether the platform git integrations
are genuinely off).
