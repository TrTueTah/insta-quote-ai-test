# Quickstart: CI/CD Pipeline

**Feature**: `003-ci-cd-pipeline` | **Date**: 2026-09-23

## Before the first run

Follow [contracts/setup.md](./contracts/setup.md) in order. The first step matters most:
**turn off both platforms' own git auto-deploy**, or commits reach production without passing
verification and the pipeline's main guarantee is decorative.

## Run the verification locally

Exactly what the pipeline runs, in the same order:

```bash
pnpm install --frozen-lockfile
npx tsc --noEmit -p tsconfig.json              # service + shared package
npx tsc --noEmit -p apps/web/tsconfig.json     # web app  <- the one that was missing
pnpm vitest run                                # 205 tests
pnpm --filter @insta-quote/web build
```

**Do not use `pnpm typecheck` to check your work.** It covers only the first of the two
projects. Verified by appending a type error to `apps/web/src/view/format.ts`: the command
still exits 0. See [research.md](./research.md) R1.

## Reproduce the pipeline's environment exactly

The pipeline runs Node 22; a typical dev machine here runs 25. To check something on the
version CI will use, without touching your local `node_modules`:

```bash
rsync -a --exclude node_modules --exclude .next --exclude .git --exclude '.env*' ./ /tmp/ci-check/
docker run --rm -v /tmp/ci-check:/app -w /app node:22-slim bash -c '
  corepack enable
  pnpm install --frozen-lockfile
  npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json
  pnpm vitest run
  pnpm --filter @insta-quote/web build
'
```

Measured on Node 22.23.2: install 9 s, typecheck 27 s, 205 tests in 4 s, web build 8 s —
about 50 seconds total, against a 10-minute budget.

## Verifying the pipeline itself

Each row is a requirement. Doing these once, deliberately, is the only way to know the
pipeline does what it claims.

| Test | How | Expect |
|---|---|---|
| A broken test is caught | open a PR that breaks one test | `verify` fails at the Test step; not mergeable |
| A type error in the **service** is caught | break a type in `apps/extraction-api/src` | fails at *Typecheck — service and shared package* |
| A type error in the **web app** is caught | break a type in `apps/web/src` | fails at *Typecheck — web application*. **This is the case that silently passed before** |
| A build failure is caught | break something that builds but does not typecheck as a build | fails at the Build step |
| No model key is needed | read the run | no step references `OPENAI_API_KEY` |
| A PR deploys nothing | open any PR, then check both platform dashboards | no new deployment, no preview environment |
| A missing secret is named | unset one Railway secret, push to `main` | `deploy-api` stops naming that secret, before any CLI runs |
| Secrets never appear | search a completed run's logs for each of the seven values | zero occurrences |
| Both halves go live | merge a visible change | both addresses reported; the site shows the change |
| The pair is really working | read the smoke-test step | 4 line items from `IB-55871.pdf`, through the deployed site |
| A half-finished deploy is named | make the web deploy fail (e.g. temporarily wrong `VERCEL_PROJECT_ID`) | the report says the service is at the new commit and the site is not — not "deploy failed" |
| A later merge wins | merge twice within a minute | the later commit is what ends up deployed |

## Reading the outcome

| Outcome | Meaning | What to do |
|---|---|---|
| `both live` | both deployed, and an upload through the site returned the control result | nothing |
| `neither moved` | the service deploy failed; the site was never touched | fix and re-run; nothing is inconsistent |
| **`halves disagree`** | the service is at the new commit, the site is not | re-run. Until then the two may disagree about the shared schema, and the site may report a reply it cannot read |
| `pair not proven` | both deployed, but the smoke test failed | check `EXTRACTION_API_URL` on Vercel first — a site pointing at the wrong service is the usual cause |

`pair not proven` is deliberately not `both live`. A green deployment step is not evidence
the thing works.

## Known limitations to carry into the README

- **Lint is not part of verification.** `pnpm lint` does not run — ESLint was never installed.
  A step that cannot fail would report assurance it does not provide, so it is left out and
  said out loud rather than wired up as `|| true`.
- **Three things are unverified until the first real run**: that `RAILWAY_API_TOKEN` is the
  variable the Railway CLI authenticates with, the exact stdout shape `vercel deploy` prints
  the URL in, and whether the platform git integrations are genuinely disabled. If the first
  run fails, start there.
- **Nothing rolls back.** A half-finished deployment is reported and left for a person
  (FR-028). The window where the deployed halves disagree is accepted, not eliminated.
- **The pipeline does not manage `EXTRACTION_API_URL` or `OPENAI_API_KEY`.** Both live on the
  platforms. The smoke test detects the consequence of the first being wrong; nothing detects
  the second being absent, beyond documents escalating to refusals.
- **No staging environment.** `main` deploys straight to production, which suits a project
  being evaluated rather than one carrying traffic.
- **The smoke test uses one document.** It proves the pair is connected and working for the
  control case, not that extraction is correct — that is what the 205 tests are for.
