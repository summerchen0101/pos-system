import { useCartStore, useCartTotals } from '../../store/cartStore'
import { CartLineRow } from './CartLineRow'
import { OrderSummary } from './OrderSummary'
import { CheckoutButton } from './CheckoutButton'

export function CartPanel() {
  const lines = useCartStore((s) => s.lines)
  const discountPercent = useCartStore((s) => s.discountPercent)
  const increment = useCartStore((s) => s.increment)
  const decrement = useCartStore((s) => s.decrement)
  const removeLine = useCartStore((s) => s.removeLine)
  const setDiscountPercent = useCartStore((s) => s.setDiscountPercent)
  const clearCart = useCartStore((s) => s.clearCart)

  const totals = useCartTotals()
  const isEmpty = lines.length === 0
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  const handleCheckout = () => {
    if (isEmpty) return
    // Demo: replace with payment / receipt flow
    const msg = `Charged ${(totals.finalCents / 100).toFixed(2)} — thank you!`
    window.alert(msg)
    clearCart()
  }

  return (
    <aside className="pos-cart-panel" aria-label="Shopping cart">
      <header className="pos-cart-panel__header">
        <h2>Cart</h2>
        <span className="pos-cart-panel__count">
          {unitCount} {unitCount === 1 ? 'item' : 'items'}
        </span>
      </header>

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
        discountPercent={discountPercent}
        onDiscountChange={setDiscountPercent}
        isEmpty={isEmpty}
      />

      <CheckoutButton totals={totals} disabled={isEmpty} onCheckout={handleCheckout} />
    </aside>
  )
}
