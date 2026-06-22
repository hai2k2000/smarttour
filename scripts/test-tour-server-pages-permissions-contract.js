const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(source, token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

const helper = read('apps/web/app/serverPermissions.tsx');
includes(helper, 'export function hasPermission', 'Server permission helper should expose hasPermission.');
includes(helper, 'export function ServerPermissionNotice', 'Server permission helper should expose ServerPermissionNotice.');
includes(helper, "permissions.includes('*')", 'Server permission helper should honor wildcard permissions.');

for (const [path, label] of [
  ['apps/web/app/git-tours/page.tsx', 'GIT tours'],
  ['apps/web/app/landtours/page.tsx', 'LandTours'],
  ['apps/web/app/tour-programs/page.tsx', 'Tour programs'],
]) {
  const source = read(path);
  includes(source, "import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';", `${label} page should import server permission helpers.`);
  includes(source, "apiGet<PermissionUser | null>('/auth/me'", `${label} page should read the current session permissions.`);
  includes(source, "const canViewTours = hasPermission(currentUser, 'tour.view');", `${label} page should calculate tour.view permission.`);
  includes(source, "const canManageTours = hasPermission(currentUser, 'tour.manage');", `${label} page should calculate tour.manage permission.`);
  includes(source, '<ServerPermissionNotice allowed={canViewTours}', `${label} page should show permission notice when tour.view is missing.`);
  includes(source, '{canViewTours ? (', `${label} content should be hidden without tour.view.`);
  includes(source, '{canManageTours ? (', `${label} manage actions/forms should be hidden without tour.manage.`);
}

console.log('TEST_TOUR_SERVER_PAGES_PERMISSIONS_CONTRACT_OK');
