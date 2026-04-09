import { aggregateCartLines, linesByProductId, sumCartSubtotalCents } from './aggregate'
import { mapDbPromotionsToEngineRules } from './mapDbPromotionsToRules'
import { evaluatePromotionRule } from './registry'
import type { CartLineInput, PromotionContext, PromotionRule } from './types'
import type { Promotion, PromotionGroupBehavior } from '../types/pos'
import { behaviorForGroupId } from './promotionGroupUtils'

export type AutoDiscountAllocation = {
  ruleId: string
  discountCents: number
}

/** e.g. `uuid~bogo` / `uuid~p~pid` → `uuid` */
function promotionIdFromRuleId(ruleId: string): string {
  const i = ruleId.indexOf('~')
  return i === -1 ? ruleId : ruleId.slice(0, i)
}

function buildContext(cart: readonly CartLineInput[]): PromotionContext | null {
  const lines = aggregateCartLines(cart)
  const originalTotalCents = sumCartSubtotalCents(lines)
  if (lines.length === 0) return null
  return {
    originalTotalCents,
    lines,
    linesByProductId: linesByProductId(lines),
  }
}

function bestPerPromotionFromRules(
  rules: readonly PromotionRule[],
  ctx: PromotionContext,
): Map<string, { discountCents: number; ruleId: string }> {
  const best = new Map<string, { discountCents: number; ruleId: string }>()
  for (const rule of rules) {
    const ev = evaluatePromotionRule(rule, ctx)
    const pid = promotionIdFromRuleId(rule.id)
    const cur = best.get(pid)
    if (!cur || ev.discountCents > cur.discountCents) {
      best.set(pid, { discountCents: ev.discountCents, ruleId: ev.appliedRuleId })
    }
  }
  return best
}

/**
 * Eligible AUTO promos with positive isolated discount, in `promotions` array order.
 */
function orderedEligibleAutoPromotionIds(
  promotions: readonly Promotion[],
  bestByPromo: Map<string, { discountCents: number; ruleId: string }>,
): string[] {
  const out: string[] = []
  for (const p of promotions) {
    if (!p.active || p.applyMode !== 'AUTO') continue
    const b = bestByPromo.get(p.id)
    if (b && b.discountCents > 0) out.push(p.id)
  }
  return out
}

function selectFromBucket(
  bucket: string[],
  behavior: PromotionGroupBehavior,
  bestByPromo: Map<string, { discountCents: number; ruleId: string }>,
): string[] {
  if (bucket.length === 0) return []
  switch (behavior) {
    case 'exclusive':
      return [bucket[0]!]
    case 'stackable':
      return [...bucket]
    case 'best_only': {
      let bestId = bucket[0]!
      let bestD = bestByPromo.get(bestId)!.discountCents
      for (let i = 1; i < bucket.length; i++) {
        const pid = bucket[i]!
        const d = bestByPromo.get(pid)!.discountCents
        if (d > bestD) {
          bestD = d
          bestId = pid
        }
      }
      return [bestId]
    }
    default: {
      const _b: never = behavior
      return _b
    }
  }
}

/**
 * After group rules, apply selected promos in order: all ungrouped (list order),
 * then each group's winners (group order = first appearance in `promotions`).
 * Discounts are capped sequentially so total never exceeds subtotal.
 */
export function selectAutoPromotionStack(
  cart: readonly CartLineInput[],
  promotions: readonly Promotion[],
): {
  originalTotalCents: number
  allocations: AutoDiscountAllocation[]
  appliedAutoRuleId: string | null
} {
  const autoRules = mapDbPromotionsToEngineRules(promotions)
  const ctx = buildContext(cart)

  if (!ctx || autoRules.length === 0) {
    const lines = aggregateCartLines(cart)
    const originalTotalCents = sumCartSubtotalCents(lines)
    return { originalTotalCents, allocations: [], appliedAutoRuleId: null }
  }

  const bestByPromo = bestPerPromotionFromRules(autoRules, ctx)
  const orderedEligible = orderedEligibleAutoPromotionIds(promotions, bestByPromo)

  const ungrouped: string[] = []
  const groupBuckets = new Map<string, string[]>()

  for (const pid of orderedEligible) {
    const p = promotions.find((x) => x.id === pid)
    const gid = p?.groupId ?? p?.group?.id ?? null
    if (!gid) {
      ungrouped.push(pid)
      continue
    }
    const arr = groupBuckets.get(gid) ?? []
    arr.push(pid)
    groupBuckets.set(gid, arr)
  }

  const groupIdsOrdered: string[] = []
  for (const p of promotions) {
    const gid = p.groupId ?? p.group?.id
    if (!gid) continue
    if (!groupBuckets.has(gid)) continue
    if (!groupIdsOrdered.includes(gid)) groupIdsOrdered.push(gid)
  }

  const selectedIds: string[] = [...ungrouped]

  for (const gid of groupIdsOrdered) {
    const bucket = groupBuckets.get(gid)
    if (!bucket?.length) continue
    const behavior = behaviorForGroupId(gid, promotions)
    selectedIds.push(...selectFromBucket(bucket, behavior, bestByPromo))
  }

  let running = ctx.originalTotalCents
  const allocations: AutoDiscountAllocation[] = []

  for (const pid of selectedIds) {
    const b = bestByPromo.get(pid)
    if (!b) continue
    const d = Math.min(b.discountCents, running)
    if (d <= 0) continue
    allocations.push({ ruleId: b.ruleId, discountCents: d })
    running -= d
  }

  const totalDiscount = allocations.reduce((s, a) => s + a.discountCents, 0)
  const appliedAutoRuleId =
    totalDiscount > 0 ? allocations[0]?.ruleId ?? null : null

  return {
    originalTotalCents: ctx.originalTotalCents,
    allocations,
    appliedAutoRuleId,
  }
}
