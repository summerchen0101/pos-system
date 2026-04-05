-- Greenfield / empty project: run this file once.
--
-- If you ALREADY have tables, use `migrate_existing_to_app_schema.sql` and
-- `migrate_promotions_admin.sql` instead of blind CREATEs.
--
-- `products.price` and promotion amounts are in minor units (e.g. cents) where applicable.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create index if not exists categories_sort_order_idx on public.categories (sort_order, name);

insert into public.categories (name, sort_order)
values
  ('Drinks', 1),
  ('Food', 2),
  ('Bakery', 3)
on conflict (name) do nothing;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  name_en text,
  description text,
  size text,
  sku text not null unique,
  price integer not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  kind text not null default 'STANDARD' check (kind in ('STANDARD', 'CUSTOM_BUNDLE'))
);

create index if not exists products_category_id_idx on public.products (category_id);

create table if not exists public.bundle_groups (
  id uuid primary key default gen_random_uuid(),
  bundle_product_id uuid not null references public.products (id) on delete cascade,
  name text not null default '選配',
  required_qty integer not null check (required_qty >= 1),
  sort_order integer not null default 0
);

create index if not exists bundle_groups_bundle_product_id_idx
  on public.bundle_groups (bundle_product_id);

create table if not exists public.bundle_group_items (
  group_id uuid not null references public.bundle_groups (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  primary key (group_id, product_id)
);

create index if not exists bundle_group_items_product_id_idx
  on public.bundle_group_items (product_id);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true
);

create table if not exists public.gift_inventory (
  gift_id uuid primary key references public.gifts (id) on delete cascade,
  stock integer not null default 0 check (stock >= 0)
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  kind text not null check (
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
  ),
  buy_qty integer,
  free_qty integer,
  discount_percent integer check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  active boolean not null default true,
  apply_mode text not null default 'AUTO' check (apply_mode in ('AUTO', 'MANUAL')),
  fixed_discount_cents integer check (fixed_discount_cents is null or fixed_discount_cents >= 1),
  gift_id uuid references public.gifts (id) on delete set null,
  threshold_amount integer check (threshold_amount is null or threshold_amount >= 1),
  max_selection_qty integer,
  constraint promotions_gift_threshold_kind check (
    (
      kind = 'GIFT_WITH_THRESHOLD'
      and gift_id is not null
      and threshold_amount is not null
    )
    or (
      kind <> 'GIFT_WITH_THRESHOLD'
      and gift_id is null
      and threshold_amount is null
    )
  ),
  constraint promotions_manual_pool_kinds check (
    kind not in ('FREE_ITEMS', 'FREE_SELECTION') or apply_mode = 'MANUAL'
  ),
  constraint promotions_max_selection_qty_by_kind check (
    (
      kind = 'FREE_SELECTION'
      and max_selection_qty is not null
      and max_selection_qty >= 1
    )
    or (
      kind <> 'FREE_SELECTION'
      and max_selection_qty is null
    )
  )
);

create table if not exists public.promotion_products (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 1),
  primary key (promotion_id, product_id)
);

create index if not exists promotion_products_product_id_idx on public.promotion_products (product_id);

create table if not exists public.promotion_selectable_items (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (promotion_id, product_id)
);

create index if not exists promotion_selectable_items_product_id_idx on public.promotion_selectable_items (product_id);

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

alter table public.categories enable row level security;
alter table public.bundle_groups enable row level security;

drop policy if exists "bundle_groups_select_anon" on public.bundle_groups;
create policy "bundle_groups_select_anon" on public.bundle_groups for select using (true);

drop policy if exists "bundle_groups_write_anon" on public.bundle_groups;
create policy "bundle_groups_write_anon" on public.bundle_groups for all using (true) with check (true);

alter table public.bundle_group_items enable row level security;

drop policy if exists "bundle_group_items_select_anon" on public.bundle_group_items;
create policy "bundle_group_items_select_anon" on public.bundle_group_items for select using (true);

