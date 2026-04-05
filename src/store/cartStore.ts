import { create } from 'zustand'
import type { CartLine, Product } from '../types/pos'

export type CartTotals = {
  subtotalCents: number
  discountCents: number
  finalCents: number
}

type CartState = {
  lines: CartLine[]
  discountPercent: number
  addProduct: (product: Product) => void
  increment: (productId: string) => void
  decrement: (productId: string) => void
  removeLine: (productId: string) => void
  setDiscountPercent: (percent: number) => void
  clearCart: () => void
}

function computeTotals(lines: CartLine[], discountPercent: number): CartTotals {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  )
  const discountCents = Math.round((subtotalCents * discountPercent) / 100)
  const finalCents = Math.max(0, subtotalCents - discountCents)
  return { subtotalCents, discountCents, finalCents }
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  discountPercent: 0,

  addProduct: (product) =>
    set((state) => {
      const idx = state.lines.findIndex((l) => l.product.id === product.id)
      let lines: CartLine[]
      if (idx >= 0) {
        lines = state.lines.map((l, i) =>
          i === idx ? { ...l, quantity: l.quantity + 1 } : l,
        )
      } else {
        lines = [...state.lines, { product, quantity: 1 }]
      }
      return { lines }
    }),

  increment: (productId) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.product.id === productId ? { ...l, quantity: l.quantity + 1 } : l,
      ),
    })),

  decrement: (productId) =>
    set((state) => {
      const line = state.lines.find((l) => l.product.id === productId)
      if (!line) return state
      if (line.quantity <= 1) {
        return {
          lines: state.lines.filter((l) => l.product.id !== productId),
        }
      }
      return {
        lines: state.lines.map((l) =>
          l.product.id === productId ? { ...l, quantity: l.quantity - 1 } : l,
        ),
      }
    }),

  removeLine: (productId) =>
    set((state) => ({
      lines: state.lines.filter((l) => l.product.id !== productId),
    })),

  setDiscountPercent: (percent) =>
    set({ discountPercent: Math.min(100, Math.max(0, percent)) }),

  clearCart: () => set({ lines: [], discountPercent: 0 }),
}))

export function useCartTotals(): CartTotals {
  const lines = useCartStore((s) => s.lines)
  const discountPercent = useCartStore((s) => s.discountPercent)
  return computeTotals(lines, discountPercent)
}
