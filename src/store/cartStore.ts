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
  increment: (lineId: string) => void
  decrement: (lineId: string) => void
  removeLine: (lineId: string) => void
  mergeGiftLines: (giftLines: CartLine[]) => void
  clearCart: () => void
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],

  addProduct: (product) =>
    set((state) => {
      if (product.stock <= 0) return state
      const idx = state.lines.findIndex((l) => !l.isGift && l.product.id === product.id)
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
      return {
        lines: [...state.lines, { lineId: product.id, product, quantity: 1 }],
      }
    }),

  increment: (lineId) =>
    set((state) => ({
      lines: state.lines.map((l) => {
        if (l.lineId !== lineId) return l
        if (l.isGift) return l
        if (l.quantity >= l.product.stock) return l
        return { ...l, quantity: l.quantity + 1 }
      }),
    })),

  decrement: (lineId) =>
    set((state) => {
      const line = state.lines.find((l) => l.lineId === lineId)
      if (!line) return state
      if (line.isGift) {
        return { lines: state.lines.filter((l) => l.lineId !== lineId) }
      }
      if (line.quantity <= 1) {
        return { lines: state.lines.filter((l) => l.lineId !== lineId) }
      }
      return {
        lines: state.lines.map((l) =>
          l.lineId === lineId ? { ...l, quantity: l.quantity - 1 } : l,
        ),
      }
    }),

  removeLine: (lineId) =>
    set((state) => ({
      lines: state.lines.filter((l) => l.lineId !== lineId),
    })),

  mergeGiftLines: (giftLines) =>
    set((state) => ({
      lines: [...state.lines.filter((l) => !l.isGift), ...giftLines],
    })),

  clearCart: () => set({ lines: [] }),
}))
