import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Structural guards for the CI/CD workflow.
 *
 * A workflow cannot be fully proven by unit tests — the only way to know a broken change is
 * blocked is to open a pull request containing one. But its *shape* can be checked, and every
 * rule asserted here is a single-line edit away from being broken by someone acting
 * reasonably: tightening `needs`, adding a retry, reaching for `pull_request_target` because a
 * fork's checks looked short of something.
 *
 * Without these, each of those edits is invisible until it matters.
 */

const WORKFLOW_PATH = resolve(process.cwd(), '.github/workflows/ci-cd.yml');
const raw = readFileSync(WORKFLOW_PATH, 'utf8');
const workflow = parse(raw) as Record<string, any>;

// `on:` is parsed as the boolean true by YAML 1.1 semantics in some parsers; accept either.
const triggers = (workflow['on'] ?? workflow[true as unknown as string]) as Record<string, any>;

const jobs = (workflow['jobs'] ?? {}) as Record<string, any>;
const jobNames = Object.keys(jobs);

/** Every step across every job, flattened, for whole-file assertions. */
function allSteps(): Array<Record<string, any>> {
  return jobNames.flatMap((name) => (jobs[name]?.steps ?? []) as Array<Record<string, any>>);
}

function jobText(name: string): string {
  return JSON.stringify(jobs[name] ?? {});
}

describe('triggers', () => {
  it('runs on pull requests targeting main and pushes to main, and nothing else', () => {
    expect(Object.keys(triggers).sort()).toEqual(['pull_request', 'push']);
    expect(triggers['pull_request'].branches).toEqual(['main']);
    expect(triggers['push'].branches).toEqual(['main']);
  });

  it('never uses pull_request_target', () => {
    // It would hand repository secrets to code from a fork, defeating FR-022. If a fork's
    // checks look like they are missing something, that is the mechanism working.
    expect(raw).not.toContain('pull_request_target');
  });

  it('has no manual deploy trigger', () => {
    // workflow_dispatch would be a way to deploy something that has not passed verification.
    expect(triggers['workflow_dispatch']).toBeUndefined();
  });
});

describe('concurrency', () => {
  it('cancels superseded pull-request checks but queues on main', () => {
    // Cancelling a main run could interrupt a deployment mid-flight. Queuing means runs
    // execute in order, so the newest commit's run finishes last (FR-023).
    expect(workflow['concurrency'].group).toContain('github.ref');
    expect(String(workflow['concurrency']['cancel-in-progress'])).toContain(
      "github.event_name == 'pull_request'",
    );
  });
});

describe('no step may mask a failure', () => {
  it('nothing carries continue-on-error', () => {
    // A deployment that failed must fail its job, or the report describes a state that did
    // not happen.
    expect(raw).not.toContain('continue-on-error');
    for (const step of allSteps()) {
      expect(step['continue-on-error']).toBeUndefined();
    }
  });
});

describe('credentials', () => {
  it('contains no literal that looks like a credential', () => {
    // A value pasted in place of a `secrets.` reference must fail here rather than in review.
    expect(raw).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}/);
    expect(raw).not.toMatch(/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{16,}/);
    // A long opaque assignment that is not an expression reference.
    expect(raw).not.toMatch(/(TOKEN|SECRET|KEY)\s*[:=]\s*["']?[A-Za-z0-9_-]{24,}["']?\s*$/m);
  });

  it('never enables shell command tracing', () => {
    // `set -x` would print expanded variables, putting credential values into the log.
    expect(raw).not.toMatch(/set\s+-[a-z]*x/);
  });
});

describe('the verify job', () => {
  const verify = jobs['verify'];

  it('exists and runs for both triggers', () => {
    expect(verify).toBeDefined();
    expect(verify['if']).toBeUndefined(); // unguarded: runs for pull requests AND pushes
  });

  it('references no secrets at all', () => {
    // Stronger than "does not use them": they must not appear, so a fork pull request is
    // safe by construction rather than by policy (FR-022).
    expect(jobText('verify')).not.toContain('secrets.');
  });

  it('never references a model-provider key', () => {
    // FR-006: verification must run with no OPENAI_API_KEY configured.
    expect(jobText('verify')).not.toContain('OPENAI');
  });

  it('pins the runtime from .nvmrc rather than hard-coding a version', () => {
    const setupNode = (verify.steps as Array<Record<string, any>>).find((s) =>
      String(s['uses'] ?? '').startsWith('actions/setup-node'),
    );
    expect(setupNode?.['with']?.['node-version-file']).toBe('.nvmrc');
    expect(setupNode?.['with']?.['node-version']).toBeUndefined();
  });

  it('installs with a frozen lockfile', () => {
    expect(jobText('verify')).toContain('--frozen-lockfile');
  });

  it('typechecks both projects as separately named steps', () => {
    // One combined step would report "typecheck failed" without saying which project, and
    // that is the shape that hid the apps/web gap in the first place.
    const names = (verify.steps as Array<Record<string, any>>).map((s) => String(s['name'] ?? ''));

    const typecheckSteps = names.filter((n) => n.toLowerCase().startsWith('typecheck'));
    expect(typecheckSteps).toHaveLength(2);

    expect(jobText('verify')).toContain('-p tsconfig.json');
    expect(jobText('verify')).toContain('-p apps/web/tsconfig.json');
  });

  it('runs the tests and builds the web application', () => {
    const text = jobText('verify');
    expect(text).toContain('vitest run');
    expect(text).toContain('@insta-quote/web build');
  });
});

