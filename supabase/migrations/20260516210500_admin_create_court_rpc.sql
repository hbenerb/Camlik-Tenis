grant usage on schema public to anon, authenticated;
grant select on public.club_settings to anon, authenticated;
grant update on public.club_settings to authenticated;
grant select on public.courts to anon, authenticated;
grant insert, update on public.courts to authenticated;
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

create or replace function public.admin_create_court(
  court_name text,
  court_display_order integer default null
)
returns public.courts
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := regexp_replace(trim(coalesce(court_name, '')), '\s+', ' ', 'g');
  next_display_order integer;
  created_court public.courts%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Sadece admin kort ekleyebilir.';
  end if;

  if normalized_name = '' then
    raise exception 'Kort adı zorunludur.';
  end if;

  next_display_order := coalesce(
    court_display_order,
    (select coalesce(max(display_order), 0) + 1 from public.courts)
  );

  insert into public.courts (name, display_order, is_active)
  values (normalized_name, next_display_order, true)
  returning * into created_court;

  return created_court;
end;
$$;

grant execute on function public.admin_create_court(text, integer) to authenticated;

alter table public.club_settings enable row level security;
alter table public.courts enable row level security;
alter table public.profiles enable row level security;

drop policy if exists settings_update_admin on public.club_settings;
drop policy if exists "settings_update_admin" on public.club_settings;

create policy settings_update_admin
on public.club_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists courts_insert_admin on public.courts;
drop policy if exists "courts_insert_admin" on public.courts;

create policy courts_insert_admin
on public.courts
for insert
to authenticated
with check (public.is_admin());

drop policy if exists courts_update_admin on public.courts;
drop policy if exists "courts_update_admin" on public.courts;

create policy courts_update_admin
on public.courts
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
