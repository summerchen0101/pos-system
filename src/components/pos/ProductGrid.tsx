import type { Product } from '../../types/pos'
import { ProductButton } from './ProductButton'

type Props = {
  products: Product[]
  loading: boolean
  error: string | null
  onAddProduct: (product: Product) => void
}

export function ProductGrid({ products, loading, error, onAddProduct }: Props) {
  if (loading) {
    return (
      <p className="pos-product-grid__status" role="status">
        Loading products…
      </p>
    )
  }

  if (error) {
    return (
      <p className="pos-product-grid__status pos-product-grid__status--error" role="alert">
        {error}
      </p>
    )
  }

  if (products.length === 0) {
    return (
      <p className="pos-product-grid__status">No products in Supabase yet. Add rows to the products table.</p>
    )
  }

  return (
    <section className="pos-product-grid" aria-label="Products">
      {products.map((product) => (
        <ProductButton key={product.id} product={product} onAdd={onAddProduct} />
      ))}
    </section>
  )
}
