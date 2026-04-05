-- Greenfield / empty project: run this file once.
--
-- If you ALREADY have tables, use `migrate_existing_to_app_schema.sql` and
-- `migrate_promotions_admin.sql` instead of blind CREATEs.
--
-- `products.price` and promotion amounts are in minor units (e.g. cents) where applicable.

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
  kind text not null check (kind in ('BUY_X_GET_Y', 'BULK_DISCOUNT', 'SINGLE_DISCOUNT', 'TIERED')),
  buy_qty integer,
  free_qty integer,
  discount_percent integer check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  active boolean not null default true
);

create table if not exists public.promotion_products (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (promotion_id, product_id)
);

create index if not exists promotion_products_product_id_idx on public.promotion_products (product_id);

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

alter table public.products enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_products enable row level security;
alter table public.promotion_rules enable row level security;

-- Example: kiosk read-only; tighten writes in production (use auth + service role).
drop policy if exists "products_select_anon" on public.products;
create policy "products_select_anon" on public.products for select using (true);

drop policy if exists "promotions_select_anon" on public.promotions;
create policy "promotions_select_anon" on public.promotions for select using (true);

drop policy if exists "promotion_products_select_anon" on public.promotion_products;
create policy "promotion_products_select_anon" on public.promotion_products for select using (true);

-- Development / admin SPA using anon key: allow writes (replace with auth in production).
drop policy if exists "promotions_write_anon" on public.promotions;
create policy "promotions_write_anon" on public.promotions for all using (true) with check (true);

drop policy if exists "promotion_products_write_anon" on public.promotion_products;
create policy "promotion_products_write_anon" on public.promotion_products for all using (true) with check (true);

drop policy if exists "promotion_rules_select_anon" on public.promotion_rules;
create policy "promotion_rules_select_anon" on public.promotion_rules for select using (true);

drop policy if exists "promotion_rules_write_anon" on public.promotion_rules;
create policy "promotion_rules_write_anon" on public.promotion_rules for all using (true) with check (true);

-- Order receipts (amounts in cents)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  total_amount integer not null check (total_amount >= 0),
  discount_amount integer not null check (discount_amount >= 0),
  final_amount integer not null check (final_amount >= 0)
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);

alter table public.orders enable row level security;

drop policy if exists "orders_select_anon" on public.orders;
create policy "orders_select_anon" on public.orders for select using (true);

drop policy if exists "orders_insert_anon" on public.orders;
create policy "orders_insert_anon" on public.orders for insert with check (true);
