-- MANAGER/STAFF can read tablet ad-hoc rows (shift_id null) for booths they are assigned to.
-- Run after migrate_manager_role.sql.

drop policy if exists "shift_clock_logs_select" on public.shift_clock_logs;
create policy "shift_clock_logs_select" on public.shift_clock_logs
  for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or (
      shift_id is null
      and booth_id is not null
      and booth_id in (select public.current_user_booth_ids())
      and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('MANAGER', 'STAFF')
      )
    )
    or (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('MANAGER', 'STAFF')
      )
      and exists (
        select 1 from public.shifts s
        where s.id = shift_clock_logs.shift_id
          and s.booth_id in (select public.current_user_booth_ids())
      )
    )
  );
