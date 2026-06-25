const fs = require('fs');

const main = fs.readFileSync('apps/api/src/main.ts', 'utf8');
const middlewarePath = 'apps/api/src/correlation-id.middleware.ts';
const interceptorPath = 'apps/api/src/request-logging.interceptor.ts';
const failures = [];

if (!fs.existsSync(middlewarePath)) {
  failures.push('correlation ID middleware is missing');
} else {
  const source = fs.readFileSync(middlewarePath, 'utf8');
  for (const token of [
    'CORRELATION_ID_HEADER',
    'x-correlation-id',
    'randomUUID',
    'createCorrelationIdMiddleware',
    'setHeader',
    'correlationId',
  ]) {
    if (!source.includes(token)) failures.push(`correlation middleware missing ${token}`);
  }
}

if (!fs.existsSync(interceptorPath)) {
  failures.push('request logging interceptor is missing');
} else {
  const source = fs.readFileSync(interceptorPath, 'utf8');
  for (const token of [
    'RequestLoggingInterceptor',
    'Logger',
    'request_completed',
    'request_failed',
    'correlationId',
    'durationMs',
    'statusCode',
    'method',
    'path',
    'errorCode',
    'errorStack',
    'this.logger.error',
  ]) {
    if (!source.includes(token)) failures.push(`request logging interceptor missing ${token}`);
  }
  for (const unsafe of ['body', 'headers', 'authorization', 'cookie', 'password', 'token', 'secret']) {
    if (source.toLowerCase().includes(unsafe)) failures.push(`request logging interceptor must not log sensitive request data: ${unsafe}`);
  }
}

if (!main.includes("import { createCorrelationIdMiddleware } from './correlation-id.middleware';")) {
  failures.push('main.ts must import correlation middleware');
}
if (!main.includes("import { RequestLoggingInterceptor } from './request-logging.interceptor';")) {
  failures.push('main.ts must import request logging interceptor');
}
if (!main.includes('app.use(createCorrelationIdMiddleware())')) {
  failures.push('main.ts must register correlation middleware');
}
if (!main.includes('app.useGlobalInterceptors(new RequestLoggingInterceptor())')) {
  failures.push('main.ts must register request logging interceptor globally');
}

if (failures.length) {
  console.error('FAIL_LOGGING_CORRELATION_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_LOGGING_CORRELATION_CONTRACT_OK');
