import { formatMoney } from '../../lib/money'
import type { CartTotals } from '../../store/cartStore'

type Props = {
  totals: CartTotals
  discountPercent: number
  onDiscountChange: (percent: number) => void
  isEmpty: boolean
}

const PRESETS = [0, 5, 10, 15, 20]

export function OrderSummary({
  totals,
  discountPercent,
  onDiscountChange,
  isEmpty,
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
