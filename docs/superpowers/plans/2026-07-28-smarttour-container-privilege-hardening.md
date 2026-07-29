# SmartTour Container Privilege Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `no-new-privileges` to all seven SmartTour services and drop all Linux capabilities from `api`, `web`, and `n8n` without changing images, data, ports, volumes, or networks.

**Architecture:** Keep this rollout Compose-only. Protect the policy with a focused Node source contract, wire it into the existing package scripts and SmartTour CI, merge only after CI builds both production images, then recreate production services one at a time with an exact per-service rollback file. Network isolation and image-specific non-root/read-only work remain separate follow-ups.

**Tech Stack:** Docker Compose, Node.js contract tests, npm workspaces, GitHub Actions, PowerShell/OpenSSH, Ubuntu systemd, existing SmartTour health/security scripts.

---

## File Map

- Create `scripts/test-docker-compose-privilege-hardening-contract.js`: enforce the exact service privilege matrix and package/CI wiring.
- Modify `docker-compose.yml`: add `no-new-privileges` to all services and `cap_drop: ALL` to `api`, `web`, and `n8n`.
- Modify `package.json`: expose the new contract as `test:docker-compose-privileges`.
- Modify `.github/workflows/smarttour-ci.yml`: run the new contract in the existing Source contracts step.
- Modify `memory-bank/activeContext.md`: record candidate verification, then replace it with verified production evidence.
- Modify `memory-bank/progress.md`: record implementation status, then replace it with deployed status.
- Modify the private `baomat` repository's `baomat.md`: update the control table, maturity summary, checklist, and change log after production verification.

### Task 1: Add the Failing Privilege Policy Contract

**Files:**
- Create: `scripts/test-docker-compose-privilege-hardening-contract.js`
- Read: `scripts/test-docker-compose-resource-limits-contract.js`
- Read: `docker-compose.yml`
- Read: `package.json`
- Read: `.github/workflows/smarttour-ci.yml`

- [ ] **Step 1: Confirm the implementation worktree is clean**

Run:

```powershell
git status --short --branch
```

Expected: branch `ops/container-privilege-hardening-20260728` with no uncommitted files.

- [ ] **Step 2: Create the exact policy contract**

Create `scripts/test-docker-compose-privilege-hardening-contract.js` with:

```javascript
const fs = require('node:fs');

const compose = fs.readFileSync('docker-compose.yml', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ciWorkflow = fs.readFileSync('.github/workflows/smarttour-ci.yml', 'utf8');

const services = ['postgres', 'redis', 'minio', 'n8n', 'api', 'web', 'nginx'];
const capabilityFreeServices = new Set(['n8n', 'api', 'web']);

function serviceBlock(service) {
  const pattern = new RegExp(
    `^  ${service}:\\r?\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:\\r?$|^volumes:\\r?$)`,
    'm',
  );
  const match = compose.match(pattern);
  if (!match) throw new Error(`docker-compose.yml must define ${service}`);
  return match[1];
}

function listValues(block, key) {
  const pattern = new RegExp(`^    ${key}:\\r?\\n((?:      - .*(?:\\r?\\n|$))+)`, 'm');
  const match = block.match(pattern);
  if (!match) return [];
  return match[1]
    .split(/\\r?\\n/)
    .filter(Boolean)
    .map((line) => line.replace(/^      - /, ''));
}

for (const service of services) {
  const block = serviceBlock(service);
  const securityOptions = listValues(block, 'security_opt');
  const capDrop = listValues(block, 'cap_drop');
  const capAdd = listValues(block, 'cap_add');

  if (!securityOptions.includes('no-new-privileges:true')) {
    throw new Error(`${service} must set security_opt no-new-privileges:true`);
  }
  if (capAdd.length !== 0) {
    throw new Error(`${service} must not add Linux capabilities`);
  }

  if (capabilityFreeServices.has(service)) {
    if (capDrop.length !== 1 || capDrop[0] !== 'ALL') {
      throw new Error(`${service} must set cap_drop to exactly ALL`);
    }
  } else if (capDrop.length !== 0) {
    throw new Error(`${service} capability drop is deferred and must remain explicit`);
  }
}

if (
  packageJson.scripts['test:docker-compose-privileges'] !==
  'node scripts/test-docker-compose-privilege-hardening-contract.js'
) {
  throw new Error('package.json must expose test:docker-compose-privileges');
}

if (!ciWorkflow.includes('node scripts/test-docker-compose-privilege-hardening-contract.js')) {
  throw new Error('SmartTour CI must run the Docker Compose privilege-hardening contract');
}

console.log('TEST_DOCKER_COMPOSE_PRIVILEGE_HARDENING_CONTRACT_OK');
```

