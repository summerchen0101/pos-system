import { zhtw } from '../../locales/zhTW'
import type { Product } from '../../types/pos'
import { formatMoney } from '../../lib/money'

type Props = {
  product: Product
  onAdd: (product: Product) => void
}

export function ProductButton({ product, onAdd }: Props) {
  const soldOut = product.stock <= 0
  return (
    <button
      type="button"
      className="pos-product-btn"
      disabled={soldOut}
      onClick={() => onAdd(product)}
      aria-label={
        soldOut
          ? zhtw.pos.productSoldOutAria(product.name)
          : `${product.name}，${zhtw.pos.stockLabel} ${product.stock}`
      }
    >
      <span className="pos-product-btn__name">
        {product.name}
        {product.size ? ` (${product.size})` : ''}
      </span>
      <span className="pos-product-btn__price">{formatMoney(product.price)}</span>
      <span className="pos-product-btn__stock">
        {soldOut ? zhtw.pos.soldOut : zhtw.pos.stockCount(product.stock)}
      </span>
    </button>
  )
}
