import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'smarttour.permissions';
export const PUBLIC_ROUTE_KEY = 'smarttour.public';

export function RequirePermissions(...permissions: string[]) {
  return SetMetadata(PERMISSIONS_KEY, permissions);
}

export function Public() {
  return SetMetadata(PUBLIC_ROUTE_KEY, true);
}
