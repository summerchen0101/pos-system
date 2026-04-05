-- Categories + optional product.category_id. Safe to re-run parts.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

alter table public.categories add column if not exists is_active boolean not null default true;

create index if not exists categories_sort_order_idx on public.categories (sort_order, name);

alter table public.categories enable row level security;

drop policy if exists "categories_select_anon" on public.categories;
create policy "categories_select_anon" on public.categories for select using (true);

drop policy if exists "categories_write_anon" on public.categories;
create policy "categories_write_anon" on public.categories for all using (true) with check (true);

alter table public.products add column if not exists category_id uuid references public.categories (id) on delete set null;

create index if not exists products_category_id_idx on public.products (category_id);

-- Product writes for admin SPA (dev)
drop policy if exists "products_write_anon" on public.products;
create policy "products_write_anon" on public.products for all using (true) with check (true);

insert into public.categories (name, sort_order)
values
  ('Drinks', 1),
  ('Food', 2),
  ('Bakery', 3)
on conflict (name) do nothing;
