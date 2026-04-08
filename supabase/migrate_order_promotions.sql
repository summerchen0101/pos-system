-- Record applied promotions / gifts per order at checkout.
-- Safe to run repeatedly.

create table if not exists public.order_promotions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  promotion_id uuid references public.promotions(id) on delete set null,
  promotion_name text not null,
  promotion_type text not null,
  discount_amount integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.order_gift_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  gift_id uuid references public.gifts(id) on delete set null,
  gift_name text not null,
  quantity integer not null default 1,
  created_at timestamptz default now()
);

create index if not exists order_promotions_order_id_idx on public.order_promotions(order_id);
create index if not exists order_gift_items_order_id_idx on public.order_gift_items(order_id);

alter table public.order_promotions enable row level security;
alter table public.order_gift_items enable row level security;

drop policy if exists "order_promotions_insert_anon" on public.order_promotions;
create policy "order_promotions_insert_anon"
  on public.order_promotions for insert to anon with check (true);

drop policy if exists "order_promotions_select_anon" on public.order_promotions;
create policy "order_promotions_select_anon"
  on public.order_promotions for select to anon using (true);

drop policy if exists "order_promotions_select_authenticated" on public.order_promotions;
create policy "order_promotions_select_authenticated"
  on public.order_promotions for select to authenticated using (true);

drop policy if exists "order_gift_items_insert_anon" on public.order_gift_items;
create policy "order_gift_items_insert_anon"
  on public.order_gift_items for insert to anon with check (true);

drop policy if exists "order_gift_items_select_anon" on public.order_gift_items;
create policy "order_gift_items_select_anon"
  on public.order_gift_items for select to anon using (true);

drop policy if exists "order_gift_items_select_authenticated" on public.order_gift_items;
create policy "order_gift_items_select_authenticated"
  on public.order_gift_items for select to authenticated using (true);

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
  v_manual_discount_sum int := 0;
  v_auto_discount int := 0;
  v_raw text;
  v_base uuid;
  v_elem jsonb;
  v_manual_type text;
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
          where inv.warehouse_id = v_wh_id and inv.product_id = v_pid and inv.stock >= v_qty
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
    v_raw := p_promotion_snapshot->>'autoPromotionId';
    if v_raw is not null and btrim(v_raw) <> '' then
      begin
        v_base := split_part(btrim(v_raw), '~', 1)::uuid;
      exception when invalid_text_representation then
        raise exception 'invalid_promotion_id';
      end;
      if not exists (
        select 1 from public.promotion_booths pb where pb.promotion_id = v_base and pb.booth_id = p_booth_id
      ) then
        raise exception 'promotion_not_allowed_for_booth';
      end if;
    end if;
    for v_elem in select * from jsonb_array_elements(coalesce(p_promotion_snapshot->'manualPromotionDetails', '[]'::jsonb))
    loop
      v_raw := v_elem->>'promotionId';
      if v_raw is not null and btrim(v_raw) <> '' then
        begin
          v_base := split_part(btrim(v_raw), '~', 1)::uuid;
        exception when invalid_text_representation then
          raise exception 'invalid_promotion_id';
        end;
        if not exists (
          select 1 from public.promotion_booths pb where pb.promotion_id = v_base and pb.booth_id = p_booth_id
        ) then
          raise exception 'promotion_not_allowed_for_booth';
        end if;
      end if;
    end loop;
  end if;

  insert into public.orders (
    total_amount, discount_amount, final_amount, promotion_snapshot, booth_id, user_id, scheduled_staff, clocked_in_staff
  ) values (
    p_total_amount, p_discount_amount, p_final_amount, p_promotion_snapshot, p_booth_id, v_uid,
    coalesce(p_scheduled_staff, '{}'), coalesce(p_clocked_in_staff, '{}')
  )
  returning id into v_order_id;

  if p_promotion_snapshot is not null and jsonb_typeof(p_promotion_snapshot) = 'object' then
    for v_elem in select * from jsonb_array_elements(coalesce(p_promotion_snapshot->'manualPromotionDetails', '[]'::jsonb))
    loop
      v_raw := nullif(btrim(coalesce(v_elem->>'promotionId', '')), '');
      v_base := null;
      if v_raw is not null then
        begin
          v_base := split_part(v_raw, '~', 1)::uuid;
        exception when invalid_text_representation then
          v_base := null;
        end;
      end if;
      v_manual_type := 'MANUAL';
      if v_base is not null then
        select coalesce(ps.value->>'type', 'MANUAL') into v_manual_type
        from jsonb_array_elements(coalesce(p_promotion_snapshot->'promotions', '[]'::jsonb)) as ps(value)
        where split_part(coalesce(ps.value->>'promotionId', ''), '~', 1) = v_base::text
        limit 1;
      end if;
      v_manual_type := coalesce(v_manual_type, 'MANUAL');
      insert into public.order_promotions (
        order_id, promotion_id, promotion_name, promotion_type, discount_amount
      ) values (
        v_order_id,
        v_base,
        coalesce(nullif(v_elem->>'name', ''), '—'),
        v_manual_type,
        coalesce((v_elem->>'discountCents')::int, 0)
      );
      v_manual_discount_sum := v_manual_discount_sum + coalesce((v_elem->>'discountCents')::int, 0);
    end loop;

    v_raw := nullif(btrim(coalesce(p_promotion_snapshot->>'autoPromotionId', '')), '');
    if v_raw is not null then
      begin
        v_base := split_part(v_raw, '~', 1)::uuid;
      exception when invalid_text_representation then
        v_base := null;
      end;
      v_auto_discount := greatest(0, p_discount_amount - v_manual_discount_sum);
      insert into public.order_promotions (
        order_id, promotion_id, promotion_name, promotion_type, discount_amount
      ) values (
        v_order_id,
        v_base,
        coalesce(nullif(p_promotion_snapshot->>'autoPromotionName', ''), '自動優惠'),
        'AUTO',
        v_auto_discount
      );
    end if;
  end if;

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
      order_id, product_id, product_name, size, quantity, unit_price_cents, line_total_cents,
      is_gift, is_manual_free, gift_id, sort_order, source
    ) values (
      v_order_id, v_pid, v_name, v_size, v_qty, v_unit, v_unit * v_qty,
      v_is_gift, v_is_manual_free, v_gift_id, i + 1, v_source
    );

    if v_is_gift then
      insert into public.order_gift_items (
        order_id, gift_id, gift_name, quantity
      ) values (
        v_order_id, v_gift_id, v_name, v_qty
      );
    end if;

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
          warehouse_id, product_id, type, quantity, note, related_order_id, created_by
        ) values (v_wh_id, v_pid, 'out', v_qty, 'POS', v_order_id, v_uid);
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

