# Luutru Public HTTPS Endpoint Design

## Goal

Expose the existing Luutru frontend and API at `https://luutru.aitour.io.vn`
without publishing any new VPS port or changing the Luutru data-service
isolation. SmartTour must remain available at `https://aitour.io.vn` throughout
the rollout except for the short, controlled ACME standalone challenge window.

## Current State

- DNS `luutru.aitour.io.vn` resolves to `103.56.163.243`.
- `smarttour-nginx-1` owns public ports 80 and 443.
- `luutru-gateway-1` is healthy on Docker network `luutru_frontend` and also
  binds only `127.0.0.1:18080` on the host.
- The existing `aitour.io.vn` certificate is ECDSA and uses Certbot standalone
  renewal hooks that stop and restart only the SmartTour Nginx service.
- Luutru is deployed at source `f3f34462aea40b135cf15a349467976c3b2404bb`.

## Decision

Use the existing SmartTour Nginx container as the only public edge. Attach that
container to the external `luutru_frontend` Docker network and proxy the new
hostname to the stable `gateway:8080` network alias. Issue a separate ECDSA
Let's Encrypt certificate named `luutru.aitour.io.vn` so renewal and rollback do
not replace the SmartTour certificate lineage.

The public vhost will:

- Redirect HTTP to HTTPS.
- Proxy `/api/` and `/` to `gateway:8080` without rewriting paths.
- Apply a stricter login rate limit and a general API rate limit.
- Return 404 for public OpenAPI and API documentation paths.
- Preserve request identity headers and send the original HTTPS scheme.
- Apply HSTS and standard browser security headers.

Luutru will switch from `LUUTRU_ENV=staging` to `LUUTRU_ENV=production` before
the endpoint is considered active. Only API and worker require recreation for
that environment change. No user is created, no real document is uploaded, and
the remaining recovery/alerting/capacity gates are not marked complete by this
network rollout.

## Alternatives Considered

1. Run another public reverse proxy. Rejected because SmartTour already owns
   ports 80/443 and replacing the edge increases blast radius.
2. Proxy through a host gateway address. Rejected because Luutru intentionally
   binds to host loopback and weakening that binding would broaden exposure.
3. Share only `luutru_frontend` with SmartTour Nginx. Selected because it keeps
   one public edge and exposes only the Luutru gateway inside Docker.

## Validation

- A source contract must fail before the Compose network and Nginx vhost exist.
- `docker compose config --quiet` and `nginx -t` must pass before reload.
- External DNS, TLS hostname verification, HTTP redirect, frontend response,
  API health and unauthenticated session behavior must pass.
- SmartTour HTTPS, Luutru data-service IDs, volumes, public listeners, firewall,
  monitor and backup timers must remain unchanged or healthy as applicable.

## Rollback

Restore the previous SmartTour Compose and Nginx files, recreate only the Nginx
service, restore Luutru's previous environment file and recreate API/worker if
the production-mode switch must be reverted. Keep both certificate lineages and
all Docker volumes; certificate deletion is not part of automatic rollback.
