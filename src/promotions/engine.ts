import {
  aggregateCartLines,
  linesByProductId,
  sumCartSubtotalCents,
} from './aggregate'
import { evaluatePromotionRule } from './registry'
import type {
  CartLineInput,
  PromotionEngineResult,
  PromotionEvaluation,
  PromotionRule,
} from './types'

/**
 * Picks the single promotion that yields the largest discount.
 * Rules do not stack; ties break by first eligible rule in `rules` order.
 */
export function evaluatePromotionEngine(
  cart: readonly CartLineInput[],
  rules: readonly PromotionRule[],
): PromotionEngineResult {
  const lines = aggregateCartLines(cart)
  const originalTotalCents = sumCartSubtotalCents(lines)

  if (lines.length === 0 || rules.length === 0) {
    return {
      originalTotalCents,
      discountCents: 0,
      finalTotalCents: originalTotalCents,
      appliedPromotionId: null,
    }
  }

  const ctx = {
    originalTotalCents,
    lines,
    linesByProductId: linesByProductId(lines),
  }

  let bestDiscount = 0
  let appliedPromotionId: string | null = null

  for (const rule of rules) {
    const discountCents = evaluatePromotionRule(rule, ctx)
    if (discountCents > bestDiscount) {
      bestDiscount = discountCents
      appliedPromotionId = rule.id
    }
  }

  if (bestDiscount <= 0) {
    appliedPromotionId = null
  }

  const finalTotalCents = Math.max(0, originalTotalCents - bestDiscount)

  return {
    originalTotalCents,
    discountCents: bestDiscount,
    finalTotalCents,
    appliedPromotionId,
  }
}

/** Per-rule discounts for debugging, receipts, or staff override UI. */
export function scorePromotions(
  cart: readonly CartLineInput[],
  rules: readonly PromotionRule[],
): PromotionEvaluation[] {
  const lines = aggregateCartLines(cart)
  const original = sumCartSubtotalCents(lines)
  if (lines.length === 0) return rules.map((r) => ({ promotionId: r.id, discountCents: 0 }))

  const ctx = {
    originalTotalCents: original,
    lines,
    linesByProductId: linesByProductId(lines),
  }

  return rules.map((rule) => ({
    promotionId: rule.id,
    discountCents: evaluatePromotionRule(rule, ctx),
  }))
}
