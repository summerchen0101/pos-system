import { supabase } from '../supabase'
import type { PromotionGroupBehavior } from '../types/pos'
import { isPromotionGroupBehavior } from '../types/pos'

export type AdminPromotionGroup = {
  id: string
  name: string
  behavior: PromotionGroupBehavior
  note: string | null
  created_at: string
}

export type PromotionGroupInput = {
  name: string
  behavior: PromotionGroupBehavior
  note: string | null
}

function mapGroupRow(row: Record<string, unknown>): AdminPromotionGroup {
  const behaviorStr = String(row.behavior ?? '')
  if (!isPromotionGroupBehavior(behaviorStr)) {
    throw new Error(`Invalid promotion group behavior: ${behaviorStr}`)
  }
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    behavior: behaviorStr,
    note: row.note != null ? String(row.note) : null,
    created_at: String(row.created_at ?? ''),
  }
}

export async function listPromotionGroupsAdmin(): Promise<AdminPromotionGroup[]> {
  const { data, error } = await supabase
    .from('promotion_groups')
    .select('id, name, behavior, note, created_at')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((r) => mapGroupRow(r as Record<string, unknown>))
}

export async function createPromotionGroup(input: PromotionGroupInput): Promise<AdminPromotionGroup> {
  const { data, error } = await supabase
    .from('promotion_groups')
    .insert({
      name: input.name.trim(),
      behavior: input.behavior,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .select('id, name, behavior, note, created_at')
    .single()

  if (error) throw error
  return mapGroupRow(data as Record<string, unknown>)
}

export async function updatePromotionGroup(
  id: string,
  input: PromotionGroupInput,
): Promise<void> {
  const { error } = await supabase
    .from('promotion_groups')
    .update({
      name: input.name.trim(),
      behavior: input.behavior,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .eq('id', id)

  if (error) throw error
}

export async function countPromotionsInGroup(groupId: string): Promise<number> {
  const { count, error } = await supabase
    .from('promotions')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)

  if (error) throw error
  return count ?? 0
}

export async function deletePromotionGroup(id: string): Promise<void> {
  const { error } = await supabase.from('promotion_groups').delete().eq('id', id)
  if (error) throw error
}
