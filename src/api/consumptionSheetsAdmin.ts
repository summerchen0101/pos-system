import dayjs from 'dayjs'
import { compareCatalogOrder } from './productMapper'
import { supabase } from '../supabase'
import type { ConsumptionSheetKind } from '../types/supabase'

export type ConsumptionSheetStatus = 'draft' | 'completed'

export type ConsumptionKind = ConsumptionSheetKind

export const CONSUMPTION_KINDS: ConsumptionKind[] = [
  'tasting',
  'loss',
  'complimentary',
  'pr',
  'other',
]

function mapListItemsToKindAndSummary(
  rawItems:
    | {
        id: string
        quantity: number
        kind: string
        product?: { name: string } | null
      }[]
    | null
    | undefined,
): { kind: ConsumptionKind | null; itemsSummary: string } {
  const items = rawItems ?? []
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id))
  const positive = sorted.filter((i) => Math.trunc(Number(i.quantity) || 0) > 0)
  const firstKind = positive[0]?.kind ?? sorted[0]?.kind
  const kind: ConsumptionKind | null =
    firstKind && CONSUMPTION_KINDS.includes(firstKind as ConsumptionKind)
      ? (firstKind as ConsumptionKind)
      : null
  const parts = positive.map((i) => {
    const name = (i.product?.name ?? '').trim() || '—'
    const q = Math.trunc(Number(i.quantity) || 0)
    return `${name}x${q}`
  })
  return { kind, itemsSummary: parts.join(', ') }
}

export type ConsumptionSheetListEntry = {
  id: string
  warehouseId: string
  warehouseName: string | null
  status: ConsumptionSheetStatus
  note: string | null
  consumptionDate: string
  createdByName: string | null
  createdAt: string
  completedAt: string | null
  lastEditedAt: string
  /** Primary line kind for list display (first line with quantity > 0). */
  kind: ConsumptionKind | null
  /** e.g. `蘋果x1, 餅乾x2` */
  itemsSummary: string
}

export async function listConsumptionSheetsAdmin(filters: {
  warehouseId?: string | null
  status?: ConsumptionSheetStatus | null
  rangeStart?: Date | null
  rangeEnd?: Date | null
}): Promise<ConsumptionSheetListEntry[]> {
  let q = supabase
    .from('consumption_sheets')
    .select(
      `
      id,
      warehouse_id,
      status,
      note,
      consumption_date,
      created_by,
      created_at,
      completed_at,
      updated_at,
      warehouse:warehouses(name),
      operator:users(name),
      consumption_sheet_items (
        id,
        quantity,
        kind,
        product:products ( name )
      )
    `,
    )
    .order('updated_at', { ascending: false })

  if (filters.warehouseId) q = q.eq('warehouse_id', filters.warehouseId)
  const statusFilter =
    filters.status === undefined ? ('completed' as const) : filters.status
  if (statusFilter) q = q.eq('status', statusFilter)
  if (filters.rangeStart) {
    q = q.gte('created_at', dayjs(filters.rangeStart).startOf('day').toISOString())
  }
  if (filters.rangeEnd) {
    q = q.lte('created_at', dayjs(filters.rangeEnd).endOf('day').toISOString())
  }

  const { data, error } = await q
  if (error) throw error

  type Row = {
    id: string
    warehouse_id: string
    status: ConsumptionSheetStatus
    note: string | null
    consumption_date: string
    created_by: string | null
    created_at: string
    completed_at: string | null
    updated_at: string
    warehouse?: { name: string } | null
    operator?: { name: string } | null
    consumption_sheet_items?: {
      id: string
      quantity: number
      kind: string
      product?: { name: string } | null
    }[] | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const { kind, itemsSummary } = mapListItemsToKindAndSummary(r.consumption_sheet_items)
    return {
      id: r.id,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse?.name ?? null,
      status: r.status,
      note: r.note,
      consumptionDate: r.consumption_date,
      createdByName: r.operator?.name ?? null,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      lastEditedAt: r.updated_at,
      kind,
      itemsSummary,
    }
  })
}

export type ConsumptionSheetLineDetail = {
  id: string
  productId: string
  productName: string
  categoryId: string | null
  categoryName: string | null
  categorySortOrder: number
  productSortOrder: number
  kind: ConsumptionKind
  quantity: number
  note: string | null
}

export type ConsumptionSheetDetail = {
  id: string
  warehouseId: string
  warehouseName: string | null
  status: ConsumptionSheetStatus
  note: string | null
  consumptionDate: string
  createdAt: string
  completedAt: string | null
  lines: ConsumptionSheetLineDetail[]
}

