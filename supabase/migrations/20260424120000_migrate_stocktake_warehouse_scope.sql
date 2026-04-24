-- Stocktake scope: treat a warehouse as booth-scoped if either
--   booths.warehouse_id = w, or warehouses.booth_id is in the user's booths.
-- Fixes create_stocktake / complete_stocktake forbidden when only warehouses.booth_id is set.

create or replace function public.user_may_manage_stocktake_warehouse(p_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or (
      auth.uid() is not null
      and p_warehouse_id is not null
      and (
        exists (
          select 1
          from public.booths b
          where b.warehouse_id = p_warehouse_id
            and b.id in (select public.current_user_booth_ids())
        )
        or exists (
          select 1
          from public.warehouses w
          where w.id = p_warehouse_id
            and w.booth_id is not null
            and w.booth_id in (select public.current_user_booth_ids())
        )
      )
    );
$$;

grant execute on function public.user_may_manage_stocktake_warehouse(uuid) to authenticated;

-- RLS: same scope for read / delete on stocktakes (was booths.warehouse_id only)
drop policy if exists "stocktakes_select_booth_warehouse" on public.stocktakes;
create policy "stocktakes_select_booth_warehouse" on public.stocktakes
  for select to authenticated
  using (
    exists (
      select 1
      from public.booths b
      where b.warehouse_id = stocktakes.warehouse_id
        and b.warehouse_id is not null
        and b.id in (select public.current_user_booth_ids())
    )
    or exists (
      select 1
      from public.warehouses w
      where w.id = stocktakes.warehouse_id
        and w.booth_id is not null
        and w.booth_id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "stocktake_items_select_booth_warehouse" on public.stocktake_items;
create policy "stocktake_items_select_booth_warehouse" on public.stocktake_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.stocktakes s
      inner join public.booths b on b.warehouse_id = s.warehouse_id
      where s.id = stocktake_items.stocktake_id
        and b.id in (select public.current_user_booth_ids())
    )
    or exists (
      select 1
      from public.stocktakes s
      inner join public.warehouses w on w.id = s.warehouse_id
      where s.id = stocktake_items.stocktake_id
        and w.booth_id is not null
        and w.booth_id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "stocktakes_delete_draft_booth_warehouse" on public.stocktakes;
create policy "stocktakes_delete_draft_booth_warehouse" on public.stocktakes
  for delete to authenticated
  using (
    status = 'draft'
    and (
      exists (
        select 1
        from public.booths b
        where b.warehouse_id = stocktakes.warehouse_id
          and b.id in (select public.current_user_booth_ids())
      )
      or exists (
        select 1
        from public.warehouses w
        where w.id = stocktakes.warehouse_id
          and w.booth_id is not null
          and w.booth_id in (select public.current_user_booth_ids())
      )
    )
  );