- [ ] **Step 3: Run the contract and confirm RED**

Run:

```powershell
node scripts/test-docker-compose-privilege-hardening-contract.js
```

Expected: FAIL with `postgres must set security_opt no-new-privileges:true`.

### Task 2: Implement the Minimal Compose Policy and CI Wiring

**Files:**
- Modify: `docker-compose.yml:2`
- Modify: `package.json:84`
- Modify: `.github/workflows/smarttour-ci.yml:66`
- Test: `scripts/test-docker-compose-privilege-hardening-contract.js`
- Test: `scripts/test-docker-compose-resource-limits-contract.js`
- Test: `scripts/test-github-actions-contract.js`

- [ ] **Step 1: Add `no-new-privileges` to PostgreSQL**

Immediately after PostgreSQL's `pids_limit`, add:

```yaml
    security_opt:
      - no-new-privileges:true
```

- [ ] **Step 2: Add `no-new-privileges` to Redis**

Immediately after Redis's `pids_limit`, add:

```yaml
    security_opt:
      - no-new-privileges:true
```

- [ ] **Step 3: Add `no-new-privileges` to MinIO**

Immediately after MinIO's `pids_limit`, add:

```yaml
    security_opt:
      - no-new-privileges:true
```

- [ ] **Step 4: Add the complete n8n privilege policy**

Immediately after n8n's `pids_limit`, add:

```yaml
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

- [ ] **Step 5: Add the complete API privilege policy**

Immediately after API's `pids_limit`, add:

```yaml
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

- [ ] **Step 6: Add the complete Web privilege policy**

Immediately after Web's `pids_limit`, add:

```yaml
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

- [ ] **Step 7: Add `no-new-privileges` to Nginx**

Immediately after Nginx's `pids_limit`, add:

```yaml
    security_opt:
      - no-new-privileges:true
```

- [ ] **Step 8: Expose the contract through npm**

Replace the final package-script entry with:

```json
    "test:docker-cache-maintenance": "node scripts/test-docker-cache-maintenance-contract.js",
    "test:docker-compose-resources": "node scripts/test-docker-compose-resource-limits-contract.js",
    "test:docker-compose-privileges": "node scripts/test-docker-compose-privilege-hardening-contract.js"
```

- [ ] **Step 9: Wire the contract into SmartTour CI**

In the Source contracts block, place the new contract immediately after the resource-limit contract:

```yaml
          node scripts/test-docker-compose-resource-limits-contract.js
          node scripts/test-docker-compose-privilege-hardening-contract.js
```

- [ ] **Step 10: Run the new contract and confirm GREEN**

Run:

```powershell
npm run test:docker-compose-privileges
```

Expected: `TEST_DOCKER_COMPOSE_PRIVILEGE_HARDENING_CONTRACT_OK`.

- [ ] **Step 11: Run adjacent regression contracts**

Run:

```powershell
npm run test:docker-compose-resources
node scripts/test-github-actions-contract.js
```

Expected:

```text
TEST_DOCKER_COMPOSE_RESOURCE_LIMITS_CONTRACT_OK
TEST_GITHUB_ACTIONS_CONTRACT_OK
```

- [ ] **Step 12: Validate the Compose model without printing secrets**

Run:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
try {
  docker compose config --quiet
} finally {
  Remove-Item -LiteralPath .env
}
```

Expected: exit code `0` and no rendered Compose output. The temporary ignored `.env` copy must not remain.

- [ ] **Step 13: Commit the implementation slice**

Run:

```powershell
git diff --check
git add -- docker-compose.yml package.json .github/workflows/smarttour-ci.yml scripts/test-docker-compose-privilege-hardening-contract.js
git commit -m "ops: harden SmartTour container privileges"
```

Expected: one focused commit containing only the Compose policy, contract, npm wiring, and CI wiring.

### Task 3: Record Candidate State and Complete Branch Verification

**Files:**
- Modify: `memory-bank/activeContext.md:21`
- Modify: `memory-bank/progress.md:1`

- [ ] **Step 1: Add the candidate note to Active Context**

Insert this item immediately below `## Latest Session Notes`:

```markdown
- SmartTour container privilege hardening candidate:
  - Added `no-new-privileges` to all seven Compose services and `cap_drop: [ALL]` to `api`, `web`, and `n8n`; images, ports, networks, secrets, and volumes remain unchanged.
  - Added `scripts/test-docker-compose-privilege-hardening-contract.js`, exposed `npm run test:docker-compose-privileges`, and wired the contract into SmartTour CI.
  - Focused RED/GREEN and adjacent Compose/GitHub Actions contracts passed. Production staged rollout and runtime evidence remain pending.
```

