-- Warehouse inventory + per-booth stock. Run after migrate_order_staff.sql (needs checkout signature).
-- POS: checkout deducts from inventory when booths.warehouse_id is set.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('warehouse', 'booth')),
  booth_id uuid references public.booths (id) on delete set null,
  note text,
  created_at timestamptz default now()
);

create index if not exists warehouses_booth_id_idx on public.warehouses (booth_id);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  stock integer not null default 0 check (stock >= 0),
  unique (warehouse_id, product_id)
);

create index if not exists inventory_warehouse_id_idx on public.inventory (warehouse_id);
create index if not exists inventory_product_id_idx on public.inventory (product_id);

create table if not exists public.inventory_logs (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid references public.warehouses (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  type text not null check (type in ('in', 'out', 'transfer_in', 'transfer_out', 'adjust')),
  quantity integer not null check (quantity > 0),
  note text,
  related_order_id uuid references public.orders (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists inventory_logs_warehouse_id_idx on public.inventory_logs (warehouse_id);
create index if not exists inventory_logs_created_at_idx on public.inventory_logs (created_at desc);

alter table public.booths
  add column if not exists warehouse_id uuid references public.warehouses (id) on delete set null;

create index if not exists booths_warehouse_id_idx on public.booths (warehouse_id);

-- ---------------------------------------------------------------------------
-- Backfill: booth warehouses + inventory from products.stock
-- ---------------------------------------------------------------------------

insert into public.warehouses (name, type, booth_id, note)
select
  b.name || '（攤位倉）',
  'booth'::text,
  b.id,
  'auto backfill'
from public.booths b
where not exists (
  select 1 from public.warehouses w where w.booth_id = b.id and w.type = 'booth'
);

update public.booths b
set warehouse_id = w.id
from public.warehouses w
where w.booth_id = b.id
  and w.type = 'booth'
  and b.warehouse_id is null;

insert into public.inventory (warehouse_id, product_id, stock)
select w.id, p.id, greatest(0, p.stock)
from public.warehouses w
cross join public.products p
where w.type = 'booth'
  and w.booth_id is not null
on conflict (warehouse_id, product_id) do update
set stock = greatest(public.inventory.stock, excluded.stock);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.warehouses enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_logs enable row level security;

-- ADMIN full access
drop policy if exists "warehouses_all_admin" on public.warehouses;
create policy "warehouses_all_admin" on public.warehouses
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "inventory_all_admin" on public.inventory;
create policy "inventory_all_admin" on public.inventory
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "inventory_logs_all_admin" on public.inventory_logs;
create policy "inventory_logs_all_admin" on public.inventory_logs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- MANAGER / STAFF: read warehouses linked to their booths + standalone warehouses (?)
-- Read inventory for warehouses attached to booths they can access, or any warehouse (for POS we use RPC)
drop policy if exists "warehouses_select_staff" on public.warehouses;
create policy "warehouses_select_staff" on public.warehouses
  for select to authenticated
  using (
    not public.is_admin()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('MANAGER', 'STAFF'))
    and (
      booth_id is null
      or booth_id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "inventory_select_staff" on public.inventory;
create policy "inventory_select_staff" on public.inventory
  for select to authenticated
  using (
    not public.is_admin()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('MANAGER', 'STAFF'))
    and exists (
      select 1 from public.booths b
      where b.warehouse_id = inventory.warehouse_id
        and b.id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "inventory_logs_select_staff" on public.inventory_logs;
create policy "inventory_logs_select_staff" on public.inventory_logs
  for select to authenticated
  using (
    not public.is_admin()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('MANAGER', 'STAFF'))
    and exists (
      select 1 from public.booths b
      where b.warehouse_id = inventory_logs.warehouse_id
        and b.id in (select public.current_user_booth_ids())
    )
  );

-- Anon: no direct table read; use RPC below

-- ---------------------------------------------------------------------------
-- POS: stock for booth (anon)
-- ---------------------------------------------------------------------------

create or replace function public.pos_inventory_stocks_for_booth(p_booth_id uuid)
returns table (product_id uuid, stock integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.id as product_id, coalesce(i.stock, 0)::integer as stock
  from public.products p
  cross join public.booths b
  left join public.inventory i
    on i.warehouse_id = b.warehouse_id and i.product_id = p.id
  where b.id = p_booth_id
    and b.warehouse_id is not null
    and p.is_active = true
    and p.kind in ('STANDARD', 'CUSTOM_BUNDLE')
  union all
  select p2.id as product_id, p2.stock::integer as stock
  from public.products p2
  cross join public.booths b2
  where b2.id = p_booth_id
    and b2.warehouse_id is null
    and p2.is_active = true
    and p2.kind in ('STANDARD', 'CUSTOM_BUNDLE');
$$;

grant execute on function public.pos_inventory_stocks_for_booth(uuid) to anon;
grant execute on function public.pos_inventory_stocks_for_booth(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: stock adjustment (ADMIN only, security definer)
-- ---------------------------------------------------------------------------

create or replace function public.inventory_apply_adjustment(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_delta integer,
  p_log_type text,
  p_note text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_log_type not in ('in', 'out', 'adjust') then
    raise exception 'invalid_log_type';
  end if;
  if p_delta = 0 then
    return 0;
  end if;

  insert into public.inventory (warehouse_id, product_id, stock)
  values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;

  update public.inventory
  set stock = stock + p_delta
  where warehouse_id = p_warehouse_id and product_id = p_product_id
  returning stock into v_new;

  if v_new is null or v_new < 0 then
    raise exception 'insufficient_stock';
  end if;

  insert into public.inventory_logs (
    warehouse_id, product_id, type, quantity, note, created_by
  )
  values (
    p_warehouse_id,
    p_product_id,
    p_log_type,
    abs(p_delta),
    p_note,
    auth.uid()
  );

  return v_new;
end;
$$;

grant execute on function public.inventory_apply_adjustment(uuid, uuid, integer, text, text) to authenticated;

create or replace function public.inventory_transfer(
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := coalesce(nullif(trim(p_note), ''), '調貨');
  v_upd int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_quantity < 1 then
    raise exception 'invalid_quantity';
  end if;
  if p_from_warehouse_id = p_to_warehouse_id then
    raise exception 'same_warehouse';
  end if;

  insert into public.inventory (warehouse_id, product_id, stock)
  values (p_from_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;
  insert into public.inventory (warehouse_id, product_id, stock)
  values (p_to_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;

  update public.inventory
  set stock = stock - p_quantity
  where warehouse_id = p_from_warehouse_id and product_id = p_product_id and stock >= p_quantity;
  get diagnostics v_upd = row_count;
  if v_upd = 0 then
    raise exception 'insufficient_stock';
  end if;

  update public.inventory
  set stock = stock + p_quantity
  where warehouse_id = p_to_warehouse_id and product_id = p_product_id;

  insert into public.inventory_logs (
    warehouse_id, product_id, type, quantity, note, created_by
  )
  values (
    p_from_warehouse_id,
    p_product_id,
    'transfer_out',
    p_quantity,
    v_note,
    auth.uid()
  );

  insert into public.inventory_logs (
    warehouse_id, product_id, type, quantity, note, created_by
  )
  values (
    p_to_warehouse_id,
    p_product_id,
    'transfer_in',
    p_quantity,
    v_note,
    auth.uid()
  );
end;
$$;

grant execute on function public.inventory_transfer(uuid, uuid, uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Checkout: validate stock first, insert order, then deduct + log (inventory or products.stock)
-- ---------------------------------------------------------------------------

drop function if exists public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid, uuid, text[], text[]);

create or replace function public.checkout_order_deduct_stock(
  p_total_amount integer,
  p_discount_amount integer,
  p_final_amount integer,
  p_lines jsonb,
  p_promotion_snapshot jsonb default null,
  p_booth_id uuid default '00000000-0000-0000-0000-000000000001'::uuid,
  p_user_id uuid default null,
  p_scheduled_staff text[] default '{}'::text[],
  p_clocked_in_staff text[] default '{}'::text[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  line jsonb;
  v_pid uuid;
  v_gift_id uuid;
  v_qty int;
  v_updated int;
  v_unit int;
  v_name text;
  v_size text;
  v_is_gift boolean;
  v_is_manual_free boolean;
  v_source text;
  i int := 0;
  n int;
  v_uid uuid;
  v_wh_id uuid;
begin
  v_uid := coalesce(p_user_id, auth.uid());

  if p_booth_id is null then
    raise exception 'booth_required';
  end if;

  if not exists (select 1 from public.booths b where b.id = p_booth_id) then
    raise exception 'invalid_booth_id';
  end if;

  select b.warehouse_id into v_wh_id from public.booths b where b.id = p_booth_id;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty_cart';
  end if;

  n := jsonb_array_length(p_lines);

  while i < n loop
    line := p_lines->i;
    v_qty := (line->>'quantity')::int;
    if v_qty < 1 then
      raise exception 'invalid_quantity';
    end if;

    if line ? 'gift_id' and length(trim(coalesce(line->>'gift_id', ''))) > 0 then
      v_gift_id := (line->>'gift_id')::uuid;
      update public.gift_inventory
        set stock = stock - v_qty
        where gift_id = v_gift_id and stock >= v_qty;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'insufficient_stock';
      end if;
    else
      if not (line ? 'product_id') or length(trim(coalesce(line->>'product_id', ''))) = 0 then
        raise exception 'missing_product_id';
      end if;
      v_pid := (line->>'product_id')::uuid;
      if v_wh_id is not null then
        if not exists (
          select 1 from public.inventory inv
          where inv.warehouse_id = v_wh_id
            and inv.product_id = v_pid
            and inv.stock >= v_qty
        ) then
          raise exception 'insufficient_stock';
        end if;
      else
        if not exists (
          select 1 from public.products p where p.id = v_pid and p.stock >= v_qty
        ) then
          raise exception 'insufficient_stock';
        end if;
      end if;
    end if;

    i := i + 1;
  end loop;

  if p_promotion_snapshot is not null and jsonb_typeof(p_promotion_snapshot) = 'object' then
    declare
      v_snap jsonb := p_promotion_snapshot;
      v_raw text;
      v_base uuid;
      v_elem jsonb;
    begin
      v_raw := v_snap->>'autoPromotionId';
      if v_raw is not null and btrim(v_raw) <> '' then
        begin
          v_base := split_part(btrim(v_raw), '~', 1)::uuid;
        exception when invalid_text_representation then
          raise exception 'invalid_promotion_id';
        end;
        if not exists (
          select 1 from public.promotion_booths pb
          where pb.promotion_id = v_base and pb.booth_id = p_booth_id
        ) then
          raise exception 'promotion_not_allowed_for_booth';
        end if;
      end if;

      for v_elem in select * from jsonb_array_elements(coalesce(v_snap->'manualPromotionDetails', '[]'::jsonb))
      loop
        v_raw := v_elem->>'promotionId';
        if v_raw is not null and btrim(v_raw) <> '' then
          begin
            v_base := split_part(btrim(v_raw), '~', 1)::uuid;
          exception when invalid_text_representation then
            raise exception 'invalid_promotion_id';
          end;
          if not exists (
            select 1 from public.promotion_booths pb
            where pb.promotion_id = v_base and pb.booth_id = p_booth_id
          ) then
            raise exception 'promotion_not_allowed_for_booth';
          end if;
        end if;
      end loop;

      for v_elem in select * from jsonb_array_elements(coalesce(v_snap->'promotions', '[]'::jsonb))
      loop
        v_raw := v_elem->>'promotionId';
        if v_raw is not null and btrim(v_raw) <> '' then
          begin
            v_base := split_part(btrim(v_raw), '~', 1)::uuid;
          exception when invalid_text_representation then
            raise exception 'invalid_promotion_id';
          end;
          if not exists (
            select 1 from public.promotion_booths pb
            where pb.promotion_id = v_base and pb.booth_id = p_booth_id
          ) then
            raise exception 'promotion_not_allowed_for_booth';
          end if;
        end if;
      end loop;
    end;
  end if;

  insert into public.orders (
    total_amount,
    discount_amount,
    final_amount,
    promotion_snapshot,
    booth_id,
    user_id,
    scheduled_staff,
    clocked_in_staff
  )
  values (
    p_total_amount,
    p_discount_amount,
    p_final_amount,
    p_promotion_snapshot,
    p_booth_id,
    v_uid,
    coalesce(p_scheduled_staff, '{}'),
    coalesce(p_clocked_in_staff, '{}')
  )
  returning id into v_order_id;

  i := 0;
  while i < n loop
    line := p_lines->i;
    v_qty := (line->>'quantity')::int;
    v_gift_id := null;
    if line ? 'gift_id' and length(trim(coalesce(line->>'gift_id', ''))) > 0 then
      v_gift_id := (line->>'gift_id')::uuid;
    end if;

    if v_gift_id is not null then
      v_pid := null;
    else
      if not (line ? 'product_id') or length(trim(coalesce(line->>'product_id', ''))) = 0 then
        raise exception 'missing_product_id';
      end if;
      v_pid := (line->>'product_id')::uuid;
    end if;

    v_unit := coalesce(nullif(line->>'unit_price_cents', '')::int, 0);
    v_name := coalesce(nullif(trim(line->>'product_name'), ''), '(商品)');
    v_size := nullif(trim(line->>'size'), '');
    v_is_gift := coalesce((line->>'is_gift')::text = 'true', false);
    v_is_manual_free := coalesce((line->>'is_manual_free')::text = 'true', false);
    v_source := nullif(trim(coalesce(line->>'source', '')), '');

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      size,
      quantity,
      unit_price_cents,
      line_total_cents,
      is_gift,
      is_manual_free,
      gift_id,
      sort_order,
      source
    )
    values (
      v_order_id,
      v_pid,
      v_name,
      v_size,
      v_qty,
      v_unit,
      v_unit * v_qty,
      v_is_gift,
      v_is_manual_free,
      v_gift_id,
      i + 1,
      v_source
    );

    i := i + 1;
  end loop;

  i := 0;
  while i < n loop
    line := p_lines->i;
    v_qty := (line->>'quantity')::int;
    if line ? 'gift_id' and length(trim(coalesce(line->>'gift_id', ''))) > 0 then
      null;
    else
      v_pid := (line->>'product_id')::uuid;
      if v_wh_id is not null then
        update public.inventory
        set stock = stock - v_qty
        where warehouse_id = v_wh_id and product_id = v_pid and stock >= v_qty;
        get diagnostics v_updated = row_count;
        if v_updated = 0 then
          raise exception 'insufficient_stock';
        end if;
        insert into public.inventory_logs (
          warehouse_id,
          product_id,
          type,
          quantity,
          note,
          related_order_id,
          created_by
        )
        values (
          v_wh_id,
          v_pid,
          'out',
          v_qty,
          'POS',
          v_order_id,
          v_uid
        );
      else
        update public.products
        set stock = stock - v_qty
        where id = v_pid and stock >= v_qty;
        get diagnostics v_updated = row_count;
        if v_updated = 0 then
          raise exception 'insufficient_stock';
        end if;
      end if;
    end if;
    i := i + 1;
  end loop;

  return v_order_id;
end;
$$;

grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid, uuid, text[], text[]) to anon;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid, uuid, text[], text[]) to authenticated;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid, uuid, text[], text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Stocktake (盤點)
-- ---------------------------------------------------------------------------

create table if not exists public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  note text,
  created_by uuid references public.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists stocktakes_warehouse_id_idx on public.stocktakes (warehouse_id);
create index if not exists stocktakes_created_at_idx on public.stocktakes (created_at desc);

create unique index if not exists stocktakes_one_draft_per_warehouse_idx
  on public.stocktakes (warehouse_id)
  where status = 'draft';

create table if not exists public.stocktake_items (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references public.stocktakes (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  system_stock integer not null,
  actual_stock integer,
  difference integer,
  reason text,
  unique (stocktake_id, product_id)
);

create index if not exists stocktake_items_stocktake_id_idx on public.stocktake_items (stocktake_id);

alter table public.stocktakes enable row level security;
alter table public.stocktake_items enable row level security;

drop policy if exists "stocktakes_all_admin" on public.stocktakes;
create policy "stocktakes_all_admin" on public.stocktakes
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "stocktakes_select_manager" on public.stocktakes;
create policy "stocktakes_select_manager" on public.stocktakes
  for select to authenticated
  using (public.is_manager() and not public.is_admin());

drop policy if exists "stocktake_items_all_admin" on public.stocktake_items;
create policy "stocktake_items_all_admin" on public.stocktake_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "stocktake_items_select_manager" on public.stocktake_items;
create policy "stocktake_items_select_manager" on public.stocktake_items
  for select to authenticated
  using (
    public.is_manager()
    and not public.is_admin()
    and exists (
      select 1 from public.stocktakes s
      where s.id = stocktake_items.stocktake_id
    )
  );

-- ADMIN: create draft + snapshot rows (one draft per warehouse enforced by unique index).
create or replace function public.create_stocktake(
  p_warehouse_id uuid,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse_id) then
    raise exception 'invalid_warehouse';
  end if;
  if exists (
    select 1 from public.stocktakes t
    where t.warehouse_id = p_warehouse_id and t.status = 'draft'
  ) then
    raise exception 'stocktake_draft_exists';
  end if;

  insert into public.stocktakes (warehouse_id, status, note, created_by)
  values (
    p_warehouse_id,
    'draft',
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  insert into public.stocktake_items (stocktake_id, product_id, system_stock)
  select
    v_id,
    p.id,
    coalesce(i.stock, 0)::integer
  from public.products p
  left join public.inventory i
    on i.product_id = p.id and i.warehouse_id = p_warehouse_id
  where p.is_active = true
    and p.kind in ('STANDARD', 'CUSTOM_BUNDLE');

  return v_id;
end;
$$;

grant execute on function public.create_stocktake(uuid, text) to authenticated;

-- Complete: apply counts from p_items JSON array [{ "item_id": uuid, "actual_stock": int|null, "reason": text }].
-- Omit item from array → leave DB row unchanged (actual stays null → no adjustment).
create or replace function public.complete_stocktake(
  p_stocktake_id uuid,
  p_items jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
  v_status text;
  rec record;
  v_elem jsonb;
  v_item_id uuid;
  v_actual int;
  v_reason text;
  v_diff int;
  v_adj_count int := 0;
  v_inc bigint := 0;
  v_dec bigint := 0;
  v_log_note text;
  v_match int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select s.warehouse_id, s.status into v_wh, v_status
  from public.stocktakes s
  where s.id = p_stocktake_id
  for update;

  if v_wh is null then
    raise exception 'stocktake_not_found';
  end if;

  if v_status is distinct from 'draft' then
    raise exception 'stocktake_not_draft';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items_payload';
  end if;

  for v_elem in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_item_id := (v_elem->>'item_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_item_id';
    end;

    v_actual := null;
    if v_elem ? 'actual_stock' and jsonb_typeof(v_elem->'actual_stock') <> 'null'
      and length(trim(coalesce(v_elem->>'actual_stock', ''))) > 0
    then
      v_actual := (v_elem->>'actual_stock')::int;
      if v_actual < 0 then
        raise exception 'invalid_actual_stock';
      end if;
    end if;

    v_reason := nullif(trim(coalesce(v_elem->>'reason', '')), '');

    update public.stocktake_items i
    set
      actual_stock = v_actual,
      reason = v_reason
    where i.id = v_item_id
      and i.stocktake_id = p_stocktake_id;

    get diagnostics v_match = row_count;
    if v_match = 0 then
      raise exception 'invalid_stocktake_item';
    end if;
  end loop;

  for rec in
    select * from public.stocktake_items where stocktake_id = p_stocktake_id
  loop
    if rec.actual_stock is null then
      v_diff := 0;
      update public.stocktake_items set difference = 0 where id = rec.id;
    else
      v_diff := rec.actual_stock - rec.system_stock;
      update public.stocktake_items set difference = v_diff where id = rec.id;

      if v_diff <> 0 then
        v_adj_count := v_adj_count + 1;
        if v_diff > 0 then
          v_inc := v_inc + v_diff;
        else
          v_dec := v_dec + (-v_diff);
        end if;

        insert into public.inventory (warehouse_id, product_id, stock)
        values (v_wh, rec.product_id, 0)
        on conflict (warehouse_id, product_id) do nothing;

        update public.inventory
        set stock = rec.actual_stock
        where warehouse_id = v_wh and product_id = rec.product_id;

        get diagnostics v_match = row_count;
        if v_match <> 1 then
          raise exception 'inventory_update_failed';
        end if;

        v_log_note := '盤點Δ'
          || case when v_diff > 0 then '+' else '−' end
          || abs(v_diff)::text;

        if nullif(trim(coalesce(rec.reason, '')), '') is not null then
          v_log_note := v_log_note || ' · ' || trim(rec.reason);
        end if;

        insert into public.inventory_logs (
          warehouse_id,
          product_id,
          type,
          quantity,
          note,
          created_by
        )
        values (
          v_wh,
          rec.product_id,
          'adjust',
          abs(v_diff),
          v_log_note,
          auth.uid()
        );
      end if;
    end if;
  end loop;

  update public.stocktakes
  set
    status = 'completed',
    completed_at = now()
  where id = p_stocktake_id;

  return jsonb_build_object(
    'adjusted_lines', v_adj_count,
    'increase_qty', v_inc,
    'decrease_qty', v_dec
  );
end;
$$;

grant execute on function public.complete_stocktake(uuid, jsonb) to authenticated;
