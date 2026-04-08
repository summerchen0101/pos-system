import type { Promotion } from '../types/pos'

/** Engine rule ids are `promotionId` or `promotionId~p~productId` for per-SKU rules. */
export function resolveAppliedPromotionName(
  appliedRuleId: string | null,
  promotions: Promotion[],
): string | null {
  if (!appliedRuleId) return null
  for (const p of promotions) {
    if (appliedRuleId === p.id || appliedRuleId.startsWith(`${p.id}~`)) {
      return p.name
    }
  }
  return null
}

export function basePromotionIdFromAppliedRuleId(appliedRuleId: string | null): string | null {
  if (!appliedRuleId) return null
  const i = appliedRuleId.indexOf('~')
  return i === -1 ? appliedRuleId : appliedRuleId.slice(0, i)
}

export function resolveAppliedPromotionNamesFromAllocations(
  allocations: readonly { ruleId: string }[],
  promotions: Promotion[],
): string | null {
  if (allocations.length === 0) return null
  const names: string[] = []
  const seen = new Set<string>()
  for (const a of allocations) {
    const n = resolveAppliedPromotionName(a.ruleId, promotions)
    if (n && !seen.has(n)) {
      seen.add(n)
      names.push(n)
    }
  }
  return names.length ? names.join('、') : null
}
