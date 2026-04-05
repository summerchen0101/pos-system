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
}

export function CartLineRow({ line, onIncrement, onDecrement, onRemove }: Props) {
  const { product, quantity, lineId, isGift, giftStock } = line
  const unitPrice = isGift ? 0 : product.price
  const lineTotal = unitPrice * quantity
  const label = productCartLabel(product)
  const stockLabel = isGift
    ? zhtw.pos.giftStockCount(giftStock ?? 0)
    : zhtw.pos.stockCount(product.stock)

  return (
    <li className={`pos-cart-line${isGift ? ' pos-cart-line--gift' : ''}`}>
      <div className="pos-cart-line__info">
        <span className="pos-cart-line__name">
          {label}
          {isGift ? (
            <span className="pos-cart-line__gift-badge">{zhtw.pos.giftBadge}</span>
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
          <button
            type="button"
            className="pos-qty__btn"
            onClick={() => onDecrement(lineId)}
            disabled={isGift}
            aria-label={zhtw.pos.decreaseQty}
          >
            −
          </button>
          <span className="pos-qty__value">{quantity}</span>
          <button
            type="button"
            className="pos-qty__btn"
            onClick={() => onIncrement(lineId)}
            disabled={isGift}
            aria-label={zhtw.pos.increaseQty}
          >
            +
          </button>
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
