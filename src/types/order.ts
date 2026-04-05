/** Order row from `public.orders` (amounts in TWD minor units). */
export type Order = {
  id: string
  createdAt: string
  totalAmountCents: number
  discountAmountCents: number
  finalAmountCents: number
}