create or replace function public.pos_list_orders_for_booth_day(
  p_booth_id uuid,
  p_day date default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'created_at', o.created_at,
        'final_amount', o.final_amount,
        'discount_amount', o.discount_amount,
        'total_amount', o.total_amount,
        'buyer_gender', o.buyer_gender,
        'buyer_age_group', o.buyer_age_group,
        'buyer_motivation', o.buyer_motivation,
        'order_promotions', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', op.id,
                'promotion_id', op.promotion_id,
                'promotion_name', op.promotion_name,
                'promotion_type', op.promotion_type,
                'discount_amount', op.discount_amount
              )
              order by op.created_at
            ),
            '[]'::jsonb
          )
          from public.order_promotions op
          where op.order_id = o.id
        ),
        'order_gift_items', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', gi.id,
                'gift_id', gi.gift_id,
                'gift_name', gi.gift_name,
                'quantity', gi.quantity
              )
              order by gi.created_at
            ),
            '[]'::jsonb
          )
          from public.order_gift_items gi
          where gi.order_id = o.id
        ),
        'items', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', oi.product_name,
                'size', oi.size,
                'quantity', oi.quantity,
                'unit_price_cents', oi.unit_price_cents,
                'line_total_cents', oi.line_total_cents,
                'is_gift', oi.is_gift,
                'is_manual_free', oi.is_manual_free,
                'gift_id', oi.gift_id,
                'source', oi.source
              )
              order by oi.sort_order
            ),
            '[]'::jsonb
          )
          from public.order_items oi
          where oi.order_id = o.id
        )
      )
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  from public.orders o
  where o.booth_id = p_booth_id
    and (timezone('Asia/Taipei', o.created_at))::date = coalesce(
      p_day,
      (timezone('Asia/Taipei', now()))::date
    );
$$;
