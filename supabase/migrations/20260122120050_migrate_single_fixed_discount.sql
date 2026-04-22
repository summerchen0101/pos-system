-- SINGLE_FIXED_DISCOUNT: per eligible line fixed amount off line subtotal (capped).

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
    'FREE_ITEMS',
    'FREE_SELECTION'
  )
);
