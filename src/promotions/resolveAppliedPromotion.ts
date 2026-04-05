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
