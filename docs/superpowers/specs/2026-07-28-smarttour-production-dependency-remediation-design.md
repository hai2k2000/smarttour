# SmartTour Production Dependency Remediation Design

## Status

- Date: 2026-07-28
- Repository: `hai2k2000/smarttour`
- Base: latest `origin/main`
- Delivery: separate pull request before the container privilege-hardening pull request
- Production state: unchanged by this work

## Problem

SmartTour CI fails at `npm audit --omit=dev` on both `main` and the container privilege-hardening pull request. The current production dependency graph reports six vulnerabilities: one low and five high.

| Package | Current lock | Severity | Remediation target |
| --- | --- | --- | --- |
| `@nestjs/swagger` | `11.4.4` | high through `js-yaml` | `11.4.6` |
| `js-yaml` | `4.2.0` through an override | high | `5.2.1` through patched Swagger |
| `body-parser` | `2.2.2` | low | `2.3.0` |
| `next` | `16.2.6` | high | `16.2.12` |
| `postcss` | `8.5.15` | high | `8.5.24` |
| `sharp` | `0.34.5` | high | `0.35.3` |

Automated `npm audit fix` is not suitable because its observed dry run does not fully remediate Sharp and proposes an unsuitable PostCSS resolution. The dependency graph must be changed explicitly and verified as one controlled security change.

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
- No broad dependency modernization beyond packages required to close the current production audit findings.
- No audit suppression, allowlist, or CI bypass.

## Chosen Approach

Create `ops/production-dependency-remediation-20260728` from the latest `origin/main`. Update the direct package ranges to patched versions, remove the obsolete vulnerable Swagger `js-yaml` override, and use explicit root overrides for vulnerable transitive packages only where the normal resolver cannot guarantee the patched version.

The intended manifest and lock outcomes are:

- `apps/api/package.json`: require `@nestjs/swagger` at `^11.4.6`.
- `apps/web/package.json`: require `next` at `^16.2.12`.
- Root overrides: pin `postcss` to `8.5.24` and `sharp` to `0.35.3` because they are transitive/optional Next.js dependencies with security-fixed versions outside the currently locked graph.
- Remove the nested `@nestjs/swagger -> js-yaml@4.2.0` override so patched Swagger resolves `js-yaml@5.2.1`.
- Resolve `body-parser@2.3.0` through its upstream semver range; add an exact root override only if lock regeneration does not select `2.3.0`.
- Regenerate `package-lock.json` with npm; do not hand-edit lockfile dependency nodes.

The user explicitly accepts `sharp@0.35.3` even though it is outside Next.js's previously observed optional `^0.34.5` range, provided the Linux Docker build and smoke checks pass.

## Dependency Flow

The root npm workspace owns the lockfile and security overrides. The API workspace consumes patched Swagger and its YAML parser. The web workspace consumes patched Next.js, while the root overrides force patched PostCSS and Sharp throughout the workspace graph. CI installs the resulting lockfile with `npm ci`, audits only production dependencies, and builds both applications.

No runtime configuration or data flow changes. The only runtime-sensitive item is Sharp's native Linux binary, which must be validated inside the existing web Docker image rather than inferred from a Windows host installation.

## Verification Gates

The pull request is eligible for review only when all gates pass from a clean install:

1. `npm ci` succeeds without lockfile drift.
2. `npm ls @nestjs/swagger js-yaml body-parser next postcss sharp` shows the intended patched versions with no invalid or extraneous production resolution.
3. `npm audit --omit=dev` reports zero vulnerabilities.
4. API TypeScript validation and production build pass.
5. Web TypeScript validation and production build pass.
6. Existing API and web Docker images build successfully on Linux; the web build proves Sharp can install and load for the target platform.
7. Existing relevant smoke/contract checks pass, including public health and web route startup checks available without production credentials.
8. `git diff --check` passes and the diff contains only dependency manifests, lockfile, this spec/plan, and concise Memory Bank updates.
9. GitHub Actions completes successfully on the pull request.

Production-credential-dependent smoke tests are not weakened or bypassed. If they cannot run locally, CI and the later staged production rollout retain those gates.

## Failure Handling

- If npm resolves a vulnerable or invalid graph, adjust only the minimum direct range or override and regenerate the lockfile.
- If `sharp@0.35.3` fails Linux Docker installation, image loading, or web smoke validation, stop the pull request. Do not merge or deploy while Sharp remains vulnerable or incompatible.
- If Next.js, Swagger, API, or web behavior regresses, stop and investigate the dependency delta; do not add application workarounds unless separately designed and approved.
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
- API/web typecheck, production builds, Linux Docker builds, relevant smoke checks, and GitHub Actions pass.
- The pull request remains isolated from container privilege hardening and contains no VPS change.
- The privilege-hardening pull request can be refreshed on the remediated `main` and obtain a meaningful green CI result.
