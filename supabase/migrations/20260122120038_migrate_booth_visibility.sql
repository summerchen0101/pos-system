-- Per-booth category/product visibility for POS. Run after booths / categories / products exist.

create table if not exists public.booth_hidden_categories (
  booth_id uuid not null references public.booths (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (booth_id, category_id)
);

create index if not exists booth_hidden_categories_booth_id_idx on public.booth_hidden_categories (booth_id);

create table if not exists public.booth_hidden_products (
  booth_id uuid not null references public.booths (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (booth_id, product_id)
);

create index if not exists booth_hidden_products_booth_id_idx on public.booth_hidden_products (booth_id);

alter table public.booth_hidden_categories enable row level security;
alter table public.booth_hidden_products enable row level security;

-- ADMIN: full access
drop policy if exists "booth_hidden_categories_admin" on public.booth_hidden_categories;
create policy "booth_hidden_categories_admin" on public.booth_hidden_categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "booth_hidden_products_admin" on public.booth_hidden_products;
create policy "booth_hidden_products_admin" on public.booth_hidden_products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- POS / catalog: read hidden sets (anon + authenticated; logged-in staff uses JWT)
drop policy if exists "booth_hidden_categories_select_anon" on public.booth_hidden_categories;
create policy "booth_hidden_categories_select_anon" on public.booth_hidden_categories
  for select to anon
  using (true);

drop policy if exists "booth_hidden_categories_select_authenticated" on public.booth_hidden_categories;
create policy "booth_hidden_categories_select_authenticated" on public.booth_hidden_categories
  for select to authenticated
  using (true);

drop policy if exists "booth_hidden_products_select_anon" on public.booth_hidden_products;
create policy "booth_hidden_products_select_anon" on public.booth_hidden_products
  for select to anon
  using (true);

drop policy if exists "booth_hidden_products_select_authenticated" on public.booth_hidden_products;
create policy "booth_hidden_products_select_authenticated" on public.booth_hidden_products
  for select to authenticated
  using (true);
