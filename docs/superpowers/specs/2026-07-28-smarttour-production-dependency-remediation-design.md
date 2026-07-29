# SmartTour Production Dependency Remediation Design

## Status

- Date: 2026-07-28
- Repository: `hai2k2000/smarttour`
- Base: latest `origin/main`
- Delivery: separate pull request before the container privilege-hardening pull request
- Production state: unchanged by this work
- Revision: 2026-07-28 advisory refresh approved parent-scoped overrides, raised the js-yaml target to `5.2.2`, and explicitly approved the npm `10.9.3` fresh-lock refresh after targeted lock preservation could not produce a safe graph

## Problem

SmartTour CI fails at `npm audit --omit=dev` on both `main` and the container privilege-hardening pull request. The current production dependency graph reports six vulnerabilities: one low and five high.

| Package | Current lock | Severity | Remediation target |
| --- | --- | --- | --- |
| `@nestjs/swagger` | `11.4.4` | high through `js-yaml` | `11.4.6` |
| `js-yaml` | `4.2.0` through an override | high | `5.2.2` through a Swagger-scoped override |
| `body-parser` | `2.2.2` | low | `2.3.0` |
| `next` | `16.2.6` | high | `16.2.12` |
| `postcss` | `8.5.15` | high | `8.5.24` |
| `sharp` | `0.34.5` | high | `0.35.3` |

Automated `npm audit fix` is not suitable because its observed dry run does not fully remediate Sharp and proposes an unsuitable PostCSS resolution. The dependency graph must be changed explicitly and verified as one controlled security change.

During the first Task 2 attempt, the live audit database added `GHSA-pm4m-ph32-ghv5`, which affects js-yaml `5.0.0` through `5.2.1`. Swagger `11.4.6` pins `js-yaml@5.2.1`, so the originally approved target is no longer safe. The same attempt proved that npm `11.8.0` does not materialize the required parent-scoped Swagger and Next overrides in a fresh lock graph. An isolated npm `10.9.3` regeneration produced the exact approved graph and a zero-finding production audit, so the user approved pinning lock generation to npm `10.9.3` while retaining local npm 11, CI, and Linux Docker validation as compatibility gates. Follow-up Task 3 validation proved that npm 10's `--package-lock-only` path omitted required Nest CLI transitive package entries even though `npm ci` exited successfully; the approved generator therefore uses a full `--ignore-scripts --include=dev` install so the lock captures the complete workspace development graph.

## Goals

1. Make `npm audit --omit=dev` report zero vulnerabilities.
2. Preserve SmartTour API and web behavior.
3. Prove the patched graph works in the authoritative Linux Docker build path.
4. Keep the change isolated from container privilege hardening and production rollout.
5. Provide a clean CI base so the privilege-hardening pull request can be refreshed and revalidated.

## Non-Goals

- No application feature or business-logic changes.
- No database schema, migration, seed, or production-data changes.
- No Docker Compose privilege, resource, port, volume, network, or secret changes.
- No VPS deployment as part of this pull request.
- No direct dependency modernization beyond the approved Swagger and Next.js range changes.
- The npm `10.9.3` fresh-lock refresh may update transitive, development, and optional resolutions already permitted by existing manifest ranges. The user explicitly approved that broader npm-generated lock delta after base-lock and targeted-update attempts either retained vulnerable nodes or still caused material partial churn.
- No audit suppression, allowlist, or CI bypass.

## Chosen Approach

Create `ops/production-dependency-remediation-20260728` from the latest `origin/main`. Update the direct package ranges to patched versions and use explicit parent-scoped overrides for the vulnerable transitive packages whose current parent releases still declare unsafe versions.

Generate the lockfile from the current manifests with npm `10.9.3` rather than preserving the old vulnerable lock graph. This refresh is expected to update additional transitive, development, and optional resolutions within existing semver ranges. Those indirect updates are accepted only as one npm-generated lock snapshot and must pass the complete local, Linux Docker, smoke, and GitHub CI regression gates; no additional direct manifest ranges may change.

The intended manifest and lock outcomes are:

- `apps/api/package.json`: require `@nestjs/swagger` at `^11.4.6`.
- `apps/web/package.json`: require `next` at `^16.2.12`.
- Under `@nestjs/swagger`, pin `js-yaml` to `5.2.2` because Swagger `11.4.6` still declares the newly vulnerable exact `5.2.1` release.
- Under `next`, pin `postcss` to `8.5.24` and `sharp` to `0.35.3` because Next.js `16.2.12` still declares vulnerable PostCSS `8.4.31` and optional Sharp `^0.34.5` resolutions.
- Resolve `body-parser@2.3.0` through its upstream semver range; add an exact root override only if lock regeneration does not select `2.3.0`.
- Regenerate `package-lock.json` with `npx --yes npm@10.9.3 install --ignore-scripts --no-audit --include=dev`; do not use `--package-lock-only`, hand-edit lockfile dependency nodes, or change the project's runtime package manager.

The complete intended root override structure is:

