const fs = require('fs');

const docsUrl = process.env.API_DOCS_URL || 'https://aitour.io.vn/docs-json';
const client = docsUrl.startsWith('http://') ? require('http') : require('https');
const attempts = Number(process.env.HTTP_ATTEMPTS || 6);
const retryDelayMs = Number(process.env.HTTP_RETRY_DELAY_MS || 3000);

function parseExpectedActions() {
  const source = fs.readFileSync('scripts/test-action-endpoint-status-contract.js', 'utf8');
  return [...source.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((match) => ({
    file: match[1],
    method: match[2],
  }));
}

function parseControllerMethods(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const methods = new Map();
  let pendingDecorators = [];
  let controllerPrefix;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@')) {
      pendingDecorators.push(trimmed);
      continue;
    }

    if (/^export\s+class\s+/.test(trimmed)) {
      const controllerDecorator = pendingDecorators.find((decorator) => decorator.startsWith('@Controller('));
      controllerPrefix = controllerDecorator?.match(/^@Controller\('([^']*)'\)/)?.[1] ?? '';
      pendingDecorators = [];
      continue;
    }

    const method = trimmed.match(/^(?:async\s+)?([A-Za-z0-9_]+)\s*\(/)?.[1];
    if (method && controllerPrefix !== undefined) {
      methods.set(method, { controllerPrefix, decorators: pendingDecorators });
      pendingDecorators = [];
      continue;
    }

    if (trimmed && !trimmed.startsWith('//')) pendingDecorators = [];
  }

  return methods;
}

function routeFromDecorators(controllerPrefix, decorators) {
  const routeDecorator = decorators.find((decorator) => /^@(Post|Patch|Put|Delete|Get)\(/.test(decorator));
  if (!routeDecorator) return undefined;

  const method = routeDecorator.match(/^@([A-Za-z]+)/)?.[1]?.toLowerCase();
  const routeArgument = routeDecorator.match(/^@[A-Za-z]+\((.*)\)$/)?.[1] ?? '';
  const childPath = routeArgument.replace(/^['"]|['"]$/g, '');
  const path = ['/api', controllerPrefix, childPath]
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}');

  return { method, path };
}

function expectedActionResponses() {
  const controllerCache = new Map();
  return parseExpectedActions().map(({ file, method }) => {
    if (!controllerCache.has(file)) controllerCache.set(file, parseControllerMethods(file));
    const entry = controllerCache.get(file).get(method);
    const route = entry && routeFromDecorators(entry.controllerPrefix, entry.decorators);
    if (!route) throw new Error(`Cannot resolve route for ${file}:${method}`);
    return { ...route, source: `${file}:${method}` };
  });
}

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
      for (const { method, path, source } of expectedActionResponses()) {
        const responses = document.paths?.[path]?.[method]?.responses ?? {};
        if (!responses['200']) failures.push(`${method.toUpperCase()} ${path} missing 200 response (${source})`);
        if (responses['201']) failures.push(`${method.toUpperCase()} ${path} still exposes 201 response (${source})`);
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
