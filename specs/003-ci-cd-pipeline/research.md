# Phase 0 Research: CI/CD Pipeline

**Feature**: `003-ci-cd-pipeline` | **Date**: 2026-09-23
**Input**: [spec.md](./spec.md) | **Governing**: [constitution.md](../../.specify/memory/constitution.md) v1.0.0

Findings marked **verified** were produced by running something. Findings marked
**unverified** could not be settled without real credentials and are flagged again in
[quickstart.md](./quickstart.md) so they are not mistaken for facts.

## R1. The repository cannot currently verify itself — measured

Three gaps, all confirmed by running the commands rather than reading them.

### `pnpm typecheck` does not cover `apps/web` — **verified**

The root `tsconfig.json` includes `packages/*`, `apps/extraction-api` and `scripts/`. It does
not include `apps/web`. Appending a deliberate error to `apps/web/src/view/format.ts`:

```ts
const deliberateBreak: number = 'nope';
```

`pnpm typecheck` still **exited 0**. A pipeline built on that command would report the web
app as sound no matter what is wrong with it.

This gap was introduced while building Part B: the root config was narrowed when `apps/web`
got its own `tsconfig.json` for JSX and DOM libraries, and nothing re-pointed the root script
at both.

**Decision**: verification runs both projects explicitly:

```bash
tsc --noEmit -p tsconfig.json && tsc --noEmit -p apps/web/tsconfig.json
```

**Verified**: with the same deliberate error in place, this reports
`apps/web/src/view/format.ts(21,7): error TS2322` and exits non-zero.

**Alternatives considered**: TypeScript project references with `tsc -b`. Correct, and better
long-term, but it means restructuring three `tsconfig.json` files — a change to how the apps
build, which the spec puts out of scope. Two invocations are honest and cannot silently cover
only one project.

### `pnpm lint` does not run at all — **verified**

`eslint: command not found`. The script exists and the config file exists, but the tool was
never added as a dependency.

**Decision**: lint is **not** part of verification. `eslint.config.js` and the `lint` script
are left as they are and the README says lint is not wired up.

**Rationale**: a pipeline step that cannot pass would have to be written as `|| true` to get
the pipeline green, and a check that cannot fail is worse than no check — it reports
assurance it does not provide. Installing and configuring ESLint across two apps is a real
piece of work and is not what this feature was asked for.

### No runtime version is pinned — **verified**

No `engines` field, no `.nvmrc`, no `.node-version`. Two runs can use different Node versions
and nothing notices.

**Decision**: pin Node 22 LTS in `.nvmrc` and read that file in the pipeline, so the pinned
version has exactly one home.

## R2. Node 22 actually works — **verified**

The local machine only has Node 25.9.0, so pinning 22 would have been a guess. Settled by
running the whole verification in a `node:22-slim` container against a clean copy of the
repository (no `node_modules`, no `.env`):

```
node: v22.23.2
clean install:  9s
typecheck:     27s   OK
test:           4s   Test Files 30 passed, Tests 205 passed
web build:      8s   OK
```

**Decision**: Node 22 LTS.

**Rationale**: every dependency's declared requirement is satisfied — `next` needs
`>= 20.0.0`, `pdfjs-dist` needs `>= 20`, `vitest` needs `^18 || >= 20`. It is an LTS line,
and both hosting platforms support it. Now demonstrated rather than assumed.

**Total verification time is roughly 50 seconds**, against SC-003's ten-minute budget. There
is no need to optimise, cache aggressively, or split jobs for speed.

**Alternatives considered**: Node 20 (older LTS, also fine, no advantage); Node 24 (newer,
shorter support horizon); matching local 25 (not LTS, and Vercel does not offer it).

## R3. One workflow file, not two

**Decision**: a single workflow triggered by `pull_request` to `main` and `push` to `main`,
with a `verify` job and deployment jobs that declare `needs: verify` and are guarded by a
branch condition.

**Rationale**: FR-010 requires deployment to be impossible without verification passing *for
that exact commit*. Expressed as a job dependency inside one run, that is structural — the
deploy jobs cannot start. Split across two workflow files it becomes a lookup of "did some
other run pass for this SHA", which is a weaker guarantee and easy to get subtly wrong.

**Alternatives considered**: a separate `deploy.yml` triggered by the CI workflow completing.
Rejected for the reason above, and because it doubles the places a branch condition has to
be right.

## R4. The platforms' own git integrations must be turned off — **unverified, and important**

