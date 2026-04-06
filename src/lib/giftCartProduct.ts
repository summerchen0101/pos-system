import type { Product } from '../types/pos'

/** POS cart line shape for threshold gifts (no `products` row). */
export function syntheticProductForThresholdGift(g: {
  giftId: string
  displayName: string
  stock: number
}): Product {
  return {
    id: `gift-product:${g.giftId}`,
    sortOrder: 0,
    categorySortOrder: 999999,
    name: g.displayName,
    nameEn: null,
    description: null,
    size: null,
    sku: `GIFT-${g.giftId.replace(/-/g, '').slice(0, 12)}`,
    price: 0,
    stock: g.stock,
    isActive: true,
    categoryId: null,
    categoryName: null,
    kind: 'STANDARD',
    bundleGroups: [],
  }
}
