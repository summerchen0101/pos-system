import { DEFAULT_BOOTH_ID } from '../lib/boothConstants'
import { supabase } from '../supabase'
import { deletePromotionsNotLinkedToAnyBooth } from './promotionsAdmin'

export type AdminBooth = {
  id: string
  name: string
  location: string | null
  start_date: string | null
  end_date: string | null
}

type BoothRow = {
  id: string
  name: string
  location: string | null
  start_date: string | null
  end_date: string | null
}

const BOOTH_ADMIN_SELECT = 'id, name, location, start_date, end_date'

export async function listBoothsAdmin(): Promise<AdminBooth[]> {
  const { data, error } = await supabase.from('booths').select(BOOTH_ADMIN_SELECT).order('name')
  if (error) throw error
  return (data ?? []).map((r) => mapBoothRow(r as BoothRow))
}

function mapBoothRow(row: BoothRow): AdminBooth {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
  }
}

export type BoothCreateInput = {
  name: string
  location?: string | null
  startDate?: string | null
  endDate?: string | null
}

export async function createBooth(input: BoothCreateInput): Promise<AdminBooth> {
  const { data, error } = await supabase
    .from('booths')
    .insert({
      name: input.name.trim(),
      location: input.location?.trim() ? input.location.trim() : null,
      start_date: input.startDate?.trim() ? input.startDate.trim() : null,
      end_date: input.endDate?.trim() ? input.endDate.trim() : null,
    })
    .select(BOOTH_ADMIN_SELECT)
    .single()
  if (error) throw error
  return mapBoothRow(data as BoothRow)
}

export async function updateBooth(
  id: string,
  patch: {
    name?: string
    location?: string | null
    startDate?: string | null
    endDate?: string | null
  },
): Promise<AdminBooth> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.location !== undefined) {
    row.location = patch.location?.trim() ? patch.location.trim() : null
  }
  if (patch.startDate !== undefined) {
    row.start_date = patch.startDate?.trim() ? patch.startDate.trim() : null
  }
  if (patch.endDate !== undefined) {
    row.end_date = patch.endDate?.trim() ? patch.endDate.trim() : null
  }
  if (Object.keys(row).length === 0) {
    const { data, error } = await supabase.from('booths').select(BOOTH_ADMIN_SELECT).eq('id', id).single()
    if (error) throw error
    return mapBoothRow(data as BoothRow)
  }
  const { data, error } = await supabase.from('booths').update(row).eq('id', id).select(BOOTH_ADMIN_SELECT).single()
  if (error) throw error
  return mapBoothRow(data as BoothRow)
}

export type CopyBoothAdminInput = {
  sourceBoothId: string
  name: string
  location: string | null
  startDate: string | null
  endDate: string | null
  copyPromotions: boolean
  /** Reserved: products are global; no booth-scoped rows to duplicate. */
  copyProductSettings: boolean
}

export async function copyBoothAdmin(
  input: CopyBoothAdminInput,
): Promise<{ booth: AdminBooth; promotionsCopied: number }> {
  const booth = await createBooth({
    name: input.name,
    location: input.location,
    startDate: input.startDate,
    endDate: input.endDate,
  })
  let promotionsCopied = 0
  if (input.copyPromotions) {
    const { data: links, error: linkErr } = await supabase
      .from('promotion_booths')
      .select('promotion_id')
      .eq('booth_id', input.sourceBoothId)
    if (linkErr) throw linkErr
    const promoIds = [...new Set((links ?? []).map((r) => r.promotion_id))]
    if (promoIds.length > 0) {
      const { error: insErr } = await supabase.from('promotion_booths').insert(
        promoIds.map((promotion_id) => ({ promotion_id, booth_id: booth.id })),
      )
      if (insErr) throw insErr
    }
    promotionsCopied = promoIds.length
  }
  void input.copyProductSettings
  return { booth, promotionsCopied }
}

/** Error `message` codes for UI mapping: `BOOTH_DELETE_DEFAULT`, `BOOTH_HAS_ORDERS`. */
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

  const { error } = await supabase.from('booths').delete().eq('id', id)
  if (error) throw error

  await deletePromotionsNotLinkedToAnyBooth()
}
