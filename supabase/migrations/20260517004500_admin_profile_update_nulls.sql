grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;

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
  normalized_name text := nullif(regexp_replace(trim(coalesce(profile_full_name, '')), '\s+', ' ', 'g'), '');
  normalized_skill text := coalesce(profile_skill_level, 'beginner');
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

  if normalized_skill not in ('beginner', 'intermediate', 'advanced', 'master') then
    raise exception 'Seviye gecersiz.';
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
    full_name = normalized_name,
    skill_level = normalized_skill,
    is_club_member = coalesce(profile_is_club_member, false),
    reservation_days_ahead = profile_reservation_days_ahead,
    app_role = next_role
  where id = profile_id
  returning * into profile_row;

  return profile_row;
end;
$$;

grant execute on function public.admin_update_profile(uuid, text, text, boolean, integer, text) to authenticated;

notify pgrst, 'reload schema';
