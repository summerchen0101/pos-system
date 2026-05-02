-- Daily exceptional consumption sheets (例外消耗): draft lines → complete deducts inventory + inventory_logs (out).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.consumption_sheets (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  note text,
  consumption_date date not null default ((timezone('Asia/Taipei', now()))::date),
  created_by uuid references public.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consumption_sheets_warehouse_id_idx on public.consumption_sheets (warehouse_id);
create index if not exists consumption_sheets_created_at_idx on public.consumption_sheets (created_at desc);
create index if not exists consumption_sheets_consumption_date_idx on public.consumption_sheets (consumption_date desc);
create index if not exists consumption_sheets_updated_at_idx on public.consumption_sheets (updated_at desc);

create table if not exists public.consumption_sheet_items (
  id uuid primary key default gen_random_uuid(),
  consumption_sheet_id uuid not null references public.consumption_sheets (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  kind text not null check (
    kind in ('tasting', 'loss', 'complimentary', 'pr', 'other')
  ),
  quantity integer not null default 0 check (quantity >= 0),
  note text
);

create index if not exists consumption_sheet_items_sheet_id_idx
  on public.consumption_sheet_items (consumption_sheet_id);

alter table public.inventory_logs
  add column if not exists related_consumption_sheet_id uuid references public.consumption_sheets (id) on delete set null;

create index if not exists inventory_logs_related_consumption_sheet_id_idx
  on public.inventory_logs (related_consumption_sheet_id)
  where related_consumption_sheet_id is not null;

-- ---------------------------------------------------------------------------
-- RLS (mirror stocktakes / stocktake_items)
-- ---------------------------------------------------------------------------

alter table public.consumption_sheets enable row level security;
alter table public.consumption_sheet_items enable row level security;

drop policy if exists "consumption_sheets_all_admin" on public.consumption_sheets;
create policy "consumption_sheets_all_admin" on public.consumption_sheets
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "consumption_sheets_select_manager" on public.consumption_sheets;
create policy "consumption_sheets_select_manager" on public.consumption_sheets
  for select to authenticated
  using (public.is_manager() and not public.is_admin());

drop policy if exists "consumption_sheets_select_booth_warehouse" on public.consumption_sheets;
create policy "consumption_sheets_select_booth_warehouse" on public.consumption_sheets
  for select to authenticated
  using (
    exists (
      select 1
      from public.booths b
      where b.warehouse_id = consumption_sheets.warehouse_id
        and b.warehouse_id is not null
        and b.id in (select public.current_user_booth_ids())
    )
    or exists (
      select 1
      from public.warehouses w
      where w.id = consumption_sheets.warehouse_id
        and w.booth_id is not null
        and w.booth_id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "consumption_sheets_delete_draft_booth_warehouse" on public.consumption_sheets;
create policy "consumption_sheets_delete_draft_booth_warehouse" on public.consumption_sheets
  for delete to authenticated
  using (
    status = 'draft'
    and (
      exists (
        select 1
        from public.booths b
        where b.warehouse_id = consumption_sheets.warehouse_id
          and b.id in (select public.current_user_booth_ids())
      )
      or exists (
        select 1
        from public.warehouses w
        where w.id = consumption_sheets.warehouse_id
          and w.booth_id is not null
          and w.booth_id in (select public.current_user_booth_ids())
      )
    )
  );

drop policy if exists "consumption_sheet_items_all_admin" on public.consumption_sheet_items;
create policy "consumption_sheet_items_all_admin" on public.consumption_sheet_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "consumption_sheet_items_select_manager" on public.consumption_sheet_items;
create policy "consumption_sheet_items_select_manager" on public.consumption_sheet_items
  for select to authenticated
  using (
    public.is_manager()
    and not public.is_admin()
    and exists (
      select 1 from public.consumption_sheets s
      where s.id = consumption_sheet_items.consumption_sheet_id
    )
  );

drop policy if exists "consumption_sheet_items_select_booth_warehouse" on public.consumption_sheet_items;
create policy "consumption_sheet_items_select_booth_warehouse" on public.consumption_sheet_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.consumption_sheets s
      inner join public.booths b on b.warehouse_id = s.warehouse_id
      where s.id = consumption_sheet_items.consumption_sheet_id
        and b.id in (select public.current_user_booth_ids())
    )
    or exists (
      select 1
      from public.consumption_sheets s
      inner join public.warehouses w on w.id = s.warehouse_id
      where s.id = consumption_sheet_items.consumption_sheet_id
        and w.booth_id is not null
        and w.booth_id in (select public.current_user_booth_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs (same warehouse permission as stocktake)
-- ---------------------------------------------------------------------------

create or replace function public.create_consumption_sheet(
  p_warehouse_id uuid,
  p_note text default null,
  p_consumption_date date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_day date;
begin
  if not public.user_may_manage_stocktake_warehouse(p_warehouse_id) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse_id) then
    raise exception 'invalid_warehouse';
  end if;

  v_day := coalesce(
    p_consumption_date,
    (timezone('Asia/Taipei', now()))::date
  );

  insert into public.consumption_sheets (
    warehouse_id,
    status,
    note,
    consumption_date,
    created_by
  )
  values (
    p_warehouse_id,
    'draft',
    nullif(trim(coalesce(p_note, '')), ''),
    v_day,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_consumption_sheet(uuid, text, date) to authenticated;

create or replace function public.save_consumption_sheet_lines(
  p_sheet_id uuid,
  p_lines jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
  v_status text;
  v_elem jsonb;
  v_pid uuid;
  v_kind text;
  v_qty int;
  v_note text;
begin
  select s.warehouse_id, s.status into v_wh, v_status
  from public.consumption_sheets s
  where s.id = p_sheet_id
  for update;

  if v_wh is null then
    raise exception 'consumption_sheet_not_found';
  end if;

  if not public.user_may_manage_stocktake_warehouse(v_wh) then
    raise exception 'forbidden';
  end if;

  if v_status is distinct from 'draft' then
    raise exception 'consumption_sheet_not_draft';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'invalid_lines_payload';
  end if;

  delete from public.consumption_sheet_items where consumption_sheet_id = p_sheet_id;

  for v_elem in select * from jsonb_array_elements(p_lines)
  loop
    begin
      v_pid := (v_elem->>'product_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_product_id';
    end;

    v_kind := trim(lower(coalesce(v_elem->>'kind', '')));
    if v_kind not in ('tasting', 'loss', 'complimentary', 'pr', 'other') then
      raise exception 'invalid_consumption_kind';
    end if;

    begin
      if coalesce(trim(v_elem->>'quantity'), '') = '' then
        v_qty := 0;
      else
        v_qty := (v_elem->>'quantity')::int;
      end if;
    exception when invalid_text_representation then
      raise exception 'invalid_quantity';
    end;
    if v_qty < 0 then
      raise exception 'invalid_quantity';
    end if;

    v_note := nullif(trim(coalesce(v_elem->>'note', '')), '');

    if not exists (
      select 1 from public.products p
      where p.id = v_pid
        and p.is_active = true
        and p.kind in ('STANDARD', 'CUSTOM_BUNDLE')
    ) then
      raise exception 'invalid_product_for_consumption';
    end if;

    insert into public.consumption_sheet_items (
      consumption_sheet_id,
      product_id,
      kind,
      quantity,
      note
    )
    values (p_sheet_id, v_pid, v_kind, v_qty, v_note);
  end loop;

  update public.consumption_sheets
  set updated_at = now()
  where id = p_sheet_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.save_consumption_sheet_lines(uuid, jsonb) to authenticated;

create or replace function public.complete_consumption_sheet(p_sheet_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
  v_status text;
  v_sheet_note text;
  rec record;
  v_cur int;
  v_kind_zh text;
  v_log_note text;
  v_lines int := 0;
  v_total bigint := 0;
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

  if v_status is distinct from 'draft' then
    raise exception 'consumption_sheet_not_draft';
  end if;

  select count(*)::int into v_lines
  from public.consumption_sheet_items i
  where i.consumption_sheet_id = p_sheet_id
    and i.quantity > 0;

  if v_lines = 0 then
    raise exception 'consumption_sheet_empty';
  end if;

  for rec in
    select *
    from public.consumption_sheet_items i
    where i.consumption_sheet_id = p_sheet_id
      and i.quantity > 0
    order by i.id
  loop
    if not exists (
      select 1 from public.products p
      where p.id = rec.product_id
        and p.is_active = true
        and p.kind in ('STANDARD', 'CUSTOM_BUNDLE')
    ) then
      raise exception 'invalid_product_for_consumption';
    end if;

    v_cur := coalesce(
      (
        select inv.stock::int
        from public.inventory inv
        where inv.warehouse_id = v_wh and inv.product_id = rec.product_id
      ),
      0
    );

    if v_cur < rec.quantity then
      raise exception 'insufficient_stock';
    end if;

    insert into public.inventory (warehouse_id, product_id, stock)
    values (v_wh, rec.product_id, 0)
    on conflict (warehouse_id, product_id) do nothing;

    update public.inventory
    set stock = stock - rec.quantity
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

    v_log_note := '例外消耗｜' || v_kind_zh;

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
      'out',
      rec.quantity,
      v_log_note,
      p_sheet_id,
      auth.uid()
    );

    v_total := v_total + rec.quantity;
  end loop;

  update public.consumption_sheets
  set
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = p_sheet_id;

  return jsonb_build_object(
    'deducted_lines', v_lines,
    'total_qty', v_total
  );
end;
$$;

grant execute on function public.complete_consumption_sheet(uuid) to authenticated;