describe('the deploy jobs', () => {
  it('both are guarded to pushes only, so a pull request deploys nothing', () => {
    // FR-025: pull requests are verified, never deployed, and never touch either platform.
    for (const name of ['deploy-api', 'deploy-web']) {
      expect(String(jobs[name]?.['if']), name).toContain("github.event_name == 'push'");
    }
  });

  it('deploy-api needs verify, so nothing deploys unverified', () => {
    expect(jobs['deploy-api']?.needs).toBe('verify');
  });

  it('deploy-web needs deploy-api, NOT verify', () => {
    // FR-012. Relaxing this to `needs: verify` is a one-word edit that reads as a harmless
    // parallelisation and silently allows the site to move ahead of the service it depends
    // on. The two share packages/contracts, so that skew is user-visible.
    expect(jobs['deploy-web']?.needs).toBe('deploy-api');
    expect(jobs['deploy-web']?.needs).not.toBe('verify');
  });

  it('each deploy job checks its credentials before running any CLI', () => {
    // A missing secret must be named (FR-019), not surface as an authentication error from
    // deep inside a tool.
    for (const [job, cliStep] of [
      ['deploy-api', 'Install Railway CLI'],
      ['deploy-web', 'Install Vercel CLI'],
    ] as const) {
      const names = (jobs[job].steps as Array<Record<string, any>>).map((s) => String(s['name'] ?? ''));
      const checkIndex = names.findIndex((n) => n.toLowerCase().includes('credentials are present'));
      const cliIndex = names.indexOf(cliStep);

      expect(checkIndex, `${job} has a credential check`).toBeGreaterThan(-1);
      expect(checkIndex, `${job} checks credentials before installing its CLI`).toBeLessThan(cliIndex);
    }
  });

  it('the credential checks name the variables without printing their values', () => {
    // Asserted against the raw file: the invariant is about what the YAML says, and
    // JSON.stringify would escape the quotes out of recognition.
    for (const name of [
      'RAILWAY_API_TOKEN',
      'RAILWAY_PROJECT',
      'RAILWAY_SERVICE',
      'RAILWAY_ENVIRONMENT',
      'VERCEL_TOKEN',
      'VERCEL_ORG_ID',
      'VERCEL_PROJECT_ID',
    ]) {
      // Each is tested for emptiness...
      expect(raw, name).toContain(`[ -n "$${name}" ]`);
      // ...and named in the failure message by literal, not by expansion.
      expect(raw, name).toContain(`missing+=("${name}")`);
    }

    // No step ever echoes a credential variable's expansion.
    expect(raw).not.toMatch(/echo\s+"?\$\{?(RAILWAY_API_TOKEN|VERCEL_TOKEN)\b/);
  });

  it('proves the deployed pair works rather than trusting the deploy step', () => {
    // FR-014. The check goes through the deployed SITE, not the service, because that is the
    // only way to catch the site pointing at the wrong service.
    const text = jobText('deploy-web');
    expect(text).toContain('IB-55871.pdf');
    expect(text).toContain('/api/extract');
  });

  it('the smoke test reports what came back rather than guessing at a cause', () => {
    // An earlier version printed "?" for each count and told the reader to check
    // EXTRACTION_API_URL. The real cause was a 302 to Vercel's login, so the message sent
    // the reader somewhere irrelevant. A diagnostic that names the wrong cause confidently is
    // worse than one that shows the evidence.
    const text = jobText('deploy-web');

    expect(text).toContain('%{http_code}');       // the status is captured
    expect(text).toContain('content_type');        // and the content type
    expect(text).toContain('sso-api');             // deployment protection is named, not guessed at
    expect(text).toContain('head -c');             // the body is shown when it is not JSON

    // EXTRACTION_API_URL is only suggested once a well-formed result has come back, so it is
    // never offered as an explanation for a site that never answered.
    const extractIdx = text.indexOf('EXTRACTION_API_URL');
    const jsonIdx = text.indexOf('not JSON');
    expect(extractIdx).toBeGreaterThan(jsonIdx);
  });
});

describe('Vercel deployment configuration', () => {
  const steps = (jobs['deploy-web'].steps ?? []) as Array<Record<string, any>>;

  it('runs every vercel command in apps/web, not at the repository root', () => {
    // apps/web/vercel.json is read from apps/web and its commands cd to the monorepo root
    // themselves. Run from the root, that file is never read: Vercel auto-detects at the
    // root, finds no Next.js project there, and deploys an empty one that answers 404 on
    // every path. That is how the first real deployment failed.
    const vercelSteps = steps.filter((step) => String(step['run'] ?? '').includes('vercel '));

    expect(vercelSteps.length).toBeGreaterThan(0);
    for (const step of vercelSteps) {
      expect(step['working-directory'], String(step['name'])).toBe('apps/web');
    }
  });

  it('checks the site serves a home page before testing the upload route', () => {
    // A deployment of the wrong directory 404s on every path. Without this the failure reads
    // as "the extract route is missing" rather than "nothing was deployed".
    const text = jobText('deploy-web');
    expect(text).toContain('home_status');
  });

  it('sets up pnpm, because vercel build shells out to it', () => {
    // vercel build runs the installCommand from apps/web/vercel.json, which is
    // `cd ../.. && pnpm install --frozen-lockfile`. Jobs run on separate runners and share
    // nothing but the repository, so pnpm being set up in `verify` does nothing here.
    //
    // `npm install -g vercel` works without any setup because npm ships with the runner's
    // Node, which is what made this gap easy to miss.
    const uses = steps.map((step) => String(step['uses'] ?? ''));

    expect(uses.some((u) => u.startsWith('pnpm/action-setup'))).toBe(true);
    expect(uses.some((u) => u.startsWith('actions/setup-node'))).toBe(true);
  });

  it('pins the runtime from .nvmrc in every job that runs Node', () => {
    // A deploy job on a different Node version from the one `verify` proved is a silent way
    // to ship something that was never tested on that runtime.
    for (const job of ['verify', 'deploy-api', 'deploy-web']) {
      const setupNode = ((jobs[job].steps ?? []) as Array<Record<string, any>>).find((step) =>
        String(step['uses'] ?? '').startsWith('actions/setup-node'),
      );
      expect(setupNode?.['with']?.['node-version-file'], job).toBe('.nvmrc');
    }
  });

  it('the smoke test itself runs at the repository root, where the sample files are', () => {
    const smoke = steps.find((step) => String(step['run'] ?? '').includes('IB-55871.pdf'));
    expect(smoke?.['working-directory']).toBeUndefined();
  });
});

describe('the report job', () => {
  it('runs even when a deploy failed', () => {
    expect(String(jobs['report']?.['if'])).toContain('always()');
  });

  it('reads no secrets', () => {
    expect(jobText('report')).not.toContain('secrets.');
  });

  it('distinguishes the three deployment outcomes by name', () => {
    const text = jobText('report');
    expect(text).toContain('Both live');
    expect(text).toContain('Neither half moved');
    expect(text).toContain('The two halves disagree');
  });

  it('never reports a bare "deploy failed"', () => {
    // It cannot distinguish "nothing moved" from "the service moved and the site did not",
    // and those need different responses (FR-018).
    expect(jobText('report').toLowerCase()).not.toMatch(/"deploy failed"|deployment failed\./);
  });
});

describe('no automatic recovery', () => {
  it('has no retry or rollback anywhere', () => {
    // FR-030 forbids both. Either could be added later as a well-meant improvement: a
    // rollback can itself fail, leaving a worse and less obvious state, and a retry makes a
    // reported failure ambiguous about whether it was real.
    expect(raw).not.toMatch(/\brollback\b/i);
    expect(raw).not.toMatch(/\bretry\b|\bretries\b|nick-fields\/retry/i);
    expect(raw).not.toContain('railway rollback');
    expect(raw).not.toContain('vercel rollback');
  });
});

describe('Railway deployment configuration', () => {
  const railway = JSON.parse(
    readFileSync(resolve(process.cwd(), 'railway.json'), 'utf8'),
  ) as Record<string, any>;

  const rootPackage = JSON.parse(
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
  ) as Record<string, any>;

  it('railway.json sits at the repository root, where Railway actually reads it', () => {
    // `railway up` uploads the repository root, and Railway reads its config from the root of
    // what was uploaded. A railway.json inside apps/extraction-api/ is never read: the first
    // real deployment failed with "No start command detected" for exactly this reason.
    expect(railway.deploy?.startCommand).toBeTruthy();
  });

  it('declares a start command that runs the extraction service', () => {
    expect(railway.deploy.startCommand).toContain('extraction-api');
  });

  it('the root package.json also has a start script', () => {
    // Railpack's first documented check is a "start" script in package.json. Declaring the
    // command in both places means neither detector has to be the one that works.
    expect(rootPackage.scripts?.start).toContain('extraction-api');
  });

  it('tsx is a runtime dependency of the service, not a root devDependency', () => {
    // The service starts with `tsx src/index.ts`. A production install prunes
    // devDependencies, so tsx living only in the root devDependencies would fail at runtime
    // the moment the start command was found -- a second failure queued behind the first.
    const api = JSON.parse(
      readFileSync(resolve(process.cwd(), 'apps/extraction-api/package.json'), 'utf8'),
    ) as Record<string, any>;

    expect(api.dependencies?.tsx).toBeTruthy();
    expect(api.devDependencies?.tsx).toBeFalsy();
  });

  it('points its health check at a route the service actually serves', () => {
    expect(railway.deploy.healthcheckPath).toBe('/health');
  });
});
