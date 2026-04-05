import { DEFAULT_BOOTH_ID } from '../lib/boothConstants'
import { supabase } from '../supabase'

export type AdminBooth = {
  id: string
  name: string
  location: string | null
}

type BoothRow = {
  id: string
  name: string
  location: string | null
}

export async function listBoothsAdmin(): Promise<AdminBooth[]> {
  const { data, error } = await supabase.from('booths').select('id, name, location').order('name')
  if (error) throw error
  return (data ?? []).map((r) => mapBoothRow(r as BoothRow))
}

function mapBoothRow(row: BoothRow): AdminBooth {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
  }
}

export type BoothCreateInput = {
  name: string
  location?: string | null
}

export async function createBooth(input: BoothCreateInput): Promise<AdminBooth> {
  const { data, error } = await supabase
    .from('booths')
    .insert({
      name: input.name.trim(),
      location: input.location?.trim() ? input.location.trim() : null,
    })
    .select('id, name, location')
    .single()
  if (error) throw error
  return mapBoothRow(data as BoothRow)
}

export async function updateBooth(
  id: string,
  patch: { name?: string; location?: string | null },
): Promise<AdminBooth> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.location !== undefined) {
    row.location = patch.location?.trim() ? patch.location.trim() : null
  }
  if (Object.keys(row).length === 0) {
    const { data, error } = await supabase.from('booths').select('id, name, location').eq('id', id).single()
    if (error) throw error
    return mapBoothRow(data as BoothRow)
  }
  const { data, error } = await supabase.from('booths').update(row).eq('id', id).select('id, name, location').single()
  if (error) throw error
  return mapBoothRow(data as BoothRow)
}

/** Error `message` codes for UI mapping: `BOOTH_DELETE_DEFAULT`, `BOOTH_HAS_ORDERS`, `BOOTH_HAS_PROMOTIONS`. */
export async function deleteBooth(id: string): Promise<void> {
  if (id === DEFAULT_BOOTH_ID) {
    throw new Error('BOOTH_DELETE_DEFAULT')
  }

  const { count: orderCount, error: orderErr } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('booth_id', id)
  if (orderErr) throw orderErr
  if ((orderCount ?? 0) > 0) {
    throw new Error('BOOTH_HAS_ORDERS')
  }

  const { count: promoCount, error: promoErr } = await supabase
    .from('promotions')
    .select('*', { count: 'exact', head: true })
    .eq('booth_id', id)
  if (promoErr) throw promoErr
  if ((promoCount ?? 0) > 0) {
    throw new Error('BOOTH_HAS_PROMOTIONS')
  }

  const { error } = await supabase.from('booths').delete().eq('id', id)
  if (error) throw error
}
