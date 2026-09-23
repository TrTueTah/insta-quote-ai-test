# Feature Specification: CI/CD Pipeline

**Feature Branch**: `003-ci-cd-pipeline`
**Created**: 2026-09-23
**Status**: Draft
**Input**: User description: "start to create CI/CD. Using github workflow and Railway (for backend), vercel (for frontend). For railway, using RAILWAY_PROJECT, RAILWAY_SERVICE, RAILWAY_ENVIRONMENT, RAILWAY_API_TOKEN. For vercel, using VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A broken change cannot reach the main branch (Priority: P1)

Someone opens a pull request. Before it can be merged, the project is installed from a clean
checkout, both applications are type-checked, the whole test suite runs, and both applications
are built. If any of that fails, the pull request shows it and cannot be merged.

**Why this priority**: This is the only part of the feature that protects the codebase rather
than automating convenience. Deployment automation on top of unverified code is worse than no
automation, because it publishes failures faster. Delivered alone it already has value: the
existing 205 tests stop being something a person has to remember to run.

**Independent Test**: Open a pull request containing a deliberate type error in the web app
and another containing a failing test. Both must be reported as failing checks, and neither
must be mergeable.

**Acceptance Scenarios**:

1. **Given** a pull request whose code is sound, **When** the checks run, **Then** install,
   type-check, test and build all pass and the pull request is reportable as mergeable.
2. **Given** a pull request containing a type error in **either** application, **When** the
   checks run, **Then** the type-check step fails and names the file.
3. **Given** a pull request containing a failing test, **When** the checks run, **Then** the
   test step fails and names the failing test.
4. **Given** any pull request, **When** the checks run, **Then** no step requires an OpenAI
   API key, and no step makes a network call to a model provider.
5. **Given** the checks have run, **When** someone reads the result, **Then** they can tell
   which step failed without opening raw logs.

---

### User Story 2 - Merging to main publishes both halves (Priority: P2)

A change merges to the main branch. The extraction service is deployed, then the web
application is deployed, without anyone running a command by hand. When it finishes, the
deployed site is talking to the deployed service.

**Why this priority**: The deliverable is a working, reachable application. A reviewer
following a link is the point of the project; a repository that only runs locally is a
weaker submission.

**Independent Test**: Merge a visible, harmless change to the main branch. Within minutes,
the public site shows that change and an upload still produces a result from the deployed
extraction service.

**Acceptance Scenarios**:

1. **Given** a merge to the main branch, **When** the deployment runs, **Then** the extraction
   service is deployed and the web application is deployed, in that order.
2. **Given** a deployment has completed, **When** someone uploads a document on the public
   site, **Then** a result comes back from the deployed extraction service, not from a local
   one.
3. **Given** a deployment runs, **When** the verification checks from User Story 1 have not
   passed for that commit, **Then** no deployment happens.
4. **Given** a deployment has completed, **When** someone opens the run, **Then** the
   addresses of both deployed applications are stated so they can be visited without hunting.
5. **Given** a pull request, **When** its checks run, **Then** nothing is deployed and no
   preview environment is created on either hosting platform.

---

### User Story 3 - A half-finished deployment is visible, not silent (Priority: P3)

One half deploys and the other fails. The result is reported plainly, naming which half is
live at the new version and which is not, so whoever is watching knows the two are out of
step rather than discovering it through a broken page.

**Why this priority**: The two applications share a schema package. When one is deployed
without the other, the site can receive a reply it cannot read — a state the web application
already renders honestly, but which should never be caused by our own release process. Silent
skew is the deployment-shaped version of the failure this whole project exists to avoid.

**Independent Test**: Cause the web deployment to fail while the service deployment succeeds.
The run must report which half is at the new version and which is not, in those terms.

**Acceptance Scenarios**:

1. **Given** the extraction service deploys successfully and the web application fails,
   **When** the run finishes, **Then** it reports that the service is at the new version and
   the site is not, and it does not roll either half back or retry.
2. **Given** the extraction service fails to deploy, **When** the run continues, **Then** the
   web application is not deployed, so the site is never moved ahead of the service it depends
   on.
3. **Given** any deployment failure, **When** someone reads the result, **Then** it names
   which step failed rather than reporting only that the run failed.

---

### User Story 4 - Credentials never leak (Priority: P4)

The seven deployment credentials live only in the repository's secret storage. They never
appear in the repository, in logs, or in output that anyone browsing the project can read.

**Why this priority**: A leaked deployment token is the most damaging possible failure of this
feature, and the cheapest to prevent while the pipeline is being written rather than after.

**Independent Test**: Search the repository and a completed run's logs for any of the secret
values. Zero occurrences.

**Acceptance Scenarios**:

1. **Given** the repository at any commit, **When** it is searched for credential values,
   **Then** none are present.
2. **Given** a completed run, **When** its logs are read, **Then** no credential value appears,
   including inside command echoes.
3. **Given** a pull request from outside the repository, **When** its checks run, **Then** they
   run without access to deployment credentials.
