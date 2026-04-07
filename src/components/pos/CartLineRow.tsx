import { useState } from 'react'
import { NumpadModal } from '../NumpadModal'
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

  return (
    <li
      className={`pos-cart-line${isGift ? ' pos-cart-line--gift' : ''}${isManualFree ? ' pos-cart-line--manual-free' : ''}${isBundleComponent ? ' pos-cart-line--bundle-comp' : ''}`}
    >
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
    </li>
  )
}
