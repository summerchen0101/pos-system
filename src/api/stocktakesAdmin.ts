import { compareCatalogOrder } from './productMapper'
import { supabase } from '../supabase'

export type StocktakeStatus = 'draft' | 'completed'

export type StocktakeListEntry = {
  id: string
  warehouseId: string
  warehouseName: string | null
  status: StocktakeStatus
  note: string | null
  createdByName: string | null
  createdAt: string
  completedAt: string | null
  lastEditedAt: string
}

export async function listStocktakesAdmin(filters: {
  warehouseId?: string | null
  status?: StocktakeStatus | null
  rangeStart?: Date | null
  rangeEnd?: Date | null
}): Promise<StocktakeListEntry[]> {
  let q = supabase
    .from('stocktakes')
    .select(
      `
      id,
      warehouse_id,
      status,
      note,
      created_by,
      created_at,
      completed_at,
      updated_at,
      warehouse:warehouses!stocktakes_warehouse_id_fkey(name),
      operator:users!stocktakes_created_by_fkey(name)
    `,
    )
    .order('updated_at', { ascending: false })

  if (filters.warehouseId) q = q.eq('warehouse_id', filters.warehouseId)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.rangeStart) q = q.gte('created_at', filters.rangeStart.toISOString())
  if (filters.rangeEnd) q = q.lte('created_at', filters.rangeEnd.toISOString())

  const { data, error } = await q
  if (error) throw error

  type Row = {
    id: string
    warehouse_id: string
    status: StocktakeStatus
    note: string | null
    created_by: string | null
    created_at: string
    completed_at: string | null
    updated_at: string
    warehouse?: { name: string } | null
    operator?: { name: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    warehouseId: r.warehouse_id,
    warehouseName: r.warehouse?.name ?? null,
    status: r.status,
    note: r.note,
    createdByName: r.operator?.name ?? null,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    lastEditedAt: r.updated_at,
  }))
}

export type StocktakeDetail = {
  id: string
  warehouseId: string
  warehouseName: string | null
  status: StocktakeStatus
  note: string | null
  createdAt: string
  completedAt: string | null
  items: StocktakeItemDetail[]
}

export type StocktakeItemDetail = {
  id: string
  productId: string
  productName: string
  categoryId: string | null
  categoryName: string | null
  /** From `categories.sort_order`, or 999999 when uncategorized (same as `mapProductRow`). */
  categorySortOrder: number
  /** From `products.sort_order`. */
  productSortOrder: number
  systemStock: number
  actualStock: number | null
  difference: number | null
  reason: string | null
}

export async function getStocktakeDetailAdmin(id: string): Promise<StocktakeDetail | null> {
  const { data: st, error: e1 } = await supabase
    .from('stocktakes')
    .select(
      `
      id,
      warehouse_id,
      status,
      note,
      created_at,
      completed_at,
      warehouse:warehouses!stocktakes_warehouse_id_fkey(name)
    `,
    )
    .eq('id', id)
    .maybeSingle()
  if (e1) throw e1
  if (!st) return null

  const row = st as unknown as {
    id: string
    warehouse_id: string
    status: StocktakeStatus
    note: string | null
    created_at: string
    completed_at: string | null
    warehouse?: { name: string } | null
  }

  const { data: items, error: e2 } = await supabase
    .from('stocktake_items')
    .select(
      `
      id,
      product_id,
      system_stock,
      actual_stock,
      difference,
      reason,
      product:products!stocktake_items_product_id_fkey(
        name,
        sort_order,
        category_id,
        categories ( name, sort_order )
      )
    `,
    )
    .eq('stocktake_id', id)
  if (e2) throw e2

  type ItRow = {
    id: string
    product_id: string
    system_stock: number
    actual_stock: number | null
    difference: number | null
    reason: string | null
    product?: {
      name: string
      sort_order?: number | null
      category_id?: string | null
      categories?: { name: string; sort_order?: number | null } | null
    } | null
  }

  const mapped = ((items ?? []) as unknown as ItRow[])
    .map((it) => {
      const pr = it.product
      const cat = pr?.categories
      const catSo = cat?.sort_order
      const categorySortOrder =
        catSo !== undefined && catSo !== null ? Math.trunc(Number(catSo) || 0) : 999999
      return {
        id: it.id,
        productId: it.product_id,
        productName: pr?.name ?? '',
        categoryId: pr?.category_id ?? null,
        categoryName: cat?.name ?? null,
        categorySortOrder,
        productSortOrder: Math.trunc(Number(pr?.sort_order) || 0),
        systemStock: it.system_stock,
        actualStock: it.actual_stock,
        difference: it.difference,
        reason: it.reason,
      }
    })
    .sort((a, b) =>
      compareCatalogOrder(
        {
          categorySortOrder: a.categorySortOrder,
          sortOrder: a.productSortOrder,
          name: a.productName,
        },
        {
          categorySortOrder: b.categorySortOrder,
          sortOrder: b.productSortOrder,
          name: b.productName,
        },
      ),
    )

  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse?.name ?? null,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    items: mapped,
  }
}

export async function createStocktakeAdmin(input: {
  warehouseId: string
  note?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_stocktake', {
    p_warehouse_id: input.warehouseId,
    p_note: input.note?.trim() ? input.note.trim() : null,
  })
  if (error) throw error
  return data as string
}

export async function deleteStocktakeDraftAdmin(id: string): Promise<void> {
  const { error: e1 } = await supabase.from('stocktakes').delete().eq('id', id).eq('status', 'draft')
  if (e1) throw e1
}

export type CompleteStocktakeResult = {
  adjusted_lines: number
  increase_qty: number
  decrease_qty: number
}

function stocktakeItemsRpcPayload(
  items: { itemId: string; actualStock: number | null; reason: string | null }[],
) {
  return items.map((r) => ({
    item_id: r.itemId,
    actual_stock: r.actualStock,
    reason: r.reason?.trim() ? r.reason.trim() : null,
  }))
}

export async function completeStocktakeAdmin(
  stocktakeId: string,
  items: { itemId: string; actualStock: number | null; reason: string | null }[],
): Promise<CompleteStocktakeResult> {
  const { data, error } = await supabase.rpc('complete_stocktake', {
    p_stocktake_id: stocktakeId,
    p_items: stocktakeItemsRpcPayload(items),
  })
  if (error) throw error
  const j = data as CompleteStocktakeResult
  return {
    adjusted_lines: Number(j.adjusted_lines ?? 0),
    increase_qty: Number(j.increase_qty ?? 0),
    decrease_qty: Number(j.decrease_qty ?? 0),
  }
}

export async function saveStocktakeProgressAdmin(
  stocktakeId: string,
  items: { itemId: string; actualStock: number | null; reason: string | null }[],
): Promise<void> {
  const { error } = await supabase.rpc('save_stocktake_progress', {
    p_stocktake_id: stocktakeId,
    p_items: stocktakeItemsRpcPayload(items),
  })
  if (error) throw error
}
