import { zhtw } from '../../locales/zhTW'
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
    discountCaption = zhtw.pos.discountEmpty
  } else if (promotionsFailed) {
    discountCaption = zhtw.pos.discountPromoFail
  } else if (hasDiscount && appliedPromotionName) {
    discountCaption = zhtw.pos.discountBest(
      appliedPromotionName,
      pctOff != null ? String(pctOff) : null,
    )
  } else if (hasPromotionRules) {
    discountCaption = zhtw.pos.discountNoQualify
  } else {
    discountCaption = zhtw.pos.discountNone
  }

  return (
    <div className="pos-order-summary">
      <h3 className="pos-order-summary__title">{zhtw.pos.totals}</h3>
      <dl className="pos-order-summary__rows">
        <div className="pos-order-summary__row">
          <dt>{zhtw.pos.subtotal}</dt>
          <dd>{formatMoney(totals.subtotalCents)}</dd>
        </div>
        <div className="pos-order-summary__row pos-order-summary__row--discount">
          <dt>
            <span className="pos-order-summary__discount-label">{zhtw.pos.discount}</span>
            <span className="pos-order-summary__discount-caption">{discountCaption}</span>
          </dt>
          <dd className={hasDiscount ? 'is-savings' : undefined}>
            {hasDiscount ? `−${formatMoney(totals.discountCents)}` : formatMoney(0)}
          </dd>
        </div>
        <div className="pos-order-summary__row pos-order-summary__row--final">
          <dt>{zhtw.pos.totalDue}</dt>
          <dd>{formatMoney(totals.finalCents)}</dd>
        </div>
      </dl>
    </div>
  )
}