4. **Given** a required credential is missing or empty, **When** a deployment starts, **Then**
   it stops with a message naming which credential is absent, rather than failing partway
   through with a provider error.

---

### Edge Cases

- **A pull request touching only documentation**: still verified, because the cost of running
  is low and the cost of a special case that wrongly skips real code is high.
- **Two merges in quick succession**: the later one must end up live. An older run must not
  overwrite a newer deployment.
- **A re-run of an already-deployed commit**: produces the same outcome rather than a
  different one.
- **The shared schema package changes**: both applications are deployed from the same commit,
  so the deployed pair always agree about the contract.
- **The extraction service is still starting when the web application is deployed**: the site
  must not be declared healthy on the strength of the deployment step alone.
- **A credential is valid but points at a project that no longer exists**: reported as a
  named configuration failure rather than a generic deployment error.
- **The test suite passes but a build fails**: treated as a failure; a change that cannot be
  built must not be deployable.
- **A run is cancelled partway**: leaves no half-applied state that a later run cannot
  recover from.
- **The main branch is broken by an administrative override**: the deployment still refuses
  to run without passing checks.

## Requirements *(mandatory)*

### Functional Requirements

**Verification**

- **FR-001**: Every pull request targeting the main branch MUST be verified before merge.
- **FR-002**: Verification MUST install dependencies from a clean checkout using the
  lockfile, so a run reflects the committed dependency set rather than a cached one.
- **FR-003**: Verification MUST type-check **both** applications and the shared package. A
  type error in either application MUST fail the run.
- **FR-004**: Verification MUST run the complete test suite for both applications.
- **FR-005**: Verification MUST build both applications, because a change can pass type-check
  and tests and still fail to build.
- **FR-006**: Verification MUST NOT require an API key for any model provider, and MUST NOT
  make network calls to one.
- **FR-007**: Verification MUST pin the language runtime version, so a run today and a run in
  three months exercise the same thing.
- **FR-008**: Each verification step MUST be separately identifiable, so a failure names what
  failed without anyone reading raw logs.

**Deployment**

- **FR-009**: A merge to the main branch MUST deploy both applications automatically.
- **FR-010**: Deployment MUST NOT run unless the verification in FR-001 through FR-005 has
  passed for that exact commit.
- **FR-011**: The extraction service MUST be deployed before the web application.
- **FR-012**: If the extraction service deployment fails, the web application MUST NOT be
  deployed.
- **FR-013**: Both applications MUST be deployed from the same commit, so the deployed pair
  cannot disagree about the shared schema.
- **FR-014**: After deployment, the pipeline MUST confirm the deployed extraction service
  responds, rather than treating a successful deployment step as proof it is working.
- **FR-015**: A completed deployment MUST report the addresses of both deployed applications.
- **FR-016**: The deployed web application MUST be configured to reach the deployed extraction
  service, not a local one.

**Failure reporting**

- **FR-017**: When one half deploys and the other does not, the result MUST state which half
  is at the new version and which is not.
- **FR-018**: Failure output MUST name the step that failed. A result that says only that the
  run failed is not acceptable.
- **FR-019**: A missing or empty credential MUST stop the deployment with a message naming the
  absent credential, before any deployment is attempted.

**Credentials**

- **FR-020**: All seven credentials MUST be stored in the repository's secret storage and MUST
  NOT appear in the repository at any commit.
- **FR-021**: Credential values MUST NOT appear in any log output, including command echoes
  and error messages.
- **FR-022**: Verification of a pull request originating from a fork MUST run without access
  to deployment credentials.

**Concurrency and repeatability**

- **FR-023**: Two merges in quick succession MUST leave the later commit deployed. An earlier
  run MUST NOT overwrite a later deployment.
- **FR-024**: Re-running the pipeline for an unchanged commit MUST produce the same outcome.

**Where deployments happen**

- **FR-025**: Deployment MUST happen only for the main branch. A pull request MUST be verified
  and MUST NOT be deployed anywhere.
- **FR-026**: A pull request's checks MUST NOT touch either hosting platform — no preview
  environment is created, updated, or deleted, and no deployment credential is read.
- **FR-027**: Neither hosting platform's automatic git integration may deploy on its own. All
  deployment MUST flow through the pipeline, so FR-010's rule — that nothing deploys without
  passing verification — cannot be bypassed by a platform watching the repository directly.

**Recovery from a half-finished deployment**

- **FR-028**: When the extraction service deploys successfully and the web application then
  fails, the pipeline MUST report which half is at the new version and stop. It MUST NOT
  attempt to return either half to a previous version automatically.
- **FR-029**: That report MUST state, in terms a person can act on, that the deployed service
  and the deployed site are from different commits, and name the failed step.
- **FR-030**: The pipeline MUST NOT retry a failed deployment automatically, so a reported
  failure means the failure is real rather than possibly transient and already retried.

### Key Entities

- **Verification run**: The checks performed for one commit — install, type-check, test,
  build. Produces a pass or a named failure.
