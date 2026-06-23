const fs = require('fs');

const clientSource = fs.readFileSync('apps/web/app/fit-tours/FitToursClient.tsx', 'utf8');
const wizardSource = fs.readFileSync('apps/web/app/fit-tours/FitTourWizard.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(source, token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

includes(clientSource, "import { PermissionNotice, usePermissions } from '../usePermissions';", 'FIT tours client should use permission helpers.');
includes(clientSource, 'const { can, permissionsReady } = usePermissions();', 'FIT tours client should read current permissions and wait for readiness.');
includes(clientSource, "const canViewTours = can('tour.view');", 'FIT tours list should require tour.view.');
includes(clientSource, "const canManageTours = can('tour.manage');", 'FIT tour mutations should require tour.manage.');
includes(clientSource, "const canExportTours = can('tour.export');", 'FIT tour exports should require tour.export.');
includes(clientSource, 'PermissionNotice allowed={!permissionsReady || canViewTours}', 'FIT tours page should show a permission notice when tour.view is missing.');
includes(clientSource, '{canViewTours ? (', 'FIT tours content should be hidden when tour.view is missing.');
includes(clientSource, 'disabled={!canManageTours || listBusy}', 'Create action should be disabled without tour.manage.');
includes(clientSource, 'disabled={!canManageTours}', 'Edit action should be disabled without tour.manage.');
includes(clientSource, 'disabled={!canExportTours}', 'Export action should be disabled without tour.export.');
includes(clientSource, 'if (!canManageTours) {', 'Create/edit handlers should fail closed without tour.manage.');
includes(clientSource, 'if (!canExportTours) {', 'Export handler should fail closed without tour.export.');
includes(clientSource, 'canManageTours={canManageTours}', 'FIT tours client should pass manage permission into the wizard.');

includes(wizardSource, 'canManageTours: boolean;', 'FIT tour wizard should accept a manage permission prop.');
includes(wizardSource, 'canManageTours,', 'FIT tour wizard should read the manage permission prop.');
includes(wizardSource, 'if (!canManageTours) {', 'FIT tour wizard mutation handlers should fail closed without tour.manage.');
includes(wizardSource, 'const isMutationDisabled = !canManageTours || isBusy;', 'FIT tour wizard should centralize mutation disabled state.');
includes(wizardSource, 'disabled={isMutationDisabled}', 'FIT tour wizard primary mutation buttons should be disabled without tour.manage.');
includes(wizardSource, 'if (!canManageTours || !files) return;', 'FIT attachment upload should not start without tour.manage.');


const pageSource = fs.readFileSync('apps/web/app/fit-tours/page.tsx', 'utf8');
function pageIncludes(token, message) {
  assert(pageSource.includes(token), message || `Missing expected page source: ${token}`);
}

pageIncludes("import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';", 'FIT tours page should use server permission helpers.');
pageIncludes("apiGet<PermissionUser | null>(", 'FIT tours page should read current session permissions before loading data.');
pageIncludes("'/auth/me'", 'FIT tours page should call auth session endpoint.');
pageIncludes("const canViewTours = hasPermission(currentUser, 'tour.view');", 'FIT tours page should calculate tour.view access.');
pageIncludes("const canManageTours = hasPermission(currentUser, 'tour.manage');", 'FIT tours page should calculate tour.manage access.');
pageIncludes('canViewTours ? await apiGet', 'FIT tours page should not preload tour rows without tour.view.');
pageIncludes("'/fit-tours?take=100'", 'FIT tours page should request a bounded initial tour list.');
pageIncludes('canManageTours ? await apiGet', 'FIT tours page should not preload suppliers without tour.manage.');
pageIncludes("'/suppliers?take=100'", 'FIT tours page should request a bounded supplier catalog preload.');
pageIncludes('<ServerPermissionNotice allowed={canViewTours}', 'FIT tours page should show server permission notice when access is missing.');
pageIncludes('{canViewTours ? (', 'FIT tours page should hide protected client content without access.');

includes(clientSource, 'const { can, permissionsReady } = usePermissions();', 'FIT tours client should wait for permission readiness.');
includes(clientSource, 'if (!permissionsReady || !canViewTours) {', 'FIT tours reload handler should fail closed before API calls without view access.');
includes(clientSource, 'setRows([]);', 'FIT tours client should clear server-provided rows when view access is missing.');
includes(clientSource, "params.set('take', '100');", 'FIT tours reload should request a bounded list from the backend.');
includes(clientSource, 'PermissionNotice allowed={!permissionsReady || canViewTours}', 'FIT tours client should avoid permission flash while permissions load.');
includes(clientSource, 'disabled={!canViewTours || listBusy}', 'FIT tours reload/search controls should be disabled without view access.');

console.log('TEST_FIT_TOURS_CLIENT_CONTRACT_OK');
