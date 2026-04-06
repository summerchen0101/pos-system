import { supabase } from '../supabase'

export type AppRole = 'ADMIN' | 'STAFF'

export type UserProfile = {
  id: string
  name: string
  username: string
  phone: string | null
  role: AppRole
  boothIds: string[]
}

export function isAdminRole(role: AppRole): boolean {
  return role === 'ADMIN'
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

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    phone: row.phone,
    role: row.role as AppRole,
    boothIds: (ub ?? []).map((x) => x.booth_id),
  }
}
