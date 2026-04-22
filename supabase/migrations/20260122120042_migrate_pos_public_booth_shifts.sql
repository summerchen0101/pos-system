-- Public read for POS booth "today's shift" board (anon tablet / kiosk).
-- Returns JSON rows without granting broad select on shifts/users to anon.

create or replace function public.list_pos_public_shifts_for_day(
  p_booth_id uuid,
  p_date date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'user_name', coalesce(u.name, ''),
          'shift_note', case
            when s.note is null or btrim(s.note) = '' then null
            else btrim(s.note)
          end,
          'time_range',
            to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI'),
          'clock_status',
            case
              when l.id is null or l.clock_in_at is null then '未打卡'
              when l.clock_out_at is null then '已上班，未下班'
              else '已完成打卡'
            end
        )
        order by s.start_time
      )
      from public.shifts s
      inner join public.users u on u.id = s.user_id
      left join public.shift_clock_logs l on l.shift_id = public.shift_consecutive_head(s.id)
      where s.booth_id = p_booth_id
        and s.shift_date = p_date
    ),
    '[]'::jsonb
  );
$$;

grant execute on function public.list_pos_public_shifts_for_day(uuid, date) to anon;
grant execute on function public.list_pos_public_shifts_for_day(uuid, date) to authenticated;
