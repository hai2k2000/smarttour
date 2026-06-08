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
chmod +x scripts/install-security-hardening.sh scripts/install-ops-schedule.sh
scripts/install-security-hardening.sh
scripts/install-ops-schedule.sh
```

Open a second SSH session with the configured key before closing the first session.

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

## CDN/WAF follow-up

The next major layer is to put `aitour.io.vn` behind a CDN/WAF. After CDN activation,
restrict origin ports `80/443` to the CDN edge IP ranges. Do not apply that firewall
restriction before CDN DNS and certificate routing are verified, because it would
make the site unavailable.
