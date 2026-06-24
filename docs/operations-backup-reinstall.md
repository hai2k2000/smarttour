# SmartTour Backup and OS Reinstall Operations

## Schedule

The production VPS uses systemd timers:

- `smarttour-healthcheck.timer`: every 10 minutes.
- `smarttour-nginx-host-report.timer`: daily host/security log report.
- `smarttour-postgres-backup.timer`: daily at 02:15, with up to 5 minutes random delay.
- `smarttour-disaster-backup.timer`: Sunday at 03:30, with up to 10 minutes random delay.
- `smarttour-restore-drill.timer`: Sunday at 05:00, with up to 10 minutes random delay.

Install or refresh the schedule:

```bash
cd /opt/smarttour
sudo scripts/install-ops-schedule.sh
```

The installer bounds systemd operations with `OPS_SYSTEMD_TIMEOUT=30s` by
default, so a stuck systemd/DBus call fails the install instead of hanging it.
Installer log permission file scans are bounded by `OPS_FILE_SCAN_TIMEOUT=30s`
by default.

Inspect the schedule and logs:

```bash
systemctl list-timers --all 'smarttour-*'
systemctl status smarttour-healthcheck.timer
tail -100 /var/log/smarttour/healthcheck.log
tail -100 /var/log/smarttour/postgres-backup.log
tail -100 /var/log/smarttour/disaster-backup.log
tail -100 /var/log/smarttour/restore-drill.log
```

Runtime settings are stored in `/etc/default/smarttour-ops`. Keep that file
mode `600`.

The schedule installer also installs `/etc/logrotate.d/smarttour` for
`/var/log/smarttour/*.log`. Validate changes with:

```bash
cd /opt/smarttour
npm run test:ops-logrotate
sudo logrotate -d /etc/logrotate.d/smarttour
```

Operational logs and host security reports under `/var/log/smarttour` are kept
private (`750` directories, `0640` files) and are checked by `OK_OPS_LOG_PERMS`
in the security audit.
SmartTour ops systemd services also set `UMask=0027` so newly created logs stay
private after reinstall or cleanup.

## Backup Contents

Daily PostgreSQL backups are stored in:

```text
/opt/smarttour/backups/postgres
```

Daily PostgreSQL dump execution is bounded by `POSTGRES_BACKUP_TIMEOUT=30m` by
default, so a stuck Docker or `pg_dump` process fails the backup timer instead
of hanging it indefinitely.
Backup checksum creation and verification are bounded by `BACKUP_CHECKSUM_TIMEOUT=5m` by default.
Backup compression and restore decompression are bounded by `BACKUP_COMPRESSION_TIMEOUT=30m` by default.
Backup file discovery and retention cleanup are bounded by `BACKUP_FILE_SCAN_TIMEOUT=30s` by default.

Weekly disaster backups are stored in:

```text
/var/backups/smarttour/disaster
```

Each full disaster archive includes:

- PostgreSQL custom dump, plain SQL gzip, and global roles.
- Consistent raw PostgreSQL, MinIO, and n8n Docker volume archives.
- Git bundle with all repository refs.
- Commit, remote, and worktree state.
- `.env`, Compose, Prisma, scripts, docs, and Memory Bank.
- SSH, Netplan, Docker, Nginx, Let's Encrypt, cron, and systemd configuration.
- Host/network/container inventory.
- SHA256 checksums.

The weekly backup briefly stops the Compose stack while raw volumes are
archived, then starts it again. A trap restarts the stack if archiving fails.
Disaster backup Docker commands are bounded by
`DISASTER_BACKUP_DOCKER_TIMEOUT=30m` and Compose stop/start commands are
bounded by `DISASTER_BACKUP_COMPOSE_TIMEOUT=10m` by default.
Host inventory commands collected for the disaster archive are bounded by
`DISASTER_BACKUP_HOST_COMMAND_TIMEOUT=30s` by default. Archive creation and
checksum commands are bounded by `DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m` by
default. Git metadata and bundle commands are bounded by
`DISASTER_BACKUP_GIT_TIMEOUT=5m` by default. Disaster backup file discovery
and retention cleanup are bounded by `DISASTER_BACKUP_FILE_SCAN_TIMEOUT=30s`
by default.

## Backup Artifact Permissions

Backup artifacts must be private because they contain production data and the
disaster archive includes `.env` and server configuration. New artifacts are
created with mode `600`; backup directories are kept at mode `700`.
Temporary backup files are removed automatically if backup creation fails.
Disaster backup staging directories are removed after archive checksum verification.

Normalize existing files after a hardening change:

```bash
chmod 700 /opt/smarttour/backups/postgres
chmod 600 /opt/smarttour/backups/postgres/smarttour-*.sql.gz
chmod 600 /opt/smarttour/backups/postgres/smarttour-*.sql.gz.sha256
chmod 700 /var/backups/smarttour/disaster
chmod 600 /var/backups/smarttour/disaster/smarttour-disaster-*.tar.gz
chmod 600 /var/backups/smarttour/disaster/smarttour-disaster-*.tar.gz.sha256
```

Validate the source contract after changing backup artifact handling:

```bash
cd /opt/smarttour
npm run test:backup-artifact-permissions
```

## Off-Server Copy

A backup left only on the VPS is not a disaster backup. Configure a second
machine or object-storage gateway in `/etc/default/smarttour-ops`.

Daily PostgreSQL dump sync:

```bash
BACKUP_REMOTE_TARGET=backup-user@backup-host:/srv/backups/smarttour/postgres
BACKUP_REMOTE_PORT=22
BACKUP_REMOTE_KEY=/root/.ssh/id_ed25519_backup
BACKUP_REMOTE_CONNECT_TIMEOUT=10
BACKUP_REMOTE_SERVER_ALIVE_INTERVAL=15
BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX=2
BACKUP_REMOTE_SCP_TIMEOUT=30m
```

