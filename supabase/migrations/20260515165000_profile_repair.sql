create or replace function public.ensure_profile_for_current_user()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  claims jsonb := auth.jwt();
  profile_row public.profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    app_role,
    is_club_member,
    reservation_days_ahead
  )
  values (
    current_user_id,
    coalesce(claims->>'email', ''),
    coalesce(
      claims->'user_metadata'->>'full_name',
      claims->'user_metadata'->>'name'
    ),
    claims->'user_metadata'->>'avatar_url',
    case
      when lower(coalesce(claims->>'email', '')) = 'hbenerb@gmail.com' then 'super_admin'::public.app_role
      else 'user'::public.app_role
    end,
    lower(coalesce(claims->>'email', '')) = 'hbenerb@gmail.com',
    case
      when lower(coalesce(claims->>'email', '')) = 'hbenerb@gmail.com' then 14
      else null
    end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url)
  returning * into profile_row;

  return profile_row;
end;
$$;

grant execute on function public.ensure_profile_for_current_user() to authenticated;

insert into public.profiles (
  id,
  email,
  full_name,
  avatar_url,
  app_role,
  is_club_member,
  reservation_days_ahead
)
select
  users.id,
  coalesce(users.email, ''),
  coalesce(
    users.raw_user_meta_data->>'full_name',
    users.raw_user_meta_data->>'name'
  ),
  users.raw_user_meta_data->>'avatar_url',
  case
    when lower(coalesce(users.email, '')) = 'hbenerb@gmail.com' then 'super_admin'::public.app_role
    else 'user'::public.app_role
  end,
  lower(coalesce(users.email, '')) = 'hbenerb@gmail.com',
  case
    when lower(coalesce(users.email, '')) = 'hbenerb@gmail.com' then 14
    else null
  end
from auth.users
where not exists (
  select 1 from public.profiles where profiles.id = users.id
);

