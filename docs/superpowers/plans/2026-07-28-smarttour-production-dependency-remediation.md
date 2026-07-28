# SmartTour Production Dependency Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six vulnerable production dependency resolutions with patched versions, restore a green production audit, and unblock the existing container privilege-hardening pull request without changing SmartTour application behavior or production state.

**Architecture:** Keep the remediation in one dependency-only branch from `origin/main`. Update the two direct workspace dependencies, replace vulnerable root overrides, generate a fresh root npm lockfile with npm `10.9.3`, and use local npm 11 plus the existing CI/Docker paths as compatibility and behavioral gates. The user explicitly accepts the broader npm-generated transitive/development/optional lock refresh because attempts to preserve or target-update the base lock retained vulnerable nodes. Do not add any other direct dependency range, application code, database change, CI exception, or VPS change.

**Tech Stack:** npm workspaces and lockfile v3, npm `10.9.3` for lock generation, local npm `11.8.0` for compatibility validation, Node.js 22, NestJS 11, Next.js 16, Docker/Alpine, GitHub Actions.

---

## File Map

- Modify `apps/api/package.json`: raise the direct Swagger floor to the patched release.
- Modify `apps/web/package.json`: raise the direct Next.js floor to the patched release.
- Modify `package.json`: replace the vulnerable Swagger/js-yaml override with parent-scoped Swagger and Next overrides while retaining the existing Multer override.
- Modify `package-lock.json`: generate a fresh npm `10.9.3` snapshot so all workspace and transitive nodes match the manifests, accepting npm-generated indirect updates within existing ranges while keeping all unapproved direct manifest ranges unchanged.
- Modify `memory-bank/activeContext.md`: replace the design-only candidate note with verified remediation status.
- Modify `memory-bank/progress.md`: record completed candidate verification and the remaining merge sequence.
- Do not modify `.github/workflows/smarttour-ci.yml`: it already runs `npm ci`, the production audit, source contracts, API/web typecheck, and Linux Docker builds.
- Do not modify application source, Prisma files, Dockerfiles, Docker Compose, environment files, secrets, volumes, or deployment scripts.

### Task 1: Reproduce the security baseline

**Files:**
- Read: `package-lock.json`
- Read: `.github/workflows/smarttour-ci.yml`
- Test: existing npm production audit

- [ ] **Step 1: Confirm the isolated branch and clean worktree**

Run:

```powershell
git branch --show-current
git status --short --branch
```

Expected: branch is `ops/production-dependency-remediation-20260728`; only the approved design and implementation-plan documentation are ahead of `origin/main`, and the worktree is clean before implementation changes.

- [ ] **Step 2: Run the existing production audit as the RED test**

Run:

```powershell
npm audit --omit=dev
```

Expected: exit code `1`, with six production findings: one low and five high across `@nestjs/swagger`, `js-yaml`, `body-parser`, `next`, `postcss`, and `sharp`.

- [ ] **Step 3: Record the exact vulnerable lock resolutions**

Run:

```powershell
node -e "const l=require('./package-lock.json'); for (const n of ['node_modules/@nestjs/swagger','node_modules/js-yaml','node_modules/body-parser','node_modules/next','node_modules/postcss','node_modules/sharp']) console.log(n.replace('node_modules/','')+' '+l.packages[n].version);"
```

Expected:

```text
@nestjs/swagger 11.4.4
js-yaml 4.2.0
body-parser 2.2.2
next 16.2.6
postcss 8.5.15
sharp 0.34.5
```

### Task 2: Update manifests and regenerate the lockfile

The user explicitly approved a fresh npm `10.9.3` lock refresh after quality review found broad indirect churn and controlled experiments proved that base-lock regeneration and targeted npm updates retained vulnerable nodes. Treat the expanded lock delta as accepted scope only when every additional change is indirect and Tasks 3-4 plus GitHub CI pass.

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: existing npm audit and npm dependency-tree validation

- [ ] **Step 1: Raise the direct Swagger dependency**

In `apps/api/package.json`, replace the Swagger dependency with:

```json
"@nestjs/swagger": "^11.4.6"
```

Keep every other API dependency unchanged.

- [ ] **Step 2: Raise the direct Next.js dependency**

In `apps/web/package.json`, replace the Next.js dependency with:

```json
"next": "^16.2.12"
```

Keep React, React DOM, and every other web dependency unchanged.

- [ ] **Step 3: Replace the vulnerable root overrides with parent-scoped overrides**

