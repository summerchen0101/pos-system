-- MANAGER role (between ADMIN and STAFF): RBAC + shift / clock / user visibility.
-- Run after migrate_rbac.sql and migrate_shifts.sql.
-- Note: public.users.role is TEXT with CHECK, not a Postgres enum.

-- ---------------------------------------------------------------------------
-- Role constraint
-- ---------------------------------------------------------------------------

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('ADMIN', 'MANAGER', 'STAFF'));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'MANAGER'
  );
$$;

grant execute on function public.is_manager() to authenticated;

-- Used in shifts_select (and roster policies) instead of subquerying public.users from another table policy.
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

-- Avoid RLS recursion: policies must not subquery user_booths/users in ways that re-enter each other.
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

-- Avoid shifts <-> shift_swap_requests RLS recursion: do not query shifts inside swap-request policy.
create or replace function public.shift_swap_request_visible_to_manager(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'MANAGER'
  )
  and exists (
    select 1
    from public.shift_swap_requests r
    join public.shifts sr on sr.id = r.requester_shift_id
    join public.shifts st on st.id = r.target_shift_id
    where r.id = p_request_id
      and sr.booth_id = st.booth_id
      and sr.booth_id in (select public.current_user_booth_ids())
  );
$$;

grant execute on function public.shift_swap_request_visible_to_manager(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Shifts: MANAGER/STAFF read shifts in assigned booths; MANAGER manages shifts in scope
-- ---------------------------------------------------------------------------

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

drop policy if exists "shifts_insert_admin" on public.shifts;
create policy "shifts_insert_admin" on public.shifts
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_manager()
      and booth_id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "shifts_update_admin" on public.shifts;
create policy "shifts_update_admin" on public.shifts
  for update to authenticated
  using (
    public.is_admin()
    or (
      public.is_manager()
      and booth_id in (select public.current_user_booth_ids())
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_manager()
      and booth_id in (select public.current_user_booth_ids())
    )
  );

drop policy if exists "shifts_delete_admin" on public.shifts;
create policy "shifts_delete_admin" on public.shifts
  for delete to authenticated
  using (
    public.is_admin()
    or (
      public.is_manager()
      and booth_id in (select public.current_user_booth_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- Shift clock logs: booth-scoped read for MANAGER + STAFF
-- ---------------------------------------------------------------------------

drop policy if exists "shift_clock_logs_select" on public.shift_clock_logs;
create policy "shift_clock_logs_select" on public.shift_clock_logs
  for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
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

-- ---------------------------------------------------------------------------
-- Swap requests: MANAGER sees pending/accepted for swaps in their booths
-- ---------------------------------------------------------------------------

drop policy if exists "shift_swap_requests_select" on public.shift_swap_requests;
create policy "shift_swap_requests_select" on public.shift_swap_requests
  for select to authenticated
  using (
    public.is_admin()
    or requester_id = auth.uid()
    or target_id = auth.uid()
    or public.shift_swap_request_visible_to_manager(shift_swap_requests.id)
  );

-- ---------------------------------------------------------------------------
-- Users: MANAGER may read STAFF who share an assigned booth
-- ---------------------------------------------------------------------------

drop policy if exists "users_select_manager_staff" on public.users;
create policy "users_select_manager_staff" on public.users
  for select to authenticated
  using (public.manager_can_select_staff_user(users.id));

-- ---------------------------------------------------------------------------
-- user_booths: MANAGER read STAFF booth rows in their scope (staff list UI)
-- ---------------------------------------------------------------------------

drop policy if exists "user_booths_select_rbac" on public.user_booths;
create policy "user_booths_select_rbac" on public.user_booths
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or public.manager_may_read_staff_booth_assignment(user_booths.user_id, user_booths.booth_id)
  );

-- ---------------------------------------------------------------------------
-- RPC: approve / reject swap — MANAGER for swaps in assigned booths
-- ---------------------------------------------------------------------------

create or replace function public.admin_approve_shift_swap(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cnt int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not (
    public.is_admin()
    or (
      public.is_manager()
      and exists (
        select 1
        from public.shift_swap_requests r
        join public.shifts sr on sr.id = r.requester_shift_id
        join public.shifts st on st.id = r.target_shift_id
        where r.id = p_request_id
          and sr.booth_id = st.booth_id
          and sr.booth_id in (select public.current_user_booth_ids())
      )
    )
  ) then
    raise exception 'forbidden';
  end if;

  perform 1
  from public.shift_swap_requests
  where id = p_request_id and status = 'accepted'
  for update;

  if not found then
    raise exception 'approve_not_allowed';
  end if;

  update public.shifts s
  set user_id = case
    when s.id = r.requester_shift_id then r.target_id
    when s.id = r.target_shift_id then r.requester_id
  end
  from public.shift_swap_requests r
  where r.id = p_request_id
    and r.status = 'accepted'
    and s.id in (r.requester_shift_id, r.target_shift_id);

  get diagnostics v_cnt = row_count;
  if v_cnt <> 2 then
    raise exception 'approve_not_allowed';
  end if;

  update public.shift_swap_requests
  set status = 'approved'
  where id = p_request_id
    and status = 'accepted';

  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then
    raise exception 'approve_state_error';
  end if;
end;
$$;

create or replace function public.admin_reject_shift_swap(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cnt int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not (
    public.is_admin()
    or (
      public.is_manager()
      and exists (
        select 1
        from public.shift_swap_requests r
        join public.shifts sr on sr.id = r.requester_shift_id
        join public.shifts st on st.id = r.target_shift_id
        where r.id = p_request_id
          and sr.booth_id = st.booth_id
          and sr.booth_id in (select public.current_user_booth_ids())
      )
    )
  ) then
    raise exception 'forbidden';
  end if;

  update public.shift_swap_requests
  set status = 'rejected'
  where id = p_request_id
    and status in ('pending', 'accepted');

  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then
    raise exception 'reject_not_allowed';
  end if;
end;
$$;
