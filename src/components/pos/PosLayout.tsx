import { Tabs } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchCategories } from '../../api/fetchCategories'
import { fetchProducts } from '../../api/fetchProducts'
import { fetchPromotions } from '../../api/fetchPromotions'
import { useCartStore } from '../../store/cartStore'
import type { Category, Product, Promotion } from '../../types/pos'
import { ProductGrid } from './ProductGrid'
import { CartPanel } from './CartPanel'
import './pos.css'

const OTHER_TAB_KEY = '__other__'

export function PosLayout() {
  const addProduct = useCartStore((s) => s.addProduct)

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  /** User-selected tab; may be stale until `displayTab` reconciles with data. */
  const [activeTab, setActiveTab] = useState<string>('')
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [promotionsError, setPromotionsError] = useState<string | null>(null)

  const activeCategoryIdSet = useMemo(() => new Set(categories.map((c) => c.id)), [categories])

  const tabItems = useMemo(() => {
    const hasOther = products.some(
      (p) => !p.categoryId || !activeCategoryIdSet.has(p.categoryId),
    )
    const items = categories.map((c) => ({
      key: c.id,
      label: c.name,
    }))
    if (hasOther) {
      items.push({ key: OTHER_TAB_KEY, label: 'Other' })
    }
    return items
  }, [categories, products, activeCategoryIdSet])

  const displayTab = useMemo(() => {
    if (categories.length === 0) return ''
    const validOther = products.some(
      (p) => !p.categoryId || !activeCategoryIdSet.has(p.categoryId),
    )
    const validKeys = new Set<string>(categories.map((c) => c.id))
    if (validOther) validKeys.add(OTHER_TAB_KEY)

    if (activeTab && validKeys.has(activeTab)) return activeTab

    const firstWithStock = categories.find((c) => products.some((p) => p.categoryId === c.id))
    if (firstWithStock) return firstWithStock.id
    if (validOther) return OTHER_TAB_KEY
    return categories[0].id
  }, [categories, products, activeCategoryIdSet, activeTab])

  const gridProducts = useMemo(() => {
    if (categories.length === 0) return products
    if (displayTab === OTHER_TAB_KEY) {
      return products.filter(
        (p) => !p.categoryId || !activeCategoryIdSet.has(p.categoryId),
      )
    }
    if (!displayTab) return products
    return products.filter((p) => p.categoryId === displayTab)
  }, [products, categories.length, displayTab, activeCategoryIdSet])

  useEffect(() => {
    let cancelled = false

    function errMessage(e: unknown): string {
      return e instanceof Error ? e.message : 'Request failed'
    }

    async function load() {
      setProductsLoading(true)
      setProductsError(null)
      setPromotionsError(null)

      const [pRes, cRes, prRes] = await Promise.allSettled([
        fetchProducts(),
        fetchCategories(),
        fetchPromotions(),
      ])

      if (cancelled) return

      if (pRes.status === 'fulfilled') {
        setProducts(pRes.value)
        setProductsError(null)
      } else {
        setProducts([])
        setProductsError(errMessage(pRes.reason))
      }

      if (cRes.status === 'fulfilled') {
        setCategories(cRes.value)
      } else {
        setCategories([])
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
          <div className="pos-main__title-row">
            <h1>Register</h1>
            <Link className="pos-admin-link" to="/admin">
              Admin dashboard
            </Link>
          </div>
          <p className="pos-main__hint">Select items to add to the cart</p>
        </header>
        {!productsLoading && !productsError && categories.length > 0 && tabItems.length > 0 ? (
          <Tabs
            className="pos-category-tabs"
            activeKey={displayTab}
            onChange={setActiveTab}
            items={tabItems}
          />
        ) : null}
        <ProductGrid
          products={gridProducts}
          loading={productsLoading}
          error={productsError}
          onAddProduct={addProduct}
          emptyMessage={
            categories.length > 0 ? 'No products in this category.' : undefined
          }
        />
      </main>
      <CartPanel promotions={promotions} promotionsError={promotionsError} />
    </div>
  )
}
