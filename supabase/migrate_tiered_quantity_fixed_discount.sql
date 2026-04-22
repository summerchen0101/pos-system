-- TIERED_QUANTITY_FIXED_DISCOUNT: quantity ladder → fixed amount off eligible subtotal (`promotion_tiers`).

alter table public.promotions drop constraint if exists promotions_kind_check;

alter table public.promotions add constraint promotions_kind_check check (
  kind in (
    'BUY_X_GET_Y',
    'BULK_DISCOUNT',
    'SINGLE_DISCOUNT',
    'TIERED',
    'TIERED_QUANTITY_DISCOUNT',
    'TIERED_QUANTITY_FIXED_DISCOUNT',
    'GIFT_WITH_THRESHOLD',
    'FIXED_DISCOUNT',
    'FREE_ITEMS',
    'FREE_SELECTION'
  )
);

alter table public.promotion_tiers add column if not exists discount_amount_cents integer;

alter table public.promotion_tiers drop constraint if exists promotion_tiers_discount_percent_check;

alter table public.promotion_tiers alter column discount_percent drop not null;

alter table public.promotion_tiers drop constraint if exists promotion_tiers_discount_xor;

alter table public.promotion_tiers add constraint promotion_tiers_discount_xor check (
  (
    discount_percent is not null
    and discount_amount_cents is null
    and discount_percent >= 1
    and discount_percent <= 100
  )
  or (
    discount_percent is null
    and discount_amount_cents is not null
    and discount_amount_cents >= 1
  )
);
