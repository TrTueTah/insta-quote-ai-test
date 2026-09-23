# Contract: The Pipeline Workflow

**Feature**: `003-ci-cd-pipeline` | **File**: `.github/workflows/ci-cd.yml`

## Triggers

| Event | Runs | Deploys |
|---|---|---|
| `pull_request` targeting `main` | `verify` | **never** (FR-025, FR-026) |
| `push` to `main` | `verify`, then the deploy jobs | yes |

Nothing else triggers it. No `workflow_dispatch` deploy path, because a manual trigger is a
way to deploy something that has not passed verification.

**`pull_request_target` MUST NOT be used.** It would hand repository secrets to code from a
fork, defeating FR-022. If a fork's checks appear to be missing something, that is the
mechanism working.

## Job contract

```yaml
concurrency:
  group: pipeline-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Cancel superseded pull-request checks; **queue** on `main` so a live deployment is never
interrupted and the newest commit's run finishes last (FR-023, research R9).

| Job | `if` | `needs` | Secrets |
|---|---|---|---|
| `verify` | — | — | none |
| `deploy-api` | `github.event_name == 'push'` | `verify` | Railway ×4 |
| `deploy-web` | `github.event_name == 'push'` | `deploy-api` | Vercel ×3 |
| `report` | `github.event_name == 'push'` && `always()` | `deploy-api`, `deploy-web` | none |

### Rules

1. **`verify` receives no secrets.** Not "receives them but does not use them" — they are not
   referenced in the job at all.
2. **`deploy-web` needs `deploy-api`.** Changing this to `needs: verify` would let the site
   move while the service did not, which FR-012 forbids.
3. **No `continue-on-error` on any deploy step.** A deployment that failed must fail the job,
   or `report` describes a state that did not happen.
4. **No automatic retry or rollback** anywhere (FR-028, FR-030).
5. **No step prints a secret**, including in `echo`, `set -x`, or an error path.
6. **Every verification step is a separate named step** so a failure identifies itself
   (FR-008).

## `verify` — exact steps

| # | Name | Command | Fails when |
|---|---|---|---|
| 1 | Checkout | — | — |
| 2 | Use Node from `.nvmrc` | `node-version-file: .nvmrc` | the file is missing |
| 3 | Install pnpm | corepack / action | — |
| 4 | Install dependencies | `pnpm install --frozen-lockfile` | the lockfile is out of date |
| 5 | Typecheck — service and shared package | `npx tsc --noEmit -p tsconfig.json` | a type error outside `apps/web` |
| 6 | Typecheck — web application | `npx tsc --noEmit -p apps/web/tsconfig.json` | a type error in `apps/web` |
| 7 | Test | `pnpm vitest run` | any of the 205 tests fails |
| 8 | Build — web application | `pnpm --filter @insta-quote/web build` | the build fails |

Steps 5 and 6 are separate because a combined command reports "typecheck failed" without
saying which project — and because the existing single command silently covered only the
first (research R1).

No step sets `OPENAI_API_KEY`, and no step may (FR-006).

## `deploy-api` — contract

Preflight, then deploy.

```bash
# Preflight (FR-019) — names every missing credential at once, prints no values.
missing=()
[ -n "$RAILWAY_API_TOKEN" ]  || missing+=(RAILWAY_API_TOKEN)
[ -n "$RAILWAY_PROJECT" ]    || missing+=(RAILWAY_PROJECT)
[ -n "$RAILWAY_SERVICE" ]    || missing+=(RAILWAY_SERVICE)
[ -n "$RAILWAY_ENVIRONMENT" ]|| missing+=(RAILWAY_ENVIRONMENT)
[ ${#missing[@]} -eq 0 ] || { echo "Missing repository secrets: ${missing[*]}"; exit 1; }
```

```bash
railway up --ci \
  --service "$RAILWAY_SERVICE" \
  --environment "$RAILWAY_ENVIRONMENT" \
  --project "$RAILWAY_PROJECT"
```

Flag names verified against Railway CLI 5.59.0. `--ci` streams build logs then exits, which
is the behaviour a pipeline wants. `RAILWAY_API_TOKEN` is supplied in the environment
(**unverified** — see research R5).

## `deploy-web` — contract

Same preflight shape for `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, then:

```bash
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
vercel build --prod --token="$VERCEL_TOKEN"
vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
```

Flags verified against Vercel CLI 59.25.4. The deployment URL is captured from stdout for the
smoke test; the capture **must tolerate other output** rather than assuming the URL is the
only thing printed (**unverified** — see research R6).

Building here rather than on Vercel means the artifact deployed is the one built from the
verified commit, and a build failure is a pipeline failure with readable logs.

## Smoke test — part of `deploy-web`

```bash
curl -sS -F file=@sample-files-variant/IB-55871.pdf "$SITE_URL/api/extract"
```

Must return 4 line items, 0 refusals, 0 ambiguities.

This runs against the **deployed site**, not the service, because that is the only way to
catch the site pointing at the wrong service (FR-014, FR-016, SC-006). A failure here does
not undo either deployment; it produces the `pair not proven` outcome.

## `report` — contract

Runs `if: always()`. Reads the two deploy jobs' results and emits one of the outcomes in
[data-model.md](../data-model.md), written into the run summary.

The outcome that matters:

> **The extraction service is deployed at this commit. The web application is not.**
> They may disagree about the shared data format until this is resolved.
> Failed step: `<name>`. Nothing has been rolled back.

A `report` that says only "deploy failed" is a contract violation. So is one that omits which
half moved.