In `package.json`, make the complete `overrides` object exactly:

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

The Swagger-scoped override moves js-yaml beyond the newly vulnerable `5.2.1` pin. The Next-scoped overrides are required because Next.js `16.2.12` still declares PostCSS `8.4.31` and optional Sharp `^0.34.5`. Do not add a body-parser override because Express `5.2.1` declares `body-parser` as `^2.2.1`, which resolves the patched `2.3.0` release.

- [ ] **Step 4: Regenerate the lockfile with the pinned npm resolver**

Run:

```powershell
npx --yes npm@10.9.3 install --package-lock-only --ignore-scripts --no-audit
```

Expected: exit code `0`; only `package-lock.json` changes beyond the three edited manifests. npm `10.9.3` must materialize the parent-scoped Swagger and Next overrides exactly. A fresh lock may update additional transitive, development, and optional resolutions allowed by existing ranges; do not add another direct dependency change, hand-edit lockfile nodes, or change the globally installed npm version.

- [ ] **Step 5: Verify the patched dependency tree**

Run:

```powershell
npx --yes npm@10.9.3 ls @nestjs/swagger js-yaml body-parser next postcss sharp
```

Expected: exit code `0`; npm `10.9.3` reports the production graph as `@nestjs/swagger@11.4.6`, `js-yaml@5.2.2`, `body-parser@2.3.0`, `next@16.2.12`, `postcss@8.5.24`, and `sharp@0.35.3`, with all parent-scoped overrides valid and no invalid/extraneous production resolution. Do not use npm 11's `npm ls` result as the exact-tree gate because it currently flags these intentional override resolutions as semver-invalid.

- [ ] **Step 6: Run the GREEN production audit**

Run:

```powershell
npm audit --omit=dev
```

Expected: exit code `0` and `found 0 vulnerabilities`. If any production finding remains, stop without committing and adjust only the minimum dependency range or override needed to remove that finding.

- [ ] **Step 7: Confirm the dependency-only diff**

Run:

```powershell
git diff -- apps/api/package.json apps/web/package.json package.json package-lock.json
git diff --check
```

Expected: the three manifest files contain only the approved Swagger, Next.js, and override edits. The fresh lock includes the six required patched production resolutions and may include the explicitly approved npm-generated indirect refresh. Record the lock entry/version delta for review; no application, CI, Docker, Prisma, environment, or deployment file changes may appear.

- [ ] **Step 8: Commit the dependency graph**

Run:

```powershell
git add apps/api/package.json apps/web/package.json package.json package-lock.json
git commit -m "fix: remediate production dependency vulnerabilities"
```

Expected: one focused dependency commit after the design commit.

### Task 3: Validate a clean install and both applications

**Files:**
- Read: `package-lock.json`
- Test: API/web typecheck and production builds

- [ ] **Step 1: Prove the lockfile supports a clean install**

Run:

```powershell
npm ci
```

Expected: exit code `0` under local npm `11.8.0`, no lockfile drift, and no invalid override or native-package installation error. This proves npm 11 can consume the npm 10-generated lockfile even though it cannot generate the required graph from scratch.

- [ ] **Step 2: Generate the Prisma client exactly as CI does**

Run:

```powershell
npx prisma generate
```

Expected: exit code `0`; Prisma Client generation completes without modifying tracked Prisma schema or migration files.

- [ ] **Step 3: Typecheck the API**

Run:

```powershell
npm run lint --workspace @smarttour/api
```

Expected: exit code `0` with no TypeScript errors.

- [ ] **Step 4: Build the API**

Run:

```powershell
npm run build --workspace @smarttour/api
```

Expected: exit code `0`; Nest production output is generated successfully and remains untracked.

- [ ] **Step 5: Typecheck the web application**

Run:

```powershell
npm run lint --workspace @smarttour/web
```

Expected: exit code `0` with no TypeScript errors.

- [ ] **Step 6: Build the web application with the production public API URL**

Run:

```powershell
$env:NEXT_PUBLIC_API_URL = 'https://aitour.io.vn'
npm run build --workspace @smarttour/web
Remove-Item Env:NEXT_PUBLIC_API_URL
```

Expected: exit code `0`; Next.js `16.2.12` produces the standalone production build without Sharp/PostCSS errors.

- [ ] **Step 7: Run adjacent CI and Dockerfile contracts**

Run:

