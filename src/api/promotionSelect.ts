/** Nested gift for `GIFT_WITH_THRESHOLD` (PostgREST embed). */
const giftEmbed = `
  id,
  name,
  is_active,
  gift_inventory ( stock )
`

/** Shared select for POS and admin promotion lists. */
export const PROMOTION_LIST_SELECT = `
  id,
  group_id,
  promotion_booths!inner ( booth_id, booths ( id, name, location ) ),
  promotion_groups!promotions_group_id_fkey ( id, name, behavior ),
  code,
  name,
  kind,
  buy_qty,
  free_qty,
  bogo_single_deal_only,
  discount_percent,
  active,
  apply_mode,
  fixed_discount_cents,
  gift_id,
  threshold_amount,
  max_selection_qty,
  promotion_products ( product_id, quantity ),
  promotion_selectable_items ( product_id ),
  promotion_rules ( id, min_qty, free_qty, discount_percent, sort_order ),
  promotion_tiers ( id, min_qty, discount_percent, discount_amount_cents, sort_order ),
  gifts!promotions_gift_id_fkey (
    ${giftEmbed}
  )
`
