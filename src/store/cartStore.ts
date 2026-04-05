import { create } from 'zustand'
import type { CartLine, Product } from '../types/pos'

export type CartTotals = {
  subtotalCents: number
  discountCents: number
  finalCents: number
}

type CartState = {
  lines: CartLine[]
  /** Staff-selected manual promotion ids (order preserved). */
  manualPromotionIds: string[]
  addProduct: (product: Product) => void
  increment: (lineId: string) => void
  decrement: (lineId: string) => void
  removeLine: (lineId: string) => void
  mergeGiftLines: (giftLines: CartLine[]) => void
  replaceManualFreeLines: (manualLines: CartLine[]) => void
  /** Replace lines for one FREE_SELECTION promo after staff picks pool qtys. */
  applyFreeSelectionLines: (promotionId: string, newLines: CartLine[]) => void
  /** Set qty or remove line when quantity is below 1 (e.g. FREE_SELECTION adjustments). */
  updateLineQuantity: (lineId: string, quantity: number) => void
  addManualPromotion: (promotionId: string) => void
  removeManualPromotion: (promotionId: string) => void
  clearCart: () => void
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  manualPromotionIds: [],

  addProduct: (product) =>
    set((state) => {
      if (product.stock <= 0) return state
      const idx = state.lines.findIndex((l) => !l.isGift && !l.isManualFree && l.product.id === product.id)
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
        if (l.isGift || l.isManualFree) return l
        if (l.quantity >= l.product.stock) return l
        return { ...l, quantity: l.quantity + 1 }
      }),
    })),

  decrement: (lineId) =>
    set((state) => {
      const line = state.lines.find((l) => l.lineId === lineId)
      if (!line) return state
      if (line.isGift || line.isManualFree) {
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
      lines: [
        ...state.lines.filter((l) => !l.isGift && !l.isManualFree),
        ...state.lines.filter((l) => l.isManualFree),
        ...giftLines,
      ],
    })),

  replaceManualFreeLines: (manualLines) =>
    set((state) => ({
      lines: [
        ...state.lines.filter((l) => !l.isGift && !l.isManualFree),
        ...manualLines,
        ...state.lines.filter((l) => l.isGift),
      ],
    })),

  applyFreeSelectionLines: (promotionId, newLines) =>
    set((state) => ({
      manualPromotionIds: state.manualPromotionIds.includes(promotionId)
        ? state.manualPromotionIds
        : [...state.manualPromotionIds, promotionId],
      lines: [
        ...state.lines.filter((l) => !l.isGift && !l.isManualFree),
        ...state.lines.filter(
          (l) =>
            !l.isManualFree ||
            l.manualPromotionId !== promotionId ||
            !l.lineId.startsWith(`freeselection:${promotionId}:`),
        ),
        ...newLines,
        ...state.lines.filter((l) => l.isGift),
      ],
    })),

  updateLineQuantity: (lineId, quantity) =>
    set((state) => {
      if (quantity < 1) {
        return { lines: state.lines.filter((l) => l.lineId !== lineId) }
      }
      return {
        lines: state.lines.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
      }
    }),

  addManualPromotion: (promotionId) =>
    set((state) => {
      if (state.manualPromotionIds.includes(promotionId)) return state
      return { manualPromotionIds: [...state.manualPromotionIds, promotionId] }
    }),

  removeManualPromotion: (promotionId) =>
    set((state) => ({
      manualPromotionIds: state.manualPromotionIds.filter((id) => id !== promotionId),
      lines: state.lines.filter(
        (l) => !l.manualPromotionId || l.manualPromotionId !== promotionId,
      ),
    })),

  clearCart: () => set({ lines: [], manualPromotionIds: [] }),
}))
