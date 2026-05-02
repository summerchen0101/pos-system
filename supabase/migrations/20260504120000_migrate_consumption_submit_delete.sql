-- One-shot submit for consumption sheets + delete completed (restore stock).

-- ---------------------------------------------------------------------------
-- submit_consumption_sheet: create draft, save lines (same kind per sheet), complete in one transaction
-- ---------------------------------------------------------------------------

create or replace function public.submit_consumption_sheet(
  p_warehouse_id uuid,
  p_note text default null,
  p_consumption_date date default null,
  p_kind text default null,
  p_lines jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_kind text;
  v_elem jsonb;
  v_full_lines jsonb := '[]'::jsonb;
begin
  v_kind := trim(lower(coalesce(p_kind, '')));
  if v_kind not in ('tasting', 'loss', 'complimentary', 'pr', 'other') then
    raise exception 'invalid_consumption_kind';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'invalid_lines_payload';
  end if;

  for v_elem in select * from jsonb_array_elements(p_lines)
  loop
    v_full_lines := v_full_lines || jsonb_build_array(v_elem || jsonb_build_object('kind', v_kind));
  end loop;

  v_id := public.create_consumption_sheet(
    p_warehouse_id,
    p_note,
    p_consumption_date
  );

  perform public.save_consumption_sheet_lines(v_id, v_full_lines);

  return public.complete_consumption_sheet(v_id);
end;
$$;

grant execute on function public.submit_consumption_sheet(uuid, text, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_completed_consumption_sheet: restore stock, log "in", remove sheet
-- ---------------------------------------------------------------------------

create or replace function public.delete_completed_consumption_sheet(p_sheet_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
  v_status text;
  v_sheet_note text;
  rec record;
  v_kind_zh text;
  v_log_note text;
  v_match int;
begin
  select s.warehouse_id, s.status, s.note
  into v_wh, v_status, v_sheet_note
  from public.consumption_sheets s
  where s.id = p_sheet_id
  for update;

  if v_wh is null then
    raise exception 'consumption_sheet_not_found';
  end if;

  if not public.user_may_manage_stocktake_warehouse(v_wh) then
    raise exception 'forbidden';
  end if;

  if v_status is distinct from 'completed' then
    raise exception 'consumption_sheet_not_completed';
  end if;

  for rec in
    select *
    from public.consumption_sheet_items i
    where i.consumption_sheet_id = p_sheet_id
      and i.quantity > 0
    order by i.id
  loop
    insert into public.inventory (warehouse_id, product_id, stock)
    values (v_wh, rec.product_id, 0)
    on conflict (warehouse_id, product_id) do nothing;

    update public.inventory
    set stock = stock + rec.quantity
    where warehouse_id = v_wh and product_id = rec.product_id;

    get diagnostics v_match = row_count;
    if v_match <> 1 then
      raise exception 'inventory_update_failed';
    end if;

    v_kind_zh := case rec.kind
      when 'tasting' then '試吃'
      when 'loss' then '耗損'
      when 'complimentary' then '補贈'
      when 'pr' then '公關'
      when 'other' then '其他'
      else rec.kind
    end;

    v_log_note := '沖銷例外消耗｜' || v_kind_zh;

    if nullif(trim(coalesce(v_sheet_note, '')), '') is not null then
      v_log_note := v_log_note || ' · ' || trim(v_sheet_note);
    end if;

    if nullif(trim(coalesce(rec.note, '')), '') is not null then
      v_log_note := v_log_note || ' · ' || trim(rec.note);
    end if;

    insert into public.inventory_logs (
      warehouse_id,
      product_id,
      type,
      quantity,
      note,
      related_consumption_sheet_id,
      created_by
    )
    values (
      v_wh,
      rec.product_id,
      'in',
      rec.quantity,
      v_log_note,
      p_sheet_id,
      auth.uid()
    );
  end loop;

  delete from public.consumption_sheets where id = p_sheet_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_completed_consumption_sheet(uuid) to authenticated;

-- Remove legacy drafts (orphaned multi-step flow)
delete from public.consumption_sheets where status = 'draft';
