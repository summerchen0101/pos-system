-- TIERED_QUANTITY_DISCOUNT: quantity ladder → single percent off eligible subtotal (`promotion_tiers`).

alter table public.promotions drop constraint if exists promotions_kind_check;

alter table public.promotions add constraint promotions_kind_check check (
  kind in (
    'BUY_X_GET_Y',
    'BULK_DISCOUNT',
    'SINGLE_DISCOUNT',
    'TIERED',
    'TIERED_QUANTITY_DISCOUNT',
    'GIFT_WITH_THRESHOLD',
    'FIXED_DISCOUNT',
    'FREE_ITEMS',
    'FREE_SELECTION'
  )
);

create table if not exists public.promotion_tiers (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  min_qty integer not null check (min_qty >= 1),
  discount_percent integer not null check (discount_percent >= 1 and discount_percent <= 100),
  sort_order integer not null default 0
);

create index if not exists promotion_tiers_promotion_id_idx on public.promotion_tiers (promotion_id);

alter table public.promotion_tiers enable row level security;

drop policy if exists "promotion_tiers_select_anon" on public.promotion_tiers;
create policy "promotion_tiers_select_anon" on public.promotion_tiers for select using (true);

drop policy if exists "promotion_tiers_write_anon" on public.promotion_tiers;
create policy "promotion_tiers_write_anon" on public.promotion_tiers for all using (true) with check (true);
