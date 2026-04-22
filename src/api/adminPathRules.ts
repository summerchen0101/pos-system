import { isAdminRole, isManagerRole, type AppRole } from './authProfile'

/** Sidebar paths in display order (ADMIN). */
export const ADMIN_MENU_KEYS = new Set([
  '/admin/dashboard',
  '/admin/orders',
  '/admin/analytics',
  '/admin/clock-logs',
  '/admin/categories',
  '/admin/products',
  '/admin/booths',
  '/admin/inventory',
  '/admin/inventory/warehouses',
  '/admin/inventory/stocktakes',
  '/admin/inventory/logs',
  '/admin/promotions',
  '/admin/gifts',
  '/admin/shifts',
  '/admin/users',
])

export const MANAGER_MENU_KEYS = new Set([
  '/admin/dashboard',
  '/admin/orders',
  '/admin/analytics',
  '/admin/clock-logs',
  '/admin/inventory/stocktakes',
  '/admin/shifts',
  '/admin/my-shifts',
  '/admin/my-clock-logs',
  '/admin/users',
])

export const STAFF_MENU_KEYS = new Set([
  '/admin/orders',
  '/admin/clock-logs',
  '/admin/my-shifts',
  '/admin/my-clock-logs',
])

export function menuKeysForRole(role: AppRole): Set<string> {
  if (isAdminRole(role)) return ADMIN_MENU_KEYS
  if (isManagerRole(role)) return MANAGER_MENU_KEYS
  return STAFF_MENU_KEYS
}

export function pathAllowedForRole(pathname: string, role: AppRole): boolean {
  const allowed = menuKeysForRole(role)
  return [...allowed].some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** True for any `/admin` route; used to scope auth-error handling. */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}
