import { SAMPLE_PRODUCTS } from '../../data/sampleProducts'
import type { Product } from '../../types/pos'
import { ProductButton } from './ProductButton'

type Props = {
  onAddProduct: (product: Product) => void
}

export function ProductGrid({ onAddProduct }: Props) {
  return (
    <section className="pos-product-grid" aria-label="Products">
      {SAMPLE_PRODUCTS.map((product) => (
        <ProductButton key={product.id} product={product} onAdd={onAddProduct} />
      ))}
    </section>
  )
}
