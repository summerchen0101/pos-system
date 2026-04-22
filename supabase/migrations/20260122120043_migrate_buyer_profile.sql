-- Buyer profile (optional) for order analytics.
-- Safe to run repeatedly. If `public.orders` does not exist yet, this migration
-- will no-op with NOTICE. Run it again after order-related migrations.

do $$
begin
  if to_regclass('public.orders') is null then
    raise notice '[migrate_buyer_profile] skip: public.orders does not exist yet';
    return;
  end if;

  alter table public.orders
    add column if not exists buyer_gender text
      check (buyer_gender in ('male', 'female', 'other')),
    add column if not exists buyer_age_group text
      check (buyer_age_group in ('under_18', '18_24', '25_34', '35_44', '45_54', '55_above')),
    add column if not exists buyer_motivation text
      check (buyer_motivation in ('self_use', 'gift', 'trial', 'repurchase', 'other'));

  create index if not exists orders_buyer_gender_idx on public.orders (buyer_gender);
  create index if not exists orders_buyer_age_group_idx on public.orders (buyer_age_group);
  create index if not exists orders_buyer_motivation_idx on public.orders (buyer_motivation);

  -- POS checkout is anon on tablet. Use SECURITY DEFINER RPC for scoped updates
  -- instead of granting table UPDATE to anon directly.
  execute $fn$
    create or replace function public.pos_update_order_buyer_profile(
      p_order_id uuid,
      p_buyer_gender text default null,
      p_buyer_age_group text default null,
      p_buyer_motivation text default null
    ) returns void
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      v_created timestamptz;
    begin
      if p_order_id is null then
        raise exception 'order_required';
      end if;

      select o.created_at
      into v_created
      from public.orders o
      where o.id = p_order_id;

      if v_created is null then
        raise exception 'order_not_found';
      end if;

      -- Limit profile patching to recent checkout orders.
      if v_created < now() - interval '1 day' then
        raise exception 'order_profile_update_expired';
      end if;

      update public.orders
      set
        buyer_gender = nullif(trim(coalesce(p_buyer_gender, '')), ''),
        buyer_age_group = nullif(trim(coalesce(p_buyer_age_group, '')), ''),
        buyer_motivation = nullif(trim(coalesce(p_buyer_motivation, '')), '')
      where id = p_order_id;
    end;
    $body$;
  $fn$;

  grant execute on function public.pos_update_order_buyer_profile(uuid, text, text, text) to anon;
  grant execute on function public.pos_update_order_buyer_profile(uuid, text, text, text) to authenticated;
  grant execute on function public.pos_update_order_buyer_profile(uuid, text, text, text) to service_role;
end
$$;