Full disaster archive sync:

```bash
DISASTER_BACKUP_REMOTE_TARGET=backup-user@backup-host:/srv/backups/smarttour
DISASTER_BACKUP_REMOTE_PORT=22
DISASTER_BACKUP_REMOTE_KEY=/root/.ssh/id_ed25519_backup
DISASTER_BACKUP_REMOTE_CONNECT_TIMEOUT=10
DISASTER_BACKUP_REMOTE_SERVER_ALIVE_INTERVAL=15
DISASTER_BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX=2
DISASTER_BACKUP_REMOTE_SCP_TIMEOUT=60m
```

The remote key must be dedicated to backup upload and mode `600`; both sync
scripts abort before SCP if the configured remote key is missing or has a
different mode.

```bash
chmod 600 /root/.ssh/id_ed25519_backup
```

Both sync scripts use `BatchMode=yes`, bounded SSH timeouts, and total SCP
timeouts so a broken remote destination or stuck transfer fails the scheduled
job instead of hanging indefinitely.
The remote key must be mode `600`.
The daily PostgreSQL dump sync runs `sha256sum -c` locally before uploading the
dump and checksum files. The disaster archive sync verifies `sha256sum -c` before upload as well.

Validate the source contract after changing backup sync settings or scripts:

```bash
cd /opt/smarttour
npm run test:backup-offsite
```

Run the daily dump sync manually after configuring a destination:

```bash
cd /opt/smarttour
npm run ops:backup-sync
```

Until an always-on backup destination exists, download each full archive to
the administrator workstation:

```powershell
$Key = "$HOME\.ssh\id_ed25519_booking_server"
scp -i $Key -P 24700 `
  root@103.56.163.243:/var/backups/smarttour/disaster/smarttour-disaster-*.tar.gz `
  .\smarttour-vps-backups\
scp -i $Key -P 24700 `
  root@103.56.163.243:/var/backups/smarttour/disaster/smarttour-disaster-*.sha256 `
  .\smarttour-vps-backups\
```

Verify SHA256 after transfer.

## Restore Drill Safety

DRILL_DB must be a throwaway database name made only of letters, numbers, and
underscores. Do not set `DRILL_DB` to `smarttour`, `postgres`, `template0`, or `template1`; the restore drill script aborts before any `dropdb` call when a
protected or unsafe name is supplied.
Restore-drill PostgreSQL commands are bounded by
`RESTORE_DRILL_COMMAND_TIMEOUT=30m` by default.
Backup checksum verification before restore is bounded by `BACKUP_CHECKSUM_TIMEOUT=5m`.
Backup decompression before restore is bounded by `BACKUP_COMPRESSION_TIMEOUT=30m`.
Backup discovery before restore is bounded by `BACKUP_FILE_SCAN_TIMEOUT=30s`.

Validate this guard after changing restore drill behavior:

```bash
cd /opt/smarttour
npm run test:restore-drill-safety
```

The healthcheck reports `OK_RESTORE_DRILL` when the latest restore drill log
contains `RESTORE_DRILL_OK`, is recent, and the systemd service result is
success.

## Manual Readiness Check

Before requesting an OS reinstall:

```bash
cd /opt/smarttour
scripts/healthcheck.sh
scripts/backup-postgres.sh
scripts/restore-drill-postgres.sh
scripts/disaster-backup.sh
systemctl list-timers --all 'smarttour-*'
docker compose ps
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Confirm:

1. The worktree is clean and `HEAD` equals `origin/main`.
2. The latest PostgreSQL backup checksum is valid.
3. The restore drill succeeds.
4. A current disaster archive exists outside the VPS.
5. SSH public keys are documented and tested.
6. The provider will preserve the public IP or DNS can be updated.

## SSH Public Keys

Only one-line public keys belong in `/root/.ssh/authorized_keys`. Do not store
private keys in Git or this document.

Known valid public-key labels from the recovery inspection:

- `Generated-by-Nova`
- `hai2k@booking-local`
- `cursor-vps`
- `hai-vps-key`
- `Ngoc_Tu@LAPTOP-ESJCOP2L`

The previous server contained one duplicated `cursor-vps` key and one malformed
line-wrapped `Ngoc_Tu` copy. Do not restore those bad entries. The full public
key values are included in the encrypted/restricted disaster archive under the
server configuration backup.

Required permissions:

```bash
chmod 755 /
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh
```

Test a second SSH session on port `24700` before disabling passwords or closing
the provider console.

## Fast Reinstall Path

1. Install a supported Ubuntu Server LTS image.
2. Confirm `/` is `755 root:root`.
3. Restore valid SSH public keys and port `24700`.
4. Install Git, Docker Engine, Buildx, and Docker Compose.
5. Clone `git@github.com:hai2k2000/smarttour.git` into `/opt/smarttour`.
6. Restore `.env` from the disaster archive and set mode `600`.
7. Start PostgreSQL, Redis, MinIO, and n8n.
8. Restore PostgreSQL from `database/smarttour.dump`.
9. Restore MinIO and n8n raw volumes while their containers are stopped.
10. Build and start API, web, and Nginx.
11. Restore or issue TLS certificates.
12. Install the operations schedule.
13. Run healthcheck and business smoke tests.
14. Keep the old provider snapshot until production verification passes.

Prefer the logical PostgreSQL dump for normal restore. Use the raw PostgreSQL
volume only as a last resort and only with the same PostgreSQL major version.
