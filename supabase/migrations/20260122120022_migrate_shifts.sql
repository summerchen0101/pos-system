-- Shift scheduling, swap requests, clock logs.
-- Run after migrate_rbac.sql (requires public.users, public.booths, public.user_booths, is_admin).
--
-- Swap flow: pending → accepted (target agreed) → approved (admin finalized; user_id swapped on shifts).
-- Also: rejected, cancelled.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  booth_id uuid not null references public.booths (id) on delete restrict,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  note text,
  created_at timestamptz not null default now(),
  constraint shifts_end_after_start check (end_time > start_time)
);

create index if not exists shifts_booth_date_idx on public.shifts (booth_id, shift_date);
create index if not exists shifts_user_date_idx on public.shifts (user_id, shift_date);

create table if not exists public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users (id) on delete cascade,
  target_id uuid not null references public.users (id) on delete cascade,
  requester_shift_id uuid not null references public.shifts (id) on delete cascade,
  target_shift_id uuid not null references public.shifts (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint shift_swap_distinct_users check (requester_id <> target_id),
  constraint shift_swap_distinct_shifts check (requester_shift_id <> target_shift_id)
);

create index if not exists shift_swap_requests_status_idx on public.shift_swap_requests (status);
create index if not exists shift_swap_requests_target_idx on public.shift_swap_requests (target_id);

create table if not exists public.shift_clock_logs (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  constraint shift_clock_logs_shift_unique unique (shift_id)
);

create index if not exists shift_clock_logs_user_idx on public.shift_clock_logs (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.shifts enable row level security;
alter table public.shift_swap_requests enable row level security;
alter table public.shift_clock_logs enable row level security;

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
  );

drop policy if exists "shifts_insert_admin" on public.shifts;
create policy "shifts_insert_admin" on public.shifts
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "shifts_update_admin" on public.shifts;
create policy "shifts_update_admin" on public.shifts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "shifts_delete_admin" on public.shifts;
create policy "shifts_delete_admin" on public.shifts
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "shift_swap_requests_select" on public.shift_swap_requests;
create policy "shift_swap_requests_select" on public.shift_swap_requests
  for select to authenticated
  using (
    public.is_admin()
    or requester_id = auth.uid()
    or target_id = auth.uid()
  );

-- Mutations via RPCs (SECURITY DEFINER) below; no direct insert/update policies.

drop policy if exists "shift_clock_logs_select" on public.shift_clock_logs;
create policy "shift_clock_logs_select" on public.shift_clock_logs
  for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Helpers: same booth for two users (STAFF must be in user_booths for booth)
-- ---------------------------------------------------------------------------

create or replace function public.user_has_booth(p_user_id uuid, p_booth_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_user_id
      and (
        u.role = 'ADMIN'
        or exists (
          select 1 from public.user_booths ub
          where ub.user_id = p_user_id and ub.booth_id = p_booth_id
        )
      )
  );
$$;

grant execute on function public.user_has_booth(uuid, uuid) to authenticated;

-- Colleague shifts in same booth (for swap picker); STAFF in booth only, excludes self.
create or replace function public.list_colleague_shifts_for_swap(
  p_booth_id uuid,
  p_from date,
  p_to date
)
returns setof public.shifts
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.shifts s
  where s.booth_id = p_booth_id
    and s.shift_date >= p_from
    and s.shift_date <= p_to
    and s.user_id is distinct from auth.uid()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'STAFF')
    and exists (
      select 1 from public.user_booths ub
      where ub.user_id = auth.uid() and ub.booth_id = p_booth_id
    )
    and exists (select 1 from public.users u2 where u2.id = s.user_id and u2.role = 'STAFF')
    and public.user_has_booth(s.user_id, p_booth_id);
$$;

