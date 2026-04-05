import { useCartStore } from '../../store/cartStore'
import { ProductGrid } from './ProductGrid'
import { CartPanel } from './CartPanel'
import './pos.css'

export function PosLayout() {
  const addProduct = useCartStore((s) => s.addProduct)

  return (
    <div className="pos-layout">
      <main className="pos-main">
        <header className="pos-main__header">
          <h1>Register</h1>
          <p className="pos-main__hint">Select items to add to the cart</p>
        </header>
        <ProductGrid onAddProduct={addProduct} />
      </main>
      <CartPanel />
    </div>
  )
}
