import { evaluatePromotionEngine } from './engine'
import { mapDbPromotionsToEngineRules } from './mapDbPromotionsToRules'
import { cartLineInputsFromPos } from './posAdapter'
import { evaluatePromotionRule } from './registry'
import type { PromotionContext, PromotionRule } from './types'
import {
  aggregateCartLines,
  linesByProductId,
  sumCartSubtotalCents,
} from './aggregate'
import type { CartLineInput } from './types'
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
  appliedAutoRuleId: string | null
  manualDiscountCents: number
  manualDetails: ManualPromotionDetail[]
  /** Payable total before threshold gifts (auto + manual discounts applied). */
  finalBeforeGiftsCents: number
}

function promotionContextFromPaidMerch(lines: readonly CartLine[]): PromotionContext {
  const inputs: CartLineInput[] = lines
    .filter((l) => !l.isGift && !l.isManualFree)
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
  appliedAutoRuleId: string | null,
  manualPromo: Promotion,
  promotions: readonly Promotion[],
): boolean {
  if (!appliedAutoRuleId || manualPromo.kind !== 'BUY_X_GET_Y') return false
  const baseId = appliedAutoRuleId.includes('~') ? appliedAutoRuleId.split('~')[0]! : appliedAutoRuleId
  const autoP = promotions.find((x) => x.id === baseId)
  if (!autoP || autoP.kind !== 'BUY_X_GET_Y' || autoP.applyMode !== 'AUTO') return false
  const autoSet = new Set(autoP.productIds)
  return manualPromo.productIds.some((pid) => autoSet.has(pid))
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
  }
}

/**
 * Auto promos (apply_mode AUTO) run first (single best discount).
 * Manual promos stack: FIXED_DISCOUNT and BUY_X_GET_Y add further discounts, capped so total ≥ 0.
 * FREE_* kinds add $0 lines elsewhere — no discount rows here.
 */
export function computeCartPromotionBreakdown(
  lines: readonly CartLine[],
  promotions: readonly Promotion[],
  manualPromotionIds: readonly string[],
): CartPromotionBreakdown {
  const cart = cartLineInputsFromPos(lines)
  const autoRules = mapDbPromotionsToEngineRules(promotions)
  const engine = evaluatePromotionEngine(cart, autoRules)

  let running = engine.finalTotalCents
  const manualDetails: ManualPromotionDetail[] = []
  let manualSum = 0

  const bogoCtx = promotionContextFromPaidMerch(lines)

  for (const mid of manualPromotionIds) {
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

    if (p.kind === 'BUY_X_GET_Y') {
      if (manualBogoConflictsWithAuto(engine.appliedPromotionId, p, promotions)) {
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
    subtotalCents: engine.originalTotalCents,
    autoDiscountCents: engine.discountCents,
    autoFinalCents: engine.finalTotalCents,
    appliedAutoRuleId: engine.appliedPromotionId,
    manualDiscountCents: manualSum,
    manualDetails,
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
