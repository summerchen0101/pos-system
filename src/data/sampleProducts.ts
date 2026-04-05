import type { Product } from '../types/pos'

export const SAMPLE_PRODUCTS: Product[] = [
  { id: 'latte', name: 'Latte', priceCents: 450, category: 'Drinks' },
  { id: 'cappuccino', name: 'Cappuccino', priceCents: 450, category: 'Drinks' },
  { id: 'americano', name: 'Americano', priceCents: 350, category: 'Drinks' },
  { id: 'croissant', name: 'Butter Croissant', priceCents: 380, category: 'Bakery' },
  { id: 'muffin', name: 'Blueberry Muffin', priceCents: 320, category: 'Bakery' },
  { id: 'sandwich', name: 'Turkey Sandwich', priceCents: 899, category: 'Food' },
  { id: 'salad', name: 'Garden Salad', priceCents: 750, category: 'Food' },
  { id: 'cookie', name: 'Chocolate Cookie', priceCents: 250, category: 'Bakery' },
  { id: 'water', name: 'Still Water', priceCents: 200, category: 'Drinks' },
  { id: 'juice', name: 'Orange Juice', priceCents: 400, category: 'Drinks' },
]
