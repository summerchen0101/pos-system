-- Order cashier: store auth user on checkout and allow reading their name on linked orders.
-- Run after migrate_rbac.sql (requires public.users, checkout RPC).

alter table public.orders
  add column if not exists user_id uuid references public.users (id) on delete set null;

create index if not exists orders_user_id_idx on public.orders (user_id);

-- Staff can resolve cashier display names for users who appear on orders in their booths.
drop policy if exists "users_select_as_order_cashier" on public.users;
create policy "users_select_as_order_cashier" on public.users
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.user_id = users.id
        and (
          public.is_admin()
          or o.booth_id in (select public.current_user_booth_ids())
        )
    )
  );

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
