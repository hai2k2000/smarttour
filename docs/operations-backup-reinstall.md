# SmartTour Backup and OS Reinstall Operations

## Schedule

The production VPS uses systemd timers:

- Health check: every 10 minutes.
- PostgreSQL backup: daily at 02:15, with up to 5 minutes random delay.
- Full disaster backup: Sunday at 03:30, with up to 10 minutes random delay.
- PostgreSQL restore drill: Sunday at 05:00, with up to 10 minutes random delay.

Install or refresh the schedule:

```bash
cd /opt/smarttour
sudo scripts/install-ops-schedule.sh
```

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

## Backup Contents

Daily PostgreSQL backups are stored in:

```text
/opt/smarttour/backups/postgres
```

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

## Off-Server Copy

A backup left only on the VPS is not a disaster backup. Configure a second
machine or object-storage gateway in `/etc/default/smarttour-ops`:

```bash
DISASTER_BACKUP_REMOTE_TARGET=backup-user@backup-host:/srv/backups/smarttour
DISASTER_BACKUP_REMOTE_PORT=22
DISASTER_BACKUP_REMOTE_KEY=/root/.ssh/id_ed25519_backup
```

The remote key must be dedicated to backup upload and mode `600`.

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
