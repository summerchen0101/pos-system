-- Tiered promotions: `promotion_rules` + `TIERED` kind. Safe to re-run with guards.

create table if not exists public.promotion_rules (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  min_qty integer not null check (min_qty >= 1),
  free_qty integer,
  discount_percent integer,
  sort_order integer not null default 0,
  constraint promotion_rules_reward_exclusive check (
    (
      free_qty is not null
      and free_qty >= 1
      and discount_percent is null
    )
    or (
      discount_percent is not null
      and discount_percent >= 1
      and discount_percent <= 100
      and free_qty is null
    )
  )
);

create index if not exists promotion_rules_promotion_id_idx on public.promotion_rules (promotion_id);

alter table public.promotions drop constraint if exists promotions_kind_check;
alter table public.promotions
  add constraint promotions_kind_check check (
    kind in ('BUY_X_GET_Y', 'BULK_DISCOUNT', 'SINGLE_DISCOUNT', 'TIERED')
  );

alter table public.promotion_rules enable row level security;

drop policy if exists "promotion_rules_select_anon" on public.promotion_rules;
create policy "promotion_rules_select_anon" on public.promotion_rules for select using (true);

drop policy if exists "promotion_rules_write_anon" on public.promotion_rules;
create policy "promotion_rules_write_anon" on public.promotion_rules for all using (true) with check (true);
