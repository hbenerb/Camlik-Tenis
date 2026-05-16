create or replace function public.guard_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if old.app_role is distinct from new.app_role and not public.is_super_admin() then
    raise exception 'Sadece bas admin kullanici rolleri degistirebilir.';
  end if;

  if old.app_role = 'super_admin' and not public.is_super_admin() then
    raise exception 'Bas admin hesabi sadece bas admin tarafindan degistirilebilir.';
  end if;

  return new;
end;
$$;

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

update public.profiles as profiles
set
  email = coalesce(users.email, profiles.email),
  full_name = coalesce(profiles.full_name, users.raw_user_meta_data->>'full_name', users.raw_user_meta_data->>'name'),
  avatar_url = coalesce(profiles.avatar_url, users.raw_user_meta_data->>'avatar_url'),
  app_role = case
    when lower(coalesce(users.email, profiles.email, '')) = 'hbenerb@gmail.com' then 'super_admin'::public.app_role
    else profiles.app_role
  end,
  is_club_member = case
    when lower(coalesce(users.email, profiles.email, '')) = 'hbenerb@gmail.com' then true
    else profiles.is_club_member
  end,
  reservation_days_ahead = case
    when lower(coalesce(users.email, profiles.email, '')) = 'hbenerb@gmail.com' then coalesce(profiles.reservation_days_ahead, 14)
    else profiles.reservation_days_ahead
  end
from auth.users as users
where profiles.id = users.id;

create or replace function public.is_bootstrap_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt()->>'email', '')) = 'hbenerb@gmail.com'
    or exists (
      select 1
      from auth.users
      where users.id = auth.uid()
        and lower(coalesce(users.email, '')) = 'hbenerb@gmail.com'
    );
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_bootstrap_super_admin() then 'super_admin'::public.app_role
    else (
      select profiles.app_role
      from public.profiles
      where profiles.id = auth.uid()
    )
  end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'super_admin'), false);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'super_admin', false);
$$;
