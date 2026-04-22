-- My Shifts roster names: PostgREST embed `users(name)` on `shifts` must pass `users` RLS.
-- `users_select_same_booth` only matches when both users have `user_booths` for the same booth;
-- staff may appear on `shifts` without a matching `user_booths` row, which yields null names in UI.
-- Run after migrate_manager_role.sql.
--
-- 42P17: `users` policy must not indirectly trigger `shifts_select` that subqueries `public.users`.
-- migrate_manager_role.sql `shifts_select` used `exists (select … from users …)` for STAFF/MANAGER;
-- any `users` policy that checks `shifts` visibility then caused users → shifts → users recursion.
-- Fix: `shifts_select` uses `is_staff_or_manager()` (SECURITY DEFINER, reads users without RLS).
-- Then `users_select_shift_roster_at_my_booths` may safely use `exists (select … from shifts …)`.

create or replace function public.is_staff_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('STAFF', 'MANAGER')
  );
$$;

grant execute on function public.is_staff_or_manager() to authenticated;

-- Remove helper from earlier iterations (optional cleanup).
drop function if exists public.user_has_shift_at_current_user_booths(uuid);

-- Align shifts_select with helper (breaks users/shifts/users loop for roster and any other path).
drop policy if exists "shifts_select" on public.shifts;
create policy "shifts_select" on public.shifts
  for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or exists (
      select 1 from public.shift_swap_requests r
      where (r.requester_id = auth.uid() or r.target_id = auth.uid())
        and (r.requester_shift_id = shifts.id or r.target_shift_id = shifts.id)
    )
    or (
      public.is_staff_or_manager()
      and booth_id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "users_select_shift_roster_at_my_booths" on public.users;
create policy "users_select_shift_roster_at_my_booths" on public.users
  for select to authenticated
  using (
    public.is_staff_or_manager()
    and exists (
      select 1 from public.shifts s
      where s.user_id = users.id
        and s.booth_id in (select public.current_user_booth_ids())
    )
  );
