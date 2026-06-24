# SmartLink Legacy Migration

SmartLink public URLs now require a 32-byte random base64url token. Legacy tokens such as `slug-timestamp` are intentionally rejected by the public endpoint and must be rotated before deploy.

## Audit

Run an audit before deploy:

```bash
npm run ops:smartlink:audit -- --output smartlink-legacy-audit.json
```

The audit exits successfully and lists active legacy links plus inactive legacy tokens for information.

## Backfill

Rotate active legacy links and produce a resend list:

```bash
npm run ops:smartlink:backfill -- --output smartlink-legacy-backfill.json
```

The `rotated` rows contain `oldPublicUrl` and `newPublicUrl`. Send the new URL to customers for every rotated quotation.

## Deploy Guard

Production deploy runs:

```bash
scripts/smartlink-legacy-audit.sh --mode=guard
```

If any active SmartLink still has a legacy or missing token, deploy stops with `SMARTLINK_LEGACY_ACTIVE`.
The local Node audit path is bounded by `SMARTLINK_AUDIT_NODE_TIMEOUT=10m`.
When the wrapper must fall back to Docker because local `node_modules` are not
available, the Docker run is bounded by `SMARTLINK_AUDIT_DOCKER_TIMEOUT=10m`.
