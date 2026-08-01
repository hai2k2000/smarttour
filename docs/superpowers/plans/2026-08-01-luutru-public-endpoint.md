# Luutru Public Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the existing Luutru frontend and API at `https://luutru.aitour.io.vn` through the SmartTour Nginx edge without adding a public port or exposing Luutru data services.

**Architecture:** SmartTour Nginx joins the external `luutru_frontend` network and routes the new hostname to `gateway:8080`. A separate ECDSA Certbot lineage provides TLS, while Luutru API/worker run with `LUUTRU_ENV=production`.

**Tech Stack:** Docker Compose, Nginx, Certbot/Let's Encrypt, Node.js contract tests, GitHub Actions, Bash.

---

### Task 1: Add the failing public-endpoint contract

**Files:**
- Create: `scripts/test-luutru-public-endpoint-contract.js`
- Modify: `package.json`
- Modify: `.github/workflows/smarttour-ci.yml`

- [ ] **Step 1: Write the source contract**

Create a Node contract that resolves canonical Compose JSON and requires the Nginx service networks to be exactly `default` plus `luutru_frontend`. Require the external network name `luutru_frontend`.

Require these exact Nginx fragments: `server_name luutru.aitour.io.vn;`, both `/etc/letsencrypt/live/luutru.aitour.io.vn/` certificate paths, `location = /api/v1/auth/login`, `location = /api/openapi.json`, `proxy_pass http://gateway:8080`, `zone=luutru_login:10m rate=10r/m`, and `zone=luutru_api:10m rate=120r/m`.

Require package script `test:luutru-public-endpoint` to execute the contract and require SmartTour CI to execute the same Node file directly.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-luutru-public-endpoint-contract.js`

Expected: FAIL because the Nginx service does not join `luutru_frontend` and the vhost does not exist.

### Task 2: Implement the Compose and Nginx boundary

**Files:**
- Modify: `docker-compose.yml`
- Modify: `deploy/nginx/default.conf`
- Modify: `package.json`
- Modify: `.github/workflows/smarttour-ci.yml`

- [ ] **Step 1: Join only Nginx to the external network**

Add `networks: [default, luutru_frontend]` to the Nginx service. Add a top-level external network with `name: luutru_frontend`.

- [ ] **Step 2: Add the Luutru vhosts**

Add rate zones `luutru_login` at 10 requests/minute and `luutru_api` at 120 requests/minute. Add an HTTP redirect vhost and an HTTPS vhost using the separate certificate lineage.

The HTTPS vhost must return 404 for `/api/openapi.json` and `/api/docs`, rate-limit `/api/v1/auth/login`, rate-limit general `/api/`, proxy all API and frontend requests to `http://gateway:8080` without path rewriting, and set Host, X-Real-IP, X-Forwarded-For and X-Forwarded-Proto headers.

- [ ] **Step 3: Wire the contract into package and CI**

Add package command `node scripts/test-luutru-public-endpoint-contract.js` and run it in the SmartTour CI Source contracts step.

- [ ] **Step 4: Run GREEN**

Run the new contract, both existing Docker Compose resource/privilege contracts, and `docker compose config --quiet`. Expected: all exit 0.

### Task 3: Record operational context

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Record the decision and limits**

Record the hostname, shared frontend-network boundary, separate certificate, production environment switch, validation commands and rollback. State explicitly that this rollout creates no Luutru user and uploads no real document.

- [ ] **Step 2: Verify documentation**

Run `git diff --check` and scan the design/plan for `TBD`, `TODO`, `implement later`, and `fill in`. Expected: no findings.

### Task 4: Verify, commit and integrate source

- [ ] **Step 1: Run project verification**

Run `npm test`, `npm run lint`, `npm run build`, `npm audit --omit=dev`, and `docker compose config --quiet`. Expected: every command exits 0 and production audit reports zero vulnerabilities.

- [ ] **Step 2: Commit and push**

Commit as `feat: publish Luutru through SmartTour edge`, push `codex/luutru-public-endpoint`, create a pull request, wait for CI, and merge only the exact verified HEAD.

### Task 5: Issue certificate and activate on VPS

**Files:**
- Create evidence: `/root/security-change-20260801-luutru-public-endpoint/`
- Fast-forward runtime source: `/opt/smarttour`
- Modify root-only runtime environment: `/opt/luutru/.env`

- [ ] **Step 1: Capture rollback evidence**

Record Nginx/container/network state, Luutru source/data IDs, listeners, volumes, firewall, timers and current environment mode.

- [ ] **Step 2: Issue the certificate**

Run Certbot standalone with the existing global stop/start hooks, ECDSA key type, certificate name and domain `luutru.aitour.io.vn`.

- [ ] **Step 3: Activate Luutru production mode**

Back up `.env`, replace only `LUUTRU_ENV=staging` with `LUUTRU_ENV=production`, run deploy preflight, recreate only API/worker, and require 8/8 healthy services.

- [ ] **Step 4: Activate the edge**

Fast-forward `/opt/smarttour` to the verified merge commit. Run Compose config, connect the current Nginx container temporarily to `luutru_frontend` for `nginx -t`, then recreate only Nginx so the network is persistent.

- [ ] **Step 5: Verify public behavior**

Require HTTP redirect 301, HTTPS frontend 200, API health 200, unauthenticated session 401, public OpenAPI 404, SmartTour 307 and TLS hostname verification 0.

Also require unchanged Luutru data IDs, Docker volumes and listeners; active UFW/DOCKER-USER, monitor/backup timers, zero failed units, zero container restarts, and checksum-valid evidence.

- [ ] **Step 6: Roll back on failure**

Restore the previous SmartTour commit/config and recreate only Nginx. Restore the saved Luutru environment and recreate API/worker if the production-mode switch fails. Preserve volumes, database schema, certificate files and logs.
