# SmartTour Luutru DNS Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prevent SmartTour Nginx from resolving ambiguous Luutru web and api service aliases while preserving both public hostnames.

**Architecture:** Add unique smarttour-api and smarttour-web aliases on the SmartTour default network. Route only the SmartTour vhost to those aliases and keep the Luutru vhost on gateway:8080.

**Tech Stack:** Docker Compose, Docker DNS, Nginx, Node.js source contracts, GitHub Actions.

---

### Task 1: Add the failing DNS-isolation contract

**Files:**
- Modify: scripts/test-luutru-public-endpoint-contract.js

- [ ] **Step 1: Require unique Compose aliases**

Add assertions after the Nginx network assertion:

    const apiAliases = compose.services?.api?.networks?.default?.aliases ?? [];
    const webAliases = compose.services?.web?.networks?.default?.aliases ?? [];
    if (!apiAliases.includes('smarttour-api')) {
      throw new Error('SmartTour API must expose the unique smarttour-api alias');
    }
    if (!webAliases.includes('smarttour-web')) {
      throw new Error('SmartTour web must expose the unique smarttour-web alias');
    }

- [ ] **Step 2: Require isolated SmartTour upstreams**

Add these required Nginx fragments:

    proxy_pass http://smarttour-api:4000/api/auth/login;
    proxy_pass http://smarttour-api:4000/api/;
    proxy_pass http://smarttour-web:3000;

Reject the ambiguous fragments:

    proxy_pass http://api:4000
    proxy_pass http://web:3000

- [ ] **Step 3: Run RED**

Run:

    node scripts/test-luutru-public-endpoint-contract.js

Expected: FAIL with SmartTour API must expose the unique smarttour-api alias.

### Task 2: Implement unique service aliases

**Files:**
- Modify: docker-compose.yml
- Modify: deploy/nginx/default.conf

- [ ] **Step 1: Add the API alias**

Add to the api service:

    networks:
      default:
        aliases:
          - smarttour-api

- [ ] **Step 2: Add the web alias**

Add to the web service:

    networks:
      default:
        aliases:
          - smarttour-web

- [ ] **Step 3: Replace only SmartTour Nginx upstreams**

Use smarttour-api for the SmartTour login and API locations. Use
smarttour-web for the SmartTour root location. Do not change the Luutru
gateway target or the web service SMARTTOUR_SERVER_API_URL.

- [ ] **Step 4: Run GREEN**

Run:

    node scripts/test-luutru-public-endpoint-contract.js
    docker compose config --quiet

Expected: TEST_LUUTRU_PUBLIC_ENDPOINT_CONTRACT_OK and both commands exit 0.

### Task 3: Verify and integrate source

- [ ] **Step 1: Run full verification**

Run:

    npm test
    npm run lint
    npm run build
    npm audit --omit=dev
    node scripts/test-compose-resource-contract.js
    node scripts/test-compose-privilege-contract.js
    node scripts/test-github-actions-contract.js
    git diff --check

Expected: every command exits 0 and the production audit reports zero vulnerabilities.

- [ ] **Step 2: Commit and push**

Commit as fix: isolate SmartTour upstream DNS aliases, push
codex/luutru-dns-isolation, create a pull request, wait for the exact HEAD CI,
and squash-merge only after success.

### Task 4: Activate and verify production

- [ ] **Step 1: Fast-forward runtime source**

Fetch origin/main in /opt/smarttour, require the reviewed merge commit, and
fast-forward with no local modifications.

- [ ] **Step 2: Validate before recreation**

Run docker compose config --quiet. Temporarily connect the current Nginx to
luutru_frontend, confirm smarttour-web and smarttour-api resolve to SmartTour
container addresses, and run nginx -t.

- [ ] **Step 3: Recreate only Nginx**

Run:

    docker compose up -d --no-deps --force-recreate nginx

Require both smarttour_default and luutru_frontend membership.

- [ ] **Step 4: Verify both public sites**

Require SmartTour HTTPS root 307. Require Luutru HTTP root 301, HTTPS root
200, live health 200, unauthenticated session 401 and OpenAPI 404. Require
curl TLS verification exit 0 for both hostnames.

- [ ] **Step 5: Verify invariants and evidence**

Require all Luutru services healthy, unchanged data-service IDs and volumes,
unchanged host listeners, active UFW and DOCKER-USER controls, active backup
and monitor timers, zero failed units and zero container restarts. Save
post-state evidence and verify SHA256SUMS.

- [ ] **Step 6: Roll back on failure**

Disconnect luutru_frontend from SmartTour Nginx and reload Nginx. If source
activation itself is invalid, restore the saved SmartTour config and previous
commit before recreating only Nginx. Preserve all Luutru data, volumes,
certificate files and logs.
