import type { CartTotals } from '../../store/cartStore'
import { formatMoney } from '../../lib/money'

type Props = {
  totals: CartTotals
  disabled: boolean
  onCheckout: () => void
}

export function CheckoutButton({ totals, disabled, onCheckout }: Props) {
  return (
    <button
      type="button"
      className="pos-checkout"
      disabled={disabled}
      onClick={onCheckout}
    >
      <span className="pos-checkout__label">Checkout</span>
      <span className="pos-checkout__amount">{formatMoney(totals.finalCents)}</span>
    </button>
  )
}
