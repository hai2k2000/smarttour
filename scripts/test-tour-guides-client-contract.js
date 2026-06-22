const fs = require('fs');

const source = fs.readFileSync('apps/web/app/tour-guides/TourGuidesClient.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

includes("import { PermissionNotice, usePermissions } from '../usePermissions';", 'Tour guides client should use permission helpers.');
includes('const { can } = usePermissions();', 'Tour guides client should read current permissions.');
includes("const canViewGuides = can('guide.view');", 'Tour guides list should require guide.view.');
includes("const canManageGuides = can('guide.manage');", 'Tour guide mutations should require guide.manage.');
includes('<PermissionNotice allowed={canViewGuides}', 'Tour guides page should show a permission notice when guide.view is missing.');
includes('{canViewGuides ? (', 'Tour guides list/form content should be hidden when guide.view is missing.');
includes('disabled={!canManageGuides || loadingGuideId === row.original.id}', 'Edit action should be disabled without guide.manage.');
includes('disabled={!canManageGuides || reloading}', 'Create action should be disabled without guide.manage.');
includes("if (!canManageGuides) {", 'Submit handler should fail closed without guide.manage.');
includes("netPrice: z.coerce.number().min(0", 'Guide NET price should reject negative values before API submission.');
includes("sellingPrice: z.coerce.number().min(0", 'Guide selling price should reject negative values before API submission.');
includes('min={column.type === \'number\' ? 0 : undefined}', 'Guide numeric inputs should expose non-negative minimums.');

console.log('TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK');
