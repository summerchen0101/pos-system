import { formatMoney } from '../../lib/money'
import type { CartTotals } from '../../store/cartStore'
import type { Promotion } from '../../types/pos'

type Props = {
  totals: CartTotals
  discountPercent: number
  onDiscountChange: (percent: number) => void
  isEmpty: boolean
  promotions: Promotion[]
}

const PRESETS = [0, 5, 10, 15, 20]

export function OrderSummary({
  totals,
  discountPercent,
  onDiscountChange,
  isEmpty,
  promotions,
}: Props) {
  return (
    <div className="pos-order-summary">
      <h3 className="pos-order-summary__title">Totals</h3>
      <dl className="pos-order-summary__rows">
        <div className="pos-order-summary__row">
          <dt>Total</dt>
          <dd>{formatMoney(totals.subtotalCents)}</dd>
        </div>
        <div className="pos-order-summary__row pos-order-summary__row--discount">
          <dt>
            <span>Discount</span>
            <div className="pos-discount-presets" role="group" aria-label="Discount percent">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={
                    discountPercent === p ? 'pos-discount-preset is-active' : 'pos-discount-preset'
                  }
                  onClick={() => onDiscountChange(p)}
                  disabled={isEmpty}
                >
                  {p}%
                </button>
              ))}
            </div>
            {promotions.length > 0 && (
              <div className="pos-promotions" role="group" aria-label="Promotions from Supabase">
                <span className="pos-promotions__label">Promotions</span>
                <div className="pos-promotions__chips">
                  {promotions.map((promo) => (
                    <button
                      key={promo.id}
                      type="button"
                      className={
                        discountPercent === promo.discountPercent
                          ? 'pos-promo-chip is-active'
                          : 'pos-promo-chip'
                      }
                      onClick={() => onDiscountChange(promo.discountPercent)}
                      disabled={isEmpty}
                      title={promo.code ? `Code: ${promo.code}` : undefined}
                    >
                      {promo.name} ({promo.discountPercent}%)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </dt>
          <dd className={totals.discountCents > 0 ? 'is-savings' : undefined}>
            −{formatMoney(totals.discountCents)}
          </dd>
        </div>
        <div className="pos-order-summary__row pos-order-summary__row--final">
          <dt>Final</dt>
          <dd>{formatMoney(totals.finalCents)}</dd>
        </div>
      </dl>
    </div>
  )
}
