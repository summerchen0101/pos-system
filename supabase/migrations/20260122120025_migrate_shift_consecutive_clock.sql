-- Consecutive shifts (same user, booth, day; end_time = next start_time) share one shift_clock_logs row on the earliest shift id.
-- Run after migrate_clock_relax.sql (or merge into your deploy order after migrate_shifts.sql).

create or replace function public.shift_consecutive_head(p_shift_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cur uuid := p_shift_id;
  prev_id uuid;
begin
  loop
    select s.id into prev_id
    from public.shifts s
    inner join public.shifts cur_s on cur_s.id = cur
    where s.user_id = cur_s.user_id
      and s.booth_id = cur_s.booth_id
      and s.shift_date = cur_s.shift_date
      and s.end_time = cur_s.start_time
    limit 1;
    exit when prev_id is null;
    cur := prev_id;
  end loop;
  return cur;
end;
$$;

-- Replace clock_shift: all clock logs use consecutive chain head shift_id.
create or replace function public.clock_shift(p_shift_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s public.shifts%rowtype;
  s_head public.shifts%rowtype;
  v_head uuid;
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

  v_head := public.shift_consecutive_head(p_shift_id);

  select * into s_head from public.shifts where id = v_head for update;
  if not found or s_head.user_id <> uid then
    raise exception 'shift_not_found';
  end if;

  if p_action = 'in' then
    select id, clock_in_at, clock_out_at
    into v_log_id, v_log_in, v_log_out
    from public.shift_clock_logs
    where shift_id = v_head
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
      where shift_id = v_head;
    else
      insert into public.shift_clock_logs (shift_id, user_id, clock_in_at, clock_out_at)
      values (v_head, uid, v_now, null);
    end if;
  else
    select id into v_log_id from public.shift_clock_logs where shift_id = v_head for update;
    if not found or v_log_id is null then
      raise exception 'clock_in_required_first';
    end if;

    update public.shift_clock_logs
    set clock_out_at = v_now
    where shift_id = v_head
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
