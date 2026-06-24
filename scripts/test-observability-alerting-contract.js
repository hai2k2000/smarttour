const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

function excludes(source, text, message) {
  if (source.includes(text)) throw new Error(message);
}

function exists(file, message) {
  if (!fs.existsSync(file)) throw new Error(message);
}

const healthcheck = read('scripts/healthcheck.sh');
const installOpsSchedule = read('scripts/install-ops-schedule.sh');
includes(healthcheck, 'HEALTHCHECK_WEBHOOK_URL', 'Healthcheck must support a webhook alert target.');
includes(healthcheck, 'HEALTHCHECK_WEBHOOK_CONNECT_TIMEOUT', 'Webhook alerting must have a configurable connect timeout.');
includes(healthcheck, 'HEALTHCHECK_WEBHOOK_MAX_TIME', 'Webhook alerting must have a configurable total timeout.');
includes(healthcheck, 'HEALTHCHECK_WEBHOOK_RETRIES', 'Webhook alerting must have bounded retries.');
includes(healthcheck, 'HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT="${HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT:-5s}"', 'Webhook alert payload creation must have a configurable timeout.');
includes(healthcheck, 'run_alert_payload_command()', 'Healthcheck must wrap alert payload commands.');
includes(healthcheck, 'timeout "$HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT" "$@"', 'Alert payload commands must be bounded.');
includes(healthcheck, '--connect-timeout "$webhook_connect_timeout"', 'Webhook curl must use the connect timeout.');
includes(healthcheck, '--max-time "$webhook_max_time"', 'Webhook curl must use the total timeout.');
includes(healthcheck, '--retry "$webhook_retries"', 'Webhook curl must use bounded retry count.');
includes(healthcheck, 'smarttour_healthcheck_failed', 'Webhook payload must include a stable event name.');
includes(healthcheck, 'JSON.stringify', 'Webhook payload must be JSON-escaped by Node before curl sends it.');
includes(healthcheck, 'alert_host="$(run_alert_payload_command hostname 2>/dev/null || printf \'unknown\')"', 'Webhook payload host lookup must be bounded.');
includes(healthcheck, 'run_alert_payload_command node -e', 'Webhook payload JSON generation must run through the bounded wrapper.');
includes(healthcheck, 'notify_failure "SmartTour healthcheck failed', 'Healthcheck must notify only after aggregated failures.');
excludes(healthcheck, '--data "{\"text\":\"$message\"}"', 'Webhook payload must not be an ad-hoc text-only JSON string.');
excludes(healthcheck, 'SMARTTOUR_ALERT_HOST="$(hostname)" SMARTTOUR_ALERT_MESSAGE="$message" node -e', 'Webhook payload creation must not use raw hostname/node.');

for (const text of [
  '# HEALTHCHECK_WEBHOOK_URL=https://example-alert-endpoint.invalid/smarttour',
  '# HEALTHCHECK_WEBHOOK_CONNECT_TIMEOUT=5',
  '# HEALTHCHECK_WEBHOOK_MAX_TIME=10',
  '# HEALTHCHECK_WEBHOOK_RETRIES=2',
  '# HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT=5s',
]) {
  includes(installOpsSchedule, text, `Ops env template must document ${text}.`);
}

const packageJson = JSON.parse(read('package.json'));
if (packageJson.scripts['test:observability-alerting'] !== 'node scripts/test-observability-alerting-contract.js') {
  throw new Error('package.json must expose test:observability-alerting.');
}

const runbook = 'docs/observability-alerting-runbook.md';
exists(runbook, 'Observability alerting runbook must exist.');
const runbookText = read(runbook);
for (const text of [
  'HEALTHCHECK_WEBHOOK_URL',
  'HEALTHCHECK_WEBHOOK_CONNECT_TIMEOUT',
  'HEALTHCHECK_WEBHOOK_MAX_TIME',
  'HEALTHCHECK_WEBHOOK_RETRIES',
  'HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT',
  'scripts/healthcheck.sh',
  '/etc/default/smarttour-ops',
  'systemctl restart smarttour-healthcheck.timer',
]) {
  includes(runbookText, text, `Observability runbook must document ${text}.`);
}

console.log('TEST_OBSERVABILITY_ALERTING_CONTRACT_OK');
