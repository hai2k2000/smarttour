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
includes(clientSource, 'const { can } = usePermissions();', 'FIT tours client should read current permissions.');
includes(clientSource, "const canViewTours = can('tour.view');", 'FIT tours list should require tour.view.');
includes(clientSource, "const canManageTours = can('tour.manage');", 'FIT tour mutations should require tour.manage.');
includes(clientSource, "const canExportTours = can('tour.export');", 'FIT tour exports should require tour.export.');
includes(clientSource, '<PermissionNotice allowed={canViewTours}', 'FIT tours page should show a permission notice when tour.view is missing.');
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

console.log('TEST_FIT_TOURS_CLIENT_CONTRACT_OK');
