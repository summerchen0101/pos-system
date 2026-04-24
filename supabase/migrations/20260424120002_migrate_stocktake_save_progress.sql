-- Draft stocktake: persist line edits without completing; track last edit time on stocktakes.

alter table public.stocktakes
  add column if not exists updated_at timestamptz not null default now();

update public.stocktakes
set updated_at = coalesce(completed_at, created_at);

create index if not exists stocktakes_updated_at_idx on public.stocktakes (updated_at desc);

-- Save actual_stock / reason for draft only; no inventory changes.
create or replace function public.save_stocktake_progress(
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
  v_elem jsonb;
  v_item_id uuid;
  v_actual int;
  v_reason text;
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

  update public.stocktakes
  set updated_at = now()
  where id = p_stocktake_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.save_stocktake_progress(uuid, jsonb) to authenticated;

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
    completed_at = now(),
    updated_at = now()
  where id = p_stocktake_id;

  return jsonb_build_object(
    'adjusted_lines', v_adj_count,
    'increase_qty', v_inc,
    'decrease_qty', v_dec
  );
end;
$$;

grant execute on function public.create_stocktake(uuid, text) to authenticated;
grant execute on function public.complete_stocktake(uuid, jsonb) to authenticated;
