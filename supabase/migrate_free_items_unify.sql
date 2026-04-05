-- Unify FREE_PRODUCT into FREE_ITEMS; per-product gift quantities on promotion_products.

alter table public.promotion_products
  add column if not exists quantity integer not null default 1 check (quantity >= 1);

-- Backfill junction qty from legacy promotions.free_qty (same qty per linked product).
update public.promotion_products pp
set quantity = greatest(1, coalesce(p.free_qty, 1))
from public.promotions p
where p.id = pp.promotion_id
  and p.kind in ('FREE_ITEMS', 'FREE_PRODUCT')
  and coalesce(p.free_qty, 0) >= 1;

update public.promotions
set kind = 'FREE_ITEMS',
    apply_mode = 'MANUAL'
where kind = 'FREE_PRODUCT';

update public.promotions
set apply_mode = 'MANUAL'
where kind = 'FREE_ITEMS';

update public.promotions
set free_qty = null
where kind = 'FREE_ITEMS';

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
      'FREE_ITEMS'
    )
  );

alter table public.promotions drop constraint if exists promotions_free_items_manual_only;
alter table public.promotions
  add constraint promotions_free_items_manual_only check (
    kind <> 'FREE_ITEMS' or apply_mode = 'MANUAL'
  );
