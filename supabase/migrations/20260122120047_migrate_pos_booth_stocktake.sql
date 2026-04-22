-- Allow booth-assigned staff (user_booths) to create/complete stocktakes for their booth warehouse,
-- and to read/delete draft stocktakes scoped to that warehouse. Admins unchanged.
-- Run after migrate_inventory.sql (stocktakes, create_stocktake, complete_stocktake).

-- ---------------------------------------------------------------------------
-- Permission helper (session uid + booth–warehouse link)
-- ---------------------------------------------------------------------------

create or replace function public.user_may_manage_stocktake_warehouse(p_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or (
      auth.uid() is not null
      and p_warehouse_id is not null
      and exists (
        select 1
        from public.booths b
        where b.warehouse_id = p_warehouse_id
          and b.id in (select public.current_user_booth_ids())
      )
    );
$$;

grant execute on function public.user_may_manage_stocktake_warehouse(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create / complete (was admin-only)
-- ---------------------------------------------------------------------------

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
  if not public.user_may_manage_stocktake_warehouse(p_warehouse_id) then
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
  select s.warehouse_id, s.status into v_wh, v_status
  from public.stocktakes s
  where s.id = p_stocktake_id
  for update;

  if v_wh is null then
    raise exception 'stocktake_not_found';
  end if;

  if not public.user_may_manage_stocktake_warehouse(v_wh) then
    raise exception 'forbidden';
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

-- ---------------------------------------------------------------------------
-- RLS: booth-scoped read + draft delete for assigned staff
-- ---------------------------------------------------------------------------

drop policy if exists "stocktakes_select_booth_warehouse" on public.stocktakes;
create policy "stocktakes_select_booth_warehouse" on public.stocktakes
  for select to authenticated
  using (
    exists (
      select 1
      from public.booths b
      where b.warehouse_id = stocktakes.warehouse_id
        and b.warehouse_id is not null
        and b.id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "stocktake_items_select_booth_warehouse" on public.stocktake_items;
create policy "stocktake_items_select_booth_warehouse" on public.stocktake_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.stocktakes s
      inner join public.booths b on b.warehouse_id = s.warehouse_id
      where s.id = stocktake_items.stocktake_id
        and b.id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "stocktakes_delete_draft_booth_warehouse" on public.stocktakes;
create policy "stocktakes_delete_draft_booth_warehouse" on public.stocktakes
  for delete to authenticated
  using (
    status = 'draft'
    and exists (
      select 1
      from public.booths b
      where b.warehouse_id = stocktakes.warehouse_id
        and b.id in (select public.current_user_booth_ids())
    )
  );
