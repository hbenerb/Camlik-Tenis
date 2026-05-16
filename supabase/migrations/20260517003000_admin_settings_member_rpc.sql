grant usage on schema public to anon, authenticated;
grant select on public.club_settings to anon, authenticated;
grant update on public.club_settings to authenticated;
grant select, update on public.profiles to authenticated;

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

create or replace function public.admin_update_club_settings(
  setting_opening_time text,
  setting_closing_time text,
  setting_reservation_slot_minutes integer,
  setting_max_active_reservations integer,
  setting_default_booking_days_ahead integer,
  setting_club_member_booking_days_ahead integer,
  setting_cancellation_deadline_hours integer
)
returns public.club_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.club_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Sadece admin kulup ayarlarini guncelleyebilir.';
  end if;

  update public.club_settings
  set
    opening_time = setting_opening_time::time,
    closing_time = setting_closing_time::time,
    reservation_slot_minutes = setting_reservation_slot_minutes,
    max_active_reservations = setting_max_active_reservations,
    default_booking_days_ahead = setting_default_booking_days_ahead,
    club_member_booking_days_ahead = setting_club_member_booking_days_ahead,
    cancellation_deadline_hours = setting_cancellation_deadline_hours
  where id = 1
  returning * into settings_row;

  if not found then
    raise exception 'Kulup ayarlari bulunamadi.';
  end if;

  return settings_row;
end;
$$;

create or replace function public.admin_update_profile(
  profile_id uuid,
  profile_full_name text,
  profile_skill_level text,
  profile_is_club_member boolean,
  profile_reservation_days_ahead integer,
  profile_app_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile public.profiles%rowtype;
  profile_row public.profiles%rowtype;
  next_role public.app_role;
begin
  if not public.is_admin() then
    raise exception 'Sadece admin uye bilgilerini guncelleyebilir.';
  end if;

  select * into existing_profile
  from public.profiles
  where id = profile_id;

  if not found then
    raise exception 'Uye bulunamadi.';
  end if;

  if profile_app_role not in ('user', 'admin', 'super_admin') then
    raise exception 'Rol gecersiz.';
  end if;

  next_role := profile_app_role::public.app_role;

  if existing_profile.app_role is distinct from next_role and not public.is_super_admin() then
    raise exception 'Sadece bas admin kullanici rollerini degistirebilir.';
  end if;

  if existing_profile.app_role = 'super_admin' and not public.is_super_admin() then
    raise exception 'Bas admin hesabi sadece bas admin tarafindan degistirilebilir.';
  end if;

  update public.profiles
  set
    full_name = nullif(regexp_replace(trim(coalesce(profile_full_name, '')), '\s+', ' ', 'g'), ''),
    skill_level = profile_skill_level,
    is_club_member = profile_is_club_member,
    reservation_days_ahead = profile_reservation_days_ahead,
    app_role = next_role
  where id = profile_id
  returning * into profile_row;

  return profile_row;
end;
$$;

grant execute on function public.admin_update_club_settings(text, text, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, boolean, integer, text) to authenticated;

alter table public.club_settings enable row level security;
alter table public.profiles enable row level security;

drop policy if exists settings_update_admin on public.club_settings;
drop policy if exists "settings_update_admin" on public.club_settings;

create policy settings_update_admin
on public.club_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists profiles_update_super_admin on public.profiles;
drop policy if exists "profiles_update_super_admin" on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

create policy profiles_update_super_admin
on public.profiles
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (public.is_admin() and app_role <> 'super_admin')
with check (public.is_admin() and app_role <> 'super_admin');

notify pgrst, 'reload schema';
