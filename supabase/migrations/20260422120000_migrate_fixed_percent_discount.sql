-- FIXED_PERCENT_DISCOUNT: whole-order percent off (discount_percent); mirrors FIXED_DISCOUNT shape (no products).

alter table public.promotions drop constraint if exists promotions_kind_check;

alter table public.promotions add constraint promotions_kind_check check (
  kind in (
    'BUY_X_GET_Y',
    'BULK_DISCOUNT',
    'SINGLE_DISCOUNT',
    'SINGLE_FIXED_DISCOUNT',
    'TIERED',
    'TIERED_QUANTITY_DISCOUNT',
    'TIERED_QUANTITY_FIXED_DISCOUNT',
    'GIFT_WITH_THRESHOLD',
    'FIXED_DISCOUNT',
    'FIXED_PERCENT_DISCOUNT',
    'FREE_ITEMS',
    'FREE_SELECTION'
  )
);
