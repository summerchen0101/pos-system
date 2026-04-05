import type { TieredDiscountResult, TieredEligibleLine, TieredRuleLine } from './types'

type Scored = {
  tier: TieredRuleLine
  discountCents: number
}

function discountForFreeTier(
  totalQty: number,
  subtotalCents: number,
  minQty: number,
  freeQty: number,
): number {
  if (totalQty <= 0 || subtotalCents <= 0 || minQty < 1 || freeQty < 1) return 0
  const bundle = minQty + freeQty
  const paidQty = Math.ceil((totalQty * minQty) / bundle)
  return Math.max(0, Math.round(subtotalCents - (paidQty * subtotalCents) / totalQty))
}

function discountForPercentTier(subtotalCents: number, percent: number): number {
  if (subtotalCents <= 0 || percent <= 0) return 0
  return Math.round((subtotalCents * percent) / 100)
}

/**
 * Aggregates eligible cart lines, then picks the single tier rule that yields
 * the largest discount among rules with `totalQty >= min_qty`.
 *
 * - **free_qty**: repeating buy-`min_qty` get-`free_qty` on the combined
 *   eligible quantity, valued at average unit price (subtotal / qty).
 * - **discount_percent**: percent off eligible subtotal.
 *
 * Tie-break when discounts tie: higher `min_qty`, then higher `sort_order`, then `id`.
 */
export function computeBestTieredDiscount(
  eligibleLines: readonly TieredEligibleLine[],
  tiers: readonly TieredRuleLine[],
): TieredDiscountResult {
  const totalQty = eligibleLines.reduce((s, l) => s + l.quantity, 0)
  const subtotalCents = eligibleLines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0)

  if (totalQty <= 0 || subtotalCents <= 0 || tiers.length === 0) {
    return { discountCents: 0, appliedTierRuleId: null }
  }

  const scored: Scored[] = []

  for (const tier of tiers) {
    if (totalQty < tier.minQty) continue

    let discountCents = 0
    if (tier.freeQty != null && tier.freeQty >= 1) {
      discountCents = discountForFreeTier(totalQty, subtotalCents, tier.minQty, tier.freeQty)
    } else if (tier.discountPercent != null && tier.discountPercent >= 1) {
      discountCents = discountForPercentTier(subtotalCents, tier.discountPercent)
    }

    if (discountCents > 0) {
      scored.push({ tier, discountCents })
    }
  }

  if (scored.length === 0) {
    return { discountCents: 0, appliedTierRuleId: null }
  }

  scored.sort((a, b) => {
    if (b.discountCents !== a.discountCents) return b.discountCents - a.discountCents
    if (b.tier.minQty !== a.tier.minQty) return b.tier.minQty - a.tier.minQty
    if (b.tier.sortOrder !== a.tier.sortOrder) return b.tier.sortOrder - a.tier.sortOrder
    return a.tier.id.localeCompare(b.tier.id)
  })

  const best = scored[0]!
  return {
    discountCents: best.discountCents,
    appliedTierRuleId: best.tier.id,
  }
}
