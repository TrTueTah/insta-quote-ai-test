# Contract: One-Time Setup

**Feature**: `003-ci-cd-pipeline`

The pipeline assumes these are done. It cannot check most of them, which is why they are
written down as a contract rather than left to memory.

## 1. Turn off both platforms' own git deployments — **do this first**

| Platform | What to turn off |
|---|---|
| Railway | the service's GitHub repo trigger / auto-deploy on push |
| Vercel | the project's Git integration production deploys |

**Why this is first**: both platforms will happily watch the repository and deploy on push by
themselves. Leave either on and commits reach production **without passing verification** —
FR-010 looks satisfied and is not. The pipeline cannot detect this (FR-027).

A symptom worth recognising: a deployment appearing seconds after a push, before the
verification job has finished.

## 2. Repository secrets

Seven, exact names:

```
RAILWAY_API_TOKEN      RAILWAY_PROJECT      RAILWAY_SERVICE      RAILWAY_ENVIRONMENT
VERCEL_TOKEN           VERCEL_ORG_ID        VERCEL_PROJECT_ID
```

`RAILWAY_PROJECT` is the project **ID**, not its display name (Railway CLI documents `-p` as
`PROJECT_ID`).

If any is missing the deploy job stops and names it, rather than failing inside a CLI with an
authentication error (FR-019).

## 3. Platform environment variables

Set on the platforms, **not** by the pipeline:

| Platform | Variable | Value |
|---|---|---|
| Railway | `OPENAI_API_KEY` | optional; without it, pages whose layout defeats the rules yield refusals instead of escalating |
| Vercel | `EXTRACTION_API_URL` | the deployed Railway service's public address, no trailing slash |

`EXTRACTION_API_URL` is read by the web app's route handler at request time, so it must be a
runtime variable on the Vercel project. The pipeline does not write it — it verifies the
consequence, via the smoke test. If it is wrong, the smoke test fails with `pair not proven`
rather than a green deployment that does not work.

## 4. Branch protection (recommended, not required)

Require the `verify` check on `main`. The pipeline already refuses to deploy an unverified
commit (FR-010), so this protects the branch rather than the deployment.

## What cannot be verified until the first real run

Flagged so they are not mistaken for settled facts:

1. **`RAILWAY_API_TOKEN` as the CLI's authentication variable.** Consistent with also being
   given project, service and environment, but not confirmed against a live account.
2. **The shape of `vercel deploy`'s stdout**, from which the deployment URL is captured.
3. **Whether the platform git integrations are actually off**, which is a dashboard setting.

The first run is where these are settled. If it fails, these three are the first places to
look.