- **Deployment run**: The publication of one commit to both hosting platforms. Depends on a
  passing verification run for the same commit.
- **Credential**: One of seven stored secrets. Four address the service host, three address
  the site host. Never readable from the repository or from logs.
- **Deployed pair**: The extraction service and the web application as published together
  from a single commit. They are meaningful only as a pair, because they share a schema.
- **Run result**: What a person reads afterwards — which steps passed, which failed, and where
  the deployed applications can be reached.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A change that breaks a test, breaks a type, or breaks a build cannot reach the
  deployed site. Measured by opening one pull request for each of those three faults: all
  three are blocked, zero reach deployment.
- **SC-002**: A type error in either application is caught, in 100% of attempts. This is
  tested for both applications separately, because a check that covers only one gives false
  confidence about the other.
- **SC-003**: The verification suite completes in under 10 minutes from a clean checkout.
- **SC-004**: Verification runs to completion with no model-provider credential configured, in
  100% of runs.
- **SC-005**: Time from merge to both applications being live and working together is under 15
  minutes, with no human action in between.
- **SC-006**: After a deployment, uploading a sample document to the public site returns a
  result, in 100% of attempts.
- **SC-007**: Every one of the seven credential values appears zero times in the repository
  and zero times in run logs.
- **SC-008**: For each of the failure situations in FR-017 through FR-019, the reported result
  names the specific step or credential. Zero results say only that the run failed.
- **SC-009**: A reviewer who has never seen the project can find both deployed addresses from
  a completed run in under 60 seconds.
- **SC-010**: Two merges within one minute of each other leave the later commit deployed, in
  100% of attempts.
- **SC-011**: A pull request produces zero deployments and zero preview environments, in 100%
  of attempts, measured by checking both hosting platforms after the checks complete.
- **SC-012**: When the service deploys and the site then fails, the reported result states
  that the two are from different commits, in 100% of attempts, and zero automatic rollbacks
  or retries occur.

## Out of Scope

- **Changing how either application is built or tested.** This feature runs what already
  exists; it does not restructure it. The one exception is closing the gap in FR-003, where
  the current type-check does not cover both applications.
- **Preview deployments, staging, and per-developer environments.** Pull requests are
  verified only (FR-025).
- **Automatic rollback of a failed release** (FR-028). A half-finished deployment is reported
  for a person to resolve.
- **Database migrations, seeding, or any stateful release step.** Neither application stores
  anything.
- **Monitoring, alerting, uptime checks, and log aggregation** after a deployment completes.
- **Rolling, canary, or blue-green release strategies.**
- **Automated dependency updates and security scanning.**
- **Publishing the shared schema package to a registry.** It is consumed from source inside
  the repository.
- **Cost controls, usage limits, and billing configuration** on either hosting platform.
- **Provisioning the hosting projects themselves.** Both are assumed to exist already, which
  is why their identifiers are supplied as credentials.

## Assumptions

- **Both hosting projects already exist**, and the seven supplied credentials identify them.
  The pipeline deploys into them rather than creating them.
- **The main branch is the release branch.** There is no separate release process, tag, or
  approval gate.
- **Deployment is automatic on merge**, with no manual approval step, which suits a project
  being evaluated rather than one carrying production traffic.
- **The repository is the single source for both applications.** They are always released
  together from one commit, since they share a schema package.
- **The extraction service's model-provider key is configured on the hosting platform**, not
  supplied by the pipeline. The pipeline never handles it, and the test suite never needs it.
- **Existing hosting configuration files are the starting point.** The repository already
  contains deployment configuration for both platforms.
- **The language runtime version will be pinned by this feature.** The repository currently
  pins none, so two runs can differ; FR-007 closes that.
- **The current type-check command does not cover the web application.** This was verified by
  introducing a deliberate type error, which the command did not catch. FR-003 requires this
  to be fixed rather than worked around.
- **The current lint command does not run**, because its tool is not installed. Lint is
  therefore not part of verification until it works; treating a broken command as a passing
  check would be worse than omitting it.
- **Pull requests are verified but never deployed** (FR-025, resolved 2026-09-23). Reviewing
  a change means reading it and running it locally, not clicking a preview. This keeps the
  hosting credentials out of every pull-request run, and avoids the confusing case where a
  preview site speaks a newer schema than the service it points at.
- **A half-finished deployment is reported, never repaired automatically** (FR-028, resolved
  2026-09-23). An automatic rollback is an unrequested action that can itself fail, leaving a
  worse and less obvious state than the one it was fixing. Naming the problem and stopping is
  the same choice this project makes everywhere else: surface it, do not silently resolve it.
- **The skew window is accepted.** Between a failed site deployment and a human acting, the
  deployed service and site may be from different commits. If the schema changed between
  them, the site will say the reply is one it cannot read — which is honest, and is the
  behaviour already specified and tested in Part B.
- **A public deployment makes the site reachable by anyone with the address**, and the
  application has no authentication. This is accepted for an evaluation project, and anything
  uploaded to it is processed by a third-party model provider.
