import { InfoCircleOutlined, RightOutlined } from '@ant-design/icons'
import { useState } from 'react'
import type { ManualPromotionDetail } from '../../promotions/computeCartPromotionBreakdown'
import type { AppliedDiscount } from '../../promotions/buildAppliedDiscounts'
import { zhtw } from '../../locales/zhTW'
import { formatMoney } from '../../lib/money'
import type { CartTotals } from '../../store/cartStore'
import { DiscountDetailModal } from './DiscountDetailModal'

type Props = {
  totals: CartTotals
  isEmpty: boolean
  appliedPromotionName: string | null
  hasPromotionRules: boolean
  promotionsFailed: boolean
  thresholdGiftSummaries: string[]
  manualPromotionDetails: ManualPromotionDetail[]
  appliedDiscounts: AppliedDiscount[]
}

export function OrderSummary({
  totals,
  isEmpty,
  appliedPromotionName,
  hasPromotionRules,
  promotionsFailed,
  thresholdGiftSummaries,
  manualPromotionDetails,
  appliedDiscounts,
}: Props) {
  const [detailOpen, setDetailOpen] = useState(false)
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

  const canOpenDiscountDetail =
    !isEmpty && !promotionsFailed && appliedDiscounts.length > 0
  const showDiscountHint =
    canOpenDiscountDetail && (hasDiscount || appliedDiscounts.some((d) => (d.gifts?.length ?? 0) > 0))

  return (
    <div className="pos-order-summary">
      <h3 className="pos-order-summary__title">{zhtw.pos.totals}</h3>
      {thresholdGiftSummaries.length > 0 ? (
        <ul className="pos-order-summary__gifts" aria-label={zhtw.pos.thresholdGiftsAria}>
          {thresholdGiftSummaries.map((t) => (
            <li key={t} className="pos-order-summary__gift-line">
              {t}
            </li>
          ))}
        </ul>
      ) : null}
      {manualPromotionDetails.length > 0 ? (
        <ul className="pos-order-summary__manual" aria-label={zhtw.pos.manualPromoModalTitle}>
          {manualPromotionDetails.map((m) => (
            <li key={m.promotionId} className="pos-order-summary__manual-line">
              <span className="pos-order-summary__manual-name">
                {zhtw.pos.manualPromoBadge} · {m.name}
              </span>
              <span className="pos-order-summary__manual-discount">
                {m.discountCents > 0
                  ? `−${formatMoney(m.discountCents)}`
                  : zhtw.pos.manualPromoConflict}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="pos-order-summary__rows">
        <div className="pos-order-summary__row">
          <span className="pos-order-summary__label">{zhtw.pos.subtotal}</span>
          <span className="pos-order-summary__value">{formatMoney(totals.subtotalCents)}</span>
        </div>
        <div className="pos-order-summary__row pos-order-summary__row--discount">
          <div className="pos-order-summary__discount-wrap">
            <button
              type="button"
              className={`pos-order-summary__discount-hit${canOpenDiscountDetail ? ' is-clickable' : ''}`}
              disabled={!canOpenDiscountDetail}
              onClick={() => canOpenDiscountDetail && setDetailOpen(true)}
              aria-expanded={canOpenDiscountDetail ? detailOpen : undefined}
              aria-haspopup="dialog">
              <span className="pos-order-summary__discount-hit__left">
                <span className="pos-order-summary__discount-label">{zhtw.pos.discount}</span>
                {showDiscountHint ? (
                  <InfoCircleOutlined className="pos-order-summary__discount-info-icon" aria-hidden />
                ) : null}
                {showDiscountHint ? (
                  <RightOutlined className="pos-order-summary__discount-chevron" aria-hidden />
                ) : null}
              </span>
              <span
                className={
                  hasDiscount
                    ? 'pos-order-summary__discount-hit__amount is-savings'
                    : 'pos-order-summary__discount-hit__amount'
                }>
                {hasDiscount ? `−${formatMoney(totals.discountCents)}` : formatMoney(0)}
              </span>
            </button>
            {!canOpenDiscountDetail ? (
              <span className="pos-order-summary__discount-caption">{discountCaption}</span>
            ) : null}
          </div>
        </div>
        <div className="pos-order-summary__row pos-order-summary__row--final">
          <span className="pos-order-summary__label">{zhtw.pos.totalDue}</span>
          <span className="pos-order-summary__value">{formatMoney(totals.finalCents)}</span>
        </div>
      </div>
      <DiscountDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        items={appliedDiscounts}
        totalDiscountCents={totals.discountCents}
      />
    </div>
  )
}
