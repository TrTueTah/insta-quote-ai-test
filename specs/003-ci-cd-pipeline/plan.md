# Implementation Plan: CI/CD Pipeline

**Branch**: `003-ci-cd-pipeline` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-ci-cd-pipeline/spec.md`

## Summary

One GitHub Actions workflow. Every pull request to `main` is installed from a clean checkout,
type-checked across **both** applications, tested, and built — with no access to deployment
credentials and no deployment of any kind. Every push to `main` does the same, then deploys
the extraction service to Railway, then the web application to Vercel, then proves the pair
works by uploading the control document to the deployed site and expecting its exact result.

Nothing rolls back and nothing retries. When one half deploys and the other does not, the run
says which half moved, in those words.

## Technical Context

**Language/Version**: Node 22 LTS, pinned in `.nvmrc` — verified in a container, since the
local machine only has Node 25 and pinning an unrun version would be a guess
**Primary Dependencies**: GitHub Actions; Railway CLI 5.59.0; Vercel CLI 59.25.4; pnpm 10
**Storage**: None. Neither application persists anything, so there is no migration or seeding
step in a release
**Testing**: The existing 205 tests, unchanged. This feature runs them; it does not restructure
them
**Target Platform**: `ubuntu-latest` runners; Railway for the service, Vercel for the site
**Project Type**: Repository infrastructure — one workflow file plus a pinned runtime version
**Performance Goals**: Verification well under 10 minutes (SC-003); measured at ~50 s on
Node 22. Merge to both halves live under 15 minutes (SC-005)
**Constraints**: Seven supplied credentials, no others. No preview deployments. No automatic
rollback or retry. Verification must not need a model-provider key
**Scale/Scope**: One repository, two applications, one shared package, one environment

No `NEEDS CLARIFICATION` items remain — FR-025 and FR-028 were resolved with the user before
planning, and all Phase 0 unknowns are closed in [research.md](./research.md) R11.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*Source: `.specify/memory/constitution.md` v1.0.0. Principles I and IV admit no justified
violation — a design that requires violating them is rejected, not tracked below.*

**Initial evaluation (pre-Phase 0): PASS.**
**Post-design re-evaluation (post-Phase 1): PASS.**

Principles I–IV govern how documents are extracted and how results reach the screen. This
feature touches neither, so the relevant question is whether it undermines them. It does not,
and in two places it defends them:

- [x] **I & II unaffected in substance**: no extraction logic, no schemas, no rendering
      changes. The one code change is to a type-check invocation.
- [x] **I defended**: the existing type-check silently covered only one application
      (research R1, proven with a deliberate error). A pipeline built on it would have
      reported the web app sound regardless of its state. FR-003 fixes this, and SC-002
      requires both applications to be tested separately.
- [x] **III. Fault isolation, applied to releases**: a failure in one half does not corrupt
      the other. `deploy-web` needs `deploy-api`, so the site is never moved ahead of the
      service; a failed web deploy leaves the service alone rather than triggering an
      automatic rollback that could itself fail.
- [x] **IV. No generic failure reporting**: every verification step is separately named, and
      the `report` job states which half moved. "Deploy failed" is explicitly a contract
      violation ([contracts/workflow.md](./contracts/workflow.md)). This is Principle IV
      applied to the pipeline's own output.
- [x] **IV. A green step is not evidence**: FR-014 forbids treating a successful deployment as
      proof the thing works, so the smoke test goes through the deployed site and asserts the
      control document's exact result.
- [x] **Tests**: no test is added, changed, or skipped. The pipeline runs all 205, and
      requires no model-provider key (FR-006).
- [x] **V. README honesty**: six limitations drafted in [quickstart.md](./quickstart.md),
      including that lint is not wired up and that three facts remain unverified until the
      first real run.
- [x] **Deploy-target-agnostic API preserved**: the service still starts with a plain command
      and no platform adapter. The pipeline invokes a CLI; it does not change how the service
      is built.

## Project Structure

### Documentation (this feature)

```text
specs/003-ci-cd-pipeline/
├── plan.md                     # This file
├── spec.md                     # FR-001..FR-030, SC-001..SC-012
├── research.md                 # Phase 0 — measured gaps, verified CLI flags, Node 22 proof
├── data-model.md               # Phase 1 — jobs, credentials, run outcomes
├── quickstart.md               # Phase 1 — local verification, pipeline self-tests
├── contracts/
│   ├── workflow.md             # triggers, job graph, exact steps, forbidden shapes
│   └── setup.md                # one-time setup, and what cannot be verified until first run
├── checklists/requirements.md  # 16/16 pass
└── tasks.md                    # Phase 2 output — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── ci-cd.yml           # the whole feature: verify, deploy-api, deploy-web, report

.nvmrc                      # 22 — the single home of the pinned runtime version

package.json                # `typecheck` fixed to cover BOTH applications
README.md                   # a CI/CD section and its limitations
```

Four files. Nothing in `apps/` or `packages/` changes except the one script that was
measurably wrong.

**Structure Decision**: one workflow file rather than separate CI and deploy workflows.
FR-010 requires deployment to be impossible without verification passing *for that exact
commit*; as a job dependency inside a single run that is structural, whereas across two
workflows it becomes a lookup of "did some other run pass for this SHA" — a weaker guarantee
and easy to get subtly wrong.

## Phase 2 preview — implementation ordering

Not generated here (that is `/speckit-tasks`), but the order is fixed by dependency:

1. `.nvmrc`, and fix the `typecheck` script — the measured gap, before anything is built on it.
2. The `verify` job, and confirm it fails on a deliberate type error **in each application
   separately**.
3. The preflight credential check — before any deploy step exists, so no version of this
   pipeline ever runs a CLI with an unset token.
4. `deploy-api`.
5. `deploy-web`, with the URL captured for the smoke test.
6. The smoke test.
7. `report`, including the `halves disagree` wording.
8. README and setup documentation.

Step 1 comes first because every later step's value depends on verification actually
verifying. Step 3 precedes steps 4 and 5 so a missing credential can never produce a
provider error instead of a named one.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Three decisions recorded because each is a deliberate cost:

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Two separate type-check steps instead of one command | The existing single command covered only `apps/extraction-api` and `packages/`, proven by a deliberate error in `apps/web` that it did not catch. Separate steps also mean a failure names which project | One combined command. Rejected: it reports "typecheck failed" without saying which project, and it was the shape that hid the gap. TypeScript project references would be better still, but restructuring three tsconfigs is a change to how the apps build, which the spec puts out of scope |
| A `report` job that runs on failure | The `halves disagree` outcome has no other place to be produced, and it is the outcome this feature was most at risk of reporting as a generic failure | Letting the run's own red/green status speak. Rejected: it cannot distinguish "nothing moved" from "the service moved and the site did not", and those need different responses |
| A smoke test through the deployed **site**, not the service | It is the only check that catches the site pointing at the wrong service — the most likely misconfiguration and the least visible | A health check on the service. Rejected: it would pass while the site talked to nothing, which is precisely the failure FR-016 exists to prevent |
