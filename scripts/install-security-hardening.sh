#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
SSH_SOURCE="$REPO_DIR/deploy/ssh/01-smarttour-hardening.conf"
SSH_TARGET="/etc/ssh/sshd_config.d/01-smarttour-hardening.conf"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Security hardening installer must run as root" >&2
  exit 1
fi

if [[ ! -s /root/.ssh/authorized_keys ]]; then
  echo "Refusing to disable password authentication without a root authorized_keys file" >&2
  exit 1
fi

if [[ -f "$REPO_DIR/.env" ]]; then
  chmod 600 "$REPO_DIR/.env"
fi

chmod 755 /
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh

install -d -m 0755 /etc/ssh/sshd_config.d
install -m 0644 "$SSH_SOURCE" "$SSH_TARGET"

sshd -t
systemctl reload ssh || systemctl reload sshd

cd "$REPO_DIR"
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

sshd -T | grep -E '^(port|passwordauthentication|pubkeyauthentication|permitrootlogin|authenticationmethods|maxauthtries|logingracetime)'
echo "SECURITY_HARDENING_INSTALL_OK"
