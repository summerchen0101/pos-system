-- Product kind STANDARD | CUSTOM_BUNDLE; bundle options + total selectable qty.

alter table public.products
  add column if not exists kind text not null default 'STANDARD'
    check (kind in ('STANDARD', 'CUSTOM_BUNDLE'));

alter table public.products
  add column if not exists bundle_total_qty integer;

alter table public.products drop constraint if exists products_bundle_total_qty_by_kind;

alter table public.products
  add constraint products_bundle_total_qty_by_kind check (
    (
      kind = 'CUSTOM_BUNDLE'
      and bundle_total_qty is not null
      and bundle_total_qty >= 1
    )
    or (
      kind = 'STANDARD'
      and bundle_total_qty is null
    )
  );

create table if not exists public.product_bundle_options (
  bundle_product_id uuid not null references public.products (id) on delete cascade,
  component_product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null check (quantity >= 1),
  primary key (bundle_product_id, component_product_id),
  constraint product_bundle_options_not_self check (bundle_product_id <> component_product_id)
);

create index if not exists product_bundle_options_component_idx
  on public.product_bundle_options (component_product_id);

alter table public.product_bundle_options enable row level security;

drop policy if exists "product_bundle_options_select_anon" on public.product_bundle_options;
create policy "product_bundle_options_select_anon"
  on public.product_bundle_options for select using (true);

drop policy if exists "product_bundle_options_write_anon" on public.product_bundle_options;
create policy "product_bundle_options_write_anon"
  on public.product_bundle_options for all using (true) with check (true);
