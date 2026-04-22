-- Fix 42P17 infinite recursion on shifts when loading schedule (shifts <-> shift_swap_requests policies).
-- Run once after migrate_manager_role.sql if you still see recursion on relation "shifts".

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

drop policy if exists "shift_swap_requests_select" on public.shift_swap_requests;
create policy "shift_swap_requests_select" on public.shift_swap_requests
  for select to authenticated
  using (
    public.is_admin()
    or requester_id = auth.uid()
    or target_id = auth.uid()
    or public.shift_swap_request_visible_to_manager(shift_swap_requests.id)
  );
