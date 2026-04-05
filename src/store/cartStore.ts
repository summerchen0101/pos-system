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
      if (product.stock <= 0) return state
      const idx = state.lines.findIndex((l) => l.product.id === product.id)
      if (idx >= 0) {
        const line = state.lines[idx]
        const next = Math.min(line.quantity + 1, product.stock)
        if (next <= line.quantity) return state
        return {
          lines: state.lines.map((l, i) =>
            i === idx ? { ...l, quantity: next, product } : l,
          ),
        }
      }
      return { lines: [...state.lines, { product, quantity: 1 }] }
    }),

  increment: (productId) =>
    set((state) => ({
      lines: state.lines.map((l) => {
        if (l.product.id !== productId) return l
        if (l.quantity >= l.product.stock) return l
        return { ...l, quantity: l.quantity + 1 }
      }),
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