- [ ] **Step 2: Add the candidate note to Progress**

Insert this item immediately below `# Progress`:

```markdown
- Implemented SmartTour container privilege hardening candidate:
  - All seven Compose services declare `no-new-privileges`; `api`, `web`, and `n8n` drop all Linux capabilities.
  - Source contract, npm command, CI wiring, Compose validation, and adjacent regression checks are in place.
  - Production recreation, runtime `NoNewPrivs`/`CapEff` verification, and the private security inventory update remain pending.
```

- [ ] **Step 3: Run focused verification again after documentation edits**

Run:

```powershell
npm run test:docker-compose-privileges
npm run test:docker-compose-resources
node scripts/test-github-actions-contract.js
git diff --check
```

Expected: all three test success markers and no diff-check output.

- [ ] **Step 4: Run API and Web type checks**

Run:

```powershell
npm run lint --workspace @smarttour/api
npm run lint --workspace @smarttour/web
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit the candidate documentation**

Run:

```powershell
git add -- memory-bank/activeContext.md memory-bank/progress.md
git commit -m "docs: record container privilege hardening candidate"
```

- [ ] **Step 6: Push the implementation branch**

Run:

```powershell
git status --short --branch
git push
```

Expected: clean branch synchronized with `origin/ops/container-privilege-hardening-20260728`.

### Task 4: Open the Pull Request, Require CI, and Merge

**Files:**
- Verify: `.github/workflows/smarttour-ci.yml`
- Verify: all commits on `ops/container-privilege-hardening-20260728`

- [ ] **Step 1: Create the SmartTour pull request**

Run:

```powershell
$prUrl = gh pr create --base main --head ops/container-privilege-hardening-20260728 --title "ops: harden SmartTour container privileges" --body "Adds no-new-privileges to all seven SmartTour services, drops all capabilities from api/web/n8n, adds a RED/GREEN contract, and documents the staged production rollback. No image, volume, port, secret, or network changes."
$prUrl
```

Expected: a new pull-request URL in `hai2k2000/smarttour`.

- [ ] **Step 2: Resolve the pull-request number and watch checks**

Run:

```powershell
$prNumber = gh pr view $prUrl --json number --jq '.number'
gh pr checks $prNumber --watch --interval 20
```

Expected: SmartTour CI succeeds, including source contracts, API/Web type checks, and both production image builds.

- [ ] **Step 3: Review the final PR diff**

Run:

```powershell
gh pr diff $prNumber --name-only
gh pr view $prNumber --json mergeable,reviewDecision,statusCheckRollup
```

Expected files only:

```text
.github/workflows/smarttour-ci.yml
docker-compose.yml
docs/superpowers/plans/2026-07-28-smarttour-container-privilege-hardening.md
docs/superpowers/specs/2026-07-28-smarttour-container-privilege-hardening-design.md
memory-bank/activeContext.md
memory-bank/progress.md
package.json
scripts/test-docker-compose-privilege-hardening-contract.js
```

- [ ] **Step 4: Merge after all checks pass**

Run:

```powershell
gh pr merge $prNumber --merge
$mergeSha = gh pr view $prNumber --json mergeCommit --jq '.mergeCommit.oid'
$mergeSha
```

Expected: PR state is merged and `$mergeSha` is a 40-character commit SHA. Preserve this value for production verification and post-deploy documentation.

### Task 5: Prepare Production Evidence and Rollback Before Recreation

**Files:**
- Read on VPS: `/opt/smarttour/docker-compose.yml`
- Create on VPS: `/root/security-change-20260728-smarttour-container-privileges/`
- Preserve on VPS: all SmartTour named volumes and `/opt/smarttour/.env`

- [ ] **Step 1: Confirm SSH and passwordless sudo with the office key**

Run:

```powershell
$sshKey = "$env:USERPROFILE\.ssh\id_ed25519_booking_server"
ssh.exe -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -p 24700 hai2k@103.56.163.243 "whoami && sudo -n true"
```

Expected: `hai2k` and exit code `0`.

- [ ] **Step 2: Run the production preflight without changing containers**

Run:

```powershell
$remotePreflight = @'
set -euo pipefail
cd /opt/smarttour
test -z "$(sudo -n git status --porcelain)"
sudo -n git status --short --branch
sudo -n docker compose config --quiet
sudo -n bash scripts/healthcheck.sh
sudo -n bash scripts/security-audit.sh
test "$(systemctl --failed --no-legend | wc -l)" -eq 0
'@
ssh.exe -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -p 24700 hai2k@103.56.163.243 $remotePreflight
```

Expected: clean `main`, `HEALTHCHECK_OK`, `SECURITY_AUDIT_OK`, and zero failed units.

- [ ] **Step 3: Save root-only rollback and baseline evidence**

Run:

```powershell
$remoteEvidence = @'
set -euo pipefail
cd /opt/smarttour
evidence=/root/security-change-20260728-smarttour-container-privileges
sudo -n install -d -m 700 -o root -g root "$evidence"
sudo -n cp -a docker-compose.yml "$evidence/docker-compose.yml.before"
sudo -n sha256sum docker-compose.yml | sudo -n tee "$evidence/docker-compose.yml.before.sha256" >/dev/null
containers="$(sudo -n docker compose ps -q)"
sudo -n docker inspect $containers --format '{{.Name}}|image={{.Image}}|ports={{json .HostConfig.PortBindings}}' | sort | sudo -n tee "$evidence/containers.before" >/dev/null
sudo -n docker inspect $containers --format '{{.Name}}|{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Source}}:{{.Destination}}:rw={{.RW}};{{end}}' | sort | sudo -n tee "$evidence/mounts.before" >/dev/null
sudo -n docker compose --project-directory /opt/smarttour --env-file /opt/smarttour/.env -f "$evidence/docker-compose.yml.before" config --quiet
sudo -n chmod 600 "$evidence"/*
'@
ssh.exe -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -p 24700 hai2k@103.56.163.243 $remoteEvidence
```

Expected: root-owned evidence directory mode `700`, evidence files mode `600`, and rollback Compose validation exit `0`. No `.env` content is copied or printed.

- [ ] **Step 4: Fast-forward production to the merged commit**

Run:

```powershell
$remotePull = @'
set -euo pipefail
cd /opt/smarttour
sudo -n git -C /opt/smarttour pull --ff-only origin main
sudo -n git -C /opt/smarttour status --short --branch
sudo -n docker compose config --quiet
sudo -n git -C /opt/smarttour rev-parse HEAD
'@
$productionSha = (ssh.exe -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -p 24700 hai2k@103.56.163.243 $remotePull | Select-Object -Last 1).Trim()
if ($productionSha -ne $mergeSha) { throw "Production SHA $productionSha does not match merged SHA $mergeSha" }
```

Expected: production source equals `$mergeSha`; running containers have not yet been recreated.

### Task 6: Recreate and Verify Each Production Service

**Files:**
- Use: `/opt/smarttour/docker-compose.yml`
- Roll back with: `/root/security-change-20260728-smarttour-container-privileges/docker-compose.yml.before`

For every service step below, stop immediately if the recreate command or probe fails. Use the exact rollback command for the affected service, then rerun its baseline probe before proceeding:

```bash
sudo docker compose --project-directory /opt/smarttour --env-file /opt/smarttour/.env -f /root/security-change-20260728-smarttour-container-privileges/docker-compose.yml.before up -d --pull never --no-build --no-deps n8n
sudo docker compose --project-directory /opt/smarttour --env-file /opt/smarttour/.env -f /root/security-change-20260728-smarttour-container-privileges/docker-compose.yml.before up -d --pull never --no-build --no-deps api
sudo docker compose --project-directory /opt/smarttour --env-file /opt/smarttour/.env -f /root/security-change-20260728-smarttour-container-privileges/docker-compose.yml.before up -d --pull never --no-build --no-deps web
sudo docker compose --project-directory /opt/smarttour --env-file /opt/smarttour/.env -f /root/security-change-20260728-smarttour-container-privileges/docker-compose.yml.before up -d --pull never --no-build --no-deps redis
sudo docker compose --project-directory /opt/smarttour --env-file /opt/smarttour/.env -f /root/security-change-20260728-smarttour-container-privileges/docker-compose.yml.before up -d --pull never --no-build --no-deps minio
sudo docker compose --project-directory /opt/smarttour --env-file /opt/smarttour/.env -f /root/security-change-20260728-smarttour-container-privileges/docker-compose.yml.before up -d --pull never --no-build --no-deps postgres
sudo docker compose --project-directory /opt/smarttour --env-file /opt/smarttour/.env -f /root/security-change-20260728-smarttour-container-privileges/docker-compose.yml.before up -d --pull never --no-build --no-deps nginx
```

- [ ] **Step 1: Recreate and verify n8n**

Run on the VPS:

```bash
cd /opt/smarttour
sudo docker compose up -d --pull never --no-build --no-deps n8n
container="$(sudo docker compose ps -q n8n)"
test "$(sudo docker inspect -f '{{.State.Running}}' "$container")" = true
test "$(sudo docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
test "$(sudo docker exec "$container" awk '/^CapEff:/ {print $2}' /proc/1/status)" = 0000000000000000
test "$(sudo docker inspect -f '{{json .HostConfig.CapDrop}}' "$container")" = '["ALL"]'
```

Expected: n8n remains running with `NoNewPrivs=1` and zero effective capabilities.

- [ ] **Step 2: Recreate and verify API**

Run on the VPS:

```bash
sudo docker compose up -d --pull never --no-build --no-deps api
container="$(sudo docker compose ps -q api)"
test "$(sudo docker inspect -f '{{.State.Running}}' "$container")" = true
test "$(sudo docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
test "$(sudo docker exec "$container" awk '/^CapEff:/ {print $2}' /proc/1/status)" = 0000000000000000
test "$(sudo docker inspect -f '{{json .HostConfig.CapDrop}}' "$container")" = '["ALL"]'
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/health)" = 200
```

Expected: API health returns `200` with zero effective capabilities.

- [ ] **Step 3: Recreate and verify Web**

Run on the VPS:

```bash
sudo docker compose up -d --pull never --no-build --no-deps web
container="$(sudo docker compose ps -q web)"
test "$(sudo docker inspect -f '{{.State.Running}}' "$container")" = true
test "$(sudo docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
test "$(sudo docker exec "$container" awk '/^CapEff:/ {print $2}' /proc/1/status)" = 0000000000000000
test "$(sudo docker inspect -f '{{json .HostConfig.CapDrop}}' "$container")" = '["ALL"]'
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)" = 307
test "$(curl -sS -o /dev/null -w '%{http_code}' https://aitour.io.vn/)" = 307
```

Expected: internal Web and external HTTPS both return `307`.

- [ ] **Step 4: Recreate and verify Redis**

Run on the VPS:

```bash
sudo docker compose up -d --pull never --no-build --no-deps redis
container="$(sudo docker compose ps -q redis)"
test "$(sudo docker inspect -f '{{.State.Running}}' "$container")" = true
test "$(sudo docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
test "$(sudo docker inspect -f '{{json .HostConfig.CapDrop}}' "$container")" = null
test "$(sudo docker compose exec -T redis redis-cli ping)" = PONG
```

Expected: Redis returns `PONG`; capability drop remains deliberately deferred.

- [ ] **Step 5: Recreate and verify MinIO**

Run on the VPS:

```bash
sudo docker compose up -d --pull never --no-build --no-deps minio
container="$(sudo docker compose ps -q minio)"
test "$(sudo docker inspect -f '{{.State.Running}}' "$container")" = true
test "$(sudo docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
test "$(sudo docker inspect -f '{{json .HostConfig.CapDrop}}' "$container")" = null
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9000/minio/health/live)" = 200
```

Expected: MinIO live health returns `200`; its existing named volume remains mounted.

- [ ] **Step 6: Recreate and verify PostgreSQL**

Run on the VPS:

```bash
sudo docker compose up -d --pull never --no-build --no-deps postgres
container="$(sudo docker compose ps -q postgres)"
test "$(sudo docker inspect -f '{{.State.Running}}' "$container")" = true
test "$(sudo docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
test "$(sudo docker inspect -f '{{json .HostConfig.CapDrop}}' "$container")" = null
sudo docker compose exec -T postgres pg_isready -U smarttour -d smarttour
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/health)" = 200
```

Expected: PostgreSQL accepts connections and API health returns `200` after reconnection.

- [ ] **Step 7: Recreate and verify Nginx**

Run on the VPS:

```bash
sudo docker compose up -d --pull never --no-build --no-deps nginx
container="$(sudo docker compose ps -q nginx)"
test "$(sudo docker inspect -f '{{.State.Running}}' "$container")" = true
test "$(sudo docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
test "$(sudo docker inspect -f '{{json .HostConfig.CapDrop}}' "$container")" = null
test "$(curl -sS -o /dev/null -w '%{http_code}' https://aitour.io.vn/)" = 307
```

Expected: Nginx remains running, TLS verification succeeds through curl, and HTTPS returns `307`.

- [ ] **Step 8: Verify the complete privilege matrix and absence of capability additions**

Run on the VPS:

```bash
for service in postgres redis minio n8n api web nginx; do
  container="$(sudo docker compose ps -q "$service")"
  test "$(sudo docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
  test "$(sudo docker inspect -f '{{json .HostConfig.CapAdd}}' "$container")" = null
done
for service in n8n api web; do
  container="$(sudo docker compose ps -q "$service")"
  test "$(sudo docker exec "$container" awk '/^CapEff:/ {print $2}' /proc/1/status)" = 0000000000000000
  test "$(sudo docker inspect -f '{{json .HostConfig.CapDrop}}' "$container")" = '["ALL"]'
done
```

Expected: all assertions exit `0`.

- [ ] **Step 9: Compare ports and mounts with baseline evidence**

Run on the VPS:

```bash
evidence=/root/security-change-20260728-smarttour-container-privileges
containers="$(sudo docker compose ps -q)"
sudo docker inspect $containers --format '{{.Name}}|image={{.Image}}|ports={{json .HostConfig.PortBindings}}' | sort | sudo tee "$evidence/containers.after" >/dev/null
sudo docker inspect $containers --format '{{.Name}}|{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Source}}:{{.Destination}}:rw={{.RW}};{{end}}' | sort | sudo tee "$evidence/mounts.after" >/dev/null
sudo chmod 600 "$evidence/containers.after" "$evidence/mounts.after"
sudo diff -u "$evidence/containers.before" "$evidence/containers.after"
sudo diff -u "$evidence/mounts.before" "$evidence/mounts.after"
```

Expected: mount diff produces no output. Container IDs change, but image IDs and port bindings in `containers.before`/`containers.after` remain identical.

- [ ] **Step 10: Run final production health and security checks**

Run on the VPS:

```bash
sudo bash scripts/healthcheck.sh
sudo bash scripts/security-audit.sh
test "$(systemctl --failed --no-legend | wc -l)" -eq 0
sudo docker compose ps
test "$(curl -sS -o /dev/null -w '%{http_code}' https://aitour.io.vn/)" = 307
```

Expected: `HEALTHCHECK_OK`, `SECURITY_AUDIT_OK`, zero failed units, and seven running SmartTour containers.

- [ ] **Step 11: Save final runtime evidence**

Run on the VPS:

```bash
evidence=/root/security-change-20260728-smarttour-container-privileges
for service in postgres redis minio n8n api web nginx; do
  container="$(sudo docker compose ps -q "$service")"
  printf '%s|' "$service"
  sudo docker inspect -f 'security={{json .HostConfig.SecurityOpt}} capdrop={{json .HostConfig.CapDrop}} capadd={{json .HostConfig.CapAdd}}' "$container"
  sudo docker exec "$container" awk '/^(Name|Uid|Gid|CapEff|NoNewPrivs):/ {printf "%s ", $0} END {print ""}' /proc/1/status
done | sudo tee "$evidence/runtime.after" >/dev/null
sudo sha256sum "$evidence"/* | sudo tee "$evidence/SHA256SUMS" >/dev/null
sudo chmod 600 "$evidence"/*
```

Expected: `runtime.after` records the exact runtime matrix and all evidence files remain root-only.

### Task 7: Replace Candidate Notes with Verified SmartTour Deployment Evidence

**Files:**
- Modify: `memory-bank/activeContext.md:23`
- Modify: `memory-bank/progress.md:3`

- [ ] **Step 1: Capture exact production evidence values**

Run locally:

```powershell
$sshKey = "$env:USERPROFILE\.ssh\id_ed25519_booking_server"
$deployedSha = (ssh.exe -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -p 24700 hai2k@103.56.163.243 "sudo -n git -C /opt/smarttour rev-parse HEAD").Trim()
$evidenceHash = (ssh.exe -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -p 24700 hai2k@103.56.163.243 "sudo -n sha256sum /root/security-change-20260728-smarttour-container-privileges/runtime.after" | ForEach-Object { ($_ -split ' ')[0] }).Trim()
if ($deployedSha.Length -ne 40) { throw 'Invalid deployed SHA' }
if ($evidenceHash.Length -ne 64) { throw 'Invalid runtime evidence hash' }
```

Expected: validated 40-character deployment SHA and 64-character SHA-256.

- [ ] **Step 2: Create a documentation branch from current main**

Run:

```powershell
git switch main
git pull --ff-only origin main
git switch -c docs/container-privilege-hardening-deployment-20260728
```

- [ ] **Step 3: Replace the Active Context candidate note**

Use `apply_patch` to replace the three-line candidate item with a verified item containing:

```markdown
- SmartTour container privilege hardening deployment:
  - Added `no-new-privileges` to all seven Compose services and `cap_drop: [ALL]` to `api`, `web`, and `n8n`; images, ports, networks, secrets, mounts, and named volumes remained unchanged.
  - The RED/GREEN privilege contract, resource contract, GitHub Actions contract, API/Web checks, SmartTour CI, and production image builds passed before merge.
  - Production recreated `n8n`, `api`, `web`, `redis`, `minio`, `postgres`, and `nginx` one at a time with existing images. Runtime verified `NoNewPrivs=1` for all seven and `CapEff=0` for `api`, `web`, and `n8n`; health/security audits, HTTPS `307`, database/Redis/MinIO checks, firewall, backups, and zero failed units passed.
  - Record the exact `$deployedSha` value from Step 1 and evidence path `/root/security-change-20260728-smarttour-container-privileges/`; record the exact `$evidenceHash` value as the SHA-256 of `runtime.after`.
```

When applying the patch, paste the validated values from Step 1 into the final bullet; do not leave the variable names in the file.

- [ ] **Step 4: Replace the Progress candidate note**

Use `apply_patch` to replace the candidate item with:

```markdown
- Completed SmartTour container privilege hardening:
  - All seven production Compose services enforce `no-new-privileges`; `api`, `web`, and `n8n` also drop all Linux capabilities.
  - Source contract, npm/CI wiring, Compose validation, SmartTour CI, production image builds, staged recreation, runtime policy inspection, health/security audits, HTTPS/TLS, data-service probes, and mount preservation passed.
  - Image-specific non-root/read-only hardening and Docker network isolation remain separate follow-up rollouts.
```

- [ ] **Step 5: Verify and commit the SmartTour deployment documentation**

Run:

```powershell
npm run test:docker-compose-privileges
git diff --check
git add -- memory-bank/activeContext.md memory-bank/progress.md
git commit -m "docs: record container privilege hardening deployment"
git push -u origin docs/container-privilege-hardening-deployment-20260728
```

- [ ] **Step 6: Merge the documentation pull request**

Run:

```powershell
$docsPrUrl = gh pr create --base main --head docs/container-privilege-hardening-deployment-20260728 --title "docs: record container privilege hardening deployment" --body "Records verified production NoNewPrivs/capability evidence, health checks, and remaining image/network hardening work."
$docsPrNumber = gh pr view $docsPrUrl --json number --jq '.number'
gh pr checks $docsPrNumber --watch --interval 20
gh pr merge $docsPrNumber --merge
git switch main
git pull --ff-only origin main
```

Expected: documentation PR merges only after CI succeeds.

- [ ] **Step 7: Fast-forward the VPS to the documentation-only main commit**

Run:

```powershell
ssh.exe -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -p 24700 hai2k@103.56.163.243 "sudo -n git -C /opt/smarttour pull --ff-only origin main && sudo -n git -C /opt/smarttour status --short --branch"
```

Expected: `main...origin/main`; no container recreation is necessary.

### Task 8: Update the Private `baomat` Security Inventory

**Files:**
- Modify: `C:/Users/hai2k/Desktop/hai2k/vscode/thachthucAi/tmp/baomat-security-read-20260727/baomat.md`

- [ ] **Step 1: Confirm the security repository is clean and current**

Run:

```powershell
$baomat = 'C:\Users\hai2k\Desktop\hai2k\vscode\thachthucAi\tmp\baomat-security-read-20260727'
git -C $baomat status --short --branch
git -C $baomat pull --ff-only origin main
git -C $baomat switch -c docs/smarttour-container-privileges-20260728
```

Expected: clean branch based on the latest private `main`.

- [ ] **Step 2: Update the maturity summary and open gates**

Use `apply_patch` to replace the current maturity summary with:

```markdown
**Muc hien tai: M1 dat, M2 mot phan; synthetic backup/restore va first-stage SmartTour container privilege hardening da dat, nhung chua san sang cho du lieu that cua kho noi bo.**

Da hoan thanh provider snapshot, console recovery, firewall host/Docker, key-only SSH allowlist hai dia diem, admin `hai2k` + sudo, cam root SSH, Fail2ban, auditd, swap, SmartTour resource limits, `no-new-privileges` cho 7/7 SmartTour service, `cap_drop: ALL` cho API/Web/n8n, package upgrade/reboot, va synthetic office-pull backup/restore cho `luutru`. Tailscale, Google Drive va rclone duoc tam dung. Cac gate con mo la SmartTour shared-network isolation, image-specific capability reduction cho PostgreSQL/Redis/MinIO/Nginx, non-root/read-only root filesystem, Telegram monitoring credential/alert test, va capacity projection truoc khi cho phep du lieu that.
```

- [ ] **Step 3: Update the control table**

Keep the `Docker isolation` row at `HIGH`. Replace the `Container hardening` row with this verified state:

```markdown
| Container hardening | `no-new-privileges` active on 7/7 SmartTour services; `cap_drop: ALL` active on API/Web/n8n; PostgreSQL/Redis/MinIO/Nginx capability reduction plus non-root/read-only work remain deferred | Dat mot phan M2 |
```

- [ ] **Step 4: Update the completed checklist**

Add this checked item after the existing SmartTour resource-limit item:

```markdown
- [x] Bat `no-new-privileges` cho 7 container SmartTour va `cap_drop: ALL` cho API/Web/n8n; runtime, health, TLS, volume va rollback evidence da duoc xac minh.
```

- [ ] **Step 5: Add the exact change-log entry**

Add this 2026-07-28 row, replacing the two runtime variable names with their validated values from Task 7 before applying the patch:

```markdown
| 2026-07-28 | Trien khai SmartTour container privilege hardening | Commit `$deployedSha`; `NoNewPrivs=1` tren 7/7 service, `cap_drop: ALL` va `CapEff=0` tren API/Web/n8n; 7 container, HTTPS `307`, PostgreSQL/Redis/MinIO, firewall, backup va 0 failed unit deu dat. Evidence `/root/security-change-20260728-smarttour-container-privileges/`, `runtime.after` SHA-256 `$evidenceHash` |
```

Do not leave `$deployedSha` or `$evidenceHash` in `baomat.md`.

- [ ] **Step 6: Verify, commit, push, and merge the security documentation**

Run:

```powershell
git -C $baomat diff --check
git -C $baomat add -- baomat.md
git -C $baomat commit -m "docs: record SmartTour container privilege hardening"
git -C $baomat push -u origin docs/smarttour-container-privileges-20260728
Push-Location $baomat
$securityPrUrl = gh pr create --base main --head docs/smarttour-container-privileges-20260728 --title "docs: record SmartTour container privilege hardening" --body "Updates the private VPS security inventory with verified SmartTour no-new-privileges and capability-drop evidence."
$securityPrNumber = gh pr view $securityPrUrl --json number --jq '.number'
gh pr diff $securityPrNumber --name-only
gh pr merge $securityPrNumber --merge
Pop-Location
git -C $baomat switch main
git -C $baomat pull --ff-only origin main
```

Expected: the private security inventory merges with no credential or private-key content added.

### Task 9: Perform Final Verification and Report the Next Gate

**Files:**
- Verify on VPS: `/opt/smarttour`
- Verify locally: SmartTour `origin/main`
- Verify locally: private `baomat` `origin/main`

- [ ] **Step 1: Run a fresh final production audit**

Run:

```powershell
$sshKey = "$env:USERPROFILE\.ssh\id_ed25519_booking_server"
$remoteFinal = @'
set -euo pipefail
cd /opt/smarttour
sudo -n git status --short --branch
sudo -n bash scripts/healthcheck.sh
sudo -n bash scripts/security-audit.sh
test "$(systemctl --failed --no-legend | wc -l)" -eq 0
test "$(curl -sS -o /dev/null -w '%{http_code}' https://aitour.io.vn/)" = 307
for service in postgres redis minio n8n api web nginx; do
  container="$(sudo -n docker compose ps -q "$service")"
  test "$(sudo -n docker exec "$container" awk '/^NoNewPrivs:/ {print $2}' /proc/1/status)" = 1
done
'@
ssh.exe -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -p 24700 hai2k@103.56.163.243 $remoteFinal
```

Expected: synchronized main, both audit success markers, zero failed units, HTTPS `307`, and `NoNewPrivs=1` on all services.

- [ ] **Step 2: Confirm both repositories are clean and synchronized**

Run:

```powershell
$baomat = 'C:\Users\hai2k\Desktop\hai2k\vscode\thachthucAi\tmp\baomat-security-read-20260727'
git fetch origin
git status --short --branch
git -C $baomat fetch origin
git -C $baomat status --short --branch
```

Expected: clean SmartTour and `baomat` worktrees with merged commits visible on `origin/main`.

- [ ] **Step 3: Report the completed control and remaining risk**

Report:

- SmartTour merge commit and deployment documentation commit.
- Private `baomat` documentation commit.
- Production evidence directory and `runtime.after` SHA-256.
- Runtime matrix: `NoNewPrivs=1` on 7/7; `CapEff=0` and `cap_drop: ALL` on `api`, `web`, `n8n`.
- Health/security/HTTPS/data-service/systemd results.
- Explicitly state that all seven services still share one Docker network and that network isolation is the next independent security rollout.
