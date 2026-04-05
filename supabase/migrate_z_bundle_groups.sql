-- Run after migrate_bundle_selectable_items.sql when upgrading.
-- Grouped bundles: bundle_groups + bundle_group_items; drops bundle_selectable_items + products.bundle_total_qty.

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

do $mig$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'bundle_selectable_items'
  ) then
    insert into public.bundle_groups (bundle_product_id, name, required_qty, sort_order)
    select distinct on (bsi.bundle_product_id)
      bsi.bundle_product_id,
      '選配',
      coalesce(p.bundle_total_qty, 1),
      0
    from public.bundle_selectable_items bsi
    inner join public.products p on p.id = bsi.bundle_product_id and p.kind = 'CUSTOM_BUNDLE'
    order by bsi.bundle_product_id;

    insert into public.bundle_group_items (group_id, product_id)
    select bg.id, bsi.product_id
    from public.bundle_selectable_items bsi
    inner join public.bundle_groups bg
      on bg.bundle_product_id = bsi.bundle_product_id and bg.sort_order = 0 and bg.name = '選配';

    drop policy if exists "bundle_selectable_items_select_anon" on public.bundle_selectable_items;
    drop policy if exists "bundle_selectable_items_write_anon" on public.bundle_selectable_items;
    drop table public.bundle_selectable_items;
  end if;
end
$mig$;

alter table public.products drop constraint if exists products_bundle_total_qty_by_kind;

alter table public.products drop column if exists bundle_total_qty;

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
