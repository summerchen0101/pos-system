import { App, Button, Space, Tag } from 'antd'
import { useMemo, useState } from 'react'
import { checkoutOrder } from '../../api/ordersApi'
import { useCartPromotionTotals } from '../../hooks/useCartPromotionTotals'
import { zhtw } from '../../locales/zhTW'
import { formatMoney } from '../../lib/money'
import { useCartStore } from '../../store/cartStore'
import type { Product, Promotion } from '../../types/pos'
import { CartLineRow } from './CartLineRow'
import { CheckoutButton } from './CheckoutButton'
import { ManualPromotionApplyModal } from './ManualPromotionApplyModal'
import { OrderSummary } from './OrderSummary'

type Props = {
  promotions: Promotion[]
  products: Product[]
  promotionsError: string | null
}

export function CartPanel({ promotions, products, promotionsError }: Props) {
  const { message } = App.useApp()
  const lines = useCartStore((s) => s.lines)
  const manualPromotionIds = useCartStore((s) => s.manualPromotionIds)
  const increment = useCartStore((s) => s.increment)
  const decrement = useCartStore((s) => s.decrement)
  const removeLine = useCartStore((s) => s.removeLine)
  const clearCart = useCartStore((s) => s.clearCart)
  const removeManualPromotion = useCartStore((s) => s.removeManualPromotion)

  const [manualModalOpen, setManualModalOpen] = useState(false)

  const totals = useCartPromotionTotals(promotions)
  const isEmpty = lines.length === 0
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const stockOk = lines.every((l) => {
    if (l.isGift) {
      const gs = l.giftStock ?? 0
      return gs > 0 && l.quantity <= gs
    }
    return l.quantity <= l.product.stock && l.product.stock > 0
  })
  const canCheckout = !isEmpty && stockOk

  const manualTags = useMemo(() => {
    return manualPromotionIds.map((id) => {
      const p = promotions.find((x) => x.id === id)
      return { id, name: p?.name ?? id }
    })
  }, [manualPromotionIds, promotions])

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
          lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            ...(l.isGift && l.giftId ? { giftId: l.giftId } : {}),
          })),
        )
      } catch (e) {
        console.error('Checkout failed', e)
        const raw = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
        const msg = raw.includes('insufficient_stock')
          ? zhtw.pos.checkoutInsufficient
          : zhtw.pos.checkoutFailed
        message.error(msg)
        return
      }
      message.success(zhtw.pos.chargedThanks(formatMoney(totals.finalCents)))
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

      {!isEmpty ? (
        <div className="pos-cart-panel__manual-actions">
          <Button type="default" size="small" block onClick={() => setManualModalOpen(true)}>
            {zhtw.pos.applyPromotion}
          </Button>
          {manualTags.length > 0 ? (
            <Space size={[4, 4]} wrap style={{ marginTop: 8 }}>
              {manualTags.map((t) => (
                <Tag
                  key={t.id}
                  closable
                  onClose={() => removeManualPromotion(t.id)}
                  color="gold"
                >
                  {t.name}
                </Tag>
              ))}
            </Space>
          ) : null}
        </div>
      ) : null}

      {isEmpty ? (
        <p className="pos-cart-empty">{zhtw.pos.cartEmpty}</p>
      ) : (
        <ul className="pos-cart-list">
          {lines.map((line) => (
            <CartLineRow
              key={line.lineId}
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
        thresholdGiftSummaries={totals.thresholdGiftSummaries}
        manualPromotionDetails={totals.manualPromotionDetails}
      />

      <CheckoutButton totals={totals} disabled={!canCheckout} onCheckout={handleCheckout} />

      <ManualPromotionApplyModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        promotions={promotions}
        products={products}
      />
    </aside>
  )
}
