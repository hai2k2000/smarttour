const fs = require('fs');

const source = fs.readFileSync('apps/web/app/tour-guides/TourGuidesClient.tsx', 'utf8');
const controller = fs.readFileSync('apps/api/src/modules/tour-guides/tour-guides.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/tour-guides/tour-guides.service.ts', 'utf8');
const dto = fs.readFileSync('apps/api/src/modules/tour-guides/dto/tour-guide.dto.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

includes("import { PermissionNotice, usePermissions } from '../usePermissions';", 'Tour guides client should use permission helpers.');
includes('const { can, permissionsReady } = usePermissions();', 'Tour guides client should read current permissions and wait for readiness.');
includes("const canViewGuides = can('guide.view');", 'Tour guides list should require guide.view.');
includes("const canManageGuides = can('guide.manage');", 'Tour guide mutations should require guide.manage.');
includes('PermissionNotice allowed={!permissionsReady || canViewGuides}', 'Tour guides page should show a permission notice when guide.view is missing.');
includes('{canViewGuides ? (', 'Tour guides list/form content should be hidden when guide.view is missing.');
includes('disabled={!canManageGuides || loadingGuideId === row.original.id}', 'Edit action should be disabled without guide.manage.');
includes('disabled={!canManageGuides || reloading}', 'Create action should be disabled without guide.manage.');
includes("if (!canManageGuides) {", 'Submit handler should fail closed without guide.manage.');
includes("netPrice: z.coerce.number().min(0", 'Guide NET price should reject negative values before API submission.');
includes("sellingPrice: z.coerce.number().min(0", 'Guide selling price should reject negative values before API submission.');
includes('min={column.type === \'number\' ? 0 : undefined}', 'Guide numeric inputs should expose non-negative minimums.');



const page = fs.readFileSync('apps/web/app/tour-guides/page.tsx', 'utf8');
function pageIncludes(token, message) {
  assert(page.includes(token), message || `Missing expected page source: ${token}`);
}
pageIncludes("import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';", 'Tour guides page should use server permission helpers.');
pageIncludes("apiGet<PermissionUser | null>(", 'Tour guides page should read current session permissions before loading guides.');
pageIncludes("'/auth/me'", 'Tour guides page should call auth session endpoint.');
pageIncludes("const canViewGuides = hasPermission(currentUser, 'guide.view');", 'Tour guides page should calculate guide.view access.');
pageIncludes('canViewGuides ? await apiGet', 'Tour guides page should not preload guides without guide.view.');
pageIncludes("apiGet('/tour-guides?take=100'", 'Tour guides page should bound the SSR guide list payload.');
pageIncludes('<ServerPermissionNotice allowed={canViewGuides}', 'Tour guides page should show server permission notice when access is missing.');
pageIncludes('{canViewGuides ? (', 'Tour guides page should hide protected client content without access.');

includes('const { can, permissionsReady } = usePermissions();', 'Tour guides client should wait for permission readiness.');
includes('if (!permissionsReady || !canViewGuides) {', 'Tour guides reload/detail handlers should fail closed before API calls without view access.');
includes('setGuides([]);', 'Tour guides client should clear server-provided rows when view access is missing.');
includes('PermissionNotice allowed={!permissionsReady || canViewGuides}', 'Tour guides client should avoid permission flash while permissions load.');
includes('disabled={!canViewGuides || reloading}', 'Tour guides reload button should be disabled without view access.');
includes("params.set('take', '100');", 'Tour guides reload should request a bounded guide list.');

assert(dto.includes('class ListTourGuidesQueryDto'), 'Tour guide list query DTO must exist.');
assert(dto.includes('take?: number'), 'Tour guide list query DTO must accept bounded take.');
assert(dto.includes('MAX_TOUR_GUIDES_TAKE'), 'Tour guide list query DTO must cap take.');
assert(controller.includes('list(@Query() query: ListTourGuidesQueryDto'), 'Tour guide list route must use the validated list query DTO.');
assert(service.includes('this.listTake(query.take)'), 'Tour guide list service must apply bounded take.');
assert(service.includes('searchScanTake'), 'Tour guide search must use a bounded scan before accent-insensitive filtering.');

console.log('TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK');
