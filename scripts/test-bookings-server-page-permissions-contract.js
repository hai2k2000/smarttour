const fs = require('fs');

const source = fs.readFileSync('apps/web/app/bookings/page.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

includes("import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';", 'Bookings page should use server permission helpers.');
includes("apiGet<PermissionUser | null>('/auth/me'", 'Bookings page should read current session permissions.');
includes("const canViewBookings = hasPermission(currentUser, 'booking.view');", 'Bookings page should calculate booking.view permission.');
includes("const canManageBookings = hasPermission(currentUser, 'booking.manage');", 'Bookings page should calculate booking.manage permission.');
includes("const [tourProgramsResult, bookingsResult] = canViewBookings ? await Promise.all", 'Bookings page should not load booking data without booking.view.');
includes("apiGet<TourProgram[]>('/tour-programs?take=100'", 'Bookings page should bound the tour-program master list payload.');
includes('<ServerPermissionNotice allowed={canViewBookings}', 'Bookings page should show permission notice when booking.view is missing.');
includes('{canViewBookings ? (', 'Bookings content should be hidden without booking.view.');
includes('{canManageBookings ? (', 'Booking create/edit/status/delete modals should be hidden without booking.manage.');
includes('{canManageBookings ? <a className="secondaryButton iconTextButton" href="#create-booking"', 'Create booking action should be hidden without booking.manage.');
includes('{canManageBookings ? (\n                        <>', 'Booking row mutation actions should be hidden without booking.manage.');

console.log('TEST_BOOKINGS_SERVER_PAGE_PERMISSIONS_CONTRACT_OK');
