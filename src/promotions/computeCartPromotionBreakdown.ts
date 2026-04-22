import { cartLineInputsFromPos } from './posAdapter'
import { evaluatePromotionRule } from './registry'
import type { AutoDiscountAllocation } from './selectAutoPromotionStack'
import { selectAutoPromotionStack } from './selectAutoPromotionStack'
import type { PromotionContext, PromotionRule } from './types'
import {
  aggregateCartLines,
  linesByProductId,
  sumCartSubtotalCents,
} from './aggregate'
import type { CartLineInput } from './types'
import { filterManualPromotionIdsByGroups } from './filterManualPromotionIdsByGroups'
import type { CartLine, Promotion } from '../types/pos'

export type ManualPromotionDetail = {
  promotionId: string
  name: string
  discountCents: number
}

export type CartPromotionBreakdown = {
  subtotalCents: number
  autoDiscountCents: number
  autoFinalCents: number
  /** First winning rule id (compat); use `appliedAutoAllocations` for stacking. */
  appliedAutoRuleId: string | null
  appliedAutoAllocations: AutoDiscountAllocation[]
  manualDiscountCents: number
  manualDetails: ManualPromotionDetail[]
  /** Manual ids after promotion-group rules (exclusive / best_only / stackable). */
  effectiveManualPromotionIds: string[]
  /** Payable total before threshold gifts (auto + manual discounts applied). */
  finalBeforeGiftsCents: number
}

export function promotionContextFromPaidMerch(lines: readonly CartLine[]): PromotionContext {
  const inputs: CartLineInput[] = lines
    .filter((l) => !l.isGift && !l.isManualFree && !l.isBundleComponent)
    .map((l) => ({
      productId: l.product.id,
      quantity: l.quantity,
      unitPriceCents: l.product.price,
    }))
  const agg = aggregateCartLines(inputs)
  return {
    originalTotalCents: sumCartSubtotalCents(agg),
    lines: agg,
    linesByProductId: linesByProductId(agg),
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

/**
 * Auto promos: stacked per `promotion_groups` behavior; ungrouped AUTO promos all apply.
 * Manual promos stack after auto: FIXED_DISCOUNT, FIXED_PERCENT_DISCOUNT, and BUY_X_GET_Y add further discounts, capped so total ≥ 0.
 */
export function computeCartPromotionBreakdown(
  lines: readonly CartLine[],
  promotions: readonly Promotion[],
  manualPromotionIds: readonly string[],
): CartPromotionBreakdown {
  const cart = cartLineInputsFromPos(lines)
  const stack = selectAutoPromotionStack(cart, promotions)
  const autoDiscountCents = stack.allocations.reduce((s, a) => s + a.discountCents, 0)
  const autoFinalCents = stack.originalTotalCents - autoDiscountCents

  let running = autoFinalCents
  const manualDetails: ManualPromotionDetail[] = []
  let manualSum = 0

  const bogoCtx = promotionContextFromPaidMerch(lines)
  const appliedAutoRuleIds = stack.allocations.map((a) => a.ruleId)
  const effectiveManualIds = filterManualPromotionIdsByGroups(
    manualPromotionIds,
    promotions,
    bogoCtx,
    appliedAutoRuleIds,
  )

  for (const mid of effectiveManualIds) {
    const p = promotions.find((x) => x.id === mid)
    if (!p || !p.active || p.applyMode !== 'MANUAL') continue

    if (p.kind === 'FIXED_DISCOUNT') {
      const fixed = p.fixedDiscountCents ?? 0
      if (fixed < 1) continue
      const d = Math.min(fixed, running)
      if (d <= 0) continue
      manualSum += d
      running -= d
      manualDetails.push({ promotionId: p.id, name: p.name, discountCents: d })
      continue
    }

    if (p.kind === 'FIXED_PERCENT_DISCOUNT') {
      const pct = p.discountPercent ?? 0
      if (pct < 1 || pct > 100) continue
      const d = Math.min(Math.round((running * pct) / 100), running)
      if (d <= 0) continue
      manualSum += d
      running -= d
      manualDetails.push({ promotionId: p.id, name: p.name, discountCents: d })
      continue
    }

    if (p.kind === 'BUY_X_GET_Y') {
      if (manualBogoConflictsWithAuto(appliedAutoRuleIds, p, promotions)) {
        manualDetails.push({ promotionId: p.id, name: p.name, discountCents: 0 })
        continue
      }
      const rule = buyXGetYRuleFromPromotion(p)
      if (!rule) continue
      const raw = evaluatePromotionRule(rule, bogoCtx).discountCents
      const d = Math.min(raw, running)
      if (d <= 0) continue
      manualSum += d
      running -= d
      manualDetails.push({ promotionId: p.id, name: p.name, discountCents: d })
    }
  }

  return {
    subtotalCents: stack.originalTotalCents,
    autoDiscountCents,
    autoFinalCents,
    appliedAutoRuleId: stack.appliedAutoRuleId,
    appliedAutoAllocations: stack.allocations,
    manualDiscountCents: manualSum,
    manualDetails,
    effectiveManualPromotionIds: effectiveManualIds,
    finalBeforeGiftsCents: running,
  }
}

export function payableAmountBeforeGiftsCents(
  lines: readonly CartLine[],
  promotions: readonly Promotion[],
  manualPromotionIds: readonly string[],
): number {
  return computeCartPromotionBreakdown(lines, promotions, manualPromotionIds).finalBeforeGiftsCents
}
