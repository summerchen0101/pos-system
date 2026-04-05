import { formatMoney } from '../../lib/money'
import type { CartTotals } from '../../store/cartStore'

type Props = {
  totals: CartTotals
  isEmpty: boolean
  appliedPromotionName: string | null
  hasPromotionRules: boolean
  promotionsFailed: boolean
}

export function OrderSummary({
  totals,
  isEmpty,
  appliedPromotionName,
  hasPromotionRules,
  promotionsFailed,
}: Props) {
  const hasDiscount = totals.discountCents > 0
  const pctOff =
    totals.subtotalCents > 0 && hasDiscount
      ? Math.round((totals.discountCents / totals.subtotalCents) * 100)
      : null

  let discountCaption: string
  if (isEmpty) {
    discountCaption = '—'
  } else if (promotionsFailed) {
    discountCaption = 'Promotions unavailable — list prices only'
  } else if (hasDiscount && appliedPromotionName) {
    discountCaption = `Best offer: ${appliedPromotionName}${pctOff != null ? ` (−${pctOff}%)` : ''}`
  } else if (hasPromotionRules) {
    discountCaption = 'No qualifying promotion for this cart'
  } else {
    discountCaption = 'No active promotions'
  }

  return (
    <div className="pos-order-summary">
      <h3 className="pos-order-summary__title">Totals</h3>
      <dl className="pos-order-summary__rows">
        <div className="pos-order-summary__row">
          <dt>Subtotal</dt>
          <dd>{formatMoney(totals.subtotalCents)}</dd>
        </div>
        <div className="pos-order-summary__row pos-order-summary__row--discount">
          <dt>
            <span className="pos-order-summary__discount-label">Discount</span>
            <span className="pos-order-summary__discount-caption">{discountCaption}</span>
          </dt>
          <dd className={hasDiscount ? 'is-savings' : undefined}>
            {hasDiscount ? `−${formatMoney(totals.discountCents)}` : formatMoney(0)}
          </dd>
        </div>
        <div className="pos-order-summary__row pos-order-summary__row--final">
          <dt>Total due</dt>
          <dd>{formatMoney(totals.finalCents)}</dd>
        </div>
      </dl>
    </div>
  )
}
