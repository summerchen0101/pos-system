-- Add structured promotions + junction table for existing Supabase projects.
-- Run in SQL Editor after backup.

-- Promotions: new columns (safe re-run)
alter table public.promotions add column if not exists kind text;
alter table public.promotions add column if not exists buy_qty integer;
alter table public.promotions add column if not exists free_qty integer;

-- Relax discount_percent if it was NOT NULL — allow null for BUY_X_GET_Y
alter table public.promotions alter column discount_percent drop not null;

-- Backfill kind for legacy rows
update public.promotions
set kind = 'BULK_DISCOUNT'
where kind is null;

alter table public.promotions
  alter column kind set not null;

alter table public.promotions
  drop constraint if exists promotions_kind_check;

alter table public.promotions
  add constraint promotions_kind_check check (kind in ('BUY_X_GET_Y', 'BULK_DISCOUNT', 'SINGLE_DISCOUNT', 'TIERED'));

-- Junction table
create table if not exists public.promotion_products (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (promotion_id, product_id)
);

create index if not exists promotion_products_product_id_idx on public.promotion_products (product_id);

alter table public.promotion_products enable row level security;

drop policy if exists "promotion_products_select_anon" on public.promotion_products;
create policy "promotion_products_select_anon" on public.promotion_products for select using (true);

drop policy if exists "promotion_products_write_anon" on public.promotion_products;
create policy "promotion_products_write_anon" on public.promotion_products for all using (true) with check (true);

-- Inserts/updates/deletes from the admin UI (anon key) require write access on promotions too.
alter table public.promotions enable row level security;

drop policy if exists "promotions_write_anon" on public.promotions;
create policy "promotions_write_anon" on public.promotions for all using (true) with check (true);

-- Optional: attach every legacy promotion to all products (or edit in admin instead).
-- insert into public.promotion_products (promotion_id, product_id)
-- select p.id, pr.id from public.promotions p cross join public.products pr
-- on conflict do nothing;
