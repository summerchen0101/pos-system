import { useEffect, useState } from 'react'
import { fetchProducts } from '../../api/fetchProducts'
import { fetchPromotions } from '../../api/fetchPromotions'
import { useCartStore } from '../../store/cartStore'
import type { Product, Promotion } from '../../types/pos'
import { ProductGrid } from './ProductGrid'
import { CartPanel } from './CartPanel'
import './pos.css'

export function PosLayout() {
  const addProduct = useCartStore((s) => s.addProduct)

  const [products, setProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [promotionsError, setPromotionsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    function errMessage(e: unknown): string {
      return e instanceof Error ? e.message : 'Request failed'
    }

    async function load() {
      setProductsLoading(true)
      setProductsError(null)
      setPromotionsError(null)

      const [pRes, prRes] = await Promise.allSettled([fetchProducts(), fetchPromotions()])

      if (cancelled) return

      if (pRes.status === 'fulfilled') {
        setProducts(pRes.value)
        setProductsError(null)
      } else {
        setProducts([])
        setProductsError(errMessage(pRes.reason))
      }

      if (prRes.status === 'fulfilled') {
        setPromotions(prRes.value)
        setPromotionsError(null)
      } else {
        setPromotions([])
        setPromotionsError(errMessage(prRes.reason))
      }

      setProductsLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="pos-layout">
      <main className="pos-main">
        <header className="pos-main__header">
          <h1>Register</h1>
          <p className="pos-main__hint">Select items to add to the cart</p>
        </header>
        <ProductGrid
          products={products}
          loading={productsLoading}
          error={productsError}
          onAddProduct={addProduct}
        />
      </main>
      <CartPanel promotions={promotions} promotionsError={promotionsError} />
    </div>
  )
}
