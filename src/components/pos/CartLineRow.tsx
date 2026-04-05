import type { CartLine } from '../../types/pos'
import { formatMoney } from '../../lib/money'

type Props = {
  line: CartLine
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
}

export function CartLineRow({ line, onIncrement, onDecrement, onRemove }: Props) {
  const { product, quantity } = line
  const lineTotal = product.price * quantity

  return (
    <li className="pos-cart-line">
      <div className="pos-cart-line__info">
        <span className="pos-cart-line__name">{product.name}</span>
        <span className="pos-cart-line__unit">{formatMoney(product.price)} each</span>
      </div>
      <div className="pos-cart-line__controls">
        <div className="pos-qty" role="group" aria-label={`Quantity for ${product.name}`}>
          <button
            type="button"
            className="pos-qty__btn"
            onClick={() => onDecrement(product.id)}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="pos-qty__value">{quantity}</span>
          <button
            type="button"
            className="pos-qty__btn"
            onClick={() => onIncrement(product.id)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        <span className="pos-cart-line__total">{formatMoney(lineTotal)}</span>
        <button
          type="button"
          className="pos-cart-line__remove"
          onClick={() => onRemove(product.id)}
          aria-label={`Remove ${product.name}`}
        >
          ×
        </button>
      </div>
    </li>
  )
}
