-- Greenfield / empty project: run this file once.
--
-- If you ALREADY have `products` / `promotions` tables, do NOT run the CREATE
-- statements blindly — use `migrate_existing_to_app_schema.sql` in the SQL
-- Editor instead (adds/renames columns to match the app).
--
-- `price` is stored in minor units (e.g. cents).

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  description text,
  size text,
  sku text not null unique,
  price integer not null check (price >= 0),
  is_active boolean not null default true
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  discount_percent integer not null check (discount_percent >= 0 and discount_percent <= 100),
  active boolean not null default true
);

alter table public.products enable row level security;
alter table public.promotions enable row level security;

-- Example: allow anonymous read for POS kiosk (tighten for production).
create policy "products_select_anon" on public.products for select using (true);
create policy "promotions_select_anon" on public.promotions for select using (true);
