import { supabase } from '../supabase'
import type { InventoryLogRow } from '../types/supabase'

export type AdminWarehouse = {
  id: string
  name: string
  type: 'warehouse' | 'booth'
  boothId: string | null
  boothName: string | null
  note: string | null
  createdAt: string
}

export async function listWarehousesAdmin(): Promise<AdminWarehouse[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select(
      'id, name, type, booth_id, note, created_at, booths!warehouses_booth_id_fkey(name)',
    )
    .order('name')
  if (error) throw error
  return (data ?? []).map((r: Record<string, unknown>) => {
    const b = r.booths as { name: string } | { name: string }[] | null | undefined
    const bn = Array.isArray(b) ? b[0]?.name : b?.name
    return {
      id: r.id as string,
      name: r.name as string,
      type: r.type as 'warehouse' | 'booth',
      boothId: (r.booth_id as string | null) ?? null,
      boothName: bn ?? null,
      note: (r.note as string | null) ?? null,
      createdAt: r.created_at as string,
    }
  })
}

export async function createWarehouseAdmin(input: {
  name: string
  type: 'warehouse' | 'booth'
  boothId?: string | null
  note?: string | null
}): Promise<void> {
  const { error } = await supabase.from('warehouses').insert({
    name: input.name.trim(),
    type: input.type,
    booth_id: input.boothId ?? null,
    note: input.note?.trim() ? input.note.trim() : null,
  })
  if (error) throw error
}

export async function updateWarehouseAdmin(
  id: string,
  patch: { name?: string; type?: 'warehouse' | 'booth'; boothId?: string | null; note?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.type !== undefined) row.type = patch.type
  if (patch.boothId !== undefined) row.booth_id = patch.boothId
  if (patch.note !== undefined) row.note = patch.note?.trim() ? patch.note.trim() : null
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('warehouses').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteWarehouseAdmin(id: string): Promise<void> {
  const { count: boothRefCount, error: be } = await supabase
    .from('booths')
    .select('*', { count: 'exact', head: true })
    .eq('warehouse_id', id)
  if (be) throw be
  if ((boothRefCount ?? 0) > 0) {
    throw new Error('WAREHOUSE_BINDS_BOOTH')
  }
  const { data: rows, error: e1 } = await supabase.from('inventory').select('stock').eq('warehouse_id', id)
  if (e1) throw e1
  const sum = (rows ?? []).reduce((s, r) => s + (r.stock as number), 0)
  if (sum > 0) {
    throw new Error('WAREHOUSE_HAS_STOCK')
  }
  const { error } = await supabase.from('warehouses').delete().eq('id', id)
  if (error) throw error
}

export type ProductWithCategory = {
  id: string
  name: string
  categoryId: string | null
  categoryName: string | null
}

export async function listProductsForInventory(): Promise<ProductWithCategory[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sort_order, category_id, categories(name, sort_order)')
    .eq('is_active', true)
    .in('kind', ['STANDARD', 'CUSTOM_BUNDLE'])
  if (error) throw error
  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const c = r.categories as { name: string; sort_order: number } | null
    const catSo = c?.sort_order
    return {
      id: r.id as string,
      name: r.name as string,
      categoryId: (r.category_id as string | null) ?? null,
      categoryName: c?.name ?? null,
      _catSort: catSo !== undefined && catSo !== null ? Math.trunc(Number(catSo) || 0) : 999999,
      _prodSort: Math.trunc(Number(r.sort_order) || 0),
    }
  })
  rows.sort(
    (a, b) =>
      a._catSort - b._catSort ||
      a._prodSort - b._prodSort ||
      a.name.localeCompare(b.name, 'zh-Hant'),
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
  }))
}

export async function fetchInventoryMatrix(): Promise<{
  warehouses: { id: string; name: string }[]
  rows: { product: ProductWithCategory; stockByWarehouse: Record<string, number> }[]
}> {
  const [warehousesRes, products, invRes] = await Promise.all([
    supabase.from('warehouses').select('id, name').order('name'),
    listProductsForInventory(),
    supabase.from('inventory').select('warehouse_id, product_id, stock'),
  ])
  if (warehousesRes.error) throw warehousesRes.error
  if (invRes.error) throw invRes.error
  const warehouses = (warehousesRes.data ?? []) as { id: string; name: string }[]
  const inv = invRes.data ?? []
  const rows = products.map((p) => {
    const stockByWarehouse: Record<string, number> = {}
    for (const w of warehouses) {
      stockByWarehouse[w.id] = 0
    }
    for (const r of inv) {
      if (r.product_id === p.id && r.warehouse_id) {
        stockByWarehouse[r.warehouse_id] = r.stock as number
      }
    }
    return { product: p, stockByWarehouse }
  })
  return { warehouses, rows }
}

