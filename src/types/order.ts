/** Order row from `public.orders` (amounts in cents). */
export type Order = {
  id: string
  createdAt: string
  totalAmountCents: number
  discountAmountCents: number
  finalAmountCents: number
}
