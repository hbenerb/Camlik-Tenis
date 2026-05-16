grant usage on schema public to anon, authenticated;
grant select on public.courts to anon, authenticated;
grant select on public.club_settings to anon, authenticated;

alter table public.courts enable row level security;
alter table public.club_settings enable row level security;

drop policy if exists courts_select_public on public.courts;
drop policy if exists "courts_select_public" on public.courts;
drop policy if exists "courts_select_authenticated" on public.courts;

create policy courts_select_public
on public.courts
for select
to anon, authenticated
using (true);

drop policy if exists club_settings_select_public on public.club_settings;
drop policy if exists "settings_select_public" on public.club_settings;
drop policy if exists "settings_select_authenticated" on public.club_settings;

create policy club_settings_select_public
on public.club_settings
for select
to anon, authenticated
using (true);

notify pgrst, 'reload schema';

