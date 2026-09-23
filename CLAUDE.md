<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

**Active plan**: `specs/003-ci-cd-pipeline/plan.md` (CI/CD — GitHub Actions, Railway, Vercel)

Supporting documents for that plan:

- `specs/003-ci-cd-pipeline/spec.md` — feature specification (FR-001..FR-030)
- `specs/003-ci-cd-pipeline/research.md` — measured gaps, verified CLI flags, Node 22 proof
- `specs/003-ci-cd-pipeline/data-model.md` — job graph, credentials, run outcomes
- `specs/003-ci-cd-pipeline/contracts/` — workflow contract and one-time setup
- `specs/003-ci-cd-pipeline/quickstart.md` — local verification and pipeline self-tests

**Completed and merged to main**:

- `specs/001-line-item-extraction/` — Part A, the extraction service (`apps/extraction-api`)
- `specs/002-review-web-page/` — Part B, the review page (`apps/web`)

Known gap this feature fixes: `pnpm typecheck` does NOT cover `apps/web`. Verify types with
`npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json`.
`pnpm lint` does not run at all — ESLint is not installed.

Project constitution (binding): `.specify/memory/constitution.md`
<!-- SPECKIT END -->
