-- POS registers without Supabase session: anon reads for catalog; checkout + tablet clock via RPC.
-- Run after migrate_orders_cashier.sql, migrate_shift_consecutive_clock.sql, migrate_promotion_shared.sql.

-- ---------------------------------------------------------------------------
-- shift_clock_logs: optional shift (臨時人員), booth + work_date for ad-hoc rows
-- ---------------------------------------------------------------------------

alter table public.shift_clock_logs drop constraint if exists shift_clock_logs_shift_unique;

alter table public.shift_clock_logs alter column shift_id drop not null;

alter table public.shift_clock_logs
  add column if not exists booth_id uuid references public.booths (id) on delete cascade,
  add column if not exists work_date date;

create unique index if not exists shift_clock_logs_one_per_shift
  on public.shift_clock_logs (shift_id)
  where shift_id is not null;

-- ---------------------------------------------------------------------------
-- Anon SELECT policies (catalog for open POS); authenticated still use RBAC policies.
-- ---------------------------------------------------------------------------

drop policy if exists "booths_select_anon_pos" on public.booths;
create policy "booths_select_anon_pos" on public.booths for select to anon using (true);

drop policy if exists "categories_select_anon_pos" on public.categories;
create policy "categories_select_anon_pos" on public.categories for select to anon using (true);

drop policy if exists "products_select_anon_pos" on public.products;
create policy "products_select_anon_pos" on public.products for select to anon using (true);

drop policy if exists "bundle_groups_select_anon_pos" on public.bundle_groups;
create policy "bundle_groups_select_anon_pos" on public.bundle_groups for select to anon using (true);

drop policy if exists "bundle_group_items_select_anon_pos" on public.bundle_group_items;
create policy "bundle_group_items_select_anon_pos" on public.bundle_group_items for select to anon using (true);

drop policy if exists "gifts_select_anon_pos" on public.gifts;
create policy "gifts_select_anon_pos" on public.gifts for select to anon using (true);

drop policy if exists "gift_inventory_select_anon_pos" on public.gift_inventory;
create policy "gift_inventory_select_anon_pos" on public.gift_inventory for select to anon using (true);

drop policy if exists "promotions_select_anon_pos" on public.promotions;
create policy "promotions_select_anon_pos" on public.promotions for select to anon using (true);

drop policy if exists "promotion_booths_select_anon_pos" on public.promotion_booths;
create policy "promotion_booths_select_anon_pos" on public.promotion_booths for select to anon using (true);

drop policy if exists "promotion_products_select_anon_pos" on public.promotion_products;
create policy "promotion_products_select_anon_pos" on public.promotion_products for select to anon using (true);

drop policy if exists "promotion_selectable_items_select_anon_pos" on public.promotion_selectable_items;
create policy "promotion_selectable_items_select_anon_pos" on public.promotion_selectable_items for select to anon using (true);

drop policy if exists "promotion_rules_select_anon_pos" on public.promotion_rules;
create policy "promotion_rules_select_anon_pos" on public.promotion_rules for select to anon using (true);

drop policy if exists "promotion_tiers_select_anon_pos" on public.promotion_tiers;
create policy "promotion_tiers_select_anon_pos" on public.promotion_tiers for select to anon using (true);

-- ---------------------------------------------------------------------------
-- Checkout: optional cashier id, no booth assignment check (tablet POS)
-- ---------------------------------------------------------------------------

drop function if exists public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid);
drop function if exists public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid, uuid);

create or replace function public.checkout_order_deduct_stock(
  p_total_amount integer,
  p_discount_amount integer,
  p_final_amount integer,
  p_lines jsonb,
  p_promotion_snapshot jsonb default null,
  p_booth_id uuid default '00000000-0000-0000-0000-000000000001'::uuid,
  p_user_id uuid default null
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
begin
  v_uid := coalesce(p_user_id, auth.uid());

  if p_booth_id is null then
    raise exception 'booth_required';
  end if;

  if not exists (select 1 from public.booths b where b.id = p_booth_id) then
    raise exception 'invalid_booth_id';
  end if;

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
      update public.products
        set stock = stock - v_qty
        where id = v_pid and stock >= v_qty;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'insufficient_stock';
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
    user_id
  )
  values (
    p_total_amount,
    p_discount_amount,
    p_final_amount,
    p_promotion_snapshot,
    p_booth_id,
    v_uid
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

  return v_order_id;
end;
$$;

grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid, uuid) to anon;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid, uuid) to authenticated;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Tablet ad-hoc clock-in (no scheduled shift for booth/day)
-- ---------------------------------------------------------------------------

create or replace function public.pos_adhoc_clock_in(p_booth_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_today date := (clock_timestamp() at time zone 'Asia/Taipei')::date;
  v_now timestamptz := clock_timestamp();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.booths b where b.id = p_booth_id) then
    raise exception 'invalid_booth_id';
  end if;

  if exists (
    select 1
    from public.shift_clock_logs l
    left join public.shifts s on s.id = l.shift_id
    where l.user_id = uid
      and l.clock_in_at is not null
      and l.clock_out_at is null
      and (
        (
          l.shift_id is not null
          and s.booth_id = p_booth_id
          and s.shift_date = v_today
        )
        or (
          l.shift_id is null
          and l.booth_id = p_booth_id
          and l.work_date = v_today
        )
      )
  ) then
    raise exception 'pos_already_clocked_in';
  end if;

  insert into public.shift_clock_logs (shift_id, user_id, booth_id, work_date, clock_in_at, clock_out_at)
  values (null, uid, p_booth_id, v_today, v_now, null);
end;
$$;

grant execute on function public.pos_adhoc_clock_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tablet clock-out: scheduled (consecutive head) or ad-hoc row
-- ---------------------------------------------------------------------------

create or replace function public.pos_tablet_clock_out(p_booth_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_today date := (clock_timestamp() at time zone 'Asia/Taipei')::date;
  v_now timestamptz := clock_timestamp();
  v_log_id uuid;
  v_shift_id uuid;
  v_head uuid;
  v_upd int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select l.id, l.shift_id
    into v_log_id, v_shift_id
  from public.shift_clock_logs l
  left join public.shifts s on s.id = l.shift_id
  where l.user_id = uid
    and l.clock_in_at is not null
    and l.clock_out_at is null
    and (
      (
        l.shift_id is not null
        and s.booth_id = p_booth_id
        and s.shift_date = v_today
      )
      or (
        l.shift_id is null
        and l.booth_id = p_booth_id
        and l.work_date = v_today
      )
    )
  order by l.clock_in_at desc
  limit 1;

  if v_log_id is null then
    raise exception 'pos_no_clock_in';
  end if;

  perform 1 from public.shift_clock_logs where id = v_log_id for update;

  if v_shift_id is not null then
    v_head := public.shift_consecutive_head(v_shift_id);
    update public.shift_clock_logs
      set clock_out_at = v_now
    where shift_id = v_head
      and clock_in_at is not null
      and clock_out_at is null;

    get diagnostics v_upd = row_count;
    if v_upd <> 1 then
      raise exception 'clock_out_not_allowed';
    end if;
  else
    update public.shift_clock_logs
      set clock_out_at = v_now
    where id = v_log_id
      and clock_out_at is null;

    get diagnostics v_upd = row_count;
    if v_upd <> 1 then
      raise exception 'clock_out_not_allowed';
    end if;
  end if;
end;
$$;

grant execute on function public.pos_tablet_clock_out(uuid) to authenticated;
