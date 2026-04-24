import { supabase } from '../supabase'

export type PosBoothListEntry = {
  id: string
  name: string
  location: string | null
}

/** Single booth for POS entry gate (includes `pin` when set). */
export type PosBoothEntry = {
  id: string
  name: string
  location: string | null
  /** Booth-linked warehouse for inventory / stocktake; null if not configured. */
  warehouseId: string | null
  /** Normalized 4–6 digit PIN, or null if none / invalid in DB. */
  pin: string | null
}

/** Public booth list for POS (anon RLS). */
export async function listBoothsForPos(): Promise<PosBoothListEntry[]> {
  const { data, error } = await supabase
    .from('booths')
    .select('id, name, location')
    .order('name')
  if (error) throw error
  return (data ?? []) as PosBoothListEntry[]
}

/** Fetch one booth including PIN for entry verification (anon RLS). */
export async function fetchBoothPosEntry(boothId: string): Promise<PosBoothEntry | null> {
  const { data, error } = await supabase
    .from('booths')
    .select('id, name, location, pin, warehouse_id')
    .eq('id', boothId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const raw = (data.pin as string | null | undefined)?.trim() ?? ''
  const pin = /^[0-9]{4,6}$/.test(raw) ? raw : null
  let warehouseId: string | null = (data.warehouse_id as string | null) ?? null
  if (!warehouseId) {
    const { data: w, error: we } = await supabase
      .from('warehouses')
      .select('id')
      .eq('booth_id', boothId)
      .limit(1)
      .maybeSingle()
    if (!we && w) warehouseId = w.id as string
  }
  return {
    id: data.id as string,
    name: data.name as string,
    location: (data.location as string | null) ?? null,
    warehouseId,
    pin,
  }
}
