-- Relax POS clock-in windows: allow clock in/out any time on the scheduled shift day (Asia/Taipei).
-- Run after migrate_shifts.sql. Timestamps remain actual clock_timestamp() for lateness reporting.

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

  if p_action = 'in' then
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
