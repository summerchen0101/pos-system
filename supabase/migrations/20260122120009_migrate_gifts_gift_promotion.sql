-- Gifts, gift inventory, GIFT_WITH_THRESHOLD on promotions, checkout deducts gift_inventory.
-- Safe to re-run with IF NOT EXISTS / DROP IF EXISTS guards.

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  name text not null,
  is_active boolean not null default true
);

create table if not exists public.gift_inventory (
  gift_id uuid primary key references public.gifts (id) on delete cascade,
  stock integer not null default 0 check (stock >= 0)
);

create index if not exists gifts_product_id_idx on public.gifts (product_id);

alter table public.promotions
  add column if not exists gift_id uuid references public.gifts (id) on delete set null;

alter table public.promotions
  add column if not exists threshold_amount integer;

alter table public.promotions drop constraint if exists promotions_threshold_nonneg;
alter table public.promotions
  add constraint promotions_threshold_nonneg check (threshold_amount is null or threshold_amount >= 1);

alter table public.promotions drop constraint if exists promotions_kind_check;
alter table public.promotions
  add constraint promotions_kind_check check (
    kind in (
      'BUY_X_GET_Y',
      'BULK_DISCOUNT',
      'SINGLE_DISCOUNT',
      'TIERED',
      'GIFT_WITH_THRESHOLD'
    )
  );

alter table public.promotions drop constraint if exists promotions_gift_threshold_kind;
alter table public.promotions
  add constraint promotions_gift_threshold_kind check (
    (
      kind = 'GIFT_WITH_THRESHOLD'
      and gift_id is not null
      and threshold_amount is not null
    )
    or (
      kind <> 'GIFT_WITH_THRESHOLD'
      and gift_id is null
      and threshold_amount is null
    )
  );

alter table public.gifts enable row level security;
alter table public.gift_inventory enable row level security;

drop policy if exists "gifts_select_anon" on public.gifts;
create policy "gifts_select_anon" on public.gifts for select using (true);

drop policy if exists "gifts_write_anon" on public.gifts;
create policy "gifts_write_anon" on public.gifts for all using (true) with check (true);

drop policy if exists "gift_inventory_select_anon" on public.gift_inventory;
create policy "gift_inventory_select_anon" on public.gift_inventory for select using (true);

drop policy if exists "gift_inventory_write_anon" on public.gift_inventory;
create policy "gift_inventory_write_anon" on public.gift_inventory for all using (true) with check (true);

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
  v_gift_id uuid;
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

  insert into public.orders (total_amount, discount_amount, final_amount)
  values (p_total_amount, p_discount_amount, p_final_amount)
  returning id into v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb) to anon;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb) to authenticated;
grant execute on function public.checkout_order_deduct_stock(integer, integer, integer, jsonb) to service_role;
