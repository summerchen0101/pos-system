-- Replace product_bundle_options with bundle_selectable_items (product_id + qty + sort_order).

create table if not exists public.bundle_selectable_items (
  bundle_product_id uuid not null references public.products (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  qty integer not null check (qty >= 1),
  sort_order integer not null default 0,
  primary key (bundle_product_id, product_id),
  constraint bundle_selectable_items_not_self check (bundle_product_id <> product_id)
);

create index if not exists bundle_selectable_items_product_id_idx
  on public.bundle_selectable_items (product_id);

do $mig$
begin
  if to_regclass('public.product_bundle_options') is not null then
    insert into public.bundle_selectable_items (bundle_product_id, product_id, qty, sort_order)
    select bundle_product_id, component_product_id, quantity, 0
    from public.product_bundle_options
    on conflict (bundle_product_id, product_id) do nothing;
    execute 'drop policy if exists "product_bundle_options_select_anon" on public.product_bundle_options';
    execute 'drop policy if exists "product_bundle_options_write_anon" on public.product_bundle_options';
    execute 'drop table public.product_bundle_options';
  end if;
end
$mig$;

alter table public.bundle_selectable_items enable row level security;

drop policy if exists "bundle_selectable_items_select_anon" on public.bundle_selectable_items;
create policy "bundle_selectable_items_select_anon"
  on public.bundle_selectable_items for select using (true);

drop policy if exists "bundle_selectable_items_write_anon" on public.bundle_selectable_items;
create policy "bundle_selectable_items_write_anon"
  on public.bundle_selectable_items for all using (true) with check (true);
