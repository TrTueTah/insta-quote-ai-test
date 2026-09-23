# Phase 1 Data Model: CI/CD Pipeline

**Feature**: `003-ci-cd-pipeline` | **Date**: 2026-09-23
**Source**: [spec.md](./spec.md) Key Entities + [research.md](./research.md)

This feature stores nothing and defines no runtime types. What is modelled here is the shape
of a pipeline run: its jobs, what each one is allowed to touch, and the inputs it reads.

## Jobs

One workflow, four jobs. The dependency edges are what make the guarantees structural rather
than procedural.

| Job | Runs when | Needs | May read secrets | May deploy |
|---|---|---|---|---|
| `verify` | every pull request to `main`, and every push to `main` | — | **no** | no |
| `deploy-api` | push to `main` only | `verify` | Railway (4) | the extraction service |
| `deploy-web` | push to `main` only | `deploy-api` | Vercel (3) | the web application |
| `report` | push to `main` only, always | `deploy-api`, `deploy-web` | no | no |

**`deploy-web` needs `deploy-api`**, not merely `verify`. That edge is FR-011 and FR-012: the
site is never moved ahead of the service it depends on, because a failed `deploy-api` leaves
`deploy-web` unstarted rather than merely unhappy.

**`report` runs with `if: always()`** so it can describe a half-finished deployment (FR-017,
FR-028). It is the only job that runs after a failure, and it reads no secrets.

**`verify` reads no secrets at all.** It does not need them, and not granting them is what
makes FR-022 true for fork pull requests without any special handling.

### Flow

```text
pull_request ──► verify ──► (end; nothing is deployed, FR-025)

push to main ──► verify ──┬── fails ──► (end; nothing is deployed, FR-010)
                          │
                          └── passes ──► deploy-api ──┬── fails ──► report:
                                                      │              service not moved,
                                                      │              site not moved
                                                      │
                                                      └── succeeds ──► deploy-web ──┬── fails ──► report:
                                                                                    │             SERVICE AT NEW COMMIT,
                                                                                    │             SITE AT OLD  (FR-028)
                                                                                    │
                                                                                    └── succeeds ──► smoke test ──► report: both live
```

There is no rollback edge and no retry edge, by decision (FR-028, FR-030).

## Verification steps

`verify` is a sequence, each step separately named so a failure identifies itself (FR-008).

| Step | Command | Requirement |
|---|---|---|
| Pin runtime | read `.nvmrc` | FR-007 |
| Install | `pnpm install --frozen-lockfile` | FR-002 |
| Typecheck — api & shared | `tsc --noEmit -p tsconfig.json` | FR-003 |
| Typecheck — web | `tsc --noEmit -p apps/web/tsconfig.json` | FR-003 |
| Test | `pnpm vitest run` | FR-004 |
| Build — web | `pnpm --filter @insta-quote/web build` | FR-005 |

**The two typecheck steps are separate on purpose.** Combined into one command, a failure
reports "typecheck failed" and a reader still has to work out which project. Separate, the
step name says it. This is also the gap R1 measured: the existing single command covered only
the first of these.

There is no build step for the extraction service: it runs from TypeScript source via `tsx`
and has no compile stage. Recorded here so its absence reads as a fact rather than an
oversight.

## Credentials

Seven, all supplied by the user, all stored as repository secrets. None appear in the
repository at any commit (FR-020) or in any log (FR-021).

| Name | Addresses | Used by |
|---|---|---|
| `RAILWAY_API_TOKEN` | authentication | `deploy-api` |
| `RAILWAY_PROJECT` | which project | `deploy-api` |
| `RAILWAY_SERVICE` | which service | `deploy-api` |
| `RAILWAY_ENVIRONMENT` | which environment | `deploy-api` |
| `VERCEL_TOKEN` | authentication | `deploy-web` |
| `VERCEL_ORG_ID` | which account | `deploy-web` |
| `VERCEL_PROJECT_ID` | which project | `deploy-web` |

### Preflight

Each deploy job begins by checking that every credential it needs is non-empty, failing with
all missing names listed at once (FR-019).

**Invariant**: the preflight tests emptiness and never echoes a value. Printing a secret to
prove it is set would defeat FR-021 in the act of enforcing FR-019. (GitHub masks known
secret values in logs, but relying on masking rather than not printing is the wrong habit and
does not cover values derived from a secret.)

## Configuration that is *not* a credential

| Name | Where it lives | Why not in the pipeline |
|---|---|---|
| `EXTRACTION_API_URL` | the Vercel project's environment | Read by the web app's route handler at request time. Set once during setup; the pipeline verifies the consequence of it being right rather than rewriting it each run (research R8) |
| `OPENAI_API_KEY` | the Railway service's environment | The pipeline never handles it, and no test needs it (FR-006) |

Both are deliberately outside the pipeline's control. A pipeline that rewrote them every run
would mask the case where one was changed by hand — exactly the drift the smoke test should
expose.

## Run outcome

What a person reads afterwards. Produced by `report`, which knows the result of both deploy
jobs.

| Outcome | Condition | What it says |
|---|---|---|
| `verified` | pull request, `verify` passed | checks passed; nothing deployed |
| `blocked` | `verify` failed | which step failed; nothing deployed |
| `both live` | both deploys and the smoke test passed | both addresses, and that the pair was exercised |
| `neither moved` | `deploy-api` failed | the failed step; both halves still at the previous commit |
| **`halves disagree`** | `deploy-api` passed, `deploy-web` failed | the service is at this commit, the site is not; they may disagree about the shared schema |
| `pair not proven` | both deploys passed, smoke test failed | both are deployed, but an upload did not return the expected result |

**`halves disagree` is the outcome this feature was most at risk of reporting badly**, and it
is why `report` exists as its own job. It is stated in those terms rather than as "deploy
failed", because the two halves share `packages/contracts` and the consequence is specific:
the site may receive a reply it cannot read — which Part B already renders honestly, but which
our own release process should never be the cause of.

`pair not proven` is deliberately distinct from `both live`. A green deployment step is not
evidence the thing works, which is the whole point of FR-014.

## Smoke test

| Property | Value |
|---|---|
| Target | the **deployed site's** upload endpoint, not the service directly |
| Document | `sample-files-variant/IB-55871.pdf` |
| Expected | 4 line items, 0 refusals, 0 ambiguities |
| Settles | FR-014 (service really runs), FR-016 (site reaches service), SC-006 |

Going through the site rather than the service is the point: it is the only way to catch the
site pointing at the wrong address, which is the most likely misconfiguration and the least
visible one.

The control document is used because its expected result is exact. Asserting "some line items
came back" would pass against a stale deployment of either half.
