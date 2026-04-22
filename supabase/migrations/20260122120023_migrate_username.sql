-- Login username + phone on public.users. Run after migrate_rbac.sql.
-- Backfill: username from email local-part (before @); disambiguate duplicates.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists username text;
alter table public.users add column if not exists phone text;

-- Backfill username from auth.users email local-part
with bases as (
  select
    u.id,
    coalesce(
      nullif(
        regexp_replace(lower(split_part(au.email, '@', 1)), '[^a-z0-9_]', '_', 'g'),
        ''
      ),
      'user'
    ) as base
  from public.users u
  inner join auth.users au on au.id = u.id
),
numbered as (
  select
    id,
    base,
    row_number() over (partition by base order by id) as rn
  from bases
)
update public.users u
set username = case
  when n.rn = 1 then
    case
      when length(n.base) < 3 then n.base || '_' || left(replace(u.id::text, '-', ''), 8)
      else n.base
    end
  else n.base || '_' || (n.rn - 1)::text
end
from numbered n
where u.id = n.id
  and u.username is null;

-- Ensure minimum length 3 for any short base (safety)
update public.users
set username = username || '_' || left(replace(id::text, '-', ''), 8)
where length(username) < 3;

alter table public.users alter column username set not null;

create unique index if not exists users_username_lower_key on public.users (lower(username));

comment on column public.users.username is 'Login account; unique, stored lowercase.';
comment on column public.users.phone is 'Optional phone; plain text.';

-- ---------------------------------------------------------------------------
-- RPC: resolve auth email for username login (anon can execute; no user enumeration in messages — client uses generic error)
-- ---------------------------------------------------------------------------

create or replace function public.get_auth_email_by_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select au.email::text
  from public.users u
  join auth.users au on au.id = u.id
  where lower(u.username) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.get_auth_email_by_username(text) to anon;
grant execute on function public.get_auth_email_by_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- New auth users: set username (metadata or email-derived or id-based)
-- ---------------------------------------------------------------------------

create or replace function public.handle_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1),
    'User'
  );

  v_username := coalesce(
    nullif(lower(trim(new.raw_user_meta_data->>'username')), ''),
    nullif(
      regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '_', 'g'),
      ''
    ),
    'u' || left(replace(new.id::text, '-', ''), 20)
  );

  if length(v_username) < 3 then
    v_username := v_username || '_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  insert into public.users (id, name, role, username)
  values (new.id, v_name, 'STAFF', v_username)
  on conflict (id) do nothing;

  return new;
end;
$$;
