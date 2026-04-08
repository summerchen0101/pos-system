import { App, Button, Space, Tag } from 'antd'
import { useMemo, useState } from 'react'
import { usePosCashier } from '../../context/PosCashierContext'
import { fetchCheckoutStaffSnapshots } from '../../api/posCheckoutStaff'
import {
  checkoutOrder,
  type BuyerProfilePatch,
  type CheckoutLinePayload,
  updateOrderBuyerProfile,
} from '../../api/ordersApi'
import { useCartPromotionTotals } from '../../hooks/useCartPromotionTotals'
import { zhtw } from '../../locales/zhTW'
import { formatMoney } from '../../lib/money'
import {
  bundleGroupRequiredQty,
  componentQtySumForBundleGroup,
} from '../../pos/bundleCart'
import {
  buildFreeSelectionPromotionsSnapshot,
  isFreeSelectionCartLine,
} from '../../promotions/freeSelectionLines'
import { getLineQtyBounds } from '../../pos/cartLineQtyBounds'
import { useCartStore } from '../../store/cartStore'
import type { Product, Promotion } from '../../types/pos'
import { CartLineRow } from './CartLineRow'
import { CheckoutButton } from './CheckoutButton'
import { ManualPromotionApplyModal } from './ManualPromotionApplyModal'
import { OrderSummary } from './OrderSummary'
import { PosTodayOrdersDrawer } from './PosTodayOrdersDrawer'
import { BuyerProfileModal } from './BuyerProfileModal'

type Props = {
  boothId: string
  promotions: Promotion[]
  products: Product[]
  promotionsError: string | null
}

