-- Order history table for POS checkout + admin list.

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