Both Railway and Vercel offer to watch a GitHub repository and deploy on push by themselves.
If either is left enabled, commits reach production **without passing verification at all**,
and FR-010 is satisfied on paper while being false in practice. The pipeline cannot detect
this; it is a setting in each platform's dashboard.

**Decision**: treat it as a required one-time setup step, listed first in
[quickstart.md](./quickstart.md), and state it in the README. FR-027 exists precisely because
choosing "deploy from main only" in a workflow does not by itself achieve deployment only
from main.

**Unverified**: no real project was available to confirm the setting's exact name or location.

## R5. Deploying the extraction service

**Decision**: the Railway CLI, invoked as

```bash
railway up --ci --service "$RAILWAY_SERVICE" \
           --environment "$RAILWAY_ENVIRONMENT" \
           --project "$RAILWAY_PROJECT"
```

**Verified**: Railway CLI 5.59.0 documents exactly these flags — `-s/--service`,
`-e/--environment`, `-p/--project` (a project **ID**), and `-c/--ci` which "stream[s] build
logs only, then exit[s]". The four secret names supplied map onto this without adaptation,
which is a good sign the intended flow is the account-token one.

**Unverified**: the CLI's help output does not mention any token environment variable.
Railway's documentation describes `RAILWAY_API_TOKEN` for an account or team token — which is
consistent with also being given project, service and environment, since a project-scoped
token would make those redundant. The first real run is where this is confirmed, and the
preflight step (R7) will name it clearly if authentication fails.

**Alternatives considered**: Railway's GraphQL API directly (more code, no benefit);
`railway redeploy` (redeploys what is already there rather than shipping this commit).

### What the first real run showed — **now verified**

The first `main` deployment failed:

```
Indexing...
Uploading...
Failed to upload code with status code 404 Not Found
```

Two things follow from where it failed. It got past `Indexing` and `Uploading`, so the token
**authenticated** — an invalid token fails earlier with `Unauthorized. Please login with
railway login`. The 404 is therefore about the target, not the credential: the project,
service or environment did not resolve.

The CLI's own help text explains how this happens quietly:

| Command | `-p, --project` documented as |
|---|---|
| `railway status` | "Project **ID/name** to inspect" |
| `railway up` | "Project **ID** to deploy to" |

A project **name** in `RAILWAY_PROJECT` is accepted by some commands and 404s on upload. That
is the first thing to suspect.

**Decision**: add a *Resolve the Railway target* step before the upload, running
`railway whoami` and then `railway status --project ... --environment ...`, so an unresolvable
target is reported by name with the likely causes ranked — and with `railway list` showing
which projects the token can actually see.

**Rationale**: a bare 404 is the deployment-shaped version of "something went wrong". It does
not say which of three values is wrong, or whether the credential or the target is at fault.
This project does not accept that from the extraction service or from the web page, and it
should not accept it from its own pipeline.

### What the second run showed — **now verified**

With the target resolving, the upload succeeded and the build failed instead:

```
Railpack 0.39.0
  ↳ Detected Node
  ↳ Using pnpm package manager
  ↳ Found workspace with 3 packages
  ✖ No start command detected.
```

**`railway up` uploads the repository root, and Railway reads its configuration from the root
of what was uploaded.** `apps/extraction-api/railway.json` was therefore never read — it had
looked like deployment configuration for a year of this project's life without ever being
consulted. The root `package.json` has no `start` script and no `main`, so Railpack found
nothing and stopped.

**Decision**: a `railway.json` at the repository root declaring
`pnpm --filter @insta-quote/extraction-api start`, **and** a matching `start` script in the
root `package.json`. Railpack's first documented check is that script, so declaring the
command in both places means neither detector has to be the one that works. The stale
`apps/extraction-api/railway.json` is deleted rather than left to mislead.

### A second failure was queued behind the first — **found before it ran**

The service starts with `tsx src/index.ts`, and `tsx` was a **root devDependency**. A
production install prunes devDependencies, so the moment the start command was found the
deployment would have failed again with `tsx: not found`.

**Decision**: `tsx` moves into `apps/extraction-api`'s `dependencies`.

**Verified** in a `node:22-slim` container against a clean copy, with
`pnpm install --frozen-lockfile --prod`:

```
tsx after prod install: present
health: 200
extract: 4 line items, 0 refusals, 0 ambiguities
```

That is the control document extracting correctly from a pruned production install — the
same thing the deployed service has to do.

## R6. Deploying the web application

**Decision**: the Vercel CLI's three-step prebuilt flow:

```bash
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
vercel build --prod --token="$VERCEL_TOKEN"
vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
```