grant execute on function public.list_colleague_shifts_for_swap(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: clock in/out (assigned user only, shift day Asia/Taipei, ±30 min windows)
-- ---------------------------------------------------------------------------

create or replace function public.clock_shift(p_shift_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s public.shifts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_local_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_log_id uuid;
  v_log_in timestamptz;
  v_log_out timestamptz;
  v_upd int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_action not in ('in', 'out') then
    raise exception 'invalid_action';
  end if;

  select * into s from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'shift_not_found';
  end if;

  if s.user_id <> uid then
    raise exception 'not_assigned_user';
  end if;

  v_local_date := (v_now at time zone 'Asia/Taipei')::date;
  if v_local_date <> s.shift_date then
    raise exception 'clock_wrong_day';
  end if;

  v_start := (s.shift_date + s.start_time) at time zone 'Asia/Taipei';
  v_end := (s.shift_date + s.end_time) at time zone 'Asia/Taipei';

  if p_action = 'in' then
    if v_now < v_start - interval '30 minutes' or v_now > v_start + interval '30 minutes' then
      raise exception 'clock_in_outside_window';
    end if;

    select id, clock_in_at, clock_out_at
    into v_log_id, v_log_in, v_log_out
    from public.shift_clock_logs
    where shift_id = p_shift_id
    for update;

    if found then
      if v_log_in is not null and v_log_out is null then
        raise exception 'already_clocked_in';
      end if;
      if v_log_out is not null then
        raise exception 'shift_already_completed';
      end if;
      update public.shift_clock_logs
      set clock_in_at = v_now, user_id = uid, clock_out_at = null
      where shift_id = p_shift_id;
    else
      insert into public.shift_clock_logs (shift_id, user_id, clock_in_at, clock_out_at)
      values (p_shift_id, uid, v_now, null);
    end if;
  else
    if v_now < v_end - interval '30 minutes' or v_now > v_end + interval '30 minutes' then
      raise exception 'clock_out_outside_window';
    end if;

    select id into v_log_id from public.shift_clock_logs where shift_id = p_shift_id for update;
    if not found or v_log_id is null then
      raise exception 'clock_in_required_first';
    end if;

    update public.shift_clock_logs
    set clock_out_at = v_now
    where shift_id = p_shift_id
      and clock_in_at is not null
      and clock_out_at is null;

    get diagnostics v_upd = row_count;
    if v_upd <> 1 then
      raise exception 'clock_out_not_allowed';
    end if;
  end if;
end;
$$;

grant execute on function public.clock_shift(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create swap (STAFF only, same booth, correct shift owners, both STAFF)
-- ---------------------------------------------------------------------------

create or replace function public.create_shift_swap_request(
  p_requester_shift_id uuid,
  p_target_shift_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sr public.shifts%rowtype;
  st public.shifts%rowtype;
  tgt uuid;
  new_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into sr from public.shifts where id = p_requester_shift_id;
  if not found then
    raise exception 'requester_shift_not_found';
  end if;

  select * into st from public.shifts where id = p_target_shift_id;
  if not found then
    raise exception 'target_shift_not_found';
  end if;

  if sr.user_id <> uid then
    raise exception 'not_your_shift';
  end if;

  tgt := st.user_id;
  if tgt = uid then
    raise exception 'invalid_target';
  end if;

  if sr.booth_id <> st.booth_id then
    raise exception 'booth_mismatch';
  end if;

  if not exists (
    select 1 from public.users u where u.id = uid and u.role = 'STAFF'
  ) or not exists (
    select 1 from public.users u where u.id = tgt and u.role = 'STAFF'
  ) then
    raise exception 'swap_staff_only';
  end if;

  if not public.user_has_booth(uid, sr.booth_id) or not public.user_has_booth(tgt, sr.booth_id) then
    raise exception 'booth_assignment_required';
  end if;

  if exists (
    select 1 from public.shift_swap_requests r
    where r.status in ('pending', 'accepted')
      and (
        (r.requester_shift_id = p_requester_shift_id or r.target_shift_id = p_requester_shift_id)
        or (r.requester_shift_id = p_target_shift_id or r.target_shift_id = p_target_shift_id)
      )
  ) then
    raise exception 'swap_already_pending';
  end if;

  insert into public.shift_swap_requests (
    requester_id,
    target_id,
    requester_shift_id,
    target_shift_id,
    status
  )
  values (uid, tgt, p_requester_shift_id, p_target_shift_id, 'pending')
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.create_shift_swap_request(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: target accept/reject
-- ---------------------------------------------------------------------------

create or replace function public.shift_swap_target_respond(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.shift_swap_requests
  set status = case when p_accept then 'accepted' else 'rejected' end
  where id = p_request_id
    and target_id = uid
    and status = 'pending';

  if not found then
    raise exception 'respond_not_allowed';
  end if;
end;
$$;

grant execute on function public.shift_swap_target_respond(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: requester cancel
-- ---------------------------------------------------------------------------

create or replace function public.cancel_shift_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.shift_swap_requests
  set status = 'cancelled'
  where id = p_request_id
    and requester_id = uid
    and status in ('pending', 'accepted');

  if not found then
    raise exception 'cancel_not_allowed';
  end if;
end;
$$;

grant execute on function public.cancel_shift_swap_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: admin approve (swap user_id on shifts) / reject
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
  if not public.is_admin() then
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

grant execute on function public.admin_approve_shift_swap(uuid) to authenticated;

create or replace function public.admin_reject_shift_swap(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cnt int;
begin
  if not public.is_admin() then
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

grant execute on function public.admin_reject_shift_swap(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Users: STAFF may read names of colleagues assigned to the same booth(s)
-- (for shift swap labels, etc.). OR-combined with existing users_select_rbac.
-- ---------------------------------------------------------------------------

drop policy if exists "users_select_same_booth" on public.users;
create policy "users_select_same_booth" on public.users
  for select to authenticated
  using (
    exists (
      select 1 from public.user_booths ub_self
      inner join public.user_booths ub_other on ub_self.booth_id = ub_other.booth_id
      where ub_self.user_id = auth.uid()
        and ub_other.user_id = users.id
    )
  );
