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
Git fast-forward pull, SmartLink legacy guard, Docker build/up, and healthcheck.

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

Do not set `ALLOW_DIRTY=true` in GitHub Actions. Emergency dirty deploys must be
run explicitly on the VPS with an operator present.
