const docsUrl = process.env.API_DOCS_URL || 'https://aitour.io.vn/docs-json';
const client = docsUrl.startsWith('http://') ? require('http') : require('https');
const attempts = Number(process.env.HTTP_ATTEMPTS || 6);
const retryDelayMs = Number(process.env.HTTP_RETRY_DELAY_MS || 3000);

const expectedActionResponses = [
  ['/api/auth/login', 'post'],
  ['/api/auth/logout', 'post'],
  ['/api/auth/change-password', 'post'],
  ['/api/operation-vouchers/{id}/payment', 'post'],
  ['/api/operation-vouchers/{id}/create-payment-voucher', 'post'],
  ['/api/tours/{id}/close', 'post'],
  ['/api/fit-tours/export', 'post'],
  ['/api/fit-tours/{id}/steps/{step}/confirm', 'post'],
  ['/api/fit-tours/{id}/copy-budget', 'post'],
  ['/api/fit-tours/{id}/copy-operation', 'post'],
  ['/api/git-tours/{id}/copy-services', 'post'],
  ['/api/landtours/{id}/copy-services', 'post'],
];

function fetchDocument() {
  return new Promise((resolve, reject) => {
    client
      .get(docsUrl, { rejectUnauthorized: false }, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          const contentType = String(response.headers['content-type'] || '');
          if (response.statusCode !== 200 || !contentType.includes('application/json')) {
            reject(new Error(`Unexpected docs response status=${response.statusCode} content-type=${contentType}`));
            return;
          }
          resolve(JSON.parse(body));
        });
      })
      .on('error', reject);
  });
}

async function main() {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const document = await fetchDocument();
      const failures = [];
      for (const [route, method] of expectedActionResponses) {
        const responses = document.paths?.[route]?.[method]?.responses ?? {};
        if (!responses['200']) failures.push(`${method.toUpperCase()} ${route} missing 200 response`);
        if (responses['201']) failures.push(`${method.toUpperCase()} ${route} still exposes 201 response`);
      }
      if (failures.length) {
        console.error('FAIL_SWAGGER_ACTION_STATUS_SMOKE');
        for (const failure of failures) console.error(failure);
        process.exit(1);
      }
      console.log('SWAGGER_ACTION_STATUS_SMOKE_OK');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  console.error('FAIL_SWAGGER_ACTION_STATUS_SMOKE');
  console.error(lastError);
  process.exit(1);
}

main().catch((error) => {
  console.error('FAIL_SWAGGER_ACTION_STATUS_SMOKE');
  console.error(error);
  process.exit(1);
});
