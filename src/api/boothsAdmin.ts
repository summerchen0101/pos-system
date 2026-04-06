import { DEFAULT_BOOTH_ID } from '../lib/boothConstants'
import { supabase } from '../supabase'
import { deletePromotionsNotLinkedToAnyBooth } from './promotionsAdmin'

export type AdminBooth = {
  id: string
  name: string
  location: string | null
  start_date: string | null
  end_date: string | null
  warehouse_id: string | null
}

type BoothRow = {
  id: string
  name: string
  location: string | null
  start_date: string | null
  end_date: string | null
  warehouse_id: string | null
}

const BOOTH_ADMIN_SELECT = 'id, name, location, start_date, end_date, warehouse_id'

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
    warehouse_id: row.warehouse_id ?? null,
  }
}

async function seedInventoryRows(warehouseId: string): Promise<void> {
  const { data: prods, error: pe } = await supabase.from('products').select('id')
  if (pe) throw pe
  const rows = (prods ?? []).map((p) => ({
    warehouse_id: warehouseId,
    product_id: p.id as string,
    stock: 0,
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from('inventory').upsert(rows, {
    onConflict: 'warehouse_id,product_id',
    ignoreDuplicates: true,
  })
  if (error) throw error
}

/** Creates booth-type warehouse, links booth, seeds empty inventory rows. */
export async function attachBoothWarehouse(boothId: string, boothName: string): Promise<string> {
  const whName = `${boothName.trim()}（攤位倉）`
  const { data: wh, error: we } = await supabase
    .from('warehouses')
    .insert({
      name: whName,
      type: 'booth',
      booth_id: boothId,
      note: null,
    })
    .select('id')
    .single()
  if (we) throw we
  const wid = wh.id as string
  const { error: ue } = await supabase.from('booths').update({ warehouse_id: wid }).eq('id', boothId)
  if (ue) throw ue
  await seedInventoryRows(wid)
  return wid
}

export type BoothCreateInput = {
  name: string
  location?: string | null
  startDate?: string | null
  endDate?: string | null
  warehouseId?: string | null
}

export async function createBooth(input: BoothCreateInput): Promise<AdminBooth> {
  const whId = input.warehouseId?.trim() ? input.warehouseId.trim() : null
  const { data, error } = await supabase
    .from('booths')
    .insert({
      name: input.name.trim(),
      location: input.location?.trim() ? input.location.trim() : null,
      start_date: input.startDate?.trim() ? input.startDate.trim() : null,
      end_date: input.endDate?.trim() ? input.endDate.trim() : null,
      warehouse_id: whId,
    })
    .select(BOOTH_ADMIN_SELECT)
    .single()
  if (error) throw error
  const booth = mapBoothRow(data as BoothRow)
  if (whId) {
    await seedInventoryRows(whId)
    const { data: refreshed, error: re } = await supabase
      .from('booths')
      .select(BOOTH_ADMIN_SELECT)
      .eq('id', booth.id)
      .single()
    if (re) throw re
    return mapBoothRow(refreshed as BoothRow)
  }
  await attachBoothWarehouse(booth.id, booth.name)
  const { data: refreshed, error: re } = await supabase
    .from('booths')
    .select(BOOTH_ADMIN_SELECT)
    .eq('id', booth.id)
    .single()
  if (re) throw re
  return mapBoothRow(refreshed as BoothRow)
}

export async function updateBooth(
  id: string,
  patch: {
    name?: string
    location?: string | null
    startDate?: string | null
    endDate?: string | null
    warehouseId?: string | null
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
  if (patch.warehouseId !== undefined) {
    row.warehouse_id = patch.warehouseId
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

  if (input.copyProductSettings && booth.warehouse_id) {
    const { data: srcBooth, error: se } = await supabase
      .from('booths')
      .select('warehouse_id')
      .eq('id', input.sourceBoothId)
      .single()
    if (se) throw se
    const srcWh = srcBooth?.warehouse_id as string | null
    if (srcWh) {
      const { data: invRows, error: ie } = await supabase
        .from('inventory')
        .select('product_id, stock')
        .eq('warehouse_id', srcWh)
      if (ie) throw ie
      const upserts = (invRows ?? []).map((r) => ({
        warehouse_id: booth.warehouse_id!,
        product_id: r.product_id as string,
        stock: r.stock as number,
      }))
      if (upserts.length > 0) {
        const { error: ue } = await supabase.from('inventory').upsert(upserts, {
          onConflict: 'warehouse_id,product_id',
        })
        if (ue) throw ue
      }
    }
  }

  return { booth, promotionsCopied }
}

/** Error codes: `BOOTH_DELETE_DEFAULT`, `BOOTH_HAS_ORDERS`, `BOOTH_HAS_STOCK`. */
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

  const { data: boothRow, error: be } = await supabase
    .from('booths')
    .select('warehouse_id')
    .eq('id', id)
    .single()
  if (be) throw be
  const whId = boothRow?.warehouse_id as string | null

  if (whId) {
    const { data: stocks, error: se } = await supabase.from('inventory').select('stock').eq('warehouse_id', whId)
    if (se) throw se
    const sum = (stocks ?? []).reduce((s, r) => s + (r.stock as number), 0)
    if (sum > 0) {
      throw new Error('BOOTH_HAS_STOCK')
    }
    const { error: n1 } = await supabase.from('booths').update({ warehouse_id: null }).eq('id', id)
    if (n1) throw n1
    const { error: de } = await supabase.from('warehouses').delete().eq('id', whId)
    if (de) throw de
  }

  const { error } = await supabase.from('booths').delete().eq('id', id)
  if (error) throw error

  await deletePromotionsNotLinkedToAnyBooth()
}
