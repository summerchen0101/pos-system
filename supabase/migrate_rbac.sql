-- Role-based access: app users linked to auth.users, booth assignments, RLS, checkout auth.
-- Run after migrate_booths.sql. Requires Supabase Auth (e.g. Email) enabled.
-- After migrate: create first admin in Dashboard → Authentication, then:
--   update public.users set role = 'ADMIN' where id = '<that-user-uuid>';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null check (role in ('ADMIN', 'STAFF'))
);

create table if not exists public.user_booths (
  user_id uuid not null references public.users (id) on delete cascade,
  booth_id uuid not null references public.booths (id) on delete cascade,
  primary key (user_id, booth_id)
);

create index if not exists user_booths_user_id_idx on public.user_booths (user_id);
create index if not exists user_booths_booth_id_idx on public.user_booths (booth_id);

alter table public.users enable row level security;
alter table public.user_booths enable row level security;

-- ---------------------------------------------------------------------------
-- Backfill profiles for existing auth users (idempotent)
-- ---------------------------------------------------------------------------

insert into public.users (id, name, role)
select
  au.id,
  coalesce(
    nullif(trim(au.raw_user_meta_data->>'name'), ''),
    nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
    split_part(au.email, '@', 1),
    'User'
  ),
  'STAFF'
from auth.users au
where not exists (select 1 from public.users u where u.id = au.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- New auth users → public.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1),
      'User'
    ),
    'STAFF'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_insert();

-- ---------------------------------------------------------------------------
-- RBAC helpers (SECURITY DEFINER so RLS on users does not recurse)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'ADMIN'
  );
$$;

create or replace function public.current_user_booth_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ub.booth_id from public.user_booths ub where ub.user_id = auth.uid();
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_user_booth_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies: users & user_booths
-- ---------------------------------------------------------------------------

drop policy if exists "users_select_rbac" on public.users;
create policy "users_select_rbac" on public.users
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "users_update_rbac" on public.users;
create policy "users_update_rbac" on public.users
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user_booths_select_rbac" on public.user_booths;
create policy "user_booths_select_rbac" on public.user_booths
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_booths_write_rbac" on public.user_booths;
create policy "user_booths_write_rbac" on public.user_booths
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Drop legacy anon policies (replace with authenticated RBAC)
-- ---------------------------------------------------------------------------

drop policy if exists "booths_select_anon" on public.booths;
drop policy if exists "booths_write_anon" on public.booths;
create policy "booths_select_rbac" on public.booths for select using (
  auth.uid() is not null
  and (public.is_admin() or id in (select public.current_user_booth_ids()))
);
create policy "booths_write_rbac" on public.booths for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "categories_select_anon" on public.categories;
drop policy if exists "categories_write_anon" on public.categories;
create policy "categories_select_rbac" on public.categories for select using (auth.uid() is not null);
create policy "categories_write_rbac" on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products_select_anon" on public.products;
drop policy if exists "products_write_anon" on public.products;
create policy "products_select_rbac" on public.products for select using (auth.uid() is not null);
create policy "products_write_rbac" on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bundle_groups_select_anon" on public.bundle_groups;
drop policy if exists "bundle_groups_write_anon" on public.bundle_groups;
create policy "bundle_groups_select_rbac" on public.bundle_groups for select using (auth.uid() is not null);
create policy "bundle_groups_write_rbac" on public.bundle_groups for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bundle_group_items_select_anon" on public.bundle_group_items;
drop policy if exists "bundle_group_items_write_anon" on public.bundle_group_items;
create policy "bundle_group_items_select_rbac" on public.bundle_group_items for select using (auth.uid() is not null);
create policy "bundle_group_items_write_rbac" on public.bundle_group_items for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "gifts_select_anon" on public.gifts;
drop policy if exists "gifts_write_anon" on public.gifts;
create policy "gifts_select_rbac" on public.gifts for select using (auth.uid() is not null);
create policy "gifts_write_rbac" on public.gifts for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "gift_inventory_select_anon" on public.gift_inventory;
drop policy if exists "gift_inventory_write_anon" on public.gift_inventory;
create policy "gift_inventory_select_rbac" on public.gift_inventory for select using (auth.uid() is not null);
create policy "gift_inventory_write_rbac" on public.gift_inventory for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "promotions_select_anon" on public.promotions;
drop policy if exists "promotions_write_anon" on public.promotions;
create policy "promotions_select_rbac" on public.promotions for select using (
  auth.uid() is not null
  and (public.is_admin() or booth_id in (select public.current_user_booth_ids()))
);
create policy "promotions_write_rbac" on public.promotions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "promotion_products_select_anon" on public.promotion_products;
drop policy if exists "promotion_products_write_anon" on public.promotion_products;
create policy "promotion_products_select_rbac" on public.promotion_products for select using (
  auth.uid() is not null
  and exists (
    select 1 from public.promotions p
    where p.id = promotion_id
      and (public.is_admin() or p.booth_id in (select public.current_user_booth_ids()))
  )
);
create policy "promotion_products_write_rbac" on public.promotion_products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "promotion_selectable_items_select_anon" on public.promotion_selectable_items;
drop policy if exists "promotion_selectable_items_write_anon" on public.promotion_selectable_items;
create policy "promotion_selectable_items_select_rbac" on public.promotion_selectable_items for select using (
  auth.uid() is not null
  and exists (
    select 1 from public.promotions p
    where p.id = promotion_id
      and (public.is_admin() or p.booth_id in (select public.current_user_booth_ids()))
  )
);
create policy "promotion_selectable_items_write_rbac" on public.promotion_selectable_items for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "promotion_rules_select_anon" on public.promotion_rules;
drop policy if exists "promotion_rules_write_anon" on public.promotion_rules;
create policy "promotion_rules_select_rbac" on public.promotion_rules for select using (
  auth.uid() is not null
  and exists (
    select 1 from public.promotions p
    where p.id = promotion_id
      and (public.is_admin() or p.booth_id in (select public.current_user_booth_ids()))
  )
);
create policy "promotion_rules_write_rbac" on public.promotion_rules for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "promotion_tiers_select_anon" on public.promotion_tiers;
drop policy if exists "promotion_tiers_write_anon" on public.promotion_tiers;
create policy "promotion_tiers_select_rbac" on public.promotion_tiers for select using (
  auth.uid() is not null
  and exists (
    select 1 from public.promotions p
    where p.id = promotion_id
      and (public.is_admin() or p.booth_id in (select public.current_user_booth_ids()))
  )
);
create policy "promotion_tiers_write_rbac" on public.promotion_tiers for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders_select_anon" on public.orders;
drop policy if exists "orders_insert_anon" on public.orders;
create policy "orders_select_rbac" on public.orders for select using (
  auth.uid() is not null
  and (public.is_admin() or booth_id in (select public.current_user_booth_ids()))
);

drop policy if exists "order_items_select_anon" on public.order_items;
create policy "order_items_select_rbac" on public.order_items for select using (
  auth.uid() is not null
  and exists (
    select 1 from public.orders o
    where o.id = order_id
      and (public.is_admin() or o.booth_id in (select public.current_user_booth_ids()))
  )
);

-- ---------------------------------------------------------------------------
-- Checkout RPC: require login + STAFF booth scope
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

  insert into public.orders (
    total_amount,
    discount_amount,
    final_amount,
    promotion_snapshot,
    booth_id
  )
  values (p_total_amount, p_discount_amount, p_final_amount, p_promotion_snapshot, p_booth_id)
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
