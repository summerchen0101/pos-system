-- FREE_SELECTION: optional pool + max total gift qty (staff picks at POS).

create table if not exists public.promotion_selectable_items (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (promotion_id, product_id)
);

create index if not exists promotion_selectable_items_product_id_idx
  on public.promotion_selectable_items (product_id);

alter table public.promotion_selectable_items enable row level security;

drop policy if exists "promotion_selectable_items_select_anon" on public.promotion_selectable_items;
create policy "promotion_selectable_items_select_anon" on public.promotion_selectable_items for select using (true);

drop policy if exists "promotion_selectable_items_write_anon" on public.promotion_selectable_items;
create policy "promotion_selectable_items_write_anon" on public.promotion_selectable_items for all using (true) with check (true);

alter table public.promotions
  add column if not exists max_selection_qty integer;

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
      'FREE_SELECTION'
    )
  );

alter table public.promotions drop constraint if exists promotions_free_items_manual_only;
alter table public.promotions drop constraint if exists promotions_manual_pool_kinds;
alter table public.promotions
  add constraint promotions_manual_pool_kinds check (
    kind not in ('FREE_ITEMS', 'FREE_SELECTION') or apply_mode = 'MANUAL'
  );

alter table public.promotions drop constraint if exists promotions_max_selection_qty_by_kind;
alter table public.promotions
  add constraint promotions_max_selection_qty_by_kind check (
    (
      kind = 'FREE_SELECTION'
      and max_selection_qty is not null
      and max_selection_qty >= 1
    )
    or (
      kind <> 'FREE_SELECTION'
      and max_selection_qty is null
    )
  );
