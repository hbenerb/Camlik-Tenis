grant select on public.profiles to authenticated;
grant select on public.reservations to authenticated;

alter table public.profiles enable row level security;
alter table public.reservations enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

drop policy if exists reservations_select_own_or_admin on public.reservations;
drop policy if exists "reservations_select_own_or_admin" on public.reservations;
drop policy if exists reservations_select_authenticated on public.reservations;
drop policy if exists "reservations_select_authenticated" on public.reservations;

create policy reservations_select_authenticated
on public.reservations
for select
to authenticated
using (true);

notify pgrst, 'reload schema';