```json
"overrides": {
  "@nestjs/platform-express": {
    "multer": "2.2.0"
  },
  "@nestjs/swagger": {
    "js-yaml": "5.2.2"
  },
  "next": {
    "postcss": "8.5.24",
    "sharp": "0.35.3"
  }
}
```

The user explicitly accepts `sharp@0.35.3` even though it is outside Next.js's previously observed optional `^0.34.5` range, provided the Linux Docker build and smoke checks pass.

## Dependency Flow

The root npm workspace owns the lockfile and security overrides. The API workspace consumes patched Swagger, whose parent-scoped override forces the safe YAML parser. The web workspace consumes patched Next.js, whose parent-scoped overrides force patched PostCSS and Sharp. CI installs the resulting lockfile with `npm ci`, audits only production dependencies, and builds both applications.

No runtime configuration or data flow changes. The only runtime-sensitive item is Sharp's native Linux binary, which must be validated inside the existing web Docker image rather than inferred from a Windows host installation.

## Verification Gates

The pull request is eligible for review only when a full npm `10.9.3` install generates the lockfile and all gates pass from a clean install:

1. Local npm `11.8.0` `npm ci` succeeds without lockfile drift, proving the generated lockfile remains consumable by the developer toolchain.
2. `npx --yes npm@10.9.3 ls @nestjs/swagger js-yaml body-parser next postcss sharp` shows the intended patched versions with valid parent-scoped overrides. npm 11's `npm ls` currently reports these intentional override resolutions as semver-invalid even after a successful install, so npm 10.9.3 is the exact-tree inspection tool while npm 11 remains an install compatibility gate.
3. The lock and installed tree contain every direct dependency declared by the resolved `@nestjs/cli`, and the API production build can load the Nest CLI after Prisma generation.
4. `npm audit --omit=dev` reports zero vulnerabilities.
5. API TypeScript validation and production build pass.
6. Web TypeScript validation and production build pass.
7. Existing API and web Docker images build successfully on Linux; the web build proves Sharp can install and load for the target platform.
8. Existing relevant smoke/contract checks pass, including public health and web route startup checks available without production credentials.
9. `git diff --check` passes and the diff contains only dependency manifests, lockfile, this spec/plan, and concise Memory Bank updates.
10. GitHub Actions completes successfully on the pull request.
11. Lock-delta review confirms every direct manifest change is approved, all broader version movement is confined to npm-generated transitive/development/optional resolutions, and no application, CI, Docker, Prisma, environment, or deployment file is included.

Production-credential-dependent smoke tests are not weakened or bypassed. If they cannot run locally, CI and the later staged production rollout retain those gates.

## Failure Handling

- If npm `10.9.3` resolves a vulnerable or invalid graph, adjust only the minimum direct range or override and regenerate the lockfile with the same pinned npm version.
- If the pinned lock generator does not produce `js-yaml@5.2.2`, `postcss@8.5.24`, and `sharp@0.35.3` in a fresh lock graph, stop without committing and reassess the npm resolver strategy.
- If `sharp@0.35.3` fails Linux Docker installation, image loading, or web smoke validation, stop the pull request. Do not merge or deploy while Sharp remains vulnerable or incompatible.
- If Next.js, Swagger, API, or web behavior regresses, stop and investigate the dependency delta; do not add application workarounds unless separately designed and approved.
- If any regression gate fails because of a broader fresh-lock resolution, keep the pull request blocked and either constrain that specific dependency through a separately reviewed manifest change or abandon the candidate; do not suppress the failure.
- If `npm audit` still reports any production vulnerability, the remediation is incomplete and the pull request remains blocked.
- Never bypass the audit step or weaken CI to make the pull request green.

## Integration Sequence

1. Implement, verify, review, and merge the dependency remediation pull request into `main`.
2. Merge the updated `origin/main` into `ops/container-privilege-hardening-20260728`.
3. Re-run the privilege-hardening pull request CI against the remediated dependency graph.
4. Merge privilege hardening only after its CI is green.
5. Perform production preflight and the existing staged privilege-hardening rollout separately, with runtime evidence and rollback readiness.

This ordering separates dependency risk from container runtime-policy risk and makes failures attributable to one change set.

## Rollback

- Before merge: leave the branch unmerged and correct or abandon the candidate.
- After merge but before production: revert the dependency remediation pull request on `main`.
- After a later production deployment: redeploy the last known-good commit/image using the existing SmartTour rollback runbook.

No database rollback, volume deletion, backup deletion, secret rotation, or data migration is required because this design changes no persistent data.

## Acceptance Criteria

- The six current production audit findings are absent.
- The exact patched package graph is visible in `package-lock.json` and `npm ls`.
- The lockfile is generated with npm `10.9.3` and installs cleanly with local npm `11.8.0`, CI, and the Linux Docker build path.
- The explicitly approved fresh-lock delta changes no unapproved direct dependency range; additional changes are npm-generated transitive, development, or optional resolutions and pass the full regression suite.
- API/web typecheck, production builds, Linux Docker builds, relevant smoke checks, and GitHub Actions pass.
- The pull request remains isolated from container privilege hardening and contains no VPS change.
- The privilege-hardening pull request can be refreshed on the remediated `main` and obtain a meaningful green CI result.
