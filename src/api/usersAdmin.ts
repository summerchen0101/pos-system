import { supabase } from '../supabase'
import type { AppRole } from './authProfile'

export type AdminUserListEntry = {
  id: string
  name: string
  username: string
  role: AppRole
  boothIds: string[]
}

type UserRowNested = {
  id: string
  name: string
  username: string
  role: string
  user_booths: { booth_id: string }[] | null
}

export async function listUsersAdmin(): Promise<AdminUserListEntry[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, role, user_booths(booth_id)')
    .order('name')

  if (error) throw error

  return ((data ?? []) as unknown as UserRowNested[]).map((row) => ({
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role as AppRole,
    boothIds: (row.user_booths ?? []).map((x) => x.booth_id),
  }))
}

export async function updateAppUser(
  id: string,
  patch: { name: string; role: AppRole },
): Promise<void> {
  const { error } = await supabase.from('users').update(patch).eq('id', id)
  if (error) throw error
}

export async function replaceUserBooths(userId: string, boothIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from('user_booths').delete().eq('user_id', userId)
  if (delErr) throw delErr

  if (boothIds.length === 0) return

  const { error: insErr } = await supabase.from('user_booths').insert(
    boothIds.map((booth_id) => ({ user_id: userId, booth_id })),
  )
  if (insErr) throw insErr
}
