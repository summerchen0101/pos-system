import type { Promotion, PromotionGroupBehavior } from '../types/pos'
import { evaluatePromotionRule } from './registry'
import { behaviorForGroupId } from './promotionGroupUtils'
import type { PromotionContext, PromotionRule } from './types'

function buyXGetYRuleFromPromotion(p: Promotion): PromotionRule | null {
  const ids = p.productIds
  if (ids.length === 0) return null
  const x = p.buyQty ?? 0
  const y = p.freeQty ?? 0
  if (x <= 0 || y <= 0) return null
  return {
    id: `${p.id}~bogo~manual`,
    kind: 'buy_x_get_y_free',
    triggerProductId: ids[0]!,
    buyQuantity: x,
    freeQuantity: y,
    poolProductIds: [...ids],
    singleDealOnly: p.bogoSingleDealOnly,
  }
}

function manualBogoConflictsWithAuto(
  appliedAutoRuleIds: readonly string[],
  manualPromo: Promotion,
  promotions: readonly Promotion[],
): boolean {
  if (manualPromo.kind !== 'BUY_X_GET_Y') return false
  for (const appliedAutoRuleId of appliedAutoRuleIds) {
    const baseId = appliedAutoRuleId.includes('~')
      ? appliedAutoRuleId.split('~')[0]!
      : appliedAutoRuleId
    const autoP = promotions.find((x) => x.id === baseId)
    if (!autoP || autoP.kind !== 'BUY_X_GET_Y' || autoP.applyMode !== 'AUTO') continue
    const autoSet = new Set(autoP.productIds)
    if (manualPromo.productIds.some((pid) => autoSet.has(pid))) return true
  }
  return false
}

function manualPromoDiscountScore(
  p: Promotion,
  bogoCtx: PromotionContext,
  promotions: readonly Promotion[],
  appliedAutoRuleIds: readonly string[],
): number {
  if (p.kind === 'FIXED_DISCOUNT') return p.fixedDiscountCents ?? 0
  if (p.kind === 'FIXED_PERCENT_DISCOUNT') {
    const pct = p.discountPercent ?? 0
    if (pct < 1 || pct > 100) return 0
    return Math.round((bogoCtx.originalTotalCents * pct) / 100)
  }
  if (p.kind === 'BUY_X_GET_Y') {
    if (manualBogoConflictsWithAuto(appliedAutoRuleIds, p, promotions)) return 0
    const rule = buyXGetYRuleFromPromotion(p)
    if (!rule) return 0
    return evaluatePromotionRule(rule, bogoCtx).discountCents
  }
  return 0
}

function selectManualIdsFromBucket(
  bucket: string[],
  behavior: PromotionGroupBehavior,
  promotions: readonly Promotion[],
  bogoCtx: PromotionContext,
  appliedAutoRuleIds: readonly string[],
): string[] {
  if (bucket.length === 0) return []
  switch (behavior) {
    case 'exclusive':
      return [bucket[0]!]
    case 'stackable':
      return [...bucket]
    case 'best_only': {
      let bestId = bucket[0]!
      let bestS = manualPromoDiscountScore(
        promotions.find((x) => x.id === bestId)!,
        bogoCtx,
        promotions,
        appliedAutoRuleIds,
      )
      for (let i = 1; i < bucket.length; i++) {
        const id = bucket[i]!
        const s = manualPromoDiscountScore(
          promotions.find((x) => x.id === id)!,
          bogoCtx,
          promotions,
          appliedAutoRuleIds,
        )
        if (s > bestS) {
          bestS = s
          bestId = id
        }
      }
      return [bestId]
    }
    default: {
      const _e: never = behavior
      return _e
    }
  }
}

/**
 * Applies promotion-group rules to staff-picked manual promotion ids (order = selection order).
 * Exclusive: only the first picked promo per group. Stackable / best_only same as auto stack.
 */
export function filterManualPromotionIdsByGroups(
  manualPromotionIds: readonly string[],
  promotions: readonly Promotion[],
  bogoCtx: PromotionContext,
  appliedAutoRuleIds: readonly string[],
): string[] {
  const orderedIds = manualPromotionIds.filter((id) => {
    const p = promotions.find((x) => x.id === id)
    return p && p.active && p.applyMode === 'MANUAL'
  })

  const ungrouped: string[] = []
  const groupBuckets = new Map<string, string[]>()

  for (const id of orderedIds) {
    const p = promotions.find((x) => x.id === id)!
    const gid = p.groupId ?? p.group?.id ?? null
    if (!gid) {
      ungrouped.push(id)
      continue
    }
    const arr = groupBuckets.get(gid) ?? []
    arr.push(id)
    groupBuckets.set(gid, arr)
  }

  const groupIdsOrdered: string[] = []
  for (const id of orderedIds) {
    const p = promotions.find((x) => x.id === id)!
    const gid = p.groupId ?? p.group?.id
    if (!gid) continue
    if (!groupBuckets.has(gid)) continue
    if (!groupIdsOrdered.includes(gid)) groupIdsOrdered.push(gid)
  }

  const selected = new Set<string>([...ungrouped])

  for (const gid of groupIdsOrdered) {
    const bucket = groupBuckets.get(gid)
    if (!bucket?.length) continue
    const behavior = behaviorForGroupId(gid, promotions)
    for (const id of selectManualIdsFromBucket(
      bucket,
      behavior,
      promotions,
      bogoCtx,
      appliedAutoRuleIds,
    )) {
      selected.add(id)
    }
  }

  return manualPromotionIds.filter((id) => selected.has(id))
}

