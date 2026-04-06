-- Promotions: shared across booths via `promotion_booths` (replaces `promotions.booth_id`).
-- Run after migrate_booths.sql / migrate_rbac.sql. Requires `public.is_admin()` and `current_user_booth_ids()`.

-- ---------------------------------------------------------------------------
-- 1. Join table
-- ---------------------------------------------------------------------------
create table if not exists public.promotion_booths (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  booth_id uuid not null references public.booths (id) on delete cascade,
  primary key (promotion_id, booth_id)
);

create index if not exists promotion_booths_booth_id_idx on public.promotion_booths (booth_id);

alter table public.promotion_booths enable row level security;

drop policy if exists "promotion_booths_select_rbac" on public.promotion_booths;
create policy "promotion_booths_select_rbac" on public.promotion_booths for select using (
  auth.uid() is not null
  and (
    public.is_admin()
    or booth_id in (select public.current_user_booth_ids())
  )
);

drop policy if exists "promotion_booths_write_rbac" on public.promotion_booths;
create policy "promotion_booths_write_rbac" on public.promotion_booths for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Backfill: each existing promotion applies to every booth
-- ---------------------------------------------------------------------------
insert into public.promotion_booths (promotion_id, booth_id)
select p.id, b.id
from public.promotions p
cross join public.booths b
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. RLS on promotions + children: stop using promotions.booth_id
-- ---------------------------------------------------------------------------
drop policy if exists "promotions_select_rbac" on public.promotions;
create policy "promotions_select_rbac" on public.promotions for select using (
  auth.uid() is not null
  and (
    public.is_admin()
    or exists (
      select 1
      from public.promotion_booths pb
      where pb.promotion_id = promotions.id
        and pb.booth_id in (select public.current_user_booth_ids())
    )
  )
);

drop policy if exists "promotion_products_select_rbac" on public.promotion_products;
create policy "promotion_products_select_rbac" on public.promotion_products for select using (
  auth.uid() is not null
  and exists (
    select 1
    from public.promotions p
    join public.promotion_booths pb on pb.promotion_id = p.id
    where p.id = promotion_products.promotion_id
      and (public.is_admin() or pb.booth_id in (select public.current_user_booth_ids()))
  )
);

drop policy if exists "promotion_selectable_items_select_rbac" on public.promotion_selectable_items;
create policy "promotion_selectable_items_select_rbac" on public.promotion_selectable_items for select using (
  auth.uid() is not null
  and exists (
    select 1
    from public.promotions p
    join public.promotion_booths pb on pb.promotion_id = p.id
    where p.id = promotion_selectable_items.promotion_id
      and (public.is_admin() or pb.booth_id in (select public.current_user_booth_ids()))
  )
);

drop policy if exists "promotion_rules_select_rbac" on public.promotion_rules;
create policy "promotion_rules_select_rbac" on public.promotion_rules for select using (
  auth.uid() is not null
  and exists (
    select 1
    from public.promotions p
    join public.promotion_booths pb on pb.promotion_id = p.id
    where p.id = promotion_rules.promotion_id
      and (public.is_admin() or pb.booth_id in (select public.current_user_booth_ids()))
  )
);

drop policy if exists "promotion_tiers_select_rbac" on public.promotion_tiers;
create policy "promotion_tiers_select_rbac" on public.promotion_tiers for select using (
  auth.uid() is not null
  and exists (
    select 1
    from public.promotions p
    join public.promotion_booths pb on pb.promotion_id = p.id
    where p.id = promotion_tiers.promotion_id
      and (public.is_admin() or pb.booth_id in (select public.current_user_booth_ids()))
  )
);

-- ---------------------------------------------------------------------------
-- 4. Drop promotions.booth_id
-- ---------------------------------------------------------------------------
alter table public.promotions drop constraint if exists promotions_booth_id_fkey;

drop index if exists promotions_booth_id_idx;

alter table public.promotions drop column if exists booth_id;

-- ---------------------------------------------------------------------------
-- 5. Checkout: validate snapshot promotion IDs against promotion_booths
-- ---------------------------------------------------------------------------
create or replace function public.checkout_order_deduct_stock(
  p_total_amount integer,
  p_discount_amount integer,
  p_final_amount integer,
  p_lines jsonb,
  p_promotion_snapshot jsonb default null,
  p_booth_id uuid default '00000000-0000-0000-0000-000000000001'::uuid
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
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    if not exists (
      select 1 from public.user_booths ub
      where ub.user_id = auth.uid() and ub.booth_id = p_booth_id
    ) then
      raise exception 'booth_forbidden';
    end if;
  end if;

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
    auth.uid()
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

revoke execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid) from anon;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb, jsonb, uuid) to service_role;