export function CartPanel({ boothId, promotions, products, promotionsError }: Props) {
  const { message } = App.useApp()
  const { cashier } = usePosCashier()
  const lines = useCartStore((s) => s.lines)
  const manualPromotionIds = useCartStore((s) => s.manualPromotionIds)
  const increment = useCartStore((s) => s.increment)
  const decrement = useCartStore((s) => s.decrement)
  const removeLine = useCartStore((s) => s.removeLine)
  const clearCart = useCartStore((s) => s.clearCart)
  const removeManualPromotion = useCartStore((s) => s.removeManualPromotion)
  const applyFreeSelectionLines = useCartStore((s) => s.applyFreeSelectionLines)
  const updateLineQuantity = useCartStore((s) => s.updateLineQuantity)

  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [todayOrdersOpen, setTodayOrdersOpen] = useState(false)
  const [buyerProfileOpen, setBuyerProfileOpen] = useState(false)
  const [buyerProfileLoading, setBuyerProfileLoading] = useState(false)
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)

  const totals = useCartPromotionTotals(promotions)
  const isEmpty = lines.length === 0
  const unitCount = useMemo(
    () => lines.filter((l) => !l.isBundleComponent).reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  )
  const stockOk = lines.every((l) => {
    if (l.isGift) {
      const gs = l.giftStock ?? 0
      return gs > 0 && l.quantity <= gs
    }
    return l.quantity <= l.product.stock && l.product.stock > 0
  })
  const canCheckout = !isEmpty && stockOk && !!boothId

  const handleIncrement = (lineId: string) => {
    const line = lines.find((l) => l.lineId === lineId)
    if (!line) return
    if (line.isBundleComponent && line.bundleRootProductId && line.bundleInstanceId && line.bundleGroupId) {
      const bundle = products.find((x) => x.id === line.bundleRootProductId)
      if (!bundle || bundle.kind !== 'CUSTOM_BUNDLE') return
      const required = bundleGroupRequiredQty(bundle, line.bundleGroupId)
      const sumOthers = componentQtySumForBundleGroup(
        lines,
        line.bundleInstanceId,
        line.bundleGroupId,
        line.lineId,
      )
      const next = line.quantity + 1
      if (sumOthers + next > required) return
      if (next > line.product.stock) return
      updateLineQuantity(line.lineId, next)
      return
    }
    if (isFreeSelectionCartLine(line, promotions)) {
      const p = promotions.find((x) => x.id === line.manualPromotionId)
      if (!p || p.kind !== 'FREE_SELECTION') return
      const max = p.maxSelectionQty ?? 0
      const totalOthers = lines
        .filter(
          (l) =>
            l.isManualFree &&
            l.manualPromotionId === p.id &&
            l.lineId !== lineId &&
            !l.isBundleComponent,
        )
        .reduce((a, l) => a + l.quantity, 0)
      const next = line.quantity + 1
      if (totalOthers + next > max) return
      if (next > line.product.stock) return
      updateLineQuantity(lineId, next)
      return
    }
    increment(lineId)
  }

  const handleDecrement = (lineId: string) => {
    const line = lines.find((l) => l.lineId === lineId)
    if (!line) return
    if (line.isBundleComponent) {
      const next = line.quantity - 1
      if (next < 1) {
        removeLine(lineId)
        return
      }
      updateLineQuantity(lineId, next)
      return
    }
    if (isFreeSelectionCartLine(line, promotions)) {
      const next = line.quantity - 1
      if (next < 1) {
        removeLine(lineId)
        return
      }
      updateLineQuantity(lineId, next)
      return
    }
    decrement(lineId)
  }

  const handleSetQuantity = (lineId: string, qty: number) => {
    const line = lines.find((l) => l.lineId === lineId)
    if (!line) return
    const { min, max } = getLineQtyBounds(line, lines, products, promotions)
    const q = Math.min(max, Math.max(min, Math.trunc(qty)))
    if (q === line.quantity) return
    updateLineQuantity(lineId, q)
  }

  const manualTags = useMemo(() => {
    return manualPromotionIds.map((id) => {
      const p = promotions.find((x) => x.id === id)
      return { id, name: p?.name ?? id }
    })
  }, [manualPromotionIds, promotions])

  const handleCheckout = () => {
    if (!canCheckout || !boothId) return
    void (async () => {
      try {
        const checkoutLines: CheckoutLinePayload[] = lines.map((l) => {
          const isFs = isFreeSelectionCartLine(l, promotions)
          const isBundleComp = !!l.isBundleComponent
          let source: 'FREE_SELECTION' | 'BUNDLE_COMPONENT' | undefined
          if (isFs) source = 'FREE_SELECTION'
          else if (isBundleComp) source = 'BUNDLE_COMPONENT'
          return {
            productId: l.giftId ? null : l.product.id,
            quantity: l.quantity,
            unitPriceCents: l.isGift || l.isManualFree || isBundleComp ? 0 : l.product.price,
            productName: l.product.name,
            size: l.product.size,
            isGift: !!l.isGift || isFs,
            isManualFree: !!l.isManualFree,
            ...(l.isGift && l.giftId ? { giftId: l.giftId } : {}),
            ...(source ? { source } : {}),
          }
        })
        const { scheduledStaff, clockedInStaff } = await fetchCheckoutStaffSnapshots(boothId)
        const orderId = await checkoutOrder(
          {
            totalAmountCents: totals.subtotalCents,
            discountAmountCents: totals.discountCents,
            finalAmountCents: totals.finalCents,
            boothId,
            cashierUserId: cashier?.userId ?? null,
            scheduledStaff,
            clockedInStaff,
          },
          checkoutLines,
          {
            autoPromotionId: totals.appliedPromotionId,
            autoPromotionName: totals.appliedPromotionName,
            manualPromotionDetails: totals.manualPromotionDetails.map((m) => ({
              promotionId: m.promotionId,
              name: m.name,
              discountCents: m.discountCents,
            })),
            thresholdGiftSummaries: totals.thresholdGiftSummaries,
            promotions: buildFreeSelectionPromotionsSnapshot(lines, promotions, manualPromotionIds),
          },
        )
        setLastOrderId(orderId)
      } catch (e) {
        console.error('Checkout failed', e)
        const raw = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
        const msg = raw.includes('insufficient_stock')
          ? zhtw.pos.checkoutInsufficient
          : raw.includes('promotion_not_allowed_for_booth') ||
              raw.includes('invalid_promotion_id')
            ? zhtw.pos.checkoutPromotionInvalid
            : zhtw.pos.checkoutFailed
        message.error(msg)
        return
      }
      message.success(zhtw.pos.chargedThanks(formatMoney(totals.finalCents)))
      clearCart()
      setBuyerProfileOpen(true)
    })()
  }
  const handleSkipBuyerProfile = () => {
    setBuyerProfileOpen(false)
    setLastOrderId(null)
  }

  const handleSubmitBuyerProfile = (patch: BuyerProfilePatch) => {
    if (!lastOrderId) {
      handleSkipBuyerProfile()
      return
    }
    setBuyerProfileLoading(true)
    void (async () => {
      try {
        await updateOrderBuyerProfile(lastOrderId, patch)
        message.success(zhtw.pos.buyerProfile.recorded)
      } catch {
        message.error(zhtw.pos.buyerProfile.recordFailed)
      } finally {
        setBuyerProfileLoading(false)
        setBuyerProfileOpen(false)
        setLastOrderId(null)
      }
    })()
  }

  const isCheckoutBusy = buyerProfileOpen || buyerProfileLoading


  const handleClearCart = () => {
    clearCart()
    setManualModalOpen(false)
  }

  return (
    <aside className="pos-cart-panel" aria-label={zhtw.pos.cartAria}>
      <header className="pos-cart-panel__header">
        <h2>{zhtw.pos.cartTitle}</h2>
        <div className="pos-cart-panel__header-actions">
          <span className="pos-cart-panel__count">
            {unitCount} {zhtw.pos.items}
          </span>
          {boothId ? (
            <Button size="small" type="default" onClick={() => setTodayOrdersOpen(true)}>
              {zhtw.pos.todayOrders.openButton}
            </Button>
          ) : null}
        </div>
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

      <div className="pos-cart-panel__manual-actions">
        <button
          type="button"
          className="pos-apply-promotion"
          onClick={() => setManualModalOpen(true)}
        >
          {zhtw.pos.applyPromotion}
        </button>
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

      <div className="pos-cart-panel__lines-scroll">
        {isEmpty ? (
          <p className="pos-cart-empty">{zhtw.pos.cartEmpty}</p>
        ) : (
          <ul className="pos-cart-list">
            {lines.map((line) => {
              const allowQtyAdjust =
                isFreeSelectionCartLine(line, promotions) || !!line.isBundleComponent
              const lockQty =
                ((line.isGift || line.isManualFree) && !allowQtyAdjust) ||
                !!line.isBundleRoot
              const bounds = getLineQtyBounds(line, lines, products, promotions)
              return (
                <CartLineRow
                  key={line.lineId}
                  line={line}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onRemove={removeLine}
                  allowQtyAdjust={allowQtyAdjust}
                  qtyMin={bounds.min}
                  qtyMax={bounds.max}
                  onQtyCommit={lockQty ? undefined : handleSetQuantity}
                />
              )
            })}
          </ul>
        )}
      </div>

      <div className="pos-cart-panel__footer">
        <OrderSummary
          totals={totals}
          isEmpty={isEmpty}
          appliedPromotionName={totals.appliedPromotionName}
          hasPromotionRules={promotions.length > 0}
          promotionsFailed={promotionsError != null}
          thresholdGiftSummaries={totals.thresholdGiftSummaries}
          manualPromotionDetails={totals.manualPromotionDetails}
          appliedDiscounts={totals.appliedDiscounts}
        />

        <div className="pos-cart-panel__checkout-row">
          <button
            type="button"
            className="pos-cart-clear"
            disabled={isEmpty || isCheckoutBusy}
            onClick={handleClearCart}
          >
            {zhtw.pos.cartClear}
          </button>
          <CheckoutButton totals={totals} disabled={!canCheckout || isCheckoutBusy} onCheckout={handleCheckout} />
        </div>
      </div>

      {boothId ? (
        <PosTodayOrdersDrawer
          boothId={boothId}
          open={todayOrdersOpen}
          onClose={() => setTodayOrdersOpen(false)}
        />
      ) : null}

      <ManualPromotionApplyModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        promotions={promotions}
        products={products}
        onApplyFreeSelection={(promotionId, cartLines) => applyFreeSelectionLines(promotionId, cartLines)}
      />
      <BuyerProfileModal
        open={buyerProfileOpen}
        loading={buyerProfileLoading}
        onSkip={handleSkipBuyerProfile}
        onSubmit={handleSubmitBuyerProfile}
      />
    </aside>
  )
}
