import { useCallback, useRef, useState } from 'react'
import { NumpadModal } from '../NumpadModal'
import { ProductImage } from '../ProductImage'
import { zhtw } from '../../locales/zhTW'
import { formatMoney } from '../../lib/money'
import type { CartLine, Product } from '../../types/pos'

function productCartLabel(p: Product): string {
  const size = p.size?.trim()
  return size ? `${p.name} (${size})` : p.name
}

type Props = {
  line: CartLine
  onIncrement: (lineId: string) => void
  onDecrement: (lineId: string) => void
  onRemove: (lineId: string) => void
  /** When true, +/- stay enabled for $0 manual lines (FREE_SELECTION). */
  allowQtyAdjust?: boolean
  /** When set with `qtyMin` / `qtyMax`, middle tap opens numpad (POS 無系統鍵盤). */
  onQtyCommit?: (lineId: string, qty: number) => void
  qtyMin?: number
  qtyMax?: number
}

const SWIPE_DELETE_WIDTH = 72
const SWIPE_DELETE_THRESHOLD = 48

export function CartLineRow({
  line,
  onIncrement,
  onDecrement,
  onRemove,
  allowQtyAdjust,
  onQtyCommit,
  qtyMin = 1,
  qtyMax = 999_999,
}: Props) {
  const { product, quantity, lineId, isGift, giftStock, isManualFree, isBundleRoot, isBundleComponent } =
    line
  const unitPrice =
    isGift || isManualFree || isBundleComponent ? 0 : product.price
  const lineTotal = unitPrice * quantity
  const label = productCartLabel(product)
  const stockLabel = isGift
    ? zhtw.pos.giftStockCount(giftStock ?? 0)
    : zhtw.pos.stockCount(product.stock)
  const lockQty =
    ((isGift || isManualFree) && !allowQtyAdjust) || !!isBundleRoot

  const showNumpad = !lockQty && typeof onQtyCommit === 'function'
  const [numpadOpen, setNumpadOpen] = useState(false)

  const [swipeX, setSwipeX] = useState(0)
  const [swipeDragging, setSwipeDragging] = useState(false)
  const swipeXRef = useRef(0)
  const swipeModeRef = useRef<'idle' | 'undecided' | 'horizontal' | 'vertical'>('idle')
  const swipeStartRef = useRef({ x: 0, y: 0, baseX: 0 })

  const handleSwipeRemove = useCallback(() => {
    onRemove(lineId)
  }, [lineId, onRemove])

  const onSwipePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    if (el.closest('button')) return
    swipeModeRef.current = 'undecided'
    setSwipeDragging(false)
    swipeStartRef.current = { x: e.clientX, y: e.clientY, baseX: swipeXRef.current }
  }, [])

  const onSwipePointerMove = useCallback((e: React.PointerEvent) => {
    const mode = swipeModeRef.current
    if (mode === 'idle' || mode === 'vertical') return
    if (mode === 'undecided') {
      const dx = e.clientX - swipeStartRef.current.x
      const dy = e.clientY - swipeStartRef.current.y
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      if (Math.abs(dy) > Math.abs(dx)) {
        swipeModeRef.current = 'vertical'
        return
      }
      swipeModeRef.current = 'horizontal'
      setSwipeDragging(true)
      swipeStartRef.current = { x: e.clientX, y: e.clientY, baseX: swipeXRef.current }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    e.preventDefault()
    const dx = e.clientX - swipeStartRef.current.x
    const next = Math.max(
      -SWIPE_DELETE_WIDTH,
      Math.min(0, swipeStartRef.current.baseX + dx),
    )
    swipeXRef.current = next
    setSwipeX(next)
  }, [])

  const endSwipe = useCallback(
    (e: React.PointerEvent) => {
      const mode = swipeModeRef.current
      const panel = e.currentTarget as HTMLElement
      try {
        if (panel.hasPointerCapture?.(e.pointerId)) {
          panel.releasePointerCapture(e.pointerId)
        }
      } catch {
        /* noop */
      }
      swipeModeRef.current = 'idle'
      setSwipeDragging(false)
      if (mode === 'horizontal' && swipeXRef.current <= -SWIPE_DELETE_THRESHOLD) {
        handleSwipeRemove()
        return
      }
      swipeXRef.current = 0
      setSwipeX(0)
    },
    [handleSwipeRemove],
  )

  return (
    <li
      className={`pos-cart-line${isGift ? ' pos-cart-line--gift' : ''}${isManualFree ? ' pos-cart-line--manual-free' : ''}${isBundleComponent ? ' pos-cart-line--bundle-comp' : ''}`}
    >
      <div className="pos-cart-line__swipe">
        <div className="pos-cart-line__swipe-track" aria-hidden>
          <div className="pos-cart-line__swipe-track-inner">{zhtw.pos.cartSwipeDelete}</div>
        </div>
        <div
          className="pos-cart-line__swipe-panel"
          style={{
            transform: `translateX(${swipeX}px)`,
            transition: swipeDragging ? 'none' : 'transform 0.2s ease',
          }}
          onPointerDown={onSwipePointerDown}
          onPointerMove={onSwipePointerMove}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
        >
          <div className="pos-cart-line__details">
        <div className="pos-cart-line__thumb" aria-hidden>
          <ProductImage
            imageUrl={product.imageUrl}
            size="thumb"
            className="pos-cart-line__thumb-img"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <div className="pos-cart-line__info">
          <span className="pos-cart-line__name">
            {label}
            {isGift ? (
              <span className="pos-cart-line__gift-badge">{zhtw.pos.giftBadge}</span>
            ) : null}
            {isManualFree ? (
              <span className="pos-cart-line__manual-free-badge">{zhtw.pos.manualFreeBadge}</span>
            ) : null}
            {isBundleRoot || isBundleComponent ? (
              <span className="pos-cart-line__bundle-badge">{zhtw.pos.bundleBadge}</span>
            ) : null}
          </span>
          <span className="pos-cart-line__unit">
            {formatMoney(unitPrice)}
            {zhtw.pos.each}
          </span>
          <span className="pos-cart-line__stock">{stockLabel}</span>
        </div>
      </div>
      <div className="pos-cart-line__controls">
        <div className="pos-qty" role="group" aria-label={zhtw.pos.qtyGroup(label)}>
          {showNumpad ? (
            <>
              <button
                type="button"
                className="pos-qty__btn"
                onClick={() => onDecrement(lineId)}
                aria-label={zhtw.pos.decreaseQty}
              >
                −
              </button>
              <button
                type="button"
                className="pos-qty__value pos-qty__value--tap"
                onClick={() => setNumpadOpen(true)}
                aria-label={zhtw.pos.numpadQtyTitle}
              >
                {quantity}
              </button>
              <button
                type="button"
                className="pos-qty__btn"
                onClick={() => onIncrement(lineId)}
                aria-label={zhtw.pos.increaseQty}
              >
                +
              </button>
              <NumpadModal
                open={numpadOpen}
                title={zhtw.pos.numpadQtyTitle}
                value={quantity}
                min={qtyMin}
                max={qtyMax}
                onConfirm={(q) => {
                  onQtyCommit!(lineId, q)
                  setNumpadOpen(false)
                }}
                onCancel={() => setNumpadOpen(false)}
              />
            </>
          ) : (
            <>
              <button
                type="button"
                className="pos-qty__btn"
                onClick={() => onDecrement(lineId)}
                disabled={lockQty}
                aria-label={zhtw.pos.decreaseQty}
              >
                −
              </button>
              <span className="pos-qty__value">{quantity}</span>
              <button
                type="button"
                className="pos-qty__btn"
                onClick={() => onIncrement(lineId)}
                disabled={lockQty}
                aria-label={zhtw.pos.increaseQty}
              >
                +
              </button>
            </>
          )}
        </div>
        <span className="pos-cart-line__total">{formatMoney(lineTotal)}</span>
        <button
          type="button"
          className="pos-cart-line__remove"
          onClick={() => onRemove(lineId)}
          aria-label={zhtw.pos.removeLine(label)}
        >
          ×
        </button>
      </div>
        </div>
      </div>
    </li>
  )
}
