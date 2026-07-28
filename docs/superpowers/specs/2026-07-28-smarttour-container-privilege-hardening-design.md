# SmartTour Container Privilege Hardening Design

**Date:** 2026-07-28  
**Status:** Design approved; pending written-spec review  
**Scope:** First production rollout of SmartTour container privilege controls

## Context

SmartTour currently runs seven Compose services on the production VPS: `postgres`,
`redis`, `minio`, `n8n`, `api`, `web`, and `nginx`. Resource limits, restart
policies, host firewall rules, Docker forwarding controls, TLS, backups, and
health/security audits are already deployed.

All seven services currently share `smarttour_default`. Network isolation is a
separate follow-up and is intentionally excluded from this rollout. Runtime
inspection on 2026-07-28 showed that `api`, `web`, `minio`, and `nginx` start as
UID 0; `postgres`, `redis`, and `n8n` run their main process as non-root after
image entrypoint setup. No service currently declares `no-new-privileges` or
explicit capability bounds in Compose.

## Goals

- Prevent privilege escalation through `no-new-privileges` on every SmartTour
  service.
- Remove the full default capability set from the application services where
  the running images have no startup requirement for those capabilities.
- Keep persistent volumes, published ports, image versions, secrets, and
  application behavior unchanged.
- Make the policy executable through a source contract and CI check.
- Roll out without rebuilding images on the production VPS and with a
  service-by-service rollback path.

## Non-goals

- No Docker network split in this change.
- No read-only root filesystem or tmpfs changes.
- No Dockerfile user migration for `api`, `web`, `minio`, or `nginx`.
- No volume ownership migration, secret rotation, port changes, or data cleanup.
- No Tailscale, Telegram, Google Drive, rclone, or other external service work.

## Policy Matrix

The Compose policy must be explicit for all seven services:

| Service | `no-new-privileges` | `cap_drop: ALL` | Rationale |
|---|---:|---:|---|
| `api` | Required | Required | Node application does not need Linux capabilities. |
| `web` | Required | Required | Next.js application does not need Linux capabilities. |
| `n8n` | Required | Required | Image already runs as `node`; no capability is required. |
| `postgres` | Required | Deferred | Entrypoint initialization and UID transition need image-specific validation. |
| `redis` | Required | Deferred | Entrypoint and persistence behavior need image-specific validation. |
| `minio` | Required | Deferred | Current image runs as root and writes the persistent data volume; validate before dropping capabilities. |
| `nginx` | Required | Deferred | Entrypoint, certificate access, and low-port binding need image-specific validation. |

Deferred capability drops are deliberate exceptions, not an invitation to add
new capabilities. A later image-specific hardening slice must either drop all
capabilities or document the smallest required allowlist with runtime evidence.

## Compose and Code Changes

The implementation will:

1. Add `security_opt: [no-new-privileges:true]` to every service block.
2. Add `cap_drop: [ALL]` to `api`, `web`, and `n8n` only.
3. Add `scripts/test-docker-compose-privilege-hardening-contract.js` that parses
   each service block and rejects missing policies, accidental capability
   additions, and missing CI/package wiring.
4. Expose the contract as
   `npm run test:docker-compose-privileges` and run it in
   `.github/workflows/smarttour-ci.yml`.
5. Update `memory-bank/activeContext.md` and `memory-bank/progress.md` after
   the meaningful change, with no credentials or generated output.

The contract is source-level protection only; runtime verification remains a
required deployment gate.

## Verification Strategy

### Local and CI

- Run the privilege contract in RED/GREEN order.
- Run the existing resource-limit contract and the full source-contract set
  that CI already executes.
- Run API and Web lint/type checks and production Docker builds in CI.
- Validate the candidate Compose file with `docker compose config --quiet`
  using non-secret CI environment values and never print the rendered config.
- Run `git diff --check` and inspect the staged file list before commit.

### Production preflight

Before recreating any service:

- Confirm the VPS worktree is clean and on the expected merged commit.
- Save the current Compose file and its SHA-256 in a root-only evidence
  directory; do not copy `.env` or any secret.
- Confirm the latest PostgreSQL/MinIO backup and current health/security audit.
- Record container IDs, image IDs, volume names, published ports, and current
  health state for comparison after rollout.
- Run `docker compose config --quiet` without displaying secrets.

### Staged rollout

Use the merged Compose file and existing images only. Recreate one service at a
time with `docker compose up -d --no-build --no-deps SERVICE_NAME` in this order:

1. `n8n`
2. `api`
3. `web`
4. `redis`
5. `minio`
6. `postgres`
7. `nginx`

After each service, verify that the container is running and that its expected
health probe responds when one is defined (`n8n` has no current Compose health
check and must at least remain running). After the application group, verify internal API health
and external HTTPS. After the data group, verify database, Redis, and MinIO
connectivity through the API. At the end, verify:

- `NoNewPrivs=1` for PID 1 in all seven containers.
- `CapEff=0` for `api`, `web`, and `n8n`.
- The deferred services retain no unexpected Compose capability additions.
- All seven containers use the original volumes and published ports.
- HTTPS still returns the expected redirect/application response and TLS
  verification succeeds.
- `scripts/healthcheck.sh`, `scripts/security-audit.sh`, systemd failed-unit
  count, UFW/DOCKER-USER, and backup checks remain healthy.

The expected impact is a short connection interruption while each container is
recreated. No volume is removed, recreated, or pruned.

## Failure Handling and Rollback

The rollout stops on the first failed service or failed post-service check.
The previous Compose file is used with the original project directory and
`.env` to recreate only the affected service, without changing the Git
worktree or touching persistent volumes. Re-run the same health and external
HTTPS checks before deciding whether to resume or abandon the rollout.

If rollback is required after the commit is merged, use the existing named
rollback-branch production procedure rather than force-resetting the VPS
worktree. Record the failed service, observed error, rollback result, and
container IDs in the evidence directory and Memory Bank.

## Success Criteria

The change is complete only when all of the following are true:

- The privilege contract, CI, lint/type checks, and Docker builds pass.
- The production rollout completes for all seven services with no volume/data
  changes.
- Runtime `NoNewPrivs` and capability evidence matches the policy matrix.
- SmartTour health, HTTPS/TLS, database/Redis/MinIO flows, firewall, backup,
  and systemd checks remain healthy.
- The SmartTour Memory Bank and the private `baomat` security inventory record
  the verified M2 container privilege control and exact commit/evidence path.

## Follow-up

Create separate reviewed rollouts for:

1. Image-specific non-root and read-only root filesystem hardening, beginning
   with `api` and `web` after writable paths are measured.
2. Network isolation with explicit edge, application/data, and automation
   networks and a tested communication allowlist.
