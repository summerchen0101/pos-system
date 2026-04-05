import type { Product } from '../../types/pos'
import { formatMoney } from '../../lib/money'

type Props = {
  product: Product
  onAdd: (product: Product) => void
}

export function ProductButton({ product, onAdd }: Props) {
  return (
    <button
      type="button"
      className="pos-product-btn"
      onClick={() => onAdd(product)}
    >
      <span className="pos-product-btn__name">
        {product.name}
        {product.size ? ` (${product.size})` : ''}
      </span>
      <span className="pos-product-btn__price">{formatMoney(product.price)}</span>
    </button>
  )
}
