const baseUrl = process.env.API_URL || 'https://aitour.io.vn/api';
const client = baseUrl.startsWith('http://') ? require('http') : require('https');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const req = client.request(
      url,
      {
        method: options.method || 'GET',
        rejectUnauthorized: false,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve({
              statusCode: response.statusCode,
              correlationId: response.headers['x-correlation-id'],
              body: JSON.parse(body),
            });
          } catch (error) {
            reject(new Error(`Invalid JSON error response for ${path}: ${error.message}`));
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function validateShape(label, response, expected) {
  const failures = [];
  const body = response.body || {};
  if (response.statusCode !== expected.statusCode) failures.push(`${label} expected HTTP ${expected.statusCode} got ${response.statusCode}`);
  if (!response.correlationId) failures.push(`${label} missing x-correlation-id`);
  for (const field of ['statusCode', 'message', 'messages', 'error', 'code', 'path', 'method', 'correlationId', 'timestamp']) {
    if (!(field in body)) failures.push(`${label} missing body.${field}`);
  }
  if (body.statusCode !== expected.statusCode) failures.push(`${label} body.statusCode mismatch`);
  if (body.code !== expected.code) failures.push(`${label} expected code ${expected.code} got ${body.code}`);
  if (body.path !== expected.path) failures.push(`${label} expected path ${expected.path} got ${body.path}`);
  if (body.method !== expected.method) failures.push(`${label} expected method ${expected.method} got ${body.method}`);
  if (!Array.isArray(body.messages)) failures.push(`${label} body.messages must be an array`);
  if (!body.correlationId) failures.push(`${label} missing body.correlationId`);
  if (Number.isNaN(Date.parse(body.timestamp))) failures.push(`${label} timestamp must be ISO-like`);
  const serialized = JSON.stringify(body).toLowerCase();
  for (const unsafe of ['tokenvalue', 'secretvalue', 'cookie']) {
    if (serialized.includes(unsafe)) failures.push(`${label} leaked unsafe token ${unsafe}`);
  }
  return failures;
}

async function main() {
  const failures = [];
  const unauthorized = await request('/auth/me');
  failures.push(
    ...validateShape('auth/me 401', unauthorized, {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      path: '/api/auth/me',
      method: 'GET',
    }),
  );

  const validation = await request('/auth/login', { method: 'POST', body: {} });
  failures.push(
    ...validateShape('auth/login 400', validation, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      path: '/api/auth/login',
      method: 'POST',
    }),
  );


  const unknownErrorPath = process.env.PHASE3_UNKNOWN_ERROR_PATH || '/phase3/unknown-error';
  if (process.env.PHASE3_UNKNOWN_ERROR_PATH) {
    const unknown = await request(unknownErrorPath);
    failures.push(
      ...validateShape('unknown 500', unknown, {
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        path: unknownErrorPath.startsWith('/api/') ? unknownErrorPath : `/api${unknownErrorPath}`,
        method: 'GET',
      }),
    );
  }

  if (failures.length) {
    console.error('FAIL_ERROR_RESPONSE_SHAPE_SMOKE');
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log('SMOKE_ERROR_RESPONSE_SHAPE_OK');
}

main().catch((error) => {
  console.error('FAIL_ERROR_RESPONSE_SHAPE_SMOKE');
  console.error(error);
  process.exit(1);
});
