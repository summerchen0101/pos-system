-- Product inventory (safe to re-run).
-- NOTE: `checkout_order_deduct_stock` is replaced again in `migrate_gifts_gift_promotion.sql`
-- (gift lines deduct `gift_inventory` when JSON includes `gift_id`).

alter table public.products
  add column if not exists stock integer not null default 0 check (stock >= 0);

-- Atomic: deduct stock for each line, then insert order (single transaction).
create or replace function public.checkout_order_deduct_stock(
  p_total_amount integer,
  p_discount_amount integer,
  p_final_amount integer,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  line jsonb;
  v_pid uuid;
  v_qty int;
  v_updated int;
  i int := 0;
  n int;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty_cart';
  end if;

  n := jsonb_array_length(p_lines);
  while i < n loop
    line := p_lines->i;
    v_pid := (line->>'product_id')::uuid;
    v_qty := (line->>'quantity')::int;
    if v_qty < 1 then
      raise exception 'invalid_quantity';
    end if;
    update public.products
      set stock = stock - v_qty
      where id = v_pid and stock >= v_qty;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'insufficient_stock';
    end if;
    i := i + 1;
  end loop;

  insert into public.orders (total_amount, discount_amount, final_amount)
  values (p_total_amount, p_discount_amount, p_final_amount)
  returning id into v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb) to anon;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb) to authenticated;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb) to service_role;
