-- Per-booth out-of-stock catalog visibility (global + category overrides for POS).

alter table public.booths add column if not exists show_out_of_stock boolean not null default true;

create table if not exists public.booth_out_of_stock_category_overrides (
  booth_id uuid not null references public.booths (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (booth_id, category_id)
);

create index if not exists booth_oos_category_overrides_booth_id_idx
  on public.booth_out_of_stock_category_overrides (booth_id);

alter table public.booth_out_of_stock_category_overrides enable row level security;

drop policy if exists "booth_oos_category_overrides_admin" on public.booth_out_of_stock_category_overrides;
create policy "booth_oos_category_overrides_admin" on public.booth_out_of_stock_category_overrides
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "booth_oos_category_overrides_select_anon" on public.booth_out_of_stock_category_overrides;
create policy "booth_oos_category_overrides_select_anon" on public.booth_out_of_stock_category_overrides
  for select to anon
  using (true);

drop policy if exists "booth_oos_category_overrides_select_authenticated" on public.booth_out_of_stock_category_overrides;
create policy "booth_oos_category_overrides_select_authenticated" on public.booth_out_of_stock_category_overrides
  for select to authenticated
  using (true);
