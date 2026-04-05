import { zhtw } from '../../locales/zhTW'
import type { CartLine, Product } from '../../types/pos'
import { formatMoney } from '../../lib/money'

function productCartLabel(p: Product): string {
  const size = p.size?.trim()
  return size ? `${p.name} (${size})` : p.name
}

type Props = {
  line: CartLine
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
}

export function CartLineRow({ line, onIncrement, onDecrement, onRemove }: Props) {
  const { product, quantity } = line
  const lineTotal = product.price * quantity
  const label = productCartLabel(product)

  return (
    <li className="pos-cart-line">
      <div className="pos-cart-line__info">
        <span className="pos-cart-line__name">{label}</span>
        <span className="pos-cart-line__unit">
          {formatMoney(product.price)}
          {zhtw.pos.each}
        </span>
        <span className="pos-cart-line__stock">{zhtw.pos.stockCount(product.stock)}</span>
      </div>
      <div className="pos-cart-line__controls">
        <div className="pos-qty" role="group" aria-label={zhtw.pos.qtyGroup(label)}>
          <button
            type="button"
            className="pos-qty__btn"
            onClick={() => onDecrement(product.id)}
            aria-label={zhtw.pos.decreaseQty}
          >
            −
          </button>
          <span className="pos-qty__value">{quantity}</span>
          <button
            type="button"
            className="pos-qty__btn"
            onClick={() => onIncrement(product.id)}
            aria-label={zhtw.pos.increaseQty}
          >
            +
          </button>
        </div>
        <span className="pos-cart-line__total">{formatMoney(lineTotal)}</span>
        <button
          type="button"
          className="pos-cart-line__remove"
          onClick={() => onRemove(product.id)}
          aria-label={zhtw.pos.removeLine(label)}
        >
          ×
        </button>
      </div>
    </li>
  )
}