drop policy if exists "bundle_group_items_write_anon" on public.bundle_group_items;
create policy "bundle_group_items_write_anon" on public.bundle_group_items for all using (true) with check (true);

alter table public.products enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_products enable row level security;
alter table public.promotion_selectable_items enable row level security;
alter table public.promotion_rules enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_inventory enable row level security;

-- Example: kiosk read + admin writes in dev (tighten in production).
drop policy if exists "categories_select_anon" on public.categories;
create policy "categories_select_anon" on public.categories for select using (true);

drop policy if exists "categories_write_anon" on public.categories;
create policy "categories_write_anon" on public.categories for all using (true) with check (true);

drop policy if exists "products_select_anon" on public.products;
create policy "products_select_anon" on public.products for select using (true);

drop policy if exists "products_write_anon" on public.products;
create policy "products_write_anon" on public.products for all using (true) with check (true);

drop policy if exists "promotions_select_anon" on public.promotions;
create policy "promotions_select_anon" on public.promotions for select using (true);

drop policy if exists "promotion_products_select_anon" on public.promotion_products;
create policy "promotion_products_select_anon" on public.promotion_products for select using (true);

-- Development / admin SPA using anon key: allow writes (replace with auth in production).
drop policy if exists "promotions_write_anon" on public.promotions;
create policy "promotions_write_anon" on public.promotions for all using (true) with check (true);

drop policy if exists "promotion_products_write_anon" on public.promotion_products;
create policy "promotion_products_write_anon" on public.promotion_products for all using (true) with check (true);

drop policy if exists "promotion_selectable_items_select_anon" on public.promotion_selectable_items;
create policy "promotion_selectable_items_select_anon" on public.promotion_selectable_items for select using (true);

drop policy if exists "promotion_selectable_items_write_anon" on public.promotion_selectable_items;
create policy "promotion_selectable_items_write_anon" on public.promotion_selectable_items for all using (true) with check (true);

drop policy if exists "promotion_rules_select_anon" on public.promotion_rules;
create policy "promotion_rules_select_anon" on public.promotion_rules for select using (true);

drop policy if exists "promotion_rules_write_anon" on public.promotion_rules;
create policy "promotion_rules_write_anon" on public.promotion_rules for all using (true) with check (true);

drop policy if exists "gifts_select_anon" on public.gifts;
create policy "gifts_select_anon" on public.gifts for select using (true);

drop policy if exists "gifts_write_anon" on public.gifts;
create policy "gifts_write_anon" on public.gifts for all using (true) with check (true);

drop policy if exists "gift_inventory_select_anon" on public.gift_inventory;
create policy "gift_inventory_select_anon" on public.gift_inventory for select using (true);

drop policy if exists "gift_inventory_write_anon" on public.gift_inventory;
create policy "gift_inventory_write_anon" on public.gift_inventory for all using (true) with check (true);

-- Order receipts (amounts in cents)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  total_amount integer not null check (total_amount >= 0),
  discount_amount integer not null check (discount_amount >= 0),
  final_amount integer not null check (final_amount >= 0),
  promotion_snapshot jsonb
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete restrict,
  product_name text not null,
  size text,
  quantity integer not null check (quantity >= 1),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  is_gift boolean not null default false,
  is_manual_free boolean not null default false,
  gift_id uuid references public.gifts (id) on delete set null,
  sort_order integer not null default 0,
  source text
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "orders_select_anon" on public.orders;
create policy "orders_select_anon" on public.orders for select using (true);

drop policy if exists "orders_insert_anon" on public.orders;
create policy "orders_insert_anon" on public.orders for insert with check (true);

drop policy if exists "order_items_select_anon" on public.order_items;
create policy "order_items_select_anon" on public.order_items for select using (true);

-- Checkout RPC: see migrate_order_items_snapshot.sql (stock deduction + line snapshot insert).
