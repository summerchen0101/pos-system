import { AppstoreOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { zhtw } from '../../locales/zhTW'
import type { Product } from '../../types/pos'
import { formatMoney } from '../../lib/money'

type Props = {
  product: Product
  onAdd: (product: Product) => void
}

function placeholderChar(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  const cp = t.codePointAt(0)
  return cp !== undefined ? String.fromCodePoint(cp) : '?'
}

export function ProductButton({ product, onAdd }: Props) {
  const soldOut = product.stock <= 0
  const url = product.imageUrl?.trim() || null
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [url, product.id])

  const showImg = Boolean(url && !imgFailed)

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
      <div className="pos-product-btn__media" aria-hidden>
        {showImg ? (
          <img
            className="pos-product-btn__img"
            src={url!}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="pos-product-btn__placeholder">
            {product.name.trim() ? (
              <span className="pos-product-btn__placeholder-char">{placeholderChar(product.name)}</span>
            ) : (
              <AppstoreOutlined className="pos-product-btn__placeholder-icon-only" />
            )}
          </div>
        )}
      </div>
      <div className="pos-product-btn__body">
        <span className="pos-product-btn__name">
          {product.name}
          {product.size ? ` (${product.size})` : ''}
        </span>
        <span className="pos-product-btn__price">{formatMoney(product.price)}</span>
        <span className="pos-product-btn__stock">
          {soldOut ? zhtw.pos.soldOut : zhtw.pos.stockCount(product.stock)}
        </span>
      </div>
    </button>
  )
}
