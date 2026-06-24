# Observability Alerting Runbook

SmartTour healthcheck can send a webhook when `scripts/healthcheck.sh` detects
one or more failures. Configure the target in `/etc/default/smarttour-ops` so
systemd timers and manual operator runs use the same settings.

## Required Setting

```bash
# /etc/default/smarttour-ops
HEALTHCHECK_WEBHOOK_URL=https://example-alert-endpoint.invalid/smarttour
```

Use a destination controlled by the operations team, such as a chat webhook,
incident webhook, or monitoring gateway. Do not commit the real URL to Git.

## Timeout and Retry Settings

The webhook call must never block the healthcheck indefinitely. Defaults are
safe for cron/systemd timer execution:

```bash
# /etc/default/smarttour-ops
HEALTHCHECK_WEBHOOK_CONNECT_TIMEOUT=5
HEALTHCHECK_WEBHOOK_MAX_TIME=10
HEALTHCHECK_WEBHOOK_RETRIES=2
HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT=5s
```

Increase these values only if the alert provider has documented slow responses.
The alert payload `hostname` and JSON generation step is bounded by
`HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT=5s`; if payload generation fails or times out,
the healthcheck logs a warning instead of hanging the timer.

Healthcheck route probes are also bounded so one slow endpoint cannot hang the
timer:

```bash
# /etc/default/smarttour-ops
HTTP_CONNECT_TIMEOUT=5
HTTP_MAX_TIME=10
HTTP_ATTEMPTS=6
HTTP_RETRY_DELAY=3
```

Docker/container probes are bounded separately so a stuck Docker daemon or
container exec/log command fails the healthcheck instead of hanging it:

```bash
# /etc/default/smarttour-ops
DOCKER_CHECK_TIMEOUT=10s
HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s
```

Text filtering over collected Docker, log, port, and systemd output is bounded
by `HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s`.

Systemd probes are also bounded so a stuck systemd/DBus call fails the
healthcheck instead of hiding or hanging the system health result:

```bash
# /etc/default/smarttour-ops
SYSTEMD_CHECK_TIMEOUT=10s
HEALTHCHECK_HOST_COMMAND_TIMEOUT=10s
```

Host-local healthcheck commands such as root mode, disk usage, and failure
hostname lookup are bounded by `HEALTHCHECK_HOST_COMMAND_TIMEOUT=10s`.

Backup checksum verification is bounded by `CHECKSUM_CHECK_TIMEOUT=5m` so a
large or stuck checksum read fails the healthcheck timer instead of hanging it.
Backup file discovery is bounded by `HEALTHCHECK_FILE_SCAN_TIMEOUT=30s` so a stuck backup directory scan fails the healthcheck timer instead of hanging it.
Restore-drill log marker and mtime reads are bounded by
`HEALTHCHECK_FILE_READ_TIMEOUT=10s` so a stuck log read fails the healthcheck
timer instead of hanging it.

## Apply Configuration

```bash
sudo install -m 600 /etc/default/smarttour-ops /etc/default/smarttour-ops.bak.$(date +%Y%m%d%H%M%S)
sudoedit /etc/default/smarttour-ops
sudo systemctl restart smarttour-healthcheck.timer
sudo systemctl list-timers --all 'smarttour-healthcheck*'
```

## Test Alert Delivery

Run a local failure probe with an intentionally impossible API URL:

```bash
cd /opt/smarttour
API_URL=http://127.0.0.1:1/api scripts/healthcheck.sh || true
```

Confirm the alert destination receives an event named
`smarttour_healthcheck_failed` with the VPS host and failure count. Then run the
normal healthcheck again:

```bash
scripts/healthcheck.sh
```

The normal run should print `HEALTHCHECK_OK` and should not send a failure alert.
It should also print `OK_DISASTER_BACKUP` for the latest disaster backup
archive age and checksum, plus `OK_RESTORE_DRILL` for the latest restore drill
log age and systemd result.