```powershell
node scripts/test-github-actions-contract.js
node scripts/test-dockerfile-npm-ci-contract.js
node scripts/test-docker-compose-resource-limits-contract.js
node scripts/test-health-controller-public-contract.js
```

Expected: each command exits `0` with its success marker. The dependency remediation must not weaken existing CI install/audit/build ordering, public health behavior, or Compose resource policy.

### Task 4: Validate the authoritative Linux Docker path

**Files:**
- Read: `apps/api/Dockerfile`
- Read: `apps/web/Dockerfile`
- Test: Linux/Alpine image builds and Sharp runtime loading

- [ ] **Step 1: Build the API image from the repository root**

Run:

```powershell
docker build --file apps/api/Dockerfile --tag smarttour-api:dependency-remediation .
```

Expected: exit code `0`; the Alpine dependency stage completes `npm ci`, Prisma generation succeeds, and the API production build completes.

- [ ] **Step 2: Build the web dependency stage on Linux/Alpine**

Run:

```powershell
docker build --target deps --file apps/web/Dockerfile --tag smarttour-web-deps:dependency-remediation .
```

Expected: exit code `0`; `npm ci` installs the overridden PostCSS and Sharp graph inside the Linux/Alpine dependency stage.

- [ ] **Step 3: Prove Sharp loads inside the Linux dependency image**

Run:

```powershell
docker run --rm --entrypoint node smarttour-web-deps:dependency-remediation -e "const sharp=require('sharp'); if (sharp.versions.sharp !== '0.35.3') throw new Error('unexpected sharp '+sharp.versions.sharp); console.log('SHARP_LINUX_LOAD_OK '+sharp.versions.sharp);"
```

Expected: exit code `0` and `SHARP_LINUX_LOAD_OK 0.35.3`. If the native package cannot load or reports another version, stop; do not merge, deploy, or weaken the override.

- [ ] **Step 4: Build the complete web production image**

Run:

```powershell
docker build --build-arg NEXT_PUBLIC_API_URL=https://aitour.io.vn --file apps/web/Dockerfile --tag smarttour-web:dependency-remediation .
```

Expected: exit code `0`; Next.js `16.2.12` produces the standalone Linux/Alpine runtime image with the patched dependency graph.

- [ ] **Step 5: Re-run audit and diff checks after all builds**

Run:

```powershell
npm audit --omit=dev
git diff --check
git status --short --branch
```

Expected: zero vulnerabilities, no whitespace errors, and no tracked build output or unexpected file changes.

- [ ] **Step 6: Start and probe the local web image without production state**

Run:

```powershell
docker run --detach --name smarttour-web-dependency-smoke --publish 127.0.0.1:3300:3000 --env NEXT_PUBLIC_API_URL=https://aitour.io.vn smarttour-web:dependency-remediation
try {
  $webReady = $false
  for ($attempt = 1; $attempt -le 15; $attempt++) {
    curl.exe --fail --silent --show-error --max-time 5 http://127.0.0.1:3300/login --output NUL
    if ($LASTEXITCODE -eq 0) {
      $webReady = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $webReady) {
    throw 'SmartTour web image did not serve /login within 15 attempts'
  }
} finally {
  docker rm --force smarttour-web-dependency-smoke | Out-Null
}
```

Expected: `/login` responds successfully from the container, and the temporary container is removed even when the probe fails. This check uses no database, volume, secret, or VPS resource.

### Task 5: Record the verified candidate and open the pull request

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`
- Read: `.github/workflows/smarttour-ci.yml`

- [ ] **Step 1: Update the Active Context candidate note**

In the existing `Production dependency remediation design` entry in `memory-bank/activeContext.md`, replace the design-only wording with a concise verified-candidate entry that states:

```markdown
- Production dependency remediation candidate:
  - Updated Swagger/js-yaml, body-parser, Next.js, PostCSS and Sharp to the approved patched graph in a dependency-only branch; application code, Prisma, Compose, secrets and VPS state remain unchanged.
  - Clean npm install, exact dependency-tree validation, zero production audit findings, API/web typecheck and production builds, Linux API/web Docker builds, Sharp `0.35.3` runtime loading, adjacent contracts and diff checks passed.
  - Pull request merge, privilege-hardening branch refresh and production rollout remain pending.
