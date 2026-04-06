-- Fix 42P17 infinite recursion on user_booths / users RLS (MANAGER policies).
-- Run once if you already applied migrate_manager_role.sql before this fix.
-- Safe to run multiple times (idempotent).

create or replace function public.manager_can_select_staff_user(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users m where m.id = auth.uid() and m.role = 'MANAGER'
  )
  and exists (
    select 1 from public.users s where s.id = p_staff_id and s.role = 'STAFF'
  )
  and exists (
    select 1
    from public.user_booths ub_m
    inner join public.user_booths ub_s
      on ub_s.booth_id = ub_m.booth_id and ub_s.user_id = p_staff_id
    where ub_m.user_id = auth.uid()
  );
$$;

create or replace function public.manager_may_read_staff_booth_assignment(
  p_row_user_id uuid,
  p_row_booth_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users m where m.id = auth.uid() and m.role = 'MANAGER'
  )
  and exists (
    select 1 from public.users t where t.id = p_row_user_id and t.role = 'STAFF'
  )
  and exists (
    select 1 from public.user_booths ub_m
    where ub_m.user_id = auth.uid() and ub_m.booth_id = p_row_booth_id
  )
  and exists (
    select 1 from public.user_booths ub_t
    where ub_t.user_id = p_row_user_id and ub_t.booth_id = p_row_booth_id
  );
$$;

grant execute on function public.manager_can_select_staff_user(uuid) to authenticated;
grant execute on function public.manager_may_read_staff_booth_assignment(uuid, uuid) to authenticated;

drop policy if exists "users_select_manager_staff" on public.users;
create policy "users_select_manager_staff" on public.users
  for select to authenticated
  using (public.manager_can_select_staff_user(users.id));

drop policy if exists "user_booths_select_rbac" on public.user_booths;
create policy "user_booths_select_rbac" on public.user_booths
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or public.manager_may_read_staff_booth_assignment(user_booths.user_id, user_booths.booth_id)
  );
