const fs = require('fs');

const source = fs.readFileSync('scripts/smoke-operations-ui.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

includes("const site = process.env.SITE_URL || 'https://aitour.io.vn';", 'Operations UI smoke should keep the production site as the browser target by default.');
includes("const api = process.env.API_URL || 'http://127.0.0.1:4000/api';", 'Operations UI smoke should default backend calls to the local API to avoid production nginx rate limits.');
includes('const clientApiProxyFrom =', 'Operations UI smoke should keep client API proxy support.');
includes('const loginEmail =', 'Operations UI smoke should keep email and username login identifiers separate.');
includes('isEmailLike', 'Operations UI smoke should not send an invalid username value through the email field.');
includes('...(loginEmail ? { email: loginEmail } : {})', 'Operations UI smoke should only include email when it is a valid email address.');
includes("'https://aitour.io.vn/api'", 'Operations UI smoke should proxy the built production API base when using the local API.');
includes('page.route(`${clientApiProxyFrom}/**`, async (route) => {', 'Operations UI smoke should route browser API requests through the selected API target.');
includes('const targetUrl = `${targetApi}${pathSuffix}${requestUrl.search}`;', 'Operations UI smoke should preserve API path and query string while proxying.');

assert(
  source.indexOf("const api = process.env.API_URL || 'http://127.0.0.1:4000/api';") < source.indexOf('const clientApiProxyFrom ='),
  'Operations UI smoke should establish the API target before configuring the client proxy.',
);

console.log('TEST_OPERATIONS_UI_SMOKE_CONTRACT_OK');
