import type { CartLine } from '../types/pos'
import type { CartLineInput } from './types'

export function cartLineInputsFromPos(lines: readonly CartLine[]): CartLineInput[] {
  return lines
    .filter((line) => !line.isGift && !line.isManualFree)
    .map((line) => ({
      productId: line.product.id,
      quantity: line.quantity,
      unitPriceCents: line.product.price,
    }))
}
