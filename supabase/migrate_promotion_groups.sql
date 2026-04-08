-- Promotion groups: stacking rules among AUTO cart discounts (see `selectAutoPromotionStack`).
-- Safe re-run: IF NOT EXISTS where applicable.

create table if not exists public.promotion_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  behavior text not null default 'stackable'
    check (behavior in ('exclusive', 'stackable', 'best_only')),
  note text,
  created_at timestamptz default now()
);

alter table public.promotions
  add column if not exists group_id uuid references public.promotion_groups (id) on delete set null;

create index if not exists promotions_group_id_idx on public.promotions (group_id);

alter table public.promotion_groups enable row level security;

drop policy if exists "promotion_groups_select_anon" on public.promotion_groups;
create policy "promotion_groups_select_anon" on public.promotion_groups
  for select
  to anon
  using (true);

drop policy if exists "promotion_groups_select_authenticated" on public.promotion_groups;
create policy "promotion_groups_select_authenticated" on public.promotion_groups
  for select
  to authenticated
  using (true);

drop policy if exists "promotion_groups_write_authenticated" on public.promotion_groups;
create policy "promotion_groups_write_authenticated" on public.promotion_groups
  for all
  to authenticated
  using (true)
  with check (true);
