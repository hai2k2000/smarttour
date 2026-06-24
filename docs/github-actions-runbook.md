# GitHub Actions Runbook

## SmartTour CI

`SmartTour CI` runs on pull requests and pushes to `main`, `fix/**`, and
`feature/**` branches. It installs dependencies with `npm ci`, generates the
Prisma client, runs production dependency audit and source contracts, typechecks
API/Web workspaces, and builds the API/Web Docker images.

The workflow writes a local CI-only `.env` for Docker Compose image builds. Do
not put production secrets in this file or in the workflow YAML.

## SmartTour Production Deploy

`SmartTour Production Deploy` is manual only through `workflow_dispatch`. It
connects to the VPS over SSH and runs `scripts/deploy-production.sh` inside the
configured project directory. The server-side deploy script still performs the
Git fast-forward pull, SmartLink legacy guard, Prisma migrations with
`npx prisma migrate deploy`, Docker build/up, and healthcheck.
It logs `DEPLOY_START` with the current commit, `DEPLOY_REVISION` after the
Git sync, and ordered phase markers for `DEPLOY_PHASE smartlink_guard`,
`DEPLOY_PHASE prisma_migrate_deploy`, `DEPLOY_PHASE docker_build`,
`DEPLOY_PHASE docker_up`, and `DEPLOY_PHASE healthcheck`.
Prisma migration, Docker build, and service startup are bounded by
`DEPLOY_PRISMA_MIGRATE_TIMEOUT=10m`, `DEPLOY_DOCKER_BUILD_TIMEOUT=45m`, and
`DEPLOY_DOCKER_UP_TIMEOUT=10m` by default.
The SmartLink legacy guard local Node path and Docker fallback are bounded by
`SMARTLINK_AUDIT_NODE_TIMEOUT=10m` and
`SMARTLINK_AUDIT_DOCKER_TIMEOUT=10m` by default.
Git fetch/checkout/pull during server-side sync are bounded by
`DEPLOY_GIT_TIMEOUT=5m` by default.
The deploy SSH connection is non-interactive and bounded with `BatchMode=yes`,
`ConnectTimeout=10`, `ServerAliveInterval=15`, and `ServerAliveCountMax=2`.
The manual dispatch inputs are validated before SSH starts. Branch names may
contain only letters, numbers, dot, underscore, slash, and hyphen; they cannot
start with `/`, contain `..`, contain `//`, or end with `.lock`. URLs must start
with `https://`.

Required GitHub environment or repository secrets:

- `SMARTTOUR_SSH_HOST`: VPS host name or IP.
- `SMARTTOUR_SSH_PORT`: SSH port, currently `24700` for the production VPS.
- `SMARTTOUR_SSH_USER`: SSH user, currently `root` for the production VPS.
- `SMARTTOUR_SSH_KEY`: private deploy key with access to the VPS.

Recommended GitHub environment:

- Name: `production`.
- Require manual approval before running the deploy job.
- Limit who can dispatch production deploys.

Manual dispatch inputs:

- `branch`: Git branch to deploy on the VPS. Use `main` for production after
  the remediation branch has been merged.
- `repo_dir`: absolute project path on the VPS, default `/opt/smarttour`.
- `site_url`: public site URL used by healthcheck.
- `api_url`: public API URL used by healthcheck.

Before first use, run a dry manual dispatch against a non-production branch only
if the VPS worktree can safely switch to that branch. Otherwise merge to `main`
first and deploy `main`.

The server-side deploy script aborts when tracked, staged, or untracked files
exist in the VPS worktree. Do not set `ALLOW_DIRTY=true` in GitHub Actions.
Emergency dirty deploys must be run explicitly on the VPS with an operator
present. When `ALLOW_DIRTY=true` is used on the VPS, set
`DEPLOY_DIRTY_REASON` with the incident/change reason; the deploy script aborts
without it and logs the reason when the override is accepted.