export async function getConsumptionSheetDetailAdmin(id: string): Promise<ConsumptionSheetDetail | null> {
  const { data: row, error: e1 } = await supabase
    .from('consumption_sheets')
    .select(
      `
      id,
      warehouse_id,
      status,
      note,
      consumption_date,
      created_at,
      completed_at,
      warehouse:warehouses(name)
    `,
    )
    .eq('id', id)
    .maybeSingle()
  if (e1) throw e1
  if (!row) return null

  const hdr = row as unknown as {
    id: string
    warehouse_id: string
    status: ConsumptionSheetStatus
    note: string | null
    consumption_date: string
    created_at: string
    completed_at: string | null
    warehouse?: { name: string } | null
  }

  const { data: items, error: e2 } = await supabase
    .from('consumption_sheet_items')
    .select(
      `
      id,
      product_id,
      kind,
      quantity,
      note,
      product:products(
        name,
        sort_order,
        category_id,
        categories ( name, sort_order )
      )
    `,
    )
    .eq('consumption_sheet_id', id)
  if (e2) throw e2

  type ItRow = {
    id: string
    product_id: string
    kind: ConsumptionKind
    quantity: number
    note: string | null
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
        kind: it.kind,
        quantity: it.quantity,
        note: it.note,
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
    id: hdr.id,
    warehouseId: hdr.warehouse_id,
    warehouseName: hdr.warehouse?.name ?? null,
    status: hdr.status,
    note: hdr.note,
    consumptionDate: hdr.consumption_date,
    createdAt: hdr.created_at,
    completedAt: hdr.completed_at,
    lines: mapped,
  }
}

export async function createConsumptionSheetAdmin(input: {
  warehouseId: string
  note?: string | null
  consumptionDate?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_consumption_sheet', {
    p_warehouse_id: input.warehouseId,
    p_note: input.note?.trim() ? input.note.trim() : null,
    p_consumption_date: input.consumptionDate?.trim() ? input.consumptionDate.trim() : null,
  })
  if (error) throw error
  return data as string
}

export type ConsumptionLinePayload = {
  productId: string
  kind: ConsumptionKind
  quantity: number
  note?: string | null
}

export async function saveConsumptionSheetLinesAdmin(
  sheetId: string,
  lines: ConsumptionLinePayload[],
): Promise<void> {
  const payload = lines.map((r) => ({
    product_id: r.productId,
    kind: r.kind,
    quantity: Math.max(0, Math.trunc(Number(r.quantity) || 0)),
    note: r.note?.trim() ? r.note.trim() : null,
  }))
  const { error } = await supabase.rpc('save_consumption_sheet_lines', {
    p_sheet_id: sheetId,
    p_lines: payload,
  })
  if (error) throw error
}

export type CompleteConsumptionSheetResult = {
  deducted_lines: number
  total_qty: number
}

export async function completeConsumptionSheetAdmin(sheetId: string): Promise<CompleteConsumptionSheetResult> {
  const { data, error } = await supabase.rpc('complete_consumption_sheet', {
    p_sheet_id: sheetId,
  })
  if (error) throw error
  const j = data as CompleteConsumptionSheetResult
  return {
    deducted_lines: Number(j.deducted_lines ?? 0),
    total_qty: Number(j.total_qty ?? 0),
  }
}

export async function deleteConsumptionDraftAdmin(id: string): Promise<void> {
  const { error } = await supabase.from('consumption_sheets').delete().eq('id', id).eq('status', 'draft')
  if (error) throw error
}

export type ConsumptionSubmitLinePayload = {
  productId: string
  quantity: number
  note?: string | null
}

export async function submitConsumptionSheetAdmin(input: {
  warehouseId: string
  kind: ConsumptionKind
  note?: string | null
  consumptionDate?: string | null
  lines: ConsumptionSubmitLinePayload[]
}): Promise<CompleteConsumptionSheetResult> {
  const p_lines = input.lines.map((r) => ({
    product_id: r.productId,
    quantity: Math.max(0, Math.trunc(Number(r.quantity) || 0)),
    note: r.note?.trim() ? r.note.trim() : null,
  }))
  const { data, error } = await supabase.rpc('submit_consumption_sheet', {
    p_warehouse_id: input.warehouseId,
    p_note: input.note?.trim() ? input.note.trim() : null,
    p_consumption_date: input.consumptionDate?.trim() ? input.consumptionDate.trim() : null,
    p_kind: input.kind,
    p_lines,
  })
  if (error) throw error
  const j = data as CompleteConsumptionSheetResult
  return {
    deducted_lines: Number(j.deducted_lines ?? 0),
    total_qty: Number(j.total_qty ?? 0),
  }
}

export async function deleteCompletedConsumptionSheetAdmin(sheetId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_completed_consumption_sheet', {
    p_sheet_id: sheetId,
  })
  if (error) throw error
}
