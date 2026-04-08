import { supabase } from '../supabase'
import type { BuyerAgeGroup, BuyerGender, BuyerMotivation } from '../types/order'

type OrdersBuyerRow = {
  id: string
  created_at: string
  final_amount: number
  booth_id: string
  buyer_gender: BuyerGender | null
  buyer_age_group: BuyerAgeGroup | null
  buyer_motivation: BuyerMotivation | null
  booths: { name: string } | { name: string }[] | null
}

export type BuyerProfileAnalyticsFilters = {
  rangeStart: Date
  rangeEnd: Date
  boothId?: string | null
}

export type BuyerProfileOrderRow = {
  id: string
  createdAt: string
  boothId: string
  boothName: string
  finalAmountCents: number
  buyerGender: BuyerGender | null
  buyerAgeGroup: BuyerAgeGroup | null
  buyerMotivation: BuyerMotivation | null
}

export async function fetchBuyerProfileOrders(
  filters: BuyerProfileAnalyticsFilters,
): Promise<BuyerProfileOrderRow[]> {
  let q = supabase
    .from('orders')
    .select(
      'id, created_at, final_amount, booth_id, buyer_gender, buyer_age_group, buyer_motivation, booths ( name )',
    )
    .gte('created_at', filters.rangeStart.toISOString())
    .lte('created_at', filters.rangeEnd.toISOString())
    .order('created_at', { ascending: false })

  if (filters.boothId) q = q.eq('booth_id', filters.boothId)

  const { data, error } = await q
  if (error) throw error

  return ((data ?? []) as OrdersBuyerRow[]).map((r) => {
    const boothRaw = Array.isArray(r.booths) ? r.booths[0] : r.booths
    return {
      id: r.id,
      createdAt: r.created_at,
      boothId: r.booth_id,
      boothName: boothRaw?.name?.trim() || r.booth_id,
      finalAmountCents: r.final_amount,
      buyerGender: r.buyer_gender ?? null,
      buyerAgeGroup: r.buyer_age_group ?? null,
      buyerMotivation: r.buyer_motivation ?? null,
    }
  })
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function buildBuyerProfileCsv(
  rows: BuyerProfileOrderRow[],
  mapLabel: {
    gender: (v: BuyerGender | null) => string
    age: (v: BuyerAgeGroup | null) => string
    motivation: (v: BuyerMotivation | null) => string
  },
): string {
  const header = ['訂單時間', '攤位', '性別', '年齡層', '購買動機', '訂單金額']
  const lines = rows.map((r) =>
    [
      r.createdAt,
      r.boothName,
      mapLabel.gender(r.buyerGender),
      mapLabel.age(r.buyerAgeGroup),
      mapLabel.motivation(r.buyerMotivation),
      String(r.finalAmountCents),
    ]
      .map(csvEscape)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}
