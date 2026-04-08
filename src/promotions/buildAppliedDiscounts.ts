import { formatMoney } from '../lib/money'
import { zhtw } from '../locales/zhTW'
import type { CartLine, Promotion } from '../types/pos'
import type { CartPromotionBreakdown } from './computeCartPromotionBreakdown'
import { payableAmountBeforeGiftsCents } from './computeCartPromotionBreakdown'

const t = zhtw.pos

export type AppliedDiscount = {
  promotionId: string
  name: string
  description: string
  /** Subtotal discount from this line (minor units); gift-only rows use 0. */
  discountCents: number
  matchedTier?: {
    buy_quantity?: number
    get_quantity?: number
    nth?: number
    discount_type?: 'percent' | 'fixed'
    discount_value?: number
  } | null
  gifts?: { name: string; quantity: number }[]
}

/** e.g. `uuid~bogo` / `uuid~p~pid` / `uuid~t~tierRowId` → `uuid` */
function basePromotionIdFromRuleId(appliedRuleId: string): string {
  const i = appliedRuleId.indexOf('~')
  return i === -1 ? appliedRuleId : appliedRuleId.slice(0, i)
}

function findPromotionForRule(
  promotions: readonly Promotion[],
  appliedRuleId: string | null,
): Promotion | undefined {
  if (!appliedRuleId) return undefined
  const base = basePromotionIdFromRuleId(appliedRuleId)
  return promotions.find((p) => p.id === base || appliedRuleId.startsWith(`${p.id}~`))
}

function describeAutoPromotion(p: Promotion, appliedRuleId: string): string {
  switch (p.kind) {
    case 'BUY_X_GET_Y': {
      const x = p.buyQty ?? 0
      const y = p.freeQty ?? 0
      return t.appliedDiscountDescBogo(x, y)
    }
    case 'BULK_DISCOUNT': {
      const min = p.buyQty ?? 1
      const pct = p.discountPercent ?? 0
      return t.appliedDiscountDescBulk(min, pct)
    }
    case 'SINGLE_DISCOUNT': {
      const pct = p.discountPercent ?? 0
      return t.appliedDiscountDescSingle(pct)
    }
    case 'TIERED': {
      const m = appliedRuleId.match(/~t~(.+)$/)
      const tierId = m?.[1]
      const tier = tierId ? p.rules?.find((r) => r.id === tierId) : undefined
      if (tier) {
        if (tier.discountPercent != null && tier.discountPercent > 0) {
          return t.appliedDiscountDescTierPct(tier.minQty, tier.discountPercent)
        }
        if (tier.freeQty != null && tier.freeQty > 0) {
          return t.appliedDiscountDescTierFree(tier.minQty, tier.freeQty)
        }
      }
      return p.name
    }
    case 'TIERED_QUANTITY_DISCOUNT': {
      const m = appliedRuleId.match(/~qt~(.+)$/)
      const tierId = m?.[1]
      const tier = tierId ? p.quantityDiscountTiers?.find((r) => r.id === tierId) : undefined
      if (tier) {
        return t.appliedDiscountDescQtyTier(tier.minQty, tier.discountPercent)
      }
      return p.name
    }
    default:
      return p.name
  }
}

function describeManualPromotion(p: Promotion): string {
  if (p.kind === 'BUY_X_GET_Y') {
    const x = p.buyQty ?? 0
    const y = p.freeQty ?? 0
    return t.appliedDiscountDescBogo(x, y)
  }
  if (p.kind === 'FIXED_DISCOUNT') {
    const cents = p.fixedDiscountCents ?? 0
    return t.appliedDiscountDescFixed(formatMoney(cents))
  }
  return p.name
}

/**
 * Lines shown in the discount detail modal: auto + manual monetary discounts,
 * plus 滿額贈 (threshold) rows with gift breakdown.
 */
export function buildAppliedDiscounts(
  lines: readonly CartLine[],
  promotions: readonly Promotion[],
  manualPromotionIds: readonly string[],
  b: CartPromotionBreakdown,
): AppliedDiscount[] {
  const out: AppliedDiscount[] = []

  for (const alloc of b.appliedAutoAllocations) {
    if (alloc.discountCents <= 0) continue
    const appliedAutoRuleId = alloc.ruleId
    const p = findPromotionForRule(promotions, appliedAutoRuleId)
    const pid = p?.id ?? basePromotionIdFromRuleId(appliedAutoRuleId)
    const name = p?.name ?? t.appliedDiscountAutoFallback
    const description = p ? describeAutoPromotion(p, appliedAutoRuleId) : name
    let matchedTier: AppliedDiscount['matchedTier'] = null
    if (p?.kind === 'BUY_X_GET_Y') {
      matchedTier = {
        buy_quantity: p.buyQty ?? undefined,
        get_quantity: p.freeQty ?? undefined,
      }
    } else if (p?.kind === 'TIERED') {
      const m = appliedAutoRuleId.match(/~t~(.+)$/)
      const tierId = m?.[1]
      const tier = tierId ? p.rules?.find((r) => r.id === tierId) : undefined
      if (tier?.freeQty != null && tier.freeQty > 0) {
        matchedTier = {
          buy_quantity: tier.minQty,
          get_quantity: tier.freeQty,
        }
      }
    }
    out.push({
      promotionId: pid,
      name,
      description,
      discountCents: alloc.discountCents,
      matchedTier,
    })
  }

  for (const d of b.manualDetails) {
    if (d.discountCents <= 0) continue
    const p = promotions.find((x) => x.id === d.promotionId)
    out.push({
      promotionId: d.promotionId,
      name: t.appliedDiscountManualName(d.name),
      description: p ? describeManualPromotion(p) : d.name,
      discountCents: d.discountCents,
    })
  }

  const basisCents = payableAmountBeforeGiftsCents(lines, promotions, manualPromotionIds)
  const giftLines = lines.filter((l) => l.isGift && l.promotionId)

  for (const pr of promotions) {
    if (!pr.active || pr.kind !== 'GIFT_WITH_THRESHOLD' || !pr.gift) continue
    const threshold = pr.thresholdAmountCents ?? 0
    if (threshold < 1 || basisCents < threshold) continue

    const related = giftLines.filter((l) => l.promotionId === pr.id)
    const gifts =
      related.length > 0
        ? aggregateGiftNames(related)
        : pr.gift
          ? [{ name: pr.gift.displayName, quantity: 1 }]
          : undefined

    out.push({
      promotionId: pr.id,
      name: pr.name,
      description: t.thresholdGiftLine(formatMoney(threshold), pr.gift.displayName),
      discountCents: 0,
      gifts,
    })
  }

  return out
}

function aggregateGiftNames(lines: readonly CartLine[]): { name: string; quantity: number }[] {
  const map = new Map<string, number>()
  for (const l of lines) {
    const n = l.product.name?.trim() || l.product.sku
    map.set(n, (map.get(n) ?? 0) + l.quantity)
  }
  return [...map.entries()].map(([name, quantity]) => ({ name, quantity }))
}
