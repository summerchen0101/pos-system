import { supabase } from '../supabase'
export type DashboardTopProduct = {
  productName: string
  quantity: number
  revenueCents: number
}

export type DashboardSalesByBooth = {
  boothId: string
  boothName: string
  orderCount: number
  salesCents: number
}

export type DashboardStats = {
  totalSalesCents: number
  orderCount: number
  topProducts: DashboardTopProduct[]
  salesByBooth: DashboardSalesByBooth[]
}

export type DashboardFilters = {
  rangeStart: Date
  rangeEnd: Date
  boothId?: string | null
}

type OrderAggRow = {
  id: string
  final_amount: number
  booth_id: string
  booths: { name: string } | { name: string }[] | null
}

type OrderItemAggRow = {
  product_name: string
  quantity: number
  line_total_cents: number
  order_id: string
}

function boothLabel(booths: OrderAggRow['booths'], boothId: string): string {
  if (booths == null) return boothId
  const b = Array.isArray(booths) ? booths[0] : booths
  return b?.name?.trim() || boothId
}

/** Aggregates for admin dashboard (client-side rollups from Supabase rows). */
export async function fetchDashboardStats(filters: DashboardFilters): Promise<DashboardStats> {
  const startIso = filters.rangeStart.toISOString()
  const endIso = filters.rangeEnd.toISOString()

  let boothQ = supabase.from('booths').select('id, name').order('name')
  if (filters.boothId) {
    boothQ = boothQ.eq('id', filters.boothId)
  }

  let orderQ = supabase
    .from('orders')
    .select('id, final_amount, booth_id, booths ( name )')
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (filters.boothId) {
    orderQ = orderQ.eq('booth_id', filters.boothId)
  }

  const [
    { data: boothRows, error: boothErr },
    { data: orderRows, error: orderErr },
  ] = await Promise.all([boothQ, orderQ])
  if (boothErr) throw boothErr
  if (orderErr) throw orderErr

  const orders = (orderRows ?? []) as OrderAggRow[]
  const orderIds = orders.map((o) => o.id)

  const totalSalesCents = orders.reduce((s, o) => s + o.final_amount, 0)
  const orderCount = orders.length

  const byBooth = new Map<string, { name: string; salesCents: number; orderCount: number }>()
  for (const o of orders) {
    const name = boothLabel(o.booths, o.booth_id)
    const cur = byBooth.get(o.booth_id) ?? { name, salesCents: 0, orderCount: 0 }
    cur.salesCents += o.final_amount
    cur.orderCount += 1
    cur.name = name
    byBooth.set(o.booth_id, cur)
  }

  const salesByBooth: DashboardSalesByBooth[] = (boothRows ?? []).map(
    (row: { id: string; name: string }) => {
      const v = byBooth.get(row.id)
      return {
        boothId: row.id,
        boothName: row.name,
        orderCount: v?.orderCount ?? 0,
        salesCents: v?.salesCents ?? 0,
      }
    },
  )

  let topProducts: DashboardTopProduct[] = []
  if (orderIds.length > 0) {
    const chunkSize = 200
    const chunks: string[][] = []
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      chunks.push(orderIds.slice(i, i + chunkSize))
    }

    const byProduct = new Map<string, { quantity: number; revenueCents: number }>()
    for (const chunk of chunks) {
      const { data: lines, error: lineErr } = await supabase
        .from('order_items')
        .select('product_name, quantity, line_total_cents, order_id')
        .in('order_id', chunk)
      if (lineErr) throw lineErr
      for (const raw of (lines ?? []) as OrderItemAggRow[]) {
        const name = raw.product_name?.trim() || '—'
        const cur = byProduct.get(name) ?? { quantity: 0, revenueCents: 0 }
        cur.quantity += raw.quantity
        cur.revenueCents += raw.line_total_cents
        byProduct.set(name, cur)
      }
    }

    topProducts = [...byProduct.entries()]
      .map(([productName, v]) => ({
        productName,
        quantity: v.quantity,
        revenueCents: v.revenueCents,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 10)
  }

  return {
    totalSalesCents,
    orderCount,
    topProducts,
    salesByBooth,
  }
}
