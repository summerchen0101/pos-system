-- POS header: list names of staff currently clocked in for a booth (anon OK via RPC).
-- Scheduled rows may omit shift_clock_logs.booth_id; match shifts.booth_id + shift_date instead.
-- Run after migrate_pos_public_access.sql.

create or replace function public.pos_list_active_staff_names(p_booth_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with v_today as (
    select (now() at time zone 'Asia/Taipei')::date as d
  )
  select coalesce(array_agg(u.name order by u.name), '{}')
  from (
    select distinct l.user_id
    from public.shift_clock_logs l
    cross join v_today t
    left join public.shifts s on s.id = l.shift_id
    where l.clock_in_at is not null
      and l.clock_out_at is null
      and (
        (
          l.shift_id is not null
          and s.booth_id = p_booth_id
          and s.shift_date = t.d
        )
        or (
          l.shift_id is null
          and l.booth_id = p_booth_id
          and l.work_date = t.d
        )
      )
  ) x
  inner join public.users u on u.id = x.user_id;
$$;

grant execute on function public.pos_list_active_staff_names(uuid) to anon;
grant execute on function public.pos_list_active_staff_names(uuid) to authenticated;