with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` in the environment.

**Verified**: Vercel CLI 59.25.4 documents `--prebuilt`, `--prod`, `--token` and `--yes`.

**Rationale**: building in the pipeline rather than on Vercel means the artifact deployed is
the one this run built from the verified commit. It also makes a build failure a pipeline
failure with readable logs, instead of a deployment that fails somewhere else.

**Unverified**: `vercel deploy` prints the deployment URL to stdout, which the pipeline
captures for the smoke test. The exact output shape has not been confirmed against a real
account, so the capture must tolerate surrounding output rather than assuming the URL is the
only thing printed.

### What the third run showed — **R6 now verified**

`vercel deploy` printed its URL as expected and the capture worked, settling the last
unverified assumption about its output. Both halves deployed. The smoke test then failed
with:

```
line items: ?, refusals: ?, ambiguities: ?
The control document did not produce its expected result (4 / 0 / 0).
Check EXTRACTION_API_URL on the Vercel project first ...
```

**That message was wrong, and confidently so.** The site was answering every request with a
302 to `vercel.com/sso-api` — Vercel Deployment Protection, which intercepts requests to a
`*.vercel.app` deployment address before they reach the application. `EXTRACTION_API_URL` had
nothing to do with it, and a reader following that advice would have spent their time in the
wrong place.

Two causes, both mine:

1. **The check threw away its evidence.** Three `python3 ... || echo "?"` fallbacks turned any
   non-JSON response into `?` and discarded the status, the content type and the body.
2. **It guessed at a cause.** Having no evidence, it named the most likely one. That is the
   deployment-shaped version of the failure this whole project exists to prevent: a specific,
   plausible, wrong answer given in place of "here is what actually happened".

**Decision**: the smoke test now captures the HTTP status, the content type and the response
body; names deployment protection explicitly when it sees a 302, a 401 or an `sso-api`
redirect; prints the first 400 bytes when the reply is not JSON; and suggests
`EXTRACTION_API_URL` **only after** a well-formed result has come back and disagreed — so it
is never offered as an explanation for a site that never answered.

A preceding step also resolves the production alias via `vercel inspect --json` and prefers it
over the deployment-specific URL, since the latter is the one protection covers.

### What the fourth run showed — the mirror image of the Railway bug

The alias resolution worked and Deployment Protection was off, so the site was reachable. It
then answered **404 on every path, including `/`** — not a missing route, but nothing
deployed at all.

`apps/web/vercel.json` reads:

```json
"buildCommand":   "cd ../.. && pnpm --filter @insta-quote/web build",
"installCommand": "cd ../.. && pnpm install --frozen-lockfile"
```

Those `cd ../..` exist because Vercel reads that file **from `apps/web`** and then needs the
monorepo root to install and build. The workflow ran `vercel pull`, `build` and `deploy` at
the repository root, so the file was never read: Vercel auto-detected at the root, found no
Next.js project there — no `app/`, no `pages/`, no `next` dependency — and deployed an empty
one.

**This is the same mistake as the Railway failure, inverted.** Railway needed its config
moved *to* the root because `railway up` uploads the root. Vercel needed its commands run
*from the app directory* because that is where its config lives. Both times the tool and its
configuration were looking at different directories; both times the symptom was a bare "not
found" that said nothing about the cause.

**Decision**: `working-directory: apps/web` on every Vercel command, and a check that the
site serves its home page before the upload is attempted — a deployment of the wrong
directory 404s everywhere, and without that check the failure reads as "the extract route is
missing" rather than "nothing was deployed".

**Unverified**: this could not be tested locally, since `vercel build` needs the account
token. The evidence is strong — the `cd ../..` in a file that must therefore be read from
`apps/web`, and a root with no Next.js project — but the next run is what settles it.

### What the fifth run showed — a job is not the job before it

With the commands running in `apps/web`, `vercel.json` was finally read, and its install
command ran:

```
Running "install" command: `cd ../.. && pnpm install --frozen-lockfile`...
sh: 1: pnpm: not found
```

`deploy-web` had no pnpm. Jobs run on separate runners and share nothing but the repository,
so setting pnpm up in `verify` does nothing for a later job — and `npm install -g vercel`
had worked without any setup, because npm ships with the runner's Node. The one tool that
needed installing appeared not to.

The dependency was also **indirect**: nothing in the workflow's own script calls `pnpm` in
that job. `vercel build` calls it, from a command in a file the workflow never reads. Grepping
the workflow for the tools it uses would not have found this.

**Decision**: `pnpm/action-setup` and `actions/setup-node` with `.nvmrc` in `deploy-web`, and
`actions/setup-node` in `deploy-api` so the Railway CLI runs on the version this project
targets. `deploy-api` needs no pnpm: Railway builds remotely from the uploaded source, so
nothing in that job runs a workspace command.

**Verified** by reproducing the failure and the fix in a `node:22-slim` container from
`apps/web`:

```
before:  sh: 1: pnpm: not found
after:   install command: OK
         build command:   OK