export async function inventoryStockIn(input: {
  warehouseId: string
  productId: string
  quantity: number
  note?: string | null
}): Promise<void> {
  if (input.quantity < 1) throw new Error('invalid_qty')
  const { error } = await supabase.rpc('inventory_apply_adjustment', {
    p_warehouse_id: input.warehouseId,
    p_product_id: input.productId,
    p_delta: input.quantity,
    p_log_type: 'in',
    p_note: input.note ?? null,
  })
  if (error) throw error
}

export async function inventoryStockOut(input: {
  warehouseId: string
  productId: string
  quantity: number
  note?: string | null
}): Promise<void> {
  if (input.quantity < 1) throw new Error('invalid_qty')
  const { error } = await supabase.rpc('inventory_apply_adjustment', {
    p_warehouse_id: input.warehouseId,
    p_product_id: input.productId,
    p_delta: -input.quantity,
    p_log_type: 'out',
    p_note: input.note ?? null,
  })
  if (error) throw error
}

export async function inventoryTransferBetween(input: {
  fromWarehouseId: string
  toWarehouseId: string
  productId: string
  quantity: number
  note?: string | null
}): Promise<void> {
  if (input.quantity < 1) throw new Error('invalid_qty')
  const { error } = await supabase.rpc('inventory_transfer', {
    p_from_warehouse_id: input.fromWarehouseId,
    p_to_warehouse_id: input.toWarehouseId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_note: input.note ?? null,
  })
  if (error) throw error
}

export type InventoryLogListEntry = InventoryLogRow & {
  warehouseName: string | null
  productName: string | null
  createdByName: string | null
}

export type InventoryLogFilterType =
  | 'in'
  | 'out_manual'
  | 'pos_out'
  | 'transfer'
  | 'adjust'

export async function listInventoryLogsAdmin(filters: {
  warehouseId?: string | null
  productId?: string | null
  type?: InventoryLogFilterType | null
  rangeStart: Date
  rangeEnd: Date
}): Promise<InventoryLogListEntry[]> {
  let q = supabase
    .from('inventory_logs')
    .select(
      `
      id,
      warehouse_id,
      product_id,
      type,
      quantity,
      note,
      related_order_id,
      related_consumption_sheet_id,
      created_by,
      created_at,
      warehouse:warehouses!inventory_logs_warehouse_id_fkey(name),
      product:products!inventory_logs_product_id_fkey(name),
      operator:users!inventory_logs_created_by_fkey(name)
    `,
    )
    .gte('created_at', filters.rangeStart.toISOString())
    .lte('created_at', filters.rangeEnd.toISOString())
    .order('created_at', { ascending: false })

  if (filters.warehouseId) q = q.eq('warehouse_id', filters.warehouseId)
  if (filters.productId) q = q.eq('product_id', filters.productId)
  if (filters.type) {
    if (filters.type === 'out_manual') {
      q = q.eq('type', 'out').is('related_order_id', null)
    } else if (filters.type === 'pos_out') {
      q = q.eq('type', 'out').not('related_order_id', 'is', null)
    } else if (filters.type === 'transfer') {
      q = q.in('type', ['transfer_in', 'transfer_out'])
    } else {
      q = q.eq('type', filters.type)
    }
  }

  const { data, error } = await q
  if (error) throw error

  type Row = InventoryLogRow & {
    warehouse?: { name: string } | null
    product?: { name: string } | null
    operator?: { name: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const wh = r.warehouse
    const pr = r.product
    const us = r.operator
    return {
      id: r.id,
      warehouse_id: r.warehouse_id,
      product_id: r.product_id,
      type: r.type,
      quantity: r.quantity,
      note: r.note,
      related_order_id: r.related_order_id,
      related_consumption_sheet_id: r.related_consumption_sheet_id,
      created_by: r.created_by,
      created_at: r.created_at,
      warehouseName: wh?.name ?? null,
      productName: pr?.name ?? null,
      createdByName: us?.name ?? null,
    }
  })
}
