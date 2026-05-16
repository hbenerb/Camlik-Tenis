alter table public.profiles
add column if not exists skill_level text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_skill_level_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_skill_level_check
    check (skill_level in ('beginner', 'intermediate', 'advanced', 'master'));
  end if;
end;
$$;

create or replace function public.update_own_profile(
  profile_full_name text,
  profile_skill_level text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := regexp_replace(trim(coalesce(profile_full_name, '')), '\s+', ' ', 'g');
  profile_row public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapılmalı.';
  end if;

  if normalized_name !~ '^\S+\s+\S+' then
    raise exception 'Ad soyad zorunludur.';
  end if;

  if profile_skill_level not in ('beginner', 'intermediate', 'advanced', 'master') then
    raise exception 'Seviye geçersiz.';
  end if;

  update public.profiles
  set
    full_name = normalized_name,
    skill_level = profile_skill_level,
    updated_at = now()
  where id = auth.uid()
  returning * into profile_row;

  if not found then
    raise exception 'Profil bulunamadı.';
  end if;

  return profile_row;
end;
$$;

grant execute on function public.update_own_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
