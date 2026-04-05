import { checkoutOrder } from '../../api/ordersApi'
import { useCartPromotionTotals } from '../../hooks/useCartPromotionTotals'
import { zhtw } from '../../locales/zhTW'
import { formatMoney } from '../../lib/money'
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
  const stockOk = lines.every((l) => l.quantity <= l.product.stock && l.product.stock > 0)
  const canCheckout = !isEmpty && stockOk

  const handleCheckout = () => {
    if (!canCheckout) return
    void (async () => {
      try {
        await checkoutOrder(
          {
            totalAmountCents: totals.subtotalCents,
            discountAmountCents: totals.discountCents,
            finalAmountCents: totals.finalCents,
          },
          lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        )
      } catch (e) {
        console.error('Checkout failed', e)
        const raw = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
        const msg = raw.includes('insufficient_stock')
          ? zhtw.pos.checkoutInsufficient
          : zhtw.pos.checkoutFailed
        window.alert(msg)
        return
      }
      window.alert(zhtw.pos.chargedThanks(formatMoney(totals.finalCents)))
      clearCart()
    })()
  }

  return (
    <aside className="pos-cart-panel" aria-label={zhtw.pos.cartAria}>
      <header className="pos-cart-panel__header">
        <h2>{zhtw.pos.cartTitle}</h2>
        <span className="pos-cart-panel__count">
          {unitCount} {zhtw.pos.items}
        </span>
      </header>

      {promotionsError && (
        <p className="pos-cart-panel__warn" role="alert">
          {zhtw.pos.promotionsLoadError}
          {promotionsError}
        </p>
      )}

      {!isEmpty && !stockOk ? (
        <p className="pos-cart-panel__warn" role="alert">
          {zhtw.pos.checkoutInsufficient}
        </p>
      ) : null}

      {isEmpty ? (
        <p className="pos-cart-empty">{zhtw.pos.cartEmpty}</p>
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

      <CheckoutButton totals={totals} disabled={!canCheckout} onCheckout={handleCheckout} />
    </aside>
  )
}
