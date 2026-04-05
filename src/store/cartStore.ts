import { create } from 'zustand'
import type { CartLine, Product } from '../types/pos'

export type CartTotals = {
  subtotalCents: number
  discountCents: number
  finalCents: number
}

type CartState = {
  lines: CartLine[]
  addProduct: (product: Product) => void
  increment: (productId: string) => void
  decrement: (productId: string) => void
  removeLine: (productId: string) => void
  clearCart: () => void
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],

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

  clearCart: () => set({ lines: [] }),
}))
