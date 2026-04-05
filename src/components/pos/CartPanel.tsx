import { insertOrder } from '../../api/ordersApi'
import { useCartPromotionTotals } from '../../hooks/useCartPromotionTotals'
import { useCartStore } from '../../store/cartStore'
import type { Promotion } from '../../types/pos'
import { CartLineRow } from './CartLineRow'
import { OrderSummary } from './OrderSummary'
import { CheckoutButton } from './CheckoutButton'

type Props = {
  promotions: Promotion[]
  promotionsError: string | null
}

export function CartPanel({ promotions, promotionsError }: Props) {
  const lines = useCartStore((s) => s.lines)
  const increment = useCartStore((s) => s.increment)
  const decrement = useCartStore((s) => s.decrement)
  const removeLine = useCartStore((s) => s.removeLine)
  const clearCart = useCartStore((s) => s.clearCart)

  const totals = useCartPromotionTotals(promotions)
  const isEmpty = lines.length === 0
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  const handleCheckout = () => {
    if (isEmpty) return
    void (async () => {
      try {
        await insertOrder({
          totalAmountCents: totals.subtotalCents,
          discountAmountCents: totals.discountCents,
          finalAmountCents: totals.finalCents,
        })
      } catch (e) {
        console.error('Failed to record order', e)
      }
      const msg = `Charged ${(totals.finalCents / 100).toFixed(2)} — thank you!`
      window.alert(msg)
      clearCart()
    })()
  }

  return (
    <aside className="pos-cart-panel" aria-label="Shopping cart">
      <header className="pos-cart-panel__header">
        <h2>Cart</h2>
        <span className="pos-cart-panel__count">
          {unitCount} {unitCount === 1 ? 'item' : 'items'}
        </span>
      </header>

      {promotionsError && (
        <p className="pos-cart-panel__warn" role="alert">
          Promotions could not be loaded: {promotionsError}
        </p>
      )}

      {isEmpty ? (
        <p className="pos-cart-empty">Tap a product to add it.</p>
      ) : (
        <ul className="pos-cart-list">
          {lines.map((line) => (
            <CartLineRow
              key={line.product.id}
              line={line}
              onIncrement={increment}
              onDecrement={decrement}
              onRemove={removeLine}
            />
          ))}
        </ul>
      )}

      <OrderSummary
        totals={totals}
        isEmpty={isEmpty}
        appliedPromotionName={totals.appliedPromotionName}
        hasPromotionRules={promotions.length > 0}
        promotionsFailed={promotionsError != null}
      />

      <CheckoutButton totals={totals} disabled={isEmpty} onCheckout={handleCheckout} />
    </aside>
  )
}
