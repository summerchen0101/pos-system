-- Manual vs auto apply_mode; fixed / free-item promotion kinds.

alter table public.promotions
  add column if not exists apply_mode text not null default 'AUTO' check (apply_mode in ('AUTO', 'MANUAL'));

alter table public.promotions
  add column if not exists fixed_discount_cents integer;

alter table public.promotions drop constraint if exists promotions_kind_check;
alter table public.promotions
  add constraint promotions_kind_check check (
    kind in (
      'BUY_X_GET_Y',
      'BULK_DISCOUNT',
      'SINGLE_DISCOUNT',
      'TIERED',
      'GIFT_WITH_THRESHOLD',
      'FIXED_DISCOUNT',
      'FREE_ITEMS',
      'FREE_PRODUCT'
    )
  );

alter table public.promotions drop constraint if exists promotions_fixed_discount_nonneg;
alter table public.promotions
  add constraint promotions_fixed_discount_nonneg check (
    fixed_discount_cents is null or fixed_discount_cents >= 1
  );
