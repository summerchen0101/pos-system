import { supabase } from '../supabase'

export type AppRole = 'ADMIN' | 'MANAGER' | 'STAFF'

export type UserProfile = {
  id: string
  name: string
  username: string
  phone: string | null
  role: AppRole
  boothIds: string[]
  /** Warehouses linked to booths in `user_booths` (for booth-scoped stocktake, etc.). */
  managedWarehouseIds: string[]
}

export function isAdminRole(role: AppRole): boolean {
  return role === 'ADMIN'
}

export function isManagerRole(role: AppRole): boolean {
  return role === 'MANAGER'
}

/** Post-login: ADMIN and MANAGER land on admin dashboard. */
export function prefersAdminDashboardLanding(role: AppRole): boolean {
  return isAdminRole(role) || isManagerRole(role)
}

/** Default `/admin` index: STAFF goes to orders (no dashboard). */
export function defaultAdminHomePath(role: AppRole): string {
  return prefersAdminDashboardLanding(role) ? '/admin/dashboard' : '/admin/orders'
}

export function canManageStocktakeForWarehouse(
  profile: UserProfile,
  warehouseId: string,
): boolean {
  if (isAdminRole(profile.role)) return true
  return profile.managedWarehouseIds.includes(warehouseId)
}

export async function fetchUserProfile(): Promise<UserProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: row, error } = await supabase
    .from('users')
    .select('id, name, role, username, phone')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const { data: ub, error: ube } = await supabase.from('user_booths').select('booth_id').eq('user_id', user.id)

  if (ube) throw ube

  const boothIds = (ub ?? []).map((x) => x.booth_id)
  const managedWarehouseIds: string[] = []
  if (boothIds.length > 0) {
    const seen = new Set<string>()
    const { data: bRows, error: be } = await supabase
      .from('booths')
      .select('warehouse_id')
      .in('id', boothIds)
    if (be) throw be
    for (const b of bRows ?? []) {
      const wid = b.warehouse_id as string | null
      if (wid && !seen.has(wid)) {
        seen.add(wid)
        managedWarehouseIds.push(wid)
      }
    }
    const { data: wRows, error: we } = await supabase
      .from('warehouses')
      .select('id')
      .in('booth_id', boothIds)
    if (we) throw we
    for (const w of wRows ?? []) {
      const wid = w.id as string
      if (wid && !seen.has(wid)) {
        seen.add(wid)
        managedWarehouseIds.push(wid)
      }
    }
  }

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    phone: row.phone,
    role: row.role as AppRole,
    boothIds,
    managedWarehouseIds,
  }
}
