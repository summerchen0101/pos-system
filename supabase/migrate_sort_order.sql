-- Global catalog sort: categories.sort_order + products.sort_order (per category).
-- RLS: sort_order is part of categories/products rows; existing admin write / anon SELECT policies apply.

alter table public.categories add column if not exists sort_order integer not null default 0;

alter table public.products add column if not exists sort_order integer not null default 0;

create index if not exists products_category_id_sort_order_idx
  on public.products (category_id, sort_order);

-- Stable category sequence (preserve relative order, then normalize to 1..n)
with ordered as (
  select id, row_number() over (order by sort_order, name, id) as rn
  from public.categories
)
update public.categories c
set sort_order = ordered.rn
from ordered
where c.id = ordered.id;

-- Per-category product order (uncategorized: category_id is null in one partition)
with ordered as (
  select
    id,
    row_number() over (
      partition by category_id
      order by name asc, sku asc, id asc
    ) as rn
  from public.products
)
update public.products p
set sort_order = ordered.rn
from ordered
where p.id = ordered.id;