```

- [ ] **Step 2: Update Progress with the same verified state**

Replace the existing design-only dependency entry at the top of `memory-bank/progress.md` with:

```markdown
- Completed SmartTour production dependency remediation candidate:
  - Resolved the six existing production audit nodes with Swagger `11.4.6`, js-yaml `5.2.2`, body-parser `2.3.0`, Next.js `16.2.12`, PostCSS `8.5.24` and Sharp `0.35.3`.
  - Verification passed for clean install, exact npm tree, zero production audit findings, API/web typecheck and builds, Linux Docker builds, Sharp runtime loading, adjacent CI/Docker contracts and diff checks.
  - The dependency pull request remains isolated from container privilege hardening; merge, hardening rebase/CI and production rollout remain pending.
```

- [ ] **Step 3: Commit the verified candidate documentation**

Run:

```powershell
git add memory-bank/activeContext.md memory-bank/progress.md
git commit -m "docs: record dependency remediation candidate"
```

Expected: one documentation commit with no dependency or application changes.

- [ ] **Step 4: Push the dependency branch**

Run:

```powershell
git push --set-upstream origin ops/production-dependency-remediation-20260728
```

Expected: branch is available on GitHub and no other branch is changed.

- [ ] **Step 5: Open the dependency-only pull request**

Run:

```powershell
gh pr create --base main --head ops/production-dependency-remediation-20260728 --title "fix: remediate SmartTour production dependencies" --fill
```

Expected: a new pull request containing the design, manifests, lockfile, verification notes, and implementation plan only.

- [ ] **Step 6: Watch GitHub Actions to completion**

Run:

```powershell
gh pr checks --watch
```

Expected: SmartTour CI passes `npm ci`, `npm audit --omit=dev`, source contracts, API/web typecheck, and `docker compose build api web`. If CI fails, diagnose the exact failure and keep the pull request unmerged.

### Task 6: Merge dependency remediation and refresh privilege hardening

**Files:**
- Merge result may touch: `package.json`, `package-lock.json`, `.github/workflows/smarttour-ci.yml`, `memory-bank/activeContext.md`, `memory-bank/progress.md`
- Test: dependency audit, privilege Compose contract, API/web CI, Docker images

- [ ] **Step 1: Merge the dependency pull request only after green CI**

Run:

```powershell
gh pr merge --squash --delete-branch
```

Expected: dependency remediation is merged into `main`; production remains unchanged because GitHub deployment is not triggered by this merge workflow.

- [ ] **Step 2: Refresh local remote references**

From the privilege-hardening worktree, run:

```powershell
git fetch origin main ops/container-privilege-hardening-20260728
git status --short --branch
```

Expected: the privilege worktree is clean and still on `ops/container-privilege-hardening-20260728` before merging `origin/main`.

- [ ] **Step 3: Merge remediated main into privilege hardening**

Run:

```powershell
git merge --no-edit origin/main
```

Expected: the privilege-hardening Compose policy, contract script, npm command, CI contract invocation, spec/plan, and Memory Bank candidate remain present alongside the patched dependency graph. If conflicts occur, retain both security changes: keep `test:docker-compose-privileges`, keep its CI invocation, keep the Swagger/Next/Multer parent-scoped overrides, and do not restore the vulnerable js-yaml pin.

- [ ] **Step 4: Revalidate the combined branch**

Run:

```powershell
npm ci
npm audit --omit=dev
npm run test:docker-compose-privileges
npm run lint --workspace @smarttour/api
npm run lint --workspace @smarttour/web
docker build --file apps/api/Dockerfile --tag smarttour-api:privilege-dependency-candidate .
docker build --build-arg NEXT_PUBLIC_API_URL=https://aitour.io.vn --file apps/web/Dockerfile --tag smarttour-web:privilege-dependency-candidate .
git diff --check origin/main...HEAD
```

Expected: zero production vulnerabilities; privilege contract, typechecks, Linux Docker builds and diff checks all pass.

- [ ] **Step 5: Push the refreshed privilege branch and watch PR #1**

Run:

```powershell
git push origin ops/container-privilege-hardening-20260728
gh pr checks 1 --watch
```

Expected: PR #1 becomes green against the remediated `main`. Do not deploy the VPS in this plan; continue with the existing staged privilege-hardening rollout plan only after PR #1 review and merge.

## Completion Conditions

- Dependency pull request is merged with green CI and zero production audit findings.
- PR #1 is refreshed against the remediated `main` and passes its privilege, audit, typecheck, and Docker gates.
- No application behavior, database, secret, volume, backup, or VPS state changes occur during this plan.
- Production rollout remains a separate, explicit operation using the existing privilege-hardening deployment plan and rollback runbook.
