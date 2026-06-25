const fs = require('fs');

const source = fs.readFileSync('scripts/healthcheck.sh', 'utf8');
const failures = [];

if (!source.includes('"event":"request_failed".*"statusCode":4[0-9][0-9]')) {
  failures.push('healthcheck must ignore structured RequestLoggingInterceptor 4xx request_failed logs');
}

if (!source.includes('"event":"request_completed"')) {
  failures.push('healthcheck must ignore structured successful request logs so request paths containing error words do not trip log scans');
}

if (source.includes('"event":"request_failed".*"statusCode":[45][0-9][0-9]')) {
  failures.push('healthcheck must not ignore structured 5xx request_failed logs');
}

if (!source.includes("grep -Eiq 'error|exception|failed'")) {
  failures.push('healthcheck must keep scanning for real error/exception/failed signatures');
}

if (failures.length) {
  console.error('FAIL_HEALTHCHECK_LOG_FILTER_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_HEALTHCHECK_LOG_FILTER_CONTRACT_OK');
