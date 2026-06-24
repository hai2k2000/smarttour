# SmartTour Security Hardening

## Applied controls

- Nginx only proxies the official host `aitour.io.vn`.
- Unknown HTTP hosts return `444`.
- Unknown HTTPS SNI is rejected during the TLS handshake.
- Login is limited to 10 requests per minute per source IP, with a burst of 5.
- API traffic is limited to 120 requests per minute per source IP, with a burst of 60.
- Nginx Docker logs rotate at 20 MB with 5 retained files.
- SSH accepts public-key authentication only.
- A daily Nginx host report records top hosts, unknown hosts, IPs, and status codes.

## Install after OS reinstall

Install the root SSH public key before running hardening.

```bash
cd /opt/smarttour
chmod 600 /opt/smarttour/.env
chmod 755 /
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh
chmod +x scripts/install-security-hardening.sh scripts/install-ops-schedule.sh
scripts/install-security-hardening.sh
scripts/install-ops-schedule.sh
```

Open a second SSH session with the configured key before closing the first session.
The operations schedule installer bounds systemd calls with
`OPS_SYSTEMD_TIMEOUT=30s` by default. Its log permission file scans are bounded
by `OPS_FILE_SCAN_TIMEOUT=30s` by default.
The security hardening installer bounds SSH validation/reload and Nginx reload
commands with `SECURITY_INSTALL_COMMAND_TIMEOUT=10s` by default.

Validate the security audit source contract and the live host audit:

```bash
cd /opt/smarttour
npm run test:security-audit
npm run ops:security
```

The live audit bounds external command probes with `AUDIT_COMMAND_TIMEOUT=10s`
and `NPM_AUDIT_TIMEOUT=120s` by default. Increase these only for a known slow
host. Treat `FAIL_PORTS docker_unavailable`, `FAIL_SSH sshd_config_unavailable`,
and `FAIL_NPM_AUDIT failed_or_timed_out` as real security audit failures.
Security audit file scans are bounded by `AUDIT_FILE_SCAN_TIMEOUT=30s` by default, including backup artifact, disaster staging, and ops log permission scans.
Security audit config and permission reads are bounded by
`AUDIT_FILE_READ_TIMEOUT=10s` by default.

The live audit must include `OK_ENV_FILE`, `OK_OPS_ENV_FILE`, `OK_LOGROTATE`,
`OK_OPS_LOG_PERMS`, `OK_OPS_SERVICE_UMASK`, `OK_BACKUP_PERMS`,
`OK_DISASTER_STAGING`, `OK_ROOT_MODE`, and `OK_SSH_PERMS` lines for `.env`,
`/etc/default/smarttour-ops`, `/etc/logrotate.d/smarttour`,
`/var/log/smarttour`, SmartTour ops service umasks, backup artifacts, absence of
expanded disaster backup staging directories, `/`, `/root/.ssh`, and
`/root/.ssh/authorized_keys`.

## Daily host report

Latest report:

```bash
cat /var/log/smarttour/security/nginx-host-report-latest.txt
```

Run manually:

```bash
cd /opt/smarttour
scripts/nginx-host-report.sh
```

Docker log collection for the report is bounded by
`HOST_REPORT_DOCKER_TIMEOUT=10s` by default, so a stuck Docker log read fails
the host report job instead of hanging it. Host report retention cleanup scans
are bounded by `HOST_REPORT_FILE_SCAN_TIMEOUT=30s` by default. Host report text
processing is bounded by `HOST_REPORT_TEXT_TIMEOUT=10s` by default.

The report is installed by the operations schedule as
`smarttour-nginx-host-report.timer`. The full timer set should include:

- `smarttour-healthcheck.timer`
- `smarttour-nginx-host-report.timer`
- `smarttour-postgres-backup.timer`
- `smarttour-disaster-backup.timer`
- `smarttour-restore-drill.timer`

Inspect timers after reinstall:

```bash
systemctl list-timers --all 'smarttour-*'
```

## CDN/WAF follow-up

The next major layer is to put `aitour.io.vn` behind a CDN/WAF. After CDN activation,
restrict origin ports `80/443` to the CDN edge IP ranges. Do not apply that firewall
restriction before CDN DNS and certificate routing are verified, because it would
make the site unavailable.
