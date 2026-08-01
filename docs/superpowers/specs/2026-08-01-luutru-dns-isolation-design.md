# Luutru Edge DNS Isolation Design

## Problem

SmartTour Nginx must join both smarttour_default and the external
luutru_frontend network. Both Compose projects publish the implicit service
aliases web and api. After the production Nginx container was recreated,
Docker DNS resolved those short names to Luutru (172.22.0.2 and
172.22.0.4) instead of SmartTour. As a result, https://aitour.io.vn/
served the Luutru frontend with status 200 instead of the SmartTour
authentication redirect 307.

Disconnecting luutru_frontend and reloading Nginx restored SmartTour. This
proves the fault is cross-network alias ambiguity rather than either
application.

## Decision

Give the SmartTour api and web services explicit aliases on the default
network:

- smarttour-api
- smarttour-web

The SmartTour HTTPS vhost must proxy only to these unique aliases. The Luutru
vhost continues to use the unique gateway:8080 target on luutru_frontend.

## Alternatives Rejected

1. Container names such as smarttour-web-1 are unique but couple Nginx to
   the Compose project name and prevent safe scaling.
2. A third edge-only network would also isolate names but adds topology and
   operational work without improving this two-upstream boundary.
3. Relying on Docker network order is invalid because alias selection changed
   after container recreation and is not an isolation control.

## Runtime Flow

1. Nginx resolves smarttour-web and smarttour-api only on smarttour_default.
2. Requests for aitour.io.vn reach those SmartTour aliases.
3. Nginx resolves gateway only on luutru_frontend.
4. Requests for luutru.aitour.io.vn reach the Luutru gateway.
5. Luutru data services remain private and no new host port is published.

## Verification

The public-endpoint source contract must fail unless Compose exposes both
unique aliases and the SmartTour Nginx vhost uses them instead of ambiguous
web or api upstreams. Production verification must require:

- Nginx DNS maps smarttour-web and smarttour-api to SmartTour containers.
- SmartTour HTTPS root returns 307.
- Luutru HTTP/HTTPS/API responses remain 301/200/200/401/404.
- Both projects remain healthy with unchanged data-service IDs, volumes and
  host listeners.

## Rollback
