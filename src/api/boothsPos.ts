import { supabase } from '../supabase'

export type PosBoothListEntry = {
  id: string
  name: string
  location: string | null
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
