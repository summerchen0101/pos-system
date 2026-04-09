import { supabase } from '../supabase'
import type { Promotion, PromotionGroupInfo } from '../types/pos'
import { isPromotionGroupBehavior } from '../types/pos'

/** All groups for filling `Promotion.group` when the list embed is missing. */
export async function loadPromotionGroupsMap(): Promise<Map<string, PromotionGroupInfo>> {
  const { data, error } = await supabase
    .from('promotion_groups')
    .select('id, name, behavior')

  if (error) throw error
  const m = new Map<string, PromotionGroupInfo>()
  for (const r of data ?? []) {
    const id = r.id as string
    const behaviorStr = String(r.behavior ?? '')
    if (!id || !isPromotionGroupBehavior(behaviorStr)) continue
    m.set(id, {
      id,
      name: String(r.name ?? ''),
      behavior: behaviorStr,
    })
  }
  return m
}

export function enrichPromotionWithGroupFallback(
  p: Promotion,
  groupsById: ReadonlyMap<string, PromotionGroupInfo>,
): Promotion {
  if (!p.groupId || p.group != null) return p
  const g = groupsById.get(p.groupId)
  return g ? { ...p, group: g } : p
}
