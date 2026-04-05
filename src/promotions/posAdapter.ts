import type { CartLine } from '../types/pos'
import type { CartLineInput } from './types'

export function cartLineInputsFromPos(lines: readonly CartLine[]): CartLineInput[] {
  return lines.map((line) => ({
    productId: line.product.id,
    quantity: line.quantity,
    unitPriceCents: line.product.price,
  }))
}
