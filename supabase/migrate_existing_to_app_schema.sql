-- =============================================================================
-- Migrate EXISTING Supabase tables to match the app (products + promotions).
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
--
-- Safe to re-run in most cases (uses IF NOT EXISTS / guards). Review sections
-- marked OPTIONAL before running (e.g. dropping `category`).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------------------

-- New display / catalog columns
alter table public.products add column if not exists name_en text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists size text;
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists is_active boolean default true;

-- Rename legacy price_cents → price (minor units, e.g. cents)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price_cents'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price'
  ) then
    alter table public.products rename column price_cents to price;
  end if;
end $$;

-- If you never had price_cents but also have no `price` yet, add it:
alter table public.products add column if not exists price integer;

-- Backfill sku (required by app): use existing sku, else fall back to id text
update public.products
set sku = coalesce(nullif(trim(sku), ''), id::text)
where sku is null or trim(sku) = '';

-- Enforce sku present and unique (after backfill)
alter table public.products alter column sku set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_sku_key'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products add constraint products_sku_key unique (sku);
  end if;
end $$;

-- is_active: not null + default
update public.products set is_active = true where is_active is null;
alter table public.products alter column is_active set default true;
alter table public.products alter column is_active set not null;

-- Price integrity (add check if missing)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_price_non_negative'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_price_non_negative check (price >= 0);
  end if;
end $$;

-- Require price when every row has a value (skip if column missing or nulls remain)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price'
  )
  and not exists (select 1 from public.products where price is null) then
    alter table public.products alter column price set not null;
  end if;
end $$;

-- OPTIONAL: remove old column if you no longer use it
-- alter table public.products drop column if exists category;

-- ---------------------------------------------------------------------------
-- PROMOTIONS (only if your column names differ from the app)
-- ---------------------------------------------------------------------------
-- App expects: id, code, name, discount_percent, active
-- Add any missing pieces without destroying data:

alter table public.promotions add column if not exists code text;
alter table public.promotions add column if not exists name text;
alter table public.promotions add column if not exists discount_percent integer;
alter table public.promotions add column if not exists active boolean default true;

-- If you used singular `discount` or `percent`, rename once (pick the branch that matches YOUR DB):
-- alter table public.promotions rename column discount to discount_percent;

update public.promotions set active = coalesce(active, true) where active is null;
alter table public.promotions alter column active set default true;

-- If new columns are null on old rows, backfill before tightening NOT NULL, e.g.:
-- update public.promotions set name = coalesce(name, code, 'Promotion') where name is null;
-- update public.promotions set discount_percent = coalesce(discount_percent, 0) where discount_percent is null;

-- ---------------------------------------------------------------------------
-- RLS / policies (only if policies are missing)
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.promotions enable row level security;

drop policy if exists "products_select_anon" on public.products;
create policy "products_select_anon" on public.products for select using (true);

drop policy if exists "promotions_select_anon" on public.promotions;
create policy "promotions_select_anon" on public.promotions for select using (true);

-- Admin SPA (anon key): allow creating/updating/deleting promotions. Replace with auth in production.
drop policy if exists "promotions_write_anon" on public.promotions;
create policy "promotions_write_anon" on public.promotions for all using (true) with check (true);