```

A sweep of every job's commands against what the runner provides found no further gaps — but
that sweep reads only the scripts in the workflow, so it would not have caught this one
either. Indirect dependencies are the blind spot.

## R7. Naming a missing credential before anything is attempted

FR-019 requires a missing credential to stop the deployment with a message naming it, rather
than failing partway through with a provider error.

**Decision**: a preflight step that checks all seven values are non-empty and fails listing
every missing name at once.

**Rationale**: GitHub renders an unset secret as an empty string, so without this the run
fails deep inside a CLI with an authentication error that names nothing. Reporting all
missing names together also means a person setting this up for the first time fixes
everything in one pass instead of discovering them one run at a time.

**Care required**: the check must test emptiness without ever echoing a value, or it defeats
FR-021 in the act of enforcing FR-019.

## R8. How the two deployed halves are confirmed to work together

FR-014 forbids treating a successful deployment step as proof the service works, and FR-016
requires the deployed site to reach the deployed service.

**Decision**: after both deployments, upload `sample-files-variant/IB-55871.pdf` to the
**deployed site's** own endpoint and assert four line items come back.

**Rationale**: this single check settles three requirements at once. A result can only come
back if the service deployed, if it is running, and if the site is configured to reach it. A
health check on the service alone would prove less, and would not catch the site pointing at
the wrong address — which is the failure most likely to happen and least likely to be noticed.

`IB-55871.pdf` is the right document because it is the control: four line items, zero
refusals, zero ambiguities. Anything else coming back means something is wrong.

**Decision on configuration**: `EXTRACTION_API_URL` is set once in the Vercel project's
environment, not pushed by the pipeline each run. The pipeline does not manage it; it
verifies the consequence of it being right. This is recorded in quickstart as a setup step.

**Alternatives considered**: having the pipeline write the variable through `vercel env`
every deploy. More moving parts, and it would silently mask the case where someone changed it
by hand — which is exactly the sort of drift the smoke test should expose.

## R9. Concurrency — a later merge must win without cancelling a live deploy

FR-023 requires the later of two quick merges to end up deployed. FR's edge cases also
require a cancelled run to leave nothing half-applied.

**Decision**: one concurrency group per ref, with cancellation **only for pull requests**:

```yaml
concurrency:
  group: pipeline-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

**Rationale**: cancelling a superseded PR check is free — nothing is deployed. Cancelling a
`main` run could interrupt a deployment mid-flight. Queuing instead means runs execute in
order, so the newest commit's run is the last to finish and therefore the one left deployed,
with no deploy ever interrupted.

**Alternatives considered**: `cancel-in-progress: true` everywhere (newest wins faster, at
the risk of killing a live deployment); no concurrency control (two runs racing, and the
older one can land last).

## R10. Pull requests from forks

FR-022 requires fork pull requests to be verified without access to deployment credentials.

**Decision**: rely on GitHub's default — secrets are not provided to workflows triggered by
`pull_request` from a fork — and do not add `pull_request_target`, which would defeat it.

**Rationale**: this is one of the few places where the safe behaviour is the default and the
dangerous one requires opting in. The design decision here is to *not* reach for
`pull_request_target` when a fork PR's checks appear to lack something.

## R11. Resolved unknowns

| Unknown | Resolution |
|---|---|
| Runtime version | Node 22 LTS, pinned in `.nvmrc`, verified in a container (R2) |
| Typecheck covering both apps | Two explicit `tsc --noEmit -p` invocations, verified to catch a web error (R1) |
| Whether lint can be part of CI | No — the tool is not installed, and a check that cannot fail is worse than none (R1) |
| Deploy command for the service | `railway up --ci` with project/service/environment flags, names verified against CLI 5.59.0 (R5) |
| Deploy command for the site | `vercel pull` / `build` / `deploy --prebuilt --prod`, flags verified against CLI 59.25.4 (R6) |
| Proving the pair works | Upload the control document to the deployed site and expect four line items (R8) |
| Concurrency | Queue on `main`, cancel on pull requests (R9) |
| Verification budget | ~50 s measured against a 10-minute target (R2) |

No `NEEDS CLARIFICATION` items remain.
